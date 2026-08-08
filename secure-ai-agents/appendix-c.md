# Appendix C: Security Review Checklists

These checklists are the operational output of the book. They are written to be used by a reviewer sitting across from an engineering team, not read as prose. Each item is phrased as a verifiable check, states why it matters, names the evidence a reviewer should demand, and points to the chapter that engineers the control. "Evidence" is deliberately concrete: a policy file, a signed attestation, a trace, a test result — never "the team confirmed." If the evidence cannot be produced, the check fails.

The three checklists map to three lifecycle gates. **C.1** runs before a line of agent code is written, when the design is still cheap to change. **C.2** runs whenever a new tool or MCP server is proposed for connection — the single most common way agency and blast radius expand. **C.3** runs before an agent is promoted to a higher autonomy level or to production. Group headings (identity, tools, memory/data, isolation, guardrails, observability, governance) recur across all three so a reviewer can specialize by domain.

---

## C.1 Agent Design Review Checklist (Pre-Build)

Run this at design review, before implementation. The goal is to catch architectural decisions — trust boundaries, autonomy level, blast radius — that are expensive to reverse later.

### Identity and Authorization

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Agent has a distinct non-human identity (NHI), not a shared or human account | Shared identity destroys attribution and enables lateral reuse | NHI registration record; identity issuer config | Ch. 14.1.1 |
| 2 | User authority, agent authority, and system execution authority are separated in the design | Conflating them yields confused-deputy escalation | Authority model diagram | Ch. 14.1.3 |
| 3 | Delegation uses token exchange (RFC 8693) / OBO, not credential copying | Copied credentials cannot be scoped or revoked per-hop | Auth flow diagram naming the grant type | Ch. 14.2.2 |
| 4 | Every tool the agent may call has a defined least-privilege scope | Broad scopes turn one injection into full compromise | Tool-to-scope matrix | Ch. 14.4.2 |
| 5 | Credentials are brokered/short-lived, never materialized in the model context | Secrets in context leak via injection and logs | Secrets-flow design; vault broker reference | Ch. 14.4.1 |

### Tools and Actions

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 6 | Irreversible actions are enumerated and classified separately from reversible ones | Irreversible actions need human-in-the-loop gates | Action taxonomy with reversibility labels | Ch. 22.2.1 |
| 7 | Autonomy level (0–5) is explicitly chosen and justified for the use case | Over-autonomy is the root of excessive-agency risk | Autonomy decision record | Ch. 1.1.2 |
| 8 | Blast radius per tool is bounded (rate, cost, scope caps) at design time | Unbounded tools enable denial-of-wallet and runaway loops | Documented caps per tool | Ch. 15.2.3 |
| 9 | Tool arguments have tight JSON schemas (`additionalProperties: false`) | Loose schemas enable parameter-injection and schema confusion | Schema definitions | Ch. 10.1.2 |
| 10 | A pre-execution policy decision point mediates every tool call | Without a PDP, controls live in prompts and are bypassable | Gateway/PDP architecture | Ch. 15.1.2 |

### Memory and Data

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 11 | Every context token is labeled by source and trust level (provenance tagging) | Untagged data is indistinguishable from instructions | Provenance schema | Ch. 5.4.1 |
| 12 | Memory write policy defines what the agent may persist | Unrestricted writes enable memory poisoning | Write-policy document | Ch. 5.4.3 |
| 13 | Retrieval is permission-aware (document-level ACLs, late-binding auth) | Over-permissioned indexes leak restricted data | RAG authorization design | Ch. 18.1.2 |
| 14 | Data classification and sensitivity labels propagate through the pipeline | Labels that stop at ingestion cannot gate egress | Label-propagation design | Ch. 18.1.1 |
| 15 | Right-to-erasure paths across vector store, cache, and logs are designed | Deletion residue violates GDPR and leaks data | Erasure data-flow map | Ch. 18.3.1 |

### Isolation

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 16 | Code-execution tools run in a defined isolation runtime (MicroVM/gVisor/Wasm) | In-process execution equals host compromise on escape | Isolation choice with rationale | Ch. 16.1.1 |
| 17 | Sandbox egress is default-deny with an explicit allow-list | Open egress enables exfiltration and SSRF | Network policy design | Ch. 16.2.1 |
| 18 | Execution environments are ephemeral (zero state between tasks) | Persistence enables cross-task contamination | Lifecycle design | Ch. 16.1.3 |
| 19 | Multi-tenant boundaries are defined across memory, cache, sandbox, and logs | Single missed plane breaks tenant isolation | Tenant-boundary map | Ch. 16.4.1 |

### Guardrails

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 20 | Prompt injection is treated as an information-flow problem, not a filter problem | Classifier-only defenses are routinely bypassed | Design naming an IFC/architectural pattern | Ch. 8.4, Ch. 17.2 |
| 21 | An architectural anti-injection pattern is chosen (CaMeL / Dual-LLM / Plan-Then-Execute) | These give structural, not statistical, guarantees | Pattern selection record | Ch. 17.2.1, Ch. 17.2.2 |
| 22 | Taint tracking is designed to survive summarization and memory writes | Compaction launders poisoned content otherwise | Taint-propagation design | Ch. 17.2.3, Ch. 5.4.2 |
| 23 | Agent-generated code is statically analyzed (AST) before execution | Direct execution of model output is remote code execution | Output-inspection design | Ch. 17.3.2 |
| 24 | A layered pipeline (input → reasoning → tool → output) is specified | Single-layer guards fail open | Defense-in-depth diagram | Ch. 17.4.1 |

### Observability and Governance

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 25 | Trajectory telemetry uses OpenTelemetry GenAI / OpenInference conventions | Ad hoc logging cannot be correlated or audited | Telemetry schema | Ch. 19.1.1 |
| 26 | Immutable, signed audit logging of decision chains is designed in | Non-repudiation requires tamper-evidence from day one | Audit-log architecture | Ch. 19.2.1, Ch. 19.2.2 |
| 27 | Containment primitives (kill switch, credential revocation, memory quarantine) exist in the design | You cannot respond to what you cannot stop | Containment design | Ch. 19.4.2 |
| 28 | The agent is registered in the enterprise inventory with an owner | Shadow AI cannot be governed or patched | Inventory entry | Ch. 1.4.2 |
| 29 | A threat model (STRIDE + MAESTRO + ATLAS mapping) exists for the design | Undocumented threats become unhandled incidents | Threat-model document | Ch. 7.1, Ch. 7.2 |
| 30 | An impact/scoping assessment justifies the autonomy and access depth | Regulators and boards require documented risk framing | AI Scoping Matrix | Ch. 7.1.2 |

---

## C.2 Tool and MCP Server Onboarding Checklist

Run this every time a new tool or MCP server is proposed. Tool onboarding is where blast radius silently grows; treat each connection as a supply-chain decision.

### Supply Chain and Provenance

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 31 | The server/tool artifact is signed and provenance-verified (Sigstore/in-toto/SLSA) | Unsigned artifacts can be swapped or backdoored | Signature + provenance attestation | Ch. 21.2.2 |
| 32 | The tool is recorded in the AI-BOM with version and source | Untracked tools cannot be recalled on CVE disclosure | AI-BOM entry (CycloneDX) | Ch. 21.2.1 |
| 33 | Third-party MCP server passed vendor assessment criteria | Community servers are a documented poisoning vector | Completed vendor assessment | Ch. 21.2.3, Ch. 10.4.1 |
| 34 | Package/dependency names are verified against slopsquatting | Hallucinated package names are a live supply-chain vector | Dependency provenance check | Ch. 10.4.4 |

### Tool Metadata Integrity

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 35 | Tool descriptions are hashed and pinned at review time | Descriptions are untrusted input that can carry injections | Pinned-hash manifest | Ch. 15.3.2 |
| 36 | Descriptions are scanned for imperative/instruction-like language | Tool poisoning hides instructions in metadata | Scan result | Ch. 10.2.1 |
| 37 | Post-approval change detection (rug-pull) is enabled | Servers can redefine tools after approval | Change-detection config | Ch. 10.2.2 |
| 38 | Tool names are checked for collision/shadowing with existing tools | Name collision misroutes calls to malicious tools | Namespace audit | Ch. 10.2.2 |
| 39 | Metadata is rendered to the model in a delimited, non-instruction channel | Line-jumping exploits undifferentiated context | Spotlighting/rendering config | Ch. 10.2.3, Ch. 17.1.3 |

### Schema and Argument Safety

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 40 | Input schema sets `additionalProperties: false` and typed fields | Loose schemas enable schema-confusion attacks | Schema file | Ch. 10.1.2 |
| 41 | Argument validation guards against SQL/command/path/SSRF injection | LLM-generated args are attacker-influenced | Validation rules/tests | Ch. 10.1.1, Ch. 15.2.2 |
| 42 | Free-text arguments to dangerous sinks are minimized or forbidden | Free text to shells/DBs is direct injection surface | Interface review notes | Ch. 15.2.2 |

### Authorization and Identity

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 43 | MCP authorization uses OAuth 2.1 with Resource Indicators (RFC 8707) | Audience restriction prevents token replay across servers | Auth config | Ch. 4.2.4 |
| 44 | No token passthrough / confused-deputy consent patterns are present | Passthrough lets a server act as the user | Auth flow review | Ch. 10.2.4 |
| 45 | Local/stdio servers are protected against DNS rebinding and origin abuse | Local servers are reachable by malicious web pages | Binding/origin config | Ch. 10.2.4 |
| 46 | The tool receives a least-privilege, short-lived credential | Broad or static creds widen blast radius | Credential-minting policy | Ch. 14.3.3 |
| 47 | The tool is bound to a specific agent scope, not globally available | Global availability defeats per-task partitioning | Scope-partition config | Ch. 15.3.3 |

### Isolation and Egress

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 48 | Tools with side effects run behind the gateway's pre/post hooks | Un-mediated tools bypass all runtime policy | Gateway routing config | Ch. 15.1.2 |
| 49 | Outbound calls from the tool go through an egress broker | Direct egress enables exfiltration mesh | Egress-broker config | Ch. 15.3.4, Ch. 11.3.3 |
| 50 | Code-execution tools are pinned to an isolation runtime and profile | Interpreter binding without isolation is RCE | Sandbox binding | Ch. 16.1.1, Ch. 7.4.3 |

### Observability

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 51 | Every invocation emits a structured, correlatable audit record | Un-logged tools create forensic blind spots | Sample audit record | Ch. 19.2.1 |
| 52 | Anomalous tool-sequence detection covers the new tool | New tools expand the behavioral baseline | Detection coverage note | Ch. 19.3.1 |

---

## C.3 Production Readiness and Autonomy Promotion Checklist

Run this before promoting an agent to production or to a higher autonomy level. Promotion is a security event: it increases blast radius and must be gated by evidence, not confidence.

### Governance and Release

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 53 | Threat-model diff reviewed for this capability change | New capabilities introduce new attack paths | Signed threat-model diff | Ch. 21.1.2 |
| 54 | Prompts, tool schemas, policies, and graph defs are versioned as code | Unversioned artifacts cannot be audited or rolled back | Version-control history | Ch. 21.1.1 |
| 55 | Dev/staging/prod tool scoping parity is verified | Prod scope drift creates surprise privileges | Environment parity report | Ch. 21.1.3 |
| 56 | Progressive delivery plan exists (shadow → canary autonomy → ramp) | Big-bang autonomy jumps are unrecoverable | Rollout plan | Ch. 21.3.1 |
| 57 | Emergency capability rollback / autonomy feature flags are in place | You must be able to demote autonomy instantly | Feature-flag config | Ch. 21.3.2 |
| 58 | Acceptable autonomy boundaries and blast-radius limits are approved | Unbounded autonomy has no defensible risk story | Review-board approval | Ch. 22.4.2 |

### Guardrail and Control Verification

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 59 | Red-team suite run; ASR is within the accepted budget | Unmeasured controls are assumed, not proven | Red-team report with ASR | Ch. 20.4.3 |
| 60 | Prompt-injection regression suite passes in CI | Regressions silently reopen closed vulnerabilities | CI gate result | Ch. 20.4.2 |
| 61 | Guardrail false-positive budget and utility-security curve are documented | Over-blocking pushes users to unsafe workarounds | Efficacy measurement | Ch. 17.4.4 |
| 62 | Layered pipeline verified end-to-end (input→reasoning→tool→output) | A single disabled layer fails open unnoticed | Integration test results | Ch. 17.4.1 |
| 63 | Safe-fallback and safe-state-reversion behavior is tested | Failures must degrade safely, not dangerously | Resilience test results | Ch. 17.4.2 |

### Isolation and Data

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 64 | Sandbox escape-test checklist executed and passed | Isolation must be verified, not assumed | Escape-test results | Ch. 16.4.3 |
| 65 | DLP covers all agent egress channels (tools, files, network) | One uncovered channel leaks everything | DLP coverage matrix | Ch. 18.3.2 |
| 66 | PII/PHI masking verified before tool transmission and logging | Sensitive data in tools/logs is a breach | Masking test evidence | Ch. 17.3.1, Ch. 19.2.3 |
| 67 | Inference-time aggregation risk assessed for the data corpus | Permitted chunks can reconstruct restricted data | Aggregation risk note | Ch. 9.3.3 |

### Identity and Multi-Agent

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 68 | Real-time token revocation and identity quarantine are tested | Compromised agents must be stoppable mid-flight | Revocation drill record | Ch. 14.4.3 |
| 69 | Inter-agent authentication verified for any multi-agent flow | Implicit trust between agents enables cascades | AuthN test results | Ch. 11.1.1 |
| 70 | A2A Agent Cards are verified; capability overclaiming is checked | Spoofed/overclaiming cards misroute trust | Card-verification config | Ch. 10.3.1 |

### Observability and Incident Response

| # | Check | Why It Matters | Evidence Required | Chapter Ref |
| :--- | :--- | :--- | :--- | :--- |
| 71 | Detections for agentic TTPs exist and map to MITRE ATLAS | Unmapped detections leave coverage gaps | Detection-to-ATLAS matrix | Ch. 19.3.3 |
| 72 | Token-consumption and execution-time anomaly alerts are live | Spikes are early intrusion and denial-of-wallet signals | Alert config | Ch. 19.3.2 |
| 73 | SIEM/SOAR integration (AISOC workflow) is wired and tested | Isolated telemetry never reaches responders | Integration evidence | Ch. 19.3.4 |
| 74 | Incident playbook (quarantine, rollback, post-mortem) exists and was rehearsed | Untested playbooks fail under real pressure | Tabletop/drill record | Ch. 22.4.3, Ch. 19.4 |
| 75 | Trajectory reconstruction is possible from captured telemetry | You cannot do RCA on non-deterministic runs without it | Reconstruction demo | Ch. 19.4.1 |

A passing checklist is not a certificate of safety; it is evidence that the known failure modes have known controls with proof they run. Re-run C.3 on every autonomy promotion, every model-version upgrade (safety regression is real, see Ch. 21.3.3), and after every incident. The checklists are meant to accrete organizational memory: when a new attack class appears in the wild, add a row, and every future review inherits the lesson.
