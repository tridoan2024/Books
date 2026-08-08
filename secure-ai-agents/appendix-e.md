# Appendix E: Revision Notes (v1 → v2)

This appendix documents the transition from the v1 outline to the v2 master architecture that the book now follows. It exists for two audiences: reviewers who need to understand what changed and why, and readers who want a map of where the newest, most defensible material lives. The headline change is structural — v2 reorganizes the material into five parts and adds a dedicated interview-preparation capstone — but the more consequential change is topical: v2 folds in the 2025–2026 threat and defense landscape that did not exist, or was not mature, when v1 was drafted.

---

## E.1 Summary of v2 Enhancements

The v2 revision expands the book from 23 to **24 chapters** across **5 Parts**, plus **5 appendices**. The three enhancements recorded at the end of the Table of Contents are the anchor points:

- **Added Chapter 24 — Principal AI Security Engineer Interview Preparation.** A capstone structured into six sections: system design, threat modeling and audit, deep-dive technical Q&A on architecture, deep-dive Q&A on controls and IAM, policy-as-code and coding challenges, and principal-level leadership and crisis management. It converts the book's engineering content into interview-ready form: whiteboard scenarios, model answers, and coding exercises rather than exposition.
- **Added Part V — Career Mastery and Interview Preparation.** A formal fifth part that groups the capstone chapter, giving the book a deliberate arc from architecture through defense to career mastery. This mirrors the structure of top-tier technical roadmap literature while targeting the specific Principal AI Security Engineer role.
- **Traceability integration.** Every chapter is now mapped to real-world Principal-level competencies — system design whiteboarding, threat modeling, and executive communication — so the technical chapters and the interview capstone reinforce each other. Appendix A.2 and Appendix D operationalize this mapping.

Beyond these three, v2 adds the appendix apparatus itself: a cross-framework threat matrix (Appendix A), four hands-on labs (Appendix B), three review checklists totaling 75 checks (Appendix C), and a competency map with self-assessment rubric and five additional interview scenarios (Appendix D). Together these turn the book from a reference text into a usable practitioner toolkit.

---

## E.2 Structural Changes by Part

The five-part structure is not cosmetic; each part corresponds to a distinct mode of work a Principal engineer performs, and the reorganization clarifies the dependency order.

| Part | Title | Chapters | Role in the Arc |
| :--- | :--- | :--- | :--- |
| **I** | Agentic Systems Architecture and Core Engineering | 1–6 | Build the mental model: how agents work before how they break |
| **II** | The Agent Attack Surface and Threat Modeling | 7–13 | Enumerate and understand the adversary |
| **III** | Security Engineering and Defense-in-Depth | 14–19 | Engineer the layered controls |
| **IV** | Adversarial Testing, Governance, and Enterprise Scale | 20–23 | Prove, govern, and operate at scale |
| **V** | Career Mastery and Interview Preparation | 24 | Convert mastery into role readiness |

The key structural decisions: Part I now front-loads durable execution (Ch. 2.4), confidential computing (Ch. 3.4), and provenance-aware context engineering (Ch. 5.4) so the defensive parts can reference a mature architecture rather than introduce it mid-defense. Part II is sequenced to move from foundational injection (Ch. 8) through memory and tool attacks (Ch. 9–10) to multi-agent cascades (Ch. 11) and finally the newest surface, computer-use and browser agents (Ch. 13). Part III mirrors Part II defense-for-attack: identity (Ch. 14) and gateways (Ch. 15) precede isolation (Ch. 16), guardrails and information flow control (Ch. 17), data security (Ch. 18), and observability (Ch. 19). Part IV closes the loop with red teaming (Ch. 20), secure SDLC (Ch. 21), governance (Ch. 22), and the platform synthesis (Ch. 23). Part V stands alone as the capstone.

---

## E.3 New Topic Coverage Added in v2

The most substantive change is the addition of topics that reflect the 2025–2026 state of the art. These were either absent from v1 or treated superficially; v2 gives each dedicated engineering treatment.

- **Durable execution and failure semantics (Ch. 2.4).** Checkpointing, idempotency keys, exactly-once tool semantics, and compensating rollback via durable workflow engines. Elevates reliability from an afterthought to a first-class security property, since retriable side effects are what make autonomous remediation safe.
- **Confidential computing for model execution (Ch. 3.4).** TEEs, GPU confidential compute, and cryptographic attestation of the serving stack. Addresses weight protection and multi-tenant accelerator isolation.
- **Provenance-aware context engineering (Ch. 5.4).** Per-token source and trust labeling, taint propagation across summarization and memory writes, and memory write policies. This is the architectural substrate the anti-injection defenses depend on.
- **Computer-use and browser agents (Ch. 13).** The agentic browser threat model (same-origin policy versus same-context LLM), screen-reading and OS-actuation risk, and authenticated-session abuse — the fastest-growing real-world attack surface.
- **Agentic payments (Ch. 13.3.1).** Mandate and intent verification risks in emerging payment protocols for autonomous transactions.
- **Information flow control and CaMeL (Ch. 17.2).** Capability-based IFC with provable guarantees, alongside Dual-LLM, Plan-Then-Execute, Action-Selector, and Context Minimization. This reframes prompt injection as an information-flow problem with partial, layered mitigations rather than a solvable filtering task.
- **Secure agent SDLC and AI-BOM (Ch. 21).** Versioning prompts, schemas, and policies as code; extending SBOM to models, datasets, prompts, and MCP servers; Sigstore/in-toto/SLSA provenance for agent builds.
- **AI Security Operations Center — AISOC (Ch. 19.3.4).** SIEM/SOAR integration and detection engineering for agentic TTPs mapped to MITRE ATLAS.

Each of these threads is carried through the appendices: the labs exercise gateways, MCP hardening, sandboxing, and red teaming; the checklists demand evidence for provenance tagging, AI-BOM, and IFC; and the competency map treats them as distinct proficiency domains.

---

## E.4 Reader Guidance

The book supports multiple reading paths. Linear reading is ideal for building the field from first principles, but three persona-driven paths let readers reach value faster.

| Persona | Goal | Recommended Sequence |
| :--- | :--- | :--- |
| **Security architect** | Design an enterprise agent defense strategy | Ch. 1 → 7 → 14 → 15 → 16 → 17 → 22 → 23, then Appendix A and Appendix C |
| **Platform engineer** | Build the paved-road platform and controls | Ch. 1–2 → 4 → 15 → 16 → 19 → 21 → 23, then Appendix B (all labs) and Appendix C.2–C.3 |
| **Interview candidate** | Prepare for a Principal AI Security Engineer loop | Ch. 24 first for shape, then depth passes on Ch. 8, 10, 14, 16, 17, 20, then Appendix D (rubric + scenarios) and Appendix A |

Notes on the paths. The **security architect** path front-loads threat modeling (Ch. 7) and the defensive core (identity, gateway, isolation, guardrails) before governance, then uses Appendix A to align controls to frameworks and Appendix C to operationalize reviews. The **platform engineer** path is hands-on: it pairs the runtime and isolation chapters with all four labs in Appendix B, then uses the onboarding and production checklists as release gates. The **interview candidate** path inverts the usual order — start at the capstone (Ch. 24) to internalize the *shape* of principal-level questions, then return to the specific chapters that supply depth, and self-assess against Appendix D's rubric to target weak domains.

Whichever path you take, the two stable anchors are Appendix A's threat classes and Appendix C's checklists. Frameworks and tool APIs will move; the threat classes and the discipline of demanding evidence for every control will not. Treat the chapters as the reasoning and the appendices as the working memory you return to on every real engagement.
