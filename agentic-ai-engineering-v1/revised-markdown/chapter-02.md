# Chapter 2: Levels of Agency — The Autonomy Ladder

> **Reading note.** Named practitioner scenarios and their timings, costs, and outcomes are fictional illustrations unless a specific source is identified. Numerical assumptions are not provider quotes or measured results. Code, commands, configuration, and traces are illustrative pseudocode/API sketches, not executed examples. In particular, `loopkit` is a teaching namespace, not a tested installable SDK. Legacy product attributions marked unverified are not evidence for deployment decisions.

> Every system you build occupies a rung on the Autonomy Ladder. Know which rung you need before you start climbing.

## The Over-Engineered Ticket Bot

Rajan Mehta leads a platform team at a logistics company with a support volume of 400 tickets per day. His VP asks for "an AI agent that handles tickets automatically." Rajan, fresh from a conference keynote about multi-agent fleets, designs an ambitious system: a lead orchestrator decomposes each ticket, delegates investigation to specialist agents, aggregates findings, drafts a response, verifies it with a checker agent, and auto-sends.

The system takes his team eight weeks to build. When it launches, it handles roughly twelve tickets per day autonomously. The L4 fleet architecture—five agents, cross-agent coordination, a verification panel—costs approximately \$14 per resolved ticket in compute \[ESTIMATE, based on five Sonnet-class calls of 50-100K tokens each at published pricing\]. The other 388 tickets still require human intervention because the orchestrator misroutes, specialists timeout, or the checker rejects correct responses for stylistic reasons.

Ninety percent of those 400 daily tickets fall into twelve well-defined categories: password resets, shipping status, address changes, return initiations. A rule-based router backed by a single L1 model call filling a response template handles these for under \$0.03 each. Only the remaining 10%—complex multi-issue tickets and genuinely ambiguous cases—benefit from anything more sophisticated than template filling.

Rajan over-climbed the ladder. He built an L4 solution for what was, in aggregate, an L1 problem with an L3 exception path. The cost difference: three orders of magnitude on the common case. The reliability difference was worse: the complex system had more failure modes than the simple one. The Autonomy Ladder exists to prevent this mistake. Before you build, determine which rung the task requires. Then build for that rung—never higher.

## Six Levels of Autonomy

Each level represents a qualitative jump in what the system decides on its own, what can go wrong without human intervention, and what verification machinery you need to trust it. The levels are not a maturity model to aspire toward. They are a design constraint: the right level is the lowest that meets the task's actual requirements.

``` mermaid

graph BT
    L0["L0: Autocomplete<br/>Predicts next token"]
    L1["L1: Tool-Augmented Model<br/>Calls tools on command"]
    L2["L2: Guided Agent<br/>Follows human-designed plan"]
    L3["L3: Autonomous Single Agent<br/>Plans, executes, verifies, iterates"]
    L4["L4: Autonomous Fleet<br/>Orchestrator + specialists"]
    L5["L5: Self-Designing Fleet<br/>Designs own loops and spawns agents"]
    
    L0 --> L1 --> L2 --> L3 --> L4 --> L5
```

**L0: Autocomplete.** The model predicts the next token. No tools, no actions, no persistent state. Nothing external changes when an L0 system operates. Verification is purely the human reading the output and deciding whether to accept it. Direct mutation authority is absent, but text can still disclose sensitive information, mislead a reader, or be consumed automatically downstream. Assess those effects separately.

Even text-only generation can benefit from bounded revision and verification; the ladder describes delegated action and planning, not whether feedback is possible.

**L1: Tool-Augmented Model.** The model can call external tools—search the web, read files, query databases, execute code—but only when directed by a human prompt in a single turn. Each interaction is one cycle: human asks a question or gives an instruction, model responds using tools as needed, human evaluates the complete response before anything further happens. There is no multi-step autonomy. The model does not decide to act on its own results.

This is the standard AI assistant experience of 2024-2025: ChatGPT with code interpreter, Claude with tool use, Copilot answering questions with workspace context. The model acts within the scope of a single request and returns control to the human afterward.

What can go wrong: tool misuse (calling the wrong tool or passing incorrect arguments), acting on hallucinated information from tool results (the model misinterprets what a tool returned), excessive or inefficient tool calls that burn context without adding value.

What verification it requires: human reviews each response before acting on it. The human remains the quality gate. The system cannot take follow-up actions autonomously.

Chapters that serve L1: [Chapter 9](chapter-09.md) (*Tool Design at Scale*), [Chapter 10](chapter-10.md) (*MCP: Wiring the Loop to the World*).

**L2: Guided Agent.** The model executes a multi-step plan that a human designed in advance. It follows the steps sequentially, uses tools as specified at each step, and escalates to the human when it encounters ambiguity, failure, or decisions not covered by the plan. The human defines the path; the model walks it. The model exercises judgment only within the narrow bounds of each step—it does not choose what to do next.

Examples: a CI pipeline where the model performs code review at a specified step (the pipeline structure is human-designed; the model fills in the review content), a data migration where the model transforms records according to a schema (the steps and their order are predetermined), a testing workflow where the model executes a defined test plan and reports results at each checkpoint.

What can go wrong: misinterpretation of plan steps (the model does something subtly different from what the step intended), failure to escalate when stuck (continuing past a step it cannot handle), silent deviation from the plan (skipping or reordering steps without flagging the change), and accumulation of small errors across steps that individually pass checkpoint validation but collectively produce a wrong result.

What verification it requires: automated checkpoints at each step confirming the output matches expectations before proceeding to the next step. Human spot-checks on a sample of runs rather than reviewing every intermediate output. The plan structure provides natural verification boundaries.

Chapters that serve L2: [Chapter 14](chapter-14.md) (*Triggers and Automations*), [Chapter 16](chapter-16.md) (*Planning and Replanning*), [Chapter 17](chapter-17.md) (*Execution and State*).

**L3: Autonomous Single Agent.** The model plans its own approach, executes that plan using tools, verifies its output against acceptance criteria, and iterates until the criteria are met—all without human intervention during the run. This is the full five-stage loop: Discover, Plan, Execute, Verify, Iterate. The model decides what to investigate, what approach to take, when to change course, and when to declare success or failure. The human's role is limited to defining the goal, verification criteria, budget, and escalation policy before the loop starts.

Examples: Claude Code fixing a bug (reads the error, investigates the codebase, writes a fix, runs tests, iterates until tests pass), a research agent that searches multiple sources, synthesizes findings, checks claims against primary documents, and stops when confidence thresholds are met.

What can go wrong: infinite loops (the agent never reaches a satisfying state), budget exhaustion on unsolvable problems, goal misinterpretation (correctly solving the wrong problem), reward hacking (finding ways to pass verification without achieving intent), scope drift (gradually expanding beyond the original task).

What verification it requires: hard budget ceilings (tokens, time, cost, iterations), stop conditions (oscillation and plateau detection), oracle quality sufficient to discriminate good from bad output, and post-hoc audit on a sample of "passed" results to verify oracle reliability.

Chapters that serve L3: Part III (*Building the Loop*—goal specification, planning, execution, the stop problem), Part IV (*Verification*—oracle hierarchy, maker-checker, evals), Part VI (*Economics*—budget enforcement, cost engineering).

**L4: Autonomous Fleet.** An orchestrator agent decomposes a complex goal into sub-tasks and delegates them to specialist agents. Each specialist is itself an L3 loop with its own model, prompt, tools, and verification criteria. The orchestrator coordinates completion, aggregates results, handles dependencies between specialists, and resolves conflicts. Specialists may exchange artifacts through isolated workspaces, messages, or a shared store; no particular coordination substrate is required by this level.

Illustrative examples: parallel analysis of independent build logs to identify recurring patterns, a security audit fleet with reconnaissance specialists and exploitation-verification specialists, a content pipeline with research agents, writing agents, and fact-checking agents working concurrently.

What can go wrong: everything from L3 at each specialist level, plus coordination failures (orchestrator loses track of specialist states), context contamination between agents that should reason independently, cascading errors (one specialist's wrong output becomes input to another), resource starvation (one specialist consumes the fleet's entire budget), deadlock (specialists waiting on each other).

What verification it requires: all L3 verification for each individual specialist, plus inter-agent consistency checks, budget allocation monitoring, topology-level health metrics (is the fleet making collective progress?), and orchestrator-level verification that the decomposition was sound.

Chapters that serve L4: Part V (*Fleets*—[Chapter 24](chapter-24.md) *From Loop to Fleet*, [Chapter 25](chapter-25.md) *Topologies*), [Chapter 29](chapter-29.md) (*Observability*).

**L5: Self-Designing Fleet.** The system designs its own loops, decides what specialists to spawn, writes its own skills, curates its own memory, evolves its verification criteria, and refines its own architecture across runs. The human defines the meta-goal and constraints; the system designs everything else.

What can go wrong: everything from L4, plus specification gaming (optimizing for the metric rather than the intent—for example, achieving "80% test coverage" by writing trivial assertions), loss of interpretability (design decisions become opaque), emergent misalignment (evolved objectives diverge from specified ones), inability to audit the system's reasoning about its own architecture.

What verification it requires: all L4 requirements, plus meta-level audits of the system's self-designed verification criteria, human-interpretable explanations of design decisions, periodic review to detect criteria drift.

Chapters that serve L5: [Chapter 38](chapter-38.md) (*Self-Designing Loops*). This is frontier territory for most teams in 2026.

## The Ladder as Navigation Device

The levels serve a practical purpose beyond taxonomy: they tell you where to focus your reading in this book based on what you are building right now.

Building your first autonomous loop—moving from human-reviewed AI output to a system that verifies its own work? You are climbing from L1 to L3. Focus on Parts II and III, which cover the substrate (context, tools, skills, memory) and the mechanics of building a loop that verifies and stops correctly.

Already have loops running but they cost too much or ship defects? You are optimizing at L3. Focus on Part IV (build better oracles to catch what your current verification misses) and Part VI (control costs through cascading and budget discipline).

Single-agent loops reliable but the task exceeds one agent's context? You are climbing from L3 to L4. Focus on Part V, paying attention to how fleet coordination introduces failure modes that solo loops never encounter.

The planning principle: before building, ask "what level does this task actually require?" Build for exactly that level. The most common engineering mistake in agentic AI is not building too low—it is building too high. A guided agent with clear checkpoints is cheaper, more reliable, and far easier to debug than a fleet for the majority of tasks teams attempt to automate.

## Cost and Authority Are Separate Axes

Higher autonomy can introduce more opportunities to spend and more difficult verification, but it does not imply a universal tenfold token multiplier. A short autonomous task can cost less than a long human-guided session. A large fleet can have read-only access, while one tool call can delete important data. Measure computation and authority independently.

| Dimension | Question to record | Example constraint |
|---|---|---|
| Planning | Who chooses the next step? | Agent may investigate; human approves the repair scope |
| Mutation | What state may change? | Draft branch only; no production credentials |
| Duration | How long may work continue? | Shared deadline and cumulative budget |
| Delegation | Can work or permission be delegated? | Two named read-only specialists, no further delegation |
| Release | Who makes the result externally effective? | Existing merge policy, not an agent verdict |
| Recovery | What happens after uncertainty? | Stop mutation and reconcile the existing operation |

Estimate cost from actual input, cached input, output, tool execution, retries, and human escalation. Compare cost per acceptable outcome and defect escape rates, rather than assigning a price to the rung itself. The lowest adequate autonomy is a useful preference because it simplifies accountability, not because every upward move obeys a fixed economic law.

## Selecting Autonomy Through Evidence

Do not start by deciding to “graduate” the whole application. Select the authority for one task class, then keep its exceptions explicit. A shipping-status lookup may be automated while address changes require identity verification and refunds require a separate approval. One conversation can cross all three boundaries without needing one global autonomy label.

First, characterize the decision. Is the sequence stable, or does the system genuinely need to choose its next step from observations? If a deterministic workflow can express the branches, use it. If the task needs adaptive investigation, permit investigation while keeping consequential mutation separately gated. Planning freedom and action permission should never be granted as an inseparable package.

Second, identify the worst credible failure and the strength of the available evidence. A checker’s apparent accuracy on common tickets says little about rare account-confusion errors. Include failure modes by consequence and input class: wrong tenant, missing records, contradictory user statements, stale policy, revoked permission, unavailable service, and malicious text in a retrieved document. Label unresolved cases inconclusive rather than forcing a binary classification.

Third, compare the proposed system with a simpler baseline on the same cases. Record accepted outputs, escaped defects, unnecessary escalations, cost, latency, and human recovery effort. Keep calibration and held-out examples separate. A fifty-case pilot can reveal obvious failure modes; it cannot demonstrate the absence of rare harms. Choose sample sizes and confidence bounds appropriate to the decision rather than adopting the original edition’s universal 95% detection threshold.

Fourth, define promotion and demotion conditions before the pilot. For example, allow automatic draft creation only if every candidate is tenant-bound, all mandatory structural checks run, and uncertain cases remain drafts. Keep sending disabled until the organization accepts measured residual risk. Demote to read-only when a connector’s authorization behavior changes, a checker becomes unavailable, or a new input class invalidates the evaluation.

Finally, test the refusal path. A system that succeeds on a supported ticket but improvises on an unsupported one has not demonstrated bounded autonomy. The acceptance check should include a task it must not perform, an expired approval, and a dependency outage. Passing means it preserves useful analysis while withholding the unauthorized action. [Chapter 26](chapter-26.md) explores the human role; [Chapter 39](chapter-39.md) explains why canceling future work does not erase already transmitted operations.

## A Worked Autonomy Decision for the Ticket Bot

Return to Rajan’s fictional queue. “Handle tickets” is too broad to authorize. Decompose it into reading the ticket, retrieving account data, composing a draft, changing account state, and communicating externally. The first three can often be piloted without allowing the last two. The original cost figures are assumptions for the example, not evidence that a particular vendor model costs that amount.

For shipping status, a fixed workflow authenticates the requester, obtains one order’s status, and fills a template. For an ambiguous missing shipment, a guided agent may inspect the permitted order history and propose an explanation. For an address change, the application independently checks the verified identity, shipment phase, and allowed destination fields. A language model does not get to infer that the customer “probably meant” a different account.

Suppose the order service times out after accepting an address change. An autonomous investigator may inspect the operation receipt, but a second mutation is not a harmless continuation. The workflow must preserve the logical operation identity and reconcile its outcome. If the service offers no safe lookup or deduplication mechanism, this task class needs an operator path regardless of how accurate the drafting model is.

For the level-audit exercise, submit a table of these operations and their separate planning, data, mutation, delegation, and release permissions. Acceptance requires a named owner for every irreversible action, a tested denied case, and an explicit fallback for unavailable verification. A single label such as “L3” is not an acceptable substitute for that table.

## What Breaks

The Autonomy Ladder is a useful simplification, but it obscures two real problems that practitioners encounter immediately in production.

First, systems rarely live at a single level. A realistic deployment might use L1 for its initial data-gathering phase (human-triggered, single-turn tool calls), L3 for its core execution loop (autonomous iteration), and L2 for its final shipping step (human-designed approval workflow). The ladder describes peak autonomy—the highest level any component operates at—not the system's constant state. This means you need verification infrastructure for your highest rung even if most of the system operates lower. Design your oracle, budget, and escalation for your peak.

Second, the graduation criteria assume you can measure oracle quality against ground truth—counting how many real errors the oracle detects out of all real errors that exist. In practice, knowing all real errors requires the very human review you are trying to automate away. This is a bootstrapping problem with no clean solution. The practical response: start with conservative budgets, run automated and human verification in parallel during the transition period, and sample "passed" outputs for human audit even after graduation. Confidence grows over time but is never absolute.

## Key Takeaways

- The Autonomy Ladder: L0 Autocomplete, L1 Tool-Augmented Model, L2 Guided Agent, L3 Autonomous Single Agent, L4 Autonomous Fleet, L5 Self-Designing Fleet.
- Each level multiplies what the system decides, what can go wrong, and what verification it requires.
- The most common mistake is over-engineering: deploying L4 fleet architecture for tasks an L1 or L2 system handles at a fraction of the cost.
- Cost and blast radius depend on workload and permission scope, not a universal multiplier per level.
- Increase authority only for a defined task class after comparing with a simpler baseline and specifying demotion triggers.
- Real systems span multiple levels; design verification for peak autonomy.
- The bootstrapping problem makes graduation criteria imperfect—start conservative and build confidence through parallel validation.

## Exercises

1.  **Level your current systems.** List three AI-assisted workflows you use or maintain. For each, determine its current Autonomy Ladder level and the level the task actually requires. Is any over-engineered by more than one level?

1.  **Estimate the cost delta.** For one over-engineered system, estimate what it would cost to operate at one level lower. What capability would you lose? Would users notice the quality difference?

1.  **Draft graduation criteria.** For a system you operate at L2, write specific, measurable criteria that would justify graduating to L3. What oracle would you need to build? Select the acceptable escaped-defect threshold prospectively from the task’s consequence and risk tolerance. What sample and confidence bound support that particular decision, and which rare failures remain unmeasured?

## Sources and Evidence Limits

- [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): calibration and complementary production evidence. The autonomy ladder is this book’s heuristic, not a formal industry certification.

The original edition attributed product features and outcome figures to undated or incompletely located vendor material. Those inherited attributions are **unverified in this chapter**; they are not reproduced as a fact-check receipt. The engineering patterns and fictional examples stand separately from those claims. Consult the edition’s source notes for collected references and verify implementation-specific contracts against the version you deploy.

------------------------------------------------------------------------

*Next: [Chapter 3](chapter-03.md) dissects the anatomy of a loop—the five stages, six building blocks, and the Loop Contract that every subsequent chapter references.*
