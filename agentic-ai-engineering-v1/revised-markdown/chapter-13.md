# Chapter 13: Choosing Your Primitive

> **Reading note.** Named practitioner scenarios and their timings, costs, and outcomes are fictional illustrations unless a specific source is identified. Numerical assumptions are not provider quotes or measured results. Code, commands, configuration, and traces are illustrative pseudocode/API sketches, not executed examples. In particular, `loopkit` is a teaching namespace, not a tested installable SDK. Legacy product attributions marked unverified are not evidence for deployment decisions.

> Prefer the cheapest primitive that solves the problem reliably.

## One Loop, Six Decisions

Rani Chakravarti is building a post-deploy monitoring loop for her company's staging environment. The loop's contract: when a new deployment lands, gather health metrics, assess whether any regressions occurred, generate a human-readable summary, and either approve the deployment for production promotion or flag it for human review. The budget constrains her: 5 minutes wall-clock maximum and \$0.15 cost ceiling per run. Both are hard limits—exceed either and the loop fails its contract.

Rani sketches the loop's steps on her whiteboard. Seven operations, each needing something done. She has six primitives available: raw code in the harness, a prompt to the model, a tool the model calls, an MCP server providing a shared integration, a skill document loaded into context, or a subagent running in its own context window. Each has a different cost profile, failure mode, latency characteristic, and reliability envelope. Choosing wrong at any step means either burning budget on an expensive primitive where a cheap one suffices, or watching the loop fail because a cheap primitive cannot handle the complexity of real-world input.

Walking through her seven steps reveals the framework in practice.

**Step 1: Detect that a deploy occurred.** A webhook fires when the deployment pipeline completes, delivering a JSON payload with service name, commit SHA, timestamp, and deployer identity. Parsing this payload is deterministic logic: extract four fields from a known schema, validate their types, store them in a structured object. There is zero ambiguity. A competent programmer could write this as a five-line function. Rani implements it in code. Cost: zero tokens, sub-millisecond execution. Had she used a prompt for this—sending the JSON to the model and asking it to extract the fields—she would have spent 200+ input tokens (the payload) plus 100+ output tokens (the model's response), waited 3–5 seconds for inference, and introduced the possibility of hallucination on a task that has exactly one correct answer. Code is usually the simplest reliable primitive for defined operations on structured data; its parsing and validation logic still needs tests.

**Step 2: Gather health metrics from Grafana.** The loop needs error rates, latency percentiles, and request counts from the post-deploy window, compared against a one-hour baseline before the deploy. This requires querying an external system with authentication, pagination, and query-language syntax. Rani's team runs a shared Grafana MCP server that three other loops also use (a canary-analysis loop, a cost-monitoring loop, and the on-call assistant). The server handles OAuth token refresh, PromQL query construction, and rate limiting centrally. An MCP server is the right choice here because the integration is shared infrastructure with complex authentication that would be expensive and error-prone to reimplement in each loop. A direct tool function would work technically but would duplicate sixty lines of auth and query logic that would need updating when Grafana's API changes—and that would need updating in three other places simultaneously. The MCP cost is measurable: roughly 150ms of latency per call and ~3,000 tokens of schema for the three exposed Grafana tools \[ESTIMATE\]. But the maintenance benefit of a single implementation for shared infrastructure justifies that overhead.

**Step 3: Compare metrics against threshold.** The model now has two data sets: baseline metrics and post-deploy metrics. It needs to compute percentage changes for each metric and flag any that exceed configured thresholds: error rate increase \>0.5 percentage points, p99 latency increase \>20%, request rate decrease \>10%. This is arithmetic and threshold comparison. There is no ambiguity in the computation—it is addition, subtraction, division, and a comparison against constants. Rani writes it as a function: twelve lines of Python that return a structured dictionary of metric deltas with pass/fail for each. No model call needed. Using the model for numerical comparison introduces unnecessary non-determinism (models occasionally make arithmetic errors) and spends tokens on something the CPU does for free in microseconds.

**Step 4: Assess whether borderline regressions are meaningful.** Here the problem changes character. The metrics show p99 latency increased by 18%. That is below the 20% hard threshold—technically passing. But Rani's engineers know context the threshold cannot capture: this is the third consecutive deploy with a latency increase. The cumulative drift over three deploys is now 42%. Each individual deploy "passes," but the trend signals a problem. Deterministic code can compute temporal trends, cumulative drift, and statistical alarms. The ambiguous part is interpreting incomplete contextual evidence or deciding which unmodeled explanation deserves investigation, not the arithmetic itself.

This step requires reasoning about ambiguous, context-dependent information—the model's core value proposition. Rani uses a prompt: the model receives the current metrics, the threshold results from Step 3, the trend from recent deploys (loaded from the loop's memory), and the project's SLO context (loaded from a skill). The model reasons about whether the combination of factors—individually passing but collectively concerning—represents a meaningful regression that should block production promotion. Cost: approximately 1,500 input tokens (metrics + history + skill) and 200 output tokens (assessment + reasoning), 3–5 seconds of inference. The model is doing exactly what models do best: making judgment calls under ambiguity.

**Step 5: Load SLO context for the assessment.** The model in Step 4 needs to know what this team considers acceptable: their SLO targets, their latency budgets per endpoint tier, their tolerance for post-deploy variance (wider for experimental services, tighter for payment paths). This knowledge is stable (renegotiated quarterly), needed on every monitoring run, and completely non-derivable from the metrics themselves. This is a skill: a 1,200-token document loaded into context before the model reasons in Step 4. Without it, the model applies generic heuristics ("a 20% threshold is standard"). With it, the model applies this team's specific standards ("payment endpoints have a 5% latency-increase ceiling; experimental endpoints tolerate 30%"). The skill costs 1,200 tokens per turn for the duration it is loaded, but eliminates a common failure mode: flagging acceptable changes in experimental services while missing critical regressions in payment-path latency.

**Step 6: Generate a Slack summary.** The loop must post a human-readable summary to the deploy channel: what was deployed, what the metrics show, and what the recommendation is (approve / flag for review). A template can generate a clear summary from structured data; use a model only when variable emphasis or synthesis adds demonstrated value. But it does not need a subagent. The current model already has all necessary context: the metrics, the assessment from Step 4, the skill context. Rani adds a prompt continuation: "Write a deploy summary for the Slack channel." Cost depends on the API’s submitted context and caching, not merely the new instruction; include the retained input context plus perhaps 300 output tokens for the formatted message. A subagent—spinning up a separate context window, re-providing the metrics and assessment, paying full inference cost for a task the current model handles in one continuation—would cost ten to fifty times more for no quality improvement.

**Step 7: Post and update systems.** The loop sends the Slack message and updates the deployment system's promotion status. The Slack send goes through the shared Slack MCP server (used by six other loops, complex webhook auth). The deploy-status update is a single authenticated PATCH to an internal API that only this loop calls. Rani implements the deploy-status update as a direct tool function in the harness: one HTTP call, simple API-key auth, no shared consumers, no maintenance concern. Using an MCP server for this would add latency, process management, and protocol overhead for an integration that serves exactly one client and is unlikely to change. The asymmetry is deliberate: shared integrations warrant the MCP overhead; single-use integrations do not.

## The Governing Rule

Across Rani's seven steps, a pattern emerges. At each decision point, she chose the cheapest primitive that produced a reliable result. Code for deterministic operations (Steps 1, 3). A shared MCP server for complex, multi-consumer integrations (Steps 2, 7a). A skill for stable contextual knowledge (Step 5). A prompt for reasoning under ambiguity (Steps 4, 6). A direct tool for simple, single-use external calls (Step 7b). Never a subagent—nothing in this loop required context isolation or parallelism.

Reduced to a decision procedure, her reasoning at each step looked like this:

``` mermaid

flowchart TD
    Q1{Exactly one<br/>correct answer?} -- yes --> CODE[Code<br/>~0 tokens, sub-ms]
    Q1 -- no --> Q2{Needs to touch<br/>the outside world?}
    Q2 -- no --> Q3{Stable knowledge<br/>needed every run?}
    Q3 -- yes --> SKILL[Skill<br/>loaded context]
    Q3 -- no --> PROMPT[Prompt<br/>reasoning in context]
    Q2 -- yes --> Q4{Shared across loops,<br/>or complex auth?}
    Q4 -- yes --> MCP[MCP server]
    Q4 -- no --> TOOL[Direct tool]
    PROMPT --> Q5{Must be judged free of<br/>the maker's reasoning,<br/>or run in parallel?}
    Q5 -- yes --> SUB[Subagent<br/>fresh context window]
    Q5 -- no --> STAY[Stay in<br/>current context]
```

Note that the subagent branch hangs off a single question, and it is not "is this hard?" It is whether the step needs a context window uncontaminated by the maker's reasoning, or genuine parallelism. Difficulty alone never justifies a subagent.

The governing rule is not "always use the cheapest primitive." It is "prefer the cheapest primitive that solves the problem reliably for this specific step." Reliability is the constraint that prevents degenerate cost optimisation. You could implement the ambiguous-assessment step (Step 4) in code—write enough heuristics, trend-detection logic, and special-case handlers. But that code would be brittle (breaking on edge cases the heuristics did not anticipate), expensive to maintain (dozens of conditional branches), and unable to handle truly novel situations (a new kind of regression that the heuristic tree never accounted for). Whether the model is more reliable across real inputs is an empirical question; unfamiliar date formats may be better handled by a proven parser or explicit rejection than by an ambiguous model guess. The cheapest primitive that works reliably is not always the cheapest primitive.

The reverse error is equally common and equally expensive. Teams use model calls for tasks that code handles perfectly—parsing JSON, computing averages, comparing strings, validating schemas—because "the model can handle anything." It can. But at 1,000x the latency and 10,000x the cost of a deterministic function, using it for operations that have exactly one correct answer is an extravagance that compounds across iterations. In a loop running ten iterations with two model calls each, a single deterministic step incorrectly routed through the model costs twenty unnecessary inference passes over that step's token burden.

## The Reference Table

One table captures the cost geometry of each primitive. Use it for estimation, not as gospel—real costs vary by implementation, provider, and workload.

| Primitive | Context Cost (tokens/turn) | Execution Cost | Typical Latency | Primary Failure Mode |
|----|----|----|----|----|
| Code | 0 | CPU only | \<1ms | Logic bugs (deterministic, testable) |
| Prompt | N (instruction + context) | Inference: \$3–15/MTok | 2–30s | Hallucination, inconsistency |
| Tool (direct) | 800–1,500 (schema) | Varies by operation | 10ms–10s | API errors, timeouts, schema drift |
| MCP Server | 800–1,500 per exposed tool | RPC + execution | 50–500ms + operation | Protocol errors, auth expiry, latency creep |
| Skill | 1,500–8,000 (loaded text) | 0 (pre-loaded context) | 0 (already in context) | Staleness, irrelevance, false confidence |
| Subagent | Full context window | Full inference per agent | 10–120s | Coordination overhead, context divergence |

\[ESTIMATE: Token costs derived from observed schema sizes in production deployments. Pricing from published Anthropic rate cards as of early 2026. Latency ranges from observed MCP stdio/HTTP implementations and inference times for Sonnet-class models on typical workloads.\]

The table reveals why primitive ordering matters. Code is free and instant. A subagent costs a full context window reloaded and a full inference pass—potentially \$0.05–\$0.15 per invocation. Between these extremes, the primitives form a cost ladder. Each rung up buys capability (handling ambiguity, accessing external systems, providing context isolation) and pays in tokens, latency, or both. The art of loop design is staying as low on the ladder as each step's requirements permit.

## When to Escalate: The Failure Signals

The framework tells you where to start: cheapest primitive that works. But how do you know when it does not work—when you need to escalate to a more expensive option?

**Code fails when input variance exceeds the heuristic envelope.** If your parsing function handles three date formats but production data contains twelve, the function crashes or silently misparses. The signal: increasing error rates on the step despite no code changes. First evaluate a supported parser, explicit format detection, or rejection of ambiguous inputs. A model may propose a normalized interpretation, but ambiguous dates need independent validation rather than automatic promotion from guess to fact.

**A direct tool fails when shared concerns dominate.** Three loops each implementing their own GitHub auth independently hit a rate-limit issue simultaneously—and each needs a different fix because each has a slightly different retry implementation. The signal: duplicated bugs across loops sharing an integration. The fix: consolidate into an MCP server that handles the shared concern once.

**A prompt fails when context isolation is required.** The model that wrote the code evaluates its own code as "correct"—it is primed toward approval by the reasoning that generated the code in the first place ([Chapter 21](chapter-21.md), *Maker-Checker: The Grader Must Not Share the Maker's Context*). The signal: the model consistently approves its own output that humans reject. The fix: escalate verification to a subagent with its own context that never saw the generation reasoning.

**A skill fails when its knowledge is volatile.** Loading yesterday's error rates into a skill produces stale context before the session begins. The signal: the model makes decisions based on data that was true yesterday but not today. The fix: replace the skill with a tool call that retrieves fresh data at runtime.

Recognising these signals early—before they compound into systematic quality degradation—is a core operational skill for loop engineers. The framework is not a one-time design decision. It is an ongoing calibration: observe, measure, escalate or downgrade as the evidence dictates.

## A Concrete Decision Method: Constraints Before Ranking

The primitives are not mutually exclusive products on a single ladder. A tool may wrap deterministic code, an MCP server may expose that tool, a skill may explain when to use it, and a model may select it. First decide the operation’s required behavior; then choose the implementation and interface independently.

**Step one: define the observable contract.** State inputs, outputs, current authority, allowed effects, freshness requirements, and a success check. For a deployment assessment, the output might be a recommendation with source-linked metrics. Promotion is a separate effect requiring its own approval. If these are combined into one vague “assess and act” step, no cost comparison will repair the missing boundary.

**Step two: eliminate candidates that cannot meet hard constraints.** A prompt-only design cannot enforce a spending ceiling or authenticate a webhook. A local skill is inappropriate as the source of live error rates. An unscoped shared connector cannot safely access multiple customer accounts merely because its schema names a tenant. A subagent with the same evidence and rubric is not guaranteed independent in its errors. Hard constraints are gates, not weighted preferences that a cheap candidate can offset.

**Step three: compare the remaining designs on the same fixtures.** Include ordinary, boundary, malformed, unauthorized, stale, and unavailable-dependency cases. Measure correct results, false approvals, inconclusive results, latency, total cost, and operator effort. Keep infrastructure and maintenance costs visible. The best design is the least complex candidate that meets the required behavior, not the one with the smallest isolated model bill.

**Step four: record why the rejected alternative lost.** If a template was inadequate because explanations required combining three conflicting sources, name that limitation. If a subagent did not improve quality, record the comparison rather than treating parallelism as inherently valuable. A short decision record should identify the evidence that would change the choice: higher volume, a new consumer, stricter latency, or a new input class.

**Step five: define downgrade and fallback behavior.** If live metrics are unavailable, the assessment must return inconclusive, not substitute yesterday’s memory. If a model judge is unavailable, do not silently lower the release bar to a schema check. If an MCP server changes its authentication behavior, disable the affected mutations while preserving safe reads if policy permits. Fallback should maintain the required contract or explicitly reduce the output’s status.

This method produces a concrete answer for Rani. Authenticate and deduplicate the webhook in code. Query metrics through the existing reviewed connector. Compute deltas and trends deterministically, including zero-denominator handling and insufficient traffic. Load versioned SLO policy from an authoritative source; a skill may point to it but cannot rewrite its thresholds. Use a model only for bounded synthesis of ambiguous evidence. Generate a template summary when sufficient. Keep production promotion in the existing approval service, with current resource-version checks and durable effect identity.

Now consider a failure. The metrics query returns a partial window because one region is unavailable. A naive model sees a low error count and recommends promotion. The correct recovery begins before inference: the adapter reports region coverage and completeness; deterministic policy prohibits a definitive healthy verdict on insufficient data; the model explains the gap and names the next observation. Switching to a larger model does not recover data that was never supplied.

For the monitoring-loop exercise, the original $0.15 and five-minute bounds are hypothetical constraints to measure, not a promised achievable cost. Use fake connectors and a mutation-disabled promotion service. Acceptance requires correct webhook rejection, deterministic trend calculation, an inconclusive missing-region result, and no promotion from a draft recommendation. Report actual cost and timing if you run a model; otherwise label them unmeasured.

For the primitive audit, submit one row per operation with contract, chosen primitive combination, rejected alternative, evidence, and fallback. The audit passes only if consequential effects have a distinct authority boundary and every fallback preserves the mandatory checks. That is a decision method another engineer can review and reproduce, rather than an intuition that “code is cheap” or “agents handle ambiguity.”

## What Breaks

The framework assumes you can accurately classify each step's requirements at design time. In practice, you often discover that a step you implemented in code actually needs reasoning (because production inputs are more variable than your test cases showed), or that a prompt you wrote handles a deterministic case that code would serve more reliably (because the inputs turned out to be well-structured after all). The first implementation of any loop step is a hypothesis about what primitive is appropriate. The framework tells you which direction to move when reality contradicts the hypothesis.

A subtler tension: over-optimising for cost at the expense of debuggability. Code is cheap and fast, but a 200-line heuristic function with nested conditionals is harder to debug than a prompt whose reasoning the model explains in natural language. When a loop fails and you need to understand why a specific decision was made, a concise decision explanation can help users understand the result, but generated explanations are not proof of the actual cause. Deterministic code can emit rule IDs, input values, and decision traces too. There is a legitimate argument for using a prompt even when code could work, if the step's decision logic must be auditable by non-technical stakeholders—compliance teams, product managers, customers.

## Key Takeaways

- The governing rule: prefer the cheapest primitive that solves the problem reliably. Code before tool, tool before prompt, prompt before subagent.
- Code (zero tokens, deterministic) is correct for parsing, arithmetic, threshold comparison, validation, and any step with exactly one correct answer.
- Tools and MCP servers handle external-system interaction. Choose MCP when the integration is shared across multiple consumers, requires complex auth, has an independent maintenance lifecycle, or benefits from dynamic discovery.
- Skills (pre-loaded context) encode stable project knowledge that eliminates repeated discovery. Their cost is fixed per turn; their value is measured in eliminated iterations.
- Prompts handle reasoning under ambiguity: judgment calls, trend assessment, natural language generation, novel situation interpretation. This is the model's core value—use it only where deterministic logic cannot reach.
- Subagents provide context isolation and parallelism. Their cost (full context + full inference per agent) is justified only when independence improves quality or parallelism provides meaningful speedup.
- Compose primitives within a step: tool call for data retrieval, code for processing, prompt for assessment, skill for context. Single steps often need multiple primitives in sequence.
- The framework is iterative: build with your best hypothesis, observe results, escalate or downgrade primitives as reliability data accumulates.

## The Loop Contract, So Far

This chapter completes Part II's contribution to the **budget** field: every primitive has a known cost profile (the reference table), and the loop's total budget is the sum of its primitive costs across all iterations. Choosing primitives is choosing the loop's cost structure. It also closes the **escalation path** for the substrate layer: when a cheaper primitive fails reliably, the contract should specify which more-expensive primitive to escalate to, preventing the loop from endlessly retrying at the wrong level of abstraction.

## Exercises

1.  **Primitive audit** (analysis). Take a loop you operate or have access to. For each step in the loop, identify the primitive currently used (code, prompt, tool, MCP, skill, subagent). For each, assess: could a cheaper primitive handle this step reliably? Could a more expensive primitive improve reliability enough to reduce total iterations? Estimate the per-run cost impact of your proposed changes.

1.  **Build the monitoring loop** (build). Implement Rani's seven-step loop from the worked example. Use code for Steps 1 and 3; a stub MCP server for Steps 2 and 7a; a skill file for Step 5; model prompts for Steps 4 and 6; and a direct HTTP call for Step 7b. Instrument each step with token counting and wall-clock timing. Verify the total stays under the \$0.15 and 5-minute budget constraints.

1.  **Escalation experiment** (analysis). Take one step in an existing loop that currently uses code (a heuristic, a parser, a classifier). Replace it with a model prompt. Run both implementations on twenty varied inputs. Compare: correctness rate, latency, and token cost. At what correctness differential does the prompt's additional cost become justified given the loop's iteration dynamics?

## Sources and Evidence Limits

- [MCP Authorization, version 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization): a protocol integration does not substitute for task-specific approval.
- [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): compare observable outcomes and preserve unknowns.

The original edition attributed product features and outcome figures to undated or incompletely located vendor material. Those inherited attributions are **unverified in this chapter**; they are not reproduced as a fact-check receipt. The engineering patterns and fictional examples stand separately from those claims. Consult the edition’s source notes for collected references and verify implementation-specific contracts against the version you deploy.

------------------------------------------------------------------------

*Next: Part III begins. [Chapter 14](chapter-14.md) covers triggers and automations—the heartbeat that makes a loop run without a human pressing a button.*
