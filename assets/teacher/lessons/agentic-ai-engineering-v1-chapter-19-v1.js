(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-19",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Closed Loops First, Open Loops Later",
  "subtitle": "Professor Mode · Bounded procedures, adaptive planning, and measured widening",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-19/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-19/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 19, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "671d65a1806a63a4e3a28ce16523b829c1a9c66a25d81f4e4b749f8191424e19",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Keep exploration tied to the requested outcome",
      "question": "Which freedom solves an observed problem?",
      "outcome": "Distinguish adaptive planning from broader authority.",
      "beats": [
        {
          "id": "widen-stakes",
          "role": "orient",
          "title": "Interesting research can still miss the assignment",
          "speech": "A literature summary is our first case. In Kira's fictional biomarker survey, the user wants ten papers with sample sizes, methods, and effect sizes. The worker has a useful table for eight papers, then follows a disagreement into a chain of methodological debates. The final draft loses its clear structure while the two required papers remain missing. A routine migration is our second case. A known mapping covers most interface changes, so repeatedly inventing the procedure adds cost without solving a new problem. A production investigation is our third case. The next useful measurement depends on what the previous observation revealed, so a rigid sequence may miss the real cause. These are illustrative situations, not proof that every adaptive workflow costs more or every fixed workflow succeeds. Our governing question is: which freedom solves an observed problem? We will define the bounded-to-adaptive spectrum, separate strategy from permission, keep controls around the planner, and design one measured widening experiment. By the end, you should be able to preserve useful exploration while requiring each step to serve an unresolved obligation, rather than rewarding activity that merely stays near the topic.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Choose freedom according to the missing capability"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Research drift",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A literature summary"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An on-topic investigation can still miss the requested outcome",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "two required papers remain missing"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Known mapping",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A routine migration"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Unknown cause",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A production investigation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which freedom solves an observed problem?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "widen-stakes"
        },
        {
          "id": "widen-terminology",
          "role": "explain",
          "title": "Use bounded and adaptive to avoid a terminology trap",
          "speech": "The chapter uses closed as shorthand for a constrained workflow and open for adaptive planning. In standard control theory, closed loop instead means feedback is used, while open loop means it is not. Both architectures here can use feedback, so bounded and adaptive are clearer implementation terms. A bounded pipeline fixes a procedure while allowing intelligence within steps. An adaptive planner chooses its route based on observations. A hybrid keeps required controls around selected adaptive steps. These are degrees of planning freedom, not a scale of unrestricted authority. A researcher can choose search queries while remaining read-only inside an approved corpus. A coding assistant can choose an algorithm while being authorized only to prepare a patch.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Planning freedom and operational authority are separate"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Both bounded and adaptive systems can use feedback",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Both architectures here can use feedback"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Bounded procedure",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A bounded pipeline"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Adaptive route",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "An adaptive planner"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Controlled hybrid",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A hybrid"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which authority remains unchanged as planning becomes adaptive?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "not a scale of unrestricted authority"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "widen-terminology"
        }
      ]
    },
    {
      "id": "baseline",
      "title": "Start with a proportionate baseline",
      "question": "Where does a known procedure stop being sufficient?",
      "outcome": "Compare complete workflows and their actual failure modes.",
      "beats": [
        {
          "id": "widen-baseline",
          "role": "derive",
          "title": "A known procedure offers a baseline, not a universal guarantee",
          "speech": "For a routine migration, encode the known mapping and verify the result against actual acceptance requirements. Fixed steps can simplify debugging and make required checks easier to inspect. Cost is bounded only if step costs, retries, tools, and waiting are also bounded. A fixed path does not eliminate model variation, changing source data, or flaky services. Required categories appearing in a workflow do not prove that the checks cover them correctly. Measure complete outcomes, escaped defects, human review effort, and resource use. If exceptions remain, identify where the procedure fails. The question is whether a specific adaptive step improves those cases enough to justify its additional complexity.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Known procedure → observed failures → targeted adaptation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Baseline",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "encode the known mapping"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Fixed steps still need bounded calls and meaningful checks",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "only if step costs"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Failure evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "identify where the procedure fails"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "identify where the procedure fails"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which failed cases require a genuinely different route?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "where the procedure fails"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Adaptation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a specific adaptive step"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "a specific adaptive step"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "widen-baseline"
        },
        {
          "id": "widen-coverage-ledger",
          "role": "worked-example",
          "title": "Tie the next search to a missing field",
          "speech": "Return to the biomarker summary. Keep a coverage ledger listing required papers, extracted fields, missing evidence, and source limits. A proposed search should name the unresolved field it can help fill. The disagreement between two studies may deserve a caveat or a targeted methods check, but it does not automatically authorize a new research project. Preserve the useful eight-paper table while working on the missing rows. State unavailable sources rather than inventing values or changing the selection criteria to make completion easier. Topic similarity is too weak a relevance test: a search can mention the same biomarker while contributing nothing to the required summary. The ledger connects exploration to the actual request.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Required paper → missing field → justified search"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Paper",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "required papers"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Gap",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "missing evidence"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "missing evidence"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Search",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A proposed search"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "A proposed search"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which requested field could this search resolve?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "unresolved field"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Preserve useful work while filling explicit coverage gaps",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Preserve the useful eight-paper table"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "widen-coverage-ledger"
        }
      ]
    },
    {
      "id": "shell",
      "title": "Keep enforceable controls around adaptive work",
      "question": "What must the planner be unable to waive?",
      "outcome": "Validate the boundary between reasoning and execution.",
      "beats": [
        {
          "id": "widen-shell-controls",
          "role": "derive",
          "title": "The adaptive core cannot waive the execution contract",
          "speech": "Keep current scope, authority, budget admission, required verification, and honest reporting under explicit control. The model can propose what to inspect or how to repair, but it cannot waive a hard limit or grant itself access. A required context set can ensure essential guidance is loaded; applicability checks should still avoid irrelevant material. Verification must cover the outcome and relevant constraints regardless of the route taken. Reporting should preserve evidence and gaps in a known structure. At the boundary, validate the adaptive core's output before another component consumes it. A schema establishes shape, while separate checks establish whether the fields contain supported, complete information. Both may be necessary.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Controlled shell around adaptive investigation and execution"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Authority",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "current scope, authority"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Admission",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "budget admission"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Verification",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "required verification"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Reporting",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "honest reporting"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which control can the planner actually bypass?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "cannot waive a hard limit"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Schema validity does not establish factual completeness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A schema establishes shape"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "widen-shell-controls"
        },
        {
          "id": "widen-seam-recovery",
          "role": "worked-example",
          "title": "Reject an incomplete shape without discarding useful evidence",
          "speech": "Suppose the baseline always returns a table, but the adaptive worker returns a narrative containing a valuable new source and two missing required rows. Preserve the source and return located feedback about the missing structure and coverage. A bounded repair can restore the table if authority and budget remain. Do not silently fill missing cells with empty values and claim completion. If repair cannot finish, retain the useful artifact and list the missing rows as partial work where delivery is permitted. The shell should neither accept malformed output blindly nor discard everything the core learned. Its job is to maintain the contract while preserving evidence that can support a valid continuation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Useful source + missing rows → located feedback → bounded repair"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Partial result",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a valuable new source"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Feedback",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "return located feedback"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "return located feedback"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Repair",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A bounded repair"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "A bounded repair"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Never coerce absent evidence into a completed result",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "claim completion"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What useful evidence survives a rejected output shape?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "preserving evidence"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "widen-seam-recovery"
        }
      ]
    },
    {
      "id": "widen",
      "title": "Widen one freedom with measured evidence",
      "question": "Does the extra capability justify cost and risk?",
      "outcome": "Use paired cases, calibrated checks, and explicit rollback criteria.",
      "beats": [
        {
          "id": "widen-readiness",
          "role": "check",
          "title": "Readiness requires several kinds of evidence",
          "speech": "Before widening, test the evaluator against correct and defective outputs the wider workflow can produce. Report false acceptance and false rejection with denominators; a handful of examples is only a smoke test. Verify enforced limits and cancellation on difficult or unsatisfiable cases. Demonstrate a need for adaptation through failures of the baseline, rather than assuming that more freedom must help. Measure cost and latency distributions, including failed and timed-out runs. Small samples provide unstable estimates of rare expensive cases. Retain enough observations and traces to understand the chosen path. No single high average score substitutes for these different checks, especially when a candidate performs a disallowed action.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Readiness: evaluator, stopping, need, and observed cost"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Evaluator",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "test the evaluator"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Stopping",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Verify enforced limits"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Need",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Demonstrate a need"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Observed cost",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Measure cost and latency"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Small samples provide weak evidence about rare tails",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Small samples provide unstable estimates"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the wider path pass quality checks while violating authority?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "performs a disallowed action"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "widen-readiness"
        },
        {
          "id": "widen-experiment",
          "role": "derive",
          "title": "Change one freedom and account for the whole workflow",
          "speech": "Choose one bottleneck, such as the fixed investigation step that misses context-dependent defects. Compare baseline and candidate on the same versioned inputs with comparable enforced resource allowances. Use independently assessed outcomes and retain every failed or timed-out case. Record improvements, regressions, review effort, cost, latency, and permission violations separately. Establish acceptance and rollback criteria before inspecting the candidate's scores. Economic benefit includes avoided human escalation, remaining reviews, and escaped-defect cost, not just the model bill. A rare severe failure can matter more than many harmless deferrals. If the change does not meet the declared criteria, restore the prior behavior while retaining the experiment evidence for diagnosis.",
          "boardActions": [
            {
              "action": "clear",
              "title": "One freedom → paired evidence → acceptance or rollback"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "One change",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Choose one bottleneck"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Compare",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare baseline and candidate"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Compare baseline and candidate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Decide",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Establish acceptance and rollback criteria"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Establish acceptance and rollback criteria"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Were rollback criteria set before looking at the scores?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "before inspecting the candidate"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Include remaining review and defect costs in the comparison",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "remaining reviews, and escaped-defect cost"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "widen-experiment"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Test recovery when the adaptive path goes wrong",
      "question": "Can useful work survive an incomplete or malformed result?",
      "outcome": "Preserve evidence, gaps, permissions, and bounded repair.",
      "beats": [
        {
          "id": "widen-transfer",
          "role": "transfer",
          "title": "Test wider reasoning without wider permission",
          "speech": "Design a documentation workflow whose adaptive step chooses which approved source to inspect next. Keep publication authority and data access unchanged. Test unavailable sources, contradictory evidence, malformed output, and a proposed action outside the permitted scope. The workflow should preserve discrepancies, reject the action, and report incomplete coverage honestly. Include cases the baseline handles well so improvements do not hide regressions. Review accumulated changes after several widening experiments: individually small freedoms can change overall cost and failure behavior. Also watch persistent unnecessary escalation, which may indicate that a fixed procedure needs improvement. Neither permanent closure nor unlimited adaptation is the goal. The goal is a workflow that meets the request at acceptable cost and consequence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Exercise: adaptive source choice inside unchanged authority"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the candidate improve real failures without broader authority?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Keep publication authority and data access unchanged"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Missing source",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "unavailable sources"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Contradiction",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "contradictory evidence"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Wrong shape",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "malformed output"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Out-of-scope action",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "a proposed action outside"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Inspect regressions and the cumulative effect of added freedom",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "overall cost and failure behavior"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "widen-transfer"
        },
        {
          "id": "widen-recap",
          "role": "reflect",
          "title": "Grant only the freedom supported by evidence",
          "speech": "Use bounded and adaptive terminology clearly. Start with a proportionate baseline and identify the specific gap that adaptation can address. Tie exploration to unresolved requirements. Keep authority, admission, verification, and reporting under enforced control. Validate the boundary between the adaptive output and its consumer. Compare one changed freedom on shared inputs and account for the complete workflow. Remember: baseline, locate, constrain, compare, retain. Preserve useful partial evidence when a result is malformed or incomplete. Discuss next: which fixed step is demonstrably limiting your workflow? Which proposed freedom changes permissions unnecessarily? Next we will examine how to choose verification methods that actually discriminate between acceptable and defective results.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Widen specific planning freedom while preserving the contract"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Measured need",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "identify the specific gap"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Enforced controls",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep authority"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Complete comparison",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare one changed freedom"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: baseline → locate → constrain → compare → retain",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: limiting step? Unnecessary permission change?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "widen-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "a5890d5c651e2f941adcffab92543217bb7edcfd63f3fd392dd59015c16a17c1"
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
