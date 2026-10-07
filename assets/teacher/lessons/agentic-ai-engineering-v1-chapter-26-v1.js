(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-26",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Human In / On / Out of the Loop",
  "subtitle": "Professor Mode · Effective review, bound approvals, capacity, and scoped autonomy",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-26/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-26/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 26, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "600562e3a94f8c36e62ca2a69afec0f18eb28442feda56bd799d1225e2d92392",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Make oversight effective at the point of consequence",
      "question": "What does a recorded approval actually establish?",
      "outcome": "Treat reviewer capacity and interface behavior as part of the system.",
      "beats": [
        {
          "id": "oversight-stakes",
          "role": "orient",
          "title": "A click is not proof of meaningful review",
          "speech": "An overloaded approval queue is our first case. In Marcus's fictional security workflow, critical findings rise sharply after a large acquisition. Reviewers begin processing notifications quickly, and a confusing mobile interface contributes to an override that allows a vulnerable change through. The automated finding, reviewer capacity, button design, and backend authority all belong to the same control system. A stale deployment approval is our second case. The reviewer inspects commit A, but commit B becomes current before the response arrives. A generic approval button must not authorize that different artifact. A clean operating history is our third case. Hundreds of runs have no observed critical failure, yet the next task uses a new language and unfamiliar conventions. Past evidence does not automatically justify the same autonomy in that new setting. These cases are illustrative, not measurements of a particular organization's reliability. Our governing question is: what does a recorded approval actually establish? We will position humans by decision type, bind approvals to operations, calculate capacity, and interpret clean-run evidence. By the end, you should be able to design oversight that remains meaningful when volume, artifacts, and operating conditions change.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Effective oversight includes people, interfaces, and backend authority"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Overloaded queue",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "An overloaded approval queue"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A recorded click alone does not prove effective review",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "all belong to the same control system"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Stale approval",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A stale deployment approval"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "New domain",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A clean operating history"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What does a recorded approval actually establish?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "oversight-stakes"
        },
        {
          "id": "oversight-system",
          "role": "derive",
          "title": "Inspect the whole decision path before assigning blame",
          "speech": "A correct automated finding is only one contribution to the outcome. The person must receive enough evidence, understand the available actions, have time and authority to decide, and submit a response the backend applies correctly. If labels are ambiguous or unsafe overrides are easy to trigger accidentally, the interface is part of the failure. If demand exceeds capacity, an approval log can preserve the appearance of supervision while actual scrutiny declines. Short response time alone does not prove careless review; a simple well-supported decision may be quick. Examine decision quality, representative samples, workload, and interface behavior together. The target is effective oversight, not a minimum number of comments or seconds.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Evidence → qualified decision → correct backend action"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Evidence",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "receive enough evidence"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Decision",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "time and authority to decide"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "time and authority to decide"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Action",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "the backend applies correctly"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "the backend applies correctly"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the interface cause a different action than the reviewer intended?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "unsafe overrides"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Review speed alone cannot establish carelessness or quality",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Short response time alone"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "oversight-system"
        }
      ]
    },
    {
      "id": "position",
      "title": "Choose human involvement per action class",
      "question": "Which decisions need prior judgment and which can be monitored?",
      "outcome": "Separate risk-based routing from review availability.",
      "beats": [
        {
          "id": "oversight-positions",
          "role": "explain",
          "title": "In, on, and out describe involvement in a particular decision",
          "speech": "In the loop means an action waits for a required human decision. On the loop means authorized work proceeds while a person monitors and can intervene through a tested mechanism. Out of the loop means individual routine runs need no ongoing human response, while configuration, audits, and exception handling still exist. One system can use all three positions for different action classes. Decide from consequence, reversibility, uncertainty, and applicable policy. Monitoring after execution cannot replace prior approval when that approval is required. A low-severity notification can go to a digest when its timing permits. Critical work does not become routine merely because the review queue is full.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Human position follows the action and its consequences"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "IN: prior decision",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "In the loop"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "ON: monitoring",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "On the loop"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "OUT: routine execution",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Out of the loop"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this action require judgment before it takes effect?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "prior approval"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Capacity pressure does not lower the underlying risk",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not become routine"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "oversight-positions"
        },
        {
          "id": "oversight-escalation",
          "role": "worked-example",
          "title": "A decision packet should reduce rediscovery",
          "speech": "For an injection finding, identify the input path, vulnerable operation, relevant source location, and supported impact. State what was examined or attempted, the available actions and tradeoffs, and the controller's policy if no response arrives. Avoid inventing an impact or claiming a fix has no affected callers without evidence. Make block, override, and defer actions unambiguous, including on mobile. An override may require a qualified identity and a reason under the applicable policy. Notification delivery is not authorization. A required unanswered decision remains held, pending, or expired according to the trusted policy. Silence is not approval, and repeated alerts must not hide the original deadline.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Escalation: evidence, attempted work, options, timeout policy"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Evidence",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "identify the input path"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Attempts",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "what was examined or attempted"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Options",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "available actions and tradeoffs"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Timeout",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "if no response arrives"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Are the choices and their consequences clear on the actual device?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "including on mobile"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Notification delivery and silence do not grant authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Notification delivery is not authorization"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "oversight-escalation"
        }
      ]
    },
    {
      "id": "decision",
      "title": "Bind an approval to the reviewed operation",
      "question": "Could an old notification authorize a different artifact?",
      "outcome": "Enforce identity, parameters, expiry, and one-use consumption.",
      "beats": [
        {
          "id": "oversight-bound-approval",
          "role": "derive",
          "title": "Bind the decision to the artifact, destination, and parameters",
          "speech": "An approval record should identify the exact artifact or operation, relevant parameters, destination, approving identity, policy version, expiry, and allowed use count. The backend authenticates the responder, checks their authority, verifies that the operation is still current, and atomically consumes a valid one-use decision. If the artifact hash or deployment target changes, invalidate affected approval. Duplicate notification delivery must not duplicate the external action. A text value saying approve does not establish permission. The trusted controller interprets a permitted decision under policy. Keep evidence of what the reviewer actually saw and what operation was authorized so later recovery can distinguish an old decision from current permission.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Bound operation → authorized response → atomic consumption"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Operation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the exact artifact or operation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Responder",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "authenticates the responder"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "authenticates the responder"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Consume",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "atomically consumes"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "atomically consumes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A changed artifact or target can invalidate the approval",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "invalidate affected approval"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What exact operation did the reviewer authorize?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "what the reviewer actually saw"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "oversight-bound-approval-spoken-v2"
        },
        {
          "id": "oversight-stale-notification",
          "role": "worked-example",
          "title": "Approval of commit A cannot silently deploy commit B",
          "speech": "The reviewer opens a notification for commit A. While it is pending, a worker produces commit B. When the response arrives, the backend compares the bound artifact with the current operation. It may authorize only A if that operation remains valid, or reject the response as stale. It must not deploy B because both revisions share a task title. Preserve the original decision and show the current revision and expiry reason. Request a new decision only where the new operation still requires one. Two concurrent reviewers also need atomic handling so one-use authority is not consumed twice. The notification is a view onto a durable decision record, not the authority record by itself.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Review A → candidate becomes B → reject stale authorization for B"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Review A",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "notification for commit A"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "New B",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "produces commit B"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "produces commit B"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Validate",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "the backend compares"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "the backend compares"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is the old approval still valid for its original operation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "if that operation remains valid"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A shared task title does not transfer approval to another revision",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "share a task title"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "oversight-stale-notification"
        }
      ]
    },
    {
      "id": "capacity",
      "title": "Keep real review sustainable",
      "question": "What happens when genuine demand exceeds qualified capacity?",
      "outcome": "Hold unsafe actions and reduce avoidable load without hiding risk.",
      "beats": [
        {
          "id": "oversight-capacity",
          "role": "derive",
          "title": "Capacity must be measured in genuine review work",
          "speech": "Suppose four qualified reviewers can each handle two critical findings per day alongside their other duties. Their illustrative daily capacity is eight. If nine new distinct critical findings arrive every day, the queue grows by at least one per day under those assumptions. Variability, absences, and longer cases can make waiting worse. Faster clicking does not increase the capacity for genuine judgment. Hold affected unsafe actions, assign clear owners, add qualified backup coverage, and slow risky intake when necessary. First distinguish duplicates, false positives, and a real increase in risk. Correct false positives using evidence, but preserve the severity of real critical findings. A growing queue is a capacity problem, not permission to relabel risk.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Illustrative capacity: 4 reviewers × 2/day = 8/day"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Capacity: 8/day",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "daily capacity is eight"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Arrivals: 9/day",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "nine new distinct critical findings"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Backlog: ≥1/day",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "the queue grows by at least one"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Hold unsafe work and resource genuine review",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Hold affected unsafe actions"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Are arrivals duplicates, false alarms, or real additional risk?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "distinguish duplicates, false positives"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "oversight-capacity"
        },
        {
          "id": "oversight-monitoring",
          "role": "explain",
          "title": "Reduce avoidable interruption without losing urgent containment",
          "speech": "Combine repeated notifications about the same root issue while preserving distinct affected actions. Batch lower-urgency information when the response window permits. Keep time-critical containment within its safe deadline. Monitor how long items have been waiting, the quality of decisions, response patterns, and representative review samples. Universal rapid approval without evidence may warrant an audit, but it does not by itself establish a reviewer's intent. Aggregate dashboards and anomaly detection help direct attention across many workflows. They still need independent outcome sampling because correlated evaluator errors can make every dashboard look healthy. Match audit cadence and sample coverage to consequence, change frequency, and uncertainty rather than relying on a universal schedule.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Manage load while retaining meaningful evidence and deadlines"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Deduplicate",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Combine repeated notifications"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Batch appropriately",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Batch lower-urgency information"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could batching delay necessary containment beyond its safe window?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "safe deadline"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Audit quality",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "independent outcome sampling"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Green aggregate metrics do not replace independent samples",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "every dashboard look healthy"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "oversight-monitoring-spoken-v2"
        }
      ]
    },
    {
      "id": "evidence",
      "title": "Earn and retain scoped autonomy",
      "question": "How much does a clean track record establish?",
      "outcome": "Use prospective evidence, explicit assumptions, and scoped containment.",
      "beats": [
        {
          "id": "oversight-zero-failures",
          "role": "derive",
          "title": "Zero observed failures leaves uncertainty about the true rate",
          "speech": "Assume independent trials with a constant unknown failure probability. The probability of observing zero failures across a fixed number of runs is one minus that failure probability, raised to the number of runs. For a one-sided ninety-percent upper confidence bound after two hundred clean runs, set that zero-failure probability to one tenth and solve for the failure rate. The formula on the board gives an upper bound of about one point one five percent. It does not establish a rate below half a percent. Correlated runs or an unrepresentative task mix weaken the interpretation further. Choose the sample and acceptable risk prospectively, and examine consequential failure modes rather than treating a clean streak as proof of safety.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Zero failures: solve (1−p)^n = α"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Assumption",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Assume independent trials"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "n = 200; α = 0.1",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "two hundred clean runs"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "One-sided 90% upper bound: p = 1 − 0.1^(1/200)",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The formula on the board"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Upper bound ≈ 1.15%",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "about one point one five percent"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Do independence and representative sampling hold here?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Correlated runs"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "oversight-zero-failures"
        },
        {
          "id": "oversight-scoped-autonomy",
          "role": "derive",
          "title": "Autonomy belongs to a system in a particular context",
          "speech": "Use shadow decisions with independent review to assess the action class before reducing oversight. High agreement alone can hide rare consequential misses, so inspect adjudicated errors, coverage, and uncertainty. The accountable authority decides whether the residual risk is acceptable. Record the domain, repository, policy, model and tool configuration, evidence age, and containment mechanism. A track record on one language does not automatically transfer to another. Changes in review volume or interface behavior can also invalidate the justification even when the model is unchanged. Predeclare containment for affected permissions after serious failures. Test the ability to halt and reconcile actions instead of assuming that an oversight-level label makes recovery work.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Scoped evidence → accountable decision → monitored containment"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Evidence",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Use shadow decisions"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Decision",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The accountable authority decides"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "The accountable authority decides"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A new domain or operating context may need new evidence",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not automatically transfer"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What changed since this autonomy decision was justified?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "can also invalidate the justification"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Containment",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Predeclare containment"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Predeclare containment"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "oversight-scoped-autonomy"
        }
      ]
    },
    {
      "id": "exercise",
      "title": "Test the complete human decision boundary",
      "question": "Can replay, silence, or a stale response trigger an action?",
      "outcome": "Verify backend authority and effective oversight end to end.",
      "beats": [
        {
          "id": "oversight-callback-tests",
          "role": "transfer",
          "title": "Exercise the backend, not just the approval button",
          "speech": "Test callback replay, an unauthorized responder, expired authority, changed artifact hashes, and two reviewers responding concurrently. Only the valid current authorized decision may consume one-use permission. Test an unanswered required approval: the action remains held and the durable pending or expired state stays visible. Replayed messages must not restart a completed action or extend the deadline silently. Change the repository or input language and verify that unrelated historical successes do not grant new autonomy. Sample actual reviewer decisions and inspect the mobile interface under realistic workload. This exercise succeeds when the complete decision path enforces the intended action and preserves uncertainty, not merely when notifications arrive and buttons respond.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Test replay, identity, expiry, and changed artifacts"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Replay",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "callback replay"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Identity",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "an unauthorized responder"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Expiry",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "expired authority"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Changed artifact",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "changed artifact hashes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An unanswered required approval keeps the action held",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "the action remains held"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the backend enforce exactly the reviewed operation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the complete decision path"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "oversight-callback-tests"
        },
        {
          "id": "oversight-recap",
          "role": "reflect",
          "title": "Effective oversight is a tested system property",
          "speech": "Position humans by action class and consequence. Give reviewers evidence, clear choices, and a policy for silence. Bind approval to the exact operation and consume authority atomically. Plan capacity for genuine review and hold unsafe work when demand exceeds it. Interpret reliability evidence with explicit assumptions and keep autonomy scoped to the tested context. Remember: position, inform, bind, resource, reassess. Monitor actual decision quality and test containment rather than treating a click log as assurance. Discuss next: which old notification could authorize a changed artifact? Which queue is growing faster than qualified review capacity? Next we will examine the economics that determine whether verified work is affordable.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Human oversight requires evidence, capacity, and bound authority"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Action-specific position",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Position humans"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Bound approval",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Bind approval"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Scoped evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "keep autonomy scoped"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: position → inform → bind → resource → reassess",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: stale approval? Growing review backlog?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "oversight-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "e598fc9f0f9926287d229183212f9e45e43ab90aab2c90aa81f4c3f3b2492e55"
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
