# Chapter 14: Identity, IAM & Non-Human Identities (NHI) for Agents

Every control in this book eventually reduces to a single question the runtime must answer before a tool executes: *on whose authority?* For human-facing systems we answered it with sessions, OAuth, and RBAC. Agents break the answer three ways at once. The actor is **non-human** — no person to phish an MFA prompt, no browser to hold a cookie, no natural session lifetime. The actor is **delegated** — the agent acts *for* a user, *as* a workload, *against* a resource, and all three authorities must be legible in one request. And the actor is **dynamic and ephemeral** — agents spin up per task, spawn sub-agents, and should hold authority for seconds, not months.

The industry's reflex — mint a long-lived API key, drop it in an environment variable, grant broad scopes — is precisely wrong for this actor. Long-lived keys are unattributable, unrotatable in practice, over-scoped by default, and invisible to inventory. When an agent is compromised by the injection attacks of the previous chapter, a static key is a skeleton key: it survives revocation, works from anywhere, and names no one.

This chapter builds the identity substrate that makes least privilege and revocation *possible* for agents: **Non-Human Identity (NHI)** as a lifecycle, cryptographic attestation with **SPIFFE/SPIRE**, and a hard separation of **user authority, agent authority, and system execution authority**. We then walk the protocols that carry those authorities — OAuth 2.1 with PKCE and **Resource Indicators (RFC 8707)**, **RFC 8693 token exchange** for delegation chains that monotonically narrow scope, and the interim patterns enterprises ship today. We build fine-grained access control with **OPA/Rego**, **Cedar**, and **OpenFGA**, make it context- and trajectory-aware, and finish with the secrets and revocation machinery — including the **never-materialize-in-context** pattern where the agent holds a handle and the gateway holds the secret.

---

## 14.1 Agent Identity Frameworks

### 14.1.1 Designing Non-Human Identities (NHI) for Autonomous Software Agents

A **Non-Human Identity (NHI)** is the security principal for a workload — a service, a job, or an agent — as distinct from a human identity. Enterprises already drown in NHIs (service accounts, API keys, certificates), and NHIs now outnumber human identities by more than an order of magnitude in typical cloud estates. Agents make this worse: they are numerous, short-lived, and recursively spawned. Designing NHI for agents means treating identity as a **lifecycle**, not a credential.

The lifecycle has five phases, and each maps to a concrete control:

| Phase | What happens | Control requirement | Failure if skipped |
| :--- | :--- | :--- | :--- |
| **Issue** | Identity created for an agent instance/class | Bound to an owner, purpose, and expiry at creation | Orphaned, unattributable identities |
| **Attest** | Identity proves it is what it claims | Cryptographic node + workload attestation | Impersonation; stolen creds reused elsewhere |
| **Rotate** | Credential material replaced routinely | Automated, short TTL, zero-downtime | Long-lived secrets accumulate blast radius |
| **Revoke** | Authority withdrawn immediately | Real-time termination + propagation | Compromised agent keeps acting |
| **Retire** | Identity decommissioned, records kept | Inventory update, audit retention | Ghost identities linger for years |

The reason **long-lived API keys fail** for agents is structural. A static key is a **bearer token with no provenance**: possession equals authority, it names the *key* not the *actor*, it cannot be tied to a specific task or trajectory, and revoking it breaks every workload that shares it — so nobody revokes it. It is also invisible: a key in an env var, a CI secret, and a notebook are three copies with no inventory linking them. Agents amplify every failure because they run everywhere and clone themselves.

The design principles that follow:

1. **Every agent instance gets a distinct, attestable identity** — not a shared service account. Attribution requires uniqueness.
2. **Identities are short-lived by construction** — a minutes-scale SVID or token re-minted from a non-exportable root of trust (14.1.2), never a static key on disk.
3. **Ownership is mandatory metadata.** Every NHI has an owner, a declared purpose, and an expiry. An NHI with no owner is a finding.
4. **Inventory is continuous.** The issue/attest/rotate/revoke/retire events must flow to an inventory system as the source of truth.

The rest of this chapter assumes this substrate: wherever a later section says "the agent presents its identity," it means a freshly-minted, attested, short-lived credential tied to a specific owner and purpose — never a static key.

### 14.1.2 Cryptographic Identity Attestation: SPIFFE/SPIRE and Workload Identity Federation

**Attestation** answers "how do I know this workload is who it claims to be" without a shared secret. **SPIFFE** (Secure Production Identity Framework For Everyone) defines the identity format; **SPIRE** is its reference runtime. A **SPIFFE ID** is a URI: `spiffe://<trust-domain>/<workload-path>`. It is delivered as an **SVID** (SPIFFE Verifiable Identity Document) in one of two formats: an **X.509-SVID** (a short-lived certificate with the SPIFFE ID in the URI SAN) for mTLS, or a **JWT-SVID** (a signed JWT with the SPIFFE ID as `sub`) for request-level auth to APIs that speak bearer tokens.

SPIRE issues SVIDs only after **two-layer attestation**:

- **Node attestation** proves the machine/VM/pod the agent runs on is legitimate — via a cloud instance-identity document (AWS/GCP/Azure), a Kubernetes projected service-account token, or a TPM. The SPIRE Agent on that node earns a node identity.
- **Workload attestation** proves the specific process asking for an SVID matches a registered selector — Unix UID/GID/path, or `k8s:ns`, `k8s:sa`, container image digest. Only a process matching the selectors receives the SVID. Crucially, the workload never holds a bootstrap secret: identity is derived from *what it is and where it runs*, not from something it can leak.

```
   +----------------------------------------------------------+
   |                 TRUST DOMAIN: spiffe://corp.example       |
   |                                                          |
   |   +----------------+        node attestation             |
   |   |  SPIRE Server  |<--------(aws_iid / k8s_psat)--+     |
   |   | (signs SVIDs)  |                               |     |
   |   +-------+--------+                               |     |
   |           | issues node SVID                       |     |
   |           v                                        |     |
   |   +----------------+   workload attestation   +----+---+ |
   |   |  SPIRE Agent   |<--(uid/path/k8s selector)| Agent  | |
   |   | (node-local)   |---- X.509 / JWT SVID ---->|Workload| |
   |   +----------------+                          +--------+ |
   +----------------------------------------------------------+
             |  federation (JWKS bundle exchange)
             v
   +----------------------------------------------------------+
   |            TRUST DOMAIN: spiffe://partner.example         |
   +----------------------------------------------------------+
```

A workable **SPIFFE ID scheme for agents** encodes tenant, agent class, and instance so that policy and audit can key off structure:

```
spiffe://corp.example/agent/<tenant>/<agent-class>/<instance-id>
# examples
spiffe://corp.example/agent/acme/invoice-triage/7f3c...   # a worker instance
spiffe://corp.example/agent/acme/invoice-triage           # the class (for policy)
spiffe://corp.example/tool-broker/payments                # a downstream service
```

A **SPIRE registration entry** ties that ID to attestation selectors — this is what a platform team actually writes:

```bash
spire-server entry create \
  -spiffeID    spiffe://corp.example/agent/acme/invoice-triage \
  -parentID    spiffe://corp.example/spire/agent/k8s_psat/prod-cluster/node-xyz \
  -selector    k8s:ns:agents \
  -selector    k8s:sa:invoice-triage \
  -selector    k8s:container-image:registry.corp/invoice-triage@sha256:9b2e... \
  -dns         invoice-triage.agents.svc \
  -x509SVIDTTL 300        # 5-minute cert; SPIRE auto-rotates before expiry
```

**Workload identity federation** extends this across trust domains: two SPIRE deployments (or SPIFFE and a cloud IdP) exchange signed JWKS **bundles**, so an agent in `spiffe://corp.example` can present an SVID that a service in `spiffe://partner.example` verifies without any shared static credential — the substrate for cross-org A2A (see Ch. 15.3.4) and for exchanging an SVID for a cloud/SaaS token (14.2.2). The honest failure mode: SPIFFE proves *identity*, not *authorization* — a valid SVID says "this is invoice-triage instance 7f3c," nothing about what it may do. Selectors are only as strong as the node-attestation root; a compromised node or an over-broad selector (`k8s:ns:agents` alone) lets the wrong workload earn an identity.

### 14.1.3 Differentiating User Authority, Agent Authority, and System Execution Authority

The single most common agent-IAM design error is collapsing three distinct authorities into one credential. A request from an agent carries **three separate authorities**, and secure design keeps them separate and legible end to end:

- **User authority** — what the human principal is permitted to do. Derived from the user's own grant (an OAuth authorization with delegated scopes). Bounds the *ceiling*: an agent can never exceed what its user could do.
- **Agent authority** — what *this agent* is permitted to do, independent of any user. Derived from the agent's NHI (its SVID/service identity). A finance-reconciliation agent may be forbidden from sending email even when acting for a user who can.
- **System execution authority** — what the *underlying execution context* (the runtime, the service account the tool call runs as) is permitted to do against the target system. The database credential, the cloud role. Often the broadest, and the one most dangerous to conflate with the others.

The effective permission for any action is the **intersection** of the three, never the union:

$$\text{Permit} \iff a \in (\text{Auth}_{\text{user}} \cap \text{Auth}_{\text{agent}} \cap \text{Auth}_{\text{system}})$$

```
   REQUEST TO EXECUTE tool=payments.transfer amount=500
   +----------------------------------------------------------+
   | User authority   : may_transfer <= 1000  (delegated)     |
   | Agent authority  : payments.read + payments.transfer_low |
   | System authority : payments-svc role = transfer, refund  |
   +----------------------------------------------------------+
             |            |            |
             v            v            v
        [ intersection: transfer allowed iff all three permit ]
             |
             v
        amount 500 <= 1000  AND  transfer_low(<=500) AND  role=transfer  => PERMIT
        amount 800          -> user ok, agent transfer_low fails         => DENY
```

Representing all three in **one request** is the practical challenge. The pattern that works: carry the user authority as a delegated access token (audience-restricted to the target resource, 14.2.1), carry the agent authority as the agent's SVID/JWT at the transport or a dedicated header, and let the target enforce its own execution authority natively. A token-exchange step (14.2.2) then *combines* user + agent authority into a downstream token whose scope is the **intersection**, narrowed for the task. The failure mode to design against is the **confused deputy** (see Ch. 13.2.1): if the system executes with its own broad authority while ignoring the user/agent ceiling, an injected instruction rides the system credential to do things neither the user nor the agent was allowed to do.

---

## 14.2 Authorization Protocols for Agentic Flows

### 14.2.1 OAuth 2.1 Patterns for Agents: PKCE, Resource Indicators, and Audience Restriction

**OAuth 2.1** consolidates a decade of OAuth 2.0 hardening into a baseline: the implicit and password grants are gone, **PKCE** is mandatory for all authorization-code flows, and redirect URIs must match exactly. For agents, three properties matter most: proof-of-possession of the code, precise audience restriction, and least-scope tokens.

**PKCE** (Proof Key for Code Exchange) stops authorization-code interception. The client generates a random `code_verifier`, sends its SHA-256 hash as `code_challenge` on the authorization request, and presents the raw verifier on the token request. An attacker who steals the code cannot redeem it without the verifier. For agents — which frequently run headless and complete flows programmatically — PKCE is non-negotiable because there is no human to notice a hijacked redirect.

**Resource Indicators (RFC 8707)** make agent tokens safe to hand around. The client adds a `resource` parameter naming the exact API the token is for; the authorization server mints a token whose `aud` is bound to that resource. This defeats **token redirection**: a token minted for `https://mail.api.corp` is rejected by `https://payments.api.corp`. Without audience restriction, an agent holding a broadly-scoped token becomes a confused deputy — any downstream server it talks to (including a malicious MCP server, see Ch. 15.3.1) can replay that token elsewhere.

```http
GET /authorize?response_type=code
  &client_id=agent-invoice-triage
  &code_challenge=E9Melhoa2Ow...&code_challenge_method=S256
  &resource=https://payments.api.corp        # RFC 8707: bind the audience
  &scope=payments:transfer_low
  &redirect_uri=https://agent.corp/cb HTTP/1.1
```

```json
// Resulting access token claims (decoded): audience- and scope-restricted
{
  "iss": "https://idp.corp",
  "sub": "spiffe://corp.example/agent/acme/invoice-triage/7f3c",
  "aud": "https://payments.api.corp",
  "scope": "payments:transfer_low",
  "exp": 1735689600,
  "act": { "sub": "user:sofia@corp" }   // acting-party: preserves user authority
}
```

The MCP authorization spec builds directly on this stack: MCP servers are OAuth 2.1 **protected resources** that publish **Protected Resource Metadata**, require **Resource Indicators** so tokens are audience-bound to a specific server, and support **Dynamic Client Registration** so agents can enroll without manual client provisioning. The honest limit: audience restriction narrows *where* a token works, not *what the holder does with it* while valid — short TTLs and the FGAC of 14.3 still carry the weight for authorization, and PKCE protects the code, not a leaked access token.

### 14.2.2 Token Exchange (RFC 8693), On-Behalf-Of Flows, and Delegation Chains

Agents rarely act alone. An orchestrator calls a tool that calls a sub-agent that calls an external API. Each hop must carry authority forward while **monotonically narrowing scope** — never widening it. **RFC 8693 Token Exchange** is the standard mechanism: a client presents a `subject_token` (whom we act for) and optionally an `actor_token` (who is acting), and the authorization server returns a new token scoped for the next hop.

Two flows are distinguished by the `act`/`may_act` claim structure:

- **Delegation (on-behalf-of):** the new token names both the subject (user) and the actor (agent) via the nested `act` claim. The downstream resource sees *"agent X acting on behalf of user Y."* This preserves user authority (14.1.3) through the chain.
- **Impersonation:** the new token names only the subject; the actor is erased. Enterprises should prefer delegation and avoid impersonation for agents precisely because impersonation destroys attribution.

The invariant that makes delegation chains safe is **monotonic scope narrowing**: $\text{scope}(T_{n+1}) \subseteq \text{scope}(T_n)$ and $\text{aud}(T_{n+1})$ is more specific than $\text{aud}(T_n)$. A token-exchange endpoint that ever *grants* a scope the input token lacked is a privilege-escalation bug.

```python
import time

class ScopeError(Exception): ...

def exchange_token(subject_token: dict, actor_id: str,
                   requested_scope: set[str], target_resource: str,
                   task_ttl_s: int = 120) -> dict:
    """RFC 8693-style delegation exchange with monotonic scope narrowing."""
    parent_scope = set(subject_token["scope"].split())
    # INVARIANT: never widen scope. Requested must be a subset of parent.
    if not requested_scope <= parent_scope:
        raise ScopeError(f"escalation: {requested_scope - parent_scope}")
    return {
        "sub": subject_token["sub"],                 # user authority preserved
        "aud": target_resource,                      # RFC 8707 audience binding
        "scope": " ".join(sorted(requested_scope)),  # narrowed
        "exp": int(time.time()) + task_ttl_s,        # short-lived, per task
        "act": {                                     # delegation, not impersonation
            "sub": actor_id,                         # agent SVID acting
            "act": subject_token.get("act"),         # chain the prior actor
        },
    }
```

The resulting **delegation chain** is auditable end to end: each token's `act` nests the previous actor, so an investigator can reconstruct *user → orchestrator → sub-agent → tool* from the final token alone. The failure modes to guard: an exchange endpoint that doesn't enforce the subset check (escalation), TTLs long enough to outlive the task (replay window), and lost `act` nesting (attribution gap). Bind each exchanged token to a specific `aud` and a task-scoped TTL.

### 14.2.3 Emerging Agentic Auth Drafts and Enterprise Interim Patterns

The standards bodies are actively drafting agent-specific authorization, but none are ratified, and a Principal engineer must ship on what exists today while tracking what's coming. On the emerging side: the **IETF OAuth working group** is exploring identity-and-authorization drafts for AI agents (delegation semantics, agent-specific token constraints); **A2A** defines **Agent Cards** that advertise an agent's identity, capabilities, and required auth schemes, effectively a discovery-time authorization contract; work under **AGNTCY** and related efforts targets cross-vendor agent identity and trust. MCP's authorization spec (OAuth 2.1 + RFC 8707 + Protected Resource Metadata + DCR) is the most mature and is a de facto interim standard. Treat all of these as moving targets: design your identity layer so the *token format* is swappable behind a broker.

Because the drafts aren't final, enterprises converge on three **pragmatic interim patterns**, all of which avoid handing agents durable credentials:

| Interim pattern | How it works | What it buys | Honest limit |
| :--- | :--- | :--- | :--- |
| **Broker-mediated credential exchange** | A central broker holds the real credentials; agents authenticate with their SVID and receive a short-lived, scoped, audience-bound token per call | Secrets never reach the agent; central revocation and audit | Broker is a high-value single point; must be HA and itself least-privilege |
| **Per-task token minting** | At task start, mint a token scoped to exactly that task's tools/resources with a task-length TTL | Blast radius bounded to one task; natural expiry | Requires accurate up-front task scoping; over-scoping re-creates the problem |
| **Scoped service identities** | Distinct NHI per agent *class* (not shared), each with a minimal native role, exchanged down per task | Native platform enforcement + attribution | Class-level identity is coarser than per-instance; still needs narrowing |

```
   +---------+   SVID    +-----------------+   real cred (never leaves)   +--------+
   |  Agent  |---------->| CREDENTIAL      |----------------------------->| Vault  |
   |         |<----------| BROKER          |<-----------------------------|        |
   +---------+  scoped,  | - verifies SVID |   short-lived token           +--------+
     holds a   short-TTL | - mints per-task|
     HANDLE    token     | - audience-bind |
     only      (aud+ttl) +-----------------+
```

The unifying principle across every interim pattern is the one 14.4.1 formalizes: **the agent gets a handle, not a secret.** Whether the standards settle on IETF agent drafts, A2A Agent Cards, or something newer, an enterprise that routes all agent credentials through a broker minting per-task, audience-bound, short-lived tokens can adopt the eventual standard by changing the broker's output format — without re-plumbing every agent. The failure mode of *not* doing this: agents accumulate long-lived credentials while "waiting for the standard," and those credentials become the breach.

---

## 14.3 Fine-Grained Access Control (FGAC) for Tools & Data

### 14.3.1 ABAC/ReBAC and Policy-as-Code (OPA/Rego, Cedar, OpenFGA) for Tool Invocation

Authentication (14.1–14.2) proves *who*; **FGAC** decides *whether this actor may perform this action on this resource in this context*. RBAC's coarse roles cannot express agent authorization because the deciding factors are attributes and relationships, not static roles. Two models dominate:

- **ABAC** (Attribute-Based Access Control): decisions are a function of attributes of the subject, action, resource, and environment. Expressed as policy-as-code in **OPA/Rego** or **AWS Cedar**.
- **ReBAC** (Relationship-Based Access Control): decisions follow a graph of relationships (`user → owner → document`), the Google-Zanzibar model implemented by **OpenFGA**. Ideal for "can this agent, acting for this user, read this specific record" questions.

A real **Rego policy** for tool invocation, evaluating agent + user + context attributes:

```rego
package agent.tools

import future.keywords.if
import future.keywords.in

default allow := false

# Allow a tool call only if the agent class is entitled, the action is within
# the user's delegated ceiling, and environmental constraints hold.
allow if {
    input.agent.class in data.entitlements[input.tool.name].agent_classes
    input.tool.action in input.user.delegated_scopes
    within_amount_cap
    business_hours
}

within_amount_cap if {
    input.tool.name != "payments.transfer"
}
within_amount_cap if {
    input.tool.name == "payments.transfer"
    input.tool.args.amount <= data.caps[input.user.tier]
}

business_hours if {
    input.env.hour >= 6
    input.env.hour < 22
}
```

The equivalent context-aware authorization in **Cedar**, whose typed schema and explicit `when`/`unless` make intent auditable:

```
// Cedar: context-aware tool authorization
permit(
    principal in AgentClass::"invoice-triage",
    action == Action::"payments.transfer",
    resource in Account::"corp-ap"
)
when {
    context.amount <= 500 &&
    context.user_delegated.contains("payments:transfer_low") &&
    context.mfa_recent == true
}
unless {
    context.payee_new == true    // new payees require step-up, never auto-allow
};
```

For relationship questions, an **OpenFGA** authorization model expresses "an agent may read a document if it acts for a user who owns or was shared the document":

```
model
  schema 1.1
type user
type agent
  relations
    define acts_for: [user]
type document
  relations
    define owner: [user]
    define shared: [user]
    define can_read: owner or shared or acts_for from owner
```

Deploy these as a **Policy Decision Point** the gateway (Ch. 15) calls before every tool execution. The trade-off: Rego is maximally expressive but untyped and easy to get subtly wrong; Cedar is typed and analyzable (you can prove properties about policies) but less flexible; OpenFGA excels at relationship graphs but is not a general ABAC engine. Real deployments combine them — OpenFGA for the relationship check, Cedar/Rego for attribute and context rules — and the honest limit is that policy is only as good as the attributes fed to it: spoofable `context` (14.3.2) yields confidently-wrong decisions.

### 14.3.2 Context-Aware Authorization: Evaluating Intent and Trajectory Before Granting Access

Static attributes are not enough for agents because the *same* tool call can be benign or malicious depending on **how the agent arrived at it**. Reading a customer record is fine mid-support-ticket and alarming immediately after the agent ingested an untrusted web page. **Context-aware authorization** extends the PDP with two agent-specific inputs: the **declared intent** (the plan the agent stated it would follow) and the **trajectory** (the actual sequence of steps and, critically, the *provenance* of the data that motivated this action).

The controls that make trajectory legible to policy:

1. **Intent binding.** Before execution, the agent commits a plan (`intent`) — e.g., "reconcile invoices, no outbound email." The PDP rejects tool calls that fall outside the committed intent. This is the authorization-layer complement to the runtime intent verification in Ch. 15.2.1.
2. **Taint/provenance tracking.** Tag every datum entering context with its trust origin (system, user, tool-output, *untrusted-web*). A tool call whose arguments are **taint-propagated** from untrusted content is treated as untrusted, regardless of how confident the model sounds. This is the CaMeL/IFC pattern (see Ch. 8.2).
3. **Trajectory anomaly.** Compare the current step against the expected shape of the task: sudden pivots to sensitive resources, out-of-order privileged calls, or a spike in step count are downgrades to authorization.

```python
from dataclasses import dataclass, field

@dataclass
class RequestContext:
    agent_id: str
    committed_intent: set[str]        # tool names the plan declared
    arg_taint: str                    # "trusted" | "user" | "untrusted_web"
    steps_so_far: int
    touched_sensitive: bool

def authorize(tool: str, ctx: RequestContext, base_allow: bool) -> str:
    if not base_allow:
        return "DENY"                                 # FGAC (14.3.1) said no
    if tool not in ctx.committed_intent:
        return "DENY"                                 # outside declared plan
    if ctx.arg_taint == "untrusted_web" and _is_sensitive(tool):
        return "STEP_UP"                              # tainted -> human confirm
    if ctx.steps_so_far > 50 or ctx.touched_sensitive:
        return "STEP_UP"                              # trajectory anomaly
    return "ALLOW"

def _is_sensitive(tool: str) -> bool:
    return tool.split(".")[0] in {"payments", "email", "admin", "identity"}
```

The honest failure mode: intent binding depends on the agent's *declared* plan, which a clever injection can also shape ("my plan includes emailing the summary"), and taint tracking has gaps wherever provenance is lost (summarization, tool boundaries that strip tags). Context-aware authorization raises attack cost and catches the unsophisticated majority; it is a layer, not a proof. Combine it with the deterministic irreversibility gate of Ch. 13.3.3 so an authorization bypass still hits a non-model floor for irreversible actions.

### 14.3.3 Dynamic Credential Minting: Short-Lived Tokens vs. Static Service Account Keys

The final FGAC decision is *what credential the approved action actually runs with*. The static answer — a service-account key with standing permissions — is the root cause of most agent blast-radius incidents. The dynamic answer — **mint a short-lived, narrowly-scoped credential at the moment of use** — bounds exposure to the task window.

| Dimension | Static service-account key | Dynamic minted credential |
| :--- | :--- | :--- |
| Lifetime | Months–years (rarely rotated) | Seconds–minutes (per task/call) |
| Scope | Broad (superset "just in case") | Exact subset for this action |
| Attribution | To the key (shared) | To agent + user + task |
| Revocation | Breaks everything sharing it | Expires automatically; revoke one |
| Exposure if leaked | Total, durable | Trickle, self-healing |
| Inventory | Invisible copies | Issued/tracked by broker |

The trade-offs are real: dynamic minting adds a broker round-trip to the latency budget (Ch. 15.1.3), requires the minting infrastructure to be highly available (now in the critical path), and demands accurate scope derivation — mint too broadly and you have re-created the static key with extra steps. The rule: the credential that reaches the resource should be the *narrowest* thing that lets the approved action succeed, and it should die with the task.

---

## 14.4 Secrets, Delegation & Privilege Boundaries

### 14.4.1 Secrets Management: Vaults, Brokered Credentials, and Never-Materialize-in-Context Patterns

The defining secrets-management rule for agents is a direct consequence of Chapter 13: **anything in the model's context can be exfiltrated.** Trajectory logs, prompt caches, injected image beacons, and downstream sub-agents all see context. Therefore the correct pattern is **never-materialize-in-context**: the secret must never appear as a token in the model's window. The agent holds an opaque **handle**; a broker (or the gateway) holds the actual secret and uses it out-of-band.

```
   MODEL CONTEXT (exfiltratable)          BROKER / GATEWAY (trusted, out-of-band)
   +-----------------------------+        +-------------------------------------+
   | tool: http.call             |        |  resolve handle -> real credential  |
   | args: {                     |        |  vault://saas/prod/api_key          |
   |   url: "https://api...",    | -----> |  inject Authorization header here,  |
   |   auth: "cred://saas/prod"  |        |  make the call, strip secret from   |
   | }         ^ HANDLE ONLY     |        |  the response before returning      |
   +-----------------------------+        +-------------------------------------+
        secret never present                 secret lives only here, briefly
```

The mechanics: secrets live in a **vault** (HashiCorp Vault, cloud secrets managers) with dynamic-secret engines where possible (14.3.3). The agent is issued handles, not values. When a tool call needs a credential, the gateway resolves the handle, injects the secret at the transport boundary (e.g., sets the `Authorization` header on the outbound request), executes, and scrubs the secret from any response before it re-enters context. This composes with the interactive-session pattern of Ch. 13.1.3 — the GUI autofill broker is the same idea at the OS layer.

```python
class SecretBroker:
    def __init__(self, vault, allow: dict[str, set[str]]):
        self._vault = vault
        self._allow = allow                      # agent_class -> allowed handles

    def call_with_handle(self, agent_class: str, handle: str,
                         request: "HttpRequest") -> "HttpResponse":
        if handle not in self._allow.get(agent_class, set()):
            raise PermissionError(f"{agent_class} may not use {handle}")
        secret = self._vault.read(handle)        # resolved out-of-band
        request.headers["Authorization"] = f"Bearer {secret}"
        try:
            resp = request.send()
        finally:
            del secret                           # minimize in-memory lifetime
        return _scrub_secrets(resp)              # never return creds to context
```

The honest limits: the broker itself is a high-value target and must be least-privilege and audited; a compromised broker is catastrophic. And "never in context" cannot cover a credential the *task legitimately needs the model to reason about* (rare — e.g., debugging an auth flow) — those cases demand explicit, logged exceptions. The pattern reduces exposure from *every secret the agent touches* to *only secrets the broker mishandles*.

### 14.4.2 Least Privilege Tool Design: Scoping Tool Capabilities to Minimal Executable Subsets

Least privilege for agents is enforced primarily at **tool design time**, not just at the policy layer. A tool that exposes `execute_sql(query)` grants the agent the union of everything SQL can do; no runtime policy can fully re-bound it because the capability surface is the entire query language. The design principle: **scope each tool to the minimal executable subset** the task requires, so that even a fully-injected agent cannot express a dangerous action because the tool has no vocabulary for it.

Concretely:

1. **Prefer typed, purpose-built tools over general executors.** Replace `execute_sql` with `get_invoice_by_id(id: int)` and `list_open_invoices(vendor_id: int)`. The dangerous verbs simply don't exist in the interface.
2. **Constrain arguments at the schema, not the prompt.** Enums, ranges, and regexes on parameters (the Pydantic pattern from Ch. 1.2.2) are enforced deterministically; a prompt instruction is not.
3. **Split read and write, and split by sensitivity.** A single tool that both reads and mutates cannot be granted read-only. Separate `invoice.read` from `invoice.approve` so FGAC (14.3.1) can grant one without the other.
4. **Make capability grants task-scoped**, aligning with just-in-time tool exposure at the gateway (Ch. 15.3.3): the agent sees only the tools this task needs.

```python
from pydantic import BaseModel, Field
from typing import Literal

# ANTI-PATTERN: unbounded capability — no policy can safely re-scope this.
# def execute_sql(query: str) -> list[dict]: ...

# PATTERN: minimal executable subset. The verb "delete" is not expressible.
class GetInvoice(BaseModel):
    action: Literal["invoice.read"] = "invoice.read"
    invoice_id: int = Field(..., ge=1)

class ListOpenInvoices(BaseModel):
    action: Literal["invoice.list"] = "invoice.list"
    vendor_id: int = Field(..., ge=1)
    limit: int = Field(default=50, le=200)   # bounded blast radius on reads
```

The trade-off is real: purpose-built tools multiply the tool count and can constrain legitimate flexibility, and there is genuine tension between an agent's usefulness (broad capability) and its safety (narrow capability). The resolution is *composition* — many narrow tools the agent can chain — rather than one broad tool. The failure mode of ignoring this: teams ship an `execute_shell` or `execute_sql` tool "for flexibility," and every downstream control is now trying to re-impose a boundary the interface deliberately erased.

### 14.4.3 Revocation Protocols: Real-Time Token Termination and Agent Identity Quarantining

Issuance is easy; **revocation** is where agent IAM is won or lost, because the entire point of short-lived, attested, brokered identity is that you can *withdraw authority immediately* when an agent is compromised. Two capabilities are required: real-time token termination and identity quarantine.

**Real-time token termination.** Short TTLs (14.3.3) bound exposure passively, but a compromised agent acting within its TTL still needs active kill. Because self-contained JWTs can't be un-signed, real-time revocation requires one of: (1) a **token introspection** call (RFC 7662) on every use against a status service that can flip a token to revoked; (2) a **deny-list** of `jti`/`sub` checked at the gateway (Ch. 15) on every request; or (3) simply refusing to *re-mint* — since brokered agents re-request tokens every few minutes, cutting off minting at the broker terminates authority within one TTL without touching the resource servers. The introspection approach is immediate but adds a per-request round-trip; the re-mint approach is cheaper but has a TTL-bounded lag. Choose per action sensitivity.

**Agent identity quarantine** goes further than revoking one token — it disables the *identity*. On a compromise signal (trajectory anomaly, injection detection, DLP hit), the control plane: revokes active tokens, removes the SPIRE registration entry (14.1.2) so no new SVID can be earned, deny-lists the SPIFFE ID at every gateway, and freezes the agent's task queue. This severs the agent from all three authorities at once.

```python
class RevocationController:
    def __init__(self, spire, broker, gateway_denylist: set[str]):
        self._spire, self._broker = spire, broker
        self._deny = gateway_denylist

    def quarantine(self, spiffe_id: str, reason: str) -> None:
        # 1) stop new credentials: remove SPIRE entry -> no fresh SVID
        self._spire.delete_registration(spiffe_id)
        # 2) stop re-minting at the broker (kills authority within one TTL)
        self._broker.disable(spiffe_id)
        # 3) reject in-flight use immediately at every gateway
        self._deny.add(spiffe_id)
        # 4) freeze work + emit audit event for IR
        _freeze_task_queue(spiffe_id)
        _audit("agent.quarantine", subject=spiffe_id, reason=reason)
```

| Signal source | Example trigger | Automated response |
| :--- | :--- | :--- |
| Runtime detector | Injection/DLP hit in trajectory | Quarantine identity, page IR |
| Anomaly engine | Scope/step-count spike (14.3.2) | Revoke tokens, step-up remaining |
| Owner/human | Reported misbehavior | Freeze queue, rotate broker creds |
| Attestation | Node integrity failure | Delete SPIRE entry, deny SPIFFE ID |

The honest limits: revocation propagation is not instantaneous unless every use is introspected (a latency cost most deployments won't pay for read-only tools), so there is always a TTL-bounded window where a compromised token still works — which is why TTLs must be short. Quarantine also depends on *detecting* compromise, and the injection attacks of Ch. 13 are designed to be quiet. Revocation is the last line, not the first; it works only with short TTLs, least-privilege tools, and the runtime enforcement of the next chapter.

---

## Technical Chapter Summary

- Treat agent identity as a five-phase **NHI lifecycle** (issue, attest, rotate, revoke, retire) with mandatory ownership and continuous inventory; long-lived API keys fail structurally — unattributable, over-scoped, un-revocable in practice, invisible.
- Ground identity in **SPIFFE/SPIRE**: node + workload attestation issues short-lived X.509/JWT SVIDs from a non-exportable root, with a structured SPIFFE ID scheme per agent class and federation across trust domains — but an SVID proves identity, not authorization.
- Keep **user, agent, and system execution authority** separate and enforce their *intersection*; conflating them into one broad system credential is the confused-deputy setup injection exploits.
- Carry authority with OAuth 2.1 + **PKCE** and **RFC 8707 Resource Indicators** for audience-bound tokens, and propagate it via **RFC 8693 token exchange** using delegation (not impersonation) with **monotonic scope narrowing** and task-length TTLs.
- Agentic-auth standards are unratified; ship interim patterns — **broker-mediated credential exchange, per-task token minting, scoped service identities** — behind a broker so the eventual standard is a format change, not a re-plumb.
- Enforce **FGAC** with OPA/Rego, Cedar, and OpenFGA at a gateway PDP, and make it **context-aware**: bind declared intent, propagate taint/provenance, downgrade on trajectory anomalies — a layer that raises attack cost, not a proof.
- Prefer **dynamically minted, short-lived, narrowly-scoped credentials** over static keys, and adopt **never-materialize-in-context** secrets: the agent holds a handle, the broker holds and injects the secret out-of-band.
- Design tools to the **minimal executable subset** (typed purpose-built tools over `execute_sql`), and invest in **revocation** — real-time token termination plus **identity quarantine** (delete SPIRE entry, stop re-minting, deny-list the SPIFFE ID) — accepting a TTL-bounded window only short lifetimes can shrink.
