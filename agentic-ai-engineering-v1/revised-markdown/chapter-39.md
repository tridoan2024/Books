# Chapter 39: Durable Execution — Retries, Idempotency, and Reconciliation

## Introduction: Correct Work Can Still Be Applied Twice

[Chapter 38](chapter-38.md) asks who may change the rules of a loop. This chapter asks a different question: what happens when a correctly authorized action crosses a process boundary and its outcome becomes uncertain? A loop may use a fixed rubric, a carefully reviewed plan, and a high-quality model, yet still issue the same refund twice. The failure is not necessarily in its reasoning. It may be in the gap between a remote effect and the local record of that effect.

[Chapter 17](chapter-17.md) introduced isolated workspaces and checkpoints. Those techniques recover local computation. They do not make an external service participate in the checkpoint transaction. [Chapter 18](chapter-18.md) established when execution should stop; stopping does not prove that an in-flight operation stopped. [Chapter 29](chapter-29.md) supplied traces and replay; a trace explains an operation but is not permission to repeat it. [Chapter 33](chapter-33.md) covered operational recovery; here we develop the effect-level machinery that makes that recovery defensible.

The governing distinction is between **an attempt** and **a logical operation**. An attempt is one transmission or execution. A logical operation is the business change the user authorized. Three attempts might implement one operation. Conversely, two similar requests might be two independently authorized operations. Confusing these identities creates both duplicate effects and accidental suppression of legitimate work.

Durable execution means preserving enough trustworthy state across failures to continue, reconcile, compensate, or stop without silently changing the authorized intent. It is not a promise of universal exactly-once delivery. Every guarantee has a boundary: a database transaction, a receiver's deduplication contract, a resource version, or an operator's reconciliation procedure. The design task is to make those boundaries explicit.

## An Illustrative Incident: The Refund That Timed Out

Consider a fictional support system processing an approved refund of forty dollars. The case, timing, and identifiers in this chapter are illustrative, not a documented company incident. An agent has permission to propose refunds, while a deterministic service checks the approved order, amount, account, and policy before making the payment call.

At 10:03, worker A transmits the refund. The payment service commits it and begins returning a receipt. The connection drops before the worker receives that receipt. The worker reports a timeout, and a supervisor restarts the job from its last checkpoint. The checkpoint says that the refund task is unfinished. Worker B creates a new request identifier and submits the same amount. Both refunds succeed. Local traces show one timeout and one success, while the customer receives eighty dollars.

The critical error occurred before worker B's call. The system treated “no success receipt” as “no effect.” Those propositions are not equivalent. A timeout can mean that the request never arrived, that the receiver rejected it, that processing continues, or that processing completed and the response was lost. Increasing the timeout may reduce this incident's frequency, but it does not remove the ambiguity.

A durable design allocates the logical operation identifier before transmission and persists the intended effect. On the timeout, worker A records an unknown outcome. Worker B resumes that same operation rather than creating another one. If the receiver supports an appropriate idempotency contract, B may retransmit the identical request under the original key. Otherwise, B queries the authoritative service using a supported correlation identifier. If neither path can resolve the ambiguity safely, it stops automatic mutation and routes the operation for reconciliation.

Notice what did not solve the problem: a second model, an extra prompt saying “do not duplicate,” or a test proving the refund amount calculation correct. The amount was correct. The control plane needed to represent uncertainty about execution.

## Model Intent, Attempts, and Outcomes Separately

A useful effect record contains a stable logical operation ID, tenant or account scope, effect type, target identity, canonical payload digest, authorization reference, workflow revision, and creation time. Attempts have separate IDs, timestamps, worker generations, transmission observations, and error classifications. Outcomes reference receiver receipts or authoritative reconciliation observations.

Keep the fields separate even if an early implementation stores them in one database. An attempt's timeout must not overwrite the operation's previously confirmed outcome. A successful duplicate response must not count as an additional business effect. A cancellation request belongs to the workflow's intent state; it is not evidence that an already submitted effect disappeared.

A compact operation state machine might use the following states. Their names are design suggestions, not a vendor API.

| State | Meaning | Permitted next step |
|---|---|---|
| Prepared | Intent and authorization recorded; no dispatch recorded | Claim and dispatch after current checks |
| Dispatching | An attempt may have reached the receiver | Await receipt or reconcile |
| Confirmed | Authoritative evidence identifies the completed effect | Return existing result; do not repeat the operation |
| Rejected | Receiver conclusively rejected without the intended effect | Correct the cause under policy, or stop |
| Unknown | Available evidence does not establish whether the effect occurred | Query, safe same-key retry, or manual review |
| Compensating | A separately authorized corrective operation is in progress | Track that operation independently |
| Resolved | Reconciliation or compensation has reached its defined terminal condition | Preserve the history and report the actual outcome |

“Rejected” requires evidence about the effect, not merely an HTTP status chosen by an intermediate proxy. Similarly, “Confirmed” means confirmed against a stated contract. A transport acknowledgment might mean accepted for asynchronous processing, not completed. Store the phase that the receiver actually confirms.

Transitions should be conditional on the current record version. A late timeout handler must not move Confirmed back to Unknown. A reconciler discovering completion must not overwrite a different payload or account. The operation identity and payload binding make those consistency checks possible.

## Build an Effect Ledger, Not Just a Conversation Log

The effect ledger is the durable record from which recovery decisions are made. It is different from conversational memory. The agent can propose an action, but trusted host code records and advances the ledger. Retrieved text cannot mark an operation complete, grant permission, or replace the receiver's receipt.

Persist intent before dispatch. Where an application database owns both the business decision and a dispatch queue, an outbox row can be inserted in the same transaction as the approved decision. A separate dispatcher reads the outbox and performs the external call. This closes the local gap between committing business intent and scheduling delivery. It does not atomically commit the remote effect with the local transaction; dispatch still needs deduplication and reconciliation.

Use a uniqueness constraint on the logical operation's scope and identity. Two workers racing to prepare the same operation should converge on one durable record. If they propose different payload digests for that identity, reject the conflict instead of silently accepting whichever payload arrives last. Store the canonicalization version too: changing how amounts, absent fields, or Unicode strings are normalized can otherwise change the meaning of a digest across releases.

Protect ledger integrity and minimize its sensitive contents. Retain receipt references, hashes, redacted request summaries, and necessary policy evidence rather than copying credentials or full customer documents. Restrict who may amend resolution records, and append corrections rather than erasing the history. A retention policy must address both audit needs and applicable privacy obligations; “immutable” is not permission to retain all personal information forever.

The minimal operational query is not “which jobs failed?” It is “which authorized effects have unknown outcomes, how old are they, who owns reconciliation, and what evidence would close each one?” An unresolved operation must remain discoverable even if the parent conversation has ended.

## Idempotency Has a Scope and a Lifetime

An idempotent operation has the same intended effect when applied repeatedly as when applied once, under the relevant contract. This does not mean every response is identical, nor that every side effect such as logging is suppressed. HTTP method semantics provide one useful vocabulary, but a business API's implementation and documented behavior still matter. Consult RFC 9110 for the distinction between safe and idempotent methods and its qualifications on automatic retry.

For a non-idempotent business operation, a receiver may offer an idempotency key. The receiver associates the key with an operation and recognizes retries. The client must understand the scope of that association: account, endpoint, resource, region, or some combination. It must also understand retention, parameter comparison, concurrent requests, and what happens when the first attempt fails before execution begins.

A new key for every retry defeats the mechanism. A key derived only from the amount suppresses unrelated payments. A key shared across tenants risks cross-account collisions. Prefer an opaque, stable operation identifier whose scope is explicit, with the canonical payload digest checked independently. Avoid embedding sensitive business data in keys that may appear in logs.

Suppose the receiver retains keys for a limited period. A retry after that period may be a new operation from the receiver's perspective even when the client reuses its old key. The client therefore needs its own durable record and a retry deadline that respects the receiver's actual contract. Once the safe retry horizon is exceeded, switch to reconciliation rather than assuming the old key remains protective.

Payload changes deserve equal care. If the authorized amount changes from forty to thirty dollars after an unknown attempt, do not reuse the operation as though only a harmless parameter changed. First resolve the original effect. A new authorized operation, perhaps a corrective adjustment, must describe the revised intent. Idempotency protects a stable intent; it does not reconcile contradictory intentions.

Provider examples are useful for learning these questions, not for defining a universal API. Stripe documents retaining the first executed request's status and body, including a `500` response, and comparing parameters when a key is reused. It also documents that keys may be removed once at least twenty-four hours old; reuse after pruning creates a new request. Validation failures and concurrent conflicts that prevent execution are not stored as results. These are Stripe-specific semantics from the source reviewed for this edition, not a universal retry rule. Do not transfer them to another service merely because both accept an `Idempotency-Key` header.

The AWS Builders' Library discussion of late-arriving requests makes the related design point: deduplication lifetime and semantic equivalence are service contracts. Its example associates retention with an EC2 resource lifetime plus a late-arrival interval and rejects reused identifiers with mismatched parameters. That is not unlimited deduplication or a promise that every repeated response is byte-identical. Use the contract of the actual receiver, and revalidate it when upgrading the adapter.

## Retries Need Classification, Deadlines, and Ownership

A retry policy should distinguish at least four situations: definite nonexecution with a recoverable cause, a confirmed completed operation, an ambiguous outcome, and a permanent or policy rejection. Each leads to different behavior. A schema error normally needs a corrected proposal. A permission error needs an authorized credential or policy change, not repeated calls with the same credentials. A confirmed result should be returned from the durable record.

Transient transport errors do not automatically imply safe retry. For reads, repeated requests may be acceptable but still need bounded cost and consistency assumptions. For writes, the policy must consult operation semantics and the receiver contract. After an ambiguous write, choose a same-operation retransmission only when the deduplication guarantee remains applicable; otherwise query or escalate.

Assign one layer responsibility for the retry budget. An SDK that retries three times inside a tool, called three times by an agent, restarted three times by a scheduler can produce far more attempts than any individual component appears to permit. Carry cumulative attempt counts, elapsed time, and the operation deadline across process restarts. Avoid allowing a new conversation to reset the same business operation's budget.

Use bounded exponential backoff with jitter for retryable contention or availability failures, and honor meaningful server retry guidance within the overall deadline. Jitter reduces synchronized retry bursts; it does not justify indefinite retries. A circuit breaker can suppress calls to an unhealthy dependency, but opening the breaker does not resolve the outcomes of calls already sent.

Recovery traffic needs a budget distinct from new mutation traffic. During an outage, stop creating more unknown writes while still allowing carefully rate-limited reconciliation reads. Reserve capacity for operators and recovery workers. Otherwise, a fleet may spend all its quota generating the very work that prevents it from learning what already happened.

## Leases Do Not Fence Stale Workers

A lease grants temporary ownership. It is useful for scheduling but insufficient to stop a paused worker that resumes after losing that ownership. Worker A can pause during a long network interruption, its lease can expire, and worker B can acquire the task. When A resumes, it may still hold valid credentials and execute an old action.

A fencing token is a monotonically increasing generation associated with ownership. The protected resource must reject operations from older generations after accepting a newer one. Checking the token only in the worker or only when writing the local ledger does not protect an external effect that already occurred. Enforcement must be at the resource boundary or in a trusted gateway through which all relevant effects pass.

Some third-party services do not accept fencing tokens. Be explicit about the limitation. A gateway can combine serialization, current authorization checks, and stable operation keys, but it cannot manufacture remote compare-and-set semantics that the provider does not expose. For a high-consequence operation lacking safe coordination primitives, retain a manual gate or redesign the integration to avoid overlapping writers.

Idempotency and fencing solve different problems. Idempotency prevents repeated attempts for one intent from duplicating its effect. Fencing prevents an obsolete owner from issuing stale intent. A worker may hold an old but unique operation ID; deduplication will not stop it because the receiver has never seen that ID. Conversely, two current workers using the same generation can still duplicate an effect unless their operation identity converges.

Authorization must also be reconsidered after a pause. A previously approved action may no longer be permitted because the user revoked it or the target changed. Revalidation before transmission is important, but it cannot retract a request that already crossed the boundary. Report that race honestly and reconcile the in-flight operation.

## Reconciliation Is an Algorithm, Not a Guess

A reconciler starts with the prepared intent and its stable correlation identifiers. It queries the system authoritative for the effect, checks that the returned account, target, amount, and operation identity match, then records the evidence and the resulting state transition. A response that merely resembles the intended action is not sufficient; two customers may receive the same refund amount within the same minute.

Absence is harder to establish than presence. A query may lag a write, search a different region, exclude archived records, or lack permission to view the result. “No results” only establishes nonexecution if the service contract makes that inference valid for the queried scope and time. Otherwise the operation remains unknown, with a scheduled next observation or a named operator responsible for review.

A practical reconciliation ladder moves from strongest to weakest evidence: direct lookup by a receiver operation ID; lookup by a supported client correlation key; comparison against authoritative resource versions or transactions; then manual investigation. The ladder is service-specific. Never substitute a language model's confidence for missing authoritative evidence.

Give every unknown operation a resolution deadline and an escalation route. The deadline controls when human attention becomes necessary, not when the software may declare failure by fiat. An operator's decision to accept residual risk should be recorded as such. It is not equivalent to proving that no effect occurred.

The user-facing result should preserve partial truth: “The refund request was sent; its outcome is not yet confirmed. Automatic resubmission is paused to avoid duplication.” This is more useful than both “refund failed” and “refund completed” when neither is supported. Later reconciliation should update the same operation rather than creating a disconnected success message.

## Compensation Is a New Business Operation

Compensation does not rewind time. A refund of a duplicate charge is another transaction. A deleted resource may require restoration from a particular backup. A sent notification may be corrected, but recipients may already have acted on it. The compensating action can fail, need approval, create fees, or itself become ambiguous.

Represent compensation as a new logical operation linked to the original. Give it its own authorization, idempotency identity, attempts, receipts, and reconciliation policy. Do not mark the original as “never happened.” Preserve both the original effect and the corrective effect so an auditor or operator can understand the final business position.

For a multi-step workflow, identify compensability before dispatching the first irreversible step. Reserving inventory may be cancellable; charging a card may be refundable; shipping a package may be only partially recoverable. A saga-style sequence can orchestrate compensations, but its correctness depends on the business semantics of each step. Calling functions in reverse order is not a universal rollback algorithm.

In the fictional incident, the team should first determine whether both refunds actually completed. If so, a second compensating debit is not automatically authorized merely because it would restore the expected balance. The support policy may require customer communication or a different resolution. Engineering supplies an accurate ledger and safe mechanisms; business authority decides which correction is allowed.

## Implementation Guidance: Keep Decisions Outside Generated Prose

The following is **illustrative pseudocode**, not a tested implementation or an installable LoopKit API. The abstract operations require database transactions, conditional transitions, service-specific retry contracts, and trusted authorization enforcement.

```text
resume(operation_id):
    op = ledger.load(operation_id)
    if op.state == CONFIRMED:
        return op.receipt
    if op.state in {RESOLVED, COMPENSATING}:
        return existing_resolution_or_compensation_status(op)
    if op.state in {DISPATCHING, UNKNOWN}:
        observation = authorized_reconciliation_query(op)
        if observation.authoritative:
            return ledger.resolve_if_compatible(op, observation)
        if not adapter.same_key_retry_is_safe(op):
            return retain_unknown_and_escalate(op)
        # Retry continues below with the SAME intent and key, never a new effect.
    elif op.state == REJECTED:
        if not op.rejection.proves_nonexecution or not op.rejection.retryable:
            return rejection_requiring_changed_prerequisite_or_stop(op)
    elif op.state != PREPARED:
        return stop_on_unrecognized_state(op)

    claim = ledger.claim_if_current(op.version)
    require_current_authorization(op.intent, claim.generation)
    require_unchanged_payload(op.payload_digest)
    require_retry_budget_and_receiver_key_lifetime(op)
    require_resource_preconditions(op)
    ledger.record_dispatching_before_network_call(op, claim)

    result = adapter.execute(op.intent, op.stable_key, claim.generation)
    if result.authoritative_completion:
        ledger.confirm_if_compatible(op, result.receipt)
    elif result.authoritative_nonexecution:
        ledger.record_rejection_if_current(op, result.evidence)
    else:
        ledger.mark_unknown_unless_already_confirmed(op)
```

The ordering deliberately leaves a conservative gap: a crash after recording Dispatching but before sending the request produces an unknown operation even though no remote effect occurred. That false uncertainty is preferable to incorrectly assuming nonexecution after a request did cross the network. A supported receiver lookup or safe retry resolves it; without those, the operator may need to investigate.

Implement one adapter end to end before generalizing. Document the receiver's identity scope, key lifetime, receipt meaning, query consistency, cancellation behavior, and compensation semantics. Add contract tests against a controlled receiver. If a sandbox differs from production, record that limitation rather than assuming parity.

## Recovery Tests That Exercise the Boundary

Ordinary happy-path tests prove little about ambiguous effects. Build a controllable receiver that can commit an operation while dropping the response, delay completion, return duplicate receipts, and reject stale generations. Persist its effect count independently of the worker so restarting the worker does not erase the evidence being tested.

Test crashes before intent commit, after intent commit, after dispatch is recorded, after the receiver commits, and after the receipt arrives but before the local ledger confirms. The acceptance condition is not that every run finishes automatically. It is that no unauthorized duplicate appears, confirmed effects remain discoverable, and unresolved effects are explicitly represented rather than invented away.

Add concurrent-worker tests and a paused-worker test: A loses its lease, B acquires a newer generation, then A resumes. Where fencing is claimed, the protected receiver must reject A. Also test identical keys with different payloads, legitimate similar operations with different identities, expired key retention, revoked authorization, and eventually consistent “not found” responses.

A cancellation test should distinguish work not dispatched from work already in flight. A replay test should run against recorded results or a mock receiver with mutation disabled. A compensation test should inject failure into the compensation itself. These tests connect directly to the stop controller, observability, and incident procedures developed earlier without treating any one of them as a substitute for effect safety.

## Exercises

1. **Write one receiver contract.** Choose a real integration and document identity scope, deduplication lifetime, receipt phase, lookup guarantees, and cancellation behavior. Acceptance: every field links to current documentation or is marked unknown with an owner; unknown critical behavior blocks automatic writes.
2. **Reproduce the lost receipt.** Use a local fake service that commits and drops its response. Restart the caller. Acceptance: the service records one logical effect, or the caller stops in Unknown without an unsafe second effect; no success is claimed without evidence.
3. **Audit retry multiplication.** Enumerate scheduler, agent, tool, SDK, and transport retries. Acceptance: one cumulative operation budget bounds all actual transmissions and survives restarts.
4. **Design a compensation review.** Select a three-step business workflow. Acceptance: each step has an authority, irreversible consequences, a recovery owner, and a tested or explicitly untested corrective path.

## Key Takeaways

- A timeout describes an observation, not the absence of an external effect.
- Persist stable business intent separately from individual attempts and outcome evidence.
- Idempotency requires a documented scope, payload binding, and lifetime; a header alone is not a guarantee.
- Leases schedule ownership; resource-enforced fencing rejects stale owners.
- Reconciliation uses authoritative evidence and may legitimately remain unresolved.
- Compensation is separately authorized work, not erasure of the original operation.
- Recovery tests must inject faults at the remote-effect boundary, not merely restart local computation.

## Sources and Further Reading

- AWS Builders' Library, **Making retries safe with idempotent APIs**: <https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/>. Reviewed passages on late arrival and changed intent support the bounded lifetime and parameter-mismatch discussion; not a claim that the entire article was reviewed.
- IETF, **RFC 9110: HTTP Semantics**, section 9.2.2, “Idempotent Methods”: <https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2>. Further reading for HTTP terminology; its text was not successfully retrieved in this edition's source review, so this pointer is not a verification receipt.
- Stripe, **Idempotent requests**: <https://docs.stripe.com/api/idempotent_requests>. A provider-specific example; verify the applicable contract when implementing an adapter.
- AWS Prescriptive Guidance, **Transactional outbox pattern**: <https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html>. Background for atomically recording local intent and dispatch work; remote effects still require duplicate handling.
- Martin Kleppmann, **How to do distributed locking** (2016): <https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html>. Discussion of stale clients and fencing at the protected resource.
- The examples, ledger schema, state machine, and exercises in this chapter are engineering designs for illustration. They are not measured production outcomes or executed software tests.
