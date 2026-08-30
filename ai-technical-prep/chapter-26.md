# Chapter 26: API security for AI applications

> **Part:** Part VII — Security Foundations for AI Platforms
> **Market evidence:** API design (4.6%), Application security (10.4%), Identity & access management (11.6%), Testing & automation (2.9%); 681-posting aggregate; 131 securing-AI roles, 2026-08-25
> **Reader status:** Beginner path; no prior API or web-security knowledge assumed
> **Why this chapter exists:** APIs are the doors through which users, services and agents reach AI capabilities. Appendix D provides a testing reference, but a secure engineer also needs a complete mental model of HTTP, authentication, authorization, input validation, resource exhaustion, tenant isolation and operational verification.

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

## 3. Authentication and sessions

Authentication answers “who is calling?” Common mechanisms include:

- session cookies for browser applications;
- OAuth 2.0 access tokens for delegated API access;
- OpenID Connect identity tokens during login;
- mutual TLS for tightly managed service identities;
- signed workload identity tokens for service-to-service calls;
- API keys for identifying a calling application, usually with limited assurance.

Do not treat decoding a JSON Web Token as validation. A service must verify the signature using an approved algorithm and trusted key, then check issuer, audience, expiration and any required claims. Do not let untrusted `jku` or `x5u` token headers choose an arbitrary key URL: configure trusted issuers and discovery endpoints explicitly, restrict any key retrieval to those origins, and cache keys with safe rotation and failure behavior.

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
        estimated_cost=estimate_cost(body),
        concurrency_slots=1,
    )

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
    except Exception:
        services.capacity.release(reservation)
        raise safe_service_error()

    services.audit.record(
        actor=identity.subject,
        tenant=tenant.id,
        action="summary:create",
        resource=document.id,
        model_version=result.model_version,
        outcome="allowed",
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
