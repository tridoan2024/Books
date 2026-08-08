# Chapter 22: Governance, Risk, Compliance & Human-in-the-Loop

The controls in Parts II and III—guardrails, sandboxes, identity federation, information-flow control—are load-bearing only if an organization can prove they exist, prove they operate, and prove they were operating at the moment an autonomous action caused harm. Governance, risk, and compliance (**GRC**) is the discipline that converts architectural controls into defensible, auditable, contractual facts. For a Principal AI Security Engineer this is not paperwork delegated to a legal team; it is an engineering problem of instrumentation, evidence generation, and control-to-obligation mapping.

This chapter is deliberately concrete. Regulatory frameworks—NIST AI RMF, the EU AI Act, ISO/IEC 42001, GDPR—are frequently taught as abstractions. Here they are treated as requirements that decompose into telemetry schemas, retention policies, approval routing code, and cryptographic non-repudiation logs. The through-line is **evidence**: for every obligation, an engineering team must be able to point at an artifact—a signed audit record, a policy bundle version, a data-lineage graph, a human approval receipt—that demonstrates conformance.

By the end of the chapter you will be able to build a control-to-evidence mapping that survives an external audit, engineer human-in-the-loop (**HITL**) checkpoints that resist operator fatigue and out-of-band hijacking, establish non-repudiation for actions taken by non-human identities, and stand up an AI Safety & Security Review Board with written autonomy boundaries and incident-response playbooks. The recurring warning: a control that produces no durable, tamper-evident evidence is, from a compliance standpoint, a control that does not exist.

---

## 22.1 Compliance & Regulatory Frameworks

### 22.1.1 Operationalizing the NIST AI Risk Management Framework and Its Agentic/Generative Profiles

The **NIST AI Risk Management Framework** (AI RMF 1.0) is voluntary, outcome-based, and structured around four functions: **Govern**, **Map**, **Measure**, and **Manage**. Its companion **Generative AI Profile** (NIST AI 600-1) enumerates risks specific to generative systems—confabulation, data leakage, dangerous-content generation, and information-integrity harms—that agentic systems inherit and amplify because an agent can *act* on a confabulated plan, not merely emit it. Operationalizing the RMF means binding each function to concrete engineering artifacts rather than treating it as a maturity narrative.

The four functions map onto an agent platform as follows. **Govern** is cross-cutting: it establishes roles, accountability, and risk tolerance—instantiated as the Review Board charter (see 22.4.1) and written autonomy boundaries (22.4.2). **Map** establishes context: the agent inventory, autonomy-level classification (see Ch. 1.1.2), data-classification limits, and the AI-BOM. **Measure** is the evaluation and telemetry layer: red-team results from PyRIT/Garak (see Ch. 24.4.3), guardrail hit rates, injection-detection precision/recall, and drift metrics. **Manage** is the operational response: policy enforcement at the gateway, incident response, and risk-treatment decisions.

The single most useful artifact for an audit is a **control-to-evidence mapping table**. It links each RMF subcategory to the specific control that satisfies it and the machine-generated evidence that proves the control ran.

| RMF Function | Representative Subcategory (paraphrased) | Engineering Control | Evidence Artifact |
| :--- | :--- | :--- | :--- |
| Govern | Roles and accountability are documented | Review Board charter; RACI matrix | Signed charter doc; approval records |
| Map | AI system context and capabilities are catalogued | Agent inventory + AI-BOM (CycloneDX) | `agent-bom.json` per release, signed |
| Map | Data provenance and classification recorded | Permission-aware retrieval + taint tags | Data-lineage graph; classification labels |
| Measure | Adversarial robustness is evaluated | Continuous red-team pipeline (PyRIT/Garak) | Eval run reports with pass/fail deltas |
| Measure | Guardrail efficacy is tracked | Guardrail plane telemetry | OTel spans: `guardrail.decision`, `.reason` |
| Manage | Risks are prioritized and treated | Risk register + gateway policy bundles | Versioned policy bundle + risk-treatment log |
| Manage | Incidents are handled and documented | IR playbooks (22.4.3) | Post-mortem records; quarantine logs |

The evidence column is what differentiates a real program from a slide deck. Each artifact must be produced automatically by the platform, timestamped, and retained. A practical pattern is to emit RMF-tagged spans through the OpenTelemetry GenAI semantic conventions so that a query over the telemetry store can answer "show me every Measure-function evidence event for agent X in Q3" without manual collation.

Because the RMF is outcome-based, auditors accept engineering-native evidence—dashboards, signed logs, CI pipeline outputs—provided the mapping from obligation to artifact is explicit and stable across releases. The failure mode is a mapping that references controls that exist in design documents but emit no runtime evidence; treat any such row as an open finding.

---

### 22.1.2 EU AI Act: High-Risk and GPAI Obligations, Timelines, and Technical Evidence

The **EU AI Act** is a risk-tiered, horizontally applicable regulation that classifies AI systems into prohibited, high-risk, limited-risk, and minimal-risk categories, and separately imposes obligations on providers of **general-purpose AI (GPAI)** models. Its obligations phase in over a multi-year schedule following entry into force, with prohibitions applying earliest, GPAI obligations following, and the bulk of high-risk obligations applying later. Because exact article numbers and enforcement dates are easy to misstate, treat them qualitatively here and confirm against the current consolidated text before making a compliance claim; the engineering obligations, however, are stable enough to build toward now.

For **high-risk systems**, the Act imposes a recognizable set of obligations that decompose cleanly into engineering deliverables: a risk-management system operating across the lifecycle; data and data-governance requirements; **technical documentation** sufficient for a conformity assessment; **automatic record-keeping** (logging) over the system's lifetime; transparency and instructions for use; **human oversight** designed into the system; and appropriate accuracy, robustness, and cybersecurity. An agentic system that touches employment decisions, credit, essential services, or safety components is a strong candidate for high-risk classification, and the human-oversight requirement maps directly onto the HITL engineering in 22.2.

For **GPAI providers**, obligations center on technical documentation, information provided to downstream deployers, a policy to respect EU copyright law, and a public summary of training-data content; providers of models deemed to carry **systemic risk** face additional model-evaluation, adversarial-testing, incident-reporting, and cybersecurity obligations.

The engineering question is: *what technical evidence must the team produce?* The table maps obligations to artifacts an AI security team already knows how to generate.

| EU AI Act Obligation (high-risk, paraphrased) | Technical Evidence the Engineering Team Produces |
| :--- | :--- |
| Risk-management system across lifecycle | Risk register, threat models (STRIDE/MAESTRO), residual-risk sign-offs |
| Data governance | Dataset datasheets, lineage graphs, PII-handling records |
| Technical documentation | Architecture docs, AI-BOM, model cards, control-to-obligation map |
| Automatic logging over lifetime | Immutable, timestamped action logs with actor NHI + trace IDs |
| Human oversight | HITL checkpoint config, approval receipts, override records |
| Accuracy, robustness, cybersecurity | Eval reports, adversarial-test results, pen-test findings, patch records |
| Post-market monitoring | Telemetry dashboards, drift alerts, incident reports |

The logging obligation deserves emphasis. "Automatic recording of events over the lifetime" is not application logging as usual; it means durable, queryable records of what the system did, when, on whose behalf, and with what inputs—retained for the regulated period. This is the same non-repudiation log required by 22.3.1, which is why a well-designed platform satisfies both with one immutable event store. Build the log once, at the gateway, and tag events with the obligation IDs they satisfy so that an auditor's request resolves to a query rather than a forensic reconstruction.

---

### 22.1.3 ISO/IEC 42001 AI Management Systems and Mapping to ISO 27001 Controls

**ISO/IEC 42001** specifies requirements for an **AI Management System (AIMS)**: a certifiable, auditable management system in the same family as ISO/IEC 27001 (information security) and ISO 9001 (quality). Where NIST AI RMF is a voluntary framework and the EU AI Act is law, 42001 is the *management system* that lets an organization demonstrate systematic, repeatable governance—and, crucially, obtain third-party certification that carries weight with customers and regulators.

For an organization already certified to ISO/IEC 27001, the strategic move is to treat AIMS as an extension of the existing **ISMS** rather than a parallel structure. The Plan-Do-Check-Act backbone, the requirement for documented context, leadership commitment, risk assessment, operational controls, internal audit, and management review are shared. What 42001 adds is AI-specific control objectives: management of data for AI, transparency to affected parties, human oversight, lifecycle governance of AI systems, and management of AI-specific risks like automation bias and model drift.

The following mapping shows where AIMS controls extend or reuse ISMS controls. It is a starting scaffold, not an exhaustive cross-reference.

| AIMS Concern (ISO/IEC 42001) | Reuses / Extends ISO/IEC 27001 Control Area | Agent-Platform Implementation |
| :--- | :--- | :--- |
| AI system inventory & ownership | Asset management | Agent catalog + NHI registry (see Ch. 1.4) |
| Access control for models/tools | Access control | SPIFFE identities + OPA/Cedar policy (Ch. 24.5.1) |
| Data governance for AI | Information classification & handling | Permission-aware retrieval + taint labels |
| Logging & monitoring | Logging and monitoring | Immutable action log + OTel GenAI spans |
| Supplier/third-party AI risk | Supplier relationships | Vendor DPAs, SLAs, indemnity (see 22.3.2) |
| Incident management | Information security incident management | Agent IR playbooks (see 22.4.3) |
| AI-specific risk (drift, bias, autonomy) | *New in AIMS* | Autonomy boundaries + drift monitoring (22.4.2) |

The engineering value of framing AIMS as an ISMS superset is efficiency: one evidence pipeline, one internal-audit cadence, and one management review can satisfy both certifications. The rows marked "New in AIMS" are where dedicated engineering investment is required—these are the risks that traditional information-security controls do not address, because they arise from the model's behavior rather than from confidentiality/integrity/availability of data. A certification auditor will focus disproportionately on those rows, so ensure they are backed by runtime evidence (drift dashboards, autonomy-boundary violation alerts) and not merely policy prose.

---

### 22.1.4 Data Protection (GDPR, CCPA), Sectoral Rules, and Memory Erasure Rights

Agentic systems create a distinctive data-protection problem: personal data does not sit only in a primary database where a `DELETE` statement resolves it. It is scattered across **embeddings in vector stores**, **KV-cache and prompt-caches**, **episodic-memory logs**, **retrieval indexes**, **model fine-tuning sets**, and **telemetry**. When a data subject exercises the **right to erasure** under the **GDPR**, or a consumer exercises deletion/opt-out rights under the **CCPA/CPRA**, the engineering obligation is to purge personal data from *all* of these surfaces, and to prove it.

GDPR imposes principles that map onto agent design: lawful basis and purpose limitation (an agent must not repurpose retrieved personal data for unrelated actions), data minimization (context minimization at retrieval time—see Ch. 24.5.3), and the erasure and rectification rights. Sectoral regimes layer additional constraints: **HIPAA** governs protected health information with minimum-necessary access and audit-trail requirements; **PCI DSS** prohibits storing certain cardholder data and mandates network segmentation and access logging; financial regulations impose record-retention and supervision duties that can *conflict* with erasure requests—a genuinely hard case where legal hold overrides deletion, and the platform must encode that precedence.

The technical crux is **memory erasure across a vector store**. Deleting the source document is insufficient if its embedding chunks remain retrievable and reconstructable. Erasure must cascade through every derived artifact.

```python
from __future__ import annotations
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


class Surface(str, Enum):
    VECTOR_STORE = "vector_store"
    EPISODIC_LOG = "episodic_log"
    PROMPT_CACHE = "prompt_cache"
    RETRIEVAL_INDEX = "retrieval_index"
    TELEMETRY = "telemetry"


@dataclass
class ErasureReceipt:
    subject_id: str
    request_id: str
    surfaces_purged: dict[Surface, int] = field(default_factory=dict)
    legal_hold_blocked: list[Surface] = field(default_factory=list)
    completed_at: datetime | None = None

    def digest(self) -> str:
        payload = f"{self.subject_id}|{self.request_id}|{sorted(self.surfaces_purged.items())}"
        return hashlib.sha256(payload.encode()).hexdigest()


class MemoryErasureOrchestrator:
    """Cascades a data-subject erasure request across all derived stores.

    Each backend must expose delete_by_subject; legal holds veto deletion
    on specific surfaces and are recorded, not silently ignored.
    """

    def __init__(self, backends: dict[Surface, "SubjectDeletable"],
                 legal_holds: set[Surface]) -> None:
        self._backends = backends
        self._holds = legal_holds

    def erase(self, subject_id: str, request_id: str) -> ErasureReceipt:
        receipt = ErasureReceipt(subject_id=subject_id, request_id=request_id)
        for surface, backend in self._backends.items():
            if surface in self._holds:
                receipt.legal_hold_blocked.append(surface)
                continue
            # Deletes source rows AND derived embeddings / cached chunks.
            deleted = backend.delete_by_subject(subject_id)
            receipt.surfaces_purged[surface] = deleted
        receipt.completed_at = datetime.now(timezone.utc)
        return receipt
```

The `ErasureReceipt.digest()` is the compliance artifact: a signed, retained proof that erasure ran, which surfaces were purged, and which were withheld under legal hold. Two engineering realities complicate this. First, embeddings are difficult to selectively delete when a vector index does not support per-vector removal efficiently; the mitigation is to store a subject-to-vector-ID mapping at ingestion so deletion is an indexed operation rather than a full re-embed. Second, model weights that were fine-tuned on personal data cannot be "un-trained" cheaply—this is why personal data should be kept in retrieval layers, never baked into weights, so that erasure remains a data operation rather than a retraining project.

---

## 22.2 Human-in-the-Loop (HITL) Security Engineering

### 22.2.1 Escalation Triggers: Classifying Irreversible vs. Reversible Actions

Human oversight is only meaningful if a human is inserted at the *right* points. Interrupting every action produces fatigue (22.2.2); interrupting none produces unbounded blast radius. The organizing principle is **reversibility**: an action's escalation requirement is a function of how hard it is to undo, how large its blast radius is, and the trust level of the data that motivated it. A read of a public web page is reversible and low-stakes; a wire transfer, a production `DROP TABLE`, an outbound email to a customer, or a code deployment are **irreversible** or high-blast-radius and must be gated.

A robust classifier scores an action on three axes—reversibility, blast radius, and data taint (is the action motivated by untrusted, injectable content?)—and routes it to one of: auto-approve, single approver, dual-control (two approvers), or hard-block. Critically, taint matters: an otherwise-routine action becomes high-risk when the plan that produced it was influenced by tainted retrieval content, because that is the signature of **indirect prompt injection** (see Ch. 24.5.3).

```python
from __future__ import annotations
from dataclasses import dataclass
from enum import IntEnum


class Reversibility(IntEnum):
    REVERSIBLE = 0        # read, draft, in-sandbox compute
    COMPENSABLE = 1       # undoable with effort (soft-delete, revocable grant)
    IRREVERSIBLE = 2      # wire transfer, prod delete, external send


class Routing(IntEnum):
    AUTO = 0
    SINGLE_APPROVER = 1
    DUAL_CONTROL = 2
    BLOCK = 3


@dataclass(frozen=True)
class ActionContext:
    tool: str
    reversibility: Reversibility
    blast_radius: int          # affected records / dollars, normalized 0-3
    tainted_provenance: bool   # plan influenced by untrusted content
    autonomy_level: int        # agent's Level 0-5


def classify(action: ActionContext) -> Routing:
    score = int(action.reversibility) + action.blast_radius
    # Tainted provenance on any non-reversible action forces human review.
    if action.tainted_provenance and action.reversibility >= Reversibility.COMPENSABLE:
        score += 2
    if action.reversibility == Reversibility.IRREVERSIBLE and action.blast_radius >= 2:
        return Routing.DUAL_CONTROL
    if score >= 4:
        return Routing.DUAL_CONTROL
    if score >= 2:
        return Routing.SINGLE_APPROVER
    if score >= 1 and action.autonomy_level >= 4:
        return Routing.SINGLE_APPROVER
    return Routing.AUTO
```

The routing decision must be enforced at the **action engine gate** (see Ch. 1.2.2), not inside the model's prompt, because a prompt-level instruction to "always ask before wiring money" is itself defeatable by injection. The classifier is deterministic code sitting on the privileged side of the trust boundary. Its output—`Routing`—drives the approval interface in 22.2.3. The escalation policy itself is versioned configuration reviewed by the Board (22.4.1), so that changing a threshold is an auditable governance event, not a silent code tweak.

---

### 22.2.2 Preventing Operator Fatigue and Rubber-Stamping in High-Volume Workflows

A HITL control that generates hundreds of approval requests per operator per hour degrades into a rubber stamp: the human clicks "approve" reflexively, and oversight becomes theater. This is **automation bias** and **alert fatigue** applied to approvals, and it is the dominant failure mode of naive HITL designs. The engineering countermeasures are structural, not exhortational—telling operators to "be careful" does not scale.

Four structural techniques work together. **Risk-ranked queues** ensure the highest-consequence approvals surface first and are visually distinct, so scarce human attention is spent where it matters; low-risk items are batch-approvable or auto-approved per 22.2.1. **Intelligent batching** groups semantically similar low-risk actions ("approve 40 identical read grants") while forcing high-risk actions to stand alone. **Forced-context approval UIs** deliberately introduce friction on irreversible actions: the operator must view the concrete diff (the exact SQL, the exact recipient and amount, the provenance of the motivating content) and, for the highest tier, retype a confirmation token—defeating one-click reflex. Finally, **approval-quality measurement** treats the human as a monitored control whose performance is itself telemetry.

Measuring approval quality is the part teams skip. Track dwell time per decision, approval-to-reject ratio by operator, and—most powerfully—**decoy injection**: periodically insert a synthetic approval request that *should* be rejected (an obviously anomalous wire, a delete against a protected table) and measure whether operators catch it.

| Metric | What It Detects | Healthy Signal | Fatigue / Rubber-Stamp Signal |
| :--- | :--- | :--- | :--- |
| Median dwell time (high-risk) | Reflexive clicking | Seconds-to-minutes proportional to stakes | Sub-second, flat across risk tiers |
| Approve/reject ratio | Loss of discrimination | Non-trivial reject rate | ~100% approve regardless of content |
| Decoy catch rate | Genuine attention | High catch rate on planted bad items | Decoys approved |
| Queue age at approval | Backlog pressure | Bounded | Bulk approvals clearing backlog spikes |
| Escalation override rate | Threshold miscalibration | Low | Frequent overrides of the classifier |

```python
def approval_health(decisions: list["Decision"]) -> dict[str, float]:
    high = [d for d in decisions if d.risk_tier >= 2]
    decoys = [d for d in decisions if d.is_decoy]
    caught = [d for d in decoys if d.outcome == "reject"]
    return {
        "median_dwell_high_risk_s": _median([d.dwell_s for d in high]) if high else 0.0,
        "approve_rate": sum(d.outcome == "approve" for d in decisions) / max(len(decisions), 1),
        "decoy_catch_rate": len(caught) / max(len(decoys), 1),
    }
```

When decoy catch rate falls or high-risk dwell time collapses toward zero, the correct response is operational: rotate operators, reduce queue volume by tightening auto-approve criteria, or add approvers. A degraded human control is a security finding and should raise an alert exactly as a failing WAF rule would.

---

### 22.2.3 Secure Approval Interfaces: Out-of-Band Verification and Step-Up Authentication

The subtlest HITL failure is **approval-channel hijacking**: the same indirect prompt injection that induced a malicious action also manipulates the in-band approval request the operator sees, so the human approves a benign-looking summary while a different action executes. If the agent generates both the action and the human-readable description of the action, an attacker who controls the agent's context controls both—and the human's "approval" is worthless. The defense is to break the coupling between the compromised channel and the approval channel.

Three controls compose. **Out-of-band verification**: the approval request is rendered by trusted platform code from the *structured, validated action object*—not from model-generated prose—and delivered over a separate channel (a dedicated approvals app, a signed push, an authenticated portal) rather than inside the chat surface the attacker can influence. What the operator sees is the exact tool, parameters, and provenance the gate will execute, byte-for-byte, not the model's description of them. **Step-up authentication**: irreversible/dual-control actions require the operator to re-authenticate with a phishing-resistant factor (WebAuthn/FIDO2 passkey, hardware security key) at approval time, so a hijacked session cannot silently approve. **Signed approval receipts**: the approval produces a cryptographically signed token binding operator identity, action digest, and timestamp, which the gate verifies before execution—establishing non-repudiation (see 22.3.1).

```
        AGENT CONTEXT (potentially tainted)                TRUSTED PLATFORM
   +--------------------------------------+        +------------------------------+
   |  Model proposes structured action:   |        |  Action Engine Gate          |
   |  {tool:"wire", to:"ACME", amt:50000} |        |  classify() -> DUAL_CONTROL   |
   +-------------------+------------------+         +--------------+---------------+
                       | structured object only                    |
                       v                                           v
   =========== TRUST BOUNDARY (no model prose crosses) ============================
                                                                   |
                                        +--------------------------v-----------+
                                        | Out-of-Band Approval Service         |
                                        |  - renders action FROM struct object |
                                        |  - separate app / signed push        |
                                        |  - step-up: WebAuthn re-auth         |
                                        +--------------------------+-----------+
                                                                   |
                                     approver reviews canonical action, re-auths
                                                                   |
                                        +--------------------------v-----------+
                                        | Signed Approval Receipt (JWS)        |
                                        |  sub=operator, act=sha256(action),   |
                                        |  ts, factor=webauthn                 |
                                        +--------------------------+-----------+
                                                                   |
                                        gate verifies receipt.act == sha256(action)
                                                                   v
                                                            EXECUTE or DENY
```

The critical invariant is that the digest the operator approved must equal the digest the gate executes. If the model attempts to alter parameters after approval, the digests diverge and the gate denies. This defeats "approve-then-swap" attacks and confirms that the human authorized *this exact action*, not a plausible-sounding paraphrase of it. Step-up auth ensures the approval cannot be forged by a stolen session token, and the out-of-band channel ensures the injection that compromised the agent cannot also forge the review the human relied upon.

---

## 22.3 Accountability & Assurance

### 22.3.1 Liability, Attribution, and Non-Repudiation for Autonomous Actions

When an autonomous agent moves money, deletes data, or sends a defamatory message, three questions follow immediately: *who is liable*, *which principal caused it*, and *can we prove it*. **Attribution** is the engineering prerequisite for the legal question of **liability**, and **non-repudiation** is the property that makes attribution defensible—a record the acting party cannot later disown.

Attribution in agentic systems is hard because the acting principal is a **non-human identity** (see Ch. 24.4.2) operating under a chain of delegated authority: a human initiated a request, a supervisor agent decomposed it, a sub-agent executed it, using a token exchanged (RFC 8693) from the human's credential. Non-repudiation requires capturing that entire chain immutably. The minimum record for every side-effecting action is: the agent's SPIFFE ID, the human on whose behalf it acted, the delegation token chain, the exact action digest, the motivating context provenance (was tainted content involved?), the approval receipt if any, and a monotonic timestamp—all written to an append-only, tamper-evident store before execution.

```python
from __future__ import annotations
import hashlib
import hmac
from dataclasses import dataclass, asdict
from datetime import datetime, timezone


@dataclass(frozen=True)
class ActionRecord:
    action_id: str
    agent_spiffe_id: str
    on_behalf_of: str            # human principal
    delegation_chain: tuple[str, ...]
    action_digest: str           # sha256 of canonical action
    provenance_tainted: bool
    approval_receipt: str | None
    ts: str


class NonRepudiationLog:
    """Append-only, hash-chained action log. Each entry commits to the
    previous entry's MAC, so retroactive tampering breaks the chain.
    """

    def __init__(self, secret: bytes) -> None:
        self._secret = secret
        self._prev_mac = b"genesis"

    def append(self, record: ActionRecord) -> str:
        body = f"{self._prev_mac.hex()}|{asdict(record)}".encode()
        mac = hmac.new(self._secret, body, hashlib.sha256).digest()
        self._prev_mac = mac
        # Persist (record, mac) to WORM storage here.
        return mac.hex()
```

The hash chain provides tamper-evidence: altering any historical record invalidates every subsequent MAC, so an auditor (or the organization, when repudiating a fraudulent claim) can prove the log is intact. In regulated deployments, anchor the chain periodically to an external trusted timestamp or transparency log so that even an insider with the HMAC key cannot rewrite history undetected. This single log satisfies the EU AI Act lifetime-logging obligation (22.1.2), the ISO 42001 logging control (22.1.3), and the forensic needs of incident response (22.4.3)—build it once and tag entries with the obligations they serve.

Liability allocation is ultimately contractual and jurisdictional, but engineering determines whether the organization can *support* a liability position at all. If the platform cannot prove which principal acted and whether a human approved, the organization bears risk by default.

---

### 22.3.2 Third-Party Risk: Contracts, SLAs, and Indemnity for Agent Vendors

Few enterprises build every component; they consume foundation-model APIs, managed vector stores, third-party tools, and increasingly **community MCP servers** (see Ch. 24.2.2). Each dependency imports risk that cannot be fully controlled technically and must therefore be governed **contractually**. The Principal engineer's role is to translate technical risk into contract requirements procurement can enforce.

The core instruments are the **Data Processing Agreement (DPA)** governing how a vendor processes personal data (required under GDPR when the vendor is a processor), **Service Level Agreements (SLAs)** with measurable availability and security-response commitments, security addenda mandating specific controls (encryption, tenant isolation, breach notification within a defined window), and **indemnification** clauses allocating financial responsibility for the vendor's failures. For AI vendors specifically, additional terms matter: whether customer data or prompts are used for training (it should be contractually prohibited for sensitive workloads), model-change notification (so a silent model swap does not invalidate your evaluations), and the right to audit or receive third-party attestations (SOC 2, ISO 27001/42001).

| Third-Party Risk | Technical Concern | Contractual Control |
| :--- | :--- | :--- |
| Data used for training | Confidential prompts leak into weights | No-training clause; deletion on termination |
| Silent model updates | Evals invalidated; behavior drift | Change-notification SLA; version pinning |
| Vendor breach | Downstream data exposure | Breach-notification window; indemnity |
| MCP tool poisoning | Malicious tool description / behavior | Provenance attestation; allowlist + review |
| Sub-processor sprawl | Uncontrolled data flow-down | Sub-processor approval + flow-down terms |
| Availability failure | Agent workflow outage | Uptime SLA + credits; failover requirement |

Contracts do not replace technical controls—a no-training clause does not stop exfiltration, only compensates for it—so pair every contractual control with a technical one where possible (e.g., never send data you cannot afford to have trained on, regardless of the clause). Maintain a vendor risk register that ties each third party to its DPA, its attestation status and expiry, its sub-processors, and its assigned business owner, and review it on the same cadence as the internal control program. When a vendor cannot meet a required term, that gap is a documented, accepted risk signed off by the Review Board (22.4.1)—not an unstated assumption.

---

### 22.3.3 Insurance, Audit Evidence, and Regulator-Facing Documentation

Residual risk that cannot be eliminated technically or transferred contractually is transferred financially through **insurance**, and demonstrated externally through **audit evidence packages** and **regulator-facing documentation**. These three artifacts are the outward face of the entire GRC program; underwriters, auditors, and regulators judge the organization by them.

**Insurance** for AI systems is evolving: cyber policies increasingly address AI-specific harms, and dedicated coverage for AI errors-and-omissions is emerging. Underwriters price premiums on demonstrable control maturity—the same evidence the RMF and 42001 programs produce. A team that can hand an underwriter its control-to-evidence mapping, red-team cadence, and incident history obtains better terms than one that cannot. Engineering's contribution is making risk *legible*: quantified blast-radius limits (22.4.2), MTTD/MTTR for agent incidents, and coverage of the autonomy inventory.

The **audit evidence package** is a curated, versioned bundle assembled for a specific audit (SOC 2, ISO 42001 certification, customer security review, or a regulator inquiry). It should be assemblable on demand from the platform, not reconstructed manually.

```
audit-evidence-package/
├── 00_scope_and_system_description.md      # boundaries, data flows, AI-BOM
├── 01_control_to_obligation_map.csv        # RMF / AI Act / 42001 rows -> evidence
├── 02_policy_bundles/                       # versioned OPA/Cedar bundles + hashes
├── 03_action_logs/                          # non-repudiation log exports (WORM)
├── 04_eval_reports/                         # PyRIT/Garak runs, deltas over time
├── 05_hitl_records/                         # approval receipts, decoy-catch metrics
├── 06_incident_reports/                     # post-mortems, timelines, root cause
├── 07_vendor_risk/                          # DPAs, attestations, sub-processors
├── 08_dpia_and_data_protection/            # DPIAs, erasure receipts, retention
└── manifest.json                            # signed index with content digests
```

**Regulator-facing documentation** is a distinct register: precise, qualitative where uncertainty exists, and free of overclaiming. When describing obligations whose article numbers or enforcement dates are uncertain, describe the obligation's substance rather than citing a number you cannot verify—an auditor tolerates "we maintain lifetime action logs to meet the Act's record-keeping obligation" far better than a mis-cited article. Every claim of conformance in this documentation must resolve to an artifact in the evidence package. The discipline that makes all of this cheap is the same one repeated throughout the chapter: emit evidence automatically at runtime, tag it with the obligations it satisfies, and retain it immutably, so the audit package is a *query*, not a *project*.

---

## 22.4 Enterprise Risk Governance & Policy

### 22.4.1 Establishing an AI Safety & Security Review Board

Distributed engineering teams making independent autonomy decisions produce inconsistent risk postures and no accountable owner. An **AI Safety & Security Review Board** centralizes the decisions that must be consistent across the organization: what autonomy is acceptable, which agents may reach production, how incidents are adjudicated, and how policy changes. The Board is the concrete instantiation of the NIST RMF **Govern** function (22.1.1).

A workable charter specifies membership, scope, decision rights, and cadence. Membership is cross-functional: security engineering, ML/platform engineering, legal/privacy, compliance, and a business owner—because autonomy decisions trade off risk against value and cannot be made by security alone. Scope covers agent onboarding above a defined autonomy level, changes to autonomy boundaries and blast-radius limits, exceptions to policy, post-incident findings, and third-party risk acceptances. Decision rights must be explicit: which decisions the Board makes versus advises on, and what quorum is required for an irreversible or high-blast-radius approval.

| Charter Element | Specification |
| :--- | :--- |
| Mandate | Approve autonomy boundaries; gate high-risk agents to prod; adjudicate incidents |
| Membership | Security eng, ML/platform eng, legal/privacy, compliance, business owner |
| Decision rights | Binding for Level ≥3 agent production; policy exceptions; risk acceptances |
| Quorum | Defined minimum incl. security + legal for irreversible-capability approvals |
| Cadence | Regular review + emergency convening for zero-day IR (22.4.2) |
| Evidence | Minutes, signed decisions, risk-acceptance records into audit package |
| Escalation | Path to CISO/board for enterprise-material risk |

The Board's outputs are governance evidence: signed decisions, meeting minutes, and risk-acceptance records that flow into the audit package (22.3.3). Its authority must be real—an advisory body that engineering can bypass produces the shadow-AI problem (see Ch. 1.4.2) it was meant to solve. Bind the Board's decisions to enforcement: a Level-4 agent cannot obtain production credentials or a SPIFFE identity in the prod trust domain without a recorded Board approval, making the gate technical, not merely procedural.

---

### 22.4.2 Defining Acceptable Autonomy Boundaries and Blast Radius Limits

Autonomy is not binary; it is a set of bounded capabilities that must be written down as **policy** and enforced as **code**. An **autonomy boundary** defines what an agent may do without human approval; a **blast-radius limit** caps the maximum damage a single agent or run can inflict even when acting within its boundary. These are the written policies the Board approves and the gateway enforces.

Blast-radius limits are the more important control because they bound *worst case* independent of whether a specific attack was anticipated. Effective limits are quantitative and enforced at the privileged gate: a maximum dollar value per transaction and per rolling window; a maximum number of records mutated per run; a cap on outbound external messages; a prohibition on touching data above the agent's classification limit; and a rate limit on tool invocations. When an agent hits a limit, the platform does not silently continue—it fails closed and escalates (22.2.1).

```rego
package autonomy.boundary

default allow := false

# Written policy encoded as code: finance agent's autonomy boundary.
allow if {
    input.agent.autonomy_level <= 3
    input.action.tool in {"read_ledger", "draft_report"}
}

# Irreversible spend is bounded and requires dual control above a threshold.
allow if {
    input.action.tool == "wire_transfer"
    input.action.amount <= data.limits.max_wire
    input.action.window_total <= data.limits.max_wire_daily
    input.approval.dual_control == true
    not input.action.provenance_tainted
}

# Blast-radius: never exceed classification or mutation caps.
deny_reason[msg] {
    input.action.records_mutated > data.limits.max_records
    msg := sprintf("blast radius exceeded: %d > %d",
        [input.action.records_mutated, data.limits.max_records])
}
```

Writing boundaries as Rego (or Cedar) makes them auditable, versioned, and testable—a boundary change is a reviewed pull request and a Board decision, not an undocumented adjustment. The `data.limits` values are the quantified blast-radius caps the Board sets. Two design notes: boundaries must be enforced server-side at the action gate (never in the prompt), and `provenance_tainted` must veto high-consequence actions so that injection cannot ride a legitimate autonomy grant to a harmful outcome. Boundaries scale with demonstrated safety: an agent earns wider autonomy through a track record measured in telemetry, not by default.

---

### 22.4.3 Agent Incident Response Playbooks: Quarantining, Rollback, and Post-Mortem Analysis

Agent incidents differ from classical security incidents in a decisive way: the compromised entity is *actively taking actions* while you respond. A prompt-injected agent with tool access is closer to an insider with hands on keyboard than to a breached static server. The IR playbook must therefore prioritize **stopping ongoing action** before investigation, and the platform must expose the controls to do so instantly.

The playbook has four phases. **Detect**: telemetry signals—guardrail-block spikes, autonomy-boundary violations, anomalous tool sequences, provenance-taint alerts—trigger the incident. **Quarantine**: immediately revoke the agent's credentials and tokens, freeze its NHI, and cut its tool access, halting further action; this is why short-lived, centrally-revocable identities (SPIFFE/SPIRE) matter operationally, not just architecturally. **Rollback**: reverse the compensable actions the agent took using the non-repudiation log (22.3.1) as the authoritative action list, and honor idempotency tokens so reversals do not double-apply. **Post-mortem**: reconstruct the full trajectory from the immutable log, identify root cause (often tainted provenance flowing into a privileged action), and feed findings back into boundaries, evals, and policy.

```
 DETECT ─────────────► QUARANTINE ────────────► ROLLBACK ──────────► POST-MORTEM
 guardrail spike        revoke NHI creds          reverse compensable   reconstruct
 boundary violation     freeze SPIFFE SVID        actions via action    trajectory
 taint-in-action        cut tool grants           log + idempotency     from WORM log
 anomalous sequence     kill sandbox pool         keys                  ─────┐
        │                     │                        │                     │
        └── alert Board ◄──────┴── open incident ◄──────┴─────────────────────┘
                                                     feed root cause into
                                                     boundaries / evals / policy
```

The quarantine control is the one to build first and test regularly: a documented, single-command (or single-API) action that revokes an agent's identity and severs tool access enterprise-wide in seconds. Rehearse it—an untested kill switch is not a control. Rollback capability depends on design decisions made long before the incident: side-effecting tools must be reversible or compensable where feasible, must enforce idempotency, and must write to the action log *before* executing so that even actions that fail mid-flight are recoverable. The post-mortem's output is not blame but control improvement: every incident should tighten an autonomy boundary, add a red-team case, or close an evidence gap—closing the loop back to the RMF **Manage** function.

---

## Technical Chapter Summary

- Governance is an engineering problem: every regulatory obligation—NIST AI RMF, EU AI Act, ISO/IEC 42001—must decompose into a **control-to-evidence mapping** where each obligation resolves to a machine-generated, timestamped, immutable artifact. A control that emits no runtime evidence does not exist for audit purposes.
- The EU AI Act's lifetime-logging obligation, the ISO 42001 logging control, and non-repudiation for autonomous actions are satisfied by a single, hash-chained, append-only **action log** built at the gateway and tagged with the obligations each entry serves.
- Data-subject **erasure** in agentic systems must cascade across vector stores, prompt caches, episodic logs, and retrieval indexes—not just primary databases—and must produce a signed erasure receipt; keep personal data in retrieval layers so erasure stays a data operation, never a retraining project.
- HITL checkpoints route on **reversibility, blast radius, and provenance taint**, enforced at the action gate in deterministic code—never in the prompt—because prompt-level approval rules are defeatable by the same injection that caused the action.
- Operator fatigue is a security failure with structural countermeasures: risk-ranked queues, batching, forced-context UIs, and measured approval quality (dwell time, decoy catch rate); a degraded human control must raise an alert like any failing control.
- Approval interfaces must break channel coupling: render the action from the **structured object** over an **out-of-band** channel, require **step-up (WebAuthn) auth**, and bind execution to a signed receipt whose digest must equal the executed action's digest, defeating approve-then-swap hijacks.
- Autonomy boundaries and **blast-radius limits** are written policy enforced as Rego/Cedar at the privileged gate; quantitative caps bound worst-case damage independent of whether a specific attack was foreseen, and tainted provenance vetoes high-consequence actions.
- Agent incident response must **stop ongoing action first**—instant NHI/SPIFFE credential revocation and tool-access severance—before investigation; rollback relies on the action log plus idempotency, and every post-mortem must tighten a boundary, add a red-team case, or close an evidence gap.
