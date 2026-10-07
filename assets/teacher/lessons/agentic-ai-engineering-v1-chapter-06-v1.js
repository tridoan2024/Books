(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-06",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "LLMs as Unreliable Reasoning Engines",
  "subtitle": "Professor Mode · probability assumptions, meaningful checkpoints, and measured correction",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-06/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-06/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 6, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "6c0bef6b72d0ce0474bfa74bc74f8c691c0c692d32464230f58376efc218f791",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "A sequence needs more than good individual calls",
      "question": "Where should a long task earn the right to continue?",
      "outcome": "Identify dependency boundaries that can localize errors.",
      "beats": [
        {
          "id": "reliability-stakes",
          "role": "orient",
          "title": "Good isolated steps can still produce a failed refactor",
          "speech": "A payment refactor is our first case. In the chapter's fictional story, Priya's coding loop succeeds on small tickets but repeatedly fails while extracting a validator and updating many consumers. An interface decision made early becomes an assumption for later edits. A late test run reports damage spread across files, which makes diagnosis difficult. A record transformation is our second case. Each batch may look plausible while duplicate keys or lost records invalidate the whole migration. A research synthesis is our third case. An unsupported claim can become the premise for later sections. These examples share a dependency problem: later work inherits the quality of intermediate results. Their timings and success rates are illustrative, not measured model benchmarks. Our governing question is: where should a long task earn the right to continue? We will examine a simple probability model, its limits, the effect of checking and correction, and the evidence a useful checkpoint must preserve. The aim is to locate errors while their causes are still understandable. By the end, you should be able to challenge a reliability claim, select an intermediate check, and design a comparison that includes failed and inconclusive runs.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Later work inherits earlier assumptions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Payment refactor",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A payment refactor"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Record migration",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A record transformation"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Research synthesis",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A research synthesis"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Where should a task earn the right to continue?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Localize errors before more work depends on them",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "locate errors while their causes"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "reliability-stakes"
        },
        {
          "id": "reliability-late-feedback",
          "role": "explain",
          "title": "A final check can detect damage without locating its cause",
          "speech": "Imagine an interface that promises a decimal result but sometimes returns no value. Several consumers are migrated on the assumption that the result is always present. The final suite discovers failures in multiple places. Increasing the retry count does not tell the next attempt which assumption was wrong. A boundary check could have examined the interface and representative consumers before the migration expanded. That check would not guarantee every future edit, but it could expose this specific incompatibility earlier. The lesson is not that every operation needs a full test suite. A file read, an interface decision, and an external deployment have different uncertainty and consequence. Choose boundaries by what subsequent work will rely on, then choose checks that challenge those dependencies.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Interface assumption → dependent edits → late failures"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Interface promise",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "an interface that promises"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Consumer edits",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Several consumers are migrated"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Several consumers are migrated"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Scattered failures",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The final suite discovers"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "The final suite discovers"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "More retries do not identify a wrong assumption",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Increasing the retry count"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What must be true before consumers build on this?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "what subsequent work will rely on"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "reliability-late-feedback"
        }
      ]
    },
    {
      "id": "probability",
      "title": "State the experiment before applying the equation",
      "question": "When does multiplying probabilities describe this workflow?",
      "outcome": "Separate independent assumptions from conditional success.",
      "beats": [
        {
          "id": "reliability-independent-model",
          "role": "derive",
          "title": "Multiplication answers a precisely defined question",
          "speech": "For a hypothetical sixteen-step task, assume equal success probabilities and independence. Also assume that the task succeeds only when every step succeeds. Multiply the per-step success probability once for each required step. The board shows the calculation for an illustrative input. This describes a hypothetical experiment, not the observed performance of a real system. Different steps often have different probabilities, and later steps may depend on earlier outcomes. Define the meaning of a step before collecting data. Under the independent model, a longer sequence of required successes has a lower all-success probability. Use that result to ask where unverified dependencies accumulate. Do not use it to announce a universal maximum number of agent actions.",
          "boardActions": [
            {
              "action": "clear",
              "title": "An equation needs an event and assumptions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Equal probabilities",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "equal success probabilities"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Independence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "and independence"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "All must succeed",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "every step succeeds"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Illustrative: 0.94¹⁶ ≈ 0.372",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The board shows the calculation"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What exactly counts as a step and a success?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the meaning of a step"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "reliability-independent-model-spoken-v2"
        },
        {
          "id": "reliability-conditional-model",
          "role": "predict",
          "title": "Dependence does not establish a universal bound",
          "speech": "Now give every step the same random outcome. If that shared outcome succeeds with probability 0.95, all the steps succeed together with probability 0.95. The independent expression would give a different answer. Perfect correlation therefore does not automatically make all-success probability smaller. The general product uses conditional probabilities: the first success, then the next success given the previous successes, and so on. A corrupted interface can still create serious propagation because later consumers build on that error. A shared blind spot can repeatedly escape similar checks. Both are reasons to study actual dependencies; neither proves that the independent formula is always an upper or lower bound. Ask what information each step receives and what conditions change its chance of success. Measure those conditions where the available sample supports it.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Shared success and propagated error are different cases"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Shared outcome",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the same random outcome"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Dependence alone gives no universal direction",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not automatically make"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Conditional product",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "uses conditional probabilities"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Propagation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A corrupted interface"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which conditions change the next step’s success?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "what conditions change"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "reliability-conditional-model"
        }
      ]
    },
    {
      "id": "correction",
      "title": "Measure what verification actually changes",
      "question": "Does a passing check establish a correct state?",
      "outcome": "Distinguish detection, repair, approval, and true outcomes.",
      "beats": [
        {
          "id": "reliability-repair-model",
          "role": "derive",
          "title": "Count genuine correction, not checker approval",
          "speech": "A limited correction model starts with initial correctness, called p. Let d be the chance of detecting an incorrect result. Let c be the chance that one repair produces a genuinely correct result, conditional on detection. Keep initially correct results unchanged and assume no additional unmodeled harm. Final correctness is p plus the initially wrong fraction, multiplied by detection and genuine correction. With illustrative values 0.94, 0.85, and 0.90, the result is 0.9859. This is correctness under those assumptions, not the fraction the checker approves. A checker can miss a defect. A repair can satisfy one test while breaking another property. Those cases require additional states or direct measurement. The useful idea is that a detected error creates an opportunity for repair, not a guarantee that the foundation is now clean.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Initial error → detection → genuine repair"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "p + (1 − p) × d × c; explicit assumptions",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Final correctness is"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Initially wrong",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the initially wrong fraction"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Detection",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "multiplied by detection"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "multiplied by detection"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Correct repair",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "and genuine correction"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "and genuine correction"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did the artifact improve, or only its test score?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "not the fraction the checker approves"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "reliability-repair-model"
        },
        {
          "id": "reliability-segment-model",
          "role": "worked-example",
          "title": "A segment is a different event from one step",
          "speech": "Suppose a checkpoint covers four steps. Its initial success means the entire segment is correct, so call that probability q. Its detection rate concerns an incorrect segment, and its repair rate concerns making the whole segment correct. These are different measurements from single-step rates. Under an additional independent-step assumption, q could equal 0.94 to the fourth power. You would then apply the correction expression to q using segment-specific detection and repair estimates. You cannot take a per-step improvement and claim the same benefit from checking only once every four steps. False alarms, repair regressions, and shared dependencies complicate either model. Keep the event and denominator beside every number. Similar numerical results from two toy calculations do not make their assumptions interchangeable.",
          "boardActions": [
            {
              "action": "clear",
              "title": "One step and a four-step segment have different rates"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Segment correctness",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the entire segment is correct"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Segment detection",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "an incorrect segment"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Segment repair",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "making the whole segment correct"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Were these rates measured for a step or a segment?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "different measurements from single-step rates"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Keep the event and denominator beside each rate",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Keep the event and denominator"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "reliability-segment-model"
        }
      ]
    },
    {
      "id": "boundaries",
      "title": "Build on revision-bound evidence",
      "question": "Which intermediate result deserves a checkpoint?",
      "outcome": "Connect checks to artifacts and invalidate stale evidence.",
      "beats": [
        {
          "id": "reliability-checkpoint-evidence",
          "role": "worked-example",
          "title": "A checkpoint is an artifact plus applicable evidence",
          "speech": "After designing the payment interface, check representative consumers, return types, and error behavior. Save the exact artifact revision, the requirements examined, and the raw check results. A green flag without a revision cannot justify later work. After transforming a batch of records, check schema, unique keys, reconciliation totals, and rejected-record accounting. After writing a source-based section, inspect the mapping from claims to sources. These are meaningful boundaries because the next stage relies on their results. If a later edit changes the interface or input assumptions, invalidate the affected evidence and check again. A checkpoint preserves a known state and what was established about it. It does not prove untested properties or reverse an external action whose response was lost.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Artifact revision → requirements → check evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Exact artifact",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "the exact artifact revision"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Requirements",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the requirements examined"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "the requirements examined"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Raw results",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "the raw check results"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "the raw check results"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What will the next stage rely on?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the next stage relies"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Changed assumptions can invalidate earlier evidence",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "invalidate the affected evidence"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "reliability-checkpoint-evidence"
        },
        {
          "id": "reliability-placement",
          "role": "predict",
          "title": "Choose checks by localization, cost, and consequence",
          "speech": "Should we run the complete integration suite after every character edit? Usually that spends heavily without adding useful localization. Should we wait until the whole migration ends? That can leave many possible causes behind one late failure. Start at natural dependency boundaries and compare diagnosis and recovery costs. Use a fast type or contract check where it addresses the immediate risk, while retaining the broader acceptance checks required for the final outcome. A cheap preliminary check cannot certify properties it never examines. Nor does a local checkpoint make an external operation reversible. If a deployment or payment may already have happened, recovery needs evidence about that effect. Verification placement is a design choice to evaluate against actual failure classes, not a rule to check every fixed number of steps.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A useful boundary balances three costs"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Check cost",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "spends heavily"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Diagnosis cost",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "many possible causes"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Recovery cost",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "compare diagnosis and recovery costs"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A cheap check cannot certify unexamined properties",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A cheap preliminary check"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which boundary makes this failure easier to locate?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "actual failure classes"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "reliability-placement"
        }
      ]
    },
    {
      "id": "investment",
      "title": "Find the limiting mechanism",
      "question": "Would better generation, context, or checking help most?",
      "outcome": "Compare interventions on the same workload and full denominator.",
      "beats": [
        {
          "id": "reliability-investment",
          "role": "explain",
          "title": "Spend on the observed bottleneck",
          "speech": "Missing context calls for better retrieval. Incorrect arithmetic calls for deterministic computation and validation. A model that cannot solve supported cases despite adequate tools and feedback may justify a stronger model or narrower scope. A missed authorization boundary requires enforcement at the component that can act. These are different limiting mechanisms. Compare a generator change, a checker change, and their combination on the same representative tasks and budgets. Record their versions and separately assess true outcome quality. A higher pass rate obtained by weakening the checker is not an improvement in task correctness. A rare severe failure may justify an expensive check even when its effect on average accuracy is small. Let the observed error and its consequence determine the investment, rather than declaring models or verifiers universally more valuable.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Different bottlenecks require different interventions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Context gap",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "Missing context"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Computation error",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "Incorrect arithmetic"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reasoning limit",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "A model that cannot solve"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Authority gap",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "A missed authorization boundary"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which mechanism actually limited this run?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "different limiting mechanisms"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Compare interventions on matched tasks and budgets",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "the same representative tasks and budgets"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "reliability-investment"
        },
        {
          "id": "reliability-denominator",
          "role": "derive",
          "title": "Keep every run in the report",
          "speech": "Define whether your denominator is tasks, attempts, tool calls, or checked segments. Do not count only completed attempts. Timeouts, escalations, and unavailable evidence are outcomes that affect the complete system. Record wrong artifacts separately from tool outages and authority refusals. For each run retain the task revision, configuration, produced artifact, raw checks, final adjudication, and cumulative cost. Add a failure category when a passing artifact is later found wrong. Simply repeating the same checker will not necessarily expose its systematic blind spot. A frozen representative set supports comparisons, while deliberately inserted defects can probe specific detection failures. Keep those two sources of evidence distinguishable. A small pilot can reveal an observed problem and estimate local behavior; it cannot establish a universal accuracy claim.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A complete denominator includes unsuccessful endings"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which outcomes disappear from today’s dashboard?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Do not count only completed attempts"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Timeouts",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Timeouts"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Escalations",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "escalations"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Unavailable evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "unavailable evidence"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Passing checks and true outcomes need separate records",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a passing artifact is later found wrong"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "reliability-denominator-spoken-v2"
        }
      ]
    },
    {
      "id": "transfer",
      "title": "Turn a planning model into an empirical question",
      "question": "What can your pilot establish about this particular loop?",
      "outcome": "Measure observed failure classes and retain honest limits.",
      "beats": [
        {
          "id": "reliability-transfer",
          "role": "transfer",
          "title": "Design one useful reliability experiment",
          "speech": "Choose a task where later work depends on a clear intermediate decision. Freeze a small set of representative inputs. Compare a final-only check with a checkpoint at that dependency boundary, keeping budgets and acceptance requirements explicit. Record failure location, diagnosis effort, recovery cost, and independently assessed outcome quality. Include incomplete runs. Separately, use a tiny simulation to compare independent random steps with steps sharing one random outcome. The different all-success rates make the independence assumption visible. Test probability inputs at zero and one, and keep step calculations separate from segment calculations. The experiment is successful when it supports a specific design decision with stated limits. It need not deliver a reassuring percentage. Evidence that a proposed check misses the important defect is useful evidence to change the design.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Frozen cases → boundary comparison → design decision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Frozen cases",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Freeze a small set"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Boundary comparison",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare a final-only check"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Compare a final-only check"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Include incomplete runs and independent adjudication",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Include incomplete runs"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Decision evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "supports a specific design decision"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "supports a specific design decision"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this checkpoint catch the defect that matters?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "misses the important defect"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "reliability-transfer"
        },
        {
          "id": "reliability-recap",
          "role": "reflect",
          "title": "Earn the next step with applicable evidence",
          "speech": "Define the success event before calculating its probability. Treat independence as an assumption to examine. Count genuine repairs separately from checker approval. Place checkpoints at meaningful dependencies and bind evidence to revisions. Measure complete outcomes, including failures and escalation. Those are five principles to carry forward. Remember: define, condition, check, bind, measure. The equations help expose assumptions; they do not predict every real loop or set a universal safe step count. Discuss next: which early decision in your workflow can contaminate the most later work? What evidence would show that a checkpoint improves recovery without weakening acceptance? Apply this chapter by choosing one dependency boundary and specifying its artifact, requirements, check, invalidation rule, and recovery path. The next chapter asks how to supply the context that makes those decisions possible.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Earn continuation with evidence that still applies"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Explicit assumptions",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Define the success event"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Revision-bound checks",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "bind evidence to revisions"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Complete outcomes",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Measure complete outcomes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: define → condition → check → bind → measure",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: critical dependency? Useful checkpoint?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "reliability-recap-spoken-v2"
        }
      ]
    }
  ],
  "narrationSHA256": "0aa603127ffbcb00950b53edacbdfaa67e6c6256731773ae6bff4c493aee6ae9"
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
