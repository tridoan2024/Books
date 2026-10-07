(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-03",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Anatomy of a Loop",
  "subtitle": "Professor Mode · from five contract fields to observable runtime enforcement",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-03/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-03/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 3, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "e4be80794e7a4a50bd8018393a9d6e653cf8456cb5a86e8d5cd40c46e60c2b10",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Make unfinished work observable",
      "question": "What turns a promising agent into a controlled loop?",
      "outcome": "Diagnose the gap between a goal and an enforced operating contract.",
      "beats": [
        {
          "id": "anatomy-stakes",
          "role": "orient",
          "title": "A useful attempt can still become an endless task",
          "speech": "A build-repair agent is our first case. In the chapter's fictional story, Kenji's agent alternates between two partial fixes for a date-parsing problem. Each change repairs some tests and breaks others. The underlying dependency change lies outside its permitted edits, but the worker keeps trying. A documentation generator is our second case. It can produce polished pages while missing required parameters or including examples that do not compile. A source-review workflow is our third case. It can keep gathering material after it already has enough evidence for the requested decision. These are illustrative engineering cases, not measured production results. Their common mechanism is a weak connection between the desired outcome, available evidence, resource limits, and the decision to continue. A promising first week does not establish that the next unusual case will stop appropriately. Our governing question is: what turns a promising agent into a controlled loop? By the end, you should be able to trace the stages of work, choose supporting components, define the five contract fields, identify omissions in a runner, and demonstrate a useful result when completion is impossible. We will keep returning to the repair agent and the evidence its operator needs.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A useful attempt needs a controlled ending"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Build repair",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A build-repair agent"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Documentation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A documentation generator"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Source review",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A source-review workflow"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Evidence, limits, and continuation must connect",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Their common mechanism"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What makes this a controlled loop?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "anatomy-stakes"
        },
        {
          "id": "anatomy-contract-plan",
          "role": "explain",
          "title": "The contract constrains the plan",
          "speech": "The goal describes the intended outcome. The oracle describes the evidence used to judge it. The budget limits the resources available. The stop condition determines when further work ends. The escalation path describes the next responsible action when the loop cannot finish. These five fields are the book's contract framework. A plan is different: it is a current hypothesis about how to achieve the goal. The worker may revise that hypothesis when evidence changes, but it cannot silently delete acceptance criteria or widen its permissions. Keep those constraints in trusted runtime state. A configuration document can describe a rule without enforcing it. For Kenji, writing a budget into a prompt is not the same as preventing a costly next call. The engineering task is to connect every important rule to the component that can actually enforce it.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Contract rules constrain a revisable plan"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Goal + oracle",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The goal describes"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Budget + stop",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The budget limits"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Escalation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "The escalation path"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which decisions may the worker revise?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "The worker may revise that hypothesis"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A written rule needs an enforcing component",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "connect every important rule"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "anatomy-contract-plan"
        }
      ]
    },
    {
      "id": "stages",
      "title": "Connect observation to the next decision",
      "question": "What information should each stage produce?",
      "outcome": "Trace discovery, planning, execution, verification, and useful iteration.",
      "beats": [
        {
          "id": "anatomy-discover-plan",
          "role": "derive",
          "title": "Gather the evidence that can change the next action",
          "speech": "Discovery gathers the information needed for a competent decision. For the repair agent, that includes the failing assertion, relevant code, recent changes, and the boundary on dependency edits. Planning turns those observations into a specific proposed action and an expected result. A detailed plan can still be wrong; specificity alone is not evidence of adequate discovery. Check that the proposed action is supported by the sources and that important unknowns remain visible. Stop collecting material when the next decision is sufficiently supported for its consequence. Reuse valid observations instead of rereading the entire repository on every iteration. If a new result contradicts the hypothesis, investigate the contradiction before repeating the action. The useful connection is between an observation and a decision it can change.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Relevant observation → hypothesis → next check"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Observation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Discovery gathers"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Hypothesis",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Planning turns"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Planning turns"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A detailed plan can still be wrong",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A detailed plan can still be wrong"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Next check",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "If a new result contradicts"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "If a new result contradicts"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What decision will this extra evidence change?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a decision it can change"
            }
          ],
          "pauseAfterMs": 3000,
          "audioSegment": "anatomy-discover-plan"
        },
        {
          "id": "anatomy-execute-verify-iterate",
          "role": "worked-example",
          "title": "Make the next attempt depend on an observed result",
          "speech": "Execution applies an authorized step and produces an inspectable artifact or result. Verification checks that result against the relevant acceptance criteria. Iteration uses the diagnostic to decide whether another attempt has a useful basis. Suppose the date-handling change repairs one test and breaks three others. The next step needs the actual failure pattern and the identity of the changed artifact. A vague instruction to try harder carries little information. A precise report can suggest a different hypothesis or reveal that the needed dependency edit is outside the current scope. In that case, another code change may be less useful than an authorized handoff. The five stages are a reasoning model; they need not be five separate services or five repeated ceremonies. What matters is preserving the connection from evidence to action to a justified next decision.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Artifact → observed result → justified next decision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Execute",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Execution applies"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Verify",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Verification checks"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Verification checks"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Iterate",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Iteration uses"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Iteration uses"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What changed that makes another attempt useful?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "whether another attempt has a useful basis"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A precise diagnostic can justify stopping",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "the needed dependency edit is outside"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "anatomy-execute-verify-iterate"
        }
      ]
    },
    {
      "id": "building-blocks",
      "title": "Choose infrastructure for a demonstrated need",
      "question": "Which supporting components does this loop require?",
      "outcome": "Select triggers, isolation, knowledge, connectors, specialists, and memory proportionately.",
      "beats": [
        {
          "id": "anatomy-trigger-isolation-knowledge",
          "role": "explain",
          "title": "Start correctly, isolate edits, and load relevant knowledge",
          "speech": "Automation determines when work starts. A manual request, schedule, or event can be appropriate; unattended triggering is not a prerequisite for a useful loop. An event-driven trigger needs clear ownership of duplicate or overlapping events. Isolation separates edits that would otherwise collide. A worktree provides a separate checkout, but it does not automatically isolate network access, credentials, databases, or external effects. Choose the relevant boundary for the work. Skills provide reusable project knowledge and constraints. Load the material needed for the current task, check its freshness, and resolve conflicts against the actual authority hierarchy. These are three supporting components, not three features that every small task must acquire. Add each one to address an observed coordination, access, or knowledge need, and account for the maintenance it creates.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Three supports for a controlled start"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Trigger",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Automation determines"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Isolation",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Isolation separates"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A worktree does not isolate every effect",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "it does not automatically isolate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Project knowledge",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Skills provide"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which observed need does this component solve?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Add each one to address"
            }
          ],
          "pauseAfterMs": 3000,
          "audioSegment": "anatomy-trigger-isolation-knowledge"
        },
        {
          "id": "anatomy-connectors-specialists-memory",
          "role": "explain",
          "title": "Reach, specialization, and memory have boundaries",
          "speech": "Connectors let the workflow reach systems such as source control, issue tracking, or a database. Each connector needs scoped credentials and operation-level policy. Subagents can separate useful assignments or evaluation contexts. A fresh context reduces direct exposure to the maker's reasoning, but shared training, requirements, or evidence can still produce shared mistakes. Specialization needs a real benefit and a clear integration owner. Memory retains useful observations across runs, together with their source, revision, and limits. A stored claim should be retrieved as evidence to reassess, not as permission to act or permanent truth. These components extend what the loop can do. They also add stale state, coordination, and authority risks. Select the smallest set that supports the contract rather than installing every building block because the diagram contains it.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Extended capability brings additional boundaries"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Connectors",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Connectors let"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Specialists",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Subagents can"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Who owns integration and authority?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "a clear integration owner"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Memory",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Memory retains"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Stored claims remain subject to reassessment",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A stored claim should be retrieved"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "anatomy-connectors-specialists-memory"
        }
      ]
    },
    {
      "id": "acceptance",
      "title": "Bind a verdict to the thing checked",
      "question": "What does this particular passing result establish?",
      "outcome": "Define acceptance, detect missing evidence, and retain artifact-bound results.",
      "beats": [
        {
          "id": "anatomy-acceptance-contract",
          "role": "derive",
          "title": "Describe the outcome without confusing a proxy with intent",
          "speech": "For the documentation example, define observable requirements: cover the parameters in the current interface specification, provide the required request examples, and check extracted code in the intended environment. A word-count range may be a useful editorial constraint, but it cannot establish technical completeness. Separate required properties from convenient proxies. Choose an oracle that can discriminate the property you care about, at an acceptable cost. A parser checks structure; a behavioral test exercises specified conditions; a calibrated reviewer can examine arguments that those checks cannot settle. No universal price multiplier makes the hierarchy correct for every task. Human review also has limits. The acceptance decision should identify which evidence is required, what its result means, and what uncertainty remains when a required check cannot run.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Connect each requirement to discriminating evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Required property",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "define observable requirements"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A proxy is not proof of the intended outcome",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Separate required properties"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Appropriate check",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Choose an oracle"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What property does this check discriminate?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the property you care about"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Explicit uncertainty",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "what uncertainty remains"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "anatomy-acceptance-contract"
        },
        {
          "id": "anatomy-current-evidence",
          "role": "predict",
          "title": "Does a successful process prove that the artifact passed?",
          "speech": "The test process exits successfully, but it collected no tests. Is the repair accepted? Pause and name the missing fact. The exit code describes a process outcome; it does not establish that the required verification occurred. Now suppose tests ran successfully against yesterday's files. That result also fails to establish acceptance of the current patch. Bind each verdict to the artifact digest, the check version, the environment, and the completed process result. Check that the required tests were actually selected and executed. If the test database is unavailable, record the result as inconclusive and preserve the patch for later checking. Do not convert missing evidence into a failure diagnosis that sends the maker on an unrelated repair. Evidence must identify both what was checked and what the check actually established.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A verdict belongs to one checked artifact"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A zero exit code can accompany an empty test run",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "it collected no tests"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did the required check run on this version?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "yesterday's files"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Artifact identity",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Bind each verdict to the artifact digest"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Executed checks",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "the required tests were actually selected"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Inconclusive",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "record the result as inconclusive"
            }
          ],
          "pauseAfterMs": 6000,
          "audioSegment": "anatomy-current-evidence"
        }
      ]
    },
    {
      "id": "limits",
      "title": "Enforce resources and detect repeated states",
      "question": "When must the runtime prevent another attempt?",
      "outcome": "Apply admission limits, durable accounting, cancellation, and meaningful stopping rules.",
      "beats": [
        {
          "id": "anatomy-admission-budget",
          "role": "derive",
          "title": "A limit checked after the call is not a hard ceiling",
          "speech": "The inherited runner checks its budget after generation and verification. One expensive or hung call can therefore exceed the nominal ceiling before the check happens. Reserve an allowance before admitting each call. Apply provider limits, process deadlines, and cancellation where those mechanisms are available. Reconcile actual usage afterward, including generation, tools, verification, and retries. Carry cumulative usage across restarts so recovery does not create a new free budget. Multiple dimensions matter: a short run can be expensive, and a cheap sequence can still miss its deadline. A useful artifact may pass its behavioral checks after the runtime exceeded a limit. Preserve the artifact while reporting the policy violation separately. Outcome validity and compliant execution are two facts; a single success flag should not conceal their disagreement.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reserve → enforce → reconcile"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can one call exceed the remaining allowance?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "One expensive or hung call"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Reserve",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Reserve an allowance"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Enforce",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Apply provider limits"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Apply provider limits"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Reconcile",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Reconcile actual usage"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Reconcile actual usage"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Carry cumulative usage across retries and restarts",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Carry cumulative usage across restarts"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "anatomy-admission-budget"
        },
        {
          "id": "anatomy-state-stopping",
          "role": "check",
          "title": "A changing score is not necessarily progress",
          "speech": "Kenji's worker alternates between two partial fixes. A score may rise and fall in that cycle, but noisy scores can also alternate during useful progress. Diagnose repeated states with artifact and failure fingerprints, then inspect the underlying reason. A flat score can conceal a valuable discovery about an unavailable permission. A higher score can conceal a newly introduced critical defect. Define stopping behavior for success, exhausted limits, cancellation, repeated ineffective approaches, and unresolved verification. Check cancellation before new dispatch and during work that supports interruption. The worker cannot recover from an authority gap by granting itself broader access. If the necessary dependency edit is outside its scope, preserve the diagnostic and route it to the responsible owner. Stopping with a useful explanation is a designed outcome, not evidence that the entire effort was wasted.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Inspect state and evidence, not only a score"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Artifact state",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "artifact and failure fingerprints"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Progress evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A flat score can conceal"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is the next attempt repeating the same barrier?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "repeated ineffective approaches"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "The worker cannot grant itself missing authority",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The worker cannot recover"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Stop + handoff",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "preserve the diagnostic"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "anatomy-state-stopping"
        }
      ]
    },
    {
      "id": "runner",
      "title": "Test the runner as well as the artifact",
      "question": "Can the workflow fail safely when its own assumptions break?",
      "outcome": "Distinguish an illustrative runner from enforced behavior through controlled tests.",
      "beats": [
        {
          "id": "anatomy-runner-tests",
          "role": "worked-example",
          "title": "Challenge the runtime with controlled failures",
          "speech": "Use a fake agent and oracle with controlled costs, delays, and results to test the runner. Set the remaining budget to zero and confirm that no new call starts. Simulate a hung dependency and observe bounded timeout behavior. Cancel between two steps and verify that the second step is not dispatched. Return a successful process result with an empty test set and confirm that it cannot certify the artifact. Change the artifact after a passing check and confirm that the old verdict becomes stale. Finally, alternate two artifact states with matching failure patterns and inspect the stop decision. These tests exercise the runtime contract, separate from tests of the generated product. They should observe actual admissions, recorded state, and terminal results instead of merely checking that a configuration field contains the expected value.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Observe enforcement under controlled failure"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "No new admission",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "no new call starts"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Bounded execution",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "bounded timeout behavior"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What happens when verification is empty?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "an empty test set"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Current evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "the old verdict becomes stale"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Test observed behavior, not configuration labels",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "observe actual admissions"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "anatomy-runner-tests"
        },
        {
          "id": "anatomy-kenji-resolution",
          "role": "worked-example",
          "title": "Deliver the dependency barrier as a useful result",
          "speech": "Trace the repaired workflow through Kenji's difficult case. Discovery identifies the failure pattern and the restriction on dependency edits. The plan proposes an allowed investigation. Execution produces a candidate and a diagnostic. Verification shows that the current candidate does not satisfy all required behavior. The runtime records the repeated state, remaining budget, and missing capability. It stops further ineffective mutations and prepares a handoff containing the current artifact, observed failures, attempted approaches, and the specific decision needed. A human or another authorized process can then decide whether to change the dependency. Notification uses the configured channel only when that communication is authorized. The worker has not completed the repair, and the report must say so. It has completed a bounded investigation that makes the next decision easier and preserves the evidence needed to continue.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Evidence → bounded stop → authorized continuation"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Failure evidence",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Discovery identifies the failure pattern"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Bounded stop",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "It stops further ineffective mutations"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "It stops further ineffective mutations"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Handoff",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "prepares a handoff"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "prepares a handoff"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which specific decision would unblock useful work?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "the specific decision needed"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Report the repair as incomplete",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "The worker has not completed the repair"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "anatomy-kenji-resolution"
        }
      ]
    },
    {
      "id": "transfer",
      "title": "Deliver the result and its unresolved limits",
      "question": "What should another operator know when the loop stops?",
      "outcome": "Produce a useful handoff and apply the complete contract to a real workflow.",
      "beats": [
        {
          "id": "anatomy-transfer-contract",
          "role": "transfer",
          "title": "Implement one enforceable contract",
          "speech": "Choose a recurring workflow and write specific values for its goal, oracle, budget, stopping behavior, and escalation path. Name the component that enforces each field. Keep the implementation small enough to inspect. A document workflow may need a parser and a bounded revision step; a consequential external mutation needs additional authorization and recovery controls. Run a known-good case, a plausible wrong artifact, and a case with missing evidence. Then test the runtime itself with cancellation and an exhausted allowance. Keep the useful artifact separate from its acceptance status, and retain the reason the process stopped. Ask another operator to resume from the handoff without relying on your private recollection. If the handoff does not identify the current version, unresolved criterion, and required next decision, improve that record before adding more autonomy.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Make each contract field observable"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Concrete contract",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "write specific values"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Enforcing component",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Name the component"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Preserve the artifact and its acceptance status",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Keep the useful artifact separate"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Resumable evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Ask another operator to resume"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Can another operator continue from the record?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "without relying on your private recollection"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "anatomy-transfer-contract"
        },
        {
          "id": "anatomy-recap",
          "role": "reflect",
          "title": "Remember the contract and its enforcement",
          "speech": "Connect observation to a justified action. Keep the plan revisable and the acceptance constraints authoritative. Bind verdicts to the current artifact and actual checks. Enforce resource limits before admitting work, then reconcile usage. Stop and hand off with evidence when progress, authority, or verification is missing. Those are five durable principles. Remember: goal, oracle, budget, stop, escalation. The five stages explain the flow of work; the supporting components serve specific needs; the runner makes the contract real. An illustrative data structure does not prove that any of those controls operates. Discuss next: which rule in your current workflow exists only in a prompt? What controlled failure would demonstrate that its runtime actually enforces the rule? Apply the method to one small workflow and show both its successful path and its useful incomplete result.",
          "boardActions": [
            {
              "action": "clear",
              "title": "A contract becomes useful through enforced behavior"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Observe + act",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Connect observation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Current evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Bind verdicts"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Limits + handoff",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Enforce resource limits"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: goal → oracle → budget → stop → escalation",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: prompt-only rule? Enforcement test?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "anatomy-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "7afad4b50cd13bd4d22045e0c2abc40d71d8d19e96edd2bc8a8cc76602c7d103"
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
