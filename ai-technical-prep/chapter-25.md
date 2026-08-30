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

## Practical exercise

Draw the document-summary architecture. Mark every trust boundary, identity, data store, network path and administrative path. Then create a table with five columns: invariant, preventive control, detective evidence, owner and recovery action. Do not name a provider service until the invariant is clear. Finally, map each control to AWS, GCP or Azure.

## Interview preparation

### Q1: What is the cloud shared-responsibility model?

**Model answer:** The provider and customer secure different layers, and the boundary depends on the service. The provider usually secures facilities, hardware and the managed platform. The customer still owns identity, data, configuration, application authorization and monitoring. I turn that general model into a control-level ownership table so no requirement is left between teams.

### Q2: Why is identity called the new perimeter?

**Model answer:** Cloud resources are created through APIs, workloads move and many services have no meaningful physical perimeter controlled by the customer. Every important request therefore depends on a verified identity and authorization decision. Networks still reduce exposure, but identity controls what a caller may actually do.

### Q3: Does encryption prevent a storage administrator from reading data?

**Model answer:** Not automatically. If the same identity can read the encrypted object and ask KMS to decrypt its data key, encryption does not stop that administrator. Separation requires distinct permissions, key policy, logging and often separate administrative roles.

### Q4: Design the first security controls for a new AI service.

**Model answer:** I would identify assets and tenants, separate environments, use centralized human identity and short-lived workload identity, expose only an authenticated gateway, keep storage and model endpoints private, encrypt data with controlled keys, establish application-level tenant authorization, enable protected audit logs, deploy through tested infrastructure as code and prove backup restoration and incident containment before launch.

## Chapter summary

Cloud security is the disciplined control of an API-driven computing environment. Start with assets, identities and authorization. Reduce network exposure, control outbound paths, protect data and keys, centralize evidence, deploy repeatable configuration and practice recovery. Once this mental model is comfortable, Chapter 15’s provider-specific and multi-cloud architecture becomes much easier to reason about.

## Further study

- Chapter 6 for identity, authorization, zero trust and secrets.
- Chapter 14 for Kubernetes and container isolation.
- Chapter 15 for AWS, GCP and Azure implementation patterns.
- Chapter 16 for infrastructure as code.
- Chapter 19 for incident response.
