# Chapter 5: When Not to Build a Loop

> **Reading note.** Named practitioner scenarios and their timings, costs, and outcomes are fictional illustrations unless a specific source is identified. Numerical assumptions are not provider quotes or measured results. Code, commands, configuration, and traces are illustrative pseudocode/API sketches, not executed examples. In particular, `loopkit` is a teaching namespace, not a tested installable SDK. Legacy product attributions marked unverified are not evidence for deployment decisions.

> The most expensive loop is the one that shouldn't exist.

## The Invoice That Should Have Been a Script

Marcus Chen stared at his team's cloud bill for March. The "PR Description Generator" — their first production loop — had burned \$4,200 in API costs. It processed 847 pull requests across three repositories, running an average of 3.2 iterations per PR to produce descriptions that met their rubric: summarize the diff, list affected systems, flag breaking changes.

The math looked good on paper. Each PR description took about twelve minutes for a developer to write manually. At a blended engineering rate of \$95 per hour \[ESTIMATE: US tech industry fully-loaded mid-senior rate, varies by geography\], that was roughly \$19 per description, or about \$16,000 per month in developer time. The loop should have been a clear win.

Except Marcus had made a mistake at the design stage. He measured the iteration count: 3.2 average. He measured the oracle cost: a model-judge call per iteration. He measured the infrastructure: a queue, a state store, retry logic, error handling, alerting, and on-call rotation. What he had not measured was the output quality distribution. When he finally did, in week four, the data was damning: 73% of PR descriptions were accepted on the first pass without any iteration. The loop's verification and retry machinery existed to handle the remaining 27%. And of those, most were large refactoring PRs where the model reliably struggled with diffs over 800 lines.

A deterministic script that extracted file paths, function signatures, and git commit messages — then fed a single LLM call with a structured template — would have handled the 73% for roughly \$0.12 per PR. For the hard cases, the script could flag them for human writing, at the engineer's actual marginal cost of about five minutes per flagged PR (these were the complex ones, but a human starting from the script's structured template works faster than from a blank page). Total monthly cost under the script-plus-flag approach: about $150 in API fees plus approximately 19.1 hours of developer time for the hard cases—about $1,960 before maintenance at the illustrative $95 hourly rate. The loop cost \$4,200 in API fees alone.

Marcus's loop was not wrong. It worked. It produced acceptable output. But it was an engineering-hours investment solving a problem that a forty-line Python script with a single model call could have handled at a fraction of the cost. The lesson cost his team \$4,200 in the first month and roughly eighty engineering hours in build and maintenance time that will take over a year to amortize. The infrastructure existed to squeeze quality out of the 27% hard cases — a population small enough that human attention was cheaper than iterative machine attention.

This chapter gives you the framework Marcus needed before he started building. It is deliberately conservative. It will sometimes talk you out of building loops that would deliver value. That is a feature, not a bug. The cost of building an unnecessary loop is months of engineering time and thousands of dollars in API fees. The cost of not building a loop that would have helped is a missed efficiency gain that you can capture later once you have the data to justify the investment.

## The Three Gates

Before committing to a loop, pass your task through three gates. If it fails any one, build something simpler. The gates are ordered by how quickly you can evaluate them: verifiability first (answerable in minutes by attempting to write the oracle's interface), then unit economics (requires estimation and arithmetic), then blast radius (requires threat modeling of failure modes).

``` mermaid

flowchart TD
    T[Task Proposal] --> G1{Gate 1:<br/>Can you write<br/>an oracle?}
    G1 -- No --> R1[Single pass + human review]
    G1 -- Yes --> G2{Gate 2:<br/>Loop cost &lt; human cost<br/>at actual volume?}
    G2 -- No --> R2[Script or workflow]
    G2 -- Yes --> G3{Gate 3:<br/>Is failure survivable<br/>when unattended?}
    G3 -- "No: irreversible" --> R3[Loop + human approval gate]
    G3 -- Yes --> BUILD[Build the loop]
```

## Gate 1: Verifiability

The question is precise: can you write a machine-checkable oracle for this task's output? Not merely “can a human tell if it is good”—human judgment can also be uncertain or inconsistent. The question is whether you can encode that judgment into a function that runs without a person present and returns a verdict: pass, fail, or inconclusive.

Without an oracle, a loop degenerates into generation-without-verification. You pay for iteration (tokens, latency, infrastructure) but gain nothing from it, because no iteration can move the output closer to a quality threshold you cannot measure. The loop becomes an expensive random walk: each iteration produces a different output, but no iteration is demonstrably better than the one before it. You have built, at considerable cost, a machine that generates variety without progress.

Some tasks pass Gate 1 cleanly. Code generation has tests, type checkers, and linters — deterministic oracles that run in milliseconds and return unambiguous verdicts. Data transformation has schema validation, row-count checks, and referential-integrity constraints. Structured document production has format validators, required-field checks, and cross-reference consistency verification. Classification against labeled datasets has precision and recall computed against ground truth. In each case, the oracle is cheap (fractions of a cent), fast (milliseconds to seconds), and reliable (deterministic, no judgment involved).

Other tasks fail Gate 1 as stated but can be reframed into something verifiable. The technique is rubric construction: decompose the vague quality judgment into specific, machine-checkable criteria. "Write good documentation" fails Gate 1 — "good" is not computable. But "write documentation that covers every public API method, includes at least one usage example per method, and scores below grade 10 on the Flesch-Kincaid readability formula" passes, because each criterion reduces to a deterministic check or a model-judge evaluation against explicit criteria. The reframe test asks: can you decompose quality into enumerable criteria? If yes, you have an oracle — even if it is a rubric-based model-judge (Level 3 in the oracle hierarchy, [Chapter 20](chapter-20.md), *The Hierarchy of Oracles*) rather than a deterministic check.

If the answer remains no after earnest reframing — if the quality judgment requires taste, intuition, or domain expertise that you cannot articulate as criteria — the loop cannot close. Use a single-pass call with human review. The human is the oracle.

One subtlety deserves attention. Some oracles are so expensive that they defeat the economics of iteration. If your oracle is a full integration test suite requiring forty-five minutes to execute, you can technically close the loop, but each iteration costs forty-five minutes of wall clock time and whatever compute the test suite consumes. Oracle feasibility is a Gate 1 question; oracle cost is a Gate 2 question. Separate them. Gate 1 asks only: does the oracle exist? Gate 2 asks: can you afford to run it repeatedly?

## Gate 2: Unit Economics

The question: at your actual task volume, is the fully loaded cost per loop execution lower than the human alternative?

This is arithmetic, not intuition. You need four numbers, and you should be skeptical of your estimates for all four.

**Loop cost per task.** Compute it as: average iterations multiplied by tokens per iteration multiplied by cost per million input tokens, plus oracle cost per verification call, plus amortized infrastructure cost (queue processing, state storage, monitoring, alerting, and the on-call burden when the loop breaks at 2am). The last term is the one most teams forget. Marcus forgot it. A queue, a state store, a dead-letter mechanism, alerting on failures, dashboards for monitoring throughput, and the cognitive overhead of maintaining another production system — these are not free, and they do not amortize to zero even at high volume.

**Human cost per task.** The fully loaded hourly rate of the person who would otherwise do this work, multiplied by the time it actually takes them. Include benefits, management overhead, and the cost of context-switching (most tasks are not done in isolation; the human loses time getting into and out of the task). For most US technology organizations, a mid-senior engineer costs \$80–130 per hour fully loaded \[ESTIMATE: varies significantly by geography, company size, and seniority level\].

**Volume.** How many times per month does this task occur? Volume is the denominator that amortizes build cost. Be honest about this number. If the task occurs 500 times per month today, the economics are clear. If it occurs 12 times per month, the break-even timeline extends dramatically. If you are projecting future volume growth to justify the investment, you are speculating, not engineering.

**Build and maintenance cost.** The engineering hours to build the loop (write the oracle, design the prompts, implement the harness, set up infrastructure, write tests for the loop itself) and maintain it over time (update prompts when the codebase changes, fix oracle drift, handle model-version upgrades). A production loop is not a weekend project; for a non-trivial task, budget 40–120 hours for initial build and 4–8 hours per month for ongoing maintenance \[ESTIMATE: based on author observations across teams shipping production loops in 2025-2026; varies significantly with task complexity and oracle sophistication\].

The break-even formula:

``` python

def months_to_break_even(
    loop_cost_per_task: float,
    human_cost_per_task: float,
    tasks_per_month: int,
    build_hours: float,
    maintenance_hours_per_month: float,
    engineering_hourly_rate: float,
) -> float | None:
    """Return months to break even, or None if the loop never pays off."""
    monthly_savings = (
        (human_cost_per_task - loop_cost_per_task) * tasks_per_month
        - maintenance_hours_per_month * engineering_hourly_rate
    )
    if monthly_savings <= 0:
        return None  # Loop costs more than humans. Don't build it.
    build_cost = build_hours * engineering_hourly_rate
    return build_cost / monthly_savings
```

Apply this to Marcus's scenario with honest numbers. His loop cost \$4.96 per PR (\$4,200 divided by 847 PRs). The human cost was roughly \$19 per PR. Monthly savings from the loop: (\$19 − \$4.96) × 847 − 8 hours maintenance × \$95 = \$11,135. Build cost: 80 hours × \$95 = \$7,600. Break-even: 0.68 months. By this calculation, the loop pays for itself in three weeks.

But Marcus had an alternative. A script-plus-single-call approach would cost roughly \$0.15 per PR (one model call, no iteration). Including five minutes of human work for 27% of cases, monthly savings from the script are approximately $16,093 − $127.05 − $1,810.46 − $190 = $13,965.49. Build cost: 8 hours × \$95 = \$760. Break-even: approximately 0.054 months on these illustrative assumptions; this excludes migration and uncertainty in adoption.

Both beat the human baseline. But the script reaches break-even in two days and costs \$760 to build. The loop reaches break-even in three weeks and costs \$7,600 to build. The script is the better engineering decision unless the loop's quality improvement on the hard 27% justifies the ten-fold higher build cost. For PR descriptions, it does not. For tasks where iteration quality matters — security review, complex code generation, research synthesis — it often does.

The decision rule: if a simpler system also passes Gate 1 (even with a weaker oracle), and the economics favor the simpler system at your actual volume, build the simpler system. Loops earn their complexity only when iteration materially improves output quality in ways that single-pass generation cannot achieve, and that improvement is worth the cost differential.

### Where loops win the economics

High-volume tasks where human attention is the bottleneck favor loops strongly. Processing 500 pull requests per day for security review, at ten minutes of human attention each, requires 83 person-hours daily — roughly \$7,900–10,800 per day at fully-loaded senior rates \[ESTIMATE: \$95–130/hour range\]. A loop at \$0.50–1.00 per PR costs \$250–500 per day. The order-of-magnitude cost advantage justifies substantial build investment.

Human-slow, machine-fast tasks produce similar advantages. Deep code review requiring thirty minutes of concentrated human attention but achievable in three loop iterations at \$0.80 total. Research synthesis requiring two hours of human reading but achievable in five iterations at \$2.50. The wider the time gap between human and machine for comparable quality, the stronger the case.

Consistency-critical tasks where human fatigue is a measurable quality factor also favor loops. The 400th PR reviewed at 4pm on Friday receives less attention than the first on Monday morning. A loop does not experience human fatigue, but its quality can change with load, dependency health, input mix, context growth, and provider changes.

### Where loops lose the economics

Low-volume tasks. If a task occurs three times per month, even a modest build cost of 40 hours takes over a year to amortize. The maintenance cost alone (\$380–760/month for 4–8 hours at \$95/hour) may exceed the total monthly savings. Write the script.

Already-fast human tasks. If the human completes the task in sixty seconds, the loop's minimum overhead (context loading, at least one oracle evaluation, and the latency of even a single iteration) likely exceeds that time. The cost of infrastructure for iteration exceeds the cost of human attention. Automate with a single call and a schema check, not a loop.

High first-pass accuracy tasks. If the model succeeds on the first attempt 97% of the time, your verification and retry machinery exists for 3% of executions. The infrastructure cost of maintaining that machinery — oracle updates as the domain evolves, alerting, on-call burden, prompt maintenance — often exceeds the cost of human review for the rare failures. Marcus's 73% first-pass rate was high enough that the iteration machinery was disproportionate to the problem.

## Gate 3: Blast Radius

The question: if the loop produces incorrect output and ships it without human review, what is the worst-case damage?

Every loop will eventually produce wrong output. Oracles are imperfect; they have false-negative rates. Edge cases slip through. Model regressions introduce new failure modes that the oracle was not designed to catch. The question is not whether failure occurs — the simplified reliability model in [Chapter 6](chapter-06.md) motivates planning for it but does not prove a particular finite run will fail — but whether failure is survivable when no human is watching.

Blast radius assessment requires you to think downstream. A wrong PR description wastes a reviewer's time when they discover the inaccuracy — annoying, perhaps ten minutes of human attention, but costless in system terms. A wrong database migration drops a production column. A wrong customer email sends incorrect pricing to 50,000 subscribers. The loop's blast radius determines how much trust you must place in its oracle, and therefore how robust (and expensive) that oracle must be.

Low blast radius makes loops feasible even with modest oracles. The output is a draft, a suggestion, a branch that requires human approval before it affects anything real. If the loop produces garbage, the worst case is wasted computation. Most coding loops operate in this regime: they produce a PR that a human merges or rejects. The blast radius is bounded by the approval gate that already exists in the development workflow.

High blast radius demands either a near-perfect oracle or a mandatory human gate. Sending emails to customers, deploying to production, modifying financial records, publishing content publicly — these actions have real-world consequences that cannot be undone by reverting a commit. For these tasks, the loop produces and verifies, but a human approves the final action. The final action is gated even if investigation uses an L3-style adaptive loop; classify authority per operation rather than relabeling the entire system.

Critical blast radius means you do not build an autonomous loop at all. Deleting customer data, issuing financial transactions above a threshold, making safety-critical decisions in physical systems — these are domains where the consequence of a single failure exceeds the cumulative value of all successful executions. The human stays in the loop for every execution.

The spectrum between these levels is not binary. Between "fully autonomous" and "human approval for every action" exists a gradient of mechanisms: dry-run modes that preview effects without executing them, canary deployments that limit initial scope, automatic rollback on metric degradation, approval only above a damage threshold (autonomous for low-stakes instances, human-gated for high-stakes ones). A canary and health checks can reduce deployment risk, but a five-minute window is not a general safety guarantee: delayed effects, low traffic, and incomplete metrics can conceal failures. The loop is autonomous within a blast-radius-bounded sandbox.

## The Worked Decision: Should You Loop This?

Consider a concrete task: generating Terraform modules from natural-language infrastructure requests submitted via a Slack bot. The team processes roughly 60 requests per month.

**Gate 1 (Verifiability).** Can you write an oracle? Yes. `terraform validate` confirms syntactic correctness. `terraform plan` against a test account confirms the module produces the expected resource graph without errors. A policy-as-code check (Open Policy Agent rules) confirms security constraints (no public S3 buckets, no overly permissive IAM policies, required tags present). You have a strong, layered deterministic oracle. Gate 1 passes.

**Gate 2 (Unit Economics).** A senior infrastructure engineer takes roughly 45 minutes per module at \$110/hour fully loaded \[ESTIMATE: US infrastructure engineer rate, varies by organization\] — that is \$82.50 per module, or \$4,950 per month for 60 modules. A loop averaging 2.5 iterations at roughly \$1.20 per iteration (Sonnet-class model at ~15K tokens per iteration at early-2026 list pricing \[ESTIMATE: approximate; actual cost depends on prompt complexity and output length\]) plus an assumed total validation cost of $0.05 per task gives $3.05 per task. These are scenario inputs, not a price derived from the stated token count; measure planning and policy-check costs in your actual environment. Build cost: estimate 80 hours at \$110/hour = \$8,800. Monthly savings after maintenance: (\$82.50 − \$3.05) × 60 − 6 hours × \$110 = \$4,107. Break-even: \$8,800 / \$4,107 = 2.1 months. Gate 2 passes comfortably.

**Gate 3 (Blast Radius).** The Terraform modules go into a pull request that requires infrastructure team approval before anyone runs `terraform apply`. The loop produces code; humans ship infrastructure. Blast radius is bounded by the existing approval gate. Even if the loop produces a module that would destroy the production VPC, the module cannot execute without human sign-off. Gate 3 passes.

Verdict: build the loop.

Now change one parameter. Suppose the volume is six requests per month instead of sixty. Monthly savings become (\$82.50 − \$3.05) × 6 − \$660 = −\$183. The loop loses money every month because maintenance cost exceeds the savings at low volume. At six requests per month, first evaluate a template library that covers the common patterns, use a single model call with `terraform validate` as a post-check, and flag unusual requests for manual authoring. No loop needed.

## The Workflow Alternative

When a task fails Gate 2 or sits at the boundary, the answer is often not "human does everything" but "workflow instead of loop." A workflow is a fixed pipeline where the developer predetermines every step. An LLM fills one or more slots in the pipeline, but the model never decides what happens next — the pipeline code does.

Fixed workflows remove open-ended planning but still need meaningful validation, bounded retries for failures, and recovery for external effects. The LLM either fills its slot acceptably (checked by schema validation or a quick deterministic test) or the workflow flags the instance for human attention. Workflows cost less to build (no oracle design, no iteration logic), less to run (one model call per slot), and less to maintain (fewer moving parts).

The decision rule: if the path from input to output is known in advance, and the only uncertainty is "can the model fill this slot correctly?" — build a workflow, not a loop. Reserve loops for tasks where the path itself is uncertain (the model must decide what to do based on what it discovers) or where iteration against a quality oracle materially improves the result beyond what a single pass achieves.

Many production systems are hybrids. A deterministic workflow provides the skeleton — trigger, fetch, transform, validate, post. One or two steps within that workflow are loops: the transformation step iterates against a quality rubric, or the review step runs a maker-checker cycle ([Chapter 21](chapter-21.md), *Maker-Checker: The Grader Must Not Share the Maker's Context*). The workflow provides predictability and low cost; the embedded loops provide iteration quality only at the steps that genuinely benefit from it. You pay the complexity of iteration only where it earns its keep.

## Implementation Guidance: Compare Complete Alternatives

Marcus should compare three complete systems, not the loop’s full bill against the script’s model-call fee. For each alternative, include ordinary runs, escalated cases, human review, failed attempts, infrastructure, maintenance, and the expected cost of escaped defects. If the script routes 27% of 847 monthly cases to a person for five minutes each, that is about 19.1 hours, not twelve. At the illustrative $95 hourly rate it adds about $1,810 before maintenance. The script can still win; corrected arithmetic makes the decision credible rather than merely persuasive.

Keep labor capacity and cash savings distinct. Saving twenty engineer-hours does not automatically lower payroll by twenty hours. It may increase capacity for other work, shorten a queue, or reduce interruption. State which outcome the organization values. Similarly, a high first-pass success rate does not alone decide whether retries are worthwhile. A small failure fraction may contain the most consequential tasks, and a cheap retry path may already exist in the runtime.

Make a short sensitivity table for volume, failure fraction, review minutes, and maintenance hours. Use pessimistic and optimistic values rather than a single precise-looking break-even month. Mark unmeasured inputs explicitly. If the preferred design changes under a modest shift in one input, collect that evidence before building permanent infrastructure. A read-only or draft-only prototype can often measure the input without accepting the final action’s blast radius.

The Terraform example also needs a clear environment boundary. Validation does not prove a plan is desirable; planning may contact providers or execute data sources. Use an isolated account with minimal credentials and reviewed provider configuration. A pull request does not guarantee safety if its CI has production secrets or if branch creation triggers deployment automatically.

Exercise acceptance: present the three alternatives on the same monthly workload, including the hard cases. Recalculate at one tenth of the expected volume and at twice the maintenance burden. Record a kill criterion for the prototype and a maximum consequence per run. The result can legitimately be “do not build,” “use a fixed workflow,” or “pilot one bounded loop”; the exercise is not a contest to justify the most autonomous design.

## What Breaks

This chapter's framework is deliberately conservative. It will talk you out of building loops that would, in fact, deliver value — particularly for novel tasks where neither the volume nor the first-pass accuracy is known in advance. The three gates assume you can estimate all four economic parameters before building. In practice, estimation is often unreliable. Per-step accuracy depends on prompt quality, which improves during development. Volume projections are frequently wrong, especially for internal tools where adoption grows nonlinearly. Oracle cost depends on design choices you have not yet made.

The framework also biases toward measurable value and away from harder-to-quantify benefits: consistency across hundreds of executions where human attention would waver, coverage of edge cases that time-pressured humans routinely skip, the learning effects of loops that accumulate memory across sessions ([Chapter 12](chapter-12.md), *Memory and Between-Run Consolidation*), and the organizational capability of having loop infrastructure in place when the next high-volume task emerges. These benefits are real but difficult to plug into a break-even formula without speculating.

The honest mitigation: use the three gates as a filter for obvious no-build decisions, not as a decree for ambiguous ones. If a task passes Gates 1 and 3 clearly but Gate 2 is uncertain because volume or accuracy is unknown, build a time-boxed prototype. Run it for two weeks on real tasks. Measure actual costs, actual iteration counts, actual first-pass accuracy. Then apply the formula with real data. The mistake Marcus made was not building a loop — it was building full production infrastructure (queue, state store, alerting, on-call) without first validating the economics with a two-week prototype that could have cost eighty dollars instead of eight thousand.

## Key Takeaways

- Pass every task through three gates before building a loop: verifiability, unit economics, and blast radius. Failure at any gate means build something simpler.
- Gate 1 (Verifiability): if you cannot write a machine-checkable oracle — even after reframing the quality judgment into enumerable criteria — the loop cannot close. Use a single-pass call with human review.
- Gate 2 (Unit Economics): compute the fully-loaded cost per task for the loop versus the human alternative, including build amortization and ongoing maintenance. If the loop does not break even within a reasonable horizon at actual volume, build a script or workflow instead.
- Gate 3 (Blast Radius): if undetected failure causes irreversible real-world damage, the loop needs a human approval gate or should not exist as an autonomous system.
- Workflows (fixed pipelines with LLM slots) are the middle ground between "human does everything" and "loop does everything." They eliminate iteration cost at the expense of adaptability.
- Hybrid systems embed loops only at the steps that benefit from iteration, within an otherwise deterministic workflow skeleton.
- When economics are uncertain, prototype for two weeks with real tasks and measure before committing to production infrastructure.

## The Loop Contract, So Far

This chapter filled the **budget** field indirectly: by establishing that a loop's budget must be justified by its economics relative to simpler alternatives. The budget is not just a ceiling to prevent runaway costs — it is an investment that must deliver returns above the simpler baseline. It also reinforced the **oracle** dependency: without a verifiable oracle (Gate 1), the Loop Contract cannot be completed at all, and the loop should not be built.

## Exercises

1.  **Decision audit.** Take a loop or agent system your team currently runs in production. Apply the three gates retrospectively. Compute the actual break-even timeline using real cost data from your billing. Would you build it again knowing what you know now?

1.  **Break-even calculator.** Implement the `months_to_break_even` function from this chapter. Extend it to accept a `first_pass_success_rate` parameter that models the fraction of tasks that need zero iterations (passing the oracle on the first attempt, paying only single-call cost). Plot break-even months against first-pass success rate for a task of your choice.

1.  **Workflow extraction.** Identify a loop in your codebase (or one you have planned) that could be partially or fully replaced by a deterministic workflow. Sketch the workflow as a sequence diagram. Estimate the cost difference per task. If the workflow is cheaper, propose the refactor.

1.  **Blast-radius mapping.** For a proposed autonomous loop, enumerate every action it can take that modifies external state (files, APIs, databases, user-facing content). Classify each action by reversibility (seconds to reverse, minutes, hours, never). Design the minimum approval-gate strategy that bounds the blast radius to an acceptable level for your organization.

## Sources and Evidence Limits

The original edition attributed product features and outcome figures to undated or incompletely located vendor material. Those inherited attributions are **unverified in this chapter**; they are not reproduced as a fact-check receipt. The engineering patterns and fictional examples stand separately from those claims. Consult the edition’s source notes for collected references and verify implementation-specific contracts against the version you deploy.

------------------------------------------------------------------------

*Next: [Chapter 6](chapter-06.md) confronts the mathematics of unreliability — how independent-step assumptions produce compounding calculations, where those assumptions fail, and how verification changes the model.*
