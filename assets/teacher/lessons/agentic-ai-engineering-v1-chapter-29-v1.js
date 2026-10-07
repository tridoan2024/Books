(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-29",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Observability, Tracing, and Replay",
  "subtitle": "Professor Mode · Task evidence, honest metrics, isolated replay, and durable recovery",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-29/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-29/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 29, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "0efc47c5577f4bbd8cf5dd99240e76e817e967963b6607a7acfd6d36ac5cacdf",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Connect operational symptoms to task evidence",
      "question": "What can a healthy-looking output conceal?",
      "outcome": "Trace cost, attempts, evaluation, and effects as one delivery path.",
      "beats": [
        {
          "id": "observability-stakes",
          "role": "orient",
          "title": "Normal review output can hide abnormal execution",
          "speech": "An expensive code review is our first case. In the chapter's fictional scenario, a performance specialist repeatedly reads a large generated file while a separate formatting error keeps the review from passing. The visible comments look ordinary, but repeated work increases consumption. Aggregate provider usage cannot identify the business task or evaluator failure responsible. A crashed external request is our second case. The tool sent an operation, but the worker died before recording its completion. Missing telemetry does not tell us whether the operation happened. A debugging replay is our third case. An engineer wants to reproduce the old execution, but a live tool adapter could submit the operation again. These are illustrative failure scenarios. They connect through the same problem: operational observations need identity, provenance, and an explicit account of missing evidence. Our governing question is: can we explain and recover a run without inventing certainty or repeating its effects? We will connect tasks to spans, interpret health metrics, isolate replay, and distinguish debug logs from durable business records. By the end, you should be able to design a trace that supports a concrete investigation and a safe recovery decision.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Observe the task, its attempts, and its external effects"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Hidden repeated work",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "An expensive code review"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Unknown effect",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A crashed external request"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Missing telemetry does not establish a failed operation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Missing telemetry does not tell us"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Replay risk",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A debugging replay"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can we explain and recover a run without repeating its effects?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "observability-stakes"
        },
        {
          "id": "observability-cost-evidence",
          "role": "worked-example",
          "title": "A token explanation is not yet an invoice explanation",
          "speech": "Seven reads of a forty-two-thousand-token file contribute two hundred ninety-four thousand input tokens. At the illustrative rate of three dollars per million uncached input tokens, that costs less than one dollar. The board gives the exact amount. It cannot by itself explain a daily bill of several hundred dollars. Likewise, half of the token volume need not be half of the monetary cost when models and billing categories differ. Trace the repeated file read as one diagnosed waste mechanism, then reconcile the full bill separately. A useful investigation distinguishes the observed repetition, its calculated cost under stated assumptions, and the remaining unexplained spending. Do not let a plausible story substitute for that accounting.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Diagnosed repetition and reconciled spending are different claims"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "7 reads",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Seven reads"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "294,000 input tokens",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "two hundred ninety-four thousand"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "294,000 × $3 / 1,000,000 = $0.882 under the stated assumptions",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "At the illustrative rate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Cost: $0.882",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The board gives"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What spending remains unexplained after this calculation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "remaining unexplained spending"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "observability-cost-evidence"
        }
      ]
    },
    {
      "id": "identity",
      "title": "Correlate work without confusing identities",
      "question": "Does restarting a trace authorize another external effect?",
      "outcome": "Separate diagnostic identity from business operation identity.",
      "beats": [
        {
          "id": "observability-span-model",
          "role": "derive",
          "title": "Extend service telemetry with loop semantics",
          "speech": "Retain latency, traffic, errors, and saturation from ordinary service monitoring. Add the business task, initiated run, attempts, model requests, tool calls, evaluator decisions, and accepted output. Propagate trace context from a lead to specialists and into the relevant service calls. Each iteration can contain child spans for its requests and tools. Record model identity, usage, duration, evaluator revision, verdict, and concise decision summaries. Store protected content separately when needed, with access and retention appropriate to its sensitivity. Summaries describe observable decisions; they do not expose private model reasoning. Keep queue delay, execution time, and end-to-end latency distinct, and retain incomplete or timed-out runs in the operational picture.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Business run → iteration → model and tool spans"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Preserve service telemetry and add task-specific relationships",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Retain latency"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Run",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "initiated run"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can this request be traced back to its task and evaluator decision?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Propagate trace context"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Iteration",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Each iteration"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Each iteration"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Child spans",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "child spans for its requests"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "child spans for its requests"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "observability-span-model"
        },
        {
          "id": "observability-three-identities",
          "role": "derive",
          "title": "Trace identity does not replace operation identity",
          "speech": "A trace identifier correlates telemetry. A run identifier names one execution. An operation identifier names an intended external effect. A restart can create a new run and trace while retaining the same business operation. Otherwise retrying a payment, comment, or deployment can silently create another action. Attach the operation identity, target resource version, authorization decision, and provider request identity to the relevant evidence. Parent-child spans explain execution relationships, but they do not grant authority. A span saying request sent establishes an attempted dispatch. It does not establish remote success or failure. That distinction determines whether recovery should query and reconcile rather than submit again.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Diagnostic identity and business identity serve different purposes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Trace: correlation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A trace identifier"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Run: execution",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A run identifier"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Operation: effect",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "An operation identifier"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A restarted run may retain the original operation identity",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "retaining the same business operation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does request sent establish the remote outcome?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A span saying request sent"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "observability-three-identities"
        }
      ]
    },
    {
      "id": "metrics",
      "title": "Interpret metrics with their denominators",
      "question": "Can a better average hide abandoned work?",
      "outcome": "Use task cohorts, unresolved outcomes, and calibrated evidence.",
      "beats": [
        {
          "id": "observability-denominators",
          "role": "predict",
          "title": "Predict how abandoned hard tasks change a dashboard",
          "speech": "Suppose the system stops attempting its hardest tasks. The average number of attempts per successful run falls. Predict whether that necessarily means the system improved. It does not: the successful subset may simply have become easier. Report the number of attempts used by successful runs alongside overall completion, work spent on failures, the configured cap, and unresolved tasks. Apply the same discipline to evaluator verdicts: state whether the denominator counts individual attempts or runs that have ended. Segment by task class and evaluator version. A high escalation rate may be appropriate when policy requires human judgment, while a low rate can conceal unauthorized autonomy. Compare escalation reason, time spent waiting for review, and review capacity with the intended authority boundary.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Averages need cohorts, denominators, and unresolved work"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Successful subset",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "average number of attempts per successful run"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did performance improve, or did the measured population change?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Predict whether"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Abandoning hard tasks can improve a conditional average",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "successful subset may simply have become easier"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "All initiated work",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "overall completion"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Human queue",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "time spent waiting for review"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "observability-denominators-spoken-v2"
        },
        {
          "id": "observability-diagnostic-signals",
          "role": "explain",
          "title": "A trend narrows investigation; it does not prove a cause",
          "speech": "Rising cost with stable acceptance suggests investigating usage, task mix, and prices. More inconclusive verdicts may indicate missing evidence, a tool failure, or evaluator coverage gaps. Alternating scores may reflect conflicting requirements, noisy scoring, or actual cycling. These observations guide investigation; no universal count or percentage proves the diagnosis. Calibrate alerts on representative historical windows and important failure cases. A mean and standard deviation alone do not determine a one-percent false-alarm threshold without additional distribution and dependence assumptions. Monitor immediate high-consequence events as well as slow trends. Keep dashboard visibility separate from trusted enforcement of budgets, deadlines, and consequential actions.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Signals → candidate causes → evidence-based diagnosis"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Cost growth",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Rising cost with stable acceptance"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Inconclusive verdicts",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "More inconclusive verdicts"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Alternating scores",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Alternating scores"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What additional observation distinguishes these possible causes?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "guide investigation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Alert thresholds need workload evidence and explicit assumptions",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Calibrate alerts"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "observability-diagnostic-signals"
        }
      ]
    },
    {
      "id": "replay",
      "title": "Reproduce observations without repeating effects",
      "question": "What does deterministic replay actually reproduce?",
      "outcome": "Control the harness environment and fail explicitly on divergence.",
      "beats": [
        {
          "id": "observability-replay-contract",
          "role": "derive",
          "title": "Replay substitutes recorded observations",
          "speech": "Record and replay supplies captured model outputs and tool observations to the harness. Reproducing its decisions requires the relevant code, state, ordering, clocks, randomness, and environment to be controlled. A new live model request is a counterfactual evaluation, because it can produce a different response. Label that mode separately and mock its effects. Neither mode reveals private internal reasoning or proves the psychological reason for a model choice. Match recorded invocations by stable identity, canonical arguments, and resource versions. Checking only a tool name is insufficient: reading a different file is a different observation. Concurrent calls require causal relationships rather than a single global completion index.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Recorded replay and fresh evaluation answer different questions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Recorded observations",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "captured model outputs"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Controlled harness",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "code, state, ordering"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Fresh evaluation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A new live model request"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Neither mode reveals private internal reasoning",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Neither mode reveals"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Do invocation identity, arguments, and resource version match?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Match recorded invocations"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "observability-replay-contract"
        },
        {
          "id": "observability-replay-isolation",
          "role": "worked-example",
          "title": "Missing evidence must stop replay at the gap",
          "speech": "Imagine a recording contains a tool response for one repository revision, while the replay requests another revision. Reject that mismatch as divergence. Do not fetch a live result to fill the hole. Replace every side-effecting adapter and deny unexpected network, filesystem, and queue operations. Validate recording schemas, nested spans, bounds, and completion of the expected sequence. When observations are missing, report the first gap and the resulting limit on reproducibility. A replay that quietly submits a live deployment is a new execution with real consequences. Test isolation by deliberately requesting an unrecorded operation and verifying that it is rejected before any external adapter can act.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Requested invocation → recording match → observation or explicit divergence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Request",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the replay requests another revision"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Match",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Reject that mismatch"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Reject that mismatch"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Never fill missing replay evidence with a live mutation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Do not fetch a live result"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Gap visible",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "report the first gap"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "report the first gap"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can an unexpected operation reach any real adapter?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Test isolation"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "observability-replay-isolation"
        }
      ]
    },
    {
      "id": "durability",
      "title": "Protect evidence according to consequence",
      "question": "Which records may safely be lost?",
      "outcome": "Separate debug telemetry from a durable effect journal.",
      "beats": [
        {
          "id": "observability-effect-journal",
          "role": "derive",
          "title": "A debug span and an effect record have different durability needs",
          "speech": "Best-effort debug telemetry may lose a span under load if the gap remains visible. The only record of a consequential intended effect needs stronger durability. Record that intent before dispatch, then reconcile its remote outcome after a crash. A transactional outbox can commit local business state together with an outbound entry. Its relay may still deliver duplicates, so consumers need deduplication. A remote service outside that transaction needs its own operation identity and reconciliation policy. Background flushing reduces some critical-path work but can lose unflushed data; it does not guarantee complete replay. Choose durability from consequence and recovery needs, and keep unknown external outcomes explicit until evidence resolves them.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Durable intent → external dispatch → outcome reconciliation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which lost record would make safe recovery impossible?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "only record of a consequential"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Intent",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Record that intent before dispatch"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Dispatch",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "then reconcile its remote outcome"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "then reconcile its remote outcome"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "after a crash"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "after a crash"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A local outbox does not guarantee exactly-once remote effects",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Its relay may still deliver duplicates"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "observability-effect-journal"
        },
        {
          "id": "observability-retention",
          "role": "worked-example",
          "title": "Retention occupancy differs from monthly ingestion",
          "speech": "Suppose eight thousand traces arrive each day. Retain full traces for three days, smaller metadata for the next eleven days, and minimal records for the following seventy-six days. These are mutually exclusive intervals, so each trace occupies one tier at a time. Multiply daily arrivals by each tier's residence time and average size. With the illustrative decimal sizes on the board, steady-state occupancy is about ninety-six gigabytes before indexes, replicas, and other overhead. Apply storage prices to that occupancy, while model charges follow initiated run volume. If both costs scale linearly with volume, their ratio does not acquire a magical crossover point. Real capacity steps and retention changes require separate modeling.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Illustrative steady-state storage: arrivals × residence × size"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Hot: 72 GB",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "full traces for three days"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Warm: 17.6 GB",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "next eleven days"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Cold: 6.08 GB",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "following seventy-six days"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "8,000/day × (3d × 3MB + 11d × 200KB + 76d × 10KB) = 95.68GB",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "illustrative decimal sizes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What overhead or retention change would break linear scaling?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Real capacity steps"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "observability-retention"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Design an observable recovery drill",
      "question": "Can the system explain an uncertain external request?",
      "outcome": "Expose gaps, reconcile the effect, and preserve the diagnostic record.",
      "beats": [
        {
          "id": "observability-crash-drill",
          "role": "transfer",
          "title": "Reconcile an unknown external effect without resubmitting it",
          "speech": "Crash a worker after it sends an external request but before the completion span is stored. The dashboard should show an unresolved effect, the durable operation identity, and the missing observation. Recovery queries the resource system according to its reconciliation contract. It must not fabricate a failure or automatically create a new operation identity. Inspect metadata privacy too: truncated arguments can still expose credentials, and ordinary hashes may reveal low-entropy identifiers through guessing. Use allowlisted fields, redacted errors, protected content pointers, tenant isolation, and appropriate retention. The drill succeeds when an operator can locate the gap, follow the evidence, and resolve the business state without a duplicate submission.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Crash after send → unresolved outcome → resource reconciliation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Crash",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Crash a worker"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Unknown outcome",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "an unresolved effect"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "an unresolved effect"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Recovery queries"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Recovery queries"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Missing completion telemetry is not a remote failure verdict",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "must not fabricate a failure"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can an operator recover using identity and evidence alone?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "The drill succeeds"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "observability-crash-drill"
        },
        {
          "id": "observability-recap",
          "role": "reflect",
          "title": "Observability makes uncertainty inspectable",
          "speech": "Connect business tasks to attempts, evaluator decisions, requests, and effects. Keep trace, run, and operation identities distinct. Interpret metrics with explicit cohorts and unresolved outcomes. Reconcile costs rather than equating token share with spending share. Replay recorded observations in an isolated environment and label fresh model experiments separately. Match record durability and privacy controls to consequence. Remember: correlate, qualify, reconcile, isolate, recover. Apply this sequence to an operation that could succeed remotely just before its worker crashes. Discuss next: which dashboard average excludes failed work? Which replay adapter could still perform a real action? Next we turn to the security boundaries of autonomous loops.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Useful traces preserve identity, evidence, and visible gaps"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Identity",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep trace, run, and operation identities"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Qualified metrics",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Interpret metrics"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Isolated replay",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Replay recorded observations"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: correlate → qualify → reconcile → isolate → recover",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: hidden failed work? Live replay adapter?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "observability-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "5699f6c14cb1974e8400f8e124846f48f9b7e53933f5d0483dedc02a5567bdfb"
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
