(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-38",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Self-Designing Loops",
  "subtitle": "Professor Mode · Scoped proposals, independent evaluation, bounded creation, and activation authority",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-38/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-38/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 38, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "7b2d51f1dfb1fed5f1c10caee8c1287eb87b614e580e770afd9136af14068638",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Distinguish self-design from demonstrated improvement",
      "question": "Does a higher score mean the work improved?",
      "outcome": "Separate proposal, evaluation, activation, and future outcome claims.",
      "beats": [
        {
          "id": "evolution-stakes",
          "role": "orient",
          "title": "Improving the score can make the report less useful",
          "speech": "A report full of decorative numbers is our first case. In the chapter's fictional scenario, an adaptive rubric gives more weight to quantitative detail because it correlates with reviewer approval. Scores rise while irrelevant figures and unsupported precision make the reports less useful. A merged memory rule is our second case. Two similar formatting corrections from different clients are combined, losing the condition that made each correct. A proposed specialist is our third case. Repeated failures suggest a capability gap, but adding a new worker could multiply spending and permissions without fixing the missing prerequisite. These are illustrative design risks, not evidence of universal self-improvement or a particular vendor's production maturity. Their common mechanism is that a system can change a proxy, representation, or architecture without improving the intended outcome. Our governing question is: which proposed change deserves activation, and who has authority to activate it? We will preserve correction scope, audit memory merges, evaluate rubrics independently, bound specialist creation, and separate proposal from deployment. By the end, you should be able to produce a reviewable improvement packet or a justified no-change result without allowing the system to approve itself.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A plausible self-change is not evidence of improved outcomes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Decorative numbers",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A report full of decorative numbers"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Lost memory scope",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A merged memory rule"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Unjustified worker",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A proposed specialist"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Proposal, evaluation, activation, and improvement are different claims",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "without improving the intended outcome"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which proposed change deserves activation, and who can authorize it?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "evolution-stakes"
        },
        {
          "id": "evolution-four-claims",
          "role": "derive",
          "title": "Show evidence for each stage separately",
          "speech": "A model can generate a candidate skill file. A workflow can evaluate that file on selected cases. An authorized service can activate a reviewed revision. The activated revision may then improve future outcomes. Demonstrating the first three does not establish the fourth. Measure the relevant outcome against an adequate baseline and retain uncertainty about untested tasks. Keep production execution, proposal generation, and activation authority separate in both application policy and credentials. The production worker can report failures and corrections, while the proposer prepares candidates. Neither role should silently acquire permission to change the objective, weaken acceptance criteria, or enlarge the spending envelope.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Propose → evaluate → authorize activation → measure outcomes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Propose",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "generate a candidate skill file"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Evaluate",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "evaluate that file"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "evaluate that file"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Activate",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "activate a reviewed revision"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "activate a reviewed revision"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Measure",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "improve future outcomes"
            },
            {
              "action": "edge",
              "from": "n3",
              "to": "n4",
              "spokenCue": "improve future outcomes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Successful activation does not prove useful improvement",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not establish the fourth"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which measured future outcome supports this change?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Measure the relevant outcome"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "evolution-four-claims"
        }
      ]
    },
    {
      "id": "skills",
      "title": "Turn corrections into scoped proposals",
      "question": "Does repeated wording establish a general rule?",
      "outcome": "Preserve source, authority, applicability, and independent tests.",
      "beats": [
        {
          "id": "evolution-correction-scope",
          "role": "derive",
          "title": "A cluster suggests a hypothesis, not a universal requirement",
          "speech": "Repeated human corrections can reveal a missing instruction, but similarity alone does not establish common authority or scope. Preserve the original before-and-after examples, task conditions, reviewer identity, and supporting sources. One accountable client can define a local preference; several reviewers can share the same mistaken assumption. Draft a narrow proposed rule and test cases where it should apply and where it should not. Distinguish observed correlation from a causal claim that the rule prevented a defect. A successful run may contain several incidental choices. Independent held-out cases help test whether the proposed guidance improves later work beyond the examples that inspired it.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Correction evidence → scoped hypothesis → independent applicability test"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Corrections",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Repeated human corrections"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Reviewer count does not replace authority, scope, or correctness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "several reviewers can share"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Hypothesis",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Draft a narrow proposed rule"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Draft a narrow proposed rule"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which counterexample would expose overgeneralization?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "where it should not"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Test",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Independent held-out cases"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Independent held-out cases"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "evolution-correction-scope"
        },
        {
          "id": "evolution-skill-proposal",
          "role": "worked-example",
          "title": "A date-format rule can be wrong outside its client scope",
          "speech": "Suppose several corrections require a particular date format for one client. The proposed skill should name that client and the applicable output type, rather than rewriting every future document's formatting policy. Include another client's conflicting format in evaluation. The candidate succeeds only if it follows each applicable requirement without inventing a consensus. Preserve current user corrections and the source of authority. Formatting is often easier to check than judgment, but it can still affect signed reports or required disclosures. Send behavior-changing proposals through the appropriate independent review and activation process. A readable rule is not evidence that it is safe to apply everywhere.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Proposed rule: condition + behavior + evidence + exceptions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Applicability",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "name that client"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Counterexample",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "conflicting format"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the candidate preserve both clients’ requirements?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "follows each applicable requirement"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "An easy-to-read rule can still erase a required exception",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "without inventing a consensus"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Authority",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "source of authority"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "evolution-skill-proposal"
        }
      ]
    },
    {
      "id": "memory",
      "title": "Curate without erasing evidence or scope",
      "question": "Can a plausible merge destroy an important exception?",
      "outcome": "Compare consolidation with relevant baselines and preserve recoverable revisions.",
      "beats": [
        {
          "id": "evolution-memory-curation",
          "role": "derive",
          "title": "Consolidation should preserve evidence needed to undo a bad merge",
          "speech": "A separate consolidation job can inspect a bounded snapshot, propose duplicate merges, identify contradictions, and suggest updates to stale entries. Scheduling it between sessions can reduce contention but does not establish safety. Preserve source links, scope, timestamps, prior revisions, and the reason for each proposed change. Recent evidence may describe a changed world or merely a different task. The newer timestamp alone cannot determine whether an earlier statement is wrong. Compare consolidation against ordinary memory retrieval without consolidation. That baseline matters because persistent memory already transfers information between runs. Respect retention and deletion obligations even when correction history is protected. Keep unresolved conflicts visible for the authority responsible for that knowledge.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Bounded snapshot → evidence-preserving proposal → reviewed memory revision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Snapshot",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "inspect a bounded snapshot"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Proposal",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "propose duplicate merges"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "propose duplicate merges"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Evidence history",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve source links"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Preserve source links"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the original scope and evidence be recovered after this merge?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "prior revisions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Recency and between-session scheduling do not establish correctness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "newer timestamp alone cannot determine"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "evolution-memory-curation-spoken-v2"
        },
        {
          "id": "evolution-memory-drift",
          "role": "worked-example",
          "title": "A plausible local merge can damage a later task",
          "speech": "A memory says one API requires a particular authentication format. A newer failure report concerns another API and recommends a different format. Merging them into a universal replacement can destroy valid knowledge about the first service. Test the candidate against both source contexts and relevant regression cases. Preserve a no-change result when the evidence cannot resolve the conflict. Measure downstream task outcomes after an approved revision, including rare consequential cases that routine averages may hide. If a bad merge was activated, restore the appropriate revision and inspect outputs produced under it. Restoring memory stops one source of future error but does not repair already-distributed artifacts.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Different contexts can make conflicting memories simultaneously valid"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Original API",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "one API requires"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Different API",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "another API"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is this new evidence a correction, or a different applicability condition?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "universal replacement"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Context-aware test",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "both source contexts"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A restored memory revision does not repair earlier distributed output",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not repair already-distributed artifacts"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "evolution-memory-drift"
        }
      ]
    },
    {
      "id": "rubric",
      "title": "Protect the objective from easier proxies",
      "question": "Can weight bounds restore a weak quality criterion?",
      "outcome": "Evaluate outside the candidate score and investigate uncertain drift signals.",
      "beats": [
        {
          "id": "evolution-rubric-proxy",
          "role": "derive",
          "title": "A weight cap cannot make an invalid criterion valid",
          "speech": "In the report scenario, numerical density predicts approval partly because it makes drafts look rigorous. Increasing that weight encourages more numbers even when they do not support the decision. A cap limits concentration on one criterion but does not restore the meaning of quality. Keep mandatory factual and safety requirements separate from compensating weighted preferences. Evaluate the candidate rubric against protected cases, including persuasive irrelevant detail and sparse but well-supported analysis. The candidate's own weighted total cannot be the sole judge of its improvement. Inspect actual evidence use, consequential errors, and appropriately qualified human judgments. A reviewer's approval is an observation that may itself contain bias or scope limits.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Proxy optimization: more numbers can raise scores without improving analysis"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Proxy",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "numerical density predicts approval"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Optimization",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "encourages more numbers"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Weight bounds limit concentration, not invalid measurement",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not restore the meaning of quality"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "External evaluation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "protected cases"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can unsupported precision win against sparse correct analysis?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "persuasive irrelevant detail"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "evolution-rubric-proxy"
        },
        {
          "id": "evolution-drift-signal",
          "role": "predict",
          "title": "No alarm is not evidence that the candidate is safe",
          "speech": "A detector compares rubric scores with reviewer outcomes and reports no divergence. Predict whether that approves a release. It does not. Labels may be delayed, samples insufficient, or both signals may share the same bias. Conversely, a flat approval rate can coexist with a useful improvement, so divergence is a reason to investigate rather than proof of gaming. Record the cohorts, label availability, criterion revisions, and detector sensitivity. Preserve unknown when the required evidence is absent. Freeze or constrain affected changes under the applicable policy while investigating consequential concerns. Release acceptance still needs independent outcome evidence and an authorized decision for the exact candidate.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A drift signal is diagnostic evidence, not a release decision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Observed score",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "rubric scores"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Outcome labels",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "reviewer outcomes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "No detected divergence cannot automatically authorize activation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "It does not"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Evidence adequacy",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "samples insufficient"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would this detector notice the failure class that matters?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "detector sensitivity"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "evolution-drift-signal"
        }
      ]
    },
    {
      "id": "specialists",
      "title": "Bound the creation of new capabilities",
      "question": "Does dispatch authority include permission to create a new worker?",
      "outcome": "Require a justified gap, scoped grants, and aggregate admission limits.",
      "beats": [
        {
          "id": "evolution-specialist-creation",
          "role": "derive",
          "title": "Selecting an approved worker differs from creating a new capability",
          "speech": "Dynamic dispatch selects among existing approved workers. Creating a specialist proposes a new role, tool inventory, context policy, evaluator, and budget. Explain the observed gap and compare simpler repairs to routing, evidence retrieval, or deterministic tools. Some overlap may support independent review, so evaluate responsibility and integration rather than rejecting overlap automatically. Candidate-authored tests are useful development material, not independent release evidence. Include owner-selected held-out tasks, wrong-domain cases, common tool outages, and unauthorized action proposals. A critical permission escape can block activation even when average completion improves. Review the proposed grants and deployment scope before any new worker gains authority.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Dispatch uses approved capability; creation proposes new capability"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Dispatch",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Dynamic dispatch"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Creation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Creating a specialist"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would better routing or evidence solve the gap more simply?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "compare simpler repairs"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Passing self-selected tests does not establish release readiness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not independent release evidence"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Independent gate",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "owner-selected held-out tasks"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "evolution-specialist-creation"
        },
        {
          "id": "evolution-fanout-budget",
          "role": "worked-example",
          "title": "Per-worker ceilings do not bound a recursively growing fleet",
          "speech": "Imagine each worker can create three children, with three child generations below the root. The first generation has three workers, the next nine, and the next twenty-seven. Including the root, the system contains forty workers. Even a one-dollar allowance per worker can permit forty dollars of model spending under those assumptions, before other costs. The board shows the count. A local ceiling is not a shared budget. Enforce aggregate reservations, maximum depth, fan-out, admission, and capability restrictions before launching children. Reserve evaluation and coordination spending too. The model cannot justify a larger allowance by pointing to a newly discovered problem or another child's unfinished task.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Root → generation 1 → generation 2 → generation 3"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "1 root",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "below the root"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "3 children",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "three workers"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "three workers"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "9 children",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "the next nine"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "the next nine"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "27 children",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "the next twenty-seven"
            },
            {
              "action": "edge",
              "from": "n3",
              "to": "n4",
              "spokenCue": "the next twenty-seven"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "1 + 3 + 9 + 27 = 40 workers; $1 each permits up to $40",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The board shows"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which trusted component reserves the total before children start?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Enforce aggregate reservations"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "evolution-fanout-budget"
        }
      ]
    },
    {
      "id": "activation",
      "title": "Separate proposing from deploying",
      "question": "What exactly does an approval authorize?",
      "outcome": "Bind activation to current evidence and stop with an honest terminal outcome.",
      "beats": [
        {
          "id": "evolution-activation-contract",
          "role": "transfer",
          "title": "Bind the change packet to the candidate and current baseline",
          "speech": "Prepare a packet containing the observed limitation, supporting evidence, before-and-after hashes, evaluator version, test inputs, allowed scope, and approval expiry. The deployment controller checks the candidate and current baseline against the authorized decision before activation. A candidate changed after approval must not inherit that old decision. Restoring its old bytes also does not revive expired or revoked authority. Keep proposal-ready, no justified change, blocked on evidence, rejected, and budget-exhausted outcomes explicit. Proposal work ends when its required packet is complete. Deployment work ends only after authorized activation and its specified checks. Neither process should continue inventing optional changes after fulfilling its own contract.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Evidence packet → current authorized candidate → verified activation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Packet",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Prepare a packet"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Authority",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "checks the candidate and current baseline"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "checks the candidate and current baseline"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Activation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "before activation"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "before activation"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Candidate identity, scope, and current approval all matter",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "changed after approval"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What if activation succeeds but its response is lost?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "authorized activation and its specified checks"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "evolution-activation-contract"
        },
        {
          "id": "evolution-recap",
          "role": "reflect",
          "title": "Use production evidence to improve the change process",
          "speech": "Treat recurring corrections as scoped hypotheses. Preserve source history through memory curation and test conflicting contexts. Evaluate rubric changes against outcomes beyond their own scores. Separate approved-worker dispatch from creating new capabilities and bound aggregate spending. Keep production, proposal, and activation authority distinct. Bind deployment to current evidence and accept a justified no-change result. Remember: observe, propose, qualify, authorize, activate, measure. Apply that sequence to one automated improvement you would like to introduce. Discuss next: which candidate can currently judge itself? Which memory merge would erase a meaningful exception? The final three chapters address durable execution, release evidence, and the identity that authorizes these changes.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Controlled improvement preserves evidence and independent activation authority"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Scoped hypotheses",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "scoped hypotheses"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Independent outcomes",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "outcomes beyond their own scores"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Separate authority",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "activation authority distinct"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: observe → propose → qualify → authorize → activate → measure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: self-judging candidate? Lost memory exception?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "evolution-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "063e630c96a47164f8d1e599e18447be78defbd444f3023a76e71c8d4144644f"
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
