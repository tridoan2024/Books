# Chapter 15: MCP — Model Context Protocol Integration

An AI agent that can only call its own built-in tools is fundamentally limited. The tool set is frozen at compile time, the capabilities are whatever the agent's authors chose to implement, and extending functionality means modifying the agent itself. The Model Context Protocol (MCP) breaks this constraint by defining a standardized interface through which external servers can expose tools, resources, and prompts to an AI agent at runtime. Claude Code's MCP integration — approximately 13,200 lines across 26 files — transforms a closed tool system into an open one.

This chapter covers how Claude Code discovers, connects to, authenticates with, and invokes MCP servers. The engineering is substantial: eight transport types (six in the public schema plus two internal variants), seven configuration scopes, an OAuth authentication flow with PKCE and token refresh, SSRF protection for remote servers, a real-time elicitation system for collecting user input, and a connection lifecycle with exponential-backoff reconnection. Understanding how this system works is essential for anyone building an extensible AI agent.

---

## 15.1 Architecture Overview

The MCP subsystem lives primarily in `services/mcp/` (22 files, ~11,500 lines) with supporting utilities in `tools/MCPTool/`, `utils/mcpValidation.ts`, `utils/mcpOutputStorage.ts`, and `utils/mcpWebSocketTransport.ts`.

The central file is `services/mcp/client.ts` at 3,348 lines. It owns connection management, transport initialization, tool discovery, and tool execution. Around it sit specialized modules for each concern:

| File | Lines | Responsibility |
|------|-------|----------------|
| `client.ts` | 3,348 | Connection lifecycle, transport setup, tool discovery, tool execution |
| `auth.ts` | 2,465 | OAuth flow, token management, ClaudeAuthProvider |
| `config.ts` | 1,578 | Multi-scope config resolution, policy enforcement, deduplication |
| `useManageMCPConnections.ts` | 1,141 | React hook: lifecycle management, reconnection, state batching |
| `utils.ts` | 575 | Approval status, hashing, filtering, stale detection |
| `elicitationHandler.ts` | 313 | User input requests from MCP servers |
| `types.ts` | 258 | Type definitions and Zod schemas |
| `channelPermissions.ts` | 240 | Channel permission relay |
| `headersHelper.ts` | 138 | Dynamic header injection via external scripts |
| `SdkControlTransport.ts` | 136 | SDK-to-CLI transport bridge |
| `mcpStringUtils.ts` | 106 | Tool name parsing and building |
| `InProcessTransport.ts` | 63 | In-process linked transport pair |
| `envExpansion.ts` | 38 | Environment variable expansion in configs |
| `normalization.ts` | 23 | Server name normalization |

The data flows through four phases, mirroring the general pattern we saw in the query loop (Chapter 4) where each phase has its own error handling and recovery:

```
Configuration Resolution → Connection Establishment → Tool Discovery → Tool Execution
       config.ts         →        client.ts          →   client.ts   →   client.ts
```

Each phase has its own error handling, caching, and retry logic. We will walk through them in order.

---

## 15.2 The Type System

Before examining the implementation, the type system at `types.ts` defines the contracts that every other module depends on.

### Transport Types

```typescript
// types.ts:23-26
export const TransportSchema = lazySchema(() =>
  z.enum(['stdio', 'sse', 'sse-ide', 'http', 'ws', 'sdk']),
)
```

Six transport types in the public schema. Internally, two additional types exist: `ws-ide` for IDE WebSocket extensions and `claudeai-proxy` for the claude.ai connector proxy. Each transport type has its own Zod schema defining the required configuration fields.

### Configuration Scopes

```typescript
// types.ts:10-20
export const ConfigScopeSchema = lazySchema(() =>
  z.enum(['local', 'user', 'project', 'dynamic', 'enterprise', 'claudeai', 'managed']),
)
```

Seven scope levels with strict precedence. Enterprise configs are exclusive — when present, all other sources are ignored entirely. This is the nuclear option for organizations that need absolute control over which MCP servers their engineers connect to.

### Connection State Machine

Every MCP server connection exists in one of five states, modeled as a discriminated union. This follows the same discriminated-union pattern we saw in Chapter 3's state architecture, where each variant carries exactly the data relevant to its state:

```typescript
// types.ts:180-226
export type MCPServerConnection =
  | ConnectedMCPServer    // Has Client, capabilities, cleanup()
  | FailedMCPServer       // Has error string
  | NeedsAuthMCPServer    // Awaiting OAuth
  | PendingMCPServer      // Has reconnectAttempt counter
  | DisabledMCPServer     // User disabled
```

The `ConnectedMCPServer` type carries the full runtime state: an MCP SDK `Client` reference, `ServerCapabilities` describing what the server supports, optional `instructions` (server-defined text injected into the system prompt), and a `cleanup()` async function that encapsulates teardown including process signaling. This cleanup function is the sole owner of server lifecycle termination — no other code path should attempt to kill server processes directly. The MCP monitoring task type (`monitor_mcp`) from Chapter 14's background task system tracks these connections in the UI, showing the user which servers are connected and their health status.

---

## 15.3 Transport Types

The six transport types exist because MCP servers run in fundamentally different environments. A local Python script needs stdio pipes. A remote API needs HTTP. An IDE extension needs a WebSocket to the host editor. The transport layer abstracts these differences so the rest of the MCP system works identically regardless of how messages travel.

| Transport | Protocol | Use Case | Auth | Reconnect |
|-----------|----------|----------|------|-----------|
| `stdio` | stdin/stdout pipes | Local processes (Python, Node scripts) | N/A | No |
| `sse` | Server-Sent Events | Remote servers (legacy) | OAuth, headers | Yes |
| `http` | Streamable HTTP | Remote servers (current standard) | OAuth, headers | Yes |
| `ws` | WebSocket | Real-time bidirectional servers | Headers | Yes |
| `sdk` | In-process bridge | SDK-embedded MCP servers | N/A | No |
| In-process | Linked pair | Built-in servers (Chrome MCP, Computer Use) | N/A | No |

### Stdio Transport

The most common transport for local MCP servers. Claude Code spawns a child process and communicates over stdin/stdout:

```typescript
// client.ts:944-958
const finalCommand = process.env.CLAUDE_CODE_SHELL_PREFIX || serverRef.command
const finalArgs = process.env.CLAUDE_CODE_SHELL_PREFIX
  ? [[serverRef.command, ...serverRef.args].join(' ')]
  : serverRef.args
transport = new StdioClientTransport({
  command: finalCommand,
  args: finalArgs,
  env: { ...subprocessEnv(), ...serverRef.env } as Record<string, string>,
  stderr: 'pipe',
})
```

The `CLAUDE_CODE_SHELL_PREFIX` environment variable enables wrapping server commands — useful for running MCP servers inside containers, through SSH tunnels, or under profiling tools. When set, the original command and arguments are concatenated into a single shell string passed as the sole argument to the prefix command.

The `stderr: 'pipe'` option captures server error output for diagnostic display rather than letting it pollute the terminal.

### SSE and Streamable HTTP

These two transports serve remote MCP servers. SSE (`sse`) is the legacy protocol; Streamable HTTP (`http`) is the current standard. Both support OAuth authentication and custom headers, but their fetch configurations differ in one critical way:

```typescript
// client.ts:492-550
export function wrapFetchWithTimeout(baseFetch: FetchLike): FetchLike {
  return async (url, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method === 'GET') return baseFetch(url, init)  // SSE streams skip timeout

    const controller = new AbortController()
    const timer = setTimeout(
      c => c.abort(new DOMException('The operation timed out.', 'TimeoutError')),
      MCP_REQUEST_TIMEOUT_MS,  // 60s
      controller,
    )
    timer.unref?.()
    // ... parent signal forwarding, cleanup
  }
}
```

GET requests skip the 60-second timeout because SSE event streams are long-lived connections. Only POST requests (tool calls, resource reads) get the timeout. The implementation uses `setTimeout` instead of `AbortSignal.timeout()` because Bun's implementation retains ~2.4KB of native memory per request for the full timeout duration — a meaningful cost when an MCP server makes frequent calls.

The Streamable HTTP transport (`StreamableHTTPClientTransport`) adds session expiry detection: when the server returns HTTP 404 with JSON-RPC error code -32001, the client recognizes the session has expired and triggers a reconnection cycle rather than surfacing a confusing error.

### WebSocket Transport

The WebSocket transport at `utils/mcpWebSocketTransport.ts` (200 lines) handles the complexity of supporting two JavaScript runtimes:

```typescript
// mcpWebSocketTransport.ts
export class WebSocketTransport implements Transport {
  private isBun = typeof Bun !== 'undefined'

  constructor(private ws: WebSocketLike) {
    if (this.isBun) {
      const nws = this.ws as unknown as globalThis.WebSocket
      nws.addEventListener('message', this.onBunMessage)
      nws.addEventListener('error', this.onBunError)
      nws.addEventListener('close', this.onBunClose)
    } else {
      const nws = this.ws as unknown as WsWebSocket
      nws.on('message', this.onNodeMessage)
      nws.on('error', this.onNodeError)
      nws.on('close', this.onNodeClose)
    }
  }
}
```

Bun's native `WebSocket` uses the browser-standard `addEventListener` API. Node.js's `ws` package uses the EventEmitter pattern with `.on()`. The transport normalizes both into the MCP SDK's `Transport` interface so the client layer doesn't know or care which runtime is hosting it.

### In-Process Transport

Some MCP servers run inside the Claude Code process itself — Chrome MCP and Computer Use MCP are the primary examples. Spawning a subprocess for these would add ~325MB of memory overhead per server. The in-process transport avoids this with a linked pair:

```typescript
// InProcessTransport.ts
class InProcessTransport implements Transport {
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) throw new Error('Transport is closed')
    queueMicrotask(() => {
      this.peer?.onmessage?.(message)
    })
  }
}

export function createLinkedTransportPair(): [Transport, Transport] {
  const a = new InProcessTransport()
  const b = new InProcessTransport()
  a._setPeer(b)
  b._setPeer(a)
  return [a, b]
}
```

The `queueMicrotask()` call is load-bearing. Without it, a synchronous request-response cycle would overflow the call stack — client sends request, server synchronously processes and sends response, client synchronously processes response which triggers another request, and so on. The microtask boundary breaks this chain by deferring delivery to the next microtask checkpoint.

### SDK Control Transport

The `SdkControlTransport` at `services/mcp/SdkControlTransport.ts` (136 lines) bridges two separate processes: the Claude Code CLI and an SDK application embedding it. The message flow is:

```
CLI → SdkControlClientTransport.send() → stdout → SDK process
SDK → SdkControlServerTransport.onmessage → MCP Server → send() → callback → CLI
```

Two complementary classes handle each side. The CLI-side `SdkControlClientTransport` serializes MCP messages to stdout for the SDK to consume. The SDK-side `SdkControlServerTransport` deserializes them, routes to the MCP server, and sends responses back through a callback function. SDK MCP servers that use this transport can optionally skip the `mcp__` tool name prefix via the `CLAUDE_AGENT_SDK_MCP_NO_PREFIX` environment variable — a convenience for SDK consumers who control their own namespace.

---

## 15.4 Connection Lifecycle

### Initialization and Handshake

The `connectToServer` function at `client.ts:595-1641` handles the full connection lifecycle. It is memoized by a cache key derived from the server name and serialized config, preventing duplicate connections to the same server.

After transport creation, the client declares its capabilities during the MCP handshake:

```typescript
// client.ts:985-1002
const client = new Client(
  {
    name: 'claude-code',
    title: 'Claude Code',
    version: MACRO.VERSION ?? 'unknown',
    description: "Anthropic's agentic coding tool",
    websiteUrl: PRODUCT_URL,
  },
  {
    capabilities: {
      roots: {},
      elicitation: {},
    },
  },
)
```

Two capabilities are declared. `roots` tells the server that Claude Code can respond to `ListRoots` requests — the handler returns the original CWD as the sole root, giving servers a way to discover the project directory. `elicitation` tells the server that Claude Code supports user input collection — enabling servers to request form data or browser-based authentication during tool execution.

### Connection Timeout

The connection handshake races against a configurable timeout (default 30 seconds, overridable via `MCP_TIMEOUT` environment variable):

```typescript
// client.ts:1048-1077
const connectPromise = client.connect(transport)
const timeoutPromise = new Promise<never>((_, reject) => {
  const timeoutId = setTimeout(() => {
    transport.close().catch(() => {})
    reject(new TelemetrySafeError(...))
  }, getConnectionTimeoutMs())
  connectPromise.then(
    () => clearTimeout(timeoutId),
    () => clearTimeout(timeoutId),
  )
})
await Promise.race([connectPromise, timeoutPromise])
```

On timeout, the transport is closed before rejection. This prevents zombie transport connections that would leak file handles for stdio servers or hold open HTTP connections for remote servers. The error is wrapped in `TelemetrySafeError` to ensure server URLs and credentials never appear in telemetry data.

### Error Detection

The error handler classifies connection failures into terminal and non-terminal categories:

```typescript
// client.ts:1226-1371
const isTerminalConnectionError = (msg: string): boolean => {
  return (
    msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') ||
    msg.includes('EPIPE') || msg.includes('EHOSTUNREACH') ||
    msg.includes('ECONNREFUSED') || msg.includes('Body Timeout Error') ||
    msg.includes('terminated') ||
    msg.includes('SSE stream disconnected') ||
    msg.includes('Failed to reconnect SSE stream')
  )
}
```

After `MAX_ERRORS_BEFORE_RECONNECT` (3) consecutive terminal errors, the system triggers `closeTransportAndRejectPending()`, which tears down the transport and rejects all in-flight tool call promises. This threshold exists to tolerate transient network glitches (a single ECONNRESET) without prematurely killing a connection, while still detecting genuinely dead servers within a reasonable window.

For HTTP and SSE transports, a separate detection path handles session expiry: HTTP 404 responses with JSON-RPC error code -32001 are recognized as expired sessions rather than "not found" errors, triggering reconnection instead of failure.

### Auto-Reconnect with Exponential Backoff

When a remote server disconnects, the connection management hook at `useManageMCPConnections.ts` triggers automatic reconnection:

```typescript
// useManageMCPConnections.ts:370-464
const MAX_RECONNECT_ATTEMPTS = 5
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000

const backoffMs = Math.min(
  INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1),
  MAX_BACKOFF_MS,
)
```

The backoff sequence is 1s, 2s, 4s, 8s, 16s — capped at 30 seconds. Only remote transports (not stdio, not SDK) support auto-reconnect. Local stdio servers don't reconnect because if the subprocess died, restarting it requires re-initialization that the client can't guarantee is idempotent.

Each reconnection attempt clears the connection cache, creates a fresh transport, performs the MCP handshake, re-fetches tools and resources, and updates the React state. If all five attempts fail, the server transitions to the `FailedMCPServer` state with the accumulated error.

### Graceful Process Shutdown

Stdio server cleanup uses a three-stage signal escalation at `client.ts:1427-1562`:

1. **SIGINT** — wait 100ms. This is the polite "please stop" signal, equivalent to Ctrl+C. Well-behaved servers handle this and shut down cleanly.
2. **SIGTERM** — wait 400ms. The standard termination signal. Most processes that ignore SIGINT still handle SIGTERM.
3. **SIGKILL** — force kill. Cannot be caught or ignored. Used only after the graceful signals fail.

Between signals, the system polls with `process.kill(pid, 0)` every 50ms to detect if the server has already exited. A 600ms absolute failsafe timeout ensures the cleanup never blocks indefinitely.

### Cache Invalidation on Close

When a connection closes, all associated caches are invalidated:

```typescript
// client.ts:1383-1402
client.onclose = () => {
  fetchToolsForClient.cache.delete(name)
  fetchResourcesForClient.cache.delete(name)
  fetchCommandsForClient.cache.delete(name)
  connectToServer.cache.delete(key)
}
```

This is critical for reconnection. Without cache invalidation, a reconnected client would serve stale tools from the previous connection — tools whose `call()` closures reference a dead MCP SDK client instance. Clearing the cache forces fresh tool discovery after reconnection.

---

## 15.5 Tool Discovery and Registration

### Tool Naming Convention

MCP tools are namespaced to prevent collisions between servers. The naming convention at `mcpStringUtils.ts`:

```typescript
// Format: mcp__<normalized_server_name>__<normalized_tool_name>
export function buildMcpToolName(serverName: string, toolName: string): string {
  return `${getMcpPrefix(serverName)}${normalizeNameForMCP(toolName)}`
}
```

Server and tool names are normalized to match `^[a-zA-Z0-9_-]{1,64}$` — all non-alphanumeric characters except underscore and hyphen are replaced with underscores. Claude.ai servers receive extra normalization: consecutive underscores are collapsed and leading/trailing underscores are stripped to prevent the `__` delimiter from appearing inside names.

A known limitation: if a server name contains `__`, parsing is incorrect. The parser splits on the first two `__` boundaries, so `mcp__my__server__tool` would be parsed as server=`my`, tool=`server__tool`. The comment in the source acknowledges this: "Rare in practice since server names typically don't contain double underscores."

### Tool Discovery

The `fetchToolsForClient` function at `client.ts:1743-1998` is memoized with an LRU cache (size 20). For each tool returned by the server's `tools/list` endpoint, it constructs a Claude Code `Tool` object:

```typescript
// client.ts:1743-1998 (simplified)
return {
  ...MCPTool,
  name: skipPrefix ? tool.name : fullyQualifiedName,
  mcpInfo: { serverName: client.name, toolName: tool.name },
  isMcp: true,
  searchHint: tool._meta?.['anthropic/searchHint'],
  alwaysLoad: tool._meta?.['anthropic/alwaysLoad'] === true,
  async description() { return tool.description ?? '' },
  async prompt() {
    const desc = tool.description ?? ''
    return desc.length > MAX_MCP_DESCRIPTION_LENGTH
      ? desc.slice(0, MAX_MCP_DESCRIPTION_LENGTH) + '... [truncated]'
      : desc
  },
  isConcurrencySafe() { return tool.annotations?.readOnlyHint ?? false },
  isReadOnly() { return tool.annotations?.readOnlyHint ?? false },
  isDestructive() { return tool.annotations?.destructiveHint ?? false },
  inputJSONSchema: tool.inputSchema as Tool['inputJSONSchema'],
}
```

Several details are worth noting:

**Description truncation at 2,048 characters.** MCP servers with auto-generated OpenAPI schemas can produce tool descriptions of 15-60KB. Without truncation, a single MCP server could consume a significant fraction of the model's context window just with tool descriptions — directly undermining the token budgeting work described in Chapter 7. The 2,048-character cap (defined as `MAX_MCP_DESCRIPTION_LENGTH`) preserves enough detail for the model to use the tool correctly while preventing context bloat.

**Deferred tool loading via `anthropic/searchHint`.** When this metadata field is present, the tool is not loaded into the model's context by default. Instead, the search hint is used for keyword matching — only when the user's prompt or conversation context matches the hint does the tool get included. This connects directly to the deferred loading system from Chapter 8 and the prompt caching economics from Chapter 5 — non-deferred MCP tools disable global prompt caching because they vary per user. By deferring MCP tools to name-only references, the system preserves the ~90% cost reduction from cached prefills. This enables MCP servers to expose hundreds of tools without overwhelming the model's tool selection.

**Force-loading via `anthropic/alwaysLoad`.** The inverse of search hints — tools with this flag are always included regardless of relevance scoring. Use this for tools that the model should always know about, like authentication or status tools.

**MCP annotations mapping to permissions.** The `readOnlyHint`, `destructiveHint`, and `openWorldHint` annotations map directly to Claude Code's permission system (covered in Chapter 9). A tool marked `readOnlyHint: true` can be auto-approved in permissive modes. A tool marked `destructiveHint: true` always requires explicit approval.

### Notification-Driven Updates

MCP servers can notify clients when their tool list changes. Three notification handlers at `useManageMCPConnections.ts:618-751` respond to changes:

- **ToolListChangedNotification**: Invalidates the tool cache, re-fetches from the server, and updates AppState.
- **PromptListChangedNotification**: Invalidates prompt and skill caches, re-fetches.
- **ResourceListChangedNotification**: Invalidates resource and skill caches. Skills can be discovered from resources, so resource changes trigger skill refresh.

This makes MCP tool sets dynamic — a server can add or remove tools mid-session, and Claude Code picks up the changes within one notification cycle.

---

## 15.6 Tool Execution

### The Call Path

When the model invokes an MCP tool, the execution follows this path:

```
Model requests mcp__server__tool
  → MCPTool.call()
  → ensureConnectedClient() (reconnect if needed)
  → callMCPToolWithUrlElicitationRetry()
  → MCP SDK client.callTool()
  → Transport.send() (stdio/SSE/HTTP/WS)
  → MCP Server processes request
  → Response validated + truncated (mcpValidation.ts)
  → Binary blobs persisted to disk (mcpOutputStorage.ts)
  → Result returned to model
```

The `call()` function on each MCP tool at `client.ts:1833-1970` implements session retry: if the call fails with `McpSessionExpiredError`, it retries once with `MAX_SESSION_RETRIES = 1`. This handles the common case where a remote server's session expires between connection and first tool call.

Progress tracking brackets every call. A "started" event fires before the call, and either "completed" or "failed" fires after. The `toolUseId` from the parent message enables the UI to show which tool call is currently in-flight.

### Output Truncation

MCP tool output is capped at 25,000 tokens by default (configurable via `MAX_MCP_OUTPUT_TOKENS` environment variable or GrowthBook flag). The truncation logic at `utils/mcpValidation.ts` uses a two-phase check:

1. **Heuristic estimate**: `roughTokenCountEstimation()` computes an approximate token count. If the result is under 50% of the limit, the output passes without an API call.
2. **Precise count**: If the heuristic suggests the output might exceed the limit, `countMessagesTokensWithAPI()` calls the actual tokenizer for an exact count.

This two-phase approach avoids tokenizer API calls for the common case (small outputs) while still catching oversized outputs accurately. For `ContentBlockParam` arrays, truncation handles text blocks by slicing and image blocks by attempting compression via `compressImageBlock()`.

### Binary Content Handling

MCP servers can return binary data (images, PDFs, audio). The binary content system at `utils/mcpOutputStorage.ts` (189 lines) detects binary responses and persists them to disk:

```typescript
// mcpOutputStorage.ts
export function isBinaryContentType(contentType: string): boolean {
  if (mt.startsWith('text/')) return false
  if (mt.endsWith('+json') || mt === 'application/json') return false
  if (mt.endsWith('+xml') || mt === 'application/xml') return false
  if (mt.startsWith('application/javascript')) return false
  return true
}
```

Binary blobs are written to a tool-results directory with MIME-derived file extensions (20+ known mappings, defaulting to `.bin`). The file path is returned as the tool result, allowing downstream tools like `Read` to handle the content appropriately — images render inline, PDFs are read with the PDF parser, and unknown formats display as hex dumps.

### Batch Connection Processing

The `getMcpToolsCommandsAndResources()` function at `client.ts:2226-2403` connects to all configured MCP servers with different concurrency limits for local and remote servers:

```typescript
// client.ts:2226-2403
await Promise.all([
  processBatched(localServers, getMcpServerConnectionBatchSize(), processServer),   // Default: 3
  processBatched(remoteServers, getRemoteMcpServerConnectionBatchSize(), processServer), // Default: 20
])
```

Local servers (stdio/SDK) are batched at 3 because each spawns a subprocess — too many concurrent spawns cause resource contention. Remote servers batch at 20 because network connections are cheap and parallelizing them significantly reduces total connection time. This batch-size tuning mirrors the concurrency patterns we saw in Chapter 9's tool orchestration, where read-only tools execute concurrently while destructive tools serialize.

The implementation uses `pMap` for concurrent processing rather than sequential batches. An earlier implementation used serial batch groups, but a single slow server in batch N would hold up all servers in batch N+1. The switch to `pMap` with concurrency limits ensures each server's connection time is independent.

---

## 15.7 Configuration System

### Multi-Scope Resolution

MCP configuration resolves from seven sources with strict precedence. The main aggregator `getClaudeCodeMcpConfigs()` at `config.ts:1071-1251` implements this cascade:

| Priority | Scope | Source | Notes |
|----------|-------|--------|-------|
| 1 (highest) | `enterprise` | `managed-mcp.json` | Exclusive — blocks all other sources |
| 2 | `local` | `.mcp.json` (gitignored) | Per-developer overrides |
| 3 | `project` | `.mcp.json` (committed) | Shared team config |
| 4 | `user` | `~/.claude/settings.json` | User's global MCP servers |
| 5 | `plugin` | Installed plugins | Auto-discovered from plugin cache |
| 6 | `claudeai` | claude.ai connectors | Fetched from API |
| 7 (lowest) | `managed` | Remote managed settings | Organizational defaults |

The resolution algorithm:

1. Check enterprise configs first — if present, return **only** those and skip everything else.
2. Check `isRestrictedToPluginOnly('mcp')` policy — if set, only plugin MCP servers are allowed.
3. Load user, project, and local scopes from their respective `.mcp.json` files.
4. Load plugin MCP servers via `loadAllPluginsCacheOnly()`.
5. Filter project-scoped servers to include only **approved** ones (see Section 15.8).
6. Deduplicate plugins against manually-configured servers.
7. Merge in precedence order: `plugin < user < project < local`.
8. Apply policy filtering (denylist, allowlist).

### Project Config Walk

Project-scope configuration at `config.ts:909-961` walks from CWD up to the filesystem root, collecting `.mcp.json` files:

```typescript
// config.ts:909-961
const dirs: string[] = []
let currentDir = getCwd()
while (currentDir !== parse(currentDir).root) {
  dirs.push(currentDir)
  currentDir = dirname(currentDir)
}
for (const dir of dirs.reverse()) {
  const mcpJsonPath = join(dir, '.mcp.json')
  // ... parse and merge
}
```

Directories are collected CWD-to-root but processed root-to-CWD, so closer files override parents. This means a monorepo can have a root `.mcp.json` with shared servers and subdirectories can override or add servers specific to their project.

### Environment Variable Expansion

MCP configurations support `${VAR}` and `${VAR:-default}` syntax at `envExpansion.ts`:

```typescript
// envExpansion.ts
const expanded = value.replace(/\$\{([^}]+)\}/g, (match, varContent) => {
  const [varName, defaultValue] = varContent.split(':-', 2)
  const envValue = process.env[varName]
  if (envValue !== undefined) return envValue
  if (defaultValue !== undefined) return defaultValue
  missingVars.push(varName)
  return match  // Return original for debugging
})
```

Missing variables are tracked and reported rather than silently expanding to empty strings. This prevents a misconfigured `${API_KEY}` from passing an empty string to a server that would then fail with an opaque authentication error.

### Atomic Config Writes

Configuration file writes at `config.ts:88-131` use atomic rename to prevent corruption if the process is killed mid-write:

```typescript
// config.ts:88-131
async function writeMcpjsonFile(config: McpJsonConfig): Promise<void> {
  const tempPath = `${mcpJsonPath}.tmp.${process.pid}.${Date.now()}`
  const handle = await open(tempPath, 'w', existingMode ?? 0o644)
  try {
    await handle.writeFile(jsonStringify(config, null, 2), { encoding: 'utf8' })
    await handle.datasync()
  } finally {
    await handle.close()
  }
  if (existingMode !== undefined) {
    await chmod(tempPath, existingMode)
  }
  await rename(tempPath, mcpJsonPath)
}
```

Three details matter. The temp file name includes both PID and timestamp for uniqueness across concurrent writes. The `datasync()` call ensures data reaches disk before the rename, preventing a scenario where the rename succeeds but the data is still in the OS page cache when a crash occurs. And the original file permissions are preserved on the temp file before rename, so config files don't unexpectedly change permissions.

---

## 15.8 Policy Enforcement and Server Approval

### Three-Layer Policy System

Enterprise administrators can control MCP server access through three mechanisms at `config.ts:364-551`:

1. **Denylist** (`deniedMcpServers`): Absolute precedence. Blocks servers by name, command, or URL using wildcard patterns. A denylisted server is never connected to, regardless of other settings.

2. **Allowlist** (`allowedMcpServers`): Whitelists specific servers. Supports command-array matching for stdio servers and URL pattern matching for remote servers. An empty allowlist blocks all servers — this is the "default deny" behavior.

3. **Enterprise exclusive** (`managed-mcp.json`): When present, bypasses all other configuration sources. Only servers in the managed config file are available.

URL pattern matching converts wildcards to regex at `config.ts:320`:

```typescript
// config.ts:320
function urlPatternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  const regexStr = escaped.replace(/\*/g, '.*')
  return new RegExp(`^${regexStr}$`)
}
```

This means `https://*.example.com/*` matches any path on any subdomain of example.com, while `https://api.example.com/mcp` matches only that exact URL.

### Project Server Approval

Servers defined in a project's `.mcp.json` (committed to version control) require explicit user approval before Claude Code will connect to them. This is the same trust boundary mechanism described in Chapter 2's trust dialog — a project can define MCP servers, but the user must approve them before they execute, preventing a malicious repository from automatically connecting to an attacker-controlled MCP server.

The approval check at `utils.ts:351-406`:

```typescript
// utils.ts:351-406
export function getProjectMcpServerStatus(serverName: string):
  'approved' | 'rejected' | 'pending' {
  if (settings?.disabledMcpjsonServers?.some(...)) return 'rejected'
  if (settings?.enabledMcpjsonServers?.some(...) || settings?.enableAllProjectMcpServers)
    return 'approved'
  if (hasSkipDangerousModePermissionPrompt() && isSettingSourceEnabled('projectSettings'))
    return 'approved'
  if (getIsNonInteractiveSession() && isSettingSourceEnabled('projectSettings'))
    return 'approved'
  return 'pending'
}
```

A critical security detail: `hasSkipDangerousModePermissionPrompt()` intentionally reads from user/local/flag/policy settings but **not** project settings. The source comment explains: "A repo should not be able to accept the bypass dialog on behalf of users." This prevents a scenario where a malicious repo commits settings that auto-approve its own MCP servers.

Servers in `pending` state get a special `McpAuthTool` placeholder instead of real tools. This tool, when invoked, triggers the approval dialog rather than connecting to the server.

### Plugin Deduplication

Two deduplication functions at `config.ts:223-310` prevent duplicate MCP connections:

```typescript
// config.ts:202
export function getMcpServerSignature(config: McpServerConfig): string | null {
  const cmd = getServerCommandArray(config)
  if (cmd) return `stdio:${jsonStringify(cmd)}`
  const url = getServerUrl(config)
  if (url) return `url:${unwrapCcrProxyUrl(url)}`
  return null
}
```

Servers are identified by their "signature" — the command array for stdio servers or the URL for remote servers. If a plugin MCP server has the same signature as a manually configured one, the manual configuration takes precedence and the plugin copy is suppressed.

---

## 15.9 OAuth Authentication Flow

Remote MCP servers often require OAuth authentication. The `auth.ts` module (2,465 lines) implements the full OAuth 2.0 authorization code flow with PKCE, token refresh, and session management.

The `ClaudeAuthProvider` class creates fetch wrappers that:

1. Check for existing OAuth tokens in the local token cache.
2. If tokens exist but are expired, attempt a token refresh using the refresh token.
3. If no tokens exist or refresh fails, initiate the OAuth authorization flow — opening the user's browser to the authorization URL and starting a local HTTP server on a callback port to receive the authorization code.
4. Exchange the authorization code for access and refresh tokens.
5. Inject the access token as a `Bearer` header on all subsequent requests.

The oauth callback port management at `oauthPort.ts` (78 lines) selects an available port for the local callback server, avoiding conflicts when multiple Claude Code sessions are running simultaneously.

For servers behind organizational identity providers, the Cross-App Access (XAA) system at `xaa.ts` and `xaaIdpLogin.ts` handles per-server identity provider connections — enabling scenarios where different MCP servers authenticate against different corporate IdPs.

### Auth-Cached Server Skipping

Servers that recently returned 401 are skipped for 15 minutes (`MCP_AUTH_CACHE_TTL_MS = 900,000`). This prevents repeatedly hammering a server that requires authentication the user hasn't completed yet:

```typescript
// client.ts:2306-2322
if (
  (config.type === 'claudeai-proxy' || config.type === 'http' || config.type === 'sse') &&
  ((await isMcpAuthCached(name)) ||
   ((config.type === 'http' || config.type === 'sse') &&
    hasMcpDiscoveryButNoToken(name, config)))
) {
  onConnectionAttempt({
    client: { name, type: 'needs-auth' as const, config },
    tools: [createMcpAuthTool(name, config)],
    commands: [],
  })
  return
}
```

Instead of real tools, unauthenticated servers expose a single `McpAuthTool` that triggers the OAuth flow when the model (or user) invokes it. This gives the model a way to say "I need to authenticate with server X to use tool Y" and kick off the auth flow naturally within the conversation.

---

## 15.10 SSRF Protection

Remote MCP servers introduce a Server-Side Request Forgery (SSRF) risk. A malicious or misconfigured `.mcp.json` could point to internal network addresses — `http://169.254.169.254/latest/meta-data/` for AWS instance metadata, `http://localhost:6379/` for a local Redis instance, or `http://10.0.0.1/admin` for an internal admin panel — using the agent as a proxy to exfiltrate data from networks the user's machine has access to.

Claude Code's SSRF protection validates remote server URLs before establishing connections. As described in Chapter 12's coverage of the web tools, the system blocks private IP ranges and localhost variants:

```typescript
// IP validation (shared with WebFetch SSRF protection)
function isPrivateOrReservedIP(hostname: string): boolean {
  const resolved = resolveToIP(hostname)
  return (
    resolved.startsWith('10.') ||
    resolved.startsWith('172.16.') ||   // through 172.31.
    resolved.startsWith('192.168.') ||
    resolved.startsWith('169.254.') ||  // Link-local / cloud metadata
    resolved === '127.0.0.1' ||
    resolved === '::1' ||
    resolved.startsWith('fc00:') ||     // IPv6 ULA
    resolved.startsWith('fe80:')        // IPv6 link-local
  )
}
```

SSRF validation applies only to remote transports (SSE, streamable HTTP, WebSocket). Stdio servers are local processes that already run with user privileges — they have direct network access, so there is no SSRF amplification vector.

The validation runs at connection time, not at configuration load time. This is a deliberate choice: DNS can resolve differently at different times, and a hostname that was safe when configured could later resolve to a private IP through DNS rebinding. Validating at connection time catches this attack.

HTTPS is required for remote MCP servers. HTTP connections to non-localhost URLs are rejected. This prevents credential interception on untrusted networks — an OAuth token sent over plain HTTP would be trivially interceptable on public WiFi.

---

## 15.11 Elicitation: Server-Initiated User Input

MCP elicitation enables servers to request input from the user during tool execution. This connects to the hook system from Chapter 10, which defined the `Elicitation` and `ElicitationResult` events as blocking hooks — meaning enterprise hooks can intercept, auto-fill, or reject server-initiated input requests. The handler at `elicitationHandler.ts` (313 lines) supports two modes:

**Form mode**: The server sends a JSON schema describing the input it needs. Claude Code renders a form based on the schema, collects the user's responses, and returns them to the server.

**URL mode**: The server sends a URL for browser-based authentication or input collection. Claude Code opens the URL and waits for a completion notification from the server.

```typescript
// elicitationHandler.ts:68-212
client.setRequestHandler(ElicitRequestSchema, async (request, extra) => {
  const hookResponse = await runElicitationHooks(serverName, request.params, extra.signal)
  if (hookResponse) return hookResponse

  const response = new Promise<ElicitResult>(resolve => {
    setAppState(prev => ({
      ...prev,
      elicitation: {
        queue: [...prev.elicitation.queue, {
          serverName,
          requestId: extra.requestId,
          params: request.params,
          signal: extra.signal,
          respond: resolve,
        }],
      },
    }))
  })
  return await response
})
```

The pattern is worth studying. Pre-hooks can short-circuit the elicitation — an enterprise hook might auto-fill known credentials or reject requests for sensitive data. If no hook intercepts, the handler creates a Promise whose `resolve` function is passed into the React state as a callback. The UI renders the elicitation form, and when the user submits, the `respond()` callback resolves the Promise, which flows back through the MCP SDK to the server. Post-hooks can then inspect or modify the response before it reaches the server.

URL-mode elicitations receive completion notifications:

```typescript
// elicitationHandler.ts:175-207
client.setNotificationHandler(ElicitationCompleteNotificationSchema, notification => {
  const { elicitationId } = notification.params
  // Update queue to mark this elicitation as completed
})
```

This handles the asynchronous nature of browser-based auth: the user clicks through an OAuth flow in their browser, the server detects completion, and sends a notification that dismisses the waiting UI in Claude Code.

---

## 15.12 Channel Permission Relay

The channel permission system at `channelPermissions.ts` (240 lines) enables MCP servers to participate in Claude Code's permission framework. When a tool call requires user approval, the decision (allow/deny/always-allow) can be relayed to the originating MCP server so it can adjust its behavior accordingly.

This is particularly relevant for MCP servers that proxy access to external services. If a user denies permission for an MCP tool that would write to a database, the server receives that denial and can avoid caching the write intent or pre-allocating resources.

---

## 15.13 Two-Phase MCP Loading

The connection management hook at `useManageMCPConnections.ts:858-1024` uses a two-phase loading strategy to minimize startup latency:

**Phase 1 (fast)**: Load Claude Code configs from local files only. These are available immediately from the filesystem. Kick off a concurrent fetch for claude.ai connector configs.

**Phase 2 (may be slow)**: Await the claude.ai config fetch, deduplicate against Phase 1 results, and connect to any additional servers.

```typescript
// useManageMCPConnections.ts:858-1024
// Phase 1: Load Claude Code configs
const { servers: claudeCodeConfigs } = await getClaudeCodeMcpConfigs(
  dynamicMcpConfig, claudeaiPromise
)
getMcpToolsCommandsAndResources(onConnectionAttempt, enabledConfigs)

// Phase 2: Await claude.ai configs
claudeaiConfigs = filterMcpServersByPolicy(await claudeaiPromise).allowed
const { servers: dedupedClaudeAi } = dedupClaudeAiMcpServers(claudeaiConfigs, configs)
getMcpToolsCommandsAndResources(onConnectionAttempt, enabledClaudeaiConfigs)
```

This means local MCP servers (typically stdio servers defined in `.mcp.json`) are available within seconds of startup, while remote cloud-configured servers arrive a few seconds later without blocking the user's first prompt. This two-phase approach connects to the bootstrap optimization described in Chapter 2, where every network operation has a timeout and a fallback, and network unreliability never blocks startup.

### Batched State Updates

MCP state updates are batched to avoid UI thrashing. When 20 servers connect in rapid succession, you don't want 20 separate React renders:

```typescript
// useManageMCPConnections.ts:203-308
const MCP_BATCH_FLUSH_MS = 16

const updateServer = useCallback((update: PendingUpdate) => {
  pendingUpdatesRef.current.push(update)
  if (flushTimerRef.current === null) {
    flushTimerRef.current = setTimeout(flushPendingUpdates, MCP_BATCH_FLUSH_MS)
  }
}, [flushPendingUpdates])
```

Updates accumulate in a ref array and flush every 16ms (approximately one frame at 60fps). The flush function processes all pending updates in a single `setAppState` call, using prefix-based tool matching to replace the correct server's tools.

---

## 15.14 Server Instructions

MCP servers can provide instructions — text that gets injected into the system prompt to inform the model about the server's capabilities and usage patterns. As described in Chapter 6's coverage of context compaction, MCP server instructions are re-announced during delta re-announcement after compaction, ensuring that even when conversation history is compressed, the model retains knowledge of available server capabilities. The instructions delta system at `utils/mcpInstructionsDelta.ts` (131 lines) tracks which server instructions have already been announced in the conversation:

```typescript
// mcpInstructionsDelta.ts
export function getMcpInstructionsDelta(
  mcpClients: MCPServerConnection[],
  messages: Message[],
  clientSideInstructions: ClientSideInstruction[],
): McpInstructionsDelta | null
```

The function scans conversation history for prior instruction announcements, diffs against the current set of connected servers, and returns `{ addedNames, addedBlocks, removedNames }` or null if nothing changed. This prevents repeating instructions every turn while ensuring newly connected servers get their instructions announced and disconnected servers get noted as removed.

Instructions are treated as immutable for the life of a connection — only server name is diffed, not content. If a server's instructions change, the old instructions remain in the conversation history while the new ones would only appear after a reconnection.

---

## 15.15 Dynamic Headers

The `headersHelper` at `services/mcp/headersHelper.ts` (138 lines) enables external scripts to provide headers dynamically at connection time:

```typescript
// headersHelper.ts
export async function getMcpHeadersFromHelper(
  serverName: string,
  config: McpSSEServerConfig | McpHTTPServerConfig | McpWebSocketServerConfig,
): Promise<Record<string, string> | null> {
  if (isMcpServerFromProjectOrLocalSettings(config) && !getIsNonInteractiveSession()) {
    const hasTrust = checkHasTrustDialogAccepted()
    if (!hasTrust) return null
  }

  const execResult = await execFileNoThrowWithCwd(config.headersHelper, [], {
    shell: true,
    timeout: 10000,
    env: {
      ...process.env,
      CLAUDE_CODE_MCP_SERVER_NAME: serverName,
      CLAUDE_CODE_MCP_SERVER_URL: config.url,
    },
  })
  return jsonParse(execResult.stdout.trim())
}
```

The script receives the server name and URL via environment variables, and must output a JSON object of header key-value pairs to stdout. A 10-second timeout prevents hung scripts from blocking connections indefinitely.

The security check is essential: project-scoped header helper scripts (committed to a repository) require workspace trust verification before execution. Without this check, cloning a repository and opening it in Claude Code could silently execute arbitrary scripts — a supply-chain attack vector similar to the one described in Chapter 10's Bash security analysis.

Dynamic headers override static headers when both are present for the same header name.

---

## 15.16 Engineering Patterns

### Memoization Strategy

Three memoization layers operate at different granularities:

| Layer | Key | Cache Type | Invalidation |
|-------|-----|------------|-------------|
| Connection | `name-${jsonStringify(config)}` | `memoize()` | On transport close |
| Tool/Resource fetch | Server name | LRU (max 20) | On close, on notification |
| Auth cache | Server name | File-based, 15-min TTL | TTL expiry |

The LRU cache for tool fetches caps at 20 entries because Claude Code sessions typically connect to fewer than 20 MCP servers. The file-based auth cache uses serialized writes through a promise chain to prevent concurrent token refresh operations from corrupting the token store.

### Stale Server Detection

When configuration changes (user edits `.mcp.json`, a plugin updates), the system needs to detect which running servers are now stale:

```typescript
// utils.ts:185-224
const stale = mcp.clients.filter(c => {
  const fresh = configs[c.name]
  if (!fresh) return c.config.scope === 'dynamic'
  return hashMcpConfig(c.config) !== hashMcpConfig(fresh)
})
```

SHA-256 hashing of sorted JSON config (excluding scope) provides efficient change detection without deep comparison. A changed hash triggers disconnection and reconnection with the new configuration.

### Concurrency Architecture

The system carefully tunes concurrency for different operation types:

| Operation | Concurrency | Rationale |
|-----------|-------------|-----------|
| Local server connections | 3 | Subprocess spawning is resource-intensive |
| Remote server connections | 20 | Network I/O parallelizes well |
| State updates | Batched per 16ms | Matches display frame rate |
| Auth cache writes | Serialized | Prevents token corruption |
| Tool timeout | ~27.8 hours | MCP tools can be long-running (code generation, data processing) |

The default tool timeout of ~27.8 hours (`DEFAULT_MCP_TOOL_TIMEOUT_MS = 100,000,000`) is deliberately permissive. MCP servers might perform long-running operations — training models, processing large datasets, running extensive test suites. The timeout exists as a safety net against truly stuck operations, not as a bound on expected execution time.

---

## 15.17 Putting It Together

The MCP system transforms Claude Code from a closed agent with a fixed tool set into an open platform where any external process can expose capabilities through a standardized protocol. The engineering complexity exists because this openness creates real challenges:

**Trust boundaries shift.** When tools come from external servers, every call crosses a trust boundary. The policy system (denylist, allowlist, enterprise exclusive) and project approval flow exist because MCP servers are code execution vectors — connecting to a server grants it access to your conversation context and the ability to influence the model's behavior through tool results.

**Transport diversity is unavoidable.** Local scripts need pipes, remote APIs need HTTP, IDE extensions need WebSockets, and in-process servers need zero-overhead message passing. The transport abstraction pays for itself by letting the rest of the system treat all servers identically.

**Connection reliability is non-negotiable.** The exponential backoff reconnection, session expiry detection, three-stage process shutdown, and cache invalidation on close all exist because MCP servers crash, networks fail, sessions expire, and users switch WiFi networks. An agent that loses its tools mid-conversation is worse than one that never had them.

**Configuration must serve both individuals and organizations.** The seven-scope resolution system with enterprise override, policy filtering, and plugin deduplication handles the full spectrum from a solo developer adding a local MCP server to a Fortune 500 company mandating exactly which servers their engineers can use.

For engineers building their own agent platforms, the MCP integration in Claude Code demonstrates that protocol support is the easy part. The hard engineering is in lifecycle management, security boundaries, configuration resolution, and graceful degradation — the same concerns that dominate any distributed system.

---

In Chapter 16, we turn to the permission architecture that governs what agents and tools are allowed to do — the system that evaluates every tool call against a cascade of rules, policies, and classifiers to answer the fundamental question: "Should this action be permitted?"
