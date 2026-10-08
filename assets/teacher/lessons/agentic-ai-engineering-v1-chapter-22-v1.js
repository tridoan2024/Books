(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-22",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Evals as Loop Infrastructure",
  "subtitle": "Professor Mode · Complete outcomes, survivor bias, and release evidence",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-22/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-22/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 22, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "89722d33b3f3540645e77eff27008ab614a7f1f5fd5f5b99849cc84f5bc0ecbd",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Measure useful outcomes beyond checker approval",
      "question": "Does the dashboard measure acceptance or actual value?",
      "outcome": "Use complementary evidence and complete denominators.",
      "beats": [
        {
          "id": "eval-stakes",
          "role": "orient",
          "title": "A green dashboard can measure a permissive checker",
          "speech": "A contract-review dashboard is our first case. In Jenna's fictional legal workflow, the in-loop judge approves most summaries quickly. A later source-based audit finds material errors in amounts, obligations, and notice periods. The dashboard measured checker satisfaction, while the audit asked whether the summaries represented the contracts. A faster candidate is our second case. Its successful tasks need fewer attempts, but many difficult tasks now fail entirely and disappear from the successful-run average. A changed prompt is our third case. A release carries forward yesterday's passing report even though the evaluated configuration no longer matches what will run. These cases show how an attractive metric can answer a narrower question than the release decision requires. The examples are illustrative rather than evidence of population accuracy or a particular vendor's performance. Our governing question is: does the dashboard measure acceptance or actual value? We will distinguish the oracle from the evaluation, retain complete outcome denominators, build meaningful regression cases, and bind results to the tested system. By the end, you should be able to reject misleading improvements while keeping the useful diagnostic information in attempts, costs, traces, and independent outcome checks.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Checker approval, survivor averages, and stale release evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Lenient checker",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A contract-review dashboard"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Missing failures",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A faster candidate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Changed configuration",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A changed prompt"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An attractive metric may answer the wrong release question",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a narrower question"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the dashboard measure acceptance or actual value?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "eval-stakes"
        },
        {
          "id": "eval-oracle-distinction",
          "role": "explain",
          "title": "The steering check and the system measurement serve different jobs",
          "speech": "An oracle assesses the current artifact inside a run and guides acceptance or repair. An evaluation measures the workflow across cases, including outcome quality and the resources used to achieve it. They can share a test, but merely replaying the same blind spot does not independently establish user value. Complementary source checks, reviewed references, or appropriate expert judgments can reveal defects the in-loop grader misses. A different standard helps only when it validly measures the intended requirement. Preserve uncertainty in reference labels and adjudicate disagreements. Alongside success, measure critical escapes, coverage, cost, latency, blocked work, cancellations, and permission violations. No single approval rate describes the complete system.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Oracle: current artifact; eval: complete workflow across cases"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "In-loop oracle",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "An oracle assesses"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "System evaluation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "An evaluation measures"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Complementary evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Complementary source checks"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What important outcome does the in-loop grader miss?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "defects the in-loop grader misses"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Different evidence must still measure the intended requirement",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "validly measures the intended requirement"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "eval-oracle-distinction"
        }
      ]
    },
    {
      "id": "metrics",
      "title": "Interpret attempts and costs conditionally",
      "question": "Could a faster average hide more failed tasks?",
      "outcome": "Keep all run outcomes and independent acceptance visible.",
      "beats": [
        {
          "id": "eval-attempts",
          "role": "derive",
          "title": "Attempts-to-pass describes successes under a particular grader",
          "speech": "Record the iteration on which a run first receives the oracle's passing verdict. A run that never passes has no attempts-to-pass value; it still contributes its attempts, cost, and outcome to the full record. Report the successful-run distribution together with every failure, timeout, blocked task, and cancellation. A cluster of quick successes can reflect efficient work or an overly permissive checker. A long tail can suggest harder cases, poor feedback, fixture problems, or other causes. Shape is a diagnostic signal, not a unique diagnosis. Compare independent acceptance and task classes before deciding that the model, rubric, or goal is responsible. Preserve the identity of the grader used for each measurement.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Conditional convergence metric plus complete run outcomes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Pass iteration",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the iteration on which a run first receives"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Failed runs",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A run that never passes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which tasks disappeared from the success-only average?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the successful-run distribution"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Distribution shape suggests hypotheses rather than proving causes",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not a unique diagnosis"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Independent quality",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare independent acceptance"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "eval-attempts"
        },
        {
          "id": "eval-survivor-example",
          "role": "worked-example",
          "title": "Fewer attempts can coexist with fewer accepted outcomes",
          "speech": "Suppose the baseline completes ninety of one hundred tasks at two attempts per success. The candidate completes seventy at one attempt. Its conditional attempts metric improves, but twenty additional tasks remain unresolved. In a separate illustrative cost comparison, assume the baseline spends one hundred dollars across all attempts and the candidate spends ninety dollars. Divide each total by its independently accepted outcomes. The board shows that the candidate spends less overall yet more per accepted result. Include failed-run costs in those totals. Inspect which classes were lost and whether the cause is unavailable evidence, a tool regression, or reduced capability. Do not celebrate the faster surviving tasks while ignoring the work that no longer completes.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Baseline: 90/100 complete; candidate: 70/100 complete"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Baseline: 2 attempts",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "baseline completes ninety"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Candidate: 1 attempt",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "candidate completes seventy"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "20 more unresolved",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "twenty additional tasks"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Illustrative all-run cost: $100/90 ≈ $1.11; $90/70 ≈ $1.29",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The board shows"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which task classes stopped completing?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Inspect which classes were lost"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "eval-survivor-example-spoken-v2"
        }
      ]
    },
    {
      "id": "diagnosis",
      "title": "Turn patterns into tested hypotheses",
      "question": "Which change explains the observed failure cases?",
      "outcome": "Compare matched cases without weakening live requirements.",
      "beats": [
        {
          "id": "eval-diagnostic-triad",
          "role": "derive",
          "title": "Change one factor and inspect the cases that changed",
          "speech": "A model change, an adjustment to the evaluator, or clearer goal can test different explanations for excessive retries. Compare each candidate with the baseline using the same inputs under the same resource policy. Check independent quality, because a model may simply produce a style the judge prefers. A temporarily relaxed evaluator belongs in an isolated experiment and cannot weaken a required production gate. Inspect tools, data availability, routing, and fixture health as well; the three familiar hypotheses are not exhaustive. If fewer attempts come from removed requirements, that is a scope change rather than proven capability improvement. Retain per-case transitions so the aggregate cannot hide a consequential regression behind an improvement elsewhere.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Hypothesis → one controlled change → case-level evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Hypothesis",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "different explanations"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Change",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare each candidate"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Compare each candidate"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did the changed system improve the outcome or only satisfy the judge?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a style the judge prefers"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Never weaken live required gates to improve an evaluation metric",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot weaken a required production gate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Retain per-case transitions"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Retain per-case transitions"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "eval-diagnostic-triad-spoken-v2"
        },
        {
          "id": "eval-regression-example",
          "role": "worked-example",
          "title": "A substring can approve a contradictory legal summary",
          "speech": "A fixture sets the liability cap at ten million dollars. A summary instead states a cap of one million dollars, while also mentioning ten million dollars elsewhere. Searching only for the expected text would pass the wrong answer. Verify a structured amount with units, currency, source clause, and source revision. Then check whether the surrounding explanation contradicts it or omits a relevant qualification. Structured extraction improves the check but does not create a complete legal evaluator. Add cases for carve-outs, currency changes, missing clauses, malformed output, and contradictions. Preserve the incident or source reference that explains each regression case. A suite is useful when it rejects the represented failure under current conditions, not merely when it contains familiar keywords.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Source clause → structured claim → contradiction review"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Source",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A fixture sets"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Matching an expected string can approve an incorrect answer",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "would pass the wrong answer"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Claim",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Verify a structured amount"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Verify a structured amount"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the extracted amount represent the correct clause and units?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "units, currency, source clause"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Meaning",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "check whether the surrounding explanation contradicts"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "check whether the surrounding explanation contradicts"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "eval-regression-example-spoken-v3"
        }
      ]
    },
    {
      "id": "release",
      "title": "Bind regression and release evidence to a configuration",
      "question": "Which system and data did this evaluation actually test?",
      "outcome": "Preserve split integrity and versioned applicability.",
      "beats": [
        {
          "id": "eval-splits",
          "role": "explain",
          "title": "Preserve distinct roles for development, regression, and release cases",
          "speech": "Development cases support iteration. Regression cases preserve known important failures. A held-out release set estimates behavior on cases not repeatedly used to tune the system. Once a reserved case is exposed for debugging, record that exposure and replenish or rotate it as appropriate. Renaming the file does not restore its independence. Prevent related documents or incident families from leaking across splits. Include representative messy inputs and capability boundaries, and refresh coverage when real traffic changes. A discrepancy between development and held-out performance warrants investigation into overfitting, distribution differences, and label quality. The split labels alone do not establish that either set is representative or correctly judged.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Three collections have different purposes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Development",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Development cases"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Regression",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Regression cases"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Held-out release",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A held-out release set"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Exposed cases do not become untouched again by renaming",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Renaming the file does not restore"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Do related source documents cross the split boundary?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "related documents or incident families"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "eval-splits"
        },
        {
          "id": "eval-manifest",
          "role": "derive",
          "title": "Evaluation belongs to the complete candidate configuration",
          "speech": "Record the model identifier and available version information, prompts, skills, tools, permission policy, retrieval configuration, harness, grader, fixtures, and budgets. Bind the report to that candidate manifest. If something changes, identify affected evidence before carrying a pass forward. Reuse checks whose dependencies remain unchanged and rerun those whose claims no longer apply. Store matched per-case outcomes and repeated runs where stochastic behavior matters. Define a practical acceptance margin and uncertainty method before comparing scores. Lack of statistical significance does not prove equivalence when the experiment has little power. If runs share a document or incident, account for that clustering instead of pretending every run is an independent observation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Candidate manifest → matched evaluation → scoped release evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Manifest",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "candidate manifest"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A passing report applies only where its dependencies still match",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "whose claims no longer apply"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evaluation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Store matched per-case outcomes"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Store matched per-case outcomes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Decision",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Define a practical acceptance margin"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Define a practical acceptance margin"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Were uncertainty and clustering handled at the right unit?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "account for that clustering"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "eval-manifest"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Test misleading improvements and stale evidence",
      "question": "Would the release gate reject a faster but less useful candidate?",
      "outcome": "Use practical margins, critical vetoes, and scoped recovery.",
      "beats": [
        {
          "id": "eval-release-exercise",
          "role": "transfer",
          "title": "Test the gate against misleading aggregate improvements",
          "speech": "Create a candidate that improves the average score while leaking a protected credential in one controlled fixture. A declared critical veto should block promotion. Add the faster candidate that loses difficult tasks, and require all outcomes and total costs in its report. Change a prompt or fixture after a passing evaluation; the evidence manifest should stop claiming unchanged applicability for affected checks. If a tool authentication regression caused the new failures, fix that path and rerun the affected cases rather than relaxing the grader. Canary observation can reveal traffic differences after an authorized release, but it cannot justify forbidden actions merely to collect data. Keep the decision owner, scope, limits, and rollback condition explicit.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Exercise: critical veto, survivor bias, and changed inputs"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Critical violation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "leaking a protected credential"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An aggregate gain cannot offset a declared critical veto",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "should block promotion"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Missing tasks",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "loses difficult tasks"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Changed input",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Change a prompt or fixture"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the report identify the exact evaluated candidate?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "evidence manifest"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "eval-release-exercise"
        },
        {
          "id": "eval-recap",
          "role": "reflect",
          "title": "Measure the whole workflow and retain applicable evidence",
          "speech": "Use evaluations to assess outcomes beyond in-loop approval. Interpret attempts-to-pass as a conditional convergence metric and retain every attempted task in the full outcome record. Diagnose with matched cases and independent quality evidence. Build regression checks that reject the actual failure, preserve meaningful data splits, and bind reports to the tested configuration. Remember: measure, include, compare, preserve, bind. State uncertainty and keep critical policy violations separate from average scores. Discuss next: which failed tasks are missing from your dashboard? Which current release claims evidence from a different configuration? Next we will examine how optimization can exploit gaps between the metric and the user's intended outcome.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Complete outcomes, meaningful controls, and versioned evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Complete outcomes",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "retain every attempted task"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Controlled diagnosis",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Diagnose with matched cases"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Bound evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "bind reports to the tested configuration"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: measure → include → compare → preserve → bind",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: omitted failures? Evidence for another release?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "eval-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "4200738c89cecbdcfaa06ad23d154a4b7083cb338958961c8d5f9d84cff852d5"
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
