(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-31",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Sandboxing, Permissions, and Blast Radius",
  "subtitle": "Professor Mode · Effective boundaries, scoped brokers, isolated execution, and recovery",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-31/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-31/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 31, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "b7630f8280050acc7863ed26bac33852b774c276f47215e006613817f7df219b",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Design for a hostile worker",
      "question": "What can the worker do if every proposal is malicious?",
      "outcome": "Assess effective capabilities and their maximum consequences.",
      "beats": [
        {
          "id": "containment-stakes",
          "role": "orient",
          "title": "The permission gap is invisible during normal success",
          "speech": "A deployment bot with cluster-wide administrator access is our first case. In the chapter's fictional scenario, the bot needs only a narrow deployment workflow, but broad permission was granted to get past setup errors. Normal success never exercises most of that authority, so even several quiet months cannot establish that unnecessary permissions are harmless or that the right boundary was tested. A coding worker running tests is our second case. The test command executes repository code, which may itself be hostile and able to inspect inherited secrets or reach the network. A credential proxy is our third case. The model never sees the token, yet a generic authenticated proxy might let it perform operations far beyond the task. These are illustrative designs, not measured production incidents or guarantees about a particular platform. Their common lesson is that containment depends on effective capability, including indirect paths. Our governing question is: what can the worker do if every proposal is malicious? We will inspect network policy, brokers, filesystems, subprocesses, deployment admission, and shutdown. By the end, you should be able to test a boundary and explain the remaining blast radius with evidence about what actually ran.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Containment is defined by effective capability"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Broad deploy access",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A deployment bot"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Successful routine runs do not exercise every granted permission",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Normal success never exercises"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Hostile tests",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A coding worker running tests"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Powerful proxy",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A credential proxy"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What can the worker do if every proposal is malicious?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "containment-stakes-spoken-v2"
        },
        {
          "id": "containment-execution-graph",
          "role": "derive",
          "title": "A policy object does not install an enforcement mechanism",
          "speech": "Draw the execution graph: model gateway, worker, tool servers, test subprocesses, credential broker, publisher, and downstream resources. For each edge identify the component that checks identity, arguments, resource scope, and data policy. List readable and writable files, network destinations, execution capabilities, and resource ceilings. A sandbox configuration describes intended policy; it does not create a mount namespace or control a tool server by itself. Compare required capabilities with effective grants, including inherited environment and development exceptions. A weighted risk score can help prioritize review, but it is not evidence that a particular capability is contained. Explain concrete consequences and recovery paths instead of treating a low score as authorization.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Execution graph → enforcing components → tested consequences"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Execution graph",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Draw the execution graph"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which component enforces every declared restriction?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "For each edge"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Enforcement",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the component that checks"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A sandbox description is not an installed control",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "describes intended policy"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Effective grants",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "effective grants"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "containment-execution-graph"
        }
      ]
    },
    {
      "id": "network",
      "title": "Verify actual communication boundaries",
      "question": "Does a parsed network policy establish isolation?",
      "outcome": "Test allowed paths, DNS, policy composition, and output channels.",
      "beats": [
        {
          "id": "containment-network-policy",
          "role": "derive",
          "title": "Network reachability and application authorization are different",
          "speech": "Allow only the destinations needed by the workload, and recognize that a hosted model gateway remains a data destination. Standard Kubernetes network policy operates at network and transport layers. It does not validate tenant identity, request paths, or payload content. Verify that the cluster's network implementation enforces the policy. Policies can combine additively, so another policy selecting the same workload may reopen traffic. A broad internal-network rule can expose unrelated databases and services. Restrict destinations precisely where the platform supports it, and use application-level authorization for the permitted operations. Inspect comments, shared artifacts, and logs separately because network policy alone does not establish appropriate information flow through those channels.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Network policy constrains reachability, not every allowed request"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An allowed gateway is still a destination for transmitted data",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "remains a data destination"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Reachability",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "network and transport layers"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Policy composition",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "combine additively"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could another policy reopen the denied path?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "another policy selecting"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Application policy",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "application-level authorization"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "containment-network-policy"
        },
        {
          "id": "containment-dns-probe",
          "role": "worked-example",
          "title": "An allowed resolver may still forward attacker-selected names",
          "speech": "Suppose direct external connections are denied, but the worker can query an internal resolver. If that resolver forwards arbitrary names, attacker-selected queries may still leave the network. An internal address does not by itself establish constrained resolution. Test the actual workload with harmless probes in an authorized environment. Include name resolution, direct connections, supported address families, metadata endpoints, and the required model-gateway request. The allowed control request should succeed while prohibited paths fail. Record effective policy and observed results. A configuration file that parses successfully proves syntax, not isolation. Where a path is untested or a platform feature unsupported, retain that limitation in the assessment.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Worker query → resolver policy → permitted or denied resolution"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Query",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "worker can query an internal resolver"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Resolver policy",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "forwards arbitrary names"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "forwards arbitrary names"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Internal DNS is insufficient if arbitrary external names are forwarded",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "internal address does not by itself"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Do allowed and denied probes match the actual task contract?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "allowed control request should succeed"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Test result",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "observed results"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "observed results"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "containment-dns-probe"
        }
      ]
    },
    {
      "id": "credentials",
      "title": "Separate hidden credentials from permitted authority",
      "question": "Can a token-free model still misuse a powerful proxy?",
      "outcome": "Expose scoped operations with resource and tenant checks.",
      "beats": [
        {
          "id": "containment-broker-authority",
          "role": "derive",
          "title": "Hiding the credential is necessary but insufficient",
          "speech": "Keep downstream credentials in a broker or service boundary where the model cannot read them. Authenticate the worker and bind its request to trusted initiating authority. Expose a narrow operation with constrained resource identifiers rather than a generic authenticated endpoint. For example, a pull-request reader can validate repository scope and request number, use its downstream credential internally, and return an allowlisted response. It must also reject another tenant's resource or a revoked grant. Disable unintended redirects and sanitize errors according to the operation's threat model. A hidden token still carries power; the broker must restrict how that power is used, not merely conceal its bytes.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Trusted task identity → scoped operation → internal credential use"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Identity",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Authenticate the worker"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Operation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Expose a narrow operation"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Expose a narrow operation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A generic authenticated proxy can expose excessive authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "generic authenticated endpoint"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Credential",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "use its downstream credential internally"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "use its downstream credential internally"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can this worker access another tenant or unrelated resource?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "another tenant's resource"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "containment-broker-authority"
        },
        {
          "id": "containment-credential-lifecycle",
          "role": "worked-example",
          "title": "Rotation and expiry have observable limits",
          "speech": "Use short-lived credentials with the smallest practical audience and permissions, while preserving explicit revocation where required. A broker can obtain a rotated credential on a later call without placing it in model context. Expiry bounds future accepted use according to the service's enforcement; it does not undo an action already accepted. Test errors without exposing secret values, including expired credentials and missing authority. Inspect message history and protected diagnostic output for accidental credential disclosure, but also test whether the broker denies unauthorized operations. The security property is both confidentiality of the credential and constrained use of its authority. Passing one of those checks does not imply the other.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Credential confidentiality and authority limits both matter"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Short lifetime",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "short-lived credentials"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Safe rotation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a rotated credential"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Revocation limits",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "does not undo an action"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the broker deny unauthorized use while keeping errors useful?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Test errors"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Token secrecy does not establish correct resource authorization",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "both confidentiality of the credential"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "containment-credential-lifecycle"
        }
      ]
    },
    {
      "id": "filesystem",
      "title": "Constrain files and executable children",
      "question": "Can path validation or a test command bypass the boundary?",
      "outcome": "Combine isolation with race-resistant access and secret-free execution.",
      "beats": [
        {
          "id": "containment-filesystem-races",
          "role": "derive",
          "title": "Checking a path and later opening it can leave a race",
          "speech": "Expose only required directories, using read-only access where possible and isolated writable scratch space. Protect trusted configuration and skill definitions from the execution context. Simple string-prefix checks are insufficient, and canonicalizing a path before opening it can still leave a race if a writable parent or symbolic link changes. Prefer filesystem isolation plus supported descriptor-relative access with appropriate no-follow or beneath-directory constraints. Test links, archive extraction, alternate path representations, and writable parents relevant to the platform. Container isolation also depends on deployment settings: privileged execution, host mounts, host networking, or a container-control socket can defeat the intended boundary. Verify those effective settings rather than assuming the container label is sufficient.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Restricted filesystem → race-resistant access → observed boundary tests"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Isolation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Expose only required directories"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A separate pathname check can race with the later open",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "can still leave a race"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can a writable parent redirect access after validation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a writable parent"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Access mechanism",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "descriptor-relative access"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "descriptor-relative access"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Tests",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Test links"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Test links"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "containment-filesystem-races"
        },
        {
          "id": "containment-hostile-tests",
          "role": "predict",
          "title": "A test command is an execution capability",
          "speech": "A coding worker may be allowed to edit a branch and run a named test command. Predict whether this necessarily confines a compromised worker to producing a bad patch. It does not: repository tests can execute code, and opening a pull request can trigger downstream automation or expose content through notifications. Run untrusted tests in a secret-free environment with constrained network and resource access. Separate artifact production from publication, and inspect the permissions of any automation triggered by the publisher. A human review before merge is useful but does not mediate every earlier effect. Draw those indirect paths before claiming that the only possible consequence is an unmerged branch.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Code changes can reach test execution and publication side effects"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Branch edits",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "edit a branch"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What can the test process and triggered automation access?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Predict whether"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Test execution",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "repository tests can execute code"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Downstream effects",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "trigger downstream automation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Review before merge does not mediate every earlier effect",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not mediate every earlier effect"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "containment-hostile-tests"
        }
      ]
    },
    {
      "id": "deployment",
      "title": "Constrain indirect privilege through workload creation",
      "question": "Can a narrow deployment permission still create a powerful workload?",
      "outcome": "Enforce admissible images, service accounts, volumes, and rollout actions.",
      "beats": [
        {
          "id": "containment-workload-admission",
          "role": "derive",
          "title": "Workload creation may indirectly grant stronger privileges",
          "speech": "Reducing the deployment bot's role from cluster administrator is the first repair. Permission to create a workload can still permit indirect privilege if the specification selects a powerful service account, mounts sensitive storage, or requests unsafe execution settings. A trusted deployment controller should constrain allowed image digests, namespaces, service accounts, volumes, security contexts, and rollout operations. Do not accept an arbitrary model-authored manifest merely because its top-level resource type is permitted. Combine resource permissions with admission constraints and task authorization. The question is what the created workload can do after admission, not only which API verb the submitting principal can call.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Deploy request → admission constraints → bounded workload"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Request",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Permission to create a workload"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A narrow API verb can create a broadly privileged child workload",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "indirect privilege"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which service account and mounts can the new workload select?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "powerful service account"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Admission",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A trusted deployment controller"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "A trusted deployment controller"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Workload",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "what the created workload can do"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "what the created workload can do"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "containment-workload-admission"
        },
        {
          "id": "containment-current-approval",
          "role": "worked-example",
          "title": "A once-valid deployment approval may expire before execution",
          "speech": "Prepare a deployment for an approved image and namespace, then revoke its authorization before dispatch. The resource-side gate should reject it while preserving the safe draft. Repeat with approval expiring between proposal and execution. Include an altered image digest or service account so the test checks operation binding as well as time. A transport credential with a valid audience still needs resource and action policy. Record the gate's reason without exposing credential details. The positive control uses a current authorized request within the allowed specification and should succeed. These tests establish behavior of the real enforcement path rather than merely confirming that a permission object contains expected fields.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Bound proposal → current authority check → execute or reject"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Proposal",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Prepare a deployment"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Authority check",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "resource-side gate"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "resource-side gate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Outcome",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "should reject it"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "should reject it"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is approval still valid for this exact image, target, and operation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "altered image digest"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Transport access does not authorize every resource action",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "still needs resource and action policy"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "containment-current-approval"
        }
      ]
    },
    {
      "id": "recovery",
      "title": "Test containment and revocation end to end",
      "question": "What remains after the worker is killed?",
      "outcome": "Stop children, reconcile in-flight effects, and report residual exposure.",
      "beats": [
        {
          "id": "containment-shutdown-drill",
          "role": "transfer",
          "title": "Stopping the worker must address children and in-flight effects",
          "speech": "Kill the worker in a controlled drill and verify that its owned child processes stop according to policy. Check that grants expire or are revoked as designed and that no new publications occur. Preserve the durable effect journal so requests already issued can be reconciled. Revocation is not retroactive cancellation: a destination may have accepted an action before the denial became effective. Include those in-flight effects and their discovery time in the blast-radius assessment. Review permission drift after meaningful changes to task scope, tools, or infrastructure. The drill passes when observed containment matches the documented boundary and unresolved remote outcomes remain visible for recovery.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Stop worker → stop owned execution → reconcile issued effects"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Stop worker",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Kill the worker"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Stop children",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "owned child processes stop"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "owned child processes stop"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "requests already issued can be reconciled"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "requests already issued can be reconciled"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Revocation cannot undo a previously accepted remote action",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Revocation is not retroactive cancellation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What remains active or uncertain after the worker stops?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "those in-flight effects"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "containment-shutdown-drill"
        },
        {
          "id": "containment-recap",
          "role": "reflect",
          "title": "Make blast radius a tested property",
          "speech": "Inventory effective capabilities, including indirect execution and publication paths. Assign every restriction to an enforcing component. Test network composition and name resolution as well as permitted outputs. Keep credentials outside model context while constraining broker authority. Isolate files and tests, and constrain the workloads a deployer can create. Verify shutdown, revocation, and reconciliation of issued effects. Remember: inventory, minimize, enforce, probe, revoke, reconcile. Apply the sequence to one worker with a permission inherited from development. Discuss next: which child process escapes the intended boundary? Which apparently narrow capability can create a more powerful resource? Next we examine behavioral alignment under autonomous execution.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Containment requires measured effective permissions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Effective capability",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Inventory effective capabilities"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Enforced restrictions",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Assign every restriction"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Recovery evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Verify shutdown"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: inventory → minimize → enforce → probe → revoke → reconcile",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: escaping child process? Indirect privilege?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "containment-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "fc69e085d68aa0fa2d81e2abe9e9cf0686117487bb592b43109d2cbe0ce8c137"
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
