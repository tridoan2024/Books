# Appendix G: Permission Modes & Rule Syntax Reference

## The Permission System

Claude Code's permission system is the primary safety boundary between the AI agent and your system. Every tool invocation -- every file read, every bash command, every file write -- passes through the permission evaluator before execution. Understanding the permission model is not optional for production use; it is the difference between an agent that works safely unattended and one that deletes your home directory because you typed "clean up."

This appendix is the complete reference for permission modes, rule syntax, evaluation order, and rule source priority. For the architectural discussion of why the permission system works this way, see Chapter 7.

---

## The 6 Permission Modes

When Claude Code launches, it operates in exactly one permission mode. The mode determines the default behavior when no explicit rule matches a tool invocation.

| Mode | Flag | Default Behavior | Use Case |
|------|------|-------------------|----------|
| **default** | (none) | Prompt user for every unmatched tool call | Interactive development. You see and approve each action. |
| **auto** | `--auto` | Auto-approve all unmatched tool calls | CI/CD pipelines, scripted workflows, headless execution. Trusts the agent fully for operations not explicitly denied. |
| **bypass** | `--bypass` | Skip all permission checks entirely | Internal Anthropic testing only. Not available in external builds (gated by `PERMISSION_BYPASS_MODE` flag). |
| **acceptEdits** | `--accept-edits` | Auto-approve file reads and edits; prompt for bash commands and other tools | When you trust the agent to modify files but want to review shell commands. Good for refactoring sessions. |
| **dontAsk** | `--dont-ask` | Auto-approve all tool calls silently (no prompts, no logging) | Embedded usage where the host application manages trust. Differs from `auto` in that it suppresses all permission UI. |
| **plan** | `--plan` | Block all write operations (edits, bash, file writes). Allow all reads. | Read-only exploration. The agent can investigate and plan but cannot change anything. Used by `/plan` command. |

### Mode Selection Priority

If multiple mode signals conflict, the highest priority wins:

1. **CLI flag** (`--auto`, `--plan`, etc.) -- highest priority
2. **Environment variable** (`CLAUDE_PERMISSION_MODE=auto`)
3. **Settings file** (`"permissionMode": "auto"` in settings.json)
4. **Default** -- `default` mode (interactive prompting)

### Mode Transitions Within a Session

The `/plan` command temporarily switches to plan mode within an active session. When the plan is complete and the user says "execute," the session returns to its original mode. This is the only supported mid-session mode transition.

---

## Rule Syntax

Permission rules use the format `Tool(pattern)` where `Tool` is a tool name and `pattern` is a glob that matches against the tool's input.

### Basic Syntax

```
Tool(pattern)
```

| Component | Description | Examples |
|-----------|-------------|----------|
| `Tool` | The tool name exactly as registered | `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `NotebookEdit`, `mcp__servername__toolname` |
| `pattern` | Glob pattern matched against the tool's primary input | File path for Read/Edit/Write, command string for Bash, URL for WebFetch |

### Glob Pattern Reference

| Pattern | Matches | Example |
|---------|---------|---------|
| `*` | Any characters within a single path segment | `Bash(git *)` matches `git status`, `git diff HEAD` |
| `**` | Any characters across path segments | `Read(./**/*.env)` matches `.env`, `config/.env`, `deploy/staging/.env` |
| `?` | Any single character | `Read(./?.json)` matches `a.json` but not `ab.json` |
| `{a,b}` | Alternation | `Bash({git,gh} *)` matches `git status` and `gh pr view` |
| `[abc]` | Character class | `Read(./config[123].json)` matches `config1.json`, `config2.json` |
| `[!abc]` | Negated character class | `Read(./[!.]*)` matches files not starting with `.` |

### Concrete Rule Examples

```json
{
  "allow": [
    "Bash(git *)",                    // All git subcommands
    "Bash(gh *)",                     // All GitHub CLI commands
    "Bash(python -m pytest *)",       // Pytest with any arguments
    "Bash(ruff *)",                   // Ruff linter and formatter
    "Bash(npm test)",                 // Exact command match
    "Bash(ls *)",                     // List directories
    "Bash(cat *)",                    // Read file contents
    "Read(./**)",                     // Read any file in the project
    "Edit(./**/*.py)",                // Edit any Python file
    "Write(./**/*.md)",               // Write any Markdown file
    "Grep(./**)",                     // Search any file
    "Glob(./**)",                     // Glob any path
    "WebSearch(*)",                   // Any web search
    "WebFetch(https://docs.*/**)",    // Fetch from documentation sites
    "mcp__copilot-mem__*(*)"          // All copilot-mem MCP tools
  ],
  "deny": [
    "Read(./.env)",                   // Never read .env files
    "Read(./.env.*)",                 // Never read .env.local, .env.production, etc.
    "Read(./**/credentials*)",        // Never read credential files
    "Read(./**/*.pem)",               // Never read private keys
    "Read(./**/token.json)",          // Never read token files
    "Bash(rm -rf *)",                 // Never recursive force delete
    "Bash(DROP TABLE *)",             // Never drop database tables
    "Bash(git push --force *)",       // Never force push
    "Bash(curl * | bash)",            // Never pipe curl to bash
    "Write(./.env*)"                  // Never write to env files
  ]
}
```

### Pattern Matching Details

Pattern matching is **case-sensitive** on all platforms. The match is performed against the **entire** tool input, not a substring. `Bash(git *)` matches `git status` but does not match `sudo git status` because the pattern must match from the start.

For Bash commands, the pattern matches against the exact command string that will be executed. For file operations (Read, Edit, Write, Glob, Grep), the pattern matches against the file path argument. Paths are normalized to use forward slashes before matching, even on Windows.

---

## Evaluation Order

When a tool invocation occurs, the permission evaluator processes rules in this order:

```
1. DENY rules    →  If any deny rule matches  →  BLOCK (tool does not execute)
2. ASK rules     →  If any ask rule matches   →  PROMPT user for approval
3. ALLOW rules   →  If any allow rule matches  →  APPROVE (tool executes)
4. MODE DEFAULT  →  No rule matched            →  Apply permission mode default
```

This is a **first-match-wins within each tier** system, but tiers are evaluated strictly in deny-ask-allow order. A deny rule always overrides an allow rule, even if the allow rule is more specific.

### Practical implications

```json
{
  "allow": ["Bash(git *)"],
  "deny":  ["Bash(git push --force *)"]
}
```

This configuration allows all git commands **except** force push. The deny rule fires first, blocking `git push --force main` before the allow rule for `Bash(git *)` is ever evaluated.

```json
{
  "allow": ["Read(./**)"],
  "deny":  ["Read(./.env)"]
}
```

This allows reading any project file except `.env`. Even though `Read(./.**)` is a superset that includes `.env`, the deny tier evaluates first.

### The "ask" tier

The `ask` tier is implicit in `default` mode -- any tool call not matching `allow` or `deny` falls through to "ask the user." You can also create explicit ask rules to force prompting for specific operations even in `auto` mode:

```json
{
  "ask": [
    "Bash(rm *)",
    "Bash(git push *)",
    "Write(./**/config*)"
  ]
}
```

In `auto` mode, these three patterns will still prompt the user while everything else auto-approves.

---

## Rule Sources & Priority

Permission rules are loaded from 8 sources, evaluated in priority order. Higher-priority sources override lower ones. Within the same source, `deny` still beats `allow` per the evaluation order above.

| Priority | Source | Location | Who Controls | Overridable? |
|----------|--------|----------|-------------|-------------|
| 1 (highest) | **Built-in safety** | Hardcoded in binary | Anthropic | No |
| 2 | **Managed settings** | Organization MDM/endpoint | Organization admin | No |
| 3 | **CLI flags** | `--allowedTools`, `--deniedTools` | User (per invocation) | -- |
| 4 | **Environment** | `CLAUDE_ALLOWED_TOOLS`, `CLAUDE_DENIED_TOOLS` | User / CI pipeline | -- |
| 5 | **User settings** | `~/.claude/settings.json` | User (global) | Yes |
| 6 | **User local** | `~/.claude/settings.local.json` | User (global, gitignored) | Yes |
| 7 | **Project settings** | `.claude/settings.json` | Team (committed to repo) | Yes |
| 8 (lowest) | **Project local** | `.claude/settings.local.json` | User (per-project, gitignored) | Yes |

### Source Details

**Built-in safety (Priority 1):** The binary contains a hardcoded deny list that cannot be overridden by any configuration. This blocks catastrophic commands like `rm -rf /`, `mkfs`, `dd if=/dev/zero of=/dev/sda`, and a curated set of destructive patterns. These rules exist even in `bypass` mode.

**Managed settings (Priority 2):** Organizations can deploy a managed settings file via MDM (macOS), Group Policy (Windows), or a configuration endpoint. These rules enforce organizational policy -- for example, denying access to production databases or requiring approval for outbound network requests. Users cannot override managed rules.

**CLI flags (Priority 3):** The `--allowedTools` and `--deniedTools` flags accept comma-separated rule patterns:

```bash
claude --allowedTools "Bash(npm *),Read(./src/**)" --deniedTools "Bash(rm *)"
```

**Environment variables (Priority 4):** Same syntax as CLI flags, useful for CI/CD:

```bash
export CLAUDE_ALLOWED_TOOLS="Bash(npm *),Bash(git *)"
export CLAUDE_DENIED_TOOLS="Bash(rm *),Write(./.env*)"
claude --auto
```

**User settings (Priority 5-6):** `~/.claude/settings.json` is your global configuration. `settings.local.json` is the gitignored override for personal preferences. The local file is where power users put `Bash(*)` to auto-approve all bash commands.

**Project settings (Priority 7-8):** `.claude/settings.json` is committed to the repo and shared with the team. It defines the team's agreed-upon permission baseline. `.claude/settings.local.json` is gitignored for per-developer overrides.

### Resolution Example

Given these settings files:

```
# Managed (org policy)
deny: Bash(curl * | sh)

# User settings (~/.claude/settings.json)
allow: Bash(*)

# Project settings (.claude/settings.json)
deny: Bash(rm -rf *)
allow: Bash(git *), Bash(npm *)

# Project local (.claude/settings.local.json)  
allow: Bash(rm ./tmp/*)
```

For `rm -rf /tmp/cache`:
1. Built-in safety: no match for this specific pattern
2. Managed: no match
3. Project deny `Bash(rm -rf *)`: **MATCH -- BLOCKED**

The user's `Bash(*)` allow and the project local's `Bash(rm ./tmp/*)` allow never get evaluated because the project deny fires at a higher tier.

For `curl https://example.com | sh`:
1. Built-in safety: no match
2. Managed deny `Bash(curl * | sh)`: **MATCH -- BLOCKED**

The user's `Bash(*)` cannot override the managed policy.

---

## Common Permission Configurations

### Minimal (security-conscious team)

```json
{
  "permissions": {
    "allow": [
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(python -m pytest *)",
      "Bash(ruff *)",
      "Read(./**)",
      "Grep(./**)",
      "Glob(./**)"
    ],
    "deny": [
      "Read(./.env*)",
      "Read(./**/*.pem)",
      "Read(./**/credentials*)"
    ]
  }
}
```

Everything else prompts. The agent can read code, search, and run tests without interruption. Git writes, file edits, and arbitrary bash require approval.

### Balanced (solo developer)

```json
{
  "permissions": {
    "allow": [
      "Bash(git *)",
      "Bash(gh *)",
      "Bash(python *)",
      "Bash(npm *)",
      "Bash(ruff *)",
      "Bash(ls *)",
      "Bash(cat *)",
      "Read(./**)",
      "Edit(./**)",
      "Write(./**)",
      "Grep(./**)",
      "Glob(./**)",
      "WebSearch(*)",
      "WebFetch(*)"
    ],
    "deny": [
      "Read(./.env*)",
      "Bash(rm -rf *)",
      "Bash(git push --force *)",
      "Write(./.env*)"
    ]
  }
}
```

Most development operations auto-approve. Destructive operations and secret access are denied.

### CI/CD Pipeline

```json
{
  "permissionMode": "auto",
  "permissions": {
    "deny": [
      "Bash(git push *)",
      "Bash(rm -rf *)",
      "Read(./.env*)",
      "WebFetch(*)",
      "WebSearch(*)"
    ]
  }
}
```

Auto mode with explicit denials for network access, destructive commands, and secrets. The agent can read, analyze, test, and report but cannot push, delete, or exfiltrate.

### Power User (personal local)

```json
{
  "permissions": {
    "allow": [
      "Bash(*)"
    ],
    "deny": [
      "Read(./.env*)",
      "Read(./**/*.pem)"
    ]
  }
}
```

In `settings.local.json` (gitignored). Auto-approves all bash commands. The deny rules still protect secrets because deny always evaluates before allow.
