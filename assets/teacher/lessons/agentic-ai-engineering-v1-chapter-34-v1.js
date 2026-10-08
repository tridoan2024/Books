(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-34",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Case Study — The Coding Loop",
  "subtitle": "Professor Mode · Causal repairs, discriminating checks, and honest delivery evidence",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-34/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-34/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 34, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "d23ac5665e147d1785ec9d1c0fcade96d0323618525e2536327978c8666283e9",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Define a verified coding outcome",
      "question": "What evidence distinguishes a repaired workflow from green output?",
      "outcome": "Write a concrete contract and identify its untested properties.",
      "beats": [
        {
          "id": "coding-stakes",
          "role": "orient",
          "title": "The test failure may describe a symptom rather than the defect",
          "speech": "A library migration leaking connections is our first case. In the chapter's fictional scenario, an authentication upgrade changes resource-lifecycle requirements. Repeated integration tests eventually time out as connections accumulate. Extending timeouts treats the visible symptom while leaving the application defect in place. An empty search result is our second case. A function returns no value where its API contract requires an empty list. A small runtime repair helps, but the declared interface still needs inspection against the intended contract. An empty test selection is our third case. A command exits successfully without executing the required tests, creating the appearance of verification without its evidence. These are illustrative engineering cases, not measured productivity results. Each requires evidence tied to the actual source revision and environment, because a convincing explanation alone cannot establish that the workflow is repaired. They connect through a common question: what evidence distinguishes a repaired workflow from green output? We will define the coding contract, establish a baseline, use discriminating checks, manage current context, and distinguish a tested patch from publication. By the end, you should be able to explain what changed, why it addresses the failure, which checks actually ran, and what remains uncertain without hiding useful completed work.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A repair needs a causal explanation and relevant evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Connection leak",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A library migration leaking connections"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Empty result contract",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "An empty search result"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Empty test selection",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "An empty test selection"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A successful command can still provide no relevant verification",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "without executing the required tests"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What distinguishes a repaired workflow from green output?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "what evidence distinguishes"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "coding-stakes"
        },
        {
          "id": "coding-contract",
          "role": "derive",
          "title": "Instantiate the contract for the requested change",
          "speech": "State the concrete goal, its acceptance checks, the available budget, stopping conditions, and the escalation path. For the migration, criteria include updated call sites, compatible types, relevant regression tests, and stable connection usage. Those criteria are independently inspectable, but no finite suite establishes every possible property. Separate functional behavior, resource lifecycle, security requirements, and publication authority. Use syntax, lint, and type checks where they discriminate, then appropriate runtime and integration evidence. They consume compute and maintenance even if no model tokens are billed. A model review can complement evidence on design questions, but should not replace an available deterministic check or invent a guarantee beyond its coverage.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Goal + checks + budget + stop + escalation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Concrete requirement",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "concrete goal"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Discriminating checks",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "acceptance checks"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Bounded execution",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "available budget"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A finite test suite covers specified properties, not complete correctness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "no finite suite establishes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which required behavior has no discriminating check yet?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Separate functional behavior"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "coding-contract"
        }
      ]
    },
    {
      "id": "diagnosis",
      "title": "Repair the cause using current evidence",
      "question": "Is the failure caused by the edit, the baseline, or the environment?",
      "outcome": "Use discriminating observations and a bounded next experiment.",
      "beats": [
        {
          "id": "coding-leak-diagnosis",
          "role": "worked-example",
          "title": "Observe the resource before changing the timeout",
          "speech": "Run the failing integration workflow against an isolated database fixture. Record connection usage before and after each operation under controlled conditions. If the count grows without returning to the expected baseline, inspect the new library's lifecycle requirements and the application wrapper. Compare that evidence with a real service outage or pre-existing fixture failure. A timeout alone does not distinguish those causes. Form a specific hypothesis about acquisition and release, make the smallest complete repair, and rerun the original reproducer. The added resource check is valuable because it distinguishes this defect class. Its success does not prove that every migration is safe or that changing the oracle always beats changing the model.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Observe lifecycle → inspect causal path → repair and reproduce"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Measure",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Record connection usage"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the connection count return to its expected baseline?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "expected baseline"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Diagnose",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "inspect the new library"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "inspect the new library"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Timeout is an observation; resource leakage is a hypothesis to test",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A timeout alone does not distinguish"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Repair",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "make the smallest complete repair"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "make the smallest complete repair"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "coding-leak-diagnosis"
        },
        {
          "id": "coding-baseline-retries",
          "role": "derive",
          "title": "A new failure is not automatically caused by the latest edit",
          "speech": "Read current source and identify the real entry point before editing. A similarly named test stub is not necessarily the production implementation. Establish whether the relevant test already fails on the baseline. Compare environment, dependencies, time, and external service availability before attributing a changed result to the patch. Repeated error signatures can prompt reassessment, but are not proof that repair is impossible. Continue only with a concrete next action that can change evidence, prerequisites, or strategy within the authorized budget. If no such action remains, preserve the patch and report the unresolved failure with useful diagnostic context rather than cycling through cosmetic changes.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Current source + baseline + environment → justified diagnosis"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Current source",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Read current source"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Baseline",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "already fails on the baseline"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Environment",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare environment"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A repeated signature prompts reassessment, not a proof of impossibility",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Repeated error signatures"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What evidence will the next attempt change?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "concrete next action"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "coding-baseline-retries"
        }
      ]
    },
    {
      "id": "verification",
      "title": "Protect and interpret the checks",
      "question": "Did the required tests actually run on this artifact?",
      "outcome": "Preserve regression intent and bind results to the tested revision.",
      "beats": [
        {
          "id": "coding-empty-result",
          "role": "worked-example",
          "title": "Runtime repair and interface review establish different facts",
          "speech": "Suppose a search function falls through when it finds nothing, returning no value instead of an empty list. Add the required return and run the original failing test, then relevant neighboring cases. Inspect its public annotation against the API requirement. An annotation allowing either a list or no value may still satisfy the type checker when implementation returns only lists. Narrowing that annotation is a contract-review requirement, not necessarily a compiler diagnostic. Record each check for what it actually establishes. Broaden validation when the affected callers or change risk justify it. A neat teaching trace should never invent a type error merely to make the verification story simpler.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Runtime requirement → targeted repair → interface contract review"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Return []",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "returning no value instead of an empty list"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Regression check",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "run the original failing test"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "run the original failing test"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Annotation review",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Inspect its public annotation"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Inspect its public annotation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A permissive return annotation need not cause a type-checker error",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "may still satisfy the type checker"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the public interface express the intended guarantee?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Narrowing that annotation"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "coding-empty-result"
        },
        {
          "id": "coding-test-evidence",
          "role": "derive",
          "title": "Preserve the requirement while changing tests",
          "speech": "Record the command, environment, exit status, discovered test count, skipped tests, and source revision. An empty suite or unavailable integration service is not a passing check of the workflow. The agent may legitimately add or repair tests, but removing an assertion or changing an expected result just to obtain green output weakens the evidence. Explain how each test change preserves the requirement. Run the original regression reproducer against the final implementation and relevant neighboring tests. Line coverage alone does not measure verified behavior: executed lines may have weak assertions. Inspect boundary cases, meaningful invariants, and known defect classes when deciding whether the evidence is sufficient.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Test evidence needs discovery, execution, assertions, and revision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Executed tests",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "discovered test count"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Requirement preserved",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "preserves the requirement"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Artifact identity",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "final implementation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Exit zero and line coverage alone do not establish the required behavior",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Line coverage alone"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Were meaningful assertions executed against this exact patch?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "meaningful invariants"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "coding-test-evidence"
        }
      ]
    },
    {
      "id": "context",
      "title": "Choose context and tools for the actual workflow",
      "question": "Does the visible editor state match the tested filesystem?",
      "outcome": "Manage discovery, snapshots, environment identity, and accumulated evidence.",
      "beats": [
        {
          "id": "coding-harness-context",
          "role": "explain",
          "title": "Context strategies have different freshness obligations",
          "speech": "On-demand source retrieval can keep context focused, but needs enough discovery to find callers, fixtures, and the actual implementation. An editor-integrated harness can use buffers and diagnostics, yet an unsaved buffer may differ from the files tested on disk. Record which environment and revision produced the diagnostic. A persistent remote worker can reuse dependencies and indexes, but retained state can become stale or cross task boundaries. Tag reusable data with relevant source and toolchain identity and isolate task authority. None of these interface choices proves a security boundary. Package installation and repository tests execute code and should run in controlled environments without unrelated production secrets.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Context strategy determines discovery and freshness obligations"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "On-demand reads",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "On-demand source retrieval"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Editor state",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "An editor-integrated harness"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The tested artifact must match the accepted working state",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "files tested on disk"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which buffer, source revision, and environment produced this evidence?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Record which environment"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Persistent worker",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A persistent remote worker"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "coding-harness-context"
        },
        {
          "id": "coding-context-economics",
          "role": "synthesize",
          "title": "Keep the task and useful evidence through long sessions",
          "speech": "Retain acceptance criteria, completed work, unresolved failures, and pointers to durable source evidence through compaction. A newer read can supersede current content while an older revision remains useful for explaining a regression. Replace bulky context with concise state and references rather than erasing the history needed for diagnosis. Evaluate the workflow by accepted changes, missed defects, reviewer effort, latency, and all-in cost. Cheap inference does not imply net savings when recovery or review dominates. Exploratory design can still benefit from bounded assistance, but its acceptance differs from a specified bug fix. Choose the automation boundary according to the task, including cases where the user's primary objective is learning.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Compact context while preserving the accepted task and evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Task criteria",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Retain acceptance criteria"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evidence pointers",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "pointers to durable source evidence"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "All-in value",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "all-in cost"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A small model bill is not proof of useful net savings",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Cheap inference does not imply net savings"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is the intended outcome a repair, design decision, or learning?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "primary objective is learning"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "coding-context-economics"
        }
      ]
    },
    {
      "id": "delivery",
      "title": "Finish the requested artifact and handle uncertainty",
      "question": "Does a tested patch establish publication or deployment?",
      "outcome": "Deliver compact evidence and reconcile authorized external effects.",
      "beats": [
        {
          "id": "coding-delivery-drill",
          "role": "transfer",
          "title": "A tested patch and a published artifact are separate states",
          "speech": "Deliver the artifact the task authorizes. Passing tests does not grant permission to merge or deploy. If publication is authorized and its request times out, reconcile the operation with repository state before trying again. Keep the tested patch and its actual evidence even while publication is unresolved. For a focused exercise, inject a pre-existing test failure, an empty test selection, and a lost response after mocked pull-request creation. The report should distinguish baseline failure from regression, reject the empty selection as verification, and preserve unknown publication state until evidence resolves it. That demonstrates useful completion behavior without pretending every dependency succeeded.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Tested patch → authorized publication → confirmed or unknown delivery"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Patch evidence",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Deliver the artifact"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Passing tests does not authorize merge or deployment",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Passing tests does not grant permission"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Publication authority",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "publication is authorized"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "publication is authorized"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "reconcile the operation"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "reconcile the operation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the patch remain useful while external delivery is unresolved?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Keep the tested patch"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "coding-delivery-drill"
        },
        {
          "id": "coding-recap",
          "role": "reflect",
          "title": "A coding loop earns trust through a reviewable repair",
          "speech": "Define the requested behavior and checks before interpreting success. Read current source, reproduce the failure, and distinguish baseline or environment problems from regressions. Make the smallest complete repair and preserve the requirement in its tests. Bind results to the actual artifact and environment. Manage context with durable evidence and stop retries that lack a useful next step. Separate verified local work from authorized external publication. Remember: read, reproduce, diagnose, repair, verify, deliver. Apply the sequence to one recent failed workflow. Discuss next: which green command ran no relevant tests? Which repeated timeout needs a better observation instead of a larger limit? Next we examine verification in research, where claims need source evidence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reviewable repair = causal change + relevant evidence + honest delivery state"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Bind results"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Delivery state",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Separate verified local work"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: read → reproduce → diagnose → repair → verify → deliver",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Cause",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "diagnose"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: empty green check? Undiagnosed timeout?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "coding-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "d8c0476bfe6884d6f921d50fadd799640be1b96c92d17b311921745e8fbf6aca"
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
