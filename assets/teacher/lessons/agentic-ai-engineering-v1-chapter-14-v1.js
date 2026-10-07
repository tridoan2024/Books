(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-14",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Triggers and Automations — The Heartbeat",
  "subtitle": "Professor Mode · durable admission, event identity, capacity, and liveness",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-14/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-14/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 14, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "edbb087c4df53f046802d1a515f3555cc8e94909f8032ff256f400848ac75939",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Make expected work start and remain observable",
      "question": "How does an event become durable, authorized, and completed work?",
      "outcome": "Separate initiation, admission, execution, and useful outcome.",
      "beats": [
        {
          "id": "trigger-stakes",
          "role": "orient",
          "title": "A useful loop can still fail to run when needed",
          "speech": "A security review that never starts is our first case. The chapter describes a fictional team with a useful review loop. Its execution depends on someone remembering to start it. A vulnerable change is merged without that review. The story establishes a missed initiation; it does not prove the reviewer would have detected that particular defect. A duplicate webhook is our second case. A sender repeats a delivery after losing the response, and an unprepared receiver starts the same work twice. A trigger storm is our third case. Many changes arrive together, exceeding the workers and spending capacity available to process them. These cases show that automatic initiation needs its own engineering, separate from the reasoning inside the loop. A manually started workflow can still use feedback, and an automatic trigger does not guarantee coverage or completion. Our governing question is: how does an event become durable, authorized, and completed work? We will choose trigger types and establish business identity. We will store admission before sending confirmation, manage overlapping work within budget, and test silence as well as visible errors. By the end, you should be able to explain exactly what the sender's acknowledgment proves and what evidence still must arrive before the work is done.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Starting work is only the first reliability boundary"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Missed initiation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A security review that never starts"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Duplicate delivery",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A duplicate webhook"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Arrival storm",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A trigger storm"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Automatic initiation does not prove completed work",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not guarantee coverage or completion"
            },
            {
              "action": "note",
              "id": "question",
              "text": "How does an event become durable, completed work?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "trigger-stakes-spoken-v2"
        },
        {
          "id": "trigger-taxonomy",
          "role": "explain",
          "title": "Choose the source and its delivery assumptions",
          "speech": "Scheduled execution suits work that can be processed periodically. Define timezone, daylight-saving behavior, missed scheduled executions, and recovery after restart. An event trigger follows a platform transition, often delivered by webhook; authenticate the source rather than trusting a payload's claim. A threshold trigger responds to a metric crossing and needs a policy for continuing incidents and recovery. A dependency trigger starts dependent work after the earlier stage has the required evidence. These categories can overlap in one system. A webhook describes transport, while a business event describes what happened. Every source can have delays, duplicates, or missing observations. Choose latency and recovery behavior for the actual workload, and keep a failed upstream stage from silently authorizing downstream work that depends on it.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Trigger categories carry different timing and evidence needs"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Schedule",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Scheduled execution"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Event / webhook",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "An event trigger"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A webhook transport is not proof of a trusted event",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "authenticate the source"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Threshold",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "A threshold trigger"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Chained work",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "A dependency trigger"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What happens to missed or delayed initiation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "recovery behavior"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "trigger-taxonomy-spoken-v2"
        }
      ]
    },
    {
      "id": "admission",
      "title": "Acknowledge only work that has been stored durably",
      "question": "What identity survives duplicate delivery and process failure?",
      "outcome": "Distinguish delivery identity from the business operation and its state.",
      "beats": [
        {
          "id": "trigger-durable-inbox",
          "role": "derive",
          "title": "Durable admission precedes acknowledgement",
          "speech": "Authenticate the sender and enforce payload limits before deriving event identity. In one durable transaction, record the delivery receipt and create the pending business-work item if it is new. Acknowledge only after that transaction commits. An in-memory seen set and a newly scheduled coroutine can both disappear in a crash after the acknowledgement. The sender then believes delivery succeeded while no recoverable work remains. Keep pending, leased, completed, failed, and reconciliation-required states distinct. Duplicate delivery of pending work is not evidence of completion. If a payload conflicts with the existing business key, surface that conflict rather than silently rewriting the record. The admission boundary promises durable responsibility for the item, not that the requested review or external effect already succeeded.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Authenticate → durable admission → acknowledge"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Authenticate",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Authenticate the sender"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Store work",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "In one durable transaction"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "In one durable transaction"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Acknowledge",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Acknowledge only after"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Acknowledge only after"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What survives a crash immediately after acknowledgement?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "can both disappear in a crash"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Acknowledgement promises storage, not completion",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not that the requested review"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "trigger-durable-inbox"
        },
        {
          "id": "trigger-business-identity",
          "role": "worked-example",
          "title": "Delivery identity and work identity answer different questions",
          "speech": "A pull-request review can use tenant, repository, pull-request number, policy revision, and commit identity to define the business operation. Repeated deliveries for that same review map to one work item. A new commit or changed review policy may define different work. Preserve the transport delivery identifier separately for ingress evidence. For ticket transitions, two genuine moves to the same destination status are distinct occurrences; a key containing only the ticket and status can incorrectly collapse them. Use documented transition identity or another source-supported occurrence identifier. A payload hash detects byte-level agreement under canonical encoding, but identical values can occur in two legitimate events. Choose identity from the operation semantics and retain conflicts instead of guessing that matching text means duplicate work.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Identity must preserve the business occurrence"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Business key",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "define the business operation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Delivery ID",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "transport delivery identifier"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "New occurrence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "distinct occurrences"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this key collapse a later valid transition?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "incorrectly collapse them"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Identical values can describe distinct legitimate events",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "identical values can occur"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "trigger-business-identity"
        }
      ]
    },
    {
      "id": "overlap",
      "title": "Control concurrent work on the same resource",
      "question": "When should new work wait, replace, or supersede an active run?",
      "outcome": "Choose overlap policy and enforce ownership at publication.",
      "beats": [
        {
          "id": "trigger-overlap-policy",
          "role": "explain",
          "title": "Skip, queue, and replace have different correctness costs",
          "speech": "Skipping a new event is appropriate only when the running work or a defined later scan will cover the new event within an acceptable delay. Holding work in a queue preserves it for later execution. Its order and waiting time remain visible. Replacing active work can be useful when a new revision invalidates the active run, as in a review of an old commit. These policies must follow the resource semantics, not merely a global indicator that something is running. Serialize incompatible updates to one repository and its specific pull request while allowing unrelated resources to progress. If events are coalesced, record which revisions were superseded and which revision was actually reviewed. Do not call a discarded or superseded event completed. A queue also does not guarantee exactly-once external effects; crashes still require identity and reconciliation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Overlap policy determines what happens to new work"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Skip with coverage",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Skipping a new event is appropriate"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Durable queue",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Holding work in a queue"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Replace stale run",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Replacing active work can be useful"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which resource requires exclusive update ownership?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the resource semantics"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Superseded and completed are different states",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Do not call a discarded or superseded event completed"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "trigger-overlap-policy-spoken-v2"
        },
        {
          "id": "trigger-fenced-replace",
          "role": "predict",
          "title": "Cancellation must be backed by stale-writer rejection",
          "speech": "A new commit arrives while the old review is posting a comment. Canceling its local task requests a stop, but the remote operation may still complete. Assign increasing worker generations and enforce current ownership at storage and publication boundaries. An obsolete worker must not publish a result over state belonging to the new revision. Wait for owned incompatible local execution to stop before starting replacement work on the same resource. Preserve any uncertain remote effect for reconciliation. Replacing a file instead of appending to it can prevent duplicate lines. It can still allow an old run to overwrite newer content. Check the expected source revision or use conditional publication. The prompt asking an old worker to stop is a coordination message; the component accepting writes must enforce current authority.",
          "boardActions": [
            {
              "action": "clear",
              "title": "New revision → fence old worker → conditional publication"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "New revision",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A new commit arrives"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Cancellation is a request; stale writes need enforcement",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "requests a stop"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could the old remote operation still finish?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "may still complete"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Fence ownership",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Assign increasing worker generations"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Assign increasing worker generations"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Conditional publish",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "use conditional publication"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "use conditional publication"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "trigger-fenced-replace-spoken-v2"
        }
      ]
    },
    {
      "id": "limits",
      "title": "Keep overload and continuing incidents explicit",
      "question": "How can the trigger honor budgets without losing deferred work?",
      "outcome": "Use reservations, capacity accounting, and threshold recovery boundaries.",
      "beats": [
        {
          "id": "trigger-capacity-budget",
          "role": "derive",
          "title": "Reserve the budget before concurrent work spends it",
          "speech": "A daily spending counter checked after calls finish is an alarm, not a hard ceiling. Concurrent workers can all observe remaining capacity and overspend unless admission reserves resources atomically. Include bounded output and relevant tool charges in the reservation policy. Start admitted work only under the reserved allowance, then reconcile actual cost. Keep events that cannot be admitted in a durable deferred state according to the contract. A five-minute response target and a fixed daily budget cannot both be guaranteed under unlimited arrivals. Report the service-target breach when capacity is insufficient. Track queue age as well as queue length, because a small backlog can still contain very old work. Budget control should make overload visible rather than dropping required events to keep the dashboard green.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Atomic reservation → admitted work → cost reconciliation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Reserve",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "reserves resources atomically"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Admit",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Start admitted work"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Start admitted work"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "reconcile actual cost"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "reconcile actual cost"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A deadline and fixed budget cannot cover unlimited arrivals",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot both be guaranteed"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which deferred event has waited the longest?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Track queue age"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "trigger-capacity-budget"
        },
        {
          "id": "trigger-threshold-hysteresis",
          "role": "worked-example",
          "title": "A continuing incident needs a recovery definition",
          "speech": "An error metric stays above its firing threshold for ten minutes. A timer alone may repeatedly start diagnostics for the same incident whenever cooldown expires. Add a recovery boundary below the firing threshold so the system can distinguish a continuing condition from a new crossing. This hysteresis also reduces repeated transitions caused by small fluctuations near one boundary. Define how long recovery must hold, whether diagnostic work can overlap, and when another observation is useful. Missing telemetry is unknown, not zero errors. Test noise around both boundaries, an incident longer than cooldown, and an outage of the monitoring source. Threshold values and timing are policy choices for the particular service; the chapter's example numbers are not universal defaults.",
          "boardActions": [
            {
              "action": "clear",
              "title": "An incident needs firing, persistence, and recovery semantics"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Fire",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "its firing threshold"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Cooldown alone does not distinguish a new incident",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A timer alone may repeatedly start"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Recover",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a recovery boundary"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Unknown",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Missing telemetry is unknown"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Has the condition recovered, or only the timer expired?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "an incident longer than cooldown"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "trigger-threshold-hysteresis"
        }
      ]
    },
    {
      "id": "liveness",
      "title": "Detect missing work and test crash boundaries",
      "question": "What can an acknowledgement or heartbeat actually prove?",
      "outcome": "Observe ingress, backlog, completion, and external effects separately.",
      "beats": [
        {
          "id": "trigger-liveness",
          "role": "explain",
          "title": "Observe the absence of expected work",
          "speech": "A stopped scheduler may produce no local error because it sends nothing. Compare expected schedule instances with durable admission and completed results. For event sources, a quiet period can mean either no events occurred or delivery failed. Reconcile against the source when possible and use a non-mutating synthetic event with a unique instance identity to exercise the path. Track ingress, admission, worker progress, backlog age, and useful completion separately. A successful endpoint response does not prove that the review finished or that its comment reached the intended commit. Give alerts an owner and size the monitoring to the consequence of missed work. A heartbeat checks the path it traverses; it does not establish the correctness of every real review.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Expected activity → admitted work → completed outcome"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Expected event",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "expected schedule instances"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Admission",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "durable admission"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "durable admission"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Completion",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "completed results"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "completed results"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is silence normal, lost delivery, or stalled work?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "either no events occurred or delivery failed"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An acknowledgement does not prove the external outcome",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not prove that the review finished"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "trigger-liveness"
        },
        {
          "id": "trigger-crash-test",
          "role": "check",
          "title": "Crash where responsibility changes hands",
          "speech": "Deliver the same event twice to a disposable receiver. Stop the receiver immediately after durable commit, then restart it. There should be one recoverable business-work item. Next stop a worker after the mock service accepts a comment but before local completion is recorded. Recovery must not create a duplicate comment. That final property requires receiver-side operation identity or a queryable receipt; the inbox alone cannot prove whether the effect happened. Also test a deferred event across cooldown and restart so it is not permanently marked seen before it becomes eligible. Keep admission, completion, supersession, and uncertain-effect states visible. A successful happy-path demo does not cover these ownership transitions.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Duplicate delivery → restart → reconcile accepted effect"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Duplicate",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Deliver the same event twice"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Restart",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "then restart it"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "then restart it"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Effect uncertainty",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "before local completion is recorded"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "before local completion is recorded"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can recovery preserve work without duplicating the comment?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "must not create a duplicate comment"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The inbox alone cannot prove a remote effect",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "the inbox alone cannot prove"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "trigger-crash-test"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Make an infeasible target visible",
      "question": "What should happen when arrivals exceed admitted capacity?",
      "outcome": "Test storms and publish honest completion and deferral states.",
      "beats": [
        {
          "id": "trigger-storm-exercise",
          "role": "transfer",
          "title": "Calculate capacity before promising a deadline",
          "speech": "For a burst of review events, state the worker duration, concurrency, per-run reservation, and arrival timing before estimating throughput. Event count alone does not determine how many reviews finish. Choose per-resource overlap rules, a durable queue, and admission limits that fit the available capacity. If the requested deadline is infeasible, report the breach and the deferred work explicitly. Test simultaneous reservations near the remaining budget and require accepted reservations to stay within it. Replay two distinct transitions with the same destination status and verify that both remain represented, while redelivery adds no new work. Include a new commit arriving during publication by an older worker. The exercise succeeds when the recorded states accurately describe what was admitted, superseded, completed, or left unresolved.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Storm handling starts with explicit capacity assumptions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Duration",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "worker duration"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Concurrency",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "concurrency"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reservations",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "per-run reservation"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Arrival timing",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "arrival timing"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Infeasible deadlines must remain visible",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "report the breach"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which events were completed versus intentionally superseded?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "superseded, completed, or left unresolved"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "trigger-storm-exercise"
        },
        {
          "id": "trigger-recap",
          "role": "reflect",
          "title": "Admit durably, identify correctly, and expose unfinished work",
          "speech": "Choose trigger semantics for the real workload. Store accepted work durably before acknowledgement. Distinguish business identity from delivery identity and enforce current ownership. Reserve budgets before spending and preserve deferred work. Monitor missing activity and test recovery around external effects. Those are five principles to retain. Remember: admit, identify, fence, reserve, observe. Automatic initiation is useful only when the system can account for the work it accepted and the outcome it actually produced. Discuss next: which acknowledgement in your system is mistaken for completion? Which duplicate key could collapse a later legitimate event? Apply this chapter to one trigger with a durable inbox, explicit overlap policy, capacity limit, liveness signal, and crash-recovery fixture. Keep the unfinished states honest even when the system is overloaded.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A reliable trigger accounts for accepted and unfinished work"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Durable admission",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Store accepted work durably"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Correct identity",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Distinguish business identity"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Visible outcomes",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Monitor missing activity"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: admit → identify → fence → reserve → observe",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: premature completion? Colliding event key?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "trigger-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "493c8a1f46754a51fc0bb3474b38868ccc0d48751175852e4ac212c95b57645a"
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
