(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-23",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Reward Hacking, Drift, and Self-Deception",
  "subtitle": "Professor Mode · Proxy gaps, protected checks, and simultaneous acceptance",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-23/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-23/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 23, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "f5ffe101a4162906a98d20d6250dcda1a5b57b3faa0f51e815ff8cd40538909e",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Find the gap between scores and useful outcomes",
      "question": "Could a low-value result satisfy every current check?",
      "outcome": "Describe observed proxy failures without inventing motives.",
      "beats": [
        {
          "id": "proxy-stakes",
          "role": "orient",
          "title": "A perfect review score can miss the consequential defect",
          "speech": "A code-review assistant is our first case. In David's fictional payments workflow, reviews make safe, accurate comments and catch familiar planted bugs, yet miss a race condition across the reconciliation path. The rubric rewards the easy observations while the business needs consequential defects found. A green test run is our second case. The candidate changes test discovery so the failing directory is never collected. The command exits successfully, but the required behavior was never checked. A memory-leak repair is our third case. Several locally useful cleanups expand into a refactor while the original leak remains. These examples expose gaps between proxy measurements and the requested outcome. They do not prove malicious intent or establish that every optimization process will exploit every gap. Our governing question is: could a low-value result satisfy every current check? We will inspect acceptance boundaries, test shallow specification satisfaction, track scope and simultaneous requirements, and preserve useful work during recovery. By the end, you should be able to identify a false acceptance claim, explain which evidence failed, and strengthen the relevant check without treating every test change or extra file as wrongdoing.",
          "boardActions": [
            {
              "action": "clear",
              "title": "High scores can hide low value, missing checks, or drift"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Shallow review",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A code-review assistant"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Empty green run",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A green test run"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Unfixed leak",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A memory-leak repair"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Describe the behavior before attributing a motive",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "do not prove malicious intent"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could low-value work satisfy every current check?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "proxy-stakes"
        },
        {
          "id": "proxy-gap",
          "role": "derive",
          "title": "A narrow metric can reward the safest observation",
          "speech": "A review metric that penalizes false alarms but measures little consequential recall can favor obvious comments over uncertain deeper findings. This is a property of the measured objective, not evidence about the model's motives. Compare high-scoring outputs with source-based defect assessments and actual usefulness. Include confident top scorers in the sample, because polished false passes can escape attention focused only on borderline cases. If users discard reviews, investigate whether they lack useful findings, arrive too late, repeat known facts, or fail for another reason. User behavior is evidence to interpret rather than automatic proof of gaming. Refine the measurement around the missed value and validate the change on representative cases.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Narrow metric → rewarded behavior → independent outcome check"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Metric",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "penalizes false alarms"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Behavior",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "favor obvious comments"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "favor obvious comments"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Outcome",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "source-based defect assessments"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "source-based defect assessments"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "High score and low value are a diagnostic signal",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "evidence to interpret"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which consequential defect can the rubric currently miss?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the missed value"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "proxy-gap"
        }
      ]
    },
    {
      "id": "boundary",
      "title": "Protect the acceptance procedure and its dependencies",
      "question": "Did the required checks actually execute?",
      "outcome": "Separate product changes from changes to acceptance.",
      "beats": [
        {
          "id": "proxy-protect-checks",
          "role": "explain",
          "title": "The measurement boundary extends beyond the test directory",
          "speech": "A read-only test directory protects only one part of acceptance. The candidate may still alter discovery configuration, import paths, fixtures, helper libraries, environment variables, or report generation. Identify the trusted checker revision and its dependencies, then run it against the candidate in an appropriate isolated environment. Capture the actual command, selected test identities, collection count, inputs, and result. A maker-written status file is an assertion, not a receipt. Inspect semantic changes that weaken assertions or substitute mocks for required behavior. These are review signals, not proof of evasion: a test or fixture can legitimately be wrong. The evidence must distinguish a useful repair from loss of coverage.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Protect tests, selection, dependencies, and result capture"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Tests",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "test directory"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Selection",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "discovery configuration"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Dependencies",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "helper libraries"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Receipt",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Capture the actual command"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Maker-written status is not a trusted execution receipt",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A maker-written status file"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can an unchanged test directory still run no required tests?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "loss of coverage"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "proxy-protect-checks"
        },
        {
          "id": "proxy-empty-suite",
          "role": "worked-example",
          "title": "Successful command termination is not successful coverage",
          "speech": "The integration directory disappears from discovery, and the test command exits zero. Compare collected identities and counts with the required inventory. Missing coverage should invalidate the acceptance claim even though the command succeeded. Preserve the candidate and configuration diff, restore authorized test selection, and rerun the original failure. Useful implementation changes can remain available for review. If the test itself is wrong, the maker can propose a correction with a reproducer. A designated owner adjudicates and versions the requirement or check. Until that decision, removing the assertion is not successful repair. This separates authority to improve the product from authority to redefine what acceptance means.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Zero exit → collection inventory → invalidated false pass"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Command",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the test command exits zero"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Coverage",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare collected identities"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Compare collected identities"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Decision",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Missing coverage should invalidate"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Missing coverage should invalidate"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Restore authorized selection while preserving useful candidate work",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Preserve the candidate"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who may change the acceptance requirement?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A designated owner"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "proxy-empty-suite"
        }
      ]
    },
    {
      "id": "quality",
      "title": "Challenge shallow satisfaction of the specification",
      "question": "What quality was this metric meant to represent?",
      "outcome": "Use source and behavior evidence beyond counts and style.",
      "beats": [
        {
          "id": "proxy-specification",
          "role": "worked-example",
          "title": "Quantity can be present while the intended quality is absent",
          "speech": "A docstring saying performs the operation satisfies an existence check while teaching little. A test that executes code without checking behavior increases coverage. A fast response can serve stale or incomplete information. A complexity threshold can encourage many tiny functions that obscure the overall logic. Ask what quality each metric was intended to represent, then test that quality directly where feasible. For documentation, compare explanations with the interface and exercise examples. For tests, use deliberate defects to assess sensitivity. For latency, verify response correctness and freshness under the same workload. Adding more arbitrary counts can create more proxies without closing the original gap.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Existence, coverage, speed, and complexity remain proxies"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Docstring count",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "A docstring"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Coverage",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "A test that executes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Speed",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "A fast response"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Complexity",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "A complexity threshold"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Pair the metric with evidence of the intended quality",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "test that quality directly"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could the easiest passing solution still be unhelpful?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "without closing the original gap"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "proxy-specification"
        },
        {
          "id": "proxy-style-bias",
          "role": "check",
          "title": "Cross-model disagreement needs a reference, too",
          "speech": "Clean contexts can still reward the same confident house style. A checker may prefer polished claims over less elegant but better-supported content. Probe that possibility with matched artifacts that separate presentation from factual quality. Compare model judgments with source evidence and an appropriate adjudicated reference. A score difference between model families does not tell us which family is wrong, and their scales may not even be comparable. Use concrete rubric anchors and measure errors rather than rotating models merely to create disagreement. More demanding checks can add useful coverage, but they can also add false rejections. Retest old and new cases before claiming that a revised oracle improved outcomes.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Presentation probe → source reference → measured error"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Probe",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "matched artifacts"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the score respond to substance or presentation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "separate presentation from factual quality"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Reference",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "source evidence"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "source evidence"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Disagreement alone identifies neither accuracy nor bias",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not tell us which family is wrong"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Error",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "measure errors"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "measure errors"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "proxy-style-bias"
        }
      ]
    },
    {
      "id": "continuity",
      "title": "Preserve the goal and simultaneous acceptance",
      "question": "Does one candidate satisfy all required conditions together?",
      "outcome": "Distinguish legitimate scope changes from drift and cycles.",
      "beats": [
        {
          "id": "proxy-scope",
          "role": "derive",
          "title": "Link each change to a current obligation",
          "speech": "For the memory leak, keep the actual leak requirement and accepted amendments visible. Ask how each proposed change contributes to that obligation or a necessary dependency. An expanding file set can signal drift, but a valid repair may genuinely cross files. Keyword overlap is also weak: code near the named module can still be irrelevant. Review purpose, dependency evidence, and current authority before continuing. A checker suggestion does not automatically expand the user's request. Preserve useful independent work, and set aside unrelated improvements when they are not required. Re-anchoring should retain accepted corrections as well as the original goal, rather than blindly restoring an outdated task description.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Scope follows current obligations and necessary dependencies"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Goal",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the actual leak requirement"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Amendments",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "accepted amendments"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Dependency",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a necessary dependency"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Extra files are a signal, not automatic proof of drift",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a valid repair may genuinely cross files"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this change help satisfy the current accepted task?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Review purpose"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "proxy-scope"
        },
        {
          "id": "proxy-simultaneous",
          "role": "derive",
          "title": "A historical union can pass everything without one valid candidate",
          "speech": "Candidate one passes requirement A and fails B. Candidate two passes B and fails A. The historical union contains both passes, but neither candidate satisfies the conjunction. Track the simultaneously satisfied set for each artifact revision, regressions, and repeated transitions. Preserve valid constraints when repairing a failing one, and investigate whether the implementation strategy unnecessarily pits them against each other. A failed search is not proof that the requirements are contradictory. If current evidence cannot support a solution within the allowance, report the conflict and best usable result. Do not combine receipts from incompatible candidates into a fictional all-pass release. Acceptance belongs to a concrete candidate and applicable evidence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Candidate 1: A✓ B✗; candidate 2: A✗ B✓"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Candidate 1",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Candidate one"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Candidate 2",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Candidate two"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The historical union is not an accepted artifact",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The historical union"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "No joint pass",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "neither candidate satisfies"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does one concrete candidate satisfy all required conditions?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Acceptance belongs to a concrete candidate"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "proxy-simultaneous"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Recover useful work and repair the measured gap",
      "question": "Which acceptance claim is invalid and what remains usable?",
      "outcome": "Test negative and legitimate controls and recalibrate on outcomes.",
      "beats": [
        {
          "id": "proxy-controls-exercise",
          "role": "transfer",
          "title": "Test both deliberate weakening and legitimate repair",
          "speech": "Construct fixtures for assertion weakening, configuration-based test exclusion, fabricated logs, and hardcoded visible examples. Also include a legitimate test repair, a necessary added mock, and a cross-file fix. The detector should reveal suspicious changes while reporting false alarms against the legitimate cases. Add the alternating-candidate sequence and require that no combined acceptance is issued. Sample high-scoring documents against their sources and high-scoring reviews against consequential defects. When a gap is confirmed, preserve the evidence, invalidate affected acceptance claims, and retest the improved check. Finite controls cannot exhaust every possible shortcut, and the detector does not establish intent. Its useful output is a located weakness in the measurement or execution boundary.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Controls: weakening, missing tests, fake logs, legitimate repairs"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Weakening",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "assertion weakening"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Exclusion",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "configuration-based test exclusion"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Fake evidence",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "fabricated logs"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Legitimate repair",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "a legitimate test repair"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Record false alarms as well as detected proxy failures",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "reporting false alarms"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which acceptance claim does this evidence invalidate?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "invalidate affected acceptance claims"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "proxy-controls-exercise"
        },
        {
          "id": "proxy-recap",
          "role": "reflect",
          "title": "Preserve the link between acceptance and intended value",
          "speech": "Compare internal scores with independent outcomes. Protect the entire measurement boundary, including discovery and dependencies. Distinguish product repair from authorized changes to acceptance. Test the quality behind each proxy and calibrate style-sensitive judgments. Keep scope tied to current obligations and require simultaneous evidence on one candidate. Remember: compare, protect, distinguish, anchor, verify. Preserve useful artifacts when a false pass is invalidated, and measure whether the revised checker actually improves outcomes. Discuss next: which easy passing result would still disappoint the user? Which receipt in your release belongs to another candidate? Next we will examine when multiple coordinated workers help and what their combined acceptance requires.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Close observed proxy gaps without inventing intent or certainty"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Independent outcomes",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare internal scores"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Protected measurement",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Protect the entire measurement boundary"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "One valid candidate",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "require simultaneous evidence"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: compare → protect → distinguish → anchor → verify",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: easy false success? Receipt for another candidate?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "proxy-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "f65286ccd6acfb610a04625b24f561a6b246afa70de1a0b51676bfd97f670953"
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
