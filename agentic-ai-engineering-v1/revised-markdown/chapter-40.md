# Chapter 40: Evaluation-Driven Releases — From Benchmarks to Change Control

## Introduction: Release the System You Evaluated

[Chapter 39](chapter-39.md) separated logical operations from attempts and showed why a lost receipt requires reconciliation rather than blind repetition. That design creates a new responsibility: changing the harness must not invalidate those guarantees. A new tool adapter can change operation identity. A prompt revision can encourage another retry. A retrieval update can supply obsolete policy. A faster model can choose a different sequence of actions. None of these changes requires a large software diff to alter production behaviour.

[Chapter 22](chapter-22.md) established evaluation infrastructure, and [Chapter 23](chapter-23.md) examined the gap between measured proxies and useful outcomes. This chapter starts where a benchmark report ends. Which exact candidate is eligible for release? What evidence remains valid after an edit? Who can approve expansion, and what happens to operations already in flight when the candidate is withdrawn?

The engineering objective is not a universal certificate of agent safety. It is a bounded decision: this identified system, for this action class and traffic population, has sufficient current evidence for this deployment stage. Evaluation informs that decision; it does not itself grant authority to deploy or act on customers.

## A Fictional Incident: The Better Benchmark That Duplicated Credits

The following incident, company, counts, prices, and outcomes are fictional teaching assumptions. They are not production measurements or a vendor case study.

At fictional Northline Support, an agent prepares service credits after an authorised support decision. Baseline B17 is reliable but expensive. Candidate C18 changes the model, shortens the decision prompt, and upgrades the credit adapter. The adapter now allocates its request identifier inside the transmission function rather than when the logical operation is prepared. Happy-path tests do not expose the distinction.

The team evaluates both versions on 240 fixed support cases. An adjudicated reference says both succeed on 192 cases, C18 alone succeeds on 24, B17 alone succeeds on 12, and both fail on 12. B17 therefore succeeds on 204 of 240, or 85%; C18 succeeds on 216, or 90%. The observed paired improvement is five percentage points. Under assumed evaluation costs of $0.30 per baseline run and $0.24 per candidate run, including failed runs, total cost is $72 versus $57.60. Cost per accepted outcome is approximately $0.353 versus $0.267.

The dashboard displays the improvement. It omits two facts. First, the recovery suite discovered no tests after its directory moved; an empty required-check list passed through the aggregator. Second, an engineer edited the retry instruction after the evaluation, believing it was merely a clarification. The deployed candidate is C18b, not the evaluated C18. The report contains neither the effective prompt hash nor the adapter's identity-policy revision.

The team admits forty live credit requests into a canary. Each authorised credit is $25. Thirty-seven requests acquire authoritative completion evidence; two of those have been credited twice following response timeouts. Three requests remain unknown. The confirmed ledger contains thirty-five single credits and two double credits: `35 × $25 + 2 × $50 = $975`. The intended amount for those thirty-seven resolved requests was $925, so confirmed duplicate exposure is $50. The remaining $75 of intended credits is unresolved, not automatically failed, lost, or safe to resend.

The release owner stops new candidate mutations and preserves the ledger. Switching the router back to B17 does not undo the duplicates or resolve the three unknowns. A reconciliation worker queries the receiver using recorded identifiers; support owns any customer-facing correction and its authorisation. Nobody runs a blanket compensating debit merely to make the accounting totals look tidy.

The observed benchmark gain can be real while the release decision is wrong. The paired outcome improvement did not test lost-response recovery. Empty test discovery was not evidence. C18's report did not cover C18b. The correction is a release protocol linking candidate identity, nonempty obligations, current receipts, and rollout authority—not another headline score.

## Define the Release Unit Before Measuring It

Treat the release unit as an identified behavioural configuration. It includes the model and available version identifier, inference settings, prompts and skills, harness build, tool implementations and schemas, retrieval configuration, policy rules, output and state schemas, and resource limits. If an in-loop grader controls acceptance or retries, its model, rubric, parsing rules, and thresholds belong to that unit too.

The evaluation package has a related but distinct identity: task data, fixture setup, reference labels, release grader, environment, and analysis procedure. Keep those identities separate. Changing the independent grader changes the measurement instrument; changing an in-loop grader changes the system being measured. Both may require new evidence, but for different reasons.

For retrieval, a directory name is inadequate. Record corpus or index revisions, embedding and ranking configuration, filters, access-control behaviour, and source freshness policy. Dynamic material may prevent exact replay. In that case, retain permitted snapshots or source hashes and retrieval receipts, and state what cannot be reconstructed. Do not pretend a hash of the retrieval code also identifies every document it will return tomorrow.

Bind the manifest to immutable artifacts through a canonical serialisation and digest. Do not place secrets in it: record secret references and permission scope, not credential values. At process startup, resolve aliases and log the effective configuration. A mutable model alias may change without a local deployment; if the provider cannot pin it, record that limitation and monitor it as an external change risk.

For C18, the critical identity fields would include the adapter's stable-operation-key policy and the prompt digest. Those fields connect evaluation to the behaviour that actually changed. A manifest containing only a Git commit and a model marketing name would miss both the edited runtime prompt and a separately deployed adapter.

## Make the Required Check Inventory Nonempty and Explicit

Define release obligations before running the candidate. Each obligation needs a stable ID, description, applicability rule, required or advisory classification, check procedure, and expected evidence. Map it to the candidate components and fixture dependencies it exercises. A service-credit release might require amount correctness, permission enforcement, lost-receipt handling, cumulative retry limits, state-schema compatibility, and operator-visible unknown outcomes.

A release cannot pass because its required inventory is empty. Nor should ten discovered tests satisfy a requirement expecting a particular eleven. Record discovery, execution, and result separately. An adapter timeout means execution failed to supply evidence; it is not a failing business assertion and not a pass. Preserve the original authentication, setup, or cancellation diagnostic so the next action addresses the actual prerequisite.

Use explicit outcome states such as pass, fail, error, unknown, and cancelled. Required unknown evidence blocks normal promotion, but useful completed measurements remain available. An advisory dashboard export failure need not invalidate an otherwise complete evaluation; report its limited consequence. Conversely, a polished report cannot turn a missing required recovery check into a cosmetic problem.

The table below is a proposed release policy, not a universal regulatory standard. Apply the most restrictive applicable row and retain all observed conditions rather than reporting only the first convenient one.

| Observation | Release disposition | What remains useful |
|---|---|---|
| Candidate identity differs from evaluated identity | Hold; establish affected retests | Unaffected evidence with explicit applicability |
| Required inventory empty, incomplete, or undiscovered | Hold; repair inventory or discovery | Successfully executed checks, not fabricated coverage |
| Required boundary check fails | Reject current candidate | Reproducer, outputs, and diagnostics |
| Required check errors or lacks evidence | Block pending changed prerequisite | Completed comparisons and original error |
| Operator cancels the release | Cancel rollout; reconcile in-flight work | Results already obtained and operation history |
| All required evidence current; comparison acceptable | Eligible for specified next stage | Decision packet with limitations |
| Advisory check fails | Apply documented advisory policy | Core result plus disclosed advisory gap |

Eligibility is not deployment. A separately authorised actor approves the next stage. If an exception is allowed, record the named requirement, reason, approver, scope, compensating controls, and expiry. Do not rewrite a waived failure as a passed test, and do not allow exceptions to override obligations that the organisation or applicable rules make non-waivable.

## Reserve Evidence the Optimiser Has Not Already Seen

Use development cases freely for iteration, but keep a fixed, versioned held-out set for the release comparison. Fix the cases and their analysis policy for that comparison, not for eternity. A changing workload needs curated refreshes between release campaigns, with an explanation of how the new set relates to production.

Separate cases at the underlying source or incident family. Ten paraphrases of one support dispute are not ten independent business situations. If one version appears in development and another in the held-out set, the apparent separation may offer little protection from overfitting. Track exposure when engineers or models inspect held-out failures. Once used for targeted optimisation, those cases remain valuable regressions but are no longer untouched evidence of generalisation.

Protect reference labels and grader configuration from the candidate. The candidate receives what production would legitimately provide, not an answer file or a field revealing the desired action. Sanitised cases must retain the failure mechanism: replacing every ambiguous customer record with a clean fixture can remove exactly the difficulty the release needs to demonstrate it can handle.

Decide what population a result represents. An evaluation dominated by routine credits says little about account closure, disputed identity, or large financial adjustments. Report stratified outcomes for material action classes, including classes held for human review. The right conclusion may be a narrow release for a supported subset rather than either a broad deployment or complete rejection.

## Compare Paired Outcomes, Not Selected Success Stories

Run baseline and candidate on matched inputs with equivalent budgets and fixture state. Restore isolated state between runs. Randomise execution order where time-dependent services or cache warming can favour one version, and record residual differences that cannot be controlled. Never run both versions against the same live mutable account merely to obtain a paired observation.

Northline's four outcome counts reveal more than the two pass rates. Twenty-four candidate wins and twelve regressions produce the net twelve-case gain. Review the twelve regressions individually: a new unauthorised credit matters differently from a missing explanatory sentence. A critical boundary violation can veto the release even when the overall count improves.

For illustration, encode each independent paired case as +1 for a candidate-only success, -1 for a baseline-only success, and zero otherwise. Northline's mean difference is 0.05. Its mean squared difference is `36/240 = 0.15`; an approximate plug-in standard error is `sqrt((0.15 - 0.05²)/240)`, about 0.0248, or 2.48 percentage points. This calculation assumes independent cases and a simple binary outcome; it is not a production confidence claim.

If those 240 cases come from twenty-four customers with positively correlated outcomes within each history, treating them as independent can understate uncertainty. Use an analysis reflecting the sampling unit, such as customer-level resampling where appropriate, and show how few independent units remain. Repeating each case with several random seeds measures stochastic variation but does not manufacture new customers or new failure modes.

Choose practical margins, confidence procedures, and sample size before inspecting the candidate's results. Failure to detect a regression is not proof of equivalence. Rare harms require targeted boundary evidence as well as representative sampling: under an independent Bernoulli model, zero failures in n observations gives a one-sided 95% upper bound of `1 - 0.05**(1/n)`. Zero in a small pilot is weak evidence about rare failure, especially under distribution shift.

Do not repeatedly inspect results and stop at the first favourable estimate unless the analysis accounts for that sequential decision. Keep failed, blocked, and cancelled runs visible, with a predeclared rule for their treatment. A candidate that abandons difficult work can look faster among its remaining successes while providing less overall value.

## Calibrate the Release Grader Independently

An evaluation can be reproducible and still grade the wrong thing. Use deterministic checks where they adequately express the property, and calibrate model judgments against qualified reference decisions. Anthropic's *Demystifying evals for AI agents* recommends these practices, including allowing unknown when evidence is insufficient and inspecting transcripts for grader or harness defects. That supports the method, not any numerical improvement claimed for Northline.

Keep graders blind to baseline/candidate labels and unnecessary self-assessments. Give them the authoritative task criteria, permitted source evidence, and actual output. If evaluating legal or policy interpretation, make uncertainty and source conflicts admissible outcomes. Forcing a binary verdict without sufficient evidence converts ignorance into apparently clean data.

Sample approvals as well as rejections. Otherwise the calibration exercise can explain annoying false alarms while missing confident false passes. Retain disagreements and adjudication reasons, not just a final consensus label. Separate contexts and different model families can reduce some shared influences, but neither establishes statistical independence or makes a majority vote authoritative.

Version grader fixes and evaluate their effect on both baseline and candidate. If an incorrect currency parser inflated C18's score, rerunning only C18 with the repaired parser yields an invalid comparison. Regrade both stored outputs when that is sufficient; rerun execution when missing receipts or state prevent reliable regrading. Record which procedure was used so a cheaper correction is not mistaken for an entirely fresh trial.

## Exercise Failure Boundaries and Candidate Recovery

Representative task success and adversarial boundary testing answer different questions. The former estimates ordinary performance; the latter checks whether specified controls hold under deliberately difficult conditions. Maintain both. A large routine dataset can contain no examples of cancellation racing with an already accepted mutation.

For a release changing retries, use Chapter 39's controllable receiver to drop a response after committing an effect. For a release changing identity or policy, reject a stale owner, revoke authority before dispatch, and change a target while approval is pending. For retrieval changes, inject instructions into retrieved data and remove a required source. The expected outcome may be a safe hold with a clear explanation, not automatic task completion.

Also attack the evaluation boundary. Supply an empty discovered suite, malformed grader output, fabricated tool receipts inside generated text, and a checker process that exits successfully without running its required assertions. Inspect actual adapter records, not only the candidate's narrative. A trusted harness must distinguish a test of the controller's failure handling from evidence that an application requirement passed.

Test recovery across release versions. Can B17 read state written by C18? What if a checkpoint records an in-flight effect under a new schema? A rollback that restarts B17 against incompatible state can duplicate or orphan operations. Use versioned state envelopes and a defined forward/backward compatibility policy. Where downgrading is unsupported, route existing operations to a compatible reconciler rather than pretending a binary rollback restores the whole system.

## Freeze the Candidate and Invalidate Evidence Selectively

Evaluation results bind to an immutable candidate, not a branch name. After an edit, create a new candidate identity. Describe the changed dependency and determine which obligations require retesting. A changed retry instruction affects behavioural evidence even if no executable code changed. A spelling correction in an operator note may leave runtime evidence intact if the note cannot influence execution.

Selective reuse must be justified, not assumed. Record the dependency mapping and reviewer decision that make an old receipt applicable to a new candidate. Broad shared changes—system prompts, model configuration, policy, or retrieval—may affect many tasks, making a broad behavioural rerun appropriate. A small diff is not necessarily a small behavioural change.

This illustrative pseudocode describes the decision boundary, not a runnable SDK or tested release service:

```text
assess_release(candidate, campaign, receipts, operator_request):
    verify_campaign_identity_and_nonempty_required_inventory(campaign)
    observations = validate_receipt_provenance_and_applicability(receipts)
    preserve_all_failures_errors_unknowns_and_cancellations(observations)
    if operator_request.cancelled:
        return CANCELLED_WITH_RECONCILIATION_PLAN
    if candidate.digest != campaign.evaluated_candidate_digest:
        return HOLD_FOR_NEW_IDENTITY_AND_AFFECTED_RETESTS
    if any_required_failure_or_critical_veto(observations):
        return REJECT_CURRENT_CANDIDATE
    if any_required_receipt_missing_stale_errored_unknown_or_cancelled(observations):
        return BLOCKED_WITH_ORIGINAL_CAUSES
    if not every_required_check_has_a_current_pass(observations):
        return BLOCKED_FOR_UNRECOGNISED_OR_INCOMPLETE_EVIDENCE
    if not predeclared_comparison_policy_satisfied(observations):
        return HOLD_FOR_EVIDENCE_OR_REDESIGN
    return ELIGIBLE_FOR_NAMED_STAGE  # Not permission to deploy.
```

Store the final decision alongside its evidence manifest. The record should identify the deployment stage, permitted action classes, owner, limits, and expiry or reassessment triggers. A later reader must be able to distinguish “approved for read-only shadow” from “approved to issue credits.”

## Shadow and Canary Without Duplicate Side Effects

A shadow evaluates production-like input without becoming a second production actor. Route its proposed mutations to a simulator, denied adapter, or effect-capture interface; do not give it live write credentials and hope it refrains. Even nominal reads can expose sensitive data, consume quotas, or trigger work, so shadow access still requires a defined scope and budget.

Maintain isolation between baseline and shadow state. A shadow that writes shared memory or updates the retrieval index can influence the baseline and invalidate the comparison. Record proposed effects and compare them with authorised reference outcomes. Differences are evidence to investigate, not an automatic mandate to make the shadow match the baseline; the baseline can be wrong too.

A canary is different: it owns a limited share of real operations. Route each logical operation to one active owner and keep that routing stable across retries and restarts. Changing traffic percentages must not move an unknown C18 operation to B17 as if it were new. Read-only shadow may observe the same request, but only the selected execution path may mutate its target.

Define expansion conditions, exposure ceilings, rollback triggers, and an available operator before admission. Include evidence volume and task coverage, not just elapsed time. An uneventful hour containing no relevant requests establishes little. Real-time critical signals can stop admission immediately, while delayed quality labels may require holding expansion until sufficient reviewed outcomes arrive.

## Rollback Changes Routing; Reconciliation Resolves Effects

Rollback first changes what may happen next. Stop new candidate admissions, revoke or fence obsolete writers as appropriate, and determine which in-flight operations are confirmed, rejected, or unknown. Then decide whether the previous version can safely serve new work. Restoring B17's binary is not permission to replay C18's unfinished queue.

Preserve C18's operation identities and authoritative receipts. Reconcile unknowns through a compatible service, and make compensation a separately authorised operation. In Northline's case, the $50 confirmed duplication and the $75 unresolved intended credits require different handling. Aggregating them into a $125 “loss” would be as misleading as declaring the rollback complete because the old process is running.

Exercise the fallback before the release where practical. Verify state readability, credential scope, effect-gateway enforcement, and operator access during simulated provider or network failure. A rollback button that relies on the same unavailable dependency may provide little recovery value. When a clean downgrade is impossible, the safer response may be mutation shutdown plus read-only service while reconciliation proceeds.

## Implementation Checklist and Post-Release Ownership

Build the smallest release mechanism that closes the relevant risks; do not create a second orchestration platform solely to collect signatures. For one bounded service, a versioned manifest, trusted check runner, immutable evidence store, explicit routing policy, and owned recovery procedure may suffice. Complexity should follow observed failure boundaries and operational requirements.

Before an evaluation campaign, check the following:

- Name the release owner, action class, target population, and intended change.
- Freeze candidate and measurement identities, including state and tool contracts.
- Declare required checks, expected discovery, comparison margins, and vetoes.
- Fix held-out cases and identify related-source clusters and prior exposure.
- Provide isolated fixtures, bounded execution budgets, and independent grading.
- Define retest dependencies, staged rollout authority, and unresolved-work handling.

Before expansion, verify the actual deployed identity against the approved manifest, not merely the build job's success message. Confirm that the on-call owner can disable mutations and locate every unknown operation. Inspect a sample of real transcripts and effects for differences the offline harness could not reproduce.

Ownership continues after expansion. Assign responsibility for delayed outcomes, grader drift, provider changes, retrieval freshness, expired exceptions, and unresolved effects. Review new incidents for regression coverage without copying private customer data indiscriminately. Changes to a model alias, remote tool schema, or policy document can invalidate assumptions even when nobody merges a local commit.

Anthropic's evaluation guidance treats automated evals as complementary to production monitoring, human review, and feedback. Operationally, this means a release score starts an evidence-backed deployment decision; it does not retire the people and processes responsible for noticing when that evidence no longer applies.

## Exercises

1. **Construct a release identity.** Select a loop with one external tool and retrieval. List candidate components separately from measurement components. Acceptance: changing a runtime prompt, tool schema, retrieval revision, or grader produces an identifiable new dependency; secret values are absent; unpinnable external dependencies are explicitly recorded.
2. **Recompute the fictional comparison.** Derive both pass rates, paired improvement, total costs, cost per accepted outcome, and the approximate independent-case standard error. Acceptance: retain all 240 cases, distinguish percentage points from relative percent change, and explain why customer clustering or repeated seeds invalidates naive independence claims.
3. **Break the release gate safely.** Design fixture results for empty discovery, one required unknown, one required failure amid many passes, operator cancellation, and a post-evaluation prompt edit. Acceptance: none produces ordinary release eligibility; successful unrelated evidence and original errors remain visible. No real deployment is needed.
4. **Prove single-owner rollout.** In a local fake receiver, route a request to the canary, drop its response, change the routing percentage, and restart the caller. Acceptance: the same logical operation remains owned and discoverable, with no second live execution path; shadow has no mutation authority.
5. **Rehearse withdrawal.** Give the release a newer checkpoint schema and an unknown external effect. Acceptance: the recovery plan identifies compatible readers, preserves the effect identity, assigns reconciliation ownership, and distinguishes rollback, compensation, and unresolved state without claiming any of them happened merely because a command returned zero.

## Key Takeaways

- Release evidence applies to an identified system and measurement package, not a model name or mutable branch.
- Required evidence must be nonempty, complete, current, and honestly classified; unknown, error, and cancellation are not passes.
- Paired comparisons expose regressions hidden by average gains; uncertainty depends on independent evidence, not raw run count.
- Calibrate graders, preserve held-out separation, and test failure boundaries as well as ordinary outcomes.
- An edit creates a new candidate; reuse only evidence whose applicability is established.
- Shadow observes without acting; a canary owns bounded real operations without duplicating baseline effects.
- Rollback governs future execution. Reconciliation and authorised compensation handle what already happened.

## Sources and Evidence Limits

- Anthropic Engineering, [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents). Reviewed grading and maintenance passages support deterministic grading where appropriate, expert calibration, insufficient-evidence outcomes, transcript inspection, suite ownership, and complementary production monitoring. They do not validate this chapter's fictional arithmetic or prescribe its release policy.
- AWS Prescriptive Guidance, [Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html). Supports the distinction between locally committed intent and independently delivered effects; duplicate handling remains necessary.
- Martin Kleppmann, [How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html), 8 February 2016. Reviewed discussion of paused clients and resource-enforced fencing informs stale-owner handling, not a current product certification.

Source coverage is limited to the primary passages reviewed for this edition. The release schema, decision policy, fictional incident, calculations, pseudocode, and exercises are engineering proposals and teaching material, not an implemented system or measured deployment result.

*Next: [Chapter 41, Agent Identity and Delegated Authorization](chapter-41.md), asks who the released agent is, which authority it carries, and how delegation remains bounded when it crosses tool and organisational boundaries.*

[Previous: Chapter 39](chapter-39.md) · [Next: Chapter 41](chapter-41.md)
