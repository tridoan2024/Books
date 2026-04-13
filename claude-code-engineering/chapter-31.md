# Chapter 31: MCP Authentication and Security

MCP servers are, by design, external processes that a CLI agent trusts with tool calls, resource access, and sometimes credentials. That trust must be earned and bounded. An unauthenticated MCP server is a wide-open door. An MCP server with overly broad permissions is a door propped open with a brick. And an MCP server whose OAuth tokens are stored in plaintext is a door with the key taped to the frame.

This chapter covers the full authentication and security stack for MCP connections: from the initial handshake where a server declares its auth requirements, through the OAuth2 flows that obtain tokens, to the persistent token storage, automatic refresh, and session expiration that keep connections alive without re-prompting the user. We will also cover the defense-in-depth measures that protect against server-side request forgery (SSRF), channel-level permission enforcement, and the elicitation system that lets servers request user input without giving them direct terminal access.

The code examined here comes primarily from `rcode/src/mcp/auth.rs` (1,452 lines), `rcode/src/mcp/connections.rs` (881 lines), `rcode/src/mcp/channel_perms.rs` (647 lines), `rcode/src/mcp/elicitation.rs` (360 lines), and `rcode/src/plugins/sandbox.rs` (network sandbox). As we saw in Chapter 30, the MCP subsystem spans 15,879 lines across 18 files. Authentication and security are the hardest parts to get right -- a bug in the transport layer crashes a connection; a bug in the auth layer leaks credentials.

---

## 31.1 The Auth State Machine

Every MCP server connection carries an authentication state. This state is not a boolean flag -- it is a four-state machine that governs what operations are permitted, what messages get sent to the user, and when tokens need to be refreshed.

```
Unauthorized ──> Authorizing ──> Authorized ──> Expired
    ^                                 |              |
    └─────────────────────────────────┘              |
    └────────────────────────────────────────────────┘
```

Here is the enum:

```rust
/// Authentication state for an MCP server connection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthState {
    /// No authentication attempted yet.
    Unauthorized,
    /// OAuth2 flow in progress (waiting for user to authorize).
    Authorizing {
        auth_url: String,
        code_verifier: Option<String>,
    },
    /// Successfully authenticated with a valid token.
    Authorized {
        obtained_at: Instant,
    },
    /// Token has expired and needs refresh.
    Expired {
        expired_at: Instant,
    },
}
```

The transitions are:

1. **Unauthorized -> Authorizing**: The client initiates an OAuth2 flow, generating a PKCE challenge and an authorization URL for the user to visit.
2. **Authorizing -> Authorized**: The user completes the OAuth2 flow, the callback is received, the authorization code is exchanged for tokens.
3. **Authorized -> Expired**: The token's `expires_in` window has elapsed (with a 60-second buffer).
4. **Expired -> Unauthorized**: A refresh attempt fails after the maximum retry count.
5. **Expired -> Authorized**: A refresh token successfully obtains a new access token.

The `Authorizing` state stores the PKCE code verifier because it is needed later when exchanging the authorization code for tokens. Storing it in the state machine -- rather than in a separate variable -- ensures it cannot be used out of sequence. If the state is not `Authorizing`, the code verifier is not accessible.

Three predicate methods make pattern matching ergonomic:

```rust
impl AuthState {
    pub fn is_authorized(&self) -> bool {
        matches!(self, Self::Authorized { .. })
    }
    pub fn is_expired(&self) -> bool {
        matches!(self, Self::Expired { .. })
    }
    pub fn is_authorizing(&self) -> bool {
        matches!(self, Self::Authorizing { .. })
    }
}
```

The state is wrapped in an `Arc<RwLock<AuthState>>`, allowing concurrent reads from health-check tasks and tool invocation paths while serializing writes during state transitions.

### Design Decision: Why Not a Simple Boolean?

A boolean `is_authenticated` field is tempting but inadequate. It cannot represent the "in-progress" state during an OAuth2 flow, leading to race conditions where a second tool call initiates a second authorization flow before the first completes. It cannot distinguish "never tried" from "tried and failed" from "succeeded but expired," which are operationally distinct states that require different recovery actions. The four-state machine eliminates these ambiguities at compile time.

---

## 31.2 Auth Method Configuration

Not every MCP server uses OAuth2. Some use static API keys. Some require no authentication at all. The `AuthMethod` enum captures all supported methods in a tagged, serializable format:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AuthMethod {
    /// No authentication required.
    None,
    /// Static API key sent in a header.
    ApiKey {
        key: String,
        #[serde(default = "default_api_key_header")]
        header: String,
        #[serde(default)]
        prefix: Option<String>,
    },
    /// OAuth2 Authorization Code flow (with optional PKCE).
    OAuth2AuthCode {
        client_id: String,
        #[serde(default)]
        client_secret: Option<String>,
        auth_url: String,
        token_url: String,
        #[serde(default)]
        scopes: Vec<String>,
        #[serde(default = "default_true")]
        use_pkce: bool,
        #[serde(default)]
        redirect_uri: Option<String>,
    },
    /// OAuth2 Client Credentials flow.
    OAuth2ClientCredentials {
        client_id: String,
        client_secret: String,
        token_url: String,
        #[serde(default)]
        scopes: Vec<String>,
    },
}
```

The `#[serde(tag = "type", rename_all = "snake_case")]` annotation means the JSON representation uses an internal tag:

```json
{
  "type": "oauth2_auth_code",
  "client_id": "my-app",
  "auth_url": "https://idp.example.com/authorize",
  "token_url": "https://idp.example.com/token",
  "scopes": ["mcp:read", "mcp:write"],
  "use_pkce": true
}
```

Three aspects of this design are worth noting.

First, PKCE defaults to `true` via `#[serde(default = "default_true")]`. This is a security-first default. Public clients (which includes CLI tools where the binary is distributed to users) cannot securely store a client secret. PKCE provides the proof-of-possession mechanism that makes the authorization code flow safe without a secret. Requiring users to opt out of PKCE (by setting `use_pkce: false`) means the less secure path requires explicit action.

Second, `client_secret` is `Option<String>` for the auth code flow but required (`String`) for client credentials. This reflects the OAuth2 specification: the authorization code flow can use PKCE instead of a client secret, but client credentials flow requires a secret by definition -- the secret is the only credential.

Third, the API key method supports custom headers and prefixes. The default header is `Authorization`, but some APIs use `X-Api-Key` or `X-Custom-Auth`. The optional prefix handles the distinction between `Authorization: Bearer sk-abc123` and `Authorization: Api-Key sk-abc123`.

### How Auth Methods Map to MCP Server Types

| MCP Server Type | Typical Auth Method | Example |
|----------------|--------------------|---------| 
| Local stdio (filesystem tools) | `None` | A local file search server |
| Hosted API service | `ApiKey` | A weather data MCP server |
| User-facing SaaS integration | `OAuth2AuthCode` | GitHub, Slack, Jira MCP servers |
| Machine-to-machine backend | `OAuth2ClientCredentials` | Internal microservice registry |

The auth method is determined at configuration time, either from static config files or from server metadata returned during the MCP `initialize` handshake via the `ServerAuthConfig::from_metadata` parser.

---

## 31.3 OAuth2 Authorization Code Flow with PKCE

The authorization code flow with PKCE is the most complex auth path and the one most MCP servers with user-facing integrations require. It involves four parties: the user, the CLI agent, the authorization server (IdP), and the MCP server. Here is the sequence:

```
User        CLI Agent         Authorization Server    MCP Server
 |              |                      |                   |
 |  use tool    |                      |                   |
 |─────────────>|                      |                   |
 |              |  need auth           |                   |
 |              |<─────────────────────────────────────────|
 |              |                      |                   |
 |              | generate PKCE pair   |                   |
 |              | (verifier+challenge) |                   |
 |              |                      |                   |
 |              | build auth URL       |                   |
 |  open browser|                      |                   |
 |<─────────────|                      |                   |
 |              |                      |                   |
 | login+consent|                      |                   |
 |─────────────────────────────────────>                   |
 |              |                      |                   |
 | redirect to  |  callback with code  |                   |
 | localhost    |<─────────────────────|                   |
 |              |                      |                   |
 |              | exchange code+verifier for tokens        |
 |              |─────────────────────>|                   |
 |              |                      |                   |
 |              |  access_token,       |                   |
 |              |  refresh_token       |                   |
 |              |<─────────────────────|                   |
 |              |                      |                   |
 |              |  tool call + Bearer token                |
 |              |──────────────────────────────────────────>
```

### Step 1: PKCE Challenge Generation

PKCE (Proof Key for Code Exchange, RFC 7636) prevents authorization code interception attacks. The client generates a random code verifier and computes a SHA-256 hash of it as the code challenge:

```rust
const PKCE_VERIFIER_LENGTH: usize = 64;

pub struct PkceChallenge {
    pub code_verifier: String,
    pub code_challenge: String,
    pub method: String,
}

impl PkceChallenge {
    pub fn generate() -> Self {
        let verifier = generate_random_string(PKCE_VERIFIER_LENGTH);
        let challenge = compute_s256_challenge(&verifier);
        Self {
            code_verifier: verifier,
            code_challenge: challenge,
            method: "S256".to_string(),
        }
    }
}

fn compute_s256_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    base64_url_encode(&hash)
}
```

The verifier length of 64 characters is within RFC 7636's recommended range of 43-128 characters. The charset uses the unreserved URL characters (`A-Z`, `a-z`, `0-9`, `-._~`), which avoids encoding issues when the verifier is sent as a form parameter.

The S256 method (SHA-256) is the only method used. The `plain` method (sending the verifier as the challenge) is not supported because it provides no security benefit -- if an attacker can intercept the authorization code, they can also intercept the plain challenge. S256 ensures the challenge cannot be reversed to obtain the verifier.

### Step 2: Building the Authorization URL

The authorization URL encodes all OAuth2 parameters into a query string:

```rust
pub fn build_auth_url(
    auth_endpoint: &str,
    client_id: &str,
    redirect_uri: &str,
    scopes: &ScopeSet,
    state: &str,
    pkce: Option<&PkceChallenge>,
) -> String {
    let mut params = vec![
        ("response_type", "code".to_string()),
        ("client_id", client_id.to_string()),
        ("redirect_uri", redirect_uri.to_string()),
        ("state", state.to_string()),
    ];

    if !scopes.is_empty() {
        params.push(("scope", scopes.to_scope_string()));
    }

    if let Some(pkce) = pkce {
        params.push(("code_challenge", pkce.code_challenge.clone()));
        params.push(("code_challenge_method", pkce.method.clone()));
    }

    let query: Vec<String> = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, simple_percent_encode(v)))
        .collect();

    format!("{}?{}", auth_endpoint, query.join("&"))
}
```

The `state` parameter is a 32-character random string generated for CSRF protection. When the callback arrives, the state parameter is verified to match. Without this check, an attacker could craft a URL that completes an OAuth2 flow using their own authorization code, binding the victim's session to the attacker's account.

### Step 3: Starting the Flow

The `McpAuthenticator` orchestrates the entire flow. Starting it transitions the auth state and returns the URL for the user:

```rust
pub async fn start_auth_code_flow(&self) -> Result<String> {
    let (auth_url, client_id, scopes, use_pkce, redirect_uri) = match &self.method {
        AuthMethod::OAuth2AuthCode { auth_url, client_id, scopes, use_pkce, redirect_uri, .. } => {
            (auth_url.clone(), client_id.clone(), scopes.clone(), *use_pkce, redirect_uri.clone())
        },
        _ => anyhow::bail!("start_auth_code_flow requires OAuth2AuthCode method"),
    };

    let redirect = redirect_uri
        .unwrap_or_else(|| default_redirect_uri(DEFAULT_REDIRECT_PORT));
    let state_param = generate_random_string(32);
    let scope_set = ScopeSet::from_vec(scopes);

    let pkce = if use_pkce {
        Some(PkceChallenge::generate())
    } else {
        None
    };

    let url = build_auth_url(
        &auth_url, &client_id, &redirect, &scope_set,
        &state_param, pkce.as_ref(),
    );

    let mut ws = self.state.write().await;
    *ws = AuthState::Authorizing {
        auth_url: url.clone(),
        code_verifier: pkce.map(|p| p.code_verifier),
    };

    Ok(url)
}
```

The default redirect URI is `http://localhost:9876/callback`. The CLI agent spins up a temporary HTTP server on this port to receive the callback. The 120-second timeout (`CALLBACK_TIMEOUT`) ensures the server does not hang indefinitely if the user abandons the flow.

### Step 4: Completing the Flow

When the callback arrives with an authorization code, the `complete_auth_code_flow` method exchanges it for tokens:

```rust
pub async fn complete_auth_code_flow(&self, code: &str) -> Result<TokenData> {
    let (token_url, client_id, client_secret, redirect_uri, code_verifier) =
        match &*self.state.read().await {
            AuthState::Authorizing { code_verifier, .. } => {
                let cv = code_verifier.clone();
                match &self.method {
                    AuthMethod::OAuth2AuthCode {
                        token_url, client_id, client_secret, redirect_uri, ..
                    } => (
                        token_url.clone(), client_id.clone(),
                        client_secret.clone(),
                        redirect_uri.clone().unwrap_or_else(|| default_redirect_uri(DEFAULT_REDIRECT_PORT)),
                        cv,
                    ),
                    _ => anyhow::bail!("method mismatch for auth code completion"),
                }
            }
            other => anyhow::bail!("cannot complete auth code flow -- current state: {}", other),
        };

    let mut params = HashMap::new();
    params.insert("grant_type", "authorization_code".to_string());
    params.insert("code", code.to_string());
    params.insert("client_id", client_id);
    params.insert("redirect_uri", redirect_uri);
    if let Some(secret) = client_secret {
        params.insert("client_secret", secret);
    }
    if let Some(verifier) = code_verifier {
        params.insert("code_verifier", verifier);
    }

    let client = reqwest::Client::new();
    let resp = client.post(&token_url).form(&params).send().await?;

    // ... error handling and token parsing ...

    let token_data = TokenData::from_response(access_token, &body);

    {
        let mut store = self.token_store.write().await;
        store.set(self.server_name.clone(), token_data.clone());
        let _ = store.save();
    }

    let mut state = self.state.write().await;
    *state = AuthState::Authorized { obtained_at: Instant::now() };

    Ok(token_data)
}
```

The state guard is critical here. The method first reads the current state to extract the code verifier, then verifies the state is `Authorizing`. If someone calls `complete_auth_code_flow` when the state is `Unauthorized` or `Authorized`, the method returns an error rather than proceeding with a potentially invalid code verifier.

---

## 31.4 Client Credentials Flow

The client credentials flow is simpler -- no user interaction needed. It is designed for machine-to-machine communication where the client (the CLI agent) has its own credentials:

```rust
pub async fn client_credentials_flow(&self) -> Result<TokenData> {
    let (token_url, client_id, client_secret, scopes) = match &self.method {
        AuthMethod::OAuth2ClientCredentials {
            token_url, client_id, client_secret, scopes,
        } => (token_url.clone(), client_id.clone(), client_secret.clone(), scopes.clone()),
        _ => anyhow::bail!("client_credentials_flow requires OAuth2ClientCredentials method"),
    };

    let mut params = HashMap::new();
    params.insert("grant_type", "client_credentials".to_string());
    params.insert("client_id", client_id);
    params.insert("client_secret", client_secret);
    if !scopes.is_empty() {
        params.insert("scope", scopes.join(" "));
    }

    let client = reqwest::Client::new();
    let resp = client.post(&token_url).form(&params).send().await?;

    // ... parse response, store token, update state ...

    Ok(token_data)
}
```

No PKCE is needed because the client secret itself serves as proof of identity. No redirect URI is needed because there is no user to redirect. The flow is a single POST request to the token endpoint.

When to use each flow:

| Scenario | Flow |
|----------|------|
| User grants access to their GitHub account | Authorization Code + PKCE |
| CI/CD pipeline accessing an internal API | Client Credentials |
| Script running as a specific service account | Client Credentials |
| Developer authorizing Jira access from their terminal | Authorization Code + PKCE |

---

## 31.5 Token Storage and Lifecycle

Tokens must survive process restarts. A user who authorized GitHub access at 9am should not have to reauthorize at 9:15 when they open a new terminal. The `TokenStore` provides persistent, file-backed storage:

```rust
pub struct TokenStore {
    path: PathBuf,
    tokens: HashMap<String, TokenData>,
}
```

The store is a JSON file with tokens keyed by server name. It supports the full CRUD lifecycle:

```rust
impl TokenStore {
    pub fn load(&mut self) -> Result<()> {
        if !self.path.exists() { return Ok(()); }
        let content = std::fs::read_to_string(&self.path)?;
        self.tokens = serde_json::from_str(&content)?;
        Ok(())
    }

    pub fn save(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(&self.tokens)?;
        std::fs::write(&self.path, content)?;
        Ok(())
    }

    pub fn get(&self, server_name: &str) -> Option<&TokenData> {
        self.tokens.get(server_name)
    }

    pub fn set(&mut self, server_name: String, token: TokenData) {
        self.tokens.insert(server_name, token);
    }

    pub fn remove(&mut self, server_name: &str) -> Option<TokenData> {
        self.tokens.remove(server_name)
    }
}
```

### Token Expiry with Buffer

Token expiry is checked with a 60-second buffer:

```rust
const REFRESH_BUFFER_SECS: u64 = 60;

impl TokenData {
    pub fn is_expired(&self) -> bool {
        let Some(expires_in) = self.expires_in else {
            return false; // No expiry set = never expires
        };
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let expires_at = self.obtained_at + expires_in;
        now + REFRESH_BUFFER_SECS >= expires_at
    }
}
```

The buffer is a deliberate design choice. If a token expires at exactly `T`, and a tool call starts at `T - 1`, the request might arrive at the server at `T + 2` (after network latency). The 60-second buffer ensures the token is refreshed before it gets close to expiry, preventing transient auth failures during in-flight requests.

Tokens without an `expires_in` field are treated as non-expiring. This handles API keys and some OAuth2 providers that issue long-lived tokens without explicit expiration.

### Token Refresh with Retry Limits

When a token expires, the authenticator attempts to refresh it using the refresh token:

```rust
const MAX_REFRESH_RETRIES: u32 = 3;

async fn refresh_token(&self) -> Result<Option<String>> {
    let retries = self.refresh_retries
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    if retries >= MAX_REFRESH_RETRIES {
        let mut state = self.state.write().await;
        *state = AuthState::Expired { expired_at: Instant::now() };
        anyhow::bail!(
            "OAuth2 token refresh failed after {} retries for '{}'",
            MAX_REFRESH_RETRIES, self.server_name,
        );
    }

    // ... build refresh request, send to token endpoint ...

    // On success: reset retry counter, update state
    self.refresh_retries.store(0, std::sync::atomic::Ordering::Relaxed);
    let mut state = self.state.write().await;
    *state = AuthState::Authorized { obtained_at: Instant::now() };

    Ok(Some(auth_header))
}
```

The retry limit prevents infinite loops when the refresh token itself has been revoked. After three failures, the state transitions to `Expired` and the user must re-authorize. The counter is atomic (`AtomicU32`) to allow lock-free incrementing from concurrent tool calls that might all discover the token is expired at the same time.

### The Token Resolution Cascade

When any tool call needs authentication, `get_token()` runs through a resolution cascade:

```rust
pub async fn get_token(&self) -> Result<Option<String>> {
    match &self.method {
        AuthMethod::None => Ok(None),
        AuthMethod::ApiKey { key, prefix, .. } => {
            let value = match prefix {
                Some(p) => format!("{}{}", p, key),
                None => key.clone(),
            };
            Ok(Some(value))
        }
        AuthMethod::OAuth2AuthCode { .. } | AuthMethod::OAuth2ClientCredentials { .. } => {
            self.get_oauth2_token().await
        }
    }
}
```

For OAuth2 methods, the inner `get_oauth2_token()` checks the token store first, attempts a refresh if expired, and only fails if no recovery path exists:

1. Check token store for a non-expired token -> return it
2. Token exists but expired, has refresh token -> attempt refresh
3. Token exists but expired, no refresh token -> transition to Expired, fail
4. No token at all -> fail with appropriate error for current state

This cascade means that the happy path (valid token in cache) is a single hashmap lookup with no network calls.

---

## 31.6 Scope Management

OAuth2 scopes control what operations a token authorizes. The `ScopeSet` type provides deduplication, merging, and the space-separated string format that OAuth2 requires:

```rust
#[derive(Debug, Clone, Default)]
pub struct ScopeSet {
    scopes: Vec<String>,
}

impl ScopeSet {
    pub fn add(&mut self, scope: impl Into<String>) {
        let s = scope.into();
        if !self.scopes.contains(&s) {
            self.scopes.push(s);
        }
    }

    pub fn merge(&mut self, other: &ScopeSet) {
        for s in &other.scopes {
            self.add(s.clone());
        }
    }

    pub fn to_scope_string(&self) -> String {
        self.scopes.join(" ")
    }
}
```

The deduplication in `add()` is important because scopes can come from multiple sources: the server's metadata declares required scopes, the user's configuration may request additional scopes, and merged configurations may repeat scopes. Without deduplication, the scope string sent to the authorization server might contain `"read read write"`, which some IdPs reject.

Server metadata parsing extracts required scopes alongside the auth method:

```rust
pub struct ServerAuthConfig {
    pub method: AuthMethod,
    pub required_scopes: ScopeSet,
    pub metadata_url: Option<String>,
}

impl ServerAuthConfig {
    pub fn from_metadata(metadata: &serde_json::Value) -> Option<Self> {
        let auth = metadata.get("authentication")?;
        let method: AuthMethod = serde_json::from_value(auth.clone()).ok()?;
        let required_scopes = auth.get("required_scopes")
            .and_then(|v| v.as_array())
            .map(|arr| ScopeSet::from_vec(
                arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()
            ))
            .unwrap_or_default();

        Some(Self { method, required_scopes, metadata_url: /* ... */ })
    }
}
```

This means that a server can declare at initialize-time exactly what scopes it needs, and the client can present those to the user during the authorization prompt. The user sees "GitHub MCP Server is requesting: read:repo, read:issues" rather than a blanket permission grant.

---

## 31.7 Connection Lifecycle and Session Expiration

Authentication is only half the problem. The other half is keeping authenticated connections alive, detecting when they die, and recovering without losing the user's flow. The `ConnectionManager` in `connections.rs` handles this through a health monitoring and reconnection system.

### Connection State Machine

Each managed connection has its own state:

```rust
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Error,
    Shutdown,
}
```

Unlike the auth state machine, which governs token validity, this state machine governs transport health. A connection can be `Connected` (transport is alive) but have an `Expired` auth state (token needs refresh). The two machines are independent.

### Health Monitoring

The connection manager runs periodic health checks on all connections:

```rust
const DEFAULT_HEALTH_CHECK_INTERVAL: Duration = Duration::from_secs(30);

pub async fn start_health_monitor(&self, interval: Duration) {
    let connections = self.connections.clone();
    let running = self.running.clone();

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        loop {
            ticker.tick().await;
            if !running.load(Ordering::SeqCst) { break; }

            let conns = connections.read().await;
            for (name, conn) in conns.iter() {
                let mut guard = conn.lock().await;
                if guard.state != ConnectionState::Connected { continue; }

                match guard.transport.health_check().await {
                    Ok(()) => {
                        guard.last_health_check = Some(Instant::now());
                        guard.consecutive_failures = 0;
                    }
                    Err(e) => {
                        guard.consecutive_failures += 1;
                        if guard.consecutive_failures >= 3 && guard.auto_reconnect {
                            guard.state = ConnectionState::Reconnecting;
                        }
                    }
                }
            }
        }
    });
}
```

The triple-failure threshold prevents a single transient error from triggering reconnection. Network hiccups, garbage collection pauses on the server side, and brief DNS failures are all common enough that one or two failures should be tolerated.

### Automatic Reconnection with Exponential Backoff

When reconnection is triggered, the manager uses exponential backoff:

```rust
const INITIAL_BACKOFF: Duration = Duration::from_millis(500);
const MAX_BACKOFF: Duration = Duration::from_secs(60);
const BACKOFF_MULTIPLIER: f64 = 2.0;
const MAX_RECONNECT_ATTEMPTS: u32 = 10;

fn compute_backoff(attempt: u32) -> Duration {
    let delay_ms = (INITIAL_BACKOFF.as_millis() as f64) * BACKOFF_MULTIPLIER.powi(attempt as i32);
    let capped = delay_ms.min(MAX_BACKOFF.as_millis() as f64);
    Duration::from_millis(capped as u64)
}
```

The backoff sequence: 500ms, 1s, 2s, 4s, 8s, 16s, 32s, 60s (capped), 60s, 60s. After 10 failed attempts, the connection transitions to the `Error` state and stops retrying. The user must manually reconnect or restart the session.

### Event-Driven State Reporting

Connection state changes are broadcast to subscribers through an event handler:

```rust
pub type EventHandler = Arc<dyn Fn(ConnectionEvent) + Send + Sync>;

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

This allows the TUI panel and notification hooks to react to connection changes in real time. When a server goes down, the user sees a status indicator change. When reconnection succeeds, the indicator updates without any manual action.

### Concurrent Request Limiting

Each connection carries a semaphore that limits concurrent requests:

```rust
const DEFAULT_CONCURRENT_LIMIT: usize = 10;

struct ManagedConnection {
    // ...
    request_semaphore: Arc<Semaphore>,
}
```

This prevents a burst of parallel tool calls from overwhelming a server. If an MCP server is a small process running on localhost, sending it 50 concurrent requests could crash it or cause timeouts. The semaphore serializes requests above the limit, providing natural backpressure.

---

## 31.8 SSRF Protection

Server-Side Request Forgery (SSRF) is a risk whenever a CLI agent makes HTTP requests on behalf of MCP servers. If a server can tell the agent to fetch `http://169.254.169.254/latest/meta-data/` (the AWS metadata endpoint), or `http://localhost:9200/_cat/indices` (a local Elasticsearch instance), it can exfiltrate internal data.

The protection operates at two levels: the sandbox-level network policy and the plugin-level network sandbox.

### Sandbox Network Policy

The core sandbox uses a `NetworkPolicy` that defaults to blocking external network access:

```rust
pub struct NetworkPolicy {
    pub allow_network: bool,
    pub allowed_hosts: Vec<String>,
    pub blocked_ports: Vec<u16>,
    pub allow_loopback: bool,
    pub allow_dns: bool,
}

impl Default for NetworkPolicy {
    fn default() -> Self {
        Self {
            allow_network: false,
            allowed_hosts: Vec::new(),
            blocked_ports: vec![22, 25, 445, 3389],
            allow_loopback: true,
            allow_dns: true,
        }
    }
}
```

The blocked ports are security-sensitive: SSH (22), SMTP (25), SMB (445), and RDP (3389). Even when network access is allowed, these ports remain blocked to prevent lateral movement attacks.

Host validation distinguishes between loopback traffic and external traffic:

```rust
pub fn is_host_allowed(policy: &NetworkPolicy, host: &str) -> bool {
    if !policy.allow_network {
        if host == "127.0.0.1" || host == "localhost" || host == "::1" {
            return policy.allow_loopback;
        }
        return false;
    }
    // ... check allowed_hosts patterns ...
}
```

### Plugin Network Sandbox

Plugins (including MCP servers running as plugins) get a more granular `NetworkSandbox` that blocks specific IP addresses:

```rust
pub struct NetworkSandbox {
    allowed_urls: Vec<String>,
    allowed_hosts: Vec<String>,
    blocked_ips: Vec<IpAddr>,
    blocked_ports: HashSet<u16>,
    allow_all_https: bool,
    max_request_body: u64,   // 1MB default
    max_response_body: u64,  // 10MB default
    rate_limit: Option<(Duration, u32)>,  // 60 requests per 60 seconds
}

impl Default for NetworkSandbox {
    fn default() -> Self {
        Self {
            // ...
            blocked_ips: vec![
                "127.0.0.1".parse().unwrap(),
                "0.0.0.0".parse().unwrap(),
                "::1".parse().unwrap(),
            ],
            blocked_ports: HashSet::from([22, 23, 25, 445, 3389]),
            // ...
        }
    }
}
```

The default-blocked IPs prevent SSRF against loopback addresses. The rate limit (60 requests per 60 seconds) prevents a compromised or malicious MCP server from using the agent as an HTTP amplification tool.

URL validation follows a strict allow-then-block order:

```rust
pub fn check_url(&self, url: &str) -> Result<()> {
    // 1. Check explicit URL allowlist
    if self.allowed_urls.iter().any(|prefix| url.starts_with(prefix)) {
        return Ok(());
    }
    // 2. Check allow-all-HTTPS
    if self.allow_all_https && url.starts_with("https://") {
        return Ok(());
    }
    // 3. Check host pattern allowlist
    if let Some(host) = extract_host(url) {
        if self.allowed_hosts.iter().any(|p| host_matches_pattern(&host, p)) {
            return Ok(());
        }
    }
    // 4. Deny by default
    bail!("URL '{}' is not allowed by network sandbox policy", url)
}
```

The default-deny posture means that a newly added MCP server has no network access until its URLs or hosts are explicitly allowed. This is the principle of least privilege applied to network connectivity.

---

## 31.9 Channel Permission Enforcement

Even after a server is authenticated and connected, not every tool it offers should be available to every caller. Channel permissions provide fine-grained control over which tools can be invoked on which servers.

### The Permission Model

Each permission rule specifies a server pattern, allowed tools, denied tools, read-only mode, and a priority:

```rust
pub struct ChannelPermission {
    pub server_id: String,      // Exact match or glob
    pub channel_id: String,     // Usually "*"
    pub allowed_tools: Vec<String>,
    pub denied_tools: Vec<String>,
    pub read_only: bool,
    pub priority: i32,
}
```

### Evaluation Logic

Rules are evaluated in priority order (highest first). Deny takes precedence over allow within a single rule:

```rust
pub fn check_channel_permission(
    perms: &[ChannelPermission],
    server_id: &str,
    tool: &str,
) -> bool {
    let mut sorted: Vec<&ChannelPermission> = perms.iter().collect();
    sorted.sort_by(|a, b| b.priority.cmp(&a.priority));

    for perm in sorted {
        if !matches_pattern(&perm.server_id, server_id) { continue; }

        // Check denied first
        for denied in &perm.denied_tools {
            if matches_pattern(denied, tool) { return false; }
        }

        // Check read-only mode
        if perm.read_only {
            let explicitly_allowed = perm.allowed_tools
                .iter().any(|a| matches_pattern(a, tool));
            if !explicitly_allowed { return false; }
        }

        // Check allowed tools
        if !perm.allowed_tools.is_empty() {
            if perm.allowed_tools.iter().any(|a| matches_pattern(a, tool)) {
                return true;
            }
            continue; // Has allowlist but tool not in it
        }

        return true; // Rule matches, no allowlist restriction
    }

    false // Default deny
}
```

The default is `false` -- no permission unless explicitly granted. This means a new server must be allowlisted before its tools can be invoked, even if the server is authenticated.

### Glob Pattern Support

Both server IDs and tool names support glob patterns:

```rust
fn matches_pattern(pattern: &str, value: &str) -> bool {
    if pattern == "*" || pattern == value { return true; }
    Pattern::new(pattern)
        .map(|p| p.matches(value))
        .unwrap_or(false)
}
```

This enables rules like:

- `server_id: "github-*"` matches `github-mcp-server` and `github-enterprise-server`
- `allowed_tools: ["search_*"]` matches `search_code`, `search_issues`, `search_commits`
- `denied_tools: ["delete_*"]` blocks all destructive tools regardless of name

### Configuration Merging

Channel permissions from multiple sources (user config, project config, enterprise policy) are merged with overlay semantics:

```rust
pub fn merge_channel_permissions(
    base: &[ChannelPermission],
    overlay: &[ChannelPermission],
) -> Vec<ChannelPermission> {
    let overlay_keys: HashSet<(String, String)> = overlay.iter()
        .map(|p| (p.server_id.clone(), p.channel_id.clone()))
        .collect();

    let mut result: Vec<ChannelPermission> = Vec::new();

    // Base rules not overridden by overlay
    for base_perm in base {
        let key = (base_perm.server_id.clone(), base_perm.channel_id.clone());
        if !overlay_keys.contains(&key) {
            result.push(base_perm.clone());
        }
    }

    // All overlay rules
    for overlay_perm in overlay {
        result.push(overlay_perm.clone());
    }

    result.sort_by(|a, b| b.priority.cmp(&a.priority));
    result
}
```

The overlay completely replaces any base rule with the same `(server_id, channel_id)` key. This prevents surprising interactions where a base rule partially applies alongside an overlay rule.

---

## 31.10 Elicitation: Server-Initiated User Prompts

MCP servers sometimes need information they cannot get from the tool call itself. An environment selection, a confirmation before a destructive operation, a password for a downstream system. The elicitation system provides a structured, schema-validated way for servers to request user input.

### The Request Format

```rust
pub struct ElicitationRequest {
    pub id: String,
    pub server_id: String,
    pub title: String,
    pub message: String,
    pub schema: ElicitationSchema,
    pub timeout_ms: Option<u64>,
    pub default_value: Option<Value>,
}

pub struct ElicitationSchema {
    pub field_type: ElicitationFieldType,
    pub required: bool,
    pub options: Option<Vec<String>>,
    pub min_length: Option<usize>,
    pub max_length: Option<usize>,
    pub pattern: Option<String>,
}

pub enum ElicitationFieldType {
    Text,
    Number,
    Boolean,
    Choice,
    MultiChoice,
    Password,
}
```

The schema is declarative -- the server says "I need a choice from [dev, staging, production]" rather than "show the user a dropdown." This separation of intent from presentation allows the CLI to render the prompt appropriately for its terminal context, and prevents the server from injecting arbitrary UI elements.

### Response Validation

Every response is validated against the schema before being sent back to the server:

```rust
pub fn validate_response(response: &Value, schema: &ElicitationSchema) -> ValidationResult {
    let mut errors = Vec::new();

    if schema.required && (response.is_null() || response == &json!("")) {
        errors.push("Response is required but was empty or null.".to_string());
        return ValidationResult { valid: false, errors };
    }

    match schema.field_type {
        ElicitationFieldType::Text | ElicitationFieldType::Password => {
            if let Some(s) = response.as_str() {
                if let Some(min) = schema.min_length {
                    if s.len() < min {
                        errors.push(format!(
                            "Response too short: minimum {} characters, got {}",
                            min, s.len()
                        ));
                    }
                }
                // ... max_length, pattern checks ...
            }
        }
        ElicitationFieldType::Choice => {
            if let (Some(s), Some(opts)) = (response.as_str(), &schema.options) {
                if !opts.iter().any(|o| o == s) {
                    errors.push(format!("Invalid choice '{}'. Options: {}", s, opts.join(", ")));
                }
            }
        }
        // ... Number, Boolean, MultiChoice ...
    }

    ValidationResult { valid: errors.is_empty(), errors }
}
```

Validation at the client prevents malformed data from reaching the server. This is defense in depth -- the server should validate too, but the client catches obvious errors before the round-trip.

### Timeout Handling

If the user does not respond within the timeout period, the request falls back to its default value:

```rust
pub fn create_timeout_response(req: &ElicitationRequest) -> ElicitationResponse {
    ElicitationResponse {
        request_id: req.id.clone(),
        value: req.default_value.clone().unwrap_or(Value::Null),
        timed_out: true,
    }
}
```

The `timed_out: true` flag tells the server that the response was automatic, allowing it to log the event or take a more conservative action than it would with an explicit user choice.

### Security Implications of Elicitation

Elicitation is a controlled communication channel between a server and the user. Without it, a server that needs user input might resort to unsafe alternatives: injecting prompts into tool results that trick the AI into asking on its behalf, or writing to a temp file and asking the user to check it. The elicitation system provides a first-class, auditable, schema-validated alternative.

The `Password` field type is particularly important. When the field type is `Password`, the terminal renders input with masking (dots or asterisks) and the value is never logged. Without this type, a server requesting credentials would receive them through a `Text` field that might appear in logs, history, or screen recordings.

---

## 31.11 The McpAuthenticator: Putting It All Together

The `McpAuthenticator` is the orchestrator that ties the state machine, auth methods, token storage, and refresh logic into a single interface per MCP server connection:

```rust
pub struct McpAuthenticator {
    server_name: String,
    method: AuthMethod,
    state: Arc<RwLock<AuthState>>,
    token_store: Arc<RwLock<TokenStore>>,
    refresh_retries: Arc<std::sync::atomic::AtomicU32>,
}
```

The `Arc<RwLock<TokenStore>>` is shared across all authenticators, meaning a single token file serves all MCP server connections. This is intentional -- it allows the token store to be loaded once at startup and saved atomically after any change, rather than having N separate files for N servers.

The `refresh_retries` counter is per-authenticator (per-server), not per-store. This allows one server's token refresh failures to be isolated from another's.

The `reset()` method provides a clean logout:

```rust
pub async fn reset(&self) {
    let mut state = self.state.write().await;
    *state = AuthState::Unauthorized;
    self.refresh_retries.store(0, std::sync::atomic::Ordering::Relaxed);

    let mut store = self.token_store.write().await;
    store.remove(&self.server_name);
    let _ = store.save();
}
```

This is the only transition that goes directly from any state to `Unauthorized`. It clears the token from storage and resets the retry counter, ensuring a fresh start.

---

## 31.12 Security Architecture Summary

The MCP auth and security system implements defense in depth through five layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: Channel Permissions                                │
│  Per-server, per-tool allowlists and denylists               │
│  Glob patterns, priority ordering, default-deny              │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Elicitation Validation                             │
│  Schema-validated user input, Password field type            │
│  Timeout defaults, never log sensitive fields                │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: SSRF Protection                                    │
│  Blocked IPs (loopback, link-local), blocked ports           │
│  URL allowlisting, rate limiting, body size limits           │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Token Management                                   │
│  60s expiry buffer, 3-retry refresh, persistent store        │
│  Scoped tokens, automatic refresh, clean logout              │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Authentication                                     │
│  OAuth2 + PKCE (default-on), client credentials, API keys   │
│  State machine prevents out-of-order operations              │
│  CSRF protection via state parameter                         │
└─────────────────────────────────────────────────────────────┘
```

Each layer operates independently. A server can pass authentication (Layer 1) but be blocked by channel permissions (Layer 5). A server can be allowlisted (Layer 5) but fail because its SSRF attempt is blocked (Layer 3). This independence means that a vulnerability in one layer does not compromise the entire stack.

### Key Security Defaults

| Default | Why |
|---------|-----|
| PKCE enabled by default | Public clients cannot protect client secrets |
| Channel permissions default-deny | New servers must be explicitly allowed |
| Network access default-deny | Plugins start with no external network |
| Token refresh capped at 3 retries | Prevents infinite loops on revoked tokens |
| 60s expiry buffer | Prevents in-flight requests from failing |
| Loopback IPs blocked for plugins | Prevents SSRF against local services |
| Sensitive ports always blocked | SSH, SMTP, SMB, RDP blocked even with network access |

These defaults follow the principle of least privilege: everything is denied unless explicitly allowed, and the most secure option is always the default.

---

## 31.13 Testing Auth Security

The auth module includes 25 unit tests that validate the security properties. Three are particularly instructive:

**PKCE known-vector test:**

```rust
#[test]
fn test_pkce_s256_known_vector() {
    let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    let pkce = PkceChallenge::from_verifier(verifier);
    assert_eq!(
        pkce.code_challenge,
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
}
```

This test uses the known test vector from RFC 7636 Appendix B. If the S256 implementation produces a different challenge for this specific verifier, the implementation is wrong and no authorization server will accept our PKCE proofs. This is a compliance test, not a behavior test.

**Deny-overrides-allow test:**

```rust
#[test]
fn test_check_permission_deny_overrides_allow() {
    let perms = vec![make_perm("srv", &["delete_all"], &["delete_all"])];
    assert!(!check_channel_permission(&perms, "srv", "delete_all"));
}
```

When a tool appears in both the allow and deny lists of the same rule, deny wins. This is a critical security invariant -- if an administrator blocks a tool, adding it to the allowlist should not override the block.

**Expiry buffer test:**

```rust
#[test]
fn test_token_data_expiry_check() {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let expired = TokenData {
        access_token: "x".into(),
        expires_in: Some(10), // Expires in 10s, but buffer is 60s
        obtained_at: now,
        // ...
    };
    assert!(expired.is_expired()); // 10 < 60 buffer
}
```

A token with a 10-second lifetime is considered expired at the moment of creation because it falls within the 60-second buffer. This ensures the refresh mechanism triggers proactively rather than reactively.

---

## 31.14 Practical Considerations

### Storing Tokens Safely

The token store writes to a JSON file in the user's config directory. On macOS and Linux, this file should be readable only by the owning user (`chmod 600`). The current implementation does not set file permissions explicitly -- this is an area where production deployments should add OS-level protection, or better yet, integrate with the system keychain (macOS Keychain, Linux Secret Service, Windows Credential Manager).

### Handling Token Revocation

If an authorization server revokes a refresh token (e.g., the user deauthorized the app from their GitHub settings), the refresh attempts will fail with a 400 or 401 error. The 3-retry limit ensures this does not loop forever, but the error message should guide the user to re-authorize rather than presenting a cryptic HTTP error. The current implementation logs the server's error response body, which typically contains a human-readable reason like `"invalid_grant"`.

### Multi-User Environments

The token store is per-user (stored in the user's home directory). On shared machines, each user has their own token file. Tokens are not shared between users, and the file permissions should prevent cross-user access. In enterprise environments with centralized identity providers, the recommended approach is to use short-lived tokens (minutes, not hours) and rely on the refresh mechanism rather than long-lived tokens that persist on disk.

### Debugging Auth Failures

When authentication fails, the error chain provides layered diagnostics:

1. **Auth state**: What state was the authenticator in when the failure occurred?
2. **HTTP status**: What did the token endpoint return? (401 = bad credentials, 400 = bad request, 403 = scope insufficient)
3. **Response body**: What reason did the server give? (`invalid_grant`, `expired_token`, `invalid_scope`)
4. **Retry count**: How many refresh attempts were made before giving up?

The tracing instrumentation (`info!`, `warn!`, `debug!`) at each state transition provides a complete audit trail when debug logging is enabled.

---

## Summary

MCP authentication and security is a system of interlocking defenses. The auth state machine prevents out-of-order operations. OAuth2 with PKCE protects against code interception. Token storage with automatic refresh keeps connections alive. SSRF protection blocks lateral movement. Channel permissions enforce least-privilege tool access. And the elicitation system provides a safe channel for server-initiated user interaction.

The common thread is defense in depth with secure defaults. PKCE is on by default. Network access is off by default. Channel permissions deny by default. Every layer assumes the others might fail and provides its own protection. This is not paranoia -- it is engineering for the real world where MCP servers come from third parties, run untrusted code, and operate in environments with sensitive data.

As we will see in Chapter 32, these security foundations enable the tool integration layer to safely expose MCP server capabilities to the AI agent, knowing that every tool call passes through authentication, authorization, and network boundary checks before reaching the server.
