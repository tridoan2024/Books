# Chapter 39: Analytics & Telemetry

Every CLI agent generates a staggering volume of operational data. Each session records dozens of API calls, tool invocations, token counts, latencies, errors, model switches, compaction events, and cost accruals. That data flows past, is consumed by the current turn, and vanishes. Without an analytics and telemetry system, you are flying blind -- unable to answer basic questions like "How much did my team spend on Opus last week?", "What's my p99 tool latency?", or "Which feature flags are actually being used in production?"

This chapter covers the full observability stack of a production CLI agent: the OpenTelemetry integration that provides distributed tracing and metrics, the feature flag system that gates hundreds of runtime behaviors, the privacy architecture that ensures telemetry respects user consent, and the analytics engine that persists everything to a local SQLite database with export pipelines for BigQuery and other data warehouses. We will trace the path of a single telemetry event from the moment it is emitted in user code to the moment it lands in an external collector, examining every buffering, batching, sampling, and privacy-filtering step along the way.

The engineering challenge is threefold: collect enough data to be useful, respect user privacy absolutely, and add zero perceptible latency to the interactive experience. Get any one of these wrong and the telemetry system becomes either useless, unethical, or a performance liability.

---

## 39.1 The Telemetry Architecture at a Glance

The observability stack is organized into four layers, each with a distinct responsibility:

```
User interaction
       |
       v
+-------------------+
| Event Emission    |  EventBuilder, track_*() helpers
+-------------------+
       |
       v
+-------------------+
| Privacy Filtering |  DataCategory gates, PII anonymization
+-------------------+
       |
       v
+-------------------+
| Buffering & Batch |  EventBuffer, RateLimiter, sampling
+-------------------+
       |
       v
+-------------------+
| Transport / Sink  |  HTTP, gRPC, file fallback, Datadog, BigQuery
+-------------------+
```

The first layer is hot-path code that runs inline during every turn. It must be allocation-light and lock-free where possible. The second layer enforces user consent -- if the user has opted out of error reporting, error events are dropped before they ever touch a buffer. The third layer accumulates events in memory and flushes them in batches to amortize I/O. The fourth layer handles the actual network or disk I/O, with retry logic, exponential backoff, and offline fallback.

Let's examine each layer in detail.

---

## 39.2 Event Types and the Telemetry Event Model

### The Event Envelope

Every telemetry event shares a common envelope that carries metadata independent of the event's specific payload:

```rust
pub struct TelemetryEvent {
    pub id: String,
    pub timestamp: SystemTime,
    pub session_id: String,
    pub app_version: String,
    pub payload: EventPayload,
}
```

The `id` is a unique identifier generated from a high-resolution timestamp. The `session_id` ties the event to a specific interactive session, enabling session-level aggregation downstream. The `app_version` allows filtering telemetry by release, which is critical during staged rollouts.

### Event Payloads

The `EventPayload` enum defines every category of telemetry the system can emit:

```rust
pub enum EventPayload {
    SessionStart { model: String, project_dir: Option<String> },
    SessionEnd { duration_secs: u64, turns_completed: u64, ... },
    TurnComplete { turn_number: u64, latency_ms: u64, input_tokens: u64, ... },
    ToolUsed { tool_name: String, latency_ms: u64, success: bool },
    ErrorOccurred { error_type: String, error_code: Option<u32>, retryable: bool },
    CommandExecuted { command_name: String, exit_code: Option<i32>, ... },
    ModelSwitched { from_model: String, to_model: String, reason: String },
    CompactionTriggered { before_tokens: u64, after_tokens: u64, ... },
    FeatureUsed { feature_name: String, metadata: HashMap<String, String> },
    CostIncurred { model: String, input_tokens: u64, cost_usd: f64, ... },
    PerformanceMetric { metric_name: String, value: f64, unit: String, ... },
}
```

Eleven event types cover the complete operational surface. Notice that none of them carry user content -- no code snippets, no file contents, no prompts, no responses. This is an architectural invariant, not a policy. The type system enforces it: there is no `String` field named `content` or `code` anywhere in the payload hierarchy. If a future contributor tries to add one, the code review tooling (and this chapter) should flag it immediately.

### Data Categories for Privacy Filtering

Every event type maps to a `DataCategory` that determines whether the event can be recorded at all:

```rust
pub enum DataCategory {
    SessionLifecycle,    // SessionStart, SessionEnd
    CommandExecution,    // ToolUsed, CommandExecuted
    ModelUsage,          // ModelSwitched
    Performance,         // TurnComplete, PerformanceMetric
    Errors,              // ErrorOccurred
    FeatureUsage,        // FeatureUsed
    Compaction,          // CompactionTriggered
    CostTracking,        // CostIncurred
}
```

The mapping is implemented as a method on `TelemetryEvent`:

```rust
impl TelemetryEvent {
    pub fn data_category(&self) -> DataCategory {
        match &self.payload {
            EventPayload::SessionStart { .. } => DataCategory::SessionLifecycle,
            EventPayload::ToolUsed { .. } => DataCategory::CommandExecution,
            EventPayload::ErrorOccurred { .. } => DataCategory::Errors,
            // ... exhaustive match
        }
    }
}
```

This design means a user can say "I want session lifecycle and cost tracking, but nothing else" and the system will respect that precisely. The category check happens at the entry point of the recording path -- before any buffering or serialization work is performed.

### The Event Builder Pattern

Rather than constructing events manually with struct literals (error-prone, verbose), the system provides an `EventBuilder` that stamps every event with the session ID and app version:

```rust
pub struct EventBuilder {
    session_id: String,
    app_version: String,
}

impl EventBuilder {
    pub fn tool_used(&self, tool_name: &str, latency_ms: u64, success: bool) -> TelemetryEvent {
        self.make_event(EventPayload::ToolUsed {
            tool_name: tool_name.to_string(),
            latency_ms,
            success,
        })
    }

    pub fn cost_incurred(
        &self, model: &str, input_tokens: u64,
        output_tokens: u64, cache_read_tokens: u64, cost_usd: f64,
    ) -> TelemetryEvent {
        self.make_event(EventPayload::CostIncurred { ... })
    }
}
```

The builder is created once at session start and threaded through the engine. Every call site that records telemetry uses the builder, which makes it impossible to forget to set the session ID or version.

---

## 39.3 The Privacy Architecture

### Opt-In by Default

The single most important design decision in the telemetry system: telemetry is **opt-in**, not opt-out. The `PrivacyConfig` struct's `Default` implementation sets `opted_in: false`:

```rust
impl Default for PrivacyConfig {
    fn default() -> Self {
        Self {
            opted_in: false,
            categories: /* all categories enabled */,
            include_machine_id: false,
            include_user_id: false,
            hash_identifiers: true,
            min_aggregation_count: 1,
        }
    }
}
```

Even when the user opts in, machine IDs and user IDs are excluded by default. Identifiers are hashed rather than stored in plaintext. And the `min_aggregation_count` field supports k-anonymity -- you can configure the system to only transmit aggregated data when at least `k` data points contribute, preventing individual session fingerprinting.

### Per-Category Consent

The `PrivacyConfig` carries a `HashMap<DataCategory, bool>` that lets users enable or disable individual categories:

```rust
pub fn is_category_enabled(&self, category: DataCategory) -> bool {
    self.opted_in && self.categories.get(&category).copied().unwrap_or(false)
}
```

Both conditions must be true: the global opt-in flag AND the per-category flag. This is a logical AND, not an OR. Disabling the global flag kills all telemetry regardless of per-category settings.

### PII Anonymization

Even with careful event type design, PII can leak through metadata fields. The `anonymize_event` function scrubs events before they leave the process:

```rust
pub fn anonymize_event(event: &mut TelemetryEvent) {
    // Hash email-like user IDs
    if event.user_id.contains('@') {
        event.user_id = hash_string(&event.user_id);
    }

    // Scrub known PII property keys
    let pii_keys = ["email", "username", "name", "ip", "path", "cwd", "home"];
    for key in &pii_keys {
        if let Some(val) = event.properties.get_mut(*key) {
            *val = hash_string(val);
        }
    }

    // Redact file paths from error messages
    if let Some(msg) = event.properties.get_mut("error") {
        *msg = redact_paths(msg);
    }
}
```

The `redact_paths` function strips patterns like `/Users/john/project/...` and `C:\Users\...` from strings, replacing them with `<redacted-path>`. This is a defense-in-depth measure -- ideally no PII reaches this point, but if it does, the anonymizer catches it.

### The Remote Killswitch

Production telemetry systems need a way to shut down telemetry fleet-wide without pushing a code update. The deep telemetry module implements a killswitch:

```rust
const KILLSWITCH_URL: &str = "https://telemetry.rcode.dev/killswitch";

pub fn killswitch_check() -> bool {
    if std::env::var("RCODE_TELEMETRY_KILL").is_ok() {
        // Local override for testing
        with_manager(|m| {
            m.killswitch_active.store(true, Ordering::Relaxed);
        });
        return true;
    }
    // In production: HTTP GET to killswitch URL, parse JSON response
    false
}
```

The `TelemetryManager.is_enabled()` method checks both the config flag and the killswitch:

```rust
pub fn is_enabled(&self) -> bool {
    self.config.enabled && !self.killswitch_active.load(Ordering::Relaxed)
}
```

If the backend team discovers a bug in telemetry collection -- say, a code path that accidentally logs prompt content -- they flip the killswitch endpoint to `{"kill": true}` and every running client stops transmitting within minutes. The local `RCODE_TELEMETRY_KILL` environment variable provides the same functionality for development and CI.

### Privacy Settings Persistence

Users manage their privacy preferences through a dedicated `/privacy` command that reads and writes a JSON configuration file:

```json
{
  "telemetry_enabled": false,
  "crash_reports_enabled": true,
  "retention_days": 30
}
```

The retention period (1-365 days) controls how long local analytics data is kept. The `clear_stored_data` function lets users wipe specific categories on demand, and `show_collected_data` provides full transparency about what is stored and where:

```rust
pub fn show_collected_data(base_dir: &Path) -> Result<Vec<CollectedDataInfo>> {
    // Scans .rcode/data/ and reports:
    // - category name
    // - human-readable description
    // - file path
    // - retention period
    // - size on disk
}
```

This transparency is not just good practice -- it is a prerequisite for compliance with GDPR, CCPA, and similar privacy regulations that require data controllers to enumerate what data they hold about a user.

---

## 39.4 The Telemetry Manager and Event Buffer

### Recording Events

The `TelemetryManager` is the central coordinator. It owns the privacy config, the event buffer, session statistics, and the enabled/disabled state:

```rust
pub struct TelemetryManager {
    config: TelemetryConfig,
    enabled: AtomicBool,
    event_count: AtomicU64,
    buffer: Mutex<EventBuffer>,
    stats: Mutex<SessionStats>,
    dropped_events: AtomicU64,
}
```

The `record` method is the hot-path entry point. It performs three checks before touching any shared state:

```rust
pub fn record(&self, event: TelemetryEvent) {
    // 1. Global killswitch
    if !self.is_enabled() {
        return;
    }

    // 2. Per-category privacy check
    let category = event.data_category();
    if !self.config.privacy.is_category_enabled(category) {
        return;
    }

    // 3. Increment event count (atomic, no lock)
    self.event_count.fetch_add(1, Ordering::Relaxed);

    // 4. Update session stats (short lock)
    if let Ok(mut stats) = self.stats.lock() {
        match &event.payload {
            EventPayload::TurnComplete { latency_ms, input_tokens, output_tokens, .. } => {
                stats.record_turn(*latency_ms, *input_tokens, *output_tokens);
            }
            EventPayload::ToolUsed { tool_name, .. } => {
                stats.record_tool(tool_name);
            }
            // ... other payload types
        }
    }

    // 5. Buffer the event (short lock)
    if let Ok(mut buffer) = self.buffer.lock() {
        buffer.push(event);
    } else {
        self.dropped_events.fetch_add(1, Ordering::Relaxed);
    }
}
```

Steps 1 and 2 are branch predictions that return immediately in the common case (telemetry disabled or category disabled). Step 3 is an atomic increment -- no contention. Steps 4 and 5 acquire short-lived mutex locks. If either lock is poisoned (previous holder panicked), the event is dropped and the dropped counter increments. The system never blocks or panics in the recording path.

### The Event Buffer

The `EventBuffer` implements size-based and time-based flush triggers:

```rust
pub struct EventBuffer {
    events: Vec<TelemetryEvent>,
    max_size: usize,
    max_age: Duration,
    oldest_event: Option<Instant>,
}

impl EventBuffer {
    pub fn should_flush(&self) -> bool {
        if self.events.len() >= self.max_size {
            return true;
        }
        if let Some(oldest) = self.oldest_event {
            if oldest.elapsed() >= self.max_age {
                return true;
            }
        }
        false
    }
}
```

The default configuration buffers 50 events or 60 seconds, whichever comes first. This means a busy session that generates events rapidly will flush every 50 events, while a quiet session with sparse events will flush every minute. The `drain` method uses `std::mem::take` to swap the buffer contents with an empty vector, releasing events to the transport layer without copying.

### Session Statistics

The `SessionStats` struct aggregates running totals that are used by the `/stats` command and the session-end summary:

```rust
pub struct SessionStats {
    pub turns_completed: u64,
    pub tools_used: HashMap<String, u64>,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cost_usd: f64,
    pub errors: HashMap<String, u64>,
    pub compaction_count: u64,
    pub model_switches: u64,
    pub avg_turn_latency_ms: f64,
    pub max_turn_latency_ms: u64,
}
```

Statistics are updated inline during `record()` so they are always consistent with the buffered events. When the session ends, the manager generates a `SessionEnd` event that carries the final aggregated values.

---

## 39.5 OpenTelemetry Integration

The CLI agent integrates with the OpenTelemetry standard through a custom `OtelManager` that provides distributed tracing (spans), metrics (counters, gauges, histograms), and context propagation. This is not a full OTLP SDK -- it is a lightweight, self-contained implementation tailored to the specific needs of a CLI tool.

### Why Not Use the Official OpenTelemetry SDK?

The official OpenTelemetry Rust SDK (`opentelemetry-rust`) is designed for long-running server processes. It assumes you have a background exporter thread, a global tracer provider, and a runtime that stays alive for the duration of the process. A CLI agent's lifecycle is fundamentally different: sessions last seconds to hours, the process may fork subagents, and latency on the critical path (REPL input-to-response) must stay below perceptible thresholds. The custom implementation gives us:

1. No background threads -- flush is explicit and synchronous.
2. No global tracer provider -- the `OtelManager` is an owned struct passed by reference.
3. No SDK dependency chain -- no `opentelemetry-api`, `opentelemetry-sdk`, `tonic`, `prost`.
4. Full control over the OTLP JSON payload format for direct export to collectors.

### Span Lifecycle

A span represents a unit of work with a start time, end time, attributes, and child events:

```rust
pub struct Span {
    pub context: TraceContext,
    pub name: String,
    pub kind: SpanKind,       // Internal, Client, Server, Producer, Consumer
    pub status: SpanStatus,   // Ok, Error(String), Unset
    pub start_time: SystemTime,
    pub end_time: Option<SystemTime>,
    pub attributes: HashMap<String, Value>,
    pub events: Vec<SpanEvent>,
}
```

The `OtelManager` tracks active and completed spans:

```rust
pub struct OtelManager {
    config: ExportConfig,
    active_spans: Arc<RwLock<HashMap<String, Span>>>,
    completed_spans: Arc<Mutex<Vec<Span>>>,
    metrics: Arc<RwLock<HashMap<String, MetricDefinition>>>,
    metric_buffer: Arc<Mutex<Vec<Metric>>>,
    root_context: TraceContext,
}
```

Starting a span returns a span ID. Ending a span moves it from the active set to the completed set. Child spans share their parent's `trace_id` through the `TraceContext.child()` method:

```rust
pub async fn start_span(
    &self, name: &str, kind: SpanKind, parent_span_id: Option<&str>,
) -> Result<String, OtelError> {
    let ctx = match parent_span_id {
        Some(pid) => {
            let spans = self.active_spans.read().await;
            let parent = spans.get(pid)
                .ok_or_else(|| OtelError::SpanNotFound(pid.into()))?;
            parent.context.child()
        }
        None => self.root_context.child(),
    };

    let span_id = ctx.span_id.clone();
    let span = Span::new(name, kind, ctx);
    self.active_spans.write().await.insert(span_id.clone(), span);
    Ok(span_id)
}
```

A typical instrumented code path looks like this:

```rust
// Start a span for the API call
let span_id = otel.start_span("llm.api_call", SpanKind::Client, None).await?;
otel.set_attribute(&span_id, "model", json!("claude-sonnet-4")).await?;

// Make the API call
let response = api_client.send_request(&request).await?;

// Record token counts as an event
otel.add_event(&span_id, SpanEvent::new("tokens_received")
    .with_attribute("input_tokens", json!(response.input_tokens))
    .with_attribute("output_tokens", json!(response.output_tokens))
).await?;

// End the span
otel.end_span(&span_id, SpanStatus::Ok).await?;
```

### W3C Trace Context Propagation

When the CLI agent calls MCP servers, subagents, or external APIs, it needs to propagate the trace context so that spans from different processes can be correlated. The implementation follows the W3C Trace Context specification:

```rust
pub struct TraceContext {
    pub trace_id: String,      // 32 hex chars
    pub span_id: String,       // 16 hex chars
    pub parent_span_id: Option<String>,
    pub flags: u8,             // 0x01 = sampled
}

impl TraceContext {
    pub fn to_traceparent(&self) -> String {
        format!("00-{}-{}-{:02x}", self.trace_id, self.span_id, self.flags)
    }

    pub fn from_traceparent(header: &str) -> Result<Self, OtelError> {
        let parts: Vec<&str> = header.split('-').collect();
        // Validate: 4 parts, trace_id=32 hex, span_id=16 hex
        // ...
    }
}
```

The manager injects and extracts context through header maps:

```rust
// Outgoing: inject trace context into MCP request headers
otel.inject_context(&current_context, &mut headers);
// headers now contains: {"traceparent": "00-{trace_id}-{span_id}-01"}

// Incoming: extract context from MCP response headers
let ctx = otel.extract_context(&response_headers)?;
let child_span = otel.start_span("mcp.response", SpanKind::Server, Some(&ctx.span_id)).await?;
```

This enables end-to-end tracing across the CLI agent, its MCP servers, and any downstream services. When you open a trace in Perfetto or Jaeger, you see the complete call chain: user prompt -> system prompt assembly -> API call -> tool execution -> MCP call -> response assembly.

### Metrics: Counters, Gauges, and Histograms

The `OtelManager` supports three metric types:

| Type | Use Case | Example |
|------|----------|---------|
| Counter | Monotonically increasing totals | `requests_total`, `tokens_consumed` |
| Gauge | Point-in-time values | `active_spans`, `buffer_utilization` |
| Histogram | Distribution of observations | `request_duration_ms`, `tokens_per_turn` |

Counters and histograms are registered by name and accumulate values:

```rust
// Register a counter
otel.create_counter("api_requests_total", "Total API requests", "1").await?;
otel.increment_counter("api_requests_total", 1.0).await?;

// Register and observe a histogram
otel.create_histogram("turn_latency_ms", "Turn latency", "ms").await?;
otel.observe_histogram("turn_latency_ms", 342.0).await?;
```

Histograms compute percentile statistics on demand:

```rust
let stats = otel.histogram_stats("turn_latency_ms").await?;
// HistogramStats { count: 150, sum: 48200.0, min: 85.0, max: 2300.0,
//                  mean: 321.3, p50: 280.0, p90: 650.0, p99: 1800.0 }
```

### OTLP Export

Completed spans are serialized to the OTLP JSON format and exported via the configured protocol:

```rust
pub async fn export_batch(&self, spans: &[Span]) -> Result<Value, OtelError> {
    let resource_spans: Vec<Value> = spans.iter().map(|s| s.to_export_json()).collect();

    Ok(json!({
        "resourceSpans": [{
            "resource": {
                "attributes": [{
                    "key": "service.name",
                    "value": { "stringValue": "rcode" }
                }]
            },
            "scopeSpans": [{
                "scope": { "name": "rcode.otel" },
                "spans": resource_spans
            }]
        }]
    }))
}
```

The `ExportConfig` supports four protocols:

```rust
pub enum ExportProtocol {
    Grpc,           // OTLP/gRPC (port 4317)
    HttpJson,       // OTLP/HTTP+JSON (port 4318)
    HttpProtobuf,   // OTLP/HTTP+Protobuf
    Stdout,         // Print to stdout (development)
}
```

The default is `HttpJson` targeting `localhost:4318`, which is the standard OTLP HTTP receiver port. In development, `Stdout` dumps formatted JSON to the terminal. In production, `HttpJson` sends batches to an OpenTelemetry Collector that routes to your backend of choice (Jaeger, Grafana Tempo, Datadog, etc.).

---

## 39.6 Feature Flags at Scale

### The GrowthBook-Inspired Registry

The feature flag system manages runtime behavior for every aspect of the agent. The reference implementation defines 50+ flags across 15 categories, and production deployments frequently carry hundreds more for A/B tests, gradual rollouts, and kill-switches.

The `FeatureFlagRegistry` is the central data structure:

```rust
pub struct FeatureFlagRegistry {
    flags: HashMap<String, FeatureFlag>,
    overrides: HashMap<String, bool>,
    user_type: Option<String>,
}
```

Each flag carries a name, default value, description, and a gating strategy:

```rust
pub struct FeatureFlag {
    pub name: String,
    pub default_value: bool,
    pub description: String,
    pub gate_type: FlagGate,
}
```

### Gate Types

The `FlagGate` enum supports six gating strategies, from simple to sophisticated:

```rust
pub enum FlagGate {
    AlwaysOn,                                    // Ship it
    AlwaysOff,                                   // Not ready
    EnvVar(String),                              // RCODE_PROACTIVE=1
    UserType(String),                            // "beta", "internal"
    Percentage(f64),                             // 50% rollout
    Custom(Arc<dyn Fn() -> bool + Send + Sync>), // Arbitrary logic
}
```

Gate evaluation is a simple match:

```rust
pub fn evaluate(&self, user_type: Option<&str>) -> bool {
    match self {
        Self::AlwaysOn => true,
        Self::AlwaysOff => false,
        Self::EnvVar(var) => std::env::var(var).map(|v| !v.is_empty()).unwrap_or(false),
        Self::UserType(expected) => user_type.map(|u| u == expected.as_str()).unwrap_or(false),
        Self::Percentage(pct) => pseudo_random_percent() < *pct,
        Self::Custom(pred) => pred(),
    }
}
```

The `Percentage` gate uses a deterministic hash-based random number rather than a true RNG, ensuring that repeated evaluations within a session return consistent results (a property called "sticky evaluation" in feature flag terminology).

### Flag Categories

Flags are organized into 15 categories for display and management:

| Category | Examples | Count |
|----------|----------|-------|
| Core Agent Modes | `kairos`, `daemon`, `voice_mode`, `bridge_mode` | 7 |
| Planning & Execution | `ultraplan`, `fork_subagent` | 3 |
| Proactive Features | `proactive`, `auto_dream`, `auto_memory` | 5 |
| Search & Retrieval | `treesitter_indexing`, `vector_search` | 3 |
| UI & Display | `tui_mode`, `syntax_highlighting`, `diff_preview` | 5 |
| Security & Permissions | `permission_system`, `sandbox_mode`, `secret_scanning` | 3 |
| LLM & Inference | `prompt_cache`, `streaming`, `multi_model` | 4 |
| Integrations | `git_integration`, `mcp_support`, `azure_devops` | 4 |
| Telemetry & Analytics | `telemetry`, `detailed_analytics` | 2 |
| Session & Persistence | `session_persistence`, `session_replay` | 4 |
| Memory & Knowledge | `memory_indexing`, `knowledge_graph` | 4 |
| Agent Capabilities | `agent_delegation`, `agent_reflection` | 4 |
| Code Intelligence | `semantic_analysis`, `dead_code_detection` | 4 |
| Network & Offline | `offline_mode`, `request_retry` | 3 |
| Experimental | `a_b_test_new_planner`, `test_generation` | 4 |

### The Evaluation Hierarchy

When code checks a feature flag, the registry evaluates three levels in priority order:

1. **Runtime override** -- set via `set_flag("daemon", true)`. Highest priority.
2. **Gate evaluation** -- the `FlagGate` is evaluated with the current user context.
3. **Default value** -- the hardcoded default from the flag definition.

```rust
pub fn feature(&self, name: &str) -> bool {
    // 1. Check runtime overrides first
    if let Some(&val) = self.overrides.get(name) {
        return val;
    }
    // 2. Evaluate the gate
    if let Some(flag) = self.flags.get(name) {
        let gate_result = flag.gate_type.evaluate(self.user_type.as_deref());
        match &flag.gate_type {
            FlagGate::AlwaysOn | FlagGate::AlwaysOff => gate_result,
            _ => gate_result || flag.default_value,
        }
    } else {
        // 3. Unknown flag: warn and return false
        warn!(name, "unknown feature flag queried");
        false
    }
}
```

This three-level hierarchy mirrors how services like GrowthBook, LaunchDarkly, and Unleash work: server-side overrides > targeting rules > default value.

### Override Sources

Overrides can come from three places:

**Environment variable** (`RCODE_FLAGS`):
```bash
RCODE_FLAGS="daemon,voice_mode,!kairos" rcode
# daemon=true, voice_mode=true, kairos=false
```

The comma-separated format with `!` prefix for disabling is compact enough for shell one-liners and CI scripts.

**JSON config file**:
```json
{ "flags": { "daemon": true, "buddy": true } }
```

Loaded via `registry.from_config(path)`. This is the path for managed deployments where an admin pushes flag configurations.

**Runtime API**:
```rust
feature_flags::set_flag("experimental_planner", true);
// ... try the new planner ...
feature_flags::reset_flag("experimental_planner");
```

The global singleton registry (`SharedFlagRegistry`) wraps the registry in `Arc<RwLock<>>` for thread-safe access from any point in the codebase.

### Checking Flags in Practice

The convenience free functions make flag checks a one-liner:

```rust
use crate::config::feature_flags;

if feature_flags::feature("prompt_cache") {
    // Use cached prompt prefix
}

if feature_flags::feature("daemon") {
    // Start background daemon loop
}
```

---

## 39.7 The Analytics Engine

While the telemetry system sends data to external collectors, the analytics engine persists data locally in a SQLite database for the user's own consumption. This powers the `/stats`, `/insights`, and `/cost` commands.

### Schema and Storage

The engine stores events in a single `events` table:

```sql
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    kind TEXT NOT NULL,
    session_id TEXT NOT NULL,
    properties TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
```

The `properties` column stores a JSON object, making the schema flexible enough to handle all event types without schema migrations. The trade-off is that queries against specific properties require JSON parsing, but SQLite's JSON functions handle this efficiently for the data volumes we are dealing with (thousands to tens of thousands of events per day).

### Event Tracking API

The `AnalyticsEngine` provides typed tracking methods:

```rust
engine.track_session_start("sess-1", "claude-sonnet-4")?;
engine.track_tool_used("sess-1", "bash", Duration::from_millis(350), true)?;
engine.track_tokens("sess-1", 1200, 800, "claude-sonnet-4")?;
engine.track_error("sess-1", "rate_limit", "429 Too Many Requests")?;
engine.track_model_switch("sess-1", "claude-sonnet-4", "claude-haiku-4")?;
engine.track_permission_requested("sess-1", "bash", true)?;
engine.track_file_changed("sess-1", "src/main.rs", "edit")?;
```

Events are buffered in memory and flushed to SQLite in batches using a transaction:

```rust
pub fn flush(&self) -> Result<usize> {
    let events = {
        let mut buf = self.buffer.lock()?;
        std::mem::take(&mut *buf)
    };

    let db = self.db.lock()?;
    let tx = db.unchecked_transaction()?;
    for event in &events {
        Self::insert_event(&tx, event)?;
    }
    tx.commit()?;
    Ok(events.len())
}
```

The default buffer size is 1,024 events, and the default flush interval is 30 seconds. Auto-flush triggers when the buffer is full.

### Query API

The engine exposes rich query methods:

**Session summary**: Returns a `MetricSnapshot` with token counts, tool invocations, error counts, cost, and average response time for a single session.

**Daily summary**: Same metrics scoped to a calendar day.

**Tool statistics**: Per-tool invocation count, average duration, success rate, sorted by frequency.

**Error summary**: Error types ranked by count with last-seen timestamps.

**Response time percentiles**: p50, p95, p99 latencies computed from tool execution durations over a configurable lookback window.

**Cost by model**: Total estimated cost per model, computed from stored token counts and configurable per-model pricing:

```rust
fn default_cost_rates() -> Vec<CostRate> {
    vec![
        CostRate::new("claude-sonnet-4", 3.0, 15.0),    // $3/M in, $15/M out
        CostRate::new("claude-haiku-4", 0.25, 1.25),     // $0.25/M in, $1.25/M out
        CostRate::new("claude-opus-4", 15.0, 75.0),      // $15/M in, $75/M out
    ]
}
```

**Cost by day**: Daily cost and token totals for trend analysis.

**Hourly activity**: 24-element array showing event counts per hour of day, useful for identifying peak usage patterns.

### The ASCII Dashboard

The `/insights summary` command renders a full-width ASCII dashboard in the terminal:

```text
            ═══ rcode Analytics Dashboard ═══
────────────────────────────────────────────────────────────
Total events: 2,847
Telemetry: disabled

Tool Usage
  bash     ████████████████████████████████  847
  edit     ██████████████████████           583
  grep     ████████████████                 412
  read     ██████████████                   371
  glob     ████████████                     298

Model Distribution
  claude-sonnet-4     ██████████████████████████████  1,204
  claude-opus-4       █████████████                   502
  claude-haiku-4      ██████                          241

Hourly Activity (last 7d)
  00-03: ▁▁▁▂
  04-07: ▁▁▁▁
  08-11: ▃▅▇█
  12-15: ████
  16-19: ███▇
  20-23: ▅▃▂▁

Response Time Percentiles (last 7d)
  p50: 285.3ms
  p95: 1,247.8ms
  p99: 3,892.1ms
  min: 12.0ms  max: 8,421.0ms  n=2,511

Error Summary
  rate_limit: 23 occurrences (last: 2026-04-12 14:32)
  api_timeout: 8 occurrences (last: 2026-04-11 09:15)
  connection_reset: 3 occurrences (last: 2026-04-10 22:47)

Total Cost: $4.2817
  claude-sonnet-4: $2.1340
  claude-opus-4: $1.8922
  claude-haiku-4: $0.2555
────────────────────────────────────────────────────────────
```

The dashboard is rendered entirely with ASCII art -- no Unicode box-drawing characters that might break in minimal terminal emulators. The bar chart scales to the terminal width and shows the top 10 entries by count.

### Export Pipelines

The analytics engine supports two export formats for offline analysis:

**JSON export**:
```rust
let json = engine.export_json(Some(from_date), Some(to_date))?;
fs::write("analytics_export.json", json)?;
```

**CSV export**:
```rust
let csv = engine.export_csv(None, None)?;
fs::write("analytics_export.csv", csv)?;
```

The CSV format uses RFC 4180 quoting for JSON property values:

```csv
id,timestamp,kind,session_id,properties
evt_001,2026-04-12T10:30:00Z,tool_used,sess-1,"{""tool"":""bash"",""duration_ms"":350}"
```

### BigQuery Event Export

For teams that need warehouse-scale analytics, the deep telemetry module provides structured event export compatible with BigQuery's JSONL ingestion format:

```rust
pub fn export_events(path: &Path, format: ExportFormat) -> io::Result<usize> {
    match format {
        ExportFormat::Jsonl => {
            let mut file = fs::File::create(path)?;
            for event in &events {
                writeln!(file, "{}", event.to_json())?;
            }
        }
        ExportFormat::Csv => {
            // CSV with name, timestamp, session_id, user_id, duration_ms columns
        }
        ExportFormat::Json => {
            // Pretty-printed JSON array
        }
    }
}
```

The JSONL format writes one JSON object per line -- the exact format that BigQuery's `bq load` command expects. A typical export pipeline runs nightly via cron:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Export yesterday's telemetry events
rcode insights export --format jsonl --days 1 --output /tmp/telemetry.jsonl

# Upload to BigQuery
bq load --source_format=NEWLINE_DELIMITED_JSON \
    project:dataset.telemetry_events \
    /tmp/telemetry.jsonl \
    schema.json

rm /tmp/telemetry.jsonl
```

The BigQuery table schema mirrors the event structure:

```json
[
    {"name": "name", "type": "STRING"},
    {"name": "timestamp", "type": "INTEGER"},
    {"name": "session_id", "type": "STRING"},
    {"name": "user_id", "type": "STRING"},
    {"name": "duration_ms", "type": "INTEGER"},
    {"name": "properties", "type": "JSON"}
]
```

Once data lands in BigQuery, teams can run SQL analytics across their entire fleet: average cost per developer per week, feature adoption curves, tool usage heatmaps by project type, error rate trends correlated with model version changes.

---

## 39.8 Session Tracing with Perfetto

Perfetto is Google's open-source tracing framework, and its web-based trace viewer (ui.perfetto.dev) is the gold standard for visualizing distributed traces. The OTel integration described in Section 39.5 produces OTLP-formatted spans, but Perfetto can ingest these through an OpenTelemetry Collector configured with a Perfetto exporter.

### Configuring the Collector

A minimal `otel-collector-config.yaml` for local development:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

exporters:
  otlp/perfetto:
    endpoint: localhost:4317
    tls:
      insecure: true
  file:
    path: /tmp/traces.json

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [otlp/perfetto, file]
```

The file exporter writes Chrome Trace Event Format (CTEF) compatible JSON that can be loaded directly into `ui.perfetto.dev` or `chrome://tracing`. Each span becomes a "Complete Event" with a begin time, duration, category, and name:

```json
{
    "traceEvents": [
        {
            "ph": "X", "name": "llm.api_call",
            "ts": 1712928000000, "dur": 1543000,
            "pid": 1, "tid": 1,
            "args": {"model": "claude-sonnet-4", "tokens": 1200}
        }
    ]
}
```

### What a Session Trace Looks Like

When you open a session trace in Perfetto, you see nested spans arranged on a timeline:

```
session "abc-123"  [0ms ─────────────────────────────────── 45,000ms]
  ├── turn.1  [0ms ──────────── 8,200ms]
  │   ├── system_prompt.assembly  [0ms ─ 45ms]
  │   ├── llm.api_call  [50ms ────── 4,800ms]
  │   │   └── streaming.tokens  [120ms ─── 4,700ms]
  │   ├── tool.bash  [4,850ms ──── 6,100ms]
  │   │   └── bash.execution  [4,870ms ── 6,050ms]
  │   └── tool.edit  [6,200ms ── 6,500ms]
  ├── turn.2  [8,300ms ──────── 15,400ms]
  │   ├── llm.api_call  [8,350ms ─── 12,900ms]
  │   │   ├── prompt_cache.hit  [8,355ms ─ 8,360ms]
  │   │   └── streaming.tokens  [8,500ms ── 12,800ms]
  │   └── tool.read  [13,000ms ── 13,200ms]
  ...
```

This visualization makes it immediately obvious where time is spent. In the example above, 58% of turn 1's wall time is the API call, and within that, streaming accounts for 97% of the API call duration. The prompt cache hit on turn 2 is a 5ms blip that saves potentially hundreds of milliseconds of re-processing.

### Instrumenting Critical Paths

The key paths to instrument are:

1. **Turn lifecycle** -- from user input received to response rendered.
2. **API calls** -- from request sent to last token received, including prompt cache status.
3. **Tool execution** -- from tool dispatch to result returned.
4. **Context assembly** -- system prompt construction, memory retrieval, rule loading.
5. **Compaction** -- when and why compaction fires, and how long it takes.
6. **Hook execution** -- pre/post tool use hooks, their latency impact.
7. **MCP calls** -- outbound requests to MCP servers, including serialization overhead.

Each of these gets a span kind appropriate to its role: `Internal` for local processing, `Client` for outbound calls, `Server` for handling incoming requests from IDE bridges.

---

## 39.9 Diagnostic Tracking and Error Logging

### The Two-Tier Error Model

The telemetry system distinguishes between two kinds of error tracking:

1. **Error events** in the telemetry stream (`EventPayload::ErrorOccurred`) -- these carry the error *type* and *code* but never the full message. They are used for aggregate analysis: "How many 429s did we get last week?"

2. **Error summaries** in the analytics database -- these carry the error type, count, and last-seen timestamp, enabling the error summary table shown in the dashboard.

The separation is intentional. The telemetry stream may leave the user's machine (if opted in), so it must be minimal. The analytics database stays local, so it can store slightly more detail for debugging.

### Retryable vs. Fatal Errors

The `ErrorOccurred` payload includes a `retryable: bool` field:

```rust
ErrorOccurred {
    error_type: String,
    error_code: Option<u32>,
    retryable: bool,
}
```

This enables downstream dashboards to distinguish between transient failures (rate limits, timeouts, connection resets) and permanent failures (authentication errors, invalid requests, model not found). A high rate of retryable errors with eventual success indicates infrastructure pressure. A high rate of non-retryable errors indicates bugs.

### System Metadata Collection

The `collect_metadata()` function gathers environment information for diagnostic purposes:

```rust
pub fn collect_metadata() -> HashMap<String, String> {
    let mut meta = HashMap::new();
    meta.insert("os", std::env::consts::OS);           // "macos", "linux"
    meta.insert("arch", std::env::consts::ARCH);        // "aarch64", "x86_64"
    meta.insert("shell", env::var("SHELL"));             // "/bin/zsh"
    meta.insert("terminal", env::var("TERM"));           // "xterm-256color"
    meta.insert("rcode_version", env!("CARGO_PKG_VERSION"));
    meta.insert("ci", (env::var("CI").is_ok()).to_string());
    meta
}
```

The CI detection is particularly important: sessions running in CI/CD pipelines have fundamentally different usage patterns (non-interactive, often running `/batch` operations) and should be segmented separately in analytics.

---

## 39.10 Transport Layer and Delivery Guarantees

### Multi-Sink Architecture

The deep telemetry module supports four transport sinks:

```rust
pub enum TelemetrySink {
    Datadog,      // POST to Datadog intake API
    FirstParty,   // POST to telemetry.rcode.dev/v1/events
    File,         // Append JSONL to local file
    Null,         // Discard (disabled/testing)
}
```

The `Null` sink is the default, meaning a fresh installation with no configuration transmits nothing. The `File` sink is useful for enterprises that want telemetry data but cannot send it to external services -- they analyze the local JSONL files with their own tools.

### HTTP Transport with Retry

The `TransportManager` handles batching, rate limiting, retry, and offline fallback:

```rust
pub struct TransportManager {
    config: TransportConfig,
    client: Box<dyn HttpClient>,
    rate_limiter: Option<RateLimiter>,
    fallback: Option<FileFallback>,
    queue: VecDeque<TelemetryEvent>,
    total_sent: u64,
    total_dropped: u64,
    total_fell_back: u64,
    consecutive_failures: u32,
}
```

The retry logic uses exponential backoff with configurable base delay and maximum delay:

```rust
fn backoff_delay(retry: u32, base: Duration, max: Duration) -> Duration {
    let delay = base.mul_f64(2.0_f64.powi(retry as i32 - 1));
    delay.min(max)
}
```

With the default base of 500ms and max of 30s, the retry schedule is: 500ms, 1s, 2s, 4s, 8s, 16s, 30s, 30s, ... Only retryable HTTP status codes trigger retry: 429, 500, 502, 503, 504. A 400 or 401 fails immediately -- retrying a bad request wastes time.

### Token Bucket Rate Limiting

The `RateLimiter` implements a token bucket algorithm to prevent the telemetry system from overwhelming the network:

```rust
pub struct RateLimiter {
    max_per_sec: u32,
    tokens: f64,
    max_tokens: f64,     // 2x max_per_sec for burst allowance
    last_refill: Instant,
}
```

The default rate is 50 events per second, with a burst capacity of 100. Under normal operation (a few events per second), the rate limiter never fires. During pathological scenarios -- a loop that generates thousands of error events -- the limiter prevents the telemetry system from consuming all available bandwidth.

### File-Based Offline Fallback

When HTTP delivery fails after all retries, events are saved to a local fallback directory:

```rust
pub struct FileFallback {
    dir: PathBuf,
    max_files: usize,
}
```

Fallback files are named `telemetry_{timestamp}.json` and automatically cleaned up when the count exceeds `max_files` (default 100). On the next successful connection, `retry_fallback()` attempts to re-send stored files and deletes them upon success.

This store-and-forward pattern ensures no data loss during network outages, airplane mode, or VPN disconnections -- scenarios that are common for a developer tool that runs on laptops.

---

## 39.11 Putting It All Together

Let's trace the complete lifecycle of a single telemetry event from emission to persistence:

1. **Emission**: The tool executor calls `builder.tool_used("bash", 350, true)`, which creates a `TelemetryEvent` with the current timestamp, session ID, and `ToolUsed` payload.

2. **Privacy check**: `TelemetryManager.record()` checks `is_enabled()` (global opt-in) and `is_category_enabled(CommandExecution)`. If either returns false, the event is silently dropped.

3. **Session stats update**: The manager acquires the stats lock and calls `stats.record_tool("bash")`, incrementing the per-tool counter.

4. **Buffering**: The event is pushed to the `EventBuffer`. If the buffer now holds 50+ events or the oldest event is 60+ seconds old, a flush is triggered.

5. **Flush**: The buffer is drained. Events are simultaneously written to the local analytics SQLite database (for the user's `/stats` command) and enqueued in the `TransportManager` (for remote telemetry, if opted in).

6. **Transport**: The transport manager batches events, applies rate limiting, serializes to JSON, optionally compresses with gzip, and POSTs to the configured endpoint. On failure, events are saved to the fallback directory.

7. **Export**: Periodically (or on demand), the user can export events from SQLite to JSON, CSV, or JSONL for BigQuery ingestion.

Throughout this pipeline, the event never carries PII, code content, or prompt text. The privacy architecture is not a filter applied at the end -- it is a structural property of the event type system itself.

---

## 39.12 Design Decisions and Trade-offs

**Why SQLite for local analytics?** SQLite is embedded, requires no server process, handles concurrent reads from the TUI while the engine writes, and its single-file storage makes backup and migration trivial. The alternative -- writing to flat files and parsing them on query -- would require reimplementing indexing and aggregation.

**Why a custom OTel implementation instead of the official SDK?** As discussed in Section 39.5, the official SDK's architecture (background threads, global providers, long-running runtime assumptions) is a poor fit for a CLI tool. The custom implementation is ~900 lines of Rust versus a multi-crate dependency tree, and it gives us precise control over export timing.

**Why opt-in rather than opt-out telemetry?** User trust. A CLI agent has deep access to a developer's filesystem, code, and credentials. Any perception that the tool is "phoning home" without explicit consent would be toxic to adoption. The engineering cost of opt-in (lower data volume) is far outweighed by the trust benefit.

**Why per-category privacy controls?** Different organizations have different compliance requirements. A healthcare company might allow anonymous session duration telemetry but prohibit error reports that could contain PHI in stack traces. Per-category controls let them participate in the parts they are comfortable with.

**Why a remote killswitch?** In case of a privacy incident -- say, a bug that causes prompt text to leak into error messages -- the killswitch lets the team stop all telemetry fleet-wide within the next polling interval. Without it, they would need to ship a hotfix and wait for users to update, potentially exposing data for days.

---

## 39.13 Summary

The analytics and telemetry system is the nervous system of the CLI agent -- it surfaces what the agent is doing, how well it is doing it, and how much it costs. The architecture separates concerns cleanly: event types define what can be measured, privacy controls define what may be measured, buffers and transports define how measurements are delivered, and the analytics engine provides local persistence and visualization.

The key engineering principles at work:

1. **Privacy by design**: Opt-in, per-category consent, no PII in the type system, anonymization as defense-in-depth, remote killswitch.
2. **Zero-overhead when disabled**: Early returns on the hot path, atomic flag checks, no allocations for dropped events.
3. **Local-first**: The SQLite analytics database works without any network connectivity. Remote telemetry is an optional add-on, not a requirement.
4. **Standards-based**: W3C Trace Context for propagation, OTLP JSON for export, OpenTelemetry-compatible span and metric models.
5. **Graceful degradation**: File fallback when offline, rate limiting when overloaded, store-and-forward for eventual delivery.

In the next chapter, we will examine the testing infrastructure that validates all of these subsystems -- how to test privacy controls, mock HTTP transports, verify event serialization, and ensure that the killswitch actually kills.
