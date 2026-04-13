# Appendix C: Environment Variables (100+)

This appendix catalogs all environment variables recognized by the agent, organized by category.

---

## Authentication

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Primary API key | `sk-ant-api03-...` |
| `ANTHROPIC_AUTH_TOKEN` | OAuth bearer token | `eyJ...` |
| `CLAUDE_CODE_API_KEY` | Alternative API key (takes precedence) | `sk-ant-...` |
| `AWS_ACCESS_KEY_ID` | AWS credentials for Bedrock | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for Bedrock | `wJal...` |
| `AWS_SESSION_TOKEN` | AWS temporary session token | `FwoG...` |
| `AWS_REGION` | AWS region for Bedrock | `us-east-1` |
| `AWS_PROFILE` | AWS named profile | `bedrock-prod` |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP service account for Vertex | `/path/to/sa.json` |
| `VERTEX_PROJECT` | GCP project ID for Vertex | `my-project-123` |
| `VERTEX_REGION` | GCP region for Vertex | `us-central1` |

---

## API Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_BASE_URL` | Override API base URL | `https://api.anthropic.com` |
| `ANTHROPIC_API_VERSION` | API version string | `2023-06-01` |
| `ANTHROPIC_MODEL` | Override default model | `claude-sonnet-4-6` |
| `CLAUDE_CODE_MAX_TOKENS` | Override max output tokens | `8192` |
| `CLAUDE_CODE_TASK_BUDGET` | Per-turn task budget tokens | (unset) |
| `CLAUDE_CODE_TEMPERATURE` | Override temperature | `1.0` |
| `CLAUDE_CODE_MAX_RETRIES` | Max API retry attempts | `3` |
| `CLAUDE_CODE_TIMEOUT` | API request timeout (ms) | `120000` |

---

## Behavior & Mode

| Variable | Description | Values |
|----------|-------------|--------|
| `CLAUDE_CODE_PERMISSION_MODE` | Permission mode override | `default`, `auto`, `bypass`, `plan` |
| `CLAUDE_CODE_EFFORT` | Thinking effort level | `low`, `medium`, `high`, `max` |
| `CLAUDE_CODE_THINKING_MODE` | Extended thinking mode | `adaptive`, `enabled`, `ultrathink`, `disabled` |
| `CLAUDE_CODE_FAST_MODE` | Enable fast mode | `1` / `0` |
| `CLAUDE_CODE_HEADLESS` | Non-interactive mode | `1` / `0` |
| `CLAUDE_CODE_DISABLE_HOOKS` | Skip all hooks | `1` |
| `CLAUDE_CODE_DISABLE_MEMORY` | Skip memory loading | `1` |
| `CLAUDE_CODE_DISABLE_MCP` | Skip MCP servers | `1` |
| `CLAUDE_CODE_AUTO_COMPACT` | Auto-compaction threshold | `0.8` (80%) |

---

## Debug & Logging

| Variable | Description | Example |
|----------|-------------|---------|
| `AGENT_LOG_LEVEL` | Global log level | `debug`, `trace`, `warn` |
| `AGENT_LOG_FILTER` | Category-specific log levels | `api=debug,mcp=trace,*=warn` |
| `AGENT_LOG_FILE` | Log output file path | `/tmp/agent-debug.log` |
| `AGENT_PROFILE` | Enable startup profiler | `1` |
| `AGENT_TRACE` | Enable OpenTelemetry tracing | `1` |
| `RCODE_DEBUG` | Enable verbose debug output | `1` |
| `RCODE_LOG_LEVEL` | Rust agent log level | `debug` |
| `CLAUDE_CODE_DEBUG` | Debug mode flag | `1` |
| `CLAUDE_CODE_VERBOSE` | Verbose output | `1` |
| `VCR_MODE` | VCR recording mode | `record`, `replay`, `auto` |

---

## Feature Flags

| Variable | Description | Example |
|----------|-------------|---------|
| `AGENT_FLAGS` | Comma-separated flag overrides | `streaming_tools=true,new_compaction=false` |
| `AGENT_FLAGS_FILE` | Path to flags JSON file | `./flags.json` |
| `CLAUDE_CODE_FEATURES` | Alternative feature flag string | `flag1,flag2=false` |

---

## Network & Proxy

| Variable | Description | Example |
|----------|-------------|---------|
| `HTTP_PROXY` | HTTP proxy URL | `http://proxy:8080` |
| `HTTPS_PROXY` | HTTPS proxy URL | `http://proxy:8080` |
| `NO_PROXY` | Proxy bypass list | `localhost,127.0.0.1,.internal` |
| `NODE_EXTRA_CA_CERTS` | Custom CA certificate bundle | `/path/to/ca-bundle.crt` |
| `SSL_CERT_FILE` | SSL certificate file | `/path/to/cert.pem` |
| `SSL_CERT_DIR` | SSL certificate directory | `/etc/ssl/certs` |
| `ANTHROPIC_CUSTOM_CA` | Custom CA for API connections | `/path/to/anthropic-ca.pem` |

---

## Session & Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDE_CONFIG_DIR` | Configuration directory | `~/.claude` |
| `CLAUDE_PROJECT_DIR` | Project config directory | `.claude` |
| `CLAUDE_CODE_SESSION_DIR` | Session storage directory | `~/.claude/sessions` |
| `CLAUDE_CODE_MEMORY_DIR` | Memory file directory | (auto-detected) |
| `CLAUDE_CODE_TRANSCRIPT_DIR` | Transcript storage | `~/.claude/transcripts` |
| `TMPDIR` | Temporary file directory | `/tmp` |

---

## MCP Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `MCP_SERVERS` | JSON string of MCP server configs | `{"server":{"command":"..."}}` |
| `MCP_TIMEOUT` | MCP connection timeout (ms) | `10000` |
| `MCP_HEALTH_CHECK_INTERVAL` | Health check interval (ms) | `30000` |
| `MCP_MAX_RESULT_SIZE` | Max tool result size (chars) | `100000` |
| `CLAUDE_ENV_FILE` | Environment file injected by hooks | (set by runtime) |

---

## UI & Display

| Variable | Description | Values |
|----------|-------------|--------|
| `TERM` | Terminal type | `xterm-256color` |
| `COLORTERM` | Color support | `truecolor` |
| `NO_COLOR` | Disable all color output | `1` |
| `FORCE_COLOR` | Force color output | `1`, `2`, `3` |
| `COLUMNS` | Terminal width override | `120` |
| `LINES` | Terminal height override | `40` |
| `CLAUDE_CODE_THEME` | UI theme | `dark`, `light`, `auto` |
| `CLAUDE_CODE_BRIEF` | Brief output mode | `1` |

---

## CI/CD & Automation

| Variable | Description | Example |
|----------|-------------|---------|
| `CI` | Running in CI environment | `true` |
| `GITHUB_ACTIONS` | Running in GitHub Actions | `true` |
| `GITHUB_TOKEN` | GitHub API token | `ghp_...` |
| `GH_TOKEN` | Alternative GitHub token | `ghp_...` |
| `GITLAB_CI` | Running in GitLab CI | `true` |
| `JENKINS_URL` | Running in Jenkins | `http://jenkins:8080` |
| `AZURE_DEVOPS_PAT` | Azure DevOps personal access token | `...` |
| `ADO_ORG` | Azure DevOps organization | `myorg` |
| `ADO_PROJECT` | Azure DevOps project | `myproject` |

---

## Enterprise & MDM

| Variable | Description | Example |
|----------|-------------|---------|
| `CLAUDE_CODE_MANAGED_SETTINGS_URL` | Remote managed settings URL | `https://...` |
| `CLAUDE_CODE_MANAGED_SETTINGS_KEY` | HMAC key for settings verification | `hex-encoded-key` |
| `CLAUDE_CODE_POLICY_PATH` | Enterprise policy file path | `/etc/claude/policy.json` |
| `CLAUDE_CODE_MDM_SETTINGS` | MDM settings (macOS profiles) | (auto-detected) |
| `CLAUDE_CODE_ALLOWED_MODELS` | Comma-separated model allowlist | `claude-sonnet-4-6,claude-haiku-4-5` |
| `CLAUDE_CODE_DISABLE_TELEMETRY` | Kill switch for all telemetry | `1` |
| `CLAUDE_CODE_PRIVACY_LEVEL` | Privacy level | `standard`, `strict`, `enterprise` |

---

## Voice & Input

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDE_CODE_VOICE_ENABLED` | Enable voice input | `0` |
| `CLAUDE_CODE_VOICE_LANGUAGE` | Voice recognition language | `en-US` |
| `CLAUDE_CODE_VOICE_KEYTERMS` | Domain-specific vocabulary | (comma-separated) |

---

## Plugin System

| Variable | Description | Example |
|----------|-------------|---------|
| `CLAUDE_CODE_PLUGINS_DIR` | Custom plugins directory | `~/.claude/plugins` |
| `CLAUDE_CODE_DISABLE_PLUGINS` | Disable all plugins | `1` |
| `CLAUDE_CODE_PLUGIN_MARKETPLACE` | Marketplace URL override | `https://...` |

---

## Precedence

When the same setting is configurable via both environment variable and settings file, the resolution order is:

1. **CLI argument** (highest priority)
2. **Environment variable**
3. **Local settings** (`.claude/settings.local.json`)
4. **Project settings** (`.claude/settings.json`)
5. **User settings** (`~/.claude/settings.json`)
6. **Managed/MDM settings**
7. **Built-in defaults** (lowest priority)

Environment variables always override file-based settings but are overridden by explicit CLI arguments.
