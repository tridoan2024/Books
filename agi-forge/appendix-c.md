# Appendix C: Tool and Command Reference

*The Complete Catalog of Claude Code's Instrumentation Layer*

---

Every multi-CLI agent system is ultimately a composition of tools. Claude Code ships with over fifty built-in tools and nearly one hundred slash commands — an instrumentation surface that rivals commercial IDEs while remaining fully programmable. This appendix provides the definitive reference for every tool, every command, and the interface you need to build your own.

The catalog is organized into three sections. **Section 1** covers the built-in tools — the callable primitives that agents use to read files, execute code, search repositories, spawn sub-agents, and interact with external services. **Section 2** documents the slash commands — the user-facing entry points that configure sessions, trigger workflows, and manage the agent lifecycle. **Section 3** provides the complete `Tool` interface and a step-by-step guide to building custom tools that integrate seamlessly into Claude Code's permission, rendering, and discovery systems.

A note on methodology: the tool names, interface members, and feature flags documented here were extracted directly from the Claude Code source — specifically `Tool.ts` (the core interface), `tools.ts` (the registry), the `commands/` directory (89+ command implementations), and `constants/features.ts` (feature flag definitions). Where a tool or command is gated behind a feature flag, that flag is noted explicitly.

---

## Section 1: The Tool Catalog

Claude Code's tools are the atomic building blocks of agent behavior. When Claude decides to read a file, execute a shell command, or spawn a sub-agent, it is invoking a tool. Each tool implements a standard interface (documented in Section 3) that governs its input schema, permission model, concurrency behavior, and rendering.

Tools are organized into eight categories based on their primary function. Within each category, tools are listed with their internal name, read/write classification, recommended CLI contexts, and a concise description of their behavior.

### Understanding the Table Columns

Before diving into the catalog, here is what each column means:

- **Tool Name**: The user-facing name that appears in Claude Code's tool calls and logs.
- **Internal Name**: The TypeScript class name in the source code — useful when extending or debugging.
- **Category**: The functional grouping (File Operations, Execution, Agent, Web, MCP, Planning, Code Intelligence, or Advanced).
- **R/W**: Whether the tool is read-only (`R`), write (`W`), or mixed (`R/W`) — this determines whether the tool is available in Plan Mode and affects permission classification.
- **Concurrency**: Whether the tool can safely execute in parallel with other tool calls in the same turn (`✅`) or requires exclusive execution (`❌`).
- **Recommended CLIs**: Which CLI configurations benefit most from this tool — Interactive (terminal), Headless (CI/CD), IDE (VS Code extension), or All.
- **Feature Flag**: If the tool requires a specific feature flag to be enabled, it is listed here. "None" means always available.

### 1.1 File Operations (6 Tools)

File operations are the most frequently invoked tools in any Claude Code session. They are always loaded (never deferred) because virtually every task involves reading or modifying files.

| Tool Name | Internal Name | R/W | Concurrency | Recommended CLIs | Feature Flag | Description |
|-----------|---------------|-----|-------------|------------------|--------------|-------------|
| **Read** | `FileReadTool` | R | ✅ Yes | All | None | Read file contents with optional line-range selection. Supports binary detection, encoding handling, and automatic truncation for large files. The workhorse of every agent session. |
| **Edit** | `FileEditTool` | W | ❌ No | All | None | Precise search-and-replace editing. Matches an exact string in the file and replaces it. Fails gracefully if the search string is not found or matches multiple locations. |
| **Write** | `FileWriteTool` | W | ❌ No | All | None | Create new files or overwrite existing files completely. Used when Edit's surgical approach is insufficient — for example, when creating a file from scratch. |
| **Glob** | `GlobTool` | R | ✅ Yes | All | None* | Fast file-pattern matching using glob syntax (`**/*.ts`, `src/**/*.test.js`). Returns matching file paths. May be deferred on systems without embedded search if tool count exceeds threshold. |
| **Grep** | `GrepTool` | R | ✅ Yes | All | None* | Regex pattern search across file contents, built on ripgrep. Supports context lines, line numbers, multiline mode, and file-type filters. May be deferred like Glob. |
| **NotebookEdit** | `NotebookEditTool` | W | ❌ No | IDE, Interactive | None | Edit Jupyter notebook cells — insert, replace, or delete cells by index. Understands the `.ipynb` JSON structure and preserves cell metadata. |

> **\* Deferral Note:** Glob and Grep are deferred (lazy-loaded via ToolSearch) only when embedded search tools are disabled *and* the total tool count exceeds the deferral threshold (~30 tools). In native Bun builds, they are embedded and always loaded.

**Key Design Insight:** Read is concurrency-safe because reading a file has no side effects. Edit and Write are not concurrency-safe because two simultaneous edits to the same file would produce unpredictable results. This distinction matters when Claude issues parallel tool calls — the `StreamingToolExecutor` will serialize write operations to the same file while allowing reads to proceed in parallel.

### 1.2 Execution and Shell (3 Tools)

Execution tools are the most powerful — and most dangerous — tools in Claude Code's arsenal. They allow the agent to run arbitrary code on the host machine, which is why they have the most sophisticated permission checking.

| Tool Name | Internal Name | R/W | Concurrency | Recommended CLIs | Feature Flag | Description |
|-----------|---------------|-----|-------------|------------------|--------------|-------------|
| **Bash** | `BashTool` | R/W | ❌ Exclusive | All | None | Execute bash commands with comprehensive security validation. Features a 1,600+ line security analysis engine, dynamic read-only detection (e.g., `ls` is read-only, `rm` is not), and a two-stage permission classifier. The single most-used write tool. |
| **PowerShell** | `PowerShellTool` | R/W | ❌ Exclusive | All (Windows) | None | Windows equivalent of BashTool. Executes PowerShell commands with the same security analysis engine adapted for Windows-specific patterns. |
| **REPL** | `REPLTool` | R/W | ❌ Exclusive | Interactive | ANT-only | Sandboxed Python/JavaScript/Ruby interactive environment. Wraps Bash, Read, and Edit internally. Currently restricted to Anthropic-internal deployments. |

**Bash's Read-Only Detection:** BashTool dynamically classifies each command as read-only or read-write. Commands like `cat`, `ls`, `git log`, and `find` are classified as read-only and permitted in Plan Mode. Commands like `rm`, `mv`, `npm install`, and `git push` are classified as read-write and require explicit permission. This classification feeds into the two-stage permission system described in Chapter 6.

**The Exclusivity Constraint:** Execution tools set `isConcurrencySafe: false` because shell commands can have arbitrary side effects — running two `npm install` commands simultaneously would corrupt `node_modules`. The `StreamingToolExecutor` enforces this by queuing execution tools.

### 1.3 Agent and Task Management (9 Tools)

Agent tools are the backbone of multi-CLI systems. They enable the spawning, coordination, and lifecycle management of sub-agents — the core subject of this book.

| Tool Name | Internal Name | R/W | Concurrency | Recommended CLIs | Feature Flag | Description |
|-----------|---------------|-----|-------------|------------------|--------------|-------------|
| **Agent** | `AgentTool` | R/W | ✅ Yes | All | None | Spawn autonomous sub-agents with their own tool access, context window, and task scope. The most important tool for multi-CLI architectures. Supports both synchronous (wait-for-completion) and asynchronous (fire-and-forget) spawning. |
| **TaskCreate** | `TaskCreateTool` | W | ❌ No | Interactive, Headless | `TODOS_V2` | Create structured todo/task items with title, description, status, and dependencies. Enables the task-tracking workflows described in Chapter 9. |
| **TaskGet** | `TaskGetTool` | R | ✅ Yes | All | `TODOS_V2` | Retrieve a task by ID. Returns status, description, dependencies, and output if complete. |
| **TaskList** | `TaskListTool` | R | ✅ Yes | All | `TODOS_V2` | List all tasks with optional filtering by status (pending, in-progress, done, blocked). |
| **TaskUpdate** | `TaskUpdateTool` | W | ❌ No | All | `TODOS_V2` | Update a task's status, description, or other fields. Used by agents to report progress. |
| **TaskStop** | `TaskStopTool` | W | ❌ No | All | None | Cancel a running task or agent. Sends an interrupt signal and waits for graceful shutdown. Always available — not gated behind `TODOS_V2`. |
| **TaskOutput** | `TaskOutputTool` | R | ✅ Yes | All | `TODOS_V2` | Read the completion output of a finished task. Used to retrieve results from asynchronous agents. |
| **TeamCreate** | `TeamCreateTool` | W | ❌ No | Interactive | `AGENT_SWARMS` | Create a team workspace — a shared context for multiple agents working on related tasks. Enables the swarm patterns from Chapter 11. |
| **TeamDelete** | `TeamDeleteTool` | W | ❌ No | Interactive | `AGENT_SWARMS` | Delete a team workspace and clean up associated resources. |

**Feature Gate Dependencies:** The Task tools (`TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `TaskOutput`) require the `TODOS_V2` feature flag. The Team tools (`TeamCreate`, `TeamDelete`) require `AGENT_SWARMS`. `AgentTool` and `TaskStop` are always available — they are the minimum viable set for any multi-agent system.

**Agent Spawning Modes:** `AgentTool` supports two spawning patterns:
- **Synchronous**: The parent agent blocks until the child agent completes. Used for sequential task decomposition.
- **Asynchronous** (requires `FORK_SUBAGENT` flag): The parent agent continues while the child runs in the background. Used for parallel task execution.

### 1.4 Web and Search (3 Tools)

Web tools give agents access to external information — URLs, search engines, and the tool registry itself.

| Tool Name | Internal Name | R/W | Concurrency | Recommended CLIs | Feature Flag | Description |
|-----------|---------------|-----|-------------|------------------|--------------|-------------|
| **WebFetch** | `WebFetchTool` | R | ✅ Yes | All | None | Fetch URLs with caching, custom headers, and authentication support. Converts HTML to markdown by default. Supports pagination via `start_index` for long pages. |
| **WebSearch** | `WebSearchTool` | R | ✅ Yes | All | None | AI-powered web search via Tavily or Google APIs. Returns synthesized answers with inline citations and source URLs. Requires a search API key in configuration. |
| **ToolSearch** | `ToolSearchTool` | R | ✅ Yes | All | None | Discover deferred tools by keyword. When the total tool count exceeds the deferral threshold (~30), less-frequently-used tools are lazy-loaded. ToolSearch finds and activates them using `searchHint` keywords. |

**The ToolSearch Mechanism:** ToolSearch is Claude Code's answer to the "too many tools" problem. With 50+ built-in tools plus any number of MCP tools, sending all tool definitions to the API on every turn would consume significant context. Instead, tools with `shouldDefer: true` are hidden from the API until ToolSearch activates them. Each deferred tool provides a `searchHint` — a 3-to-10-word description that ToolSearch uses for keyword matching. Tools with `alwaysLoad: true` bypass this mechanism entirely.

### 1.5 MCP Integration (4 Tools)

Model Context Protocol tools bridge Claude Code with external services — databases, APIs, cloud providers, and any system that implements the MCP server specification.

| Tool Name | Internal Name | R/W | Concurrency | Recommended CLIs | Feature Flag | Description |
|-----------|---------------|-----|-------------|------------------|--------------|-------------|
| **MCPTool** | `MCPTool` | R/W | Varies | All | `.mcp.json` | Generic wrapper for any MCP server tool. The R/W classification depends on the specific MCP tool being called. Configured via `.mcp.json` or `--mcp-server` CLI flags. |
| **ListMcpResources** | `ListMcpResourcesTool` | R | ✅ Yes | All | `.mcp.json` | List available resources from connected MCP servers. Returns resource names, descriptions, and URIs. |
| **ReadMcpResource** | `ReadMcpResourceTool` | R | ✅ Yes | All | `.mcp.json` | Read a single resource from an MCP server by URI. Used to fetch data that MCP servers expose as readable resources (as opposed to tool calls). |
| **McpAuth** | `McpAuthTool` | W | ❌ No | Internal | Internal | Handle MCP OAuth and authentication flows. Internal-only — not directly invoked by users or agents. |

**MCP Configuration:** MCP tools become available when an `.mcp.json` file exists in the project root or home directory. Each MCP server entry specifies the transport (stdio, SSE, or streamable HTTP), the command to launch the server, and optional environment variables. See Chapter 8 for MCP server configuration patterns.

### 1.6 Planning and Mode Tools (4 Tools)

Mode tools alter Claude Code's behavioral state — switching between planning (read-only), coding (full access), and isolated worktree environments.

| Tool Name | Internal Name | R/W | Concurrency | Recommended CLIs | Feature Flag | Description |
|-----------|---------------|-----|-------------|------------------|--------------|-------------|
| **EnterPlanMode** | `EnterPlanModeTool` | R | ❌ No | Interactive | None | Transition to read-only planning mode. All write tools are disabled. The agent can only read files, search, fetch URLs, and reason. Used for exploration before committing to changes. |
| **ExitPlanMode** | `ExitPlanModeV2Tool` | W | ❌ No | Interactive | None | Exit planning mode and return to full tool access. Optionally executes a plan created during plan mode. |
| **EnterWorktree** | `EnterWorktreeTool` | W | ❌ No | Interactive | None | Create an isolated git worktree — a separate working directory with its own branch. Allows agents to make experimental changes without affecting the main working tree. |
| **ExitWorktree** | `ExitWorktreeTool` | W | ❌ No | Interactive | None | Exit the worktree, optionally merging changes back to the original branch or discarding them. |

**Plan Mode Enforcement:** When Plan Mode is active, the tool filtering pipeline (in `tools.ts`) calls `isReadOnly(input)` on every tool before making it available. Only tools that return `true` for `isReadOnly` are presented to the model. This is a hard enforcement — the model literally cannot see write tools while in Plan Mode.

### 1.7 Code Intelligence (2 Tools)

Code intelligence tools provide semantic understanding of code — going beyond text search to offer compiler-grade analysis.

| Tool Name | Internal Name | R/W | Concurrency | Recommended CLIs | Feature Flag | Description |
|-----------|---------------|-----|-------------|------------------|--------------|-------------|
| **LSP** | `LSPTool` | R | ✅ Yes | IDE, Interactive | `ENABLE_LSP_TOOL` | Query language servers for go-to-definition, find-references, hover information, diagnostics, and symbol search. Bridges Claude Code to any LSP-compatible language server (TypeScript, Python, Rust, Go, etc.). |
| **Skill** | `SkillTool` | R/W | ✅ Yes | All | None | Execute or discover learned skills — reusable tool compositions that Claude has learned from previous sessions or that are defined in `.claude/skills/` directories. Skills are Claude Code's mechanism for persistent learned behavior. |

**LSP Integration Pattern:** The LSP tool launches a language server as a child process, communicates via JSON-RPC, and caches results for the session. It is particularly powerful in IDE mode where the language server is already running. In headless mode, it must cold-start the language server, which adds latency to the first call.

### 1.8 Advanced and Specialized Tools (15+ Tools)

These tools serve specialized use cases — scheduling, monitoring, communication, browser automation, and internal diagnostics. Most are gated behind feature flags.

| Tool Name | Internal Name | R/W | Feature Flag | Description |
|-----------|---------------|-----|--------------|-------------|
| **Brief** | `BriefTool` | R/W | None | Get or set the agent's "briefing" context — a persistent note that survives context compaction. Used to maintain critical instructions across long sessions. |
| **Sleep** | `SleepTool` | R | `PROACTIVE` or `KAIROS` | Pause execution for a specified duration. Only available in proactive/autonomous modes where the agent operates without continuous user interaction. |
| **CronCreate** | `CronCreateTool` | W | `AGENT_TRIGGERS` | Schedule recurring tasks using cron syntax. Enables autonomous agents that wake up on schedule to perform maintenance, monitoring, or data collection. |
| **CronDelete** | `CronDeleteTool` | W | `AGENT_TRIGGERS` | Remove a scheduled cron task by ID. |
| **CronList** | `CronListTool` | R | `AGENT_TRIGGERS` | List all scheduled cron tasks with their status, next run time, and configuration. |
| **RemoteTrigger** | `RemoteTriggerTool` | W | `AGENT_TRIGGERS_REMOTE` | Trigger an agent remotely via webhook or API call. Enables event-driven agent activation from external systems (CI/CD pipelines, monitoring alerts, etc.). |
| **SendMessage** | `SendMessageTool` | W | None | Send a message to a team channel or another agent. Used for inter-agent communication in multi-agent systems. |
| **TodoWrite** | `TodoWriteTool` | W | `TODOS_V2` | Write structured todo items in `todo.txt` format. An alternative to the Task tools for simpler task tracking. |
| **WebBrowser** | `WebBrowserTool` | R/W | `WEB_BROWSER_TOOL` | Full Chromium browser automation — navigate, click, type, screenshot. Uses Playwright under the hood. Significantly more capable than WebFetch but heavier. |
| **Monitor** | `MonitorTool` | R | `MONITOR_TOOL` | Health and resource monitoring — CPU, memory, disk, process status. Used by autonomous agents to self-monitor and avoid resource exhaustion. |
| **AskQuestion** | `AskUserQuestionTool` | R | None | Ask the user for input. The only tool that pauses execution to wait for human response. In headless mode, this tool is typically disabled or auto-answered. |
| **Snip** | `SnipTool` | W | `HISTORY_SNIP` | Snip (remove) sections of conversation history to reclaim context space. More surgical than `/compact`. |
| **ListPeers** | `ListPeersTool` | R | `UDS_INBOX` | List connected peer agents communicating via Unix domain sockets. Enables the peer-to-peer agent patterns from Chapter 12. |
| **Workflow** | `WorkflowTool` | R/W | `WORKFLOW_SCRIPTS` | Execute predefined workflow scripts — multi-step automation sequences defined in configuration files. |
| **VerifyPlanExecution** | `VerifyPlanExecutionTool` | R | `CLAUDE_CODE_VERIFY_PLAN` | Verify that executed changes match the plan created in Plan Mode. A safety net for plan-then-execute workflows. |

### 1.9 Tool Availability by Operating Mode

Not all tools are available in all modes. Claude Code's tool filtering pipeline applies mode-specific rules:

```
Normal Mode:          All 50+ tools available
├── Simple Mode:      BashTool, FileReadTool, FileEditTool only
├── REPL Mode:        REPLTool (wraps Bash/Read/Edit internally)
├── Plan Mode:        Read-only tools only (Read, Glob, Grep, WebFetch, Agent, etc.)
├── Coordinator Mode: AgentTool, TaskStop, SendMessage (+ Task tools if TODOS_V2)
└── Worker Subagent:  Bash, Read, Edit, Write, WebFetch, WebSearch, Agent, Skill, Brief
```

**Coordinator Mode** is particularly important for multi-CLI systems. When an agent operates as a coordinator (via the `COORDINATOR_MODE` flag), it loses access to file-manipulation and execution tools. It can only spawn agents, manage tasks, and send messages. This enforces the separation of concerns described in Chapter 5 — coordinators plan, workers execute.

### 1.10 Summary: Tools by Category

| Category | Count | Always Loaded | Deferred | Feature-Gated |
|----------|-------|---------------|----------|----------------|
| File Operations | 6 | 4 (Read, Edit, Write, NotebookEdit) | 2 (Glob, Grep*) | 0 |
| Execution | 3 | 2 (Bash, PowerShell) | 0 | 1 (REPL) |
| Agent/Task | 9 | 2 (Agent, TaskStop) | 5 (Task tools) | 7 (TODOS_V2, AGENT_SWARMS) |
| Web/Search | 3 | 3 | 0 | 0 |
| MCP | 4 | 1 (MCPTool) | 2 | 0 (config-gated) |
| Planning/Modes | 4 | 4 | 0 | 0 |
| Code Intelligence | 2 | 1 (Skill) | 1 (LSP) | 1 (LSP) |
| Advanced | 15+ | 3 (Brief, AskQuestion, SendMessage) | 8+ | 12+ |
| **Total** | **50+** | **~20** | **~18** | **~21** |

---

## Section 2: Slash Command Reference

Slash commands are user-facing entry points — typed at the Claude Code prompt with a `/` prefix. Unlike tools (which are invoked by the AI model), commands are invoked by the human operator. They configure sessions, trigger workflows, manage the agent lifecycle, and access features that do not fit the tool paradigm.

Claude Code ships with 89+ slash commands, organized here by functional category. For each command, the table lists the command name, a description, any required feature flag, and which CLI mode benefits most from the command.

### 2.1 Session and State Management

These commands control the session lifecycle — starting, stopping, resuming, exporting, and compacting conversations.

| Command | Description | Feature Flag | Best For |
|---------|-------------|--------------|----------|
| `/session` | View current session info — ID, duration, token usage, cost | None | All |
| `/resume` | Resume a previous session by ID or pick from recent list | None | Interactive |
| `/compact` | Compact session context — summarize old turns to reclaim tokens | None | All |
| `/clear` | Clear the entire conversation and start fresh | None | Interactive |
| `/exit` | Exit the Claude Code session gracefully | None | Interactive |
| `/export` | Export the session transcript as markdown or JSON | None | All |
| `/share` | Generate a shareable URL for the current session | None | Interactive |
| `/cost` | Show cumulative API cost for the current session | None | All |
| `/stats` | Show session statistics — turns, tokens, tool calls, duration | None | All |

### 2.2 Model and Configuration

Commands that change how Claude Code behaves — model selection, inference parameters, output formatting, and permissions.

| Command | Description | Feature Flag | Best For |
|---------|-------------|--------------|----------|
| `/model` | Switch the AI model (e.g., `claude-sonnet-4-20250514`, `claude-3.5-haiku`) | None | All |
| `/config` | Open the Claude Code configuration editor | None | Interactive |
| `/effort` | Set inference effort level (low, medium, high) — trades speed for quality | None | All |
| `/fast` | Toggle fast mode — aggressive token reduction, shorter responses | None | All |
| `/output-style` | Set output rendering style (markdown, plain, JSON) | None | All |
| `/theme` | Set the UI color theme | None | Interactive |
| `/color` | Enable or disable ANSI color output | None | Headless |
| `/permissions` | View and configure permission rules — allow/deny patterns for tools | None | All |

### 2.3 Git and Code Review

Commands that integrate with Git workflows — committing, branching, diffing, and reviewing code changes.

| Command | Description | Feature Flag | Best For |
|---------|-------------|--------------|----------|
| `/commit` | Create a git commit with an AI-generated commit message | None | All |
| `/commit-push-pr` | One-shot: commit, push, and create a pull request | None | Interactive |
| `/branch` | Show the current branch or switch to a different one | None | All |
| `/diff` | Show git diff with optional AI analysis of the changes | None | All |
| `/review` | Start an interactive code review of staged or unstaged changes | None | Interactive |
| `/pr_comments` | Generate pull request review comments in GitHub-compatible format | None | Headless |
| `/rewind` | Time-travel to an earlier file state using git history | None | Interactive |

### 2.4 Code Quality and Debugging

Commands that analyze code for bugs, security issues, and performance problems.

| Command | Description | Feature Flag | Best For |
|---------|-------------|--------------|----------|
| `/autofix-pr` | Automatically fix PR feedback — reads review comments and applies fixes | None | Headless |
| `/bughunter` | Deep search for bugs using static analysis and AI reasoning | None | Interactive |
| `/security-review` | Run a security audit against OWASP/CWE checklists | None | All |
| `/perf-issue` | Analyze performance issues — profile, identify bottlenecks, suggest fixes | None | Interactive |
| `/doctor` | Diagnose project health — check dependencies, configs, common issues | None | Interactive |

### 2.5 Memory and Context

Commands for managing what Claude Code remembers — both within a session (context) and across sessions (memory).

| Command | Description | Feature Flag | Best For |
|---------|-------------|--------------|----------|
| `/context` | View or edit the context sent to the API on each turn | None | All |
| `/memory` | View or edit persistent workspace memory (`CLAUDE.md` and related files) | None | All |
| `/ctx_viz` | Visualize context allocation — see how tokens are distributed across sources | None | Interactive |
| `/thinkback` | Record a thinking session — structured reasoning captured for later replay | None | Interactive |
| `/thinkback-play` | Replay a previously recorded thinking session | None | Interactive |

### 2.6 Multi-Agent and Coordination

Commands for managing agents, tasks, and multi-agent workflows.

| Command | Description | Feature Flag | Best For |
|---------|-------------|--------------|----------|
| `/agents` | List and manage running agents — view status, cancel, inspect output | None | All |
| `/tasks` | View and manage the task board — list, filter, update task status | `TODOS_V2` | All |
| `/good-claude` | Summon the "good Claude" agent — a preconfigured high-quality agent profile | None | Interactive |
| `/btw` | Shorthand agent invocation — spawn a quick sub-agent for a side task | None | Interactive |

### 2.7 Development and Setup

Commands for initializing projects, managing dependencies, and maintaining the Claude Code installation.

| Command | Description | Feature Flag | Best For |
|---------|-------------|--------------|----------|
| `/init` | Initialize a new Claude Code project — create `.claude/` directory, `CLAUDE.md`, and default configuration | None | Interactive |
| `/install` | Install project dependencies (auto-detects package manager) | None | All |
| `/upgrade` | Upgrade Claude Code to the latest version | None | Interactive |
| `/version` | Show the current Claude Code version and build info | None | All |
| `/env` | View or set environment variables for the current session | None | All |
| `/debug-tool-call` | Debug a specific tool call — replay it with verbose logging | None | Interactive |
| `/break-cache` | Clear the API response cache — force fresh responses | None | All |

### 2.8 Integration and Extensibility

Commands for connecting Claude Code with external tools, plugins, and services.

| Command | Description | Feature Flag | Best For |
|---------|-------------|--------------|----------|
| `/mcp` | Manage MCP server connections — add, remove, restart, inspect | None | All |
| `/plugin` | Install or manage plugins — community extensions for Claude Code | None | Interactive |
| `/reload-plugins` | Reload all installed plugins without restarting the session | None | Interactive |
| `/hooks` | Configure lifecycle hooks — pre/post tool execution, session events | None | All |
| `/skills` | Discover and manage learned skills in `.claude/skills/` | None | All |
| `/stickers` | Insert stickers or emoji reactions into the conversation | None | Interactive |
| `/teleport` | Connect to a remote Claude Code session — pair programming over the network | None | Interactive |

### 2.9 Remote and Authentication

Commands for managing authentication and remote connectivity.

| Command | Description | Feature Flag | Best For |
|---------|-------------|--------------|----------|
| `/remote-setup` | Configure remote connection settings — SSH tunnels, proxy settings | None | Interactive |
| `/bridge` | Connect a bridge to the desktop app — link terminal and GUI | None | Interactive |
| `/login` | Authenticate with Anthropic — API key or OAuth flow | None | All |
| `/logout` | Revoke authentication and clear stored credentials | None | All |
| `/oauth-refresh` | Manually refresh an expired OAuth token | None | All |

### 2.10 Advanced Planning

Commands for structured reasoning and session summarization.

| Command | Description | Feature Flag | Best For |
|---------|-------------|--------------|----------|
| `/plan` | Enter Plan Mode — read-only exploration before committing to changes | None | All |
| `/ultraplan` | Extended planning mode — deep multi-step analysis with explicit reasoning chains | None | Interactive |
| `/summary` | Generate a structured summary of the current session — decisions, changes, outcomes | None | All |
| `/insights` | Extract key insights from the session — patterns, learnings, recommendations | None | Interactive |

### 2.11 Additional Commands

The remaining commands serve miscellaneous functions — from GitHub integration to UI modes.

| Command | Description | Feature Flag | Best For |
|---------|-------------|--------------|----------|
| `/issue` | Create a GitHub issue from the current context | None | All |
| `/release-notes` | Generate release notes from recent git history | None | Headless |
| `/add-dir` | Add a directory to the session context | None | All |
| `/copy` | Copy the last response or a specific item to the clipboard | None | Interactive |
| `/desktop` | Toggle desktop/IDE integration features | None | IDE |
| `/feedback` | Send feedback to Anthropic about the current session | None | Interactive |
| `/help` | Show help — list all available commands and their descriptions | None | All |
| `/ide` | Enter IDE mode — optimized for VS Code extension integration | None | IDE |
| `/install-github-app` | Set up the GitHub OAuth app for repository access | None | Interactive |
| `/install-slack-app` | Set up Slack integration for notifications and agent control | None | Interactive |
| `/knowledge` | Search the knowledge base — project docs, memory, and learned patterns | None | All |
| `/mobile` | Mobile app controls — optimized for small-screen interaction | None | Interactive |
| `/onboarding` | Run the onboarding wizard — guided setup for new users | None | Interactive |
| `/passes` | Show token pass information — subscription tier and usage | None | All |
| `/privacy-settings` | Manage privacy options — telemetry, data retention, logging | None | All |
| `/rate-limit-options` | View current rate limits and available tiers | None | All |
| `/rename` | Rename a function, variable, or symbol across the codebase using LSP | None | IDE |
| `/resetLimits` | Reset API rate limits (if available for your tier) | None | All |
| `/sandbox-toggle` | Toggle sandboxed execution — isolate tool calls in containers | None | All |
| `/subscribepr` | Subscribe to PR webhook notifications for a repository | None | Headless |
| `/ultrareview` | Extended code review — deep analysis with multi-pass review strategy | None | Interactive |
| `/usage` | Show detailed API usage statistics — tokens, cost, model breakdown | None | All |
| `/vim` | Toggle Vim keybindings in the Claude Code prompt | None | Interactive |
| `/voice` | Toggle voice mode — speech-to-text input and text-to-speech output | None | Interactive |
| `/backfill-sessions` | Backfill session history from API logs | None | All |

---

## Section 3: Building Custom Tools

The real power of Claude Code's tool system is not the fifty tools it ships with — it is the interface that lets you build your own. Every tool, from the simple `Read` to the complex `Agent`, implements the same `Tool` interface. By implementing this interface, you can create tools that:

- Appear in Claude's tool palette alongside built-in tools
- Participate in the permission system (auto-classified as safe or dangerous)
- Support parallel execution (or enforce serialization)
- Render custom UI in the terminal and IDE
- Are discoverable via ToolSearch (with deferred loading)
- Integrate with the hook system (pre/post execution events)

### 3.1 The Complete Tool Interface

The `Tool` interface is defined in `Tool.ts` (lines 362–470 of the Claude Code source). Here is the complete TypeScript definition with annotations:

```typescript
export interface Tool<
  Input = unknown,
  Output = unknown, 
  Progress = unknown
> {
  // ═══════════════════════════════════════════════════════
  // IDENTITY — Who is this tool?
  // ═══════════════════════════════════════════════════════
  
  /** Unique identifier. Convention: PascalCase (e.g., "MyCustomTool") */
  name: string
  
  /** Alternate names for tool lookup (e.g., ["search", "find"]) */
  aliases?: string[]
  
  /** Logical grouping (e.g., "File", "Execution", "Custom") */
  category: string
  
  /** 
   * Dynamic description sent to the model. Can change based on input
   * and context — e.g., include the current working directory.
   */
  description(
    input: Partial<Input>,
    options: { cwd: string; verbose: boolean }
  ): Promise<string>
  
  // ═══════════════════════════════════════════════════════
  // SCHEMA — What does this tool accept and return?
  // ═══════════════════════════════════════════════════════
  
  /** Zod schema for input validation. Defines parameters the model can pass. */
  inputSchema: ZodSchema<Input>
  
  /** Optional Zod schema for output. Used for type checking, not enforcement. */
  outputSchema?: ZodSchema<Output>
  
  // ═══════════════════════════════════════════════════════
  // EXECUTION — How does this tool run?
  // ═══════════════════════════════════════════════════════
  
  /** 
   * Main execution method. This is where the tool does its work.
   * @param args - Validated input matching inputSchema
   * @param context - Session context (cwd, env, permissions, etc.)
   * @param canUseTool - Permission checker for nested tool calls
   * @param parentMessage - The message that triggered this tool call
   * @param onProgress - Callback for streaming progress updates
   * @returns ToolResult with output data and metadata
   */
  call(
    args: Input,
    context: ToolUseContext,
    canUseTool: CanUseToolFn,
    parentMessage: Message,
    onProgress: (progress: Progress) => void
  ): Promise<ToolResult<Output>>
  
  // ═══════════════════════════════════════════════════════
  // BEHAVIOR CLASSIFICATION — How should the system treat this tool?
  // ═══════════════════════════════════════════════════════
  
  /** Can this tool run in parallel with other tools? Default: false */
  isConcurrencySafe(input: Input): boolean
  
  /** Is this invocation read-only? Determines Plan Mode availability. */
  isReadOnly(input: Input): boolean
  
  /** Is this invocation destructive/irreversible? Triggers extra confirmation. */
  isDestructive?(input: Input): boolean
  
  /** Is this tool currently enabled? Checked every turn. Default: true */
  isEnabled(): boolean
  
  // ═══════════════════════════════════════════════════════
  // PERMISSIONS — Who can use this tool and when?
  // ═══════════════════════════════════════════════════════
  
  /** 
   * Pre-execution permission check. Return 'allow', 'deny', or 'ask'.
   * Can also modify the input (e.g., sanitize paths).
   */
  checkPermissions(
    input: Input,
    context: ToolPermissionContext
  ): Promise<PermissionResult>
  
  /** 
   * Convert input to a string for the AI security classifier.
   * The classifier uses this to decide if the tool call is safe.
   */
  toAutoClassifierInput(input: Input): string
  
  // ═══════════════════════════════════════════════════════
  // DISCOVERY — How is this tool found and loaded?
  // ═══════════════════════════════════════════════════════
  
  /** If true, this tool is lazy-loaded via ToolSearch. */
  shouldDefer?: boolean
  
  /** If true, this tool is always sent to the API (never deferred). */
  alwaysLoad?: boolean
  
  /** Keywords for ToolSearch matching (3–10 words). */
  searchHint?: string
  
  /** Internal flag set by the deferral system. */
  isDeferredTool?: boolean
  
  // ═══════════════════════════════════════════════════════
  // RENDERING — How does this tool appear in the UI?
  // ═══════════════════════════════════════════════════════
  
  /** Custom rendering of the tool call (before execution) */
  renderToolCall?(input: Input): string | React.ReactNode
  
  /** Render the tool use message (shown during execution) */
  renderToolUseMessage?(
    input: Input,
    options: RenderOptions
  ): React.ReactNode
  
  /** Render the tool result (shown after execution) */
  renderToolResultMessage?(
    result: ToolResult<Output>,
    progress: Progress[],
    options: RenderOptions
  ): React.ReactNode
  
  /** Render streaming progress updates */
  renderToolUseProgressMessage?(progress: Progress): React.ReactNode
  
  /** Compact one-line rendering of the tool call */
  renderToolUseCompactMessage?(input: Input): React.ReactNode
  
  /** Compact one-line rendering of the result */
  renderToolResultCompactMessage?(result: ToolResult<Output>): React.ReactNode
  
  /** Full-width rendering of the result (expanded view) */
  renderToolResultFullOutput?(result: ToolResult<Output>): React.ReactNode
  
  /** Rendered after the tool completes (e.g., follow-up actions) */
  renderAfterToolComplete?(result: ToolResult<Output>): React.ReactNode
  
  // ═══════════════════════════════════════════════════════
  // CLASSIFICATION HINTS — Help the UI organize this tool
  // ═══════════════════════════════════════════════════════
  
  /** Hint for UI collapse behavior */
  isSearchOrReadCommand?(input: Input): {
    isSearch: boolean
    isRead: boolean
    isList: boolean
  }
  
  /** Is this an "open world" tool (unpredictable output)? */
  isOpenWorld?(input: Input): boolean
  
  // ═══════════════════════════════════════════════════════
  // MCP INTEGRATION — Is this tool from an MCP server?
  // ═══════════════════════════════════════════════════════
  
  /** True if this tool wraps an MCP server tool */
  isMcp?: boolean
  
  /** True if this tool wraps a Language Server Protocol tool */
  isLsp?: boolean
  
  /** MCP server metadata */
  mcpInfo?: { serverName: string; toolName: string }
  
  // ═══════════════════════════════════════════════════════
  // LIFECYCLE — Setup and teardown
  // ═══════════════════════════════════════════════════════
  
  /** Called once when the tool is first loaded */
  initialize?(): Promise<void>
  
  /** Called when the session ends */
  cleanup?(): Promise<void>
  
  /** Results larger than this are persisted to disk instead of kept in memory */
  maxResultSizeChars: number
  
  // ═══════════════════════════════════════════════════════
  // INTERRUPT HANDLING
  // ═══════════════════════════════════════════════════════
  
  /** How to handle user interrupts during execution */
  interruptBehavior?(): 'cancel' | 'block'
  
  /** Does this tool require user interaction (blocks in headless mode)? */
  requiresUserInteraction?(): boolean
}
```

**Interface Size:** 40+ members across 8 functional groups. This is intentional — the interface is designed to be *complete* so that custom tools can participate in every system feature (permissions, rendering, discovery, concurrency) without workarounds.

### 3.2 The `buildTool` Helper

You do not need to implement all 40+ members. The `buildTool` function (defined at `Tool.ts:783`) accepts a partial definition and fills in sensible defaults:

```typescript
import { buildTool } from './Tool'
import { z } from 'zod'

const myTool = buildTool({
  // Required — you must provide these
  name: 'MyCustomTool',
  description: async () => 'Description sent to the model',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    maxResults: z.number().optional().default(10),
  }),
  call: async (args, context) => {
    // Your tool logic here
    const results = await doSomething(args.query, args.maxResults)
    return { output: results }
  },
  
  // Optional — buildTool provides these defaults:
  // isEnabled: () => true
  // isConcurrencySafe: () => false
  // isReadOnly: () => false
  // isDestructive: () => false
  // checkPermissions: () => ({ behavior: 'allow', updatedInput: input })
  // toAutoClassifierInput: () => ''
})
```

**Defaults Applied by `buildTool`:**

| Member | Default Value | Meaning |
|--------|---------------|---------|
| `isEnabled` | `() => true` | Tool is always available |
| `isConcurrencySafe` | `() => false` | Tool runs exclusively (serialized) |
| `isReadOnly` | `() => false` | Tool is treated as read-write |
| `isDestructive` | `() => false` | No extra confirmation required |
| `checkPermissions` | `() => ({ behavior: 'allow' })` | Auto-approved |
| `toAutoClassifierInput` | `() => ''` | No classifier input |
| `userFacingName` | `() => name` | Display name equals internal name |
| `maxResultSizeChars` | `100_000` | Results >100K chars written to disk |

### 3.3 Building Your First Custom Tool: A Database Query Tool

Let us build a practical custom tool — a database query tool that lets Claude Code run SQL queries against a project's SQLite database. This tool demonstrates input validation, permission checking, read-only classification, and concurrency safety.

**Step 1: Define the Input Schema**

```typescript
import { z } from 'zod'

const DatabaseQueryInputSchema = z.object({
  query: z.string().describe('The SQL query to execute'),
  database: z.string().describe('Path to the SQLite database file'),
  maxRows: z.number().optional().default(100)
    .describe('Maximum rows to return'),
})

type DatabaseQueryInput = z.infer<typeof DatabaseQueryInputSchema>
```

**Step 2: Implement the Tool**

```typescript
import { buildTool } from './Tool'
import Database from 'better-sqlite3'
import path from 'path'

export const DatabaseQueryTool = buildTool({
  name: 'DatabaseQuery',
  category: 'Data',
  aliases: ['sql', 'db-query'],
  
  description: async (_input, { cwd }) => 
    `Execute SQL queries against SQLite databases in ${cwd}. ` +
    `Use for data exploration, schema inspection, and ad-hoc queries.`,
  
  inputSchema: DatabaseQueryInputSchema,
  
  // Read-only if the query is a SELECT, PRAGMA, or EXPLAIN
  isReadOnly: (input) => {
    const normalized = input.query.trim().toUpperCase()
    return (
      normalized.startsWith('SELECT') ||
      normalized.startsWith('PRAGMA') ||
      normalized.startsWith('EXPLAIN')
    )
  },
  
  // Safe to run in parallel — SQLite handles concurrent reads
  isConcurrencySafe: (input) => {
    const normalized = input.query.trim().toUpperCase()
    return normalized.startsWith('SELECT')
  },
  
  // Destructive if it drops or truncates
  isDestructive: (input) => {
    const normalized = input.query.trim().toUpperCase()
    return (
      normalized.startsWith('DROP') ||
      normalized.startsWith('TRUNCATE') ||
      normalized.includes('DELETE FROM')
    )
  },
  
  // Permission check: ensure database path is within project
  checkPermissions: async (input, ctx) => {
    const dbPath = path.resolve(ctx.cwd, input.database)
    if (!dbPath.startsWith(ctx.cwd)) {
      return {
        behavior: 'deny',
        message: `Database path ${dbPath} is outside the project directory`,
      }
    }
    return { behavior: 'allow', updatedInput: input }
  },
  
  // Classifier input for the AI security system
  toAutoClassifierInput: (input) => 
    `SQL query: ${input.query} on database: ${input.database}`,
  
  // Main execution
  call: async (args, context) => {
    const dbPath = path.resolve(context.cwd, args.database)
    const db = new Database(dbPath, { readonly: true })
    
    try {
      const stmt = db.prepare(args.query)
      
      if (stmt.reader) {
        // SELECT query — return rows
        const rows = stmt.all().slice(0, args.maxRows)
        return {
          output: {
            rows,
            rowCount: rows.length,
            truncated: rows.length === args.maxRows,
          },
        }
      } else {
        // Write query — execute and return changes
        const result = stmt.run()
        return {
          output: {
            changes: result.changes,
            lastInsertRowid: result.lastInsertRowid,
          },
        }
      }
    } finally {
      db.close()
    }
  },
  
  // ToolSearch keywords for deferred discovery
  searchHint: 'SQL database query SQLite data',
  shouldDefer: true,
})
```

**Step 3: Register the Tool**

Add your tool to the tool registry in `tools.ts`:

```typescript
import { DatabaseQueryTool } from './tools/DatabaseQueryTool'

export function getAllBaseTools(): Tool[] {
  return [
    // ... existing tools ...
    DatabaseQueryTool,
  ]
}
```

**Step 4: Test the Tool**

Create a test that validates input schema, permission checking, and execution:

```typescript
import { describe, it, expect } from 'vitest'
import { DatabaseQueryTool } from './tools/DatabaseQueryTool'

describe('DatabaseQueryTool', () => {
  it('classifies SELECT as read-only', () => {
    expect(DatabaseQueryTool.isReadOnly({ 
      query: 'SELECT * FROM users', database: 'test.db' 
    })).toBe(true)
  })
  
  it('classifies DROP as destructive', () => {
    expect(DatabaseQueryTool.isDestructive?.({ 
      query: 'DROP TABLE users', database: 'test.db' 
    })).toBe(true)
  })
  
  it('denies access outside project directory', async () => {
    const result = await DatabaseQueryTool.checkPermissions(
      { query: 'SELECT 1', database: '/etc/passwd' },
      { cwd: '/home/user/project' } as any
    )
    expect(result.behavior).toBe('deny')
  })
})
```

### 3.4 Custom Tool Checklist

Before shipping a custom tool, verify each of these:

| Check | Why It Matters |
|-------|----------------|
| ✅ `isReadOnly` accurately reflects the operation | Incorrect classification breaks Plan Mode safety |
| ✅ `isConcurrencySafe` is conservative (false if unsure) | Incorrect classification causes race conditions |
| ✅ `isDestructive` flags irreversible operations | Missing this skips the extra confirmation step |
| ✅ `checkPermissions` validates all paths and inputs | Missing this allows path traversal and injection |
| ✅ `toAutoClassifierInput` provides meaningful context | Poor input means the AI classifier cannot assess safety |
| ✅ `inputSchema` uses `.describe()` on every field | Missing descriptions mean the model guesses parameter usage |
| ✅ `searchHint` is 3–10 descriptive words | Poor hints mean ToolSearch cannot find your deferred tool |
| ✅ `maxResultSizeChars` is set for large-output tools | Missing this bloats memory with large results |
| ✅ Error handling returns structured error messages | Unhandled exceptions crash the tool execution pipeline |
| ✅ Cleanup logic in `finally` blocks | Resource leaks (open files, connections) accumulate across calls |

---

## Feature Flag Quick Reference

For convenience, here is a consolidated list of every feature flag that gates a tool or command:

| Feature Flag | Gated Tools/Commands | Purpose |
|--------------|---------------------|---------|
| `TODOS_V2` | TaskCreate, TaskGet, TaskList, TaskUpdate, TaskOutput, TodoWrite, `/tasks` | Structured task management |
| `AGENT_SWARMS` | TeamCreate, TeamDelete | Multi-agent team workspaces |
| `AGENT_TRIGGERS` | CronCreate, CronDelete, CronList | Scheduled agent execution |
| `AGENT_TRIGGERS_REMOTE` | RemoteTrigger | Event-driven agent activation |
| `COORDINATOR_MODE` | Changes tool filtering (coordinator-only tools) | Enforces coordinator/worker separation |
| `FORK_SUBAGENT` | Async agent spawning in AgentTool | Parallel agent execution |
| `ENABLE_LSP_TOOL` | LSPTool | Language server integration |
| `WEB_BROWSER_TOOL` | WebBrowserTool | Full browser automation |
| `MONITOR_TOOL` | MonitorTool | Resource monitoring |
| `PROACTIVE` / `KAIROS` | SleepTool | Autonomous/proactive agent mode |
| `HISTORY_SNIP` | SnipTool | Conversation history editing |
| `UDS_INBOX` | ListPeersTool | Peer-to-peer agent communication |
| `WORKFLOW_SCRIPTS` | WorkflowTool | Predefined workflow execution |
| `TERMINAL_PANEL` | TerminalCaptureTool | Terminal output capture |
| `CONTEXT_COLLAPSE` | CtxInspectTool | Context inspection and collapse |
| `CLAUDE_CODE_VERIFY_PLAN` | VerifyPlanExecutionTool | Plan verification |
| `TRANSCRIPT_CLASSIFIER` | AI classifier for tool outputs | Security classification |
| `BASH_CLASSIFIER` | Bash command intent analysis | Bash permission classification |
| `AUTO_CLASSIFIER` | Automatic permission classification | AI-driven permission decisions |
| `REACTIVE_COMPACT` | Context compaction strategy | Smart context management |
| `EXTRACT_MEMORIES` | Auto-extract session memories | Automatic memory capture |

---

## Closing Note

This appendix is a snapshot. Claude Code is under active development, and new tools and commands appear with each release. The interface, however, is stable — the `Tool` protocol documented in Section 3 has remained backward-compatible across major versions, and tools built against it today will work tomorrow.

When in doubt, consult the source. The canonical locations are:

- **Tool interface**: `src/Tool.ts` (lines 362–470)
- **Tool registry**: `src/tools.ts`
- **Command implementations**: `src/commands/` (89+ directories)
- **Feature flags**: `src/constants/features.ts`
- **Permission system**: `src/utils/permissions/`

The tools are the atoms. The commands are the controls. The interface is the contract. Now go build something the original designers never imagined.

---

*Next: Appendix D — Configuration Reference*

