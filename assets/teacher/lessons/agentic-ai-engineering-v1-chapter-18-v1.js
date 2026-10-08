(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-18",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "The Stop Problem",
  "subtitle": "Professor Mode · Admission limits, progress signals, and honest outcomes",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-18/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-18/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 18, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "3f8ddd8ee56f412a4c49fcc4ea0c011c75d26e67019817741870a2ee86c1f5e6",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Make continued work justify its cost",
      "question": "What evidence makes another attempt worthwhile?",
      "outcome": "Separate hard limits from judgments about progress.",
      "beats": [
        {
          "id": "stop-stakes",
          "role": "orient",
          "title": "A busy loop can produce no additional value",
          "speech": "An overnight review loop is our first case. In Javier's fictional incident, a large migration introduces the same style issue across many files. The loop enumerates it, fills the conversation, loses the enumeration during compaction, and starts again. An overnight bill grows while little usable work is added. An investigation is our second case. Three experiments have the same low acceptance score, yet each eliminates a different explanation for a slowdown. Stopping solely because the score is flat could discard useful learning. A canceled deployment is our third case. The latest tests pass, but the user withdrew permission while a remote request may already be in flight. A high score cannot erase that cancellation or establish what the receiver did. These are illustrative cases, not measurements of a particular deployed product. Our governing question is: what evidence makes another attempt worthwhile? We will separate hard limits from progress signals, admit actions before spending, recognize cycles, preserve useful partial results, and define valid resumption. By the end, you should be able to stop a loop with an honest explanation of what was achieved, why execution ended, and what specific change could make further work useful.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Runaway repetition, useful exploration, and cancellation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Repeated enumeration",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "An overnight review loop"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Activity and score alone do not establish useful progress",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "little usable work is added"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "New hypotheses",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "An investigation"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Cancelled effect",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A canceled deployment"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What evidence justifies another attempt?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "stop-stakes-spoken-v2"
        },
        {
          "id": "stop-five-reasons",
          "role": "explain",
          "title": "Termination reason and artifact quality are separate",
          "speech": "Success means applicable acceptance evidence supports the required outcome. Budget exhaustion means the allowance ended, not that the task is impossible. No progress is a judgment about the value of continuing with current evidence and strategy. Oscillation is a return through conflicting states or actions. An external signal can be cancellation, changed data, unavailable authority, or an infrastructure failure. Preserve the specific reason rather than merging every event into a generic stop. A useful artifact can survive a budget stop, and a passing test can coexist with an execution violation. Neither fact automatically authorizes publication. Delivery follows the user's current authority and the actual acceptance requirements.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Classify why execution ended"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Success or budget",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Success means"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "No progress",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "No progress is"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Oscillation",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Oscillation is"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "External signal",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "An external signal"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What original cause must the final report preserve?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Preserve the specific reason"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Useful output and compliant execution are separate facts",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A useful artifact can survive"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "stop-five-reasons"
        }
      ]
    },
    {
      "id": "admission",
      "title": "Enforce limits before dispatch",
      "question": "Can this action fit inside the remaining allowance?",
      "outcome": "Reserve resources and preserve cancellation and error causes.",
      "beats": [
        {
          "id": "stop-reservations",
          "role": "derive",
          "title": "Check admission before spending the next allowance",
          "speech": "Before dispatch, check cancellation, current authority, and required prerequisites. Reserve bounded tokens, cost, concurrency, and time for the proposed action. Concurrent workers need shared atomic accounting so they cannot each spend the same remaining allowance. If admission fails, preserve the current result and record the resource stop. After observation, reconcile the reservation with actual usage, including retries, tool fees, and verification. An estimate alone cannot guarantee a hard ceiling when a provider can exceed it; use supported request limits and state any remaining exposure. A post-iteration counter detects overspend only after it occurred. The execution adapter must enforce deadlines and propagate cancellation to owned work.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Current authority → resource reservation → dispatch → reconcile"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Authority",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "check cancellation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Reserve",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Reserve bounded tokens"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Reserve bounded tokens"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Dispatch",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "the proposed action"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "the proposed action"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can concurrent workers oversubscribe the remaining budget?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the same remaining allowance"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Reconcile",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "After observation"
            },
            {
              "action": "edge",
              "from": "n3",
              "to": "n4",
              "spokenCue": "After observation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Post-action checks can only observe money already spent",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "only after it occurred"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "stop-reservations"
        },
        {
          "id": "stop-four-ceilings",
          "role": "worked-example",
          "title": "Different ceilings catch different abnormal behavior",
          "speech": "An iteration limit bounds completed cycles, but it misses a hanging tool inside one cycle. A token limit catches expanding context. A financial limit includes the actual token mix and billable tools. A deadline catches waiting, deadlocks, and internal retries that do not advance the iteration counter. Consider an illustrative allowance of ten iterations, half a million tokens, and five minutes. Each cycle takes thirty-five seconds and uses forty-five thousand tokens. Under these assumptions, eight complete iterations take two hundred eighty seconds. Iteration number nine will not fit the deadline. The time boundary therefore limits execution first under those assumptions. A much larger context could reach the token boundary first instead. Calculate the interaction and enforce it at admission.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Example: 10 iterations; 500k tokens; 300 seconds"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Iterations",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "An iteration limit"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Tokens",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "A token limit"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Money",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "A financial limit"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Time",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "A deadline"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "At 45k tokens and 35s per iteration, only 8 full cycles fit",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "eight complete iterations"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which abnormal condition makes a different ceiling bind?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "much larger context"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "stop-four-ceilings-spoken-v2"
        }
      ]
    },
    {
      "id": "signals",
      "title": "Distinguish cycles from useful investigation",
      "question": "Are repeated scores hiding different evidence?",
      "outcome": "Evaluate relevant state, actions, and new information.",
      "beats": [
        {
          "id": "stop-oscillation",
          "role": "derive",
          "title": "Recognize repeated decisions, not merely similar text",
          "speech": "A worker adds a null check, breaks valid empty-string handling, removes the check, and restores the original failure. That action sequence reveals a cycle and a mistaken attempt to satisfy two distinct requirements with one coarse condition. Compare decision-relevant state and structured actions across iterations. Ignore timestamps and incidental log differences, but do not let large unchanged boilerplate hide meaningful small edits. A string similarity score is not a measure of semantic sameness. Include a stable accepted artifact as a negative control: unchanged finished work is not oscillation. Stop the repeated repair pattern, preserve both failing conditions, and seek an approach that distinguishes null from a valid empty value.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Add check → break valid value → remove check → original failure"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Add",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "adds a null check"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Break",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "breaks valid empty-string handling"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "breaks valid empty-string handling"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Remove",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "removes the check"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "removes the check"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Repeat",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "restores the original failure"
            },
            {
              "action": "edge",
              "from": "n3",
              "to": "n4",
              "spokenCue": "restores the original failure"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which conflicting requirements need to be considered together?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "two distinct requirements"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Similar text alone does not prove a behavioral cycle",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not a measure of semantic sameness"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "stop-oscillation"
        },
        {
          "id": "stop-plateau",
          "role": "check",
          "title": "Flat scores can accompany useful new knowledge",
          "speech": "Three low scores may describe a stalled repair or three informative experiments. Examine the hypotheses tested, observations gained, and remaining uncertainty. Diverse wording alone is not diverse investigation. A new measurement that rules out storage latency can justify the next bounded experiment even before the acceptance score rises. Repeating an unchanged command against the same unavailable dependency offers a different signal. Score trends can help estimate marginal value, but an ordinal rubric does not necessarily support linear extrapolation. Do not announce that a task is impossible because a fitted line is nearly flat. Set a task-specific exploration allowance and explain what new evidence would justify using it.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Combine scores with evidence and action history"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Scores",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Three low scores"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "New knowledge",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "observations gained"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What uncertainty did this experiment actually reduce?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "remaining uncertainty"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Repetition",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Repeating an unchanged command"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A plateau is a decision signal, not proof of impossibility",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Do not announce that a task is impossible"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "stop-plateau"
        }
      ]
    },
    {
      "id": "report",
      "title": "Stop without hiding usable work or failures",
      "question": "What exactly succeeded, failed, or remains unknown?",
      "outcome": "Return outcome quality and execution status separately.",
      "beats": [
        {
          "id": "stop-honest-report",
          "role": "derive",
          "title": "Report the original failure alongside usable output",
          "speech": "The final report should identify the requested outcome, accepted result, unresolved obligations, original termination reason, evidence, and next useful step. Suppose a read-only analysis is complete but an optional metrics export times out. Deliver the analysis and state that supplementary gap. Restarting the whole task would discard valid work. Now suppose a required repository fetch fails authentication. Preserve the authentication error and explain which required evidence is unavailable. Calling it merely verification pending hides the cause. Finally, if cancellation arrives during a mutation, record cancellation and any unknown receiver outcome. Do not relabel the run successful because the most recent quality score was high.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Keep quality, execution status, and original cause"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Usable result",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "accepted result"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Unresolved work",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "unresolved obligations"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Original cause",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "original termination reason"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An optional failure need not erase completed useful work",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Deliver the analysis"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would a generic status hide a required failed check?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "hides the cause"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "stop-honest-report"
        },
        {
          "id": "stop-best-so-far",
          "role": "explain",
          "title": "Partial output needs its failed criteria attached",
          "speech": "Retain the best usable artifact and its evidence through unsuccessful attempts. A rubric value below the target does not identify a known-correct percentage of the output. A reviewer needs the failed criteria and uncertain claims, not a reassuring average. A draft can reduce work when the workflow permits delivery, but it must not bypass a mandatory safety or acceptance requirement. Explain what was tried, why it failed, and which change could make the next attempt different. Preserve original diagnostics and the history of costs. This allows a person or authorized successor to continue from useful knowledge instead of reproducing the whole investigation. The partial artifact and the unresolved contract should both remain visible.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Useful partial work travels with evidence and explicit gaps"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Artifact",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "best usable artifact"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A rubric score is not a known-correct fraction",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not identify a known-correct percentage"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Failed criteria",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the failed criteria"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Next change",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "which change could make"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the recipient see what still prevents acceptance?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "unresolved contract"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "stop-best-so-far"
        }
      ]
    },
    {
      "id": "calibrate",
      "title": "Tune limits and test their interactions",
      "question": "Which ceiling actually binds for this task?",
      "outcome": "Use representative data and controlled failure tests.",
      "beats": [
        {
          "id": "stop-calibration",
          "role": "explain",
          "title": "Calibrate on representative successes and failures",
          "speech": "Start with an affordable bounded pilot and record when tasks succeed, stop, or remain unresolved. Include failed cases and shifts in task mix. A percentile computed only from successful runs does not predict the chance of success on future traffic. Revisit limits after model, prompt, tool, or workload changes. Calibrate cycle detection using genuine cycles, stable accepted outputs, and meaningful small edits in large files. Test admission at exact boundaries and with concurrent reservations. Include usage above estimates and a tool that hangs before completing an iteration. These cases expose different gaps. There is no universal window size or similarity threshold that replaces evidence from the actual task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Representative pilot → failure controls → calibrated policy"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Pilot",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "an affordable bounded pilot"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Success-only percentiles omit failed cases and distribution shifts",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "only from successful runs"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Controls",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "genuine cycles"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "genuine cycles"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can one hanging call evade every completed-iteration counter?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "hangs before completing an iteration"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Policy",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "actual task"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "actual task"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "stop-calibration"
        },
        {
          "id": "stop-deadlock",
          "role": "worked-example",
          "title": "A declared dependency graph is only part of waiting",
          "speech": "A data worker waits for interface tests while the interface worker waits for the data schema. That is a cycle in declared dependencies. Resolve the contract or provide an explicitly provisional starting artifact with appropriate authority, then verify it before acceptance. A directed acyclic task graph excludes cycles in that declared graph. It does not exclude a shared lock held by a crashed worker, an undeclared resource dependency, or an unavailable service. Observe actual wait reasons and use suitable deadlines. Do not invent a production default just to break a dependency cycle. A provisional artifact remains provisional until the required integration evidence supports it.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Declared cycles and runtime waits need different checks"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Dependency cycle",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a cycle in declared dependencies"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An acyclic task graph does not prevent every deadlock",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not exclude"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Resource wait",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a shared lock"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What resource or accepted artifact is each worker waiting for?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "actual wait reasons"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Bounded resolution",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "suitable deadlines"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "stop-deadlock"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Design honest stopping and resumption",
      "question": "What changed that permits the work to continue?",
      "outcome": "Resume only on a meaningful change and preserve prior state.",
      "beats": [
        {
          "id": "stop-resume-exercise",
          "role": "transfer",
          "title": "A repeated status message is not a changed prerequisite",
          "speech": "Give a disposable loop a mocked tool that always returns the same error. Verify bounded calls, preservation of the original cause, and a truthful incomplete result. Then change the missing prerequisite and verify that an authorized retry can proceed without erasing previous attempts or costs. Add cancellation while a fake remote operation is in flight. Local execution should stop, and the effect should remain unknown until receiver evidence resolves it. For a real pending job, bounded polling can be useful when there is an expected completion signal. Re-reading a missing report indefinitely does not change the situation. Record the last observed dependency revision so unchanged feedback is not mistaken for progress.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Repeated failure → changed prerequisite → authorized continuation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Failure",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "always returns the same error"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Change",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "change the missing prerequisite"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "change the missing prerequisite"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Continue",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "an authorized retry"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "an authorized retry"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A status update does not itself unblock the task",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not change the situation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What new evidence or authority actually permits resumption?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "last observed dependency revision"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "stop-resume-exercise"
        },
        {
          "id": "stop-recap",
          "role": "reflect",
          "title": "Stop honestly and resume for a reason",
          "speech": "Treat hard limits and calibrated progress judgments as separate decisions. Admit actions before spending begins. After execution, reconcile actual use. Detect cycles using relevant decisions and state. Recognize learning from an investigation even when scores remain flat. Preserve artifact quality, execution status, original errors, and unresolved effects separately. Tune the policy with representative cases and test its real failure boundaries. Remember: enforce admission, observe progress, distinguish outcomes, preserve evidence, and explain the decision. Cancellation controls further dispatch and publication; a high score cannot restore permission. Discuss next: which current retry repeats without any change to its prerequisites? What valuable result could disappear behind a generic failure label? An effective stopping policy gives its successor the evidence and a concrete path for continuation instead of resetting the task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Bound exposure and preserve an honest continuation path"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Admission",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Admit actions"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Progress judgment",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Detect cycles"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Honest result",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve artifact quality"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: admit → observe → distinguish → preserve → explain",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: unchanged retry? Hidden useful result?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "stop-recap-spoken-v4"
        }
      ]
    }
  ],
  "narrationSHA256": "69af09cd6c9669538bca5d57ea01fdf2daaf70218c1b08d2329c546d756e1216"
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
