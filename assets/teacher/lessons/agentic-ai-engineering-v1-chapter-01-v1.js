(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-01",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "The Human Is the Loop",
  "subtitle": "Professor Mode · repeatable checks, bounded repair, and evidence you can defend",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-01/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-01/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 1, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "15f97827411a9e5724a0c95524b1cf6931d88e05d00a6f2fae19eec2b1e1693d",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Move repeatable checks into the workflow",
      "question": "Which part of human review can become an observable check?",
      "outcome": "Separate repeated checking from specification and judgment.",
      "beats": [
        {
          "id": "human-loop-stakes",
          "role": "orient",
          "title": "Three workflows share one missing feedback path",
          "speech": "A payment adapter is our first case. In the chapter's fictional engineering story, Priya repeatedly reviews generated retry code. One version calculates the delay incorrectly; another loses the logical operation key. A third reveals that the required recovery behavior was never specified. Her review combines repeatable checking with a real design decision. A document draft is our second case. An editor can check required sections mechanically, yet still needs judgment about whether the argument is persuasive. A research summary is our third case. A numerical claim can match a source table while the surrounding conclusion remains unsupported. These are illustrative workflows, not measured production outcomes. The common mechanism is a missing connection between generation, an appropriate check, and the next decision. Repeated manual checking can consume attention, while a weak automated check can create false confidence. Our governing question is: which verification functions should move into the loop, and which judgments must remain explicit? By the end, you should be able to identify a bottleneck, define a bounded loop contract, distinguish what an oracle proves, and test whether automation improves verified work. We will use the payment adapter as a running example, then transfer the method to writing and research.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Connect generation to evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Payment adapter",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A payment adapter"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Checks and judgment have different jobs",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "repeatable checking with a real design decision"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Document draft",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A document draft"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Research summary",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A research summary"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which verification functions should move?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "human-loop-stakes"
        },
        {
          "id": "human-loop-specification",
          "role": "explain",
          "title": "A failed requirement and a missing requirement differ",
          "speech": "An explicit requirement gives the checker something to discriminate. If the delay must double after each failed attempt, a test can reject a linear increase. A missing requirement is different. When nobody has decided how the circuit breaker recovers, the model cannot establish the intended policy merely by producing plausible code. Ask the domain owner or use an already accepted specification. Then encode the chosen behavior. Better instructions can prevent misunderstanding, but instructions alone do not demonstrate execution. The runtime must run the check, capture its result, and associate it with the current artifact. The chapter's fictional improvement from repeated review to a short automated run illustrates that connection. Its timings do not establish a production speedup. Nor do nine passing assertions establish every payment property. Start by distinguishing what has been specified, what has been checked, and what remains a design decision.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Specify → check → interpret"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Explicit requirement",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "An explicit requirement"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Missing requirement",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A missing requirement"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Execution evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The runtime must run"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Illustrative timing is not a measured speedup",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Its timings do not establish"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What remains a design decision?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "what remains a design decision"
            }
          ],
          "pauseAfterMs": 3000,
          "audioSegment": "human-loop-specification"
        }
      ]
    },
    {
      "id": "bottleneck",
      "title": "Diagnose before automating",
      "question": "What actually consumes time, and what evidence would reduce it?",
      "outcome": "Measure the workflow and select a discriminating check.",
      "beats": [
        {
          "id": "human-loop-measure",
          "role": "derive",
          "title": "Measure the work before naming its bottleneck",
          "speech": "Measure a complete run before deciding that review is the bottleneck. Record the time spent gathering context, generating an artifact, checking it, waiting on dependencies, repairing defects, and making decisions. A fast model can still sit behind a slow test environment. A slow reviewer may be resolving an incomplete specification rather than repeating a mechanical check. Choose a recurring defect with a clear observation. For the adapter, record whether each retry preserves the same logical operation key. For a document, check whether required sections exist. For research, compare an exact number with its cited source. Each check answers a bounded question. A citation that exists can still fail to support a claim, and a complete outline can still contain a weak argument. Measure the defect the check addresses before measuring the total workflow improvement.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Observe the actual bottleneck"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Complete run",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Measure a complete run"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Recurring defect",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Choose a recurring defect"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Bounded check",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Each check answers"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A source can exist without supporting the claim",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A citation that exists"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What defect does this check detect?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the defect the check addresses"
            }
          ],
          "pauseAfterMs": 3000,
          "audioSegment": "human-loop-measure"
        },
        {
          "id": "human-loop-predict",
          "role": "predict",
          "title": "Would a green parser settle the payment question?",
          "speech": "Imagine that the generated adapter compiles, its output is valid structured data, and the model reports that the task is complete. Would you release it? Pause and name the missing evidence. Compilation checks part of the artifact's form. It does not show that retries preserve payment identity or that the breaker follows the agreed recovery rule. Add checks that exercise those behaviors. Now suppose the test service is unavailable. That outcome is inconclusive, not proof that the adapter is wrong and not permission to assume it is correct. A useful oracle reports a failure that can guide repair or a precise reason why it could not check. It should not return a reassuring verdict merely because a tool exited successfully. The question is always whether the evidence distinguishes acceptable behavior under the current requirement.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Passing a shallow check leaves a behavioral gap"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What evidence is still missing?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "name the missing evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Compilation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compilation checks"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Behavior",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Add checks that exercise"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Inconclusive",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "That outcome is inconclusive"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A tool exit is not task acceptance",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "merely because a tool exited"
            }
          ],
          "pauseAfterMs": 6000,
          "audioSegment": "human-loop-predict"
        }
      ]
    },
    {
      "id": "reliability",
      "title": "Reason about compounded failure",
      "question": "When does local checking improve the final result?",
      "outcome": "State probability assumptions and identify shared failure modes.",
      "beats": [
        {
          "id": "human-loop-compounding",
          "role": "derive",
          "title": "Local reliability and end-to-end success differ",
          "speech": "For this calculation, assume twenty independent steps. Each step succeeds 95 percent of the time, and any failure defeats the task. Multiply the probabilities: multiply 0.95 by itself twenty times. The probability of complete success is roughly 36 percent. These are teaching assumptions, not a measured failure forecast. Now add one correction opportunity. Suppose the checker detects 90 percent of failures, and a correction succeeds 95 percent of the time. Add the initial success probability to the probability of an initial failure followed by detection and successful correction. Under these simplified assumptions, the complete sequence succeeds roughly 86 percent of the time. The improvement comes from useful detection and correction. It does not follow merely from repeating a prompt. Before using this calculation for a design decision, investigate shared errors, false alarms, and repairs that introduce new defects.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Detection can create a useful correction opportunity"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which assumptions make this calculation valid?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "assume twenty independent steps"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Initial success",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Each step succeeds"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Detect failure",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the checker detects"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Correct failure",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a correction succeeds"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Illustration: about 36% → 86% end to end",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "roughly 86 percent"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "human-loop-compounding-spoken-v2"
        },
        {
          "id": "human-loop-dependence",
          "role": "check",
          "title": "A shared blind spot can survive every retry",
          "speech": "A shared blind spot breaks the simple reliability story. Suppose every generated adapter changes the operation key, but the checker only verifies that a key exists. More attempts can keep producing the same accepted defect. The checker and maker may also share a mistaken interpretation of the specification. Their agreement does not create independent evidence. Ask what changes after a failure: a source, a requirement, a diagnostic, or the candidate artifact. A retry justified only by hope has no demonstrated correction mechanism. False alarms and repairs that introduce new defects also change the probability model. Evaluate the complete artifact after repair, including previously satisfied requirements that could have regressed. Do not combine yesterday's passing identity test with today's passing delay test if no single current revision passes both. Completion belongs to one artifact with current evidence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Shared error can survive repeated agreement"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Shared blind spot",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A shared blind spot"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Useful new evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Ask what changes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What changes after this failure?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A retry justified only by hope"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Current artifact",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Evaluate the complete artifact"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "One current revision must satisfy the requirements",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "no single current revision passes both"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "human-loop-dependence"
        }
      ]
    },
    {
      "id": "contract",
      "title": "Build a bounded feedback loop",
      "question": "What makes an iteration useful and legitimate?",
      "outcome": "Define the five contract fields and trace a controlled repair.",
      "beats": [
        {
          "id": "human-loop-five-fields",
          "role": "explain",
          "title": "Five fields make the loop's commitments visible",
          "speech": "The goal states the required outcome. The oracle states how available evidence will discriminate acceptance. The budget limits resources such as attempts, elapsed time, provider calls, and spending. The stop condition covers success as well as cancellation, unresolved uncertainty, stagnation, and exhausted limits. The escalation path identifies what happens when the loop cannot finish within its authority. These five fields form the loop contract. For the adapter, the goal includes stable payment identity and specified circuit breaker behavior. Tests supply some of the oracle evidence. A bounded repair budget prevents endless attempts. Missing product policy requires a decision by the responsible owner. An invented requirement cannot supply that decision. The contract should be proportionate to the task. A small repair can use a short acceptance table; a consequential migration may need multiple owners and release gates.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Make the five commitments explicit"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Goal + oracle",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The goal states"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Total budget",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The budget limits"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Stop + escalate",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The stop condition"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who resolves missing product policy?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Missing product policy requires"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Scale the contract to the task",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The contract should be proportionate"
            }
          ],
          "pauseAfterMs": 3000,
          "audioSegment": "human-loop-five-fields-spoken-v2"
        },
        {
          "id": "human-loop-repair",
          "role": "worked-example",
          "title": "Trace one repair from requirement to receipt",
          "speech": "Begin with a fixed requirement and a specific candidate version. Run a test that inspects the logical operation key across multiple retry attempts. Suppose the test shows a different key on the second attempt. Return that observation to the maker with the relevant code path. The maker revises the adapter so the key is created for the logical operation and reused by its attempts. Run the required checks against the updated version, including delay behavior and breaker recovery. Preserve the test report with the artifact identity and environment. If the checks pass, the loop has evidence for the tested properties. It can deliver a reviewable patch within its authorized scope. It does not acquire merge or deployment rights from a green test result. If the same failure repeats unchanged, investigate the missing prerequisite or stop with an honest unresolved result.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Requirement → diagnostic → repair → current evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Requirement",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Begin with a fixed requirement"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Diagnostic",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Suppose the test shows"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Suppose the test shows"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Repair",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "The maker revises"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "The maker revises"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Current evidence",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Run the required checks"
            },
            {
              "action": "edge",
              "from": "n3",
              "to": "n4",
              "spokenCue": "Run the required checks"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A passing check does not grant release rights",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "It does not acquire merge"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did the failed prerequisite change?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "If the same failure repeats"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "human-loop-repair-spoken-v2"
        }
      ]
    },
    {
      "id": "oracle",
      "title": "Keep the oracle honest",
      "question": "What did a passing result actually establish?",
      "outcome": "Separate artifact shape, behavior, and release authority.",
      "beats": [
        {
          "id": "human-loop-three-boundaries",
          "role": "predict",
          "title": "Three questions need three kinds of evidence",
          "speech": "Artifact validity asks whether the output has the required structure. Behavioral acceptance asks whether it meets the specified behavior under the tested conditions. Release authority asks whether this actor may apply the change to this destination now. Which of these can a parser establish? Only part of the first. Which can a behavioral test establish? Only the properties and conditions it actually exercises. Neither supplies release authority. Keep the three questions visible even when one interface displays a single green status. In a research workflow, valid citations are a structural property; support for the conclusion is a semantic property; permission to disclose a source is a separate boundary. In a document workflow, a rubric may catch missing sections while an editor still judges argument quality. A precise acceptance statement names the property and its limits.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Shape, behavior, and authority are separate"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Artifact validity",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Artifact validity"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Behavioral acceptance",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Behavioral acceptance"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Release authority",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Release authority"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which question can a parser answer?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Which of these can a parser"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A green status must name what passed",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A precise acceptance statement"
            }
          ],
          "pauseAfterMs": 6000,
          "audioSegment": "human-loop-three-boundaries"
        },
        {
          "id": "human-loop-unknown-effect",
          "role": "worked-example",
          "title": "The lost response exposes the oracle's boundary",
          "speech": "A remote payment can succeed before its response reaches the worker. If the worker crashes in that gap, a local checkpoint may contain no success receipt. That absence does not prove the payment failed. Use the destination's documented duplicate protection and status inspection to reconcile the logical operation. The chapter points forward to durable execution because a local test suite cannot make a remote service join its transaction. Test this boundary with a simulated destination: apply the operation, drop the response, restart the worker, and observe the recovery decision. The acceptable result is controlled reconciliation under the destination's contract. A blind replay can apply the payment twice. If the result cannot be established safely, preserve the unknown state and escalate through the defined path. Honest uncertainty is a useful result when another attempt would create an unbounded consequence.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Successful effect → lost response → reconcile"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Remote success",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A remote payment can succeed"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Missing receipt",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a local checkpoint"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "a local checkpoint"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "No receipt does not prove failure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "That absence does not prove"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Use the destination"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Use the destination"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would replay create a second payment?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "A blind replay can apply"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "human-loop-unknown-effect"
        }
      ]
    },
    {
      "id": "economics",
      "title": "Measure the complete alternative",
      "question": "When is a reusable checking loop worth its cost?",
      "outcome": "Compare full costs and evidence without inheriting vendor claims.",
      "beats": [
        {
          "id": "human-loop-full-cost",
          "role": "derive",
          "title": "Reuse changes the economics, but maintenance remains",
          "speech": "A reusable oracle has an upfront cost. Repeated runs may recover that cost by reducing checking effort or avoiding defects. Compare complete alternatives over a realistic period: design, execution, verification, maintenance, audits, incident response, and remaining human decisions. A one-time task may be cheaper to review directly. A high-stakes check can cost more than generation and still be justified by the loss it prevents. The useful question is total cost at an acceptable outcome quality, not a universal rule that verification must always be cheaper than generation. Estimate the number of expected runs, then test the estimate against observed usage. Requirements can change, source access can fail, and model updates can alter error patterns. These changes consume maintenance effort. Automation moves some work upstream; it does not make that work disappear permanently.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Compare the complete cost of acceptable outcomes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Upfront design",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A reusable oracle"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Repeated runs",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Repeated runs may"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Include the loss that verification prevents",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "still be justified by the loss"
            },
            {
              "action": "note",
              "id": "question",
              "text": "How many real runs repay the investment?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Estimate the number of expected runs"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Maintenance",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Requirements can change"
            }
          ],
          "pauseAfterMs": 3000,
          "audioSegment": "human-loop-full-cost"
        },
        {
          "id": "human-loop-evidence",
          "role": "synthesize",
          "title": "A useful anecdote is a hypothesis to test",
          "speech": "The revised chapter removes unsupported inferences from named company anecdotes. A claimed improvement cannot establish its cause unless the comparison supports that inference. Hold the task distribution, model configuration, sampling policy, and resource budget appropriately controlled when evaluating a harness change. Record the source and artifact revisions. Measure the specific failure the change should reduce, alongside total outcome quality and operational cost. If memory is meant to prevent repeated parsing mistakes, count those mistakes. If a rubric is meant to catch omissions, check both missed omissions and acceptable drafts it wrongly rejects. More findings from parallel analysis are useful only if they add reproducible information. Preserve uncertainty and inspect regressions that an average score may hide. A pilot with a handful of tasks can expose an obvious workflow defect; it cannot establish a precise production failure rate.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Turn a claim into a controlled comparison"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the comparison support the claimed cause?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "unless the comparison supports"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Baseline",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Hold the task distribution"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Target failure",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Measure the specific failure"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Regressions",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "inspect regressions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A small pilot is a smoke test",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A pilot with a handful"
            }
          ],
          "pauseAfterMs": 3000,
          "audioSegment": "human-loop-evidence"
        }
      ]
    },
    {
      "id": "transfer",
      "title": "Build one check you can challenge",
      "question": "What would make you trust this loop for one real task?",
      "outcome": "Design negative controls, preserve uncertainty, and explain the boundary.",
      "beats": [
        {
          "id": "human-loop-first-oracle",
          "role": "transfer",
          "title": "Build one check that can reject a convincing wrong answer",
          "speech": "Choose one recurring task from your own work. Write three observable acceptance criteria and identify the owner of each requirement. Implement the cheapest useful check for one criterion. Challenge it with a known-good artifact, a malformed artifact, and an artifact that looks plausible but violates the behavior. Also remove a required dependency and confirm that the check reports inconclusive. Connect that result to a bounded repair loop. Preserve the current artifact when repair stops and identify exactly which criterion remains unresolved. Record enough evidence to compare the workflow with its baseline, including time spent maintaining the check. Then ask a colleague to name a failure the oracle does not detect. That blind spot is part of the design, not an embarrassment to hide. Your first deliverable is a small, reviewable loop with explicit limits and a check whose behavior you can explain.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Challenge the checker before relying on it"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Known good",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a known-good artifact"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Plausible wrong",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "an artifact that looks plausible"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Missing dependency",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "remove a required dependency"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Preserve the artifact and unresolved criterion",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Preserve the current artifact"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What important failure does the oracle miss?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "name a failure the oracle does not detect"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "human-loop-first-oracle"
        },
        {
          "id": "human-loop-recap",
          "role": "reflect",
          "title": "Remember what moved into the loop",
          "speech": "Specify the outcome before encoding the check. Connect generation to evidence from the current artifact. Bound repair with a total budget and honest stopping behavior. Keep behavioral acceptance separate from authority to release. Measure complete outcomes and costs, including the blind spots of the oracle. Those are five durable principles. Remember: specify, observe, bound, authorize, measure. The human contribution shifts toward designing requirements, interpreting limits, and handling decisions the checks cannot settle. It does not disappear when the dashboard turns green. Discuss next: which repeated review step in your workflow could become a reliable check? Which important judgment would still need a person or a different source of evidence? Apply the method to one real task. Write the five-field contract, demonstrate one useful repair, and show one case that must remain inconclusive. The next chapter asks how much autonomy that task actually needs.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Design the loop and keep its limits visible"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Specify",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Specify the outcome"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Observe + bound",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Connect generation"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Authorize",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep behavioral acceptance"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Measure",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "Measure complete outcomes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: specify → observe → bound → authorize → measure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: repeatable check? Remaining judgment?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "human-loop-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "bfccb18498daaea04c0642da82182238d1728d122192a1a8a28f05a538d12673"
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
