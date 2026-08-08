# Chapter 1: Architecture Foundations of Agentic AI Systems

A static large language model is a pure function of its context window: tokens in, tokens out, no durable state, no side effects, no ability to reach outside the completion boundary. That property is exactly what made LLMs easy to reason about from a security standpoint — the blast radius of a bad output was a bad string. Agentic systems demolish that property. The moment a model is wrapped in a loop that lets it call tools, read the results, and decide what to do next, the model stops being a text generator and becomes a **control plane** that dynamically composes privileged operations against production systems. The output is no longer a string; it is an action with consequences.

This chapter builds the architectural vocabulary the rest of the book depends on. We treat an agent not as a chatbot with plugins but as a distributed system with a probabilistic scheduler at its core. That framing matters because most of the hard security problems in agentic AI are not novel cryptographic failures — they are classic distributed-systems and AppSec failures (confused deputy, taint propagation, missing authorization, non-idempotent side effects) that reappear in a topology where the routing decisions are made by a stochastic model reading attacker-influenced data.

By the end of this chapter you will be able to decompose any agent into four architectural primitives, place it on a six-level autonomy scale that predicts its attack surface, distinguish the reasoning engine from the action engine and the context manager as separately-securable components, reason about the physical deployment topology (edge, cloud, confidential enclave) and its trust implications, and map a running agent onto an enterprise trust-zone model with a defensible lifecycle and inventory. The goal is not to make agents "safe" — no single control does that — but to give you the seams along which layered controls can be attached.

We will repeatedly return to one thesis: **the attack surface of an agent is a function of its autonomy level and the trust classification of the data that flows into its planning loop.** Everything else — sandboxes, gateways, policy engines — is scaffolding built around that single information-flow problem.

---

## 1.1 Evolution from Static LLMs to Autonomous Systems

### 1.1.1 The Paradigm Shift: Perception, Planning, Action, and Memory Loops

A static LLM operates in a passive **request-response** paradigm: a prompt is tokenized, transformer layers process the sequence through self-attention, and a completion is emitted. Execution is stateless, synchronous, and bounded by a single context window. There is no persistence, no branching, no external actuation. An **agentic AI system** repurposes that same foundation model as a **reasoning engine** embedded inside a continuous, stateful control loop. The agent perceives its environment, maintains state across time, decomposes goals into multi-step plans, actuates side effects in external systems, and folds the resulting feedback back into its next decision.

```
       +-------------------------------------------------------------+
       |                         ENVIRONMENT                         |
       |  (Databases, External APIs, Browsers, Code Execution, OS)   |
       +------------------------------+------------------------------+
                                      |
                             Observation / Feedback
                                      |
                                      v
+-------------------------------------+-------------------------------------+
|                             AGENT CORE                                    |
|                                                                           |
|   +-------------------+    +-------------------+    +-----------------+   |
|   | 1. PERCEPTION     |--->| 2. PLANNING       |--->| 3. ACTION       |   |
|   | Filter, Parse &   |    | Reason, Decompose |    | Select & Invoke |   |
|   | Tag Environment   |    | & Route (LLM)     |    | Tool (API/Code) |   |
|   +-------------------+    +-------------------+    +-----------------+   |
|             ^                        |                       |            |
|             |                        v                       |            |
|   +---------+------------------------+-----------------------+--------+   |
|   | 4. MEMORY STORE (Working Scratchpad, Vector DB, Graph DB)        |   |
|   +-------------------------------------------------------------------+   |
+---------------------------------------------------------------------------+
```

Four primitives compose every agent, and each is a distinct security surface:

1. **Perception Engine.** Translates raw environmental feedback (HTTP responses, DOM subtrees, SQL result sets, error tracebacks, retrieved documents) into structured context the reasoning engine can consume. This is the primary ingress point for **indirect prompt injection**: any byte the perception engine admits into the context window is a byte that can carry adversarial instructions. Perception must sanitize, budget tokens, and — critically — attach a **trust-level tag** to every span it ingests so downstream components can reason about provenance.
2. **Planning Engine.** Uses the foundation model to compare current state against the goal and decompose objectives into sequential or parallel sub-goals, typically under a loop pattern such as ReAct, Plan-and-Solve, or Tree-of-Thoughts (see Ch. 2.1). This is where **goal drift** and **confused-deputy** conditions originate.
3. **Action Engine.** Bridges non-deterministic text generation to deterministic system actuation, translating model intent into typed function calls, API requests, shell commands, or browser events under schema and policy constraints. This is the enforcement chokepoint — the last place a control can stand between a hallucinated intent and an irreversible side effect.
4. **Memory Engine.** Manages state across time horizons, partitioned into **working memory** (the active scratchpad), **episodic memory** (trajectory logs), and **semantic memory** (retrieval-indexed knowledge). Memory is a persistence-layer injection vector: poisoned content written on Monday can steer a decision on Friday.

Treating these as four separately-owned, separately-audited components — rather than a monolithic "agent" — is the first architectural move that makes the system defensible.

---

### 1.1.2 Autonomy Taxonomies: Level 0 (Prompting) to Level 5 (Fully Autonomous Goal Execution)

To reason about risk systematically, place every deployment on a six-tier autonomy scale. As the level rises, control shifts from human-authored deterministic code toward model-driven probabilistic execution, and the security burden shifts from static AppSec review toward runtime information-flow control.

| Autonomy Level | Name | Description | Control Plane | Primary Security Boundary |
| :--- | :--- | :--- | :--- | :--- |
| **Level 0** | **Static Prompting** | Single input → single completion. No tools, no state. | Human operator | Input/output prompt guardrails |
| **Level 1** | **Chained Workflows** | Hardcoded LLM-call sequences (Prompt A → parser → Prompt B). | Deterministic code (DAG) | Static API authz & input filtering |
| **Level 2** | **Router & Tool-Calling** | Model selects from an allowlist of tools for a single turn. | Conditional branching | Schema validation & tool-level RBAC |
| **Level 3** | **Bounded Autonomous Trajectory** | Multi-step loop; the model plans and calls tools until a stop condition. | State machine / graph | Runtime policy gateways & HITL |
| **Level 4** | **Multi-Agent Swarms** | Agents delegate sub-goals to specialized sub-agents over A2A/ACP. | Distributed agent mesh | Non-human identity & SPIFFE attestation |
| **Level 5** | **Fully Autonomous Execution** | Open-ended goals, self-assembling tools and sub-agents. | Self-mutating control graph | Information-flow control & hardware enclaves |

The inflection point that every architect must internalize is the transition **from Level 2 to Level 3**. At Level 2, the model makes exactly one routing decision, its inputs are the (relatively trusted) user turn, and a human sees the result before the next call — this is auditable with conventional AppSec. At Level 3 the loop closes: the output of step $N$ (for example, untrusted web content returned by a search tool) becomes part of the planning context for step $N+1$ (for example, a decision to invoke a database-write tool). The attacker no longer has to compromise the user; they only have to compromise a document the agent will read. This is where **taint propagation** stops being a code-review nicety and becomes the central design constraint. At Level 4 the problem compounds again: each sub-agent is a non-human principal that can act as a confused deputy for every other agent, so identity and least-privilege delegation (Ch. 7, Ch. 8) dominate. Autonomy level is therefore not a maturity badge — it is the single best predictor of the controls a deployment requires.

Because the level dictates the control set, it also dictates the *review* posture. Use this mapping to decide how much assurance work a given deployment actually needs — over-controlling a Level 1 workflow wastes review capacity that a Level 4 swarm urgently needs:

| Level | Required identity model | Minimum runtime control | Failure blast radius | Review depth |
| :--- | :--- | :--- | :--- | :--- |
| 0–1 | Application service account | Input/output filtering | Bad response to one user | Standard AppSec review |
| 2 | Service account with per-tool RBAC | Schema validation at the tool boundary | One unauthorized tool call | AppSec + tool-scope review |
| 3 | Short-lived, task-scoped tokens (RFC 8693) | Policy gateway on every side-effecting call; HITL on irreversible ones | Full authority of the agent's toolset | Threat model + trajectory review |
| 4 | Per-agent workload identity (SPIFFE SVID), mTLS | Cross-agent authorization + taint propagation | Transitive authority of the whole mesh | Threat model + delegation-graph review |
| 5 | Attested identity plus hardware root of trust | Information-flow control; capability confinement | Undefined by construction | Not deployable without containment proof |

Level 5 is included for completeness, not endorsement: an agent that can assemble its own tools and sub-agents has an attack surface you cannot enumerate in advance, which is precisely why the row's blast radius is "undefined."

---

### 1.1.3 Deterministic Software Engineering vs. Non-Deterministic Agent Trajectories

Traditional software offers **deterministic guarantees**: given input $I$ and state $S$, a function $f(I, S)$ yields output $O$ with probability $P = 1$. Verification reduces to asserting properties over pure functions and enumerable branches. Agentic systems operate under **stochastic non-determinism**: the model samples the next token from a distribution $P(T_n \mid T_1, \dots, T_{n-1})$. Identical inputs under identical state can produce different trajectories because of sampling temperature ($\text{temperature} > 0$), floating-point non-associativity in parallel GPU reductions, speculative decoding, and variable tool latencies that reorder concurrent branches.

```python
# Deterministic execution: one input, one path, one outcome.
def cancel_last_order(order_id: str, user_id: str) -> bool:
    order = db.get_order(order_id)
    if order.user_id != user_id:
        raise PermissionError("unauthorized")
    return db.update_status(order_id, "CANCELLED")

# Agentic execution: the *path* to "cancel the user's last order" is sampled.
#   Trajectory A: search_orders -> resolve_id -> verify_owner -> cancel_api
#   Trajectory B: sql_query(raw) -> refund_tool -> send_email -> cancel_api
# Both may satisfy the goal; only one respects the authorization invariant.
```

The security consequences are structural, not incidental:

1. **State-space explosion.** The set of reachable states cannot be enumerated at build time, so static path analysis and exhaustive test coverage no longer bound behavior. Assurance shifts to **runtime state validation** — policy checks evaluated on every transition rather than proven once at compile time.
2. **Trajectory drift.** Over long chains, initial constraints can be crowded out of the context window or semantically overridden by intermediate tool output, so a policy stated in the system prompt is not a durable invariant unless it is re-enforced structurally on each step.
3. **Non-idempotent side effects.** Because agents retry stochastically and may revisit a step after a crash or replan, every side-effecting tool must enforce **exactly-once semantics** via idempotency keys (Ch. 2.4.1) rather than assuming a step runs at most once.

The practical takeaway: you cannot test an agent to safety the way you test a pure function. You constrain it — with typed action schemas, runtime policy gates, and provenance tracking — so that whatever trajectory the model samples, the reachable set of *effects* stays inside a bounded, authorized region.

---

## 1.2 Core Infrastructure Components of Modern AI Agents

### 1.2.1 The Reasoning Engine: Foundation Models, SLMs, and Reasoning/Test-Time Compute Budgets

The reasoning engine is the agent's decision core, but "the model" is not one homogeneous thing. Production systems mix **frontier foundation models** for hard planning, **small language models (SLMs)** for cheap high-frequency steps (classification, extraction, formatting), and **test-time compute (TTC)** reasoning models that spend extra tokens on internal search before emitting an answer.

```
   [ Standard inference ]
   input --> transformer layers --> immediate token stream

   [ Test-time-compute reasoning model ]
   input --> hidden chain-of-thought --> verification/search --> final output
             (extra token budget spent on internal planning)
```

TTC changes the economics and the threat model simultaneously. Reasoning quality scales with tokens spent searching candidate paths (often guided by a process reward model or tree search), so the per-turn latency and cost budget becomes:

$$\text{Turn Budget} = T_{\text{reason}} \cdot \tau_{\text{token}} + \sum_{k=1}^{M} T_{\text{tool}_k}$$

Two controls follow directly. First, **denial-of-wallet** defense: an unbounded reasoning loop can silently burn thousands of hidden tokens per step, so the gateway must cap $T_{\text{reason}}$ per turn and per trajectory, not just cap the number of tool calls. Second, **chain-of-thought confidentiality**: hidden reasoning frequently restates system instructions, credential fragments, and internal tool schemas. Exposing raw CoT to end users or logging it into a lower-trust store is an exfiltration path; CoT must be treated as a Level-0 trust artifact and redacted or access-controlled like the system prompt itself.

The choice of model per step is also a security lever. A cheap SLM given only extraction duties and no tool-calling authority has a far smaller blast radius than a frontier model wired to a broad tool belt. Architecturally, prefer to route the *authority* to call side-effecting tools to a small number of well-audited, low-temperature reasoning steps, and route the high-volume perception and summarization work to SLMs that have no action authority at all (Ch. 3.1.3 develops the routing mechanics).

---

### 1.2.2 The Action Engine: Tool Binding, Function Calling Schemas, and Environment Actuators

The action engine converts natural-language intent into structured, validated invocations. Its job is to be the **deterministic firewall** in front of a non-deterministic caller. Every tool exposes a typed schema; the engine binds model output to that schema, rejects anything malformed, and only then evaluates policy.

```python
from pydantic import BaseModel, Field
from typing import Literal

class DatabaseQueryTool(BaseModel):
    """Contract enforced by the action engine before any execution."""
    query_type: Literal["SELECT"] = Field(..., description="Read-only operations only.")
    table_name: str = Field(..., pattern=r"^[a-zA-Z0-9_]+$")
    filter_clause: str = Field(..., description="WHERE clause; parameterized downstream.")
    limit: int = Field(default=50, le=100, description="Cap rows to bound context bloat.")
```

The engine's pipeline stages are individually securable, and each stage is a place to fail closed:

```
[ model-generated JSON ]
          |
          v
[ 1. syntax parse ]      --> parse error? return to model for self-repair
          |
          v
[ 2. schema validate ]   --> type/constraint violation? block + log
          |
          v
[ 3. policy gate ]       --> OPA/Rego or Cedar decision? deny -> alert
          |
          v
[ 4. execution sandbox ] --> Firecracker / gVisor / WASI isolation
```

Three design rules make the difference between a real control and a decorative one. First, the schema is an **allowlist of capability, not just of syntax** — narrow the enum, bound the integers, constrain the regex, so a compromised planner cannot smuggle a `DROP` through a field typed as `Literal["SELECT"]`. Second, the policy gate (stage 3) must evaluate **provenance**, not just parameters: a call whose arguments were derived from tainted tool output should be treated differently from one derived from an authenticated user turn — this is where the trust tags from perception pay off. Third, actuation happens inside an isolation boundary (Firecracker microVMs, gVisor, or WASI) so that even an authorized-but-malicious tool invocation cannot pivot into the host. The action engine is the single most valuable place to invest defensive effort, because it is the only component that sits on the critical path between every intent and every effect.

---

### 1.2.3 Context Window Management: State Persistence, Token Budgeting, and Sliding Buffers

The context window is the agent's scarcest resource and its most sensitive one, because it is simultaneously the working memory and the trust boundary. A context manager that naively appends tool output until it overflows will evict the system prompt first — **system-instruction eviction** is a leading cause of silent safety degradation over long trajectories.

```
+-------------------------------------------------------------------+
| System instructions & core policy   (PROTECTED)   |  ~20% budget  |
+-------------------------------------------------------------------+
| Episodic memory / user profile                    |  ~15% budget  |
+-------------------------------------------------------------------+
| Retrieved evidence / tool output    (UNTRUSTED)   |  ~40% budget  |
+-------------------------------------------------------------------+
| Active conversation & scratchpad                  |  ~20% budget  |
+-------------------------------------------------------------------+
| Generation reserve                                |   ~5% budget  |
+-------------------------------------------------------------------+
```

Let $C_{\max}$ be the window capacity. The active footprint at step $t$ must satisfy:

$$C_{\text{active}}(t) = T_{\text{sys}} + T_{\text{mem}} + \sum_{i=1}^{k} T_{\text{tool}_i} + \sum_{j=1}^{m} T_{\text{turn}_j} \le C_{\max} - T_{\text{reserve}}$$

When $C_{\text{active}}(t)$ crosses a threshold, the manager performs **provenance-aware compression** rather than blind truncation: summarize old conversational turns with a cheap SLM, evict the lowest-relevance retrieved documents by vector distance, and *never* compress, summarize, or reorder the system-instruction span $T_{\text{sys}}$. Two further practices matter for security. First, keep the untrusted retrieved-evidence region **structurally delimited and labeled** (for example with spotlighting markers) so the model — and any downstream guardrail — can tell trusted policy from tainted data even after compression. Second, treat any state that is persisted between turns (episodic memory, summaries) as a write surface that must be integrity-checked on read, because a summary generated from injected content becomes a durable, higher-trust-looking artifact on the next turn. Context management is not plumbing; it is the mechanism that keeps the trust hierarchy intact as the window churns.

---

## 1.3 Enterprise Deployment Topologies

### 1.3.1 Edge, Client-Side, and Cloud-Native Agent Runtimes

Where the agent physically runs determines who can observe its memory, who can tamper with its tools, and how identity is established. Three canonical topologies dominate, each with a different trust posture.

```
+-----------------------------------------------------------------------------------+
|                               DEPLOYMENT TOPOLOGIES                                |
+--------------------------+--------------------------+-----------------------------+
| 1. Client / Edge Runtime | 2. Cloud Gateway Hybrid  | 3. Confidential Enclave     |
| (mobile / local SLM)     | (microservice mesh)      | (confidential GPU compute)  |
|                          |                          |                             |
| [On-device SLM]          | [Client UI]              | [Zero-trust ingress]        |
|       |                  |      | HTTPS / gRPC      |      |                      |
|       v                  |      v                   |      v                      |
| [Local tool API]         | [Agent gateway]          | [Hardware TEE enclave]      |
|                          |      |                   |   - host isolation          |
| Low latency, data-local  |      v                   |   - sealed memory           |
| Limited model capability | [Serverless executor]    |   - attested audit          |
+--------------------------+--------------------------+-----------------------------+
```

The **client/edge runtime** keeps data on device — attractive for privacy and latency — but the client is fully attacker-controlled: local tool bindings, model weights, and the scratchpad can all be tampered with, so nothing the edge agent asserts can be trusted server-side without independent verification. The **cloud gateway hybrid** is the enterprise default: a thin client speaks to an **agent gateway** that centralizes authentication, policy, rate limiting, and observability before dispatching to stateless serverless executors. This topology gives you one chokepoint to instrument, which is exactly why the gateway becomes the highest-value target and must itself be hardened. The **confidential enclave** runs inference and orchestration inside a hardware TEE (Ch. 3.4) so that even the cloud operator cannot read decrypted context — necessary for regulated workloads, expensive in engineering and compute. The architectural rule: identity and policy decisions belong on the server side of a trust boundary you control, never on a runtime the user or an untrusted network can rewrite.

---

### 1.3.2 Stateful Infrastructure: Vector Databases, Graph Stores, and Event Brokers

An agent is only as stateless as the stores behind it, and those stores are first-class parts of the attack surface. Enterprise agent topologies rely on three persistence layers, each with a distinct poisoning and exfiltration profile.

| Store | Role (memory type) | Examples | Primary risk |
| :--- | :--- | :--- | :--- |
| **Vector DB** | Semantic memory: embeddings of docs, tool descriptions, session summaries | Qdrant, Pinecone, pgvector | RAG poisoning; embedding-space collisions; unfiltered cross-tenant recall |
| **Graph DB** | Relational memory: org hierarchy, entitlements, entity links | Neo4j, Neptune | Authorization data used as ground truth without integrity checks |
| **Event broker** | Agent bus: async events, telemetry spans, inter-agent messages | Kafka, NATS | Message spoofing between agents; replay; unbounded fan-out |

The security lesson is that these are not passive caches — they are inputs to the planning loop. A document written into the **vector database** by a low-trust ingestion path can be retrieved months later and injected into a high-trust agent's context (a stored, deferred **indirect prompt injection**); the fix is provenance metadata on every vector and trust-aware retrieval filters, not just relevance ranking. A **graph store** that encodes "who may approve what" must be integrity-protected, because an agent that reads entitlements from a tampered graph becomes a confused deputy with a paper trail that looks legitimate. An **event broker** connecting multiple agents needs authenticated, authorized producers and consumers (workload identity, Ch. 7) or any compromised agent can inject tasks into its peers. Treat every stateful backend as an untrusted-until-verified source when its contents flow back into a model's decision.

---

### 1.3.3 Defining Security Boundaries in Non-Deterministic Application Topologies

In a conventional web architecture the perimeter separates the untrusted internet from trusted internal services, and requests cross it through a small number of authenticated, well-typed endpoints. Agentic topologies break that model because **the agent's own context window is an untrusted boundary that sits inside the trusted zone**. Data crosses from untrusted to trusted not through a typed API but through natural language the model then acts upon.

```
[ UNTRUSTED INTERNET ] ---> [ web-search tool ]
                                  |
                                  v  (tainted payloads / indirect injection)
                           [ AGENT CONTEXT WINDOW ]  <=== CRITICAL BOUNDARY
                                  |
                                  v  (model reads tainted data, decides to act)
                           [ action-engine policy gate ]
                                  |
                                  v  (only sanitized, authorized effects pass)
[ TRUSTED ENTERPRISE DB ] <-------+
```

The controlling principle is **zero-trust input classification**: any span originating from an external tool — web page, email, PDF, third-party API, even an internal database whose rows accept user input — is classified as tainted **data-in-flight** and is forbidden from directly parameterizing a privileged action without passing the policy gate. Concretely, this means the boundary is enforced at the action engine, not at the model: you cannot rely on the model to "know" that a retrieved instruction is untrusted, because reliably distinguishing data from instructions inside a single token stream is the unsolved core of prompt injection. Instead you attach provenance at ingress (perception), carry it through the context (spotlighting/labeling), and evaluate it at egress (policy gate) — turning a language problem the model cannot solve into an information-flow problem the architecture can partially constrain. Later chapters formalize these partial mitigations (CaMeL-style capability IFC, Dual-LLM, Plan-Then-Execute); here the point is that the boundary exists and it is inside the process, not at the network edge.

---

## 1.4 The Agent Lifecycle and Enterprise Inventory

### 1.4.1 Build, Register, Deploy, Operate, Retire: The Agent Lifecycle Model

An agent is a deployable artifact with an identity and a set of entitlements, so it needs the same lifecycle rigor as any privileged service — plus provenance for its prompts and tools. Five stages structure the governance.

```
[ 1. BUILD ] --> [ 2. REGISTER ] --> [ 3. DEPLOY ] --> [ 4. OPERATE ] --> [ 5. RETIRE ]
prompt/tool      cryptographic       canary /          telemetry &        revoke identity
versioning       inventory + BOM     sandbox spin-up    policy monitoring   & archive logs
```

1. **Build.** System prompts, tool schemas, and the state graph are code; they belong in version control, are code-reviewed, and are pinned to specific model and dependency versions. A prompt change is a production change and must go through the same pipeline as a code change.
2. **Register.** The agent receives a unique **non-human identity (NHI)** — ideally a SPIFFE identity issued by SPIRE — is entered into the enterprise agent catalog, and is issued an **AI-BOM** (CycloneDX) enumerating its model, adapters, tools, and data dependencies. Registration is the hook that later enables discovery, revocation, and audit.
3. **Deploy.** The agent lands in an isolated runtime with least-privilege tool access, its credentials scoped to exactly the resources its BOM declares. Canary and shadow deployments catch behavioral regressions before full rollout.
4. **Operate.** Runtime observability (OpenTelemetry GenAI conventions) tracks token spend, tool error rates, policy-gate denials, and trajectory anomalies, feeding the detection signals used throughout Parts II–III.
5. **Retire.** On decommission, the NHI, OAuth grants, and every tool entitlement are revoked immediately, and trajectory logs are archived for forensics. Orphaned agent credentials are a standing privilege-escalation risk; retirement must be as disciplined as deprovisioning a departed employee.

The lifecycle is what turns "we have some agents running" into an auditable, revocable, inventoried fleet.

---

### 1.4.2 Agent Inventory, Ownership, and the "Shadow AI" Discovery Problem

You cannot secure what you cannot see. The fastest-growing risk in most enterprises is **shadow AI**: developer scripts, notebooks, SaaS integrations, and personal automations that call external LLM APIs and bind tools without ever passing through registration. Each is an unowned, unmonitored Level-2+ agent with real credentials.

```python
from pydantic import BaseModel, HttpUrl
from typing import List, Literal

class AgentInventoryRecord(BaseModel):
    """One row in the enterprise agent catalog (the agent's BOM header)."""
    agent_id: str                       # stable UUID
    agent_name: str
    owner_email: str                    # a human is accountable, always
    autonomy_level: int                 # 0..5, drives required controls
    assigned_spiffe_id: str             # e.g. spiffe://prod.acme.com/agent/finance-bot-42
    allowed_tools: List[str]            # least-privilege tool allowlist
    max_token_budget_per_run: int       # denial-of-wallet cap
    data_classification_limit: Literal["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]
    endpoint_url: HttpUrl
```

Discovery is a defense-in-depth problem, not a single scan. Network-level **egress proxies** flag outbound traffic carrying known LLM-provider API signatures and correlate it against the registered inventory; CI/CD and secret-scanning pipelines catch model API keys checked into repositories; cloud posture tooling surfaces IAM principals whose call patterns match agent behavior. Every discovered agent must be assigned a **human owner** — accountability cannot be delegated to the agent itself — and either registered or shut down. Two governance rules keep the inventory honest: an agent with no `owner_email` is decommissioned by default, and an agent's live entitlements are periodically reconciled against its declared `allowed_tools` so that scope creep (an agent that quietly gained a new credential) is detected as drift. Inventory is the substrate every other control depends on; without it, least privilege, revocation, and incident response are all guesswork.

---

### 1.4.3 Trust Zones: Mapping Agents Onto Existing Enterprise Security Architecture

The final architectural move is to place agent components onto the enterprise's existing zoned network model so that a compromise in the probabilistic reasoning core cannot cascade into privileged systems. Agents do not need a new security model; they need to be decomposed and mapped onto the one you already run, with the reasoning loop treated as a semi-trusted DMZ.

```
+-----------------------------------------------------------------------------------+
|                         ENTERPRISE AGENT TRUST ZONES                              |
+-----------------------------------------------------------------------------------+
| ZONE 0: UNTRUSTED EXTERNAL                                                        |
| - external web APIs, public pages, inbound customer email/PDFs                    |
+-----------------------------------------------------------------------------------+
                                   [ egress/ingress proxy ]
                                          |
+-----------------------------------------------------------------------------------+
| ZONE 1: PERCEPTION & REASONING DMZ                                                |
| - LLM inference runtimes, isolated scratchpads/context managers                   |
| - input/output guardrail engines   (assume this zone is injectable)              |
+-----------------------------------------------------------------------------------+
                                   [ policy authorization gate ]
                                          |
+-----------------------------------------------------------------------------------+
| ZONE 2: RESTRICTED TOOL EXECUTION                                                 |
| - Firecracker/gVisor sandboxes, read-only DB replicas, scoped API clients         |
+-----------------------------------------------------------------------------------+
                                   [ step-up auth / human approval (HITL) ]
                                          |
+-----------------------------------------------------------------------------------+
| ZONE 3: CRITICAL CORE                                                             |
| - production financial systems, master DBs, identity providers                    |
+-----------------------------------------------------------------------------------+
```

The design intent is explicit: **assume Zone 1 will be compromised** by prompt injection and build the controls that keep that compromise from reaching Zone 3. Between every zone sits a mediation control that does not trust the model's judgment — a policy gate between reasoning and tools, a step-up-authentication or human-in-the-loop checkpoint between routine tools and critical systems. High-impact, irreversible actions (moving money, changing IAM, deleting data) are gated at the Zone 2→3 boundary by controls that require a signal the model cannot forge, such as a fresh human approval bound to the specific request. Mapping agents onto zones this way lets you reuse decades of network-segmentation, IAM, and change-control machinery, and it reframes "securing the agent" as the tractable problem of **bounding what effects can cross each boundary** rather than the intractable problem of making a stochastic model behave perfectly.

---

## Technical Chapter Summary

- An agent is a distributed system with a probabilistic scheduler: decompose it into four separately-securable primitives — **perception, planning, action, memory** — and most agent security problems reduce to classic AppSec and distributed-systems failures (confused deputy, taint propagation, non-idempotent side effects) reappearing in that topology.
- The **six-level autonomy taxonomy** predicts required controls; the **Level 2→3 transition** is the critical inflection, because closing the loop lets attacker-controlled tool output become planning context, turning taint propagation into the central design constraint, and **Level 4** adds non-human-identity delegation risk.
- Non-determinism is structural, not incidental: you cannot test an agent to safety, so assurance shifts from static path analysis to **runtime state validation**, typed action schemas, and exactly-once side-effect semantics that bound the reachable set of *effects* regardless of the sampled trajectory.
- The **reasoning engine, action engine, and context manager** are distinct controls: route action authority to a few audited low-temperature steps, make the action engine the deterministic policy chokepoint in front of a sandbox, and use provenance-aware context management to keep the trust hierarchy intact as the window churns.
- Deployment topology sets the trust posture — edge runtimes are attacker-controlled, the cloud gateway is the enterprise chokepoint and prime target, and confidential enclaves protect against the operator — while vector, graph, and event stores are active inputs to the planning loop and therefore poisoning and exfiltration surfaces.
- The agent's **context window is an untrusted boundary inside the trusted zone**; because the model cannot reliably separate instructions from tainted data, the boundary must be enforced by information-flow controls (provenance at ingress, labeling in context, policy at egress), not by asking the model to police itself.
- Governance rests on a five-stage **lifecycle** (build/register/deploy/operate/retire), a mandatory **inventory** with a human owner and AI-BOM per agent, active **shadow-AI discovery**, and mapping agents onto enterprise **trust zones** so an injected Zone-1 reasoning core cannot cascade into Zone-3 critical systems without crossing a control the model cannot forge.
