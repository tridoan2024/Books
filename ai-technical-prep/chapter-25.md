# Chapter 25: Cloud security foundations for AI engineers

> **Part:** Part VII — Security Foundations for AI Platforms
> **Market evidence:** AWS (24.5%), GCP (17.0%), Azure (16.6%), Identity & access management (11.6%), Terraform / IaC (10.7%); 681-posting aggregate; 131 securing-AI roles, 2026-08-25
> **Reader status:** Beginner path; no prior cloud knowledge assumed
> **Why this chapter exists:** Chapter 15 teaches advanced multi-cloud architecture, but a new reader first needs a mental model of what a cloud is, who secures which layer, how identity and networks replace the walls of a physical data center, and how to verify that controls actually work. This chapter builds that foundation using an AI inference service as the running example.

---

## Learning objectives

By the end of this chapter, you should be able to:

1. Explain accounts, projects, subscriptions, regions, availability zones, virtual networks, identities, policies, storage, compute and managed services.
2. Apply the cloud shared-responsibility model without using it as an excuse for unclear ownership.
3. Design a small AI service with least privilege, private networking, encryption, logging and recoverable configuration.
4. Recognize common cloud attack paths and describe preventive, detective and recovery controls.
5. Review a cloud design using security invariants and evidence rather than screenshots or assumptions.
6. Review an automated cloud API security report and separate a confirmed vulnerability from an execution error, missing prerequisite, duplicated deployment finding or low-value hardening observation.
7. Give a cloud development team feedback that identifies the responsible layer, required evidence, risk decision and verifiable remediation outcome.

## 1. What “the cloud” means

Cloud computing is the rental of computing capabilities through APIs. Instead of buying a physical server, installing it in a data center and connecting cables, an engineer sends an authenticated API request such as “create a virtual machine,” “store this object,” or “run this container.” The provider operates the physical buildings, power, disks, networking equipment and much of the virtualization layer. The customer still decides who may create resources, which networks may communicate, what data is stored, which code runs and how incidents are detected.

The most important beginner insight is that the cloud is not automatically secure or insecure. It is a large programmable system. A configuration is part of the security boundary just as surely as a lock, firewall or operating-system permission.

The three major providers use different names for similar organizational containers:

| Concept | AWS | Google Cloud | Microsoft Azure |
|---|---|---|---|
| Top-level resource boundary | Account | Project | Subscription |
| Identity system | IAM | Cloud IAM | Microsoft Entra ID and Azure RBAC |
| Virtual network | VPC | VPC | Virtual Network (VNet) |
| Object storage | S3 | Cloud Storage | Blob Storage |
| Key management | KMS | Cloud KMS | Key Vault / Managed HSM |
| Audit activity | CloudTrail | Cloud Audit Logs | Activity Log for control-plane events; Diagnostic Settings and resource logs for data-plane activity |

Names differ, but the security questions remain stable: who is calling, what are they allowed to do, from where, to which resource, under what conditions, and where is the evidence recorded?

## 2. The control plane and the data plane

Cloud systems have two broad planes.

- The **control plane** creates and configures resources. Examples include changing an IAM policy, creating a database or disabling public-access protection.
- The **data plane** performs the resource’s intended work. Examples include reading an object, querying a database or submitting a prompt to a model endpoint.

This distinction matters during threat modelling. An attacker with data-plane read access might steal one dataset. An attacker with control-plane authority might grant themselves permanent access, disable logs, copy every dataset and create expensive GPU resources. Control-plane privileges therefore deserve especially strong authentication, short-lived sessions, separation of duties and independent audit trails.

## 3. Shared responsibility, stated precisely

The provider normally secures the facilities, physical hardware and core managed-service implementation. The customer normally secures identities, data classification, resource configuration, application code and access policy. The exact boundary changes by service type:

- With a virtual machine, the customer patches the guest operating system and application.
- With a managed container platform, the provider may patch the control plane while the customer secures images, workloads, identities and network policy.
- With a managed model API, the provider runs model-serving infrastructure while the customer controls tenant authorization, submitted data, retention settings, keys, application behavior and monitoring.

Write ownership down. “The provider handles security” and “the platform team owns it” are not testable statements. A useful responsibility record names the control, owner, implementation, evidence, review frequency and failure response.

## 4. Identity is the primary perimeter

An identity is a named actor. It may represent a person, application, virtual machine, container or automation job. Authentication proves which identity is calling. Authorization decides what that identity may do.

Cloud authorization is usually policy based. A policy can be understood as a decision function:

```text
decision = evaluate(principal, action, resource, conditions, policy)
```

For example: permit the production inference workload to read model version 42 from one storage path only when the request comes through the approved private endpoint and uses an encrypted transport.

Use these rules:

1. Give people individual identities; never share administrator accounts.
2. Require phishing-resistant multifactor authentication for privileged access.
3. Give workloads machine identities instead of embedding passwords or access keys.
4. Prefer short-lived credentials issued after authentication.
5. Scope permissions to necessary actions and resources.
6. Separate production administration from ordinary development.
7. Make emergency access rare, monitored, time limited and reviewable.

### Long-lived key versus workload identity

A long-lived cloud key copied into a configuration file remains useful until rotated or revoked. It may leak through source control, logs, container images or backups. A workload identity instead allows the runtime to request a short-lived credential based on its verified environment and assigned role. The credential expires automatically and does not need to be stored in the application.

One common mechanism is OpenID Connect federation. A runtime receives a signed, short-lived identity token containing claims such as issuer, audience and workload subject. A cloud Security Token Service validates those claims against a configured trust policy and exchanges the token for temporary cloud credentials. The trust policy must tightly match the expected repository, cluster namespace, service account and audience; broad subject wildcards can turn federation into cross-workload privilege escalation.

Least privilege is not “make the policy short.” It means the allowed actions, resources, conditions and duration match the workload’s real job. A policy that permits `ReadObject` on every bucket is broad even if it contains one line.

## 5. Network security without mystery

A cloud virtual network is a logically isolated address space. Subnets divide it into smaller routing zones. Route tables decide where packets can go. Security groups or firewall rules decide which flows are allowed. Gateways and load balancers connect networks and services.

A common secure pattern for an AI API is:

```text
Internet
   |
[DDoS protection / web application firewall]
   |
[API gateway or load balancer]
   |
[Private application subnet]
   |
[Private model-serving subnet] ---- [Private model storage endpoint]
   |
[Private database endpoint]
```

Only the public entry component accepts internet traffic. Model servers, databases and storage do not need public addresses. Access to managed services may still use public service endpoints, provider backbones or NAT unless private connectivity is explicitly configured. AWS VPC endpoints and PrivateLink, Google Private Service Connect or private Google access patterns, and Azure Private Endpoints let workloads reach supported managed services through controlled private addressing. Their DNS, routing and service-policy configuration must also be verified. Private networking reduces exposure, but it does not replace identity checks: an attacker may already be inside the network, and cloud networks change frequently.

Control outbound traffic as carefully as inbound traffic. An exploited model tool or application server may try to send secrets to the internet. Route outbound connections through controlled gateways or proxies, restrict destinations, and log connection metadata.

## 6. Protecting data and keys

Data has states:

- **At rest:** stored in disks, databases, object storage, snapshots or backups.
- **In transit:** moving between clients and services.
- **In use:** present in memory while being processed.

TLS protects data in transit. Storage encryption protects media and snapshots at rest. Neither control decides whether the caller should receive plaintext. Authorization remains essential.

Envelope encryption is common in cloud systems. A data-encryption key encrypts the object. A key-encryption key managed by a KMS encrypts the data key. The encrypted object and encrypted data key can be stored together, while use of the KMS key is separately authorized and logged. This makes key access an observable security boundary.

Protecting data in use is harder because ordinary software must see plaintext while processing it. Confidential-computing systems use trusted execution environments and attestation to reduce exposure to a host or cloud administrator. Examples include AMD SEV-SNP, Intel TDX and confidential-computing modes on supported accelerators. These controls have workload, performance, debugging and availability constraints, and they do not fix application-level authorization or a compromised process inside the trusted environment. Use them when the threat model requires stronger protection of memory during training or inference.

Separate key administration from data administration where risk justifies it. A storage administrator should not automatically be able to decrypt highly sensitive model weights, and a key administrator should not automatically be able to read the data.

Backups also contain sensitive data. Encrypt them, restrict restore permission, test restoration and protect critical backups from easy deletion. Availability is a security property when the system supports health care, finance or other important operations.

## 7. Logging and evidence

Logs answer who did what, when, from where, to which resource and with what result. Enable control-plane audit logs centrally and protect them from alteration by the same administrators they monitor. Also collect identity events, network flow records, storage access, key use, application authentication decisions and model-service activity.

Avoid logging secrets, access tokens, full prompts or sensitive responses by default. Record identifiers, policy outcomes, model versions, request sizes, latency, token counts and safety decisions. Store sensitive payload evidence only when a defined investigation or regulatory need justifies it.

A control is incomplete until it can be verified. Examples of useful evidence include:

- a policy test proving public storage is denied;
- an inventory query listing internet-exposed resources;
- an audit event showing a workload assumed the expected role;
- a restoration test showing a backup is usable;
- an alert test showing unauthorized key use reaches the incident queue.

## 8. Secure landing zones

A landing zone is a governed starting environment for cloud workloads. It normally defines organization structure, separate environments, centralized logs, baseline identity controls, approved network connections, key ownership, security services and policy guardrails.

Keep development, testing and production in separate accounts, projects or subscriptions when practical. This limits accidental changes and makes policy easier to reason about. Place security logs in a separately administered location. Apply organization-level policies that deny dangerous configurations such as disabling audit logs or creating public storage.

Use infrastructure as code so important configuration is reviewed, repeatable and testable. The code repository is not proof that deployed reality matches it, so combine pre-deployment tests with continuous inventory and drift detection.

## 9. Running example: a secure document-summary service

Assume a company uploads confidential documents and receives AI-generated summaries.

### Assets

- uploaded documents;
- prompts and summaries;
- model credentials and configuration;
- tenant identities and authorization records;
- audit evidence.

### Basic design

1. A user authenticates through the company identity provider.
2. An API gateway validates the token, limits request size and enforces rate limits.
3. The application checks that the user may access the named tenant and document.
4. The document is stored in a private encrypted bucket under a tenant-specific path.
5. A processing workload obtains a short-lived workload identity.
6. The workload retrieves only the authorized document and calls a private model endpoint.
7. The result is stored with tenant ownership metadata.
8. Audit events record the identities, object identifiers, model version and authorization decisions.

### Security invariants

- No storage object or model endpoint is public.
- A workload can access only its required storage paths and keys.
- Tenant identity comes from verified authorization context, never only from a user-supplied request field.
- Production changes are made through reviewed automation except for monitored emergencies.
- Security logs are copied to a separately controlled account or project.
- Every critical backup has a tested restoration procedure.

## 10. Common attack paths and defenses

### Public storage exposure

**Cause:** a permissive policy, access-control list or public website setting.

**Prevention:** organization-level public-access blocks, policy-as-code checks, private endpoints and least-privilege resource policies.

**Detection:** continuous inventory, external exposure scanning and alerts on policy changes.

**Recovery:** block access, preserve logs, determine what was readable and whether it was accessed, rotate affected secrets, notify required parties and add a regression test.

### Stolen administrator session

**Cause:** phishing, malware or weak authentication.

**Prevention:** phishing-resistant MFA, managed devices, short sessions, separate privileged accounts and just-in-time elevation.

**Detection:** unusual login context, impossible travel, privilege changes and disabling of security controls.

**Recovery:** revoke sessions, disable the identity, inspect persistence changes, restore known-good policies and rotate exposed credentials.

### Server-side request forgery to metadata services

**Cause:** an application fetches an attacker-controlled URL, allowing requests to a cloud metadata endpoint.

**Prevention:** strict destination allowlists, redirect and DNS-rebinding checks, outbound proxying, metadata-service hardening and workload identities with narrow permissions. On AWS, require IMDSv2, disable IMDSv1 and set an appropriate response hop limit; a hop limit of one is useful defense-in-depth for many container topologies but must be tested because networking implementations differ. On Google Cloud, protect metadata access and require the expected `Metadata-Flavor` header. Platform controls supplement rather than replace application SSRF defenses.

**Detection:** unexpected metadata access and unusual credential use.

### Excessive workload permissions

**Cause:** broad managed roles are convenient during development and remain in production.

**Prevention:** design permissions from observed actions, scope resources, use conditions and expire temporary grants.

**Detection:** access analysis, unused-permission reports and attempts to call unrelated services.

### Destructive compromise

**Cause:** an attacker obtains control-plane access and deletes services, keys or backups.

**Prevention:** separation of duties, protected recovery identities, immutable or deletion-protected backups and approval for destructive actions.

**Recovery:** practice rebuilding from infrastructure code and restoring data without relying on the compromised identity path.

## 11. A beginner’s cloud security review checklist

For each workload, ask:

1. What data and services are most valuable?
2. Which identities can administer, read, write, decrypt or delete them?
3. Are credentials short lived and permissions narrow?
4. Which resources are reachable from the internet?
5. Which outbound destinations can the workload reach?
6. Where are data and backups stored, and which keys protect them?
7. Which events are logged, and can an attacker erase those logs?
8. How are changes reviewed, tested and detected after deployment?
9. How are vulnerabilities patched?
10. How can the service be contained and restored?

## 12. Sr. Staff playbook: reviewing cloud API security scan findings

Automated scanners are evidence-producing systems, not automated security authorities. A scanner sends requests, observes responses and applies an **oracle**: a rule that decides whether the observed behavior satisfies a security expectation. Your job as the reviewer is to decide whether the request was valid, the target was reached, the necessary identity and fixture existed, the oracle was appropriate, the evidence supports the claim, and the proposed remediation belongs to the correct engineering layer.

This distinction is essential. A report may label a test `CRITICAL`, but if the request failed during TLS certificate validation and never reached the API, the scan has not proved that authentication is missing. Conversely, a successful `200` response is not automatically a vulnerability: it may be a public health endpoint, a web application fallback page, a gateway-generated error document or a correctly authorized response.

### 12.1 First understand the cloud API request path

An external API request rarely goes directly to application code. It commonly crosses several independently configured components:

```text
Scanner vantage point
    |
    | DNS lookup
    v
Public or private DNS
    |
    | TLS handshake and certificate validation
    v
CDN / DDoS protection / web application firewall
    |
    | host, path, method and policy routing
    v
API gateway / ingress / load balancer
    |
    | token validation, throttling, request transformation
    v
Application service
    |
    | resource authorization and business rules
    v
Database, message bus, storage or downstream APIs
```

Every layer can accept, reject, modify or redirect the request. Before assigning a finding, identify which layer produced the evidence.

| Observation | Possible source | What to verify |
|---|---|---|
| DNS failure | resolver, split-horizon DNS, missing private zone | scanner network, expected hostname and private DNS linkage |
| Certificate error | certificate chain, hostname, trust store, TLS interception | leaf and intermediate chain, SNI, intended trust anchor and scanner vantage |
| `403` HTML response | WAF, CDN, gateway or application | response headers, body fingerprint, request ID and corresponding platform logs |
| `401` JSON response | gateway or application authentication middleware | `WWW-Authenticate`, issuer/audience policy and gateway/application logs |
| `404` | gateway route, application route or intentional resource hiding | route table, OpenAPI operation, host/path rewrite and authenticated control request |
| `200 text/html` from an API path | single-page application fallback, WAF challenge or proxy page | content type, body markers, route behavior and expected API schema |
| `200 application/json` | public response or successful protected operation | schema, authenticated identity, tenant/resource ownership and sensitive fields |
| `429` | gateway, WAF or application limiter | limit key, policy threshold, scope, reset behavior and bypass paths |

Do not tell a development team simply that “the API returned 403.” Tell them which component likely generated it and what evidence would prove that attribution.

### 12.2 Record the scanner’s vantage point

The **vantage point** is the network and identity location from which the scanner operates. Results can change depending on whether the scanner runs from a developer laptop, corporate VPN, cloud virtual network, Kubernetes cluster, internet worker or privileged internal subnet.

Record at least:

- source environment and egress IP;
- DNS resolvers and private-zone access;
- proxy or TLS-inspection path;
- network route to the target;
- whether the target is public, private or available only through a gateway;
- environment and deployment being scanned;
- time window and relevant change version.

An unreachable private API from an internet scanner does not prove the API is secure. It proves only that this vantage could not reach it. That may be a successful network-control observation, an expected limitation or a scanner configuration error. The report should use language such as “not reachable from external vantage” rather than “all API tests passed.”

### 12.3 Use an outcome state machine

Reliable scanners need more than pass and fail.

| Outcome | Meaning | Reviewer interpretation |
|---|---|---|
| `PASS` | The test ran, the oracle executed and the expected security behavior was observed. | Positive evidence for this operation, identity, fixture and vantage only. |
| `FAIL` | The test ran, the oracle executed and a security expectation was violated. | Candidate finding; validate exploitability, affected scope and evidence quality. |
| `ERROR` | The tool could not complete execution because of DNS, TLS, timeout, parser, authentication-provider or other infrastructure failure. | No security conclusion. Fix execution or target availability and retest. |
| `INCONCLUSIVE` | Execution occurred, but prerequisites or evidence were insufficient or ambiguous. | Coverage gap. Supply the missing identity, object, contract or semantic oracle. |
| `SKIPPED` | Policy, safety mode or scope intentionally excluded the test. | Declared noncoverage; decide whether the exclusion is acceptable. |

Never convert `ERROR` into `FAIL` merely because the criterion would be severe if violated. Severity describes the potential impact of a proven weakness; it does not describe tool frustration. Never convert `ERROR` into `PASS` because a weak TLS handshake failed when the modern control handshake also failed.

For every result, expect these evidence fields:

```text
target + vantage + operation + request identity + request count
+ response classification + oracle executed + evidence state
+ outcome + limitation + timestamp + scanner version
```

If a report has many `INCONCLUSIVE` and `ERROR` outcomes, lead the review with coverage and scanner readiness. A small number of findings must not distract from the larger fact that important controls may not have been tested.

### 12.4 Validate reachability and TLS before application findings

Use a staged connectivity model:

1. Resolve the intended hostname.
2. Establish TCP connectivity.
3. Perform a modern TLS control handshake with certificate and hostname validation enabled.
4. Send a harmless known request and classify the responding component.
5. Only then execute application security tests.

If step 3 fails, downstream authentication, authorization and injection tests normally become `ERROR`, not findings. The remediation may belong to certificate deployment, private PKI distribution, proxy configuration, DNS/SNI alignment or the scanner trust store—not to application authorization middleware.

For weak TLS testing, first prove the modern control connection works. Then attempt the prohibited version or cipher separately. A protocol-specific rejection is evidence of good configuration. A generic connection failure proves nothing about whether the weak protocol is enabled.

Ask the cloud team for:

- certificate chain and expiration monitoring;
- TLS policy attached to the gateway or load balancer;
- expected SNI hostname;
- private or public trust-chain decision;
- ingress or front-door configuration evidence;
- logs showing whether the request reached the edge component.

### 12.5 Establish service inventory and deployment topology

A **logical service** is a product or API name used by teams and consumers. A **deployment** is the actual gateway, web application, function app, cluster ingress or host serving traffic. Several logical services may share one deployment and hostname.

This affects findings. If three logical services point to the same gateway and the scanner observes the same missing response header on the same route and response, the organization may have one root-cause finding with three affected service mappings—not three independent vulnerabilities.

Build a review map:

| Field | Example meaning |
|---|---|
| Logical service | messaging, clinical workflow or configuration API |
| Environment | development, QA, staging or production |
| Deployment ID | gateway, app service, cluster ingress or function application |
| Hostname | DNS name the client calls |
| Base path | route prefix owned by the service |
| Cloud account/subscription/project | administrative boundary |
| Owner | team accountable for remediation |
| Shared controls | WAF, gateway policy, identity provider, certificate and logging |

Fingerprint shared findings using deployment identity, response fingerprint, control and root cause. Preserve each affected logical service for impact reporting, but avoid sending duplicate tickets to the same platform owner.

### 12.6 Distinguish browser headers from API security controls

Security headers require context. Some protect documents rendered by browsers; they may add little or no protection to a JSON-only machine API.

| Header | Primary purpose | How to review an API finding |
|---|---|---|
| `Content-Security-Policy` | Restricts scripts, styles, frames and other browser-loaded resources. | Important for HTML applications, documentation portals and error pages containing active content. Usually not a high-severity API finding for pure JSON responses. |
| `X-Frame-Options` or CSP `frame-ancestors` | Prevents a browser page from being framed for clickjacking. | Relevant when the response renders an interactive HTML page. Little value for non-rendered JSON. |
| `Permissions-Policy` | Limits browser features such as camera or geolocation. | Relevant to browser-facing pages, not normally to service-to-service JSON APIs. |
| `Referrer-Policy` | Controls information sent in browser `Referer` headers. | Relevant if browser navigation or embedded resources could leak sensitive URL data. |
| `X-Content-Type-Options: nosniff` | Prevents some browser MIME-type sniffing. | Reasonable baseline for browser-reachable responses, but usually low severity by itself. |
| `Strict-Transport-Security` | Tells browsers to use HTTPS for future requests. | Valuable for browser clients; it does not replace TLS enforcement at the load balancer. |
| `Cache-Control` | Controls caching behavior. | Potentially important for sensitive API responses, especially PHI, tokens and user-specific content. Validate end-to-end caching, not merely header presence. |

Before accepting a header finding, ask:

1. Is the response HTML, JSON, a file or a redirect?
2. Is it consumed by a browser, native application or server workload?
3. Does the response contain sensitive data or active content?
4. Is the header set centrally at the CDN/gateway or by the application?
5. What attack becomes practical because the header is absent?
6. Is the severity proportional to that attack and business context?

A missing CSP on a static HTML administration portal can matter. The same missing header on a `204 No Content` API response should not be presented as a medium-severity API compromise. Findings should be response-class aware.

### 12.7 Review authentication evidence

Authentication tests require a known protected operation and a valid control identity. Use a comparison:

```text
valid token -> expected successful or policy-specific response
no token -> 401 or other documented authentication denial
expired token -> denial
wrong audience -> denial
invalid signature -> denial
disabled identity -> denial within the revocation objective
```

The valid control request matters. If both valid and invalid tokens receive the same WAF page, timeout or `404`, the test has not isolated token validation.

For JWT-based systems, understand:

- **issuer (`iss`)**: identity system that issued the token;
- **audience (`aud`)**: service for which the token is intended;
- **subject (`sub`)**: represented identity;
- **scope**: delegated permissions commonly used by OAuth;
- **roles/groups**: organizational or application privileges;
- **expiration (`exp`)** and not-before time (`nbf`);
- signing algorithm and trusted key set;
- token type and intended use.

The scanner must use a credential provider appropriate to the service, environment, audience and authentication flow. A token accepted by one API is not a valid control token for another. Token acquisition success also does not prove that the target API accepts the token.

Ask for gateway and application evidence showing where validation occurs. If both validate tokens, confirm their issuer, audience and clock-skew rules agree. A gateway may authenticate the caller while the application remains responsible for resource authorization.

### 12.8 Review authorization, BOLA and tenant isolation

Broken Object Level Authorization (BOLA) occurs when a caller can act on another user’s or tenant’s object by changing an identifier. A real BOLA test needs:

1. principal A and principal B;
2. an object known to belong to A;
3. a successful authenticated control request by A;
4. an attempt by B to access or modify A’s object;
5. a semantic oracle proving whether protected data or state was exposed;
6. cleanup for mutation tests.

Using an all-zero UUID or random identifier is usually not enough. A `404` may mean the object never existed, not that authorization worked. A `403` may reveal that the object exists, which can matter for sensitive identifiers. The expected behavior must be defined by the product threat model.

For multi-tenant cloud APIs, review every layer that carries tenant context:

```text
verified token claim
    -> gateway context
    -> application authorization decision
    -> tenant-scoped database query
    -> cache key
    -> message/event metadata
    -> downstream service identity
    -> audit event
```

If tenant identity can be overridden by a request header or body field, the design needs a clear rule for reconciling it with verified identity. Database queries should be tenant scoped by construction, not filtered only after broad data retrieval.

### 12.9 Review authorization at the correct layer

Cloud teams sometimes answer an application authorization finding with “the endpoint is behind the WAF” or “the subnet is private.” Those controls reduce exposure but do not prove the application enforces who may perform an action.

Use this responsibility split:

| Layer | Typical responsibility |
|---|---|
| CDN/WAF | volumetric protection, known malicious patterns, coarse IP or geography policy |
| API gateway | TLS termination, token validation, route policy, quotas and coarse scopes |
| Application | object ownership, tenant membership, business roles and workflow transitions |
| Database/data service | tenant-scoped access, row-level controls where used, integrity constraints |
| Cloud IAM | workload-to-resource permissions and administrative authority |

Controls may overlap, but each decision should have one authoritative owner. Avoid authorization designs that depend on an undocumented sequence of gateway header transformations and application assumptions.

### 12.10 Review rate limiting and resource consumption

A useful rate-limit test needs a policy. Receiving no `429` after ten requests is not automatically a vulnerability if the documented threshold is one hundred requests per minute. Receiving `429` is not automatically sufficient if attackers can rotate unauthenticated identifiers or bypass the gateway through a direct origin.

Ask:

- What resource is being protected: login attempts, requests, database writes, tokens, file bytes or downstream cost?
- What is the limit key: IP, user, device, client ID, tenant, endpoint or global capacity?
- Where is enforcement performed?
- Are limits shared consistently across replicas and regions?
- Are trusted proxies and forwarded addresses validated?
- Can a caller reach the origin without passing through the gateway?
- What happens to legitimate tenants during an attack?
- Are `Retry-After`, backpressure, queue limits and timeouts defined?

For AI APIs, include requests per minute, tokens per minute and active concurrency. For ordinary cloud APIs, expensive exports, searches, OTP sends, password resets and bulk mutations may need weighted or operation-specific limits.

### 12.11 Review cloud exposure and gateway bypass

Confirm whether the public hostname is the only route to the service. A well-configured gateway provides little protection if the backend has a public default hostname or load-balancer address that accepts direct traffic.

Evidence should include:

- public asset inventory and DNS records;
- origin network-access configuration;
- private endpoint or service-endpoint design;
- firewall/security-group rules allowing only gateway sources where supported;
- host-header and TLS certificate behavior;
- cloud resource graph or configuration export;
- an external test proving the origin cannot be reached directly.

Also test nonproduction environments. QA systems often contain production-like data, weaker identity controls and publicly reachable platform hostnames.

### 12.12 Evaluate evidence quality and confidence

Separate **severity** from **confidence**.

- Severity estimates impact and exploitability if the weakness is real.
- Confidence estimates how strongly the available evidence proves the claim.

A critical authorization scenario with no valid control identity may be high potential severity but insufficient evidence. It should be an inconclusive critical test case, not a confirmed critical vulnerability.

Use this evidence ladder:

1. **Configuration hypothesis:** a specification or header suggests possible weakness.
2. **Behavioral observation:** a request produced unexpected behavior.
3. **Controlled comparison:** valid and invalid cases isolate the security decision.
4. **Confirmed impact:** unauthorized data, action or state change is demonstrated safely.
5. **Correlated platform evidence:** gateway, application and audit logs confirm the path and affected component.

The report should state its level. Do not require confirmed harm for every finding, but do not phrase a configuration hypothesis as proven compromise.

### 12.13 Review baselines without declaring false fixes

A baseline compares current evidence with an earlier accepted scan. Finding absence does not prove remediation. The test may have become unreachable, lost authentication, changed routes or been skipped.

Useful states include:

- `new`;
- `unchanged`;
- `regressed`;
- `fixed_verified`;
- `not_retested`;
- `coverage_lost`;
- `accepted_risk`.

Declare `fixed_verified` only when the same control and operation are retested with equivalent or stronger prerequisites and the security oracle passes. Preserve immutable previous reports and record who promoted a baseline.

### 12.14 Review the scanner as a privileged cloud application

The scanner itself handles targets, tokens, sensitive responses and potentially destructive operations. Threat-model it like an administrative security platform.

Important controls include:

- bind the management interface to loopback or an authenticated private interface by default;
- require SSO/RBAC before multi-user or remote deployment;
- store tokens in a protected secret system and pass references, not raw secrets, to workers;
- never place tokens in command-line arguments, URLs, logs or reports;
- redact before persistence, not only during HTML rendering;
- allowlist target schemes and destinations to prevent the scanner becoming an SSRF proxy;
- block cloud metadata, loopback and internal control-plane destinations unless explicitly approved;
- validate scan IDs and contain artifact paths under an approved root;
- escape all target-controlled response content before rendering;
- sandbox report display and disable active content;
- use bounded concurrency, timeouts, response sizes and retry budgets;
- separate non-destructive discovery from privileged destructive tests;
- require explicit production approval and immutable audit records;
- sign or hash reports when they become decision evidence;
- protect baselines from automatic overwrite by an incomplete scan.

The scan control plane and scan worker should have different privileges. A dashboard user who may view reports should not automatically gain access to stored target credentials. A worker should receive only the secret and network access required for the current target and scan mode.

### 12.15 Turn a finding into useful cloud-team feedback

Good feedback contains six parts:

1. **Claim:** the security invariant believed to be violated.
2. **Scope:** environment, deployment, route, method, identity and affected data/action.
3. **Evidence:** sanitized request/response comparison and supporting platform logs.
4. **Confidence and limitations:** what is proven and what remains unknown.
5. **Ownership hypothesis:** gateway, application, cloud IAM, network, certificate, data or scanner team.
6. **Acceptance test:** exact behavior that will verify remediation.

Use this template:

```text
Invariant:
Only a clinician assigned to patient P may read P's clinical record.

Observed behavior:
Principal B requested the existing record owned by principal A and received
the same protected fields as principal A. Both requests reached application
deployment D through gateway G. Correlation IDs are recorded in the evidence.

Risk:
Cross-tenant disclosure of regulated health information.

Confidence:
High. Two controlled identities and a known-owned object were used. The
application audit log confirms both requests and the returned object ID.

Likely control owner:
Application authorization/data-access layer. Gateway authentication worked;
network and WAF controls do not enforce record ownership.

Requested remediation:
Derive tenant and clinician relationship from verified identity and enforce it
inside the resource query or policy service. Do not trust caller-supplied tenant.

Verification:
A remains able to read the record; B receives the documented denial without
protected fields; list/search/cache paths receive the same negative tests.
```

For an inconclusive scanner result, give different feedback:

```text
The scan did not establish a vulnerability. The authorization test lacked a
second controlled principal and a known-owned object, so the result is a
coverage gap. Please help define two QA identities, safe object fixtures and
the expected denial behavior. Security will rerun the test before assigning
product risk.
```

This language protects credibility. It also makes development teams more willing to help improve fixtures because the scanner does not treat missing evidence as guilt.

### 12.16 A practical report-review sequence

Review each scan in this order:

1. Confirm target, environment, deployment and scanner vantage.
2. Confirm DNS, TCP and modern TLS control connectivity.
3. Confirm the API inventory and operation count are current.
4. Confirm authentication provider, audience, scopes and valid control request.
5. Read outcome counts before reading severity counts.
6. Treat `ERROR`, `INCONCLUSIVE` and `SKIPPED` as coverage work, not vulnerabilities.
7. Classify responses semantically: gateway, WAF, SPA, JSON API, download or unknown.
8. Validate each `FAIL` against its prerequisites and oracle.
9. Correlate duplicate findings by deployment and root cause.
10. Adjust severity for response type, data sensitivity, privilege, reachability and demonstrated impact.
11. Assign the responsible layer and owner.
12. Define a reproducible acceptance test and retest conditions.
13. Compare with the baseline only when coverage is equivalent.
14. Summarize residual risk and unresolved coverage for leadership.

### 12.17 Sr. Staff design-review questions for the scanner team

Use these questions when reviewing the scanner architecture:

- Which claims can the current scanner prove, and which are only hypotheses?
- Can every `PASS` prove that at least one request ran and its oracle executed?
- Can transport failures ever create findings or passes?
- How are WAF pages, SPA fallbacks and API JSON distinguished?
- How is the correct authentication provider selected by service, environment and audience?
- How are multi-identity fixtures provisioned and cleaned up?
- Can scan criteria contain wildcard routes, unresolved placeholders or zero-step tests?
- Does every finding retain sanitized evidence, confidence and limitation fields?
- How are shared deployments represented so findings are not multiplied misleadingly?
- Can an incomplete scan mark a baseline finding fixed?
- Are secrets redacted before every persistence boundary?
- Can a user use the scanner to reach metadata services or arbitrary internal hosts?
- What production approval prevents destructive or high-volume tests?
- Are reports immutable and attributable to scanner, criteria, inventory and configuration versions?
- What benchmark corpus contains known secure and vulnerable behaviors for measuring false positives and false negatives?

### 12.18 What the current scan pattern should teach you

Consider a correctness-preview batch in which each service plans 25 quick tests, many results are `INCONCLUSIVE`, some are `ERROR`, and the confirmed findings are mostly repeated browser security headers. A defensible Sr. Staff conclusion is not “the APIs are secure” and not “the cloud team has many vulnerabilities.” It is:

1. The engine is beginning to represent uncertainty honestly.
2. Reachability, identity and service-specific fixtures remain the main coverage constraints.
3. The few confirmed header observations need response-type and deployment-level correlation before prioritization.
4. High-impact API risks such as BOLA, function-level authorization, sensitive-data exposure and business-flow abuse are not cleared unless their prerequisites and semantic oracles executed.
5. The next investment should improve trustworthy coverage and evidence, not inflate finding counts.

That is Staff-level security judgement: distinguish product risk from measurement-system risk, then improve both in the correct order.

## Practical exercise

Complete both exercises:

1. Draw the document-summary architecture. Mark every trust boundary, identity, data store, network path and administrative path. Create a table with invariant, preventive control, detective evidence, owner and recovery action. Map each control to AWS, GCP or Azure only after the invariant is clear.
2. Take one real API scan report and build a review worksheet with: outcome, target/vantage, responding layer, prerequisites, oracle, evidence level, confidence, business impact, duplicate deployment key, control owner, remediation request and acceptance test. Write separate summaries for the cloud team and security leadership.

## Interview preparation

### Q1: What is the cloud shared-responsibility model?

**Model answer:** The provider and customer secure different layers, and the boundary depends on the service. The provider usually secures facilities, hardware and the managed platform. The customer still owns identity, data, configuration, application authorization and monitoring. I turn that general model into a control-level ownership table so no requirement is left between teams.

### Q2: Why is identity called the new perimeter?

**Model answer:** Cloud resources are created through APIs, workloads move and many services have no meaningful physical perimeter controlled by the customer. Every important request therefore depends on a verified identity and authorization decision. Networks still reduce exposure, but identity controls what a caller may actually do.

### Q3: Does encryption prevent a storage administrator from reading data?

**Model answer:** Not automatically. If the same identity can read the encrypted object and ask KMS to decrypt its data key, encryption does not stop that administrator. Separation requires distinct permissions, key policy, logging and often separate administrative roles.

### Q4: Design the first security controls for a new AI service.

**Model answer:** I would identify assets and tenants, separate environments, use centralized human identity and short-lived workload identity, expose only an authenticated gateway, keep storage and model endpoints private, encrypt data with controlled keys, establish application-level tenant authorization, enable protected audit logs, deploy through tested infrastructure as code and prove backup restoration and incident containment before launch.

### Q5: A scanner reports critical missing authentication, but its evidence shows a TLS certificate error and status code zero. Is this a vulnerability?

**Model answer:** No authentication conclusion is supported because the request did not reach the authentication boundary. I would classify it as an execution error, investigate the target hostname, certificate chain, scanner trust store, SNI and network vantage, and retest. The authentication criterion may have critical potential severity, but it is not a confirmed critical finding until a valid control request reaches the service and the negative request demonstrates an authentication failure.

### Q6: Three service reports contain the same missing CSP finding on one shared hostname. How do you handle it?

**Model answer:** I determine whether the services share the same deployment, route and response fingerprint. If they do, I create one root-cause finding mapped to all affected logical services and assign it to the gateway or application owner that controls the response. I also verify that the response is browser-rendered HTML; CSP absence on a JSON-only response is usually low-value hardening, not a material API vulnerability.

### Q7: What do many inconclusive scan results tell leadership?

**Model answer:** They indicate measurement coverage is incomplete, not that the application passed or failed. I summarize which prerequisites are missing—such as valid service-specific identity, multiple principals, owned objects, current contracts or reachability—and explain which important risk classes remain untested. I provide a plan to close the evidence gaps and avoid risk-acceptance claims until the tests become conclusive.

### Q8: How do you give actionable feedback for a confirmed BOLA issue?

**Model answer:** I state the ownership invariant, identify the two controlled principals and known-owned object, show the successful owner request and unauthorized cross-owner response, describe the exposed data or action, identify the application/data authorization layer as the likely owner, and define an acceptance test covering read, list, search, cache and mutation paths. I do not recommend only a WAF rule because object ownership is an application authorization decision.

## Chapter summary

Cloud security is the disciplined control of an API-driven computing environment. Start with assets, identities and authorization. Reduce network exposure, control outbound paths, protect data and keys, centralize evidence, deploy repeatable configuration and practice recovery. When reviewing an API scanner, also secure the measurement process: establish vantage and reachability, separate outcomes, validate prerequisites and oracles, classify the responding layer, correlate shared deployments, distinguish browser hardening from API risk, and require reproducible acceptance tests. This lets you give cloud teams feedback that is technically accurate, proportionate and actionable.

## Further study

- Chapter 6 for identity, authorization, zero trust and secrets.
- Chapter 14 for Kubernetes and container isolation.
- Chapter 15 for AWS, GCP and Azure implementation patterns.
- Chapter 16 for infrastructure as code.
- Chapter 19 for incident response.
- Chapter 26 for detailed API authentication, authorization, validation, quotas and negative testing.
