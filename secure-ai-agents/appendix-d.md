# Appendix D: Principal AI Security Engineer Competency Map

This appendix answers a question Chapter 24 raises but does not fully resolve: what does *Principal* look like, concretely, across the breadth of AI agent security? It is a self-assessment instrument and a hiring rubric. The competency domains mirror the book's structure so a reader can trace any weak cell back to the chapter that develops it. The interview scenarios in D.2 are deliberately distinct from Chapter 24's set, extending coverage into browser platforms, enterprise knowledge, forensics, federation, and autonomous remediation. D.3 is the continuous-learning apparatus — the sources a Principal tracks so the map stays current as frameworks and attacks evolve.

The distinction between the top two levels is worth stating up front. A **Practitioner** implements controls correctly. An **Expert** designs the control and knows its failure modes. A **Principal** decides *which controls the organization builds*, defends the trade-off to a board, sets the paved road other teams travel, and is accountable when the model is wrong. Depth alone does not make a Principal; judgment under ambiguity and organizational leverage do.

---

## D.1 Skills Matrix, Depth Expectations, and Self-Assessment Rubric

Score yourself in each domain against the four proficiency levels. The behavioral descriptors are the load-bearing part: read across a row and locate the cell whose description you can defend with concrete work you have done.

### Proficiency descriptors by domain

| Competency Domain | Aware | Practitioner | Expert | Principal |
| :--- | :--- | :--- | :--- | :--- |
| **Agentic architecture** (Ch. 1–6) | Names the perception-plan-act-memory loop and autonomy levels | Builds bounded multi-step agents with tool binding and memory | Designs multi-agent topologies with durable execution and failure semantics | Sets org-wide reference architecture; owns the autonomy-level risk model |
| **Threat modeling** (Ch. 7) | Recites STRIDE and OWASP LLM Top 10 | Produces a threat model for one agent | Maps threats across STRIDE/MAESTRO/ATLAS and scores blast radius | Defines the org's threat-modeling method and scoping matrix |
| **Prompt injection & IFC** (Ch. 8, 17) | Explains direct vs. indirect injection | Deploys guard models and spotlighting | Implements CaMeL/Dual-LLM with taint tracking and knows their limits | Frames injection as information flow for the org; sets what IFC is mandatory where |
| **Memory & retrieval security** (Ch. 5, 9, 18) | Knows RAG and vector stores exist | Builds ACL-filtered retrieval | Designs provenance tagging and permission-aware RAG with erasure paths | Owns data-governance-through-context strategy across the platform |
| **Tool & supply chain** (Ch. 10, 21) | Knows MCP and tool poisoning exist | Onboards tools with schema validation | Hardens MCP with pinning, rug-pull detection, AI-BOM, SLSA | Sets vendor-assessment bar and supply-chain assurance policy |
| **Identity & IAM** (Ch. 14) | Knows NHI and OAuth exist | Implements OAuth 2.1 + PKCE for an agent | Designs SPIFFE attestation and RFC 8693 delegation chains | Owns the org's non-human identity and delegation architecture |
| **Runtime enforcement** (Ch. 15) | Knows gateways intercept tool calls | Writes OPA/Cedar policies | Builds intent verification and dynamic scope partitioning | Sets latency-budgeted enforcement standards platform-wide |
| **Isolation & sandboxing** (Ch. 16) | Knows containers vs. VMs differ | Configures gVisor/seccomp sandboxes | Designs ephemeral MicroVM pools and verifies escape resistance | Owns the isolation posture and multi-tenant boundary model |
| **Observability & forensics** (Ch. 19) | Knows tracing exists | Instruments OTel GenAI traces | Builds anomaly detection and immutable signed audit trails | Designs the AISOC and non-repudiation strategy |
| **Red teaming & eval** (Ch. 20) | Knows PyRIT/AgentDojo exist | Runs a benchmark and reads ASR | Builds custom harnesses wired into CI with drift tracking | Sets the org's assurance bar and external-assessment program |
| **Governance & compliance** (Ch. 22) | Names NIST AI RMF and EU AI Act | Maps controls to one framework | Operationalizes RMF + ISO 42001 with evidence artifacts | Chairs the review board; owns regulator-facing risk narrative |
| **Platform & leadership** (Ch. 23) | Understands paved-road concept | Contributes a golden template | Builds the secure agent SDK and policy management | Owns the platform strategy, maturity model, and roadmap |

### Self-assessment rubric

Score each domain 1–4 (Aware=1 … Principal=4). Interpret the totals across 12 domains (max 48):

| Band | Score | Interpretation |
| :--- | :--- | :--- |
| Emerging | 12–20 | Solid AppSec background; concentrate on agentic-specific domains (injection/IFC, tools, isolation) |
| Proficient | 21–32 | Strong senior engineer; deepen two or three domains to Expert and broaden governance |
| Principal-ready | 33–42 | Expert across most domains; demonstrate org-level leverage and cross-domain trade-off judgment |
| Principal | 43–48 | Sustained Expert/Principal breadth with proof of organizational impact |

The rubric is diagnostic, not a gate. A candidate at Principal in nine domains and Aware in two has a sharper profile than a flat Practitioner everywhere — but the two gaps are exactly what an interview loop will probe. Prioritize raising your two lowest domains one level over polishing a domain you already own; breadth is what separates the levels at the top.

Use the rubric honestly by attaching evidence to each self-score. "Expert in isolation" should mean you have shipped an ephemeral sandbox pool and can produce escape-test results, not that you have read Chapter 16. If you cannot name the artifact (a policy bundle, a trace, a threat model, a signed attestation) that proves a score, drop the score one level.

A final calibration note on the jump to Principal. The behavioral descriptors in the rightmost column share a common shape: they are all *ownership* statements — "sets," "owns," "chairs," "defines the org's method." This is deliberate. The transition from Expert to Principal is rarely a depth increase in a single domain; an Expert in isolation and a Principal in isolation may know the same facts about Firecracker. The difference is leverage and accountability: the Principal decides the organization's isolation posture, defends the latency-and-cost trade-off to platform leadership, writes the standard other teams build against, and is answerable when a tenant-boundary decision proves wrong under a real escape. Interview loops for the role probe this directly with questions like "how would you convince a product team to accept the latency cost of Dual-LLM" or "a partner org's agent caused a cascade — walk me through your response and what you change organizationally." Prepare for the role by rehearsing the ownership narrative, not only the technical mechanism.

---

## D.2 System Design Interview Scenarios and Model Answers

Five scenarios not covered in Chapter 24. For each, a model answer sketches requirements, architecture, key trade-offs, and the top three risks. In a real loop, spend the first five minutes on requirements and trust boundaries before drawing a box; interviewers weight scoping over component recall. A reliable structure for the whiteboard: state the assets and trust boundaries, name the autonomy level and blast radius, draw the data-flow with the untrusted-input edges marked, then place controls on those edges and close with the residual risks you are *not* mitigating and why. Naming residual risk explicitly is a Principal signal — it shows you distinguish a real security posture from the fiction that any single control solves injection.

### Scenario 1: Secure agentic browser platform for 10,000 employees

**Requirements.** Employees delegate web tasks (research, form-filling, procurement) to an agent that drives real authenticated sessions. Must prevent indirect prompt injection from page content, block silent exfiltration, and preserve per-user least privilege.

**Architecture.** Per-session **isolated headless browser** instances (see Ch. 16.3.1), one per task, destroyed on completion. Page content enters the model only through a **provenance-tagged, spotlighted** channel marked untrusted (see Ch. 17.1.3). A **Dual-LLM** split keeps a privileged planner from ever ingesting raw page text; a quarantined reader summarizes under taint (see Ch. 17.2.1). Egress from the browser passes an **anti-exfiltration** filter that blocks cross-origin image/DOM beacons (see Ch. 16.3.2). Sensitive actions (auth, payment) trigger **human-in-the-loop** interception (see Ch. 16.3.3).

**Trade-offs.** Per-session browsers cost cold-start latency and compute; a warm ephemeral pool amortizes it. The Dual-LLM split reduces injection blast radius but roughly doubles token cost and adds latency — justified only for high-privilege tasks.

**Top 3 risks.** (1) Indirect injection via hidden DOM payloads driving authenticated actions; mitigate with IFC, not classifiers. (2) Session-token theft or reuse across tasks; mitigate with per-session credential binding and egress brokering. (3) Same-context confusion where the agent treats page text as instruction; mitigate with structural isolation and same-origin-aware trust labeling (see Ch. 13.2.1).

### Scenario 2: Permission-aware enterprise knowledge agent over SharePoint/Confluence

**Requirements.** Answer questions over corporate documents while strictly honoring each user's document-level permissions, including revoked and deleted content.

**Architecture.** **Late-binding authorization**: retrieval filters by the *asking user's* live ACLs at query time, not by index-build-time permissions (see Ch. 18.1.2). Vector store enforces **document-level ACLs**; a reindex-hygiene job purges deleted-document residue (see Ch. 9.3.2). Guard against **inference-time aggregation** where several permitted chunks reconstruct a restricted whole (see Ch. 9.3.3). All context is **provenance-tagged** with source and classification (see Ch. 5.4.1); output passes PII masking (see Ch. 17.3.1).

**Trade-offs.** Late-binding auth adds per-query ACL evaluation latency; caching authorization decisions trades freshness for speed and risks stale-permission leakage. Chunk-level ACLs increase index complexity but are the only defense against partial-document leakage.

**Top 3 risks.** (1) Stale permission propagation leaking revoked content; mitigate with late binding and eventual-consistency SLAs on ACL sync. (2) Aggregation attacks; mitigate with sensitivity-aware answer synthesis limits. (3) Embedding inversion reconstructing sensitive text from vectors (see Ch. 9.1.2); mitigate with access controls on the vector store itself.

### Scenario 3: Agent observability and forensics platform

**Requirements.** Provide trajectory-level tracing, tamper-evident audit, and post-incident reconstruction across thousands of non-deterministic agent runs, without leaking sensitive context into logs.

**Architecture.** Instrument with **OpenTelemetry GenAI** semantic conventions and OpenInference spans for prompts, reasoning, and tool calls (see Ch. 19.1.1). Audit stream is **immutable and cryptographically chained/signed** for non-repudiation (see Ch. 19.2.2). Sensitive context is **masked** at capture, preserving trace structure (see Ch. 19.2.3). A reconstruction service replays spans to rebuild a trajectory under non-determinism (see Ch. 19.4.1). Feeds a **SIEM/SOAR AISOC** workflow (see Ch. 19.3.4).

**Trade-offs.** Full context capture maximizes forensic value but conflicts with privacy and retention limits; masking plus scoped retention balances them. Cryptographic chaining adds write latency; batching signatures amortizes it.

**Top 3 risks.** (1) Sensitive data leaking into logs; mitigate with capture-time masking and DLP on the log plane. (2) Log tampering undermining legal admissibility; mitigate with signed append-only chains. (3) Trace volume overwhelming storage/cost; mitigate with sampling that preserves security-relevant spans.

### Scenario 4: Cross-org A2A federation with mutual attestation

**Requirements.** Agents from partner organizations collaborate via **Agent2Agent (A2A)** without implicit trust, with verifiable identity and bounded delegation across the trust boundary.

**Architecture.** Each workload carries a **SPIFFE** identity with **SPIRE** attestation; cross-org calls require **mutual attestation** before any Task object is accepted (see Ch. 14.1.2). **Agent Cards** are verified and checked for capability overclaiming (see Ch. 10.3.1). Delegation uses **RFC 8693 token exchange** with audience restriction so a partner agent's authority is scoped and time-bound (see Ch. 14.2.2). An **egress broker** mediates all agent-to-agent calls (see Ch. 15.3.4). Guard against **MCP-to-A2A trust laundering** at the boundary (see Ch. 10.3.3).

**Trade-offs.** Mutual attestation adds handshake latency and PKI operational burden; short-lived SVIDs increase issuance load but shrink the revocation window. Federated trust broadens capability at the cost of a larger, partner-controlled attack surface.

**Top 3 risks.** (1) Agent Card spoofing / discovery poisoning; mitigate with signed cards and attested identity. (2) Confused-deputy escalation across the org boundary (see Ch. 11.1.2); mitigate with scoped, audience-restricted delegation. (3) Cascade propagation of a poisoned payload between trusted peers (see Ch. 11.2); mitigate with per-hop taint labeling and blast-radius limits.

### Scenario 5: Safe autonomous incident-remediation agent for cloud infrastructure

**Requirements.** An agent that detects and remediates cloud misconfigurations and incidents autonomously, with strict limits on irreversible or high-blast-radius actions.

**Architecture.** Actions classified by **reversibility**; irreversible ones (delete, scale-to-zero, key rotation) require **human-in-the-loop** step-up (see Ch. 22.2.1). A **durable execution** engine gives checkpointing, idempotency, and compensating rollback for side-effecting steps (see Ch. 2.4.1, Ch. 2.4.3). Every remediation runs through the **gateway PDP** with intent verification comparing plan to action (see Ch. 15.2.1). Credentials are **short-lived and minted per task** (see Ch. 14.3.3). A **kill switch** and credential revocation bound the blast radius (see Ch. 19.4.2).

**Trade-offs.** Requiring approval for irreversible actions slows response — the core autonomy-versus-safety tension; resolve by pre-approving well-understood reversible remediations and gating the rest. Durable execution adds infrastructure but is the only safe way to make side effects retriable.

**Top 3 risks.** (1) A poisoned alert or log inducing a destructive remediation (indirect injection into the trigger); mitigate with IFC on ingested telemetry. (2) Over-permissioned remediation credentials enabling lateral movement; mitigate with least-privilege, per-task tokens. (3) Runaway remediation loops (denial of wallet / cascading changes); mitigate with step caps, circuit breakers, and blast-radius limits.

---

## D.3 Standards, Research, and Advisory Sources to Track Continuously

A Principal's map decays without maintenance. The table names sources by organization and what each is *useful for*, with a review cadence. No URLs are invented; locate each by its official name.

| Source | Organization | Useful For | Cadence |
| :--- | :--- | :--- | :--- |
| Top 10 for LLM Applications; Agentic Security Initiative | OWASP | Impact-oriented threat taxonomy; agentic threat catalog | Quarterly; on release |
| ATLAS knowledge base | MITRE | Adversarial TTPs and technique families for detections | Quarterly |
| MAESTRO layered threat model | Cloud Security Alliance | Layered agentic threat modeling reference | On update |
| AI Risk Management Framework + Generative AI Profile | NIST | Governance functions and control themes | On revision |
| ISO/IEC 42001; 23894; 27001 | ISO/IEC | Certifiable AIMS clauses and control mapping | Annual review |
| EU AI Act + delegated standards | European Commission / CEN-CENELEC | High-risk and GPAI obligations, timelines | On milestone |
| Model Context Protocol specification | MCP maintainers | Protocol lifecycle, authorization, transport changes | Monthly during churn |
| Agent2Agent (A2A) specification | A2A maintainers | Agent Cards, Task objects, discovery semantics | On release |
| SPIFFE/SPIRE documentation | CNCF | Workload identity and attestation patterns | On release |
| OPA/Rego, Cedar, OpenFGA docs | CNCF / AWS / Auth0-Okta | Policy-as-code language and engine changes | On release |
| Sigstore, in-toto, SLSA | OpenSSF | Supply-chain signing and provenance levels | Quarterly |
| OpenTelemetry GenAI conventions; OpenInference | CNCF / Arize | Telemetry semantic conventions for agents | On release |
| PyRIT, Garak, AgentDojo, Promptfoo | Microsoft / NVIDIA / ETH Zürich / community | Red-team tooling and benchmark methodology | Monthly |
| CWE / CVE and vendor security advisories | MITRE / vendors | Concrete vulnerability classes and disclosures | Continuous |
| Frontier-lab safety and system cards | Model providers | Alignment, evaluation, and known-limitation disclosures | On publication |
| Peer-reviewed and preprint venues (security and ML) | USENIX Security, IEEE S&P, ACM CCS, NeurIPS/ICML, arXiv | Novel attacks (GCG-class, IFC advances like CaMeL) and defenses | Monthly |
| Practitioner security research blogs and disclosure writeups | Independent researchers / security vendors | Early signal on in-the-wild agentic TTPs | Weekly skim |

Two habits make the difference. First, separate *stable* sources (STRIDE, the threat classes in Appendix A.1) from *volatile* ones (framework version numbers, tool APIs, the EU AI Act's evolving standards) and spend your attention budget on the volatile tier. Second, close the loop: when a new attack appears at USENIX or in a disclosure writeup, add a row to your red-team corpus (see Appendix B.4) and a check to your review checklists (see Appendix C). Tracking without translating into tests and checklists is consumption, not competency.
