# Appendix E: Behavioural Evidence Bank from the Reader's History

> **Part:** Appendices  
> **Purpose:** Build Staff-level behavioral answers from facts documented in `base_resume.md` without inventing incidents, architectures, employers, metrics, or outcomes.

---

## How to Use This Appendix

The resume provides credible evidence, but not enough detail to write complete STAR stories safely. Each evidence card below separates:

- **Verified facts:** stated in the resume.
- **Defensible interpretation:** a reasonable capability demonstrated by those facts.
- **Questions to answer before interviewing:** details only the reader can supply.
- **Claims not to make without records:** attractive but unsupported embellishments.

A strong Staff answer should cover:

1. The system and business objective.
2. The reader's decision authority and actual ownership.
3. The competing constraints and stakeholders.
4. The decision or mechanism introduced.
5. Evidence used to persuade others.
6. The measured result.
7. What became reusable across teams.
8. What the reader would change now.

Use first person only for facts the reader can defend under follow-up questioning.

---

## Evidence Card 1: Leading AI Security Initiatives at Abbott

### Verified facts

- Current role: Staff Cyber Security Engineer.
- Leads security initiatives for AI-driven projects involving Gemini generative AI and NeuroSphere Virtual Clinic products.
- Filed two patents involving agentic AI systems for mobile healthcare security.
- Received awards for generative-AI cybersecurity research.
- Used adversarial testing and AI-driven security solutions.
- Resume reports a 25% reduction in healthcare-application vulnerabilities.

### Competencies this can support

- Technical leadership in an emerging domain.
- Translating research into product-security work.
- Threat modelling and adversarial validation for AI-enabled systems.
- Cross-functional work in a regulated product environment.

### Questions the reader must answer

- What exact decision did you own rather than merely contribute to?
- Which teams participated: product, ML, software, privacy, clinical, regulatory, legal?
- What security risk changed the design?
- How was the 25% reduction measured, over what period, and against what baseline?
- Which parts can be discussed publicly without exposing confidential or patent-sensitive information?
- What resistance or tradeoff did you manage?
- What reusable process, control, or standard remained afterward?

### Claims not supported by the resume

Do not claim specific use of Kubernetes, gVisor, Firecracker, Macaroons, model signing, OIDC federation, eBPF containment, Triton, GCG sweeps, formal AI incident playbooks, or FDA clearance unless project records independently establish them.

### Answer skeleton

> "At Abbott, I led security work for an AI-enabled healthcare product. The central risk was [verified risk]. I owned [verified scope] and worked with [actual stakeholders]. I used [actual evidence or test] to show [finding]. We chose [actual decision] because [tradeoff]. The measured result was [documented metric and denominator]. The Staff-level contribution was not only the individual fix; I also [reusable mechanism, standard, automation, or decision framework]."

---

## Evidence Card 2: Integrating Security Validation into DevSecOps

### Verified facts

- Integrated Security Validation into DevSecOps.
- Used automated testing and secure-coding practices.
- Resume reports a 20% reduction in testing time.

### Competencies this can support

- Creating a paved security path rather than a manual gate.
- Improving delivery velocity while preserving assurance.
- Building repeatable controls and feedback loops.
- Measuring security-process performance.

### Questions the reader must answer

- Which tests were automated?
- Where did they run in the development lifecycle?
- What was the previous process and baseline duration?
- Was 20% measured as elapsed pipeline time, engineer effort, release lead time, or something else?
- What false positives or adoption problems arose?
- Who owned exceptions and risk acceptance?

### Interview prompts

- Tell me about a security control that initially slowed engineering down.
- Describe a time you made security easier to adopt.
- How did you measure whether a security program was working?
- Tell me about a control you deliberately did not automate.

### Model-answer principle

Lead with the delivery constraint, show the control boundary, explain how failures were routed to owners, and state the metric precisely. Do not convert “20% less testing time” into unsupported claims about vulnerability elimination or organization-wide adoption.

---

## Evidence Card 3: HSM and Message-Authentication Strategy at General Motors

### Verified facts

- Led current and future hardware-based security designs involving HSM and Secure Hardware Extension.
- Owned the HSM specification and SHE+ requirements.
- Owned and led Message Authentication strategy for the Global B in-vehicle network architecture.
- Participated in SAE cybersecurity standards work.
- Led GM Ethernet Security strategy and championed an Ethernet Security project.

### Competencies this can support

- Long-horizon technical strategy.
- Security architecture for safety-relevant distributed systems.
- Specification and requirements ownership.
- Standards participation and cross-organizational influence.
- Hardware/software trust-boundary reasoning.

### Questions the reader must answer

- What architectural decision was most contested?
- Which constraints came from hardware lifecycle, cost, latency, compatibility, or safety?
- How were requirements validated?
- What did “owner” mean in decision rights and accountability?
- Which outcome can be quantified or described without disclosing proprietary vehicle architecture?
- What did the reader learn that transfers to AI-platform security?

### Transfer to AI-security interviews

The strongest analogy is not “an LLM is an HSM.” It is the discipline of separating policy from enforcement, minimizing ambient authority, establishing roots of trust, binding identity to messages, handling key lifecycle, and designing for components that may be compromised.

### Claims not supported by the resume

Do not invent a 48-hour production crisis, missing MAC validation, compiler optimization defect, assembly rewrite, exact microsecond latency, manufacturing penalty, launch result, or millions in avoided cost.

---

## Evidence Card 4: Patents, Publications, and Written Technical Influence

### Verified facts

- Three pending patents, including two involving agentic healthcare-security systems.
- Multiple publications and presentations on cryptographic FPGA/CAN security.
- Ownership of HSM specifications and requirements.
- Ph.D. in Electrical and Computer Engineering.

### Competencies this can support

- Written technical communication.
- Creating durable design artifacts.
- Defending novelty and technical reasoning.
- Communicating across research, engineering, standards, and product audiences.

### Questions the reader must answer

- Which document materially changed a decision?
- How did reviewers challenge it?
- What evidence resolved disagreement?
- How was complex hardware or AI security explained to a non-specialist audience?
- Which tradeoff was documented but deliberately left unresolved?

### Interview prompts

- Tell me about the most consequential design document you wrote.
- Describe a technical disagreement resolved through writing.
- How do you write an RFC when evidence is incomplete?
- How do you keep a security specification testable?

---

## Evidence Card 5: Mentoring and Growing Engineers

### Verified facts

- Teaching Assistant experience is listed.
- Staff-level and lead responsibilities are documented.

### Status: PARTIAL

The resume does not establish a formal mentoring program, number of mentees, promotions, hiring decisions, performance management, or organization-wide training outcomes.

### Questions the reader must answer

- Who did you mentor, and for how long?
- What capability did they develop?
- What did you delegate rather than solve yourself?
- What observable outcome resulted?
- Did you create reusable teaching material, review practices, office hours, or standards?

### Safe answer if evidence remains limited

> "My resume under-describes mentoring. My documented evidence includes teaching-assistant work and leading technical initiatives. The strongest specific example I can defend is [reader supplies real example]. I would not claim a formal mentoring program or promotion outcome without records. What I can explain is how I transferred ownership: [method], how I reviewed progress: [evidence], and what the engineer could do independently afterward: [result]."

---

## Evidence Card 6: Research-to-Engineering Translation

### Verified facts

- Ph.D. research background in ECE.
- FPGA/ASIC security research.
- Awards for generative-AI cybersecurity research.
- Patent and product-security experience.

### Competencies this can support

- Evaluating immature technology without confusing novelty with production readiness.
- Turning research findings into testable engineering controls.
- Communicating uncertainty and evidence quality.
- Balancing experimentation with regulated-product constraints.

### Questions the reader must answer

- What research idea failed in production conditions?
- How was a hypothesis converted into acceptance criteria?
- What evidence caused a change of direction?
- How did the reader distinguish a prototype from a supported control?

---

## Staff-Level Behavioral Question Bank

For each question, select one evidence card and answer only with verified details.

1. Tell me about a security decision whose impact extended beyond one team.
2. Describe a time you changed an architecture without direct authority over the implementing team.
3. Tell me about a serious technical disagreement and how it was resolved.
4. Describe a time new evidence showed your initial position was wrong.
5. Tell me about a security control that created unacceptable operational friction.
6. Describe how you converted a one-off fix into a reusable organizational capability.
7. Tell me about a risk you accepted rather than eliminated.
8. Describe a high-ambiguity project where requirements were incomplete.
9. Tell me about a failure in your own design or process.
10. Describe how you mentored someone into independent technical ownership.
11. Tell me about a written artifact that changed a consequential decision.
12. Describe a conflict between product velocity and safety or compliance.
13. Tell me about a metric that initially gave a misleading picture.
14. Describe how you handled confidential constraints in a broad technical review.
15. Tell me about a project where you had to connect hardware and software security.

## Final Truthfulness Checklist

Before using an answer, verify:

- The employer, project and role are correct.
- “I” means the reader personally did it; “we” reflects team work.
- Technologies named were actually used.
- Metrics have a baseline, denominator and time period.
- No confidential architecture is disclosed.
- Hypothetical improvements are clearly separated from past experience.
- The answer includes a real conflict, decision and result—not only technical exposition.
- The lesson and reusable organizational effect are explicit.

If any item fails, revise the answer before interviewing.
