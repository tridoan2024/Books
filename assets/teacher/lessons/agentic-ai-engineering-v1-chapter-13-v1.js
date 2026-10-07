(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-13",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Choosing Your Primitive",
  "subtitle": "Professor Mode · contract-first design, complete comparisons, and honest fallback",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-13/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-13/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 13, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "9dc4b2194631f5b8d4ec8be72f77a45b15ee4ac99bb31936b982db94a951c1fc",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Choose a complete design for each operation",
      "question": "Which combination meets the contract with the least unnecessary complexity?",
      "outcome": "Treat primitives as composable mechanisms rather than a fixed ladder.",
      "beats": [
        {
          "id": "primitive-stakes",
          "role": "orient",
          "title": "The cheapest isolated call may not be the cheapest complete system",
          "speech": "A staging deployment monitor is our first case. In Rani's fictional workflow, a webhook identifies a deployment, metrics show what changed, and the system produces an assessment for possible production promotion. Each operation needs a different kind of work. A date parser is our second case. Unfamiliar formats do not automatically justify asking a model to guess; a supported parser or explicit rejection may be more reliable. A summary message is our third case. A template may communicate structured results clearly, while a model may help when the explanation requires bounded synthesis. These cases show why choosing a primitive starts with required behavior, not a favorite technology. The chapter's cost and latency figures are illustrative and must be measured for the actual system. Our governing question is: which combination meets the contract with the least unnecessary complexity? We will define hard constraints, map behavior to mechanisms, compare complete designs, and choose fallbacks that preserve mandatory checks. By the end, you should be able to justify one operation's implementation and interface separately, identify the evidence that would change the choice, and prevent a cheap fallback from silently weakening acceptance. The primitives can work together within the same step.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Choose required behavior before choosing the mechanism"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Staging monitor",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A staging deployment monitor"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Date parser",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A date parser"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Summary message",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A summary message"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which combination meets the contract simply?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Primitives can be combined within one operation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The primitives can work together"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "primitive-stakes"
        },
        {
          "id": "primitive-composition",
          "role": "explain",
          "title": "Code, tools, and connectors are not exclusive rungs",
          "speech": "A tool can wrap deterministic code. An MCP server can expose that tool to several clients. A skill can explain its project-specific use, and a model can decide when the capability is relevant. These choices describe different parts of the design. First specify the operation's behavior, then select the implementation and the interface that deliver it. A separate agent context can provide isolation or parallel work, but it also requires coordination and sufficient evidence. A difficult task alone does not prove that delegation improves the result. Compare useful capabilities and full costs without assuming that one named primitive is always cheaper or more reliable. The least complex adequate combination may contain several mechanisms working behind one clear contract.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Implementation → interface → task guidance"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Code",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A tool can wrap deterministic code"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Connector",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "An MCP server can expose"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "An MCP server can expose"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Guidance",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A skill can explain"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "A skill can explain"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Different mechanisms describe different design dimensions",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "different parts of the design"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which choice concerns behavior, and which concerns access?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the implementation and the interface"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "primitive-composition"
        }
      ]
    },
    {
      "id": "contract",
      "title": "Apply hard constraints before comparing cost",
      "question": "What must remain true regardless of the implementation?",
      "outcome": "Separate observations, recommendations, and authorized effects.",
      "beats": [
        {
          "id": "primitive-contract-first",
          "role": "derive",
          "title": "Define the observable result and its allowed effects",
          "speech": "For each operation, state its inputs, outputs, freshness needs, authority, allowed effects, and success check. A deployment assessment can return a recommendation with source-linked metrics. Production promotion is a separate effect with its own approval and current-resource checks. Combining them into a vague instruction to assess and act hides a boundary that no cost comparison can repair. Authenticate and validate incoming events before treating them as trusted work. Preserve task identity and cumulative limits across the chosen components. The contract should be proportionate to the operation, but it must answer what success establishes and what the system is allowed to change. Without that definition, a cheap implementation can appear successful simply because it delivered less than the task required.",
          "boardActions": [
            {
              "action": "clear",
              "title": "An operation contract makes required behavior observable"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Inputs and freshness",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "its inputs, outputs, freshness needs"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Authority and effects",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "authority, allowed effects"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Success check",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "and success check"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Recommendation and promotion are separate outcomes",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Production promotion is a separate effect"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What can this result justify the system doing next?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "what success establishes"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "primitive-contract-first"
        },
        {
          "id": "primitive-hard-gates",
          "role": "predict",
          "title": "A hard constraint cannot be traded away for a lower price",
          "speech": "A prompt alone cannot authenticate a webhook or enforce a spending ceiling. A static skill cannot supply live error rates. An unscoped connector cannot safely serve multiple customers merely because the schema contains a tenant field. A fresh agent context does not guarantee independent errors if it uses the same evidence and flawed rubric. Remove designs that cannot meet these hard requirements before ranking the rest. A weighted score should not allow a cheap candidate to compensate for missing authority or insufficient evidence. If no candidate meets the contract, reduce scope explicitly or identify the missing prerequisite. Do not quietly lower the acceptance standard and present the result as the same product.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Eliminate designs that fail mandatory requirements"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Identity enforcement",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "authenticate a webhook"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Fresh evidence",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "live error rates"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Tenant boundary",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "serve multiple customers"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Valid evaluation",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "same evidence and flawed rubric"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Lower price cannot offset a missing hard constraint",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "compensate for missing authority"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does any candidate actually meet the full contract?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "If no candidate meets the contract"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "primitive-hard-gates"
        }
      ]
    },
    {
      "id": "mapping",
      "title": "Match behavior to the mechanism",
      "question": "Where do code, tools, skills, prompts, and separate contexts add value?",
      "outcome": "Use each mechanism for an explicit requirement.",
      "beats": [
        {
          "id": "primitive-code-knowledge",
          "role": "worked-example",
          "title": "Compute defined quantities and retrieve the right policy",
          "speech": "Parse a known event schema with tested code. Compute metric changes, thresholds, and temporal trends deterministically when their definitions are clear. Handle zero denominators, missing samples, and insufficient traffic explicitly. Trend calculation is not inherently a model task just because it spans several deployments. Retrieve current observations through a suitable adapter, and obtain versioned service-level policy from its authoritative source. A skill can orient the loop to that source and explain stable conventions, but it cannot invent thresholds or replace live measurements. Code still has logic bugs, infrastructure cost, and maintenance needs. The reason to use it here is a precise behavior that can be validated directly, not a claim that every deterministic operation is free or effortless.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Validated event → computed metrics → applicable policy"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Event",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Parse a known event schema"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Metrics",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compute metric changes"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Compute metric changes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Are the threshold and denominator both valid here?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Handle zero denominators"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Trends can be computed; missing data stays explicit",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Trend calculation is not inherently a model task"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Policy",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "obtain versioned service-level policy"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "obtain versioned service-level policy"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "primitive-code-knowledge"
        },
        {
          "id": "primitive-model-context",
          "role": "explain",
          "title": "Use synthesis where it helps and isolation where it is justified",
          "speech": "A model can help explain incomplete or conflicting contextual evidence, propose hypotheses, or synthesize a bounded recommendation. Supply the relevant sources and distinguish interpretation from established fact. A template can produce a clear status message when the inputs and required emphasis are already structured. Use another context when isolation or useful parallel work addresses a real need, and provide enough evidence for that task. A separate checker may reduce exposure to the maker's reasoning, but shared assumptions and test gaps can still produce correlated mistakes. Measure whether the added context improves quality enough to justify its coordination and inference costs. The generated explanation can help a reviewer understand the decision; it is not proof of the actual cause of the model's behavior.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Synthesis, templates, and isolated checks serve different needs"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Bounded synthesis",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A model can help explain"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Structured template",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A template can produce"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Separate context",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Use another context"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What observed need justifies the added context?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "addresses a real need"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Fresh context does not guarantee independent errors",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "shared assumptions and test gaps"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "primitive-model-context"
        }
      ]
    },
    {
      "id": "monitoring",
      "title": "Build the staging assessment from evidence",
      "question": "How should the design handle partial metrics and borderline results?",
      "outcome": "Compute defined quantities and preserve missing-data status.",
      "beats": [
        {
          "id": "primitive-monitoring-map",
          "role": "worked-example",
          "title": "Separate measurement, assessment, and promotion",
          "speech": "For Rani's monitor, authenticate and deduplicate the deployment event. Retrieve the relevant baseline and current metrics through the reviewed integration. Compute defined deltas and trends with explicit coverage flags. Load the applicable policy revision. If useful, ask the model for a bounded explanation of ambiguous evidence. Generate a template summary when that is sufficient. Keep promotion in the existing approval service, with current revision checks and durable operation identity. This is a combination of primitives chosen for distinct responsibilities. The hypothetical spending and time limits are constraints to measure, not a promise that this architecture will meet them. Account for unsuccessful calls, retries, and operator handling when evaluating the complete monitor.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Measure → assess → separately authorize promotion"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Measure",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Retrieve the relevant baseline"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Assess",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a bounded explanation"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "a bounded explanation"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Authorize effect",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep promotion in the existing approval service"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Keep promotion in the existing approval service"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can a draft recommendation accidentally trigger promotion?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "current revision checks"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The budget is a measured constraint, not a promised result",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "constraints to measure"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "primitive-monitoring-map"
        },
        {
          "id": "primitive-missing-region",
          "role": "check",
          "title": "A larger model cannot recover metrics that were never supplied",
          "speech": "One region is unavailable, so the metrics query returns only part of the requested window. The observed error count looks low. Should the model declare the deployment healthy? The adapter must first report coverage and completeness. Policy should prevent a definitive healthy verdict when required evidence is insufficient. The model can explain the missing region and identify the next observation; it cannot turn an incomplete sample into complete evidence by reasoning more confidently. Preserve the result as inconclusive where the contract requires that status. Recovery begins with the missing data prerequisite, not automatically with a larger model or another copy of the same prompt. This case tests the interface between retrieval, deterministic policy, and synthesis.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Partial metrics → coverage flag → inconclusive assessment"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Partial window",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "only part of the requested window"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Coverage",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "report coverage and completeness"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "report coverage and completeness"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What observation would resolve the missing region?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "identify the next observation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Model capacity cannot replace unavailable evidence",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot turn an incomplete sample"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Inconclusive",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve the result as inconclusive"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Preserve the result as inconclusive"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "primitive-missing-region"
        }
      ]
    },
    {
      "id": "comparison",
      "title": "Compare realistic cases and complete costs",
      "question": "What evidence would change the initial choice?",
      "outcome": "Test failure cases, maintenance, and observed bottlenecks.",
      "beats": [
        {
          "id": "primitive-comparison",
          "role": "derive",
          "title": "Compare candidates on the same difficult cases",
          "speech": "Build fixtures for ordinary inputs, boundaries, malformed data, unauthorized requests, stale evidence, and unavailable dependencies. Compare correct results, false approvals, inconclusive outcomes, latency, total cost, and operator effort. Include infrastructure and maintenance as well as inference charges. A design that looks inexpensive on successful examples may be costly when its exceptions require repeated diagnosis. Another design may justify a higher routine cost by preventing a consequential false approval. Keep the acceptance requirements fixed during comparison. Record why a rejected alternative lost and which observation would change that conclusion. The goal is a reviewable choice under actual constraints, not a universal ranking of technologies.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Complete comparison includes failures and operator work"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Same fixtures",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Build fixtures"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Outcome quality",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "correct results, false approvals"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Total cost",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "latency, total cost"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Operator effort",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "and operator effort"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Keep acceptance fixed while comparing designs",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Keep the acceptance requirements fixed"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which assumption could reverse the preferred design?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "which observation would change"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "primitive-comparison"
        },
        {
          "id": "primitive-change-signal",
          "role": "explain",
          "title": "Change the mechanism for an observed bottleneck",
          "speech": "If date formats exceed a parser's supported set, first consider a proven parser, format detection, or explicit rejection of ambiguous input. A model proposal may help, but it still needs validation. If several workflows duplicate the same broken authentication logic, shared integration maintenance may be worth introducing. If live data was mistakenly stored as static guidance, replace that source with current retrieval. If a checker repeatedly approves errors that independent assessment finds, investigate the rubric, evidence, and context before assuming a new agent solves it. Escalation and simplification should respond to the limiting mechanism. Record the evidence so the team can reconsider later when volume, consumers, or requirements change.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Observed failures point to different interventions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Input variation",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "date formats exceed"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Duplicated integration",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "several workflows duplicate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Stale guidance",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "live data was mistakenly stored"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Checker failure",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "a checker repeatedly approves errors"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Change the limiting mechanism, then measure again",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "respond to the limiting mechanism"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What evidence would justify a simpler implementation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "requirements change"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "primitive-change-signal"
        }
      ]
    },
    {
      "id": "fallback",
      "title": "Preserve the contract when a dependency fails",
      "question": "Which fallback remains valid, and which result must become inconclusive?",
      "outcome": "Define honest reduced behavior and a reviewable decision record.",
      "beats": [
        {
          "id": "primitive-fallback",
          "role": "transfer",
          "title": "A fallback must preserve the required contract or lower the status",
          "speech": "When live metrics are unavailable, do not silently substitute yesterday's memory and call the deployment healthy. When a required judge is unavailable, a schema check cannot inherit its acceptance authority. If a connector's authentication behavior changes, preserve permitted reads where applicable while disabling effects that no longer meet their prerequisites. Write one decision row per operation: contract, chosen mechanism combination, rejected alternative, supporting evidence, and fallback. Test the monitor with fake connectors and mutation-disabled promotion. Require webhook rejection where appropriate, correct trend calculations, an inconclusive missing-region result, and no promotion from a draft recommendation. Measure real cost and timing if a model is invoked; otherwise leave them explicitly unmeasured. An honest reduced result is better evidence than a fallback that silently changes the product.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Fallback keeps checks or explicitly reduces result status"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Missing metrics",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "When live metrics are unavailable"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Missing judge",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "When a required judge is unavailable"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A weaker check cannot inherit a stronger check’s authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot inherit its acceptance authority"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Changed connector",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "authentication behavior changes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What result status remains justified after this failure?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "an inconclusive missing-region result"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "primitive-fallback"
        },
        {
          "id": "primitive-recap",
          "role": "reflect",
          "title": "Choose by contract, compare by evidence, fall back honestly",
          "speech": "Define observable behavior and allowed effects. Eliminate designs that fail hard constraints. Compose implementation, interface, and guidance for explicit needs. Compare complete outcomes and costs on matched cases. Preserve mandatory checks in every fallback or state the reduced result honestly. Those are five principles to retain. Remember: define, gate, compose, compare, preserve. A primitive is a design choice to test, not a permanent identity for the system. Discuss next: which model call in your workflow performs a precisely defined calculation? Which inexpensive fallback quietly changes what passing means? Apply the method to one operation with a short contract and comparison record. Keep the evidence that would justify changing the choice when the task evolves. The next chapter turns to the triggers that start these workflows.",
          "boardActions": [
            {
              "action": "clear",
              "title": "The simplest adequate design remains open to evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Contract",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Define observable behavior"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare complete outcomes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Honest fallback",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve mandatory checks"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: define → gate → compose → compare → preserve",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: unnecessary model call? Weakened fallback?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "primitive-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "0872adfaba1e2750dfaf8d2b4768db941e1fb29c27a8128b47ebda2995b57cbb"
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
