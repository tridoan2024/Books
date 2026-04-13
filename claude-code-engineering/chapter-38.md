# Chapter 38: LSP Integration

A CLI agent that reads and writes code all day long has a fundamental problem: it does not understand the code. It can pattern-match against text, search for string literals with grep, and parse syntax trees with tree-sitter. But none of that tells it what a symbol resolves to, where a function is called from, or what type an expression evaluates to. That knowledge lives in language servers — the same processes that power "Go to Definition" in VS Code and "Find All References" in IntelliJ. The Language Server Protocol (LSP) is the lingua franca that makes that knowledge accessible over a standard JSON-RPC wire format, and integrating it into a CLI agent turns a sophisticated text manipulator into a tool that actually understands the semantic structure of the codebase it operates on.

This chapter covers the LSP integration in our agent from three perspectives: the `services/lsp` module that manages server lifecycles and implements the JSON-RPC transport, the `tools/lsp` module that exposes LSP operations as an agent tool, and the plugin-based extension system that lets third-party packages register additional language servers. Along the way we will examine the diagnostic registry that tracks errors across the workspace, the call hierarchy traversal that powers "who calls this function" queries, and the design decisions that make the whole subsystem testable with mock transports.

As discussed in Chapter 37 (Plugin System), plugins can contribute more than skills and hooks — they can also bundle language server binaries. The LSP integration is the consumer of those plugin-provided servers, and understanding both sides of that interface is essential to seeing how the agent's code intelligence grows with its plugin ecosystem.

---

## 38.1 Why LSP Matters for an AI Agent

Before we dive into the implementation, it is worth asking: why bother? The LLM already "understands" code in a statistical sense. It can often infer what a function does from its name and surrounding context. Why add the complexity of managing child processes, JSON-RPC framing, and server lifecycle state machines?

Three reasons, in order of importance.

**Precision.** When the agent needs to rename a variable across 47 files, it cannot afford to miss an occurrence or rename an unrelated identifier that happens to share the same name. The LLM's pattern matching is probabilistic; the language server's rename operation is deterministic. It uses the same resolution algorithm the compiler uses. Zero false positives, zero false negatives.

**Scope.** The agent's context window has a hard limit — even with aggressive compaction (Chapter 6), it cannot hold an entire large codebase. But a language server indexes the whole workspace in memory. A `findReferences` call returns every call site across every file, even ones the agent has never read. This gives the agent workspace-wide vision without consuming a single token of context.

**Speed.** Reading a file, searching for a symbol name with grep, filtering out string literals and comments, then verifying each hit is actually a reference — that is a multi-step, multi-tool-call process that costs API round trips and tokens. A single `textDocument/references` request to the language server returns the answer in milliseconds, with file paths and exact positions. One tool call instead of five.

The integration is not free — there is latency for server startup, memory for the server process, and complexity in lifecycle management. But for any project larger than a few hundred lines, the trade-off overwhelmingly favors having language servers available.

---

## 38.2 Architecture Overview

The LSP subsystem is split across two modules with distinct responsibilities:

```
┌──────────────────────────────────────────────────────────────────┐
│                      Agent Tool System                           │
│                                                                  │
│  tools/lsp.rs                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  LspTool (implements Tool trait)                           │  │
│  │  ├── LspAction enum (9 operations)                        │  │
│  │  ├── LspRegistry (extension → server mapping)             │  │
│  │  ├── LspClient (JSON-RPC client with LspTransport trait)  │  │
│  │  └── Response parsers + formatters                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │ uses                              │
│                              ▼                                   │
│  services/lsp.rs                                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  LspManager (multi-language server management)             │  │
│  │  ├── LspClient (child-process JSON-RPC transport)         │  │
│  │  ├── LspServerConfig (per-server configuration)           │  │
│  │  ├── Diagnostic storage (RwLock<HashMap<URI, Vec>>)        │  │
│  │  └── Content-Length framed message I/O                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │ extended by                       │
│                              ▼                                   │
│  utils/plugin_utils.rs                                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  PluginLspIntegration                                      │  │
│  │  ├── RegisteredLsp (plugin-provided servers)               │  │
│  │  ├── LspServerSpec (manifest-defined server config)        │  │
│  │  └── Binary validation + language matching                 │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

The separation is deliberate. The `services/lsp` module handles the raw transport — spawning child processes, reading Content-Length framed messages from stdout, routing JSON-RPC responses to pending requests, and accumulating diagnostics. It knows nothing about the agent's tool system. The `tools/lsp` module sits above it, implementing the `Tool` trait so the LLM can invoke LSP operations, and introducing the `LspTransport` abstraction that decouples the JSON-RPC client from any specific I/O mechanism — making the entire tool layer testable with mock transports.

---

## 38.3 The JSON-RPC Transport Layer

At the bottom of the stack is the wire protocol. LSP uses JSON-RPC 2.0 over a bidirectional stream, with messages framed by `Content-Length` headers. Every message looks like this on the wire:

```
Content-Length: 87\r\n
\r\n
{"jsonrpc":"2.0","id":1,"method":"textDocument/definition","params":{"textDocument":{"uri":"file:///src/main.rs"},"position":{"line":42,"character":10}}}
```

The implementation defines three message types that map directly to the JSON-RPC specification:

```rust
/// A JSON-RPC 2.0 request message.
pub struct JsonRpcRequest {
    pub jsonrpc: String,    // Always "2.0"
    pub id: i64,            // Unique request id
    pub method: String,     // Method name
    pub params: Option<serde_json::Value>,
}

/// A JSON-RPC 2.0 response message.
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<i64>,    // Matches the request id
    pub result: Option<serde_json::Value>,
    pub error: Option<JsonRpcError>,
}

/// A JSON-RPC notification (no id, no response expected).
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    pub params: Option<serde_json::Value>,
}
```

Both `JsonRpcRequest` and `JsonRpcNotification` implement a `to_frame()` method that serializes to JSON and prepends the `Content-Length` header:

```rust
impl JsonRpcRequest {
    pub fn to_frame(&self) -> Result<Vec<u8>> {
        let body = serde_json::to_string(self)?;
        Ok(format!("Content-Length: {}\r\n\r\n{}", body.len(), body)
            .into_bytes())
    }
}
```

The length is computed from the JSON body, not from the total message including headers. This is a common source of off-by-one bugs in LSP implementations — the Content-Length must be the byte count of the body alone, and it must be in bytes, not characters. For ASCII-only JSON this is the same, but if a diagnostic message contains multi-byte UTF-8 characters, the byte count and character count diverge.

On the reading side, the `read_message` function implements a state machine that parses headers line by line until it hits the empty `\r\n` separator, then reads exactly `content_length` bytes:

```rust
async fn read_message(
    reader: &mut BufReader<tokio::process::ChildStdout>,
) -> Result<Option<ServerMessage>> {
    let mut header_line = String::new();
    let mut content_length: Option<usize> = None;

    loop {
        header_line.clear();
        let n = reader.read_line(&mut header_line).await?;
        if n == 0 { return Ok(None); }  // EOF — server closed
        let trimmed = header_line.trim();
        if trimmed.is_empty() { break; } // End of headers
        if let Some(len_str) = trimmed.strip_prefix("Content-Length:") {
            content_length = Some(len_str.trim().parse::<usize>()?);
        }
    }

    let len = content_length
        .ok_or_else(|| LspError::MalformedMessage("missing Content-Length".into()))?;

    let mut body = vec![0u8; len];
    tokio::io::AsyncReadExt::read_exact(reader, &mut body).await?;
    let msg: ServerMessage = serde_json::from_slice(&body)?;
    Ok(Some(msg))
}
```

The unified `ServerMessage` type uses a flat structure with optional fields rather than a tagged enum. This is intentional — the LSP specification allows "server requests" (messages with both `id` and `method`), which are distinct from both responses (id only) and notifications (method only). The classification methods make it easy to dispatch:

```rust
impl ServerMessage {
    pub fn is_response(&self) -> bool {
        self.id.is_some() && self.method.is_none()
    }
    pub fn is_notification(&self) -> bool {
        self.method.is_some() && self.id.is_none()
    }
    pub fn is_request(&self) -> bool {
        self.id.is_some() && self.method.is_some()
    }
}
```

The three-way classification matters because each type requires different handling. Responses get routed to the pending request that is waiting for them. Notifications get dispatched to handlers (primarily the diagnostics handler). Server requests — rare in practice, but used for things like `window/showMessage` — require a response from the client.

---

## 38.4 The LspClient: Process-Backed Transport

The `LspClient` in `services/lsp.rs` manages a single language server process. It owns the child's stdin (for writing requests), spawns a background tokio task that reads from stdout, and maintains the bookkeeping structures that connect requests to responses.

### Spawning the Server

```rust
pub async fn start(config: LspServerConfig) -> Result<Self> {
    let mut child = Command::new(&config.command)
        .args(&config.args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| LspError::SpawnFailed {
            command: config.command.clone(),
            source: e,
        })?;

    let stdin = child.stdin.take().expect("stdin piped");
    let stdout = child.stdout.take().expect("stdout piped");
    // ... set up background reader ...
}
```

Note that stderr is redirected to null. Language servers are often chatty on stderr — rust-analyzer logs diagnostics there, pyright emits progress notifications — and none of that is useful to the agent. It would only pollute logs. The useful information comes through the JSON-RPC channel on stdout.

### The Request-Response Correlation

When the client sends a request, it allocates a monotonically increasing ID, creates a `oneshot` channel, and stores the sender half in a `HashMap<i64, PendingRequest>`:

```rust
async fn send_request(
    &self,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, LspError> {
    let id = self.next_id.fetch_add(1, Ordering::SeqCst);
    let request = JsonRpcRequest::new(id, method, Some(params));
    let frame = request.to_frame()?;

    let (tx, rx) = oneshot::channel();
    self.pending.lock().await.insert(id, PendingRequest { tx });

    // Write to stdin
    let mut stdin_guard = self.stdin.lock().await;
    if let Some(stdin) = stdin_guard.as_mut() {
        stdin.write_all(&frame).await?;
        stdin.flush().await?;
    } else {
        return Err(LspError::AlreadyStopped);
    }

    // Wait for the background reader to deliver the response
    rx.await.map_err(|_| LspError::Cancelled)?
}
```

The background reader loop picks up the response, finds the matching pending request by ID, and completes the oneshot:

```rust
async fn dispatch_message(
    msg: ServerMessage,
    pending: &Arc<Mutex<HashMap<i64, PendingRequest>>>,
    diagnostics: &Arc<RwLock<HashMap<String, Vec<Diagnostic>>>>,
) {
    if msg.is_response() {
        if let Some(id) = msg.id {
            let mut pending_guard = pending.lock().await;
            if let Some(req) = pending_guard.remove(&id) {
                if let Some(err) = msg.error {
                    let _ = req.tx.send(Err(LspError::ServerError {
                        code: err.code,
                        message: err.message,
                    }));
                } else {
                    let _ = req.tx.send(Ok(
                        msg.result.unwrap_or(serde_json::Value::Null)
                    ));
                }
            }
        }
    } else if msg.is_notification() {
        // Handle publishDiagnostics
        if let Some(method) = &msg.method {
            if method == "textDocument/publishDiagnostics" {
                // Store diagnostics keyed by URI
            }
        }
    }
}
```

This pattern — monotonic IDs, oneshot channels, a concurrent HashMap — is a standard approach for multiplexing requests over a single bidirectional stream. The `oneshot` channel is the right abstraction because each request gets exactly one response. Using `mpsc` would be wasteful, and using a shared future or condvar would be more complex without any benefit.

### The Client State Machine

The client tracks its lifecycle through four states:

```rust
pub enum ClientState {
    Created,      // Spawned but not yet initialized
    Running,      // Initialize handshake complete
    ShuttingDown, // Shutdown request sent
    Stopped,      // Server exited
}
```

This state machine prevents common bugs like sending requests to a stopped server or calling initialize twice. The `send_request` method checks for `AlreadyStopped` before writing to stdin, and the reader loop checks for `Stopped` before attempting to read.

---

## 38.5 The Initialize Handshake

LSP requires a three-step handshake before any operations can be performed: the client sends `initialize`, the server responds with its capabilities, and the client sends `initialized` to signal that it is ready.

The capabilities declaration is where the client tells the server what it can handle:

```rust
pub async fn initialize(&self, root_uri: &str) -> Result<serde_json::Value, LspError> {
    let params = serde_json::json!({
        "processId": std::process::id(),
        "rootUri": root_uri,
        "capabilities": {
            "textDocument": {
                "synchronization": {
                    "willSave": false,
                    "willSaveWaitUntil": false,
                    "didSave": true
                },
                "completion": {
                    "completionItem": {
                        "snippetSupport": false,
                        "documentationFormat": ["plaintext", "markdown"]
                    }
                },
                "hover": {
                    "contentFormat": ["plaintext", "markdown"]
                },
                "definition": { "dynamicRegistration": false },
                "references": { "dynamicRegistration": false },
                "publishDiagnostics": { "relatedInformation": true }
            },
            "workspace": {
                "symbol": { "dynamicRegistration": false }
            }
        },
        "initializationOptions": self.config.init_options,
        "workspaceFolders": [{ "uri": root_uri, "name": "workspace" }]
    });

    let result = self.send_request("initialize", params).await?;
    *self.server_capabilities.write().await = Some(result.clone());
    *self.state.write().await = ClientState::Running;

    self.send_notification("initialized", serde_json::json!({})).await?;
    Ok(result)
}
```

Several design choices are worth noting:

1. **`snippetSupport: false`** — The agent does not render snippets with tab stops. It wants the plain text of completions, not VS Code-style `${1:placeholder}` syntax.

2. **`dynamicRegistration: false`** — The agent does not support servers dynamically registering new capabilities after initialization. This simplifies the client significantly — capabilities are determined once at startup and do not change.

3. **`publishDiagnostics: { relatedInformation: true }`** — The agent wants the full diagnostic chain, including "related information" that links errors to their causes. This is especially valuable for type errors where the root cause is in a different location than the error message.

4. **`workspaceFolders`** — The server receives the project root so it can index the entire workspace, not just the files the agent has opened.

The server's response contains its own capabilities — which operations it supports. A production implementation should check these before calling operations. For example, if the server does not declare `definitionProvider`, calling `textDocument/definition` will fail. The current implementation stores the capabilities for potential future use but does not gate operations on them, relying instead on the language server to return a graceful error.

---

## 38.6 LSP Operations as Agent Tools

The `tools/lsp.rs` module elevates the raw LSP client into the agent's tool system. The `LspTool` struct implements the `Tool` trait (discussed in Chapter 8), making LSP operations available to the LLM through the standard tool-calling interface.

### The Action Enum

Nine operations are supported, each mapped through a flexible parser that accepts multiple aliases:

```rust
pub enum LspAction {
    GotoDefinition,
    FindReferences,
    Hover,
    Completion,
    Diagnostics,
    WorkspaceSymbols,
    CodeActions,
    Rename,
    Format,
}

impl LspAction {
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().replace('-', "_").as_str() {
            "goto_definition" | "definition" | "go_to_definition"
                => Some(Self::GotoDefinition),
            "find_references" | "references" | "refs"
                => Some(Self::FindReferences),
            "hover" | "info" | "type_info"
                => Some(Self::Hover),
            "diagnostics" | "errors" | "warnings" | "lint"
                => Some(Self::Diagnostics),
            "workspace_symbols" | "symbols" | "search_symbols"
                => Some(Self::WorkspaceSymbols),
            "code_actions" | "actions" | "quickfix" | "fixes"
                => Some(Self::CodeActions),
            "rename" => Some(Self::Rename),
            "format" | "formatting" => Some(Self::Format),
            _ => None,
        }
    }
}
```

The multiple aliases per action are not aesthetic — they match the natural language the LLM tends to produce. When the model decides it needs type information, it might generate `"action": "type_info"` or `"action": "hover"`. Both resolve to the same operation. This reduces the friction of tool use and lowers the error rate compared to requiring a single canonical name.

### The Tool Input Schema

The input schema declares a single required field (`action`) and optional fields that vary by operation:

```rust
fn input_schema(&self) -> Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "goto_definition", "find_references", "hover",
                    "completion", "diagnostics", "workspace_symbols",
                    "code_actions", "rename", "format", "list_servers"
                ]
            },
            "file": { "type": "string" },
            "line": { "type": "integer" },
            "column": { "type": "integer" },
            "query": { "type": "string" },
            "new_name": { "type": "string" },
            "include_declaration": { "type": "boolean" },
            "tab_size": { "type": "integer" },
            "insert_spaces": { "type": "boolean" }
        },
        "required": ["action"]
    })
}
```

This is a "flat" schema where all operations share the same top-level fields, rather than a discriminated union where each action has its own parameter object. The flat approach is intentional: it is easier for the LLM to generate, and the handler validates the required fields per-action. If the model calls `hover` without a `file` parameter, it gets a clear error message — not a JSON Schema validation failure that leaks internal structure.

### Read-Only Classification

The tool carefully distinguishes read-only operations from mutating ones:

```rust
fn is_read_only(&self, input: &Value) -> bool {
    let a = input.get("action").and_then(|v| v.as_str()).unwrap_or("");
    matches!(a, "goto_definition" | "find_references" | "hover"
        | "completion" | "diagnostics" | "workspace_symbols"
        | "code_actions" | "list_servers")
}

fn is_concurrency_safe(&self, input: &Value) -> bool {
    self.is_read_only(input)
}
```

This classification feeds into the permission system (Chapter 15). Read-only operations can be auto-approved without user confirmation. `rename` and `format`, which modify files, require explicit permission. The `is_concurrency_safe` flag allows read-only LSP operations to run in parallel with other read-only tools — a significant performance benefit when the agent is gathering information from multiple sources simultaneously.

### Position Handling: One-Indexed to Zero-Indexed

A subtle but critical detail: the LLM thinks in one-indexed positions (line 1, column 1 is the start of a file), but LSP uses zero-indexed positions. The `Position::from_one_indexed` method handles the conversion:

```rust
impl Position {
    pub fn from_one_indexed(line: u32, column: u32) -> Self {
        Self {
            line: line.saturating_sub(1),
            character: column.saturating_sub(1),
        }
    }
}
```

The `saturating_sub` prevents underflow — if the model sends line 0 (which it should not, but occasionally does), the position clamps to 0 rather than wrapping to `u32::MAX`. This defensive coding prevents a single off-by-one from the LLM from causing a crash deep in the language server.

---

## 38.7 The LspTransport Abstraction

One of the most important design decisions in the tool layer is the `LspTransport` trait:

```rust
#[async_trait]
pub trait LspTransport: Send + Sync {
    async fn send_request(&self, method: &str, params: Value) -> Result<Value>;
    async fn send_notification(&self, method: &str, params: Value) -> Result<()>;
    fn is_connected(&self) -> bool;
    async fn shutdown(&self) -> Result<()>;
}
```

This trait decouples the `LspClient` in the tool layer from any specific transport mechanism. The production transport connects to a real language server process (via the `services/lsp` module). But for testing, a `MockTransport` can return canned responses:

```rust
struct MockTransport {
    connected: AtomicBool,
    responses: Mutex<HashMap<String, Value>>,
}

#[async_trait]
impl LspTransport for MockTransport {
    async fn send_request(&self, method: &str, _params: Value) -> Result<Value> {
        Ok(self.responses.lock().await
            .get(method).cloned()
            .unwrap_or(serde_json::json!({"result": null})))
    }
    async fn send_notification(&self, _method: &str, _params: Value) -> Result<()> {
        Ok(())
    }
    fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }
    async fn shutdown(&self) -> Result<()> {
        self.connected.store(false, Ordering::Relaxed);
        Ok(())
    }
}
```

With this mock, you can test every code path in the LSP tool without spawning a single language server process. This is not a nice-to-have — it is essential. Language server processes are slow to start (rust-analyzer can take 10-30 seconds to index a large project), non-deterministic in their timing, and unavailable in CI environments that do not have them installed. The transport abstraction makes the entire tool layer fast, deterministic, and CI-friendly.

---

## 38.8 The LspManager: Multi-Language Server Orchestration

A real codebase is rarely monolingual. A project might have Rust for the core, Python for scripting, TypeScript for the web frontend, and Go for microservices. The `LspManager` handles this by managing multiple server instances simultaneously, with lazy startup triggered by the first file of each language type.

### Language Detection

The manager maps file extensions to language identifiers:

```rust
pub fn detect_language(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?;
    let lang = match ext {
        "rs" => "rust",
        "py" | "pyi" => "python",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" => "javascript",
        "go" => "go",
        "c" | "h" => "c",
        "cpp" | "hpp" | "cc" | "cxx" => "cpp",
        "java" => "java",
        "rb" => "ruby",
        "lua" => "lua",
        "sh" | "bash" | "zsh" => "shellscript",
        // ... 10 more languages ...
        _ => return None,
    };
    Some(lang.into())
}
```

This detection is deliberately simple — extension-based, no content sniffing, no shebang parsing. For LSP purposes, the file extension is almost always sufficient. The one notable edge case is `.h` files, which could be C or C++. The implementation maps them to `"c"`, which means a pure C++ project using `.h` for headers will get the C language server. In practice, clangd handles both C and C++ regardless of the language ID, so this rarely causes issues.

### Lazy Server Startup

Servers are started on demand, not at session startup:

```rust
pub async fn get_client_for_file(
    &self,
    path: &Path,
) -> Result<Option<Arc<LspClient>>> {
    let language_id = match Self::detect_language(path) {
        Some(lang) => lang,
        None => return Ok(None),  // Unknown language, no server
    };

    // Check if we already have a running server for this language
    let clients = self.clients.read().await;
    if let Some(client) = clients.get(&language_id) {
        return Ok(Some(Arc::clone(client)));
    }
    drop(clients);

    // Start a new server
    match self.ensure_server(&language_id).await {
        Ok(client) => Ok(Some(client)),
        Err(e) => {
            warn!(language = %language_id, error = %e,
                  "failed to start LSP server");
            Ok(None)  // Graceful degradation
        }
    }
}
```

The lazy startup pattern has two important properties. First, it avoids the startup cost for languages that the agent never touches in a given session. If you are working on a Python-only project, rust-analyzer never starts. Second, the failure path returns `Ok(None)` rather than propagating the error. If pyright is not installed, the agent does not crash — it simply operates without Python code intelligence. The tool layer can detect the `None` and fall back to text-based approaches.

### Default Server Configurations

The manager ships with configurations for five common language servers:

```rust
fn default_server_configs(root_dir: &Path) -> Vec<LspServerConfig> {
    vec![
        LspServerConfig::rust_analyzer(root_dir),
        LspServerConfig::pyright(root_dir),
        LspServerConfig::typescript(root_dir),
        LspServerConfig::gopls(root_dir),
        LspServerConfig::clangd(root_dir),
    ]
}
```

Each config specifies the command to spawn, arguments, root URI, and handled file extensions:

| Language | Server | Command | Extensions |
|----------|--------|---------|------------|
| Rust | rust-analyzer | `rust-analyzer` | `.rs` |
| Python | Pyright | `pyright-langserver --stdio` | `.py`, `.pyi` |
| TypeScript | typescript-language-server | `typescript-language-server --stdio` | `.ts`, `.tsx`, `.js`, `.jsx` |
| Go | gopls | `gopls` | `.go` |
| C/C++ | clangd | `clangd` | `.c`, `.h`, `.cpp`, `.hpp`, `.cc` |

The `--stdio` argument is required for servers that default to a different transport (like TCP). The agent always communicates over stdin/stdout because it manages the server as a child process — there is no need for TCP, and avoiding it eliminates an entire class of port-conflict and firewall issues.

---

## 38.9 The Diagnostic Registry

Diagnostics — errors, warnings, and hints — flow from the language server to the agent via `textDocument/publishDiagnostics` notifications. Unlike request-response pairs, diagnostics arrive asynchronously: the server pushes them whenever it finishes analyzing a file, which can happen after a `didOpen`, `didChange`, or `didSave` notification.

The client stores diagnostics in a concurrent `HashMap` keyed by document URI:

```rust
pub struct LspClient {
    // ...
    diagnostics: Arc<RwLock<HashMap<String, Vec<Diagnostic>>>>,
}
```

When a `publishDiagnostics` notification arrives, the entire diagnostic list for that URI is replaced. This is the LSP contract: the server always sends the full set of diagnostics for a file, not incremental updates. This makes the client implementation simple — just insert/replace — but it means the diagnostic store always reflects the server's latest understanding of each file.

The `Diagnostic` type captures the essential information:

```rust
pub struct Diagnostic {
    pub range: Range,
    pub severity: Option<u8>,      // 1=Error, 2=Warning, 3=Info, 4=Hint
    pub code: Option<serde_json::Value>,  // e.g., "E0433" or {"value": "E0433", "target": "..."}
    pub source: Option<String>,    // e.g., "rustc", "clippy", "pyright"
    pub message: String,
}
```

### Diagnostic Formatting

The formatting function converts raw diagnostics into human-readable terminal output:

```rust
pub fn format_diagnostics(uri: &str, diagnostics: &[Diagnostic]) -> String {
    let mut out = String::new();
    out.push_str(&format!("{}:\n", uri));
    for diag in diagnostics {
        let severity = diag.parsed_severity()
            .map(|s| s.label())
            .unwrap_or("unknown");
        let line = diag.range.start.line + 1;  // Convert to 1-indexed
        let col = diag.range.start.character + 1;
        let source = diag.source.as_deref().unwrap_or("");
        out.push_str(&format!(
            "  {}:{}  {} [{}] {}\n",
            line, col, severity, source, diag.message
        ));
    }
    out
}
```

The output looks like:

```
file:///src/main.rs:
  42:10  error [rustc] cannot find value `foo` in this scope
  87:3   warning [clippy] unused variable: `x`
```

This format is designed for the LLM to parse, not for human aesthetics. The `line:col` format matches what grep and compiler output use, so the model's training data has extensive exposure to it. Including the source (`[rustc]`, `[clippy]`) helps the model distinguish between compiler errors that must be fixed and lint suggestions that might be intentional.

### Severity Counting

A helper function provides summary statistics:

```rust
pub fn count_by_severity(diagnostics: &[Diagnostic]) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for diag in diagnostics {
        let sev = diag.parsed_severity()
            .map(|s| s.label().to_string())
            .unwrap_or("unknown".into());
        *counts.entry(sev).or_insert(0) += 1;
    }
    counts
}
```

This powers the summary line in the tool output: `"12 diagnostic(s) (3 errors, 9 warnings)"`. The summary gives the model a quick triage signal before it reads the individual diagnostics.

---

## 38.10 The LspRegistry: Extension-Based Server Discovery

The tool layer maintains its own registry of language servers, separate from the `LspManager`'s configuration. This registry serves as the source of truth for "which languages are supported" and is the integration point for plugin-contributed servers.

```rust
pub struct LspRegistry {
    entries: Vec<LspServerEntry>,
}

pub struct LspServerEntry {
    pub language: String,
    pub command: String,
    pub args: Vec<String>,
    pub extensions: Vec<String>,
}
```

The default registry ships with eight servers:

| Language | Command | Extensions |
|----------|---------|------------|
| Rust | `rust-analyzer` | `rs` |
| Python | `pyright-langserver` | `py`, `pyi` |
| TypeScript | `typescript-language-server` | `ts`, `tsx` |
| JavaScript | `typescript-language-server` | `js`, `jsx` |
| Go | `gopls` | `go` |
| C/C++ | `clangd` | `c`, `cpp`, `h`, `hpp` |
| Java | `jdtls` | `java` |
| Ruby | `solargraph` | `rb` |

The registry supports case-insensitive lookup by both extension and language name:

```rust
pub fn find_by_extension(&self, ext: &str) -> Option<&LspServerEntry> {
    let e = ext.to_ascii_lowercase();
    self.entries.iter()
        .find(|entry| entry.extensions.iter().any(|x| x == &e))
}

pub fn find_by_language(&self, name: &str) -> Option<&LspServerEntry> {
    let l = name.to_ascii_lowercase();
    self.entries.iter()
        .find(|e| e.language.to_ascii_lowercase() == l)
}
```

Case-insensitive matching is critical because the LLM generates tool inputs with unpredictable casing. It might produce `"RS"`, `"rs"`, or `"Rs"` for a Rust file extension. The registry normalizes away this variation.

---

## 38.11 Plugin-Based LSP Server Registration

As discussed in Chapter 37, plugins can bundle language server binaries alongside their skills and hooks. The `PluginLspIntegration` component bridges the plugin system and the LSP subsystem.

### The Plugin Manifest

A plugin that bundles an LSP server declares it in its manifest:

```rust
pub struct LspServerSpec {
    pub name: String,
    pub binary: String,
    pub args: Vec<String>,
    pub languages: Vec<String>,
    pub init_options: Option<serde_json::Value>,
}
```

For example, a Zig plugin might declare:

```json
{
  "lsp_servers": [{
    "name": "zls",
    "binary": "bin/zls",
    "args": [],
    "languages": ["zig"],
    "init_options": null
  }]
}
```

### Registration Flow

When a plugin is installed, the integration layer scans its manifest and registers any LSP servers:

```rust
pub fn register_from_manifest(
    &mut self,
    plugin: &InstalledPlugin,
    manifest: &PluginManifest,
) -> Vec<RegisteredLsp> {
    let mut registered = Vec::new();
    for spec in &manifest.lsp_servers {
        let binary_path = plugin.install_path.join(&spec.binary);
        let entry = RegisteredLsp {
            plugin_id: plugin.id.clone(),
            server_name: spec.name.clone(),
            binary_path,
            args: spec.args.clone(),
            languages: spec.languages.clone(),
            init_options: spec.init_options.clone(),
            registered_at: Utc::now(),
        };
        self.registry.push(entry.clone());
        registered.push(entry);
    }
    registered
}
```

The `binary_path` is resolved relative to the plugin's install directory. This is important for isolation — each plugin ships its own binary, and there is no conflict between two plugins that both provide a server for the same language (the `find_for_language` method returns the first match, effectively giving priority to the first-installed plugin).

### Binary Validation

Before using a plugin-provided server, the integration layer can validate that the binary actually exists on disk:

```rust
pub fn validate_binaries(&self) -> Vec<(&RegisteredLsp, bool)> {
    self.registry.iter()
        .map(|r| (r, r.binary_path.exists()))
        .collect()
}
```

This catches the case where a plugin was installed but its binary was not properly extracted, or where the binary was deleted without uninstalling the plugin. The `validate_binaries` method returns a tuple of (server, exists), allowing the caller to warn about missing binaries without preventing the rest of the system from functioning.

### Uninstallation

When a plugin is uninstalled, all of its registered servers are removed:

```rust
pub fn unregister_plugin(&mut self, plugin_id: &str) -> usize {
    let before = self.registry.len();
    self.registry.retain(|r| r.plugin_id != plugin_id);
    before - self.registry.len()
}
```

The return value indicates how many servers were removed, which is useful for logging and user feedback.

---

## 38.12 Document Synchronization

The LSP protocol requires the client to keep the server informed about document state through four notifications: `didOpen`, `didChange`, `didClose`, and `didSave`. The agent's file editing workflow maps naturally onto these:

| Agent Action | LSP Notification |
|-------------|-----------------|
| Read a file (FileReadTool) | `textDocument/didOpen` |
| Edit a file (FileEditTool) | `textDocument/didChange` |
| Finish with a file | `textDocument/didClose` |
| Write/save a file (FileWriteTool) | `textDocument/didSave` |

The `didOpen` notification includes the full text of the document, the language ID, and a version number:

```rust
pub async fn did_open(
    &self,
    uri: &str,
    language_id: &str,
    version: i32,
    text: &str,
) -> Result<(), LspError> {
    let params = serde_json::json!({
        "textDocument": {
            "uri": uri,
            "languageId": language_id,
            "version": version,
            "text": text
        }
    });
    self.send_notification("textDocument/didOpen", params).await
}
```

The `didChange` notification uses versioned document identifiers and content change events:

```rust
pub async fn did_change(
    &self,
    uri: &str,
    version: i32,
    changes: Vec<TextDocumentContentChangeEvent>,
) -> Result<(), LspError> {
    let params = serde_json::json!({
        "textDocument": { "uri": uri, "version": version },
        "contentChanges": changes
    });
    self.send_notification("textDocument/didChange", params).await
}
```

The `TextDocumentContentChangeEvent` can represent either a full-document replacement (when `range` is `None`) or an incremental edit (when `range` specifies the replaced region). The agent typically sends full-document replacements because its edit operations compute the final text, not incremental diffs. While incremental updates would be more efficient over the wire, the simplicity of full replacement avoids an entire class of range calculation bugs.

---

## 38.13 IDE Bridge Integration

The `bridge/ide_bridge.rs` module provides a parallel path for diagnostic and navigation information — not to language servers, but to IDEs. When the agent is running inside VS Code or Cursor via the bridge connection (Chapter 35), it can push diagnostics discovered during its analysis back to the editor:

```rust
pub async fn publish_diagnostics(
    &self,
    uri: &str,
    diagnostics: Vec<Diagnostic>,
) -> Result<(), IdeBridgeError> {
    let params = serde_json::json!({
        "diagnostics": diagnostics,
    });
    self.send_notification(
        methods::DIAGNOSTIC_PUBLISH, params
    ).await
}
```

This creates a bidirectional information flow: the agent queries language servers for code intelligence, uses that intelligence to make decisions, and then publishes its findings back to the IDE so the developer sees the same information in their editor. It is a feedback loop that makes the agent feel integrated rather than isolated.

---

## 38.14 Response Parsing: Handling LSP's Flexible Types

One of the most tedious aspects of LSP integration is the response parsing. The LSP specification is liberal in what it accepts — a `definition` response can be a single `Location`, an array of `Location`s, an array of `LocationLink`s, or `null`. The parser must handle all of these:

```rust
fn parse_locations(value: &Value) -> Vec<Location> {
    let mut locs = Vec::new();
    if let Some(arr) = value.as_array() {
        for item in arr {
            if let Some(l) = parse_single_location(item) {
                locs.push(l);
            }
        }
    } else if let Some(l) = parse_single_location(value) {
        locs.push(l);
    }
    locs
}
```

The hover response is even more flexible — it can be a string, a `MarkupContent` object, or an array of mixed strings and objects:

```rust
fn extract_hover_text(contents: &Value) -> String {
    if let Some(s) = contents.as_str() { return s.to_string(); }
    if let Some(obj) = contents.as_object() {
        if let Some(val) = obj.get("value") {
            return val.as_str().unwrap_or("").to_string();
        }
    }
    if let Some(arr) = contents.as_array() {
        return arr.iter().map(|v| {
            if let Some(s) = v.as_str() { s.to_string() }
            else if let Some(o) = v.as_object() {
                o.get("value").and_then(|x| x.as_str())
                    .unwrap_or("").to_string()
            } else { String::new() }
        }).collect::<Vec<_>>().join("\n");
    }
    contents.to_string()  // Fallback: just stringify it
}
```

The key principle in all these parsers is **never fail on unexpected shapes**. If the server sends a response format the parser does not recognize, it returns an empty result or a stringified fallback rather than erroring. This is essential for compatibility across different language server implementations, which interpret the specification with varying degrees of strictness.

---

## 38.15 Safety Limits and Resource Caps

The tool layer enforces limits on every response type to prevent language servers from overwhelming the agent's context:

```rust
const MAX_RESULTS: usize = 200;        // Locations, references
const MAX_HOVER_LENGTH: usize = 5_000;  // Hover text characters
const MAX_COMPLETIONS: usize = 50;      // Completion items
const MAX_DIAGNOSTICS: usize = 100;     // Diagnostic entries
const MAX_CODE_ACTIONS: usize = 20;     // Code actions
```

These limits are not arbitrary. `MAX_RESULTS` of 200 is enough to capture every reference to even widely-used utility functions in most codebases. `MAX_HOVER_LENGTH` of 5,000 characters covers the longest Rust type signatures and their documentation. `MAX_COMPLETIONS` of 50 provides sufficient options without flooding the model with noise. And `MAX_DIAGNOSTICS` of 100 prevents a project with thousands of warnings from consuming the entire context window.

The hover truncation is explicit rather than silent:

```rust
let hover = c.hover(&uri, pos).await?;
let content = match hover {
    Some(mut txt) => {
        if txt.len() > MAX_HOVER_LENGTH {
            txt.truncate(MAX_HOVER_LENGTH);
            txt.push_str("\n... (truncated)");
        }
        txt
    }
    None => "No hover information available.".into(),
};
```

The `... (truncated)` suffix is important — it tells the model that the full information was longer and that it might need to ask a more specific question or read the source directly to get the rest.

---

## 38.16 Graceful Shutdown

The LSP specification defines a two-phase shutdown: send `shutdown`, wait for acknowledgment, then send `exit`. The implementation follows this precisely:

```rust
pub async fn shutdown(&self) -> Result<(), LspError> {
    *self.state.write().await = ClientState::ShuttingDown;
    self.send_request("shutdown", serde_json::json!(null)).await?;
    self.send_notification("exit", serde_json::json!(null)).await?;
    *self.state.write().await = ClientState::Stopped;
    let mut stdin_guard = self.stdin.lock().await;
    *stdin_guard = None;  // Drop stdin to close the pipe
    Ok(())
}
```

The `LspManager` extends this to all running servers:

```rust
pub async fn shutdown_all(&self) -> Result<()> {
    let mut clients = self.clients.write().await;
    for (lang, client) in clients.drain() {
        if let Err(e) = client.shutdown().await {
            warn!(language = %lang, error = %e,
                  "error shutting down LSP");
        }
    }
    Ok(())
}
```

Errors during shutdown are logged but do not propagate. A failed shutdown means the server process will be orphaned and eventually killed by the OS when the parent process exits. This is acceptable — the alternative is blocking the agent's exit on a hung server, which is worse.

---

## 38.17 Error Taxonomy

The `LspError` enum classifies every failure mode the subsystem can produce:

```rust
pub enum LspError {
    SpawnFailed { command: String, source: std::io::Error },
    InitializeTimeout,
    ServerError { code: i64, message: String },
    MalformedMessage(String),
    AlreadyStopped,
    UnsupportedLanguage(String),
    Io(std::io::Error),
    Json(serde_json::Error),
    Cancelled,
    InvalidContentLength(String),
    UnexpectedResponseId(i64),
}
```

Each variant maps to a distinct failure scenario:

| Variant | Cause | Recovery |
|---------|-------|----------|
| `SpawnFailed` | Server binary not found or not executable | Fall back to text-based tools |
| `InitializeTimeout` | Server crashed during startup | Retry once, then give up |
| `ServerError` | Server returned a JSON-RPC error | Report to user, retry if transient |
| `MalformedMessage` | Server sent unparseable output | Log and skip |
| `AlreadyStopped` | Request sent after shutdown | Start a new server instance |
| `UnsupportedLanguage` | No server configured for this language | Fall back to text-based tools |
| `Cancelled` | Request's oneshot channel was dropped | Usually means server crashed |

The variant-per-failure approach (rather than a single `String` error) enables the caller to make recovery decisions based on the failure type. A `SpawnFailed` error means the server binary is missing — retrying will not help. A `Cancelled` error might mean the server crashed mid-request — restarting the server and retrying could succeed.

---

## 38.18 Testing Strategy

The LSP integration uses a three-tier testing strategy:

**Tier 1: Unit tests for protocol types.** These test serialization, deserialization, display formatting, and utility functions with no I/O:

```rust
#[test]
fn test_position_from_one_indexed() {
    let p = Position::from_one_indexed(1, 1);
    assert_eq!(p.line, 0);
    assert_eq!(p.character, 0);
}

#[test]
fn test_range_contains_boundaries() {
    let r = Range::new(Position::new(5, 3), Position::new(5, 10));
    assert!(r.contains(Position::new(5, 3)));   // Start is inclusive
    assert!(!r.contains(Position::new(5, 10))); // End is exclusive
}
```

**Tier 2: Integration tests with MockTransport.** These test the `LspClient` and `LspTool` against canned responses:

```rust
#[tokio::test]
async fn test_client_ids() {
    let transport = Arc::new(MockTransport::new());
    let client = LspClient::new(transport);
    assert_eq!(client.next_request_id() + 1, client.next_request_id());
}
```

**Tier 3: Response parser tests.** These verify that the parsers handle every response shape the LSP specification allows:

```rust
#[test]
fn test_parse_locations_single() {
    let v = serde_json::json!({
        "uri": "file:///a",
        "range": {
            "start": {"line": 0, "character": 0},
            "end": {"line": 0, "character": 5}
        }
    });
    assert_eq!(parse_locations(&v).len(), 1);
}

#[test]
fn test_parse_locations_null() {
    assert!(parse_locations(&Value::Null).is_empty());
}
```

The test suite has over 80 test cases covering positions, ranges, locations, diagnostics, completions, symbols, code actions, workspace edits, hover text extraction, URI conversion, severity mapping, action parsing, registry operations, and tool metadata. This density of testing reflects the criticality of the subsystem — a parser bug that drops a location from a `findReferences` response could cause the agent to miss a reference during a rename, silently introducing a bug.

---

## 38.19 Summary

The LSP integration transforms the agent from a text processor into a code-aware assistant. The three-layer architecture — process-backed transport in `services/lsp`, abstract transport with tool integration in `tools/lsp`, and plugin-provided servers in `utils/plugin_utils` — provides a clean separation of concerns where each layer can be tested, extended, and replaced independently.

The key engineering decisions that make the integration robust:

1. **The `LspTransport` trait** decouples the tool from the transport, enabling comprehensive mock-based testing.
2. **Lazy server startup** avoids paying the cost of language servers the agent never needs.
3. **Graceful degradation** — every failure returns `Ok(None)` or a clear error message rather than crashing the agent.
4. **One-indexed to zero-indexed conversion** with `saturating_sub` prevents off-by-one errors from propagating.
5. **Resource caps** on every response type prevent a chatty server from overwhelming the context window.
6. **Case-insensitive action aliases** accommodate the LLM's unpredictable casing and synonym choices.
7. **Plugin-based server registration** makes the set of supported languages extensible without modifying the core code.

In the next chapter (Chapter 39: Analytics and Telemetry), we will see how the agent tracks LSP operation latency and error rates alongside all of its other subsystem metrics, using OpenTelemetry to provide observability into an otherwise opaque system.
