# AI Technical Prep
## An Engineering Handbook for Staff+ AI Security Roles

**Table of contents — Edition 4.7 manuscript, 2026-10-05.**

Edition 4.6 uses 889 aggregate postings, with a 171-posting **securing-AI** segment as the primary depth and interview-priority signal. A separate nine-posting **AI-for-security** segment remains too small and targets a different job family, so it does not define this book's syllabus. This additive edition deepens production guardrails, statistical evaluation, authorization-preserving RAG, AI telemetry and abuse response, verifiable model/data supply chains, and executable governance.

Edition 4.6 preserved 27 chapters and 6 appendices. This Edition 4.7 manuscript appends three owner-requested chapters on Jev engineering, graph engineering and loop engineering for Codex, Claude Code and multi-agent systems. The existing market figures remain the dated September 4 baseline; the new chapters are explicit editorial additions, not newly measured hiring-demand claims. Chapters 1–27 and all six appendices retain their numbering and writing.

### Evidence notation

`Target / aggregate` means Core demand in the 171 securing-AI roles followed by Core demand across all 889 postings. Status is measured against the reader's resume.

| Status | Writing treatment |
|---|---|
| HAVE | Compress fundamentals; emphasize Staff-level design and interview articulation |
| PARTIAL | Connect existing evidence to market vocabulary and teach the missing scope |
| GAP | Teach architecture, implementation, failure modes and a defensible artifact |

---

## Part I — Staff Scope and Interview Architecture

| Ch | Title | Skills — target / aggregate Core | Status | Editorial rationale |
|---:|---|---|---|---|
| 1 | Staff+ scope, technical judgement and security strategy | Technical leadership (16.0% / 16.7%), Strategy & roadmap (30.5% / 21.7%) | HAVE / PARTIAL | One decision-making chapter connecting technical direction, prioritization and multi-quarter execution. |
| 2 | Influence, mentoring and written technical decisions | Cross-functional partnership (48.9% / 37.4%), Mentoring & growing engineers (26.0% / 27.0%), Written communication (4.6% / 5.7%) | GAP / PARTIAL / HAVE | Cross-functional partnership is now the largest measured gap; the chapter must turn influence into practised stakeholder mapping, negotiation and decision evidence. |

## Part II — Threat Modelling and Product Security

| Ch | Title | Skills — target / aggregate Core | Status | Editorial rationale |
|---:|---|---|---|---|
| 3 | Threat modelling for AI and distributed systems | Threat modelling (19.8% / 11.2%) | HAVE | The shared language of Staff system-design interviews and the bridge from hardware security into AI systems. |
| 4 | Application security and secure delivery | Application security (18.3% / 10.4%), Secure SDLC (4.6% / 1.6%) | PARTIAL / HAVE | Secure SDLC remains the delivery wrapper around product and AI application-security decisions. |
| 5 | Offensive validation and vulnerability reduction | Penetration testing (19.1% / 9.5%), Vulnerability management (12.2% / 10.0%) | HAVE | Keeps discovery, proof, prioritization, remediation and regression in one risk-reduction loop. |
| 6 | Identity, authorization, zero trust and secrets | Identity & access management (12.2% / 11.6%), Secrets management (4.6% / 4.4%), Zero trust architecture (3.8% / 2.6%) | HAVE / GAP / GAP | Extends human IAM to workloads, agents, delegation and revocation; secrets and zero trust are implementation sections. |
| 7 | Cryptography and hardware-backed roots of trust | Cryptography (7.6% / 8.1%), Secure boot & root of trust (2.3% / 2.6%), Firmware security (1.5% / 3.8%), HSM / secure element (0.8% / 1.2%) | HAVE / GAP / GAP / HAVE | Retained as the reader's differentiator and the trust substrate for attestation, keys and confidential AI infrastructure. |

## Part III — AI and LLM Security

| Ch | Title | Skills — target / aggregate Core | Status | Editorial rationale |
|---:|---|---|---|---|
| 8 | Agentic AI security: identity, delegation and tool boundaries | Agentic AI security (55.0% / 34.7%), Agent delegation & authorization (0.8% / 0.3%) | HAVE / GAP | The role-specific hub; deterministic authority and sandbox boundaries remain explicit engineering overrides. |
| 9 | Prompt injection, RAG and the LLM application trust boundary | Prompt injection defence (18.7% / 4.0%), RAG security (5.8% / 4.3%), OWASP LLM Top 10 (1.2% / 0.4%) | HAVE / GAP / GAP | Adds authorization-preserving retrieval, dynamic relationship checks, ingestion isolation and deletion evidence. |
| 10 | Guardrails, safety filters and secure failure behaviour | AI guardrails & safety filters (34.5% / 11.2%), AI alignment (1.8% / 1.2%) | GAP | Adds control/data-plane separation, signed policy distribution, latency budgets and capability-specific secure degradation. |
| 11 | Security evaluations, benchmarks and release gates | Evals & benchmarking (15.8% / 6.7%), Safe rollout & canary (2.9% / 0.9%) | GAP | Adds uncertainty bounds, paired regression decisions, sequential canaries and judge calibration. |
| 12 | LLM red teaming and adversarial validation | LLM red teaming (22.1% / 7.0%), MITRE ATLAS (0.8% / 0.1%) | HAVE | Converts existing offensive depth into AI-specific, reproducible validation. |
| 13 | Attacks on models: poisoning, extraction, inversion and membership inference | Adversarial ML (5.3% / 1.2%), Training data poisoning (3.1% / 0.7%), Privacy attacks on models (2.3% / 0.6%), Model extraction & theft (1.5% / 0.4%) | GAP | A compact target-role-supported chapter covering model-layer failure classes without fragmenting them. |

## Part IV — Cloud and AI Platform Security

| Ch | Title | Skills — target / aggregate Core | Status | Editorial rationale |
|---:|---|---|---|---|
| 14 | Kubernetes and container security | Kubernetes security (18.3% / 18.5%), Docker & containers (6.9% / 7.0%) | GAP | Kubernetes remains the AI execution control plane; container security is prerequisite implementation knowledge. |
| 15 | Cloud security architecture across AWS, GCP and Azure | AWS (26.0% / 24.5%), GCP (19.1% / 17.0%), Azure (15.3% / 16.6%) | GAP / GAP / HAVE | One provider-neutral security contract with explicit AWS, GCP and Azure implementations. |
| 16 | Infrastructure as code and secure deployment | Terraform / IaC (6.1% / 10.7%) | GAP | IaC is a privileged compiler for cloud authority and deserves independent implementation depth. |
| 17 | CI/CD, software and model supply chains | CI/CD security (15.2% / 16.9%), Supply chain security (4.1% / 2.9%), Model provenance & supply chain (0.6% / 0.3%), Model & data lineage (1.2% / 0.8%), AI asset inventory (1.2% / 0.8%), MLOps (9.9% / 7.5%) | HAVE / GAP | Adds provenance-bound model releases, workload signing, admission verification and atomic dependency-set rollback. |
| 18 | Detection, observability and abuse monitoring for AI services | Detection engineering (4.1% / 9.2%), Observability (15.2% / 15.1%), Abuse & misuse monitoring (14.0% / 3.1%) | PARTIAL / GAP / GAP | Adds trace graphs, versioned GenAI telemetry conventions, privacy-separated evidence paths and reversible closed-loop containment. |
| 19 | Incident response and containment for AI systems | Incident response (16.0% / 14.2%), AI incident response (0.0% / 0.0%) | GAP | Independent scope for command, containment, evidence preservation, recovery and executive coordination. |

## Part V — Systems, Data and Model Engineering

| Ch | Title | Skills — target / aggregate Core | Status | Editorial rationale |
|---:|---|---|---|---|
| 20 | Distributed systems and multi-tenant inference isolation | Distributed systems (22.9% / 14.8%), Multi-tenant AI isolation (1.5% / 2.8%), Inference & model serving security (1.5% / 2.2%) | GAP | Partial failure, revocation, tenant ownership and serving isolation are one system-design boundary. |
| 21 | Secure data pipelines and data modelling | Data pipelines (12.3% / 12.1%), SQL & data modelling (11.1% / 9.3%), MLOps (9.9% / 7.5%) | GAP | Adds security-aware contracts, immutable lineage graphs, deletion workflow states and training/serving skew validation. |
| 22 | Fine-tuning, training and model lifecycle controls | Fine-tuning & training (10.7% / 7.3%), PyTorch (5.3% / 6.3%), MLOps (7.6% / 7.3%) | GAP / HAVE / GAP | Training security is taught as a reproducible lifecycle, with framework syntax kept subordinate to controls. |

## Part VI — Assurance, Governance and Regulated Environments

| Ch | Title | Skills — target / aggregate Core | Status | Editorial rationale |
|---:|---|---|---|---|
| 23 | Security assurance and AI governance | ISO 27001 (6.4% / 4.2%), SOC 2 (5.8% / 4.0%), AI governance & NIST AI RMF (17.5% / 5.1%) | GAP | Adds testable governance claims, policy-as-code enforcement, signed evidence packages and expiring scoped exceptions. |
| 24 | Government authorization and privacy engineering | FedRAMP (4.6% / 2.9%), GDPR / privacy (9.2% / 6.3%), HIPAA (7.6% / 4.4%), FDA / medical device (2.3% / 4.0%) | GAP / GAP / HAVE / HAVE | One engineering chapter on boundaries, regulated data, authorization and verifiable evidence. |

## Part VII — Security Foundations for AI Platforms

| Ch | Title | Skills — target / aggregate Core | Status | Editorial rationale |
|---:|---|---|---|---|
| 25 | Cloud security foundations for AI engineers | AWS (26.0% / 24.5%), GCP (19.1% / 17.0%), Azure (15.3% / 16.6%), Identity & access management (12.2% / 11.6%), Terraform / IaC (6.1% / 10.7%) | BEGINNER PATH | Establishes cloud vocabulary, shared responsibility, IAM, networking, data protection, evidence and recovery before the advanced multi-cloud treatment in Chapter 15. |
| 26 | Cloud API backends, response semantics and security | API design (3.8% / 4.6%), Application security (18.3% / 10.4%), Identity & access management (12.2% / 11.6%), Testing & automation (3.8% / 2.9%) | BEGINNER PATH | Builds a three-axis model of cloud backends—caller, protocol and hosting—then teaches response semantics, authentication, authorization, validation, scanner evidence and report review using real sec-api correctness-preview cases. |
| 27 | AI infrastructure security from data to inference | Distributed systems (22.9% / 14.8%), Kubernetes security (18.3% / 18.5%), Observability (13.7% / 15.1%), Data pipelines (13.7% / 12.8%), MLOps (7.6% / 7.3%), Fine-tuning & training (10.7% / 7.3%) | BEGINNER PATH | Provides one lifecycle map across data, training, artifacts, clusters, deployment, inference, monitoring and retirement, with the existing specialist chapters supplying deeper implementation detail. |

---

## Part VIII — Engineering Agentic CLIs and Multi-Agent Systems

| Ch | Title | Skills — target / aggregate Core | Status | Editorial rationale |
|---:|---|---|---|---|
| 28 | Jev engineering: typed judgments for agentic CLIs and multi-agent systems | Explicit owner request; no new demand measurement | EDITORIAL ADDITION | Teaches Choice, Score and Noul, uncertainty, bounded state, policy separation, Codex/Claude integration, and source-reviewed AT Brain and RCode case studies. |
| 29 | Graph engineering: dependencies, provenance and multi-agent execution | Explicit owner request; no new demand measurement | EDITORIAL ADDITION | Separates task, evidence, knowledge and execution graphs; teaches readiness, invalidation, reducers, ownership, fencing and crash recovery across CLI workers. |
| 30 | Loop engineering: bounded execution and verified multi-agent outcomes | Explicit owner request; no new demand measurement | EDITORIAL ADDITION | Integrates judgments and graphs into measurable loops with independent checks, budgets, stopping, escalation, process lifecycle, durable recovery and restrained learning. |

Read Chapters 28–30 in order after Chapters 8, 10, 11, 18 and 20. Chapter 28 supplies semantic advice, Chapter 29 structures relationships and ownership, and Chapter 30 controls execution and verification. The AT Brain report dated October 5 and the earlier local Jev/Graphing research provide case studies; current public sources and their retrieval limits are recorded in `research/2026-10-05/RESEARCH_NOTES.md`.

## Appendices

| App | Title | Skills — target / aggregate Core | Status | Treatment |
|---|---|---|---|---|
| A | Python for security and AI engineering | Python (46.6% / 37.3%) | HAVE | Reference and implementation language, not a relearning objective. |
| B | Memory-safe systems: Rust, C/C++ and Go | Rust (6.9% / 5.9%), C / C++ (6.9% / 7.2%), Go (0.8% / 1.9%) | GAP / HAVE / GAP | Target-company coding and systems-security preparation. |
| C | TypeScript and JavaScript for AI applications | TypeScript / JavaScript (12.2% / 10.7%) | GAP | Secure AI application and tool-integration implementation. |
| D | Secure API design and test automation | API design (3.8% / 4.6%), Testing & automation (3.8% / 2.9%) | GAP | Supporting implementation techniques. |
| E | Behavioural evidence bank from the reader's history | — | — | Truthful, reusable Staff-level evidence. |
| F | Consolidated interview drill set | — | — | Timed mixed-domain rehearsal. |

## Edition 4.6 revision priority

1. Chapter 2 — Cross-functional partnership: 48.0% target-role GAP.
2. Chapter 10 — Guardrails and control planes: 34.5% target-role GAP.
3. Chapter 15 — AWS/GCP cloud architecture: 24.0% and 18.1% target-role GAPs.
4. Chapter 20 — Distributed systems: 22.8% target-role GAP.
5. Chapter 23 — AI governance: 17.5% target-role GAP.
6. Chapter 14 — Kubernetes: 17.0% target-role GAP.
7. Chapter 11 — Evals and statistical release gates: 15.8% target-role GAP.
8. Chapter 18 — Observability and abuse monitoring: 15.2% and 14.0% target-role GAPs.
9. Chapter 19 — Incident response: 13.5% target-role GAP.
10. Chapter 21 — Data pipelines and SQL/data modelling: 12.3% and 11.1% target-role GAPs.
11. Chapter 17 — MLOps and verifiable model supply chains: 9.9% target-role GAP.
12. Chapter 9 — RAG authorization and corpus security: 5.8% target-role GAP.

## Edition 4.6 additive technical sections

- **Chapter 9:** authorization-first vector retrieval, relationship-aware access, parser isolation and deletion evidence.
- **Chapter 10:** guardrail control/data planes, signed policy bundles, enforcement cascades and capability-specific degradation.
- **Chapter 11:** confidence bounds, paired comparisons, sequential canaries, judge agreement and contamination resistance.
- **Chapter 17:** SLSA/in-toto-style provenance, keyless signing, admission policy and dependency-complete rollback.
- **Chapter 18:** traceable GenAI telemetry, operational/forensic separation, campaign detection and reversible containment.
- **Chapter 21:** security-aware data contracts, lineage graphs, deletion state machines and training/serving skew checks.
- **Chapter 23:** executable governance claims, machine-readable evidence packages and signed expiring exceptions.

## Decision on new chapters

Edition 4.6 retains Chapters 25–27 as an explicit pedagogical override. Market-demand coverage already existed, but coverage was not the same as accessibility or job transfer: cloud concepts assumed prior knowledge, API security was confined to Appendix D, and AI infrastructure controls were distributed across specialist chapters without a single lifecycle and evidence-review map.

- **Chapter 25** teaches cloud security from first principles and then points to Chapters 6, 14–16 and 19 for advanced depth.
- **Chapter 26** makes API security a first-class topic while retaining Appendix D as its code-oriented testing companion.
- **Chapter 27** integrates the AI platform lifecycle without replacing Chapters 8–22; it acts as their architectural map.
- These chapters are marked **BEGINNER PATH** because they are driven by learning-sequence needs rather than a new resume-status classification.

## Edition 4.7 editorial addition

This is an additive manuscript update authorized by the owner, independent of a job-market refresh. It adds a separate engineering track without changing the existing security curriculum. The new chapters follow the established chapter metadata, engineering context, threat model, architecture, implementation, production failure modes, design review, practical exercise, complete Interview Preparation answers, Chapter Summary and Further Study layout. Implementation subsections provide progressive technical depth and executable offline examples.

Primary-source research was collected on October 5, 2026. TypeSafe and Claude Code behavior is attributed to fetched documentation; Codex source observations are identified by their retrieved upstream revision because the official documentation pages were network-blocked. Local reports are distinguished from inspected code, hypothetical examples and fresh runtime evidence. The update does not claim a new publication or measured production performance.

## Maintenance rules

1. Use the securing-AI segment as the primary depth and revision-priority signal for this book.
2. Use aggregate demand as the stability check and for broad engineering prerequisites.
3. Do not create a chapter for a newly crossing skill when an existing chapter already owns its architecture boundary.
4. Require sustained demand across two reviews before adding or removing a chapter unless target-role interview evidence is decisive.
5. Keep the skills-to-book ledger and frozen snapshots with every release.
