# Chapter 18: Hook Capabilities and Advanced Patterns

Chapter 10 established the hook system's foundations: 27 lifecycle events, four hook types, the execution pipeline, exit code semantics, and the JSON output protocol. That chapter covered what hooks *are* and how they run. This chapter covers what hooks can *do* -- the advanced capabilities that transform hooks from simple event observers into active participants in the agent's execution flow.

The capabilities we will examine here were not part of the initial hook system. They emerged from real-world usage patterns: users needed hooks that could rewrite tool arguments before execution, modify MCP tool outputs, auto-submit prompts at session start, watch files for changes, inject environment variables, run in the background with conditional wake, execute only once, and load dynamically from plugins. Each capability was added to solve a concrete problem, and each carries engineering trade-offs worth understanding.

---

## 18.1 Input Modification with `updatedInput`

The most architecturally significant advanced hook capability is `updatedInput` -- the ability for a `PreToolUse` hook to rewrite tool arguments before the tool executes. This turns hooks from passive gatekeepers into active preprocessors.

### The Problem

Consider a common enterprise requirement: all `git push` commands must include `--no-verify` to skip local pre-push hooks that conflict with the CI pipeline. Without input modification, you have two options: block the command and tell the model to retry with the flag (wasteful, unreliable), or build the requirement into the agent's system prompt (fragile, easily overridden). Neither is satisfactory.

With `updatedInput`, a hook can silently rewrite the command:

```typescript
// PreToolUse hook: inject-git-flags.sh
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "${INPUT}" | jq -r '.tool_input.command // ""')

if [[ "${COMMAND}" == git\ push* && "${COMMAND}" != *--no-verify* ]]; then
  UPDATED="${COMMAND} --no-verify"
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"updatedInput\":{\"command\":\"${UPDATED}\"}}}"
  exit 0
fi

exit 0
```

The hook outputs structured JSON on stdout with a `hookSpecificOutput` object containing `updatedInput`. The engine merges this into the original tool input, and the tool executes with the modified arguments. The model never knows the modification happened -- it sees the tool succeed with the arguments it intended.

### How the Engine Processes `updatedInput`

The JSON output parsing happens in the `processHookJSONOutput` dispatcher. When the engine detects a `hookSpecificOutput` with `hookEventName: "PreToolUse"` and an `updatedInput` field, it follows this sequence:

```typescript
// Simplified from utils/hooks.ts processHookJSONOutput
if (hookOutput.hookSpecificOutput?.hookEventName === 'PreToolUse') {
  const { updatedInput, permissionDecision, additionalContext } =
    hookOutput.hookSpecificOutput

  if (updatedInput) {
    // Merge updated fields into original tool input
    const mergedInput = { ...originalInput, ...updatedInput }

    // Validate merged input against tool's input schema
    const validation = tool.inputSchema.safeParse(mergedInput)
    if (!validation.success) {
      // Invalid modification -- ignore it, use original input
      warn('Hook updatedInput failed schema validation', validation.error)
      return { input: originalInput, decision: 'allow' }
    }

    return { input: mergedInput, decision: permissionDecision ?? 'allow' }
  }
}
```

Three design decisions are worth noting:

**Merge, not replace.** `updatedInput` is shallow-merged with the original input. A hook that wants to change only the `command` field of a Bash tool call does not need to echo back the entire input object -- it only provides the fields it wants to override. This keeps hook scripts simple.

**Schema validation.** The merged input is validated against the tool's Zod schema before use. A hook that produces invalid input (wrong types, missing required fields) has its modification silently discarded. This prevents hooks from corrupting tool calls.

**Interaction satisfaction.** When a tool normally requires user confirmation (a permission dialog), a hook that provides `updatedInput` is treated as satisfying that interaction requirement. The rationale: if a hook is actively transforming the input, the user has already expressed trust in that hook through configuration.

### The Permission Integration

As discussed in Chapter 10 Section 10.8, `updatedInput` interacts carefully with the permission system. The critical invariant bears repeating because it applies directly here: **a hook's `allow` decision with `updatedInput` does NOT bypass settings.json deny rules.**

```typescript
// From services/tools/toolHooks.ts resolveHookPermissionDecision
if (hookPermissionResult?.behavior === 'allow') {
  const hookInput = hookPermissionResult.updatedInput ?? input

  // Rule check STILL applies even when hook approves + modifies
  const ruleCheck = await checkRuleBasedPermissions(tool, hookInput, ctx)
  if (ruleCheck?.behavior === 'deny') {
    return { decision: ruleCheck, input: hookInput }  // Deny wins
  }
}
```

This means a hook could rewrite `rm -rf /` to `rm -rf /tmp/safe-dir`, and the modified command would still be checked against permission rules. The hook cannot use `updatedInput` to smuggle dangerous commands past the permission system.

### Real-World Use Cases

| Use Case | Hook Behavior |
|----------|---------------|
| Enforce `--dry-run` in staging environments | Append `--dry-run` to deployment commands |
| Redirect file writes to a sandbox directory | Rewrite `file_path` in Write tool input |
| Strip sensitive flags from commands | Remove `--force`, `--no-verify` from git commands |
| Normalize file paths | Convert relative paths to absolute before Write/Edit |
| Add required headers to HTTP requests | Inject `Authorization` header into curl commands |

---

## 18.2 Output Modification with `updatedMCPToolOutput`

If `updatedInput` is the preprocessor, `updatedMCPToolOutput` is the postprocessor. It allows `PostToolUse` hooks to modify the output that MCP tools return before the model sees it.

### Why Only MCP Tools?

Built-in tools (Bash, Read, Write, Edit) have outputs that flow through well-defined internal pipelines with their own transformation logic. MCP tools, by contrast, return opaque JSON from external servers. `updatedMCPToolOutput` exists because MCP tool outputs often need sanitization, enrichment, or reformatting that the MCP server itself does not provide.

### The Mechanism

A `PostToolUse` hook receives the full tool execution context including the MCP tool's output. It can return modified output via JSON on stdout:

```typescript
// PostToolUse hook: sanitize-mcp-output.sh
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "${INPUT}" | jq -r '.tool_name // ""')
TOOL_OUTPUT=$(echo "${INPUT}" | jq -r '.tool_output // ""')

# Strip PII from database query results
if [[ "${TOOL_NAME}" == "mcp__db-query__execute" ]]; then
  SANITIZED=$(echo "${TOOL_OUTPUT}" | python3 -c "
import sys, json, re
data = sys.stdin.read()
# Redact email addresses
sanitized = re.sub(r'[\w.-]+@[\w.-]+\.\w+', '[REDACTED_EMAIL]', data)
# Redact phone numbers
sanitized = re.sub(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[REDACTED_PHONE]', sanitized)
print(sanitized)
")
  jq -n --arg output "${SANITIZED}" \
    '{"hookSpecificOutput":{"hookEventName":"PostToolUse","updatedMCPToolOutput":$output}}'
  exit 0
fi

exit 0
```

When the engine processes this response, it replaces the MCP tool's original output with the hook's `updatedMCPToolOutput` value. The model sees only the sanitized version.

### Constraints

The `updatedMCPToolOutput` field only takes effect for MCP tool calls. For built-in tools, the field is silently ignored. This is enforced at the processing layer:

```typescript
if (hookOutput.hookSpecificOutput?.updatedMCPToolOutput !== undefined) {
  if (isMCPTool(toolName)) {
    return { output: hookOutput.hookSpecificOutput.updatedMCPToolOutput }
  }
  // Silently ignore for non-MCP tools
}
```

The field accepts a string value, not structured JSON. This matches MCP's transport protocol where tool outputs are serialized strings. If you need to modify a JSON object within the output, your hook must parse it, modify it, and re-serialize it.

---

## 18.3 Auto-Submit with `initialUserMessage`

`SessionStart` hooks have a unique capability: they can automatically submit a prompt as if the user typed it. This enables fully automated workflows where a session begins, hooks inject the initial task, and the agent works without any human input.

### The Configuration

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/auto-task.sh"
          }
        ]
      }
    ]
  }
}
```

The hook script returns JSON with `initialUserMessage`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Read the task from a file or CI environment variable
TASK="${CI_TASK_DESCRIPTION:-}"
if [[ -z "${TASK}" ]]; then
  exit 0  # No auto-submit in interactive mode
fi

jq -n --arg msg "${TASK}" \
  '{"hookSpecificOutput":{"hookEventName":"SessionStart","initialUserMessage":$msg}}'
```

When the engine processes a `SessionStart` hook response containing `initialUserMessage`, it injects that message as the first user turn -- exactly as if the user had typed it at the prompt. The agent immediately begins working on the task.

### CI/CD Integration

This capability is the foundation of Claude Code's headless CI mode. A CI pipeline can:

1. Start a Claude Code session with `--headless` flag
2. Set `CI_TASK_DESCRIPTION="Run the test suite and fix any failures"`
3. The `SessionStart` hook reads the env var and returns `initialUserMessage`
4. Claude Code begins working autonomously

The pattern eliminates the need for a separate "headless mode" API. The same hook system that handles interactive guardrails also handles automated task injection.

### Multiple SessionStart Hooks

If multiple `SessionStart` hooks return `initialUserMessage`, only the first one wins. Subsequent values are logged and discarded. This is a deliberate conflict-resolution strategy: auto-submit is an all-or-nothing operation (you cannot merge two initial prompts into one meaningful prompt), so first-writer-wins is the only sensible policy.

---

## 18.4 File Watching with `watchPaths`

`SessionStart` hooks can register file watchers that trigger `FileChanged` events when specified paths are modified on disk. This connects the external filesystem to the hook event bus.

### How It Works

```bash
#!/usr/bin/env bash
# session-watch.sh -- register watchers for config files
set -euo pipefail

jq -n '{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "watchPaths": [
      "package.json",
      "tsconfig.json",
      ".env.local",
      "src/config/**/*.ts"
    ]
  }
}'
```

The engine receives this response and registers filesystem watchers (via `fs.watch` or a platform-specific watcher like `fsevents` on macOS) for each specified path. When a watched file changes, the engine fires a `FileChanged` event with context including the file path and change type:

```json
{
  "hook_event_name": "FileChanged",
  "file_path": "/project/package.json",
  "file_basename": "package.json",
  "change_type": "modify",
  "session_id": "sess-abc123"
}
```

`FileChanged` hooks can then react -- re-running linters, invalidating caches, or notifying the model that its assumptions about a file may be stale.

### Glob Support

Watch paths support glob patterns. `"src/**/*.ts"` watches all TypeScript files under `src/`. The glob expansion happens at registration time, and newly created files matching the pattern are picked up by directory-level watchers.

### Performance Considerations

File watching is inherently platform-dependent and carries overhead. The implementation uses debouncing (typically 100-300ms) to coalesce rapid successive changes into a single event. Without debouncing, a `git checkout` that modifies 200 files would fire 200 `FileChanged` events in rapid succession, each potentially triggering hooks that spawn processes.

The watch registration also caps the total number of watched paths per session (typically 1,000) to prevent runaway memory consumption from overly broad glob patterns.

---

## 18.5 Environment Variable Injection with `CLAUDE_ENV_FILE`

Hooks often need to inject environment variables that persist across the session -- API keys loaded from a vault, computed paths, feature flags. The `CLAUDE_ENV_FILE` mechanism provides this without requiring hooks to modify the process environment directly.

### The Mechanism

A `SessionStart` hook writes key-value pairs to a temporary file and sets the `CLAUDE_ENV_FILE` environment variable to point at it:

```bash
#!/usr/bin/env bash
# session-setup.sh -- inject environment from vault
set -euo pipefail

ENV_FILE=$(mktemp)
trap "rm -f ${ENV_FILE}" EXIT

# Load secrets from vault
vault kv get -format=json secret/claude-code | jq -r '.data.data | to_entries[] | "\(.key)=\(.value)"' > "${ENV_FILE}"

# Add computed variables
echo "PROJECT_ROOT=$(git rev-parse --show-toplevel)" >> "${ENV_FILE}"
echo "GIT_BRANCH=$(git branch --show-current)" >> "${ENV_FILE}"

# Tell Claude Code where to find the env file
echo "CLAUDE_ENV_FILE=${ENV_FILE}"
```

At session start, the engine reads `CLAUDE_ENV_FILE`, parses it as a newline-delimited `KEY=VALUE` file, and injects those variables into the environment for all subsequent hook executions in the session. The variables are also available to tool executions (Bash commands run by the agent inherit them).

### Security Properties

The `CLAUDE_ENV_FILE` approach has a key security advantage over direct environment modification: the file is read once at session initialization, parsed in a controlled manner, and the original file can be immediately deleted. There is no window where secrets persist in an accessible temp file across the session's lifetime.

The engine also validates the file format strictly: lines must match `^[A-Z_][A-Z0-9_]*=.*$`. Lines that do not match are silently skipped. This prevents injection attacks where a malicious hook could set `LD_PRELOAD` or other dangerous variables by using creative formatting.

### Comparison with Hook-Level `env`

Individual hooks can also specify environment variables via the `env` field in their configuration:

```json
{
  "type": "command",
  "command": "./hooks/lint.sh",
  "env": {
    "LINT_STRICT": "true",
    "MAX_WARNINGS": "0"
  }
}
```

These per-hook variables are scoped to a single hook execution. `CLAUDE_ENV_FILE` variables are session-wide. Use per-hook `env` for hook-specific configuration; use `CLAUDE_ENV_FILE` for variables that multiple hooks or tools need.

---

## 18.6 Background Execution with `async` and `asyncRewake`

Chapter 10 introduced async hooks briefly. Here we examine the full lifecycle and the subtle difference between `async: true` and `asyncRewake: true`.

### Pure Background: `async: true`

A hook with `async: true` starts execution immediately but does not block the event pipeline. The hook runs in the background while the agent continues working:

```json
{
  "type": "command",
  "command": "./hooks/telemetry-upload.sh",
  "async": true,
  "timeout": 15000
}
```

The `AsyncHookRegistry` tracks the background process. Results are polled via `checkForAsyncHookResponses()`, which runs periodically during the agent's event loop. If the async hook exits with code 0, the result is logged but has no effect on the agent. If it exits with a non-zero code, the error is logged but also has no effect -- pure async hooks are fire-and-forget.

Use cases: telemetry, audit logging, cache warming, notification delivery.

### Background with Wake: `asyncRewake: true`

`asyncRewake` adds a critical capability: if the background hook exits with code 2, the agent is woken with a notification containing the hook's stderr as feedback:

```json
{
  "type": "command",
  "command": "./hooks/slow-security-scan.sh",
  "asyncRewake": true,
  "timeout": 30000
}
```

The sequence:

1. Hook starts in the background
2. Agent continues its turn (reading files, writing code, etc.)
3. Hook finishes with exit code 2: "vulnerability found in dependency X"
4. `AsyncHookRegistry` detects the blocking result
5. Engine injects the hook's feedback as a notification to the model
6. Model receives the notification and can react (e.g., stop and address the vulnerability)

This pattern enables *asynchronous quality gates* -- checks that are too slow to run synchronously but important enough to interrupt the agent when they fail.

### Runtime Async Detection

A hook can decide at runtime whether to go async by emitting `{"async": true}` as its first stdout line:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
COMPLEXITY=$(echo "${INPUT}" | jq -r '.tool_input.command' | wc -c)

if [[ "${COMPLEXITY}" -gt 500 ]]; then
  # Complex command -- run validation in background
  echo '{"async": true}'
  # ... slow validation continues ...
  if validation_fails; then
    echo "Validation failed: reason" >&2
    exit 2
  fi
else
  # Simple command -- validate synchronously
  exit 0
fi
```

The engine detects this JSON output before the hook has finished, backgrounds the process, and continues the event pipeline. This lets a single hook handle both fast-path and slow-path cases without requiring two separate hook configurations.

### The 15-Second Default Timeout

Async hooks default to a 15-second timeout, significantly shorter than the 10-minute default for synchronous command hooks. The rationale: async hooks are background operations that should complete quickly. If a background hook takes more than 15 seconds, it is likely stuck or performing work too heavy for the hook system. The timeout is configurable via the `timeout` field.

---

## 18.7 One-Shot Hooks with `once: true`

Some hooks should run exactly once per session. The `once` field provides this guarantee:

```json
{
  "type": "command",
  "command": "./hooks/check-license.sh",
  "once": true
}
```

After the hook executes successfully (exit code 0), the engine marks it as "fired" and skips it on subsequent event triggers. The hook is not unregistered -- it remains in the configuration for future sessions -- but it will not fire again in the current session.

### Implementation

The once-tracking state lives in the session's hook execution context, not in the hook configuration itself:

```typescript
// Simplified from the executeHooks pipeline
const firedOnceHooks = new Set<string>()

// During hook matching
if (hook.once && firedOnceHooks.has(hookKey)) {
  continue  // Skip this hook -- already fired
}

// After successful execution
if (hook.once && result.exitCode === 0) {
  firedOnceHooks.add(hookKey)
}
```

The hook key is derived from the hook's command string and its position in the configuration array, ensuring that two identical commands at different positions are tracked independently.

### Failure Semantics

A `once` hook that fails (non-zero exit code other than 0) is NOT marked as fired. It will retry on the next event trigger. This is intentional: a once hook that fails to validate a license or check a prerequisite should retry until it succeeds or the session ends. Only exit code 0 satisfies the "once" constraint.

### Use Cases

| Pattern | Hook |
|---------|------|
| License verification at session start | `once: true` on `SessionStart` |
| One-time dependency audit | `once: true` on first `PreToolUse` for `Bash` |
| Initial workspace validation | `once: true` on `SessionStart` |
| First-run onboarding message | `once: true` on `SessionStart` with `initialUserMessage` |

---

## 18.8 Conditional Execution with the `if` Pre-Filter

The `if` field is a hook-level pre-filter that prevents hook execution entirely when the condition does not match. It reuses the permission rule syntax from `settings.json`, creating a consistent filtering language across the entire system.

### Syntax

The `if` field accepts the same `ToolName(pattern)` syntax used in permission rules:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./hooks/lint-python.sh",
            "if": "Write(*.py)"
          }
        ]
      }
    ]
  }
}
```

Wait -- this example has a mismatch. The matcher says `"Bash"` but the `if` says `"Write(*.py)"`. This would never fire because the matcher filters for Bash tool calls, while the `if` condition checks for Write tool calls. Let us correct the example:

```json
{
  "hooks": {
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

Now the matcher filters for Write or Edit tool calls, and the `if` condition further narrows to only Python files. The hook fires for `Write(src/main.py)` but not for `Write(src/config.json)` or `Edit(README.md)`.

### How `if` Differs from `matcher`

Both `matcher` and `if` filter hooks before execution, but they operate at different levels:

| Aspect | `matcher` | `if` |
|--------|-----------|------|
| Scope | Per-matcher group (wraps multiple hooks) | Per-individual hook |
| Matches against | Tool name only | Tool name + argument pattern |
| Syntax | String, pipe-separated, or regex | Permission rule syntax: `ToolName(argPattern)` |
| Evaluation cost | String comparison | Pattern compilation + argument parsing |
| When evaluated | Before hook matching | After matching, before process spawn |

The two-stage filtering is a performance optimization. The `matcher` check is cheap (string comparison). The `if` check requires parsing tool arguments and compiling a pattern matcher. By running `matcher` first, the engine avoids the more expensive `if` evaluation for hooks that do not even match the tool name.

### The Condition Matcher Pipeline

When the engine evaluates an `if` condition, it follows this pipeline:

```typescript
// Simplified from prepareIfConditionMatcher
function evaluateIfCondition(
  ifCondition: string,       // e.g., "Bash(git *)"
  toolName: string,          // e.g., "Bash"
  toolInput: object          // e.g., { command: "git push origin main" }
): boolean {
  // 1. Parse the condition into tool name + pattern
  const parsed = permissionRuleValueFromString(ifCondition)
  // parsed = { toolName: "Bash", ruleContent: "git *" }

  // 2. Check tool name matches
  if (normalizeToolName(parsed.toolName) !== normalizeToolName(toolName)) {
    return false
  }

  // 3. If no pattern specified, match all instances of this tool
  if (!parsed.ruleContent) return true

  // 4. Compile the pattern and match against tool arguments
  const matcher = tool.preparePermissionMatcher(toolInput)
  return matcher(parsed.ruleContent)
}
```

For the Bash tool, `preparePermissionMatcher` compiles the pattern against the `command` field. For the Write tool, it compiles against the `file_path` field. Each tool defines its own argument-to-pattern mapping, maintaining consistency with the permission system.

### Supported Events

The `if` condition only applies to events that have tool context: `PreToolUse`, `PostToolUse`, and `PostToolUseFailure`. For other events (like `SessionStart` or `Notification`), the `if` field is silently ignored -- these events do not have a tool name or tool input to match against.

---

## 18.9 Hook Loading from Plugins

The hook system extends beyond static configuration files. Plugins can register hooks dynamically, enabling third-party extensions to inject behavior into the agent's lifecycle.

### Plugin Hook Registration

When a plugin loads, the engine calls `load_plugin_hooks` to extract hook registrations from the plugin's manifest:

```typescript
interface HookRegistration {
  event: string        // Hook event name (e.g., "PreToolUse")
  id: string           // Unique identifier
  name: string         // Human-readable name
  priority: number     // Execution order (default: 100)
  pluginName: string   // Source plugin for deduplication
}
```

Plugin hooks are registered into the session's hook configuration alongside settings-based hooks. They participate in the same matching, filtering, and execution pipeline. The only difference is their source -- the engine tracks which hooks came from plugins for debugging and deduplication.

### Source-Namespaced Deduplication

A critical challenge with plugin-loaded hooks is deduplication. Two plugins might register hooks with identical commands for the same event. Without deduplication, the hook would fire twice.

The engine solves this with source-namespaced dedup keys:

```typescript
// Dedup key = plugin_root + hook_type + command_or_prompt
const dedupKey = `${pluginRoot}::${hook.type}::${hook.command ?? hook.prompt}`
```

Two hooks with the same command from the same plugin are deduplicated. Two hooks with the same command from different plugins are treated as distinct. This prevents cross-plugin collisions while allowing a plugin to safely register the same hook from multiple code paths (e.g., during hot-reload).

### Hot-Reload

When a plugin is hot-reloaded (its files change on disk), the engine:

1. Unregisters all hooks from the old plugin version
2. Loads the new plugin version
3. Registers hooks from the new version

This is implemented as an unload-then-load sequence rather than an in-place update, ensuring atomic transitions. During the brief window between unload and load, the hooks do not exist -- this is acceptable because hook execution is best-effort and missing a single event trigger during reload is far less dangerous than running hooks from an inconsistent state.

```rust
// Simplified from hot_reload_plugin
pub fn hot_reload_plugin(loader: &mut PluginLoader, name: &str) -> Result<()> {
    // 1. Unload old version (tears down hooks, commands, tools)
    unload_plugin(loader, name)?;

    // 2. Reload from disk
    let manifest = discover_plugin(&loader.plugin_dirs, name)?;
    let loaded = load_single_plugin(&manifest)?;

    // 3. Register into loader
    loader.loaded_plugins.insert(name.to_string(), loaded);
    loader.load_order.push(name.to_string());

    info!("hot-reloaded plugin '{name}'");
    Ok(())
}
```

### Plugin Hook Capabilities

Plugin hooks have access to the same four hook types as settings-based hooks: command, prompt, agent, and HTTP. However, plugin hooks carry an additional constraint: they inherit the plugin's capability set. A plugin that only declares the `hooks` capability can register hooks but cannot register commands or tools. This prevents plugins from using hooks as a backdoor to inject unauthorized capabilities.

---

## 18.10 The `additionalContext` Injection

Multiple hook types and events support `additionalContext` -- a string that gets injected into the conversation as a system message visible to the model. This is the simplest form of hook-to-model communication.

### Where It Works

| Event | Hook Output Field | Effect |
|-------|-------------------|--------|
| `SessionStart` | `additionalContext` | Injected into the system prompt |
| `PreToolUse` | `additionalContext` | Added as context before tool execution |
| `PostToolUse` | `additionalContext` | Added as context after tool output |

### SessionStart Context Injection

This is the most powerful form. A `SessionStart` hook can read project state and inject relevant context that the model would otherwise lack:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Build project context
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git log -1 --oneline 2>/dev/null || echo "no commits")
OPEN_ISSUES=$(gh issue list --state open --limit 5 --json number,title 2>/dev/null || echo "[]")

CONTEXT="Current branch: ${BRANCH}
Last commit: ${LAST_COMMIT}
Open issues: ${OPEN_ISSUES}"

jq -n --arg ctx "${CONTEXT}" \
  '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$ctx}}'
```

The injected context becomes part of the model's system prompt for the entire session. The model can reference it naturally -- "I see there are 5 open issues" -- without any explicit tool calls.

### PostToolUse Context Injection

A `PostToolUse` hook can add explanatory context after a tool runs. For example, after a test failure:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "${INPUT}" | jq -r '.tool_name')
EXIT_CODE=$(echo "${INPUT}" | jq -r '.tool_input.exit_code // 0')

if [[ "${TOOL_NAME}" == "Bash" && "${EXIT_CODE}" != "0" ]]; then
  jq -n --arg ctx "Note: this test failure may be related to the database migration in PR #42 that was merged yesterday." \
    '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
fi
exit 0
```

This gives the model additional context it would not otherwise have, steering it toward more informed debugging.

---

## 18.11 Composing Advanced Patterns

The real power of the advanced hook capabilities emerges when they compose. Here are patterns that combine multiple capabilities:

### Pattern 1: Auto-Setup Pipeline

A `SessionStart` hook that combines `initialUserMessage`, `watchPaths`, `additionalContext`, and environment injection:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Load environment from vault
ENV_FILE=$(mktemp)
vault kv get -format=json secret/project | jq -r '.data.data | to_entries[] | "\(.key)=\(.value)"' > "${ENV_FILE}"

# Build context
BRANCH=$(git branch --show-current)
TASK=$(cat .claude/current-task.md 2>/dev/null || echo "")

jq -n \
  --arg ctx "Branch: ${BRANCH}\nEnvironment loaded from vault." \
  --arg msg "${TASK}" \
  --arg env "${ENV_FILE}" \
  '{
    "hookSpecificOutput": {
      "hookEventName": "SessionStart",
      "additionalContext": $ctx,
      "initialUserMessage": (if $msg != "" then $msg else null end),
      "watchPaths": ["package.json", "pyproject.toml", ".env.local"]
    }
  }'
```

This single hook sets up the entire session: loads secrets, injects context, optionally auto-submits a task, and registers file watchers.

### Pattern 2: Progressive Security Gate

A `PreToolUse` hook that uses `if` for cheap filtering, `async` for expensive validation, and `asyncRewake` for interruption:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/quick-check.sh",
            "if": "Bash(curl *)",
            "timeout": 2000
          },
          {
            "type": "command",
            "command": "./.claude/hooks/deep-scan.sh",
            "if": "Bash(curl *)",
            "asyncRewake": true,
            "timeout": 30000
          }
        ]
      }
    ]
  }
}
```

The first hook runs synchronously and catches obvious issues (blocked domains, missing flags). The second hook runs in the background performing a deep URL analysis. If the deep scan finds a problem, it wakes the agent with a notification.

### Pattern 3: Feedback Loop with `updatedInput` and `once`

A hook that rewrites the first Bash command in a session to include diagnostic flags, then disables itself:

```json
{
  "type": "command",
  "command": "./.claude/hooks/inject-diagnostics.sh",
  "if": "Bash(npm *)",
  "once": true
}
```

The hook appends `--verbose --timing` to the first `npm` command, giving the model detailed output it can use for subsequent decisions. After the first execution, the `once` flag prevents further modifications. The model gets rich diagnostic data exactly once, avoiding the overhead of verbose output on every subsequent command.

---

## 18.12 Debugging Advanced Hooks

Advanced hooks introduce failure modes that basic hooks do not have. Here is a diagnostic reference:

### `updatedInput` Silently Ignored

**Symptom:** Hook outputs `updatedInput` but the tool executes with original arguments.

**Causes:**
1. Schema validation failed -- the merged input does not match the tool's Zod schema. Check that field names and types match exactly.
2. Permission system denied the modified input -- even though the hook approved it, a settings.json deny rule blocked the modified command.
3. The hook exited with non-zero code -- `updatedInput` is only processed for exit code 0.

**Diagnostic:** Enable hook tracing with `CLAUDE_CODE_DEBUG=hooks` to see schema validation errors and permission decisions.

### `asyncRewake` Never Fires

**Symptom:** Background hook completes with exit 2 but the model is not notified.

**Causes:**
1. The hook exceeded the async timeout (default 15 seconds). The process was killed before it could produce output.
2. The model's turn ended before the async hook completed. Wake notifications are only delivered to active turns.
3. The `forceSyncExecution` flag is set in the execution context (some internal callers force synchronous execution).

### `once` Hook Keeps Firing

**Symptom:** A `once: true` hook runs on every event trigger.

**Cause:** The hook is exiting with a non-zero code. Only exit code 0 marks a `once` hook as "fired." Check the hook's stderr for error messages.

### `watchPaths` Files Not Triggering

**Symptom:** Watched files change but no `FileChanged` event fires.

**Causes:**
1. The glob pattern did not match any files at registration time. Directory watchers are set up based on the resolved paths.
2. The change was debounced into a previous change event. Rapid successive changes are coalesced.
3. The file was changed by the agent itself (via Write/Edit tool). Some implementations suppress self-triggered changes to avoid infinite loops.

---

## 18.13 Performance Implications of Advanced Hooks

Each advanced capability adds overhead to the hook execution pipeline. Understanding the cost model helps you make informed trade-offs:

| Capability | Cost | When Paid |
|-----------|------|-----------|
| `if` condition | Pattern compilation + argument parsing (~0.1ms) | Per hook, per event |
| `updatedInput` | JSON parse + schema validation (~0.2ms) | Only when hook outputs JSON |
| `updatedMCPToolOutput` | JSON parse (~0.1ms) | Only for MCP tool PostToolUse |
| `async: true` | Background process tracking (~0.05ms per poll) | Continuous until complete |
| `asyncRewake: true` | Same as async + notification injection | On exit code 2 only |
| `once: true` | Set lookup (~0.001ms) | Per hook, per event |
| `watchPaths` | File system watcher registration (~1ms per path) | Once at session start |
| `additionalContext` | Message injection (~0.05ms) | Only when present in output |

The critical insight: the `if` pre-filter and `once` flag *reduce* total overhead by preventing unnecessary process spawns. A well-configured hook with `if: "Bash(git *)"` and `once: true` incurs near-zero cost for the vast majority of tool calls. The same hook without these optimizations would spawn a process on every Bash invocation for the entire session.

### The hasHookForEvent Guard

As covered in Chapter 10, the `hasHookForEvent` guard prevents even constructing the hook input object when no hooks are registered for an event. This guard applies to all advanced capabilities -- if no `PostToolUse` hooks exist, the engine never builds the post-tool context, never evaluates `if` conditions, and never attempts to parse `updatedMCPToolOutput`. The zero-hook fast path remains zero-cost regardless of how many advanced features are available.

---

## Summary

The advanced hook capabilities transform the hook system from a passive observation layer into an active participant in the agent's execution:

- **`updatedInput`** rewrites tool arguments before execution, enabling sanitization, normalization, and policy enforcement without model awareness.
- **`updatedMCPToolOutput`** filters and transforms MCP tool outputs, providing a postprocessing layer for external tool integrations.
- **`initialUserMessage`** enables fully automated sessions by injecting the first prompt from a hook, forming the foundation of headless CI operation.
- **`watchPaths`** bridges the filesystem to the event bus, letting hooks react to external file changes.
- **`CLAUDE_ENV_FILE`** provides secure, session-wide environment variable injection.
- **`async` and `asyncRewake`** enable background processing and asynchronous quality gates.
- **`once: true`** eliminates redundant hook executions for one-time operations.
- **The `if` pre-filter** provides cheap argument-level filtering that composes with the matcher system.
- **Plugin hook loading** with hot-reload supports dynamic extensibility.

These capabilities compose cleanly because they all operate through the same JSON output protocol established in Chapter 10. A hook can return `updatedInput`, `additionalContext`, and `watchPaths` in a single JSON response. The engine processes each field independently, and the results are merged into the execution context without interference.

For engineers building similar extensibility systems, the key design lesson is this: start with a simple, well-defined communication protocol (exit codes + JSON on stdout/stderr), then add capabilities by extending the schema rather than adding new communication channels. Every advanced feature in this chapter uses the same stdin/stdout/exit-code protocol established for basic hooks. The protocol did not change -- only the vocabulary expanded.

In Chapter 19, we turn to the testing infrastructure that validates these complex hook interactions -- how to test systems where the behavior depends on the interplay of configuration, runtime state, tool arguments, and external processes.
