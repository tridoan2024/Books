# Chapter 6: LLMs as Unreliable Reasoning Engines

> **Reading note.** Named practitioner scenarios and their timings, costs, and outcomes are fictional illustrations unless a specific source is identified. Numerical assumptions are not provider quotes or measured results. Code, commands, configuration, and traces are illustrative pseudocode/API sketches, not executed examples. In particular, `loopkit` is a teaching namespace, not a tested installable SDK. Legacy product attributions marked unverified are not evidence for deployment decisions.

> Reliability is not a property of the model. It is a property of the loop.

## The Sixteen-Step Disaster

Priya Nakamura's team at a mid-size fintech shipped their first autonomous coding loop in January. The loop took a Jira ticket, read the relevant source files, produced a fix, ran the test suite, and iterated until tests passed. For simple tickets — single-file fixes, clear error messages, under five files touched — the loop was exceptional. It resolved tickets in four minutes that took engineers thirty. The team celebrated.

Then they pointed it at a refactoring ticket: "Extract the payment validation logic from the monolithic `process_payment` function into a separate service class, update all seventeen call sites, and ensure all 312 tests still pass." The loop planned sixteen steps. It discovered the call sites (step 1), designed the new class interface (step 2), created the class file (step 3), migrated logic in batches (steps 4–7), updated call sites (steps 8–12), handled error-path edge cases (steps 13–15), and ran the full test suite (step 16).

It failed. Not occasionally — every single time. Over five attempts across a week, each running to budget exhaustion, the loop never produced a passing test suite for this ticket. Priya examined the execution traces. The failures were never at the same step twice. Sometimes the class interface designed in step 2 missed a method that step 9 needed when updating a call site. Sometimes step 6 introduced a subtle type mismatch — returning `Optional[Decimal]` instead of `Decimal` — that only manifested when step 14 exercised the error path. Once, step 4 moved a helper function that step 11 assumed was still in its original module, producing an import error that cascaded into three other files.

The per-step accuracy was not the problem. In isolation, each step succeeded roughly 94% of the time — excellent for any individual LLM call on a complex task. The problem was arithmetic. At 94% per-step accuracy over sixteen sequential steps, the probability that all sixteen steps execute correctly without a single error is 0.94^16 ≈ 0.372. The loop had about a 62.8% chance of failure on every attempt, before accounting for the fact that errors in early steps corrupted the context for later steps. Verification at the end (step 16: run the test suite) could detect the cumulative damage but could not prevent the compounding that caused it. By the time the test suite reported failures, the damage was distributed across multiple files and multiple steps, and the feedback signal ("12 tests failed with various assertion errors") did not point clearly to the root cause.

Priya's loop did not need a better model. It needed a different architecture — one that respected the mathematics of sequential unreliability and verified intermediate results before errors could compound.

## The Compounding Equation

The fundamental reliability equation for sequential execution is the product rule of independent probabilities. If each step in a sequence has probability p of executing correctly, and each step's outcome is independent of the others, then the probability that all n steps execute correctly is:

P(all n steps correct) = p^n

This equation is not specific to language models. It governs any system with sequential dependent stages: manufacturing assembly lines where each station must perform correctly for the final product to pass inspection, network protocols where each hop must forward a packet correctly for end-to-end delivery to succeed, multi-stage rocket ignition sequences where each engine must fire correctly for orbital insertion to succeed. The mathematics are universal. What makes the equation particularly consequential for LLM-based systems is that practitioners routinely build ten-to-thirty-step sequences without accounting for compounding, because their experience with individual calls creates a misleading intuition about sequential outcomes.

The numbers deserve careful study:

| Per-Step Accuracy | 5 Steps | 10 Steps | 15 Steps | 20 Steps | 30 Steps |
|-------------------|---------|----------|----------|----------|----------|
| 99%               | 95.1%   | 90.4%    | 86.0%    | 81.8%    | 74.0%    |
| 97%               | 85.9%   | 73.7%    | 63.3%    | 54.4%    | 40.1%    |
| 95%               | 77.4%   | 59.9%    | 46.3%    | 35.8%    | 21.5%    |
| 93%               | 69.6%   | 48.4%    | 33.7%    | 23.4%    | 11.3%    |
| 90%               | 59.0%   | 34.9%    | 20.6%    | 12.2%    | 4.2%     |

\[ESTIMATE: These are exact mathematical computations of p^n. The per-step accuracy values are illustrative, not measurements of any specific model or task. Actual per-step accuracy varies dramatically with task complexity, prompt quality, available context, and model choice.\]

At 95% per-step accuracy — genuinely excellent for a complex reasoning task involving file manipulation, code generation, and multi-step planning — a ten-step sequence fails 40% of the time. A twenty-step sequence fails 64% of the time. A thirty-step sequence fails nearly 80% of the time. The model is not unreliable at any individual step. The system is unreliable because reliability compounds multiplicatively, not additively. You cannot intuit your way past exponential decay.

The table motivates attention to dependency structure and verification. It does not establish that every task beyond a particular step count is unsuitable for single-pass generation. You are not unlucky when a fifteen-step sequence fails. You are observing the expected outcome of the mathematics that govern your system.

## The Non-Independence Problem

The shortcut p^n assumes equal, independent step-success probabilities. The general product rule instead multiplies conditional probabilities: P(all succeed) = P(S1) × P(S2 | S1) × … . Dependence can make the independent estimate higher or lower than reality; correlation alone does not establish a universal direction.

Three mechanisms produce error correlation in practice, and understanding them is necessary for designing effective verification strategies.

**Contextual contamination** is the most direct mechanism. When step 3 produces an incorrect intermediate result — a wrong function signature, a misidentified file path, an incorrect assumption about an API's behavior — that result enters the context window. Every subsequent step now reasons in the presence of incorrect information. The model does not flag the error because it has no way to distinguish "correct information provided by the system" from "incorrect information produced by a previous step and left in context." Both look identical: they are text in the conversation history, and the model treats context as ground truth because context is the only ground truth it has access to. A hallucinated function signature in step 3 becomes a confident import statement in step 7, which becomes a type error when the code actually runs in step 12. The three errors are not independent draws from a failure distribution. They are causally linked through the shared context, and the later errors are near-certain given the earlier one.

**Systematic blind spots** produce correlated failures across steps that share a common cognitive demand. Models have consistent weaknesses: off-by-one errors in loop bounds, confusion between similar-sounding API methods, difficulty tracking mutable state across many variables, and unreliable reasoning about concurrent execution. If your task requires the same type of reasoning at steps 5, 9, and 14 — and the model has a systematic 15% failure rate on that reasoning type — then those three steps fail together more often than independent 15% failures would predict. The failures cluster around specific cognitive demands rather than distributing uniformly across steps.

**Confidence reinforcement** amplifies errors through the model's own rhetoric. When a model produces an answer with high apparent confidence — long, detailed, syntactically correct, internally consistent — subsequent steps treat that answer with higher implicit trust. An incorrect but confident architectural plan in step 2 (say, "the payment validator should be a static class with no state") is unlikely to be questioned by the model in step 8 when it discovers that state is actually needed. The model will work around its own earlier decision rather than revise it, because the decision appears in context as an established fact. The model's own confident statements become evidence in its own reasoning, creating a positive feedback loop that locks in early errors.

The practical consequence of non-independence is that p^n is not a guaranteed bound. For example, perfectly correlated steps with marginal success 0.95 all succeed with probability 0.95, not 0.95^n. Error propagation can still be damaging; measure conditional success along the actual workflow rather than infer a bound from correlation alone. How much higher depends on the task structure. For loops where early steps weakly constrain later steps (independent file modifications, parallel subtasks), the correlation is mild and p^n is a reasonable approximation. For loops where early steps strongly constrain later steps (architecture decisions, interface design, data model choices), the correlation can be severe — a wrong decision in step 2 may render steps 3 through 20 incorrect with near-certainty, producing an effective sequence reliability far below what p^n predicts.

## How Verification Changes the Model

A limited one-step model is useful if its assumptions are explicit. Let p be initial correctness, d the probability of detecting an incorrect result, and c the probability that one correction produces a genuinely correct result conditional on detection. If initially correct results remain correct, and the correction path introduces no additional unmodeled harm, final correctness is:

`p_effective = p + (1 − p) × d × c`

This is not the probability of being approved by the checker. A weak checker can approve wrong output. Nor does the expression represent arbitrary checkpoint intervals: a four-step segment has a different initial-success probability and different detection and repair behavior from one step.

For an illustrative per-step model with p = 0.94, d = 0.85, and c = 0.90, p_effective = 0.9859. Sixteen independent corrected steps would succeed with probability approximately 0.7968. This hypothetical result does not demonstrate that checking once every four steps achieves the same rate.

For a segment model, let q be the probability the entire segment is initially correct, D the probability of detecting an incorrect segment, and C the probability a repair makes the whole segment correct. Then q_effective = q + (1 − q) × D × C. Under an additional independence assumption across four-step segments, q = 0.94^4. Four such corrected segments have success probability about 0.8093 when D = 0.85 and C = 0.90. Similar-looking numbers do not make the two models interchangeable: their measured inputs describe different events.

```python
# Illustrative mathematical sketch; not a production reliability estimator.
def corrected_probability(initial, detection, correction):
    assert all(0 <= x <= 1 for x in (initial, detection, correction))
    return initial + (1 - initial) * detection * correction

segment_initial = 0.94 ** 4
segment_final = corrected_probability(segment_initial, 0.85, 0.90)
four_segment_success = segment_final ** 4
```

False alarms, repair-induced regressions, shared dependencies, and selection effects need additional states. A checker can repeatedly miss one defect class, and a correction can satisfy the current test while breaking a previously correct property. Measure detection by error class and preserve the distinction between “passed the check” and “met the requirement.”

The useful engineering conclusion is narrower than a promised success percentage: a check at a meaningful boundary can localize errors before more work depends on them. Its value must be demonstrated against the errors that actually occur.

## The Decomposition Consequence

There is no universal safe step count for an agent. A filesystem read, an interface decision, and a deployment are not interchangeable units. If the independent model is useful for a particular experiment, the largest n satisfying p^n ≥ R is floor(log(R) / log(p)) for 0 < p < 1 and 0 < R < 1. With p = 0.95 and R = 0.75, that count is five; six steps fall slightly below the threshold. This is illustrative arithmetic, not an operational safety limit.

Decompose at boundaries where the intermediate result has an independently checkable meaning. After designing an interface, check its consumers before migrating them. After transforming a batch of records, check schema, key uniqueness, reconciliation totals, and rejected-record accounting. After drafting a source-based section, inspect claim-to-source mappings before another section builds on those claims.

A checkpoint should preserve the artifact, the requirements it was checked against, and the check result. A green flag without a revision is not a reusable foundation. If the next segment changes the interface or input assumptions, the previous check may no longer apply and must be re-evaluated.

Verification placement trades cost against localization and risk. Running a complete integration suite after every character edit is wasteful; waiting until a large migration ends can make failures difficult to locate. Start with natural dependency boundaries and compare failure diagnosis and recovery costs. Do not choose arbitrary groups of four steps because a toy equation used four in its example.

The connection to [Chapter 3](chapter-03.md) is structural: the Verify stage supplies evidence for the next decision. It does not cleanse every possible error from the state. The connection to [Chapter 39](chapter-39.md) is equally important: a checkpoint can recover local work but cannot undo an external effect whose response was lost.

## The Model-Quality Investment Question

Compare investments on the same task distribution, not through a universal crossover at five or fifteen steps. A stronger model can improve planning and tool use; better checks can detect more mistakes; better context can improve both generation and evaluation. Their costs and interactions are empirical.

For the simple one-correction expression, the marginal sensitivity to detection is (1 − p) × c. If initial correctness is high, improving detection may have a small effect on final correctness but still be valuable for a rare severe failure. Conversely, improving the generator may not solve a missed-authorization problem because that constraint must be enforced outside the model.

Use a paired evaluation: identical task cases, fixed budgets, recorded model and oracle revisions, and a separate assessment of true outcome quality. Compare a model change, a checker change, and their combination. Include rejected tasks and human escalations in the denominator. A system that achieves a higher pass rate by weakening the checker has not improved.

Spend first on the observed bottleneck. If the model never sees a required file, fix retrieval. If it generates valid-looking but incorrect arithmetic, use deterministic computation and validation. If it is genuinely unable to solve supported cases despite adequate tools and feedback, evaluate another model or reduce task scope. Reliability engineering diagnoses the limiting mechanism rather than declaring either models or oracles universally dominant.

## Why This Makes Loops Necessary

The compounding equation appears to be an argument against loops. "LLMs fail over sequences — so stop running sequences." This reasoning fails because it conflates the tool with the architecture.

Complex tasks inherently require multiple reasoning steps. Some multi-file refactorings can be generated correctly in one inference, but that possibility does not replace checking the result. You cannot write a comprehensive research synthesis without multiple rounds of search, evaluation, and composition. You cannot diagnose a production incident without sequentially reading logs, correlating events, testing hypotheses, and verifying root causes. The steps exist because the task demands them, not because an engineer chose to make the task harder than it needs to be.

Without a loop, you have single-pass generation: one attempt at a multi-step task, with the full compounding equation working against you and zero correction mechanisms. The p^n illustration applies only if its homogeneous independence assumptions describe the chosen experiment; it is not an exact forecast of a real task. For a fifteen-step task at 95% per-step accuracy, that is 46% success. Roughly a coin flip.

A loop adds verification and correction at each segment boundary. It transforms the compounding equation from inevitable degradation into a managed, bounded process. Each verification step catches errors before they propagate. Each correction step produces a clean foundation for the next segment. The sequence still has n steps, but the effective failure rate per step is (1 − p)(1 − d × c) instead of (1 − p). For realistic values of d and c, this is the difference between "usually fails" and "usually succeeds."

The engineering precedent is direct. Error-correcting codes achieve reliable data storage on unreliable media through structured redundancy. TCP achieves reliable delivery over unreliable networks through acknowledgment and retransmission. RAID achieves reliable storage across unreliable disks through mirroring and parity. Every one of these systems is built on components that will fail, and every one achieves system reliability through structured verification and correction at architectural boundaries. Loop engineering is this same pattern — reliable task completion from unreliable reasoning components, through verification and iteration. The technique is old. The domain is new.

## Implementation Guidance: Measure Failure Without Selection Bias

Define the unit before counting. A task, attempt, tool call, and independently checked segment have different denominators. Counting only completed attempts can make an unreliable loop appear accurate because timeouts and escalations disappear. Record those outcomes explicitly, and record whether a failure was a wrong artifact, unavailable evidence, a tool outage, or an authority refusal.

A practical pilot uses a small frozen set of representative tasks plus deliberately seeded defects. For each run, retain the task revision, model and harness configuration, produced artifact, raw checks, final adjudication, and cumulative cost. If the checker labels an output passing but an expert finds it wrong, add a failure category rather than merely increasing the retry count. A systematic blind spot will not become detectable through more repetitions of the same check.

Test a counterexample to the independence claim in the chapter exercises: create perfectly correlated Bernoulli steps sharing one random outcome. Their all-success rate approaches p, whereas independent steps approach p^n. Then model an early corrupted interface that makes later consumers wrong. Both are dependent systems; their different behavior demonstrates why the general conditional product matters.

Acceptance for the reliability exercise requires documented assumptions, boundary tests at probabilities zero and one, and separate segment-versus-step calculations. Validate the arithmetic mechanically. Acceptance for the empirical exercise requires failed and inconclusive runs in the report and a statement of what the sample cannot establish. A small pilot can identify an observed failure mechanism; it cannot justify a universal reliability claim about a model family.

## What Breaks

This chapter's reliability model makes simplifying assumptions that do not always hold.

The most significant: it assumes that verification is independent of generation. The oracle's detection rate d is modeled as a fixed probability unaffected by the specific error being evaluated. In practice, some errors are easy to detect (syntax errors, type mismatches, test failures with clear assertions) and some are nearly invisible to automated verification (subtle logic errors that produce correct-looking output, semantic drift that satisfies the letter of a test but violates its spirit, edge cases that the test suite does not cover). The effective d is not a constant — it is a distribution that depends on the error type, and the hardest-to-fix errors are often the hardest-to-detect errors.

The model also assumes that correction succeeds or fails cleanly. In practice, partial corrections are common: the model fixes the immediate symptom but introduces a new subtle defect in the process. A "successful" correction that passes the oracle check may contain a latent defect that manifests only in a later segment. The correction rate c should really be modeled as "correction that produces a fully correct state," which is lower than "correction that passes the current oracle check."

Finally, the model treats all steps as homogeneous in difficulty. In realistic tasks, some steps are trivially easy (read a file) and some are quite hard (design an interface that satisfies multiple competing constraints). The overall per-step accuracy p is a blend of these varying difficulties, but the hard steps are where failures concentrate. A more accurate model would assign different pi values to each step — but this requires per-step accuracy data that is rarely available before running the loop.

The honest conclusion: use this chapter's mathematics as a planning tool, not a prediction tool. The equations tell you the right order of magnitude for verification investment and sequence length limits. They do not tell you the precise reliability of your specific loop on your specific task. For that, you need empirical measurement: run the loop twenty times, observe failure rates and failure locations, and calibrate your model against reality.

## Key Takeaways

- Under equal independent step-success assumptions, sequential reliability is p^n; 0.95^20 ≈ 0.358. This is illustrative arithmetic, not a measured model failure rate.
- Shared context and systematic blind spots violate independence; p^n is neither a universal forecast nor a guaranteed bound.
- Verification checkpoints change the equation by catching errors before propagation. Effective per-step accuracy = p + (1−p) × d × c.
- Place checkpoints at meaningful dependency boundaries; there is no universal safe number of reasoning steps.
- Decompose tasks at natural verification boundaries — points where your oracle can confirm correctness before the next segment builds on the result.
- Compare model, context, and oracle investments on the same representative tasks and budget.
- Bounded feedback is useful, but deterministic workflows, stronger initial generation, and human review remain valid alternatives.

## The Loop Contract, So Far

This chapter provides the mathematical foundation for the **budget** and **oracle** fields. The budget must account for the retry cycles that compounding error demands — a budget of exactly n steps with no margin for retries is a budget for probable failure. The oracle must achieve sufficient detection rate d to make long sequences viable — an oracle that checks only final output (d applied once at the end) provides far less reliability than one that checks intermediate results (d applied at each checkpoint). The equations clarify assumptions, while task-specific measurements and consequence determine suitable budgets and checks.

## Exercises

1.  **Reliability calculator.** Implement the illustrative probability functions and validate their input ranges. For a task you work on, estimate the per-step accuracy (use observed task-specific values, or label assumed values illustrative) and compute the maximum safe sequence length at 75% reliability, with and without verification.

1.  **Empirical measurement.** Run a loop on ten instances of the same task class. Record which step failed in each unsuccessful attempt. Compute the empirical per-step failure rate. Check whether failures cluster at specific steps (indicating non-independence). Compare the observed sequence failure rate to the naive p^n prediction — does the independent approximation overestimate or underestimate the observed result?

1.  **Verification-point design.** Take a fifteen-step task plan and identify the optimal checkpoint placement. At each checkpoint, specify the cheapest oracle that can confirm the segment's correctness. Compute the predicted reliability improvement versus end-to-end execution without intermediate verification.

1.  **Correlation analysis.** For a multi-step loop that has run at least 20 times, analyze whether failure at step k predicts failure at step k+1 at a rate higher than the marginal failure rate. If the conditional failure rate P(fail at k+1 \| fail at k) substantially exceeds the marginal P(fail at k+1), you have evidence of non-independence. What does the correlation structure tell you about where to invest in verification?

1.  **Investment comparison.** For a specific task, estimate the engineering effort required to (a) improve per-step accuracy by 2 percentage points (better prompts, more context, stronger model) versus (b) improve detection rate by 15 percentage points (better tests, additional oracle layers). Compute which investment produces more sequence reliability improvement for a 15-step sequence.

## Sources and Evidence Limits

The original edition attributed product features and outcome figures to undated or incompletely located vendor material. Those inherited attributions are **unverified in this chapter**; they are not reproduced as a fact-check receipt. The engineering patterns and fictional examples stand separately from those claims. Consult the edition’s source notes for collected references and verify implementation-specific contracts against the version you deploy.

------------------------------------------------------------------------

*Next: [Chapter 7](chapter-07.md) shifts from the reliability of reasoning to the management of context — treating the context window as a budget you allocate, not a container you fill.*
