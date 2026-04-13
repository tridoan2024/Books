# Chapter 37: Plugin System

A CLI agent that ships only the features its creators anticipated is a CLI agent that dies the moment users outgrow it. The real leverage comes from extensibility -- from a plugin system that lets third parties add commands, tools, hooks, agents, MCP servers, and output styles without modifying a single line of the host codebase. Claude Code's plugin system spans over 3,300 lines in `pluginLoader.ts` alone, with thousands more across the marketplace manager, policy engine, sandbox, and registry modules. It implements a complete ecosystem: discovery, installation, versioning, dependency resolution, conflict detection, security sandboxing, hot-reload, a centralized marketplace backed by Google Cloud Storage, and a blocklist system that can kill malicious plugins across every installation simultaneously.

In this chapter, we will build a production-grade plugin system from the ground up. We will start with the plugin format and manifest specification, move through the loader architecture and dependency resolution, then cover the marketplace manager, versioning and caching, security policy enforcement, the DXT (Developer Extension Toolkit) packaging format, and the auto-update pipeline that keeps plugins current without breaking user workflows.

---

## 37.1 Architecture Overview

The plugin system sits between the application core and the outside world. Everything that enters through plugins -- code, hooks, tools, MCP servers -- passes through multiple layers of validation, sandboxing, and policy enforcement before it can touch the runtime:

```
+--------------------------------------------------------------+
|                     Plugin System                             |
|  +-------------+  +---------------+  +---------------------+ |
|  | PluginLoader|  | Marketplace   |  | PolicyEngine        | |
|  | - discover  |  | - index cache |  | - blocklist         | |
|  | - resolve   |  | - downloader  |  | - flag store        | |
|  | - load      |  | - sig verify  |  | - permission audit  | |
|  | - reload    |  | - installer   |  | - sandbox level     | |
|  +------+------+  +-------+-------+  +----------+----------+ |
|         |                 |                      |            |
|  +------v-----------------v----------------------v----------+ |
|  |                    Plugin Registry                       | |
|  |  +--------+ +----------+ +---------+ +----------------+ | |
|  |  |Commands| |  Hooks   | |  Tools  | | MCP Servers    | | |
|  |  +--------+ +----------+ +---------+ +----------------+ | |
|  +----------------------------------------------------------+ |
|  +----------------------------------------------------------+ |
|  |                   Lua Sandbox (mlua)                      | |
|  |  - capability grants   - resource limits                  | |
|  |  - filesystem guard    - network guard                    | |
|  |  - audit logging       - instruction limits               | |
|  +----------------------------------------------------------+ |
+--------------------------------------------------------------+
```

Four architectural principles drive the design:

1. **Isolation by default.** Every plugin runs in a sandboxed Lua VM with dangerous globals removed. A plugin cannot access `os`, `io`, `debug`, `loadfile`, `dofile`, `load`, `require`, `rawget`, `rawset`, `rawequal`, `rawlen`, `collectgarbage`, `newproxy`, `getfenv`, or `setfenv`. It can only interact with the host through the explicitly registered `rcode.*` API surface.

2. **Error isolation.** A crashing plugin never takes down the host. Plugin execution is wrapped in `std::panic::catch_unwind`, and runtime Lua errors in hook callbacks are logged and swallowed. A bad plugin degrades gracefully -- it fails alone while every other plugin continues operating.

3. **Policy before execution.** Before a plugin loads, the `PolicyEngine` checks it against the blocklist, validates its permissions, verifies its signature (if required), and confirms that the maximum plugin count has not been exceeded. A plugin that fails policy never gets a Lua VM.

4. **Dependency-ordered loading.** Plugins declare dependencies on other plugins. The loader performs a topological sort (Kahn's algorithm) to determine load order, detects circular dependencies, and validates version constraints before any code executes.

---

## 37.2 The Plugin Manifest

Every plugin starts with a `plugin.toml` manifest -- the contract between the plugin and the host runtime. The manifest declares what the plugin is, what it needs, and what it provides:

```toml
[plugin]
name = "code-formatter"
display_name = "Code Formatter"
version = "2.1.0"
description = "Formats source code using various backends"
author = "Dev <dev@example.com>"
license = "MIT"
repository = "https://github.com/example/formatter"
min_rcode_version = "^0.1.0"
entry = "init.lua"
tags = ["formatting", "code-quality"]
hooks = ["on_file_change", "before_send"]

[permissions]
file_read = true
file_write = true
shell = true

[dependencies]
core-utils = "^1.0.0"
syntax-parser = ">=0.5.0"

[[commands]]
name = "format"
description = "Format the current file"
usage = "format [--style compact]"

[[tools]]
name = "formatter"
description = "Format code tool"

[[config]]
key = "style"
description = "Formatting style"
field_type = "string"
default = "default"
```

The manifest parser enforces strict validation. Names must contain only alphanumeric characters, hyphens, and underscores -- no spaces, no special characters, max 128 characters. Version strings must be valid semver (major.minor.patch, optional pre-release tag). The entry point must not contain `..` path traversal. Dependencies must have parseable version constraints:

```rust
impl PluginManifest {
    pub fn validate(&self) -> Result<()> {
        if self.name.is_empty() {
            bail!("plugin name cannot be empty");
        }
        if !self.name.chars().all(|c| c.is_alphanumeric()
            || c == '_' || c == '-') {
            bail!("plugin name '{}' contains invalid characters", self.name);
        }
        if self.version.is_empty() {
            bail!("plugin version cannot be empty");
        }
        SemVer::parse(&self.version)?;

        // Validate every dependency constraint is parseable
        for (dep_name, constraint) in &self.dependencies {
            let test = SemVer::parse("0.0.0")?;
            test.satisfies(constraint)?;
        }
        Ok(())
    }
}
```

The manifest also tracks file size limits. Manifests exceeding 512 KiB are rejected outright -- a defense against manifest-based resource exhaustion attacks.

### Capability Declarations

Plugins declare their capabilities through an enum system that controls what the registry expects from them:

```rust
pub enum PluginCapability {
    Commands,       // Provides slash commands
    Tools,          // Provides tool functions
    Hooks,          // Registers lifecycle hooks
    OutputStyles,   // Custom output formatting
    Agents,         // Agent definitions
    McpServer,      // Bundles an MCP server
    LspServer,      // Bundles an LSP server
}
```

The system enforces singleton capabilities -- only one plugin can declare `McpServer` or `LspServer` at a time. If two plugins both declare `McpServer`, a `CapabilityConflict` is raised and the second plugin must be disabled. This prevents the ambiguity of multiple MCP servers competing for the same protocol channel.

---

## 37.3 The Plugin Loader

The loader orchestrates the full lifecycle: discovery, validation, dependency resolution, conflict detection, loading, and health monitoring. It operates across two directories -- the global plugin directory at `~/.config/rcode/plugins/` and the project-local directory at `.rcode/plugins/` -- with local plugins taking precedence over global ones when names collide.

### Discovery

Discovery scans both directories for subdirectories containing a `plugin.toml`:

```rust
pub fn discover_plugins(dirs: &[PathBuf]) -> Vec<PluginManifest> {
    let mut manifests = Vec::new();
    let mut seen_names: HashSet<String> = HashSet::new();

    for dir in dirs {
        if !dir.is_dir() { continue; }
        for entry in fs::read_dir(dir).ok().into_iter().flatten().flatten() {
            let path = entry.path();
            if !path.is_dir() { continue; }
            if !path.join("plugin.toml").exists() { continue; }

            match PluginManifest::from_dir(&path) {
                Ok(m) => {
                    if seen_names.contains(&m.name) {
                        warn!("duplicate plugin '{}'", m.name);
                        continue;
                    }
                    seen_names.insert(m.name.clone());
                    manifests.push(m);
                }
                Err(err) => {
                    warn!("bad manifest in {}: {err}", path.display());
                }
            }
        }
    }
    manifests
}
```

The discovery phase is intentionally lenient -- a bad manifest in one subdirectory never prevents other plugins from loading. Invalid manifests are logged and skipped.

### Dependency Resolution

Once manifests are discovered, the loader resolves their load order using Kahn's algorithm for topological sorting. The dependency graph is built from the `dependencies` field in each manifest, with version constraints validated against the available plugin set:

```rust
pub fn resolve_load_order<'a>(
    manifests: &'a [PluginManifest],
) -> Vec<&'a PluginManifest> {
    let name_to_idx: HashMap<&str, usize> = manifests.iter()
        .enumerate()
        .map(|(i, m)| (m.name.as_str(), i))
        .collect();

    let mut in_degree = vec![0usize; manifests.len()];
    let mut dependents = vec![Vec::new(); manifests.len()];

    for (i, m) in manifests.iter().enumerate() {
        for dep_name in m.dependencies.keys() {
            if let Some(&j) = name_to_idx.get(dep_name.as_str()) {
                dependents[j].push(i);
                in_degree[i] += 1;
            }
        }
    }

    // Kahn's algorithm
    let mut queue: VecDeque<usize> = in_degree.iter()
        .enumerate()
        .filter(|(_, &deg)| deg == 0)
        .map(|(i, _)| i)
        .collect();

    let mut order = Vec::with_capacity(manifests.len());

    while let Some(idx) = queue.pop_front() {
        order.push(&manifests[idx]);
        for &dep_idx in &dependents[idx] {
            in_degree[dep_idx] -= 1;
            if in_degree[dep_idx] == 0 {
                queue.push_back(dep_idx);
            }
        }
    }

    // Plugins not in order are part of circular dependencies
    if order.len() < manifests.len() {
        for (i, m) in manifests.iter().enumerate() {
            if in_degree[i] > 0 {
                warn!("plugin '{}' in circular dependency -- skipped", m.name);
            }
        }
    }

    order
}
```

The depth limit for transitive dependency resolution is set at 48 levels -- generous enough for real plugin ecosystems but bounded to prevent stack exhaustion from pathological dependency graphs.

### Version Constraint Matching

The semver constraint system supports six operators, matching the conventions from npm and Cargo:

| Constraint | Meaning | Example |
|---|---|---|
| `1.2.3` | Exact match | Only 1.2.3 |
| `^1.2.3` | Compatible (same major) | >= 1.2.3, < 2.0.0 |
| `~1.2.3` | Patch-level (same major.minor) | >= 1.2.3, < 1.3.0 |
| `>=1.2.3` | Minimum version | 1.2.3 and above |
| `>1.2.3` | Strictly greater | 1.2.4 and above |
| `*` | Wildcard | Any version |

The caret operator (`^`) is the default recommendation for dependency constraints because it allows minor and patch updates while preventing breaking major version changes -- the same semantics that have proven effective in the npm ecosystem.

### Conflict Detection

After dependency resolution, the loader performs an N^2 scan across all manifests to detect conflicts:

```rust
pub fn resolve_conflicts(plugins: &[PluginManifest]) -> Vec<Conflict> {
    let mut conflicts = Vec::new();
    for i in 0..plugins.len() {
        for j in (i + 1)..plugins.len() {
            let a = &plugins[i];
            let b = &plugins[j];

            // Name conflict
            if a.name == b.name {
                conflicts.push(Conflict {
                    kind: ConflictKind::NameConflict,
                    plugin_a: a.name.clone(),
                    plugin_b: b.name.clone(),
                    detail: format!("duplicate plugin name '{}'", a.name),
                    resolution: ConflictResolution::VersionPrecedence,
                });
            }

            // Singleton capability conflicts
            for cap in [PluginCapability::McpServer, PluginCapability::LspServer] {
                if a.has_capability(cap) && b.has_capability(cap) {
                    conflicts.push(Conflict {
                        kind: ConflictKind::CapabilityConflict,
                        // ...
                        resolution: ConflictResolution::MustDisable(b.name.clone()),
                    });
                }
            }
        }
    }
    conflicts
}
```

The `ConflictResolver` provides four resolution strategies: `FirstWins` (first loaded takes precedence), `LastWins` (last loaded overrides), `VersionPrecedence` (higher version wins), and `Strict` (any conflict is fatal). Per-pair overrides let operators resolve specific conflicts without changing the global strategy.

The registry also detects finer-grained conflicts that the manifest-level scan misses: duplicate command names, duplicate tool names, and duplicate hook priorities. When two plugins both register a `/format` command, the conflict is caught and reported with the resource name, both plugin identifiers, and the recommended resolution.

---

## 37.4 The Lua Sandbox

Every plugin runs inside a sandboxed Lua VM powered by `mlua`. The sandbox removes dangerous globals before any plugin code executes:

```rust
const SANDBOX_REMOVALS: &[&str] = &[
    "os", "io", "debug", "loadfile", "dofile", "load", "require",
    "rawget", "rawset", "rawequal", "rawlen",
    "collectgarbage", "newproxy", "getfenv", "setfenv",
];

pub fn new(project_root: &Path) -> Result<Self> {
    let lua = Lua::new();
    let g = lua.globals();
    for name in SANDBOX_REMOVALS {
        g.set(*name, LuaNil)?;
    }
    // Register the rcode.* API as the ONLY way to interact with the host
    // ...
}
```

With `require` removed, plugins cannot import Lua modules or access the filesystem through standard library functions. With `os` and `io` removed, they cannot spawn processes or open files. The only way a plugin can interact with the outside world is through the `rcode.*` API table that the host explicitly registers.

### The rcode API Surface

The host exposes a controlled API that plugins call to interact with the system:

| API Group | Functions | Permission Required |
|---|---|---|
| **File ops** | `read_file`, `write_file`, `edit_file`, `glob_files`, `grep_content` | `file_read` / `file_write` |
| **Git ops** | `git_status`, `git_diff`, `git_log`, `git_commit`, `git_branch` | `git` |
| **Shell ops** | `run_command`, `get_env`, `set_env` | `shell` |
| **UI ops** | `log`, `warn`, `error`, `prompt_user`, `show_progress`, `notify` | `ui` |
| **Context ops** | `get_messages`, `get_session_id`, `get_model`, `get_cwd` | (always available) |
| **Hook ops** | `register_hook`, `unregister_hook`, `list_hooks` | (always available) |
| **Command ops** | `register_command`, `unregister_command` | (always available) |
| **Tool ops** | `register_tool`, `unregister_tool`, `invoke_tool` | (always available) |
| **HTTP ops** | `fetch_url`, `post_json` | `http` |
| **Memory ops** | `search_memory`, `save_fact`, `get_context` | (always available) |
| **Config ops** | `get_config`, `set_config` | (always available) |

Every file operation is path-sandboxed to the project root. The `read_file` function canonicalizes both the project root and the requested path, then verifies that the canonical file path starts with the canonical root:

```rust
let canon_root = root.canonicalize()?;
let canon_file = resolved.canonicalize()?;

if !canon_file.starts_with(&canon_root) {
    return Err(LuaError::runtime(
        format!("path escapes project sandbox: {rel_path}")
    ));
}
```

Shell command execution, when enabled, is restricted to a whitelist of safe commands: `cat`, `ls`, `grep`, `git`, `cargo`, `npm`, `node`, `python3`, and a handful of standard Unix utilities. Arbitrary shell execution requires the `shell` permission to be explicitly granted in the plugin's manifest and approved by the user.

### Capability-Based Access Control

Beyond the boolean permission flags, the sandbox implements a fine-grained capability model with four access levels:

```rust
pub enum AccessLevel {
    None,    // No access
    Read,    // Read-only
    Write,   // Read + write
    Admin,   // Full control (delete, chmod, etc.)
}

pub enum Capability {
    File,      // Local filesystem
    Network,   // HTTP access
    Shell,     // Command execution
    Ui,        // UI interaction
    Config,    // Editor configuration
}
```

A `CapabilitySet` is constructed for each plugin based on its manifest permissions and resolved against the user's policy. The capability check is the inner loop of every API call:

```rust
impl CapabilitySet {
    pub fn check(&self, cap: Capability, required: AccessLevel) -> Result<()> {
        let actual = self.level(cap);
        if actual.satisfies(required) {
            Ok(())
        } else {
            bail!(
                "plugin '{}' requires {}:{} but only has {}:{}",
                self.label, cap, required, cap, actual
            )
        }
    }
}
```

### Audit Logging

Every capability check, whether granted or denied, is recorded in a bounded audit log:

```rust
pub struct AuditLog {
    entries: Arc<Mutex<VecDeque<AuditEntry>>>,
    capacity: usize,
    violations: Arc<AtomicU64>,
    denials: Arc<AtomicU64>,
}
```

The audit log tracks four severity levels: `Info` (normal capability use), `Warning` (approaching limits), `Denied` (a check failed), and `Violation` (an attempted bypass was caught). Violation counts are tracked atomically and surfaced in health checks, letting operators detect plugins that are repeatedly trying to exceed their permissions.

---

## 37.5 Policy Engine: Blocklist, Flagging, and Permission Audit

Before a plugin ever reaches the Lua VM, it must pass the `PolicyEngine` -- a three-layer enforcement system combining a blocklist, a flag store, and a permission auditor.

### The Blocklist

The blocklist is a list of plugin name and version pairs that are unconditionally rejected. It ships with a default set of known-bad entries:

```rust
fn default_blocklist() -> Vec<BlocklistEntry> {
    vec![
        BlocklistEntry::with_version(
            "evil-keylogger", "*",
            "known malicious: captures keystrokes",
        ),
        BlocklistEntry::with_version(
            "data-exfil", "*",
            "known malicious: exfiltrates workspace data",
        ),
        BlocklistEntry::with_version(
            "crypto-miner", "*",
            "known malicious: cryptocurrency mining",
        ),
        BlocklistEntry::with_version(
            "unsafe-shell", "<1.0.0",
            "pre-1.0 versions have RCE vulnerability",
        ),
    ]
}
```

The blocklist supports version-scoped entries. `"unsafe-shell" "<1.0.0"` blocks only pre-1.0 versions while allowing patched releases. The wildcard `"*"` blocks all versions of a plugin. In a production deployment, the blocklist syncs from the marketplace backend, enabling the platform team to kill a malicious plugin across every installation within minutes of discovery.

### Plugin Flagging

Flags are softer signals than blocklist entries. A plugin can be flagged for review without being outright blocked:

```rust
pub enum PluginFlag {
    SecurityConcern,       // severity: 4 (blocking)
    Deprecated,            // severity: 2
    Malicious,             // severity: 5 (blocking)
    LowQuality,            // severity: 2
    UnverifiedAuthor,      // severity: 1
    ExcessivePermissions,  // severity: 3
    Unstable,              // severity: 1
}
```

Flags with severity >= 4 are blocking -- they prevent the plugin from loading just like a blocklist entry. Flags with lower severity are informational: they appear in plugin listings and health reports but do not prevent loading. This two-tier system lets the platform degrade plugins gradually rather than imposing a binary allow/block decision.

### Permission Auditing

The permission auditor analyzes the full set of permissions requested by a plugin and produces a risk assessment. It checks individual permissions against known-dangerous lists, then analyzes permission combinations:

```rust
if has_network && has_shell {
    audits.push(PermissionAudit::new(
        "network+shell_exec",
        RiskLevel::Critical,
        "combination allows remote code execution",
        "strongly recommend denying unless absolutely necessary",
    ));
}

if has_network && has_file_write {
    audits.push(PermissionAudit::new(
        "network+file_write",
        RiskLevel::High,
        "combination allows downloading and writing arbitrary files",
        "ensure plugin sandboxes file writes to a specific directory",
    ));
}
```

The combinatorial check is critical. A plugin requesting only `network` access is medium-risk. A plugin requesting only `shell_exec` is high-risk. But a plugin requesting both `network` and `shell_exec` is critical-risk -- the combination enables downloading and executing arbitrary code, which is the canonical remote code execution pattern.

The `PolicyEngine` combines all three layers into a single evaluation:

```rust
impl PolicyEngine {
    pub fn evaluate(&self, manifest: &PluginManifest) -> Result<(), PolicyViolation> {
        // 1. Plugin count limit
        if self.loaded_count >= self.policy.max_plugins {
            return Err(PolicyViolation::TooManyPlugins);
        }
        // 2. Blocklist
        if self.blocklist.is_blocked(&manifest.name, &manifest.version) {
            return Err(PolicyViolation::Blocked(reason));
        }
        // 3. Flag store
        if self.flag_store.has_blocking_flag(&manifest.name) {
            return Err(PolicyViolation::Blocked(/* ... */));
        }
        // 4. Source verification, signature check, permission check
        check_policy(&self.policy, manifest)
    }
}
```

The default policy allows up to 64 plugins simultaneously. In paranoid sandbox mode, all dangerous permissions (`file_write`, `shell_exec`, `network`, `env_read`, `env_write`, `process_spawn`, `system_info`, `clipboard`, `keychain`) are denied unless explicitly auto-approved.

---

## 37.6 The Marketplace Manager

The marketplace is how plugins flow from authors to users. It consists of an index (the catalog of available plugins), a downloader, a signature verifier, a checksum verifier, a dependency solver, and an installer. The reference backend uses Google Cloud Storage for hosting plugin archives and a JSON index file.

### The Plugin Index

The index is an in-memory catalog of available plugins, periodically fetched from the marketplace URL:

```rust
pub struct PluginIndex {
    entries: Vec<IndexEntry>,
    fetched_at: Option<SystemTime>,
    source_url: String,
    etag: Option<String>,
}
```

Each `IndexEntry` carries rich metadata: name, version, author, tags, download URL, SHA-256 checksum, optional Ed25519 signature, download count, user rating, publication timestamp, and dependency declarations. The index supports multiple query patterns:

- **Text search** across name, description, author, and tags
- **Tag-based search** for browsing by category
- **Author-based search** for finding all plugins by a publisher
- **Version listing** for seeing all available versions of a plugin
- **Top-rated** and **most-downloaded** rankings for discoverability
- **Recently published** for finding new additions

The index implements staleness detection. If the index was fetched more than a configurable `max_age` ago, it is considered stale and will be re-fetched on the next operation. An `etag` field enables conditional HTTP fetches, so re-fetching a fresh index only downloads data when it has actually changed.

### Installation Pipeline

The installation pipeline resolves dependencies, downloads archives, verifies integrity, extracts files, and registers the plugin:

```
User: "install code-formatter"
  |
  v
[1] Resolve dependencies (code-formatter -> core-utils, syntax-parser)
  |
  v
[2] Download archives (parallel, with progress)
  |
  v
[3] Verify checksums (SHA-256)
  |
  v
[4] Verify signatures (Ed25519, if required by policy)
  |
  v
[5] Extract to plugins directory
  |
  v
[6] Validate extracted manifest against index manifest
  |
  v
[7] Register in local plugin index
  |
  v
[8] Load plugin into runtime
```

The `DependencyResolver` operates against both the remote index and the local registry. If a dependency is already installed and its version satisfies the constraint, it is skipped. Optional dependencies are skipped entirely if they are not available. The resolver detects circular dependencies and reports them as errors rather than looping infinitely.

### Checksum and Signature Verification

Every downloaded archive is verified against its SHA-256 checksum from the index:

```rust
pub struct ChecksumVerifier;

impl ChecksumVerifier {
    pub fn sha256_hex(data: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(data);
        hex::encode(hasher.finalize())
    }

    pub fn verify(data: &[u8], expected: &str) -> Result<()> {
        let actual = Self::sha256_hex(data);
        if actual != expected {
            bail!("checksum mismatch: expected {}, got {}", expected, actual);
        }
        Ok(())
    }
}
```

Signature verification uses a trusted public key system. The `SignatureVerifier` maintains a list of trusted Ed25519 public keys and can verify that an archive was signed by a known author. When `require_signatures` is enabled in the policy, unsigned plugins are rejected outright. The verification result reports both checksum and signature status:

```rust
pub struct VerificationResult {
    pub checksum_valid: bool,
    pub signature_valid: bool,
    pub key_id: Option<String>,
}
```

A plugin that passes checksum verification but fails signature verification is still installable in non-strict modes -- but the verification result is stored with the installation record, so the user can see that the plugin is not cryptographically verified.

### Update and Rollback

The update pipeline creates a backup of the current installation before replacing it:

```rust
pub struct UpdateResult {
    pub plugin_name: String,
    pub old_version: Version,
    pub new_version: Version,
    pub backup_path: PathBuf,
    pub verification: VerificationResult,
}
```

The backup path follows the pattern `.{plugin-name}.backup` inside the plugins directory. If an update fails -- checksum mismatch, extraction error, manifest validation failure -- the system can restore from the backup. This atomic-update-with-rollback pattern is the same strategy used by package managers like apt and brew.

The `InstalledPlugin` record tracks whether a plugin is pinned:

```rust
pub struct InstalledPlugin {
    pub name: String,
    pub version: Version,
    pub install_path: PathBuf,
    pub installed_at: SystemTime,
    pub updated_at: Option<SystemTime>,
    pub checksum: String,
    pub enabled: bool,
    pub pinned: bool,
}
```

Pinned plugins are excluded from auto-update sweeps. This is critical for enterprise environments where a specific plugin version has been tested and approved -- you do not want an auto-update breaking a validated workflow.

### Local Cache

The marketplace includes a local cache for offline support and faster repeated installs:

```rust
pub struct LocalCache {
    cache_dir: PathBuf,
    cached_index: Mutex<Option<PluginIndex>>,
    cached_downloads: Mutex<HashMap<String, PathBuf>>,
    max_size: u64,  // 500 MB default
}
```

Downloaded archives are cached by their SHA-256 checksum. If the user reinstalls a plugin or another plugin has the same dependency, the archive is served from cache instead of re-downloaded. The cache has a configurable size limit (default 500 MB) and can be cleared manually when disk space is a concern.

---

## 37.7 MCP Server Integration

Plugins can bundle MCP (Model Context Protocol) servers, exposing new tools to the agent through the standard MCP protocol. When a plugin declares the `McpServer` capability, the MCP integration layer spins up a server process and syncs its tools with the global tool registry.

### Server Lifecycle

The `McpPluginServer` tracks the full lifecycle of a plugin-provided MCP server:

```rust
pub struct McpPluginServer {
    pub plugin_name: String,
    pub server_config: McpServerConfig,
    pub connection: ConnectionState,  // Disconnected | Connecting | Connected | ...
    pub tools_registered: Vec<ToolDef>,
    pub started_at: Option<Instant>,
    pub invocation_count: u64,
    pub error_count: u64,
    pub event_log: Vec<McpEvent>,
}
```

The server config specifies the command to run, arguments, environment variables, and transport type (stdio, TCP, or WebSocket). As discussed in Chapter 30, stdio is the default transport for local plugins because it requires no network configuration and has the lowest latency.

### Tool Synchronization

When a plugin server starts, its tools are synced to the global tool registry:

```rust
pub fn sync_plugin_tools(
    server: &McpPluginServer,
    registry: &mut ToolRegistry,
) {
    registry.remove_plugin_tools(&server.plugin_name);
    for tool in &server.tools_registered {
        if let Err(e) = registry.register(tool.clone()) {
            warn!("failed to register tool '{}': {e}", tool.name);
        }
    }
}
```

Tools are namespaced as `plugin_name::tool_name` to prevent collisions with host tools and tools from other plugins. The sync is idempotent -- it removes all previous tools for the plugin before re-registering, so restarts and hot-reloads are safe.

### Health Monitoring

Each plugin server is periodically health-checked. The health check evaluates error rate, uptime, tool count, and health-check freshness:

```rust
pub fn plugin_server_health(server: &McpPluginServer) -> HealthStatus {
    if server.error_rate() > 0.5 {
        return HealthStatus::Unhealthy("error rate exceeds 50%");
    }
    if server.tools_registered.is_empty() {
        return HealthStatus::Degraded("no tools registered");
    }
    if server.tools_registered.len() > 256 {
        return HealthStatus::Degraded("too many tools");
    }
    HealthStatus::Healthy
}
```

A server with an error rate above 50% is marked unhealthy and stopped. A server with no tools registered or with overdue health checks is marked degraded. The `McpPluginManager` aggregates health across all plugin servers and surfaces it in the `/plugin health` command.

---

## 37.8 Hot-Reload and State Persistence

Plugins support hot-reload for rapid development. The registry monitors plugin files for changes and reloads modified plugins without restarting the session:

```rust
pub fn check_hot_reload(&mut self) -> Result<Vec<PluginId>> {
    let stale_ids: Vec<PluginId> = self.plugins.iter()
        .filter(|(_, state)| state.loaded && state.enabled && state.is_stale())
        .map(|(id, _)| id.clone())
        .collect();

    for id in stale_ids {
        // Debounce: 500ms between reloads
        if let Some(last) = self.pending_reloads.get(&id) {
            if now.duration_since(*last) < Duration::from_millis(500) {
                continue;
            }
        }
        self.reload_plugin(&id)?;
    }
    Ok(reloaded)
}
```

The debounce window (500ms) prevents rapid-fire reloads when an editor writes a file multiple times in quick succession. The reload sequence is unload (fire `on_plugin_unload` hook, drop Lua VM), then load (create new VM, register API, execute entry script, fire `on_plugin_load` hook).

### Persisted State

Plugin enabled/disabled status and per-plugin configuration survive across sessions through a JSON state file:

```rust
pub struct PersistedState {
    pub enabled: HashMap<String, bool>,
    pub config: HashMap<String, HashMap<String, String>>,
    pub disabled_plugins: HashSet<String>,
}
```

The state file is saved after every enable/disable/config change. On startup, it is loaded and applied before any plugins are initialized. Plugins default to enabled -- a plugin is only disabled if the user has explicitly disabled it.

---

## 37.9 DXT (Developer Extension Toolkit) Support

The DXT format is the packaging standard for distributing plugins through the marketplace. A DXT package is a zip archive with a well-defined structure:

```
my-plugin.dxt
+-- plugin.toml         # Manifest
+-- init.lua            # Entry point
+-- lib/                # Supporting Lua modules
+-- assets/             # Icons, README, screenshots
+-- CHANGELOG.md        # Version history
+-- LICENSE             # License text
```

The DXT toolchain provides commands for plugin authors:

| Command | Purpose |
|---|---|
| `rcode plugin scaffold <name>` | Generate a new plugin skeleton |
| `rcode plugin verify <path>` | Validate manifest and entry point |
| `rcode plugin pack <path>` | Create a `.dxt` archive |
| `rcode plugin publish <path>` | Upload to the marketplace |

The scaffold command generates a complete plugin template with a valid manifest, a minimal `init.lua` that registers a sample command and hook, a `.gitignore`, and a `CHANGELOG.md`. This reduces the time from idea to working plugin from hours to minutes.

The verify command runs the full validation suite without actually loading the plugin: manifest parsing, semver validation, entry point existence, dependency constraint parsing, and a dry-run through the policy engine. It catches errors that would only surface at load time, giving authors fast feedback during development.

The pack command creates a zip archive with the manifest, entry point, and any supporting files, then computes and embeds the SHA-256 checksum. The publish command uploads the archive to the marketplace backend, where it is indexed and made available for discovery.

---

## 37.10 Auto-Update and Orphan Cleanup

The auto-update system runs on a configurable interval (daily by default) and checks the marketplace index for newer versions of installed plugins:

```
For each installed plugin:
  1. Skip if pinned
  2. Check marketplace for latest version
  3. If latest > installed and compatible:
     a. Create backup
     b. Download new version
     c. Verify checksum + signature
     d. Extract and validate
     e. Reload plugin
     f. Remove backup after successful reload
```

The compatibility check uses the caret constraint by default -- auto-updates within the same major version are applied, but major version bumps require manual approval. This prevents breaking changes from being silently applied.

### Orphan Cleanup

Over time, uninstalled plugins can leave behind cache entries, backup directories, and stale state records. The orphan cleanup runs periodically (weekly by default) and removes:

- Backup directories (`.plugin-name.backup`) older than 7 days
- Cache entries for plugins no longer in the index
- State records for plugins no longer on disk
- Downloaded archives for versions that are no longer the latest

The cleanup is conservative -- it only removes data that is definitively orphaned. A backup directory less than 7 days old is preserved because the user might need to rollback.

---

## 37.11 The Plugin Registry: Putting It All Together

The `PluginRegistry` is the central coordinator that ties together discovery, loading, conflict detection, hook dispatch, and command execution. Its `initialize()` method runs the full lifecycle:

```rust
pub fn initialize(&mut self) -> Result<RegistryReport> {
    // Phase 1: Discover manifests from global + local dirs
    let discovered = self.discover()?;

    // Phase 2: Validate manifests, check version compatibility
    for (id, manifest, dir) in &discovered {
        manifest.validate()?;
        // Check rcode version compatibility
    }

    // Phase 3: Detect conflicts (duplicate commands, tools)
    self.conflicts = detect_conflicts(&manifest_refs);

    // Phase 4: Resolve dependencies (topological sort)
    let dep_result = resolve_dependencies(&valid_manifests)?;

    // Phase 5: Load in dependency order, respecting enabled state
    for id in &self.load_order {
        if !self.persisted.is_enabled(id.as_str()) {
            continue;  // Skip disabled plugins
        }
        self.load_plugin(id)?;
    }

    Ok(report)
}
```

The `RegistryReport` returned by initialization provides a complete accounting: how many plugins were discovered, how many were valid, which loaded successfully, which failed and why, which were disabled, which had incompatible versions, which had dependency errors, and how many conflicts were detected. This is the data that powers the `/plugin status` command.

Hook dispatch walks the load order and fires the event on each loaded plugin:

```rust
pub fn dispatch_event(&self, event: HookEvent, payload: Value) -> Result<usize> {
    let mut total = 0;
    for id in &self.load_order {
        if let Some(state) = self.plugins.get(id) {
            if !state.loaded || !state.enabled { continue; }
            match dispatch_hooks(lua, ctx, event.as_str(), payload.clone()) {
                Ok(count) => total += count,
                Err(e) => error!("hook dispatch error in '{}': {e}", id),
            }
        }
    }
    Ok(total)
}
```

The 14 hook events cover the full session lifecycle: `on_message`, `on_response`, `on_tool_call`, `on_tool_result`, `on_session_start`, `on_session_end`, `on_file_change`, `on_error`, `on_command`, `on_config_change`, `before_send`, `after_send`, `on_plugin_load`, and `on_plugin_unload`. This comprehensive event surface means plugins can intercept and augment virtually any behavior in the system.

Command and tool execution use a first-match-wins dispatch. The load order determines priority: plugins loaded earlier take precedence when multiple plugins register the same command name. This is predictable and debuggable, unlike priority-number schemes that lead to invisible ordering conflicts.

Shutdown walks the load order in reverse, unloading each plugin gracefully:

```rust
pub fn shutdown(&mut self) -> Result<()> {
    let ids: Vec<PluginId> = self.load_order.iter().rev().cloned().collect();
    for id in &ids {
        self.unload_plugin(id)?;  // Fires on_plugin_unload hook
    }
    self.save_state()?;
    Ok(())
}
```

Reverse-order unloading ensures that dependents are unloaded before their dependencies, preventing use-after-unload errors.

---

## 37.12 Security Considerations

Plugin systems are inherently adversarial surfaces. Every plugin is untrusted code running inside a trusted host. The security design must assume that some fraction of plugins will be malicious, buggy, or vulnerable, and contain the damage:

**Defense in depth.** The system applies five independent security layers: sandbox (remove dangerous globals), policy (blocklist, flags, permission audit), capability grants (fine-grained access control), audit logging (detect anomalous patterns), and signature verification (establish author identity). Compromising any single layer is insufficient to achieve arbitrary access.

**Least privilege.** Plugins start with no capabilities and must explicitly request each permission. The default policy auto-approves only `file_read`. Every other permission requires user confirmation or policy configuration.

**Combinatorial risk analysis.** The permission auditor does not just check individual permissions -- it flags dangerous combinations. `network + shell_exec` is flagged as critical because it enables remote code execution, even though each permission individually is merely high-risk.

**Blocklist propagation.** When a malicious plugin is discovered, the blocklist update propagates through the marketplace index, which is periodically re-fetched by every installation. The kill chain from discovery to global mitigation is measured in hours, not days.

**Resource limits.** Plugin file size is capped at 1 MB. Manifest size is capped at 512 KiB. Maximum loaded plugins is capped at 64 (128 in the deep loader). These limits prevent resource exhaustion attacks where a plugin consumes unbounded memory, disk, or CPU.

---

## 37.13 Lessons for Practitioners

Building a plugin system for a CLI agent teaches several lessons that are not obvious from the outside:

**The manifest is the contract.** Invest heavily in manifest design because it is the one thing you cannot easily change later. Every field you add is a field you must support forever. Every field you omit is a capability your plugins cannot express. The Claude Code manifest includes 20+ fields, and every one of them exists because a real plugin needed it.

**Sandbox escape is the threat model.** The primary security concern is not data theft (the sandbox prevents filesystem access) or network exfiltration (the sandbox prevents network access) -- it is sandbox escape. A plugin that can call `require` can load `os` and has full system access. The 14 globals removed from the Lua VM were chosen specifically because each one provides a path to sandbox escape.

**Hot-reload makes or breaks the developer experience.** A plugin system where you must restart the host to test changes will not attract contributors. The 500ms debounce window in the hot-reload implementation was tuned empirically -- shorter values caused flickering from rapid file writes, longer values felt sluggish during development.

**Dependency resolution is a solved problem -- use Kahn's algorithm.** There is no need to invent a novel dependency resolution scheme. Topological sort with in-degree tracking handles the common cases (linear chains, diamond dependencies, independent plugins), and cycle detection with DFS covers the error cases. The maximum depth limit (48 levels) is a practical safeguard, not a theoretical limitation.

**Policy should be layered, not monolithic.** Separating the blocklist (hard deny), flag store (soft signals), and permission audit (risk assessment) into distinct components means each layer can be updated independently. The blocklist can be synced hourly from the marketplace. The flag store can be updated by automated security scanners. The permission auditor can be improved without changing the blocklist format.

As we will see in the next chapter on LSP Integration, the plugin system's extensibility model provides the foundation for adding language intelligence capabilities -- plugins can bundle LSP servers just as they bundle MCP servers, using the same lifecycle management, health monitoring, and security sandboxing infrastructure.
