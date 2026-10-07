(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-27",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Token Economics of Loops",
  "subtitle": "Professor Mode · Cohort accounting, conditional retries, and enforceable budgets",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-27/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-27/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 27, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "a057164fdd281bef2bf531e5fca5f2db41ab5ce90121b63819b7b6130d5f26ba",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Price the delivered outcome",
      "question": "What does one accepted result actually cost?",
      "outcome": "Separate useful performance, economic value, and spending authority.",
      "beats": [
        {
          "id": "economics-stakes",
          "role": "orient",
          "title": "A successful pilot still needs a production cost model",
          "speech": "A clinical summary pilot is our first case. In the chapter's fictional scenario, a team produces useful structured summaries, but the full workflow repeatedly sends context to the model, produces drafts, then evaluates those drafts. The summary document explains only a small part of the total bill. A security review fleet is our second case. Five specialists contribute to one final review, while a lead spends additional tokens assigning and reconciling their work. The final response alone hides most of the cost. A scheduled workflow is our third case. A run that looks inexpensive during manual testing becomes a large recurring expense when every repository change triggers it. These examples use illustrative workloads and prices, not current vendor quotations or measured clinical performance. The common mechanism is that consumption accumulates across the whole delivery path and operating volume. Our governing question is: what does one accepted result actually cost? We will define a consistent cohort, derive conditional retry costs, reconcile billing events, compare human follow-up, and enforce shared budgets. By the end, you should be able to explain why a useful pilot may still require a different design before it is affordable at production scale.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Whole delivery path × operating volume"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Clinical summary",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A clinical summary pilot"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Review fleet",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A security review fleet"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Scheduled workflow",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A scheduled workflow"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Useful performance, economic value, and spending authority are separate",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "consumption accumulates"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What does one accepted result actually cost?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "economics-stakes-spoken-v2"
        },
        {
          "id": "economics-token-example",
          "role": "worked-example",
          "title": "Start with explicit usage and an explicit rate card",
          "speech": "The illustrative summary run uses fifty-seven thousand input tokens and thirty-one thousand output tokens, including retries and evaluation. Multiply input usage by three dollars per million and output usage by fifteen dollars per million. The board shows the unrounded cost, just under sixty-four cents per initiated run. The planning tables round it to sixty-four cents. Preserve that rounding decision so reconciliation does not mistake it for unexplained spending. These rates are arithmetic assumptions, not a quotation tied to a particular model. At these rates, one output token costs five times as much as an input token without a reuse discount. That observation guides measurement, but shortening output helps only if consumers still receive the required evidence and structure.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Illustrative cost = input charge + output charge"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Input: 57,000",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "fifty-seven thousand input"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Output: 31,000",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "thirty-one thousand output"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "(57,000 × 3 + 31,000 × 15) / 1,000,000 = $0.636",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Multiply input usage"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Cost: $0.636",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The board shows"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does a shorter result still satisfy its delivery contract?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "shortening output helps"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "economics-token-example-spoken-v2"
        }
      ]
    },
    {
      "id": "cohort",
      "title": "Keep costs and outcomes in the same cohort",
      "question": "Which spending belongs in the numerator?",
      "outcome": "Account for failed attempts and human recovery without changing denominators.",
      "beats": [
        {
          "id": "economics-cohort",
          "role": "derive",
          "title": "Failed work remains in the numerator",
          "speech": "Cost per verified outcome divides all relevant spending by accepted outcomes from the same cohort and time window. Model-only cost includes every model attempt that incurs a charge. All-in cost also includes tools, infrastructure, evaluation, human review, rework, and allocated operations. A failed run creates an expense without adding an accepted result. A fleet producing one accepted synthesis contributes all worker and coordinator costs to that one result. Define how late acceptances and unresolved cases are recorded. First-attempt pass rate is different from eventual acceptance under a capped policy. If there are no accepted outcomes, the ratio is undefined, not zero. An evaluator pass also establishes only the properties that evaluator can actually assess.",
          "boardActions": [
            {
              "action": "clear",
              "title": "CPVO = cohort spending / accepted cohort outcomes"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "All spending",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "all relevant spending"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Accepted outcomes",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "accepted outcomes from the same cohort"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Same window",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "same cohort and time window"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Zero accepted outcomes ⇒ undefined CPVO",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "If there are no accepted outcomes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the evaluator establish the quality the consumer requires?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "properties that evaluator"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "economics-cohort-spoken-v2"
        },
        {
          "id": "economics-human-recovery",
          "role": "worked-example",
          "title": "Use one denominator for model and human spending",
          "speech": "Consider one hundred initiated runs costing sixty-four dollars in model usage. Ninety-one results are accepted automatically. Nine others require human review, which costs another one hundred twelve dollars and fifty cents. Suppose all nine are then accepted. The cohort has one hundred accepted results and total direct spending of one hundred seventy-six dollars and fifty cents. Divide those totals to obtain the amount spent per delivered result shown on the board. Operations and residual error costs remain additional. Do not divide model spending by automatic acceptances and then add review spending divided by all deliveries. Those denominators describe different groups. Also distinguish released professional capacity from a cash saving: the payroll may remain unchanged even when useful time is freed.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Automatic + human-resolved outcomes → one delivered cohort"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "91 automatic",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Ninety-one results"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "9 human-resolved",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "all nine are then accepted"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "all nine are then accepted"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "100 delivered",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "one hundred accepted results"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "one hundred accepted results"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "($64 + $112.50) / 100 = $1.765 per delivered result",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Divide those totals"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did the workflow release capacity, reduce cash spending, or both?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "distinguish released professional capacity"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "economics-human-recovery-spoken-v2"
        }
      ]
    },
    {
      "id": "retry",
      "title": "Derive the economics of conditional retries",
      "question": "Does the next attempt have a new chance of success?",
      "outcome": "Calculate expected cost and acceptance from reach probabilities.",
      "beats": [
        {
          "id": "economics-retry-derivation",
          "role": "derive",
          "title": "A later attempt is reached only after earlier failure",
          "speech": "Let the reach probability describe how often an attempt actually occurs. The first attempt is always reached. If it passes eighty percent of the time, the second is reached twenty percent of the time. If half of those second attempts pass, the third is reached ten percent of the time. Multiply each attempt's conditional mean cost by its reach probability, then add the contributions. For acceptance, multiply the conditional pass probability by the same reach probability and add. This works because first success on each attempt defines mutually exclusive outcomes. The ratio of expected cost to acceptance probability estimates cost per accepted outcome across comparable runs. It is not the average bill among successful runs alone.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reach first → reach second → reach third"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "q₁ = 1",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "first attempt is always reached"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "q₂ = 0.20",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "second is reached twenty percent"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "second is reached twenty percent"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "q₃ = 0.10",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "third is reached ten percent"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "third is reached ten percent"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "E[cost] = Σ qⱼcⱼ; P(accept) = Σ qⱼsⱼ",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Multiply each attempt"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What prerequisite changes before the next attempt?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "conditional pass probability"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "economics-retry-derivation"
        },
        {
          "id": "economics-retry-example",
          "role": "predict",
          "title": "Predict what happens when later attempts cannot succeed",
          "speech": "Use attempt costs of forty, fifty-five, and seventy cents, with conditional pass rates of eighty, fifty, and thirty percent. The weighted cost is fifty-eight cents, and acceptance is ninety-three percent. Their ratio is about sixty-two cents per accepted output. Now predict the result if an outage makes both later pass rates zero. Keep the first pass rate unchanged and assume the policy still spends all three attempts on failures. The third attempt is now reached twenty percent of the time, because the second never repairs anything. Expected cost rises to sixty-five cents while acceptance stays at eighty percent. The board gives the resulting ratio. Stopping after the first failure would preserve the same acceptance at lower cost under these assumptions.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Illustrative retries: conditional success determines value"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Normal: $0.58",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "weighted cost is fifty-eight cents"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Accept: 0.93",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "acceptance is ninety-three percent"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Predict: why does the third-attempt reach probability change?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Now predict"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Outage: $0.65",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "cost rises to sixty-five cents"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Normal CPVO ≈ $0.624; outage CPVO = $0.65 / 0.80 = $0.8125",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The board gives"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "economics-retry-example"
        }
      ]
    },
    {
      "id": "ledger",
      "title": "Reconcile the token ledger",
      "question": "Can the estimate be reconciled to real billing events?",
      "outcome": "Count each charge once and label unknown usage.",
      "beats": [
        {
          "id": "economics-billing-ledger",
          "role": "derive",
          "title": "One request event may have several diagnostic tags",
          "speech": "Give each provider request an immutable billing event identity. Record returned usage, exact model version, pricing date, currency, and applicable billing categories. Input and output charges may have different rates. Stored prompt reuse, batch discounts, tool fees, and reasoning usage require provider-specific accounting. Reasoning tokens may already be included in output totals, so adding them again can duplicate a charge. Treat retry and coordination as diagnostic tags on events, not extra invoices. Deduplicate repeated delivery of the same usage event. Keep estimated spending separate from settled spending. A timeout can still produce a bill; missing usage remains unknown or estimated until reconciliation, not silently zero.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Request identity → usage categories → invoice reconciliation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Request ID",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "immutable billing event identity"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Usage",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Record returned usage"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Record returned usage"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Could any reported token category already include another?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "already be included"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Retry is a tag; a timeout is not proof of zero billing",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Treat retry and coordination"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "until reconciliation"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "until reconciliation"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "economics-billing-ledger"
        },
        {
          "id": "economics-cost-diagnosis",
          "role": "explain",
          "title": "Reduce waste without silently changing the service",
          "speech": "Measure serialized requests to locate repeated instructions, history, tool results, generated output, evaluation, and coordination. A bounded source slice can reduce reading cost, but preserve locators, truncation markers, and a way to retrieve missing context. Cheap discriminating checks can precede expensive judgments when they reliably eliminate invalid candidates. Neither tactic justifies weakening the required outcome. Track acceptance, consequential false acceptances, human correction minutes, and tail cost by task class. Easy tasks can subsidize a pathological subtype and conceal its expense in an average. If cost drifts, investigate pricing, task mix, context growth, and retry behavior before attributing the change to the model. Compare stable reference cohorts as well as the approved budget.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Diagnose spending while holding the service contract fixed"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Measure requests",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Measure serialized requests"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Bound retrieval",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A bounded source slice"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A lower bill from dropping hard tasks changes the service",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "weakening the required outcome"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Inspect tails",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "tail cost by task class"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which task class is hidden by the overall average?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Easy tasks can subsidize"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "economics-cost-diagnosis"
        }
      ]
    },
    {
      "id": "fleet",
      "title": "Evaluate model tiers and operating cadence",
      "question": "Can a cheap run become an unaffordable service?",
      "outcome": "Compare equal-quality outcomes over the actual operating calendar.",
      "beats": [
        {
          "id": "economics-fleet-tiers",
          "role": "derive",
          "title": "Model tiering is an experiment about complete outcomes",
          "speech": "A cheaper coordinator can be appropriate for bounded routing, but difficult decomposition and synthesis may require the strongest reasoning in the fleet. Compare complete outcomes on equivalent cohorts. Include routing errors, dependency mistakes, worker retries, and human correction. A model that costs five times as much per similar attempt is not cheaper merely because it finishes in one attempt instead of two. Likewise, several specialists sharing context and evaluators can make correlated errors. Remove or substitute one component in a controlled comparison and measure the effect on accepted output and correction effort. Product-family labels are not permanent job qualifications. Allocate spending where measured capability differences improve the required result.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Evaluate tiers by end-to-end delivery evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Lead decisions",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "difficult decomposition and synthesis"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Specialist work",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "worker retries"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "One attempt at 5× price can cost more than two cheaper attempts",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "five times as much"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What changes when this component is removed or substituted?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Remove or substitute"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Final acceptance",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "accepted output and correction effort"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "economics-fleet-tiers"
        },
        {
          "id": "economics-cadence",
          "role": "worked-example",
          "title": "A calendar is part of the cost equation",
          "speech": "At the rounded sixty-four cents per run, two thousand four hundred runs each day cost one thousand five hundred thirty-six dollars per day. A thirty-day budget month costs forty-six thousand eighty dollars. Twelve such months cover three hundred sixty days, not a full three hundred sixty-five-day operating year. The board shows both annual totals. For any scheduled fleet, multiply actual eligible runs by scope and calendar. The word continuous does not specify a run rate. Reducing cadence is valid only if the new schedule still meets freshness and response requirements. Positive expected business value also does not enlarge the spending limit that was authorized. Present volume ranges, uncertainty, and a reserve for correlated failures before committing to deployment.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Calendar and scope determine the recurring bill"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "2,400 runs/day",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "two thousand four hundred runs"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "360 budget days",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "three hundred sixty days"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "365 operating days",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "three hundred sixty-five-day"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "At $0.64/run: 360 days = $552,960; 365 days = $560,640",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The board shows"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the cheaper cadence still meet freshness requirements?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Reducing cadence"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "economics-cadence-spoken-v2"
        }
      ]
    },
    {
      "id": "control",
      "title": "Make the budget enforceable",
      "question": "Can concurrent workers all spend the last allowance?",
      "outcome": "Reserve shared capacity atomically and preserve completed work on exhaustion.",
      "beats": [
        {
          "id": "economics-reservation-drill",
          "role": "transfer",
          "title": "Reserve the final allowance atomically",
          "speech": "Five workers simultaneously observe ten dollars remaining. Predict what happens if each independently decides that its request for ten dollars fits. They can collectively exceed the ceiling even though every local check looked valid. Use an atomic shared reservation before dispatch. Record settled cost, maximum in-flight exposure, and remaining allowance separately. Release unused reservations when outcomes are reconciled, recognizing that cancellation may not immediately stop provider billing. Test duplicate usage delivery, a timeout that still incurs a charge, and a shared dependency outage. During that outage, retain useful completed outputs and postpone affected tasks. The drill passes when the ledger reconciles, uncertain charges remain visible, and aggregate reservations stay within the approved envelope.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reserve atomically → dispatch → reconcile actual spending"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can five workers all spend the final allowance?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Predict what happens"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Local balance checks cannot enforce a shared ceiling",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "collectively exceed the ceiling"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Reserve",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "atomic shared reservation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Dispatch",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "before dispatch"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "before dispatch"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "when outcomes are reconciled"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "when outcomes are reconciled"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "economics-reservation-drill-spoken-v2"
        },
        {
          "id": "economics-recap",
          "role": "reflect",
          "title": "Make the economics traceable to accepted work",
          "speech": "Define the accepted outcome and keep its cohort consistent. Include failed attempts, coordination, and human recovery in the appropriate cost measure. Derive retry value from conditional evidence rather than independent lottery assumptions. Reconcile each billing event once and preserve unknown charges. Evaluate model tiers and cadence against unchanged quality requirements. Enforce shared spending through reservations and explicit exhaustion behavior. Remember: define, count, condition, reconcile, constrain. Apply that sequence to one real scheduled workflow and calculate its annual operating range. Discuss next: which cost is missing from your current denominator comparison? Which retry repeats an unchanged failure? Next we will examine engineering changes that reduce expense while retaining the required result.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Affordability requires quality, honest accounting, and enforceable limits"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Cohort",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Define the accepted outcome"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Conditional retries",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Derive retry value"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Enforced budget",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Enforce shared spending"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: define → count → condition → reconcile → constrain",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: mixed denominators? Unchanged retry failure?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "economics-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "eb285adda3590de1877ccc53aad7e299013ca002ae08607c6c955f2f2f798738"
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
