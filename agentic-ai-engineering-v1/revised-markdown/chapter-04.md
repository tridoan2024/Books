# Chapter 4: The Harness Is the Product

> **Reading note.** Named practitioner scenarios and their timings, costs, and outcomes are fictional illustrations unless a specific source is identified. Numerical assumptions are not provider quotes or measured results. Code, commands, configuration, and traces are illustrative pseudocode/API sketches, not executed examples. In particular, `loopkit` is a teaching namespace, not a tested installable SDK. Legacy product attributions marked unverified are not evidence for deployment decisions.

> The model is a component. The harness is the product. Users never interact with the model—they interact with the system you built around it.

## The Two-Sprint Experiment

In this fictional experiment, a payments compliance startup called Clearway compares two implementation approaches. Their team was building a system to scan transaction descriptions against a regulatory rules database and flag potential violations before transactions clear. Two sub-teams of three engineers each received the same sprint goals, the same model access (Claude 3.5 Sonnet), the same labeled evaluation dataset of 2,000 transactions, and the same two-week timeline.

Team Alpha focused on prompting. They spent nine days—more than half the sprint—crafting an elaborate system prompt: 4,200 tokens of instruction that included a taxonomy of 47 rule categories, few-shot examples of compliant and non-compliant transactions for each major category, chain-of-thought templates for multi-rule reasoning, explicit instructions for handling ambiguous edge cases, and detailed output format specifications. The prompt was a genuine piece of engineering craft—comprehensive, well-organized, tested against representative examples during development. Their remaining days went to basic API integration, response parsing, and a simple retry-on-malformed-output wrapper. Result on the held-out test set: 71% accuracy. Failures clustered around transactions that triggered multiple conflicting rules simultaneously, where the model's single-pass reasoning could not reliably resolve contradictions even with detailed guidance.

Team Beta focused on harness. Their prompt was minimal—200 tokens: "Classify this transaction against the provided rules. Return a structured verdict with cited rule IDs." They spent their nine days building five pieces of infrastructure. First, a retrieval step that pulled only the three most relevant rules into context per transaction based on transaction category and keyword matching, rather than loading all 47 rules every time. Second, a deterministic post-check verifying every cited rule ID actually existed in the rules database—catching hallucinated rule numbers before they reached output. Third, a test loop that ran the system against 500 labeled examples and fed misclassified cases back as few-shot context for subsequent batches. Fourth, a confidence-based cascade that routed high-confidence single-rule cases to Haiku (cheap and fast) and escalated low-confidence multi-rule cases to Sonnet (more capable). Fifth, a rule-conflict resolver that detected when multiple rules produced contradictory guidance and applied a documented priority hierarchy before returning a verdict. Result: 89% accuracy.

Eighteen percentage points of illustrative gap, but not an isolated harness effect: Team Beta also uses a different model cascade and retrieval strategy. Team Alpha invested engineering hours in crafting better instructions. Team Beta invested them in building better infrastructure around minimal instructions. The infrastructure won.

The more revealing data came one month later. With the harness in place, Team Beta spent two days adding prompt refinements layered on top of the infrastructure—clearer instructions for the specific ambiguous cases the cascade identified and escalated to Sonnet, better few-shot examples drawn from the actual misclassification patterns the test loop surfaced. Accuracy rose to 94%. Those prompt improvements gained 5 points because the harness directed them at the right cases. The counterfactual gain without the harness is unknown; this fictional sequence does not measure it.

The lesson: harness investment creates a foundation that makes all subsequent improvements—including prompt improvements—more effective. Prompt improvements without harness investment hit a ceiling imposed by the single-pass architecture. Harness improvements without prompt optimization still provide substantial gains because they change the structural relationship between generation and verification. And they compound across every subsequent run the system ever makes.

## Five Mechanisms That Explain the Gap

The claim that harness quality dominates model quality requires mechanism, not anecdote. Five independent causal paths explain how the same model weights produce measurably different outcomes depending on what wraps them.

**Context curation determines what the model can reason about.** A model reasons only about what is in its context window—information outside the window does not exist for inference. A harness that dumps irrelevant material into context dilutes the model's attention across noise. A harness that retrieves only what matters gives the model space to think.

**Unverified legacy attribution.** The magnitude is quantifiable. Anthropic observed that a five-server MCP setup—GitHub (35 tools, approximately 26K tokens of definitions), Slack (11 tools, approximately 21K), Sentry (5, approximately 3K), Grafana (5, approximately 3K), Splunk (2, approximately 2K)—consumed approximately 55,000 tokens before the conversation started [unverified legacy attribution]. With Tool Search, which loads a compact index upfront and discovers full tool definitions on demand as needed, the same capability required approximately 8,700 tokens [unverified legacy attribution]. In extreme cases, Anthropic observed tool definitions consuming 134,000 tokens before optimization [unverified legacy attribution]. The model's weights are identical in both scenarios. Its available working space for reasoning expands by 45,000-125,000 tokens when the harness curates intelligently. That is the equivalent of giving the model thirty to ninety additional pages for planning, reasoning, and output.

Context curation is the harness's first responsibility and has the most direct impact on model output quality. [Chapter 7](chapter-07.md) (*Context Engineering I: The Window Is a Budget*) develops the principle: every token in context must justify its presence.

**Tool affordances determine what the model can do effectively.** A model with thirty tools and no documentation of when each applies selects tools based on surface name similarity—calling `search_code` when it should call `read_file` because the query contains a filename, or calling `run_tests` before making changes because the tool exists and seems relevant. A model with the same tools plus clear descriptions of when, why, and how to use each selects precisely. The tools are identical. The model's navigation of its tool space improves because the harness made selection criteria explicit.

**Unverified legacy attribution.** Programmatic Tool Calling extends this: the model writes code that calls tools directly within a sandboxed environment, keeping intermediate results in the execution environment rather than consuming context tokens. Claude for Excel uses this to process spreadsheets of thousands of rows without overloading the context window [unverified legacy attribution]. The model's intrinsic capability is unchanged. The harness's tool-calling architecture determines how much of that capability is accessible at scale.

**Error surfacing determines how fast the loop converges.** When the model's output is wrong, the quality of the failure signal determines whether the next iteration is a targeted fix or a random walk. "Test failed" tells the model something went wrong but not what. Expected convergence: four to six iterations on medium-complexity problems \[ESTIMATE, based on the author's observation across production coding loops with pass/fail-only feedback\]. "Test `test_auth_expired_token` failed at line 42: expected 401, got 200; the `check_expiry` function on line 38 returns early before reaching the expiry logic" tells the model exactly what failed, where, and why. Expected convergence: one to two iterations \[ESTIMATE, with full-trace error reporting\].

Each saved iteration costs \$0.75-\$1.50 at frontier model pricing \[ESTIMATE\]. Over a thousand loop runs per month, the difference between vague and precise error surfacing is \$750-\$4,500 in raw compute savings, plus the time value of faster convergence on human-urgent tasks.

**Informed retry converts individual failure into system-level success.** Without retry: if per-attempt success probability is 0.70, then 30% of tasks fail. With informed retry (error feedback changes the model's approach on each subsequent attempt, producing approximately independent outcomes): three attempts yield P(at least one success) = 1 - 0.30³ ≈ 0.97 \[ESTIMATE, assuming approximate independence between informed retries\]. A 30% individual failure rate becomes a 3% system failure rate. The model did not improve. The system became ten times more reliable through a purely architectural change.

The independence assumption deserves scrutiny. For systematic errors where the model fundamentally cannot reason past a limitation regardless of feedback, retries waste budget—which is why stop-condition plateau detection ([Chapter 18](chapter-18.md), *The Stop Problem*) is essential. But for the majority of errors where the model is capable of the correct solution but chose a suboptimal path, informed retry is highly effective.

**Unverified legacy attribution.** **Independent verification catches what self-review structurally cannot.** The same reasoning patterns that produced an error tend to approve that error during self-review—the model cannot escape its own context. Anthropic's outcomes architecture places a separate grader in its own context window, receiving only the artifact and the criteria, not the maker's reasoning chain. The grader evaluates what is actually there rather than what was intended. Results: task success improved by up to 10 points over a standard loop, with +8.4% on documents and +10.1% on presentations [unverified legacy attribution]. The gains were largest on the hardest problems—precisely where self-review is least reliable.

## Model Choice Is a Harness Decision

Conventional wisdom says pick the "best" model. Loop engineering inverts this: the harness determines which model is cost-effective at which step, and the right architecture uses different models at different points in the workflow.

**Unverified legacy attribution.** Spiral, the writing tool by Every, demonstrates this in production. A lead agent on Haiku (fast, cheap) fields user requests and coordinates. Subagents on Opus (slower, more capable) produce drafts. A separate evaluation pass (outcomes) scores each draft against an editorial rubric and user voice preferences stored in memory. Only drafts clearing the quality bar ship to the user [unverified legacy attribution]. The cheap model orchestrates. The expensive model creates. Independent evaluation gates quality. Total cost is lower than using the expensive model everywhere, and quality is higher because each stage uses a model matched to its cognitive requirements.

A code-review cascade illustrates the economics:

| Step | Task | Sufficient Model | Why |
|----|----|----|----|
| Discovery | Find changed files | Haiku | Simple git-diff parsing |
| Triage | Identify risky changes | Sonnet | Moderate reasoning about patterns |
| Deep review | Find subtle logic bugs | Opus | Complex correctness reasoning |
| Verification | Confirm findings are real | Sonnet | Verify claims, not generate new ones |
| Report | Format as PR comments | Haiku | Template filling |

All-Opus cost: approximately \$3-5 per review \[ESTIMATE, based on five steps at 30-50K tokens each at published Opus pricing\]. Cascade cost: approximately \$0.80-\$1.40 \[ESTIMATE\]. The saving: 60-75% of compute with equivalent or better quality—better because cheap models at steps one and five are not distracted by complexity irrelevant to their simple tasks, and the expensive model concentrates its capacity on the one step that genuinely requires frontier reasoning.

## The Harness Quality Hierarchy

The progression from least to most capable, with the marginal improvement at each level:

``` mermaid

flowchart LR
    L1["Level 1<br/>Prompt + Model"] --> L2["Level 2<br/>+ Tools"]
    L2 --> L3["Level 3<br/>+ Error Recovery"]
    L3 --> L4["Level 4<br/>+ Iteration Loop"]
    L4 --> L5["Level 5<br/>+ Skills + Memory"]
    L5 --> L6["Level 6<br/>Full Harness"]
    
    L4 -.->|"Highest-value jump"| L1
```

**Level 1: Prompt + Model.** Single-pass generation without tools or verification. The baseline.

**Level 2: + Tools.** The model calls tools to ground responses in real data. One interaction, human evaluates. Marginal gain: responses based on actual data rather than training knowledge alone.

**Level 3: + Error Recovery.** When tool calls fail, the harness feeds errors back for retry. Minimal loop—one round of execute, observe, adjust. Marginal gain: the system recovers from tool errors without human intervention.

**Level 4: + Iteration Loop.** Full verified loop: plan, execute, verify against explicit criteria, iterate until criteria met or budget exhausted. The Loop Contract ([Chapter 3](chapter-03.md)) applies from this level onward. Marginal gain: the system achieves complex goals requiring multiple self-corrections.

**Level 5: + Skills + Memory.** Project context loads automatically so the model starts warm. Past outcomes inform future runs so mistakes are not repeated. The original edition’s named-company sixfold figure is not established by the supplied sources and is not used here as evidence. Marginal gain: no wasted budget on orientation, no repeated known-bad approaches.

**Level 6: Full Harness.** Iteration, skills, memory, subagents (maker-checker), and automation (triggered without human initiation). Marginal gain: handles problems exceeding single-context capacity, provides independent verification, operates continuously.

The highest-return jump is Level 1 to Level 4. Adding verified iteration captures the majority of the total reliability improvement the full progression provides. Everything above Level 4 refines efficiency and handles harder problems but requires Level 4's iteration infrastructure as a foundation.

## The Compounding Advantage

Prompt improvements produce linear returns: each helps one task type by a fixed amount. Harness improvements compound: each helps every subsequent run of every loop using that infrastructure.

Consider cumulative effect over 200 monthly runs—a moderate volume for a team of ten using AI loops several times daily.

Adding test-based verification eliminates human review on passing runs. Before: a human reads and evaluates each output, 5-15 minutes per task, totaling 17-50 hours per month across the team. After: automatic verification handles the majority, surfacing only genuine failures for human attention. The human reviewer's time concentrates on cases that actually require judgment.

Adding skills saves 30,000-50,000 tokens per run of redundant orientation \[ESTIMATE\]—the model stops spending its first iterations rediscovering project architecture and conventions. Across 200 runs: 6-10 million tokens saved, roughly \$50-150 per month at Sonnet-class pricing \[ESTIMATE\]. These are tokens that produced no value and consumed budget that could have been spent on productive task execution rather than orientation.

Adding source-linked memory may reduce repeated mistakes. Measure that effect against a no-memory baseline; neither a universal ceiling nor unchanged model and prompt conditions are established by the inherited company attribution.

**Unverified legacy claim, not source-checked evidence.** Adding maker-checker verification catches defects before shipping. The outcomes architecture demonstrates a 10-point task success improvement [unverified legacy attribution] from a single additional verification call.

These improvements may interact, help, or conflict; their combined effect must be measured rather than assumed multiplicative. Applied together across hundreds of runs, they transform the system's economics from "AI assistant saving a few minutes per task" to "autonomous system shipping verified work at a fraction of the cost of fully manual production."

## Why Teams Underinvest

Three forces drive teams to spend disproportionate effort on prompts over harness.

Fast feedback loops win attention. You change a prompt, rerun, and see the effect in seconds. Harness infrastructure requires days of engineering before payoff manifests across many subsequent runs. Human attention gravitates toward immediate feedback even when slow-feedback investments produce more total value. This is not irrationality—it is a well-understood cognitive bias toward immediacy.

Prompts feel like "the real work." In a culture that equates AI engineering with prompt engineering, building retrieval pipelines, test integration, and verification architectures feels like plumbing. But the plumbing compounds. This mirrors the pre-DevOps era's underinvestment in CI/CD: everyone knew testing was valuable; building test infrastructure felt like a detour from "real coding." It took a decade for the industry to internalize that the infrastructure was the product.

Model providers incentivize prompt-centric thinking. "Our new model is smarter" is a simpler pitch than "build better infrastructure around our existing model." Provider documentation focuses on prompt best practices because that is what makes models seem capable in the evaluation period. The antidote: measure cost per verified outcome over time and attribute improvements to their actual cause.

## Building Incrementally

You do not build a Level 6 harness on day one. You build incrementally, adding each layer only when you encounter the specific limitation it resolves—and not before. Premature complexity is itself a failure mode: each layer you add before understanding why you need it is a layer you will spend time debugging without knowing what correct behavior looks like.

Week one: iteration loop. Model plus tools plus run-tests-on-output. If tests fail, feed the error message back as context and retry up to a budget limit. This single addition—connecting generation to an existing verification mechanism—captures the majority of harness value. Most codebases already have test suites, linters, and type checkers. Wiring them into the generation loop costs hours of engineering and provides months of automated verification at zero marginal human cost per run. If you only ever build one harness improvement, build this one.

Week two: skills. Load project context—architecture, conventions, technology choices, known anti-patterns, build commands—into every loop invocation so the model begins productive work immediately. Without skills, each run begins with the model spending tokens rediscovering that your project uses TypeScript strict mode, pytest for testing, and has specific rules about import ordering. With skills, these facts are stated once and loaded automatically. The token savings are modest per run (perhaps 30,000-50,000 tokens of avoided exploration) but they accumulate across every run the loop ever makes.

Week three: memory. Record what the loop learned across invocations: which approaches worked for which problem types, which common errors have known solutions, what corrections humans made that should apply going forward. Without memory, the loop repeats mistakes that were already corrected in previous sessions. With memory, it accumulates operational wisdom. Estimate the gain from recurring failures in your own workload; a claimed company outcome does not establish a transferable ceiling or causal mechanism.

Week four: maker-checker. Introduce a separate verification agent that evaluates the primary agent's output in a fresh, independent context. The checker receives only the output artifact and the acceptance criteria—not the reasoning chain, not the intermediate work, not the plan that led to the output. It evaluates what exists, not what was intended. This architectural separation catches errors that self-review structurally cannot because the maker cannot evaluate its own work independently of the reasoning that produced it.

Month two: automation. Trigger loops on events (PR opened against main, ticket moved to Ready, schedule fires at 9am, error rate exceeds threshold) so the loop operates as a persistent capability of the system rather than a tool someone must remember to invoke. Automation removes the human from the trigger position—the last place where a human was required in the loop.

Month three: fleet orchestration. Multiple specialist agents, each with focused context and tool sets, coordinated by a lead agent that decomposes goals and aggregates results. Only add this when you have evidence that single-agent loops are hitting context limits or producing degraded quality because too many concerns compete for attention in one window. Fleet architecture is powerful but expensive in both compute and maintenance; validate the need before paying the cost.

Each step is independently valuable. Each builds on the foundation of the previous. Each is worth benchmarking with concrete metrics (cost per run, iterations to success, defect rate in shipped output) before and after to verify the improvement was real and worth the maintenance cost it added.

## Implementation Guidance: An Ablation Before a Platform

Use the Clearway story to design an experiment, not to predict an eighteen-point gain. Freeze a representative evaluation set and separate development examples from held-out examples. Record model identifier, prompt revision, tool schemas, retrieval configuration, budgets, and oracle version. A result with different models in the two arms cannot be attributed entirely to the harness.

Start with one concrete failure. If the system cites nonexistent rule identifiers, add an identifier-membership check and measure that defect class before and after. Then measure whether rejection causes better corrected answers or simply more retries. If retrieval omits an applicable exception, adding a stronger model judge may not help because neither maker nor checker received the exception. Trace the input that produced the decision before buying more orchestration.

A practical comparison has three arms: the current baseline, the same baseline with one harness change, and a simpler non-agent alternative where feasible. Report absolute correct counts, false approvals, abstentions, latency, and cost including rejected runs. When labels require judgment, state the adjudication process and disagreement rather than presenting the labels as perfect ground truth.

Recovery should target the changed component. If a new retrieval ranker regresses clause coverage, revert that ranker while preserving unaffected parser and test improvements. Keep model and schema revisions pinned long enough to reproduce the failure. A fresh context checker remains useful, but fresh context alone does not remove shared training biases or a shared incorrect rubric.

Exercise acceptance: introduce one deliberately missing rule and one conflicting rule into a controlled fixture. The system must mark missing evidence inconclusive, apply the documented precedence for the conflict, and produce traceable rule IDs. Re-run the same fixtures after reverting the experimental harness feature. This demonstrates the mechanism and rollback path without claiming broad production superiority from a small sample.

## What Breaks

The harness-over-model thesis is strong but not absolute. Three conditions limit its applicability, and honesty about these limits is what separates useful engineering guidance from marketing.

First, a harness cannot compensate for fundamental model incapability. If the task requires reasoning the model cannot perform at any prompt quality or iteration depth—the model succeeds less than 30% of the time and error feedback does not change subsequent approaches because the limitation is in reasoning capacity rather than in approach selection—the harness has nothing to amplify. The harness works in the space between "the model can sometimes get this right" and "the system reliably ships correct output." If the model can never get it right, no amount of retry, verification, or context curation changes that. You need a better model. Ten failed attempts are a diagnostic signal, not proof of model incapability: missing context, wrong permissions, bad tools, or an incorrect oracle can produce the same observation.

Second, harness complexity has diminishing returns and increasing fragility. Each layer—skills, memory, checker, fleet coordination, automation—adds value and simultaneously adds failure surface area. Memory can serve stale or contradicted information, causing technically correct reasoning to produce wrong output because the premises were wrong. Checkers can produce false positives that require human adjudication, partially defeating the purpose of automation. Fleet coordinators can lose track of specialist state during long-running tasks. The rule-conflict resolver that saved Team Beta can itself have bugs in its priority logic. At some point, the marginal reliability improvement from the next harness layer is smaller than the marginal reliability cost of maintaining and debugging it. Knowing when you have reached that point requires operational data. [Chapter 33](chapter-33.md) (*SRE for Agent Fleets*) addresses monitoring and operational complexity at the scale where these diminishing returns become the dominant concern.

Third, harness implementation is domain-specific even though the underlying principles transfer across all domains. A code-generation harness (test-based oracle, git worktrees for isolation, CI-integrated verification, branch-based rollback) does not transfer to document generation (rubric-based oracle, paragraph-level versioning, style compliance checking, editorial workflow integration). The five mechanisms this chapter describes—context curation, tool affordances, error surfacing, retry policy, verification architecture—apply universally to every domain where AI loops operate. The specific engineering implementation of each mechanism for each domain is custom work that requires domain expertise and iterative refinement.

## Key Takeaways

- The harness—context curation, tool affordances, error surfacing, retry policy, verification architecture—dominates model quality in determining system reliability.
- Five mechanisms explain the gap: context quality determines reasoning quality; tool documentation determines action quality; error precision determines convergence speed; informed retry converts failures to successes; independent verification catches structural blind spots.
- The highest-return investment is Level 1 to Level 4: adding verified iteration loops.
- Model choice is a harness decision: cascade cheap models for cheap steps, expensive only where unique reasoning value exists.
- Both harness and prompt changes can have interacting effects; compare on held-out cases rather than assuming a growth law.
- Build incrementally: loop → skills → memory → checker → automation → fleet.
- Limits: cannot compensate for absent capability; complexity has diminishing returns; implementation is domain-specific.

## The Loop Contract, So Far

**Unverified legacy claim, not source-checked evidence.** This chapter deepens the **oracle** field by demonstrating that independent verification (outcomes architecture) provides a 10-point task success improvement over self-review [unverified legacy attribution]. It introduces **budget** efficiency through model cascading, reducing per-iteration cost by 60-75% without quality loss. And it demonstrates that all five contract fields are harness concerns: the harness specifies goal format, implements the oracle, enforces budget limits, evaluates stop conditions, and executes escalation policy. The Loop Contract and the harness are two views of the same engineering artifact.

## Exercises

1.  **Audit your harness level.** For an AI workflow you operate, determine its current level (1-6). What specific limitation would the next level address? Estimate engineering cost versus expected per-run improvement.

1.  **Measure the context effect.** Run a task with generous context (all potentially relevant material) and with curated context (only the three most directly relevant items). Compare tokens consumed, iterations to success, and output quality. Quantify the cost of irrelevant context.

1.  **Design a cascade.** Map each step of a multi-step workflow to the cheapest sufficient model tier. Calculate total cost under three approaches: all-expensive, your cascade, and all-cheap. What quality do you lose in approach three compared to two?

1.  **Build a minimal checker.** Add an independent verification call that receives only the output artifact and the goal specification—not the maker's reasoning or intermediate work. Over ten tasks, compare defects caught by the independent checker versus the maker's self-review.

## Sources and Evidence Limits

- [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): evaluation design and maintenance, not the fictional Clearway percentages.

The original edition attributed product features and outcome figures to undated or incompletely located vendor material. Those inherited attributions are **unverified in this chapter**; they are not reproduced as a fact-check receipt. The engineering patterns and fictional examples stand separately from those claims. Consult the edition’s source notes for collected references and verify implementation-specific contracts against the version you deploy.

------------------------------------------------------------------------

*Next: Part II opens with [Chapter 5](chapter-05.md)—a sobering counterweight that asks when NOT to build a loop, because not every problem deserves one.*
