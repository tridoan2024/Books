# Chapter 3: Hidden Powers — Unreleased Features and the 88 Switches Inside Claude Code

---

There are 88 compile-time feature flags buried in Claude Code's source. Eighty-eight switches that control everything from a procedurally-generated companion sprite to a full daemon architecture capable of running 32 parallel cloud sessions. Most Claude Code users will never know they exist. The public build strips them via dead-code elimination before the binary ships. But if you're building multi-CLI agent systems, these flags are your roadmap to where Claude Code is going --- and what it can already do when the switches are flipped.

This chapter is the treasure map. We're going to walk through every significant flag, explain what it unlocks, show you where to find it in the source, and --- most importantly --- tell you which ones matter for building the kind of multi-agent systems this book teaches.

We'll organize by impact. Tier 1 features are game-changers that fundamentally enable multi-CLI architectures. Tier 2 features are powerful additions that extend what's possible. Tier 3 is everything else --- internal tooling, telemetry knobs, and yes, a gacha-style companion pet system that Anthropic's engineers apparently built for fun.

---

## 3.1 The Feature Flag System: How 88 Switches Work

Before we dive into what the flags control, you need to understand how they work. Claude Code uses a two-layer gating system that's more sophisticated than most production feature flag implementations.

### Layer 1: Compile-Time Flags (Dead Code Elimination)

The first layer happens at build time. Claude Code imports a special function from Bun's bundler:

```typescript
import { feature } from 'bun:bundle'
```

Every gated feature wraps its code in a call to `feature()`:

```typescript
const coordinatorModule = feature('COORDINATOR_MODE')
  ? require('./coordinator/coordinatorMode.js')
  : null
```

Here's what makes this powerful: Bun's bundler evaluates `feature()` at compile time. When Anthropic builds the public release, flags like `COORDINATOR_MODE` resolve to `false`. The bundler sees `false ? require(...) : null`, eliminates the entire `require()` call, and tree-shakes any code that was only reachable through that import. The coordinator module doesn't just get disabled --- it gets *removed from the binary entirely*.

This is why you can't simply flip a flag in the shipped build. The code isn't there. It was eliminated during compilation. To access these features, you need either an internal build or the source code itself.

There's a critical pattern discipline in how these flags are used. The codebase consistently uses *positive ternary* expressions:

```typescript
// ✓ CORRECT — dead code elimination works
return feature('BRIDGE_MODE')
  ? isClaudeAISubscriber() && getFeatureValue('tengu_ccr_bridge', false)
  : false

// ✗ WRONG — string literals leak into external builds
if (!feature('BRIDGE_MODE')) return
doSomethingWith('tengu_ccr_bridge')  // This string survives tree-shaking
```

The positive ternary ensures that when a flag is false, the entire true-branch (including all string literals, imports, and references) is eliminated. The negative pattern leaves string artifacts in the bundle --- a security concern when those strings contain internal codenames.

### Layer 2: Runtime Gates (GrowthBook)

The second layer is runtime feature flags powered by GrowthBook, Anthropic's feature flagging service. Even when code survives the compile-time gate, it often checks a second gate at runtime:

```typescript
export function isUltrathinkEnabled(): boolean {
  if (!feature('ULTRATHINK')) {
    return false  // Eliminated in external builds
  }
  // Runtime gate — checked against GrowthBook server
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_turtle_carbon', true)
}
```

GrowthBook evaluates flags based on user attributes --- subscription type, organization, platform, account UUID, even the time since first token. This lets Anthropic roll features out gradually: internal employees first (USER_TYPE === 'ant'), then Pro subscribers, then Teams, then Enterprise.

The GrowthBook client maintains a sophisticated override hierarchy:

1. **Environment variable overrides** (`CLAUDE_INTERNAL_FC_OVERRIDES`) --- ANT-only, highest priority
2. **Config tab overrides** --- local config file, ANT-only
3. **Remote evaluation** --- GrowthBook server response
4. **Disk cache** --- `~/.claude.json` `cachedGrowthBookFeatures`

```typescript
// ANT-only: Override any runtime gate via environment
// CLAUDE_INTERNAL_FC_OVERRIDES='{"tengu_harbor": true}'
const raw = process.env.CLAUDE_INTERNAL_FC_OVERRIDES
// Bypasses remote eval and disk cache for specified features
```

The GrowthBook client tracks over 500 runtime feature flags with names following the `tengu_*` naming convention (Tengu being Claude Code's internal project codename). These runtime flags are the fine-grained rollout controls that sit behind the coarse compile-time gates.

### The Full Inventory

Here are all 88 compile-time feature flags, grouped by domain:

**Agent & Orchestration (12 flags):**
COORDINATOR_MODE, FORK_SUBAGENT, VERIFICATION_AGENT, BUILTIN_EXPLORE_PLAN_AGENTS, SKILL_IMPROVEMENT, AGENT_MEMORY_SNAPSHOT, AGENT_TRIGGERS, AGENT_TRIGGERS_REMOTE, MONITOR_TOOL, TOKEN_BUDGET, EXPERIMENTAL_SKILL_SEARCH, RUN_SKILL_GENERATOR

**KAIROS Family (6 flags):**
KAIROS, KAIROS_BRIEF, KAIROS_CHANNELS, KAIROS_DREAM, KAIROS_GITHUB_WEBHOOKS, KAIROS_PUSH_NOTIFICATION

**Bridge & Remote (9 flags):**
BRIDGE_MODE, DAEMON, CCR_AUTO_CONNECT, CCR_MIRROR, CCR_REMOTE_SETUP, DIRECT_CONNECT, SSH_REMOTE, SELF_HOSTED_RUNNER, BYOC_ENVIRONMENT_RUNNER

**Communication (4 flags):**
UDS_INBOX, BUDDY, TORCH, TEAMMEM

**Planning & Thinking (3 flags):**
ULTRAPLAN, ULTRATHINK, CONTEXT_COLLAPSE

**Content & Memory (8 flags):**
EXTRACT_MEMORIES, COMPACTION_REMINDERS, REACTIVE_COMPACT, CACHED_MICROCOMPACT, AWAY_SUMMARY, HISTORY_SNIP, HISTORY_PICKER, FILE_PERSISTENCE

**Tools & Browser (5 flags):**
WEB_BROWSER_TOOL, MCP_RICH_OUTPUT, MCP_SKILLS, CHICAGO_MCP, WORKFLOW_SCRIPTS

**UI & Experience (8 flags):**
VOICE_MODE, AUTO_THEME, STREAMLINED_OUTPUT, TERMINAL_PANEL, CONNECTOR_TEXT, MESSAGE_ACTIONS, QUICK_SEARCH, NATIVE_CLIPBOARD_IMAGE

**Build & Infrastructure (11 flags):**
ANTI_DISTILLATION_CC, BASH_CLASSIFIER, TRANSCRIPT_CLASSIFIER, BREAK_CACHE_COMMAND, PROMPT_CACHE_BREAK_DETECTION, TREE_SITTER_BASH, TREE_SITTER_BASH_SHADOW, IS_LIBC_GLIBC, IS_LIBC_MUSL, POWERSHELL_AUTO_MODE, HOOK_PROMPTS

**Session & Settings (6 flags):**
BG_SESSIONS, UPLOAD_USER_SETTINGS, DOWNLOAD_USER_SETTINGS, NEW_INIT, TEMPLATES, REVIEW_ARTIFACT

**Telemetry & Debug (7 flags):**
ABLATION_BASELINE, COMMIT_ATTRIBUTION, COWORKER_TYPE_TELEMETRY, ENHANCED_TELEMETRY_BETA, MEMORY_SHAPE_TELEMETRY, SHOT_STATS, SLOW_OPERATION_LOGGING

**Internal & Codenames (5 flags):**
ALLOW_TEST_VERSIONS, BUILDING_CLAUDE_APPS, DUMP_SYSTEM_PROMPT, HARD_FAIL, LODESTONE

**Misc (4 flags):**
NATIVE_CLIENT_ATTESTATION, OVERFLOW_TEST_TOOL, PERFETTO_TRACING, UNATTENDED_RETRY

Now let's go deep on the ones that matter.

---

## 3.2 TIER 1: The Game-Changers for Multi-CLI Architecture

These features are the foundation of everything this book teaches. If you're building agent teams, these are the switches that make it architecturally possible.

### BRIDGE_MODE: The Remote Control Backbone

**Flag:** `feature('BRIDGE_MODE')`
**Source:** `bridge/` (33 modules, ~500KB total)
**Runtime Gate:** `tengu_ccr_bridge` (primary), `tengu_ccr_bridge_multi_session` (parallel)
**Status:** Partially shipped, critical infrastructure

BRIDGE_MODE is the single most important unreleased feature for multi-CLI architecture. It transforms Claude Code from a local terminal tool into a remotely-controllable cloud compute engine.

The bridge directory alone contains 33 TypeScript modules totaling roughly 500KB of source. This isn't a proof of concept. It's production infrastructure. Here's what it enables:

**Remote Session Control.** A coordinator process can spawn, manage, and communicate with Claude Code sessions running on remote infrastructure. The bridge provides a WebSocket-based transport layer with polling fallback, JWT-based authentication, and session lifecycle management.

```typescript
// bridge/bridgeEnabled.ts
export function isBridgeEnabled(): boolean {
  return feature('BRIDGE_MODE')
    ? isClaudeAISubscriber() &&
        getFeatureValue_CACHED_MAY_BE_STALE('tengu_ccr_bridge', false)
    : false
}
```

**32 Parallel CCR Sessions.** The multi-session gate (`tengu_ccr_bridge_multi_session`) unlocks the ability to run up to 32 concurrent Claude Code Remote sessions. Thirty-two parallel agents, each with its own context window, its own tool set, its own memory. This is the hardware ceiling for the multi-CLI architectures we're building.

**Environment-less Operation.** The `tengu_bridge_repl_v2` gate enables sessions that don't need a local environment --- they run entirely in the cloud. No local filesystem. No local bash. Pure cloud compute with remote tool execution.

**JWT Trusted Devices.** The `bridge/trustedDevice.ts` and `bridge/jwtUtils.ts` modules implement device attestation for bridge connections. Your local machine registers as a trusted device, and subsequent connections authenticate via JWT rather than interactive login. This is essential for automated systems where no human is present to type credentials.

The bridge architecture follows a polling model with configurable backoff:

```typescript
// bridge/bridgeMain.ts
// BackoffConfig for connection resilience
const backoffConfig = {
  connInitialMs: 2000,    // Start at 2 seconds
  connCapMs: 120000,      // Cap at 2 minutes
  connGiveUpMs: 600000,   // Give up after 10 minutes
}
```

The bridge messaging layer (`bridgeMessaging.ts`) implements a protocol for forwarding user and assistant messages between local and remote sessions, with filtering for virtual messages (system-generated content that shouldn't cross the bridge boundary).

**Multi-CLI Implication:** Bridge mode is the *transport layer* for federated multi-CLI systems. When you spawn a Research CLI on remote infrastructure, it's a bridge session. When the Orchestrator sends work to a Security CLI running in a cloud sandbox, that's bridge messaging. Without bridge mode, multi-CLI is limited to local processes sharing a single machine's resources.

### DAEMON: Background Process Supervision

**Flag:** `feature('DAEMON') && feature('BRIDGE_MODE')`
**CLI Entry:** `--daemon-worker=<kind>`
**Source:** `commands.ts`, `entrypoints/cli.tsx`
**Status:** Internal, fully implemented

DAEMON mode is the process management layer that sits on top of bridge mode. While bridge mode provides the communication infrastructure, daemon mode provides the lifecycle management: spawning worker processes, monitoring their health, restarting crashed workers, and managing the process pool.

The daemon is activated via a CLI flag (`--daemon-worker=<kind>`) and requires bridge mode as a prerequisite. This creates a clean separation of concerns: bridge handles the network, daemon handles the processes.

**Multi-CLI Implication:** In a production multi-CLI system, you don't want to manually start and stop each specialist CLI. The daemon mode is designed to be the supervisor process that maintains your agent pool --- spawning new workers when demand increases, killing idle ones when resources are tight, and automatically recovering from crashes without human intervention.

### COORDINATOR_MODE: The Orchestration Brain

**Flag:** `feature('COORDINATOR_MODE')`
**Source:** `coordinator/coordinatorMode.ts` (369 lines)
**Env Var:** `CLAUDE_CODE_COORDINATOR_MODE=true`
**Status:** Experimental, internal-only

If bridge mode is the nervous system and daemon mode is the muscles, coordinator mode is the brain. This is Anthropic's first-party implementation of the multi-agent orchestration pattern that this entire book is about.

When coordinator mode is active, Claude Code transforms from a general-purpose coding agent into a specialized orchestrator. Its tool set is radically restricted:

```typescript
// Coordinator-only allowed tools
const COORDINATOR_TOOLS = [
  'AgentTool',       // Spawn and manage workers
  'TaskStop',        // Kill running workers
  'SendMessage',     // Communicate with active workers
  'SyntheticOutput', // Generate synthetic responses
  'TeamCreate',      // Create agent teams
  'TeamDelete',      // Destroy agent teams
]
```

The coordinator can't read files. It can't write code. It can't run bash commands. All it can do is *manage other agents*. This is a deliberate architectural decision: the coordinator's context window is too valuable to waste on implementation details. It should be thinking about task decomposition, dependency ordering, and result synthesis.

Workers spawned by the coordinator get a different tool set based on a secondary flag:

```typescript
// coordinator/coordinatorMode.ts
const workerTools = isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
  ? [BASH_TOOL_NAME, FILE_READ_TOOL_NAME, FILE_EDIT_TOOL_NAME].sort().join(', ')
  : Array.from(ASYNC_AGENT_ALLOWED_TOOLS)...
```

In simple mode (`CLAUDE_CODE_SIMPLE`), workers get only bash, file read, and file edit --- the minimum viable tool set for implementation tasks. In full mode, they get the complete asynchronous agent tool set plus any connected MCP tools.

Workers report back to the coordinator using a structured notification format:

```xml
<task-notification>
  <task-id>worker-auth-refactor</task-id>
  <status>completed</status>
  <summary>Refactored JWT validation to use RS256</summary>
  <result>Changed 4 files, all tests passing</result>
  <usage>12,847 tokens</usage>
</task-notification>
```

The coordinator also supports a scratchpad directory (gated behind `tengu_scratch`) where workers can persist intermediate results that other workers need to consume. This is a simple but effective mechanism for inter-agent data sharing without polluting the coordinator's context.

**Multi-CLI Implication:** Coordinator mode is the missing piece that turns a collection of independent Claude Code sessions into a coordinated team. It's the pattern we've been building manually with SwarmForge and claudecode_team --- except implemented as a native, first-party feature with proper permission boundaries and lifecycle management.

### The KAIROS Family: Proactive Agent Infrastructure

The KAIROS family comprises six feature flags that collectively enable Claude Code to operate *proactively* --- not just responding to user input, but monitoring, scheduling, consolidating, and alerting on its own.

#### KAIROS (The Core)

**Flag:** `feature('KAIROS')`
**Source:** `assistant/`, `main.tsx`
**Status:** Partially shipped internally

The base KAIROS flag activates Claude Code's "assistant mode" --- a fundamentally different operating mode where the agent doesn't just respond to prompts but actively monitors its environment and takes initiative. When KAIROS is active, the agent gains access to scheduled execution, background monitoring, and proactive intervention capabilities.

```typescript
// main.tsx
const assistantModule = feature('KAIROS')
  ? require('./assistant/index.js')
  : null
const kairosGate = feature('KAIROS')
  ? require('./assistant/gate.js')
  : null
```

The assistant module provides the core event loop, while the gate module handles permission and entitlement checks.

#### KAIROS_BRIEF (Context Briefings)

**Flag:** `feature('KAIROS_BRIEF')`
**Source:** `tools/BriefTool/BriefTool.ts`, `commands/brief.ts`
**Status:** Independent of full KAIROS

The Brief tool provides automated context summaries --- a daily briefing of what happened while you were away. It's designed to be the first thing you see when you open a new session: what changed in the codebase, what PRs were merged, what CI/CD pipelines broke, what messages arrived.

```typescript
// BriefTool.ts
const KAIROS_BRIEF_REFRESH_MS = 5 * 60 * 1000  // Refresh every 5 minutes

export function isBriefEnabled(): boolean {
  return feature('KAIROS') || feature('KAIROS_BRIEF')
}
```

The Brief tool can be enabled independently of the full KAIROS suite, which is a smart design choice --- you might want the briefing capability without the full proactive agent.

#### KAIROS_DREAM (Autonomous Memory Consolidation)

**Flag:** `feature('KAIROS_DREAM')`
**Source:** `tasks/DreamTask/DreamTask.ts` (157 lines), `services/autoDream/`
**Status:** Experimental background subsystem

This is one of the most fascinating features in the entire codebase. KAIROS_DREAM implements autonomous memory consolidation --- a background process that reviews your recent sessions, extracts the important information, and updates your MEMORY.md file without any human involvement.

The metaphor is deliberate. Like biological dreaming, which consolidates short-term memories into long-term storage, KAIROS_DREAM processes the day's work and distills it into persistent knowledge.

The system runs a four-stage pipeline:

1. **Orient** --- Survey recent sessions, identify themes and patterns
2. **Gather** --- Collect relevant information from conversation history, tool outputs, and file changes
3. **Consolidate** --- Synthesize gathered information into concise, actionable memory entries
4. **Prune** --- Remove outdated or redundant entries, keeping MEMORY.md under strict limits

```typescript
// tasks/DreamTask/DreamTask.ts
export type DreamTaskState = TaskStateBase & {
  type: 'dream'
  phase: DreamPhase        // 'starting' | 'updating'
  sessionsReviewing: number
  filesTouched: string[]
  turns: DreamTurn[]
  abortController?: AbortController
  priorMtime: number       // For lock rollback on kill
}
```

The dream task maintains strict limits: MEMORY.md is capped at 200 lines and 25KB. This isn't arbitrary. Long memory files degrade model performance because they consume context window space on every session start. The 200-line cap forces the dream consolidation to be genuinely *selective* --- not just appending everything, but making editorial decisions about what deserves to persist.

The implementation tracks which files were touched during the dream phase, manages abort controllers for graceful cancellation, and records the prior modification time of MEMORY.md for rollback safety if the process is killed mid-write.

The dream task runs as a background UI task visible in Claude Code's `BackgroundTasksDialog`, where users can monitor its progress and kill it if needed.

**Multi-CLI Implication:** In a multi-CLI system, each specialist agent generates knowledge that needs to persist across sessions. KAIROS_DREAM provides the mechanism for *automatic* knowledge management --- no human needed to curate what the Security CLI learned about your codebase's vulnerability patterns, or what the Research CLI discovered about your dependency landscape. The dream process handles it.

#### KAIROS_CHANNELS (Inbound Message Channels)

**Flag:** `feature('KAIROS_CHANNELS')`
**Source:** `services/mcp/channelNotification.ts`
**Runtime Gate:** `tengu_harbor`

Channels allow external services to push messages into a Claude Code session via MCP servers. Think Slack notifications, GitHub events, monitoring alerts --- any external signal that your agent should know about.

The implementation uses a seven-layer gating system that reflects the security sensitivity of allowing external message injection:

```typescript
// channelNotification.ts
export function gateChannelServer(
  serverName: string,
  capabilities: ServerCapabilities | undefined,
  pluginSource: string | undefined,
): ChannelGateResult {
  // Gate order:
  // 1. Capability — server declares experimental['claude/channel']
  // 2. Runtime — isChannelsEnabled() (tengu_harbor gate)
  // 3. Auth — OAuth required (no API key users)
  // 4. Policy — Teams/Enterprise must explicitly enable
  // 5. Session — user must list server in --channels
  // 6. Marketplace — verify installed plugin matches declared source
  // 7. Allowlist — check GrowthBook ledger or org's allowedChannelPlugins
}
```

Messages arrive as structured notifications with metadata passthrough:

```typescript
export const ChannelMessageNotificationSchema = z.object({
  method: z.literal('notifications/claude/channel'),
  params: z.object({
    content: z.string(),
    meta: z.record(z.string(), z.string()).optional(),
  }),
})

// Wrapped as XML for the model:
// <channel source="slack" chat_id="123" user="bob">
//   ${content}
// </channel>
```

The permission model is particularly interesting. Each server must explicitly request channel permission, and the session can allow or deny per-server:

```typescript
export const CHANNEL_PERMISSION_METHOD = 'notifications/claude/channel/permission'
// behavior: 'allow' | 'deny'
```

#### KAIROS_GITHUB_WEBHOOKS (PR Event Subscriptions)

**Flag:** `feature('KAIROS_GITHUB_WEBHOOKS')`
**Source:** `commands/subscribe-pr.js`

This flag enables the `/subscribe-pr` command, which lets a Claude Code session subscribe to GitHub pull request events --- review comments, CI results, status changes. When events arrive, the session can react automatically: responding to review comments, investigating CI failures, or updating the PR based on reviewer feedback.

There's a notable limitation documented in the source: the webhook system doesn't receive `mergeable_state` changes. Conflict detection requires polling via `gh pr view N --json mergeable`.

#### KAIROS_PUSH_NOTIFICATION (External Alerts)

**Flag:** `feature('KAIROS_PUSH_NOTIFICATION')`
**Status:** Referenced, implementation tied to KAIROS assistant mode

Push notifications complete the proactive agent picture. Combined with channels and webhooks, they allow a Claude Code session to not only receive external events but push alerts *out* --- notifying you on your phone or desktop when something requires attention.

**Multi-CLI Implication for the full KAIROS family:** Imagine a multi-CLI system where the Orchestrator subscribes to GitHub webhooks via KAIROS_GITHUB_WEBHOOKS. A review comment arrives on your PR. The Orchestrator receives it via KAIROS_CHANNELS, decomposes it into tasks, dispatches the Security CLI to audit the suggested change and the Coder CLI to implement it, waits for the Validator CLI to verify, and pushes a notification to your phone via KAIROS_PUSH_NOTIFICATION when the response is ready. The entire cycle happens while you're asleep. That's the vision KAIROS enables.

### UDS_INBOX: Peer-to-Peer Agent Communication

**Flag:** `feature('UDS_INBOX')`
**Commands:** `/peer`, `/peers`
**Source:** `utils/peerAddress.ts`, `tools/SendMessageTool/`
**Status:** Implemented

UDS_INBOX enables Unix Domain Socket-based messaging between Claude Code sessions. This is peer-to-peer communication with no central broker --- each session creates a socket at `claude-swarm-${process.pid}`, and other sessions can send messages directly.

```typescript
// utils/peerAddress.ts
export function parseAddress(to: string): {
  scheme: 'uds' | 'bridge' | 'other'
  target: string
}

// Address formats:
// "uds:<socket-path>" → local peer via Unix Domain Socket
// "bridge:<session-id>" → remote peer via bridge infrastructure
// Legacy bare paths → treated as UDS
```

The SendMessage tool integrates both UDS and bridge addressing, creating a unified messaging layer:

```typescript
// "uds:<socket-path>" for a local peer
// "bridge:<session-id>" for a Remote Control peer
// Use ListPeers to discover available peers
```

The `/peers` command discovers other running Claude Code sessions on the same machine, and `/peer` initiates a conversation. The ListPeers tool is only available when `feature('UDS_INBOX')` is active.

**Multi-CLI Implication:** UDS_INBOX is the *local* communication backbone for multi-CLI systems. When your Coder CLI finishes a task and needs to notify the Validator CLI, it doesn't need a bridge server or a central message queue. It sends a message directly through a Unix domain socket. Zero network overhead. Zero latency. Process-to-process communication at the operating system's native speed.

---

## 3.3 TIER 2: Powerful Additions

These features don't define the multi-CLI architecture, but they significantly enhance what's possible within it.

### ULTRAPLAN: Deep Planning on Opus

**Flag:** `feature('ULTRAPLAN')`
**Source:** `commands/ultraplan.tsx` (65KB), `utils/ultraplan/`
**Status:** ANT-only internal
**Model:** Opus 4.6 (via `tengu_ultraplan_model` gate)
**Timeout:** 30 minutes (`ULTRAPLAN_TIMEOUT_MS = 30 * 60 * 1000`)

ULTRAPLAN is remote deep planning that offloads complex architectural decisions to Opus 4.6 running on Anthropic's cloud. While your local session continues working, the ULTRAPLAN session spends up to 30 minutes thinking through a problem at maximum reasoning depth.

The system includes a sophisticated polling mechanism that tracks plan phases:

```typescript
// utils/ultraplan/ccrSession.ts
const POLL_INTERVAL_MS = 3000
const MAX_CONSECUTIVE_FAILURES = 5

export type UltraplanPhase = 'running' | 'needs_input' | 'plan_ready'

export type PollResult = {
  plan: string
  rejectCount: number
  executionTarget: 'local' | 'remote'
}
```

Plans can be executed either locally (via a "teleport" mechanism that pulls the plan back to your terminal) or remotely (approved for in-CCR execution). The teleport sentinel is particularly clever:

```typescript
const ULTRAPLAN_TELEPORT_SENTINEL = '__ULTRAPLAN_TELEPORT_LOCAL__'
```

When you click "teleport back to terminal," the system inserts this sentinel into the feedback, which triggers plan extraction and local execution.

The keyword detection system (`utils/ultraplan/keyword.ts`) watches for "ultraplan" in user input and automatically triggers the deep planning flow, filtering false positives from quoted strings, file paths, and question marks.

**Multi-CLI Implication:** In a multi-CLI system, ULTRAPLAN becomes the Planner CLI's secret weapon. Complex architectural decisions --- microservice decomposition, database schema design, migration strategies --- get sent to Opus 4.6 for 30 minutes of deep thought while the rest of the team continues working.

### ULTRATHINK: Maximum Reasoning Depth

**Flag:** `feature('ULTRATHINK')`
**Source:** `utils/thinking.ts`
**Runtime Gate:** `tengu_turtle_carbon`

ULTRATHINK activates maximum reasoning depth for the current model. While Claude Code already uses extended thinking, ULTRATHINK pushes it further with adaptive thinking configuration:

```typescript
export type ThinkingConfig =
  | { type: 'adaptive' }          // Model decides depth
  | { type: 'enabled'; budgetTokens: number }  // Fixed budget
  | { type: 'disabled' }          // No thinking

export function modelSupportsAdaptiveThinking(model: string): boolean {
  // Only opus-4-6 and sonnet-4-6 variants
  return canonical.includes('opus-4-6') || canonical.includes('sonnet-4-6')
}
```

The keyword "ultrathink" (case-insensitive) in user input triggers a UI indicator and enables maximum thinking budget for that turn. The `MAX_THINKING_TOKENS` environment variable provides external control over the thinking budget.

### FORK_SUBAGENT: Conversation Forking

**Flag:** `feature('FORK_SUBAGENT')`
**Source:** `tools/AgentTool/forkSubagent.ts`
**Command:** `/fork`

Fork subagent enables conversation forking --- creating an independent child process that inherits the parent's full conversation context but runs in its own sandbox. Unlike regular subagents that start fresh, fork children pick up exactly where the parent left off.

```typescript
export function isForkSubagentEnabled(): boolean {
  if (feature('FORK_SUBAGENT')) {
    if (isCoordinatorMode()) return false  // Mutually exclusive
    if (getIsNonInteractiveSession()) return false
    return true
  }
  return false
}
```

Key design decisions in the fork implementation:

**Cache-Identical Forking.** Fork children inherit the parent's tool pool and model, ensuring prompt cache hits. The fork message structure is carefully crafted so that only the final text block differs per child, maximizing token cache reuse.

```typescript
export const FORK_AGENT = {
  agentType: FORK_SUBAGENT_TYPE,  // "fork"
  tools: ['*'],                   // Inherits parent's full tool pool
  maxTurns: 200,
  model: 'inherit',               // Same model as parent
  permissionMode: 'bubble',       // Surfaces permissions to parent
}
```

**Anti-Recursion Guard.** The system prevents recursive forking by scanning message history for the fork boilerplate tag:

```typescript
export function isInForkChild(messages: MessageType[]): boolean {
  return messages.some(m =>
    m.type === 'user' &&
    Array.isArray(m.message.content) &&
    content.some(block =>
      block.type === 'text' && block.text.includes(`<${FORK_BOILERPLATE_TAG}>`)
    )
  )
}
```

**Strict Output Rules.** Fork children get injected boilerplate rules: don't converse, don't ask questions, execute tools silently, commit changes before reporting, keep reports under 500 words. This transforms a conversational agent into a focused worker.

**Isolation Modes.** Forks can run in `"worktree"` mode (isolated git worktree) or `"remote"` mode (CCR session, ANT-only). Worktree isolation prevents concurrent file system conflicts between parent and child.

### VERIFICATION_AGENT: Automated Quality Assurance

**Flag:** `feature('VERIFICATION_AGENT')`
**Source:** `tools/AgentTool/built-in/verificationAgent.ts` (129-line system prompt)
**Status:** Built-in agent definition

The verification agent is a read-only agent that runs after significant code changes to independently verify that everything works. Its philosophy is captured in its prompt: "Find the last 20%" --- the edge cases and failure modes that developers miss when they stop at "it works on my machine."

```typescript
export const VERIFICATION_AGENT: BuiltInAgentDefinition = {
  agentType: 'verification',
  whenToUse: 'Use after non-trivial tasks (3+ file edits, backend/API changes, infrastructure changes).',
  color: 'red',
  background: true,
  disallowedTools: [AGENT_TOOL_NAME, EXIT_PLAN_MODE_TOOL_NAME, FILE_EDIT_TOOL_NAME, ...],
  model: 'inherit',
}
```

The agent is explicitly forbidden from editing files --- it can only *observe*. It runs in the background (doesn't block the main conversation) and produces structured verdicts:

```
VERDICT: PASS
VERDICT: FAIL
VERDICT: PARTIAL
```

The verification strategies vary by change type: browser automation for frontend changes, curl for API changes, dry-runs for infrastructure, and import testing for libraries. Mandatory adversarial probes include concurrency testing, boundary values, idempotency checks, and orphan operations.

**Multi-CLI Implication:** The verification agent is essentially a built-in Validator CLI. In our multi-CLI architecture, it provides a lighter-weight alternative to spinning up a full Validator specialist --- useful for within-session verification when the Coder CLI wants to double-check its own work before reporting to the Orchestrator.

### SKILL_IMPROVEMENT: Self-Evolving Prompts

**Flag:** `feature('SKILL_IMPROVEMENT')`
**Source:** `utils/hooks/skillImprovement.ts`
**Runtime Gate:** `tengu_copper_panda`

This feature enables Claude Code to automatically improve its own skill definitions based on observed user behavior. Every five user messages (configurable via `TURN_BATCH_SIZE`), a background hook analyzes the recent conversation against the active skill definition:

```typescript
async shouldRun(context) {
  // Only run every TURN_BATCH_SIZE (5) user messages
  // Requires active project skill loaded
  return findProjectSkill() && userCount - lastAnalyzedCount >= TURN_BATCH_SIZE
}
```

The hook looks for implicit corrections: "can you also...", "please do...", "don't do...", and preference signals. It generates structured updates:

```typescript
export type SkillUpdate = {
  section: string  // Which part of the skill to modify
  change: string   // What to change
  reason: string   // Why this change was detected
}
```

When updates are detected, the system rewrites the SKILL.md file, preserving its frontmatter and overall structure while incorporating the improvements. The rewrite uses a small, fast model (`getSmallFastModel()`) to minimize latency and cost.

**Multi-CLI Implication:** Each specialist CLI in a multi-agent system can evolve its own skills over time. The Security CLI gets better at your codebase's specific vulnerability patterns. The Documentation CLI learns your team's preferred formatting. This is genuine continuous improvement without manual prompt engineering.

### WEB_BROWSER_TOOL: Built-In Browser Automation

**Flag:** `feature('WEB_BROWSER_TOOL')`
**Source:** `utils/claudeInChrome/`, `skills/bundled/claudeInChrome.ts`

The browser tool integrates browser automation directly into Claude Code via MCP, connecting to Chrome through the Claude-in-Chrome extension. The implementation provides Playwright-style automation capabilities: navigation, element interaction, screenshot capture, and page content extraction.

The architecture uses an MCP server (`utils/claudeInChrome/mcpServer.ts`) that communicates with a Chrome extension, providing a standardized tool interface that the model can invoke like any other tool. The prompt engineering in `utils/claudeInChrome/prompt.ts` guides the model toward effective browser interaction patterns --- clicking selectors rather than coordinates, waiting for network idle before assertions, and handling dynamic content.

The Chrome-in-Claude bundled skill (`skills/bundled/claudeInChrome.ts`) provides the skill definition that teaches Claude Code how to effectively use browser automation tools: when to screenshot, when to use CSS selectors, how to handle authentication flows, and how to extract structured data from web pages.

**Multi-CLI Implication:** A dedicated Browser CLI in your multi-agent system would have WEB_BROWSER_TOOL as its primary capability. It handles all web interactions --- scraping documentation, testing deployed applications, filling forms, monitoring dashboards --- keeping browser complexity out of other specialists' context windows.

### WORKFLOW_SCRIPTS: Automated Sequences

**Flag:** `feature('WORKFLOW_SCRIPTS')`
**Source:** `commands/workflows/`, `tools/WorkflowTool/`
**Command:** `/workflows`

Workflow scripts enable custom automation sequences --- predefined multi-step pipelines that execute without human intervention. The system provides a `LocalWorkflowTask` execution engine that runs workflows as background tasks, and a dedicated `WorkflowTool` that exposes workflow execution as a tool the model can invoke.

Think of workflows as macro recordings for Claude Code. You define a sequence of operations --- "run linter, fix all auto-fixable errors, run tests, commit if green, open PR" --- and save it as a reusable workflow. The `/workflows` command lists available workflows and lets you trigger them interactively.

The underlying `LocalWorkflowTask` tracks execution state, supports cancellation via abort controllers, and integrates with Claude Code's background task UI so you can monitor progress. Workflows can be project-scoped (saved in your project's `.claude/` directory) or global (saved in your user configuration).

**Multi-CLI Implication:** Workflows are the glue that turns ad-hoc multi-CLI scripts into repeatable pipelines. Instead of manually orchestrating "start Security CLI, pipe results to Coder CLI, verify with Validator CLI," you define it as a workflow and run it with a single command.

### TORCH: Remote Agent Operations

**Flag:** `feature('TORCH')`
**Source:** `commands/torch.ts`
**References:** `RemoteAgentTask`, `teleportToRemote`, `archiveRemoteSession`

TORCH provides commands for managing remote agent sessions --- teleporting work to remote infrastructure, archiving sessions, and managing the lifecycle of remote agents. The naming suggests a "passing the torch" metaphor: handing off work from a local session to a remote one.

The `teleportToRemote` function transfers a local session's state (conversation history, working directory context, active tasks) to a CCR session. The `archiveRemoteSession` function captures a remote session's final state and stores it for later review. These primitives are the building blocks for a "hot-swap" architecture where work can migrate between local and cloud environments based on compute needs or cost constraints.

**Multi-CLI Implication:** TORCH enables elastic scaling. When a local Coder CLI hits a complex refactoring that needs more compute, it can teleport to a remote CCR session, execute at full cloud speed, and archive the results. The Orchestrator never needs to know where execution happened --- it just gets the results.

### BUDDY: The Companion Sprite System

**Flag:** `feature('BUDDY')`
**Source:** `buddy/` (6 modules: `types.ts`, `companion.ts`, `sprites.ts`, `prompt.ts`, `CompanionSprite.tsx`, `useBuddyNotification.tsx`)

Yes, Claude Code has a procedurally-generated companion pet system. And yes, it has rarity tiers.

```typescript
export const SPECIES = [
  'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus',
  'owl', 'penguin', 'turtle', 'snail', 'ghost', 'axolotl',
  'capybara', 'cactus', 'robot', 'rabbit', 'mushroom', 'chonk'
]

export const RARITY_WEIGHTS = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1
}
```

Each companion is procedurally generated using a Mulberry32 PRNG seeded from your user ID, ensuring deterministic generation --- you always get the same buddy. Companions have species, eyes (six variants from `·` to `@`), hats (including a tiny duck hat), stats (DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK --- each up to 99), and shiny variants.

The companion appears as a floating sprite in the terminal, with buddy-specific notifications and personality-driven commentary. The species list includes one entry that collides with Claude Code's `excluded-strings.txt` canary, so it's constructed via `String.fromCharCode` to avoid triggering build-time security checks.

Is this feature useful for multi-CLI architecture? No. Is it delightful? Absolutely. And the engineering team's decision to build a full gacha system complete with rarity tiers and shiny variants tells you something about the culture inside Anthropic. These are people who care about the craft.

---

## 3.4 The 17 Beta API Headers

Beyond feature flags, Claude Code negotiates capabilities with the Anthropic API through beta headers. These headers unlock server-side features that the client can then leverage. Here are all 17, defined in `constants/betas.ts`:

| Header | Date | What It Unlocks |
|--------|------|-----------------|
| `claude-code-20250219` | 2025-02-19 | Base Claude Code protocol |
| `interleaved-thinking-2025-05-14` | 2025-05-14 | Thinking blocks interleaved with content |
| `context-1m-2025-08-07` | 2025-08-07 | 1M token context window (opt-in with `[1m]` suffix) |
| `context-management-2025-06-27` | 2025-06-27 | Server-side context management API |
| `structured-outputs-2025-12-15` | 2025-12-15 | Guaranteed JSON schema enforcement |
| `web-search-2025-03-05` | 2025-03-05 | Built-in web search capability |
| `advanced-tool-use-2025-11-20` | 2025-11-20 | Tool search for 1P (Anthropic API/Foundry) |
| `tool-search-tool-2025-10-19` | 2025-10-19 | Tool search for 3P (Vertex/Bedrock) |
| `effort-2025-11-24` | 2025-11-24 | Low/medium/high/max effort control |
| `task-budgets-2026-03-13` | 2026-03-13 | Per-task token budgets |
| `prompt-caching-scope-2026-01-05` | 2026-01-05 | Granular prompt cache control |
| `fast-mode-2026-02-01` | 2026-02-01 | Reduced latency mode (speed over quality) |
| `redact-thinking-2026-02-12` | 2026-02-12 | Hide thinking blocks from output |
| `token-efficient-tools-2026-03-28` | 2026-03-28 | Compressed tool schemas (more context room) |
| `advisor-tool-2026-03-01` | 2026-03-01 | Separate advisor model for review |
| `afk-mode-2026-01-31` | 2026-01-31 | AFK idle classification (requires `TRANSCRIPT_CLASSIFIER`) |
| `cli-internal-2026-02-09` | 2026-02-09 | Internal CLI features (ANT-only) |

Three headers are conditionally included based on feature flags:

```typescript
// Only included when CONNECTOR_TEXT flag is active
export const SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER =
  feature('CONNECTOR_TEXT') ? 'summarize-connector-text-2026-03-13' : ''

// Only included when TRANSCRIPT_CLASSIFIER flag is active
export const AFK_MODE_BETA_HEADER =
  feature('TRANSCRIPT_CLASSIFIER') ? 'afk-mode-2026-01-31' : ''

// Only included for Anthropic employees
export const CLI_INTERNAL_BETA_HEADER =
  process.env.USER_TYPE === 'ant' ? 'cli-internal-2026-02-09' : ''
```

Not all providers support all headers. Bedrock uses `extraBodyParams` instead of headers and only supports a subset: `interleaved-thinking`, `context-1m`, and `tool-search-tool-3P`. Vertex `countTokens` is even more restricted: only `claude-code-20250219` and `interleaved-thinking`.

**Multi-CLI Implications:**

- **task-budgets** is essential for multi-CLI --- it lets you set per-worker token limits, preventing any single specialist from consuming the entire budget.
- **fast-mode** is ideal for lightweight CLIs (Validator, QA) where speed matters more than reasoning depth.
- **effort levels** let the Orchestrator use low effort for routing decisions and max effort for complex planning.
- **advisor-tool** is a natural fit for the Security CLI as an advisory role.
- **token-efficient-tools** reduces overhead when CLIs have many tools registered, freeing context for actual work.
- **context-1m** gives the Research CLI massive context for RAG-heavy operations.

---

## 3.5 Model Codenames and Internal Nomenclature

The source code reveals several internal codenames that help you understand Anthropic's development trajectory and organizational structure:

| Codename | What It Refers To | Where Found |
|----------|------------------|-------------|
| **Fennec** | Previous model generation (deprecated, migrated to Opus) | `migrations/migrateFennecToOpus.ts` |
| **Chicago** | Computer Use MCP system | `CHICAGO_MCP` flag, `main.tsx` |
| **Tengu** | Claude Code's internal project name | All GrowthBook flags (`tengu_*`), throughout codebase |
| **Lodestone** | Unknown internal system | `LODESTONE` flag, `main.tsx` lines 647, 3781 |

The Fennec-to-Opus migration is codified in `migrations/migrateFennecToOpus.ts`:

```typescript
export function migrateFennecToOpus(): void {
  // Idempotent migration:
  // 'fennec-latest' → 'opus'
  // 'fennec-latest[1m]' → 'opus[1m]'
  // 'fennec-fast-latest' → 'opus[1m]' + fast mode
  // Updates project, local, and policy aliases
}
```

The "Tengu" codename is especially significant. Tengu (天狗) are supernatural beings in Japanese folklore --- intelligent, powerful, often depicted as protectors of mountains and forests. Every runtime feature flag in GrowthBook follows the `tengu_` prefix, and the project name appears throughout the codebase in comments, log events, and configuration keys. When you see `tengu_ccr_bridge` or `tengu_turtle_carbon` in GrowthBook queries, you're looking at Claude Code's internal identity.

The build system actively prevents codename leaks through an `excluded-strings.txt` file that the bundler checks against the output. Any string that appears in this file triggers a build failure, which is why some code constructs strings character-by-character via `String.fromCharCode()`. This is a real security concern --- internal codenames in public binaries would reveal Anthropic's product roadmap to competitors.

The GrowthBook flag naming convention reveals the scope of internal experimentation. Every runtime gate follows the `tengu_` prefix, and the second component often hints at the feature domain: `tengu_turtle_carbon` for thinking features, `tengu_copper_panda` for skill improvement, `tengu_harbor` for channel features, `tengu_scratch` for coordinator scratchpad. There are over 500 of these runtime gates in the GrowthBook system, each representing a knob that Anthropic can turn independently per user segment, organization, or percentage rollout.

---

## 3.6 Hidden Environment Variables

These environment variables aren't documented in any public README but provide critical control points:

| Variable | Purpose | Restriction |
|----------|---------|-------------|
| `CLAUDE_INTERNAL_FC_OVERRIDES` | JSON object to override GrowthBook feature flags | ANT-only |
| `CLAUDE_CODE_COORDINATOR_MODE` | Activate coordinator mode | Requires `COORDINATOR_MODE` flag |
| `CLAUDE_CODE_PROACTIVE` | Enable proactive/assistant mode | Requires KAIROS |
| `CLAUDE_CODE_SIMPLE` | Restrict workers to basic tools (bash, read, edit) | Coordinator context |
| `CLAUDE_CODE_TEAMMATE_COMMAND` | Custom teammate command path | Multi-agent |
| `CLAUDE_CODE_AGENT_COLOR` | Teammate display color | UI |
| `CLAUDE_CODE_PLAN_MODE_REQUIRED` | Force plan mode for teammates | Team enforcement |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Override model for subagents | Model routing |
| `MAX_THINKING_TOKENS` | Override thinking budget | Universal |
| `ULTRAPLAN_PROMPT_FILE` | Custom ultraplan prompt file | ANT-only |
| `USER_TYPE` | Distinguish ANT (employee) from external users | System |

The most powerful of these is `CLAUDE_INTERNAL_FC_OVERRIDES`:

```typescript
// Example: Enable specific runtime gates locally
CLAUDE_INTERNAL_FC_OVERRIDES='{"tengu_harbor": true, "tengu_copper_panda": true}'
```

This bypasses all remote evaluation and disk cache for the specified features, giving Anthropic engineers instant access to any runtime-gated feature. It's restricted to `USER_TYPE === 'ant'` builds --- the public binary doesn't check this variable.

---

## 3.7 TIER 3: Internal Tooling, Telemetry, and Infrastructure Flags

The remaining flags don't directly enable multi-CLI architecture, but understanding them completes the picture of Claude Code's internal engineering.

### Telemetry and Experimentation (7 flags)

**ABLATION_BASELINE**, **COMMIT_ATTRIBUTION**, **COWORKER_TYPE_TELEMETRY**, **ENHANCED_TELEMETRY_BETA**, **MEMORY_SHAPE_TELEMETRY**, **SHOT_STATS**, **SLOW_OPERATION_LOGGING** --- these flags control Anthropic's internal experimentation and measurement infrastructure. ABLATION_BASELINE is particularly interesting: it creates a controlled baseline for A/B experiments by disabling specific capabilities and measuring the impact on task completion. SHOT_STATS tracks per-turn performance metrics. SLOW_OPERATION_LOGGING instruments operations that exceed latency thresholds, feeding data back to the performance team.

### Content and Memory Management (8 flags)

**EXTRACT_MEMORIES**, **COMPACTION_REMINDERS**, **REACTIVE_COMPACT**, **CACHED_MICROCOMPACT**, **AWAY_SUMMARY**, **HISTORY_SNIP**, **HISTORY_PICKER**, **FILE_PERSISTENCE** --- these flags control the memory and context management subsystem. REACTIVE_COMPACT triggers compaction in response to specific events (tool failures, context overflows) rather than just token thresholds. CACHED_MICROCOMPACT optimizes the micro-compaction process with caching to avoid re-summarizing stable conversation segments. HISTORY_SNIP allows selective removal of conversation segments. AWAY_SUMMARY generates a summary when you return to a session after being idle --- the precursor to KAIROS_BRIEF.

### Build Infrastructure (11 flags)

**ANTI_DISTILLATION_CC**, **BASH_CLASSIFIER**, **TRANSCRIPT_CLASSIFIER**, **BREAK_CACHE_COMMAND**, **PROMPT_CACHE_BREAK_DETECTION**, **TREE_SITTER_BASH**, **TREE_SITTER_BASH_SHADOW**, **IS_LIBC_GLIBC**, **IS_LIBC_MUSL**, **POWERSHELL_AUTO_MODE**, **HOOK_PROMPTS** --- these are platform and parsing infrastructure. ANTI_DISTILLATION_CC adds protections against model distillation attacks. TREE_SITTER_BASH and its shadow variant use Tree-sitter parsing for bash command analysis, enabling more sophisticated command classification and safety checking. The libc flags detect the C library variant for Linux compatibility.

### Session and Settings (6 flags)

**BG_SESSIONS**, **UPLOAD_USER_SETTINGS**, **DOWNLOAD_USER_SETTINGS**, **NEW_INIT**, **TEMPLATES**, **REVIEW_ARTIFACT** --- BG_SESSIONS is notable as the infrastructure for running sessions entirely in the background without a terminal UI, which is a prerequisite for headless multi-CLI operation. TEMPLATES enables project templates for quick-starting new Claude Code projects with pre-configured settings.

---

## 3.8 Feature Activation Playbook

If you have access to the Claude Code source (as we do in this book), here's a practical guide to activating the features that matter most for multi-CLI architecture.

### Step 1: Build with Flags Enabled

The feature flags are controlled at build time. To enable them, you need to modify the Bun bundle configuration to include the flags you want:

```bash
# In the build configuration, enable Tier 1 flags
FEATURES='COORDINATOR_MODE,BRIDGE_MODE,DAEMON,UDS_INBOX,KAIROS,KAIROS_DREAM,KAIROS_CHANNELS,FORK_SUBAGENT,VERIFICATION_AGENT'
```

This ensures the compile-time gates resolve to `true` and the associated code survives tree-shaking.

### Step 2: Configure Runtime Gates

Even with compile-time flags enabled, runtime gates need to be satisfied. For development, use the GrowthBook override mechanism:

```bash
export CLAUDE_INTERNAL_FC_OVERRIDES='{
  "tengu_ccr_bridge": true,
  "tengu_ccr_bridge_multi_session": true,
  "tengu_harbor": true,
  "tengu_turtle_carbon": true,
  "tengu_copper_panda": true,
  "tengu_scratch": true
}'
```

### Step 3: Activate Coordinator Mode

```bash
export CLAUDE_CODE_COORDINATOR_MODE=true
# Optionally restrict workers to basic tools:
export CLAUDE_CODE_SIMPLE=true
```

### Step 4: Enable KAIROS Background Processing

```bash
export CLAUDE_CODE_PROACTIVE=true
```

### Step 5: Configure UDS for Local Multi-CLI

Launch sessions with messaging socket paths:

```bash
# Session 1 (Orchestrator)
claude --messaging-socket-path=/run/user/$UID/claude-orchestrator

# Session 2 (Coder)
claude --messaging-socket-path=/run/user/$UID/claude-coder

# Session 3 (Security)
claude --messaging-socket-path=/run/user/$UID/claude-security
```

Sessions discover each other via `/peers` and communicate via `/peer` or the SendMessage tool.

### Step 6: Set Up Bridge for Remote CLIs

```bash
# Start daemon mode for remote worker management
claude --daemon-worker=bridge --remote-control
```

This launches Claude Code in daemon mode with bridge connectivity, allowing remote sessions to be spawned and managed.

### Priority Order for Activation

If you're incrementally building your multi-CLI system, enable features in this order:

1. **COORDINATOR_MODE** + **UDS_INBOX** --- Get local orchestration and peer messaging working first
2. **FORK_SUBAGENT** + **VERIFICATION_AGENT** --- Add conversation forking and automated verification
3. **KAIROS_DREAM** --- Enable background memory consolidation
4. **BRIDGE_MODE** + **DAEMON** --- Scale to remote sessions
5. **KAIROS_CHANNELS** + **KAIROS_GITHUB_WEBHOOKS** --- Add external event reactivity
6. **ULTRAPLAN** + **ULTRATHINK** --- Unlock deep planning for architectural decisions
7. **SKILL_IMPROVEMENT** --- Enable self-evolving specialist skills

---

## 3.9 The Bigger Picture

Eighty-eight flags. Seventeen beta headers. Five hundred-plus runtime gates. Fifteen hidden environment variables. Four model codenames.

This isn't a tool that's done evolving. This is a tool that's *in the middle* of becoming something much larger. The feature flags tell a story of where Anthropic is heading:

**Coordinator mode** says they see multi-agent orchestration as a first-party capability, not something third parties should have to build. The restricted tool set --- no file editing, no bash, only agent management --- is a design philosophy: the brain shouldn't be doing the hands' work.

**KAIROS** says they see the future of AI coding assistants as proactive --- not waiting for prompts, but monitoring, consolidating, and alerting on their own. The six KAIROS flags represent different dimensions of proactivity: scheduled tasks (KAIROS), situational awareness (KAIROS_BRIEF), knowledge management (KAIROS_DREAM), external event reactivity (KAIROS_CHANNELS, KAIROS_GITHUB_WEBHOOKS), and user notification (KAIROS_PUSH_NOTIFICATION).

**Bridge mode with 32 parallel sessions** says they see cloud-native, distributed agent execution as the deployment model, not local single-process. Thirty-two is not an arbitrary number --- it's high enough for serious parallelism but bounded enough to manage costs and prevent runaway resource consumption.

**KAIROS_DREAM** says they believe in persistent, self-managing memory --- agents that remember not because you told them to, but because they consolidate their own experiences overnight. The four-stage pipeline (orient, gather, consolidate, prune) mirrors cognitive science models of memory consolidation during sleep. The 200-line cap on MEMORY.md is a hard-won engineering decision: unlimited memory degrades model performance by consuming precious context window tokens at session start.

**UDS_INBOX** says they see peer-to-peer agent communication as a primitive worth building into the core. Not a REST API. Not a message queue. Unix domain sockets --- the fastest, lowest-overhead IPC mechanism the operating system provides. This is agent communication designed for microsecond latency on shared machines.

**FORK_SUBAGENT** says they recognize that sometimes you need to branch, not delegate. The cache-identical forking design --- where children share the parent's prompt cache --- reveals deep thinking about cost optimization in multi-agent systems. Every dollar saved on redundant token processing is a dollar that can fund another agent.

Every one of these features is something we're building externally in the multi-CLI architectures this book teaches. The difference is that we're doing it now, with the tools available today, while Anthropic is building the native versions for tomorrow.

When these flags ship publicly --- and the implementation depth says they will --- our multi-CLI systems won't become obsolete. They'll become *easier*. The patterns we've established will map directly onto native capabilities. The workarounds we've built will give way to first-party solutions. And the architectural thinking we've developed will be exactly what's needed to use these features effectively.

The timeline isn't speculative. The KAIROS family alone has six flags, a multi-module assistant system, a background dream consolidation engine, a channel notification framework with seven-layer security gating, and GitHub webhook integration. You don't build that level of infrastructure for features you're not shipping. The bridge directory has 33 modules and 500KB of TypeScript. The coordinator mode has a 369-line orchestration module with team management, worker spawning, and structured notification protocols. This is production code waiting for a launch date.

That's why this chapter exists. Not to show you features you can't use, but to show you the future you're building toward. Every flag in this chapter is a promise from the codebase. The code is written. The tests exist. The infrastructure is deployed. The only thing between here and there is a `feature()` call that resolves to `true`.

Now you know every lever. Let's pull the ones that matter.

---

*Next: Chapter 4 --- The Orchestrator Pattern: Building the Central Brain*
