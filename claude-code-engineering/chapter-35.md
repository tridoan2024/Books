# Chapter 35: The Bridge — Remote Sessions

A CLI agent that only runs on the machine in front of you is a tool. A CLI agent that runs anywhere — on a headless server, inside a container, across a fleet of development machines — is infrastructure. The bridge is the layer that makes that transformation possible.

In the preceding chapters we built a complete local agent: it reads prompts, invokes tools, streams responses, manages context, and persists sessions. But local operation imposes constraints that matter in practice. You cannot SSH into a remote build server and get a full interactive Claude Code session without forwarding your terminal. An IDE extension running in VS Code cannot spawn a child process that is also a full agent conversation without a protocol for message exchange. A CI/CD pipeline cannot spin up thirty parallel agent sessions to review every file in a monorepo without a session management layer that handles concurrency, authentication, and resource limits.

The bridge solves all three problems with a single architecture. It is a daemon that exposes the agent over two transports — HTTP REST for request/response operations and WebSocket for real-time streaming — manages session lifecycles with configurable timeouts, authenticates connections using HMAC-SHA256 tokens, and enforces concurrency limits to prevent runaway resource consumption. The implementation spans nine modules and roughly 9,600 lines of Rust, making it one of the largest subsystems in the codebase. This chapter dissects every piece.

---

## 35.1 Why a Bridge Exists

The simplest architecture for a CLI agent is a process that reads from stdin and writes to stdout. That is how the REPL works, and it is sufficient for interactive terminal use. But three forces push the architecture toward a network-accessible daemon.

**IDE integration.** VS Code, Cursor, and JetBrains all need to communicate with the agent programmatically. They cannot use a raw terminal — they need structured JSON messages with typed fields for tool calls, streaming deltas, diagnostic forwarding, and file synchronization. The REPL bridge (`repl_bridge.rs`) provides this over stdin/stdout using a Content-Length framed protocol inspired by the Language Server Protocol. But stdin/stdout ties the agent to the editor's child process lifecycle. If the editor crashes, the agent dies. If the user wants to keep a session running across editor restarts, they need a daemon.

**Remote execution.** When the agent runs on a remote server — inside a Docker container, on a cloud VM, behind a bastion host — the user's local terminal or IDE needs to reach it over the network. The bridge API (`bridge_api.rs`) exposes a REST interface on `127.0.0.1:19876` by default, with optional TLS, that lets any HTTP client create sessions, send messages, and poll for output.

**Multi-session concurrency.** A single user might want parallel sessions for different tasks. A team CI system might need dozens of concurrent sessions reviewing PRs. The session manager (`session_manager.rs`) and remote session pool (`remote_session.rs`) provide the concurrency infrastructure: lifecycle state machines, capacity tracking, garbage collection, and session pooling with pre-warming.

Together these modules form a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer                            │
│  Terminal │ VS Code │ Cursor │ IntelliJ │ HTTP Client │ CI  │
└─────────┬──────────┬────────┬──────────┬────────────┬───────┘
          │          │        │          │            │
          ▼          ▼        ▼          ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Transport Layer                            │
│  stdin/stdout (REPL)  │  HTTP REST  │  WebSocket (real-time) │
└─────────┬─────────────┴──────┬──────┴──────────┬────────────┘
          │                    │                  │
          ▼                    ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Protocol Layer                             │
│  Content-Length framing │ JSON-RPC 2.0 │ Binary RCBM framing │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   Session Management                         │
│  SessionManager  │  RemoteSessionPool  │  BridgeApi          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Agent SDK Layer                             │
│  SdkSession  │  SdkMessage  │  Permission  │  Hook Events   │
└─────────────────────────────────────────────────────────────┘
```

Each layer knows only about its immediate neighbors. The transport layer does not know whether a message is a tool call or a heartbeat. The session manager does not know which transport delivered a message. This separation is what allows the same session to be accessed from an IDE over stdin/stdout and from a web UI over HTTP simultaneously.

---

## 35.2 The Module Map

Before diving into individual modules, here is what each file in `src/bridge/` does and how they relate:

| Module | Lines | Purpose |
|--------|-------|---------|
| `mod.rs` | 120 | Shared constants, `BridgeError` enum, protocol version |
| `repl_bridge.rs` | 1,765 | IDE bridge protocol: Content-Length framing, session multiplexing, file sync |
| `bridge_api.rs` | 983 | HTTP REST API: session CRUD, message send/receive, health check |
| `remote_core.rs` | 1,087 | WebSocket server: HMAC-SHA256 auth, heartbeat monitoring, connection handling |
| `remote_session.rs` | 1,142 | Session pool: pre-warming, acquire/release, upstream proxy relay |
| `session_manager.rs` | 1,155 | Lifecycle state machine: create/destroy, GC, direct connect, proxy relay |
| `agent_sdk.rs` | 1,365 | SDK wire protocol: NDJSON messages, permission model, hook events, cost tracking |
| `ide_bridge.rs` | 1,089 | IDE integration: text edits, diagnostics, cursor/selection sync, JSON-RPC |
| `messaging.rs` | 908 | Binary wire format: RCBM framing, deflate compression, SHA-256 checksums |

The dependency graph flows downward: `bridge_api` and `remote_core` import from `mod.rs`. `session_manager` imports from `remote_core`. `messaging` imports from `remote_core`. `agent_sdk` is largely standalone. `ide_bridge` is standalone. `repl_bridge` imports from `mod.rs`.

---

## 35.3 The REPL Bridge — IDE Protocol

The REPL bridge is the oldest transport in the system. It predates the HTTP API and WebSocket server. Its design reflects a specific constraint: the IDE spawns the agent as a child process and communicates over the process's stdin/stdout. There is no TCP connection, no DNS resolution, no TLS handshake — just pipes.

### Message Framing

The protocol uses Content-Length framing, identical to LSP:

```
Content-Length: 142\r\n
\r\n
{"kind":"request","id":"1","method":"message/send","params":{"content":"hello"}}
```

The `frame_message` function in `repl_bridge.rs` serializes a `BridgeMessage` to JSON, measures the byte length, and prepends the header:

```rust
pub fn frame_message(msg: &BridgeMessage) -> Result<Vec<u8>, BridgeError> {
    let body = serde_json::to_string(msg)?;
    if body.len() > MAX_PAYLOAD_SIZE {
        return Err(BridgeError::PayloadTooLarge {
            size: body.len(),
            max: MAX_PAYLOAD_SIZE,
        });
    }
    Ok(format!("Content-Length: {}\r\n\r\n{}", body.len(), body)
        .into_bytes())
}
```

The maximum payload size is 8 MiB, defined in `mod.rs`. This is not arbitrary — it is large enough to carry the full content of a large source file in a tool result, but small enough to prevent a misbehaving client from sending a multi-gigabyte payload that exhausts memory.

### Message Types

Every bridge message has a `kind` field that determines its role in the protocol:

```rust
pub enum MessageKind {
    Request,       // Client → server, expects a response
    Response,      // Server → client, paired with a request ID
    Notification,  // One-way, no response
    Event,         // Streaming data, no response
}
```

This four-type taxonomy mirrors JSON-RPC 2.0, which is not a coincidence — the IDE bridge module (`ide_bridge.rs`) speaks actual JSON-RPC while the REPL bridge uses a simplified variant. The distinction matters for flow control: requests block the sender until a response arrives, while notifications and events are fire-and-forget.

A `BridgeMessage` includes structural validation:

```rust
pub fn validate(&self) -> Result<(), BridgeError> {
    match self.kind {
        MessageKind::Request => {
            if self.id.is_none() {
                return Err(BridgeError::InvalidMessage(
                    "request must have an id".into(),
                ));
            }
            if self.method.is_none() {
                return Err(BridgeError::InvalidMessage(
                    "request must have a method".into(),
                ));
            }
        }
        // ... similar for Response, Notification, Event
    }
    Ok(())
}
```

This validation runs on every inbound message before it reaches any handler. Messages that fail validation are rejected with a structured error response, not silently dropped. This is critical for debugging: a client sending malformed messages gets immediate feedback rather than mysterious silence.

### Session Multiplexing

The REPL bridge supports multiple concurrent sessions over a single stdin/stdout connection. Each message carries an optional `session_id` field. When present, the server routes the message to the corresponding `BridgeSession`. When absent, it routes to the default session created during the handshake.

```rust
pub struct BridgeSession {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub last_active: DateTime<Utc>,
    pub model: String,
    pub turn_count: u32,
    pub total_cost: f64,
    config: SessionConfig,
    messages: Vec<ConversationMessage>,
    open_files: HashMap<String, String>,
    event_tx: Option<mpsc::UnboundedSender<StreamEvent>>,
}
```

Each session maintains its own conversation history, cost accumulator, and set of open files. The `open_files` map is populated by file sync events from the IDE — when the user opens, edits, or closes a file, the IDE sends a `file/sync` notification that updates the map. This means the agent always knows which files the user is currently looking at, enabling context-aware assistance without the user explicitly saying "look at this file."

### The Handshake

Every connection starts with a handshake that negotiates capabilities:

```rust
pub struct HandshakeRequest {
    pub protocol_version: String,
    pub client_name: String,
    pub capabilities: ClientCapabilities,
}

pub struct ClientCapabilities {
    pub streaming: bool,
    pub tool_approval: bool,
    pub file_sync: bool,
    pub multi_session: bool,
}
```

The server responds with its own capabilities and creates a default session:

```rust
pub struct HandshakeResponse {
    pub protocol_version: String,
    pub server_name: String,
    pub capabilities: ServerCapabilities,
    pub session_id: String,
}
```

Version mismatches produce a warning but do not block the handshake — the protocol is designed for forward compatibility. A newer client can talk to an older server by degrading gracefully when unsupported methods are called.

### Streaming Events

When the agent is processing a prompt, it emits streaming events that the IDE renders in real-time:

```rust
pub enum StreamEvent {
    TextDelta { text: String },
    ToolStart { tool_name: String, tool_id: String },
    ToolEnd { tool_id: String, result: Value, duration_ms: u64 },
    Thinking { text: String },
    TurnComplete { usage: Value },
    Error { message: String },
    PermissionNeeded { tool: String, description: String, request_id: String },
}
```

Each session has an optional `event_tx` channel. When a client subscribes to streaming events (via the handshake's `streaming: true` capability), the bridge creates the channel and forwards events as they arrive. The `PermissionNeeded` variant is particularly interesting — it suspends agent execution until the IDE presents a permission prompt and the user responds. As discussed in Chapter 15, this is how the permission system delegates decisions to the UI layer.

### The BridgeServer

The `BridgeServer` struct ties it all together. It holds the session map, enforces the session limit (default 16, configurable), and routes incoming messages to handlers:

```rust
async fn route_request(&self, msg: BridgeMessage) -> Result<BridgeMessage> {
    let method = msg.method.as_deref().unwrap_or("");
    match method {
        "handshake"      => self.handle_handshake(msg.params).await,
        "session/create"  => self.handle_session_create(msg.params).await,
        "session/list"    => self.handle_session_list().await,
        "session/delete"  => self.handle_session_delete(msg.params).await,
        "session/resume"  => self.handle_session_resume(msg.params).await,
        "tool/execute"    => self.handle_tool_execute(...).await,
        "config/update"   => self.handle_config_update(...).await,
        "heartbeat"       => Ok(self.handle_heartbeat()),
        "message/send"    => self.handle_message_send(...).await,
        _ => Ok(json!({"error": format!("unknown method: {method}")})),
    }
}
```

The method routing is a flat `match` statement, not a plugin registry. This is deliberate — the protocol is small (9 methods) and stable. Adding a method requires changing this match arm and deploying a new server version, which is the right level of ceremony for a protocol change.

---

## 35.4 The HTTP REST API

The REPL bridge works when the agent is a child process of the IDE. For remote access, we need an HTTP server. The bridge API (`bridge_api.rs`) provides a RESTful interface with seven endpoints:

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/v1/health` | No | Server liveness and metrics |
| GET | `/v1/sessions` | Yes | List all sessions |
| GET | `/v1/sessions/:id` | Yes | Get session details |
| POST | `/v1/sessions` | Yes | Create a new session |
| DELETE | `/v1/sessions/:id` | Yes | Delete a session |
| POST | `/v1/sessions/:id/messages` | Yes | Send a message |
| GET | `/v1/sessions/:id/output` | Yes | Poll for output |

### Configuration

```rust
pub struct BridgeApiConfig {
    pub listen_addr: String,           // "127.0.0.1:19876"
    pub auth_token: Option<String>,    // Bearer token
    pub max_sessions: usize,           // Default 16, max 256
    pub cors_enabled: bool,            // Default true
    pub allowed_origins: Vec<String>,  // ["http://localhost", "http://127.0.0.1"]
    pub tls_cert_path: Option<String>,
    pub tls_key_path: Option<String>,
}
```

The default listen address binds to `127.0.0.1` only — not `0.0.0.0`. This is a security decision. A bridge accidentally exposed to the network with no auth token would let anyone on the network create sessions and execute tools on the host. Binding to localhost means you must explicitly opt into network exposure via configuration or a reverse proxy.

The validation function enforces invariants:

```rust
pub fn validate(&self) -> Result<()> {
    if self.listen_addr.is_empty() { bail!("listen_addr cannot be empty"); }
    if self.max_sessions == 0 { bail!("max_sessions must be > 0"); }
    if self.max_sessions > 256 { bail!("max_sessions too large (max 256)"); }
    // Parse and validate host:port format
    let parts: Vec<&str> = self.listen_addr.split(':').collect();
    if parts.len() != 2 { bail!("listen_addr must be host:port"); }
    if parts[1].parse::<u16>().is_err() { bail!("listen_addr port is not valid"); }
    Ok(())
}
```

The 256-session hard cap is a safety rail. Each session holds conversation history, an output buffer (up to 10,000 lines), and associated metadata. At 256 sessions, the bridge might consume several hundred megabytes of RAM. The cap prevents a runaway client from exhausting server memory.

### Authentication

Authentication is token-based via the `X-RCode-Token` header:

```rust
fn authenticate(api: &BridgeApi, token: Option<&str>) -> bool {
    match &api.auth_token {
        None => true,        // No auth configured = open
        Some(expected) => token == Some(expected.as_str()),
    }
}
```

When no auth token is configured, all endpoints are open. This is the development-mode default. For production use, the operator sets `auth_token` in the configuration and the bridge rejects unauthenticated requests with a `401` response.

The health check endpoint is deliberately exempted from authentication:

```rust
pub fn requires_auth(&self) -> bool {
    !matches!(self, Self::HealthCheck)
}
```

This allows load balancers and monitoring systems to probe the bridge without credentials.

### Session Eviction

When the session limit is reached and a new session is requested, the bridge does not simply reject the request. It attempts to evict the oldest idle session:

```rust
pub fn create_remote_session(api: &mut BridgeApi, config: &SessionConfig) -> String {
    if api.sessions.len() >= api.config.max_sessions {
        let oldest_idle = api.sessions.iter()
            .filter(|(_, s)| s.info.status == SessionStatus::Idle || s.is_expired())
            .min_by_key(|(_, s)| s.info.last_activity)
            .map(|(id, _)| id.clone());

        if let Some(evict_id) = oldest_idle {
            info!("evicting idle session '{evict_id}' to make room");
            api.sessions.remove(&evict_id);
        } else {
            warn!("max sessions reached, cannot create new session");
            return String::new();
        }
    }
    // ... create and insert new session
}
```

The eviction policy is LRU among idle sessions. Active sessions — those currently processing a prompt — are never evicted. If all sessions are active and the limit is reached, the creation fails. This protects against a common failure mode: a CI system that spawns sessions but forgets to clean them up eventually fills the pool, and the eviction policy reclaims abandoned sessions automatically.

### Output Buffering

Each session maintains a bounded output buffer:

```rust
fn add_output(&mut self, kind: OutputKind, content: String) {
    let index = self.output_buffer.len();
    self.output_buffer.push(OutputLine { index, timestamp, kind, content });
    if self.output_buffer.len() > MAX_OUTPUT_BUFFER {
        self.output_buffer.drain(..MAX_OUTPUT_BUFFER / 2);
    }
}
```

The buffer holds up to 10,000 lines. When it overflows, the oldest half is discarded. The `GET /sessions/:id/output` endpoint accepts a `since` parameter that returns only lines with an index greater than the given value, enabling efficient polling — the client remembers the last index it saw and only fetches new output.

---

## 35.5 The WebSocket Transport

HTTP polling is functional but wasteful for real-time interaction. The remote core (`remote_core.rs`) provides a WebSocket server for bidirectional streaming.

### Architecture

The WebSocket server follows a standard Tokio pattern: a TCP listener accepts connections, upgrades them to WebSocket, and spawns per-connection read/write tasks:

```rust
pub async fn start_bridge(bridge: Arc<RemoteBridge>) -> Result<ShutdownHandle> {
    let listener = TcpListener::bind(addr).await?;
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                accept_result = listener.accept() => {
                    match accept_result {
                        Ok((stream, peer_addr)) => {
                            let b = Arc::clone(&bridge);
                            tokio::spawn(async move {
                                handle_connection(b, stream, peer_addr).await
                            });
                        }
                        Err(e) => error!("accept error: {e}"),
                    }
                }
                _ = &mut shutdown_rx => {
                    info!("remote bridge shutting down");
                    break;
                }
            }
        }
    });

    // Start heartbeat monitor
    tokio::spawn(monitor_heartbeats(Arc::clone(&bridge)));

    Ok(ShutdownHandle { tx: shutdown_tx })
}
```

The `ShutdownHandle` pattern is worth noting. The caller receives a handle that, when dropped or explicitly triggered, sends a signal through the `oneshot` channel that breaks the accept loop. This provides clean shutdown without the bridge needing to know how it is being managed — whether from a signal handler, a test harness, or a higher-level orchestrator.

### Connection Handling

Each connection goes through a sequence: capacity check, WebSocket upgrade, session registration, then split into read/write tasks:

```rust
async fn handle_connection(
    bridge: Arc<RemoteBridge>,
    stream: TcpStream,
    peer_addr: SocketAddr,
) -> Result<()> {
    // Reject if at capacity
    {
        let sessions = bridge.sessions.read().await;
        if sessions.len() >= bridge.config.max_sessions {
            return Err(BridgeError::SessionLimitReached(bridge.config.max_sessions).into());
        }
    }

    // Upgrade to WebSocket
    let ws_stream = tokio_tungstenite::accept_async(stream).await?;
    let (mut ws_write, mut ws_read) = ws_stream.split();

    // Create per-connection channel
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let session = RemoteSession::new(tx, peer_addr, SpawnMode::default());
    // ... register session, spawn read/write tasks
}
```

The capacity check happens before the WebSocket handshake, not after. This is intentional — if the server is at capacity, there is no point completing the WebSocket upgrade, which requires reading HTTP headers and sending a response. Rejecting early saves both sides the overhead.

### HMAC-SHA256 Authentication

The WebSocket transport uses HMAC-SHA256 token authentication rather than the simple bearer token used by the REST API. This is a stronger authentication model — the token is bound to the session ID, so a stolen token cannot be reused for a different session:

```rust
pub fn authenticate_session(secret: &str, session_id: &str, token: &str) -> bool {
    if secret.is_empty() || token.is_empty() {
        return false;
    }
    let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(session_id.as_bytes());
    let Ok(token_bytes) = hex::decode(token) else {
        return false;
    };
    mac.verify_slice(&token_bytes).is_ok()
}
```

The `mac.verify_slice()` call performs constant-time comparison, which prevents timing attacks. An attacker who can measure response times cannot determine how many bytes of the token are correct by observing how long verification takes.

Token generation is symmetric:

```rust
pub fn generate_session_token(secret: &str, session_id: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC accepts any key length");
    mac.update(session_id.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}
```

The flow: when a session is created, the server generates a token and gives it to the authorized client. The client presents this token when connecting over WebSocket. The server verifies it using the shared secret. If the secret is never transmitted over the wire — only the derived token is — then compromising a single token does not reveal the secret or enable forging tokens for other sessions.

### Heartbeat Monitoring

The bridge runs a background task that periodically checks all sessions for stale heartbeats:

```rust
async fn monitor_heartbeats(bridge: Arc<RemoteBridge>) {
    let check_interval = bridge.config.heartbeat_interval() / 2;
    let timeout = bridge.config.session_timeout();

    loop {
        tokio::time::sleep(check_interval).await;
        let mut sessions = bridge.sessions.write().await;
        let mut timed_out = Vec::new();

        for (id, session) in sessions.iter() {
            if session.is_timed_out(timeout) {
                timed_out.push(id.clone());
            }
        }

        for id in &timed_out {
            if let Some(session) = sessions.get(id) {
                let _ = session.send(&BridgeMessage::status(SessionStatus::Disconnected));
            }
            sessions.remove(id);
        }
    }
}
```

The check interval is half the heartbeat interval (default: 7.5 seconds when heartbeat is 15 seconds). This ensures that a missed heartbeat is detected within one heartbeat period. The session timeout (default: 60 seconds) allows for four consecutive missed heartbeats before disconnection — enough to survive a brief network hiccup or laptop sleep event.

When a session times out, the bridge sends a `Disconnected` status message before removing it. This is a best-effort notification — if the connection is already dead, the send will fail silently. But if the connection is merely slow (not dead), the client receives a clean disconnection signal rather than an unexplained silence.

### Spawn Modes

The WebSocket server supports three spawn modes that control how agent sessions map to connections:

```rust
pub enum SpawnMode {
    Single,    // One agent session shared by all connections
    Multi,     // Each connection gets its own session (default)
    OnDemand,  // Sessions created only when a prompt arrives
}
```

**Single** mode is for scenarios where multiple UIs (say, a terminal and a web dashboard) need to observe and interact with the same agent session. Both connections see the same conversation history and tool output.

**Multi** mode (the default) isolates each connection. This is what you want for a multi-user server where each user should have their own context and permissions.

**OnDemand** mode delays session creation until the first prompt arrives. This saves resources when connections are opened speculatively — for example, an IDE that opens a WebSocket at startup but does not send a prompt until the user invokes the agent.

---

## 35.6 The Session Manager — Lifecycle State Machine

The session manager (`session_manager.rs`) provides a higher-level abstraction over raw sessions. While the REPL bridge and WebSocket server deal with transport-level sessions (connections, channels, heartbeats), the session manager deals with lifecycle-level sessions (state transitions, capacity tracking, garbage collection).

### The State Machine

A managed session transitions through a well-defined set of states:

```
Created → Connecting → Active → Processing → Idle → Disconnected
                        ↑          ↓      ↑     │
                        └──────────┘      │     │
                                          └─────┘
```

The `validate_transition` function encodes every legal edge:

```rust
pub fn validate_transition(from: SessionState, to: SessionState) -> bool {
    matches!(
        (from, to),
        (Created, Connecting)
        | (Connecting, Active)
        | (Active, Processing)
        | (Active, Idle)
        | (Processing, Active)
        | (Processing, Idle)
        | (Idle, Active)
        | (Idle, Processing)
        | (Created, Disconnected)
        | (Connecting, Disconnected)
        | (Active, Disconnected)
        | (Processing, Disconnected)
        | (Idle, Disconnected)
    )
}
```

Several design decisions are encoded in these transitions:

1. **You cannot skip `Connecting`.** Going from `Created` directly to `Active` is illegal. This forces the transport handshake to complete before the session accepts prompts.
2. **`Disconnected` is terminal.** Once a session enters `Disconnected`, no further transitions are possible. The session must be destroyed and a new one created.
3. **Bidirectional Processing/Idle.** A session can go from `Idle` to `Processing` (new prompt arrives) and from `Processing` to `Idle` (response complete). It can also go from `Idle` to `Active` and from `Processing` to `Active`, allowing intermediate states during complex operations.
4. **Any non-terminal state can disconnect.** Network failures can happen at any time. The state machine does not try to enforce a "graceful" path to disconnection.

### Session Configuration

Each managed session carries a configuration that defines its operational bounds:

```rust
pub struct SessionConfig {
    pub model: String,
    pub tools_allowed: Vec<String>,
    pub permissions_mode: String,      // "auto", "ask", or "deny"
    pub working_dir: Option<PathBuf>,
    pub env_vars: HashMap<String, String>,
    pub timeout_secs: u64,             // Default 3600 (1 hour)
    pub spawn_mode: SpawnMode,
    pub max_turns: Option<u32>,
    pub label: Option<String>,
}
```

The `permissions_mode` field determines how the session handles tool permission requests — as discussed in Chapter 15. The `max_turns` field provides a hard limit on conversation turns, preventing a runaway agent from generating unbounded output and cost. The `timeout_secs` field (default: 1 hour, the outline mentions 24 hours for some configurations) controls when the session auto-terminates from inactivity.

Validation catches configuration errors before a session is created:

```rust
pub fn validate(&self) -> Result<()> {
    let valid_modes = ["auto", "ask", "deny"];
    if !valid_modes.contains(&self.permissions_mode.as_str()) {
        bail!("invalid permissions_mode...");
    }
    if let Some(dir) = &self.working_dir {
        if !dir.as_os_str().is_empty() && !dir.is_absolute() {
            bail!("working_dir must be an absolute path: {}", dir.display());
        }
    }
    Ok(())
}
```

The absolute-path requirement for `working_dir` prevents a subtle bug: if the bridge daemon's working directory changes (e.g., due to a `cd` in a hook), a relative path would resolve to the wrong location. Absolute paths are always unambiguous.

### Garbage Collection

The session manager runs a periodic garbage collector that removes sessions matching three criteria:

```rust
pub async fn garbage_collect(manager: &SessionManager) -> Vec<String> {
    let to_remove: Vec<String> = sessions.iter()
        .filter_map(|(id, session)| {
            if session.state.is_terminal() { return Some(id.clone()); }
            if session.idle_duration() > manager.gc_idle_timeout { return Some(id.clone()); }
            if session.is_expired() { return Some(id.clone()); }
            if session.is_turn_limited() { return Some(id.clone()); }
            None
        })
        .collect();
    // ... remove and notify
}
```

1. **Terminal sessions** — already disconnected, just occupying memory.
2. **Idle sessions** — no activity for longer than `gc_idle_timeout` (default 30 minutes).
3. **Expired sessions** — exceeded their configured `timeout_secs`.
4. **Turn-limited sessions** — exceeded their configured `max_turns`.

The GC sweep runs every 60 seconds by default. Before removing a session, it sends a `Disconnected` status message so the client knows the session was cleaned up rather than lost to a bug.

### Direct Connect and Proxy Relay

The session manager supports two network topologies beyond the basic client-server model.

**Direct connect** creates a session that represents a connection to another agent instance:

```rust
pub async fn direct_connect(
    manager: &SessionManager,
    addr: &str,
    token: &str,
) -> Result<String> {
    let config = SessionConfig {
        label: Some(format!("direct:{addr}")),
        ..Default::default()
    };
    let id = create_session(manager, config).await?;
    // Transition to Connecting, validate token, store remote addr
    Ok(id)
}
```

This enables agent-to-agent communication: one instance can delegate a subtask to another instance running on a different machine.

**Proxy relay** forwards messages through an intermediary:

```rust
pub async fn proxy_relay(
    manager: &SessionManager,
    upstream_id: &str,
    msg: BridgeMessage,
) -> Result<()> {
    let session = sessions.get(upstream_id)?;
    if session.state.is_terminal() {
        bail!("upstream session is disconnected");
    }
    session.send_message(&msg)?;
    Ok(())
}
```

This is used when a bridge instance acts as a relay between two endpoints that cannot reach each other directly — for example, an IDE behind a corporate firewall connecting to an agent on a cloud server through an authentication gateway.

---

## 35.7 The Session Pool — Pre-warming and Reuse

Creating a new session is not free. It involves allocating memory, initializing conversation state, and potentially connecting to an upstream agent backend. For latency-sensitive scenarios — like an IDE extension that needs a session immediately when the user types a command — this startup cost matters.

The remote session pool (`remote_session.rs`) solves this by pre-creating idle sessions and reusing them:

```
warm_pool(4)  →  [idle] [idle] [idle] [idle]

acquire()     →  [ACTIVE] [idle] [idle] [idle]    (pool hit)
acquire()     →  [ACTIVE] [ACTIVE] [idle] [idle]  (pool hit)
release(s1)   →  [idle] [ACTIVE] [idle] [idle]    (returned to pool)
acquire()     →  [ACTIVE] [ACTIVE] [idle] [idle]  (pool hit, reuses s1)
```

### Pool Operations

The pool exposes four primary operations:

**Warm** — pre-create sessions:

```rust
pub async fn warm_pool(
    pool: &RemoteSessionPool,
    count: usize,
    config: Option<SessionConfig>,
) -> Result<usize> {
    let capacity = pool.max_size.saturating_sub(current_size);
    let to_create = count.min(capacity);
    for _ in 0..to_create {
        let mut session = PoolSession::new(id, config.clone());
        session.state = PoolSessionState::Idle;
        sessions.insert(id, session);
    }
    Ok(created)
}
```

**Acquire** — get a session from the pool:

```rust
pub async fn acquire_session(pool: &RemoteSessionPool) -> Result<String> {
    // Try pool hit (idle session, LRU ordering)
    let idle_id = sessions.values()
        .filter(|s| s.state == PoolSessionState::Idle && !s.should_evict())
        .min_by_key(|s| s.last_used)
        .map(|s| s.id.clone());

    if let Some(id) = idle_id {
        session.state = PoolSessionState::Active;
        session.use_count += 1;
        metrics.pool_hits += 1;
        return Ok(id);
    }

    // Pool miss — create on demand
    if sessions.len() < pool.max_size {
        let mut session = PoolSession::new(id, default_config);
        session.state = PoolSessionState::Active;
        metrics.pool_misses += 1;
        return Ok(id);
    }

    // Exhausted
    metrics.acquisition_failures += 1;
    bail!("Session pool exhausted");
}
```

**Release** — return a session to the pool:

```rust
pub async fn release_session(pool: &RemoteSessionPool, id: &str) -> Result<()> {
    if session.is_age_expired() {
        // Too old — destroy instead of returning
        session.state = PoolSessionState::Destroyed;
        sessions.remove(id);
        metrics.total_destroyed += 1;
        return Ok(());
    }
    session.state = PoolSessionState::Idle;
    session.last_used = Instant::now();
    Ok(())
}
```

**Evict** — remove expired sessions:

```rust
pub async fn evict_expired(pool: &RemoteSessionPool) -> usize {
    let to_evict: Vec<String> = sessions.values()
        .filter(|s| s.should_evict())
        .map(|s| s.id.clone())
        .collect();
    for id in &to_evict {
        sessions.remove(id);
        metrics.total_destroyed += 1;
    }
    count
}
```

### Eviction Policy

A pooled session is eligible for eviction if either of two conditions is met:

```rust
pub fn should_evict(&self) -> bool {
    self.is_idle_expired() || self.is_age_expired()
}
```

**Idle expiry** (default: 300 seconds) — the session has been sitting idle too long. This prevents the pool from holding sessions that nobody wants.

**Age expiry** (default: 3,600 seconds) — the session is too old regardless of use. This prevents long-lived sessions from accumulating stale state. When a session is released but has exceeded its maximum age, it is destroyed rather than returned to the pool.

### Metrics

The pool tracks comprehensive metrics for operational visibility:

```rust
pub struct PoolMetrics {
    pub active: usize,
    pub idle: usize,
    pub warming: usize,
    pub total_created: u64,
    pub total_destroyed: u64,
    pub pool_hits: u64,
    pub pool_misses: u64,
    pub acquisition_failures: u64,
    pub avg_session_age_secs: f64,
    pub avg_use_count: f64,
}
```

The hit/miss ratio tells you whether the pool size is adequate. A high miss rate means sessions are being created on demand rather than reused — you should increase the warm pool size. A high `acquisition_failures` count means the pool is undersized for the workload.

### Upstream Proxy

The pool also supports relaying messages through an upstream proxy for scenarios where the bridge cannot directly reach the agent backend:

```rust
pub async fn upstream_proxy(
    target: &str,
    msg: &BridgeMessage,
    config: &UpstreamProxyConfig,
) -> Result<ProxyResponse> {
    let payload = serde_json::to_string(msg)?;
    let mut last_error = None;
    for attempt in 0..=config.retry_count {
        if attempt > 0 {
            let backoff = RETRY_BACKOFF_BASE * 2u32.pow(attempt - 1);
            tokio::time::sleep(backoff).await;
        }
        // ... send request, check response
        if proxy_resp.is_success() || !proxy_resp.is_retryable() {
            return Ok(proxy_resp);
        }
    }
    bail!("Proxy relay failed after {} attempts", config.retry_count + 1);
}
```

The retry logic implements exponential backoff (500ms, 1s, 2s) with a cap of 3 retries by default. Retryable status codes are `429` (rate limit), `502` (bad gateway), `503` (service unavailable), and `504` (gateway timeout). A `400` (bad request) is not retried because it indicates a client error that will not resolve by waiting.

---

## 35.8 The Agent SDK Protocol

The agent SDK (`agent_sdk.rs`) defines the wire protocol for communicating with external AI agent processes. While the bridge's other modules handle transport (how messages move), the SDK module handles semantics (what messages mean).

### Message Types

The SDK uses NDJSON (newline-delimited JSON) with a `type` discriminator:

```rust
pub enum SdkMessage {
    UserMessage { content, attachments, conversation_id },
    AssistantMessage { content, thinking, model, usage },
    ToolUse { id, name, input, description },
    ToolResult { id, output, is_error, duration_ms },
    StatusUpdate { status, message, progress },
    Error { code, message, details, recoverable },
    Done { summary, usage, tool_uses, duration_ms },
    Handshake { protocol_version, capabilities, agent_name, agent_version },
    Heartbeat { timestamp_ms, is_pong },
    PermissionRequest { tool_name, operation, resource },
    PermissionResponse { result },
}
```

Eleven message types, each with a clear direction of flow: `UserMessage` flows host-to-agent, `AssistantMessage` flows agent-to-host, `ToolUse` flows agent-to-host (requesting permission), `ToolResult` flows host-to-agent (providing the result). The protocol is asymmetric by design — the host drives the conversation, but the agent drives tool selection.

### The Permission Model

When an agent wants to use a tool, it must pass a permission check:

```rust
pub fn check_permission(config: &SdkConfig, tool: &str, operation: &str) -> PermissionResult {
    if !config.tools.contains(&tool.to_string()) {
        return PermissionResult::deny(format!("Tool '{}' not in allowed list", tool));
    }
    if let Some(allowed_ops) = config.permissions.get(tool) {
        if allowed_ops.contains(&"*".to_string()) {
            return PermissionResult::allow("Wildcard permission").with_rule(format!("{}:*", tool));
        }
        if allowed_ops.contains(&operation.to_string()) {
            return PermissionResult::allow("Explicit permission").with_rule(format!("{}:{}", tool, operation));
        }
        return PermissionResult::deny(format!("Operation '{}' not permitted for tool '{}'", operation, tool));
    }
    // Tool in list but no specific ops — allow all
    PermissionResult::allow("Tool allowed, no operation restrictions")
}
```

The permission model has three tiers. First, the tool must be in the `tools` list. Second, if operation-level restrictions exist, the specific operation must be allowed (or `*` for wildcard). Third, if no operation restrictions exist, all operations are permitted. This mirrors the permission system discussed in Chapter 15, but at the SDK level rather than the local agent level.

### Cost Tracking

The SDK tracks token usage and estimates cost per model:

```rust
pub fn estimate_cost(model: &str, input_tokens: u64, output_tokens: u64) -> f64 {
    let (input_rate, output_rate) = match model {
        m if m.contains("opus") => (0.015, 0.075),
        m if m.contains("sonnet") => (0.003, 0.015),
        m if m.contains("haiku") => (0.00025, 0.00125),
        _ => (DEFAULT_INPUT_TOKEN_COST, DEFAULT_OUTPUT_TOKEN_COST),
    };
    (input_tokens as f64 / 1000.0) * input_rate
        + (output_tokens as f64 / 1000.0) * output_rate
}
```

Each `SdkSession` accumulates usage across turns via the `ModelUsage` struct, which auto-merges when assistant messages arrive. This gives operators real-time visibility into how much a session is costing.

### Status State Machine

The SDK session has its own status state machine, separate from the session manager's lifecycle states:

```rust
pub enum SdkStatus {
    Initializing,
    Ready,
    Processing,
    WaitingForPermission,
    WaitingForInput,
    Complete,
    Error,
}
```

The `WaitingForPermission` and `WaitingForInput` states are unique to the SDK — they represent situations where the agent has paused execution and needs external input before continuing. This is how the bridge implements the interactive permission prompts and multi-turn conversations that make the agent feel responsive rather than batch-oriented.

---

## 35.9 The Binary Wire Format

For high-throughput scenarios — like streaming large tool results between bridge instances — the JSON text format used by the REPL bridge and REST API adds unnecessary overhead. The messaging module (`messaging.rs`) provides a binary wire format called RCBM (RCode Bridge Message).

### Frame Layout

```
┌──────────┬─────────┬───────┬────────────┬───────────────┬─────────────┐
│ Magic(4) │ Ver.(1) │ Fl(1) │ Length(4)  │ Checksum(32)  │ Payload(N)  │
│ "RCBM"   │  0x01   │ bits  │ big-endian │   SHA-256     │ JSON/defl.  │
└──────────┴─────────┴───────┴────────────┴───────────────┴─────────────┘
     42-byte header                               Variable payload
```

The magic bytes `0x52 0x43 0x42 0x4D` spell "RCBM" and allow quick protocol detection without parsing the full header. The version byte enables future protocol evolution. The flags byte carries two bits: compression and checksum presence.

### Compression

Payloads larger than 64 KB are automatically compressed using deflate:

```rust
if proto.compress && json.len() > COMPRESSION_THRESHOLD {
    payload = compress_payload(&json)?;
    flags = flags.with(MessageFlags::COMPRESSED);
}
```

This threshold is tuned for the common case: most messages (prompts, tool calls, status updates) are well under 64 KB and do not benefit from compression. But tool results that carry large file contents can easily be hundreds of kilobytes, and deflate typically achieves 3-5x compression on source code.

### Checksum Verification

When checksums are enabled (the default), the sender computes SHA-256 over the payload (after compression, if applicable) and includes it in the header:

```rust
let checksum = if proto.checksums {
    flags = flags.with(MessageFlags::HAS_CHECKSUM);
    calculate_checksum(&payload)
} else {
    [0u8; 32]
};
```

The receiver verifies the checksum before attempting deserialization:

```rust
if header.flags.has_checksum() {
    let actual = calculate_checksum(payload);
    if actual != header.checksum {
        bail!("checksum mismatch");
    }
}
```

This catches corruption from network issues, memory errors, or bugs in intermediate proxies. The cost is 32 bytes per message plus the time to compute SHA-256, which is negligible for typical message sizes.

### SDK Translation

The messaging module also provides bidirectional translation between `SdkMessage` (the high-level SDK type) and `BridgeMessage` (the wire type):

```rust
pub fn sdk_message_adapter(sdk_msg: &SdkMessage) -> BridgeMessage {
    match sdk_msg {
        SdkMessage::UserMessage { content, .. } => BridgeMessage::Prompt { content: content.clone() },
        SdkMessage::ToolUse { name, input, .. } => BridgeMessage::ToolCall { name: name.clone(), input: input.clone() },
        // ...
    }
}

pub fn bridge_to_sdk(bridge_msg: &BridgeMessage) -> SdkMessage {
    match bridge_msg {
        BridgeMessage::Prompt { content } => SdkMessage::UserMessage { content: content.clone(), session_id: None },
        BridgeMessage::ToolCall { name, input } => SdkMessage::ToolUse { id: Uuid::new_v4().to_string(), name: name.clone(), input: input.clone() },
        // ...
    }
}
```

This adapter layer allows the SDK and bridge to evolve independently. If the SDK adds a new field to `UserMessage`, the adapter decides whether to propagate it or ignore it. If the bridge changes the structure of `ToolCall`, the adapter absorbs the change without affecting SDK clients.

---

## 35.10 The IDE Bridge — Editor Integration

The IDE bridge (`ide_bridge.rs`) speaks JSON-RPC 2.0 to editors. Unlike the REPL bridge (which uses a simplified protocol), the IDE bridge follows the Language Server Protocol patterns: initialization handshake, capability negotiation, and method-based routing.

### Editor Detection

When an IDE connects, the bridge identifies it from the handshake:

```rust
pub fn from_str_loose(s: &str) -> IdeKind {
    let lower = s.to_lowercase();
    if lower.contains("cursor") { Self::Cursor }
    else if lower.contains("code") || lower.contains("vscode") { Self::VsCode }
    else if lower.contains("intellij") || lower.contains("idea") { Self::IntelliJ }
    else { Self::Unknown }
}
```

This loose matching is intentional. IDE version strings vary ("Visual Studio Code 1.90", "Code - Insiders", "Cursor 0.44") and the bridge needs to work with all of them. The `IdeKind` determines which adapter to use for editor-specific features.

### Editor-Specific Adapters

Each IDE gets an adapter that handles its quirks:

- **VSCode/Cursor** use `file://` URIs and standard LSP-style edits.
- **Cursor** additionally supports annotated edits with AI-generated explanations.
- **IntelliJ** expects `documentLength` alongside edits for its undo stack.

```rust
impl CursorAdapter {
    pub fn annotated_edit(uri: &str, range: Range, new_text: &str, explanation: &str) -> Value {
        json!({
            "uri": uri,
            "range": range,
            "newText": new_text,
            "annotation": { "source": "rcode", "explanation": explanation }
        })
    }
}
```

This adapter pattern keeps the core bridge clean. New IDE support is added by implementing a new adapter struct, not by modifying the bridge itself.

### Bidirectional Operations

The IDE bridge supports operations in both directions:

**Agent to IDE:** text edits, diagnostic publishing, cursor/selection sync, file navigation.

**IDE to Agent:** file open/close/change notifications, handshake, shutdown.

The method constants follow LSP naming conventions:

```rust
pub mod methods {
    pub const TEXT_EDIT_APPLY: &str = "textDocument/applyEdit";
    pub const DIAGNOSTIC_PUBLISH: &str = "textDocument/publishDiagnostics";
    pub const FILE_OPEN: &str = "textDocument/didOpen";
    pub const FILE_CHANGE: &str = "textDocument/didChange";
    pub const HANDSHAKE: &str = "initialize";
    pub const SHUTDOWN: &str = "shutdown";
    // ...
}
```

This is not LSP compliance for compliance's sake. IDE extension authors already know these method names and the protocol patterns around them. By reusing the conventions, the bridge reduces the learning curve for anyone building a new IDE integration.

---

## 35.11 Security Considerations

The bridge layer is the agent's attack surface. Every design decision in this chapter has security implications, and several are worth calling out explicitly.

**Localhost binding by default.** The REST API and WebSocket server bind to `127.0.0.1`, not `0.0.0.0`. Exposing to the network requires explicit configuration.

**Token-based authentication.** The REST API uses bearer tokens. The WebSocket server uses HMAC-SHA256 session tokens. Neither transmits the shared secret over the wire.

**Constant-time token comparison.** The HMAC verification in `remote_core.rs` uses `mac.verify_slice()`, which is constant-time. This prevents timing side channels.

**Payload size limits.** Every transport enforces maximum message sizes (4-16 MiB depending on the transport). This prevents denial-of-service via memory exhaustion.

**Session limits.** Hard caps on concurrent sessions (default 16, max 256 for REST; default 32 for WebSocket) prevent resource exhaustion.

**Input validation.** Every inbound message is validated before processing — structure validation for protocol messages, size validation for payloads, format validation for configuration fields like `listen_addr` and `working_dir`.

**Permission propagation.** The SDK permission model ensures that remote agents cannot invoke tools without explicit authorization. As discussed in Chapter 15, the permission system is the last line of defense against unintended tool execution.

---

## 35.12 Putting It All Together

The bridge is not one thing — it is nine modules that collaborate to make the agent accessible from anywhere. Here is the flow for a typical remote session:

1. The bridge daemon starts, binding the REST API on port 19876 and the WebSocket server on port 9100.
2. A client creates a session via `POST /v1/sessions` with an auth token.
3. The bridge returns a session ID and an HMAC token for WebSocket access.
4. The client opens a WebSocket connection and authenticates with the session token.
5. The client sends a `Prompt` message with the user's query.
6. The bridge routes the prompt to the agent engine (discussed in previous chapters).
7. The agent streams `TextDelta` events over the WebSocket as it generates.
8. When the agent needs a tool, it sends a `ToolCall` message. The bridge checks permissions, executes the tool, and returns a `ToolResult`.
9. If the tool needs user approval, the bridge sends a `PermissionNeeded` event and waits.
10. The agent sends a `Done` message with usage statistics.
11. If the client disconnects, the session enters `Idle` state. After the GC timeout, it is cleaned up.

This flow is the same whether the client is VS Code, a web dashboard, a CI script, or another agent instance. The bridge does not know or care — it just moves messages between the transport and the engine, enforcing authentication, limits, and lifecycles along the way.

In the next chapter, we will look at how multiple bridge instances coordinate in a distributed deployment, enabling features like session migration, load balancing, and fault-tolerant agent pools.

---

## Summary

- The bridge enables remote access to the CLI agent over HTTP REST and WebSocket transports, with a REPL bridge for IDE child-process integration.
- Session management includes lifecycle state machines with validated transitions, garbage collection of idle/expired/turn-limited sessions, and configurable concurrency limits.
- Authentication uses HMAC-SHA256 session tokens with constant-time verification for WebSocket and bearer tokens for REST.
- The session pool pre-warms sessions for low-latency acquisition, tracks hit/miss metrics, and supports upstream proxy relay with exponential backoff retries.
- The binary RCBM wire format adds deflate compression for large payloads and SHA-256 checksums for integrity verification.
- The agent SDK defines an 11-message NDJSON protocol with a status state machine, permission model, and cost tracking.
- The IDE bridge speaks JSON-RPC 2.0 with editor-specific adapters for VS Code, Cursor, and IntelliJ.
- Security is defense-in-depth: localhost binding, token auth, payload limits, session caps, input validation, and permission propagation.
