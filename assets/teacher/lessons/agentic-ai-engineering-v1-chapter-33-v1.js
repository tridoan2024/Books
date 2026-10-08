(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-33",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "SRE for Agent Fleets",
  "subtitle": "Professor Mode · Version evidence, qualified rollouts, and distributed-effect recovery",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-33/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-33/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 33, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "6050b9463fedb6574e988c018286b736959c1c9e57407cbe2d3c591427afc7e3",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Operate the fleet as a consequential service",
      "question": "What remains to recover after dispatch stops?",
      "outcome": "Distinguish restored service from remediation of distributed effects.",
      "beats": [
        {
          "id": "sre-stakes",
          "role": "orient",
          "title": "A green service dashboard can miss harmful output",
          "speech": "A code migration removing rate limits is our first case. In the chapter's fictional fleet, generated changes pass functional tests while deleting defensive behavior the tests never checked. Some changes merge before a reviewer notices. Ordinary request success does not establish that the delivered work preserved its contract. A provider model alias is our second case. Behavior changes while the visible model name remains the same, leaving the team without a verified underlying revision. A lost publication response is our third case. The service creates a pull request, but the controller crashes before recording success. A replacement worker must discover the existing effect instead of submitting another one. These are illustrative operational scenarios, not measurements of a particular provider's behavior. Their common lesson is that production reliability includes version evidence, outcome quality, and the state of distributed effects. Our governing question is: what remains to recover after dispatch stops? We will build useful manifests, qualify changes, contain incidents, reconcile uncertain operations, and prepare current-state compensation. By the end, you should be able to distinguish restored service, corrected artifacts, pending decisions, and effects that cannot be recalled.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Fleet reliability includes output quality and distributed effects"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Defensive behavior lost",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A code migration removing rate limits"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Successful requests do not establish acceptable delivered work",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Ordinary request success"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Unknown model revision",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A provider model alias"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Lost response",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A lost publication response"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What remains to recover after dispatch stops?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "sre-stakes"
        },
        {
          "id": "sre-observable-failure",
          "role": "derive",
          "title": "Preserve ordinary service signals and add outcome evidence",
          "speech": "Latency, traffic, errors, saturation, and availability still matter. Add accepted-output quality, cost, coverage, denied operations, and unresolved effects. A service can return successful responses while producing systematically wrong artifacts; this is not unique to agents, but model variation adds another source of uncertainty. Preserve recorded observations for debugging and use fresh model calls as separately labeled evaluations. An alert can suggest a model regression, tool outage, injection attempt, or a shift in the mix of tasks without distinguishing them conclusively. Contain harmful actions first, then refine the cause using traces, effective configuration, and resource evidence. Do not wait for an elegant explanation before stopping an observed harmful path.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Service health + delivered quality + effect state"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Service signals",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Latency, traffic, errors"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Outcome signals",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "accepted-output quality"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Effect inventory",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "unresolved effects"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An alert category is a hypothesis to investigate",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "An alert can suggest"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What immediate containment does the observed consequence require?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Contain harmful actions first"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "sre-observable-failure-spoken-v2"
        }
      ]
    },
    {
      "id": "manifest",
      "title": "Identify the deployed behavior inputs",
      "question": "What does the manifest cover and what remains unknown?",
      "outcome": "Version effective configuration and retain source identity.",
      "beats": [
        {
          "id": "sre-manifest-scope",
          "role": "derive",
          "title": "Fingerprint the configuration that can change behavior",
          "speech": "Record prompt and skill revisions, tool schemas and server identities, evaluator configuration, runtime dependencies, effective permissions, selected memory snapshot, and the available model identity. Include source paths alongside content hashes so moving a file can change the fingerprint when location matters. Attach the manifest to every run and relevant output. A manifest only identifies inputs it actually covers. If a provider alias does not reveal its underlying revision, record that uncertainty instead of inventing a pin. Comparing manifests narrows candidate explanations for a behavior change; it does not prove causation. Input distribution can also change while every tracked configuration field stays identical.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Manifest = covered identities, revisions, paths, and effective configuration"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Behavior inputs",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "prompt and skill revisions"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Effective authority",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "effective permissions"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Model uncertainty",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "available model identity"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which behavior-changing dependency is missing from this manifest?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "only identifies inputs it actually covers"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A fingerprint cannot identify an unobserved provider revision",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "record that uncertainty"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "sre-manifest-scope"
        },
        {
          "id": "sre-manifest-test",
          "role": "worked-example",
          "title": "A renamed file is a useful identity test",
          "speech": "Suppose a directory fingerprint concatenates file contents but ignores their paths. Two configurations can contain the same bytes assigned to different filenames, yet produce the same combined input to the hash. Preserve a deterministic list of relative paths and content digests instead. Test a rename, content change, permission change, and selected memory change against the production manifest design. Verify that each relevant change is visible. Then check whether the previous revision can actually run against current state. A model version that is no longer offered is not an available rollback target. Maintain a separately qualified fallback or hold affected work when restoration is not possible.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Path and content records → manifest comparison → usable recovery target"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Identity records",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "relative paths and content digests"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would a rename or changed effective permission alter the manifest?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Test a rename"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Comparison",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "each relevant change is visible"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "each relevant change is visible"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Recovery target",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "previous revision can actually run"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "previous revision can actually run"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A nominal old version is not a usable rollback if it is unavailable",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "no longer offered"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "sre-manifest-test"
        }
      ]
    },
    {
      "id": "canary",
      "title": "Qualify change before broad rollout",
      "question": "Can a small passing sample miss the risky subtype?",
      "outcome": "Use isolated shadow work, representative comparison, and predefined gates.",
      "beats": [
        {
          "id": "sre-shadow-canary",
          "role": "derive",
          "title": "Shadow mode must isolate intermediate effects",
          "speech": "Begin with regression fixtures and matched shadow evaluation. The candidate may read representative inputs, but side effects must be disabled or redirected at every relevant adapter. Discarding only the final answer does not stop intermediate publication or database writes. Compare candidate and baseline quality, coverage, cost, and policy behavior. Then use a limited live rollout only within its authorized risk envelope. A split of existing traffic redistributes work; it does not inherently double inference. Shadowing the same requests with two executions adds extra work. Include the real evaluation and recovery cost in the plan. Keep the stable cohort comparable in time and task mix rather than assuming yesterday's traffic is equivalent.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Regression fixtures → isolated shadow → limited live rollout"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Fixtures",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "regression fixtures"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Shadow",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "matched shadow evaluation"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "matched shadow evaluation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Are all effect-capable adapters disabled or redirected in shadow mode?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "every relevant adapter"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Discarding final output does not isolate intermediate tools",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Discarding only the final answer"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Live rollout",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "limited live rollout"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "limited live rollout"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "sre-shadow-canary"
        },
        {
          "id": "sre-release-evidence",
          "role": "predict",
          "title": "A canary can miss a rare but consequential task class",
          "speech": "Predict whether a passing small canary establishes safety for a rare migration subtype it never encountered. It does not. Define critical task coverage, sample requirements, observation windows, quality margins, and cost limits before examining results. Use representative comparison and independently assessed consequential cases. An empty stable cohort or missing high-risk subtype means evidence is insufficient. Hold the release or perform bounded additional evaluation. A critical authorization failure can justify immediate containment before any minimum sample count. Numerical defaults in example code are illustrative heuristics, not statistical approval rules. Separate promotion eligibility from the accountable decision to deploy within authorized scope.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Release decision requires representative evidence and predefined criteria"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which important subtype did the canary never exercise?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Predict whether"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Task coverage",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "critical task coverage"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Comparison evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "representative comparison"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Insufficient evidence means hold; critical failure can mean immediate containment",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "evidence is insufficient"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Decision",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "accountable decision"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "sre-release-evidence"
        }
      ]
    },
    {
      "id": "incident",
      "title": "Contain and inventory the regression window",
      "question": "Does a missing response mean the action never happened?",
      "outcome": "Track all intended and issued operations through reconciliation.",
      "beats": [
        {
          "id": "sre-regression-window",
          "role": "derive",
          "title": "Inventory intended and issued actions, not only successful spans",
          "speech": "Bound the suspected regression window using available version and execution evidence. Stop new dispatch for affected work and identify active workers. Inventory intended requests, issued requests, provider identifiers, known results, approvals, and telemetry gaps. A successful span is useful evidence, but its absence does not prove the operation failed. Separate confirmed success, confirmed failure before effect, and unknown outcome. Query authoritative resource state to reconcile unknown operations before retrying or compensating. Include publications, data writes, notifications, created resources, and downstream triggers. Assign an owner to unresolved effects so the inventory remains actionable after the main service becomes healthy again.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Bound window → enumerate operations → reconcile effect state"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Window",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Bound the suspected regression window"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Inventory",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Inventory intended requests"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Inventory intended requests"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A missing success span is not proof of a missing effect",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "its absence does not prove"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Query authoritative resource state"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Query authoritative resource state"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who owns each unresolved operation after service restoration?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Assign an owner"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "sre-regression-window"
        },
        {
          "id": "sre-lost-response",
          "role": "worked-example",
          "title": "A committed pull request may have no recorded success response",
          "speech": "In a local drill, the mocked publication service commits a pull request and then the controller crashes. The replacement worker finds the durable operation identity and queries the service. It should reconcile the existing pull request rather than create another. Retain the original business identity across attempts. If a provider suppresses duplicate effects for repeated attempts, verify its key scope, retention, parameter matching, and stored-result behavior. A key that has expired from the provider's store for detecting duplicates may no longer prevent another request. Do not change identity merely to bypass an inconvenient result. Identity also does not supply fresh authorization. The operation must satisfy its receiver contract and the latest authorization decision.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Remote commit → lost response → reconcile existing operation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Commit",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "commits a pull request"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Lost response",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "controller crashes"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "controller crashes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "queries the service"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "queries the service"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Provider idempotency has a specific scope, lifetime, and parameter contract",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "verify its key scope"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What happens when the provider no longer remembers this key?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A key that has expired"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "sre-lost-response-spoken-v3"
        }
      ]
    },
    {
      "id": "recovery",
      "title": "Compensate against current resource state",
      "question": "Can reverting old work damage later legitimate edits?",
      "outcome": "Respect authority, dependencies, and in-flight ownership.",
      "beats": [
        {
          "id": "sre-stale-workers",
          "role": "derive",
          "title": "Rollback must address workers that already hold work",
          "speech": "Selecting the previous configuration changes future dispatch. It may not stop active workers, terminate their children, or revoke remote requests. Prevent new incompatible work, identify in-flight actions, and apply supported revocation or resource-enforced fencing. A worker can pause after checking ownership and resume after a replacement takes over. Its old generation must be rejected where the write is accepted. A coordinator flag alone cannot provide that guarantee. Where the resource lacks fencing, use available version preconditions, narrower authority, serialized dispatch, and explicit residual-risk handling. Preserve the effect journal through shutdown so already-issued actions can still be reconciled.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Stop dispatch → contain current workers → enforce current writes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Dispatch stop",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Selecting the previous configuration"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Changing a version string does not revoke issued remote effects",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "may not stop active workers"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Worker containment",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "identify in-flight actions"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "identify in-flight actions"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can an obsolete worker still write after replacement?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A worker can pause"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Resource fence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "rejected where the write is accepted"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "rejected where the write is accepted"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "sre-stale-workers"
        },
        {
          "id": "sre-compensation",
          "role": "worked-example",
          "title": "Compensation must respect changes made after the incident",
          "speech": "A migration pull request removed a rate limit and later received a legitimate human edit. Reverting the entire artifact could discard that later work. Inspect current resource state and dependencies before proposing a correction. Record the affected operation, observed consequence, proposed compensation, required authority, and current preconditions. Apply compensation through the ordinary resource gate. Closing a draft, reverting a merge, correcting a database row, and responding to a sent notification have different recovery limits. Preserve unknown effects for reconciliation rather than treating every item as safely reversible. Restoring the old fleet configuration and remediating its already-distributed outputs are separate parts of recovery.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Current state → scoped compensation proposal → authorized correction"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A blanket revert may destroy legitimate later work",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "discard that later work"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Inspect current state",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Inspect current resource state"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which downstream changes depend on the artifact being corrected?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "state and dependencies"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Propose correction",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "proposed compensation"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "proposed compensation"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Authorize",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "ordinary resource gate"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "ordinary resource gate"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "sre-compensation"
        }
      ]
    },
    {
      "id": "learning",
      "title": "Improve detection without inventing a cause",
      "question": "What evidence supports the incident explanation?",
      "outcome": "Turn known failure classes into operational tests and honest postmortems.",
      "beats": [
        {
          "id": "sre-postmortem",
          "role": "synthesize",
          "title": "Separate observed evidence from explanatory hypotheses",
          "speech": "A useful postmortem records the incident window, distributed effects, remaining uncertainty, configuration changes, and detection delay. Compare observations across relevant task classes and revisions without inventing an account of the model's internal reasoning or training. A shared failure across several workers can arise from a shared tool or source, not only a model update. Explain which evidence supports the selected cause and which alternatives remain plausible. Improve the coverage that missed the failure class, such as preservation of defensive behavior, and test the recovery path that was difficult in practice. Give each unresolved action a disposition and owner rather than declaring the incident finished when dashboards turn green.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Postmortem: evidence, uncertainty, missed coverage, recovery actions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Observed effects",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "distributed effects"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Do not invent private model reasoning to make the story feel complete",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "without inventing an account"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Cause evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "which evidence supports"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Improved coverage",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Improve the coverage"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What test would detect this failure class earlier?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "preservation of defensive behavior"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "sre-postmortem"
        },
        {
          "id": "sre-recap",
          "role": "reflect",
          "title": "Recovery ends with evidence about every affected action",
          "speech": "Version the effective behavior inputs and record unknown provider identity honestly. Qualify changes with isolated shadow work and representative live evidence. Contain harmful execution and inventory all intended or issued operations. Keep unknown outcomes in reconciliation with a clear owner. Fence obsolete workers and prepare compensation against current state. Distinguish service restoration from corrected artifacts and irreversible consequences. Remember: identify, qualify, contain, enumerate, reconcile, remediate. Apply that sequence to a recent fleet change and a hypothetical lost response. Discuss next: which effect would be missing from successful-span queries? Which rollback target is no longer actually available? Next we apply the loop contract to a complete coding workflow.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Restored service is one milestone in distributed recovery"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Version evidence",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Version the effective behavior inputs"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Effect inventory",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "inventory all intended or issued operations"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Current-state recovery",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "prepare compensation against current state"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: identify → qualify → contain → enumerate → reconcile → remediate",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: missing effect inventory? Unavailable rollback target?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "sre-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "6109f77b5396fa057f948dce94afadc04147e652b37f58bc323b933cd07f8cff"
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
