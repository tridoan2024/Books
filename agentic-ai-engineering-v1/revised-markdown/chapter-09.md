# Chapter 9: Tool Design at Scale

> **Reading note.** Named practitioner scenarios and their timings, costs, and outcomes are fictional illustrations unless a specific source is identified. Numerical assumptions are not provider quotes or measured results. Code, commands, configuration, and traces are illustrative pseudocode/API sketches, not executed examples. In particular, `loopkit` is a teaching namespace, not a tested installable SDK. Legacy product attributions marked unverified are not evidence for deployment decisions.

> A tool is only as good as its worst error message.

## The \$9,900 Discovery Tax

**Unverified legacy attribution.** Priya Deshmukh is a platform engineer at a logistics company running forty-three MCP servers across their AI fleet. Each server exposes between three and fifteen tools. The agent serving their operations team connects to five of these servers: GitHub (35 tools, roughly 26,000 tokens of schema), Slack (11 tools, roughly 21,000 tokens), Sentry (5 tools, roughly 3,000 tokens), Grafana (5 tools, roughly 3,000 tokens), and Splunk (2 tools, roughly 2,000 tokens). That is 58 tools consuming approximately 55,000 tokens before a single user message enters the context window [unverified legacy attribution].

**Unverified legacy attribution.** Priya notices the problem on a Thursday when a cost spike alert fires. Their Jira connector alone consumes roughly 17,000 tokens of schema per turn [unverified legacy attribution]. A single loop iteration touches two or three tools at most, but the model pays for all fifty-eight on every call. At Sonnet-class pricing, the schema overhead across their fleet costs roughly $9,900 per thirty-day month [illustrative: 55,000 schema tokens × 200 runs/day × 10 calls/run × 30 days × $3/M, without caching]. Worse, the model occasionally selects the wrong tool from the crowded namespace, choosing `search_slack_messages` when it meant `search_code` because both descriptions mention "search." Each misroute wastes an iteration—an inference call that produces a useless result and requires recovery.

Priya's team spends the next two weeks redesigning their tool layer. They consolidate schemas, rewrite descriptions for disambiguation, restructure error messages to include recovery guidance, and implement on-demand tool discovery. Their fleet's attempts-to-pass metric drops from 4.2 to 2.7 iterations on average. The \$9,900 monthly overhead falls below \$3,000. The improvements come not from making the model smarter but from making the tools legible.

This chapter is about why Priya's original problem existed and how to avoid building it into your loops from the start. Tool design is the most underinvested area of loop engineering, and it has the most direct impact on convergence speed and cost per verified outcome. Every principle here applies regardless of which model you use or which framework you build on—tool ergonomics are a universal lever.

## Tool Design Is Context Engineering

Most teams treat tools as implementation details: define a function, expose it to the model, move on. This is a category error. A tool schema is not an API definition for a human developer who can read source code, search documentation, consult Stack Overflow, and ask a colleague. A tool schema is the model's entire understanding of what the tool does, when to use it, how to call it, and how to interpret its results. It is context, and it competes for the same finite budget as the user's goal, the conversation history, the skills, the memories, and every other piece of information the model needs to reason.

The implications of this framing are concrete. When you write a tool description, you are not writing documentation for a junior developer. You are engineering the model's action space. Every word in that description will be read on every turn of every loop that includes the tool. Every ambiguity is a probability distribution over incorrect interpretations. Every missing piece of information is a potential misroute that costs an iteration to recover from.

The tool design decisions you make propagate through every iteration of every loop that uses those tools. A poorly named parameter costs a failed attempt on 5% of calls. Across ten iterations and a hundred daily runs, that is fifty wasted calls per day—fifty inference rounds, fifty wasted response generations, fifty moments where the loop could have been converging but was instead recovering. A good error message that includes a correction suggestion turns a failed call into a single-retry success. A bad error message that says "invalid input" turns it into a three-attempt exploration. These small differences compound into the single largest controllable factor in loop convergence speed.

This compounding effect is what makes tool design the highest-leverage activity in loop engineering after oracle design. You write the tool once. The model reads it thousands of times. Every improvement pays dividends on every future iteration across every loop that touches the tool.

``` mermaid

flowchart TD
    A[Tool Schema Design] --> B[Model Comprehension]
    B --> C{Correct Tool Selected?}
    C -- yes --> D{Correct Arguments?}
    C -- no --> E[Wasted Iteration]
    D -- yes --> F[Successful Execution]
    D -- no --> G[Error Message Quality]
    G --> H{Actionable Error?}
    H -- yes --> I[Single Retry Succeeds]
    H -- no --> J[2-4 Exploratory Retries]
    E --> K[Cost: full inference round]
    J --> K
    I --> L[Cost: 1 extra call only]
    F --> M[Loop Converges]
```

## What Makes a Tool Schema Legible

A model encounters a tool as a JSON object: a name, a description, and a parameter schema. From these three pieces of information alone, it must decide whether this tool is appropriate for its current goal, construct the correct arguments, and anticipate what the response will look like. Every ambiguity in the schema is a potential misroute. Legibility is not about verbose documentation—it is about information density per token, with the right information in the right place.

**Names must be verb-noun pairs.** `run_tests` not `tests`. `search_code` not `code_search_tool`. `create_pull_request` not `pr`. The verb tells the model the action class (read, write, search, create, delete). The noun tells it the domain (tests, code, pull requests, files). Together they disambiguate in a crowded tool namespace where six different tools might relate to "code." When the model must choose among fifty-eight tools, it performs a rapid elimination based primarily on names. A name that encodes both action and domain enables faster, more accurate selection.

**Descriptions must state when, not just what.** A description that says "Search for patterns in the codebase using ripgrep syntax" tells the model what the tool does. A description that adds "Use when you need to find where a function is defined, where a variable is used, or where a specific string appears. Prefer this over read_file when you don't know which file contains the target. Do not use for binary files or files larger than 1MB" tells it when to choose this tool over alternatives and when not to. The disambiguation guidance—distinguishing this tool from adjacent ones in the namespace—is more valuable per token than describing the tool's internal mechanics.

**Parameters need boundary documentation.** A parameter `max_results` with type `integer` and no description gives the model no guidance on what value to choose. It might pass 1, or 1000, or 999999. Adding a description like "Maximum results to return. Range 1-100. Default 10. Use 3-5 for focused lookups where you need a specific item, 20-50 for broad exploration where you want to survey the space" gives the model a decision framework within the schema itself. The model does not just need to know what values are legal—it needs to know what values are effective for different situations.

**Return value descriptions close the inference gap.** If the model does not know what a tool returns, it cannot plan its next step before the call completes. When the model calls a tool without understanding the response format, it must wait for the result and then reason about how to interpret it—an extra cognitive step that sometimes leads to misinterpretation. A return description like "Returns a JSON object with `matches` (array of {file, line, content}) and `total_count` (integer). Results are sorted by relevance. If no matches found, returns empty array with a `suggestion` field containing alternative search terms" lets the model pre-plan its interpretation logic and commit to a strategy before the call even returns.

The cost of a detailed schema is real: each additional word consumes tokens on every model call. But a schema that is 200 tokens longer and prevents one misroute per ten calls saves far more tokens than it costs. A failed tool call costs a full model turn to process the error (typically 500–2,000 output tokens for reasoning about the failure) plus the retry's full input tokens (the entire conversation re-sent). A 200-token schema addition that prevents that failure once per ten sessions pays for itself before the first day is over. The trade-off favors useful disambiguation when measured error reduction exceeds its token and maintenance cost; verbosity without signal can hurt.

## Error Messages as Teaching Signal

If you change nothing else about your tool layer after reading this chapter, change your error messages. This is the single highest-leverage tool design decision you can make, and it requires no architectural changes—only rewriting the strings your tools return on failure. A good error message transforms a failed tool call into a one-retry recovery. A bad error message transforms it into a multi-attempt random walk that burns budget, inflates attempts-to-pass, and occasionally sends the loop into an unrecoverable spiral where it exhausts its budget without ever diagnosing the original problem.

Consider the model's epistemic situation when a tool call fails. It has committed tokens to constructing the call—selecting the tool, formulating arguments, explaining its reasoning. It has received a response indicating failure. It must now decide: was the tool wrong, were the arguments wrong, is the underlying system in an unexpected state, or is this a transient error worth retrying? The error message is the only evidence it has. Everything depends on what information that message carries.

A bad error message provides no learning signal. The model receives "Error: ENOENT" or "Error: Invalid argument" or "Error: Command failed with exit code 1." None of these tell it what went wrong, why, or what to try differently. The model's next action is necessarily a guess—it might retry with the same arguments (wasting a call), try different arguments (possibly wrong in a different way), switch to a different tool (possibly unnecessary), or attempt to diagnose the problem by making exploratory calls (expensive). Each guess costs a full inference round.

A good error message answers three questions: what specific operation failed, why it failed, and what the model should try instead. The "try instead" component is the critical differentiator. It transforms the error from a dead end into a signpost pointing toward the correct path.

``` python

from dataclasses import dataclass

@dataclass(frozen=True)
class ToolError:
    """Structured error that teaches the model how to recover."""
    what: str       # The specific operation that failed
    why: str        # The root cause
    suggestion: str # A concrete next step

    def render(self) -> str:
        return f"Error: {self.what}\nReason: {self.why}\nSuggestion: {self.suggestion}"
```

The implementation is straightforward. When a file operation fails because the path does not exist, the error should list similar files that do exist: "Error: File 'src/auth.py' does not exist. Similar files found: src/authentication.py, src/middleware/auth_handler.py, tests/test_auth.py. Use search_code to find the correct path if none of these match." The model reads this, selects the most likely match, and succeeds on the next call. Without the suggestion, it would need to call a search tool, interpret the results, and then retry—three calls instead of one.

When a permission error occurs, the error should explain the constraint and the workaround: "Error: Cannot write to 'config/production.yaml'. Reason: Production configs are immutable (mode 0444) and require the deploy-approval workflow. Suggestion: Write to config/production.yaml.proposed instead; a reviewer will promote after approval." The model now knows this is not a bug to work around but a policy to respect, and it knows the sanctioned alternative path.

When a timeout occurs, the error should provide diagnostic direction: "Error: Test execution timed out after 30 seconds. The test 'test_sync_large_dataset' at tests/test_sync.py:142 has been running without completing. Suggestion: This test likely has a data-dependent loop condition. Check the while loop at line 142, or run with --timeout 120 if the test legitimately needs more time for large inputs." The model can now make an informed decision about whether to investigate the code or increase the timeout.

The difference in loop behaviour is measurable. With structured errors, a model typically recovers in one retry because the error told it exactly what to fix. Without structured errors, recovery takes two to four attempts as the model probes different hypotheses about what went wrong. Across a ten-iteration loop, good error messages can reduce total attempts-to-pass by 30–40% \[ESTIMATE, based on observation that error-recovery cycles account for 2–4 of 10 typical iterations in production loops, and structured errors resolve 70–80% in one retry vs. 30% for generic errors\]. That reduction translates directly into cost savings and latency improvements, making error messages one of the few tool-layer investments with immediate, measurable ROI.

The design principle for loop tool errors: every error message should contain enough information that the model's next attempt succeeds without further diagnostic tool calls. If the error requires the model to make additional exploratory calls to understand what went wrong, the error message is insufficient and should be rewritten.

A corollary principle: error messages should never include information that is true but unhelpful. Stack traces, internal function names, memory addresses, and raw exception class names add noise without adding recovery guidance. A stack trace can help diagnose a genuine implementation bug; redact sensitive details and distinguish internal diagnosis from user-facing recovery advice. It can act on "Parse failed: expected JSON but received XML. The endpoint may return XML for error responses. Try adding 'Accept: application/json' header." Strip the implementation details; preserve only what informs the next action.

## Tool Search: On-Demand Discovery

**Unverified legacy attribution.** The naive approach to tool provisioning loads every tool schema into the model's context at the start of every conversation. For a small tool set of five to ten tools, this is fine—the overhead is manageable. But production systems grow. Integrations accumulate. Anthropic observed this pattern consuming 134,000 tokens of tool definitions before any optimisation in a real production deployment [unverified legacy attribution]. At that scale, tool schemas alone consume more than half of a 200K context window, leaving barely enough room for the actual conversation, reasoning, and task content.

**Unverified legacy attribution.** Tool Search Tool solves this by inverting the loading model: instead of loading all definitions upfront, you provide a single meta-tool that lets the model discover and load tool schemas on demand [unverified legacy attribution]. The model starts each session with only the search tool visible—roughly 500 tokens of schema. When it needs a capability, it searches for it by describing what it wants to do in natural language. The search returns a shortlist of matching tools (brief summaries, not full schemas). The model selects the relevant ones, and their full schemas are loaded into its active tool set for the remainder of the session.

**Unverified legacy attribution.** The economics make the case decisively. In the configuration Anthropic measured: approximately 500 tokens loaded upfront for the search tool itself, plus 3,000–5,000 tokens for the three to five tools actually discovered and used per session. Total: approximately 8,700 tokens versus 77,000 tokens in the fully-loaded configuration [unverified legacy attribution]. That is an 89% reduction in tool-schema overhead, applied on every turn of every iteration.

``` python

from dataclasses import dataclass, field
from typing import Protocol

@dataclass(frozen=True)
class ToolSummary:
    """Brief description returned by search — not the full schema."""
    name: str
    brief: str  # One-line capability description for selection

@dataclass(frozen=True)
class Tool:
    """Full tool definition loaded on demand."""
    name: str
    description: str
    parameters: dict  # JSON Schema object
    examples: list[dict] = field(default_factory=list)

class ToolRegistry:
    """Registry supporting on-demand tool discovery.

    Introduced in Chapter 9. Extended in Chapter 14 (triggers)
    and Chapter 24 (fleet tool delegation).
    """

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}
        self._active: set[str] = set()

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def search(self, query: str, top_k: int = 5) -> list[ToolSummary]:
        """Return brief summaries of tools matching the query.

        The model calls this to discover capabilities on demand.
        Full schemas are not loaded until activate() is called.
        """
        scored: list[tuple[float, ToolSummary]] = []
        for tool in self._tools.values():
            relevance = self._score_relevance(query, tool)
            if relevance > 0.0:
                summary = ToolSummary(name=tool.name, brief=tool.description[:120])
                scored.append((relevance, summary))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [summary for _, summary in scored[:top_k]]

    def activate(self, name: str) -> Tool:
        """Load full schema into the active tool set for this session."""
        if name not in self._tools:
            raise KeyError(
                f"Unknown tool: '{name}'. "
                f"Use search() to find available tools. "
                f"Available tools containing '{name[:8]}': "
                f"{[n for n in self._tools if name[:8].lower() in n.lower()][:5]}"
            )
        self._active.add(name)
        return self._tools[name]

    def active_tools(self) -> list[Tool]:
        """Tools currently loaded — this is what the model sees each turn."""
        return [self._tools[n] for n in self._active]

    def deactivate(self, name: str) -> None:
        """Remove a tool from the active set to reclaim context budget."""
        self._active.discard(name)

    def _score_relevance(self, query: str, tool: Tool) -> float:
        """Score tool relevance to query. Production uses embeddings;
        keyword fallback shown for clarity."""
        q_terms = set(query.lower().split())
        tool_terms = set(tool.name.lower().replace("_", " ").split())
        tool_terms.update(tool.description.lower().split())
        overlap = q_terms & tool_terms
        return len(overlap) / max(len(q_terms), 1)
```

The implementation has three layers. The registry holds all available tools but does not expose their full schemas to the model by default. The search endpoint accepts natural-language queries and returns brief summaries—just enough for the model to decide which tools are relevant. The activation step loads the full schema of selected tools into the model's active tool set. Deactivation reclaims context space when tools are no longer needed.

For loops with predictable tool needs, a hybrid approach works well: always activate three or four core tools (file read, file write, code search) and use Tool Search only for the remaining forty. This eliminates the discovery latency for the tools the loop definitely needs while still saving the overhead of rarely-used tools.

The hybrid approach also addresses a reliability concern. Tool Search requires the model to formulate a good search query—to know what it needs before it knows what is available. For core operations that every loop iteration uses, this self-knowledge is reliable. For unusual operations the model has not encountered before, the search query may be poorly formed, returning irrelevant results. By always-activating the core tools, you ensure the loop's critical path never depends on search-query quality.

A second design consideration is search-result caching across turns. Once the model discovers and activates a tool in turn three, it remains active for the rest of the session. If the loop needs the same tool again in turn seven, it is already loaded—no second search required. This means the discovery cost is genuinely per-session, not per-use. For loops with consistent tool needs across iterations (the same three tools needed every cycle), the first iteration pays the discovery cost and all subsequent iterations benefit. For loops with variable tool needs (different tools needed at different stages), Tool Search is invoked more frequently but still saves substantially compared to loading everything upfront.

## Programmatic Tool Calling: Keeping Intermediate Results Out of Context

In a standard agent loop, the model decides which tool to call, the harness executes it, and the full result re-enters the model's context. This round-trip is correct when the model needs to reason about the result—when the result contains information that should influence the next decision. But it is wasteful when the result is merely an intermediate step toward a final answer that the model does need.

Consider a model that needs to compute a summary statistic across a spreadsheet with 5,000 rows. In the standard flow, the model would call a "read spreadsheet" tool, receive all 5,000 rows in its context (approximately 200,000 tokens), and then reason about them. Most of those tokens are data transit, not useful context. The model does not need to see each row; it needs the aggregated result.

**Unverified legacy claim, not source-checked evidence.** Programmatic Tool Calling addresses this pattern: the model orchestrates tool invocations inside a code-execution environment, and only the final computed result returns to the model's context window [unverified legacy attribution]. The intermediate data—raw API responses, full file contents, large query results—stays within the execution sandbox and never consumes context tokens.

**Unverified legacy claim, not source-checked evidence.** Claude for Excel is the canonical reference implementation [unverified legacy attribution]. When processing a large spreadsheet, the model writes Python code that reads the spreadsheet within the execution environment, performs filtering, aggregation, or transformation, and returns only the summary. The full 5,000-row dataset never enters the conversation. The model reasons at the level of "write code to compute X" rather than "look at every row and manually compute X."

``` python

class ProgrammaticCaller:
    """Orchestrates tool calls in code, returning only final results.

    The model writes a script that calls tools programmatically.
    Intermediate results stay in the execution sandbox.
    Only the script's return value enters model context.
    """

    def __init__(self, registry: ToolRegistry) -> None:
        self._registry = registry

    async def execute(self, script: str, available_tools: list[str]) -> str:
        """Run model-authored script with access to specified tools.

        Args:
            script: Python code the model wrote to orchestrate tools.
            available_tools: Names of tools the script may invoke.

        Returns:
            The script's final return value as a string.
            Intermediate results do NOT enter model context.
        """
        sandbox_globals = {}
        for name in available_tools:
            if name in self._registry._tools:
                sandbox_globals[name] = self._registry.get_callable(name)
        result = await self._run_sandboxed(script, sandbox_globals)
        return str(result)

    async def _run_sandboxed(self, script: str, namespace: dict) -> object:
        # Excerpt — full sandboxing in Chapter 30 (Security)
        ...
```

The context savings depend on the ratio between intermediate data and the final result. For the spreadsheet case, a 5,000-row dataset might be 200,000 tokens raw but produce a 500-token summary—a 400:1 compression ratio. For a code-search-and-extract operation, the raw file might be 12,000 tokens while the extracted function and its dependencies are 1,500—an 8:1 ratio. For an API-call-and-aggregate operation (query ten endpoints, return the combined health status), the raw responses might be 15,000 tokens while the summary is 300—a 50:1 ratio. In every case, programmatic calling keeps the model's context focused on reasoning rather than data transit.

``` mermaid

sequenceDiagram
    participant M as Model Context
    participant E as Execution Environment
    participant T1 as Tool: read_spreadsheet
    participant T2 as Tool: query_database

    M->>E: Script: "Read sheet, filter rows where amount > $1000,<br/>join with customer DB, return top-10 by revenue"
    E->>T1: read_spreadsheet("sales_q2.xlsx")
    T1-->>E: 5,000 rows (raw data stays in sandbox)
    E->>T2: query_database("SELECT name, tier FROM customers")
    T2-->>E: 200 rows (stays in sandbox)
    E->>E: Filter, join, sort, aggregate
    E-->>M: "Top 10 customers by Q2 revenue: ..." (500 tokens)
    Note over M: Context consumed: ~500 tokens<br/>Data processed: ~200,000 tokens equivalent
```

The pattern is not limited to data processing. Any multi-step operation where intermediate results are uninteresting to the model's reasoning is a candidate. Fetching a web page, extracting relevant sections, and returning only the extracted content. Running a test suite, parsing the output, and returning only the failure details. Querying multiple APIs, comparing responses, and returning only the discrepancies. In each case, the model delegates the mechanical orchestration to code and reserves its context budget for the reasoning that requires intelligence.

## Tool Use Examples: Teaching Patterns JSON Schema Cannot Express

JSON Schema describes the shape of tool parameters: types, required fields, enumerations, format constraints. It cannot describe the patterns of effective usage. When should you pass `verbose: true`? What does a good `query` parameter look like for this specific search tool versus a generic one? How do you chain this tool's output into the next tool's input? What combination of parameters produces the best results for common scenarios?

**Unverified legacy claim, not source-checked evidence.** Tool Use Examples fill this gap by demonstrating correct call patterns directly in the tool definition [unverified legacy attribution]. They show the model not just what arguments are legal, but what arguments are effective. The distinction is the same as between reading a function's type signature and seeing three examples of how experts call it—the examples communicate intent, idiom, and best practice that types alone cannot.

``` python

@dataclass(frozen=True)
class ToolExample:
    """A demonstrated usage pattern for a tool."""
    scenario: str       # When you would make this call
    arguments: dict     # The exact arguments to pass
    result_sketch: str  # What the response looks like (abbreviated)

# Examples for a code search tool demonstrate idiomatic usage
search_code_examples = [
    ToolExample(
        scenario="Find where a function is defined",
        arguments={"pattern": "def authenticate_user", "type": "py"},
        result_sketch="Returns [{file: 'src/auth.py', line: 42, content: '...'}]",
    ),
    ToolExample(
        scenario="Find all callers of a function across the codebase",
        arguments={"pattern": r"authenticate_user\(", "type": "py", "exclude": "test_*"},
        result_sketch="Returns matches in non-test files that invoke the function",
    ),
    ToolExample(
        scenario="Find configuration values across multiple file types",
        arguments={"pattern": "DATABASE_URL", "type": "yaml,env,toml"},
        result_sketch="Returns config files containing the database connection string",
    ),
]
```

The examples serve three distinct purposes. First, they disambiguate parameter semantics: if the `pattern` field accepts both literal strings and regex, the examples show both forms, teaching the model when to escape special characters and when to use regex features. Second, they demonstrate parameter composition: examples that combine `type` filtering with `exclude` patterns teach the model to use multiple parameters together for precision. Third, they set expectations about output format and volume, enabling the model to plan its next step before receiving the result.

Placement matters. Examples embedded in the tool schema are processed alongside the description during tool selection. Examples placed in a system prompt compete with other instructions for attention and can be separated from the tool they describe by thousands of tokens of intervening content. Co-locating examples with their tool ensures the model processes them together, which is when they provide maximum value.

The cost trade-off is favourable. Three examples at 150 tokens each add 450 tokens to a tool's schema. That is roughly 30% more than a typical bare schema. But if those examples improve first-call correctness from 70% to 90%—preventing one failed attempt per five calls—the savings dwarf the cost. One prevented failure saves a full inference round (500–2,000 output tokens plus the full input context resend). The examples pay for themselves within the first session.

The number of examples matters less than their diversity. Three examples that show the same basic usage pattern add little beyond the first. Three examples that cover three distinct scenarios—a lookup, a broad search, and an edge case—teach the model the tool's full behavioural range. Choose examples that represent the most common use case, a common parameterisation error (showing the correct way), and a non-obvious capability the model might miss without demonstration.

## Designing Tools for Loop Ergonomics

A tool designed for single-shot human use ("the user clicks a button and gets a result") has fundamentally different requirements than a tool designed for repeated autonomous invocation inside a loop. Human users bring context the tool does not need to provide: they remember what they did last turn, they can visually scan large outputs, they know when to stop retrying. A model inside a loop has none of these advantages. It reads tool outputs literally, it has no visual scanning ability, and it will retry indefinitely until the budget stops it. Loop-optimised tools must account for four properties that single-shot tools can safely ignore.

**Idempotency.** A loop may retry a tool call after an ambiguous failure, or re-execute a plan step after a checkpoint restore ([Chapter 17](chapter-17.md), *Execution and State: Worktrees, Sandboxes, Checkpoints*). If `create_branch("feature-x")` fails silently on the second call because the branch already exists, the model sees an error where no error semantically exists—the desired state (branch exists) is already achieved. An idempotent version checks for existence first and returns success either way: "Branch 'feature-x' exists (created now)" or "Branch 'feature-x' already existed, no action needed." Both are success from the loop's perspective. The tool must also verify that the existing branch has the intended repository, base revision, and ownership. Existence alone does not prove the requested state, and provenance should distinguish creation from reuse.

**Bounded output.** A `grep` tool that returns all 2,400 matches for a common pattern floods the model's context window with data it cannot productively process. The model will attempt to read all results, which consumes working memory, degrades reasoning quality on subsequent steps, and may push useful context out of the window entirely. Loop-optimised tools enforce output limits and communicate truncation explicitly: "Showing 20 of 2,413 matches. Results are sorted by relevance. To see more, refine your pattern to be more specific, or use offset parameter for pagination." The model knows it has partial results and can decide whether to refine (changing strategy) or paginate (continuing current strategy). Without the truncation notice, it might assume twenty results is the complete set and proceed with incomplete information.

**Incremental results.** On the fourth iteration of a test-fix loop, the model does not need the full test suite output again. It already knows which 142 tests pass. It needs what changed since last run. A loop-optimised test runner returns: "Previously: 142 passed, 3 failed. Now: 144 passed, 1 failed. Newly passing: test_auth_expiry, test_token_refresh. Still failing: test_concurrent_sessions (same error: TimeoutError at line 89)." This is dramatically more useful context per token than re-dumping 200 lines of pytest output. The model immediately knows its last edit fixed two of three failures and can focus its attention on the remaining one without re-scanning familiar output.

**Composability.** Large monolithic tools that perform multi-step operations ("read file, find function, extract dependencies, and return a summary") are hard to reuse in different contexts. The model cannot use such a tool for "just find the function" without also getting the summary it does not need. Small composable tools—read_file, find_symbol, extract_dependencies—combine freely. The model assembles them as needed for each specific situation. Composability trades a small coordination cost (the model must sequence calls and manage intermediate results) for flexibility across diverse tasks. In practice, two or three small tools composed by the model outperform one large tool that guesses what composition the model wants.

## The Cost Geometry of Tool Schemas

Every tool schema in the active set is re-sent to the model on every turn within a conversation. This is fundamental to how the API works: the model needs to know its available tools on each call because it has no persistent state between calls. The cost implication is that tool schemas are not a per-session cost but a per-turn cost. In a loop that runs twelve iterations, each with two model calls (one for planning, one for execution), that is twenty-four repetitions of every active tool schema.

The arithmetic makes aggressive schema management self-evidently necessary:

Consider a moderate production setup: 30 active tools at an average of 1,000 tokens each. That is 30,000 tokens of tool schemas per turn. Over 24 turns in a single loop run, the loop pays 720,000 tokens purely for tool schema re-transmission. At \$3 per million input tokens \[ESTIMATE, Sonnet-class pricing as of early 2026\], each loop run costs \$2.16 in schema overhead alone—before a single token of actual work. At 100 runs per day, that is \$216/day or \$6,480/month in pure tool-schema waste.

Now apply Tool Search, limiting active tools to five at any given time. Five tools at 1,000 tokens each is 5,000 tokens per turn. Over 24 turns: 120,000 tokens. Cost: \$0.36 per run, \$36/day, \$1,080/month. The delta: \$5,400 per month for a single loop configuration. For a fleet of twenty loops sharing the same tool infrastructure, the annual savings exceed \$1.2 million \[ESTIMATE, linear extrapolation assuming similar tool-set sizes across loops\].

These numbers explain why Priya's team saw their monthly costs drop from \$9,900 to under \$3,000 after implementing Tool Search. They also explain why tool schema design has disproportionate economic impact: a schema that is 200 tokens shorter than necessary saves those 200 tokens twenty-four times per run, a hundred times per day—480,000 tokens saved daily per tool, which across thirty tools becomes 14,400,000 tokens per day of savings from pure schema tightening.

Beyond cost, there is a quality dimension to tool-set size. Models make more reliable tool selections from smaller, more relevant sets. Choosing among five well-described options is cognitively simpler than choosing among forty with overlapping descriptions. The Tool Search pattern improves both cost and correctness simultaneously—a rare case where the economic optimum and the quality optimum align.

## Implementation Guidance: A Tool Contract Includes Failure Semantics

Extend the input schema with an operational contract. Record whether the call reads, writes, allocates resources, or communicates externally; its authorization boundary; its retry semantics; and what a returned status establishes. A valid JSON argument does not establish that the target tenant is correct or that the user permitted the action. Enforce those checks in the trusted adapter before invoking the underlying service.

For errors, preserve observations before suggesting causes. “Timed out after thirty seconds” is observed; “the test has an infinite loop” is a hypothesis. Include a stable error code, retriable classification, operation identifier where relevant, and bounded diagnostics. A permission failure should not suggest changing file modes or bypassing a check unless that is an explicitly authorized repair path. Tool output is evidence, not a new instruction source.

An unknown write outcome needs different handling from an invalid argument. If a create-ticket request times out after transmission, return the stable operation identity and an unknown effect status. Do not advise “try again” without describing the receiver’s deduplication or lookup contract. [Chapter 39](chapter-39.md) develops safe retry. A local check-then-create implementation is vulnerable to concurrent creators unless the receiver or database enforces uniqueness atomically.

Programmatic calling changes where data is processed, not the permission boundary. Passing a restricted Python dictionary to `exec` is not a security sandbox. Use a real isolation boundary, resource and network limits, scoped credentials, and per-call enforcement. Keep intermediate sensitive data out of the model context where useful, but still protect it in the execution environment and logs.

Exercise acceptance: run schema examples against a fake adapter, including out-of-range counts, unsupported fields, wrong tenant, missing permission, truncated output, and commit-then-timeout behavior. A discovery result must not activate authority by itself. The returned failure must preserve the original cause and identify whether a next action is permitted, needs a changed prerequisite, or requires reconciliation. Validate the tool’s examples whenever its implementation or schema changes.

## What Breaks

Tool Search introduces a discovery latency: the model must make an extra call to find tools before using them. For simple, predictable tasks where the needed tools are known in advance, this adds an unnecessary round-trip. Teams sometimes over-rotate on Tool Search and apply it even to loops with five tools that are always needed, paying a discovery tax for no benefit. The hybrid approach—always-active core tools plus search for the long tail—is almost always the right answer.

Programmatic Tool Calling requires the model to write correct orchestration code, which is itself a potential failure point. If the code has a bug—an off-by-one error, a type mismatch, an incorrect API usage—the error may be harder to diagnose than a straightforward tool-call failure because the model must debug its own generated code within a sandbox it cannot inspect interactively. For complex data transformations, the risk of silent errors (code that runs but produces wrong results) is non-trivial. Providing clear error messages from the sandbox execution (including stack traces with line numbers mapped to the model's generated code) mitigates this, but does not eliminate it.

Error messages can over-correct. An error message that is too prescriptive—"You must call X with argument Y"—can cause the model to follow the suggestion mechanically without reasoning about whether it is actually appropriate for its current goal. The error becomes an implicit prompt injection, steering the model toward a specific action regardless of broader context. Good error messages offer options and context, not commands: "File not found. Similar files: A, B, C. Use search_code if none of these match" is better than "Call search_code with pattern 'auth'" because the former lets the model decide while the latter removes its agency.

Finally, tool schemas rot. The tool's behaviour evolves (a new required parameter, a modified output format, a renamed field), but the schema description still reflects the old behaviour. The model trusts the schema, passes outdated arguments, and receives inscrutable errors. Schema drift is the tool-layer equivalent of stale documentation, and production teams need automated schema-validation tests—tests that invoke each tool with the arguments its examples suggest and verify the responses match the documented format. Without this testing discipline, schema accuracy degrades silently until loop convergence metrics visibly worsen.

## Key Takeaways

- **Unverified legacy claim:** Tool design is context engineering applied to the model's action space. Schema quality directly determines loop convergence speed and cost per verified outcome.
- Error messages are the highest-leverage single investment: a structured error (what failed, why, what to try) converts most failures into one-retry recoveries, reducing attempts-to-pass by 30–40% \[ESTIMATE\].
- Tool Search Tool reduces schema overhead from tens of thousands of tokens to under ten thousand by loading tool definitions on demand rather than upfront [unverified legacy attribution].
- Programmatic Tool Calling keeps intermediate results out of model context, enabling operations on large datasets without context-window exhaustion [unverified legacy attribution]. Claude for Excel is the reference implementation [unverified legacy attribution].
- Tool Use Examples demonstrate call patterns that JSON Schema cannot express, improving first-call correctness by showing what effective usage looks like [unverified legacy attribution].
- Loop-optimised tools are idempotent, output-bounded, incremental, and composable.
- Schema cost is per-turn, not per-session. In a twelve-iteration loop with two calls per iteration, every unnecessary tool schema is re-transmitted twenty-four times.
- Anthropic observed 134,000 tokens of tool definitions before optimisation; Tool Search reduced one deployment from ~77,000 to approximately 8,700 tokens [unverified legacy attribution].

## The Loop Contract, So Far

This chapter fills the **budget** field: tool schema overhead is a controllable context-budget cost, and Tool Search plus active-set management are the mechanisms for governing it. It also informs **oracle** design: error messages from tools are the primary feedback signal driving iteration efficiency, directly affecting the loop's attempts-to-pass metric.

## Exercises

1.  **Audit your tool schemas** (analysis). Take five tools from a project you work on. For each, evaluate: does the description state *when* to use the tool (not just what it does)? Do parameter descriptions include value guidance and boundary documentation? Do error messages answer what/why/suggestion? Score each tool 0–3 on each criterion and identify the lowest-scoring.

1.  **Implement a ToolRegistry with search** (build). Using the `loopkit/tools.py` skeleton in this chapter, implement a working `ToolRegistry` that supports keyword search, activation, active-tool listing, and deactivation. Write four tests: search returns relevant results; unactivated tools are absent from `active_tools()`; the `KeyError` on unknown activation includes helpful context; deactivation removes the tool from the active set.

1.  **Measure schema overhead** (estimation). Pick a production loop or agent you use. Count the number of tools in its active set and estimate their total token count (use 800–1,200 tokens per tool as a heuristic). Calculate the per-run schema cost assuming 10 iterations with 2 model calls each, at \$3/MTok input. Then estimate the savings if only 4 tools were active via Tool Search. State all assumptions explicitly.

1.  **Design an error taxonomy** (build). For a filesystem tool set (read_file, write_file, list_directory, search_files), define a `ToolError` dataclass and write error messages for the six most common failure modes. Each error must include what/why/suggestion. Test by showing the errors to a colleague without additional context and asking whether they could determine the correct next action from the error alone.

1.  **Programmatic extraction** (build). Write a `ProgrammaticCaller` that takes a Python script string and a list of tool names, executes the script in a separately isolated, resource-limited environment with only authorized tool capabilities, and returns only the script's final expression value. Write tests verifying that intermediate tool call results do not appear in the returned string, and that execution errors produce structured feedback including the relevant line number.

## Sources and Evidence Limits

- [AWS Builders’ Library, Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/): bounded identity lifetime and mismatched intent; see [Chapter 39](chapter-39.md) for integration guidance.

The original edition attributed product features and outcome figures to undated or incompletely located vendor material. Those inherited attributions are **unverified in this chapter**; they are not reproduced as a fact-check receipt. The engineering patterns and fictional examples stand separately from those claims. Consult the edition’s source notes for collected references and verify implementation-specific contracts against the version you deploy.

------------------------------------------------------------------------

*Next: [Chapter 10](chapter-10.md) examines MCP, the protocol that turns tool schemas into a shared integration substrate, and asks when a connector is worth the latency and supply-chain cost it introduces.*
