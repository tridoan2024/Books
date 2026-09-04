# Chapter 27: AI infrastructure security from data to inference

> **Part:** Part VII — Security Foundations for AI Platforms
> **Market evidence:** Distributed systems (14.8%), Kubernetes security (18.5%), Observability (15.1%), Data pipelines (12.8%), MLOps (7.3%), Fine-tuning & training (7.3%); 681-posting aggregate; 131 securing-AI roles, 2026-08-25
> **Reader status:** Beginner path; no prior AI infrastructure knowledge assumed
> **Why this chapter exists:** The book contains deep chapters on containers, supply chains, serving, data and training. A beginner still needs one end-to-end map showing how those components connect, where trust changes, what attackers target and which controls must survive the entire model lifecycle.

---

## 1. What AI infrastructure includes

AI infrastructure is the collection of systems that acquire data, prepare it, train or obtain models, evaluate them, store artifacts, deploy model servers, accept inference requests, observe behavior and retire old versions. Security must cover the whole lifecycle because a trustworthy API cannot compensate for a poisoned dataset, replaced model artifact or overprivileged training job.

```text
Data sources
   -> ingestion
   -> raw data store
   -> transformation / feature preparation
   -> training or fine-tuning
   -> evaluation and approval
   -> model registry / artifact store
   -> deployment
   -> inference gateway and model server
   -> monitoring, incident response and retirement
```

Each arrow is a trust transition. Ask which identity moves the artifact, how integrity is checked, which metadata follows it and what evidence proves the approved object is the one being used.

## 2. Essential AI concepts

A **model** is a parameterized function learned from data. **Training** adjusts parameters to reduce an error measure. **Fine-tuning** adapts an existing model using additional data. **Inference** applies a trained model to new input. A **checkpoint** stores model parameters during or after training. A **model registry** records versions and metadata. A **feature** is an input value used by a model. An **embedding** is a numeric representation used for similarity and retrieval.

Large language model applications often combine a model with retrieval, tools, memory, policies and ordinary application code. The model is only one component. A secure design therefore distinguishes:

- the **model plane**, which runs training and inference;
- the **data plane**, which stores and moves datasets, prompts, embeddings and outputs;
- the **control plane**, which configures jobs, identities, networks and deployments;
- the **supply-chain plane**, which builds code, images and model artifacts;
- the **observability plane**, which records health and security evidence.

Compromise of the control or supply-chain plane can silently affect every later inference request.

## 3. Assets and security objectives

Important assets include training data, labels, feature logic, source code, container images, model weights, adapters, evaluation sets, prompts, outputs, tenant context, credentials, accelerator capacity and audit evidence.

Use five objectives:

1. **Confidentiality:** unauthorized parties cannot read data, weights, prompts or outputs.
2. **Integrity:** unauthorized changes to code, data, configuration or models are prevented or detected.
3. **Availability:** legitimate work receives sufficient compute and can recover from failure.
4. **Isolation:** one tenant, job or environment cannot affect another beyond explicit policy.
5. **Provenance:** the organization can explain where an artifact came from, how it was produced, what approved it and where it is deployed.

## 4. Threat model by lifecycle stage

### Data ingestion

Attackers may submit malicious, mislabeled or sensitive data; exploit parsers; replay old events; or bypass tenant ownership. Validate source identity, schema, size, format and allowed content. Quarantine new data, scan risky formats, preserve immutable source metadata and separate raw from curated stores.

### Data preparation

Transformation code may leak data between tenants, introduce biased or poisoned records, or execute untrusted code. Run jobs with narrow identities, isolate temporary storage, version transformation code, verify row-level ownership and record input/output lineage.

### Training

Training jobs often receive broad data access and expensive GPUs. A compromised dependency or notebook can steal datasets, weights or cloud credentials. Use ephemeral jobs, approved images, non-root execution, restricted outbound access, workload identity, signed dependencies and per-job storage paths. Avoid placing production credentials in notebooks.

### Evaluation and approval

An attacker may tamper with evaluation data, hide failures or promote an unapproved model. Keep protected evaluation sets, version evaluation code, record complete results and require policy-based release gates. Separate the identity that produces an artifact from the identity that approves promotion when risk warrants it.

### Registry and artifact storage

Model files can be replaced, rolled back to vulnerable versions or loaded through unsafe deserialization. Store immutable versions, hashes, signatures and provenance. Prefer data-only serialization formats when possible. Loading a model is equivalent to consuming software and must occur in an isolated, validated environment.

### Deployment and inference

Deployment systems may select the wrong artifact, overgrant runtime identity or expose model servers publicly. Bind deployments to immutable artifact digests, use staged rollout, keep model servers behind authenticated gateways, isolate tenants and define rollback criteria.

### Retirement

Old endpoints, copies, credentials and datasets can remain accessible. Retirement requires traffic removal, credential revocation, inventory updates, retention-aware deletion and proof that backups and replicas follow policy.

## 5. Reference architecture

```text
                  +---------------- Security account/project ----------------+
                  | immutable audit logs | detections | asset inventory      |
                  +---------------------------^-------------------------------+
                                              |
[Approved sources] -> [Quarantine] -> [Curated data] -> [Training jobs]
                              |              |              |
                              v              v              v
                        [scan/evaluate]  [lineage DB]  [isolated GPU pool]
                                                             |
                                                             v
                [Evaluation gate] -> [Signed model registry] -> [Deployment]
                                                               |
                                                       [API gateway]
                                                               |
                                                [tenant-aware orchestrator]
                                                               |
                                       [isolated model servers / tool services]
```

The architecture separates security evidence from production administration. Training identities can read approved datasets and write new candidate artifacts but cannot approve their own promotion. Deployment identities can read only approved artifacts. Runtime identities do not need training-data write access. The public API cannot directly reach the registry or cluster control plane.

## 6. Workload identity and least privilege

Assign different identities to ingestion, transformation, training, evaluation, deployment and inference. This limits blast radius and makes logs meaningful.

Example permissions:

| Workload | Read | Write | Must not do |
|---|---|---|---|
| Ingestion | approved external source | quarantine path | deploy models |
| Transformation | quarantined and approved raw data | curated version | change source records |
| Training | approved curated dataset and base model | candidate checkpoint path | approve production |
| Evaluation | candidate artifacts and protected test set | evaluation results | alter candidate artifact |
| Deployment | approved release manifest | runtime deployment state | read raw training data |
| Inference | approved model version and tenant request | authorized outputs and metrics | modify registry or training data |

Short-lived workload credentials should be bound to the actual runtime identity. If a job is rescheduled or its role is revoked, new credentials must stop being issued quickly. Long queues and cached tokens need explicit revocation behavior.

In Kubernetes, a projected service-account token is a short-lived, audience-bound JWT mounted for a specific pod. AWS IRSA uses an EKS OIDC issuer and IAM trust conditions that should constrain `sub` and `aud`; EKS Pod Identity instead uses EKS-managed pod-identity associations and a node agent to obtain credentials. Google Workload Identity Federation for GKE and Azure Workload Identity likewise map Kubernetes workload identity to cloud authority. Whatever mechanism is selected, bind the expected cluster, namespace and service account, and prevent an ordinary workload from selecting a privileged identity.

## 7. Container, cluster and GPU security

AI workloads commonly run in containers orchestrated by Kubernetes. A container packages an application and dependencies but normally shares the host kernel. It is not a perfect security boundary.

Use minimal images, non-root users, read-only filesystems where compatible, dropped Linux capabilities, seccomp profiles, restricted volume mounts and verified image digests. Admission policy should block privileged containers, host namespaces, broad host paths and unapproved registries.

Separate sensitive workloads with namespaces, node pools or dedicated clusters according to risk. Network policy should default deny and then permit required flows. Protect the Kubernetes API because it controls workload creation, secrets and scheduling.

GPUs introduce scarce capacity and specialized isolation concerns. Enforce quotas and scheduling policy. NVIDIA Multi-Instance GPU (MIG) partitions supported hardware into isolated GPU instances with dedicated portions of memory and compute, but it is not physical air-gapping: host software, PCIe paths, memory-bandwidth pressure and surrounding node resources remain part of the threat and availability model. Multi-Process Service (MPS) improves concurrent process utilization but is not equivalent to a hostile-tenant boundary. Time-slicing mainly shares scheduling time and likewise should not be described as hardware isolation. Highly sensitive or hostile workloads may require dedicated accelerators or nodes. For untrusted code, consider stronger runtime isolation such as gVisor or Kata Containers, while verifying accelerator compatibility and performance. Clear device state and temporary storage between jobs using supported procedures, and test isolation rather than relying on product names.

## 8. Software and model supply chain

The system consumes source packages, base images, build tools, pretrained models, datasets and plugins. Any can be malicious or compromised.

A secure pipeline should:

1. pin dependencies and artifact digests;
2. scan code, images and dependencies;
3. build in controlled ephemeral workers;
4. generate a software bill of materials and model provenance record;
5. sign release artifacts and attest how they were built;
6. enforce policy at registry admission and deployment;
7. support rapid identification and rollback of affected versions.

For containers, Sigstore Cosign can sign images and attach provenance attestations. A Kubernetes admission controller such as Kyverno or Gatekeeper can reject workloads whose images are unsigned, come from an unapproved registry or lack required provenance. SLSA provides a vocabulary for build provenance and resistance to supply-chain tampering. Model artifacts need an equivalent admission decision in the registry or deployment controller; container signature checks alone do not authenticate the model file loaded at runtime.

A signature proves that a key approved bytes; it does not prove the bytes are safe. Protect signing keys, define who may invoke them and require evaluation evidence before a release is signed or promoted.

## 9. Model artifact safety

Python `pickle` can execute attacker-controlled code during deserialization, and legacy PyTorch `.pt` or `.bin` checkpoints may contain pickle object graphs. Treat downloaded models as untrusted software. Prefer tensor-only formats such as Safetensors when the ecosystem supports them. When a legacy PyTorch checkpoint is unavoidable, use a current supported PyTorch version and `torch.load(..., weights_only=True)` where compatible. That option restricts which objects may be reconstructed but is not a process sandbox and does not eliminate parser, native-library or resource-exhaustion risk. Verify expected hashes and sizes, inspect metadata, and perform pre-admission loading or conversion in an isolated environment with no secrets, minimal filesystem access and restricted networking.

Maintain an allowlist of models and licenses. Record source location, commit or version, digest, owner, intended use, training data summary, evaluations and known limitations. Mirror important external artifacts into controlled storage so future deployments do not depend on a mutable public reference.

## 10. Secrets and sensitive context

Applications need database credentials, provider tokens or third-party OAuth grants. Keep these outside prompts and model-visible memory. A tool service can retrieve a secret using its workload identity, perform a narrow operation and return only the necessary result.

Do not store secrets in source code, container images, notebooks or environment dumps. Environment variables are convenient but can leak through diagnostics and child processes. Prefer runtime secret mounts or direct retrieval with caching appropriate to the threat model. Rotate secrets and design services to reload them without disruptive manual work.

## 11. Multi-tenant inference

A multi-tenant service handles data and workloads for multiple customers on shared infrastructure. Isolation must exist at multiple layers:

- authenticated tenant identity at the gateway;
- tenant-aware authorization in the application;
- tenant-scoped database and object queries;
- cache keys that include tenant ownership;
- quotas and concurrency controls;
- controlled model and adapter selection;
- isolated temporary files and batch jobs;
- logs that support investigation without exposing payloads.

LLM serving engines may reuse key-value attention caches or prefix caches to improve performance. A cache match, cache handle or scheduler bug must not allow one tenant to reuse or infer another tenant's prompt state. Even without returning cached content, time-to-first-token differences may reveal whether a victim’s prefix or document was previously cached. Namespace cache state by tenant and security domain, avoid cross-tenant reuse for sensitive workloads, clear state on lifecycle transitions and test both content leakage and timing distinguishability. Where adequate isolation cannot be demonstrated, disable shared prefix caching or use separate serving pools.

Never rely on a request field alone to establish tenant identity. Never share retrieval caches or conversation memory unless the key and access policy include the tenant. Test negative cases continuously: tenant A must not read, influence or exhaust tenant B.

## 12. Observability without data leakage

Operational signals include request count, latency, errors, queue depth, GPU utilization, token use, model version and dependency health. Security signals include denied authorization, unusual model selection, excessive tool calls, extraction-like query patterns, new egress destinations, artifact changes and privileged control-plane actions.

Use correlation identifiers so an incident can be traced across gateway, orchestrator, model server and tools. Record the policy decision and identifiers needed for investigation. Avoid routine storage of full prompts and responses. If payload capture is required for a defined purpose, apply access control, minimization, retention, redaction and audit logging.

Service-level objectives should include security-sensitive behavior, such as maximum revocation propagation time, maximum stale-policy duration and recovery-point objectives for registries and configuration.

## 13. Safe release and rollback

A model release contains more than weights. It should bind:

- immutable model digest;
- serving image digest;
- tokenizer and adapter versions;
- prompt, chat-template, generation and policy configuration;
- evaluation results and approval;
- expected resource limits;
- rollback target;
- owner and expiration or review date.

Deploy first to a controlled environment, then a small canary. Compare safety, correctness, latency, resource use and abuse signals. Define automatic stop conditions. Rollback must restore the entire compatible bundle; rolling back only model weights while leaving a new tokenizer or prompt template may not restore known behavior.

## 14. Incident response for AI infrastructure

When an incident occurs:

1. **Triage:** identify affected tenants, model versions, data and infrastructure.
2. **Contain:** disable routes, revoke identities, stop jobs, isolate nodes or block artifact promotion.
3. **Preserve evidence:** protect logs, manifests, images, checkpoints and relevant volatile data.
4. **Eradicate:** remove malicious artifacts, vulnerable dependencies, persistence and overbroad permissions.
5. **Recover:** rebuild from trusted sources, restore configuration and roll out gradually.
6. **Learn:** add tests, detections, ownership changes and architectural fixes.

Do not immediately delete every compromised workload before collecting necessary evidence. Do not keep it running merely to investigate if it is actively harming users. Prepare isolation and evidence-collection procedures in advance.

## 15. Minimum secure AI platform baseline

A practical first baseline is:

- separate development and production environments;
- centralized human identity with strong MFA;
- per-workload short-lived identity;
- private data stores and model services;
- encrypted storage and transport;
- tenant-aware application authorization;
- approved, scanned and digest-pinned images and models;
- isolated build and training jobs;
- release manifests with provenance and evaluation evidence;
- admission policy for workload configuration;
- protected audit logs and actionable alerts;
- cost, concurrency and capacity controls;
- tested backup, rollback, revocation and incident procedures.

This baseline is a starting point, not a certification. Each system’s data sensitivity, tenant hostility, availability needs and regulatory obligations determine stronger controls.

## 16. Sr. Staff playbook for reviewing an AI infrastructure design

At Staff level, do not review an AI platform as a list of products. Review the lifecycle, authority and evidence connecting them. “We use Kubernetes, a private network and a model registry” is not a security argument. The design must show which identity performs each transition, what it can access, how artifacts are bound together and what happens during compromise or partial failure.

### 16.1 Start with six inventories

Build these inventories before evaluating controls:

1. **AI assets:** datasets, features, embeddings, base models, adapters, prompts, tools, evaluation sets and release manifests.
2. **Compute:** notebooks, build workers, training clusters, GPU node pools, model servers, batch workers and agent sandboxes.
3. **Identities:** humans, CI jobs, Kubernetes service accounts, cloud roles, managed identities, model-serving identities and emergency administrators.
4. **Data flows:** ingestion, transformations, training reads, checkpoint writes, registry promotion, deployment pulls, inference inputs, tool calls and telemetry.
5. **External dependencies:** public model hubs, package registries, SaaS model APIs, vector databases, data vendors and plugins.
6. **Evidence systems:** audit logs, lineage stores, bills of materials, attestations, evaluation results, approvals, runtime inventory and incident records.

An inventory entry should answer owner, environment, sensitivity, tenant, immutable identifier, source, consumers, retention and deletion method. If the platform cannot locate every deployment of a model digest, it cannot respond reliably to a compromised artifact.

### 16.2 Draw trust boundaries and privilege transitions

Mark boundaries where any of these change:

- human to workload identity;
- one cloud account, project or subscription to another;
- public or partner data to curated internal data;
- development to production;
- untrusted artifact to approved registry artifact;
- tenant A to shared infrastructure to tenant B;
- control plane to data plane;
- model output to tool execution;
- temporary elevated access back to ordinary operation.

For every crossing, ask:

```text
Who initiates it?
What proves identity?
What exact authority is granted?
What data or artifact crosses?
What validates integrity and policy?
What evidence is retained?
How is access revoked?
What happens if the next component is unavailable?
```

### 16.3 Review the lifecycle as state transitions

Treat each asset as moving through controlled states:

```text
external -> quarantined -> validated -> curated -> approved for training
candidate model -> evaluated -> approved -> deployed -> monitored -> retired
```

Transitions need explicit predicates. For example, a candidate model may become approved only when its digest is immutable, required evaluations pass, provenance exists, the license is accepted and an authorized reviewer records approval. A deployment controller should consume the approved release manifest rather than independently reconstructing which model and image seem current.

### 16.4 Separate preventive, detective and recovery evidence

For each security invariant, require all three kinds of control where risk warrants it:

| Invariant | Preventive control | Detective evidence | Recovery proof |
|---|---|---|---|
| Only approved models deploy | admission policy verifies release manifest and digest | alert on unapproved digest or mutable tag | tested rollback to known-good bundle |
| Training cannot exfiltrate data | restricted egress and narrow workload identity | DNS/proxy/object-access telemetry | revoke identity, isolate job and reconstruct accessed data |
| Tenants remain isolated | scoped auth, cache partitioning and workload isolation | synthetic cross-tenant tests and access-denial logs | flush affected state and move tenant to isolated pool |
| Security evidence survives compromise | write-only export to separate security boundary | missing-log and configuration-change alerts | restore trustworthy logging and preserve incident timeline |

Designs often present preventive controls only. A Staff review should ask how the team will detect control failure and recover under pressure.

## 17. Publicly documented risk frameworks and how to use them

Frameworks help organize questions; they do not replace a system-specific threat model.

### NIST AI RMF and Generative AI Profile

The NIST AI Risk Management Framework organizes work into **Govern, Map, Measure and Manage**. The Generative AI Profile, NIST AI 600-1, adds risks such as confabulation, data privacy, information integrity, harmful bias, human-AI configuration and value-chain/component integration.

For infrastructure review:

- **Govern:** define owners, acceptable use, release authority, incident roles and third-party requirements.
- **Map:** identify users, affected parties, data sources, deployment context and credible misuse.
- **Measure:** run security, privacy, safety, quality and operational evaluations with documented limitations.
- **Manage:** decide whether to mitigate, transfer, avoid or accept risk; monitor production and revisit decisions.

Do not turn the framework into a checkbox. Link each risk decision to an enforceable control, measurable signal and accountable owner.

### MITRE ATLAS

MITRE ATLAS describes adversary tactics and techniques against AI-enabled systems, including reconnaissance, resource development, initial access, model access, data poisoning, evasion, exfiltration and impact. Use it to check whether a threat model covers realistic attacker sequences.

For example:

```text
compromised dependency
  -> execution in training job
  -> workload credential theft
  -> dataset discovery
  -> model/checkpoint exfiltration
  -> persistence through modified artifact
```

The value is the chain. A control that scans the final model does not address stolen workload credentials or tampered training code earlier in the sequence.

### Kubernetes security guidance

Kubernetes guidance emphasizes API-server protection, least-privilege RBAC, pod security, network isolation, secrets protection, image provenance, audit logs and safe node configuration. For AI platforms, add accelerator scheduling, operator/controller privileges, notebook risk and artifact loading.

### SLSA and Sigstore

SLSA provides a model for build provenance and increasing resistance to tampering. Sigstore tooling can sign artifacts and record signing events. Use them to answer how an artifact was built and approved. They do not prove the source, training data or model behavior is safe. Policy must connect provenance with vulnerability, license, evaluation and risk decisions.

## 18. Real-world AI infrastructure failure patterns

The following reconstructed cases combine publicly documented attack techniques and common production architectures. They are engineering exercises, not claims about a specific unnamed company.

### Case 1: Malicious model checkpoint executes code

**Scenario:** A data scientist downloads a community `.pt` checkpoint. A training notebook calls a legacy deserializer. The file contains a malicious pickle reducer that executes code, reads the notebook’s cloud credentials and uploads accessible data.

**Why ordinary controls fail:** The file passed antivirus scanning, the bucket was encrypted and the notebook user was authenticated. None of those controls made deserialization safe or restricted the job’s data and network authority.

**Review findings:**

- untrusted artifact entered a privileged training environment;
- unsafe format was not blocked before loading;
- the job had broad dataset access;
- outbound traffic was unrestricted;
- no alert joined model-load activity with credential and network use.

**Required controls:** tensor-only formats where possible, digest allowlists, isolated pre-admission inspection, current framework safety options, narrow per-job identity, restricted egress, immutable provenance and detection for unusual object reads or outbound destinations.

**Acceptance test:** a known malicious fixture cannot execute, cannot reach credentials or the network, and produces a blocked-admission event tied to the artifact digest.

### Case 2: Signed container loads an unsigned mutable model

**Scenario:** Kubernetes admission verifies the serving container’s Cosign signature. At startup, the container downloads `models/customer-risk:latest` from object storage. An authorized but compromised registry account replaces that mutable object after evaluation.

**Failure:** container provenance is intact, but the deployed model is not bound to the evaluated digest. “Signed image” was incorrectly treated as “signed release.”

**Required design:** a release manifest binds container digest, model digest, tokenizer, adapter, policy configuration and evaluation result. Admission verifies the manifest, and runtime download accepts only the bound digest. Mutable names may aid discovery but never establish deployment identity.

### Case 3: Training job steals cloud authority

**Scenario:** A notebook or dependency is compromised. The pod can reach a metadata endpoint or uses an overbroad service account. The attacker obtains temporary credentials, enumerates object storage and downloads unrelated training data and model weights.

**Review questions:**

- Does every notebook share one service account?
- Is the token audience limited and short lived?
- Can the pod query instance metadata?
- Which storage paths and KMS keys are authorized?
- Is arbitrary internet egress allowed?
- Can an ordinary user create a pod with a more privileged service account?

**Required controls:** per-workload identity, least-privilege storage/key policy, admission restrictions on service-account selection, private endpoints, egress allowlists and credential-use detection. On AWS nodes, require IMDSv2, disable IMDSv1 and select/test a response hop limit appropriate to the actual pod networking model; on other platforms use their metadata concealment or firewall controls. Treat these as defense-in-depth because host-network workloads, node agents and platform networking can change the boundary.

### Case 4: Cross-tenant prefix-cache exposure

**Scenario:** An inference platform enables automatic prefix caching across requests to improve throughput. Cache identity is based on prompt tokens but omits tenant and policy context. A second tenant receives reused state or can infer another tenant’s prompt prefix through behavior or timing.

**Review finding:** the performance cache became a cross-tenant data plane without an explicit isolation contract.

**Required controls:** partition cache-tree nodes and keys by tenant and security-domain context, avoid shared caching for sensitive workloads, clear state on model or policy transitions, review serving-engine guarantees and run controlled tenant A/B content and time-to-first-token tests. Use separate serving pools when the technology cannot provide sufficient assurance.

### Case 5: GPU denial of wallet and noisy neighbor

**Scenario:** A tenant submits many maximum-context streaming requests. HTTP request limits are satisfied, but every request occupies GPU memory and generation slots for a long time. Other tenants experience timeouts and cost increases.

**Required controls:** tokens-per-minute, active-sequence and GPU-time budgets; maximum context and output size; per-tenant queues; fair scheduling; cancellation propagation; global overload shedding; and budgets tied to business priority. Measure resource use after tokenization and during generation, not only at the gateway.

### Case 6: Revoked user authority survives in queues

**Scenario:** A user submits an agent or training job while authorized. Their access is revoked, but the queued job begins ten minutes later using a powerful worker identity and stale embedded tenant context.

**Design question:** Is authorization checked only at submission, or again before every delayed sensitive action?

**Required controls:** record actor, tenant, approved action and policy version; re-evaluate current authorization at execution for high-risk operations; use bounded delegation tokens; support queue cancellation; and define maximum revocation propagation time. Durable workload identity should authenticate the worker, while delegated authority constrains what it may do for the user.

### Case 7: Poisoned retrieval corpus changes agent behavior

**Scenario:** A document from an external source enters a RAG corpus. It contains hidden instructions directing the model to reveal secrets or call a tool. The ingestion pipeline validates file type but not source authority, ownership or downstream behavioral risk.

**Required controls:** source authentication, quarantine, tenant ownership, malware/parser safety, provenance, content-risk processing, retrieval authorization and deterministic tool authorization. Do not attempt to “sanitize away” every instruction; retrieved content remains untrusted at inference time.

### Case 8: Debug observability becomes a data breach

**Scenario:** To troubleshoot quality, engineers enable full prompt and response logging. Logs include health information, credentials pasted by users, retrieved documents and hidden system instructions. A broad analytics role and long retention turn the observability platform into a sensitive shadow database.

**Required controls:** data classification before logging, default metadata-only telemetry, redaction, short retention, restricted payload sampling, explicit debugging approval, separate access roles and auditing of log queries and exports.

### Case 9: Rollback restores incompatible components

**Scenario:** A new model behaves badly. Operations rolls back the weight file but leaves the new tokenizer, adapter and prompt policy. Error rates continue because the release was not treated as one compatible bundle.

**Required controls:** immutable release manifests binding weights, image, tokenizer, adapters, chat template, generation configuration and policy; compatibility validation; atomic or ordered rollout; canary stop criteria; and rehearsed bundle rollback. Measure rollback time as an operational security objective.

## 19. Evidence expected in an AI platform design review

A high-quality review packet contains more than architecture slides:

| Area | Minimum evidence |
|---|---|
| Asset inventory | model/data IDs, owners, sensitivity, environments and active deployments |
| Identity | human and workload role matrix, token flows, trust policies and break-glass process |
| Network | ingress/egress diagram, private endpoints, gateway/origin restrictions and DNS ownership |
| Data | source approvals, lineage, retention, deletion, tenant boundaries and backup handling |
| Supply chain | pinned dependencies, SBOM, build provenance, signatures and admission policy tests |
| Model release | immutable manifest, evaluations, approval, canary and rollback target |
| Runtime | pod/container policy, GPU isolation, quotas, secrets and cache isolation |
| Monitoring | audit schema, redaction, detections, SLOs and evidence retention |
| Incident response | containment commands, artifact inventory query, evidence preservation and recovery exercise |

Ask for machine-verifiable evidence when possible: policy tests, admission denials, cloud inventory queries, signed manifests, negative tenant-isolation tests and recovery records. Screenshots can support a review but are weak as the only evidence because they are point-in-time and difficult to reproduce.

## 20. Risk prioritization for AI infrastructure

Prioritize using business impact and credible attack paths, not novelty.

**Critical or urgent examples:**

- unauthenticated public model or data administration;
- cross-tenant prompt, data or model leakage;
- arbitrary code execution when loading externally sourced artifacts in privileged jobs;
- production signing or deployment authority exposed to ordinary workloads;
- destructive control-plane access without recoverable backups;
- secrets or regulated data routinely stored in broadly accessible logs.

**High examples:**

- training workloads with broad data access and unrestricted egress;
- unsigned or mutable production release artifacts;
- production notebooks with shared privileged identity;
- inability to identify deployments affected by a compromised model or dependency;
- authorization revocation that does not reach queued agents or jobs within the required time.

**Medium or lower examples depend on context:**

- missing defense-in-depth headers on non-browser JSON endpoints;
- absent optional provenance fields when deployment is still bound to reviewed immutable digests;
- shared GPU scheduling where tenants are equally trusted and data is nonsensitive;
- operational hardening gaps without a credible path to sensitive assets.

Document confidence separately. A severe scenario with missing evidence is an urgent validation task, not automatically a confirmed critical vulnerability.

## 21. Giving actionable feedback to platform and ML teams

Use this structure:

```text
Invariant:
Only evaluated release bundles may run in production.

Observed design/evidence:
Admission verifies the container signature, but the container downloads a model
through a mutable alias. No control binds the evaluated model digest to runtime.

Attack path:
Registry credential compromise or authorized post-evaluation replacement causes
production to load unreviewed weights while the signed container remains valid.

Business impact:
Unreviewed behavior, code-execution risk for unsafe formats, integrity loss and
inability to prove which model served regulated decisions.

Requested change:
Create an immutable release manifest binding all component digests and require
deployment plus runtime loaders to verify it.

Acceptance evidence:
An attempted mutable or mismatched model is rejected; the running deployment
reports the approved digest; rollback restores the complete prior bundle.

Owner and deadline:
Model platform owns registry/loader policy; application owner validates behavior;
security validates the negative test and evidence pipeline.
```

Avoid feedback such as “use zero trust,” “add monitoring,” or “secure Kubernetes.” State the invariant, attack path, control owner, expected evidence and tradeoff. When the evidence is incomplete, request the smallest experiment that resolves uncertainty.

## 22. AI infrastructure review checklist

Before approving a design, verify:

1. Every sensitive dataset, model and deployment has an owner and immutable identifier.
2. Human and workload identities are distinct, short lived and least privileged.
3. Training, evaluation, deployment and inference use separate authority.
4. Untrusted code, data and models enter quarantine before privileged processing.
5. Production releases bind model, image, tokenizer, adapter, policy and evaluation evidence.
6. Registry and deployment policy reject unapproved or mutable artifacts.
7. Tenant identity is enforced in data queries, caches, queues and serving state.
8. GPU and downstream capacity have per-tenant and global protection.
9. Outbound connectivity is restricted according to workload purpose.
10. Prompts, responses and training data are not copied indiscriminately into logs.
11. Revocation reaches running and queued work within a defined objective.
12. Security evidence is exported outside the production blast radius.
13. Incidents can identify affected artifacts, tenants and deployments quickly.
14. Rollback restores a complete compatible release bundle.
15. Retirement removes endpoints, credentials, replicas and retained data according to policy.

## Practical exercise

Complete both exercises:

1. Choose a simple RAG application. Draw its path from document upload through chunking, embedding, vector storage, retrieval, prompt construction and inference. For every component, record its identity, data access, network access, artifact version, log fields and failure containment. Trace a poisoned document, stolen training identity and cross-tenant cache key. State which control prevents, detects and recovers from each one.
2. Conduct a design review using the evidence table in Section 19. Select one lifecycle invariant and write a full finding using the Section 21 template. Then create a negative acceptance test and a rollback or containment exercise that would prove the remediation works.

## Interview preparation

### Q1: What makes AI infrastructure security different from ordinary application security?

**Model answer:** It retains ordinary identity, application and cloud risks while adding large data pipelines, mutable learned artifacts, accelerator scheduling, unsafe model formats, probabilistic behavior and expensive inference. The security boundary spans data, build, training, registry, deployment and runtime, so provenance and lifecycle controls are essential.

### Q2: How do you prove that the evaluated model is the deployed model?

**Model answer:** I evaluate an immutable artifact digest, store signed results and approval in a release manifest, require deployment policy to reference that digest, and verify the running workload reports the same digest and compatible serving bundle. Mutable names such as `latest` are not sufficient evidence.

### Q3: How do you isolate tenants in shared inference?

**Model answer:** I combine verified tenant identity, resource-level authorization, tenant-scoped data queries and caches, network and workload isolation, controlled model selection, quotas and concurrency limits, protected temporary storage and negative isolation tests. For risks that shared hardware cannot adequately control, I move the workload to dedicated nodes or clusters.

### Q4: A model is found to contain a malicious serialized object. What do you do?

**Model answer:** I stop promotion and loading, identify every copy and deployment by digest, isolate affected workloads, preserve the artifact and logs, revoke any exposed credentials, rebuild from a trusted data-only format or source, and add format allowlisting and isolated pre-admission validation. I also inspect whether the loader executed code and whether persistence or exfiltration occurred.

### Q5: A container image is signed. Does that prove the deployed AI service is trustworthy?

**Model answer:** No. The signature identifies approved image bytes, but the runtime may load a mutable model, adapter, tokenizer or policy configuration afterward. I require an immutable release manifest binding every behavior-affecting component and its evaluation evidence, then verify that admission and runtime loading use those exact digests.

### Q6: How do you review a training job that needs broad data access?

**Model answer:** I challenge whether broad access is actually necessary, separate datasets by purpose, use a unique short-lived workload identity, scope storage and KMS permissions, restrict egress, use an approved immutable image, isolate temporary storage and record lineage. I also require detection for unusual data reads and a response procedure that can determine what the job accessed.

### Q7: What is the difference between workload authentication and delegated user authority?

**Model answer:** Workload authentication proves which service or job is running. Delegated authority constrains what that workload may do for a specific user or tenant. A queued worker may have a valid machine identity but still need to revalidate whether the user’s requested action remains authorized when execution begins.

### Q8: How do you prioritize AI infrastructure findings?

**Model answer:** I prioritize credible attack paths to sensitive data, cross-tenant impact, production control, artifact integrity and recovery failure. I separate severity from confidence, avoid inflating novel but weakly evidenced issues, and define a verification test. Cross-tenant leakage or untrusted-code execution in a privileged training job outranks a generic hardening gap without a path to protected assets.

## Chapter summary

AI infrastructure security is lifecycle security. Protect the identities, data, code, models, clusters and evidence that connect ingestion to inference. Separate duties, bind releases to immutable artifacts, isolate tenants and expensive resources, limit credentials and egress, observe meaningful decisions and practice containment and recovery. The specialized chapters in this book provide the deeper implementation detail for each part of this map.

## Further study

- Chapters 14 and 20 for container, Kubernetes, GPU and tenant isolation.
- Chapters 17 and 22 for supply chain, MLOps and training.
- Chapter 18 for observability and abuse detection.
- Chapter 19 for incident response.
- Chapter 21 for secure data pipelines.
- Chapters 8 through 13 for agent, RAG, guardrail, evaluation and model-layer threats.
- NIST AI 600-1, Generative Artificial Intelligence Profile: `https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf`.
- MITRE ATLAS: `https://atlas.mitre.org/`.
- Kubernetes security concepts: `https://kubernetes.io/docs/concepts/security/`.
- SLSA specification: `https://slsa.dev/spec/v1.0/`.
- Sigstore documentation: `https://docs.sigstore.dev/`.
