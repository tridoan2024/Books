# Chapter 26: Cloud API backends, response semantics and security

> **Part:** Part VII — Security Foundations for AI Platforms
> **Market evidence:** API design (4.6%), Application security (10.4%), Identity & access management (11.6%), Testing & automation (2.9%); 681-posting aggregate; 131 securing-AI roles, 2026-08-25
> **Reader status:** Beginner path; no prior API or web-security knowledge assumed
> **Why this chapter exists:** “Cloud backend” describes many different systems: browser applications, mobile APIs, partner interfaces, internal services, serverless functions, gateways, event consumers, streaming protocols, data services and AI inference. Appendix D provides a testing reference, but a secure engineer first needs a complete mental model of who calls each backend, how the protocol behaves, what a valid response means, where security decisions occur and how a scanner can prove or misinterpret them.

---

## 1. What an API is

An application programming interface is a contract that allows one program to request work from another. A web API usually receives an HTTP request and returns an HTTP response.

```http
POST /v1/tenants/acme/summaries HTTP/1.1
Authorization: Bearer eyJ...
Content-Type: application/json

{"document_id":"doc-123","max_output_tokens":500}
```

The request contains a method, path, headers and optional body. The response contains a status code, headers and optional body. HTTPS means HTTP carried through TLS, which protects traffic from passive reading and tampering in transit. TLS does not prove that the caller is allowed to access `doc-123`; the application must still authenticate and authorize the request.

REST APIs model resources through paths and HTTP methods. GraphQL commonly exposes a query language through one endpoint. gRPC uses strongly typed protocol-buffer messages, usually over HTTP/2. Their syntax differs, but they share the same security questions.

## 2. A useful request-processing pipeline

Process requests in layers:

```text
Client
  -> TLS termination
  -> request size and protocol checks
  -> authentication
  -> coarse gateway policy and rate limit
  -> schema and syntax validation
  -> resource resolution and application authorization
  -> semantic validation
  -> business operation or AI orchestration
  -> output filtering and response shaping
  -> audit event and metrics
```

Reject invalid requests as early as practical, but keep resource-specific authorization close to the service that owns the resource. A gateway can validate a token and enforce a global rate limit. It usually cannot decide whether the authenticated user may read a particular document unless it has current, trustworthy ownership data.

### 2.1 “Cloud backend” is a multi-dimensional system

The phrase **cloud backend** does not identify one architecture. Classify a backend along three independent axes:

1. **Client or caller:** browser, mobile application, partner, internal workload, device, administrator or AI agent.
2. **Protocol and interaction style:** HTTP/JSON, server-rendered HTML, GraphQL, gRPC, server-sent events, WebSocket, asynchronous polling, webhook or event bus.
3. **Hosting and operational model:** virtual machine, long-running container, Kubernetes workload, serverless function, managed service, database facade, gateway or edge worker.

A single production system combines all three. A mobile client may call a GraphQL API implemented by serverless functions behind an API gateway. “Mobile,” “GraphQL,” “serverless,” and “gateway” describe different dimensions of that one request path.

Two categories you already identified are important:

1. A backend supporting a user interface, where a browser or native application calls server APIs on behalf of a person.
2. A web application backend that may render complete HTML pages or combine HTML routes with API routes.

They are related but not identical. A user-interface backend may return only JSON because a separate React, Angular, iOS or Android client renders the UI. A traditional or server-rendered web application may return HTML, CSS, JavaScript, redirects and cookies. A modern product can contain both behaviors under one hostname.

The following taxonomy gives you a more complete review model.

### 2.2 Server-rendered web application

A server-rendered web application produces browser documents. Examples include an employee portal, administration console or account-management website.

Typical request:

```http
GET /account/profile HTTP/1.1
Host: portal.example.com
Cookie: session=...
Accept: text/html
```

Typical successful response:

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Security-Policy: default-src 'self'
Set-Cookie: session=...; Secure; HttpOnly; SameSite=Lax

<!doctype html>...
```

Expected behavior includes HTML rendering, navigation redirects and cookie-based sessions. Important security concerns include cross-site scripting, cross-site request forgery, clickjacking, session fixation, cookie protection, browser caching and content security policy.

For this backend, missing browser headers may be meaningful because the response is executed or rendered by a browser. A scanner should not assume that every `200 text/html` response is the requested application page; WAF challenges, generic error pages and single-page application fallbacks can also return HTML.

### 2.3 Single-page application and backend-for-frontend

A single-page application downloads an HTML/JavaScript shell, then calls APIs to load and change data. A **backend-for-frontend**, or BFF, is a server tailored to one client experience such as web, iOS or Android.

```text
Browser SPA ------> Web BFF ------> domain services
Mobile app -------> Mobile BFF ---> domain services
```

The initial `/` route may return HTML, while `/api/profile` returns JSON. The BFF may use secure cookies with the browser while using OAuth access tokens or workload identity to call downstream services.

A strong design is a **token-mediating BFF**. The browser holds only a `Secure`, `HttpOnly`, appropriately `SameSite` session cookie. OAuth access and refresh tokens stay in protected server-side session storage, and the BFF attaches access tokens when calling downstream APIs. This reduces token theft through browser JavaScript. It does not remove XSS or CSRF risk because malicious script may still issue actions through the victim’s session. Avoid long-lived bearer tokens in browser `localStorage` or `sessionStorage` when the architecture can use a BFF.

Typical API response:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{"displayName":"A. User","permissions":["records:read"]}
```

Security concerns include:

- cookie and CSRF controls between browser and BFF;
- token storage and delegation between BFF and downstream APIs;
- object- and function-level authorization;
- excessive data returned to the client;
- CORS policy when origins differ;
- cache separation by user and tenant;
- server-side request forgery if the BFF fetches user-controlled URLs.

CORS is a browser rule, not authentication. A server-to-server attacker is not stopped by CORS. A permissive CORS policy can allow a malicious website to read responses using a victim’s browser credentials, but a restrictive CORS policy does not make an otherwise unauthenticated API secure.

### 2.4 Native mobile or desktop application backend

A mobile or desktop client normally calls JSON APIs directly. The application binary is distributed to user-controlled devices, so secrets embedded in it should be considered recoverable by an attacker.

Typical authentication uses OAuth 2.0 Authorization Code with PKCE using the `S256` challenge method. The app opens a system browser for login, receives an authorization result and exchanges it for tokens without storing a permanent client secret in the binary. Claimed HTTPS redirects such as iOS Universal Links or Android App Links reduce authorization-code interception risk compared with custom URI schemes when configured correctly. Store refresh tokens in platform-protected storage such as iOS Keychain or Android Keystore-backed facilities.

Responses are commonly JSON, binary files or streaming data. Browser-specific controls such as CSP and `X-Frame-Options` usually do not protect native clients. More relevant controls include token validation, certificate and hostname validation, device or application attestation where justified, object authorization, secure local storage, API abuse controls and minimizing sensitive response fields.

Do not treat certificate pinning as the primary API authorization control. Pinning may increase resistance to some interception threats, but it creates rotation and recovery challenges and does not stop a legitimate authenticated user from abusing an authorization flaw.

### 2.5 Public developer or partner API

A public API is intentionally reachable by customers, partners or third-party developers. It needs a stable contract, documented authentication, tenant isolation, versioning, quotas and safe error behavior.

Typical clients use OAuth access tokens, signed requests, mutual TLS or API keys depending on assurance requirements. API keys usually identify a calling application; they do not by themselves prove which human user authorized an action.

Expected responses should have documented status codes and machine-readable schemas. For example:

```http
HTTP/1.1 403 Forbidden
Content-Type: application/problem+json

{
  "type":"https://api.example.com/problems/insufficient-scope",
  "title":"Insufficient scope",
  "status":403,
  "correlation_id":"req-8f21"
}
```

Security concerns include credential issuance and revocation, customer isolation, enumeration, webhook security, replay, quota fairness, backward-compatible fixes, inventory of old versions and preventing sensitive details from entering documentation or error messages.

Use bounded pagination. Deep offset queries can force expensive database scans, so large datasets often use opaque cursor pagination with maximum page sizes. Limit recursive field expansion that can create enormous joins or response graphs. Communicate retirement with a documented lifecycle, usage telemetry and standard signals where supported; `Sunset` is defined by RFC 8594, while `Deprecation` is standardized separately.

### 2.6 Internal service-to-service API

An internal API connects workloads such as microservices, Kubernetes pods, functions or batch jobs. “Internal” describes reachability, not trustworthiness. A compromised internal workload can attack other services.

Authentication commonly uses workload identity, mutual TLS, signed service tokens or a service mesh identity. The receiving service should verify the caller and authorize the requested operation. Network location alone is weak evidence of identity.

Responses are often JSON, Protobuf/gRPC messages or simple acknowledgements. Browser headers are normally irrelevant. Important controls include workload identity, least privilege, service-to-service authorization, egress policy, replay protection where required, schema validation, timeouts, bounded retries and traceable delegation when a service acts for a user.

Ask whether the downstream service receives:

- only a powerful service identity;
- only an end-user identity;
- or both actor and service identities.

Both are often needed. The service identity proves which workload made the call; the actor context explains on whose behalf it acted.

### 2.7 API gateway or edge facade

An API gateway is an intermediary rather than the final business backend. It may terminate TLS, validate tokens, route paths, transform requests, apply quotas, produce errors and add headers.

Gateway-generated responses can look different from application responses:

```http
HTTP/1.1 403 Forbidden
Content-Type: text/html
Server: edge-gateway

<html>Request blocked</html>
```

or:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 30

{"error":"rate_limit_exceeded"}
```

A scanner must determine whether the response came from the gateway or application. Useful evidence includes gateway-specific headers, body fingerprints, request IDs and correlated logs. A WAF block may prove that one payload was filtered at the edge; it does not prove the application is safe if an alternate encoding, route or direct origin bypasses the edge.

Gateways may replace a validated token with headers such as `X-User-Id`, `X-Tenant-Id` or `X-Roles`. The gateway must strip caller-supplied copies before injecting authoritative values. The origin must reject direct public access and authenticate the upstream gateway using a platform-appropriate mechanism such as mutual TLS, a signed short-lived internal token or service-mesh identity. Private routing reduces exposure but does not by itself prove that every internal caller is trusted. Configure trusted proxies explicitly before using `Forwarded` or `X-Forwarded-*` values for source-address policy, redirect construction, secure-cookie decisions or audit attribution.

### 2.8 Serverless function or function API

A serverless function runs in response to HTTP, queue, storage, schedule or event triggers. HTTP-triggered functions may behave like ordinary APIs, but their platform supplies routing, scaling, identity injection and execution limits.

Security concerns include:

- anonymous versus authenticated trigger configuration;
- function-level authorization and application authorization;
- overprivileged managed identity or execution role;
- secrets in environment settings;
- event injection and replay;
- unsafe parsing of uploaded objects or messages;
- concurrency explosions and downstream exhaustion;
- public platform hostnames bypassing the approved gateway;
- temporary file and invocation-log leakage.

Serverless instances are often reused. Module-level variables, connection pools, in-memory caches and temporary files may survive into a later invocation. Never keep tenant authorization state in mutable global variables. Minimize sensitive temporary data, use unique invocation paths, delete files promptly during normal cleanup and do not claim secure erasure on provider-managed storage. Design transactions and messages to tolerate abrupt termination because platform timeouts may prevent cleanup code from finishing.

An HTTP function may return `202 Accepted` because it queued work rather than completing it. The reviewer must follow the job or event to determine whether authorization, integrity and failure handling remain correct after the immediate HTTP response.

### 2.9 Asynchronous job API

Long-running operations often use this pattern:

```http
POST /v1/reports HTTP/1.1

HTTP/1.1 202 Accepted
Location: /v1/jobs/job-123

{"job_id":"job-123","status":"queued"}
```

The client later polls `/v1/jobs/job-123`, receives a callback, or subscribes to events. Security must cover both the submission and later result retrieval.

A documented lifecycle may return `200` with job state while processing and `303 See Other` to the final resource after completion. Other APIs keep returning a status document; both styles are valid. Use `Retry-After` or documented polling intervals to prevent aggressive loops. Reauthorize each status and result request, and expire jobs and download links according to retention policy.

Review:

- who may create the job;
- which tenant owns it;
- whether another tenant can guess the job ID;
- which identity the worker uses;
- whether authorization is rechecked before execution;
- where results are stored;
- whether cancellation works;
- whether expired authority can continue through queued work;
- how duplicate submissions and retries are made idempotent.

A `202` proves only acceptance, not successful secure completion.

### 2.10 Event-driven backend and message consumer

Some backends do not expose an HTTP endpoint to their real callers. They consume queue messages, event-bus records, storage events or change streams.

The “request” is an event envelope containing metadata and payload. The “response” may be an acknowledgement, retry, dead-letter entry or new event rather than an HTTP document.

Security concerns include producer identity, topic permissions, schema validation, message signing where needed, replay, duplicate delivery, ordering, poisoned messages, tenant metadata, dead-letter confidentiality and consumer privileges.

Most delivery systems are **at least once**, meaning a message may be processed more than once. Handlers must be idempotent or use deduplication so retries do not duplicate payments, accounts, notifications or clinical actions.

Standard envelopes such as CNCF CloudEvents make event identity, source, type, time and content type consistent across transports. Apply bounded retries and route persistently failing poison messages to a protected dead-letter queue. Redriving an old message requires a current authorization and business-state decision; embedded user authority may have expired or been revoked.

An HTTP-only scanner cannot claim full coverage of this backend. It needs configuration review, event fixtures and observation of downstream state.

### 2.11 Webhook sender and receiver

A webhook receiver accepts server-to-server callbacks. It may be publicly reachable even when the rest of the system is private. Compute its signature over the exact raw request bytes before parsing. Compare signatures using a constant-time cryptographic function, validate the signed timestamp within an approved replay window and deduplicate event identifiers.

Expected behavior often includes a fast `2xx` acknowledgement followed by asynchronous processing. Store accepted event identifiers for the replay window and make the downstream handler idempotent.

A webhook sender must protect destination configuration and secret rotation. User-supplied callback URLs can create SSRF. Outbound requests need scheme and port allowlists, redirect revalidation, DNS-rebinding-resistant connection handling, network egress policy, timeouts and response-size limits. Prefer a hardened outbound proxy or library that validates the address actually connected to; naïve pre-resolution can break TLS and remain unsafe across redirects.

### 2.12 File upload, download and object service

This backend moves binary content rather than ordinary JSON. It may return:

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="report.pdf"
```

or a short-lived signed object-storage URL.

Review content type, filename handling, maximum size, decompression, malware and parser risk, authorization to the object, storage encryption, retention, range requests, caching and whether signed URLs are scoped and short lived. A `200` with binary data needs different semantic validation from a JSON record.

Large uploads often go directly to object storage using short-lived signed URLs or form policies. Bind authorization to the intended key, method, expiration and supported headers. Size and content-type constraints vary by provider and signing method, so verify them again before downstream processing. Abort abandoned multipart uploads through lifecycle policy. Serve untrusted HTML or SVG from a separate content origin or force download; otherwise stored script may execute in the application’s origin.

### 2.13 Identity and token service

An identity backend issues sessions, access tokens, refresh tokens, password-reset links, OTPs or device credentials. OpenID Connect discovery commonly publishes the issuer, endpoints and JWKS location at `/.well-known/openid-configuration`. Consumers must pin the expected issuer and discovery origin, cache signing keys safely, support rotation and rate-limit refresh attempts for unknown key IDs.

Its user-facing responses may intentionally differ from internal processing to prevent account enumeration.

For example, a password-reset endpoint might always return `202 Accepted` whether or not the account exists. This is not a false response; it is a privacy control. The real verification may require observing whether unauthorized tokens are issued, whether rate limits work and whether the correct account receives a one-time action.

Review redirect URI validation, PKCE, client authentication, token audience, refresh-token rotation, revocation, session binding, MFA recovery, OTP replay, enumeration, rate limiting and audit evidence. Never log raw tokens as scan evidence.

### 2.14 Administrative or cloud control-plane API

Control-plane APIs create, configure or delete resources. They are often lower volume but much higher privilege than ordinary data APIs.

Examples include deploying a service, changing gateway policy, granting access, rotating keys or promoting a model. Responses may be synchronous or return a long-running operation handle.

These APIs need strong administrator authentication, just-in-time privilege, separation of duties, change approval, immutable audit logs, idempotency and protected recovery access. A control-plane authorization failure can affect every tenant even if no customer data is returned in the immediate response.

For retried provisioning or mutation requests, support an idempotency key or equivalent operation identifier backed by atomic state. Bind it to the caller and normalized request, and reject reuse with different parameters. High-blast-radius actions may require fresh step-up authentication and additional approval, but neither replaces authorization or separation of duties.

### 2.15 Health, readiness and metrics endpoints

Operational endpoints answer questions such as whether a process is alive, ready to receive traffic or healthy enough for monitoring.

Common responses include:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ready"}
```

Some must be reachable by load balancers or cluster components without user authentication. That does not make every anonymous response an authentication vulnerability. Keep the returned data minimal. Do not expose dependency credentials, internal addresses, stack traces, build secrets or detailed configuration.

In Kubernetes, liveness asks whether the process should be restarted; do not normally make it fail because a shared database is briefly unavailable, or an outage can cause a restart storm. Readiness asks whether an instance should receive traffic and may include required dependencies. Startup probes protect slow initialization. Metrics endpoints can reveal topology, tenant labels and workload behavior, so keep them private or require workload authentication where supported.

The scanner needs an explicit inventory of intentionally public operations so it does not treat every unauthenticated endpoint as missing authentication.

### 2.16 AI inference and agent backend

An AI backend may accept prompts, images, audio, documents or embedding requests. Responses may be ordinary JSON, streamed tokens, tool-call proposals, generated files or asynchronous jobs.

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"delta":"The"}
data: {"delta":" result"}
data: [DONE]
```

Review model and tool authorization, prompt and retrieved-content trust, sensitive-data handling, output policy, model version, tenant-isolated conversation state, token/cost limits, streaming cancellation and whether a model proposal can trigger privileged actions without deterministic checks.

A streaming endpoint commits `200` before later output is generated. Mid-stream failures therefore require an application event or termination convention; they cannot change the already-sent HTTP status. The scanner must parse typed events and the termination condition. Proxies must not buffer the intended stream, and client cancellation should propagate upstream so expensive inference does not continue without a consumer.

### 2.17 GraphQL backend

GraphQL commonly exposes one HTTP route while allowing many logical operations in the request body. Field-level resolver errors can appear inside `200` responses with partial data. Malformed JSON, parse errors or query-validation failures commonly use `400`; top-level authentication may use `401` or `403`.

```json
{
  "data": {"patient": null},
  "errors": [{"message":"Forbidden","path":["patient"]}]
}
```

The scanner must inspect the GraphQL response envelope, not only the status. Review field- and object-level authorization, query depth and complexity, batching, introspection policy, alias abuse, error disclosure and tenant-scoped resolvers. Limit the number and weighted complexity of operations inside one HTTP request so aliases or batching cannot bypass request-based quotas. Persisted or allowlisted queries reduce dynamic query exposure but do not eliminate resolver authorization, downstream injection or denial-of-service risk.

### 2.18 gRPC backend

gRPC usually uses HTTP/2 and Protocol Buffers. Initial headers commonly contain HTTP `200`, while the final application result is expressed by `grpc-status` and optional `grpc-message` trailers. An immediate error may use a trailers-only response, where the first and only header block also ends the stream and carries `grpc-status`. Status 7 is `PERMISSION_DENIED`; status 16 is `UNAUTHENTICATED`. A scanner must inspect both trailers-only and ordinary trailing status, not only HTTP status.

Review service and method authorization, message-size limits, streaming duration, reflection exposure, metadata credentials, deadlines and cancellation. Proxies must support gRPC and preserve HTTP/2 semantics. Browser clients normally need gRPC-Web, Connect or another translation layer. The test harness must speak the actual protocol and interpret trailers.

### 2.19 WebSocket and bidirectional streaming backend

A WebSocket begins with an HTTP upgrade and then becomes a long-lived bidirectional channel. Browser cookies may accompany a cross-origin handshake, so validate `Origin` against an explicit allowlist when cookie authentication is used to prevent cross-site WebSocket hijacking. Avoid bearer tokens in query strings; use an appropriate secure cookie, short-lived single-use connection ticket or authenticated first-message protocol. If authentication occurs after upgrade, enforce a short handshake deadline and strict pre-authentication connection limit so idle unauthenticated sockets cannot exhaust capacity.

Authentication at connection time may not be sufficient when permissions change or individual messages invoke different actions.

Review origin checks for browser clients, token placement and expiration, per-message authorization, message schemas, connection and message rate limits, backpressure, idle timeouts, revocation and tenant-isolated subscriptions. A successful `101 Switching Protocols` proves only that the channel opened.

### 2.20 Database facade or data-access API

Some backends primarily expose search, query, reporting or CRUD access to data. Managed database facades may translate client operations directly into database queries. Security depends heavily on object ownership, row/field filtering, query limits, export controls and safe parameterization.

List and search endpoints are especially important. A single-object endpoint may check ownership correctly while a broad search returns records from other tenants. Responses may omit prohibited fields for ordinary users but include them for privileged roles. Test both which rows and which fields are returned.

Database row-level security can provide an additional boundary when policies are correct and the application role cannot bypass them. With pooled connections, scope tenant/session variables to the transaction and reset state correctly so one request cannot inherit another tenant’s context. Limit filters, query depth, regular expressions, statement duration, exported rows and sort choices.

### 2.21 One product can contain many backend types

Consider a cloud clinical platform:

```text
Browser portal ------> BFF/API gateway ------> patient and clinician APIs
Mobile app ----------> mobile API -----------> same domain services
Partner system ------> public partner API ---> integration service
Device --------------> ingestion endpoint --> event bus --> processors
Admin team ----------> control-plane API ----> cloud resources
Model service -------> inference API --------> GPU serving pool
Notification worker -> webhook sender -------> external provider
```

Calling all of these “the backend” hides important security differences. Build an inventory at the operation level:

| Operation | Backend type | Client | Protocol | Expected auth | Expected response | Data class | Owner |
|---|---|---|---|---|---|---|---|
| `GET /portal` | server-rendered web | browser | HTTPS | session | HTML | internal | web team |
| `GET /api/patients/{id}` | BFF/domain API | browser/mobile | JSON/HTTPS | user token | JSON or denial | regulated | clinical team |
| `POST /events/device` | ingestion | device | HTTPS | device credential | `202` | regulated | IoT team |
| `ReportRequested` | event consumer | queue | message | workload identity | ack/new event | confidential | reporting team |
| `DeployModel` | control plane | administrator | gRPC/HTTPS | privileged identity | operation handle | critical config | platform team |

This table tells the scanner what protocol to use, which identity and fixture are required, how to interpret the response and who owns remediation.

### 2.22 How to classify an unknown backend response

When you do not know what kind of backend answered, use this sequence:

1. Confirm DNS, TCP and TLS connectivity.
2. Record status, content type, length, selected safe headers and redirect chain.
3. Compare the body with the expected contract or schema.
4. Look for platform fingerprints cautiously: gateway request IDs, WAF markers, SPA shell HTML or known error envelopes.
5. Send a harmless valid control request if credentials and fixtures exist.
6. Send one carefully chosen negative request.
7. Correlate both requests with gateway and application logs.
8. Classify the response producer and semantic result.

Useful response classes include:

- gateway/WAF denial;
- proxy or routing error;
- server-rendered HTML;
- SPA fallback shell;
- JSON success;
- JSON authentication or authorization error;
- validation error;
- binary download;
- redirect;
- asynchronous acceptance;
- stream established;
- gRPC success/error;
- unreachable or TLS error;
- unknown/inconclusive.

Map the response class to the Chapter 25 outcome model according to the test’s exact oracle:

| Observed response class | Likely outcome for an application-security test | Important exception |
|---|---|---|
| DNS, TCP or TLS failure | `ERROR` | It may be `PASS` only when controlled reachability or protocol rejection is itself the test and a working control path exists. |
| WAF or gateway block page | `INCONCLUSIVE` for application behavior | It may be `PASS` for a narrowly defined edge-policy test. |
| SPA fallback on an API route | `INCONCLUSIVE` or routing error | It is not evidence that API authentication or authorization passed. |
| Valid JSON authentication denial | `PASS` for the matching negative-authentication test | Confirm the request reached the intended authentication boundary. |
| Unauthorized protected data or state change | `FAIL` | Requires known identity, ownership and semantic evidence. |
| `202 Accepted` | Pending or `INCONCLUSIVE` for final business outcome | It may pass a test concerned only with authenticated submission. Follow the job separately. |
| gRPC nonzero trailer status | Interpret the gRPC status | Do not classify from HTTP `200` alone. |

The status code is only one signal. Interpret this response:

```http
HTTP/1.1 200 OK
Content-Type: text/html

<html><title>Application</title><div id="root"></div></html>
```

If the scanner requested `/api/patients/123`, the response may be an SPA fallback caused by an unknown route. It does not prove the patient API allowed access. The correct result is likely inconclusive or route-not-reached, depending on the test definition.

Now interpret:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"patient_id":"123","name":"..."}
```

This still is not automatically a vulnerability. You must know whether the endpoint is public, which identity called it, who owns patient 123 and which fields that identity is allowed to receive.

### 2.23 Expected HTTP responses by operation style

These are conventions, not universal laws:

| Situation | Common response | Important review question |
|---|---|---|
| Successful read | `200 OK` | Was the caller authorized for this object and these fields? |
| Successful creation | `201 Created` | Is the new resource owned correctly, and is `Location` safe? |
| Accepted background work | `202 Accepted` | Who owns the job, and how is later execution authorized? |
| Successful action without body | `204 No Content` | Did the intended state change occur, and is caching safe? |
| Malformed request | `400 Bad Request` | Is the error stable and free of internal details? |
| Missing/invalid authentication | `401 Unauthorized` | Does the challenge match the intended scheme? |
| Authenticated but forbidden | `403 Forbidden` | Is resource existence intentionally disclosed? |
| Not found or intentionally hidden | `404 Not Found` | Is this routing failure, absent object or authorization hiding? |
| State conflict | `409 Conflict` | Can retries or races corrupt state? |
| Semantic validation failure | `422 Unprocessable Content` | Are field errors safe and bounded? |
| Rate limit | `429 Too Many Requests` | What identity/resource is limited, and can it be bypassed? |
| Conditional cache response | `304 Not Modified` | Are validators and cache keys isolated by authorization and tenant? |
| Unsupported method | `405 Method Not Allowed` | Is method handling consistent, and is `Allow` accurate? |
| Oversized body | `413 Content Too Large` | Is the limit enforced before expensive buffering or parsing? |
| Unsupported representation | `415 Unsupported Media Type` | Are ambiguous and dangerous formats rejected consistently? |
| Bad gateway | `502 Bad Gateway` | Which intermediary failed to obtain a valid upstream response? |
| Temporary unavailability | `503 Service Unavailable` | Is overload controlled, and will retries create a storm? |
| Gateway timeout | `504 Gateway Timeout` | Was abandoned downstream work cancelled? |
| Other server failure | `5xx` | Did the dependency or application fail safely without leaking internals? |

Do not write security tests that accept exactly one status unless the contract truly requires it. Authentication denial might be `401`, while an application intentionally hiding resources may use `404`. The oracle should verify the security property—for example, no protected data or state change—not merely a preferred status code.

### 2.24 Security-review questions for any backend type

For every operation, answer:

1. Who or what is the client?
2. Which protocol and content types are valid?
3. Is the endpoint intentionally public, privately reachable or authenticated?
4. Which identity represents the caller?
5. Which action, object, tenant and fields are authorized?
6. Which component makes the authoritative decision?
7. What does a normal success look like semantically?
8. What do authentication, authorization, validation and dependency failures look like?
9. Can an intermediary return a misleading response?
10. Does work continue asynchronously after the response?
11. Which data is returned, cached, logged or placed in events?
12. What resource can the caller exhaust?
13. How are retries, duplicates, cancellation and partial failure handled?
14. What audit evidence connects the user, workload and downstream action?
15. How will a scanner prove the property without causing harm?

### 2.25 Case studies from the sec-api correctness-preview reports

The following cases are derived from a real cloud API scanner proof of concept. Product and host details are intentionally abstracted, but the result counts and review problems reflect the scan artifacts. Use these examples to connect protocol theory to Sr. Staff review work.

#### Case 1: What 325 quick tests actually proved

One correctness-preview batch ran 25 planned tests against each of 13 logical services:

| Outcome | Count | Share | Meaning |
|---|---:|---:|---|
| `PASS` | 148 | 45.5% | The recorded oracle passed for that test’s available scope. |
| `FAIL` | 20 | 6.2% | Twenty finding records were produced. |
| `INCONCLUSIVE` | 135 | 41.5% | Required identity, fixture, route or semantic evidence was insufficient. |
| `ERROR` | 22 | 6.8% | Execution failed, including transport or tooling problems. |
| **Total** | **325** | **100%** | This is test execution, not operation or risk coverage. |

The incorrect executive statement would be: “The services passed 45.5% of security controls and failed 6.2%.” Tests do not necessarily have equal coverage or importance, and many high-impact authorization tests may be inconclusive.

A defensible statement is:

> The quick correctness-preview executed 325 test cases. It produced 20 confirmed hardening findings under the current oracles, while 157 tests were inconclusive or errored. The batch demonstrates improving engine truthfulness but does not establish complete authenticated API coverage. Authorization and business-logic assurance remain dependent on service-specific identities, objects and contracts.

Then quantify operation coverage separately:

```text
documented operations
  -> normalized operations
  -> operations selected by criteria
  -> operations with valid authentication
  -> operations actually exercised
  -> operations with conclusive security evidence
```

The denominator matters. Twenty-five generic tests do not mean twenty-five API operations were tested.

#### Case 2: TLS failure incorrectly becoming a critical authentication finding

An earlier report recorded authentication findings with evidence equivalent to:

```text
Request: ALL *
Actual status: 0
Error: certificate verification failed
Expected status: 401
Assigned severity: CRITICAL
```

This is not evidence that authentication is missing. The request did not establish a trusted TLS connection, the route and method were unresolved wildcards, no application response was received, and the authentication oracle did not execute.

Correct classification:

```text
outcome: ERROR
error_type: TLS_CERTIFICATE_VALIDATION
oracle_executed: false
finding_created: false
required_action: repair trust/routing configuration and retest
```

Your feedback to the cloud team should first ask whether the hostname, SNI, certificate chain and scanner trust path are correct. Your feedback to the scanner team should require the state machine to prevent transport errors from creating vulnerability findings.

#### Case 3: Three service reports, one shared deployment finding

In the preview batch, three logical service configurations pointed to the same cloud deployment and each produced the same five browser-header findings:

- missing or ineffective frame protection;
- missing Content Security Policy;
- missing `X-Content-Type-Options`;
- missing `Referrer-Policy`;
- missing `Permissions-Policy`.

Counting these as fifteen independent vulnerabilities exaggerates the root-cause count. First compare hostname, route, response body hash, server/gateway headers and infrastructure ownership. If the same component generated all responses, create one deployment-level finding with three affected-service relationships.

Next classify the response. If it is a browser-rendered HTML application shell, CSP and frame protection are meaningful. If it is JSON, an empty response or a gateway-generated document, most of these findings are low-value or belong to the gateway’s error-page configuration. `X-Content-Type-Options` is a sensible browser-facing baseline, but its absence alone does not demonstrate API data compromise.

A useful ticket says:

```text
Root cause: shared gateway/app response policy
Affected logical services: three
Response class: HTML application shell
Risk: browser execution and framing protections absent
Owner: shared web platform team
Acceptance test: HTML responses contain the approved CSP and frame policy;
JSON responses retain correct content type and do not receive inflated severity
```

#### Case 4: Zero findings with weak coverage

Several services produced zero findings, but some also had many inconclusive or error outcomes. One service recorded only three passes, eleven inconclusive results and eleven errors.

“Zero findings” is therefore true but dangerously incomplete. It does not mean “secure.” The report should display:

```text
Confirmed findings: 0
Conclusive tests: 3 of 25
Inconclusive: 11
Errors: 11
Assessment status: INSUFFICIENT or correctness preview
Primary limitations: reachability/authentication/fixtures
```

As reviewer, prioritize restoring trustworthy reachability and identity before asking the development team to remediate nonexistent product findings.

#### Case 5: An intentionally public endpoint

Suppose a health route returns:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ready"}
```

A generic “no Authorization header” test must not automatically fail. The inventory should declare the operation intentionally public and specify its allowed response schema. The security oracle then asks whether the endpoint reveals only approved minimal health data—not whether every anonymous request receives `401`.

If the same endpoint returns database addresses, environment variables, dependency versions and exception messages, the problem is information exposure, not necessarily missing authentication. Remediation might be response minimization and private metrics separation.

#### Case 6: A real BOLA test for the scanner roadmap

A criterion named “access another user’s record” is not executable until the scanner has:

- principal A and principal B for the same environment;
- an object known to belong to A;
- a successful A control request;
- a B request targeting the identical object;
- an expected response and protected-field oracle;
- safe cleanup if state changes.

If the scanner substitutes a zero UUID and receives `404`, classify it as inconclusive. It has tested nonexistent-object behavior, not ownership enforcement.

A mature finding would record:

```text
owner_control: A received object 123 with approved fields
cross_principal_test: B received object 123 with the same protected fields
gateway_result: both tokens authenticated successfully
application_result: ownership was not enforced
audit_correlation: request IDs linked to both identities
outcome: FAIL
confidence: HIGH
```

The development feedback should target the application or data-access authorization layer, not request a WAF signature.

#### Case 7: Scanner architecture as part of the cloud review

The scanner design separates a dashboard, management API, scan engine, credential references and immutable artifacts. Review those boundaries like any privileged cloud system:

| Boundary | Review question |
|---|---|
| Dashboard to management API | Is it loopback/private by default, and what changes when multiple users are introduced? |
| Management API to worker | Does the worker receive a secret reference or a raw token in process arguments? |
| Worker to target | Can target configuration turn the scanner into an SSRF proxy to metadata or internal control planes? |
| Target response to artifacts | Is attacker-controlled content redacted and escaped before persistence and rendering? |
| Report viewer | Can active response content execute in the dashboard’s origin? |
| Baseline storage | Can an incomplete scan overwrite accepted evidence and falsely mark findings fixed? |
| Production scan policy | Who approves destructive, high-volume or sensitive tests, and where is approval recorded? |

This case connects cloud backend architecture with product-security review: the scanner is both a security tool and a high-privilege cloud API client, so weaknesses in its own control plane can create operational or credential risk.

### 2.26 Standards crosswalk for real reviews

Use standards to organize evidence, not to generate findings solely from labels:

| Reference | Best use in this chapter |
|---|---|
| OWASP API Security Top 10 (2023) | Risk vocabulary for BOLA, broken authentication, object-property authorization, resource consumption, function authorization, sensitive business flows, SSRF, misconfiguration, inventory and unsafe API consumption. |
| OAuth 2.0 Security Best Current Practice, RFC 9700 | Current security guidance for authorization flows, redirect URIs, token replay, public clients and deprecated OAuth patterns. |
| OpenID Connect Core and Discovery | Identity-token validation, issuer discovery, endpoints and signing-key distribution. |
| RFC 9110 HTTP Semantics | Method, status, representation, caching and intermediary semantics. |
| RFC 9457 Problem Details for HTTP APIs | Consistent machine-readable error responses without inventing incompatible formats. |
| NIST SP 800-53 | Control objectives for access, identity, audit, communications, configuration and incident response. |

A scanner finding should name the violated invariant and evidence first. Framework mappings come afterward. “OWASP API1” is not proof that BOLA occurred; the two-principal owned-object test is the proof.

## 3. Authentication and sessions

Authentication answers “who is calling?” Common mechanisms include:

- session cookies for browser applications;
- OAuth 2.0 access tokens for delegated API access;
- OpenID Connect identity tokens during login;
- mutual TLS for tightly managed service identities;
- signed workload identity tokens for service-to-service calls;
- API keys for identifying a calling application, usually with limited assurance.

Do not treat decoding a JSON Web Token as validation. A service must verify the signature using an approved algorithm and trusted key, then check issuer, audience, expiration and any required claims. Do not let untrusted `jku` or `x5u` headers choose an arbitrary key URL or accept an inline `jwk` merely because the token supplies it. Treat `kid` only as a constrained identifier into keys from the configured issuer; never concatenate it into filesystem paths, database queries or URLs. Configure trusted issuers and discovery endpoints explicitly, restrict key retrieval to those origins, and cache keys with safe rotation and failure behavior.

Browser session cookies should normally be `Secure`, `HttpOnly` and appropriately `SameSite`. State-changing browser requests need protection against cross-site request forgery when cookies are sent automatically.

Never place credentials in URL query strings. URLs are commonly stored in browser history, proxy logs and monitoring systems. Use authorization headers or secure cookies, and prevent sensitive headers from being written to logs.

## 4. Authorization: the most important API control

Authentication is not authorization. A valid user can still request another user’s data. This is the basis of broken object-level authorization, one of the most common API failures.

Suppose the request is:

```text
GET /v1/tenants/acme/conversations/987
```

The application must not trust `acme` merely because it appears in the path. It should derive the caller’s allowed tenant context from verified identity and policy, fetch conversation 987 within that context, and deny the request when ownership does not match.

A robust authorization decision considers:

```text
subject + action + resource + tenant + environment + policy context
```

Use deny by default. Check authorization on every operation, including reads, exports, searches, background jobs and administrative endpoints. Hiding a button in the user interface is not authorization because an attacker can call the API directly.

For service-to-service requests, propagate only the identity and authority needed downstream. Do not pass an all-powerful internal token through the entire call chain. When a service acts on behalf of a user, preserve both the service identity and user delegation context so audit logs can distinguish the actor from the software performing the action.

## 5. Input validation

Schema validation verifies shape: types, required fields, lengths, ranges, enumerations and unknown properties. Semantic validation verifies meaning: whether an identifier exists, whether a date range makes sense, or whether a requested model is allowed for the tenant.

Use allowlists for bounded choices. Set limits on body size, file size, nesting depth, array count, string length and decompressed size. Reject ambiguous content types and duplicate fields when framework behavior could differ between security layers.

Validation does not replace safe APIs. SQL queries should use parameters, not string concatenation. Operating-system commands should be avoided or invoked without a shell using fixed executable paths and separated arguments. URLs supplied for server-side fetching require scheme, host, port, redirect and resolved-address controls to prevent server-side request forgery.

For file uploads, validate size and expected format, generate server-side names, store outside executable paths, scan or transform where appropriate, and do not assume a file extension proves content.

## 6. AI-specific request risks

AI APIs add unusually expensive and flexible inputs.

### Prompt injection

**Direct prompt injection** comes from a user who asks the model to ignore policy or reveal hidden instructions. **Indirect prompt injection** is embedded in retrieved documents, web pages, emails or tool output and crosses a dangerous data-to-instruction boundary when the model interprets that content as commands. Separate system, developer, user and retrieved-content roles where the model API supports them; clearly label or delimit external content; and tell the model how it should treat that content. These measures improve instruction hierarchy but are not security boundaries. The model must not be the final authority for access control. Tools need deterministic authorization, constrained parameters and limited credentials.

### Unbounded cost

Large prompts, high output limits, repeated retries and expensive models can exhaust GPU capacity or create large bills. Enforce per-request limits, tenant budgets, concurrency caps, timeouts and cancellation. Measure cost in units meaningful to the backend, such as tokens, image resolution, audio duration or GPU seconds.

### Sensitive data leakage

Prompts and responses may contain personal, proprietary or regulated data. Minimize collection, define retention, redact logs, restrict provider usage, and authorize access to conversation history. Do not return internal system prompts, credentials, stack traces or hidden retrieval context.

### Model and parameter selection

If callers may choose arbitrary model identifiers, tool names or adapter paths, they may reach unapproved capabilities or load unsafe artifacts. Map public choices to server-controlled configurations and authorize them per tenant.

### Streaming responses

Server-sent events and streaming RPCs consume connections for longer periods. Authenticate before streaming, apply duration and byte limits, detect disconnects, cancel upstream inference and ensure partial output still passes applicable safety controls.

## 7. Rate limits, quotas and backpressure

Rate limiting restricts how quickly a caller may make requests. A quota restricts total usage during a period. Concurrency limits restrict simultaneous work. These controls serve different purposes.

A token bucket stores a number of permits. Permits refill at a fixed rate. Each operation consumes permits, potentially weighted by estimated cost. This allows short bursts without accepting unlimited sustained traffic.

Apply limits at more than one level:

- by source for obvious network abuse;
- by authenticated user;
- by tenant or organization;
- by API key or workload identity;
- globally to protect a dependency;
- by expensive operation or model.

AI services normally need multiple limit dimensions. Requests per minute controls call frequency. Tokens per minute reserves capacity based on input tokens plus a bounded output allowance. Concurrency slots limit active generations or streams. A tenant must satisfy all relevant dimensions because one very large generation can consume more capacity than many small requests.

Return `429 Too Many Requests` when a caller exceeds an intentional limit and include a safe retry hint where useful. Do not blindly retry downstream failures: coordinated retries can amplify an outage. Use bounded exponential backoff with jitter, deadlines and circuit breakers.

## 8. Error handling and versioning

Clients need useful errors, but attackers should not receive internals. Return stable error codes and correlation identifiers. Keep stack traces, database details, secret values and policy internals in protected diagnostics.

Use appropriate status codes: `400` for malformed input, `401` when authentication is absent or invalid, `403` when an authenticated caller lacks permission, `404` when resource hiding is intentional, `409` for state conflicts and `429` for rate limits.

API evolution is also a security problem. Old versions may retain vulnerable behavior. Inventory versions, publish deprecation dates, observe remaining callers and remove obsolete endpoints. Never weaken authorization merely to preserve a broken legacy client.

## 9. Secrets, webhooks and callbacks

An API that calls another service needs a secret or workload identity. Store secrets in a managed secret system, grant retrieval only to the workload identity, rotate them and avoid exposing them to model context.

Webhooks reverse the direction: your service sends events to a customer endpoint, or receives events from a provider. Sign webhook messages over the raw body, timestamp and event identifier. The receiver verifies the signature, rejects stale timestamps and records event IDs to prevent replay. If accepting callback URLs, defend against SSRF and restrict changes to authorized administrators.

## 10. API gateway versus service responsibilities

An API gateway is valuable for TLS, token validation, routing, coarse policy, request limits, rate limits and access logs. It is not a substitute for application security.

| Gateway can usually enforce | Owning service must usually enforce |
|---|---|
| Valid token issuer and audience | Resource ownership and tenant membership |
| Maximum request size | Business-state transitions |
| Route-level scope | Field-level authorization |
| General rate limits | Cost-aware operation limits |
| Protocol normalization | Tool and model authorization |

Defense in depth means both layers validate what they can authoritatively know. It does not mean copying inconsistent authorization logic everywhere.

## 11. Testing an API security boundary

Build tests from invariants, not only from expected success cases.

### Authorization matrix

For every resource operation, test the owner, another user in the same tenant, a user in another tenant, a disabled user, an expired token, a service identity and an administrator. Include list and search endpoints, where filtering mistakes often leak data.

### Input and protocol tests

Test missing fields, unknown fields, boundary values, oversized bodies, invalid encodings, duplicate fields, unsupported content types, malformed tokens and unexpected methods. Use property-based testing or schema-aware fuzzing to explore combinations humans do not anticipate.

### Resource-exhaustion tests

Test concurrency limits, cancellation, client disconnects, slow uploads, large prompts, decompression, downstream timeouts and retry behavior. Confirm one tenant cannot consume the entire shared inference pool.

### Logging tests

Submit synthetic secrets and personal data, then verify they do not appear in ordinary logs. Confirm each authorization denial and privileged action produces a useful, correlated audit event.

## 12. Reference pseudocode

```python
def create_summary(request, identity, services):
    body = validate_schema(
        request.json,
        required={"document_id", "max_output_tokens"},
        limits={"max_output_tokens": (1, 2000)},
        reject_unknown=True,
    )

    tenant = services.membership.require_active_tenant(identity)
    document = services.documents.get_for_tenant(
        tenant_id=tenant.id,
        document_id=body["document_id"],
    )
    services.policy.require(
        subject=identity,
        action="summary:create",
        resource=document,
    )

    reservation = services.capacity.reserve(
        tenant_id=tenant.id,
        user_id=identity.subject,
        estimated_cost=estimate_cost(
            document=document,
            max_output_tokens=body["max_output_tokens"],
        ),
        concurrency_slots=1,
    )

    audit_outcome = "error"
    audit_detail = None
    try:
        result = services.model.summarize(
            content=document.content,
            max_output_tokens=body["max_output_tokens"],
            allowed_tools=[],
            deadline_seconds=20,
        )
        checked = services.output_policy.inspect(
            result,
            checks={"secrets", "sensitive_data", "policy_violation"},
        )
        services.capacity.settle(reservation, actual_cost=result.usage)
        audit_outcome = "allowed"
    except PolicyViolation as exc:
        services.capacity.release(reservation)
        audit_outcome = "denied"
        audit_detail = exc.rule_id
        raise safe_policy_error()
    except Exception as exc:
        services.capacity.release(reservation)
        audit_detail = type(exc).__name__
        raise safe_service_error()
    finally:
        services.audit.record(
            actor=identity.subject,
            tenant=tenant.id,
            action="summary:create",
            resource=document.id,
            correlation_id=request.correlation_id,
            outcome=audit_outcome,
            detail=audit_detail,
        )
    return safe_response(checked)
```

Notice the ordering: validate, establish tenant context, load through a tenant-scoped query, authorize the action, reserve capacity, constrain model execution, inspect output, settle actual cost and write an audit event. Production code also needs transactional behavior so reservations, audit events and stored results remain consistent during cancellation and partial failure.

## 13. Incident scenarios

### Cross-tenant object access

Contain by disabling the affected route or adding a narrow policy block. Preserve access logs and authorization decisions. Determine which object identifiers were exposed and whether they were accessed. Fix the query and authorization design, not only the reported ID. Add matrix tests across every similar endpoint and assess notification duties.

### Leaked API key

Revoke or rotate the key, identify its permissions, search for use from unusual sources, invalidate derived sessions and inspect where the key leaked. Replace static keys with short-lived identity where possible.

### Cost-exhaustion attack

Apply emergency tenant and global limits, shed low-priority work and stop orphaned inference. Identify the responsible identity and request pattern. Add cost-weighted quotas, concurrency isolation and alerts tied to usage velocity rather than only monthly spend.

## Practical exercise

Design a `/v1/chat` API for multiple business tenants. Write its request schema, identity claims, authorization rule, rate-limit dimensions, maximum prompt and response sizes, allowed model list, log fields and error format. Then create ten negative tests, including cross-tenant access, an expired token, an oversized prompt, repeated streaming connections and an attempt to select an internal model.

## Interview preparation

### Q1: What is the difference between authentication and authorization?

**Model answer:** Authentication establishes the caller’s identity. Authorization decides whether that identity may perform a specific action on a specific resource under current conditions. A valid token does not grant access to every object, so resource-level authorization is required on every operation.

### Q2: Why is a gateway not enough to secure an API?

**Model answer:** A gateway knows protocol and token information, but often lacks authoritative business data such as resource ownership, tenant membership or workflow state. It should reject invalid traffic and enforce coarse policy, while the owning service performs current resource-level authorization and semantic validation.

### Q3: How do you protect an AI API from denial of wallet?

**Model answer:** I combine request-size and token limits, authenticated per-user and per-tenant rate limits, cost-weighted quotas, concurrency caps, deadlines, cancellation, bounded retries, global dependency protection and budget alerts. I isolate tenants so one caller cannot consume all GPU capacity.

### Q4: How do you prevent prompt injection from becoming an API authorization failure?

**Model answer:** I treat model output as untrusted. The application, not the model, authorizes every tool call against the user, tenant, action and resource. Tools expose narrow schemas, use limited credentials and validate parameters. The model can propose an action but cannot grant itself authority.

## Chapter summary

Secure APIs verify identity, authorize every resource operation, validate bounded input, limit expensive work, handle failure safely and produce useful evidence. AI APIs add prompt injection, tool use, sensitive conversational data, streaming and GPU cost, but the core principle remains simple: no untrusted field or model decision may silently become authority.

## Further study

- Chapter 4 for secure application delivery.
- Chapter 6 for identity and authorization architecture.
- Chapters 8 and 9 for agents, tools, prompt injection and RAG.
- Chapter 18 for abuse monitoring.
- Chapter 20 for multi-tenant inference isolation.
- Appendix D for API fuzzing and automated testing examples.
- OWASP API Security Top 10, 2023 edition: `https://owasp.org/API-Security/editions/2023/en/0x11-t10/`.
- OAuth 2.0 Security Best Current Practice, RFC 9700: `https://www.rfc-editor.org/rfc/rfc9700.html`.
- HTTP Semantics, RFC 9110, and Problem Details for HTTP APIs, RFC 9457.
