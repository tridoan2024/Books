# Chapter 3: Global State Architecture

## The Deliberate Choice of Mutable State

Claude Code uses global mutable state. Not dependency injection. Not a service container. Not event sourcing. A single mutable object defined in `bootstrap/state.ts` -- 1,759 lines containing a 90+ field type definition, its initializer, and ~130 accessor functions.

The file opens with a warning: **"DO NOT ADD MORE STATE HERE -- BE JUDICIOUS WITH GLOBAL STATE"** (line 31). The initializer is preceded by: **"ALSO HERE -- THINK THRICE BEFORE MODIFYING"** (line 259). The singleton instantiation: **"AND ESPECIALLY HERE"** (line 428). These increasingly emphatic warnings at three different locations -- the type definition, the initializer, and the singleton -- form a gradient of caution that suggests hard-won lessons from state-related bugs. The team isn't unaware of the trade-offs. They've chosen this pattern deliberately, and understanding why illuminates a broader principle about matching architecture to application constraints.

---

## Why Not Dependency Injection?

Three properties of Claude Code make DI a poor fit:

**1. Single-process, single-thread.** Claude Code is a CLI application with one user, one conversation, one agent loop. There's no concurrent mutation problem because there's one execution context. The primary argument for DI -- isolating dependencies to manage concurrency -- doesn't apply.

**2. Deep call stacks.** The path from a user prompt to a tool execution to a permission check to a bash security analysis is 15+ function calls deep. Threading state through every function signature would require changing hundreds of signatures and adding parameter-passing boilerplate that obscures the actual logic.

Consider what a permission check looks like with global state:

```typescript
export function isAllowed(toolName: string, input: unknown): boolean {
  const mode = getPermissionMode();  // reads STATE
  const rules = getPermissionRules(); // reads STATE
  return evaluate(mode, rules, toolName, input);
}
```

With DI, every function in the chain needs a context parameter:

```typescript
export function isAllowed(ctx: AppContext, toolName: string, input: unknown): boolean {
  const mode = ctx.permissionMode;
  const rules = ctx.permissionRules;
  return evaluate(mode, rules, toolName, input);
}
```

Multiply this by hundreds of callsites. The `ctx` parameter becomes noise -- it's in every function signature but most functions only read one or two fields from it.

**3. Cross-cutting concerns.** Telemetry counters, model usage tracking, session identity, and cost accounting need to be accessible from every layer. These genuinely are global concerns in a single-process application. DI containers handle this with "singleton" scope -- which is just global state with extra steps.

The engineering lesson: **choose the simplest state management that your application constraints allow.** For a single-process CLI, a guarded global singleton is simpler than DI, has zero runtime overhead, and the downsides (testing difficulty, implicit dependencies) are manageable with the patterns described later in this chapter.

---

## The State Type

The `State` type in `bootstrap/state.ts` (lines 45-257) defines every field. Let's examine it by category, because the categories reveal the architectural concerns of a CLI agent:

### Identity & Navigation

```typescript
type State = {
  originalCwd: string      // Entry directory, never changes
  projectRoot: string      // Stable root -- NOT updated by EnterWorktreeTool
  cwd: string              // Current working directory (updated by cd)
  sessionId: SessionId     // UUID generated at startup
  parentSessionId: SessionId | undefined  // For session lineage
  sessionProjectDir: string | null        // Override for cross-project resume
  sessionSource: string | undefined       // Origin tracking
  // ...
}
```

Three different "where am I?" fields solve three different problems:
- `originalCwd` is the directory the user launched `claude` from. It never changes. It's used to derive the transcript file path.
- `projectRoot` is set once at startup (including by `--worktree`). It anchors project identity -- skills, history, and session lookup use this, not `cwd`. Mid-session `EnterWorktreeTool` deliberately does **not** update it, so worktree experiments don't relocate your project.
- `cwd` is the current working directory, updated by the shell tool's `cd` command. File operations use this.

This three-way split prevents a bug where entering a worktree mid-session would cause Claude Code to look for your `CLAUDE.md`, skills, and session history in the worktree instead of the project root.

`sessionProjectDir` serves a narrower role: when `--resume` loads a session from a different project, this override ensures the session's data directory points to the original project, not the current `projectRoot`. It always changes together with `sessionId` through the `switchSession()` function -- more on that in the Atomic Switch Pattern section.

### Telemetry Counters

```typescript
  // Cost tracking
  totalCostUSD: number
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number

  // Per-turn metrics (reset each turn)
  turnHookDurationMs: number
  turnToolDurationMs: number
  turnClassifierDurationMs: number
  turnToolCount: number
  turnHookCount: number
  turnClassifierCount: number

  // Aggregate metrics
  totalLinesAdded: number
  totalLinesRemoved: number
  startTime: number
  lastInteractionTime: number

  // OpenTelemetry providers
  meter: Meter | null
  sessionCounter: AttributedCounter | null
  locCounter: AttributedCounter | null
  prCounter: AttributedCounter | null
  commitCounter: AttributedCounter | null
  costCounter: AttributedCounter | null
  tokenCounter: AttributedCounter | null
  codeEditToolDecisionCounter: AttributedCounter | null
  activeTimeCounter: AttributedCounter | null
  statsStore: { observe(name: string, value: number): void } | null
```

Two categories of telemetry: **session-lifetime counters** (`totalCostUSD`, `totalLinesAdded`) and **per-turn counters** (`turnHookDurationMs`, `turnToolCount`). Per-turn counters reset at the start of each query loop iteration, enabling per-turn performance tracking without accumulating noise from previous turns.

The accumulator functions that update these counters always update both levels atomically:

```typescript
export function addToToolDuration(duration: number): void {  // line 586
  STATE.totalToolDuration += duration
  STATE.turnToolDurationMs += duration
  STATE.turnToolCount++
}
```

The OTel providers (`meter`, `sessionCounter`, etc.) are initialized to `null` and populated during telemetry setup. Functions that emit telemetry check for `null` -- if telemetry is disabled, the provider stays `null` and events are silently dropped.

### Model & API State

```typescript
  modelUsage: { [modelName: string]: ModelUsage }
  mainLoopModelOverride: ModelSetting | undefined
  initialMainLoopModel: ModelSetting
  modelStrings: ModelStrings | null
  hasUnknownModelCost: boolean

  lastAPIRequest: Omit<BetaMessageStreamParams, 'messages'> | null
  lastAPIRequestMessages: BetaMessageStreamParams['messages'] | null
  lastClassifierRequests: unknown[] | null
  lastMainRequestId: string | undefined
  lastApiCompletionTimestamp: number | null
```

`modelUsage` tracks token counts per model -- input, output, cache read, cache creation, web search requests. This powers the `/stats` display and cost estimation.

`mainLoopModelOverride` vs. `initialMainLoopModel` handles the `/model` command: the initial model is set at startup from settings, the override captures runtime changes. The system always checks the override first, falling back to the initial.

`lastAPIRequest` and `lastAPIRequestMessages` are stored for bug reports and the `/share` command. They capture the exact post-compaction, `CLAUDE.md`-injected message set sent to the API, so the serialized conversation reflects reality.

`hasUnknownModelCost` is a pricing gap flag -- when the user connects to a model not in the cost table, this flag triggers a warning in `/stats` rather than silently showing $0.00.

### Cache Latching

Five boolean fields use a pattern called **cache latching**:

```typescript
  // Sticky-on latch for AFK_MODE_BETA_HEADER
  afkModeHeaderLatched: boolean | null
  // Sticky-on latch for FAST_MODE_BETA_HEADER
  fastModeHeaderLatched: boolean | null
  // Sticky-on latch for cache-editing beta header
  cacheEditingHeaderLatched: boolean | null
  // Sticky-on latch for clearing thinking from prior tool loops
  thinkingClearLatched: boolean | null
  // Sticky-on latch for 1h cache TTL eligibility
  promptCache1hEligible: boolean | null
```

Cache latching means: once set to a value, the field never reverts during the current session. The three states are:
- `null` -- not yet evaluated this session
- `true` -- latched on, stays on

The state transition is one-directional: `null --> true`. There is no `true --> null` and no `true --> false`.

Why? **Prompt cache economics.** The Claude API caches system prompts and early conversation turns. A cache hit costs roughly 10% of a cache miss. When you change an API header (like toggling fast mode), the API treats it as a different request -- the cache key changes, and you pay full price for a cache miss on 50-70K tokens of system prompt.

Here's how fast mode latching works in practice:

```
Turn 1: User enables fast mode --> fastModeHeaderLatched = true
Turn 2: User disables fast mode --> fastModeHeaderLatched stays true
Turn 3: Fast mode header still sent --> cache HIT (saves ~7x cost)
```

Without latching:

```
Turn 1: User enables fast mode --> header sent
Turn 2: User disables fast mode --> header removed --> cache MISS (7x cost)
Turn 3: User enables fast mode --> header sent --> cache MISS (7x cost)
```

The `thinkingClearLatched` field has a different trigger: it activates when the time since the last API call exceeds 1 hour. At that point, the prompt cache has definitely expired (5-minute default TTL, or 1-hour extended TTL), so there's no cache-hit benefit to keeping old thinking blocks. The latch removes them from the message history, reducing token count for the cache-miss turn. Once latched, it stays on -- the newly-warmed cache without thinking blocks shouldn't be busted by flipping back.

Each latch represents real money. A 70K-token system prompt cache miss costs ~$0.20 vs ~$0.03 for a hit. Across millions of API calls per day across all users, preventing unnecessary cache misses saves significant infrastructure cost.

The latches are cleared by `clearBetaHeaderLatches()` (line 1744), which resets all five to `null`. This fires only on `/clear` and `/compact` -- the two commands that reset conversation context. Since those commands also reset the prompt content, the cache key changes regardless, so clearing the latches is safe.

### Session Flags

```typescript
  isInteractive: boolean           // true = REPL, false = --print
  kairosActive: boolean            // Assistant mode (Kairos)
  sessionBypassPermissionsMode: boolean
  scheduledTasksEnabled: boolean
  sessionTrustAccepted: boolean
  sessionPersistenceDisabled: boolean
  hasExitedPlanMode: boolean
  needsPlanModeExitAttachment: boolean
  needsAutoModeExitAttachment: boolean
  lspRecommendationShownThisSession: boolean
  isRemoteMode: boolean
  pendingPostCompaction: boolean
```

These are session-scoped booleans that track "has X happened yet?" They're never persisted to disk -- they reset with each session. The naming convention (`session*`, `hasExited*`, `needs*Attachment`) makes it clear these are ephemeral.

`pendingPostCompaction` deserves special attention. It implements a **consume-once** signaling pattern:

```typescript
export function markPostCompaction(): void {          // line 771
  STATE.pendingPostCompaction = true
}

export function consumePostCompaction(): boolean {    // line 776
  const was = STATE.pendingPostCompaction
  STATE.pendingPostCompaction = false
  return was
}
```

This is a one-shot flag: set by the compaction system, consumed (read-and-clear) by the next API success logger. It distinguishes compaction-induced cache misses from natural TTL expiry in analytics. Without it, the cache break detection system (Chapter 5) would fire false alarms after every compaction.

### Runtime Collections

```typescript
  sessionCronTasks: SessionCronTask[]
  sessionCreatedTeams: Set<string>
  invokedSkills: Map<string, {
    skillName: string
    skillPath: string
    content: string
    invokedAt: number
    agentId: string | null
  }>
  agentColorMap: Map<string, AgentColorName>
  agentColorIndex: number
  planSlugCache: Map<string, string>
  systemPromptSectionCache: Map<string, string | null>
  allowedChannels: ChannelEntry[]
  inMemoryErrorLog: Array<{ error: string; timestamp: string }>
  slowOperations: Array<{ operation: string; durationMs: number; timestamp: number }>
```

`invokedSkills` is particularly interesting. Skills are keyed by `${agentId ?? ''}:${skillName}` to prevent cross-agent overwrites. When a skill is invoked (e.g., `/code-review`), its content is cached here. During context compaction, the system needs to preserve skill content -- if it's summarized away, the model loses the skill instructions. The cache provides the original content for re-injection post-compaction. The `clearInvokedSkills` function accepts an optional `preservedAgentIds` set -- during compaction, skills belonging to active agents are preserved while others are evicted.

`agentColorMap` assigns unique terminal colors to subagents for visual differentiation. The `agentColorIndex` increments monotonically to ensure no two agents share a color within a session.

`inMemoryErrorLog` is a circular buffer capped at 100 entries via `shift()`. It never persists to disk -- it exists for in-session debugging and the `/share` command.

### Configuration Sources

```typescript
  allowedSettingSources: [
    'userSettings',
    'projectSettings',
    'localSettings',
    'flagSettings',
    'policySettings',
  ]
```

This array defines the precedence order for settings resolution (Chapter 2). It's stored in state rather than hardcoded so that test environments and special modes can restrict which sources are consulted -- a managed deployment might strip `localSettings` to prevent per-user overrides.

---

## The Initializer

`getInitialState()` (lines 260-426) creates the State object with defaults:

```typescript
function getInitialState(): State {
  // Resolve symlinks in cwd to match behavior of shell.ts setCwd
  let resolvedCwd = ''
  if (
    typeof process !== 'undefined' &&
    typeof process.cwd === 'function' &&
    typeof realpathSync === 'function'
  ) {
    const rawCwd = cwd()
    try {
      resolvedCwd = realpathSync(rawCwd).normalize('NFC')
    } catch {
      // File Provider EPERM on CloudStorage mounts (lstat per path component)
      resolvedCwd = rawCwd.normalize('NFC')
    }
  }

  const state: State = {
    originalCwd: resolvedCwd,
    projectRoot: resolvedCwd,
    cwd: resolvedCwd,
    totalCostUSD: 0,
    sessionId: randomUUID() as SessionId,
    allowedSettingSources: [
      'userSettings',
      'projectSettings',
      'localSettings',
      'flagSettings',
      'policySettings',
    ],
    // ... 80+ more fields initialized to defaults
  }
  return state
}

const STATE: State = getInitialState()
```

Four details worth noting:

**1. Symlink resolution.** `realpathSync(rawCwd).normalize('NFC')` resolves symlinks and normalizes Unicode. Without this, the same directory accessed via a symlink and its target would produce different project hashes, leading to duplicate session histories and skill lookups.

**2. NFC normalization.** macOS uses NFD (decomposed) Unicode in file paths by default. A filename like "cafe" is stored as `cafe\u0301` (NFD) in the filesystem but typed as `caf\u00E9` (NFC) by users. Normalizing to NFC prevents "same directory, different string" bugs.

**3. CloudStorage fallback.** The `try/catch` around `realpathSync` handles macOS File Provider volumes (iCloud, OneDrive, Dropbox) that throw `EPERM` on `lstat` for individual path components. In that case, the raw (potentially symlinked) path is used -- an imperfect fallback that avoids crashing on startup.

**4. `typeof process` guard.** The `typeof process !== 'undefined'` check enables a browser-SDK build path where `process` doesn't exist. This guard allows the same state module to be imported in non-Node environments without crashing.

**5. Module-level instantiation.** `const STATE: State = getInitialState()` runs at module evaluation time. By the time any other module imports from `bootstrap/state.ts`, the state is already initialized. This is why `bootstrap/state.ts` sits at Layer 0 of the import hierarchy (Chapter 2) -- it has no internal imports, so it can't be blocked by circular dependencies during initialization.

---

## The Accessor Pattern

`bootstrap/state.ts` doesn't export `STATE` directly. Instead, it exports ~130 accessor functions. The singleton itself is never exported. Representative patterns:

**Simple getter/setter pairs** (most common):

```typescript
export function getSessionId(): SessionId {       // line 431
  return STATE.sessionId
}

export function getCwdState(): string {
  return STATE.cwd
}

export function setCwdState(cwd: string): void {
  STATE.cwd = cwd.normalize('NFC')
}
```

**Accumulator functions** (metrics):

```typescript
export function addToTotalCostState(
  cost: number,
  modelUsage: ModelUsage,
  model: string,
): void {
  STATE.modelUsage[model] = modelUsage
  STATE.totalCostUSD += cost
}
```

Why accessors instead of direct property access? Four reasons:

**1. Mutation control.** Setters can enforce invariants. `setCwdState()` always NFC-normalizes. `switchSession()` atomically updates both `sessionId` and `sessionProjectDir` (they must always change together -- the comment references `CC-34`, an internal bug where they drifted).

**2. Import-time safety.** `bootstrap/state.ts` must be a leaf of the import DAG -- it can't import from `src/utils/` or `src/services/`. By exporting functions rather than raw state, consumers import lightweight function references rather than requiring the state object to be fully constructed at import time.

**3. Grep-ability.** `getSessionId()` is searchable. `STATE.sessionId` could be confused with any object property named `sessionId`. The accessor pattern makes it trivial to find all reads and writes to any piece of global state. An `addToTotalCostState` call is immediately recognizable as a state mutation; `STATE.totalCostUSD += cost` buried in a random file is not.

**4. Refactoring safety.** Field renames only require changing the accessor, not 50+ call sites. The trade-off: ~1,300 lines of accessor boilerplate for what could be a single exported object. The team chose safety over conciseness.

### The Atomic Switch Pattern

Some state fields must change together. The `switchSession` function (lines 468-479) demonstrates:

```typescript
export function switchSession(
  sessionId: SessionId,
  projectDir: string | null = null,
): void {
  STATE.planSlugCache.delete(STATE.sessionId)
  STATE.sessionId = sessionId
  STATE.sessionProjectDir = projectDir
  sessionSwitched.emit(sessionId)
}
```

Four operations happen atomically:
1. Clean up the outgoing session's plan slug
2. Update the session ID
3. Update the project directory
4. Emit a signal so listeners can react

There's no separate `setSessionId()` or `setSessionProjectDir()` -- they're only changed through `switchSession()`. The comment (lines 457-466) explicitly says they "cannot drift out of sync."

### The Signal Pattern

`bootstrap/state.ts` can't import listener callbacks directly (import DAG leaf constraint), but other modules need to react to state changes. The solution: a lightweight signal:

```typescript
const sessionSwitched = createSignal<[id: SessionId]>()
export const onSessionSwitch = sessionSwitched.subscribe
```

`createSignal()` (from `utils/signal.ts`, 43 lines) is a minimal typed pub/sub with no stored state:

```typescript
export function createSignal<Args extends unknown[] = []>(): Signal<Args> {
  const listeners = new Set<(...args: Args) => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    emit(...args) {
      for (const listener of listeners) listener(...args)
    },
    clear() {
      listeners.clear()
    },
  }
}
```

The docstring notes it was created to collapse ~15 duplicated listener-set patterns across the codebase. It's distinct from the store pattern -- no snapshot, no `getState`. Use signals when subscribers need "something happened" events, not "what is the current value." The `concurrentSessions.ts` module uses `onSessionSwitch` to keep the PID file's session ID in sync when `--resume` switches sessions.

---

## Interaction Time: Batched Date.now()

A small but revealing optimization lives in the interaction time tracking (lines 665-689):

```typescript
let interactionTimeDirty = false

export function updateLastInteractionTime(immediate?: boolean): void {
  if (immediate) {
    flushInteractionTime_inner()
  } else {
    interactionTimeDirty = true
  }
}

export function flushInteractionTime(): void {
  if (interactionTimeDirty) {
    flushInteractionTime_inner()
  }
}

function flushInteractionTime_inner(): void {
  STATE.lastInteractionTime = Date.now()
  interactionTimeDirty = false
}
```

Every keypress calls `updateLastInteractionTime()`. Calling `Date.now()` on every keypress is wasteful -- the actual timestamp only matters when something reads it (idle detection, AFK mode). Instead, the keypress handler sets a dirty flag, and the Ink render loop calls `flushInteractionTime()` before each frame. This batches potentially dozens of keypresses into a single `Date.now()` call per render frame.

The `immediate` flag handles cases where code runs *after* the Ink render cycle (React `useEffect` callbacks, permission dialogs waiting for input). Without it, the timestamp could stay stale indefinitely if the user is idle between render frames.

---

## Scroll Drain Suspension

Another coordination mechanism lives outside the State object for performance (lines 791-824):

```typescript
let scrollDraining = false
let scrollDrainTimer: ReturnType<typeof setTimeout> | undefined
const SCROLL_DRAIN_IDLE_MS = 150

export function markScrollActivity(): void {
  scrollDraining = true
  if (scrollDrainTimer) clearTimeout(scrollDrainTimer)
  scrollDrainTimer = setTimeout(() => {
    scrollDraining = false
    scrollDrainTimer = undefined
  }, SCROLL_DRAIN_IDLE_MS)
  scrollDrainTimer.unref?.()
}

export function getIsScrollDraining(): boolean {
  return scrollDraining
}
```

When the user scrolls through long output, the scroll handler fires rapidly. Background intervals (polling for task completion, checking MCP health) check `getIsScrollDraining()` and skip their work while scrolling is active. This prevents background work from competing with scroll frame rendering for the event loop.

The 150ms debounce ensures the flag stays active during continuous scrolling but clears quickly when scrolling stops. The `.unref()` call on the timer ensures it doesn't keep the Node.js event loop alive -- if the process is exiting, this timer shouldn't prevent shutdown.

The async counterpart `waitForScrollIdle()` blocks one-shot expensive work:

```typescript
export async function waitForScrollIdle(): Promise<void> {
  while (scrollDraining) {
    await new Promise(r => setTimeout(r, SCROLL_DRAIN_IDLE_MS).unref?.())
  }
}
```

The comment explains a constraint: "bootstrap-isolation forbids importing `sleep()` from `src/utils/`." Because `bootstrap/state.ts` must remain a leaf of the import DAG, it can't use the utility `sleep()` function and must inline the equivalent.

Both the scroll-drain flag and the `interactionTimeDirty` flag live as module-level variables, not inside `State`. They're ephemeral hot-path flags that don't need test reset and would add noise to the `resetStateForTests()` function.

---

## TTL-Bounded Collections

The slow operations tracker (lines 1566-1621) demonstrates a pattern for time-windowed state with referential stability:

```typescript
const MAX_SLOW_OPERATIONS = 10
const SLOW_OPERATION_TTL_MS = 10000  // 10 seconds

export function addSlowOperation(operation: string, durationMs: number): void {
  if (process.env.USER_TYPE !== 'ant') return  // Internal-only feature
  const now = Date.now()
  STATE.slowOperations = STATE.slowOperations.filter(
    op => now - op.timestamp < SLOW_OPERATION_TTL_MS,
  )
  STATE.slowOperations.push({ operation, durationMs, timestamp: now })
  if (STATE.slowOperations.length > MAX_SLOW_OPERATIONS) {
    STATE.slowOperations = STATE.slowOperations.slice(-MAX_SLOW_OPERATIONS)
  }
}
```

Three bounds enforce cleanup: a 10-second TTL evicts stale entries on each write, a cap of 10 entries prevents unbounded growth, and the `ant` user-type guard means it only fires for internal users (it powers a developer diagnostics bar).

The getter uses referential stability for React integration:

```typescript
const EMPTY_SLOW_OPERATIONS: ReadonlyArray<...> = []

export function getSlowOperations(): ReadonlyArray<...> {
  if (STATE.slowOperations.length === 0) {
    return EMPTY_SLOW_OPERATIONS  // stable reference for React Object.is bail-out
  }
  // ... TTL-filter and return
}
```

Returning the same `EMPTY_SLOW_OPERATIONS` constant when there are no entries means React components that depend on this value skip re-rendering. Without the stable reference, each call would return a new empty array, which `Object.is` would treat as a new value, triggering needless re-renders.

---

## Token Budget Tracking

Another set of module-level variables tracks per-turn token budgets:

```typescript
let outputTokensAtTurnStart = 0
let currentTurnTokenBudget: number | null = null
let budgetContinuationCount = 0

export function getTurnOutputTokens(): number {
  return getTotalOutputTokens() - outputTokensAtTurnStart
}

export function snapshotOutputTokensForTurn(budget: number | null): void {
  outputTokensAtTurnStart = getTotalOutputTokens()
  currentTurnTokenBudget = budget
  budgetContinuationCount = 0
}

export function incrementBudgetContinuationCount(): void {
  budgetContinuationCount++
}
```

At the start of each turn, `snapshotOutputTokensForTurn()` captures the cumulative output token count. `getTurnOutputTokens()` then returns the delta -- how many tokens this turn has consumed. When the turn exceeds the budget, the query loop auto-continues (Chapter 4), and `budgetContinuationCount` tracks how many continuations have occurred.

These live outside `State` because they're turn-scoped working variables -- they reset at the start of each turn, not at session start. But they still need reset in tests, which is why `resetStateForTests()` explicitly clears them.

---

## The Reactive Store: Application State

While `bootstrap/state.ts` holds the *back-end* state (API communication, telemetry, session management), the UI has its own state management via a minimal reactive store at `state/store.ts`:

```typescript
type Listener = () => void
type OnChange<T> = (args: { newState: T; oldState: T }) => void

export type Store<T> = {
  getState: () => T
  setState: (updater: (prev: T) => T) => void
  subscribe: (listener: Listener) => () => void
}

export function createStore<T>(
  initialState: T,
  onChange?: OnChange<T>,
): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()

  return {
    getState: () => state,

    setState: (updater: (prev: T) => T) => {
      const prev = state
      const next = updater(prev)
      if (Object.is(next, prev)) return
      state = next
      onChange?.({ newState: next, oldState: prev })
      for (const listener of listeners) listener()
    },

    subscribe: (listener: Listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

**35 lines.** That's the entire UI state management system. The API shape -- `getState`, `setState` with updater function, `subscribe` returning unsubscribe -- mirrors Zustand exactly but with zero dependencies.

Let's examine the design decisions:

**1. `Object.is` bail-out.** If the updater returns the same reference, no listeners fire. This is the same optimization React uses internally. Components only re-render when state actually changes.

**2. Synchronous notification.** Listeners fire immediately in `setState`, not on a microtask queue. The UI is always consistent with the state -- there's no frame where state and UI disagree.

**3. Functional updates only.** `setState` takes `(prev: T) => T`, not a value. This prevents stale-state bugs where two rapid `setState` calls clobber each other -- each updater receives the latest state.

**4. Set-based listeners.** `Set<Listener>` prevents duplicate subscriptions and provides O(1) removal via the returned unsubscribe function.

**5. The `onChange` callback.** The optional second argument fires *before* listeners. This is where side-effects live -- not in middleware or reducers, but in a single callback with access to both old and new state.

**6. No selector support.** Unlike Zustand, there's no `useStore(selector)` pattern. Every subscriber fires on every state change. For a TUI app with a modest number of React components, this is acceptable -- the Ink rendering pipeline is already batch-scheduled.

No Redux. No Zustand. No MobX. For a single-process application with one UI thread, 35 lines of code provides everything the UI needs: reactive state, bail-out optimization, and clean subscription management.

### Three Store Instances

The `createStore` primitive is used three times in the codebase:

| Instance | File | Type | onChange | Purpose |
|----------|------|------|---------|---------|
| Main app store | `main.tsx:2653` | `AppState` | `onChangeAppState` | Primary UI state |
| Voice store | `context/voice.tsx:41` | `VoiceState` | none | Voice input state |
| Compact warning | `services/compact/compactWarningState.ts:8` | `boolean` | none | Suppress warning flag |

The voice and compact-warning stores demonstrate the pattern's versatility -- the same 35-line primitive scales from a single boolean to the 120+ field `AppState`.

---

## AppState: The UI State Type

`state/AppStateStore.ts` (570 lines) defines what lives in the reactive store:

```typescript
export type AppState = DeepImmutable<{
  settings: SettingsJson
  verbose: boolean
  mainLoopModel: ModelSetting
  mainLoopModelForSession: ModelSetting
  statusLineText: string | undefined
  expandedView: 'none' | 'tasks' | 'teammates'
  isBriefOnly: boolean
  selectedIPAgentIndex: number
  coordinatorTaskIndex: number
  footerSelection: FooterItem | null
  toolPermissionContext: ToolPermissionContext
  kairosEnabled: boolean
  remoteSessionUrl: string | undefined
  remoteConnectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  activeOverlays: ReadonlySet<string>
  // ... 30+ more fields
}> & {
  // Excluded from DeepImmutable because they contain function types
  tasks: { [taskId: string]: TaskState }
  agentNameRegistry: Map<string, AgentId>
  mcp: {
    clients: MCPServerConnection[]
    tools: Tool[]
    commands: Command[]
    resources: Record<string, ServerResource[]>
    pluginReconnectKey: number
  }
  plugins: {
    enabled: LoadedPlugin[]
    disabled: LoadedPlugin[]
    commands: Command[]
    errors: PluginError[]
    installationStatus: { /* ... */ }
    needsRefresh: boolean
  }
  agentDefinitions: AgentDefinitionsResult
  fileHistory: FileHistoryState
  attribution: AttributionState
  todos: { [agentId: string]: TodoList }
  thinkingEnabled: boolean | undefined
  promptSuggestionEnabled: boolean
  sessionHooks: SessionHooksState
  teamContext?: { /* ... */ }
  // ... more mutable fields
}
```

The type is split into two sections with the `&` intersection:

**1. `DeepImmutable<{...}>`** -- scalar and simple object fields that should never be mutated directly. TypeScript enforces this at compile time -- any attempt to write `state.settings.model = 'foo'` produces a type error.

**2. `& { mutable fields }`** -- fields containing function types, Maps, Sets, or complex mutable structures that `DeepImmutable` can't wrap. These include task state (functions for abort/cancel), MCP connections (live socket objects), and plugin state (runtime callbacks).

### DeepImmutable

The `DeepImmutable` utility type recursively marks all properties as `readonly`:

```typescript
type DeepImmutable<T> =
  T extends (infer E)[] ? readonly DeepImmutable<E>[] :
  T extends Map<infer K, infer V> ? ReadonlyMap<DeepImmutable<K>, DeepImmutable<V>> :
  T extends Set<infer E> ? ReadonlySet<DeepImmutable<E>> :
  T extends object ? { readonly [P in keyof T]: DeepImmutable<T[P]> } :
  T
```

This means `state.settings` is `Readonly<SettingsJson>`, `state.settings.permissions` is `Readonly<{allow: readonly string[], deny: readonly string[]}>`, and so on recursively. The only way to change state is through `setState`, which creates a new object.

The escape hatch -- the `& { ... }` intersection -- is a significant carve-out. Its enforcement is purely by convention: functions that touch the mutable section know they're doing so because the field names clearly indicate their domain (`tasks`, `mcp`, `plugins`). There's no runtime guard preventing someone from mutating `state.mcp.tools.push(...)` instead of using `setState`. In practice, the team trusts the code review process to catch these.

### Notable AppState Domains

**REPL bridge state** captures the connection lifecycle for Claude.ai-to-local-CLI sessions:

```typescript
replBridgeEnabled: boolean        // Desired state (config/toggle)
replBridgeConnected: boolean      // Environment registered + session created
replBridgeSessionActive: boolean  // WebSocket open (user on claude.ai)
replBridgeReconnecting: boolean   // Error backoff state
replBridgeConnectUrl: string | undefined  // Ready-state connect URL
replBridgeSessionUrl: string | undefined  // Active session URL
```

These six fields form a mini state machine: `enabled && !connected` means "trying to connect," `connected && !sessionActive` means "registered but no browser tab open," and `sessionActive` means "live bidirectional session."

**MCP state** includes `pluginReconnectKey: number` -- a field that's never read for its value. Its only purpose is as a React dependency-array trigger: effects watch it, and incrementing it via `/reload-plugins` forces effects to re-run. This is a common React pattern (a "bumper counter") adapted for the store.

**Team/swarm context** tracks multi-agent sessions where Claude Code spawns tmux-based teammates:

```typescript
teamContext?: {
  teamName: string
  leadAgentId: string
  selfAgentId?: string
  teammates: {
    [teammateId: string]: {
      name: string; color?: string;
      tmuxSessionName: string; tmuxPaneId: string;
      cwd: string; worktreePath?: string; spawnedAt: number;
    }
  }
}
```

### getDefaultAppState()

The default state constructor (lines 456-569) reveals a circular dependency workaround:

```typescript
export function getDefaultAppState(): AppState {
  const teammateUtils =
    require('../utils/teammate.js') as typeof import('../utils/teammate.js')
  const initialMode: PermissionMode =
    teammateUtils.isTeammate() && teammateUtils.isPlanModeRequired()
      ? 'plan'
      : 'default'

  return {
    settings: getInitialSettings(),
    tasks: {},
    speculation: IDLE_SPECULATION_STATE,
    thinkingEnabled: shouldEnableThinkingByDefault(),
    promptSuggestionEnabled: shouldEnablePromptSuggestion(),
    // ... 80+ more fields
  }
}
```

The `require()` instead of `import` for `teammate.ts` is deliberate -- the comment says "Use lazy require to avoid circular dependency." Two fields are initialized by calling feature-flag functions at construction time (`shouldEnableThinkingByDefault()` and `shouldEnablePromptSuggestion()`), meaning the default values are determined by server-side feature flags resolved during bootstrap.

---

## The Speculation State Machine

One of the most interesting pieces of AppState is the **speculation system** -- predictive execution that speculatively starts the next query while the user is still reading output:

```typescript
export type CompletionBoundary =
  | { type: 'complete'; completedAt: number; outputTokens: number }
  | { type: 'bash'; command: string; completedAt: number }
  | { type: 'edit'; toolName: string; filePath: string; completedAt: number }
  | { type: 'denied_tool'; toolName: string; detail: string; completedAt: number }

export type SpeculationState =
  | { status: 'idle' }
  | {
      status: 'active'
      id: string
      abort: () => void
      startTime: number
      messagesRef: { current: Message[] }
      writtenPathsRef: { current: Set<string> }
      boundary: CompletionBoundary | null
      suggestionLength: number
      toolUseCount: number
      isPipelined: boolean
      contextRef: { current: REPLHookContext }
      pipelinedSuggestion?: {
        text: string
        promptId: 'user_intent' | 'stated_intent'
        generationRequestId: string | null
      } | null
    }
```

This is a discriminated union state machine with two states:

**Idle:** No speculation running. The system is waiting for the user to submit their next prompt. A shared constant `IDLE_SPECULATION_STATE = { status: 'idle' }` (line 79) provides a stable reference -- every component that checks for idle gets the same object, enabling `Object.is` bail-out.

**Active:** A speculative query is in progress. The system has predicted what the user will say next and started processing it. Key fields:

- `abort()` -- cancels the speculation if the user's actual prompt doesn't match the prediction
- `messagesRef` -- a mutable ref (not immutable state) to avoid creating thousands of intermediate arrays during speculative execution. Each speculative tool use appends to `messagesRef.current` directly.
- `writtenPathsRef` -- tracks which files the speculation has modified. If aborted, these paths need to be rolled back.
- `boundary` -- the `CompletionBoundary` describes what type of completion triggered speculation start. The system only speculates at safe points: after a complete response, after a bash command, after a file edit, or after a denied tool. Never mid-stream or mid-tool.
- `isPipelined` -- whether this speculation was triggered by a pipeline (auto-continue) rather than user-intent prediction
- `pipelinedSuggestion` -- the predicted user prompt that triggered this speculation, along with whether it was inferred from user behavior (`user_intent`) or explicitly stated (`stated_intent`)

The mutable ref pattern (`{ current: T }`) breaks the immutability convention of AppState. This is deliberate -- during speculative execution, the system processes potentially hundreds of messages and tool results. Creating a new immutable array for each one would generate massive garbage collector pressure. Instead, mutations are accumulated in the mutable ref, and the final result is committed to immutable state when speculation completes or is accepted.

---

## The Side-Effect Bridge: onChangeAppState

The two state systems need a connection point where UI state changes trigger infrastructure side-effects. That bridge is `state/onChangeAppState.ts` (172 lines) -- a single function passed as the `onChange` callback to `createStore`:

```typescript
// main.tsx:2653
const headlessStore = createStore(headlessInitialState, onChangeAppState)
```

### Permission Mode Sync

The longest block handles permission mode synchronization (lines 43-92):

```typescript
export function onChangeAppState({
  newState, oldState,
}: { newState: AppState; oldState: AppState }) {
  const prevMode = oldState.toolPermissionContext.mode
  const newMode = newState.toolPermissionContext.mode
  if (prevMode !== newMode) {
    const prevExternal = toExternalPermissionMode(prevMode)
    const newExternal = toExternalPermissionMode(newMode)
    if (prevExternal !== newExternal) {
      notifySessionMetadataChanged({
        permission_mode: newExternal,
        is_ultraplan_mode: isUltraplan,
      })
    }
    notifyPermissionModeChanged(newMode)
  }
  // ...
}
```

The comment block (lines 50-64) explains the rationale: before this centralized handler, mode changes were relayed to the session metadata system by only 2 of 8+ mutation paths. The other 6+ paths -- Shift+Tab cycling, ExitPlanMode dialog, `/plan` slash command, rewind, REPL bridge -- mutated AppState without notifying the infrastructure. This single `onChange` hook fixed all of them at once.

### Settings Persistence and Cache Clearing

The remaining 80 lines (lines 94-170) handle:

- **Model changes:** `mainLoopModel` changes write to settings via `updateSettingsForSource('userSettings', { model: ... })` and sync to bootstrap state via `setMainLoopModelOverride`.
- **View preferences:** `expandedView` changes persist as `showExpandedTodos` + `showSpinnerTree` in global config for backwards compatibility.
- **Verbose mode:** persisted to global config.
- **Settings changes:** When `settings.env` changes, clear all credential caches (`clearApiKeyHelperCache`, `clearAwsCredentialsCache`, `clearGcpCredentialsCache`) and re-apply environment variables. This prevents stale credentials from leaking across environment changes.

### The Inverse Function

For bidirectional sync with remote sessions, the module exports an inverse:

```typescript
export function externalMetadataToAppState(
  metadata: SessionExternalMetadata,
): (prev: AppState) => AppState {
  return prev => ({
    ...prev,
    ...(typeof metadata.permission_mode === 'string'
      ? { toolPermissionContext: {
            ...prev.toolPermissionContext,
            mode: permissionModeFromString(metadata.permission_mode),
          } }
      : {}),
    ...(typeof metadata.is_ultraplan_mode === 'boolean'
      ? { isUltraplanMode: metadata.is_ultraplan_mode }
      : {}),
  })
}
```

This returns a state updater function (compatible with `store.setState`) that applies external metadata. It's the inverse of the push logic -- used to restore state from the session metadata system on worker restart.

---

## Two State Systems, One Application

The relationship between `bootstrap/state.ts` (State) and `state/AppStateStore.ts` (AppState) is a clean separation of concerns driven by the **import DAG constraint**:

```
                 +-----------------------+
                 |   bootstrap/state.ts  |  <-- Import DAG leaf
                 |   (module singleton)  |      No imports from src/
                 |   90+ fields, ~130    |
                 |   accessor functions  |
                 +-----------+-----------+
                             |
              imported by 50+ files
                             |
         +-------------------+-------------------+
         |                   |                   |
   analytics/          main.tsx            screens/REPL.tsx
   telemetry              |
                          | creates
                          v
                 +-----------------------+
                 |   state/store.ts      |  <-- Generic reactive store
                 |   (35 lines)          |
                 +-----------+-----------+
                             |
                    parameterized with
                             |
                             v
                 +-----------------------+
                 |  state/AppStateStore  |  <-- UI state type + defaults
                 |  (570 lines)          |
                 +-----------+-----------+
                             |
                  onChange callback
                             |
                             v
                 +-----------------------+
                 | onChangeAppState.ts   |  <-- Side-effect bridge
                 | (172 lines)           |      bootstrap <-- UI sync
                 +-----------------------+
```

The bootstrap module must be a leaf node -- it cannot import from the main application graph. This is enforced by an ESLint rule (`custom-rules/bootstrap-isolation`, referenced on line 17 of `bootstrap/state.ts`). The reasoning: bootstrap state is needed by infrastructure code (telemetry, authentication, analytics) that loads before the React app exists. The reactive store depends on React/Ink rendering. Merging them would create circular dependencies or force infrastructure to depend on React.

| Concern | State (bootstrap) | AppState (store) |
|---------|-------------------|------------------|
| **Audience** | Back-end: API, tools, services | Front-end: UI components |
| **Mutation** | Direct via setters | Via `setState` functional updates |
| **Reactivity** | Signal-based (explicit subscribe) | Listener-based (auto-render) |
| **Lifetime** | Process lifetime | Session lifetime (resets on `/clear`) |
| **Immutability** | None enforced | `DeepImmutable` wrapper |
| **Importer count** | 50+ files | 15+ files |

Data flows from State to AppState but not the reverse. When the API client updates `STATE.totalCostUSD`, a periodic synchronizer reads it and calls `appStore.setState(prev => ({ ...prev, totalCost: STATE.totalCostUSD }))`. The UI subscribes to appStore changes and re-renders.

This separation means:
- Tool implementations never need to import React-related types
- UI components never reach into the bootstrap layer for telemetry data
- The back-end can be tested without mounting a UI
- The UI can be tested with a mock store without running an API client

---

## Testing: resetStateForTests()

The main challenge with global mutable state is test isolation. Each test must start with a clean state. The solution (lines 919-930):

```typescript
export function resetStateForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetStateForTests can only be called in tests')
  }
  Object.entries(getInitialState()).forEach(([key, value]) => {
    STATE[key as keyof State] = value as never
  })
  outputTokensAtTurnStart = 0
  currentTurnTokenBudget = null
  budgetContinuationCount = 0
  sessionSwitched.clear()
}
```

This function:
1. **Guards against production use.** The `NODE_ENV` check throws if called outside tests.
2. **Resets every field to its initial value.** `getInitialState()` produces a fresh State object, and each field is copied into the existing `STATE` object. This is important -- it doesn't replace `STATE` with a new object (which would break references held by other modules), it overwrites every field in-place.
3. **Resets module-level variables.** The token budget variables and signal subscriptions are also cleared.

The `as never` cast is a necessary escape hatch -- TypeScript can't prove that iterating over `Object.entries` and assigning values preserves type safety, but the runtime behavior is correct because `getInitialState()` produces a value of type `State`.

Every test file's `beforeEach` calls `resetStateForTests()`. This is the trade-off of global state: you need a manual reset function. With DI, each test would create a fresh context. With global state, you reset the singleton. The approach works -- Claude Code has thousands of tests, all using this pattern.

One edge case: fields that are `Map` or `Set` types get a new instance from `getInitialState()`, so any reference held by a previous test becomes stale. The in-place field-by-field copy avoids the root `STATE` reference going stale (other modules import accessor functions, not the object), but nested mutable collections technically share no references after reset. In practice this works because tests use the accessors, not held references to internal Maps.

---

## Design Lessons

Building a state architecture for a CLI agent, the Claude Code approach teaches:

**1. Match the pattern to the constraint.** Single-process, single-user, deep call stacks --> global mutable state is simpler and sufficient. The same application as a web server --> you'd use DI containers. The constraint drives the architecture, not the other way around.

**2. Guard the singleton.** Don't export the raw object. Export ~130 accessor functions that enforce invariants, enable grep-ability, and keep the module at the leaf of the import DAG. The boilerplate cost is real (~1,300 lines), but the benefits -- mutation control, refactoring safety, test isolation -- justify it.

**3. Separate back-end and front-end state.** Even in a CLI application, the API/tool layer and the UI layer have different state needs. Separate them with a clean data-flow boundary. Use a side-effect bridge (`onChangeAppState`) as the single synchronization point.

**4. Use immutability where it matters.** `DeepImmutable` on UI state prevents a class of bugs. No immutability on back-end state avoids pointless object cloning overhead for telemetry counters that nobody renders. The `& { mutable }` escape hatch handles fields that can't be made immutable (functions, live sockets).

**5. Design for test reset.** If you choose global state, build the reset function on day one. It's the tax you pay, and it's worth paying to avoid the alternative: flaky tests from state leakage. Reset in-place (don't replace the object) and remember to clear module-level variables too.

**6. Latch for cache economics.** When your application's cost model depends on stable cache keys, design state transitions that minimize key changes. Cache latching is a domain-specific optimization, but the principle -- "understand your infrastructure's cost model and optimize state management around it" -- is universal.

**7. Centralize side-effects.** Instead of scattering sync logic across 8+ mutation paths, route all state changes through one `onChange` callback. When the bug is "6 of 8 paths forget to notify," the fix isn't patching 6 paths -- it's moving the notification to the one place all paths converge.

**8. Use stable references for React.** Constants like `IDLE_SPECULATION_STATE` and `EMPTY_SLOW_OPERATIONS` prevent needless re-renders. Mutable refs (`{ current: T }`) handle hot paths where immutable updates would create garbage. These are small patterns, but in a TUI with real-time streaming output, they add up.

In Chapter 4, we'll leave the state layer and enter the Query Engine -- the `while(true)` agent loop in `query.ts` that reads from State, calls the API, executes tools, and writes back to State.
