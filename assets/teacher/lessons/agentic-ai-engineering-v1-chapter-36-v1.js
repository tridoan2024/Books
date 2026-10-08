(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-36",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Case Study — The Operations Loop",
  "subtitle": "Professor Mode · Downstream evidence, bounded rollout, browser identity, and recovery",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-36/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-36/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 36, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "d29a1a55a16d9f9445aa27492e332ff6913222715c3bbfaae702f09300ac91e4",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Verify the consequences of a live change",
      "question": "What does a green health endpoint leave unobserved?",
      "outcome": "Define bounded downstream safety properties before remediation.",
      "beats": [
        {
          "id": "operations-stakes",
          "role": "orient",
          "title": "Closing one vulnerability can break a downstream contract",
          "speech": "A security patch that stops log delivery is our first case. In the chapter's fictional scenario, a library update closes a vulnerability but changes the log format. A service health endpoint remains green while a downstream parser drops records. The local health signal never tested the property the operator needed. A rollout during application warm-up is our second case. Checking too early can trigger a rollback, reopen the vulnerability, and create a cycle of repeated patching. A browser submission without visible confirmation is our third case. The server may commit an operation even when the page fails to show success. Repeating the click could create another effect. These are illustrative operational cases, not evidence of a particular compliance violation or universal propagation time. Their common mechanism is acting on an observation that is incomplete, premature, or narrower than the intended conclusion. Our governing question is: what evidence is sufficient before the next live change? We will separate assessment from remediation, define downstream checks, manage rollout timing, verify browser targets, and reconcile uncertain effects. By the end, you should be able to explain both the properties observed and the consequences that remain unknown.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Live changes need evidence about relevant downstream effects"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Log delivery broken",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A security patch that stops log delivery"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A local health signal may not cover the intended safety property",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "local health signal never tested"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Premature rollback",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A rollout during application warm-up"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Unknown submission",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A browser submission"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What evidence is sufficient before the next live change?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "operations-stakes"
        },
        {
          "id": "operations-bounded-contract",
          "role": "derive",
          "title": "Replace no collateral damage with specified observations",
          "speech": "No finite observation window proves absence of every harmful consequence. Define the affected resources, dependencies, health signals, observation duration, sample requirements, and limits that justify proceeding. Include vulnerability closure, business behavior, downstream consumers, and the durable action record. State the outcome when evidence is missing or stale. Read-only assessment may have lower risk, but it can expose confidential inventory, consume capacity, or contact external services. Keep its scope and rate limits explicit. Remediation requires its own authority and resource preconditions. The contract should also state which verification failure stops related remaining work and who can choose the next recovery action.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Safety claim = defined properties + adequate observations + explicit limits"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Finite monitoring cannot prove universal absence of harm",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "No finite observation window"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Properties",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "affected resources, dependencies"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Observation window",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "observation duration"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which missing signal makes the decision inconclusive?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "State the outcome"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Unknown outcome",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "evidence is missing or stale"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "operations-bounded-contract"
        }
      ]
    },
    {
      "id": "assessment",
      "title": "Separate evidence collection from mutation authority",
      "question": "Does an urgent advisory grant permission to change production?",
      "outcome": "Preserve unknown applicability and rank by actual exposure.",
      "beats": [
        {
          "id": "operations-advisory-evidence",
          "role": "derive",
          "title": "Parsing extracts; assessment interprets",
          "speech": "Normalize what the advisory actually states: affected product, version ranges, assigned identifier if present, exploit evidence, publication date, and available fixes. Keep absent fields unknown instead of inventing a severity score or identifier. Compare the advisory with deployed inventory and its freshness. Dependency directness alone is not priority: a transitive dependency may execute the vulnerable path while a directly installed library may not. Assess exposure, reachable behavior, deployed version, sensitive data, exploit evidence, and compensating controls. Unknown reachability remains unknown. Preserve the distinction between an advisory assertion, an inventory observation, and an analyst inference so the remediation decision can be reviewed.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Advisory facts → deployed inventory → contextual assessment"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Extract",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Normalize what the advisory actually states"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Inventory",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare the advisory"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Compare the advisory"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Direct versus transitive dependency is not a complete priority rule",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Dependency directness alone"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Assess",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Assess exposure"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Assess exposure"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which applicability field is unknown rather than safe?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Unknown reachability"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "operations-advisory-evidence"
        },
        {
          "id": "operations-emergency-authority",
          "role": "worked-example",
          "title": "Urgency changes priorities, not the source of permission",
          "speech": "A critical advisory arrives outside staffed hours. Waiting may prolong exposure, while an unreviewed change may create another incident. Define an emergency containment path before this situation occurs, including authorized actions, on-call escalation, resource limits, and evidence requirements. The model can summarize the tradeoff but cannot grant itself emergency authority. If a required decision is unavailable, preserve the assessment and use the established escalation route. Some systems permit tightly scoped pre-authorized containment; others require a current human decision. Apply the actual policy. Reversibility is one input, alongside target, consequence, uncertainty, and the possibility that recovery itself fails.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Emergency response needs authority established before the incident"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Exposure risk",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Waiting may prolong exposure"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Change risk",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "an unreviewed change"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Authorized response",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Define an emergency containment path"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Urgency and model confidence do not create permission",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot grant itself emergency authority"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What response is already authorized when the required reviewer is unavailable?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "required decision is unavailable"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "operations-emergency-authority"
        }
      ]
    },
    {
      "id": "signals",
      "title": "Require adequate observations to proceed",
      "question": "Can missing or correlated telemetry look reassuring?",
      "outcome": "Check freshness, sample adequacy, downstream delivery, and audit state.",
      "beats": [
        {
          "id": "operations-signal-adequacy",
          "role": "derive",
          "title": "A nominal metric still needs scope, freshness, and samples",
          "speech": "Check service behavior, relevant downstream consumers, and the action journal using observations suitable for each property. A stale scanner may lack the new advisory, and a health endpoint may check only database connectivity. Missing metrics or insufficient traffic make the intended verdict inconclusive. Relative thresholds also need absolute limits: multiplying a zero baseline by two still gives zero, and a tiny sample cannot establish a meaningful tail percentile. Use appropriate error budgets, minimum sample requirements, and a contemporaneous control where feasible. Several metrics from the same broken collection pipeline are correlated. Their agreement does not provide independent confirmation that the change is safe.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Signal adequacy: scope, freshness, sample size, dependency"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Scope",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "suitable for each property"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Freshness",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "A stale scanner"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Samples",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "insufficient traffic"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Absent or inadequate evidence is inconclusive",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "make the intended verdict inconclusive"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Shared dependency",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "same broken collection pipeline"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could every reassuring signal depend on the same failed collector?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Their agreement"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "operations-signal-adequacy"
        },
        {
          "id": "operations-log-delivery",
          "role": "worked-example",
          "title": "Verify a harmless event at the intended destination",
          "speech": "For the changed logging library, emit a known harmless test event through the service's real logging path. Confirm its arrival at the intended storage or consumer within a justified window. A running sidecar does not establish successful parsing and delivery. Inspect the deployed package version and relevant vulnerability evidence separately from the delivery test. Record the operation identity, before-and-after state, and verification result. If the test event never arrives, halt related remaining changes and investigate the path. Do not declare a specific legal violation solely from a fixed number of missing minutes; assess the operational gap against the organization's applicable logging and retention requirements.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Known event → actual logging path → verified destination arrival"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Emit event",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "emit a known harmless test event"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Delivery path",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "real logging path"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "real logging path"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Confirm arrival",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Confirm its arrival"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Confirm its arrival"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Process health is not end-to-end record delivery",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A running sidecar does not establish"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Was the expected event observed at the intended sink?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "If the test event never arrives"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "operations-log-delivery"
        }
      ]
    },
    {
      "id": "rollout",
      "title": "Bound changes by failure domain and propagation",
      "question": "When is there enough evidence for the next mutation?",
      "outcome": "Observe continuously and stop related rollout when verification fails.",
      "beats": [
        {
          "id": "operations-propagation",
          "role": "derive",
          "title": "Observe immediately; authorize the next change only with adequate evidence",
          "speech": "Warm-up, replication, resolver behavior, and workload cycles determine when a change's effects become observable. Choose the observation policy for the actual operation instead of applying one universal sleep. Continue passive monitoring immediately so early harm is visible, while waiting for enough evidence to decide whether another mutation is allowed. Checking a warming service too early can trigger unnecessary rollback and repeated patching. Waiting a fixed interval without checking evidence can also miss a persistent defect. Define what stable behavior means, what early signal requires containment, and what remains inconclusive when the expected traffic or downstream observation has not arrived.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Change → continuous observation → evidence-based next decision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Change",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a change's effects"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Observe",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Continue passive monitoring immediately"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Continue passive monitoring immediately"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Decide",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "decide whether another mutation is allowed"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "decide whether another mutation is allowed"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An elapsed delay alone does not establish readiness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Waiting a fixed interval"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What observation, rather than elapsed time alone, permits the next action?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Define what stable behavior means"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "operations-propagation"
        },
        {
          "id": "operations-failure-domain",
          "role": "predict",
          "title": "One direct change can still affect several services",
          "speech": "Consider a rollout across ten services. The third service fails downstream verification. Predict whether sequential patching guarantees that only the third service can suffer consequences. It does not: shared databases, queues, or consumers can propagate effects further. Sequential execution limits direct changes before another verification; it does not bound every downstream impact. Stop related remaining rollout, including the fourth service, and determine whether the failure is local or common to the upgrade. Keep accepted earlier changes and unknown effects distinct. Renew the batch permission only after its evidence requirements and authorization conditions are satisfied. Choose batch boundaries using failure domains and consequence rather than a universal service count.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Sequential rollout bounds direct mutation, not every consequence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Third service fails",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The third service fails"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Shared dependencies",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "shared databases, queues, or consumers"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Stop related rollout",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Stop related remaining rollout"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "No unchecked fourth change after a relevant verification failure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "including the fourth service"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is the observed failure local or common to the upgrade?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "determine whether the failure is local"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "operations-failure-domain-spoken-v2"
        }
      ]
    },
    {
      "id": "browser",
      "title": "Treat browser actions as consequential operations",
      "question": "Does a missing success banner justify another submission?",
      "outcome": "Verify target identity and reconcile uncertain server-side effects.",
      "beats": [
        {
          "id": "operations-browser-target",
          "role": "derive",
          "title": "A successful click is not evidence of the intended operation",
          "speech": "Before a consequential browser action, verify the current resource, page state, resolved element identity, surrounding context, enabled state, and intended action. Stable semantic roles and accessible names help, but a changed page can still create ambiguity. A fallback selector is acceptable only if it preserves those assertions. Stop instead of guessing between two Submit controls. Combine structural checks with rendered inspection when layout or interaction matters. A screenshot alone may miss behavior, while a page assertion may describe only the interface. Treat session expiry and unexpected navigation as state changes that require reconciliation, not reasons to replay the visible workflow from the beginning.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Current resource → verified control → bounded interaction"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Resource",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "verify the current resource"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Control",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "resolved element identity"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "resolved element identity"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Interaction",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "intended action"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "intended action"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Selector success does not prove correct target or backend effect",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "changed page can still create ambiguity"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this control still act on the intended resource?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Stop instead of guessing"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "operations-browser-target"
        },
        {
          "id": "operations-browser-unknown",
          "role": "worked-example",
          "title": "Reauthentication does not resolve an uncertain submission",
          "speech": "Persist the intended operation and resource identity before submitting a form. If confirmation is lost, query authoritative server state through an approved independent channel where possible. The page may fail after the backend commits. After reauthentication, reconcile that operation before deciding whether to advance or resubmit. A remembered screen number is not proof of server completion. If no reliable status channel exists for a consequential action, preserve unknown outcome and request the required manual resolution. Respect the application's rate and load limits during recovery. The objective is one intended business effect with evidence of its state, not a browser that reaches the final screen at any cost.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Persist intent → submit → confirm or reconcile server state"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Intent",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Persist the intended operation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Submit",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "submitting a form"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "submitting a form"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "query authoritative server state"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "query authoritative server state"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "No visible confirmation does not mean no server-side effect",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "backend commits"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the operation be resolved without another submission?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "preserve unknown outcome"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "operations-browser-unknown"
        }
      ]
    },
    {
      "id": "recovery",
      "title": "Choose recovery with current risk and authority",
      "question": "Could rollback reopen the vulnerability?",
      "outcome": "Preserve completed assessment and assign unresolved effects.",
      "beats": [
        {
          "id": "operations-recovery-choice",
          "role": "synthesize",
          "title": "Rollback can restore one property while breaking another",
          "speech": "Returning to the old logging library might restore delivery while reopening the vulnerability. A forward configuration repair might preserve the security fix but require additional evidence. Compare leaving the patch, rolling back, and applying a forward fix against current exposure, downstream impact, and authorized recovery policy. The model can prepare that comparison; the accountable authority chooses where required. In the third-service drill, the journal should show accepted changes, unknown outcomes, prevented later actions, and recovery owners. Include a stale scanner, a missing delivery metric, and a lost browser confirmation. Acceptance requires explicit uncertainty and preserved completed assessment, with no duplicate submission or unchecked continuation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Recovery compares current exposure, downstream impact, and authority"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Rollback may reopen the vulnerability or leave downstream effects",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "reopening the vulnerability"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Keep patch",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "leaving the patch"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Roll back",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "rolling back"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Forward fix",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "applying a forward fix"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who owns each accepted, unknown, and remaining action?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "recovery owners"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "operations-recovery-choice"
        },
        {
          "id": "operations-recap",
          "role": "reflect",
          "title": "Operational success requires bounded evidence about consequences",
          "speech": "Separate scoped assessment from authorized remediation. Preserve unknown applicability and prioritize actual exposure. Verify service behavior, downstream delivery, and durable action records with adequate observations. Observe propagation without treating a fixed delay as proof. Bound rollout by failure domain and stop related changes on relevant verification failure. Treat browser submissions as external effects that may need reconciliation. Remember: assess, authorize, change, observe, reconcile, recover. Apply the sequence to a production action whose health endpoint covers only part of its impact. Discuss next: which missing metric is currently treated as green? Which rollback could reintroduce the original risk? Next we turn these principles into a staged build plan.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A live change is accepted only within its stated evidence limits"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Scoped assessment",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Separate scoped assessment"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Adequate observation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Verify service behavior"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Effect reconciliation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Treat browser submissions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: assess → authorize → change → observe → reconcile → recover",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: missing metric treated as green? Risk reopened by rollback?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "operations-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "ce0c6a79f1d2cfe39d3254e4c069be9836e8ba4c93288501b8517fe1882e5be4"
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
