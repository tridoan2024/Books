# Chapter 1: The Human Is the Loop

> **Reading note.** Named practitioner scenarios and their timings, costs, and outcomes are fictional illustrations unless a specific source is identified. Numerical assumptions are not provider quotes or measured results. Code, commands, configuration, and traces are illustrative pseudocode/API sketches, not executed examples. In particular, `loopkit` is a teaching namespace, not a tested installable SDK. Legacy product attributions marked unverified are not evidence for deployment decisions.

> The useful shift is from repeatedly correcting outputs to designing bounded feedback that can detect specific defects. This is the book’s framing, not a verified quotation.

## The Friday Afternoon Failure

Priya Anand is a senior engineer at a mid-stage fintech startup with forty developers. She joined six months ago to lead a migration from a legacy payments system to a new microservices architecture. Her team adopted an AI coding assistant on day one. She is good at prompting—possibly the best on her team. She writes clear instructions with architectural context, edge-case examples, and explicit output format constraints.

On a Friday afternoon in March, she sits down to add retry logic to a payment gateway adapter. The existing code handles the happy path but fails silently when the upstream payment processor returns a 503. She prompts her assistant: "Add exponential backoff retry logic to the payment gateway adapter, respecting the idempotency key, with a maximum of three retries and a circuit breaker after five consecutive failures."

The model responds with code in under four seconds. She reads it. The backoff calculation is wrong: it multiplies the delay by the attempt number instead of exponentiating. She corrects the prompt, specifying the formula explicitly. New code arrives. The idempotency key is not being forwarded on retries—the retry logic creates a fresh request object each time. She corrects again, more precisely this time. This third version looks right on the surface, but when she mentally traces the circuit breaker logic, she discovers its recovery rule differs from the required circuit-breaker policy. Priya realizes her original prompt did not specify the half-open recovery rule, so this is partly a missing requirement, not solely a model error. She corrects again.

Forty-two minutes have passed. She has written four prompts and read four responses carefully enough to trace logic through branching paths. The model generated roughly 200 lines of code across those attempts, each version in under five seconds. She spent her time not on system design, not on architecture, not on the genuinely hard questions about how retry logic interacts with distributed transactions and eventual consistency. She spent it on review—catching errors the model made and describing them back so the model could try again.

Priya is the loop. She is the verification step, the error detector, the feedback signal that drives iteration. Part of her work is repetitive checking; deciding which behaviors must be checked still requires domain judgment. It requires checking output against known constraints: does the backoff exponentiate correctly, is the key forwarded, does the breaker logic match the documented specification. A test suite could check all three in under a second. The test assertions already exist implicitly in her head; she is simply executing them mentally instead of mechanically.

The next Monday, she writes the test suite first. Nine assertions covering the backoff formula, the idempotency key forwarding, the circuit breaker open/close transitions, and the edge case where the upstream returns a 503 during the breaker's half-open state. Then she tells her assistant: "Make all tests pass." It takes three automated iterations—the model writes code, the test runner identifies the failure, the error message goes back as context for the next attempt. She does not read the intermediate output. Total elapsed time in this illustration: ninety seconds from prompt to all-green. The asserted properties now pass; that is not yet evidence of equivalent production behavior. The mechanical checks no longer require intermediate human review; payment semantics, test adequacy, and release approval still do.

Priya changed how verification ran. In this fictional example, the specified assertions execute faster than repeated manual tracing. Whether the complete workflow is cheaper or more reliable depends on test adequacy, maintenance, remaining review, and observed outcomes. The structural change is the connection between generation and execution evidence.

This is the shift the rest of this book teaches: how to move from being the loop to designing the loop.

## The Review Bottleneck

Many AI-assisted workflows encounter a review bottleneck, but measure your own workflow before assuming review is its dominant constraint. A familiar pattern is: you type a prompt, the model responds, you read the response, you find the mistake, you prompt again. The model is fast—response times measured in seconds. The human is slow—review times measured in minutes to hours. When review dominates the measured workflow, its capacity limits throughput. Other workflows may instead be limited by unclear requirements, slow tools, or unavailable evidence.

This is not a complaint about AI quality. The models are remarkably capable—good enough that organizations are deploying them at scale, trusting them with meaningful work, building entire product categories around their output. The bottleneck exists because we have inserted a human verification step into every iteration without asking whether that verification could itself be automated. We have built systems where the AI does the generative work and the human does the checking, then wondered why throughput does not scale beyond what a single person can review.

The following illustrative patterns show opportunities for specific checks across domains.

In code generation, a developer asks for a function, reads the output, spots an edge case the model missed, re-prompts with the correction, reads again, notices a type error in the revised version, re-prompts again. Each cycle costs two to five minutes of human attention—not because the developer is slow, but because careful code review requires tracing logic, checking assumptions, and comparing behavior against specification. The model could have caught both the edge case and the type error if given a test suite and a type checker. The verification machinery already exists in most codebases. It runs in CI. It runs in pre-commit hooks. Connecting it to the generation loop can shorten feedback latency.

In document generation, a writer generates a draft, reads it for tone and factual accuracy, marks up corrections, re-prompts with the corrections, reads the new version, finds that the fix introduced a new inconsistency. Each round of human review takes five to fifteen minutes depending on document length. A rubric can encode required sections and selected factual constraints, while tone and argument quality may need calibrated judgment. Automatic grading can miss defects or reject acceptable drafts. The reviewer's time would be spent on genuinely subjective decisions rather than on mechanical checks wearing the costume of intellectual work.

In research and analysis, an analyst asks for a summary of market data, spots a suspicious number, asks for sources, finds the model hallucinated a statistic, asks for a correction, gets a plausible-sounding but still unsourced claim. The analyst is performing a function that decomposes cleanly into mechanical steps: check each numerical claim against the source data, verify that cited documents exist, confirm that quoted passages appear in the cited source. Exact comparison can often be automated when authoritative data is accessible. Whether a source supports the surrounding inference requires a separate check.

In each case, the human is performing a function that could be encoded: run the tests, apply the rubric, verify against sources, check the schema, validate the constraints. The human is the loop—the feedback mechanism that catches errors and drives iteration toward quality. Some parts are mechanical and repeatable. Others depend on uncertain evidence, changing requirements, or accountable human judgment. Identify that boundary before automating.

The question this book answers is not "should we remove humans from AI workflows?" The question is: "which verification functions are we performing manually that a machine could perform faster, cheaper, and more consistently?"

## The Ceiling of Better Prompts

The natural response to the review bottleneck has been prompt engineering—writing better instructions so the model gets it right the first time. This works, up to a point. A well-crafted system prompt with role definition, context boundaries, output format specifications, few-shot examples, and explicit reasoning instructions can eliminate entire categories of common errors. Chain-of-thought prompting improves reasoning on complex problems. Structured output formats prevent parsing failures. Context ordering affects attention distribution. These are real techniques with real effects.

But prompt engineering has a hard ceiling, and that ceiling is lower than most practitioners want to admit.

A prompt alone does not supply external execution evidence. A model can revise its reasoning or generate a critique, and an agent runtime can interleave tool calls with generation. The engineering distinction is therefore not “one forward pass versus thinking.” It is whether the system actually runs an appropriate check, receives its result, binds that result to the current artifact, and responds within explicit limits.

A prompt says: "Do this well." A loop says: "Do this, check the stated requirements, and revise while useful progress and authorization remain; stop on success, uncertainty, or exhausted limits."

The difference is not subtle. It is the difference between telling a junior developer to "write good code" and giving them a test suite, a linter, a type checker, a code reviewer, and a CI pipeline. The former relies on talent—on the developer's ability to foresee and avoid errors in a single pass. The latter relies on infrastructure—on mechanical checks that catch errors regardless of whether the developer foresaw them. Infrastructure scales. Talent does not.

Here is an illustrative probability model, not a measured forecast: assume twenty equally reliable independent steps, with any step failure invalidating the task. If a model achieves 95% accuracy on any single step—an excellent result by any measure, competitive with careful human work—then a sequence of twenty decisions yields a cumulative accuracy of 0.95²⁰ ≈ 0.36. Roughly one-third of multi-step tasks succeed end-to-end. The calculation is hypothetical; observing a failed agent run does not establish its per-step probability or independence. The model gets most individual steps right, but "most" compounding over many steps means failure is the statistical norm, not the exception.

``` python

# The arithmetic that breaks single-pass prompting
def cumulative_accuracy(per_step: float, steps: int) -> float:
    """Compound probability of all-correct over a multi-step task."""
    return per_step ** steps

# Even excellent per-step accuracy collapses over sequences
cumulative_accuracy(0.95, 5)   # 0.77 — acceptable for short tasks
cumulative_accuracy(0.95, 10)  # 0.60 — concerning
cumulative_accuracy(0.95, 20)  # 0.36 — failure is the norm
cumulative_accuracy(0.95, 50)  # 0.08 — virtually guaranteed failure
```

Changing a prompt, model, or decomposition can change the probabilities and dependency structure; the arithmetic applies only after those assumptions are specified. The compound probability of multi-step success is governed by per-step reliability, and single-pass generation provides no mechanism for detecting and correcting per-step errors before they propagate. A feedback loop offers one way to change effective reliability, provided its checks detect relevant failures and its repairs improve the current artifact.

A loop with a verification oracle that detects 90% of per-step failures transforms the picture. When an error is detected, the step is retried with the error as feedback. The effective per-step accuracy becomes 0.95 + (0.05 × 0.90 × 0.95) = 0.99275—because most of the 5% of errors get caught and most retries succeed. At 0.993 per step, twenty steps yield 0.993²⁰ ≈ 0.87. Under this simplified one-correction model, the calculated end-to-end success probability is about 86.5%. False alarms, correlated errors, and new defects introduced by repairs require a richer model. A second retry improves the simplified model only under additional assumptions about detection and correction; repeated real attempts can share the same failure.

This is the mechanism to evaluate: useful verification and correction can improve imperfect generation. The numerical result is conditional on its assumptions. Real economics include checker design, execution, maintenance, remaining human attention, and the cost of escaped defects.

## Cherny's Inversion

The earlier edition called this framing “Cherny’s Inversion,” but did not supply a primary locator for its quotation. We retain the useful inversion as a design heuristic, not as a verified statement by a named individual.

The distinction matters because it reframes the object of engineering. You are not building smarter AI. You are not writing better prompts. You are building feedback systems—systems that take imperfect AI outputs and refine them into verified results through structured iteration. The model is a component, replaceable and interchangeable. The loop is the product.

This is Cherny's Inversion: the realization that the highest-leverage engineering work is not making the model better at a task, but making the verification of that task cheaper and more automated. Once verification is cheap, you can let the model attempt the task repeatedly, at scale, without human gates between attempts. Quality depends jointly on the model, information, tools, checks, and control policy. The control-system analogy is useful for reasoning about feedback; it is not proof of convergence.

Consider two engineering approaches to the same problem: generating a function that correctly handles all edge cases, including malformed input, timeout conditions, and concurrent access.

Approach A: Better Prompting. Spend thirty minutes crafting a detailed system prompt with examples of each edge case, explicit instructions about error handling patterns, output format constraints, and few-shot demonstrations of correct solutions. Run the prompt. Review the output manually—trace through the logic, check each edge case, verify the error handling. Re-prompt if you find defects. Human time per invocation: five to fifteen minutes of careful review.

Approach B: Loop Engineering. Write a test suite that covers the edge cases (fifteen minutes—you know what the function should do, you just encode that knowledge as assertions). Write a type specification (three minutes—the function signature with typed parameters and return value). Set up a loop: generate, run tests, if tests fail feed the error message back as context, regenerate, repeat until all tests pass or budget is exhausted (ten minutes of setup, reusable thereafter). Run the loop unattended. Intermediate review can be avoided for the specified checks; final judgment, maintenance, and release decisions remain separate costs.

Approach A requires human attention on every invocation, every time the function needs to be generated or modified. Approach B amortizes some recurring review work, but still needs maintenance, audits, incident response, and changes when requirements evolve. Approach A gets better with better models, because a smarter model makes fewer errors on the first pass. Approach B gets better with better tests, because more comprehensive tests catch more failure modes on each iteration. Versioned tests can preserve explicit expectations across model updates. They still require maintenance when requirements or dependencies change, and adding checks can introduce cost or conflicting expectations.

The practitioner's mental model shifts from "how do I ask clearly enough that the model understands my intent" to "how do I verify cheaply enough that the loop can iterate without human involvement." This is a fundamental reorientation. It is the difference between being a manager who gives clear instructions (and must review every deliverable) and a manager who builds processes (which scale independently of the manager's personal attention).

| Before (Prompt Engineering)         | After (Loop Engineering)             |
|-------------------------------------|--------------------------------------|
| Crafting the perfect instruction    | Defining the acceptance criteria     |
| Adding examples to the prompt       | Building the verification oracle     |
| Tweaking temperature and parameters | Tuning the stop condition and budget |
| Reading and reviewing AI output     | Monitoring loop health metrics       |
| Re-prompting on failure             | Fixing the oracle or the constraints |
| Model selection for capability      | Model selection for cost at quality  |

The table reveals the deeper point: in prompt engineering, the human is the quality gate. In loop engineering, the oracle is the quality gate. The human's role shifts from per-output review (which does not scale) to per-loop design (which scales to every run the loop ever makes).

## Patterns Worth Testing, Not Unsupported Production Proof

The original edition cited Harvey, Wisedocs, Spiral, and Netflix and attached precise improvement claims without sufficient source context. Those claims cannot establish that model weights were unchanged, that a particular mechanism caused the improvement, or that another team will reproduce it. Remove those inferences from an architecture decision unless the underlying experiment supports them.

Four patterns remain useful to test. A document-processing loop can retain source-linked parsing workarounds between sessions. An editorial loop can apply explicit structural checks before involving an editor. A drafting workflow can separate generation from evaluation. A build-analysis system can aggregate findings across independent logs. None requires treating a vendor anecdote as a controlled comparison.

For each pattern, define a baseline and the failure it addresses. Measure repeated parsing failures before and after introducing memory, not just overall completion. Measure whether a rubric catches real defects without rejecting acceptable drafts. Measure whether parallel analysis finds additional reproducible patterns, not merely whether it produces more findings. These are different outcomes and deserve different tests.

A useful pilot report includes the task distribution, model and configuration revisions, number of cases, comparison method, effect size, uncertainty, and operational cost. If those details are absent, treat the report as a hypothesis generator rather than evidence that the harness “dominates” every other component.

## The Old Way vs. The New Way

The contrast between prompt-centric and loop-centric engineering is worth drawing sharply, because the muscle memory of prompt engineering is strong and the gravitational pull back toward it is constant—especially when a loop takes more upfront work to design.

``` mermaid

flowchart TD
    subgraph old["The Old Way: Human-in-the-Loop"]
        A[Human types prompt] --> B[Model generates output]
        B --> C[Human reads output<br/>2-15 minutes]
        C --> D{Correct?}
        D -- No --> E[Human types correction]
        E --> B
        D -- Yes --> F[Ship]
    end
    
    subgraph new["The New Way: Machine-Verified Loop"]
        G[Human defines goal + oracle<br/>one-time investment] --> H[Agent discovers context]
        H --> I[Agent plans approach]
        I --> J[Agent executes]
        J --> K{Oracle verifies}
        K -- Fail --> L{Budget left?}
        L -- Yes --> M[Feed error back] --> I
        L -- No --> N[Escalate to human]
        K -- Pass --> O[Ship]
    end
```

In the old way, total human time is fifteen to forty-five minutes per task—proportional to the complexity of the output and the thoroughness of the review. The bottleneck is human review bandwidth. The system scales with the number of humans you can hire, train, and retain. Each new task type requires a new human reviewer who understands the domain well enough to verify the output.

In the new way, total human time is fifteen to sixty minutes to build the loop initially—writing the oracle, setting the budget, defining the stop conditions and escalation policy—and then zero minutes per subsequent run for tasks the oracle handles. The bottleneck is oracle quality: how well your automated verification discriminates good output from bad. The system scales with compute budget.

The new way does not eliminate human judgment. It moves human judgment upstream—from reviewing every output to designing the verification criteria that review outputs automatically. You spend your intelligence once, on the oracle. The loop spends compute repeatedly, on the generation and verification. This is the fundamental economic shift: convert recurring human attention into one-time human design work. Design work can amortize across repeated tasks; verification and maintenance remain recurring costs.

## Lessons from the Development of Agent Workflows

The earlier edition used a compressed product history to argue that the harness determines agent quality. A sequence of product launches is useful context, but it does not isolate why a system performed better. Model versions, tools, task distributions, budgets, and evaluation methods can change together. This chapter therefore uses that history as motivation for design questions, not as controlled evidence of a universal harness advantage.

Reasoning-and-action workflows illustrate the value of obtaining observations between decisions. Tool-use frameworks make those interactions easier to assemble. Coding assistants make the cycle visible when they edit, run checks, inspect failures, and revise. These capabilities do not establish that every loop converges, that a framework enforces an adequate oracle, or that a test suite covers the behavior a user cares about.

Three lessons guide the designs that follow.

**Lesson 1: Bound the work.** A loop without explicit limits can consume resources without producing an acceptable outcome. Define a total budget for time, attempts, provider calls, and spending; stop on success, cancellation, stagnation, unresolved uncertainty, or exhausted limits. Preserve the artifact and identify the next responsible decision when escalation is needed. These become part of the Loop Contract in [Chapter 3](chapter-03.md).

**Lesson 2: Test harness effects.** Product comparisons motivate hypotheses, but do not by themselves isolate those effects from model or benchmark changes. A controlled comparison should hold the task distribution, model, sampling, and budget appropriately fixed before attributing a difference to a harness change. Inspect failures and regressions alongside aggregate scores. [Chapter 4](chapter-04.md) develops the mechanisms and the evidence needed to assess them.

**Lesson 3: Compare complete costs at acceptable quality.** Verification can cost more than generation and still be justified when it prevents an expensive failure. Compare design, execution, maintenance, remaining review, and expected defect losses over a realistic number of tasks. A one-off task may favor direct review; a repeated task may justify an automated oracle. [Chapter 20](chapter-20.md) develops an oracle hierarchy that starts with inexpensive discriminating checks and adds more costly evidence when the task requires it. No layer is free to operate merely because it makes no model call.

## What This Book Is (and Is Not)

This book teaches you to design, build, and operate loops that ship verified work without human review at every step. It is for practitioners—people who build and operate production systems, not people who write about them theoretically.

This is a systems engineering manual for autonomous AI workflows. It develops architectural principles through explicitly illustrative scenarios and code sketches, with source-specific evidence and its limits identified where available. It is concerned with verification, cost, and reliability above all other qualities, because those are the properties that determine whether a loop ships value or burns money.

It is honest about what does not work. Every chapter contains a "What Breaks" section that names the conditions under which the chapter's own advice fails. This is not false modesty—it is the trust-building mechanism that engineering books owe their readers. If we claim loops solve everything, the first failure destroys credibility. If we name the failure modes upfront, you are equipped to avoid them.

This book is not a prompt engineering cookbook (though prompts appear as components of loops). It is not an ML fundamentals textbook—you already know what a language model is, how tokens work, and what fine-tuning means. It is not a survey of every agent framework (we focus on principles that transcend any specific library). It is not a hype piece about autonomous AI replacing all human work. And it is not an academic treatment of multi-agent systems theory.

**The book's central thesis:** Generation capability, context, tools, verification, and authority boundaries jointly determine the quality and safety of an AI system. Build better oracles, and you can ship verified work at machine speed.

## The Loop Contract (Preview)

Every chapter in this book references a single formalism—the Loop Contract—introduced fully in [Chapter 3](chapter-03.md) (*Anatomy of a Loop*) and filled in part by part through the rest of the book. Here is the preview:

``` yaml

loop_contract:
  goal: "What constitutes done, in machine-checkable terms"
  oracle: "How the loop knows the goal is met"
  budget: "Maximum tokens, time, money, or retries before escalation"
  stop_condition: "When the loop terminates (success, budget, oscillation)"
  escalation_path: "What happens when the loop can't resolve"
```

Every loop you build must answer these five questions. A loop missing any one of them is broken in a specific, predictable way: without a goal it cannot converge, without an oracle it cannot verify, without a budget it can run forever, without a stop condition it can oscillate, without an escalation path it fails silently. The rest of this book teaches you to make each answer precise, cheap, and reliable.

## How to Read This Book

The book is structured in eight parts. Each part answers one engineering question and develops one or more elements of the Loop Contract:

| Part | Question | Contract Element |
|----|----|----|
| I — The Paradigm Shift | Why loops? | Motivation and formalism |
| II — The Substrate | What does the loop run on? | Infrastructure |
| III — Building the Loop | How do you build one? | Goal + Stop condition |
| IV — Verification | How does it know it's done? | Oracle |
| V — Fleets | How do you run many? | Escalation path |
| VI — Economics and Control | How do you afford it? | Budget |
| VII — Hardening | How do you trust it unattended? | Safety and reliability |
| VIII — Practice and Frontier | How do you do it for real? | All five, integrated |

You can read linearly (the chapters build on each other and forward references are marked), or you can jump to the part that answers your most pressing question. If you are already building loops and they are too expensive, jump to Part VI. If they are unreliable or produce inconsistent quality, jump to Part IV. If you need to scale from one loop to a coordinated fleet, jump to Part V. If you have not built your first loop yet, read straight through Parts I-III.

But if you read nothing else, read three chapters: [Chapter 3](chapter-03.md) (*Anatomy of a Loop*—the Loop Contract formalism), [Chapter 20](chapter-20.md) (*The Hierarchy of Oracles*—verification from cheap to expensive), and [Chapter 27](chapter-27.md) (*Token Economics of Loops*—the cost model that determines viability). Those three chapters contain the intellectual core that everything else develops.

## Implementation Guidance: Separate Three Questions

Before automating Priya’s workflow, separate “is the artifact well formed?”, “does it meet the required behavior?”, and “may this action be released?” Parsing a patch answers the first. Tests for timeout and key forwarding answer part of the second. Neither answers the third. Release authorization comes from the relevant human or policy boundary, not from the model announcing that tests passed.

Build a small acceptance table: each requirement has an observable check, an owner, and a known blind spot. For a retry adapter, one row verifies that attempts preserve a stable logical operation key; another injects a lost response after a remote commit; a third checks cumulative retry limits across restarts. The second row cannot be replaced by a happy-path unit test. [Chapter 39](chapter-39.md) develops that boundary in detail.

The first useful loop should produce a reviewable patch and raw test receipts, not grant itself merge rights. On failure, preserve the best current artifact and identify the failed criterion. On an infrastructure error, report that the test did not complete rather than classifying the code as incorrect. On a passing check, state exactly which revision and environment passed. This keeps useful progress visible without turning narrow evidence into a blanket guarantee.

For the chapter’s oracle exercise, acceptance means the checker rejects deliberately malformed and behaviorally wrong examples, accepts known-good examples, and reports inconclusive when a dependency is unavailable. Five repeated tasks are a smoke test of the workflow, not statistical proof of a production defect rate. Choose a larger evaluation only when the decision risk requires it.

## What Breaks

This chapter argues that loops solve the review bottleneck. That is true, but the argument is incomplete in three ways that intellectual honesty demands acknowledging.

First, loops only work when the verification criteria can be expressed in machine-checkable form. For tasks where "good" is genuinely subjective—brand voice that must feel right rather than merely comply with rules, strategic decisions that depend on market judgment, creative choices where the value is in the surprise—the oracle bottleneck replaces the review bottleneck. You cannot automate verification you cannot specify. [Chapter 15](chapter-15.md) (*Goal Specification*) addresses the boundary between specifiable and unspecifiable quality, but it does not dissolve the boundary. Some tasks genuinely require human judgment at every iteration, and pretending otherwise produces loops that ship mediocre output confidently.

Second, building a good loop has a fixed cost that does not amortize over one-off tasks. If you will run a task exactly once, a prompt is cheaper than a loop—the time you spend writing the oracle and configuring the stop condition exceeds the time you would spend reviewing a single output manually. The loop's economics only work when the verification infrastructure is reused across many runs of the same or similar tasks. [Chapter 5](chapter-05.md) (*When Not to Build a Loop*) provides the decision framework for when the upfront investment is justified.

Third, loops shift risk from visible human errors to invisible systematic failures. When a human reviews output, errors are caught by an intelligent agent who can recognize novel failure modes. When an oracle reviews output, errors are caught by a mechanical process that can only detect the failure modes it was designed to detect. A poorly designed oracle creates false confidence: the loop runs, verification passes, output ships—but the verification was testing the wrong properties or testing them at insufficient depth. Over-trusting automated verification is the highest-consequence failure mode in production loops, more dangerous than having no verification at all (which at least does not create the illusion of quality). Part IV dedicates four chapters to oracle design, calibration, and failure detection precisely because this risk is severe and non-obvious.

The honest summary: loops are the right architecture for repeated, specifiable tasks where verification is cheaper than generation. They are not a universal solution. Knowing when they apply—and when they do not—is as important as knowing how to build them.

## Key Takeaways

- Measure the workflow before naming its bottleneck; repeated manual checking is one candidate for automation.
- A prompt alone supplies no external execution evidence. Under the stated independent-step illustration, 0.95²⁰ is about 0.36.
- Detection and useful repair can improve reliability; the illustrative one-correction model gives 0.99275²⁰ ≈ 0.865, with independence and correction assumptions.
- Treat the retained inversion as a design heuristic, not a verified quotation: reduce repeatable checking costs while preserving meaningful evidence.
- Test architectural hypotheses against a baseline; unsupported company outcomes do not establish causal improvements.
- The Loop Contract (goal, oracle, budget, stop condition, escalation path) is the book's central formalism, introduced fully in [Chapter 3](chapter-03.md).
- Loops fail when verification criteria are unspecifiable, when the task is unrepeated (no amortization), or when oracle quality creates false confidence.

## Exercises

1.  **Identify your bottleneck.** Take a task you currently perform with an AI assistant. Time yourself across three sessions: how many minutes per session do you spend reading, evaluating, and re-prompting versus thinking about the actual problem? Calculate the review-to-thinking ratio.

1.  **Build your first oracle.** For the same task, write down three machine-checkable acceptance criteria. These might be test cases, lint rules, structural checks, or rubric items. Implement at least one as a script that takes the AI's output as input and returns pass/fail with an actionable error message on failure.

1.  **Measure the compound effect.** Pick a multi-step task (minimum five coordinated steps). Run it five times as a single prompt with manual review. Then add per-step automated verification (even minimal checks like "does this compile" or "does this parse as valid JSON") and run it five times as a loop. Compare end-to-end success rates.

1.  **Estimate the crossover point.** For a loop you might build, estimate: (a) the hours to build the verification infrastructure, (b) the minutes of human review per run without the loop, (c) the expected runs per month. Calculate how many months until the loop's setup cost is amortized. What is the break-even point?

1.  **Audit an existing agent.** Find an AI agent or assistant workflow you use (Copilot, Claude Code, a custom integration). Identify which of the five Loop Contract fields it implements and which are missing or weak. What failure modes have you observed that correspond to the missing fields?

## Sources and Evidence Limits

- [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): grading, unknown outcomes, transcript inspection, and evaluation maintenance; not support for the removed company performance claims.

The original edition attributed product features and outcome figures to undated or incompletely located vendor material. Those inherited attributions are **unverified in this chapter**; they are not reproduced as a fact-check receipt. The engineering patterns and fictional examples stand separately from those claims. Consult the edition’s source notes for collected references and verify implementation-specific contracts against the version you deploy.

------------------------------------------------------------------------

*Next: [Chapter 2](chapter-02.md) maps the autonomy levels—from autocomplete to self-designing fleets—giving you a navigation device for every subsequent chapter.*
