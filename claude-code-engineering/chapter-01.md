# Chapter 1: System Architecture Overview

## What 512,664 Lines of TypeScript Teach You About Building AI Agents

There are two ways to learn how to build an AI-powered CLI agent. You can read papers about agent architectures, study toy examples with a dozen files, and extrapolate to production. Or you can open the source code of a system that processes millions of requests per day across tens of thousands of concurrent sessions, and reverse-engineer every decision.

This book takes the second path. Claude Code is a 512,664-line TypeScript application, and this chapter is your map to the territory. We will trace the high-level shape of the codebase: the module dependency graph, the three architectural pillars, the data flow from keystroke to API response to rendered output, and the key engineering decisions that distinguish a production agent from a prototype. Along the way, you will see the numbers that define the system's complexity -- 1,884 source files, 52 registered tools, 27 hook lifecycle events, 80+ compile-time feature flags, and 500+ runtime flags -- and begin to understand why those numbers exist.

By the end of this chapter, you will have a mental model of how every component relates to every other. Subsequent chapters will drill into each subsystem. But this chapter is the one you return to when you're deep in a 4,400-line bash parser and need to remember where it fits.

---

## The Codebase at Scale

Claude Code is compiled with the Bun runtime. Not Node.js -- Bun. This is the first architectural decision that shapes everything downstream, and it is not cosmetic. Bun provides `bun:bundle`, a compile-time feature flag system that enables dead code elimination across the entire codebase. When you see:

```typescript
import { feature } from 'bun:bundle';

const coordinatorModeModule = feature('COORDINATOR_MODE')
  ? require('./coordinator/coordinatorMode.js')
  : null;
```

This is not a runtime check. During bundling, Bun evaluates `feature('COORDINATOR_MODE')` at compile time. If the flag is `false`, the entire `require()` and everything it transitively imports get tree-shaken out of the final binary. The production bundle does not contain a dead branch pointing to a `null` -- it contains *nothing*. The code literally does not exist in the output.

There are **80+ compile-time feature flags** controlling what ships. This means Claude Code is not one application -- it is a family of applications carved from the same source tree. An internal Anthropic build with `USER_TYPE=ant` gets tools like `REPLTool` and `SuggestBackgroundPRTool`. An external build gets neither. The `KAIROS` flag enables an entire assistant mode subsystem. `COORDINATOR_MODE` brings in a multi-worker orchestration layer. `TRANSCRIPT_CLASSIFIER` controls whether AFK mode headers exist in the binary at all. Each combination produces a different binary with different capabilities and a different size.

The unbundled source tree is roughly 25,000+ lines larger than what ships to external users. Bun's compile-time elimination is not an optimization afterthought -- it is an architectural primitive that the codebase depends on for shipping multiple product SKUs from one codebase.

Beyond compile-time flags, there are **500+ runtime feature flags** managed by GrowthBook, a remote feature flag service. These control A/B testing, rollout percentages, model availability, and behavioral tuning. Compile-time flags decide what code *exists*. Runtime flags decide what code *runs*. The two systems are orthogonal and complementary -- Chapter 2 covers how they initialize, and Chapter 21 covers the full configuration system.

### The Numbers

| Metric | Value |
|--------|-------|
| Total lines of TypeScript | 512,664 |
| Total files | 1,884 |
| Top-level directories | 59 |
| Registered tools | 52+ |
| Slash commands | 70+ |
| Hook lifecycle events | 27 |
| Compile-time feature flags | 80+ |
| Runtime feature flags (GrowthBook) | 500+ |
| Environment variables | 100+ |
| API beta headers | 17 active |
| Settings cascade layers | 5 (with policy sub-sources) |
| Agent loop exit reasons | 10 |
| Agent loop continuation reasons | 7 |
| Bundled production binary | ~16,800 lines (minified, tree-shaken) |
| Startup time to first prompt | ~390ms on modern hardware |

These numbers are not trivia. Each one represents a design decision about where complexity lives and why. Fifty-two tools means the tool system needs a registry, a permission layer, and a schema validation pipeline (Chapters 8-14). Twenty-seven hook events means the hook engine is a 5,022-line state machine, not a simple event emitter (Chapters 18-19). Five hundred runtime flags means the feature flag system must initialize in under 50ms with a network timeout and coded defaults (Chapter 2). Every number here maps to a chapter that explains why it exists.

### Where the Complexity Lives

The largest files tell you where the essential complexity concentrates:

| File | Lines | What It Does |
|------|-------|-------------|
| `screens/REPL.tsx` | ~5,000 | Main UI screen with 80+ React hooks |
| `cli/print.ts` | ~5,600 | Terminal output formatting, markdown rendering, diff visualization |
| `utils/hooks.ts` | ~5,000 | Hook execution engine: 27 events, 5 types, 7 registration sources |
| `utils/sessionStorage.ts` | ~5,100 | Session persistence, JSONL transcript, resume/recovery |
| `utils/bash/bashParser.ts` | ~4,400 | Full shell parser: tokenizer, AST builder, quoting rules |
| `main.tsx` | ~4,700 | Entry point: CLI parsing, startup pipeline, subcommand routing |
| `services/api/claude.ts` | ~3,400 | API client: beta headers, caching, streaming, retries |
| `services/mcp/client.ts` | ~3,300 | MCP connection manager: 8 transport types, reconnection |
| `utils/plugins/pluginLoader.ts` | ~3,300 | Plugin system: install, update, hot-reload, marketplace |
| `utils/bash/ast.ts` | ~2,700 | Bash AST definitions: node types, traversal, analysis |
| `tools/BashTool/bashSecurity.ts` | ~2,600 | Command injection detection, dangerous pattern matching |
| `tools/BashTool/bashPermissions.ts` | ~2,600 | Bash permission evaluation: path analysis, rule matching |

Notice the pattern: the biggest files are not data models or utility functions. They are *engines* -- the systems that process, transform, and decide. The Bash tool alone spans nearly 7,000 lines across parser and AST files, plus another 5,200 lines across security and permission modules. The permission system spans thousands of lines across multiple modules, with an AI-based auto-mode classifier (`yoloClassifier.ts`, 1,495 lines) that uses side-queries to the Claude API to auto-approve or deny tool calls.

These are not accidents of poor factoring. They are concentrations of essential complexity. A shell parser *must* handle every quoting rule, every heredoc variant, every pipe and redirect. A permission system that gates every tool call across six modes and eight rule sources *must* encode every evaluation rule. Splitting these into smaller files would scatter related logic without reducing complexity.

---

## The Three Pillars

Every component in this codebase serves one of three architectural pillars:

```
+----------------------------------------------------+
|                     Claude Code                     |
+----------------+---------------+-------------------+
|  Query Engine  |  Tool System  |   UI Renderer     |
|    (Brain)     |   (Hands)     |     (Face)        |
+----------------+---------------+-------------------+
| query.ts       | tools.ts      | screens/REPL.tsx  |
| services/api/  | tools/        | ink/              |
| services/      | utils/        | components/       |
|   compact/     |   permissions/| cli/print.ts      |
| context.ts     | utils/bash/   | state/store.ts    |
| bootstrap/     | services/     | state/            |
|   state.ts     |   tools/      |   AppStateStore.ts|
+----------------+---------------+-------------------+
```

### Pillar 1: The Query Engine (Brain)

The Query Engine is the agent loop. It sends messages to the Claude API, receives streaming responses, detects tool use requests in those responses, executes the tools, feeds results back, and repeats. The core file is `query.ts` -- a 1,729-line async generator that runs an infinite `while(true)` loop until the model produces a terminal response (one with no tool use blocks).

The async generator design is deliberate. Unlike a simple `while` loop that would block the caller until completion, the generator *yields* each message as it arrives. The consumer -- `QueryEngine.submitMessage()` -- drives the stream with a `for await...of` loop, getting natural backpressure: if the UI renderer is slow, the stream naturally pauses. No explicit flow control needed. The generator also provides a return channel: its `Terminal` return type is a discriminated union of 10 exit reasons (`completed`, `prompt_too_long`, `max_turns`, `aborted_streaming`, `model_error`, etc.), so the caller knows exactly *why* the loop stopped. Chapter 4 covers the full architecture of this loop -- the five-phase iteration, the state machine with 7 continuation reasons, and the error recovery escalation from 8K to 64K output tokens.

The Query Engine also manages:
- **Context compaction** -- a 5-tier compression pipeline that keeps conversations within token limits (`services/compact/compact.ts`, 1,705 lines). Tiers range from cheap history snipping (drop oldest messages) to full LLM-based summarization. Chapter 6 covers each tier.
- **Token budget tracking** -- per-turn and per-task budgets with automatic continuation when the model hits output limits. The system auto-continues up to 3 times on token limit hits, injecting a recovery message ("Resume directly -- no apology, no recap") that prevents the model from wasting tokens on pleasantries. Chapter 7 covers the budget system.
- **Error recovery** -- escalating output token limits from the default 8K to 64K across retries, reactive compaction on 413 prompt-too-long errors, and model fallback from Opus to Sonnet after 3 consecutive 529 overload errors.
- **API communication** -- the 3,419-line API client manages 17 beta headers (which are part of the server-side cache key), three prompt caching strategies (5-minute ephemeral, 1-hour extended, and cross-user global scope), and a streaming implementation that deliberately bypasses the SDK's convenience wrapper to avoid O(n^2) JSON parsing. Chapter 5 covers the full API client.

### Pillar 2: The Tool System (Hands)

The Tool System is how the agent acts on the world. It consists of 52+ registered tools, a tool execution engine (`services/tools/toolExecution.ts`, 1,745 lines), and a deep permission layer that gates every action.

The most complex subsystem here is the Bash tool -- over 12,000 lines across six files:
- `utils/bash/bashParser.ts` (4,436 lines) -- a full shell parser that tokenizes commands, builds an AST, and handles every quoting variant (single quotes, double quotes, ANSI-C quoting, heredocs, here-strings)
- `utils/bash/ast.ts` (2,679 lines) -- AST node type definitions and traversal utilities
- `tools/BashTool/bashSecurity.ts` (2,592 lines) -- injection detection, dangerous pattern matching (privilege escalation, data exfiltration, destructive commands)
- `tools/BashTool/bashPermissions.ts` (2,621 lines) -- permission evaluation against the rule cascade
- `tools/BashTool/readOnlyValidation.ts` (1,990 lines) -- classifying commands as read-only or mutating for auto-mode

The parser can decompose any bash command into its constituent parts: simple commands, pipelines, command lists, subshells, redirections, variable assignments, and function definitions. This AST is what makes the permission system possible -- you cannot classify `curl https://example.com | sh` as dangerous by string matching. You need to parse the pipe, identify `sh` as the second command, and recognize the pattern as arbitrary code execution from a remote source.

The permission system itself spans 6 permission modes (default, auto, bypass, acceptEdits, dontAsk, plan), 5 settings layers with priority ordering (user, project, local, flags, policy), and an AI-based auto-mode classifier that uses a side-query to the Claude API to evaluate whether a tool call should be auto-approved. The evaluation order is `deny -> ask -> allow` (first match wins), and rules use a `Tool(pattern)` syntax where patterns support globbing. Chapters 15-17 cover the full permission architecture.

### Pillar 3: The UI Renderer (Face)

Claude Code runs in a terminal, but it renders like a web application. The UI is built on a **custom fork of Ink** (a React-for-terminals library) that includes:
- A virtual DOM (`ink/dom.ts`) that represents terminal content as a tree of nodes
- A Yoga-based flexbox layout engine (`ink/layout/engine.ts`) that computes positions and sizes using the same algorithm as React Native
- A differential renderer (`ink/optimizer.ts`) that computes minimal diffs between frames and writes only changed characters to the terminal
- Text selection support (`ink/selection.ts`) for copying output
- Native TypeScript bindings for Yoga layout, file indexing, and color diff computation

The main screen is `screens/REPL.tsx` at roughly 5,000 lines, powered by 80+ React hooks. It includes virtual scrolling for long conversations (the `useVirtualScroll.ts` module alone is 35,000 lines of virtualization logic), a typeahead system for command completion (`useTypeahead.tsx`, 212,000 lines spanning the full autocomplete pipeline), vim-mode input with full motions and text objects, and background task navigation.

Output formatting lives in `cli/print.ts` (5,594 lines), handling markdown rendering for terminal, diff visualization with color, ANSI processing with bidirectional text support, and message collapsing for background tasks. When Claude responds with markdown containing code blocks, tables, and inline formatting, this module renders it with syntax highlighting, proper indentation, and word-wrapping that respects terminal width.

Chapters 26-29 cover the full UI system.

---

## The Module Dependency Graph

Understanding how modules depend on each other is critical to understanding why certain files exist and why patterns like lazy `require()` appear throughout the codebase.

### The Import Hierarchy

The codebase enforces a strict layering:

```
Layer 0: bootstrap/state.ts, types/, constants/
    |
Layer 1: utils/ (pure utilities, no side effects)
    |
Layer 2: services/ (API, MCP, analytics, compaction)
    |
Layer 3: tools/ (tool implementations)
    |
Layer 4: query.ts, context.ts (orchestration)
    |
Layer 5: screens/, components/ (UI)
    |
Layer 6: main.tsx (entry point, CLI parsing, startup)
```

**Layer 0** is the foundation. `bootstrap/state.ts` is a 1,758-line global singleton with 250+ fields, 80+ accessor functions, and zero imports from within the codebase (only external packages and type imports). This is by design. It must be importable from anywhere without creating circular dependencies. The file opens with **"DO NOT ADD MORE STATE HERE -- BE JUDICIOUS WITH GLOBAL STATE"** and closes with **"THINK THRICE BEFORE MODIFYING"**. The team chose global mutable state deliberately -- for a single-process, single-thread CLI application with call stacks 15+ functions deep, it is simpler than dependency injection and has zero runtime overhead. Chapter 3 covers why this choice was made and the patterns that make it safe.

**Layer 1** (`utils/`) contains pure utilities and business logic. Files in `utils/` can import from Layer 0 and from each other, but should not import from `services/`, `tools/`, or `screens/`. This layer includes the bash parser, the permission evaluation engine, the hook execution engine, and the plugin loader -- all "pure" in the sense that they process inputs and produce outputs without initiating I/O to external services.

**Layer 2** (`services/`) provides the core services: the API client, MCP connections, analytics, and compaction. Services can import from Layers 0-1 and from each other. The API client (`services/api/claude.ts`) is the interface to the Claude model. The MCP client (`services/mcp/client.ts`) manages connections to Model Context Protocol servers across 8 transport types (stdio, SSE, HTTP, WebSocket, IDE variants, SDK, and claude.ai proxy).

**Layer 3** (`tools/`) implements individual tools. Each tool lives in its own directory (e.g., `tools/BashTool/`, `tools/AgentTool/`, `tools/FileReadTool/`). Tools can import from Layers 0-2. The tool registry at `tools.ts` conditionally imports tools based on compile-time feature flags:

```typescript
// tools.ts (simplified)
import { BashTool } from './tools/BashTool/BashTool.js';
import { FileReadTool } from './tools/FileReadTool/FileReadTool.js';

const tools: Tool[] = [
  BashTool,
  FileReadTool,
  // ... always-available tools

  // Feature-gated tools
  ...(feature('COORDINATOR_MODE')
    ? [require('./tools/TeamCreateTool.js').TeamCreateTool,
       require('./tools/TeamDeleteTool.js').TeamDeleteTool]
    : []),

  ...(feature('USER_TYPE') === 'ant'
    ? [require('./tools/REPLTool.js').REPLTool]
    : []),
];
```

When `COORDINATOR_MODE` is `false`, Bun's bundler eliminates the `require()` calls and everything they transitively import. The production binary for external users does not contain team management tools.

**Layer 4** is the orchestration layer. `query.ts` imports from services and tools to run the agent loop. `context.ts` assembles the system prompt and user context from CLAUDE.md files, memory, plans, and tool descriptions.

**Layer 5** is the UI layer. React components and screens import from everything below. The custom Ink fork renders these components to terminal output.

**Layer 6** is the entry point. `main.tsx` wires everything together -- CLI parsing, configuration loading, authentication, and REPL launch.

### Breaking the Rules: Lazy `require()`

Reality is messier than the hierarchy suggests. Circular dependencies exist, and the codebase handles them with a consistent pattern -- lazy `require()`:

```typescript
// In main.tsx (Layer 6):
const getTeammateUtils = () =>
  require('./utils/teammate.js') as typeof import('./utils/teammate.js');
```

Instead of a top-level `import`, the module is loaded on first call. This breaks the cycle because the dependent module does not need to be resolved at import time. The `as typeof import(...)` cast preserves type safety -- you get full IntelliSense and compile-time type checking, but the actual module load is deferred.

This pattern appears throughout the codebase:
- `main.tsx` uses it for `teammate.js`, `teammatePromptAddendum.js`, `teammateModeSnapshot.js`
- `tools.ts` uses it for `TeamCreateTool`, `TeamDeleteTool`, `SendMessageTool`, `PowerShellTool`
- Feature-gated modules use `require()` inside conditional expressions so Bun can tree-shake the dead branch

These are not hacks. They are a deliberate architectural pattern chosen over alternatives like dependency injection containers, which would add complexity and runtime overhead. The lazy `require()` approach is zero-cost when the module is never needed and single-evaluation when it is (Bun's module caching ensures `require()` only evaluates a module once). The pattern is also self-documenting: when you see a lazy `require()`, you know either (a) it breaks a circular dependency or (b) it defers loading of a feature-gated module.

---

## The Bootstrap Sequence

When you type `claude` in your terminal, a precise sequence of events unfolds in roughly 390 milliseconds. That number matters -- CLI tools that take more than a second to show a prompt lose users. The entire bootstrap pipeline is engineered to stay under 500ms, the threshold humans perceive as "instant."

### The 13-Phase Startup Pipeline

```
Phase 0:  ENTRY POINT        cli.js fast-path exits (~2ms)
Phase 1:  PROFILING           profileCheckpoint('main_tsx_entry')
Phase 2:  MDM PREFETCH        startMdmRawRead() -- enterprise config in background
Phase 3:  KEYCHAIN PREFETCH   startKeychainPrefetch() -- OAuth + API key in parallel
Phase 4:  MODULE EVALUATION   ~135ms of remaining imports (overlaps with 2-3)
Phase 5:  CLI PARSING         Commander.js parses 30+ flags and subcommands (~3ms)
Phase 6:  CONFIGURATION       5-layer settings cascade loads and merges (~15ms)
Phase 7:  AUTHENTICATION      OAuth, API key, Bedrock, Vertex, or Foundry (~5ms*)
Phase 8:  GROWTHBOOK          500+ runtime flags initialized (~50ms**)
Phase 9:  TRUST DIALOG        First-run trust acceptance for working directory
Phase 10: TELEMETRY           OpenTelemetry meter/logger/tracer setup (~5ms)
Phase 11: SESSION INIT        Session ID, transcript file, history (~10ms)
Phase 12: MCP PREFETCH        Prefetch official MCP registry URLs (async)
Phase 13: REPL LAUNCH         Ink renderer mounts, REPL screen initializes (~165ms)

* 5ms because keychain was prefetched; would be ~65ms without
** Includes network round-trip to GrowthBook CDN; 0ms if cached
```

The key optimization: Phases 2-3 fire asynchronous I/O operations (subprocess spawns for MDM config reading and keychain credential fetching) *between* import statements, so they run in parallel with the 135ms of module evaluation in Phase 4. By the time the configuration system needs the results, the subprocesses have already finished.

### Side-Effect Import Ordering

The first lines of `main.tsx` are the most performance-critical code in the entire application:

```typescript
// These side-effects must run before all other imports:
// 1. profileCheckpoint marks entry before heavy module evaluation begins
// 2. startMdmRawRead fires MDM subprocesses (plutil/reg query) so they run in
//    parallel with the remaining ~135ms of imports below
// 3. startKeychainPrefetch fires both macOS keychain reads (OAuth + legacy API
//    key) in parallel
import { profileCheckpoint } from './utils/startupProfiler.js';
profileCheckpoint('main_tsx_entry');

import { startMdmRawRead } from './utils/settings/mdm/rawRead.js';
startMdmRawRead();

import { startKeychainPrefetch } from './utils/secureStorage/keychainPrefetch.js';
startKeychainPrefetch();
```

These three operations -- startup profiling, MDM configuration reading, and keychain credential prefetching -- are fired **between import statements**. This is unconventional. Most codebases put all imports at the top and all side effects in an `init()` function. Claude Code deliberately interleaves them because:

1. **Module evaluation is synchronous.** When Bun evaluates `import { foo } from './big-module.js'`, it blocks until `big-module.js` and all its transitive dependencies are evaluated.
2. **Prefetch operations are asynchronous.** `startMdmRawRead()` spawns `plutil` on macOS or `reg query` on Windows. `startKeychainPrefetch()` starts two macOS keychain reads concurrently.
3. **By firing them before the heavy imports, the I/O operations overlap with module evaluation.** This saves roughly 65ms on every macOS startup -- the difference between sequential keychain reads and parallel ones that overlap with import processing.

### Fast-Path Exits

Before `main.tsx` is even imported, the actual entry point `cli.js` checks for fast-path exits:

```typescript
// cli.js (simplified)
const args = process.argv.slice(2);

// Fast path: --version exits immediately, no heavy imports
if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
  console.log(`${BUILD_CONSTANTS.VERSION} (Claude Code)`);
  return;
}
```

The `--version` flag prints and exits without importing a single internal module -- approximately 5ms total. Without this fast path, even `claude --version` would pay the 135ms module evaluation cost plus 165ms of REPL initialization. Every subcommand that does not need the full REPL (MCP serve, bridge, tmux worktree) gets its own fast path with only the imports it needs.

### The Settings Cascade

The configuration system merges settings from 5 source layers, with the policy layer containing 4 sub-sources:

```
Layer 1 (lowest):   User settings      (~/.claude/settings.json)
Layer 2:            Project settings    (.claude/settings.json in project root)
Layer 3:            Local settings      (.claude/settings.local.json, gitignored)
Layer 4:            Flag settings       (--settings CLI flag or SDK inline config)
Layer 5 (highest):  Policy settings     (enterprise, first-source-wins):
                      +-- Remote managed    (server-fetched)
                      +-- MDM/HKLM/plist    (admin-configured on device)
                      +-- managed-settings.json + .d/*.json (file-based admin)
                      +-- HKCU registry     (user-level Windows registry)
```

Higher-priority layers override lower ones. The merge is not simple replacement -- permissions and hooks arrays *concatenate*, not overwrite. A team can share baseline permissions via project settings while individuals add their own via local settings. Policy settings from enterprise administrators override everything, enabling organizations to enforce security boundaries: disabling dangerous permissions, restricting available models, limiting budgets, and blocking user-defined hooks.

Chapter 2 covers the full settings cascade in detail, including the merge algorithm, validation, and MDM integration.

---

## Global State Architecture

Claude Code uses global mutable state -- a single mutable object defined in `bootstrap/state.ts` with 250+ fields. Not dependency injection. Not a service container. This is a deliberate engineering choice, not a shortcut.

Three properties of the application make this the right pattern:

1. **Single-process, single-thread architecture.** There is no concurrent mutation problem because there is one execution context. The primary argument for DI -- isolating dependencies to manage concurrency -- does not apply.

2. **Deep call stacks.** The path from a user prompt to a tool execution to a permission check to a bash security analysis is 15+ function calls deep. Threading state through every function signature would mean changing hundreds of signatures and adding parameter-passing boilerplate that obscures the actual logic.

3. **Cross-cutting concerns.** Telemetry counters, model usage tracking, session identity, and cost accounting need to be accessible from every layer. These genuinely are global concerns in a single-process application.

The state object is not exported directly. Instead, `bootstrap/state.ts` exports 80+ accessor functions (`getSessionId()`, `setCwdState()`, `addToTotalCostState()`) that enforce invariants, enable grep-ability, and keep the module at the leaf of the import DAG. Setters can enforce constraints: `setCwdState()` always NFC-normalizes Unicode. `switchSession()` atomically updates both `sessionId` and `sessionProjectDir` because they must never drift out of sync.

For testing, `resetStateForTests()` overwrites every field in-place with fresh defaults, guarded by a `NODE_ENV === 'test'` check. Every test's `beforeEach` calls this function. This is the tax you pay for global state -- and it is worth paying to avoid dependency injection boilerplate across thousands of tests.

### The Reactive UI Store

While `bootstrap/state.ts` holds back-end state (API communication, telemetry, session management), the UI has its own state management via a minimal reactive store at `state/store.ts`:

```typescript
export function createStore<T>(
  initialState: T,
  onChange?: OnChange<T>,
): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()

  return {
    getState: () => state,

    setState: (updater: (prev: T) => T) => {
      const prev = state
      const next = updater(prev)
      if (Object.is(next, prev)) return
      state = next
      onChange?.({ newState: next, oldState: prev })
      for (const listener of listeners) listener()
    },

    subscribe: (listener: Listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

This is 34 lines of code. The entire UI state management system. No Redux, no Zustand, no MobX. It provides reactive state with `Object.is` bail-out (components only re-render when state actually changes), functional updates (`(prev: T) => T` prevents stale-state bugs), synchronous notification (no frame where state and UI disagree), and O(1) subscription management via `Set`. For a single-process application with one UI thread, 34 lines is sufficient.

The `AppState` type uses a `DeepImmutable<>` wrapper that recursively marks all properties as `readonly` at the TypeScript type level. You cannot accidentally mutate state -- the compiler rejects `state.settings.model = 'foo'`. The only way to change state is through `setState`, which creates a new object. Chapter 3 covers both state systems in full detail, including cache latching, speculation state, and the two-system separation of concerns.

### Cache Latching: Where State Management Meets Cost Optimization

One of the most interesting state patterns is **cache latching**. The Claude API caches system prompts and early conversation turns. A cache hit costs roughly 1/10th of a cache miss. When you change an API header -- like toggling fast mode on or off -- the API treats it as a different request, the cache key changes, and you pay full price for a cache miss on 50-70K tokens of system prompt.

Four boolean fields in the global state use the latch pattern: once set to `true`, they never revert to `false` during the current session. When the user enables fast mode, `fastModeHeaderLatched` is set to `true`. Even if fast mode is later disabled, the *header* stays `true` while the behavior *parameter* changes. This separation -- stable cache key, dynamic behavior -- prevents cache busting.

A 70K-token system prompt cache miss costs roughly $0.20 vs $0.03 for a hit. Across millions of API calls per day, preventing unnecessary cache misses saves significant infrastructure cost. Chapter 3 covers the latch pattern in detail, and Chapter 5 covers how the API client uses it for beta header management.

---

## Data Flow: From Prompt to Response

Here is how a single user prompt flows through the entire system. This diagram is the skeleton that every subsequent chapter hangs on:

```
User types: "Fix the bug in auth.ts"
        |
        v
+------------------------------------------+
| 1. INPUT HANDLING                         |
|    PromptInput.tsx captures text           |
|    Text checked for slash commands (/cmd) |
|    If not a command, creates UserMessage   |
+-------------------+----------------------+
                    |
                    v
+------------------------------------------+
| 2. CONTEXT ASSEMBLY                       |
|    context.ts builds system prompt         |
|    CLAUDE.md content injected              |
|    Tool descriptions assembled (52 tools)  |
|    Memory/plan attachments added           |
|    Token budget calculated                 |
+-------------------+----------------------+
                    |
                    v
+------------------------------------------+
| 3. QUERY LOOP (query.ts)                  |
|    Async generator sends to Claude API     |
|    Streams response via AsyncGenerator     |
|    Detects tool_use blocks during stream   |
|    Feeds StreamingToolExecutor             |
+-------------------+----------------------+
                    |
                    v
+------------------------------------------+
| 4. TOOL EXECUTION                         |
|    toolExecution.ts orchestrates           |
|    Permission check (6 modes, 5 layers)   |
|    If Bash: security analysis (AST parse)  |
|    Hooks fire (PreToolUse, PostToolUse)    |
|    Tool runs, produces result              |
+-------------------+----------------------+
                    |
                    v
+------------------------------------------+
| 5. RESULT INJECTION                       |
|    Tool result added to messages           |
|    Token count updated                     |
|    If context too large: 5-tier compaction |
|    Loop back to step 3                     |
+-------------------+----------------------+
                    |
                    v
+------------------------------------------+
| 6. TERMINAL RESPONSE                      |
|    Model responds with no tool_use         |
|    Response rendered via print.ts          |
|    Markdown formatted for terminal         |
|    Speculation may begin for next turn     |
+------------------------------------------+
```

Steps 3-5 repeat for each tool use in the conversation. A single user prompt like "Fix the bug in auth.ts" might trigger 10+ tool uses: reading the file, searching for related code, reading tests, editing the file, running the tests, reading test output, and editing again if tests fail. Each cycle through steps 3-5 is one *turn* of the agent loop. The `turnCount` field in the query state tracks these iterations, and the `maxTurns` parameter can cap them.

The **streaming tool execution** optimization is worth highlighting. During step 3, while the model is still generating content block N+1, the tool from block N is already executing. For a response that invokes three tools, this pipelining can cut total latency by 60-70% compared to sequential execution. The `StreamingToolExecutor` (530 lines) manages this concurrency, classifying tools as concurrent-safe (Read, Grep, Glob) or exclusive (Bash, Edit, Write) and scheduling accordingly. Chapter 9 covers the tool execution engine in detail.

### Speculation: Predicting the Next Turn

After step 6, when the model has finished responding and the user is reading the output, Claude Code can speculatively start the next turn. The speculation system predicts what the user will say next and begins processing it:

- If the prediction matches the user's actual prompt, the pre-computed results are displayed instantly
- If the prediction does not match, the speculation is aborted and the real prompt runs normally
- The system only speculates at safe boundaries -- after a complete response, after a bash command, after a file edit, or after a denied tool -- never mid-stream or mid-tool

The speculation state machine tracks which files have been modified during speculative execution so they can be rolled back on abort. It uses mutable refs (breaking the immutability convention of AppState) to avoid creating thousands of intermediate arrays during speculative execution -- a deliberate performance trade-off documented in the code.

---

## Key Architectural Decisions

Before diving into individual systems in subsequent chapters, here are the defining architectural choices and their rationale. Each row maps to one or more chapters that explore the decision in depth:

| Decision | Choice | Why | Chapter |
|----------|--------|-----|---------|
| Runtime | Bun, not Node.js | Compile-time feature flags, faster startup, native bundling | 2, 42 |
| State management | Global mutable singleton | Single-process CLI; avoids threading state through 15+ call depths | 3 |
| UI framework | Custom Ink fork + React | Terminal rendering with flexbox layout; deep customization of renderer | 26-29 |
| Agent loop | AsyncGenerator | Pull-based streaming; natural backpressure; return channel for exit reasons | 4 |
| Shell parsing | Custom 4,400-line parser | No external dependency for security-critical code; full AST for analysis | 10, 17 |
| Permission model | AI classifier + rule engine | Balances UX (don't ask for everything) with safety (block dangerous commands) | 15-16 |
| Module loading | Lazy `require()` for cycles | Zero-cost when unused; preserves type safety via `as typeof import()` | 1 |
| Feature management | Compile-time (Bun) + Runtime (GrowthBook) | Dead code elimination for binary size; runtime flags for A/B testing | 2, 39 |
| Cache economics | Header latching | Prevents 7x cost increase from prompt cache misses | 3, 5 |
| Context management | 5-tier compression | Graceful degradation from cheap snipping to expensive LLM summarization | 6 |
| API streaming | Raw SSE over SDK wrapper | Avoids O(n^2) JSON parsing in BetaMessageStream | 5 |
| Tool execution | Streaming pipelining | Tools start during model output; 60-70% latency reduction for multi-tool responses | 4, 9 |
| Session persistence | JSONL transcript | Streaming append; no database dependency; enables `--resume` replay | 24 |
| Configuration | 5-layer cascade | Enterprise policy > CLI flags > local > project > user; permissions concatenate | 2, 21 |
| Hook system | 27 lifecycle events, 5 types | Pre/post tool use, session start/stop, quality gates, file watchers | 18-19 |
| MCP integration | 8 transport types, 7 server scopes | Stdio for local servers, SSE/HTTP for remote, IDE variants for editor integration | 30-32 |

These decisions are not independent. The Bun runtime enables compile-time feature flags, which enable the tool registry to conditionally include tools, which determines what the permission system must evaluate, which shapes how the auto-mode classifier is prompted. The cache latching in the state layer exists because of the prompt caching economics in the API client, which exist because of the streaming protocol in the query loop. Pull on any thread and you reach every other.

---

## Reading This Book

This book is organized in twelve parts that follow the architecture from foundation to subsystem:

**Part I (Chapters 1-3)** covers the foundation: this architecture overview, the bootstrap sequence, and the global state architecture. After Part I, you understand how Claude Code starts and how it stores its state.

**Part II (Chapters 4-7)** covers the Query Engine: the agent loop, the API client, context management, and token budgeting. After Part II, you understand how Claude Code thinks -- how it calls the model, recovers from errors, and manages context within token limits.

**Part III (Chapters 8-14)** covers the Tool System: tool architecture, the execution engine, the Bash tool, file operation tools, web tools, agent/subagent tools, and task management. After Part III, you understand how Claude Code acts -- how tools are registered, permitted, executed, and how their results flow back to the model.

**Part IV (Chapters 15-17)** covers the Permission System: the architecture, the AI auto-mode classifier, and bash security analysis. After Part IV, you understand how Claude Code decides what it is allowed to do.

**Parts V-XII** cover hooks, skills, memory, the UI system, MCP, multi-agent orchestration, infrastructure subsystems, and testing. Each part is self-contained enough to read independently once you have the foundation from Parts I-IV.

### What You Will Build

By the end of this book, you will understand every system in Claude Code well enough to:

1. **Replicate it** -- build an AI-powered CLI agent from scratch using the same architectural patterns: async generator agent loops, compile-time feature flags, tiered context compression, AI-assisted permission classification, and streaming tool pipelining.
2. **Extend it** -- add new tools, modify the permission system, create new UI components, integrate new AI providers, or build MCP servers that work with the tool protocol.
3. **Debug it** -- trace any behavior from the user's keystroke through input handling, context assembly, API communication, tool execution, permission checking, and UI rendering. When something goes wrong, you will know exactly which file, which function, and which state field to examine.

The source code is the territory. This book is the map. Let us begin.
