# Chapter 2: Reasoning, Planning, and Execution Engines

Chapter 1 framed the agent as a distributed system with a probabilistic scheduler. This chapter opens that scheduler and examines how it actually decides what to do next. The reasoning and planning layer is where a goal like "reconcile these invoices" is transformed into a concrete sequence of tool calls — and it is also where the majority of an agent's non-determinism, and therefore its unpredictability, lives. An engineer who treats the planner as a black box that "just calls the LLM in a loop" will ship a system whose failure modes are unbounded, unobservable, and impossible to roll back.

The central engineering tension is between **expressiveness and control**. More powerful planning paradigms — tree search, reflection, multi-agent decomposition — solve harder problems but widen the set of reachable states and lengthen the causal chain between an injected instruction and a privileged action. A ReAct loop that can call a shell tool is a remote code execution primitive with a natural-language interface; a supervisor delegating to sub-agents is a delegation graph in which every edge is a potential confused-deputy path. The security posture of a planner is not a bolt-on; it is a property of the control-flow topology you choose.

By the end of this chapter you will be able to select a planning paradigm appropriate to a task's difficulty and risk, express agent control flow as an explicit state graph rather than an unbounded loop, compare the major production frameworks on the axes that actually matter for security (state handling, human-in-the-loop, isolation), enforce structural reliability through constrained decoding and grounding verification, and — most importantly — give a long-running, side-effecting agent **durable execution** semantics so that a crash, a retry, or a policy abort leaves the world in a consistent state.

We treat reliability and security as the same discipline throughout. An agent that double-charges a customer because it retried a non-idempotent tool is failing in exactly the way an agent that gets prompt-injected into issuing a refund is failing: an unintended, unrecoverable side effect escaped the control plane. Durable execution, structured output, and policy-gated actions are the mechanisms that shrink that failure surface.

---

## 2.1 Planning Paradigms & Control Flows

### 2.1.1 Sequential Reasoning: ReAct (Reason + Act), Plan-and-Solve, and Reflection

The foundational engine of autonomous behavior is the **planning loop**: the agent converts an ambiguous goal into an execution path by interleaving reasoning with environmental interaction. The canonical pattern is **ReAct** (Reason + Act), which alternates a private *thought* with a concrete *action* and folds the resulting *observation* back into context before the next step.

```
+-------------------------------------------------------------------------+
|                           THE ReAct LOOP                                |
|  [THOUGHT]  compare goal vs. current observation; plan the next step    |
|      |                                                                  |
|      v                                                                  |
|  [ACTION]   select and invoke a tool with structured parameters         |
|      |                                                                  |
|      v                                                                  |
|  [OBSERVE]  ingest tool output or error into context                    |
|      |                                                                  |
|      +---> loop back to THOUGHT until a stop condition fires            |
+-------------------------------------------------------------------------+
```

Formally, let $S_t$ be the agent state at step $t$, comprising the system prompt $P$, goal $G$, and the history of thoughts, actions, and observations:

$$S_t = (P, G, T_1, A_1, O_1, \dots, T_{t-1}, A_{t-1}, O_{t-1})$$

The next thought-action pair is sampled from the model, $(T_t, A_t) \sim P_{\text{LLM}}(\cdot \mid S_t)$. The security-relevant fact is that $O_{t-1}$ — the previous observation — is frequently attacker-influenced tool output, and it is concatenated directly into the state that produces $A_t$. ReAct is elegant precisely because it makes tainted data first-class context, which is also why it is the archetypal **indirect prompt injection** vector.

Two variants trade off token cost against control. **Plan-and-Solve** separates planning from execution: the model first emits a complete plan $(g_1, g_2, \dots, g_k)$, then executes each sub-goal with a smaller working context. This reduces the window in which injected content can rewrite the *plan* — the plan is fixed before untrusted tool output arrives — and it is the practical basis for the **Plan-Then-Execute** security pattern (see Ch. 2.4 and later injection-defense chapters), where a privileged planner never sees tainted data and an unprivileged executor never makes control decisions. **Reflection** (or self-correction) inserts an explicit critic pass: a second model, or the same model under a critic persona, audits observation $O_t$ against correctness and policy criteria before the loop proceeds. Reflection catches some hallucinations and unsafe plans, but it is a soft control — the critic reads the same tainted context and can be injected too — so it belongs in a layered stack, never as the sole gate on a side-effecting action.

---

### 2.1.2 Tree-based and Graph-based Planning: Tree-of-Thoughts (ToT) and Monte Carlo Graph Search

Linear ReAct fails on problems with backtracking, combinatorial choice, or compounding error — automated refactoring, multi-hop investigation, complex optimization. There the agent must explore multiple candidate futures and evaluate them before committing. **Tree-of-Thoughts (ToT)** generalizes the scratchpad into a search tree of partial reasoning states; **Monte Carlo Tree Search (MCTS)** and its graph variant add principled expansion, evaluation, and backpropagation over that tree.

```
                           [ root goal state S0 ]
                                   /      \
                    [ thought A1 ]          [ thought A2 ]
                       /      \                  |
         [ thought B1 ]    [ thought B2 ]    [ thought B3 ]
            v = 0.15          v = 0.92          v = 0.40
                                 |
                                 v  (selected optimal branch)
                          [ committed action ]
```

At state $s$ the model proposes $k$ candidate continuations $\{z^{(1)}, \dots, z^{(k)}\}$, and a valuation function scores each branch, $v(s, z) \in [0, 1]$. For agentic security the valuation must be more than a quality estimate — it must penalize risky trajectories so search does not "discover" a dangerous shortcut:

$$v_{\text{secure}}(s, z) = v(s, z) - \gamma \cdot R(z)$$

where the risk term $R(z) \to 1$ for branches that touch high-impact capabilities (arbitrary shell execution, IAM mutation, bulk deletion, outbound payments) without an authorization precondition. This is important and under-appreciated: a search-based planner is an *optimizer*, and an optimizer will exploit any capability that lowers its cost function, including capabilities you intended to keep for emergencies. Folding a risk penalty into $v_{\text{secure}}$ makes "don't take the dangerous path unless explicitly authorized" part of the objective rather than a hope. Tree search also multiplies cost and latency — each node is one or more model calls — so it directly amplifies **denial-of-wallet** exposure (Ch. 1.2.1); production deployments cap tree width $k$, depth $d$, and total node budget, and reserve MCTS for the minority of tasks whose difficulty justifies it. For everything else, a bounded ReAct or Plan-and-Solve loop is cheaper and easier to secure.

---

### 2.1.3 Dynamic Plan Mutation: Self-Correction, Mid-Trajectory Replanning, and Error Recovery

Real environments return `403 Forbidden`, `database locked`, `schema mismatch`, and partial results. A rigid plan shatters on the first unexpected error, so production agents must mutate their remaining plan in response to runtime feedback — while keeping that mutation inside safe bounds.

```python
from pydantic import BaseModel, Field
from typing import Protocol

class PlanStep(BaseModel):
    step_id: int
    description: str
    tool_name: str
    tool_args: dict
    status: str = Field(default="PENDING")  # PENDING | EXECUTED | FAILED

class Replanner(Protocol):
    def generate_structured_plan(self, prompt: str) -> str: ...

class PlanTrajectory(BaseModel):
    goal: str
    steps: list[PlanStep]
    replan_count: int = 0
    max_replans: int = 3  # hard bound: replanning is not unbounded

    def mutate_on_failure(self, failed_step_id: int, error: str, llm: Replanner) -> "PlanTrajectory":
        """Regenerate the *remaining* steps after a runtime failure, under a replan budget."""
        if self.replan_count >= self.max_replans:
            raise RuntimeError("replan budget exhausted; escalate to human")
        prompt = (
            f"Goal: {self.goal}\n"
            f"Step {failed_step_id} failed: {error}\n"
            f"Mutate ONLY the remaining, not-yet-executed steps. "
            f"Do not re-execute completed side-effecting steps."
        )
        revised = PlanTrajectory.model_validate_json(llm.generate_structured_plan(prompt))
        revised.replan_count = self.replan_count + 1
        return revised
```

Three controls turn replanning from a footgun into a feature. First, a **replan budget** (`max_replans`) bounds the loop so a persistently failing tool cannot drive an infinite, cost-bleeding retry storm — when the budget is exhausted, the agent escalates to a human rather than thrashing. Second, the mutation prompt must explicitly forbid re-executing completed **side-effecting** steps; combined with idempotency keys (Ch. 2.4.1) this prevents the classic double-effect bug where a replan re-issues a payment that already succeeded. Third, replanning is itself a decision made over possibly-tainted context, so the mutated plan must pass the same action-engine policy gate as the original — a replan is not a trusted fast-path around your controls. Error recovery is where agents feel "smart," and it is exactly where an attacker who can induce a specific error (for example, by making a tool return a crafted failure message) can steer the replan; treat the error string as untrusted input, not as a trusted control signal.

---

## 2.2 Framework Architectures & State Machines

### 2.2.1 Graph-Driven Orchestration: State Graphs, DAGs, and Edge Conditional Routing

Production agents reject the unbounded `while True: call_llm()` loop in favor of an **explicit state graph**. Nodes are typed execution steps (an LLM call, a tool invocation, a guardrail check, a human approval); edges are transitions that are either static or evaluated by a conditional router. This is the same shift the industry made from goto-driven code to structured control flow, and it buys the same thing: the reachable states become enumerable and the transitions become auditable.

```
       +-------------------+
       |    START NODE     |
       +---------+---------+
                 |
                 v
       +-------------------+
       |   PLANNER NODE    | <-------------------+
       +---------+---------+                     |
                 |                               |
                 v                               |
        /=====================\                  |
       / plan safe & valid?     \                |
      (   YES )         (  NO   )                |
        \=====/           \=====/                |
           |                  |                  |
           v                  v                  |
   +--------------+   +------------------+        |
   | EXECUTOR NODE|   | REPAIR / REJECT  +--------+
   +------+-------+   +------------------+
          |
          v
   +--------------+
   |   END NODE   |
   +--------------+
```

The security value of an explicit graph is fourfold. It makes **guardrail nodes** first-class — a policy or grounding check is a node the graph *must* traverse, not an optional wrapper someone can forget. It bounds recursion — a cycle in the graph carries an explicit iteration budget, so "loop until done" cannot become "loop forever." It makes **human-in-the-loop** a structural pause: an approval node halts the graph, persists state, and resumes only on an external signal the model cannot generate. And it makes the whole trajectory a durable, replayable object (Ch. 2.4), so an incident responder can reconstruct exactly which node produced which action from which context. The design rule: every edge that leads to a side-effecting node should pass through a routing condition that can deny it, and that condition should evaluate provenance and policy, not just the model's stated intent.

---

### 2.2.2 Hierarchical Agent Frameworks: Supervisor-Worker Networks and Task Decomposition

When one agent's responsibilities grow too broad, its tool belt and context become unmanageable and its blast radius grows with them. **Supervisor-worker** topologies decompose the problem: a supervisor owns the goal and routes sub-goals to specialized workers, each with a narrow tool allowlist and a minimal context slice.

```python
from typing import Literal, Any
from pydantic import BaseModel

class SupervisorDecision(BaseModel):
    next_agent: Literal["FINANCE_AGENT", "SECURITY_AUDIT_AGENT", "FINALIZE", "ESCALATE_TO_HUMAN"]
    instructions_for_worker: str
    context_slice: dict[str, Any]  # minimize: workers get only what they need

def supervisor_router(state: dict[str, Any], supervisor_llm: Any) -> SupervisorDecision:
    """Delegate to a least-privilege specialist worker with a minimized context slice."""
    return supervisor_llm.evaluate(state)
```

Decomposition is a security control when it is done with least privilege in mind. A worker that only reconciles invoices needs no shell tool; scoping its identity and tools accordingly means a prompt injection landing in that worker cannot reach the finance ledger. The `context_slice` is equally important: passing the full conversation to every worker re-spreads tainted data across principals, so **context minimization** — giving each worker only the fields it needs — limits how far an injection propagates. But hierarchy introduces its own failure mode: the supervisor becomes a **confused deputy**. If a worker's output (itself possibly injected) is fed back into the supervisor's routing decision, an attacker who controls one worker's inputs can influence delegation to *other* workers with different privileges. Mitigations are the same ones that govern any delegation system: authenticate inter-agent messages with workload identity (Ch. 1.3.2, Ch. 7), treat worker output as tainted when it re-enters the supervisor, and never let a worker's return value directly authorize a higher-privilege action without an independent policy check. Multi-agent decomposition reduces per-agent blast radius but increases the number of trust boundaries you must defend.

---

### 2.2.3 Comparing Enterprise Agent Runtimes: LangGraph, AutoGen/AG2, CrewAI, OpenAI Agents SDK, Google ADK, and Microsoft Agent Framework

No framework is "secure" or "insecure" on its own; each makes different defaults easy or hard. The axes that matter for a Principal AI Security Engineer are the control model (how deterministic is the graph?), state handling (is state durable and inspectable?), human-in-the-loop support (can you pause for approval?), and the security posture the framework nudges you toward. The comparison below is a design-orientation guide, not a benchmark — treat framework capabilities as fast-moving and verify current behavior before relying on it.

| Framework | Architecture model | State handling | HITL support | Security posture (defaults & seams) |
| :--- | :--- | :--- | :--- | :--- |
| **LangGraph** | Explicit typed state graph | Native checkpointing / persistence | First-class interrupt-and-resume | Strong: guardrail nodes, bounded cycles, replayable state; you own policy in nodes |
| **AutoGen / AG2** | Multi-agent conversation | In-memory or custom store | Configurable human proxy agent | Conversation-centric; needs explicit message auth and taint handling |
| **CrewAI** | Role/task "crew" orchestration | Managed memory service | Task-level approval hooks | Rapid to build; enforce tool scoping and approval gates yourself |
| **OpenAI Agents SDK** | Event/handoff + function tools | Thread/session persistence | Guardrail + approval callbacks | Built-in input/output guardrails and tool-approval hooks; hosted-model coupling |
| **Google ADK** | Declarative agents on Vertex | Cloud-managed state | Pipeline approval stages | Inherits Google Cloud IAM/VPC-SC controls; strong platform identity story |
| **Microsoft Agent Framework** | Graph + actor workflows (Semantic Kernel + AutoGen lineage) | Durable workflow state | Built-in approval/checkpoint steps | Enterprise Entra ID identity, durable execution, policy integration seams |

The practical selection logic follows the autonomy level from Ch. 1.1.2. For Level 3 bounded trajectories that touch production systems, favor a runtime with an **explicit, durable, inspectable graph** (LangGraph, Microsoft Agent Framework, or ADK on a governed platform) because the graph *is* your audit boundary and your HITL insertion point. For Level 4 multi-agent designs, weigh how the framework handles **inter-agent identity and message trust**, since that is where confused-deputy risk concentrates. Whatever the choice, the framework supplies the control *seams* — you still author the policy, scope the tools, and wire the approval gates. A framework's HITL feature is worthless if no one places an approval node in front of the money-moving tool.

---

## 2.3 Determinism & Reliability Control

### 2.3.1 Structured Outputs: JSON Schema Enforcement, Pydantic Guards, and Constrained Decoding

Free-text tool calls are a parsing liability and a security liability: a model that "mostly" emits JSON will occasionally emit a payload that a lenient parser coerces into an unintended call. The strongest fix is **constrained decoding** (guided decoding in vLLM, Outlines, XGrammar, and comparable engines), which restricts the model's output logits at each step to tokens permitted by a target grammar derived from a JSON Schema or Pydantic model.

$$\text{logit}_{\text{valid}}(t) = \text{logit}_{\text{raw}}(t) + M_{\text{grammar}}(t), \qquad M_{\text{grammar}}(t) = -\infty \text{ if } t \text{ violates the grammar}$$

Because invalid tokens are masked to $-\infty$ before sampling, the output is guaranteed to parse against the schema — eliminating an entire class of syntax-level failure and self-repair round-trips. But constrained decoding guarantees *structure*, not *safety*. A grammar that forces valid JSON does nothing to stop a well-formed call with malicious arguments, so schema enforcement must be paired with semantic validation (Pydantic validators that bound enums, ranges, and patterns as in Ch. 1.2.2) and the downstream policy gate. The layered stack is: constrained decoding guarantees the call *parses*, Pydantic guards guarantee it is *well-typed and in-range*, and OPA/Cedar policy guarantees it is *authorized given provenance*.

| Layer | Guarantee | Enforced by | Defeats | Does *not* defeat |
| :--- | :--- | :--- | :--- | :--- |
| Constrained decoding | Output parses against the grammar | Logit masking (Outlines, XGrammar, vLLM guided decoding) | Malformed JSON, hallucinated tool names, self-repair loops | Valid JSON with malicious arguments |
| Pydantic / semantic validation | Values are well-typed and in range | Application-side validators (enums, bounds, regex, path canonicalization) | Out-of-range amounts, path traversal, unexpected enum values | In-range values that the task never authorized |
| Policy gate (OPA/Cedar) | Call is authorized given task provenance and taint | Runtime gateway outside the model process | Confused-deputy calls, cross-tenant access, tainted-input escalation | Actions that are in-policy but attacker-desired |
| Human-in-the-loop | Irreversible action is intended | Approval UI with the full action rendered | Silent high-impact actions | Approval fatigue; misleading action summaries |

Each row narrows the space of accepted calls, and each row's rightmost column is the reason the next row exists.

Skipping the middle and outer layers because "the model returns valid JSON now" is a common and dangerous shortcut — structural validity is necessary, never sufficient.

---

### 2.3.2 Hallucination Suppression: Grounding Verification, Citation Tracking, and Logit Bias Control

Agents that answer from retrieved evidence must be held to that evidence, or they will confidently synthesize unsupported claims — and an unsupported claim that drives a tool call is a reliability failure with real consequences. The architectural control is a two-pass verification pipeline that links every claim to a source and checks entailment.

```
[ LLM proposed claims ] ---> [ 1. citation linker ]
                                     |
                                     v
                             [ 2. NLI entailment check ]
                                     |
                   +-----------------+-----------------+
                   |                                   |
             ( entailed )                       ( contradiction )
                   v                                   v
          [ return with citation ]          [ reject & regenerate ]
```

The **citation linker** binds each generated claim to the specific retrieved span it should rest on; the **natural-language-inference (NLI) entailment classifier** then tests whether that span actually entails the claim, rejecting or forcing a rewrite on contradiction or neutrality. This is more robust than asking the model to "only use the context," because it externalizes verification into a separate, auditable step. **Logit bias** and low temperature further reduce fabrication for constrained fields (for example, biasing toward an abstain token when evidence is thin), but they are tuning knobs, not guarantees. Two caveats keep this honest. First, grounding verification defends against *accidental* hallucination, not *adversarial* injection: if the retrieved evidence is itself poisoned, a claim can be perfectly "grounded" in attacker-controlled text — so citation tracking must record provenance and trust level, not just the fact of a citation. Second, an entailment classifier is itself a model and can be evaded; it lowers the rate of unsupported claims but does not certify truth. Grounding is a reliability and detectability control that also produces the citation trail auditors and incident responders need.

---

### 2.3.3 Rate Limiting, Backoff Strategies, and Circuit Breakers in Agent Execution Chains

An autonomous loop that hits `429 Too Many Requests` or a downstream outage and naively retries becomes a self-inflicted denial-of-service against its own dependencies — and, given per-token pricing, a denial-of-wallet against its owner. The reliability controls are the same primitives that protect any distributed system, adapted to the fact that the "client" here is a model that will happily retry forever.

```python
import time

class AgentCircuitBreaker:
    """Fail fast on a flapping dependency; cap the blast radius of retry storms."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 30.0) -> None:
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.state = "CLOSED"  # CLOSED | OPEN | HALF_OPEN
        self.opened_at = 0.0

    def call(self, func, *args, **kwargs):
        if self.state == "OPEN":
            if time.monotonic() - self.opened_at > self.recovery_timeout:
                self.state = "HALF_OPEN"
            else:
                raise RuntimeError("circuit OPEN: agent action blocked")
        try:
            result = func(*args, **kwargs)
            if self.state == "HALF_OPEN":
                self.state, self.failure_count = "CLOSED", 0
            return result
        except Exception:
            self.failure_count += 1
            if self.failure_count >= self.failure_threshold:
                self.state, self.opened_at = "OPEN", time.monotonic()
            raise
```

Three patterns compose. **Exponential backoff with jitter** spaces retries so a fleet of agents does not synchronize into a thundering herd. The **circuit breaker** trips after repeated failures and fails fast, preventing an agent from burning its token and time budget hammering a dead dependency. **Rate limiting** — per agent, per tool, and per tenant — enforces the `max_token_budget_per_run` and per-tool quotas declared in the agent's inventory record (Ch. 1.4.1), which is the concrete defense against denial-of-wallet. These controls also produce **detection signal**: a circuit breaker that trips repeatedly, or an agent that saturates its token budget, is an anomaly worth alerting on — it may be a broken tool, or it may be an injected agent stuck in an adversarially-induced loop. Reliability engineering and security telemetry are the same instrumentation viewed through two lenses.

---

## 2.4 Durable Execution and Failure Semantics

### 2.4.1 Checkpointing, Idempotency Keys, and Exactly-Once Tool Semantics

A long-running agent — auditing fifty cloud accounts, migrating a dataset, processing a queue of tickets — will eventually crash mid-trajectory. Without durability it restarts from zero, re-executing every side effect it already committed. **Durable execution** persists the trajectory as a checkpointed event log so the agent resumes from the last consistent point instead of replaying irreversible actions.

```
[ step 1: query CVE DB ]  --> [ checkpoint 1 ]
[ step 2: patch server  ]  --> [ checkpoint 2 ]   <== process crashes here
[ restart ]               --> [ load checkpoint 2 ] --> resume at step 3 (no re-patch)
```

Resumption is only safe if each side-effecting tool call is **idempotent**, because a crash between "action committed downstream" and "checkpoint written" will cause a legitimate retry of an action that already happened. The mechanism is a deterministic **idempotency key** derived from the invariant identity of the step:

$$\text{IdempotencyKey} = \text{HMAC-SHA256}\big(\text{AgentID} \parallel \text{WorkflowID} \parallel \text{StepID} \parallel \text{canonical}(\text{ToolArgs})\big)$$

The key travels with the call (for example as an `X-Idempotency-Key` header), and the tool — or a dedup layer in front of it — records executed keys so a repeat is recognized and returns the original result rather than performing the effect twice. This gives **exactly-once semantics** at the effect level even though the transport is at-least-once. The security framing is important: a non-idempotent side-effecting tool is not just a reliability bug, it is an amplification primitive — an attacker (or a flaky network) that induces retries can multiply an effect (duplicate refunds, repeated emails, doubled provisioning). Making side effects idempotent removes that amplification and is a precondition for safely retrying under the replan and circuit-breaker logic from earlier sections.

---

### 2.4.2 Durable Workflow Engines (Temporal, Step Functions) as Agent Control Planes

Rather than reinventing checkpointing, event logs, and retries, mature deployments run the agent's state graph on a **durable workflow engine** — Temporal, AWS Step Functions, or the durable-execution layer inside frameworks like the Microsoft Agent Framework. The engine separates deterministic orchestration from non-deterministic work: the workflow logic (the graph) is replayable from an event history, while the risky, non-deterministic operations (LLM calls, tool executions) are isolated in **activities** that the engine schedules, retries, and records.

```
+-------------------------------------------------------------------------+
|                          DURABLE WORKFLOW ENGINE                        |
|                                                                         |
|  +----------------------+   event history   +----------------------+    |
|  | agent workflow       |=================> | durable event store  |    |
|  | (deterministic graph)|                   | (replay log)         |    |
|  +----------+-----------+                   +----------------------+    |
|             |                                                           |
|             v schedules activity                                        |
|  +----------------------+                                               |
|  | activity worker      | ---> executes LLM call / external tool         |
|  | (non-deterministic)  | <--- returns result payload                    |
|  +----------------------+                                               |
+-------------------------------------------------------------------------+
```

This architecture delivers several security and reliability properties at once. The **event history is a tamper-evident audit trail**: every decision and every tool result is recorded in order, which is exactly the forensic record an incident responder needs to reconstruct a compromised trajectory. The engine's built-in retry and timeout policies subsume the backoff and circuit-breaker logic of Ch. 2.3.3 at the platform level. **Human-in-the-loop** becomes a durable signal — the workflow can block on an external approval for hours or days without holding a process open, because its state lives in the event store. And because activities are the only place side effects happen, they are the natural home for the idempotency keys of Ch. 2.4.1. The engineering caution is that workflow code must be *deterministic* for replay to be sound: all non-determinism (model calls, clock reads, randomness) must be pushed into activities, or a replay will diverge from history. Used correctly, a durable engine turns a fragile agent loop into a control plane you can pause, audit, and recover.

---

### 2.4.3 Compensating Actions and Transactional Rollback of Side-Effecting Agent Steps

Distributed side effects cannot be wrapped in a single ACID transaction — you cannot two-phase-commit an IAM role creation, an EC2 launch, and a third-party API call. When a trajectory must be aborted mid-flight (a policy violation, an unrecoverable error, a human rejection), the system unwinds already-committed steps with **compensating transactions**, the **saga pattern**: for every forward action, define an inverse, and on abort execute the inverses in reverse order.

| Completed step | Forward action | Compensating (rollback) action |
| :--- | :--- | :--- |
| Step 1 | Created temporary IAM role | Delete the temporary IAM role |
| Step 2 | Provisioned EC2 sandbox | Terminate the EC2 instance |
| Step 3 | Modified a security-group rule | Restore the rule to its pre-change hash |
| Step 4 | Policy violation detected | Halt forward progress; run compensations 3 → 2 → 1 |

Sagas are where reliability engineering and incident response converge. When a prompt injection steers an agent partway down a destructive path before a guardrail catches it, the compensation chain is the mechanism that returns the system to a known-good state — so every side-effecting node in the state graph (Ch. 2.2.1) should be authored together with its compensator, and the compensators should be registered with the durable engine so they run even if the agent process is gone. Three honest limits apply. Some effects are **irreversible** — a sent email, a disclosed secret, an executed payment cannot be truly undone, only mitigated (rotate the secret, issue a reversal, notify the recipient) — which is precisely why such actions belong behind a human-in-the-loop gate *before* execution rather than a compensation *after*. Compensation itself has side effects and can fail, so it needs the same idempotency and retry discipline as the forward path. And a compromised agent must not be trusted to run its own rollback; compensation should be driven by the durable control plane, not by the model that may itself be under adversarial control. Saga rollback bounds the damage of a failed or hijacked trajectory, but it is a mitigation, not a guarantee that no harm occurred.

---

## Technical Chapter Summary

- The reasoning layer is where an agent's non-determinism concentrates, and the choice of planning paradigm is a security decision: **ReAct** makes tainted tool output first-class planning context, **Plan-and-Solve** enables the Plan-Then-Execute separation that keeps a privileged planner away from untrusted data, and **Reflection** is a soft, injectable control that belongs only in a layered stack.
- **Tree/graph search (ToT, MCTS)** solves harder problems but is an optimizer that will exploit dangerous shortcuts; fold a **risk penalty** into the branch valuation so unsafe trajectories are dis-preferred by the objective, and cap width, depth, and node budget to bound denial-of-wallet exposure.
- **Dynamic replanning** must run under a replan budget, must forbid re-executing completed side-effecting steps, and must re-pass the policy gate, because an attacker who can induce a specific error can steer the mutated plan — the error string is untrusted input, not a trusted control signal.
- **Explicit state graphs** beat unbounded loops because they make guardrail nodes mandatory, bound recursion, turn human-in-the-loop into a structural durable pause, and produce a replayable trajectory; every edge into a side-effecting node should pass a routing condition that evaluates provenance and policy.
- Framework selection turns on control model, durable/inspectable state, and HITL seams (**LangGraph, AutoGen/AG2, CrewAI, OpenAI Agents SDK, Google ADK, Microsoft Agent Framework**); no framework is secure by default — it supplies seams, and you still author policy, scope tools, and place approval gates, with multi-agent designs demanding explicit inter-agent identity to contain confused-deputy risk.
- Reliability controls are security controls: **constrained decoding + Pydantic guards + policy** form a structure/type/authorization stack (structural validity is necessary, never sufficient), **grounding verification with citation and provenance tracking** suppresses accidental hallucination while producing an audit trail, and **backoff, circuit breakers, and per-tenant rate limits** defend against denial-of-wallet while emitting anomaly signal.
- **Durable execution** is the backbone of safe side effects: checkpointed event logs plus HMAC-derived **idempotency keys** deliver exactly-once effect semantics and remove retry-amplification, durable engines (Temporal, Step Functions, Microsoft Agent Framework) provide a tamper-evident audit trail and durable HITL, and **saga compensations** bound the damage of an aborted or hijacked trajectory — but irreversible actions must be gated by human approval *before* execution, since no compensation can truly undo them.
