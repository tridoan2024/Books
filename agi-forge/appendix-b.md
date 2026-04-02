# Appendix B: Complete Feature Flag Reference

---

*This appendix provides a comprehensive reference for all 88 compile-time feature flags in Claude Code, as mined from the source code in early 2026. For the narrative explanation of how these flags work and why they matter, see Chapter 3. This appendix is designed to be a lookup table --- something you keep open in a second terminal while building multi-CLI systems.*

*Feature flags are evaluated at compile time via Bun's `feature()` function. Flags set to `false` during the public build trigger dead-code elimination --- the gated code is physically removed from the binary. To access gated features, you need either an internal build or the source. Runtime gates (GrowthBook `tengu_*` flags) provide a second layer of rollout control even when compile-time flags are enabled.*

---

## B.1 How to Read This Reference

Each entry follows this format:

| Field | Meaning |
|-------|---------|
| **Flag** | The compile-time flag name passed to `feature()` |
| **Category** | Functional grouping: Agent, Memory, Tool, UI, Infrastructure, Debug, Internal |
| **Status** | `shipped` (in public build), `beta` (available but gated), `internal` (ANT-only), `unreleased` (code exists but disabled) |
| **What It Enables** | Brief description of functionality |
| **Runtime Gate** | GrowthBook `tengu_*` flag that provides secondary gating, if any |
| **Multi-CLI Relevance** | `HIGH` = foundational for multi-agent systems, `MEDIUM` = useful extension, `LOW` = peripheral benefit, `NONE` = irrelevant to multi-CLI |
| **How to Enable** | Build flag configuration or environment variable |

Multi-CLI Relevance ratings reflect how important each flag is specifically for building the multi-agent architectures described in this book. A flag rated NONE might still be highly valuable for single-agent use cases.

---

## B.2 Agent & Orchestration Flags (12 Flags)

These flags control agent spawning, coordination, verification, and skill management --- the core machinery of multi-CLI systems.

### COORDINATOR_MODE

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | Transforms Claude Code into a specialized orchestrator with a restricted tool set (AgentTool, TaskStop, SendMessage, SyntheticOutput, TeamCreate, TeamDelete). The coordinator cannot read files, write code, or run bash --- it can only manage other agents. Workers report back via structured `<task-notification>` XML. Supports simple mode (`CLAUDE_CODE_SIMPLE`) where workers get only bash, file read, and file edit. |
| **Runtime Gate** | None (env var controlled) |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | `CLAUDE_CODE_COORDINATOR_MODE=true` environment variable. Requires internal build with flag enabled. |

### FORK_SUBAGENT

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | The `/fork` command. Forks the current conversation into an independent subagent with restricted tools. Supports two isolation modes: `"worktree"` (local git worktree isolation) and `"remote"` (CCR cloud isolation, ANT-only). The forked agent inherits conversation context but operates independently from that point forward. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `FORK_SUBAGENT=true` in build configuration. |

### VERIFICATION_AGENT

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Beta |
| **What It Enables** | Automatic verification after code changes. When enabled, Claude Code spawns a verification subagent that independently checks whether the changes actually achieve the stated goal. This is a separate agent with its own context window --- it reviews the diff, runs relevant tests, and reports confidence back to the primary agent. |
| **Runtime Gate** | GrowthBook rollout |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag. Being rolled out via GrowthBook to Pro subscribers. |

### BUILTIN_EXPLORE_PLAN_AGENTS

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Shipped |
| **What It Enables** | The built-in `explore` and `plan` subagent types that Claude Code uses for codebase exploration and task planning. These are the lightweight Haiku-powered agents that handle grep, glob, and view operations without consuming the main agent's context window. |
| **Runtime Gate** | Shipped (no gate) |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Enabled in public builds. No action needed. |

### SKILL_IMPROVEMENT

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Unreleased |
| **What It Enables** | Auto-tuning of skill prompts based on execution outcomes. When a skill (defined in `.claude/skills/`) is used, the system tracks success/failure metrics and iteratively refines the skill prompt to improve reliability. This is meta-learning at the prompt engineering level. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `SKILL_IMPROVEMENT=true`. |

### AGENT_MEMORY_SNAPSHOT

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | Captures a memory snapshot of agent state at key lifecycle points. Used for debugging agent behavior and replaying decision paths. Snapshots include context window contents, tool call history, and intermediate reasoning. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `AGENT_MEMORY_SNAPSHOT=true`. |

### AGENT_TRIGGERS

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Unreleased |
| **What It Enables** | Event-driven agent activation. Agents can register triggers (file changes, git events, time-based) that automatically spawn agent sessions without user input. Local triggers only. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `AGENT_TRIGGERS=true`. |

### AGENT_TRIGGERS_REMOTE

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Unreleased |
| **What It Enables** | Extension of AGENT_TRIGGERS to remote event sources --- GitHub webhooks, CI/CD pipeline events, monitoring alerts. Requires AGENT_TRIGGERS as a prerequisite. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flags `AGENT_TRIGGERS=true` and `AGENT_TRIGGERS_REMOTE=true`. |

### MONITOR_TOOL

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | A dedicated monitoring tool that agents can use to observe system state --- process health, resource utilization, active sessions, and error rates. Designed for the orchestrator role in multi-agent systems. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `MONITOR_TOOL=true`. |

### TOKEN_BUDGET

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Beta |
| **What It Enables** | Per-task token budget enforcement. When spawning subagents, the parent can set a token ceiling. The subagent receives a budget allocation and must complete its work within that allocation or report back for more. Prevents runaway token consumption in multi-agent workflows. |
| **Runtime Gate** | Requires `task-budgets-2026-03-13` beta header |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag plus beta API header registration. |

### EXPERIMENTAL_SKILL_SEARCH

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Unreleased |
| **What It Enables** | Semantic search across all registered skills. Instead of explicitly invoking a skill by name, the agent can describe what it needs and the system finds the best matching skill. Uses embedding-based similarity. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `EXPERIMENTAL_SKILL_SEARCH=true`. |

### RUN_SKILL_GENERATOR

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | Automatic generation of skill definitions from observed usage patterns. When the agent repeatedly performs a similar multi-step operation, the skill generator proposes a reusable skill definition. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `RUN_SKILL_GENERATOR=true`. |

---

## B.3 KAIROS Family (6 Flags)

The KAIROS family enables proactive, scheduled, and autonomous agent behavior. These flags collectively transform Claude Code from a reactive tool into a proactive agent.

### KAIROS

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | Core assistant mode --- scheduled/cron-based autonomous execution. The agent monitors its environment and takes initiative without user prompting. Activates the assistant module (`assistant/index.js`) and gate system (`assistant/gate.js`). Foundation for all other KAIROS features. |
| **Runtime Gate** | Internal GrowthBook gates |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `KAIROS=true`. Requires internal build. |

### KAIROS_BRIEF

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | Automated context briefings via the BriefTool. Generates session-start summaries of codebase changes, merged PRs, CI/CD status, and unread messages. Refreshes every 5 minutes (`KAIROS_BRIEF_REFRESH_MS = 5 * 60 * 1000`). Can be enabled independently of full KAIROS. |
| **Runtime Gate** | None (uses `isBriefEnabled()` which checks either KAIROS or KAIROS_BRIEF) |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `KAIROS_BRIEF=true`. |

### KAIROS_CHANNELS

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | Inbound message channels via MCP servers. External services (Slack, GitHub, monitoring) can push messages into a Claude Code session. Seven-layer gating system: capability → runtime → auth → policy → session → marketplace → allowlist. Messages arrive as `notifications/claude/channel` with structured metadata. |
| **Runtime Gate** | `tengu_harbor` |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `KAIROS_CHANNELS=true`. Runtime: `tengu_harbor` must be enabled. |

### KAIROS_DREAM

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Status** | Internal |
| **What It Enables** | Autonomous memory consolidation via the DreamTask. Runs a four-stage pipeline (orient → gather → consolidate → prune) that reviews recent sessions, extracts key information, and updates MEMORY.md. Caps memory at 200 lines / 25KB. Tracks files touched, manages abort controllers, records prior mtime for rollback safety. |
| **Runtime Gate** | Internal GrowthBook gates |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `KAIROS_DREAM=true`. |

### KAIROS_GITHUB_WEBHOOKS

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | The `/subscribe-pr` command for subscribing to GitHub PR events --- review comments, CI results, status changes. Sessions can react automatically to PR events. Known limitation: does not receive `mergeable_state` changes; conflict detection requires polling via `gh pr view`. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `KAIROS_GITHUB_WEBHOOKS=true`. |

### KAIROS_PUSH_NOTIFICATION

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Unreleased |
| **What It Enables** | Outbound push notifications to user devices. Completes the proactive agent loop: receive events (CHANNELS), process them (KAIROS), and alert the user (PUSH_NOTIFICATION) when action is needed. |
| **Runtime Gate** | Tied to KAIROS assistant mode |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `KAIROS_PUSH_NOTIFICATION=true`. |

---

## B.4 Bridge & Remote Flags (9 Flags)

These flags enable remote execution, cloud sessions, and the transport layer for distributed multi-CLI architectures.

### BRIDGE_MODE

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Remote terminal session control. WebSocket-based transport with polling fallback, JWT authentication, session lifecycle management. Unlocks 32 parallel CCR sessions (`tengu_ccr_bridge_multi_session`). Environment-less operation via `tengu_bridge_repl_v2`. Source: `bridge/` (33 modules, ~500KB). Backoff config: initial 2s, cap 120s, give-up 600s. |
| **Runtime Gate** | `tengu_ccr_bridge` (primary), `tengu_ccr_bridge_multi_session` (parallel), `tengu_bridge_repl_v2` (env-less) |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `BRIDGE_MODE=true`. Runtime: requires Claude AI subscription + GrowthBook gates. |

### DAEMON

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Background process supervision. Worker spawning, health monitoring, crash recovery, process pool management. Requires BRIDGE_MODE as a prerequisite. Activated via `--daemon-worker=<kind>` CLI flag. |
| **Runtime Gate** | Inherits from BRIDGE_MODE gates |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flags `DAEMON=true` and `BRIDGE_MODE=true`. CLI: `--daemon-worker=<kind>`. |

### CCR_AUTO_CONNECT

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Automatic reconnection to Claude Code Remote sessions. When a bridge connection drops, the client automatically re-establishes the session without user intervention. Critical for long-running multi-CLI operations. |
| **Runtime Gate** | Inherits from BRIDGE_MODE |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `CCR_AUTO_CONNECT=true`. |

### CCR_MIRROR

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Session mirroring between local and remote Claude Code instances. Enables real-time observation of remote agent sessions from a local terminal. |
| **Runtime Gate** | Inherits from BRIDGE_MODE |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `CCR_MIRROR=true`. |

### CCR_REMOTE_SETUP

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Remote environment provisioning for CCR sessions. Handles initial setup of the remote workspace including dependency installation, git configuration, and MCP server initialization. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `CCR_REMOTE_SETUP=true`. |

### DIRECT_CONNECT

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Direct peer-to-peer connection between Claude Code instances, bypassing the bridge relay. Lower latency for co-located agents. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `DIRECT_CONNECT=true`. |

### SSH_REMOTE

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Beta |
| **What It Enables** | SSH-based remote session management. Connect to Claude Code instances running on remote machines via SSH tunnels. Alternative to bridge-based remote for environments where WebSocket connections are restricted. |
| **Runtime Gate** | GrowthBook rollout |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `SSH_REMOTE=true`. |

### SELF_HOSTED_RUNNER

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Self-hosted runner infrastructure for executing Claude Code sessions on your own compute rather than Anthropic's cloud. Designed for enterprise environments with data residency or air-gap requirements. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `SELF_HOSTED_RUNNER=true`. |

### BYOC_ENVIRONMENT_RUNNER

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Unreleased |
| **What It Enables** | Bring Your Own Compute environment runner. Extensions to the self-hosted runner that support custom Docker images, GPU access, and specialized toolchains for domain-specific agent workloads. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `BYOC_ENVIRONMENT_RUNNER=true`. |

---

## B.5 Communication Flags (4 Flags)

These flags handle inter-process messaging, companion systems, and team communication.

### UDS_INBOX

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | Unix Domain Socket inter-process messaging. The `/peer` and `/peers` commands for discovering and communicating with other Claude Code instances on the same machine. Socket naming: `claude-swarm-${process.pid}`. Peer-to-peer messaging without a central broker. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `UDS_INBOX=true`. |

### BUDDY

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Internal |
| **What It Enables** | Procedural companion sprite system. Generates a companion from userId via Mulberry32 PRNG with rarity tiers (common → uncommon → rare → epic → legendary). Attributes include species, eyes, hats, stats (up to 99), and shiny variants. Floating bubble UI with buddy notifications. A delightful easter egg. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag `BUDDY=true`. |

### TORCH

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Unreleased |
| **What It Enables** | Unknown full scope. References in source include `RemoteAgentTask`, `teleportToRemote`, and `archiveRemoteSession`. Appears to be a remote agent hand-off system --- "passing the torch" of an active task to a remote session. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `TORCH=true`. |

### TEAMMEM

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Status** | Internal |
| **What It Enables** | Team-shared memory system. Allows multiple Claude Code instances to share a common memory space, enabling persistent team knowledge that survives individual session boundaries. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `TEAMMEM=true`. |

---

## B.6 Planning & Thinking Flags (3 Flags)

### ULTRAPLAN

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal (ANT-only) |
| **What It Enables** | Deep planning on Anthropic cloud using Opus 4.6. Allows 10--30 minute planning sessions (`ULTRAPLAN_TIMEOUT_MS = 30 * 60 * 1000`). The model for planning is configurable via `tengu_ultraplan_model` gate, defaulting to Opus 4.6. Designed for complex architectural planning that exceeds normal context window reasoning. |
| **Runtime Gate** | `tengu_ultraplan_model` |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `ULTRAPLAN=true`. Override prompt with `ULTRAPLAN_PROMPT_FILE` env var (ANT-only). |

### ULTRATHINK

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | Maximum reasoning depth mode. Pushes the model to its deepest chain-of-thought processing. Used for problems requiring extensive multi-step reasoning beyond what standard extended thinking provides. |
| **Runtime Gate** | `tengu_turtle_carbon` |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `ULTRATHINK=true`. |

### CONTEXT_COLLAPSE

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Status** | Internal |
| **What It Enables** | Intelligent context window management that collapses old conversation turns into summaries to preserve context budget for recent, relevant information. More sophisticated than simple truncation --- it identifies which historical turns contain information still relevant to the current task. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `CONTEXT_COLLAPSE=true`. |

---

## B.7 Content & Memory Flags (8 Flags)

### EXTRACT_MEMORIES

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Status** | Shipped |
| **What It Enables** | Automatic extraction of memory entries from conversations. When enabled, Claude Code identifies important facts, decisions, and patterns during conversations and stores them in MEMORY.md. This is the foundation of Claude Code's persistent memory system. |
| **Runtime Gate** | `autoMemoryEnabled` in settings |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Enabled in public builds. Controlled via `autoMemoryEnabled` setting. |

### COMPACTION_REMINDERS

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Status** | Beta |
| **What It Enables** | Intelligent reminders during context compaction. When the context window fills and compaction occurs, this flag ensures that critical reminders (active task, key constraints, important decisions) survive the compaction and are re-injected into the compressed context. |
| **Runtime Gate** | GrowthBook rollout |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag. Being rolled out to subscribers. |

### REACTIVE_COMPACT

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Status** | Internal |
| **What It Enables** | Proactive context compaction triggered by content analysis rather than token count thresholds. The system monitors conversation relevance density and triggers compaction when the signal-to-noise ratio drops below a threshold. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `REACTIVE_COMPACT=true`. |

### CACHED_MICROCOMPACT

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Status** | Internal |
| **What It Enables** | Cached micro-compaction summaries. Instead of regenerating compaction summaries each time, the system caches them and reuses across sessions that share similar context patterns. Reduces latency during compaction events. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `CACHED_MICROCOMPACT=true`. |

### AWAY_SUMMARY

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Status** | Internal |
| **What It Enables** | Generates a summary of what happened during periods of user inactivity. When the user returns after a period away, they receive a concise briefing of agent activities, completed tasks, and pending decisions. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `AWAY_SUMMARY=true`. |

### HISTORY_SNIP

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Status** | Internal |
| **What It Enables** | Intelligent conversation history editing. Allows removing or condensing specific turns from history without full recompaction. Useful for removing failed attempts or large outputs that waste context budget. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `HISTORY_SNIP=true`. |

### HISTORY_PICKER

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Internal |
| **What It Enables** | Interactive conversation history browser. Displays past sessions with search and filter capabilities, allowing users to resume previous conversations or extract information from historical sessions. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `HISTORY_PICKER=true`. |

### FILE_PERSISTENCE

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Status** | Internal |
| **What It Enables** | Persistent file state tracking across sessions. Records which files were read, modified, or created, and their states at session boundaries. Enables seamless session continuity when resuming interrupted work. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `FILE_PERSISTENCE=true`. |

---

## B.8 Tools & Browser Flags (5 Flags)

### WEB_BROWSER_TOOL

| Field | Value |
|-------|-------|
| **Category** | Tool |
| **Status** | Beta |
| **What It Enables** | Built-in browser automation tool. Provides Playwright-based browser control directly within Claude Code without requiring external MCP servers or browser-use libraries. |
| **Runtime Gate** | GrowthBook rollout |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `WEB_BROWSER_TOOL=true`. |

### MCP_RICH_OUTPUT

| Field | Value |
|-------|-------|
| **Category** | Tool |
| **Status** | Beta |
| **What It Enables** | Rich output formatting from MCP tool responses. Supports structured tables, syntax-highlighted code blocks, and embedded images in MCP tool output rather than plain text. |
| **Runtime Gate** | GrowthBook rollout |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `MCP_RICH_OUTPUT=true`. |

### MCP_SKILLS

| Field | Value |
|-------|-------|
| **Category** | Tool |
| **Status** | Internal |
| **What It Enables** | MCP-based skill registration. Allows MCP servers to register skills that appear in Claude Code's skill system alongside local `.claude/skills/` definitions. Enables distributed skill libraries shared across teams. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `MCP_SKILLS=true`. |

### CHICAGO_MCP

| Field | Value |
|-------|-------|
| **Category** | Tool |
| **Status** | Internal |
| **What It Enables** | The "Chicago" computer-use MCP system. Provides screen-level computer interaction (mouse, keyboard, screenshots) via MCP protocol. Named after the internal project codename. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `CHICAGO_MCP=true`. |

### WORKFLOW_SCRIPTS

| Field | Value |
|-------|-------|
| **Category** | Tool |
| **Status** | Internal |
| **What It Enables** | The `/workflows` command and WorkflowTool. Custom workflow execution engine with LocalWorkflowTask for defining and running automated multi-step sequences. Workflows are defined declaratively and executed with error handling and retry logic. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `WORKFLOW_SCRIPTS=true`. |

---

## B.9 UI & Experience Flags (8 Flags)

### VOICE_MODE

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Unreleased |
| **What It Enables** | Audio input/output. Hold Space to record voice input with real-time transcription. OAuth-based authentication for the voice service. Kill switch: `tengu_amber_quartz_disabled` GrowthBook flag. |
| **Runtime Gate** | `tengu_amber_quartz_disabled` (kill switch) |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `VOICE_MODE=true`. |

### AUTO_THEME

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Shipped |
| **What It Enables** | Automatic terminal theme detection and color adaptation. Claude Code detects light/dark terminal themes and adjusts its color palette accordingly. |
| **Runtime Gate** | Shipped |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Enabled in public builds. |

### STREAMLINED_OUTPUT

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Beta |
| **What It Enables** | Reduced verbosity in tool output. Suppresses intermediate tool call details and shows only final results. Useful for keeping agent output focused when many tools are being called. |
| **Runtime Gate** | GrowthBook rollout |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `STREAMLINED_OUTPUT=true`. |

### TERMINAL_PANEL

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Internal |
| **What It Enables** | Split terminal panel UI showing agent activity alongside user input. Provides a dashboard-style view of active agents, running tools, and system status. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `TERMINAL_PANEL=true`. |

### CONNECTOR_TEXT

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Internal |
| **What It Enables** | Text summarization connector. Enables the `summarize-connector-text-2026-03-13` beta header for condensed output rendering. |
| **Runtime Gate** | Requires beta header registration |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `CONNECTOR_TEXT=true`. |

### MESSAGE_ACTIONS

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Internal |
| **What It Enables** | Contextual action buttons on messages. Provides quick-action buttons (copy, retry, edit, fork) attached to individual messages in the conversation. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag `MESSAGE_ACTIONS=true`. |

### QUICK_SEARCH

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Internal |
| **What It Enables** | In-conversation search. Provides Ctrl+F style search across the current conversation history, highlighting matches and supporting regex. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag `QUICK_SEARCH=true`. |

### NATIVE_CLIPBOARD_IMAGE

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Beta |
| **What It Enables** | Native clipboard image paste support. Allows pasting screenshots and images directly from the system clipboard into Claude Code conversations. |
| **Runtime Gate** | GrowthBook rollout |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag `NATIVE_CLIPBOARD_IMAGE=true`. |

---

## B.10 Build & Infrastructure Flags (11 Flags)

### ANTI_DISTILLATION_CC

| Field | Value |
|-------|-------|
| **Category** | Internal |
| **Status** | Internal |
| **What It Enables** | Anti-distillation protections for Claude Code's system prompts. Prevents extraction of system prompt content through adversarial prompting techniques. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag `ANTI_DISTILLATION_CC=true`. |

### BASH_CLASSIFIER

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Classification of bash commands by risk level before execution. Categorizes commands as safe, needs-confirmation, or dangerous. Used to inform the permission system. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `BASH_CLASSIFIER=true`. |

### TRANSCRIPT_CLASSIFIER

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Conversation transcript classification. Enables the AFK mode beta header (`afk-mode-2026-01-31`) for auto-classifying idle sessions and determining session intent. |
| **Runtime Gate** | Enables `afk-mode-2026-01-31` beta header |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `TRANSCRIPT_CLASSIFIER=true`. |

### BREAK_CACHE_COMMAND / PROMPT_CACHE_BREAK_DETECTION

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | `BREAK_CACHE_COMMAND`: Manual prompt cache invalidation command. `PROMPT_CACHE_BREAK_DETECTION`: Automatic detection of conditions that should trigger cache invalidation (context shifts, system prompt changes). |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flags `BREAK_CACHE_COMMAND=true` and/or `PROMPT_CACHE_BREAK_DETECTION=true`. |

### TREE_SITTER_BASH / TREE_SITTER_BASH_SHADOW

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Tree-sitter based bash script parsing. `TREE_SITTER_BASH`: Full integration for bash command analysis. `TREE_SITTER_BASH_SHADOW`: Shadow mode that runs tree-sitter parsing in parallel with the existing parser for comparison testing. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flags. |

### IS_LIBC_GLIBC / IS_LIBC_MUSL

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Shipped |
| **What It Enables** | Platform-specific C library detection flags. Used to select the correct native binary dependencies (tree-sitter, etc.) for glibc-based (standard Linux) versus musl-based (Alpine, embedded) systems. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Set automatically based on build target platform. |

### POWERSHELL_AUTO_MODE

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Beta |
| **What It Enables** | Automatic PowerShell mode detection on Windows. When running in PowerShell, Claude Code adjusts its shell commands, path handling, and environment variable syntax to be PowerShell-native rather than bash-compatible. |
| **Runtime Gate** | GrowthBook rollout |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag. Auto-detected on Windows. |

### HOOK_PROMPTS

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Hook-generated prompt injection. Allows lifecycle hooks (PreToolUse, PostToolUse, etc.) to inject additional prompt content into the agent's context. Used for dynamic system prompt modification based on runtime conditions. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `HOOK_PROMPTS=true`. |

---

## B.11 Session & Settings Flags (6 Flags)

### BG_SESSIONS

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Background session management. Multiple concurrent sessions can run in the background while the user works in a foreground session. Background sessions continue processing without terminal attachment. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `BG_SESSIONS=true`. |

### UPLOAD_USER_SETTINGS / DOWNLOAD_USER_SETTINGS

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Cloud sync for user settings. `UPLOAD_USER_SETTINGS`: Push local settings to cloud. `DOWNLOAD_USER_SETTINGS`: Pull settings from cloud. Enables consistent configuration across machines and environments. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flags. |

### NEW_INIT

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Internal |
| **What It Enables** | Redesigned initialization flow for first-time setup. Streamlined onboarding experience with guided configuration. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag `NEW_INIT=true`. |

### TEMPLATES

| Field | Value |
|-------|-------|
| **Category** | UI |
| **Status** | Internal |
| **What It Enables** | Conversation templates. Pre-defined prompt templates for common workflows (code review, debugging, refactoring) that users can invoke instead of writing prompts from scratch. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `TEMPLATES=true`. |

### REVIEW_ARTIFACT

| Field | Value |
|-------|-------|
| **Category** | Tool |
| **Status** | Internal |
| **What It Enables** | Structured review artifacts. Generates formal review documents from code review sessions with severity classifications, file references, and actionable recommendations. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `REVIEW_ARTIFACT=true`. |

---

## B.12 Telemetry & Debug Flags (7 Flags)

### ABLATION_BASELINE

| Field | Value |
|-------|-------|
| **Category** | Debug |
| **Status** | Internal |
| **What It Enables** | Ablation study baseline mode. Disables specific features to measure their impact on agent performance. Used for A/B testing feature contributions. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag `ABLATION_BASELINE=true`. |

### COMMIT_ATTRIBUTION

| Field | Value |
|-------|-------|
| **Category** | Debug |
| **Status** | Internal |
| **What It Enables** | Tracks which agent made which git commits. Annotates commits with metadata identifying the specific Claude Code session, model, and context that produced the change. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `COMMIT_ATTRIBUTION=true`. |

### COWORKER_TYPE_TELEMETRY

| Field | Value |
|-------|-------|
| **Category** | Debug |
| **Status** | Internal |
| **What It Enables** | Telemetry tracking for teammate/coworker type classification. Records whether coworkers are human, AI, or mixed-mode for usage analytics. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag. |

### ENHANCED_TELEMETRY_BETA

| Field | Value |
|-------|-------|
| **Category** | Debug |
| **Status** | Internal |
| **What It Enables** | Extended telemetry collection including tool call latencies, context window utilization, compaction frequency, and model routing decisions. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `ENHANCED_TELEMETRY_BETA=true`. |

### MEMORY_SHAPE_TELEMETRY

| Field | Value |
|-------|-------|
| **Category** | Debug |
| **Status** | Internal |
| **What It Enables** | Telemetry on memory system behavior. Tracks memory extraction rates, MEMORY.md growth patterns, and dream consolidation effectiveness. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag. |

### SHOT_STATS

| Field | Value |
|-------|-------|
| **Category** | Debug |
| **Status** | Internal |
| **What It Enables** | Per-shot statistics tracking. Records detailed metrics for each model "shot" (API call) including token counts, latency, cache hit rates, and thinking depth. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `SHOT_STATS=true`. |

### SLOW_OPERATION_LOGGING

| Field | Value |
|-------|-------|
| **Category** | Debug |
| **Status** | Internal |
| **What It Enables** | Automatic logging of operations that exceed latency thresholds. Identifies performance bottlenecks in tool execution, MCP communication, and API calls. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `SLOW_OPERATION_LOGGING=true`. |

---

## B.13 Internal & Codename Flags (5 Flags)

### ALLOW_TEST_VERSIONS

| Field | Value |
|-------|-------|
| **Category** | Internal |
| **Status** | Internal |
| **What It Enables** | Access to unreleased model versions for testing. Allows selection of pre-release model checkpoints not yet available to the public. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag. ANT-only. |

### BUILDING_CLAUDE_APPS

| Field | Value |
|-------|-------|
| **Category** | Internal |
| **Status** | Internal |
| **What It Enables** | Special mode for building Claude-based applications. Modifies system prompts and tool behavior to optimize for application development workflows. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag. ANT-only. |

### DUMP_SYSTEM_PROMPT

| Field | Value |
|-------|-------|
| **Category** | Debug |
| **Status** | Internal |
| **What It Enables** | Dumps the full assembled system prompt to the console at session start. Invaluable for debugging system prompt composition, especially when multiple CLAUDE.md files, skills, hooks, and memory entries contribute to the final prompt. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **MEDIUM** |
| **How to Enable** | Compile-time flag `DUMP_SYSTEM_PROMPT=true`. |

### HARD_FAIL

| Field | Value |
|-------|-------|
| **Category** | Debug |
| **Status** | Internal |
| **What It Enables** | Converts soft errors (logged warnings, swallowed exceptions) into hard failures that crash the process. Used during development to surface silent bugs. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag `HARD_FAIL=true`. |

### LODESTONE

| Field | Value |
|-------|-------|
| **Category** | Internal |
| **Status** | Unreleased |
| **What It Enables** | Unknown internal system. The codename "Lodestone" appears in feature gate checks but the full functionality is not clearly documented in the source. Possibly related to navigation or orientation systems for agents. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **UNKNOWN** |
| **How to Enable** | Compile-time flag `LODESTONE=true`. |

---

## B.14 Miscellaneous Flags (4 Flags)

### NATIVE_CLIENT_ATTESTATION

| Field | Value |
|-------|-------|
| **Category** | Infrastructure |
| **Status** | Internal |
| **What It Enables** | Native client device attestation. Cryptographic verification that the Claude Code client is a genuine, unmodified Anthropic binary. Used for security-sensitive operations that require client trust. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag. Requires signed binary. |

### OVERFLOW_TEST_TOOL

| Field | Value |
|-------|-------|
| **Category** | Debug |
| **Status** | Internal |
| **What It Enables** | Test tool for context window overflow behavior. Generates large outputs to test compaction triggers, token budget enforcement, and graceful degradation under context pressure. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **NONE** |
| **How to Enable** | Compile-time flag. Development use only. |

### PERFETTO_TRACING

| Field | Value |
|-------|-------|
| **Category** | Debug |
| **Status** | Internal |
| **What It Enables** | Perfetto trace generation for performance profiling. Outputs Chrome-compatible trace files that can be loaded in `chrome://tracing` or Perfetto UI for detailed performance analysis of tool calls, API latency, and rendering. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **LOW** |
| **How to Enable** | Compile-time flag `PERFETTO_TRACING=true`. |

### UNATTENDED_RETRY

| Field | Value |
|-------|-------|
| **Category** | Agent |
| **Status** | Internal |
| **What It Enables** | Automatic retry of failed operations without user confirmation. When a tool call fails (network timeout, transient error), the agent automatically retries with exponential backoff instead of asking the user what to do. Essential for unattended automation. |
| **Runtime Gate** | None |
| **Multi-CLI Relevance** | **HIGH** |
| **How to Enable** | Compile-time flag `UNATTENDED_RETRY=true`. |

---

## B.15 Beta API Headers (17 Headers)

These headers are sent with API requests to enable beta capabilities on the server side. They are distinct from compile-time feature flags --- headers are request-level, while flags are build-level.

| # | Header | Capability | Date | Multi-CLI Use |
|---|--------|-----------|------|---------------|
| 1 | `claude-code-20250219` | Claude Code base protocol | 2025-02-19 | Required for all Claude Code API calls |
| 2 | `interleaved-thinking-2025-05-14` | Extended thinking interleaved with content | 2025-05-14 | All agents benefit from deeper reasoning |
| 3 | `context-1m-2025-08-07` | 1M token context window | 2025-08-07 | Research CLI holds massive context for RAG |
| 4 | `context-management-2025-06-27` | Server-side context management | 2025-06-27 | API-level context control for orchestrator |
| 5 | `structured-outputs-2025-12-15` | JSON schema enforcement | 2025-12-15 | Reliable structured data between agents |
| 6 | `web-search-2025-03-05` | Built-in web search | 2025-03-05 | Research CLI web research capability |
| 7 | `advanced-tool-use-2025-11-20` | Advanced tool use (1P: Anthropic/Foundry) | 2025-11-20 | Tool search for first-party deployments |
| 8 | `tool-search-tool-2025-10-19` | Tool search (3P: Vertex/Bedrock) | 2025-10-19 | Tool search for third-party deployments |
| 9 | `effort-2025-11-24` | Effort level control (low/medium/high/max) | 2025-11-24 | Orchestrator routes low-effort; Planner uses max |
| 10 | `task-budgets-2026-03-13` | Per-task token budgets | 2026-03-13 | Essential: control token spend per specialist |
| 11 | `prompt-caching-scope-2026-01-05` | Granular prompt cache scoping | 2026-01-05 | Optimize cache across agent sessions |
| 12 | `fast-mode-2026-02-01` | Reduced latency mode | 2026-02-01 | Lightweight CLIs (Validator, QA) trade quality for speed |
| 13 | `redact-thinking-2026-02-12` | Hide thinking from output | 2026-02-12 | Clean output for agent-to-agent communication |
| 14 | `token-efficient-tools-2026-03-28` | Compressed tool schemas | 2026-03-28 | Reduces overhead when CLIs have many tools |
| 15 | `advisor-tool-2026-03-01` | Advisor/reviewer tool | 2026-03-01 | Security CLI as advisor reviewing other agents' work |
| 16 | `afk-mode-2026-01-31` | AFK session classification | 2026-01-31 | Auto-classify idle agent sessions |
| 17 | `cli-internal-2026-02-09` | Internal CLI capabilities | 2026-02-09 | ANT-only: full internal feature access |

### Conditional Header Notes

- **`summarize-connector-text-2026-03-13`** — Only sent when `feature('CONNECTOR_TEXT')` is enabled
- **`afk-mode-2026-01-31`** — Only sent when `feature('TRANSCRIPT_CLASSIFIER')` is enabled
- **`cli-internal-2026-02-09`** — Only sent when `process.env.USER_TYPE === 'ant'`

### Provider Limitations

- **Bedrock**: Limited beta headers. Uses `extraBodyParams` instead of headers. Only supports: interleaved-thinking, context-1m, tool-search-tool (3P variant).
- **Vertex countTokens**: Only allows `claude-code-20250219` and `interleaved-thinking` headers.

---

## B.16 Model Codenames

Internal codenames found in the source code:

| Codename | What It Is | Notes |
|----------|-----------|-------|
| **FENNEC** | Previous model generation | Deprecated. Migrated to Opus via `migrations/migrateFennecToOpus.ts`. `fennec-latest` → `opus`, `fennec-latest[1m]` → `opus[1m]`, `fennec-fast-latest` → `opus[1m]` + fast mode |
| **TENGU** | Claude Code project codename | All GrowthBook runtime flags use the `tengu_*` prefix. This is the internal name for the Claude Code product itself. |
| **CHICAGO** | Computer Use MCP system | The `CHICAGO_MCP` flag gates this screen-level interaction system. |
| **LODESTONE** | Unknown internal system | Feature gate exists but purpose is undocumented. |

---

## B.17 Hidden Environment Variables

These environment variables modify Claude Code behavior without requiring source code changes. Some are ANT-only; others work in any build.

| Variable | Access | What It Does |
|----------|--------|-------------|
| `CLAUDE_INTERNAL_FC_OVERRIDES` | ANT-only | Override any runtime feature flag. JSON object format: `'{"tengu_harbor": true}'`. Bypasses remote evaluation and disk cache. Highest priority in the override hierarchy. |
| `CLAUDE_CODE_TEAMMATE_COMMAND` | Any | Custom command path for spawning teammate processes. Override the default teammate binary location. |
| `CLAUDE_CODE_AGENT_COLOR` | Any | Display color for teammate agents in multi-agent UI. Helps visually distinguish between different specialist CLIs. |
| `CLAUDE_CODE_PLAN_MODE_REQUIRED` | Any | Force plan mode for all teammate sessions. Teammates must produce a plan before executing, providing a review checkpoint. |
| `CLAUDE_CODE_COORDINATOR_MODE` | Any | Enable coordinator mode (requires compile-time flag). Activates the restricted orchestrator tool set. |
| `CLAUDE_CODE_PROACTIVE` | Any | Enable proactive mode. Agent takes initiative based on context rather than waiting for explicit instructions. |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Any | Override the model used for subagent spawning. Route subagents to cheaper/faster models while the primary agent uses the best available. |
| `CLAUDE_CODE_SIMPLE` | Any | Simple mode for coordinator workers. Restricts worker tool set to bash, file read, and file edit only. |
| `ULTRAPLAN_PROMPT_FILE` | ANT-only | Override the ultraplan prompt with a custom file path. For testing alternative planning strategies. |

---

## B.18 Quick Start: Top 10 Flags for Multi-CLI

If you're building multi-CLI agent systems and can only enable a limited set of flags, these are the ten that matter most, ranked by impact:

### 1. BRIDGE_MODE
**Why first:** Without bridge mode, multi-CLI is confined to a single machine. Bridge mode provides the WebSocket transport layer, JWT authentication, and 32-session parallelism that makes distributed agent teams possible. Everything else builds on this foundation.

### 2. COORDINATOR_MODE
**Why second:** The orchestrator pattern requires a specialized agent that manages other agents instead of doing implementation work. Coordinator mode provides exactly this --- a restricted tool set (AgentTool, TeamCreate, SendMessage) that forces the orchestrator to *delegate* rather than *execute*.

### 3. DAEMON
**Why third:** Production multi-CLI systems need process supervision. Daemon mode handles worker spawning, health monitoring, and crash recovery. Without it, you're writing your own process manager.

### 4. UDS_INBOX
**Why fourth:** Peer-to-peer messaging between Claude Code instances on the same machine. The `/peer` and `/peers` commands let agents discover and communicate with each other without a central broker. Essential for local multi-agent topologies.

### 5. TOKEN_BUDGET
**Why fifth:** Runaway token consumption is the biggest operational risk in multi-agent systems. Token budgets let the orchestrator allocate fixed token ceilings to each specialist, preventing any single agent from burning through the entire budget.

### 6. KAIROS_DREAM
**Why sixth:** Each specialist agent generates knowledge that needs to persist. KAIROS_DREAM's four-stage consolidation pipeline (orient → gather → consolidate → prune) automates what would otherwise be manual memory curation across every agent.

### 7. UNATTENDED_RETRY
**Why seventh:** Multi-CLI systems run unattended by definition. When a tool call fails (network timeout, transient API error), you need automatic retry with exponential backoff --- not a prompt asking the user what to do.

### 8. HOOK_PROMPTS
**Why eighth:** Dynamic system prompt injection via lifecycle hooks. This is how you customize each specialist's behavior at runtime --- injecting security rules for the Security CLI, coding standards for the Coder CLI, or review checklists for the QA CLI.

### 9. BG_SESSIONS
**Why ninth:** Background session management allows multiple concurrent sessions without terminal attachment. In a multi-CLI system, most agents run in the background while only the orchestrator (or a human-facing agent) occupies the foreground.

### 10. TEAMMEM
**Why tenth:** Shared team memory across Claude Code instances. Without TEAMMEM, each agent maintains isolated memory. With it, the Security CLI's vulnerability findings are immediately available to the Coder CLI, and the Research CLI's discoveries propagate to the entire team.

### Quick Enable Script

For development environments with source access, this configuration enables all ten critical multi-CLI flags:

```bash
# Build configuration for multi-CLI development
export CLAUDE_CODE_FEATURES="
  BRIDGE_MODE=true
  COORDINATOR_MODE=true
  DAEMON=true
  UDS_INBOX=true
  TOKEN_BUDGET=true
  KAIROS_DREAM=true
  UNATTENDED_RETRY=true
  HOOK_PROMPTS=true
  BG_SESSIONS=true
  TEAMMEM=true
"

# Runtime environment
export CLAUDE_CODE_COORDINATOR_MODE=true
export CLAUDE_CODE_PROACTIVE=true
export CLAUDE_CODE_SUBAGENT_MODEL=sonnet  # Use Sonnet for workers, Opus for orchestrator
```

> **Note:** These flags require an internal or source build. The public Claude Code binary has these flags resolved to `false` at compile time, and the gated code is physically removed via dead-code elimination. See Chapter 3, Section 3.1 for details on the two-layer gating system.

---

*This reference was compiled from Claude Code source analysis conducted in April 2026. Feature flags are subject to change --- some may ship publicly, others may be removed, and new ones will certainly appear. For the latest state of the feature flag system, consult the source or Anthropic's official documentation.*
