(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-40",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Evaluation-Driven Releases",
  "subtitle": "Professor Mode · Candidate identity, paired evidence, controlled rollout, and compatible recovery",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-40/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-40/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 40, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "a5a3b7f4d22e3ed93de62a3fcc0b279922c24c7b559809ac03479068642ac04c",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Turn evaluation into a bounded release decision",
      "question": "Can a better benchmark support the wrong release?",
      "outcome": "Separate measured improvement, current evidence, eligibility, and deployment authority.",
      "beats": [
        {
          "id": "release-stakes",
          "role": "orient",
          "title": "A five-point improvement can coexist with a release failure",
          "speech": "A cheaper support agent is our first case. In fictional Northline Support, the candidate succeeds on ninety percent of evaluated cases while the baseline succeeds on eighty-five percent. Yet a changed credit adapter creates a fresh operation identifier on each transmission, allowing duplicate credits after lost responses. An empty recovery suite is our second case. Its directory moved, no tests were discovered, and the aggregator treated the empty required-check list as success. An edited retry instruction is our third case. The team changes the prompt after evaluation, then deploys behavior the report never measured. These are teaching assumptions, not company results or vendor measurements. The common failure is a broken connection between the identified candidate, its required evidence, and the authority to expand real traffic. Our governing question is: which exact system has enough current evidence for which deployment stage? We will recompute the comparison, inspect regressions and uncertainty, separate candidate identity from measurement identity, test failure boundaries, and design a rollout that preserves one owner for each business operation. By the end, you should be able to defend a limited release decision or explain the precise evidence that still prevents it.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Better average performance does not close every release obligation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Changed adapter",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A cheaper support agent"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Empty suite",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "An empty recovery suite"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Edited candidate",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "An edited retry instruction"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Release evidence must match the candidate, obligations, and permitted stage",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "broken connection"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which exact system has sufficient evidence for which stage?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "release-stakes"
        },
        {
          "id": "release-decision-claims",
          "role": "derive",
          "title": "Measurement, eligibility, and authority are separate claims",
          "speech": "A measured gain says how an identified candidate performed under a specified evaluation. Current evidence says the required checks actually ran. The resulting receipts must apply to that candidate. Eligibility means the comparison and boundary conditions satisfy the policy for a named next stage. Deployment authority comes from a separately authorized decision. None of these claims establishes universal safety. Name the action class, traffic population, exposure ceiling, owner, and reassessment triggers. A read-only shadow approval does not authorize service credits. Preserve known limitations and original diagnostics so the next action changes the missing prerequisite instead of rerunning a polished report with the same gap.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Measure → establish current evidence → determine eligibility → authorize stage"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Measurement",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "A measured gain"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evidence",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Current evidence"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Current evidence"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Eligibility",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Eligibility means"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Eligibility means"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Authority",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Deployment authority"
            },
            {
              "action": "edge",
              "from": "n3",
              "to": "n4",
              "spokenCue": "Deployment authority"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Every release conclusion has a system, population, and stage boundary",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "None of these claims"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this approval permit observing requests or issuing credits?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "read-only shadow approval"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "release-decision-claims-spoken-v2"
        }
      ]
    },
    {
      "id": "identity",
      "title": "Identify the candidate and the evidence obligations",
      "question": "What exactly did the report evaluate?",
      "outcome": "Freeze behavioral configuration and require explicit nonempty evidence.",
      "beats": [
        {
          "id": "release-two-identities",
          "role": "derive",
          "title": "The system and its measuring instrument have distinct identities",
          "speech": "The candidate includes the effective model configuration, prompts, skills, harness, tool contracts, policy, retrieval configuration, state schema, and resource limits. An in-loop grader that controls retries belongs to the candidate. The measurement package includes task fixtures, reference labels, independent grader, environment, and analysis procedure. Changing that grader changes the instrument; changing the in-loop grader changes the system. Record immutable digests and resolve mutable aliases at startup. For retrieval, retain permitted source revisions and receipts, not merely a directory name. State what dynamic sources or unpinnable provider aliases prevent you from reconstructing. Store secret references and permission scope without embedding credential values in the manifest.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Identify the behavior separately from the evaluation instrument"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Candidate",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The candidate includes"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Measurement",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The measurement package"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did the grader change execution or only the measurement?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Changing that grader"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A Git commit alone may miss prompts, adapters, and dynamic dependencies",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Record immutable digests"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Effective runtime",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "resolve mutable aliases"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "release-two-identities"
        },
        {
          "id": "release-required-inventory",
          "role": "check",
          "title": "Zero discovered checks cannot satisfy a required suite",
          "speech": "Declare required obligations before running the candidate: stable identifiers, applicability, expected discovery, procedure, and evidence. Then record what was discovered, what actually ran, and the outcome of each check separately. If eleven required checks are expected and only ten are found, ten passes do not complete the inventory. A setup error supplies a diagnostic, not a business assertion. Preserve every outcome: pass, fail, execution error, unknown result, and cancellation. A required boundary failure rejects the current candidate; missing required evidence blocks normal promotion. An advisory export failure can have a narrower consequence under its stated policy. Exceptions, where permitted, need a named requirement, authority, scope, controls, and expiry. A waived failure remains a waived failure in the record.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Required inventory → discovery and execution → classified evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Obligations",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Declare required obligations"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Execution",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "record what was discovered"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "record what was discovered"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did every expected obligation produce a current applicable receipt?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "only ten are found"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Disposition",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "required boundary failure"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "required boundary failure"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Missing, unknown, errored, and cancelled evidence are not passes",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "missing required evidence"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "release-required-inventory-spoken-v2"
        }
      ]
    },
    {
      "id": "comparison",
      "title": "Design the comparison before seeing the outcome",
      "question": "Which regressions are hidden by a higher average?",
      "outcome": "Preserve held-out scope and compare paired outcomes with complete costs.",
      "beats": [
        {
          "id": "release-study-design",
          "role": "derive",
          "title": "Separate cases by their underlying source, not their wording",
          "speech": "Keep a versioned held-out set apart from development cases and declare the comparison policy before inspecting results. Ten paraphrases of one dispute do not represent ten independent business situations. Track incident families and exposure; a held-out failure used for targeted optimization becomes a useful regression but loses its untouched status. Run baseline and candidate on matched inputs with equivalent budgets and isolated restored state. Randomize order where time or warmed caches could bias results, and record remaining differences. Preserve difficult cases, blocked runs, and cancellations under the declared analysis policy. Report material action classes separately because routine-credit performance does not establish readiness for account closure or high-value adjustments.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Predeclare comparison → preserve source separation → isolate matched execution"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Held-out scope",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "versioned held-out set"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Repeated seeds and paraphrases do not create new business situations",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "do not represent ten independent"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Source families",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "incident families"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Matched runs",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "matched inputs"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which production action classes does this evaluation cover?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Report material action classes"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "release-study-design"
        },
        {
          "id": "release-paired-arithmetic",
          "role": "worked-example",
          "title": "The gain contains both candidate wins and regressions",
          "speech": "Northline uses two hundred forty fixed cases. Both versions succeed on one hundred ninety-two; the candidate alone succeeds on twenty-four; the baseline alone succeeds on twelve; both fail on twelve. The board shows the totals: baseline two hundred four successes, candidate two hundred sixteen. That is eighty-five versus ninety percent, a five percentage point gain. The twelve regressions still need inspection, especially for permission or duplicate-effect failures. At the assumed costs, baseline spending is seventy-two dollars and candidate spending is fifty-seven dollars and sixty cents, including failed runs. Divide each by its accepted outcomes: approximately thirty-five point three cents versus twenty-six point seven cents. Lower cost and higher average success cannot compensate for a critical boundary violation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "240 paired cases: 192 both pass, 24 candidate wins, 12 regressions, 12 both fail"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "192 both pass",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "one hundred ninety-two"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "24 candidate wins",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "twenty-four"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "12 regressions",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "baseline alone succeeds"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "12 both fail",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "both fail on twelve"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Baseline 204/240 = 85%; candidate 216/240 = 90%; gain = 5 percentage points",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The board shows"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Cost per accepted outcome: $72/204 ≈ $0.353; $57.60/216 ≈ $0.267",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Divide each"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "release-paired-arithmetic"
        }
      ]
    },
    {
      "id": "measurement",
      "title": "Qualify uncertainty and grader validity",
      "question": "Does a reproducible score measure the intended property?",
      "outcome": "Account for dependence, rare harms, and calibration errors.",
      "beats": [
        {
          "id": "release-uncertainty",
          "role": "derive",
          "title": "Independent information determines uncertainty, not raw run count",
          "speech": "Encode each paired outcome as plus one for a candidate-only success, minus one for a baseline-only success, and zero otherwise. The mean difference is zero point zero five. Thirty-six discordant pairs out of two hundred forty give a mean squared difference of zero point one five. The board shows the approximate independent-case standard error, about two point four eight percentage points. This calculation assumes independent cases and binary outcomes. If the cases come from only twenty-four customers with correlated histories, account for those clusters in the analysis. Repeated random seeds measure variation on existing cases, not new customers. Declare margins and analysis rules before viewing results; failure to detect regression does not prove equivalence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Paired uncertainty depends on the sampling unit"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Paired difference",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Encode each paired outcome"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Discordant pairs",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Thirty-six discordant pairs"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "SE ≈ √((0.15 − 0.05²)/240) = 0.0248 = 2.48 percentage points",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The board shows"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Independent units",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "assumes independent cases"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Are cases independent, or clustered within customer histories?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "twenty-four customers"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "release-uncertainty"
        },
        {
          "id": "release-grader-calibration",
          "role": "derive",
          "title": "A reproducible grader can be consistently wrong",
          "speech": "Use deterministic checks where they adequately express the property, and calibrate judgment against qualified reference decisions. Blind graders to candidate labels and unnecessary self-assessments. Sample approvals as well as rejections so confident false passes remain visible. Preserve disagreements, source conflicts, and insufficient-evidence outcomes. If a currency parser inflated scores, apply its repair to both baseline and candidate. Regrade retained outputs when they contain sufficient evidence; rerun execution when missing state or receipts prevent reliable regrading. Rare harms also need targeted boundary tests. Even zero failures in a small independent sample leaves a substantial statistical upper bound, and production distribution changes can invalidate that sampling assumption. A clean average score cannot replace control evidence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Correct measurement requires calibration and independent boundary evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Reference decisions",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "qualified reference decisions"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Both verdict classes",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "approvals as well as rejections"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the grader recognize an unsupported confident success?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "confident false passes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Consistent repair",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "both baseline and candidate"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Regrade stored evidence only when it is sufficient for the repaired check",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Regrade retained outputs"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "release-grader-calibration"
        }
      ]
    },
    {
      "id": "validity",
      "title": "Test boundaries and maintain evidence applicability",
      "question": "Which old receipts survive a new prompt?",
      "outcome": "Exercise recovery and selectively invalidate evidence after changes.",
      "beats": [
        {
          "id": "release-boundary-tests",
          "role": "transfer",
          "title": "Test the application boundary and the evaluation boundary",
          "speech": "To test changed retry behavior, use a receiver under your control. Have it commit the operation and drop its response. For changed policy, revoke permission before dispatch or change the target while approval is pending. For retrieval, remove a required source and include hostile instructions as retrieved data. A safe hold can be the correct result. Then challenge the harness itself with empty discovery, malformed output from the grading tool, generated text containing fabricated receipts, and a checker that exits successfully without executing its assertions. Inspect trusted adapter records. Testing that the controller handles a missing checker is useful. You still lack evidence that the application requirement was satisfied. Finally test whether the fallback version can interpret pending operation state from the candidate.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Boundary evidence includes both system failures and broken measurement"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Effect boundary",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "commit the operation and drop its response"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Harness boundary",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "challenge the harness itself"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A successful checker process is not proof its required assertions executed",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "without executing its assertions"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Recovery versions",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "fallback version"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the fallback read and reconcile the new state schema?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "interpret pending operation state"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "release-boundary-tests-spoken-v2"
        },
        {
          "id": "release-evidence-reuse",
          "role": "check",
          "title": "A small prompt edit can invalidate broad behavioral evidence",
          "speech": "The retry instruction changes after evaluation. Does the old report cover the new candidate? Not automatically. Create a new identity, map the changed dependency to affected obligations, and rerun the relevant checks. Broad prompts, models, policies, and retrieval changes can justify broad behavioral evaluation even when the textual diff is small. A spelling correction in an operator note may preserve runtime evidence if that note cannot influence execution. Record why each reused receipt still applies and who reviewed that reasoning. Freeze the final candidate and verify the actual deployed identity against the authorized manifest. A build job's success message alone cannot establish what the running service resolved at startup.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Changed dependency → affected obligations → current candidate evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "New identity",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Create a new identity"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Applicability map",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "map the changed dependency"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "map the changed dependency"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Retest",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "rerun the relevant checks"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "rerun the relevant checks"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Reuse requires justified applicability; small diff does not imply small behavior change",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Record why each reused receipt"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the runtime identity match the approved candidate?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "actual deployed identity"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "release-evidence-reuse"
        }
      ]
    },
    {
      "id": "rollout",
      "title": "Limit who may act during shadow and canary",
      "question": "Can changing traffic routing duplicate an unknown operation?",
      "outcome": "Keep shadow without mutation authority and preserve one owner per live operation.",
      "beats": [
        {
          "id": "release-shadow-canary",
          "role": "derive",
          "title": "Shadow observes; the canary owns a bounded set of effects",
          "speech": "A shadow receives production-like input while proposed mutations go to denied adapters, simulators, or an effect-capture interface. Do not give it live write credentials and rely on restraint. Isolate memory and retrieval updates too, or the shadow can change the baseline it supposedly only observes. A canary owns a limited share of real operations. Keep each logical operation with one active owner across retries, restarts, and traffic-percentage changes. An unknown candidate operation cannot become fresh baseline work just because routing changed. Predeclare exposure ceilings, expansion conditions, critical stop signals, and an available operator. An uneventful hour with no relevant requests supplies little evidence; delayed outcome labels may require holding expansion.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Shadow has no mutation authority; canary has bounded single-owner authority"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Shadow",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A shadow receives"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Canary",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A canary owns"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Stable ownership",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep each logical operation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Changing traffic percentages must not create another owner for an unknown effect",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "routing changed"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What evidence volume and action coverage justify expansion?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "An uneventful hour"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "release-shadow-canary"
        },
        {
          "id": "release-canary-ledger",
          "role": "worked-example",
          "title": "Confirmed duplicate exposure and unresolved intent are different quantities",
          "speech": "Northline admits forty requests, each for a credit of twenty-five dollars. Thirty-seven acquire completion evidence: thirty-five single credits and two double credits. The board calculates confirmed credits as thirty-five times twenty-five plus two times fifty, totaling nine hundred seventy-five dollars. The intended amount for those resolved requests was nine hundred twenty-five dollars, so confirmed duplication is fifty dollars. Those three remaining requests have unresolved outcomes. Their intended credits total seventy-five dollars. Uncertainty does not mean the credits failed or were lost. It does not make another attempt safe. Stop new candidate mutations and preserve the operation ledger. Routing new requests back to the baseline neither erases confirmed duplication of fifty dollars nor resolves the three unknown outcomes.",
          "boardActions": [
            {
              "action": "clear",
              "title": "40 requests: 37 resolved; 3 unknown"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "35 single credits",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "thirty-five single credits"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "2 double credits",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "two double credits"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Confirmed $975 − intended $925 = $50 duplicate exposure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The board calculates"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Unresolved intended credits: 3 × $25 = $75; reconcile before further mutation",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "seventy-five dollars"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "3 unknown",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Those three remaining requests"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "release-canary-ledger-spoken-v2"
        }
      ]
    },
    {
      "id": "withdrawal",
      "title": "Withdraw without losing the operation history",
      "question": "Does running the old version undo prior effects?",
      "outcome": "Separate routing rollback, reconciliation, and authorized correction.",
      "beats": [
        {
          "id": "release-withdrawal",
          "role": "transfer",
          "title": "A compatible reconciler may matter more than restarting an old binary",
          "speech": "Withdrawal first stops new admissions and constrains obsolete writers. Classify in-flight work as confirmed, rejected, or unknown, preserving the candidate's operation identities. Verify whether the prior version can read the new state. If downgrade is unsupported, route existing operations to a compatible reconciler and consider mutation shutdown with read-only service. Compensation requires separate business authority and its own tracking. Rehearse credential scope, operator access, state readability, and recovery during a simulated dependency failure. A rollback control that depends on the unavailable service may not help. Keep owners for delayed labels, provider changes, retrieval freshness, expired exceptions, and unresolved effects after expansion; the release decision does not retire that responsibility.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Stop admission → preserve and classify effects → reconcile with compatible state"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Stop new work",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "stops new admissions"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Preserve history",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Classify in-flight work"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Classify in-flight work"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Compatible recovery",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "compatible reconciler"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "compatible reconciler"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Rollback controls future execution; reconciliation resolves existing effects",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Compensation requires separate business authority"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can recovery still operate when the original dependency is unavailable?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "simulated dependency failure"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "release-withdrawal"
        },
        {
          "id": "release-recap",
          "role": "reflect",
          "title": "Release the identified system that current evidence supports",
          "speech": "Identify the candidate separately from its measurement package. Require nonempty, complete, current obligations and preserve unknowns and errors. Compare matched outcomes, inspect regressions, and qualify uncertainty by independent evidence. Calibrate graders and test failure boundaries. After edits, reuse only receipts with justified applicability. Keep shadow from mutating and give each canary operation one owner. Withdraw routing while reconciling prior effects. Remember: identify, obligate, compare, qualify, authorize, observe. Apply this sequence to your next model or prompt change. Discuss next: which hidden runtime dependency can change without a commit? Which missing required check could pass unnoticed? Which unknown operation would survive a rollback? The final chapter follows the identity and delegated authority that make these controls enforceable.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A release is a bounded decision backed by current applicable evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Exact candidate",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Identify the candidate"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Current obligations",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "current obligations"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Owned recovery",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "reconciling prior effects"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: identify → obligate → compare → qualify → authorize → observe",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: hidden dependency? Missing check? Unknown effect after rollback?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "release-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "511b3eecb6e9be916ff07f7240de720678f8f0ef216747e25da93c291d430fef"
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
