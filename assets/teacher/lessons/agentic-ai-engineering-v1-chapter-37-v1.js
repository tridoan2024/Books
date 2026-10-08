(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-37",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Your First 90 Days — From One Loop to a Fleet",
  "subtitle": "Professor Mode · Evidence-gated capability decisions, measured value, and bounded growth",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-37/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-37/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 37, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "3e14a379a07cfe6e04af8f668d0743b63bc75d9ac13c04daf2c4fbf5edd16f12",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Make useful outcomes the project objective",
      "question": "Does launching more agents prove progress?",
      "outcome": "Start with the simplest adequate baseline and an observed limitation.",
      "beats": [
        {
          "id": "build-plan-stakes",
          "role": "orient",
          "title": "A fleet can amplify an unproven workflow",
          "speech": "A fleet deployed before its tasks are understood is our first case. In the chapter's fictional story, routing sends work to the wrong specialist, generated documentation conflicts with an existing process, and memory accumulates unhelpful material. More infrastructure makes the failures harder to diagnose. A deterministic lint publisher is our second case. It may deliver the requested findings directly from a structured tool result without needing a model at all. A necessary independent checker is our third case. A high-consequence workflow may need that checker from its first prototype, even if a sample calendar places it several weeks later. These are illustrative planning cases, not a universal adoption schedule or measured return on investment. Their common lesson is that a capability earns its place through the problem it solves and the evidence supporting it. Our governing question is: what should we add next, and what would justify keeping it? We will choose a baseline, write promotion decisions, interpret small pilots, and test memory, triggers, checking, and coordination. By the end, you should be able to finish with an appropriately scoped system, whether that is one reliable loop or a justified fleet.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Observed need → smallest useful capability → evidence-based decision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Premature fleet",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A fleet deployed before"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Deterministic baseline",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A deterministic lint publisher"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Early checker",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A necessary independent checker"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The calendar is a planning aid, not a maturity certificate",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not a universal adoption schedule"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What should we add next, and what justifies keeping it?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "build-plan-stakes"
        },
        {
          "id": "build-plan-baseline",
          "role": "derive",
          "title": "Compare the proposed agent with the simplest adequate method",
          "speech": "Choose a useful bounded task with a clear recipient and inspectable success criteria. Repetition and measurable outcomes make early comparison easier, but the required safeguards follow the actual consequence. Start with a manual or deterministic baseline. A lint-reporting script can often parse existing structured findings and publish a scoped summary. Add a model where explanation, interpretation, or proposed edits provide a measured benefit. Record accepted useful outputs, human effort, failure recovery, and complete operating cost. Workers launched, storage provisioned, and dashboards created are implementation facts, not evidence that the system helps. Build only the persistence and authority boundaries needed for the chosen task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Useful task → adequate baseline → measured incremental benefit"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Task",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "useful bounded task"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Baseline",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "manual or deterministic baseline"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "manual or deterministic baseline"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What does the model add beyond existing structured tools?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Add a model where"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Benefit",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "measured benefit"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "measured benefit"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Count accepted useful outcomes, not agents or infrastructure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Workers launched"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "build-plan-baseline"
        }
      ]
    },
    {
      "id": "gates",
      "title": "Advance on evidence rather than elapsed days",
      "question": "What does a small clean pilot actually establish?",
      "outcome": "Define risk-specific evidence and preserve statistical uncertainty.",
      "beats": [
        {
          "id": "build-plan-decision-record",
          "role": "derive",
          "title": "Write the evidence rule before observing the result",
          "speech": "Before adding a capability, record four fields: the observed limitation, the smallest proposed change, the evidence needed to retain it, and the condition for removing it. Define task scope, held-out cases, severity-specific criteria, cost categories, and the decision rule before collecting results. Dates can organize staffing and dependencies, but they do not establish readiness. A trigger may be needed before memory; an independent checker may be needed immediately; memory may never be useful. Respect real dependencies without turning one illustrative order into mandatory ceremony. At each boundary choose keep, revise, or remove based on the requested service and the evidence obtained.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Capability decision: limitation, change, evidence, removal condition"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Limitation",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "the observed limitation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Smallest change",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "the smallest proposed change"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Keep evidence",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "the evidence needed"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Remove condition",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "the condition for removing it"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A date does not establish readiness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "they do not establish readiness"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What observation would justify removing this capability?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "choose keep, revise, or remove"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "build-plan-decision-record"
        },
        {
          "id": "build-plan-small-sample",
          "role": "derive",
          "title": "Twenty clean cases are diagnostic evidence, not a low-risk certificate",
          "speech": "Assume twenty independent representative trials with a constant unknown failure probability. To obtain a one-sided ninety-five-percent upper confidence bound after zero failures, set the probability of observing that clean sample to five percent. Solve the equation on the board. The upper bound is about fourteen percent, far above what many consequential workflows could tolerate. Correlation, narrow task coverage, or changing conditions weaken the interpretation further. The pilot is still useful for finding obvious defects and learning the workflow. For rare critical failures, add targeted boundary cases, an appropriate statistical design, and constrained rollout. Do not infer broad autonomy from a small clean sample or an attractive average success rate.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Zero failures in 20 trials still leaves substantial uncertainty"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "20 trials",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "twenty independent representative trials"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "95% upper bound",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "one-sided ninety-five-percent upper confidence bound"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Solve (1−p)^20 = 0.05: p = 1 − 0.05^(1/20)",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Solve the equation on the board"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "p upper ≈ 13.9%",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "about fourteen percent"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Are the trials independent and representative of consequential cases?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Correlation, narrow task coverage"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "build-plan-small-sample"
        }
      ]
    },
    {
      "id": "capabilities",
      "title": "Add memory and triggers only for a concrete need",
      "question": "Does the new mechanism improve accepted outcomes?",
      "outcome": "Test provenance, relevance, duplicate handling, and spending limits.",
      "beats": [
        {
          "id": "build-plan-memory",
          "role": "worked-example",
          "title": "A retrieved correction must apply to the current task",
          "speech": "A reviewer corrects the date format used for one client. Storing that correction as a universal formatting rule can damage later work for another client. Preserve source, scope, status, and applicable version. Keep failed methods separate from proposed repairs. Label successful repairs as actually verified in later use. Keep behavior-changing promotion behind the appropriate authority boundary, including model-generated summaries. Retrieve a small relevant evidence set. Use comparable tasks to compare outcomes with and without that retrieval. Frequent retrieval is not proof of usefulness. Retain rare but consequential failure lessons when they matter, and respect deletion and retention requirements. If memory adds delay and stale constraints without benefit, remove or revise it.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Scoped correction → relevant retrieval → measured outcome change"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Correction",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "date format used for one client"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did this memory improve a later relevant result?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "actually verified in later use"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Retrieval",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Retrieve a small relevant evidence set"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Retrieve a small relevant evidence set"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Outcome evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "compare outcomes"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "compare outcomes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Retrieval frequency does not prove usefulness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Frequent retrieval is not proof"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "build-plan-memory-spoken-v2"
        },
        {
          "id": "build-plan-triggers",
          "role": "derive",
          "title": "A small pilot still needs bounded event handling",
          "speech": "Authenticate the trigger source and bind each event to the intended task, resource, and revision. Handle duplicate delivery before it can create duplicate work or publication. Reserve shared budget before dispatch, control bursts, and retain deferred work where required. A simple implementation can provide those boundaries without a large platform. Filter according to relevance and service requirements, not a target percentage of discarded events. Measure accepted results and useful feedback without assuming that missing reactions mean nobody benefited. Appropriate human intervention may be part of a successful pilot. Zero interventions is not a universal readiness criterion, especially when the task includes required approval or exception handling.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Authenticated event → bounded dispatch → verified delivery"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Source",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Authenticate the trigger source"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Dispatch",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Reserve shared budget before dispatch"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Reserve shared budget before dispatch"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can an event burst spend the shared allowance repeatedly?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "control bursts"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Duplicate handling and authority matter even in a small pilot",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A simple implementation can provide"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Delivery",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "accepted results"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "accepted results"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "build-plan-triggers"
        }
      ]
    },
    {
      "id": "checking",
      "title": "Calibrate the checker against labeled failures",
      "question": "Is a desired rejection rate a valid quality target?",
      "outcome": "Measure false acceptance and rejection on separate acceptance cases.",
      "beats": [
        {
          "id": "build-plan-checker",
          "role": "derive",
          "title": "A checker should discriminate, not hit a rejection quota",
          "speech": "Give the checker the candidate, relevant evidence, and explicit criteria without the maker's persuasive narrative. Test independently labeled acceptable and defective cases, including consequential failure modes. A high rejection rate can indicate a strict but wrong criterion, while a low rate can reflect either good candidates or a weak checker. Neither rate alone establishes quality. Report false acceptance and false rejection with their denominators and consequences. Keep development examples separate from held-out acceptance cases. Use early project history to improve coverage, but do not delay a required independent check merely to accumulate weeks of traffic. The right timing follows the risk and the available evidence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Checker quality = labeled discrimination under applicable criteria"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Criteria",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "explicit criteria"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Labeled cases",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "independently labeled acceptable and defective cases"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this checker catch known harmful output without rejecting valid work?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "including consequential failure modes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Rejection rate alone cannot establish checker quality",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Neither rate alone establishes quality"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Error measures",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "false acceptance and false rejection"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "build-plan-checker"
        },
        {
          "id": "build-plan-checker-value",
          "role": "worked-example",
          "title": "Measure the additional check on the same outcome",
          "speech": "Suppose a new checker catches unsupported file references but also rejects valid findings that use an alternate path representation. Inspect both error classes and correct the criterion or normalization using development fixtures. Then evaluate the revised checker on separate cases before promotion. Include its inference cost, added latency, repair attempts, and reviewer effort in the comparison. A second model call does not automatically double total operating cost, and a caught defect does not establish a universal quality gain. The benefit is the measured change in accepted useful outcomes under the required constraints. If the needed property is mechanically checkable, compare that simpler option too.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Observed checker errors → revised development rule → held-out comparison"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Inspect errors",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Inspect both error classes"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Revise",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "correct the criterion"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "correct the criterion"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Evaluate",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "evaluate the revised checker"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "evaluate the revised checker"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A useful checker is justified by outcome improvement and full cost",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "measured change in accepted useful outcomes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could a deterministic check establish the same property more directly?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "mechanically checkable"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "build-plan-checker-value"
        }
      ]
    },
    {
      "id": "fleet",
      "title": "Justify specialists and orchestration",
      "question": "What distinct benefit pays for coordination?",
      "outcome": "Define ownership, routing, integration, and end-to-end comparisons.",
      "beats": [
        {
          "id": "build-plan-specialists",
          "role": "derive",
          "title": "Deliberate overlap can be useful when responsibility is explicit",
          "speech": "Add a specialist when a distinct expertise, evidence source, tool set, or independent review role improves the task. Define the selected inputs, output artifact, owner, acceptance check, and integration responsibility. Conceptual overlap is not automatically a defect: two reviewers may intentionally examine the same design from different perspectives. Duplicate writers modifying one artifact without coordination are a different problem. Test routing on representative tasks, including ambiguity and handoff. Compare specialist outcomes with the adequate baseline rather than assuming a new role improves quality. Preserve source and revision identity so the receiver knows exactly which accepted artifact its next task depends on.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Useful specialization needs responsibility and measurable benefit"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Distinct benefit",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "distinct expertise"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Ownership",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "output artifact, owner"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Integration",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "integration responsibility"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Review overlap can be deliberate; conflicting writers need coordination",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Conceptual overlap is not automatically a defect"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who accepts and integrates this specialist’s result?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "which accepted artifact"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "build-plan-specialists"
        },
        {
          "id": "build-plan-orchestration",
          "role": "worked-example",
          "title": "A fleet must justify the complete coordination path",
          "speech": "An orchestrator decomposes work, handles dependencies, and reconciles specialist outputs. Measure coordination cost, critical-path latency, duplicated effort, missed handoffs, and integration defects. There is no universal minimum worker count or acceptable overhead percentage. A two-person review pattern may be valuable, while a larger fleet may add no useful capability. At an illustrative monthly expense of one thousand five hundred dollars and a loaded labor value of seventy-five dollars per hour, the arithmetic corresponds to twenty hours of labor value. That is not automatically cash saved or a complete break-even calculation. Include human review, infrastructure, unresolved tasks, and the actual quality of delivered outcomes before claiming economic benefit.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Fleet value depends on accepted integrated outcomes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Coordination",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "coordination cost"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Critical path",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "critical-path latency"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Integrated quality",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "integration defects"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Illustration: $1,500 / $75 per hour = 20 hours of labor value",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "arithmetic corresponds to twenty hours"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the fleet outperform the simplest adequate workflow all-in?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "complete break-even calculation"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "build-plan-orchestration-spoken-v2"
        }
      ]
    },
    {
      "id": "decision",
      "title": "Keep, revise, or remove each addition",
      "question": "Can the project succeed with one reliable loop?",
      "outcome": "Record evidence-based capability decisions and test shared failure recovery.",
      "beats": [
        {
          "id": "build-plan-failure-drill",
          "role": "transfer",
          "title": "Combine a duplicate-event burst with one unavailable dependency",
          "speech": "Send duplicate events into a test system while one specialist's required service is unavailable. Verify that publication remains unique for the intended operation, retries stay within policy, and shared reservations bound spending. Preserve useful completed results from other work and assign the unresolved dependency explicitly. The lead should explain the actual failure and why continuation is or is not useful without inventing a new workflow stage. Then make a keep, revise, or remove decision for each added capability. A memory layer that repeatedly injects stale rules may deserve removal. Ending with one reliable loop can satisfy the project if it delivers the requested value with adequate evidence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Duplicate burst + outage → bounded execution → explicit disposition"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Combined failure",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Send duplicate events"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Containment",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "shared reservations bound spending"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "shared reservations bound spending"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Preserve useful results and name the unresolved dependency",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Preserve useful completed results"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Decision",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "keep, revise, or remove decision"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "keep, revise, or remove decision"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which added capability now lacks evidence of benefit?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "may deserve removal"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "build-plan-failure-drill"
        },
        {
          "id": "build-plan-recap",
          "role": "reflect",
          "title": "Build the system the evidence supports",
          "speech": "Begin with a useful task and the simplest adequate baseline. Add capabilities for observed limitations, with evidence and removal conditions defined in advance. Interpret small pilots with explicit uncertainty. Keep memory scoped, triggers bounded, and checking calibrated. Give specialists clear ownership and justify orchestration by complete outcomes. Finish each stage with a keep, revise, or remove decision. Remember: observe, compare, add, test, decide. Apply that sequence to your next proposed agent feature. Discuss next: which component exists only because the calendar said to add it? Which simpler baseline has never been compared? Next we examine proposals for systems that improve their own behavior under controlled release boundaries.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Progress is accepted useful work, not increasing architectural complexity"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Observed limitation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "observed limitations"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Measured benefit",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "complete outcomes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Explicit decision",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "keep, revise, or remove decision"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: observe → compare → add → test → decide",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: calendar-driven component? Untested simpler baseline?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "build-plan-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "120c53c4c024850ad5965d92c3cd23c150fd182e092bf73f25558fe3e17630b9"
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
