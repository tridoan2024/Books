(function () {
  "use strict";
  var lesson = {
  "id": "agentic-ai-engineering-v1-chapter-35",
  "version": "professor-v1",
  "audioVersion": "natural-v1",
  "generation": "v1",
  "title": "Case Study — The Research Loop",
  "subtitle": "Professor Mode · Claim scope, evidence status, independent origins, and faithful synthesis",
  "audioPlaybackRate": 1,
  "audioProfile": {
    "model": "gpt-realtime-2.1",
    "voice": "marin",
    "speed": 0.94,
    "instructionsSHA256": "afd863808384e348e0bb69796c8268bf6642bad3902a44a78a0ace728481e802"
  },
  "audioRelease": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-35/natural-v1/current.json",
  "audioReleaseScript": "../assets/teacher/audio-cache/agentic-ai-engineering-v1-chapter-35/natural-v1/current.js",
  "design": {
    "frameworkVersion": "professor-v2",
    "method": "stakes-cases-problem-map-derive-test-transfer-recap",
    "source": "Chapter 35, Agentic AI Engineering v1, revised Markdown edition",
    "sourceSHA256": "75bba61438b8ce4e1784275cb9512769f8bbaccb6358225eaf7380cbf3857114",
    "sourceReviewed": "2026-10-07",
    "timing": "spoken-cues-bound-to-verified-word-alignment"
  },
  "units": [
    {
      "id": "stakes",
      "title": "Ask what the source actually establishes",
      "question": "Does finding the same sentence verify the claim?",
      "outcome": "Preserve assertion status, scope, and applicability.",
      "beats": [
        {
          "id": "research-stakes",
          "role": "orient",
          "title": "Textual presence is not the same as factual support",
          "speech": "A hypothetical vulnerability reported as real is our first case. In the chapter's fictional story, a research system extracts an invented vulnerability identifier from a blog paragraph beginning with imagine if. Its checker finds the same sentence on the page and mistakenly accepts an unqualified factual claim. Three websites repeating one original post are our second case. Their agreement looks like corroboration until the citation chain reveals a shared origin. A database benchmark is our third case. The reported result may be accurate for its tested hardware and workload while providing little evidence about a different application. These scenarios illustrate source-grounding failures, not actual vulnerability disclosures or measured research performance. Their common mechanism is loss of status, scope, or provenance between source and conclusion. Our governing question is: what does the source actually establish? We will frame the decision, retrieve qualified passages, distinguish facts from hypothetical and attributed claims, reconcile disagreement, and inspect the final synthesis. By the end, you should be able to give a traceable answer with explicit limits and identify when a local measurement or expert judgment is still needed.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Support requires source status, scope, and provenance"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Hypothetical claim",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A hypothetical vulnerability"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Matching words alone do not establish an unqualified factual claim",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "mistakenly accepts an unqualified factual claim"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Shared origin",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Three websites repeating"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Wrong applicability",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "A database benchmark"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What does the source actually establish?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Our governing question"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "research-stakes"
        },
        {
          "id": "research-grounding-boundary",
          "role": "derive",
          "title": "A well-sourced claim can still be false",
          "speech": "Grounding checks whether the source supports the claim as written. It does not guarantee that the source itself is correct. An authoritative document can be outdated for the deployed version, and several sources can inherit the same mistake. Distinguish a direct assertion, a reported claim, an opinion, a hypothetical, and your own inference. Each can be useful when labeled accurately. For example, a vendor reports a performance improvement is a narrower statement than the method improves performance generally. Source prestige cannot repair that change in scope. A numerical evidence score is a rubric result, not a probability that the conclusion is true unless it has been calibrated for that interpretation.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Grounding verifies support for a scoped claim"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Applicability",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "deployed version"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Assertion status",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "a direct assertion"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Inference",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "your own inference"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the conclusion preserve the source’s population and conditions?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "change in scope"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A rubric score is not automatically a calibrated truth probability",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "A numerical evidence score"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "research-grounding-boundary"
        }
      ]
    },
    {
      "id": "frame",
      "title": "Build an evidence plan for the decision",
      "question": "Which uncertainty can another source resolve?",
      "outcome": "Frame material questions and retrieve the relevant qualified passage.",
      "beats": [
        {
          "id": "research-question-plan",
          "role": "derive",
          "title": "Frame the evidence needed for the actual decision",
          "speech": "A database choice for a small internal tool involves workload, operational requirements, deployment, and relevant features. Break it into material questions whose answers could change the decision. Do not multiply research threads merely because more headings are possible. Match source type to claim: documentation for supported version behavior, measurements for tested performance, and practitioner reports for bounded experience. Search for counterevidence as well as confirming sources. A retrieval-augmented system can already include iteration and verification; the architecture label does not determine quality. Add another research step when a concrete evidence gap justifies it, and reframe the question if the available evidence shows that the original framing was wrong.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Decision → material questions → targeted evidence"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Decision",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A database choice"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Questions",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "material questions"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "material questions"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which unanswered question could change the recommendation?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "could change the decision"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Match source type to claim"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Match source type to claim"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Iteration is justified by an evidence gap, not an architecture label",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "concrete evidence gap"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "research-question-plan"
        },
        {
          "id": "research-passage-provenance",
          "role": "worked-example",
          "title": "Retrieve the sentence together with its qualifications",
          "speech": "For the hypothetical vulnerability, retrieve the paragraph containing the identifier and its surrounding framing. Preserve the words that establish it as an imagined example. Store the source locator, relevant excerpt, content revision or hash, dates, product version, and claim status. A search snippet or the first few thousand characters of a page may omit the decisive qualifier. Tables need headings and footnotes; diagrams may require direct inspection. If extraction misses necessary evidence, label the gap instead of passing the claim. The repaired report removes the unqualified vulnerability assertion and checks the appropriate primary advisory source. Failure to confirm an identifier is not proof that no vulnerability exists.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Relevant passage → surrounding qualification → scoped claim record"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Passage",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "retrieve the paragraph"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Qualification",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "surrounding framing"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "surrounding framing"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Claim record",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Store the source locator"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Store the source locator"
            },
            {
              "action": "note",
              "id": "question",
              "text": "What nearby phrase changes the status of this sentence?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "decisive qualifier"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "A missing extraction or inaccessible source remains a visible evidence gap",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "label the gap"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "research-passage-provenance"
        }
      ]
    },
    {
      "id": "verify",
      "title": "Evaluate claims without borrowing extractor confidence",
      "question": "Is the claim supported as written?",
      "outcome": "Separate presence, assertion status, authority, and missing context.",
      "beats": [
        {
          "id": "research-verifier",
          "role": "derive",
          "title": "Verify the claim in a focused evidence context",
          "speech": "Give the verifier the exact claim and sufficient source context, without the extractor's persuasive explanation or confidence score. Check whether the passage supports the proposition, how the source presents it, and whether its authority and conditions fit the claim type. Isolation reduces direct anchoring from the maker's narrative, but shared models or evidence can still produce correlated mistakes. Use structured verdicts and validate their schema. Malformed output or missing context is inconclusive. Calibrate semantic judgments against independently labeled examples. A source saying the opposite with similar vocabulary should fail an unqualified positive claim, while a careful paraphrase can be supported without matching every word.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Verifier: proposition support + status + applicable authority"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Support",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "supports the proposition"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Status",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "how the source presents it"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Applicability",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "conditions fit the claim type"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Missing context and malformed verdicts are inconclusive",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Malformed output or missing context"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Would the verifier detect negation or lost qualification?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "source saying the opposite"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "research-verifier"
        },
        {
          "id": "research-mechanical-checks",
          "role": "predict",
          "title": "Predict what a successful HTTP response establishes",
          "speech": "A citation URL returns a successful status. Predict whether that means its source supports the claim. It may be a login page, a soft not-found page, or unrelated content. Conversely, an access-denied response can hide a real source that the current tool cannot read. URL syntax, status, citation markers, and basic format checks are useful mechanical filters. Lexical similarity helps locate passages but does not establish entailment. Semantic review must inspect the actual material and its context. Keep the original access failure visible, preserve already-supported findings, and choose a justified alternative source or report the gap. Do not manufacture a replacement citation to make the bibliography look complete.",
          "boardActions": [
            {
              "action": "clear",
              "title": "URL syntax, access, content relevance, and claim support differ"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "HTTP response",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "A citation URL returns"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Is this the source itself, a login page, or unrelated content?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Predict whether"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Actual content",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "unrelated content"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "HTTP success does not prove relevant evidence or entailment",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "does not establish entailment"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Semantic support",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Semantic review must inspect"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "research-mechanical-checks"
        }
      ]
    },
    {
      "id": "reconcile",
      "title": "Distinguish independent evidence and conditional disagreement",
      "question": "Are these three sources really one origin?",
      "outcome": "Trace provenance and test applicability before synthesizing.",
      "beats": [
        {
          "id": "research-independent-origins",
          "role": "derive",
          "title": "Count origins rather than copies",
          "speech": "Trace attributions and citations to identify the original documentation, experiment, observation, or assertion. Several secondary pages repeating one origin do not provide several independent confirmations. Record shared origins even when each page is useful for discovery. Source independence, directness, authority, freshness, and applicability answer different questions; do not collapse them into raw link count. Newer is also not automatically better. An older specification may govern the deployed release, while a recent benchmark may use an irrelevant workload. Decide sufficiency from the claim's consequence and uncertainty. One primary passage can settle a narrow interface fact, while a broad performance recommendation may need additional evidence or measurement.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Secondary sources → original evidence → qualified corroboration"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Which distinct observation supports each supposed corroborating source?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Trace attributions"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Secondary pages",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Several secondary pages"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Origin",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "one origin"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "one origin"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Several copies do not become several independent observations",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "do not provide several independent confirmations"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Qualified evidence",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Source independence, directness"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "Source independence, directness"
            }
          ],
          "pauseAfterMs": 4500,
          "audioSegment": "research-independent-origins"
        },
        {
          "id": "research-database-example",
          "role": "worked-example",
          "title": "Ten users do not imply ten continuously active writers",
          "speech": "One source describes a database's single-writer constraint; another reports acceptable latency for a small application. Those statements may be compatible under different workloads. Preserve both and inspect transaction length, driver configuration, data size, hardware, and concurrency. Ten simultaneous users do not necessarily generate ten continuously active write transactions. A language binding's timeout default is not automatically a universal database default. If the recommendation depends on contention in the target application, run a representative local workload test rather than gathering more copies of a generic claim. State what the documentation establishes, what the benchmark actually measured, and which deployment question remains unanswered.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Concurrency claims depend on workload and configuration"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Documented behavior",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "single-writer constraint"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Measured workload",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "acceptable latency"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Users, active transactions, and driver defaults are different quantities",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Ten simultaneous users"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does the measured workload represent this application?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "recommendation depends on contention"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Target application",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "representative local workload test"
            }
          ],
          "pauseAfterMs": 5000,
          "audioSegment": "research-database-example"
        }
      ]
    },
    {
      "id": "deliver",
      "title": "Stop with supported conclusions and visible gaps",
      "question": "What does the final recommendation add beyond its evidence?",
      "outcome": "Reject unsupported synthesis and preserve unresolved access or measurement needs.",
      "beats": [
        {
          "id": "research-synthesis-stop",
          "role": "transfer",
          "title": "The final answer must not outrun its evidence",
          "speech": "Link each material factual statement in the synthesis to its supporting claim record. Preserve conditions, attribution, unresolved contradictions, and limits. If two sources disagree, investigate whether versions or circumstances explain the difference; otherwise show the disagreement. Do not suppress counterevidence to produce a cleaner recommendation. Stop once the requested decision has adequate support for its stakes, or report the specific unresolved gap when the authorized budget cannot resolve it. Two empty searches through a failing provider are not evidence that the topic contains no answer. Test the pipeline with facts, negations, hypotheticals, vendor reports, old versions, and copied origins. Verify that unsupported synthesis is rejected.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Verified claims → scoped synthesis → sufficiency or explicit gap"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Claim records",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "supporting claim record"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Synthesis",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Preserve conditions"
            },
            {
              "action": "edge",
              "from": "n1",
              "to": "n2",
              "spokenCue": "Preserve conditions"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "Unresolved contradictions belong in the answer",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "show the disagreement"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Decision",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "adequate support for its stakes"
            },
            {
              "action": "edge",
              "from": "n2",
              "to": "n3",
              "spokenCue": "adequate support for its stakes"
            },
            {
              "action": "note",
              "id": "question",
              "text": "Does any conclusion add a fact absent from the verified evidence?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "unsupported synthesis is rejected"
            }
          ],
          "pauseAfterMs": 5500,
          "audioSegment": "research-synthesis-stop"
        },
        {
          "id": "research-recap",
          "role": "reflect",
          "title": "Research quality comes from preserving the evidence relationship",
          "speech": "Frame the decision and its material uncertainties. Retrieve relevant passages with surrounding qualifications and durable source identity. Check support, assertion status, and applicability separately. Distinguish independent origins from repeated copies. Reconcile contradictions without hiding disagreement, and keep numerical evidence scores in their proper role. Synthesize only what the verified evidence supports, with specific unresolved gaps. Remember: frame, locate, qualify, verify, reconcile, synthesize. Apply that sequence to a recommendation you recently relied on. Discuss next: which citation actually presents a hypothetical or attributed claim? Which conclusion needs a local measurement instead of another source? Next we examine operational loops where actions change running systems.",
          "boardActions": [
            {
              "action": "clear",
              "title": "Traceability requires claim scope, source status, and visible uncertainty"
            },
            {
              "action": "node",
              "id": "n1",
              "label": "Scoped question",
              "x": 4,
              "y": 20,
              "kind": "control",
              "spokenCue": "Frame the decision"
            },
            {
              "action": "node",
              "id": "n2",
              "label": "Qualified evidence",
              "x": 40,
              "y": 20,
              "kind": "control",
              "spokenCue": "Check support"
            },
            {
              "action": "node",
              "id": "n3",
              "label": "Faithful synthesis",
              "x": 76,
              "y": 20,
              "kind": "control",
              "spokenCue": "Synthesize only"
            },
            {
              "action": "note",
              "id": "takeaway",
              "text": "REMEMBER: frame → locate → qualify → verify → reconcile → synthesize",
              "x": 3,
              "y": 62,
              "w": 44,
              "kind": "principle",
              "spokenCue": "Remember"
            },
            {
              "action": "note",
              "id": "question",
              "text": "DISCUSS NEXT: hypothetical citation? Missing local measurement?",
              "x": 52,
              "y": 62,
              "w": 44,
              "kind": "question",
              "spokenCue": "Discuss next"
            }
          ],
          "pauseAfterMs": 6500,
          "audioSegment": "research-recap"
        }
      ]
    }
  ],
  "narrationSHA256": "443fab9c551c16477e95951cf79a1c54a5f0f4f498f89f5966b63687d2378cb3"
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
