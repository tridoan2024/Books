(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-41",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Agent Identity and Delegated Authorization",
  "subtitle": "Professor Mode · Trusted grants, exact approval, credential boundaries, and current authority",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-41/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-41/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 41, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "977a3d8c3b764a79e5d0d1c62de211c1cf69abba091e80036901ee55f112bc13",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Constrain the authenticated worker to its actual task",
      "question": "Can the right token authorize the wrong customer?",
      "outcome": "Separate authentication, delegation, task scope, and operation approval.",
      "beats": [
        {
          "id": "identity-stakes",
          "role": "orient",
          "title": "Authenticated does not mean authorized for this operation",
          "speech": "The right token for the wrong customer is our first case. In fictional Northline Support, Mara asks a worker to investigate a specified customer account. The task includes preparing a credit of twenty-five dollars. A retrieved attachment instructs it to use a different customer's account and increase the credit to two hundred fifty dollars. The workload credential is legitimate, the token targets the credit API, and the payload passes its schema. A broad service credential then applies a change that never matched the task or approval. A changed proposal is our second case. An approver reviews the proposed recipient, then the amount. The worker later submits different material values under the same approval reference. A resumed worker is our third case. It wakes after its task grant was revoked and still has a usable credential. These are illustrative authorization failures, not observed company incidents or certified software behavior. Their common mechanism is treating capability or identity as permission for a particular business operation. Our governing question is: who may act, for whom, on which resource, under what current constraints? We will trace trusted delegation, narrow task grants, exact approval, credential boundaries, revocation, and handoffs. You will be able to design a fixture that rejects forbidden proposals while still allowing the intended useful action.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Legitimate identity + valid token + valid schema can still exceed task authority"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Wrong customer",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The right token for the wrong customer"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Changed proposal",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A changed proposal"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Revoked grant",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A resumed worker"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Identity and available capability do not establish task-specific permission",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Their common mechanism"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who may act, for whom, on which resource, under what constraints?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "identity-stakes-spoken-v3"
        },
        {
          "id": "identity-authority-intersection",
          "role": "derive",
          "title": "Effective permission cannot exceed any applicable boundary",
          "speech": "Authentication establishes a principal under a trust contract. Delegation establishes a supported relationship to a represented user or service. Task scope narrows the resources and actions for the accepted work. Application policy, approval conditions, and current resource state constrain the particular operation further. A user may access many customers while this task covers only one. A scheduled service may use application authority without any human delegation; record that mode honestly. Keep the executing actor distinct from the represented subject in audit records. Obtain both from authenticated channels and trusted records. A worker-supplied field saying on behalf of Mara cannot establish that relationship or enlarge the worker's permission.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Permission is bounded by principal, delegation, task, policy, and current state"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Principal",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Authentication establishes"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Delegation",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Delegation establishes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Task scope",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Task scope narrows"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Operation policy",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Application policy"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is this execution delegated by a user or acting as an application?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "scheduled service"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A model-authored identity field does not create delegation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "worker-supplied field"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "identity-authority-intersection"
        }
      ]
    },
    {
      "id": "grants",
      "title": "Create authority from trusted records",
      "question": "Which input establishes the tenant and permitted action?",
      "outcome": "Issue narrow grants from authoritative identities and resource resolution.",
      "beats": [
        {
          "id": "identity-task-grant",
          "role": "derive",
          "title": "A grant connects accepted intent to a narrow capability",
          "speech": "Resolve the tenant and canonical account from authoritative records before issuing a task grant. An attachment's account field or a customer-supplied URL cannot decide that identity. Record the trusted issuer, initiating subject, allowed actor, resources, permitted actions, task and policy revisions, limits, validity, and revocation state. Separate investigation and proposal from application and reconciliation. A server-side grant referenced by an opaque identifier may be sufficient; a signed representation still needs issuer trust, audience checks, and current lifecycle enforcement. These are application design choices, not a new OAuth token standard. The critical property is that trusted execution checks the grant, rather than treating a document describing restrictions as enforcement.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Trusted resource resolution → scoped grant → enforced operation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Resolve target",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Resolve the tenant"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Issue grant",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "before issuing a task grant"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "before issuing a task grant"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can a model-provided identifier change the grant’s tenant?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "cannot decide that identity"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Enforce",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "trusted execution checks"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "trusted execution checks"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A restriction written in a grant is useful only if execution enforces it",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "describing restrictions as enforcement"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "identity-task-grant"
        },
        {
          "id": "identity-broker-boundary",
          "role": "worked-example",
          "title": "The broker should expose the business capability, not arbitrary credential use",
          "speech": "The worker submits a proposed credit. The execution broker loads trusted grant and approval records, derives the tenant and actor from authenticated context, reconstructs the effective request, and checks it. Give the broker a narrow credit interface instead of arbitrary URLs, methods, and headers backed by a privileged credential. Otherwise the worker can turn it into a general-purpose deputy. Prevent bypass through direct credentials or alternate tool paths. Apply scope to reads and processing destinations too: permission to retrieve a customer record does not automatically permit sending it to any model or logging service. Retrieved instructions remain evidence to interpret. They cannot create approval or change the tenant authorized by the task grant.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Worker proposal → scoped trusted broker → permitted resource action"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Proposal",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The worker submits"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Broker checks",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The execution broker"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "The execution broker"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Narrow effect",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "narrow credit interface"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "narrow credit interface"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Every relevant path must enforce scope; direct credentials can bypass the broker",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Prevent bypass"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can allowed read or logging paths disclose data outside the task?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Apply scope to reads"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "identity-broker-boundary-spoken-v3"
        }
      ]
    },
    {
      "id": "approval",
      "title": "Enforce what the approver actually saw",
      "question": "Can a material edit inherit an earlier approval?",
      "outcome": "Bind canonical proposals and prevent alternate privileged execution paths.",
      "beats": [
        {
          "id": "identity-bound-approval",
          "role": "derive",
          "title": "Approval covers canonical material values, not an agent in general",
          "speech": "Show the approver the tenant, canonical recipient, currency, amount, business reason, and relevant evidence. Bind the decision to the same canonical payload the executor uses, including material task and resource revisions. Define amounts, omitted fields, defaults, ordering, and identifiers before hashing. A hash identifies represented data; it does not prove understanding or good policy. Changing a material value creates another proposal and invalidates the previous binding. Do not silently update the approval to match the latest draft. Specify whether approval covers one logical operation, a bounded set, or an ongoing capability. For a single operation, consume approval conditionally with the operation identity; per-worker in-memory counters cannot prevent concurrent double use.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Understandable review → canonical binding → conditional consumption"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Review values",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Show the approver"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Bind payload",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Bind the decision"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Bind the decision"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Changed recipient, amount, currency, or material revision requires a new decision",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Changing a material value"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Consume once",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "consume approval conditionally"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "consume approval conditionally"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What do two simultaneous workers consume for one approved operation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "concurrent double use"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "identity-bound-approval"
        },
        {
          "id": "identity-northline-correction",
          "role": "check",
          "title": "Reject the changed tenant and amount while preserving the useful path",
          "speech": "Trace three submissions. The proposal for a different customer fails because tenant and account do not match the original grant. A proposal for the original customer at two hundred fifty dollars fails because its canonical payload differs from the approved amount of twenty-five dollars. The unchanged proposal for the original customer can proceed only while actor, grant, approval, limits, ownership, and resource preconditions remain valid. Predict what happens if the worker writes an approver name into the request. Nothing about that string establishes approval; the broker loads the trusted record. Keep the authorized positive case in the fixture. Denying every request would hide a broken useful workflow. If a response is lost after admission, retain the same logical operation and use the recovery contract rather than creating another authorization.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Test altered tenant, altered amount, and the unchanged authorized proposal"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Wrong tenant",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The proposal for a different customer"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Wrong amount",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A proposal for the original customer"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Valid operation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The unchanged proposal for the original customer"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A fabricated approver field cannot replace the trusted approval record",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Nothing about that string"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the valid proposal still succeed under current conditions?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "authorized positive case"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "identity-northline-correction-spoken-v3"
        }
      ]
    },
    {
      "id": "protocol",
      "title": "Respect transport and credential boundaries",
      "question": "Does a valid audience approve every tool argument?",
      "outcome": "Use the supported delegation mechanism without passing authority through blindly.",
      "beats": [
        {
          "id": "identity-protocol-boundaries",
          "role": "derive",
          "title": "Audience checks protect one boundary; task checks protect another",
          "speech": "The chapter reviews the MCP authorization profile dated June eighteenth, twenty twenty-five, without claiming it is the latest version. Its HTTP transport rules include audience validation, proof key for code exchange, resource parameters, and separate appropriate credentials for downstream services. The client token must not simply pass through unchanged to a downstream API. Standard-input integrations have a different credential arrangement. RFC ninety-seven hundred likewise requires a resource server to refuse a token intended for another resource. Yet a correct audience does not establish account-level or amount-level permission. Use the provider's actual delegation mechanism; do not invent token-exchange support or standardized actor claims. Record where application-only credentials rely on a trusted broker to preserve task constraints.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Pinned protocol profile + correct audience + separate task authorization"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "MCP 2025-06-18",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "MCP authorization profile"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Audience",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "audience validation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A token accepted by the correct API does not authorize every business request",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Yet a correct audience"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Task constraints",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "account-level or amount-level permission"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which trusted component carries task restrictions into downstream access?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "trusted broker"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "identity-protocol-boundaries"
        },
        {
          "id": "identity-credential-lifecycle",
          "role": "derive",
          "title": "Short-lived credentials still need narrow authority and controlled renewal",
          "speech": "Limit credential scope and keep credential values out of model context, plans, ordinary logs, and transcripts. Trusted adapters obtain and inject them at the execution boundary. Short lifetimes limit exposure time without making broad permission safe. Renewal must recheck the applicable delegation and policy; unfinished work does not authorize indefinite extension. Sender-constrained tokens can reduce theft and replay where supported, but cannot prevent a compromised legitimate actor from abusing allowed operations. The cited OAuth security guidance requires public-client refresh tokens to be sender-constrained or rotated. Test retirement and renewal so an old credential or renewed token cannot restore a revoked task. Credential rotation, task cancellation, and withdrawal of business approval are related but distinct lifecycle events.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Scoped credential → trusted injection → policy-aware renewal"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Scope",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Limit credential scope"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Injection",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Trusted adapters obtain"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Trusted adapters obtain"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Renewal",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Renewal must recheck"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Renewal must recheck"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Token-theft controls do not prevent abuse of legitimately granted operations",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot prevent a compromised legitimate actor"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can credential renewal revive a revoked task grant?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "cannot restore a revoked task"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "identity-credential-lifecycle"
        }
      ]
    },
    {
      "id": "lifecycle",
      "title": "Enforce current authority at the effect boundary",
      "question": "What does revocation guarantee for a request already accepted?",
      "outcome": "Constrain admission and preserve uncertain in-flight effects for recovery.",
      "beats": [
        {
          "id": "identity-check-use-race",
          "role": "derive",
          "title": "Move the decisive check to the controlled effect boundary",
          "speech": "A worker passes an early policy check, pauses, and resumes after revocation. A client-side check cannot prove the later write is still permitted. At a controlled resource, atomically validate relevant authority versions, ownership, shared limits, resource state, and approval consumption with committing the effect. Resource-enforced fencing rejects obsolete owners where supported. An external service may not participate in that transaction or grant protocol. A broker can stop new admissions and control credential use, but cannot invent atomic revocation across a network boundary. Document the in-flight interval and what the receiver confirms. The design must distinguish rejected future admission from a request the receiver already accepted before revocation arrived.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Check-use race: pause between preliminary approval and protected effect"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Early check",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "passes an early policy check"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Revocation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "after revocation"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Atomic boundary",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "At a controlled resource"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "External admission control cannot manufacture remote atomic revocation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot invent atomic revocation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What exactly can still be in flight when revocation takes effect?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Document the in-flight interval"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "identity-check-use-race"
        },
        {
          "id": "identity-cancel-reconcile",
          "role": "transfer",
          "title": "Stopping new authority does not erase an accepted effect",
          "speech": "Cancel a credit task after the receiver accepted its request but before the worker receives a result. Stop further unauthorized admissions and preserve the pending operation identity. Query through an appropriately scoped recovery capability. If the receiver confirms completion, record completion; if evidence remains insufficient, retain unknown. Do not report that cancellation undid the credit. Revoking mutation authority should not strand operators without the read capability needed to reconcile existing work. That recovery permission does not authorize another credit or a compensating debit. A corrective mutation requires a separate business decision and operation record. Apply the same distinction to document publication, inventory changes, and messages already delivered to recipients.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Stop new admissions → preserve operation → reconcile authoritative outcome"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Cancel admissions",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Stop further unauthorized admissions"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Preserve identity",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "preserve the pending operation identity"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "preserve the pending operation identity"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Recovery access",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Query through"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Query through"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Cancellation cannot prove an accepted external effect disappeared",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Do not report that cancellation undid"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can operators still observe the outcome after mutation authority is revoked?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "read capability needed to reconcile"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "identity-cancel-reconcile"
        }
      ]
    },
    {
      "id": "handoff",
      "title": "Transfer work without enlarging permission",
      "question": "Does a checkpoint transfer business authority?",
      "outcome": "Keep assignment, ownership, release identity, and grants distinct.",
      "beats": [
        {
          "id": "identity-handoff",
          "role": "derive",
          "title": "A task graph assigns work; it does not create permission",
          "speech": "The successor worker needs a current grant for its role and scope. A copied task identifier, transcript, or checkpoint cannot transfer a bearer credential or revive expired approval. Child authority must not exceed the authority that allowed its creation. Bound resources, actions, lifetime, shared budget, and cancellation relationships. A checker may read evidence while a maker edits within a boundary; neither automatically gains publishing rights. Transfer execution ownership separately from business permission. A new generation can resume the same authorized operation while the resource rejects obsolete owners where fencing is available. A coordinator's lease alone cannot constrain a remote API that ignores that lease.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Assignment, grant, and execution ownership are separate records"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Assignment",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "successor worker"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Scoped grant",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "current grant"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A checkpoint transfers state, not credentials or renewed approval",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "copied task identifier"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Ownership",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Transfer execution ownership"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which boundary prevents the predecessor from acting after handoff?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "resource rejects obsolete owners"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "identity-handoff"
        },
        {
          "id": "identity-release-binding",
          "role": "transfer",
          "title": "The approved software identity may constrain who can use a grant",
          "speech": "A release manifest identifies evaluated behavior. Where policy requires it, the grant also restricts which approved configuration may exercise the capability. A new harness cannot silently inherit an exception approved for another candidate. Decide which changes require reevaluation, which require reauthorization, and which preserve both through explicit compatibility evidence. These are related questions with different evidence. Passing release checks does not itself approve a credit, and a valid business approval does not certify a changed adapter. Join the applicable records at execution: task scope, current actor, ownership generation, approved software identity, canonical proposal, and present authority. Retain useful evidence without treating one successful check as a substitute for the others.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Evaluated software + delegated task + approved operation must agree where required"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Software identity",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A release manifest"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Grant restriction",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the grant also restricts"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this candidate still qualify for the exception attached to its grant?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "inherit an exception"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A release check does not approve a business mutation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Passing release checks"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Current execution",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Join the applicable records"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "identity-release-binding"
        }
      ]
    },
    {
      "id": "evidence",
      "title": "Test forbidden proposals and useful authorized work",
      "question": "Can an audit reconstruct the actual decision without leaking secrets?",
      "outcome": "Verify positive and negative controls with independent effect evidence.",
      "beats": [
        {
          "id": "identity-audit-test",
          "role": "transfer",
          "title": "Prove both denial and authorized success without exposing credentials",
          "speech": "Use fixed test identities, dummy credentials, an isolated policy store, and a controlled receiver. Submit wrong-tenant, wrong-account, wrong-audience, expired-grant, changed-amount, fabricated-approver, and stale-version proposals directly. Include simultaneous approval consumers, resumed obsolete workers, and revocation before and after remote acceptance. Keep the correct same-tenant success case. Audit the initiating subject, executing actor, grant, policy, target, approval reference, ownership, and outcome evidence. Separate proposed, admitted, dispatched, and completed states. An admission receipt does not establish remote completion. Check logs for dummy secret leakage and limit sensitive fields. Even a hash of a predictable secret or identifier can be guessed, so hashing alone does not make audit data anonymous.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Authorization fixtures: valid action, forbidden proposals, and lifecycle races"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Negative controls",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "wrong-tenant"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Race tests",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "simultaneous approval consumers"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Positive control",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "correct same-tenant success case"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Proposal → admission → dispatch → completion are different evidence states",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Separate proposed"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can an investigator reconstruct the decision without credential values?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Check logs"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "identity-audit-test"
        },
        {
          "id": "identity-final-synthesis",
          "role": "reflect",
          "title": "A reliable agent joins artifact, release, authority, and effect evidence",
          "speech": "The book's completed argument joins artifact correctness, evaluated system identity, current permission, and honest outcome evidence. Identity establishes a principal, while delegation and policy bound this task. Trusted grants name resources, actions, limits, and lifecycle conditions. Approval covers the material operation actually submitted. Protocol audience checks and downstream credentials preserve transport boundaries. Revocation and handoffs must preserve in-flight truth without enlarging permission. Test forbidden proposals alongside useful authorized work, retaining evidence without secrets. Remember: identify, delegate, constrain, approve, enforce, reconcile. Apply that sequence to one complete path from user request to external effect in your architecture. Discuss next: where can a model claim become authority? Which record proves the actual submitted operation matched approval? Which effect could remain unknown after cancellation?",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reliable agents join correctness, release identity, current authority, and outcome truth"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Correct artifact",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "artifact correctness"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evaluated system",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "evaluated system identity"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Current authority",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "current permission"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: identify → delegate → constrain → approve → enforce → reconcile",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: model-created authority? Exact approval? Unknown effect?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "identity-final-synthesis-spoken-v2"
        }
      ]
    }
  ],
  "narrationSHA256": "39b70d949d1e1d65b581296e777828606d85e8b18ee39b1669ed5baada3122e8"
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
