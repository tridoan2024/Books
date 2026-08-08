# Chapter 18: Data Security, Privacy & Permission-Aware Retrieval

Agents are data-movement engines. Every turn, an agent pulls context from vector stores, tool outputs, and long-term memory, fuses it in a context window, and pushes it back out through tool calls, model endpoints, and logs. This is what makes them useful and what makes them a data-governance nightmare: the same retrieval that lets an agent answer "summarize my open tickets" can, if the index is not permission-aware, let it answer "summarize *anyone's* open tickets." The failure modes here are not exotic prompt-injection cleverness — they are classical data-security failures (broken access control, over-collection, undeletable copies) reproduced at machine speed across new surfaces that most access-control models never anticipated.

Three properties make agent data security genuinely harder than the RAG-security checklist most teams start with. First, **sensitivity labels must survive transformation**: a document classified `Restricted` gets summarized, that summary lands in memory, memory is retrieved into a new prompt, and the prompt is logged — if the label does not propagate through every one of those hops, the data is now `Restricted` in name only. Second, **authorization must be evaluated at query time against the requesting user's live permissions**, not baked into an index at ingestion time when the requester was unknown. Third, **data lands in far more places than teams enumerate**: vector stores, KV/prompt caches, semantic caches, embedding stores, trace logs, tool-side copies, and fine-tuning corpora — and the **right to erasure** is only satisfied when it is honored in *all* of them.

This chapter engineers those properties concretely. We cover classification and label propagation; permission-aware RAG with ACL-filtered indexes and late-binding authorization (and the common broken architecture that quietly leaks); data residency and endpoint region-pinning; privacy engineering with a reversible tokenization vault so the agent never sees raw PII; differential privacy, synthetic data, and privacy-preserving fine-tuning; consent and purpose limitation for agent memory; the genuinely hard problem of erasure across every place a token lands; DLP channel coverage for agent egress; and the realistic limits of machine unlearning. Throughout, the standard is honesty about what is hard: deleting data from a trained model, or from a KV cache that already flowed to a third-party endpoint, is not a `DELETE` statement.

---

## 18.1 Data Governance for Agent Context

### 18.1.1 Classification, Sensitivity Labeling, and Label Propagation Through Agent Pipelines

Data governance starts with knowing *what* data an agent is handling, which requires **classification** — assigning every datum a sensitivity level (e.g., `Public`, `Internal`, `Confidential`, `Restricted`) and category labels (PII, PHI, PCI, trade secret, legal-privileged). Classification at rest is a solved-enough problem: scanners tag documents, columns, and records. The agent-specific hard part is **label propagation** — ensuring the label follows the data through every transformation the agent performs, because an agent constantly derives new artifacts from labeled sources, and a derived artifact is at least as sensitive as its most sensitive input.

The propagation rule mirrors taint tracking (see Ch. 17.2.3) but for confidentiality rather than integrity: the label of a derived value is the **join (least upper bound)** of the labels of its inputs. A summary of a `Restricted` document is `Restricted`. A prompt that concatenates an `Internal` instruction with a `Confidential` retrieved chunk is `Confidential`. Critically, labels must survive the two operations that agents perform constantly and that naive systems drop labels on: **summarization** (the summary inherits the source's label; it is not "new, unlabeled text") and **tool hops** (a value passed to a tool, and the tool's response derived from it, carries the label across the boundary).

```
  SOURCE (labeled)          DERIVATION                     DESTINATION (label = join of inputs)
  +------------------+
  | doc: Restricted  |--summarize()-->  summary: Restricted -----+
  +------------------+   (NOT "new text")                        |
  +------------------+                                            +--> prompt context
  | record: Confid.  |--extract()----> field: Confidential ------+     label = Restricted
  +------------------+                                            |     (max of inputs)
  +------------------+                                            |
  | note: Internal   |------------------------------------------ +
  +------------------+                                                  |
                                                                       v
                            +--------------------------------------------------+
                            | memory write / log / tool call / model endpoint  |
                            |  MUST carry propagated label -> policy per sink   |
                            +--------------------------------------------------+
   FAIL: any hop that drops the label launders Restricted data into an unlabeled sink.
```

```python
# Sensitivity labels form a lattice; derived values take the join of inputs.
from enum import IntEnum
from dataclasses import dataclass, field
from typing import Any

class Sensitivity(IntEnum):
    PUBLIC = 0; INTERNAL = 1; CONFIDENTIAL = 2; RESTRICTED = 3

@dataclass(frozen=True)
class Labeled:
    data: Any
    level: Sensitivity
    categories: frozenset[str] = field(default_factory=frozenset)  # {"PII","PHI",...}

def join(*items: "Labeled") -> Sensitivity:
    return Sensitivity(max((i.level for i in items), default=Sensitivity.PUBLIC))

def derive(data: Any, *inputs: Labeled) -> Labeled:
    """Any transformation (summarize, extract, concat) MUST route through here so
    the derived artifact inherits the max sensitivity and union of categories."""
    return Labeled(
        data=data,
        level=join(*inputs),
        categories=frozenset().union(*(i.categories for i in inputs)),
    )

def assert_sink_allowed(value: Labeled, sink_max: Sensitivity) -> None:
    if value.level > sink_max:
        raise PermissionError(
            f"{value.level.name} data ({sorted(value.categories)}) exceeds sink limit {sink_max.name}"
        )
```

The engineering requirement is that **every** transformation the agent performs routes through a labeled derivation, so propagation is the default and losing a label requires an explicit, audited declassification. Store the label *with* the value in memory and vector stores (as metadata on the chunk), carry it in tool-call envelopes, and check it at every sink (log, endpoint, tool) against that sink's maximum allowed sensitivity. The limits are real: labels can be too coarse (a `Restricted` document with one sensitive line taints everything derived from it, driving over-restriction) and propagation cannot see *implicit* flows where sensitive data influences a decision without a direct data dependency. But without label propagation, classification is a point-in-time snapshot that the agent's first summarization invalidates.

---

### 18.1.2 Permission-Aware RAG: ACL-Filtered Indexes, Late-Binding Authorization, and Reindex Hygiene

The most common serious data-security defect in production agents is **RAG that ignores the requesting user's permissions.** The agent retrieves from a vector index built over the whole corpus and returns whatever is semantically nearest — including documents the user is not authorized to see. Because retrieval is by embedding similarity, not by access check, the model faithfully answers using data the user could never have opened directly. This is broken access control (a **confused deputy**, see Ch. 17) reproduced in the retrieval layer, and it is invisible until someone notices the agent citing a document they should not have.

The correct architecture enforces authorization at **query time against the requester's live permissions** — **late-binding authorization** — never at ingestion time. Two composable mechanisms: **ACL-filtered indexes**, where every chunk is stored with the access-control metadata of its source (owner, group, ACL, tenant), and retrieval applies a metadata filter for the current user's grants *as part of the query*, so unauthorized chunks are never candidates; and a post-retrieval **authorization recheck** against the source system of record for high-stakes data, since the index's ACL copy can be stale. The distinction between the broken and correct designs is stark:

```
  BROKEN (authorize-at-ingestion / not at all)     CORRECT (late-binding, query-time)
  ingest: embed all docs -> global index           ingest: embed + attach ACL metadata per chunk
  query:  user q -> ANN search -> top-k             query:  (user q, user's live grants)
          -> return nearest (ANY doc!)                       -> ANN search WITH acl filter
          -> model answers from unauthorized data             -> only authorized chunks candidate
                                                              -> optional recheck vs source-of-truth
  === user permission never consulted ===          === permission enforced at retrieval time ===
```

```python
# Permission-aware retrieval: ACL filter applied AS PART of the query, using the
# requester's live grants resolved at query time (late-binding). Filtering AFTER
# top-k is a bug: authorized results get crowded out by unauthorized neighbors.
from dataclasses import dataclass

@dataclass(frozen=True)
class Principal:
    user_id: str
    group_ids: frozenset[str]
    tenant_id: str

def acl_filter(principal: Principal) -> dict:
    # Translated to the vector DB's metadata filter DSL; evaluated during ANN search.
    return {
        "tenant_id": {"$eq": principal.tenant_id},          # hard tenant boundary (Ch.16.4.1)
        "$or": [
            {"owner": {"$eq": principal.user_id}},
            {"acl_read": {"$in": list(principal.group_ids | {principal.user_id})}},
        ],
    }

def retrieve(vector_db, query_vec, principal: Principal, k: int = 8) -> list[dict]:
    # filter is pushed DOWN into the search so unauthorized chunks are never candidates
    hits = vector_db.search(vector=query_vec, k=k, filter=acl_filter(principal))
    # late-binding recheck for high-sensitivity hits against source of truth (defends stale ACLs)
    return [h for h in hits if h["sensitivity"] < 3 or source_of_truth_allows(principal, h["doc_id"])]

def source_of_truth_allows(principal: Principal, doc_id: str) -> bool: ...
```

A subtle but critical rule: the ACL filter must be **pushed into** the approximate-nearest-neighbor search, not applied to the result set afterward. Post-filtering the top-k retrieves the k nearest documents *ignoring* permissions and then drops the unauthorized ones — which both leaks information (the count/latency reveals their existence) and starves the user of authorized results that were crowded out. **Reindex hygiene** is the third pillar and the one that rots silently: when a document's permissions change (a user leaves a group, a doc is reclassified, access is revoked), the *index's copy* of the ACL is now stale, and until reindexing catches up the agent may serve content the user has lost access to. Engineer for it: propagate permission changes to the index promptly (event-driven reindex on ACL change, not just nightly batch), version ACL metadata with timestamps, and for the most sensitive corpora prefer the late-binding recheck against the source of truth so a revoked grant takes effect immediately regardless of index staleness. The limit to state honestly: perfect freshness is impossible in a denormalized index, so combine prompt reindexing with source-of-truth rechecks for high-stakes data rather than trusting the index alone.

---

### 18.1.3 Data Residency, Sovereignty, and Cross-Border Context Transfer

Regulated data carries geographic constraints: GDPR restricts transfer of EU personal data outside the EEA, and sovereignty regimes (financial, healthcare, government) mandate that certain data remain within a jurisdiction. Agents strain these controls because a single turn can move data across borders invisibly — a European user's data retrieved locally can be shipped to a US-hosted model endpoint for inference, logged in a US region, and cached in a global CDN, all within one tool call. **Data residency** (where data is stored) and **data sovereignty** (whose laws govern it) must be engineered into the agent's data and inference paths, not assumed.

The load-bearing control is **model-endpoint region pinning**: the inference endpoint that processes a given user's context must be located in an approved region for that user's data, and the agent's routing layer must select the endpoint by the *data's* residency requirement, not by latency or cost. This means maintaining region-scoped deployments of the model, region-scoped vector stores and caches, and a routing policy that treats region as a hard constraint. Cross-border context transfer — sending context assembled in one region to a service in another — must be blocked by default and permitted only where a lawful transfer mechanism and a business need coexist.

| Concern | Requirement | Control |
| :--- | :--- | :--- |
| Storage residency | Data at rest stays in-region | Region-pinned vector stores, caches, logs |
| Inference residency | Context processed in-region | Model-endpoint region pinning by data label |
| Cross-border transfer | No unlawful egress of regulated data | Default-deny cross-region routing; lawful-basis gate |
| Sub-processor sprawl | Third-party tools may relocate data | Contractual + technical region constraints on tools |
| Logging/telemetry | Traces are copies subject to residency | Region-scoped log sinks; strip/keep-in-region payloads |

The routing decision must be driven by the propagated data label (Ch. 18.1.1): a request whose context carries EU-personal-data labels is pinned to EU endpoints and EU log sinks, full stop. The commonly-missed leak is **telemetry**: an OpenTelemetry trace or a prompt/response log is a *copy* of the data and is equally subject to residency, yet observability pipelines often ship globally to a single backend — so region-scope your log and trace sinks, and strip or region-pin payloads accordingly. The honest limit: residency controls constrain *where* data flows but not *what* the model memorizes — a model fine-tuned on in-region data still encodes it, and where that model can subsequently be served is itself a sovereignty question. Treat residency as a routing-and-storage invariant enforced by the label-driven policy, and audit the actual network paths (including third-party tool sub-processors) rather than trusting architecture diagrams.

---

## 18.2 Privacy Engineering

### 18.2.1 Minimization by Design: Redaction, Tokenization, and Pseudonymization Before Inference

Privacy engineering's first principle is **data minimization**: the agent — and especially any third-party model endpoint — should see the *least* sensitive data required to do the job. The strongest form is to ensure the model *never sees raw PII at all*, by transforming sensitive values before they enter the prompt and, where needed, restoring them in the output. Three techniques sit on a spectrum: **redaction** (irreversibly remove — `[REDACTED]`), **pseudonymization** (replace with a consistent surrogate so references still correlate but the real value is hidden), and **tokenization** (replace with a token that a secure vault can reverse, so outputs can be *rehydrated* with the real value after inference).

The **reversible tokenization vault** is the pattern that lets an agent operate on sensitive data end-to-end without ever exposing it to the model. Before the prompt is built, a detokenization pass replaces each detected PII span with a stable token (`<PERSON_7f3a>`); the vault stores the token→plaintext mapping under strong access control. The model reasons over tokens — it can still say "send the invoice to `<PERSON_7f3a>`" — and a rehydration pass on the *output* swaps tokens back to real values only when the result crosses to a *trusted* sink (the actual email system), never back to the model or an untrusted tool. The raw PII stays in the vault; the model, the model provider, and the logs see only tokens.

```python
# Reversible tokenization vault: the model NEVER sees raw PII; trusted-sink outputs
# are rehydrated from the vault. Tokens are stable per-value (correlation preserved)
# but reveal nothing. Vault is the only component holding plaintext.
import hashlib, secrets
from dataclasses import dataclass, field

@dataclass
class TokenVault:
    _fwd: dict[str, str] = field(default_factory=dict)  # plaintext -> token
    _rev: dict[str, str] = field(default_factory=dict)  # token -> plaintext
    _salt: bytes = field(default_factory=lambda: secrets.token_bytes(16))

    def tokenize(self, plaintext: str, entity_type: str) -> str:
        if plaintext in self._fwd:
            return self._fwd[plaintext]                 # stable token => correlation kept
        digest = hashlib.blake2s(plaintext.encode(), key=self._salt, digest_size=4).hexdigest()
        token = f"<{entity_type}_{digest}>"
        self._fwd[plaintext] = token
        self._rev[token] = plaintext                    # access-controlled store
        return token

    def rehydrate(self, text: str) -> str:
        for token, plaintext in self._rev.items():      # only at TRUSTED egress sinks
            text = text.replace(token, plaintext)
        return text

def to_model(prompt: str, spans, vault: TokenVault) -> str:
    for s in sorted(spans, key=lambda x: x.start, reverse=True):
        tok = vault.tokenize(s.text, s.entity_type)
        prompt = prompt[:s.start] + tok + prompt[s.end:]
    return prompt                                       # model sees only tokens
```

The design constraints: tokens must be **stable** per underlying value so the model can still reason about identity and relationships ("the same person" across the prompt) without knowing who; rehydration must happen *only* at trusted sinks and *never* back into model context or untrusted tools (or you have defeated the purpose); and the vault is a high-value secret store requiring strong access control, encryption, and its own audit trail, because it is the single place plaintext lives. The limits: detection is imperfect (Ch. 17.3.1) so some PII escapes tokenization; free-text quasi-identifiers (a rare job title plus a city) can re-identify even when named entities are tokenized; and pseudonymized data is still **personal data** under GDPR — pseudonymization reduces risk and satisfies minimization, but it is not anonymization and does not exempt the data from privacy obligations.

---

### 18.2.2 Differential Privacy, Synthetic Data, and Privacy-Preserving Fine-Tuning

When sensitive data must inform a *model* rather than a single inference, the risk shifts from exposure-in-context to **memorization**: models can memorize and later regurgitate training examples, so fine-tuning on raw user data creates a durable leakage channel that no prompt-time control can close. Three techniques reduce this at the training boundary. **Differential privacy (DP)** adds calibrated noise to a computation so that the presence or absence of any single individual's record cannot be inferred from the output, with a formal privacy budget $\varepsilon$ bounding the guarantee: smaller $\varepsilon$ means stronger privacy and more noise. **DP-SGD** applies this to training by clipping per-example gradients and adding noise, bounding how much any one example can influence the model. **Synthetic data** generates artificial records that preserve the statistical shape of the real data for training or testing without (ideally) reproducing real individuals. **Privacy-preserving fine-tuning** combines these with techniques like federated learning (train on-device, share only aggregated updates).

| Technique | Protects against | Cost / limit |
| :--- | :--- | :--- |
| Differential privacy (DP-SGD) | Membership inference, memorization | Utility loss grows as $\varepsilon$ shrinks; budget accounting is hard |
| Synthetic data | Direct exposure of real records | May leak if generator memorizes; fidelity/privacy trade-off |
| Federated learning | Centralizing raw data | Updates can still leak; needs secure aggregation + DP |
| PII scrubbing pre-train | Verbatim PII memorization | Misses paraphrased/quasi-identifiers; not a formal guarantee |

The honest accounting matters because these are frequently oversold. Differential privacy is the only technique here offering a *formal* guarantee, but that guarantee costs utility — and the guarantee is only as strong as the $\varepsilon$ you actually chose and *composed correctly* across all queries against the data; a large or mis-accounted $\varepsilon$ provides little real protection while sounding rigorous. Synthetic data is *not* automatically private: if the generative model memorized outliers, the synthetic set can leak them, and "synthetic" is not a compliance talisman — it must be validated against membership-inference and re-identification attacks. Federated learning keeps raw data on-device but the shared gradient updates can themselves leak training content unless combined with secure aggregation and DP. The practical stance: prefer *not* fine-tuning on raw sensitive data at all (retrieval over a permission-aware index, Ch. 18.1.2, often removes the need); when you must, apply DP-SGD with a defensible, documented $\varepsilon$ budget, validate synthetic data with re-identification testing, and never present any of these as making training data unrecoverable — memorization is a spectrum you are pushing down, not a switch you are turning off.

---

### 18.2.3 Consent, Purpose Limitation, and Secondary-Use Controls for Agent Memory

Agent **memory** — the long-term store where an agent retains user data across sessions — is a privacy minefield because it silently accumulates personal data collected for one purpose and then makes it available for *any* future purpose the agent pursues. GDPR's **purpose limitation** principle requires that data collected for a stated purpose not be reused for an incompatible one without a fresh lawful basis; **consent** must be specific, informed, and revocable. An agent that remembers everything and reuses it freely violates both by design unless memory is engineered with purpose and consent as first-class metadata.

The control is to bind every memory record to the **purpose** it was collected for and the **consent/lawful basis** authorizing it, and to enforce **secondary-use** checks at retrieval: a memory collected for "order fulfillment" may not be surfaced into a "marketing personalization" task without a compatible purpose or fresh consent. This turns memory retrieval into a policy decision, not a blind similarity lookup.

```python
# Purpose- and consent-bound agent memory: retrieval enforces purpose compatibility
# and consent validity, not just semantic relevance.
from dataclasses import dataclass
from datetime import datetime, timezone

@dataclass(frozen=True)
class MemoryRecord:
    content: str
    subject_id: str
    purpose: str                      # e.g. "order_fulfillment"
    lawful_basis: str                 # "consent" | "contract" | "legitimate_interest"
    consent_expires: datetime | None  # None if not consent-based
    collected_at: datetime

# purpose -> purposes it may be reused for (compatibility matrix)
COMPATIBLE: dict[str, frozenset[str]] = {
    "order_fulfillment": frozenset({"order_fulfillment", "customer_support"}),
    "marketing": frozenset({"marketing"}),
}

def retrievable(record: MemoryRecord, task_purpose: str, now: datetime) -> bool:
    if task_purpose not in COMPATIBLE.get(record.purpose, frozenset()):
        return False                                   # secondary-use blocked
    if record.lawful_basis == "consent" and record.consent_expires and record.consent_expires < now:
        return False                                   # consent lapsed => not usable
    return True

def recall(memories: list[MemoryRecord], task_purpose: str) -> list[MemoryRecord]:
    now = datetime.now(timezone.utc)
    return [m for m in memories if retrievable(m, task_purpose, now)]
```

The engineering implications: memory writes must capture purpose and lawful basis at collection time (retrofitting is impossible — you cannot reconstruct why data was collected), consent revocation must propagate to make records non-retrievable *and* trigger deletion (Ch. 18.3.1), and purpose-compatibility must be an explicit, reviewed matrix rather than an implicit "it's all fair game." The limits: purpose boundaries are fuzzy (is "customer support" compatible with "product improvement"?) and require legal, not just engineering, judgment; and an agent that reasons over retrieved memories can *infer* new facts that were never explicitly collected, creating derived personal data outside the consent that covered the inputs. Bind purpose and consent to memory at write time, enforce compatibility at read time, and treat the compatibility matrix as a governed artifact — memory that is not purpose-bound is a standing consent violation waiting to be discovered.

---

## 18.3 Retention, Deletion & Leakage Prevention

### 18.3.1 Engineering the Right to Erasure Across Vector Stores, Caches, and Logs

GDPR's **right to erasure** ("right to be forgotten") obligates deleting an individual's data on request — and in an agent system this is genuinely hard, because a single user's data is copied into far more places than a naive `DELETE FROM users` reaches. Erasure is only satisfied when the data is gone from *every* place a token of it landed, and enumerating those places is the core engineering task. Miss one and the deletion is legally incomplete and practically leaky: the vector store still returns the "deleted" user's chunks, the prompt cache still replays their data, the trace logs still contain their PII.

The enumeration is the deliverable. Every location must be inventoried and wired to the erasure pipeline:

| Location | What lands there | Erasure mechanism | Hard part |
| :--- | :--- | :--- | :--- |
| Primary datastore | Source records | `DELETE` + cascade | Backups retain copies |
| Vector store | Embeddings + chunk text + metadata | Delete by subject_id metadata filter | Embeddings can leak source text; ANN index rebuild |
| Embedding cache | Cached vectors keyed by content | Purge by content hash / subject | Content-keyed caches lack subject index |
| Prompt / KV cache | Recent prompts + responses (verbatim PII) | TTL expiry + targeted purge | Provider-side caches you don't control |
| Semantic cache | Prior Q/A pairs | Invalidate by subject | Fuzzy keys hard to target |
| Trace / observability logs | Full prompt/response payloads | Redact/delete by subject; short retention | Immutable log stores, replicas |
| Fine-tuned model weights | Memorized training data | Retrain / unlearn (Ch. 18.3.3) | Not deletable by query — see below |
| Backups & replicas | Copies of all of the above | Retention-window expiry | Cannot selectively delete from immutable backups |

```
   ERASURE REQUEST (subject_id)
        |  fan out to EVERY sink that holds a copy
        +-----------+-----------+-----------+-----------+-----------+-----------+
        v           v           v           v           v           v           v
   primary DB   vector      embedding   prompt/KV   semantic    trace       fine-tuned
   DELETE       store        cache       cache       cache       logs        model
                del by       purge by    TTL +       invalidate  redact +    UNLEARN /
                metadata     content     purge       by subject  short-TTL   RETRAIN
        |           |           |           |           |           |           |
        +-----------+-----------+-----------+-----------+-----------+-----------+
                    |  verify + record deletion certificate per sink
                    v
        backups/replicas: cannot selectively delete -> rely on RETENTION WINDOW expiry
        (document as a known limit; keep retention short so the window is bounded)
```

The two genuinely intractable spots deserve candor. **Backups and immutable log stores** typically cannot be selectively edited; the accepted practice is to rely on a *bounded retention window* so the copy expires within a documented period, and to exclude erased subjects on any restore — which means keeping retention windows short is itself a privacy control. **Fine-tuned model weights** cannot be erased with a delete query at all; the data is diffused across parameters, and your options are retraining without the subject or approximate machine unlearning (Ch. 18.3.3), both with real limits. Engineer erasure as a fan-out workflow with a per-sink deletion record (a "deletion certificate") so you can *prove* coverage, keep an authoritative inventory of every sink that must be reachable (and fail the audit when a new data sink is added without wiring it in), and document the backup/model limits explicitly rather than pretending they are solved.

---

### 18.3.2 DLP for Agent Egress: Channel Coverage Across Tools, Files, and Network Calls

**Data Loss Prevention** for agents means inspecting and controlling sensitive data leaving the trust boundary — and the defining challenge is **channel coverage**: agents have many more egress channels than a traditional app, and DLP that covers only one leaves the rest wide open. A payment-processing agent might exfiltrate through a tool call, a file write, an outbound HTTP request, a log line, an email, or a message to another agent. Coverage means every one of those channels routes through the same egress-inspection policy; a single uncovered channel is the whole breach.

| Egress channel | Example leak | DLP control | Coverage gap if missed |
| :--- | :--- | :--- | :--- |
| Tool call arguments | PII in a web-search query | Outbound sanitization (Ch. 17.3.1) | Model over-shares in tool args |
| File writes | Dump of records to a file artifact | Inspect + label file content on write | Files exfiltrated via download |
| Network / HTTP | POST to attacker or 3rd-party API | Egress broker + payload DLP scan (Ch. 16.2.1) | Direct exfiltration |
| Model endpoint | Raw PII sent to external provider | Tokenization before inference (Ch. 18.2.1) | Provider retains/leaks data |
| Logs / traces | Full prompt with PHI logged | Scrub payloads at the log boundary | Logs become the leak |
| Agent-to-agent | Sensitive data across A2A boundary | Label-checked inter-agent messages (Ch. 17.2.3) | Trusted-agent laundering |
| Email / messaging | Data to wrong recipient | Recipient + content policy + HITL (Ch. 16.3.3) | Misdirected disclosure |

```python
# Unified egress DLP: every channel routes through one policy, keyed on the
# propagated sensitivity label (Ch. 18.1.1) and the channel's trust level.
from enum import IntEnum

class ChannelTrust(IntEnum):
    UNTRUSTED = 0     # web, 3rd-party tool, external endpoint
    INTERNAL = 1      # internal service
    TRUSTED = 2       # vaulted, in-region, authorized sink

# max sensitivity permitted to leave via a channel of given trust
MAX_ALLOWED = {ChannelTrust.UNTRUSTED: 0, ChannelTrust.INTERNAL: 2, ChannelTrust.TRUSTED: 3}

def egress_guard(label_level: int, channel: ChannelTrust, payload: str) -> str:
    if label_level > MAX_ALLOWED[channel]:
        raise PermissionError(
            f"sensitivity {label_level} exceeds {channel.name} limit {MAX_ALLOWED[channel]}"
        )
    if channel is ChannelTrust.UNTRUSTED:
        payload = redact_detected_pii(payload)   # belt-and-suspenders scrub
    return payload

def redact_detected_pii(text: str) -> str: ...
```

The unifying design is to funnel *all* egress through one label-aware policy so coverage is structural rather than per-channel best-effort — a value's propagated sensitivity label (Ch. 18.1.1) decides which channels it may leave through, and the channel's trust level sets the ceiling. The limits mirror DLP everywhere: detection is imperfect (paraphrased or encoded sensitive data slips content scanners, as with all classifiers, Ch. 17.1.1), and an agent that *reasons* about sensitive data can leak it as an inference rather than a copy, which content DLP cannot catch. So DLP is a necessary net, strongest when it enforces on *labels/provenance* (deterministic) rather than on *content recognition* (probabilistic) — and its real failure mode in agents is not a weak detector but an *un-inventoried channel*, so the security work is enumerating and covering every egress path, then verifying none was added without coverage.

---

### 18.3.3 Machine Unlearning: Capabilities, Verification, and Realistic Limits

When data has been baked into model weights via training or fine-tuning, deletion is not a query — the information is diffused across millions of parameters. **Machine unlearning** is the research area aiming to remove a specific training example's influence from a trained model *without* full retraining, motivated directly by the right-to-erasure gap in Ch. 18.3.1 (weights are the sink you cannot `DELETE` from). It matters because "just retrain without the data" is often economically infeasible for large models, so approximate methods try to achieve the *effect* of retraining at a fraction of the cost.

The capability landscape spans a spectrum. **Exact unlearning** (retrain from scratch without the target data, or use architectures like SISA that shard training so only affected shards retrain) gives a strong guarantee at high cost. **Approximate unlearning** (gradient-based methods that adjust weights to counteract a target example's influence, or fine-tuning to "forget") is cheaper but offers only heuristic assurance. The critical, under-appreciated problem is **verification**: how do you *prove* a model has forgotten? A model that no longer regurgitates a verbatim training string may still have memorized it in a form recoverable by a cleverer prompt or a **membership-inference attack**, so absence of verbatim output is not proof of unlearning.

| Approach | Guarantee | Cost | Verification |
| :--- | :--- | :--- | :--- |
| Full retrain (exclude data) | Strong (data never seen) | Very high | High confidence by construction |
| SISA / sharded retrain | Strong for affected shards | Moderate | High for the shard boundary |
| Gradient-based unlearning | Heuristic / approximate | Low–moderate | Weak — needs membership-inference testing |
| Fine-tune to "forget" | Heuristic | Low | Weak — may only suppress verbatim output |

The realistic limits must be stated plainly, because unlearning is frequently presented as a solved compliance answer and it is not. Approximate unlearning provides **no formal guarantee** that the information is gone; it reduces the *measurable* signal (verbatim recall, membership-inference success) without certifying erasure, and a method that fools one verification probe may fail another. Unlearning one example can degrade the model's performance on related, legitimate data (the "catastrophic forgetting" spillover). And verification is fundamentally an adversarial, open-ended problem — you can show a model *fails* a specific extraction attempt, but you cannot easily show it will resist *all* future ones. The defensible engineering posture: prefer *not putting* erasable-obligation data into training in the first place (retrieval over a permission-aware, deletable index, Ch. 18.1.2, sidesteps the whole problem), reserve exact retraining for cases where the guarantee is legally required, treat approximate unlearning as risk-reduction with documented residual risk rather than as compliance-complete, and *always* verify with membership-inference and extraction testing while being explicit that passing those tests bounds — but does not eliminate — the residual leakage.

---

## Technical Chapter Summary

- **Sensitivity labels must propagate through every agent transformation** — summarization, extraction, tool hops, memory writes — with a derived value taking the join (max) of its inputs' labels; classification is a point-in-time snapshot that the agent's first summarization invalidates unless propagation is the enforced default.
- **Permission-aware RAG requires late-binding authorization**: enforce the requesting user's *live* permissions at query time via ACL filters pushed *into* the ANN search (never post-filtered after top-k), with source-of-truth rechecks for high-stakes data and event-driven reindex hygiene — the common broken design retrieves by similarity alone and reproduces broken access control at machine speed.
- **Data residency and sovereignty demand model-endpoint region pinning** driven by the propagated data label, with region-scoped stores, caches, *and* telemetry (traces are copies subject to residency) — residency constrains where data flows but not what a fine-tuned model memorizes.
- A **reversible tokenization vault** lets the agent operate end-to-end on sensitive data while the model, provider, and logs see only stable tokens, with rehydration *only* at trusted egress sinks — but detection is imperfect and pseudonymized data is still personal data under GDPR.
- **Differential privacy is the only training-time technique with a formal guarantee**, and only as strong as a correctly-composed $\varepsilon$ budget; synthetic data is not automatically private and federated updates can leak — prefer not fine-tuning on raw sensitive data at all, since retrieval over a deletable index often removes the need.
- **Agent memory must bind purpose and consent at write time** and enforce secondary-use/purpose-compatibility and consent validity at retrieval, because unbounded memory reuse is a standing purpose-limitation violation — and reasoning over memories can derive personal data outside the original consent.
- **The right to erasure is a fan-out workflow** across every place a token lands — primary store, vector store, embedding/prompt/KV/semantic caches, trace logs, backups, and model weights — with per-sink deletion certificates; backups (bounded retention windows) and fine-tuned weights (unlearning/retrain) are the genuinely intractable sinks and must be documented as such.
- **DLP for agents is fundamentally a channel-coverage problem** — tools, files, network, model endpoint, logs, agent-to-agent, email — best enforced by a single label/provenance-aware egress policy rather than per-channel content scanning; and **machine unlearning offers no formal guarantee** for approximate methods, so verify with membership-inference/extraction testing while treating it as documented risk-reduction, never compliance-complete.
