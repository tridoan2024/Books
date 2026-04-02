# Chapter 2: Claude Code Architecture — The Keystone

---

There is a particular kind of power in knowing exactly how your weapon works.

Not the marketing material. Not the blog post. Not the "Getting Started in 5 Minutes" tutorial that glosses over every decision that matters. The actual architecture. The actual source. The actual data flow from the moment you type a prompt to the moment a tool result streams back into the conversation.

This chapter is that knowledge. We are going to take Claude Code apart — all 1,884 TypeScript files, all 512,000+ lines of source — and lay the pieces out on the table. Nine architectural layers from CLI entry to state persistence. Fifty-two tools. A streaming agent loop that executes tools *as they arrive from the model*, not after. A permission system with an AI classifier making security decisions in real time. A hook system with twenty-seven lifecycle events that let you intercept every meaningful action the system takes.

By the end of this chapter you will understand the architecture well enough to modify it. That is the point. You are not reading this book to *use* Claude Code — you already know how to do that. You are reading this book to *rebuild* it. To fork it, extend it, combine it with other CLIs, and ship multi-agent systems that do things the original designers never imagined.

The keystone in an arch is the wedge-shaped stone at the top that locks everything else in place. Remove it, and the arch collapses. Claude Code's architecture is the keystone of the multi-CLI systems we will build in the rest of this book. Every orchestration pattern in Chapter 5, every swarm protocol in Chapter 7, every production deployment in Chapter 10 — they all assume you understand what happens inside the box.

So let's open the box.

---

## 2.1 The Nine-Layer Stack

Claude Code is not a monolithic application. It is a layered system, and the layers matter because they define where you can intervene, what you can replace, and what you cannot touch without breaking everything downstream.

Here is the stack, from the outermost surface to the deepest internals:

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: ENTRY          cli.tsx, mcp.ts, sdk/      │
│           CLI parsing, session init, fast-path       │
├─────────────────────────────────────────────────────┤
│  Layer 2: QUERY ENGINE   query.ts, QueryEngine.ts   │
│           Streaming agent loop, turn management      │
├─────────────────────────────────────────────────────┤
│  Layer 3: CONTEXT        context.ts, memdir/         │
│           Token counting, compaction, memory          │
├─────────────────────────────────────────────────────┤
│  Layer 4: TOOL SYSTEM    Tool.ts, tools.ts, tools/*  │
│           52 tools, standard interface, dispatch      │
├─────────────────────────────────────────────────────┤
│  Layer 5: PERMISSIONS    useCanUseTool.tsx            │
│           6 modes, deny rules, AI classifier          │
├─────────────────────────────────────────────────────┤
│  Layer 6: HOOKS          utils/hooks/, schemas/       │
│           27 lifecycle events, pre/post tool use      │
├─────────────────────────────────────────────────────┤
│  Layer 7: AGENTS         AgentTool/, coordinator/     │
│           Subagent spawning, multi-turn coordination  │
├─────────────────────────────────────────────────────┤
│  Layer 8: MCP            services/mcp/, mcp.ts        │
│           Model Context Protocol, transport layer     │
├─────────────────────────────────────────────────────┤
│  Layer 9: STATE          state/, AppState, sessions   │
│           Conversation, files, git, persistence       │
└─────────────────────────────────────────────────────┘
```

Each layer depends only on the layers below it. Entry calls the Query Engine. The Query Engine uses the Context system to build prompts and the Tool system to execute actions. The Tool system checks Permissions before executing. Hooks fire at boundaries between layers. Agents are recursive instantiations of the Query Engine with filtered tool sets. MCP extends the tool surface. State persists everything.

This layering is not accidental. It is what makes Claude Code extensible. When you build a specialized CLI for security auditing, you replace tools in Layer 4 and permissions in Layer 5. When you build a multi-agent orchestrator, you extend Layer 7. When you integrate external systems, you plug into Layer 8. The layers isolate your changes from the rest of the system.

Let's walk through each one.

---

## 2.2 Layer 1: Entry — The Four Doors

Claude Code does not have a single entry point. It has four, each serving a different use case. Understanding which door a request enters through determines the entire downstream execution path.

### The CLI Entry (`entrypoints/cli.tsx`)

The primary entry point. When you type `claude` in your terminal, execution starts here. The first thing `cli.tsx` does is *not* load the full application. It performs fast-path dispatch:

```
cli.tsx (fast-path)
  ├─ --version      → print version, exit (0ms)
  ├─ --mcp          → jump to MCP server mode
  ├─ --daemon       → jump to daemon mode
  ├─ --help         → print help, exit
  └─ default        → delegate to main.tsx (full boot)
```

This is a critical performance optimization. The full application — React/Ink TUI, tool registry, hook system, MCP connections — takes hundreds of milliseconds to initialize. Fast-path commands skip all of it. When you build your own CLI, steal this pattern. Never force the user to wait for subsystems they are not going to use.

The boot sequence for the full path is heavily optimized:

```
main() entry
  ├─ profileCheckpoint('main_tsx_entry')
  ├─ PARALLEL: startMdmRawRead() + startKeychainPrefetch()
  │            (overlap with 135ms of imports)
  ├─ setup():
  │   ├─ Node.js ≥18 check
  │   ├─ Unix domain socket server (inter-process comms)
  │   ├─ setCwd() (critical — must happen early)
  │   ├─ FileChanged watcher
  │   └─ Background: memory init, plugin discovery, hook loading
  └─ launchRepl() via dynamic import
      └─ startDeferredPrefetches(): user context, model capabilities
```

Two details matter here. First, **import-time parallelism**: MDM reads and keychain prefetches happen *concurrently* with the 135ms of module imports. This is not a theoretical optimization — it shaves real time off cold starts. Second, **dynamic imports for the TUI**: React and Ink are loaded via `require()` inside `launchRepl()`, not at the top of the file. This keeps them off the critical path for non-interactive modes like `-p` (pipe mode), which skips 52 subcommands and saves ~65ms.

The `--bare` mode gates off approximately 90% of startup. If you are building an embedded agent that does not need the full TUI, this is your escape hatch.

### The MCP Server Entry (`entrypoints/mcp.ts`)

Claude Code can expose itself *as an MCP server*. This means other tools — VS Code extensions, other AI agents, custom orchestrators — can connect to a running Claude Code instance and call its tools programmatically:

```typescript
// entrypoints/mcp.ts (simplified)
export async function startMCPServer(cwd, debug, verbose) {
  const server = new Server({
    name: 'claude/tengu',
    version: MACRO.VERSION,
  })

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = getTools()
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        inputSchema: zodToJsonSchema(tool.inputSchema),
      }))
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = findToolByName(request.params.name)
    return { content: [{ type: 'text', text: await tool.exec(...) }] }
  })

  await server.connect(new StdioServerTransport())
}
```

This is how you build multi-CLI systems without modifying Claude Code's internals. Your orchestrator connects to Claude Code over MCP, calls its tools, reads its responses, and coordinates with other agents that speak the same protocol. We will use this extensively in Chapters 5 and 6.

### The HTTP/WebSocket Server (`server/`)

Direct-connect mode. The `cc://` URL scheme allows remote sessions — you connect to a running Claude Code instance from a browser, a VS Code extension, or another machine entirely. This is the foundation for remote pair programming and the SDK bridges that let Cursor and other editors embed Claude Code.

### The SDK Stub (`entrypoints/agentSdkTypes.ts`)

The programmatic API. Published as `@anthropic-ai/sdk-claude-code`, this npm package lets you control Claude Code from JavaScript:

```typescript
import { claude } from '@anthropic-ai/sdk-claude-code'
const result = await claude({ prompt: 'Fix the auth bug', cwd: '/my/project' })
```

The stub is replaced at build time with the real implementation. For multi-CLI systems, this is how you embed Claude Code as a library inside your orchestrator rather than spawning it as a separate process.

---

## 2.3 Layer 2: The Query Engine — Where Intelligence Lives

This is the heart of the system. Everything else exists to serve the Query Engine. It is the while-true agentic loop that turns a user prompt into a completed task through iterative model inference and tool execution.

Two files own this layer: `QueryEngine.ts` (session lifecycle, state accumulation) and `query.ts` (the actual loop).

### The Session Lifecycle (`QueryEngine.ts`)

`QueryEngine` manages the *session* — the long-lived conversation between user and model. It handles:

- Message accumulation across turns
- Cost tracking and token budget enforcement
- File state snapshots (for `/rewind`)
- Memory injection (from `memdir/`)
- Permission mode management
- Abort/interrupt handling

A single method — `query()` — is the session's turn function. Each time the user submits a prompt, `QueryEngine` calls `query()` with the accumulated messages, the current tool set, the system prompt, and the permission context. When `query()` returns, `QueryEngine` updates its state and waits for the next user input.

### The Agentic Loop (`query.ts`)

This is where the magic happens. The core loop, simplified to its essence:

```
function query(messages, tools, systemPrompt, context):
  while (true):
    1. Check token budget → auto-compact if >80% used
    2. Build API request (system prompt + messages + tool definitions)
    3. Stream response from Anthropic API
    4. WHILE STREAMING:
       ├─ Text chunks → append to assistant message
       ├─ Tool use blocks → hand to StreamingToolExecutor
       └─ StreamingToolExecutor starts execution IMMEDIATELY
    5. After stream completes:
       ├─ Collect all tool results (in order)
       ├─ Fire PostSampling hooks
       └─ Append tool results to messages
    6. Check stop condition:
       ├─ stop_reason == "end_turn" AND no pending tools → EXIT
       ├─ stop_reason == "max_tokens" → auto-continue (up to 3 retries)
       └─ tool results pending → CONTINUE loop
```

The critical innovation is in step 4: **streaming tool execution**. Traditional agent frameworks wait for the complete model response, parse out all tool calls, then execute them. Claude Code does not wait. It executes tools *as they appear in the stream*.

### The StreamingToolExecutor

This component is the performance secret of Claude Code. When the model starts generating a tool call block, the `StreamingToolExecutor` begins executing it before the model has finished generating the rest of its response:

```typescript
class StreamingToolExecutor {
  addTool(block, assistantMessage)    // Called DURING streaming
  getRemainingResults()               // Yields results in order

  // Concurrency strategy:
  // Tools with isConcurrencySafe=true → run in parallel
  // Tools with isConcurrencySafe=false → exclusive access
}
```

Consider what this means for a multi-tool response. The model generates: "Let me read the file, run the tests, and check git status." Three tool calls. In a traditional framework, you wait for the model to finish generating all three, *then* start executing. With streaming execution, `ReadTool` starts running while the model is still generating the `BashTool` call. By the time the third tool call is fully parsed, the first tool may already be done.

The concurrency rules matter:

- **Read-only tools** (`isReadOnly=true`) are always concurrency-safe. `Read`, `Glob`, `Grep` can all run simultaneously.
- **Write tools** get exclusive access. `Edit`, `Write`, `Bash` (when not read-only) are serialized.
- **Maximum concurrency** is controlled by `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` (default: 10).

Results are returned in the *original request order*, regardless of completion order. This ensures deterministic conversation flow — the model sees tool results in the same order it requested them.

### The RCode Perspective: Rust's Engine

The Rust rewrite (RCode) implements the same pattern but leverages Rust's async runtime for true OS-level parallelism. The `Engine` struct in `src/engine/conversation.rs` holds the same components:

```rust
pub struct Engine {
    llm: llm::Client,
    tool_registry: Arc<tools::Registry>,
    orchestrator: ToolOrchestrator,
    permissions: permissions::Engine,
    context: ContextManager,
    sessions: session::Store,
    memory: MemoryBridge,
    hook_manager: HookManager,
    // ...

    messages: Vec<Message>,
    turn_count: usize,
    cancel_token: CancellationToken,
}
```

The `turn()` method follows the same flow — check context budget, stream LLM response, extract tool calls, execute, loop. But the execution model is fundamentally different:

```rust
// RCode: True parallel execution via tokio JoinSet
pub struct ToolOrchestrator {
    config: OrchestratorConfig,  // max_concurrent: 10
}

// Execution strategy:
// 1. Partition tool calls into concurrent-safe and serial batches
// 2. Use tokio::task::JoinSet for parallel execution
// 3. Semaphore caps concurrency
// 4. Per-tool timeout enforcement
// 5. Results returned in original request order
```

TypeScript's concurrency is cooperative — `Promise.all()` interleaves tasks on a single thread. Rust's concurrency is preemptive — `JoinSet` distributes tasks across OS threads via tokio. For I/O-bound tools (file reads, network requests), the difference is negligible. For CPU-bound tools (code analysis, large file processing), Rust wins by a wide margin.

This matters when you build multi-agent systems where dozens of tools execute simultaneously across multiple agent instances. We will return to this comparison in Chapter 4.

---

## 2.4 Layer 3: The Context Engine — Memory and Compression

Every turn of the agentic loop begins with building the API request. The Context Engine assembles the system prompt from multiple sources and manages the token budget that determines how much history the model can see.

### What Gets Injected Every Turn

The system prompt is not a static string. It is assembled fresh for each API call from nine sources, in this order:

```
1. Role-Specific Prefix
   └─ Developer, analyst, or custom role definition

2. Global Cache (static, rarely changes)
   └─ Core capabilities, tool descriptions, behavioral guidelines

3. Org Cache (personalization layer)
   └─ Organization-specific instructions

4. CLAUDE.md Files (project brain)
   ├─ ~/.claude/CLAUDE.md (global)
   ├─ ./.claude/CLAUDE.md (project-level)
   └─ Relative CLAUDE.md files (directory-scoped)

5. Git Context
   ├─ Current branch + default branch
   ├─ git status --short (capped at 2,000 chars)
   └─ Last 5 commits

6. Memory Files
   ├─ Auto-maintained session notes
   ├─ memdir/ (file-based persistent knowledge)
   └─ Semantically filtered relevant memories

7. MCP Instructions
   └─ From connected MCP servers + tool declarations

8. Agent Definitions
   ├─ Built-in agents (explore, task, code-review)
   └─ User-defined agents (from ~/.claude/agents/)

9. Conversation History
   └─ Messages after the last compaction boundary
```

The CLAUDE.md system deserves special attention. It is a *layered* configuration mechanism — global settings in `~/.claude/CLAUDE.md` are overlaid by project-level settings in `./.claude/CLAUDE.md`, which can `@import` path-scoped rules from `.claude/rules/`. This is how the same Claude Code installation behaves differently in a Python project versus a Rust project versus a documentation repository. For multi-CLI systems, this layering is the primary mechanism for specialization.

### Context Window Management: Seven Strategies

The fundamental tension of agentic systems is context window exhaustion. A long conversation with many tool calls generates enormous amounts of text. Claude's context window, even at 200K tokens, fills up. When it does, the model starts losing access to earlier turns — the security findings from ten minutes ago, the file contents it read at the start of the session.

Claude Code has seven compaction strategies to manage this:

| Strategy | Trigger | Mechanism |
|----------|---------|-----------|
| **Auto-Compact** | >80% context used | Forked agent summarizes old messages |
| **Reactive Compact** | Pre-emptive threshold | Compacts before hitting hard limit |
| **Context Collapse** | Feature flag | Folds old messages into summaries |
| **Micro-Compact** | Server-side | Server-side message compression |
| **Snip Compaction** | Selective | Removes specific verbose messages |
| **Manual `/compact`** | User-triggered | On-demand compression |
| **1M Context** | Opt-in `[1m]` | Requests extended context window |

The most important is Auto-Compact. When the context usage exceeds 80%, Claude Code spawns a *forked subagent* — a child agent that shares the parent's prompt cache — to summarize the conversation history. The summary replaces the detailed history, freeing tokens for new turns.

The forked subagent pattern is elegant: because it shares the parent's prompt cache, the summarization API call is dramatically cheaper (cache read tokens vs. cache creation tokens). This is not documented in the README. It is an implementation detail that matters enormously for cost optimization in production multi-agent systems.

---

## 2.5 Layer 4: The Tool System — The 52-Member Interface

This is where Claude Code's power comes from. The model is intelligent; the tools make it capable. Without tools, the model can only generate text. With tools, it can read files, write code, execute commands, search the web, spawn agents, manage tasks, and coordinate teams.

### The Tool Interface

Every tool in Claude Code implements the same interface. This interface has evolved over dozens of iterations into approximately forty members — a surface that is simultaneously flexible enough to handle any tool and constrained enough to enforce safety at every boundary.

Here is the interface, organized by responsibility:

```typescript
Tool<Input, Output, Progress> = {
  // ── Identity ──────────────────────────────────────────────
  name: string                    // Unique tool name
  category: string                // Grouping: file, execution, agent, web, mcp
  description(): string           // Human-readable description for model
  prompt(): string                // Extended instructions included in system prompt
  inputSchema: ZodSchema          // Zod v4 schema for input validation

  // ── Execution ─────────────────────────────────────────────
  call(input, context): Promise<ToolResult>    // The actual execution
  validateInput?(input): Promise<void>         // Pre-execution validation

  // ── Behavior Flags (fail-closed: default false) ───────────
  isEnabled(context): boolean     // Is this tool available in this context?
  isReadOnly(input): boolean      // Does this tool modify state?
  isConcurrencySafe(): boolean    // Can run parallel with other tools?
  isDestructive(input): boolean   // Could cause data loss?
  shouldDefer: boolean            // Lazy-loaded (fetched via ToolSearch)
  alwaysLoad: boolean             // Always include, never defer

  // ── Permissions ───────────────────────────────────────────
  checkPermissions(input, ctx): Promise<PermissionResult>
  toAutoClassifierInput(input): ClassifierInput   // Feed to AI classifier

  // ── Rendering (React/Ink TUI) ─────────────────────────────
  renderToolUseMessage(input): ReactNode
  renderToolResultMessage(result): ReactNode
  renderToolUseProgressMessage(progress): ReactNode
  renderToolUseCompactMessage(input): ReactNode
  renderToolResultCompactMessage(result): ReactNode
  renderToolResultFullOutput(result): ReactNode
  renderAfterToolComplete(result): ReactNode

  // ── MCP/LSP Markers ───────────────────────────────────────
  isMcp: boolean                  // Is this an MCP-bridged tool?
  isLsp: boolean                  // Is this a language server tool?
}
```

Several design decisions deserve attention.

**Fail-closed defaults.** Every boolean flag defaults to the safe value. `isReadOnly` defaults to `false` — tools are assumed to write unless they prove otherwise. `isConcurrencySafe` defaults to `false` — tools are assumed to conflict unless they prove otherwise. `isDestructive` defaults to `false`, but the permission system treats unknown tools with suspicion. This is defense-in-depth applied to tool design.

**Dynamic behavior flags.** `isReadOnly` on `BashTool` is not a static value — it *analyzes the command* to determine read-only status. `ls -la` is read-only. `rm -rf /` is not. This dynamic classification feeds into the concurrency scheduler and the permission system simultaneously.

**Separation of rendering.** Seven render methods might seem excessive, but they serve distinct purposes: compact view vs. full view, in-progress vs. complete, tool call vs. tool result. For multi-CLI systems, these render methods are what you replace when building a non-terminal interface (web dashboard, IDE panel, API response).

### The Tool Assembly Pipeline

Tools are not simply listed in an array. They pass through a four-stage pipeline that filters, merges, and sorts them before the model sees them:

```
getAllBaseTools()
  │  All tools available in this environment
  ▼
getTools(permissionContext)
  │  Filter by deny rules + isEnabled()
  ▼
assembleToolPool(permissionContext, mcpConnections)
  │  Merge built-in tools with MCP tools
  │  Sort for prompt cache stability
  ▼
filterToolsByDenyRules()
  │  Final strip: denied tools never reach the model
  ▼
[Tool definitions sent to API]
```

The sorting step is subtle but important: tools are sorted in a stable order so that the tool definition section of the API request is identical across turns. This preserves the **prompt cache** — Anthropic's API caches the prefix of the request, and if the prefix is identical to the previous request, you pay cache-read prices instead of cache-creation prices. A naive implementation that orders tools differently each turn would invalidate the cache and cost 5-10x more per API call.

### The Complete Tool Catalog

Fifty-two tools, organized by category:

| Category | Tools | Key Capabilities |
|----------|-------|-----------------|
| **File & Shell** | `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, `NotebookEdit` | Full filesystem access with read/write separation |
| **Agent & Planning** | `Agent`, `EnterPlanMode`, `ExitPlanMode`, `TaskOutput` | Subagent spawning, read-only exploration mode |
| **Task Management** | `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `TaskStop` | Session-scoped task tracking with dependencies |
| **Team/Swarm** | `TeamCreate`, `TeamDelete`, `SendMessage` | Multi-agent team creation and inter-agent messaging |
| **Web & Search** | `WebFetch`, `WebSearch`, `ToolSearch` | Internet access with caching, deferred tool discovery |
| **MCP Integration** | `MCPTool`, `ListMcpResources`, `ReadMcpResource`, `McpAuth` | Bridge to any MCP server |
| **Code Intelligence** | `LSP` | 9 LSP operations: goToDefinition, findReferences, hover, etc. |
| **Scheduling** | `CronCreate`, `CronDelete`, `CronList` | Scheduled tasks with 5-field cron, max 50 jobs |
| **Metadata** | `StructuredOutput`, `Skill`, `Config`, `Brief` | JSON schema output, skill execution, settings |

### Tool Execution Pipeline

When the model requests a tool call, execution follows this pipeline:

```
Model generates tool_use block
  │
  ▼
StreamingToolExecutor.addTool(block)
  │
  ▼
Permission Check
  ├─ Deny rules (first-match, glob patterns)
  ├─ validateInput() (tool-specific)
  ├─ checkPermissions() (tool-specific logic)
  ├─ Permission mode dispatch:
  │   ├─ bypassPermissions → allow
  │   ├─ plan → allow only if isReadOnly
  │   ├─ auto → run AI classifier
  │   └─ default → ask user
  └─ Pre-hooks (can block/modify)
  │
  ▼
Tool Execution (call())
  │
  ▼
Post-hooks (can modify output)
  │
  ▼
Telemetry + Cost Tracking
  │
  ▼
Result → back to agentic loop
```

This pipeline fires for *every* tool call, including MCP tools. There are no shortcuts, no backdoors. A tool added via MCP goes through the same permission checks, the same hooks, the same telemetry as a built-in tool. This uniformity is what makes the system trustworthy.

---

## 2.6 Layer 5: The Permission System — Six Modes of Trust

The permission system is where safety engineering meets usability engineering. Every tool call in Claude Code passes through a permission gate. The question is always the same: should this action be allowed, denied, or escalated to the user?

The answer depends on which of six permission modes is active:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `default` | Ask user for dangerous operations | Interactive development |
| `plan` | Read-only — no writes, no execution | Exploration and analysis |
| `acceptEdits` | Auto-approve file edits only | Supervised coding |
| `auto` | AI classifier decides | Autonomous operation |
| `bypassPermissions` | Approve everything (YOLO mode) | Trusted environments |
| `dontAsk` | Never ask, auto-deny unknown | CI/CD pipelines |

The evaluation order matters. It is a cascade, and the first definitive answer wins:

```
Tool request arrives
  │
  ▼
1. Config deny rules → match? → DENY (hard block, no override)
  │
  ▼
2. validateInput() → invalid? → DENY (tool-specific validation)
  │
  ▼
3. checkPermissions() → tool-specific logic → ALLOW/DENY/CONTINUE
  │
  ▼
4. Permission mode dispatch:
  ├─ bypassPermissions → ALLOW (everything)
  ├─ plan → isReadOnly? → ALLOW, else DENY
  ├─ acceptEdits → isFileEdit? → ALLOW, else ASK
  ├─ dontAsk → DENY (everything unrecognized)
  ├─ auto → run AI classifier (see below)
  └─ default → ASK user
  │
  ▼
5. PreToolUse hooks → can override any decision
```

### Deny Rules: The First Line of Defense

Deny rules are glob patterns in `.claude/settings.json` that block tools before any other logic runs:

```json
{
  "permissions": {
    "allow": [
      "Bash(git *)",
      "Bash(npm test *)",
      "Bash(python -m pytest *)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./secrets/*)",
      "Bash(rm -rf *)",
      "Bash(curl * | sh)"
    ]
  }
}
```

First match wins. If a tool call matches a deny pattern, it is blocked immediately — no classifier, no user prompt, no hooks. This is the fast path for known-bad operations. For multi-CLI systems, deny rules are your coarsest-grained security control.

### The AI Classifier: Auto Mode

This is Claude Code's most innovative permission feature. When `auto` mode is active, tool calls that do not match explicit allow/deny rules are evaluated by a two-stage AI classifier:

**Stage 1: Fast Check (Pattern Matching)**
- Is it `rm -rf /`? → Deny immediately.
- Is it a `git diff`? → Allow immediately.
- Is it path traversal? → Deny.
- Is it a known-safe read operation? → Allow.

**Stage 2: Thinking Check (Model Inference)**
If the fast check is uncertain, the classifier runs a *separate model inference* to evaluate the tool call in context. This inference gets:
- The tool name and description
- The input parameters (sanitized)
- Whether the tool is flagged as destructive
- File paths, commands, and output destinations
- The `toAutoClassifierInput()` from the tool itself

The classifier returns allow, deny, or "ask the user." It is conservative by design — uncertain inputs escalate to the user rather than defaulting to allow.

**Bash-Specific Classification** (`bashPermissions.ts`) deserves special mention. Bash commands are the most dangerous tools in the system — they can do literally anything. The Bash classifier:
- Parses the command into constituent operations
- Checks for path traversal (`../../../etc/passwd`)
- Evaluates destructiveness (`rm`, `chmod`, `mkfs`)
- Validates sed/awk patterns for injection
- Tracks denial history (three consecutive denials → auto-deny for session)

### The RCode Permission Model

The Rust rewrite mirrors this architecture with a strongly typed permission engine:

```rust
pub enum PermissionMode {
    AllowAll,       // No prompts (YOLO)
    Default,        // Sensible defaults
    Plan,           // Read-only
    DenyAll,        // Everything denied
    AskAlways,      // Prompt for everything
    Auto,           // ML-based classifier
    Custom,         // Project settings driven
}

pub enum PermissionDecision {
    Allow,              // Proceed
    Deny(String),       // Blocked + reason
    Ask(String),        // User confirmation needed
}
```

RCode adds two modes not present in Claude Code: `DenyAll` (hard lockdown) and `Custom` (fully project-settings-driven). The permission pipeline follows the same cascade but uses Rust's pattern matching for the dispatch:

```rust
pub fn decide(&self, tool_name: &str, input: &Value, is_headless: bool)
    -> PermissionDecision
{
    // Headless sub-agents auto-allow (they inherit parent's permission grant)
    if is_headless { return PermissionDecision::Allow; }

    // Bash security gate — hard-block catastrophic commands
    if tool_name == "bash" {
        if let Some(denial) = self.bash_security.check(input) {
            return PermissionDecision::Deny(denial);
        }
    }

    // Mode dispatch
    match self.mode {
        PermissionMode::AllowAll => PermissionDecision::Allow,
        PermissionMode::DenyAll => PermissionDecision::Deny("locked".into()),
        PermissionMode::Plan => {
            if self.is_read_only(tool_name, input) {
                PermissionDecision::Allow
            } else {
                PermissionDecision::Deny("plan mode: read-only".into())
            }
        }
        PermissionMode::Default => self.default_pipeline(tool_name, input),
        PermissionMode::Auto => self.auto_classify(tool_name, input),
        // ...
    }
}
```

The type safety is instructive. In TypeScript, a permission decision is typically a string or an object with optional fields — it is possible to construct invalid states at runtime. In Rust, `PermissionDecision` is an enum — the compiler guarantees you handle all three cases, and the `Deny` variant *must* include a reason string. You cannot forget to provide a denial explanation. For safety-critical systems, this matters.

---

## 2.7 Layer 6: The Hook System — 27 Interception Points

Hooks are the mechanism that transforms Claude Code from a fixed tool into a customizable platform. Every significant action in the system fires a lifecycle event. External scripts can intercept these events to approve, block, modify, or log operations.

### The 27 Lifecycle Events

| Event | When It Fires | Can Block? |
|-------|---------------|------------|
| `PreToolUse` | Before tool execution | Yes — approve or block |
| `PostToolUse` | After successful execution | Can modify output |
| `PostToolUseFailure` | After failed execution | Informational only |
| `UserPromptSubmit` | User sends a message | Can intercept/modify |
| `SessionStart` | Session initializes | Setup watches, init state |
| `SessionEnd` | Session terminates | Cleanup |
| `Setup` | Initial environment setup | Early configuration |
| `SubagentStart` | Subagent spawns | Control subagent creation |
| `SubagentStop` | Subagent terminates | Cleanup |
| `PermissionDenied` | Permission blocked | Log violations |
| `PermissionRequest` | Permission dialog shown | Custom decision logic |
| `Notification` | Event notification emitted | Custom handling |
| `Elicitation` | OAuth/URL elicitation | Handle authentication |
| `CwdChanged` | Working directory changes | React to navigation |
| `FileChanged` | Watched file modified | Trigger rebuilds/tests |
| `WorktreeCreate` | Git worktree created | Post-create setup |
| `Stop` | Turn completes | Block continuation |
| `TaskCompleted` | Teammate task finishes | Control multi-agent flow |

### The Hook Protocol

Hooks are external scripts — shell scripts, Python scripts, any executable — that communicate with Claude Code via JSON over stdout/stderr:

**Input** (passed to hook script as stdin JSON):
```json
{
  "event": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf node_modules" },
  "session_id": "abc-123",
  "working_directory": "/path/to/project",
  "timestamp": "2026-01-15T10:30:00Z"
}
```

**Output** (hook script writes to stdout):
```json
{
  "continue": true,
  "decision": "approve",
  "reason": "node_modules is safe to delete",
  "suppressOutput": false,
  "systemMessage": "Proceeding with cleanup."
}
```

**Exit codes** determine the action:
- `0` → Allow (continue execution)
- `2` → Block (abort the tool call)
- Any other → Warning (log and continue)

**Blocking hooks** — `PreToolUse` and `UserPromptSubmit` — can return a `decision` of `"block"` with a `reason` that gets displayed to the model. The model sees the block reason and can adapt its strategy. This is how you build domain-specific guardrails without modifying Claude Code's source.

### Hook Configuration

Hooks are wired in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "command": ".claude/hooks/session-setup.sh" }
    ],
    "PreToolUse": [
      { "command": ".claude/hooks/block-destructive.sh" },
      { "command": ".claude/hooks/secret-scan.sh" }
    ],
    "PostToolUse": [
      { "command": ".claude/hooks/auto-lint.sh" }
    ],
    "FileChanged": [
      { "command": ".claude/hooks/rebuild.sh" }
    ],
    "Stop": [
      { "command": ".claude/hooks/teardown.sh" }
    ]
  }
}
```

Multiple hooks per event execute in order. Execution is subject to timeouts (default 10 seconds, configurable via `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`). Hooks can also set environment variables by writing to `CLAUDE_ENV_FILE` — these variables persist for the next turn.

### Hooks as Enterprise Control Plane

For multi-CLI systems in enterprise environments, hooks are the control plane. Consider these patterns:

**Audit logging** — A `PostToolUse` hook sends every tool invocation to your SIEM:
```bash
#!/bin/bash
# .claude/hooks/audit-log.sh
echo "$HOOK_INPUT" | curl -s -X POST \
  -H "Content-Type: application/json" \
  -d @- https://audit.company.com/claude-events
echo '{"continue": true}'
```

**Secret scanning** — A `PreToolUse` hook checks for secrets before any write operation:
```bash
#!/bin/bash
# .claude/hooks/secret-scan.sh
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
if [ "$TOOL" = "Write" ] || [ "$TOOL" = "Edit" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string')
  if echo "$CONTENT" | grep -qE '(AKIA|sk-|ghp_|-----BEGIN)'; then
    echo '{"decision":"block","reason":"Secret detected in output"}'
    exit 2
  fi
fi
echo '{"continue": true}'
```

**Auto-lint** — A `PostToolUse` hook runs the linter after every file edit:
```bash
#!/bin/bash
# .claude/hooks/auto-lint.sh
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
if [ "$TOOL" = "Edit" ] || [ "$TOOL" = "Write" ]; then
  FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path')
  npx eslint --fix "$FILE" 2>/dev/null
fi
echo '{"continue": true}'
```

These hooks compose. In a multi-CLI system, you might have the orchestrator's hooks running alongside each agent's project-level hooks, creating a layered security and quality enforcement system.

---

## 2.8 Layer 7: The Agent System — Recursive Intelligence

This is where Claude Code becomes a multi-agent system. The Agent tool spawns child agents — separate instances of the Query Engine with their own conversation history, filtered tool sets, and permission boundaries.

### Four Types of Agents

**1. Sub-agents (default)** — The workhorse. Spawned with the `Agent` tool. Gets a subset of the parent's tools (no recursion — sub-agents cannot spawn sub-agents, unless the user is an Anthropic internal). Runs in the same process, separate conversation.

```typescript
// Agent tool parameters
{
  description: "3-5 word summary",
  prompt: "Full task instructions",
  subagent_type: "analyzer" | "debugger" | "researcher",
  model: "sonnet" | "opus" | "haiku",
  run_in_background: boolean,
  name: "agent-name",       // For SendMessage addressing
  team_name: "team-name",   // For team membership
  mode: PermissionMode,
  isolation: "worktree" | "remote",
  cwd: "/custom/path"
}
```

**2. Forked Agents** — Clone the parent's context. Critical detail: they **share the parent's prompt cache**. This means the forked agent's first API call costs cache-read prices, not cache-creation prices. Used for compaction (summarize conversation), introspection (analyze own behavior), and memory extraction.

**3. Teammates (Swarm Mode)** — Persistent agents in the same process that communicate via `SendMessage`. Each teammate has a name, a role, and a mailbox. Tasks flow between them via `TaskCreate` and `TaskUpdate`. This is Claude Code's built-in multi-agent coordination.

**4. Coordinator Mode** — A feature flag (`CLAUDE_CODE_COORDINATOR_MODE=true`) that restricts the main agent to coordination-only tools: `Agent`, `TaskStop`, `SendMessage`, `SyntheticOutput`. The coordinator cannot read files, write code, or execute commands. It can only delegate to specialists. This is the pattern for building manager agents that orchestrate without doing direct work.

### Subagent Tool Filtering

Security in the agent system is enforced by *tool filtering*. Sub-agents do not get the full tool set:

**Disallowed for sub-agents:**
- `TaskOutput` — Only the parent can produce final output
- `ExitPlanMode`, `EnterPlanMode` — Only the parent controls mode
- `Agent` — No recursive agent spawning (prevents infinite loops)
- `TaskStop` — Only the parent can stop tasks

**Allowed for sub-agents:**
- All file tools: `Read`, `Edit`, `Write`, `Glob`, `Grep`
- Execution: `Bash`, `PowerShell`
- Web: `WebFetch`, `WebSearch`
- Skills: `Skill`, `NotebookEdit`

**Background agents get additional tools:**
- `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate` — Can manage tasks
- `SendMessage` — Can communicate with teammates
- `Cron` tools — Can schedule recurring work

This filtering is the security boundary that prevents agent runaway. A sub-agent cannot spawn more agents, cannot produce its own output (bypassing the parent's oversight), and cannot change the session's permission mode. It operates within a sandbox defined by the parent.

### The RCode Swarm Architecture

RCode takes the multi-agent concept further with a full swarm framework:

```rust
pub struct SwarmManager {
    task_decomposer: TaskDecomposer,     // Break tasks into subtasks
    agent_assigner: AgentAssigner,       // Assign roles to subtasks
    result_aggregator: ResultAggregator, // Collect and merge results
    conflict_resolver: ConflictResolver, // Detect file-level conflicts
}

pub enum AgentRole {
    Coder,        // Weight: 3 (heavy workload)
    Reviewer,     // Weight: 2
    Researcher,   // Weight: 2
    Tester,       // Weight: 2
    Planner,      // Weight: 1 (light workload)
    Architect,    // Weight: 1
    Writer,       // Weight: 2
    Custom(String),
}
```

The role weights determine concurrency. A `Coder` agent consumes 3 units of the concurrency budget; a `Planner` consumes 1. This prevents the system from spawning ten Coder agents simultaneously and overwhelming the filesystem with concurrent edits.

RCode also implements four execution modes for the coordinator:

| Mode | Strategy |
|------|----------|
| `Sequential` | One step after another |
| `Parallel` | All steps concurrently (using tokio JoinSet) |
| `Pipeline` | Streaming results between stages |
| `MapReduce` | Map phase distributes, reduce phase aggregates |

The `MapReduce` mode is particularly powerful for multi-CLI systems. You distribute a large task (audit 50 files for security vulnerabilities) across multiple agents (map), then aggregate their findings into a single report (reduce). We will implement this pattern in Chapter 7.

---

## 2.9 Layer 8: The MCP System — Universal Tool Protocol

The Model Context Protocol is what makes multi-CLI systems possible without tight coupling. MCP defines a standard way for tools to expose their capabilities to AI agents. Claude Code implements both sides: it *is* an MCP server (other tools can call it) and it *has* an MCP client (it can call other tools).

### MCP Client: Connecting to External Servers

The MCP client (`services/mcp/`) manages connections to external MCP servers. Each connection goes through:

1. **Server discovery** — Configuration in `.claude/settings.json` or `mcp-config.json`
2. **Process spawn** — Start the MCP server as a child process (stdio transport)
3. **Protocol handshake** — `initialize` → `notifications/initialized`
4. **Tool discovery** — `list_tools` → get available tools and schemas
5. **Ongoing use** — `call_tool` → execute tools on demand

```typescript
// services/mcp/client.ts (simplified)
class MCPConnectionManager {
  async connectServer(config: MCPServerConfig) {
    const client = new Client({ name: 'claude-code' })

    const transport =
      config.type === 'stdio' ? new StdioClientTransport(config)
      : config.type === 'sse' ? new SSEClientTransport(config)
      : new StreamableHTTPClientTransport(config)

    await client.connect(transport)

    const { tools } = await client.listTools()
    return tools
  }
}
```

Three transport types are supported:

| Transport | Use Case | Performance |
|-----------|----------|------------|
| **stdio** | Local MCP servers (same machine) | Lowest latency |
| **SSE** | Remote servers (Server-Sent Events) | Medium latency |
| **StreamableHTTP** | HTTP-based remote servers | Highest compatibility |

### MCP Tool Integration

When an MCP server reports its tools, Claude Code wraps each one in an `MCPTool` adapter:

```typescript
MCPTool {
  isMcp: true,
  name: `mcp__{server}__{tool}`,   // Namespaced naming convention
  call: proxy to MCP server,
  inputSchema: passthrough from server,
  shouldDefer: true                 // Lazy-loaded on demand
}
```

The naming convention — `mcp__{server}__{tool}` — prevents collisions between tools from different servers. A `search` tool from a GitHub MCP server becomes `mcp__github__search`; a `search` tool from a Jira MCP server becomes `mcp__jira__search`.

MCP tools pass through the *same* permission pipeline as built-in tools. Deny rules apply. Hooks fire. The AI classifier evaluates them. There is no trust escalation for MCP tools — they are treated as untrusted extensions by default.

### The RCode MCP Client

The Rust implementation provides a more explicit connection model:

```rust
pub struct McpConnection {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    reader: Mutex<BufReader<ChildStdout>>,
    next_id: AtomicU64,
    server_name: String,
    tools: Vec<McpToolDef>,
    resources: Vec<McpResource>,
}

// Protocol constants
const PROTOCOL_VERSION: &str = "2024-11-05";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const INIT_TIMEOUT: Duration = Duration::from_secs(10);
const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
```

RCode adds connection health monitoring — periodic health checks detect crashed or stalled MCP servers and restart them automatically. The `McpManager` provides unified tool discovery across all connected servers, with request routing by tool name and connection pooling.

For multi-CLI systems, MCP is the lingua franca. Your security agent speaks MCP. Your performance profiler speaks MCP. Your deployment tool speaks MCP. The orchestrator connects to all of them, discovers their tools, and routes work to the right agent. Chapter 6 builds this architecture end to end.

---

## 2.10 Layer 9: State Management — The Memory of the Machine

The final layer persists everything. Without state management, every session is amnesiac — no memory of past conversations, no record of file changes, no cost tracking. Layer 9 provides the substrate that makes Claude Code a *continuous* system rather than a stateless inference endpoint.

### The AppState Store

Claude Code uses a custom pub/sub store with approximately 400 fields. It is *not* Redux. It is a lightweight reactive store that supports React binding via `useSyncExternalStore`:

```
AppState (~400 fields)
├─ Session
│   ├─ sessionId, conversationId
│   ├─ messages (full conversation history)
│   ├─ totalCostUSD, tokenUsage
│   └─ permissionMode, denialTracking
├─ Tools
│   ├─ registeredTools, mcpTools
│   ├─ deferredTools, activeToolCalls
│   └─ toolStatistics (invocation counts, durations)
├─ Agents
│   ├─ activeSubagents, teammateStates
│   ├─ taskList, taskDependencies
│   └─ coordinatorMode, swarmConfig
├─ Context
│   ├─ systemPrompt (assembled)
│   ├─ claudeMdContent, memoryFiles
│   └─ gitBranch, gitStatus
├─ UI
│   ├─ inputBuffer, outputHistory
│   ├─ scrollPosition, terminalSize
│   └─ themeConfig, voiceState
└─ Infrastructure
    ├─ featureFlags (88+)
    ├─ mcpConnections, hookStates
    └─ abortController, fileStateCache
```

State changes trigger side effects: sync to SDK consumers, persist session metadata to disk, update the React TUI, fire hook events. The store is the nervous system that connects all nine layers.

### Session Persistence

Sessions are persisted to disk for two purposes: resumption (`/resume` command) and analytics (usage tracking, cost reporting).

The persistence format stores:
- Full message history (including compacted boundaries)
- Token usage and cost breakdown by model
- Tool invocation counts and durations
- File state snapshots (for `/rewind`)
- Active agent states and task lists

Session storage is built on SQLite in both implementations. TypeScript uses a custom wrapper; Rust uses `rusqlite` with WAL mode for concurrent read access.

### File State Cache

The `FileStateCache` tracks the state of every file Claude Code has read or written during a session. This serves two purposes:

1. **Conflict detection** — If a file changes on disk between when Claude Code read it and when it tries to write back, the cache detects the conflict and prompts the user.
2. **History tracking** — The `/rewind` command uses cached file states to restore files to any previous point in the session.

This is critical for multi-agent systems where multiple agents might operate on overlapping file sets. Without file state tracking, concurrent agents could silently overwrite each other's changes.

---

## 2.11 Anatomy of a Prompt: The Complete Journey

Let's trace a single prompt through all nine layers. You type this into Claude Code:

```
> Fix the race condition in src/workers/queue.ts
```

Here is what happens, layer by layer, with actual source file references.

### Entry (Layer 1)
- `cli.tsx` has already booted the full application
- The Ink TUI captures your input via `useTextInput` hook
- Your text lands in `QueryEngine.ts` as a new user message

### Query Engine (Layer 2)
- `QueryEngine` calls `query()` in `query.ts`
- The while-true loop begins its first iteration
- Check: is auto-compact needed? (compare token usage vs. 80% threshold)
- If yes, spawn forked compaction agent first

### Context Assembly (Layer 3)
- `context.ts::getSystemContext()` builds the system prompt:
  - Load `CLAUDE.md` files (global + project)
  - Inject `@import` rules that match paths containing `src/workers/`
  - Fetch git context: branch name, recent commits, status
  - Load memory files from `memdir/`
  - Include MCP server instructions
  - Include agent definitions
- `context.ts::getUserContext()` prepares user-facing context
- Messages are normalized via `normalizeMessagesForAPI()`
- All of this is assembled into the API request

### API Call and Streaming (Layer 2, continued)
- `services/api/claude.ts` sends the request to Anthropic's API
- Content-hash temp files preserve prompt cache across turns
- Response streams back token by token
- As text chunks arrive → appended to assistant message

### Tool Dispatch (Layer 4)
- The model generates a tool call: `Read(file_path="src/workers/queue.ts")`
- `StreamingToolExecutor.addTool()` picks it up *during streaming*
- The tool is looked up in the registry via `findToolByName()`

### Permission Check (Layer 5)
- `Read` tool: `isReadOnly=true` → fast-path through permissions
- No deny rules match
- In `default` mode, read-only tools are auto-approved

### Hook Execution (Layer 6)
- `PreToolUse` hooks fire:
  - `secret-scan.sh` checks input (file path only, no secrets) → continue
- Tool executes: reads `src/workers/queue.ts`, returns contents
- `PostToolUse` hooks fire:
  - `audit-log.sh` logs the read operation → continue

### Back to the Loop (Layer 2)
- Tool result appended to messages
- Model continues generating (stream not done yet)
- Model generates: `Edit(file_path="src/workers/queue.ts", old_string="...", new_string="...")`
- `StreamingToolExecutor.addTool()` picks this up

### Permission Check Again (Layer 5)
- `Edit` tool: `isReadOnly=false`, `isDestructive=false`
- In `default` mode → ASK user
- TUI presents: "Claude wants to edit src/workers/queue.ts — Allow? (y/n)"
- User presses `y`
- Permission granted for this specific edit

### Hook, Execute, Hook (Layers 6, 4, 6)
- `PreToolUse` hooks: `secret-scan.sh` checks new_string for secrets → clean
- Edit tool executes: applies the diff to `src/workers/queue.ts`
- `PostToolUse` hooks: `auto-lint.sh` runs linter on changed file → clean

### Model Generates More Tool Calls
- `Bash(command="npm test -- --grep 'queue'")`
- Permission check: Bash with npm test matches allow rule `Bash(npm test *)` → auto-approved
- Hooks fire, command executes, results captured
- Tests pass → model sees the passing output

### Stop Condition (Layer 2)
- Model returns `stop_reason: "end_turn"` with no pending tool calls
- Loop exits
- `PostSampling` hooks fire (memory extraction, prompt suggestion)

### State Persistence (Layer 9)
- Messages updated in AppState
- Cost tracked: input tokens, output tokens, cache read/creation
- File state cache updated for `src/workers/queue.ts`
- Tool statistics incremented
- Session metadata persisted to disk

The entire journey — from "Fix the race condition" to "Tests pass, here's what I changed" — is nine layers deep, touching every subsystem. Understanding this flow is what separates someone who *uses* Claude Code from someone who can *extend* it.

---

## 2.12 TypeScript vs. Rust: A Side-by-Side Comparison

You have seen fragments of both implementations throughout this chapter. Let's make the comparison explicit across three critical components.

### Component 1: The Tool Interface

**TypeScript (Claude Code — `Tool.ts`)**
```typescript
Tool<Input, Output, Progress> = {
  name: string
  inputSchema: ZodSchema
  call(input, context): Promise<ToolResult>
  isReadOnly(input): boolean
  isConcurrencySafe(): boolean
  isDestructive(input): boolean
  description(): string
  prompt(): string
  checkPermissions(input, ctx): Promise<PermissionResult>

  // 7 rendering methods
  renderToolUseMessage(input): ReactNode
  renderToolResultMessage(result): ReactNode
  // ... 5 more
}
```

**Rust (RCode — `tools/mod.rs`)**
```rust
#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn input_schema(&self) -> Value;
    async fn run(&self, input: Value, ctx: &ToolContext) -> Result<ToolResult>;

    fn timeout(&self) -> Duration { Duration::from_secs(120) }
    fn is_concurrency_safe(&self, _: &Value) -> bool { true }
    fn is_read_only(&self, _: &Value) -> bool { false }
    fn is_destructive(&self, _: &Value) -> bool { false }
    fn max_result_size(&self) -> usize { 100_000 }
    fn activity_description(&self, _: &Value) -> String;
}
```

**Key Differences:**
- TypeScript uses a *structural interface* with ~40 optional methods. Any object with the right shape is a tool.
- Rust uses a *trait* with required + default methods. The `Send + Sync` bound enforces thread safety at compile time.
- TypeScript tools own their rendering logic (7 React methods). Rust tools produce data; the TUI (ratatui) renders them separately.
- Rust adds `timeout()` and `max_result_size()` as first-class methods — in TypeScript, these are handled by the executor.
- Rust's `is_concurrency_safe` takes `&Value` — the decision can depend on the specific input, not just the tool type.

**Implications for multi-CLI:** If you are building a tool library shared across multiple CLIs, the Rust trait is more portable — no rendering coupling. The TypeScript interface is more self-contained — each tool brings its own UI.

### Component 2: Parallel Tool Execution

**TypeScript (Claude Code — `StreamingToolExecutor`)**
```typescript
class StreamingToolExecutor {
  private queue: ToolCall[] = []
  private running = new Map<string, Promise<ToolResult>>()
  private semaphore: Semaphore  // max 10 concurrent

  addTool(block, assistantMessage) {
    if (this.isConcurrencySafe(block)) {
      // Start immediately, parallel with other tools
      this.running.set(block.id, this.execute(block))
    } else {
      // Wait for all running tools to finish, then execute alone
      this.queue.push(block)
    }
  }

  async *getRemainingResults() {
    // Yield results in original request order
    for (const id of this.requestOrder) {
      yield await this.running.get(id)
    }
  }
}
```

**Rust (RCode — `tools/orchestration.rs`)**
```rust
impl ToolOrchestrator {
    pub async fn execute_batch(
        &self,
        calls: Vec<ToolCall>,
        registry: &Registry,
        ctx: &ToolContext,
    ) -> Vec<ToolCallResult> {
        // Partition into concurrent-safe and serial
        let (concurrent, serial) = self.partition(calls, registry);

        // Execute concurrent batch with JoinSet + Semaphore
        let mut set = JoinSet::new();
        let sem = Arc::new(Semaphore::new(self.config.max_concurrent));
        for call in concurrent {
            let permit = sem.clone().acquire_owned().await.unwrap();
            let tool = registry.get(&call.name).clone();
            set.spawn(async move {
                let result = tokio::time::timeout(
                    tool.timeout(),
                    tool.run(call.input, &ctx)
                ).await;
                drop(permit);
                (call.id, result)
            });
        }

        // Collect results, then execute serial tools
        let mut results = self.collect_ordered(&mut set).await;
        for call in serial {
            results.push(self.execute_single(call, registry, ctx).await);
        }
        results
    }
}
```

**Key Differences:**
- TypeScript uses `Promise.all()` on a single thread — cooperative multitasking. I/O operations (file reads, network calls) interleave efficiently, but CPU-bound work blocks the event loop.
- Rust uses `tokio::task::JoinSet` — true parallel execution across OS threads. CPU-bound tools (code analysis, file hashing) run genuinely in parallel.
- Both use semaphores for concurrency limits (default: 10).
- Rust adds per-tool timeouts via `tokio::time::timeout` — a tool that hangs gets killed after its timeout without affecting other tools.

**Implications for multi-CLI:** For I/O-heavy agent workloads (reading files, calling APIs), the performance difference is negligible. For compute-heavy workloads (analyzing large codebases, running security scanners), Rust's parallelism provides measurable speedup. Chapter 4 benchmarks this.

### Component 3: The Agent System

**TypeScript (Claude Code — Coordinator Mode)**
```
Coordinator Mode:
├─ Main agent restricted to: Agent, TaskStop, SendMessage, SyntheticOutput
├─ Workers spawned via Agent tool
├─ Communication via SendMessage (name-addressed)
├─ Tasks tracked via TaskCreate/TaskUpdate
└─ Feature flag: CLAUDE_CODE_COORDINATOR_MODE=true
```

**Rust (RCode — SwarmManager)**
```
SwarmManager:
├─ TaskDecomposer → break task into SubTasks with dependencies
├─ AgentAssigner → match SubTasks to AgentRoles (weighted)
├─ Four execution modes:
│   ├─ Sequential (pipeline)
│   ├─ Parallel (JoinSet)
│   ├─ Pipeline (streaming)
│   └─ MapReduce (distribute + aggregate)
├─ ConflictResolver → detect overlapping file edits
└─ Each agent in separate git worktree (true isolation)
```

**Key Differences:**
- TypeScript's coordinator is a *restriction mode* — it limits the main agent's tools to force delegation.
- Rust's SwarmManager is an *orchestration engine* — it actively decomposes tasks, assigns roles, and resolves conflicts.
- TypeScript agents communicate via `SendMessage` (fire-and-forget). Rust agents communicate through the `ResultAggregator` (structured collection).
- Rust implements `ConflictResolver` — when two agents edit the same file, the system detects the conflict before merging. TypeScript does not have this; conflicts are caught at git merge time.

**Implications for multi-CLI:** TypeScript's approach is simpler and works well for 2-5 agents. Rust's approach scales to 10+ agents with task decomposition and conflict detection. Choose based on your swarm size.

---

## 2.13 The 20 Key Source Files

Here is the reference table of the twenty source files you will encounter most often when building on or extending Claude Code. Bookmark this page.

| # | File | Layer | Purpose |
|---|------|-------|---------|
| 1 | `entrypoints/cli.tsx` | Entry | CLI dispatch, fast-path routing, boot sequence |
| 2 | `main.tsx` | Entry | Full application bootstrap, React/Ink TUI initialization |
| 3 | `entrypoints/mcp.ts` | Entry | MCP server mode — expose Claude Code's tools over MCP |
| 4 | `query.ts` | Query Engine | The while-true agentic loop — core intelligence loop |
| 5 | `QueryEngine.ts` | Query Engine | Session lifecycle, message accumulation, cost tracking |
| 6 | `context.ts` | Context | System prompt assembly, git context, CLAUDE.md loading |
| 7 | `memdir/memdir.ts` | Context | Memory directory management, persistent knowledge |
| 8 | `services/compact/` | Context | 7 compaction strategies, token budget management |
| 9 | `Tool.ts` | Tools | Tool interface definition (~40 methods) |
| 10 | `tools.ts` | Tools | Tool registry, assembly pipeline, feature-gated loading |
| 11 | `tools/BashTool/` | Tools | Shell execution, command analysis, security classification |
| 12 | `tools/AgentTool/` | Agents | Sub-agent spawning, tool filtering, isolation |
| 13 | `hooks/useCanUseTool.tsx` | Permissions | Permission evaluation, mode dispatch, deny rules |
| 14 | `utils/permissions/` | Permissions | AI classifier, bash security, denial tracking |
| 15 | `utils/hooks/` | Hooks | Hook execution engine, lifecycle event dispatch |
| 16 | `schemas/hooks.ts` | Hooks | Hook event schemas, JSON protocol definitions |
| 17 | `coordinator/` | Agents | Coordinator mode, swarm coordination |
| 18 | `services/mcp/` | MCP | MCP client, transport layer, server management |
| 19 | `state/AppState.ts` | State | Application state store (~400 fields), pub/sub |
| 20 | `services/api/claude.ts` | Query Engine | Anthropic API client, streaming, retries, caching |

For the Rust (RCode) implementation, the equivalent files are:

| # | File | Purpose |
|---|------|---------|
| 1 | `src/engine/conversation.rs` | Engine struct + agentic loop |
| 2 | `src/engine/context.rs` | Context manager, system prompt |
| 3 | `src/engine/compaction.rs` | Context window compression |
| 4 | `src/tools/mod.rs` | Tool trait definition |
| 5 | `src/tools/registry.rs` | O(1) tool lookup, categories |
| 6 | `src/tools/orchestration.rs` | Parallel execution engine |
| 7 | `src/permissions/engine.rs` | Permission decision engine |
| 8 | `src/hooks/mod.rs` | Hook manager, 9 lifecycle events |
| 9 | `src/mcp/client.rs` | MCP connection manager |
| 10 | `src/swarm/manager.rs` | SwarmManager, task decomposition |

---

## 2.14 Extension Points for Multi-CLI Systems

We have walked through nine layers. Now the payoff: the ten places where you intervene when building a customized multi-CLI system. These are the joints in the architecture — the seams designed to be opened.

### Extension Point 1: Custom Tools (Layer 4)

**What:** Add domain-specific tools to the tool registry.

**Where:** Create a tool implementing the `Tool` interface, register it in `tools.ts`.

**Example:** A `DeployTool` that deploys to your specific cloud infrastructure, or a `SecurityScanTool` that runs your organization's vulnerability scanner.

**Multi-CLI use:** Each specialized CLI gets its own tool set. The security CLI has `ThreatModel`, `CVEScan`, `ComplianceCheck`. The DevOps CLI has `Deploy`, `Scale`, `Rollback`, `MonitorHealth`.

### Extension Point 2: Permission Overrides (Layer 5)

**What:** Replace or extend the permission logic for your domain.

**Where:** Modify `hasPermissionsToUseTool()` or add deny/allow rules in settings.

**Example:** RBAC integration — check the user's role in your organization before allowing deployment tools. API-based approval — call your approval system before executing destructive operations.

### Extension Point 3: Lifecycle Hooks (Layer 6)

**What:** Intercept any of 27 lifecycle events with custom scripts.

**Where:** `.claude/settings.json` hooks configuration + `.claude/hooks/` scripts.

**Example:** Secret scanning before writes, audit logging after every tool call, auto-linting after edits, automatic test running after code changes.

### Extension Point 4: Custom Agents (Layer 7)

**What:** Define specialist agents with curated tool sets and system prompts.

**Where:** Create agent definitions in `.claude/agents/*.md` with YAML frontmatter.

**Example:** A `security-auditor` agent that only has read tools and security scanning tools. A `devops-agent` that has deployment and monitoring tools. A coordinator that delegates between them.

### Extension Point 5: MCP Servers (Layer 8)

**What:** Connect external tool providers via the Model Context Protocol.

**Where:** MCP server configuration in `.claude/settings.json` or `mcp-config.json`.

**Example:** A Jira MCP server that provides `create_ticket`, `update_status`, `query_backlog`. A Datadog MCP server that provides `get_metrics`, `create_alert`, `query_logs`.

### Extension Point 6: CLAUDE.md Customization (Layer 3)

**What:** Project-specific instructions that shape model behavior.

**Where:** `.claude/CLAUDE.md` with `@import` directives for path-scoped rules.

**Example:** Coding standards, architecture documentation, domain terminology, workflow requirements. Each project gets its own brain.

### Extension Point 7: System Prompt Injection (Layer 3)

**What:** Programmatically modify the system prompt at runtime.

**Where:** `context.ts::setSystemPromptInjection()` or via hooks that write `systemMessage` responses.

**Example:** Dynamic context injection based on the current task — inject security guidelines when the agent is working on authentication code, inject performance budgets when working on hot paths.

### Extension Point 8: Entry Point Selection (Layer 1)

**What:** Choose how Claude Code is invoked — CLI, MCP server, SDK, HTTP.

**Where:** `entrypoints/` — select or create the entry point matching your use case.

**Example:** Embed Claude Code as a library in your orchestrator (SDK mode). Expose it as an MCP server for other agents to call. Run it headless in CI/CD pipelines (pipe mode with `dontAsk` permissions).

### Extension Point 9: State Store Extensions (Layer 9)

**What:** Add custom fields to AppState or create parallel state stores.

**Where:** `state/AppState.ts` for built-in state, custom stores for domain-specific tracking.

**Example:** Track deployment history, security scan results, performance metrics — anything your specialized CLI needs to remember across turns.

### Extension Point 10: Feature Flags (Cross-Layer)

**What:** Gate experimental features behind flags for safe rollout.

**Where:** Build-time flags via `feature()` calls, runtime flags via GrowthBook/environment variables.

**Example:** Use `CLAUDE_CODE_COORDINATOR_MODE` to enable swarm coordination. Use custom flags to enable/disable your domain-specific tools during staged rollout.

---

## 2.15 The Architecture as Foundation

You now have a complete mental model of Claude Code's architecture. Nine layers from entry to state persistence. Fifty-two tools behind a forty-member interface. A streaming agent loop that executes tools concurrently as they arrive from the model. A permission system with six modes and an AI classifier. Twenty-seven lifecycle hooks for interception. Four types of agents for delegation. MCP for universal tool integration. And ten extension points designed for exactly the kind of customization this book teaches.

This is your keystone. Every chapter that follows assumes this knowledge.

In Chapter 3, we will take the first extension point — custom tools — and build a complete domain-specific tool set from scratch. We will implement, test, and deploy three tools that transform Claude Code from a general-purpose coding assistant into a specialized security auditing agent.

The architecture is the map. Now we start walking the territory.

---

*Next: Chapter 3 — Building Your First Custom Tool Set*

