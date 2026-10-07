(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-08",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Context Engineering II — Compaction, Editing, and Handoff",
  "subtitle": "Professor Mode · preserved meaning, verifiable state, and authority across resets",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-08/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-08/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 8, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "17af1071c71e62ca7e67b54ad0407f96749b6312a4f21dd7e52c2e379794567e",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Carry the right obligations across a context boundary",
      "question": "What must survive so continuation remains correct and authorized?",
      "outcome": "Recognize omitted constraints, lost rationale, and collapsed nuance.",
      "beats": [
        {
          "id": "handoff-stakes",
          "role": "orient",
          "title": "A shorter history can lose the rule that still matters",
          "speech": "An endpoint migration is our first case. In Jenna's fictional healthcare application, older mobile clients require a metadata field in every response. A compaction summary records progress and failing tests but omits that compatibility constraint. Later endpoints pass incomplete tests and break older clients. A rejected locking design is our second case. The loop remembers its chosen alternative but forgets the latency reason for rejecting a global lock, so it repeats an already failed approach. An unusual API response is our third case. A summary preserves that success returns status two hundred, but loses the fact that a missing resource can return the same status with an empty body. All three failures lose a distinction that future work needs. The fictional incident does not prove an attention mechanism, and compaction does not leave the old token positions physically present in the shortened context. Our governing question is: what must survive so continuation remains correct and authorized? We will build a preservation inventory, distinguish editing from compaction, design a verifiable handoff, and test recovery at awkward boundaries. By the end, you should be able to resume useful work while recognizing stale evidence, unfinished checks, and uncertain external effects.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Lost distinctions can survive as confident mistakes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Compatibility constraint",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "An endpoint migration"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Rejection rationale",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A rejected locking design"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "API exception",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "An unusual API response"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A handoff must preserve distinctions future work needs",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a distinction that future work needs"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What must survive for correct, authorized continuation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "handoff-stakes"
        },
        {
          "id": "handoff-lossy-checkpoint",
          "role": "explain",
          "title": "A summary is a working aid, not the full record",
          "speech": "Compaction replaces a detailed history with a smaller representation. It necessarily leaves details out, and predicting every future need is difficult. Preserve the goal and acceptance criteria, decisions with their reasons, important discovered facts, current progress, remaining work, and active blockers. Keep locators for retrievable evidence rather than copying every tool result into the summary. Some facts can be re-read from a current file; others describe a past observation that may no longer be reproducible. Preserve the latter with their evidence and scope. A useful summary tells the next context what is known, what remains uncertain, and where to verify it. It should not make uncertain work look complete merely because a clean narrative is easier to write.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Preserve decisions, state, and paths to evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Goal and criteria",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the goal and acceptance criteria"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Decisions and reasons",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "decisions with their reasons"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Progress and gaps",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "current progress"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can this past observation actually be re-created?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "may no longer be reproducible"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A clean narrative cannot turn uncertainty into completion",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "make uncertain work look complete"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "handoff-lossy-checkpoint"
        }
      ]
    },
    {
      "id": "preserve",
      "title": "Make preservation explicit",
      "question": "Which facts and constraints cannot depend on a summary’s judgment?",
      "outcome": "Keep a structured inventory and evidence-backed decisions.",
      "beats": [
        {
          "id": "handoff-constraint-inventory",
          "role": "derive",
          "title": "Keep critical requirements outside relevance guessing",
          "speech": "The metadata requirement belongs in the task's structured constraint inventory and an independently enforced response-contract test. Repeating it in a handoff can help the model use it, but repetition cannot replace the test. The chapter's sample extractor recognizes bullets under certain headings. That is an illustrative parser, not complete instruction understanding. Nested conditions, tables, referenced policies, and scoped exceptions can escape it. Maintain explicit requirements with their source and applicability instead of guessing which prose looks mandatory. Preserve current user corrections and revocations from trusted state. A handoff should carry the existing authority into the next context accurately; it cannot create additional authority by declaring a proposed action approved.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Requirement inventory → handoff → contract check"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Structured inventory",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "structured constraint inventory"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Handoff reminder",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Repeating it in a handoff"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Repeating it in a handoff"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Enforced check",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "cannot replace the test"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "cannot replace the test"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Bullet extraction is not complete instruction parsing",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not complete instruction understanding"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which scoped exception would this parser miss?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "scoped exceptions can escape"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "handoff-constraint-inventory"
        },
        {
          "id": "handoff-rationale-nuance",
          "role": "worked-example",
          "title": "Record the reason and the condition under which it matters",
          "speech": "Do not write only that the loop chose optimistic locking. Record that the global lock was rejected because a measured latency regression violated the task requirement, and link the relevant result. State the conditions of that rejection so a future change can be evaluated deliberately. A failed approach is not forbidden forever when its prerequisite changes, but unchanged evidence is no reason to repeat it. For the unusual API, preserve both the status and the body condition. Link the tested version and the example response, and add a missing-resource check if that behavior affects correctness. These records protect meaning, not just keywords. A shorter summary that drops the exception can produce a confidently wrong implementation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reasons and exceptions carry operational meaning"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Rejected approach",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the global lock was rejected"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Failure condition",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "State the conditions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Changed prerequisites may justify reconsideration",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "when its prerequisite changes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "API nuance",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "both the status and the body condition"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which missing condition could reverse this conclusion?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "drops the exception"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "handoff-rationale-nuance"
        }
      ]
    },
    {
      "id": "working-set",
      "title": "Edit the working set without discarding needed evidence",
      "question": "When should we clear, compact, or begin a fresh context?",
      "outcome": "Choose by applicability, progress, and remaining capacity.",
      "beats": [
        {
          "id": "handoff-editing",
          "role": "explain",
          "title": "Clear by applicability, not age alone",
          "speech": "A stale file read can mislead after the file changes. A one-time search result can be cleared after its useful conclusion and source locator are preserved. A reference still needed for the current task may deserve to remain. Age is a convenient signal, but it does not establish that an item is irrelevant. Keep an explicit distinction between current reference evidence, resolved observations, and historical records. When clearing a tool result, preserve important behavioral nuances and any restriction on the searched region. Re-read changing evidence before depending on it. Continuous editing can delay the need for full compaction, but a policy that deletes every result after two iterations can remove a still-essential constraint. Adjust retention to the actual workflow and its retrieval costs.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Retention follows current use and recoverability"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Age alone does not establish irrelevance",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Age is a convenient signal"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Current reference",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "current reference evidence"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Resolved observation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "resolved observations"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Historical record",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "historical records"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What must be extracted before this result is cleared?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "preserve important behavioral nuances"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "handoff-editing-spoken-v2"
        },
        {
          "id": "handoff-strategy",
          "role": "predict",
          "title": "Choose the smallest intervention that restores useful context",
          "speech": "If the loop is making progress, editing stale material may restore enough capacity to continue. If the remaining history is still too large, a structured compaction can reduce it while preserving current obligations. If contradictory state is contributing to repeated failures, a fresh context with a verified handoff may help. A reset alone cannot fix a missing tool, unavailable source, or invalid assumption. Natural milestones can also support planned handoffs around verified artifacts. Choose thresholds from the model limits, expected result sizes, and time needed to publish state. The chapter's percentages are illustrative operating choices, not universal rules. Leave enough capacity to write and validate the handoff before a hard limit truncates it. Preserve useful completed work rather than restarting everything merely because the context changed.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Progress and capacity guide the intervention"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Edit",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "editing stale material"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Compact",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a structured compaction"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Fresh handoff",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a fresh context"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A reset cannot repair an unchanged missing prerequisite",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A reset alone cannot fix"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is the obstacle history, missing evidence, or capability?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "invalid assumption"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "handoff-strategy"
        }
      ]
    },
    {
      "id": "handoff",
      "title": "Resume from evidence rather than reassuring prose",
      "question": "What must the incoming context verify before acting?",
      "outcome": "Preserve task identity, authority, cumulative budget, and unresolved effects.",
      "beats": [
        {
          "id": "handoff-verify-state",
          "role": "worked-example",
          "title": "Verify the claims the next action will depend on",
          "speech": "The incoming context reads a handoff that says the patch is complete and tests are running. First identify the task and scope revision, then compare the referenced artifact digests and check receipts with the actual files. A receipt for an older patch cannot establish that the current patch passed. A test that started is still pending until its result is known. Reuse valid completed evidence when its artifact and environment still apply; do not repeat every check automatically. Investigate discrepancies before building on them. The handoff should identify remaining work, active processes, unresolved hypotheses, and the exact evidence locations. It is a navigation aid into the real state, not a replacement for that state. Verification should be proportionate to what the next action requires.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Handoff claim → artifact identity → applicable receipt"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Claim",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a handoff that says"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Artifact identity",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the referenced artifact digests"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "the referenced artifact digests"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Check receipt",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "and check receipts"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "and check receipts"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Started is pending; an old receipt does not cover new work",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A test that started is still pending"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which claim does the next action actually depend on?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "what the next action requires"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "handoff-verify-state"
        },
        {
          "id": "handoff-authority-budget",
          "role": "derive",
          "title": "A fresh context is not a fresh permission or spending limit",
          "speech": "Carry the current authority information separately from a freely rewritten summary. If the user revoked an approval, the new context must see that revocation before dispatching work. Preserve cumulative spending and remaining limits; a new session does not reset the task budget. Preserve worker generation and ownership so an obsolete worker cannot keep writing after responsibility changes. Also list external operations with unknown outcomes. A request with a lost response may already have taken effect. Reconcile that operation through its stable identity and the system's evidence before deciding whether to retry. The summary cannot turn an uncertain write into a safe new write. Correct continuation means keeping useful progress while stopping only the action whose prerequisite, authority, or outcome remains unresolved.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Continuation retains limits and unresolved effects"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Current authority",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "current authority information"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Cumulative budget",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "cumulative spending"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A fresh session does not reset permissions or budget",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not reset the task budget"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Worker ownership",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "worker generation and ownership"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Unknown effects",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "external operations with unknown outcomes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could this timed-out operation already have happened?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "may already have taken effect"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "handoff-authority-budget-spoken-v2"
        }
      ]
    },
    {
      "id": "durability",
      "title": "Publish state that cannot be silently replaced",
      "question": "How does durable state remain current and trustworthy?",
      "outcome": "Use bounded state, versioned publication, and applicable receipts.",
      "beats": [
        {
          "id": "handoff-durable-state",
          "role": "explain",
          "title": "Disk preserves state but does not make it true",
          "speech": "Store a bounded current-state document with the goal, progress, constraints, decisions, and remaining work. Keep detailed artifacts and history in separate records that can be retrieved as needed. Each step loads the state and relevant evidence, performs its work, and publishes an updated state. This reduces dependence on an ever-growing conversation, but a stale file or inaccurate summary can still mislead the next step. Validate freshness and applicability before reuse. Do not allow the state document to accumulate every observation until loading it recreates the original context problem. Keep source locators, revisions, and uncertainty where they affect future decisions. Persistent storage supplies continuity; correctness comes from applicable evidence and disciplined updates.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Bounded state → current work → updated state"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Load state",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Each step loads the state"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Do work",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "performs its work"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "performs its work"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Publish state",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "publishes an updated state"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "publishes an updated state"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Persistent storage does not make stale claims true",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a stale file or inaccurate summary"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is this current state or an unbounded history dump?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "accumulate every observation"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "handoff-durable-state"
        },
        {
          "id": "handoff-atomic-publication",
          "role": "worked-example",
          "title": "Publish a complete version and reject stale writers",
          "speech": "Suppose one worker writes a handoff while another reads it. A partial file can expose a progress claim without its missing-evidence warning. Write a complete candidate first, validate its structure and referenced artifacts, and publish a versioned pointer atomically. Use a conditional update so an older writer cannot replace a newer state. The exact storage mechanism depends on the system, but the required behavior is clear: readers see a complete version, and stale writers lose the update race. A content hash identifies bytes; it does not prove those bytes are correct. Bind each check receipt to the artifact it actually examined and preserve the relevant environment. Publication integrity and semantic correctness are separate requirements, and a useful handoff needs both.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Complete candidate → validation → conditional publication"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Candidate",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Write a complete candidate"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Validate",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "validate its structure"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "validate its structure"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Publish",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "publish a versioned pointer"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "publish a versioned pointer"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can an obsolete writer replace a newer state?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "an older writer cannot replace"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A hash identifies bytes; evidence supports correctness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A content hash identifies bytes"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "handoff-atomic-publication"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Test a reset at the inconvenient moments",
      "question": "Can the next context continue without repeating an uncertain effect?",
      "outcome": "Exercise stale checks, unfinished tests, remote timeouts, and revocation.",
      "beats": [
        {
          "id": "handoff-reset-exercise",
          "role": "transfer",
          "title": "Reset the context at four awkward boundaries",
          "speech": "First reset after a file edit. The new context must recognize that a receipt for the old revision is stale. Next reset after a test starts but before it completes. The new context should collect the real outcome or report it pending, not declare success. Then reset after a remote write times out. Require reconciliation of the existing operation before any retry decision. Finally revoke approval during handoff and verify that the incoming context uses the current authority record. In every case, preserve completed work whose evidence still applies. A successful reset exercise does not need to rerun the whole task. It must continue accurately, retain cumulative limits, and refuse only the continuation that lacks a necessary condition. Record what each test establishes and which remote failure modes remain untested.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A handoff must survive inconvenient timing"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "File edit",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "after a file edit"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Test pending",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "after a test starts"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Write timeout",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "after a remote write times out"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Revocation",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Finally revoke approval"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did the new context invent success or new permission?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "uses the current authority record"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Reuse valid progress; reconcile the unresolved action",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "preserve completed work"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "handoff-reset-exercise"
        },
        {
          "id": "handoff-recap",
          "role": "reflect",
          "title": "Preserve meaning, verify state, retain authority",
          "speech": "Preserve critical constraints, rejection reasons, and scoped exceptions. Keep current context applicable; age alone does not prove irrelevance. Ground handoff claims in applicable artifacts and receipts. Retain current authority, cumulative budget, and unknown external effects. Publish each complete state under an explicit revision and reject obsolete writers. Those are five durable principles. Remember: preserve, verify, retain, reconcile, publish. A concise summary helps continuation only when its meaning and evidence survive. Discuss next: which quiet constraint could your summary omit because it was never violated? Which operation would be dangerous to repeat when a response is lost? Apply the method to one handoff with an explicit pending-test state, a revision-bound receipt, current authority information, and a record of any unknown external operation. Then test a reset before trusting the procedure on a consequential task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Continue from applicable evidence and current authority"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Preserve meaning",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve critical constraints"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Verify state",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Ground handoff claims"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Retain authority",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Retain current authority"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: preserve → verify → retain → reconcile → publish",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: quiet constraint? Uncertain remote effect?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "handoff-recap-spoken-v2"
        }
      ]
    }
  ],
  "narrationSHA256": "e5bf8d6b388a8916f6b57f7f903a9e0b9f4f67b319f8ee10fafbb73a39766f9c"
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
