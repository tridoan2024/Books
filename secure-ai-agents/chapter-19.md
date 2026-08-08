# Chapter 19: Agentic Observability, Telemetry & Forensics

Observability for deterministic microservices is a solved discipline: emit structured logs, propagate a trace context, aggregate metrics, and alert on threshold breaches. Agentic systems break every assumption underneath that discipline. The unit of work is no longer a request with a fixed control-flow graph; it is a **trajectory** — a non-deterministic sequence of model reasoning steps and side-effecting tool calls whose shape is decided at runtime by a probabilistic policy. The same input can produce different action paths, the "code path" is partly a natural-language artifact generated during execution, and the most security-relevant events (a plan mutation, an egress to an unexpected domain, a tool argument shaped by injected content) are semantic rather than syntactic.

This chapter builds the telemetry and forensic substrate a Principal AI Security Engineer needs to make autonomous systems auditable and defensible. We start from the **OpenTelemetry GenAI semantic conventions** and the **OpenInference** specification, because a shared schema is the precondition for everything downstream — detection, forensics, and incident response all fail if every team names its spans differently. We then build immutable, hash-chained, signed audit records suitable for legal non-repudiation, reconciling that requirement against privacy obligations through field-level masking. From that telemetry we engineer detections: behavioral anomaly modeling over tool sequences, resource-consumption intrusion indicators, and detection rules mapped to **MITRE ATLAS**. We close with incident response for systems that cannot be trivially replayed: trajectory reconstruction under non-determinism, containment primitives, and blast-radius assessment.

By the end you will be able to instrument an agent so that any trajectory can be reconstructed, attributed, and legally attested; detect adversarial behavior in the telemetry stream; and execute a containment and remediation plan when an agent is compromised.

---

## 19.1 Trajectory Telemetry & Distributed Tracing

### 19.1.1 OpenTelemetry GenAI Semantic Conventions and the OpenInference Specification

The foundational problem in agentic observability is **schema fragmentation**. If one team records model input as `prompt`, another as `input.value`, and a third buries it in an unstructured log line, no cross-cutting detection or forensic query is possible. Two standards now anchor the field. The **OpenTelemetry (OTel) GenAI semantic conventions** define a stable attribute vocabulary carried on spans; the **OpenInference specification** (originating in the Arize ecosystem) defines a complementary convention with explicit span *kinds* — `LLM`, `TOOL`, `CHAIN`, `AGENT`, `RETRIEVER`, `EMBEDDING` — that map cleanly onto agent structure.

The load-bearing OTel GenAI attribute families every security-relevant span should carry:

| Attribute | Meaning | Forensic/security use |
| :--- | :--- | :--- |
| `gen_ai.system` | Provider/system (e.g. `openai`, `anthropic`) | Attribution, supply-chain scoping |
| `gen_ai.operation.name` | Operation (`chat`, `execute_tool`, `embeddings`) | Span-kind routing for detections |
| `gen_ai.request.model` | Requested model ID | Drift correlation (see Ch. 21.3.3) |
| `gen_ai.response.model` | Model that actually served | Silent version-swap detection |
| `gen_ai.usage.input_tokens` | Prompt tokens consumed | Denial-of-Wallet / exfil indicator |
| `gen_ai.usage.output_tokens` | Completion tokens produced | Runaway-loop indicator |
| `gen_ai.tool.name` | Tool invoked on a tool span | Tool-sequence anomaly modeling |
| `gen_ai.tool.call.id` | Correlates request to result | Non-repudiation of tool actions |

Treat message content (`gen_ai.prompt`, `gen_ai.completion`, or event-based `gen_ai.*.message` bodies) as **sensitive by default** and gate its capture behind an explicit opt-in with masking (see 19.2.3). The instrumentation below emits an OTel-compliant trajectory trace using the standard attribute names:

```python
from opentelemetry import trace
from opentelemetry.trace import SpanKind, Status, StatusCode

tracer = trace.get_tracer("agent.runtime", "1.0.0")

def run_llm_step(model: str, messages: list[dict], system_prompt_hash: str) -> dict:
    """Emit an OTel GenAI-compliant span for a single reasoning step."""
    with tracer.start_as_current_span(
        "chat",  # gen_ai.operation.name value used as span name per convention
        kind=SpanKind.CLIENT,
    ) as span:
        span.set_attribute("gen_ai.system", "openai")
        span.set_attribute("gen_ai.operation.name", "chat")
        span.set_attribute("gen_ai.request.model", model)
        # Pin the exact system-instruction version into every span (see 19.1.3)
        span.set_attribute("agent.system_prompt.sha256", system_prompt_hash)
        try:
            resp = client.chat(model=model, messages=messages)
        except Exception as exc:
            span.record_exception(exc)
            span.set_status(Status(StatusCode.ERROR))
            raise
        usage = resp["usage"]
        span.set_attribute("gen_ai.response.model", resp["model"])
        span.set_attribute("gen_ai.usage.input_tokens", usage["input_tokens"])
        span.set_attribute("gen_ai.usage.output_tokens", usage["output_tokens"])
        span.set_attribute("gen_ai.response.finish_reasons", resp["finish_reason"])
        return resp
```

The critical architectural discipline is that **every tool call is its own child span** under the reasoning step that selected it, and the `gen_ai.tool.call.id` links the model's request to the tool's result span. This turns a flat log into a queryable causal graph — the substrate for both forensics and anomaly detection.

### 19.1.2 Tracing Non-Deterministic Trajectories: Spans for Prompts, Reasoning, and Tool Executions

A trajectory is a tree, not a line. The root **AGENT** span represents the invocation; **CHAIN** spans group reasoning phases; **LLM** spans record each model call; **TOOL** spans record each actuation; **RETRIEVER** spans record context assembly. Because the branching is decided at runtime, the span tree *is* the record of which path the policy actually chose — you cannot derive it statically. Preserving parent/child relationships and ordering is therefore a security requirement, not a convenience.

```
AGENT  "resolve customer refund"           trace_id=7f3a…  (root)
 │  agent.system_prompt.sha256=9c1e…  autonomy.level=3
 ├─ RETRIEVER  "load account context"      gen_ai.operation.name=embeddings
 │    └─ retrieved 4 docs  trust_tag=INTERNAL
 ├─ LLM  "plan"                            gen_ai.request.model=gpt-x
 │    plan.hash=a11b…  input_tokens=812  output_tokens=140
 ├─ TOOL "search_orders"                   gen_ai.tool.call.id=call_01
 │    args_hash=4d2f…  trust_tag=UNTRUSTED_RESULT
 ├─ LLM  "reflect on results"              plan.hash=a11b…  (unchanged)
 ├─ TOOL "verify_owner"                    gen_ai.tool.call.id=call_02
 └─ TOOL "issue_refund"      *** HITL gate *** approval.id=hop_88
      args={amount:214.00}  args_hash=c9e0…  egress=payments.internal
```

Two forensic properties fall out of this structure. First, **plan hashing**: hash the serialized plan produced by each planning LLM span and carry `plan.hash` forward. When a later `plan.hash` differs from the one the human approved, or diverges after ingesting an `UNTRUSTED_RESULT` tool span, you have a machine-detectable **plan mutation** — the telemetry signature of goal drift or **indirect prompt injection** steering the agent (see Ch. 19.3.1).

Second, **trust tagging on the span**. Every tool result span carries a `trust_tag` reflecting the provenance of the data it introduced into context. This makes **taint propagation** observable at query time: you can ask "did any argument to `issue_refund` derive from an `UNTRUSTED_RESULT` span earlier in this trace?" — a confused-deputy detection expressed as a graph query rather than a code review.

Because sampling head-based tracing would randomly discard security-relevant traces, agent telemetry should use **tail-based sampling**: buffer the full trace, then keep 100% of traces that contain an error, a HITL gate, a privileged tool, or a plan mutation, and downsample only the boring successes. Losing the one trace that contained the attack is the failure mode you are engineering against.

### 19.1.3 Capture Standards for Context Snapshots, Cache State, and System Instruction Versions

Reconstructing "why did the agent do that" requires the *inputs* to each decision, not only the outputs. Three often-omitted state classes must be captured.

**System instruction versioning.** The system prompt is executable policy. If it changes and you do not record which version was active, forensic reconstruction is impossible and regressions are unattributable. Hash the fully-assembled system instruction (base prompt + injected policies + tool descriptions) and pin the digest into every span via `agent.system_prompt.sha256`. Store the plaintext keyed by hash in a versioned registry (see Ch. 21.1.1). This lets an investigator retrieve the exact instructions the agent operated under at incident time, and lets a detection flag any trajectory running an unapproved prompt version.

**Context snapshots.** Capture the assembled context window — retrieved documents, memory reads, tool schemas — as a content-addressed snapshot referenced by hash from the LLM span, not inlined. This keeps span size bounded while preserving the exact input for replay, and the content-addressing means identical contexts deduplicate automatically.

**Cache state.** Prompt caching and KV-cache reuse change behavior and cost; a cache hit can mean the agent reasoned over *stale* context. Record cache participation explicitly.

```python
import hashlib, json
from pathlib import Path

def snapshot_context(window: dict, store: Path) -> str:
    """Content-address a context window; return its sha256 digest."""
    canonical = json.dumps(window, sort_keys=True, separators=(",", ":")).encode()
    digest = hashlib.sha256(canonical).hexdigest()
    blob = store / f"{digest}.json"
    if not blob.exists():                     # dedupe identical contexts
        blob.write_bytes(canonical)
    return digest

def annotate_llm_span(span, window: dict, store: Path, cache_hit: bool) -> None:
    span.set_attribute("agent.context.sha256", snapshot_context(window, store))
    span.set_attribute("agent.context.token_count", window["token_count"])
    span.set_attribute("gen_ai.request.cache_hit", cache_hit)
```

The forensic contract is simple: given a `trace_id`, an investigator can retrieve the exact system instruction version, the exact context window, and the cache state for every decision the agent made. Without all three, "reconstruction" is guesswork.

---

## 19.2 Forensic Audit Logging & Non-Repudiation

### 19.2.1 Immutable Log Streams for Agent Decision Chains

Telemetry optimized for debugging is mutable, sampled, and short-lived — the opposite of what forensics and compliance require. Agent audit logging needs a **separate, append-only, immutable stream** capturing the security-relevant decision chain: every tool invocation with its arguments hash, every authorization decision, every HITL approval, every autonomy-level transition, and every plan mutation. This is the record you produce for a regulator, a legal hold, or a post-incident review, and it must be defensible against the claim that logs were altered after the fact.

Architecturally, separate the *observability plane* (high-volume, sampled, may be lossy) from the *audit plane* (lower-volume, complete, immutable). Practical immutability mechanisms:

| Mechanism | Immutability guarantee | Notes |
| :--- | :--- | :--- |
| Object store with Object Lock (WORM) | Retention-locked, versioned | S3/GCS compliance mode; regulator-friendly |
| Append-only Kafka + compaction off | Ordered, replayable | Pair with sink to WORM store |
| Hash-chained records (19.2.2) | Tamper-evident | Detects, not prevents, mutation |
| Transparency-log style Merkle log | Cryptographically verifiable inclusion | Strongest; higher operational cost |

Immutability alone is necessary but insufficient: a WORM store proves *when* a record landed but not *what happened before it* or *who produced it*. That is the job of cryptographic chaining and signing.

### 19.2.2 Cryptographic Chaining and Signing of Agent Actions for Legal Auditability

**Non-repudiation** requires two properties: **tamper-evidence** (any modification or deletion of a past record is detectable) and **authenticity** (each record provably originated from a specific agent identity). A **hash chain** provides the first: each record embeds the hash of its predecessor, so altering any record breaks every subsequent link. Signing each record — ideally under a workload identity such as a SPIFFE SVID (see Ch. 1.4 and Ch. 12) — provides the second and binds the action to a non-human identity.

```python
import hashlib, json, time
from dataclasses import dataclass, asdict
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

GENESIS = "0" * 64

@dataclass(frozen=True)
class ActionRecord:
    seq: int
    trace_id: str
    agent_spiffe_id: str          # binds the action to a workload identity
    tool: str
    args_sha256: str              # hash of args; plaintext masked/stored separately
    decision: str                 # ALLOW | DENY | HITL_APPROVED
    prev_hash: str
    ts_ns: int

    def digest(self) -> str:
        body = json.dumps(asdict(self), sort_keys=True).encode()
        return hashlib.sha256(body).hexdigest()

class AuditChain:
    def __init__(self, signer: Ed25519PrivateKey) -> None:
        self._signer = signer
        self._last = GENESIS
        self._seq = 0

    def append(self, trace_id: str, spiffe_id: str, tool: str,
               args_sha256: str, decision: str) -> dict:
        rec = ActionRecord(self._seq, trace_id, spiffe_id, tool,
                           args_sha256, decision, self._last, time.time_ns())
        h = rec.digest()
        sig = self._signer.sign(h.encode()).hex()   # authenticity + non-repudiation
        self._last, self._seq = h, self._seq + 1
        return {"record": asdict(rec), "hash": h, "sig": sig}

def verify(chain: list[dict], verify_key) -> bool:
    """Recompute the chain; any tamper or deletion breaks linkage or signature."""
    prev = GENESIS
    for entry in chain:
        rec = ActionRecord(**entry["record"])
        if rec.prev_hash != prev or rec.digest() != entry["hash"]:
            return False
        verify_key.verify(bytes.fromhex(entry["sig"]), entry["hash"].encode())
        prev = entry["hash"]
    return True
```

The verifier is what makes this legally useful: an auditor recomputes the chain independently and confirms both linkage and signatures. Anchor the chain periodically — publish the latest head hash to an external transparency log or timestamping authority — so an insider who controls the store cannot silently rewrite history and re-sign it. Retention and key custody must satisfy the relevant regime (GDPR accountability, EU AI Act logging obligations for high-risk systems; see Ch. 22).

### 19.2.3 Data Privacy vs. Observability: Masking Sensitive Context in Audit Logs

Complete observability and data-protection law are in direct tension: the richest forensic record captures full prompts, tool arguments, and retrieved documents — which routinely contain PII, secrets, and regulated data. The resolution is **field-level masking at the point of capture**, so raw sensitive values never reach the store, while preserving enough structure for detection and reconstruction.

Design principles: mask at emission (never store-then-redact — a breach of the store leaks everything); prefer **deterministic tokenization** for fields you must correlate on (same input → same token, enabling joins without exposing the value); hash-only for fields you only need to prove equality of (like `args_sha256`); and retain **format and taint metadata** even when masking the value, because detections need to know an SSN-shaped string appeared, not its digits.

```python
import re, hashlib, hmac

_HMAC_KEY = b"rotate-me-from-kms"   # keyed so tokens are unlinkable across tenants
_PATTERNS = {
    "EMAIL": re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
    "SSN":   re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "PAN":   re.compile(r"\b(?:\d[ -]*?){13,16}\b"),
}

def _token(kind: str, value: str) -> str:
    mac = hmac.new(_HMAC_KEY, value.encode(), hashlib.sha256).hexdigest()[:16]
    return f"<{kind}:{mac}>"   # deterministic, correlatable, non-reversible

def mask(text: str) -> str:
    for kind, pat in _PATTERNS.items():
        text = pat.sub(lambda m: _token(kind, m.group(0)), text)
    return text
```

Deterministic tokenization is deliberately a privacy trade-off: it enables correlation ("did this same email recur across sessions?") at the cost of linkability, so the HMAC key must be tenant-scoped, KMS-held, and rotated. Where regulation forbids retaining even a token, drop to hash-only or omit the field and record its taint tag. Document the masking policy as auditable code — a regulator will ask what you captured and why.

---

## 19.3 Security Monitoring & Detection Engineering

### 19.3.1 Behavioral Anomaly Detection: Unusual Tool Sequences, Plan Mutations, and Egress Patterns

Signature detection fails against agents because the attack is expressed as *legitimate tools invoked in an illegitimate order*. The detection primitive is therefore behavioral: model the distribution of normal trajectories and flag low-probability deviations. Three signals dominate: anomalous **tool sequences**, **plan mutations**, and unexpected **egress patterns**.

Tool-sequence modeling treats each trajectory as a string of tool tokens and learns an **n-gram / first-order Markov** model of transitions from a corpus of benign trajectories. At runtime, a transition with near-zero learned probability — `read_email → http_post` when that bigram never appears in baseline — is an anomaly. This is the telemetry signature of injected instructions redirecting the agent.

```python
from collections import defaultdict
import math

class MarkovToolModel:
    """First-order Markov model over tool-call sequences for anomaly scoring."""
    def __init__(self, k: float = 0.5) -> None:
        self._trans: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._k = k  # additive smoothing for unseen transitions

    def fit(self, benign: list[list[str]]) -> None:
        for seq in benign:
            for a, b in zip(seq, seq[1:]):
                self._trans[a][b] += 1

    def logprob(self, seq: list[str]) -> float:
        total = 0.0
        for a, b in zip(seq, seq[1:]):
            row = self._trans[a]
            denom = sum(row.values()) + self._k * (len(self._trans) + 1)
            total += math.log((row.get(b, 0) + self._k) / denom)
        return total / max(len(seq) - 1, 1)  # length-normalized

    def is_anomalous(self, seq: list[str], threshold: float) -> bool:
        return self.logprob(seq) < threshold   # calibrate on held-out benign set
```

Calibrate `threshold` on a held-out benign percentile (e.g. the 1st percentile of benign log-probabilities) to bound false positives. **Plan mutations** are detected structurally via the `plan.hash` divergence described in 19.1.2 — a plan that changes immediately after an `UNTRUSTED_RESULT` span is high-signal. **Egress anomalies** compare each tool span's destination against a per-agent allowlist of domains/hosts learned from baseline; a first-seen egress domain during a privileged trajectory is treated as exfiltration until proven otherwise. None of these is complete on its own — injection is an information-flow problem with partial, layered mitigations — but correlated they raise attacker cost sharply.

### 19.3.2 Token Consumption and Execution Time Spikes as Intrusion Indicators

Resource telemetry is an underused, model-agnostic intrusion channel because it is hard for an attacker to suppress while still achieving their goal. Two families matter.

**Token consumption.** `gen_ai.usage.input_tokens` and `output_tokens` per turn and per trajectory have a stable baseline for a given agent. Anomalies map to distinct threats: a spike in *input* tokens can indicate context stuffing or a memory-poisoning payload being loaded (Ch. 20.3.2); a spike in *output* tokens or turn count can indicate a runaway loop, a **Denial-of-Wallet** attack, or data being staged for exfiltration; sustained high token use across many sessions can indicate resource abuse of a hijacked agent.

**Execution-time spikes.** Per-tool latency and per-trajectory wall-clock time baselines catch a different class: an unusually long code-execution tool span may indicate the sandbox is being used for cryptomining or scanning; abnormally long trajectories may indicate the agent is stuck in an adversarially-induced loop.

| Indicator | Baseline metric | Threat mapped | Response |
| :--- | :--- | :--- | :--- |
| Input-token surge | tokens/turn p99 | Context stuffing / poisoning | Snapshot context, quarantine memory |
| Output-token surge | tokens/trajectory p99 | Runaway loop / DoW / exfil staging | Throttle, cap turns, alert |
| Turn-count blowup | steps/trajectory p99 | Injected loop / goal drift | Kill switch (19.4.2) |
| Code-tool latency | seconds/tool-span p99 | Sandbox abuse (mining/scan) | Kill sandbox, revoke creds |

Enforce these as **circuit breakers in the runtime**, not just dashboards: a per-trajectory token and step budget that hard-stops the agent is both a cost control and a containment primitive. Alerting after the wallet is drained is not detection engineering.

### 19.3.3 Writing Detections for Agentic TTPs and Mapping to MITRE ATLAS

Detections gain organizational meaning when mapped to a shared adversary taxonomy. **MITRE ATLAS** extends ATT&CK to AI systems, and the OWASP Agentic Security Initiative catalogs agent-specific threats; mapping each detection to a technique lets a SOC reason about coverage. Below are Sigma-like detection rules over the normalized telemetry from 19.1 (not real CVEs — logic sketches).

```yaml
# Detection 1: Indirect prompt injection steering to egress
title: Untrusted-tainted egress after web/email read
logsource: { product: agent_runtime, service: trajectory }
detection:
  read_untrusted:
    gen_ai.tool.name: [ "fetch_url", "read_email", "read_document" ]
    trust_tag: "UNTRUSTED_RESULT"
  egress_action:
    gen_ai.tool.name: [ "http_post", "send_email", "webhook" ]
    egress.first_seen_domain: true
  condition: read_untrusted followed_by egress_action within 5 steps
atlas: { technique: "AML.T0051", tactic: "Exfiltration" }  # LLM Prompt Injection chain
level: high
---
# Detection 2: Plan mutation after untrusted ingestion
title: Plan hash changed post untrusted tool result
detection:
  sel:
    event: "plan_mutation"
    preceded_by_trust_tag: "UNTRUSTED_RESULT"
  condition: sel
atlas: { tactic: "Execution" }
level: high
---
# Detection 3: Anomalous tool sequence (Markov)
title: Tool bigram below benign threshold
detection:
  sel: { anomaly.markov_logprob: "< -8.5" }   # calibrated per agent
  condition: sel
atlas: { tactic: "Discovery/Execution" }
level: medium
---
# Detection 4: Denial-of-Wallet / runaway loop
title: Trajectory token or step budget breach
detection:
  sel:
    or:
      - gen_ai.usage.total_tokens: "> 200000"
      - agent.trajectory.steps: "> 40"
  condition: sel
atlas: { tactic: "Impact", technique: "Resource Hijacking (analog)" }
level: medium
```

The discipline is coverage management: maintain a matrix of ATLAS tactics against implemented detections, and treat gaps as backlog. A detection that cannot name the technique it catches is hard to prioritize or retire.

### 19.3.4 SIEM/SOAR Integration and AI Security Operations (AISOC) Workflows

Detections are worthless unless they reach an analyst with context and can trigger response. The integration pattern: the audit and telemetry planes feed a **SIEM** (Splunk, Sentinel, Elastic) via the normalized OTel schema; correlation rules and the anomaly models run there or in a stream processor; matches raise alerts enriched with the `trace_id` so an analyst pivots directly to the full trajectory tree. A **SOAR** platform then runs playbooks — some fully automated, some gated on human approval.

```
+-------------------+     OTel/JSON      +------------------+
|  Agent Runtime    |------------------->|  Collector /     |
|  (spans+audit)    |  audit plane (WORM)|  Stream Proc     |
+---------+---------+                    +--------+---------+
          |                                       | normalized events
          | hash-chained audit                    v
          v                              +------------------+
   +-------------+                       |      SIEM        |
   |  WORM store |<----- legal hold ---- |  correlation +   |
   +-------------+                       |  anomaly models  |
                                         +--------+---------+
                                                  | alert (trace_id)
                                                  v
                                         +------------------+
                                         |      SOAR        |
                                         | playbooks:       |
                                         |  - kill switch   |
                                         |  - revoke creds  |
                                         |  - quarantine mem|
                                         +--------+---------+
                                                  | HITL for high-impact
                                                  v
                                            AISOC analyst
```

An **AI Security Operations Center (AISOC)** differs from a classic SOC in two ways. First, containment actions are agent-native — the SOAR playbook calls the agent control plane to flip a kill switch, revoke a workload credential, or quarantine a memory partition (19.4.2), not just isolate a host. Second, triage requires trajectory literacy: analysts read span trees and plan-mutation timelines, so runbooks must teach that. Keep the highest-impact actions (credential revocation on production identities, mass agent shutdown) behind human approval to avoid a false positive becoming a self-inflicted outage.

---

## 19.4 Incident Response for Autonomous Systems

### 19.4.1 Trajectory Reconstruction and Root Cause Analysis Under Non-Determinism

The first act of agent IR is answering "what exactly did it do, and why." Non-determinism makes naive replay useless: re-running the prompt yields a *different* trajectory, so the live path must be reconstructed from recorded telemetry, not regenerated. This is why 19.1 insisted on capturing the span tree, `plan.hash` lineage, context snapshots, system-prompt version, and cache state — reconstruction is only as good as what was recorded.

The reconstruction procedure: (1) pull the complete trace by `trace_id` from the audit plane; (2) verify the hash chain to prove the record is intact (19.2.2) — an investigation built on tampered logs is void; (3) render the span tree and walk it, at each LLM span retrieving the exact context snapshot and system-prompt version that produced the decision; (4) locate the **inflection point** — typically the first `UNTRUSTED_RESULT` span whose content a subsequent plan span incorporated, i.e. where taint entered the decision path; (5) classify root cause (indirect injection, tool misuse, model drift, policy gap).

Deterministic replay *is* possible for the non-model portions if you rehydrate recorded state: feed the exact captured context and mock each tool span with its recorded response, and the deterministic scaffolding — parsing, routing, policy checks — replays faithfully even though the model's generation would not. This "harness replay" isolates whether a failure was in the model's choice or in the surrounding control logic, which determines whether the fix is a prompt/policy change or a code change. Record the RCA against the immutable trace so the finding is itself auditable.

### 19.4.2 Containment Primitives: Kill Switches, Credential Revocation, and Memory Quarantine

Containment for autonomous systems must act faster than the agent can cause further harm, which means these primitives are pre-built controls, not improvised during the incident. Four are essential.

**Kill switches.** A control-plane flag the runtime checks before every tool invocation and model call; flipping it halts the agent (or an entire agent class/tenant) mid-trajectory. It must be out-of-band (an attacker who controls the agent's context must not be able to reach it) and fast — polled from a low-latency store or pushed via the control channel.

**Credential revocation.** Because agents act with delegated, short-lived workload identities (SPIFFE SVIDs, RFC 8693 exchanged tokens; see Ch. 12), containment revokes the *identity*, not a static API key. Short TTLs make revocation effective quickly; revoking the SVID or its upstream grant severs the agent's ability to touch downstream systems even if the process keeps running.

**Memory quarantine.** If episodic or semantic memory is poisoned, killing the process is insufficient — the payload reactivates on restart (Ch. 20.3.2). Quarantine snapshots the affected memory partition to immutable storage for forensics, then isolates or rolls it back to a pre-incident checkpoint so the agent cannot read it.

```python
from enum import Enum

class Containment(Enum):
    KILL = "kill"; REVOKE = "revoke"; QUARANTINE = "quarantine_memory"

def contain(agent_id: str, actions: set[Containment], control, iam, mem) -> dict:
    """Execute containment primitives; each is independently idempotent."""
    out = {}
    if Containment.KILL in actions:
        out["kill"] = control.set_flag(agent_id, "halt", True)      # checked pre-action
    if Containment.REVOKE in actions:
        out["revoke"] = iam.revoke_svid(agent_id)                   # kill delegated identity
    if Containment.QUARANTINE in actions:
        snap = mem.snapshot(agent_id)                               # preserve evidence first
        out["quarantine"] = mem.isolate(agent_id, evidence=snap)
    return out
```

Preserve evidence before you destroy state: snapshot memory and the trace before rollback, or the RCA becomes impossible. Rehearse these primitives — an untested kill switch is a design document, not a control.

### 19.4.3 Blast Radius Assessment and Remediation of Agent-Caused State Changes

Once contained, the question becomes *what did the agent change, and what must be undone*. Unlike a read-only breach, a compromised agent may have written to databases, sent messages, moved money, or modified downstream systems — each a side effect requiring remediation. **Blast radius assessment** enumerates those side effects from the audit trail.

The advantage of the 19.2 audit design is that every side-effecting action is recorded with its tool, argument hash, decision, and identity. Blast-radius assessment walks the hash-chained records for the compromised trajectories (and any downstream trajectories that consumed their outputs — poison can propagate agent-to-agent; see Ch. 20.3.3) and classifies each action by reversibility:

| Action class | Example | Reversibility | Remediation |
| :--- | :--- | :--- | :--- |
| Reversible write | DB row update | High | Restore from pre-action value / backup |
| Idempotent external | Set config flag | High | Re-apply known-good state |
| Non-idempotent external | Payment, email sent | Low | Compensating transaction; notify recipients |
| Identity/permission | Granted a role | Medium | Revoke; audit for lateral use |
| Data exfiltration | POST to external host | None | IR disclosure; rotate exposed secrets |

Remediation prefers **compensating transactions** over naive rollback, because external side effects (a sent email, a submitted order) cannot be un-sent — you issue a correcting action and notify affected parties. Idempotency tokens recorded on each action (see Ch. 1.1.3) let you dedupe and safely re-drive reversible writes. Close the loop by feeding the confirmed attack trajectory back into the regression corpus (Ch. 20.4.2) and the benign/malicious baselines (19.3.1), so the same trajectory is caught pre-emptively next time. An incident that does not improve the detections is an incident half-handled.

---

## Technical Chapter Summary

- Agentic observability requires a shared schema: adopt **OpenTelemetry GenAI semantic conventions** (`gen_ai.system`, `gen_ai.operation.name`, `gen_ai.request.model`, `gen_ai.usage.input_tokens/output_tokens`, tool-call spans) and **OpenInference** span kinds so detection and forensics can query across teams.
- A trajectory is a **span tree**, not a line; preserve parent/child structure, hash each plan (`plan.hash`) to detect plan mutations, and carry `trust_tag`s so taint propagation from `UNTRUSTED_RESULT` spans into privileged tool arguments is a queryable property. Use tail-based sampling to never drop security-relevant traces.
- Reconstruction demands capturing what most systems omit: the **system-instruction version** (hash-pinned into every span), content-addressed **context snapshots**, and **cache state**.
- Legal non-repudiation needs an **immutable audit plane** separate from telemetry, made tamper-evident by **hash chaining** and authentic by **signing** each action under a workload identity, with periodic external anchoring — reconciled with privacy via deterministic, keyed **field-level masking at emission**.
- Detection engineering is behavioral: **Markov/n-gram tool-sequence** anomaly scoring, plan-mutation and first-seen-egress signals, and **token/latency circuit breakers** as both cost control and containment, all mapped to **MITRE ATLAS** and routed through SIEM/SOAR into AISOC playbooks.
- Incident response reconstructs the live path from telemetry (never re-generates it), verifies the hash chain before trusting evidence, and isolates the taint **inflection point**; harness replay with rehydrated state separates model-choice failures from control-logic failures.
- Containment relies on pre-built, rehearsed primitives — **kill switches**, **workload-identity revocation**, and **memory quarantine** — and remediation uses **blast-radius assessment** over the audit trail plus **compensating transactions** for irreversible external side effects, feeding every confirmed attack back into detections and regression corpora.
