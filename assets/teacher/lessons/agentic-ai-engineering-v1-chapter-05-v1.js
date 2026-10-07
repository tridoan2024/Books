(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-05",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "When Not to Build a Loop",
  "subtitle": "Professor Mode · verifiability, complete economics, and bounded consequences",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-05/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-05/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 5, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "70d719eb654961a6720450a42d68f573d01d1baa75cd4d991f9e969e90562286",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Choose the complete alternative",
      "question": "When does iteration earn its extra complexity?",
      "outcome": "Compare a loop with simpler ways to deliver the same useful outcome.",
      "beats": [
        {
          "id": "no-loop-stakes",
          "role": "orient",
          "title": "A working loop can still be the wrong investment",
          "speech": "A pull-request description generator is our first case. In the chapter's fictional story, Marcus builds a production loop to summarize changes, list affected systems, and flag breaking changes. Most descriptions are acceptable on the first pass, while a smaller group of difficult diffs consumes the iteration machinery. A template-assisted workflow with human handling of exceptions may be a better complete alternative. Generating infrastructure modules is our second case. Repeated validation and repair may help, but the economics change sharply with request volume and maintenance effort. A subjective document draft is our third case. Generating more versions does not demonstrate improvement when nobody can specify the quality judgment that should guide the next revision. These are illustrative design cases, not measured production outcomes or current price quotes. Their common mechanism is that iteration has a cost and needs a discriminating signal and a useful purpose. Our governing question is: when does iteration earn its extra complexity? By the end, you should be able to apply three decision gates, compare complete alternatives, test the important economic assumptions, and identify what can happen before an approval gate. The useful answer may be a loop, a fixed workflow, a bounded hybrid, or no new automation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Iteration must earn its cost and consequence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "PR descriptions",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A pull-request description generator"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Compare complete ways to deliver the outcome",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "a better complete alternative"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Infrastructure modules",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Generating infrastructure modules"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Subjective draft",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A subjective document draft"
            },
            {
              "action": "note",
              "id": "question",
              "text": "When does iteration earn its complexity?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "no-loop-stakes"
        },
        {
          "id": "no-loop-three-gates",
          "role": "explain",
          "title": "Use three gates to identify the missing justification",
          "speech": "The first gate is verifiability: what evidence can distinguish an acceptable output from an unacceptable one? The second gate is unit economics: does the complete system provide enough value at the actual workload to justify its cost? The third gate is consequence: what can an undetected error cause under the proposed authority? Treat these as decision questions, not a scorecard that mechanically approves a product. A weak answer can suggest a simpler design or a smaller task scope. It can also identify an uncertainty that a bounded prototype should measure. Do not compare a carefully costed loop with an imaginary free alternative. Do not approve broad action because a draft-only experiment looked useful. Each gate concerns the particular workflow and the outcome the organization actually values.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Three different questions need three kinds of evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Verifiability",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The first gate is verifiability"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Economics",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The second gate is unit economics"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Consequence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The third gate is consequence"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A gate identifies a decision, not a certification",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "decision questions, not a scorecard"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which uncertainty could a small prototype settle?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "an uncertainty that a bounded prototype should measure"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "no-loop-three-gates"
        }
      ]
    },
    {
      "id": "verification",
      "title": "Know what your oracle can establish",
      "question": "Can this workflow distinguish improvement from variation?",
      "outcome": "Separate observable requirements, uncertain judgment, and missing evidence.",
      "beats": [
        {
          "id": "no-loop-oracle-quality",
          "role": "derive",
          "title": "A measurable proxy can still miss the intended quality",
          "speech": "Suppose the goal is useful API documentation. Required parameter coverage, resolvable links, and executable examples are observable properties. A readability formula can measure a feature of the prose, but it cannot establish that the explanation is correct or useful. A rubric can make judgment more explicit without making the judge infallible. Challenge the proposed oracle with acceptable work, plausible wrong work, and missing evidence. Record what it catches, what it misses, and when it should return inconclusive. If repeated drafts only produce variety without a defensible preference, an autonomous improvement loop has no demonstrated feedback signal. A person can still use the drafts creatively or apply accountable judgment. The engineering question is which part of the process has a useful automated check, not whether every judgment can be reduced to one score.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Test the signal before buying more iteration"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Observable property",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "observable properties"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Proxy limit",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "it cannot establish"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can this check reject a convincing wrong artifact?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "plausible wrong work"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Inconclusive",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "when it should return inconclusive"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Variety alone does not demonstrate improvement",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "only produce variety"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "no-loop-oracle-quality"
        },
        {
          "id": "no-loop-costly-oracle",
          "role": "predict",
          "title": "A valid check may still be too expensive for every attempt",
          "speech": "The integration suite is a meaningful check, but it takes a long time and requires an expensive environment. Does that mean the task cannot be verified? No. It means oracle feasibility and oracle cost are separate questions. A cheaper preliminary check may reject obvious defects before the full suite runs, provided final acceptance still requires the necessary evidence. For a rare task, direct expert review may be more practical than maintaining that environment. For a frequent consequential task, the expensive check may be justified by the failures it prevents. Compare these alternatives at the required quality. Never substitute a shallow check simply to make the loop look economical. The correct decision may be to reduce the automated scope, preserve a human decision, or keep verification while limiting how often revision can repeat.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Feasible verification and affordable repetition differ"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Meaningful check",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a meaningful check"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Full cost",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "oracle cost are separate questions"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Required evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "final acceptance still requires"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A cheaper proxy cannot replace required acceptance",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Never substitute a shallow check"
            },
            {
              "action": "note",
              "id": "question",
              "text": "How often is this evidence worth obtaining?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "limiting how often revision can repeat"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "no-loop-costly-oracle"
        }
      ]
    },
    {
      "id": "economics",
      "title": "Compare costs at the actual workload",
      "question": "Which design remains worthwhile when the assumptions change?",
      "outcome": "Include hard cases, maintenance, outcome quality, and sensitivity.",
      "beats": [
        {
          "id": "no-loop-complete-costs",
          "role": "worked-example",
          "title": "Account for the hard cases in every alternative",
          "speech": "Compare three complete systems for Marcus: manual writing, a script with one model call and human exceptions, and a bounded iterative loop. Include ordinary runs, failed attempts, escalated cases, human review, infrastructure, maintenance, and the expected consequences of escaped defects. The script's model-call fee is not its total cost if difficult cases still need a person. The loop's provider bill is not its total cost either. Estimate build cost separately from recurring cost, then compare at the same workload and acceptable quality. Saved engineer time may increase capacity or reduce interruptions without reducing payroll. State the benefit you expect instead of calling every saved hour a cash saving. A high first-pass acceptance rate is relevant, but the rare failures may be consequential enough to justify a useful repair path. Their frequency alone does not settle the decision.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Compare complete systems on the same workload"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Manual work",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "manual writing"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Script + exceptions",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "a script with one model call"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Bounded loop",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a bounded iterative loop"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Have the hard cases been counted for every option?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "difficult cases still need a person"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Saved capacity is not automatically cash savings",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "without reducing payroll"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "no-loop-complete-costs"
        },
        {
          "id": "no-loop-volume-sensitivity",
          "role": "derive",
          "title": "Volume can reverse the decision",
          "speech": "Use the infrastructure example as a sensitivity calculation. The board shows the assumed manual cost, automated cost, and monthly maintenance. These are illustrative inputs, not current prices. Subtract automated task cost from manual task cost, multiply by monthly volume, then subtract maintenance. At sixty tasks per month, the resulting benefit is positive before other omitted costs. At six tasks, gross avoided task cost falls below the same maintenance burden. The displayed results show how lower volume reverses the decision under this simplified comparison. Also test the failure fraction, review time, maintenance burden, and adoption. Include a simpler alternative in that sensitivity table. If a small assumption change reverses the preferred design, measure that assumption before building permanent infrastructure. Saved capacity and actual cash savings remain different benefits; identify which one this calculation represents.",
          "boardActions": [
            {
              "action": "clear",
              "title": "The same maintenance burden meets different volumes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Manual $82.50/task; automated $3.05/task; upkeep $660/month (illustrative)",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "These are illustrative inputs"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "60 tasks: +$4,107",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "At sixty tasks"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "6 tasks: −$183.30",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "At six tasks"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Sensitivity",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Also test the failure fraction"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which assumption can reverse the decision?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a small assumption change reverses"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "no-loop-volume-sensitivity-spoken-v2"
        }
      ]
    },
    {
      "id": "consequences",
      "title": "Trace what can become externally effective",
      "question": "What consequences remain possible before the approval gate?",
      "outcome": "Bound execution paths and choose fixed, adaptive, or hybrid workflows.",
      "beats": [
        {
          "id": "no-loop-effect-boundaries",
          "role": "worked-example",
          "title": "A draft branch is not the whole execution boundary",
          "speech": "The infrastructure generator produces a pull request, and a person approves deployment. That is a useful boundary, but inspect what happens before approval. A planning command may contact providers or execute data sources. Opening a branch may trigger continuous integration with credentials or deployment permissions. A draft may contain sensitive data that leaves the intended environment. List the reachable effects and enforce their permissions at the components that can execute them. Use an isolated account and minimal credentials for validation, with reviewed provider configuration. A syntactically valid plan is not necessarily a desirable or authorized plan. An approval gate reduces the authority of the proposed final action only when alternate paths cannot bypass it. Design recovery for effects already admitted; reverting a commit does not undo every remote action.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Proposed artifact → preapproval effects → enforcement"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Draft artifact",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "produces a pull request"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Reachable effects",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "inspect what happens before approval"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "inspect what happens before approval"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What can happen before anyone approves deployment?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "before approval"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Enforced permissions",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "enforce their permissions"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "enforce their permissions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A valid plan may still be undesirable or unauthorized",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A syntactically valid plan"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "no-loop-effect-boundaries"
        },
        {
          "id": "no-loop-hybrid-workflow",
          "role": "explain",
          "title": "Put iteration only where it improves the result",
          "speech": "A fixed workflow can provide a predictable sequence: fetch the approved input, transform it, validate it, and route the result. A model can fill a slot without deciding what happens next. That workflow still needs meaningful checks, bounded handling of failures, and recovery for external effects. If one transformation step benefits from revision, embed a small bounded loop there while keeping the surrounding sequence fixed. This hybrid pays for adaptive behavior where evidence shows it helps. A fully open-ended planner is unnecessary when the path and its branches are already known. Conversely, a fixed template may be inadequate when the next investigation depends on new observations. Choose the mechanism for the uncertainty in the task. The engineering decision is not a contest between maximum automation and doing everything manually.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Keep the fixed path; bound the adaptive part"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Known sequence",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A fixed workflow can provide"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Model slot",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A model can fill a slot"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Fixed workflows still need checks and recovery",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "That workflow still needs meaningful checks"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Bounded revision",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "embed a small bounded loop"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Where does adaptive behavior add measured value?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "where evidence shows it helps"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "no-loop-hybrid-workflow"
        }
      ]
    },
    {
      "id": "decision",
      "title": "Use a small pilot to settle a real uncertainty",
      "question": "What evidence would justify continuing or stopping the investment?",
      "outcome": "Define a decision-oriented prototype and an honest no-build result.",
      "beats": [
        {
          "id": "no-loop-pilot-decision",
          "role": "transfer",
          "title": "Design a prototype that can tell you to stop",
          "speech": "Choose the most important uncertainty and build a prototype that can measure it within an explicit time and spending limit. A draft-only pilot may estimate first-pass quality and review effort without granting publication authority. State the cases, acceptable outcomes, comparison baseline, and maximum consequence per run. Define a kill criterion before seeing the result. For example, stop the investment if the complete cost remains higher than the simpler workflow without a justified quality benefit. Also define what evidence would support a narrow continuation. Measure actual maintenance and recovery effort, not just the successful demonstrations. The prototype succeeds when it supports a useful decision, including a decision not to build. Preserve the evidence so that later workload changes can justify reconsideration without pretending the earlier choice was a failure.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A pilot should resolve an investment decision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Key uncertainty",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Choose the most important uncertainty"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Bounded prototype",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "within an explicit time and spending limit"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Kill criterion",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Define a kill criterion"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What observation would end the investment?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "stop the investment"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A justified no-build decision is a useful outcome",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "including a decision not to build"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "no-loop-pilot-decision"
        },
        {
          "id": "no-loop-recap",
          "role": "reflect",
          "title": "Remember the signal, economics, and consequences",
          "speech": "Require a useful feedback signal. Compare complete alternatives at acceptable quality. Test the assumptions that can reverse the economics. Trace every reachable consequence, including effects before approval. Put bounded iteration only where it earns its complexity. Those are five durable principles. Remember: verify, compare, vary, bound, decide. A functioning loop is not automatically the best investment, and a fixed workflow is not automatically safe or free to maintain. Discuss next: which part of your current automation could become a simpler fixed step? Which uncertain input would most change your build decision? Apply the method to one real proposal with a three-option comparison, a sensitivity table, a maximum consequence, and a pilot kill criterion. Let the evidence support the design rather than starting with a preferred level of autonomy.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Choose the smallest complete system that earns its cost"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Useful signal",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Require a useful feedback signal"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Full comparison",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Compare complete alternatives"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Bounded consequence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Trace every reachable consequence"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: verify → compare → vary → bound → decide",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: simpler step? Decisive uncertain input?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "no-loop-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "0f236682b1d5a7f636aadd93525949e8f17748838de536414776914cf49a1974"
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
