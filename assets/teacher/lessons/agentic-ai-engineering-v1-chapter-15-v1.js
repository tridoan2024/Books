(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-15",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Goal Specification",
  "subtitle": "Professor Mode · faithful acceptance, requirement evidence, and explicit scope amendments",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-15/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-15/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 15, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "a13790ddca02e19b8638b21f51406da19ae24283de935228cda792c3dae72254",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Specify what useful success actually means",
      "question": "What evidence would distinguish a good result from a convincing failure?",
      "outcome": "Separate intended outcomes from proxies and checker approval.",
      "beats": [
        {
          "id": "goal-stakes",
          "role": "orient",
          "title": "A flattering rubric can approve a convincing failure",
          "speech": "Incorrect API documentation is our first case. In Marcus's fictional documentation loop, polished pages receive high scores even though they invent parameters and omit a required operation key. The evaluator checks its own impression rather than comparing the draft with the actual interface. A login repair is our second case. A patch makes a weak test pass by hiding an authentication failure instead of preventing expired credentials from authenticating. A faster search endpoint is our third case. One quick request is presented as evidence of improved tail latency, without a defined workload or failed-request accounting. These cases show that a check can be precise and still ask the wrong question. The scenario's scores and outcomes are illustrative, not a measured result for a production system. Our governing question is: what evidence would distinguish a good result from a convincing failure? We will map requirements to evidence, test whether checks detect the intended defects, calibrate residual judgment, and manage scope changes without losing valid work. By the end, you should be able to specify an observable outcome while stating what a passing check does and does not establish. Human judgment can remain an explicit decision where it is needed.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A passing score can still miss the intended outcome"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Wrong API docs",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Incorrect API documentation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Hidden login error",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A login repair"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Weak latency claim",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A faster search endpoint"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Precise checks can still ask the wrong question",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a check can be precise"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What distinguishes success from a convincing failure?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "goal-stakes"
        },
        {
          "id": "goal-precision-limit",
          "role": "explain",
          "title": "Make the measurable part explicit without claiming completeness",
          "speech": "Moving from improve the API to a concrete expired-credential test reduces ambiguity. It does not make a finite test suite a complete behavioral specification. A list of exported names also cannot prove that every interface behavior is unchanged. State the intended outcome separately from the checks used to assess it. Define important constraints on scope, compatibility, security, and performance where they matter to the task. If acceptance includes expert judgment, name the reviewer, evidence packet, and pending state. The system can still automate useful work around that decision. Precision helps when the checks faithfully represent the requirement; a precise proxy with a blind spot can simply make the wrong target easier to optimize.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Intended outcome → measurable checks → stated limits"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Finite checks do not prove every behavior",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a complete behavioral specification"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Outcome",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "State the intended outcome"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Checks",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the checks used to assess it"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "the checks used to assess it"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Limits",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "If acceptance includes expert judgment"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "If acceptance includes expert judgment"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which required property remains outside these checks?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a blind spot"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "goal-precision-limit"
        }
      ]
    },
    {
      "id": "ledger",
      "title": "Map each requirement to applicable evidence",
      "question": "What does each check establish, and who decides acceptance?",
      "outcome": "Record outcome, procedure, dependencies, and decision authority.",
      "beats": [
        {
          "id": "goal-evidence-ledger",
          "role": "derive",
          "title": "Give each requirement an evidence path",
          "speech": "For each requirement, record a stable identity, intended outcome, check procedure, dependencies, and decision authority. For expired credentials, the outcome is that they cannot authenticate. The procedure exercises the relevant handler in an isolated fixture. Dependencies include the clock, token issuer, middleware, and test data. The authority comes from the applicable release policy. A passing helper test may support one part of this claim without covering the whole request path. Bind the receipt to the candidate revision and environment actually examined. This small ledger makes missing evidence visible and prevents a convenient test result from being attached to a broader requirement it never evaluated. Use enough detail for the consequence and complexity of the task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A requirement needs outcome, procedure, dependencies, and authority"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Outcome",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "the outcome is"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Procedure",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "The procedure exercises"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Dependencies",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Dependencies include"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Authority",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "The authority comes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the check cover the real request path?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the whole request path"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Bind receipts to the candidate and environment checked",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Bind the receipt"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "goal-evidence-ledger"
        },
        {
          "id": "goal-structures",
          "role": "worked-example",
          "title": "Different goal structures need different evidence",
          "speech": "A binary goal asks whether a specified condition passed. A threshold goal compares a measured quantity with an operating boundary. A convergent goal uses stability as a stopping signal. A composite goal requires several conditions together. None of these structures proves that its checks capture the full intent. Two identical scans can share a blind spot, so convergence needs a coverage condition or an explicit incomplete outcome. A weighted average should not let polished writing compensate for a missing security requirement. Preserve mandatory gates separately from preferences. For each criterion, identify the procedure that checks it and the result that should be returned when evidence is unavailable. Unknown must not quietly become pass.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Goal structure does not remove evidence requirements"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Binary",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "A binary goal"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Threshold",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "A threshold goal"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Convergent",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "A convergent goal"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Composite",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "A composite goal"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Mandatory gates cannot be offset by unrelated high scores",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "should not let polished writing compensate"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What status applies when evidence is unavailable?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "when evidence is unavailable"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "goal-structures-spoken-v2"
        }
      ]
    },
    {
      "id": "checks",
      "title": "Use executable checks and calibrated judgment with honest limits",
      "question": "How can a checker demonstrate that it detects the intended defect?",
      "outcome": "Use negative controls and source-backed rubric calibration.",
      "beats": [
        {
          "id": "goal-negative-controls",
          "role": "check",
          "title": "Show that the test fails on the defect it should reject",
          "speech": "Run the expired-credential check against a deliberately broken fixture that accepts expired credentials. The check should fail. That negative control demonstrates sensitivity to this defect, though it does not prove completeness. Record test discovery counts so an empty successful test run cannot satisfy the requirement. For property-based tests, configure important size and character boundaries and report the sampling conditions. A bounded run does not enumerate every possible string or prove a universal property. For schemas, verify the required format checker and constraints are actually enabled. An exit code is evidence about the procedure that ran, including its setup. It is not an unconditional certificate that the intended system behavior is correct.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Broken fixture → expected rejection → meaningful receipt"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Known defect",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a deliberately broken fixture"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Reject",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The check should fail"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "The check should fail"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A negative control shows sensitivity, not completeness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not prove completeness"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Receipt",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Record test discovery counts"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Record test discovery counts"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could this command pass while running no relevant tests?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "an empty successful test run"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "goal-negative-controls"
        },
        {
          "id": "goal-rubric-calibration",
          "role": "derive",
          "title": "A useful rubric discriminates and points to a repair",
          "speech": "For documentation accuracy, compare documented parameter sets with the applicable interface specification before judging writing quality. Give any model evaluator the source evidence, explicit dimensions, and examples that anchor adjacent scores. Measure false approvals and false rejections separately, repeat scoring on unchanged artifacts, and examine disagreement. Low scores should identify located problems such as a missing required field or a claim that contradicts a source. A separate context can reduce exposure to the maker's reasoning, but it does not establish evaluator accuracy. A small collection of examples can reveal gross defects while leaving the operating error rate uncertain. Retain a named expert decision for judgments the automated rubric cannot support adequately.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Rubrics need discrimination, stability, and actionable evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Discriminate",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "false approvals and false rejections"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Repeat",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "repeat scoring on unchanged artifacts"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Locate repair",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "identify located problems"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the rubric reject a plausible but incorrect draft?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a claim that contradicts a source"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Separate context does not prove evaluator accuracy",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not establish evaluator accuracy"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "goal-rubric-calibration"
        }
      ]
    },
    {
      "id": "measurement",
      "title": "Bind claims to the experiment that produced them",
      "question": "What does a passing performance or coverage result actually mean?",
      "outcome": "Retain workload, failure accounting, and proxy limitations.",
      "beats": [
        {
          "id": "goal-benchmark",
          "role": "worked-example",
          "title": "A performance goal describes a reproducible experiment",
          "speech": "To make the search endpoint faster, define the query set, data snapshot, concurrency, warm-up, cache state, hardware, and treatment of timeouts. Specify the latency target and the functional and access-control results that must remain unchanged. A single fast request does not establish the latency distribution. Collect repeated requests under the stated load and apply the same quantile convention to candidate and baseline. Report sample count, variability, failures, and timeouts. Associate the result to the candidate revision and benchmark configuration. Passing means the candidate met that defined experiment. Production traffic, data growth, and untested query families remain outside what this receipt establishes. Changing the dataset after a failure changes the question and requires an explicit specification revision.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Defined workload → repeated measurement → scoped result"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Workload",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "define the query set"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "One fast request does not establish tail latency",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A single fast request"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Measure",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Collect repeated requests"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Collect repeated requests"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Were failures and timeouts kept in the result?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "failures, and timeouts"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Scope result",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Passing means the candidate met"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Passing means the candidate met"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "goal-benchmark-spoken-v2"
        },
        {
          "id": "goal-proxy-gaming",
          "role": "predict",
          "title": "Challenge the cheapest way to satisfy the metric",
          "speech": "A coverage target can be met with assertions that exercise little meaningful behavior. A function-length target can be met by creating confusing indirection. A documentation word count can reward padding. These metrics may be useful signals, but they are not the intended quality by themselves. Ask whether a plausible low-quality solution could satisfy every stated check. Add requirements or review evidence that address the actual failure, rather than piling on arbitrary metrics. For rate limiting, resolve consequential choices such as identity scope, response behavior, exclusions, and configuration before implementing them. Do not invent user preferences when they remain genuinely ambiguous. Make the relevant decision explicit and keep the unresolved part pending while useful independent work continues.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A proxy can be satisfied without delivering the intended quality"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Coverage",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A coverage target"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Function length",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A function-length target"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Word count",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A documentation word count"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Challenge plausible bad solutions that pass every check",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "satisfy every stated check"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which unstated choice would make the user reject this?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "consequential choices"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "goal-proxy-gaming"
        }
      ]
    },
    {
      "id": "scope",
      "title": "Revise requirements without losing valid progress",
      "question": "Which constraints are mandatory, and which unnecessarily dictate implementation?",
      "outcome": "Use proportionate specification and explicit amendments.",
      "beats": [
        {
          "id": "goal-amendments",
          "role": "explain",
          "title": "An amended goal need not discard all completed work",
          "speech": "New information can legitimately change requirements during a run. Record a versioned amendment at a safe decision point and identify the checks it affects. Reuse evidence whose inputs and requirements remain unchanged. Invalidate the receipts that depend on changed requirements, preserve the original result history, and obtain new authority only where the change requires it. Adding a requirement does not automatically reset the spending limit or justify starting the whole task again. Keep the current goal, accepted corrections, and remaining work clear. If the amendment conflicts with an external action already in progress, reconcile its status before dispatching incompatible work. Controlled scope changes allow adaptation without pretending that earlier acceptance applied to a different specification.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Explicit amendment → impact review → reuse or recheck"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Amendment",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Record a versioned amendment"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Impact",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "identify the checks it affects"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "identify the checks it affects"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Reuse evidence whose inputs"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Reuse evidence whose inputs"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which receipts still apply after this change?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Invalidate the receipts that depend on changed requirements"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A new requirement does not reset cumulative limits",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not automatically reset the spending limit"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "goal-amendments-spoken-v2"
        },
        {
          "id": "goal-proportionate-specification",
          "role": "worked-example",
          "title": "Specify outcomes while preserving valid implementation choices",
          "speech": "If the requirement is safe retry, a demand for one particular library may unnecessarily exclude a simpler correct design. Specify the observable behavior and its evidence unless an implementation constraint has a real contractual, compatibility, or security basis. Approved cryptography or data residency can legitimately constrain how the result is produced. Distinguish those obligations from preferences. Match specification effort to the task's recurrence, consequence, and uncertainty. A small reversible edit does not need the same acceptance packet as an autonomous production migration. Conversely, a consequential operation needs enough definition to make authority and success reviewable. The aim is sufficient clarity for this task, not maximum documentation or a rule that every decision must be fully mechanized.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Outcome precision and implementation freedom can coexist"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Observable behavior",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Specify the observable behavior"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Mandatory method",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "an implementation constraint"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Constrain implementation when there is a real requirement",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a real contractual, compatibility, or security basis"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this restriction protect an outcome or just a preference?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Distinguish those obligations from preferences"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Proportionate effort",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Match specification effort"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "goal-proportionate-specification"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Test a specification against plausible bad solutions",
      "question": "Could the cheapest passing answer still violate the intended outcome?",
      "outcome": "Challenge the acceptance contract and preserve unresolved judgments.",
      "beats": [
        {
          "id": "goal-specification-exercise",
          "role": "transfer",
          "title": "Test the docs goal against a convincing wrong draft",
          "speech": "Take one endpoint and bind its required fields, optional fields, response schema, and error conditions to a specification revision. Compare those sets with the documentation, then run a documented request in a disposable environment. Include a draft that is polished but omits a required field, and another that invents a parameter. The checks should identify those located defects. If specification and implementation disagree, preserve the discrepancy instead of choosing whichever makes the draft pass. For a larger migration, map every original requirement to a sub-goal and include an integration check covering their interaction and real client paths. Separate passing components do not prove the whole migration is complete. The exercise succeeds when the evidence supports the actual requirement and unresolved judgments remain visible.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Versioned interface → defective draft → located evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Interface",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a specification revision"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Wrong draft",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a draft that is polished"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "a draft that is polished"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Located defect",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "identify those located defects"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "identify those located defects"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Conflicting sources remain a discrepancy to resolve",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "preserve the discrepancy"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the integration check cover real client paths?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "real client paths"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "goal-specification-exercise"
        },
        {
          "id": "goal-recap",
          "role": "reflect",
          "title": "Make acceptance faithful to the intended outcome",
          "speech": "Separate the intended outcome from its checks. Map each requirement to evidence, dependencies, and decision authority. Test checker sensitivity and calibrate residual judgment. Bind measurements to their workload and retain failures. Amend scope explicitly while reusing evidence that still applies. Those are five principles to retain. Remember: specify, map, challenge, measure, amend. A green result is useful only to the extent that the check represents the requirement and its conditions remain valid. Discuss next: which polished failure could pass your current rubric? Which acceptance metric is only a proxy for what the user values? Apply this chapter to one real request by stating the outcome, the least sufficient evidence, an important negative control, and any named judgment that remains. Then keep implementation choices open where the task allows them.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Faithful acceptance needs evidence and honest limits"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Outcome and checks",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Separate the intended outcome"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Checker sensitivity",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Test checker sensitivity"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Applicable evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "reusing evidence that still applies"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: specify → map → challenge → measure → amend",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: flattering rubric? Misleading proxy?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "goal-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "75a5c1af79a4dba23d41a166e4c5ccd202274e359e02cffb7d7e5c2a8f18eaa6"
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
