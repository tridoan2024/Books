(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-17",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Execution and State",
  "subtitle": "Professor Mode · Worktrees, containment, checkpoints, and effect recovery",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-17/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-17/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 17, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "00ccd1c0c1c6f0df2db3fa94827b151b8e6b98fcc6aff56dd247d70b68115d7f",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Separate execution and state boundaries",
      "question": "What survives or escapes when a worker fails?",
      "outcome": "Distinguish file isolation, containment, and recovery.",
      "beats": [
        {
          "id": "state-stakes",
          "role": "orient",
          "title": "A separate directory cannot contain every consequence",
          "speech": "Two workers edit a shared client library in our first case. In Deepa's fictional dependency upgrade, the payments worker adds connection pooling while the inventory worker adds a longer timeout. Each overwrites the other's change, and both keep repairing tests broken by the latest overwrite. A lost deployment response is our second case. The service accepts a release request, but the worker crashes before saving the receipt. Restoring matching source files does not tell us whether the deployment happened. A generated test is our third case. It runs inside a separate Git worktree but still has credentials that can reach a production service. The directory separation does not prevent that external call. These situations expose three distinct needs: isolating local writes, containing execution, and recovering durable state. The examples are illustrative rather than production measurements. Our governing question is: what survives or escapes when a worker fails? We will map each boundary, validate checkpoints, separate artifact state from external effects, and test recovery at deliberate crash points. By the end, you should be able to resume useful work without erasing user changes, duplicating remote operations, or treating a restart as a fresh allowance of authority and money.",
          "boardActions": [
            {
              "action": "clear",
              "title": "File isolation, execution containment, and recovery are distinct"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Competing edits",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Two workers edit"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Lost response",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A lost deployment response"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "External access",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A generated test"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Separate directories do not constrain every resource",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "directory separation does not prevent"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What survives or escapes a failed worker?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "state-stakes"
        },
        {
          "id": "state-boundary-map",
          "role": "derive",
          "title": "Map every mutable resource the worker can reach",
          "speech": "Start with the repository, then include shared Git metadata, temporary paths, databases, ports, caches, credentials, and external services. Workstreams that appear to own different directories can still share these resources. Assign an owner to shared files and a protocol for requesting changes. Enforce important boundaries with permissions or the execution platform where possible. A prompt saying stay in your directory is advisory. Use the actual task and consequences to choose controls; a clear single-worker edit may need only scoped ownership and a reviewed diff. The boundary map should explain what can collide, what can escape, and what evidence will establish that the final combined result works.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Inventory local and remote shared resources"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Files and metadata",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the repository"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Services and credentials",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "external services"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Where can apparently independent workers still collide?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "can still share these resources"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Enforced ownership",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Enforce important boundaries"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Prompt instructions alone do not enforce isolation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "is advisory"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "state-boundary-map"
        }
      ]
    },
    {
      "id": "isolation",
      "title": "Own the workspace and constrain execution",
      "question": "Which resources can this worker actually change?",
      "outcome": "Use worktrees and tested sandbox boundaries proportionately.",
      "beats": [
        {
          "id": "state-worktree",
          "role": "explain",
          "title": "A worktree protects ordinary files within its scope",
          "speech": "Pin the base commit, allocate an exclusively owned branch and worktree, and record that identity in the assignment. Keep candidate work separate from the user's active checkout. A worktree shares repository objects and does not isolate secrets, services, or every Git operation. Verify the candidate, then let an integration owner review it in a dedicated integration location. Run relevant checks on the combined state. Preserve useful changes and failure evidence before cleanup. Removing a worktree can destroy uncommitted work, so verify ownership and stopped processes first. It cannot undo an external request made from that directory. Avoid broad reset or stash operations as automatic recovery in a shared workspace.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Pinned base → owned candidate → verified integration"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Pinned base",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Pin the base commit"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Owned candidate",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "allocate an exclusively owned branch"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "allocate an exclusively owned branch"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Integration",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "let an integration owner review"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "let an integration owner review"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Are uncommitted work and diagnostics preserved?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Preserve useful changes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Deletion is local cleanup, not external rollback",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot undo an external request"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "state-worktree"
        },
        {
          "id": "state-sandbox",
          "role": "derive",
          "title": "Contain filesystem, network, compute, and privilege",
          "speech": "Filesystem restrictions control accessible paths. Network policy controls reachable endpoints. Compute limits bound memory, processes, and execution time. Privilege restrictions constrain system operations and devices. Test these controls against the code and dependencies that will execute. A timeout alone is not a security sandbox, and a trusted prompt does not make generated code trustworthy. Containers and virtual machines offer different boundaries with different operating costs; neither label guarantees that the chosen configuration matches the threat. Use disposable data and narrowly scoped credentials for tests that need services. Verify that forbidden access is actually rejected. Keep enough capability for the authorized task without silently exposing unrelated resources.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Containment has four resource dimensions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Filesystem",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Filesystem restrictions"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Network",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Network policy"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Compute",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compute limits"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Privilege",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Privilege restrictions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Resource limits alone do not form a security boundary",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A timeout alone"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the configured boundary reject forbidden access?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "forbidden access is actually rejected"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "state-sandbox"
        }
      ]
    },
    {
      "id": "checkpoint",
      "title": "Restore evidence rather than just counters",
      "question": "What does a matching checkpoint establish?",
      "outcome": "Validate snapshots, inputs, authority, and cumulative costs.",
      "beats": [
        {
          "id": "state-checkpoint-content",
          "role": "explain",
          "title": "A checkpoint needs context for its evidence",
          "speech": "Persist the plan revision, accepted obligations, scoped artifact identities, verification references, cumulative resource use, and unresolved effects. Store enough environment and authority information to assess whether continuation is permitted. Save discoveries and failures that changed knowledge or may have caused effects, even when the score did not improve. A content hash detects a difference but does not preserve the old bytes needed for restoration. Keep the actual saved snapshot when recovery requires it. On restart, inspect added and deleted files as well as modified ones, relevant test configuration, and paths that might escape through symbolic links. A single trustworthy-or-untrustworthy flag often hides which evidence actually needs refreshing.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Checkpoint: artifacts, evidence, costs, and unresolved effects"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Artifacts",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "scoped artifact identities"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evidence",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "verification references"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Costs",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "cumulative resource use"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Effects",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "unresolved effects"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A hash cannot restore bytes that were never saved",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not preserve the old bytes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which checks became stale, and which remain valid?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "which evidence actually needs refreshing"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "state-checkpoint-content-spoken-v2"
        },
        {
          "id": "state-atomicity",
          "role": "derive",
          "title": "Atomic visibility is smaller than durable recovery",
          "speech": "Writing a temporary checkpoint and renaming it on the same filesystem can give readers old-or-new visibility. Power-loss durability requires appropriate file and directory flushing. Neither operation makes several separately edited files one atomic snapshot. One approach is to write an immutable artifact snapshot and atomically update the accepted pointer after verification. Readers must follow that pointer instead of reading partially updated working files. Check that the checkpoint describes the same snapshot as its evidence. If current inputs differ, preserve both states and reconcile the change. Invalidate affected results without erasing valid independent work or resetting the cost ledger. Recovery requires a protocol, not merely a conveniently named checkpoint file.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Immutable snapshot → verified evidence → accepted pointer"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Atomic rename does not make multiple edits transactional",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "makes several separately edited files"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Snapshot",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "an immutable artifact snapshot"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "after verification"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "after verification"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Pointer",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Readers must follow that pointer"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Readers must follow that pointer"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Do readers consume one consistent accepted snapshot?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the same snapshot as its evidence"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "state-atomicity"
        }
      ]
    },
    {
      "id": "effects",
      "title": "Reconcile remote actions independently",
      "question": "Did the receiver accept the action before the response was lost?",
      "outcome": "Keep artifact and effect ledgers with stable operation identities.",
      "beats": [
        {
          "id": "state-two-ledgers",
          "role": "derive",
          "title": "Local artifacts and remote effects answer different questions",
          "speech": "The artifact ledger identifies the source, outputs, test inputs, and evidence freshness. The effect ledger identifies intent, operation key, attempt, receiver, receipt, and current disposition. A source tree can be restored while a deployment remains in flight. A deployment can be confirmed while local files have moved to a different revision. Keep both histories and associate each attempt with the current owner generation. Prepared, submitted, confirmed, failed, and unknown are useful effect states when their transitions have explicit evidence rules. A local process dying cannot prove that a remote submission failed. Only suitable receiver evidence can resolve the ambiguous outcome. An old worker must not publish a late result as a new owner's success.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Two ledgers support one recovery decision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Artifact ledger",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The artifact ledger"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Effect ledger",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The effect ledger"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Owner generation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "current owner generation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Local process death does not prove remote failure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot prove that a remote submission failed"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What receiver observation resolves the outcome?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "suitable receiver evidence"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "state-two-ledgers"
        },
        {
          "id": "state-lost-deployment",
          "role": "worked-example",
          "title": "Recover using the original operation identity",
          "speech": "The worker records a deployment identity and sends the request. The receiver accepts it, but the response is lost. On restart, ask the receiver about that same identity. If the deployment is running, observe it. If successful, verify the deployed revision and save the receipt. If definitively absent, retry according to the receiver's documented contract for duplicate suppression. If the service cannot establish the state, retain unknown and block contradictory actions. A new request identity could produce another deployment. A local record cannot ensure one effect when the receiver offers neither duplicate suppression nor a reliable status lookup. Reconciliation calls also consume time and money, so charge them to the continuing task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Stable operation → receiver status → reconcile outcome"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Operation identity",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "records a deployment identity"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Query receiver",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "ask the receiver"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "ask the receiver"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the receiver establish whether it accepted this request?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "service cannot establish the state"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Disposition",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "retain unknown"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "retain unknown"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Do not invent a new identity to escape an unknown effect",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "could produce another deployment"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "state-lost-deployment-spoken-v2"
        }
      ]
    },
    {
      "id": "integration",
      "title": "Integrate and recover according to state type",
      "question": "Which combined result has actually been checked?",
      "outcome": "Verify merged behavior and authorize specific compensation.",
      "beats": [
        {
          "id": "state-integration",
          "role": "check",
          "title": "Passing branches do not prove the combined result",
          "speech": "Return to the shared client library. One worker needs pooling and another needs a timeout. Give the shared library a single owner or integrate separately reviewed candidates through a controlled sequence. Record which artifact each dependent used. When changes combine, verify the relevant payments and inventory behavior together. Tests that passed on separate branches may depend on incompatible versions of the client. Conflicts can be semantic even when Git merges cleanly. Keep the user's active checkout and pre-existing changes intact. If integration fails, retain the candidates and failure evidence so useful work can be recovered. Parallelism is valuable when the combined result justifies the coordination and integration cost.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Owned shared change → combined candidate → integration evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Shared owner",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a single owner"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Combine",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "When changes combine"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "When changes combine"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Check together",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "verify the relevant payments and inventory behavior together"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "verify the relevant payments and inventory behavior together"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which combined revision did the tests examine?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "incompatible versions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A clean textual merge can still contain semantic conflicts",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Conflicts can be semantic"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "state-integration"
        },
        {
          "id": "state-compensation",
          "role": "explain",
          "title": "Recovery depends on what changed",
          "speech": "Restoring owned file bytes can undo a local edit. It cannot recall a delivered message or erase an accepted payment. A refund is a new operation with its own authority and receipt. Removing a table may be safe before any consumer writes data and destructive afterward. Redeploying an old application can fail against a new schema. Classify the state and design the operation-specific recovery before assuming that an inverse command is safe. Compensation needs its own authorization, bounded attempts, and outcome verification. Preserve partial success and uncertainty explicitly. A cancelled task remains cancelled until an authorized resumption; a saved checkpoint is continuity data, not permission to restart itself.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Local restore and external compensation have different semantics"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Owned files",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Restoring owned file bytes"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Remote effects",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a delivered message"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What new effect would this recovery action create?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a new operation"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Compensation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compensation needs"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Cancellation persists until authorized resumption",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A cancelled task remains cancelled"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "state-compensation"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Test interruption at the real boundaries",
      "question": "Can recovery explain every interrupted attempt?",
      "outcome": "Use controlled crash tests without duplicating effects.",
      "beats": [
        {
          "id": "state-crash-exercise",
          "role": "transfer",
          "title": "Inject failure at each handoff to the receiver",
          "speech": "Use a controlled fake deployment service and interrupt the worker before intent persistence, after persistence but before send, after remote acceptance, and after receipt storage. For each interruption, explain what recovery can establish and which operation identity it will use. The fake service should detect any duplicated effect. Add changed, added, and deleted files, altered test configuration, a symlink escape attempt, and a stale owner generation. The validator should report affected evidence and reject unsafe paths or stale publication. Keep active execution time separate from an overall deadline when a task intentionally spans days. The exercise succeeds when recovery preserves verified progress, charges all attempts, and leaves genuinely ambiguous effects unresolved.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Crash tests must cover local and remote boundaries"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Test with controlled effects and explicit recovery expectations",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "controlled fake deployment service"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Before intent",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "before intent persistence"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Before send",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "before send"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "After acceptance",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "after remote acceptance"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "After receipt",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "after receipt storage"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does every attempt retain its identity and cost?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "charges all attempts"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "state-crash-exercise"
        },
        {
          "id": "state-recap",
          "role": "reflect",
          "title": "Resume from evidence and current authority",
          "speech": "Worktrees isolate ordinary file writes within their assigned scope. Sandboxes constrain actual execution resources. Checkpoints preserve enough state to validate continuation. Separate artifact evidence from external-effect history, and reconcile unknown outcomes using the original operation identity. Verify the combined result after integration. Match recovery to the state that changed and authorize compensation explicitly. Remember: isolate, contain, persist, reconcile, integrate. None of these mechanisms resets spent budget or revives cancelled authority. Discuss next: which external effect could survive deleting your current workspace? Which checkpoint field would reveal that its tests no longer apply? Next we will use these distinctions to design stopping behavior that reports success, failure, and uncertainty honestly.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Resume with evidence, bounded resources, and current authority"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Isolation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Worktrees isolate"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Containment",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Sandboxes constrain"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Recovery",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "reconcile unknown outcomes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: isolate → contain → persist → reconcile → integrate",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: surviving effects? Stale checkpoint evidence?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "state-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "9cef5bf58f5a0b03e775d21ede366a27438688e98dd0f482a095b2190a3926a7"
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
