(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-21",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Maker–Checker",
  "subtitle": "Professor Mode · Auditable context boundaries and evidence-backed review",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-21/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-21/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 21, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "4197c928c5aa683c6d3aaa4b6e9f636d808fb994f0be873ae283304eed2a6f69",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Review the artifact rather than the maker's confidence",
      "question": "What information should reach the checker?",
      "outcome": "Remove persuasive history while retaining necessary facts.",
      "beats": [
        {
          "id": "checker-stakes",
          "role": "orient",
          "title": "A fluent page can agree with its author and contradict the API",
          "speech": "An interface reference is our first case. In Marcus's fictional documentation system, the same conversation generates a page and rates its accuracy. The page marks a required parameter optional, invents response fields, and describes the wrong rate-limit scope. Its own reviewer approves because the draft matches assumptions already present in the conversation. A timeout patch is our second case. A fresh reviewer sees a locally correct function but lacks the caller that supplies milliseconds where the function expects seconds. Removing too much context leaves that reviewer uninformed. A manipulated document is our third case. The artifact contains an instruction telling the checker to ignore the rubric and approve it. A separate request does not automatically make that instruction harmless. These cases are illustrations, not a measured guarantee that context separation improves every model or task. Our governing question is: what information should reach the checker? We will build a factual review packet, audit the actual request, measure shared errors, and return evidence-backed feedback. By the end, you should be able to distinguish useful drafting self-critique from independent acceptance, while preserving the source context and execution evidence that meaningful review requires.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Exclude persuasion; retain facts; treat artifacts as untrusted"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Shared assumptions",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "An interface reference"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Missing caller",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A timeout patch"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Injected instruction",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A manipulated document"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A fresh reviewer can still be uninformed or manipulated",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not automatically make that instruction harmless"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What information should reach the checker?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "checker-stakes"
        },
        {
          "id": "checker-mechanisms",
          "role": "explain",
          "title": "Prior context can make intended meaning look like written evidence",
          "speech": "Visible plans, self-ratings, and confident conclusions can anchor a later review. Familiar wording may receive favorable treatment, and knowledge of intent can fill gaps the artifact never actually explains. These are plausible failure mechanisms to test on the chosen task, not universal laws of every model. Inspect the messages the runtime really sends; do not assume hidden reasoning is exposed. An instruction to be critical can change behavior, but it does not prove that prior material was excluded. Self-critique remains useful during drafting. When independent judgment is required for acceptance, construct a separate evidence-based request and evaluate its error profile instead of treating a stern prompt as an information boundary.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Possible contamination: anchoring, agreement, and intent filling"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the reviewer see unsupported self-assessments?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "self-ratings"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Anchoring",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "can anchor a later review"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Familiar wording",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Familiar wording"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Intent filling",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "knowledge of intent"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Inspect actual messages; do not assume hidden reasoning is exposed",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Inspect the messages"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "checker-mechanisms"
        }
      ]
    },
    {
      "id": "packet",
      "title": "Build an auditable review packet",
      "question": "Can the actual request prove what the checker saw?",
      "outcome": "Bind allowlisted evidence to the artifact and requirements.",
      "beats": [
        {
          "id": "checker-packet",
          "role": "derive",
          "title": "Build from allowed fields instead of trimming a conversation",
          "speech": "Include authoritative requirements, the exact artifact revision, applicable schemas and callers, located source excerpts, and actual execution receipts. Exclude self-ratings and promotional claims that the work is complete. If the maker says all tests passed, supply the recorded command, discovered tests, environment, output, and revision binding instead of the assertion. Build this packet from allowlisted fields rather than copying a transcript and removing a few messages. The same discipline applies to an evidence field: a summary can quietly carry persuasive conclusions. A helper function is useful, but every caller must use the boundary correctly. Audit the outgoing request, including automatically attached history and provider-side conversation state.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Requirements + artifact → factual evidence → audited request"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Artifact",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the exact artifact revision"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "actual execution receipts"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "actual execution receipts"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An assertion of a test pass is weaker than its actual receipt",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "instead of the assertion"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can a caller smuggle persuasive history through an evidence field?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "an evidence field"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Request",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Audit the outgoing request"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Audit the outgoing request"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "checker-packet"
        },
        {
          "id": "checker-missing-caller",
          "role": "worked-example",
          "title": "A useful checker asks for the missing contract",
          "speech": "The timeout patch looks correct when inspected alone. The checker should identify the missing caller contract before claiming that units are compatible. Supply the caller and a relevant test, then rerun the affected review against the same candidate. If the caller cannot be retrieved, preserve completed mechanical evidence and report the semantic review as unresolved. Do not recruit another general reviewer simply to obtain a more agreeable verdict. For documentation, compare the page with a versioned specification and relevant implementation behavior. If they disagree, retain the discrepancy instead of choosing whichever source makes the page pass. Independence requires enough factual context to evaluate the real claim.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Missing contract → targeted evidence → affected review"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Gap",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the missing caller contract"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Supply the caller"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Supply the caller"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Review",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "rerun the affected review"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "rerun the affected review"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "More agreeable reviewers do not resolve missing evidence",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a more agreeable verdict"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which fact could change this specific review outcome?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "enough factual context"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "checker-missing-caller"
        }
      ]
    },
    {
      "id": "limits",
      "title": "Measure correlated errors and protect the boundary",
      "question": "What can clean contexts still get wrong together?",
      "outcome": "Distinguish context separation, statistical dependence, and authority.",
      "beats": [
        {
          "id": "checker-correlated-misses",
          "role": "derive",
          "title": "Separate requests are not independent error events",
          "speech": "Two clean contexts can repeat the same misconception. Different models can share sources, common assumptions, and the same gaps in knowledge. The joint miss probability uses the chance that the first checker misses a defect multiplied by the chance that the second misses given that first miss. Replacing that conditional chance with the second checker's overall miss rate requires justified independence. Measure overlap on adjudicated defects, especially consequential ones. Complementary evidence can matter more than different wording: a property test and a runtime integration check may expose different failures. Compare escaped defects, false rejections, latency, and cost. A new provider is also a data-access decision and must remain within the task's approved provider scope.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Joint miss = first miss × second miss given first miss"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Shared misconception",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "repeat the same misconception"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Conditional overlap",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "given that first miss"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Different contexts or providers do not prove independent errors",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "requires justified independence"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Measured evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Measure overlap"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Do the checkers inspect complementary evidence?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Complementary evidence"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "checker-correlated-misses-spoken-v2"
        },
        {
          "id": "checker-injection-authority",
          "role": "explain",
          "title": "A checker verdict is evidence for the controller",
          "speech": "Treat the artifact as untrusted data even inside a separate request. It can contain fake system messages, instructions to approve, or fabricated test output. Message separation and labels help organize the boundary but do not guarantee injection resistance. Restrict the checker to the tools and data it needs, usually read-only inspection, and give it no publication authority. Validate the returned structure and require located evidence for findings. The controller applies the acceptance and authorization policy. A checker response does not grant permission to mutate a service or broaden scope. Test that the actual harness refuses those actions rather than relying only on the model to describe the right behavior.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Untrusted artifact → restricted checker → policy decision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Untrusted input",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Treat the artifact as untrusted data"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Restricted checker",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Restrict the checker"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Restrict the checker"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Controller",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The controller applies"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "The controller applies"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A verdict cannot grant new mutation or publication authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not grant permission"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can artifact instructions trigger tools outside the review task?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "refuses those actions"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "checker-injection-authority"
        }
      ]
    },
    {
      "id": "feedback",
      "title": "Return findings that support targeted correction",
      "question": "What must change, where, and on what evidence?",
      "outcome": "Prioritize consequential defects without hiding required failures.",
      "beats": [
        {
          "id": "checker-feedback",
          "role": "derive",
          "title": "Locate the defect and explain its impact",
          "speech": "Instead of documentation inaccurate, identify the parameter, cite the relevant source, and explain the mismatch. For the timeout example, state that the caller supplies milliseconds while the function interprets seconds. Suggest a correction consistent with the requirement, without treating the suggestion as proof that one implementation is mandatory. Prioritize consequential failures, but retain the full required-failure inventory in a linked artifact when a short summary cannot hold it. Do not hide a critical issue to meet an arbitrary feedback quota. Test whether this feedback reduces attempts while independently preserving quality. A shorter retry sequence is not an improvement if the checker simply became easier to satisfy.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Feedback: location, evidence, impact, and bounded correction"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Locate",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "identify the parameter"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Support",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "cite the relevant source"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Impact",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "explain the mismatch"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Correct",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Suggest a correction"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Prioritize the summary without dropping required failures",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "retain the full required-failure inventory"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did fewer attempts preserve independently checked quality?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "independently preserving quality"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "checker-feedback"
        },
        {
          "id": "checker-disposition-panel",
          "role": "check",
          "title": "Calibrate scrutiny and define the panel policy",
          "speech": "A neutral prompt and a defect-seeking prompt can change false alarms and misses, but their effect must be measured. Do not require invented findings just to satisfy a quota. Compare expected review effort, defect consequence, and delay using explicit reference labels and denominators. If several checkers assess required properties, a supported critical failure cannot be voted away by generic approvals. A missing response or required inconclusive judgment remains unresolved. Majority vote may suit a separate subjective preference task when its quorum and rules are declared in advance. It is not a universal release policy. Neither a panel's size nor the confidence of its members establishes correctness.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Review disposition and panel policy require explicit evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Neutral review",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A neutral prompt"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Defect seeking",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a defect-seeking prompt"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Required findings",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a supported critical failure"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Generic approvals cannot outvote a required critical failure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot be voted away"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is this a required-checker policy or a subjective preference vote?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Majority vote may suit"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "checker-disposition-panel"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Test isolation and recovery in the real adapter",
      "question": "Can missing context or a panel failure become a false pass?",
      "outcome": "Preserve unknown evidence and validate actual information flow.",
      "beats": [
        {
          "id": "checker-boundary-exercise",
          "role": "transfer",
          "title": "Inspect the request and test missing responses",
          "speech": "Place a sentinel only in maker history, then inspect the real outgoing request through a mock adapter. The sentinel should be absent while source identifiers and test receipts remain present. Insert instructions and fake logs inside the artifact and verify that the harness neither executes them nor treats them as authority. Test an empty panel, a missing response, one required failure among passes, and an inconclusive result. None should become successful acceptance under the required-checker policy. Mechanical tests need intact inputs, execution integrity, and real receipts; they do not need another model context merely to run. Reserve independent semantic review for the judgments that require it and retain every applicable check.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Audit history exclusion, evidence retention, and failure semantics"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "History sentinel",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "a sentinel only in maker history"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What did the actual request include?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "inspect the real outgoing request"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Source receipts",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "source identifiers and test receipts"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Injected data",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "instructions and fake logs"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Missing response",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "a missing response"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Mechanical checks need execution integrity, not another model observer",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Mechanical tests need intact inputs"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "checker-boundary-exercise"
        },
        {
          "id": "checker-recap",
          "role": "reflect",
          "title": "Independent review needs facts, limits, and calibration",
          "speech": "Separate acceptance review from the maker's persuasive history. Build an auditable packet containing the artifact, requirements, sources, callers, and actual receipts. Treat the artifact as untrusted and keep the checker's authority narrow. Measure correlated misses instead of assuming independent errors. Return located, prioritized findings and preserve required unknowns. Remember: separate, inform, restrict, calibrate, locate. Self-editing can improve a draft, while mechanical tests provide their own recorded evidence. Neither substitutes for required independent judgment. Discuss next: which factual context is missing from your checker? Which unsupported maker conclusion is still included? Next we will turn these checks into evaluations that measure complete outcomes across representative tasks.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Independent judgment requires an audited factual boundary"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Separate history",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Separate acceptance review"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Retain facts",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Build an auditable packet"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Measure errors",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Measure correlated misses"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: separate → inform → restrict → calibrate → locate",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: missing facts? Included self-assessment?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "checker-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "4751b3d474e5abd44ee5af7cd93deb49e513ae1154b0bb34bb654521e8eb94bf"
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
