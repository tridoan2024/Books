(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-07",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Context Engineering I — The Window Is a Budget",
  "subtitle": "Professor Mode · sufficient evidence, reserved capacity, and visible retrieval coverage",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-07/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-07/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 7, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "6b0d28328b4495c45c4126a5e1e296b7e4c75f9366b31cb9d9ac2d8dc950c003",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Give the current decision the evidence it needs",
      "question": "How do we reduce noise without hiding a necessary fact?",
      "outcome": "Recognize stale context, missing coverage, and uncontrolled growth.",
      "beats": [
        {
          "id": "context-budget-stakes",
          "role": "orient",
          "title": "A full window can still omit the decisive fact",
          "speech": "A dependency upgrade is our first case. In Ravi's fictional coding loop, tool definitions and large file reads fill much of the context before the first change. Later iterations retain old file contents and superseded plans. The model begins repeating work and referring to defects already repaired. A compatibility exception is our second case. A focused retriever supplies the new API documentation but omits a compatibility requirement for older clients, so a seemingly correct update breaks them. A large log search is our third case. Returning every line can bury the relevant event, while returning only a conclusion can hide the search limit that made it incomplete. These cases show both sides of context design: too much content and missing evidence can each undermine a decision. These scenarios illustrate the design problem. They are not verified measurements of cost or model performance. Our governing question is: how do we reduce noise without hiding a necessary fact? By the end, you should be able to allocate a context budget, preserve freshness and coverage, choose a retrieval strategy, and evaluate the resulting decisions. We are aiming for sufficient evidence for the current task, with a reliable path to retrieve more when needed.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Too much history and too little coverage can both fail"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Upgrade loop",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A dependency upgrade"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Old-client exception",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A compatibility exception"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Large log search",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A large log search"
            },
            {
              "action": "note",
              "id": "question",
              "text": "How do we reduce noise without hiding a necessary fact?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Sufficient current evidence, with a path to retrieve more",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "sufficient evidence for the current task"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "context-budget-stakes-spoken-v2"
        },
        {
          "id": "context-budget-signal",
          "role": "explain",
          "title": "The useful unit is a decision-supporting set",
          "speech": "Start with the decision the model must make now. An authentication file by itself may not expose the bug. The file, a failing assertion, and the relevant stack trace together may explain the cause. Context value depends on the combination, not only on individual similarity scores. Ask what would become harder or incorrect if an item were removed. Test that question on representative cases when the answer is uncertain. An item that is not cited may still supply an essential constraint, so citation count alone cannot establish irrelevance. The objective is not the shortest possible prompt. It is a sufficient set of applicable evidence that fits the budget, plus explicit knowledge of what remains missing or available for follow-up.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Evidence works in combinations"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Source file",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "An authentication file"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Failing assertion",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a failing assertion"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Stack trace",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "the relevant stack trace"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What breaks if this item is removed?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "if an item were removed"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Uncited content is not automatically irrelevant",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not cited may still supply"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "context-budget-signal"
        }
      ]
    },
    {
      "id": "budget",
      "title": "Reserve capacity before admitting content",
      "question": "What must fit alongside the files we want to read?",
      "outcome": "Account for stable content, working evidence, generation, and expansion.",
      "beats": [
        {
          "id": "context-budget-allocation",
          "role": "derive",
          "title": "The working files are only one part of the budget",
          "speech": "Account for stable instructions and the task contract first. Count active tool definitions, current state, and working evidence. Reserve capacity for the response and for expected tool-result expansion. Keep a margin for estimation error. Use the actual model and API accounting rules, including any relationship between reasoning and output limits. The chapter's illustrative allocation totals 75,500 tokens inside a 200,000-token window, leaving 124,500 unallocated. That calculation demonstrates reserved capacity; it is not a recommended ratio for every system. A large unexpected result can consume the reserve quickly. Admission rules should decide whether to retrieve a bounded slice, summarize with source links, or defer the call. Validate input ranges as well as the total; a negative allocation must not create imaginary free capacity.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Stable content → working evidence → response reserve"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Stable content",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "stable instructions"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Working evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "and working evidence"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "and working evidence"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Response reserve",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Reserve capacity for the response"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Reserve capacity for the response"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Illustrative: 75,500 allocated; 124,500 unallocated",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "totals 75,500 tokens"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the largest expected result fit safely?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A large unexpected result"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "context-budget-allocation"
        },
        {
          "id": "context-budget-billing",
          "role": "worked-example",
          "title": "A cached token still occupies context",
          "speech": "Two designs can send the same content while paying different input charges because one uses a provider discount for repeated input. That changes the price of inference, not necessarily the information the model receives. Account separately for new input, storage of reusable content, reuse of that content, and generated output when the API exposes those charges. Also measure latency, total task cost, and outcome quality. A lower payment does not prove that context composition improved. Conversely, a slightly larger prompt may avoid repeated retrieval and improve a difficult decision. Measure those tradeoffs on the actual workflow using its own provider contract. The budget has both a capacity constraint and an economic purpose. Keep them separate enough that an accounting discount cannot hide a context overflow or a missing prerequisite.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Capacity, billed cost, and task value differ"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Content received",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the same content"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Billed charges",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "different input charges"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Caching can change price without shrinking context",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "changes the price of inference"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Task outcome",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "outcome quality"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did cost fall while evidence and quality stayed adequate?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "those tradeoffs on the actual workflow"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "context-budget-billing-spoken-v2"
        }
      ]
    },
    {
      "id": "freshness",
      "title": "Keep old evidence from impersonating current state",
      "question": "When does once-useful context become misleading?",
      "outcome": "Track revisions and distinguish current decisions from history.",
      "beats": [
        {
          "id": "context-budget-rot",
          "role": "worked-example",
          "title": "Old file contents can become false current evidence",
          "speech": "At the start of a repair, a failing test and the old source are useful evidence. After the patch, those same results describe a previous revision. If they remain beside a newer result without clear identity, the model may work on a failure that no longer exists. Superseded plans can create the same confusion. Preserve the historical record outside the active working set, and present the current artifact, decision, and unresolved issue clearly. A summary should retain source locators and scope so important details can be rechecked. Do not delete a still-relevant failure merely because it is old. Freshness means applicability to the current decision, not simply recency. If an artifact changes, determine which prior conclusions need revalidation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Old source → patch → current evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Old revision",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the old source"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Patch",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "After the patch"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "After the patch"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Current state",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "the current artifact"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "the current artifact"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Freshness means current applicability",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Freshness means applicability"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which earlier conclusions did this change invalidate?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "which prior conclusions need revalidation"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "context-budget-rot"
        },
        {
          "id": "context-budget-position",
          "role": "predict",
          "title": "Placement is a hypothesis, not an enforcement boundary",
          "speech": "A constraint placed near the latest instruction may be followed more consistently in a particular experiment. That does not establish a universal high-attention zone for every model, task, and prompt length. Test placement while holding the cases and other content stable. Keep the task's active constraints and current state easy to identify. Separate trusted instructions from retrieved documents that may contain conflicting requests. Enforce consequential permissions in the host or tool that can execute the action. Repeating a prohibition in a prominent paragraph cannot substitute for that control. Position experiments can improve usability of the supplied context; they cannot grant or revoke authority by changing a token coordinate. Evaluate observed compliance alongside the required external enforcement.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Placement can aid use; the host enforces permissions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Placement test",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Test placement"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Instruction roles",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Separate trusted instructions"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Host enforcement",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Enforce consequential permissions"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What still prevents the action if the text is ignored?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "cannot substitute for that control"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "No universal safe token coordinate",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a token coordinate"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "context-budget-position"
        }
      ]
    },
    {
      "id": "retrieval",
      "title": "Combine stable context with directed discovery",
      "question": "What should be loaded now, and what should remain retrievable?",
      "outcome": "Balance discovery cost, adaptation, and missed prerequisites.",
      "beats": [
        {
          "id": "context-budget-retrieval",
          "role": "explain",
          "title": "Preload stable essentials and retrieve changing evidence",
          "speech": "A small stable set that every run needs is a reasonable preload. Task-directed retrieval helps when the next information need depends on what the model discovers. A bug first described as authentication may turn out to involve session serialization, changing the useful search. These strategies can be combined. Keep essential constraints and source maps available, then retrieve current evidence for the decision at hand. Model-directed search can miss a dependency it does not know to ask about. Deterministic expansion to callers, tests, and applicable constraints can supply coverage that semantic similarity misses. Retrieval also adds latency and can fail. Compare the complete designs on the same cases. Neither preloading nor on-demand discovery automatically guarantees freshness, relevance, or truth.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Combine known essentials with adaptive discovery"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Stable preload",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A small stable set"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Directed retrieval",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Task-directed retrieval"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which dependency will the model not know to ask for?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "does not know to ask about"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Dependency expansion",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Deterministic expansion"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Retrieval strategy does not guarantee truth",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "automatically guarantees freshness"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "context-budget-retrieval"
        },
        {
          "id": "context-budget-tool-discovery",
          "role": "worked-example",
          "title": "Discover tools without making critical capabilities invisible",
          "speech": "Tool schemas occupy context too. Discovering a small relevant set can reduce upfront content, but a poor search query may hide the tool needed to finish correctly. Make indispensable capabilities reliably discoverable or explicitly available in the base set. Measure actual schema sizes instead of repeating the chapter's unverified vendor figures. For large data results, a program can filter or aggregate outside the model context and return a bounded result. Retain the source query, coverage limits, and enough evidence to audit that result. A computed conclusion can be wrong if the code or input selection is wrong. Reducing raw data in the prompt moves responsibility to the computation and its validation; it does not remove that responsibility.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Tool discovery → bounded computation → auditable result"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Discover tool",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Discovering a small relevant set"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could discovery hide a required capability?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "hide the tool needed"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Process data",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a program can filter or aggregate"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "a program can filter or aggregate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Retain evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Retain the source query"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Retain the source query"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Smaller results still need validated computation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "the computation and its validation"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "context-budget-tool-discovery"
        }
      ]
    },
    {
      "id": "coverage",
      "title": "A short context can still be dangerously incomplete",
      "question": "What does a bounded search actually establish?",
      "outcome": "Retain scope, coverage flags, and source identity.",
      "beats": [
        {
          "id": "context-budget-coverage",
          "role": "derive",
          "title": "A bounded search needs an explicit coverage statement",
          "speech": "Suppose a search returns no match after examining only the first part of a repository. That means no match within the searched region, not proof of absence across the repository. Record the scope searched, limits reached, omitted regions, and source revisions. Carry those flags into summaries and later decisions. For a consequential code change, use a coverage checklist that includes callers, relevant tests, and applicable security or compatibility constraints. Relevance ranking is not a truth ranking, and a concise summary may omit a decisive exception. When the evidence is incomplete, retrieve the missing prerequisite or report the limitation. A clean-looking answer should not turn truncated retrieval into an unqualified claim.",
          "boardActions": [
            {
              "action": "clear",
              "title": "No match has the scope of the actual search"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Truncated search cannot prove global absence",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not proof of absence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Searched scope",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the scope searched"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Reached limits",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "limits reached"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Omitted regions",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "omitted regions"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which coverage flags survive the summary?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Carry those flags into summaries"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "context-budget-coverage"
        },
        {
          "id": "context-budget-compatibility",
          "role": "check",
          "title": "Repair the missing dependency, not the prompt size",
          "speech": "The new API documentation is present, but an older client's compatibility exception is missing. The generated change passes the new-schema test and breaks that client. Loading every document is one possible reaction, but it may increase spending without making the dependency reliable. Add the compatibility source to the retrieval contract and include a representative old-client test. Preserve the source locator and the scope of that exception when summarizing. Recheck the changed artifact against both relevant client behaviors. This repair targets an observed coverage failure. If another class of omission appears, update the coverage method using that evidence. The aim is not to preselect every future document perfectly. It is to make important dependencies discoverable and missing coverage visible before acting on an incomplete picture.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Missed exception → retrieval contract → regression check"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Missed exception",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "compatibility exception is missing"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Coverage repair",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Add the compatibility source"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Add the compatibility source"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Client regression",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "representative old-client test"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "representative old-client test"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Preserve the exception’s source and scope",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Preserve the source locator"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the repair address the missing dependency?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "targets an observed coverage failure"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "context-budget-compatibility-spoken-v2"
        }
      ]
    },
    {
      "id": "measurement",
      "title": "Evaluate outcomes as well as tokens",
      "question": "Did the smaller context preserve the required evidence?",
      "outcome": "Compare designs on matched cases with explicit coverage failures.",
      "beats": [
        {
          "id": "context-budget-experiment",
          "role": "transfer",
          "title": "Test the difficult omissions alongside the savings",
          "speech": "Compare a preload configuration and a hybrid retrieval configuration on the same frozen cases. Include a necessary passage in an apparently unrelated file, a stale duplicate, and an oversized tool result. Require the system to find the needed evidence or explicitly report the gap. Verify that current scoped evidence wins over the stale duplicate and that truncation remains visible. Measure total tokens, cost, latency, independently assessed correctness, and missed-evidence rates. Attempts to pass can help diagnose the workflow, but it is not ground truth if the checker misses defects. Citations and tool usage are clues about relevance, not direct measurements of everything the model used. Keep incomplete runs in the comparison. Choose the context design that supports useful outcomes under the required constraints.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Challenge coverage while comparing efficiency"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Hidden prerequisite",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a necessary passage"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Stale duplicate",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a stale duplicate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Oversized result",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "an oversized tool result"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the design surface what it could not retrieve?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "explicitly report the gap"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Fewer tokens alone is not success",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "independently assessed correctness"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "context-budget-experiment"
        },
        {
          "id": "context-budget-recap",
          "role": "reflect",
          "title": "Keep a useful working set and an honest coverage record",
          "speech": "Budget the whole inference, including output and expansion. Select evidence for the current decision and its dependencies. Keep revisions, scope, and coverage flags attached. Combine stable essentials with retrieval that can adapt. Judge the design by outcomes as well as token use. Those are five durable principles. Remember: allocate, select, refresh, cover, measure. A smaller context is useful only when the necessary evidence remains available and applicable. Discuss next: which content in your loop describes an old revision? Which critical dependency could your retriever miss because it looks unrelated? Apply the method by writing one context allocation and one coverage checklist for a real task. Then test a stale source, an omitted exception, and a large result before accepting the design. Next we will examine how to preserve state when the work outlives the context window.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A useful working set has visible limits"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Budget",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Budget the whole inference"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Applicable evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep revisions, scope"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Outcome comparison",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Judge the design by outcomes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: allocate → select → refresh → cover → measure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: stale state? Hidden dependency?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "context-budget-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "f153e408685fbaa2e6eab87337bcc191d0972a8a7eb82169c59aa686a1d6e633"
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
