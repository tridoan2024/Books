# Chapter 2: The Bootstrap Sequence

## From `claude` to First Prompt

When you type `claude` and press Enter, a 13-phase startup pipeline fires in roughly 400 milliseconds. That number matters. CLI tools that take more than a second to show a prompt lose users. Claude Code's engineers shaved those milliseconds deliberately — with parallel I/O, deferred imports, side-effect ordering, and fast-path exits that bypass the entire pipeline for trivial operations.

This chapter traces every phase of that pipeline. By the end, you'll understand why imports are interleaved with function calls, why credential reads start before module evaluation completes, and how an 8-layer configuration cascade merges settings from six different sources before the first API call.

---

## Phase 0: The Entry Point — `cli.js`

The actual binary isn't `main.tsx`. It's `cli.js` — a thin bootstrap script that handles fast-path exits before importing the heavy main module.

```typescript
async function main() {
  const args = process.argv.slice(2);

  // Fast path: --version exits immediately, no heavy imports
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    console.log(`${BUILD_CONSTANTS.VERSION} (Claude Code)`);
    return;
  }

  // Profile checkpoint fires before the expensive import
  const { profileCheckpoint } = await import('./utils/startupProfiler.js');
  profileCheckpoint('cli_entry');

  // Special MCP server modes: bypass the entire REPL pipeline
  if (process.argv[2] === '--claude-in-chrome-mcp') {
    profileCheckpoint('cli_claude_in_chrome_mcp_path');
    const { runClaudeInChromeMcpServer } = await import('./mcp/chromeMcp.js');
    await runClaudeInChromeMcpServer();
    return;
  }

  // Bridge/remote-control: separate startup path
  if (['remote-control', 'rc', 'remote', 'sync', 'bridge'].includes(args[0])) {
    profileCheckpoint('cli_bridge_path');
    // ... bridge-specific initialization
    return;
  }

  // Tmux worktree fast path
  if (hasTmuxAndWorktreeFlags(args)) {
    profileCheckpoint('cli_tmux_worktree_fast_path');
    const result = await execIntoTmuxWorktree(args);
    if (result.handled) return;
  }

  // Capture early input while we load the main module
  const { startCapturingEarlyInput } = await import('./utils/earlyInput.js');
  startCapturingEarlyInput();

  profileCheckpoint('cli_before_main_import');
  const { main } = await import('./main.js');
  profileCheckpoint('cli_after_main_import');

  await main();
  profileCheckpoint('cli_after_main_complete');
}
```

Three design decisions stand out:

**1. Fast-path exits.** The `--version` flag prints and exits without importing a single internal module. This costs approximately 5ms total. If `cli.js` imported `main.tsx` first (which transitively imports hundreds of modules), even `--version` would take 200-400ms. Every subcommand that doesn't need the full REPL (MCP serve, bridge, tmux worktree) gets its own fast path with only the imports it needs.

**2. Early input capture.** Between `cli_before_main_import` and `cli_after_main_import`, there's roughly 135ms of module evaluation. During that time, the user might start typing. `startCapturingEarlyInput()` hooks into `process.stdin` to buffer keystrokes so they aren't lost. When the REPL finally mounts, it replays these buffered characters into the input field.

**3. Environment variable guards.** Two environment variables are set before any imports:
```typescript
process.env.NoDefaultCurrentDirectoryInExePath = '1';  // Windows: prevent CWD search for executables
process.env.COREPACK_ENABLE_AUTO_PIN = '0';            // Prevent corepack from modifying package.json
```

These prevent surprising side effects from Node.js and npm tooling that could fire during module evaluation.

---

## Phase 1-3: Side-Effect Import Ordering

As discussed in Chapter 1, `main.tsx` opens with three interleaved import-and-call pairs:

```typescript
import { profileCheckpoint } from './utils/startupProfiler.js';
profileCheckpoint('main_tsx_entry');

import { startMdmRawRead } from './utils/settings/mdm/rawRead.js';
startMdmRawRead();

import { startKeychainPrefetch } from './utils/secureStorage/keychainPrefetch.js';
startKeychainPrefetch();
```

This is the most performance-critical code in the entire application. Let's examine each operation in detail.

### The Startup Profiler

`utils/startupProfiler.ts` wraps Node.js `performance.mark()` to create named checkpoints throughout startup. Each checkpoint records:
- Wall-clock time since process start
- Delta from the previous checkpoint
- Optionally, memory usage (`process.memoryUsage()`) if detailed profiling is enabled

The profiler is minimal by design — it adds microseconds per checkpoint, not milliseconds. The checkpoint names form a narrative:

```
cli_entry                    →  0.000ms
cli_before_main_import       →  2.340ms
cli_after_main_import        → 137.892ms  (135ms of module evaluation)
main_tsx_entry               → 138.014ms
main_tsx_imports_loaded       → 141.567ms
run_main_options_built       → 155.234ms
run_before_parse             → 156.012ms
run_after_parse              → 158.443ms
main_after_run               → 389.221ms
```

The gap between `cli_before_main_import` and `cli_after_main_import` (~135ms) is the cost of evaluating `main.tsx` and all its transitive imports. The gap between `run_after_parse` and `main_after_run` (~230ms) is the `init()` pipeline. These two segments dominate startup time.

When detailed profiling is enabled (via environment variable), the report also includes RSS and heap usage at each checkpoint, formatted as:

```
[+137.892ms] (+135.552ms) cli_after_main_import | RSS: 98.4MB, Heap: 45.2MB
```

This helped the team identify that module evaluation alone allocates ~45MB of heap — a useful baseline for detecting memory leaks.

### MDM Raw Read

MDM (Mobile Device Management) is how enterprises configure Claude Code on managed devices. On macOS, MDM settings are stored in property lists. On Windows, they're in the registry.

`startMdmRawRead()` spawns a subprocess — `plutil` on macOS, `reg query` on Windows — to read the MDM configuration file. The key insight: this is a **fire-and-forget async operation**. The subprocess starts running immediately and produces its output while the remaining ~135ms of module imports evaluate synchronously.

```typescript
// Simplified from rawRead.ts
let mdmReadPromise: Promise<Record<string, unknown>> | null = null;

export function startMdmRawRead(): void {
  if (process.platform === 'darwin') {
    mdmReadPromise = readMacOSPlist();
  } else if (process.platform === 'win32') {
    mdmReadPromise = readWindowsRegistry();
  }
}

export function getMdmRawData(): Promise<Record<string, unknown>> {
  return mdmReadPromise ?? Promise.resolve({});
}

async function readMacOSPlist(): Promise<Record<string, unknown>> {
  const plistPath = '/Library/Managed Preferences/com.anthropic.claude-code.plist';
  try {
    const { stdout } = await execFile('plutil', [
      '-convert', 'json', '-o', '-', plistPath
    ]);
    return JSON.parse(stdout);
  } catch {
    return {};  // No MDM config = empty object
  }
}
```

When the settings cascade later calls `getMdmRawData()`, the promise is either already resolved (the subprocess finished during import evaluation) or resolves almost immediately (the subprocess only takes ~20ms). Without prefetching, this read would block the settings pipeline for 20-40ms.

### Keychain Prefetch

The keychain prefetch is the bigger optimization. Claude Code supports two authentication methods that store credentials in the macOS keychain:
1. **OAuth tokens** — from `claude auth login`
2. **API keys** — legacy direct API key storage

Without prefetching, these reads happen sequentially inside `applySafeConfigEnvironmentVariables()`, which is called during the configuration phase. Each keychain read spawns a subprocess (`security find-generic-password`) that takes ~30ms. Two sequential reads = ~60ms of blocking I/O.

`startKeychainPrefetch()` fires both reads in parallel:

```typescript
let oauthPromise: Promise<OAuthTokens | null> | null = null;
let apiKeyPromise: Promise<string | null> | null = null;

export function startKeychainPrefetch(): void {
  if (process.platform !== 'darwin') return;

  oauthPromise = readKeychainEntry('claude-code-oauth');
  apiKeyPromise = readKeychainEntry('claude-code-api-key');
}

export function getPrefetchedOAuthTokens(): Promise<OAuthTokens | null> {
  return oauthPromise ?? readKeychainEntry('claude-code-oauth');
}

export function getPrefetchedApiKey(): Promise<string | null> {
  return apiKeyPromise ?? readKeychainEntry('claude-code-api-key');
}
```

Both subprocesses run concurrently, overlapping with module evaluation. By the time the auth system needs the results, they've been sitting in resolved promises for 100+ milliseconds. This saves ~65ms on every macOS startup.

The `?? readKeychainEntry(...)` fallback ensures correctness: if `startKeychainPrefetch()` was never called (e.g., on Linux or Windows), the auth system falls back to a direct read.

---

## Phase 4: Module Evaluation

After the three prefetch operations fire, the remaining imports in `main.tsx` evaluate synchronously. This is ~135ms of pure module loading — parsing JavaScript, executing top-level code, resolving dependency chains.

The bundled `cli.js` is approximately 16,800 lines of minified JavaScript (before tree-shaking removes unused feature-gated code). Bun's module evaluator processes this in a single pass, but the transitive dependency graph is deep:

```
main.tsx
├── Commander.js (CLI framework)
├── services/api/claude.ts (3,419 lines)
│   ├── @anthropic-ai/sdk
│   ├── axios (HTTP client)
│   └── services/tokenEstimation.ts
├── utils/hooks.ts (5,022 lines)
├── utils/permissions/*.ts (~7,000 lines)
├── tools/*.ts (52 tool modules)
├── screens/REPL.tsx (5,005 lines)
│   ├── ink/ (custom React renderer)
│   ├── yoga-layout (flexbox engine)
│   └── components/*.tsx
└── ... hundreds more
```

This is where Bun's compile-time feature flags pay off. With `USER_TYPE !== 'ant'`, entire branches of the tool registry are eliminated. Without `COORDINATOR_MODE`, the coordinator module and its dependencies don't exist in the bundle. The ~16,800 lines in the production bundle would be ~25,000+ without tree-shaking.

A key profiling checkpoint — `main_tsx_imports_loaded` — fires after all module evaluation completes. The delta from `main_tsx_entry` to this checkpoint tells you exactly how much module loading costs on each platform.

---

## Phase 5: CLI Parsing

Claude Code uses Commander.js for CLI parsing. The `main()` function constructs a command tree with these top-level commands and their subcommands:

```
claude [options]                     # Interactive REPL (default)
claude -p "prompt"                   # Non-interactive print mode
claude mcp serve|add|remove|list|get # MCP server management
claude auth login|status|logout      # Authentication
claude plugin install|remove|list    # Plugin management
claude auto-mode defaults|config     # Auto-mode inspection
claude doctor                        # Health diagnostics
claude update                        # Self-update
claude setup-token                   # Long-lived token setup
claude agents                        # List configured agents
claude remote-control                # Bridge/remote sessions
```

The main command (interactive REPL) accepts 30+ options:

| Flag | Purpose |
|------|---------|
| `-p, --print` | Non-interactive mode — process prompt and exit |
| `-w, --worktree [name]` | Create a git worktree for isolation |
| `--tmux` | Create tmux session for worktree |
| `--resume [id]` | Resume a previous session |
| `--model <model>` | Override model selection |
| `--permission-mode <mode>` | Set permission mode |
| `--system-prompt <text>` | Prepend to system prompt |
| `--append-system-prompt <text>` | Append to system prompt |
| `--allowedTools <tools...>` | Whitelist specific tools |
| `--disallowedTools <tools...>` | Blacklist specific tools |
| `--mcp-config <path>` | Additional MCP config file |
| `--input-format <format>` | Input format (text, stream-json) |
| `--output-format <format>` | Output format (text, json, stream-json) |
| `--verbose` | Enable verbose output |
| `--debug` | Enable debug logging |
| `--max-turns <n>` | Limit agent loop iterations |
| `--budget <amount>` | Maximum cost budget |
| `--prefill <text>` | Pre-fill the input with text |

Hidden flags (not shown in `--help` but functional) include `--agent-id`, `--agent-name`, `--team-name`, `--agent-color`, `--parent-session-id`, `--teammate-mode`, `--sdk-url`, `--teleport`, `--remote`, `--remote-control`, `--advisor`, `--brief`, and `--channels`. These are used internally by the teammate/swarm system when spawning subagents — the parent process passes configuration via command-line flags to child processes.

Commander.js parsing is fast — typically <3ms for even complex command lines. The `profileCheckpoint('run_before_parse')` and `profileCheckpoint('run_after_parse')` markers bracket this phase.

---

## Phase 5.5: The preAction Hook

Between CLI parsing and the settings cascade, Commander.js fires a `preAction` hook — a critical orchestration point that sequences async prefetch resolution, initialization, and migrations:

```typescript
program.hook('preAction', async (thisCommand) => {
  // 1. Await async subprocesses started at module level
  await Promise.all([
    ensureMdmSettingsLoaded(),        // MDM reads from Phase 1
    ensureKeychainPrefetchCompleted(), // Keychain reads from Phase 2
  ]);

  // 2. Run init() — the full initialization pipeline (memoized)
  await init();

  // 3. Process --plugin-dir inline plugins
  const pluginDir = thisCommand.getOptionValue('pluginDir');
  if (Array.isArray(pluginDir) && pluginDir.length > 0) {
    setInlinePlugins(pluginDir);
    clearPluginCache('preAction: --plugin-dir inline plugins');
  }

  // 4. Run migrations
  runMigrations();

  // 5. Load remote managed settings (non-blocking, fail-open)
  void loadRemoteManagedSettings();
  void loadPolicyLimits();
});
```

The `ensureMdmSettingsLoaded()` and `ensureKeychainPrefetchCompleted()` calls are the rendezvous points for the async work started in Phases 1-2. By now, those subprocesses have had 135+ milliseconds to complete, so these awaits typically resolve in <5ms.

The `init()` function lives in `entrypoints/init.ts` and is **memoized** — it runs once regardless of how many times it's called. We'll examine it in detail below.

---

## Phase 6: The Settings Cascade

This is the most architecturally significant phase of startup. Claude Code's configuration system merges settings from five source layers, with the policy layer itself containing four sub-sources:

```
Layer 1 (lowest):   User settings      (~/.claude/settings.json)
Layer 2:            Project settings   (.claude/settings.json in project root)
Layer 3:            Local settings     (.claude/settings.local.json, gitignored)
Layer 4:            Flag settings      (--settings flag or SDK inline config)
Layer 5 (highest):  Policy settings    (enterprise, first-source-wins):
                      ├── Remote managed    (server-fetched via CCR)
                      ├── MDM/HKLM/plist    (admin-configured on device)
                      ├── managed-settings.json + .d/*.json (file-based admin)
                      └── HKCU registry     (user-level Windows registry)
```

Higher-priority layers override lower ones. Within the policy layer, the first sub-source with data wins — remote managed settings take precedence over MDM, which takes precedence over file-based managed settings. This means:
- Enterprise policy settings override everything except themselves
- Flag settings from CLI override user/project/local settings
- Local settings (gitignored) override project settings (shared with team)
- A team can share baseline config via project settings while individuals customize via local settings

### The Merge Algorithm

Settings don't simply replace each other. The merge is **deep with array concatenation** for certain keys:

```typescript
function mergeSettings(base: Settings, override: Settings): Settings {
  const result = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (key === 'permissions') {
      // Permissions merge specially: allow/deny arrays concatenate
      result.permissions = {
        allow: [
          ...(base.permissions?.allow ?? []),
          ...(override.permissions?.allow ?? []),
        ],
        deny: [
          ...(base.permissions?.deny ?? []),
          ...(override.permissions?.deny ?? []),
        ],
      };
    } else if (key === 'hooks') {
      // Hooks merge by event name, concatenating hook arrays
      result.hooks = mergeHooks(base.hooks, override.hooks);
    } else if (isObject(value) && isObject(base[key])) {
      // Objects merge recursively
      result[key] = mergeSettings(base[key], value);
    } else {
      // Scalars replace
      result[key] = value;
    }
  }

  return result;
}
```

The special handling for `permissions` and `hooks` is critical. If project settings define `allow: ["Bash(git *)"]` and user settings define `allow: ["Bash(npm test)"]`, the result is both rules — not one replacing the other. This lets teams define shared permissions while individuals add their own.

### Settings Validation

After merging, the final settings object is validated against a JSON schema. Invalid settings produce warnings (not errors) — a misconfigured `settings.json` shouldn't prevent Claude Code from starting. The validator checks:

- Permission rules use valid syntax: `Tool(pattern)` or `Tool(*)`
- Hook event names match known lifecycle events
- Model identifiers are recognized (or warned as custom)
- Numeric values are within bounds (e.g., `maxTurns > 0`)
- File paths in deny rules exist (warning if they don't)

Validation errors are accumulated and displayed as warnings in the REPL header, not as fatal errors. The philosophy: **Claude Code should always start, even with a broken config.**

### MDM Settings Integration

The MDM data (prefetched in Phase 1) is part of the policy layer. On macOS, MDM reads from managed preference plists:

```
/Library/Managed Preferences/{username}/com.anthropic.claudecode.plist
/Library/Managed Preferences/com.anthropic.claudecode.plist
```

On Windows, from registry keys:

```
HKLM\SOFTWARE\Policies\ClaudeCode     (device-level)
HKCU\SOFTWARE\Policies\ClaudeCode     (user-level)
```

Enterprise administrators can enforce policy gates that restrict what users can configure:

```json
{
  "permissionMode": "default",
  "allowManagedHooksOnly": true,
  "allowManagedPermissionRulesOnly": true,
  "allowManagedMcpServersOnly": true,
  "disableAllHooks": false,
  "allowedModels": ["claude-sonnet-4-6"],
  "maxBudget": 10.00
}
```

When `allowManagedHooksOnly` is `true`, user-defined hooks from `~/.claude/settings.json`, `.claude/settings.json`, and `.claude/settings.local.json` are blocked — only hooks from managed settings can run. Similarly, `allowManagedPermissionRulesOnly` restricts permission rules to managed sources. This gives enterprises full control over the security boundary.

The `--dangerously-skip-permissions` CLI flag checks `allowDangerouslySkipPermissionsPassed` from policy settings and refuses if the enterprise has disabled it.

---

## Phase 6.5: The init() Pipeline

The `init()` function in `entrypoints/init.ts` is memoized — it runs once, and subsequent calls return the cached Promise. This is the heaviest single phase of startup, performing 16 initialization steps:

```typescript
export const init = memoize(async (): Promise<void> => {
  // Step 1: Enable configuration system
  enableConfigs();

  // Step 2: Apply safe environment variables (BEFORE trust dialog)
  applySafeConfigEnvironmentVariables();
  applyExtraCACertsFromConfig();

  // Step 3: Register signal handlers
  setupGracefulShutdown();

  // Step 4: Initialize event logging (fire-and-forget)
  void Promise.all([
    import('./services/analytics/firstPartyEventLogger.js'),
    import('./services/analytics/growthbook.js'),
  ]).then(([fp, gb]) => {
    fp.initialize1PEventLogging();
    gb.onGrowthBookRefresh(() => {
      void fp.reinitialize1PEventLoggingIfConfigChanged();
    });
  });

  // Step 5: Populate OAuth account info (non-blocking)
  void populateOAuthAccountInfoIfNeeded();

  // Step 6: IDE detection
  void initJetBrainsDetection();

  // Step 7: Repository detection
  void detectCurrentRepository();

  // Step 8: Initialize remote settings + policy loading promises
  if (isEligibleForRemoteManagedSettings()) {
    initializeRemoteManagedSettingsLoadingPromise();
  }
  if (isPolicyLimitsEligible()) {
    initializePolicyLimitsLoadingPromise();
  }

  // Step 9: Record first start time (analytics)
  recordFirstStartTime();

  // Step 10: Configure mTLS certificates
  configureGlobalMTLS();

  // Step 11: Configure HTTP agents (proxy + mTLS)
  configureGlobalAgents();

  // Step 12: API preconnection — overlap TCP+TLS with remaining init
  preconnectAnthropicApi();

  // Step 13: Upstream proxy (remote sessions only)
  if (isRemoteSession()) {
    await initUpstreamProxy();
  }

  // Step 14: Windows shell setup
  setShellIfWindows();

  // Step 15: Register cleanup handlers
  registerCleanup(shutdownLspServerManager);
  registerCleanup(cleanupSessionTeams);

  // Step 16: Scratchpad directory
  if (isScratchpadEnabled()) {
    await ensureScratchpadDir();
  }
});
```

**Step 2** is the security boundary: `applySafeConfigEnvironmentVariables()` reads **only** from `~/.claude/settings.json` (user settings), not from project settings. This prevents an untrusted project from injecting environment variables before the trust dialog.

**Step 12** — `preconnectAnthropicApi()` — is a critical optimization. It initiates the TCP connection and TLS handshake to the Anthropic API server *before* the first API call. By the time the user types their first prompt, the connection is already established, saving 100-200ms of latency on the first API request.

Steps 4-8 are all fire-and-forget (`void` prefix). They run in the background, overlapping with each other and with the later synchronous steps. This maximizes parallelism without blocking the critical path.

---

## Phase 7: Authentication

After configuration loads, Claude Code resolves credentials. The auth system checks five sources in strict priority order — the first one with a valid token wins:

```typescript
export function getAuthTokenSource() {
  // 1. ANTHROPIC_AUTH_TOKEN environment variable (highest)
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    return { source: 'ANTHROPIC_AUTH_TOKEN', hasToken: true };
  }

  // 2. CLAUDE_CODE_OAUTH_TOKEN environment variable (managed context)
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { source: 'CLAUDE_CODE_OAUTH_TOKEN', hasToken: true };
  }

  // 3. OAuth token from file descriptor (CCR/desktop app)
  const oauthTokenFromFd = getOAuthTokenFromFileDescriptor();
  if (oauthTokenFromFd) {
    return { source: 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR', hasToken: true };
  }

  // 4. API key helper (from settings.json apiKeyHelper config)
  const apiKeyHelper = getConfiguredApiKeyHelper();
  if (apiKeyHelper) {
    return { source: 'apiKeyHelper', hasToken: true };
  }

  // 5. claude.ai OAuth from secure storage/keychain (prefetched)
  const oauthTokens = getClaudeAIOAuthTokens();
  if (shouldUseClaudeAIAuth(oauthTokens?.scopes) && oauthTokens?.accessToken) {
    return { source: 'claude.ai', hasToken: true };
  }

  return { source: 'none', hasToken: false };
}
```

Beyond these first-party sources, Claude Code also supports third-party cloud providers — Amazon Bedrock, Google Vertex AI, and Azure AI Foundry. The auth system decides between first-party and third-party with a separate check:

```typescript
function preferThirdPartyAuthentication(): boolean {
  // Interactive mode and VS Code always prefer first-party
  if (state.isInteractive) return false;
  if (clientType === 'claude-vscode') return false;

  // Non-interactive mode: prefer 3P if available
  return true;
}
```

### OAuth Token Lifecycle

OAuth is the primary auth method for consumer users. Credentials are stored in the macOS keychain (prefetched in Phase 2) or the platform-specific credential store on Linux/Windows.

```typescript
async function resolveOAuthCredentials(): Promise<AuthResult | null> {
  const tokens = await getPrefetchedOAuthTokens();
  if (!tokens?.accessToken) return null;

  // Check if token is expired
  if (tokens.expiresAt && Date.now() > tokens.expiresAt * 1000) {
    // Attempt refresh
    const refreshed = await refreshOAuthToken(tokens.refreshToken);
    if (!refreshed) return null;
    await storeOAuthTokens(refreshed);
    return { type: 'oauth', token: refreshed.accessToken };
  }

  return { type: 'oauth', token: tokens.accessToken };
}
```

Token refresh happens transparently. If the refresh token is also expired, the user is prompted to re-authenticate via `claude auth login`.

### 2. API Key

Direct Anthropic API key, read from the environment variable `ANTHROPIC_API_KEY` or the keychain (prefetched in Phase 2).

```typescript
async function resolveApiKey(): Promise<AuthResult | null> {
  // Environment variable takes precedence
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) return { type: 'api_key', key: envKey, source: 'env' };

  // Fall back to keychain
  const keychainKey = await getPrefetchedApiKey();
  if (keychainKey) return { type: 'api_key', key: keychainKey, source: 'keychain' };

  return null;
}
```

### 3. Amazon Bedrock

For users accessing Claude through AWS Bedrock. Credentials come from standard AWS credential resolution (environment variables, shared credential file, instance metadata).

```typescript
async function resolveBedrockCredentials(): Promise<AuthResult | null> {
  if (!process.env.ANTHROPIC_BEDROCK_BASE_URL &&
      !process.env.CLAUDE_CODE_USE_BEDROCK) return null;

  // Uses AWS SDK credential resolution
  const credentials = await resolveAwsCredentials();
  return credentials ? {
    type: 'bedrock',
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials,
  } : null;
}
```

### 4. Google Vertex AI

For users accessing Claude through Google Cloud Vertex AI. Uses Application Default Credentials (ADC) or a service account key.

### 5. Azure AI Foundry

For users accessing Claude through Azure's AI Foundry service. Uses Azure credential chain resolution.

The authentication resolver tries each provider in order and stops at the first success. If none succeed, Claude Code enters a restricted mode where it prompts the user to authenticate:

```
Welcome to Claude Code!

No API key or authentication found. To get started:

  claude auth login     Sign in with your Anthropic account
  
Or set ANTHROPIC_API_KEY in your environment.
```

The provider type is stored in `bootstrap/state.ts` as `apiKeySource` and reported in telemetry. This tells Anthropic's analytics team what percentage of users use OAuth vs. API keys vs. cloud providers.

---

## Phase 8: GrowthBook — Runtime Feature Flags

While compile-time feature flags (via `bun:bundle`) control what code exists in the binary, runtime feature flags control behavior. Claude Code uses GrowthBook for A/B testing and feature gating, with 500+ runtime flags.

GrowthBook initialization:

```typescript
async function initGrowthBook(): Promise<void> {
  const gb = new GrowthBook({
    apiHost: 'https://cdn.growthbook.io',
    clientKey: GROWTHBOOK_CLIENT_KEY,
    // User attributes for targeting
    attributes: {
      id: getAnonymousId(),
      sessionId: state.sessionId,
      platform: process.platform,
      version: BUILD_CONSTANTS.VERSION,
      authType: state.apiKeySource,
      isInternal: isAnthropicUser(),
    },
  });

  await gb.loadFeatures({ timeout: 2000 });
  state.growthbook = gb;
}
```

The `timeout: 2000` is important — if the GrowthBook CDN is unreachable (corporate firewalls, offline mode), initialization fails silently after 2 seconds and all flags fall back to their defaults. Claude Code never blocks startup on a network request that might not succeed.

Feature flags control behaviors like:
- Which models are available in the model picker
- Whether new UI features are visible
- Auto-mode classifier thresholds
- Prompt caching strategies
- Token budget defaults
- Experimental tool availability
- Telemetry sampling rates

Flags are evaluated lazily — `gb.isOn('my_flag')` reads from the locally cached feature set. There's no per-evaluation network call.

---

## Phase 9: The Trust Dialog

On the first run in a new directory, Claude Code displays a trust dialog:

```
╭──────────────────────────────────────────────────╮
│                                                  │
│  Do you trust the files in this folder?          │
│                                                  │
│  /Users/you/projects/untrusted-repo              │
│                                                  │
│  CLAUDE.md and .claude/ settings in this         │
│  directory will be loaded and may affect          │
│  Claude's behavior.                              │
│                                                  │
│  [Yes, trust this folder]  [No, open in          │
│                             restricted mode]      │
│                                                  │
╰──────────────────────────────────────────────────╯
```

This is a security boundary. An untrusted repository could contain a `.claude/settings.json` that:
- Allows destructive commands (`Bash(rm -rf *)`)
- Registers hooks that exfiltrate data
- Points to MCP servers that inject malicious tool descriptions
- Contains `CLAUDE.md` instructions that override safety guidelines

The trust decision is stored per-directory in `~/.claude/trust.json`:

```json
{
  "/Users/you/projects/my-app": {
    "trusted": true,
    "trustedAt": "2026-03-15T10:30:00Z"
  }
}
```

If the user declines trust, Claude Code starts in **restricted mode**: project-level `settings.json`, `CLAUDE.md`, `.mcp.json`, hooks, and skills from the directory are all ignored. Only user-level settings apply.

The trust dialog is skipped for:
- Directories already in `trust.json`
- Non-interactive mode (`-p` flag)
- Subagent processes (they inherit the parent's trust decision)
- The user's home directory (implicitly trusted)

---

## Phase 10: Telemetry Setup

OpenTelemetry providers are initialized:

```typescript
function setupTelemetry(): void {
  // Meter provider for metrics
  state.meter = new MeterProvider({
    resource: new Resource({
      'service.name': 'claude-code',
      'service.version': BUILD_CONSTANTS.VERSION,
    }),
  }).getMeter('claude-code');

  // Logger provider
  state.logger = new LoggerProvider({...}).getLogger('claude-code');

  // Tracer provider for distributed tracing
  state.tracer = new TracerProvider({...}).getTracer('claude-code');

  // Session-level counters
  state.sessionCounter = new AttributedCounter(state.meter, 'session_events');
}
```

Telemetry is gated by user consent (first-run opt-in/out) and enterprise policy. When telemetry is disabled, the providers are replaced with no-op implementations that accept calls but discard data. This means telemetry callsites throughout the codebase don't need conditional checks — they always call the provider, and the provider decides whether to record.

The `d()` function (short for "diagnostic") appears throughout the codebase as the primary telemetry event emitter:

```typescript
d('tengu_init', {
  entrypoint: 'claude',
  hasInitialPrompt: true,
  permissionMode: 'auto',
  apiKeySource: 'oauth',
  // ... 20+ more attributes
});
```

`tengu` is Claude Code's internal codename — every telemetry event is prefixed with it.

---

## Phase 11: Session Initialization

A new session is created with a unique identifier:

```typescript
function initializeSession(): void {
  state.sessionId = generateSessionId();
  state.sessionStartTime = Date.now();

  // Create transcript file
  const transcriptDir = path.join(
    os.homedir(), '.claude', 'projects',
    hashProjectPath(state.projectRoot),
    'sessions'
  );
  ensureDirSync(transcriptDir);
  state.transcriptPath = path.join(transcriptDir, `${state.sessionId}.jsonl`);

  // Register in active sessions
  registerActiveSession(state.sessionId, {
    pid: process.pid,
    cwd: state.cwd,
    startTime: state.sessionStartTime,
  });
}
```

The session ID is a UUID v4, used for:
- Correlating telemetry events across the session
- Naming the transcript file (JSONL format for streaming append)
- Linking subagent sessions to their parent
- Identifying the session in `claude --resume`

The transcript file records every message, tool call, tool result, and state change as JSONL entries. This is how `--resume` works: it replays the transcript to reconstruct the conversation state.

Active session registration writes to `~/.claude/active_sessions.json`, allowing other processes to discover running sessions. This is used by the bridge/remote-control system and by concurrent session detection.

---

## Phase 12: MCP Registry Prefetch

Before the REPL launches, Claude Code prefetches the official MCP server registry:

```typescript
async function prefetchMcpRegistry(): Promise<void> {
  try {
    const response = await fetch(MCP_REGISTRY_URL, {
      signal: AbortSignal.timeout(3000),
    });
    state.mcpRegistry = await response.json();
  } catch {
    // Non-fatal: registry data is optional
  }
}
```

This is a best-effort optimization. The registry contains metadata about officially supported MCP servers — their capabilities, authentication requirements, and health status. When the user later configures an MCP server, this cached data provides instant autocomplete and validation.

Like GrowthBook initialization, this has a timeout (3 seconds) and fails silently. Network unreliability never blocks startup.

---

## Phase 13: REPL Launch

The final phase mounts the Ink renderer and initializes the REPL screen:

```typescript
async function launchREPL(options: REPLOptions): Promise<void> {
  profileCheckpoint('action_after_hooks');

  // Fire SessionStart hooks (including session-setup.sh)
  executeSessionStartHooks(options);

  // Check for brief mode
  configureBriefMode(options);

  // Check for pre-filled prompts or resume data
  configureResume(options);

  // Mount the Ink renderer
  const root = await createRoot(process.stdout);
  await root.render(<App options={options} />);
}
```

The `createRoot()` call initializes:
- The custom Ink fork with its virtual DOM
- The Yoga layout engine for flexbox calculations
- The differential renderer for efficient terminal updates
- Text selection tracking
- FPS monitoring (for performance telemetry)

SessionStart hooks fire here — not earlier. This is when `session-setup.sh` sets environment variables, configures PATH, and runs any per-session initialization the user has configured.

The REPL screen then renders: the prompt input field, the conversation area, the status bar, and any initial messages (onboarding, resume state, pre-filled prompts, pending hook messages).

---

## The Migration System

Migrations run in the `preAction` hook, after `init()` completes. They handle breaking changes across versions — renaming models, updating permission syntax, converting deprecated settings. The current version is 11, with each migration running idempotently on every startup until the version marker catches up:

```typescript
const CURRENT_MIGRATION_VERSION = 11;

function runMigrations(): void {
  if (getGlobalConfig().migrationVersion !== CURRENT_MIGRATION_VERSION) {
    // All migrations run (idempotent by design)
    migrateAutoUpdatesToSettings();
    migrateBypassPermissionsAcceptedToSettings();
    migrateEnableAllProjectMcpServersToSettings();
    resetProToOpusDefault();
    migrateSonnet1mToSonnet45();
    migrateLegacyOpusToCurrent();
    migrateSonnet45ToSonnet46();
    migrateOpusToOpus1m();
    migrateReplBridgeEnabledToRemoteControlAtStartup();

    if (feature('TRANSCRIPT_CLASSIFIER')) {
      resetAutoModeOptInForDefaultOffer();
    }

    // Mark version as complete
    saveGlobalConfig((prev) => ({
      ...prev,
      migrationVersion: CURRENT_MIGRATION_VERSION,
    }));
  }

  // Async migration (fire-and-forget, retries on next startup if fails)
  migrateChangelogFromConfig().catch(() => {});
}
```

The migration names tell a story of Claude Code's evolution:

| Migration | What It Does |
|-----------|-------------|
| `migrateAutoUpdatesToSettings` | Moves auto-update preferences from a standalone config into `settings.json` |
| `migrateBypassPermissionsAcceptedToSettings` | Converts `~/.claude/bypass-permissions-accepted` file into a settings key, deletes the old file |
| `migrateEnableAllProjectMcpServersToSettings` | Converts old MCP config format to the new layered settings system |
| `resetProToOpusDefault` | Resets Pro plan default model when model lineup changes |
| `migrateSonnet1mToSonnet45` | Rewrites `claude-sonnet-1m-2025-03-19` → `claude-sonnet-4-5-20250514` |
| `migrateLegacyOpusToCurrent` | Updates old Opus model IDs to current naming |
| `migrateSonnet45ToSonnet46` | Rewrites Sonnet 4.5 → Sonnet 4.6 references |
| `migrateOpusToOpus1m` | Updates Opus model ID for the 1M context variant |
| `migrateReplBridgeEnabledToRemoteControlAtStartup` | Renames the old "REPL bridge" setting to "Remote Control" |

The version marker is stored in `~/.claude/config.json` (under `migrationVersion`), not in `settings.json`. This separates the migration state from the settings being migrated — preventing a chicken-and-egg problem where migrating settings would change the migration version stored in those same settings.

Migrations are **idempotent** — running them on already-migrated settings produces the same result. This handles crashes mid-migration and the design choice to run *all* migrations on every startup rather than tracking which individual migrations have completed.

---

## Startup Timing Budget

Here's the typical timing breakdown on a modern MacBook:

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| 0. cli.js entry | 2ms | 2ms |
| 1-3. Prefetch + imports overlap | 135ms | 137ms |
| 5. CLI parsing | 3ms | 140ms |
| 6. Settings cascade | 15ms | 155ms |
| 7. Authentication | 5ms* | 160ms |
| 8. GrowthBook | 50ms** | 210ms |
| 9. Trust dialog | 0ms*** | 210ms |
| 10. Telemetry setup | 5ms | 215ms |
| 11. Session init | 10ms | 225ms |
| 12. MCP prefetch | 0ms**** | 225ms |
| 13. REPL launch | 165ms | 390ms |

\* 5ms because keychain was prefetched; would be ~65ms without prefetch
\** Includes network round-trip to GrowthBook CDN; 0ms if cached
\*** 0ms for trusted directories; first-run adds user interaction time
\**** Async, overlaps with REPL launch

The total: **~390ms from `claude` to cursor blinking**. This is well under the 500ms threshold that users perceive as "instant."

The 165ms REPL launch is dominated by the Ink renderer's first paint — laying out components, computing flexbox, and writing the initial frame to the terminal. This is the one phase that's difficult to optimize further without fundamentally changing the UI framework.

---

## What Happens in Non-Interactive Mode

When you run `claude -p "Fix the bug in auth.ts"`, the startup path is different:

1. Phases 0-8 are the same (configuration, auth, flags)
2. Phase 9 (trust dialog) is **skipped** — non-interactive mode trusts the directory
3. Phase 10-11 are the same (telemetry, session)
4. Phase 12 is the same (MCP prefetch)
5. Phase 13 is **replaced** — instead of the REPL, a single query loop runs:

```typescript
if (options.print) {
  // Non-interactive: run once and exit
  const result = await runSingleQuery(options.prompt, options);
  formatOutput(result, options.outputFormat);
  process.exit(0);
}
```

Non-interactive mode doesn't mount the Ink renderer, doesn't initialize the virtual DOM, and doesn't set up text selection or FPS monitoring. It creates a minimal query context, sends one API request, streams the response to stdout, and exits. This shaves ~165ms off startup (the REPL launch phase).

This makes `claude -p` suitable for scripting and CI/CD integration where startup latency matters:

```bash
# Fast: ~225ms startup
RESULT=$(claude -p "What does this function do?" --output-format json < src/auth.ts)
```

---

## Startup Failure Modes

The bootstrap sequence is designed to be resilient. Here's how it handles failures:

| Failure | Behavior |
|---------|----------|
| Invalid `settings.json` (syntax error) | Warning in REPL header; uses defaults |
| Invalid `settings.json` (schema violation) | Warning for invalid keys; valid keys still apply |
| MDM read fails | Empty MDM settings; no enterprise overrides |
| Keychain read fails | Falls back to environment variable auth |
| GrowthBook unreachable | All flags use coded defaults |
| MCP registry unreachable | No autocomplete for MCP servers |
| No authentication found | Restricted mode; prompts user to authenticate |
| Trust dialog declined | Restricted mode; project config ignored |
| SessionStart hook fails | Warning; startup continues |
| Transcript directory unwritable | Warning; session history won't persist |

The design principle: **Claude Code should always start.** A broken config, missing credentials, or unreachable service should degrade functionality, never prevent startup.

---

## Key Takeaways

1. **Parallel I/O overlapped with synchronous module evaluation** is the primary startup optimization. MDM and keychain reads run concurrently with 135ms of import processing.

2. **The 8-layer settings cascade** provides enterprise control (MDM, remote policy), team consistency (project settings), personal customization (local settings), and runtime overrides (CLI flags) — all merged with special handling for permissions and hooks.

3. **Fast-path exits** ensure that `claude --version`, MCP server mode, and other simple subcommands never pay the cost of loading the full application.

4. **Every network operation has a timeout and a fallback.** GrowthBook, MCP registry, and keychain reads all fail gracefully with coded defaults.

5. **The trust dialog is a security boundary** between Claude Code and potentially malicious project configurations. It prevents prompt injection via `CLAUDE.md` and permission escalation via `settings.json`.

6. **Non-interactive mode (`-p`) skips the REPL** and saves ~165ms by not initializing the terminal UI framework.

In Chapter 3, we'll examine the global state architecture in detail — the 250+ fields in `bootstrap/state.ts`, why mutable global state was chosen over dependency injection, and how cache latching saves money on prompt caching.
