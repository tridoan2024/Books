# Chapter 19: Hook Capabilities & Advanced Patterns

Chapter 18 built the hook execution engine — the lifecycle events, the five hook types, the registration system, and the exit-code protocol that turns shell scripts into security gates. That machinery answers the question "how do hooks run?" This chapter answers the harder question: "what can hooks actually do?"

The answer is more than blocking and allowing. Claude Code's hook system supports nine advanced capabilities that transform hooks from simple gatekeepers into active participants in the agent loop. Hooks can rewrite tool arguments before execution. They can transform tool outputs before the LLM sees them. They can inject initial prompts at session start. They can register file watchers. They can inject environment variables through a dedicated file protocol. They can run asynchronously and wake the agent when they complete. They can fire exactly once per session. They can conditionally match specific tool patterns. And they can be loaded dynamically from plugins with hot-reload support.

Each of these capabilities required careful engineering decisions about data flow, security boundaries, and failure modes. This chapter walks through all nine, with implementation code for each, and closes with the architectural patterns that make them composable.

---

## 19.1 `updatedInput` — Hooks That Rewrite Tool Arguments

The most powerful hook capability is argument rewriting. A `PreToolUse` hook can return an `updatedInput` field in its output, and the hook engine will replace the tool's original arguments with the hook's version before execution proceeds.

### The Problem

Consider a corporate environment where every `git push` must target a specific remote, or where file paths need translation from developer-local mounts to CI-container paths. Without argument rewriting, the only options are to block the original command (frustrating) or document a convention and hope the LLM follows it (fragile). Argument rewriting lets hooks silently correct tool inputs, keeping the agent productive while enforcing policy.

### Data Flow

```
Agent generates tool call: Bash("git push origin main")
         |
         v
PreToolUse hook fires
         |
         v
Hook script reads input JSON from stdin:
  { "tool_name": "Bash",
    "tool_input": { "command": "git push origin main" } }
         |
         v
Hook script writes to stdout:
  { "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "updatedInput": { "command": "git push upstream main --no-verify" }
  }}
         |
         v
Hook engine merges updatedInput into tool_input
         |
         v
Bash tool executes: "git push upstream main --no-verify"
```

### Implementation

The hook engine processes `updatedInput` during the result-collection phase, after all hooks for a given event have completed:

```typescript
// hooks.ts — processPreToolUseResults()
interface PreToolUseHookOutput {
  hookEventName: "PreToolUse";
  permissionDecision?: "allow" | "deny" | "ask";
  permissionDecisionReason?: string;
  updatedInput?: Record<string, unknown>;
}

function processPreToolUseResults(
  originalInput: Record<string, unknown>,
  hookResults: HookResult[],
): { finalInput: Record<string, unknown>; blocked: boolean; reason?: string } {
  let currentInput = { ...originalInput };
  let blocked = false;
  let reason: string | undefined;

  for (const result of hookResults) {
    // Exit code 2 = block (as covered in Chapter 18)
    if (result.exitCode === 2) {
      blocked = true;
      reason = result.stderrOutput;
      break;
    }

    // Parse stdout for hook-specific output
    const parsed = parseHookOutput(result.stdoutOutput);
    if (parsed?.updatedInput) {
      // Shallow merge — hook can override specific fields
      currentInput = { ...currentInput, ...parsed.updatedInput };
    }
  }

  return { finalInput: currentInput, blocked, reason };
}
```

### Merge Semantics: Shallow, Not Deep

The merge is deliberately shallow. If a hook returns `{ "command": "new-command" }`, only the `command` field is replaced; other fields like `timeout` or `description` remain intact. Deep merge was considered and rejected for two reasons:

1. **Predictability.** A hook author writing `{"command": "new-cmd"}` expects to replace the command, not to have their value merged with nested properties of the original command object. Shallow merge matches this mental model.

2. **Security.** Deep merge introduces ambiguity. If the original input has `{ "command": "safe", "env": { "PATH": "/usr/bin" } }` and a hook returns `{ "env": { "EVIL": "1" } }`, deep merge would preserve both `PATH` and `EVIL`. Shallow merge replaces the entire `env` object, forcing the hook to be explicit about everything it permits.

### Ordering Guarantees

When multiple hooks return `updatedInput`, they apply in registration order — the same order covered in Chapter 18's priority system. Each hook sees the cumulative result of all previous hooks' modifications. This creates a pipeline:

```
Original input
    → Hook A: rewrites "command" field
        → Hook B: sees Hook A's rewritten command, adds "timeout"
            → Hook C: sees both modifications, applies final transform
                → Tool executes with final input
```

If this composability is undesirable, the hook author can inspect the input and bail out (exit 0, no output) when it detects modifications from another hook.

### Security Constraint: No Schema Expansion

The `updatedInput` can only modify fields that already exist in the tool's input schema or add fields the tool explicitly accepts. The hook engine validates the merged input against the tool's Zod schema before proceeding:

```typescript
function validateMergedInput(
  tool: Tool,
  mergedInput: Record<string, unknown>,
): boolean {
  const result = tool.inputSchema.safeParse(mergedInput);
  if (!result.success) {
    logWarning(
      `Hook produced invalid updatedInput for ${tool.name}: ` +
      `${result.error.message}. Using original input.`,
    );
    return false;
  }
  return true;
}
```

If validation fails, the original input is used and a warning is logged. Hooks cannot silently inject arbitrary fields into tool inputs.

---

## 19.2 `updatedMCPToolOutput` — Hooks That Transform Tool Results

Where `updatedInput` modifies what goes into a tool, `updatedMCPToolOutput` modifies what comes out. This is specifically designed for MCP tool results, where hooks can filter, redact, or enrich the output before it enters the LLM's context window.

### The Problem

MCP servers are external code. They may return sensitive data (database connection strings, internal URLs, PII) that should not be included in the conversation. They may also return verbose output that wastes context tokens. `PostToolUse` hooks with `updatedMCPToolOutput` solve both problems.

### Data Flow

```
MCP tool executes and returns result
         |
         v
PostToolUse hook fires with:
  { "tool_name": "mcp__myserver__query",
    "tool_input": { ... },
    "tool_output": { "content": [{ "type": "text", "text": "..." }] } }
         |
         v
Hook script processes output, returns:
  { "hookSpecificOutput": {
      "hookEventName": "PostToolUse",
      "updatedMCPToolOutput": {
        "content": [{ "type": "text", "text": "[REDACTED: 3 rows removed]" }]
      }
  }}
         |
         v
Hook engine replaces MCP result with hook's version
         |
         v
LLM sees only the filtered output
```

### Implementation

```typescript
// hooks.ts — processPostToolUseResults()
interface PostToolUseHookOutput {
  hookEventName: "PostToolUse";
  updatedMCPToolOutput?: MCPToolResult;
  outputToAppend?: string;
}

function processPostToolUseResults(
  toolName: string,
  originalOutput: ToolResult,
  hookResults: HookResult[],
): ToolResult {
  let currentOutput = originalOutput;

  for (const result of hookResults) {
    const parsed = parseHookOutput(result.stdoutOutput);

    // MCP output replacement — only for MCP tools
    if (parsed?.updatedMCPToolOutput && isMCPTool(toolName)) {
      currentOutput = {
        ...currentOutput,
        content: parsed.updatedMCPToolOutput.content,
      };
    }

    // Generic output append — works for all tools
    if (parsed?.outputToAppend) {
      currentOutput = appendToOutput(currentOutput, parsed.outputToAppend);
    }
  }

  return currentOutput;
}
```

### Why MCP-Only?

The restriction to MCP tools is deliberate. Built-in tools (Bash, FileRead, FileWrite) have outputs that the agent loop itself depends on — file contents for edit verification, exit codes for error handling, search results for navigation. Allowing hooks to silently replace these outputs would break the agent's internal consistency checks.

MCP tools, by contrast, are opaque to the agent loop. Their outputs are passed straight to the LLM with no internal interpretation. This makes them safe targets for transformation.

### The `outputToAppend` Escape Hatch

For built-in tools, `outputToAppend` provides a less powerful but safer alternative. Instead of replacing the output, it appends text. A linting hook can append "Warning: this file has 3 lint errors" to a FileWrite result without disturbing the original write confirmation that the agent loop needs to verify the edit succeeded.

---

## 19.3 `initialUserMessage` — Auto-Prompting at Session Start

`SessionStart` hooks can return an `initialUserMessage` field that gets injected as the first user message in the conversation. This turns hooks into automated workflow triggers.

### Use Cases

- **CI/CD mode:** A hook detects environment variables indicating the session is running in a CI pipeline and injects "Run all tests and report failures" as the initial prompt.
- **Code review mode:** A hook detects uncommitted changes and injects "Review the staged changes for security issues."
- **Resume mode:** A hook loads the last session's context from a file and injects "Continue from where we left off: [context]."

### Implementation

```typescript
// hooks.ts — processSessionStartResults()
interface SessionStartHookOutput {
  hookEventName: "SessionStart";
  initialUserMessage?: string;
  watchPaths?: string[];  // covered in 19.4
}

function processSessionStartResults(
  hookResults: HookResult[],
): SessionStartOutcome {
  let initialMessage: string | undefined;
  const watchPaths: string[] = [];

  for (const result of hookResults) {
    const parsed = parseHookOutput(result.stdoutOutput);

    if (parsed?.initialUserMessage) {
      // Last writer wins — later hooks override earlier ones
      initialMessage = parsed.initialUserMessage;
    }

    if (parsed?.watchPaths) {
      watchPaths.push(...parsed.watchPaths);
    }
  }

  return { initialMessage, watchPaths };
}
```

### The "Last Writer Wins" Decision

When multiple `SessionStart` hooks return `initialUserMessage`, the last one wins. This was chosen over alternatives:

| Strategy | Problem |
|----------|---------|
| First writer wins | Later, higher-priority hooks cannot override |
| Concatenate all | Creates incoherent prompts ("Run tests. Also review code. Also deploy.") |
| Last writer wins | Higher-priority hooks (loaded later) naturally override |
| Error on conflict | Too restrictive for extensible systems |

The ordering follows the hook registration priority from Chapter 18: managed hooks load before project hooks, which load before user hooks. Since user hooks load last and we use "last writer wins," user-level hooks always override managed hooks for initial messages. If the inverse priority is needed, the managed hook can use the `once: true` flag with a higher priority marker.

### Auto-Submit Behavior

The initial message is not merely placed in the input buffer — it is auto-submitted. The session start sequence treats it as if the user had typed and pressed Enter:

```typescript
// sessionInit.ts
async function initializeSession(config: SessionConfig): Promise<void> {
  // Run SessionStart hooks
  const hookOutcome = await runSessionStartHooks(config);

  // If a hook provided an initial message, auto-submit it
  if (hookOutcome.initialMessage) {
    await submitUserMessage(hookOutcome.initialMessage, {
      source: "hook",
      autoSubmit: true,
    });
  }

  // Register any file watchers
  if (hookOutcome.watchPaths.length > 0) {
    registerFileWatchers(hookOutcome.watchPaths);
  }
}
```

The `source: "hook"` annotation ensures telemetry correctly attributes the message to automation rather than user input. This distinction matters for usage analytics and for the auto-mode classifier (Chapter 16), which may treat hook-initiated prompts differently from user-initiated ones.

---

## 19.4 `watchPaths` — File Watcher Registration

`SessionStart` hooks can return a `watchPaths` array containing file or directory paths. The hook engine registers `fs.watch` listeners on these paths and fires `FileChanged` events whenever modifications are detected.

### Architecture

```
SessionStart hook returns:
  { "watchPaths": ["/project/src", "/project/config.yaml"] }
         |
         v
Hook engine calls registerFileWatchers()
         |
         v
fs.watch("/project/src", { recursive: true })
fs.watch("/project/config.yaml")
         |
         v
File changes detected
         |
         v
FileChanged hook event fires with:
  { "path": "/project/src/auth.ts",
    "changeType": "modify" }
```

### Implementation

```typescript
// fileWatcher.ts
interface WatchEntry {
  path: string;
  watcher: FSWatcher;
  debounceTimer?: NodeJS.Timeout;
}

const DEBOUNCE_MS = 300;
const activeWatchers: Map<string, WatchEntry> = new Map();

function registerFileWatchers(paths: string[]): void {
  for (const watchPath of paths) {
    // Prevent duplicate watchers
    if (activeWatchers.has(watchPath)) continue;

    const resolvedPath = path.resolve(watchPath);

    // Validate path exists and is within project boundary
    if (!isWithinProjectRoot(resolvedPath)) {
      logWarning(`watchPaths: ${watchPath} is outside project root, skipping`);
      continue;
    }

    const isDir = fs.statSync(resolvedPath, { throwIfNoEntry: false })?.isDirectory();

    try {
      const watcher = fs.watch(
        resolvedPath,
        { recursive: isDir ?? false },
        (eventType, filename) => {
          handleFileChange(resolvedPath, eventType, filename);
        },
      );

      watcher.on("error", (err) => {
        logWarning(`watchPaths: watcher error for ${watchPath}: ${err.message}`);
        cleanupWatcher(watchPath);
      });

      activeWatchers.set(watchPath, { path: resolvedPath, watcher });
    } catch (err) {
      logWarning(`watchPaths: failed to watch ${watchPath}: ${(err as Error).message}`);
    }
  }
}

function handleFileChange(
  basePath: string,
  eventType: string,
  filename: string | null,
): void {
  const fullPath = filename ? path.join(basePath, filename) : basePath;
  const entry = activeWatchers.get(basePath);
  if (!entry) return;

  // Debounce: editors save files in multiple steps (write tmp, rename)
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
  entry.debounceTimer = setTimeout(() => {
    runHooksForEvent("FileChanged", {
      path: fullPath,
      changeType: eventType === "rename" ? "rename" : "modify",
    });
  }, DEBOUNCE_MS);
}
```

### Debouncing

The 300ms debounce is critical. Text editors like VS Code write files through a temporary-rename cycle: write to `.tmp`, `fsync`, rename to target. Without debouncing, a single save triggers two or three `FileChanged` events. The debounce collapses these into one.

### Security Boundary

Watch paths are validated against the project root. A hook cannot register watchers for `/etc/passwd` or `~/.ssh/`. This prevents a malicious plugin hook from monitoring sensitive system files. The validation function uses `path.resolve()` to canonicalize the path before checking the prefix, preventing traversal attacks like `watchPaths: ["/project/../../etc"]`.

### Cleanup

Watchers are cleaned up on session end. The `cleanupAllWatchers()` function is called from the session teardown sequence:

```typescript
function cleanupAllWatchers(): void {
  for (const [watchPath, entry] of activeWatchers) {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.watcher.close();
  }
  activeWatchers.clear();
}
```

---

## 19.5 `CLAUDE_ENV_FILE` — Environment Variable Injection

Hooks need environment variables. A secret-scanning hook needs to know the project root. A linting hook needs the path to the linter config. But embedding environment variables directly in `settings.json` is fragile — they change across machines, across projects, and across CI environments.

The `CLAUDE_ENV_FILE` protocol solves this by pointing to a file that contains key-value pairs. The hook engine reads this file at session start and injects its contents into the environment of every hook subprocess.

### The Protocol

```bash
# Set in the shell environment before launching the agent
export CLAUDE_ENV_FILE="/path/to/env-vars.txt"
```

The env file uses a simple format:

```
# Comments are allowed
PROJECT_ROOT=/Users/dev/myproject
LINT_CONFIG=/Users/dev/myproject/.eslintrc.js
CI_MODE=true
CUSTOM_HOOK_DATA=some-value
```

### Implementation

```typescript
// envFile.ts
const ENV_FILE_VAR = "CLAUDE_ENV_FILE";

interface EnvFileResult {
  variables: Record<string, string>;
  errors: string[];
}

function loadEnvFile(): EnvFileResult {
  const envFilePath = process.env[ENV_FILE_VAR];
  if (!envFilePath) return { variables: {}, errors: [] };

  const resolvedPath = path.resolve(envFilePath);
  const errors: string[] = [];

  // Security: env file must be owned by current user
  try {
    const stat = fs.statSync(resolvedPath);
    if (stat.uid !== process.getuid?.()) {
      errors.push(
        `${ENV_FILE_VAR}: ${resolvedPath} is not owned by current user, skipping`,
      );
      return { variables: {}, errors };
    }
  } catch {
    errors.push(`${ENV_FILE_VAR}: ${resolvedPath} does not exist`);
    return { variables: {}, errors };
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const variables: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Skip comments and blank lines
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      errors.push(`${ENV_FILE_VAR}: invalid line (no =): ${trimmed}`);
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    // Validate key format
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push(`${ENV_FILE_VAR}: invalid variable name: ${key}`);
      continue;
    }

    variables[key] = value;
  }

  return { variables, errors };
}
```

### Injection Point

The loaded variables are merged into the environment of every hook subprocess, with explicit precedence: env-file variables override neither the parent process environment nor hook-specific environment variables set in `settings.json`. They fill the gap between "globally available" and "hook-specifically configured":

```typescript
function buildHookEnvironment(
  hookConfig: HookConfig,
  envFileVars: Record<string, string>,
): Record<string, string> {
  return {
    ...process.env,                    // Base: parent process env
    ...envFileVars,                    // Layer 2: env file variables
    ...hookConfig.env,                 // Layer 3: hook-specific env from settings
    CLAUDE_HOOK_EVENT: hookConfig.event, // Always injected
    CLAUDE_SESSION_ID: getSessionId(), // Always injected
  } as Record<string, string>;
}
```

### Ownership Check

The ownership check (`stat.uid !== process.getuid()`) prevents a privilege escalation vector. If the agent runs as user A but the env file is writable by user B, user B could inject arbitrary environment variables into user A's hook processes. This matters in multi-user CI systems where shared directories are common.

### Why Not `.env` Parsing?

The format deliberately avoids dotenv conventions like quoted values (`KEY="value"`), variable interpolation (`KEY=$OTHER`), and multi-line values. These features add parsing complexity and attack surface. The env file format is intentionally dumb — key=value, one per line, no escaping — because its contents are injected into subprocess environments where shell interpretation has already happened.

---

## 19.6 Async Hooks with `asyncRewake`

Most hooks run synchronously on the critical path: the tool execution blocks until all hooks complete. But some hooks need minutes, not milliseconds — a security scanner, a large test suite, a deployment verification. Running these synchronously would freeze the agent. The `asyncRewake` capability lets a hook run in the background and wake the agent when it finishes.

### How It Works

A hook declares itself asynchronous by returning the `asyncRewake` field:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "asyncRewake": {
      "taskId": "security-scan-a1b2c3",
      "statusMessage": "Running security scan...",
      "pollIntervalMs": 5000
    }
  }
}
```

The hook engine immediately proceeds (does not block), creates a background task to track the async hook, and periodically polls for completion.

### Implementation

```typescript
// asyncHookManager.ts
interface AsyncHookTask {
  taskId: string;
  hookConfig: HookConfig;
  statusMessage: string;
  pollIntervalMs: number;
  startTime: number;
  completed: boolean;
  result?: HookResult;
}

const asyncTasks: Map<string, AsyncHookTask> = new Map();
const MAX_ASYNC_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function registerAsyncHook(
  hookConfig: HookConfig,
  asyncRewake: AsyncRewakeConfig,
): void {
  const task: AsyncHookTask = {
    taskId: asyncRewake.taskId,
    hookConfig,
    statusMessage: asyncRewake.statusMessage,
    pollIntervalMs: asyncRewake.pollIntervalMs ?? 5000,
    startTime: Date.now(),
    completed: false,
  };

  asyncTasks.set(task.taskId, task);

  // Start polling loop
  scheduleAsyncPoll(task);
}

async function scheduleAsyncPoll(task: AsyncHookTask): Promise<void> {
  const timer = setInterval(async () => {
    // Timeout check
    if (Date.now() - task.startTime > MAX_ASYNC_TIMEOUT_MS) {
      clearInterval(timer);
      task.completed = true;
      task.result = {
        exitCode: 1,
        stdoutOutput: "",
        stderrOutput: `Async hook ${task.taskId} timed out after 10 minutes`,
      };
      emitAsyncHookComplete(task);
      return;
    }

    // Poll the hook's completion signal
    const pollResult = await pollAsyncHook(task);
    if (pollResult.completed) {
      clearInterval(timer);
      task.completed = true;
      task.result = pollResult.result;
      emitAsyncHookComplete(task);
    }
  }, task.pollIntervalMs);
}
```

### The Rewake Mechanism

When the async hook completes, the engine emits an `AsyncHookComplete` event that the agent loop listens for. If the agent is idle (waiting for user input), the completion can inject a system message summarizing the result:

```typescript
function emitAsyncHookComplete(task: AsyncHookTask): void {
  const result = task.result;
  if (!result) return;

  // If the hook blocked (exit code 2), inject an urgent message
  if (result.exitCode === 2) {
    injectSystemMessage(
      `[Hook Alert] ${task.statusMessage} completed with a block: ` +
      `${result.stderrOutput}`,
      { priority: "high" },
    );
  } else if (result.stdoutOutput.trim()) {
    injectSystemMessage(
      `[Hook Complete] ${task.statusMessage}: ${result.stdoutOutput.trim()}`,
      { priority: "normal" },
    );
  }

  asyncTasks.delete(task.taskId);
}
```

### Integration with the Task System

Async hooks integrate with the task management system covered in Chapter 14. Each async hook creates a background task of type `hook_async`, visible through the task list UI. This lets the user monitor long-running hooks, cancel them, and see their results alongside other background tasks.

### Timeout and Cleanup

The 10-minute maximum prevents forgotten async hooks from leaking resources indefinitely. On session teardown, all active async hooks are cancelled:

```typescript
function cleanupAsyncHooks(): void {
  for (const [taskId, task] of asyncTasks) {
    if (!task.completed) {
      logInfo(`Cancelling async hook: ${taskId}`);
      // Kill any subprocess if still running
      killAsyncHookProcess(task);
    }
  }
  asyncTasks.clear();
}
```

---

## 19.7 Once-Only Hooks with `once: true`

Some hooks should fire exactly once per session. A session-setup hook that configures environment variables, a one-time authentication check, a workspace validation that only needs to run when the agent starts — these all fit the once-only pattern.

### Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/check-auth.sh",
            "once": true,
            "timeout": 10000,
            "statusMessage": "Checking authentication..."
          }
        ]
      }
    ]
  }
}
```

### Implementation

The implementation uses a `Set<string>` of hook identifiers that have already fired. The identifier is derived from the hook's command and event combination:

```typescript
// hooks.ts
const firedOnceHooks: Set<string> = new Set();

function buildOnceKey(hookConfig: HookConfig, event: string): string {
  // Use command + event as the dedup key
  // This means the same script registered for different events
  // fires once PER EVENT, not once globally
  return `${event}:${hookConfig.command}`;
}

function shouldSkipOnceHook(hookConfig: HookConfig, event: string): boolean {
  if (!hookConfig.once) return false;
  const key = buildOnceKey(hookConfig, event);
  return firedOnceHooks.has(key);
}

function markOnceHookFired(hookConfig: HookConfig, event: string): void {
  if (!hookConfig.once) return;
  const key = buildOnceKey(hookConfig, event);
  firedOnceHooks.add(key);
}
```

### Per-Event, Not Global

The dedup key includes the event name. If the same script is registered for both `PreToolUse` and `PostToolUse` with `once: true`, it fires once for each event — not once total. This matches the expected behavior: a hook that checks authentication before the first tool call should not suppress a different hook that logs the first tool result.

### Reset on Compaction

When the context is compacted (Chapter 6), once-hooks are optionally reset. The reasoning: if the conversation has been running long enough to trigger compaction, the session state may have drifted enough that re-running a once-hook is appropriate. This is configurable via `onceResetOnCompact: true`:

```typescript
function handleCompactionEvent(): void {
  // Reset once-hooks that opted into compaction reset
  for (const key of [...firedOnceHooks]) {
    const hookConfig = lookupHookByKey(key);
    if (hookConfig?.onceResetOnCompact) {
      firedOnceHooks.delete(key);
    }
  }
}
```

---

## 19.8 Conditional Execution with `if` Matchers

Chapter 18 introduced the `matcher` field that controls which tools trigger a hook. The `if` field extends this with pattern-matching syntax that provides finer-grained control.

### Syntax

The `if` field uses the same `Tool(pattern)` syntax as the permission system (Chapter 15):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "if": "Bash(git *)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/git-policy.sh"
          }
        ]
      }
    ]
  }
}
```

This hook fires only for Bash tool calls where the command starts with `git `. It will not fire for `Bash(npm install)` or `FileRead(src/main.ts)`.

### Pattern Language

The pattern language is a subset of the permission rule syntax:

| Pattern | Matches |
|---------|---------|
| `Bash(git *)` | Any Bash command starting with "git " |
| `Bash(npm install *)` | npm install with any arguments |
| `FileWrite(src/**)` | File writes anywhere under src/ |
| `FileRead(*.env)` | Reading any .env file |
| `mcp__*` | Any MCP tool invocation |
| `Bash(* --force *)` | Any command containing --force |

### Implementation

The `if` field is parsed into a `ToolPattern` at hook registration time, not at match time. This avoids re-parsing the pattern on every tool call:

```typescript
// hookMatcher.ts
interface ToolPattern {
  toolName: string;       // "Bash", "FileWrite", "*", etc.
  argumentGlob?: string;  // The pattern inside parentheses
}

function parseToolPattern(pattern: string): ToolPattern | null {
  // Pattern format: ToolName(glob) or ToolName or *
  const parenIdx = pattern.indexOf("(");
  if (parenIdx === -1) {
    return { toolName: pattern };
  }

  if (!pattern.endsWith(")")) return null;

  const toolName = pattern.slice(0, parenIdx);
  const argumentGlob = pattern.slice(parenIdx + 1, -1);

  return { toolName, argumentGlob };
}

function matchesToolPattern(
  pattern: ToolPattern,
  toolName: string,
  toolInput: Record<string, unknown>,
): boolean {
  // Tool name match (supports * wildcard)
  if (pattern.toolName !== "*" && pattern.toolName !== toolName) {
    return false;
  }

  // If no argument glob, tool name match is sufficient
  if (!pattern.argumentGlob) return true;

  // Extract the matchable string from tool input
  const matchString = extractMatchString(toolName, toolInput);
  return globMatch(pattern.argumentGlob, matchString);
}

function extractMatchString(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  // Different tools expose different matchable fields
  switch (toolName) {
    case "Bash":
      return (toolInput.command as string) ?? "";
    case "FileRead":
    case "FileWrite":
    case "FileEdit":
      return (toolInput.file_path as string) ?? "";
    case "GlobTool":
      return (toolInput.pattern as string) ?? "";
    case "GrepTool":
      return (toolInput.pattern as string) ?? "";
    default:
      // MCP tools: match on the full tool name
      return toolName;
  }
}
```

### `if` vs. `matcher`

The `matcher` field and the `if` field serve different roles:

| Feature | `matcher` | `if` |
|---------|-----------|------|
| Scope | Tool name only | Tool name + arguments |
| Syntax | Simple string (e.g., "Bash") | Pattern (e.g., "Bash(git *)") |
| Evaluation | String equality | Glob matching |
| When to use | Broad tool-type filtering | Fine-grained argument matching |

They compose conjunctively: if both `matcher` and `if` are specified, both must match for the hook to fire. This lets you write `"matcher": "Bash", "if": "Bash(git push *)"` — though in practice, the `if` pattern alone is sufficient since it already implies the tool name.

---

## 19.9 Plugin-Sourced Hooks with Hot-Reload

Hooks do not have to live in `settings.json`. The plugin system (covered in detail in Chapter 37) can contribute hooks, and these hooks support hot-reload when the plugin is updated.

### Plugin Hook Discovery

When a plugin is loaded, the plugin loader scans its manifest for hook declarations:

```typescript
// pluginLoader.ts — relevant excerpt
interface PluginManifest {
  name: string;
  version: string;
  skills?: SkillDefinition[];
  hooks?: PluginHookDefinition[];
  mcpServers?: MCPServerDefinition[];
}

interface PluginHookDefinition {
  event: HookEventName;
  matcher?: string;
  if?: string;
  command: string;
  timeout?: number;
  once?: boolean;
  statusMessage?: string;
}
```

### Registration

Plugin hooks are registered with a `source: "plugin"` marker that distinguishes them from project and user hooks:

```typescript
// hookRegistry.ts
interface RegisteredHook {
  config: HookConfig;
  source: "managed" | "project" | "user" | "plugin";
  pluginName?: string;
  registeredAt: number;
}

function registerPluginHooks(
  pluginName: string,
  hooks: PluginHookDefinition[],
): void {
  for (const hookDef of hooks) {
    const config = convertPluginHookToConfig(hookDef, pluginName);
    registerHook({
      config,
      source: "plugin",
      pluginName,
      registeredAt: Date.now(),
    });
  }
}
```

### Hot-Reload

When a plugin is updated (via marketplace update or manual replacement), its hooks are re-registered without restarting the session:

```typescript
// pluginHotReload.ts
function handlePluginUpdate(
  pluginName: string,
  newManifest: PluginManifest,
): void {
  // Step 1: Deregister all existing hooks from this plugin
  deregisterPluginHooks(pluginName);

  // Step 2: Register new hooks from updated manifest
  if (newManifest.hooks) {
    registerPluginHooks(pluginName, newManifest.hooks);
  }

  // Step 3: Clear once-fired state for this plugin's hooks
  clearOnceStateForPlugin(pluginName);

  logInfo(`Hot-reloaded hooks for plugin: ${pluginName}`);
}

function deregisterPluginHooks(pluginName: string): void {
  const hookRegistry = getHookRegistry();
  hookRegistry.removeWhere(
    (hook) => hook.source === "plugin" && hook.pluginName === pluginName,
  );
}
```

### Priority Ordering

Plugin hooks slot into the registration priority between managed hooks and project hooks:

```
Priority (highest first):
  1. Managed hooks (enterprise policy)
  2. Plugin hooks (third-party extensions)
  3. Project hooks (from .claude/settings.json)
  4. User hooks (from ~/.claude/settings.json)
```

This ordering means managed hooks can always override plugin behavior, while plugins override project-local hooks. The rationale: a security-focused plugin (like a corporate compliance scanner) should take precedence over project-level hooks that might be less stringent.

### Sandboxing

Plugin hooks run with the same subprocess isolation as all other hooks — they inherit environment variables, respect timeout limits, and use the standard exit-code protocol. However, an additional constraint applies: plugin hooks cannot use the `updatedInput` capability unless the plugin is explicitly trusted by the user. This prevents a malicious plugin from silently rewriting tool arguments:

```typescript
function shouldAllowUpdatedInput(hook: RegisteredHook): boolean {
  if (hook.source !== "plugin") return true;

  // Plugin hooks need explicit trust for input rewriting
  return isPluginTrustedForInputRewrite(hook.pluginName!);
}
```

---

## 19.10 Composing Capabilities

The nine capabilities described above are not independent features — they compose. A single hook configuration can combine multiple capabilities:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "if": "Bash(git push *)",
        "once": true,
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/pre-push-check.sh",
            "timeout": 30000,
            "statusMessage": "Running pre-push validation..."
          }
        ]
      }
    ]
  }
}
```

This hook fires only for `git push` commands (`if`), runs only once per session (`once`), has a 30-second timeout, and the script can return `updatedInput` to modify the push command or exit code 2 to block it entirely.

### Composition Matrix

| Capability | Composes With | Conflict |
|------------|---------------|----------|
| `updatedInput` | `if`, `once`, async | Cannot compose with `updatedMCPToolOutput` (different events) |
| `updatedMCPToolOutput` | `if`, `once` | PostToolUse only |
| `initialUserMessage` | `watchPaths` | SessionStart only |
| `watchPaths` | `initialUserMessage` | SessionStart only |
| `asyncRewake` | `if`, `once` | Cannot return `updatedInput` (execution already proceeded) |
| `once` | All others | Suppresses subsequent firings |
| `if` | All others | Filters before any capability fires |
| `CLAUDE_ENV_FILE` | All others | Orthogonal (environment layer) |
| Plugin hot-reload | All others | Re-registers after update |

### The Execution Pipeline

When a tool call fires, the hook engine processes each registered hook through this pipeline:

```
For each registered hook matching the event:
    1. Check `if` pattern → skip if no match
    2. Check `once` flag → skip if already fired
    3. Build environment (parent + env file + hook-specific)
    4. Execute hook subprocess with timeout
    5. Parse stdout for hookSpecificOutput
    6. If asyncRewake → register background task, continue
    7. If exit code 2 → block, stop processing
    8. If updatedInput → merge into tool input
    9. Mark once-hook as fired
    10. Continue to next hook
```

This pipeline is the complete hook execution flow for `PreToolUse`. `PostToolUse` replaces steps 7-8 with `updatedMCPToolOutput` and `outputToAppend` processing. `SessionStart` replaces them with `initialUserMessage` and `watchPaths` collection.

---

## 19.11 Architecture Decisions and Trade-Offs

### AD-1: Why Shell Scripts, Not In-Process Callbacks?

Every hook runs as a subprocess. This adds ~50ms of process spawn overhead per hook. In-process callbacks would be near-instantaneous. But subprocess isolation provides three properties that in-process callbacks cannot:

1. **Language independence.** Hooks can be written in any language — Python, Bash, Ruby, Go. The team's existing scripts work without modification.
2. **Crash isolation.** A segfaulting hook kills the subprocess, not the agent. In-process callbacks that throw unhandled exceptions or corrupt memory would crash the entire agent.
3. **Security boundary.** Hook subprocesses cannot read the agent's memory, modify its state, or access its API keys. They communicate only through stdin/stdout/stderr and exit codes.

The 50ms overhead is acceptable because hooks fire at tool-call boundaries, which already involve LLM API round trips measured in seconds. Adding 50ms of hook overhead to a 2-second API call is a 2.5% slowdown.

### AD-2: Why JSON for Hook I/O, Not Environment Variables?

The hook engine sends input via stdin as JSON and reads output from stdout as JSON. An alternative design would encode the input as environment variables (`HOOK_TOOL_NAME=Bash`, `HOOK_COMMAND=git push`) and read the output as exit codes only.

JSON was chosen because:
- Environment variables have platform-dependent size limits (32KB on many Linux systems). A large tool input could exceed this.
- Structured output (`updatedInput`, `asyncRewake`) cannot be expressed as exit codes.
- JSON is parseable in every language without shell-quoting concerns.
- The same format works identically on macOS, Linux, and Windows.

### AD-3: Why "Last Writer Wins" for `initialUserMessage`?

As discussed in section 19.3, competing strategies were evaluated. "Last writer wins" was chosen because it aligns with the hook priority ordering — user hooks override project hooks, project hooks override managed hooks — and because concatenation of multiple initial messages creates incoherent prompts.

### AD-4: Why Restrict `updatedMCPToolOutput` to MCP Tools?

Built-in tool outputs are consumed by the agent loop's internal logic. The Bash tool's exit code determines error handling. FileEdit's output confirms whether the edit succeeded. Allowing hooks to rewrite these outputs would break invariants that the agent loop depends on, creating subtle and hard-to-debug failures.

MCP tools have no such internal consumers — their output goes directly to the LLM. This makes them safe targets for transformation.

### AD-5: Why `CLAUDE_ENV_FILE` Instead of Inline Environment Variables?

Settings JSON supports `"env": { "KEY": "VALUE" }` per hook. `CLAUDE_ENV_FILE` exists for cross-hook variables that every hook needs — project root, CI flags, custom paths. Without it, every hook configuration would duplicate the same environment variables, creating maintenance burden and drift risk.

The file-based approach also supports dynamic generation. A CI pipeline can write a fresh env file before launching the agent, containing build-specific values like commit SHA, branch name, and artifact paths. This would be impossible with static JSON configuration.

### AD-6: Why 10-Minute Timeout for Async Hooks?

The timeout balances two extremes:
- **Too short (1 minute):** Kills legitimate security scans, test suites, and deployment verifications.
- **Too long (1 hour):** A forgotten async hook leaks a polling interval and a subprocess handle indefinitely.

Ten minutes covers 95% of legitimate use cases (most CI steps complete in under 5 minutes) while providing a hard cap that prevents resource leaks. For truly long-running operations, the hook should use a dedicated background task through the task system (Chapter 14) instead of the async hook mechanism.

---

## 19.12 Error Handling Patterns

Hooks run external code. External code fails. The hook engine must handle failures gracefully without crashing the agent or silently dropping security checks.

### The Failure Hierarchy

```
Hook failure modes (ordered by severity):
    1. Hook script not found → log warning, skip hook
    2. Hook script not executable → log warning, skip hook  
    3. Hook script times out → kill subprocess, treat as non-blocking error
    4. Hook script crashes (non-zero, non-2 exit) → log error, continue
    5. Hook script exit 2 → treat as intentional block
    6. Hook stdout unparseable → log warning, ignore output
    7. Hook updatedInput fails schema validation → use original input
```

### Fail-Open vs. Fail-Closed

The default behavior for failures (modes 1-4, 6-7) is **fail-open**: the tool call proceeds as if the hook did not exist. This is deliberate. If hooks were fail-closed (blocking on any error), a broken hook script would paralyze the entire agent.

The exception is exit code 2, which is always treated as an intentional block. This is the hook author's explicit signal that something is wrong. Even if the hook's stderr output is empty, exit code 2 blocks the tool call.

For environments that need fail-closed behavior, the hook script itself should implement it:

```bash
#!/usr/bin/env bash
set -euo pipefail

# This hook is fail-closed: if ANYTHING goes wrong, block the action
trap 'echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"Hook error: safety check could not complete\"}}" >&2; exit 2' ERR

# ... actual validation logic ...
exit 0
```

### Timeout Handling

When a hook exceeds its configured timeout (default: 10 seconds for synchronous hooks), the subprocess is killed with `SIGTERM`, followed by `SIGKILL` after a 1-second grace period:

```typescript
function killHookProcess(
  child: ChildProcess,
  hookName: string,
): void {
  // Graceful shutdown
  child.kill("SIGTERM");

  // Force kill after 1 second
  setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL");
      logWarning(`Hook ${hookName}: force-killed after SIGTERM timeout`);
    }
  }, 1000);
}
```

The two-phase kill pattern gives the hook a chance to clean up (flush logs, close file handles) while providing a hard guarantee that it will not run forever.

---

## 19.13 Testing Hook Capabilities

Testing hooks requires exercising the full subprocess lifecycle: spawn, stdin write, stdout read, exit code check, timeout handling. Here are the patterns used in the test suite.

### Unit Testing Hook Output Parsing

```typescript
describe("parseHookOutput", () => {
  it("parses updatedInput", () => {
    const stdout = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput: { command: "new-command" },
      },
    });
    const result = parseHookOutput(stdout);
    expect(result?.updatedInput).toEqual({ command: "new-command" });
  });

  it("handles malformed JSON gracefully", () => {
    const result = parseHookOutput("not json at all");
    expect(result).toBeNull();
  });

  it("handles empty stdout", () => {
    const result = parseHookOutput("");
    expect(result).toBeNull();
  });
});
```

### Integration Testing with Real Subprocesses

```typescript
describe("hook execution", () => {
  it("applies updatedInput from hook", async () => {
    // Create a temporary hook script
    const hookScript = path.join(tmpDir, "rewrite-hook.sh");
    fs.writeFileSync(hookScript, `#!/bin/bash
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","updatedInput":{"command":"echo rewritten"}}}'
exit 0
`, { mode: 0o755 });

    const config: HookConfig = {
      type: "command",
      command: hookScript,
      timeout: 5000,
    };

    const result = await executeHook(config, "PreToolUse", {
      tool_name: "Bash",
      tool_input: { command: "echo original" },
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseHookOutput(result.stdoutOutput);
    expect(parsed?.updatedInput?.command).toBe("echo rewritten");
  });

  it("respects once: true", async () => {
    const hookScript = createCountingHook(tmpDir); // increments a file counter
    const config: HookConfig = {
      type: "command",
      command: hookScript,
      timeout: 5000,
      once: true,
    };

    // First call: executes
    await executeHookWithOnceCheck(config, "PreToolUse", sampleInput);
    expect(readCounter(tmpDir)).toBe(1);

    // Second call: skipped
    await executeHookWithOnceCheck(config, "PreToolUse", sampleInput);
    expect(readCounter(tmpDir)).toBe(1); // Still 1
  });
});
```

### Testing Async Hooks

Async hooks require verifying the background polling and completion flow:

```typescript
describe("async hooks", () => {
  it("registers background task and polls", async () => {
    const hookScript = createAsyncHook(tmpDir, {
      taskId: "test-async-123",
      pollIntervalMs: 100,
    });

    const result = await executeHook(hookConfig, "PostToolUse", sampleInput);
    const parsed = parseHookOutput(result.stdoutOutput);

    expect(parsed?.asyncRewake?.taskId).toBe("test-async-123");
    expect(asyncTasks.has("test-async-123")).toBe(true);

    // Simulate completion
    await completeAsyncHookTask("test-async-123", {
      exitCode: 0,
      stdoutOutput: "Scan complete: no issues",
    });

    expect(asyncTasks.has("test-async-123")).toBe(false);
  });
});
```

---

## 19.14 Real-World Patterns

### Pattern 1: Corporate Git Policy Enforcement

A `PreToolUse` hook that ensures all git pushes go through the approved remote and include a ticket reference:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "${INPUT}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('tool_input', {}).get('command', ''))
")

# Only process git push commands
if [[ ! "${COMMAND}" =~ ^git\ push ]]; then
  exit 0
fi

# Ensure push goes to approved remote
if [[ ! "${COMMAND}" =~ ^git\ push\ (origin|upstream) ]]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Git push must target origin or upstream remote"}}' >&2
  exit 2
fi

# Check that the latest commit has a ticket reference
LAST_MSG=$(git log -1 --pretty=%s)
if [[ ! "${LAST_MSG}" =~ (JIRA|TICKET|GH)-[0-9]+ ]]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Last commit must reference a ticket (JIRA-123, GH-456)"}}' >&2
  exit 2
fi

exit 0
```

### Pattern 2: MCP Output Redaction

A `PostToolUse` hook that strips sensitive data from database query results:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "${INPUT}" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('tool_name', ''))
")

# Only process database MCP tools
if [[ ! "${TOOL_NAME}" =~ ^mcp__db__ ]]; then
  exit 0
fi

# Redact sensitive columns from output
echo "${INPUT}" | python3 -c "
import sys, json, re

data = json.load(sys.stdin)
output = data.get('tool_output', {})
content = output.get('content', [])

SENSITIVE = ['ssn', 'credit_card', 'password', 'api_key', 'token']

for item in content:
    if item.get('type') == 'text':
        text = item['text']
        for field in SENSITIVE:
            text = re.sub(
                rf'\"?{field}\"?\s*[:=]\s*\"?[^,\"}]+\"?',
                f'\"{field}\": \"[REDACTED]\"',
                text,
                flags=re.IGNORECASE,
            )
        item['text'] = text

result = {
    'hookSpecificOutput': {
        'hookEventName': 'PostToolUse',
        'updatedMCPToolOutput': {'content': content}
    }
}
print(json.dumps(result))
"
```

### Pattern 3: Auto-Test on File Save

Combining `watchPaths` with `FileChanged` hooks to auto-run tests when source files change:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"watchPaths\":[\"src/\",\"tests/\"]}}'",
            "timeout": 1000
          }
        ]
      }
    ],
    "FileChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/auto-test.sh",
            "timeout": 60000,
            "statusMessage": "Running related tests..."
          }
        ]
      }
    ]
  }
}
```

### Pattern 4: CI Environment Auto-Prompt

A `SessionStart` hook that detects CI mode and injects an appropriate initial prompt:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Detect CI environment
if [[ -n "${CI:-}" ]] || [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  PROMPT="Run the full test suite, fix any failures, and report results."

  if [[ -n "${GITHUB_EVENT_PATH:-}" ]]; then
    EVENT=$(python3 -c "import json; e=json.load(open('${GITHUB_EVENT_PATH}')); print(e.get('action',''))")
    if [[ "${EVENT}" == "opened" ]]; then
      PROMPT="Review the PR changes for security issues and code quality."
    fi
  fi

  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"initialUserMessage\":\"${PROMPT}\"}}"
fi

exit 0
```

---

## 19.15 Key Takeaways

1. **Hooks are not just gatekeepers.** The nine capabilities transform hooks from binary allow/deny switches into active participants that can rewrite inputs, transform outputs, inject prompts, monitor files, configure environments, run asynchronously, fire conditionally, and reload dynamically. When you build a hook system, design the output protocol to be extensible from the start.

2. **Shallow merge is the right default for `updatedInput`.** Deep merge introduces ambiguity and security risks. Let hook authors be explicit about what they are replacing.

3. **MCP output transformation is safe; built-in output transformation is not.** The distinction hinges on whether the agent loop itself consumes the output. If it does, transformation breaks invariants. If it does not (MCP tools), transformation is safe.

4. **Async hooks need hard timeouts and background-task integration.** Without timeouts, forgotten async hooks leak resources. Without task-system integration, they are invisible to the user.

5. **`once: true` dedup is per-event, not global.** The same script registered for different lifecycle events should fire once per event, not once across all events.

6. **`if` patterns reuse permission-rule syntax.** Do not invent a new pattern language when you already have one. Reusing `Tool(pattern)` syntax means hook authors and permission-rule authors learn one language.

7. **Plugin hooks need restricted capabilities.** Untrusted code should not be able to silently rewrite tool inputs. Gate powerful capabilities behind explicit trust decisions.

8. **Fail-open is the right default for hook errors.** A broken hook should not paralyze the agent. The exception is exit code 2, which is always an intentional block.

9. **The env-file protocol separates dynamic configuration from static settings.** `CLAUDE_ENV_FILE` lets CI pipelines inject build-specific variables without modifying `settings.json`. Keep your configuration layered: static settings for structure, env files for values.

10. **Test hooks with real subprocesses.** Unit tests that mock `child_process.spawn` do not catch encoding issues, quoting problems, or platform-specific behavior. Integration tests with actual shell scripts are essential.
