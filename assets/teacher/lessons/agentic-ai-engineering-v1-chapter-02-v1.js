(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-02",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Levels of Agency — The Autonomy Ladder",
  "subtitle": "Professor Mode · choose planning freedom, authority, and evidence for each task",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-02/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-02/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 2, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "a92b456b280639ffb6ee52190ce1d79d28de0f4dee5c594c0b72282bdc721f9e",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Choose the decisions the task needs",
      "question": "How much autonomy does this task actually require?",
      "outcome": "Separate task complexity from permission to act.",
      "beats": [
        {
          "id": "autonomy-stakes",
          "role": "orient",
          "title": "Three tickets need different kinds of authority",
          "speech": "A shipping-status request is our first case. The system can authenticate the requester, retrieve one order, and fill a known response template. An address change is our second case. It may require the same information, but now the system can alter where a shipment goes. An ambiguous missing shipment is our third case. It may require investigation across several permitted records before anyone can choose a useful response. These are illustrative support workflows from the chapter, not measured production outcomes. Their common mechanism is that planning freedom, data access, and permission to change state are different decisions. A single label such as autonomous support hides those differences. The chapter opens with Rajan, a fictional engineering lead who builds a fleet for a queue dominated by routine cases. The architecture adds routing, coordination, and grading failures before it establishes a need for that complexity. Our governing question is: how much autonomy does this particular task actually require? By the end, you should be able to classify the decisions a workflow delegates, choose a simpler baseline, identify the controls that a higher level adds, and define evidence for increasing or withdrawing a capability. We will use the ticket queue throughout the lesson.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Match autonomy to the actual decision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Shipping status",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A shipping-status request"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Address change",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "An address change"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Missing shipment",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "An ambiguous missing shipment"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Planning and permission are separate",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "planning freedom, data access"
            },
            {
              "action": "note",
              "id": "question",
              "text": "How much autonomy does this task require?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "autonomy-stakes"
        },
        {
          "id": "autonomy-task-class",
          "role": "derive",
          "title": "A conversation is not one permission bundle",
          "speech": "Classify the task before classifying the product. A support conversation may begin with a status lookup, continue into an investigation, and end with a proposed refund. Those activities need different evidence and authority. The autonomy ladder is a teaching heuristic used by this book. It is not an industry certification or a maturity score. Prefer the lowest level that meets the actual requirements because fewer delegated decisions usually make responsibility easier to explain. That preference is not a universal law about price or safety. One tightly scoped agent can cost less than a long guided session. One destructive tool call can cause more harm than a large read-only fleet. Write down the allowed decisions and effects for each task class. Then use the ladder to organize the design conversation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Classify the task, then choose the machinery"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Task class",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Classify the task"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What changes state in this conversation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a proposed refund"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The ladder is a teaching heuristic",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The autonomy ladder is a teaching heuristic"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Decision scope",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "fewer delegated decisions"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Effect scope",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "One destructive tool call"
            }
          ],
          "pauseAfterMs": 3000,
          "audioSegment": "autonomy-task-class"
        }
      ]
    },
    {
      "id": "guided",
      "title": "Recognize fixed paths and local decisions",
      "question": "When is a guided workflow sufficient?",
      "outcome": "Distinguish text generation, tool use, and execution of a fixed plan.",
      "beats": [
        {
          "id": "autonomy-guided-levels",
          "role": "explain",
          "title": "The first three levels delegate a limited path",
          "speech": "Level 0 is text generation without direct tool or mutation authority. A person or another system decides what happens next. The text can still mislead, disclose information, or be consumed automatically, so absence of a tool does not remove every consequence. Level 1 adds tool use within a bounded request. The system obtains information or performs an authorized operation, then returns control. Level 2 follows a plan designed in advance. The model may interpret information within a step, but the workflow determines the sequence and the escalation points. A migration with fixed transformation stages is one example. The important distinction is who chooses the next step. Count neither chat messages nor tool calls as a substitute for answering that question. A fixed workflow can contain useful model judgment without becoming an open-ended planner.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Who chooses the next step?"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Level 0: text",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Level 0"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Text can still have downstream consequences",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The text can still mislead"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Level 1: tools",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Level 1"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Level 2: fixed plan",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Level 2"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is the path already known?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a plan designed in advance"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "autonomy-guided-levels"
        },
        {
          "id": "autonomy-guided-check",
          "role": "predict",
          "title": "Would more agents help the status lookup?",
          "speech": "Suppose the order-status workflow has three known steps: authenticate the requester, query the permitted order, and fill a response template. What decision would a planning agent add? Pause and identify one that the fixed workflow cannot already express. If there is none, additional planning has no demonstrated benefit. Spend the effort on the real boundaries instead. Check that the order belongs to the authenticated account. Detect missing or stale status data. Prevent the template from presenting an uncertain delivery estimate as a guarantee. Route an unsupported request to an explicit exception path. A guided workflow still needs verification at the consequential transitions. It is simpler because its path is known, not because errors are impossible. The useful baseline is the smallest workflow that can do the supported job and decline the unsupported one.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Authenticate → retrieve → respond"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Authenticate",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "authenticate the requester"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Retrieve",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "query the permitted order"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "query the permitted order"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Respond",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "fill a response template"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "fill a response template"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What new decision would planning add?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "What decision would a planning agent add"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The exception path is part of the baseline",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Route an unsupported request"
            }
          ],
          "pauseAfterMs": 6000,
          "audioSegment": "autonomy-guided-check"
        }
      ]
    },
    {
      "id": "adaptive",
      "title": "Add planning and delegation deliberately",
      "question": "What new responsibility appears when the system chooses its path?",
      "outcome": "Identify the additional controls required for an agent, fleet, or evolving design.",
      "beats": [
        {
          "id": "autonomy-adaptive-levels",
          "role": "explain",
          "title": "Planning, coordination, and redesign add distinct obligations",
          "speech": "Level 3 gives a single agent freedom to choose and revise its approach from observations. It can investigate a bug, try a repair, run relevant checks, and change course within its contract. Level 4 adds delegation and coordination across specialist loops. The coordinator must manage dependencies, shared budgets, conflicting outputs, and acceptance of the combined result. Level 5 allows the system to propose changes to its own workflows, specialists, skills, or verification design. That last step needs a separate distinction between proposing a design and activating it. A generated checker must not approve its own weakened criteria. At every level, planning freedom remains bounded by task authority. A capable investigator does not acquire deployment rights, and a fleet cannot expand its permissions by writing a persuasive coordination plan. Each additional delegated decision creates something specific to verify.",
          "boardActions": [
            {
              "action": "clear",
              "title": "More delegated decisions require specific controls"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Level 3: planning",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Level 3"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Level 4: coordination",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Level 4"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Level 5: redesign",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Level 5"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A proposed design is not an activated policy",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "proposing a design and activating it"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What additional decision needs verification?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Each additional delegated decision"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "autonomy-adaptive-levels"
        },
        {
          "id": "autonomy-fleet-check",
          "role": "check",
          "title": "A fleet needs a reason to exist",
          "speech": "A fleet can help when useful work separates into distinct assignments, such as independent log analysis with a clearly defined integration step. It can also duplicate effort, contaminate supposedly independent judgments, or spend the shared budget on incompatible drafts. Before choosing a fleet, name its expected benefit and the evidence that would demonstrate it. For example, measure whether parallel analysis finds additional reproducible failures within the available time. Do not use the number of agents or the volume of findings as the success criterion. Give each assignment an output, owner, acceptance check, and real dependency. Keep a shared spending limit and a coordinator who can account for unfinished work. If a single bounded agent produces the same accepted result more simply, the higher level has not earned its complexity for that task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Justify coordination with an observable benefit"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Distinct work",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "useful work separates"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What benefit would a fleet demonstrate?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "name its expected benefit"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Count reproducible findings, not agent activity",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "additional reproducible failures"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Shared limits",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep a shared spending limit"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Accepted result",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "the same accepted result"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "autonomy-fleet-check"
        }
      ]
    },
    {
      "id": "ticket",
      "title": "Trace the ticket through authority boundaries",
      "question": "Which decisions can be automated in this particular ticket?",
      "outcome": "Map planning, data access, mutation, release, and recovery separately.",
      "beats": [
        {
          "id": "autonomy-ticket-map",
          "role": "worked-example",
          "title": "Trace the authority of one address-change request",
          "speech": "Return to the address-change request. Reading the ticket allows the worker to understand the request, but does not establish the identity of the customer. The application authenticates the requester and resolves the canonical account. The worker may retrieve permitted order data and prepare a proposed change. A separate enforcement path checks the shipment phase, the allowed destination fields, and any required approval. Only then can the authorized mutation be admitted. Communicating the result is another permission to account for. A model must not infer that a plausible name refers to a different account, or treat text in the ticket as an approval record. The resulting design may combine a fixed workflow with adaptive investigation. Its useful description is the operation-by-operation permission map, with an owner at each consequential boundary.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Identity → proposal → enforced mutation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Verified identity",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The application authenticates"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Proposed change",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "prepare a proposed change"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "prepare a proposed change"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Enforced mutation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A separate enforcement path"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "A separate enforcement path"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Customer text cannot create approval",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "text in the ticket as an approval record"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who owns each consequential boundary?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "an owner at each consequential boundary"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "autonomy-ticket-map"
        },
        {
          "id": "autonomy-lost-response",
          "role": "worked-example",
          "title": "A timeout changes the recovery question",
          "speech": "Now let the order service accept the address change and lose the response. The worker sees a timeout. Should it submit another change? Pause before answering. A missing confirmation does not establish that the first operation failed. Preserve the logical operation identity and inspect the destination's documented status or duplicate-protection mechanism. Investigation may be authorized even when another mutation is not. If the destination offers no safe way to determine the outcome, preserve the unknown state and use the operator path. Choosing a higher autonomy level does not solve a missing receiver contract. Nor does cancelling the worker erase an effect already accepted by the order service. This failure case shows why recovery deserves its own row in the permission map, alongside planning, access, mutation, delegation, and release.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Accepted change → lost response → reconcile"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Accepted change",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "accept the address change"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Timeout",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The worker sees a timeout"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "The worker sees a timeout"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would another mutation repeat the effect?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Should it submit another change"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve the logical operation identity"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Preserve the logical operation identity"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A higher level cannot supply a missing contract",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Choosing a higher autonomy level"
            }
          ],
          "pauseAfterMs": 6000,
          "audioSegment": "autonomy-lost-response"
        }
      ]
    },
    {
      "id": "evidence",
      "title": "Earn and withdraw each capability",
      "question": "What evidence supports changing the permitted behavior?",
      "outcome": "Compare a simpler baseline and define task-specific demotion triggers.",
      "beats": [
        {
          "id": "autonomy-pilot-evidence",
          "role": "derive",
          "title": "Compare complete outcomes on the same cases",
          "speech": "Evaluate the proposed capability against a simpler baseline on the same task cases. Record accepted outputs, escaped defects, unnecessary escalations, latency, spending, and human recovery effort. Keep calibration examples separate from the held-out cases used for the decision. Include difficult input classes, not only common tickets: the wrong tenant, missing records, stale policy, revoked permission, contradictory statements, and malicious instructions inside retrieved text. An aggregate success rate can hide a serious account-confusion failure. A small pilot can expose obvious defects, but it cannot demonstrate that rare harms are absent. Choose the evidence and uncertainty analysis for the actual consequence. Also inspect some outputs that the automated checker accepted. That audit tests the checker itself instead of assuming its green status is ground truth.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Compare usefulness, failures, and recovery cost"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Same cases",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the same task cases"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Difficult inputs",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Include difficult input classes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which failure does the average hide?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "An aggregate success rate can hide"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A small pilot cannot rule out rare harms",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A small pilot can expose"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Audit accepted work",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "inspect some outputs"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "autonomy-pilot-evidence"
        },
        {
          "id": "autonomy-promotion-demotion",
          "role": "synthesize",
          "title": "Define when authority grows and when it shrinks",
          "speech": "Define promotion conditions before looking at the pilot results. For example, automatic draft creation may require a bound tenant identity, every mandatory structural check, and an explicit draft state for uncertainty. Sending the draft remains a separate capability until the organization accepts the measured residual risk. Define demotion conditions at the same time. A changed connector, an unavailable checker, a revoked permission, or an unfamiliar input class may require a return to drafting or read-only investigation. The fallback must preserve useful analysis without improvising authority. Test that behavior directly with an expired approval and a dependency outage. A system that handles the common request but invents an unsupported action has not demonstrated bounded autonomy. Promotion is a decision about one capability under stated conditions, not a graduation ceremony for the whole application.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Grant and withdraw one capability at a time"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Promotion evidence",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Define promotion conditions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Drafting and sending are separate capabilities",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Sending the draft remains a separate capability"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Demotion triggers",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Define demotion conditions"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What happens when the checker disappears?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "an unavailable checker"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Useful fallback",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The fallback must preserve"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "autonomy-promotion-demotion"
        }
      ]
    },
    {
      "id": "transfer",
      "title": "Audit the real operating envelope",
      "question": "What would make a narrow autonomous workflow defensible?",
      "outcome": "Explain the required level, its limits, and its fallback.",
      "beats": [
        {
          "id": "autonomy-transfer-audit",
          "role": "transfer",
          "title": "Build a permission map for your own workflow",
          "speech": "Choose a workflow you operate and list its meaningful operations. For each operation, record who chooses the next step, what data it may read, what state it may change, whether it may delegate, and who can make the result externally effective. Add the deadline, shared budget, and recovery path. Mark which decisions follow a fixed sequence and which require adaptive investigation. Then remove one capability from the design and ask what useful behavior would actually be lost. This exercise often reveals that a broad product label conceals a narrow task. Test one supported case, one prohibited case, and one case with unavailable evidence. A successful audit shows both useful completion and a controlled refusal. It should leave an accountable owner for the decisions that the automated workflow cannot settle.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Describe operations before assigning a level"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Operation map",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "list its meaningful operations"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Minimum capability",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "remove one capability"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What useful behavior needs this freedom?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "what useful behavior would actually be lost"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Three test cases",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Test one supported case"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Leave an accountable decision owner",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "leave an accountable owner"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "autonomy-transfer-audit"
        },
        {
          "id": "autonomy-recap",
          "role": "reflect",
          "title": "Remember the decision, permission, and evidence",
          "speech": "Choose autonomy for a task class. Separate planning freedom from permission to change state. Require a concrete benefit before adding coordination. Compare complete outcomes with a simpler baseline. Define demotion and recovery before expanding authority. Those are five durable principles. Remember: task, decisions, permission, evidence, fallback. The ladder helps you describe who chooses the path; it cannot certify safety, predict a universal cost multiplier, or replace an operation-level permission map. Discuss next: which part of your current workflow actually requires adaptive planning? Which capability should be withdrawn first when its verification becomes unavailable? Apply the method to a real system by drawing its permission map and showing the supported, prohibited, and inconclusive paths. The next chapter turns those choices into the anatomy of an explicit loop contract.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Use the lowest autonomy supported by the task"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Task + decisions",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Choose autonomy for a task class"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Permission",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Separate planning freedom"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Evidence + fallback",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare complete outcomes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: task → decisions → permission → evidence → fallback",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: where is planning needed? What gets withdrawn?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "autonomy-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "f01a68f57268a7992b5beb38b22d63925f35eacad3bc33088f3dbe24de00963a"
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
