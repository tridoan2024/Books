(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-20",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "The Hierarchy of Oracles",
  "subtitle": "Professor Mode · Discriminating checks, honest uncertainty, and calibrated evidence",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-20/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-20/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 20, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "c56b86cd9cac7dc812d08f653a9e059f2772ceb98e03f7e2c571880909839d9b",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Choose checks that distinguish useful outcomes",
      "question": "What does this verdict actually establish?",
      "outcome": "Separate candidate defects, execution errors, and missing evidence.",
      "beats": [
        {
          "id": "oracle-stakes",
          "role": "orient",
          "title": "A red build can reveal an unavailable fixture",
          "speech": "A dependency upgrade is our first case. In Priya's fictional service fleet, the loop treats every red integration run as a reason to change application code. Some failures actually come from network timing and database readiness. Repeated attempts eventually turn green by chance, creating a costly and misleading feedback signal. A sorting function is our second case. A test checks that the output is ordered, yet an implementation returning an empty list passes that property while losing every input element. A polished report is our third case. Its evaluator rewards organization and confidence but misses unsupported claims. Each case shows a different way that a precise verdict can fail to represent the intended quality. These examples are illustrative, and their costs and rates are not operating estimates for your system. Our governing question is: what does this verdict actually establish? We will choose appropriate checks, distinguish instruments from evaluators, calculate error rates with explicit denominators, and layer requirements without hiding uncertainty. By the end, you should be able to design a verification path that produces actionable evidence, preserves missing checks, and spends more only when the additional assessment serves a real requirement.",
          "boardActions": [
            {
              "action": "clear",
              "title": "The verdict is only as useful as the property and procedure"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Flaky fixture",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A dependency upgrade"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Incomplete property",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A sorting function"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Flattering rubric",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A polished report"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A precise verdict can still miss intended quality",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a precise verdict can fail"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What does this verdict actually establish?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "oracle-stakes"
        },
        {
          "id": "oracle-menu",
          "role": "explain",
          "title": "The hierarchy is a menu rather than a ladder of truth",
          "speech": "The chapter groups methods into deterministic checks, property-based tests, rubric scoring, model judges, and human review. These are useful categories, not five statistically ordered strengths. A rubric is an instrument that a model or person can apply. Cost also depends on workload: a large integration suite may cost more than a short model evaluation. Choose the least expensive configuration that discriminates adequately for the relevant property and consequence. Not every artifact needs all five categories. Define the required claim, the evidence needed to support it, and the limits of that evidence. A high-stakes judgment may justify review that costs more than generation. The appropriate amount of checking follows the task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Select methods by property, consequence, and evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Executable checks",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "deterministic checks"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Generated tests",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "property-based tests"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Five categories are not five guaranteed levels of strength",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not five statistically ordered strengths"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Rubric instrument",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "A rubric is an instrument"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Judgment",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "a model or person"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which extra assessment would change acceptance evidence?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "evidence needed to support it"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "oracle-menu"
        }
      ]
    },
    {
      "id": "checks",
      "title": "Use specific and generated checks appropriately",
      "question": "Which properties can the procedure really assess?",
      "outcome": "Treat passing samples and coverage as bounded evidence.",
      "beats": [
        {
          "id": "oracle-specific-checks",
          "role": "derive",
          "title": "A command result needs a causal interpretation",
          "speech": "A type checker, schema validator, or test suite applies encoded rules to particular inputs. Preserve the rule version, candidate revision, environment, discovered tests, and result. A violated assertion may indicate a candidate defect. An unavailable database indicates that the intended integration evidence could not be obtained. Diagnose fixture health before asking the maker to change application code. If a bounded fixture repair succeeds, rerun the relevant check against the same candidate. If it does not, report the passing unit evidence and blocked integration coverage. Quarantining the failing suite changes coverage and needs an explicit acceptance decision where that coverage is required. It must not silently produce a green release.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Candidate defect, execution error, and missing coverage differ"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did the intended check actually run on this candidate?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "discovered tests"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Assertion failure",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A violated assertion"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Fixture error",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "An unavailable database"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Repair the fixture before assuming the application is defective",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Diagnose fixture health"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Unresolved evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "blocked integration coverage"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "oracle-specific-checks"
        },
        {
          "id": "oracle-properties",
          "role": "worked-example",
          "title": "Ordered output alone does not prove a correct sort",
          "speech": "For sorting, check both nondecreasing order and preservation of the input elements as a multiset. Otherwise an empty output can satisfy the ordering property while discarding data. Generate cases with empty inputs, duplicates, extreme values, and relevant size limits. A reproducible counterexample gives a concrete input that violates the encoded property under the fixture. Shrinking can make that example easier to diagnose. A passing bounded sample does not prove the property for all inputs. The property, generator, or fixture may itself be wrong. Similarly, branch coverage measures exercised branches, not the fraction of possible defects eliminated. Select checks that address the requirement and state the untested boundaries.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Properties → generated inputs → reproducible counterexample"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Properties",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "check both nondecreasing order"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could a defective implementation satisfy this property?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "an empty output"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Inputs",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Generate cases"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Generate cases"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Counterexample",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A reproducible counterexample"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "A reproducible counterexample"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A bounded passing sample is not a universal proof",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not prove the property for all inputs"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "oracle-properties"
        }
      ]
    },
    {
      "id": "judgment",
      "title": "Structure and calibrate residual judgment",
      "question": "Who evaluates the rubric, using which evidence?",
      "outcome": "Distinguish instruments from evaluators and preserve uncertainty.",
      "beats": [
        {
          "id": "oracle-rubric",
          "role": "derive",
          "title": "Anchor scores to observable evidence and mandatory gates",
          "speech": "Replace excellent documentation with explicit criteria: required functions covered, parameters accurate against the interface, examples executable, and important limitations stated. Provide concrete anchors for adjacent score levels. Separate mandatory requirements from preferences so attractive style cannot compensate for a factual error. Give the evaluator source evidence and ask for located support for each verdict. Measure agreement and adjudicated errors on representative examples, then refine ambiguous dimensions. Agreement alone does not establish accuracy. A rubric can still omit an important quality dimension or fail to capture an interaction between them. Keep residual judgment explicit where the instrument does not adequately represent the decision.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Rubrics need observable anchors and source-linked verdicts"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Anchors",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "explicit criteria"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Mandatory gates",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Separate mandatory requirements"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "source evidence"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Agreement does not establish accuracy",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Agreement alone"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which important defect is absent from the rubric?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "omit an important quality dimension"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "oracle-rubric"
        },
        {
          "id": "oracle-model-human",
          "role": "explain",
          "title": "Different evaluators can share the same blind spot",
          "speech": "A model judge can assess meaning with the artifact, requirement, and relevant evidence in a separate context. Keeping the maker's persuasive rationale out can reduce one source of anchoring. It does not prove independence of errors or correctness. Models may favor confidence, length, or polished structure. Qualified humans bring context and accountable judgment, but can disagree, miss details, or become fatigued. Use a documented reference process to adjudicate disagreements rather than declaring either evaluator infallible. Human review may be a required gate or a calibration sample depending on the task. Make that choice before the run, and keep a required pending decision visible instead of substituting an unrelated automated pass.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Model and human judgments both require calibration"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Model judge",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A model judge"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Separate context does not prove independent errors",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not prove independence of errors"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Human reviewer",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Qualified humans"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reference process",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a documented reference process"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is human review required here or used for calibration?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a required gate or a calibration sample"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "oracle-model-human"
        }
      ]
    },
    {
      "id": "metrics",
      "title": "Count errors with explicit denominators",
      "question": "How many accepted outputs contain defects?",
      "outcome": "Calculate detection metrics without confusing conditional rates.",
      "beats": [
        {
          "id": "oracle-confusion-counts",
          "role": "derive",
          "title": "Count defects and acceptable artifacts separately",
          "speech": "Let positive mean defective. In an illustrative set of one thousand artifacts, one hundred contain reference defects. The checker rejects ninety defects. It also rejects forty-five acceptable artifacts. Ten defects escape. Eight hundred fifty-five acceptable artifacts pass. Defect recall asks the proportion of all defects that were rejected. Defect precision asks the proportion of flagged artifacts with an actual defect. False rejection uses all acceptable artifacts as its denominator. The defect fraction among accepted outputs uses all accepted artifacts instead. The board keeps the four counts visible so each metric can be recomputed. Always state the reference process and sample selection; counts without trustworthy labels can produce precise but misleading percentages.",
          "boardActions": [
            {
              "action": "clear",
              "title": "1,000 artifacts: 100 defective and 900 acceptable"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "TP = 90 rejected defects",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "rejects ninety defects"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "FP = 45 rejected good",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "forty-five acceptable artifacts"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "FN = 10 escaped defects",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Ten defects escape"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "TN = 855 accepted good",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "eight hundred fifty-five"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Recall: 90/100; precision: 90/135; accepted defects: 10/865",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "each metric can be recomputed"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which denominator answers the operational question?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Always state the reference process"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "oracle-confusion-counts-spoken-v2"
        },
        {
          "id": "oracle-prevalence",
          "role": "worked-example",
          "title": "Missing a tenth of defects is not a tenth of accepted work",
          "speech": "In that example, ten of the one hundred defects escaped, but those ten are only part of the much larger accepted group. Confusing these denominators exaggerates or hides operational risk depending on the workload. Defect prevalence changes the fraction of accepted work that is defective even if the checker has the same conditional error rates. Sample both accepted and rejected artifacts when estimating the full confusion matrix. Sampling accepted outputs alone can estimate their defect fraction, but not overall defect recall. When comparing thresholds, include evaluation cost, false-rejection effort, delay, and consequences of defects that pass unnoticed. Some critical requirements remain hard gates rather than terms that a higher average score can offset.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Conditional detection error differs from accepted-output risk"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Defect miss rate",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "ten of the one hundred defects"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Accepted defect share",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the much larger accepted group"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Prevalence changes the risk among accepted results",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Defect prevalence changes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Sampling limits",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Sample both accepted and rejected artifacts"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this sample support recall or only accepted-output quality?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "not overall defect recall"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "oracle-prevalence-spoken-v2"
        }
      ]
    },
    {
      "id": "layers",
      "title": "Layer required checks without voting away failures",
      "question": "Can a later pass resolve this particular uncertainty?",
      "outcome": "Keep requirement identities and complete cost accounting.",
      "beats": [
        {
          "id": "oracle-layered-cost",
          "role": "worked-example",
          "title": "Measure what earlier gates actually save",
          "speech": "Consider two hundred outputs per day in an illustrative cost model. A first gate rejects one hundred ten, leaving ninety for the next stage. A property check rejects eighteen more. The remaining seventy-two outputs reach the judge. The board shows the assumed unit price and resulting judge bill. The saving is conditional on these volumes and rejection rates. It excludes the earlier gates' infrastructure, maintenance, latency, and retries caused by false rejection. Include those costs before deciding whether the whole workflow is cheaper. A gate that rejects many valid outputs can reduce judge calls while making delivery worse. The objective is economical discrimination, not maximizing the number of artifacts stopped before an expensive check.",
          "boardActions": [
            {
              "action": "clear",
              "title": "200 inputs → 90 survivors → 72 judge evaluations"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "200 inputs",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "two hundred outputs"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "90 survivors",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "leaving ninety"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "leaving ninety"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "72 evaluations",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The remaining seventy-two"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "The remaining seventy-two"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "At $0.04/eval: $8.00 → $2.88 per day; gates excluded",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The board shows"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Do earlier gates save total cost without blocking valid work?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Include those costs"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "oracle-layered-cost-spoken-v2"
        },
        {
          "id": "oracle-required-unknown",
          "role": "derive",
          "title": "A later pass does not erase another requirement",
          "speech": "Assign each check a requirement identity and expected input revision. Mark required and advisory checks before evaluation. A required failure blocks that requirement; a required inconclusive result remains unresolved. A later favorable model verdict cannot automatically erase missing integration evidence because the checks may assess different properties. If a qualified reviewer can resolve that specific uncertainty, record the explicit resolution policy and decision. An authorized waiver is not a fabricated passing check. An empty layer list must not pass by default. A timeout supplies no successful result. Neither does a judge response that cannot be parsed, or a required test group that never ran. Layering combines evidence for requirements; it is not a vote in which several easy passes defeat one critical failure.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Required evidence remains attached to its own obligation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Required fail",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A required failure"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Required unknown",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a required inconclusive result"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this later check resolve the same requirement?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "different properties"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Explicit resolution",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "record the explicit resolution policy"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Empty or missing evidence must not fall through to success",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "must not pass by default"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "oracle-required-unknown-spoken-v2"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Test and maintain the checker",
      "question": "Can the oracle reject known defects and preserve unknowns?",
      "outcome": "Use controls, reference judgments, and regression evidence.",
      "beats": [
        {
          "id": "oracle-validation-exercise",
          "role": "transfer",
          "title": "Probe false passes and preserve unresolved states",
          "speech": "Test an empty check list, all required passes, an early failure, a late failure, all inconclusive results, and an inconclusive result followed by a pass. Under this policy, only all required passes produce acceptance. Simulate command timeout and malformed judge output through the real adapter. They should preserve explicit missing evidence. Add deliberate defects for every important quality dimension and verify that the checker detects them. When a missed defect becomes a new check, rerun old and new examples together to reveal false rejections or interactions. Keep candidate and checker revisions with the receipts. Improvement is an observed change in useful discrimination, not simply a longer list of checks.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Test pass, fail, unknown, and missing-check semantics"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "No checks",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "an empty check list"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "All required pass",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "all required passes"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Failure",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "an early failure"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Unknown then pass",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "an inconclusive result followed by a pass"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can missing evidence accidentally become success?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "explicit missing evidence"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Retest old and new examples when the checker changes",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "rerun old and new examples together"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "oracle-validation-exercise"
        },
        {
          "id": "oracle-recap",
          "role": "reflect",
          "title": "Choose sufficient verification and keep its limits visible",
          "speech": "Match each required property to suitable evidence. Separate candidate defects from failed execution and unresolved coverage. Use generated tests as bounded exploration and rubrics as explicit instruments. Calibrate both model and human judgments. Define error metrics with counts and correct denominators. Layer checks without letting one pass erase another requirement's failure. Remember: specify, discriminate, count, layer, calibrate. Include the full cost of verification and update checks using observed misses and regressions. Discuss next: which current green result hides missing evidence? Which metric in your dashboard uses the wrong denominator? Next we will examine how maker and checker contexts should differ while retaining enough evidence for a meaningful review.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Verification needs discriminating evidence and explicit limits"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Appropriate checks",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Match each required property"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Correct metrics",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Define error metrics"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Preserved requirements",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Layer checks"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: specify → discriminate → count → layer → calibrate",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: hidden missing evidence? Wrong denominator?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "oracle-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "dc49b8599f9b6020f265e76d74aa9a3d059315138a16547e2f13573356d16341"
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
