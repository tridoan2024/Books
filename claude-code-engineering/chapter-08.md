# Chapter 8: Tool Architecture & Registration

In Chapter 5, we examined the API client — how the agent communicates with the model, manages prompt caching, and processes streaming responses. That chapter mentioned tool schemas being sent to the API but treated the tool system itself as a given: tools exist, they have schemas, the API receives them. This chapter opens that system up.

The tool architecture lives across six key files. The type system and factory function occupy `Tool.ts` (792 lines) — a single generic interface with 40+ methods that every tool implements. The registration pipeline lives in `tools.ts` (389 lines), where feature gates, deny rules, and MCP merging produce the final tool list. The schema bridge sits in `utils/api.ts` (266 lines), converting Zod schemas to JSON Schema for the API. Permission tier constants live in `constants/tools.ts` (~120 lines), defining which tools each execution context can access. Deferred loading logic is in `tools/ToolSearchTool/prompt.ts` (~120 lines). And each concrete tool — `BashTool.tsx` (~500 lines), `AgentTool.tsx` (~300 lines), and 30+ others — implements the interface through a factory that provides fail-closed defaults.

Together, these ~2,500+ lines of infrastructure support 35+ tools (18 core, ~15 feature-gated, plus an unlimited number of MCP tools discovered at runtime). Every design decision here is shaped by two constraints: **extensibility without complexity** (adding a tool should be a self-contained change) and **cache-stable API schemas** (the tool list sent to the model must be deterministic across requests to preserve prompt caching). The entire tool architecture exists to make both guarantees simultaneously.

---

## The Tool Type System

### The Core Interface

The entire tool architecture rests on a single generic interface at `Tool.ts:362`:

```typescript
export interface Tool<
  Input = unknown,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> {
  name: string
  description: string | ((context: ToolUseContext) => string)
  inputSchema: z.ZodType<Input>
  inputJSONSchema?: ToolInputJSONSchema
  call(input: Input, context: ToolUseContext): AsyncGenerator<
    ToolCallProgress<P>,
    ToolResult<Output>
  >
  // ... 40+ additional methods/properties
}
```

Three type parameters, all with defaults. `Input` is validated by a Zod schema at runtime. `Output` is the data shape returned in `ToolResult`. `P` extends `ToolProgressData` for typed progress events yielded during execution. The defaults — all `unknown` — mean callers who don't care about specifics get a clean interface. Code that manages a heterogeneous list of tools can work with `Tool[]` without knowing any individual tool's types.

This is a deliberate design choice for a system with 35+ tools. If the interface required concrete types everywhere, the tool registry would need to be generic over every tool's input/output pair — a combinatorial explosion. The defaults let the registry work with erased types while individual tool implementations remain fully typed.

### The Dual-Schema Pattern

Tools define input validation in two layers (`Tool.ts:15`):

```typescript
export type ToolInputJSONSchema = {
  type: "object"
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}
```

1. **Zod schema** (`inputSchema`) — runtime validation inside the process. When the model returns a tool call, the agent parses the JSON input and validates it against the Zod schema before calling `tool.call()`. This catches malformed input, wrong types, and missing fields.

2. **JSON Schema** (`inputJSONSchema`) — an optional override sent to the API for model-side validation. When present, the API uses this schema to constrain the model's generation, reducing the chance of invalid tool calls.

When `inputJSONSchema` is absent, the system converts the Zod schema to JSON Schema automatically (Section 6 below). This dual-schema approach exists because of MCP tools: external tools discovered at runtime provide raw JSON Schema directly (they have no Zod definitions in the agent's process). Built-in tools use Zod for type-safe validation and let the conversion handle the API side.

### ToolResult — Typed Output

```typescript
// Tool.ts:321
export type ToolResult<T = unknown> = {
  type: "tool_result"
  outputType?: "text" | "image" | "inline"
  data: T
}
```

The `outputType` field controls how results flow back to the model. Most tools return `"text"` — the data is serialized as a string in the next API turn. BashTool can return `"image"` when a command produces screenshot output. The `"inline"` type embeds content directly in the assistant's response rather than as a separate tool result block.

This type union keeps result handling uniform: the query loop (Chapter 4) doesn't need to know what each tool returns. It just passes `ToolResult` to `mapToolResultToToolResultBlockParam()`, and each tool handles its own serialization.

---

## The ToolUseContext — Fat Context Over Thin Parameters

Every tool call receives a context object with approximately 40 fields (`Tool.ts:158`):

```typescript
export type ToolUseContext = {
  // Identity
  options: Options
  messageId: string
  toolUseId: string

  // Conversation state
  messages: Message[]
  tools: Tools

  // Filesystem
  absCwd: string
  readFileTimestamps: Map<string, number>

  // Permissions
  setToolJustUsed(tool: Tool): void
  getToolPermissionContext(): ToolPermissionContext

  // User interface
  addToAssistantTurn(block: ContentBlock): Promise<void>
  getInputTokenCount(): number | undefined

  // Control flow
  abortController: AbortController
  shouldCancelOnContextCollapse: boolean

  // Subagent coordination
  sourceAgentName?: string
  coordinatorMode?: boolean
  isTeammate?: boolean
  getCoordinatorModeModuleFunctions?: () => CoordinatorModeModule

  // ... many more fields
}
```

This is the "fat context" pattern — rather than threading individual dependencies through each tool call's signature, a single object provides everything. The alternative is what you might call "parameter threading": each tool's `call()` method takes only the specific dependencies it needs. That approach works for 5 tools. At 35+, it creates a maintenance problem: adding a new capability (say, access to the read-file timestamp cache) requires changing the signature of every tool that needs it, which is most of them.

The fat context is essentially a service locator scoped to a single tool invocation. It gives each tool access to the conversation state, the filesystem context, the permission system, and the UI layer — without any of those being global singletons. The context is created fresh for each tool call by the `StreamingToolExecutor` (Chapter 4), which means tools can't leak state between invocations through the context object.

### ToolPermissionContext — Execution Environment Flags

```typescript
// Tool.ts:123
export type ToolPermissionContext = {
  isInAgentMode: boolean
  isTeammate: boolean
  isAsyncAgent: boolean
  isCoordinatorMode: boolean
  inProcessTeammate: boolean
  isInWorktree: boolean
  isInAutoMode: boolean
  allowedTools: string[] | undefined
}
```

Eight boolean flags encode the execution environment. These drive the permission tier system that determines which tools are available and which require user confirmation. A tool running in auto mode gets different permissions than one running in interactive REPL mode. A subagent teammate gets a restricted tool set compared to the top-level agent. The permission context travels with every tool invocation so that `checkPermissions()` can make the right decision without consulting global state.

---

## The buildTool() Factory — Fail-Closed Defaults

Implementing 40+ methods per tool would be impractical. Instead, every tool uses a factory function at `Tool.ts:757`:

```typescript
const TOOL_DEFAULTS = {
  isReadOnly: () => false,
  isDestructive: () => false,
  isConcurrencySafe: () => false,
  interruptBehavior: () => "confirm" as const,
  isSearchOrReadCommand: () => false,
  shouldDefer: false,
  alwaysLoad: false,
  isMcp: false,
  isLsp: false,
  strict: false,
  maxResultSizeChars: undefined,
  aliases: [],
  searchHint: undefined,
  mcpInfo: undefined,
  // ... more defaults
} satisfies Partial<Tool>

export function buildTool<Input, Output, P extends ToolProgressData>(
  def: ToolDef<Input, Output, P>,
): Tool<Input, Output, P> {
  return {
    ...TOOL_DEFAULTS,
    ...def,
  } as Tool<Input, Output, P>
}
```

The `ToolDef` type requires only four things (`Tool.ts:721`):

```typescript
type ToolDef<Input, Output, P> = Partial<Tool<Input, Output, P>> & {
  name: string
  description: string | ((context: ToolUseContext) => string)
  inputSchema: z.ZodType<Input>
  call(input: Input, context: ToolUseContext): AsyncGenerator<
    ToolCallProgress<P>,
    ToolResult<Output>
  >
}
```

Name, description, input schema, and the `call()` implementation. Everything else gets a default.

The critical design decision is **which direction the defaults point**. Look again: `isReadOnly: false`, `isDestructive: false`, `isConcurrencySafe: false`. A new tool that forgets to declare itself read-only will be treated as a mutating tool, triggering permission checks. A tool that forgets to declare concurrency safety will be serialized, never run in parallel. The safe default requires explicit opt-in for dangerous capabilities.

This is fail-closed by design. In a security-sensitive system where tools can execute arbitrary bash commands, write files, and spawn subagents, the wrong default can create a vulnerability. If `isConcurrencySafe` defaulted to `true`, a new tool that modifies shared state could corrupt the filesystem when run in parallel. If `isReadOnly` defaulted to `true`, a new tool could bypass permission checks entirely.

### Why a Factory Instead of a Base Class

The factory pattern (`buildTool()` returning a plain object) is chosen over class inheritance for three reasons:

1. **No `this` binding issues.** Tool methods are stored as plain functions on an object. They can be destructured, passed as callbacks, or stored in maps without worrying about lost `this` context — a common source of bugs in TypeScript class hierarchies.

2. **Composability.** A tool definition is just a plain object with spread. You can compose tool behaviors by spreading multiple partial definitions together, which is awkward with class inheritance.

3. **Tree-shaking.** Bundlers can eliminate unused tools more effectively when they're plain objects created by function calls rather than class instances with prototype chains. This matters when feature gates (next section) need to eliminate entire tools from the production bundle.

---

## Concrete Tool Implementations

### BashTool — Feature-Gated Schema

The BashTool at `tools/BashTool/BashTool.tsx:420` demonstrates several patterns:

```typescript
export const BashTool = buildTool({
  name: BASH_TOOL_NAME,
  maxResultSizeChars: 30_000,
  strict: true,
  // ...
  get inputSchema() {
    return z.object({
      command: z.string(),
      description: z.string().optional(),
      timeout: z.number().optional(),
      run_in_background: z.boolean().optional(),
      ...(feature("SANDBOX_PERMISSIONS")
        ? { dangerouslyDisableSandbox: z.boolean().optional() }
        : {}),
    })
  },
})
```

The `get inputSchema()` is a getter, not a static property. It evaluates at access time, not definition time. This allows the Zod schema to conditionally include fields based on compile-time feature flags. The `dangerouslyDisableSandbox` field only exists in builds where `SANDBOX_PERMISSIONS` is enabled — it's not hidden or disabled, it literally doesn't exist in the schema for other builds.

The `maxResultSizeChars: 30_000` sets a hard cap on output sent back to the model. A bash command that dumps a 10MB log file would overwhelm the context window. The truncation happens at the tool level, not the API level — the tool is responsible for fitting its output within its declared budget.

The `strict: true` flag enables strict JSON Schema validation on the API side. As discussed in Chapter 5, strict mode tells the Anthropic API to constrain model generation so that tool call inputs are guaranteed to match the schema. This eliminates an entire class of validation errors at the cost of slightly constrained generation.

### AgentTool — Delegation Boundaries

The AgentTool at `tools/AgentTool/AgentTool.tsx:196` shows a different set of design choices:

```typescript
export const AgentTool = buildTool({
  name: AGENT_TOOL_NAME,
  maxResultSizeChars: 100_000,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  // ...
})
```

Three decisions worth examining:

**`maxResultSizeChars: 100_000`** — 3.3x larger than BashTool. Agent results are full conversation summaries from a subagent's entire execution. A 30K cap would force aggressive summarization that loses critical details.

**`isReadOnly: true`** — the AgentTool itself doesn't mutate anything. The subagent it spawns does (in its own context, with its own permissions), but from the parent agent's perspective, calling AgentTool is a read operation. This distinction matters for permission checks: spawning a subagent doesn't require write permission, even though the subagent may write files.

**`isConcurrencySafe: true`** — multiple agents can run in parallel. The `StreamingToolExecutor` from Chapter 4 checks this flag to decide whether to serialize or parallelize tool calls. Agents running in parallel is a core capability for coordinator mode, where a lead agent dispatches multiple teammate agents simultaneously.

---

## Feature-Gated Tool Registration

### Compile-Time Dead Code Elimination

The tool registry at `tools.ts:16` uses Bun's compile-time feature gates:

```typescript
import { feature } from "bun:bundle"

const SleepTool = feature("PROACTIVE") || feature("KAIROS")
  ? require("./SleepTool/SleepTool").SleepTool
  : undefined

const cronTools = feature("AGENT_TRIGGERS")
  ? require("./CronTools/CronTools")
  : undefined

const MonitorTool = feature("MONITOR_TOOL")
  ? require("./MonitorTool/MonitorTool").MonitorTool
  : undefined

const WebBrowserTool = feature("WEB_BROWSER_TOOL")
  ? require("./WebBrowserTool/WebBrowserTool").WebBrowserTool
  : undefined

const coordinatorModeModule = feature("COORDINATOR_MODE")
  ? require("../coordinatorMode/coordinatorMode")
  : undefined
```

The `feature()` function is a bundler macro. At compile time, the bundler evaluates `feature("PROACTIVE")` to a boolean literal. If `false`, the ternary collapses to `undefined`, and the `require()` call — along with the entire module it references and all its transitive dependencies — is eliminated as dead code. The tool doesn't just get disabled at runtime. It doesn't exist in the shipped binary.

This is the first layer of gating. Here's the full inventory:

| Feature Flag | Tool(s) | Purpose |
|---|---|---|
| `PROACTIVE` or `KAIROS` | SleepTool | Scheduled/timed operations |
| `AGENT_TRIGGERS` | CronCreateTool, CronDeleteTool, CronListTool | Recurring task scheduling |
| `AGENT_TRIGGERS_REMOTE` | RemoteTriggerTool | Remote agent triggering |
| `MONITOR_TOOL` | MonitorTool | Process monitoring |
| `KAIROS` | SendUserFileTool | File delivery to user |
| `CONTEXT_COLLAPSE` | CtxInspectTool | Context window inspection |
| `TERMINAL_PANEL` | TerminalCaptureTool | Terminal panel capture |
| `WEB_BROWSER_TOOL` | WebBrowserTool | Browser automation |
| `COORDINATOR_MODE` | Coordinator module | Multi-agent coordination |
| `HISTORY_SNIP` | SnipTool | Conversation history editing |
| `UDS_INBOX` | ListPeersTool | Unix domain socket peers |
| `WORKFLOW_SCRIPTS` | WorkflowTool | Workflow script execution |

### Runtime Environment Gates

The second layer uses runtime environment variables:

```typescript
const REPLTool =
  process.env.USER_TYPE === "ant"
    ? require("./REPLTool/REPLTool").REPLTool
    : undefined
```

This gates internal-only tools to Anthropic employees. Unlike compile-time gates, the `require()` call is still in the bundle — the code exists but isn't evaluated unless the environment variable matches. This is appropriate for tools that need to exist in the same build artifact but only activate for specific users.

The two-layer approach lets the build system produce different bundles for different deployment targets (internal vs. external, experimental vs. stable) while the runtime layer handles per-user variation within a single deployment.

### Breaking Circular Dependencies with Lazy require()

Team tools create a circular dependency: they depend on the tool registry (they need to know what tools exist), and the tool registry depends on them (they need to be in the list). The solution at `tools.ts:62`:

```typescript
function getTeamCreateTool(): Tool | undefined {
  return require("./TeamTools/TeamCreateTool").TeamCreateTool
}

function getTeamDeleteTool(): Tool | undefined {
  return require("./TeamTools/TeamDeleteTool").TeamDeleteTool
}

function getSendMessageTool(): Tool | undefined {
  return require("./TeamTools/SendMessageTool").SendMessageTool
}
```

These lazy getter functions wrap `require()` calls that only resolve when invoked, not at module load time. The module graph loads `tools.ts` first (it's imported everywhere), but the team tools aren't resolved until `getAllBaseTools()` is called — by which point all modules have finished loading and the circular reference is safe to follow.

---

## The Tool Assembly Pipeline

The journey from raw tool definitions to the final tool list sent to the API is a four-stage pipeline. Understanding this pipeline is essential because its output directly affects prompt caching — a different tool list means a different cache key.

### Stage 1: getAllBaseTools()

```typescript
// tools.ts:193
function getAllBaseTools(): Tool[] {
  return [
    // Core tools (always present)
    BashTool,
    ReadTool,
    WriteTool,
    EditTool,
    GlobTool,
    GrepTool,
    LSPTool,
    NotebookEditTool,
    WebFetchTool,
    WebSearchTool,
    AgentTool,
    TaskCreateTool,
    TaskGetTool,
    TaskListTool,
    TaskUpdateTool,
    TaskOutputTool,
    TaskStopTool,
    AskUserQuestionTool,
    // Conditionally included via spread
    ...(SleepTool ? [SleepTool] : []),
    ...(cronTools
      ? [cronTools.CronCreateTool, cronTools.CronDeleteTool,
         cronTools.CronListTool]
      : []),
    ...(MonitorTool ? [MonitorTool] : []),
    // Lazy-loaded team tools
    ...(getTeamCreateTool() ? [getTeamCreateTool()!] : []),
    ...(getTeamDeleteTool() ? [getTeamDeleteTool()!] : []),
    ...(getSendMessageTool() ? [getSendMessageTool()!] : []),
  ].filter(Boolean) as Tool[]
}
```

The pattern `...(tool ? [tool] : [])` conditionally includes each feature-gated tool. If the compile-time gate resolved to `undefined`, the spread produces an empty array — no entry in the list. The final `.filter(Boolean)` is a safety net that catches any `undefined` values that slip through partially-initialized modules. Belt and suspenders.

### Stage 2: getTools() — Filtering

```typescript
// tools.ts:271
export function getTools(options: {
  denyRules?: string[]
  isReplMode?: boolean
  permissionContext?: ToolPermissionContext
}): Tool[] {
  let tools = getAllBaseTools()

  // Apply deny rules from settings.json
  tools = filterToolsByDenyRules(tools, options.denyRules ?? [])

  // Filter REPL-only tools when not in REPL mode
  if (!options.isReplMode) {
    tools = tools.filter(t => !REPL_ONLY_TOOLS.has(t.name))
  }

  // Filter by each tool's isEnabled() method
  tools = tools.filter(
    t => t.isEnabled?.(options.permissionContext) !== false
  )

  return tools
}
```

Three filters in sequence:

1. **Deny rules** — user-configured patterns from `settings.json` that block specific tools entirely. If you never want Claude to use `WebSearch`, add it to the deny list.

2. **REPL filtering** — some tools (like `AskUserQuestion`) only make sense in interactive mode. In SDK/API mode, they're removed.

3. **isEnabled()** — each tool's self-reported availability. A tool can disable itself based on the permission context. For example, team tools disable themselves when coordinator mode isn't active.

### Stage 3: assembleToolPool() — Merging and Sorting

```typescript
// tools.ts:345
export function assembleToolPool(
  builtInTools: Tool[],
  mcpTools: Tool[],
): Tool[] {
  // 1. Combine built-in + MCP tools
  const combined = [...builtInTools, ...mcpTools]

  // 2. Deduplicate (built-in wins over MCP with same name)
  const seen = new Set<string>()
  const deduped = combined.filter(t => {
    if (seen.has(t.name)) return false
    seen.add(t.name)
    return true
  })

  // 3. Sort for cache stability
  return deduped.sort((a, b) => a.name.localeCompare(b.name))
}
```

The alphabetical sort at the end is the most important line in the pipeline. MCP tools are discovered at runtime from external servers — their order depends on which server responds first, network latency, and discovery timing. Without deterministic sorting, the tool list sent to the API would vary between requests. As discussed in Chapter 5, the tool list is part of the prompt cache key. A different order means a different key, which means a cache miss, which means re-processing 50-70K tokens at full price.

Built-in tools win name collisions with MCP tools because they're added first to the combined array. The `Set`-based deduplication skips the second occurrence. This is a safety measure: an MCP server can't override a built-in tool by registering one with the same name.

### Stage 4: getMergedTools() — The Public API

```typescript
// tools.ts:383
export function getMergedTools(
  options: GetToolsOptions,
  mcpTools: Tool[],
): Tool[] {
  const builtIn = getTools(options)
  return assembleToolPool(builtIn, mcpTools)
}
```

This is the function the query loop calls. The full pipeline in one line:

```
getAllBaseTools() → filterToolsByDenyRules() → getTools() →
  assembleToolPool(builtIn, mcpTools) → getMergedTools()
```

---

## Zod-to-JSON-Schema — The API Bridge

The tool type system uses Zod internally. The Anthropic Messages API expects JSON Schema. The `toolToAPISchema()` function at `utils/api.ts:119` bridges the gap:

```typescript
export function toolToAPISchema(
  tool: Tool,
  options: {
    sessionId?: string
    experimentalBetas?: boolean
    enableDeferredLoading?: boolean
    enableEagerInputStreaming?: boolean
  },
): BetaToolUnion {
  // Session-stable caching layer
  const cacheKey = tool.name
  if (!schemaCache.has(cacheKey)) {
    let schema: ToolInputJSONSchema

    if (tool.inputJSONSchema) {
      // MCP tools provide raw JSON Schema directly
      schema = tool.inputJSONSchema
    } else {
      // Built-in tools: convert Zod -> JSON Schema
      schema = zodToJsonSchema(tool.inputSchema) as ToolInputJSONSchema
    }

    schemaCache.set(cacheKey, schema)
  }

  const baseSchema = schemaCache.get(cacheKey)!

  return {
    name: tool.name,
    description: typeof tool.description === "function"
      ? tool.description(/* context */)
      : tool.description,
    input_schema: baseSchema,
    // Conditional overlays
    ...(tool.strict ? { strict: true } : {}),
    ...(options.enableEagerInputStreaming
      ? { eager_input_streaming: true } : {}),
    ...(options.enableDeferredLoading && tool.shouldDefer
      ? { defer_loading: true } : {}),
    ...(shouldAddCacheControl(tool)
      ? { cache_control: { type: "ephemeral" } } : {}),
  }
}
```

### Session-Stable Schema Caching

The Zod-to-JSON-Schema conversion is expensive for complex schemas — it walks the Zod type tree, maps each node to its JSON Schema equivalent, handles unions, intersections, refinements, and transforms. Running this for 35+ tools on every API call would add measurable latency.

The cache is keyed by tool name, not schema content. This works because tool schemas don't change mid-session — a tool's Zod schema is defined once at module load time (or via a getter that returns the same shape for a given build). The cache persists for the session lifetime and is stable across API calls.

MCP tools bypass the conversion entirely. They provide `inputJSONSchema` directly — raw JSON Schema from the MCP server's tool manifest. The dual-path (Zod conversion for built-ins, pass-through for MCP) is why the `Tool` interface has both `inputSchema` and `inputJSONSchema` fields.

### The Overlay System

The base schema is just `name` + `description` + `input_schema`. Four conditional overlays extend it:

**`strict: true`** — enables strict JSON Schema validation on the API side, constraining the model's generation to always produce valid input. BashTool and EditTool use this because malformed input to those tools can be destructive (imagine a bash command where the `timeout` field parses as a string instead of a number).

**`eager_input_streaming`** — an experimental feature that streams partial tool input to the tool before the model finishes generating. For BashTool, this means the command starts executing while the model is still generating the `description` field. This reduces perceived latency but requires the tool to handle partial input gracefully.

**`defer_loading`** — tells the API this tool's schema can be loaded lazily. The model sees only the tool name until it decides to use it (see Deferred Loading below).

**`cache_control`** — marks the tool definition as cacheable for prompt caching. As Chapter 5 explained, the `cache_control: { type: "ephemeral" }` marker tells the API to cache everything up to and including this tool definition.

### Experimental Beta Kill Switch

```typescript
if (!options.experimentalBetas) {
  delete result.eager_input_streaming
  delete result.defer_loading
}
```

When running through a proxy that doesn't support experimental API features, the system strips those fields. This prevents 400 errors from proxies that validate the request schema strictly. The guard is at the schema level, not the feature gate level — the tool still has `shouldDefer: true` internally, but the API never sees the field.

---

## Deferred Tool Loading — Progressive Disclosure

With 35+ built-in tools and potentially hundreds of MCP tools, sending all tool schemas in every API call is wasteful. Each tool schema can be 200-500 tokens. Forty tools at 300 tokens each is 12,000 tokens of tool definitions in every request — tokens the model must process even if it never uses most of those tools.

The deferred loading system at `tools/ToolSearchTool/prompt.ts:62` implements progressive disclosure:

```typescript
export function isDeferredTool(tool: Tool): boolean {
  // 1. alwaysLoad = true -> never defer
  if (tool.alwaysLoad) return false

  // 2. Explicit shouldDefer = true -> always defer
  if (tool.shouldDefer) return true

  // 3. MCP tools default to deferred
  if (tool.isMcp) return true

  // 4. LSP tools default to deferred
  if (tool.isLsp) return true

  // 5. Everything else: not deferred
  return false
}
```

The priority chain is ordered from most-specific to least-specific:

1. **`alwaysLoad: true`** — overrides everything. Core tools like Bash, Read, Write, and Edit are always fully loaded because they're used in nearly every turn.

2. **`shouldDefer: true`** — the tool author explicitly marks the tool for deferral. Used for niche built-in tools that exist in the binary but are rarely needed.

3. **MCP tools** — deferred by default. There can be dozens from external servers. Most will never be used in a given session.

4. **LSP tools** — deferred by default. Language-specific features (go-to-definition, find-references) are only relevant when working with code in that language.

5. **Built-in tools without explicit flags** — loaded by default.

Deferred tools are presented to the model as just their name:

```typescript
export function formatDeferredToolLine(tool: Tool): string {
  return tool.name
}
```

When the model decides to use a deferred tool, the ToolSearch mechanism loads its full schema on demand. This is a form of just-in-time compilation for the tool surface: the model knows tools exist (by name), but doesn't pay the token cost of their full definitions until it needs one.

The token savings are significant. A session with 20 MCP tools at 400 tokens each would add 8,000 tokens to every request if fully loaded. Deferred, they add 20 tokens (just the names). On a 30-turn session, that's 240,000 tokens saved — roughly $3.60 at Opus pricing, per session.

---

## Tool Execution — The Call Protocol

### The AsyncGenerator Pattern

Every tool's `call()` method is an `AsyncGenerator` — the same pattern used by the query loop (Chapter 4) and the retry engine (Chapter 5):

```typescript
async *call(input: Input, context: ToolUseContext): AsyncGenerator<
  ToolCallProgress<P>,
  ToolResult<Output>
> {
  yield { type: "progress", data: { message: "Starting...", percentage: 0 } }
  // ... do work ...
  yield { type: "progress", data: { message: "Processing...", percentage: 50 } }
  // ... finish ...
  return { type: "tool_result", data: result }
}
```

Progress events are yielded during execution. The final result is returned (not yielded) — this is the generator's return value, accessible via `{ done: true, value }`. The `StreamingToolExecutor` from Chapter 4 drives this generator, pulling progress events at the UI's rendering pace. If the user cancels (Ctrl+C), the executor calls `.return()` on the generator, triggering cleanup.

The generator pattern gives three properties that callbacks can't:

1. **Pull-based flow control.** The UI pulls progress updates when it's ready to render. A fast tool doesn't overwhelm a slow terminal.

2. **Natural cancellation.** Generator `.return()` runs any `finally` blocks in the tool, enabling cleanup without explicit cancellation tokens. (Though `AbortController` is also available via the context for canceling external operations like HTTP requests.)

3. **Type-safe completion.** The return type (`ToolResult<Output>`) is statically checked. You can't accidentally yield a result or return a progress event — the type system enforces the protocol.

### Concurrency Classification

When the model requests multiple tool calls in a single turn, the `StreamingToolExecutor` decides which can run in parallel:

```
Model response: [tool_use: Read(a.ts), tool_use: Read(b.ts), tool_use: Bash(npm test)]
                         │                        │                        │
              isConcurrencySafe()      isConcurrencySafe()      isConcurrencySafe()
                   = true                   = true                   = false
                         │                        │                        │
                         └────── parallel ────────┘                        │
                                                                    serialized (after)
```

The `isConcurrencySafe()` method returns a boolean that the executor uses to partition tool calls into concurrent and serial groups. Read operations, Grep, Glob, and AgentTool are concurrent-safe. BashTool, WriteTool, and EditTool are not — they can mutate the filesystem, and concurrent mutations create race conditions.

The executor runs all concurrent-safe tools in parallel (via `Promise.all`), then runs non-concurrent tools sequentially. This is a pragmatic split: true concurrent writes would require distributed locking, which adds complexity that isn't justified for a CLI tool. Running reads in parallel and writes sequentially gives most of the performance benefit with none of the synchronization bugs.

### Tool Name Resolution

When the model returns a tool call, the agent needs to find the matching tool object:

```typescript
// Tool.ts:348-358
export function toolMatchesName(tool: Tool, name: string): boolean {
  return (
    tool.name === name ||
    tool.aliases?.includes(name) ||
    tool.userFacingName?.() === name
  )
}

export function findToolByName(tools: Tools, name: string): Tool | undefined {
  return tools.find(t => toolMatchesName(t, name))
}
```

Three-way matching: exact name, aliases (for backward compatibility when tools are renamed), and user-facing name (a display name that might differ from the internal identifier). The search is linear over the tool array — acceptable for 35-50 tools but would need indexing if the tool count grew to hundreds.

---

## Tool Result Formatting

Each tool controls how its results appear in two contexts: the next API turn (sent back to the model) and the terminal UI (shown to the user).

### API-Side Formatting

```typescript
// From the Tool interface
mapToolResultToToolResultBlockParam(result: ToolResult): APIBlock
```

This method converts the tool's typed result into the format the Anthropic API expects for the next turn's `tool_result` content block. Most tools serialize their data as text. BashTool handles images separately — a command that produces a screenshot returns an image block that the model can reason about visually.

The `maxResultSizeChars` property acts as a hard cap:

| Tool | maxResultSizeChars | Rationale |
|---|---|---|
| BashTool | 30,000 | Commands can produce unlimited output; cap prevents context overflow |
| AgentTool | 100,000 | Agent summaries are dense; need room for full conversation digest |
| Most others | undefined | No explicit cap; results are naturally bounded |

When a tool's output exceeds its cap, it's truncated with a message indicating how much was cut. This happens before the result enters the conversation — the model sees the truncated version, not the full output.

### UI-Side Rendering

```typescript
// From the Tool interface
renderToolResultMessage(result: ToolResult): ReactNode
renderToolUseMessage(input: Input): ReactNode
renderToolUseProgressMessage(progress: ToolCallProgress): ReactNode
renderGroupedToolUse(uses: ToolUse[]): ReactNode
```

Four rendering methods handle different UI states. `renderToolUseMessage` shows the tool invocation (e.g., "Running: `npm test`"). `renderToolUseProgressMessage` shows progress during execution. `renderToolResultMessage` shows the final result. `renderGroupedToolUse` handles the case where multiple calls of the same tool are visually grouped — three `Read` calls in one turn might render as a single expandable block rather than three separate ones.

### The Summary Method

```typescript
getToolUseSummary(input: Input, output: ToolResult): string
```

This produces a one-line summary used during conversation compression. When the context window fills up, the system compacts old tool calls into summaries. BashTool might summarize as `"Ran 'npm test' — 42 tests passed"`. ReadTool might summarize as `"Read src/auth.ts (328 lines)"`. These summaries replace the full tool call and result, dramatically reducing token count while preserving the conversation's logical flow.

---

## The Declarative Tool Interface

Beyond `call()`, the `Tool` interface defines methods that control tool behavior across every subsystem. Rather than centralizing behavior logic in a switch statement, each tool declares its own properties:

| Method | Purpose |
|---|---|
| `checkPermissions(input, context)` | Pre-execution permission check (Chapter 9) |
| `validateInput(input)` | Input validation beyond Zod schema |
| `isEnabled(context?)` | Whether tool appears in the tool list |
| `isReadOnly()` | Safe to run without permission prompt |
| `isDestructive()` | Warns user before execution |
| `isConcurrencySafe()` | Can run in parallel with other tools |
| `interruptBehavior()` | What happens on user interrupt: `"confirm"`, `"cancel"`, or `"ignore"` |
| `isSearchOrReadCommand()` | Affects permission auto-classification |
| `prompt(context)` | Additional system prompt content when tool is loaded |
| `backfillObservableInput(input)` | What to show user while input streams in |
| `preparePermissionMatcher(input)` | Formats input for permission rule matching |
| `toAutoClassifierInput(input)` | Formats input for auto-mode permission classifier |
| `extractSearchText(input)` | Text for ToolSearch indexing |

This is the declarative behavior pattern. Adding a new tool is a self-contained change: implement the interface through `buildTool()`, and the rest of the system adapts. The permission system queries `checkPermissions()` and `isReadOnly()`. The executor queries `isConcurrencySafe()`. The UI queries the render methods. The search system queries `extractSearchText()`. No central registry of tool behaviors to update.

The `prompt()` method deserves special attention. When a tool is loaded (not deferred), it can inject additional content into the system prompt. The `BashTool` uses this to include information about the current shell environment. MCP tools use this to include usage instructions from the MCP server. This is how tools extend the agent's capabilities beyond just being callable — they can shape how the model thinks about using them.

---

## Tool Permission Tiers

The system defines four tool restriction lists for different execution contexts. These are constant sets at `constants/tools.ts`:

### ALL_AGENT_DISALLOWED_TOOLS

```typescript
// constants/tools.ts:36
export const ALL_AGENT_DISALLOWED_TOOLS = new Set([
  "EnterPlanMode",
  "ExitPlanMode",
  "EnterWorktree",
  "ExitWorktree",
  "AskUserQuestion",
  "Skill",
  "CronCreate",
  "CronDelete",
  "CronList",
  // ...
])
```

Tools that no subagent can ever use, regardless of context. Plan mode and worktree management are reserved for the top-level agent — a subagent switching the entire workspace's plan mode would be chaotic. User interaction (`AskUserQuestion`) is top-level only because subagents can't safely prompt the user in the middle of a parallel execution.

### ASYNC_AGENT_ALLOWED_TOOLS

```typescript
// constants/tools.ts:55
export const ASYNC_AGENT_ALLOWED_TOOLS = new Set([
  "Read", "Grep", "Glob", "Bash", "Write", "Edit",
  "NotebookEdit", "LSP", "WebFetch", "WebSearch", "Agent",
  "TaskCreate", "TaskGet", "TaskList", "TaskUpdate",
  "TaskOutput", "TaskStop",
])
```

Background agents get a generous but bounded set. They can read, write, search, and manage tasks. They cannot interact with the user, manage worktrees, or invoke skills. This is the "autonomous worker" tier — capable of completing complex tasks independently.

### IN_PROCESS_TEAMMATE_ALLOWED_TOOLS

```typescript
// constants/tools.ts:77
export const IN_PROCESS_TEAMMATE_ALLOWED_TOOLS = new Set([
  "Read", "Grep", "Glob", "Bash", "Write", "Edit",
  "WebFetch", "WebSearch", "LSP", "NotebookEdit", "Agent",
  "SendMessage",
  "TaskCreate", // ...
])
```

Teammates in coordinator mode get `SendMessage` for inter-agent communication — they need to report results back to the coordinator. They have fewer task management tools than async agents because the coordinator manages the task lifecycle.

### COORDINATOR_MODE_ALLOWED_TOOLS

```typescript
// constants/tools.ts:107
export const COORDINATOR_MODE_ALLOWED_TOOLS = new Set([
  "TeamCreate", "TeamDelete", "SendMessage",
  "TaskCreate", "TaskGet", "TaskList", "TaskUpdate",
  "Read", "Grep", "Glob",
  // ... but NOT Bash, Write, Edit
])
```

The coordinator can create teams, send messages, and manage tasks — but cannot directly execute bash commands or write files. It must delegate those actions to teammates. This enforces a separation of concerns: the coordinator plans and orchestrates, teammates execute. A coordinator that directly writes files would bypass the permission controls that teammates are subject to.

The four tiers implement **least privilege per execution context**. Each context gets exactly the tools it needs and nothing more. The `isEnabled()` method on each tool checks the `ToolPermissionContext` against these sets, removing tools that shouldn't appear in the current context's tool list.

---

## MCP Tool Integration

MCP (Model Context Protocol) tools are discovered at runtime from external servers. They follow the same `Tool` interface but arrive with different data:

1. **No Zod schema.** MCP tools provide `inputJSONSchema` directly — raw JSON Schema from the server's tool manifest. The `toolToAPISchema()` function passes this through without conversion.

2. **`isMcp: true`.** This flag triggers default deferral (they're loaded by name only until needed) and affects the global cache strategy (Chapter 5 explained that non-deferred MCP tools disable global prompt caching because they vary per user).

3. **`mcpInfo` metadata.** The tool carries information about its MCP server — server name, connection status, transport type. This is used for display in the UI and for reconnection logic if the server drops.

4. **Name collision resolution.** As shown in `assembleToolPool()`, built-in tools win name collisions. An MCP server can't shadow `Bash` or `Read` by registering tools with those names. This prevents a malicious MCP server from intercepting built-in tool calls.

The integration point is `getMergedTools()`, which takes built-in tools and MCP tools as separate arrays and produces a single, sorted, deduplicated list. From the model's perspective, there's no difference between built-in and MCP tools — they all appear in the `tools` array of the API request with the same schema format.

---

## Design Lessons

Building the tool architecture for a production CLI agent with 35+ tools and external extensibility, Claude Code's approach teaches:

**1. Default to fail-closed.** `buildTool()` defaults every safety-relevant property to the restrictive option. New tools are non-concurrent, non-read-only, and non-destructive by default. Opt-in to dangerous capabilities, never opt-out of safe ones.

**2. Separate compile-time from runtime gating.** Compile-time `feature()` eliminates dead code from the bundle. Runtime `process.env` gates tools within a single build. Two layers, two purposes, no overlap.

**3. Sort for cache stability.** The alphabetical sort in `assembleToolPool()` seems trivial but protects prompt caching across the entire session. Non-deterministic tool ordering from MCP discovery would bust the cache on every turn.

**4. Use progressive disclosure for tool schemas.** Deferred loading saves thousands of tokens per request when you have dozens of tools. The model knows tools exist by name; it pays the token cost of a full schema only when it decides to use one.

**5. Let tools declare their own behavior.** The 40+ method interface means every subsystem queries the tool rather than maintaining a central behavior registry. Adding a tool is a self-contained change.

**6. Use a fat context over thin parameters.** `ToolUseContext` with ~40 fields avoids parameter threading across 35+ tool implementations. New capabilities added to the context don't require changing every tool's signature.

**7. Treat the tool list as a cache key.** Every decision in the assembly pipeline — deny rules, MCP merging, sorting, deduplication — exists because the tool list is part of the API prompt cache key. A seemingly unrelated change (an MCP server responding in a different order) can cost real money through cache misses.

In Chapter 9, we'll examine the permission system that sits between tool invocation and execution — the rules engine that decides whether a tool call should proceed, prompt the user, or be blocked. The permission tiers introduced here are the starting point; the full system adds per-tool `checkPermissions()` methods, glob-based allow/deny rules from settings, auto-mode classification, and the three-tier evaluation order that makes it all work together.
