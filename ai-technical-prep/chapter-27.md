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

In Kubernetes, a projected service-account token is a short-lived, audience-bound JWT mounted for a specific pod. AWS IRSA or EKS Pod Identity, Google Workload Identity Federation for GKE, and Azure Workload Identity map a verified Kubernetes identity to a cloud role or service identity. The mapping must bind the expected cluster, namespace, service account and audience; otherwise a different workload may exchange its token for the same authority.

## 7. Container, cluster and GPU security

AI workloads commonly run in containers orchestrated by Kubernetes. A container packages an application and dependencies but normally shares the host kernel. It is not a perfect security boundary.

Use minimal images, non-root users, read-only filesystems where compatible, dropped Linux capabilities, seccomp profiles, restricted volume mounts and verified image digests. Admission policy should block privileged containers, host namespaces, broad host paths and unapproved registries.

Separate sensitive workloads with namespaces, node pools or dedicated clusters according to risk. Network policy should default deny and then permit required flows. Protect the Kubernetes API because it controls workload creation, secrets and scheduling.

GPUs introduce scarce capacity and specialized isolation concerns. Enforce quotas and scheduling policy. NVIDIA Multi-Instance GPU (MIG) partitions supported hardware into isolated GPU instances with dedicated portions of memory and compute. Multi-Process Service (MPS) improves concurrent process utilization but is not equivalent to a hostile-tenant boundary. Time-slicing mainly shares scheduling time and likewise should not be described as hardware isolation. Highly sensitive or hostile workloads may require dedicated accelerators or nodes. For untrusted code, consider stronger runtime isolation such as gVisor or Kata Containers, while verifying accelerator compatibility and performance. Clear device state and temporary storage between jobs using supported procedures, and test isolation rather than relying on product names.

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

Python `pickle` can execute attacker-controlled code during deserialization, and legacy PyTorch `.pt` or `.bin` checkpoints may contain pickle object graphs. Treat downloaded models as untrusted software. Prefer tensor-only formats such as Safetensors when the ecosystem supports them. When a legacy PyTorch checkpoint is unavoidable, use a current supported PyTorch version and `torch.load(..., weights_only=True)` where compatible, but do not treat that option as a complete sandbox. Verify expected hashes and sizes, inspect metadata, and perform pre-admission loading in an isolated environment with no secrets, minimal filesystem access and restricted networking.

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

LLM serving engines may reuse key-value attention caches or prefix caches to improve performance. A cache match, cache handle or scheduler bug must not allow one tenant to reuse or infer another tenant's prompt state. Include tenant and policy context in cache partitioning, avoid cross-tenant reuse for sensitive workloads, clear state on lifecycle transitions and test the serving engine's isolation behavior. Where adequate isolation cannot be demonstrated, disable shared prefix caching or use separate serving pools.

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
- prompt or policy configuration;
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

## Practical exercise

Choose a simple RAG application. Draw its path from document upload through chunking, embedding, vector storage, retrieval, prompt construction and inference. For every component, record its identity, data access, network access, artifact version, log fields and failure containment. Then trace three attacks: a poisoned document, a stolen training identity and a cross-tenant cache key. State which control prevents, detects and recovers from each one.

## Interview preparation

### Q1: What makes AI infrastructure security different from ordinary application security?

**Model answer:** It retains ordinary identity, application and cloud risks while adding large data pipelines, mutable learned artifacts, accelerator scheduling, unsafe model formats, probabilistic behavior and expensive inference. The security boundary spans data, build, training, registry, deployment and runtime, so provenance and lifecycle controls are essential.

### Q2: How do you prove that the evaluated model is the deployed model?

**Model answer:** I evaluate an immutable artifact digest, store signed results and approval in a release manifest, require deployment policy to reference that digest, and verify the running workload reports the same digest and compatible serving bundle. Mutable names such as `latest` are not sufficient evidence.

### Q3: How do you isolate tenants in shared inference?

**Model answer:** I combine verified tenant identity, resource-level authorization, tenant-scoped data queries and caches, network and workload isolation, controlled model selection, quotas and concurrency limits, protected temporary storage and negative isolation tests. For risks that shared hardware cannot adequately control, I move the workload to dedicated nodes or clusters.

### Q4: A model is found to contain a malicious serialized object. What do you do?

**Model answer:** I stop promotion and loading, identify every copy and deployment by digest, isolate affected workloads, preserve the artifact and logs, revoke any exposed credentials, rebuild from a trusted data-only format or source, and add format allowlisting and isolated pre-admission validation. I also inspect whether the loader executed code and whether persistence or exfiltration occurred.

## Chapter summary

AI infrastructure security is lifecycle security. Protect the identities, data, code, models, clusters and evidence that connect ingestion to inference. Separate duties, bind releases to immutable artifacts, isolate tenants and expensive resources, limit credentials and egress, observe meaningful decisions and practice containment and recovery. The specialized chapters in this book provide the deeper implementation detail for each part of this map.

## Further study

- Chapters 14 and 20 for container, Kubernetes, GPU and tenant isolation.
- Chapters 17 and 22 for supply chain, MLOps and training.
- Chapter 18 for observability and abuse detection.
- Chapter 19 for incident response.
- Chapter 21 for secure data pipelines.
- Chapters 8 through 13 for agent, RAG, guardrail, evaluation and model-layer threats.
