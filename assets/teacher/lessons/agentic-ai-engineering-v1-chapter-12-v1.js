(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-12",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Memory and Between-Run Consolidation",
  "subtitle": "Professor Mode · scoped evidence, honest promotion, and a controlled memory lifecycle",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-12/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-12/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 12, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "6222a9e77e9808a0c9e4d706821cccf78a4678c1928e69973790ca828b3467ca",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Remember useful evidence without promoting a story into truth",
      "question": "What should persist so the next run starts better?",
      "outcome": "Separate observations, claims, and conditional procedures.",
      "beats": [
        {
          "id": "memory-stakes",
          "role": "orient",
          "title": "A remembered workaround needs conditions and evidence",
          "speech": "A legacy document conversion is our first case. In the fictional legal-technology workflow, the agent repeatedly discovers a conversion path for an unusual file format and then loses that lesson between runs. A stale deployment procedure is our second case. The most frequently recalled memory still describes an old platform after the project migrates. A copied instruction is our third case. Several documents repeat the same unsupported claim that a security check should be skipped, and careless consolidation mistakes repetition for independent confirmation. These cases show why memory needs more than persistence. It must preserve where a claim came from, the conditions under which it applies, and how its outcome was verified. This example illustrates retrieval of retained experience; it does not describe model training or establish a measured performance improvement. Our governing question is: what should persist so the next session starts with useful knowledge? We will distinguish memory roles, design capture and consolidation, enforce recall scope, and test outdated or manipulated records. By the end, you should be able to retain useful experience without turning a generated summary into authority or an untested workaround into a guaranteed procedure. Memory should help locate evidence and choose an appropriate next step under current conditions.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Persistence can retain useful lessons and confident errors"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Repeated conversion",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A legacy document conversion"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Stale procedure",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A stale deployment procedure"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Copied instruction",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A copied instruction"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Preserve provenance, conditions, and verified outcomes",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "where a claim came from"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What should persist so the next run starts better?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "memory-stakes-spoken-v2"
        },
        {
          "id": "memory-layers",
          "role": "explain",
          "title": "Distinguish working context, events, claims, and procedures",
          "speech": "Working context is the information available to the current inference. Episodic records describe particular events with times, inputs, actions, and outcomes. Semantic entries express scoped claims derived from sources or observations. Procedural entries describe conditional workflows and their validation status. This taxonomy is a useful engineering organization, not proof that software memory works like a human brain. Capture, recall, and consolidation may happen at different times depending on the system. A session can record a candidate procedure before repeated validation, provided its candidate status remains explicit. Persistent retrieval changes what the model receives; it does not by itself train new model weights. The key distinction is between a stored observation and a claim justified for use under the current conditions.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Memory roles need different evidence and lifecycles"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Working context",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Working context"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Episode",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Episodic records"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Scoped claim",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Semantic entries"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Procedure",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Procedural entries"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Candidate procedure and validated procedure differ",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "candidate status remains explicit"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What exactly does this entry claim to establish?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a claim justified for use"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "memory-layers"
        }
      ]
    },
    {
      "id": "capture",
      "title": "Preserve provenance and validation status",
      "question": "When is a discovered workaround ready to influence another run?",
      "outcome": "Record useful experience without inventing successful repair.",
      "beats": [
        {
          "id": "memory-capture-policy",
          "role": "derive",
          "title": "Capture information that can improve a future decision",
          "speech": "Useful memory can change a future decision beneficially. Assess novelty, future relevance, and the effort required to recover the information from its source. These considerations support judgment; they do not impose one rigid formula on every record. A failed repair can prevent another attempt with the same ineffective strategy. Record an untested suggestion as a proposal, not as a solution that worked. Save observed outcomes and connect them to the original candidate and test conditions. A stable source locator and revision may be sufficient instead of copying a large document. Preserve explicit user preferences with their applicable scope and origin. Keep temporary progress separate from general knowledge so the next worker can continue the actual task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Useful capture preserves both value and epistemic status"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Future value",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "change a future decision beneficially"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would this record change a future decision usefully?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "beneficially"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An untested suggestion remains a proposal",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not as a solution that worked"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Observed outcome",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Save observed outcomes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Scoped preference",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "explicit user preferences"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "memory-capture-policy-spoken-v3"
        },
        {
          "id": "memory-provenance",
          "role": "worked-example",
          "title": "A session ID is not enough to justify reuse",
          "speech": "The converter worked once. Record the file type, relevant tool version, source input identity, command conditions, output checks, and observed result. Include tenant and project scope, source locator and revision, observation time, origin, claim type, and validation status. A future reader can then assess whether the procedure applies to another file. The conversion command in the chapter is illustrative, so validate the actual supported interface in a controlled environment before adopting it. A generated answer saved to memory remains generated working context unless supporting evidence establishes its claims. A source hash identifies the bytes reviewed; it does not prove the source was correct. Good provenance makes rechecking possible without turning storage into a certificate of truth.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Observed conversion → scoped evidence → conditional reuse"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Observation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The converter worked once"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Do the tool version and input conditions still match?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "relevant tool version"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "output checks, and observed result"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "output checks, and observed result"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reuse",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "assess whether the procedure applies"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "assess whether the procedure applies"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A hash identifies evidence; it does not prove truth",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A source hash identifies"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "memory-provenance"
        }
      ]
    },
    {
      "id": "consolidation",
      "title": "Distill evidence without manufacturing agreement",
      "question": "When do repeated episodes support a more general claim?",
      "outcome": "Preserve source lineage, scope, contradictions, and proposal status.",
      "beats": [
        {
          "id": "memory-lineage",
          "role": "derive",
          "title": "Duplicate wording is not independent confirmation",
          "speech": "Three episodes quote the same document. They provide one source lineage, not three independent confirmations. Consolidation should track that relationship while merging redundant wording. Preserve the original evidence links and the validation status of the resulting claim. Similar error messages can have different root causes, so a shared phrase does not justify one universal recovery procedure. Look for matching conditions and independently supported outcomes. A fixed count of episodes is a heuristic for review, not a truth threshold. A proposed generalization may be useful to test without being ready for automatic action. Keep the distinction between reducing duplicate text and increasing confidence in a claim; the first can happen without evidence for the second.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Consolidation must preserve evidence lineage"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Repeated wording",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Three episodes quote"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "One source",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "one source lineage"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Duplicate text does not create independent evidence",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not three independent confirmations"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Are these separate observations or copies of one source?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "track that relationship"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Tested conditions",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "matching conditions"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "memory-lineage"
        },
        {
          "id": "memory-conflicts",
          "role": "predict",
          "title": "Recency and popularity do not decide truth",
          "speech": "One memory describes a deployment command for staging; another describes a newer production workflow. They may concern different scopes rather than contradict each other. Preserve environment and time conditions before deciding that one supersedes the other. A recent claim can be wrong, and an old requirement can remain valid. An explicit user correction can supersede a scoped preference without proving an unrelated external fact. Consolidation should propose a change with before-and-after evidence and the reason it applies. For consequential procedures, use the required review and validation policy before promotion. Do not let a frequently recalled entry become authoritative simply because retrieval keeps selecting it. Current evidence and applicable authority settle the action.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Resolve scope before declaring supersession"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Environment",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "different scopes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Do both claims apply to the same situation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "rather than contradict each other"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Time conditions",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "time conditions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Recency and access counts are not truth tests",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A recent claim can be wrong"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Current evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Current evidence"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "memory-conflicts"
        }
      ]
    },
    {
      "id": "recall",
      "title": "Enforce scope before relevance ranking",
      "question": "Which memories are this caller allowed to see and use?",
      "outcome": "Retrieve applicable evidence under a bounded budget.",
      "beats": [
        {
          "id": "memory-scoped-recall",
          "role": "explain",
          "title": "Authorize the namespace before ranking the memories",
          "speech": "Two clients use identical language for different contract preferences. A similarity search must not return one client's private preference to the other. Enforce tenant and project boundaries in the storage and retrieval service before applying semantic ranking. Recheck access when source permissions have changed since ingestion. Importance, recency, and frequent use cannot override that boundary. Within the authorized set, rank for relevance and applicability, then load a bounded amount of evidence. Carry stale-source and coverage flags into the result. A high similarity score means a record resembles the query; it does not establish that the claim is current or suitable for this task. Missing authorized evidence should remain a visible gap.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Authorized namespace → applicable candidates → bounded recall"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would identical wording cause a cross-client leak?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "private preference to the other"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Scope filter",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Enforce tenant and project boundaries"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Similarity cannot bypass scope or prove freshness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot override that boundary"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Rank",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "rank for relevance and applicability"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "rank for relevance and applicability"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Bounded recall",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "load a bounded amount"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "load a bounded amount"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "memory-scoped-recall"
        },
        {
          "id": "memory-recall-budget",
          "role": "worked-example",
          "title": "A recall budget is useful only with adequate coverage",
          "speech": "A bounded memory budget keeps the working context from filling with marginal entries. It also creates a selection problem: a decisive exception may rank below familiar but less useful material. Test whether the retrieved set supports the actual decision, and permit targeted follow-up when a prerequisite is missing. Do not assume that a memory was irrelevant just because the model did not cite it. Log the entries actually returned, their revisions, and their influence where it can be observed. In the chapter's file-store sketch, access metadata is updated before sorting. That can make recency reflect the current scan instead of prior useful access. Rank on prior metadata, select the returned entries, then update their usage. Retrieval accounting should describe real use, not every candidate examined.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Selection and usage accounting need honest semantics"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Bounded budget",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A bounded memory budget"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could a crucial exception fall below the retrieval cutoff?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a decisive exception may rank below"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Coverage test",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "supports the actual decision"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Prior metadata",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Rank on prior metadata"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Update usage for returned entries after selection",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "then update their usage"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "memory-recall-budget"
        }
      ]
    },
    {
      "id": "storage",
      "title": "Make persistence correct under real updates",
      "question": "What can go wrong in a small file-based memory store?",
      "outcome": "Protect keys, atomicity, concurrency, and consistent previews.",
      "beats": [
        {
          "id": "memory-store-hardening",
          "role": "worked-example",
          "title": "A small file store still needs safe keys and atomic updates",
          "speech": "A memory key becomes part of a file path. If path separators or traversal are accepted, a write can escape the intended storage root. Validate or encode keys and check the resulting destination. Write complete records atomically and define how concurrent updates are resolved. Archival names must avoid collisions so one retired entry cannot overwrite another. These requirements apply even when the store is small and human-readable. The sample code illustrates the idea of save and recall; it is not a complete production implementation. Choose keyword, vector, or hybrid retrieval from measured task needs rather than a universal entry-count threshold. Storage simplicity is useful when its integrity, scope, and retrieval behavior satisfy the actual workflow.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Simple storage still has concrete integrity boundaries"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can this key escape the authorized storage root?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "escape the intended storage root"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Safe keys",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Validate or encode keys"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Atomic records",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Write complete records atomically"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Concurrent updates",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "concurrent updates"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Archive identity",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Archival names"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A teaching sketch is not a complete production store",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not a complete production implementation"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "memory-store-hardening"
        },
        {
          "id": "memory-consistent-consolidation",
          "role": "derive",
          "title": "Preview must leave stored state unchanged",
          "speech": "Consolidate from a consistent snapshot and produce proposed changes with evidence links. Apply an accepted change conditionally against the snapshot revision. Otherwise an old consolidation pass can archive a newly corrected entry or recreate one that was already retired. Preview mode must perform no writes, including importance decay and access metadata updates. Verify that by comparing stored bytes before and after the preview. A report saying no changes were applied is insufficient if the implementation silently mutates metadata. Keep proposal generation and application as distinct operations with clear results. The applicable policy determines which changes can be applied automatically and which require review; the consolidator cannot grant itself permission merely because it detected a pattern.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Consistent snapshot → proposal → conditional apply"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Snapshot",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a consistent snapshot"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Proposal",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "produce proposed changes"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "produce proposed changes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Conditional apply",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "conditionally against the snapshot revision"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "conditionally against the snapshot revision"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could this stale pass overwrite a newer correction?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a newly corrected entry"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Preview means no stored-byte mutation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Preview mode must perform no writes"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "memory-consistent-consolidation"
        }
      ]
    },
    {
      "id": "lifecycle",
      "title": "Retire stale guidance without confusing archive and deletion",
      "question": "How should memory change when sources, permissions, or systems change?",
      "outcome": "Keep explicit invalidation, privacy semantics, and poisoning controls.",
      "beats": [
        {
          "id": "memory-retirement",
          "role": "explain",
          "title": "Archive, invalidation, and deletion have different meanings",
          "speech": "A superseded entry may leave active recall while remaining in an archive for provenance. Explicit invalidation records that a claim should no longer guide the task under its former conditions. Privacy deletion may require removing payloads, derived indexes, and retained copies according to the applicable policy. Archiving alone does not satisfy that meaning of deletion. Time-based decay can help manage retrieval, but lack of recent access does not prove a critical requirement is obsolete. Recheck high-impact procedures when the relevant system changes, using safe evidence or controlled tests. Do not execute a real deployment simply to refresh a memory. Keep operational effect records separate from advisory memory so ordinary curation cannot erase the evidence needed to reconcile an uncertain write.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Retirement operations have different contracts"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Archive",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "an archive for provenance"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Invalidate",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Explicit invalidation"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Delete",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Privacy deletion"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What data and derived copies remain after this operation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "payloads, derived indexes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Archiving is not privacy deletion",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Archiving alone does not satisfy"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "memory-retirement"
        },
        {
          "id": "memory-poisoning",
          "role": "predict",
          "title": "Repeated malicious text must not become a procedure",
          "speech": "An untrusted document tells the agent to remember a new requirement that skips a security check. Treat that text as document content, not as authority to change the workflow. Preserve source trust and lineage if the observation is recorded for investigation. Repeated copies must not gain independent-evidence status during consolidation. Before a procedure influences a consequential action, validate it against current trusted requirements and the task's authority. Human review, when required by the promotion policy, needs the actual evidence and effect description. A routine-sounding recovery tip can still trigger a destructive or privileged operation. If poisoning is discovered, identify derived entries and cached copies as well as the original record, then follow the authorized correction and retention policy.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Untrusted text → provenance check → controlled promotion"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Untrusted source",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "An untrusted document"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Repetition does not create new authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not as authority to change the workflow"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Preserve lineage",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve source trust and lineage"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Preserve source trust and lineage"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Validate procedure",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "validate it against current trusted requirements"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "validate it against current trusted requirements"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which derived entries inherited this poisoned claim?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "identify derived entries"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "memory-poisoning"
        }
      ]
    },
    {
      "id": "evaluation",
      "title": "Measure value and expose hidden state",
      "question": "Did memory improve the outcome or merely skip necessary work?",
      "outcome": "Compare recurring, novel, stale, and conflicting cases with visible recall.",
      "beats": [
        {
          "id": "memory-evaluation",
          "role": "transfer",
          "title": "Compare useful recall with the failure cases it can hide",
          "speech": "Evaluate the same task distribution with and without recall. Separate recurring problems, novel tasks, stale procedures, and conflicting evidence. Include two tenants with identical terms, repeated claims from one source, a corrected user preference, an invalid key, and a revoked source. Require scope isolation, no confidence gain from copied lineage, correct preference handling, visible staleness, and rejection of the unsafe key. Verify preview mode leaves all stored bytes unchanged. Record which memories were loaded and independently check the final outcome. Fewer calls are not a success if a remembered claim caused the system to skip a necessary check. Use test-only namespaces for experiments and preserve real user records. The useful result is a demonstrated benefit under stated conditions with observable failure limits.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Evaluate recurring value and concrete memory failures"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Cross-tenant match",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "two tenants with identical terms"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Copied lineage",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "repeated claims from one source"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Stale or revoked",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "a revoked source"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "No-write preview",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "preview mode leaves all stored bytes unchanged"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the trace show exactly which memory shaped the action?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Record which memories were loaded"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Fewer calls do not justify skipped acceptance checks",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "skip a necessary check"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "memory-evaluation"
        },
        {
          "id": "memory-recap",
          "role": "reflect",
          "title": "Remember evidence and conditions, not just conclusions",
          "speech": "Capture useful observations with provenance and honest validation status. Consolidate wording without inventing independent support. Enforce authorized scope before ranking and keep recall bounded but sufficient. Make updates atomic, conditional, and consistent with the documented behavior of a preview. Retire outdated or manipulated guidance with the correct archive, invalidation, or deletion behavior. Those are five principles to retain. Remember: capture, qualify, scope, validate, retire. Persistent retrieval can improve a future starting point, but storage and popularity do not establish truth. Discuss next: which frequently used memory may no longer match the system? Which apparent pattern actually comes from one repeated source? Apply this chapter by reviewing one useful procedure's evidence, conditions, permissions, and invalidation trigger, then test that stale or unauthorized recall cannot silently drive an action.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Useful memory preserves the basis for justified reuse"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Evidence and status",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Capture useful observations"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Scope and lineage",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Enforce authorized scope"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Controlled lifecycle",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Retire outdated or manipulated guidance"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: capture → qualify → scope → validate → retire",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: stale favorite? Repeated-source pattern?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "memory-recap-spoken-v2"
        }
      ]
    }
  ],
  "narrationSHA256": "e3670b56c0e210c01b84a7bd7da5a7c8248c355838fe263f770bad8ac818abbc"
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
