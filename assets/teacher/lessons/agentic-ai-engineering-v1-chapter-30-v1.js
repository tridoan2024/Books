(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-30",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Security in Autonomous Loops",
  "subtitle": "Professor Mode · Authority boundaries, information flows, persistence, and recovery",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-30/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-30/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 30, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "034177f08bbd19bce25937250c8ce27c2d83418dbd3e62c9849ffca785690b37",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Analyze the complete attack path",
      "question": "What can a redirected model actually reach?",
      "outcome": "Connect untrusted content to available data and observable effects.",
      "beats": [
        {
          "id": "loop-security-stakes",
          "role": "orient",
          "title": "The permitted output channel can carry the breach",
          "speech": "A review comment leaking credentials is our first case. The chapter tells a fictional story in which a coding worker reads attacker-controlled repository content. A diagnostic shell exposes inherited environment secrets, and a separate publisher posts the model's output as a review comment. The permitted comment channel carries the disclosure even though arbitrary network traffic is restricted. A modified tool description is our second case. Text presented as tool documentation attempts to redirect the model toward unrelated private data. A poisoned memory entry is our third case. Untrusted content becomes reusable guidance and may influence later runs after its original source is no longer visible. These scenarios illustrate attack mechanisms; the named company and incident are not documented production evidence. Their common failure is allowing data or model proposals to cross a boundary between evidence and permission without adequate enforcement. Our governing question is: what can a redirected model actually reach? We will map data flows, apply task permissions through trusted components outside the prompt, inspect tool and memory trust, constrain stale actions, and test recovery. By the end, you should be able to explain what each control prevents, what it only detects, and what uncertainty remains.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Untrusted content → model proposal → consequential capability"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Comment disclosure",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A review comment leaking credentials"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An approved output channel can still carry sensitive information",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "permitted comment channel"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Tool description",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A modified tool description"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Persistent guidance",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A poisoned memory entry"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What can a redirected model actually reach?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "loop-security-stakes-spoken-v2"
        },
        {
          "id": "loop-security-threat-boundary",
          "role": "derive",
          "title": "Assess real permissions rather than interface labels",
          "speech": "An interactive assistant may call external functions, and an autonomous loop may have strong approval gates. The interface label does not determine the security boundary. Enumerate actual input sources, readable data, available tool interfaces, output destinations, persistence, and required approvals. Repeated execution can extend exposure and retain malicious influence across iterations, but the consequences depend on the capabilities the system grants. Model training and provenance cues help distinguish instructions from data; they do not make every proposed operation authorized. Assume that an injected instruction could influence the model. The decisive question is whether trusted components still reject an operation outside the scope of the initiating task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Threat boundary = actual sources, permissions, effects, persistence"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A chat or loop label does not establish the permission boundary",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "interface label does not determine"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Input sources",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "actual input sources"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Capabilities",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "available tool interfaces"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Persistence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "persistence, and required approvals"
            },
            {
              "action": "note",
              "id": "question",
              "text": "If the model complies with hostile text, what can still execute?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Assume that an injected instruction"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "loop-security-threat-boundary-spoken-v2"
        }
      ]
    },
    {
      "id": "authority",
      "title": "Put authority outside model text",
      "question": "Can a document redefine the task permission?",
      "outcome": "Enforce authenticated scope at the resource or tool broker.",
      "beats": [
        {
          "id": "loop-security-deputy",
          "role": "derive",
          "title": "Retrieved content cannot redefine whose authority is used",
          "speech": "A review worker reads content supplied by a contributor and may publish using a team's credential. That difference in principals creates a confused-deputy risk. The contributor's text must not acquire the team's authority merely because the model reads it. Carry the authenticated initiating identity, workload identity, task scope, tenant, target resource, permitted operations, expiry, and required approval in trusted state. The model submits a proposed effect. A tool broker or resource server checks that effect against the envelope. The model can suggest what to do, but cannot enlarge its own permissions. Transport authentication establishes access to a service under particular credentials; it does not by itself establish that every proposed action serves the user's authorized task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Authenticated task envelope → proposed operation → resource authorization"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Whose authority permits this exact operation on this resource?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "difference in principals"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Task authority",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "authenticated initiating identity"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Proposal",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The model submits"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "The model submits"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Enforcement",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "checks that effect"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "checks that effect"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A document cannot enlarge the initiating task authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot enlarge its own permissions"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "loop-security-deputy"
        },
        {
          "id": "loop-security-provenance",
          "role": "worked-example",
          "title": "A wrapper is useful context, not an execution gate",
          "speech": "Imagine a source comment claims that a mandatory maintenance procedure requires publishing environment values. Preserve its source identity and mark the retrieved content as data. The model should interpret it as material under review rather than as a new instruction. Now assume the model still proposes the disclosure. The worker should lack access to unrelated secrets, and the publisher should independently enforce destination and operation policy. This exercise distinguishes a behavioral aid from an enforcing boundary. The system does not need to identify which hidden thought caused the proposal before rejecting it. Test the actual resource access and publication path, including a legitimate review comment that should still succeed.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Untrusted source → behavioral interpretation → independent enforcement"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Source",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a source comment claims"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Interpretation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The model should interpret"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "The model should interpret"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does denial still hold when the model proposes disclosure?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Now assume"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Enforcement",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "publisher should independently enforce"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "publisher should independently enforce"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A provenance wrapper cannot substitute for resource authorization",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "behavioral aid from an enforcing boundary"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "loop-security-provenance"
        }
      ]
    },
    {
      "id": "channels",
      "title": "Find every relevant information flow",
      "question": "Does removing an HTTP tool prevent disclosure?",
      "outcome": "Review approved outputs and data exposure as well as network destinations.",
      "beats": [
        {
          "id": "loop-security-trifecta",
          "role": "derive",
          "title": "Use the three-part pattern to find a concrete disclosure path",
          "speech": "Private data access provides information worth stealing. Untrusted content gives an attacker a way to influence the model. Externally observable communication can carry that information beyond the intended boundary. Together these conditions describe a dangerous disclosure path, but they are not a complete model of every possible harm. Removing a real path helps only to the extent that no equivalent channel remains. Injection can also corrupt analysis, consume resources, or propose unauthorized changes without disclosing a secret. Trace specific sources, processing steps, and sinks. When a task requires sensitive data and external output, narrow the information and authority available at each step rather than declaring the whole design safe from a checklist.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Disclosure path: sensitive data + attacker influence + observable sink"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Private data",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Private data access"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Untrusted content",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Untrusted content"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "External sink",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Externally observable communication"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The pattern finds disclosure risk; it does not cover every harm",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not a complete model"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which concrete source-to-sink path remains possible?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Trace specific sources"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "loop-security-trifecta"
        },
        {
          "id": "loop-security-output-channels",
          "role": "predict",
          "title": "Predict whether blocking arbitrary HTTP closes the path",
          "speech": "A worker cannot send arbitrary web requests, but it can publish comments and write shared artifacts. Predict whether that alone prevents information disclosure. It does not. Permitted model requests, comments, logs, filenames, and downstream services can still carry sensitive content to different audiences. Evaluate those flows under the actual threat model. Minimize readable secrets and use a publisher with a narrow output contract and destination policy. Pattern scanners can catch familiar credential formats, while anomaly checks can flag suspicious arguments. Both can miss novel encodings or split disclosures and can reject legitimate data. An allowlisted destination also says nothing by itself about whether the transmitted content is appropriate.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Permitted channels still require information-flow analysis"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Comments",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "publish comments"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Shared artifacts",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "write shared artifacts"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What information can leave through an otherwise legitimate action?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Predict whether"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Logs and services",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "comments, logs, filenames"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Allowed destination ≠ authorized content disclosure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "An allowlisted destination"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "loop-security-output-channels"
        }
      ]
    },
    {
      "id": "supply",
      "title": "Review tools as privileged dependencies",
      "question": "What does a pinned description actually establish?",
      "outcome": "Separate server identity, implementation, schema, and granted permissions.",
      "beats": [
        {
          "id": "loop-security-tool-supply",
          "role": "derive",
          "title": "Tool implementation and description create different risks",
          "speech": "A malicious tool implementation can perform an unauthorized secondary action while returning an apparently normal result. A malicious description can instead influence which tools the model proposes to call and what arguments it supplies. Review both paths. Bind tool configuration to the intended server identity, schema, transport, implementation artifact where available, and granted permissions. An unchanged description can front a changed remote service. A hash establishes identity relative to a reviewed version; it does not prove that version is benign. When remote implementation details cannot be pinned, document the remaining trust and restrict the data and authority exposed to that service.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Tool trust includes more than descriptive text"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Implementation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "malicious tool implementation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Description",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "malicious description"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Identity and grants",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "server identity, schema"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could the server change while its description stays the same?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "An unchanged description"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A matching hash proves identity, not harmless behavior",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A hash establishes identity"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "loop-security-tool-supply"
        },
        {
          "id": "loop-security-tool-update",
          "role": "worked-example",
          "title": "Review changes before the new manifest acquires authority",
          "speech": "Suppose an approved formatting service changes its schema and requests broader filesystem access. Compare the new manifest with the reviewed configuration before loading it into a production task. Treat new fields and permissions as changes requiring the applicable review process. Keep execution authorization independent even after review: a formatting tool's description cannot authorize reading an unrelated private file. Test description changes, unfamiliar tools, server identity changes, and legitimate version updates. The acceptance check is that unauthorized changes cannot silently broaden capability, while an explicitly reviewed compatible update can be deployed. Preserve the previous configuration so diagnosis and rollback have a known reference.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Changed tool configuration → review → scoped deployment"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Change",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "changes its schema"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Review",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare the new manifest"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Compare the new manifest"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Manifest review does not replace per-operation authorization",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Keep execution authorization independent"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which identity, schema, or permission changed?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Test description changes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Deploy",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "can be deployed"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "can be deployed"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "loop-security-tool-update-spoken-v2"
        }
      ]
    },
    {
      "id": "persistence",
      "title": "Prevent untrusted content from becoming lasting authority",
      "question": "Who can promote a proposed memory into behavior-changing guidance?",
      "outcome": "Separate candidate observations from trusted promotion.",
      "beats": [
        {
          "id": "loop-security-memory-promotion",
          "role": "derive",
          "title": "A candidate observation cannot promote itself into policy",
          "speech": "An injected source may ask the model to save a workflow improvement that actually changes future authority. Permit the execution context to submit candidate observations without allowing it to mark its own text trusted. A separate promotion boundary checks source identity, scope, supporting evidence, and required approval. Model-authored provenance lists are claims to inspect, not reliable records of which tokens caused a decision. Protect trusted skill files and behavior-changing configuration from direct modification by the executing worker. Legitimate improvement can proceed through a separate reviewed path. The key separation is between proposing knowledge and granting that proposal lasting influence over future work.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Candidate observation → independent promotion check → scoped guidance"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Candidate",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "submit candidate observations"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The executing model cannot label its own proposal trusted",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "mark its own text trusted"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Promotion check",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A separate promotion boundary"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "A separate promotion boundary"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who can promote a statement that changes future behavior?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "between proposing knowledge"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Guidance",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "lasting influence over future work"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "lasting influence over future work"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "loop-security-memory-promotion"
        },
        {
          "id": "loop-security-compaction",
          "role": "worked-example",
          "title": "Summarizing hostile text does not make it trusted",
          "speech": "A run reads an untrusted document and later compresses its context. If the summary restates an injected directive as established project guidance, the original source may disappear while the directive survives. Preserve source references and trust classification through compaction, or treat the summary as untrusted derived material. A well-formatted memory record with a timestamp is not proof of validity. Test a candidate that suggests a broader publication policy after reading hostile content. It should remain a candidate unless the trusted promotion process establishes the required evidence and authority. Audit affected stored entries during recovery, because stopping the current run alone may leave the harmful guidance available to later runs.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Untrusted source → derived summary → later retrieval"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Source",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "an untrusted document"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Summary",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the summary restates"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "the summary restates"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Will the original trust classification survive compaction?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Preserve source references"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Formatting, timestamps, and summarization do not confer trust",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A well-formatted memory record"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Later use",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "later runs"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "later runs"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "loop-security-compaction"
        }
      ]
    },
    {
      "id": "freshness",
      "title": "Bind actions to the evidence actually reviewed",
      "question": "Can a final hash check close a write race?",
      "outcome": "Use immutable revisions or resource-side preconditions.",
      "beats": [
        {
          "id": "loop-security-check-use",
          "role": "derive",
          "title": "A hash comparison does not close the final mutation race",
          "speech": "A reviewer evaluates commit A, then another actor updates the target before publication or deployment. Rechecking a hash can detect a change that occurred before that check. It cannot prevent another change between the check and the consequential write. Use an immutable revision or a resource-side conditional operation that verifies the expected version when applying the mutation. A fencing check can similarly reject an obsolete owner's write. The enforcing component must combine the relevant precondition with the action. If the destination cannot enforce that condition, state the residual race and restrict the operation accordingly. A confident model statement about an earlier revision supplies no authority over a later one.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reviewed revision → resource-side precondition → mutation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Reviewed A",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "evaluates commit A"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A separate final check still leaves a check/use window",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "between the check and the consequential write"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Precondition",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "resource-side conditional operation"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "resource-side conditional operation"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Mutation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "when applying the mutation"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "when applying the mutation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which component atomically checks the revision and applies the action?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "combine the relevant precondition"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "loop-security-check-use"
        },
        {
          "id": "loop-security-control-claims",
          "role": "synthesize",
          "title": "Name the claim each security control supports",
          "speech": "A provenance cue is a behavioral mitigation. A correctly implemented resource denial enforces a defined authorization boundary under its implementation assumptions. A redaction scanner provides fallible detection. Credential revocation limits future use but cannot recall information already copied. These controls support different claims, and several may share the same uncovered path. Test complete attack routes rather than multiplying confidence by the number of controls on a diagram. Include readable data, permitted outputs, persistent state, concurrent changes, and tool behavior. Record what was exercised and what remains untested. This makes the security assessment useful when another engineer must decide whether the proposed deployment satisfies its actual threat model.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Prevention, behavioral mitigation, detection, and recovery differ"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Behavioral aid",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "A provenance cue"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Enforced denial",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "resource denial"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Detection",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "A redaction scanner"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Recovery",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Credential revocation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Several controls may still leave the same path uncovered",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "same uncovered path"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What exact claim did the attack test establish?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Record what was exercised"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "loop-security-control-claims"
        }
      ]
    },
    {
      "id": "recovery",
      "title": "Test prevention and recovery separately",
      "question": "Will the boundary hold if the model follows the injection?",
      "outcome": "Verify malicious denial, legitimate success, and credential containment.",
      "beats": [
        {
          "id": "loop-security-recovery-drill",
          "role": "transfer",
          "title": "Contain access and verify the repaired boundary",
          "speech": "For the fictional disclosure, first disable the harmful publication path and revoke exposed credentials while preserving necessary evidence under restricted access. Identify which data was reachable and which sinks received it. Deleting the visible comment cannot recall notifications or copies. Rotate credentials according to each service's procedure and verify that old credentials are rejected. In a local test harness, use dummy secrets and mocked publication. Feed the worker hostile source content and assume it proposes the bad action. The worker must be unable to read an unrelated canary secret, and the broker must reject publication outside policy. Then verify that a legitimate review still succeeds. That tests containment while preserving useful service.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Contain → investigate exposure → verify repaired controls"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Contain",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "first disable"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Investigate",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Identify which data"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Identify which data"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Deleting visible output does not undo disclosure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cannot recall notifications or copies"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Verify",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "verify that old credentials are rejected"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "verify that old credentials are rejected"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Do both malicious denial and legitimate success pass?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Then verify that a legitimate review"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "loop-security-recovery-drill"
        },
        {
          "id": "loop-security-recap",
          "role": "reflect",
          "title": "Authority must survive a model that follows hostile content",
          "speech": "Map actual sources, permissions, outputs, and persistence. Keep task authority in trusted components outside model text. Minimize sensitive data exposure and inspect permitted communication paths. Review tool identity, implementation, schema, and permissions separately. Gate lasting memory changes and preserve provenance through compaction. Bind consequential actions to current resource preconditions and test recovery. Remember: map, minimize, authorize, preserve, enforce, recover. Apply the sequence to one real tool-enabled workflow. Discuss next: which allowed output could disclose sensitive data? Which stored lesson can change future behavior without review? Next we will design the sandbox and permission boundaries that contain a compromised worker.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Contain consequences even when hostile text influences the model"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Task authority",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep task authority"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Bounded information",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Minimize sensitive data"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Current preconditions",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Bind consequential actions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: map → minimize → authorize → preserve → enforce → recover",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: sensitive allowed output? Unreviewed lasting guidance?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "loop-security-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "99e9d2f16d3e4d9fd1ab963a2731a830c3f03bdb80f97fae078424a2553163c7"
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
