# Chapter 40: Security Infrastructure

A CLI agent that can read files, execute shell commands, browse the web, and talk to external MCP servers is, from the perspective of an attacker, one of the most powerful processes running on a developer's machine. It has filesystem access to source code, SSH keys, and cloud credentials. It can run arbitrary commands under the user's identity. It fetches URLs from prompts that may have been injected by an adversary. It communicates with remote servers over protocols that pass opaque tool inputs. And on every turn, it sends a detailed snapshot of the user's project context to a cloud API.

This is not a hypothetical threat landscape. It is the operational reality of every AI coding assistant shipped in 2025 and 2026. The question is not whether security infrastructure is necessary but how deep it must go to make these risks manageable without destroying the user experience that makes the tool worth using.

In the previous chapter, we examined the telemetry and analytics infrastructure that gives operators visibility into what the agent is doing (Chapter 39). Now we turn to the systems that constrain *what the agent is allowed to do*. This chapter covers seven layers of security infrastructure: sandbox adapters for code isolation, secret scanning before commits, filesystem permission boundaries, SSRF protection in web tools and MCP, anti-distillation measures, secure storage via platform keychains, and CA certificate configuration for enterprise environments. Each layer addresses a distinct class of attack, and together they form a defense-in-depth architecture that no single bypass can defeat.

---

## 40.1 The Sandbox Adapter: Code Isolation

When a user types "run this Python script" or when the model decides it needs to compile a Rust crate to verify a fix, the agent spawns a child process. That child process inherits the user's UID, their PATH, their environment variables, and -- unless you intervene -- full access to the filesystem and network. The sandbox adapter is the component that intervenes.

### Design Requirements

The sandbox must satisfy four properties simultaneously:

1. **Containment**: the child process cannot read or write files outside a defined boundary.
2. **Resource limits**: a runaway process cannot consume unbounded memory, CPU, or disk I/O.
3. **Network isolation**: by default, child processes cannot make outbound connections (preventing data exfiltration and C2 callbacks).
4. **Transparency**: the user must still get useful output -- stdout, stderr, exit codes, and timing -- as if the command ran natively.

The tension between containment and transparency is the core design challenge. Too strict and the sandbox breaks legitimate workflows (building a project that needs to read `/usr/include`, for instance). Too loose and the sandbox provides security theater.

### The Configuration Model

The sandbox is configured through three independent policy objects that compose into a complete `SandboxConfig`:

```rust
pub struct SandboxConfig {
    pub name: String,
    pub resources: ResourceLimits,
    pub filesystem: FilesystemPolicy,
    pub network: NetworkPolicy,
    pub env_vars: HashMap<String, String>,
    pub merge_stderr: bool,
}
```

**Resource limits** cap the damage a runaway process can cause:

```rust
pub struct ResourceLimits {
    pub timeout: Duration,              // Wall-clock time (default: 30s)
    pub max_memory_bytes: u64,          // Resident memory (default: 512 MiB)
    pub max_open_files: u64,            // File descriptors (default: 256)
    pub max_processes: u64,             // Child processes (default: 32)
    pub max_cpu_seconds: u64,           // CPU time (default: 30s)
    pub max_output_bytes: usize,        // Stdout/stderr cap (default: 1 MiB)
}
```

These defaults are chosen conservatively. A 512 MiB memory limit accommodates most compilation tasks. A 30-second timeout covers test suites that would otherwise run indefinitely. The 1 MiB output cap prevents a malicious `yes` command from allocating gigabytes of string buffers in the agent process.

**Filesystem policy** defines what the sandboxed process can see:

```rust
pub struct FilesystemPolicy {
    pub root: PathBuf,                  // Sandbox workspace
    pub readonly_mounts: Vec<PathBuf>,  // Read-only bind mounts (/usr, /lib, /bin)
    pub denied_paths: Vec<PathBuf>,     // Blocklist (/etc/shadow, ~/.ssh, ~/.gnupg)
    pub ephemeral_writes: bool,         // Writes vanish after execution
    pub writable_dirs: Vec<PathBuf>,    // Allowed write targets under root
}
```

The denied paths list is critical. Even within the sandbox root, certain paths must never be accessible. The defaults block `/etc/shadow`, `/etc/passwd`, and the user's `.ssh` and `.gnupg` directories. The `ephemeral_writes` flag, when enabled, causes the sandbox to tear down its workspace after execution -- a clean-room approach where nothing persists.

**Network policy** controls outbound connectivity:

```rust
pub struct NetworkPolicy {
    pub allow_network: bool,            // Master switch (default: false)
    pub allowed_hosts: Vec<String>,     // Allowlist when network is on
    pub blocked_ports: Vec<u16>,        // Always blocked: 22, 25, 445, 3389
    pub allow_loopback: bool,           // 127.0.0.1 traffic (default: true)
    pub allow_dns: bool,                // DNS resolution (default: true)
}
```

The default is `allow_network: false`. This is deliberate. The most common attack vector for AI coding agents is prompt injection that causes the agent to exfiltrate data via HTTP requests. With network disabled by default, even a successful injection attempt is contained. When the user explicitly needs network access (installing packages, fetching dependencies), the sandbox is configured with an `allowed_hosts` allowlist rather than opening network access completely.

### Platform-Specific Isolation

The sandbox adapter uses platform-specific isolation mechanisms at execution time, with a capability-degradation fallback chain:

```rust
fn build_sandboxed_command(
    config: &SandboxConfig,
    program: &str,
    args: &[&str],
) -> SandboxResult<Command> {
    #[cfg(target_os = "macos")]
    {
        if command_exists("sandbox-exec") && !config.network.allow_network {
            cmd = Command::new("sandbox-exec");
            cmd.args(["-p", &macos_sandbox_profile(config)]);
            cmd.arg(program);
            cmd.args(args);
        } else {
            cmd = Command::new(program);
            cmd.args(args);
        }
    }

    #[cfg(target_os = "linux")]
    {
        if command_exists("bwrap") {
            cmd = Command::new("bwrap");
            let bwrap_args = build_bwrap_args(config, program, args);
            cmd.args(&bwrap_args);
        } else {
            cmd = Command::new(program);
            cmd.args(args);
        }
    }
    // ...
}
```

On **macOS**, the adapter generates a `sandbox-exec` profile -- Apple's Seatbelt sandbox framework that uses a Scheme-like policy language:

```scheme
(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow sysctl-read)
(allow mach-lookup)
(allow file-read* (subpath "/usr"))
(allow file-read* (subpath "/lib"))
(allow file-write* (subpath "/Users/dev/.rcode/sandbox/tmp"))
(allow file-read* file-write* (subpath "/Users/dev/.rcode/sandbox"))
```

The profile starts with `(deny default)` and then explicitly allows only what the sandbox policy permits. This is a whitelist approach -- anything not explicitly granted is blocked by the kernel.

On **Linux**, the adapter uses `bwrap` (bubblewrap), the same sandboxing tool used by Flatpak. It creates a new mount namespace, binds read-only system directories, mounts the sandbox root as writable, and optionally unshares the network namespace:

```rust
fn build_bwrap_args(config: &SandboxConfig, program: &str, args: &[&str]) -> Vec<String> {
    let mut bwrap_args: Vec<String> = Vec::new();

    // Read-only bind mounts for system libraries
    for ro in &config.filesystem.readonly_mounts {
        if ro.exists() {
            bwrap_args.push("--ro-bind".to_string());
            bwrap_args.push(ro.to_string_lossy().to_string());
            bwrap_args.push(ro.to_string_lossy().to_string());
        }
    }

    // Sandbox root as writable
    bwrap_args.push("--bind".to_string());
    bwrap_args.push(config.filesystem.root.to_string_lossy().to_string());
    bwrap_args.push(config.filesystem.root.to_string_lossy().to_string());

    // tmpfs for /tmp, isolated proc and dev
    bwrap_args.push("--tmpfs".to_string());  bwrap_args.push("/tmp".to_string());
    bwrap_args.push("--proc".to_string());   bwrap_args.push("/proc".to_string());
    bwrap_args.push("--dev".to_string());    bwrap_args.push("/dev".to_string());

    // Network isolation
    if !config.network.allow_network {
        bwrap_args.push("--unshare-net".to_string());
    }

    // PID namespace and die-with-parent
    bwrap_args.push("--unshare-pid".to_string());
    bwrap_args.push("--die-with-parent".to_string());

    bwrap_args.push(program.to_string());
    bwrap_args.extend(args.iter().map(|a| a.to_string()));
    bwrap_args
}
```

The `--die-with-parent` flag ensures that if the agent process crashes, all sandboxed children are terminated immediately. Without this, orphaned child processes could continue running with whatever filesystem or network access the sandbox grants.

### The Sandbox Toggle Command

Users can control the sandbox interactively through the `/sandbox` command, which exposes four levels:

| Level | Writes | Shell | Network | Use Case |
|-------|--------|-------|---------|----------|
| `off` | Yes | Yes | Yes | Trusted projects, full access |
| `readonly` | No | No | No | Code review, reading only |
| `restricted` | No | Allowlisted | Some | Running tests, safe commands only |
| `full` | No | No | No | Complete lockdown |

The restricted level defines an allowlist of commands that are considered safe: `cat`, `ls`, `grep`, `git status`, `git diff`, `cargo test`, `npm test`, `python -m pytest`, and `ruff check`. Everything else is blocked. This provides a middle ground for users who want the agent to run tests but not arbitrary shell commands.

### Environment Sanitization

Before spawning the child, the sandbox clears the inherited environment completely:

```rust
cmd.env_clear();
cmd.env("HOME", config.filesystem.root.to_string_lossy().as_ref());
cmd.env("PATH", "/usr/local/bin:/usr/bin:/bin");
cmd.env("SANDBOX", "1");
cmd.env("SANDBOX_NAME", &config.name);
```

This prevents environment-based attacks where a malicious prompt sets variables like `LD_PRELOAD`, `PYTHONSTARTUP`, `NODE_OPTIONS`, or `GIT_SSH_COMMAND` to point at attacker-controlled code. The `SANDBOX=1` variable lets scripts detect they are running in a sandbox and adjust behavior (for example, skipping network-dependent tests).

---

## 40.2 Secret Scanning Before Commits

The second layer of security infrastructure targets a specific, common, and costly mistake: committing secrets to version control. AWS access keys, API tokens, private keys, and database passwords end up in git history with alarming frequency, and once committed, they are effectively public -- even in private repositories, because git history is notoriously difficult to clean.

### Detection Patterns

The secret scanner operates on staged files before `git commit` executes. It uses regex-based pattern matching tuned for high precision (few false positives) at the cost of some recall:

```rust
fn detect_secrets(content: &str) -> Vec<String> {
    let mut warnings: Vec<String> = Vec::new();

    // AWS access key IDs: always 20 chars starting with AKIA
    let aws_re = Regex::new(r"AKIA[0-9A-Z]{16}").expect("valid regex");
    for mat in aws_re.find_iter(content) {
        warnings.push(format!(
            "Possible AWS access key detected near offset {}: {}...",
            mat.start(),
            &mat.as_str()[..8],
        ));
    }

    // Private key PEM blocks
    let pem_re = Regex::new(r"-----BEGIN[A-Z\s]*PRIVATE KEY-----").expect("valid regex");
    for mat in pem_re.find_iter(content) {
        warnings.push(format!(
            "Private key PEM block detected near offset {}",
            mat.start(),
        ));
    }

    // Bearer tokens
    let bearer_re = Regex::new(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*").expect("valid regex");
    for mat in bearer_re.find_iter(content) {
        let snippet = &mat.as_str()[..mat.as_str().len().min(24)];
        warnings.push(format!(
            "Possible Bearer token near offset {}: {}...",
            mat.start(), snippet,
        ));
    }

    // Keyword = "long_value" patterns (api_key, token, secret, password, credential)
    let kw_pattern = format!(
        r#"(?i)(?:{})[\s]*[=:]\s*["']?([A-Za-z0-9]{{32,}})"#,
        SECRET_KEYWORDS.join("|"),
    );
    let kw_re = Regex::new(&kw_pattern).expect("valid regex");
    for mat in kw_re.find_iter(content) {
        warnings.push(format!(
            "Possible secret value near offset {}: {}...",
            mat.start(),
            &mat.as_str()[..mat.as_str().len().min(40)],
        ));
    }

    warnings
}
```

The scanner targets five categories:

1. **AWS access keys** (`AKIA` prefix, exactly 20 characters). This pattern has near-zero false positives because of the specific prefix format.
2. **PEM private keys** (`-----BEGIN ... PRIVATE KEY-----`). Catches RSA, EC, DSA, and generic private keys.
3. **Bearer tokens** (`Bearer` followed by a Base64-like string). Common in Authorization headers accidentally left in code.
4. **Keyword-value pairs** where `api_key`, `token`, `secret`, `password`, or `credential` precedes a value of 32+ alphanumeric characters. The 32-character minimum filters out short configuration values that are unlikely to be secrets.
5. **GitHub tokens** (`ghp_`, `gho_`, `ghr_` prefixes) and similar platform-specific patterns in the broader scanning configuration.

### Integration with the Hook System

As discussed in Chapter 18 (Hook Architecture), the secret scanner is wired as a `PreToolUse` hook on the `git commit` command. The hook reads JSON from stdin (provided by the hook execution engine), extracts the command, and scans staged files:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "${INPUT}" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))")

if [[ "${COMMAND}" != *"git commit"* ]]; then
  exit 0
fi

# Scan each staged file
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR)
FOUND_SECRETS=0

for file in ${STAGED_FILES}; do
  # Run detection patterns against file content
  if git show ":${file}" | grep -qP 'AKIA[0-9A-Z]{16}'; then
    echo "AWS access key detected in ${file}" >&2
    FOUND_SECRETS=1
  fi
  if git show ":${file}" | grep -qP '-----BEGIN.*PRIVATE KEY-----'; then
    echo "Private key detected in ${file}" >&2
    FOUND_SECRETS=1
  fi
done

if [[ "${FOUND_SECRETS}" -eq 1 ]]; then
  echo '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"Secrets detected in staged files"}}' >&2
  exit 2  # Block the commit
fi

exit 0
```

The exit code protocol is essential: `0` allows the commit to proceed, `2` blocks it with the stderr message surfaced to the model. The model then informs the user about the detected secrets and suggests remediation (removing the secret, using environment variables, or adding the file to `.gitignore`).

### The Deny List in FileWriteTool

Secret scanning is not limited to commit time. The file write tool enforces a static deny list that prevents the agent from creating files in sensitive locations entirely:

```rust
const DENIED_EXTENSIONS: &[&str] = &["pem", "key", "p12", "pfx"];
const DENIED_FILENAMES: &[&str] = &[".env", "id_rsa", "id_ed25519", "authorized_keys"];
const DENIED_DIRS: &[&str] = &[".ssh", ".aws", ".gnupg"];
const DENIED_PATHS: &[&str] = &["/etc/shadow", "/etc/passwd"];
```

The deny list is checked before any write operation:

```rust
fn is_denied_path(path: &Path) -> Option<&'static str> {
    // Check absolute deny-listed paths
    for denied in DENIED_PATHS {
        if path_str.as_ref() == *denied {
            return Some("system file is on the deny list");
        }
    }
    // Check file extension
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        for denied_ext in DENIED_EXTENSIONS {
            if ext_lower == *denied_ext {
                return Some("file extension is on the deny list (private key / certificate)");
            }
        }
    }
    // Check directory components
    for component in path.components() {
        for denied_dir in DENIED_DIRS {
            if seg_str == *denied_dir {
                return Some("path traverses a denied directory (.ssh, .aws, or .gnupg)");
            }
        }
    }
    None
}
```

This defense-in-depth approach means that even if a prompt injection convinces the model to "write a .env file with the database credentials for debugging," the write is blocked at the tool level before the file ever touches disk.

---

## 40.3 Filesystem Permission Boundaries

The file write deny list handles the obvious cases, but a sophisticated attacker does not try to write to `.ssh/id_rsa` directly. They use path traversal (`../../../.ssh/id_rsa`), symlink dereferencing (create a symlink pointing outside the project directory, then write through it), or filename tricks (Unicode normalization that maps to a sensitive filename). The filesystem permission boundary system handles these attacks through deep path validation.

### Path Normalization and Traversal Detection

Every path the agent touches is normalized before any access check:

```rust
pub fn normalize_path(path: &Path) -> PathBuf {
    let mut components: Vec<Component<'_>> = Vec::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                match components.last() {
                    Some(Component::Normal(_)) => { components.pop(); }
                    Some(Component::RootDir) => { /* stay at root */ }
                    _ => { components.push(component); }
                }
            }
            Component::CurDir => { /* skip */ }
            other => { components.push(other); }
        }
    }
    // ...
}
```

This is a lexical normalization -- it resolves `..` and `.` components without touching the filesystem. A subsequent `canonicalize()` call resolves symlinks. The two-phase approach is important: lexical normalization catches the obvious traversal attempts (`../../../etc/passwd`), while filesystem-aware resolution catches symlink-based escapes.

Traversal detection then checks whether the normalized path escapes the allowed boundary:

```rust
pub fn is_path_traversal(path: &Path, base: &Path) -> bool {
    let normalized = if path.is_absolute() {
        normalize_path(path)
    } else {
        normalize_path(&base.join(path))
    };
    !normalized.starts_with(base)
}
```

### Risk Classification

The system classifies every file path into a four-tier risk model:

| Risk Level | Score | Description | Examples |
|-----------|-------|-------------|----------|
| Low | 5 | No special risk | `src/main.rs`, `README.md` |
| Medium | 35 | Project configuration | `package.json`, `Dockerfile`, `tsconfig.json` |
| High | 70 | System configuration | `/etc/hosts`, `/var/log/*` |
| Critical | 95 | Credentials and secrets | `.ssh/id_rsa`, `.env`, `*.pem`, `secrets.yaml` |

The classification uses three checks in priority order:

```rust
pub fn classify_file_risk(path: &Path) -> FileRisk {
    let path_str = path.to_string_lossy().to_lowercase();
    let filename = path.file_name().unwrap_or_default().to_lowercase();

    if is_credential_path(&path_str, &filename) { return FileRisk::Critical; }
    if is_system_config_path(&path_str) { return FileRisk::High; }
    if is_project_config_path(&filename) { return FileRisk::Medium; }
    FileRisk::Low
}
```

The credential detection function maintains a comprehensive catalog of over 70 sensitive path patterns -- everything from SSH keys and GPG keyrings to cloud provider credentials, container configs, Terraform state files, Ansible vault passwords, and Kubernetes secrets. The catalog is deliberately exhaustive:

```rust
pub fn sensitive_path_patterns() -> Vec<&'static str> {
    vec![
        ".ssh/id_rsa", ".ssh/id_ed25519", ".ssh/authorized_keys",
        ".gnupg/secring.gpg", ".gnupg/private-keys-v1.d/*",
        ".env", ".env.local", ".env.production",
        ".aws/credentials", ".kube/config", ".docker/config.json",
        ".npmrc", ".pypirc", ".cargo/credentials",
        "*.pem", "*.key", "*.p12", "*.pfx", "*.jks",
        "secrets.yaml", "secrets.json", "*.vault",
        "*.tfstate", "*.tfstate.backup",
        "token.json", "vault_pass.txt",
        // ... 50+ more patterns
    ]
}
```

### Symlink Safety

Symlinks are a classic escape mechanism. An attacker creates a symlink from `project/innocent_link` to `/etc/shadow`, and then the agent reads or writes through the symlink, accessing a file it should never touch. The symlink resolution system follows the chain to its target and validates the result:

```rust
fn resolve_symlink_safe(path: &Path, allowed_dirs: &[PathBuf]) -> Result<PathBuf, String> {
    let mut current = path.to_path_buf();
    let mut depth = 0;
    let mut visited = HashSet::new();

    while current.is_symlink() {
        if depth >= MAX_SYMLINK_DEPTH {  // 40
            return Err("symlink chain exceeds max depth".to_string());
        }
        let canonical = current.to_string_lossy().to_string();
        if visited.contains(&canonical) {
            return Err("symlink loop detected".to_string());
        }
        visited.insert(canonical);

        current = fs::read_link(&current)?;
        depth += 1;
    }

    let resolved = normalize_path(&current);
    if !allowed_dirs.is_empty() {
        let in_allowed = allowed_dirs.iter().any(|dir| resolved.starts_with(dir));
        if !in_allowed {
            return Err("symlink target is outside allowed directories".to_string());
        }
    }
    Ok(resolved)
}
```

Three protections are layered here: a maximum depth of 40 to prevent infinite chains, a visited-set to detect symlink loops, and a final check that the resolved target is within the allowed directory set. The system also detects "hidden writes" -- symlinks that point to sensitive system directories:

```rust
pub fn detect_hidden_writes(path: &Path) -> bool {
    if !path.is_symlink() { return false; }
    match fs::read_link(path) {
        Ok(target) => {
            let sensitive_prefixes = [
                "/etc/", "/var/", "/usr/", "/bin/", "/sbin/",
                "/boot/", "/proc/", "/sys/", "/dev/", "/root/",
            ];
            for prefix in &sensitive_prefixes {
                if target.to_string_lossy().to_lowercase().starts_with(prefix) {
                    return true;
                }
            }
            target.is_symlink()  // chained symlinks are suspicious
        }
        Err(_) => true,  // can't resolve = suspicious
    }
}
```

---

## 40.4 SSRF Protection in Web Tools and MCP

Server-Side Request Forgery (SSRF) is the attack where an adversary tricks your application into making HTTP requests to internal or restricted network endpoints. In a CLI agent, SSRF is particularly dangerous because the agent has access to `localhost` services (databases, admin panels, cloud metadata endpoints) that are not reachable from the internet.

### The Threat Model

Consider this scenario: a user asks the agent to fetch a URL from a README file. The README was contributed by an external developer and contains a link to `http://169.254.169.254/latest/meta-data/iam/security-credentials/` -- the AWS instance metadata endpoint. If the agent fetches this URL, it retrieves the EC2 instance's IAM credentials and includes them in its response, which is sent to the API.

The SSRF protection operates at two levels: the web fetch tool and the MCP network sandbox.

### Web Fetch Tool Protections

The web fetch tool validates URLs before making requests:

```rust
// URL must start with http:// or https://
if !url.starts_with("http://") && !url.starts_with("https://") {
    return Ok(ToolResult::err("URL must start with http:// or https://"));
}

// Must contain a valid host
let after_scheme = if url.starts_with("https://") { &url[8..] } else { &url[7..] };
if after_scheme.is_empty() || after_scheme.starts_with('/') {
    return Ok(ToolResult::err("Invalid URL: missing host"));
}
```

Beyond basic validation, the tool enforces response size limits (1 MiB default), follows a maximum of 5 redirects, and implements a 30-second timeout. The redirect limit is critical -- without it, an attacker could craft a chain of redirects that eventually lands on an internal endpoint, bypassing hostname checks applied only to the initial URL.

### MCP Network Sandbox

The plugin network sandbox provides stronger protection for MCP servers, which are more likely to make arbitrary HTTP requests on behalf of tools:

```rust
pub struct NetworkSandbox {
    allowed_urls: Vec<String>,
    allowed_hosts: Vec<String>,
    blocked_ips: Vec<IpAddr>,
    blocked_ports: HashSet<u16>,
    allow_all_https: bool,
    max_request_body: u64,
    max_response_body: u64,
    rate_limit: Option<(Duration, u32)>,
}
```

The default configuration blocks loopback addresses (`127.0.0.1`, `0.0.0.0`, `::1`) and dangerous ports (SSH on 22, SMTP on 25, SMB on 445, RDP on 3389):

```rust
impl Default for NetworkSandbox {
    fn default() -> Self {
        Self {
            blocked_ips: vec![
                "127.0.0.1".parse().unwrap(),
                "0.0.0.0".parse().unwrap(),
                "::1".parse().unwrap(),
            ],
            blocked_ports: [22, 23, 25, 445, 3389].into(),
            allow_all_https: false,
            max_request_body: 1024 * 1024,       // 1 MiB
            max_response_body: 10 * 1024 * 1024,  // 10 MiB
            rate_limit: Some((Duration::from_secs(60), 60)),
            // ...
        }
    }
}
```

URL validation happens in two phases. First, the URL is checked against the allowlist:

```rust
pub fn check_url(&self, url: &str) -> Result<()> {
    // Check explicit URL prefix allowlist
    if self.allowed_urls.iter().any(|prefix| url.starts_with(prefix)) {
        return Ok(());
    }
    // Check HTTPS-only mode
    if self.allow_all_https && url.starts_with("https://") {
        return Ok(());
    }
    // Check hostname allowlist with glob patterns
    if let Some(host) = extract_host(url) {
        if self.allowed_hosts.iter().any(|p| host_matches_pattern(&host, p)) {
            return Ok(());
        }
    }
    bail!("URL '{}' is not allowed by network sandbox policy", url)
}
```

Second, the resolved IP and port are checked against blocklists:

```rust
pub fn check_host_port(&self, host: &str, port: u16) -> Result<()> {
    if self.blocked_ports.contains(&port) {
        bail!("port {} is blocked by network sandbox policy", port);
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if self.blocked_ips.contains(&ip) {
            bail!("IP {} is blocked by network sandbox policy", ip);
        }
    }
    Ok(())
}
```

The hostname allowlist supports glob patterns (`*.github.com` matches `api.github.com` and `raw.github.com`), implemented through a simple prefix-matching function:

```rust
fn host_matches_pattern(host: &str, pattern: &str) -> bool {
    if let Some(suffix) = pattern.strip_prefix("*.") {
        host == suffix || host.ends_with(&format!(".{}", suffix))
    } else {
        host == pattern
    }
}
```

Rate limiting is the final defense. Even if an attacker bypasses URL validation, they can only issue 60 requests per minute from a single MCP server. This dramatically limits the utility of SSRF for data exfiltration.

### Missing: DNS Rebinding Protection

One gap worth noting is DNS rebinding protection. An attacker can register a domain that initially resolves to a public IP (passing the allowlist check) and then switches to `127.0.0.1` after the DNS TTL expires. A production system should resolve the hostname to an IP *before* making the request and check the resolved IP against the blocklist. This requires hooking into the DNS resolution step of the HTTP client, which adds complexity but closes a real attack vector.

---

## 40.5 Anti-Distillation Measures

Model distillation -- training a smaller model to mimic a larger one by using the larger model's outputs as training data -- is a commercial concern for AI providers. If an adversary can programmatically invoke the agent, collect its responses, and use those responses to train a competing model, they extract significant value at the cost of API calls.

Anti-distillation in a CLI agent operates differently from web-based protections. The primary measures are:

1. **System fingerprinting**: the system prompt includes unique per-session identifiers that appear in model outputs. If these identifiers show up in a training dataset, the source can be traced.

2. **Output watermarking**: subtle statistical biases in token sampling that are invisible to human readers but detectable by statistical analysis. This is implemented at the API level rather than in the agent, but the agent cooperates by preserving the metadata fields that carry watermark signals.

3. **Rate limiting and usage anomaly detection**: the telemetry system (Chapter 39) tracks per-user request patterns. Automated distillation attempts typically show distinct patterns -- high request volume, systematic prompt variation, rapid fire queries without reading responses. These patterns trigger throttling or account review.

4. **Context compaction**: as discussed in Chapter 6, conversation context is compressed through a summarization pipeline. The "distilled memory" extracted during compaction is deliberately lossy -- it preserves the *decisions* made during a conversation but not the exact reasoning chains that would be most valuable for distillation:

```rust
/// A distilled memory extracted from conversation before compaction.
pub struct DistilledMemory {
    pub summary: String,
    pub key_decisions: Vec<String>,
    pub tool_patterns: Vec<String>,
    // Note: exact model outputs are NOT preserved
}
```

The most effective anti-distillation measure is architectural: the agent's value comes from its *integration* with the developer's environment -- file access, git state, project context, memory, MCP servers -- not from the model's raw outputs. Even a perfect copy of the model's behavior is useless without the tool system, permission infrastructure, and context management that surrounds it. This is security through architecture: the valuable functionality cannot be extracted because it does not reside in the model weights.

---

## 40.6 Secure Storage: Platform Keychain Integration

API keys, OAuth tokens, and MCP server credentials must persist across sessions. Storing them in plaintext files is a non-starter -- any process running as the user can read them, and they end up in backups, cloud sync, and git repositories. The secure storage layer abstracts over platform-native credential managers to keep secrets encrypted at rest.

### The Backend Trait

All backends implement a common interface:

```rust
pub trait SecretBackend: Send + Sync {
    fn name(&self) -> &'static str;
    fn is_available(&self) -> bool;
    fn store(&self, service: &str, key: &str, value: &[u8]) -> StorageResult<()>;
    fn retrieve(&self, service: &str, key: &str) -> StorageResult<Vec<u8>>;
    fn delete(&self, service: &str, key: &str) -> StorageResult<()>;
    fn list_keys(&self, service: &str) -> StorageResult<Vec<String>>;
}
```

The `service` parameter is a namespace (e.g., `"rcode-api"`, `"rcode-mcp"`), and `key` is the credential identifier within that namespace. This two-level hierarchy maps cleanly to how both macOS Keychain and Linux Secret Service organize credentials.

### macOS Keychain Backend

On macOS, the backend shells out to the `security` command-line tool:

```rust
impl SecretBackend for MacOsKeychain {
    fn store(&self, service: &str, key: &str, value: &[u8]) -> StorageResult<()> {
        let _ = self.delete(service, key);  // Avoid duplicates
        let hex = bytes_to_hex(value);
        Self::run_security(&[
            "add-generic-password",
            "-s", service,
            "-a", key,
            "-w", &hex,
            "-U",  // Update if exists
        ])?;
        Ok(())
    }

    fn retrieve(&self, service: &str, key: &str) -> StorageResult<Vec<u8>> {
        let output = Self::run_security(&[
            "find-generic-password",
            "-s", service,
            "-a", key,
            "-w",
        ])?;
        hex_to_bytes(output.trim())
    }
}
```

Values are hex-encoded before storage because the `security` CLI does not handle arbitrary binary data well. The `-U` flag enables upsert behavior, and the delete-before-store pattern avoids duplicate entries that macOS Keychain would otherwise accumulate.

Error handling distinguishes between "not found" (the credential does not exist) and "backend failure" (the keychain is locked, the process lacks permissions):

```rust
fn run_security(args: &[&str]) -> StorageResult<String> {
    let output = Command::new("security").args(args).output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.contains("could not be found") || stderr.contains("errSecItemNotFound") {
            Err(StorageError::NotFound(stderr))
        } else {
            Err(StorageError::BackendFailure(stderr))
        }
    }
}
```

### Encrypted File Fallback

On systems without a native credential manager (headless Linux servers, CI environments, containers), the fallback encrypts credentials using AES-256-GCM with an HMAC-SHA256-derived key:

```rust
fn derive_key(passphrase: &str) -> [u8; 32] {
    const ITERATIONS: u32 = 10_000;
    const SALT: &[u8] = b"rcode-vault-v1-salt";

    let mut key = [0u8; 32];
    let mut mac = Hmac::<Sha256>::new_from_slice(SALT).unwrap();
    mac.update(passphrase.as_bytes());
    let result = mac.finalize().into_bytes();
    key.copy_from_slice(&result);

    for _ in 1..ITERATIONS {
        let mut mac = Hmac::<Sha256>::new_from_slice(SALT).unwrap();
        mac.update(&key);
        let result = mac.finalize().into_bytes();
        key.copy_from_slice(&result);
    }
    key
}
```

The key derivation runs 10,000 iterations to slow down brute-force attacks. The vault file is stored with `0o600` permissions (owner read/write only):

```rust
#[cfg(unix)]
{
    use std::os::unix::fs::PermissionsExt;
    let perms = fs::Permissions::from_mode(0o600);
    fs::set_permissions(self.vault_path(service), perms)?;
}
```

Encryption uses the standard nonce-prepended format: `nonce (12 bytes) || ciphertext`:

```rust
fn aes_encrypt(plaintext: &[u8], key: &[u8; 32]) -> StorageResult<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key)?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher.encrypt(&nonce, plaintext)?;

    let mut output = Vec::with_capacity(12 + ciphertext.len());
    output.extend_from_slice(&nonce);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}
```

### The CredentialVault: Automatic Backend Selection

The `CredentialVault` selects the best available backend at construction time:

```rust
pub struct CredentialVault {
    backends: Vec<Box<dyn SecretBackend>>,
    service: String,
}

impl CredentialVault {
    pub fn new(service: &str) -> Self {
        let mut backends: Vec<Box<dyn SecretBackend>> = Vec::new();

        let keychain = MacOsKeychain::new();
        if keychain.is_available() { backends.push(Box::new(keychain)); }

        let secret_svc = LinuxSecretService::new();
        if secret_svc.is_available() { backends.push(Box::new(secret_svc)); }

        // Encrypted file fallback is always last
        backends.push(Box::new(EncryptedFileBackend::new(
            EncryptedFileBackend::default_path(),
        )));

        Self { backends, service: service.to_string() }
    }
}
```

The ordering is deliberate: platform-native stores (which benefit from hardware security modules, biometric unlock, and OS-level access control) are preferred over the file-based fallback. The encrypted file is always available as a last resort.

### Credential Health Checks

The expanded credential system adds health monitoring that detects operational problems before they cause outages:

```rust
pub fn credential_health_check() -> Vec<CredentialIssue> {
    let services = ["rcode-api", "rcode-mcp", "rcode-plugin", "rcode-oauth"];
    let mut issues = Vec::new();

    for service in &services {
        let entries = list_credentials(service);
        for entry in &entries {
            if entry.is_expired() {
                issues.push(CredentialIssue::Expired { ... });
            }
            if entry.seconds_until_expiry() < 7 * 24 * 3600 {
                issues.push(CredentialIssue::ExpiringSoon { ... });
            }
            if entry.is_weak() {  // secret.len() < 16
                issues.push(CredentialIssue::Weak { ... });
            }
        }
    }
    // Cross-entry duplicate detection
    // ...
    issues
}
```

Five issue types are reported: **Expired** (token has passed its TTL), **ExpiringSoon** (within 7 days of expiry), **Weak** (secret shorter than 16 characters), **Duplicate** (same secret reused across accounts), and **Orphaned** (credential for a service that no longer exists). Atomic token rotation preserves metadata and creates the new credential before deleting the old one, ensuring no window of downtime:

```rust
pub fn rotate_token(service: &str, account: &str, new_secret: &str) -> SecureResult<()> {
    let old = retrieve_credential(service, account).ok();
    let mut new_entry = CredentialEntry::new(service, account, new_secret);
    if let Some(old_entry) = &old {
        new_entry.metadata = old_entry.metadata.clone();
    }
    new_entry.metadata.insert("rotated_at".to_string(), now_epoch_secs().to_string());
    // Store new first -- if this fails, old credential is preserved
    store_credential(&new_entry)?;
    Ok(())
}
```

---

## 40.7 CA Certificate Configuration and mTLS

Enterprise environments routinely intercept TLS traffic using corporate proxy servers that perform man-in-the-middle decryption. These proxies present certificates signed by an internal CA that is not in the system's default trust store. Without explicit CA certificate configuration, the agent's HTTPS connections to the API fail with certificate verification errors.

### The Problem

When a developer at a large corporation runs the CLI agent, the following happens:

1. The agent initiates an HTTPS connection to `api.anthropic.com`.
2. The corporate proxy intercepts the connection and presents its own certificate, signed by the company's internal CA.
3. The agent's HTTP client (reqwest/rustls) validates the certificate chain against the system trust store.
4. The internal CA is not in the system trust store.
5. The connection fails with: `SSL/TLS error: invalid certificate chain`.

This is not a security failure -- it is the TLS stack doing exactly what it should. But it makes the agent unusable in enterprise environments unless the user can configure custom CA certificates.

### Configuration Options

The agent supports three methods for adding custom CA certificates, checked in priority order:

1. **Environment variable**: `NODE_EXTRA_CA_CERTS` or `SSL_CERT_FILE` pointing to a PEM file containing the additional CA certificates.
2. **Configuration file**: a `ca_cert_path` setting in the agent's configuration that points to a PEM or directory of PEM files.
3. **System trust store**: on macOS, certificates added to the System Keychain are automatically trusted. On Linux, certificates in `/etc/ssl/certs/` or `/usr/local/share/ca-certificates/` are used.

The HTTP client builder incorporates custom certificates during construction:

```rust
let mut client_builder = reqwest::Client::builder()
    .timeout(Duration::from_secs(timeout))
    .user_agent(USER_AGENT);

// Add custom CA certificates if configured
if let Some(ca_path) = config.ca_cert_path() {
    let cert_pem = std::fs::read(ca_path)?;
    let cert = reqwest::Certificate::from_pem(&cert_pem)?;
    client_builder = client_builder.add_root_certificate(cert);
}

// Honor NODE_EXTRA_CA_CERTS for compatibility with Node.js toolchains
if let Ok(extra_certs) = std::env::var("NODE_EXTRA_CA_CERTS") {
    let cert_pem = std::fs::read(&extra_certs)?;
    let cert = reqwest::Certificate::from_pem(&cert_pem)?;
    client_builder = client_builder.add_root_certificate(cert);
}
```

### mTLS for Bridge Connections

The bridge system (Chapter 35) supports mutual TLS for connections between the REPL client and remote session daemons. In mTLS, both sides present certificates -- the server proves its identity to the client, and the client proves its identity to the server. This is essential for bridge connections that traverse untrusted networks.

The upstream proxy configuration includes a `verify_tls` flag:

```rust
pub struct UpstreamProxyConfig {
    pub relay_url: String,
    pub auth_token: String,
    pub timeout: Duration,
    pub verify_tls: bool,           // Default: true
    pub custom_headers: HashMap<String, String>,
    pub max_payload_size: usize,    // Default: 8 MiB
}
```

Setting `verify_tls: false` is supported for development and testing but logged as a warning:

```rust
impl UpstreamProxyConfig {
    pub fn validate(&self) -> Result<()> {
        if self.auth_token.is_empty() {
            warn!("Proxy auth_token is empty -- requests may be rejected");
        }
        // Note: verify_tls = false is allowed but discouraged
        Ok(())
    }
}
```

In production bridge deployments, mTLS is configured through a certificate pair:

```
bridge:
  tls:
    cert: /path/to/client.crt
    key: /path/to/client.key
    ca: /path/to/ca.crt
    verify: true
```

The client certificate identifies the connecting REPL instance, the CA certificate validates the bridge server, and the server uses its own CA to validate client certificates. This creates a closed trust domain where only authorized clients can connect to the bridge.

### Certificate Error Handling

TLS errors in the web fetch tool are detected and reported with actionable messages:

```rust
let source = format!("{e}");
if source.to_lowercase().contains("ssl")
    || source.to_lowercase().contains("tls")
    || source.to_lowercase().contains("certificate")
{
    format!("SSL/TLS error: {e}")
}
```

The agent surfaces the raw error to the user rather than silently retrying or falling back to HTTP. This is a deliberate design choice -- TLS errors indicate a real configuration problem that the user needs to resolve, not a transient network issue.

---

## 40.8 Defense in Depth: How the Layers Compose

No single security layer is sufficient. The value of this infrastructure comes from how the layers compose:

| Attack | Layer 1 | Layer 2 | Layer 3 |
|--------|---------|---------|---------|
| Prompt injection → exfiltrate code via HTTP | Network sandbox (blocks outbound) | SSRF blocklist (blocks internal IPs) | Rate limiting (60 req/min) |
| Prompt injection → write SSH key | FileWrite deny list (blocks `.ssh/`) | Path validation (blocks traversal) | Sandbox (ephemeral writes) |
| Malicious MCP server → read credentials | Filesystem policy (denied paths) | Secret scanner (advisory warnings) | Keychain storage (encrypted at rest) |
| Runaway process → consume all memory | Resource limits (512 MiB cap) | Timeout (30s wall clock) | `--die-with-parent` (cleanup on crash) |
| Path traversal → escape project dir | Normalization (resolve `..`) | Symlink resolution (follow and validate) | Allowed-dir check (must be under root) |
| DNS rebinding → access localhost | Port blocklist (22, 25, 445) | IP blocklist (127.0.0.1, ::1) | URL allowlist (explicit hosts only) |

The key insight is that security infrastructure for an AI agent is not fundamentally different from security infrastructure for any multi-tenant system that executes untrusted code. The difference is the *source* of the untrusted input: instead of user-uploaded scripts, the threat is adversarial content embedded in prompts, files, URLs, and MCP tool responses. The defenses -- sandboxing, input validation, least-privilege, encryption at rest, network isolation -- are the same ones we have used for decades. The challenge is applying them at the right granularity to an agent that needs broad access to be useful.

In the next chapter, we will examine the cron scheduler (Chapter 41) -- the system that enables the agent to execute tasks on a recurring schedule, introducing yet another surface where security constraints must be carefully managed.
