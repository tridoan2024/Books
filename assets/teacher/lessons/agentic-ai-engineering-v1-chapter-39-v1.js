(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-39",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Durable Execution",
  "subtitle": "Professor Mode · Retries, idempotency, resource fencing, and authoritative reconciliation",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-39/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-39/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 39, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "92fe8c379579afaaddaacd054c1a04ec2ef84803efc1824dee094a44901bbf77",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Recover an uncertain external effect",
      "question": "Does a timeout prove that nothing happened?",
      "outcome": "Distinguish logical intent, individual attempts, and authoritative outcomes.",
      "beats": [
        {
          "id": "durable-stakes",
          "role": "orient",
          "title": "The refund was correct; applying it twice was not",
          "speech": "A refund of forty dollars is our first case. In the chapter's fictional support incident, the payment service commits the refund, but the response disappears. A replacement worker creates a new request identifier and sends another refund. The customer receives eighty dollars. A paused deployment worker is our second case. Its lease expires, another worker takes ownership, and the original worker later resumes with credentials that still permit changes to external resources. A corrective transaction is our third case. An operator tries to repair a duplicate payment, but the repair itself loses its response. These are illustrative engineering scenarios, not measured production incidents. Their shared mechanism is a gap between local knowledge and external business effects. Correct reasoning, checkpoints, and detailed traces do not close that gap by themselves. Our governing question is: how can a system recover without duplicating, contradicting, or inventing the user's authorized intent? We will separate operations from attempts, persist a ledger of external effects, bound retries by the receiver's contract, reject stale owners, and reconcile uncertain outcomes. You will leave able to design a fault test in which the receiver commits and drops its response. Then explain the recovery result: it must confirm one intended effect or explicitly stop with uncertainty.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A local timeout can coexist with a completed external effect"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Duplicate refund",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A refund of forty dollars"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Stale deployment",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A paused deployment worker"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Uncertain repair",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A corrective transaction"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Checkpoints recover computation; they do not atomically recover remote effects",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Correct reasoning, checkpoints"
            },
            {
              "action": "note",
              "id": "question",
              "text": "How can recovery preserve the exact authorized intent?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "durable-stakes-spoken-v2"
        },
        {
          "id": "durable-timeout-prediction",
          "role": "predict",
          "title": "Predict the state before deciding the next action",
          "speech": "The worker sent a refund and received a timeout. Predict the operation state. It is unknown: the request may never have arrived, may still be processing, or may have completed before the response was lost. A timeout is an observation about communication. It is not authoritative evidence of nonexecution. Continue the same logical operation with the same intended account, target, amount, and stable identity. Under a suitable receiver contract, a retransmission can reuse the original key. Otherwise query the authoritative service through a supported correlation identifier. If neither path resolves the ambiguity safely, stop automatic mutation and assign reconciliation. Increasing the timeout reduces some failures but does not remove this fundamental uncertainty.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Timeout → unknown outcome → contract-specific recovery"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Sent attempt",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "sent a refund"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Unknown outcome",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "It is unknown"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "No success receipt does not establish that no effect occurred",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not authoritative evidence"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Safe recovery",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Under a suitable receiver contract"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which receiver observation would establish the outcome?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "query the authoritative service"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "durable-timeout-prediction"
        }
      ]
    },
    {
      "id": "ledger",
      "title": "Persist intent before crossing the boundary",
      "question": "What survives when the worker loses its receipt?",
      "outcome": "Build a versioned effect ledger and state the local outbox guarantee.",
      "beats": [
        {
          "id": "durable-identities",
          "role": "derive",
          "title": "One operation can have several attempts and one business effect",
          "speech": "The operation record captures stable authorized intent: tenant, effect type, target, payload digest, authorization reference, and workflow revision. Attempt records capture transmissions, worker generations, times, and errors. Outcome evidence identifies what the receiver actually confirmed. Keep these meanings separate even in one database. An accepted asynchronous request is not necessarily a completed refund. Use conditional state transitions so a late timeout cannot overwrite a confirmed outcome. Reject a payload conflict for an existing operation identity instead of accepting the last writer. Record the canonicalization version used to compute the digest; changing how absent fields or amounts are normalized can otherwise change the identity comparison across releases.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Operation identity, attempt identity, and outcome evidence answer different questions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Intent",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The operation record"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Attempts",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Attempt records"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Outcome evidence"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the receipt confirm acceptance or business completion?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "accepted asynchronous request"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A late timeout must not move a confirmed effect back to unknown",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "conditional state transitions"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "durable-identities"
        },
        {
          "id": "durable-outbox",
          "role": "worked-example",
          "title": "The outbox closes a local gap, not the network boundary",
          "speech": "Commit the approved business decision and its outbox entry in one local database transaction. A dispatcher then reads that entry and calls the remote service. This prevents a crash between local approval and queue insertion from silently losing dispatch work. It does not atomically commit the remote effect with the local database. Before transmission, durably record that an attempt may be in flight. A crash after that record but before the actual send creates conservative uncertainty. Recovery can query or safely retransmit under the documented contract; it cannot assume the network call happened or did not happen. Trusted host code advances the ledger, while conversation text can only propose actions and report observations.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Local transaction → dispatch record → external call"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Intent + outbox",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "business decision and its outbox entry"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The local transaction does not include the external service",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not atomically commit"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Dispatch state",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "durably record"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "durably record"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What if the process crashes after dispatch is recorded but before sending?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A crash after that record"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Remote effect",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "actual send"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "actual send"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "durable-outbox"
        }
      ]
    },
    {
      "id": "retry",
      "title": "Retry only within the receiver contract",
      "question": "What does an idempotency key actually protect?",
      "outcome": "Check scope, payload, retention, authorization, and a shared attempt budget.",
      "beats": [
        {
          "id": "durable-key-contract",
          "role": "derive",
          "title": "The key is useful only while its contract applies",
          "speech": "Use a stable key when retrying one intended operation. Its protection depends on account and endpoint scope, payload comparison, retention, concurrent-request behavior, and what the returned evidence actually proves. A new key for every retry permits duplicates. A key based only on the amount can suppress legitimate separate payments. Reusing an old key after the receiver forgets it may create a new operation. Stripe provides a specific example: its documented behavior can retain the status and body of the first executed request, including a server error, and keys may be pruned after at least twenty-four hours. This behavior is specific to that provider. Other payment services can have different contracts. Check current adapter documentation and reconcile when the safe retry horizon has ended.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Idempotency contract: identity + payload + scope + lifetime"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Stable intent",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a stable key"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Contract scope",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "account and endpoint scope"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Retention",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "after the receiver forgets it"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An old key can become a new request after receiver retention ends",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "may create a new operation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this error describe the stored result of an executed request?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "retain the status and body"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "durable-key-contract-spoken-v3"
        },
        {
          "id": "durable-retry-budget",
          "role": "worked-example",
          "title": "Retries multiply across layers unless one budget owns them",
          "speech": "Suppose the scheduler permits three runs, each agent run makes three tool calls, and each call permits three network transmissions. The board shows the multiplication: three times three times three equals twenty-seven possible transmissions for one operation. These are assumed total counts, not counts of retries after an initial attempt. Carry cumulative attempts, elapsed time, and a deadline across every layer and restart. Classify confirmed completion, definite recoverable nonexecution, ambiguity, and permanent rejection before deciding what is allowed. Backoff and jitter reduce contention without proving a write is safe. Reserve capacity for reconciliation reads separately from new mutations, so an outage does not exhaust the quota needed to discover existing effects.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Scheduler runs → calls per run → transmissions per call"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "3 runs",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "three runs"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "3 calls",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "three tool calls"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "three tool calls"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "3 transmissions",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "three network transmissions"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "three network transmissions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "3 × 3 × 3 = 27 possible transmissions for one operation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The board shows"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which layer owns the cumulative budget across restarts?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Carry cumulative attempts"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "durable-retry-budget"
        }
      ]
    },
    {
      "id": "ownership",
      "title": "Reject obsolete owners at the protected resource",
      "question": "Does an expired lease prevent an old worker from writing?",
      "outcome": "Separate scheduling, fencing, duplicate suppression, and current authority.",
      "beats": [
        {
          "id": "durable-fencing",
          "role": "derive",
          "title": "A lease grants time; a resource must reject the stale owner",
          "speech": "Worker A pauses while holding a lease. After expiry, worker B receives a newer ownership generation. When A resumes, its local belief and credentials may still permit a write. The protected resource must enforce the generation and reject obsolete owners after accepting the newer one. Checking only at the worker or when updating the local ledger cannot undo an external effect. A trusted gateway helps only when all relevant writes pass through it and its enforcement matches the resource contract. If the provider lacks the necessary coordination primitive, state the limitation and prevent overlapping writers or retain a suitable manual gate. A scheduling lease alone does not provide fencing.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Old worker pauses → new generation accepted → stale write rejected"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "A pauses",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Worker A pauses"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "B takes ownership",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "worker B receives"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "worker B receives"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Resource enforcement",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The protected resource"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "The protected resource"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Fencing must protect the effect boundary, not only the local record",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot undo an external effect"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can any writer bypass the enforcing gateway?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "all relevant writes pass through it"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "durable-fencing"
        },
        {
          "id": "durable-controls-differ",
          "role": "check",
          "title": "A unique stale operation can pass duplicate detection",
          "speech": "An obsolete worker sends an operation identifier the receiver has never seen. Will duplicate detection reject it? No: novelty does not prove current ownership. Conversely, two current workers can use different operation identifiers for the same business intent and duplicate the effect. Fencing rejects obsolete owners. An operation is idempotent when repeating it produces no additional business effect. Current authorization is a third requirement. A user may revoke permission during a pause, and reusing an old key does not restore it. Recheck authorization and resource preconditions before transmission. A revocation can race with a request already in flight. Determine the authoritative outcome before proceeding. Local cancellation alone does not retract a remote request.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Three independent checks: duplicate intent, stale owner, current authority"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Idempotency",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "duplicate detection"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Fencing",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Fencing rejects"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Authorization",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Current authorization"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An old operation key cannot restore expired or revoked permission",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not restore it"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What evidence resolves a request already in flight during revocation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "revocation can race"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "durable-controls-differ-spoken-v3"
        }
      ]
    },
    {
      "id": "reconcile",
      "title": "Resolve uncertainty without inventing an outcome",
      "question": "When does an empty lookup prove nonexecution?",
      "outcome": "Use authoritative matching evidence and separately authorize compensation.",
      "beats": [
        {
          "id": "durable-reconciliation",
          "role": "derive",
          "title": "An empty search result is not automatically a negative proof",
          "speech": "Start with a direct receiver operation lookup when available. Otherwise use a supported correlation key or authoritative transaction evidence. Match the account, target, amount, payload, and identity before updating the ledger. Two refunds of the same amount in the same minute may belong to different operations. An empty result can reflect indexing delay, region, archival rules, or insufficient permission. Infer nonexecution only when the receiver contract supports that inference for the queried scope and time. Otherwise retain unknown with a next observation or a named operator. A resolution deadline triggers attention; it does not permit the software to invent failure. Tell the user what was sent, what remains uncertain, and why automatic mutation is paused.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Authoritative lookup → exact identity match → conditional ledger update"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Lookup",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "direct receiver operation lookup"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Match",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Match the account"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Match the account"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Record",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "updating the ledger"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "updating the ledger"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An empty result may reflect visibility or consistency limits",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "An empty result"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What does this lookup contract actually prove?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Infer nonexecution only"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "durable-reconciliation"
        },
        {
          "id": "durable-compensation",
          "role": "transfer",
          "title": "A correction is another authorized operation with its own uncertainty",
          "speech": "Suppose authoritative evidence confirms both refunds. Taking forty dollars back from the customer is not automatically permitted just because it restores the expected balance. Business policy determines the remedy. Follow its communication and approval requirements. Represent an approved compensation as a new operation linked to the original, with its own identity, attempts, receipts, and recovery policy. The original effect remains in history. A correction can fail or become unknown too. Apply this reasoning to inventory reservation, payment, and shipment: some steps can be canceled, some can be refunded, and some can only be partially recovered. Reversing function order does not establish valid business rollback. Identify those limits before starting an irreversible sequence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Original effect + authorized corrective effect = actual business history"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Confirm original",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "confirms both refunds"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Authorize remedy",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Business policy determines"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Track correction",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Represent an approved compensation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Compensation is new work; it does not erase the original effect",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "original effect remains in history"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What if the compensating action also loses its response?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "become unknown too"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "durable-compensation-spoken-v2"
        }
      ]
    },
    {
      "id": "test",
      "title": "Test at the remote effect boundary",
      "question": "Can recovery safely end with an unknown result?",
      "outcome": "Inject commit-and-lost-response faults and inspect the durable business effects.",
      "beats": [
        {
          "id": "durable-crash-test",
          "role": "transfer",
          "title": "Test the receiver effect count independently of the worker",
          "speech": "Build a controlled receiver that commits and drops its response. Keep its effect count outside the worker process so a restart cannot erase the evidence. Inject crashes before intent commit, after intent commit, after dispatch is recorded, after remote commit, and after the receipt arrives but before local confirmation. Add simultaneous workers, a resumed stale worker, changed payloads under one key, expired key retention, revoked permission, and delayed lookup visibility. The acceptance criterion is not universal automatic completion. It is one authorized effect where that guarantee is supported, discoverable confirmed outcomes, and explicit uncertainty whenever safe resolution is unavailable. Test cancellation and compensation at the same boundaries, with real mutations confined to the controlled receiver.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Crash test: preserve independent evidence of remote effects"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does restarting the worker erase the test’s evidence?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "outside the worker process"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Before dispatch",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "before intent commit"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "After remote commit",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "after remote commit"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Before local confirmation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "before local confirmation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Safe recovery can stop with explicit uncertainty",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not universal automatic completion"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "durable-crash-test"
        },
        {
          "id": "durable-recap",
          "role": "reflect",
          "title": "Recover the operation, not just the process",
          "speech": "Separate logical intent from attempts and outcome evidence. Persist intent before dispatch and state the outbox's local boundary. Check the receiver's identity, payload, and retention contract before retrying. Keep one cumulative attempt budget. Enforce ownership at the resource and preserve current authorization. Reconcile using authoritative evidence, and treat compensation as new work. Remember: persist, identify, authorize, dispatch, reconcile. Apply that sequence to one integration in your own architecture. Discuss next: what proves nonexecution after a lost response? Which stale worker can still reach the protected resource? Which recovery test would reveal a duplicate effect after a restart? The next chapter turns these control claims into evidence for a bounded release decision.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Durable execution preserves intent and uncertainty across failures"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Stable intent",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "logical intent"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Bounded retry",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "before retrying"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Authoritative outcome",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Reconcile using authoritative evidence"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: persist → identify → authorize → dispatch → reconcile",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: proof of nonexecution? Stale writer? Duplicate-effect test?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "durable-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "393b0bb7314609783ed2a0adb911a716d72b26f4dba31670820861d722ba9faa"
};
  lesson.beats = [];
  lesson.units.forEach(function (unit, ui) {
    unit.beats.forEach(function (beat, bi) {
      beat.unitId = unit.id;
      beat.unitIndex = ui;
      beat.beatIndex = bi;
      beat.unitTitle = unit.title;
      beat.unitQuestion = unit.question;
      beat.unitOutcome = unit.outcome;
      lesson.beats.push(beat);
    });
  });
  lesson.estimatedMinutes = Math.round(lesson.beats.reduce(function (sum, beat) {
    return sum + (beat.speech.match(/\S+/g) || []).length / 125 + beat.pauseAfterMs / 60000;
  }, 0) * 10) / 10;
  window.DBOOK_TEACHER_LESSON_V1 = lesson;
  window.DBOOK_TEACHER_LESSON = lesson;
})();
