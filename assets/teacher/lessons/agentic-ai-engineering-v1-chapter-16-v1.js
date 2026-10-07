(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-16",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Planning and Replanning",
  "subtitle": "Professor Mode · Durable decisions, evidence, and bounded continuation",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-16/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-16/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 16, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "0054180e4db5b3ed2c25e4d54c5009ad63c047a23c4dcf0b01d8d5bd6656eafb",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Preserve decisions through interruption",
      "question": "What must survive when the conversation disappears?",
      "outcome": "Keep evidence and rationale alongside current work.",
      "beats": [
        {
          "id": "plan-stakes",
          "role": "orient",
          "title": "The migration remembers a status but forgets the reason",
          "speech": "A database migration is our first case. In Tomas's fictional migration loop, a backfill runs slowly, and the worker compares two index choices. A composite index improves the small test workload. Then a foreign key prevents the old table from being dropped. After context compaction, the summary says only that migration work is underway and performance has been resolved. The next worker tries the rejected index again and rediscovers the same dependency. A duplicate backfill is our second case. A plan says the data copy finished, but the process died before saving the database receipt. Trusting that checkbox or blindly repeating the copy could both be wrong. A small configuration correction is our third case. Writing a formal project plan could cost more than making and checking the clear change. These are illustrative situations, not measured production outcomes. Our governing question is: what must survive when the conversation disappears? We will build a durable record, order intent and verification, choose a useful planning horizon, and distinguish investigation from thrashing. By the end, you should be able to hand work to a fresh worker without losing valid evidence, repeating uncertain effects, or treating a revised plan as new permission.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A durable plan preserves reasons, evidence, and unresolved work"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Lost index choice",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A database migration"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A status summary can omit the information needed to continue",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "says only that migration work"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Uncertain backfill",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A duplicate backfill"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Small clear edit",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A small configuration correction"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What must survive a lost conversation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "plan-stakes"
        },
        {
          "id": "plan-durable-record",
          "role": "explain",
          "title": "A plan is a compact record of useful state",
          "speech": "Record the goal and current obligations, then preserve the decisions that change what should happen next. For the migration, keep the selected composite index, the rejected alternative, the test conditions, and the foreign-key dependency. Link the actual experiment result instead of claiming that a small test proves the production window will be met. Failed approaches need their reasons and the conditions that could justify revisiting them. A changed dataset or query can make an old result inapplicable. Put this record at a known durable location so a successor can find it. Durability preserves what was recorded; it does not make that information current or correct. The successor must check the referenced artifacts and relevant dependencies.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Goal, decisions, failed approaches, evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Goal",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Record the goal"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Decisions",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "preserve the decisions"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Failed attempts",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Failed approaches"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What changed since the original experiment?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A changed dataset"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Durability does not establish truth or freshness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not make that information current"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Evidence",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "referenced artifacts"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "plan-durable-record"
        }
      ]
    },
    {
      "id": "protocol",
      "title": "Record intent and reconcile outcomes",
      "question": "When is a completed checkbox justified?",
      "outcome": "Distinguish verified completion from an unresolved external effect.",
      "beats": [
        {
          "id": "plan-intent-outcome",
          "role": "derive",
          "title": "Completion follows verified outcome",
          "speech": "Before a consequential operation, record the intended action and its operation identity. Execute only within current authority. Afterward, verify the result and attach the receipt before marking the obligation complete. Keep what happened, what was learned, revised next steps, and abandoned approaches together. A final update before yielding helps a handoff, but it cannot remove the crash window between a remote effect and a local write. If a database transaction commits while the worker crashes, the local plan may still show work in progress. That mismatch requires reconciliation with the database. Neither the missing checkbox nor a confident narrative tells us whether the remote operation took effect.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Intent → execution → verification → recorded outcome"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Intent",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "record the intended action"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Execute",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Execute only"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Execute only"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Verify",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "verify the result"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "verify the result"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Record",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "marking the obligation complete"
            },
            {
              "action": "edge",
              "from": "n3",
              "to": "n4",
              "spokenCue": "marking the obligation complete"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A local write does not close the remote crash window",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot remove the crash window"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What evidence resolves a missing outcome?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "reconciliation with the database"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "plan-intent-outcome"
        },
        {
          "id": "plan-reconcile-backfill",
          "role": "worked-example",
          "title": "Recover the database state before dropping anything",
          "speech": "Suppose the backfill checkbox says complete but its transaction receipt is missing. Query the migration ledger using the operation identity, then validate the intended batch with row counts and relevant constraints. If the transaction committed, record reconciled completion with that evidence. If it did not commit, a retry can use the same operation identity under the database's actual retry contract. If the available records cannot establish either outcome, preserve the unresolved state and block the destructive table drop. Do not turn uncertainty into failure merely to justify another attempt. The plan should make the next evidence-gathering step obvious while preventing dependent work from consuming an unverified completion claim.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Missing receipt: query and validate before dependent work"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Committed",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "If the transaction committed"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Not committed",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "If it did not commit"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Unresolved",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "cannot establish either outcome"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Block the destructive step while its prerequisite is unresolved",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "block the destructive table drop"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would repeating this action duplicate an effect?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "justify another attempt"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "plan-reconcile-backfill"
        }
      ]
    },
    {
      "id": "horizon",
      "title": "Choose useful planning depth",
      "question": "How far can we plan without inventing the route?",
      "outcome": "Decompose by observable outcomes and current uncertainty.",
      "beats": [
        {
          "id": "plan-decomposition",
          "role": "derive",
          "title": "A useful step has an observable completion condition",
          "speech": "Implement the entire authentication system is too broad to locate progress or a failure. Open this file and move to a particular line is usually too detailed and becomes stale as code changes. A better step states an outcome, such as rejecting expired credentials through the actual request path, with an appropriate check. Model-call counts can be rough sizing hints, not acceptance rules. Complex but well-defined work can legitimately take longer. Decompose when doing so improves ownership, verification, or recovery. Collapse instructions that merely prescribe routine keystrokes. The useful boundary is a result another worker can assess, not an arbitrary number of tool calls or a maximum amount of prose.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Too broad, too mechanical, or verifiable"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Whole subsystem",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Implement the entire authentication system"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Keystrokes",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Open this file"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Observable result",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A better step states an outcome"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Decompose to improve ownership, verification, or recovery",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "improves ownership, verification, or recovery"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can another worker assess when this step is done?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "another worker can assess"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "plan-decomposition"
        },
        {
          "id": "plan-horizon",
          "role": "explain",
          "title": "Plan as far as the evidence makes useful",
          "speech": "For a clear defect, a short sequence can cover the repair and relevant regression checks. For an unexplained slowdown, plan the next measurement and the decision it will inform. Do not invent an implementation route before the profile reveals the bottleneck. A replan marker states where later work depends on findings. It is a commitment to revisit the route, not a license to keep rewriting indefinitely. A durable plan is worthwhile when interruption, handoff, coordination, or meaningful uncertainty makes it useful. A small reversible task does not need a separate document just because it involves several commands. Preserve enough state to support this task and spend the remaining effort delivering the outcome.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Planning horizon follows uncertainty"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Clear repair",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "For a clear defect"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Investigation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "For an unexplained slowdown"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Replan boundary",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A replan marker"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What finding determines the next branch?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "depends on findings"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A small reversible task need not produce a formal plan",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not need a separate document"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "plan-horizon"
        }
      ]
    },
    {
      "id": "progress",
      "title": "Separate learning from thrashing",
      "question": "Does a changed plan represent new information?",
      "outcome": "Use stable obligations and changed prerequisites to assess progress.",
      "beats": [
        {
          "id": "plan-stable-progress",
          "role": "derive",
          "title": "Count accepted obligations and new information separately",
          "speech": "Stable obligation identities let us compare progress across plan revisions. Splitting one step into five should not manufacture progress, and combining steps should not erase their accepted evidence. Completion percentage is therefore only a diagnostic hint. A legitimate investigation may have unchanged acceptance scores while eliminating three distinct hypotheses. That new information can narrow the route even before another requirement passes. Conversely, repeatedly running an unchanged command against an unchanged failed prerequisite provides little reason to expect a new result. Examine accepted obligations, eliminated hypotheses, changed inputs, and repeated actions together. A flat graph should prompt judgment about the situation, not automatically declare that the task has failed.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Progress includes evidence, learning, and relevant changes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Obligations",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Stable obligation identities"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Completion percentage is a diagnostic hint",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "only a diagnostic hint"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Learning",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "eliminating three distinct hypotheses"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Changed inputs",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "changed inputs"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Repetition",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "repeated actions"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did this attempt change what we know or can do?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "prompt judgment"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "plan-stable-progress"
        },
        {
          "id": "plan-thrash-response",
          "role": "check",
          "title": "A repeated failure needs a changed prerequisite",
          "speech": "When a worker returns to an abandoned approach, inspect the reason. A repaired dependency or a newly discovered constraint can justify revisiting it. A prettier plan without new evidence cannot. If continued work depends on unavailable information or authority, report the specific blocker, approaches tried, evidence for their failures, and best usable result. Preserve completed independent work. Budget planning itself so that endless rewrites do not consume the entire task. Reaching a planning limit should lead to a safe authorized evidence-gathering action or a blocker report. It must never force a consequential mutation merely to make the activity chart look productive. The objective remains the user's accepted outcome.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Repeated failure → inspect changed prerequisite → act or report"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Repeat",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "returns to an abandoned approach"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Inspect",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "inspect the reason"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "inspect the reason"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What now makes this attempt different?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "new evidence"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Decide",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "report the specific blocker"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "report the specific blocker"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Planning limits never force unsafe action",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "must never force a consequential mutation"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "plan-thrash-response"
        }
      ]
    },
    {
      "id": "ownership",
      "title": "Keep plans and dependencies current",
      "question": "Which revision may this worker publish?",
      "outcome": "Use enforced ownership and accepted artifact identities.",
      "beats": [
        {
          "id": "plan-atomic-revision",
          "role": "explain",
          "title": "Enforce ownership instead of merely writing a version number",
          "speech": "A compact plan record can carry its revision, goal revision, owner, input hashes, next action, and evidence references. Update it against the expected prior revision. If two writers both propose the next version from the same old state, only one should commit; the other must reload and reconcile. Plain Markdown does not provide that guarantee by itself. A transaction, lock, or orchestration service must enforce the concurrency rule. Single-writer files can remain simple when that assumption is real. Recheck ownership at dispatch and publication, because a worker holding an old assignment can otherwise publish after responsibility has moved. A stale writer must not overwrite current accepted state.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Expected revision → enforced update → current owner"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Expected revision",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "expected prior revision"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A version field alone is not concurrency control",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not provide that guarantee"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Enforcement",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "must enforce the concurrency rule"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "must enforce the concurrency rule"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Ownership",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Recheck ownership"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Recheck ownership"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can an old worker still publish after reassignment?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "holding an old assignment"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "plan-atomic-revision"
        },
        {
          "id": "plan-dependencies",
          "role": "worked-example",
          "title": "A dependent needs the accepted artifact identity",
          "speech": "Imagine a data worker producing a schema, an interface worker consuming it, and a frontend consuming the response format. Schema done is an insufficient handoff. Give the dependent the accepted producer artifact hash, its relevant contract, and evidence of acceptance. If the producer changes that artifact, invalidate affected downstream work explicitly. Preserve independent results whose inputs remain unchanged. Central coordination can help coupled work, while separate subplans suit work with stable interfaces. Neither organizational pattern automatically prevents stale publication. The concrete protection is checking the assignment and dependency identities before accepting an output. This lets the team reuse completed work without silently mixing artifacts from incompatible revisions.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Accepted schema → interface artifact → frontend artifact"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Schema",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a schema"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Interface",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "an interface worker"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "an interface worker"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Frontend",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a frontend"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "a frontend"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Pass accepted hashes and invalidate affected dependents",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "accepted producer artifact hash"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which downstream evidence depends on the changed input?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "invalidate affected downstream work"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "plan-dependencies"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Recover without repeating or resetting",
      "question": "What should the next worker do first?",
      "outcome": "Reuse valid evidence and preserve authority and cumulative limits.",
      "beats": [
        {
          "id": "plan-recovery-exercise",
          "role": "predict",
          "title": "What survives a fresh worker and a changed dependency?",
          "speech": "Pause and predict the recovery sequence. A fresh worker receives only the goal, plan path, and referenced evidence. It should identify the chosen composite index, the rejected alternative, and the foreign-key dependency without reconstructing the conversation. Now change one dependency. The worker should invalidate affected checks and preserve unrelated results. Next, give the progress monitor three eliminated hypotheses with flat completion scores. It should recognize useful investigation and request judgment where needed. Finally, replay the same failed command without any changed prerequisite. The worker should identify the repeated blocker and stop proposing the same retry. These exercises test continuity and evidence use, rather than merely checking that a plan file exists.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Test recovery, dependency changes, learning, and repetition"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Fresh worker",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "A fresh worker"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Dependency change",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "change one dependency"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which prior evidence still applies?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "preserve unrelated results"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "New information",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "three eliminated hypotheses"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Repeated blocker",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "the same failed command"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A plan file existing is weaker than successful continuity",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "test continuity and evidence use"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "plan-recovery-exercise"
        },
        {
          "id": "plan-recap",
          "role": "reflect",
          "title": "Plans preserve continuity without resetting the contract",
          "speech": "A durable plan records decisions, obligations, evidence, and the next useful action. Verified outcomes justify completion, while unresolved external effects require reconciliation. Choose steps with observable results and plan only as far as current evidence makes useful. Stable obligations prevent bookkeeping from masquerading as progress. New information can count as progress even when completion scores remain flat. Enforce revision and ownership checks where multiple workers can act, and pass accepted artifact identities across dependencies. A revised plan does not restore cancelled authority or reset consumed budget. Reuse valid work and match planning effort to the task. Remember: preserve, verify, reconcile, and reuse. Discuss next: which decision would your current handoff lose? Next we will examine the execution environment and the state that must survive when a worker fails.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Durable state → evidence → bounded continuation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Durable plan",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A durable plan"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Verified results",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Verified outcomes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Current authority",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "does not restore cancelled authority"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: preserve → verify → reconcile → reuse",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: which decision would your handoff lose?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "plan-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "881e97599faea333ff9d1cb14bbd158bcc18227109369225d32faad9b949c7bc"
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
