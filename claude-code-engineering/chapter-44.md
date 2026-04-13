# Chapter 44: Developer Tools & Debug

A production AI agent is a black box by default. Tokens flow in, responses flow out, tools execute somewhere in the middle, and when something goes wrong, you're staring at a chat transcript wondering which of the 47 moving parts broke. Developer tools crack open the box. They let you see how tokens are distributed across the context window, trace a single tool call from invocation through permission checking to execution, diagnose why the agent chose one model over another, and export terminal sessions for bug reports and documentation.

This chapter covers the developer tooling infrastructure: the `/doctor` diagnostic command that validates your installation, the `/ctx-viz` context window visualizer that shows where your tokens are going, the debug logging system with filterable log levels, the ANSI-to-image conversion pipeline for sharing terminal output, and the headless profiler for CI/CD performance monitoring. These tools transform development from "it works on my machine" guesswork into data-driven debugging.

---

## 44.1 The /doctor Command — Installation Diagnostics

When users report problems, the first question is always "is the installation correct?" Rather than asking users to check 15 different things manually, the `/doctor` command runs a comprehensive diagnostic suite:

### Diagnostic Checks

```typescript
interface DiagnosticCheck {
  name: string;
  category: DiagCategory;
  run(): Promise<DiagResult>;
}

interface DiagResult {
  status: 'pass' | 'warn' | 'fail';
  message: string;
  fix?: string;       // Suggested remediation
  details?: string;   // Extended diagnostic info
}

enum DiagCategory {
  Authentication,     // API keys, OAuth tokens
  Runtime,            // Node/Bun version, platform
  Configuration,      // Settings files, permissions
  Network,            // API connectivity, proxy
  Tools,              // External tool availability
  MCP,                // MCP server connectivity
}
```

The doctor runs checks in a specific order — cheapest and most fundamental first:

```typescript
const DIAGNOSTIC_CHECKS: DiagnosticCheck[] = [
  // 1. Runtime environment
  new RuntimeVersionCheck(),      // Node/Bun version ≥ required
  new PlatformCheck(),            // OS, architecture
  new ShellCheck(),               // Shell availability and PATH
  
  // 2. Authentication
  new ApiKeyCheck(),              // API key format and validity
  new OAuthTokenCheck(),          // OAuth token expiration
  new KeychainAccessCheck(),      // macOS keychain connectivity
  
  // 3. Configuration
  new SettingsValidCheck(),       // settings.json parses correctly
  new PermissionsCheck(),         // Permission rules are syntactically valid
  new ClaudeMdCheck(),            // CLAUDE.md exists and is under size limit
  new MemoryDirCheck(),           // Memory directory is writable
  
  // 4. Network
  new ApiConnectivityCheck(),     // Can reach api.anthropic.com
  new ProxyCheck(),               // HTTP_PROXY / HTTPS_PROXY configured
  new TlsCertCheck(),             // Custom CA certs load correctly
  
  // 5. External tools
  new GitCheck(),                 // git available and configured
  new RipgrepCheck(),             // rg available (for Grep tool)
  new TreeSitterCheck(),          // Tree-sitter bindings loaded
  
  // 6. MCP servers
  new McpServerCheck(),           // Configured MCP servers respond
];
```

### Running Diagnostics

```typescript
class DoctorCommand implements Command {
  name() { return 'doctor'; }
  category() { return CommandCategory.Debug; }
  
  async execute(args: string[], ctx: CommandContext): Promise<string> {
    const results: [DiagnosticCheck, DiagResult][] = [];
    
    for (const check of DIAGNOSTIC_CHECKS) {
      try {
        const result = await Promise.race([
          check.run(),
          timeout(5000).then(() => ({
            status: 'warn' as const,
            message: `${check.name} timed out after 5s`,
          })),
        ]);
        results.push([check, result]);
      } catch (e) {
        results.push([check, {
          status: 'fail',
          message: `${check.name} threw: ${e.message}`,
        }]);
      }
    }
    
    return formatDoctorOutput(results);
  }
}
```

### Output Format

```
$ /doctor

Agent Installation Diagnostics
══════════════════════════════════════════════════════

Runtime
  ✓ Bun 1.1.38 (required ≥ 1.1.0)
  ✓ Platform: darwin arm64
  ✓ Shell: /bin/zsh

Authentication
  ✓ API key: sk-ant-...3f2a (valid format)
  ✓ OAuth token: expires in 47 minutes
  ✗ Keychain: access denied
    Fix: Run `security unlock-keychain login.keychain`

Configuration
  ✓ settings.json: valid (12 rules, 5 hooks)
  ✓ Permissions: 8 allow, 3 deny, 0 invalid
  ✓ CLAUDE.md: 2.1KB (limit: 30KB)
  ⚠ Memory directory: 847 files (consider cleanup)

Network
  ✓ API connectivity: 142ms latency
  ✓ No proxy configured
  ✓ TLS: system certificates

External Tools
  ✓ git 2.44.0
  ✓ rg 14.1.0
  ⚠ tree-sitter: native bindings not found (falling back to WASM)
    Fix: Run `npm rebuild tree-sitter`

MCP Servers
  ✓ copilot-mem: connected (stdio, 3 tools)
  ✗ tridoan-operator: connection refused
    Fix: Start the MCP server with `python -m tridoan_operator`

══════════════════════════════════════════════════════
Results: 14 passed, 2 warnings, 2 failed
```

Each check that fails includes a `fix` field — a concrete command or action the user can take. This transforms diagnostics from "something is wrong" to "here's how to fix it."

### Individual Check Implementation

Let's look at one check in detail — the API connectivity check, because it validates the most critical dependency:

```typescript
class ApiConnectivityCheck implements DiagnosticCheck {
  name = 'API Connectivity';
  category = DiagCategory.Network;
  
  async run(): Promise<DiagResult> {
    const apiUrl = getApiBaseUrl(); // Respects ANTHROPIC_BASE_URL
    const startTime = Date.now();
    
    try {
      // Use a HEAD request to minimize data transfer
      const response = await fetch(`${apiUrl}/v1/messages`, {
        method: 'HEAD',
        headers: {
          'x-api-key': getApiKey(),
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(5000),
      });
      
      const latency = Date.now() - startTime;
      
      if (response.status === 401) {
        return {
          status: 'fail',
          message: 'API key rejected (401 Unauthorized)',
          fix: 'Check your API key with: echo $ANTHROPIC_API_KEY',
        };
      }
      
      if (response.status === 429) {
        return {
          status: 'warn',
          message: `Rate limited (${latency}ms). You may be throttled.`,
          details: `Retry-After: ${response.headers.get('retry-after')}`,
        };
      }
      
      // Any 2xx or 4xx (except 401) means we reached the API
      return {
        status: 'pass',
        message: `${latency}ms latency to ${apiUrl}`,
      };
    } catch (e) {
      if (e.name === 'TimeoutError') {
        return {
          status: 'fail',
          message: `Cannot reach ${apiUrl} (timeout after 5s)`,
          fix: 'Check your network connection and proxy settings',
        };
      }
      
      return {
        status: 'fail',
        message: `Network error: ${e.message}`,
        fix: e.message.includes('ENOTFOUND')
          ? 'DNS resolution failed. Check your network.'
          : 'Check firewall and proxy settings.',
      };
    }
  }
}
```

---

## 44.2 Context Window Visualization

As discussed in Chapter 6, the agent manages a context window with a hard token limit. When the context fills up, compaction kicks in — summarizing older messages to make room for new ones. But compaction is lossy. Understanding *where* your tokens are going helps you work more efficiently: if tool results consume 60% of your context, you know to use more targeted tool calls.

### Token Distribution Model

```typescript
interface TokenDistribution {
  systemPrompt: number;    // System prompt + CLAUDE.md + rules
  userMessages: number;    // User input across all turns
  assistantMessages: number; // Agent responses
  projectContext: number;  // Memory, active files, MCP context
  toolIO: number;          // Tool inputs and outputs
  cacheTokens: number;     // Prompt cache read + write tokens
  thinking: number;        // Extended thinking tokens
  total: number;           // Sum of all categories
  limit: number;           // Model's context window size
}
```

### The /ctx-viz Command

The `/ctx-viz` command renders a visual breakdown of the current context window:

```typescript
class CtxVizCommand implements Command {
  name() { return 'ctx-viz'; }
  aliases() { return ['context']; }
  
  async execute(args: string[], ctx: CommandContext): Promise<string> {
    const segments = estimateSegments(ctx);
    const windowSize = contextWindowSize(ctx.currentModel);
    const totalUsed = segments.reduce((sum, s) => sum + s.tokens, 0);
    const usageRatio = totalUsed / windowSize;
    
    let output = '';
    
    // Warning header
    const level = warningLevel(usageRatio);
    if (level !== WarningLevel.None) {
      output += `⚠ Context usage: ${level.label()} `;
      output += `(${formatPercent(usageRatio)})\n\n`;
    }
    
    // Bar chart
    const barWidth = 50;
    for (const segment of segments) {
      if (segment.tokens === 0) continue;
      output += renderBar(segment.label, segment.tokens, windowSize, barWidth);
      output += '\n';
    }
    
    // Free space
    const free = windowSize - totalUsed;
    output += renderBar('Free', free, windowSize, barWidth);
    output += '\n\n';
    
    // Summary table
    output += formatSummaryTable(segments, totalUsed, windowSize);
    
    return output;
  }
}
```

### Warning Levels

The visualization uses color-coded warning levels based on context utilization:

```typescript
enum WarningLevel {
  None,      // < 50% — plenty of room (green)
  Low,       // 50-70% — starting to fill (yellow)
  Medium,    // 70-90% — consider summarizing (orange)
  Critical,  // > 90% — imminent compaction (red)
}

function warningLevel(ratio: number): WarningLevel {
  if (ratio < 0.5) return WarningLevel.None;
  if (ratio < 0.7) return WarningLevel.Low;
  if (ratio < 0.9) return WarningLevel.Medium;
  return WarningLevel.Critical;
}
```

### Terminal Output

```
/ctx-viz

Context Window: claude-sonnet-4-6 (200K tokens)
═══════════════════════════════════════════════════

System prompt  ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  12,340  (6.2%)
User messages  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  24,891  (12.4%)
Assistant      ████████████████████░░░░░░░░░░░░░░░░░░░░  40,223  (20.1%)
Context        ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  18,456  (9.2%)
Tool I/O       █████████████████████████░░░░░░░░░░░░░░░░  52,340  (26.2%)
Thinking       ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  8,100   (4.1%)
Free           ██████████████████████████████████████████  43,650  (21.8%)

Total: 156,350 / 200,000 tokens (78.2%) ⚠ Warning

Cache:  89,234 tokens cached (57% hit rate)
Turns:  14 messages (7 user, 7 assistant)
Tools:  23 calls (Read: 12, Grep: 6, Bash: 3, Edit: 2)

💡 Tool I/O is your largest category. Use more targeted searches
   to reduce context consumption.
```

### The Segment Estimator

Token estimation without an API call (as discussed in Chapter 7) uses a character-to-token ratio:

```typescript
function estimateSegments(ctx: CommandContext): Segment[] {
  let systemTokens = 0;
  let userTokens = 0;
  let assistantTokens = 0;
  let contextTokens = 0;
  let toolTokens = 0;
  
  for (const [role, content] of ctx.history) {
    // ~3.8 chars per token for English text, ~4 for code
    const est = Math.ceil(content.length / 3.8);
    
    switch (role) {
      case 'system':
        systemTokens += est;
        break;
      case 'user':
        userTokens += est;
        break;
      case 'assistant':
        assistantTokens += est;
        break;
      case 'context':
        contextTokens += est;
        break;
      case 'tool':
      case 'tool_result':
        toolTokens += est;
        break;
      default:
        userTokens += est;
    }
  }
  
  const cacheTokens = ctx.cacheReadTokens + ctx.cacheWriteTokens;
  
  return [
    { label: 'System prompt', tokens: systemTokens },
    { label: 'User messages', tokens: userTokens },
    { label: 'Assistant msgs', tokens: assistantTokens },
    { label: 'Project context', tokens: contextTokens },
    { label: 'Tool I/O', tokens: toolTokens },
    { label: 'Cache (r+w)', tokens: cacheTokens },
  ];
}
```

### TUI Widget Integration

For terminal UIs built with a framework like ratatui (Rust) or Ink (React), the context visualization can be rendered as a live-updating widget:

```typescript
interface TokenDistributionWidget {
  distribution: TokenDistribution;
  warningLevel: WarningLevel;
  
  render(area: Rect, buffer: Buffer): void;
}

function renderContextViz(
  dist: TokenDistribution, 
  area: Rect, 
  buf: Buffer
): void {
  // Title with warning color
  const titleStyle = Style.default()
    .fg(warningLevel(dist.total / dist.limit).color())
    .bold();
  
  const title = `Context: ${formatTokens(dist.total)} / ${formatTokens(dist.limit)}`;
  
  // Stacked horizontal bar
  const segments = [
    { tokens: dist.systemPrompt, color: Color.Blue, label: 'Sys' },
    { tokens: dist.userMessages, color: Color.Green, label: 'User' },
    { tokens: dist.assistantMessages, color: Color.Cyan, label: 'Asst' },
    { tokens: dist.projectContext, color: Color.Yellow, label: 'Ctx' },
    { tokens: dist.toolIO, color: Color.Magenta, label: 'Tool' },
    { tokens: dist.thinking, color: Color.Gray, label: 'Think' },
  ];
  
  let offset = 0;
  for (const seg of segments) {
    const width = Math.round(seg.tokens / dist.limit * area.width);
    for (let x = offset; x < offset + width && x < area.width; x++) {
      buf.setCell(area.x + x, area.y + 1, '█', Style.default().fg(seg.color));
    }
    offset += width;
  }
}
```

---

## 44.3 Debug Logging System

The agent generates enormous amounts of diagnostic data during execution: API requests and responses, tool invocations, permission evaluations, compaction decisions, MCP messages, and more. A debug logging system with granular filtering lets developers focus on exactly the data they need.

### Log Levels

```typescript
enum LogLevel {
  Off = 0,       // No logging
  Error = 1,     // Errors that break functionality
  Warn = 2,      // Recoverable issues
  Info = 3,      // High-level operation summaries
  Debug = 4,     // Detailed operation internals
  Trace = 5,     // Everything — individual tokens, byte-level I/O
}
```

### Log Categories

Filtering by level alone is too coarse. The agent has dozens of subsystems, and you usually want verbose logs from one subsystem while keeping others quiet:

```typescript
enum LogCategory {
  Api,           // HTTP requests, responses, headers
  Query,         // Query loop iterations, transitions
  Tools,         // Tool invocations, results
  Permissions,   // Permission evaluations
  Compaction,    // Context compression decisions
  MCP,           // MCP protocol messages
  Hooks,         // Hook execution
  Settings,      // Configuration loading, merging
  Session,       // Session storage operations
  UI,            // Rendering, input handling
  Memory,        // Memory loading, scanning
  Startup,       // Bootstrap sequence timing
}
```

### Filter Configuration

Developers configure logging via environment variables:

```bash
# Enable all debug logging
AGENT_LOG_LEVEL=debug agent

# Debug only the API and compaction subsystems
AGENT_LOG_FILTER="api=debug,compaction=debug,*=warn" agent

# Trace MCP protocol messages
AGENT_LOG_FILTER="mcp=trace" agent

# Log to a file instead of stderr
AGENT_LOG_FILE=/tmp/agent-debug.log agent
```

The filter syntax follows the same pattern as Rust's `RUST_LOG` or the `env_logger` crate:

```typescript
interface LogFilter {
  defaultLevel: LogLevel;
  categoryOverrides: Map<LogCategory, LogLevel>;
}

function parseLogFilter(filter: string): LogFilter {
  const result: LogFilter = {
    defaultLevel: LogLevel.Warn,
    categoryOverrides: new Map(),
  };
  
  for (const directive of filter.split(',')) {
    const [target, level] = directive.split('=');
    const parsedLevel = parseLevel(level.trim());
    
    if (target.trim() === '*') {
      result.defaultLevel = parsedLevel;
    } else {
      const category = parseCategory(target.trim());
      if (category !== undefined) {
        result.categoryOverrides.set(category, parsedLevel);
      }
    }
  }
  
  return result;
}

function shouldLog(category: LogCategory, level: LogLevel, filter: LogFilter): boolean {
  const threshold = filter.categoryOverrides.get(category) ?? filter.defaultLevel;
  return level <= threshold;
}
```

### Structured Log Output

Debug logs use structured JSON format for machine parseability:

```json
{
  "timestamp": "2026-03-15T14:23:45.123Z",
  "level": "debug",
  "category": "api",
  "message": "API request sent",
  "fields": {
    "method": "POST",
    "url": "/v1/messages",
    "model": "claude-sonnet-4-6",
    "input_tokens": 12340,
    "cached_tokens": 8900,
    "request_id": "req_abc123"
  },
  "span": {
    "query_turn": 3,
    "session_id": "sess_xyz"
  }
}
```

### API Request/Response Logging

The API logging subsystem deserves special attention because it's the most commonly used debug tool:

```typescript
enum ApiLogLevel {
  Off,           // No API logging
  Summary,       // One line per request (method, status, tokens)
  Headers,       // Summary + request/response headers
  Body,          // Headers + truncated body (first 1KB)
  Full,          // Everything including full body
}

class ApiLogger {
  private logLevel: ApiLogLevel;
  
  logRequest(req: ApiRequest): void {
    if (this.logLevel === ApiLogLevel.Off) return;
    
    const summary = {
      method: req.method,
      url: req.url,
      model: req.body?.model,
      inputTokensEstimate: estimateTokens(req.body),
      timestamp: new Date().toISOString(),
    };
    
    log(LogCategory.Api, LogLevel.Debug, 'API request', summary);
    
    if (this.logLevel >= ApiLogLevel.Headers) {
      log(LogCategory.Api, LogLevel.Trace, 'request headers', {
        headers: sanitizeHeaders(req.headers),
      });
    }
    
    if (this.logLevel >= ApiLogLevel.Body) {
      const body = this.logLevel === ApiLogLevel.Full
        ? req.body
        : truncate(JSON.stringify(req.body), 1024);
      log(LogCategory.Api, LogLevel.Trace, 'request body', { body });
    }
  }
  
  logResponse(resp: ApiResponse, durationMs: number): void {
    if (this.logLevel === ApiLogLevel.Off) return;
    
    log(LogCategory.Api, LogLevel.Debug, 'API response', {
      status: resp.status,
      duration_ms: durationMs,
      input_tokens: resp.usage?.input_tokens,
      output_tokens: resp.usage?.output_tokens,
      cache_read: resp.usage?.cache_read_input_tokens,
      stop_reason: resp.stop_reason,
    });
  }
}
```

---

## 44.4 The /debug-tool-call Command

When a tool call produces unexpected results, the `/debug-tool-call` command replays the last tool call with full diagnostic output:

```typescript
class DebugToolCallCommand implements Command {
  name() { return 'debug-tool-call'; }
  
  async execute(args: string[], ctx: CommandContext): Promise<string> {
    const lastToolCall = ctx.lastToolCall;
    if (!lastToolCall) return 'No recent tool call to debug.';
    
    const output: string[] = [];
    
    // 1. Tool resolution
    output.push('## Tool Resolution');
    output.push(`Tool: ${lastToolCall.name}`);
    output.push(`Registered: ${toolRegistry.has(lastToolCall.name)}`);
    output.push(`Category: ${toolRegistry.get(lastToolCall.name)?.category}`);
    output.push('');
    
    // 2. Input validation
    output.push('## Input Validation');
    const validation = validateToolInput(lastToolCall.name, lastToolCall.input);
    output.push(`Valid: ${validation.valid}`);
    if (!validation.valid) {
      output.push(`Errors: ${validation.errors.join(', ')}`);
    }
    output.push(`Input schema: ${JSON.stringify(getToolSchema(lastToolCall.name), null, 2)}`);
    output.push('');
    
    // 3. Permission evaluation
    output.push('## Permission Evaluation');
    const permResult = evaluatePermission(lastToolCall.name, lastToolCall.input);
    output.push(`Decision: ${permResult.decision}`);
    output.push(`Matched rule: ${permResult.matchedRule ?? 'none (default)'}`);
    output.push(`Rule source: ${permResult.ruleSource}`);
    output.push(`Evaluation order: deny → ask → allow`);
    for (const step of permResult.evaluationTrace) {
      output.push(`  ${step.rule} → ${step.result}`);
    }
    output.push('');
    
    // 4. Execution details
    output.push('## Execution');
    output.push(`Duration: ${lastToolCall.durationMs}ms`);
    output.push(`Exit code: ${lastToolCall.exitCode ?? 'N/A'}`);
    output.push(`Output size: ${lastToolCall.output.length} chars`);
    output.push(`Truncated: ${lastToolCall.truncated}`);
    output.push('');
    
    // 5. Post-execution hooks
    output.push('## Post-Execution Hooks');
    const hooks = getHooksForEvent('PostToolUse', lastToolCall.name);
    for (const hook of hooks) {
      output.push(`  ${hook.command}: ${hook.lastResult ?? 'not run'}`);
    }
    
    return output.join('\n');
  }
}
```

### Example Output

```
/debug-tool-call

## Tool Resolution
Tool: Bash
Registered: true
Category: core

## Input Validation
Valid: true
Input schema: {
  "type": "object",
  "properties": {
    "command": { "type": "string" },
    "timeout": { "type": "number" }
  },
  "required": ["command"]
}

## Permission Evaluation
Decision: allow
Matched rule: Bash(git *)
Rule source: .claude/settings.json
Evaluation order: deny → ask → allow
  deny: Bash(rm -rf *) → no match
  deny: Bash(git push --force *) → no match
  allow: Bash(git *) → MATCHED

## Execution
Duration: 234ms
Exit code: 0
Output size: 1,847 chars
Truncated: false

## Post-Execution Hooks
  .claude/hooks/auto-lint-python.sh: skipped (not .py file)
```

---

## 44.5 Startup Profiler

The agent's startup time directly affects user experience. A 3-second startup delay is annoying; a 10-second delay is unacceptable. The startup profiler identifies where time is spent during initialization.

### Checkpoint-Based Profiling

```typescript
class StartupProfiler {
  private checkpoints: [string, number][] = [];
  private startTime: number;
  
  constructor() {
    this.startTime = performance.now();
    this.checkpoint('profiler_init');
  }
  
  checkpoint(name: string): void {
    this.checkpoints.push([name, performance.now()]);
  }
  
  report(): StartupReport {
    const phases: StartupPhase[] = [];
    
    for (let i = 1; i < this.checkpoints.length; i++) {
      const [prevName, prevTime] = this.checkpoints[i - 1];
      const [name, time] = this.checkpoints[i];
      
      phases.push({
        name,
        duration_ms: time - prevTime,
        cumulative_ms: time - this.startTime,
      });
    }
    
    // Sort by duration descending
    const sorted = [...phases].sort((a, b) => b.duration_ms - a.duration_ms);
    
    return {
      total_ms: performance.now() - this.startTime,
      phases,
      bottlenecks: sorted.slice(0, 5),
    };
  }
  
  formatReport(): string {
    const report = this.report();
    const lines: string[] = [];
    
    lines.push(`Startup: ${report.total_ms.toFixed(0)}ms total\n`);
    
    // Timeline
    for (const phase of report.phases) {
      const bar = '█'.repeat(Math.ceil(phase.duration_ms / 10));
      const pct = (phase.duration_ms / report.total_ms * 100).toFixed(1);
      lines.push(
        `${phase.name.padEnd(25)} ${phase.duration_ms.toFixed(0).padStart(6)}ms ` +
        `${pct.padStart(5)}% ${bar}`
      );
    }
    
    // Bottlenecks
    lines.push('\nTop bottlenecks:');
    for (const b of report.bottlenecks) {
      lines.push(`  ${b.name}: ${b.duration_ms.toFixed(0)}ms`);
    }
    
    return lines.join('\n');
  }
}
```

### Instrumented Bootstrap

The startup profiler is wired into the bootstrap sequence from Chapter 2:

```typescript
async function bootstrap(): Promise<void> {
  const profiler = new StartupProfiler();
  
  // Phase 1: Parallel prefetch (network-bound)
  profiler.checkpoint('prefetch_start');
  await Promise.all([
    prefetchMdmSettings(),
    prefetchKeychainAccess(),
    prefetchFeatureFlags(),
    preconnectApi(),
  ]);
  profiler.checkpoint('prefetch_done');
  
  // Phase 2: Configuration loading
  profiler.checkpoint('config_start');
  await loadSettingsCascade();
  profiler.checkpoint('config_done');
  
  // Phase 3: Authentication
  profiler.checkpoint('auth_start');
  await resolveAuthentication();
  profiler.checkpoint('auth_done');
  
  // Phase 4: Tool registration
  profiler.checkpoint('tools_start');
  registerCoreTools();
  await registerMcpTools();
  profiler.checkpoint('tools_done');
  
  // Phase 5: Context loading
  profiler.checkpoint('context_start');
  await loadClaudeMd();
  await loadMemory();
  await loadActiveSession();
  profiler.checkpoint('context_done');
  
  // Phase 6: UI initialization
  profiler.checkpoint('ui_start');
  initializeRenderer();
  profiler.checkpoint('ui_done');
  
  if (process.env.AGENT_PROFILE === '1') {
    console.error(profiler.formatReport());
  }
}
```

### Example Profile Output

```
$ AGENT_PROFILE=1 agent

Startup: 1,847ms total

prefetch_start            0ms    0.0%
prefetch_done           342ms   18.5% ████████████████████████████████████
config_start              1ms    0.1%
config_done              89ms    4.8% █████████
auth_start                0ms    0.0%
auth_done               156ms    8.4% ████████████████
tools_start               1ms    0.1%
tools_done              823ms   44.6% ██████████████████████████████████████████████████████████████████████████████████████
context_start             0ms    0.0%
context_done            312ms   16.9% ████████████████████████████████
ui_start                  0ms    0.0%
ui_done                 123ms    6.7% ████████████

Top bottlenecks:
  tools_done: 823ms       ← MCP server startup dominates
  prefetch_done: 342ms    ← Network latency
  context_done: 312ms     ← CLAUDE.md + memory loading
  auth_done: 156ms        ← OAuth token refresh
  ui_done: 123ms          ← Terminal capability detection
```

This immediately shows that MCP server startup (823ms) is the primary bottleneck. The optimization path is clear: start MCP servers in the background and register their tools lazily, only blocking when a tool is actually invoked.

---

## 44.6 ANSI-to-Image Conversion

Terminal output uses ANSI escape codes for color, bold, underline, and cursor positioning. This looks great in a terminal but is useless for bug reports, documentation, or sharing on the web. The ANSI-to-image pipeline converts terminal output to PNG or SVG images.

### The Conversion Pipeline

```typescript
interface AnsiConverterOptions {
  format: 'png' | 'svg';
  theme: TerminalTheme;
  fontSize: number;
  padding: number;
  maxWidth: number;      // Characters per line
  lineHeight: number;
  fontFamily: string;
}

interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  colors: {
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    // ... 8 more bright colors
  };
}
```

### SVG Generation

SVG is the preferred format because it's resolution-independent and produces smaller files:

```typescript
function ansiToSvg(input: string, options: AnsiConverterOptions): string {
  const parsed = parseAnsiSequences(input);
  const lines = splitLines(parsed);
  
  const charWidth = options.fontSize * 0.6; // Monospace character width
  const lineHeight = options.fontSize * options.lineHeight;
  const width = options.maxWidth * charWidth + options.padding * 2;
  const height = lines.length * lineHeight + options.padding * 2;
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  svg += `<rect width="100%" height="100%" fill="${options.theme.background}"/>`;
  svg += `<style>text { font-family: ${options.fontFamily}; font-size: ${options.fontSize}px; }</style>`;
  
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const y = options.padding + (lineIdx + 1) * lineHeight;
    let x = options.padding;
    
    for (const segment of lines[lineIdx]) {
      const fill = segment.fg ?? options.theme.foreground;
      const weight = segment.bold ? 'bold' : 'normal';
      const decoration = segment.underline ? 'underline' : 'none';
      
      // Escape XML entities
      const text = escapeXml(segment.text);
      
      svg += `<text x="${x}" y="${y}" fill="${fill}" font-weight="${weight}" `;
      svg += `text-decoration="${decoration}">${text}</text>`;
      
      x += segment.text.length * charWidth;
    }
  }
  
  svg += '</svg>';
  return svg;
}
```

### Terminal Session Recording

For more complex scenarios — animated demonstrations, multi-step workflows — the system supports asciicast-format recording compatible with asciinema:

```typescript
interface AsciicastHeader {
  version: 2;
  width: number;
  height: number;
  timestamp: number;
  env: Record<string, string>;
}

type AsciicastEvent = [number, 'o' | 'i', string];
// [timestamp_seconds, type, data]
// 'o' = output (terminal wrote), 'i' = input (user typed)

class TerminalRecorder {
  private events: AsciicastEvent[] = [];
  private startTime: number;
  
  start(): void {
    this.startTime = Date.now();
    this.events = [];
  }
  
  recordOutput(data: string): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    this.events.push([elapsed, 'o', data]);
  }
  
  recordInput(data: string): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    this.events.push([elapsed, 'i', data]);
  }
  
  save(path: string): void {
    const header: AsciicastHeader = {
      version: 2,
      width: process.stdout.columns ?? 80,
      height: process.stdout.rows ?? 24,
      timestamp: Math.floor(this.startTime / 1000),
      env: { TERM: process.env.TERM ?? 'xterm-256color' },
    };
    
    const lines = [JSON.stringify(header)];
    for (const event of this.events) {
      lines.push(JSON.stringify(event));
    }
    
    writeFileSync(path, lines.join('\n'));
  }
}
```

---

## 44.7 Headless Profiler for CI/CD

The headless profiler runs the agent in non-interactive mode, executing a predefined script and collecting performance metrics. This is designed for CI/CD pipelines that need to detect performance regressions.

### Headless Execution

```typescript
interface HeadlessConfig {
  script: string[];          // Sequence of user messages
  model: string;
  maxTurns: number;
  collectMetrics: boolean;
  timeout: number;           // Total execution timeout
}

interface HeadlessResult {
  success: boolean;
  turns: number;
  totalDuration: number;
  metrics: PerformanceMetrics;
  transcript: TranscriptEntry[];
  errors: string[];
}

interface PerformanceMetrics {
  startupMs: number;
  avgTurnMs: number;
  maxTurnMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheHitTokens: number;
  cacheHitRate: number;
  toolCallCount: number;
  compactionCount: number;
  peakContextUsage: number;
}

async function runHeadless(config: HeadlessConfig): Promise<HeadlessResult> {
  const startTime = performance.now();
  const metrics: Partial<PerformanceMetrics> = {};
  const transcript: TranscriptEntry[] = [];
  const errors: string[] = [];
  
  // Initialize agent in headless mode
  await bootstrap({ headless: true, model: config.model });
  metrics.startupMs = performance.now() - startTime;
  
  let turns = 0;
  let maxTurnMs = 0;
  const turnTimes: number[] = [];
  
  for (const message of config.script) {
    const turnStart = performance.now();
    
    try {
      const result = await runQueryToCompletion(message, {
        timeout: config.timeout / config.script.length,
      });
      
      transcript.push({
        role: 'user',
        content: message,
      });
      transcript.push({
        role: 'assistant',
        content: result.response,
        toolCalls: result.toolCalls,
      });
      
      turns++;
    } catch (e) {
      errors.push(`Turn ${turns}: ${e.message}`);
    }
    
    const turnDuration = performance.now() - turnStart;
    turnTimes.push(turnDuration);
    maxTurnMs = Math.max(maxTurnMs, turnDuration);
  }
  
  const state = getGlobalState();
  
  return {
    success: errors.length === 0,
    turns,
    totalDuration: performance.now() - startTime,
    metrics: {
      startupMs: metrics.startupMs!,
      avgTurnMs: turnTimes.reduce((a, b) => a + b, 0) / turnTimes.length,
      maxTurnMs,
      totalInputTokens: state.inputTokens,
      totalOutputTokens: state.outputTokens,
      totalCacheHitTokens: state.cacheHitTokens,
      cacheHitRate: state.cacheHitTokens / (state.inputTokens || 1),
      toolCallCount: state.toolCallCount,
      compactionCount: state.compactionCount,
      peakContextUsage: state.peakContextUsage,
    },
    transcript,
    errors,
  };
}
```

### CI Integration

```yaml
# .github/workflows/perf-check.yml
jobs:
  performance-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      
      - name: Run performance benchmark
        run: |
          node dist/headless.js \
            --script "What is 2+2?" "Read package.json" "Summarize this project" \
            --model claude-sonnet-4-6 \
            --timeout 120000 \
            --output perf-results.json
      
      - name: Check for regressions
        run: |
          node scripts/check-perf-regression.js \
            --baseline perf-baseline.json \
            --current perf-results.json \
            --threshold 20  # Fail if >20% regression
```

### Regression Detection

```typescript
interface PerfComparison {
  metric: string;
  baseline: number;
  current: number;
  changePercent: number;
  regression: boolean;
}

function comparePerfResults(
  baseline: PerformanceMetrics,
  current: PerformanceMetrics,
  threshold: number, // percentage
): PerfComparison[] {
  const comparisons: PerfComparison[] = [];
  
  const metrics: [string, keyof PerformanceMetrics][] = [
    ['Startup time', 'startupMs'],
    ['Avg turn time', 'avgTurnMs'],
    ['Max turn time', 'maxTurnMs'],
    ['Input tokens', 'totalInputTokens'],
    ['Output tokens', 'totalOutputTokens'],
    ['Cache hit rate', 'cacheHitRate'],
  ];
  
  for (const [name, key] of metrics) {
    const baseVal = baseline[key] as number;
    const curVal = current[key] as number;
    const change = ((curVal - baseVal) / baseVal) * 100;
    
    // For cache hit rate, regression is a decrease (not increase)
    const isRegression = key === 'cacheHitRate'
      ? change < -threshold
      : change > threshold;
    
    comparisons.push({
      metric: name,
      baseline: baseVal,
      current: curVal,
      changePercent: change,
      regression: isRegression,
    });
  }
  
  return comparisons;
}
```

---

## 44.8 FPS Tracking and Frame Timing

For terminal UI agents with real-time rendering (Chapter 26), FPS tracking helps identify rendering bottlenecks:

```typescript
class FrameTimer {
  private frameTimes: number[] = [];
  private lastFrameTime = 0;
  private maxSamples = 120; // Last 2 seconds at 60fps
  
  recordFrame(): void {
    const now = performance.now();
    if (this.lastFrameTime > 0) {
      this.frameTimes.push(now - this.lastFrameTime);
      if (this.frameTimes.length > this.maxSamples) {
        this.frameTimes.shift();
      }
    }
    this.lastFrameTime = now;
  }
  
  fps(): number {
    if (this.frameTimes.length === 0) return 0;
    const avgMs = this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
    return 1000 / avgMs;
  }
  
  p99FrameTime(): number {
    if (this.frameTimes.length === 0) return 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.99);
    return sorted[idx];
  }
  
  jankFrames(): number {
    // Frames taking >33ms (less than 30fps)
    return this.frameTimes.filter(t => t > 33).length;
  }
  
  report(): string {
    return [
      `FPS: ${this.fps().toFixed(1)}`,
      `P99 frame: ${this.p99FrameTime().toFixed(1)}ms`,
      `Jank frames: ${this.jankFrames()} / ${this.frameTimes.length}`,
    ].join(' | ');
  }
}
```

---

## 44.9 Memory Debugging

When the agent's Node.js process consumes excessive memory, the heap dump service captures a snapshot for analysis:

```typescript
class HeapDumpService {
  private highWaterMark = 0;
  
  async captureHeapDump(reason: string): Promise<string> {
    const v8 = await import('v8');
    const path = join(
      tmpdir(),
      `agent-heap-${Date.now()}-${reason}.heapsnapshot`
    );
    
    v8.writeHeapSnapshot(path);
    
    const size = statSync(path).size;
    log(LogCategory.Debug, LogLevel.Info, 'Heap snapshot captured', {
      path,
      size_mb: (size / 1024 / 1024).toFixed(1),
      reason,
    });
    
    return path;
  }
  
  monitorMemory(intervalMs: number = 30_000): void {
    setInterval(() => {
      const usage = process.memoryUsage();
      const heapMb = usage.heapUsed / 1024 / 1024;
      
      if (heapMb > this.highWaterMark * 1.5 && this.highWaterMark > 0) {
        log(LogCategory.Debug, LogLevel.Warn, 'Memory spike detected', {
          current_mb: heapMb.toFixed(1),
          high_water_mb: this.highWaterMark.toFixed(1),
          increase_pct: ((heapMb / this.highWaterMark - 1) * 100).toFixed(0),
        });
      }
      
      this.highWaterMark = Math.max(this.highWaterMark, heapMb);
    }, intervalMs);
  }
  
  getMemoryReport(): string {
    const usage = process.memoryUsage();
    return [
      `Heap: ${(usage.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(usage.heapTotal / 1024 / 1024).toFixed(1)}MB`,
      `RSS: ${(usage.rss / 1024 / 1024).toFixed(1)}MB`,
      `External: ${(usage.external / 1024 / 1024).toFixed(1)}MB`,
      `Array buffers: ${(usage.arrayBuffers / 1024 / 1024).toFixed(1)}MB`,
      `High water: ${this.highWaterMark.toFixed(1)}MB`,
    ].join('\n');
  }
}
```

---

## 44.10 Putting It All Together

The developer tools form a diagnostic layer that sits beneath the agent and above the raw runtime:

```
┌─────────────────────────────────────────────────┐
│                  Agent Runtime                    │
├─────────────────────────────────────────────────┤
│              Developer Tools Layer                │
│                                                  │
│  ┌────────┐  ┌──────────┐  ┌───────────────┐   │
│  │/doctor │  │/ctx-viz  │  │Debug Logging  │   │
│  │Install │  │Token     │  │Category +     │   │
│  │diags   │  │breakdown │  │level filter   │   │
│  └────────┘  └──────────┘  └───────────────┘   │
│                                                  │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐   │
│  │/debug-tool │  │Startup   │  │ANSI→Image│   │
│  │Permission  │  │profiler  │  │PNG/SVG   │   │
│  │trace       │  │Checkpoint│  │Asciicast │   │
│  └────────────┘  └───────────┘  └──────────┘   │
│                                                  │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐   │
│  │FPS tracker │  │Heap dump  │  │Headless  │   │
│  │Frame jank  │  │Memory     │  │profiler  │   │
│  │detection   │  │monitoring │  │CI/CD     │   │
│  └────────────┘  └───────────┘  └──────────┘   │
├─────────────────────────────────────────────────┤
│              Raw Runtime (Node/Bun)               │
└─────────────────────────────────────────────────┘
```

**`/doctor` validates the foundation** — it checks that every dependency, credential, and configuration is correct before you start debugging anything else.

**`/ctx-viz` shows where tokens go** — when the agent starts compacting unexpectedly or running out of context, the visualization tells you which category is consuming the most space.

**Debug logging with filters** gives you X-ray vision into any subsystem — API calls, permission evaluations, compaction decisions, MCP messages — without drowning in irrelevant noise.

**`/debug-tool-call` traces a single operation** from tool resolution through permission evaluation to execution, showing exactly why a tool call succeeded or failed.

**The startup profiler identifies bottlenecks** in the bootstrap sequence, turning "startup feels slow" into "MCP server initialization takes 823ms, here's how to fix it."

**ANSI-to-image conversion** bridges the gap between terminal output and the rest of the world — bug reports, documentation, presentations, and web pages.

**The headless profiler** automates performance monitoring in CI/CD, catching regressions before they reach users.

Together, these tools mean you never have to guess why the agent is behaving a certain way. Every decision — what model to use, whether to allow a tool call, when to compact context, how to route a request — is observable, traceable, and debuggable. This is what separates a prototype from a production system: not just that it works, but that when it doesn't work, you can figure out why.

---

## 44.11 The Debug Command Registry

All debug tools are unified under a single registry that makes them discoverable and consistent:

```typescript
const DEBUG_COMMANDS: Command[] = [
  new DoctorCommand(),           // /doctor
  new CtxVizCommand(),           // /ctx-viz, /context
  new DebugToolCallCommand(),    // /debug-tool-call
  new DebugTokensCommand(),      // /debug-tokens
  new DebugPermissionsCommand(), // /debug-permissions
  new DebugHooksCommand(),       // /debug-hooks
  new DebugMcpCommand(),         // /debug-mcp
  new ProfileCommand(),          // /profile startup|turn|session
  new HeapDumpCommand(),         // /heap-dump [reason]
  new ExportScreenshot(),        // /screenshot [format]
  new RecordCommand(),           // /record start|stop [path]
];
```

Each debug command follows the same pattern: collect internal state, format it for human consumption, and return it as text. They never modify state — they're pure observers. This makes them safe to run at any point during a conversation without worrying about side effects.

The convention is that debug commands prefixed with `/debug-` show the internal trace of the *most recent* operation of that type. `/debug-tool-call` shows the last tool call. `/debug-permissions` shows the last permission evaluation. `/debug-hooks` shows the last hook execution chain. This pattern means you can reproduce an issue, then immediately inspect what happened:

```
> Read ./secret.env
[Permission denied]

> /debug-permissions
Last evaluation: Read(./secret.env)
Decision: DENY
Matched rule: deny Read(./.env) [source: settings.json]
Evaluation trace:
  1. deny Read(./.env) → matched (glob: .env ≈ secret.env? no)
  2. deny Read(./secret*) → MATCHED ← this rule caught it
  3. allow Read(*) → skipped (deny already matched)
```

This observability principle — every decision is traceable — is what separates a production-grade developer tool from a hobby project. When something goes wrong, you don't guess. You trace.

This concludes Part XII. With testing infrastructure and developer tools in place, we've covered the complete engineering stack of an AI-powered CLI agent — from the bootstrap sequence that starts it up to the debug tools that help you understand it. The appendices that follow provide quick-reference material: the complete tool catalog, all hook events, environment variables, feature flags, and keyboard shortcuts.
