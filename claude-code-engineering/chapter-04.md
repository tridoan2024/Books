# Chapter 4: The Query Loop — Heart of the Agent

In Chapter 3, we examined the two state systems that track everything Claude Code knows about a session — the global mutable `STATE` singleton for back-end data and the reactive `AppState` store for UI rendering. We also saw how `snapshotOutputTokensForTurn()` and `budgetContinuationCount` live outside the main State object as turn-scoped working variables. Now we turn to the engine that actually *uses* that state: the query loop in `query.ts`.

Every AI-powered CLI agent has the same fundamental challenge: call the model, see if it wants to use a tool, execute the tool, feed the result back, and repeat. The naive implementation is a recursive function or a simple `while` loop. Claude Code's implementation is neither. It's an **async generator** — a pull-based stream that yields messages to its consumer, runs tools concurrently during streaming, and navigates a state machine with 10 exit reasons and 7 continuation paths. At 1,729 lines, `query.ts` is one of the largest files in the codebase, and understanding it is the key to understanding how the agent thinks.

This chapter covers the architecture of that loop: why async generators, how the state machine works, how errors recover, and how tools execute in parallel with model output. We'll also examine the supporting infrastructure — the `StreamingToolExecutor` (530 lines), the `QueryEngine` orchestrator (1,295 lines), and the token budget system (93 lines) — totaling 4,427 lines of query loop infrastructure.

---

## The Async Generator Architecture

### Why Not a Simple Loop?

Before examining what Claude Code built, consider what a naive agent loop looks like:

```typescript
// The obvious approach — synchronous, blocking, no streaming
async function agentLoop(messages: Message[]): Promise<Message[]> {
  while (true) {
    const response = await callModel(messages)
    messages.push(response)
    
    const toolCalls = extractToolUse(response)
    if (toolCalls.length === 0) return messages
    
    const results = await Promise.all(toolCalls.map(runTool))
    messages.push(...results)
  }
}
```

This works for a prototype, but it has three problems that matter at scale:

1. **No streaming.** The consumer waits for the entire model response before seeing anything. In a CLI where responses can be thousands of tokens, the user stares at a blank screen.
2. **No backpressure.** The loop runs as fast as the model generates. If the UI can't keep up — rendering markdown, executing syntax highlighting, writing to disk — messages pile up in memory.
3. **No communication about exit reasons.** The function returns messages, but the caller has no way to distinguish "completed normally" from "hit a token limit" from "user aborted." All exit paths collapse into the same return type.

### The Pull-Based Stream

Claude Code solves all three problems with a single design choice: make the agent loop an `AsyncGenerator`.

```typescript
// query.ts:219-228
export async function* query(
  params: QueryParams,
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  Terminal  // Return type — why the loop stopped
> {
  const consumedCommandUuids: string[] = []
  const terminal = yield* queryLoop(params, consumedCommandUuids)
  for (const uuid of consumedCommandUuids) {
    notifyCommandLifecycle(uuid, 'completed')
  }
  return terminal
}
```

Three things to notice:

**First**, the yield type is a union of five message types. Each `yield` statement emits one message into the stream. The consumer processes it immediately — rendering it to the terminal, persisting it to the transcript, or forwarding it to an SDK client.

**Second**, the return type is `Terminal`, a discriminated union of exit reasons. This is separate from the yield channel. When the generator's `.next()` returns `{ done: true, value: terminal }`, the caller knows exactly *why* the loop stopped.

**Third**, the outer `query()` is a thin wrapper around `queryLoop()` via `yield*`. This delegation pattern exists for a specific reason: the command lifecycle notifications (the `for` loop at the end) should only run on normal exit. If the consumer calls `.return()` or `.throw()` on the generator, the `for` loop is skipped. This is a pattern for success-only cleanup that exploits generator protocol semantics.

### Two-Layer Generator Pattern

The full call chain looks like this:

```
QueryEngine.submitMessage()
    │
    └── for await (const msg of query({...})) {  // Consumer drives
            // Process each yielded message
        }
            │
            └── yield* queryLoop()  // Delegation
                    │
                    └── while (true) {  // The actual loop
                            for await (msg of deps.callModel({...})) {
                                yield msg  // Streams to consumer
                            }
                            // tool execution, state transition, or return
                        }
```

The consumer — `QueryEngine.submitMessage()` at `QueryEngine.ts:675` — drives the entire pipeline with a `for await...of` loop:

```typescript
// QueryEngine.ts:675-686
for await (const message of query({
  messages,
  systemPrompt,
  userContext,
  systemContext,
  canUseTool: wrappedCanUseTool,
  toolUseContext: processUserInputContext,
  fallbackModel,
  querySource: 'sdk',
  maxTurns,
  taskBudget,
})) {
  // Record, persist, yield to SDK...
}
```

Each `.next()` call from the consumer pulls one message through the entire chain. The generator only produces when asked. This is **backpressure for free** — if the UI renderer is slow, the stream naturally pauses. No explicit flow control needed.

### Why Async Generators Over Alternatives

Three alternatives were available, and the codebase chose generators for specific engineering reasons:

| Alternative | Problem |
|---|---|
| **Callbacks** | No return channel. Can't communicate exit reasons. Cleanup requires manual tracking. |
| **EventEmitter** | No backpressure. Emitter fires regardless of consumer readiness. Memory grows unbounded during slow rendering. |
| **Observable (RxJS)** | Heavy dependency for a pattern that needs one operator (iteration). Adds 50KB+ to the bundle for sugar over generators. |

The generator approach gets backpressure, composable cleanup via `.return()` and `.throw()`, and a return channel for exit reasons — all from the language runtime, zero dependencies.

---

## QueryParams — The Immutable Input Contract

Every query starts with a `QueryParams` object that captures the complete input:

```typescript
// query.ts:181-199
export type QueryParams = {
  messages: Message[]
  systemPrompt: SystemPrompt
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
  canUseTool: CanUseToolFn
  toolUseContext: ToolUseContext
  fallbackModel?: string
  querySource: QuerySource
  maxOutputTokensOverride?: number
  maxTurns?: number
  skipCacheWrite?: boolean
  taskBudget?: { total: number }
  deps?: QueryDeps              // Dependency injection for testing
}
```

The key design decision: **`QueryParams` is destructured once at entry and never reassigned.** Mutable state gets its own type. This separation matters for two reasons:

1. **Debuggability.** When something goes wrong on iteration 47, you can inspect `params` to see the original request and `state` to see what changed. If both lived in the same object, you'd have to reconstruct the original from the mutated version.
2. **Future refactoring.** The comment in `query/config.ts:7-14` reveals the architectural direction: moving toward a `(state, event, config) → state` pure reducer. Immutable config is already separated — it's the first step.

---

## The State Machine

While `QueryParams` is frozen at entry, iteration state mutates on every loop cycle. The `State` type captures everything that changes:

```typescript
// query.ts:204-217
type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number          // 0..3
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined   // undefined → 8K, set → 64K
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  transition: Continue | undefined              // Why previous iteration continued
}
```

### Initial State Construction

The loop initializes state once from params, establishing defaults for every recovery-related field:

```typescript
// query.ts:268-279
let state: State = {
  messages: params.messages,
  toolUseContext: params.toolUseContext,
  maxOutputTokensOverride: params.maxOutputTokensOverride,
  autoCompactTracking: undefined,
  stopHookActive: undefined,
  maxOutputTokensRecoveryCount: 0,
  hasAttemptedReactiveCompact: false,
  turnCount: 1,
  pendingToolUseSummary: undefined,
  transition: undefined,
}
```

Every recovery counter starts at zero. `transition` starts as `undefined` — the first iteration has no prior reason. This explicit initialization means you can read the initial state and know exactly what the loop "believes" at entry: no recovery in progress, no compaction attempted, no pending summaries, turn 1.

### Functional State Machine with Imperative Syntax

The state machine is *functional* — state is replaced, never mutated — but uses *imperative* syntax (`while(true)` + `continue`). Every continuation site writes a full `State` object:

```typescript
// Example: normal tool→model continuation (query.ts:1715-1727)
const next: State = {
  messages: [...messagesForQuery, ...assistantMessages, ...toolResults],
  toolUseContext: toolUseContextWithQueryTracking,
  autoCompactTracking: tracking,
  turnCount: nextTurnCount,
  maxOutputTokensRecoveryCount: 0,
  hasAttemptedReactiveCompact: false,
  pendingToolUseSummary: nextPendingToolUseSummary,
  maxOutputTokensOverride: undefined,
  stopHookActive,
  transition: { reason: 'next_turn' },
}
state = next
// implicit continue → back to while(true)
```

Notice: it's `state = next`, not `state.messages.push(...)`. The entire `State` object is replaced. There are no partial mutations. This means every continuation site declares the complete next state, making it possible to reason about each transition independently.

At the top of each iteration, state is destructured into local names:

```typescript
// query.ts:307-321
while (true) {
  let { toolUseContext } = state
  const {
    messages,
    autoCompactTracking,
    maxOutputTokensRecoveryCount,
    hasAttemptedReactiveCompact,
    maxOutputTokensOverride,
    pendingToolUseSummary,
    stopHookActive,
    turnCount,
  } = state
```

This destructuring serves readability — 700 lines of loop body read better with `messages` than `state.messages` — but it also creates a snapshot. If any code accidentally referenced `state.messages` after modification, it would see the old value via the destructured `messages` binding. The pattern prevents accidental cross-reference within an iteration.

### Terminal — 10 Exit Reasons

The `Terminal` type enumerates every way the loop can stop:

```typescript
// Reconstructed from all `return { reason: ... }` sites in query.ts
type Terminal =
  | { reason: 'completed' }              // Model finished naturally
  | { reason: 'prompt_too_long' }        // Context exceeded limits, can't recover
  | { reason: 'blocking_limit' }         // Approaching context window limit
  | { reason: 'image_error' }            // Unrecoverable image processing error
  | { reason: 'model_error'; error: unknown }  // API error after retries
  | { reason: 'aborted_streaming' }      // User cancelled during model output
  | { reason: 'aborted_tools' }          // User cancelled during tool execution
  | { reason: 'stop_hook_prevented' }    // Post-turn hook blocked continuation
  | { reason: 'hook_stopped' }           // Hook explicitly stopped the session
  | { reason: 'max_turns'; turnCount: number }  // Turn limit reached
```

Each reason maps to a specific UI treatment. `completed` shows nothing special. `max_turns` warns the user. `aborted_streaming` might offer to resume. The discriminated union lets the caller make these decisions without parsing error messages or inspecting state.

### Continue — 7 Continuation Reasons

The `Continue` type enumerates why the loop ran another iteration:

```typescript
type Continue =
  | { reason: 'next_turn' }                                     // Normal tool→model cycle
  | { reason: 'collapse_drain_retry'; committed: number }       // Context collapse recovery
  | { reason: 'reactive_compact_retry' }                        // Prompt-too-long compaction
  | { reason: 'max_output_tokens_escalate' }                    // 8K → 64K retry
  | { reason: 'max_output_tokens_recovery'; attempt: number }   // Multi-turn recovery (1..3)
  | { reason: 'stop_hook_blocking' }                            // Stop hook injected errors
  | { reason: 'token_budget_continuation' }                     // +500K auto-continue
```

The `transition` field on `State` records which `Continue` variant caused the current iteration. This is critical for testing — you can assert `state.transition.reason === 'max_output_tokens_escalate'` without inspecting the actual messages. It also prevents accidental state interference between recovery paths.

---

## The Five-Phase Iteration

Each pass through the `while(true)` loop follows five phases. Understanding this structure is essential to reading the 1,729-line file — without it, you're lost in a sea of conditionals.

### Phase 1: Context Preparation

Before calling the model, the loop prepares the message context. This is a chain of increasingly aggressive compression strategies:

```
Tool Result Budget (line 379)    → Truncate oversized tool results
      ↓
Snip Compact (line 401)          → Remove oldest messages
      ↓
Microcompact (line 414)          → Remove redundant whitespace
      ↓
Context Collapse (line 440)      → Summarize old conversation
      ↓
Autocompact (line 454)           → Full LLM-based compaction
      ↓
Token Warning Check (line 637)   → Blocking limit → Terminal exit
```

Each strategy is cheaper and faster than the next. The pipeline only advances to the next tier when the previous one can't reduce context enough. We'll examine each compression strategy in detail in Chapter 6 — for now, what matters is that the loop never sends a prompt that exceeds the model's context window.

### Phase 2: Model Call (Streaming)

The core of Phase 2 is a `for await` loop over the streaming model response:

```typescript
// query.ts:659-708 (simplified)
for await (const message of deps.callModel({
  messages: prependUserContext(messagesForQuery, userContext),
  systemPrompt: fullSystemPrompt,
  thinkingConfig: toolUseContext.options.thinkingConfig,
  tools: toolUseContext.options.tools,
  signal: toolUseContext.abortController.signal,
  options: {
    model: currentModel,
    maxOutputTokensOverride,
    // ... 20+ more options
  },
})) {
```

Inside this loop, four things happen simultaneously:

**Yield messages to the consumer.** Each message streams to the `QueryEngine` for rendering:
```typescript
if (!withheld) {
  yield yieldMessage
}
```

**Collect assistant messages.** The full response accumulates for use in Phase 3-5:
```typescript
if (message.type === 'assistant') {
  assistantMessages.push(message)
}
```

**Detect tool use blocks.** Tool calls are detected *during* streaming, not after:
```typescript
const msgToolUseBlocks = message.message.content.filter(
  content => content.type === 'tool_use',
) as ToolUseBlock[]
if (msgToolUseBlocks.length > 0) {
  toolUseBlocks.push(...msgToolUseBlocks)
  needsFollowUp = true
}
```

**Feed the streaming tool executor.** Tools start executing while the model is still generating:
```typescript
if (streamingToolExecutor && !toolUseContext.abortController.signal.aborted) {
  for (const toolBlock of msgToolUseBlocks) {
    streamingToolExecutor.addTool(toolBlock, message)
  }
}
```

This is the **pipelining optimization** — the most important performance design in the query loop. While the model generates content block N+1, the tool from block N is already executing. For a response that invokes three tools, this can cut total latency by 60-70% compared to sequential execution.

**Drain completed results mid-stream.** The loop doesn't wait until streaming finishes to collect tool results. Between message chunks, it synchronously drains any tools that have already completed:

```typescript
// query.ts:847-862
if (streamingToolExecutor && !toolUseContext.abortController.signal.aborted) {
  for (const result of streamingToolExecutor.getCompletedResults()) {
    if (result.message) {
      yield result.message
      toolResults.push(
        ...normalizeMessagesForAPI(
          [result.message],
          toolUseContext.options.tools,
        ).filter(_ => _.type === 'user'),
      )
    }
  }
}
```

`getCompletedResults()` is a *synchronous* generator — it yields results from the ready queue without blocking. This means a Read tool that finished while the model was still generating gets its result yielded to the UI immediately, not batched until the stream completes. The user sees tool output appearing in real-time alongside the model's thinking.

### Phase 3: Post-Stream Decision

After the streaming `for await` completes, if the model didn't request any tools (`needsFollowUp` is false), the loop enters a decision chain. This is where most of the complexity lives.

**Prompt-too-long recovery** (`query.ts:1070-1183`): If the model returned a `prompt_too_long` error, try reactive compaction. If compaction was already attempted, exit with `Terminal { reason: 'prompt_too_long' }`.

**Max output tokens recovery** (`query.ts:1185-1256`): If the model hit its output token limit, escalate through three phases (detailed in the next section).

**Stop hooks** (`query.ts:1267-1306`): Run post-turn quality gates. If a hook blocks, inject error messages and continue. If it prevents continuation entirely, exit.

**Token budget continuation** (`query.ts:1308-1355`): If the task has remaining budget and isn't showing diminishing returns, inject a nudge message and continue.

**Normal completion** (`query.ts:1357`): If none of the above triggered, return `Terminal { reason: 'completed' }`.

### Phase 4: Tool Execution

If `needsFollowUp` is true (tool use detected during streaming), the loop executes tools and collects results:

```typescript
// query.ts:1380-1408
const toolUpdates = streamingToolExecutor
  ? streamingToolExecutor.getRemainingResults()   // Tools already started during stream
  : runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext)

for await (const update of toolUpdates) {
  if (update.message) {
    yield update.message
    toolResults.push(
      ...normalizeMessagesForAPI([update.message], toolUseContext.options.tools)
        .filter(_ => _.type === 'user'),
    )
  }
  if (update.newContext) {
    updatedToolUseContext = { ...update.newContext, queryTracking }
  }
}
```

The branch is significant: if streaming tool execution is enabled, `getRemainingResults()` drains results from tools that already started during Phase 2. If it's disabled, `runTools()` starts and completes all tools sequentially. The streaming path is ~2x faster for multi-tool responses.

### Phase 5: Continue

After tools execute, the loop builds the next state and continues:

```typescript
const next: State = {
  messages: [...messagesForQuery, ...assistantMessages, ...toolResults],
  toolUseContext: toolUseContextWithQueryTracking,
  autoCompactTracking: tracking,
  turnCount: nextTurnCount,
  maxOutputTokensRecoveryCount: 0,           // Reset — tools executed successfully
  hasAttemptedReactiveCompact: false,         // Reset — new turn
  pendingToolUseSummary: nextPendingToolUseSummary,
  maxOutputTokensOverride: undefined,         // Reset — back to default 8K
  stopHookActive,
  transition: { reason: 'next_turn' },
}
state = next
```

The **key line** is the messages construction: `[...messagesForQuery, ...assistantMessages, ...toolResults]`. This is the agent loop's feedback mechanism. The model's response and the tool results become part of the conversation history for the next iteration. The model sees what it said, what the tools returned, and decides what to do next.

Notice the resets: `maxOutputTokensRecoveryCount: 0`, `hasAttemptedReactiveCompact: false`, `maxOutputTokensOverride: undefined`. A successful tool execution clears all recovery state. These fields only accumulate across iterations when the loop is in a recovery path — never across normal tool turns.

---

## Error Recovery: The max_output_tokens Escalation

When the model's output hits the configured token limit, the response truncates mid-generation. This is one of the most user-visible failures in a CLI agent — the model is in the middle of writing a file or explaining a concept, and it just stops. Claude Code's recovery system is elegant and worth studying in detail.

### The Token Constants

```typescript
// utils/context.ts:18-25
export const CAPPED_DEFAULT_MAX_TOKENS = 8_000
export const ESCALATED_MAX_TOKENS = 64_000
```

The default cap is 8K tokens, not the model's actual limit. Why? The comment explains: the p99 output across all production queries is ~4,911 tokens. Setting the default to 32K or 64K would over-reserve 8-16x the slot capacity in the inference serving system. Each request reserves output token slots, and unused reservations waste GPU memory that could serve other users. The 8K default optimizes for the common case (99% of responses fit) while keeping a recovery path for the 1% that don't.

### The Guard Function

Error withholding depends on a type guard that identifies truncated responses:

```typescript
// query.ts:175-179
function isWithheldMaxOutputTokens(
  msg: Message | StreamEvent | undefined,
): msg is AssistantMessage {
  return msg?.type === 'assistant' && msg.apiError === 'max_output_tokens'
}
```

The `msg is AssistantMessage` return type narrows the union — after the check, TypeScript knows the message is an assistant message with an `apiError` field. This guard is called in both the withholding check during streaming and the recovery decision after streaming completes.

### Three-Phase Recovery

**Phase 1: Escalation (8K -> 64K).** The first time the model hits the cap, silently retry the *same* request at 64K. No user-visible message. No partial output shown.

```typescript
// query.ts:1188-1221
if (isWithheldMaxOutputTokens(lastMessage)) {
  if (capEnabled && maxOutputTokensOverride === undefined &&
      !process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS) {
    const next: State = {
      messages: messagesForQuery,        // Same messages — full retry
      toolUseContext,
      maxOutputTokensOverride: ESCALATED_MAX_TOKENS,  // 8K → 64K
      maxOutputTokensRecoveryCount,      // Don't increment
      transition: { reason: 'max_output_tokens_escalate' },
      // ...
    }
    state = next
    continue
  }
```

The `maxOutputTokensRecoveryCount` is deliberately *not* incremented here. Escalation is free — it's a retry with a better parameter, not a recovery attempt. The user never knows it happened. Also note the `process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS` check: if the user has explicitly set a max output token limit via environment variable, the system respects that choice and skips escalation.

**Phase 2: Multi-turn recovery (up to 3 attempts).** If the model hits 64K — meaning the response genuinely needs more than 64,000 tokens — inject a recovery message telling the model to resume:

```typescript
// query.ts:1223-1251
const MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3

if (maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT) {
  const recoveryMessage = createUserMessage({
    content:
      `Output token limit hit. Resume directly — no apology, no recap ` +
      `of what you were doing. Pick up mid-thought if that is where ` +
      `the cut happened. Break remaining work into smaller pieces.`,
    isMeta: true,
  })

  const next: State = {
    messages: [
      ...messagesForQuery,
      ...assistantMessages,     // Keep the partial output
      recoveryMessage,          // Inject recovery instruction
    ],
    maxOutputTokensRecoveryCount: maxOutputTokensRecoveryCount + 1,
    transition: {
      reason: 'max_output_tokens_recovery',
      attempt: maxOutputTokensRecoveryCount + 1,
    },
    // ...
  }
  state = next
  continue
}
```

The recovery message is carefully worded: "Resume directly -- no apology, no recap." Without this instruction, the model would waste tokens on "I apologize for being cut off, let me continue from where I left off..." — repeating content that's already in the conversation. The "break remaining work into smaller pieces" nudge encourages the model to use tool calls (which create natural stopping points) rather than generating one monolithic output.

The `isMeta: true` flag marks this as a system-injected message, not user input. Meta messages may receive different treatment during compaction — they're candidates for removal when context gets tight, whereas real user messages are preserved.

**Phase 3: Surface the error.** If all 3 recovery attempts are exhausted — meaning the model has been given 4 chances (1 escalation + 3 recoveries) and still can't finish — surface the withheld error:

```typescript
// query.ts:1254-1256
yield lastMessage  // The error message, previously withheld
```

This three-phase strategy handles the spectrum from "slightly too long for 8K" (Phase 1 fixes it silently) to "genuinely enormous output" (Phase 2 gives three more rounds) to "pathological response" (Phase 3 gives up gracefully).

---

## Error Withholding — Hide, Then Decide

The escalation strategy depends on a subtler pattern: **error withholding**. Errors that might be recoverable are suppressed during streaming, then handled after the stream completes.

```typescript
// query.ts:799-825 (simplified)
let withheld = false
if (contextCollapse?.isWithheldPromptTooLong(message, isPromptTooLongMessage, querySource)) {
  withheld = true
}
if (reactiveCompact?.isWithheldPromptTooLong(message)) {
  withheld = true
}
if (isWithheldMaxOutputTokens(message)) {
  withheld = true
}
if (!withheld) {
  yield yieldMessage    // Only yield non-recoverable messages
}
// BUT still push to assistantMessages — recovery checks need them
if (message.type === 'assistant') {
  assistantMessages.push(message)
}
```

Why not just catch errors post-stream? Because the generator protocol means `yield` is visible to the consumer. The comment at `query.ts:166-174` explains the real-world bug that motivated this pattern: SDK consumers (the desktop app, co-work mode) terminate the session when they see any message with an `error` field. If the loop yielded the error, then recovered, the recovery would succeed — but nobody would be listening anymore because the SDK consumer already disconnected.

The solution: don't yield errors that might be recoverable. Still collect them in `assistantMessages` so the recovery logic can find them. After the stream ends, decide whether to recover (continue) or surface (yield the withheld message).

This pattern has a parallel in Chapter 3's cache latching. Just as cache latches suppress header changes to avoid expensive cache misses, error withholding suppresses error messages to avoid expensive consumer disconnects. Both patterns defer a decision until you have enough information to make it correctly.

---

## Streaming Tool Execution

The `StreamingToolExecutor` is a 530-line class that manages concurrent tool execution during model streaming. It's the component that enables the pipelining optimization described in Phase 2.

### Class Architecture

The executor tracks each tool through a lifecycle from pending to executing to completed:

```typescript
// StreamingToolExecutor.ts:40-62
export class StreamingToolExecutor {
  private tools: TrackedTool[] = []
  private toolUseContext: ToolUseContext
  private hasErrored = false
  private siblingAbortController: AbortController  // Child of parent abort
  private discarded = false
  private progressAvailableResolve?: () => void    // Wake signal for progress
}
```

The `siblingAbortController` is constructed as a child of the session's main abort controller. This hierarchy matters: aborting siblings (due to a Bash error) doesn't abort the entire session — just the tools from the current streaming batch. Conversely, aborting the session (user presses Ctrl+C) cascades through the sibling controller to abort all in-flight tools.

The `discarded` flag handles a subtle edge case: if the query loop moves on to a recovery path (like max_output_tokens escalation) before all tools complete, the executor is discarded. Any late-arriving results from the discarded executor are silently dropped rather than injected into the recovery iteration's message stream.

### Concurrency Model

Not all tools are safe to run concurrently. Reading a file is safe. Executing a bash command is not — bash commands may have implicit dependency chains (e.g., `mkdir` followed by `cd` into the directory).

```typescript
// StreamingToolExecutor.ts:129-135
private canExecuteTool(isConcurrencySafe: boolean): boolean {
  const executingTools = this.tools.filter(t => t.status === 'executing')
  return (
    executingTools.length === 0 ||
    (isConcurrencySafe && executingTools.every(t => t.isConcurrencySafe))
  )
}
```

The rule is simple: concurrent-safe tools (Read, Grep, Glob, WebFetch) can execute in parallel with each other. Non-concurrent tools (Bash, Edit, Write) require exclusive access — they wait for all other tools to complete first, and no other tool starts while they're running.

### Sibling Error Cascading

When a Bash tool errors, it aborts all sibling tools:

```typescript
// StreamingToolExecutor.ts:354-363
if (isErrorResult) {
  thisToolErrored = true
  if (tool.block.name === BASH_TOOL_NAME) {
    this.hasErrored = true
    this.erroredToolDescription = this.getToolDescription(tool)
    this.siblingAbortController.abort('sibling_error')
  }
}
```

Only Bash triggers cascading abort. The comment explains: "Bash commands often have implicit dependency chains (e.g., mkdir fails -> subsequent commands pointless). Read/WebFetch/etc. are independent — one failure shouldn't nuke the rest."

The `siblingAbortController` is a child of the parent abort controller, so aborting siblings doesn't abort the entire session — just the tools from the current streaming batch.

### Progress Wakeup

The `getRemainingResults()` method is an async generator that uses `Promise.race` between tool completion and progress signals:

```typescript
// StreamingToolExecutor.ts:453-490
async *getRemainingResults(): AsyncGenerator<MessageUpdate, void> {
  while (this.hasUnfinishedTools()) {
    await this.processQueue()
    for (const result of this.getCompletedResults()) {
      yield result
    }

    if (this.hasExecutingTools() && !this.hasCompletedResults() 
        && !this.hasPendingProgress()) {
      const executingPromises = this.tools
        .filter(t => t.status === 'executing' && t.promise)
        .map(t => t.promise!)

      const progressPromise = new Promise<void>(resolve => {
        this.progressAvailableResolve = resolve
      })

      if (executingPromises.length > 0) {
        await Promise.race([...executingPromises, progressPromise])
      }
    }
  }
}
```

The `progressPromise` pattern deserves attention. When a tool hook emits a progress update (e.g., "downloading 45%"), it resolves `this.progressAvailableResolve()`, which wakes the `Promise.race`. This means progress messages appear in the UI immediately rather than being blocked until the tool completes. For tools like `Bash` that run long commands, this difference is visible — the user sees output streaming in real-time instead of waiting for the entire command to finish.

---

## Token Budget Continuation

The token budget system enables long-running tasks by automatically continuing the loop beyond a single model response. When a user sets a task budget (e.g., `+500K`), the system injects continuation messages to keep the model working.

### Budget Tracking

```typescript
// query/tokenBudget.ts:3-4
const COMPLETION_THRESHOLD = 0.9     // 90% of budget
const DIMINISHING_THRESHOLD = 500    // tokens

// query/tokenBudget.ts:6-11
export type BudgetTracker = {
  continuationCount: number
  lastDeltaTokens: number
  lastGlobalTurnTokens: number
  startedAt: number
}
```

### Decision Logic

The `checkTokenBudget` function decides whether to continue or stop:

```typescript
// query/tokenBudget.ts:45-93
export function checkTokenBudget(
  tracker: BudgetTracker,
  agentId: string | undefined,
  budget: number | null,
  globalTurnTokens: number,
): TokenBudgetDecision {
  // Subagents don't get budget continuation
  if (agentId || budget === null || budget <= 0) {
    return { action: 'stop', completionEvent: null }
  }

  const turnTokens = globalTurnTokens
  const pct = Math.round((turnTokens / budget) * 100)
  const deltaSinceLastCheck = globalTurnTokens - tracker.lastGlobalTurnTokens

  // Diminishing returns detection
  const isDiminishing =
    tracker.continuationCount >= 3 &&
    deltaSinceLastCheck < DIMINISHING_THRESHOLD &&
    tracker.lastDeltaTokens < DIMINISHING_THRESHOLD

  if (!isDiminishing && turnTokens < budget * COMPLETION_THRESHOLD) {
    tracker.continuationCount++
    return {
      action: 'continue',
      nudgeMessage: getBudgetContinuationMessage(pct, turnTokens, budget),
    }
  }

  return { action: 'stop', completionEvent: { diminishingReturns: isDiminishing } }
}
```

Two stopping conditions:

1. **Budget threshold.** When the model has used 90% of the token budget, stop. The 10% headroom gives the model space to wrap up rather than being cut off at exactly 100%.

2. **Diminishing returns.** After 3 continuations, if the last two deltas were both under 500 tokens, stop. This prevents infinite loops where the model produces trivial output on each continuation — "I've completed all the tasks you asked for" repeated forever.

The subagent guard is important: `if (agentId)` returns `stop`. Subagents work within their parent's budget, not their own continuation system. Without this guard, a subagent could consume the entire budget through continuations that the parent agent doesn't control.

### Feature Flag Gating

In the query loop, token budget continuation is gated behind a feature flag:

```typescript
// query.ts:1308-1341
if (feature('TOKEN_BUDGET')) {
  const decision = checkTokenBudget(
    budgetTracker!,
    toolUseContext.agentId,
    getCurrentTurnTokenBudget(),
    getTurnOutputTokens(),
  )

  if (decision.action === 'continue') {
    incrementBudgetContinuationCount()
    state = {
      messages: [
        ...messagesForQuery,
        ...assistantMessages,
        createUserMessage({
          content: decision.nudgeMessage,  // "You've used X% of your budget..."
          isMeta: true,
        }),
      ],
      transition: { reason: 'token_budget_continuation' },
      // ... other fields
    }
    continue
  }
}
```

The `feature('TOKEN_BUDGET')` call reads from the GrowthBook feature flag system we saw in Chapter 2. This gating means the continuation system can be rolled out incrementally — enabled for 5% of users, then 20%, then 100% — with a remote kill switch if the diminishing returns detector proves insufficient against runaway loops. Note that `getCurrentTurnTokenBudget()` and `getTurnOutputTokens()` read from the module-level variables in `bootstrap/state.ts` that we examined in Chapter 3 — the turn-scoped counters that live outside the main State object.

---

## Dependency Injection for Testability

The query loop takes an optional `deps` parameter for testing:

```typescript
// query/deps.ts:21-31
export type QueryDeps = {
  callModel: typeof queryModelWithStreaming
  microcompact: typeof microcompactMessages
  autocompact: typeof autoCompactIfNeeded
  uuid: () => string
}

// query/deps.ts:33-40
export function productionDeps(): QueryDeps {
  return {
    callModel: queryModelWithStreaming,
    microcompact: microcompactMessages,
    autocompact: autoCompactIfNeeded,
    uuid: randomUUID,
  }
}
```

Used with a default fallback:

```typescript
// query.ts:263
const deps = params.deps ?? productionDeps()
```

Three design decisions here are worth studying:

**`typeof realFunction` for signatures.** Instead of defining interface methods manually, `typeof queryModelWithStreaming` keeps the test mock's type in sync with the real implementation automatically. If the real function gains a parameter, tests that don't pass it fail at compile time.

**Narrow scope.** Only 4 dependencies are injected: the model call, two compaction functions, and UUID generation. The comment at `deps.ts:8-20` explains: this replaced `spyOn`-per-module boilerplate across 6-8 test files. The scope is intentionally minimal to prove the pattern before expanding it.

**Optional parameter with default.** Production code passes no `deps` — it gets `productionDeps()`. Test code passes mock deps directly. No framework, no container, no decorator. This is the inverse of the global state pattern from Chapter 3: where `STATE` is a module-level singleton accessible everywhere, `deps` is explicit parameter passing for the four hottest test seams.

---

## Config Snapshot — Immutable Per-Query Configuration

```typescript
// query/config.ts:15-27
export type QueryConfig = {
  sessionId: SessionId
  gates: {
    streamingToolExecution: boolean
    emitToolUseSummaries: boolean
    isAnt: boolean
    fastModeEnabled: boolean
  }
}
```

The comment at `config.ts:7-14` reveals the design rationale:

> Immutable values snapshotted once at query() entry. Separating these from the per-iteration State struct and the mutable ToolUseContext makes future step() extraction tractable — a pure reducer can take (state, event, config) where config is plain data.

Feature flags (from GrowthBook, as we saw in Chapter 2) can change at any time during a session. If the query loop read a flag directly on each iteration, the behavior could change mid-query. By snapshotting gates at entry, the loop behaves consistently within a single query — even if the flag server pushes an update mid-execution.

This also documents the team's architectural direction: they're planning to extract the loop into a pure `step()` function with signature `(state: State, event: Event, config: QueryConfig) -> State`. Separating immutable config is a prerequisite. The `streamingToolExecution` gate controls whether the `StreamingToolExecutor` is instantiated at all — when false, the loop falls back to sequential `runTools()`, making it possible to disable the pipelining optimization via a remote flag if a bug is discovered.

---

## The Missing Tool Result Safety Net

The Anthropic API requires that every `tool_use` block in an assistant message has a matching `tool_result` block in the subsequent user message. If the stream is interrupted mid-generation — by abort, error, or network failure — orphaned `tool_use` blocks break the API contract.

```typescript
// query.ts:123-149
function* yieldMissingToolResultBlocks(
  assistantMessages: AssistantMessage[],
  errorMessage: string,
) {
  for (const assistantMessage of assistantMessages) {
    const toolUseBlocks = assistantMessage.message.content.filter(
      content => content.type === 'tool_use',
    ) as ToolUseBlock[]

    for (const toolUse of toolUseBlocks) {
      yield createUserMessage({
        content: [{
          type: 'tool_result',
          content: errorMessage,
          is_error: true,
          tool_use_id: toolUse.id,
        }],
      })
    }
  }
}
```

This generator is called in three places: streaming fallback (line 900), general errors (line 984), and abort (line 1025). Each site generates synthetic `tool_result` messages with `is_error: true` for any `tool_use` blocks that never got real results. This maintains the API contract regardless of how the stream ended.

The function is a synchronous generator (`function*`, not `async function*`) because it doesn't need to await anything — it's building synthetic messages from data already in memory. The synchronous generator avoids an unnecessary microtask per yield, which matters when there are many orphaned tool blocks to patch.

---

## Clone-on-Write for Cache Correctness

A subtle but important pattern appears in the backfill logic at `query.ts:742-787`. The model's response sometimes contains `tool_use` blocks with partial inputs — the full input is available but derived fields (like resolved file paths) are missing. These derived fields are useful for the UI but aren't part of the original API response.

The problem: the message sent back to the API on the next iteration must be **byte-identical** to the original response for prompt caching to work. As we discussed in Chapter 3, prompt cache hits require exact prefix matches. If you mutate the message to add derived fields, the bytes change, the cache misses, and you pay 7x more per request.

The solution: clone-on-write.

```typescript
// query.ts:742-787 (simplified)
let yieldMessage: typeof message = message
if (message.type === 'assistant') {
  let clonedContent: typeof message.message.content | undefined
  for (let i = 0; i < message.message.content.length; i++) {
    const block = message.message.content[i]!
    if (block.type === 'tool_use' && typeof block.input === 'object') {
      const tool = findToolByName(toolUseContext.options.tools, block.name)
      if (tool?.backfillObservableInput) {
        // Only clone when backfill ADDS fields (not overwrites)
        // Overwrites break VCR fixture hashes on resume
        // ...clone logic...
      }
    }
  }
}
```

The original message flows to `assistantMessages` unchanged — it goes back to the API with byte-perfect fidelity. The cloned message with derived fields flows to the consumer for rendering. Two paths, two purposes, one allocation.

The "only clone when backfill adds fields" guard is a further optimization: if the backfill would overwrite existing fields (like expanding a relative file path to absolute), the clone is skipped. Overwrites break VCR (Video Cassette Recorder) fixture hashes used in integration tests — the test fixtures record API responses, and if backfill changes the response shape, the fixtures need regeneration.

---

## Stop Hooks — Post-Turn Quality Gates

After the model completes (no tool calls), before the loop returns `completed`, stop hooks run:

```typescript
// query.ts:1267-1306
const stopHookResult = yield* handleStopHooks(
  messagesForQuery, assistantMessages,
  systemPrompt, userContext, systemContext,
  toolUseContext, querySource, stopHookActive,
)

if (stopHookResult.preventContinuation) {
  return { reason: 'stop_hook_prevented' }
}

if (stopHookResult.blockingErrors.length > 0) {
  const next: State = {
    messages: [
      ...messagesForQuery,
      ...assistantMessages,
      ...stopHookResult.blockingErrors,  // Inject error messages
    ],
    hasAttemptedReactiveCompact,  // PRESERVE — prevents compact death spiral
    transition: { reason: 'stop_hook_blocking' },
  }
  state = next
  continue  // Re-run with hook errors as new user messages
}
```

Stop hooks are quality gates that run user-defined checks after the model's response. If a hook returns blocking errors, those errors are injected as user messages and the loop continues — giving the model a chance to address the issue.

The `hasAttemptedReactiveCompact` preservation is documented with a real bug report at `query.ts:1293-1296`:

> Preserve the reactive compact guard -- if compact already ran and couldn't recover from prompt-too-long, retrying after a stop-hook blocking error will produce the same result. Resetting to false here caused an infinite loop: compact -> still too long -> error -> stop hook blocking -> compact -> ... burning thousands of API calls.

This is a textbook example of state field interaction in a loop: one recovery path (`reactive_compact`) interacts with another (`stop_hook_blocking`), and resetting state between them creates an infinite loop. The fix is to preserve the guard across transitions. The `transition.reason` field makes this debuggable — you can trace exactly which path reset which field.

---

## Architecture Diagram

The complete query loop architecture:

```
QueryEngine.submitMessage()
    │
    ├── processUserInput() → messages[]
    │
    └── for await (msg of query({messages, systemPrompt, ...}))
            │
            ├── queryLoop() [while(true)]
            │     │
            │     ├── 1. Context Preparation
            │     │     ├── applyToolResultBudget()
            │     │     ├── snipCompact()
            │     │     ├── microcompact()
            │     │     ├── contextCollapse()
            │     │     └── autocompact()
            │     │
            │     ├── 2. Model Call [streaming for-await]
            │     │     ├── yield StreamEvent/Message
            │     │     ├── detect tool_use blocks
            │     │     ├── feed StreamingToolExecutor.addTool()
            │     │     ├── drain getCompletedResults()
            │     │     └── withhold recoverable errors
            │     │
            │     ├── 3. Post-Stream Decision
            │     │     ├── prompt-too-long → reactive compact → continue
            │     │     ├── max_output_tokens → escalate 8K→64K → continue
            │     │     ├── max_output_tokens → recovery message (3x) → continue
            │     │     ├── stop hooks → inject errors → continue
            │     │     ├── token budget → nudge message → continue
            │     │     └── return Terminal { reason: 'completed' }
            │     │
            │     ├── 4. Tool Execution
            │     │     ├── StreamingToolExecutor.getRemainingResults()
            │     │     │   or runTools() (sequential fallback)
            │     │     ├── yield tool result messages
            │     │     └── check abort, hooks, maxTurns
            │     │
            │     └── 5. Continue
            │           state = {
            │             messages: [...prev, ...assistant, ...tools],
            │             transition: { reason: 'next_turn' }
            │           }
            │
            └── Record, persist, yield to SDK consumer
```

---

## Design Lessons

Building the agent loop for a production CLI agent, the Claude Code approach teaches:

**1. Use pull-based streams for agent loops.** Async generators give you backpressure, composable cleanup, and a return channel for exit reasons — all from the language runtime. The consumer controls the pace, not the producer.

**2. Replace state, don't mutate it.** Writing `state = { ...next }` instead of `state.messages.push(...)` means every continuation site declares the complete next state. You can read any transition independently without tracing what other code paths mutated before it.

**3. Use discriminated unions for control flow.** `Terminal` with 10 reasons and `Continue` with 7 reasons replace magic strings, numeric codes, and exception-based control flow. Tests assert on reason fields, not message content.

**4. Pipeline tool execution with streaming.** Starting tools while the model still generates is the single highest-impact performance optimization in the query loop. It requires concurrent-safe/non-safe classification and sibling error cascading, but the latency savings justify the complexity.

**5. Withhold recoverable errors.** Don't expose partial failures to consumers. Suppress them during streaming, attempt recovery, and only surface them when recovery fails. This prevents the bug where SDK consumers disconnect before recovery completes.

**6. Optimize defaults for the common case.** An 8K default that covers 99% of responses saves inference slot reservations. The escalation path handles the 1% that need more. Don't over-provision by default — save resources for the system, recover gracefully when needed.

**7. Document state field interactions.** When one recovery path interacts with another (compact + stop hooks), the interaction creates infinite loops. The `transition` field and comments about real bugs are essential for maintainability.

**8. Snapshot configuration at entry.** Feature flags that change mid-query create subtle inconsistencies. Snapshotting gates once at entry ensures the loop behaves consistently regardless of external state changes. This also enables future extraction into a pure reducer function.

In Chapter 5, we'll move from the query loop that orchestrates model calls to the API client that executes them — the 3,419-line `claude.ts` that manages beta headers, prompt caching strategies, extended thinking modes, and the fast mode cooldown system. Where this chapter treated `deps.callModel()` as a black box, Chapter 5 opens it and reveals how every design decision is shaped by a single constraint: prompt caching economics, where a misplaced header can bust 50-70K tokens of cached prompt and multiply costs by 7x.
