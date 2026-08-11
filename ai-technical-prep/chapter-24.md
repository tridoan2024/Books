# Chapter 24: Government authorization and privacy engineering

> **Part:** Part VI — Assurance, Governance and Regulated Environments
> **Market evidence:** FedRAMP (9.0%), GDPR / privacy (6.3%), HIPAA (3.6%)
> **Reader status:** GAP / GAP / HAVE
> **Why this chapter exists:** Staff security engineers must translate cloud architecture and AI data flows into authorization boundaries, privacy obligations and evidence that assessors can verify. This chapter focuses on engineering those controls, not memorizing framework language.

---

## What You Must Be Able to Defend

After this chapter, you should be able to:

1. Draw a defensible system boundary for a regulated AI service.
2. Explain how FedRAMP authorization scope changes architecture, operations and evidence.
3. Map data purpose, identity, retention and disclosure controls to GDPR and HIPAA obligations.
4. Distinguish deletion of source records from removal of influence on trained models.
5. Design evidence collection that is useful to assessors without exposing sensitive data.
6. Respond to privacy requests and incidents across data, vector stores, logs, caches and models.

## Engineering Context

Regulated systems fail when compliance is treated as documentation added after implementation. Authorization and privacy requirements shape where data may flow, which identities may act, how changes are approved, what evidence is retained and how incidents are reported.

For AI systems, the boundary may include training and evaluation datasets, retrieval indexes, model weights and adapters, prompts and outputs, telemetry, traces, human-feedback records, deployment pipelines, artifact registries, and third-party model or tool providers.

The central Staff-level question is: **Which components and data flows must be trusted for the regulated claim to remain true?**

## Compliance Model and Security Objectives

### Assets and Actors

Assets include regulated data, authorization and consent records, models and evaluation artifacts, evidence supporting risk decisions, and logs needed for investigation. Actors include end users, workforce members, tenant administrators, platform teams, assessors, cloud providers, malicious insiders and compromised workloads.

### Trust Boundaries

1. User or partner to regulated service.
2. Public ingress to the authorization boundary.
3. Application tier to data and retrieval services.
4. Training environment to production serving.
5. Regulated environment to third-party AI services.
6. Operational environment to the evidence archive.
7. Privacy workflow to every derived data store.

### Security and Privacy Invariants

- Every access is attributable to an authenticated subject and authorized for an action, tenant and purpose.
- Regulated data cannot leave approved boundaries through model context, tools, logs or support workflows.
- Production changes are traceable to reviewed artifacts and authorized identities.
- Retention and deletion rules propagate to derived stores with recorded exceptions.
- Evidence is tamper-evident, access-controlled and complete enough to reconstruct decisions.
- Break-glass access is time-bound, monitored and reviewed.

## Architecture

### 1. Authorization Boundary

Define the authorization boundary as components, identities, networks and operational processes, not merely a cloud account. Keep an external service outside the boundary only when its inputs and outputs are constrained and the residual risk is explicit.

~~~text
[User/Partner]
      |
      v
[Authorized Ingress] -- identity, tenant, purpose --> [Policy Enforcement]
      |                                                   |
      v                                                   v
[AI Application] --> [Retrieval/Data Services] --> [Model Serving]
      |                    |                         |
      +--------------------+-------------------------+
                           |
                           v
                 [Audit and Evidence Plane]
~~~

Use separate administrative identities, private service paths, explicit egress policy, centralized change evidence and continuous configuration monitoring. Network location alone does not establish authorization.

### 2. Privacy Data Map

Maintain a data inventory linking data category, subject, tenant, collection purpose, legal basis, source, transformations, derived artifacts, storage, subprocessors, retention, deletion behavior, roles and disclosures.

For AI systems, derived artifacts include embeddings, cached context, evaluation corpora, fine-tuning datasets, adapters and logs. A data map that ends at the source database is incomplete.

### 3. Privacy Request Workflow

1. Verify the requester and authority.
2. Resolve subject identifiers across systems.
3. Identify applicable exceptions.
4. Execute deletion, correction, export or restriction.
5. Verify completion in primary and derived stores.
6. Record systems that cannot be immediately changed and the mitigation.
7. Prevent backups or pipelines from silently restoring removed data.

Model unlearning is not a universal deletion mechanism. If data influenced training, options include retraining, validated unlearning, model retirement, output-risk controls or a documented exception. The correct response depends on identifiability, legal scope, behavior and feasibility.

### 4. Evidence Plane

Generate evidence from the systems enforcing the control: identity decisions, policy results, deployments, vulnerability state, egress events, privacy workflows, incident timelines and exceptions.

Retention-locked storage and signed manifests provide tamper evidence for captured records. They do not prove every source emitted complete or truthful events. Monitor ingestion gaps, source identity, clock health and privileged configuration changes.

### 5. Control Inheritance and Shared Responsibility

An authorized cloud service may supply physical security, hypervisor controls, managed-key capabilities, vulnerability processes and portions of audit logging. The application still owns its configuration, identities, data flows, software, incident handling and evidence. Treat inheritance as a testable dependency:

| Control question | Provider may supply | Application must still prove |
|---|---|---|
| Where does data run? | Region and service boundary | Selected regions, endpoint configuration and prohibited paths |
| Who administers infrastructure? | Provider workforce controls | Customer administrators, roles, MFA and break-glass use |
| Is storage encrypted? | Encryption capability | Correct keys, policy, rotation and application access |
| Are events logged? | Service event sources | Enablement, routing, completeness, retention and response |
| Are vulnerabilities managed? | Managed-service patching | Application images, dependencies, configuration and remediation |

Create a control-responsibility matrix that names the inherited statement, customer implementation, evidence source, owner and failure response. Revalidate it when the provider, architecture or authorization boundary changes.

### 6. Government-Cloud Operational Model

Government authorization changes day-two operations. The design must support:

- approved administrative paths and managed devices;
- separation of production, security and evidence responsibilities;
- controlled software and model promotion;
- continuous vulnerability and configuration reporting;
- incident coordination and required reporting timelines;
- inventory of hardware, software, models, datasets and external services;
- change-impact analysis when models, regions or subprocessors change.

Avoid a “compliance enclave” that is secure only during assessment. Controls must survive autoscaling, emergency response, staff turnover and provider outages. Where an external AI API cannot produce required evidence or meet data-handling restrictions, place a constrained intermediary at the boundary or choose a deployment that can.

### 7. Privacy-by-Design for AI Artifacts

Privacy engineering begins before data enters training or retrieval:

1. **Minimize:** Collect only attributes needed for the defined purpose.
2. **Separate:** Keep direct identifiers apart from analytical features where feasible.
3. **Constrain purpose:** Prevent a service-delivery dataset from silently becoming training data.
4. **Limit observability content:** Prefer event metadata and protected references over raw prompts.
5. **Control derivation:** Track chunks, embeddings, labels, features, checkpoints and evaluation copies.
6. **Expire:** Make retention enforceable in storage and pipeline orchestration.
7. **Verify:** Test deletion, export and restriction behavior as product capabilities.

Pseudonymization reduces direct exposure but remains personal data when re-identification is possible. Encryption protects data against specified access paths but does not change its regulatory character. Differential privacy can limit information contribution under formal assumptions, but it does not repair an unlawful collection purpose or insecure operational system.

### 8. Deletion and Model-Influence Decision Tree

When a subject requests deletion or restriction, ask:

1. Is the request authenticated and legally applicable?
2. Where is the source record and which stable identifier links derivatives?
3. Does the data exist in retrieval indexes, caches, logs, evaluations or fine-tuning sets?
4. Has it influenced a released model or adapter?
5. Can influence be measured with sufficient confidence?
6. Is validated unlearning available for this model and data type?
7. Would retraining, retirement or output restriction provide stronger assurance?
8. Which records must be retained for legal, safety or security reasons?

Document the decision and verification evidence. “We deleted the row” and “the model probably forgot it” are both inadequate answers.

### 9. Third-Party Model and Tool Providers

Before sending regulated data to a provider, evaluate:

- whether prompts, files and outputs are retained or used for training;
- subprocessor and regional routing;
- support-personnel access;
- identity federation, tenant isolation and administrative audit;
- incident notification and forensic evidence;
- deletion, export and service-termination behavior;
- model-version changes and evaluation responsibilities;
- contractual commitments versus configurable technical controls.

Build an exit path. A regulated architecture that cannot export records, replace the model or verify deletion has converted a vendor dependency into a control dependency without a recovery plan.

## Implementation: Purpose-Bound Authorization

~~~python
from dataclasses import dataclass
from enum import Enum

class Purpose(str, Enum):
    CARE_DELIVERY = "care_delivery"
    SECURITY = "security"
    RESEARCH = "research"

@dataclass(frozen=True)
class AccessRequest:
    subject_id: str
    tenant_id: str
    resource_tenant_id: str
    action: str
    purpose: Purpose
    break_glass: bool = False

def authorize(request: AccessRequest, allowed_actions: set[str]) -> bool:
    if request.tenant_id != request.resource_tenant_id:
        return False
    if request.action not in allowed_actions:
        return False
    if request.break_glass:
        # Production also requires ticket binding, short expiry,
        # enhanced logging, notification and retrospective review.
        return request.purpose == Purpose.CARE_DELIVERY
    return request.purpose in {Purpose.CARE_DELIVERY, Purpose.SECURITY}
~~~

Production enforcement also requires trusted identity claims, canonical resource identifiers, revocation, policy versioning, safe caching and negative cross-tenant tests.

## Production Failure Modes

### Boundary Drift

- **Trigger:** A team adds a model provider, store or support tool without updating scope.
- **Symptoms:** Undocumented egress, missing evidence or credentials outside approved accounts.
- **Containment:** Stop the flow, preserve evidence and determine whether regulated data crossed the boundary.
- **Prevention:** Architecture inventory tied to deployment policy and change review.

### Purpose Creep

- **Trigger:** Service-delivery data is reused for training without review.
- **Symptoms:** New consumers, unexplained dataset growth or missing purpose records.
- **Containment:** Quarantine derived datasets and suspend affected training.
- **Prevention:** Purpose tags, dataset approvals and lineage.

### Incomplete Deletion

- **Trigger:** Primary records are deleted while embeddings, caches, logs or training copies remain.
- **Symptoms:** Search or model context still reveals removed information.
- **Containment:** Disable affected indexes or serving paths and enumerate derivatives.
- **Prevention:** Lineage, deletion adapters and verification queries.

### Evidence Blind Spot

- **Trigger:** Evidence collection fails silently.
- **Symptoms:** Missing intervals, impossible timestamps or changes without events.
- **Containment:** Treat the gap as a control failure and assess activity during it.
- **Prevention:** Independent completeness monitoring.

### Break-Glass Normalization

- **Trigger:** Emergency access becomes the easiest normal path.
- **Symptoms:** Rising use, long sessions or missing review.
- **Containment:** Revoke sessions and investigate.
- **Prevention:** Short expiry, notification and mandatory review.

## Design Review

### Scenario

A company wants an AI assistant for regulated case workers. It uses an external foundation-model API, retrieves records from a government cloud environment and stores traces for evaluation.

### Staff-Level Walkthrough

1. Identify whether prompts, records or outputs leave the authorization boundary.
2. Determine provider retention, training and support access.
3. Separate operational telemetry from evaluation data.
4. Bind retrieval to worker, tenant, case and purpose.
5. Define deletion for conversations, embeddings and evaluation copies.
6. Establish incident and notification paths.
7. Require evidence for provider configuration, egress, access and retention.
8. Document residual risk.

The correct answer may be an approved provider, a self-hosted model, redaction before external processing, or rejection of the use case. The decision follows data sensitivity and evidence.

## Practical Exercise

Create a repository named **regulated-ai-boundary** containing an architecture boundary, data-flow inventory, access policy, privacy-request procedure, break-glass procedure, evidence catalog, negative cross-tenant tests, deletion-verification tests and risk register.

Acceptance criteria:

- Every flow has an owner, purpose and boundary classification.
- Cross-tenant denial tests are explicit.
- Deletion covers primary and derived stores.
- Break-glass access expires and receives review.
- Every control identifies evidence proving it operated.
- Residual risks have owners and review dates.

## Interview Preparation

These are representative Staff/Principal interview probes, not claimed verbatim questions from a named employer. Treat scenario details as hypothetical unless explicitly supported by the resume.

### Conceptual Questions

#### Q1: What is a FedRAMP authorization boundary?
**Model Answer:** It is the set of components, data flows, identities, networks and operations included in the authorization decision. I would define dependencies and external services explicitly, then connect membership to control ownership, evidence, continuous monitoring and change management.

#### Q2: Does an authorized cloud service make an application FedRAMP authorized?
**Model Answer:** No. Infrastructure may provide inherited controls, but the application remains responsible for configuration, operation and non-inherited controls. I would build a responsibility matrix and validate inheritance with application evidence.

#### Q3: Does deleting a training record remove its model influence?
**Model Answer:** Not necessarily. I would determine whether the request applies, whether the record is identifiable in derived artifacts and whether influence creates disclosure risk. Options include retraining, validated unlearning, model retirement, restrictions or a documented exception.

### Architecture and System-Design Questions

#### Q4: Design a regulated AI service using an external model provider.
**Model Answer:** Start with classification and provider terms, minimize transmitted data, bind retrieval to subject and purpose, restrict egress, prevent provider training or retention where possible, and collect evidence without logging sensitive payloads unnecessarily. Reject the integration if boundary requirements cannot be met.

#### Q5: How would you implement deletion across a RAG system?
**Model Answer:** Maintain lineage from records to chunks, embeddings, indexes, caches and evaluation copies. Authenticate the requester, apply exceptions, delete each derivative, rebuild indexes where required, verify with negative queries and prevent pipeline replay.

#### Q6: How do you design break-glass access?
**Model Answer:** Separate it from normal access, narrowly scope it, strongly authenticate it, bind it to a case, notify owners, capture enhanced evidence and require retrospective review. Repeated emergency use signals a broken normal workflow.

### Incident and Failure Questions

#### Q7: Regulated prompts were sent to an unapproved endpoint. What do you do?
**Model Answer:** Stop the flow, preserve evidence, determine data and subjects involved, rotate exposed credentials, assess provider retention and deletion, engage privacy and authorization owners, determine notification duties and enforce approved egress paths.

#### Q8: Evidence logs are missing for six hours. Is that only availability?
**Model Answer:** No. It is an assurance and potentially security incident because activity cannot be proven. Preserve adjacent evidence, identify whether emission or ingestion failed, assess the gap, restore collection and document corrective action.

### Tradeoff Question

#### Q9: Privacy wants minimum retention; security wants long-lived logs. Resolve it.
**Model Answer:** Separate event utility from payload retention. Retain minimum fields for accountability, pseudonymize identifiers, restrict re-identification and use tiered retention. Document the field-level legal, operational and threat-model justification.

### Behavioral Question

#### Q10: Tell me about influencing a regulated-product decision.
**Model Answer:** Use a verified HIPAA/FDA or product-security example from the resume. State the actual decision, stakeholders, evidence and result. Do not invent a regulator conversation or clearance. The Staff signal is translating risk into an implementable decision and reusable control.

### Additional Staff/Principal Drills

#### Q11: How do you validate inherited controls?
**Model Answer:** Identify the provider statement, customer responsibility and configuration dependency, then collect evidence that the application satisfies its portion. Do not copy provider control language into the system plan without testing the inheritance assumption.

#### Q12: What makes a privacy data map operational?
**Model Answer:** It is tied to deployed systems, owners, purposes, transformations and deletion adapters and changes through the engineering workflow. A spreadsheet updated annually is discovery material, not an enforcement mechanism.

#### Q13: How do you minimize sensitive AI telemetry?
**Model Answer:** Separate operational metadata from content, tokenize identifiers, restrict raw sampling, apply field-level retention and protect re-identification. Verify that minimized telemetry still supports abuse and incident investigations.

#### Q14: How do you assess a subprocessor?
**Model Answer:** Evaluate data categories, locations, onward transfer, retention, training use, access, security evidence, incident duties and deletion capability. Confirm that product configuration matches the contractual promise.

#### Q15: When is anonymization insufficient?
**Model Answer:** When data can be linked using auxiliary information, rare attributes, model outputs or retained identifiers. Test re-identification risk and distinguish anonymization from pseudonymization.

#### Q16: What is continuous monitoring in an authorization program?
**Model Answer:** Ongoing evidence about vulnerabilities, configuration, identity, incidents, changes and control performance, with defined reporting and response. It is not merely continuous scanning.

#### Q17: How should privacy exceptions be handled?
**Model Answer:** Record legal basis, scope, owner, affected systems, safeguards and expiry. Ensure deletion workflows preserve the exception without silently retaining unrelated data.

#### Q18: How does HIPAA experience transfer to FedRAMP and GDPR?
**Model Answer:** Risk assessment, access control, auditability, incident handling and regulated-data discipline transfer. Specific authorization processes, privacy rights and control baselines do not; acknowledge and study those gaps.

## Chapter Summary

- Authorization boundaries are architecture and operations, not assessor diagrams.
- Privacy controls must include derived AI artifacts.
- Model unlearning is conditional and must be validated.
- Evidence needs completeness monitoring as well as tamper resistance.
- Break-glass access is a controlled exception.
- Staff engineers connect obligations to controls, evidence, owners and residual risk.

## Further Study

1. FedRAMP official baselines, authorization guidance and continuous-monitoring documentation.
2. NIST SP 800-53 Rev. 5.
3. NIST Privacy Framework.
4. U.S. Department of Health and Human Services HIPAA Security Rule guidance.
5. European Data Protection Board guidance and the GDPR.
6. NIST AI Risk Management Framework.
