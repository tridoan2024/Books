(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-10",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "MCP — Wiring the Loop to the World",
  "subtitle": "Professor Mode · integration choices, current authority, and tested recovery",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-10/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-10/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 10, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "5290e07f368e980122b8b1bac8f98cb2db85fe7d4824ecc84c2ca228e314b5b7",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Connect delivery without confusing access and authority",
      "question": "When does a connector earn its cost and trust?",
      "outcome": "Separate useful integration from permission to perform effects.",
      "beats": [
        {
          "id": "mcp-stakes",
          "role": "orient",
          "title": "Connectivity can close the delivery gap and widen the effect boundary",
          "speech": "A passing patch is our first case. In Marcus's fictional developer-experience workflow, the agent produces code quickly, but people still move it through a branch, pull request, continuous integration, and review. Connectors can automate authorized parts of that delivery work. A production rollback is our second case. The connector can reach the deployment service, but the current user approval may concern a different service or an older revision. A single internal lookup is our third case. Wrapping one stable endpoint in a separate protocol server may add maintenance and latency without useful reuse. These cases show why integration design needs both a benefit and a boundary. The chapter's delivery times and pass rates are fictional illustration, not measured evidence of an MCP performance gain. Our governing question is: when does a connector earn its cost and trust? We will distinguish protocol capabilities, implementation responsibilities, current task approval, and failure recovery. By the end, you should be able to justify a direct adapter or an MCP server, trace its actual authority, and test a consequential call without performing a live production mutation. Connectivity and autonomy are different dimensions: either a fixed workflow or an adaptive loop can use the same connector.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Integration needs a useful benefit and an enforced boundary"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Patch delivery",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A passing patch"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Production rollback",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A production rollback"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Single lookup",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A single internal lookup"
            },
            {
              "action": "note",
              "id": "question",
              "text": "When does a connector earn its cost and trust?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Connectivity and autonomy are separate dimensions",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Connectivity and autonomy"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "mcp-stakes"
        },
        {
          "id": "mcp-delivery-boundary",
          "role": "explain",
          "title": "A connected workflow still respects each release gate",
          "speech": "A tool can create a branch, open a pull request, retrieve build status, or update a ticket. That capability does not mean every invocation is approved by the task. Define which effects the user authorized and which review or release gates remain. A passing local test does not establish that broader continuous integration passed. A reviewer approval may apply to a specific revision and become stale after another edit. Preserve those distinctions in workflow state. Connectors can remove unnecessary copying and waiting, but they should carry the existing delivery contract into the implementation. Measure the whole outcome, including failures and human handling, rather than treating the first successful API call as proof that the delivery problem is solved.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Candidate patch → CI evidence → current release gate"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A capability is not blanket task approval",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not mean every invocation is approved"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Patch",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A passing local test"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "CI",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "broader continuous integration passed"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "broader continuous integration passed"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Approval",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A reviewer approval"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "A reviewer approval"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which artifact revision did this approval cover?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a specific revision"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "mcp-delivery-boundary"
        }
      ]
    },
    {
      "id": "protocol",
      "title": "Pin the actual interface and transport",
      "question": "What does MCP standardize, and what does it leave to implementations?",
      "outcome": "Distinguish tools, resources, prompts, and deployment responsibilities.",
      "beats": [
        {
          "id": "mcp-capabilities",
          "role": "derive",
          "title": "The protocol provides an interface, not every guarantee",
          "speech": "An MCP client connects the host application to a server through a versioned protocol. Tools expose operations. Resources expose readable data. Prompts expose reusable templates. The host still decides how discovered capabilities enter the model context and when a tool may execute. Assign authentication, token handling, rate limits, retry behavior, redaction, and downstream API translation to explicit components. A server may centralize some of those responsibilities, but speaking the protocol does not prove it implements them correctly. Likewise, discovering a tool does not grant its authority. Treat the protocol as a shared integration interface and verify the operational contract of the particular client, server, and downstream service you deploy.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Capabilities differ from implementation guarantees"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Tools",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Tools expose operations"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Resources",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Resources expose readable data"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Prompts",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Prompts expose reusable templates"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The host controls exposure and permission to execute",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The host still decides"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who owns token handling, retries, and redaction?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Assign authentication"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "mcp-capabilities"
        },
        {
          "id": "mcp-transport",
          "role": "worked-example",
          "title": "Test the transport version the client and server actually use",
          "speech": "The chapter discusses JSON-RPC over standard input and output and over supported HTTP transports. Legacy HTTP with server-sent events and Streamable HTTP are not interchangeable deployment contracts. Pin compatible versions and test initialization, capability discovery, calls, interruptions, and reconnect behavior. Local process credentials follow a different deployment model from an HTTP authorization flow. Do not infer one from the other. The host also chooses which discovered schemas to send to the model. MCP does not require exactly five active tools or permanent session-long retention. Inspect actual submitted content and cache accounting. A transport that connects successfully proves less than a workflow whose authentication, authorization, effects, and recovery semantics have been exercised.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Compatibility needs an explicit deployed contract"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Protocol version",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Pin compatible versions"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Transport behavior",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "test initialization"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Credential model",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Local process credentials"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which transport and authorization flow are actually used?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Do not infer one from the other"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Successful connection is only one check",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "connects successfully proves less"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "mcp-transport"
        }
      ]
    },
    {
      "id": "choice",
      "title": "Compare a server with a direct adapter",
      "question": "Which requirement justifies the extra integration boundary?",
      "outcome": "Evaluate reuse, lifecycle, discovery, latency, and maintenance.",
      "beats": [
        {
          "id": "mcp-adapter-choice",
          "role": "explain",
          "title": "Introduce a server for a concrete integration need",
          "speech": "Shared use across several workflows can justify a common integration implementation. Complex credential handling may benefit from a clear audited boundary. An independent maintenance lifecycle can separate upstream API changes from the harness release. Dynamic discovery can make selected new capabilities available to compatible clients. These are possible reasons to use a server, not requirements to adopt MCP everywhere. A direct function may be sufficient for one simple endpoint, and a shared library can also reduce duplicated code. Compare the alternatives against actual requirements. If the protocol boundary adds no useful reuse, isolation, or lifecycle benefit, its process and version-management costs may not be worthwhile. The right choice can change when the workload or number of consumers changes.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Concrete requirements can justify the extra boundary"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Shared use",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Shared use"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Credential boundary",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Complex credential handling"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Independent lifecycle",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "An independent maintenance lifecycle"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Discovery",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Dynamic discovery"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Direct adapters and shared libraries remain alternatives",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A direct function may be sufficient"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which requirement does this server solve?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "actual requirements"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "mcp-adapter-choice"
        },
        {
          "id": "mcp-complete-cost",
          "role": "derive",
          "title": "Measure latency, context, and operational responsibility",
          "speech": "Measure per-tool latency at realistic payload sizes and concurrency. Separate service work from serialization, transport, queues, and retries where instrumentation allows it. Count the schemas actually exposed to the model, with the provider's input and caching rules. Add server deployment, monitoring, credentials, version compatibility, and incident recovery to the comparison. The chapter's illustrative latency ranges are not predictions for your machine or network. A server also becomes a dependency that can access arguments, credentials, and results. Review its provenance, pin approved versions, and test its permissions. A simpler direct adapter still needs those relevant controls. Choose based on complete behavior and maintenance cost, then revisit the decision when the measured bottleneck changes.",
          "boardActions": [
            {
              "action": "clear",
              "title": "The comparison includes more than RPC duration"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Runtime latency",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "per-tool latency"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Visible schemas",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "the schemas actually exposed"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Operations",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "server deployment, monitoring"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Use actual deployment measurements",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not predictions for your machine"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Trust boundary",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "access arguments, credentials, and results"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What cost moves elsewhere when this boundary changes?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "complete behavior and maintenance cost"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "mcp-complete-cost"
        }
      ]
    },
    {
      "id": "authorization",
      "title": "Bind the action to current intent and target",
      "question": "Why is a valid access token insufficient to approve a rollback?",
      "outcome": "Separate authentication, resource scopes, and task approval.",
      "beats": [
        {
          "id": "mcp-auth-layers",
          "role": "derive",
          "title": "Authentication, resource scope, and task approval answer different questions",
          "speech": "Authentication identifies the caller. Resource authorization establishes the intended resource and permitted scopes. Task approval binds an effect to current user intent, target, and constraints. A deployment token may permit more actions than this task authorizes. The chapter uses a pinned MCP authorization specification as a concrete reference, not a claim about the latest protocol. In that referenced HTTP profile, validate the intended audience and keep MCP-server tokens distinct from downstream API tokens. Passing a client's token onward indiscriminately is not an acceptable shortcut. The trusted endpoint validates these properties. A model's description of a token cannot establish them. Assign the checks explicitly and keep credential values out of model-visible content and ordinary diagnostics.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Caller identity → resource scope → current task approval"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Identity",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Authentication identifies the caller"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Resource scope",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Resource authorization establishes"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Resource authorization establishes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Task approval",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Task approval binds"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Task approval binds"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A token’s capability may exceed this task’s authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "more actions than this task authorizes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which trusted component validates each layer?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Assign the checks explicitly"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "mcp-auth-layers"
        },
        {
          "id": "mcp-rollback-preconditions",
          "role": "worked-example",
          "title": "A rollback approval must still match the deployment",
          "speech": "Bind rollback approval to the service, environment, current deployment revision, target revision, expiration, and approving principal. Immediately before dispatch, verify that the current deployment is still the one approved and that the principal retains authority. A health observation may describe a deployment that another operator has already replaced. The target revision must belong to the intended service and be an allowed rollback target. A schema description saying to check health first can help the model follow the workflow, but trusted code must enforce the applicable preconditions. Do not treat rollback as universally reversible; it creates a new deployment and may not undo data changes or other effects. Preserve the operation identity and post-action evidence needed to assess what actually happened.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Bound approval → current revision check → admitted effect"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Bound approval",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Bind rollback approval"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Recheck revision",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Immediately before dispatch"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Immediately before dispatch"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this approval still match the service and revision?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "still the one approved"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A stale health result cannot approve a changed deployment",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "already replaced"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Effect evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "post-action evidence"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "post-action evidence"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "mcp-rollback-preconditions"
        }
      ]
    },
    {
      "id": "containment",
      "title": "Control the capabilities that actually exist",
      "question": "What can this principal reach through every available route?",
      "outcome": "Audit credentials, alternate paths, execution isolation, and attribution.",
      "beats": [
        {
          "id": "mcp-effective-authority",
          "role": "explain",
          "title": "A hidden tool does not remove an alternate route",
          "speech": "A specialist may see only read tools in its connector list while still holding broad credentials or a shell with unrestricted network access. The displayed list therefore does not define its entire authority. Trace the credentials, filesystem mounts, shell capabilities, and network paths that can reach each service. Constrain those routes consistently with the intended role. Record authenticated caller and task identity in the invocation and receipt rather than inferring ownership from the tool name. Shared proxies and reused credentials can blur attribution. Connector scoping is useful when the underlying permissions support it. Test denied direct access using controlled targets so the result demonstrates a real boundary, not just an absent button.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Effective authority includes every reachable route"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Connector tools",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "its connector list"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Credentials",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "broad credentials"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Shell and network",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a shell with unrestricted network access"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Displayed tools do not define the whole authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not define its entire authority"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can this principal reach the service another way?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "network paths that can reach"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "mcp-effective-authority"
        },
        {
          "id": "mcp-executor-boundary",
          "role": "check",
          "title": "MCP can expose an executor; the executor provides isolation",
          "speech": "A code-execution server can give the loop a place to run tests and inspect results. The security boundary comes from the actual executor: isolation, filesystem policy, resource limits, network controls, and scoped credentials. MCP is the interface to that system. It does not make arbitrary code safe by naming the endpoint a sandbox. Verify what persists after execution, what can leave the environment, and how cancellation and time limits are enforced. Return results tied to the code and environment that were tested. A passing test report from the wrong revision is not evidence for the current patch. Use the execution capability to support the verification stage while preserving all relevant permission and artifact-identity checks.",
          "boardActions": [
            {
              "action": "clear",
              "title": "The executor’s controls determine containment"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Isolation",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "isolation, filesystem policy"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Limits",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "resource limits"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Network",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "network controls"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Credentials",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "scoped credentials"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The protocol name does not establish a sandbox",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "naming the endpoint a sandbox"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which code revision and environment produced this result?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "tied to the code and environment"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "mcp-executor-boundary"
        }
      ]
    },
    {
      "id": "recovery",
      "title": "Test connector failures before relying on the workflow",
      "question": "What should happen when credentials, versions, or responses change?",
      "outcome": "Preserve uncertainty and verify real adapter boundaries with mock effects.",
      "beats": [
        {
          "id": "mcp-failure-exercise",
          "role": "transfer",
          "title": "Exercise wrong tokens, stale approvals, and lost responses",
          "speech": "Use mock effects to test a correctly shaped request with the wrong token audience. It must be rejected. Then provide a correctly scoped token without current task approval; production rollback must remain unavailable. Change the deployment revision after approval and verify that the old approval cannot dispatch the action. Simulate an accepted deployment whose response is interrupted, and require unknown-effect reconciliation before another write. Test credential expiry separately from denied scope or revoked consent: a documented refresh path may repair expiry, while missing authority requires a changed prerequisite. Finally test a schema upgrade during an active session. Preserve compatibility or coordinate the transition so the client cannot act on a stale contract. These checks establish useful boundaries without performing a real production rollback.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Mock effects reveal real authorization and recovery gaps"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Wrong audience",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "wrong token audience"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Stale approval",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Change the deployment revision"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Lost response",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "response is interrupted"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the client preserve uncertainty through interruption?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "unknown-effect reconciliation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Expired credentials differ from denied authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "credential expiry separately"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Changed schema",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "a schema upgrade"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "mcp-failure-exercise"
        },
        {
          "id": "mcp-recap",
          "role": "reflect",
          "title": "Connect the workflow with explicit responsibilities",
          "speech": "Choose the Model Context Protocol when its integration benefits justify the additional components. Pin and test the client, server, and transport contract. Separate caller identity, resource scope, and current task approval. Constrain all reachable capabilities and verify the actual executor. Preserve unknown effects and test recovery with controlled mutations. Those are five principles to retain. Remember: justify, pin, authorize, contain, reconcile. A shared interface can simplify delivery, but its operational guarantees come from the deployed components and their tests. Discuss next: which connector in your workflow has only one consumer and little reuse benefit? Which valid token can reach more than the current task permits? Apply this chapter by mapping one integration's responsibilities, permitted operations, credential scope, version contract, and failure tests. Then choose the simplest architecture that satisfies those requirements.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A shared interface needs tested operational guarantees"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Justified integration",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Choose the Model Context Protocol"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Current authority",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Separate caller identity"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Tested recovery",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve unknown effects"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: justify → pin → authorize → contain → reconcile",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: unnecessary server? Excess token scope?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "mcp-recap-spoken-v2"
        }
      ]
    }
  ],
  "narrationSHA256": "2d5097b87eba4bd726188a8611c8dafa2f71a085ea13d6bcfd9730623d79621e"
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
