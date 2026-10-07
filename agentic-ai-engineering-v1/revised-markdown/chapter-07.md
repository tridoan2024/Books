# Chapter 7: Context Engineering I — The Window Is a Budget

> **Reading note.** Named practitioner scenarios and their timings, costs, and outcomes are fictional illustrations unless a specific source is identified. Numerical assumptions are not provider quotes or measured results. Code, commands, configuration, and traces are illustrative pseudocode/API sketches, not executed examples. In particular, `loopkit` is a teaching namespace, not a tested installable SDK. Legacy product attributions marked unverified are not evidence for deployment decisions.

> You do not have 200,000 tokens of context. You have 200,000 tokens of budget, and most of it is already spent.

## The \$34 Conversation That Produced Nothing

Ravi Okafor's team built a coding loop to handle dependency upgrades across their microservices platform. The loop needed context from multiple sources: the package manifest, the changelog of the new library version, the service's integration tests, the API contracts with downstream consumers, the deployment configuration, and a skill file describing the team's upgrade conventions and known compatibility issues. They wired five MCP servers to give the agent access to everything it might need: GitHub for source code and pull request context (35 tools), Slack for team decisions and escalation (11 tools), Sentry for error patterns in the current version (5 tools), Grafana for performance baselines (5 tools), and Splunk for historical deployment logs (2 tools).

**Unverified legacy attribution.** Before the conversation even started — before Ravi's loop sent its first goal statement, before the model had produced a single token of reasoning — the tool definitions alone consumed approximately 55,000 tokens [unverified legacy attribution]. The system prompt, skill file, and Loop Contract added another 8,000. The first discovery step — reading the package manifest, the relevant changelog entries, and the three most-affected test files — produced 35,000 tokens of tool results. By the time the model was ready to reason about its first actual code change, the context contained 98,000 tokens. Of those, fewer than 12,000 were directly relevant to the decision at hand. The remaining 86,000 tokens were tool schemas the model would never invoke for this task, verbose file contents it had already digested into understanding, and skill-file sections covering scenarios (rollback procedures, multi-service coordination) that did not apply to a single-package upgrade.

The loop iterated. Each iteration added new tool results (file reads, test outputs, search results) without removing stale ones. By iteration four, the context exceeded 180,000 tokens. The model's output quality degraded visibly: it referenced tests from iteration one that it had already fixed in iteration two, it re-read files it had previously analyzed (apparently not attending to its earlier analysis), and it proposed changes that contradicted constraints in its own skill file — constraints that were technically still in context but buried at token position 6,000 under 174,000 tokens of subsequent content.

The loop exhausted its budget at iteration seven without converging. Total cost: \$34 in API fees. The model was not incapable of the task — it had solved similar upgrades in three iterations when the context was clean and focused. It was drowning in its own accumulated context. The 200,000-token window was not a generous allowance. It was a budget that Ravi's system had overspent before the real work began.

This chapter develops the engineering discipline that prevents Ravi's failure: treating context as a budget you allocate deliberately, not a container you fill by default.

## Context as Budget, Not Container

The mental model shift that separates effective loop builders from those who build expensive failures: the context window is a budget you allocate, not a container you fill. Every token in that window has a direct cost (input token pricing multiplied by the number of inferences that see it) and an opportunity cost (it displaces potentially more useful information and dilutes the model's attention across a wider span).

The direct cost is straightforward arithmetic. At approximately \$3 per million input tokens for a Sonnet-class model \[ESTIMATE: approximate list pricing as of early 2026; varies by model, contract, and tier\], a full 200K-token context costs \$0.60 per inference call. A loop that runs ten iterations with a continuously growing context spends \$4–6 on input tokens alone. If 80% of that context is stale information that actively degrades reasoning quality, you are paying \$3–5 per run to make the model worse at its job. The economic argument for context engineering is simply that you are spending money on noise that reduces output quality.

The opportunity cost is subtler and more important for loop reliability. Attention is finite. The transformer architecture distributes computational attention across all tokens in the context, but not uniformly. Research on attention patterns in long-context models demonstrates that information retrieval accuracy degrades as context length increases. The degradation is most severe for information positioned in the middle of long contexts — a pattern researchers call "lost in the middle." Information in the first several thousand tokens (the system prompt, opening instructions) and the last several thousand tokens (the most recent messages) receives disproportionate attention. Information in the middle — between token position 20,000 and token position 150,000 in a long context — receives measurably less attention, and the model is less likely to incorporate it into its reasoning.

The consequence for loop engineering: context management is not an optimization for cost-conscious teams. It is a prerequisite for loop reliability. A model reasoning over noisy, irrelevant context makes worse decisions at every step. Each worse decision reduces the per-step accuracy p in the reliability equation from [Chapter 6](chapter-06.md) (*LLMs as Unreliable Reasoning Engines*). That degraded p compounds across iterations as p^n. A context window stuffed with 80% noise does not merely cost more — it makes the model less accurate, which makes the loop less reliable, which increases the number of iterations needed, which stuffs more noise into the context, which further degrades accuracy. Context rot is a positive feedback loop toward failure.

## The Smallest-High-Signal-Set Principle

The goal of context engineering is to present the model with the smallest set of information that enables correct reasoning about the current step. Not the maximum information. Not everything that might be relevant. Not a comprehensive knowledge base of the entire project. The minimum sufficient signal for this specific decision at this specific moment in the loop.

This principle has three components, and each is load-bearing.

**Smallest** means that less context is better than more, all else being equal. This is counterintuitive for engineers accustomed to "more information is always better" in human decision-making. For humans, additional context rarely hurts — we can skim, prioritize, and ignore. For transformer models operating within a fixed attention budget, additional irrelevant context actively hurts. It dilutes attention, competes with relevant information for representation in the model's computation, and introduces potential misleading signals. The correct default is not "include everything available" but "include nothing, then add only what earns its place by demonstrably improving the decision."

**High-signal** means the information that is in context must be genuinely useful for the current decision. The test is counterfactual: if you removed this piece of context, would the model's output quality measurably degrade? If yes, it earns its place. If no — or if you are uncertain — it is noise and should be excluded or deferred to just-in-time retrieval if needed later. Critically, this test must be applied per-iteration and per-step, not once at loop initialization. Context that was essential in iteration two (the error message from the failing test) may be pure noise by iteration five (the test has been fixed; the error message is now irrelevant history). Static context loading ignores this temporal dimension and guarantees progressive signal degradation.

**Set** means context is a collection whose value depends on composition, not just the individual quality of each piece. Individual documents may be low-value in isolation but essential in combination. The `auth.py` file alone does not explain the authentication bug. But `auth.py` combined with the failing test's assertion message and the stack trace from Sentry makes the root cause obvious in a single inference. Context engineering requires reasoning about what combination enables the decision, not merely which individual documents score highest on a relevance metric.

## Context Rot and Its Mechanics

Context rot is the progressive contamination of the context window with stale information that was once relevant but now serves only as noise. In loops, it is not a possibility but a certainty unless actively prevented. The mechanics are predictable and worth understanding in detail, because prevention requires intervention at the mechanisms, not just at the symptoms.

Each iteration of a loop adds new information to the context: tool results from file reads and searches, the model's own reasoning and planning output, error messages from failed verification, and the feedback from the oracle. In the simplest harness implementation (append-only context management), none of this information is ever removed. The context grows monotonically with each iteration.

The problem is that relevance does not grow monotonically. The plan from iteration one was relevant in iteration one. In iteration three, after two rounds of revision, the original plan is not merely irrelevant — it is misleading, because it describes an approach that has been superseded. If the model attends to the old plan (which it may, especially if the old plan is in a higher-attention position than the current plan), it may produce output that contradicts the revised approach. Similarly, the tool results from iteration two (a file read showing the code before modification) become misleading in iteration four (after the code has been changed). The stale tool result describes a reality that no longer exists.

The compound effect: by iteration six or seven, a majority of the context window contains stale information. The model's decisions are increasingly influenced by outdated context that contradicts the current state of the work. Output quality degrades not because the model got dumber, but because the signal-to-noise ratio in its available information collapsed. This is Ravi's failure mode: not a model capability problem, but a context management problem masquerading as a model capability problem.

Symptoms that indicate context rot has reached damaging levels: the model re-does work it has already done (it does not attend to or trust its own prior results); the model references facts from earlier iterations that are no longer current; the model proposes changes that contradict its own recent decisions (attending to an older decision that conflicts with the newer one); token usage per iteration grows without corresponding improvement in output quality; and the model's confidence decreases (hedging language, asking for confirmation) as the contradictions in its context produce genuine uncertainty about which information to trust.

``` mermaid

flowchart LR
    subgraph I1["Iter 1"]
        S1["Signal: 90%<br/>Noise: 10%"]
    end
    subgraph I3["Iter 3"]
        S3["Signal: 55%<br/>Noise: 45%"]
    end
    subgraph I5["Iter 5"]
        S5["Signal: 30%<br/>Noise: 70%"]
    end
    subgraph I7["Iter 7 (Ravi)"]
        S7["Signal: 10%<br/>Noise: 90%"]
    end
    I1 -->|"stale results accumulate"| I3 -->|"old plans persist"| I5 -->|"contradictions multiply"| I7
```

## Attention Degradation and Positional Strategy

Even within a single inference — a fresh context with no iteration history — attention is not uniform across positions. Models attend most strongly to information near the beginning (system prompt, initial instructions) and near the end (most recent messages, the instruction the model is currently responding to). Information in the middle receives less computational attention and is less likely to be faithfully incorporated into the model's output.

This is not a theoretical concern. Practitioners observe it directly: a constraint stated clearly in the system prompt is reliably followed. The same constraint stated at token position 80,000 in a 150,000-token context is intermittently ignored. The constraint has not become less important — but it has become less attended. The model's behavior is a function of attention allocation, and attention allocation is a function of position.

This creates a positional strategy for loop context that should be treated as engineering infrastructure, not optional optimization:

The system prompt (positions 0 through roughly 5,000 tokens) should contain the Loop Contract's goal and acceptance criteria, invariant constraints that must be respected on every step regardless of iteration count, and the role definition. Treat this placement as a design hypothesis, not an enforcement guarantee; instruction roles and the deployed model’s behavior matter more than a fixed token coordinate.

The early context (5,000 through 15,000 tokens) should contain skill files and stable project knowledge — architectural descriptions, coding conventions, build commands — that applies across all iterations. This zone receives strong attention and is appropriate for information that rarely changes.

The recent context (the last 15,000–30,000 tokens before the model's response) should contain the current state summary, the latest tool results, the most recent oracle feedback, and the specific instruction for the current step. This zone receives strong attention because of recency. It is where the model's active working state belongs.

The middle zone (everything between early context and recent context) is the danger zone. Information placed here is most susceptible to being overlooked. If historical context is retained at all (rather than being compacted or removed), it belongs here — because its reduced attention is acceptable for reference material that may or may not be needed. But critical constraints, current instructions, and active state should never be in this zone.

``` mermaid

graph TD
    subgraph HighAttention1["HIGH ATTENTION: System Prompt (0-5K)"]
        LP[Loop Contract: goal + oracle + budget]
        C[Critical constraints]
        R[Role definition]
    end
    subgraph MedAttention["MEDIUM ATTENTION: Stable Context (5K-15K)"]
        SK[Skill file]
        PK[Project conventions]
    end
    subgraph LowAttention["⚠️ LOW ATTENTION: Middle Zone (15K-150K)"]
        H[Historical iterations]
        OTR[Old tool results]
        OP[Superseded plans]
    end
    subgraph HighAttention2["HIGH ATTENTION: Recent Context (last 15-30K)"]
        CS[Current state summary]
        LTR[Latest tool results]
        OF[Oracle feedback]
        I[Current step instruction]
    end
    HighAttention1 --> MedAttention --> LowAttention --> HighAttention2
```

## Context Quality and the Reliability Equation

[Chapter 6](chapter-06.md) presented p^n as an equal-independent-step illustration, not a universal reliability law for agents. What that chapter left implicit, and this chapter must make explicit, is that p is not a fixed property of the model. It is a function of context quality. The same model, on the same task, achieves different per-step accuracy depending on what information is in its context window and how that information is composed and positioned.

This relationship is the bridge between context engineering and loop reliability. When you improve context quality — by removing noise, surfacing relevant information, positioning constraints in high-attention zones — you are not merely saving money on input tokens. You are raising p, which compounds exponentially over n steps. A small improvement in context quality that raises p from 0.93 to 0.95 seems modest at any single step. Over fifteen steps, it transforms sequence reliability from 0.34 to 0.46 — about a 37.6% relative improvement in that illustrative model. Over twenty steps, from about 0.234 to 0.358—about a 53.0% relative improvement. These are conditional calculations, not measured context benefits.

This means context engineering is not a cost optimization. It is a reliability intervention. The dollar savings from loading fewer tokens are real but secondary. The primary value is that removing genuinely irrelevant context may improve step quality, while over-pruning can remove necessary evidence, and that improvement compounds multiplicatively across the loop's lifetime.

The relationship also explains why context rot is so damaging. As stale information accumulates across iterations, p degrades gradually — perhaps from 0.95 in iteration one (clean context, everything relevant) to 0.91 by iteration six (70% stale content, diluted attention). The loop does not experience a sudden cliff; it experiences a slow slide where each iteration is slightly less likely to succeed than the previous one. The cumulative effect is a loop that converges reliably when the task requires three iterations but fails unpredictably when the task requires seven. The failure appears to be a capability limit of the model. It is actually a context management failure that happens to manifest at higher iteration counts.

This gives context engineering a quantitative hook. If you can measure your loop's per-step accuracy at different context utilization levels (by varying how much pre-loaded content you include), you can estimate the reliability cost of each additional token of noise. That cost is not merely the input token price. It is the compounded effect on sequence reliability — which translates directly into additional iterations needed, additional dollar spend on retries, and increased risk of budget exhaustion and escalation.

## Just-in-Time Retrieval Versus Pre-Loading

Two competing strategies determine how information enters the context window: pre-loading (retrieve everything that might be relevant before reasoning begins) and just-in-time retrieval (let the model decide what it needs and retrieve it on demand during execution). The choice between them is not a matter of preference — it follows directly from the signal-to-noise requirements established above.

Pre-loading — the pattern familiar from Retrieval Augmented Generation (RAG) — works well under specific conditions: when the relevant information set is small, when it is known in advance, and when it is stable across the entire loop execution. If your loop always needs the same three configuration files and a style guide, loading them at initialization is efficient and correct. The pre-loaded context is genuinely relevant on every iteration, and there is no waste.

Pre-loading fails under the conditions typical of agentic loops: when the information the model needs at step 7 depends on what it discovers at step 3, when relevance shifts with each iteration as the task progresses, and when the total potentially-relevant corpus is much larger than what any single step requires. In these cases, pre-loading either loads too little (missing what turns out to be needed, producing under-retrieval errors that manifest as wrong decisions) or loads too much (filling the context budget with information irrelevant to most steps, degrading per-step accuracy through the mechanism described in the previous section). Both failure modes are common in practice, and for complex tasks both may occur simultaneously: the system pre-loads the wrong information while failing to load the right information.

Traditional RAG compounds this problem because retrieval decisions are made before the model's reasoning begins. A vector-similarity search against the user's initial query retrieves documents that match the query's surface semantics. But in an agentic loop, the model's actual information need at step 7 may have nothing to do with the original query. The model has since discovered that the bug is not in the authentication layer (as the query suggested) but in the session serialization path. No pre-retrieval system could have predicted this pivot, because the pivot happened as a result of the model's own reasoning.

Just-in-time retrieval inverts the pattern. The model begins with minimal context: the goal, the current state, and the tools available for retrieval (search, file read, database query). When it needs information to make a decision, it reasons about what would help and retrieves it at that moment. The retrieval is precisely targeted at the current reasoning need, informed by everything the model has learned so far in the loop. After the information has been used and incorporated into a decision, it can be summarized or discarded — it does not persist in context polluting future iterations where it is no longer relevant.

The advantages for agentic loops are substantial. Token cost per iteration is lower (loading only what is needed, not everything that might be needed). Signal-to-noise ratio is higher (every piece of context was selected for a specific purpose by the model's own reasoning). Freshness is natural (information is retrieved at the moment it is needed, so it reflects the current state of the system rather than the state at loop initialization — critical for files the loop has modified). And critically, model-directed retrieval can adapt to the current task, but can also miss evidence that a deterministic dependency expansion or domain index would retrieve, because it has access to its full reasoning state when deciding what to retrieve.

The costs are latency (one additional inference step to decide what to retrieve, plus the tool call latency of the actual retrieval) and the risk of under-retrieval (the model does not know what it does not know, and may not search for information it would benefit from having). The latency cost is usually modest: one tool call adds 1–3 seconds, which is negligible compared to the minutes a complex loop iteration takes. The under-retrieval risk is real but mitigable through good skill files that describe what information sources exist, when to consult them, and what kinds of decisions benefit from external context.

For agentic loops, just-in-time retrieval should be the default pattern. Pre-loading should be reserved for information that meets all three conditions simultaneously: it is guaranteed relevant on every iteration of the loop, it is small enough to fit within its budget allocation without competing with working context for attention, and it cannot be efficiently retrieved on demand (either because the retrieval path is complex or because the model would not know to ask for it without being told). In practice, this means: pre-load the skill file, the Loop Contract, and invariant constraints. Retrieve everything else on demand.

## The Token Overhead Problem

**Unverified legacy attribution.** Ravi's scenario illustrated a specific and common failure mode: the tool definitions themselves consuming a disproportionate fraction of the context budget before the first useful token is generated. This is not a hypothetical concern. Anthropic documented observing tool definitions consuming 134,000 tokens before optimization in real customer deployments [unverified legacy attribution]. At that overhead, a 200K-token window has 66,000 tokens remaining for actual work — a mere third of the nominal capacity.

**Unverified legacy attribution.** The mechanism is straightforward. Each tool exposed through MCP or a function-calling interface requires a name, a natural-language description, and a JSON Schema for its parameters. Well-documented tools with nested object parameters, detailed enumerations, and thorough field descriptions easily reach 300–700 tokens per tool definition. The five-server MCP setup in Ravi's deployment — 58 tools total — consumed roughly 55,000 tokens [unverified legacy attribution]. Adding Jira alone (a single additional server) would add roughly 17,000 tokens [unverified legacy attribution]. A six-server deployment with Jira reaches 72,000+ tokens of tool overhead before the conversation begins.

**Unverified legacy attribution.** This is why Tool Search exists as a production feature. Instead of loading all tool definitions into the system prompt upfront, the model receives a single search tool that can discover relevant tools on demand. The upfront cost drops from 55,000–77,000 tokens to approximately 500 tokens for the Tool Search interface itself. When the model needs a tool, it searches, discovers the 3–5 relevant tools (roughly 3,000 tokens of definitions), and proceeds. Total tool overhead: approximately 3,500 tokens per step versus 55,000+ upfront [unverified legacy attribution].

**Unverified legacy attribution.** Programmatic Tool Calling provides a complementary optimization for data-heavy tasks. Instead of tool results passing through the conversation context (where they consume budget on every subsequent inference), the model writes code that calls tools and processes results within a code-execution sandbox. Only the final processed output — the conclusion, not the raw data — enters the conversation context. This is how Claude for Excel handles spreadsheets of thousands of rows without overloading the context window [unverified legacy attribution]. The raw spreadsheet data never enters context; the model's code reads it, processes it, and returns only the computed result.

The principle underlying both features: never load information "just in case." Tool definitions, reference documents, and raw data should enter context only when actively needed, stay only as long as they are serving the current step, and leave when their purpose has been fulfilled. The context window is a working desk, not a filing cabinet.

## A Worked Context Budget: The Coding Loop

Consider a concrete coding loop: an autonomous agent that takes a bug report, reproduces the bug, identifies the root cause, implements a fix, and verifies the fix passes all tests. The model has a 200K-token context window at Sonnet-class pricing. Here is how a well-engineered budget allocation works:

``` python

from dataclasses import dataclass


@dataclass
class ContextBudget:
    """Allocates a context window across competing demands.

    All values in tokens. Total must not exceed window_size.
    Unused budget remains available for just-in-time retrieval.
    """

    window_size: int
    system_prompt: int          # Loop Contract, role, invariant constraints
    skill_file: int             # Project conventions, build commands, rules
    tool_definitions: int       # Active tools for current step (via Tool Search)
    current_state: int          # Structured summary: what's done, what's next
    working_context: int        # Files, test output, errors for THIS step
    generation_reserve: int     # Tokens reserved for model's response
    safety_margin: int          # Buffer to avoid hard truncation

    @property
    def allocated(self) -> int:
        return (
            self.system_prompt + self.skill_file + self.tool_definitions
            + self.current_state + self.working_context
            + self.generation_reserve + self.safety_margin
        )

    @property
    def available_for_retrieval(self) -> int:
        """Tokens available for just-in-time expansion."""
        return self.window_size - self.allocated

    @property
    def utilization(self) -> float:
        return self.allocated / self.window_size

    def validate(self) -> None:
        if self.allocated > self.window_size:
            overflow = self.allocated - self.window_size
            raise ValueError(
                f"Budget exceeds window by {overflow:,} tokens. "
                f"Reduce working_context or prune tool_definitions."
            )


# A well-tuned coding loop budget
coding_loop = ContextBudget(
    window_size=200_000,
    system_prompt=3_000,        # Goal + oracle spec + constraints
    skill_file=4_000,           # AGENTS.md, build commands, conventions
    tool_definitions=3_500,     # 3-5 tools via Tool Search (not all 58)
    current_state=5_000,        # What's been tried, what's known, what's next
    working_context=40_000,     # Source files + test output for current step
    generation_reserve=15_000,  # Room for model reasoning and output
    safety_margin=5_000,        # Never approach the hard limit
)
# allocated = 75,500 tokens (38% utilization)
# available_for_retrieval = 124,500 tokens (62% reserve)
```

The budget allocates only 75,500 of 200,000 available tokens. The remaining 62% is not wasted — it is held in reserve for just-in-time retrieval as the step demands. If the model discovers it needs to read a large file (15,000 tokens), the budget accommodates that within the reserve. If it needs to search for related tests (8,000 tokens of results), that fits. The reserve ensures the model is never forced to reason without information it needs. But crucially, information enters the context only when requested, stays only for the current step, and is summarized or removed before the next iteration.

Compare this disciplined allocation to Ravi's anti-pattern. His system allocated 55,000 tokens to tool definitions (versus 3,500 with Tool Search — a 94% reduction), pre-loaded 35,000 tokens of file contents before determining which files were relevant (versus loading on demand), and accumulated tool results across all iterations without clearing stale ones. By iteration four, his 200K window was 90% full with less than 10% of the content relevant to the current step. The model's effective reasoning was constrained to 20,000 tokens of signal buried within 180,000 tokens of noise.

The fictional difference motivates a controlled context experiment; context quality alone does not predict an exact iteration count. The model was the same. The task was the same. Only the context engineering differed.

## Measuring Context Quality

Three operational metrics tell you whether your context engineering is working or merely consuming engineering time without improving outcomes.

**Token efficiency** measures the ratio of verified outcomes to dollars spent on input tokens. If context engineering is effective, this ratio improves because you spend fewer tokens per inference (lower cost) while maintaining or improving output quality (higher success rate). Track this metric across runs: a loop with good context engineering should produce verified outcomes at steadily improving token efficiency as you tune the budget allocation. If efficiency is flat despite engineering effort, your changes are not reducing noise as much as you think.

**Attempts-to-pass** — the book's headline health metric — correlates directly with context quality because the model reasons better over clean context. A model that has exactly the right information at each step converges faster than one reasoning over a haystack of irrelevant content searching for the relevant needle. If your average attempts-to-pass increases after you add more pre-loaded context (a common temptation: "if three files help, surely fifteen files help more"), the additional context is hurting, not helping. Attempts-to-pass is the ground-truth measure of whether your context composition serves or hinders the model's reasoning.

**Context relevance ratio** estimates what fraction of the loaded context tokens were actually used in producing the model's output. A rough proxy: after each inference, check whether the model's actions reference, depend on, or cite the context elements you loaded. Elements that are never referenced across multiple iterations — tool definitions never invoked, file contents never mentioned in reasoning, constraints never applied — are wasting budget. Even a rough manual review of ten loop traces (a two-hour investment) can reveal whether your budget allocation is sound or whether large portions of your loaded context serve no purpose.

The goal is not to minimize context unconditionally. Sometimes the model genuinely benefits from seeing more information — a broader view of the codebase helps it make more architecturally consistent decisions. The goal is to maximize the ratio of context that serves a purpose to context that merely occupies space. When in doubt, err toward less: you can always retrieve more if the model asks for it, but you cannot un-attend to noise that has already influenced reasoning.

## Implementation Guidance: Preserve Coverage While Bounding Context

A context budget needs admission rules, not only a token ceiling. For each loaded item, record why it is present, its source revision, its scope, and the decision it supports. Keep policy and current task authority separate from retrieved documents. A short but misleading summary can be worse than a long accurate source; relevance ranking is not a truth ranking.

Reserve space using the actual model and API limits, including output reservation, tool-result expansion, and any provider-specific accounting for reasoning tokens. The example’s 200,000-token window and positional ranges are illustrative, not a claim about every deployed model. Prompt caching can change billed cost without changing which content the model receives; count uncached input, cache writes, cache reads, and output separately when comparing designs.

Use a coverage checklist for high-consequence decisions. Before changing an authentication function, retrieve its callers, relevant tests, and applicable security constraints, not just the top semantically similar file. A bounded search must report what was searched, limits reached, and omitted regions. “No match” after a truncated search is not proof of absence. The model can choose follow-up retrieval, but the host should preserve these coverage flags.

Consider an illustrative failure: the retriever returns the new API documentation but omits a compatibility exception for older clients. The generated change passes the new-schema test and breaks the old client. Recovery is not “load every document.” Add the compatibility dependency to the retrieval contract, include a representative old-client test, and re-run affected checks. Preserve the source locator so later compaction does not convert a scoped exception into a general rule.

Exercise acceptance: compare a preload and a just-in-time configuration on the same cases. Include one required passage placed in an apparently irrelevant file, one stale duplicate, and one oversized result. The system must find or explicitly report the missing prerequisite, prefer current scoped evidence over stale text, and keep truncation visible. Report token use alongside correctness and missed-evidence rates; fewer tokens alone is not success.

## What Breaks

The smallest-high-signal-set principle assumes you can reliably predict which context elements the model needs for a given step. In practice, this prediction is imperfect, and the failure mode of over-pruning can be as costly as the failure mode of over-loading.

The risk is particularly acute for tasks where the reasoning path is non-obvious or non-linear. For a straightforward "run tests, read error, fix bug" loop, you can predict with high confidence which files the model needs: the failing test, the error message, and the source file containing the failing function. For a research task, an architectural decision, or a complex refactoring, the relevant context may include information that appears tangential until the model's reasoning reveals the connection. A comment in a seemingly unrelated file, a historical architecture decision record, a performance constraint mentioned in passing in the project README — these may be critical for a correct decision but impossible to predict as relevant in advance.

Over-pruning these non-obvious connections produces a model that is efficient but occasionally blind: it makes decisions quickly within the narrow context it has been given, without access to the broader information that would reveal those decisions are wrong. The error is invisible in the moment (the model does not know what it does not have) and only manifests later when the decision's consequences collide with the reality the pruned context would have revealed.

The mitigation is empirical and iterative: start with a tight context budget, observe where the model struggles or makes decisions you know are wrong, and selectively expand the budget at those specific points. This requires instrumentation (logging what context was available at each step and what the model did with it) and a willingness to invest in context quality measurement rather than assuming your budget allocation is correct.

Tool Search introduces its own failure mode: if the model's search query does not match a relevant tool's name or description, the tool is never discovered. The model does not know what tools it does not know about. For tools that are critical to correct operation — tools that must always be available regardless of the step — override Tool Search and include them in the base tool set. The overhead of one or two always-loaded tools (1,000–1,500 tokens) is a negligible cost for the insurance that they are never missed.

## Key Takeaways

- The context window is a budget, not a container. Every token has a dollar cost and an attention opportunity cost that compounds across loop iterations.
- Apply the smallest-high-signal-set principle: include only the minimum information that enables correct reasoning on the current step. Evaluate this per-iteration, not once.
- Context rot — the accumulation of stale information from prior iterations — degrades loop reliability by diluting attention and introducing misleading signals. It is inevitable without active management.
- Position effects vary across models and tasks. Test placement, keep current state visible, and enforce critical constraints outside model attention.
- Combine small stable preloads with task-directed retrieval; compare coverage, latency, and outcome quality rather than assuming either strategy always wins.
- Tool definitions are a major source of overhead: 55K–134K tokens in documented real deployments. Tool Search reduces this to ~3.5K–8.7K per step.
- Allocate context deliberately: system prompt, skills, tool definitions, current state, working context, generation reserve, and safety margin. Leave the majority of the window as reserve for just-in-time expansion.
- Measure context quality with token efficiency, attempts-to-pass, and context relevance ratio. If adding context increases attempts-to-pass, it is hurting.

## The Loop Contract, So Far

This chapter adds a new dimension to the **budget** field: the budget is not merely a cap on total token spend or wall-clock time. It must specify how tokens are allocated within each inference — how much goes to stable context versus working context versus reserve. It also reinforces the **goal** field: the goal specification must be concise enough to fit in its system-prompt budget allocation without crowding critical constraints. A verbose goal that consumes 8,000 tokens of the system prompt is a goal that displaces constraints or skills, trading long-term reliability for upfront expressiveness.

## Exercises

1.  **Overhead audit.** If you have an MCP-connected agent or a tool-using system, measure the token count of your tool definitions in the system prompt. Compare this to the total context window. What percentage of your budget is consumed before the conversation starts? If it exceeds 20%, design a Tool Search strategy and estimate the savings.

1.  **Context budget design.** For a loop you operate (or plan to build), create a `ContextBudget` allocation. Justify each line item with reasoning about what that category contains and why it needs that many tokens. Compute the utilization percentage and the reserve available for just-in-time retrieval. Validate that the reserve is sufficient for the largest file or tool result your loop might need to read in a single step.

1.  **Rot measurement.** Instrument an existing loop to log the full context at each iteration. For iterations 5 and beyond, manually sample 20 context elements and classify each as "relevant to the current step" or "stale." If stale exceeds 40%, design a clearing strategy and measure the effect on attempts-to-pass.

1.  **Placement experiment.** Take a task where your loop sometimes ignores a constraint (producing output that violates a rule stated in context). Move that constraint from its current position to (a) the system prompt beginning, and (b) the immediate pre-instruction position (last few thousand tokens). Run ten instances at each position. Document whether position affects compliance rate.

1.  **Budget-versus-quality curve.** For a specific task, run the same loop with working_context allocations of 20K, 40K, 80K, and 120K tokens (by varying how many pre-loaded files you include). Plot attempts-to-pass against working_context size. Identify the inflection point — the budget level beyond which additional context stops helping or begins hurting.

## Sources and Evidence Limits

The original edition attributed product features and outcome figures to undated or incompletely located vendor material. Those inherited attributions are **unverified in this chapter**; they are not reproduced as a fact-check receipt. The engineering patterns and fictional examples stand separately from those claims. Consult the edition’s source notes for collected references and verify implementation-specific contracts against the version you deploy.

------------------------------------------------------------------------

*Next: [Chapter 8](chapter-08.md) addresses what happens when the loop outlives its context window — compaction as lossy checkpoint, automatic clearing, structured handoff notes, and loops whose state lives on disk rather than in the window.*
