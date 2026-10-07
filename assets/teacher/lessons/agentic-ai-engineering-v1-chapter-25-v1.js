(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-25",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Topologies, Shared State, and Coordination",
  "subtitle": "Professor Mode · Information flow, fenced ownership, and durable acceptance",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-25/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-25/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 25, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "43f5c6db97fcd6ca7c8e9407298eba6bf7339503928afaedc10788e421944c9c",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Separate communication from write authority",
      "question": "Who may publish when two workers touch the same resource?",
      "outcome": "Choose topology and ownership as distinct decisions.",
      "beats": [
        {
          "id": "topology-stakes",
          "role": "orient",
          "title": "The quickstart needs one coherent accepted version",
          "speech": "A mixed tutorial page is our first case. In David's fictional documentation fleet, one specialist rewrites the explanation while another replaces the embedded code sample. The file lies outside the original partitions. Their separate versions are merged into inconsistent prose and code, and a compilation-only check misses the mismatch. A paused owner is our second case. A worker checks its lease, pauses, and resumes after another worker has acquired ownership. If the resource still accepts the old worker's write, the lease has not protected the result. A delayed event is our third case. Two updates have the same timestamp, and a reader using a strict time cursor silently skips one. These cases show that a communication diagram cannot by itself establish safe shared state. They are illustrative rather than measured incidents in a named deployed system. Our governing question is: who may publish when two workers touch the same resource? We will compare topologies, classify conflicts, derive a fencing protocol, and test event and handoff recovery. By the end, you should be able to locate the actual enforcement point and explain how useful historical work survives without restoring stale authority.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Communication, ownership, and event ordering are distinct"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Mixed quickstart",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A mixed tutorial page"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Paused owner",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A paused owner"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Skipped event",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A delayed event"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A topology diagram alone does not enforce safe state",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot by itself establish safe shared state"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who may publish to a shared resource?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "topology-stakes"
        },
        {
          "id": "topology-separate-axes",
          "role": "derive",
          "title": "More communication does not replace a single-writer rule",
          "speech": "The quickstart conflict could be prevented by assigning one file owner and asking the other specialist for a contribution tied to an identified revision. The workers may route information through the lead or exchange it directly. Both arrangements still need enforcement of permission to change shared files. Conversely, a central lead does not prevent overwrites if workers can bypass its ownership decisions. Map resources that cross the original partitions, including generated files and shared configuration. Several workers can usefully inspect the same material. For a single mutable file, even edits to different line ranges can conflict when offsets are stale or an editor rewrites the entire file. Choose the information paths and the rules for changing shared data separately, then verify that the actual adapter enforces both.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Shared target → one owner → versioned contribution"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Shared file",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The quickstart conflict"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Owner",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "assigning one file owner"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "assigning one file owner"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Contribution",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a contribution tied to an identified revision"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "a contribution tied to an identified revision"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Central coordination does not enforce ownership automatically",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a central lead does not prevent overwrites"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can any writer bypass the owner at the resource?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "bypass its ownership decisions"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "topology-separate-axes-spoken-v2"
        }
      ]
    },
    {
      "id": "topology",
      "title": "Match information flow to the work",
      "question": "Which dependencies determine latency and coordination?",
      "outcome": "Compare hierarchy, pipeline, mesh, and blackboard.",
      "beats": [
        {
          "id": "topology-star-pipeline",
          "role": "explain",
          "title": "Hierarchy coordinates; pipelines express sequential dependence",
          "speech": "A hierarchy routes assignments and results through one lead. This provides a clear coordination point but can make that lead a context or latency bottleneck. A pipeline passes an accepted artifact through dependent stages, such as research, writing, editing, and formatting. One item must traverse its sequential critical path. Different items may still overlap across stages when capacity and ordering permit. Each stage needs checks for its contribution, and the final artifact needs relevant combined acceptance. A stylistic editor may polish an earlier factual error unless source evidence and appropriate verification survive. Choose the topology according to dependencies, not an assumption that every additional worker shortens the task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Research → writing → editing → formatting"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Research",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "research"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Writing",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "writing"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "writing"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Editing",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "editing"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "editing"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Formatting",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "formatting"
            },
            {
              "action": "edge",
              "from": "n3",
              "to": "n4",
              "spokenCue": "formatting"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "One item is sequential; different items may overlap",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Different items may still overlap"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which stage checks facts before later polish hides the error?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "an earlier factual error"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "topology-star-pipeline"
        },
        {
          "id": "topology-mesh-blackboard",
          "role": "derive",
          "title": "Channel count is a possibility, not a traffic measurement",
          "speech": "A full mesh permits direct communication between every pair of workers. Counting unordered pairs gives the formula on the board: five workers permit ten channels, while ten permit forty-five. These are potential channels, not the number of messages actually sent. Selective lateral links can address a real dependency without making every pair communicate. A blackboard lets workers react to shared state, which can suit continuous specialized monitoring. It still requires explicit rules for ownership, ordering, duplicate work, and contradictory findings. Decoupling communication does not eliminate coordination. Measure real information-flow needs and message volume before choosing a more connected topology or assuming it solves a state conflict.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Potential mesh channels = n(n−1)/2"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "5 workers: 10",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "five workers permit ten channels"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "10 workers: 45",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "ten permit forty-five"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Potential channels do not equal actual messages",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not the number of messages actually sent"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Shared blackboard",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A blackboard"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What protocol resolves duplicate or contradictory work?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "contradictory findings"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "topology-mesh-blackboard"
        }
      ]
    },
    {
      "id": "conflicts",
      "title": "Protect shared state and classify conflicts",
      "question": "What can a clean textual merge still get wrong?",
      "outcome": "Use explicit ownership and combined behavioral evidence.",
      "beats": [
        {
          "id": "topology-conflict-types",
          "role": "derive",
          "title": "Structural, semantic, and ordering conflicts need different evidence",
          "speech": "A structural conflict changes overlapping text. A semantic conflict changes different text in incompatible ways, such as removing a function that another patch calls. An ordering conflict appears when an application expects a database column before the migration has created it. A clean textual merge cannot establish that these latter cases are safe. Give shared artifacts explicit ownership, preserve candidate diffs, and verify relevant behavior after integration. For deployment order, state prerequisites and check the actual environment before dispatch. Worktrees isolate ordinary file changes but do not create a transaction across deployments or databases. Resolution may require returning work to its owner or running new checks, not merely asking a model to combine paragraphs.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Three conflict classes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Structural",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A structural conflict"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Semantic",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A semantic conflict"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Ordering",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "An ordering conflict"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A clean text merge does not establish compatible behavior",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A clean textual merge"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the required environment exist before this code runs?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "state prerequisites"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "topology-conflict-types"
        },
        {
          "id": "topology-lock-limits",
          "role": "explain",
          "title": "A lock coordinates only the participants that honor it",
          "speech": "Prefer exclusive write ownership where it fits. Use durable event recording to share observations, and an appropriate locking or transactional protocol when mutable access must be shared. A local asynchronous lock coordinates callers using that same object inside one process. It does not fence another process, another host, or a direct call to an external service. Multiple locks can deadlock if workers acquire them in conflicting orders. Consistent ordering and bounded waits help, but recovery must still account for the actual owner and partial effects. Normalize resource identity so aliases and symlinks do not create two apparent locks for the same target. Test the boundary you claim, not only cooperative calls in one event loop.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Lock scope, identity, and recovery must match the resource"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Lock scope",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "inside one process"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A local lock does not provide cross-process fencing",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not fence another process"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Ordering",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "conflicting orders"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Identity",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Normalize resource identity"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can two path spellings bypass the same ownership claim?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "aliases and symlinks"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "topology-lock-limits"
        }
      ]
    },
    {
      "id": "fencing",
      "title": "Reject the paused old owner at the resource",
      "question": "Where is stale authority actually enforced?",
      "outcome": "Combine generations, fencing, and expected revisions.",
      "beats": [
        {
          "id": "topology-fence-timeline",
          "role": "derive",
          "title": "Lease expiry cannot physically stop a paused worker",
          "speech": "Worker A holds fence seven, checks its lease, and pauses. The lease expires. Worker B receives fence eight and publishes a new accepted result. Now A resumes. A client-side lease check performed earlier cannot stop that old write. The resource must reject a fence older than the one it has already accepted. The board shows the ordering: old owner, new accepted fence, late rejected write. A monotonically increasing token is useful only if the protected endpoint actually compares it during publication. Checking the token in the coordinator and then sending an unfenced write to a third-party service leaves that service exposed. Enforcement must survive the pause between checking and acting.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A: fence 7 pauses → B: fence 8 publishes → A: fence 7 rejected"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "A pauses",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Worker A holds fence seven"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "B publishes",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Worker B receives fence eight"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Worker B receives fence eight"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "A rejected",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The resource must reject"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "The resource must reject"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The resource must compare the fence during the write",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "during publication"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Where is the stale write rejected after the client resumes?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Enforcement must survive"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "topology-fence-timeline"
        },
        {
          "id": "topology-conditional-publish",
          "role": "derive",
          "title": "Generation, fence, and expected revision protect different facts",
          "speech": "At publication, verify caller authority and the current task generation. Compare the fencing token with the resource's accepted token. Compare the expected artifact revision with the current revision. Then atomically store the new immutable candidate pointer and accepted fence, returning a durable receipt. The generation identifies the current assignment, the fence orders owners, and the expected revision detects an intervening artifact change. These checks must be enforced together at the relevant boundary. If the receiver lacks conditional writes or fencing, use an appropriate serialized gateway, receiver-supported operation identity, or a policy preventing overlapping effects with reconciliation. Do not claim that local bookkeeping alone supplies distributed ownership guarantees.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Publication checks: authority, generation, fence, revision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Authority",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "verify caller authority"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Generation",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "current task generation"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Fence",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare the fencing token"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Revision",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare the expected artifact revision"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Atomically store the accepted pointer and fence",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Then atomically store"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What guarantee does the actual receiver support?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "If the receiver lacks"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "topology-conditional-publish"
        }
      ]
    },
    {
      "id": "handoff",
      "title": "Publish and accept artifacts with causal identity",
      "question": "What evidence may the next worker safely reuse?",
      "outcome": "Preserve source-linked state and durable event cursors.",
      "beats": [
        {
          "id": "topology-three-stages",
          "role": "explain",
          "title": "Producing, publishing, and accepting are separate transitions",
          "speech": "Production creates a candidate. Publication stores that candidate and its evidence where the coordinator can inspect it. Acceptance records that the current candidate meets the task requirements and can be used downstream. A familiar result path or a done message does not perform all three transitions. When a worker returns after reassignment, retain its output as historical evidence or reject its publication; do not let it replace the current owner's result. Useful factual findings may be reused after source validation, while the old authority remains obsolete. Bind every downstream consumer to the accepted artifact identity so an unnoticed producer revision cannot silently change the meaning of completed work.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Produce candidate → publish evidence → accept for downstream use"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Produce",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Production creates"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Publish",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Publication stores"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Publication stores"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Accept",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Acceptance records"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Acceptance records"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Historical evidence may be useful without restoring old authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "the old authority remains obsolete"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which exact accepted artifact did the dependent consume?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "accepted artifact identity"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "topology-three-stages"
        },
        {
          "id": "topology-events-handoff",
          "role": "worked-example",
          "title": "Durable sequence identities avoid timestamp gaps",
          "speech": "Two events can share a timestamp, and clocks can move. A reader asking only for events after its last wall-clock time can therefore miss a valid update. Use durable sequence identities with explicit replay semantics, and deduplicate repeated notifications by stable identity. Handle an interrupted final record without inventing acceptance or losing earlier durable events. A handoff should carry the current goal, accepted artifact hashes, pending checks, unresolved effects, failed approaches with reasons, and the next permissible action. Include source references so the successor can validate dependencies that have changed. Reuse unaffected evidence. Count every generated and consumed communication step when measuring cost; an input-only estimate is not the full bill.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Durable sequence → duplicate-aware replay → evidence-based handoff"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Equal timestamps must not cause event loss",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Two events can share a timestamp"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Sequence",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "durable sequence identities"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Replay",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "deduplicate repeated notifications"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "deduplicate repeated notifications"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Handoff",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A handoff should carry"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "A handoff should carry"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which changed dependency invalidates only part of the handoff?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "validate dependencies that have changed"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "topology-events-handoff-spoken-v2"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Test the concurrency invariant across processes",
      "question": "Can a stale writer overwrite a newer accepted result?",
      "outcome": "Verify resource-side rejection and affected-evidence invalidation.",
      "beats": [
        {
          "id": "topology-process-test",
          "role": "transfer",
          "title": "Reproduce the paused-owner race with two real processes",
          "speech": "Run two processes against the actual resource adapter. Pause the first after lease validation, let the second acquire a newer fence and publish, then resume the first. Its stale write must be rejected at the resource. Repeat with path aliases and symlinks. Replay duplicate notifications, equal timestamps, and an interrupted log record; acceptance must occur only according to the durable identities and policy. Change one upstream revision and verify that only affected downstream checks become stale. Preserve the old candidate for diagnosis without letting it regain ownership. These tests substantiate the concurrency claim more directly than a diagram or two coroutines sharing the same in-memory lock.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Pause old process → publish newer fence → reject resumed write"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Test cross-process behavior at the actual resource adapter",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Run two processes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Pause",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Pause the first"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "New owner",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "let the second acquire"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "let the second acquire"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reject",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Its stale write must be rejected"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Its stale write must be rejected"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the test exercise the same boundary as production?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "substantiate the concurrency claim"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "topology-process-test"
        },
        {
          "id": "topology-recap",
          "role": "reflect",
          "title": "Choose information paths and enforce state transitions",
          "speech": "Match topology to real dependencies and communication needs. Treat ownership as a separate enforced decision. Distinguish structural, semantic, and ordering conflicts, and verify the combined artifact. Use resource-side fencing and conditional revisions where required. Separate production, publication, and acceptance. Remember: connect, own, fence, publish, accept. Replay events by durable identity and hand off source-linked state without resetting authority or valid progress. Discuss next: which local lock is being mistaken for a distributed guarantee? Which done message bypasses acceptance in your workflow? Next we will examine where human decisions belong and what evidence justifies reducing oversight.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Communication topology plus enforced ownership and acceptance"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Information paths",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Match topology"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "State authority",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Treat ownership"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Accepted result",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Separate production"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: connect → own → fence → publish → accept",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: local lock assumption? Unchecked done message?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "topology-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "5a8d4fffdd1ca5009ed1b838694e97cc6f387ff7c2ae9d1d6b0fb4c99c1aeae2"
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
