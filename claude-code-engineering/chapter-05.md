# Chapter 5: API Client & Model Communication

In Chapter 4, we dissected the query loop — the `while(true)` async generator that orchestrates the agent's think-act cycle. But we treated the model call as a black box: `deps.callModel()` goes in, messages come out. This chapter opens that box.

The API client lives in `services/api/claude.ts` — 3,419 lines that handle every aspect of communicating with the Anthropic API. It manages beta headers that affect server-side cache keys, implements three prompt caching strategies with different TTLs, runs a retry engine that doubles as an async generator, detects cache breaks with two-phase forensics, and operates a fast mode state machine with cooldown timers. Supporting it are seven more files totaling another 3,577 lines: the retry engine (`withRetry.ts`, 822 lines), cache break detection (`promptCacheBreakDetection.ts`, 727 lines), fast mode (`fastMode.ts`, 532 lines), token estimation (`tokenEstimation.ts`, 495 lines), client factory (`client.ts`, 389 lines), effort resolution (`effort.ts`, 329 lines), and cost calculation (`modelCost.ts`, 231 lines).

Together, these ~7,000 lines form the communication layer between the agent loop and the model. Every design decision here is shaped by one constraint: **prompt caching economics**. A cache hit costs 1/10th of a cache miss. A single misplaced header can bust 50-70K tokens of cached prompt. The entire API client architecture exists to keep cache keys stable while behavior stays dynamic.

---

## Architecture: Two Entry Points, One Generator

The API client exposes two entry points — streaming and non-streaming — but both wrap the same internal generator:

```typescript
// claude.ts:752-780 — Streaming (async generator)
export async function* queryModelWithStreaming({
  messages, systemPrompt, thinkingConfig, tools, signal, options,
}: { ... }): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  return yield* withStreamingVCR(messages, async function* () {
    yield* queryModel(messages, systemPrompt, thinkingConfig, tools, signal, options)
  })
}

// claude.ts:709-750 — Non-streaming (wraps the generator)
export async function queryModelWithoutStreaming({
  messages, systemPrompt, thinkingConfig, tools, signal, options,
}: { ... }): Promise<AssistantMessage> {
  let assistantMessage: AssistantMessage | undefined
  for await (const message of withStreamingVCR(messages, async function* () {
    yield* queryModel(messages, systemPrompt, thinkingConfig, tools, signal, options)
  })) {
    if (message.type === 'assistant') {
      assistantMessage = message
    }
  }
  // ...
}
```

The non-streaming version simply consumes the entire generator and returns the last assistant message. Both wrap in `withStreamingVCR` — a record/replay layer for testing that we'll cover in Chapter 21 on testing infrastructure. This is the same generator-as-protocol pattern from Chapter 4's query loop, applied one layer down: the caller drives the pace, the producer yields when ready.

The `Options` type captures the full request configuration — 25+ fields:

```typescript
// claude.ts:676-707
export type Options = {
  getToolPermissionContext: () => Promise<ToolPermissionContext>
  model: string
  toolChoice?: BetaToolChoiceTool | BetaToolChoiceAuto | undefined
  isNonInteractiveSession: boolean
  maxOutputTokensOverride?: number
  fallbackModel?: string
  querySource: QuerySource
  agents: AgentDefinition[]
  enablePromptCaching?: boolean
  skipCacheWrite?: boolean
  effortValue?: EffortValue
  mcpTools: Tools
  fastMode?: boolean
  taskBudget?: { total: number; remaining?: number }
  // ... 10 more fields
}
```

A single configuration object avoids the "parameter explosion" problem. When a function needs 25 inputs, positional arguments become unreadable. Named fields with a type make every call site self-documenting. This mirrors the `QueryParams` pattern from Chapter 4 — a single typed bag replaces 25 positional arguments.

---

## The queryModel Generator — 1,800 Lines of Orchestration

The internal `queryModel` function (starting ~line 1030) is where the real work happens. Its flow:

```
1. Resolve tool schemas → filter, add defer_loading for tool search
2. Normalize messages → strip tool-search fields, repair pairing, limit media
3. Build system prompt blocks → with cache_control markers
4. Compute latched beta headers → sticky-on for cache stability
5. Create paramsFromContext → closure that builds API params per retry
6. Initiate streaming → anthropic.beta.messages.create({stream: true})
7. Process stream events → accumulate content blocks, tool use, thinking
8. Handle failures → fall back to non-streaming on stream errors
9. Log results → usage, cost, cache metrics
```

Step 5 deserves a closer look. The `paramsFromContext` closure captures the message context but rebuilds API parameters fresh on each retry attempt. This is necessary because the retry engine (detailed later in this chapter) may change the model, the fast mode state, or the effort level between attempts. A static parameter object would carry stale values across retries. The closure pattern ensures every retry gets current parameters while keeping the expensive context preparation (steps 1-4) as a one-time cost.

We'll examine each of the non-obvious steps in detail.

---

## The Client Factory — Four API Providers

Before any request can be sent, the API client needs an SDK client instance. The factory at `client.ts` (389 lines) builds provider-specific clients:

```typescript
// client.ts — Simplified factory pattern
export async function createAnthropicClient(): Promise<Anthropic> {
  const provider = getAPIProvider()  // '1p' | 'bedrock' | 'vertex' | 'foundry'
  switch (provider) {
    case 'bedrock':
      return new AnthropicBedrock({ /* AWS credentials, region */ })
    case 'vertex':
      return new AnthropicVertex({ /* GCP project, location */ })
    case 'foundry':
      return new Anthropic({ baseURL: getFoundryBaseURL(), /* ... */ })
    default:  // '1p' — First-party Anthropic API
      return new Anthropic({ apiKey, /* ... */ })
  }
}
```

The factory is important because provider differences ripple through the entire API client. Bedrock puts beta headers in the request body instead of HTTP headers. Vertex filters certain betas from `countTokens` calls. Foundry uses a custom base URL. The 1P (first-party) Anthropic API gets all betas in headers. By isolating these differences in the factory, the rest of the ~7,000 lines of API client code remains provider-agnostic.

The retry engine (covered below) calls `getClient()` to obtain fresh client instances when connections go stale or auth tokens expire. The factory is the single point where credential refresh, region selection, and SDK configuration happen.

---

## Beta Header Management — Cache Key Engineering

Beta headers are string identifiers that enable experimental API features. They seem simple — just strings in a header — but they have a profound architectural impact: **beta headers are part of the server-side cache key.** Adding, removing, or reordering a beta header mid-session invalidates the entire prompt cache, wasting 50-70K tokens of cached context.

### The Constants

```typescript
// constants/betas.ts:1-31
export const EFFORT_BETA_HEADER = 'effort-2025-11-24'
export const TASK_BUDGETS_BETA_HEADER = 'task-budgets-2026-03-13'
export const PROMPT_CACHING_SCOPE_BETA_HEADER = 'prompt-caching-scope-2026-01-05'
export const FAST_MODE_BETA_HEADER = 'fast-mode-2026-02-01'
export const REDACT_THINKING_BETA_HEADER = 'redact-thinking-2026-02-12'
export const CONTEXT_MANAGEMENT_BETA_HEADER = 'context-management-2025-06-27'
export const STRUCTURED_OUTPUTS_BETA_HEADER = 'structured-outputs-2025-12-15'
export const AFK_MODE_BETA_HEADER = feature('TRANSCRIPT_CLASSIFIER')
  ? 'afk-mode-2026-01-31' : ''  // Feature-gated, tree-shakes out of external builds
```

Note the last line: the AFK mode header is feature-gated at compile time. If `TRANSCRIPT_CLASSIFIER` is disabled, the string literal is empty and the bundler can tree-shake it out entirely. This is a pattern for beta headers that should only exist in internal builds.

### The Latch Pattern

The most important engineering pattern in the API client is **beta header latching**: once a beta header is sent in a session, it keeps being sent for every subsequent request, even if the feature that triggered it is no longer active.

```typescript
// claude.ts:1405-1456
// Sticky-on latches for dynamic beta headers. Each header, once first
// sent, keeps being sent for the rest of the session so mid-session
// toggles don't change the server-side cache key and bust ~50-70K tokens.
// Latches are cleared on /clear and /compact via clearBetaHeaderLatches().

let fastModeHeaderLatched = getFastModeHeaderLatched() === true
if (!fastModeHeaderLatched && isFastMode) {
  fastModeHeaderLatched = true
  setFastModeHeaderLatched(true)
}

let cacheEditingHeaderLatched = getCacheEditingHeaderLatched() === true
// ...

let thinkingClearLatched = getThinkingClearLatched() === true
if (!thinkingClearLatched && isAgenticQuery) {
  const lastCompletion = getLastApiCompletionTimestamp()
  if (lastCompletion !== null && Date.now() - lastCompletion > CACHE_TTL_1HOUR_MS) {
    thinkingClearLatched = true
    setThinkingClearLatched(true)
  }
}
```

The thinking-clear latch has an additional time guard: it only activates when the last API call was more than 1 hour ago (the cache TTL). If the cache has already expired due to inactivity, the latch is safe to set because there's nothing to bust.

The latches are stored in the global `STATE` from Chapter 3 and cleared on `/clear` and `/compact` — the two commands that reset the conversation context. This is correct because those commands also reset the prompt content, so the cache key changes regardless.

### Why Latching Matters — The Cost Math

Consider a session with 50K tokens of cached system prompt. Without latching:

| Turn | Fast Mode | Header Sent | Cache | Cost |
|---|---|---|---|---|
| 1 | Off | No fast-mode header | Miss (first turn) | 50K write tokens |
| 2 | Off | No fast-mode header | **Hit** | 50K read tokens (1/10 cost) |
| 3 | On | fast-mode header added | **Miss** (key changed) | 50K write tokens |
| 4 | On | fast-mode header | Hit | 50K read tokens |
| 5 | Off | header removed | **Miss** (key changed) | 50K write tokens |

Toggling fast mode twice costs two full cache misses — 100K tokens at write pricing. With latching, once the header appears in turn 3, it stays forever. Turns 4 and 5 both hit the cache.

### Provider-Specific Beta Handling

Not all API providers handle betas the same way:

```typescript
// claude.ts:1549-1556
const bedrockBetas = getAPIProvider() === 'bedrock'
  ? [
      ...getBedrockExtraBodyParamsBetas(retryContext.model),
      ...(toolSearchHeader ? [toolSearchHeader] : []),
    ]
  : []
const extraBodyParams = getExtraBodyParams(bedrockBetas)
```

Bedrock puts betas in the request body, not HTTP headers. Vertex filters certain betas from `countTokens` calls. The 1P API gets all betas in headers. This provider abstraction happens at the beta layer — the rest of the API client doesn't know which provider is active. The client factory (described above) and the beta handling are the only two places where provider identity matters.

---

## Prompt Caching — Three Strategies

Prompt caching is the single most impactful cost optimization in Claude Code. The system prompt, tool definitions, and early conversation messages are largely identical across turns. Caching them avoids re-processing on every request.

### Strategy 1: Ephemeral 5-Minute Cache (Default)

```typescript
// claude.ts:358-374
export function getCacheControl({
  scope, querySource,
}: { scope?: CacheScope; querySource?: QuerySource } = {}): {
  type: 'ephemeral'; ttl?: '1h'; scope?: CacheScope
} {
  return {
    type: 'ephemeral',
    ...(should1hCacheTTL(querySource) && { ttl: '1h' }),
    ...(scope === 'global' && { scope }),
  }
}
```

When `should1hCacheTTL()` returns false, the cache control is `{ type: 'ephemeral' }` — the API's default 5-minute TTL. This is the baseline: every request gets at least 5 minutes of caching.

### Strategy 2: Extended 1-Hour TTL

For eligible users, the TTL extends to 1 hour:

```typescript
// claude.ts:377-434
function should1hCacheTTL(querySource?: QuerySource): boolean {
  // 3P Bedrock users get 1h TTL when opted in via env var
  if (getAPIProvider() === 'bedrock' &&
      isEnvTruthy(process.env.ENABLE_PROMPT_CACHING_1H_BEDROCK)) {
    return true
  }

  // Latch eligibility in bootstrap state for session stability
  let userEligible = getPromptCache1hEligible()
  if (userEligible === null) {
    userEligible =
      process.env.USER_TYPE === 'ant' ||
      (isClaudeAISubscriber() && !currentLimits.isUsingOverage)
    setPromptCache1hEligible(userEligible)
  }
  if (!userEligible) return false

  // Cache allowlist from GrowthBook — pattern matching with trailing '*'
  let allowlist = getPromptCache1hAllowlist()
  if (allowlist === null) {
    const config = getFeatureValue_CACHED_MAY_BE_STALE<{
      allowlist?: string[]
    }>('tengu_prompt_cache_1h_config', {})
    allowlist = config.allowlist ?? []
    setPromptCache1hAllowlist(allowlist)
  }

  return querySource !== undefined &&
    allowlist.some(pattern =>
      pattern.endsWith('*')
        ? querySource.startsWith(pattern.slice(0, -1))
        : querySource === pattern,
    )
}
```

Two latching decisions here:

1. **Eligibility is latched.** The first time `should1hCacheTTL` runs, it checks subscriber status and overage. The result is stored in bootstrap state. If the user hits their rate limit mid-session and enters overage, the TTL doesn't flip — because flipping it would bust the cache, costing more than the overage savings.

2. **Allowlist is latched.** The GrowthBook feature flag (Chapter 2's feature flag system) that controls which query sources get 1h TTL is read once and cached. A remote flag update mid-session won't change the TTL. This is the same "snapshot at entry" philosophy as `QueryConfig` from Chapter 4.

### Strategy 3: Global Cache Scope

```typescript
// claude.ts:1207-1229
const useGlobalCacheFeature = shouldUseGlobalCacheScope()
const needsToolBasedCacheMarker =
  useGlobalCacheFeature &&
  filteredTools.some(t => t.isMcp === true && !willDefer(t))

const globalCacheStrategy: GlobalCacheStrategy = useGlobalCacheFeature
  ? needsToolBasedCacheMarker ? 'none' : 'system_prompt'
  : 'none'
```

Global cache scope (`scope: 'global'`) lets system prompts be cached **across users**. Since all Claude Code users share the same system prompt, this is a massive efficiency gain. But there's a constraint: MCP tools are per-user dynamic content. If the tool list includes non-deferred MCP tools, global caching is disabled because the tool definitions would differ between users.

### Cache Breakpoint Placement

Where you place the `cache_control` marker in the message array determines what gets cached:

```typescript
// claude.ts:3063-3106
export function addCacheBreakpoints(
  messages, enablePromptCaching, querySource, useCachedMC,
  newCacheEdits, pinnedEdits, skipCacheWrite,
): MessageParam[] {
  // Exactly one message-level cache_control marker per request.
  // With two markers the second-to-last position is protected and its
  // locals survive an extra turn.
  const markerIndex = skipCacheWrite ? messages.length - 2 : messages.length - 1
  // ...
}
```

The comment reveals a deep understanding of the server-side cache internals: the KV cache eviction system frees pages at cached prefix positions **not** in the store boundaries. Multiple markers protect multiple positions, which wastes memory. The rule: exactly one marker per request.

For fork queries (subagents using `skipCacheWrite`), the marker shifts to the second-to-last message — the shared prefix point. This way the parent conversation's cache is preserved while the subagent's unique messages don't create a separate cache entry.

### Cache Break Detection — Two-Phase Forensics

When something goes wrong with caching, you need to know what changed. The `promptCacheBreakDetection.ts` (727 lines) implements a two-phase detection system:

**Phase 1: Pre-call snapshot.** Before each API call, record hashes of everything that affects the cache key:

```typescript
// promptCacheBreakDetection.ts:247-430
export function recordPromptState(snapshot: PromptStateSnapshot): void {
  // Records hashes of: system prompt, tools, model, betas, fast mode,
  // global cache strategy, effort, extra body params, cache_control
  // Detects what changed since last call and stores as pendingChanges
}
```

**Phase 2: Post-call verification.** After the response, compare cache metrics:

```typescript
// promptCacheBreakDetection.ts:437-666
export async function checkResponseForCacheBreak(
  querySource, cacheReadTokens, cacheCreationTokens, messages, agentId, requestId,
): Promise<void> {
  // If cache_read_input_tokens dropped >5% AND >2,000 tokens absolute,
  // correlate with pending changes to explain WHY
  // Write diff file for debugging
}
```

The detection thresholds are carefully tuned:
- **Relative drop > 5%** — prevents false positives from natural variance
- **Absolute drop > 2,000 tokens** (`MIN_CACHE_MISS_TOKENS`) — small drops aren't worth investigating
- **Time gap exclusion** — gaps >5min (ephemeral TTL) or >1h (extended TTL) suggest natural expiry, not a client bug

When a break is detected, the system writes a diff file showing exactly which component changed — system prompt, tools, betas, or model. This turns "why did my costs spike?" from a guessing game into a forensic report.

---

## The Retry Engine

The retry engine at `withRetry.ts` (822 lines) is itself an async generator — it yields status messages while sleeping between retries. This is the same generator-as-protocol pattern that drives the query loop in Chapter 4 and the streaming entry points above.

```typescript
// withRetry.ts:170-517
export async function* withRetry<T>(
  getClient: () => Promise<Anthropic>,
  operation: (client: Anthropic, attempt: number, context: RetryContext) => Promise<T>,
  options: RetryOptions,
): AsyncGenerator<SystemAPIErrorMessage, T> {
  const maxRetries = getMaxRetries(options)  // DEFAULT_MAX_RETRIES = 10
  let consecutive529Errors = options.initialConsecutive529Errors ?? 0

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (options.signal?.aborted) throw new APIUserAbortError()
    try {
      if (client === null || isAuthError || isStaleConnection) {
        client = await getClient()
      }
      return await operation(client, attempt, retryContext)
    } catch (error) {
      // ... error handling ladder
    }
  }
}
```

Making the retry engine a generator is a key design choice. While the engine sleeps during exponential backoff, it yields `SystemAPIErrorMessage` events that the UI renders as "Retrying in X seconds..." The caller doesn't block — it processes the status message and continues rendering. Compare this with a traditional retry that returns a `Promise<T>`: the caller would see nothing for 32 seconds during the maximum backoff interval.

The `getClient` callback is the connection to the client factory described earlier. On auth errors or stale connections (`ECONNRESET`, `EPIPE`), the engine discards the old client and requests a fresh one. This transparent credential refresh is invisible to the caller.

### Exponential Backoff with Jitter

```typescript
// withRetry.ts:530-548
export function getRetryDelay(
  attempt: number,
  retryAfterHeader?: string | null,
  maxDelayMs = 32000,
): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10)
    if (!isNaN(seconds)) return seconds * 1000
  }
  const baseDelay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), maxDelayMs)
  const jitter = Math.random() * 0.25 * baseDelay
  return baseDelay + jitter
}
// BASE_DELAY_MS = 500
// Sequence: 500ms, 1s, 2s, 4s, 8s, 16s, 32s (cap)
// With 25% jitter: e.g., 500-625ms, 1000-1250ms, ...
```

The server's `retry-after` header takes precedence — the server knows its load better than the client. When absent, exponential backoff with 25% jitter prevents thundering herd. The 32-second cap prevents unreasonably long waits that would frustrate users.

### The Error Handling Ladder

Errors are handled in priority order, each with distinct recovery strategies:

**1. Fast mode 429/529.** Short retry-after (<20s): wait and retry with fast mode still active. Long or unknown: enter cooldown, retry at standard speed. This preserves fast mode when the delay is brief enough that the user won't notice.

**2. Fast mode rejection.** If the API returns a 400 with "Fast mode is not enabled," the client permanently disables fast mode for the session and retries at standard speed. This handles org-level fast mode revocation mid-session.

**3. Background query 529.** Non-foreground queries (summaries, title generation, suggestions) bail immediately on 529. The comment explains: "each retry is 3-10x gateway amplification, and the user never sees those fail anyway."

```typescript
// withRetry.ts:62-89
const FOREGROUND_529_RETRY_SOURCES = new Set<QuerySource>([
  'repl_main_thread', 'sdk',
  'agent:custom', 'agent:default', 'agent:builtin',
  'compact', 'hook_agent', 'hook_prompt',
  'verification_agent', 'side_question', 'auto_mode',
])
```

Only sources in this set retry 529 errors. Everything else — `'suggestion'`, `'title'`, `'summary'`, `'classifier'` — fails silently.

**4. Consecutive 529 escalation.** After 3 consecutive 529 errors, trigger model fallback:

```typescript
// withRetry.ts:326-365
if (consecutive529Errors >= MAX_529_RETRIES) {  // 3 consecutive
  if (options.fallbackModel) {
    throw new FallbackTriggeredError(options.model, options.fallbackModel)
  }
}
```

The `FallbackTriggeredError` is caught by the query loop (Chapter 4), which switches from Opus to Sonnet and retries. Three strikes on the primary model means the service is genuinely overloaded — switching models is better than making the user wait.

**5. Context overflow 400.** When the prompt exceeds the model's context window, the engine parses the error, reduces `max_tokens` by `FLOOR_OUTPUT_TOKENS` (3,000), and retries. This handles edge cases where the token estimation (covered later in this chapter) was slightly off.

**6. Auth errors.** Clear cached credentials, get a fresh client from the factory, and retry. OAuth tokens expire; this handles transparent renewal.

**7. Stale connections.** `ECONNRESET` and `EPIPE` errors indicate the underlying TCP connection died. Disable keep-alive and reconnect. This is common in long-running CLI sessions where the machine sleeps and wakes.

### Persistent Retry Mode

For CI/CD and unattended sessions, the retry engine has a special mode:

```typescript
// withRetry.ts:96-104
const PERSISTENT_MAX_BACKOFF_MS = 5 * 60 * 1000       // 5 min max backoff
const PERSISTENT_RESET_CAP_MS = 6 * 60 * 60 * 1000    // 6 hour cap
const HEARTBEAT_INTERVAL_MS = 30_000                    // 30s heartbeat
```

When `CLAUDE_CODE_UNATTENDED_RETRY` is set, 429/529 errors retry indefinitely (up to 6 hours) with chunked sleeps. The 30-second heartbeat prevents host idle-kill — cloud CI systems terminate processes that don't produce output. The heartbeat writes a dot to stdout every 30 seconds, keeping the process alive. The 5-minute max backoff is higher than interactive mode's 32 seconds because unattended sessions tolerate longer waits.

---

## Streaming Implementation — Raw Stream over SDK Wrapper

The API client deliberately avoids the SDK's `BetaMessageStream` helper:

```typescript
// claude.ts:1818-1836
// Use raw stream instead of BetaMessageStream to avoid O(n^2) partial JSON parsing
// BetaMessageStream calls partialParse() on every input_json_delta, which we don't need
const result = await anthropic.beta.messages
  .create(
    { ...params, stream: true },
    {
      signal,
      ...(clientRequestId && {
        headers: { [CLIENT_REQUEST_ID_HEADER]: clientRequestId },
      }),
    },
  )
  .withResponse()
```

The comment is precise about the problem: `BetaMessageStream` calls `partialParse()` on every `input_json_delta` event to provide incremental JSON parsing of tool inputs. This is O(n^2) because each parse re-scans the accumulated string from the beginning. For a tool call with 10KB of JSON input (common for large file edits), this means thousands of re-parses.

Claude Code doesn't need incremental JSON — it accumulates the raw string and parses once at `content_block_stop`. The raw stream avoids the quadratic overhead entirely.

### Stream Event Processing

The stream processing is a `for await` loop over raw SSE events:

```typescript
// claude.ts:1940-2052
for await (const part of stream) {
  resetStreamIdleTimer()
  switch (part.type) {
    case 'message_start':
      partialMessage = part.message
      ttftMs = Date.now() - start
      usage = updateUsage(usage, part.message?.usage)
      break
    case 'content_block_start':
      // Initialize by type: tool_use, text, thinking, server_tool_use
      break
    case 'content_block_delta':
      // Accumulate deltas into the appropriate content block
      break
    case 'content_block_stop':
      // Finalize: parse tool input JSON, build assistant message
      break
    case 'message_delta':
      // Update stop_reason, usage
      break
  }
}
```

Each event type maps to a specific accumulation action. The `content_block_start` initializes a new block with its type, `content_block_delta` appends string deltas, and `content_block_stop` finalizes — parsing the accumulated JSON for tool use blocks. This manual accumulation replaces what `BetaMessageStream` does automatically but without the O(n^2) parsing.

The `message_start` event captures time-to-first-token (`ttftMs = Date.now() - start`). This metric is logged for every request and used by the telemetry system to track inference latency trends — an important signal for both the infrastructure team and for fast mode's cost/speed tradeoff decisions.

### Stream Idle Watchdog

The SDK's request timeout only covers the initial HTTP connection, not the streaming body. A hung stream with a dropped connection can hang the session indefinitely:

```typescript
// claude.ts:1868-1928
const STREAM_IDLE_TIMEOUT_MS = parseInt(
  process.env.CLAUDE_STREAM_IDLE_TIMEOUT_MS || '', 10
) || 90_000
const STREAM_IDLE_WARNING_MS = STREAM_IDLE_TIMEOUT_MS / 2  // 45s warning

streamIdleTimer = setTimeout(() => {
  streamIdleAborted = true
  streamWatchdogFiredAt = performance.now()
  releaseStreamResources()
}, STREAM_IDLE_TIMEOUT_MS)
```

The watchdog fires after 90 seconds of no events. At 45 seconds (halfway), a warning is emitted. Each incoming event resets the timer via `resetStreamIdleTimer()`. This catches the scenario where the TCP connection stays open but no data flows — invisible to the SDK's timeout mechanism.

### Stall Detection

Beyond the hard timeout, the client also tracks stalls — periods where events arrive but with unusual gaps:

```typescript
// claude.ts:1936-1966
const STALL_THRESHOLD_MS = 30_000  // 30 seconds
for await (const part of stream) {
  if (lastEventTime !== null) {
    const timeSinceLastEvent = now - lastEventTime
    if (timeSinceLastEvent > STALL_THRESHOLD_MS) {
      stallCount++
      totalStallTime += timeSinceLastEvent
      logEvent('tengu_streaming_stall', { ... })
    }
  }
}
```

Stalls are logged but don't kill the stream — the data is eventually arriving. The telemetry helps the infrastructure team identify network paths with high latency variance.

### Non-Streaming Fallback

When streaming fails mid-response, the client falls back to a non-streaming request:

```typescript
// claude.ts:2504-2569
didFallBackToNonStreaming = true
const result = yield* executeNonStreamingRequest(
  { model: options.model, source: options.querySource },
  {
    model: options.model,
    fallbackModel: options.fallbackModel,
    thinkingConfig,
    signal,
    initialConsecutive529Errors: is529Error(streamingError) ? 1 : 0,
  },
  paramsFromContext,
)
```

The fallback counts streaming 529 errors toward the non-streaming retry budget via `initialConsecutive529Errors`. This prevents the scenario where the client exhausts 10 streaming retries, then exhausts 10 non-streaming retries, creating 20 total retries for a single request.

Non-streaming requests have their own token limit:

```typescript
// claude.ts:3354
export const MAX_NON_STREAMING_TOKENS = 64_000
```

The API documentation states a 10-minute maximum for non-streaming requests. The SDK's default 21,333-token cap derives from 10min at 128K tokens/hour, but Claude Code bypasses it by setting a client-level timeout and raising the cap to 64K. This gives the fallback path enough room to produce useful output while staying within the time limit.

### Memory Leak Prevention

```typescript
// claude.ts:1515-1526
function releaseStreamResources(): void {
  cleanupStream(stream)
  stream = undefined
  if (streamResponse) {
    streamResponse.body?.cancel().catch(() => {})
    streamResponse = undefined
  }
}
```

The comment explains: "The Response object holds native TLS/socket buffers that live outside the V8 heap (observed on the Node.js/npm path; see GH #32920), so we must explicitly cancel and release it regardless of how the generator exits."

This is a real memory leak that was discovered in production. The `Response.body` is a `ReadableStream` backed by native TLS buffers. If the generator exits without canceling the body (via `.return()`, exception, or just going out of scope), the native buffers leak. The `releaseStreamResources` function is called on every exit path — normal completion, error, abort, and idle timeout.

---

## Extended Thinking Modes

Extended thinking gives the model a "scratchpad" for reasoning before responding. The API client configures it based on model capabilities and user settings:

```typescript
// claude.ts:1596-1630
if (hasThinking && modelSupportsThinking(options.model)) {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING) &&
      modelSupportsAdaptiveThinking(options.model)) {
    // Adaptive thinking — no budget, model decides
    thinking = { type: 'adaptive' }
  } else {
    // Budget thinking — explicit token budget
    let thinkingBudget = getMaxThinkingTokensForModel(options.model)
    if (thinkingConfig.type === 'enabled' && thinkingConfig.budgetTokens !== undefined) {
      thinkingBudget = thinkingConfig.budgetTokens
    }
    thinkingBudget = Math.min(maxOutputTokens - 1, thinkingBudget)
    thinking = { budget_tokens: thinkingBudget, type: 'enabled' }
  }
}
```

Two modes:

**Adaptive thinking** — the model decides how much thinking to do. No token budget. This is the preferred mode for models that support it, because the model can allocate thinking proportional to task complexity.

**Budget thinking** — an explicit token budget caps thinking. The budget is `Math.min(maxOutputTokens - 1, modelMaxThinking)` — always at least 1 token less than the output limit, so the model can produce at least one token of visible output after thinking.

The source comment is worth noting: "Do not change the adaptive-vs-budget thinking selection below without notifying the model launch DRI and research. This is a sensitive setting that can greatly affect model quality and bashing." This code is treated as critical infrastructure — changes require cross-team coordination.

### Temperature Constraint

```typescript
// claude.ts:1693-1695
const temperature = !hasThinking ? (options.temperatureOverride ?? 1) : undefined
```

When thinking is enabled, temperature must be 1 (the API default). Sending any explicit temperature — even `temperature: 1` — when thinking is active returns an error. The client omits the field entirely, letting the API use its default.

---

## Effort Level System

Effort levels control how deeply the model reasons about a request. Four named levels plus a numeric override:

```typescript
// effort.ts:13-20
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'max'] as const
export type EffortValue = EffortLevel | number  // number is internal-only
```

### Resolution Chain

The effort level for a request is resolved through a priority chain:

```typescript
// effort.ts:152-167
export function resolveAppliedEffort(
  model: string,
  appStateEffortValue: EffortValue | undefined,
): EffortValue | undefined {
  // Priority: env CLAUDE_CODE_EFFORT_LEVEL → appState → model default
  const envOverride = getEffortEnvOverride()
  if (envOverride === null) return undefined  // 'unset' = no effort param
  const resolved = envOverride ?? appStateEffortValue ?? getDefaultEffortForModel(model)
  // API rejects 'max' on non-Opus-4.6 — downgrade to 'high'
  if (resolved === 'max' && !modelSupportsMaxEffort(model)) return 'high'
  return resolved
}
```

The fallback for `max` on non-Opus models is a practical guard: the API returns a 400 error for `effort: 'max'` on models that don't support it. Rather than surfacing an obscure API error, the client silently downgrades to `high`.

### How Effort Reaches the API

```typescript
// claude.ts:440-466
function configureEffortParams(
  effortValue, outputConfig, extraBodyParams, betas, model,
): void {
  if (!modelSupportsEffort(model) || 'effort' in outputConfig) return
  if (effortValue === undefined) {
    betas.push(EFFORT_BETA_HEADER)  // Send beta without explicit level
  } else if (typeof effortValue === 'string') {
    outputConfig.effort = effortValue
    betas.push(EFFORT_BETA_HEADER)
  } else if (process.env.USER_TYPE === 'ant') {
    // Numeric override — internal-only, uses anthropic_internal
    extraBodyParams.anthropic_internal = {
      ...(extraBodyParams.anthropic_internal as Record<string, unknown>) || {},
      effort_override: effortValue,
    }
  }
}
```

Three paths: named effort goes in `outputConfig.effort`, numeric override goes in `anthropic_internal` (internal-only), and `undefined` sends only the beta header with no explicit level (letting the server choose). The beta header is always included when the model supports effort — this is another latch for cache key stability.

### Default Effort by Subscription Tier

```typescript
// effort.ts:279-329
export function getDefaultEffortForModel(model: string): EffortValue | undefined {
  if (model.toLowerCase().includes('opus-4-6')) {
    if (isProSubscriber()) return 'medium'
    if (getOpusDefaultEffortConfig().enabled &&
        (isMaxSubscriber() || isTeamSubscriber())) return 'medium'
  }
  if (isUltrathinkEnabled() && modelSupportsEffort(model)) return 'medium'
  return undefined  // resolves to 'high' in API
}
```

Pro subscribers default to `medium` effort on Opus 4.6 — a cost optimization. The `/effort high` command overrides this. When ultrathink is enabled, the default drops to `medium` because ultrathink bumps it to `high` per-query (the per-query bump is additive with the default).

---

## Task Budget — API-Side Pacing

Distinct from the client-side token budget continuation in Chapter 4, the task budget is an **API-side** feature:

```typescript
// claude.ts:468-501
type TaskBudgetParam = { type: 'tokens'; total: number; remaining?: number }

export function configureTaskBudgetParams(
  taskBudget: Options['taskBudget'],
  outputConfig: BetaOutputConfig & { task_budget?: TaskBudgetParam },
  betas: string[],
): void {
  if (!taskBudget || 'task_budget' in outputConfig ||
      !shouldIncludeFirstPartyOnlyBetas()) return
  outputConfig.task_budget = {
    type: 'tokens',
    total: taskBudget.total,
    ...(taskBudget.remaining !== undefined && { remaining: taskBudget.remaining }),
  }
  if (!betas.includes(TASK_BUDGETS_BETA_HEADER)) {
    betas.push(TASK_BUDGETS_BETA_HEADER)
  }
}
```

The task budget tells the model "you have X tokens total for this entire task." The `remaining` field is decremented by the query loop across iterations. This lets the model self-pace — producing shorter responses when budget is low rather than being cut off mid-sentence. The relationship between the two budget systems: the client-side token budget continuation (Chapter 4's `checkTokenBudget`) handles the *decision* to continue or stop the loop; the API-side task budget handles the model's *awareness* of the budget so it can plan its output accordingly.

---

## Fast Mode — The Speed/Cost Trade-off

Fast mode is Claude Code's option for faster inference at 2x cost. The implementation is more complex than a simple flag because of the interaction with caching and capacity management.

### The State Machine

```typescript
// fastMode.ts:183-237
export type FastModeRuntimeState =
  | { status: 'active' }
  | { status: 'cooldown'; resetAt: number; reason: CooldownReason }

export type CooldownReason = 'rate_limit' | 'overloaded'

export function getFastModeRuntimeState(): FastModeRuntimeState {
  if (runtimeState.status === 'cooldown' && Date.now() >= runtimeState.resetAt) {
    runtimeState = { status: 'active' }
    cooldownExpired.emit()
  }
  return runtimeState
}
```

The state machine has two states: `active` and `cooldown`. The `getFastModeRuntimeState()` getter includes a side effect — if the cooldown timer has expired, it transitions back to `active`. This is a "lazy evaluation" pattern: the state only advances when queried.

### Five-Check Eligibility Gate

Before fast mode activates for any request, five conditions must all pass:

```typescript
// claude.ts:1398-1403
const isFastMode =
  isFastModeEnabled() &&              // Not disabled by env var
  isFastModeAvailable() &&            // Org allows it, correct provider
  !isFastModeCooldown() &&            // Not in rate-limit cooldown
  isFastModeSupportedByModel(options.model) &&  // Opus 4.6 only
  !!options.fastMode                   // User has it toggled on
```

The org-level check (`isFastModeAvailable`) is backed by a prefetch system:

```typescript
// fastMode.ts:367-532
async function fetchFastModeStatus(auth): Promise<FastModeResponse> {
  const endpoint = `${getOauthConfig().BASE_API_URL}/api/claude_code_penguin_mode`
  // ...
}

type FastModeOrgStatus =
  | { status: 'pending' }
  | { status: 'enabled' }
  | { status: 'disabled'; reason: FastModeDisabledReason }
```

The org status is prefetched at startup with a 30-second debounce. Results are cached globally. On failure: internal users default to enabled; external users fall back to the cached `penguinModeOrgEnabled` state. This prefetch prevents the first fast-mode request from blocking on a network call.

### The Key Separation: Header vs Parameter

```typescript
// claude.ts:1642-1657
let speed: BetaMessageStreamParams['speed']
const isFastModeForRetry = isFastModeEnabled() && isFastModeAvailable() &&
  !isFastModeCooldown() && isFastModeSupportedByModel(options.model) &&
  !!retryContext.fastMode
if (isFastModeForRetry) {
  speed = 'fast'
}
if (fastModeHeaderLatched && !betasParams.includes(FAST_MODE_BETA_HEADER)) {
  betasParams.push(FAST_MODE_BETA_HEADER)
}
```

This is the most subtle pattern in the API client: the beta **header** (`fast-mode-2026-02-01`) is latched — once sent, always sent. The `speed: 'fast'` **parameter** is dynamic — suppressed during cooldown. The header affects the cache key; the parameter affects behavior. By keeping the header stable and varying the parameter, fast mode can enter cooldown without busting the cache.

### Cooldown Thresholds

```typescript
// withRetry.ts:799-801
const DEFAULT_FAST_MODE_FALLBACK_HOLD_MS = 30 * 60 * 1000  // 30 min default
const SHORT_RETRY_THRESHOLD_MS = 20 * 1000                  // 20 sec threshold
const MIN_COOLDOWN_MS = 10 * 60 * 1000                      // 10 min minimum
```

- **retry-after < 20s** -- Wait and retry with fast mode active. Short delays are transient; preserving fast mode preserves the cache key.
- **retry-after >= 20s or unknown** -- Cooldown for max(retry-after, 10 min), default 30 min. Long delays indicate real capacity pressure.

### Pricing

```typescript
// modelCost.ts:62-69
// Fast mode Opus 4.6: $30 input / $150 output per Mtok
export const COST_TIER_30_150 = {
  inputTokens: 30, outputTokens: 150,
  promptCacheWriteTokens: 37.5, promptCacheReadTokens: 3,
}

// Standard Opus 4.6: $15 input / $75 output per Mtok
export const COST_TIER_15_75 = { ... }
```

Fast mode is exactly 2x standard pricing. The cache read price stays at $3/Mtok — caching savings are proportionally even larger in fast mode.

---

## Token Estimation — Four Tiers

Token estimation is needed for context management (Chapter 6) and cost tracking. Four methods at decreasing accuracy, each handling the failure of the tier above:

**Tier 1: API countTokens** — exact count from the API. Uses `anthropic.beta.messages.countTokens()` for the 1P provider, and provider-specific equivalents for Bedrock (`CountTokensCommand`) and Vertex. Vertex filters certain betas from `countTokens` calls to avoid errors. Used when network is available and the call won't be rate-limited.

**Tier 2: Haiku fallback** — makes a real API call with `max_tokens: 1` to the cheapest model (Haiku) and reads `usage.input_tokens` from the response. Creative: it's a "free" token count that piggybacks on the cheapest model. For Vertex global and Bedrock configurations that require thinking, the fallback uses Sonnet instead of Haiku.

```typescript
// tokenEstimation.ts — Haiku fallback
export async function countTokensViaHaikuFallback(
  messages: MessageParam[],
  tools: BetaToolUnion[],
): Promise<number | null> {
  // Makes a real API call with max_tokens:1, reads usage from response
  // Uses Haiku (cheapest), falls back to Sonnet for Vertex global/Bedrock+thinking
}
```

**Tier 3: Rough estimation** — `Math.round(content.length / bytesPerToken)` with a default of 4 bytes per token. No network needed.

**Tier 4: File-type-aware estimation** — adjusts the bytes-per-token ratio based on file extension:

```typescript
// tokenEstimation.ts:391-435
export function bytesPerTokenForFileType(fileExtension: string): number {
  switch (fileExtension) {
    case 'json': case 'jsonl': case 'jsonc':
      return 2  // JSON is token-dense
    default:
      return 4
  }
}
```

JSON gets a 2 bytes/token ratio because single-character tokens (`{`, `}`, `:`, `,`, `"`) make the standard 4-byte estimate off by 2x.

### Content Block Estimation

The rough estimator handles different content block types with type-specific logic:

```typescript
// tokenEstimation.ts:391-435
function roughTokenCountEstimationForBlock(block): number {
  if (block.type === 'text') return roughTokenCountEstimation(block.text)
  if (block.type === 'image' || block.type === 'document') return 2000  // Fixed estimate
  if (block.type === 'tool_result') return roughTokenCountEstimationForContent(block.content)
  if (block.type === 'tool_use')
    return roughTokenCountEstimation(block.name + jsonStringify(block.input ?? {}))
  if (block.type === 'thinking') return roughTokenCountEstimation(block.thinking)
  if (block.type === 'redacted_thinking') return roughTokenCountEstimation(block.data)
  return roughTokenCountEstimation(jsonStringify(block))
}
```

Images and documents get a fixed 2,000-token estimate because their actual token consumption depends on resolution and encoding, not byte length. Tool use blocks concatenate the tool name with the serialized input — the name itself costs tokens. The `redacted_thinking` branch handles Opus's encrypted thinking blocks, which contain opaque data that still counts against the context window.

### Usage Tracking — Cumulative, Not Delta

```typescript
// claude.ts:2924-2987
export function updateUsage(
  usage: Readonly<NonNullableUsage>,
  partUsage: BetaMessageDeltaUsage | undefined,
): NonNullableUsage {
  return {
    input_tokens: partUsage.input_tokens > 0
      ? partUsage.input_tokens : usage.input_tokens,
    output_tokens: partUsage.output_tokens ?? usage.output_tokens,
    // ...
  }
}
```

The Anthropic streaming API provides **cumulative** usage totals, not deltas. The `> 0` guard on input tokens handles a subtlety: `message_delta` events may include explicit 0 values for input tokens, which should not overwrite the real values from `message_start`. Without this guard, the final usage would show 0 input tokens.

---

## Design Lessons

Building the API communication layer for a production CLI agent, the Claude Code approach teaches:

**1. Cache key stability is an architectural concern.** Every configuration change — headers, tools, system prompt — potentially invalidates 50-70K tokens of cached context. The latch pattern (set once, never unset within a session) is the primary tool for stability.

**2. Separate cache key from behavior.** Beta headers (cache key) and parameters (behavior) should be independently controllable. Fast mode header latched + speed parameter dynamic = stable cache during cooldown.

**3. Make retries observable.** An async generator retry engine yields progress messages while sleeping. The UI shows real-time retry status without blocking the rendering loop.

**4. Skip SDK convenience when it costs performance.** Raw stream processing avoids O(n^2) JSON parsing. Manual content block accumulation is more code but runs in linear time.

**5. Detect cache breaks forensically.** Two-phase detection (pre-call snapshot + post-call verification) with correlation tells you *which* component busted the cache, not just *that* it busted.

**6. Tier your estimation methods.** Exact API count, cheap model fallback, rough estimate, file-type-aware estimate. Each layer handles the failure of the one above. The system always has a number, just at varying accuracy.

**7. Handle the long tail of network failures.** Stream idle watchdog, stall detection, stale connection recovery, non-streaming fallback — each handles a different failure mode that the SDK's simple timeout can't cover. Production CLI sessions run for hours; the network will fail in every way possible.

**8. Abstract providers at the narrowest layer.** The client factory and beta handling are the only two places where provider identity matters. The other ~6,500 lines of API client code don't know whether they're talking to Anthropic's API, AWS Bedrock, GCP Vertex, or Azure Foundry.

In Chapter 6, we'll examine the context management system that keeps conversations within the model's token window. The API client sends what the query loop gives it, but the context manager decides *what to give*: a graduated compression pipeline from cheap history snipping to full LLM-based compaction, spanning seven tiers across ~6,927 lines. Where this chapter focused on keeping requests cheap (cache stability), Chapter 6 focuses on keeping them small enough to send at all.
