# Appendix D: Protocol Specifications

---

Every distributed system eventually converges on the same uncomfortable truth: if you don't formalize your protocols, your protocols formalize themselves — usually as bugs.

The multi-CLI forge described in this book communicates through six core protocols. Each protocol defines the exact shape of every message, the state machine governing valid transitions, the error handling for every failure mode, and the timing constraints that separate a responsive system from a hung one. This appendix provides the formal specification for all six.

These specifications are derived from three sources: Claude Code's actual source code (the `SendMessageTool`, `TaskCreateTool`, and `TeamCreateTool` schemas), the shared memory bus architecture from Chapter 14, and the IPC patterns established in the orchestration layer. Where Claude Code's internal protocols served as inspiration, this appendix extends them into a complete multi-CLI coordination framework.

Every TypeScript interface in this appendix is compilable. Every JSON example validates against its interface. Every sequence diagram describes observable runtime behavior. This is a reference document — consult it when building, debugging, or extending the forge.

---

## D.1 Message Envelope Specification

All inter-CLI communication flows through a single envelope format. Every message — task assignments, memory operations, health checks, consensus votes, error reports — wraps its domain-specific payload in this envelope. The envelope provides routing, correlation, and lifecycle metadata that the transport layer processes without inspecting the payload.

### TypeScript Interface

```typescript
/**
 * Universal message envelope for all inter-CLI communication.
 * Inspired by Claude Code's SendMessage schema, extended for
 * multi-CLI coordination with correlation and TTL semantics.
 */
interface MessageEnvelope<T = unknown> {
  /** UUIDv4 — unique per message instance */
  id: string;

  /** CLI identity of the sender (e.g., "coder-cli", "security-auditor") */
  sender: string;

  /** CLI identity of the recipient, or "*" for broadcast */
  recipient: string;

  /** 
   * Discriminated union tag that determines payload shape.
   * Transport layer uses this for routing without deserializing payload.
   */
  type: MessageType;

  /** Domain-specific payload — shape determined by `type` */
  payload: T;

  /**
   * Links related messages into a conversation.
   * All messages in a task lifecycle share the same correlationId.
   * Set to the original message's `id` for request-response pairs.
   */
  correlationId: string;

  /** ISO 8601 timestamp of message creation */
  timestamp: string;

  /** 
   * Time-to-live in milliseconds. Message is discarded if undelivered
   * after `ttl` ms from `timestamp`. Default: 30000 (30 seconds).
   * Set to 0 for infinite TTL (memory writes, consensus votes).
   */
  ttl: number;

  /** Monotonically increasing per-sender, enables ordering guarantees */
  sequenceNumber: number;

  /** Optional metadata — tracing IDs, priority hints, debug flags */
  metadata?: Record<string, string>;
}

type MessageType =
  | 'task.assign'
  | 'task.accept'
  | 'task.progress'
  | 'task.complete'
  | 'task.reject'
  | 'task.cancel'
  | 'memory.write'
  | 'memory.read'
  | 'memory.subscribe'
  | 'memory.notify'
  | 'memory.conflict'
  | 'consensus.propose'
  | 'consensus.vote'
  | 'consensus.result'
  | 'health.heartbeat'
  | 'health.status'
  | 'health.failure'
  | 'error.report'
  | 'error.escalate'
  | 'shutdown.request'
  | 'shutdown.response';
```

### JSON Example

```json
{
  "id": "msg-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "sender": "orchestrator",
  "recipient": "coder-cli",
  "type": "task.assign",
  "payload": {
    "taskId": "task-0042",
    "title": "Implement JWT refresh endpoint",
    "priority": "high",
    "constraints": {
      "maxTokenBudget": 50000,
      "timeoutMs": 300000,
      "requiredTools": ["Edit", "Bash", "Read"]
    }
  },
  "correlationId": "saga-jwt-auth-impl",
  "timestamp": "2025-07-15T14:32:00.000Z",
  "ttl": 30000,
  "sequenceNumber": 147,
  "metadata": {
    "traceId": "trace-9f8e7d6c",
    "priority": "high"
  }
}
```

### Envelope Validation Rules

1. **`id`** must be a valid UUIDv4. Duplicate IDs are silently dropped by the transport.
2. **`sender`** must match a registered CLI identity. Messages from unknown senders are rejected with `error.report`.
3. **`recipient`** of `"*"` triggers broadcast delivery to all registered CLIs except the sender.
4. **`ttl`** countdown begins at `timestamp`, not at receipt time. A message arriving after its TTL expires is dead-lettered.
5. **`sequenceNumber`** is per-sender. Recipients detect gaps and request retransmission via `error.report` with `code: "SEQUENCE_GAP"`.

---

## D.2 Task Assignment Protocol

The task assignment protocol governs the complete lifecycle of work delegation from the Orchestrator to a specialist CLI. It mirrors Claude Code's `TaskCreate` → `TaskUpdate` flow but adds acceptance negotiation and structured progress reporting.

### TypeScript Interfaces

```typescript
interface TaskAssignment {
  taskId: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignee: string;
  dependencies: string[];       // taskIds that must complete first
  constraints: TaskConstraints;
  context: TaskContext;
}

interface TaskConstraints {
  maxTokenBudget: number;       // max tokens the CLI may consume
  timeoutMs: number;            // hard deadline from assignment
  requiredTools: string[];      // tools the CLI must have available
  forbiddenPaths?: string[];    // files the CLI must not modify
  reviewRequired?: boolean;     // must pass review before completion
}

interface TaskContext {
  relatedFiles: string[];       // files relevant to the task
  parentTaskId?: string;        // if this is a subtask
  memoryKeys?: string[];        // shared memory keys to preload
  previousAttempts?: number;    // retry count for failed tasks
}

interface TaskAcceptance {
  taskId: string;
  accepted: boolean;
  estimatedTokens?: number;     // CLI's estimate of token cost
  estimatedDurationMs?: number; // CLI's estimate of wall time
  rejectionReason?: string;     // required if accepted === false
}

interface TaskProgress {
  taskId: string;
  phase: 'analyzing' | 'planning' | 'implementing' | 'testing' | 'reviewing';
  percentComplete: number;      // 0-100
  tokensConsumed: number;
  filesModified: string[];
  summary: string;              // human-readable progress note
  blockers?: string[];          // issues preventing progress
}

interface TaskCompletion {
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  result?: TaskResult;
  error?: ErrorDetail;
  metrics: TaskMetrics;
}

interface TaskResult {
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
  testsAdded: number;
  testsPassed: number;
  summary: string;
}

interface TaskMetrics {
  totalTokens: number;
  wallTimeMs: number;
  toolInvocations: number;
  retryCount: number;
}
```

### Sequence Diagram

```
Orchestrator                    Coder CLI                      Reviewer CLI
    │                              │                               │
    │──── task.assign ────────────>│                               │
    │     {taskId, constraints}    │                               │
    │                              │                               │
    │<──── task.accept ────────────│                               │
    │     {accepted: true,         │                               │
    │      estimatedTokens: 8000}  │                               │
    │                              │                               │
    │<──── task.progress ──────────│                               │
    │     {phase: "analyzing",     │                               │
    │      percentComplete: 15}    │                               │
    │                              │                               │
    │<──── task.progress ──────────│                               │
    │     {phase: "implementing",  │                               │
    │      percentComplete: 60,    │                               │
    │      filesModified: [...]}   │                               │
    │                              │                               │
    │<──── task.progress ──────────│                               │
    │     {phase: "testing",       │                               │
    │      percentComplete: 85}    │                               │
    │                              │                               │
    │<──── task.complete ──────────│                               │
    │     {status: "completed",    │                               │
    │      result: {summary: ...}} │                               │
    │                              │                               │
    │──── task.assign ───────────────────────────────────────────>│
    │     {taskId: "review-0042",                                  │
    │      context: {relatedFiles: [...]}}                         │
    │                              │                               │
```

### State Machine

```
                    ┌──────────┐
        assign      │          │    reject
    ┌──────────────>│ ASSIGNED ├──────────────┐
    │               │          │              │
    │               └────┬─────┘              ▼
    │                    │ accept        ┌──────────┐
    │                    │               │ REJECTED │
    │                    ▼               └──────────┘
    │               ┌──────────┐
    │               │ ACCEPTED │
    │               └────┬─────┘
    │                    │ progress
    │                    ▼
┌───┴────┐         ┌───────────┐    cancel    ┌───────────┐
│PENDING │         │IN_PROGRESS├─────────────>│ CANCELLED │
└────────┘         └─────┬─────┘              └───────────┘
                         │
                    ┌────┴────┐
                    │         │
                    ▼         ▼
              ┌──────────┐ ┌────────┐
              │COMPLETED │ │ FAILED │
              └──────────┘ └────┬───┘
                                │ retry (if attempts < max)
                                └──────> PENDING
```

### Error Handling

- **Rejection**: If a CLI rejects a task (`accepted: false`), the Orchestrator reassigns to another capable CLI or escalates to the human operator. Rejections require a `rejectionReason`.
- **Timeout**: If no `task.accept` arrives within 10 seconds, the Orchestrator resends with `previousAttempts` incremented. After 3 attempts, the task is marked `FAILED` with `code: "ACCEPTANCE_TIMEOUT"`.
- **Budget Exceeded**: If `tokensConsumed` exceeds `maxTokenBudget`, the Orchestrator sends `task.cancel`. The CLI must checkpoint its work within 5 seconds.
- **Stale Progress**: If no `task.progress` arrives within 60 seconds during `IN_PROGRESS`, the Orchestrator sends a `health.status` probe. Two consecutive missed probes trigger `task.cancel`.

---

## D.3 Memory Bus Protocol

The memory bus protocol enables typed, scored, conflict-aware knowledge sharing across all CLIs. It builds on the shared memory architecture from Chapter 14, providing the wire format for all memory operations.

### TypeScript Interfaces

```typescript
interface MemoryWrite {
  key: string;
  value: string;
  type: MemoryType;
  importance: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  ttlMs?: number;              // memory auto-expires after this duration
  conflictPolicy: 'last_write_wins' | 'highest_importance' | 'merge' | 'reject';
}

type MemoryType =
  | 'decision'    // architectural decisions (owned by Architect CLI)
  | 'pattern'     // implementation patterns (owned by Coder CLI)
  | 'threat'      // security findings (owned by Security CLI)
  | 'feedback'    // review feedback (owned by Reviewer CLI)
  | 'test_intel'  // test coverage data (owned by QA CLI)
  | 'perf_data'   // performance metrics (owned by Perf CLI)
  | 'team_pref'   // shared team preferences
  | 'reference';  // general reference material

interface MemoryRead {
  key?: string;                 // exact key lookup
  type?: MemoryType;            // filter by type
  tags?: string[];              // filter by tags (AND)
  minImportance?: number;       // floor for importance score
  limit?: number;               // max results (default: 20)
  orderBy?: 'importance' | 'recency' | 'relevance';
}

interface MemorySubscription {
  subscriberId: string;
  filter: {
    types?: MemoryType[];       // memory types to watch
    keys?: string[];            // specific key patterns (glob)
    minImportance?: number;
  };
  deliveryMode: 'immediate' | 'batched';
  batchIntervalMs?: number;     // only for 'batched' mode
}

interface MemoryNotification {
  subscriptionId: string;
  event: 'created' | 'updated' | 'deleted' | 'conflict';
  memory: {
    key: string;
    value: string;
    type: MemoryType;
    importance: number;
    writtenBy: string;
    timestamp: string;
  };
  previousValue?: string;       // included on 'updated' events
}

interface MemoryConflict {
  key: string;
  existingValue: string;
  existingWriter: string;
  existingImportance: number;
  incomingValue: string;
  incomingWriter: string;
  incomingImportance: number;
  resolution: 'existing_kept' | 'incoming_accepted' | 'merged' | 'escalated';
  mergedValue?: string;
}
```

### JSON Example — Write with Conflict Detection

```json
{
  "id": "msg-write-001",
  "sender": "security-auditor",
  "recipient": "memory-bus",
  "type": "memory.write",
  "payload": {
    "key": "auth/jwt-signing-algorithm",
    "value": "RS256 required. ES256 acceptable. HS256 forbidden — shared secret cannot be rotated per-service.",
    "type": "threat",
    "importance": 5,
    "tags": ["authentication", "jwt", "cryptography"],
    "conflictPolicy": "highest_importance"
  },
  "correlationId": "saga-auth-hardening",
  "timestamp": "2025-07-15T14:35:00.000Z",
  "ttl": 0,
  "sequenceNumber": 23
}
```

### Sequence Diagram — Subscribe and Notify

```
Security CLI          Memory Bus            Coder CLI           Architect CLI
    │                     │                     │                    │
    │── memory.subscribe ─>│                     │                    │
    │   {types:["pattern"],│                     │                    │
    │    minImportance: 3} │                     │                    │
    │                      │                     │                    │
    │<── (ack, subId) ─────│                     │                    │
    │                      │                     │                    │
    │                      │<── memory.write ────│                    │
    │                      │   {key:"auth/token",│                    │
    │                      │    type:"pattern",  │                    │
    │                      │    importance: 4}   │                    │
    │                      │                     │                    │
    │<── memory.notify ────│                     │                    │
    │   {event:"created",  │                     │                    │
    │    memory:{key:       │                     │                    │
    │     "auth/token"...}}│                     │                    │
    │                      │                     │                    │
    │── memory.write ─────>│                     │                    │
    │   {key:"auth/token", │                     │                    │
    │    importance: 5,    │                     │                    │
    │    conflictPolicy:   │                     │                    │
    │     "highest_imp"}   │                     │                    │
    │                      │                     │                    │
    │                      │── memory.conflict ──────────────────────>│
    │                      │  {resolution:       │                    │
    │                      │   "incoming_accepted"}                   │
    │                      │                     │                    │
```

### Conflict Resolution Matrix

| Policy | Same Importance | Incoming Higher | Existing Higher |
|--------|----------------|-----------------|-----------------|
| `last_write_wins` | Incoming wins | Incoming wins | Incoming wins |
| `highest_importance` | Last write wins | Incoming wins | Existing kept |
| `merge` | Values concatenated | Incoming primary | Existing primary |
| `reject` | Write rejected | Write rejected | Write rejected |

When `merge` is selected and both values are JSON-parseable, the bus performs a deep merge with incoming values taking precedence for conflicting keys. Non-JSON values are concatenated with a `\n---\n` separator and a `[MERGED]` prefix.

---

## D.4 Consensus Protocol

When multiple CLIs must agree on a decision — which architecture to adopt, whether a security finding is a true positive, whether a refactor is worth the risk — the consensus protocol provides weighted voting with veto rights and timeout-based fallback.

### TypeScript Interfaces

```typescript
interface ConsensusProposal {
  proposalId: string;
  proposer: string;
  topic: string;
  description: string;
  options: ConsensusOption[];
  votingRules: VotingRules;
  deadline: string;             // ISO 8601 — votes after this are ignored
}

interface ConsensusOption {
  id: string;
  label: string;
  description: string;
}

interface VotingRules {
  /** Each CLI's vote weight. Omitted CLIs have weight 1.0 */
  weights: Record<string, number>;
  /** CLIs with veto power — a single "no" from these kills the proposal */
  vetoHolders: string[];
  /** Minimum total weight required for quorum */
  quorumWeight: number;
  /** Winning option needs this fraction of cast weight (default: 0.5) */
  threshold: number;
  /** What happens if deadline passes without quorum */
  timeoutPolicy: 'extend' | 'majority_wins' | 'proposer_decides' | 'escalate';
  /** Extension duration if timeoutPolicy is 'extend' */
  extensionMs?: number;
}

interface ConsensusVote {
  proposalId: string;
  voter: string;
  optionId: string;             // which option this CLI votes for
  confidence: number;           // 0.0-1.0 — how sure the CLI is
  rationale: string;            // required — no silent votes
  veto?: boolean;               // only valid from vetoHolders
  vetoReason?: string;          // required if veto === true
}

interface ConsensusResult {
  proposalId: string;
  outcome: 'approved' | 'rejected' | 'vetoed' | 'timeout' | 'no_quorum';
  winningOption?: string;
  totalWeight: number;
  votes: ConsensusVoteSummary[];
  vetoedBy?: string;
  decidedAt: string;
}

interface ConsensusVoteSummary {
  voter: string;
  optionId: string;
  weight: number;
  confidence: number;
  rationale: string;
}
```

### JSON Example — Architecture Decision

```json
{
  "id": "msg-consensus-001",
  "sender": "architect-cli",
  "recipient": "*",
  "type": "consensus.propose",
  "payload": {
    "proposalId": "prop-db-migration",
    "proposer": "architect-cli",
    "topic": "Database Migration Strategy",
    "description": "Choose between in-place ALTER TABLE vs. shadow table migration for the users table schema change.",
    "options": [
      {
        "id": "alter",
        "label": "In-place ALTER TABLE",
        "description": "Direct schema modification. Fast but locks table during migration. Risk of downtime."
      },
      {
        "id": "shadow",
        "label": "Shadow Table Migration",
        "description": "Create new table, backfill, swap. Zero downtime but 2x storage during migration."
      }
    ],
    "votingRules": {
      "weights": {
        "architect-cli": 2.0,
        "coder-cli": 1.5,
        "security-auditor": 1.5,
        "qa-cli": 1.0,
        "perf-cli": 1.0
      },
      "vetoHolders": ["security-auditor"],
      "quorumWeight": 4.0,
      "threshold": 0.6,
      "timeoutPolicy": "proposer_decides"
    },
    "deadline": "2025-07-15T15:00:00.000Z"
  },
  "correlationId": "prop-db-migration",
  "timestamp": "2025-07-15T14:40:00.000Z",
  "ttl": 0,
  "sequenceNumber": 88
}
```

### Sequence Diagram

```
Architect CLI      Orchestrator       Coder CLI     Security CLI      QA CLI
    │                   │                │               │               │
    │── propose ───────>│                │               │               │
    │   (broadcast)     │── propose ────>│               │               │
    │                   │── propose ─────────────────────>               │
    │                   │── propose ─────────────────────────────────────>
    │                   │                │               │               │
    │                   │<── vote ───────│               │               │
    │                   │   {option:     │               │               │
    │                   │    "shadow",   │               │               │
    │                   │    weight:1.5} │               │               │
    │                   │                │               │               │
    │                   │<── vote ───────────────────────│               │
    │                   │   {option: "shadow",           │               │
    │                   │    confidence: 0.95,           │               │
    │                   │    rationale: "ALTER           │               │
    │                   │    risks lock contention"}     │               │
    │                   │                │               │               │
    │                   │<── vote ───────────────────────────────────────│
    │                   │   {option: "shadow",                          │
    │                   │    weight: 1.0}                               │
    │                   │                │               │               │
    │                   │   [quorum reached: 4.0]        │               │
    │                   │   [shadow: 5.0/7.0 = 71%]     │               │
    │                   │                │               │               │
    │<── result ────────│                │               │               │
    │  {outcome:        │── result ─────>│               │               │
    │   "approved",     │── result ──────────────────────>               │
    │   winning:        │── result ──────────────────────────────────────>
    │   "shadow"}       │                │               │               │
```

### Veto Mechanics

A veto from any CLI in `vetoHolders` immediately terminates voting. The result is `outcome: "vetoed"` regardless of other votes. This exists because certain CLIs have domain authority — the Security Auditor can veto any proposal that introduces a vulnerability, the Architect can veto proposals that violate system constraints.

Veto triggers a mandatory `memory.write` with the veto rationale at `importance: 5`, ensuring the reasoning persists in the shared memory bus. Future proposals on the same topic must reference this memory.

---

## D.5 Health Check Protocol

The health check protocol provides failure detection through periodic heartbeats, on-demand status probes, and cascading failure notifications. It is the immune system of the forge — without it, a crashed CLI becomes a black hole that silently drops tasks.

### TypeScript Interfaces

```typescript
interface Heartbeat {
  cliId: string;
  status: 'healthy' | 'degraded' | 'overloaded';
  uptime: number;               // milliseconds since CLI start
  currentTask?: string;         // taskId if actively working
  tokenBudgetRemaining: number; // tokens left in current budget
  memoryUsageMb: number;
  activeConnections: number;    // open file handles, DB connections
  version: string;              // CLI version for compatibility checks
}

interface StatusRequest {
  targetCli: string;
  timeout: number;              // ms to wait for response
  reason: 'scheduled' | 'missed_heartbeat' | 'error_spike' | 'manual';
}

interface StatusResponse {
  cliId: string;
  status: 'healthy' | 'degraded' | 'overloaded' | 'shutting_down';
  diagnostics: {
    lastToolExecution: string;  // ISO 8601
    pendingToolCalls: number;
    errorRate: number;          // errors per minute, last 5 minutes
    avgResponseMs: number;      // mean tool execution time
    queueDepth: number;         // messages awaiting processing
  };
  capabilities: string[];       // currently available tools
}

interface FailureDetection {
  failedCli: string;
  detectedBy: string;
  detectionMethod: 'missed_heartbeat' | 'timeout' | 'error_threshold' | 'crash_signal';
  missedHeartbeats: number;
  lastKnownState: Heartbeat;
  affectedTasks: string[];      // tasks that were in-progress
  recommendation: 'restart' | 'reassign_tasks' | 'escalate_human';
}
```

### JSON Example — Heartbeat

```json
{
  "id": "msg-hb-9001",
  "sender": "coder-cli",
  "recipient": "orchestrator",
  "type": "health.heartbeat",
  "payload": {
    "cliId": "coder-cli",
    "status": "healthy",
    "uptime": 3600000,
    "currentTask": "task-0042",
    "tokenBudgetRemaining": 42000,
    "memoryUsageMb": 256,
    "activeConnections": 3,
    "version": "1.4.2"
  },
  "correlationId": "heartbeat-coder-cli",
  "timestamp": "2025-07-15T14:45:00.000Z",
  "ttl": 15000,
  "sequenceNumber": 901
}
```

### Sequence Diagram — Failure Detection and Recovery

```
Coder CLI          Orchestrator         Reviewer CLI        Human Operator
    │                   │                    │                    │
    │── heartbeat ─────>│                    │                    │
    │   (every 10s)     │                    │                    │
    │                   │                    │                    │
    │── heartbeat ─────>│                    │                    │
    │                   │                    │                    │
    X  [CLI crashes]    │                    │                    │
                        │                    │                    │
                   [10s: no heartbeat]       │                    │
                        │                    │                    │
                   [20s: missed = 1]         │                    │
                        │                    │                    │
                        │── status.request ─>│ (probe)            │
                   [no response after 5s]    │                    │
                        │                    │                    │
                   [30s: missed = 2]         │                    │
                        │                    │                    │
                        │── health.failure ──────────────────────>│
                        │  {detectionMethod:                      │
                        │   "missed_heartbeat",                   │
                        │   missedHeartbeats: 3,                  │
                        │   recommendation:                       │
                        │    "restart"}                           │
                        │                    │                    │
                        │   [reassign task-0042]                  │
                        │── task.assign ────>│                    │
                        │  {taskId:"task-0042",                   │
                        │   previousAttempts:1}                   │
                        │                    │                    │
```

### Failure Detection Thresholds

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Missed heartbeats | 3 consecutive (30s) | Mark CLI as `FAILED`, reassign tasks |
| Error rate spike | > 10 errors/minute for 2 minutes | Mark CLI as `DEGRADED`, reduce task load |
| Token budget exhausted | `tokenBudgetRemaining` < 1000 | Stop assigning new tasks, allow completion |
| Memory pressure | `memoryUsageMb` > 80% of limit | Send `OVERLOADED` status, pause queue |
| Response latency | `avgResponseMs` > 30000 for 5 minutes | Mark `DEGRADED`, investigate |

The heartbeat interval is 10 seconds. The Orchestrator declares failure after 3 missed heartbeats (30 seconds). This balance avoids false positives from brief network delays while detecting genuine crashes within a reasonable window. The TTL on heartbeat messages is set to 15 seconds — a heartbeat that arrives after 15 seconds is stale and discarded.

---

## D.6 Error Propagation Protocol

Errors in a multi-CLI system don't stay local. A file permission error in the Coder CLI becomes a blocking dependency for the QA CLI becomes a stalled pipeline for the human operator. The error propagation protocol defines how errors are classified, where they route, how they escalate, and when they trigger automatic retry.

### TypeScript Interfaces

```typescript
interface ErrorReport {
  errorId: string;
  code: ErrorCode;
  severity: 'warning' | 'error' | 'critical' | 'fatal';
  source: string;               // CLI that encountered the error
  taskId?: string;              // task context, if applicable
  message: string;              // human-readable description
  details: Record<string, unknown>; // structured error data
  stackTrace?: string;          // if available from tool execution
  timestamp: string;
  recoverable: boolean;         // can the CLI retry automatically?
}

type ErrorCode =
  | 'TOOL_EXECUTION_FAILED'     // a tool call returned an error
  | 'TOKEN_BUDGET_EXCEEDED'     // ran out of tokens mid-task
  | 'TIMEOUT'                   // operation exceeded time limit
  | 'PERMISSION_DENIED'         // file/tool access denied
  | 'DEPENDENCY_FAILED'         // a required task failed upstream
  | 'CONFLICT_UNRESOLVED'       // memory write conflict not resolved
  | 'API_ERROR'                 // Anthropic API returned error
  | 'SEQUENCE_GAP'             // missed messages detected
  | 'ACCEPTANCE_TIMEOUT'        // no task acceptance received
  | 'CONSENSUS_TIMEOUT'         // voting deadline passed
  | 'VALIDATION_FAILED'         // output didn't pass validation
  | 'INTERNAL_ERROR';           // unexpected CLI error

interface ErrorEscalation {
  errorId: string;
  escalatedFrom: string;        // CLI that couldn't handle it
  escalatedTo: string;          // "orchestrator" or "human"
  escalationReason: string;
  attemptsMade: number;
  context: {
    taskId?: string;
    lastAction: string;
    partialResult?: string;     // what was completed before failure
  };
}

interface RetryPolicy {
  errorCode: ErrorCode;
  maxRetries: number;
  backoffStrategy: 'fixed' | 'exponential' | 'linear';
  baseDelayMs: number;
  maxDelayMs: number;
  retryableCondition?: string;  // additional condition for retry
}
```

### Default Retry Policies

```typescript
const DEFAULT_RETRY_POLICIES: RetryPolicy[] = [
  {
    errorCode: 'TOOL_EXECUTION_FAILED',
    maxRetries: 3,
    backoffStrategy: 'exponential',
    baseDelayMs: 1000,
    maxDelayMs: 30000,
  },
  {
    errorCode: 'API_ERROR',
    maxRetries: 5,
    backoffStrategy: 'exponential',
    baseDelayMs: 2000,
    maxDelayMs: 60000,
  },
  {
    errorCode: 'TOKEN_BUDGET_EXCEEDED',
    maxRetries: 0,            // never retry — requires budget increase
    backoffStrategy: 'fixed',
    baseDelayMs: 0,
    maxDelayMs: 0,
  },
  {
    errorCode: 'PERMISSION_DENIED',
    maxRetries: 0,            // never retry — requires human intervention
    backoffStrategy: 'fixed',
    baseDelayMs: 0,
    maxDelayMs: 0,
  },
  {
    errorCode: 'TIMEOUT',
    maxRetries: 2,
    backoffStrategy: 'linear',
    baseDelayMs: 5000,
    maxDelayMs: 30000,
  },
  {
    errorCode: 'SEQUENCE_GAP',
    maxRetries: 3,
    backoffStrategy: 'fixed',
    baseDelayMs: 500,
    maxDelayMs: 500,
  },
];
```

### JSON Example — Error Escalation

```json
{
  "id": "msg-err-escalate-001",
  "sender": "coder-cli",
  "recipient": "orchestrator",
  "type": "error.escalate",
  "payload": {
    "errorId": "err-perm-042",
    "escalatedFrom": "coder-cli",
    "escalatedTo": "orchestrator",
    "escalationReason": "PERMISSION_DENIED on /etc/nginx/conf.d/api.conf — file owned by root. Cannot modify without elevated privileges. No retry possible.",
    "attemptsMade": 1,
    "context": {
      "taskId": "task-0042",
      "lastAction": "Edit tool on /etc/nginx/conf.d/api.conf",
      "partialResult": "JWT refresh endpoint implemented in src/auth/refresh.ts. Nginx proxy configuration requires manual update."
    }
  },
  "correlationId": "saga-jwt-auth-impl",
  "timestamp": "2025-07-15T14:50:00.000Z",
  "ttl": 0,
  "sequenceNumber": 156
}
```

### Escalation Path

```
    CLI encounters error
           │
           ▼
    ┌──────────────┐     yes    ┌───────────┐
    │ Recoverable? ├───────────>│ Auto-retry │
    └──────┬───────┘            │ (backoff)  │
           │ no                 └─────┬──────┘
           ▼                          │
    ┌──────────────┐            ┌─────▼──────┐     yes
    │  Escalate to │            │ Retry      ├──────────> [resume task]
    │  Orchestrator│            │ succeeded? │
    └──────┬───────┘            └─────┬──────┘
           │                          │ no (max retries)
           ▼                          │
    ┌──────────────┐                  │
    │ Orchestrator │<─────────────────┘
    │ can resolve? │
    └──────┬───────┘
           │
      ┌────┴────┐
      │         │
      ▼ yes     ▼ no
  ┌────────┐  ┌──────────────┐
  │Reassign│  │ Escalate to  │
  │to other│  │ human via    │
  │  CLI   │  │ health.      │
  └────────┘  │ failure      │
              └──────────────┘
```

### Error Severity Mapping

| Severity | Effect | Example |
|----------|--------|---------|
| `warning` | Logged. No workflow impact. Task continues. | Non-critical lint warning in generated code |
| `error` | Task paused. Retry attempted per policy. | Tool execution timeout on slow network |
| `critical` | Task failed. Orchestrator notified for reassignment. | API returns 500 three consecutive times |
| `fatal` | CLI shutdown initiated. All tasks reassigned. Human notified. | Unrecoverable internal error, corrupted state |

Fatal errors trigger an immediate `health.failure` broadcast so all CLIs can checkpoint any work that depends on the failed CLI's output. The Orchestrator has 5 seconds to reassign affected tasks before dependent CLIs begin their own timeout cascades.

---

## D.7 Protocol Versioning and Compatibility

All envelopes include an implicit protocol version derived from the `metadata.protocolVersion` field. When omitted, version `1.0` is assumed. Version negotiation follows these rules:

1. **Minor version mismatch** (e.g., 1.0 vs 1.2): Messages are accepted. Unknown fields are ignored. New optional fields use defaults.
2. **Major version mismatch** (e.g., 1.x vs 2.x): Messages are rejected with `error.report` code `PROTOCOL_VERSION_MISMATCH`. The CLI must upgrade before rejoining the forge.
3. **Version announcement**: Each CLI includes its protocol version in its first heartbeat after startup. The Orchestrator maintains a version registry and warns if any CLI is running an outdated version.

```typescript
interface ProtocolVersion {
  major: number;
  minor: number;
  patch: number;
}

function isCompatible(sender: ProtocolVersion, receiver: ProtocolVersion): boolean {
  return sender.major === receiver.major;
}
```

This versioning scheme allows the forge to evolve protocols without requiring simultaneous upgrades across all CLIs — a practical necessity when CLIs may be running on different machines, in different containers, or maintained by different teams.

---

## D.8 Quick Reference: Message Type Catalog

| Type | Sender | Recipient | Payload Interface | TTL |
|------|--------|-----------|-------------------|-----|
| `task.assign` | Orchestrator | Specialist CLI | `TaskAssignment` | 30s |
| `task.accept` | Specialist CLI | Orchestrator | `TaskAcceptance` | 10s |
| `task.progress` | Specialist CLI | Orchestrator | `TaskProgress` | 15s |
| `task.complete` | Specialist CLI | Orchestrator | `TaskCompletion` | 0 |
| `task.reject` | Specialist CLI | Orchestrator | `TaskAcceptance` | 10s |
| `task.cancel` | Orchestrator | Specialist CLI | `{taskId, reason}` | 5s |
| `memory.write` | Any CLI | Memory Bus | `MemoryWrite` | 0 |
| `memory.read` | Any CLI | Memory Bus | `MemoryRead` | 10s |
| `memory.subscribe` | Any CLI | Memory Bus | `MemorySubscription` | 0 |
| `memory.notify` | Memory Bus | Subscriber | `MemoryNotification` | 15s |
| `memory.conflict` | Memory Bus | Orchestrator | `MemoryConflict` | 0 |
| `consensus.propose` | Any CLI | Broadcast | `ConsensusProposal` | 0 |
| `consensus.vote` | Any CLI | Orchestrator | `ConsensusVote` | 0 |
| `consensus.result` | Orchestrator | Broadcast | `ConsensusResult` | 0 |
| `health.heartbeat` | Any CLI | Orchestrator | `Heartbeat` | 15s |
| `health.status` | Orchestrator | Target CLI | `StatusRequest` | 5s |
| `health.failure` | Orchestrator | Broadcast | `FailureDetection` | 0 |
| `error.report` | Any CLI | Orchestrator | `ErrorReport` | 0 |
| `error.escalate` | Any CLI | Orchestrator/Human | `ErrorEscalation` | 0 |
| `shutdown.request` | Orchestrator | Target CLI | `{reason}` | 30s |
| `shutdown.response` | Target CLI | Orchestrator | `{approved, reason}` | 10s |

TTL of `0` means infinite — the message must be delivered regardless of delay. These are typically state-changing operations (memory writes, consensus votes, error reports) where eventual delivery is more important than timeliness.

---

*These protocol specifications define the contract between every component of the AGI Forge. They are the constitutional law of the multi-CLI system — rigid enough to prevent chaos, flexible enough to accommodate the unpredictable nature of AI-assisted development. When in doubt, consult this appendix. When the system misbehaves, trace the message envelopes. The protocols don't lie.*
