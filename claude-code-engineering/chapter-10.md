# Chapter 10: The Hook System

Every production system eventually needs extensibility — a way for users to inject their own logic at critical decision points without forking the core codebase. Web frameworks solved this with middleware. Build systems solved it with plugins. Claude Code solved it with *hooks*: a lifecycle interception framework that spans 27 distinct events, supports four execution modalities, and processes them through a parallel async generator pipeline.

The hook system is arguably Claude Code's most architecturally ambitious subsystem. It touches ~11,000 lines across 16 core files. It handles everything from blocking a dangerous `rm -rf` command before execution to spawning a multi-turn LLM agent that verifies code quality before the model finishes its response. And it does this while maintaining sub-microsecond overhead on the hot path — a constraint that shaped nearly every design decision.

In this chapter, we'll trace the hook system from configuration through execution, examining how it achieves the seemingly contradictory goals of maximum flexibility and minimal performance impact.

---

## 10.1 Architecture Overview

The hook system's file inventory reveals its scope:

| File | Lines | Role |
|------|-------|------|
| `utils/hooks.ts` | 5,022 | Core engine: `executeHooks` generator, 30+ exported `execute*Hooks` functions, matcher logic, exit code semantics |
| `types/hooks.ts` | 291 | Type definitions: `HookResult`, `AggregatedHookResult`, `HookCallback`, JSON output schemas |
| `schemas/hooks.ts` | 223 | Zod schemas: discriminated union of all four hook types, matcher schema, `IfConditionSchema` |
| `utils/hooks/hooksConfigManager.ts` | 401 | Event metadata for all 27 events, matcher grouping, sorted matcher priority |
| `utils/hooks/hooksSettings.ts` | 272 | `getAllHooks`, `getHooksForEvent`, source display strings, matcher priority sorting |
| `utils/hooks/hooksConfigSnapshot.ts` | 134 | Snapshot capture at startup, managed-hooks-only policy, `disableAllHooks` logic |
| `utils/hooks/execAgentHook.ts` | 340 | Agent hook executor: multi-turn LLM query with structured output |
| `utils/hooks/execPromptHook.ts` | 212 | Prompt hook executor: single-shot LLM call with JSON schema enforcement |
| `utils/hooks/execHttpHook.ts` | 243 | HTTP hook executor: POST with SSRF guard, env var interpolation, sandbox proxy |
| `utils/hooks/AsyncHookRegistry.ts` | 310 | Async hook lifecycle: register, poll, finalize pending background hooks |
| `utils/hooks/hookHelpers.ts` | 84 | Shared utilities: `$ARGUMENTS` substitution, `StructuredOutput` tool creation |
| `utils/hooks/sessionHooks.ts` | 448 | Session-scoped hooks: add/remove/get, function hooks with callbacks, `Map`-based state |
| `utils/hooks/registerFrontmatterHooks.ts` | 68 | Agent/skill frontmatter hook registration, Stop-to-SubagentStop conversion |
| `utils/hooks/ssrfGuard.ts` | 295 | SSRF protection: blocked address ranges, IPv4/IPv6 mapped address handling |
| `services/tools/toolHooks.ts` | 651 | Integration layer: `runPreToolUseHooks`, `runPostToolUseHooks`, `resolveHookPermissionDecision` |
| `query/stopHooks.ts` | 474 | Stop hook orchestration: `handleStopHooks`, teammate idle, task completion hooks |

The architecture follows a pipeline model: configuration sources merge into a snapshot at startup, events flow through matcher filtering to parallel execution, and results aggregate through a permission precedence hierarchy. Understanding this pipeline is the key to understanding the entire system.

---

## 10.2 The 27 Lifecycle Events

Every meaningful state transition in Claude Code emits a hook event. The full set is defined at `entrypoints/sdk/coreSchemas.ts:355-383`:

```typescript
export const HOOK_EVENTS = [
  'PreToolUse',          // Before tool execution — can block/allow/modify input
  'PostToolUse',         // After tool execution — can inject context
  'PostToolUseFailure',  // After tool execution fails
  'Notification',        // When notifications are sent
  'UserPromptSubmit',    // When user submits a prompt
  'SessionStart',        // When a new session starts
  'SessionEnd',          // When a session ends
  'Stop',                // Right before Claude concludes its response
  'StopFailure',         // When turn ends due to API error (fire-and-forget)
  'SubagentStart',       // When a subagent is started
  'SubagentStop',        // Right before a subagent concludes
  'PreCompact',          // Before conversation compaction
  'PostCompact',         // After conversation compaction
  'PermissionRequest',   // When a permission dialog is displayed
  'PermissionDenied',    // After auto-mode classifier denies a tool call
  'Setup',               // Repo setup hooks for init and maintenance
  'TeammateIdle',        // When a teammate is about to go idle
  'TaskCreated',         // When a task is being created
  'TaskCompleted',       // When a task is completed
  'Elicitation',         // When an MCP server requests user input
  'ElicitationResult',   // After user responds to MCP elicitation
  'ConfigChange',        // When configuration files change
  'WorktreeCreate',      // Create an isolated worktree
  'WorktreeRemove',      // Remove a previously created worktree
  'InstructionsLoaded',  // When a CLAUDE.md or rule file is loaded
  'CwdChanged',          // After the working directory changes
  'FileChanged',         // When a watched file changes
] as const
```

These events fall into three categories based on their blocking capability:

| Can Block (exit 2) | Fire-and-Forget | Observability-Only |
|---|---|---|
| PreToolUse, UserPromptSubmit, Stop, SubagentStop, PreCompact, TeammateIdle, TaskCreated, TaskCompleted, Elicitation, ElicitationResult, ConfigChange | Notification, StopFailure, PostToolUse, PostToolUseFailure, SessionEnd | InstructionsLoaded |

The distinction matters enormously. A blocking event means a hook's exit code 2 will *prevent* the action from proceeding. `PreToolUse` hooks can block tool execution. `Stop` hooks can force the model to continue working. Fire-and-forget events inform but never block — `PostToolUse` hooks see tool results but cannot undo them. And `InstructionsLoaded` exists purely for observability — it cannot even return feedback to the model.

Each event carries metadata defined in `utils/hooks/hooksConfigManager.ts:27-267`, including a human-readable summary, detailed description of exit code semantics, and optional matcher metadata specifying which field to match against and its valid values. This metadata drives the `/hooks` configuration UI, giving users a self-documenting API for each event.

### Event Categories by Purpose

**Tool lifecycle events** (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`) form the most commonly used hook points. A pre-tool hook that blocks `rm -rf` commands or a post-tool hook that auto-lints Python files after writes — these are the bread-and-butter use cases.

**Session lifecycle events** (`SessionStart`, `SessionEnd`, `Setup`, `CwdChanged`, `ConfigChange`) fire during session state transitions. `SessionStart` is particularly powerful because hooks can return `initialUserMessage` to auto-submit a prompt, `watchPaths` to register file watchers, and `additionalContext` that gets injected into the system prompt.

**Agent lifecycle events** (`SubagentStart`, `SubagentStop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`) enable workflow orchestration. Enterprise deployments use `Stop` hooks to verify that agents completed their assigned tasks before finishing, and `TeammateIdle` hooks to reassign idle agents to new work.

**Compaction events** (`PreCompact`, `PostCompact`) let hooks intervene in context management — for example, extracting important information before compaction discards messages.

---

## 10.3 The Four Hook Types

The hook type system is modeled as a Zod discriminated union at `schemas/hooks.ts:176-189`:

```typescript
export const HookCommandSchema = lazySchema(() => {
  const { BashCommandHookSchema, PromptHookSchema, AgentHookSchema, HttpHookSchema } =
    buildHookSchemas()
  return z.discriminatedUnion('type', [
    BashCommandHookSchema,
    PromptHookSchema,
    AgentHookSchema,
    HttpHookSchema,
  ])
})
```

Each type represents a different execution model, offering progressive power at the cost of progressive complexity.

### Command Hooks (type: 'command')

The simplest and most common hook type — it spawns a shell process. Schema at `schemas/hooks.ts:32-65`:

```typescript
const BashCommandHookSchema = z.object({
  type: z.literal('command'),
  command: z.string(),
  if: IfConditionSchema(),
  shell: z.enum(SHELL_TYPES).optional(),    // 'bash' or 'powershell'
  timeout: z.number().positive().optional(),
  statusMessage: z.string().optional(),
  once: z.boolean().optional(),             // Run once, then auto-remove
  async: z.boolean().optional(),            // Background without blocking
  asyncRewake: z.boolean().optional(),      // Background + wake on exit 2
})
```

The `if` condition deserves special attention. It reuses the permission rule syntax (e.g., `Bash(git *)`) to filter hooks before process spawning. A hook configured with `if: "Write(*.py)"` will only fire for Write tool calls targeting Python files. This avoids the cost of spawning a process for every Write invocation just to have the process check the extension itself.

The `async` and `asyncRewake` fields enable two background execution modes. With `async: true`, the hook runs in the background and its result is polled later — useful for slow, non-critical operations like telemetry. With `asyncRewake: true`, the hook also runs in the background but can wake the model with a notification if it exits with code 2, enabling asynchronous quality gates.

Command hook execution at `utils/hooks.ts:747-1335` handles cross-platform shell selection, environment variable injection, and a bidirectional prompt elicitation protocol where hooks can request user input mid-execution via JSON messages on stdout/stdin.

### Prompt Hooks (type: 'prompt')

A single-shot LLM evaluation that returns a structured `{ok: boolean, reason?: string}` response. Execution at `utils/hooks/execPromptHook.ts:21-211`:

```typescript
const PromptHookSchema = z.object({
  type: z.literal('prompt'),
  prompt: z.string(),           // Use $ARGUMENTS for hook input JSON
  if: IfConditionSchema(),
  timeout: z.number().positive().optional(),
  model: z.string().optional(), // Default: small fast model
  statusMessage: z.string().optional(),
  once: z.boolean().optional(),
})
```

The prompt receives the hook input JSON via `$ARGUMENTS` substitution, and the response is enforced through JSON schema output formatting. Default timeout is 30 seconds, and the default model is `getSmallFastModel()` — typically Haiku for cost efficiency. This makes prompt hooks cheap enough to run on every tool call: a Haiku evaluation costs roughly 100x less than the Opus call that triggered it.

### Agent Hooks (type: 'agent')

The most powerful hook type — a multi-turn LLM agent with tool access that can inspect the codebase before making its verdict. Execution at `utils/hooks/execAgentHook.ts:36-339`:

```typescript
const AgentHookSchema = z.object({
  type: z.literal('agent'),
  prompt: z.string(),
  if: IfConditionSchema(),
  timeout: z.number().positive().optional(), // Default 60s
  model: z.string().optional(),              // Default: Haiku
  statusMessage: z.string().optional(),
  once: z.boolean().optional(),
})
```

Agent hooks spawn a full `query()` loop with up to 50 turns (`MAX_AGENT_TURNS = 50`), running in `dontAsk` permission mode so they never prompt the user. The agent gets access to all available tools minus a disallowed set (preventing recursive hook invocation). A synthetic `StructuredOutput` tool enforces the `{ok, reason}` response format, and a session-level Stop hook ensures the agent actually calls it before terminating.

The system prompt reveals the design philosophy (`execAgentHook.ts:107-115`):

```typescript
const systemPrompt = asSystemPrompt([
  `You are verifying a stop condition in Claude Code. Your task is to verify
   that the agent completed the given plan. The conversation transcript is
   available at: ${transcriptPath}
   Use the available tools to inspect the codebase and verify the condition.
   Use as few steps as possible — be efficient and direct.
   When done, return your result using the ${SYNTHETIC_OUTPUT_TOOL_NAME} tool...`,
])
```

Agent hooks exist for Stop/SubagentStop verification — scenarios where a simple exit code cannot capture the complexity of "did the agent actually accomplish what it was asked to do?"

### HTTP Hooks (type: 'http')

POSTs hook input JSON to a URL for external system integration. Schema at `schemas/hooks.ts:97-126`:

```typescript
const HttpHookSchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  if: IfConditionSchema(),
  timeout: z.number().positive().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  allowedEnvVars: z.array(z.string()).optional(),
  statusMessage: z.string().optional(),
  once: z.boolean().optional(),
})
```

HTTP hooks carry significant security implications. The `allowedEnvVars` field controls which environment variables can be interpolated into header values — only explicitly listed variables are expanded, defending against secret exfiltration through `Authorization: Bearer $GITHUB_TOKEN` style attacks. Header values are sanitized against CRLF injection (`sanitizeHeaderValue` strips CR, LF, and NUL bytes). And all URLs pass through SSRF validation before the request is sent.

One critical constraint: HTTP hooks are **not supported** for `SessionStart` and `Setup` events. These events fire during initialization when the HTTP stack may not be fully configured, creating a deadlock risk.

### Internal-Only Types

Two additional hook types exist that cannot be defined in `settings.json`:

**Callback hooks** (`types/hooks.ts:211-227`): TypeScript callbacks registered via the SDK, used for internal features like file access tracking and attribution injection.

**Function hooks** (`utils/hooks/sessionHooks.ts:24-31`): Session-scoped callbacks that receive the full message array and return a boolean. Used internally for features like plan mode enforcement.

---

## 10.4 Hook Configuration and Source Precedence

### The Settings Schema

Hook configuration follows a three-level nesting structure defined at `schemas/hooks.ts:211-213`:

```typescript
export const HooksSchema = lazySchema(() =>
  z.partialRecord(z.enum(HOOK_EVENTS), z.array(HookMatcherSchema())),
)
```

Each event maps to an array of **matchers**, each containing an array of **hooks**:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/block-destructive.sh",
            "timeout": 5,
            "statusMessage": "Checking command safety..."
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "ruff check --fix $FILE && ruff format $FILE",
            "if": "Write(*.py)"
          }
        ]
      }
    ]
  }
}
```

The matcher field supports three matching modes — exact string (`"Bash"`), pipe-separated alternatives (`"Write|Edit"`), and full regex (`"^Bash.*"`) — implemented at `utils/hooks.ts:1346-1381`.

### Source Precedence

Hooks are loaded from six sources with explicit precedence, defined in `utils/hooks/hooksSettings.ts:92-161`:

1. **User settings** (`~/.claude/settings.json`)
2. **Project settings** (`.claude/settings.json`)
3. **Local settings** (`.claude/settings.local.json`)
4. **Session hooks** (in-memory, added at runtime)
5. **Plugin hooks** (registered via plugin system)
6. **Built-in hooks** (internal SDK callbacks)

Deduplication prevents the same hook path from being processed twice — for example, when the working directory is the home directory, user and project settings resolve to the same file.

### Managed Hooks and Policy Controls

Enterprise deployments need hooks that users cannot disable. The policy control system at `utils/hooks/hooksConfigSnapshot.ts:18-53` implements this:

```typescript
function getHooksFromAllowedSources(): HooksSettings {
  const policySettings = settingsModule.getSettingsForSource('policySettings')

  if (policySettings?.disableAllHooks === true) return {}
  if (policySettings?.allowManagedHooksOnly === true)
    return policySettings.hooks ?? {}

  if (isRestrictedToPluginOnly('hooks'))
    return policySettings?.hooks ?? {}

  const mergedSettings = settingsModule.getSettings_DEPRECATED()
  if (mergedSettings.disableAllHooks === true)
    return policySettings?.hooks ?? {}

  return mergedSettings.hooks ?? {}
}
```

The critical invariant: **non-managed settings can never disable managed hooks**. Setting `disableAllHooks: true` in project settings only disables non-managed hooks; managed (enterprise policy) hooks continue to run. This mirrors the permission system's deny-trumps-allow principle — security controls at a higher trust level cannot be overridden from below.

### Snapshot-Based Configuration

Hook configuration is captured at startup via `captureHooksConfigSnapshot()` and used for the entire session. This prevents mid-session config file changes from causing inconsistencies — a hook that was active when the session started stays active, and a hook added later doesn't retroactively affect in-progress work. The snapshot is explicitly refreshed only when the user runs `/hooks`.

---

## 10.5 The Hook Execution Pipeline

The heart of the hook system is the `executeHooks` async generator at `utils/hooks.ts:1952-2972` — over 1,000 lines that implement the complete execution pipeline.

### Gate Checks

Three gates must pass before any hook runs:

```typescript
async function* executeHooks({ hookInput, toolUseID, ... }):
  AsyncGenerator<AggregatedHookResult> {
  // Gate 1: All hooks disabled via managed settings
  if (shouldDisableAllHooksIncludingManaged()) return

  // Gate 2: Simple mode (CLAUDE_CODE_SIMPLE env var)
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) return

  // Gate 3: Workspace trust required in interactive mode
  if (shouldSkipHookDueToTrust()) return
```

The trust gate at `utils/hooks.ts:286-296` deserves emphasis. In interactive mode, **no hooks execute until the user accepts the workspace trust dialog**. This was added after real vulnerabilities were discovered where malicious repositories could place hooks in `.claude/settings.json` that would execute when a user opened the directory — even before the user agreed to trust the workspace. Session-end and subagent-stop hooks were particular vectors, firing on cleanup paths that didn't check trust status.

### Hook Matching

The matching pipeline at `getMatchingHooks` (lines 1603-1874) performs six steps:

1. **Config assembly**: Merges snapshot hooks + registered hooks + session hooks + function hooks
2. **Match query extraction** (lines 1616-1670): Determines what field to match against based on event type. For `PreToolUse`/`PostToolUse`, it matches against `tool_name`. For `SessionStart`, against `source` (startup/resume/clear/compact). For `Notification`, against `notification_type`. For `FileChanged`, against `basename(file_path)`.
3. **Pattern matching** (lines 1681-1686): Filters matchers against the match query using the three-mode algorithm (exact, pipe-separated, regex)
4. **Deduplication** (lines 1712-1806): Per-type dedup by content, namespaced by plugin/skill root to prevent cross-plugin collisions
5. **`if` condition filtering** (lines 1808-1848): Permission-rule-syntax pre-filter
6. **HTTP hook filtering** (lines 1853-1864): HTTP hooks blocked for `SessionStart`/`Setup`

### The `if` Condition Pre-Filter

At `utils/hooks.ts:1390-1421`, this optimization avoids spawning processes for hooks that won't match. It compiles the `if` condition into a matcher function using the same permission rule syntax as `settings.json`:

```typescript
async function prepareIfConditionMatcher(
  hookInput: HookInput, tools: Tools | undefined
): Promise<IfConditionMatcher | undefined> {
  if (hookInput.hook_event_name !== 'PreToolUse' &&
      hookInput.hook_event_name !== 'PostToolUse' && ...) return undefined

  const toolName = normalizeLegacyToolName(hookInput.tool_name)
  const tool = tools && findToolByName(tools, hookInput.tool_name)
  const input = tool?.inputSchema.safeParse(hookInput.tool_input)
  const patternMatcher = input?.success && tool?.preparePermissionMatcher
    ? await tool.preparePermissionMatcher(input.data)
    : undefined

  return ifCondition => {
    const parsed = permissionRuleValueFromString(ifCondition)
    if (normalizeLegacyToolName(parsed.toolName) !== toolName) return false
    if (!parsed.ruleContent) return true
    return patternMatcher ? patternMatcher(parsed.ruleContent) : false
  }
}
```

A hook with `if: "Bash(git *)"` will only fire for Bash tool calls where the command starts with `git`. This avoids spawning a process for every Bash invocation.

### Parallel Execution

All matched hooks run in parallel via async generators merged through the `all()` utility:

```typescript
const hookPromises = matchingHooks.map(
  async function* ({ hook, pluginRoot, ... }, hookIndex) {
    if (hook.type === 'callback')  { /* direct invocation */ }
    if (hook.type === 'function')  { /* direct invocation */ }
    if (hook.type === 'prompt')    { yield execPromptHook(...) }
    if (hook.type === 'agent')     { yield execAgentHook(...) }
    if (hook.type === 'http')      { yield execHttpHook(...) }
    // Default: execCommandHook(...)
  }
)

for await (const result of all(hookPromises)) {
  outcomes[result.outcome]++
  // Process each result...
}
```

This is a deliberate design choice: hooks cannot depend on each other's execution order. If two `PreToolUse` hooks both return permission decisions, the conflict is resolved through the permission precedence hierarchy (`deny > ask > allow > passthrough`), not through ordering.

### The Internal Callback Fast-Path

When ALL matched hooks are internal callbacks (e.g., file access tracking, attribution injection), the system skips the full span/progress/abort/JSON-parsing machinery:

```typescript
if (matchingHooks.every(m =>
  m.hook.type === 'callback' || m.hook.type === 'function'
)) {
  for (const [i, { hook }] of matchingHooks.entries()) {
    if (hook.type === 'callback') {
      await hook.callback(hookInput, toolUseID, signal, i, context)
    }
  }
  return  // No progress messages, no spans
}
```

This optimization was measured at `utils/hooks.ts:2037-2067`: 6.01μs → ~1.8μs per `PostToolUse` hit, a 70% reduction. Given that `PostToolUse` fires after *every* tool call, this fast-path eliminates significant overhead on the hot path.

### The `hasHookForEvent` Guard

An even lighter-weight optimization at lines 1582-1593 checks whether *any* hook exists for an event before constructing the hook input object:

```typescript
function hasHookForEvent(hookEvent, appState, sessionId): boolean {
  const snap = getHooksConfigFromSnapshot()?.[hookEvent]
  if (snap && snap.length > 0) return true
  const reg = getRegisteredHooks()?.[hookEvent]
  if (reg && reg.length > 0) return true
  if (appState?.sessionHooks.get(sessionId)?.hooks[hookEvent]) return true
  return false
}
```

This guard sits on every hook call site, turning `createBaseHookInput` (which allocates objects and reads environment variables) into a no-op when no hooks are configured for that event.

---

## 10.6 Exit Code Semantics and JSON Output Protocol

### Exit Code Interpretation

The exit code convention is the hook system's simplest and most elegant API. Core logic at `utils/hooks.ts:2617-2697`:

| Exit Code | Behavior |
|-----------|----------|
| **0** | Success. For `PreToolUse`: stdout not shown to model. For `PostToolUse`: stdout visible in transcript mode. |
| **2** | Blocking error. stderr becomes feedback to the model. For `PreToolUse`: blocks tool call. For `Stop`: forces continued conversation. |
| **Other** | Non-blocking error. stderr shown to user only. Tool call continues. |

The choice of exit code 2 (rather than 1) as the blocking signal is intentional. Exit code 1 is the generic "something went wrong" code — a crashed hook should not accidentally block operations. Exit code 2 requires deliberate intent: `exit 2` in a shell script is an explicit action.

```typescript
if (result.status === 0) {
  yield { message: createAttachmentMessage({ type: 'hook_success', ... }),
          outcome: 'success' }
  return
}

if (result.status === 2) {
  yield {
    blockingError: {
      blockingError: `[${hook.command}]: ${result.stderr || 'No stderr'}`,
      command: hook.command,
    },
    outcome: 'blocking'
  }
  return
}

// Any other non-zero: non-critical error shown to user
yield { message: createAttachmentMessage({ type: 'hook_non_blocking_error', ... }),
        outcome: 'non_blocking_error' }
```

### The JSON Output Protocol

For hooks that need richer communication than exit codes, the system supports structured JSON output. The parser at `utils/hooks.ts:399-451` detects JSON by checking if stdout starts with `{`:

```typescript
function parseHookOutput(stdout: string): {
  json?: HookJSONOutput; plainText?: string; validationError?: string
} {
  const trimmed = stdout.trim()
  if (!trimmed.startsWith('{')) return { plainText: stdout }
  try {
    const result = validateHookJson(trimmed)
    if ('json' in result) return result
    return { plainText: stdout, validationError: result.validationError }
  } catch (e) {
    return { plainText: stdout }
  }
}
```

The synchronous JSON response schema at `types/hooks.ts:50-166` supports a rich set of capabilities through `hookSpecificOutput`:

- **PreToolUse**: `permissionDecision` (allow/deny), `updatedInput` (modify tool arguments), `additionalContext` (inject into conversation)
- **PostToolUse**: `additionalContext`, `updatedMCPToolOutput` (modify MCP tool results)
- **SessionStart**: `additionalContext`, `initialUserMessage` (auto-submit a prompt), `watchPaths` (register file watchers)
- **PermissionRequest**: `decision` (allow/deny)
- **Elicitation**: `action` (accept/decline/cancel)
- **WorktreeCreate**: `worktreePath` (for VCS-agnostic worktree creation)

The `processHookJSONOutput` dispatcher at lines 489-737 (250 lines) routes each response to the appropriate handler based on `hookSpecificOutput.hookEventName`.

### Permission Behavior Aggregation

When multiple hooks return permission decisions, the aggregation follows the same precedence as the permission system itself (lines 2821-2847):

```
deny > ask > allow > passthrough
```

If one hook returns `allow` and another returns `deny`, the result is `deny`. If one returns `allow` and another `ask`, the result is `ask`. This means hooks cannot weaken security — only strengthen it or leave it unchanged.

---

## 10.7 Async Hook Execution

Not all hooks need to block the main execution path. The async hook system provides two background modes:

### Pure Background (`async: true`)

The hook is backgrounded immediately. Its result is polled later via `AsyncHookRegistry.checkForAsyncHookResponses()`. This is appropriate for slow, non-critical operations — telemetry uploads, log aggregation, audit trail writes.

### Background with Wake (`asyncRewake: true`)

The hook runs in the background, but if it exits with code 2 (blocking), it enqueues a notification that wakes the model. This enables asynchronous quality gates: start a slow validation check, let the model continue working, and interrupt it only if the check fails.

### Runtime Async Detection

A hook can dynamically become async by emitting `{"async": true}` as its first stdout line, detected at `utils/hooks.ts:1117-1163`:

```typescript
if (!initialResponseChecked) {
  const firstLine = firstLineOf(stdout).trim()
  if (!firstLine.includes('}')) return
  initialResponseChecked = true
  try {
    const parsed = jsonParse(firstLine)
    if (isAsyncHookJSONOutput(parsed) && !forceSyncExecution) {
      const processId = `async_hook_${child.pid}`
      const backgrounded = executeInBackground({...})
      if (backgrounded) {
        shellCommandTransferred = true
        asyncResolve?.({ stdout, stderr, output, status: 0 })
      }
    }
  } catch (e) { /* ... */ }
}
```

This pattern lets hooks decide at runtime whether they need to be synchronous or can safely background themselves — for example, a validation hook that returns immediately for simple cases but goes async for complex analyses.

### The AsyncHookRegistry

At `utils/hooks/AsyncHookRegistry.ts`, a global `Map<string, PendingAsyncHook>` manages background hooks:

- `registerPendingAsyncHook()`: Adds hook with timeout, starts a progress interval
- `checkForAsyncHookResponses()`: Polls all pending hooks, parses JSON output, removes completed
- `finalizePendingAsyncHooks()`: Shutdown cleanup — kills running hooks, collects final results
- Default async timeout: 15 seconds

---

## 10.8 The Permission Integration

The most safety-critical aspect of the hook system is how hook permission decisions interact with the settings-based permission system. The integration point is `resolveHookPermissionDecision` at `services/tools/toolHooks.ts:332-433`.

The key invariant: **a hook's `allow` decision does NOT bypass settings.json deny/ask rules**.

```typescript
export async function resolveHookPermissionDecision(
  hookPermissionResult, tool, input, toolUseContext, canUseTool, ...
): Promise<{ decision: PermissionDecision; input: Record<string, unknown> }> {

  if (hookPermissionResult?.behavior === 'allow') {
    const hookInput = hookPermissionResult.updatedInput ?? input

    // Rule check still applies even when hook approves
    const ruleCheck = await checkRuleBasedPermissions(tool, hookInput, toolUseContext)
    if (ruleCheck === null) {
      return { decision: hookPermissionResult, input: hookInput }
    }
    if (ruleCheck.behavior === 'deny') {
      return { decision: ruleCheck, input: hookInput }  // Deny overrides hook
    }
    return { decision: await canUseTool(tool, hookInput, ...), input: hookInput }
  }

  if (hookPermissionResult?.behavior === 'deny') {
    return { decision: hookPermissionResult, input }
  }

  return { decision: await canUseTool(tool, askInput, ...), input: askInput }
}
```

This creates a layered security model: hooks can approve actions that settings also approve, but they cannot approve actions that settings deny. A project-level hook that auto-approves all Bash commands will still be overridden by a user-level deny rule for `rm -rf`. The principle is consistent throughout Claude Code: higher-trust configurations always win.

### The `updatedInput` Mechanism

`PreToolUse` hooks can modify tool arguments via `updatedInput` in their JSON response. This enables:

- **Sanitization**: Stripping dangerous flags from commands
- **Transformation**: Rewriting file paths or adding required parameters
- **Interaction satisfaction**: For interactive tools that require user confirmation, a hook providing `updatedInput` counts as satisfying the interaction requirement

---

## 10.9 Stop Hook Orchestration

The `handleStopHooks` function at `query/stopHooks.ts:65-473` orchestrates the complex sequence that runs when Claude finishes its response:

1. Save cache-safe params for `/btw` and side-question recovery
2. Run template job classification (if in job context)
3. Fire extract-memories and auto-dream (fire-and-forget)
4. Clean up computer-use sessions
5. **Execute Stop hooks** — the main purpose
6. Create summary messages with per-hook timing
7. For teammates: run `TaskCompleted` hooks for in-progress tasks, then `TeammateIdle` hooks

Stop hooks receive `last_assistant_message` extracted from the conversation, allowing them to inspect the final response without needing to read the transcript file. If a Stop hook returns exit code 2, the model continues its turn with the hook's feedback — effectively saying "you're not done yet."

A subtle but important design decision: **Stop hooks in agent frontmatter are automatically converted to SubagentStop**. This conversion happens at `utils/hooks/registerFrontmatterHooks.ts:52-54`:

```typescript
if (isAgent && event === 'Stop') {
  targetEvent = 'SubagentStop'
}
```

This prevents a common misconfiguration. Subagent completion triggers `SubagentStop`, not `Stop`. Without this conversion, a Stop hook defined in an agent's frontmatter would never fire.

---

## 10.10 Security Architecture

### Trust Gate

Every hook execution path passes through `shouldSkipHookDueToTrust()`. In interactive mode, hooks will not execute until the user accepts the workspace trust dialog. This is defense-in-depth against malicious repositories that include hooks in their `.claude/settings.json`.

### SSRF Protection

HTTP hooks are protected against server-side request forgery at `utils/hooks/ssrfGuard.ts`. Blocked address ranges include:

| Range | Reason |
|-------|--------|
| `0.0.0.0/8` | "This" network |
| `10.0.0.0/8` | Private |
| `100.64.0.0/10` | CGNAT / shared address space |
| `169.254.0.0/16` | Link-local (cloud metadata endpoints) |
| `172.16.0.0/12` | Private |
| `192.168.0.0/16` | Private |
| `fc00::/7` | Unique local (IPv6) |
| `fe80::/10` | Link-local (IPv6) |

Critically, `127.0.0.0/8` and `::1` (loopback) are **allowed** — local development hooks that POST to `localhost` are a legitimate use case. The guard also handles IPv4-mapped IPv6 addresses by extracting and re-checking the embedded IPv4 address (lines 127-204), preventing bypass through `::ffff:169.254.169.254`.

### Header Injection Prevention

All HTTP hook header values pass through `sanitizeHeaderValue`:

```typescript
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\x00]/g, '')
}
```

This prevents CRLF injection attacks where a crafted header value could inject additional HTTP headers.

### Environment Variable Controls

HTTP hook header interpolation only expands variables explicitly listed in `allowedEnvVars`:

```typescript
function interpolateEnvVars(
  value: string, allowedEnvVars: ReadonlySet<string>
): string {
  return value.replace(
    /\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g,
    (_, braced, unbraced) => {
      const varName = braced ?? unbraced
      if (!allowedEnvVars.has(varName)) return ''
      return process.env[varName] ?? ''
    }
  )
}
```

Without this allowlist, a hook configuration like `headers: {"Authorization": "Bearer $GITHUB_TOKEN"}` could exfiltrate any environment variable the process has access to.

---

## 10.11 Timeout Architecture

Each hook type has carefully tuned default timeouts reflecting its expected execution profile:

| Hook Type | Default Timeout | Rationale |
|-----------|----------------|-----------|
| Command hooks | 10 minutes | Shell scripts may run builds or tests |
| Prompt hooks | 30 seconds | Single LLM call |
| Agent hooks | 60 seconds | Multi-turn but bounded |
| HTTP hooks | 10 minutes | External services may be slow |
| Async hooks | 15 seconds | Background operations |
| SessionEnd hooks | 1.5 seconds | User is waiting to exit |
| Function hooks | 5 seconds | Internal callbacks |

SessionEnd hooks deserve special attention. Their aggressive 1.5-second default (overridable via `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`) exists because they run during shutdown. A slow SessionEnd hook makes the entire application feel sluggish at the moment the user wants to leave. The timeout is configurable for enterprise deployments that need to guarantee audit log delivery, but the default prioritizes user experience.

All timeouts are implemented through combined abort signals:

```typescript
const { signal: abortSignal, cleanup } = createCombinedAbortSignal(signal, {
  timeoutMs: commandTimeoutMs,
})
```

This merges the per-hook timeout with any parent abort signal (e.g., the user pressing Ctrl+C), ensuring hooks are terminated promptly regardless of which signal fires first.

---

## 10.12 Stop Hook Orchestration

The Stop event is uniquely complex — it fires when the model finishes its response, but the hooks may reject the response, triggering a continuation. The orchestration at `query/stopHooks.ts` (474 lines) manages this coordination:

```typescript
export async function handleStopHooks(
  messages: Message[],
  querySource: string,
  options: StopHookOptions,
): Promise<StopHookResult> {
  // 1. Check if any tasks are still pending
  const pendingTaskResult = await checkPendingTasks(messages)
  if (pendingTaskResult.shouldContinue) {
    return { shouldContinue: true, reason: pendingTaskResult.reason }
  }

  // 2. Check if teammates are still working
  const teammateResult = await checkTeammateIdle(messages)
  if (teammateResult.shouldContinue) {
    return { shouldContinue: true, reason: teammateResult.reason }
  }

  // 3. Run user-defined Stop hooks
  const hookResult = await executeStopHooks(messages, querySource)
  if (hookResult.blocked) {
    return { shouldContinue: true, reason: hookResult.feedback }
  }

  return { shouldContinue: false }
}
```

The three-tier check ensures the model doesn't finish prematurely: pending background tasks, working teammates, and user-defined quality gates all get a chance to reject the completion. Each tier can inject feedback that the model sees as a continuation prompt.

For agents (subagents), Stop hooks fire as `SubagentStop` events — they use the same pipeline but with a different event name. The `registerFrontmatterHooks.ts` module at line 68 automatically converts `Stop` hooks in agent frontmatter to `SubagentStop` hooks, preventing agent hooks from interfering with the parent's stop logic.

---

## 10.13 Engineering Patterns Worth Stealing

The hook system contains several patterns applicable to any extensibility framework:

**Lazy JSON stringify**: Hook input is stringified once and shared across all hooks, avoiding redundant serialization when multiple hooks fire for the same event (lines 2124-2140).

**Source-namespaced deduplication**: Dedup keys include the plugin/skill root path, preventing cross-plugin template collisions while allowing identical hooks from different sources to coexist (lines 1448-1455).

**Async generator pipeline**: The entire hook system uses `AsyncGenerator<AggregatedHookResult>` throughout, providing natural backpressure handling. Callers consume results with `for await...of`, and the pipeline automatically pauses when the consumer is busy.

**Session hooks via Map**: Using `Map` instead of plain objects for session-scoped hooks avoids O(N²) copy cost when parallel agents register hooks simultaneously. `Map.set`/`Map.delete` mutate the container without changing its identity, and `Object.is(next, prev)` short-circuits React-style listener notifications.

**Graduated power model**: The four hook types (command → prompt → agent → HTTP) form a graduated power ladder. Simple shell scripts handle 90% of use cases. Prompt hooks add LLM judgment. Agent hooks add multi-turn investigation. HTTP hooks add external system integration. Each level adds capability at the cost of complexity and latency.

---

## Summary

The hook system transforms Claude Code from a fixed-behavior tool into an extensible platform. Its 27 lifecycle events cover every meaningful state transition. Its four hook types span from simple shell one-liners to multi-turn LLM agents. And its execution pipeline achieves sub-microsecond overhead through internal callback fast-paths and `hasHookForEvent` guards while supporting parallel execution of arbitrarily complex external processes.

The security architecture is layered and defense-in-depth: trust gates prevent execution before user consent, SSRF guards block private network access, environment variable allowlists prevent secret exfiltration, and the permission integration ensures hooks can never weaken configured security policies.

For engineers building extensible CLI tools, the key lesson is this: design your extensibility points around *events* rather than *plugins*. The event-based model — where hooks react to lifecycle transitions rather than replacing core behavior — allows unlimited extensibility while preserving the invariants your system depends on. The permission precedence hierarchy (`deny > ask > allow > passthrough`) ensures that adding hooks can only tighten security, never loosen it.

In Chapter 11, we turn from extensibility to the tools that make an AI agent useful in practice — the file operation tools that let Claude Code read, write, edit, search, and manipulate the codebase that is its primary working material.
