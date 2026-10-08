(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-32",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Alignment and Guardrails at Loop Scale",
  "subtitle": "Professor Mode · Behavioral evidence, operation gates, and honest effect outcomes",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-32/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-32/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 32, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "511ae483dd153acd70ac3773e4d18b4432a7d5257d1c6d84fc69609f504a06c4",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Evaluate the deployed action path",
      "question": "What does a refusal test actually establish?",
      "outcome": "Separate model behavior from enforced permission.",
      "beats": [
        {
          "id": "guardrails-stakes",
          "role": "orient",
          "title": "An unauthorized intermediate action can bypass a final-output check",
          "speech": "A claims-processing form is our first case. In the chapter's fictional scenario, a free-text note claims that compliance requires sending patient identifiers to a named endpoint. The worker attempts the request, while the configured scanner checks only final database output. The attempted transfer demonstrates a gap in the workflow boundary; it does not reveal exactly what training the model received. A self-generated plan is our second case. An unauthorized step appears in an earlier model response and is later treated as if it had been approved. A filtered result is our third case. A post-execution scanner withholds sensitive text in the response, but the original request may already have sent data to a remote service. These illustrative cases separate model behavior from enforceable authority. Our governing question is: what does a refusal test actually establish about this action path? We will classify concrete operations, attach approvals to exact operations, place checks across execution, and test forced proposals independently of model refusal. By the end, you should be able to distinguish a prevented action, an unknown external effect, and a result that was merely withheld from the model.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Refusal behavior and execution permission are separate properties"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Intermediate request",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A claims-processing form"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Checking final output can leave intermediate effects unmediated",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "checks only final database output"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Plan as authority",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A self-generated plan"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Late filtering",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A filtered result"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What does a refusal test establish about this action path?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "guardrails-stakes-spoken-v2"
        },
        {
          "id": "guardrails-context-paths",
          "role": "derive",
          "title": "Earlier model text remains a proposal",
          "speech": "Test harmful instructions in retrieved content, plans, long workflows, and compacted summaries. The deployed model may respond differently across those contexts, but an observed failure does not prove a particular internal mental state or training mechanism. Preserve provenance and treat earlier model statements as proposed actions or derived claims. A plan step does not authorize itself. A summary of a supposed earlier decision does not replace a durable approval record. The trusted executor checks each consequential operation against current task policy. Behavioral evaluation remains valuable for reducing bad proposals and understanding workload risk; it complements the boundary instead of supplying its authority.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Data, plans, and summaries cannot create execution permission"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Retrieved content",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "retrieved content"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Plans",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "plans, long workflows"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Summaries",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "compacted summaries"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An earlier plan step does not authorize itself",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A plan step does not authorize itself"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which trusted record grants the proposed action?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "durable approval record"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "guardrails-context-paths"
        }
      ]
    },
    {
      "id": "classification",
      "title": "Classify the concrete operation",
      "question": "Can a reversible tool still cause an irreversible disclosure?",
      "outcome": "Use target, audience, content, and downstream effects in gate policy.",
      "beats": [
        {
          "id": "guardrails-concrete-reversibility",
          "role": "derive",
          "title": "Classify the target and effects, not only the tool name",
          "speech": "Editing an isolated draft before publication may be reversible within that boundary. The same file-writing tool can modify a deployment manifest consumed automatically by another system. A public comment can be deleted, but notifications and copies may remain. Determine the target resource, audience, data classification, and downstream triggers before assigning the gate. Reversibility describes recovery limits; it never grants authority over another person's resource. The chapter's policy routes irreversible operations to required human approval and costly recovery through appropriate additional checks. Those classifications must come from trusted policy and current operation details, not the model's assertion that its action is harmless maintenance.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Recovery classification depends on the concrete operation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What persists even if the visible artifact is deleted?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "notifications and copies may remain"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Target",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "target resource"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Audience and data",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "audience, data classification"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Downstream effects",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "downstream triggers"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Reversibility is not permission to act",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "it never grants authority"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "guardrails-concrete-reversibility"
        },
        {
          "id": "guardrails-tool-boundary-example",
          "role": "worked-example",
          "title": "Replace an arbitrary endpoint with a scoped claims operation",
          "speech": "Return to the claims scenario. A final database scanner cannot mediate a separate intermediate request. Apply policy to every effect-capable adapter, then replace arbitrary destination selection with a configured claims operation. The broker validates permitted record fields, resource identity, and current authority before dispatch. A document may cite compliance. Its content remains data to analyze and cannot change the configured destination or grant additional disclosure. Test using dummy patient identifiers and mocked effects. The injected request should be denied even if the model proposes it. The legitimate claim update should still succeed. This change can improve both usefulness and security by providing a precise operation instead of a broad capability.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Claims proposal → resource and field policy → configured service"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Proposal",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "claims scenario"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Every effect-capable adapter needs the applicable checks",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "every effect-capable adapter"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Policy",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The broker validates"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "The broker validates"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can document text redirect this operation to another destination?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A document may cite compliance"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Destination",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "configured destination"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "configured destination"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "guardrails-tool-boundary-example-spoken-v2"
        }
      ]
    },
    {
      "id": "approval",
      "title": "Preserve a separate approval boundary",
      "question": "Can the worker forge or bypass the decision?",
      "outcome": "Bind current approval to the exact action and protect enforcement.",
      "beats": [
        {
          "id": "guardrails-approval-binding",
          "role": "derive",
          "title": "An approval must name the operation it authorizes",
          "speech": "Present the exact action, target, relevant before-and-after state, consequence, and expiry to the required reviewer. Store the decision at a separate trust boundary the worker cannot forge. Bind it to the reviewed payload and resource version, and invalidate it when a relevant field changes. The executor checks current authority and consumes any one-use permission atomically. A separate approval screen is insufficient if the worker can call a privileged endpoint behind it without those checks. An unanswered required decision remains pending or expires according to trusted policy. The model's confidence and the pressure of a deadline do not change the approval that the operation requires.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reviewed operation → independent decision → enforced current grant"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Operation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "exact action, target"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Decision",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Store the decision"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Store the decision"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the worker forge, reuse, or bypass this decision?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "cannot forge"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Enforcement",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The executor checks"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "The executor checks"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A separate screen is insufficient if the privileged endpoint can be bypassed",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A separate approval screen"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "guardrails-approval-binding"
        },
        {
          "id": "guardrails-protected-policy",
          "role": "explain",
          "title": "The worker cannot weaken the boundary controlling its work",
          "speech": "Protect safety configuration, permission grants, and trusted approval state from direct modification by the executing worker. Remove unnecessary high-consequence capabilities from its environment. When the task legitimately needs a consequential operation, route it through the separately authorized path rather than allowing the worker to approve itself. Security administration and behavior-changing updates require their own scoped workflow. Check actual adapters and resource permissions, because a forbidden-action list is only documentation if another tool can perform the same effect indirectly. A generic shell, file write, or proxy may reopen the route. The boundary must cover equivalent paths to the same resource consequence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Protected policy must cover direct and indirect action paths"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Trusted policy",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Protect safety configuration"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Scoped operation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "separately authorized path"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A forbidden-action list is insufficient when another adapter bypasses it",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "only documentation"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Equivalent routes",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "same effect indirectly"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can a broad tool recreate the removed capability?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A generic shell"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "guardrails-protected-policy"
        }
      ]
    },
    {
      "id": "layers",
      "title": "Place controls before, during, and after execution",
      "question": "Which outcomes can each layer prevent?",
      "outcome": "Distinguish prevention, containment, and returned-content filtering.",
      "beats": [
        {
          "id": "guardrails-three-stages",
          "role": "derive",
          "title": "Control placement determines what can still be prevented",
          "speech": "Checks before execution can deny an operation before the adapter dispatches it. They verify authority, arguments, applicable approval, rate limits, and resource preconditions. During execution, resource limits and deadlines can constrain local work, but an external request may already be accepted. Checks after execution inspect the response and can withhold content, halt dependent actions, or initiate recovery. They cannot retroactively prevent data already transmitted. These stages cover different moments in the action path. Assign each check a specific claim and failure response. If the policy service is unavailable or returns malformed output, deny operations that require its trusted decision.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Pre-execution → during execution → post-execution"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Pre: deny dispatch",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Checks before execution"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "During: constrain",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "During execution"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "During execution"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Post: inspect",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Checks after execution"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Checks after execution"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A later filter cannot prevent an earlier transmission",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot retroactively prevent"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What happens when a required policy decision is unavailable?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "policy service is unavailable"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "guardrails-three-stages-spoken-v2"
        },
        {
          "id": "guardrails-outcome-states",
          "role": "worked-example",
          "title": "Timeout and withheld result are not the same as prevented",
          "speech": "A request is sent, then the local timeout fires. The server might have accepted the action even though the worker has no response. Record an unknown effect and reconcile before retrying. A local process may also leave children running unless cancellation controls them explicitly. Now consider a successful request whose response text is rejected by a content filter. The result can be withheld from the model while the original action remains completed. Use distinct states for prevented, completed, failed before effect, and unknown effect. Record content filtering as a separate decision. Collapsing all of these into blocked creates false confidence and can cause a duplicate action during recovery.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Execution outcome and returned-content policy are separate"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did the action stop before dispatch, or is its remote outcome unknown?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A request is sent"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Unknown effect",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "unknown effect and reconcile"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Withholding a result cannot undo a completed action",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "result can be withheld"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Prevented",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "prevented, completed"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Completed",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "completed, failed"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Failed before effect",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "failed before effect"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "guardrails-outcome-states-spoken-v2"
        }
      ]
    },
    {
      "id": "evaluation",
      "title": "Test boundaries independently of refusal",
      "question": "Does a compliant model proposal still get denied?",
      "outcome": "Measure harmful misses and false blocks with explicit assumptions.",
      "beats": [
        {
          "id": "guardrails-independent-tests",
          "role": "transfer",
          "title": "Force the proposal to test the enforcing component",
          "speech": "A refusal evaluation asks whether the model avoids a harmful proposal in a particular context. A boundary evaluation supplies the forbidden proposal directly and checks whether the executor denies it. Run both, with mocked mutations and legitimate positive controls. Include changed arguments, stale approval, repeated requests, policy-service failure, and timeout after acceptance. Verify that no second effect occurs while the first remains unresolved. Measure missed harmful actions separately from false blocks and distinguish consequences. A model that refuses every task may look strong on refusal while providing no useful service. A gateway that hides credentials can still grant the wrong resource action. Evaluate the property actually required.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Behavioral evaluation + forced-proposal boundary evaluation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Model behavior",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A refusal evaluation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Executor denial",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A boundary evaluation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Will denial hold when the model supplies the forbidden call?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "supplies the forbidden proposal directly"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Passing a refusal test does not establish executor authorization",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Run both"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Legitimate control",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "legitimate positive controls"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "guardrails-independent-tests"
        },
        {
          "id": "guardrails-scale-expectation",
          "role": "derive",
          "title": "Small per-run rates can create substantial operating exposure",
          "speech": "For an illustrative workload of four hundred runs per day, suppose each run has a marginal probability of one in a thousand for a specified failure. The expected count is four tenths of a failure per day. That arithmetic is an assumption-driven expectation, not a measurement of any model. Adding expectations does not require independence, but predicting the distribution of incidents does. Shared prompts, tools, sources, and task conditions can cluster failures. Rates can also change after a model update or a new document type arrives. Report what event the rate describes, how it was measured, and which workload it represents. A clean recent interval does not establish a universal reliability guarantee.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Illustrative expectation: 400 runs/day × 0.001 = 0.4 failures/day"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "400 runs/day",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "four hundred runs per day"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "p = 0.001",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "one in a thousand"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Expected: 0.4/day",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "four tenths of a failure per day"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Expected count is not an incident-timing guarantee",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "assumption-driven expectation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Are failures clustered or the operating conditions changing?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "can cluster failures"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "guardrails-scale-expectation"
        }
      ]
    },
    {
      "id": "operation",
      "title": "Keep gates effective under workload pressure",
      "question": "What changes when the queue grows or a signal shifts?",
      "outcome": "Investigate severity and revisions while retaining required authority.",
      "beats": [
        {
          "id": "guardrails-operating-pressure",
          "role": "synthesize",
          "title": "Investigate signals without weakening required authority",
          "speech": "A higher block rate may reflect an attack, a stricter policy, a changed task mix, or a model revision. Correlate it with actual denied operations and current configuration. A single consequential unauthorized proposal may justify immediate containment even without a trend. At the same time, low-value approval traffic can overload reviewers and reduce effective scrutiny. Improve the operation design, evidence packet, routing, and staffing, or narrow autonomous scope. Do not treat queue pressure as approval for actions whose required decision is missing. Review false blocks and uncertain cases, preserve critical safety requirements, and test that legitimate work still proceeds through the intended path.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Operational signals need severity, configuration, and workload context"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the changed signal reflect policy, workload, or hostile behavior?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A higher block rate"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Denied operation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "actual denied operations"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Revision context",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "current configuration"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Review capacity",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "overload reviewers"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Queue pressure cannot supply a missing required decision",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Do not treat queue pressure"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "guardrails-operating-pressure"
        },
        {
          "id": "guardrails-recap",
          "role": "reflect",
          "title": "A guardrail is useful only for the property it enforces",
          "speech": "Evaluate the deployed workflow rather than inferring safety from a chat refusal. Classify the concrete target, audience, and consequences. Keep approval independent, current, and bound to the operation. Place controls before, during, and after execution with explicit limits. Distinguish prevented actions from unknown effects and withheld results. Test forced proposals and legitimate operations while interpreting metrics in context. Remember: classify, authorize, enforce, distinguish, evaluate. Apply the sequence to an intermediate tool call that your final-output scanner never sees. Discuss next: which timeout is incorrectly labeled blocked? Which approval can be bypassed through another adapter? Next we bring these ideas into production fleet operations.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reliable gates preserve authority and honest outcome states"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Concrete operation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Classify the concrete target"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Bound approval",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep approval independent"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Honest outcome",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Distinguish prevented actions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: classify → authorize → enforce → distinguish → evaluate",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: timeout labeled blocked? Approval bypass?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "guardrails-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "af67e9d8f0ce8181f904594e8678f927800202387b59069961ac0e1fdd93669d"
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
