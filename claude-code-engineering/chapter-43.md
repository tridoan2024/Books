# Chapter 43: Testing Infrastructure

You can build the most elegant query loop, the most sophisticated permission system, and the most carefully optimized prompt cache — but if you can't test it deterministically, you can't ship it with confidence. AI agent testing is uniquely challenging because your primary dependency — a large language model — is non-deterministic, expensive, rate-limited, and evolves underneath you with every model update. A single integration test that makes a real API call costs real money, takes seconds, and might return a different response every time.

This chapter covers how to build a testing infrastructure that solves these problems. We'll implement a VCR (Video Cassette Recorder) system that records API interactions and replays them deterministically, a mock rate limiter that simulates throttling without hitting real APIs, a feature flag override system that lets tests exercise code paths gated behind runtime flags, and a state reset utility that ensures clean isolation between tests. Then we'll tackle the harder problems: how to test permission evaluation without a real user, how to test tool execution without a real filesystem, and how to structure integration tests that exercise the full query loop while keeping your test suite under 60 seconds.

---

## 43.1 The Testing Challenge for AI Agents

Traditional software testing follows predictable patterns: given input X, assert output Y. AI agents break this contract at every level.

### Why AI Agents Are Hard to Test

**Non-deterministic outputs.** Even with `temperature: 0`, model responses can vary across deployments, model versions, and even request timing. You can't `assert_eq!(response, "expected string")` because the model might rephrase its answer between Tuesday and Wednesday.

**Expensive API calls.** Every test run that hits the real API costs tokens. A comprehensive test suite with 200 tests, each making 2-3 API calls, burns through 400-600 API calls per run. At ~$0.03 per call with prompt caching, that's $12-18 per test run. Run tests 10 times a day during development, and you're looking at $120-180/day in test costs.

**Rate limits.** The API enforces rate limits on requests per minute, input tokens per minute, and output tokens per minute. A test suite that fires 200 parallel requests will hit rate limits immediately, causing cascading failures that have nothing to do with code correctness.

**Streaming responses.** The agent consumes SSE (Server-Sent Events) streams, not simple request/response pairs. Recording and replaying streams requires capturing the exact sequence of events, including timing-sensitive events like `content_block_delta` and `message_stop`.

**Stateful conversations.** A multi-turn conversation has state that accumulates across turns. Testing turn 5 requires setting up turns 1-4, which means either recording entire conversation flows or building sophisticated fixtures.

**Tool execution side effects.** When the model calls `Bash("rm -rf node_modules")`, a real tool execution modifies the filesystem. Tests need to either sandbox these side effects or mock the tool execution layer.

### The Testing Pyramid for AI Agents

The standard testing pyramid — unit tests at the base, integration tests in the middle, end-to-end tests at the top — needs adaptation for AI agents:

```
         /\
        /  \  E2E: Full agent conversations (VCR-recorded)
       /    \  ~20 tests, slowest, most realistic
      /------\
     /        \  Integration: Query loop + tools (mocked API)
    /          \  ~100 tests, moderate speed
   /------------\
  /              \  Unit: Individual functions (no API)
 /                \  ~500 tests, fastest, most numerous
/------------------\
```

**Unit tests** cover individual functions: token estimation, permission matching, Bash AST parsing, settings merge logic, glob pattern matching. These never touch the API and run in milliseconds.

**Integration tests** exercise the query loop with pre-recorded API responses. They test the full flow from user input through prompt construction, API call, response parsing, tool execution, and result formatting — but the API call itself is replayed from a cassette.

**End-to-end tests** run the full agent in a controlled environment, making real API calls that are recorded on first run and replayed thereafter. These are the most realistic but also the most fragile when model behavior changes.

---

## 43.2 The VCR System — Recording and Replaying API Calls

The VCR (Video Cassette Recorder) pattern, popularized by Ruby's VCR gem, is the backbone of our testing strategy. The idea is simple: record real API interactions to files called "cassettes," then replay those cassettes during test runs so tests are fast, deterministic, and free.

### Core Data Model

A cassette is a collection of recorded request/response interactions:

```typescript
interface Cassette {
  name: string;
  recorded_at: string;          // ISO 8601 timestamp
  interactions: Interaction[];
  metadata: CassetteMetadata;
}

interface Interaction {
  request: RecordedRequest;
  response: RecordedResponse;
  timestamp: string;
  duration_ms: number;
}

interface RecordedRequest {
  method: string;               // "POST"
  url: string;                  // "https://api.anthropic.com/v1/messages"
  headers: Record<string, string>;
  body_hash: string;            // SHA-256 of request body
  body?: string;                // Full body (omitted for large requests)
}

interface RecordedResponse {
  status: number;               // 200
  headers: Record<string, string>;
  body: string;                 // Full response body
  body_hash: string;            // SHA-256 for integrity checks
}

interface CassetteMetadata {
  agent_version: string;        // Version that recorded this cassette
  record_mode: VcrMode;         // How it was recorded
  tags: string[];               // Test categorization
}
```

The `body_hash` field is critical. Instead of comparing full request bodies — which can be 100KB+ for prompt-heavy API calls — we compare SHA-256 hashes. This is faster, uses less memory in the cassette file, and avoids false mismatches from whitespace or key ordering differences.

```typescript
function computeHash(data: string): string {
  const hasher = createHash('sha256');
  hasher.update(data);
  return hasher.digest('hex');
}
```

### Operating Modes

The VCR supports four modes, each appropriate for different phases of development:

```typescript
enum VcrMode {
  Record,       // Intercept real requests, save to cassette
  Replay,       // Match requests against cassette, return recorded responses
  Passthrough,  // Forward all requests to real API (no recording)
  Auto,         // Record if no cassette exists, replay if one does
}
```

| Mode | When to Use | Real API Calls? | Saves Cassette? |
|------|-------------|-----------------|-----------------|
| `Record` | Creating new test fixtures | Yes | Yes |
| `Replay` | Normal test runs, CI/CD | No | No |
| `Passthrough` | Debugging, manual testing | Yes | No |
| `Auto` | First run records, subsequent runs replay | First time only | On first run |

**`Auto` is the default for development.** When you write a new test, the first run hits the real API and records a cassette. Every subsequent run replays from the cassette. This means writing a new test is as simple as writing the test code and running it once — no manual cassette management required.

### Recording Pipeline

The recording pipeline intercepts HTTP requests at the client layer, before they reach the network:

```typescript
class VcrInterceptor {
  private activeCassette: Cassette | null = null;
  private mode: VcrMode = VcrMode.Passthrough;
  
  startRecording(cassetteName: string): void {
    this.activeCassette = {
      name: cassetteName,
      recorded_at: new Date().toISOString(),
      interactions: [],
      metadata: {
        agent_version: VERSION,
        record_mode: VcrMode.Record,
        tags: [],
      },
    };
    this.mode = VcrMode.Record;
  }
  
  stopRecording(): Cassette {
    if (!this.activeCassette) throw new VcrError('no active cassette');
    if (this.mode !== VcrMode.Record) {
      throw new VcrError(`wrong mode: expected record, got ${this.mode}`);
    }
    
    const cassette = this.activeCassette;
    this.activeCassette = null;
    this.mode = VcrMode.Passthrough;
    return cassette;
  }
  
  async intercept(request: HttpRequest): Promise<HttpResponse> {
    switch (this.mode) {
      case VcrMode.Record:
        return this.recordRequest(request);
      case VcrMode.Replay:
        return this.replayRequest(request);
      case VcrMode.Passthrough:
        return this.forward(request);
      case VcrMode.Auto:
        return this.autoMode(request);
    }
  }
  
  private async recordRequest(request: HttpRequest): Promise<HttpResponse> {
    const startTime = Date.now();
    const response = await this.forward(request);
    const duration = Date.now() - startTime;
    
    this.activeCassette!.interactions.push({
      request: this.recordRequest(request),
      response: this.recordResponse(response),
      timestamp: new Date().toISOString(),
      duration_ms: duration,
    });
    
    return response;
  }
}
```

The interceptor sits between the API client and the HTTP library. In production, `this.forward()` calls the real `fetch()`. In testing, the VCR intercepts and either records or replays.

### Request Matching

When replaying a cassette, we need to match incoming requests to recorded interactions. This is non-trivial because request bodies may differ slightly between test runs (timestamps, random IDs, etc.).

The system uses a trait-based matching strategy with multiple matchers tried in order:

```typescript
interface RequestMatcher {
  name(): string;
  matches(recorded: RecordedRequest, incoming: HttpRequest): boolean;
}

// Strategy 1: Exact match (method + URL + body hash)
class ExactMatcher implements RequestMatcher {
  name() { return 'exact'; }
  
  matches(recorded: RecordedRequest, incoming: HttpRequest): boolean {
    if (recorded.method !== incoming.method) return false;
    if (recorded.url !== incoming.url) return false;
    
    const incomingHash = computeHash(incoming.body ?? '');
    return recorded.body_hash === incomingHash;
  }
}

// Strategy 2: URL match (method + URL, ignore body)
class UrlMatcher implements RequestMatcher {
  name() { return 'url'; }
  
  matches(recorded: RecordedRequest, incoming: HttpRequest): boolean {
    return recorded.method === incoming.method 
        && recorded.url === incoming.url;
  }
}

// Strategy 3: Body hash match (method + URL + body hash, ignore headers)
class BodyHashMatcher implements RequestMatcher {
  name() { return 'body_hash'; }
  
  matches(recorded: RecordedRequest, incoming: HttpRequest): boolean {
    if (recorded.method !== incoming.method) return false;
    if (recorded.url !== incoming.url) return false;
    const incomingHash = computeHash(incoming.body ?? '');
    return recorded.body_hash === incomingHash;
  }
}

// Strategy 4: Header match (method + URL + specific headers)
class HeaderMatcher implements RequestMatcher {
  private requiredHeaders: string[];
  
  constructor(headers: string[]) {
    this.requiredHeaders = headers.map(h => h.toLowerCase());
  }
  
  name() { return 'header'; }
  
  matches(recorded: RecordedRequest, incoming: HttpRequest): boolean {
    if (recorded.method !== incoming.method) return false;
    if (recorded.url !== incoming.url) return false;
    
    for (const key of this.requiredHeaders) {
      if (recorded.headers[key] !== incoming.headers[key]) return false;
    }
    return true;
  }
}
```

The replay function tries matchers in order of specificity:

```typescript
function replayRequest(
  request: HttpRequest, 
  cassette: Cassette
): RecordedResponse | null {
  // Try exact match first
  for (const interaction of cassette.interactions) {
    if (new ExactMatcher().matches(interaction.request, request)) {
      return interaction.response;
    }
  }
  
  // Fall back to URL match
  for (const interaction of cassette.interactions) {
    if (new UrlMatcher().matches(interaction.request, request)) {
      return interaction.response;
    }
  }
  
  return null; // No match — test will fail
}
```

### Fuzzy Match Scoring

For debugging unmatched requests, the system provides a scoring mechanism that explains *why* a request didn't match:

```typescript
enum MatchScore {
  Exact,                 // 100 points — perfect match
  Fuzzy(score: number),  // 0-99 points — partial match
  NoMatch,               // 0 points — nothing matched
}

function matchRequest(req: HttpRequest, recorded: RecordedRequest): MatchScore {
  let score = 0;
  let maxScore = 0;
  
  // Method match: 30 points
  maxScore += 30;
  if (req.method === recorded.method) score += 30;
  
  // URL match: 40 points (20 for path-only match)
  maxScore += 40;
  if (req.url === recorded.url) {
    score += 40;
  } else if (urlsSharePath(req.url, recorded.url)) {
    score += 20; // Same path, different query string
  }
  
  // Body hash match: 20 points
  maxScore += 20;
  const reqHash = computeHash(req.body ?? '');
  if (reqHash === recorded.body_hash) score += 20;
  
  // Header overlap: 10 points
  maxScore += 10;
  const overlap = headerOverlap(req.headers, recorded.headers);
  score += Math.round(overlap * 10);
  
  if (score === maxScore) return MatchScore.Exact;
  if (score === 0) return MatchScore.NoMatch;
  return MatchScore.Fuzzy(Math.round(score / maxScore * 100));
}
```

When a test fails because a cassette doesn't match, the scoring system shows what *almost* matched:

```
VCR replay: no exact match for POST /v1/messages
  Best candidate: fuzzy(80)
    ✓ method: POST
    ✓ url: /v1/messages  
    ✗ body_hash: expected abc123, got def456
    ✓ headers: 8/10 overlap
  Hint: request body changed. Re-record cassette with VCR_MODE=record
```

This diagnostic output saves hours of debugging. Without it, you'd stare at a "no match" error with no idea why.

---

## 43.3 Cassette Sanitization — Keeping Secrets Out of Source Control

Cassettes are checked into source control alongside the test code. This is essential — cassettes are test fixtures, and they need to be versioned, reviewed, and shared. But recorded API interactions contain sensitive data: API keys, session tokens, authorization headers.

The sanitization pipeline runs before a cassette is saved:

```typescript
const SENSITIVE_HEADERS: string[] = [
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
  'x-auth-token',
  'x-session-id',
];

const SENSITIVE_BODY_PATTERNS: string[] = [
  'Bearer ',
  'token=',
  'api_key=',
  'password=',
  'secret=',
  'access_token',
  'refresh_token',
];

const REDACTED = '[REDACTED]';

function sanitizeCassette(cassette: Cassette): void {
  let sanitizedCount = 0;
  
  for (const interaction of cassette.interactions) {
    // Sanitize request headers
    for (const key of SENSITIVE_HEADERS) {
      if (key in interaction.request.headers) {
        interaction.request.headers[key] = REDACTED;
        sanitizedCount++;
      }
    }
    
    // Sanitize response headers
    for (const key of SENSITIVE_HEADERS) {
      if (key in interaction.response.headers) {
        interaction.response.headers[key] = REDACTED;
        sanitizedCount++;
      }
    }
    
    // Sanitize request body
    if (interaction.request.body && containsSensitive(interaction.request.body)) {
      interaction.request.body = REDACTED;
      interaction.request.body_hash = computeHash(REDACTED);
      sanitizedCount++;
    }
    
    // Sanitize response body
    if (containsSensitive(interaction.response.body)) {
      interaction.response.body = REDACTED;
      interaction.response.body_hash = computeHash(REDACTED);
      sanitizedCount++;
    }
  }
  
  console.log(`Sanitized ${sanitizedCount} sensitive fields in ${cassette.name}`);
}

function containsSensitive(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSITIVE_BODY_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}
```

The sanitization is intentionally aggressive. It's better to redact a non-sensitive field than to leak a token. When the sanitizer redacts a request body, it also recomputes the `body_hash` to match the redacted content. This ensures the replay matcher still works — it just matches against `[REDACTED]` instead of the original body.

### Pre-commit Hook Integration

As discussed in Chapter 18, the hook system provides lifecycle events that fire before tool execution. The VCR sanitizer integrates with the `PreToolUse` hook for `git commit`:

```typescript
// In the pre-commit hook
function scanCassettesForSecrets(stagedFiles: string[]): string[] {
  const violations: string[] = [];
  
  for (const file of stagedFiles) {
    if (!file.endsWith('.vcr.json')) continue;
    
    const content = readFileSync(file, 'utf-8');
    const cassette: Cassette = JSON.parse(content);
    
    for (const interaction of cassette.interactions) {
      // Check for un-redacted sensitive headers
      for (const key of SENSITIVE_HEADERS) {
        const value = interaction.request.headers[key];
        if (value && value !== REDACTED) {
          violations.push(`${file}: un-redacted header '${key}'`);
        }
      }
    }
  }
  
  return violations;
}
```

This catches the case where someone records a new cassette and forgets to run the sanitizer before committing. The hook blocks the commit with a clear error message explaining which fields need sanitization.

---

## 43.4 Cassette Statistics and Management

Over time, a test suite accumulates hundreds of cassettes. Some become stale (the API they record no longer exists), some become bloated (recording entire conversation flows when only one turn matters), and some are redundant (multiple cassettes covering the same endpoint).

The statistics system helps manage this:

```typescript
interface CassetteStats {
  total_interactions: number;
  unique_urls: number;
  total_size: number;     // Bytes
  recorded_at: string;
  methods: string[];      // Unique HTTP methods
  avg_duration_ms: number;
}

function cassetteStats(cassette: Cassette): CassetteStats {
  const urlSet = new Set<string>();
  const methodSet = new Set<string>();
  let totalDuration = 0;
  
  for (const interaction of cassette.interactions) {
    urlSet.add(interaction.request.url);
    methodSet.add(interaction.request.method);
    totalDuration += interaction.duration_ms;
  }
  
  return {
    total_interactions: cassette.interactions.length,
    unique_urls: urlSet.size,
    total_size: JSON.stringify(cassette).length,
    recorded_at: cassette.recorded_at,
    methods: [...methodSet].sort(),
    avg_duration_ms: cassette.interactions.length > 0
      ? totalDuration / cassette.interactions.length
      : 0,
  };
}

function listCassettes(dir: string): CassetteInfo[] {
  return readdirSync(dir)
    .filter(f => f.endsWith('.vcr.json'))
    .map(f => {
      const path = join(dir, f);
      const stat = statSync(path);
      const cassette = JSON.parse(readFileSync(path, 'utf-8'));
      
      return {
        name: f.replace('.vcr.json', ''),
        path,
        size_bytes: stat.size,
        recorded_at: cassette.recorded_at,
        interaction_count: cassette.interactions.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

A `/test-cassettes` command (discussed in Chapter 44) exposes this to developers:

```
$ agent test-cassettes --stats

Cassette                       Interactions  URLs  Size    Recorded
─────────────────────────────────────────────────────────────────
query-loop-basic               3             1     12.4KB  2026-03-15
query-loop-tool-use            8             2     45.2KB  2026-03-15
permission-check-deny          2             1     8.1KB   2026-03-20
context-compaction-auto        5             1     89.3KB  2026-03-22
mcp-auth-oauth                 12            3     34.7KB  2026-03-25
streaming-multi-tool           15            2     102.1KB 2026-03-28

Total: 45 interactions, 10 unique URLs, 291.8KB
```

---

## 43.5 Mock Rate Limits

The agent handles rate limits from the API (HTTP 429 responses) with exponential backoff and automatic retry. Testing this behavior with real rate limits is impractical — you'd need to exhaust your actual rate limit, which affects other developers and CI/CD pipelines.

The mock rate limiter simulates API throttling:

```typescript
interface MockRateLimitConfig {
  requestsPerMinute: number;
  inputTokensPerMinute: number;
  outputTokensPerMinute: number;
  retryAfterSeconds: number;
}

class MockRateLimiter {
  private requestCount = 0;
  private inputTokenCount = 0;
  private outputTokenCount = 0;
  private windowStart: number;
  
  constructor(private config: MockRateLimitConfig) {
    this.windowStart = Date.now();
  }
  
  checkLimit(inputTokens: number): RateLimitResult {
    this.maybeResetWindow();
    
    this.requestCount++;
    this.inputTokenCount += inputTokens;
    
    if (this.requestCount > this.config.requestsPerMinute) {
      return {
        limited: true,
        reason: 'requests_per_minute',
        retryAfter: this.config.retryAfterSeconds,
        headers: this.buildLimitHeaders(),
      };
    }
    
    if (this.inputTokenCount > this.config.inputTokensPerMinute) {
      return {
        limited: true,
        reason: 'input_tokens_per_minute',
        retryAfter: this.config.retryAfterSeconds,
        headers: this.buildLimitHeaders(),
      };
    }
    
    return { limited: false, headers: this.buildLimitHeaders() };
  }
  
  private buildLimitHeaders(): Record<string, string> {
    return {
      'anthropic-ratelimit-requests-limit': 
        String(this.config.requestsPerMinute),
      'anthropic-ratelimit-requests-remaining': 
        String(Math.max(0, this.config.requestsPerMinute - this.requestCount)),
      'anthropic-ratelimit-requests-reset': 
        new Date(this.windowStart + 60_000).toISOString(),
      'anthropic-ratelimit-input-tokens-limit': 
        String(this.config.inputTokensPerMinute),
      'anthropic-ratelimit-input-tokens-remaining': 
        String(Math.max(0, this.config.inputTokensPerMinute - this.inputTokenCount)),
    };
  }
  
  private maybeResetWindow(): void {
    if (Date.now() - this.windowStart > 60_000) {
      this.requestCount = 0;
      this.inputTokenCount = 0;
      this.outputTokenCount = 0;
      this.windowStart = Date.now();
    }
  }
}
```

### Testing Backoff Behavior

With the mock rate limiter, tests can verify that the agent correctly implements exponential backoff:

```typescript
describe('rate limit handling', () => {
  it('retries with exponential backoff on 429', async () => {
    const limiter = new MockRateLimiter({
      requestsPerMinute: 2,
      inputTokensPerMinute: 100_000,
      outputTokensPerMinute: 50_000,
      retryAfterSeconds: 1,
    });
    
    const delays: number[] = [];
    const originalSleep = globalThis.sleep;
    globalThis.sleep = async (ms: number) => { delays.push(ms); };
    
    // First two requests succeed, third triggers rate limit
    await apiClient.sendMessage(makeRequest('turn 1'));  // OK
    await apiClient.sendMessage(makeRequest('turn 2'));  // OK
    await apiClient.sendMessage(makeRequest('turn 3'));  // 429 → retry
    
    // Verify backoff delays: 1s, 2s, 4s (exponential)
    expect(delays).toEqual([1000, 2000, 4000]);
    
    globalThis.sleep = originalSleep;
  });
  
  it('surfaces rate limit info to the user', async () => {
    const limiter = new MockRateLimiter({
      requestsPerMinute: 1,
      inputTokensPerMinute: 100_000,
      outputTokensPerMinute: 50_000,
      retryAfterSeconds: 30,
    });
    
    const notifications: string[] = [];
    onNotification((msg) => notifications.push(msg));
    
    await apiClient.sendMessage(makeRequest('turn 1'));  // OK
    await apiClient.sendMessage(makeRequest('turn 2'));  // 429
    
    expect(notifications).toContain(
      'Rate limited. Retrying in 30 seconds...'
    );
  });
});
```

---

## 43.6 Feature Flag Overrides for Testing

As discussed in Chapter 21, the feature flag system controls which code paths are active at runtime. Tests need to exercise both sides of every flag — the "flag on" path and the "flag off" path — without depending on the production flag configuration.

### The Override Mechanism

```typescript
class FeatureFlagRegistry {
  private flags: Map<string, FeatureFlag> = new Map();
  private overrides: Map<string, boolean> = new Map();
  
  evaluate(name: string): boolean {
    // Test override takes highest priority
    if (this.overrides.has(name)) {
      return this.overrides.get(name)!;
    }
    
    const flag = this.flags.get(name);
    if (!flag) return false;
    
    return this.evaluateGate(flag);
  }
  
  // Test-only: set a flag override
  setFlag(name: string, value: boolean): void {
    this.overrides.set(name, value);
  }
  
  // Test-only: clear a flag override
  clearFlag(name: string): void {
    this.overrides.delete(name);
  }
  
  // Test-only: clear all overrides
  clearAllOverrides(): void {
    this.overrides.clear();
  }
  
  // Load overrides from environment variable
  loadFromEnv(): void {
    const envFlags = process.env.AGENT_FLAGS;
    if (!envFlags) return;
    
    // Format: "flag1=true,flag2=false,flag3"
    for (const entry of envFlags.split(',')) {
      const [name, value] = entry.split('=');
      this.setFlag(name.trim(), value?.trim() !== 'false');
    }
  }
  
  // Load overrides from a JSON file
  loadFromFile(path: string): void {
    const content = readFileSync(path, 'utf-8');
    const overrides: Record<string, boolean> = JSON.parse(content);
    
    for (const [name, value] of Object.entries(overrides)) {
      this.setFlag(name, value);
    }
  }
}
```

### Test Helper Pattern

A common pattern wraps flag overrides in a test helper that automatically cleans up:

```typescript
function withFlag<T>(name: string, value: boolean, fn: () => T): T {
  const registry = getFeatureFlagRegistry();
  registry.setFlag(name, value);
  
  try {
    return fn();
  } finally {
    registry.clearFlag(name);
  }
}

// Usage in tests
describe('streaming tool execution', () => {
  it('executes tools during streaming when flag is on', () => {
    withFlag('streaming_tool_execution', true, () => {
      const result = executeToolDuringStream(toolCall, stream);
      expect(result.executedDuringStream).toBe(true);
    });
  });
  
  it('queues tools after streaming when flag is off', () => {
    withFlag('streaming_tool_execution', false, () => {
      const result = executeToolDuringStream(toolCall, stream);
      expect(result.executedDuringStream).toBe(false);
      expect(result.queued).toBe(true);
    });
  });
});
```

### Environment-Based Overrides for CI

CI/CD pipelines can set flag overrides via environment variables:

```yaml
# .github/workflows/test.yml
jobs:
  test-with-new-features:
    env:
      AGENT_FLAGS: "streaming_tool_execution=true,new_compaction_engine=true"
    steps:
      - run: npm test
  
  test-without-new-features:
    env:
      AGENT_FLAGS: "streaming_tool_execution=false,new_compaction_engine=false"
    steps:
      - run: npm test
```

This pattern lets you run the full test suite twice — once with new features enabled, once without — ensuring backward compatibility before rolling out a flag.

---

## 43.7 State Reset for Test Isolation

The agent maintains significant global state: the global settings singleton, the feature flag registry, the VCR interceptor state, the permission cache, the token estimator cache, and more. Tests that don't clean up this state will interfere with each other, producing the dreaded "tests pass individually but fail when run together" syndrome.

### The Reset Function

```typescript
function resetStateForTests(): void {
  // Reset global settings to defaults
  getGlobalState().reset();
  
  // Clear feature flag overrides
  getFeatureFlagRegistry().clearAllOverrides();
  
  // Reset VCR state
  const vcrGuard = getActiveVcrRecording();
  if (vcrGuard) {
    stopRecording(); // Discard any in-progress recording
  }
  
  // Clear permission cache
  getPermissionCache().clear();
  
  // Reset token estimation caches
  getTokenEstimator().clearCache();
  
  // Clear tool execution state
  getToolExecutor().reset();
  
  // Reset session storage to in-memory mode
  getSessionStorage().switchToMemory();
  
  // Clear any registered hooks
  getHookRegistry().clearAll();
  
  // Reset MCP connections
  getMcpManager().disconnectAll();
  
  // Clear file state cache
  getFileStateCache().clear();
}
```

### The GlobalState Reset

The global state singleton (discussed in Chapter 3) has ~250 fields. Resetting it means returning every field to its default value:

```typescript
class GlobalState {
  // Session identity
  sessionId: string = '';
  userId: string = '';
  
  // Token tracking
  inputTokens: number = 0;
  outputTokens: number = 0;
  cacheHitTokens: number = 0;
  
  // Model state
  currentModel: string = 'claude-sonnet-4-6';
  effortLevel: EffortLevel = 'high';
  thinkingMode: ThinkingMode = 'adaptive';
  
  // ... 240+ more fields
  
  reset(): void {
    // Instead of resetting each field individually,
    // we create a fresh instance and copy its values
    const fresh = new GlobalState();
    Object.assign(this, fresh);
    
    // Re-initialize non-primitive fields that need fresh objects
    this.agentColors = new Map();
    this.toolResults = new Map();
    this.messageHistory = [];
  }
}
```

The `Object.assign(this, fresh)` trick is important. Rather than maintaining a parallel list of "default values" that would inevitably drift out of sync with the actual field declarations, we create a fresh instance (which uses all the declared defaults) and copy its values. This guarantees that reset always matches the actual defaults.

### Test Runner Integration

Most test frameworks support before/after hooks. The reset function integrates with these:

```typescript
// Jest / Vitest configuration
beforeEach(() => {
  resetStateForTests();
});

afterEach(() => {
  // Verify no leaked state
  const state = getGlobalState();
  expect(state.inputTokens).toBe(0);  // Should be reset
});
```

For test frameworks that support parallel execution, each test worker gets its own global state instance via `AsyncLocalStorage`:

```typescript
const stateStorage = new AsyncLocalStorage<GlobalState>();

function getGlobalState(): GlobalState {
  return stateStorage.getStore() ?? defaultGlobalState;
}

// Each test gets its own isolated state
function runTestWithIsolation(fn: () => Promise<void>): Promise<void> {
  const isolatedState = new GlobalState();
  return stateStorage.run(isolatedState, fn);
}
```

---

## 43.8 Testing Permissions Without a Real User

The permission system (Chapters 15-17) evaluates whether a tool call should be allowed, denied, or asked about. Testing permission evaluation requires simulating user decisions without a real terminal UI.

### The Permission Test Harness

```typescript
class TestPermissionProvider implements PermissionProvider {
  private decisions: Map<string, PermissionDecision> = new Map();
  private askedQuestions: string[] = [];
  
  // Pre-configure what the "user" will answer
  setDecision(toolPattern: string, decision: PermissionDecision): void {
    this.decisions.set(toolPattern, decision);
  }
  
  // Auto-allow everything (for tests that don't care about permissions)
  allowAll(): void {
    this.defaultDecision = 'allow';
  }
  
  // The permission system calls this when it needs user input
  async askUser(question: PermissionQuestion): Promise<PermissionDecision> {
    this.askedQuestions.push(question.description);
    
    // Check pre-configured decisions
    for (const [pattern, decision] of this.decisions) {
      if (question.toolCall.matches(pattern)) {
        return decision;
      }
    }
    
    // Default: deny (fail-safe)
    return this.defaultDecision ?? 'deny';
  }
  
  // Test assertions
  wasAsked(pattern: string): boolean {
    return this.askedQuestions.some(q => q.includes(pattern));
  }
  
  getAskedQuestions(): string[] {
    return [...this.askedQuestions];
  }
}
```

### Testing the Permission Cascade

```typescript
describe('permission evaluation', () => {
  it('deny rules take priority over allow rules', () => {
    const evaluator = new PermissionEvaluator({
      rules: [
        { effect: 'allow', pattern: 'Bash(git *)' },
        { effect: 'deny',  pattern: 'Bash(git push --force *)' },
      ],
    });
    
    expect(evaluator.evaluate('Bash', 'git status')).toBe('allow');
    expect(evaluator.evaluate('Bash', 'git push origin main')).toBe('allow');
    expect(evaluator.evaluate('Bash', 'git push --force origin main')).toBe('deny');
  });
  
  it('first matching rule wins', () => {
    const evaluator = new PermissionEvaluator({
      rules: [
        { effect: 'deny',  pattern: 'Read(./.env)' },
        { effect: 'allow', pattern: 'Read(*)' },
      ],
    });
    
    expect(evaluator.evaluate('Read', './.env')).toBe('deny');
    expect(evaluator.evaluate('Read', './config.ts')).toBe('allow');
  });
  
  it('asks user when no rule matches', async () => {
    const provider = new TestPermissionProvider();
    provider.setDecision('Bash(npm *)', 'allow');
    
    const evaluator = new PermissionEvaluator({
      rules: [],  // No rules — everything goes to the user
      provider,
    });
    
    const result = await evaluator.evaluate('Bash', 'npm install');
    expect(result).toBe('allow');
    expect(provider.wasAsked('npm install')).toBe(true);
  });
});
```

---

## 43.9 Testing Tool Execution with Sandboxing

Tool execution tests need to verify that tools produce correct results without destroying the host environment. The Bash tool, in particular, can run arbitrary commands — tests need a way to execute these in isolation.

### Temporary Directory Fixtures

```typescript
class ToolTestFixture {
  private tmpDir: string;
  private originalCwd: string;
  
  async setup(): Promise<void> {
    this.tmpDir = await mkdtemp(join(tmpdir(), 'agent-test-'));
    this.originalCwd = process.cwd();
    process.chdir(this.tmpDir);
  }
  
  async teardown(): Promise<void> {
    process.chdir(this.originalCwd);
    await rm(this.tmpDir, { recursive: true, force: true });
  }
  
  // Create test files in the fixture
  async createFile(relativePath: string, content: string): Promise<string> {
    const fullPath = join(this.tmpDir, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
    return fullPath;
  }
  
  // Create a test git repository
  async initGitRepo(): Promise<void> {
    await execAsync('git init', { cwd: this.tmpDir });
    await execAsync('git config user.email "test@test.com"', { cwd: this.tmpDir });
    await execAsync('git config user.name "Test"', { cwd: this.tmpDir });
  }
  
  // Assert file exists with expected content
  async assertFile(relativePath: string, expectedContent: string): Promise<void> {
    const fullPath = join(this.tmpDir, relativePath);
    const actual = await readFile(fullPath, 'utf-8');
    expect(actual).toBe(expectedContent);
  }
}
```

### Testing the Bash Tool

```typescript
describe('BashTool', () => {
  const fixture = new ToolTestFixture();
  
  beforeEach(() => fixture.setup());
  afterEach(() => fixture.teardown());
  
  it('executes a simple command', async () => {
    await fixture.createFile('test.txt', 'hello world');
    
    const result = await bashTool.execute({
      command: 'cat test.txt',
    });
    
    expect(result.output).toBe('hello world');
    expect(result.exitCode).toBe(0);
  });
  
  it('returns non-zero exit code on failure', async () => {
    const result = await bashTool.execute({
      command: 'cat nonexistent.txt',
    });
    
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('No such file');
  });
  
  it('respects timeout', async () => {
    const result = await bashTool.execute({
      command: 'sleep 60',
      timeout: 1000,
    });
    
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(true);
  });
  
  it('rejects dangerous commands in sandbox mode', async () => {
    const result = await bashTool.execute({
      command: 'rm -rf /',
      sandboxed: true,
    });
    
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toContain('dangerous');
  });
});
```

### Testing File Tools

```typescript
describe('FileEditTool', () => {
  const fixture = new ToolTestFixture();
  
  beforeEach(() => fixture.setup());
  afterEach(() => fixture.teardown());
  
  it('replaces exact string match', async () => {
    await fixture.createFile('config.ts', `
      const API_URL = "http://localhost:3000";
      const TIMEOUT = 5000;
    `);
    
    const result = await fileEditTool.execute({
      file_path: join(fixture.tmpDir, 'config.ts'),
      old_string: '"http://localhost:3000"',
      new_string: '"https://api.production.com"',
    });
    
    expect(result.success).toBe(true);
    await fixture.assertFile('config.ts', `
      const API_URL = "https://api.production.com";
      const TIMEOUT = 5000;
    `);
  });
  
  it('fails on non-unique match', async () => {
    await fixture.createFile('data.ts', `
      const a = "duplicate";
      const b = "duplicate";
    `);
    
    const result = await fileEditTool.execute({
      file_path: join(fixture.tmpDir, 'data.ts'),
      old_string: '"duplicate"',
      new_string: '"unique"',
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('not unique');
  });
});
```

---

## 43.10 Integration Testing the Query Loop

The highest-value tests exercise the full query loop: user input → prompt construction → API call (via VCR) → response parsing → tool execution → result formatting. These tests catch integration issues that unit tests miss.

### Setting Up a Full Integration Test

```typescript
class QueryLoopTestHarness {
  private vcr: VcrInterceptor;
  private fixture: ToolTestFixture;
  private permissions: TestPermissionProvider;
  
  async setup(cassetteName: string): Promise<void> {
    // Reset all global state
    resetStateForTests();
    
    // Set up VCR for deterministic API responses
    this.vcr = new VcrInterceptor();
    this.vcr.loadCassette(cassetteName);
    this.vcr.mode = VcrMode.Replay;
    
    // Set up tool fixture for filesystem isolation
    this.fixture = new ToolTestFixture();
    await this.fixture.setup();
    
    // Auto-allow all tool calls
    this.permissions = new TestPermissionProvider();
    this.permissions.allowAll();
    
    // Wire everything together
    registerApiInterceptor(this.vcr);
    registerPermissionProvider(this.permissions);
  }
  
  async teardown(): Promise<void> {
    this.vcr.stopRecording();
    await this.fixture.teardown();
    resetStateForTests();
  }
  
  async runQuery(userMessage: string): Promise<QueryResult> {
    const params: QueryParams = {
      messages: [{ role: 'user', content: userMessage }],
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      tools: getRegisteredTools(),
    };
    
    const events: StreamEvent[] = [];
    for await (const event of query(params)) {
      events.push(event);
    }
    
    return {
      events,
      messages: extractMessages(events),
      toolCalls: extractToolCalls(events),
      finalResponse: extractFinalResponse(events),
    };
  }
}
```

### Example Integration Tests

```typescript
describe('query loop integration', () => {
  const harness = new QueryLoopTestHarness();
  
  beforeEach(() => harness.setup('query-loop-basic'));
  afterEach(() => harness.teardown());
  
  it('executes a simple query without tools', async () => {
    const result = await harness.runQuery('What is 2 + 2?');
    
    expect(result.finalResponse).toBeDefined();
    expect(result.toolCalls).toHaveLength(0);
    expect(result.messages).toHaveLength(2); // user + assistant
  });
  
  it('handles tool use with result injection', async () => {
    await harness.setup('query-loop-tool-use');
    
    await harness.fixture.createFile('data.json', '{"count": 42}');
    
    const result = await harness.runQuery('Read data.json and tell me the count');
    
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('Read');
    expect(result.finalResponse).toContain('42');
  });
  
  it('respects permission denials', async () => {
    await harness.setup('query-loop-permission-deny');
    
    harness.permissions.setDecision('Bash(*)', 'deny');
    
    const result = await harness.runQuery('Run ls -la');
    
    // The agent should report that the tool was denied
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].denied).toBe(true);
  });
  
  it('handles continuation on max_output_tokens', async () => {
    await harness.setup('query-loop-continuation');
    
    const result = await harness.runQuery('Write a very long essay about testing');
    
    // Should auto-continue when hitting token limit
    expect(result.events.some(e => e.type === 'continuation')).toBe(true);
    expect(result.messages.length).toBeGreaterThan(2);
  });
});
```

---

## 43.11 Streaming SSE Replay

The Claude API returns responses as Server-Sent Events (SSE). Recording and replaying SSE streams is more complex than simple request/response pairs because the response is a *sequence* of events, each arriving at a specific time.

### Recording SSE Events

```typescript
interface RecordedSSEResponse extends RecordedResponse {
  sse_events: SSEEvent[];
}

interface SSEEvent {
  event: string;        // "message_start", "content_block_delta", etc.
  data: string;         // JSON payload
  offset_ms: number;    // Milliseconds from response start
}

function recordSSEStream(
  stream: ReadableStream,
  startTime: number,
): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  const reader = stream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const lines = new TextDecoder().decode(value).split('\n');
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        events.push({
          event: currentEvent,
          data: line.slice(6),
          offset_ms: Date.now() - startTime,
        });
      }
    }
  }
  
  return events;
}
```

### Replaying with Timing Fidelity

During replay, we can either replay events instantly (for fast tests) or with original timing (for tests that verify streaming behavior):

```typescript
async function* replaySSEStream(
  events: SSEEvent[],
  options: { preserveTiming: boolean } = { preserveTiming: false },
): AsyncGenerator<SSEEvent> {
  let lastOffset = 0;
  
  for (const event of events) {
    if (options.preserveTiming && event.offset_ms > lastOffset) {
      await sleep(event.offset_ms - lastOffset);
    }
    lastOffset = event.offset_ms;
    yield event;
  }
}
```

Most tests use `preserveTiming: false` for speed. Only tests that verify streaming-specific behavior (like the `StreamingToolExecutor` that begins tool execution while the response is still streaming) use real timing.

---

## 43.12 Test Organization and CI/CD

### Directory Structure

```
tests/
├── unit/                          # Fast, no I/O, no API
│   ├── token-estimation.test.ts   # Token counting math
│   ├── permission-matching.test.ts # Glob pattern matching
│   ├── bash-ast.test.ts           # Shell command parsing
│   ├── settings-merge.test.ts     # Configuration merge logic
│   └── ...
├── integration/                   # VCR-backed, full loops
│   ├── query-loop.test.ts         # Core query execution
│   ├── tool-execution.test.ts     # Tool → result pipeline
│   ├── context-compaction.test.ts # Compaction triggers
│   ├── mcp-connection.test.ts     # MCP server communication
│   └── ...
├── e2e/                           # Full agent runs (expensive)
│   ├── simple-conversation.test.ts
│   ├── multi-tool-workflow.test.ts
│   └── ...
├── cassettes/                     # VCR recordings
│   ├── query-loop-basic.vcr.json
│   ├── query-loop-tool-use.vcr.json
│   └── ...
├── fixtures/                      # Shared test data
│   ├── sample-project/            # Mini project for integration tests
│   ├── settings-samples/          # Various settings.json files
│   └── cassette-templates/        # Cassette generation helpers
└── helpers/                       # Test utilities
    ├── harness.ts                 # QueryLoopTestHarness
    ├── fixtures.ts                # ToolTestFixture
    ├── permissions.ts             # TestPermissionProvider
    └── reset.ts                   # resetStateForTests
```

### CI Configuration

```yaml
# .github/workflows/test.yml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- --reporter=junit
    
  integration-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:integration
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: cassette-diffs
          path: tests/cassettes/*.diff
    
  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    needs: [unit-tests, integration-tests]
    env:
      VCR_MODE: replay  # Never hit real API in CI
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:e2e
```

### Test Run Targets

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run tests/unit/",
    "test:integration": "vitest run tests/integration/",
    "test:e2e": "vitest run tests/e2e/",
    "test:watch": "vitest watch tests/unit/",
    "test:coverage": "vitest run --coverage",
    "test:record": "VCR_MODE=record vitest run tests/integration/"
  }
}
```

---

## 43.13 Putting It All Together

The testing infrastructure forms a coherent system where each component reinforces the others:

```
┌──────────────────────────────────────────────────────────┐
│                    Test Runner (Vitest)                    │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Unit     │  │ Integration  │  │ E2E               │  │
│  │ Tests    │  │ Tests        │  │ Tests             │  │
│  │ (~500)   │  │ (~100)       │  │ (~20)             │  │
│  └──────────┘  └──────┬───────┘  └────────┬──────────┘  │
│                       │                    │              │
│            ┌──────────▼────────────────────▼──────┐      │
│            │      QueryLoopTestHarness            │      │
│            │  ┌─────┐ ┌─────────┐ ┌───────────┐  │      │
│            │  │ VCR │ │Fixtures │ │Permissions│  │      │
│            │  └──┬──┘ └────┬────┘ └─────┬─────┘  │      │
│            └─────│─────────│────────────│─────────┘      │
│                  │         │            │                 │
│            ┌─────▼─────────▼────────────▼─────────┐      │
│            │      resetStateForTests()             │      │
│            │  GlobalState │ FeatureFlags │ Caches  │      │
│            └──────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────┘
```

**The VCR makes integration tests deterministic** — they replay recorded API responses instead of hitting the real API, so they're fast, free, and reproducible.

**The mock rate limiter tests resilience** — it simulates API throttling so you can verify backoff behavior without exhausting real rate limits.

**Feature flag overrides test both code paths** — every flag-gated feature gets tested in both its "on" and "off" states, preventing flag-related regressions.

**State reset guarantees isolation** — each test starts with a clean slate, eliminating cross-test pollution.

**The permission test harness removes the human** — pre-configured decisions let tests exercise the full permission cascade without a terminal UI.

**Tool fixtures provide a sandbox** — filesystem-modifying tools operate in temporary directories that are cleaned up automatically.

Together, these components let you test an AI agent as rigorously as any traditional software system — despite the fundamental non-determinism of the underlying model. The key insight is that you don't fight the non-determinism; you record it once and replay it forever. When the model changes, you re-record the affected cassettes and update your assertions. The VCR cassettes become your contract: "given this exact conversation, the agent should behave this way."

This is the same principle that makes snapshot testing work for UI components. The snapshot captures a specific output; the test verifies that the output doesn't change unintentionally. When it does change intentionally, you update the snapshot. VCR cassettes are snapshots for API interactions.

In the next chapter, we'll examine the developer tools and debug infrastructure that help you investigate when tests fail, diagnose performance regressions, and visualize the agent's internal state during development.
