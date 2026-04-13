# Chapter 30: MCP Architecture

Every tool system eventually hits a wall. You can build fifty tools directly into your CLI agent, tightly coupled to its release cycle and deployment model, but what happens when your users need tools you never anticipated? What happens when a database vendor ships a query inspector, a design team wants a Figma integration, or an enterprise needs access to an internal knowledge base that will never be open-sourced? You need an extension point — a way for external processes to offer capabilities to the agent at runtime, without modifying the agent's source code.

The Model Context Protocol (MCP) is that extension point. It defines a standard interface for external servers to expose tools, resources, and prompts to AI agents over a transport-agnostic JSON-RPC 2.0 channel. Claude Code's MCP implementation spans roughly 6,500 lines across eight core files: a client connection manager (`client.rs` at 1,600+ lines), a deep client with health monitoring (`deep_client.rs` at 1,100+ lines), a connection lifecycle manager (`connections.rs` at 700+ lines), transport implementations (`transports.rs` at 1,088 lines), configuration and discovery (`config.rs` at 977 lines), authentication (`auth.rs` at 1,000+ lines), type definitions (`types.rs` at 1,626 lines), and channel permissions (`channels.rs` at 150+ lines).

In this chapter, we'll build the architecture from the wire protocol up: transport abstractions, connection lifecycle, server discovery and configuration, and the client that ties it all together. Authentication and tool integration get their own chapters (31 and 32), so we'll reference them at boundaries but won't dive deep.

---

## 30.1 The Wire Protocol: JSON-RPC 2.0 on MCP

MCP rides on JSON-RPC 2.0 — the same wire protocol used by the Language Server Protocol (LSP). Every message is a JSON object with a `"jsonrpc": "2.0"` field. There are three message shapes: requests (which expect a response), responses (which carry a result or error), and notifications (one-way messages with no response).

### Message Types

The type system in `types.rs` models these three shapes as distinct structs:

```rust
// types.rs:140-175 — A request carries an ID so the response can be matched.
pub struct JsonRpcRequest {
    pub jsonrpc: String,        // Always "2.0"
    pub id: u64,                // Monotonically increasing per connection
    pub method: String,         // e.g., "tools/call", "resources/read"
    pub params: Option<Value>,  // Method-specific arguments
}

// types.rs:211-265 — A response matches the request's ID.
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<u64>,            // Matches the request ID
    pub result: Option<Value>,      // On success
    pub error: Option<JsonRpcError>,// On failure
}

// types.rs:177-209 — A notification has no ID, expects no response.
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    pub params: Option<Value>,
}
```

The key design choice here is that `id` is a simple `u64` on the request side, but the `RequestId` type also accommodates string IDs because some servers use UUIDs:

```rust
// types.rs:84-90
pub enum RequestId {
    Number(u64),    // The common case — integer counters
    Str(String),    // Some servers use UUID-style IDs
}
```

This is a practical accommodation. The MCP spec says IDs can be numbers or strings; the common path (integer counters) is the zero-allocation fast path, with string parsing as a fallback.

### Error Codes

The error code space is split between standard JSON-RPC codes and MCP-specific extensions within the reserved server error range (-32099 to -32000):

```rust
// types.rs:17-56 — Standard JSON-RPC 2.0 error codes
pub const PARSE_ERROR: i64 = -32700;       // Invalid JSON
pub const INVALID_REQUEST: i64 = -32600;   // Malformed structure
pub const METHOD_NOT_FOUND: i64 = -32601;  // Unknown method
pub const INVALID_PARAMS: i64 = -32602;    // Wrong arguments
pub const INTERNAL_ERROR: i64 = -32603;    // Server-side crash

// MCP-specific codes within the server error range
pub const MCP_TOOL_NOT_FOUND: i64 = -32001;
pub const MCP_RESOURCE_NOT_FOUND: i64 = -32002;
pub const MCP_NOT_INITIALIZED: i64 = -32003;
pub const MCP_ALREADY_INITIALIZED: i64 = -32004;
pub const MCP_PROMPT_NOT_FOUND: i64 = -32005;
```

The `error_code_label()` function at `types.rs:59-74` converts these codes to human-readable strings. It also handles the entire server error range with a catch-all, which matters for forward compatibility — new MCP versions may add error codes that older clients haven't seen:

```rust
pub fn error_code_label(code: i64) -> &'static str {
    match code {
        PARSE_ERROR => "Parse error",
        // ... specific codes ...
        c if (SERVER_ERROR_RANGE_START..=SERVER_ERROR_RANGE_END).contains(&c) => "Server error",
        _ => "Unknown error",
    }
}
```

This is a pattern worth internalizing: when consuming a protocol you don't fully control, always have a graceful fallback for codes you don't recognize. The alternative — panicking on unknown codes — creates silent upgrade dependencies.

---

## 30.2 The Transport Layer

The transport layer is the lowest abstraction in the MCP stack. It answers one question: how do bytes get between the client and the server? Everything above — handshakes, tool calls, health checks — is transport-agnostic. The design follows a trait-based polymorphism pattern that lets the client work identically regardless of whether it's talking to a child process over stdin/stdout, an HTTP endpoint, or an SSE stream.

### The Transport Trait

```rust
// transports.rs:77-100
#[async_trait]
pub trait Transport: Send + Sync {
    /// Send a JSON-RPC request and wait for the response.
    async fn send(&self, request: &JsonRpcRequest) -> Result<JsonRpcResponse>;

    /// Send a JSON-RPC notification (no response expected).
    async fn send_notification(&self, notification: &JsonRpcNotification) -> Result<()>;

    /// Check if the transport is healthy and connected.
    async fn health_check(&self) -> Result<()>;

    /// Get the current transport state.
    fn state(&self) -> TransportState;

    /// Close the transport connection gracefully.
    async fn close(&self) -> Result<()>;

    /// Get a human-readable name for this transport type.
    fn transport_name(&self) -> &str;
}
```

Six methods. No more, no less. The trait is deliberately minimal — it doesn't include reconnection logic, retry policies, or health monitoring schedules. Those belong in the connection manager (Section 30.4), not the transport. This separation means you can swap transports without rewriting lifecycle management.

The `Send + Sync` bounds are critical. The transport will be shared across async tasks (the main loop, health check timers, background tool calls). Without these bounds, you'd need to Arc-wrap every transport manually.

### Transport State Machine

Every transport maintains a four-state lifecycle:

```rust
// transports.rs:54-64
pub enum TransportState {
    Disconnected,  // Not yet connected
    Connecting,    // Connection in progress
    Connected,     // Ready for requests
    Error,         // Something broke
}
```

The state machine is intentionally simple. There's no `Reconnecting` state at the transport level — reconnection is a higher-level concern handled by the connection manager. From the transport's perspective, you're either connected or you're not. If a reconnection attempt creates a new transport instance, it starts at `Disconnected` and transitions to `Connected` or `Error`.

### Transport Constants

Before diving into implementations, note the tuning constants at the top of `transports.rs`:

```rust
// transports.rs:29-47
const DEFAULT_SEND_TIMEOUT: Duration = Duration::from_secs(30);
const INITIAL_BACKOFF: Duration = Duration::from_millis(500);
const MAX_BACKOFF: Duration = Duration::from_secs(30);
const BACKOFF_MULTIPLIER: f64 = 2.0;
const MAX_RECONNECT_ATTEMPTS: u32 = 10;
const HEALTH_CHECK_INTERVAL: Duration = Duration::from_secs(15);
const SSE_RECONNECT_TIMEOUT: Duration = Duration::from_secs(5);
```

These are not arbitrary. The 30-second send timeout matches the MCP specification's recommended upper bound for tool execution time. The exponential backoff schedule (500ms, 1s, 2s, 4s, 8s, 16s, 30s cap) provides fast recovery for transient failures while backing off aggressively for sustained outages. The 15-second health check interval balances responsiveness with overhead — checking every second would generate unnecessary traffic, while checking every minute would leave dead connections lingering too long.

---

## 30.3 Transport Implementations

The codebase provides four transport implementations, each optimized for a different deployment model.

### StdioTransport — The Workhorse

The most common transport. The client spawns the server as a child process and communicates via stdin (client-to-server) and stdout (server-to-client). Messages are newline-delimited JSON (NDJSON) — one JSON object per line.

```rust
// transports.rs:108-118
pub struct StdioTransport {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<tokio::process::ChildStdin>>,
    reader: Mutex<Option<BufReader<tokio::process::ChildStdout>>>,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    state: Arc<std::sync::atomic::AtomicU8>,
    messages_sent: AtomicU64,
    connected: AtomicBool,
}
```

Three things to note about this struct:

1. **Option-wrapped I/O handles**: The `stdin` and `reader` are wrapped in `Option` because they're moved out of the `Child` struct at spawn time. Once the child is running, they're always `Some`, but the type system doesn't know that. The `Mutex<Option<>>` pattern avoids unsafe code.

2. **Separate mutexes for read and write**: `stdin` and `reader` have independent mutexes. This is intentional — a request write shouldn't block a response read. Notifications and responses can flow concurrently.

3. **Atomic state tracking**: `state` uses an `AtomicU8` rather than a `Mutex<TransportState>` because state checks happen on every operation and must be lock-free. The `connected` flag provides a fast-path boolean check without decoding the `u8`.

#### Connection Flow

The `connect()` method spawns the child process with piped I/O:

```rust
// Spawns the MCP server as a subprocess
let mut cmd = Command::new(command);
cmd.args(args)
    .stdin(Stdio::piped())      // Client writes requests here
    .stdout(Stdio::piped())     // Server writes responses here
    .stderr(Stdio::null());     // Stderr is discarded (no structured use)

for (k, v) in env {
    cmd.env(k, v);              // Server-specific environment variables
}

let mut child = cmd.spawn()?;
let child_stdin = child.stdin.take().context("MCP child has no stdin")?;
let child_stdout = child.stdout.take().context("MCP child has no stdout")?;
```

The critical design decision is `stderr(Stdio::null())`. MCP servers are supposed to communicate exclusively via JSON-RPC on stdout. Any human-readable output they produce on stderr is noise that could break NDJSON parsing if accidentally mixed in. Discarding stderr is a deliberate safety measure.

#### Request-Response Cycle

The `send()` method serializes a request to NDJSON, writes it to stdin, then reads lines from stdout until it finds a response matching the request ID:

```rust
// Simplified from transports.rs:222-254
async fn send(&self, request: &JsonRpcRequest) -> Result<JsonRpcResponse> {
    let json = serde_json::to_string(request)? + "\n";

    // Write request to server's stdin
    let mut stdin = self.stdin.lock().await;
    stdin.as_mut().unwrap().write_all(json.as_bytes()).await?;
    stdin.as_mut().unwrap().flush().await?;

    // Read response lines until we find our ID
    let mut reader = self.reader.lock().await;
    let reader = reader.as_mut().unwrap();
    let mut line = String::new();

    loop {
        line.clear();
        reader.read_line(&mut line).await?;

        // Try to parse as a response
        if let Ok(response) = serde_json::from_str::<JsonRpcResponse>(&line) {
            if response.id == Some(request.id) {
                return Ok(response);
            }
            // Not our response — might be a notification or another request's response
        }
    }
}
```

The response-matching loop is crucial. Because JSON-RPC is asynchronous (multiple requests can be in flight), the server may send responses out of order or intersperse notifications. The client must skip non-matching messages and keep reading.

In the real implementation, this entire cycle is wrapped in `tokio::time::timeout(DEFAULT_SEND_TIMEOUT, ...)` to prevent hanging indefinitely if the server stops responding.

#### Health Checking

```rust
// transports.rs:293 — Non-blocking process liveness check
pub async fn health_check(&self) -> Result<()> {
    // try_wait() checks if the process has exited without blocking
    match child.try_wait() {
        Ok(Some(_exit)) => Err(anyhow!("process exited")),
        Ok(None) => Ok(()),          // Still running
        Err(e) => Err(e.into()),     // OS error
    }
}
```

Stdio health checks don't send network traffic — they use the OS's `waitpid` under the hood. A non-blocking `try_wait()` returns immediately: the process is either still running (healthy) or it exited (unhealthy). This is fundamentally different from HTTP health checks, which must send a probe request.

### HttpTransport — Stateless Request/Response

The HTTP transport sends each JSON-RPC request as an HTTP POST and receives the response in the HTTP response body. No persistent connection is maintained — each request is a complete HTTP round-trip.

```rust
// transports.rs:346-363
pub struct HttpTransport {
    url: String,
    client: reqwest::Client,
    headers: HashMap<String, String>,
    state: Arc<std::sync::atomic::AtomicU8>,
    connected: AtomicBool,
    messages_sent: AtomicU64,
}
```

The HTTP transport is simpler than stdio because it doesn't manage a child process. The `connect()` method simply marks the transport as connected — there's no handshake at the transport level (the MCP protocol handshake happens at the client level above). The `health_check()` sends a GET request to the server URL with a 5-second timeout.

Custom headers support enables authentication without the transport knowing the auth scheme:

```rust
// Headers from config are merged into every request
for (key, value) in &self.headers {
    req = req.header(key, value);
}
```

This is the separation-of-concerns principle in action. The transport doesn't know about OAuth tokens or API keys — it just sends whatever headers it's told to send. The auth layer (Chapter 31) populates those headers.

### SseTransport — Streaming Server Events

Server-Sent Events (SSE) provide a hybrid model: the server pushes events to the client over a persistent GET connection, while the client sends requests via HTTP POST to a separate endpoint. This is useful for servers that need to stream real-time notifications — for example, a file watcher server that notifies the agent when files change.

```rust
// transports.rs:505-517
pub struct SseTransport {
    url: String,
    client: reqwest::Client,
    headers: HashMap<String, String>,
    state: Arc<std::sync::atomic::AtomicU8>,
    connected: AtomicBool,
    messages_sent: AtomicU64,
    pending: Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<JsonRpcResponse>>>>,
}
```

The `pending` field is the key differentiator. When the client sends a request via POST, it creates a `oneshot::channel` and stores the sender half in the `pending` map keyed by request ID. When the SSE event stream delivers a response, the receiver completes. This allows the SSE transport to match responses to requests even though they travel over different HTTP connections.

The URL convention is important: if the SSE endpoint is `http://server:3000/sse`, POST requests go to `http://server:3000/message`. This is derived automatically by replacing the path component.

### InProcessTransport — Testing Without I/O

The in-process transport is for tests. Instead of spawning a process or making HTTP calls, it delegates to a function:

```rust
// transports.rs:710-724
pub type InProcessHandler = Arc<
    dyn Fn(JsonRpcRequest) -> Pin<Box<dyn Future<Output = Result<JsonRpcResponse>> + Send>>
    + Send + Sync,
>;

pub struct InProcessTransport {
    handler: InProcessHandler,
    state: Arc<std::sync::atomic::AtomicU8>,
    connected: AtomicBool,
    messages_sent: AtomicU64,
}
```

The pre-built echo handler at line 731 returns request params as the result, which is useful for testing the client logic without a real server. This pattern — providing a test double at the transport layer — means every test that exercises MCP client code can run without spawning subprocesses, making tests fast and deterministic.

### Transport Factory

The `create_transport()` factory function at `transports.rs:812-842` maps configuration to concrete transport types:

```rust
pub fn create_transport(config: &TransportConfig) -> Result<Box<dyn Transport>> {
    match config.transport_type {
        TransportType::Stdio => {
            let command = config.command.as_ref()
                .context("stdio transport requires 'command'")?;
            Ok(Box::new(StdioTransport::new(
                command, &config.args, &config.env,
            )))
        }
        TransportType::Http => {
            let url = config.url.as_ref()
                .context("HTTP transport requires 'url'")?;
            Ok(Box::new(HttpTransport::new(url, &config.headers)))
        }
        TransportType::Sse => {
            let url = config.url.as_ref()
                .context("SSE transport requires 'url'")?;
            Ok(Box::new(SseTransport::new(url, &config.headers)))
        }
    }
}
```

The factory validates that each transport type has its required fields — command for stdio, URL for HTTP/SSE — and returns a `Box<dyn Transport>` that the client can use polymorphically. The `TransportConfig` struct bundles all possible fields from the configuration layer into a single struct that the factory destructures.

### Claude Code's Extended Transport Landscape

While the rcode implementation provides three concrete transports, Claude Code's TypeScript implementation (`services/mcp/client.ts`, 3,348 lines) supports eight transport types to accommodate its broader deployment surface:

| Transport | Protocol | Use Case |
|-----------|----------|----------|
| **Stdio** | Process stdin/stdout | Local npm/Python MCP servers |
| **SSE** | GET stream + POST requests | Remote servers needing push notifications |
| **Streamable HTTP** | HTTP with streaming responses | High-throughput remote servers |
| **WebSocket** | Full-duplex WS | Low-latency bidirectional communication |
| **IDE Channel** | Extension host API | VS Code / JetBrains MCP servers |
| **SDK Transport** | In-process function calls | MCP servers bundled as libraries |
| **Claude.ai Proxy** | Routed through claude.ai | Web-based Claude Code accessing MCP |
| **Managed Transport** | Enterprise gateway | Organization-controlled MCP routing |

The first three map directly to the rcode implementations. The remaining five are specific to Claude Code's multi-platform deployment:

- **IDE transports** use the extension host's IPC mechanism rather than spawning a child process, because the IDE already manages the MCP server lifecycle.
- **SDK transports** let MCP servers run in the same process as Claude Code (useful for bundled plugins that don't need process isolation).
- **Claude.ai proxy** routes MCP traffic through Anthropic's servers for the web-based version of Claude Code, which can't spawn local processes.
- **Managed transports** route through an enterprise gateway that applies organization-level access control before reaching the actual MCP server.

The architectural lesson is that the transport trait pattern scales. Because all higher layers — connection management, health monitoring, tool invocation — program against the `Transport` trait rather than concrete types, adding a new transport is a localized change that doesn't ripple through the codebase.

---

## 30.4 Connection Lifecycle Management

Above the transport layer sits the connection manager — the subsystem responsible for establishing connections, monitoring their health, reconnecting when they fail, and shutting them down gracefully. This is where the complexity lives.

### Connection State Machine

The connection manager tracks a richer state machine than the transport:

```rust
// connections.rs:48-63
pub enum ConnectionState {
    Disconnected,    // Not yet established
    Connecting,      // In progress
    Connected,       // Active and healthy
    Reconnecting,    // Lost, attempting recovery
    Error,           // Irrecoverable failure
    Shutdown,        // Intentionally closed
}
```

Two states here are new compared to the transport: `Reconnecting` and `Shutdown`. The reconnecting state is critical because the UI needs to distinguish between "connection hasn't been established yet" (Disconnected) and "connection was working but just died" (Reconnecting). The shutdown state prevents the health monitor from trying to reconnect a connection that was intentionally closed.

### Connection Events

The connection manager emits events for state transitions, enabling the UI and telemetry layers to react:

```rust
// connections.rs:84-117
pub enum ConnectionEvent {
    Connected { server_name: String },
    Disconnected { server_name: String, reason: String },
    Reconnecting { server_name: String, attempt: u32 },
    Error { server_name: String, error: String },
    Shutdown { server_name: String },
    HealthCheckOk { server_name: String },
    HealthCheckFailed { server_name: String, error: String },
}
```

This is the observer pattern applied to infrastructure. The connection manager doesn't know about the UI, the telemetry system, or the status bar. It just emits events. Consumers subscribe and react. This decoupling means you can add a Prometheus metrics exporter without touching the connection manager code.

### The Connection Pool

The `ConnectionManager` owns a pool of named connections, each backed by a transport:

```rust
// connections.rs:223-235 (simplified)
pub struct ConnectionManager {
    connections: Arc<RwLock<HashMap<String, Arc<Mutex<ManagedConnection>>>>>,
    event_handler: Arc<RwLock<Option<EventHandler>>>,
    running: Arc<AtomicBool>,
    health_tasks: Mutex<Vec<JoinHandle<()>>>,
    concurrent_limit: usize,  // Default: 10
}
```

The `RwLock<HashMap<>>` pattern provides concurrent read access to the pool (multiple tool calls looking up their server) with serialized writes (adding/removing connections). Each `ManagedConnection` behind its own `Arc<Mutex<>>` means tool calls to different servers don't contend with each other.

The `concurrent_limit` of 10 prevents a runaway tool loop from overwhelming MCP servers with parallel requests. This is a backpressure mechanism — the connection manager acts as a rate limiter, queuing excess requests rather than firing them all simultaneously.

### Exponential Backoff Reconnection

When a connection fails, the manager attempts automatic reconnection with exponential backoff:

```rust
// connections.rs:29-42
const INITIAL_BACKOFF: Duration = Duration::from_millis(500);
const MAX_BACKOFF: Duration = Duration::from_secs(60);
const BACKOFF_MULTIPLIER: f64 = 2.0;
const MAX_RECONNECT_ATTEMPTS: u32 = 10;

// connections.rs:629-634
fn compute_backoff(attempt: u32) -> Duration {
    let delay_ms = (INITIAL_BACKOFF.as_millis() as f64)
        * BACKOFF_MULTIPLIER.powi(attempt as i32);
    let capped = delay_ms.min(MAX_BACKOFF.as_millis() as f64);
    Duration::from_millis(capped as u64)
}
```

The backoff schedule:

| Attempt | Delay | Cumulative Wait |
|---------|-------|----------------|
| 0 | 500ms | 0.5s |
| 1 | 1.0s | 1.5s |
| 2 | 2.0s | 3.5s |
| 3 | 4.0s | 7.5s |
| 4 | 8.0s | 15.5s |
| 5 | 16.0s | 31.5s |
| 6 | 32.0s | 63.5s |
| 7-9 | 60.0s (capped) | 3.5+ min |

After 10 failed attempts, the connection transitions to `Error` state and stops retrying. The cumulative wait of roughly 3.5 minutes gives transient failures plenty of time to resolve without hammering a struggling server.

The reconnection flow (`connections.rs:399-470`) checks the attempt count, computes the delay, sleeps, then tries a health check:

```rust
pub async fn reconnect(&self, name: &str) -> Result<()> {
    let attempt = guard.reconnect_attempt + 1;

    if attempt > MAX_RECONNECT_ATTEMPTS {
        guard.state = ConnectionState::Error;
        self.emit(ConnectionEvent::Error {
            server_name: name.to_string(),
            error: "max reconnection attempts exceeded".into(),
        });
        return Err(anyhow!("max reconnection attempts exceeded"));
    }

    let delay = compute_backoff(attempt - 1);
    tokio::time::sleep(delay).await;

    match guard.transport.health_check().await {
        Ok(()) => {
            guard.state = ConnectionState::Connected;
            guard.reconnect_attempt = 0;  // Reset on success
            self.emit(ConnectionEvent::Connected {
                server_name: name.to_string(),
            });
            Ok(())
        }
        Err(e) => {
            guard.reconnect_attempt = attempt;
            self.emit(ConnectionEvent::Reconnecting {
                server_name: name.to_string(),
                attempt,
            });
            Err(e)
        }
    }
}
```

The counter reset on success is important — if a connection recovers after 3 attempts, then fails again later, it gets a fresh 10 attempts. This prevents connections from being permanently abandoned after a single bad spell.

### Health Monitoring

The connection manager runs periodic health checks for every active connection:

```rust
// connections.rs:571-617 (simplified)
pub async fn start_health_monitor(&self, interval: Duration) {
    let connections = self.connections.clone();
    let running = self.running.clone();

    tokio::spawn(async move {
        let mut interval_timer = tokio::time::interval(interval);

        while running.load(Ordering::Relaxed) {
            interval_timer.tick().await;

            let conns = connections.read().await;
            for (name, conn) in conns.iter() {
                let guard = conn.lock().await;
                if guard.state != ConnectionState::Connected {
                    continue;  // Skip non-connected servers
                }

                match guard.transport.health_check().await {
                    Ok(()) => {
                        guard.consecutive_failures = 0;
                    }
                    Err(e) => {
                        guard.consecutive_failures += 1;
                        if guard.consecutive_failures >= 3 {
                            // Three strikes — trigger reconnection
                            drop(guard);
                            let _ = self.reconnect(name).await;
                        }
                    }
                }
            }
        }
    });
}
```

The three-consecutive-failures threshold prevents a single dropped packet or timeout from triggering reconnection. Network hiccups happen. The health monitor distinguishes between a momentary glitch (one or two failures) and a genuine outage (three consecutive failures).

The default health check interval is 30 seconds (`connections.rs:24`), meaning a dead server is detected within 90 seconds at worst (three checks at 30-second intervals). For the transport-level check interval of 15 seconds (`transports.rs:44`), detection happens within 45 seconds.

---

## 30.5 The MCP Client — Tying It Together

The client layer sits on top of transports and connection management, providing the MCP-specific protocol logic: the initialization handshake, tool discovery, tool invocation, and resource access.

### The Initialize Handshake

Every MCP connection begins with a three-step handshake:

```
Client                          Server
  │                               │
  ├── initialize ──────────────>  │   Step 1: Send capabilities
  │                               │
  │  <──── InitializeResult ────  │   Step 2: Receive server info
  │                               │
  ├── notifications/initialized → │   Step 3: Signal ready
  │                               │
  ├── tools/list ──────────────>  │   Step 4: Discover tools
  │  <──── [tool definitions] ──  │
  │                               │
  ├── resources/list ──────────>  │   Step 5: Discover resources
  │  <──── [resource list] ─────  │
  │                               │
  │    *** Connection Ready ***   │
```

The client implementation in `client.rs:129-182`:

```rust
async fn initialize(&mut self) -> Result<()> {
    let params = InitializeParams {
        protocol_version: PROTOCOL_VERSION.to_string(),  // "2024-11-05"
        capabilities: ClientCapabilities {
            roots: None,
            sampling: None,
        },
        client_info: ClientInfo {
            name: CLIENT_NAME.to_string(),    // "rcode"
            version: CLIENT_VERSION.to_string(),
        },
    };

    let init_result = tokio::time::timeout(
        INIT_TIMEOUT,    // 10 seconds — shorter than the 30s default
        self.send_request("initialize", Some(serde_json::to_value(&params)?)),
    )
    .await
    .map_err(|_| anyhow!("MCP initialize timed out for '{}'", self.server_name))??;

    // Send the `initialized` notification (no response expected)
    self.send_notification("notifications/initialized", None).await?;

    // Discover tools (best-effort)
    self.tools = self.list_tools_inner().await.unwrap_or_else(|e| {
        warn!("failed to list tools for '{}': {e}", self.server_name);
        Vec::new()
    });

    // Discover resources (many servers don't support this)
    self.resources = self.list_resources_inner().await.unwrap_or_default();

    info!(
        "MCP '{}' ready: {} tools, {} resources",
        self.server_name, self.tools.len(), self.resources.len(),
    );

    Ok(())
}
```

Three design decisions worth highlighting:

1. **Shorter timeout for initialization**: The 10-second `INIT_TIMEOUT` is stricter than the 30-second `REQUEST_TIMEOUT` because initialization should be fast. If a server can't handshake in 10 seconds, it's probably not going to work.

2. **Best-effort tool discovery**: If `list_tools` fails, the connection continues with an empty tool list rather than aborting. This accommodates servers that support resources but not tools (or vice versa).

3. **Notification ordering**: The `notifications/initialized` notification is sent before tool discovery. This matches the MCP spec — the server is only guaranteed to accept `tools/list` after receiving the initialized notification.

### Server Capabilities

The initialization response tells the client what the server supports:

```rust
// types.rs:1044-1058
pub struct ServerCapabilities {
    pub tools: Option<ToolsCapability>,       // Does the server offer tools?
    pub resources: Option<ResourcesCapability>, // Resources?
    pub prompts: Option<PromptsCapability>,    // Prompt templates?
    pub logging: Option<Value>,                // Logging support?
}

pub struct ToolsCapability {
    pub list_changed: bool,  // Can the tool list change at runtime?
}

pub struct ResourcesCapability {
    pub list_changed: bool,  // Can the resource list change at runtime?
    pub subscribe: bool,     // Does the server support subscriptions?
}
```

The `list_changed` flag is architecturally significant. If `true`, the client must be prepared for the server to send `notifications/tools/list_changed` at any time, requiring a refresh of the cached tool list. If `false`, the initial tool list is authoritative for the entire session.

### Tool Invocation

The `call_tool()` method at `client.rs:302-319` wraps a JSON-RPC request with MCP-specific semantics:

```rust
pub async fn call_tool(&self, name: &str, arguments: Value) -> Result<McpToolResult> {
    let params = serde_json::json!({
        "name": name,
        "arguments": arguments,
    });

    let resp = tokio::time::timeout(
        REQUEST_TIMEOUT,    // 30 seconds
        self.send_request("tools/call", Some(params)),
    )
    .await
    .map_err(|_| anyhow!(
        "MCP tools/call '{name}' timed out after {}s on '{}'",
        REQUEST_TIMEOUT.as_secs(), self.server_name,
    ))??;

    // Parse the result into McpToolResult
    // Handle error responses, missing results, malformed content
    // ...
}
```

The timeout here is the 30-second default. For long-running tools (database migrations, large file operations), servers can negotiate a longer timeout via the capabilities exchange — but 30 seconds is the safe default that prevents a hung server from blocking the entire agent.

### Connection Statistics

The client exposes per-server statistics for observability:

```rust
// client.rs:272-285
pub fn stats(&self) -> ServerStats {
    ServerStats {
        request_count: self.request_count.load(Ordering::Relaxed),
        error_count: self.error_count.load(Ordering::Relaxed),
        last_success: self.last_success.try_lock().ok().and_then(|g| *g),
        alive: self.is_alive(),
    }
}
```

The `Ordering::Relaxed` on atomic loads is intentional — these are approximate counters for display purposes, not synchronization primitives. Relaxed ordering avoids the memory fence overhead of `SeqCst` while still providing eventually-consistent values.

### Graceful Shutdown

```rust
// client.rs:186-197
pub async fn shutdown(&self) -> Result<()> {
    // Best-effort shutdown request — the server may already be dead.
    let _ = tokio::time::timeout(
        Duration::from_secs(2),
        self.send_request("shutdown", None),
    ).await;

    let mut child = self.child.lock().await;
    let _ = child.kill().await;
    Ok(())
}
```

The 2-second shutdown timeout is aggressive because this typically runs during application exit. If the server doesn't respond to `shutdown` in 2 seconds, we kill the child process. The `let _ = ` pattern means we don't care about errors — both the shutdown request and the kill are best-effort. The important thing is that we don't leave orphaned processes.

---

## 30.6 The Deep Client — Production Lifecycle

While `McpConnection` handles a single server connection, the `McpDeepClient` (`deep_client.rs`) manages the full production lifecycle: multiple servers, health monitoring with four-level status, output persistence, and configurable reconnection.

### Health Status Model

The deep client uses a richer health model than simple alive/dead:

```rust
// deep_client.rs:58-68
pub enum HealthStatus {
    Healthy,              // Responding normally
    Degraded(String),     // Responding but with issues
    Unhealthy(String),    // Not responding
    Unknown,              // Haven't checked yet
}

impl HealthStatus {
    pub fn is_usable(&self) -> bool {
        matches!(self, Self::Healthy | Self::Degraded(_))
    }
}
```

The `Degraded` state is the pragmatic middle ground. A server might be responding to health checks but with high latency, or returning errors on some requests but not others. Rather than marking it as fully unhealthy (which would trigger reconnection) or fully healthy (which hides the problem), `Degraded` lets the client route requests preferentially while keeping the connection alive.

### Per-Server Statistics

The deep client tracks detailed per-server metrics:

```rust
// deep_client.rs:108-128
pub struct ServerConnectionStats {
    pub server_id: String,
    pub connected: bool,
    pub request_count: u64,
    pub error_count: u64,
    pub avg_latency_ms: f64,
    pub last_success: Option<String>,   // ISO 8601 timestamp
    pub health: HealthStatus,
    pub reconnect_attempts: u32,
    pub uptime_secs: u64,
}
```

This powers the diagnostic output you see when running `/doctor` or inspecting MCP server status. Average latency helps identify servers that are technically functional but too slow. Reconnect attempts highlight flaky servers that keep dying and reviving. Uptime distinguishes between a freshly restarted server and one that's been stable for hours.

### Configurable Reconnection

The deep client makes reconnection behavior configurable rather than hardcoded:

```rust
// deep_client.rs:132-145
pub struct ReconnectConfig {
    pub max_retries: u32,           // Default: 10
    pub base_delay_ms: u64,         // Default: 500
    pub max_delay_ms: u64,          // Default: 60,000
    pub backoff_multiplier: f64,    // Default: 2.0
    pub auto_reconnect: bool,       // Default: true
}
```

This is important for enterprise deployments where MCP servers run behind load balancers with their own retry logic. A server behind an AWS ALB might benefit from shorter delays (the ALB handles failover), while a server on a developer's laptop needs longer delays (the developer might be restarting it).

### Output Persistence

Tool results from MCP servers are persisted to disk at `.rcode/mcp_outputs` (`deep_client.rs:53`). This serves two purposes:

1. **Debugging**: When a tool call returns unexpected results, the raw output is available for inspection without re-running the call.
2. **Large result handling**: MCP tool results can be large (database query results, file contents). Persisting to disk prevents them from consuming memory indefinitely, and the client can reference the file path rather than holding the entire result in memory.

---

## 30.7 Server Discovery and Configuration

The configuration layer determines which MCP servers exist, where they are, and how to connect to them. This is the bridge between what a user puts in their config files and the connection manager that brings servers to life.

### Configuration File Format

MCP servers are configured in `mcp.json` at two levels:

```json
{
  "servers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home"],
      "transport": "stdio",
      "enabled": true,
      "description": "File system access"
    },
    {
      "name": "web-api",
      "url": "http://localhost:3000",
      "transport": "http",
      "headers": { "Authorization": "Bearer ${API_TOKEN}" },
      "enabled": true
    },
    {
      "name": "realtime-monitor",
      "url": "http://localhost:9090/sse",
      "transport": "sse",
      "enabled": false
    }
  ],
  "defaults": {
    "request_timeout_secs": 30,
    "health_check_interval_secs": 15,
    "env": {
      "LOG_LEVEL": "info"
    }
  }
}
```

The `McpServerEntry` struct at `config.rs:68-103` maps directly to this JSON:

```rust
pub struct McpServerEntry {
    pub name: String,
    pub command: Option<String>,          // Required for stdio
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub transport: TransportType,          // Default: Stdio
    pub url: Option<String>,              // Required for HTTP/SSE
    pub port: Option<u16>,
    pub enabled: bool,                    // Default: true
    pub description: Option<String>,
    pub auth: Option<serde_json::Value>,  // Opaque auth config
    pub settings: Option<serde_json::Value>, // Server-specific settings
}
```

The `enabled` field defaults to `true` via a custom deserializer (`default_true()` at config.rs:105). This means every server in the config is auto-started unless explicitly disabled. The design philosophy is opt-out rather than opt-in — if you put a server in the config, you presumably want it running.

### Two-Level Config Merge

Configuration loads from two paths:

| Level | Path | Purpose |
|-------|------|---------|
| Global | `~/.rcode/mcp.json` | Servers available everywhere (personal tools) |
| Project | `.rcode/mcp.json` | Servers specific to this project (team tools) |

The `McpConfigLoader` at `config.rs:220-288` merges them with project-overrides-global semantics:

```rust
// config.rs:307-323
fn merge_configs(global: McpConfigFile, project: McpConfigFile) -> McpConfigFile {
    let mut merged_servers: HashMap<String, McpServerEntry> = HashMap::new();

    // Global servers go in first
    for server in global.servers {
        merged_servers.insert(server.name.clone(), server);
    }

    // Project servers override global by name
    for server in project.servers {
        merged_servers.insert(server.name.clone(), server);
    }

    let servers: Vec<McpServerEntry> = merged_servers.into_values().collect();
    let defaults = project.defaults.or(global.defaults);

    McpConfigFile { servers, defaults }
}
```

The merge strategy is simple: insert global servers into a HashMap, then insert project servers which overwrite any with the same name. The final server list is the union. This means a project can:

- **Add** servers by defining ones not in the global config
- **Override** global servers by using the same name with different settings
- **Disable** global servers by using the same name with `"enabled": false`

The defaults merge uses `or()` — project defaults win entirely if present, otherwise global defaults are used. There's no field-level merge of defaults. This is a deliberate simplification that avoids the complexity of deep-merging optional fields.

### Environment Variable Expansion

Server configs support `${VAR_NAME}` patterns that are expanded at load time:

```rust
// config.rs:328-344
fn expand_env_vars(server: &mut McpServerEntry) {
    if let Some(ref mut cmd) = server.command {
        *cmd = expand_env_string(cmd);
    }
    server.args = server.args.iter().map(|a| expand_env_string(a)).collect();

    let expanded_env: HashMap<String, String> = server
        .env.iter()
        .map(|(k, v)| (k.clone(), expand_env_string(v)))
        .collect();
    server.env = expanded_env;

    if let Some(ref mut url) = server.url {
        *url = expand_env_string(url);
    }
}
```

This enables configs like:

```json
{
  "name": "private-api",
  "url": "http://${MCP_HOST}:${MCP_PORT}",
  "env": { "API_KEY": "${PRIVATE_API_KEY}" }
}
```

The expansion happens in `load_expanded()` at config.rs:281, which is the primary entry point for production config loading. The `load_merged()` method returns unexpanded configs for validation and debugging purposes.

Missing environment variables expand to empty strings rather than causing errors. This is forgiving — a missing optional variable doesn't prevent the entire config from loading. The validation layer (next section) catches the downstream problem (e.g., an empty URL for an HTTP server).

### Configuration Validation

The validation system at `config.rs:375-437` checks each server entry for structural correctness:

```rust
pub fn validate_server_config(server: &McpServerEntry) -> Vec<ConfigValidationError> {
    let mut errors = Vec::new();

    // Name must not be empty
    if server.name.is_empty() {
        errors.push(ConfigValidationError {
            server_name: "(unnamed)".to_string(),
            message: "server name is required".to_string(),
        });
    }

    // Stdio: command must be specified
    if server.transport == TransportType::Stdio && server.command.is_none() {
        errors.push(ConfigValidationError {
            server_name: server.name.clone(),
            message: "stdio transport requires 'command'".to_string(),
        });
    }

    // HTTP/SSE: URL must be specified
    if matches!(server.transport, TransportType::Http | TransportType::Sse)
        && server.url.is_none()
    {
        errors.push(ConfigValidationError {
            server_name: server.name.clone(),
            message: format!("{} transport requires 'url'", server.transport),
        });
    }

    errors
}
```

Validation is non-blocking — it returns a list of errors rather than failing. The caller decides whether to skip invalid servers or warn the user. This matches the philosophy from Chapter 21: a partially correct configuration that lets the tool start is better than a tool that refuses to launch.

### Server Discovery

For workspaces with multiple projects, the discovery function scans the directory tree:

```rust
// config.rs:481-517
pub fn discover_configs(root: &Path, max_depth: usize) -> Vec<PathBuf> {
    // Scans up to MAX_DISCOVERY_DEPTH (3) levels deep
    // Looks for .rcode/mcp.json files
    // Skips: hidden dirs, node_modules, target/
}
```

The 3-level depth limit (`MAX_DISCOVERY_DEPTH` at config.rs:27) prevents runaway scanning in deeply nested monorepos. The skip list targets the common offenders — `node_modules` alone can contain thousands of directories that would never have MCP configs.

---

## 30.8 Server Scopes in Claude Code

While rcode uses a two-level hierarchy (global + project), Claude Code's TypeScript implementation supports seven server scopes that reflect its broader deployment model:

| Scope | Source | Lifetime | Control |
|-------|--------|----------|---------|
| **Local** | `.claude/settings.local.json` | Session | Personal, gitignored |
| **User** | `~/.config/claude/settings.json` | Permanent | Global personal |
| **Project** | `.claude/settings.json` | Permanent | Team-shared, committed |
| **Dynamic** | Runtime API / skill registration | Session | Programmatic |
| **Enterprise** | Organization policy (MDM) | Permanent | Admin-controlled |
| **Claude.ai** | Anthropic-managed | Permanent | Platform-provided |
| **Managed** | Remote config endpoint | Synced | Organization-managed |

The scope hierarchy determines both discovery order and override precedence:

1. **Enterprise/Managed** scopes override everything — an organization can force-enable compliance servers or block unapproved ones
2. **Dynamic** scopes (servers registered at runtime by skills or plugins) override static config
3. **Local** overrides Project (personal preferences win over team defaults)
4. **Project** overrides User (project-specific servers win over global ones)

This mirrors the settings cascade from Chapter 21. The same principle applies: specificity wins. An organization's compliance monitoring server can't be disabled by a project config, and a developer's personal config can't accidentally shadow a team-required server (unless the team config allows it).

### Scope-Specific Behaviors

Each scope has distinct security and lifecycle characteristics:

- **Local/User** servers trust the user completely — no permission prompts for stdio transport
- **Project** servers prompt on first use if they weren't previously approved (they come from committed files that could be modified by anyone with repo access)
- **Dynamic** servers inherit the permissions of the skill or plugin that registered them
- **Enterprise** servers bypass all permission prompts (they're organization-approved by definition)
- **Claude.ai** servers run in the cloud and can't access the local filesystem
- **Managed** servers are re-synced periodically from a remote endpoint, with HMAC signature verification (as described in Chapter 21) to prevent tampering

---

## 30.9 Channel Permissions

The channel system at `channels.rs` provides fine-grained access control for MCP server communication:

```rust
// channels.rs:14-21
pub enum ChannelPermission {
    Allow,       // Full access
    Deny,        // Blocked entirely
    ReadOnly,    // Can list/read but not call tools
    WriteOnly,   // Can call tools but not read resources
    Ask,         // Prompt the user before each request
}

// channels.rs:24-31
pub struct ChannelRule {
    pub server_pattern: String,       // Glob pattern matching server names
    pub channel_pattern: String,      // Glob pattern matching tool/resource names
    pub permission: ChannelPermission,
    pub priority: i32,                // Higher = takes precedence
    pub reason: Option<String>,       // Human-readable explanation
}
```

Channel rules work like firewall rules — they match server and tool name patterns, and the highest-priority matching rule wins. This enables policies like:

- "Allow all tools from the filesystem server" — `server_pattern: "filesystem", channel_pattern: "*", permission: Allow`
- "Block the delete tool from any server" — `server_pattern: "*", channel_pattern: "*delete*", permission: Deny`
- "Require confirmation for external API calls" — `server_pattern: "external-*", channel_pattern: "*", permission: Ask`

The `ReadOnly` and `WriteOnly` permissions are particularly useful for compliance. A resource-only server (documentation, reference data) should never invoke tools, and a tool-only server (code execution, database queries) shouldn't be able to exfiltrate data via resource reads.

---

## 30.10 Architecture Decisions

### Why JSON-RPC 2.0?

MCP could have used gRPC (binary, strongly typed), REST (ubiquitous), or a custom protocol. JSON-RPC was chosen because:

1. **LSP established the pattern**: Language servers already proved that JSON-RPC over stdio works reliably for developer tools. MCP servers are philosophically similar — external processes providing capabilities to an IDE-like host.
2. **Transport agnosticism**: JSON-RPC is a wire format, not a transport. The same message format works over stdin/stdout, HTTP, WebSocket, or SSE. gRPC mandates HTTP/2. REST mandates HTTP.
3. **Simplicity**: A JSON-RPC implementation is 200 lines of code. A gRPC implementation requires protobuf compilation, runtime libraries, and HTTP/2 framing.
4. **Debuggability**: JSON is human-readable. When an MCP connection fails, you can `cat` the log and read the actual messages. Binary protocols require specialized tools.

### Why Separate Transport and Connection Management?

The transport trait handles byte-level communication. The connection manager handles lifecycle. Merging them would create a God object that knows about both TCP sockets and exponential backoff. Separating them means:

- New transports don't need reconnection logic
- Reconnection strategy changes don't affect transport code
- The connection manager works identically for all transport types
- Testing can mock at either layer independently

### Why Permissive Defaults?

The config loader returns empty defaults for missing files rather than erroring. Tool discovery continues even if `list_tools` fails. Environment variable expansion uses empty strings for missing variables. The philosophy: **fail open, then validate**. Getting a partially working system running is more debuggable than getting a cryptic error about a missing config file before anything starts.

### Why Not WebSocket Everywhere?

WebSocket provides full-duplex communication, which seems ideal. But:

- **Stdio** is simpler for local servers and requires no network stack
- **HTTP** is simpler for stateless request/response patterns
- **SSE** provides server-push without the bidirectional complexity of WebSocket

WebSocket is available for cases that need it (low-latency bidirectional streams), but it's the heaviest transport option. Using the lightest transport that meets the requirements reduces failure modes and simplifies debugging.

---

## 30.11 Key Takeaways

1. **Trait-based transport abstraction scales**: The `Transport` trait with six methods accommodates everything from child process I/O to cloud proxies. Program against the trait, not the concrete type.

2. **Separate transport from lifecycle**: The transport moves bytes. The connection manager decides when and whether to reconnect. Merging them creates an unmaintainable monolith.

3. **Exponential backoff with cap and reset**: Start at 500ms, multiply by 2, cap at 60s, give up after 10 attempts. Reset the counter on success. This schedule handles everything from momentary network blips to extended outages.

4. **Three-strike health monitoring**: Don't reconnect on a single health check failure. Require three consecutive failures to filter out transient noise.

5. **Two-level config with project-overrides-global merge**: Global configs establish personal defaults. Project configs override by name. The union provides both portability (your personal servers travel with you) and specificity (project servers are available when you're in that project).

6. **Environment variable expansion at load time**: `${VAR_NAME}` patterns in configs keep secrets out of committed files. Missing variables expand to empty strings — validate after expansion, not during.

7. **Best-effort initialization**: If tool discovery fails, continue with zero tools rather than aborting. A partially connected server is more useful than no server at all.

8. **Event-driven state changes**: Connection events (Connected, Disconnected, Reconnecting) decouple the connection manager from its consumers. The UI, telemetry, and status bar all subscribe independently.

In the next chapter, we'll explore MCP authentication and security — how OAuth tokens are managed, how PKCE prevents authorization code interception, and how SSRF guards prevent MCP servers from accessing internal network resources.
