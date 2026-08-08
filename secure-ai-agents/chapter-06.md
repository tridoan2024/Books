# Chapter 6: Multi-Agent Systems, Interoperability & Distributed Orchestration

A single agent is a control loop; a multi-agent system is a distributed system, and it inherits every hard problem that phrase implies — partial failure, message ordering, consensus, deadlock, latency amplification, and shared-state contention — with one novel and destabilizing addition: the nodes are non-deterministic and can be steered by their inputs. The moment you decompose a task across specialized agents that delegate to one another, you have built a network whose routing decisions are made by probabilistic reasoning engines, whose messages carry natural-language instructions that double as potential injection payloads, and whose topology can rewire itself at runtime as agents discover and recruit new peers.

The appeal is real. Specialization lets a lead architect agent coordinate domain experts — a SQL agent, a browser agent, a code-execution agent — each with a narrow toolset and tight system prompt, which is both more capable and more auditable than one monolithic agent juggling forty tools. Parallelism lets independent sub-tasks run concurrently. And open interoperability standards promise that agents built by different teams, on different frameworks, in different trust domains, can collaborate through published contracts rather than bespoke glue. But every one of these benefits is also an attack-surface multiplier: more identities to authenticate, more messages to authorize, more trust boundaries to cross, and more ways for a cascading failure — or a cascading injection — to propagate.

This chapter treats multi-agent systems as the distributed systems they are. We start with communication: message-passing topologies, structured envelope formats, and consensus mechanics (voting, debate, adversarial verification). We survey the 2025–2026 interoperability standards — A2A, ACP, AGNTCY — and the clean mental model that separates MCP (agent→tool, vertical) from A2A (agent→agent, horizontal). We cover collaborative execution — hierarchical swarms, peer-to-peer delegation, and the underappreciated problem of stateful workflow persistence. We close with the distributed-systems challenges that determine whether an agent network is operable at all: latency and token-cost amplification, distributed locking, and deadlock detection in autonomous delegation loops.

---

## 6.1 Multi-Agent Communication Protocols

### 6.1.1 Message Passing Topologies: Broadcast, Router-Peer, and Blackboard Architectures

The topology of an agent network — the graph of who can send messages to whom — is the single biggest determinant of its cost, latency, failure modes, and security posture. Three canonical patterns recur, and most real systems are hybrids of them.

**Broadcast** (all-to-all) has every agent publish to a shared bus that every other agent receives. It maximizes information sharing and is trivial to implement over a pub/sub substrate, but message volume grows as $O(n^2)$ in the number of agents, context windows fill with chatter irrelevant to each recipient, and there is no natural authorization chokepoint — every agent hears everything, which is a confidentiality and injection nightmare at scale. **Router-peer** (star/hub) routes all messages through a central coordinator that decides which agent handles what; message complexity drops to $O(n)$, the router is a natural policy-enforcement and audit point, and specialization is clean — but the router is a single point of failure and a bottleneck, and it concentrates trust. **Blackboard** decouples agents entirely: they read from and write to a shared structured workspace rather than messaging each other directly, coordinating through state rather than conversation, which suits open-ended problem-solving but makes the blackboard a contended shared resource requiring the locking of §6.4.2.

```
   BROADCAST (mesh)          ROUTER-PEER (hub)           BLACKBOARD (shared state)
      A --- B                    A   B   C                 A     B     C
      | \ / |                     \  |  /                   \    |    /
      |  X  |                      \ | /                     v   v   v
      | / \ |                     +--+--+                  +-----------+
      C --- D                     |ROUTR|                  | BLACKBOARD|
   O(n^2) msgs,                   +--+--+                  |  (state)  |
   no chokepoint                 O(n), SPOF               +-----------+
                              central policy point       contended resource
```

The comparison below frames the engineering trade-off.

| Topology | Msg Complexity | Policy Chokepoint | Failure Mode | Best For |
| :--- | :--- | :--- | :--- | :--- |
| Broadcast | O(n²) | None (weak) | Context flooding, injection spread | Small trusted teams |
| Router-peer | O(n) | Central (strong) | Router SPOF/bottleneck | Coordinated specialization |
| Blackboard | O(n) writes | The blackboard ACL | State contention, races | Open-ended problem solving |

From a security standpoint the router-peer topology is usually the right default for enterprise systems precisely because it gives you one place to authenticate senders, authorize message flows, and log the full conversation — the multi-agent analogue of an API gateway. Broadcast should be reserved for small, mutually-trusting agent sets, because it has no natural boundary at which to stop a malicious or compromised agent from influencing every other agent in one message.

---

### 6.1.2 Inter-Agent Protocol Formats: Structured JSON Envelopes and Semantic Negotiation

Agents cannot safely collaborate by exchanging raw natural-language strings — that is a plaintext injection channel with no sender authentication, no schema, and no way to separate the message's *content* from its *control metadata*. Mature multi-agent systems wrap every message in a **structured JSON envelope** that carries routing, identity, correlation, and trust metadata around an explicitly-typed payload, exactly as a well-designed RPC or messaging system does.

A minimal but production-shaped envelope separates the fields the infrastructure needs (sender/recipient identity, message id, correlation id for request/response matching, conversation id for threading, timestamp, and a signature) from the semantic payload:

```json
{
  "envelope": {
    "msg_id": "m_9f2c",
    "conversation_id": "c_4471",
    "in_reply_to": "m_9f2b",
    "sender": { "agent_id": "sql-agent", "spiffe_id": "spiffe://corp/agent/sql" },
    "recipient": { "agent_id": "orchestrator" },
    "timestamp": "2026-01-14T09:12:03Z",
    "trust_domain": "internal",
    "signature": "base64(jws-detached)"
  },
  "performative": "inform",
  "payload": {
    "schema": "query_result.v1",
    "content": { "rows": 3, "status": "ok" }
  }
}
```

The `performative` field encodes the *speech act* — a lineage that runs back through FIPA-ACL to speech-act theory — distinguishing `request`, `inform`, `propose`, `accept`, `reject`, `query`, and `failure`. This matters because it lets the receiving agent (and the policy layer) reason about a message's intent structurally rather than parsing it out of prose: a `request` may trigger an action and requires authorization, an `inform` updates state, a `propose` enters a negotiation. **Semantic negotiation** is the process by which agents that do not share a fixed schema converge on a mutually-understood one — agreeing on the meaning of `content` fields, units, and vocabularies before exchanging data — either by referencing shared ontologies/schema registries or by an explicit negotiation handshake.

The security payoff of envelopes is concrete. The `signature` over the envelope (a JWS keyed to the sender's workload identity — SPIFFE/SPIRE, see Ch. 1.2) authenticates the sender and detects tampering, so a receiver can verify *who* sent a message before acting on it. Separating envelope metadata from payload lets the payload's trust level be tracked (Ch. 5.4) independently of routing metadata, and typed payloads with a `schema` reference let the receiver validate structure before content reaches the model — turning "an agent said something" into "a verified sender made a typed, authorized assertion," the difference between a chat room and a system.

---

### 6.1.3 Consensus Mechanics: Multi-Agent Voting, Debate, and Adversarial Verification

When a decision is high-stakes or a single agent's output is unreliable, multi-agent systems reach for **consensus** — using multiple agents to produce a more robust result than any one alone. This is not the Byzantine fault tolerance of distributed databases (though it borrows the vocabulary); it is a set of patterns for improving decision quality and catching individual-agent errors, including errors induced by injection.

**Voting** (ensemble) runs the same task through *N* independent agents — ideally with diversity in model, prompt, or tooling — and aggregates by majority or weighted vote. It is embarrassingly parallel and effective against random errors and single-agent injection (a payload that fools one agent rarely fools a diverse majority), but it multiplies cost *N*-fold and provides no defense against a systematic bias all agents share. **Debate** has agents argue opposing positions across several rounds, critiquing each other's reasoning, with a judge (agent or human) ruling — surfacing flaws that no single agent would self-identify. **Adversarial verification** pairs a *generator* agent with a dedicated *critic/verifier* agent whose sole job is to find faults, security violations, or unsupported claims in the generator's output before it is accepted; this red-team/blue-team split is especially valuable as a security control because the verifier can be a hardened, minimally-privileged agent specifically prompted to detect policy violations.

| Mechanism | Robustness Gain | Cost | Blind Spot | Security Use |
| :--- | :--- | :--- | :--- | :--- |
| Voting (ensemble) | Random & single-agent errors | N× per decision | Shared systematic bias | Injection resistance via diversity |
| Debate | Reasoning flaws, overconfidence | Rounds × agents | Judge capture | Surfacing hidden assumptions |
| Adversarial verification | Targeted fault/violation detection | 2× (gen + critic) | Critic collusion/blindness | Policy/output gating |

The critical security caveat is that consensus among agents that share a model, a prompt, or a context is largely illusory: a prompt injection in a shared context poisons every participant identically, and a systematic model bias is unanimous. Diversity — different models, independently-constructed contexts, isolated trust domains — is what makes consensus a genuine control rather than theater. And consensus is a decision-quality mechanism, not an authorization mechanism: a unanimous vote to perform a destructive action still passes through the same policy gate as a single agent's request. Never let "the agents agreed" substitute for "the action was authorized."

---

## 6.2 Open Interoperability Standards (2025–2026)

### 6.2.1 Agent2Agent (A2A): Agent Cards, Task Objects, and Capability Discovery

**Agent2Agent (A2A)** is the open standard for agent-to-agent interoperability — the horizontal counterpart to MCP's vertical agent-to-tool integration. Its premise is that agents built by different vendors and teams need to discover each other, understand each other's capabilities, and delegate tasks across organizational and framework boundaries without pre-negotiated point-to-point integrations. A2A models the remote agent as an opaque peer exposing a capability contract, not as a tool whose internals you control.

Discovery centers on the **Agent Card**: a JSON document, conventionally served at a well-known URL, that advertises an agent's identity, endpoint, capabilities/skills, supported input/output modalities, and — importantly for security — its authentication requirements. A client agent fetches the card, decides whether the peer can do what it needs, and learns how to authenticate to it.

```json
{
  "name": "Financial Research Agent",
  "description": "Performs equity research and generates analyst summaries.",
  "url": "https://agents.example.com/finance",
  "version": "1.4.0",
  "provider": { "organization": "Example Capital" },
  "capabilities": { "streaming": true, "pushNotifications": true },
  "defaultInputModes": ["text/plain", "application/json"],
  "defaultOutputModes": ["application/json"],
  "securitySchemes": {
    "oauth2": { "type": "oauth2", "flows": { "clientCredentials": {
      "tokenUrl": "https://auth.example.com/token", "scopes": { "research.read": "..." } } } }
  },
  "skills": [
    { "id": "equity-summary", "name": "Equity Summary",
      "description": "Summarize an equity's recent filings and price action.",
      "tags": ["finance", "research"], "inputModes": ["text/plain"] }
  ]
}
```

Work is exchanged as **Task objects**: a client sends a task (a message plus parameters), and the remote agent returns a task with a lifecycle state (`submitted`, `working`, `input-required`, `completed`, `failed`, `canceled`), streaming intermediate updates over SSE and emitting **artifacts** (produced outputs) and **messages** (conversational turns). This task-centric, asynchronous model is deliberate: agent work is long-running and may pause for input, so A2A treats a delegation as a stateful job with a handle, not a synchronous call. **Capability discovery** is the Agent Card plus runtime-negotiated modalities per task. The security consequences are large: an Agent Card is fetched from a remote party and is untrusted content whose skill descriptions must not be blindly trusted (they are prompts), and the `securitySchemes` block is what lets a client obtain a correctly-scoped, correctly-audienced token before delegating — the A2A analogue of the MCP authorization discipline in Ch. 4.2.4.

---

### 6.2.2 Comparing A2A, ACP, AGNTCY/Agent Directory, and Proprietary Agent Meshes

The interoperability landscape is not settled, and a Principal engineer must be able to place each standard on the map rather than treat them as interchangeable. All target agent-to-agent collaboration, but they differ in transport assumptions, discovery model, governance, and maturity.

**A2A** (originated at Google, now under the Linux Foundation) is HTTP/JSON-RPC-based, task-and-artifact centric, with Agent Card discovery and first-class async/streaming. **ACP (Agent Communication Protocol)** — associated with the BeeAI/IBM lineage — is similarly REST-oriented but emphasizes a broader message model and multipart content, positioning itself around standardized agent communication with different discovery ergonomics. **AGNTCY** (backed by Cisco and collaborators, under the Linux Foundation) is broader than a wire protocol: it defines an **Agent Directory** (a discoverable, verifiable registry of agents and their capabilities, with schemas for identity and provenance) aiming at an "Internet of Agents" — closer to DNS-plus-a-registry than to a single message format. **Proprietary agent meshes** (framework-native buses in offerings like OpenAI's Agents SDK, Microsoft's Agent Framework/AutoGen, CrewAI, LangGraph) provide tight, high-performance intra-framework coordination but lock you into one ecosystem.

| Standard | Governance | Model | Discovery | Strength | Trade-off |
| :--- | :--- | :--- | :--- | :--- | :--- |
| A2A | Linux Foundation | Task/artifact, async | Agent Card (well-known URL) | Broad backing, streaming | Newer; ecosystem maturing |
| ACP | BeeAI/IBM lineage | REST message-centric | Registry/endpoint | Rich content types | Smaller adoption |
| AGNTCY / Agent Directory | Linux Foundation | Directory + identity/provenance | Verifiable directory | Discovery + trust at scale | Broader scope, heavier |
| Proprietary mesh | Single vendor | Framework-native | In-framework | Performance, ergonomics | Vendor lock-in, no interop |

The pragmatic read for 2025–2026 is convergence-in-progress: A2A has the widest cross-vendor backing for the wire-level agent-to-agent contract, AGNTCY addresses the discovery-and-identity layer that A2A leaves to convention, and the two are complementary more than competitive. The security lens is the deciding factor for enterprises: whichever standard you adopt, it must support strong workload identity (SPIFFE/SPIRE, mTLS), correctly-scoped tokens per interaction, and verifiable provenance for discovered agents — because a discovery mechanism that returns an unauthenticated endpoint is an SSRF-and-impersonation vector, and a mesh with no identity layer cannot enforce which agent is allowed to delegate what to whom.

---

### 6.2.3 Protocol Selection: When to Use MCP (Agent→Tool) vs. A2A (Agent→Agent)

The cleanest mental model in the entire interoperability space is the axis distinction: **MCP is vertical, A2A is horizontal**. MCP connects an agent *downward* to its tools, resources, and data — the agent is in control, the tool is a passive capability it invokes. A2A connects an agent *sideways* to another agent — a peer with its own reasoning, autonomy, and opacity, to which you delegate a goal rather than dictate a call. Confusing the two produces both architectural mess and security holes.

```
                     +---------------------------+
                     |     ORCHESTRATOR AGENT     |
                     +----+-----------------+-----+
        A2A (horizontal)  |                 |  A2A (horizontal)
        delegate a goal   |                 |   delegate a goal
                          v                 v
                 +----------------+   +----------------+
                 |  Research Agent |   |  Coding Agent  |
                 +--------+--------+   +-------+--------+
   MCP (vertical) invoke  |                    |  invoke MCP (vertical)
   a tool                 v                    v
                 +----------------+   +----------------+
                 | web-search MCP |   | filesystem MCP |
                 +----------------+   +----------------+
```

The distinction is not merely conceptual; it changes the security model. When you invoke a **tool** over MCP, *you* own the decision and the authorization — the tool executes your typed call within permissions you granted, and the trust question is "is this tool's output trustworthy?" When you delegate to an **agent** over A2A, you hand off *decision-making authority* to an autonomous peer that will make its own tool calls, reason over its own context, and return a result you did not fully control — the trust question becomes "do I trust this agent's judgment and its containment?" Delegation is strictly higher-risk than invocation, because you are exporting agency.

| Question | Use MCP (Agent→Tool) | Use A2A (Agent→Agent) |
| :--- | :--- | :--- |
| Is the target autonomous? | No — deterministic capability | Yes — reasons and acts on its own |
| Who owns the decision? | The calling agent | The remote agent |
| Interaction shape | Typed request/response call | Delegated task with lifecycle |
| Trust question | Is the output trustworthy? | Is the peer's judgment/containment trusted? |
| Authorization model | Tool RBAC, token audience (Ch. 4.2.4) | Cross-agent identity + scoped delegation |
| Failure blast radius | Bounded to the tool's scope | Bounded to what the peer can do (larger) |

The decision rule: if the target is a well-defined capability you want to *control*, it is a tool — use MCP. If the target is a specialist whose *judgment* you want to recruit, it is an agent — use A2A, and treat the delegation with the elevated authorization and containment that exporting agency demands. Many real systems compose both: an orchestrator uses A2A to delegate to worker agents, each of which uses MCP to reach its tools — vertical integration nested inside horizontal collaboration.

---

## 6.3 Collaborative Task Execution

### 6.3.1 Hierarchical Swarms: Lead Architect Agents and Domain-Specific Worker Agents

The **hierarchical swarm** is the dominant production pattern for complex multi-agent work: a **lead/orchestrator agent** (sometimes called a "lead architect" or "supervisor") decomposes a goal into sub-tasks and delegates each to a **domain-specific worker agent** with a narrow toolset and a focused system prompt. The lead does not do the specialized work; it plans, routes, integrates results, and decides when the goal is met. This mirrors the router-peer topology (§6.1.1) elevated to a delegation hierarchy, and it is popular because it maps naturally onto the specialization argument: a worker restricted to SQL tools with a SQL-focused prompt is both more competent and more auditable than a generalist.

The architecture's security virtue is **containment through specialization**. Each worker holds only the tools and credentials its domain requires — the SQL worker cannot touch the filesystem, the browser worker cannot reach the database — so a compromise (via injection in the content that worker processes) is bounded to that worker's blast radius rather than the whole system's. The lead becomes the policy-enforcement point: it authenticates worker results, applies the trust tagging of Ch. 5.4 to what workers return, and gates any high-privilege integration step.

```
                    +-------------------------+
                    |   LEAD / ORCHESTRATOR   |   plans, routes, integrates
                    |   (broad context, no    |   -- policy enforcement point
                    |    direct tool access)  |
                    +----+--------+--------+--+
                         |        |        |     delegate sub-tasks (A2A / in-proc)
              +----------+   +----+----+   +----------+
              |               |                       |
      +-------v------+ +------v-------+       +--------v------+
      | SQL Worker   | | Browser Wkr  |       | Code Exec Wkr |
      | tools: db RO | | tools: page  |       | tools: sandbox|
      | creds: db    | | creds: none  |       | creds: none   |
      +--------------+ +--------------+       +---------------+
        == each worker is a separate trust domain / identity ==
```

The failure modes to design against are specific. **Goal drift** compounds across the hierarchy — a slightly-off sub-task instruction from the lead becomes a very-off result after the worker elaborates it — so sub-task specifications should be explicit and constrained, not open-ended. **Injection propagation upward** is the sharp risk: a worker that processes untrusted content and returns a laundered instruction to the lead can steer the orchestrator, so worker outputs must retain their untrusted trust level when they reach the lead's context and must never be treated as trusted just because they came from an internal agent. The lead's power to integrate is exactly the power an attacker wants to capture; the orchestrator is the crown jewel and must be the most conservatively-privileged, most heavily-audited component in the swarm.

---

### 6.3.2 Peer-to-Peer Networks: Dynamic Task Delegation and Autonomous Capability Discovery

Where hierarchical swarms fix the delegation graph at design time, **peer-to-peer (P2P) networks** let agents discover and recruit each other at runtime. An agent that encounters a sub-task outside its competence performs **autonomous capability discovery** — querying a directory (AGNTCY-style) or fetching Agent Cards — finds a peer that advertises the needed skill, and delegates directly, without a central orchestrator mediating. This yields flexibility and resilience (no single coordinator to fail) at the cost of predictability and control.

Dynamic delegation typically follows a **contract-net** pattern borrowed from classical distributed AI: a requesting agent broadcasts a task announcement, capable agents respond with bids (cost, latency, confidence), and the requester awards the task to the best bidder. This is elegant but introduces genuinely hard problems that hierarchical systems avoid by construction.

```python
async def delegate_p2p(task: dict, directory, budget: "Budget",
                       trust_policy) -> dict:
    if budget.exhausted():
        raise DelegationError("budget exhausted")           # see 6.4.3
    candidates = await directory.find(capability=task["skill"])
    # Only consider peers whose identity + trust domain we accept.
    allowed = [c for c in candidates if trust_policy.permits(task, c)]
    if not allowed:
        raise DelegationError(f"no trusted peer for {task['skill']}")
    bids = await gather_bids(allowed, task, timeout_s=5.0)
    winner = min(bids, key=lambda b: (b.cost, b.latency))
    # Mint a scoped, short-lived, audience-bound token for THIS delegation only.
    token = trust_policy.mint_delegation_token(winner.agent_id, task, budget.child())
    return await winner.invoke(task, token=token)           # recurses -> budget decrements
```

The security profile of P2P delegation is materially worse than hierarchical, and honesty about that is required. There is no central chokepoint to authorize flows, so authorization must be carried in the delegation itself — scoped, short-lived, audience-bound tokens minted per delegation (RFC 8707 / RFC 8693 discipline from Ch. 4.2.4), never a shared ambient credential. Capability discovery is an attack surface: a malicious agent can advertise a capability it does not have (to capture sensitive tasks) or one it maliciously does (to exfiltrate the task data), so discovered peers must be identity-verified and trust-domain-checked before any task — including its potentially sensitive payload — is shared. And unbounded autonomous delegation is how you get the cycles and cost explosions of §6.4; every P2P delegation must decrement a propagated budget and depth counter, or the network can recruit itself into a runaway loop.

---

### 6.3.3 Stateful Workflow Persistence: Resume, Rollback, and State Serialization in Swarms

A long-running swarm task — hours of work across many agents and tool calls — cannot live only in volatile memory. Process restarts, deployments, transient failures, and human-in-the-loop pauses all demand that swarm state be **persisted** so execution can **resume** from where it stopped, **roll back** to a known-good point after a bad step, and survive infrastructure churn. This is workflow durability, and the agentic twist is that the "state" being serialized includes non-deterministic reasoning context, tool results, delegation trees, and trust metadata — a far richer and more dangerous payload than a classical workflow engine's state.

Two persistence architectures dominate. **State snapshotting** serializes the full swarm state (each agent's context, the delegation graph, pending tasks, accumulated artifacts) to a checkpoint at defined boundaries, and resume rehydrates from the latest snapshot. **Event sourcing** persists the ordered log of events (messages sent, tools called, results received, delegations made) rather than the state itself, and reconstructs current state by replaying the log — which makes rollback natural (truncate the log to a point) and gives a complete audit trail for free, at the cost of replay expense and the requirement that side effects be idempotent on replay (Ch. 1.1.3).

```python
from dataclasses import dataclass, field
from enum import Enum

class NodeState(str, Enum):
    PENDING = "pending"; RUNNING = "running"
    COMPLETED = "completed"; FAILED = "failed"

@dataclass
class Checkpoint:
    checkpoint_id: str
    workflow_id: str
    seq: int                                    # monotonic; enables rollback ordering
    node_states: dict[str, NodeState]
    context_refs: dict[str, str]                # pointer to each agent's serialized ctx
    delegation_edges: list[tuple[str, str]]     # (parent_agent, child_agent)
    trust_labels: dict[str, int]                # span/artifact -> Trust rank (Ch.5.4)
    created_at: str
    schema_version: int = 1                     # REQUIRED: reject unknown versions
    integrity: str = ""                         # HMAC/signature over the payload

    def rollback_to(self, seq: int) -> "Checkpoint":
        if seq > self.seq:
            raise ValueError("cannot roll forward via rollback")
        # ... truncate event log / select prior snapshot with seq
        return self
```

The security risk that distinguishes agentic persistence from ordinary workflow durability is **deserialization of swarm state**. A checkpoint contains reasoning context and, if you are careless, live objects; deserializing attacker-influenced state is a classic remote-code-execution and object-injection vector (the `pickle`-versus-`safetensors` lesson from the model supply chain applies directly to agent state). Three controls are mandatory: never use unsafe serializers (`pickle`, arbitrary object graphs) for state that any untrusted content could have touched — use schema-validated JSON or a typed format; sign or HMAC every checkpoint (`integrity` above) and verify before rehydration, so a tampered checkpoint cannot inject state or code; and preserve trust labels across serialization (`trust_labels`), because a resume that rehydrates a laundered-to-trusted context re-introduces the taint-laundering of Ch. 5.4.2 at the persistence layer. Rollback carries its own hazard — rolling back reasoning state while side effects already committed to external systems creates state divergence, so rollback must be paired with compensating actions for any externally-visible effect, exactly as in saga-pattern distributed transactions.

---

## 6.4 Distributed System Challenges in Agent Networks

### 6.4.1 Latency Propagation and Token Cost Optimization in Cascading Swarms

Multi-agent systems multiply two costs that single agents pay once: wall-clock latency and token spend. In a **cascading swarm** where agents delegate to agents that delegate further, both compound in ways that surprise teams accustomed to single-agent economics, and the math is worth making explicit because it is the difference between a system that ships and one that is too slow and too expensive to operate.

Latency along a delegation chain is additive through sequential hops and bounded by the slowest branch through parallel ones. A chain of depth $d$ where each hop performs an LLM call of latency $\ell$ plus tool work $t$ has end-to-end latency on the order of $d \times (\ell + t)$ for a sequential path — and because each hop is a full reasoning turn, $\ell$ is seconds, not milliseconds, so a depth-5 chain can take half a minute before the first useful output. Token cost is worse because it compounds *multiplicatively with context re-inclusion*: each agent in the chain re-includes the accumulated context of its parents, so if each hop adds context and the child re-processes the parent's, total tokens grow super-linearly in depth. A fan-out of branching factor $b$ and depth $d$ can invoke on the order of $b^d$ agents, each paying for its own (growing) context.

$$\text{Tokens}_{\text{total}} \approx \sum_{i=0}^{d} b^{i} \cdot c_i, \quad \text{where } c_i = \text{context tokens at depth } i \text{ (growing in } i)$$

```
   depth 0        depth 1              depth 2                (b = 3)
   [orchestr] -> [worker A] --------> [sub A1] [sub A2] [sub A3]
             \-> [worker B] --------> [sub B1] [sub B2] [sub B3]
             \-> [worker C] --------> [sub C1] [sub C2] [sub C3]
      1 agent      3 agents               9 agents      => 13 LLM calls,
                                                           each re-paying context
```

The optimization levers are concrete. **Bound depth and breadth** with explicit budgets (the same counters that prevent the loops of §6.4.3). **Prune context on delegation** — a child should receive only the sub-task's relevant context, not the parent's entire history, which both cuts tokens and reduces injection surface. **Use small models for narrow workers** (the SLM argument from Ch. 1.2.1) and reserve the expensive reasoning model for the orchestrator. **Cache and deduplicate** shared context via prefix caching (Ch. 5.3.1). And **parallelize independent branches** so latency is $\max$ rather than $\sum$ across siblings. The governing discipline is that every delegation must carry a decrementing **token and latency budget**; an agent network without a propagated budget is a denial-of-wallet incident waiting for the right (or wrong) input.

---

### 6.4.2 Distributed Lock Management for Shared Memory and Shared Tool Resources

When multiple agents share state — a blackboard, a common memory store, a document they co-edit, or a stateful tool like a database — concurrent access produces the classic distributed-systems hazards: lost updates, dirty reads, and write-write conflicts. Agents make this harder than ordinary distributed clients because their access patterns are non-deterministic and their "transactions" span multiple LLM turns of unpredictable duration, so a lock held "while the agent thinks" can be held for an unbounded time.

The workhorse is a **distributed lock** with a mandatory **lease (TTL)** and **fencing token**. A lease ensures a crashed or stalled agent's lock eventually releases rather than deadlocking the resource forever; a fencing token — a monotonically increasing number issued with each lock grant — lets the guarded resource reject writes from a client whose lease already expired (the well-known failure where agent A pauses, its lease expires, agent B acquires the lock, then A wakes and writes stale data). The resource accepts only the highest fencing token it has seen.

```python
import time, uuid

class DistributedLock:
    def __init__(self, store, key: str, lease_s: float = 30.0) -> None:
        self.store, self.key, self.lease_s = store, key, lease_s
        self.token: int | None = None

    def acquire(self, wait_s: float = 10.0) -> bool:
        deadline = time.monotonic() + wait_s
        owner = str(uuid.uuid4())
        while time.monotonic() < deadline:
            # atomic SET-if-absent with TTL; store returns a monotonic fencing token
            tok = self.store.set_nx(self.key, owner, ttl_s=self.lease_s)
            if tok is not None:
                self.token = tok                       # present this on every write
                return True
            time.sleep(0.2)
        return False

    def guarded_write(self, resource, value) -> None:
        if self.token is None:
            raise RuntimeError("write without lock")
        resource.write(value, fencing_token=self.token) # resource rejects stale tokens
```

Two agent-specific refinements matter. First, because agent operations are long and bursty, prefer **short leases with explicit renewal** (the agent extends the lease each turn it still needs the lock) over one long lease, so a hung agent releases quickly. Second, keep **critical sections tiny**: an agent should read state, compute *outside* the lock, and hold the lock only for the atomic write — never hold a lock across an LLM call or a tool invocation, because those durations are unbounded and turn a lock into a system-wide stall. Optimistic concurrency (compare-and-swap on a version number) is often preferable to pessimistic locking for agent workloads precisely because it never holds a lock across a think step; it simply retries on conflict.

---

### 6.4.3 Deadlock Detection and Cycle Resolution in Autonomous Delegation Loops

Autonomous delegation — especially P2P (§6.3.2) — can form **cycles**: agent A delegates a sub-task to B, which (not recognizing the origin) delegates a related sub-task back to A, which delegates to B, and so on. Unlike a hierarchical swarm whose delegation graph is a tree by construction, dynamic delegation builds its graph at runtime, and nothing prevents that graph from containing a cycle. The result is either a **deadlock** (each agent waiting on the other's result) or, worse, a **livelock** that burns tokens and money indefinitely without ever waiting — a denial-of-wallet event driven entirely by the agents' own autonomy.

Two complementary defenses are required. **Prevention** bounds the problem structurally: every delegation carries a **depth counter** and a **budget** (tokens/cost/time) that strictly decrease down the chain, and a **delegation path** (the list of agent IDs already in the current chain) that lets an agent refuse a task whose path already contains itself — direct cycle detection. **Detection** handles cycles that prevention misses (e.g., cycles through more than one intermediary or through shared state): the orchestration layer maintains the live **wait-for graph** of who is blocked on whom and runs cycle detection (a depth-first search for a back edge) on it, aborting a task in any detected cycle to break the deadlock.

```python
def detect_cycle(wait_for: dict[str, set[str]]) -> list[str] | None:
    """Return a cycle in the wait-for graph, or None. DFS back-edge detection."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {n: WHITE for n in wait_for}
    stack: list[str] = []

    def visit(node: str) -> list[str] | None:
        color[node] = GRAY
        stack.append(node)
        for nxt in wait_for.get(node, ()):
            if color.get(nxt, WHITE) == GRAY:            # back edge -> cycle
                return stack[stack.index(nxt):] + [nxt]
            if color.get(nxt, WHITE) == WHITE:
                if (c := visit(nxt)) is not None:
                    return c
        color[node] = BLACK
        stack.pop()
        return None

    for n in list(wait_for):
        if color[n] == WHITE and (c := visit(n)) is not None:
            return c
    return None


def guard_delegation(task: dict, path: list[str], me: str,
                     depth: int, max_depth: int, budget_left: float) -> None:
    if me in path:
        raise DelegationError(f"cycle: {me} already in path {path}")
    if depth >= max_depth:
        raise DelegationError(f"max delegation depth {max_depth} exceeded")
    if budget_left <= 0:
        raise DelegationError("delegation budget exhausted")
```

The engineering rule is defense in depth: prevention (depth + budget + path checks on every delegation) stops the common cases cheaply and locally, while detection (wait-for-graph cycle analysis at the orchestration layer) catches the multi-hop cases prevention cannot see. Both are mandatory in any system that permits autonomous, dynamic delegation, because the failure mode is not a crash you notice — it is a quiet, compounding spend that looks like "the agents are working hard" right up until the invoice arrives. A depth- and budget-limited delegation guard is to agent networks what a recursion limit is to a call stack: not optional, and cheapest to enforce at the boundary.

---

## Technical Chapter Summary

- Multi-agent systems are **distributed systems with non-deterministic, steerable nodes**; message-passing topology (broadcast O(n²) with no chokepoint, router-peer O(n) with a central policy point, blackboard with shared-state contention) is the primary determinant of cost, failure mode, and security posture, and router-peer is the safe enterprise default.
- Inter-agent messages must travel in **signed, structured JSON envelopes** that separate routing/identity metadata from typed payloads and carry a `performative` speech act, turning "an agent said something" into "a verified sender made a typed, authorized assertion."
- **Consensus** (voting, debate, adversarial verification) improves decision quality and resists single-agent injection *only when the agents are genuinely diverse* (different models, isolated contexts); it is never a substitute for the authorization gate, and shared-context consensus is illusory.
- The core interoperability model is **MCP = vertical (agent→tool), A2A = horizontal (agent→agent)**: invoking a tool retains decision authority, while delegating to an agent exports agency and is strictly higher-risk; A2A Agent Cards, Task objects, and `securitySchemes` are the horizontal analogue of MCP's authorization discipline, with A2A/ACP/AGNTCY converging (A2A for the wire, AGNTCY for discovery/identity).
- **Hierarchical swarms** contain blast radius through per-worker least privilege and make the orchestrator the policy chokepoint; **P2P delegation** trades that control for flexibility and must carry scoped, short-lived, audience-bound tokens per delegation because it has no central authorization point.
- **Stateful persistence** (snapshotting vs. event sourcing) enables resume and rollback but makes **deserialization of swarm state** an RCE/object-injection vector — mandating safe serializers, signed/verified checkpoints, preserved trust labels, and compensating actions for rolled-back side effects.
- Cascading swarms **multiply latency additively and token cost super-linearly** (fan-out $b^d$ with re-included context); every delegation must carry a decrementing token/latency/depth budget, prune context on hand-off, and use small models for narrow workers, or the network becomes a denial-of-wallet incident.
- Shared resources require **leased, fencing-tokened distributed locks** with tiny critical sections (never held across an LLM call), and autonomous delegation requires both **prevention** (depth/budget/path limits) and **detection** (wait-for-graph cycle analysis) to stop deadlocks and livelocks in self-recruiting agent loops.
