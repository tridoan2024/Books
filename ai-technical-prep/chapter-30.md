# Chapter 30: Loop engineering: bounded execution and verified multi-agent outcomes

> **Part:** Part VIII — Engineering Agentic CLIs and Multi-Agent Systems
> **Market evidence:** Explicit owner-requested engineering addition; no new hiring-demand measurement. Chapters 8, 11, 18 and 20 retain ownership of the foundational security, evaluation, telemetry and distributed-systems material.
> **Reader status:** Engineering extension; read Chapters 28–29 first
> **Why this chapter exists:** An agent that can call tools is not yet a reliable worker. Loop engineering defines how a goal becomes bounded action, how results are checked, how retries respond to evidence, and how single-CLI or multi-agent work stops with an honest outcome. This chapter integrates typed judgments and graphs while preserving execution authority and independent acceptance evidence.
> **Source review:** October 5, 2026. Current framework guidance is attributed to fetched sources; examples are offline demonstrations rather than production certifications.

---

## What You Must Be Able to Defend

You must define the goal, acceptance check, resource budget, stopping rule and escalation path of a loop. You must distinguish provider retries, tool retries and semantic repair attempts, identify which owner can execute an effect, and explain recovery when an action may have succeeded but its response was lost.

You must also defend the value of another iteration. “The model can try again” is not a reason to continue. A retry should address a changed input, repaired prerequisite, actionable check result or transient condition with a bounded recovery policy. If the loop keeps receiving the same failure without changing its approach, it is spending resources rather than making progress.

## Engineering Context

### 1. Activity is not an outcome

Imagine a hypothetical CLI fixing a tenant-isolation defect. It edits the query, runs tests and receives a failing assertion. It changes a fixture, reruns the tests and reports success. The transcript shows substantial activity. The system may still be insecure because the check was weakened rather than the defect repaired.

A second failure is operational. A lead starts a checker process, sees no new output and starts another. The original checker was still running. Both now write the same report path, and the lead cannot tell which patch revision the final file represents. A third failure is economic: nested provider retries and repair loops multiply requests long after the overall deadline.

Loop engineering gives these failures explicit boundaries. It controls the sequence from observation to proposal, execution, verification and disposition. It does not make the model infallible. It makes failures detectable and gives them a defined next state.

Use a loop when feedback can change the next action. A deterministic formatting task that passes its check needs no repeated planning. A small observed bug should use proportionate investigation, repair and verification. A substantial migration may justify planned parallel work and release gates. The architecture should scale to the user's actual goal rather than forcing every request through the most expensive process.

### 2. The model's inner loop and the application's outer loop

A coding CLI has an inner loop that obtains model output, executes tools and returns tool results. The surrounding application may have an outer loop that launches assignments, observes artifacts, runs acceptance checks and decides whether another attempt is warranted. A fleet adds further loops inside each worker.

Identify one owner for every state transition and every effect. If the CLI owns tool execution, an external supervisor should not duplicate those tools through a second uncoordinated executor. If the supervisor owns final acceptance, the maker's own statement that work is complete is an input rather than the acceptance decision.

Chapter 28's judgment can prioritize evidence or recommend an escalation. Chapter 29's graph can identify ready work and stale checks. The loop controls when those components run and whether their evidence permits another step. The components remain distinct so that a model recommendation does not silently become a scheduler mutation or an authorization grant.

## Threat Model and Security Objectives

### 3. Model-controlled stopping is a trust boundary

An attacker can attempt to make the agent stop early, continue indefinitely, suppress a failed test, execute a repeated effect or ask for broader permissions. A compromised repository can alter the test harness, local hooks or an MCP server the worker loads. A checker that shares the maker's full conversation can repeat the maker's unsupported assumptions.

Protect the acceptance contract from the maker's own output. The user or application defines what must be true; the worker proposes an artifact. A deterministic test, separately controlled rubric or appropriately isolated checker evaluates it. Use the cheapest check that actually distinguishes acceptable from unacceptable work, and add review only for a concrete risk or required gate.

Protect execution authority independently of the plan. A plan may contain a deployment step, but that text does not authorize deployment. Capabilities should remain scoped by actor, operation, resource, tenant and expiry. Revalidate time-sensitive authority at execution, especially after queue delays, resumed sessions or replanning.

Protect availability with total budgets and bounded output. A model can produce a very large plan or repeated tool calls; a worker can emit unbounded logs; an oracle can hang. The total deadline must cover all relevant subprocesses and checks. Do not apply a timeout only to model generation and call the entire workflow bounded.

### 4. Preserve the difference between failure and uncertainty

Use explicit outcome states. Success means required checks passed for the current artifact. Failed means a required condition is false or a recoverable attempt failed. Inconclusive means the evidence cannot decide. Cancelled means work was deliberately interrupted. Budget exhausted means resource limits ended the attempt. Effect unknown means an external mutation might have happened and needs reconciliation.

These states have different next steps. An inconclusive check needs missing evidence or a stronger oracle. An unknown effect needs destination inspection. A syntax error needs a repair. Treating them all as “retry” is a source of duplicate mutation, inflated costs and dishonest completion reports.

## Architecture

### 5. The loop contract

| Field | Engineering meaning | Example for a coding task |
|---|---|---|
| Goal | Intended behavior and scope | Prevent a caller from reading another tenant's profile |
| Oracle | Evidence that discriminates acceptance | Positive own-tenant and negative cross-tenant tests on the current patch |
| Budget | Total permitted resources | Bounded attempts, elapsed time, provider calls and cost |
| Stop condition | Success, irrecoverable failure, cancellation, stagnation or exhausted budget | Deliver only after required checks pass; stop repeated unchanged failures |
| Escalation path | Who resolves missing authority or essential evidence | Return the exact unresolved check and what information would change it |

The contract must name the artifact and inputs it applies to. If the goal changes, version the contract. If only a test result changes, preserve the same goal and record the new evidence. A resumed conversation should restore the accepted contract and outstanding work rather than inventing a fresh objective from the newest message.

An oracle can be a parser, test, property, rubric, separate model judgment or human review. Different tasks need different evidence. Compilation is a useful syntax check but cannot prove tenant isolation. A model's stylistic review can help evaluate prose but cannot prove that an endpoint returns the documented bytes. Match the check to the behavior.

### 6. State transitions and feedback

```text
Observe current evidence
        |
        v
Plan one permitted next step
        |
        v
Claim ownership and execute
        |
        v
Verify current artifact
   /          |            \
pass       actionable     inconclusive or unknown effect
 |           failure                   |
 v              |                      v
done       budget + progress?      collect/reconcile/escalate
             /       \
           yes        no
            |          |
      revise plan    stop honestly
```

A plan should be as detailed as the task needs. For a narrow fix, the next action might be one source read that tests the leading cause. For a fleet migration, it may be a graph of assignments with owners and acceptance checks. Planning is not itself useful progress unless it changes what the runtime can execute or what the checker can discriminate.

Store observations separately from hypotheses. “The process exited with code zero” is observed. “The user workflow is repaired” is a hypothesis until the relevant behavior is checked. In multi-agent work, the lead integrates completed results; a ready worker can receive useful follow-up work, but an idle worker need not be kept busy when no required dependency is ready.

### 7. Progress must change the evidence or prerequisite

Define progress in terms of the task. A patch changed the behavior under test; a missing dependency was restored; a source revision changed; an oracle produced new actionable feedback. Another paragraph describing the same failure is not progress.

A stagnation detector can compare attempt signatures containing artifact revision, check identity and failure category. Repeated identical signatures suggest the prerequisite is unchanged. This detector should not override valid new user input or a real source change. It is a guard against repeating work, not permission to abandon a difficult task prematurely.

Do not optimize only for reduced iterations. A model can appear efficient by skipping checks or silently narrowing the goal. Measure verified completion against the same contract. Likewise, “more agents” is not a progress metric; independent work is useful only when its results contribute to required acceptance.

### 8. Budget the whole hierarchy

Provider retries handle transport failures. Tool retries handle an operation's temporary failure. Semantic repair attempts change an artifact after a failed check. Fleet retries replace or resume a worker. These layers must share an overall cap.

As an illustrative bound, four outer attempts with three provider attempts at each of two stages can permit up to `4 × 3 × 2 = 24` provider requests, before counting any subagents. The numbers are hypothetical configuration values. The arithmetic shows why setting “three retries” in every component is not a total resource limit.

Reserve budget before dispatch, record actual consumption, and treat missing accounting as unknown rather than free. A token budget is not a wall-clock budget; a fast model can wait on a slow tool. A local computation with zero provider calls can still block a latency-sensitive workflow.

Use bounded retries only for relevant transient conditions. A deterministic permission denial needs a changed authority prerequisite; repeatedly retrying it is neither recovery nor permission. A malformed request needs correction. A timeout after a non-idempotent effect requires reconciliation before another attempt.

## Implementation

### 9. A complete bounded offline repair loop

This standard-library example uses a deterministic maker and oracle so the loop can be executed without a model, network or mutation. It demonstrates acceptance, repeated unchanged failure and resource stopping. It does not provide persistence or hard interruption of a blocking function; production adapters must enforce deadlines inside execution and verification.

```python
from dataclasses import dataclass
from enum import Enum
from time import monotonic
from typing import Callable

class Verdict(Enum):
    PASS = "pass"
    FAIL = "fail"
    INCONCLUSIVE = "inconclusive"

@dataclass(frozen=True)
class Check:
    verdict: Verdict
    feedback: str

@dataclass(frozen=True)
class Budget:
    attempts: int
    seconds: float

@dataclass(frozen=True)
class Result:
    status: str
    artifact: str
    attempts: int
    feedback: str

def run_loop(maker: Callable[[str, float], str],
             oracle: Callable[[str, float], Check],
             budget: Budget) -> Result:
    if budget.attempts < 1 or budget.seconds <= 0:
        raise ValueError("invalid budget")
    deadline = monotonic() + budget.seconds
    feedback = "Produce the required artifact."
    previous: tuple[str, str] | None = None
    artifact = ""
    for attempt in range(1, budget.attempts + 1):
        if monotonic() >= deadline:
            return Result("budget_exhausted", artifact, attempt - 1, feedback)
        artifact = maker(feedback, deadline)
        if monotonic() >= deadline:
            return Result("budget_exhausted", artifact, attempt, feedback)
        check = oracle(artifact, deadline)
        if monotonic() >= deadline:
            return Result("budget_exhausted", artifact, attempt, check.feedback)
        if not check.feedback:
            raise ValueError("oracle feedback must be explicit")
        if check.verdict is Verdict.PASS:
            return Result("success", artifact, attempt, check.feedback)
        if check.verdict is Verdict.INCONCLUSIVE:
            return Result("inconclusive", artifact, attempt, check.feedback)
        signature = (artifact, check.feedback)
        if signature == previous:
            return Result("stalled", artifact, attempt, check.feedback)
        previous = signature
        feedback = check.feedback
    return Result("budget_exhausted", artifact, budget.attempts, feedback)

def exact_oracle(artifact: str, deadline: float) -> Check:
    if monotonic() >= deadline:
        return Check(Verdict.INCONCLUSIVE, "Deadline elapsed.")
    if artifact == "tenant-scoped":
        return Check(Verdict.PASS, "Exact demonstration criterion satisfied.")
    return Check(Verdict.FAIL, "Return tenant-scoped.")

def repairing_maker(feedback: str, deadline: float) -> str:
    return "tenant-scoped" if feedback == "Return tenant-scoped." else "unscoped"

def unchanged_maker(feedback: str, deadline: float) -> str:
    return "unscoped"

assert run_loop(repairing_maker, exact_oracle, Budget(3, 1.0)).status == "success"
assert run_loop(unchanged_maker, exact_oracle, Budget(3, 1.0)).status == "stalled"
assert run_loop(repairing_maker, exact_oracle, Budget(1, 1.0)).status == "budget_exhausted"
```

The exact string oracle is a teaching fixture, not a security test. A real tenant-isolation oracle would exercise authorized and unauthorized calls against the changed query and bind the result to the current artifact. The example's stagnation signature is deliberately simple; real systems should include revisions and failure categories so a changed prerequisite is not mistaken for repetition.

### 10. Supervise a CLI through its actual lifecycle

A process adapter should record the executable identity, invocation arguments, working directory, session or run ID, permitted tools, deadline, output limit and ownership. It should parse the host's structured events when supported and preserve stderr separately from result content. An exit code of zero is process evidence, not acceptance evidence.

Claude Code's fetched headless documentation describes `claude -p`, JSON and streaming JSON output, tool controls, session continuation and signal behavior. It also notes that headless execution can load project hooks and MCP configuration, and distinguishes a bare mode that changes what configuration loads. Repository startup code belongs in the trust model; a nominally read-only prompt does not prove every configured startup component is inert. [A1]

For Codex, the fetched upstream exec source includes JSON events, an output-schema option and resume-related CLI structures. Its public documentation pages were blocked by the network filter. Therefore these are source-level observations at a recorded commit, not a fresh installed-CLI workflow test. Use the installed command's documented contract and a safe fixture before relying on exact flags or event shapes. [C1]

Cancellation should reach the owned process tree and prevent new dispatch. Before starting a replacement, verify that the prior owned process and workers exited or that fencing prevents their effects. Do not restart another user's CLI because a roster or shell state is ambiguous. If cleanup cannot be confirmed, report that uncertainty and reconcile ownership before mutation.

A subprocess timeout needs a cleanup policy. A CLI may have started grandchildren, background commands or a server. Killing only the immediate PID can leave work running. Use the platform's supported process-group or job-control mechanism and the CLI's graceful cancellation behavior, then inspect the owned survivors. Preserve the evidence needed to resume rather than erasing interrupted work.

### 11. Multi-agent execution without duplicated supervision

Use a lead when integration and acceptance need one owner. Give workers distinct outputs and real dependencies. A collector can freeze source evidence while a maker edits a bounded artifact and a checker independently examines the required behavior. Start independent work when its inputs are ready; do not serialize every assignment behind an unrelated worker.

The graph from Chapter 29 determines eligibility and ownership. A judgment from Chapter 28 may prioritize eligible work. The loop observes results and decides whether required gaps remain. It should not launch another review merely because a turn ended or keep workers producing reports after acceptance is met.

A checker needs enough task context to apply the oracle but should not be persuaded by the maker's full narrative. Supply the goal, current artifact, relevant source evidence and check contract. If the checker identifies a defect, the lead verifies applicability, assigns the smallest repair and obtains renewed evidence for the changed part. Preserve a still-valid independent review when unrelated work does not invalidate it.

Claude Code's team documentation marks agent teams experimental, describes separate teammate contexts and warns of lifecycle and coordination limitations. It also says headless `-p` sessions do not spawn teammates even when teams are enabled. A portable fleet should therefore use verified adapters or supported native host controls rather than assuming all interactive team behavior survives a headless wrapper. [A2]

### 12. Checkpoint computation and reconcile effects separately

Persist the contract revision, task graph revision, current artifact identity, accepted evidence, outstanding assignments and resource ledger. A transcript helps reconstruct reasoning; it does not necessarily prove the effect destination's state. Keep an intent and receipt record for effects, with idempotency identity and payload digest.

If a worker crashes after an external action succeeds but before its receipt is stored, mark the effect unknown. Query the destination by stable identity or reconcile observed state. Retry only when that evidence and the effect contract permit it. Where a destination cannot provide idempotency or status inspection, define compensation or manual resolution instead of promising exactly-once delivery.

LangGraph's fetched persistence guidance distinguishes thread checkpoints from cross-thread stores, and its interrupt guidance supports pausing and resuming work through explicit runtime state. Its current fault-tolerance guidance adds retries, timeout controls and recovery handlers. These mechanisms help implement a loop, but they do not prove your effects are safe to replay or your restored permissions remain valid. [G1, G2]

Resume from accepted evidence, then revalidate time-sensitive prerequisites. A persisted approval can be expired; a source can be replaced; a worker can have lost its lease. Replaying history should not silently revive authority that no longer exists.

## Production Failure Modes

### 13. Retrying the wrong layer

A provider timeout may warrant a bounded transport retry. A failed test warrants an artifact repair. An inaccessible source needs a new evidence path or an honest limitation. A rejected command needs its actual prerequisite changed. Repeating the same invocation across all these conditions wastes resources and can obscure the original cause.

Record failure category and the proposed corrective action. If the corrective action does not alter the failed prerequisite, ask why another attempt could succeed. Backoff is useful for transient service overload; it does not repair a malformed request or missing permission.

### 14. Verification that rewards the wrong behavior

The maker may remove a failing test, change its expected value, or satisfy a textual rubric without preserving the user's intended behavior. Keep protected acceptance fixtures, inspect changes to tests and compare the delivered artifact with the original contract. An independently controlled checker reduces shared assumptions but does not remove all judge error.

A semantic citation check is useful only with the actual source passage. A deterministic number match proves matching strings under its normalization rules, not that a citation supports the claim's meaning. AT Brain's J5 exact-value audit is a useful boundary, but it should not be presented as full semantic source verification. [L1]

### 15. Sidecars that delay the critical path

AT Brain is described as default-off and advisory, with a local deterministic backend and an optional remote reference. That is a sound separation of responsibilities. Yet “advisory” and “fail open” describe authority and exception behavior, not latency isolation. A slow synchronous advisory or file write can delay its caller even if errors are swallowed. Any future integration needs a measured deadline, bounded queue or asynchronous design appropriate to the application's critical path. [L1]

Likewise, `action_authorized=False` is a useful receipt field but not a universal sandbox. Inspect imports, tool exposure, process permissions and caller behavior to establish the actual boundary. A consumer can still misuse advice unless its own execution contract checks authority.

### 16. Learning from the loop without self-certification

The loop can collect decisions and outcomes for later improvement, but generating more training examples is not the same as repairing the current user task. Keep optional learning outside required delivery unless the learning itself is the request or resolves a concrete essential gap.

Separate observed outcomes, reconstructed scenarios and model-generated labels. The original AT Brain research contrasted the learner's time and split gates with an earlier symmetric replay lookup. The later helper reviewed for this correction uses `_nearest_prior`, requiring corroborator `known_at` to be at or before the decision and within the lookback window. These are different source revisions, not evidence that the same defect remains in the later helper. Nor does the predicate change validate the old report's statistics: a new end-to-end evaluation must bind the input data, availability semantics, engine and replay revision. A temporal safeguard in one module does not certify every data path. Evaluate causal availability at each feature admission point and consult the [fixed source packet and revision limits](../research/2026-10-05/review-correction/source-drift.md). [L2]

For a new rubric or ranker, use frozen grouped evaluations, an unchanged baseline, independent outcomes and expected-parent activation. Do not let a candidate repeatedly inspect the final set while calling it held out. Store rejected and shadow candidates honestly, and keep rollback tied to the exact prior revision.

## Design Review

Ask for a successful run, an unchanged-failure run, an inconclusive run and a crash after an effect. For each, inspect the contract, artifact identity, oracle evidence, budget ledger, worker state and final disposition. A useful review explains why the loop stopped and what specific evidence would allow it to continue.

Run checks through the actual workflow boundary with safe mocked mutations when external effects are unnecessary. Include cancellation during a real tool, cleanup before replacement, changed-source invalidation and a maker that tries to weaken its checker. Verify the user-visible behavior, not only endpoint timing or a helper's isolated return value.

Measure cost per verified outcome, required-check failure, attempts to acceptance, stagnation, unresolved effects and stale-result rejection. Keep operational success separate from domain success. A clean process exit can be a runtime success while the task remains inconclusive; a sound advisory architecture can coexist with an unproven forecasting claim.

## Practical Exercise

Run the offline loop and add an oracle that returns inconclusive when required evidence is missing. Confirm that the loop stops with the missing evidence instead of repeatedly asking the maker to guess. Add a bounded maker failure and demonstrate the difference between a transport retry and a semantic repair.

Then combine the Chapter 29 graph with the Chapter 28 routing fixture. Only ready tasks may be recommended, only current owners may execute, and only oracle-accepted artifacts may become complete. Simulate a stale checker report, a cancelled worker and a changed source. Finally, design the reconciliation record for a lost deployment response, using a mocked destination rather than performing a deployment.

## Interview Preparation

### Q1: What makes an agent loop reliable?

**Model answer:** Reliability comes from an explicit goal, discriminating oracle, total budget, stopping rule and escalation path. I bind checks to current artifacts, keep execution authority outside model proposals, and distinguish success from inconclusive or unknown effects. I also require each retry to change evidence or address a real transient condition.

### Q2: How do you decide whether another iteration is worthwhile?

**Model answer:** I identify the essential gap and the action that can change its evidence or prerequisite. Actionable failed checks can justify repair; unchanged failures do not justify endless repetition. I preserve valid results, observe the total budget and stop with the exact unresolved condition when no permitted action can resolve it.

### Q3: Why is exit code zero insufficient evidence of completion?

**Model answer:** It establishes that the process ended according to its own exit convention. It does not prove the artifact meets the user's acceptance criteria or that required checks ran against the latest revision. I accept task completion from current oracle evidence and artifact identity, while recording process status separately.

### Q4: How do you control nested retry costs?

**Model answer:** I distinguish provider, tool, repair and worker retries and give them a shared total budget. I reserve resources before dispatch, bound each stage by the remaining deadline, and record actual usage. A local retry limit at every layer can multiply total requests, so it is not an overall cap.

### Q5: What happens after a crash with an uncertain external action?

**Model answer:** I preserve intent and mark the effect unknown. I reconcile the destination using a stable idempotency identity and payload digest, then resume only under the effect contract. I do not replay merely because the graph checkpoint is old. If the destination cannot establish status, I use compensation or an explicit unresolved outcome.

### Q6: How do you prevent a maker from gaming verification?

**Model answer:** I protect the acceptance contract, bind checks to the current artifact, inspect changes to tests, and use independent evidence where the risk requires it. The maker can suggest a changed fixture, but it cannot redefine success merely to turn a test green. I also evaluate judges for correlated error rather than assuming another model is an objective oracle.

### Q7: How do you supervise Codex and Claude Code workers safely?

**Model answer:** I use verified host adapters with explicit executable, working directory, session, tool policy and deadline. I parse supported events, preserve artifacts and independently check outcomes. Cancellation reaches the owned process tree; replacement follows confirmed exit or effective fencing. I do not assume that one CLI's interactive team behavior matches another host or headless execution.

### Q8: Does an advisory fail-open sidecar have no operational risk?

**Model answer:** No. It may still add latency, blocking I/O, data exposure or misinterpreted scores. Fail-open should name the baseline that continues, while authority remains in the original executor. I bound advisory resources, verify the actual call path and measure the critical-path impact before relying on it in a time-sensitive system.

### Q9: How do Jev, graphs and loops fit together?

**Model answer:** The judgment answers a bounded semantic question, the graph records prerequisites and evidence relationships, and the loop manages execution, verification and stopping. The scheduler supplies eligible options; policy supplies authority; the oracle supplies acceptance evidence. Combining them does not remove those ownership boundaries or turn probability into permission.

## Chapter Summary

Loop engineering turns repeated agent activity into bounded, verifiable work. Define acceptance before iteration, preserve current artifact and source identity, and distinguish actionable repair from unchanged failure. Share budgets across nested loops, supervise actual CLI lifecycles, reconcile uncertain effects and stop when the user's contract is met. Typed judgments and graphs strengthen the loop when they clarify evidence and ownership; they cannot replace authority checks or outcome verification.

## Further Study

- **A1:** Claude Code, [Run programmatically](https://code.claude.com/docs/en/headless). Fetched October 5, 2026; configuration loading, signal behavior and structured output are version-sensitive.
- **A2:** Claude Code, [Agent teams](https://code.claude.com/docs/en/agent-teams) and [Subagents](https://code.claude.com/docs/en/sub-agents). Fetched October 5, 2026.
- **C1:** OpenAI Codex, [exec source at the retrieved revision](https://github.com/openai/codex/blob/3f1ccb7ceb814e54314826f68d61c892e2f5a48e/codex-rs/exec/src/cli.rs). The official documentation pages were blocked; installed behavior was not freshly tested.
- **G1:** LangGraph, [Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) and [Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts). Fetched October 5, 2026.
- **G2:** LangGraph, [Fault tolerance](https://docs.langchain.com/oss/python/langgraph/fault-tolerance). Fetched October 5, 2026; verify release support before adopting newer timeout or handler APIs.
- **L1:** Fixed [original AT Brain Technical and QA Report](../research/2026-10-05/review-correction/reports/AT_BRAIN_TECHNICAL_QA_REPORT.html), with [later question implementation](../research/2026-10-05/review-correction/current/questions.py) and [later reference adapter](../research/2026-10-05/review-correction/current/reference.py). See the [source-revision record](../research/2026-10-05/review-correction/source-drift.md) before attributing a historical result to changed code.
- **L2:** Fixed [later replay helper](../research/2026-10-05/review-correction/current/replay_capture_at.py) and [learner](../research/2026-10-05/review-correction/current/learner.py); temporal controls require path-specific verification. The earlier symmetric lookup is a recorded historical observation, not the behavior of this later helper.
- Local prior loop work: [RCode JGL scope](../../../RCode/docs/enhancement/rcode-jgl-brain/SCOPE.md), a project contract rather than proof that every proposed capability shipped.
- Chapters 8, 11, 18, 19 and 20 for security boundaries, evaluation, observability, response and partial failure; Chapters 28–29 for judgments and graphs.
- [Research notes, source hashes and retrieval limits](../research/2026-10-05/RESEARCH_NOTES.md).
