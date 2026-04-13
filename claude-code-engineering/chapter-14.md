# Chapter 14: The Task Management System

Managing parallel work requires more than spawning agents — it requires tracking what each agent is doing, what they've completed, what's blocked, and what's waiting to be claimed. Claude Code addresses this with two architecturally independent task systems: an in-memory system for tracking background computations (shell processes, running agents) and a file-based system for coordinating work items across team members. Understanding why these systems are separate — and how they interact — is essential for building any multi-agent coordination layer.

---

## 14.1 Two Task Systems, Two Purposes

The most important architectural insight about Claude Code's task management is that it is not one system — it is two.

### Background Tasks (In-Memory)

The first system tracks running computations in `AppState.tasks`. These are shell processes, running agents, remote sessions, and MCP monitors:

```typescript
export type TaskType =
  | 'local_bash'
  | 'local_agent'
  | 'remote_agent'
  | 'in_process_teammate'
  | 'local_workflow'
  | 'monitor_mcp'
  | 'dream'
```

Background tasks have five states: `pending → running → completed | failed | killed`. They live only in memory and die with the process. Their purpose is UI rendering — showing the user what's running, how long it's been active, and providing kill/view controls.

### User-Facing Tasks (File-Based)

The second system stores work items as individual JSON files on disk at `utils/tasks.ts` (862 lines). These represent todo-list entries visible through the `TaskCreate`, `TaskUpdate`, `TaskGet`, and `TaskList` tools:

```typescript
export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const
```

User-facing tasks have three states (no `failed` or `killed`), persist across process restarts, and support cross-process coordination through file locking. Their purpose is team coordination — when multiple Claude instances run in parallel (swarm mode), they share a task list through the filesystem.

| Dimension | Background Tasks | User-Facing Tasks |
|-----------|-----------------|-------------------|
| Storage | In-memory `AppState` | JSON files on disk |
| Concurrency | React state updates | File locking (`proper-lockfile`) |
| Lifecycle | 5 states (pending→running→completed/failed/killed) | 3 states (pending→in_progress→completed) |
| Cross-process | Single process only | Shared via filesystem |
| Purpose | Track running computations | Coordinate team work items |
| ID Format | Type prefix + 8 random chars | Sequential integers |

---

## 14.2 Background Task Infrastructure

### Task ID Generation

Each task type gets a single-character prefix for visual identification at `Task.ts:78-106`:

```typescript
const TASK_ID_PREFIXES: Record<string, string> = {
  local_bash: 'b',
  local_agent: 'a',
  remote_agent: 'r',
  in_process_teammate: 't',
  local_workflow: 'w',
  monitor_mcp: 'm',
  dream: 'd',
}

const TASK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

export function generateTaskId(type: TaskType): string {
  const prefix = getTaskIdPrefix(type)
  const bytes = randomBytes(8)
  let id = prefix
  for (let i = 0; i < 8; i++) {
    id += TASK_ID_ALPHABET[bytes[i]! % TASK_ID_ALPHABET.length]
  }
  return id
}
```

IDs use 8 random characters from a 36-character alphabet, yielding ~2.8 trillion combinations. This isn't just about uniqueness — the comment explicitly notes this is "sufficient to resist brute-force symlink attacks" since task IDs appear in file paths. A predictable task ID could let a sandboxed attacker pre-create symlinks at the expected output path.

The prefix convention enables quick identification in logs and the UI — seeing `a7f3k2p1` immediately tells you it's an agent task, while `b9x2m4q8` is a shell command.

### Task State Base

Every background task shares a common state shape at `Task.ts:44-57`:

```typescript
export type TaskStateBase = {
  id: string
  type: TaskType
  status: TaskStatus
  description: string
  toolUseId?: string
  startTime: number
  endTime?: number
  totalPausedMs?: number
  outputFile: string
  outputOffset: number
  notified: boolean
}
```

The `outputOffset` tracks how much of the output file the UI has already displayed — enabling incremental output rendering without re-reading the entire file on each frame. The `notified` flag prevents duplicate notifications when a task completes.

### Terminal Status Detection

The `isTerminalTaskStatus()` function at lines 27-29 guards against common multi-agent bugs:

```typescript
export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed'
}
```

This guard prevents injecting messages into dead teammates, evicting finished tasks from `AppState`, and running cleanup on tasks that are still active.

### The Background/Foreground Distinction

At `tasks/types.ts:37-46`, a subtlety: not every running task is a "background" task:

```typescript
export function isBackgroundTask(task: TaskState): task is BackgroundTaskState {
  if (task.status !== 'running' && task.status !== 'pending') return false
  if ('isBackgrounded' in task && task.isBackgrounded === false) return false
  return true
}
```

A task is "background" only if it's running/pending AND not explicitly foregrounded. When the user views a task's output in real-time, `isBackgrounded` is set to `false`, excluding it from the background task indicator even though it's still running.

---

## 14.3 The Task Output System

### Disk Output Architecture

Task output is written to disk through `DiskTaskOutput` at `utils/task/diskOutput.ts` (451 lines), a carefully engineered async write queue:

```typescript
export class DiskTaskOutput {
  #path: string
  #fileHandle: FileHandle | null = null
  #queue: string[] = []
  #bytesWritten = 0
  #capped = false
  #flushPromise: Promise<void> | null = null

  append(content: string): void {
    if (this.#capped) return
    this.#bytesWritten += content.length
    if (this.#bytesWritten > MAX_TASK_OUTPUT_BYTES) {
      this.#capped = true
      this.#queue.push(
        `\n[output truncated: exceeded ${MAX_TASK_OUTPUT_BYTES_DISPLAY}]\n`
      )
    }
    this.#queue.push(content)
    this.#scheduleDrain()
  }
}
```

The design uses a flat array as a write queue processed by a single drain loop. This avoids the memory retention problem of chained `.then()` closures where every queued write captures its data until the entire chain resolves. With a flat array, completed writes are immediately eligible for garbage collection.

The 5GB cap (`MAX_TASK_OUTPUT_BYTES`) prevents runaway processes from filling the disk. When the cap is hit, a truncation message is appended and all further writes are silently dropped.

### Symlink Attack Prevention

Task output files are opened with `O_NOFOLLOW` at lines 17-21:

```typescript
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
```

Without this flag, an attacker in the sandbox could create a symlink from a task output path to an arbitrary system file. When Claude Code writes task output, it would follow the symlink and overwrite the target. With `O_NOFOLLOW`, `open()` fails with `ELOOP` on symlinks, preventing the attack.

### Session-Scoped Output Directory

The output directory is memoized at first access:

```typescript
let _taskOutputDir: string | undefined
export function getTaskOutputDir(): string {
  if (_taskOutputDir === undefined) {
    _taskOutputDir = join(getProjectTempDir(), getSessionId(), 'tasks')
  }
  return _taskOutputDir
}
```

This memoization is a deliberate correctness choice. The `/clear` command calls `regenerateSessionId()`, but existing `DiskTaskOutput` instances still hold old-session paths. If the directory were recomputed on every call, `open()` would fail with `ENOENT` on old paths. By capturing once, all task output paths remain stable throughout the process lifetime.

### Symlink Optimization for Agent Tasks

Agent tasks use `initTaskOutputAsSymlink()` instead of `initTaskOutput()`. This creates a symlink from the task output path to the agent's transcript file — the transcript IS the output:

```
tasks/a12345678.output -> subagents/a12345678/transcript.jsonl
```

This avoids duplicating large agent transcripts on disk (which can grow to hundreds of megabytes for long-running agents) while maintaining the same `TaskOutput` read interface. Any consumer that reads the output path gets the transcript transparently. The symlink itself is protected by the same `O_NOFOLLOW` semantics when the host process reads — ensuring that even if an attacker creates a chain of symlinks, the system fails safely with `ELOOP`.

### The Flush Promise Pattern

External code needs to know when all pending writes are on disk. `DiskTaskOutput` exposes this through a flush promise:

```typescript
#flushPromise: Promise<void> | null = null
#flushResolve: (() => void) | null = null

async flush(): Promise<void> {
  if (this.#queue.length === 0 && !this.#draining) return
  if (!this.#flushPromise) {
    this.#flushPromise = new Promise(resolve => {
      this.#flushResolve = resolve
    })
  }
  return this.#flushPromise
}
```

The drain loop resolves the flush promise when the queue empties. Three callers depend on this:

1. **Test teardown**: Drain before `rmSync` of temp directories. Without flushing, a voided async write could resume after teardown deletes the directory, causing unhandled `ENOENT` rejections — a flaky test pattern that's notoriously hard to debug because the failure appears in an unrelated test.
2. **Task completion**: Ensure all output is persisted before the UI reads the final result. A race between the completion notification and the last write would show truncated output.
3. **Task eviction**: Ensure writes finish before unlinking the output file. Without this, `unlink()` could remove the file while the drain loop still holds an open file handle — the writes succeed (Unix keeps the inode alive) but the data is lost because no path points to the inode anymore.

### Byte Counting Approximation

The `#bytesWritten` counter uses `content.length`, which counts UTF-16 code units rather than UTF-8 bytes. This undercounts by up to ~3x for multi-byte characters. The engineering team accepted this imprecision because:

- The 5GB cap is a coarse disk-fill guard, not a precise quota
- The alternative (`Buffer.byteLength()`) allocates a buffer for every append — unacceptable on the hot path
- A 3x error means the cap triggers between 1.7GB and 5GB actual disk usage — both are acceptable limits for preventing runaway processes

### Write Mode Selection

`DiskTaskOutput` supports two creation modes, chosen based on the task type:

```typescript
export function initTaskOutput(taskId: string): DiskTaskOutput {
  const path = getTaskOutputPath(taskId)
  // O_EXCL prevents overwriting existing files
  openSync(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL)
  return new DiskTaskOutput(path)
}

export function initTaskOutputAsSymlink(
  taskId: string, targetPath: string
): void {
  const outputPath = getTaskOutputPath(taskId)
  symlinkSync(targetPath, outputPath)
}
```

The `O_EXCL` flag in `initTaskOutput()` is a safety measure: if a file already exists at the output path (perhaps from a previous task that reused an ID before the high water mark was implemented), creation fails rather than silently overwriting. This prevents data loss from concurrent tasks.

### Pending Operations Tracking

At lines 76-87, a subtle pattern for test reliability:

```typescript
const _pendingOps = new Set<Promise<unknown>>()

function track<T>(p: Promise<T>): Promise<T> {
  _pendingOps.add(p)
  void p.finally(() => _pendingOps.delete(p)).catch(() => {})
  return p
}

export async function waitForPendingWrites(): Promise<void> {
  while (_pendingOps.size > 0) {
    await Promise.allSettled([..._pendingOps])
  }
}
```

This tracks fire-and-forget write promises so tests can drain them before teardown. Without this, a voided async write could resume after test teardown has deleted the temp directory, causing unhandled `ENOENT` rejections — a flaky test pattern that is notoriously hard to debug because the failure appears in an unrelated test.

### Drain Loop Architecture

The `DiskTaskOutput.#scheduleDrain()` method implements a cooperative write loop:

```typescript
#scheduleDrain(): void {
  if (this.#draining) return  // Already draining
  this.#draining = true
  void this.#drain()
}

async #drain(): Promise<void> {
  try {
    if (!this.#fileHandle) {
      this.#fileHandle = await open(this.#path, 'a', O_NOFOLLOW)
    }
    while (this.#queue.length > 0) {
      const chunk = this.#queue.shift()!
      await this.#fileHandle.write(chunk)
    }
  } finally {
    this.#draining = false
    // Check if more data arrived during the write
    if (this.#queue.length > 0) this.#scheduleDrain()
  }
}
```

The single-drain pattern ensures only one write operation is in-flight at a time, preventing interleaved writes from corrupting the output. New data that arrives during a write is queued and processed on the next drain cycle.

---

## 14.4 User-Facing Task CRUD

### Signal-Based Update Notifications

Every mutation in the task system broadcasts a signal at `utils/tasks.ts:18-67`:

```typescript
const tasksUpdated = createSignal()

export function notifyTasksUpdated(): void {
  try {
    tasksUpdated.emit()
  } catch {
    // Ignore listener errors — task mutations must not fail
  }
}

export const onTasksUpdated = tasksUpdated.subscribe
```

Every CRUD function calls `notifyTasksUpdated()` after writing to disk. The signal is process-local — cross-process coordination relies on filesystem watching via `useTaskListWatcher`. The try/catch around `emit()` is a defensive pattern: a buggy listener should never prevent a task mutation from completing.

### Task Schema

The schema at `utils/tasks.ts:76-89` defines the user-visible task shape:

```typescript
export const TaskSchema = lazySchema(() =>
  z.object({
    id: z.string(),
    subject: z.string(),
    description: z.string(),
    activeForm: z.string().optional(),
    owner: z.string().optional(),
    status: TaskStatusSchema(),
    blocks: z.array(z.string()),
    blockedBy: z.array(z.string()),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
)
```

The `activeForm` field enables rich UI integration — when a task is `in_progress`, its `activeForm` text (e.g., "Running tests") appears in the spinner, giving the user a real-time sense of what work is happening.

### File-Based Storage

Tasks are stored as individual JSON files:

```typescript
export function getTaskPath(taskListId: string, taskId: string): string {
  return join(
    getTasksDir(taskListId),
    `${sanitizePathComponent(taskId)}.json`
  )
}
```

The `sanitizePathComponent()` function strips everything except `[a-zA-Z0-9_-]` to prevent path traversal attacks — a task ID of `../../etc/passwd` is sanitized to `etcpasswd`.

### File Locking Strategy

Two locking granularities serve different operations:

**List-level lock** (`.lock` file in task directory): Used by `createTask()`, `resetTaskList()`, and `claimTaskWithBusyCheck()`. Required when operations need to read the full task list atomically — for example, creating a task needs to find the highest existing ID.

**Task-level lock** (the JSON file itself): Used by `updateTask()` and basic `claimTask()`. Allows concurrent updates to different tasks without serializing on the entire list.

The lock retry configuration is sized for ~10+ concurrent agents:

```typescript
const LOCK_OPTIONS = {
  retries: {
    retries: 30,
    minTimeout: 5,
    maxTimeout: 100,
  },
}
```

Each critical section does `readdir + N*readFile + writeFile` (~50-100ms on slow disks). With 30 retries and exponential backoff (5-100ms), the last caller in a 10-way race gets ~2.6 seconds total wait — enough for all agents to serialize through.

### Task Creation

The `createTask()` function at lines 284-308 acquires the list-level lock, finds the highest existing ID, increments, and writes:

```typescript
export async function createTask(
  taskListId: string, taskData: Omit<Task, 'id'>
): Promise<string> {
  const lockPath = await ensureTaskListLockFile(taskListId)
  let release = await lockfile.lock(lockPath, LOCK_OPTIONS)
  try {
    const highestId = await findHighestTaskId(taskListId)
    const id = String(highestId + 1)
    const task: Task = { id, ...taskData }
    await writeFile(getTaskPath(taskListId, id), jsonStringify(task, null, 2))
    notifyTasksUpdated()
    return id
  } finally {
    await release()
  }
}
```

### ID Reuse Prevention

The high water mark pattern at lines 92-131 prevents a subtle bug:

1. Create tasks 1, 2, 3
2. Delete task 3
3. Reset the task list
4. **Without high water mark**: Next task would be ID 1 (highest from files = 0)
5. **With high water mark**: Next task is ID 4 (mark stored 3 before deletion)

This matters because external references to task IDs — in mailbox messages, agent transcripts, and user notes — would break if IDs were recycled.

### Task Dependencies

The `blockTask()` function creates bidirectional blocking relationships:

```typescript
export async function blockTask(
  taskListId: string, fromTaskId: string, toTaskId: string
): Promise<boolean> {
  // A blocks B: fromTask.blocks += [toTaskId]
  // B blockedBy A: toTask.blockedBy += [fromTaskId]
}
```

When a task is deleted, reference cleanup cascades — the deleted task's ID is removed from all other tasks' `blocks` and `blockedBy` arrays. This prevents dangling references that would permanently block dependent tasks.

### Task Claiming

Atomic task claiming with comprehensive failure reporting at lines 541-612:

```typescript
export type ClaimTaskResult = {
  success: boolean
  reason?: 'task_not_found' | 'already_claimed' | 'already_resolved'
         | 'blocked' | 'agent_busy'
  task?: Task
  busyWithTasks?: string[]
  blockedByTasks?: string[]
}
```

The `claimTaskWithBusyCheck()` variant uses a list-level lock to atomically verify both the task state and whether the claiming agent already owns other open tasks:

```typescript
async function claimTaskWithBusyCheck(
  taskListId: string, taskId: string, claimantAgentId: string
): Promise<ClaimTaskResult> {
  const lockPath = await ensureTaskListLockFile(taskListId)
  let release = await lockfile.lock(lockPath, LOCK_OPTIONS)
  const allTasks = await listTasks(taskListId)
  const agentOpenTasks = allTasks.filter(
    t => t.status !== 'completed'
      && t.owner === claimantAgentId
      && t.id !== taskId
  )
  if (agentOpenTasks.length > 0) {
    return {
      success: false,
      reason: 'agent_busy',
      busyWithTasks: agentOpenTasks.map(t => t.id)
    }
  }
  // ... proceed with claim under the same lock
}
```

This prevents TOCTOU race conditions where two instances of the same agent try to claim different tasks simultaneously. Without the list-level lock, agent A could check "am I busy?" (no), while agent B simultaneously checks "am I busy?" (also no), and both claim tasks — leaving one agent overcommitted.

### Task List Reset

The `resetTaskList()` function at lines 147-188 deletes all task files while preserving the high water mark:

```typescript
export async function resetTaskList(taskListId: string): Promise<void> {
  const lockPath = await ensureTaskListLockFile(taskListId)
  release = await lockfile.lock(lockPath, LOCK_OPTIONS)
  const currentHighest = await findHighestTaskIdFromFiles(taskListId)
  if (currentHighest > 0) {
    const existingMark = await readHighWaterMark(taskListId)
    if (currentHighest > existingMark) {
      await writeHighWaterMark(taskListId, currentHighest)
    }
  }
  // Delete all .json files (skip hidden files like .highwatermark, .lock)
  for (const file of files) {
    if (file.endsWith('.json') && !file.startsWith('.')) {
      await unlink(join(dir, file))
    }
  }
}
```

The hidden file convention (`.highwatermark`, `.lock`) ensures administrative files survive task list resets. Only user-visible task JSON files are deleted.

### Task List Identity

The task list ID determines which task list a process reads/writes:

```typescript
export function getTaskListId(): string {
  if (process.env.CLAUDE_CODE_TASK_LIST_ID) return it
  const teammateCtx = getTeammateContext()
  if (teammateCtx) return teammateCtx.teamName
  return getTeamName() || leaderTeamName || getSessionId()
}
```

Five levels of priority ensure all team members share the same list, whether they're in-process teammates, tmux-based parallel sessions, or iTerm2-spawned instances.

---

## 14.5 Agent Status and Team Coordination

### Agent Status Tracking

Beyond individual task CRUD, the task system provides team-level status tracking through `getAgentStatuses()` at lines 763-798:

```typescript
export type AgentStatus = {
  agentId: string
  name: string
  agentType?: string
  status: 'idle' | 'busy'
  currentTasks: string[]  // task IDs the agent owns
}

export async function getAgentStatuses(
  teamName: string
): Promise<AgentStatus[] | null> {
  const teamData = await readTeamMembers(teamName)
  if (!teamData) return null

  const taskListId = sanitizeName(teamName)
  const allTasks = await listTasks(taskListId)

  // Group unresolved tasks by owner
  const unresolvedTasksByOwner = new Map<string, string[]>()
  for (const task of allTasks) {
    if (task.status !== 'completed' && task.owner) {
      const existing = unresolvedTasksByOwner.get(task.owner) || []
      existing.push(task.id)
      unresolvedTasksByOwner.set(task.owner, existing)
    }
  }

  return teamData.members.map(member => {
    // Check both name (new) and agentId (legacy) for backward compat
    const tasksByName = unresolvedTasksByOwner.get(member.name) || []
    const tasksById = unresolvedTasksByOwner.get(member.agentId) || []
    const currentTasks = uniq([...tasksByName, ...tasksById])
    return {
      agentId: member.agentId,
      name: member.name,
      agentType: member.agentType,
      status: currentTasks.length === 0 ? 'idle' : 'busy',
      currentTasks,
    }
  })
}
```

The backward compatibility pattern here is instructive. Early versions of the team system used `agentId` as the task ownership key; newer versions use `member.name`. By checking both fields and deduplicating with `uniq()`, the function handles teams that contain a mix of old and new-format ownership references. This is the kind of migration-safe code you need when your data persists on disk and different versions of the software may have written it.

The `idle`/`busy` distinction drives the team coordinator's work allocation. When the coordinator sees idle teammates, it can assign new tasks. When all teammates are busy, it waits for completion signals rather than queuing more work — a backpressure mechanism that prevents task pile-up.

### Teammate Cleanup on Exit

When a teammate exits — whether through graceful shutdown or termination — its unfinished tasks must be reclaimed. The `unassignTeammateTasks()` function at lines 818-860 handles this:

```typescript
export async function unassignTeammateTasks(
  teamName: string,
  teammateId: string,
  teammateName: string,
  reason: 'terminated' | 'shutdown',
): Promise<UnassignTasksResult> {
  const tasks = await listTasks(teamName)
  const unresolvedAssignedTasks = tasks.filter(
    t => t.status !== 'completed'
      && (t.owner === teammateId || t.owner === teammateName),
  )

  // Unassign each task and reset status to pending
  for (const task of unresolvedAssignedTasks) {
    await updateTask(teamName, task.id, {
      owner: undefined,
      status: 'pending',
    })
  }

  // Build notification message
  const actionVerb = reason === 'terminated'
    ? 'was terminated'
    : 'has shut down'
  let notificationMessage = `${teammateName} ${actionVerb}.`
  if (unresolvedAssignedTasks.length > 0) {
    const taskList = unresolvedAssignedTasks
      .map(t => `#${t.id} "${t.subject}"`)
      .join(', ')
    notificationMessage +=
      ` ${unresolvedAssignedTasks.length} task(s) were unassigned: ${taskList}.`
    notificationMessage +=
      ` Use TaskList to check availability and TaskUpdate to reassign.`
  }

  return {
    unassignedTasks: unresolvedAssignedTasks.map(t => ({
      id: t.id,
      subject: t.subject,
    })),
    notificationMessage,
  }
}
```

Two key design choices here:

**Tasks reset to `pending`, not just unowned.** An `in_progress` task with no owner would confuse the auto-claiming logic — is it available or being worked on? By resetting to `pending`, the task re-enters the normal claim pipeline and appears as available work in `useTaskListWatcher`.

**The notification message includes actionable instructions.** Rather than just saying "tasks were unassigned," the message tells the coordinator exactly what to do next: use `TaskList` to see availability, use `TaskUpdate` to reassign. This pattern — embedding the next action in the notification — is borrowed from runbook-style operations and significantly reduces the cognitive load on the receiving agent.

### Default Task List ID

For standalone task mode (no team context), a hardcoded fallback:

```typescript
export const DEFAULT_TASKS_MODE_TASK_LIST_ID = 'tasklist'
```

This allows the task tools to function even when no team is active. A single user can create and track tasks without the overhead of team coordination. The task list is still file-based and persists across sessions.

---

## 14.6 Task Retrieval and Schema Migration

### Reading Tasks with Migration

The `getTask()` function at lines 310-350 does more than simple file I/O — it handles schema migration for tasks created by older versions:

```typescript
export async function getTask(
  taskListId: string, taskId: string
): Promise<Task | null> {
  const path = getTaskPath(taskListId, taskId)
  try {
    const content = await readFile(path, 'utf-8')
    const data = jsonParse(content) as { status?: string }

    // TEMPORARY: Migrate old status names (Anthropic-internal)
    if (process.env.USER_TYPE === 'ant') {
      if (data.status === 'open') data.status = 'pending'
      else if (data.status === 'resolved') data.status = 'completed'
      else if (['planning', 'implementing', 'reviewing', 'verifying']
                .includes(data.status as string))
        data.status = 'in_progress'
    }

    const parsed = TaskSchema().safeParse(data)
    if (!parsed.success) {
      logForDebugging(
        `[Tasks] Task ${taskId} failed schema validation: ${parsed.error.message}`
      )
      return null
    }
    return parsed.data
  } catch (e) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') return null
    throw e
  }
}
```

The migration logic reveals an evolutionary design decision. The original task system had 6 statuses (`open`, `planning`, `implementing`, `reviewing`, `verifying`, `resolved`), reflecting a waterfall-like workflow. The system was simplified to 3 statuses (`pending`, `in_progress`, `completed`) — the granular statuses didn't provide enough value to justify the complexity, and they confused agents that tried to transition through all stages sequentially instead of just doing the work.

The migration is guarded behind `USER_TYPE === 'ant'` (Anthropic-internal) because only internal users had data with old status names. External users never saw the 6-status system, so the migration code doesn't run for them. This pattern — environment-gated migrations — allows the team to ship breaking schema changes without affecting external users.

The `ENOENT` catch on reads is essential for eventual consistency in multi-process environments. Between the time `listTasks()` reads the directory and `getTask()` reads the individual file, another process could have deleted the task. Returning `null` instead of throwing propagates the deletion gracefully.

---

## 14.7 Task Tools

### TaskCreateTool

Creates tasks with `pending` status and empty dependency arrays. Integrates with the hook system — `executeTaskCreatedHooks` fires after creation, and if a hook blocks (exit code 2), the task is deleted. This enables enterprise policies that validate task content before allowing creation.

### TaskUpdateTool

The most complex task tool at 406 lines. Beyond basic field updates, it implements several behaviors:

- **Pseudo-status `deleted`**: Calling with `status: 'deleted'` triggers `deleteTask()` — there is no `deleted` status in the schema, it's an action masquerading as a state
- **Auto-ownership**: When a teammate marks a task `in_progress` without specifying an owner, it auto-assigns itself
- **Mailbox notification**: Ownership changes trigger `writeToMailbox()` to notify the new owner
- **Verification nudge**: When 3+ tasks are all marked `completed` without running verification, prompts the agent to consider quality checking — a soft guardrail that balances productivity with rigor
- **Hook integration**: `executeTaskCompletedHooks` fires on completion, allowing hooks to verify or validate before the transition is finalized

### TaskListTool

Lists all tasks with two filtering behaviors:
- Tasks with metadata keys prefixed with `_internal` are hidden
- The `blockedBy` array is filtered to show only unresolved blockers (pending/in_progress tasks), so completed blockers don't appear as active constraints

### TaskStopTool

Stops running background tasks by ID. Validates the task exists and is in a running state, then delegates to the task-type-specific `kill()` implementation — each task type knows how to terminate itself (aborting an HTTP request is different from killing a shell process).

---

## 14.8 The Task List Watcher

The `useTaskListWatcher` hook at `hooks/useTaskListWatcher.ts` (221 lines) bridges the file-based task system with React's rendering lifecycle. This is where the pull-based work distribution model comes to life.

### Filesystem Watching

The watcher uses `fs.watch` on the task directory:

```typescript
const watcher = watch(tasksDir, { persistent: false }, (eventType) => {
  // Debounce: ignore events within 1 second of last read
  if (Date.now() - lastReadTime < DEBOUNCE_MS) return
  lastReadTime = Date.now()
  refreshTasks()
})
```

The 1-second debounce is critical for preventing thundering herd effects. When a coordinator creates 10 tasks in rapid succession, each `writeFile` triggers a filesystem event. Without debounce, the watcher would read the task list 10 times — and 10 agents would all try to claim the same first task simultaneously. With debounce, one read captures all 10 tasks, and the claiming logic distributes them efficiently.

The `persistent: false` option ensures the watcher doesn't keep the process alive. Without this, a stale watcher would prevent graceful shutdown — the Node.js event loop would never drain because the filesystem watcher holds an active handle.

### Auto-Claim Logic

When the watcher detects new tasks, it runs the auto-claim algorithm:

```typescript
function tryClaimNextTask(tasks: Task[]): Task | null {
  const claimable = tasks.filter(
    t => t.status === 'pending'
      && !t.owner
      && t.blockedBy.every(blockerIsResolved)
  )
  if (claimable.length === 0) return null

  // Claim the first available (lowest ID = oldest)
  const target = claimable[0]
  const result = await claimTaskWithBusyCheck(
    taskListId, target.id, agentId
  )
  if (result.success) return result.task
  return null  // Another agent claimed it first
}
```

The oldest-first ordering (lowest ID) ensures fairness — tasks are processed in creation order. If the claim fails because another agent got there first (TOCTOU race), the function returns null and the watcher tries again on the next filesystem event.

### Prompt Generation

Claimed tasks are converted to natural language prompts and submitted through the `onSubmitTask` callback:

```typescript
function formatTaskAsPrompt(task: Task): string {
  let prompt = `Work on task #${task.id}: ${task.subject}\n\n`
  prompt += task.description
  if (task.blockedBy.length > 0) {
    prompt += `\n\nNote: This task was blocked by tasks ${
      task.blockedBy.join(', ')
    } which are now resolved.`
  }
  return prompt
}
```

This makes claimed tasks appear as if the user typed them — the agent receives a normal prompt through the standard query pipeline and processes the task using its full capabilities. The dependency context (which blockers were resolved) helps the agent understand the sequencing and potentially leverage work done by the blocking tasks.

### React Ref Stability

The hook uses React refs to stabilize unstable props, working around a known Bun `PathWatcherManager` deadlock:

```typescript
const onSubmitTaskRef = useRef(onSubmitTask)
onSubmitTaskRef.current = onSubmitTask

// In the effect, use the ref, not the prop
onSubmitTaskRef.current(formatTaskAsPrompt(task))
```

Without refs, the effect would re-run on every render (because the callback prop is a new function each time), which would re-create the filesystem watcher, which triggers a Bun-specific deadlock in `PathWatcherManager` when watchers are rapidly created and destroyed. The ref pattern avoids this by keeping the same effect instance and just updating the callback it calls.

---

## 14.9 Integration Points

### With the Agent System (Chapter 13)

`registerAsyncAgent()` creates `LocalAgentTask` entries in `AppState.tasks`. The lifecycle functions `completeAsyncAgent()`, `failAsyncAgent()`, and `killAsyncAgent()` transition background task states. `TaskStop` triggers agent abort via `AbortController`.

### With the Hook System (Chapter 10)

`executeTaskCreatedHooks` and `executeTaskCompletedHooks` fire at task lifecycle boundaries. Hooks can block task creation (rejecting invalid tasks) or completion (requiring verification before marking done).

### With the Mailbox System (Chapter 13)

Ownership changes trigger mailbox notifications. When a task is reassigned, the new owner receives a message with the task subject and description, enabling them to pick up work without polling the task list.

---

## 14.10 Engineering Patterns

**Dual-system separation**: In-memory state for fast UI rendering, file-based persistence for cross-process coordination. The two systems share naming conventions but are architecturally independent, each optimized for its use case. This is a common pattern in distributed systems — the coordination substrate has different requirements than the execution substrate.

**High water mark for monotonic IDs**: Prevents ID recycling that would break external references. A simple counter in a hidden file, read during creation and updated during deletion. The cost is one extra file read per creation — negligible compared to the file locking overhead.

**Bidirectional dependency cleanup**: Deleting a task cascades through all other tasks' `blocks`/`blockedBy` arrays. Without this cleanup, deleted tasks would become phantom blockers that permanently prevent dependent tasks from being claimed. The cascade is O(N) in the number of tasks, but N is bounded by team size.

**Verification nudge over enforcement**: The 3-task-completion nudge prompts rather than blocks. This respects agent autonomy while guarding against careless bulk completion — a pattern applicable to any system where you want guardrails without hard stops. The threshold (3 tasks) was chosen empirically: a single completion is probably fine, but batch-completing many tasks suggests the agent may be cutting corners.

**Pull-based work distribution**: Agents watch the task list and claim work autonomously rather than being assigned tasks by a coordinator. This removes the coordinator as a bottleneck and allows agents to self-organize based on their capabilities and availability. The 1-second debounce in `useTaskListWatcher` prevents thundering herd effects while keeping response times fast.

**Polymorphic kill, nothing else**: The `Task` interface has been stripped to a single method:

```typescript
export type Task = {
  name: string
  type: TaskType
  kill(taskId: string, setAppState: SetAppState): Promise<void>
}
```

The comment in the source explains: "spawn/render were never called polymorphically (removed in #22546). All six kill implementations use only setAppState." This is an example of the codebase evolving toward simplicity — what started as a rich interface was trimmed to only the method that actually varied across task types. The lesson: don't design interfaces speculatively. Start minimal and add methods when you have concrete callers.

**Environment-gated schema migration**: The `getTask()` status migration is guarded behind `USER_TYPE === 'ant'`. This allows the team to ship breaking schema changes to internal users (who had data in the old format) without affecting external users (who never saw the old format). When you have different user populations with different data histories, conditional migration is cleaner than universal migration that no-ops for most users.

**Signal-based notification with defensive catches**: Every task mutation fires `notifyTasksUpdated()` wrapped in a try/catch. A buggy listener should never prevent a task mutation from completing. This is a general principle for event systems: mutations are more important than notifications. If you must choose, lose the notification, not the data.

---

## Summary

The task management system provides the coordination substrate for multi-agent work in Claude Code. The dual-system architecture — in-memory for background computation tracking, file-based for team work coordination — reflects the reality that different coordination patterns require different storage and concurrency models.

For engineers building multi-agent systems, the key takeaway is that task management is fundamentally a distributed systems problem. File locking, ID monotonicity, reference cleanup, and TOCTOU prevention are not academic concerns — they're practical necessities when 10+ agents compete for work items on a shared filesystem. The patterns here (high water marks, bidirectional dependency cleanup, auto-claiming with busy checks, teammate cleanup on exit) are individually simple but essential in combination — each one prevents a specific class of bugs that would be nearly impossible to reproduce in single-process testing but would surface immediately under concurrent agent load.

The cleanup and migration patterns are equally important. A team-based system must handle teammates disappearing (crashes, timeouts, resource limits), data schema evolution (old status names persisting on disk), and backward compatibility (agentId vs. name ownership formats). These are the unglamorous parts of distributed system engineering, but they're what separate a prototype from a production system.

In Chapter 15, we examine the MCP integration layer — the system that extends Claude Code's capabilities by connecting to external servers through the Model Context Protocol, adding tools, resources, and prompts from any language runtime.
