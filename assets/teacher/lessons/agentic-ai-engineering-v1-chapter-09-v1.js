(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-09",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Tool Design at Scale",
  "subtitle": "Professor Mode · legible contracts, bounded evidence, and honest failure semantics",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-09/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-09/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 9, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "67110b116f311d800b74641f86d19336119427e70d7364551532edef68f12011",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Make the available actions understandable",
      "question": "How can a tool call produce useful evidence for the next decision?",
      "outcome": "Connect selection, arguments, results, and recovery.",
      "beats": [
        {
          "id": "tool-design-stakes",
          "role": "orient",
          "title": "A tool failure should improve the next decision",
          "speech": "A crowded search menu is our first case. In Priya's fictional operations fleet, overlapping tool names make a code search easy to confuse with a message search, and unused schemas consume context. An invalid file path is our second case. A generic error leaves the model guessing, while a bounded diagnostic can identify the missing path and plausible alternatives. A timed-out ticket creation is our third case. The request may already have created the ticket, so an instruction to try again can produce a duplicate. These failures occur at different parts of the tool contract: selection, argument recovery, and effect uncertainty. The chapter's vendor figures and claimed improvements are not verified measurements for this deployment. Our governing question is: how can a tool call produce useful evidence for the next decision? We will make schemas legible, distinguish failure classes, design bounded results and retry semantics, and examine discovery and programmatic execution. By the end, you should be able to review one tool from name to external effect and write tests for its important boundaries. A useful interface helps the model choose well while the trusted adapter enforces what it is permitted to do.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Selection, recovery, and effect uncertainty need different help"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Crowded menu",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A crowded search menu"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Invalid path",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "An invalid file path"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Unknown creation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A timed-out ticket creation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "How can each call improve the next decision?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The adapter enforces the permitted action",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "the trusted adapter enforces"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "tool-design-stakes"
        },
        {
          "id": "tool-design-contract",
          "role": "explain",
          "title": "The schema is only part of the operational contract",
          "speech": "The name and description explain when to choose the tool. The parameter schema describes accepted shapes and ranges. The result contract explains what a response establishes and what remains unknown. Add effect class, authorization boundary, retry semantics, and relevant operation identity. A valid JSON object can still name the wrong tenant or request an unauthorized action. Validate those conditions at the trusted adapter before contacting the service. Tool discovery should expose a capability description, not grant permission to execute it. Likewise, an error suggestion is evidence for a possible next step, not a new instruction source. This separation lets a useful model-facing interface coexist with enforcement that does not depend on the model interpreting every word correctly.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Select → construct arguments → interpret outcome"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Selection",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "when to choose the tool"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Arguments",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "accepted shapes and ranges"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "accepted shapes and ranges"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Outcome",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "what a response establishes"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "what a response establishes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What does this returned status actually establish?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "what remains unknown"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Valid JSON does not prove correct tenant or authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A valid JSON object"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "tool-design-contract"
        }
      ]
    },
    {
      "id": "schema",
      "title": "Describe behavior and boundaries",
      "question": "What must a model know before selecting and calling this tool?",
      "outcome": "Specify selection guidance, valid arguments, results, and examples.",
      "beats": [
        {
          "id": "tool-design-legible-schema",
          "role": "derive",
          "title": "Document the decision boundaries, not just the function name",
          "speech": "Use names that distinguish the action and domain, such as searching code versus searching messages. Explain when the tool is appropriate relative to nearby alternatives. For a result limit, state the allowed range, default, and how a focused lookup differs from broad exploration. Enforce the range as well as documenting it. Describe output fields, ordering, empty results, pagination, and truncation. Avoid a description that is long simply because it repeats implementation details. Useful disambiguation earns its token cost when it reduces observed errors enough to justify that cost. Test unfamiliar users or representative model cases against adjacent tools. Their mistakes can reveal whether a missing boundary, misleading name, or stale description is the actual problem.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A legible interface answers four questions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Action and domain",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "the action and domain"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "When to use",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "when the tool is appropriate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Argument bounds",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "the allowed range"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Document and enforce the same boundary",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Enforce the range"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Result meaning",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Describe output fields"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which adjacent tool is most easily confused with this?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "against adjacent tools"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "tool-design-legible-schema"
        },
        {
          "id": "tool-design-examples",
          "role": "worked-example",
          "title": "Examples should exercise distinct valid behaviors",
          "speech": "For a code-search tool, show a focused symbol lookup, a broader caller search, and a case involving literal or regular-expression escaping. Make the argument combinations valid for the actual schema. Show enough of the result to explain scope and limits. A caller-search example that excludes test files must not claim to include every caller in the repository. Keep examples close to the tool description and validate them whenever the schema or adapter changes. Three copies of the same pattern add less value than distinct cases covering common confusion. Examples demonstrate useful usage, but they do not replace validation or authorization. Measure whether they improve first-call behavior on held-out cases instead of assuming a universal percentage gain.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Diverse examples reveal semantics and scope"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Focused lookup",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a focused symbol lookup"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Caller search",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a broader caller search"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Escaping case",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "regular-expression escaping"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Examples must match the live schema and adapter",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "valid for the actual schema"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the example claim more coverage than it requests?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "must not claim to include every caller"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "tool-design-examples"
        }
      ]
    },
    {
      "id": "errors",
      "title": "Report observations without inventing a diagnosis",
      "question": "What kind of failure occurred, and what can happen next?",
      "outcome": "Separate invalid input, denied authority, transient failure, and unknown effect.",
      "beats": [
        {
          "id": "tool-design-observed-errors",
          "role": "explain",
          "title": "Separate an observation from a proposed cause",
          "speech": "A test timed out after thirty seconds is an observation. An infinite loop is a possible diagnosis that needs evidence. Return a stable error code, the failed operation, bounded diagnostics, and a permitted recovery option. A missing-file error can include similar paths without insisting that one is definitely correct. An authorization failure should identify the boundary and a sanctioned proposal path when one exists. It should not suggest bypassing permissions. Keep useful diagnostic detail, including a relevant stack trace for an implementation bug, while protecting sensitive information. A good error can reduce guesswork, but it cannot guarantee that the next attempt succeeds. Sometimes the honest next step is investigation, a changed prerequisite, or an unresolved result.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Observed failure → bounded diagnosis → permitted option"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Observation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "is an observation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Possible cause",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a possible diagnosis"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What is observed, and what is still a hypothesis?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "needs evidence"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Recovery option",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a permitted recovery option"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A suggestion is not a new authorization",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "should not suggest bypassing permissions"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "tool-design-observed-errors"
        },
        {
          "id": "tool-design-unknown-effect",
          "role": "predict",
          "title": "A timeout is not proof that nothing happened",
          "speech": "The ticket service accepts a create request, commits the ticket, and loses the response. The caller sees a timeout. If the adapter returns only a generic failure and advises a fresh retry, the loop may create a second ticket. Preserve the stable operation identity and return an unknown effect status. Use the receiver's documented deduplication or lookup contract to reconcile the first request. An invalid argument rejected before execution is a different failure class and can have a different recovery path. A local check followed by creation is not enough under concurrent callers unless uniqueness is enforced atomically. Design the tool's status vocabulary around what is known about the effect, not merely whether the transport delivered a response.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Request committed → response lost → reconcile identity"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Committed request",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "commits the ticket"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Lost response",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "loses the response"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "loses the response"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the receiver prove whether this operation happened?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "deduplication or lookup contract"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "reconcile the first request"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "reconcile the first request"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Unknown effect differs from rejected-before-execution",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a different failure class"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "tool-design-unknown-effect"
        }
      ]
    },
    {
      "id": "loop-behavior",
      "title": "Design for repeated and partial execution",
      "question": "What does a retry or partial result actually establish?",
      "outcome": "Use stable operation identity and explicit coverage.",
      "beats": [
        {
          "id": "tool-design-idempotency",
          "role": "worked-example",
          "title": "Existing state must match the requested intent",
          "speech": "A branch already exists. Can the create-branch tool simply return success? Only after checking that the repository, base revision, and ownership match the intended state. Existence alone is not sufficient. Distinguish creation from reuse in the result and preserve the relevant identity. For remote writes, define how the receiver treats repeated operation keys, mismatched intent, and expired deduplication records. These semantics belong in the adapter contract. The model should not have to invent them after a timeout. Retrying a read and retrying a write can require different decisions. A tool that tolerates repeated calls for one exact operation is useful, but that property must be implemented and tested at the boundary where the effect occurs.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reuse requires the intended state, not mere existence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Repository",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the repository"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Base revision",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "base revision"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Ownership",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "and ownership"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the existing object match this operation’s intent?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "match the intended state"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Return whether state was created or correctly reused",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Distinguish creation from reuse"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "tool-design-idempotency"
        },
        {
          "id": "tool-design-bounded-results",
          "role": "derive",
          "title": "Partial and incremental results need identity and scope",
          "speech": "A search that shows twenty results out of a larger set should say that the result is partial and provide a way to refine or continue it. If the total is unknown, say so instead of inventing a count. An incremental test report can show which failures changed, but it must identify the baseline and current artifact revisions. A delta against the wrong baseline can hide a regression. Keep access to the full receipt for audit while returning a useful bounded view to the model. Small composable tools can help flexible workflows; a larger operation can be appropriate when it provides a necessary transaction boundary. Choose composition based on the task and failure semantics, not a universal preference for the smallest possible tool.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Bounded results retain what the model cannot see"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Partial coverage",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the result is partial"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Known baseline",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "identify the baseline"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A delta needs the correct artifact and baseline",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "the wrong baseline can hide a regression"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Full receipt",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "the full receipt for audit"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What omitted evidence could change the next decision?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a useful bounded view"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "tool-design-bounded-results"
        }
      ]
    },
    {
      "id": "discovery",
      "title": "Expose the right capabilities at the right time",
      "question": "When does discovery save more than it costs?",
      "outcome": "Balance an active core with on-demand tools and measured cost.",
      "beats": [
        {
          "id": "tool-design-discovery",
          "role": "explain",
          "title": "Discovery saves context only when needed tools remain findable",
          "speech": "A registry can hold many tools while exposing a small active set. Search returns candidate descriptions, activation supplies the full schema, and deactivation removes unused definitions from later requests when the host supports it. The chapter's simple keyword scorer illustrates the structure, not a guarantee of relevant discovery. Test synonyms, ambiguous names, and uncommon but essential capabilities. Keep predictable core tools available when search would add delay without useful savings. For the long tail, discovery can reduce upfront content, but it introduces a selection step that can fail. Cache or retain active definitions only while their versions remain applicable. A discovered tool is still subject to the same per-call authorization boundary as an always-visible tool.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Search candidates → activate schema → bounded active set"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Search",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Search returns candidate descriptions"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Activate",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "activation supplies the full schema"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "activation supplies the full schema"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Deactivate",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "deactivation removes unused definitions"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "deactivation removes unused definitions"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the needed capability be found under realistic wording?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Test synonyms"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Discovery changes visibility, not permission",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "the same per-call authorization boundary"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "tool-design-discovery"
        },
        {
          "id": "tool-design-cost-model",
          "role": "derive",
          "title": "Count repeated schema cost with the actual billing rules",
          "speech": "Schema content can appear in many model requests during one task. Estimate cost from the active schema size, the requests that include it, the actual input or cache charges, and discovery overhead. Keep those inputs explicit. The chapter's simplified uncached examples illustrate repetition; they are not current provider quotes or guaranteed savings. A shorter description that causes more incorrect calls may cost more overall. A longer example that prevents a common error may earn its space. Compare total task cost, latency, completion quality, and incorrect tool selection on the same cases. Include maintenance effort when deciding whether a discovery layer is worthwhile. The economic target is useful verified work, not the fewest schema tokens considered in isolation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Schema savings must survive the whole-task comparison"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Repeated content",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "many model requests"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Actual billing",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "actual input or cache charges"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Recovery cost",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "more incorrect calls"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Count discovery and maintenance alongside token savings",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Include maintenance effort"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the smaller interface improve complete outcomes?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "useful verified work"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "tool-design-cost-model"
        }
      ]
    },
    {
      "id": "programmatic",
      "title": "Move data processing without moving authority",
      "question": "What changes when code orchestrates the tool calls?",
      "outcome": "Validate computation and enforce each call inside real isolation.",
      "beats": [
        {
          "id": "tool-design-programmatic",
          "role": "worked-example",
          "title": "Keep mechanical data processing near the data",
          "speech": "Suppose the task needs a summary of sales rows joined to customer records. Code can fetch, filter, join, and aggregate inside an execution environment, then return the relevant result instead of placing every row in the model context. Preserve the query, input versions, coverage, and enough checks to audit the computation. A successful program can still contain a wrong join or omit records. Validate row counts, key assumptions, and totals where they establish the intended result. This pattern moves data processing; it does not make the output trustworthy by itself. When the next decision depends on particular source evidence, return or link that evidence as well as the aggregate. The right result size depends on what the decision requires.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Source data → checked computation → decision evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Source data",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "sales rows joined to customer records"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Compute",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Code can fetch, filter, join, and aggregate"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Code can fetch, filter, join, and aggregate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Audit",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve the query"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Preserve the query"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Successful execution can still produce a wrong result",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A successful program can still"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which checks expose a wrong join or omitted records?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Validate row counts"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "tool-design-programmatic"
        },
        {
          "id": "tool-design-isolation",
          "role": "check",
          "title": "A restricted dictionary is not a sandbox",
          "speech": "Giving generated Python code a dictionary of allowed function names does not establish a security boundary. Use an actual isolation mechanism with resource limits, network policy, scoped credentials, and per-call enforcement. The adapter must still check tenant, authority, and operation semantics when code invokes it. Keep sensitive intermediate data protected in the execution environment and logs even when it stays out of the model context. Return bounded errors with useful source locations for debugging generated code. Do not let a wrapper accidentally expose a more privileged route than the ordinary tool interface. Programmatic execution can improve efficiency, but it also creates code and environment failure modes that the test plan must cover.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Execution efficiency retains every enforcement boundary"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Allowed names alone do not establish isolation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not establish a security boundary"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Real isolation",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "an actual isolation mechanism"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Resource limits",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "resource limits"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Scoped credentials",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "scoped credentials"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Per-call checks",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "per-call enforcement"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can this wrapper bypass the normal adapter checks?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a more privileged route"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "tool-design-isolation"
        }
      ]
    },
    {
      "id": "verification",
      "title": "Test the operational contract",
      "question": "Can the adapter distinguish a bad argument from an uncertain write?",
      "outcome": "Exercise drift, scope, permissions, truncation, and recovery.",
      "beats": [
        {
          "id": "tool-design-adapter-test",
          "role": "transfer",
          "title": "Exercise the cases that reveal the contract",
          "speech": "Take one tool and run its examples against a fake adapter. Include out-of-range limits, unsupported fields, wrong tenant, missing permission, truncated results, and a write that commits before the response times out. Check that each failure preserves the observed cause and identifies whether the next action is permitted, requires a changed prerequisite, or needs reconciliation. Verify that discovery alone does not activate authority. Change the schema and ensure stale examples fail visibly instead of remaining misleading documentation. Compare the resulting tool behavior with the promises in its description. This focused exercise is more useful than a large collection of happy-path examples that never challenges the effect boundary. The tool is ready when its important claims are backed by the relevant tests and remaining limits are explicit.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Test arguments, authority, coverage, and uncertain effects"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Bad arguments",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "out-of-range limits"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Wrong authority",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "wrong tenant"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Partial result",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "truncated results"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Unknown write",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "a write that commits"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Each failure preserves cause and the allowed next step",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "preserves the observed cause"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which description promise is still untested?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "promises in its description"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "tool-design-adapter-test"
        },
        {
          "id": "tool-design-recap",
          "role": "reflect",
          "title": "Make calls legible, bounded, and honest about effects",
          "speech": "Describe when to use the tool, its arguments, and its result meaning. Separate observations from suggested diagnoses. Preserve scope, identity, and uncertainty in repeated or partial execution. Use discovery and programmatic calling where their complete benefits justify their costs. Enforce authority at the adapter and test the operational contract. Those are five principles to remember. Remember: describe, diagnose, bound, enforce, test. A helpful schema supports reasoning; it does not substitute for implementation guarantees. Discuss next: which error in your system encourages an unjustified retry? Which result looks complete even when it is truncated? Apply the chapter by improving one tool's most common confusing boundary and verifying its failure cases. Keep the change focused on an observed problem, then compare complete task outcomes before expanding the design.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Good interfaces make limits visible and enforcement reliable"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Legible contract",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Describe when to use the tool"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Honest effects",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve scope, identity"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Tested enforcement",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Enforce authority at the adapter"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: describe → diagnose → bound → enforce → test",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: unjustified retry? Hidden truncation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "tool-design-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "633605e281a8971745d55a4ab7d88f58e63134e704d71abb4151605eb8b671e6"
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
