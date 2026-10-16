# Chapter 29: Graph engineering: dependencies, provenance and multi-agent execution

> **Part:** Part VIII — Engineering Agentic CLIs and Multi-Agent Systems
> **Market evidence:** Explicit owner-requested engineering addition; no new hiring-demand measurement. Existing distributed-systems, agent-security and observability coverage provides the prerequisites.
> **Reader status:** Engineering extension; assumes basic agent architecture and distributed failure concepts
> **Why this chapter exists:** A transcript can describe work without proving its dependencies, source identity or ownership. Graph engineering makes those relationships explicit so Codex, Claude Code and other workers can coordinate, invalidate stale conclusions and recover safely. It also explains what a graph library cannot supply: authorization, effect ownership and verified completion.
> **Source review:** October 5, 2026. Framework documentation is current to retrieval; local release evidence is identified as historical.

---

## What You Must Be Able to Defend

You must identify what each node and edge means, which relationships permit execution, which merely record provenance, and how a changed source invalidates downstream work. You must show how a scheduler decides that work is ready, how several agents claim disjoint assignments, and how recovery distinguishes a failed computation from an effect whose outcome is unknown.

A graph is useful only if its semantics survive an incident. “There is an edge between the agents” is not a contract. State whether the edge means prerequisite, delegation, evidence support, write ownership, data flow or temporal succession. Different edge types imply different validation rules. A dependency cycle may block a release; an evidence cycle may indicate circular corroboration; an execution cycle may be an intentional repair loop.

## Engineering Context

### 1. When a transcript stops being enough

Consider a hypothetical change spanning an API handler, a database query and a user-facing error message. A Codex worker edits the query, a Claude Code worker studies the API boundary, and a checker exercises tenant isolation. The lead reads “tests pass” in the checker report and marks the work complete. The query worker then adjusts the query again. The checker report still exists, but it no longer validates the artifact being delivered.

This failure is not caused by a lack of messages. It is caused by missing relationships. The checker result needs an edge to the exact artifact revision it tested. Completion needs an edge to that accepted check. The later edit changes an input and invalidates the check's applicability. A graph makes the dependency visible and permits a deterministic invalidation rule.

Graph engineering in this chapter means designing typed relationships, state transitions and algorithms around agent work. It does not require a graph database. A small adjacency map, a relational schema or a graph library may be enough. Use a graph when the relationships answer an operational question that a simple queue or list cannot answer reliably.

Chapter 28 supplies semantic advice about which evidence matters. A graph records which evidence supported that advice and whether it is still applicable. Chapter 30 adds the control loop that schedules work and reacts to verification. The combination is stronger than any component alone, provided the graph retains exact identities instead of only attractive labels.

### 2. Distinguish the graph families

| Graph | Typical node | Typical edge | Primary question |
|---|---|---|---|
| Task graph | Assignment with acceptance criteria | prerequisite → dependent | What is ready, blocked or complete? |
| Evidence graph | Source snapshot, claim, check result | supports, contradicts, derived from | Why is this conclusion justified? |
| Knowledge graph | Entity, concept or assertion | typed domain relationship | What related facts can be retrieved? |
| Execution graph | Runtime step or transition | next step or conditional route | What executes next and with which state? |
| Lineage graph | Dataset, model, rubric or release | produced from, evaluated by | Which inputs explain this revision? |

One system can contain several families, but they should not share ambiguous edge meanings. A memory association does not make a task ready. A claim that cites a source does not prove the source is authoritative. A task marked complete does not establish that an external side effect happened only once.

The local RCode Jev implementation report explicitly separates task prerequisites, native evidence provenance and custom learner lineage. It also states that those components do not establish a universal durable executor for all roadmap proposals. This is a useful discipline: describe implemented relationships precisely instead of calling every graph a “brain.” [L1]

## Threat Model and Security Objectives

### 3. Protect relationships as well as content

An attacker may poison an evidence node, forge an edge from an untrusted source to an approved claim, substitute an artifact revision, or cause a worker to complete a task it did not own. A benign race can produce the same outcomes. Protect graph writes with authenticated actor identity, tenant scope, allowed edge types and revision checks.

The graph store can leak sensitive relationships even if node content is encrypted. A query returning “customer A is investigated by team B” reveals information through the relationship itself. Authorize traversal and derived summaries according to the source and tenant scopes. Do not retrieve globally and filter after exposing the result to an agent.

Separate observed facts from supplied metadata. `fresh=True` is a claim unless a trusted collector computed it from the source version and collection time. `supports` is a semantic judgment unless an objective check can demonstrate the relationship. Record who created each edge and with what method. That allows a reviewer to distinguish parser output, model inference and accepted human judgment.

Protect availability with graph-size, traversal-depth, fan-out and query-cost bounds. A malicious dependency chain can prevent useful work; a dense graph can make every change invalidate almost everything. Bounds should produce an explicit diagnostic rather than silently returning a partial graph that appears complete.

### 4. Version the inputs to a conclusion

A source node should identify the original location, immutable content revision, acquisition time, availability time and sensitivity. A derived node should identify its inputs, transformation or rubric version, creator and acceptance state. A check node should identify the exact artifact and environment it checked.

Acquisition time is when your collector obtained data. Availability time is when the data could legitimately have been known for the decision being evaluated. These differ in historical replay. The original AT Brain research recorded a symmetric nearest-signal lookup: such a lookup can link a decision to a later signal. The later source reviewed for this correction uses a prior-only `known_at` predicate instead. Keep these revisions separate: correcting eligibility does not retroactively validate the old report's outcome figures. Adding a graph helps only when edge admission enforces `available_at <= decision_time` using trustworthy availability metadata. The [source-revision record](../research/2026-10-05/review-correction/source-drift.md) identifies the retained evidence and its limits. [L2]

Content hashes help detect changes but do not capture all invalidation causes. Policy revocation, tenant ownership changes, an expired credential, a model revision or a different test environment can invalidate work while source text stays identical. Include those versions in the relevant dependency relationship.

## Architecture

### 5. A task contract and a deterministic readiness rule

Give each task a stable ID, goal, output path or artifact identity, owner, prerequisites, acceptance checks, permitted tools, budget and revision. The owner is an assignment, not an inference from whichever pane happens to look idle. The task should not become complete merely because its worker exited.

A useful lifecycle is pending, ready, claimed, running, verifying, accepted, failed, cancelled or blocked. Accepted means that the required check evidence matches the task's current inputs. If a prerequisite changes, move affected accepted work into a stale or pending state. Preserve the old result for audit rather than rewriting it to appear current.

Readiness requires that all known prerequisites have accepted current results and that the task is otherwise eligible under policy. Unknown prerequisite IDs and accidental cycles should suppress scheduling. A topological order alone is not enough: it orders the graph's nodes but does not assert that any prerequisite actually succeeded.

For a repair loop, keep each attempt's task dependencies acyclic. Represent the retry as a new attempt or an explicit execution transition. Do not disguise an accidental prerequisite cycle as an intentional loop; the former has no defined entry state or stopping rule.

### 6. Evidence closure and invalidation

```text
source snapshot S1 ----derived from----> proposed patch P1
       |                                    |
       +----supports----> boundary claim C1  |
                              |             |
                              +----input----+----> checker result V1
                                                        |
                                                   accepts P1
                                                        |
                                                 delivery receipt D1

Change S1 or P1:
  preserve V1 and D1 historically
  mark dependent conclusions stale
  rerun only checks whose required inputs changed
```

The important property is evidence closure: an accepted outcome has a traversable path to its required source and check revisions. The graph does not guarantee that every edge is correct, but it exposes which relationships must be examined when a claim is disputed.

Invalidation is a reverse-reachability query over the relevant dependency edge types. If a source changes, visit its dependent claims and checks, then their dependent delivery decisions. Avoid invalidating through unrelated similarity or “mentioned together” edges. Otherwise a popular concept node can make every task stale.

For a worked example, suppose a four-stage workflow collects evidence, creates a patch, checks it and assembles delivery. If the patch changes, the check and delivery need renewed evidence; collection may remain valid. If only a prose description of delivery changes, patch tests need not rerun unless that prose is itself an acceptance input. This example is architectural, not a measured runtime. It explains how precise edges save work without weakening verification.

### 7. Shared state needs reducers and write ownership

Parallel workers cannot safely “update shared state” without a merge contract. Some fields have one writer, such as the final patch for a particular file. Others can be combined, such as append-only observations keyed by event ID. A list append is not automatically safe under retries because replay can append the same observation twice.

Define a reducer for every multi-writer field. A reducer should specify duplicate handling, ordering and conflict behavior. A set union may suit observed source IDs; it does not suit competing authorization policies. “Last writer wins” can erase a security failure with a later optimistic summary.

Use immutable worker outputs and a single integration owner when the work affects the same artifact. Parallelize genuinely independent reads and disjoint writes. A collector should provide one frozen source packet to workers when source consistency matters. Giving each worker a separate live scrape can create disagreement caused by changing inputs rather than independent reasoning.

### 8. The effect owner sits below the graph

A graph scheduler can select a node, yet another worker can select it concurrently. Durable state written after execution does not prevent both workers from performing the effect first. Ownership must be established before the operation, and stale ownership must be rejected at the effect boundary.

Use an atomic claim with an owner identity, lease and monotonically increasing fencing token. The token lets a resource reject operations from a worker whose lease expired and was replaced. A lease without enforcement at the resource only coordinates cooperative workers; it does not stop a paused old worker from acting later.

Give externally observable operations an idempotency identity based on the logical action, not an attempt number. Bind that identity to a payload digest so a reused key with different arguments is rejected. If the destination supports neither idempotency nor transactional coordination, acknowledge the uncertainty and design reconciliation or compensation.

A local source-review experiment retained under RCode's Jev/graph research demonstrated two mock effects before one optimistic session conflict in graph-flow. The test establishes a specific failure mode: post-effect storage conflict detection does not imply pre-effect ownership. It is historical, controlled evidence, not a fresh benchmark of every framework version. [L3]

## Implementation

### 9. A complete dependency and invalidation example

The following standard-library example implements a task dependency graph and detects unknown references and cycles. It also computes the affected closure when an input changes. It is intentionally a graph primitive, not a durable scheduler: it provides no leases, permissions, persistence or tool execution.

```python
from collections import deque
from dataclasses import dataclass
from graphlib import TopologicalSorter

@dataclass(frozen=True)
class Task:
    id: str
    prerequisites: frozenset[str]

class TaskGraph:
    def __init__(self, tasks: tuple[Task, ...]) -> None:
        self.tasks = {task.id: task for task in tasks}
        if len(self.tasks) != len(tasks):
            raise ValueError("duplicate task id")
        unknown = set().union(*(t.prerequisites for t in tasks)) - self.tasks.keys()
        if unknown:
            raise ValueError(f"unknown prerequisites: {sorted(unknown)}")
        dependencies = {t.id: t.prerequisites for t in tasks}
        self.order = tuple(TopologicalSorter(dependencies).static_order())
        self.dependents: dict[str, set[str]] = {task.id: set() for task in tasks}
        for task in tasks:
            for source in task.prerequisites:
                self.dependents[source].add(task.id)

    def ready(self, accepted: frozenset[str], stale: frozenset[str],
              claimed: frozenset[str]) -> tuple[str, ...]:
        current = accepted - stale
        return tuple(task_id for task_id in self.order
                     if task_id not in current and task_id not in claimed
                     and self.tasks[task_id].prerequisites <= current)

    def affected(self, changed: frozenset[str]) -> frozenset[str]:
        if not changed <= self.tasks.keys():
            raise ValueError("unknown changed node")
        seen = set(changed)
        queue = deque(changed)
        while queue:
            node = queue.popleft()
            for dependent in self.dependents[node] - seen:
                seen.add(dependent)
                queue.append(dependent)
        return frozenset(seen)

graph = TaskGraph((
    Task("collect", frozenset()),
    Task("patch", frozenset({"collect"})),
    Task("check", frozenset({"patch"})),
    Task("deliver", frozenset({"check"})),
))
assert graph.ready(frozenset(), frozenset(), frozenset()) == ("collect",)
stale = graph.affected(frozenset({"patch"}))
assert stale == frozenset({"patch", "check", "deliver"})
assert graph.ready(frozenset(graph.tasks), stale, frozenset()) == ("patch",)
```

The caller supplies the accepted and stale sets. In production, derive them from authenticated receipts that bind tasks to current input versions. Otherwise the algorithm is correct while its inputs are false. Add a cycle fixture, an unknown reference and a duplicate task ID when evaluating the primitive. A test for readiness should include a prerequisite that completed execution but failed its acceptance check.

### 10. Choose the smallest graph implementation that meets the contract

| Option | Appropriate use | What you still own |
|---|---|---|
| Standard-library adjacency and topological ordering | Small bounded dependency and invalidation queries | Persistence, authorization, task lifecycle and effects |
| NetworkX or petgraph | Graph algorithms, diagnostics and analysis in the existing language | Application semantics and execution safety |
| Pydantic Graph | Typed Python transitions and state-oriented workflows | Version-specific API selection, authority and external-effect semantics |
| LangGraph | Stateful orchestration, checkpoints, conditional routes and interrupts | Valid policy, source freshness, idempotent effects and acceptance criteria |
| Graph database or knowledge-graph service | Large persistent relationship retrieval with justified query needs | Tenant authorization, assertion provenance and retention |

The fetched LangGraph documentation separates thread-scoped checkpointers from cross-thread stores. An in-memory saver does not survive process restart. Persistence is therefore an implementation choice, not a consequence of calling a framework “durable.” Its current fault-tolerance documentation also provides retries, timeouts and error handlers; those features need application-specific retry classifications and effect reconciliation. [G1, G2]

Pydantic Graph's fetched documentation presents typed graph-oriented Python workflows. Use the API appropriate to the installed release and inspect its persistence and execution semantics before adopting it. Type annotations can constrain state shapes but cannot prove that a tool call was authorized or that a check applies to the current artifact. [G3]

Avoid introducing a second scheduler simply to gain a diagram. If a CLI already owns tool execution and cancellation, reuse that owner and expose graph diagnostics or an external assignment layer at a clear boundary. Replacing the executor creates new lifecycle and permission responsibilities even when the new library saves graph-algorithm code.

### 11. A portable worker contract for Codex and Claude Code

Give each worker a bounded assignment containing task ID, run ID, input revision, allowed output location, acceptance check, dependencies and deadline. The worker returns an immutable report containing observed facts, produced artifacts, executed checks, unresolved uncertainty and process status. The integration owner accepts the result only if those identities still match.

Native subagents and separately launched CLI processes differ. Claude Code's fetched team documentation describes separate contexts, shared tasks and direct teammate communication, and marks teams experimental. It also distinguishes interactive teams from headless `-p` execution. A Codex adapter should rely on its verified host capabilities rather than copying Claude's team assumptions. [A1]

A portable orchestrator can coordinate both through explicit process adapters and shared artifacts. It should not equate “session resumed” with “task recovered,” “message delivered” with “assignment accepted,” or an idle screen with a completed result. Observe the adapter's supported event or receipt and reconcile outstanding work.

Do not let a semantic router invent team members. The runtime discovers the actual roster and capabilities; Chapter 28's judgment may choose among that validated set. Likewise, a worker's explanation that another worker is finished is not authoritative task state.

## Production Failure Modes

### 12. Common graph failures and their evidence

**Circular evidence:** Two agents cite one another's summaries and appear to corroborate a claim. Trace the source closure. If both derive from the same unverified statement, there is one source rather than two independent confirmations. Store upstream source identity and distinguish agreement from independence.

**Stale acceptance:** A checker result remains green after the artifact changes. Bind the result to artifact, oracle and environment revisions and invalidate on changed required inputs. Preserve the old green result as historical evidence instead of relabeling it as a current check.

**Orphaned ownership:** A worker crashes, its lease expires, and a replacement starts while the old process later resumes. Fencing must reach the effect destination. A graph row that says “replacement owner” is insufficient if the old worker can still mutate the resource.

**Lost or duplicate updates:** Parallel nodes append reports or increment counters during retry. Define reducers and event identities. For a counter, either apply an event once or derive the value from a deduplicated event log. Blind replay changes state without new work.

**Misleading durability:** A framework saves graph state but not the external action's receipt. Recovery reexecutes the node and repeats an email, deployment or order. Separate the computation record from the effect identity, persist intent before dispatch, and reconcile uncertain outcomes.

**Unbounded context:** The graph retains every observation and returns the full closure to every model. Bound retrieval to the active task, retain source pointers and fetch detail on demand. A graph can improve selection while worsening token cost if retrieval policy is absent.

### 13. AT Brain and RCode as contrasting case studies

AT Brain's inspected local source records source references and excerpt hashes, and its local ranking and lesson mechanisms consume bounded candidates. That supplies provenance handles, not an independently verified graph of causal availability, source independence or accepted execution. Its `source_sha256` concerns the candidate text; it does not by itself identify every typed metadata field or prove the original full source is unchanged. Bind the complete request and original evidence revision when those fields matter. [L2]

The retained RCode source review covers richer task, evidence and learner relationships, but explicitly warns about development/release divergence and unverified installation parity. Select a coherent source revision before explaining what shipped. A source snapshot with tests from another release is useful research, yet it is not a current product certification. [L1, L3]

These cases support an incremental design: begin with exact source and task identities, add typed relationships, then add scheduler and recovery guarantees only when the workflow needs them. The presence of graph files is not evidence that every graph role is connected or that every transition executes.

## Design Review

Ask for one successful trace and one interrupted trace. The successful trace should show the goal, dependencies, worker claim, input revisions, output artifacts, acceptance checks and delivery. The interrupted trace should show what was persisted before the effect, what the destination observed, how the replacement acquired ownership and why the old worker could not continue.

Inspect whether the graph can answer “which accepted results depend on this source?” and “which exact artifact did this check validate?” Require negative tests for a missing prerequisite, a cycle, stale source, unauthorized edge, duplicate claim and expired owner. Test the original workflow through the actual scheduler boundary, using safe mocked effects where external mutation is unnecessary.

For a knowledge graph, include authorized traversal and deletion propagation. For an execution graph, include crash recovery and idempotency. For a provenance graph, include source replacement and circular support. The test plan should follow the graph's claimed responsibility rather than treating all graph frameworks as equivalent.

## Practical Exercise

Run the dependency example and extend it with two disjoint maker tasks followed by one checker. Demonstrate that the checker becomes ready only after both current outputs are accepted. Add invalidation for one changed maker input and show which work can be reused.

Next, design an evidence record with `available_at`, source revision and upstream source IDs. Construct a replay case where a corroborating event arrives after the decision and demonstrate that edge admission rejects it. Finally, simulate two workers claiming one effect, a crash after destination success and a replacement with a new fencing token. Write the reconciliation evidence required before allowing another dispatch.

## Interview Preparation

### Q1: Why use a graph instead of a transcript or task list?

**Model answer:** A graph helps when dependencies and source relationships must be queried or invalidated. A transcript preserves discussion but may not identify which artifact a check validated. I start with the operational questions, define typed edges and use the smallest storage that answers them. I do not introduce a graph database merely because the application uses agents.

### Q2: What is the difference between a task graph and an execution graph?

**Model answer:** The task graph describes prerequisites and acceptance of assignments. The execution graph controls runtime transitions, including conditional branches and intentional loops. A task graph is commonly acyclic within an attempt, while execution may revisit a repair stage. Mixing those meanings can make an accidental dependency cycle look executable even though it has no valid entry condition.

### Q3: Does a persisted checkpoint prevent duplicate effects?

**Model answer:** No. A checkpoint can restore computation state while an external action remains uncertain. I establish ownership before dispatch, use destination-enforced idempotency and payload identity where supported, persist intent, and reconcile outcomes before retry. Post-effect optimistic storage conflicts do not prove only one effect happened.

### Q4: How do you invalidate evidence after a code change?

**Model answer:** I bind checks and conclusions to exact source and artifact revisions, then traverse reverse dependencies over the edge types that actually affect correctness. I mark affected results stale while preserving their history. I rerun required checks for changed inputs and reuse unaffected accepted evidence.

### Q5: How do you merge parallel agent outputs?

**Model answer:** I prefer immutable reports and disjoint writers with one integration owner. Shared fields require explicit reducers and duplicate identities. Set union can work for observations; last-writer-wins is unsuitable for conflicting policies or acceptance states. A result is accepted against its assignment and current inputs, not simply because it arrived last.

### Q6: How do you prove two agents provide independent corroboration?

**Model answer:** I trace upstream evidence lineage. Separate prompts, model names or signal labels do not establish independent sources. If both reports derive from one assertion, I count one source and record agreement separately. For evaluated decision support, I also check causal availability and correlated error across issue groups.

### Q7: What do fencing tokens add beyond leases?

**Model answer:** A lease tells cooperative workers who should own the operation now. A fencing token lets the resource reject stale owners even if an old process resumes after its lease expires. The destination must enforce the token or an equivalent compare-and-set condition; merely storing it in the graph is not enough.

### Q8: How would you coordinate Codex and Claude Code reliably?

**Model answer:** I use a shared assignment and result contract with host-specific adapters. I discover actual capabilities and sessions, preserve per-worker input and artifact identities, keep writers disjoint and collect completed evidence. Claude's interactive team behavior is not assumed to exist in headless runs or another CLI. The scheduler owns task state and acceptance; model messages supply findings.

## Chapter Summary

Graph engineering makes dependencies, evidence and ownership explicit. Its value comes from typed edge meanings, immutable revisions, deterministic readiness and precise invalidation. Algorithms and framework persistence do not establish authorization or exactly-once effects. Keep computation, effect ownership and acceptance separate, trace upstream source independence, and require causal availability in replay. A reliable multi-agent graph answers why work is ready and why its result is still valid.

## Further Study

- **G1:** LangGraph, [Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) and [Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers). Fetched October 5, 2026; the legacy durable-execution URL redirected to the persistence overview.
- **G2:** LangGraph, [Fault tolerance](https://docs.langchain.com/oss/python/langgraph/fault-tolerance) and [Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts). Fetched October 5, 2026.
- **G3:** Pydantic, [Graph documentation](https://ai.pydantic.dev/graph/). Fetched October 5, 2026; API details require installed-version verification.
- **A1:** Claude Code, [Agent teams](https://code.claude.com/docs/en/agent-teams) and [Subagents](https://code.claude.com/docs/en/sub-agents). Fetched October 5, 2026.
- **L1:** Local [RCode Jev implementation report](../../../RCODE-BCB/JEV/RCODE_JEV_ENGINEERING.md), including graph roles and source-version limits.
- **L2:** Fixed [original AT Brain Technical and QA Report](../research/2026-10-05/review-correction/reports/AT_BRAIN_TECHNICAL_QA_REPORT.html), [later evidence vocabulary](../research/2026-10-05/review-correction/current/evidence.py), [later replay helper](../research/2026-10-05/review-correction/current/replay_capture_at.py), and [source-revision record](../research/2026-10-05/review-correction/source-drift.md). The original code-revision recovery gap and later v2 report are explicitly distinguished.
- **L3:** Local [open-source reuse assessment](../../../RCode/research/jev-graph-2026-09-21/REVIEW.md), including the retained graph-flow concurrency characterization and petgraph decision.
- Local graph-research foundation: `RCODE-BCB/Graphing/graph-and-jev-engineering-report.html` and its retained source inventory.
- Chapters 6, 8, 18, 20 and 21 for authority, telemetry, distributed failure and lineage; Chapters 28 and 30 for judgments and control loops.
- [Research notes and source receipts](../research/2026-10-05/RESEARCH_NOTES.md).
