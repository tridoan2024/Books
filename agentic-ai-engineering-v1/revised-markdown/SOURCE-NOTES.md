# Source and editorial notes

## What this edition is

This Markdown edition revises the 38 chapters of *Agentic AI Engineering v1*, adds three chapters on durable execution, evaluation-driven releases, and delegated authorization, and retains Appendices A–H. The original HTML edition is preserved separately and has not been republished.

The book's autonomy ladder, illustrative organization stories, templates, and LoopKit API sketches are teaching devices. An example is not a measured production result, a provider guarantee, or permission to execute an operation. Existing long chapters retain useful material rather than being cut arbitrarily to meet a word-count target.

## Sources reviewed for specific changes

The following sources were retrieved on **7 October 2026**. Review covered the stated topics, not every linked document or all claims in the original book.

| Source | Passage or topic used | Scope of support |
|---|---|---|
| [AWS Builders' Library: Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) | Late-arriving requests; same request ID with different intent | Service-specific retention, semantically equivalent responses, parameter mismatch; not universal exactly-once effects |
| [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests) | Complete Markdown version of the page | Stripe's first-started-result storage, parameter comparison, retention/pruning, and pre-execution exceptions |
| [AWS: Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | Intent, duplicate-message considerations, local outbox transaction | Atomic local intent/outbox recording; receiver deduplication remains necessary |
| [Martin Kleppmann: How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html), 8 February 2016 | Process pauses, network delay, resource-enforced fencing | Why checking a lease only in a client cannot stop a stale write; historical discussion, not a current Redis audit |
| [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), 9 January 2026 | Evaluation vocabulary, grader design/calibration, transcript inspection, suite maintenance | Evaluation design and complementary evidence; vendor benchmark claims were not independently reproduced |
| [MCP Authorization specification, 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) | Applicability, token handling, audience validation, PKCE, resource parameter, token passthrough | Version-pinned HTTP authorization profile; not asserted to be the latest MCP specification or a task-level approval system |
| [RFC 9700: Best Current Practice for OAuth 2.0 Security](https://www.rfc-editor.org/rfc/rfc9700), January 2025 | Sections 2.1.2–2.6 | Sender constraints, refresh-token protection, minimum privilege, audience/resource/action restrictions, client authentication |
| [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) | Framework landing-page excerpt | Background link and publication of NIST AI600-1 on 26 July 2024; no detailed conformity assessment |

RFC 9110 is offered as further reading for HTTP semantics; the attempted HTML retrieval exceeded the tool's size limit. Detailed requirements were not newly checked against that text in this pass. An inherited “Claude Managed Agents” news URL returned404. That is not proof that a product never existed, but it cannot substantiate the original book's attributed performance figures.

## Verification boundaries

- Editorial checks cover numbering, Markdown parsing and fences, internal file/anchor links, word counts, exact repeated long passages, and preservation of original HTML hashes.
- Mechanical checks do not establish that every technical assertion is correct. Chapter-level revisions and targeted source checks address identified errors; this is not an exhaustive independent fact-check of the entire inherited book.
- Illustrative code has not been certified as a runnable SDK. Appendix H intentionally retains historical listings with explicit known-defect warnings. Do not install those listings as a production harness.
- Statistical examples depend on their stated sampling assumptions. No success threshold, graduation sample size, model price, or performance improvement is universally applicable.
- Markdown is the deliverable. Existing diagrams remain as source fences where present; no DOCX/PDF conversion, website deployment, or external publication was performed.
