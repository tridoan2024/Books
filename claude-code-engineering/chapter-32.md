# Chapter 32: MCP Tool Integration

The MCP architecture (Chapter 30) gives you transport and connection management. The authentication and security layer (Chapter 31) ensures those connections are trustworthy. But neither of those chapters answers the question that actually matters to the user sitting at the terminal: how do MCP tools appear in the agent's tool palette, how does the agent call them, and what happens to the results?

This is where MCP stops being an infrastructure concern and becomes a user-facing feature. Every MCP tool that an external server exposes needs to be discovered, registered under a namespaced identifier, annotated with behavioral hints, invoked through the JSON-RPC wire protocol, and its results processed -- potentially truncated, persisted to disk, or decoded from binary. The tool integration layer is also where resource access lives: reading structured data from servers that expose `resources/list` and `resources/read` endpoints. And surrounding all of this is the ecosystem question of where MCP servers come from -- the official registry, the marketplace, and the configuration that wires them into a project.

In this chapter, we will build the complete MCP tool integration system. We will start with tool discovery and the naming convention that prevents collisions. Then we will cover tool annotations -- the hints that tell the agent whether a tool reads or writes, whether it reaches the open internet, and how the permission system should treat it. From there we move to result handling: text content, binary content, truncation, and disk persistence for outputs too large to fit in the conversation context. We will then cover MCP resource access as a distinct operation from tool invocation. Finally, we will look at the registry and marketplace -- how users discover MCP servers and how the agent bootstraps its extended capabilities.

---

## 32.1 Tool Discovery and Registration

When an MCP connection completes its handshake (the `initialize` / `notifications/initialized` exchange covered in Chapter 30), the next thing the client does is discover what the server offers. This happens through two protocol methods: `tools/list` and `resources/list`. The tool discovery path is where most of the complexity lives.

### The tools/list Request

After the handshake, the client sends a `tools/list` request with no parameters. The server responds with an array of tool definitions. Here is the wire format:

```json
// Request
{"jsonrpc": "2.0", "id": 3, "method": "tools/list"}

// Response
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "tools": [
      {
        "name": "search_memory",
        "description": "Search across all stored memories using keyword matching and relevance scoring.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": {
              "description": "Search query (keywords)",
              "type": "string"
            },
            "limit": {
              "description": "Max results. Default: 10",
              "type": "number",
              "minimum": 1,
              "maximum": 50
            }
          },
          "required": ["query"]
        }
      }
    ]
  }
}
```

Each tool definition carries three fields: a `name`, an optional `description`, and an `inputSchema` that follows JSON Schema format. The type definition in the client reflects this:

```rust
/// MCP tool definition returned by `tools/list`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolDef {
    /// Unique tool name.
    pub name: String,
    /// Optional human-readable description.
    #[serde(default)]
    pub description: Option<String>,
    /// JSON Schema describing the tool's input parameters.
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
}
```

Note the `#[serde(rename = "inputSchema")]` -- the MCP spec uses camelCase on the wire, but idiomatic Rust uses snake_case internally. This rename annotation handles the translation transparently during serialization and deserialization. The same pattern applies throughout the type system: `mimeType` becomes `mime_type`, `isError` becomes `is_error`.

### The mcp__servername__toolname Naming Convention

Here is the critical design decision. A single Claude Code session can connect to multiple MCP servers simultaneously. Two different servers might both expose a tool called `search`. If you register them both as `search`, you have a collision -- the agent cannot distinguish which server to route the call to.

The solution is the namespaced tool identifier: `mcp__servername__toolname`. The double-underscore delimiter was chosen deliberately because it is unlikely to appear in either server names or tool names, making it an unambiguous separator. When the agent receives a tool list from a server named `copilot-mem` that exposes a tool called `search_memory`, the tool is registered in the agent's palette as:

```
mcp__copilot-mem__search_memory
```

This naming convention serves three purposes:

1. **Collision avoidance.** Two servers can expose identically named tools without conflict. `mcp__copilot-mem__save_fact` and `mcp__sec-sr-mem__save_fact` are different tools routed to different servers.

2. **Server routing.** When the agent decides to call `mcp__copilot-mem__search_memory`, the tool execution engine parses the name to extract the server (`copilot-mem`) and the actual tool name (`search_memory`), then routes the JSON-RPC call to the correct connection.

3. **Permission matching.** The permission system (Chapter 15) can use glob patterns against these names. A rule like `mcp__copilot-mem__*` allows all tools from one server. A rule like `mcp__*__search_*` allows all search tools across all servers.

The `McpManager` implements this routing. When it collects tools from all connected servers, it returns `(server_name, tool_def)` pairs:

```rust
/// List tools across all connected servers.
///
/// Returns `(server_name, tool_def)` pairs so callers know which server
/// owns each tool.
pub fn all_tools(&self) -> Vec<(String, McpToolDef)> {
    let mut out = Vec::new();
    for (name, conn) in &self.connections {
        for tool in conn.tools() {
            out.push((name.clone(), tool.clone()));
        }
    }
    out
}
```

The caller -- typically the tool registry in the query engine -- then constructs the namespaced identifier and registers it as an available tool. This means the system prompt that lists available tools for the model includes entries like:

```
mcp__copilot-mem__search_memory(query: string, limit?: number)
mcp__copilot-mem__save_fact(key: string, value: string)
mcp__sec-sr-mem__capture_app_knowledge(knowledge_type: string, content: string)
```

### Auto-routing: find_tool and call_tool_auto

For callers that already have the full namespaced name parsed, the manager provides explicit routing through `call_tool(server_name, tool_name, arguments)`. But it also provides a convenience method for dynamic discovery:

```rust
/// Look up which server provides a tool by name.
pub fn find_tool(&self, tool_name: &str) -> Option<(String, &McpToolDef)> {
    for (server, conn) in &self.connections {
        for tool in conn.tools() {
            if tool.name == tool_name {
                return Some((server.clone(), tool));
            }
        }
    }
    None
}

/// Automatically route a tool call to the correct server.
pub async fn call_tool_auto(
    &self,
    tool_name: &str,
    arguments: Value,
) -> Result<McpToolResult> {
    let (server, _def) = self
        .find_tool(tool_name)
        .ok_or_else(|| {
            anyhow!("tool '{tool_name}' not found on any connected MCP server")
        })?;
    self.call_tool(&server, tool_name, arguments).await
}
```

`call_tool_auto` is the "I do not care which server, just find who has this tool and call it" method. This works when tool names happen to be unique across all servers, but in production configurations where multiple MCP servers might expose overlapping names, explicit server routing through the namespaced identifier is the reliable path.

### Tool List Refresh

The MCP spec allows servers to change their tool list at runtime -- they signal this via the `listChanged` capability in the `tools` section of the `initialize` response. When this capability is advertised, the client should watch for `notifications/tools/list_changed` notifications and re-fetch the tool list:

```rust
/// Re-fetch the tool list from the server.
pub async fn list_tools(&mut self) -> Result<Vec<McpToolDef>> {
    let tools = self.list_tools_inner().await?;
    self.tools = tools.clone();
    Ok(tools)
}
```

In practice, dynamic tool lists are rare. Most MCP servers expose a fixed set of tools. But the system supports it because some servers -- particularly those that wrap databases or file systems -- may add or remove tools based on the content they discover at runtime.

---

## 32.2 Tool Annotations: Behavioral Hints

Raw tool names and descriptions tell the model what a tool does. Annotations tell the agent *how* the tool behaves -- specifically, whether it is safe to auto-approve, whether it modifies state, and whether it accesses the open internet.

### The Three Core Annotations

The MCP spec defines three boolean hint annotations on tool definitions:

| Annotation | Default | Meaning |
|---|---|---|
| `readOnlyHint` | `false` | When `true`, the tool does not modify any state. It is purely observational -- like reading a file, searching a database, or listing resources. |
| `destructiveHint` | `false` | When `true`, the tool performs destructive or irreversible operations -- like deleting records, dropping tables, or sending emails. |
| `openWorldHint` | `false` | When `true`, the tool accesses external systems beyond the MCP server's own scope -- like making HTTP requests to third-party APIs, querying public databases, or sending webhooks. |

These are *hints*, not enforcement mechanisms. A server can lie about them. But when servers report them honestly, they enable significant improvements in the permission and safety system.

### How Annotations Drive Permission Decisions

The auto-mode classifier (Chapter 16) uses annotations to make faster, more accurate permission decisions. Consider a tool call to `mcp__copilot-mem__search_memory`. Without annotations, the classifier must analyze the tool name, description, and arguments to guess whether it is safe to auto-approve. With annotations:

- `readOnlyHint: true` tells the classifier this tool cannot modify state. Combined with the agent's current permission mode, this can be auto-approved without prompting the user.
- `destructiveHint: true` tells the classifier to always prompt the user, regardless of the permission mode, unless an explicit allow rule exists.
- `openWorldHint: true` tells the classifier to apply additional scrutiny -- the SSRF guard (Chapter 31) and network access policies come into play.

In TypeScript, the integration looks like this when building the tool's permission profile:

```typescript
interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
}

function classifyToolRisk(
  tool: McpToolDef,
  annotations: McpToolAnnotations
): "safe" | "moderate" | "dangerous" {
  if (annotations.destructiveHint) return "dangerous";
  if (annotations.openWorldHint) return "moderate";
  if (annotations.readOnlyHint) return "safe";

  // Fallback: analyze tool name and description heuristically
  return inferRiskFromDescription(tool);
}
```

The fallback is important. Most existing MCP servers do not yet include annotations in their tool definitions. When annotations are absent, the system falls back to heuristic analysis -- checking whether the tool name contains words like "delete", "remove", "write", "send", or "execute", and rating the risk accordingly.

### Annotation Propagation to the System Prompt

Annotations also flow into the system prompt. When constructing the tool descriptions that the model sees, tools with `readOnlyHint: true` get a marker indicating they are safe for information gathering. Tools with `destructiveHint: true` get a warning that the model should confirm intent before calling them. This gives the model itself -- not just the permission system -- information about tool behavior:

```
## Available MCP Tools

### mcp__copilot-mem__search_memory [read-only]
Search across all stored memories using keyword matching and relevance scoring.
Parameters: query (string, required), limit (number, optional)

### mcp__copilot-mem__forget [destructive]
Explicitly forget a memory by key or ID. The memory is archived before deletion.
Parameters: key_or_id (string, required), reason (string, optional)
```

This dual annotation path -- one for the permission classifier, one for the model -- creates defense in depth. Even if the permission system has a bug, the model itself has been told that `forget` is destructive and will tend to confirm with the user before calling it.

---

## 32.3 Tool Invocation: The Wire Protocol

When the agent decides to call an MCP tool, the execution engine must serialize the arguments, send them over the wire, wait for the response, and handle timeouts and errors. The wire protocol is straightforward but the devil is in the details.

### The tools/call Request

A tool invocation sends a `tools/call` JSON-RPC request with two parameters: the tool name and the arguments object:

```rust
/// Call a tool on this server and return the structured result.
pub async fn call_tool(&self, name: &str, arguments: Value) -> Result<McpToolResult> {
    let params = serde_json::json!({
        "name": name,
        "arguments": arguments,
    });

    let resp = tokio::time::timeout(
        REQUEST_TIMEOUT,
        self.send_request("tools/call", Some(params)),
    )
    .await
    .map_err(|_| {
        anyhow!(
            "MCP tools/call '{name}' timed out after {}s on '{}'",
            REQUEST_TIMEOUT.as_secs(),
            self.server_name,
        )
    })??;

    let result_value = resp.result.unwrap_or(Value::Null);
    let tool_result: McpToolResult =
        serde_json::from_value(result_value).context("failed to parse McpToolResult")?;
    Ok(tool_result)
}
```

Three things to note here. First, the 30-second default timeout (`REQUEST_TIMEOUT`). MCP tools can be slow -- a tool that queries a database, calls an external API, or processes a large file might take time. But 30 seconds is a reasonable upper bound for most operations. The deep client variant increases this for sampling requests (120 seconds) where LLM inference is involved.

Second, the double `?` after the timeout. The outer `?` unwraps the `Result` from the timeout (which produces an `Err` if the timeout elapsed). The inner `?` unwraps the `Result` from the actual `send_request` call (which produces an `Err` if the JSON-RPC response carried an error). This is a common Rust pattern when wrapping async operations with timeouts.

Third, notice that the arguments are passed as a `serde_json::Value` -- not a strongly typed struct. This is by design. MCP tools have arbitrary input schemas defined by the server, so the client cannot know the argument types at compile time. The validation happens at two points: the model generates arguments that match the JSON Schema in the tool definition, and the server validates them against its own schema before executing.

### Argument Validation Before Send

The deep client adds a pre-flight validation step. Before serializing and sending arguments over the wire, it checks both the payload size and the schema conformance:

```rust
/// Maximum argument payload size (1 MB).
const MAX_ARG_PAYLOAD_SIZE: usize = 1_048_576;

// Validate payload size
let serialized = serde_json::to_string(&args)
    .context("failed to serialize tool arguments")?;
if serialized.len() > MAX_ARG_PAYLOAD_SIZE {
    return Err(anyhow!(
        "tool arguments exceed maximum size ({} > {MAX_ARG_PAYLOAD_SIZE})",
        serialized.len(),
    ));
}
```

The 1 MB payload limit exists to prevent the model from accidentally sending enormous blobs through MCP. If the model decides to pass an entire file's contents as a tool argument, the validation catches it before it hits the wire. The schema validation is more nuanced -- it checks required properties, type mismatches, string lengths, number ranges, and enum values:

```rust
pub fn validate_tool_args(schema: &Value, args: &Value) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    // Type validation
    if let Some(expected_type) = schema.get("type").and_then(|t| t.as_str()) {
        let actual_type = json_type_name(args);
        if expected_type != actual_type && expected_type != "any" {
            errors.push(ValidationError {
                path: "$".to_string(),
                message: format!("expected type '{expected_type}', got '{actual_type}'"),
                expected: Some(expected_type.to_string()),
                actual: Some(actual_type.to_string()),
            });
            return errors;
        }
    }

    // Required properties, type checks, enum validation, range checks...
}
```

This is a performance optimization as much as a correctness measure. A failed tool call wastes a round trip to the server, the model's output tokens for generating the arguments, and user time. Catching obvious schema violations before they hit the wire saves all three.

### Retry Logic with Exponential Backoff

MCP servers are external processes. They crash, they hang, they run out of memory. The tool invocation layer handles transient failures through automatic retry with exponential backoff:

```rust
pub async fn send_with_retry(
    &self,
    method: &str,
    params: Option<Value>,
    max_retries: u32,
) -> Result<JsonRpcResponse> {
    let mut last_error = None;

    for attempt in 0..=max_retries {
        if attempt > 0 {
            let delay = Duration::from_millis(200 * 2u64.pow(attempt - 1));
            tokio::time::sleep(delay).await;
        }

        match tokio::time::timeout(
            REQUEST_TIMEOUT,
            self.send_request(method, params.clone()),
        ).await {
            Ok(Ok(resp)) => return Ok(resp),
            Ok(Err(e)) => {
                let msg = e.to_string();
                if msg.contains("timeout")
                    || msg.contains("EOF")
                    || msg.contains("broken pipe")
                {
                    last_error = Some(e);
                    continue;
                }
                return Err(e); // Non-retryable error
            }
            Err(_timeout) => {
                last_error = Some(anyhow!("request timed out"));
                continue;
            }
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow!("request failed after retries")))
}
```

The retry logic distinguishes between retryable and non-retryable errors. Timeouts, EOF (server process died), and broken pipes are retryable -- the server might recover or be restarted. But a JSON-RPC error with code `-32601` (method not found) is not retryable -- the server genuinely does not support that method, and retrying will produce the same result. The backoff starts at 200ms and doubles: 200ms, 400ms, 800ms. This prevents thundering-herd effects when a server is overloaded.

### Concurrent Tool Calls

When the agent needs to call multiple MCP tools in a single turn (a common pattern -- "search memory AND check project knowledge"), the manager supports concurrent execution:

```rust
pub async fn call_tools_concurrent(
    &self,
    calls: Vec<(String, String, Value)>,
) -> Vec<Result<McpToolResult>> {
    let futures: Vec<_> = calls
        .into_iter()
        .map(|(server, tool, args)| {
            let conn = self.connections.get(&server);
            async move {
                let conn = conn.ok_or_else(|| {
                    anyhow!("MCP server '{server}' not found")
                })?;
                conn.call_tool(&tool, args).await
            }
        })
        .collect();

    futures::future::join_all(futures).await
}
```

`join_all` runs all the futures concurrently and collects their results in order. This is important for performance -- if you need results from three MCP servers, calling them sequentially takes 3x the latency. Calling them concurrently takes only as long as the slowest server. Note that calls to the *same* server are still serialized through the connection's stdin/stdout mutexes, since JSON-RPC over stdio is inherently serial. But calls to *different* servers run in true parallel.

---

## 32.4 Result Handling: Text, Errors, and Content Types

The response from a `tools/call` invocation carries a structured result with a content array and an error flag:

```rust
/// Result of a `tools/call` invocation.
#[derive(Debug, Serialize, Deserialize)]
pub struct McpToolResult {
    /// Content items returned by the tool.
    #[serde(default)]
    pub content: Vec<McpContent>,
    /// Whether the tool invocation produced an error.
    #[serde(rename = "isError", default)]
    pub is_error: Option<bool>,
}
```

### The Content Array

A tool result is not a simple string. It is an array of content items, each with a type discriminator. The three content types defined by the MCP spec are:

```rust
/// A single content item inside an `McpToolResult` or prompt message.
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct McpContent {
    /// Content type discriminator ("text", "image", "resource").
    #[serde(rename = "type")]
    pub content_type: String,
    /// Text payload (when content_type == "text").
    #[serde(default)]
    pub text: Option<String>,
    /// Base64-encoded payload (images, binary data).
    #[serde(default)]
    pub data: Option<String>,
    /// MIME type for image/resource content.
    #[serde(rename = "mimeType", default)]
    pub mime_type: Option<String>,
}
```

| Type | Fields Used | Example |
|---|---|---|
| `text` | `text` | Search results, error messages, JSON data |
| `image` | `data`, `mimeType` | Screenshots, generated charts, diagrams |
| `resource` | Embedded `McpResourceContent` | Referenced files, database records |

Most tool results contain a single text content item. The `text()` convenience method on `McpToolResult` concatenates all text items into a single string, which is what most callers want:

```rust
impl McpToolResult {
    /// Concatenate all text content pieces into a single string.
    pub fn text(&self) -> String {
        self.content
            .iter()
            .filter_map(|c| c.text.as_deref())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Returns true if the tool reported an error.
    pub fn errored(&self) -> bool {
        self.is_error.unwrap_or(false)
    }
}
```

### The 100K Character Truncation

Here is where the engineering gets real. MCP tools can return enormous results. A `search_memory` call might return thousands of results. A `read_resource` call might return a 10MB file. If you feed all of that into the conversation context, you blow through the model's context window budget and your token costs explode.

The solution is truncation at 100,000 characters (approximately 25,000 tokens, depending on the content). When a tool result's text content exceeds this limit, the system truncates it and appends a notice:

```typescript
const MAX_TOOL_RESULT_CHARS = 100_000;

function processToolResult(result: McpToolResult): string {
  let text = result.text();

  if (text.length > MAX_TOOL_RESULT_CHARS) {
    const truncated = text.substring(0, MAX_TOOL_RESULT_CHARS);
    const originalSize = text.length;
    const savedPath = persistLargeResult(text);

    text = truncated + `\n\n[Result truncated. Original: ${originalSize} chars. `
      + `Full output saved to: ${savedPath}]`;
  }

  return text;
}
```

The truncation preserves the beginning of the output (where the most relevant results typically appear) and tells the model where to find the full version. The model can then use the file read tool to access specific sections of the persisted output if it needs more detail.

### Disk Persistence for Large Results

When truncation fires, the full output is saved to disk so nothing is lost. The storage uses a structured directory layout:

```rust
/// Output storage subdirectory.
const OUTPUT_STORAGE_DIR: &str = ".rcode/mcp_outputs";

pub fn output_storage_save(
    data_dir: &Path,
    server_id: &str,
    tool: &str,
    output: &Value,
) -> Result<()> {
    let dir = data_dir.join(OUTPUT_STORAGE_DIR).join(server_id);
    std::fs::create_dir_all(&dir)?;

    let sanitized_tool = tool.replace(
        ['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_"
    );
    let filename = format!("{sanitized_tool}.json");
    let path = dir.join(&filename);

    let serialized = serde_json::to_string_pretty(output)?;
    std::fs::write(&path, serialized)?;
    Ok(())
}
```

The file layout looks like:

```
.rcode/mcp_outputs/
  copilot-mem/
    search_memory.json
    get_project_knowledge.json
  sec-sr-mem/
    search_memory.json
    capture_app_knowledge.json
```

Tool names are sanitized -- characters that are illegal in filenames (`/`, `\`, `:`, `*`, etc.) are replaced with underscores. The previous output for a given server/tool combination is overwritten, not accumulated, to prevent unbounded disk growth. If the user needs historical results, those are available in the session transcript (Chapter 24).

### Error Results

Tools signal errors through the `isError` flag rather than through JSON-RPC errors. A JSON-RPC error means the *protocol* failed (method not found, server crashed, parse error). An `isError: true` in the tool result means the tool *executed* but encountered a logical error (file not found, permission denied, invalid query). This distinction matters for retry logic -- protocol errors are retryable, logical errors are not.

```rust
impl McpToolResult {
    /// Create an error result.
    pub fn error_result(message: impl Into<String>) -> Self {
        Self {
            content: vec![McpContent::text(message)],
            is_error: Some(true),
        }
    }
}
```

When the agent receives an error result, it includes the error text in the conversation context just like a successful result. The model can then decide whether to retry with different arguments, try a different approach, or report the error to the user.

---

## 32.5 Binary Content: Base64 Encoding and File Persistence

Not all tool results are text. An MCP tool that generates a chart, takes a screenshot, or reads a binary file returns image content encoded in Base64:

```rust
impl McpContent {
    /// Create an image content item from base64-encoded data.
    pub fn image(data: impl Into<String>, mime_type: impl Into<String>) -> Self {
        Self {
            content_type: "image".to_string(),
            text: None,
            data: Some(data.into()),
            mime_type: Some(mime_type.into()),
        }
    }
}
```

### The Base64 Encoding Tax

Base64 encoding expands data by approximately 33%. A 1 MB PNG image becomes 1.33 MB of Base64 text. More importantly, Base64 text is opaque to the model -- it cannot "read" the image from its Base64 representation. So binary content follows a different processing path than text content.

When the tool execution engine encounters image content in a tool result, it:

1. Decodes the Base64 data
2. Writes it to a temporary file with the appropriate extension (`.png`, `.jpg`, `.pdf` based on the MIME type)
3. Returns a reference to the file path in the conversation context
4. For multimodal models, may also include the image directly in the message for visual understanding

```typescript
function processBinaryContent(content: McpContent): ProcessedContent {
  if (content.content_type !== "image" || !content.data) {
    throw new Error("Not image content");
  }

  const buffer = Buffer.from(content.data, "base64");
  const ext = mimeToExtension(content.mime_type ?? "application/octet-stream");
  const tmpPath = path.join(os.tmpdir(), `mcp-output-${uuid()}${ext}`);
  fs.writeFileSync(tmpPath, buffer);

  return {
    type: "image_reference",
    path: tmpPath,
    mimeType: content.mime_type,
    sizeBytes: buffer.length,
  };
}

function mimeToExtension(mime: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "application/pdf": ".pdf",
    "application/octet-stream": ".bin",
  };
  return map[mime] ?? ".bin";
}
```

### Content Type Detection

The resource module includes content type detection logic that determines how to handle arbitrary MIME types:

```rust
pub fn detect_content_type(mime: &str) -> ContentType {
    let is_binary = mime.starts_with("application/octet")
        || mime.starts_with("image/")
        || mime.starts_with("audio/")
        || mime.starts_with("video/");
    let is_streamable = mime.contains("stream")
        || mime.starts_with("text/event-stream");
    let encoding = if !is_binary {
        Some("utf-8".to_string())
    } else {
        None
    };

    ContentType {
        mime_type: mime.to_string(),
        encoding,
        is_binary,
        is_streamable,
    }
}
```

Binary content always goes to disk. Text content goes to the conversation context (with truncation). Streamable content (like SSE streams) is consumed incrementally and may update the UI in real time rather than waiting for the complete response.

---

## 32.6 MCP Resource Access: List and Read Operations

Tools are imperative -- you call them with arguments and they do something. Resources are declarative -- they represent data that exists on the server, identified by URIs, that you can list and read. The distinction matters because resources are inherently read-only (there is no `resources/write` in the MCP spec), making them safe to access without destructive-action checks.

### Resource Discovery

Resource discovery follows the same pattern as tool discovery. After the handshake, the client sends `resources/list`:

```rust
async fn list_resources_inner(&self) -> Result<Vec<McpResource>> {
    let resp = self.send_request("resources/list", None).await?;
    let result = resp.result.unwrap_or(Value::Null);
    let resources: Vec<McpResource> = result
        .get("resources")
        .cloned()
        .map(serde_json::from_value)
        .transpose()?
        .unwrap_or_default();
    Ok(resources)
}
```

Each resource has a URI, a name, an optional description, and an optional MIME type:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResource {
    /// Unique resource URI.
    pub uri: String,
    /// Human-readable name.
    pub name: String,
    /// Optional description.
    #[serde(default)]
    pub description: Option<String>,
    /// Optional MIME type.
    #[serde(rename = "mimeType", default)]
    pub mime_type: Option<String>,
}
```

Resource URIs follow standard URI syntax but use MCP-specific schemes. Common patterns include:

```
file:///workspace/src/main.rs          # Local files exposed by a filesystem server
mcp://memory/facts/user-preferences    # Server-internal data
db://postgres/tables/users             # Database resources
```

### Reading Resources

Reading a resource is a single JSON-RPC call:

```rust
/// Read a resource by URI and return its text content.
pub async fn read_resource(&self, uri: &str) -> Result<String> {
    let params = serde_json::json!({ "uri": uri });

    let resp = tokio::time::timeout(
        REQUEST_TIMEOUT,
        self.send_request("resources/read", Some(params)),
    ).await
    .map_err(|_| {
        anyhow!(
            "MCP resources/read timed out for '{}' on '{}'",
            uri,
            self.server_name,
        )
    })??;

    let result_value = resp.result.unwrap_or(Value::Null);

    // The spec returns { contents: [{ uri, text, mimeType }] }
    if let Some(contents) = result_value.get("contents").and_then(|c| c.as_array()) {
        let texts: Vec<&str> = contents
            .iter()
            .filter_map(|c| c.get("text").and_then(|t| t.as_str()))
            .collect();
        return Ok(texts.join("\n"));
    }

    Ok(serde_json::to_string_pretty(&result_value)?)
}
```

Note the response structure: `{ contents: [{ uri, text, mimeType }] }`. The `contents` array typically has one element, but the spec allows multiple (for example, a resource that spans multiple files). The client joins all text elements with newlines.

### Resource Subscriptions

Some MCP servers support subscriptions -- the client registers interest in a resource, and the server sends notifications when it changes:

```rust
pub async fn subscribe_resource(&self, uri: &str) -> Result<()> {
    let params = serde_json::json!({ "uri": uri });
    tokio::time::timeout(
        REQUEST_TIMEOUT,
        self.send_request("resources/subscribe", Some(params)),
    ).await??;
    Ok(())
}
```

The server advertises subscription support through its capabilities:

```rust
pub struct ResourcesCapability {
    /// Whether the resource list can change at runtime.
    #[serde(rename = "listChanged", default)]
    pub list_changed: bool,
    /// Whether the server supports subscriptions to resource updates.
    #[serde(default)]
    pub subscribe: bool,
}
```

When `subscribe: true`, the client can call `resources/subscribe` and `resources/unsubscribe`. Change notifications arrive as JSON-RPC notifications on the connection, dispatched to the registered notification handler. The resource manager tracks these subscriptions and routes notifications to interested parties:

```rust
impl ResourceManager {
    pub fn subscribe(&mut self, uri_pattern: &str, subscriber_id: &str) -> String {
        let id = format!("sub-{}", self.next_sub_id);
        self.next_sub_id += 1;
        self.subscriptions.push(Subscription {
            id: id.clone(),
            uri_pattern: uri_pattern.to_string(),
            subscriber_id: subscriber_id.to_string(),
            created_at: current_timestamp(),
            active: true,
        });
        id
    }

    pub fn notify_change(&mut self, notification: ChangeNotification) -> usize {
        let matching: Vec<String> = self.subscriptions
            .iter()
            .filter(|s| s.active && uri_matches_pattern(
                &s.uri_pattern, &notification.resource_uri
            ))
            .map(|s| s.subscriber_id.clone())
            .collect();
        let count = matching.len();
        self.notification_queue.push((notification, matching));
        count
    }
}
```

URI pattern matching supports wildcards: `mcp://data/*` matches any resource under the `mcp://data/` prefix. This allows a subscriber to watch an entire subtree without subscribing to each resource individually.

### Resource Templates

Some servers expose parameterized resource URIs through templates (RFC 6570):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceTemplate {
    /// URI template with placeholders (RFC 6570).
    #[serde(rename = "uriTemplate")]
    pub uri_template: String,
    /// Human-readable name.
    pub name: String,
    /// Optional description.
    #[serde(default)]
    pub description: Option<String>,
}
```

A template like `db://postgres/tables/{table_name}/rows/{row_id}` tells the client "you can read any row from any table by filling in the placeholders." The agent uses these templates to construct resource URIs dynamically based on context.

---

## 32.7 The MCP JSON-RPC Error Protocol

Understanding the error code system is essential for building robust tool integration. The MCP spec defines both standard JSON-RPC errors and MCP-specific error codes:

```rust
// Standard JSON-RPC 2.0 errors
pub const PARSE_ERROR: i64 = -32700;
pub const INVALID_REQUEST: i64 = -32600;
pub const METHOD_NOT_FOUND: i64 = -32601;
pub const INVALID_PARAMS: i64 = -32602;
pub const INTERNAL_ERROR: i64 = -32603;

// MCP-specific errors (within the server error range)
pub const MCP_RESOURCE_NOT_FOUND: i64 = -32002;
pub const MCP_TOOL_NOT_FOUND: i64 = -32001;
pub const MCP_NOT_INITIALIZED: i64 = -32003;
pub const MCP_ALREADY_INITIALIZED: i64 = -32004;
pub const MCP_PROMPT_NOT_FOUND: i64 = -32005;
```

The error handling logic in the wire protocol layer classifies errors into recoverable and terminal categories:

| Error Code | Category | Action |
|---|---|---|
| `-32700` Parse error | Terminal | Log and fail -- server cannot understand our messages |
| `-32600` Invalid request | Terminal | Fix the request format |
| `-32601` Method not found | Terminal | Server does not support this method |
| `-32602` Invalid params | Retryable with fix | Model generated bad arguments; regenerate |
| `-32603` Internal error | Retryable | Server had a transient failure |
| `-32001` Tool not found | Terminal | Tool was removed or never existed |
| `-32002` Resource not found | Terminal | Resource URI is invalid |
| `-32003` Not initialized | Retryable | Handshake was lost; reinitialize |

The `MCP_NOT_INITIALIZED` error is particularly interesting. It occurs when a server connection loses its handshake state -- perhaps the server process restarted. When the client receives this error, it should re-run the `initialize` handshake before retrying the original request.

---

## 32.8 Server Health and Lifecycle Management

MCP servers are external processes that can fail at any time. The tool integration layer includes health monitoring and lifecycle management to handle this gracefully.

### Health Checks

The health check sends a lightweight request (typically `tools/list`) and measures whether the server responds within a timeout:

```rust
/// Send a lightweight ping to verify the server is responsive.
pub async fn health_check(&self) -> Result<()> {
    tokio::time::timeout(
        HEALTH_CHECK_TIMEOUT,  // 5 seconds
        self.send_request("tools/list", None),
    ).await
    .map_err(|_| {
        anyhow!("health check timed out for MCP server '{}'", self.server_name)
    })??;
    Ok(())
}
```

The deep client extends this with a three-state health model:

```rust
pub enum HealthStatus {
    Healthy,                  // Responding normally
    Degraded(String),         // Responding but slow or partially
    Unhealthy(String),        // Not responding
    Unknown,                  // Not yet checked
}
```

Degraded servers are still usable -- the agent can call their tools, but the UI might show a warning. Unhealthy servers trigger automatic reconnection.

### Server Restart

When a server becomes unhealthy, the manager can restart it using the stored configuration:

```rust
pub async fn restart_server(&mut self, name: &str) -> Result<()> {
    let cfg = self.configs.get(name).cloned()
        .ok_or_else(|| anyhow!("no config stored for MCP server '{name}'"))?;

    // Shut down existing connection
    if let Some(old) = self.connections.remove(name) {
        let _ = old.shutdown().await;
    }

    // Spawn fresh connection
    let conn = McpConnection::connect(
        &cfg.name, &cfg.command, &cfg.args, &cfg.env
    ).await?;
    self.connections.insert(name.to_string(), conn);
    Ok(())
}
```

The stored configs (`self.configs`) are captured at connect time, so the manager can restart any server without needing the original configuration source.

---

## 32.9 Official Registry and Marketplace

MCP servers have to come from somewhere. Two official discovery mechanisms exist.

### The MCP Server Registry

The official MCP server registry at `https://registry.mcp.so` provides a curated directory of servers. Each entry includes the server name, description, installation command, and compatible clients. The registry is the "npm for MCP servers" -- it provides discoverability and a degree of trust (verified publishers, compatibility testing).

### The Claude Code Marketplace

Within Claude Code specifically, the plugin marketplace at `https://marketplace.claude.ai` hosts MCP servers as plugins. Users install them through the marketplace UI or via the CLI:

```bash
# Install an MCP server from the marketplace
claude install mcp-server-github

# List installed MCP servers
claude mcp list

# Add a custom MCP server
claude mcp add my-server -- npx @my-org/mcp-server
```

Installed servers are registered in `.mcp.json` at the project root or in the user's global settings:

```json
{
  "mcpServers": {
    "copilot-mem": {
      "command": "npx",
      "args": ["-y", "@anthropic/copilot-mem-server"],
      "env": {
        "DATA_DIR": "~/.copilot_home"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

The configuration supports environment variable interpolation (`${GITHUB_TOKEN}`) so credentials are not hardcoded. As discussed in Chapter 31, the auth layer handles the actual credential management.

### Server Scopes

Servers can be configured at multiple scopes, with inner scopes overriding outer ones:

| Scope | Location | Purpose |
|---|---|---|
| Project | `.mcp.json` in project root | Project-specific servers |
| User | `~/.claude/settings.json` | Personal servers across all projects |
| Managed | Enterprise MDM settings | Organization-mandated servers |
| Dynamic | Runtime via plugin install | Temporarily added during a session |

When Claude Code starts, it loads and merges MCP configurations from all scopes, connects to the servers, discovers their tools and resources, and registers everything in the tool palette. The entire process -- from reading `.mcp.json` to having tools available -- typically completes in 2-5 seconds depending on how many servers are configured and how quickly they start.

---

## 32.10 Putting It All Together: The Tool Integration Flow

Here is the complete flow when a user asks the agent to do something that requires an MCP tool:

```
User: "What do you remember about the rcode project?"
          │
          ▼
┌─────────────────────────────────┐
│ Model generates tool_use block: │
│ mcp__copilot-mem__search_memory │
│ { "query": "rcode project" }    │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Tool Execution Engine           │
│ 1. Parse name → server:         │
│    "copilot-mem" / "search_memory"│
│ 2. Check permissions             │
│ 3. Validate args vs schema       │
│ 4. Check payload size (< 1MB)    │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ MCP Manager                     │
│ 1. Find connection for server   │
│ 2. Send tools/call JSON-RPC     │
│ 3. Wait with 30s timeout        │
│ 4. Retry on transient failures  │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Result Processing               │
│ 1. Parse McpToolResult          │
│ 2. Extract text/image/resource  │
│ 3. Truncate at 100K chars       │
│ 4. Persist large results to disk│
│ 5. Decode binary → temp files   │
│ 6. Return to conversation       │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Model receives tool result and  │
│ generates response to user      │
└─────────────────────────────────┘
```

Each step in this pipeline has failure handling. If the server is disconnected, the manager attempts reconnection. If the tool call times out, it retries with backoff. If the result is too large, it truncates and persists. If the content is binary, it decodes and saves to disk. The user sees a clean response -- they never see the JSON-RPC messages, the Base64 encoding, or the truncation notices unless they look at the raw conversation transcript.

---

## 32.11 Design Decisions and Trade-offs

Several non-obvious design decisions shape this system.

**Why double-underscore for namespacing?** Single underscore is too common in tool names (`search_memory`). Slash conflicts with filesystem paths. Dot conflicts with domain names. Double-underscore is rare enough to be unambiguous while remaining valid in most identifier syntaxes.

**Why 100K character truncation?** This balances information density against context window cost. At approximately 4 characters per token, 100K characters is roughly 25K tokens -- significant but not overwhelming in a 200K context window. The model gets enough data to answer most questions directly, and can request more via the persisted file.

**Why not stream tool results?** The JSON-RPC protocol over stdio is request-response. Streaming would require a different wire format (like JSON Lines or SSE). The MCP spec supports progress notifications for long-running tools, but the actual result is delivered as a single response. This simplifies error handling and retry logic at the cost of latency for slow tools.

**Why persist outputs to overwrite, not accumulate?** Disk space. If every tool call persisted its full output indefinitely, a busy agent session could generate gigabytes of output files. Overwriting the previous output for the same server/tool combination keeps disk usage bounded. Historical outputs are preserved in the session transcript for users who need them.

**Why validate arguments client-side?** Defense in depth. The server will validate too, but a client-side check catches obvious errors before a network round trip. This is especially valuable for the model's iterative tool use -- if the model generates invalid arguments, catching them immediately means the model gets feedback in the same turn rather than waiting for the server to reject them.

---

## Summary

MCP tool integration is the layer that transforms raw protocol connections into usable agent capabilities. The `mcp__servername__toolname` naming convention prevents tool collisions across servers. Tool annotations -- `readOnlyHint`, `destructiveHint`, `openWorldHint` -- inform both the permission classifier and the model itself about tool behavior. The result handling pipeline manages text truncation at 100K characters, disk persistence for large outputs, and Base64-to-file conversion for binary content. Resource access provides a read-only data retrieval path complementary to imperative tool calls. And the official registry and marketplace ecosystem gives users a straightforward way to discover and install MCP servers.

As discussed in Chapter 30, the MCP architecture provides the transport. As covered in Chapter 31, the auth layer secures it. This chapter completes the picture: how the agent discovers tools, calls them safely, and processes their results for the conversation. In the next chapter, we will move to a different scale entirely -- multi-agent orchestration through the swarm system, where multiple agent instances coordinate through shared mailboxes and task dependencies.
