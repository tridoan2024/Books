# Appendix D: Feature Flags Reference

## 80+ Compile-Time Feature Flags

Claude Code uses Bun's `bun:bundle` compile-time feature flag system to ship multiple product SKUs from a single source tree. As discussed in Chapter 1, these are not runtime checks -- when a flag evaluates to `false` during bundling, all gated code and its transitive dependencies are tree-shaken out of the final binary. The production artifact literally does not contain the dead paths.

This appendix catalogs every known feature flag, organized by functional category. Gate types indicate how the flag resolves at build time:

| Gate Type | Resolution |
|-----------|-----------|
| **AlwaysOn** | Hard-coded `true` in all builds. The flag exists for future gating or A/B rollback |
| **AlwaysOff** | Hard-coded `false`. Code exists in source but never ships. Used for experimental features |
| **EnvVar** | Resolves from a build-time environment variable (e.g., `CLAUDE_ENABLE_MCP=1`) |
| **UserType** | Resolves based on `USER_TYPE` build variable (`ant` for Anthropic internal, `ext` for external) |
| **Percentage** | Resolves based on a rollout percentage baked into the build manifest |
| **Custom** | Resolves via a build-time function that inspects multiple conditions |

---

### Tools

Flags controlling which tools are compiled into the binary. Each gated tool includes its registration, schema, executor, and permission definitions.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `REPL_TOOL` | UserType | ant=on, ext=off | Interactive REPL tool for live code evaluation in session |
| `SUGGEST_BACKGROUND_PR_TOOL` | UserType | ant=on, ext=off | Tool that suggests creating background PRs for large changes |
| `COMPUTER_USE_TOOL` | EnvVar | off | Screen capture, mouse, and keyboard control via computer use API |
| `NOTEBOOK_EDIT_TOOL` | AlwaysOn | on | Jupyter notebook cell editing with output preservation |
| `MCP_TOOL_PROXY` | AlwaysOn | on | Dynamic tool registration from MCP servers |
| `BROWSER_TOOL` | EnvVar | off | Embedded Playwright browser automation tool |
| `FILE_SEARCH_TOOL` | AlwaysOn | on | Ripgrep-backed file content search |
| `GLOB_TOOL` | AlwaysOn | on | Fast file pattern matching with modification time sorting |
| `MULTI_EDIT_TOOL` | AlwaysOn | on | Batch string replacement across multiple files in one call |
| `TODO_WRITE_TOOL` | AlwaysOn | on | Structured task list creation and management |
| `AGENT_TOOL` | AlwaysOn | on | Subagent spawning for parallel delegated work |
| `WEB_FETCH_TOOL` | AlwaysOn | on | URL content fetching with HTML-to-markdown conversion |
| `WEB_SEARCH_TOOL` | AlwaysOn | on | Web search with result extraction and source linking |
| `IMAGE_TOOL` | EnvVar | off | Image generation via API (experimental) |
| `SQL_TOOL` | UserType | ant=on, ext=off | Direct SQL query execution against configured databases |
| `MEMORY_TOOL` | AlwaysOn | on | Read/write to persistent memory files |
| `WORKTREE_TOOL` | AlwaysOn | on | Git worktree creation and management for isolated work |

### Models

Flags controlling model selection, routing, and API behavior.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `EXTENDED_THINKING` | AlwaysOn | on | Enable extended thinking (chain-of-thought) budget on supported models |
| `INTERLEAVED_THINKING` | AlwaysOn | on | Allow thinking blocks between tool calls, not just at turn start |
| `MODEL_ROUTING` | AlwaysOn | on | Automatic model selection based on task complexity classifier |
| `FAST_MODE` | AlwaysOn | on | User-togglable mode that caps thinking budget for speed |
| `HAIKU_FALLBACK` | AlwaysOn | on | Fall back to Haiku for trivial tasks (greetings, confirmations) |
| `CUSTOM_MODEL_PROVIDER` | EnvVar | off | Support for Bedrock, Vertex, and other non-Anthropic API endpoints |
| `KAIROS` | UserType | ant=on, ext=off | Full assistant mode subsystem with persistent memory and proactive behavior |
| `MODEL_PREFERENCE_OVERRIDE` | AlwaysOn | on | Allow per-skill and per-agent model overrides via frontmatter |
| `PROMPT_CACHING` | AlwaysOn | on | Send prompt caching beta headers to reduce latency on repeated prefixes |
| `OUTPUT_TOKEN_BUDGET` | AlwaysOn | on | Allow callers to set max output token limits per request |
| `STREAMING_TOOL_USE` | AlwaysOn | on | Stream tool use deltas instead of waiting for complete blocks |

### UI

Flags controlling terminal rendering, input handling, and visual features.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `RICH_MARKDOWN` | AlwaysOn | on | Render markdown with syntax highlighting, tables, and horizontal rules |
| `DIFF_VIEW` | AlwaysOn | on | Side-by-side and unified diff rendering for file changes |
| `PROGRESS_SPINNER` | AlwaysOn | on | Animated spinners during tool execution and API calls |
| `CONTEXT_VISUALIZER` | AlwaysOn | on | `/ctx-viz` command showing token distribution across context window |
| `ANSI_TO_IMAGE` | AlwaysOn | on | Export terminal output as PNG images for sharing |
| `VIM_MODE` | AlwaysOn | on | Vi keybinding support in the prompt input |
| `THEME_SUPPORT` | AlwaysOn | on | Light/dark/custom theme switching for terminal output |
| `FILE_PICKER` | AlwaysOn | on | Interactive file selection UI with fuzzy search |
| `INLINE_IMAGES` | EnvVar | off | Render images inline in terminals that support the protocol (iTerm2, Kitty) |
| `TREE_VIEW` | AlwaysOn | on | Collapsible tree rendering for directory listings |
| `TOAST_NOTIFICATIONS` | EnvVar | off | Desktop notification toasts for long-running operations |
| `TASK_LIST_UI` | AlwaysOn | on | Visual task list with checkboxes and progress tracking |
| `MULTILINE_INPUT` | AlwaysOn | on | Shift+Enter multiline editing in the prompt |

### Permissions

Flags controlling the permission system, approval flows, and trust model.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `PERMISSION_AUTO_MODE` | AlwaysOn | on | Support `--auto` flag for unattended execution with auto-approve |
| `PERMISSION_BYPASS_MODE` | UserType | ant=on, ext=off | `--bypass` mode that skips all permission checks (internal only) |
| `PERMISSION_GLOB_RULES` | AlwaysOn | on | Glob pattern matching in allow/deny rules (e.g., `Bash(git *)`) |
| `PERMISSION_CHAIN_EVAL` | AlwaysOn | on | Deny-then-ask-then-allow evaluation chain for rule precedence |
| `EDIT_APPROVAL_MODE` | AlwaysOn | on | `--acceptEdits` mode that auto-approves file edits but prompts for bash |
| `PLAN_MODE` | AlwaysOn | on | Read-only planning mode that blocks all write operations |
| `PERMISSION_MEMORY` | AlwaysOn | on | Remember permission decisions within a session to reduce prompts |

### MCP (Model Context Protocol)

Flags controlling MCP server discovery, connection, and tool integration.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `MCP_DISCOVERY` | AlwaysOn | on | Auto-discover MCP servers from `.mcp.json` and settings |
| `MCP_STDIO_TRANSPORT` | AlwaysOn | on | Connect to MCP servers via stdio (spawn child process) |
| `MCP_SSE_TRANSPORT` | AlwaysOn | on | Connect to MCP servers via Server-Sent Events over HTTP |
| `MCP_STREAMABLE_HTTP` | AlwaysOn | on | Streamable HTTP transport for MCP (newer protocol variant) |
| `MCP_TOOL_SCHEMA_VALIDATION` | AlwaysOn | on | Validate MCP tool input/output against declared JSON schemas |
| `MCP_SAMPLING` | Percentage | 50% | Allow MCP servers to request LLM sampling through the client |
| `MCP_RESOURCE_SUBSCRIPTIONS` | EnvVar | off | Subscribe to resource change notifications from MCP servers |
| `MCP_RECONNECT` | AlwaysOn | on | Automatic reconnection with exponential backoff on transport failure |

### Compaction

Flags controlling context window management and conversation compaction.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `AUTO_COMPACTION` | AlwaysOn | on | Automatically compact conversation when context exceeds threshold |
| `SMART_COMPACTION` | AlwaysOn | on | Use the model to summarize rather than truncate during compaction |
| `COMPACTION_FOCUS_TOPIC` | AlwaysOn | on | `/compact [topic]` syntax to preserve specific topic during compaction |
| `COMPACTION_PRESERVE_SYSTEM` | AlwaysOn | on | Never compact system prompt, rules, or skill instructions |
| `COMPACTION_METRICS` | AlwaysOn | on | Track and display token savings from compaction |

### Streaming

Flags controlling response streaming, rendering, and buffering.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `STREAMING_MARKDOWN` | AlwaysOn | on | Incrementally render markdown as tokens arrive |
| `STREAMING_TOOL_DELTAS` | AlwaysOn | on | Show partial tool input as it streams (e.g., partial file edits) |
| `STREAMING_THINKING` | AlwaysOn | on | Display thinking tokens in real time during extended thinking |
| `STREAMING_BACKPRESSURE` | AlwaysOn | on | Buffer management to prevent terminal render from falling behind |
| `STREAMING_RECONNECT` | AlwaysOn | on | Resume streaming from last event ID on transient connection failure |

### Analytics & Telemetry

Flags controlling usage tracking, cost reporting, and diagnostics.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `USAGE_TRACKING` | AlwaysOn | on | Track token usage, cost, and latency per session |
| `STATS_COMMAND` | AlwaysOn | on | `/stats` command showing session and cumulative usage |
| `SENTRY_REPORTING` | Custom | on (with consent) | Error reporting to Sentry with PII scrubbing |
| `TRANSCRIPT_EXPORT` | AlwaysOn | on | `/export` command for saving conversation transcripts |
| `TRANSCRIPT_CLASSIFIER` | UserType | ant=on, ext=off | Classify transcript for AFK mode headers and engagement metrics |

### Hooks

Flags controlling the hook lifecycle system.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `HOOK_SYSTEM` | AlwaysOn | on | Enable the entire hook lifecycle (PreToolUse, PostToolUse, etc.) |
| `HOOK_PRETOOLUSE` | AlwaysOn | on | Fire hooks before tool execution with ability to block |
| `HOOK_POSTTOOLUSE` | AlwaysOn | on | Fire hooks after successful tool execution |
| `HOOK_SESSION_START` | AlwaysOn | on | Fire hooks when a new session begins |
| `HOOK_NOTIFICATION` | AlwaysOn | on | Fire hooks when notifications are emitted |
| `HOOK_STOP` | AlwaysOn | on | Fire hooks when the agent produces a final response |
| `HOOK_SUBAGENT_STOP` | AlwaysOn | on | Fire hooks when a subagent completes |
| `HOOK_USER_PROMPT` | EnvVar | off | Fire hooks before processing user input (experimental) |

### Enterprise

Flags controlling enterprise features, SSO, and organizational controls.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `MANAGED_SETTINGS` | EnvVar | off | Support for organization-managed settings that override user config |
| `SSO_AUTH` | EnvVar | off | Single sign-on authentication via OIDC/SAML |
| `AUDIT_LOG` | EnvVar | off | Structured audit log of all tool executions for compliance |
| `COORDINATOR_MODE` | UserType | ant=on, ext=off | Multi-worker orchestration for parallel task execution |
| `POLICY_ENFORCEMENT` | EnvVar | off | Organizational policy rules that cannot be overridden by users |
| `USAGE_QUOTAS` | EnvVar | off | Per-user and per-org token usage limits and alerts |

### Performance & Debug

Flags controlling profiling, debugging, and performance optimization.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `DEBUG_LOGGING` | EnvVar | off | Verbose debug logs with filterable categories |
| `TOOL_TRACE` | EnvVar | off | Trace individual tool calls with timing and input/output |
| `HEADLESS_PROFILER` | UserType | ant=on, ext=off | CPU and memory profiling for CI/CD performance monitoring |
| `DOCTOR_COMMAND` | AlwaysOn | on | `/doctor` diagnostic command for installation validation |
| `CACHE_DIAGNOSTICS` | EnvVar | off | Show prompt cache hit/miss rates and savings |
| `LATENCY_HISTOGRAM` | EnvVar | off | Track and display API latency distribution per model |

### Memory & Context

Flags controlling persistent memory, context injection, and session management.

| Flag Name | Gate Type | Default | Description |
|-----------|-----------|---------|-------------|
| `AUTO_MEMORY` | AlwaysOn | on | Automatically persist insights to `~/.claude/projects/` memory files |
| `MEMORY_SEARCH` | AlwaysOn | on | Search across memory files for relevant context injection |
| `SESSION_BRANCHING` | AlwaysOn | on | `/branch` command to fork conversation state for experimentation |
| `SESSION_REWIND` | AlwaysOn | on | `/rewind` command to roll back to earlier conversation state |
| `CONTEXT_FORK` | AlwaysOn | on | Isolated context for subagents via `context: fork` in skill/agent config |

---

## Working with Feature Flags

### Querying flags at build time

```typescript
import { feature } from 'bun:bundle';

if (feature('COMPUTER_USE_TOOL')) {
  const computerUse = require('./tools/computerUse.js');
  toolRegistry.register(computerUse);
}
```

### Adding a new flag

New flags are declared in the build manifest (`build.config.ts`) with their gate type, default value, and description. The build system validates that every `feature()` call references a declared flag -- undeclared flags fail the build.

### Flag combinations

Some flags have implicit dependencies. Enabling `COORDINATOR_MODE` without `AGENT_TOOL` produces a build that compiles but cannot dispatch work. The build manifest declares these constraints, and the CI pipeline runs a matrix of flag combinations to catch incompatibilities.

### Counting active flags

The exact count fluctuates as features move through development stages. A typical external production build has ~55 flags evaluating to `true`. An internal Anthropic build has ~70. The full manifest contains 80+ declarations, with the remainder either `AlwaysOff` experimental features or flags gated to specific percentage rollouts.
