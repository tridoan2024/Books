# Chapter 33: The Swarm System

Everything we have built so far -- the query loop (Chapter 4), the tool system (Chapters 8-14), permissions (Chapters 15-17), the Agent tool (Chapter 13) -- operates within a single agent context. One model, one conversation, one set of permissions, one working directory. The Agent tool can spawn subagents, but those are fire-and-forget: they spin up, do their work, return a result, and disappear. There is no persistent teammate that stays alive between prompts. There is no way for multiple agents to collaborate on a shared codebase simultaneously. There is no mechanism for a leader to dispatch work to teammates who maintain their own state, receive follow-up instructions, and negotiate permission decisions with the user through a shared UI.

The swarm system changes all of that. It introduces in-process teammates -- long-lived agent instances that run concurrently within the same Node.js process, each isolated by `AsyncLocalStorage` so they cannot corrupt each other's state, communicating through a file-based mailbox system, and sharing the leader's permission UI through a bridge that surfaces teammate tool requests in the same confirmation dialog the user already trusts.

This chapter covers the complete swarm architecture. We start with the context isolation mechanism that makes it possible to run multiple agents in one process without global state collisions. Then we build the in-process runner that manages a teammate's lifecycle -- from spawn through execution to idle-wait-for-next-prompt loops. From there we cover the mailbox system that lets agents send messages to each other, the permission synchronization bridge that prevents teammates from getting stuck on tool approvals, and the spawn utilities that wire everything together. By the end, you will understand how a single CLI process can orchestrate a team of concurrent agents working on the same codebase.

---

## 33.1 The Problem: Global State in a Multi-Agent World

Before we look at the solution, we need to understand why multi-agent execution is hard in a single-process architecture. The CLI agent relies heavily on global state. The bootstrap module (`bootstrap/state.ts`, covered in Chapter 3) maintains a singleton `AppState` with hundreds of fields: the current model, the session ID, the permission context, the active tools, the working directory, telemetry counters. Every tool call reads from this state. Every permission check queries it. Every API call uses it to construct headers.

When you run a single agent, this works fine. One agent, one state, no conflicts. But the moment you want two agents running concurrently in the same process -- say, a "researcher" investigating documentation while a "coder" writes implementation code -- you have a problem. Both agents would read and write the same global state. Agent A sets its model to Sonnet for speed; Agent B expects Opus for depth. Agent A's permission decision clobbers Agent B's pending request. The conversation messages from both agents interleave into the same array.

There are three ways to solve this:

1. **Separate processes.** Spawn each teammate as a child process with its own memory space. This is what the tmux-based team system does (covered briefly in this chapter, deeply in Chapter 34). It works but is expensive: each process loads the full CLI, establishes its own API connection, and consumes its own token budget independently.

2. **Dependency injection.** Thread a context object through every function call so each agent operates on its own state. This would require refactoring the entire codebase to accept a context parameter -- every tool, every permission check, every API call. In a 500K-line codebase, this is a multi-month rewrite.

3. **AsyncLocalStorage.** Node.js provides `AsyncLocalStorage` in the `async_hooks` module, which lets you associate state with an async execution context. Every `await`, every callback, every promise continuation within a `run()` call automatically inherits the stored value. You get per-agent isolation without changing a single function signature.

The swarm system chose option 3. Let us see how it works.

---

## 33.2 AsyncLocalStorage-Based Context Isolation

The core isolation mechanism lives in a single 97-line file: `utils/teammateContext.ts`. It creates one `AsyncLocalStorage<TeammateContext>` instance and exports functions to run code within a teammate's context and to query which context is currently active.

### The TeammateContext Type

Every in-process teammate gets a context object that carries its identity and lifecycle state:

```typescript
import { AsyncLocalStorage } from 'async_hooks'

export type TeammateContext = {
  /** Full agent ID, e.g., "researcher@my-team" */
  agentId: string
  /** Display name, e.g., "researcher" */
  agentName: string
  /** Team name this teammate belongs to */
  teamName: string
  /** UI color assigned to this teammate */
  color?: string
  /** Whether teammate must enter plan mode before implementing */
  planModeRequired: boolean
  /** Leader's session ID (for transcript correlation) */
  parentSessionId: string
  /** Discriminator — always true for in-process teammates */
  isInProcess: true
  /** Abort controller for lifecycle management (linked to parent) */
  abortController: AbortController
}

const teammateContextStorage = new AsyncLocalStorage<TeammateContext>()
```

The type captures everything the system needs to know about a teammate at any point during execution: who it is (`agentId`, `agentName`), where it belongs (`teamName`), how it should appear in the UI (`color`), what constraints it operates under (`planModeRequired`), and how to shut it down (`abortController`).

The `isInProcess: true` discriminator is a tagged union trick. When code elsewhere in the codebase encounters a teammate context, it can immediately distinguish in-process teammates from tmux-based teammates without checking which subsystem spawned them.

### Running Within a Context

The key function is `runWithTeammateContext`:

```typescript
export function runWithTeammateContext<T>(
  context: TeammateContext,
  fn: () => T,
): T {
  return teammateContextStorage.run(context, fn)
}
```

This wraps Node's `AsyncLocalStorage.run()`, which establishes a new storage context for the duration of `fn` and all async continuations it spawns. Any code that calls `getTeammateContext()` within `fn` -- or within any `await`ed promise chain started by `fn` -- will receive the same `TeammateContext` instance. This happens automatically through Node's async hook machinery. You do not need to pass the context as a parameter. You do not need to thread it through function calls. It is simply available.

```typescript
export function getTeammateContext(): TeammateContext | undefined {
  return teammateContextStorage.getStore()
}

export function isInProcessTeammate(): boolean {
  return teammateContextStorage.getStore() !== undefined
}
```

The `isInProcessTeammate()` function is the fast-path check used throughout the codebase. When the permission system needs to decide whether to show a permission prompt or route it through the leader, it calls `isInProcessTeammate()`. When the session system needs to decide where to write a transcript, it calls `isInProcessTeammate()`. When the telemetry system needs to tag an event with a worker ID, it calls `getTeammateContext()?.agentId`.

### Priority Resolution

The teammate identity system has a priority hierarchy for resolving which agent is currently executing:

```typescript
/**
 * Priority order for identity resolution:
 * 1. AsyncLocalStorage (in-process teammates) - via teammateContext.ts
 * 2. dynamicTeamContext (tmux teammates via CLI args)
 */
```

In-process teammates always take priority because `AsyncLocalStorage` is scoped to the exact async execution context. The tmux fallback (`dynamicTeamContext`) reads from environment variables set when the CLI was launched as a subprocess -- it is process-wide, not execution-context-wide. This means that if an in-process teammate spawns inside a tmux-based teammate's process, the `AsyncLocalStorage` context correctly identifies the inner teammate while the outer process retains its tmux identity.

### Why Not Just Use Worker Threads?

A natural question: why not use Node.js Worker Threads, which provide true memory isolation? Three reasons:

1. **Shared tool state.** Teammates need access to the same tool registry, the same MCP connections, the same file index. Worker Threads would require serializing all of this across the `MessagePort` boundary, which defeats the purpose of running in-process.

2. **Shared permission UI.** The leader's REPL owns the terminal. Teammates need to push permission requests into the leader's `ToolUseConfirm` queue so the user sees one unified permission dialog. This requires shared memory access to React state, which Worker Threads cannot provide.

3. **Lightweight overhead.** `AsyncLocalStorage` adds negligible overhead -- it hooks into the async execution chain that Node already maintains. Worker Threads add thread creation overhead, message serialization costs, and memory duplication.

The tradeoff is that in-process teammates are cooperative, not preemptive. A CPU-bound teammate can block others. In practice, CLI agent teammates spend almost all their time waiting on API calls (network I/O), so this is not an issue.

---

## 33.3 The In-Process Runner

The in-process runner (`utils/swarm/inProcessRunner.ts`, 1,552 lines) is the engine that executes a teammate's agent loop. Unlike a subagent spawned by the Agent tool -- which runs one prompt and returns -- an in-process teammate stays alive between prompts. It executes its initial task, enters an idle state, polls for new messages from the leader, and resumes execution when prompted. This persistent lifecycle is what makes teammates fundamentally different from subagents.

### The Configuration Type

Every in-process teammate starts with a configuration object:

```typescript
export type InProcessRunnerConfig = {
  identity: TeammateIdentity
  taskId: string
  prompt: string
  agentDefinition?: CustomAgentDefinition
  teammateContext: TeammateContext
  toolUseContext: ToolUseContext
  abortController: AbortController
  model?: string
  systemPrompt?: string
  systemPromptMode?: 'default' | 'replace' | 'append'
  allowedTools?: string[]
  allowPermissionPrompts?: boolean
  description?: string
  invokingRequestId?: string
}
```

The critical fields:

- **`identity`** carries the agent's name, team, color, and parent session ID. This gets used for mailbox routing and UI display.
- **`teammateContext`** is the `AsyncLocalStorage` context from Section 33.2. It isolates this teammate's execution from all others.
- **`toolUseContext`** provides access to `getAppState` and `setAppState` -- the same state management functions the leader uses. The teammate reads shared state through these, but its identity-scoped operations (like which messages belong to it) are filtered by the `AsyncLocalStorage` context.
- **`allowedTools`** defines which tools the teammate can use without permission prompts. Tools not in this list go through the permission bridge (Section 33.5).
- **`allowPermissionPrompts`** controls whether the teammate can surface UI prompts at all. When `false`, unlisted tools are auto-denied silently.

### The Execution Loop

The core of `runInProcessTeammate` wraps the standard `runAgent()` function -- the same one used by the Agent tool in Chapter 13 -- inside the teammate's `AsyncLocalStorage` context:

```typescript
export async function runInProcessTeammate(
  config: InProcessRunnerConfig,
): Promise<InProcessRunnerResult> {
  // ... destructure config ...

  await runWithTeammateContext(teammateContext, async () => {
    return runWithAgentContext(agentContext, async () => {
      // Mark task as running
      updateTaskState(
        taskId,
        task => ({ ...task, status: 'running', isIdle: false }),
        setAppState,
      )

      // Run the standard agent loop
      for await (const message of runAgent({
        agentDefinition: iterationAgentDefinition,
        promptMessages,
        toolUseContext,
        canUseTool: createInProcessCanUseTool(
          identity,
          currentWorkAbortController,
          (waitMs) => {
            updateTaskState(taskId, task => ({
              ...task,
              totalPausedMs: (task.totalPausedMs ?? 0) + waitMs,
            }), setAppState)
          },
        ),
        isAsync: true,
        canShowPermissionPrompts: allowPermissionPrompts ?? true,
        forkContextMessages,
        querySource: 'agent:custom',
        override: { abortController: currentWorkAbortController },
        model: model as ModelAlias | undefined,
        preserveToolUseResults: true,
        availableTools: toolUseContext.options.tools,
        allowedTools,
      })) {
        // Process streamed messages from the agent loop
      }
    })
  })
}
```

The double-`runWith` nesting is important. `runWithTeammateContext` establishes the `AsyncLocalStorage` scope so any code that calls `getTeammateContext()` during execution gets this teammate's identity. `runWithAgentContext` establishes the agent-level context that the query loop and tool system expect (things like the current agent's message history, its abort controller, and its fork state).

The `canUseTool` parameter is where permission synchronization happens. Instead of using the leader's permission function directly, the runner creates a custom `createInProcessCanUseTool` function that intercepts permission decisions and routes `ask`-type results through the leader's UI. We cover this in detail in Section 33.5.

### The Idle-Wait Loop

After completing its initial prompt, the teammate does not terminate. It enters an idle state and polls for new work:

```typescript
async function waitForNextPromptOrShutdown(
  identity: TeammateIdentity,
  abortController: AbortController,
  taskId: string,
  getAppState: () => AppState,
  setAppState: SetAppStateFn,
  taskListId: string,
): Promise<WaitResult> {
  const POLL_INTERVAL_MS = 500

  let pollCount = 0
  while (!abortController.signal.aborted) {
    const appState = getAppState()
    const task = appState.tasks[taskId]

    // Check for in-memory pending messages (from leader's SendMessage tool)
    if (
      task &&
      task.type === 'in_process_teammate' &&
      task.pendingUserMessages.length > 0
    ) {
      // Pop the first message from the queue
      // Return it as the next prompt
    }

    if (pollCount > 0) {
      await sleep(POLL_INTERVAL_MS)
    }
    pollCount++

    // Check file-based mailbox for messages from other teammates
    const allMessages = await readMailbox(
      identity.agentName,
      identity.teamName,
    )

    // Priority: shutdown > team-lead messages > peer messages
  }
}
```

This polling loop is the heartbeat of a teammate. Every 500 milliseconds, it checks two sources:

1. **In-memory pending messages** from `AppState.tasks[taskId].pendingUserMessages`. This is the fast path used when the leader's `SendMessage` tool pushes a follow-up prompt directly into the teammate's task state. No file I/O, no serialization -- just a state update.

2. **File-based mailbox** at `~/.claude/teams/{teamName}/inboxes/{agentName}.json`. This is the cross-process path used when other teammates or external tmux-based workers send messages. It is slower (file I/O plus lock acquisition) but works across process boundaries.

The priority ordering is deliberate: shutdown requests take precedence over all other messages, team-lead messages take precedence over peer messages, and in-memory messages take precedence over mailbox messages. This ensures that the leader can always interrupt a teammate, and that the fast path is always preferred when available.

### Fire-and-Forget Start

For the common case where the leader spawns a teammate and does not need to wait for its completion, the module exports a fire-and-forget wrapper:

```typescript
export function startInProcessTeammate(
  config: InProcessRunnerConfig,
): void {
  const agentId = config.identity.agentId
  void runInProcessTeammate(config).catch(error => {
    logForDebugging(
      `[inProcessRunner] Unhandled error in ${agentId}: ${error}`
    )
  })
}
```

The `void` prefix on the promise suppresses the unhandled-promise-rejection lint rule while making the intent explicit: the leader does not await the result. The teammate runs concurrently, and the leader can send follow-up instructions through the mailbox or the in-memory message queue.

Note the defensive pattern of extracting `agentId` before the closure. This prevents the error handler from retaining a reference to the full `config` object -- which includes `toolUseContext` and its reference to the entire `AppState` -- for the duration of the teammate's lifetime, which could be hours.

---

## 33.4 The Teammate Mailbox

Teammates need to communicate. The leader needs to dispatch tasks. Teammates need to report completion. Permission requests need to flow from teammates to the leader and responses need to flow back. The mailbox system (`utils/teammateMailbox.ts`, 1,184 lines) provides this communication layer using the filesystem as the transport.

### Why the Filesystem?

Using the filesystem for message passing might seem old-fashioned in a world of WebSockets and message queues. There are three reasons:

1. **Cross-process compatibility.** The same mailbox system works for in-process teammates (which share a Node process) and tmux-based teammates (which are separate processes). The filesystem is the universal shared state.

2. **Crash recovery.** If a teammate crashes, its unread messages are still on disk. When it restarts (or when the leader inspects its inbox), the messages are available. An in-memory message queue would lose everything.

3. **Debuggability.** You can `cat ~/.claude/teams/my-team/inboxes/researcher.json` and see exactly what messages were sent. No protocol analyzer needed. No log parsing. The state is visible.

### Message Structure

Every mailbox message is a JSON object with a fixed schema:

```typescript
export type TeammateMessage = {
  from: string        // Sender's agent name
  text: string        // Message content (may be JSON-stringified)
  timestamp: string   // ISO 8601 timestamp
  read: boolean       // Whether the recipient has processed this message
  color?: string      // Sender's UI color for display
  summary?: string    // 5-10 word preview for the leader's UI
}
```

The `text` field is intentionally loosely typed as `string`. It can contain plain text prompts from the leader, JSON-stringified permission requests, idle notifications, or shutdown commands. The recipient parses the content based on context. This flexibility means the mailbox does not need to know about every message type -- it is a generic transport.

### File Layout and Locking

Each teammate gets its own inbox file:

```
~/.claude/teams/{teamName}/inboxes/{agentName}.json
```

The path is constructed with sanitized components to prevent path traversal:

```typescript
export function getInboxPath(
  agentName: string,
  teamName?: string,
): string {
  const team = teamName || getTeamName() || 'default'
  const safeTeam = sanitizePathComponent(team)
  const safeAgentName = sanitizePathComponent(agentName)
  const inboxDir = join(getTeamsDir(), safeTeam, 'inboxes')
  return join(inboxDir, `${safeAgentName}.json`)
}
```

Because multiple agents might write to the same inbox concurrently (a leader and a peer both sending messages to the same teammate), the write path uses file-level locking with retry and exponential backoff:

```typescript
const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    minTimeout: 5,
    maxTimeout: 100,
  },
}

export async function writeToMailbox(
  recipientName: string,
  message: Omit<TeammateMessage, 'read'>,
  teamName?: string,
): Promise<void> {
  await ensureInboxDir(teamName)
  const inboxPath = getInboxPath(recipientName, teamName)
  const lockFilePath = `${inboxPath}.lock`

  // Ensure inbox file exists (atomic create-if-not-exists)
  try {
    await writeFile(inboxPath, '[]', { encoding: 'utf-8', flag: 'wx' })
  } catch (error) {
    if (getErrnoCode(error) !== 'EEXIST') return
  }

  let release: (() => Promise<void>) | undefined
  try {
    release = await lockfile.lock(inboxPath, {
      lockfilePath: lockFilePath,
      ...LOCK_OPTIONS,
    })

    // Read-modify-write under lock
    const messages = await readMailbox(recipientName, teamName)
    messages.push({ ...message, read: false })
    await writeFile(
      inboxPath,
      jsonStringify(messages, null, 2),
      'utf-8',
    )
  } finally {
    if (release) {
      await release()
    }
  }
}
```

The lock-acquire-read-modify-write-release pattern is classic concurrent file access. The `wx` flag on the initial `writeFile` call is an atomic create-if-not-exists -- it fails with `EEXIST` if the file already exists, which is the expected case after the first message. The retry parameters (10 retries, 5-100ms backoff) handle the common case where two agents try to write simultaneously: one gets the lock, the other retries after a few milliseconds.

### Idle Notifications

When a teammate finishes its current task and enters the idle state, it sends a structured notification to the leader:

```typescript
export type IdleNotificationMessage = {
  type: 'idle_notification'
  from: string
  timestamp: string
  idleReason?: 'available' | 'interrupted' | 'failed'
  summary?: string
  completedTaskId?: string
  completedStatus?: 'resolved' | 'blocked' | 'failed'
  failureReason?: string
}
```

This is richer than a simple "I'm done" signal. The `idleReason` tells the leader why the teammate went idle: `available` means it completed normally and is ready for more work; `interrupted` means it was stopped by an abort signal; `failed` means it encountered an unrecoverable error. The `completedTaskId` and `completedStatus` fields let the leader update its task list without having to parse the teammate's output.

The idle notification is sent through a Stop hook registered during teammate initialization:

```typescript
// In teammateInit.ts
addFunctionHook(
  setAppState,
  sessionId,
  'Stop',
  '',
  async (messages, _signal) => {
    void setMemberActive(teamName, agentName, false)

    const notification = createIdleNotification(agentName, {
      idleReason: 'available',
      summary: getLastPeerDmSummary(messages),
    })
    await writeToMailbox(leadAgentName, {
      from: agentName,
      text: jsonStringify(notification),
      timestamp: new Date().toISOString(),
      color: getTeammateColor(),
    })
    return true
  },
  'Failed to send idle notification to team leader',
  { timeout: 10000 },
)
```

The hook fires after the agent's query loop terminates (the `Stop` lifecycle event from Chapter 18). It marks the member as inactive in the team file, constructs an idle notification with a summary of the last message the teammate sent, and writes it to the leader's mailbox. The 10-second timeout ensures that a slow filesystem does not block the teammate's shutdown indefinitely.

---

## 33.5 Permission Synchronization

Permission management is the hardest problem in multi-agent orchestration. The leader's REPL owns the terminal. It renders the permission dialog. It manages the `ToolUseConfirm` queue that the React UI component reads. But teammates also need permissions for their tool calls. A "coder" teammate running `Bash(npm install)` needs the user to approve it. Where does that approval dialog appear?

The answer: in the leader's UI, with a colored badge identifying which teammate is asking. The permission synchronization system (`utils/swarm/permissionSync.ts`, 929 lines) and the leader permission bridge (`utils/swarm/leaderPermissionBridge.ts`, 55 lines) make this work.

### The Bridge Pattern

The bridge is surprisingly simple. The leader's REPL registers two setters when it initializes:

```typescript
// leaderPermissionBridge.ts
let registeredSetter: SetToolUseConfirmQueueFn | null = null
let registeredPermissionContextSetter: SetToolPermissionContextFn | null = null

export function registerLeaderToolUseConfirmQueue(
  setter: SetToolUseConfirmQueueFn,
): void {
  registeredSetter = setter
}

export function registerLeaderSetToolPermissionContext(
  setter: SetToolPermissionContextFn,
): void {
  registeredPermissionContextSetter = setter
}
```

These are module-level singletons. The leader's REPL calls `registerLeaderToolUseConfirmQueue(setToolUseConfirmQueue)` during startup, passing in the React state setter that controls the permission dialog. Now any code in the process -- including teammate code running in a different `AsyncLocalStorage` context -- can call `getLeaderToolUseConfirmQueue()` to get that setter and push items into the leader's permission queue.

### The canUseTool Function

Each in-process teammate gets a custom `canUseTool` function that intercepts the permission system's `ask` decisions:

```typescript
function createInProcessCanUseTool(
  identity: TeammateIdentity,
  abortController: AbortController,
  onPermissionWaitMs?: (waitMs: number) => void,
): CanUseToolFn {
  return async (tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision) => {
    const result = forceDecision ?? (
      await hasPermissionsToUseTool(tool, input, toolUseContext, assistantMessage, toolUseID)
    )

    // Allow and deny decisions pass through unchanged
    if (result.behavior !== 'ask') {
      return result
    }

    // Route 'ask' decisions through the leader's UI
    const setToolUseConfirmQueue = getLeaderToolUseConfirmQueue()
    if (setToolUseConfirmQueue) {
      return new Promise<PermissionDecision>(resolve => {
        const permissionStartMs = Date.now()

        setToolUseConfirmQueue(queue => [
          ...queue,
          {
            assistantMessage,
            tool: tool as Tool,
            description,
            input,
            toolUseContext,
            toolUseID,
            permissionResult: result,
            permissionPromptStartTimeMs: permissionStartMs,
            // This badge appears in the UI to identify the teammate
            workerBadge: identity.color
              ? { name: identity.agentName, color: identity.color }
              : undefined,
            async onAllow(updatedInput, permissionUpdates, feedback, contentBlocks) {
              // Persist "always allow" rules
              persistPermissionUpdates(permissionUpdates)
              // Propagate permission updates back to the leader's context
              if (permissionUpdates.length > 0) {
                const setToolPermissionContext = getLeaderSetToolPermissionContext()
                if (setToolPermissionContext) {
                  const currentAppState = toolUseContext.getAppState()
                  const updatedContext = applyPermissionUpdates(
                    currentAppState.toolPermissionContext,
                    permissionUpdates,
                  )
                  setToolPermissionContext(updatedContext, {
                    preserveMode: true,
                  })
                }
              }
              resolve({ behavior: 'allow', updatedInput, userModified: false })
            },
            onReject(feedback, contentBlocks) {
              resolve({
                behavior: 'ask',
                message: feedback
                  ? `Permission denied: ${feedback}`
                  : 'Permission denied by user',
                contentBlocks,
              })
            },
          },
        ])
      })
    }

    // Fallback: mailbox-based permission sync (for cross-process teammates)
    // ... covered below ...
  }
}
```

The flow:

1. The standard `hasPermissionsToUseTool()` evaluates the tool against the permission rules (Chapter 15). If the result is `allow` or `deny`, it passes through unchanged. The teammate's allowed tools, the session rules, the project settings -- all apply normally.

2. If the result is `ask`, the function checks whether the leader's UI queue is available via `getLeaderToolUseConfirmQueue()`. For in-process teammates this is always true (they share the same process).

3. The function pushes a new entry into the leader's `ToolUseConfirm` queue. The entry includes a `workerBadge` with the teammate's name and color so the user can see which agent is requesting permission.

4. The function returns a promise that resolves when the user clicks "Allow" or "Reject" in the UI dialog.

5. On "Allow", the function persists any "always allow" rules the user created and propagates them back to the leader's permission context with `preserveMode: true`. This flag prevents the teammate's permission mode from leaking into the leader's state -- the leader might be in `auto` mode while the teammate is in `plan` mode.

6. On "Reject", the function resolves with a rejection message that gets fed back into the teammate's agent loop as feedback, just like a normal permission rejection.

### The Mailbox Fallback

When the leader's UI queue is not available -- either because the teammate is running in a separate process (tmux mode) or because the leader's REPL has not initialized yet -- the system falls back to file-based permission synchronization:

```typescript
// Permission request file structure:
// ~/.claude/teams/{teamName}/permissions/pending/{requestId}.json
// ~/.claude/teams/{teamName}/permissions/resolved/{requestId}.json

export const SwarmPermissionRequestSchema = z.object({
  id: z.string(),
  workerId: z.string(),
  workerName: z.string(),
  workerColor: z.string().optional(),
  teamName: z.string(),
  toolName: z.string(),
  toolUseId: z.string(),
  description: z.string(),
  input: z.record(z.string(), z.unknown()),
  permissionSuggestions: z.array(z.unknown()),
  status: z.enum(['pending', 'approved', 'rejected']),
  resolvedBy: z.enum(['worker', 'leader']).optional(),
  resolvedAt: z.number().optional(),
  feedback: z.string().optional(),
  updatedInput: z.record(z.string(), z.unknown()).optional(),
  permissionUpdates: z.array(z.unknown()).optional(),
  createdAt: z.number(),
})
```

The teammate writes a permission request to the `pending/` directory and sends a notification to the leader's mailbox. The leader picks up the notification, resolves the request (either through its UI or programmatically), and writes the result to the `resolved/` directory. The teammate polls the `resolved/` directory for a response.

This two-directory pattern (pending/resolved) is a filesystem-based request-response protocol. It avoids the need for bidirectional locking on a single file and makes it easy to inspect pending requests: `ls ~/.claude/teams/my-team/permissions/pending/`.

---

## 33.6 Spawn Utilities

The spawn system (`utils/swarm/spawnInProcess.ts`, 329 lines) coordinates the creation of in-process teammates. It handles identity generation, abort controller creation, task state registration, cleanup handlers, and the initial kick-off of the runner.

### The Spawn Function

```typescript
export async function spawnInProcessTeammate(
  config: InProcessSpawnConfig,
  context: SpawnContext,
): Promise<InProcessSpawnOutput> {
  const { name, teamName, prompt, color, planModeRequired, model } = config
  const { setAppState } = context

  // Generate deterministic agent ID: "name@team"
  const agentId = formatAgentId(name, teamName)
  const taskId = generateTaskId('in_process_teammate')

  // Create independent abort controller
  const abortController = createAbortController()

  // Create teammate context for AsyncLocalStorage
  const teammateContext = createTeammateContext({
    agentId,
    agentName: name,
    teamName,
    color,
    planModeRequired,
    parentSessionId: getSessionId(),
    abortController,
  })

  // Register in Perfetto tracing if enabled
  if (isPerfettoTracingEnabled()) {
    registerPerfettoAgent(agentId, name, getSessionId())
  }

  // Create task state with all lifecycle fields
  const taskState: InProcessTeammateTaskState = {
    type: 'in_process_teammate',
    status: 'running',
    identity: { agentId, agentName: name, teamName, color, planModeRequired },
    prompt,
    model,
    abortController,
    isIdle: false,
    shutdownRequested: false,
    pendingUserMessages: [],
    messages: [],
    // ... other fields ...
  }

  // Register cleanup on parent abort
  const unregisterCleanup = registerCleanup(async () => {
    abortController.abort()
  })
  taskState.unregisterCleanup = unregisterCleanup

  // Register task in global AppState
  registerTask(taskState, setAppState)

  return {
    success: true,
    agentId,
    taskId,
    abortController,
    teammateContext,
  }
}
```

Key design decisions in the spawn function:

**Independent abort controllers.** Each teammate gets its own `AbortController`, but a cleanup handler is registered on the parent so that aborting the parent cascades to all children. This is important for graceful shutdown: the leader can abort individual teammates without killing the whole team, but killing the leader kills everyone.

**Task state in AppState.** The teammate's task state is registered in the global `AppState.tasks` map. This is the same task system used by the Agent tool and background shells (Chapter 14). The leader's UI can list all teammates, show their status, and send them messages through the standard task management interface.

**pendingUserMessages queue.** The task state includes a `pendingUserMessages: []` array that serves as the in-memory fast path for leader-to-teammate communication. When the leader's `SendMessage` tool sends a follow-up to a teammate, it pushes directly into this array. The teammate's idle-wait loop checks this array before hitting the filesystem mailbox.

### Killing a Teammate

```typescript
export function killInProcessTeammate(
  taskId: string,
  setAppState: SetAppStateFn,
): boolean {
  setAppState((prev: AppState) => {
    const task = prev.tasks[taskId]
    if (!task || task.type !== 'in_process_teammate') return prev

    // Abort the controller to stop execution
    task.abortController?.abort()

    // Call cleanup handler
    task.unregisterCleanup?.()

    // Remove from team context
    const { [agentId]: _, ...remainingTeammates } = prev.teamContext.teammates

    return {
      ...prev,
      teamContext: { ...prev.teamContext, teammates: remainingTeammates },
      tasks: {
        ...prev.tasks,
        [taskId]: { ...task, status: 'killed', endTime: Date.now() },
      },
    }
  })
}
```

The kill sequence is designed to be idempotent and safe:

1. **Abort** the teammate's controller, which causes all pending `await` calls to reject with `AbortError`.
2. **Unregister** the cleanup handler so the parent's abort does not double-fire.
3. **Remove** the teammate from `teamContext.teammates` so the leader's UI stops showing it.
4. **Update** the task status to `killed` with an end timestamp.
5. **Remove** the teammate from the team file so the mailbox system stops routing messages to it.

---

## 33.7 Teammate Initialization

When a teammate starts, it needs to configure itself within the team's operational framework. The initialization module (`utils/swarm/teammateInit.ts`, 130 lines) handles this setup.

```typescript
export function initializeTeammateHooks(
  setAppState: (updater: (prev: AppState) => AppState) => void,
  sessionId: string,
  teamInfo: { teamName: string; agentId: string; agentName: string },
): void {
  const { teamName, agentId, agentName } = teamInfo

  // Read team file to discover leader and shared configuration
  const teamFile = readTeamFile(teamName)
  if (!teamFile) return

  // Apply team-wide allowed paths to this teammate's permissions
  if (teamFile.teamAllowedPaths?.length > 0) {
    for (const allowedPath of teamFile.teamAllowedPaths) {
      setAppState(prev => ({
        ...prev,
        toolPermissionContext: applyPermissionUpdate(
          prev.toolPermissionContext,
          {
            type: 'addRules',
            rules: [{ toolName: allowedPath.toolName, ruleContent: path }],
            behavior: 'allow',
            destination: 'session',
          },
        ),
      }))
    }
  }

  // Register Stop hook for idle notifications
  // (Only for non-leader teammates)
  if (agentId !== teamFile.leadAgentId) {
    addFunctionHook(setAppState, sessionId, 'Stop', '', async (messages) => {
      void setMemberActive(teamName, agentName, false)
      const notification = createIdleNotification(agentName, {
        idleReason: 'available',
        summary: getLastPeerDmSummary(messages),
      })
      await writeToMailbox(leadAgentName, {
        from: agentName,
        text: jsonStringify(notification),
        timestamp: new Date().toISOString(),
        color: getTeammateColor(),
      })
      return true
    })
  }
}
```

The initialization does two things:

1. **Permission inheritance.** The team file can declare `teamAllowedPaths` -- directories or file patterns that all teammates are allowed to access. This is useful when the leader grants `Bash` access to the project directory and wants all teammates to inherit that permission without each one asking separately. The rules are added as session-scoped permissions, so they disappear when the teammate stops.

2. **Stop hook registration.** Non-leader teammates register a `Stop` hook that sends an idle notification to the leader's mailbox. This is the mechanism by which the leader knows when a teammate has finished its work. Without this hook, the leader would have to poll each teammate's status -- with it, the notification arrives asynchronously through the mailbox.

---

## 33.8 Constants and Configuration

The swarm system uses a set of named constants (`utils/swarm/constants.ts`) that define the boundaries of multi-agent operation:

```typescript
export const TEAM_LEAD_NAME = 'team-lead'
export const SWARM_SESSION_NAME = 'claude-swarm'
export const SWARM_VIEW_WINDOW_NAME = 'swarm-view'
export const TMUX_COMMAND = 'tmux'
export const HIDDEN_SESSION_NAME = 'claude-hidden'

export const TEAMMATE_COMMAND_ENV_VAR = 'CLAUDE_CODE_TEAMMATE_COMMAND'
export const TEAMMATE_COLOR_ENV_VAR = 'CLAUDE_CODE_AGENT_COLOR'
export const PLAN_MODE_REQUIRED_ENV_VAR = 'CLAUDE_CODE_PLAN_MODE_REQUIRED'
```

The environment variables are the bridge between the in-process and tmux-based teammate systems. When a teammate is spawned as a separate tmux process, these environment variables communicate its identity and configuration. When a teammate is spawned in-process, the same information is passed through the `TeammateContext` and `InProcessRunnerConfig` types.

The `TEAM_LEAD_NAME` constant deserves attention: it is the default name for the leader agent in every team. The mailbox system uses this to route idle notifications and permission requests to the right inbox. When a teammate calls `getLeaderName(teamName)`, it reads the team file, but the fallback is always `TEAM_LEAD_NAME`.

---

## 33.9 Putting It All Together: The Lifecycle of a Team

Let us trace the complete lifecycle of a three-agent team -- a leader, a researcher, and a coder -- to see how all the components interact.

### Phase 1: Team Creation

The user types: "Create a team with a researcher and a coder to implement the new auth module."

The leader's model decides to use the `TeamCreate` tool (covered in Chapter 34). For in-process teammates, this triggers `spawnInProcessTeammate` twice:

```
spawnInProcessTeammate({ name: "researcher", teamName: "auth-impl", prompt: "Research OAuth 2.0..." })
spawnInProcessTeammate({ name: "coder", teamName: "auth-impl", prompt: "Implement the auth module..." })
```

Each call:
1. Creates a `TeammateContext` with `agentId: "researcher@auth-impl"`.
2. Creates an `AbortController` linked to the leader's cleanup chain.
3. Registers a task in `AppState.tasks`.
4. Returns the task ID so the leader can track progress.

### Phase 2: Concurrent Execution

The leader calls `startInProcessTeammate` for each. Both teammates begin executing concurrently in the same Node.js process:

```
[researcher] → runWithTeammateContext(ctx1, () => runAgent({...}))
[coder]      → runWithTeammateContext(ctx2, () => runAgent({...}))
[leader]     → continues processing, can send follow-ups
```

Each `runAgent` call enters the standard query loop (Chapter 4). The researcher calls `WebSearch` and `Read` tools. The coder calls `Write` and `Bash` tools. Their API calls go through the same HTTP client but with different agent IDs in the telemetry headers.

### Phase 3: Permission Request

The coder tries to run `Bash(npm install express)`. The permission system returns `{ behavior: 'ask' }`. The coder's `createInProcessCanUseTool` function pushes a `ToolUseConfirm` entry into the leader's UI queue with `workerBadge: { name: "coder", color: "blue" }`.

The user sees the permission dialog in the leader's REPL:

```
[coder] wants to run: npm install express
  [Allow] [Always Allow] [Reject]
```

The user clicks "Always Allow". The permission rule is persisted and propagated to the leader's permission context with `preserveMode: true`. Future `npm install` calls from any teammate will be auto-allowed.

### Phase 4: Idle and Follow-Up

The researcher finishes and enters the idle-wait loop. It sends an idle notification to the leader's mailbox:

```json
{
  "type": "idle_notification",
  "from": "researcher",
  "idleReason": "available",
  "summary": "Researched OAuth 2.0 PKCE flow, documented in scratchpad"
}
```

The leader receives the notification, reads the scratchpad, and sends a follow-up to the researcher via `SendMessage`:

```
"Now review the coder's implementation against your research findings."
```

This pushes into `AppState.tasks[researcherTaskId].pendingUserMessages`. The researcher's idle-wait loop picks it up on its next 500ms poll cycle and re-enters the agent loop.

### Phase 5: Shutdown

When the work is complete, the leader calls `killInProcessTeammate` for each teammate. The abort controllers fire, the teammates' query loops terminate, the cleanup handlers run, and the task states update to `killed`. The team directory at `~/.claude/teams/auth-impl/` persists on disk for post-mortem inspection.

---

## 33.10 Design Tradeoffs and Lessons

### Single-Process vs. Multi-Process

The in-process swarm system optimizes for low overhead and tight integration. A teammate starts in milliseconds (no process spawn), shares all cached state (tool definitions, MCP connections, file index), and can push permission requests directly into the leader's UI queue. The cost is cooperative multitasking: a teammate doing heavy CPU work blocks others.

The tmux-based system (Chapter 34) optimizes for isolation and resilience. Each teammate is a separate process with its own memory space. A crash in one does not affect others. The cost is higher overhead: each process loads the full CLI, and communication goes through the filesystem with its associated latency.

In practice, most teams use the in-process system. The tmux system is reserved for cases where teammates need different working directories (separate git worktrees) or where the risk of one teammate's crash affecting others is unacceptable.

### Polling vs. Event-Driven

The idle-wait loop polls every 500 milliseconds. This is a deliberate choice over `fs.watch()` or similar event-driven approaches. File system watch APIs are unreliable across platforms (macOS uses kqueue, Linux uses inotify, and both have edge cases around lock files and atomic writes). The 500ms poll interval is low enough that response times feel instant to humans and high enough that the CPU overhead is negligible (one `readFile` call per 500ms per idle teammate).

### Permission Propagation Direction

Permission updates flow from teammates to the leader, never the other direction automatically. When a user approves a permission for a teammate, that approval is persisted to the session rules and becomes visible to all agents. But the leader never pushes new permission rules down to teammates proactively. This avoids a class of bugs where a permission change mid-execution could invalidate a teammate's in-progress tool call.

The `preserveMode: true` flag on permission propagation is critical. Without it, a teammate in `plan` mode that sends a permission update would overwrite the leader's `auto` mode, causing the leader to start requiring plan approval for its own operations. The flag ensures that only the permission rules change, not the permission mode.

---

## 33.11 Summary

The swarm system turns a single-process CLI agent into a multi-agent orchestrator through four interlocking mechanisms:

1. **AsyncLocalStorage context isolation** gives each teammate its own identity without changing function signatures. Code that calls `getTeammateContext()` automatically gets the right context for the current async execution chain.

2. **The in-process runner** manages a teammate's lifecycle: execute the initial prompt, enter idle, poll for new messages, re-enter the agent loop. Teammates persist between prompts, maintaining conversation state and tool results.

3. **The file-based mailbox** provides cross-agent communication that works for both in-process and tmux-based teammates. File locking handles concurrent access, and idle notifications keep the leader informed without polling.

4. **The permission bridge** surfaces teammate tool requests in the leader's UI dialog. Permission updates propagate back to the leader's context with mode preservation, ensuring that "always allow" rules benefit all agents.

In the next chapter, we will build on this foundation with Coordinator Mode -- a higher-level orchestration system that manages teams of teammates using structured task plans, scratchpads for data sharing, and worker autonomy constraints that balance speed against safety.
