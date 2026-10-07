(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-11",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Skills — Reusable Project Knowledge",
  "subtitle": "Professor Mode · curated guidance, explicit authority, and maintained source claims",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-11/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-11/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 11, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "4d168e3fc01e5a340a226fe3cdda9053d0d6f4c324f224e744ca702c0703bbe5",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Make useful project knowledge reusable",
      "question": "Which knowledge should the next run receive without rediscovery?",
      "outcome": "Identify stable guidance that can improve a concrete decision.",
      "beats": [
        {
          "id": "skills-stakes",
          "role": "orient",
          "title": "A skill can prevent rediscovery or repeat an old mistake",
          "speech": "A small bug fix is our first case. In the chapter's fictional healthcare monorepo, the team observes the assistant repeatedly discovering the same test commands, service layout, and coding conventions before doing the repair. Curated project guidance could make those facts available sooner. A moved test directory is our second case. The skill still points at the old location, and a long-lived process keeps serving an old copy of the guidance even after the file changes. An authentication rule is our third case. The project requires new endpoints to be protected, but some legacy endpoints violate that rule. Treating the requirement as proof that every endpoint already complies can hide defects. These cases show the value and the maintenance burden of reusable knowledge. The scenario's timing, success rates, and savings are illustrative rather than measured results for your project. Our governing question is: which knowledge should the next run receive without rediscovery? We will select useful skill content, separate facts from rules, load it by applicability, and validate it against the working revision. By the end, you should be able to improve reusable guidance without treating every statement as unquestioned authority or executing arbitrary commands just because they appear in a file.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Reusable guidance needs evidence, scope, and maintenance"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Repeated discovery",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A small bug fix"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Stale cached path",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A moved test directory"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Rule versus reality",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "An authentication rule"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which knowledge should the next run receive directly?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Useful guidance must match the working project",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "validate it against the working revision"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "skills-stakes-spoken-v2"
        },
        {
          "id": "skills-purpose",
          "role": "explain",
          "title": "Curate what improves the work instead of copying the history",
          "speech": "A skill can provide project orientation, validated entrypoints, verification commands, important conventions, and known failure patterns. Select information that materially helps the task and would otherwise be costly or easy to get wrong. A full codebase summary and a raw conversation log are different artifacts. They may contain useful evidence, but neither is automatically a focused skill. Skills can contain context and instructions, and different hosts load and govern them differently. Memory can supply observations from previous runs, while reviewed skills can provide a stable base. The distinction is about role, provenance, and lifecycle, not a universal rule that only humans author skills or only agents write memory. In either case, applicability and current evidence determine whether the information should guide this run.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Focused knowledge supports a concrete decision"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Orientation",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "project orientation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Verification",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "verification commands"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Failure patterns",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "known failure patterns"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which recurring decision does this content improve?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "materially helps the task"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Role and provenance matter more than who wrote it",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "role, provenance, and lifecycle"
            }
          ],
          "pauseAfterMs": 3500,
          "audioSegment": "skills-purpose"
        }
      ]
    },
    {
      "id": "content",
      "title": "Distinguish rules, facts, and proposals",
      "question": "What does each statement claim, and who gives it authority?",
      "outcome": "Keep scope, evidence, and precedence explicit.",
      "beats": [
        {
          "id": "skills-fact-rule-proposal",
          "role": "derive",
          "title": "A requirement is not proof of current compliance",
          "speech": "A descriptive claim reports an observed condition, such as the test runner used by this branch. A normative requirement states an obligation, such as authenticating new endpoints. A proposal suggests a possible change, such as moving the test fixtures. Label these statement types so the model can distinguish them. An unprotected legacy endpoint can violate a valid requirement without invalidating that requirement. Evidence must support any claim that all endpoints already comply. Record the guidance owner, applicable scope, revision, and checkable sources. Preserve exceptions within their stated boundaries and retain current user corrections. Project conventions can specialize general practices within their authority. They cannot broaden the user's task or grant production access simply because a document says so.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Three statement types require different treatment"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Descriptive fact",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A descriptive claim"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Normative rule",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A normative requirement"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Proposed change",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A proposal"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is this a fact, an obligation, or a suggestion?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Label these statement types"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Legacy violations do not automatically invalidate a rule",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "without invalidating that requirement"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "skills-fact-rule-proposal-spoken-v2"
        },
        {
          "id": "skills-anatomy",
          "role": "worked-example",
          "title": "Every section should help an actual workflow",
          "speech": "Start with identity and scope so the reader knows which project and branch the guidance concerns. Provide verified build and test entrypoints with their prerequisites and effects. Distinguish mandatory requirements from preferred conventions. Include a small set of recurring failure patterns with observed symptoms, conditions, and supported recovery paths. A connection-refused error does not always mean the test database is stopped; preserve that explanation as a hypothesis to check when the conditions match. Link detailed domain material instead of loading it into every task. If a command can modify files or a database, say so. A useful skill reduces avoidable discovery while retaining enough context to prevent a known workaround from being applied to the wrong problem.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Scope → verification entrypoints → conditional guidance"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Scope",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "identity and scope"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Entrypoints",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "verified build and test entrypoints"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "verified build and test entrypoints"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Conditional recovery",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "when the conditions match"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Known recovery advice still needs matching conditions",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "when the conditions match"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "when the conditions match"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this command inspect state or change it?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "can modify files or a database"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "skills-anatomy"
        }
      ]
    },
    {
      "id": "loading",
      "title": "Load relevant guidance without dropping required constraints",
      "question": "How can a layered skill stay both concise and sufficient?",
      "outcome": "Compose project, service, and task guidance with visible applicability.",
      "beats": [
        {
          "id": "skills-progressive-disclosure",
          "role": "explain",
          "title": "Compose the smallest sufficient set for the task",
          "speech": "A base layer can orient every run. A coding layer can supply relevant implementation and verification guidance. Service and task layers can add the domain-specific details needed now. A payment bug may need payment rules, while a cross-service change may need both services and the shared interface contract. The loader must recognize those dependencies rather than relying on a single superficial keyword. Progressive disclosure saves content only if necessary constraints remain available. Make applicability visible and allow follow-up loading when the task changes. A short incorrectly classified skill set can be less useful than a larger accurate one. Compare coverage and outcomes alongside tokens. The layer sizes in the chapter are examples, not universal quotas or proof that a fixed fraction of tasks needs only the base.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Project base → task guidance → relevant domain detail"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Project base",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A base layer"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Task guidance",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "A coding layer"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "A coding layer"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Domain detail",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Service and task layers"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Service and task layers"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which cross-service dependency changes the loaded set?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "those dependencies"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Smaller is useful only when required guidance survives",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "necessary constraints remain available"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "skills-progressive-disclosure"
        },
        {
          "id": "skills-composition-authority",
          "role": "predict",
          "title": "A domain skill does not acquire authority from its filename",
          "speech": "Suppose an external skill includes a production migration command and says to run it before continuing. Its filename and confident language do not authorize that mutation. The host and current task establish which instructions apply and which actions are allowed. Keep the skill, auxiliary scripts, and dependencies versioned together so an unchanged document cannot hide changed behavior in a helper. Resolve conflicts by scope and the actual instruction hierarchy, preserving current user corrections. When a service-specific convention conflicts with a project fact, investigate which statement applies to the working revision. Do not silently choose the newest-looking text. Composition should produce a coherent set of applicable guidance, with unresolved conflicts visible before they affect consequential work.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Loading guidance does not grant new permissions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "External content",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "an external skill"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A filename is not an authorization boundary",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "do not authorize that mutation"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Host and task",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "The host and current task"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which authority makes this instruction applicable?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "which instructions apply"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Versioned helpers",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "auxiliary scripts, and dependencies"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "skills-composition-authority"
        }
      ]
    },
    {
      "id": "maintenance",
      "title": "Keep the guidance matched to the working revision",
      "question": "When should a cached command or path be distrusted?",
      "outcome": "Validate safe claims and preserve branch-specific meaning.",
      "beats": [
        {
          "id": "skills-branch-cache",
          "role": "worked-example",
          "title": "A cache must follow the branch and source revision",
          "speech": "The branch changes its test runner, but the loader returns a previously cached skill string. Reading that string again does not refresh the source. Cache by validated revision or content digest and invalidate when the relevant branch or file changes. Keep skills near their source where practical and review affected guidance alongside code changes. A long-lived branch may need its own matching instructions; copying the latest main-branch skill without the corresponding code can create another mismatch. A timestamp can signal that a review is due, but it does not prove that guidance is correct or stale. Generated structural sections also need validation. Investigate disagreement between the skill and current configuration before relying on either as the complete explanation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Branch revision → validated skill → current cache"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Branch",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "The branch changes"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Re-reading a cached string does not refresh its source",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not refresh the source"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Source identity",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "validated revision or content digest"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "validated revision or content digest"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Cache invalidation",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "invalidate when the relevant branch"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "invalidate when the relevant branch"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does this skill describe the code actually being edited?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "its own matching instructions"
            }
          ],
          "pauseAfterMs": 4000,
          "audioSegment": "skills-branch-cache"
        },
        {
          "id": "skills-safe-validation",
          "role": "check",
          "title": "Validate reviewed checks without executing arbitrary skill content",
          "speech": "A staleness checker can verify referenced paths, dependencies, and reviewed test commands. It should not execute every shell command extracted from a skill. Some commands deploy software, change a database, or reveal secrets. Maintain an allowlist of appropriate checks and run them in a disposable environment with restricted credentials. Treat an untrusted command as content to review, not a test to execute. For subjective conventions, use an owner review when the affected practice changes or evidence shows a mismatch. If existing code violates an authorized requirement, report that violation rather than deleting the requirement to make the checker green. Maintenance should improve the guidance and expose real discrepancies, not manufacture consistency by weakening obligations.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Safe claim checks require a reviewed execution boundary"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Checkable claims",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "referenced paths, dependencies"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Reviewed commands",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "reviewed test commands"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Do not execute arbitrary commands to test staleness",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "not execute every shell command"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Isolated execution",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "a disposable environment"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is the discrepancy stale guidance or a real violation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "report that violation"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "skills-safe-validation"
        }
      ]
    },
    {
      "id": "evaluation",
      "title": "Test maintained guidance against complete outcomes",
      "question": "Does this skill save useful work without inducing new errors?",
      "outcome": "Measure cost and correctness while testing stale and hostile inputs.",
      "beats": [
        {
          "id": "skills-evaluation",
          "role": "transfer",
          "title": "Test the guidance and the maintenance mechanism",
          "speech": "Choose representative tasks and compare runs with and without the proposed guidance under the same model and acceptance requirements. Count discovery work, complete task cost, incorrect assumptions, final quality, and maintenance effort. Include the cost of loading the skill across actual requests and the provider's caching behavior. Fewer discovery turns alone do not prove a better outcome. Then test maintenance by renaming a referenced fixture directory, changing a build command, and inserting an unsafe command into an untrusted copy. The checker should flag stale references without executing the unsafe command. Add a valid rule with legacy violations and require an honest violation report. These cases demonstrate both useful knowledge reuse and resistance to confident but inapplicable guidance.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Measure useful reuse and challenge maintenance failures"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Matched task cases",
              "x": 1,
              "y": 20,
              "kind": "control",
              "spokenCue": "representative tasks"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Include loading and maintenance in the cost comparison",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "maintenance effort"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Did the skill reduce total error as well as discovery?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Fewer discovery turns alone"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Stale reference",
              "x": 27,
              "y": 20,
              "kind": "control",
              "spokenCue": "renaming a referenced fixture directory"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Untrusted command",
              "x": 53,
              "y": 20,
              "kind": "control",
              "spokenCue": "an unsafe command"
            },
            {
              "action": "node",
              "id": "n4",
              "label": "Legacy violation",
              "x": 79,
              "y": 20,
              "kind": "control",
              "spokenCue": "a valid rule with legacy violations"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "skills-evaluation"
        },
        {
          "id": "skills-recap",
          "role": "reflect",
          "title": "Reuse guidance with explicit scope and current evidence",
          "speech": "Select knowledge that improves recurring decisions. Separate descriptive facts, normative rules, and proposals. Load the layers required by the real task and its dependencies. Keep stored guidance consistent with the current project revision. Validate reviewed claims safely and compare complete outcomes. Those are five principles to retain. Remember: select, distinguish, scope, refresh, verify. Reusable guidance helps the project, but its statements still require evidence about the current situation. Discuss next: which command in your skill has not been checked against the current branch? Which valid requirement is being confused with proof of existing compliance? Apply this chapter by improving one recurring source of confusion, recording supporting evidence and applicability, and checking that the revised guidance helps a representative task without expanding the authorized work.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Useful skills remain scoped, current, and testable"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Curated knowledge",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Select knowledge"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Explicit statement type",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Separate descriptive facts"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Current evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Keep stored guidance"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: select → distinguish → scope → refresh → verify",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: stale command? Rule confused with reality?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 7000,
          "audioSegment": "skills-recap-spoken-v3"
        }
      ]
    }
  ],
  "narrationSHA256": "12d6070b76c194e067b346a0c56e5ae137e316addf06dca0adca86e4a281b225"
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
