(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-28",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Cost Engineering",
  "subtitle": "Professor Mode · Measured savings under coverage, quality, and deadline constraints",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-28/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-28/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 28, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "771a54e79cf5956980ee4fb14c9f9cfe133283451919da2c3d385427223e0ac6",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Optimize the complete service",
      "question": "Can a smaller bill hide a worse result?",
      "outcome": "Hold coverage, quality, and deadlines fixed while comparing cost.",
      "beats": [
        {
          "id": "cost-engineering-stakes",
          "role": "orient",
          "title": "An inexpensive answer can omit expensive work",
          "speech": "A nightly dependency audit is our first case. In this fictional scenario, new packages expand the inventory, repeated prompts consume more input, and difficult dependency chains trigger additional attempts. The estimated bill rises sharply, but optimization must begin by reconciling that bill with actual usage. A grouped package request is our second case. The response looks like valid structured data yet silently omits one package. Fewer tokens did not deliver the same service. A discounted asynchronous job is our third case. Its permitted completion window extends beyond the deadline for delivering the security report. The headline discount therefore cannot establish suitability. These cases are illustrative engineering scenarios, not measured savings or current provider offers. Their common mechanism is that cost changes can alter coverage, failure coupling, and delivery time. Our governing question is: how do we reduce expense while preserving the required result? We will quantify prefix reuse, distinguish two kinds of batching, design evidence-aware routing, evaluate compression, and stop unproductive work. By the end, you should be able to propose a cost change with an explicit quality constraint and a credible recovery path.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reduce expense subject to the delivery contract"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Expanded audit",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A nightly dependency audit"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Missing batch item",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A grouped package request"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Missed deadline",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A discounted asynchronous job"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A lower bill is useful only for an acceptable delivered outcome",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "cost changes can alter"
            },
            {
              "action": "note",
              "id": "question",
              "text": "How do we reduce expense while preserving the required result?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "cost-engineering-stakes-spoken-v2"
        },
        {
          "id": "cost-engineering-baseline",
          "role": "derive",
          "title": "Reconcile the baseline before selecting a lever",
          "speech": "Start with the same initiated cohort, accepted outcomes, and all-in accounting used in the previous chapter. Measure stable prefixes, variable context, generated output, verification, coordination, and recovery work. The fictional overnight audit assumes a particular token mix and price schedule to explain its invoice estimate. Treat those figures as a model to reconcile, not as a benchmark. Then select a lever aimed at a measured source of waste: reuse stable content, group suitable items, route work by required capability, compress evidence carefully, or stop attempts that no longer make progress. The effects overlap. For example, grouping requests and reusing a shared prefix both reduce repeated input cost. Adding their isolated percentage savings can count the same avoided work twice.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Measured waste → targeted intervention → complete outcome comparison"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Baseline",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Measure stable prefixes"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Intervention",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Then select a lever"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which cost category is actually large in this workload?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "measured source of waste"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Interactions",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The effects overlap"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Isolated percentage savings are not generally additive",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "count the same avoided work twice"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "cost-engineering-baseline-spoken-v2"
        }
      ]
    },
    {
      "id": "reuse",
      "title": "Measure what caching and batching actually save",
      "question": "Which part of the bill is reduced?",
      "outcome": "Separate prefix savings, item correctness, and completion deadlines.",
      "beats": [
        {
          "id": "cost-prefix-reuse",
          "role": "worked-example",
          "title": "A large prefix discount is a smaller whole-run saving",
          "speech": "Assume a stable prefix of twenty thousand tokens across one thousand two hundred forty-seven requests. At three dollars per million input tokens, ordinary prefix processing costs seventy-four dollars and eighty-two cents. Now assume one write at a premium of one quarter, followed by reads priced at ten percent of ordinary input. The board shows the resulting total, about seven dollars and fifty-five cents. That saves about sixty-seven dollars from this prefix category. It does not remove ninety percent of a run costing eight hundred forty-seven dollars. These are hypothetical billing terms. Actual support, matching rules, minimum size, lifetime, and write premiums depend on the provider and model version. Expiration or prefix changes add writes and reduce savings.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Hypothetical stable-prefix reuse across 1,247 calls"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Uncached: $74.82",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "ordinary prefix processing costs"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "1 write × $0.075 + 1,246 reads × $0.006 = $7.551",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "one write at a premium"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Reused: $7.551",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The board shows"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Saving: $67.269",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "That saves about"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What fraction of the whole run does this category represent?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "It does not remove"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "cost-prefix-reuse-spoken-v2"
        },
        {
          "id": "cost-batch-deadline",
          "role": "predict",
          "title": "Grouping items and asynchronous discounts are different",
          "speech": "Prompt-level batching places several items in one model request. Preserve stable item identifiers and validate returned identities, duplicates, missing items, and verdicts. Successful items should survive recovery of a failed item. Larger batches share context and output limits, so determine size with representative fixtures. An asynchronous batch service may instead process separate requests at a discount within a longer completion window. Predict whether a job submitted at two in the morning can rely on a twenty-four-hour window when its report is due at nine. It has only seven hours. Use a deadline-safe fallback where needed, include its cost, and prevent the original and fallback paths from publishing duplicate results.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Prompt grouping changes the task; API batching changes delivery terms"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Prompt grouping",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Prompt-level batching"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Retain successful item results and recover only unresolved items",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Successful items should survive"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Async service",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "An asynchronous batch service"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can the allowed completion window satisfy the actual deadline?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Predict whether"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "7-hour deadline",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "It has only seven hours"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "cost-batch-deadline"
        }
      ]
    },
    {
      "id": "cascade",
      "title": "Allocate deterministic and model work",
      "question": "Does a higher price repair missing evidence?",
      "outcome": "Preserve inventory and unknowns through staged analysis.",
      "beats": [
        {
          "id": "cost-deterministic-first",
          "role": "derive",
          "title": "Make inventory and version matching explicit",
          "speech": "Use a deterministic parser to extract package identities and installed versions. Match them against a pinned advisory snapshot using the appropriate ecosystem's version semantics. Return inventory coverage and unresolved entries as well as known matches. Unsupported syntax or an unknown package identity remains unknown. A missing vulnerability identifier in model output is not evidence that the package is clean. Model-assisted reasoning can then examine reachability, exploit conditions, and operational impact using the available evidence. High-consequence unresolved interpretation may require a specialist or human authority. Price does not confer legal expertise, and a more capable model cannot reconstruct dependency facts that the system never obtained. Recover missing evidence before escalating reasoning alone.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Inventory → pinned advisory matching → evidence interpretation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Inventory",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "deterministic parser"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Match",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Match them against"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Match them against"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "No match is bounded to known inventory and a particular advisory snapshot",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "inventory coverage"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is this clean evidence, or an unresolved coverage gap?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "remains unknown"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Interpret",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Model-assisted reasoning"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Model-assisted reasoning"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "cost-deterministic-first"
        },
        {
          "id": "cost-routing-accounting",
          "role": "derive",
          "title": "A sequential cascade pays for the stages already visited",
          "speech": "Exclusive routing sends an item directly to one selected route. A sequential cascade first tries one stage and adds later stages for selected items. Their cost equations differ. In a cascade, every item pays the initial stage, and escalated items also pay each later stage they reach. Weight costs by actual token volume and conditional escalation rates, not only the fraction of items using each model. Hard cases may consume much more output. Also test shared failures: every model may receive the same stale advisory snapshot, truncated file, or weak evaluator. Separate contexts do not remove those common causes. When a prerequisite fails, the useful route may be evidence recovery rather than a higher-priced model.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Sequential cost = first stage + reached later stages"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Initial stage",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "every item pays the initial stage"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Escalation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "each later stage they reach"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Item fractions alone do not determine token-weighted cost",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "actual token volume"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Common cause",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "the same stale advisory snapshot"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would a stronger model receive the same missing or stale evidence?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "When a prerequisite fails"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "cost-routing-accounting"
        }
      ]
    },
    {
      "id": "compress",
      "title": "Retain decision-relevant evidence",
      "question": "What disappears when context becomes smaller?",
      "outcome": "Keep provenance and expansion paths while measuring quality.",
      "beats": [
        {
          "id": "cost-compression-boundary",
          "role": "derive",
          "title": "Compression needs a way to recover omitted evidence",
          "speech": "A tool can return the fields needed for the current decision with a source locator, provenance, and explicit truncation status. Preserve an expansion path to the original evidence. For a dependency question, an affected version range may be sufficient for one check while a reachability claim needs call paths and configuration. Do not impose one universal minimal field set on both questions. History pruning similarly needs to retain decisions, constraints, unresolved questions, and references to earlier evidence. A recent feedback message may not summarize every important fact. Compression succeeds when the smaller representation preserves the information required by the task, and the system recognizes when it must retrieve more.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Bounded evidence → sufficiency check → expand if needed"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Bounded slice",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "fields needed for the current decision"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Source locators and truncation markers preserve the recovery path",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Preserve an expansion path"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What fact would change the decision if omitted?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a reachability claim needs"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Sufficiency",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "information required by the task"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "information required by the task"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Expansion",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "must retrieve more"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "must retrieve more"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "cost-compression-boundary"
        },
        {
          "id": "cost-compression-test",
          "role": "worked-example",
          "title": "A valid shape can hide a missing qualification",
          "speech": "Suppose a short advisory extract includes a severity score but omits the condition that makes exploitation possible. The resulting finding can satisfy every structural field while overstating applicability. Predict whether a schema validator will necessarily catch that loss. It checks shape, so the answer is no. Build a fixture where a relevant caller or qualifying paragraph is intentionally removed. The system should expand its evidence or mark the conclusion insufficient. Compare the full and compressed paths on matched inputs with independently adjudicated critical cases. Measure consequence-specific misses and human correction, not just average score. A small convenient sample cannot establish an arbitrarily narrow quality margin.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Valid structure does not establish preserved meaning"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Omitted condition",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "omits the condition"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Valid shape",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "satisfy every structural field"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would the schema detect a missing applicability condition?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Predict whether"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Expand or qualify",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "expand its evidence"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Test semantic loss with independent critical-case evidence",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "independently adjudicated critical cases"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "cost-compression-test"
        }
      ]
    },
    {
      "id": "stop",
      "title": "Bound work that lacks a useful next step",
      "question": "When is another attempt economically justified?",
      "outcome": "Connect termination to evidence change and recovery cost.",
      "beats": [
        {
          "id": "cost-stop-policy",
          "role": "derive",
          "title": "A flat score is evidence to investigate",
          "speech": "Several flat scores can indicate a stalled strategy, a noisy evaluator, or a prerequisite that is still unavailable. They do not prove that convergence is impossible. Require a concrete next action that can change the evidence or prerequisite, within the remaining budget and deadline. If none exists, stop with useful completed work and explicit unresolved coverage. A shared dependency outage calls for a shared circuit breaker, not independent repeated reasoning by every worker. A harder model may help only when insufficient reasoning is actually the limitation. Encode allowed recovery routes and budget limits in trusted policy. The model should not invent additional spending authority to continue its own analysis.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Inspect failure → identify useful change → continue or stop"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Failure evidence",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Several flat scores"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Changed prerequisite",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "concrete next action"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "concrete next action"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Bounded decision",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "within the remaining budget"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "within the remaining budget"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What evidence can the next attempt actually change?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "If none exists"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Stopping preserves completed work and labels unresolved coverage",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "stop with useful completed work"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "cost-stop-policy"
        },
        {
          "id": "cost-recovery-cost",
          "role": "worked-example",
          "title": "Avoided model tokens are not the entire saving",
          "speech": "The illustrative stalled package consumes twenty-five thousand tokens per attempt. Stopping after three attempts instead of seven avoids one hundred thousand tokens for that package. Across twenty-eight similar packages, that is two point eight million tokens. At the assumed input and output mix, the board shows about twenty dollars of model spending avoided. Now add the human recovery queue, tool work, and deadline effects. Escalation may still be the right decision, but avoided model spending is not automatically equal to net savings. Preserve successful packages, identify the unresolved ones, and measure what resolution actually costs. Report incomplete coverage explicitly when the service contract permits a partial result.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Illustrative early stop: 7 attempts → 3 attempts"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "100,000 tokens/item",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "one hundred thousand tokens"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "28 items",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "twenty-eight similar packages"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "2.8M avoided",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "two point eight million tokens"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "At 65/35 input/output and $3/$15 rates: $20.16 model cost avoided",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "the board shows"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What human recovery cost replaces the avoided model spending?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Now add"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "cost-recovery-cost"
        }
      ]
    },
    {
      "id": "release",
      "title": "Evaluate the combined configuration",
      "question": "Do overlapping savings survive an end-to-end comparison?",
      "outcome": "Test critical cases, fallback paths, and rollback criteria.",
      "beats": [
        {
          "id": "cost-combined-release",
          "role": "transfer",
          "title": "Compare the combined system against its baseline",
          "speech": "Change one mechanism at a time so its effects can be understood, then evaluate the combined configuration on the same task distribution. Include unusual version syntax, stale advisories, truncated lockfiles, missing batch items, and shared tool failure. Measure full spending, coverage, critical misses, reviewer minutes, and deadline misses on normal and fallback paths. An ambitious savings target remains an experiment until those results support it. Keep the previous configuration available and use a limited rollout. Stop or roll back if critical findings disappear or the recovery queue exceeds capacity. Cost parameters change behavior, so they belong in versioned configuration and the same evidence-based release process as other consequential changes.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Isolated change → combined evaluation → bounded rollout"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "One mechanism",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Change one mechanism at a time"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Combined test",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "evaluate the combined configuration"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "evaluate the combined configuration"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Measure total cost and quality on normal and recovery paths",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "normal and fallback paths"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Rollout",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "use a limited rollout"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "use a limited rollout"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which regression would stop or reverse this rollout?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Stop or roll back"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "cost-combined-release"
        },
        {
          "id": "cost-engineering-recap",
          "role": "reflect",
          "title": "Savings must survive the full delivery path",
          "speech": "Reconcile spending before optimizing it. Measure the portion of the bill affected by each lever. Distinguish prompt grouping from asynchronous delivery, and preserve item identity and deadlines. Use deterministic checks for known structure while keeping missing evidence visible. Compress with provenance and an expansion path. Stop attempts that lack a useful authorized next step, including their recovery cost in the comparison. Remember: measure, target, preserve, recover, compare. Apply that sequence to one expensive workflow before combining several changes. Discuss next: which proposed savings overlap? Which critical fact could compression remove? Next we will build the observability needed to diagnose these systems in operation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Optimize complete outcomes under unchanged quality constraints"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Reconciled baseline",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Reconcile spending"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Preserved evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compress with provenance"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Recovery included",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "including their recovery cost"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: measure → target → preserve → recover → compare",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: overlapping savings? Omitted critical fact?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "cost-engineering-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "2fef4431e0876ff8efdd4992022cc19d8aa75443a5abaa4f84ce11e9d58ee678"
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
