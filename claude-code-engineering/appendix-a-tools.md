# Appendix A: Complete Tool Reference

This appendix catalogs all 52 tools available in the agent, organized by category. Each entry includes the tool's purpose, input schema, output format, and permission requirements.

---

## Core Tools

| # | Tool | Purpose | Key Parameters | Default Permission |
|---|------|---------|----------------|-------------------|
| 1 | **Read** | Read file contents (text, images, PDFs, notebooks) | `file_path`, `offset?`, `limit?`, `pages?` | Allow |
| 2 | **Edit** | Exact string replacement in files | `file_path`, `old_string`, `new_string`, `replace_all?` | Ask |
| 3 | **Write** | Create or overwrite files | `file_path`, `content` | Ask |
| 4 | **Glob** | Find files by pattern (ripgrep backend) | `pattern`, `path?` | Allow |
| 5 | **Grep** | Search file contents with regex | `pattern`, `path?`, `output_mode?`, `context?`, `type?` | Allow |
| 6 | **Bash** | Execute shell commands | `command`, `timeout?`, `description?`, `run_in_background?` | Ask |
| 7 | **NotebookEdit** | Modify Jupyter notebook cells | `notebook_path`, `new_source`, `cell_type?`, `edit_mode?` | Ask |

### Read Tool Details

```typescript
interface ReadInput {
  file_path: string;       // Absolute path (required)
  offset?: number;         // Starting line number (0-based)
  limit?: number;          // Max lines to read
  pages?: string;          // PDF page range: "1-5", "3", "10-20"
}
```

**Capabilities:** Text files, images (displayed visually), PDFs (max 20 pages/request), Jupyter notebooks (all cells + outputs), binary files (error message).

**Output format:** `cat -n` format with line numbers starting at 1.

### Bash Tool Details

```typescript
interface BashInput {
  command: string;                    // Shell command to execute
  timeout?: number;                   // Max ms (default: 120000, max: 600000)
  description?: string;               // Human-readable description
  run_in_background?: boolean;        // Non-blocking execution
  dangerouslyDisableSandbox?: boolean; // Bypass sandbox (requires explicit permission)
}
```

**Security layers:** Bash AST parsing → dangerous pattern detection → permission evaluation → sandbox enforcement → execution.

---

## Web Tools

| # | Tool | Purpose | Key Parameters | Default Permission |
|---|------|---------|----------------|-------------------|
| 8 | **WebFetch** | Fetch URL content, convert HTML to markdown | `url`, `prompt` | Ask |
| 9 | **WebSearch** | Search the web with domain filtering | `query`, `allowed_domains?`, `blocked_domains?` | Ask |

### WebFetch Details

- 15-minute response cache
- HTML → Markdown conversion via readability algorithm
- AI processing: content is summarized using a small, fast model
- SSRF protection: blocks private IP ranges (10.x, 172.16-31.x, 192.168.x)
- Auto-upgrades HTTP → HTTPS

### WebSearch Details

- Returns structured search result blocks with markdown hyperlinks
- Supports domain inclusion and exclusion lists
- Results include title, URL, and snippet

---

## Agent Tools

| # | Tool | Purpose | Key Parameters | Default Permission |
|---|------|---------|----------------|-------------------|
| 10 | **Agent** | Spawn specialized subagents | `prompt`, `description`, `subagent_type?`, `model?`, `isolation?` | Allow |
| 11 | **SendMessage** | Send message to running agent | `to`, `content` | Allow |

### Agent Subagent Types

| Type | Description | Available Tools |
|------|-------------|-----------------|
| `general-purpose` | Multi-step tasks, code search | All |
| `Explore` | Fast codebase exploration | Read, Grep, Glob, LSP |
| `Plan` | Architecture planning | Read, Grep, Glob, LSP |
| `security-reviewer` | Security vulnerability analysis | Read, Grep, Glob, Bash, Write, Edit |
| `code-reviewer` | Code quality review | Read, Grep, Glob, Write, Edit |
| `debugger` | Bug investigation | Read, Grep, Glob, Bash |
| `researcher` | Web research + synthesis | Read, Grep, Glob, WebFetch, WebSearch |
| `doc-writer` | Documentation generation | Read, Grep, Glob, Write, Edit |

---

## Task Tools

| # | Tool | Purpose | Key Parameters | Default Permission |
|---|------|---------|----------------|-------------------|
| 12 | **TaskCreate** | Create a tracked task | `subject`, `description`, `activeForm?` | Allow |
| 13 | **TaskGet** | Retrieve task details | `taskId` | Allow |
| 14 | **TaskList** | List all tasks with status | (none) | Allow |
| 15 | **TaskUpdate** | Update task status/details | `taskId`, `status?`, `description?`, `addBlocks?` | Allow |
| 16 | **TaskOutput** | Read background task output | `task_id`, `block?`, `timeout?` | Allow |
| 17 | **TaskStop** | Stop a running background task | `task_id` | Allow |

### Task Status Lifecycle

```
pending → in_progress → completed
                      → deleted
```

---

## LSP Tools

| # | Tool | Purpose | Key Parameters | Default Permission |
|---|------|---------|----------------|-------------------|
| 18 | **LSP** | Language Server Protocol operations | `operation`, `filePath`, `line`, `character` | Allow |

### LSP Operations

| Operation | Description | Returns |
|-----------|-------------|---------|
| `goToDefinition` | Find symbol definition | File path + position |
| `findReferences` | Find all references | List of locations |
| `hover` | Get documentation/type info | Hover content |
| `documentSymbol` | List symbols in file | Symbol tree |
| `workspaceSymbol` | Search symbols across workspace | Symbol list |
| `goToImplementation` | Find interface implementations | Location list |
| `prepareCallHierarchy` | Get call hierarchy item | Hierarchy item |
| `incomingCalls` | Find callers | Call list |
| `outgoingCalls` | Find callees | Call list |

---

## Session & Memory Tools

| # | Tool | Purpose | Key Parameters | Default Permission |
|---|------|---------|----------------|-------------------|
| 19 | **AskUserQuestion** | Present questions with options | `questions` (1-4 questions, 2-4 options each) | Allow |
| 20 | **EnterPlanMode** | Switch to planning mode | (none) | Allow |
| 21 | **ExitPlanMode** | Submit plan for approval | `allowedPrompts?` | Allow |
| 22 | **EnterWorktree** | Create isolated git worktree | `name?` | Ask |
| 23 | **ExitWorktree** | Leave worktree session | `action` ("keep" or "remove") | Ask |
| 24 | **Skill** | Invoke a registered skill | `skill`, `args?` | Allow |

---

## Scheduling Tools

| # | Tool | Purpose | Key Parameters | Default Permission |
|---|------|---------|----------------|-------------------|
| 25 | **CronCreate** | Schedule recurring/one-shot tasks | `cron`, `prompt`, `recurring?`, `durable?` | Ask |
| 26 | **CronDelete** | Cancel a scheduled task | `id` | Ask |
| 27 | **CronList** | List all scheduled tasks | (none) | Allow |

### Cron Expression Format

Standard 5-field: `minute hour day-of-month month day-of-week`

| Example | Meaning |
|---------|---------|
| `*/5 * * * *` | Every 5 minutes |
| `0 9 * * 1-5` | Weekdays at 9am |
| `30 14 28 2 *` | Feb 28 at 2:30pm |

---

## MCP Dynamic Tools (28-52+)

MCP servers register tools dynamically at runtime. Tool names follow the pattern `mcp__servername__toolname`.

| # | Example Tool | Source | Purpose |
|---|-------------|--------|---------|
| 28+ | `mcp__copilot-mem__save_fact` | copilot-mem | Store persistent knowledge |
| 29+ | `mcp__copilot-mem__search_memory` | copilot-mem | Search stored memories |
| 30+ | `mcp__copilot-mem__save_preference` | copilot-mem | Store user preferences |
| 31+ | `mcp__operator__share_screen` | tridoan-operator | Screen sharing/control |
| 32+ | `mcp__operator__mouse_click` | tridoan-operator | Mouse automation |
| ... | (server-dependent) | Various | Extends agent capabilities |

### MCP Tool Annotations

| Annotation | Type | Description |
|-----------|------|-------------|
| `readOnlyHint` | boolean | Tool only reads data, never modifies |
| `destructiveHint` | boolean | Tool may delete or overwrite data |
| `openWorldHint` | boolean | Tool interacts with external services |
| `idempotentHint` | boolean | Safe to retry without side effects |

### Tool Result Handling

- Results truncated at 100K characters
- Binary content encoded as Base64
- Large results persisted to disk with path reference
- Tool execution timeout: 2 minutes (default), 10 minutes (max)
