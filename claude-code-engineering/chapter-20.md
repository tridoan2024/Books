# Chapter 20: The Skill System

## Part VI: Skills & Configuration

The first five parts of this book covered the engine: how the agent boots, processes queries, executes tools, enforces permissions, and fires hooks. These are the load-bearing walls of the system. But a house with strong walls and no furniture is uninhabitable. Part VI is about the furniture — the systems that make the agent usable, configurable, and extensible by people who never touch the core codebase.

This chapter covers the skill system: the primary mechanism through which an AI CLI agent learns new workflows without code changes. A skill is a markdown file with YAML frontmatter that teaches the LLM how to perform a specific task — reviewing code, fixing issues, drafting documentation, profiling performance. Skills are the answer to a fundamental tension in agent design: the LLM needs domain-specific instructions to be useful, but those instructions change faster than you can ship releases.

Claude Code's skill system — approximately 2,475 lines across two core files — handles skill loading from five sources with priority ordering, YAML frontmatter parsing without a YAML library, dynamic context injection via shell command execution embedded in prompts, argument substitution, auto-activation by file path patterns, system prompt injection, and an auto-improvement engine that analyzes conversation turns and proposes skill updates. Understanding how to build this system is essential for any agent that needs to be more than a generic chatbot.

---

## 20.1 Architecture Overview

The skill system lives in two files:

| File | Lines | Responsibility |
|------|-------|----------------|
| `skills/mod.rs` | 1,678 | Core loading, registry, frontmatter parsing, dynamic injection, slash commands |
| `skills/improvement.rs` | 797 | Auto-improvement engine, turn analysis, metrics tracking |

The data flow is straightforward. When a user types `/code-review`, the system parses the slash command, looks up the skill by name, resolves its body (substituting arguments and executing embedded shell commands), and returns the resolved content for injection into the LLM conversation:

```
User types /skill-name args
       |
       v
SkillRegistry::execute_slash_command()
       |
       v
parse_slash_command() -> (name, args)
       |
       v
find_by_name() or find_by_name_ci()
       |
       v
Skill::resolve_body_with_cache()
       |
       +-- Step 1: $ARGUMENTS substitution
       +-- Step 2: !`command` injection (cached via SHA-256)
       |
       v
SlashCommandResult { resolved_body, is_fork, model, ... }
```

This pipeline runs synchronously on every skill invocation. The inject cache ensures that shell commands execute at most once per unique `(command, working_directory)` pair within a session. The entire resolution completes in under 100ms for skills without shell injections, and under 5 seconds even for skills that run `git diff` or `gh pr view` — the 5-second timeout is enforced per injection command.

Before we walk through the implementation, let's establish the core design decisions that shape everything:

1. **Skills are markdown files, not code.** Anyone who can write a README can write a skill. No compilation, no type system, no runtime to install.
2. **Project skills shadow user skills.** This prevents a user-level skill from interfering with a project's workflow expectations.
3. **No YAML parser dependency.** The frontmatter format is a restricted subset of YAML. A 100-line line-by-line parser handles it, avoiding 50KB of compiled YAML library for features nobody uses.
4. **Injection failures are visible, not fatal.** When a shell command in a skill fails, the LLM receives a sentinel string like `(command timed out after 5s)` instead of crashing the entire skill resolution.

---

## 20.2 The Skill Loading Pipeline

### Five Sources, Priority Ordering

A production skill system needs multiple sources. Users want personal skills. Teams want shared skills. Organizations want managed skills. Plugins want to register skills dynamically. And the agent itself ships with bundled skills for core workflows.

Here is the loading priority from highest to lowest:

| Priority | Source | Path | Committed to Git? |
|----------|--------|------|--------------------|
| 1 | **Project** | `.claude/skills/*/SKILL.md` | Yes |
| 2 | **User** | `~/.config/claude/skills/*/SKILL.md` | No |
| 3 | **Managed** | Org-provisioned via policy endpoint | No |
| 4 | **Plugins** | `~/.claude/plugins/*/skills/*/SKILL.md` | No |
| 5 | **Bundled** | Compiled into the binary | N/A |

The key rule: **when two skills share the same name, the higher-priority source wins.** A project skill named `code-review` shadows a user skill named `code-review`. This is the same shadowing principle that CSS uses for specificity, that environment variables use for scope, and that the permission system uses for rule evaluation (as we saw in Chapter 15).

### Implementation: The Registry Load

The `SkillRegistry::load()` function is the entry point. It loads from each source in priority order, tracking seen names to implement the shadowing:

```typescript
// skills/mod.ts (conceptual TypeScript equivalent)
interface SkillRegistry {
  skills: Skill[]
  injectCache: Map<string, string>  // SHA-256 key -> output
}

function loadSkillRegistry(projectRoot: string): SkillRegistry {
  const skills: Skill[] = []
  const seenNames = new Map<string, string>()  // name -> source path

  // Priority 1: Project skills
  const projectDir = path.join(projectRoot, '.claude', 'skills')
  loadFromDirectory(projectDir, 'project', skills, seenNames)

  // Priority 2: User skills
  const userDir = path.join(os.homedir(), '.config', 'claude', 'skills')
  loadFromDirectory(userDir, 'user', skills, seenNames)

  // Priority 3: Managed skills (from org policy)
  loadManagedSkills(skills, seenNames)

  // Priority 4: Plugin skills
  loadPluginSkills(skills, seenNames)

  // Priority 5: Bundled skills (compiled in)
  loadBundledSkills(skills, seenNames)

  return { skills, injectCache: new Map() }
}
```

The `seenNames` map is the shadowing mechanism. When `loadFromDirectory` encounters a skill whose name already exists in `seenNames`, it logs a message at info level and skips the duplicate:

```typescript
function loadFromDirectory(
  dir: string,
  source: SkillSource,
  skills: Skill[],
  seenNames: Map<string, string>,
): void {
  if (!fs.existsSync(dir)) return

  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))  // Deterministic order

  for (const entry of entries) {
    const skillFile = path.join(dir, entry.name, 'SKILL.md')
    if (!fs.existsSync(skillFile)) continue

    try {
      const skill = parseSkill(skillFile, path.join(dir, entry.name), source)
      if (seenNames.has(skill.name)) {
        log.info(`Skipping ${source} skill '${skill.name}' — ` +
          `shadowed by ${seenNames.get(skill.name)}`)
        continue
      }
      seenNames.set(skill.name, `${source}:${entry.name}`)
      skills.push(skill)
    } catch (err) {
      log.warn(`Failed to parse skill at ${skillFile}: ${err}`)
      // Never crash on skill parse failure
    }
  }
}
```

Three details matter here:

1. **Sorted entries.** The directory listing is sorted alphabetically. Without this, the load order would depend on the filesystem's directory entry ordering, which varies between ext4, APFS, and NTFS. Deterministic ordering means deterministic shadowing when two skills in the same source directory have the same name (first alphabetically wins).

2. **Never crash on parse failure.** A malformed `SKILL.md` file logs a warning and is skipped. This is critical for a system where users author skills — you cannot let a typo in one skill break every other skill.

3. **The `SKILL.md` convention.** Each skill lives in its own directory (e.g., `.claude/skills/code-review/SKILL.md`). The directory can contain additional files — reference documents, example outputs, templates — that the skill's body can reference. This is why skills are directories, not standalone files.

### Why Five Sources?

You might wonder why the system needs five sources instead of, say, two (project and user). The answer is organizational complexity:

- **Project skills** are checked into git. Every team member gets the same workflows. The `code-review` skill runs the same checks for everyone working on the repo.
- **User skills** are personal. Your `research` skill might use different sources than your colleague's. Your `scaffold` skill might set up projects differently.
- **Managed skills** come from your organization's policy server. When the security team mandates that every code review includes OWASP checks, they push a managed skill that cannot be overridden.
- **Plugin skills** come from the marketplace. Third-party authors package skills into plugins that users install. The agent's plugin system (Chapter 37) manages installation, updates, and removal.
- **Bundled skills** ship with the agent binary. These are the core workflows — `loop`, `remember`, `verify`, `batch`, `simplify` — that define the agent's baseline capabilities.

---

## 20.3 YAML Frontmatter: The 18-Field Specification

Every skill file starts with YAML frontmatter between `---` delimiters. The frontmatter configures how the skill is discovered, triggered, and executed. Here is the complete specification:

```yaml
---
name: code-review
description: Reviews code for bugs, security, performance. Use when user
  says "review", "check my code", "code review", "find bugs".
argument-hint: [file-or-directory]
allowed-tools: Read, Grep, Glob, Bash
model: opus
effort: high
context: fork
agent: code-reviewer
paths:
  - "src/**/*.ts"
  - "lib/**/*.py"
user-invocable: true
disable-model-invocation: false
# Additional fields for advanced use:
# memory: project
# max-turns: 50
# isolation: worktree
# timeout: 300
# references: ["docs/standards.md", "docs/owasp-top10.md"]
# output-format: table
# requires: ["git", "ruff"]
---

# Code Review Skill

When invoked, perform a thorough code review...
```

### All 18 Fields

| # | Field | Type | Default | Purpose |
|---|-------|------|---------|---------|
| 1 | `name` | string | directory name | Slash command name (`/code-review`) |
| 2 | `description` | string | `""` | Trigger phrases for auto-detection + autocomplete text |
| 3 | `argument-hint` | string | none | Shown in `/` menu autocomplete (e.g., `[issue-number]`) |
| 4 | `allowed-tools` | string[] | all tools | Tools that skip permission prompts during this skill |
| 5 | `model` | string | session default | Override model: `opus`, `sonnet`, `haiku` |
| 6 | `effort` | string | session default | Override reasoning effort: `low`, `medium`, `high`, `max` |
| 7 | `context` | string | `"inline"` | `inline` (inject into conversation) or `fork` (spawn subagent) |
| 8 | `agent` | string | `"general-purpose"` | Which agent type for `context: fork` |
| 9 | `paths` | string[] | `[]` | Glob patterns for auto-activation |
| 10 | `user-invocable` | boolean | `true` | Visible in `/` menu? |
| 11 | `disable-model-invocation` | boolean | `false` | Prevent LLM from auto-triggering? |
| 12 | `memory` | string | `"project"` | Memory scope: `user`, `project`, `local` |
| 13 | `max-turns` | number | unlimited | Limit agent turns for `context: fork` |
| 14 | `isolation` | string | none | `worktree` for git-isolated execution |
| 15 | `timeout` | number | none | Skill execution timeout in seconds |
| 16 | `references` | string[] | `[]` | Additional files loaded into context |
| 17 | `output-format` | string | `"markdown"` | Expected output format hint |
| 18 | `requires` | string[] | `[]` | System commands that must exist (validated at load) |

### The Frontmatter Parser

The system deliberately avoids pulling in a YAML parsing library. This is not laziness — it is a conscious engineering decision. The frontmatter format is a restricted subset of YAML: key-value pairs and simple lists. A full YAML parser would accept anchors, multi-document streams, flow sequences, and other features that would confuse skill authors and produce error messages referencing YAML spec details irrelevant to `SKILL.md` authoring.

The parser is approximately 100 lines and uses two boolean state flags to track multi-line list sections:

```typescript
interface Frontmatter {
  name?: string
  description?: string
  allowedTools?: string[]
  model?: string
  effort?: string
  paths: string[]
  userInvocable?: boolean
  disableModelInvocation?: boolean
  argumentHint?: string
  context?: string
  agent?: string
  // ... remaining fields
}

function splitFrontmatter(content: string): [string | null, string] {
  if (!content.startsWith('---')) return [null, content]
  const endIndex = content.indexOf('---', 3)
  if (endIndex === -1) return [null, content]
  const frontmatter = content.slice(3, endIndex)
  const body = content.slice(endIndex + 3).replace(/^[\r\n]+/, '')
  return [frontmatter, body]
}

function parseFrontmatterText(text: string): Frontmatter {
  const fm: Frontmatter = { paths: [] }
  let inPaths = false
  let inAllowedToolsList = false

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue  // Skip blanks and comments

    // Multi-line list items (indented with -)
    if (line.startsWith('- ')) {
      const value = stripQuotes(line.slice(2).trim())
      if (inPaths) fm.paths.push(value)
      if (inAllowedToolsList) {
        fm.allowedTools = fm.allowedTools ?? []
        fm.allowedTools.push(value)
      }
      continue
    }

    // Key-value pair
    inPaths = false
    inAllowedToolsList = false

    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim().toLowerCase()
    const rawValue = line.slice(colonIndex + 1).trim()

    switch (key) {
      case 'name':
        fm.name = stripQuotes(rawValue)
        break
      case 'description':
        fm.description = stripQuotes(rawValue)
        break
      case 'model':
        fm.model = stripQuotes(rawValue)
        break
      case 'effort':
        fm.effort = stripQuotes(rawValue)
        break
      case 'argument-hint':
        fm.argumentHint = stripQuotes(rawValue)
        break
      case 'context':
        fm.context = stripQuotes(rawValue)
        break
      case 'agent':
        fm.agent = stripQuotes(rawValue)
        break
      case 'user-invocable':
        fm.userInvocable = rawValue.toLowerCase() === 'true'
        break
      case 'disable-model-invocation':
        fm.disableModelInvocation = rawValue.toLowerCase() === 'true'
        break
      case 'paths':
        if (rawValue.startsWith('[')) {
          // Inline array: paths: ["*.rs", "*.toml"]
          fm.paths = parseInlineArray(rawValue)
        } else if (!rawValue) {
          inPaths = true  // Multi-line list follows
        }
        break
      case 'allowed-tools':
        if (rawValue) {
          // Inline: allowed-tools: Read, Grep, Bash
          fm.allowedTools = rawValue.split(',').map(s => s.trim())
        } else {
          inAllowedToolsList = true  // Multi-line list follows
        }
        break
      // ... remaining fields
    }
  }
  return fm
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}
```

The parser handles four formats for list fields:

| Format | Example | How It Parses |
|--------|---------|---------------|
| Inline comma-separated | `allowed-tools: Read, Grep, Bash` | Split on `,`, trim each |
| Inline bracket notation | `paths: ["*.rs", "*.toml"]` | Strip brackets, split on `,`, strip quotes |
| Multi-line list | `paths:\n  - "*.rs"\n  - "*.toml"` | State flag tracks current list, `- ` prefix |
| Empty (no value) | `paths:` followed by `- ` lines | Same as multi-line |

### Validation: Warnings, Not Errors

After parsing, the frontmatter undergoes validation. The validation produces warnings, not errors — a skill with a missing `name` field still loads, using the directory name as a fallback:

```typescript
function validateFrontmatter(fm: Frontmatter, filePath: string): string[] {
  const warnings: string[] = []

  if (!fm.name) {
    warnings.push(`${filePath}: missing 'name' field, using directory name`)
  }
  if (!fm.description) {
    warnings.push(`${filePath}: missing 'description', autocomplete will lack detail`)
  }
  if (fm.context === 'fork' && !fm.agent) {
    warnings.push(`${filePath}: context=fork without 'agent' field — ` +
      `will use general-purpose agent`)
  }

  return warnings
}
```

Three checks, three warnings. This is the right level of strictness for a user-authored configuration format. If you make validation too strict, users fight the system. If you make it too lenient, silent misconfigurations lead to mysterious behavior. The middle ground: load the skill, warn about potential issues, provide sensible defaults.

---

## 20.4 Dynamic Context Injection

This is the most powerful and most dangerous feature of the skill system. Dynamic context injection allows skill authors to embed shell commands inside their skill prompts. When the skill is invoked, the commands execute and their output replaces the command directive in the prompt text.

### The Syntax

The injection syntax is `` !`command` `` — an exclamation point followed by a backtick-delimited command:

```markdown
---
name: pr-summary
description: Summarize a pull request. Use when user says "PR", "pull request".
argument-hint: [pr-number]
---

# PR Summary

## Context
- PR diff: !`gh pr diff $ARGUMENTS`
- Changed files: !`gh pr diff $ARGUMENTS --name-only`
- PR details: !`gh pr view $ARGUMENTS --json title,body,author,labels`

## Instructions
Analyze the PR and produce:
1. A 2-3 sentence summary
2. A changes table: | File | Type | Description |
3. Risk assessment: breaking changes, security, performance
4. Review checklist
```

When a user runs `/pr-summary 42`, two things happen in sequence:

1. **Argument substitution:** `$ARGUMENTS` is replaced with `42` throughout the body.
2. **Injection resolution:** Each `` !`...` `` directive is replaced with the command's stdout.

The result is a fully-materialized prompt that already contains the PR diff, file list, and PR metadata — before the LLM even starts thinking. This eliminates an entire round of tool calls. Without dynamic injection, the LLM would need to call `Bash(gh pr diff 42)`, wait for the result, then call `Bash(gh pr view 42 ...)`, wait again, and only then begin its analysis. With injection, the skill arrives pre-loaded with all necessary context.

### Implementation: The Two-Stage Pipeline

```typescript
const INJECT_COMMAND_TIMEOUT_MS = 5000
const INJECT_TIMEOUT_MSG = '(command timed out after 5s)'
const INJECT_FAILURE_PREFIX = '(command failed:'
const INJECT_ERROR_PREFIX = '(command error:'

function resolveBody(
  skill: Skill,
  arguments_: string,
  cache?: InjectCache,
): string {
  // Stage 1: Argument substitution
  let body = skill.bodyRaw.replaceAll('$ARGUMENTS', arguments_)

  // Stage 2: Dynamic context injection
  let result = ''
  let remaining = body

  while (true) {
    const start = remaining.indexOf('!`')
    if (start === -1) {
      result += remaining
      break
    }

    result += remaining.slice(0, start)
    const afterMarker = remaining.slice(start + 2)
    const end = afterMarker.indexOf('`')

    if (end === -1) {
      // No closing backtick — preserve the marker literally
      result += '!`'
      remaining = afterMarker
      continue
    }

    const command = afterMarker.slice(0, end)
    const output = executeInjection(command, skill.skillDir, cache)
    result += output
    remaining = afterMarker.slice(end + 1)
  }

  return result
}
```

The parser is a manual scanner, not a regex. It looks for the two-character sequence `` !` ``, finds the closing backtick, extracts the command, and replaces the directive with the command's output. This is O(n) in body length with at most O(k) shell invocations where k is the number of injection directives.

Edge cases handled:

- **Unclosed backtick:** The `` !` `` marker is preserved literally. The LLM sees it as text.
- **Nested backticks:** Not supported. The first closing backtick terminates the command. If your command needs backticks, use `$(...)` subshell syntax instead.
- **Empty command:** Valid. Runs `sh -c ""` which succeeds silently, producing empty output.

### Shell Execution with Timeout

Each injection command runs under `sh -c` in the skill's directory:

```typescript
function executeInjection(
  command: string,
  cwd: string,
  cache?: InjectCache,
): string {
  // Check cache first
  if (cache) {
    const cached = cache.get(command, cwd)
    if (cached !== undefined) return cached
  }

  try {
    const child = spawn('sh', ['-c', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: INJECT_COMMAND_TIMEOUT_MS,
    })

    const result = waitWithTimeout(child, INJECT_COMMAND_TIMEOUT_MS)

    let output: string
    if (result === null) {
      // Timeout — kill the child
      child.kill('SIGKILL')
      output = INJECT_TIMEOUT_MSG
    } else if (result.exitCode !== 0) {
      output = `${INJECT_FAILURE_PREFIX} ${command})`
    } else {
      output = result.stdout.trim()
    }

    cache?.set(command, cwd, output)
    return output
  } catch (err) {
    const output = `${INJECT_ERROR_PREFIX} ${err})`
    cache?.set(command, cwd, output)
    return output
  }
}
```

Four outcomes, each producing a deterministic string:

| Outcome | Return Value | Example |
|---------|-------------|---------|
| Success | Trimmed stdout | The actual diff output |
| Non-zero exit | `(command failed: gh pr diff 999)` | PR 999 does not exist |
| Timeout (5s) | `(command timed out after 5s)` | Network call hung |
| Spawn error | `(command error: ENOENT)` | `gh` not installed |

The critical design choice: **sentinel strings instead of errors.** When a command fails, the LLM still receives the full skill prompt — with a visible failure marker where the command output would be. This lets the LLM adapt. If it sees `(command failed: gh pr diff 999)`, it can tell the user "PR 999 doesn't exist" rather than the skill silently failing with no output at all.

### The Inject Cache

The inject cache prevents re-execution of identical commands within a session. The cache key is a SHA-256 hash of `(command, working_directory)`:

```typescript
class InjectCache {
  private entries = new Map<string, string>()

  private cacheKey(command: string, cwd: string): string {
    const hash = createHash('sha256')
    hash.update(command)
    hash.update('|')  // Separator prevents collision
    hash.update(cwd)
    return hash.digest('hex')
  }

  get(command: string, cwd: string): string | undefined {
    return this.entries.get(this.cacheKey(command, cwd))
  }

  set(command: string, cwd: string, output: string): void {
    this.entries.set(this.cacheKey(command, cwd), output)
  }

  clear(): void {
    this.entries.clear()
  }
}
```

The pipe separator `|` in the hash input prevents collisions between `("a", "b|c")` and `("a|b", "c")`. The cache has no TTL — it lives as long as the `SkillRegistry` instance, which is the session lifetime. A `clear()` method exists for manual invalidation.

Why SHA-256 instead of a simpler hash? Because the `sha2` crate is already a dependency elsewhere in the codebase. No additional binary size. And while collision probability is irrelevant at cache sizes of dozens, the choice costs nothing and eliminates one class of bugs entirely.

### Security Implications

Dynamic injection is a shell execution vector. Any skill that uses `` !`command` `` can run arbitrary commands on the user's machine. This is intentional — the power comes from trusting skill authors the same way you trust scripts in your `$PATH`. But three mitigations limit the blast radius:

1. **5-second timeout.** A runaway injection cannot block the session indefinitely.
2. **Skill source priority.** Managed skills (from your organization) override plugin skills. You control what runs.
3. **The PreToolUse hook system.** As we built in Chapter 18, hooks can inspect and block tool executions. A hook could scan skill bodies for dangerous injection patterns before the skill loads.

If you are building your own agent and this level of trust is unacceptable, you have two options: disable injection entirely (a feature flag), or sandbox injections in a restricted environment (container, seccomp, or WASM — at the cost of losing access to the user's git state and CLI tools).

---

## 20.5 Bundled Skills Deep Dive

Bundled skills ship with the agent binary. They define the baseline experience — the workflows that work out of the box without any configuration. Claude Code ships approximately 15 bundled skills. The most architecturally interesting ones are:

### loop

The `/loop` skill runs a prompt or slash command on a recurring interval:

```markdown
---
name: loop
description: Run a command on a recurring interval. Use when user says
  "loop", "every N minutes", "keep checking", "poll", "recurring".
argument-hint: [interval] [command]
disable-model-invocation: true
---

# Loop Skill

Parse the arguments to extract:
1. An interval (default: 10 minutes). Accepted formats: "5m", "30s", "1h".
2. A command to repeat (the rest of the arguments).

Execute the command immediately, then schedule it to repeat at the interval.
Use the cron scheduler (Chapter 41) for durable scheduling.
```

The `disable-model-invocation: true` flag is critical here. Without it, the LLM might auto-trigger the loop skill whenever a user says "keep checking on that" in casual conversation. Some skills are dangerous enough that only explicit `/loop` invocation should trigger them.

### batch

The `/batch` skill enables parallel multi-file changes using worktree isolation:

```markdown
---
name: batch
description: Apply a change across many files in parallel. Use when user
  says "batch", "all files", "every file", "across the codebase".
argument-hint: [instruction]
context: fork
agent: general-purpose
isolation: worktree
model: sonnet
---

# Batch Skill

1. Parse the instruction to determine:
   - What change to make
   - Which files are affected (use Glob/Grep to find them)
2. For each file, spawn a sub-agent in an isolated git worktree
3. Each agent applies the change to its file independently
4. Collect results, verify no conflicts, merge worktrees
```

This skill demonstrates the interplay between three systems: the skill system provides the workflow definition, the subagent system (Chapter 13) provides parallel execution, and git worktree isolation prevents concurrent file edits from conflicting. The `context: fork` field tells the system to spawn a new agent rather than injecting the skill body into the current conversation.

### simplify

The `/simplify` skill reviews recently changed code for quality:

```markdown
---
name: simplify
description: Review changed code for reuse, quality, efficiency.
  Use when user says "simplify", "clean up", "review changes".
allowed-tools: Read, Grep, Glob, Bash
---

# Simplify

Review the recent changes (use `git diff` to find them).
For each changed file:
1. Check for code duplication with existing code
2. Check for unnecessary complexity
3. Check for performance issues
4. Suggest concrete improvements with diffs

Output format:
| File | Issue | Suggestion | Priority |
```

The `allowed-tools` field restricts what tools the skill can use without permission prompts. During a simplify operation, the agent needs to read files and search the codebase — but it should not be writing files or running arbitrary commands without explicit approval.

### verify

The `/verify` skill runs project-appropriate verification after changes:

```markdown
---
name: verify
description: Verify recent changes by running tests, linting, type checking.
  Use when user says "verify", "check", "test", "does it work".
allowed-tools: Read, Bash, Grep
---

# Verify

Detect the project's verification tools:
- Python: pytest, ruff check, mypy/pyright
- TypeScript: vitest/jest, eslint, tsc --noEmit
- Rust: cargo test, cargo clippy, cargo check
- Go: go test, go vet, golangci-lint

Run in order: type check -> lint -> test (fast to slow).
Stop on first failure. Report results as a table.
```

### remember

The `/remember` skill captures information to persistent memory:

```markdown
---
name: remember
description: Save important context to memory. Use when user says
  "remember this", "save this", "note that", "don't forget".
argument-hint: [what to remember]
disable-model-invocation: true
---

# Remember

Save the provided information to the project's memory system.
Categorize as: fact, preference, decision, or reference.
Write to the appropriate memory file in ~/.claude/projects/.
```

Again, `disable-model-invocation: true` — the agent should not decide on its own to write to persistent memory. That is a side effect with session-spanning consequences.

### The Common Pattern

Notice the pattern across all bundled skills:

1. **Descriptive triggers** in the `description` field list every phrase that should activate the skill.
2. **Minimal frontmatter** — only the fields that differ from defaults.
3. **Clear step-by-step instructions** in the body. The LLM follows numbered steps reliably.
4. **Output format specification** at the end. Tables, diffs, and structured formats reduce ambiguity.
5. **`disable-model-invocation`** on skills with side effects (loop, remember).

If you are building your own agent, start with five bundled skills that cover your users' most common workflows. Observe which workflows users build custom skills for, and promote the best patterns to bundled status in the next release.

---

## 20.6 MCP Skill Builders

Skills do not have to be static markdown files. MCP servers can register skills dynamically at runtime through the skill builder protocol. This is how third-party integrations add workflows without shipping files to the user's disk.

### The Protocol

An MCP server registers skills by exposing a `skills/list` resource that returns an array of skill definitions:

```typescript
// MCP server implementation
server.setRequestHandler('resources/list', async () => {
  return {
    resources: [{
      uri: 'skills://my-server/skills-list',
      name: 'Dynamic skills from my-server',
      mimeType: 'application/json',
    }],
  }
})

server.setRequestHandler('resources/read', async (request) => {
  if (request.params.uri === 'skills://my-server/skills-list') {
    return {
      contents: [{
        uri: request.params.uri,
        mimeType: 'application/json',
        text: JSON.stringify([
          {
            name: 'deploy-staging',
            description: 'Deploy to staging. Use when user says "deploy staging".',
            body: '# Deploy to Staging\n\n1. Run staging deploy...\n',
            allowedTools: ['Bash'],
            model: 'sonnet',
          },
          {
            name: 'rollback',
            description: 'Rollback last deployment.',
            body: '# Rollback\n\n1. Identify last successful deploy...\n',
          },
        ]),
      }],
    }
  }
})
```

### Loading Dynamic Skills

The skill registry queries connected MCP servers for skill definitions during the loading phase:

```typescript
async function loadMCPSkills(
  connections: MCPConnection[],
  skills: Skill[],
  seenNames: Map<string, string>,
): Promise<void> {
  for (const conn of connections) {
    if (conn.state !== 'connected') continue
    if (!conn.capabilities?.resources) continue

    try {
      const resources = await conn.client.listResources()
      const skillResource = resources.find(r =>
        r.uri.startsWith('skills://') && r.uri.endsWith('/skills-list')
      )
      if (!skillResource) continue

      const content = await conn.client.readResource(skillResource.uri)
      const definitions = JSON.parse(content.text) as SkillDefinition[]

      for (const def of definitions) {
        const skill = buildSkillFromDefinition(def, conn.name)
        if (seenNames.has(skill.name)) {
          log.info(`Skipping MCP skill '${skill.name}' — shadowed`)
          continue
        }
        seenNames.set(skill.name, `mcp:${conn.name}`)
        skills.push(skill)
      }
    } catch (err) {
      log.warn(`Failed to load skills from MCP server '${conn.name}': ${err}`)
    }
  }
}
```

MCP skills follow the same shadowing rules as file-based skills. If a project already defines a `deploy-staging` skill, the MCP server's version is skipped. This ensures that local customizations always win.

### Dynamic Refresh

MCP skill builders support hot-reload. When an MCP server's connection is re-established (after a disconnection or server restart), the skill registry re-queries the server's skill list and updates its internal state. Skills added by a server are removed when the server disconnects. This is implemented through the same connection lifecycle hooks that manage MCP tool registration (Chapter 15).

### Security Considerations

MCP-registered skills cannot use dynamic injection (`` !`command` ``). This restriction exists because MCP servers are external — they could inject arbitrary shell commands into the user's environment. Only file-based skills (project, user, managed, bundled) have access to dynamic injection, because those files exist on the user's filesystem and are subject to the same trust model as any other script.

---

## 20.7 Auto-Activation and Path-Based Triggering

Not all skills are invoked via slash commands. Some skills should activate automatically when the user is working with specific file types. The `paths` frontmatter field enables this:

```yaml
---
name: api-conventions
description: API design conventions for this project.
paths:
  - "src/api/**"
  - "**/routes/**"
  - "**/endpoints/**"
user-invocable: false
disable-model-invocation: false
---

# API Conventions

When working with API files:
- Use RESTful naming: plural nouns for collections
- Return consistent error objects: { error: string, code: number }
- Validate request bodies with Zod schemas
- ...
```

This skill has `user-invocable: false` — it does not appear in the `/` menu. It activates automatically when the user reads or edits files matching the glob patterns.

### The Matching Algorithm

When the agent is about to process a user message, it checks which files are in the active context (recently read, edited, or mentioned). The matching function filters skills by their path triggers:

```typescript
function findAutoActivatingSkills(
  registry: SkillRegistry,
  activePaths: string[],
): Skill[] {
  return registry.skills.filter(skill => {
    // Must not have auto-invocation disabled
    if (skill.disableModelInvocation) return false
    // Must have path triggers defined
    if (skill.pathTriggers.length === 0) return false
    // At least one active path must match a trigger
    return activePaths.some(filePath =>
      skill.pathTriggers.some(pattern =>
        globMatch(pattern, filePath)
      )
    )
  })
}
```

The `globMatch` function supports three wildcard patterns, consistent with the permission system's glob matcher (Chapter 15):

| Pattern | Matches | Example |
|---------|---------|---------|
| `*` | Any characters except `/` | `src/*.ts` matches `src/app.ts` but not `src/utils/app.ts` |
| `**` | Any characters including `/` | `src/**` matches `src/a/b/c.ts` |
| `?` | Exactly one character | `?.ts` matches `a.ts` but not `ab.ts` |

### Injection into System Prompt

Auto-activated skills are injected into the system prompt alongside explicitly invoked skills. The system prompt builder calls `formatSystemPromptSection()` to produce an XML listing:

```typescript
function formatSystemPromptSection(registry: SkillRegistry): string {
  const invocable = registry.skills.filter(s => s.userInvocable)
  if (invocable.length === 0) return ''

  let output = '<available_skills>\n'
  for (const skill of invocable) {
    output += '<skill>\n'
    output += `  <name>${skill.name}</name>\n`
    if (skill.description) {
      output += `  <description>${skill.description}</description>\n`
    }
    output += `  <location>${skill.source}</location>\n`
    if (skill.context === 'fork') {
      output += '  <context>fork</context>\n'
    }
    if (skill.argumentHint) {
      output += `  <argument-hint>${skill.argumentHint}</argument-hint>\n`
    }
    if (skill.allowedTools) {
      output += `  <allowed-tools>${skill.allowedTools.join(', ')}</allowed-tools>\n`
    }
    output += '</skill>\n'
  }
  output += '</available_skills>'
  return output
}
```

The XML-like format was chosen because LLMs reliably parse angle-bracket structures. Each skill entry includes: name, description, source (project/user/managed/plugin/bundled), context mode, argument hint, and allowed tools. This gives the LLM enough information to decide when to suggest a skill to the user or auto-activate one based on the conversation context.

### Auto-Activation vs. Auto-Invocation

There is a subtle but important distinction:

- **Auto-activation** means the skill's content is injected into the system prompt when relevant files are in context. The LLM sees the skill's instructions and follows them.
- **Auto-invocation** means the LLM decides to "call" the skill as if the user typed the slash command. This is controlled by `disable-model-invocation`.

A skill with `paths: ["src/api/**"]` and `disable-model-invocation: false` will both auto-activate (its instructions appear in the prompt when API files are active) and be auto-invocable (the LLM can decide to "run" the skill based on conversation context). Setting `disable-model-invocation: true` allows auto-activation but prevents auto-invocation — the instructions are available but the LLM cannot trigger the full skill workflow independently.

---

## 20.8 Argument Substitution and Token Estimation

### Argument Substitution

When a user types `/pr-summary 42`, the system splits the input into `(name: "pr-summary", args: "42")`:

```typescript
function parseSlashCommand(input: string): [string, string] | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/') || trimmed.length <= 1) return null

  const withoutSlash = trimmed.slice(1)
  const spaceIndex = withoutSlash.indexOf(' ')

  if (spaceIndex === -1) {
    return [withoutSlash, '']  // No arguments
  }

  return [
    withoutSlash.slice(0, spaceIndex),
    withoutSlash.slice(spaceIndex + 1).trim(),
  ]
}
```

The arguments string is then substituted into the skill body via `replaceAll('$ARGUMENTS', args)`. This is a simple string replacement — no escaping, no regex, no template syntax. If `$ARGUMENTS` appears multiple times in the skill body, each occurrence is replaced. This is intentional: a PR summary skill might need the PR number in the diff command, the review section, and the link section.

### Slash Command Dispatch

The full dispatch pipeline:

```typescript
function executeSlashCommand(
  registry: SkillRegistry,
  input: string,
): SlashCommandResult | null {
  const parsed = parseSlashCommand(input)
  if (!parsed) return null

  const [name, args] = parsed

  // Lookup: exact match first, then case-insensitive fallback
  const skill = registry.findByName(name) ?? registry.findByNameCI(name)
  if (!skill) return null

  // Check invocability
  if (!skill.userInvocable) {
    return {
      skillName: skill.name,
      resolvedBody: '',
      isFork: false,
      error: `Skill '${skill.name}' is not user-invocable`,
    }
  }

  // Resolve body with injection cache
  const resolvedBody = resolveBody(skill, args, registry.injectCache)

  return {
    skillName: skill.name,
    resolvedBody,
    isFork: skill.context === 'fork',
    agentType: skill.agent,
    allowedTools: skill.allowedTools,
    model: skill.model,
    error: null,
  }
}
```

The lookup order — exact match first, then case-insensitive — prevents ambiguity. If you have skills named `PR` and `pr`, exact match differentiates them. But if you only have `pr-summary` and the user types `/PR-Summary`, the case-insensitive fallback catches it. This matches how most command-line tools handle case: prefer exact, fall back to insensitive.

### The SlashCommandResult

The result struct carries everything the caller needs:

```typescript
interface SlashCommandResult {
  skillName: string          // For logging and display
  resolvedBody: string       // The fully-materialized prompt text
  isFork: boolean            // Spawn subagent or inject inline?
  agentType?: string         // Which agent type for fork mode
  allowedTools?: string[]    // Tool restrictions for the skill
  model?: string             // Model override
  error?: string             // Non-null if dispatch failed
}
```

The caller (the command dispatch system, as we will cover in Chapter 22) uses this struct to either inject the resolved body into the current conversation (for inline skills) or spawn a subagent with the appropriate model and tool restrictions (for fork skills).

### Token Estimation for Skills

Skills consume context window tokens. A skill with a large body — especially one with dynamic injections that expand to thousands of lines of diff output — can consume a significant fraction of the available context. The system estimates token consumption before injection:

```typescript
function estimateSkillTokens(resolvedBody: string): number {
  // Rough estimate: 1 token per 4 characters for English text
  // Adjusted for code: 1 token per 3.5 characters
  const charCount = resolvedBody.length
  const hasCode = resolvedBody.includes('```') ||
    resolvedBody.includes('diff --git')
  const charsPerToken = hasCode ? 3.5 : 4.0
  return Math.ceil(charCount / charsPerToken)
}

function shouldTruncateSkill(
  resolvedBody: string,
  contextBudget: number,
  usedTokens: number,
): { truncate: boolean; maxChars: number } {
  const estimated = estimateSkillTokens(resolvedBody)
  const available = contextBudget - usedTokens
  const skillBudget = Math.floor(available * 0.3)  // Skills get max 30% of remaining

  if (estimated <= skillBudget) {
    return { truncate: false, maxChars: resolvedBody.length }
  }

  // Truncate to fit
  const charsPerToken = resolvedBody.includes('```') ? 3.5 : 4.0
  const maxChars = Math.floor(skillBudget * charsPerToken)
  return { truncate: true, maxChars }
}
```

The 30% budget cap prevents a single skill from consuming the entire context window. This is especially important for skills like `/pr-summary` where the injected diff can be tens of thousands of lines. When truncation is needed, the system truncates from the end of the resolved body and appends a `(truncated — showing first N characters)` marker so the LLM knows it is working with partial data.

This connects directly to the token estimation system we built in Chapter 7. The character-based estimate is intentionally approximate — it avoids the cost of running the actual tokenizer for a quick should-we-truncate decision. As we discussed in Chapter 7, the actual tokenizer is only invoked when precise counts matter (API calls, context window boundary decisions). For skill injection, the estimate is sufficient.

---

## 20.9 The Skill Auto-Improvement Engine

The auto-improvement engine is a background system that analyzes conversation turns and proposes updates to skill files. This is the system that makes skills get better over time without manual intervention.

### Architecture

The engine lives in `skills/improvement.rs` (797 lines) and consists of four components:

| Component | Purpose |
|-----------|---------|
| `SkillAnalyzer` | Main orchestrator. Analyzes turn batches and collects suggestions. |
| `SkillMetrics` | Per-skill success/failure tracking with rolling window. |
| `SkillUpdate` | A proposed change to a skill file (add, modify, or remove a section). |
| Four detection heuristics | Pattern matchers that identify improvement opportunities. |

### Metrics Tracking

Every skill invocation is recorded:

```typescript
interface SkillMetrics {
  skillName: string
  invocations: number
  successes: number
  failures: number
  lastUpdated: Date
  recentOutcomes: boolean[]  // Rolling window of 50
}

function recordOutcome(metrics: SkillMetrics, success: boolean): void {
  metrics.invocations++
  if (success) metrics.successes++
  else metrics.failures++

  metrics.recentOutcomes.unshift(success)
  if (metrics.recentOutcomes.length > 50) {
    metrics.recentOutcomes.length = 50  // Truncate
  }
  metrics.lastUpdated = new Date()
}
```

Metrics are persisted to `.claude/skill_metrics/*.json` — one file per skill. The rolling window of 50 outcomes provides recency-weighted data: a skill that failed its last 5 invocations after 45 successes has a 90% overall success rate but a 0% recent success rate. Both signals matter.

### The Four Detection Heuristics

The engine runs four independent heuristics over batches of conversation turns:

**1. Repeated Tool Failures**

Triggers when the same tool fails two or more times within a batch of 5 turns:

```typescript
function detectRepeatedFailures(turns: Turn[]): SkillUpdate[] {
  const failCounts = new Map<string, number>()
  for (const turn of turns) {
    for (const call of turn.toolCalls) {
      if (!call.success) {
        failCounts.set(call.name, (failCounts.get(call.name) ?? 0) + 1)
      }
    }
  }

  const updates: SkillUpdate[] = []
  for (const [tool, count] of failCounts) {
    if (count >= 2) {
      updates.push({
        section: '## Error Handling',
        changeType: 'add',
        content: `When \`${tool}\` fails, retry with corrected ` +
          `arguments or use an alternative tool.`,
        confidence: Math.min(0.6 + count * 0.1, 0.9),
        reason: `Tool '${tool}' failed ${count} times in recent turns`,
      })
    }
  }
  return updates
}
```

Confidence scales from 0.7 (2 failures) to 0.9 (3+ failures). Only the 3+ case reaches the auto-apply threshold of 0.85.

**2. Undocumented Tool Usage**

Triggers when a tool is used three or more times in a batch but is not mentioned in any skill's body:

```typescript
function detectUndocumentedTools(
  turns: Turn[],
  skills: Skill[],
): SkillUpdate[] {
  const toolUsage = new Map<string, number>()
  for (const turn of turns) {
    for (const call of turn.toolCalls) {
      if (call.success) {
        toolUsage.set(call.name, (toolUsage.get(call.name) ?? 0) + 1)
      }
    }
  }

  const documented = new Set<string>()
  for (const skill of skills) {
    // Extract tool names mentioned in skill body
    const mentions = skill.bodyRaw.match(/`(\w+)`/g) ?? []
    for (const m of mentions) documented.add(m.slice(1, -1))
  }

  const updates: SkillUpdate[] = []
  for (const [tool, count] of toolUsage) {
    if (count >= 3 && !documented.has(tool)) {
      updates.push({
        section: '## Tools',
        changeType: 'add',
        content: `Consider using \`${tool}\` for related tasks.`,
        confidence: Math.min(0.5 + count * 0.05, 0.8),
        reason: `Tool '${tool}' used ${count} times but not documented`,
      })
    }
  }
  return updates
}
```

Max confidence: 0.8. This never auto-applies — it always requires human review.

**3. Long No-Tool Turns**

Triggers when an assistant turn exceeds 2,000 characters with zero tool calls:

```typescript
function detectLongNoToolTurns(turns: Turn[]): SkillUpdate[] {
  const updates: SkillUpdate[] = []
  for (const turn of turns) {
    if (turn.role === 'assistant' &&
        turn.content.length > 2000 &&
        turn.toolCalls.length === 0 &&
        turn.activeSkill) {
      updates.push({
        section: '## Output Examples',
        changeType: 'add',
        content: 'Include a concrete output example to guide format.',
        confidence: 0.55,
        reason: 'Assistant produced long text without tool use — may need structure',
      })
    }
  }
  return updates
}
```

Fixed confidence of 0.55. This is a weak signal — sometimes long text output is exactly what the skill intended.

**4. Missing Section References**

Detects when assistant turns reference section headings that may not exist in the skill file:

```typescript
function detectMissingSectionRefs(
  turns: Turn[],
  skills: Skill[],
): SkillUpdate[] {
  const updates: SkillUpdate[] = []
  for (const turn of turns) {
    if (turn.role !== 'assistant' || !turn.activeSkill) continue
    const skill = skills.find(s => s.name === turn.activeSkill)
    if (!skill) continue

    const headingRefs = turn.content.match(/## \w[\w\s]+/g) ?? []
    for (const ref of headingRefs) {
      if (!skill.bodyRaw.includes(ref)) {
        updates.push({
          section: ref.trim(),
          changeType: 'add',
          content: `(Section referenced in output but not defined in skill)`,
          confidence: 0.45,
          reason: `Assistant referenced '${ref}' which does not exist in skill`,
        })
      }
    }
  }
  return updates
}
```

Fixed confidence of 0.45 — the weakest signal. Section headings in assistant output may be entirely appropriate without being in the skill template.

### Deduplication and Auto-Apply

When multiple heuristics produce updates targeting the same `(file, section)`, the higher-confidence update wins:

```typescript
function deduplicateUpdates(updates: SkillUpdate[]): SkillUpdate[] {
  const seen = new Map<string, number>()  // key -> index in result
  const result: SkillUpdate[] = []

  for (const update of updates) {
    const key = `${update.skillFile}::${update.section}`
    const existingIndex = seen.get(key)
    if (existingIndex !== undefined) {
      if (update.confidence > result[existingIndex].confidence) {
        result[existingIndex] = update  // Higher confidence wins
      }
    } else {
      seen.set(key, result.length)
      result.push(update)
    }
  }
  return result
}
```

After deduplication, updates with confidence >= 0.85 are auto-applied:

```typescript
const AUTO_APPLY_CONFIDENCE = 0.85

function analyzeAndApply(
  turns: Turn[],
  skills: Skill[],
  autoApply: boolean,
): SkillUpdate[] {
  let updates = [
    ...detectRepeatedFailures(turns),
    ...detectUndocumentedTools(turns, skills),
    ...detectLongNoToolTurns(turns),
    ...detectMissingSectionRefs(turns, skills),
  ]

  updates = deduplicateUpdates(updates)

  if (autoApply) {
    for (const update of updates) {
      if (update.confidence >= AUTO_APPLY_CONFIDENCE) {
        applyUpdate(update)
      }
    }
  }

  return updates
}
```

Given the four heuristics' confidence ranges, only `detectRepeatedFailures` with 3+ failures can reach the auto-apply threshold. This is a deliberately conservative design — automatic skill modification should be rare and high-confidence.

### Skill Ranking

The metrics enable ranking skills by effectiveness:

```typescript
const MIN_INVOCATIONS_FOR_RANKING = 3

function rankSkills(
  metrics: Map<string, SkillMetrics>,
): Array<{ name: string; successRate: number }> {
  const rankable = [...metrics.values()]
    .filter(m => m.invocations >= MIN_INVOCATIONS_FOR_RANKING)
    .map(m => ({
      name: m.skillName,
      successRate: m.successes / m.invocations,
    }))
    .sort((a, b) => b.successRate - a.successRate)

  return rankable
}
```

Skills with fewer than 3 invocations are excluded — there is not enough data for a meaningful ranking. This ranking can be exposed through a `/skills stats` command to help users identify skills that need improvement.

---

## 20.10 Putting It All Together: Skill Lifecycle

Here is the complete lifecycle of a skill, from creation to improvement:

```
1. AUTHORING
   User creates .claude/skills/my-skill/SKILL.md
   with YAML frontmatter and markdown body
          |
          v
2. LOADING
   SkillRegistry::load() scans all 5 sources
   Parses frontmatter, validates, deduplicates by name
   Project skills shadow user skills
          |
          v
3. REGISTRATION
   Skills injected into system prompt (<available_skills> XML)
   Auto-activating skills matched against active file paths
   Slash commands registered for user-invocable skills
          |
          v
4. INVOCATION
   User types /my-skill args
   OR LLM auto-triggers based on description match
   OR file path matches auto-activate trigger
          |
          v
5. RESOLUTION
   $ARGUMENTS replaced throughout body
   !`command` directives executed (cached)
   Token estimation, truncation if needed
          |
          v
6. EXECUTION
   Inline: resolved body injected into conversation
   Fork: subagent spawned with model/tool overrides
          |
          v
7. TRACKING
   SkillMetrics records success/failure outcome
   Rolling window of 50 recent outcomes maintained
          |
          v
8. IMPROVEMENT
   SkillAnalyzer runs 4 heuristics over turn batches
   High-confidence updates auto-applied to SKILL.md
   Lower-confidence suggestions presented to user
```

### Integration Points

The skill system does not exist in isolation. It connects to nearly every other system we have built:

| System | Integration |
|--------|-------------|
| **Query Loop** (Chapter 4) | Resolved skill body is injected as a user message or system context |
| **Tool System** (Chapter 8) | `allowed-tools` field restricts available tools during skill execution |
| **Permission System** (Chapter 15) | Tool restrictions from skills are evaluated alongside permission rules |
| **Hook System** (Chapter 18) | Skills can reference hooks, and hooks can inspect skill invocations |
| **Subagent System** (Chapter 13) | `context: fork` skills spawn subagents with model and tool overrides |
| **Token Estimation** (Chapter 7) | Skill body size is estimated to prevent context window overflow |
| **System Prompt** (Chapter 25) | Skills are listed in the system prompt for LLM awareness |
| **MCP** (Chapter 15) | MCP servers can register dynamic skills via the skill builder protocol |
| **Memory** (Chapter 23) | The `remember` skill writes to persistent memory storage |
| **Configuration** (Chapter 21) | Feature flag `skill_improvement` gates the auto-improvement engine |

---

## 20.11 Building Your Own Skill System: Implementation Checklist

If you are building an AI CLI agent and want to implement a skill system, here is the prioritized order:

### Phase 1: Minimal Viable Skills
1. **File-based loading** from one directory. Parse `SKILL.md` files with simple key-value frontmatter.
2. **Slash command dispatch.** Parse `/name args`, look up skill, inject body into conversation.
3. **`$ARGUMENTS` substitution.** Simple `replaceAll`.
4. Three bundled skills: `verify`, `simplify`, and one domain-specific skill for your users.

### Phase 2: Multi-Source and Injection
5. **Two-directory loading** with project shadowing user. Add the `seenNames` deduplication.
6. **Dynamic context injection** (`` !`command` ``). Add the inject cache.
7. **Auto-activation** via `paths` globs. Inject matching skills into system prompt.
8. **Token estimation** to prevent skills from consuming the entire context.

### Phase 3: Advanced Features
9. **MCP skill builders** for dynamic skill registration.
10. **Fork mode** for skills that spawn subagents.
11. **Auto-improvement engine** with metrics and heuristics.
12. **Plugin skills** via the marketplace system.
13. **Managed skills** via organization policy.

Each phase is independently shippable. Phase 1 gives you a working skill system in a few hundred lines. Phase 2 adds the power features. Phase 3 adds the enterprise and ecosystem features.

---

## 20.12 Key Takeaways

**Skills are the user-facing extensibility layer.** While hooks (Chapter 18-19) provide automation guardrails and MCP (Chapter 15) provides tool extensibility, skills provide workflow extensibility. They are the mechanism through which domain knowledge enters the agent without code changes.

**The loading pipeline's priority ordering is the foundation of trust.** Project skills override user skills, managed skills override plugin skills, and the shadowing-by-name mechanism prevents conflicts. Get this ordering wrong and users lose confidence in the system.

**Dynamic injection is the most powerful feature — and the most dangerous.** The `` !`command` `` syntax turns static skill prompts into dynamic, context-aware instructions. The 5-second timeout, sentinel strings for failures, and the SHA-256 inject cache are the safety nets. If you are building your own agent, this is the feature to implement carefully and audit regularly.

**The frontmatter parser deliberately avoids a YAML dependency.** This is not laziness — it is a deliberate restriction of the configuration surface. The 100-line parser handles the exact subset needed (key-value pairs and simple lists) and produces skill-specific error messages. Full YAML support would invite complexity that confuses skill authors.

**Auto-improvement is conservative by design.** Only one of the four heuristics can reach the auto-apply confidence threshold, and only in cases of repeated tool failures. The system errs heavily toward human review over automated modification. Skills are user-authored artifacts — the system should suggest improvements, not silently rewrite them.

**Token estimation gates skill injection.** The 30% budget cap prevents a single skill from monopolizing the context window. This is especially important for skills with dynamic injections that can expand to thousands of lines. Without this cap, a `/pr-summary` on a large PR would leave no room for the LLM to think.

The skill system, combined with the configuration system we will build in Chapter 21 and the command system in Chapter 22, completes the picture of how an AI agent becomes configurable and extensible without source code changes. Together, they transform a powerful but rigid engine into a tool that adapts to each user's workflow.
