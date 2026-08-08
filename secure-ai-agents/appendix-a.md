# Appendix A: Cross-Framework Threat Mapping Matrix

This appendix is the reference spine for the entire book. Where the chapters develop threats and controls narratively, this appendix pins each threat class to the taxonomies a Principal AI Security Engineer is expected to speak fluently: the **OWASP Top 10 for LLM Applications**, the **OWASP Agentic Security Initiative** threat catalog, **MITRE ATLAS**, **CSA MAESTRO**, **STRIDE**, **NIST AI RMF**, and **ISO/IEC 42001**. Frameworks disagree on boundaries — MAESTRO is layered, ATLAS is tactic/technique-oriented, STRIDE is property-oriented, OWASP is impact-oriented. The value is not any single mapping but the crosswalk: it lets you translate a finding from a red-team report into a governance control, an audit clause, and a specific chapter of engineering guidance without losing meaning.

Two conventions apply throughout. First, where a framework does not publish a stable numeric identifier for a concept, the cell names the category descriptively rather than inventing an ID — fabricated identifiers are worse than honest prose in an audit. Second, every row is traceable: Section A.2 maps each threat to the exact chapter and section where the defense is engineered, so this appendix doubles as an index into the book.

---

## A.1 OWASP LLM/Agentic Top 10 ↔ MITRE ATLAS ↔ CSA MAESTRO ↔ STRIDE

The following crosswalk covers the agentic threat classes that recur across Parts II and III. **OWASP LLM ID** references the LLM Top 10 (2025 list); **OWASP Agentic** references the Agentic Security Initiative threat naming (T-codes where published, descriptive otherwise). **ATLAS** cites the tactic family and representative technique family rather than a single technique, because most agentic attacks chain several. **MAESTRO Layer** uses the seven-layer model (L1 Foundation Model, L2 Data Operations, L3 Agent Frameworks, L4 Deployment/Infrastructure, L5 Evaluation/Observability, L6 Security/Compliance, L7 Agent Ecosystem). **STRIDE** gives the primary violated property; several threats touch more than one, and the dominant one is listed first.

| Threat Class | OWASP LLM ID | OWASP Agentic Threat | MITRE ATLAS Tactic / Technique Family | CSA MAESTRO Layer | STRIDE (primary) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Direct prompt injection / jailbreak** | LLM01: Prompt Injection | Prompt Injection (direct) | Initial Access; ATLAS "LLM Prompt Injection" technique family | L1, L3 | Tampering, Elevation of Privilege |
| **Indirect prompt injection (IPI)** | LLM01: Prompt Injection | Prompt Injection (indirect) | Initial Access + Execution via compromised data; "LLM Prompt Injection: Indirect" | L2, L3 | Tampering, Elevation of Privilege |
| **Memory poisoning** | LLM04: Data and Model Poisoning (persistent memory variant) | Memory Poisoning | Persistence; Poison Training/Data-store technique family | L2, L3 | Tampering, Repudiation |
| **Tool misuse / uncontrolled tool execution** | LLM06: Excessive Agency (execution facet) | Tool Misuse | Execution; "LLM Plugin/Tool Compromise" family | L3, L7 | Elevation of Privilege, Tampering |
| **Excessive agency / over-permissioned actions** | LLM06: Excessive Agency | Excessive Agency | Privilege Escalation; Impact | L3, L6 | Elevation of Privilege |
| **Supply chain compromise (model, tool, dependency)** | LLM03: Supply Chain | Agent Supply Chain / Poisoned Tooling | ML Supply Chain Compromise tactic; poisoned artifact families | L2, L4, L7 | Tampering, Spoofing |
| **Sensitive information disclosure** | LLM02: Sensitive Information Disclosure | Sensitive Information Disclosure | Exfiltration; ML Model/Data exfiltration family | L2, L5 | Information Disclosure |
| **Identity spoofing (agent/tool impersonation)** | LLM06 / LLM03 (identity facet) | Identity Spoofing / Agent Impersonation | Defense Evasion; Impersonation family | L3, L7 | Spoofing |
| **Multi-agent cascade / propagation failure** | LLM06: Excessive Agency (systemic facet) | Cascading Failure / Agent Communication Poisoning | Lateral Movement; Impact | L3, L7 | Elevation of Privilege, Denial of Service |
| **Denial of wallet / unbounded consumption** | LLM10: Unbounded Consumption | Resource Exhaustion / Denial of Wallet | Impact; ML Denial-of-Service family | L4, L1 | Denial of Service |
| **Model theft / extraction** | LLM10: Unbounded Consumption (extraction facet) / Model Theft | Model/IP Extraction | Exfiltration; ML Model Extraction technique | L1, L4 | Information Disclosure, Spoofing |
| **Insecure output handling** | LLM05: Improper Output Handling | Unsafe Output Consumption | Execution (downstream); "LLM-Generated Code Execution" family | L3, L4 | Tampering, Elevation of Privilege |

Reading the table as an attack narrative clarifies why single-framework thinking fails. Consider **indirect prompt injection**: OWASP frames it as an input-trust failure (LLM01), ATLAS frames the same event as *Initial Access followed by Execution* when the injected instruction triggers a tool call, MAESTRO locates the root cause at L2 (the data operations layer that ingested poisoned content) while the damage manifests at L3 (the agent framework that acted on it), and STRIDE labels it Tampering escalating to Elevation of Privilege. A finding that names only "prompt injection" loses the L2-versus-L3 distinction that tells you *where* to place the control — a lesson developed at length in the information-flow framing (see Ch. 8.4 and Ch. 17.2).

The **confused deputy** pattern deserves a note because it spans several rows. It is the mechanism underneath tool misuse, identity spoofing, and cascade failure alike: an agent with legitimate authority is induced to exercise that authority on behalf of an attacker who lacks it. In multi-agent systems it appears as a low-privilege external agent laundering a request through a high-privilege internal one (see Ch. 11.1.2); in MCP it appears as consent-token passthrough (see Ch. 10.2.4). STRIDE calls it Elevation of Privilege; ATLAS treats it as Privilege Escalation; MAESTRO puts it at L3/L7. The crosswalk keeps these views synchronized.

---

## A.2 Threat ↔ Control ↔ Chapter Traceability Table

Every threat class in A.1 is answered somewhere in the book by a concrete, engineered control. This table names the primary defensive control and the exact section where it is built. Controls are layered by design — no single row is a complete mitigation, and the "known limit" column is deliberately included because presenting any control as total protection against injection or agency abuse would violate the book's core thesis (see Ch. 8.4).

| Threat Class | Primary Engineered Control | Chapter Ref | Known Limit |
| :--- | :--- | :--- | :--- |
| Direct prompt injection | Instruction hierarchy + input guard ensemble + spotlighting/data marking | Ch. 3.3.1, Ch. 17.1.1, Ch. 17.1.3 | Classifier-only guards bypassed by paraphrase/encoding; hierarchy is soft |
| Indirect prompt injection | Capability-based IFC (CaMeL), Dual-LLM / Plan-Then-Execute, taint tracking | Ch. 17.2.1, Ch. 17.2.2, Ch. 17.2.3 | Utility cost; taint must cover summarization and memory writes |
| Memory poisoning | Provenance tagging, memory write policies, ACL-filtered retrieval | Ch. 5.4.1, Ch. 5.4.3, Ch. 9.2.1 | Poisoned content can be laundered through summarization if untagged |
| Tool misuse / injection into tool args | Argument validation engine, least-privilege tool design, schema tightening | Ch. 15.2.2, Ch. 14.4.2, Ch. 10.1.2 | Semantic misuse of a valid tool call evades syntactic validation |
| Excessive agency | Pre-execution intent verification, HITL for irreversible actions, autonomy caps | Ch. 15.2.1, Ch. 22.2.1, Ch. 15.2.3 | Intent verification depends on a trustworthy stated plan |
| Supply chain compromise | AI-BOM, Sigstore/in-toto signing, SLSA provenance, MCP vendor assessment | Ch. 21.2.1, Ch. 21.2.2, Ch. 21.2.3 | Provenance proves origin, not benignity; review is still required |
| Sensitive information disclosure | Permission-aware RAG, output PII/PHI masking, DLP on agent egress | Ch. 18.1.2, Ch. 17.3.1, Ch. 18.3.2 | Inference-time aggregation reconstructs restricted data from permitted chunks |
| Identity spoofing | NHI + SPIFFE/SPIRE attestation, A2A Agent Card verification, message signing | Ch. 14.1.2, Ch. 10.3.1, Ch. 19.2.2 | Attestation binds workloads, not the semantic honesty of an agent |
| Multi-agent cascade | Inter-agent authN, egress brokering, blast-radius limits, deadlock detection | Ch. 11.1.1, Ch. 15.3.4, Ch. 22.4.2, Ch. 6.4.3 | Trust between authenticated peers can still propagate a poisoned payload |
| Denial of wallet | Dynamic rate limiting, cost caps, execution-step thresholds, circuit breakers | Ch. 15.2.3, Ch. 2.3.3, Ch. 8.3.3 | Legitimate long trajectories are hard to distinguish from abusive loops |
| Model theft / extraction | API abuse detection, rate/anomaly limits, confidential computing for weights | Ch. 12.1.2, Ch. 15.2.3, Ch. 3.4.1 | Distillation via legitimate-looking queries is slow but hard to block |
| Insecure output handling | AST/static analysis of generated code, output guards, sandboxed execution | Ch. 17.3.2, Ch. 17.3.3, Ch. 16.1.1 | Static analysis misses obfuscated or environment-dependent behavior |

The traceability table is the artifact an interview panel or an audit committee will actually probe. When asked "how do you defend against indirect prompt injection," the weak answer names a guard model; the Principal-level answer walks this row: an input guard *reduces* volume, but the load-bearing control is architectural — capability-based information flow control (CaMeL) or a Dual-LLM split that ensures untrusted data can never be interpreted as privileged instructions, backed by taint tracking that survives summarization and memory writes (see Ch. 17.2). Then you name the limit: these patterns trade utility for safety, so you scope them to high-blast-radius tools rather than applying them universally.

A second use of this table is *coverage analysis*. Run your own agent platform's controls against the left column. Any threat class without a control in your architecture is a gap; any control that appears only once (no defense in depth) is a single point of failure. The book's reference architecture (see Ch. 23.1.1) is essentially this table instantiated as a deployable stack: gateway, identity provider, guardrails, sandbox, data plane, and telemetry, each terminating one or more rows.

---

## A.3 NIST AI RMF and ISO/IEC 42001 Control Crosswalk

Governance frameworks translate the engineering controls above into obligations an organization can be audited against. The **NIST AI Risk Management Framework** organizes activity into four functions — **Govern**, **Map**, **Measure**, and **Manage** — each expanded by its Generative AI Profile. **ISO/IEC 42001** specifies an AI Management System (AIMS) with clauses (4–10, mirroring the ISO management-system structure) and an Annex A of control themes. The crosswalk below pairs RMF subcategory *themes* (paraphrased, not quoted verbatim) with the ISO 42001 clause/Annex theme they satisfy, the book chapter that engineers the evidence, and — the column auditors care about most — the concrete **technical evidence artifact** that demonstrates the control is real rather than aspirational.

| NIST AI RMF Function | Subcategory Theme | ISO/IEC 42001 Clause / Annex A Theme | Book Chapter | Technical Evidence Artifact |
| :--- | :--- | :--- | :--- | :--- |
| **Govern** | Accountability, roles, and risk culture for AI | Clause 5 (Leadership); Annex A: AI policy, roles & responsibilities | Ch. 22.4.1, Ch. 23.3.2 | Charter of the AI Safety & Security Review Board; RACI for agent ownership |
| **Govern** | Inventory of AI systems and their lifecycle | Clause 8 (Operation); Annex A: AI system lifecycle, resource documentation | Ch. 1.4.2, Ch. 21.1.1 | Agent inventory / registry export; AI-BOM per agent |
| **Govern** | Third-party and supply-chain risk oversight | Clause 8; Annex A: third-party and supplier relationships | Ch. 21.2.3, Ch. 22.3.2 | Vendor assessment records; signed MCP server provenance attestations |
| **Map** | Context, intended use, and impact framing | Clause 4 (Context of the organization); Annex A: AI system impact assessment | Ch. 7.1.2, Ch. 22.1.2 | AI Scoping Matrix; documented impact/conformity assessment |
| **Map** | Risk and threat enumeration for the system | Annex A: risk assessment; Clause 6 (Planning) | Ch. 7.2, Ch. 7.3 | STRIDE/MAESTRO threat model; ATLAS-mapped attack path catalog |
| **Map** | Data provenance and characterization | Annex A: data for AI systems, data quality/provenance | Ch. 5.4.1, Ch. 18.1.1 | Context provenance tags; data classification and lineage records |
| **Measure** | Evaluation of security and robustness | Clause 9 (Performance evaluation); Annex A: AI performance & verification | Ch. 20.2.1, Ch. 20.3 | Red-team reports; Attack Success Rate and Resilience Ratio metrics |
| **Measure** | Continuous monitoring and telemetry | Clause 9; Annex A: monitoring and measurement | Ch. 19.1.1, Ch. 19.3.1 | OpenTelemetry GenAI traces; anomaly-detection dashboards and alerts |
| **Measure** | Test/evaluation integrated into the pipeline | Clause 8; Annex A: verification & validation | Ch. 20.4.1, Ch. 20.4.2 | CI security-gate results; regression suite for prompt injection |
| **Manage** | Risk treatment and control implementation | Clause 8 (Operational planning & control); Annex A: controls | Ch. 15, Ch. 16, Ch. 17 | Gateway policy bundles; sandbox configs; guardrail deployment manifests |
| **Manage** | Incident response and recovery | Clause 10 (Improvement); Annex A: incident management | Ch. 19.4, Ch. 22.4.3 | Incident playbooks; kill-switch runbooks; post-mortem records |
| **Manage** | Change management and safe release | Clause 8; Annex A: lifecycle & change control | Ch. 21.1.2, Ch. 21.3.1 | Threat-model diff on change; canary-autonomy rollout logs |
| **Manage** | Access control and identity governance | Annex A: access management; Clause 8 | Ch. 14.1.1, Ch. 14.3.1 | NHI issuance records; OPA/Cedar policy bundles with test coverage |

The crosswalk exposes a structural truth: NIST AI RMF is descriptive (it tells you *what functions to perform*), ISO/IEC 42001 is certifiable (it tells you *what to document and audit*), and the book chapters supply the *technical substance* that both frameworks assume but do not specify. An auditor asking for evidence of the RMF "Manage" function under ISO Clause 8 is really asking to see gateway policy bundles, sandbox configurations, and guardrail manifests — artifacts produced by Chapters 15 through 17. Governance without these artifacts is a paperwork exercise; artifacts without governance are ungoverned point solutions. The Principal AI Security Engineer's job is to keep the two columns in lockstep.

A practical discipline follows from the rightmost column. For each control you deploy, ask: *what machine-generated artifact proves it ran?* A guard model with no logged decisions produces no evidence for the Measure function. A least-privilege token policy with no test suite produces no evidence for access-control governance. Designing controls to emit signed, immutable evidence (see Ch. 19.2.2) is what makes the difference between a system that is secure and a system that can be *shown* to be secure to a CISO, a board, or an EU AI Act conformity assessor (see Ch. 22.3.3).

Finally, treat this crosswalk as living. Framework versions move — the OWASP LLM list is revised on a roughly annual cadence, ATLAS adds techniques as agentic TTPs are observed in the wild, ISO 42001 will accrue guidance documents, and the EU AI Act's technical standards are still crystallizing. The stable layer is the middle column of A.1 — the threat classes themselves — and the engineered controls of A.2. Re-pin the identifiers when frameworks update; do not re-derive the threat model each time.
