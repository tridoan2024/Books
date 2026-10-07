# Chapter 8: Context Engineering II — Compaction, Editing, and Handoff

> **Reading note.** Named practitioner scenarios and their timings, costs, and outcomes are fictional illustrations unless a specific source is identified. Numerical assumptions are not provider quotes or measured results. Code, commands, configuration, and traces are illustrative pseudocode/API sketches, not executed examples. In particular, `loopkit` is a teaching namespace, not a tested installable SDK. Legacy product attributions marked unverified are not evidence for deployment decisions.

> Every compaction is a bet that you know which details can be safely forgotten. Sometimes you lose the bet.

## The Constraint That Disappeared

Jenna Park's team at a healthcare data startup ran a coding loop that migrated API endpoints from their legacy Flask application to a new FastAPI service. The loop was well-designed in most respects: it read the old endpoint implementation, generated the corresponding FastAPI code with Pydantic models, ran integration tests against both the old and new implementations to verify behavioral equivalence, and iterated until all assertions passed. The Loop Contract included a clear budget, a deterministic oracle (integration tests plus type checking), and an escalation path for endpoints that failed after three attempts.

The skill file contained a critical constraint: "All response bodies must include a `_meta` field containing `api_version`, `deprecated_fields`, and `migration_id` for backward compatibility with mobile clients running version 3.2 and below." This constraint existed because the mobile app parsed this field to determine which response format to expect, and removing it would cause a crash on approximately 40,000 devices that had not yet updated.

The loop worked flawlessly for the first fourteen endpoints. Then, at endpoint fifteen, the context window approached capacity — 187,000 of 200,000 tokens consumed. The system was configured to trigger automatic compaction at 185,000 tokens. The compaction routine summarized the full conversation history into a structured 4,200-token state document listing completed endpoints, the current endpoint under migration, file paths modified, and the current testing status. It preserved the names of the three remaining failing tests and the last error message.

It did not explicitly re-state the `_meta` field constraint.

In this fictional case, the constraint remained in a separate instruction but was omitted from the handoff. That omission and the missing contract test are observable design defects. The narrative does not establish an attention-level cause: after compaction, the newly submitted context is shorter, not still physically 200,000 tokens long. Retest constraint compliance in the actual post-compaction context instead of assuming a positional explanation.

Endpoints sixteen through twenty-three were migrated without the `_meta` field. The integration tests passed because they validated response schemas and HTTP status codes but did not assert the presence of `_meta` specifically — a testing gap that the constraint in the skill file was supposed to backstop. The gap in test coverage compounded with the gap in compaction to produce the failure.

The team discovered the issue three days later when mobile clients running version 3.2 started crashing on the newly migrated endpoints. Eight endpoints needed rework. The compaction had saved the loop from hitting a hard context limit — which would have halted execution entirely — but it had silently dropped the constraint that mattered most. The compaction was locally correct (it preserved the information it deemed important) and globally catastrophic (it omitted the information that was actually important).

This chapter covers what compaction loses, how to design compaction that loses less, and how to build loops that survive context boundaries without silent degradation.

## Compaction as Lossy Checkpoint

Compaction takes a long conversation history — potentially hundreds of messages, dozens of tool results, and multiple rounds of planning and revision — and compresses it into a summary that preserves essential state while discarding supporting detail. It is lossy by design. The full conversation history at the point of compaction might be 150,000 tokens; the compaction summary that replaces it might be 3,000–5,000 tokens \[ESTIMATE: typical range observed in coding loops; actual summary length depends on task complexity and compaction prompt design\]. That is 30:1 to 50:1 compression. You are necessarily discarding 96–98% of the original information.

The question is never "does compaction lose information?" — it always does, by definition. The question is "does the compaction lose information that will be needed by a future step?" And this question cannot be answered with certainty at compaction time, because it requires predicting the future reasoning needs of the loop. The compactor must estimate which details are ephemeral (safe to discard) and which are durable (must be preserved). This estimation is imperfect, and imperfect estimation is the root cause of every compaction failure.

A well-designed compaction preserves five categories of information. First, the current goal and its acceptance criteria — the definition of done that the loop is working toward. Without this, the loop post-compaction has no target. Second, decisions made and their rationale, particularly decisions that rejected alternatives. Without rejection rationale, the loop may re-attempt approaches that have already been tried and failed, wasting iterations on paths known to be dead ends. Third, key facts discovered during execution that cannot be trivially re-discovered — insights about system behavior, edge cases identified, non-obvious interactions between components. Fourth, the current plan including completed and remaining steps, providing a roadmap for continuation. Fifth, active blockers and known issues that affect remaining work.

A well-designed compaction discards: the full verbatim text of tool results (replaced by summaries of what they revealed), reasoning chains that led to abandoned approaches (keeping only the conclusion: "approach X failed because of Y"), superseded plans and intermediate states that no longer reflect reality, the specific sequence of tool calls and model outputs (replaced by outcome descriptions), and any information that can be re-retrieved from the environment if needed (file contents, API responses, test output).

``` python

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Compactor:
    """Produces a structured compaction of loop history.

    Key design principle: constraints from the system prompt are
    explicitly extracted and re-injected into the compaction summary,
    ensuring they remain in a high-attention position post-compaction.
    """

    preserve_categories: tuple[str, ...] = (
        "goal_and_acceptance_criteria",
        "decisions_with_rejection_rationale",
        "discovered_facts_not_retrievable",
        "current_plan_and_progress",
        "active_blockers",
        "critical_constraints",
    )

    def compact(
        self,
        messages: list[dict],
        system_prompt: str,
        current_iteration: int,
    ) -> str:
        """Produce a compaction summary from full message history.

        The implementation calls a model with a compaction-specific
        prompt. This method defines the required structure.
        """
        constraints = self._extract_constraints(system_prompt)
        return self._render_template(constraints, current_iteration)

    def _extract_constraints(self, system_prompt: str) -> list[str]:
        """Parse constraints from system prompt for re-injection.

        Constraints are re-stated in the compaction summary so they
        occupy a high-attention position regardless of original location.
        """
        constraints: list[str] = []
        in_constraints_section = False
        for line in system_prompt.splitlines():
            header = line.strip().lower()
            if header.startswith("## constraints") or header.startswith("## rules"):
                in_constraints_section = True
                continue
            if in_constraints_section and line.startswith("## "):
                break
            if in_constraints_section and line.strip().startswith("- "):
                constraints.append(line.strip().removeprefix("- "))
        return constraints

    def _render_template(self, constraints: list[str], iteration: int) -> str:
        """Render the compaction template with extracted constraints."""
        constraint_lines = "\n".join(f"- **{c}**" for c in constraints)
        return f"""# Compaction Summary (after iteration {iteration})

## Critical Constraints (from system prompt — always enforce)
{constraint_lines}

## Goal and Acceptance Criteria
[Extracted from Loop Contract]

## Decisions and Rejected Approaches
[What was tried, what failed, why it failed — do not re-attempt]

## Current State
[Files modified, tests passing/failing, exact paths and line numbers]

## Remaining Plan
[Ordered steps still needed to complete the goal]

## Active Blockers
[Issues discovered but not yet resolved]"""
```

The critical design choice in this implementation: the compactor explicitly extracts constraints from the system prompt and re-injects them into the compaction summary. This directly addresses Jenna's failure. After compaction, the summary occupies a high-attention position (the end of the post-compaction context), and the constraints are now stated there explicitly. After compaction, the actual submitted context is shorter; the original pre-compaction token position is not a continuing physical distance. The relevant failure is omitted or misunderstood constraints in the new context, not a proven positional explanation for this fictional incident. The duplication is intentional and necessary.

## Automatic Context Editing

Compaction is the heavy intervention: compress everything at once, replacing detailed history with a summary. Context editing is the surgical alternative: remove specific elements that have become stale while preserving the rest of the conversation structure intact. In practice, the most effective loop harnesses use editing continuously (every iteration) and compaction rarely (only when editing alone cannot keep context within budget).

The single most impactful editing target is stale tool results. In a loop where each iteration makes three tool calls that each return an average of 5,000 tokens, the accumulated tool results after ten iterations occupy 150,000 tokens — three-quarters of a 200K window. The overwhelming majority of these results are irrelevant to the current step. The file contents read in iteration two may have been modified in iteration three — the old read is now misleading. The search results from iteration four answered a question that has been resolved. The test output from iteration six reported failures that have been fixed. Keeping these results in context provides no value and actively harms the model by presenting outdated information as current fact.

Automatic clearing operates on a configurable rule: tool results older than n iterations (typically 2–3) are removed from the context. If the model needs information from an earlier tool call — the actual current contents of a file, the current test results — it can re-invoke the tool to get fresh data. The re-read costs a few hundred tokens of input and one tool-call round trip. Keeping stale results costs thousands of tokens of noise in every subsequent inference, degrading attention quality and potentially misleading the model with outdated information.

**Unverified legacy claim, not source-checked evidence.** This is documented production practice. Automatic clearing of stale tool results is a feature of production agentic systems [unverified legacy attribution]. The principle: context is not an append-only log. It is a managed working set that should contain only information serving the current step. Information that has been consumed and acted upon — whose purpose has been fulfilled — should be removed or summarized, not preserved indefinitely.

Not all tool results should be cleared on the same schedule. Reference context — the contents of a file the model is actively modifying — should persist for as long as the model is working on that file, because re-reading it on every iteration would waste both latency and tokens. Answer context — a search result that resolved a one-time question — can be cleared immediately after the iteration that consumed it. The distinction is whether the information will be needed again (reference) or has already served its purpose (answer). A well-designed clearing policy distinguishes these and applies different retention periods.

## Structured Handoff Notes

When a loop reaches context capacity and must continue in a fresh session — whether through explicit context reset, delegation to a different agent, or a long-running task that spans multiple days — it performs a handoff. The handoff note is a structured document written by the outgoing context and consumed by the incoming one, enabling continuation without re-discovery.

The handoff note differs from a compaction summary in two critical ways. First, it is designed to be read by a context that has zero prior knowledge. A compaction summary can assume the reader participated in the conversation being summarized. A handoff note must be self-contained: it must explain the task from scratch, describe the current state completely, and provide all the information the new context needs to proceed without re-reading the full history. Second, a handoff note must be grounded in verifiable artifacts. Every claim in the note should reference a specific file path, a specific test result, or an observable system state that the receiving context can verify independently.

``` python

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class HandoffNote:
    """Structured state transfer between context generations.

    Written by outgoing context, consumed by incoming context.
    Every claim must be verifiable against the actual system state.
    """

    task_description: str
    completed_work: list[str]
    current_state: dict[str, str]   # file_path -> status or description
    active_plan: list[str]          # ordered remaining steps
    known_issues: list[str]         # unresolved problems
    critical_constraints: list[str]  # must not violate
    failed_approaches: list[str]    # tried and rejected — do not retry

    def to_markdown(self) -> str:
        """Render as markdown for injection into fresh context."""
        sections = [
            f"# Handoff Note: {self.task_description}\n",
            "## Completed Work",
            *[f"- {item}" for item in self.completed_work],
            "",
            "## Current State (verify these before proceeding)",
            *[f"- `{path}`: {desc}" for path, desc in self.current_state.items()],
            "",
            "## Remaining Plan",
            *[f"{i+1}. {step}" for i, step in enumerate(self.active_plan)],
            "",
            "## Known Issues",
            *[f"- {issue}" for issue in self.known_issues],
            "",
            "## Critical Constraints (do not violate under any circumstances)",
            *[f"- **{c}**" for c in self.critical_constraints],
            "",
            "## Failed Approaches (do not re-attempt)",
            *[f"- ~~{a}~~" for a in self.failed_approaches],
        ]
        return "\n".join(sections)

    def save(self, path: Path) -> None:
        """Persist to disk so it survives context boundaries."""
        path.write_text(self.to_markdown(), encoding="utf-8")
```

The verification step is essential and is the receiving agent's first responsibility. Upon reading a handoff note, the receiving context should verify the claimed state against reality before taking any action that builds upon it: read the files mentioned and confirm they contain what the note claims; run the tests referenced and confirm the pass/fail status matches; check that the branch, the modified lines, and the current errors align with the handoff note's description. If the handoff note was written by a context that was already degraded — confused by context rot, contradicting its own earlier work, or operating on stale information — the note itself may be inaccurate. Verification catches these failures early, before the new context builds an entire work stream on a false foundation.

This pattern is analogous to a shift handoff in operations: the outgoing operator writes a status log, and the incoming operator independently verifies the critical parameters before assuming responsibility. The handoff note is a communication aid, not an authoritative record. The authoritative record is the system itself, and verification grounds the handoff in reality.

## Designing State-on-Disk Loops

The most robust pattern for loops that outlive their context window is to invert the default relationship between context and state. Instead of the context window being the primary store of loop state (with disk as an afterthought), make disk storage the authoritative state and the context window a disposable working scratchpad loaded fresh for each step.

``` mermaid

flowchart TD
    subgraph Disk["Persistent State (Disk)"]
        SF[state.json:<br/>goal, progress, plan,<br/>constraints, known issues]
        ART[Artifacts:<br/>code files, test results,<br/>intermediate outputs]
    end
    subgraph Window["Context Window (Ephemeral)"]
        SYS[System prompt +<br/>constraints]
        STATE[Current state<br/>loaded from disk]
        WORK[Step-specific context:<br/>relevant files, errors]
        GEN[Generation<br/>reserve]
    end
    SF -->|"Load for this step"| STATE
    ART -->|"Read on demand"| WORK
    GEN -->|"Results"| ART
    GEN -->|"Update progress"| SF
```

In the state-on-disk pattern, the loop maintains a persistent state file (JSON, YAML, or structured markdown) that contains the authoritative record of progress, decisions, constraints, and remaining plan. Each iteration reads the state file, loads only the context relevant to its specific step (the files it needs to modify, the test output it needs to analyze, the error it needs to fix), performs its work, writes results to disk (modified files, updated tests), and updates the state file with its progress. The context window is emptied and refilled for each iteration rather than accumulating history.

This reduces append-only history accumulation but does not eliminate stale or incorrect state. Each iteration starts fresh, with a context that contains only what the current step requires. There is no accumulated history to manage, no stale tool results competing for attention, no old plans contradicting new ones. Outdated information can still enter through stale state files, cached evidence, or an inaccurate handoff; validate freshness before depending on it. The state file contains only current state, not history.

The pattern can simplify handoffs, provided the receiving process verifies identity, authority, revisions, and unresolved effects. Since state already lives on disk, transferring work to a new agent (or a new session of the same agent, or a different model entirely) requires only pointing it at the state file and the project directory. There is no compaction to perform because the context was never the primary state store.

The tradeoff is the loss of conversational continuity. A model operating in the state-on-disk pattern cannot reference "the reasoning I was developing three steps ago" because that reasoning is not in context. For most production loops, this is an acceptable trade: the model's job is to execute the current step correctly, not to maintain narrative coherence across steps. The state file provides structural continuity (what to do next, what has been done, what constraints apply) without requiring the model to remember how it felt about the problem three iterations ago.

The pattern does require discipline in state-file design. If the state file grows unboundedly — accumulating every observation, every decision, every intermediate result — you have merely moved the context rot problem from the window to the disk, and loading the state file back into context recreates the original problem. The state file must be subject to the same smallest-high-signal-set principle from [Chapter 7](chapter-07.md): it should contain only what the loop needs to decide its next action and verify its current position. History that the model does not need for future decisions should be moved to a separate log file (available if needed for debugging, but not loaded by default).

## When Compaction Fails Silently

Jenna's failure — the dropped constraint — represents one instance of a general pattern. Compaction fails silently whenever it discards information that appears unimportant at compaction time but proves critical in a future step. The compactor cannot reliably make this distinction because it requires predicting the future reasoning needs of the loop with perfect accuracy. Three specific failure modes recur in practice, and understanding them enables targeted mitigation.

**Dropped constraints.** Constraints that are stated once (in the system prompt or an early instruction) and never explicitly referenced during execution appear unimportant to a compactor that judges importance by usage frequency or recency. A constraint that was never violated — and therefore never discussed in the conversation — looks like it has no relevance to the work being summarized. It gets dropped. Future steps violate it because they no longer know it exists. This is Jenna's case exactly, and it is the most common compaction failure in practice.

**Lost rejection rationale.** The loop tried approach A (using a global mutex for the race condition), discovered it failed because of unacceptable latency, and pivoted to approach B (optimistic locking with retry). After compaction, the summary states "using optimistic locking with retry" but does not preserve the specific reason the mutex approach was rejected (3x latency regression). When approach B encounters its own difficulty (occasional retry exhaustion under high contention), the loop may pivot back to the mutex approach — re-discovering the latency problem that was already discovered and discarded. Each unnecessary re-discovery costs multiple iterations and the associated token spend.

**Collapsed nuance.** A tool result contained a subtle but important behavioral detail: "the API returns HTTP 200 on success and also returns HTTP 200 with an empty body when the requested resource does not exist (rather than the expected 404)." The compaction summarizes this as "API returns 200 on success." The missing nuance causes a bug in the implementation: the code checks for status 200 as the success path without also checking for an empty body, and silently treats "resource not found" as "resource found but empty." The test suite does not catch this because it tests with resources that exist.

The mitigation strategies for all three failure modes share a structural principle: do not rely solely on the compactor's importance judgment. Use explicit preservation rules that force specific categories of information to survive compaction regardless of whether the compactor deems them relevant.

First, maintain a `critical_constraints` section that is extracted from the system prompt and re-injected into every compaction summary unconditionally — never subject to the compactor's relevance assessment. Constraints are not optional context; they are invariant requirements. Second, maintain a `rejected_approaches` log as a structured list that persists across compaction boundaries. Each entry records what was tried, why it failed, and the specific condition under which it would fail again. Third, when tool results contain behavioral nuances that affect correctness, extract those nuances into the state document as explicit facts ("Note: API X returns 200 with empty body for missing resources") before the tool result itself becomes eligible for clearing. Nuance that lives only in a tool result is nuance that will be lost on the next clearing cycle.

## Choosing the Right Strategy

The choice between compaction, context editing, and full handoff depends on three factors: how close the loop is to convergence, whether the current context may itself be contributing to loop failure, and whether the task has natural milestone boundaries.

If the loop is converging — each iteration produces measurable progress, test failures decrease, oracle scores improve — and the context is moderately full (70–85% utilization), compact in place. Apply aggressive editing first (remove all tool results older than two iterations), and if that alone recovers sufficient budget, skip full compaction. Only invoke full compaction if editing alone is insufficient.

If the loop is stuck — oscillating between approaches, re-introducing previously-fixed bugs, producing output of declining quality, or repeating earlier mistakes — the context itself may be part of the problem. Stale information, contradictory fragments from different iterations, and inaccurate compaction summaries can all cause loops to thrash. In this case, a full handoff to a fresh context (with a carefully written and verified handoff note) gives the new context a clean start free from accumulated confusion.

If the task has natural milestones — each sub-task produces a verifiable artifact that is independent of the detailed history of its production — design for handoff at each milestone from the start. The first context reproduces the bug and produces a failing test. The second context implements the fix starting from the handoff note. The third context addresses regressions. Each context operates within comfortable budget limits and never needs compaction at all because it never accumulates enough history to approach capacity.

The anti-pattern that causes the most damage: waiting until context hits 100% capacity before taking any action. At maximum capacity, the model's next response may be truncated mid-generation. The system must either hard-truncate historical context (losing information unpredictably, without the structured preservation that compaction provides) or halt execution entirely (failing the task). Context management must be proactive. Establish monitoring thresholds — 70% capacity for increased clearing aggressiveness, 85% for compaction readiness, and 95% for emergency compaction or handoff — and trigger management actions before the situation reaches a point where only bad options remain.

## Implementation Guidance: A Handoff Is Not a New Authorization

The receiving context needs a task identity, scope revision, artifact digests, check receipts, remaining work, unresolved hypotheses, and external operations whose outcomes are unknown. These fields should be supplied by trusted runtime state where possible. A generated summary may explain them, but cannot promote “proposed” to “approved,” or “test started” to “test passed.”

Keep the task’s authority record outside a freely rewritten summary. If a user revoked permission while the outgoing worker was compacting, the incoming worker must see the revocation before dispatching anything. Preserve cumulative budget and the worker generation as well. A fresh context is not a fresh spending allowance and does not inherit an obsolete worker’s lease. See [Chapter 39](chapter-39.md) for fencing and effect reconciliation.

Make handoff publication atomic: write a complete candidate, validate its schema and referenced artifacts, then publish a versioned pointer. Use conditional updates to prevent an older writer from replacing a newer handoff. Hashes establish identity, not correctness, so bind each receipt to the content it actually checked and verify that the check environment still applies.

In Jenna’s fictional case, `_meta` belongs in an independently enforced response-contract test. Repeating it in a summary can help the model remember it, but does not replace the test. The example compactor’s bullet extraction is not complete instruction parsing: nested rules, tables, references, and scoped exceptions can escape it. Prefer a structured constraint inventory maintained with the task contract over guessing which prose bullets are mandatory.

Exercise acceptance: simulate a context reset after a file edit, after a test starts but before it completes, and after a remote operation times out. The new context must not reuse a stale receipt, claim an unfinished test passed, or resubmit an uncertain write. Add a revoked-approval case. A successful handoff preserves useful completed work while refusing only the unsafe continuation; it need not restart unrelated work from zero.

## What Breaks

The fundamental tension of this chapter is that all three strategies — compaction, editing, and handoff — lose information, and the information they lose can prove to be exactly what was needed. They differ in what they lose and how predictably they lose it, but none is lossless, and perfect prediction of future information needs is not achievable.

The state-on-disk pattern appears to solve the problem by eliminating context accumulation entirely, but it merely displaces the question. "What goes in the state file?" has the same structure as "what goes in the compaction summary?" — both require deciding what is essential and what is ephemeral, and both decisions are made with incomplete knowledge of future requirements.

The deeper issue: loops that are long enough to require compaction or handoff are operating beyond the comfortable reliability region. They are attempting tasks complex enough that the full reasoning trace cannot fit in a single context fill. Every compaction, edit, or handoff introduces a risk of information loss that manifests later as a bug, a repeated mistake, or a violated constraint. The honest engineering approach is to treat these mechanisms as managed risk rather than solved problems: acknowledge that they will occasionally drop something important, design structural mitigations (constraint extraction, rejection logging, state verification), monitor for symptoms of information loss (repeated mistakes, constraint violations, declining quality post-compaction), and budget for the occasional failure that slips through mitigation.

If your task cannot tolerate any information loss — if every detail of the full history might be needed at any future step, and silent loss of any detail could produce critical failures — then compaction is not appropriate for your task. Your options are: decompose the task into sub-tasks small enough that each fits within a single context fill without compaction, or adopt the state-on-disk pattern where the full detailed history persists on disk and only the currently-relevant slice loads into the working context at any time.

## Key Takeaways

- Compaction is a lossy checkpoint: it achieves 30–50:1 compression by preserving essential state and discarding supporting detail. The question is always whether the 2–4% preserved is the right 2–4%.
- Automatic context editing (clearing stale tool results by iteration age) is the first and least-disruptive defense against context bloat. Apply it continuously, every iteration.
- Structured handoff notes transfer state between context generations. They must be self-contained (readable with no prior knowledge), grounded in artifacts (referencing verifiable paths and states), and verified by the receiving context before proceeding.
- Durable state reduces history accumulation; persistence alone does not make state current, correct, or authorized.
- Compaction fails silently when it drops constraints, loses rejection rationale, or collapses behavioral nuance. Mitigate with structural preservation rules that force critical categories to survive regardless of importance scoring.
- Choose strategy based on convergence (edit/compact in place), stuckness (fresh handoff), or natural milestones (design for handoff from the start). Never wait until 100% capacity.
- Manage context proactively with thresholds: 70% for aggressive editing, 85% for compaction readiness, 95% for emergency intervention.

## The Loop Contract, So Far

This chapter extends the **budget** field with operational policy: the budget must specify not only maximum total tokens and dollars, but also compaction thresholds, clearing rules, and handoff triggers. It reinforces the **escalation path**: when compaction fails (post-compaction loop cannot converge, or the handoff note proves inaccurate and the new context builds on false assumptions), the escalation path must include "quarantine the inaccurate summary, rehydrate trusted evidence and current authority, and reconcile any external effects before continuing." This is expensive but is the correct recovery from corrupted state.

## Exercises

1.  **Compaction audit.** If your system performs compaction, capture the full context immediately before and the compaction summary immediately after for five distinct compaction events. Review each summary against the full context it replaced: does it preserve all constraints from the system prompt? Does it record rejected approaches with rationale? Score each compaction (complete / partial / deficient) and identify patterns in what gets lost.

1.  **State-file design.** For a loop that currently operates with accumulating context (no clearing, no compaction), design a state-file schema that would allow it to operate in the state-on-disk pattern. Define what goes in the state file, what stays ephemeral, what is the maximum size at steady state, and what clearing rules prevent the state file itself from becoming bloated.

1.  **Handoff fidelity test.** Take a completed loop trace (ten or more iterations). Write a handoff note from the trace as if you were the agent preparing to pass work to a fresh context. Give the handoff note (and only the handoff note, plus the system prompt) to a fresh model session. Ask it to continue the task. Document where the handoff enables correct continuation and where it fails the receiving agent.

1.  **Constraint preservation implementation.** Implement the `Compactor._extract_constraints` method for your system's actual skill file format. Run a loop that includes a constraint which is never explicitly referenced during execution (like Jenna's `_meta` field). Verify that the constraint survives compaction and remains effective by checking that post-compaction output still respects it.

## Sources and Evidence Limits

The original edition attributed product features and outcome figures to undated or incompletely located vendor material. Those inherited attributions are **unverified in this chapter**; they are not reproduced as a fact-check receipt. The engineering patterns and fictional examples stand separately from those claims. Consult the edition’s source notes for collected references and verify implementation-specific contracts against the version you deploy.

------------------------------------------------------------------------

*Next: [Chapter 9](chapter-09.md) tackles tool design at scale — how tool schemas, Tool Search, and programmatic tool calling determine what a loop can do and how much of its context budget each tool call consumes.*
