(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-04",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "The Harness Is the Product",
  "subtitle": "Professor Mode · mechanisms, controlled comparisons, and maintainable improvements",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-04/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-04/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 4, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "92440df0533a11047b59f6f66ddf1b980eb159fd9593b88d847498347dd6569a",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Diagnose the mechanism behind an improvement",
      "question": "Which harness change would address an observed failure?",
      "outcome": "Distinguish a useful architectural hypothesis from an unsupported causal claim.",
      "beats": [
        {
          "id": "harness-stakes",
          "role": "orient",
          "title": "The same request can fail at different system boundaries",
          "speech": "A transaction classifier is our first case. In the chapter's fictional Clearway experiment, one design relies mainly on a long prompt while another adds retrieval, rule checks, a model cascade, and conflict handling. A code-repair assistant is our second case. It can receive either a vague failure message or a precise report tied to the current code and failing assertion. A document-review workflow is our third case. Its checker may receive a clear rubric and the finished draft, or it may inherit the maker's persuasive explanation of what the draft intended to say. These are illustrative system designs, not verified production comparisons. Their common mechanism is that model output depends on information, available actions, feedback, and the evidence used for acceptance. A better outcome does not by itself identify which component caused the improvement. Our governing question is: which harness change would address an observed failure? By the end, you should be able to trace five mechanisms, distinguish missing evidence from model incapability, compare a change with a simpler baseline, and roll back a defective component without discarding useful improvements. We will use the rule classifier as a running example and keep every performance claim tied to the experiment that could support it.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Find the failing boundary before adding infrastructure"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Rule classifier",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A transaction classifier"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Code repair",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A code-repair assistant"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Document review",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A document-review workflow"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A better outcome does not isolate its cause",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A better outcome does not by itself"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which change addresses the observed failure?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "harness-stakes"
        },
        {
          "id": "harness-confounded-comparison",
          "role": "predict",
          "title": "What did the two-team comparison establish?",
          "speech": "Clearway's second design changes several things together: retrieval, checking, conflict handling, and the model cascade. If it produces a higher score, can we attribute the whole difference to the harness alone? Pause and identify the confound. The comparison changed the models as well as the surrounding workflow. It also changed several harness components at once. The fictional results illustrate hypotheses to test; they do not measure an isolated causal effect. Start with the observed failure class. A nonexistent rule identifier suggests a membership check. An omitted exception suggests a retrieval-coverage problem. An incorrect priority decision suggests a policy or conflict-resolution problem. These mechanisms require different interventions. The chapter's title is a useful reminder that users experience the complete system. It is not a theorem that every harness improvement dominates every model or prompt improvement.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Separate changed components before assigning credit"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which variables changed together?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "changes several things together"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Retrieval",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "retrieval, checking"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Checking + policy",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "conflict handling"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Model cascade",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "the model cascade"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The fictional score is not an isolated causal effect",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "they do not measure an isolated causal effect"
            }
          ],
          "pauseAfterMs": 6000,
          "audioSegment": "harness-confounded-comparison"
        }
      ]
    },
    {
      "id": "inputs",
      "title": "Improve the information and available actions",
      "question": "What does the model receive, and what can it do with it?",
      "outcome": "Connect context coverage and tool design to specific failure modes.",
      "beats": [
        {
          "id": "harness-context-coverage",
          "role": "derive",
          "title": "Smaller context helps only if it retains the decisive evidence",
          "speech": "Context curation decides which information reaches the model. Removing irrelevant material can reduce distraction and cost, but a short context that omits the applicable exception can be confidently wrong. For the rule classifier, inspect coverage before celebrating a smaller token count. Retain the relevant rule text, its version, the conditions that make it applicable, and any governing exception or precedence. A stronger judge cannot recover an exception that neither maker nor checker receives. Ask whether each retrieved passage supports the decision, not merely whether it shares keywords with the transaction. Track missing-clause errors alongside input size and final correctness. The tradeoff is sufficiency at an acceptable cost. Curation should help the system make a supported decision; brevity by itself is not the outcome.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Retrieve → retain exceptions → decide with support"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A smaller context can still omit the decisive fact",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a short context that omits"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Relevant rule",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Retain the relevant rule text"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Exception",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "any governing exception"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "any governing exception"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did the checker receive the missing exception?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "neither maker nor checker receives"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Supported decision",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "make a supported decision"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "make a supported decision"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "harness-context-coverage"
        },
        {
          "id": "harness-tool-affordances",
          "role": "explain",
          "title": "A useful tool makes the intended operation clear",
          "speech": "Tool affordances describe what an operation does, when to use it, what arguments it expects, and what result or failure it returns. A clear interface can reduce selection and argument errors, but it does not guarantee correct use. For a rule lookup, require a canonical identifier or an explicit search query rather than an ambiguous string with two meanings. Return enough provenance to distinguish the rule version and source. Bound the result size and make missing records explicit. Keep authorization in the execution service rather than asking the model to infer its permission from a tool description. Some repetitive data processing belongs in ordinary code, with the model receiving only the evidence it needs. Evaluate the interface on actual failed calls and downstream decisions before adding more tools to the catalog.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Make the operation and its result unambiguous"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Input contract",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "what arguments it expects"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Result evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "what result or failure it returns"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Clear documentation does not guarantee correct use",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "it does not guarantee correct use"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Execution policy",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep authorization in the execution service"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which failed call does this interface improve?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "actual failed calls"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "harness-tool-affordances"
        }
      ]
    },
    {
      "id": "feedback",
      "title": "Make another attempt depend on useful evidence",
      "question": "When does retry improve the system rather than repeat its error?",
      "outcome": "Design precise diagnostics and bounded correction.",
      "beats": [
        {
          "id": "harness-diagnostic-feedback",
          "role": "worked-example",
          "title": "Return the observation that identifies the defect",
          "speech": "Suppose the classifier cites a rule identifier absent from the current database. A message saying the answer is bad leaves the maker guessing. A useful diagnostic names the invalid identifier, the database revision checked, and the allowed next step for resolving the missing reference. It should not fabricate a replacement rule or expose unrelated confidential data. For code repair, the equivalent evidence is the failing assertion, expected and observed values, relevant call path, and artifact version. Such a report can narrow the next investigation. It does not prove that the first suggested repair is correct. Measure whether the diagnostic reduces the targeted error and improves accepted outcomes, including regressions and recovery effort. More detailed feedback is useful when it changes a decision; an unfiltered log dump can hide the decisive observation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Observed defect → precise diagnostic → targeted investigation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Observed defect",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "cites a rule identifier absent"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Precise diagnostic",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A useful diagnostic names"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "A useful diagnostic names"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Do not invent the missing rule",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "It should not fabricate a replacement rule"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Next investigation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "narrow the next investigation"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "narrow the next investigation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Will this detail change the next decision?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "when it changes a decision"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "harness-diagnostic-feedback"
        },
        {
          "id": "harness-informed-retry",
          "role": "check",
          "title": "Retry needs a correction mechanism",
          "speech": "A retry can help when new evidence changes the approach or when a documented transient condition has cleared. Repeating the same prompt against the same missing evidence can reproduce the same failure. A simple retry calculation depends on assumptions about how attempt outcomes relate. Real attempts often share the same source omission, mistaken requirement, or model limitation. Study the conditional outcome after a failed attempt rather than treating every retry as a fresh independent chance. Keep a total budget, preserve current evidence, and stop when the next attempt cannot address the barrier. If the source database is unavailable, another invented citation is not progress. If the identifier is invalid but the correct source is accessible, a bounded lookup and revised answer may be useful. The mechanism matters more than the number of attempts.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A new attempt needs a reason to improve"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "New evidence",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "new evidence changes the approach"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Shared failure",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Real attempts often share"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What changes after the previous failure?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "after a failed attempt"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An invented citation is not progress",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "another invented citation is not progress"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Bounded correction",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a bounded lookup and revised answer"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "harness-informed-retry-spoken-v2"
        }
      ]
    },
    {
      "id": "evaluation",
      "title": "Choose graders and models by evidence",
      "question": "Which configuration provides acceptable outcomes at full cost?",
      "outcome": "Separate evaluator independence, model capability, and cascade selection effects.",
      "beats": [
        {
          "id": "harness-independent-check",
          "role": "explain",
          "title": "Separate evaluation without pretending agreement proves truth",
          "speech": "A checker in a fresh context can evaluate the artifact without inheriting the maker's explanation. Give it the acceptance criteria, relevant source evidence, and the artifact it must assess. This separation reduces one route for bias, but does not eliminate shared training errors, a mistaken rubric, or a missing source. A deterministic membership check can establish that a cited rule exists. It cannot establish that the rule applies to this transaction. A semantic review can address applicability, but it needs calibration against examples and adjudicated disagreements. Match the evidence to the property. Do not add a judge merely because a pipeline diagram has a checker box. Add it when it detects consequential errors that the current evidence misses, and measure both false approvals and unnecessary rejections.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Different checks establish different properties"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Fresh context does not eliminate shared mistakes",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not eliminate shared training errors"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Evaluator limits",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "shared training errors"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Rule exists",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a cited rule exists"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Rule applies",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the rule applies"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What error does this checker add evidence for?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "errors that the current evidence misses"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "harness-independent-check"
        },
        {
          "id": "harness-cascade-economics",
          "role": "derive",
          "title": "A cascade must be tested on the cases it actually receives",
          "speech": "A cascade assigns different configurations to different steps or task classes. Parsing a known file list may need no model at all. An ambiguous multi-rule decision may need stronger reasoning and additional evidence. Routing is itself a decision that can fail. A cheap classifier may confidently send a hard case down the wrong path, so self-reported confidence needs calibration before it controls escalation. Compare the complete cascade with sensible alternatives on the same cases. Measure quality on the actual distribution reaching each stage, including cases that earlier stages misclassify. Include routing, generation, checking, rejected attempts, latency, and human recovery in the cost. A lower token bill is not an improvement if escaped defects or recovery effort grow. Select a configuration for acceptable outcomes, then monitor whether that conclusion remains supported as the workload changes.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Route → evaluate received cases → compare full outcomes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Routing decision",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Routing is itself a decision"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Confidence used for routing needs calibration",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "self-reported confidence needs calibration"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Received cases",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the actual distribution reaching each stage"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "the actual distribution reaching each stage"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Full cost",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Include routing, generation"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Include routing, generation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did lower spend increase escaped defects?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "if escaped defects or recovery effort grow"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "harness-cascade-economics"
        }
      ]
    },
    {
      "id": "experiment",
      "title": "Test one component with controlled cases",
      "question": "What result would support this particular harness change?",
      "outcome": "Design an ablation and exercise missing-rule and conflicting-rule fixtures.",
      "beats": [
        {
          "id": "harness-ablation-design",
          "role": "worked-example",
          "title": "Test a membership check as one isolated change",
          "speech": "Freeze the evaluation cases and record the model, prompt, retrieval configuration, tool schemas, budget, and oracle revision. Keep development examples separate from held-out examples. Compare the baseline with the same system plus an identifier-membership check. Where feasible, include a simpler deterministic alternative. Count invalid citations before and after, then inspect whether rejection leads to a correct answer, an appropriate abstention, or repeated failure. Also record absolute correct counts, false approvals, latency, and total cost including rejected runs. If the membership check merely increases retries, its operational value may be limited even though it detects the intended defect. If several components must change together, report the bundle being evaluated and avoid assigning its whole effect to one component. The conclusion should be no broader than the comparison supports.",
          "boardActions": [
            {
              "action": "clear",
              "title": "One change, shared cases, complete outcome measures"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Frozen baseline",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Freeze the evaluation cases"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Membership check",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "an identifier-membership check"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Outcome evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a correct answer, an appropriate abstention"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Measure rejected runs and useful correction",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "total cost including rejected runs"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did detection improve the final outcome?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "merely increases retries"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "harness-ablation-design"
        },
        {
          "id": "harness-controlled-rules",
          "role": "predict",
          "title": "A valid identifier can still support the wrong decision",
          "speech": "Introduce two controlled fixtures. In the first, remove a rule required for the decision. In the second, supply two applicable rules with a documented precedence. What should the system do? For the missing rule, preserve the evidence gap and mark the decision inconclusive. It should not invent the absent text. For the conflict, apply the trusted precedence policy and retain traceable rule identifiers. If no precedence policy exists, the model cannot create one by sounding certain. Now reverse the experimental component and rerun the same fixtures. That comparison helps establish which behavior depends on the change. These small tests demonstrate a mechanism and a recovery path. They do not prove broad compliance accuracy or rule out rare production failures. The point is to make the causal claim inspectable before relying on it.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Test missing evidence and conflicting rules separately"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Missing rule",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "remove a rule required"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Conflicting rules",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "supply two applicable rules"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What should each fixture produce?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "What should the system do"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Trusted precedence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "apply the trusted precedence policy"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "No policy means no invented resolution",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "If no precedence policy exists"
            }
          ],
          "pauseAfterMs": 6000,
          "audioSegment": "harness-controlled-rules"
        }
      ]
    },
    {
      "id": "operations",
      "title": "Keep the improvement maintainable and reversible",
      "question": "When should a component be retained, revised, or removed?",
      "outcome": "Connect outcome evidence, maintenance, and targeted rollback.",
      "beats": [
        {
          "id": "harness-targeted-rollback",
          "role": "transfer",
          "title": "Retain only the components that earn their maintenance",
          "speech": "Suppose a new retrieval ranker omits important exceptions. Revert the ranker while preserving a useful identifier parser and the tests that still apply. Keep enough version information to reproduce the failure, and recheck any dependent conclusions after the rollback. This is easier when each component has a clear purpose and acceptance evidence. Skills can become stale. Memory can retain an incorrect claim. A checker can reject useful work. A coordinator can lose track of unfinished assignments. None earns permanent inclusion because it once helped a pilot. Choose one failure in your own workflow and propose the smallest component change that addresses it. State the expected benefit, the full operating cost, the disconfirming result, and the rollback action. Then test that proposal before committing to a platform.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Observed regression → targeted rollback → renewed evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Observed regression",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "omits important exceptions"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Targeted rollback",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Revert the ranker"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Revert the ranker"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Renewed evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "recheck any dependent conclusions"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "recheck any dependent conclusions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A component must earn its ongoing maintenance",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "None earns permanent inclusion"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What result would disconfirm the proposed benefit?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the disconfirming result"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "harness-targeted-rollback"
        },
        {
          "id": "harness-recap",
          "role": "reflect",
          "title": "Remember the mechanism and the comparison",
          "speech": "Diagnose the failed boundary. Preserve the evidence needed for the decision. Return diagnostics that can change the next action. Test correction, grading, and routing under their actual assumptions. Retain a component only when its outcome benefit justifies its full cost and maintenance. Those are five durable principles. Remember: mechanism, baseline, one change, evidence, rollback. The complete system determines the user experience, but no title or fictional score establishes which component deserves credit. Discuss next: what recurring error would one small harness change address in your workflow? What observation would make you remove that change? Apply the method by writing a bounded comparison with a held-out case set, an explicit failure measure, and a reversible implementation. The next chapter asks when a loop is unnecessary and a simpler workflow should do the work.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Improve the mechanism you can test and maintain"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Diagnose",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Diagnose the failed boundary"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Compare",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Test correction, grading, and routing"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Retain or revert",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Retain a component only when"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: mechanism → baseline → change → evidence → rollback",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: recurring defect? Reason to remove the change?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "harness-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "d293ffcefc3e502e6baa2428345faeec1540fa0a8a96ecc5fca14cf06172bb05"
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
