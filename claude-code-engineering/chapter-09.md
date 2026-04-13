# Chapter 9: The Permission System

In Chapter 8, we examined the tool system — how tools register, declare schemas, and execute. But we glossed over a critical checkpoint that fires before any tool runs: *does the agent have permission to use this tool with these arguments?* That question sits at the center of the trust relationship between user and AI agent. Answer it too permissively and the agent deletes production databases. Answer it too restrictively and the user spends their day approving `git status`.

Claude Code's permission system is not a simple allowlist. It is an ~8,310-line subsystem spanning 17 files that implements six permission modes, an eight-source rule cascade, a two-stage AI classifier, denial tracking with circuit breakers, hook-based overrides with defense-in-depth guarantees, and dangerous-pattern detection that strips interpreter rules at runtime. The system processes every tool invocation — typically hundreds per session — and must be fast enough that the user never notices it, yet thorough enough that a prompt injection can't trick it into running `rm -rf /`.

This chapter walks through the full pipeline: how modes work, how rules are evaluated, how the auto-mode classifier decides what's safe, how hooks integrate without bypassing policy, and how the system handles its own failures. By the end, you'll have a complete blueprint for building a permission system that balances autonomy with safety.

---

## The Permission Modes — Six Levels of Trust

The fundamental abstraction is the **permission mode** — a session-wide setting that determines the default behavior when no rule matches. Think of it as the answer to "when in doubt, what should the agent do?"

```typescript
// types/permissions.ts:16-22
export const EXTERNAL_PERMISSION_MODES = [
  'acceptEdits',
  'bypassPermissions',
  'default',
  'dontAsk',
  'plan',
] as const

// types/permissions.ts:28-29
export type InternalPermissionMode = ExternalPermissionMode | 'auto' | 'bubble'
export type PermissionMode = InternalPermissionMode
```

Six modes, ordered from most restrictive to most permissive:

| Mode | Behavior | Use Case |
|---|---|---|
| `plan` | Read-only; optionally uses classifier | Planning phase, reviewing code |
| `dontAsk` | Convert all prompts to denials | CI/CD, headless agents |
| `default` | Ask user for every unrecognized tool use | First-time users, unfamiliar codebases |
| `acceptEdits` | Auto-allow file edits in working directory | Trusted local development |
| `auto` | AI classifier decides per tool use | Experienced users who want flow state |
| `bypassPermissions` | Allow everything except deny rules and safety checks | "I know what I'm doing" mode |

The `auto` mode deserves special attention — it's gated behind a build-time feature flag (`TRANSCRIPT_CLASSIFIER`), which means it doesn't even exist in external builds unless the flag is enabled:

```typescript
// types/permissions.ts:33-36
export const INTERNAL_PERMISSION_MODES = [
  ...EXTERNAL_PERMISSION_MODES,
  ...(feature('TRANSCRIPT_CLASSIFIER') ? (['auto'] as const) : ([] as const)),
] as const satisfies readonly PermissionMode[]
```

This is the dead-code elimination pattern from Chapter 2 applied to a security-critical feature. If `TRANSCRIPT_CLASSIFIER` is false at build time, the string `'auto'` never appears in the bundle — not in mode lists, not in validation schemas, nowhere. A user can't select a mode that doesn't exist in their build.

### Mode Resolution at Startup

Mode initialization follows a priority cascade similar to the settings cascade from Chapter 2, but with kill switches:

```
Priority Order:
1. --dangerously-skip-permissions CLI flag  -->  bypassPermissions
2. --permission-mode CLI flag               -->  parsed mode
3. settings.permissions.defaultMode         -->  settings mode
4. Fallback                                 -->  default

Each candidate is validated against kill switches before acceptance.
```

The implementation iterates through candidates and skips any that are disabled:

```typescript
// permissionSetup.ts:778-796
for (const mode of orderedModes) {
  if (mode === 'bypassPermissions' && disableBypassPermissionsMode) {
    // ...notification...
    continue // Skip this mode if it's disabled
  }
  result = { mode, notification }
  break
}
```

Kill switches exist at two levels. A Statsig gate (`tengu_disable_bypass_permissions_mode`) lets the platform operator disable bypass mode for all users remotely. A settings field (`permissions.disableBypassPermissionsMode`) lets enterprise admins lock it out via managed settings. Auto mode has additional circuit breakers: a GrowthBook feature flag, a settings field, and a model-support check. If any single breaker fires, the mode is unavailable.

This is the pattern for building controllable permission modes: **define the mode, then define every mechanism that can disable it.** The mode resolution logic doesn't care *why* a mode is disabled — it just skips it and tries the next candidate.

---

## The Permission Evaluation Pipeline

Every tool invocation passes through a single entry point: `hasPermissionsToUseTool()`. This function wraps an inner pipeline with auto-mode integration and denial tracking. The full flow:

```
hasPermissionsToUseTool(tool, input, context, assistantMessage, toolUseID)
  |
  +-- hasPermissionsToUseToolInner(tool, input, context)
  |     |
  |     +-- Step 1a: Deny rule on entire tool?          --> deny
  |     +-- Step 1b: Ask rule on entire tool?           --> ask
  |     +-- Step 1c: tool.checkPermissions(input, ctx)  --> tool-specific
  |     +-- Step 1d: Tool implementation denied?        --> deny
  |     +-- Step 1e: Tool requires user interaction?    --> ask
  |     +-- Step 1f: Content-specific ask rule?         --> ask
  |     +-- Step 1g: Safety check? (.git/, .claude/)    --> ask (bypass-immune)
  |     +-- Step 2a: Bypass mode?                       --> allow
  |     +-- Step 2b: Tool in always-allow rules?        --> allow
  |     +-- Step 3:  Passthrough --> ask conversion
  |
  +-- Post-processing (outer function):
        +-- On allow: reset denial tracking
        +-- On ask + dontAsk mode: convert to deny
        +-- On ask + auto mode: run classifier pipeline
        +-- On ask + headless agent: run hooks, then auto-deny
```

This pipeline has a deliberate ordering principle: **denials are checked before allows, and safety checks are checked before mode overrides.** This means a deny rule always wins over an allow rule, and a safety check for `.git/` always fires even in bypass mode.

### Steps 1a-1b: Whole-Tool Rule Evaluation

The first check is the simplest — does a deny or ask rule exist for this entire tool?

```typescript
// permissions.ts:1170-1181
const denyRule = getDenyRuleForTool(appState.toolPermissionContext, tool)
if (denyRule) {
  return {
    behavior: 'deny',
    decisionReason: { type: 'rule', rule: denyRule },
    message: `Permission to use ${tool.name} has been denied.`,
  }
}
```

Rule matching handles three patterns via `toolMatchesRule()` (`permissions.ts:238-269`):

- **Direct name match:** Rule `Bash` matches tool `Bash`
- **MCP server-level match:** Rule `mcp__server1` matches `mcp__server1__tool1` (block all tools from a server)
- **MCP wildcard:** Rule `mcp__server1__*` matches all tools from that server (explicit wildcard form)

This is the first firewall. If your enterprise policy says "deny Bash," no amount of allow rules, bypass mode, or AI classifiers can override it. The deny fires at the top of the pipeline and exits immediately.

### Step 1c: Tool-Specific Permission Checks

Each tool implements its own `checkPermissions()` method — the interface we saw in Chapter 8. For most tools, this is a simple check against the working directory. For Bash, it's a deeply detailed pipeline in `bashPermissions.ts` (~800 lines) that:

1. Parses the command into subcommands (up to 50; beyond that, falls back to `ask`)
2. Strips safe environment variables (`NODE_ENV`, `RUST_BACKTRACE`, etc.) before matching
3. Checks each subcommand against prefix rules, wildcard rules, and exact rules
4. Runs safety checks (path constraints, sed constraints)
5. Returns a composite result from all subcommands

The 50-subcommand limit (`MAX_SUBCOMMANDS_FOR_SECURITY_CHECK = 50`) is a practical cap. A command like `cat a && cat b && cat c && ...` with 100 subcommands would require 100 rule evaluations. Rather than doing potentially incorrect analysis on extremely complex commands, the system falls back to asking the user.

### Step 1g: Safety Checks — The Bypass-Immune Layer

Certain paths are protected even when the user has explicitly set `bypassPermissions` mode:

```typescript
// permissions.ts:1255-1260
if (
  toolPermissionResult?.behavior === 'ask' &&
  toolPermissionResult.decisionReason?.type === 'safetyCheck'
) {
  return toolPermissionResult
}
```

Safety checks protect:
- `.git/` — modifying git internals can corrupt the repository
- `.claude/` — modifying agent configuration can alter security behavior
- `.vscode/` — modifying editor settings can inject commands
- Shell configuration files (`.bashrc`, `.zshrc`, etc.) — modifying these achieves persistent code execution

The `classifierApprovable` flag on each safety check (`types/permissions.ts:319`) controls whether the auto-mode classifier can override it. Sensitive-file paths set `classifierApprovable: true` — the classifier can reason about context (e.g., "the user asked me to edit .bashrc to add a PATH entry"). Windows path bypass attempts set it to `false` — the classifier can never approve those.

This is an important engineering decision: **bypass-immune safety checks create a hard floor that no mode, rule, or classifier can penetrate.** You want this layer to be small (a handful of critical paths) and absolute (no exceptions). If you make it too broad, users can't work. If you make it too narrow, a prompt injection can edit your shell config.

### Steps 2a-2b: Mode and Rule Allows

Only after all deny checks and safety checks pass does the system check for allows:

```typescript
// permissions.ts:1268-1281
const shouldBypassPermissions =
  appState.toolPermissionContext.mode === 'bypassPermissions' ||
  (appState.toolPermissionContext.mode === 'plan' &&
    appState.toolPermissionContext.isBypassPermissionsModeAvailable)
if (shouldBypassPermissions) {
  return {
    behavior: 'allow',
    updatedInput: getUpdatedInputOrFallback(toolPermissionResult, input),
    decisionReason: { type: 'mode', mode: appState.toolPermissionContext.mode },
  }
}
```

Notice the plan-mode interaction: if the user entered plan mode *from* bypass mode, the `isBypassPermissionsModeAvailable` flag preserves the bypass capability. This prevents a confusing scenario where entering plan mode to review something strips the user's bypass permissions.

Allow rules (`permissions.ts:1284-1297`) fire next, matching specific tools and patterns. If no rule matches and the tool's own `checkPermissions` returned `passthrough` (meaning "I have no opinion"), the system converts it to `ask` — the user gets prompted.

### The Decision Type System

Every permission decision carries a typed reason explaining *why*:

```typescript
// types/permissions.ts:271-324
export type PermissionDecisionReason =
  | { type: 'rule'; rule: PermissionRule }
  | { type: 'mode'; mode: PermissionMode }
  | { type: 'subcommandResults'; reasons: Map<string, PermissionResult> }
  | { type: 'hook'; hookName: string }
  | { type: 'classifier'; classifier: string; reason: string }
  | { type: 'safetyCheck'; reason: string; classifierApprovable: boolean }
  | { type: 'sandboxOverride'; reason: string }
  | { type: 'workingDir'; reason: string }
  | { type: 'other'; reason: string }
```

This is more than debugging convenience. The decision reason drives:
- **UI display:** "Allowed by rule: `Bash(git diff:*)`" vs. "Allowed by bypass mode"
- **Analytics:** Track which rules fire most, which tools get denied, which classifier decisions are overridden
- **Denial tracking:** The classifier fallback needs to know whether a denial came from the classifier or from a rule
- **Permission suggestions:** When the system prompts the user, it can suggest adding an allow rule based on the command prefix

Build your decision types as discriminated unions with explicit reasons. You'll thank yourself when debugging why a particular tool call was blocked three sessions ago.

---

## The Permission Rule System

Rules are the declarative layer of the permission system. Instead of writing code for each permission decision, you declare rules like `Bash(git diff:*)` or `Read(./.env)` and the system evaluates them.

### Rule Structure

A permission rule has three components:

```typescript
// types/permissions.ts:54-79
export type PermissionRule = {
  source: PermissionRuleSource    // where it came from
  ruleBehavior: PermissionBehavior // 'allow' | 'deny' | 'ask'
  ruleValue: PermissionRuleValue   // { toolName, ruleContent? }
}
```

Sources are ordered by trust, mapping directly to the settings cascade from Chapter 2:

| Source | Example | Mutable by User? |
|---|---|---|
| `policySettings` | Enterprise/managed settings | No |
| `flagSettings` | Feature flag settings | No |
| `userSettings` | `~/.claude/settings.json` | Yes |
| `projectSettings` | `.claude/settings.json` | Yes |
| `localSettings` | `.claude/settings.local.json` | Yes |
| `cliArg` | `--allowed-tools Bash(git:*)` | Session only |
| `command` | Built-in command rules | No |
| `session` | Runtime session rules | Session only |

This ordering matters for conflict resolution. A `policySettings` deny rule cannot be overridden by a `userSettings` allow rule. The pipeline checks denies first from all sources, then allows. But within the same behavior (e.g., two allow rules from different sources), the provenance tracking tells you which settings file to edit.

### Rule Parsing

The parser in `permissionRuleParser.ts` handles the `ToolName(content)` syntax with escape support:

```typescript
// permissionRuleParser.ts:93-133
export function permissionRuleValueFromString(
  ruleString: string
): PermissionRuleValue {
  const openParenIndex = findFirstUnescapedChar(ruleString, '(')
  if (openParenIndex === -1) {
    return { toolName: normalizeLegacyToolName(ruleString) }
  }
  // ... matching close paren ...
  const rawContent = ruleString.substring(openParenIndex + 1, closeParenIndex)
  
  if (rawContent === '' || rawContent === '*') {
    return { toolName: normalizeLegacyToolName(toolName) }
  }
  
  const ruleContent = unescapeRuleContent(rawContent)
  return { toolName: normalizeLegacyToolName(toolName), ruleContent }
}
```

Parsing examples:
- `Bash` --> `{ toolName: 'Bash' }` (tool-wide rule)
- `Bash(*)` --> `{ toolName: 'Bash' }` (normalized to tool-wide)
- `Bash(npm install)` --> `{ toolName: 'Bash', ruleContent: 'npm install' }`
- `Bash(python -c "print\(1\)")` --> `{ toolName: 'Bash', ruleContent: 'python -c "print(1)"' }`

The escape handling counts preceding backslashes to determine whether a parenthesis is escaped. Even count means unescaped, odd means escaped. This logic is duplicated in both the parser and the validation module (`permissionValidation.ts`) rather than shared — a pragmatic choice to keep the parser and validator independent. Coupling them would mean a parser bug could bypass validation or vice versa.

Legacy tool names get normalized: `Task` becomes `Agent`, `KillShell` becomes `TaskStop`. This handles rename migrations transparently — users with old settings files don't need to update their rules.

### Shell Rule Matching

Bash commands use three matching strategies in `shellRuleMatching.ts`:

```typescript
// shellRuleMatching.ts:25-37
export type ShellPermissionRule =
  | { type: 'exact'; command: string }     // "git status" matches "git status"
  | { type: 'prefix'; prefix: string }     // "npm:*" matches "npm install"
  | { type: 'wildcard'; pattern: string }  // "git *" matches "git commit -m foo"
```

**Exact rules** match the full command string. **Prefix rules** use the legacy `:*` syntax — `npm:*` matches any command starting with `npm` followed by a space or end-of-string. **Wildcard rules** use `*` for glob matching, converted to regex internally.

The wildcard matching (`shellRuleMatching.ts:90-154`) has a subtle detail: trailing ` *` is made optional so that `git *` matches bare `git` in addition to `git commit`, `git push`, etc. And the `s` (dotAll) flag ensures `*` matches newlines, which matters for heredoc content in commands.

### The Immutable Permission Context

All permission state lives in a single immutable record:

```typescript
// types/permissions.ts:427-441
export type ToolPermissionContext = {
  readonly mode: PermissionMode
  readonly additionalWorkingDirectories: ReadonlyMap<string, ...>
  readonly alwaysAllowRules: ToolPermissionRulesBySource
  readonly alwaysDenyRules: ToolPermissionRulesBySource
  readonly alwaysAskRules: ToolPermissionRulesBySource
  readonly isBypassPermissionsModeAvailable: boolean
  readonly strippedDangerousRules?: ToolPermissionRulesBySource
  readonly shouldAvoidPermissionPrompts?: boolean
  readonly prePlanMode?: PermissionMode
}
```

Rules are stored per-source, so the system knows which settings file each rule came from. All mutations go through `applyPermissionUpdate()` (`PermissionUpdate.ts:55-188`), which returns a new context via spread — the standard immutable update pattern. This matters because the context lives in React state (via `useAppState`). Shallow spreading ensures React detects changes and re-renders the permission UI correctly.

---

## Settings-Based Permissions — Loading from Disk

Permission rules persist in settings files as JSON:

```json
{
  "permissions": {
    "allow": ["Bash(git diff:*)", "Read"],
    "deny": ["Read(./.env)"],
    "ask": ["Bash(npm publish:*)"]
  }
}
```

The loader (`permissionsLoader.ts:120-133`) reads from all enabled sources:

```typescript
// permissionsLoader.ts:120-133
export function loadAllPermissionRulesFromDisk(): PermissionRule[] {
  if (shouldAllowManagedPermissionRulesOnly()) {
    return getPermissionRulesForSource('policySettings')
  }
  const rules: PermissionRule[] = []
  for (const source of getEnabledSettingSources()) {
    rules.push(...getPermissionRulesForSource(source))
  }
  return rules
}
```

The enterprise lockdown check is the first line: `shouldAllowManagedPermissionRulesOnly()` returns true when an enterprise admin has set `allowManagedPermissionRulesOnly`. In that case, only `policySettings` are loaded — user, project, and local settings are ignored entirely. This is how a security team at a large organization ensures developers can't weaken permission policies.

### Syncing Changes from Disk

When settings change on disk (the user edits `settings.json` in their editor), the sync function performs a full replace:

```typescript
// permissions.ts:1419-1471
export function syncPermissionRulesFromDisk(
  toolPermissionContext: ToolPermissionContext,
  rules: PermissionRule[],
): ToolPermissionContext {
  let context = toolPermissionContext
  
  // Clear all disk-based sources before applying new rules
  const diskSources = ['userSettings', 'projectSettings', 'localSettings']
  for (const diskSource of diskSources) {
    for (const behavior of ['allow', 'deny', 'ask']) {
      context = applyPermissionUpdate(context, {
        type: 'replaceRules', rules: [], behavior, destination: diskSource,
      })
    }
  }
  
  const updates = convertRulesToUpdates(rules, 'replaceRules')
  return applyPermissionUpdates(context, updates)
}
```

The clear-then-replace pattern is important. Without it, deleting a rule from `settings.json` would have no effect — the in-memory context would still contain the old rule. CLI args and session rules are preserved across the sync because they don't come from disk.

### Rule Validation

Before rules reach the evaluation pipeline, they're validated (`permissionValidation.ts:58-262`):

1. **Empty check** — blank rules rejected
2. **Parentheses matching** — escape-aware counting of `(` and `)`
3. **Empty parentheses** — `Bash()` is invalid (use `Bash` or `Bash(*)` for tool-wide)
4. **MCP validation** — MCP rules can't have patterns in parentheses (MCP tools use the `mcp__server__tool` naming convention, not pattern matching)
5. **Tool name validation** — must start with uppercase
6. **Bash-specific** — `:*` must be at end; validates prefix syntax
7. **File tool-specific** — rejects `:*` syntax (wrong tool type), warns about misplaced wildcards

This validation catches mistakes before they silently fail at evaluation time. A rule like `bash(git diff)` (lowercase `b`) would never match anything because tool names are capitalized. Better to reject it with a clear error at load time.

---

## The Auto-Mode Classifier

Auto mode is where the permission system gets genuinely interesting. Instead of asking the user or following static rules, the system makes an **AI-driven security decision** for each tool invocation. A separate model call — a "side query" — evaluates whether the proposed action is safe given the conversation context.

### Fast Paths: Avoiding the Classifier

The classifier is an API call, which means latency and cost. The system avoids it whenever possible with three fast paths (`permissions.ts:596-686`):

**1. acceptEdits simulation.** If the tool would be allowed under `acceptEdits` mode (e.g., a file edit within the working directory), allow it without the classifier. This covers the most common case — file edits during development.

**2. Safe-tool allowlist.** Read-only and metadata-only tools skip the classifier entirely:

```typescript
// classifierDecision.ts:56-94
const SAFE_YOLO_ALLOWLISTED_TOOLS = new Set([
  FILE_READ_TOOL_NAME,         // Read-only
  GREP_TOOL_NAME,              // Search
  GLOB_TOOL_NAME,              // Search
  TODO_WRITE_TOOL_NAME,        // Metadata only
  TASK_CREATE_TOOL_NAME,       // Task management
  ASK_USER_QUESTION_TOOL_NAME, // UI interaction
  // ... 20+ tools total
])
```

**3. PowerShell guard.** PowerShell requires explicit permission unless a feature flag is enabled. This is a platform-specific safety constraint — PowerShell's execution policy model differs from Unix shells.

These fast paths ensure the classifier fires only for genuinely ambiguous cases: Bash commands that aren't in the allowlist, file writes outside the working directory, and MCP tool calls.

### Transcript Construction — Anti-Manipulation Design

The classifier sees a compressed transcript of the conversation, but with a critical security restriction:

```typescript
// yoloClassifier.ts:302-360
export function buildTranscriptEntries(messages: Message[]): TranscriptEntry[] {
  for (const msg of messages) {
    if (msg.type === 'user') {
      // Include user text
    } else if (msg.type === 'assistant') {
      // ONLY include tool_use blocks — assistant text is excluded
    }
  }
}
```

Assistant text is excluded from the classifier transcript. Only `tool_use` blocks are included. This is a deliberate anti-manipulation measure. The main model generates assistant text, and a prompt injection could craft text designed to influence the classifier's judgment — e.g., "I've verified this command is safe and the user explicitly asked for it." By excluding assistant text, the classifier sees only what the user said and what tools were actually called, not the model's narrative about the situation.

The transcript is serialized in a compact format (JSONL or text-prefix, controlled by feature flag) to minimize tokens. The classifier also receives the user's `CLAUDE.md` as context, so it can understand user intent:

```typescript
// yoloClassifier.ts:468-472
text:
  `The following is the user's CLAUDE.md configuration. These are ` +
  `instructions the user provided to the agent and should be treated ` +
  `as part of the user's intent when evaluating actions.\n\n` +
  `<user_claude_md>\n${claudeMd}\n</user_claude_md>`,
```

This lets the classifier approve actions that align with the user's stated workflow — if `CLAUDE.md` says "always use ruff for formatting," the classifier is more likely to allow `ruff check` commands.

### The Two-Stage Classifier Pipeline

The classifier runs in two stages to balance latency and accuracy:

```
Stage 1 (fast): max_tokens=64, stop on </block>
  |
  +-- "yes" (block) --> escalate to Stage 2
  +-- "no" (allow)  --> return allow immediately
  
Stage 2 (thinking): max_tokens=4096, chain-of-thought
  |
  +-- <thinking>...</thinking><block>yes/no</block>
  +-- Full reasoning before verdict
```

```typescript
// yoloClassifier.ts:550-551
const XML_S1_SUFFIX = '\nErr on the side of blocking. <block> immediately.'

// yoloClassifier.ts:560-561
const XML_S2_SUFFIX =
  '\nReview the classification process and follow it carefully...'
```

Stage 1 uses a 64-token limit with a stop sequence on `</block>` — it's asking for an immediate yes/no verdict. The prompt nudges toward blocking ("err on the side of blocking"). If Stage 1 says allow, the action proceeds immediately with minimal latency. If Stage 1 says block, Stage 2 fires with a 4,096-token budget for chain-of-thought reasoning.

This two-stage design is an optimization that reduces false negatives (accidentally blocking safe commands). Stage 1's bias toward blocking means it catches genuinely dangerous actions quickly. Stage 2's deeper reasoning catches false positives (commands that look dangerous but are actually safe in context). The net effect: safe commands are fast (Stage 1 only), dangerous commands are properly evaluated (Stage 2), and borderline commands get thorough analysis before being denied.

Three classifier modes are available, controlled by feature flags:

| Mode | Behavior |
|---|---|
| `'both'` (default) | Stage 1 fast check, escalate blocks to Stage 2 |
| `'fast'` | Stage 1 only (final verdict) |
| `'thinking'` | Stage 2 only (skip fast path) |

### Fail-Closed Design

When the classifier is unavailable — API error, timeout, or context overflow — the system defaults to blocking:

```typescript
// permissions.ts:845-876
if (classifierResult.unavailable) {
  if (getFeatureValue_CACHED_WITH_REFRESH(
    'tengu_iron_gate_closed', true, ...
  )) {
    return { behavior: 'deny', ... }  // Fail closed
  }
  return result  // Fail open (feature-gated escape hatch)
}
```

The `tengu_iron_gate_closed` gate controls fail-closed vs. fail-open behavior. The default is `true` — fail closed. This is the correct default for a security-critical system. If you can't determine whether an action is safe, the safe answer is "no."

When the transcript exceeds the classifier's context window (`transcriptTooLong`), the error is deterministic — retrying won't help. The system falls back to manual prompting for interactive sessions, or aborts for headless agents.

---

## Dangerous Permission Detection — Auto-Mode Safety

Allow rules fire *before* the classifier. This creates a subtle but critical vulnerability: a rule like `Bash(python:*)` would auto-allow any Python command, bypassing the classifier entirely. Since Python can execute arbitrary code, this effectively disables the classifier for the most dangerous category of commands.

The system detects and strips these dangerous rules when entering auto mode:

```typescript
// permissionSetup.ts:510-553
export function stripDangerousPermissionsForAutoMode(context) {
  const stripped: ToolPermissionRulesBySource = {}
  for (const perm of dangerousPermissions) {
    (stripped[perm.source] ??= []).push(
      permissionRuleValueToString(perm.ruleValue)
    )
  }
  return {
    ...removeDangerousPermissions(context, dangerousPermissions),
    strippedDangerousRules: stripped,  // Stashed for later restoration
  }
}
```

A Bash rule is classified as dangerous if it matches any of:

1. **Tool-level allow** — `Bash` with no `ruleContent` (allows ALL commands)
2. **Interpreter prefixes** — `python:*`, `node:*`, `bash:*`, `ruby:*`, `perl:*`, etc.
3. **Wildcard interpreter** — `python*`, `node*`
4. **Space wildcard** — `python *`
5. **Flag wildcard** — `python -*` (matches `python -c 'evil'`)

The dangerous patterns list (`dangerousPatterns.ts:18-42`) covers cross-platform code execution entry points:

```typescript
export const CROSS_PLATFORM_CODE_EXEC = [
  'python', 'python3', 'python2', 'node', 'deno', 'tsx',
  'ruby', 'perl', 'php', 'lua',
  'npx', 'bunx', 'npm run', 'yarn run', 'pnpm run', 'bun run',
  'bash', 'sh', 'ssh',
]
```

The key engineering pattern here is **stash-and-restore**. Dangerous rules are removed from the active context but saved in `strippedDangerousRules`. When the user leaves auto mode, they're restored:

```typescript
// permissionSetup.ts:561-579
export function restoreDangerousPermissions(context) {
  const stash = context.strippedDangerousRules
  if (!stash) return context
  let result = context
  for (const [source, ruleStrings] of Object.entries(stash)) {
    result = applyPermissionUpdate(result, {
      type: 'addRules',
      rules: ruleStrings.map(permissionRuleValueFromString),
      behavior: 'allow',
      destination: source,
    })
  }
  return { ...result, strippedDangerousRules: undefined }
}
```

The user's settings files are never modified — this is purely an in-memory transformation. If you have `Bash(python:*)` in your `settings.json`, it still allows all Python commands in `default` mode. It only gets stripped when you switch to `auto` mode, where the classifier needs to evaluate those commands.

Similarly, certain shell prefixes (`sh`, `bash`, `sudo`, `env`, `xargs`, etc.) are blocked from ever being *suggested* as permission rules (`bashPermissions.ts:196-226`). A suggestion like `Bash(sudo:*)` would auto-approve any `sudo` invocation — essentially privilege escalation via permission rule.

---

## Hook Integration with Permissions

Hooks (which we'll cover fully in Chapter 10) integrate with the permission system through `PreToolUse` events. A hook can return `allow`, `deny`, or `ask` for any tool use. But the integration has a critical invariant: **a hook `allow` does not bypass deny/ask rules from settings.**

```typescript
// toolHooks.ts:347-405
if (hookPermissionResult?.behavior === 'allow') {
  const hookInput = hookPermissionResult.updatedInput ?? input
  
  // Hook allow skips the interactive prompt, but deny/ask rules still apply
  const ruleCheck = await checkRuleBasedPermissions(tool, hookInput, context)
  if (ruleCheck === null) {
    return { decision: hookPermissionResult, input: hookInput }  // Allowed
  }
  if (ruleCheck.behavior === 'deny') {
    return { decision: ruleCheck }  // Deny rule overrides hook allow
  }
  // ask rule -> dialog required despite hook approval
  return { decision: await canUseTool(...) }
}
```

This is a defense-in-depth measure. Consider the scenario: an enterprise admin sets a deny rule for `Bash(rm -rf:*)` via managed policy settings. A developer installs a third-party hook that returns `allow` for cleanup scripts that include `rm -rf`. Without this invariant, the hook would bypass the policy. With it, the deny rule wins regardless.

The layered resolution:

```
Hook says "allow"
  --> Check deny rules  --> deny overrides hook
  --> Check ask rules   --> ask overrides hook (forces prompt)
  --> No rules matched  --> hook allow takes effect
```

### Permission Hooks for Headless Agents

When an agent runs without a user to prompt (`shouldAvoidPermissionPrompts`), `PermissionRequest` hooks get a chance to decide:

```typescript
// permissions.ts:400-471
async function runPermissionRequestHooksForHeadlessAgent(...) {
  for await (const hookResult of executePermissionRequestHooks(...)) {
    if (decision.behavior === 'allow') {
      if (decision.updatedPermissions?.length) {
        persistPermissionUpdates(decision.updatedPermissions)
      }
      return {
        behavior: 'allow',
        decisionReason: { type: 'hook', hookName: 'PermissionRequest' },
      }
    }
    if (decision.behavior === 'deny') {
      if (decision.interrupt) {
        context.abortController.abort()  // Hook can abort the entire agent
      }
      return { behavior: 'deny', ... }
    }
  }
  return null  // No hook decided -> fall through to auto-deny
}
```

This is how you build CI/CD integration for permission-aware agents. A `PermissionRequest` hook can check an external policy service, verify the command against a corporate allowlist, or log the decision for audit — all without a human in the loop.

---

## Denial Tracking and Safety Limits

The auto-mode classifier can deny actions the model wants to take. But what happens when the model keeps trying? Without a circuit breaker, the model could burn through its entire token budget retrying blocked actions.

```typescript
// denialTracking.ts:7-15
export type DenialTrackingState = {
  consecutiveDenials: number
  totalDenials: number
}

export const DENIAL_LIMITS = {
  maxConsecutive: 3,
  maxTotal: 20,
} as const
```

After 3 consecutive denials or 20 total denials, the system falls back to prompting the user (`permissions.ts:984-1058`). The model is clearly trying to do something the classifier doesn't like — time to ask a human.

For headless agents, exceeding denial limits throws an `AbortError`. The agent terminates rather than continuing to burn tokens on actions it can't perform. This is a cost protection mechanism as much as a safety one.

The denial state persistence has a subtle optimization: subagents use in-place mutation (`Object.assign`) because their `setAppState` is a no-op. The main session uses `setAppState` with a reference equality check — `recordSuccess` returns the same reference when `consecutiveDenials` is already 0, so React skips the re-render. This micro-optimization matters when the permission system runs hundreds of times per session.

---

## Mode Transitions and Remote Killswitches

Switching between permission modes is not a simple assignment. Transitions are centralized through `transitionPermissionMode` (`permissionSetup.ts:597-646`), which handles the side effects:

- **Entering auto mode:** Activate the classifier, strip dangerous rules via `stripDangerousPermissionsForAutoMode`
- **Leaving auto mode:** Deactivate the classifier, restore dangerous rules via `restoreDangerousPermissions`
- **Entering plan mode:** Save the current mode in `prePlanMode` so exiting plan mode restores it correctly
- **Plan + auto interaction:** If the user enters plan mode from auto mode, `prePlanMode` remembers `'auto'`. When they exit plan mode, auto mode reactivates with the classifier and dangerous rule stripping intact

Both bypass mode and auto mode can be disabled remotely via Statsig/GrowthBook gates while a session is running (`bypassPermissionsKillswitch.ts`). The killswitch uses a critical concurrency pattern: `verifyAutoModeGateAccess` returns a *transform function*, not a pre-computed context. The transform is applied inside `setAppState(prev => ...)` against the current context. This prevents the async GrowthBook call from clobbering a mode change that happened during the await. Without this pattern, a user switching from auto to `acceptEdits` during the async check could have their mode unexpectedly reverted.

---

## Trust Boundaries — The Complete Picture

The permission system enforces multiple trust boundaries simultaneously:

```
Trust Boundary Map:
.--------------------------------------------------------------------.
| Enterprise Policy (policySettings)                                  |
|   Cannot be overridden by any other source                         |
|   .--------------------------------------------------------------. |
|   | User Settings (userSettings)                                  | |
|   |   Can override project settings but not policy               | |
|   |   .--------------------------------------------------------. | |
|   |   | Project Settings (projectSettings, localSettings)       | | |
|   |   |   Can add allow rules but not override deny from above  | | |
|   |   |   .--------------------------------------------------. | | |
|   |   |   | Session Rules (cliArg, session)                    | | | |
|   |   |   |   Temporary, scoped to current session            | | | |
|   |   |   |   .--------------------------------------------. | | | |
|   |   |   |   | Auto-Mode Classifier                       | | | | |
|   |   |   |   |   Evaluates within allow/deny boundaries   | | | | |
|   |   |   |   |   Cannot see assistant-authored text       | | | | |
|   |   |   |   |   Fails closed on error                   | | | | |
|   |   |   |   '--------------------------------------------' | | | |
|   |   |   |   .--------------------------------------------. | | | |
|   |   |   |   | Hooks                                      | | | | |
|   |   |   |   |   Can allow/deny but cannot override       | | | | |
|   |   |   |   |   deny rules from settings                 | | | | |
|   |   |   |   '--------------------------------------------' | | | |
|   |   |   '--------------------------------------------------' | | |
|   |   '--------------------------------------------------------' | |
|   '--------------------------------------------------------------' |
|   .--------------------------------------------------------------. |
|   | Bypass-Immune Safety Checks                                   | |
|   |   .git/, .claude/, shell configs                              | |
|   |   Cannot be overridden by ANY mode, rule, or classifier      | |
|   '--------------------------------------------------------------' |
'--------------------------------------------------------------------'
```

Each boundary has a clear enforcement mechanism:

| Boundary | Enforcement |
|---|---|
| Enterprise --> User | `policySettings` checked before `userSettings`; `allowManagedPermissionRulesOnly` blocks all others |
| User --> AI | Permission modes control what the AI can do without asking |
| Settings --> Hooks | Hook `allow` cannot override deny/ask rules from settings |
| Auto-mode --> Classifier | Classifier excluded from seeing assistant text (anti-manipulation) |
| Classifier --> Safety | Safety checks for `.git/`, `.claude/` are bypass-immune |
| Dangerous patterns | Interpreter/shell prefix rules stripped in auto mode |
| Denial limits | 3 consecutive or 20 total denials trigger fallback to human |

---

## Design Lessons

Building a permission system for an AI agent that runs arbitrary tools, the Claude Code approach teaches several principles that generalize beyond this specific implementation:

**1. Deny-first, allow-second.** The pipeline checks denies before allows at every level. A deny from any source (policy, user settings, project settings) cannot be overridden by an allow from any other source. This is the simplest possible mental model for conflict resolution: if anyone says no, the answer is no.

**2. Create bypass-immune layers.** Even in the most permissive mode (`bypassPermissions`), certain paths remain protected. The bypass-immune layer should be small (a handful of critical paths) and absolute (no escape hatches). Users who set bypass mode are saying "I trust the agent." Bypass-immune checks protect users from the consequences of that trust when the agent makes mistakes.

**3. Fail closed, always.** When the classifier is unavailable, the default is deny. When the command is too complex to analyze (>50 subcommands), the default is ask. When denial limits are exceeded, the default is fallback to human. Every ambiguous case resolves to the more restrictive option.

**4. Track provenance.** Every permission decision carries a typed reason, and every rule carries its source. This makes debugging permission issues tractable ("this was denied by a rule from `policySettings`") and enables the UI to show meaningful explanations and suggestions.

**5. Separate the cache key from the behavior.** Dangerous rule stripping is an in-memory transformation that never modifies settings files. Mode transitions stash and restore rules rather than deleting them. The user's configuration is sacred — the permission system adapts its behavior without touching the source of truth.

**6. Defense in depth for extensibility.** Hooks can influence permission decisions, but they can't override policy. This lets you build a plugin ecosystem without creating security holes. The invariant "hook allow cannot bypass deny rules" is simple to state, simple to verify, and impossible to accidentally break.

**7. Build anti-manipulation into the classifier design.** Excluding assistant text from the classifier transcript is a single line of code, but it closes an entire category of prompt injection attacks. The classifier evaluates what happened (tool calls) and what the user wanted (user messages + CLAUDE.md), not what the model claims about the situation.

In Chapter 10, we'll examine the hook system — the extensibility layer that lets users and enterprise admins attach custom logic to 27 lifecycle events. Hooks fire before and after tool execution, can modify inputs and outputs, and integrate with the permission system through the defense-in-depth pattern we've seen here. Where the permission system asks "should this tool run?", the hook system asks "what should happen around this tool run?"
