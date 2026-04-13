# Chapter 6: Context Management & Compaction

In Chapter 5, we examined the API client that communicates with the model — prompt caching strategies, beta header latching, and the retry engine. But every request faces a hard constraint: the model's context window. At 200K tokens, it sounds generous until you realize a single large file read can consume 10K tokens, and an agentic session with dozens of tool calls accumulates context faster than you'd expect. Within 15-20 turns, a typical session approaches the window limit.

Claude Code's answer is a **graduated compression pipeline** — seven tiers of increasingly aggressive strategies that fire in sequence as context pressure grows. The cheapest tiers run on every request with zero cost. The most expensive tier makes a full LLM summarization call. The last-resort tier fires only when the API returns an actual error. Together, these tiers span ~6,927 lines across 18 files, making context management one of the largest subsystems in the codebase.

This chapter examines each tier: what triggers it, how it works, what it costs, and why it exists in that specific position in the pipeline.

---

## The Graduated Pipeline

The core tension in context management is **minimize information loss while respecting hard API context limits.** Aggressive compression loses details the model needs. Conservative compression risks context overflow errors. The graduated pipeline resolves this by trying cheap, low-loss strategies first and escalating only when they fail.

```
Context Window Budget (200K tokens)
|-------------------------------------------------------------------|
0%              73.5%          83.5%         88.5%              100%
                  |               |              |
           Warning Zone     Auto-Compact    Blocking Limit
                  |               |              |
          Microcompact fires   Full LLM      Reactive Compact
          (cache-aware)        summary        (error-driven)

Tier Activation Sequence:
.-------------------------------------------------------------.
| Tier 0: API-native context management (server-side)          |
| Tier 1: Time-based microcompact (content-clear on resume)    |
| Tier 2: Cached microcompact (cache-edit API)                 |
| Tier 3: Session memory compact (pre-extracted summary)       |
| Tier 4: Auto-compact (full LLM summarization)                |
| Tier 5: Reactive compact (413/PTL error recovery)            |
| Tier 6: Context collapse (lazy evaluation, feature-gated)    |
'-------------------------------------------------------------'
```

Three data flow paths trigger these tiers:

**Pre-request path** (before calling the model): Tiers 0-2 run inside `microcompactMessages()` in `microCompact.ts`. They modify or annotate messages before the API call, at zero or near-zero cost.

**Post-response path** (after the model responds): Tier 3-4 run inside `autoCompactIfNeeded()` in `autoCompact.ts`. They check the token count against thresholds and summarize if needed.

**Error recovery path** (when the API rejects the request): Tiers 5-6 run inside the query loop from Chapter 4. They handle 413/prompt-too-long errors by compacting and retrying.

### Pipeline Execution Order in query.ts

Understanding the execution order matters because it determines what context reaches the API. The pipeline runs in `query.ts` (lines 365-468), cheapest-first:

```typescript
// query.ts:365 — Start with messages after last compact boundary
let messagesForQuery = [...getMessagesAfterCompactBoundary(messages)]

// --- Tool result budget enforcement (query.ts:379-394) ---
messagesForQuery = await applyToolResultBudget(
  messagesForQuery,
  toolUseContext.contentReplacementState,
  persistReplacements ? records => void recordContentReplacement(...) : undefined,
  new Set(toolUseContext.options.tools
    .filter(t => !Number.isFinite(t.maxResultSizeChars)).map(t => t.name)),
)

// --- History snipping (query.ts:401-409) ---
if (feature('HISTORY_SNIP')) {
  const snipResult = snipModule!.snipCompactIfNeeded(messagesForQuery)
  messagesForQuery = snipResult.messages
  snipTokensFreed = snipResult.tokensFreed
}

// --- Microcompact: Tier 1+2 (query.ts:413-426) ---
const microcompactResult = await deps.microcompact(
  messagesForQuery, toolUseContext, querySource,
)
messagesForQuery = microcompactResult.messages

// --- Context Collapse projection: Tier 6 (query.ts:440-447) ---
if (feature('CONTEXT_COLLAPSE') && contextCollapse) {
  const collapseResult = await contextCollapse.applyCollapsesIfNeeded(
    messagesForQuery, toolUseContext, querySource,
  )
  messagesForQuery = collapseResult.messages
}

// --- Auto-compact: Tier 3+4 (query.ts:454-468) ---
const { compactionResult, consecutiveFailures } = await deps.autocompact(
  messagesForQuery, toolUseContext,
  { systemPrompt, userContext, systemContext, toolUseContext,
    forkContextMessages: messagesForQuery },
  querySource, tracking, snipTokensFreed,
)
```

The ordering is deliberate. Snip and microcompact are synchronous or near-instant — no API calls. Context collapse is a read-time projection. Auto-compact is the expensive tier (an API call for summarization). By running cheap operations first, the system avoids expensive summarization when a simple content-clear would suffice.

---

## Tier 0: API-Native Context Management

The cheapest possible tier delegates compression to the API server itself. No local computation, no extra API call — just additional parameters on the existing request.

```typescript
// apiMicrocompact.ts:35-56
export type ContextEditStrategy =
  | {
      type: 'clear_tool_uses_20250919'
      trigger?: { type: 'input_tokens'; value: number }
      keep?: { type: 'tool_uses'; value: number }
      clear_tool_inputs?: boolean | string[]
      exclude_tools?: string[]
      clear_at_least?: { type: 'input_tokens'; value: number }
    }
  | {
      type: 'clear_thinking_20251015'
      keep: { type: 'thinking_turns'; value: number } | 'all'
    }
```

Two strategy types:

**`clear_tool_uses_20250919`** clears old tool results and inputs when the input token count exceeds a threshold. Default thresholds: trigger at 180K tokens, target 40K tokens. This removes the bulk of context — tool results are typically the largest content blocks.

**`clear_thinking_20251015`** clears thinking blocks from older turns. When the session has been idle for more than an hour (cache is cold anyway), it clears all but the most recent thinking turn.

```typescript
// apiMicrocompact.ts:64-91
export function getAPIContextManagement(options?: {
  hasThinking?: boolean
  isRedactThinkingActive?: boolean
  clearAllThinking?: boolean
}): ContextManagementConfig | undefined {
  const strategies: ContextEditStrategy[] = []
  if (hasThinking && !isRedactThinkingActive) {
    strategies.push({
      type: 'clear_thinking_20251015',
      keep: clearAllThinking ? { type: 'thinking_turns', value: 1 } : 'all',
    })
  }
  // Tool clearing is internal-only
  if (process.env.USER_TYPE !== 'ant') {
    return strategies.length > 0 ? { edits: strategies } : undefined
  }
  // ... tool result and tool use clearing strategies
}
```

The thinking-clear strategy skips when `redact-thinking` is active because redacted thinking blocks have no model-visible content — clearing them saves nothing.

This tier's limitation: it only affects tool results and thinking blocks. Conversation text, system prompts, and user messages are untouched. When those grow large, higher tiers must handle it.

---

## Tier 1: Time-Based Microcompact

When a user returns to a session after a long idle period, the server-side prompt cache has already expired (5-minute or 1-hour TTL, as we saw in Chapter 5). The full prompt prefix will be rewritten regardless. This creates an opportunity: if the cache is cold, we can freely modify message content without cache-busting concerns.

```typescript
// microCompact.ts:422-444
export function evaluateTimeBasedTrigger(
  messages: Message[],
  querySource: QuerySource | undefined,
): { gapMinutes: number; config: TimeBasedMCConfig } | null {
  const config = getTimeBasedMCConfig()
  if (!config.enabled || !querySource || !isMainThreadSource(querySource)) {
    return null
  }
  const lastAssistant = messages.findLast(m => m.type === 'assistant')
  if (!lastAssistant) return null
  const gapMinutes =
    (Date.now() - new Date(lastAssistant.timestamp).getTime()) / 60_000
  if (!Number.isFinite(gapMinutes) || gapMinutes < config.gapThresholdMinutes) {
    return null
  }
  return { gapMinutes, config }
}
```

The trigger is simple: if the time since the last assistant message exceeds a threshold (default 60 minutes), fire. The algorithm:

1. Collect all compactable tool IDs from assistant messages (Read, Bash, Grep, Glob, WebSearch, WebFetch, Edit, Write)
2. Keep the last N results (default 5, minimum 1)
3. Replace everything else's `tool_result` content with `'[Old tool result content cleared]'`

```typescript
// microCompact.ts:459-464
const keepRecent = Math.max(1, config.keepRecent)
const keepSet = new Set(compactableIds.slice(-keepRecent))
const clearSet = new Set(compactableIds.filter(id => !keepSet.has(id)))
```

Unlike cached microcompact (Tier 2), this tier **mutates messages directly**. It can afford to because the cache is cold — there's no cached prefix to preserve. After firing, it resets the cached MC state since any server cache entries are now invalidated, and notifies `promptCacheBreakDetection` to expect lower cache reads so the expected miss is not flagged as a break.

The trade-off is explicit: no LLM cost, but tool result content is permanently cleared from those messages. The model can no longer reference the exact output of old tool calls — but after 60 minutes of idle time, that content is rarely relevant anyway.

This tier only fires on the main thread. Subagents have short lifetimes where gap-based eviction doesn't apply.

---

## Tier 2: Cached Microcompact

This is the most architecturally interesting tier because its entire purpose is **cache preservation**. Rather than modifying local message content (which would change the byte sequence and bust the cache), it uses the API's `cache_edits` mechanism to surgically remove content from the cached prefix on the server side.

```typescript
// microCompact.ts:276-293
if (feature('CACHED_MICROCOMPACT')) {
  const mod = await getCachedMCModule()
  const model = toolUseContext?.options.mainLoopModel ?? getMainLoopModel()
  if (
    mod.isCachedMicrocompactEnabled() &&
    mod.isModelSupportedForCacheEditing(model) &&
    isMainThreadSource(querySource)
  ) {
    return await cachedMicrocompactPath(messages, querySource)
  }
}
```

The algorithm doesn't modify local messages. Instead:

1. Walk messages to collect compactable tool IDs
2. Register tool results with a module-level state tracker (`CachedMCState`)
3. Ask the state for tool results to delete (based on count/trigger thresholds from GrowthBook)
4. Create a `cache_edits` block consumed by the API layer
5. The API uses `cache_reference` + `cache_edits` to remove tool results from the cached prefix without invalidating it

The lifecycle of a cache edit follows a careful four-step sequence:

```
1. cachedMicrocompactPath() → sets module-level pendingCacheEdits
2. consumePendingCacheEdits() → API layer reads and clears pending
3. pinCacheEdits(index, block) → after API success, pin at position
4. getPinnedCacheEdits() → re-sent at original positions for cache hits
```

The boundary message is **deferred** until after the API response so the actual `cache_deleted_input_tokens` from the API can be used instead of client-side estimates. This deferral is critical for accurate telemetry — client-side rough estimates (Chapter 7's `roughTokenCountEstimation`) can be off by 30-50% on tool result content.

This tier is feature-gated to internal users and requires model support for cache editing. The complexity of managing module-level state across turns is the price for cache-optimal compaction. Module-level state must also be reset when any compaction occurs — including compaction triggered by other tiers — to prevent stale edit references from corrupting future requests.

---

## Tier 3: Session Memory Compact

The key innovation of Tier 3: **no LLM call needed for compaction.** Session memory is a markdown file maintained by a background subagent that periodically extracts conversation highlights. When compaction triggers, this pre-extracted summary replaces the compacted messages.

### How Session Memory Extraction Works

A background extraction service monitors the conversation and builds the summary incrementally:

```typescript
// sessionMemory.ts:134-181
export function shouldExtractMemory(messages: Message[]): boolean {
  const currentTokenCount = tokenCountWithEstimation(messages)

  if (!isSessionMemoryInitialized()) {
    if (!hasMetInitializationThreshold(currentTokenCount)) return false
    markSessionMemoryInitialized()
  }

  const hasMetTokenThreshold = hasMetUpdateThreshold(currentTokenCount)
  const toolCallsSinceLastUpdate = countToolCallsSince(messages, lastMemoryMessageUuid)
  const hasMetToolCallThreshold = toolCallsSinceLastUpdate >= getToolCallsBetweenUpdates()
  const hasToolCallsInLastTurn = hasToolCallsInLastAssistantTurn(messages)

  // Trigger: (tokens AND toolCalls) OR (tokens AND natural break)
  return (hasMetTokenThreshold && hasMetToolCallThreshold) ||
         (hasMetTokenThreshold && !hasToolCallsInLastTurn)
}
```

The extraction fires when both a token threshold (default 5,000 since last extraction) and a tool call threshold (default 3 calls) are met — or when the token threshold is met and the model just completed a turn without tool calls (a natural break point). The dual-threshold prevents extraction from firing on every message while ensuring the summary stays reasonably current. Initialization requires a minimum of 10,000 tokens before the first extraction fires, avoiding the overhead of extracting from trivially short conversations.

### The Wait Mechanism

When session memory compact needs the extraction to be current — because the background subagent is still running — it waits with bounded patience:

```typescript
// sessionMemoryUtils.ts:89-105
export async function waitForSessionMemoryExtraction(): Promise<void> {
  const startTime = Date.now()
  while (extractionStartedAt) {
    if (Date.now() - extractionStartedAt > 60_000) return  // Stale, don't wait
    if (Date.now() - startTime > 15_000) return  // Timeout
    await sleep(1000)
  }
}
```

Two timeouts protect against hangs: a 60-second stale guard (if the extraction started more than a minute ago, it's probably stuck) and a 15-second maximum wait. After either timeout, session memory compact uses whatever summary is available, even if it's slightly stale. The alternative — blocking the main thread indefinitely — is worse than using a slightly outdated summary.

### Compaction Algorithm

When auto-compact triggers and session memory is available, it tries session memory compact first:

**Phase 1: Calculate what to keep.**

```typescript
// sessionMemoryCompact.ts:323-397
export function calculateMessagesToKeepIndex(
  messages: Message[],
  lastSummarizedIndex: number,
): number {
  // Expand backwards until meeting BOTH minimums:
  // - At least config.minTokens (default 10,000) tokens
  // - At least config.minTextBlockMessages (default 5) messages with text
  // Hard cap at config.maxTokens (default 40,000)
  // Floor at last compact boundary (disk discontinuity invariant)
}
```

The dual minimum (tokens AND message count) prevents degenerate cases where a single massive tool result satisfies the token minimum but only one message is kept — leaving the model with no conversational context.

**Phase 2: Adjust for API invariants.**

```typescript
// sessionMemoryCompact.ts:232-314
export function adjustIndexToPreserveAPIInvariants(
  messages: Message[],
  startIndex: number,
): number {
  // Step 1: Ensure tool_use/tool_result pairs aren't split
  // Step 2: Ensure thinking blocks sharing message.id are kept together
}
```

This function handles a subtle bug documented in extensive comments at `sessionMemoryCompact.ts:196-231`: when streaming yields separate assistant messages per content block (thinking, tool_use) with the same `message.id`, splitting between them creates orphaned `tool_result` blocks that the API rejects. The adjustment walks forward to include all siblings of a split message, ensuring the kept tail is always a valid API message sequence.

**Phase 3: Build the result.** The session memory markdown becomes the summary, wrapped in standard compaction boundary and summary messages. If the session memory file is oversized, `truncateSessionMemoryForCompact()` truncates it and appends a note with the full file path so the model can `Read` it if needed.

If the post-compact token count still exceeds the auto-compact threshold, session memory compact returns `null` and falls through to Tier 4 (full LLM compact). This guard ensures the system doesn't accept a compaction that doesn't actually solve the space problem.

---

## Tier 4: Auto-Compact — Full LLM Summarization

When cheaper tiers can't reduce context enough, the system makes a full LLM call to summarize the conversation. This is the most expensive tier but produces the highest-quality summaries.

### Trigger

```typescript
// autoCompact.ts:72-91
export function getAutoCompactThreshold(model: string): number {
  const effectiveContextWindow = getEffectiveContextWindowSize(model)
  return effectiveContextWindow - AUTOCOMPACT_BUFFER_TOKENS
  // AUTOCOMPACT_BUFFER_TOKENS = 13,000
  // For 200K context: (200K - 20K_reserved) - 13K = 167,000
}
```

The effective context window subtracts 20K tokens reserved for the compaction summary output (the p99.99 summary length is 17,387 tokens). The 13K buffer ensures compaction fires before the blocking limit, giving the system room to generate the summary without hitting the window ceiling.

### Circuit Breaker

```typescript
// autoCompact.ts:68-70
// BQ 2026-03-10: 1,279 sessions had 50+ consecutive failures (up to 3,272)
// in a single session, wasting ~250K API calls/day globally.
const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3
```

Before this circuit breaker was added, sessions with irrecoverably long context would retry compaction thousands of times. A single session hit 3,272 consecutive failures. Across all users, this burned approximately 250K wasted API calls per day. The fix: after 3 consecutive failures, stop trying for the rest of the session. The counter resets only on a successful compaction or a `/clear` command.

This pattern — a failure budget on recursive retry systems — is one of the most important engineering lessons in the codebase. Any system where failure triggers the same operation again needs a hard cap. Without it, pathological inputs create unbounded amplification. The 250K wasted calls/day figure is a real production cost that motivated the three-strike limit.

Two additional circuit breakers protect the compaction system:

- **PTL retry:** `MAX_PTL_RETRIES = 3` — when the compaction request itself hits prompt-too-long, progressively drop message groups and retry up to 3 times
- **Streaming retry:** `MAX_COMPACT_STREAMING_RETRIES = 2` — with exponential backoff when the streaming connection drops mid-compact

### The Compaction Engine

The core function `compactConversation()` in `compact.ts` (lines 387-763) orchestrates the full compaction:

1. **Pre-compact hooks.** Execute `PreCompact` hooks, merge custom instructions.

2. **Image stripping.** `stripImagesFromMessages()` (`compact.ts:145-200`) removes image/document blocks before sending, replacing with `[image]`/`[document]` markers. This prevents the compaction API call itself from overflowing, especially in sessions with frequent screenshots.

3. **Build the compact prompt.** The prompt in `prompt.ts` is carefully structured with a `NO_TOOLS_PREAMBLE` that aggressively prevents tool calls (the compaction fork inherits the parent's tool set for cache key matching, but tool calls waste the single turn), and requires the model to write chain-of-thought in `<analysis>` tags before the final summary in `<summary>` tags. The analysis is stripped by `formatCompactSummary()` before the summary enters context.

4. **Stream via forked agent.** The compaction call shares the main conversation's cached prefix:

```typescript
// compact.ts:1178-1229
const result = await runForkedAgent({
  promptMessages: [summaryRequest],
  cacheSafeParams,
  canUseTool: createCompactCanUseTool(),  // Denies ALL tool use
  querySource: 'compact',
  forkLabel: 'compact',
  maxTurns: 1,
  skipCacheWrite: true,
})
```

The `skipCacheWrite: true` is critical — the fork's response shouldn't create a new cache entry that competes with the main conversation's cache. The `maxTurns: 1` prevents the compaction agent from entering an agentic loop. A January 2026 experiment confirmed the cache-sharing path: without it, 98% of compact requests were cache misses, doubling the cost of every compaction.

5. **PTL retry loop.** If the compaction request itself hits prompt-too-long (the conversation is so large that even describing it overflows), truncate oldest message groups and retry up to 3 times:

```typescript
// compact.ts:243-291
export function truncateHeadForPTLRetry(
  messages: Message[],
  ptlResponse: AssistantMessage,
): Message[] | null {
  const groups = groupMessagesByApiRound(input)
  if (groups.length < 2) return null
  const tokenGap = getPromptTooLongTokenGap(ptlResponse)
  let dropCount: number
  if (tokenGap !== undefined) {
    // Drop enough groups to cover the gap
    let acc = 0; dropCount = 0
    for (const g of groups) {
      acc += roughTokenCountEstimationForMessages(g)
      dropCount++
      if (acc >= tokenGap) break
    }
  } else {
    dropCount = Math.max(1, Math.floor(groups.length * 0.2))  // 20% fallback
  }
}
```

When the exact token gap is available from the error, the system drops exactly enough groups. When it's not (older API versions), it falls back to dropping 20% of groups.

### The Compact Prompt — Structured Extraction

The prompt requires 9 sections in the summary:

1. **Primary Request** — what the user originally asked
2. **Key Concepts** — technical terms and decisions
3. **Files/Code** — files read or modified
4. **Errors/Fixes** — bugs found and resolved
5. **Problem Solving** — approaches tried
6. **All User Messages** — every user instruction (prevents forgetting)
7. **Pending Tasks** — what's left to do
8. **Current Work** — what was happening when compaction fired
9. **Optional Next Step** — what to do next

Section 9 has a critical constraint: "ensure that this step is DIRECTLY in line with the user's most recent explicit requests." This combats a known failure mode where compacted sessions drift to old or completed tasks — the model resumes work that was already finished because the summary made it seem current.

### Partial Compact

Two directions are supported via `partialCompactConversation()` (`compact.ts:772-1106`):

- **`'from'` direction:** Summarizes messages after a pivot, keeps earlier ones. Preserves prompt cache for the kept prefix — the summary appends rather than replaces.
- **`'up_to'` direction:** Summarizes messages before a pivot, keeps later ones. Invalidates the cache since the summary precedes the kept messages, changing the byte sequence of the cached prefix.

Each direction has its own prompt variant. The `'up_to'` variant includes a "Context for Continuing Work" section instead of "Current Work," since the kept messages already represent current work.

---

## Post-Compact Rebuilding

Compaction deletes messages, but the model needs context to continue working. Post-compact rebuilding is the pipeline that re-injects critical context into the conversation after compaction. It runs through eight parallel attachment generation steps, each with its own token budget:

**1. File restoration** (`compact.ts:1415-1464`). Reads the pre-compact `readFileState` cache (filename to content/timestamp mapping), sorts by recency, takes the top 5 files, and re-reads each for fresh content via `FileReadTool`. Budget: 50K tokens total, 5K per file. Files already visible in preserved messages are skipped (dedup against Read tool results in the kept tail), as are plan files and CLAUDE.md/memory files (restored via separate steps).

**2. Plan restoration** (`compact.ts:1470-1486`). If a plan file exists for the current session, attaches it so the model remembers what it was working toward.

**3. Plan mode preservation** (`compact.ts:1542-1560`). If the user is in plan mode, creates a `plan_mode` attachment so the model continues in plan mode post-compact rather than reverting to execution mode.

**4. Skill restoration** (`compact.ts:1494-1534`). Gathers all invoked skills, sorts most-recent-first (budget pressure drops the least relevant), and truncates each to 5K tokens (keeps the head, where setup instructions live). Total budget: 25K tokens. The truncation marker tells the model it can `Read` the full skill file:

```typescript
// compact.ts:1657-1672
const SKILL_TRUNCATION_MARKER =
  '\n\n[... skill content truncated for compaction; ' +
  'use Read on the skill path if you need the full text]'

function truncateToTokens(content: string, maxTokens: number): string {
  if (roughTokenCountEstimation(content) <= maxTokens) return content
  const charBudget = maxTokens * 4 - SKILL_TRUNCATION_MARKER.length
  return content.slice(0, charBudget) + SKILL_TRUNCATION_MARKER
}
```

**5. Delta re-announcement** (`compact.ts:567-585`). Re-announces deferred tool schemas, available agents, and MCP server instructions. For full compaction, all deltas are diffed against empty message history (a complete re-announcement). For partial compaction, deltas are diffed against `messagesToKeep`, so only what's missing from the kept context is re-injected.

**6. Async agent status** (`compact.ts:1568-1599`). Attaches the status of any running or completed background agents so the model doesn't spawn duplicates of already-running tasks.

**7. Session start hooks** (`compact.ts:592`). Re-runs `SessionStart` hooks to restore CLAUDE.md and other session-scoped context that was set up during initialization.

**8. Post-compact hooks** (`compact.ts:723`). Executes `PostCompact` hooks for user-defined post-compaction actions.

The message assembly order is deliberate:

```typescript
// compact.ts:330-338
return [
  result.boundaryMarker,         // System compact boundary (metadata)
  ...result.summaryMessages,      // User message with formatted summary
  ...(result.messagesToKeep ?? []),  // Preserved recent messages
  ...result.attachments,          // File/skill/plan/delta attachments
  ...result.hookResults,          // SessionStart hook outputs
]
```

The boundary marker comes first because it carries metadata (trigger type, pre-compact token count, last message UUID, discovered tool names) that downstream systems use for chain linking. Summary messages precede preserved messages so the model reads context before recent history. Attachments and hook results come last because they're supplementary — the model should not mistake a re-injected file read for a user request.

### Transcript Preservation

When the `KAIROS` feature is active, pre-compaction messages are written to a reduced transcript segment on disk before being discarded. This enables a reference in the summary message: "If you need specific details from before compaction, read the full transcript at: {path}." The model can then use `Read` to recover exact details that the summary omitted, turning compaction from a lossy operation into a recoverable one.

---

## Cache Reset

After compaction, caches must be invalidated because the message history they reference no longer exists:

```typescript
// compact.ts:518-529
const preCompactReadFileState = cacheToObject(context.readFileState)
context.readFileState.clear()
context.loadedNestedMemoryPaths?.clear()
// Intentionally NOT resetting sentSkillNames: re-injecting full
// skill_listing (~4K tokens) post-compact is pure cache_creation
```

The comment about `sentSkillNames` is a cost optimization: skill listings are ~4K tokens. If they're already in the cache, re-injecting them creates unnecessary cache writes. By preserving the "already sent" flag, skills only re-inject when actually needed.

The centralized cleanup function `runPostCompactCleanup()` (`postCompactCleanup.ts:31-77`) resets all affected caches in one call:

```typescript
// postCompactCleanup.ts:31-77
export function runPostCompactCleanup(querySource?: QuerySource): void {
  const isMainThreadCompact = querySource === undefined ||
    querySource.startsWith('repl_main_thread') || querySource === 'sdk'

  resetMicrocompactState()
  if (isMainThreadCompact) {
    resetContextCollapse()
    getUserContext.cache.clear?.()       // Memoized CLAUDE.md
    resetGetMemoryFilesCache('compact')
  }
  clearSystemPromptSections()
  clearClassifierApprovals()
  clearSpeculativeChecks()
  // NOT resetting sentSkillNames (saves ~4K tokens)
  clearBetaTracingState()
  sweepFileContentCache()
  clearSessionMessagesCache()
}
```

The `isMainThreadCompact` guard is critical: subagents share module-level state with the main thread. Resetting context collapse or the CLAUDE.md cache from a subagent's compact would corrupt the main thread's state. Only main-thread compacts reset main-thread resources.

Post-compaction also re-appends session metadata:

```typescript
// compact.ts:708-712
// Re-append session metadata (custom title, tag) so it stays within
// the 16KB tail window that readLiteMetadata reads for --resume display.
reAppendSessionMetadata()
```

Without this, post-compaction messages push the metadata entry out of the 16KB window, causing `--resume` to show the auto-generated title instead of the user-set session name. A small detail that significantly affects user experience.

---

## Tier 5: Reactive Compact — Error-Driven Recovery

Reactive compact is the last resort before session death. It fires when the API returns a 413 / prompt-too-long error — meaning the context has already exceeded the window, and the request failed.

The error is withheld from the output stream (using the error withholding pattern from Chapter 4) and intercepted by the recovery loop:

```typescript
// query.ts (in the recovery section, lines 1070-1117)
if (reactiveCompact?.isWithheldPromptTooLong(message)) {
  withheld = true
}
// ...later...
if ((isWithheld413 || isWithheldMedia) && reactiveCompact) {
  const compacted = await reactiveCompact.tryReactiveCompact({
    hasAttempted: hasAttemptedReactiveCompact,
    querySource,
    messages: messagesForQuery,
    cacheSafeParams: { ... },
  })
}
```

The algorithm extracts the exact overflow from the error message:

```typescript
// errors.ts:85-118
export function parsePromptTooLongTokenCounts(rawMessage: string): {
  actualTokens: number | undefined
  limitTokens: number | undefined
} {
  const match = rawMessage.match(
    /prompt is too long[^0-9]*(\d+)\s*tokens?\s*>\s*(\d+)/i,
  )
  return {
    actualTokens: match ? parseInt(match[1]!, 10) : undefined,
    limitTokens: match ? parseInt(match[2]!, 10) : undefined,
  }
}
```

Using the token gap (actual - limit), it peels the minimum number of message groups from the oldest end, summarizes them, and retries. This is more precise than auto-compact — it removes exactly what's needed to fit, losing minimum information.

Reactive compact also handles image/PDF size errors by stripping images from messages and retrying. This handles the scenario where a user pastes a large screenshot that pushes the context over the limit.

### Reactive-Only Mode

A feature flag `tengu_cobalt_raccoon` enables reactive-only mode: proactive auto-compact is suppressed, and reactive compact handles all context pressure. The `/compact` command also routes through reactive compact when this mode is active. This was an experimental alternative philosophy — let the context grow to the limit and only compact on actual failure, maximizing context retention at the cost of occasional failed requests.

### Interaction with Context Collapse

When context collapse (Tier 6) is active, it drains staged collapses before reactive compact fires. The recovery waterfall in `query.ts` (lines 1085-1117) tries collapse recovery first; reactive compact only runs if collapse can't recover — ensuring the most appropriate strategy handles each failure mode.

---

## Tier 6: Context Collapse

Context collapse is the most aggressive tier, feature-gated behind `CONTEXT_COLLAPSE`. It fundamentally changes how context management works: instead of reacting to pressure, it proactively manages context with a lazy evaluation strategy.

When collapse is enabled, it **suppresses auto-compact entirely**:

```typescript
// autoCompact.ts:205-223
// Context-collapse mode: same suppression. Collapse IS the context
// management system when it's on — the 90% commit / 95% blocking-spawn
// flow owns the headroom problem. Autocompact firing at effective-13k
// (~93% of effective) sits right between collapse's commit-start (90%)
// and blocking (95%), so it would race collapse and usually win, nuking
// granular context that collapse was about to save.
```

The comment reveals the design tension: auto-compact's 93% threshold sits between collapse's 90% commit and 95% blocking thresholds. If both systems are active, auto-compact fires first and destroys the granular context that collapse was about to save. The solution: when collapse is on, it's the sole context management system.

Context collapse uses the internal codename `marble_origami` as its query source. Auto-compact explicitly skips this source to prevent deadlock — collapse's own compaction calls shouldn't trigger auto-compact.

---

## Message Grouping — The Unit of Compaction

All compaction tiers that remove messages operate on **groups**, not individual messages. A group is one API round-trip: one assistant response and all the user/tool messages that follow it.

```typescript
// grouping.ts:22-63
export function groupMessagesByApiRound(messages: Message[]): Message[][] {
  const groups: Message[][] = []
  let current: Message[] = []
  let lastAssistantId: string | undefined

  for (const msg of messages) {
    if (msg.type === 'assistant' &&
        msg.message.id !== lastAssistantId &&
        current.length > 0) {
      groups.push(current)
      current = [msg]
    } else {
      current.push(msg)
    }
    if (msg.type === 'assistant') {
      lastAssistantId = msg.message.id
    }
  }
  if (current.length > 0) groups.push(current)
  return groups
}
```

Boundaries fire on **new assistant response IDs**, not on user messages. This is deliberate: in single-prompt agentic sessions (SDK/eval callers), the entire workload is one human turn with many assistant responses. Grouping by user messages would produce one giant group; grouping by assistant IDs produces fine-grained groups that can be individually dropped.

The code intentionally avoids tracking unresolved `tool_use` IDs. The comment at `grouping.ts:40-42` explains: malformed conversations (dangling `tool_use` after session resume) would pin the grouping gate shut forever, merging all messages into one group. Instead, `ensureToolResultPairing` at API time repairs split pairs — a defensive strategy that prefers resilience over correctness in edge cases.

---

## The Threshold System

Four buffer constants define the zones of context pressure:

```typescript
// autoCompact.ts:62-65
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000
```

For a 200K-token model:

```
Context Window: 200,000 tokens
  - Max Output Reserved: 20,000 (compact summary p99.99 = 17,387)
  = Effective Window: 180,000

  147,000 (73.5%) — Warning threshold: status bar shows yellow
  167,000 (83.5%) — Auto-compact threshold: Tier 3/4 fires
  177,000 (88.5%) — Blocking limit: new requests blocked
  180,000 (90.0%) — Effective limit: hard API ceiling
```

The `calculateTokenWarningState` function feeds the status bar:

```typescript
// autoCompact.ts:93-145
export function calculateTokenWarningState(tokenUsage: number, model: string): {
  percentLeft: number
  isAboveWarningThreshold: boolean
  isAboveErrorThreshold: boolean
  isAboveAutoCompactThreshold: boolean
  isAtBlockingLimit: boolean
}
```

The 13K auto-compact buffer is tuned so compaction fires before the blocking limit but not so aggressively that it triggers on every large tool result. The gap between auto-compact (83.5%) and blocking (88.5%) gives the compaction call room to complete — the summary itself needs tokens to generate.

The `MANUAL_COMPACT_BUFFER_TOKENS` (3K) controls the `/compact` command's threshold — much lower than auto-compact because the user explicitly asked for compaction, so aggressive behavior is expected.

---

## Cache-Aware Design Across Tiers

Every tier explicitly considers prompt cache impact — this is the unifying design principle:

| Tier | Cache Impact |
|---|---|
| 0: API-native | Zero — server handles it |
| 1: Time-based MC | Mutates freely — cache is known cold (>60 min idle) |
| 2: Cached MC | Entire purpose is cache preservation via `cache_edits` |
| 3: Session memory | Avoids LLM call entirely — no cache interaction |
| 4: Auto-compact | Fork shares parent's cache prefix via `skipCacheWrite` |
| 5: Reactive | Accepts cache break as cost of recovery |
| 6: Collapse | Owns the context lifecycle — manages cache internally |

After any compaction, `notifyCompaction()` resets the cache break detection baseline so the expected cache miss isn't flagged as a break. Missing this call caused 20% false-positive break events — discovered in production analytics (BQ 2026-03-01). The fix was a single function call, but finding it required correlating cache break telemetry with compaction events across thousands of sessions.

---

## Feature Flags as Kill Switches

Every experimental tier has GrowthBook feature flags:

- `tengu_slate_heron`: Time-based MC config
- `CACHED_MICROCOMPACT`: Cache-editing MC
- `tengu_session_memory` + `tengu_sm_compact`: Session memory compact
- `tengu_cobalt_raccoon`: Reactive-only mode
- `CONTEXT_COLLAPSE`: Context collapse
- `tengu_compact_cache_prefix`: Cache sharing for compact fork

This means any tier can be disabled remotely without a code deploy. When a tier causes unexpected behavior in production — corrupted summaries, excessive API calls, cache break regressions — the team can kill it within minutes via the flag server.

The flags are also used for gradual rollout: new tiers launch at 1% of users, monitored via telemetry events (`tengu_compact`, `tengu_sm_compact_*`, `tengu_cached_microcompact`, etc.), and gradually increase to 100% as confidence grows. Each telemetry event includes pre/post token counts, cache hit rates, trigger metadata, and recompaction chain detection — a signal-rich dataset for evaluating whether a new tier is net-positive.

---

## Design Lessons

Building a context management system for a production CLI agent, the Claude Code approach teaches:

**1. Graduate your compression strategies.** Cheap operations first (string replacement, server-side edits), expensive operations only when cheap ones fail (LLM summarization), error-driven recovery as the last resort. Users never pay for more compression than they need.

**2. Design around cache economics.** Every compression strategy must answer: "does this bust the cache?" The 10x cost difference between cache hits and misses (detailed in Chapter 5's caching section) means a cache-busting compaction can cost more than the context it saves.

**3. Use circuit breakers for recursive systems.** Compaction that fails can trigger more compaction. Without the 3-failure circuit breaker, a single broken session burned 3,272 consecutive attempts. Any system that retries on failure needs a failure budget.

**4. Pre-extract summaries in the background.** Session memory compact's zero-LLM-cost compaction is possible because the summary was extracted incrementally during the session. Background extraction during natural breaks (tool calls, user idle time) amortizes the cost across turns rather than paying it all at compaction time.

**5. Group messages by API round, not by role.** In agentic sessions with one user turn and many model turns, role-based grouping produces one giant group. Response-ID-based grouping produces fine-grained units that can be individually dropped.

**6. Rebuild context after compaction.** Compaction deletes messages, but the model needs context to continue working — recently read files, active plans, invoked skills. The post-compact rebuilding pipeline re-injects this context with strict token budgets per category (50K for files, 25K for skills) so restoration doesn't itself cause another compaction.

**7. Constrain the summary prompt against drift.** After compaction, the model tends to resume old or completed tasks. The "ensure DIRECTLY in line with user's most recent explicit requests" constraint in Section 9 of the compact prompt combats this known failure mode.

**8. Separate main-thread from subagent state.** Module-level state is shared across forks. Cache resets from subagent compacts must not corrupt main-thread caches. Guard every cleanup function with an `isMainThreadCompact` check.

In Chapter 7, we'll examine the token estimation and budget system that feeds these threshold calculations — the layered estimation stack from rough heuristics to API-backed counting, the 8K-to-64K output token escalation, and the +500K auto-continue budget system.
