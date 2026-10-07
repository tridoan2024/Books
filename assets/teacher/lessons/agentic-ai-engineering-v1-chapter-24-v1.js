(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-24",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "From Loop to Fleet",
  "subtitle": "Professor Mode · Useful delegation, accepted artifacts, and complete workflow cost",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-24/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-24/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 24, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "1707ca6c2b0b709d485993db016d1255ddfb258cf343f18001a24759fd4dfe3d",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Require a concrete benefit from delegation",
      "question": "What does another worker add to this task?",
      "outcome": "Separate focused context, independent evidence, and useful parallelism.",
      "beats": [
        {
          "id": "fleet-stakes",
          "role": "orient",
          "title": "More workers must buy a specific benefit",
          "speech": "An expanded security review is our first case. In Priya's fictional workflow, a single reviewer now handles application vulnerabilities, infrastructure policy, authentication wiring, and retention rules. The larger packet creates missed findings and repeated reading. Focused reviewers might help, but the example is not a controlled proof that a fleet beats a better single-worker design. A three-part migration is our second case. Its stages depend on accepted outputs from earlier stages, so starting everyone at once would not create useful parallelism. A partial review is our third case. Three specialists return useful reports while the required authentication review fails. The lead has valuable evidence, but the overall request is still incomplete. Our governing question is: what does another worker add to this task? We will distinguish focused context, independent checking, and concurrent work; define concrete assignments; accept results using evidence; and compare total workflow cost. By the end, you should be able to justify a fleet through measured benefit and coordinate it without confusing an idle screen, a done message, or three successful subtasks with completion of the whole request. The same discipline applies when deciding that one worker is sufficient.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Focused context, real parallelism, and complete acceptance"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Overloaded review",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "An expanded security review"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A fleet needs measured benefit over a suitable baseline",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not a controlled proof"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Dependent stages",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A three-part migration"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Missing specialist",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A partial review"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What does another worker add to this task?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "fleet-stakes"
        },
        {
          "id": "fleet-reasons",
          "role": "derive",
          "title": "Context focus and concurrency are different hypotheses",
          "speech": "A smaller relevant packet may help a specialist maintain coverage, but small context does not guarantee that every requirement receives attention. Separate contexts can support an independent review while still sharing model blind spots. Parallel work can reduce duration when the tasks are genuinely independent and resources permit overlap. These benefits can exist separately. Compare the proposed fleet with a suitable single-worker or scripted baseline on matched tasks. Measure independently assessed quality, missed obligations, latency, and complete cost. Do not infer improvement from the number of agents or the fact that each has a specialist title. Delegation is a means to an outcome, not an acceptance criterion by itself.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Test three distinct reasons to delegate"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Context focus",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A smaller relevant packet"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Independent review",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Separate contexts"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Useful parallelism",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Parallel work"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which benefit does the matched comparison actually show?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Compare the proposed fleet"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Agent count and titles do not establish better outcomes",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Do not infer improvement"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "fleet-reasons"
        }
      ]
    },
    {
      "id": "assignment",
      "title": "Delegate a reviewable deliverable",
      "question": "What exactly must the worker return, from which inputs?",
      "outcome": "Specify ownership, scope, evidence, and real dependencies.",
      "beats": [
        {
          "id": "fleet-assignment",
          "role": "derive",
          "title": "An assignment is a contract for a deliverable",
          "speech": "Give each worker an owner identity, exact output location or schema, input revision, permitted write scope, acceptance procedure, and real dependencies. State the task and the relevant project facts needed to execute it. A security review might require located findings tied to the pinned candidate, affected caller paths, severity rationale, and unresolved coverage. The worker should acknowledge the complete assignment before acting. An instruction that merely says review authentication can leave framework, scope, and evidence expectations unclear. Excessive keystroke instructions can also obscure the useful outcome. Specify enough for the worker to exercise judgment within the task and for the lead to evaluate the returned artifact without reconstructing a conversation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Assignment: deliverable, inputs, authority, acceptance"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Deliverable",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "exact output location or schema"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Input revision",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "input revision"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Write scope",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "permitted write scope"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Acceptance",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "acceptance procedure"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the worker identify all dependencies before starting?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "real dependencies"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Delegate an assessable result rather than an open-ended conversation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "evaluate the returned artifact"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "fleet-assignment"
        },
        {
          "id": "fleet-scope",
          "role": "worked-example",
          "title": "Overlapping reading can be useful while writes need ownership",
          "speech": "Security and retention reviewers may both need the same data-handling code. Overlapping read scope is legitimate when their questions differ. Define finding categories and required coverage so neither important interaction disappears into a gap. Keep write ownership disjoint or use an explicit shared-file owner. If authentication depends on a cryptographic helper outside the assignment, record the dependency and obtain the relevant evidence through the agreed coordination path. Do not ignore it, and do not silently expand mutation authority. Two reviewers noticing the same defect is not automatically waste; the lead can reconcile duplicate evidence while preserving distinct implications. Scope design should protect coverage and coordination, not impose artificial blindness.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Read overlap can support coverage; writes need explicit ownership"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Shared facts",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the same data-handling code"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Distinct questions",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "their questions differ"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Owned writes",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep write ownership disjoint"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who resolves an unassigned cross-cutting concern?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the agreed coordination path"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A boundary must not hide a consequential dependency",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Do not ignore it"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "fleet-scope"
        }
      ]
    },
    {
      "id": "coordination",
      "title": "Turn worker assertions into accepted artifacts",
      "question": "What makes a done event trustworthy enough to consume?",
      "outcome": "Publish immutable results with current identity and acceptance.",
      "beats": [
        {
          "id": "fleet-result-acceptance",
          "role": "derive",
          "title": "Done is a claim until its evidence is accepted",
          "speech": "A worker publishes its artifact with references to supporting evidence. Then the coordinator checks schema, task identity, owner generation, input revision, and applicable acceptance results. An idle terminal or a done event is not that check. Publish immutable result versions and an accepted pointer so consumers do not read partially written output. Connect downstream assignments to accepted artifact identities. If a producer changes its output, explicitly invalidate consumers that depend on the changed revision. Preserve rejected and superseded results as history when useful for diagnosis. The lead remains responsible for the integrated outcome and may need to inspect source evidence or resolve a disputed finding. Delegation does not turn unsupported worker assertions into verified facts.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Worker artifact → identity and evidence check → accepted input"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Artifact",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "publishes its artifact"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Check",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the coordinator checks"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "the coordinator checks"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Idle screens and done events are not completion evidence",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "An idle terminal"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Accepted input",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Connect downstream assignments"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Connect downstream assignments"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the dependent consume the accepted producer revision?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "accepted artifact identities"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "fleet-result-acceptance-spoken-v2"
        },
        {
          "id": "fleet-persistence",
          "role": "explain",
          "title": "Persistence needs an enforced publication protocol",
          "speech": "A shared directory and append-only-looking log do not automatically enforce safe coordination. Event recording needs serialized or transactional writes, durable identifiers, sequence-based cursors, and recovery for interrupted records. Results need validated path components, access control, immutable versions, and atomic publication. A dictionary key called agent name does not prevent path traversal or enforce ownership. Record delegation, attempts, errors, acceptance, and supersession with causal identities. Logs help reconstruct what happened, but missing events and ambiguous observations still limit the conclusion. Treat the chapter's dataclasses as sketches of interfaces, not a tested runtime that already supplies these guarantees. Verify the concrete storage and dispatcher behavior you deploy.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Coordination guarantees must be enforced by the runtime"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Event integrity",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Event recording needs"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What happens to an interrupted event or result write?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "interrupted records"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Result integrity",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Results need"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Causal identity",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "causal identities"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Shared storage and dataclasses do not supply concurrency guarantees",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "sketches of interfaces"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "fleet-persistence"
        }
      ]
    },
    {
      "id": "economics",
      "title": "Compare complete workflows and their bottlenecks",
      "question": "Does the benefit exceed coordination and integration cost?",
      "outcome": "Measure model tiers, critical paths, and synthesis coverage.",
      "beats": [
        {
          "id": "fleet-cost",
          "role": "derive",
          "title": "Compare full cost and the actual critical path",
          "speech": "Include specialist work, repeated context, delegation, synthesis, retries, and unsuccessful workers in total cost. A fleet may reduce wall-clock duration while spending more tokens. Shared rate limits and resource contention can erase expected overlap. Dependencies create a critical path that additional workers cannot simply divide. Prompt-caching savings depend on the provider, model, prefix, and retention policy, so use actual rates and usage rather than an assumed universal discount. Measure cost per independently accepted outcome and remaining human work. If a deterministic router expresses the assignment rule reliably, it may replace a model decision. Select worker count and model tiers from the observed task, not a fixed ideal fleet size.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Total cost and critical path determine the practical benefit"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Worker cost",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "specialist work"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Coordination",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "delegation, synthesis"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Shared limits",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Shared rate limits"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Dependencies",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Dependencies create"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "More workers do not divide the sequential critical path",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot simply divide"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does lower elapsed time justify the complete added cost?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "remaining human work"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "fleet-cost"
        },
        {
          "id": "fleet-lead-capability",
          "role": "explain",
          "title": "Coordination can require difficult reasoning",
          "speech": "A simple router may need little model capability, while cross-domain integration may require deep source analysis. Organizational rank does not determine the right model tier. Test routing errors, missed requirements, unsupported synthesis claims, latency, and total cost. As specialists multiply, the lead's evidence packet can become the new bottleneck. A hierarchy can reduce local packet size but adds handoffs, delay, and opportunities to lose important details. Preserve claim-to-source references across those layers and measure required coverage rather than assuming a fixed percentage of information survives. Use the simplest topology that supports the real dependencies and acceptance work. A cheaper coordinator is economical only when the complete workflow remains useful and correct.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Routing need → integration need → measured model choice"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Route",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A simple router"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Integrate",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "cross-domain integration"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "cross-domain integration"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Measure",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Test routing errors"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Test routing errors"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Hierarchy adds handoffs as well as reducing local context",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "adds handoffs, delay"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the lead have enough evidence and capability to accept the result?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "complete workflow remains useful and correct"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "fleet-lead-capability"
        }
      ]
    },
    {
      "id": "recovery",
      "title": "Integrate without inventing completion or causality",
      "question": "Which claims and required tasks remain unsupported?",
      "outcome": "Preserve partial work and reconcile late results.",
      "beats": [
        {
          "id": "fleet-synthesis",
          "role": "check",
          "title": "Do not invent connections to make findings sound coherent",
          "speech": "One reviewer finds a null-pointer risk in a user service. Another finds a performance regression in a payment handler. These observations do not establish that the first causes the second. A synthesis claim needs supporting source paths, observations, or tests that connect them. Preserve independent findings independently when the connection is unknown. A structured schema can require evidence references, but a plausible reference is not proof that it supports the claim. Inspect material interactions and run relevant combined-state checks. Different passing components can still fail together. The lead's output must cover all required obligations and state unresolved conflicts, not merely summarize every worker in polished prose.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Findings require evidence before they become a causal story"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Finding A",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a null-pointer risk"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Finding B",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a performance regression"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Two observations do not establish a causal link",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "do not establish that the first causes the second"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Connection evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A synthesis claim needs"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What evidence supports this proposed interaction?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Inspect material interactions"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "fleet-synthesis"
        },
        {
          "id": "fleet-partial-recovery",
          "role": "worked-example",
          "title": "Keep three useful reports without hiding the fourth failure",
          "speech": "Three workers complete their reviews while authentication analysis times out. Preserve the three reports and their accepted evidence, but keep the required authentication obligation unresolved. Record the original tool error, partial findings, and the change that would permit a useful retry. Re-running all four workers can waste valid work and introduce inconsistency. If the late worker returns, compare task generation and input revision before accepting its result. A report for an old commit is historical evidence. It may need a narrow update rather than wholesale disposal. Neither silence nor a late done message changes the acceptance boundary. The coordinator must decide using current identity, authority, and evidence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Three accepted reports → one required gap → targeted continuation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Preserve",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve the three reports"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Gap",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "keep the required authentication obligation unresolved"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "keep the required authentication obligation unresolved"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What changed that makes retry useful now?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the change that would permit"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Continue",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a useful retry"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "a useful retry"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A late result must match the current task and input generation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "compare task generation and input revision"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "fleet-partial-recovery"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Test the fleet at its handoff boundaries",
      "question": "Can a missing or stale worker result become full success?",
      "outcome": "Validate assignment coverage and combined acceptance.",
      "beats": [
        {
          "id": "fleet-test-exercise",
          "role": "transfer",
          "title": "Test missing assignments, stale outputs, and partial preservation",
          "speech": "Give the dispatcher unequal task and worker counts. It must reject or explicitly assign the difference instead of truncating a paired list. Test a required worker exception, malformed output, stale owner generation, and an old input revision. None should produce full completion. Verify that useful accepted artifacts remain accessible in every failure case. Add overlapping reads with disjoint write claims and check that required cross-cutting coverage survives. For a stop decision, preserve the original reason and resource state; a declining score alone does not authorize terminating someone else's process. Compare the final fleet with the baseline on complete quality, cost, and duration before claiming that delegation earned its complexity.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Acceptance tests target assignment and publication boundaries"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Missing assignment",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "unequal task and worker counts"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A pairing operation must never silently drop required tasks",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "truncating a paired list"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Worker failure",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "a required worker exception"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Stale identity",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "stale owner generation"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Preserved work",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "useful accepted artifacts"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can every required task be traced to accepted evidence?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "required cross-cutting coverage"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "fleet-test-exercise"
        },
        {
          "id": "fleet-recap",
          "role": "reflect",
          "title": "Delegate for benefit and integrate with evidence",
          "speech": "Justify focused context, independent review, or useful parallelism separately. Assign concrete deliverables with ownership, input revisions, authority, and acceptance checks. Treat worker completion as a claim until its evidence is accepted. Enforce result publication and dependency identities. Measure total cost. Identify the critical path and inspect the combined synthesis. Remember: justify, assign, accept, integrate, measure. Preserve completed work when another required task fails, and reconcile late outputs before use. Discuss next: which worker adds no distinct benefit today? Which done message lacks a reviewable artifact? Next we will compare coordination topologies and the protocols needed when multiple workers share state.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A fleet earns its cost through verified combined outcomes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Concrete benefit",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Justify focused context"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Accepted artifacts",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Treat worker completion"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Combined evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "inspect the combined synthesis"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: justify → assign → accept → integrate → measure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: redundant worker? Unsupported done message?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "fleet-recap-spoken-v2"
        }
      ]
    }
  ],
  "narrationSHA256": "3afd394c9b21b3da9b4955ceaef867d2e87ce635c133d2207e7025c747e5e485"
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
