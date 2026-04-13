# Chapter 7: Token Estimation & Budget System

In Chapter 6, we built the five-tier context compression pipeline that keeps conversations within the model's 200K token window. But that entire system depends on answering one question: *how many tokens are in this conversation right now?* Get the number wrong, and compaction fires too late (context overflow) or too early (wasted summarization). This chapter covers the 5,489 lines of token management infrastructure that answer that question — and the budget systems that use the answer to control how much the agent spends.

Token management in a CLI agent is not a single function. It is a layered system spanning estimation, counting, budgeting, cost tracking, and automatic compaction triggers. The core challenge: you need token counts *before* the API call (to decide if compaction is needed), but exact counts only arrive *after* the API call (in the response's `usage` field). The entire architecture exists to bridge that gap.

We will trace the token lifecycle from rough estimation through exact counting, then examine the two independent budget systems (client-side continuation and server-side pacing), the output token escalation strategy that saves 4-8x GPU slot capacity, the cost tracking infrastructure that feeds the `/cost` command, and the auto-compact thresholds that connect everything back to Chapter 6's compaction engine.

---

## The Estimation Stack — Three Layers of Accuracy

Every token count in the system comes from one of three layers, each trading accuracy for availability. The layers degrade gracefully: if the exact count fails, the system falls back to rough estimation. If rough estimation has no content to measure, it returns zero. The system never throws, never blocks, and always produces a number.

### Layer 1: The 4-Byte Heuristic

The simplest estimation — divide the byte length of the content by a constant:

```typescript
// services/tokenEstimation.ts:203-208
export function roughTokenCountEstimation(
  content: string,
  bytesPerToken: number = 4,
): number {
  return Math.round(content.length / bytesPerToken)
}
```

The default 4 bytes per token comes from empirical observation of BPE tokenizers on English text. It is deliberately a rough average — good enough for threshold comparisons, wrong enough that you should never use it for billing. The function exists because it needs zero dependencies: no network, no API client, no model metadata. It works at import time, in tests, and during bootstrap before the API client is initialized.

But 4 bytes per token is wrong for specific content types. JSON, with its dense punctuation of single-character tokens (`{`, `}`, `:`, `,`, `"`), tokenizes at roughly 2 bytes per token. A 10KB JSON tool result estimated at 4 bytes/token would read as 2,500 tokens. The actual count is closer to 5,000. Underestimate by 2x, and your compaction threshold fires 2x too late.

```typescript
// services/tokenEstimation.ts:215-224
export function bytesPerTokenForFileType(fileExtension: string): number {
  switch (fileExtension) {
    case 'json':
    case 'jsonl':
    case 'jsonc':
      return 2    // JSON has many single-char tokens: { } : , "
    default:
      return 4
  }
}
```

This fixed a real production bug. Before the adjustment, large JSON tool results from `Grep` and `Read` operations would slip past budget checks, filling the context window past the auto-compact threshold and triggering 413 errors from the API.

### Layer 2: Block-Level Estimation for Mixed Content

Messages in the Anthropic API are not plain strings. They are arrays of content blocks — text, images, documents, tool results, tool use, thinking blocks, and more. Each block type has different tokenization characteristics:

```typescript
// services/tokenEstimation.ts:391-435
function roughTokenCountEstimationForBlock(
  block: string | Anthropic.ContentBlock | Anthropic.ContentBlockParam,
): number {
  if (typeof block === 'string') {
    return roughTokenCountEstimation(block)
  }
  if (block.type === 'text') {
    return roughTokenCountEstimation(block.text)
  }
  if (block.type === 'image' || block.type === 'document') {
    return 2000
  }
  if (block.type === 'tool_result') {
    return roughTokenCountEstimationForContent(block.content)
  }
  if (block.type === 'tool_use') {
    return roughTokenCountEstimation(
      block.name + jsonStringify(block.input ?? {}),
    )
  }
  if (block.type === 'thinking') {
    return roughTokenCountEstimation(block.thinking)
  }
  if (block.type === 'redacted_thinking') {
    return roughTokenCountEstimation(block.data)
  }
  return roughTokenCountEstimation(jsonStringify(block))
}
```

Two design decisions stand out:

**Images and PDFs use a fixed 2,000-token estimate.** The actual formula for images is `(width * height) / 750`, which for a max 2000x2000 image gives ~5,333 tokens. The 2,000-token constant is deliberately conservative — but conservative in the *right direction*. Overestimating triggers compaction early (safe). Underestimating allows context overflow (unrecoverable 413 error). The constant also matches `microCompact`'s `IMAGE_MAX_TOKEN_SIZE` (from Chapter 6), so both systems agree on image budgets and don't fight each other.

**Tool use blocks serialize the input to JSON.** The model generates tool inputs as arbitrary JSON — a `FileEdit` call might have 5KB of replacement text. The estimation stringifies the input and counts it. The `tool_result` block recurses into its content array, which may contain text, images, or nested blocks.

The fallback at the bottom (`jsonStringify(block)`) handles any block type the code doesn't recognize — `server_tool_use`, `web_search`, MCP results, or future block types. This is defensive programming against API evolution: new block types get a reasonable estimate instead of being silently counted as zero.

### Layer 3: API-Backed Exact Counting

When you need the real number, the system calls the Anthropic `countTokens` API:

```typescript
// services/tokenEstimation.ts:124-201
export async function countMessagesTokensWithAPI(
  messages: Anthropic.Beta.Messages.BetaMessageParam[],
  tools: Anthropic.Beta.Messages.BetaToolUnion[],
): Promise<number | null> {
  return withTokenCountVCR(messages, tools, async () => {
    try {
      const model = getMainLoopModel()
      const betas = getModelBetas(model)
      const containsThinking = hasThinkingBlocks(messages)

      if (getAPIProvider() === 'bedrock') {
        return countTokensWithBedrock({
          model, messages, tools, betas, containsThinking,
        })
      }

      const anthropic = await getAnthropicClient({
        maxRetries: 1, model, source: 'count_tokens',
      })
      const response = await anthropic.beta.messages.countTokens({
        model: normalizeModelStringForAPI(model),
        messages: messages.length > 0
          ? messages
          : [{ role: 'user', content: 'foo' }],
        tools,
        ...(containsThinking && {
          thinking: {
            type: 'enabled',
            budget_tokens: TOKEN_COUNT_THINKING_BUDGET,
          },
        }),
      })
      return response.input_tokens
    } catch (error) {
      logError(error)
      return null
    }
  })
}
```

The function signature tells the entire philosophy: `Promise<number | null>`. It never throws. On any failure — network error, rate limit, unsupported provider — it returns `null`, and callers fall back to rough estimation. This means the system *always* has a token count available, at varying accuracy, regardless of network conditions or API provider capabilities.

Three subtleties in this implementation:

**Thinking block handling.** When messages contain thinking blocks, the `countTokens` API requires thinking to be enabled with a budget. The counting-only call uses minimal values — 1,024 budget, 2,048 max tokens (`tokenEstimation.ts:30-33`) — to satisfy the API constraint without wasting capacity. These are throwaway values; the counting endpoint does not actually generate output.

**Empty message guard.** If `messages` is empty, the function substitutes a dummy `{ role: 'user', content: 'foo' }`. The `countTokens` endpoint requires at least one message. The dummy adds a negligible token count (~1-2 tokens) to an empty result — an acceptable error margin.

**VCR wrapper.** The `withTokenCountVCR` wrapper enables record/replay in tests (covered in Chapter 43). In production, it is a pass-through.

### How the Three Layers Compose

The layered design follows a consistent pattern throughout the system:

```
API count (exact) → API count + rough delta → pure rough estimate
                          ↑
                   This is the common case
```

The common case is the middle tier: you have an exact count from the last API response, plus a rough estimate of messages added since then. This gives you accuracy within 5-10% — good enough for threshold decisions — without an extra API call on every turn.

---

## The Canonical Token Counter

### tokenCountWithEstimation — The Single Source of Truth

Every subsystem that needs to answer "how full is the context window?" calls one function: `tokenCountWithEstimation`. Auto-compact uses it. The status bar uses it. Session memory initialization uses it. The blocking limit check uses it. If you build a token-aware agent, this function is the one to study.

```typescript
// utils/tokens.ts:226-261
export function tokenCountWithEstimation(
  messages: readonly Message[],
): number {
  let i = messages.length - 1
  while (i >= 0) {
    const message = messages[i]
    const usage = message ? getTokenUsage(message) : undefined
    if (message && usage) {
      const responseId = getAssistantMessageId(message)
      if (responseId) {
        let j = i - 1
        while (j >= 0) {
          const prior = messages[j]
          const priorId = prior ? getAssistantMessageId(prior) : undefined
          if (priorId === responseId) {
            i = j
          } else if (priorId !== undefined) {
            break
          }
          j--
        }
      }
      return (
        getTokenCountFromUsage(usage) +
        roughTokenCountEstimationForMessages(messages.slice(i + 1))
      )
    }
    i--
  }
  return roughTokenCountEstimationForMessages(messages)
}
```

The algorithm has three phases:

**Phase 1: Walk backward to find real usage data.** Starting from the end of the message array, the function searches for the last assistant message that carries API usage data. Not every message has usage — user messages, tool results, and injected system messages don't. Only assistant messages from actual API calls carry the `usage` field.

**Phase 2: Handle parallel tool call deduplication.** This is the non-obvious part. When the model makes multiple tool calls in a single response, the streaming code (Chapter 5) emits a *separate* assistant record per content block, all sharing the same `message.id`. The messages array looks like:

```
[..., assistant(id=A), user(tool_result), assistant(id=A), user(tool_result), ...]
```

If the function stops at the *last* `assistant(id=A)`, it would only estimate one `tool_result` after it and miss all the earlier interleaved ones. The inner `while` loop walks back to the *first* sibling with the same `message.id`, ensuring every interleaved tool result is included in the rough estimate slice.

**Phase 3: Combine exact + estimate.** The return value is the sum of two parts: the exact token count from the API's `usage` field (everything up to and including that response), plus a rough estimate of all messages appended since.

When no message has usage data at all — the conversation just started, or the API never returned usage — the function falls through to pure rough estimation of the entire array. This is the "floor" accuracy level: always available, never fails.

### What getTokenCountFromUsage Includes

```typescript
// utils/tokens.ts:46-53
export function getTokenCountFromUsage(usage: Usage): number {
  return (
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    usage.output_tokens
  )
}
```

All four categories matter because they all occupy context window space. Cache tokens are a billing distinction, not a context distinction — a cached token takes the same context slot as a fresh one. If you only counted `input_tokens + output_tokens`, you would undercount by the cached portion, which for a well-warmed session can be 80-90% of the input.

---

## Output Token Escalation: 8K to 64K

### The Slot Reservation Problem

When you send `max_output_tokens: 32000` to the API, the serving infrastructure reserves a GPU slot large enough to produce 32,000 tokens. For Claude Code's actual workload, p99 output is 4,911 tokens. That means 87-94% of every reserved slot goes unused — 6.5x over-reservation at the median, 16x at the 50th percentile. Across millions of requests per day, this wastes enormous GPU capacity.

The solution is a two-phase escalation: start at 8K, retry at 64K only when needed.

### The Constants

```typescript
// utils/context.ts:8-25
export const CAPPED_DEFAULT_MAX_TOKENS = 8_000
export const ESCALATED_MAX_TOKENS = 64_000

const MAX_OUTPUT_TOKENS_DEFAULT = 32_000
const MAX_OUTPUT_TOKENS_UPPER_LIMIT = 64_000
```

### Per-Model Output Limits

Different models have different ceilings:

```typescript
// utils/context.ts:149-210
export function getModelMaxOutputTokens(model: string): {
  default: number
  upperLimit: number
} {
  const m = getCanonicalName(model)
  if (m.includes('opus-4-6')) {
    return { default: 64_000, upperLimit: 128_000 }
  }
  if (m.includes('sonnet-4-6')) {
    return { default: 32_000, upperLimit: 128_000 }
  }
  if (m.includes('opus-4-5') || m.includes('sonnet-4') ||
      m.includes('haiku-4')) {
    return { default: 32_000, upperLimit: 64_000 }
  }
  if (m.includes('claude-3-opus')) {
    return { default: 4_096, upperLimit: 4_096 }
  }
  // Fallback
  return { default: 32_000, upperLimit: 64_000 }
}
```

### The Capping Function

```typescript
// services/api/claude.ts:3399-3417
export function getMaxOutputTokensForModel(model: string): number {
  const maxOutputTokens = getModelMaxOutputTokens(model)

  const defaultTokens = isMaxTokensCapEnabled()
    ? Math.min(maxOutputTokens.default, CAPPED_DEFAULT_MAX_TOKENS)
    : maxOutputTokens.default

  const result = validateBoundedIntEnvVar(
    'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
    process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS,
    defaultTokens,
    maxOutputTokens.upperLimit,
  )
  // ...
}
```

The `Math.min` is critical: it keeps models with native defaults below 8K (like `claude-3-opus` at 4,096) at their native value. You do not want to *raise* a model's default to 8K if it cannot support it.

### The Three-Phase Escalation

As covered in Chapter 4, the query loop handles `max_output_tokens` exhaustion with a three-phase recovery (from `query.ts:1188-1256`):

1. **Phase 1: 8K to 64K.** Retry the same request with `max_output_tokens: 64000`. No user message injected. This handles the <1% of requests that genuinely need more than 8K output tokens.

2. **Phase 2: Multi-turn recovery.** Inject a "Resume directly where you left off" message and call the model again, up to 3 times. This handles responses that exceed even 64K — rare but possible for large code generation tasks.

3. **Phase 3: Surface error.** If 3 resume attempts fail, the system surfaces the truncation to the user.

### The Economics

| Metric | 32K Default | 8K + Escalation |
|--------|------------|-----------------|
| Slot utilization | 15% (p99 = 4,911) | 61% for 99%+ of requests |
| Wasted capacity | 6.5x over-reservation | ~1.3x for capped requests |
| Extra API calls | 0 | ~1 per 100 requests |
| Net efficiency | Baseline | 4-8x improvement |

The trade-off is clear: one retry per ~100 requests costs far less than 6.5x global over-reservation. This is a textbook example of optimizing for the common case while handling the tail correctly.

The `CLAUDE_CODE_MAX_OUTPUT_TOKENS` environment variable exists as an escape hatch. Users who consistently generate long output can set it to 32K or 64K to avoid the retry overhead. But the default serves the 99th percentile correctly.

---

## Token Budget: The User-Facing Parser

When a user types `"refactor this module +500k"`, the system needs to extract `500000` from the natural language prompt, remove it from the text sent to the model, and use it to control how long the agent loop runs. This is the client-side token budget system.

### Parsing Shorthand Notation

```typescript
// utils/tokenBudget.ts:1-19
const SHORTHAND_START_RE = /^\s*\+(\d+(?:\.\d+)?)\s*(k|m|b)\b/i
const SHORTHAND_END_RE = /\s\+(\d+(?:\.\d+)?)\s*(k|m|b)\s*[.!?]?\s*$/i
const VERBOSE_RE = /\b(?:use|spend)\s+(\d+(?:\.\d+)?)\s*(k|m|b)\s*tokens?\b/i

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
}

export function parseTokenBudget(text: string): number | null {
  const startMatch = text.match(SHORTHAND_START_RE)
  if (startMatch) return parseBudgetMatch(startMatch[1]!, startMatch[2]!)
  const endMatch = text.match(SHORTHAND_END_RE)
  if (endMatch) return parseBudgetMatch(endMatch[1]!, endMatch[2]!)
  const verboseMatch = text.match(VERBOSE_RE)
  if (verboseMatch) return parseBudgetMatch(verboseMatch[1]!, verboseMatch[2]!)
  return null
}
```

Three patterns, checked in priority order:

- **Start-anchored:** `"+500k refactor this"` — the budget comes first
- **End-anchored:** `"refactor this +500k"` — the budget comes last
- **Verbose:** `"spend 2M tokens on this refactor"` — natural language

The anchoring matters for avoiding false positives. Without anchoring, `"+5k"` could match inside a string like "they raised +5k in funding" that happens to appear in a commit message or code comment. The start regex requires leading whitespace or beginning-of-string; the end regex requires trailing whitespace, punctuation, or end-of-string.

A performance note hidden in the source (`tokenBudget.ts:6`): lookbehind `(?<=\s)` is deliberately avoided because it defeats the YARR JIT compiler in JavaScriptCore (Bun's runtime). The interpreter path scans O(n) of the input even with a `$` anchor. Instead, the regex captures the leading whitespace and callers offset by 1. This is the kind of runtime-specific optimization you encounter when your agent runs on Bun rather than Node.

### Position Tracking for the UI

```typescript
// utils/tokenBudget.ts:31-63
export function findTokenBudgetPositions(
  text: string,
): Array<{ start: number; end: number }> {
  // Returns byte positions of all budget tokens in the text
  // Used by the UI to highlight/remove budget notation
}
```

The UI needs to strip the `+500k` notation from the displayed prompt while preserving the rest. `findTokenBudgetPositions` returns start/end byte offsets so the rendering layer can excise the budget tokens without a second regex pass.

### Continuation Message Formatting

When the budget system decides to continue, it injects a nudge message:

```typescript
// utils/tokenBudget.ts:66-73
export function getBudgetContinuationMessage(
  pct: number,
  turnTokens: number,
  budget: number,
): string {
  const fmt = (n: number): string =>
    new Intl.NumberFormat('en-US').format(n)
  return `Stopped at ${pct}% of token target (${fmt(turnTokens)} / ${fmt(budget)}). Keep working — do not summarize.`
}
```

The "do not summarize" instruction is deliberate. Without it, the model tends to wrap up with a summary paragraph on continuation, wasting budget on meta-commentary instead of productive work. The explicit instruction keeps the model focused on the task.

---

## The Budget Decision Engine

Parsing the budget is the easy part. The hard part is deciding when to continue and when to stop. The decision engine at `query/tokenBudget.ts` (93 lines) manages this with a state tracker and three exit conditions.

### The BudgetTracker State

```typescript
// query/tokenBudget.ts:3-11
const COMPLETION_THRESHOLD = 0.9
const DIMINISHING_THRESHOLD = 500

export type BudgetTracker = {
  continuationCount: number
  lastDeltaTokens: number
  lastGlobalTurnTokens: number
  startedAt: number
}
```

Four fields track the budget lifecycle. `continuationCount` is the number of times the engine has decided to continue past a natural stopping point. `lastDeltaTokens` records how many tokens the model produced in the previous continuation round. `lastGlobalTurnTokens` anchors the previous checkpoint for computing deltas. `startedAt` records the wall-clock time for duration reporting.

### The Decision Algorithm

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
  const deltaSinceLastCheck =
    globalTurnTokens - tracker.lastGlobalTurnTokens

  const isDiminishing =
    tracker.continuationCount >= 3 &&
    deltaSinceLastCheck < DIMINISHING_THRESHOLD &&
    tracker.lastDeltaTokens < DIMINISHING_THRESHOLD

  if (!isDiminishing && turnTokens < budget * COMPLETION_THRESHOLD) {
    tracker.continuationCount++
    tracker.lastDeltaTokens = deltaSinceLastCheck
    tracker.lastGlobalTurnTokens = globalTurnTokens
    return {
      action: 'continue',
      nudgeMessage: getBudgetContinuationMessage(
        pct, turnTokens, budget,
      ),
      continuationCount: tracker.continuationCount,
      pct, turnTokens, budget,
    }
  }

  if (isDiminishing || tracker.continuationCount > 0) {
    return {
      action: 'stop',
      completionEvent: {
        continuationCount: tracker.continuationCount,
        pct, turnTokens, budget,
        diminishingReturns: isDiminishing,
        durationMs: Date.now() - tracker.startedAt,
      },
    }
  }

  return { action: 'stop', completionEvent: null }
}
```

Three exit conditions, in evaluation order:

**1. Under 90% and not diminishing -- continue.** The model has budget remaining and is making progress. Inject the nudge message (the "keep working" text from above) and let the query loop submit another turn. The 90% threshold (not 100%) exists because the model needs headroom to produce a coherent closing response. Cutting off at exactly 100% truncates mid-thought.

**2. Diminishing returns -- stop early.** Three or more continuations have occurred, and both the current and previous deltas are under 500 tokens. This catches the degenerate case where the model produces tiny 50-token responses forever, each triggering a continuation. Without this circuit breaker, a model stuck in a "let me think about this..." loop would burn budget indefinitely. The `diminishingReturns: true` flag in the completion event lets telemetry track how often this occurs.

**3. At or above 90% -- stop naturally.** The budget is substantially consumed. Let the model complete its current response without injecting a continuation.

The first guard in the function — `if (agentId || budget === null || budget <= 0)` — prevents subagents from inheriting the parent's budget. Budget continuation is a user-facing feature; subagents spawned by the `AgentTool` should complete their delegated task and return, not auto-continue.

### Decision Types

The return type is a discriminated union:

```typescript
// query/tokenBudget.ts:22-43
type ContinueDecision = {
  action: 'continue'
  nudgeMessage: string
  continuationCount: number
  pct: number
  turnTokens: number
  budget: number
}

type StopDecision = {
  action: 'stop'
  completionEvent: {
    continuationCount: number
    pct: number
    turnTokens: number
    budget: number
    diminishingReturns: boolean
    durationMs: number
  } | null
}
```

The `completionEvent` is null when there was never a budget in the first place (no `+500k` in the prompt). It is non-null when the budget was active and the engine decided to stop. This distinction matters for telemetry: you want to log budget completion events, but not log a "budget completed" event for prompts that never had a budget.

---

## task_budget — API-Side Budget Awareness

The client-side budget system described above has a limitation: *the model does not know it exists.* The model produces a full response, hits its stop reason, and the client decides whether to continue. This means the model cannot pace itself — it cannot produce a shorter response because the budget is running low.

The `task_budget` API parameter solves this. It is sent in the request body so the model sees the total budget and the remaining balance, and can self-pace.

### The Wire Format

```typescript
// services/api/claude.ts:468-477
type TaskBudgetParam = {
  type: 'tokens'
  total: number
  remaining?: number
}

export function configureTaskBudgetParams(
  taskBudget: Options['taskBudget'],
  outputConfig: BetaOutputConfig & { task_budget?: TaskBudgetParam },
  betas: string[],
): void {
  if (!taskBudget || 'task_budget' in outputConfig ||
      !shouldIncludeFirstPartyOnlyBetas()) {
    return
  }
  outputConfig.task_budget = {
    type: 'tokens',
    total: taskBudget.total,
    ...(taskBudget.remaining !== undefined && {
      remaining: taskBudget.remaining,
    }),
  }
  if (!betas.includes(TASK_BUDGETS_BETA_HEADER)) {
    betas.push(TASK_BUDGETS_BETA_HEADER)
  }
}
```

The guard `'task_budget' in outputConfig` prevents double-setting — if something upstream already configured it, the function is a no-op. The `shouldIncludeFirstPartyOnlyBetas()` check restricts this to first-party API access; third-party Bedrock/Vertex users do not get the beta.

### Two Budget Systems, Two Purposes

The comment at `services/api/claude.ts:702-706` makes the distinction explicit:

```typescript
// API-side task budget (output_config.task_budget). Distinct from the
// tokenBudget.ts +500k auto-continue feature — this one is sent to the API
// so the model can pace itself. `remaining` is computed by the caller
// (query.ts decrements across the agentic loop).
taskBudget?: { total: number; remaining?: number }
```

| Feature | Client-side `tokenBudget` | Server-side `task_budget` |
|---------|--------------------------|---------------------------|
| Triggered by | User typing `+500k` | Same, but passed to API |
| Who decides | Query loop (`checkTokenBudget`) | The model itself |
| Model awareness | None — model does not see it | Full — model sees total + remaining |
| Mechanism | Auto-continue with nudge message | Model self-paces response length |
| Compaction handling | N/A | `remaining` decremented after compact |

They work in concert. The client-side system decides *whether* to continue the loop. The server-side system tells the model *how much budget is left* so it can allocate its response accordingly.

### Tracking remaining Across Compaction

Compaction (Chapter 6) replaces the full conversation history with a summary. After compaction, the server can no longer see the original messages — it would under-count the tokens spent because the summary is shorter than the original. The `remaining` field bridges this gap:

```typescript
// query.ts:291 (loop-local variable)
let taskBudgetRemaining: number | undefined = undefined

// query.ts:508-515 (after compaction)
if (params.taskBudget) {
  const preCompactContext =
    finalContextTokensFromLastResponse(messagesForQuery)
  taskBudgetRemaining = Math.max(
    0,
    (taskBudgetRemaining ?? params.taskBudget.total) - preCompactContext,
  )
}
```

The `finalContextTokensFromLastResponse` function (`utils/tokens.ts:79-112`) extracts the last response's total context size. When the API uses server-side tool loops (the `iterations` array), it returns the last iteration's token count — the actual final context window. This is the number that gets subtracted from the remaining budget.

The `Math.max(0, ...)` prevents negative remaining values. If the pre-compact context exceeds the remaining budget (the user already overspent), remaining clamps to zero rather than going negative.

---

## Cache Economics — Why Tokens Are Not Created Equal

Not all tokens cost the same. The Anthropic API distinguishes five token categories in its usage reporting, and understanding their pricing is essential for building an economical agent.

### The Usage Shape

```typescript
// services/api/emptyUsage.ts:8-22
export const EMPTY_USAGE: Readonly<NonNullableUsage> = {
  input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 0,
  server_tool_use: {
    web_search_requests: 0,
    web_fetch_requests: 0,
  },
  service_tier: 'standard',
  cache_creation: {
    ephemeral_1h_input_tokens: 0,
    ephemeral_5m_input_tokens: 0,
  },
  inference_geo: '',
  iterations: [],
  speed: 'standard',
}
```

Five categories that affect cost:

1. **`input_tokens`** — Fresh input tokens, not cached. Charged at the base input rate.
2. **`cache_creation_input_tokens`** — Tokens written into the prompt cache. Charged at 1.25x the input rate (you pay a premium to populate the cache).
3. **`cache_read_input_tokens`** — Tokens read from the prompt cache. Charged at 0.1x the input rate (10x cheaper than fresh input).
4. **`output_tokens`** — Model-generated tokens. Always the most expensive per-token.
5. **`cache_creation.ephemeral_*`** — Fine-grained breakdown by TTL (5-minute vs 1-hour).

### Pricing by Model Tier

```typescript
// utils/modelCost.ts:36-88
// Sonnet: $3 input / $15 output per Mtok
export const COST_TIER_3_15 = {
  inputTokens: 3,
  outputTokens: 15,
  promptCacheWriteTokens: 3.75,   // 1.25x
  promptCacheReadTokens: 0.3,     // 0.1x
} as const satisfies ModelCosts

// Opus 4.6 standard: $5 input / $25 output per Mtok
export const COST_TIER_5_25 = {
  inputTokens: 5,
  outputTokens: 25,
  promptCacheWriteTokens: 6.25,
  promptCacheReadTokens: 0.5,
} as const satisfies ModelCosts

// Opus 4.6 fast: $30 input / $150 output per Mtok
export const COST_TIER_30_150 = {
  inputTokens: 30,
  outputTokens: 150,
  promptCacheWriteTokens: 37.5,
  promptCacheReadTokens: 3,
} as const satisfies ModelCosts
```

### The Cache Multiplier Effect

For a typical Claude Code session with 200K context:

| Scenario | Sonnet ($3/Mtok) | Opus 4.6 ($5/Mtok) |
|----------|-----------------|---------------------|
| 200K fresh input | $0.60 | $1.00 |
| 200K cache read | $0.06 | $0.10 |
| **Savings** | **90%** | **90%** |

Cache reads are 10x cheaper than fresh input across every model tier. The system prompt (~5K tokens), tool definitions (~15K tokens), and early conversation history (~30K tokens) are largely identical across turns. In a well-warmed session, 80-90% of input tokens are cache reads. This is why Chapter 5 dedicates so much engineering to cache key stability — a single cache bust on a 50K-token prefix costs 10x what a cache hit would cost.

### Cost Calculation

```typescript
// utils/modelCost.ts:131-142
function tokensToUSDCost(
  modelCosts: ModelCosts,
  usage: Usage,
): number {
  return (
    (usage.input_tokens / 1_000_000) * modelCosts.inputTokens +
    (usage.output_tokens / 1_000_000) * modelCosts.outputTokens +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) *
      modelCosts.promptCacheReadTokens +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) *
      modelCosts.promptCacheWriteTokens +
    (usage.server_tool_use?.web_search_requests ?? 0) *
      modelCosts.webSearchRequests
  )
}
```

Prices are in dollars per million tokens. The `?? 0` fallback on cache fields handles older API responses that may not include them.

---

## Streaming Usage Tracking — The Cumulative Protocol

The Anthropic streaming API provides **cumulative** usage totals in each event, not deltas. This seems straightforward but creates a subtle trap.

### The Overwrite Guard

```typescript
// services/api/claude.ts:2914-2946
export function updateUsage(
  usage: Readonly<NonNullableUsage>,
  partUsage: BetaMessageDeltaUsage | undefined,
): NonNullableUsage {
  if (!partUsage) return { ...usage }
  return {
    input_tokens:
      partUsage.input_tokens !== null && partUsage.input_tokens > 0
        ? partUsage.input_tokens
        : usage.input_tokens,
    cache_creation_input_tokens:
      partUsage.cache_creation_input_tokens !== null &&
      partUsage.cache_creation_input_tokens > 0
        ? partUsage.cache_creation_input_tokens
        : usage.cache_creation_input_tokens,
    cache_read_input_tokens:
      partUsage.cache_read_input_tokens !== null &&
      partUsage.cache_read_input_tokens > 0
        ? partUsage.cache_read_input_tokens
        : usage.cache_read_input_tokens,
    output_tokens:
      partUsage.output_tokens ?? usage.output_tokens,
    // ... server_tool_use, etc.
  }
}
```

The trap: `message_delta` events may include explicit `0` values for `cache_read_input_tokens`. A naive implementation would overwrite the real value (set in `message_start`) with zero. The guard `!== null && > 0` prevents this — it only accepts positive values, preserving the previous count otherwise.

This is documented at `claude.ts:2914-2916`:

> Anthropic's streaming API provides CUMULATIVE usage totals, not deltas. Input-related tokens are typically set in message_start and remain constant. message_delta events may send explicit 0 values for these fields, which should not overwrite the values from message_start.

Without this guard, the final usage would show `cache_read_input_tokens: 0`, making cost tracking incorrect and cache break detection impossible.

### Cross-Turn Accumulation

Within a single stream, usage is cumulative. Across turns, it must be summed:

```typescript
// services/api/claude.ts:2993-3008
export function accumulateUsage(
  totalUsage: Readonly<NonNullableUsage>,
  messageUsage: Readonly<NonNullableUsage>,
): NonNullableUsage {
  return {
    input_tokens:
      totalUsage.input_tokens + messageUsage.input_tokens,
    cache_creation_input_tokens:
      totalUsage.cache_creation_input_tokens +
      messageUsage.cache_creation_input_tokens,
    cache_read_input_tokens:
      totalUsage.cache_read_input_tokens +
      messageUsage.cache_read_input_tokens,
    output_tokens:
      totalUsage.output_tokens + messageUsage.output_tokens,
    server_tool_use: {
      web_search_requests:
        totalUsage.server_tool_use.web_search_requests +
        messageUsage.server_tool_use.web_search_requests,
    },
    // ...
  }
}
```

Every field is a simple sum. The session-level total grows monotonically. This feeds both the cost tracker and the `/cost` command.

---

## Session Cost Tracking

### Per-Model Usage Accumulation

```typescript
// cost-tracker.ts:250-276
function addToTotalModelUsage(
  cost: number,
  usage: Usage,
  model: string,
): ModelUsage {
  const modelUsage = getUsageForModel(model) ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    costUSD: 0,
    contextWindow: 0,
    maxOutputTokens: 0,
  }
  modelUsage.inputTokens += usage.input_tokens
  modelUsage.outputTokens += usage.output_tokens
  modelUsage.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0
  modelUsage.cacheCreationInputTokens +=
    usage.cache_creation_input_tokens ?? 0
  modelUsage.costUSD += cost
  return modelUsage
}
```

Costs are tracked per-model because a single session may use multiple models — Opus for the main loop, Sonnet for subagents, Haiku for classifiers. The `/cost` command shows a per-model breakdown so users can see where their spend is going.

### OpenTelemetry Integration

```typescript
// cost-tracker.ts:291-301
getCostCounter()?.add(cost, attrs)
getTokenCounter()?.add(usage.input_tokens,
  { ...attrs, type: 'input' })
getTokenCounter()?.add(usage.output_tokens,
  { ...attrs, type: 'output' })
getTokenCounter()?.add(usage.cache_read_input_tokens ?? 0,
  { ...attrs, type: 'cacheRead' })
getTokenCounter()?.add(usage.cache_creation_input_tokens ?? 0,
  { ...attrs, type: 'cacheCreation' })
```

Cost and token counters feed OpenTelemetry metrics for monitoring, alerting, and billing dashboards. The `?.` optional chaining handles the case where OTel is not configured (e.g., local development without a metrics backend).

### Advisor (Sub-Model) Cost Tracking

```typescript
// cost-tracker.ts:303-321
for (const advisorUsage of getAdvisorUsage(usage)) {
  const advisorCost = calculateUSDCost(
    advisorUsage.model, advisorUsage,
  )
  totalCost += addToTotalSessionCost(
    advisorCost, advisorUsage, advisorUsage.model,
  )
}
```

When the primary model delegates to an "advisor" sub-model (for tool search routing, thinking classifiers, etc.), the advisor's usage is nested in the response. The cost tracker extracts it, computes cost at the advisor's pricing tier, and adds it to the session total. This is recursive — `addToTotalSessionCost` handles nested advisors.

### Session Persistence

```typescript
// cost-tracker.ts:143-175
export function saveCurrentSessionCosts(
  fpsMetrics?: FpsMetrics,
): void {
  saveCurrentProjectConfig(current => ({
    ...current,
    lastCost: getTotalCostUSD(),
    lastAPIDuration: getTotalAPIDuration(),
    lastModelUsage: Object.fromEntries(
      Object.entries(getModelUsage()).map(([model, usage]) => [
        model,
        {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadInputTokens: usage.cacheReadInputTokens,
          cacheCreationInputTokens: usage.cacheCreationInputTokens,
          costUSD: usage.costUSD,
        },
      ]),
    ),
    lastSessionId: getSessionId(),
  }))
}
```

Costs persist to `.claude/projects/<path>/config.json`. When a session resumes (same session ID), the `/cost` command can show cumulative spend across restarts. This is important for long-running sessions that get interrupted — the user should see total cost, not just "cost since last restart."

---

## Auto-Compaction Thresholds

The token estimation system exists primarily to feed the auto-compaction engine from Chapter 6. Here is how the thresholds are computed.

### Buffer Constants

```typescript
// services/compact/autoCompact.ts:62-65
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000
```

### Threshold Calculation

For a 200K context window:

```
Context Window:     200,000 tokens
- Output Reserved:   20,000  (compact summary p99.99 = 17,387 tokens)
= Effective Window: 180,000
                         |
Warning Threshold:  147,000  (effective - 20K - 13K)     ~73.5%
                         |
Auto-Compact:       167,000  (effective - 13K)            ~83.5%
                         |
Blocking Limit:     177,000  (effective - 3K)             ~88.5%
```

```typescript
// services/compact/autoCompact.ts:33-48
export function getEffectiveContextWindowSize(model: string): number {
  const reservedTokensForSummary = Math.min(
    getMaxOutputTokensForModel(model),
    MAX_OUTPUT_TOKENS_FOR_SUMMARY,   // 20,000
  )
  let contextWindow = getContextWindowForModel(model, getSdkBetas())
  return contextWindow - reservedTokensForSummary
}

// services/compact/autoCompact.ts:72-91
export function getAutoCompactThreshold(model: string): number {
  const effectiveContextWindow = getEffectiveContextWindowSize(model)
  return effectiveContextWindow - AUTOCOMPACT_BUFFER_TOKENS
}
```

The 20K output reservation covers the compaction summary itself. The p99.99 of summary output is 17,387 tokens — reserving 20K leaves headroom for exceptionally verbose summaries. The 13K auto-compact buffer is tuned so compaction fires before the blocking limit but not so aggressively that every large tool result triggers it.

### The Token Warning State Machine

```typescript
// services/compact/autoCompact.ts:93-145
export function calculateTokenWarningState(
  tokenUsage: number,
  model: string,
): {
  percentLeft: number
  isAboveWarningThreshold: boolean
  isAboveErrorThreshold: boolean
  isAboveAutoCompactThreshold: boolean
  isAtBlockingLimit: boolean
}
```

This feeds the status bar indicator that shows context fullness. Four zones:

| Zone | Threshold | User Sees | System Action |
|------|-----------|-----------|---------------|
| Normal | < 73.5% | Green indicator | None |
| Warning | 73.5% - 83.5% | Yellow indicator | None |
| Error | 83.5% - 88.5% | Red indicator | Auto-compact fires |
| Blocking | > 88.5% | Red + "Context full" | API calls blocked |

The blocking limit exists as a hard stop. If auto-compact fails (and it can — see the circuit breaker below), the system must prevent sending a request that would 413. Better to block the user with a clear message than to waste an API call that will definitely fail.

### Circuit Breaker for Consecutive Failures

```typescript
// services/compact/autoCompact.ts:68-70
// BQ 2026-03-10: 1,279 sessions had 50+ consecutive failures
// (up to 3,272) in a single session, wasting ~250K API calls/day.
const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3
```

Before this circuit breaker, sessions with irrecoverably long context — typically caused by a single massive tool result that exceeded the compaction window — would retry compaction on every turn, failing every time. The worst offender retried 3,272 times in a single session. Across all affected sessions, this wasted approximately 250,000 API calls per day globally.

The fix is a 3-strike circuit breaker. After 3 consecutive compaction failures, auto-compact disables itself for the session. The user sees the blocking limit message and must manually run `/compact` or `/clear`.

---

## The Full Architecture

Here is how all the token management components connect in a single query turn:

```
User Prompt: "refactor this +500k"
     |
     +-- parseTokenBudget("+500k") --> 500,000
     |
     v
QueryEngine.submitMessage()
     |
     +-- query({ ..., taskBudget: { total: 500000 } })
              |
              +-- while(true) loop
              |     |
              |     +-- tokenCountWithEstimation(messages)
              |     |     +-- Find last assistant with usage -----+
              |     |     +-- Walk back for parallel tool splits   |
              |     |     +-- getTokenCountFromUsage(usage) ----- |-- exact
              |     |     +-- + roughEstimation(msgs[i+1:])       |-- delta
              |     |                                             |
              |     +-- calculateTokenWarningState()              |
              |     |     +-- > autoCompactThreshold? --> compact  |
              |     |     +-- > blockingLimit? --> return          |
              |     |                                             |
              |     +-- deps.callModel({                          |
              |     |     maxOutputTokens: 8_000 (capped),        |
              |     |     taskBudget: { total, remaining },       |
              |     |   })                                        |
              |     |     |                                       |
              |     |     +-- Stream: updateUsage(cumulative) ----+
              |     |     +-- message_start: set input, cache tokens
              |     |     +-- message_delta: increment output_tokens
              |     |
              |     +-- [max_output_tokens hit?]
              |     |     +-- Phase 1: escalate 8K --> 64K, retry
              |     |     +-- Phase 2: inject "resume", up to 3x
              |     |     +-- Phase 3: surface error
              |     |
              |     +-- Tool execution --> collect results
              |     |
              |     +-- checkTokenBudget(tracker, budget=500k)
              |     |     +-- under 90% + not diminishing --> continue
              |     |     +-- diminishing (3x < 500 tokens) --> stop
              |     |     +-- at/above 90% --> stop
              |     |
              |     +-- state = { messages: [...prev, ...asst, ...tools] }
              |
              +-- addToTotalSessionCost(cost, usage, model)
                    +-- tokensToUSDCost(pricing, usage)
                    |     +-- input   x $X/Mtok
                    |     +-- output  x $Y/Mtok
                    |     +-- cache_read  x $0.1X/Mtok   (10x cheaper)
                    |     +-- cache_write x $1.25X/Mtok
                    +-- OTel: costCounter.add(), tokenCounter.add()
                    +-- saveCurrentSessionCosts() --> project config
```

---

## Design Lessons

Building the token estimation and budget system for a production CLI agent, the Claude Code approach teaches seven principles:

**1. Layer your estimation with graceful degradation.** API count (exact) falls back to API count + rough delta (common case), which falls back to pure rough estimation (always available). The system never fails to produce a number. Every function that could fail returns `null`, not an exception. Every caller handles `null` by falling back one layer.

**2. Overestimate conservatively.** Images at 2,000 tokens instead of computing dimensions. JSON at 2 bytes/token instead of 4. The philosophy: overestimating triggers protective action (compaction) early, while underestimating causes context overflow (unrecoverable 413 error). When in doubt, err toward safety.

**3. Optimize slot reservation for the common case.** The 8K default with escalation to 64K saves 4-8x GPU slot capacity while adding only one retry per 100 requests. Measure your actual output distribution (p99 = 4,911 tokens for Claude Code), then set the default below p99 and handle the tail with a retry.

**4. Separate client-side control from server-side awareness.** The client-side budget continuation (`+500k`) decides *whether* to keep the loop running. The server-side `task_budget` tells the model *how much budget remains* so it can self-pace. They are complementary, not redundant.

**5. Guard against the cumulative streaming protocol.** Streaming usage is cumulative, not delta. But delta events can send explicit zeros for fields set in `message_start`. The `!== null && > 0` guard before overwriting is not paranoia — it prevents zeroing out your cache hit metrics, breaking both cost tracking and cache break detection.

**6. Circuit-break runaway loops.** Auto-compaction with a 3-failure limit (previously: 3,272 consecutive failures, 250K wasted API calls/day). Diminishing returns detection after 3 rounds with <500 tokens each. Both prevent degenerate infinite loops that burn budget without progress.

**7. Track cost per model, persist across restarts.** A session may use Opus, Sonnet, and Haiku simultaneously. Per-model cost tracking with session persistence lets users see exactly where their spend goes and maintain continuity across session restarts.

In Chapter 8, we turn from tokens and budgets to the tool system itself — the 52-tool registry, the `Tool` interface, feature-gated conditional imports, and the architecture that lets Claude Code's capabilities grow without growing its bundle size.
