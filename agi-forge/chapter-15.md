# Chapter 15: Inter-CLI Communication Protocol

---

Eight processes. Eight independent Claude Code instances, each with its own context window, its own tool registry, its own streaming agent loop burning through tokens at 80 tokens per second. They share a filesystem. They share a goal. They share nothing else.

This is the central problem of multi-CLI architecture. Chapter 14 gave us shared memory — a passive layer where CLIs read and write state to common locations on disk. Shared memory answers the question *what does everyone know?* But it cannot answer the question that matters more: *what should everyone do next?*

For that, you need communication. Active, directed, reliable communication. Not "write a file and hope someone reads it" — real messaging. Agent A tells Agent B to start the security audit. Agent B tells Agent A when it finds a critical vulnerability. Agent C broadcasts to the entire team that the build is broken. Agent D asks Agent E a question and blocks until it gets an answer.

This is inter-process communication, and it is one of the oldest problems in computer science. Dijkstra wrote about it in 1965. Every operating system textbook devotes three chapters to it. But multi-CLI AI agent systems add a twist that Dijkstra never contemplated: the processes doing the communicating are stochastic. They don't follow deterministic code paths. They hallucinate. They misinterpret instructions. They sometimes decide, mid-task, that the task has changed. Building a communication protocol for agents that might go off-script at any moment is a different engineering challenge than building one for programs that execute exactly what you wrote.

Claude Code's source reveals three distinct communication layers, each solving a different part of this problem. The **mailbox system** — file-based JSON inboxes with advisory locking — handles teammate-to-teammate messaging within a swarm. The **SendMessage tool** provides a high-level interface that routes messages by name, handles structured protocol messages like shutdown requests, and bridges between in-process and tmux-based teammates. And the **UDS_INBOX** feature — Unix Domain Sockets gated behind a feature flag — enables zero-overhead peer-to-peer messaging between any two Claude Code sessions on the same machine, whether or not they share a team.

This chapter dissects all three. We will build up from first principles: what are the communication patterns multi-CLI systems need, what transport mechanisms exist, how Claude Code implements each one, and how you extend them into a complete protocol for your own multi-CLI architectures.

---

## 15.1 The Communication Problem

Before we touch any code, we need to understand what we are solving. Multi-CLI systems face communication challenges that single-agent systems never encounter.

### The Eight-Process Scenario

Consider the AGI Forge reference architecture from Chapter 3. An Orchestrator CLI receives a user request: "Build a REST API for user authentication with OAuth2, rate limiting, and comprehensive test coverage." The Orchestrator decomposes this into subtasks and dispatches them:

```
Orchestrator CLI
  ├─ Research CLI → "Survey OAuth2 libraries for Node.js, compare passport vs oauth2-server"
  ├─ Planner CLI  → "Create implementation DAG with task dependencies"
  ├─ Coder CLI    → "Implement the API routes and middleware"
  ├─ Security CLI → "Audit the implementation for OWASP Top 10"
  ├─ QA CLI       → "Write integration tests for all endpoints"
  └─ Docs CLI     → "Generate OpenAPI spec and developer guide"
```

This decomposition creates six simultaneous communication needs:

1. **Task dispatch**: The Orchestrator must send detailed instructions to each specialist. This is a one-to-one, directed message with a payload that may be hundreds of tokens long.

2. **Progress reporting**: Each specialist must periodically inform the Orchestrator of its status. This is fire-and-forget — the specialist doesn't need an acknowledgment.

3. **Dependency notification**: The Planner must tell the Coder when the implementation DAG is ready. The Coder must tell Security when the code is committed. These are event-driven, triggered by state transitions.

4. **Queries**: Security finds a suspicious pattern in the auth middleware. It needs to ask the Coder CLI a question: "Why did you use `eval()` here instead of `JSON.parse()`?" This is request/response — Security blocks (or at least pauses) until Coder answers.

5. **Broadcasts**: The QA CLI discovers that the test database is corrupted. Every other CLI needs to know immediately. This is one-to-many, urgent, and must not be missed.

6. **Coordination**: Two CLIs — Coder and Docs — both want to modify `README.md`. They need a way to avoid clobbering each other's changes. This isn't messaging per se, but it requires a communication primitive (typically a lock or a lease).

No single communication pattern handles all six. This is why Claude Code's source implements multiple layers, and why any serious multi-CLI system must do the same.

### Why Shared Files Aren't Enough

The naive approach — and the one most developers try first — is to communicate through the filesystem. CLI A writes a JSON file. CLI B polls for it, reads it, deletes it. This works for toy demos. It fails in production for four reasons:

**Race conditions.** Two CLIs write to the same file simultaneously. One write wins, the other is silently lost. Without file locking, you get corrupted state. With file locking, you get serialization bottlenecks. Claude Code's `tasks.ts` uses `proper-lockfile` with exponential backoff retries (30 retries, 5ms minimum timeout, 100ms maximum) specifically because a 10-agent swarm creates enough contention to blow past naive locking:

```typescript
// From utils/tasks.ts — lock budget sized for ~10+ concurrent swarm agents
const LOCK_OPTIONS = {
  retries: {
    retries: 30,
    minTimeout: 5,
    maxTimeout: 100,
  },
}
```

**Polling overhead.** There is no `inotify` for AI agents. Each CLI must poll the filesystem at some interval. Too fast, and you waste I/O bandwidth. Too slow, and messages are delayed. Claude Code's mailbox system polls for inbox changes at tool-round boundaries — the natural pause between tool executions in the agent loop. This is clever but means messages can be delayed by the duration of a tool execution (sometimes 30+ seconds for a complex bash command).

**No delivery guarantees.** Files can be read before they are fully written. Files can be deleted by the recipient before the sender confirms delivery. Files can be orphaned when a CLI crashes mid-write. The filesystem provides no atomicity guarantees for multi-step operations.

**No addressing.** Files don't have a "to" field. You need a naming convention to route messages — `inbox-researcher.json`, `inbox-coder.json` — and every CLI needs to know the convention. This is fragile and doesn't scale.

Claude Code's actual implementation addresses all four problems, but it does so by building an entire messaging layer *on top of* the filesystem, not by using the filesystem as a messaging layer. The distinction matters.

---

## 15.2 Three Communication Patterns

Multi-CLI systems need three fundamental patterns. Every message sent between CLIs falls into one of these categories, and each category demands different infrastructure.

### Pattern 1: Request/Response

The caller sends a message and waits for a reply. This is the most intuitive pattern and the most dangerous for agent systems.

```
Security CLI                          Coder CLI
    │                                     │
    ├──── "Why eval() on line 47?" ──────►│
    │                                     ├── [reads code, formulates answer]
    │◄─── "Legacy compat, will fix" ──────┤
    │                                     │
```

**When to use:** Cross-agent queries. Plan approval (teammate proposes plan, lead approves or rejects). Shutdown coordination (lead requests shutdown, teammate approves).

**Implementation in Claude Code:** The `SendMessage` tool supports structured messages with `request_id` fields for correlation. When a teammate sends a `shutdown_request`, it includes a generated `request_id`. The recipient must echo that `request_id` in the `shutdown_response`:

```typescript
// From SendMessageTool.ts — structured message discriminated union
const StructuredMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('shutdown_request'),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('shutdown_response'),
    request_id: z.string(),
    approve: semanticBoolean(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('plan_approval_response'),
    request_id: z.string(),
    approve: semanticBoolean(),
    feedback: z.string().optional(),
  }),
])
```

The `request_id` is generated by `generateRequestId()` from `utils/agentId.ts` — a UUID that correlates the request with its response across two independent agent loops that have no shared state beyond the message content.

**Danger:** Deadlocks. If CLI A sends a request to CLI B, and CLI B sends a request to CLI A, both block forever. Agent systems are especially prone to this because the LLM doesn't understand blocking semantics — it might decide to ask a question before answering the pending question. The mitigation is timeouts: every request/response exchange must have a deadline.

### Pattern 2: Fire-and-Forget

The sender emits a message and continues immediately. No reply expected. No confirmation needed.

```
QA CLI ──── "Tests passing: 47/47" ────► Orchestrator CLI
  │  (continues working)                     │ (notes status)
  │                                          │
```

**When to use:** Status updates. Progress reports. Task completion notifications. Idle notifications. Any message where the sender's next action doesn't depend on the recipient's reaction.

**Implementation in Claude Code:** This is the default mode for `SendMessage` with plain text content. The tool writes to the recipient's mailbox and returns immediately:

```typescript
// Messages queued mid-turn via SendMessage, drained at tool-round boundaries
```

The recipient processes the message at the next tool-round boundary — the pause between one tool execution completing and the next one starting. This is fire-and-forget from the sender's perspective: the message is persisted to the recipient's inbox file, and the sender moves on.

**Agent teams' idle notifications** are the purest example. After every turn, a teammate automatically sends an idle notification to the team lead. The teammate doesn't wait for acknowledgment. The lead processes it when convenient. This creates a heartbeat-like pattern without explicit heartbeat infrastructure.

### Pattern 3: Pub/Sub (Broadcast)

One sender, multiple receivers. The message goes to everyone who should hear it.

```
QA CLI ──── "Build broken!" ────► Coder CLI
                                ├► Security CLI
                                ├► Docs CLI
                                └► Orchestrator CLI
```

**When to use:** System-wide alerts. Configuration changes. "Stop everything" commands. Any message where the sender doesn't know (or care about) the specific recipients.

**Implementation in Claude Code:** The `SendMessage` tool supports `"*"` as the recipient, which broadcasts to all teammates:

```json
{"to": "*", "summary": "build broken", "message": "CI pipeline failing on auth module"}
```

The prompt explicitly warns that broadcast is expensive: "Broadcast to all teammates — expensive (linear in team size), use only when everyone genuinely needs it." This is sound advice. In a 10-agent swarm, a broadcast generates 10 inbox writes, each requiring a file lock acquisition. Under contention, this can take several seconds.

The broadcast implementation in the custom `claudecode_team` message bus is more explicit about routing:

```javascript
// From message-bus.js
broadcast(fromId, content, type = 'broadcast') {
  return this.send(fromId, '*', content, type);
}
```

Messages with `to: '*'` are recorded in every agent's index, ensuring that any agent querying its history will see broadcast messages.

---

## 15.3 Transport Mechanisms

Communication patterns describe *what* agents need to say. Transport mechanisms describe *how* the bytes move. Claude Code supports three transports, each optimized for a different deployment topology.

### Transport 1: File-Based Mailbox (Local Swarms)

This is Claude Code's primary communication transport for agent teams. Every teammate gets an inbox file:

```
~/.claude/teams/{team-name}/inboxes/
  ├── team-lead.json
  ├── researcher.json
  ├── implementer.json
  └── security-auditor.json
```

Each inbox is a JSON array of `TeammateMessage` objects:

```typescript
// From utils/teammateMailbox.ts
export type TeammateMessage = {
  from: string        // Sender's agent name
  text: string        // Message content
  timestamp: string   // ISO 8601 timestamp
  read: boolean       // Whether the message has been consumed
  color?: string      // Sender's display color
  summary?: string    // 5-10 word preview for UI
}
```

The critical engineering is in the locking. The `writeToMailbox` function acquires an advisory lock before modifying an inbox file, using `proper-lockfile` with retry semantics:

```typescript
// From utils/teammateMailbox.ts
const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    minTimeout: 5,
    maxTimeout: 100,
  },
}
```

The retry budget is smaller than the task list's budget (10 retries vs. 30) because inbox contention is lower — typically only one agent writes to a given inbox at a time, while the task list sees writes from every agent in the swarm.

The write protocol is:
1. Acquire lock on `{agent-name}.json`
2. Read existing messages
3. Append new message
4. Write entire array back
5. Release lock

This is a read-modify-write cycle, which means it is not atomic at the filesystem level. The lock is what makes it safe. Without the lock, two concurrent writes would both read the same array, both append, and one write would clobber the other's append. With the lock, writes are serialized.

**Message delivery timing:** Tmux-based teammates poll their inbox at startup and between turns. In-process teammates receive messages through a different path — the `queuePendingMessage` function in `LocalAgentTask.tsx` injects messages directly into the agent's message queue, bypassing the filesystem entirely. This is a significant optimization: in-process teammates have sub-millisecond message delivery, while tmux-based teammates have delivery latency bounded by their turn duration.

### Transport 2: Unix Domain Sockets (UDS_INBOX)

Behind the `UDS_INBOX` feature flag, Claude Code implements peer-to-peer messaging over Unix Domain Sockets. This is a fundamentally different transport from the mailbox system.

```typescript
// From main.tsx — socket path construction
const messagingSocketPath = feature('UDS_INBOX') ? (options as {
  messagingSocketPath?: string
}).messagingSocketPath : undefined
```

Each Claude Code instance creates a UDS listener at a path like `/tmp/cc-socks/{pid}.sock` or a custom path passed via `--messaging-socket-path`. The socket name follows the pattern established in the swarm constants:

```typescript
// From utils/swarm/constants.ts
export function getSwarmSocketName(): string {
  return `claude-swarm-${process.pid}`
}
```

UDS provides three advantages over file-based mailboxes:

1. **Zero polling.** UDS is event-driven. When a message arrives, the kernel notifies the receiving process immediately. No filesystem polling, no wasted I/O cycles, no latency gap between message send and message receive.

2. **Bidirectional.** A single socket connection supports both send and receive. The sender connects, writes a message, and can immediately read a response on the same connection. This makes request/response patterns natural and efficient.

3. **No serialization overhead.** File-based mailboxes require reading the entire inbox, parsing JSON, appending, serializing, and writing back. UDS streams raw bytes. For high-frequency messaging (e.g., progress updates every second), this eliminates significant overhead.

The `SendMessage` tool checks for UDS addresses using a scheme parser:

```typescript
// From SendMessageTool.ts
if (feature('UDS_INBOX') && parseAddress(input.to).scheme === 'bridge') {
  // Route via bridge transport
}
```

The addressing scheme supports three formats:
- `"researcher"` — teammate name, routes through mailbox
- `"uds:/path/to/socket"` — direct UDS connection to a local peer
- `"bridge:session_id"` — remote control peer via Bridge transport

Peer discovery uses the `/peers` command (gated behind `UDS_INBOX`):

```typescript
// From commands.ts
const peersCmd = feature('UDS_INBOX')
  // Lists discoverable peers and their socket paths
```

When a message arrives over UDS, it is wrapped in an XML envelope for the receiving agent:

```xml
<cross-session-message from="uds:/tmp/cc-socks/1234.sock">
  Check if tests pass over there
</cross-session-message>
```

The `from` attribute enables reply routing — the recipient copies the `from` value into the `to` field of its response, establishing a bidirectional conversation over UDS.

**Delivery guarantees:** UDS provides reliable, in-order delivery within a connection. If the connection drops (recipient crashes), the sender gets an immediate error. This is strictly stronger than file-based mailboxes, where a crashed recipient leaves orphaned inbox files with no delivery failure signal.

### Transport 3: MCP as Communication Backbone

The Model Context Protocol (MCP) is Claude Code's plugin and extension mechanism, but it doubles as a communication transport. Each CLI can run as both an MCP server (exposing tools to other CLIs) and an MCP client (calling tools on other CLIs).

MCP supports three wire protocols:

| Protocol | Use Case | Latency | Deployment |
|----------|----------|---------|------------|
| **stdio** | Local CLIs, same machine | ~1ms | Parent spawns child process |
| **HTTP/SSE** | Remote CLIs, cross-machine | ~50-200ms | HTTP server + Server-Sent Events |
| **WebSocket** | Real-time, bidirectional | ~5-20ms | Bridge/remote sessions |

For multi-CLI communication, MCP's power is that it makes tool invocation the messaging primitive. Instead of sending a text message that says "run the security audit," CLI A calls the `security_audit` tool exposed by CLI B's MCP server. The tool parameters are the message payload. The tool result is the response.

This collapses the distinction between "sending a message" and "invoking a capability." It is the most natural communication model for AI agents, which already think in terms of tool calls.

Claude Code's MCP server entry point (`mcp.ts`) exposes the CLI as a callable service:

```
CLI Entry → main.tsx (interactive TUI)
MCP Entry → mcp.ts  (stdio-based MCP server)
HTTP Entry → server/ (WebSocket + HTTP)
```

In a multi-CLI architecture, you can wire CLIs together via MCP:

```json
// .claude/mcp-config.json on the Orchestrator CLI
{
  "mcpServers": {
    "security-cli": {
      "command": "claude",
      "args": ["--mcp"],
      "env": { "CLAUDE_CODE_SECURITY_MODE": "true" }
    },
    "qa-cli": {
      "command": "claude",
      "args": ["--mcp"],
      "env": { "CLAUDE_CODE_QA_MODE": "true" }
    }
  }
}
```

Each spawned MCP server is a fully functional Claude Code instance, running headless, exposing its tools via stdio. The Orchestrator calls their tools as if they were local tools, but each call executes in a separate process with a separate context window.

---

## 15.4 The Typed Message Envelope

Raw strings are not enough for production multi-CLI systems. You need structured messages with metadata for routing, correlation, error handling, and debugging. This section defines a complete message envelope.

### The Problem with Unstructured Messages

Consider this sequence:

1. Orchestrator sends Coder: "Implement the auth middleware"
2. Coder sends Orchestrator: "Done, see commit abc123"
3. Orchestrator sends Security: "Audit commit abc123"
4. Security sends Orchestrator: "Found 3 critical issues"
5. Orchestrator sends Coder: "Fix these 3 issues: ..."

Without correlation IDs, message 5 is ambiguous — which task does it refer to? If the Coder is working on multiple tasks, it cannot distinguish "fix these auth issues" from "fix these rate limiting issues." The Orchestrator knows the context, but the context is implicit in the conversation history, not explicit in the message.

### The Envelope Schema

Here is a complete typed message envelope, derived from Claude Code's `StructuredMessage` pattern and extended for multi-CLI systems:

```typescript
interface MessageEnvelope {
  // Identity
  id: string                    // UUID v4, globally unique
  correlationId?: string        // Links related messages (request → response)
  causationId?: string          // ID of the message that caused this one

  // Routing
  sender: {
    agentId: string             // Unique agent identifier
    agentName: string           // Human-readable name ("researcher")
    teamName: string            // Team this agent belongs to
    sessionId?: string          // Claude Code session ID
    color?: string              // Display color for UI
  }
  recipient: {
    agentName: string           // Target agent name, or "*" for broadcast
    teamName?: string           // Cross-team messaging
    socketPath?: string         // UDS direct address
    bridgeId?: string           // Remote bridge session
  }

  // Payload
  type: MessageType
  payload: Record<string, unknown>
  summary?: string              // 5-10 word human-readable preview

  // Metadata
  timestamp: string             // ISO 8601
  ttl?: number                  // Time-to-live in seconds
  priority: 'low' | 'normal' | 'high' | 'critical'
  requiresResponse: boolean     // Hint for request/response vs fire-and-forget

  // Delivery
  deliveryAttempts: number      // How many times delivery was attempted
  maxRetries: number            // Maximum delivery attempts before dead-letter
  acknowledgedAt?: string       // When the recipient acknowledged receipt
}

type MessageType =
  | 'task_assignment'           // Orchestrator → specialist
  | 'task_update'               // Progress report
  | 'task_completed'            // Specialist → orchestrator
  | 'query'                     // Request/response question
  | 'query_response'            // Answer to a query
  | 'broadcast'                 // One-to-many announcement
  | 'shutdown_request'          // Graceful shutdown coordination
  | 'shutdown_response'         // Shutdown ack/nak
  | 'plan_approval_request'     // Teammate → lead for plan review
  | 'plan_approval_response'    // Lead → teammate with approval/feedback
  | 'error'                     // Error propagation
  | 'heartbeat'                 // Liveness check
  | 'heartbeat_ack'             // Liveness response
```

And the corresponding JSON instance:

```json
{
  "id": "msg_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "correlationId": "task_auth-middleware-impl",
  "causationId": "msg_00000000-0000-0000-0000-000000000001",
  "sender": {
    "agentId": "agent_sec_01",
    "agentName": "security-auditor",
    "teamName": "api-build",
    "sessionId": "session_xyz789",
    "color": "red"
  },
  "recipient": {
    "agentName": "team-lead"
  },
  "type": "error",
  "payload": {
    "severity": "critical",
    "cwe": "CWE-89",
    "file": "src/routes/auth.ts",
    "line": 47,
    "description": "SQL injection in login query — user input concatenated directly",
    "recommendation": "Use parameterized queries via prepared statements"
  },
  "summary": "Critical SQLi in auth.ts:47",
  "timestamp": "2026-04-15T14:32:07.123Z",
  "priority": "critical",
  "requiresResponse": true,
  "deliveryAttempts": 1,
  "maxRetries": 3
}
```

The `correlationId` field is the key to tracing message flows across multiple agents. When the Orchestrator dispatches a task, it generates a `correlationId` (e.g., `task_auth-middleware-impl`). Every subsequent message related to that task — progress reports, queries, error notifications, completion — carries the same `correlationId`. This enables:

- **Conversation threading:** Group all messages about a single task
- **Latency measurement:** Time from task dispatch to task completion
- **Failure analysis:** Trace the chain of messages that led to an error
- **Audit logging:** Complete record of every decision and communication for a task

The `causationId` goes further — it creates a causal chain. Message B was caused by Message A. Message C was caused by Message B. This lets you reconstruct the exact sequence of events that led to any outcome, which is invaluable for debugging multi-agent failures.

---

## 15.5 Task List Coordination and File Locking

Claude Code's agent-teams feature solves one of the hardest problems in multi-CLI coordination: shared mutable state. The task list — a directory of JSON files at `~/.claude/tasks/{team-name}/` — is read and written by every agent in the swarm simultaneously. Without careful coordination, this creates classic concurrency bugs: lost updates, phantom reads, and double-claimed tasks.

### The Task Schema

Each task is a standalone JSON file, enabling file-level locking without blocking access to other tasks:

```typescript
// From utils/tasks.ts
type Task = {
  id: string              // Monotonically increasing, e.g., "1", "2", "3"
  subject: string         // Short title
  description: string     // Detailed description
  activeForm?: string     // Present continuous for spinner ("Running tests")
  owner?: string          // Agent name who claimed this task
  status: 'pending' | 'in_progress' | 'completed'
  blocks: string[]        // Task IDs this task blocks
  blockedBy: string[]     // Task IDs that block this task
  metadata?: Record<string, unknown>
}
```

The `blocks`/`blockedBy` fields create a dependency DAG. A task cannot be claimed until all tasks in its `blockedBy` array are `completed`. This is enforced at claim time with atomic file locking.

### The Atomic Claim Protocol

When an agent wants to claim a task, it must do so atomically to prevent two agents from claiming the same task:

```typescript
// Simplified from utils/tasks.ts — claimTask()
async function claimTask(taskListId, taskId, claimantAgentId) {
  const taskPath = getTaskPath(taskListId, taskId)
  
  // 1. Acquire exclusive lock on the task file
  const release = await lockfile.lock(taskPath, LOCK_OPTIONS)
  
  try {
    // 2. Read current task state (under lock)
    const task = await getTask(taskListId, taskId)
    
    // 3. Validate: not already claimed, not completed, not blocked
    if (task.owner && task.owner !== claimantAgentId) {
      return { success: false, reason: 'already_claimed' }
    }
    if (task.status === 'completed') {
      return { success: false, reason: 'already_resolved' }
    }
    
    // 4. Check dependency DAG — all blockers must be completed
    const allTasks = await listTasks(taskListId)
    const unresolvedIds = new Set(
      allTasks.filter(t => t.status !== 'completed').map(t => t.id)
    )
    const blockers = task.blockedBy.filter(id => unresolvedIds.has(id))
    if (blockers.length > 0) {
      return { success: false, reason: 'blocked', blockedByTasks: blockers }
    }
    
    // 5. Claim the task
    await updateTask(taskListId, taskId, { owner: claimantAgentId })
    return { success: true }
  } finally {
    // 6. Release lock — ALWAYS, even if an error occurred
    await release()
  }
}
```

The lock budget is deliberately generous: 30 retries with exponential backoff from 5ms to 100ms. The comment in the source explains why:

> Budget sized for ~10+ concurrent swarm agents: each critical section does readdir + N×readFile + writeFile (~50-100ms on slow disks), so the last caller in a 10-way race needs ~900ms. retries=30 gives ~2.6s total wait.

This means the system can handle bursts of up to 10 agents simultaneously trying to claim tasks, with the worst-case agent waiting about 2.6 seconds. For swarms larger than 10, you would need to increase the retry budget or switch to a different coordination mechanism (e.g., a centralized task broker).

### The Busy-Check Optimization

Claude Code goes further with `claimTaskWithBusyCheck`, which prevents an agent from claiming a new task when it already owns an unfinished one. This requires a task-list-level lock (not just a task-level lock) to atomically read all tasks and check the agent's ownership status:

```typescript
async function claimTaskWithBusyCheck(taskListId, taskId, claimantAgentId) {
  const lockPath = await ensureTaskListLockFile(taskListId)
  const release = await lockfile.lock(lockPath, LOCK_OPTIONS)
  
  try {
    // Read ALL tasks atomically
    const allTasks = await listTasks(taskListId)
    
    // Check if agent already owns an unfinished task
    const busyTask = allTasks.find(t => 
      t.owner === claimantAgentId && 
      t.status !== 'completed'
    )
    if (busyTask) {
      return { success: false, reason: 'agent_busy', busyTask }
    }
    
    // ... proceed with normal claim logic
  } finally {
    await release()
  }
}
```

This prevents a common failure mode in agent swarms: an agent that claims multiple tasks, context-switches between them, and does a poor job on all of them because its context window is split. The one-task-at-a-time constraint keeps agents focused.

### High Water Mark: Preventing ID Reuse

When a swarm is reset (e.g., the team lead creates a new team), all task files are deleted. But the next swarm's tasks should not reuse IDs from the previous swarm — this would create confusion in logs and audit trails. Claude Code solves this with a high water mark file:

```typescript
// Before deleting all tasks, record the highest ID ever used
const currentHighest = await findHighestTaskIdFromFiles(taskListId)
if (currentHighest > 0) {
  const existingMark = await readHighWaterMark(taskListId)
  if (currentHighest > existingMark) {
    await writeHighWaterMark(taskListId, currentHighest)
  }
}
```

The high water mark is stored in `.highwatermark` — a simple text file containing a single integer. New task IDs start from `highWaterMark + 1`, ensuring global uniqueness across swarm resets.

---

## 15.6 TEAMMATE Tools: The Communication API

Claude Code exposes inter-agent communication through a set of tools that agents call during their normal tool-use loop. These are not system-level primitives — they are LLM-callable tools, which means the agent *decides* when and how to communicate based on its understanding of the situation.

### SendMessage

The primary communication tool. Its input schema accepts three fields:

```typescript
const inputSchema = z.object({
  to: z.string(),       // Recipient: name, "*", "uds:path", or "bridge:id"
  summary: z.string().optional(),  // 5-10 word UI preview
  message: z.union([
    z.string(),         // Plain text
    StructuredMessage   // Protocol message (shutdown, plan approval)
  ]),
})
```

The routing logic inside `SendMessage` is surprisingly complex. It must handle five different recipient types:

1. **Teammate name** → look up in team config, write to mailbox file
2. **Broadcast (`*`)** → iterate all teammates, write to each mailbox
3. **UDS path** → open Unix Domain Socket connection, stream message
4. **Bridge session** → route through Bridge transport to remote peer
5. **In-process agent** → inject directly into agent's message queue via `queuePendingMessage`

The last case is the most interesting. In-process teammates (spawned within the same Node.js process) don't use the filesystem at all for messaging. Messages are passed through an in-memory queue, which means delivery is synchronous and zero-overhead:

```typescript
// From tasks/LocalAgentTask/LocalAgentTask.tsx
// Messages queued mid-turn via SendMessage, drained at tool-round boundaries
```

This creates a two-tier messaging architecture: fast in-memory messaging for co-located agents, slower file-based messaging for tmux-pane agents. The `SendMessage` tool abstracts this distinction — the sending agent doesn't need to know which transport will be used.

### TeamCreate

Creates a team, which implicitly creates both a team config file and a shared task list:

```typescript
// From TeamCreateTool.ts
export const TeamCreateTool: Tool<InputSchema, Output> = buildTool({
  searchHint: 'create a multi-agent swarm team',
  // ...
})
```

The tool creates:
- `~/.claude/teams/{team-name}/config.json` — team membership, colors, metadata
- `~/.claude/tasks/{team-name}/` — shared task directory

The team config (`TeamFile`) contains the membership roster:

```typescript
type TeamFile = {
  name: string
  description?: string
  createdAt: number
  leadAgentId: string
  leadSessionId?: string
  members: Array<{
    agentId: string
    name: string
    agentType?: string
    model?: string
    prompt?: string
    color?: string
    planModeRequired?: boolean
    joinedAt: number
    tmuxPaneId: string
    cwd: string
    worktreePath?: string
    sessionId?: string
    subscriptions: string[]
    backendType?: BackendType  // 'tmux' | 'iterm2' | 'in-process'
    isActive?: boolean
    mode?: PermissionMode
  }>
}
```

This is the team's source of truth. Agents discover each other by reading this file. The `backendType` field determines which transport is used for messaging: `in-process` agents get memory queue delivery, `tmux` and `iterm2` agents get file-based mailbox delivery.

### Coordinator Mode Tools

When `CLAUDE_CODE_COORDINATOR_MODE=true`, the team lead operates with a restricted tool set designed for orchestration, not implementation:

```
Allowed Tools in Coordinator Mode:
  AgentTool, TaskStop, SendMessage, SyntheticOutput,
  TeamCreate, TeamDelete
```

The coordinator cannot edit files, run bash commands, or make git commits. It can only spawn agents, send messages, create/delete teams, and manage tasks. This restriction is deliberate — it forces the coordinator to delegate all implementation work, preventing the common failure mode where an orchestrator tries to "help" by making changes directly and creating conflicts with the specialists.

---

## 15.7 Multi-CLI Coordination: A Complete Walkthrough

Let us trace a complete multi-CLI coordination scenario from initial request to final delivery, showing every message exchanged and every transport used.

### The Scenario

User types to the Orchestrator: "Build a user authentication API with JWT, rate limiting, and tests."

### Phase 1: Team Creation and Task Planning

The Orchestrator calls `TeamCreate`:

```json
{
  "team_name": "auth-api-build",
  "description": "Build user auth API with JWT, rate limiting, tests"
}
```

This creates:
- `~/.claude/teams/auth-api-build/config.json`
- `~/.claude/tasks/auth-api-build/`

The Orchestrator then creates tasks using `TaskCreate`:

```
Task 1: "Research JWT libraries" (no dependencies)
Task 2: "Design API schema" (no dependencies)
Task 3: "Implement auth routes" (blocked by 1, 2)
Task 4: "Add rate limiting middleware" (blocked by 3)
Task 5: "Security audit" (blocked by 3, 4)
Task 6: "Write integration tests" (blocked by 3)
Task 7: "Generate API documentation" (blocked by 3, 4, 5, 6)
```

### Phase 2: Agent Spawning

The Orchestrator spawns teammates via `AgentTool`:

```typescript
// Spawning a tmux-based teammate
Agent({
  name: "researcher",
  team_name: "auth-api-build",
  subagent_type: "general-purpose",
  prompt: "You are the research specialist for team auth-api-build."
})
```

The spawning logic in `spawnMultiAgent.ts` determines the backend:

```typescript
// From tools/shared/spawnMultiAgent.ts
// Creates a pane in the swarm view:
// - Inside user's tmux session: splits current window
// - Inside iTerm2: creates a new tab
// - Outside both: creates claude-swarm session with tiled teammates
```

Each spawned teammate receives its initial instructions via mailbox, not via command-line prompt:

```typescript
// Note: We spawn without a prompt - initial instructions are sent via mailbox
```

This is a deliberate design choice. Command-line arguments have length limits and escaping challenges. The mailbox has no such constraints — the initial instruction can be arbitrarily long and contain any characters.

### Phase 3: Parallel Task Execution

Tasks 1 and 2 have no dependencies, so two agents claim them simultaneously:

**Researcher** claims Task 1 (JWT research):
```
claimTask("auth-api-build", "1", "researcher")
→ Lock acquired on task-1.json
→ No blockers, no existing owner
→ Claimed successfully
→ Lock released
```

**Planner** claims Task 2 (API schema design):
```
claimTask("auth-api-build", "2", "planner")
→ Lock acquired on task-2.json
→ No blockers, no existing owner
→ Claimed successfully
→ Lock released
```

Both agents work in parallel. When Researcher completes Task 1:

```
TaskUpdate({ id: "1", status: "completed" })
→ Writes completion to task-1.json
→ Notifies via tasksUpdated signal
```

The Orchestrator sees the completion and sends a follow-up:

```json
{
  "to": "implementer",
  "summary": "JWT research complete",
  "message": "Task 1 complete. Research found: passport-jwt recommended over jsonwebtoken for Express. See task 1 results for details. Check TaskList for available work."
}
```

### Phase 4: Dependency Resolution

Task 3 (implement auth routes) is blocked by Tasks 1 and 2. When both complete, Task 3 becomes claimable. The Implementer checks the task list, sees Task 3 is unblocked, and claims it:

```
claimTask("auth-api-build", "3", "implementer")
→ Lock acquired
→ blockedBy: ["1", "2"] — both completed ✓
→ Claimed successfully
```

### Phase 5: Error Propagation

The Implementer crashes mid-task — the tmux pane dies. The Orchestrator detects this through the idle notification system: when a teammate's turn ends normally, it sends an idle notification. When a teammate crashes, no notification arrives.

The Orchestrator detects the missing heartbeat and takes action:

```json
{
  "to": "*",
  "summary": "implementer crashed, reassigning",
  "message": "Implementer crashed during Task 3. Spawning replacement. Do not claim Task 3."
}
```

The Orchestrator spawns a new Implementer, which reads the partially completed state from the shared filesystem and resumes.

### Phase 6: Shutdown

When all tasks are complete, the Orchestrator initiates graceful shutdown:

```json
{
  "to": "*",
  "message": { "type": "shutdown_request", "reason": "All tasks completed" }
}
```

Each teammate responds:

```json
{
  "to": "team-lead",
  "message": {
    "type": "shutdown_response",
    "request_id": "req_abc123",
    "approve": true
  }
}
```

When the Orchestrator receives approval from all teammates, it calls `TeamDelete` to clean up.

---

## 15.8 Error Propagation Patterns

Failures in multi-CLI systems are fundamentally different from single-process failures. An unhandled exception in a single process crashes that process. An unhandled failure in a multi-CLI system can cascade: one CLI's crash orphans tasks, confuses collaborators, and leaves the system in a state that no single CLI can diagnose.

### Failure Taxonomy

Multi-CLI systems face four categories of failure:

**1. Agent Crash** — The CLI process terminates unexpectedly. Causes: OOM, segfault in native module, `kill -9`, laptop lid close. The agent's pending work is lost. Its claimed tasks remain claimed but will never complete.

**Detection:** Heartbeat timeout. The Orchestrator expects periodic messages (idle notifications) from each teammate. If no message arrives within a threshold (e.g., 2× the expected turn duration), the agent is presumed dead.

**Recovery:** The Orchestrator broadcasts a warning, spawns a replacement agent, and reassigns the orphaned task. The replacement reads the current state from the shared task list and filesystem.

**2. Agent Confusion** — The agent is alive but doing the wrong thing. Its context is corrupted, or it hallucinated a different task, or it's stuck in a loop. This is unique to AI agent systems — deterministic processes don't get confused.

**Detection:** Task progress monitoring. If an agent has been working on a task for significantly longer than expected with no status updates, the Orchestrator sends a query:

```json
{
  "to": "implementer",
  "summary": "progress check",
  "message": "You've been on Task 3 for 15 minutes with no update. What's your status?"
}
```

**Recovery:** If the agent responds coherently, continue. If the response is incoherent, force-stop the agent via `TaskStop` and reassign.

**3. Dependency Deadlock** — Circular dependencies in the task graph prevent any task from becoming claimable. Task A is blocked by Task B, and Task B is blocked by Task A.

**Detection:** The Orchestrator periodically checks for cycles in the dependency DAG. Any task that has been `pending` for longer than expected without being claimable triggers a deadlock check.

**Recovery:** Break the cycle by removing one dependency edge and explicitly instructing an agent to proceed despite the broken dependency.

**4. Communication Failure** — Messages are lost, delayed, or corrupted. The mailbox file is corrupted by a partial write. The UDS socket is closed unexpectedly. A tmux pane is killed without the agent being notified.

**Detection:** Acknowledgment timeouts for request/response messages. Mailbox integrity checks (validate JSON parsing after read). UDS connection error handlers.

**Recovery:** Retry with exponential backoff. If retries exhaust, escalate to the Orchestrator. The Orchestrator can use alternative communication channels (e.g., switch from mailbox to UDS, or vice versa).

### Error Message Format

When an agent detects an error, it propagates it using the `error` message type:

```json
{
  "type": "error",
  "payload": {
    "errorCode": "TASK_TIMEOUT",
    "severity": "warning",
    "taskId": "3",
    "agentName": "implementer",
    "description": "Task 3 exceeded 10-minute timeout",
    "stackTrace": null,
    "suggestedAction": "Check agent status and consider reassignment"
  },
  "priority": "high",
  "requiresResponse": true
}
```

The `suggestedAction` field is critical — it gives the receiving agent a hint about what to do, reducing the chance that the receiver's LLM will choose an inappropriate response.

---

## 15.9 Protocol Specification

This section defines the complete Inter-CLI Communication Protocol (ICCP) as a formal specification.

### Message Routing Rules

1. **Name resolution:** Recipient names are resolved against the team config file. If the name is not found, the message is rejected with `RECIPIENT_NOT_FOUND`.

2. **Broadcast expansion:** Messages to `"*"` are expanded to N individual messages, one per teammate (excluding the sender). Each message is delivered independently — partial broadcast failure is possible.

3. **Transport selection:** The sender specifies the transport implicitly through the address format:
   - Bare name → file mailbox
   - `uds:` prefix → Unix Domain Socket
   - `bridge:` prefix → Bridge relay

4. **Priority handling:** Messages are processed in FIFO order within a priority level. `critical` messages preempt `normal` messages at the next tool-round boundary.

5. **TTL enforcement:** Messages with expired TTL are discarded without delivery. The TTL countdown begins at the `timestamp` in the envelope.

### Delivery Guarantees

| Transport | Guarantee | Ordering | Failure Signal |
|-----------|-----------|----------|----------------|
| Mailbox | At-most-once | FIFO per sender | Silent (no error if inbox missing) |
| UDS | Exactly-once | FIFO within connection | Connection error callback |
| MCP (stdio) | Exactly-once | FIFO | Process exit code |
| MCP (HTTP/SSE) | At-most-once | FIFO | HTTP error code |

The mailbox transport provides at-most-once delivery because there is no acknowledgment mechanism. A message written to a mailbox file may never be read if the recipient crashes between writes and reads. For critical messages, use UDS or require explicit acknowledgment via a response message.

### Protocol Versioning

The message envelope includes no explicit version field in Claude Code's current implementation. For production systems, add a `protocolVersion` field:

```json
{
  "protocolVersion": "1.0.0",
  "id": "msg_...",
  ...
}
```

Version negotiation follows semantic versioning rules:
- **Patch version** differences (1.0.0 vs 1.0.1): fully compatible, no negotiation needed
- **Minor version** differences (1.0.0 vs 1.1.0): backward compatible, new fields ignored by older agents
- **Major version** differences (1.0.0 vs 2.0.0): incompatible, requires protocol bridge or agent upgrade

When an agent receives a message with a higher major version, it should respond with an error:

```json
{
  "type": "error",
  "payload": {
    "errorCode": "PROTOCOL_VERSION_MISMATCH",
    "supportedVersions": ["1.0.0", "1.1.0"],
    "receivedVersion": "2.0.0"
  }
}
```

### Message Type Registry

| Type | Direction | Response Required | Description |
|------|-----------|-------------------|-------------|
| `task_assignment` | Lead → Agent | No | Assign work to an agent |
| `task_update` | Agent → Lead | No | Progress report |
| `task_completed` | Agent → Lead | No | Task finished successfully |
| `query` | Any → Any | Yes | Request information |
| `query_response` | Any → Any | No | Answer to a query |
| `broadcast` | Any → All | No | System-wide announcement |
| `shutdown_request` | Lead → Agent | Yes | Request graceful shutdown |
| `shutdown_response` | Agent → Lead | No | Accept/reject shutdown |
| `plan_approval_request` | Agent → Lead | Yes | Submit plan for review |
| `plan_approval_response` | Lead → Agent | No | Approve/reject with feedback |
| `error` | Any → Any | Depends on severity | Error notification |
| `heartbeat` | Lead → Agent | Yes | Liveness check |
| `heartbeat_ack` | Agent → Lead | No | Confirmation of liveness |

---

## 15.10 Protocol Evolution

Communication protocols ossify fast. The first version works for your current needs. Then requirements change — you need encryption, you need compression, you need cross-machine routing — and the protocol becomes a bottleneck. Designing for evolution from the start saves months of retrofitting later.

### Extensibility Points

The message envelope is designed with three extensibility points:

**1. The `metadata` field.** Any message can carry arbitrary key-value metadata without breaking the schema. Use this for experimental features, debugging flags, tracing headers, and A/B test markers:

```json
{
  "metadata": {
    "traceId": "trace_abc123",
    "experiment": "fast-routing-v2",
    "debugLevel": "verbose"
  }
}
```

Agents that don't understand a metadata key ignore it. This is the safest extension mechanism because it cannot break existing behavior.

**2. New message types.** The `MessageType` union can be extended without breaking existing agents. An agent that receives an unknown message type should log it and respond with an `error` message:

```json
{
  "type": "error",
  "payload": {
    "errorCode": "UNKNOWN_MESSAGE_TYPE",
    "receivedType": "capability_negotiation",
    "description": "This agent does not support capability_negotiation messages"
  }
}
```

The sender can then fall back to a supported message type. This is the standard approach for introducing new features — deploy the new message type, handle the fallback gracefully, and remove the fallback once all agents are upgraded.

**3. Transport plugins.** The addressing scheme (`name`, `uds:path`, `bridge:id`) is extensible. Adding a new transport (e.g., `mqtt:topic` for IoT deployments, `grpc:endpoint` for microservice deployments) requires:

- A new address parser in `parseAddress()`
- A transport implementation that handles connect/send/receive/disconnect
- Registration in the `SendMessage` routing logic

### From Local to Distributed

The protocol as described operates on a single machine. Extending to a distributed deployment requires three changes:

**1. Service discovery.** Replace the local team config file with a distributed registry (etcd, Consul, or a simple Redis hash). Each agent registers its address on startup and deregisters on shutdown.

**2. Serialization.** Local messages can use JSON with minimal overhead. Cross-network messages should use a compact binary format (Protocol Buffers, MessagePack) to reduce bandwidth and parsing latency.

**3. Authentication.** Local communication trusts process identity (the OS enforces that only the file owner can read a mailbox). Cross-network communication requires mutual authentication — TLS client certificates, JWT tokens, or API keys — to prevent unauthorized agents from joining the swarm.

### The Bridge Transport

Claude Code's `BRIDGE_MODE` feature already solves the distributed case for a specific topology: a user's local machine connecting to remote compute sessions. The bridge uses WebSocket transport with JWT-based authentication:

```
Local CLI ←→ WebSocket ←→ Remote CLI
            (TLS + JWT)
```

Messages sent via `bridge:session_id` addressing are relayed through this transport. The bridge handles reconnection, message buffering during disconnects, and session management.

For general-purpose distributed multi-CLI systems, the bridge pattern can be generalized: any two CLIs that share a bridge endpoint can communicate, regardless of network topology. The bridge becomes the message relay, and the protocol remains unchanged — only the transport layer changes.

---

## 15.11 Putting It All Together: The Communication Stack

Here is the complete communication stack for a production multi-CLI system, from the agent's perspective down to the wire:

```
┌─────────────────────────────────────────────────┐
│  Layer 5: Agent Decision                        │
│  LLM decides to call SendMessage tool           │
├─────────────────────────────────────────────────┤
│  Layer 4: Message Envelope                      │
│  Structured payload with routing + metadata     │
├─────────────────────────────────────────────────┤
│  Layer 3: Routing                               │
│  Name resolution → transport selection          │
├─────────────────────────────────────────────────┤
│  Layer 2: Transport                             │
│  Mailbox (file) │ UDS (socket) │ MCP │ Bridge   │
├─────────────────────────────────────────────────┤
│  Layer 1: Wire                                  │
│  Filesystem I/O │ Unix socket │ stdio │ WebSocket│
└─────────────────────────────────────────────────┘
```

Each layer is independent and replaceable. You can swap the transport without changing the envelope. You can add new message types without changing the routing. You can change the routing strategy without changing the agent's decision-making.

This layered architecture mirrors the OSI model — not because networking theory demands it, but because the same forces that drove network protocol designers to layer their stacks (independent evolution, testability, substitutability) apply equally to multi-agent communication.

Chapter 14 gave you shared memory — the ability for CLIs to read each other's state. This chapter gave you active communication — the ability for CLIs to direct each other's behavior. Together, they form the complete integration layer for multi-CLI systems.

But integration without orchestration is chaos. Eight CLIs communicating freely is eight CLIs generating eight conflicting plans. In Chapter 16, we turn to the question that binds everything together: who decides what happens next? The Orchestrator pattern — how one CLI becomes the conductor that turns a cacophony of specialists into a symphony.

---

*Next: Chapter 16 — Orchestration Patterns: From Conductor to Swarm Intelligence*
