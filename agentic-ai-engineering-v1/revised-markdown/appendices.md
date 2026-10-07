# Appendices

> **Edition note.** These are preserved teaching templates and historical illustrative listings, not installed skills, a certified SDK, or evidence of a production deployment. Model names, prices, thresholds, and organization stories are illustrative unless separately sourced. Chapters [39](chapter-39.md), [40](chapter-40.md), and [41](chapter-41.md) supply the stronger execution, release, and authorization boundaries. Copying a template does not grant authority to publish, delete, or spend.

------------------------------------------------------------------------

## Appendix A: Loop Specification Template

Use this template when designing any new loop. Fill in every field — a missing field is a bug waiting to happen. The template records the five fields of the Loop Contract ([Chapter 3](chapter-03.md), *Anatomy of a Loop*) and exposes the decisions you must make about substrate, triggers, and economics before writing a line of harness code.

### A.1 The Template

``` yaml

# Loop Specification: [Name]
# Version: 1.0
# Author: [Name]
# Date: [YYYY-MM-DD]
# Status: [draft | review | approved | deployed]

meta:
  name: "[descriptive-kebab-case-name]"
  purpose: "[One sentence: what this loop produces as a verified artifact]"
  autonomy_level: "[Describe per-operation planning and action authority; use L0-L5 as shorthand]"  # Chapter 2
  domain: "[code | research | operations | content | security | data]"
  owner: "[Team or individual accountable for cost and correctness]"

loop_contract:
  goal:
    statement: "[Human-readable: what done looks like]"
    type: "[binary | threshold | convergent | comparative | composite]"
    acceptance:
      - "[Criterion 1 — must be machine-evaluable]"
      - "[Criterion 2]"
      - "[Criterion 3]"

  oracle:
    level_1_deterministic:
      checks:
        - "[e.g., pytest -x, ruff check, schema validation]"
      catches: "[What defect classes these can detect; record coverage limits]"
    level_2_property:
      checks:
        - "[e.g., hypothesis tests, contract tests, invariant assertions]"
      catches: "[What defect classes these can detect; record coverage limits]"
    level_3_rubric:
      rubric_file: "[path to rubric YAML/Markdown]"
      dimensions:
        - "[e.g., completeness, accuracy, clarity]"
    level_4_judge:
      model: "[Model used for judging]"
      criteria: "[What the judge evaluates]"
      isolation: true  # Checker must not share maker context (Ch 21)
    level_5_human:
      trigger: "[When human review is invoked]"
      sla: "[Expected turnaround time]"
    governing_rule: "Use the cheapest oracle that still discriminates."

  budget:
    max_iterations: N
    max_tokens: N
    max_wall_clock_s: N
    max_cost_usd: N.NN

  stop_conditions:
    success: "[Every required check passes on the current artifact; release approval remains separate]"
    no_progress: "[Last N iterations produced < X% score improvement]"
    oscillation: "[Same or equivalent state repeated within last N iterations]"
    budget: "[Stop before the next call exceeds an authorized limit; persist cumulative usage]"
    external_signal: "[Cancellation, revoked authority, changed input or safety signal]"
    inconclusive: "[Preserve useful work; identify missing evidence; do not claim success]"

  escalation_path:
    on_budget_exhaustion: "[Notify | Create ticket | Page on-call]"
    on_no_progress: "[Change approach within current authority | Request changed scope | Escalate]"
    on_safety_concern: "[Immediate halt + notify + preserve state]"
    report_includes: "[Diagnosis, attempts log, best result, recommendations]"

substrate:
  model:
    maker: "[Model for generation]"
    checker: "[Checker with isolated context; model diversity is optional, not independence proof]"
    lead: "[Model for orchestration, if fleet]"
  tools:
    - name: "[tool_name]"
      purpose: "[when and why used]"
      cost_per_call: "[token cost or API cost estimate]"
  skills:
    - file: "[skill_file.md]"
      provides: "[what project knowledge it encodes]"
  memory:
    types: "[episodic | semantic | procedural]"
    storage: "[file | database | hybrid]"
    consolidation: "[scheduled | on-demand | none]"

trigger:
  type: "[schedule | event | threshold | webhook | chained | manual]"
  specification: "[cron expression | event name | threshold condition]"
  idempotency: "[How duplicate triggers are handled]"
  cooldown_s: N
  retry_policy: "[max retries, backoff strategy]"

fleet:  # Omit if single-agent
  lead:
    model: "[model]"
    role: "[Decompose, coordinate, synthesize]"
  specialists:
    - name: "[specialist_name]"
      model: "[model]"
      scope: "[files/domain this specialist handles]"
      tools: "[available tools]"
  topology: "[hierarchy | pipeline | blackboard]"
  coordination: "[event-log | shared-filesystem | message-passing]"
  conflict_resolution: "[version-checked merge | explicit owner handoff | lead-arbitrates]"

verification:
  maker_checker_split: true
  checker_context_isolation: true
  adversarial_checking: false
  regression_gate: "[what must not regress between iterations]"

security:
  permission_scope: "[What the loop CAN do — enumerate positively]"
  forbidden_actions: "[What the loop MUST NOT do]"
  sandbox: "[container | VM | OS policy | none]; worktree is file organization only"
  approval_gates: "[Actions requiring human approval before execution]"
  blast_radius: "[Maximum damage if the loop fails catastrophically]"

economics:
  estimated_cost_per_run: "$N.NN [ESTIMATE]"
  estimated_attempts_to_pass: "N [ESTIMATE]"
  cost_per_verified_outcome: "$N.NN [ESTIMATE]"
  estimated_attempts_per_day: N
  estimated_accepted_outcomes_per_day: N  # Different denominator; state the forecast model
  monthly_cost: "$N,NNN [ESTIMATE]"
  human_baseline_cost: "$N.NN per equivalent task [ESTIMATE]"
  break_even_volume: "N runs/month [ESTIMATE]"
```

### A.2 Worked Example: Coding Loop

This illustrative specification expands the coding-loop scenario in [Chapter 34](chapter-34.md). It is a design template, not a deployed configuration or a complete implementation of every enforcement boundary.

``` yaml

# Loop Specification: PR-Ready Code Generation
# Version: 2.1
# Author: M. Chen
# Date: 2026-02-15
# Status: illustrative-design-not-deployed

meta:
  name: "pr-ready-codegen"
  purpose: "Produce a passing, linted, typed implementation from a GitHub issue description."
  autonomy_level: "L3"
  domain: "code"
  owner: "Platform Team"

loop_contract:
  goal:
    statement: "A branch with commits that implement the issue, passing CI, ready for human review."
    type: "binary"
    acceptance:
      - "All existing tests pass (no regressions)"
      - "New tests cover the changed behavior"
      - "pyright reports zero type errors on changed files"
      - "ruff check passes with zero warnings"
      - "Diff is scoped to the issue — no unrelated changes"

  oracle:
    level_1_deterministic:
      checks:
        - "pytest tests/ -x --tb=short"
        - "pyright src/"
        - "ruff check src/"
      catches: "Syntax errors, type mismatches, style violations, regressions"
    level_2_property:
      checks:
        - "pytest tests/property/ --hypothesis-seed=12345"  # Illustrative fixed integer seed; record actual failing seeds
        - "git diff --stat: changed files ⊆ expected scope"
      catches: "Edge-case logic bugs, scope creep"
    level_3_rubric:
      rubric_file: "evals/code_quality_rubric.yaml"
      dimensions:
        - "readability (naming, structure)"
        - "minimal diff (no unnecessary changes)"
        - "test quality (not just coverage — meaningful assertions)"
    level_4_judge:
      model: "claude-sonnet-4-20250514"
      criteria: "Architectural fit, idiomatic patterns, no security anti-patterns"
      isolation: true
    level_5_human:
      trigger: "Always — this loop produces PRs, not merges"
      sla: "4 hours during business hours"
    governing_rule: "Use the cheapest oracle that still discriminates."

  budget:
    max_iterations: 8
    max_tokens: 600000
    max_wall_clock_s: 900
    max_cost_usd: 4.50

  stop_conditions:
    success: "L1 + L2 pass; L3 score ≥ 0.8; L4 verdict = pass"
    no_progress: "Last 3 iterations: same failing test, no delta in oracle score"
    oscillation: "Same file reverted twice"
    budget: "Before dispatch, enforce remaining cumulative budget and deadline"
    external_signal: "Stop new actions on cancellation or revoked authority; reconcile in-flight effects"
    inconclusive: "Retain candidate with missing evidence; no passing verdict"

  escalation_path:
    on_budget_exhaustion: "Preserve a local diagnostic; open a draft PR or post only if separately authorized"
    on_no_progress: "Prepare diagnostic and route through the authorized issue-notification policy"
    on_safety_concern: "Halt new effects, preserve evidence, notify authorized security owner"
    report_includes: "Oracle scores per iteration, failing tests, best diff, token usage"

substrate:
  model:
    maker: "claude-sonnet-4-20250514"
    checker: "claude-sonnet-4-20250514 (separate context)"
    lead: null  # Single-agent, no fleet
  tools:
    - name: "bash"
      purpose: "Run tests, linters, type checks"
      cost_per_call: "~200 output tokens [ESTIMATE]"
    - name: "file_editor"
      purpose: "Read and write source files"
      cost_per_call: "~500 input tokens per read [ESTIMATE]"
    - name: "git"
      purpose: "Branch, commit, push"
      cost_per_call: "~100 output tokens [ESTIMATE]"
  skills:
    - file: "SKILL.md"
      provides: "Project architecture, build commands, naming conventions"
  memory:
    types: "episodic"
    storage: "file"
    consolidation: "scheduled (between-session dreaming)"

trigger:
  type: "event"
  specification: "GitHub issue labeled 'agent-ready'"
  idempotency: "Durable issue-intent key and receipt reconciliation; branch existence alone is insufficient"
  cooldown_s: 60
  retry_policy: "3 retries, exponential backoff starting at 30s"

fleet: null  # Single-agent

verification:
  maker_checker_split: true
  checker_context_isolation: true
  adversarial_checking: false
  regression_gate: "All pre-existing tests must continue to pass"

security:
  permission_scope: "Read/write within worktree; push to feature branch only"
  forbidden_actions: "Push to main; delete branches; modify CI config; access secrets"
  sandbox: "OS/container boundary plus scoped worktree; explicitly validate egress and credentials"
  approval_gates: "Merge requires human approval"
  blast_radius: "Bound permissions, credentials and egress; Git reversal cannot undo external effects"

economics:
  estimated_cost_per_run: "$1.80 [ILLUSTRATIVE INPUT: 5 iterations × assumed $0.36/iteration; not the separate D.2 workload or a vendor quote]"
  estimated_attempts_to_pass: "1.4 [ILLUSTRATIVE independent-attempt assumption; implies p=1/1.4≈71.43%, not exactly70%]"
  cost_per_verified_outcome: "$2.52 [ESTIMATE: $1.80 × 1.4]"
  estimated_accepted_outcomes_per_day: 12
  monthly_cost: "$907.20 [ILLUSTRATIVE: 12 accepted outcomes/day × 30 × $2.52; not 12 attempts/day]"
  human_baseline_cost: "$85.50 per equivalent task [ILLUSTRATIVE: 1.5 hr × $57/hr fully loaded]"
  break_even_volume: "Unknown until fixed costs, retained review effort, and equivalent accepted quality are specified"
```

### A.3 Worked Example: Research Loop

``` yaml

# Loop Specification: Literature Synthesis
# Version: 1.0
# Author: R. Park
# Date: 2026-03-20
# Status: illustrative-design-not-approved

meta:
  name: "lit-synthesis"
  purpose: "Produce a sourced briefing document synthesizing findings across 10-30 papers on a specified topic."
  autonomy_level: "L3"
  domain: "research"
  owner: "Research Ops"

loop_contract:
  goal:
    statement: "A 2,000-word briefing with claims attributed to specific papers, covering consensus, disagreements, and gaps."
    type: "composite"
    acceptance:
      - "Every factual claim has an inline citation to a retrievable source"
      - "Accounts for the entire corpus; explains exclusions and defines a justified coverage target"
      - "Reports disagreements and gaps when evidence supports them; does not invent them to satisfy a quota"
      - "Source identity and cited passage checked; URL/DOI resolution alone is insufficient"

  oracle:
    level_1_deterministic:
      checks:
        - "Resolve cited identifiers and check source identity; record access failures and coverage gaps"
        - "Word count within 1,800-2,200 range"
        - "Markdown structure valid (headers, citation format)"
      catches: "Dead links, format violations, length violations"
    level_2_property:
      checks:
        - "Distinct relevant papers reviewed meet the justified coverage target; citation repetition is not coverage"
        - "Each major section has the evidence needed for its actual claims; flag unsupported claims"
        - "Check source dependence and lineage; permit one-source claims when appropriately scoped"
      catches: "Shallow coverage, single-source dependence"
    level_3_rubric:
      rubric_file: "evals/research_quality_rubric.yaml"
      dimensions:
        - "synthesis (not just summarization — identifies patterns across sources)"
        - "accuracy (claims faithful to cited source)"
        - "completeness (major perspectives represented)"
        - "clarity (accessible to non-specialist reader)"
    level_4_judge:
      model: "claude-sonnet-4-20250514"
      criteria: "Are claims faithful to the cited papers? Are disagreements fairly represented?"
      isolation: true
    level_5_human:
      trigger: "Final review before distribution"
      sla: "24 hours"
    governing_rule: "Use the cheapest oracle that still discriminates."

  budget:
    max_iterations: 6
    max_tokens: 800000
    max_wall_clock_s: 600
    max_cost_usd: 6.00

  stop_conditions:
    success: "L1 pass; L2 pass; L3 score ≥ 0.75 on all dimensions; L4 verdict = pass"
    no_progress: "L3 score unchanged for 2 iterations"
    oscillation: "Same section rewritten with same score twice"
    budget: "Before dispatch, enforce remaining cumulative budget and deadline"
    external_signal: "Stop new actions on cancellation or revoked authority; reconcile in-flight effects"
    inconclusive: "Retain candidate with missing evidence; no passing verdict"

  escalation_path:
    on_budget_exhaustion: "Deliver best draft with [DRAFT — INCOMPLETE] header"
    on_no_progress: "Escalate to human researcher with gap analysis"
    on_safety_concern: "Halt — flag potential misinformation"
    report_includes: "Sources found, coverage map, rubric scores per iteration"

substrate:
  model:
    maker: "claude-sonnet-4-20250514"
    checker: "claude-sonnet-4-20250514 (separate context; rubric plus relevant source passages)"
    lead: null
  tools:
    - name: "web_search"
      purpose: "Discover papers, verify URLs"
      cost_per_call: "~300 tokens + search API cost [ESTIMATE]"
    - name: "web_fetch"
      purpose: "Retrieve paper abstracts and content"
      cost_per_call: "~2000 input tokens per fetch [ESTIMATE]"
    - name: "file_editor"
      purpose: "Write and revise the briefing document"
      cost_per_call: "~500 tokens [ESTIMATE]"
  skills:
    - file: "skills/research-methodology.md"
      provides: "Citation format, synthesis patterns, quality bar definitions"
  memory:
    types: "semantic"
    storage: "file"
    consolidation: "none"

trigger:
  type: "manual"
  specification: "Researcher submits topic + corpus via form"
  idempotency: "Stable request ID bound to requester, corpus revision and intent; similar topics can be distinct requests"
  cooldown_s: 300
  retry_policy: "2 retries, 60s backoff"

fleet: null

verification:
  maker_checker_split: true
  checker_context_isolation: true
  adversarial_checking: false
  regression_gate: "Citation validity must not regress between iterations"

security:
  permission_scope: "Read web; write to output directory only"
  forbidden_actions: "Access unauthorized databases; publish externally; bypass access controls or claim unread full text was reviewed"
  sandbox: "container"
  approval_gates: "Distribution requires human sign-off"
  blast_radius: "Bound distribution and access; incorrect analysis can still mislead downstream decisions or disclose sensitive data"

economics:
  estimated_cost_per_run: "$3.20 [ILLUSTRATIVE: 4 iterations × assumed $0.80/iteration; not a vendor quote]"
  estimated_attempts_to_pass: "1.2 [ILLUSTRATIVE independent-attempt assumption; implies p=1/1.2≈83.33%, not85%]"
  cost_per_verified_outcome: "$3.84 [ESTIMATE: $3.20 × 1.2]"
  estimated_accepted_outcomes_per_day: 3
  monthly_cost: "$345.60 [ILLUSTRATIVE: $3.84 × 3 accepted outcomes/day × 30 days]"
  human_baseline_cost: "$285 per equivalent task [ESTIMATE: 5 hr × $57/hr]"
  break_even_volume: "Unknown until fixed costs, retained review and equivalent accepted quality are included"
```

### A.4 Loop Spec Review Checklist

Use this when approving another engineer's loop specification. A spec that fails any item in the **Critical** section must be returned for revision.

**Critical — reject if missing:**

- [ ] Goal acceptance criteria are observable; judgment-dependent criteria have a rubric, accountable evaluator and uncertainty policy
- [ ] Applicable deterministic checks run; missing behavioral or semantic evidence is not replaced by a superficial format check
- \[ \] Budget has all four limits set (iterations, tokens, wall-clock, USD)
- [ ] Stop conditions cover success, no-progress, oscillation, budget, cancellation, revoked authority and inconclusive evidence
- [ ] Escalation has an owner, useful evidence and unresolved questions; further investigation may be necessary
- [ ] When model checking is required, maker and checker use separate contexts; shared evidence and biases remain possible
- \[ \] Security section enumerates permissions positively (allowlist, not blocklist)
- [ ] Blast radius is bounded; irreversible effects have explicit approval, reconciliation and separately authorized compensation paths

**Important — flag for discussion:**

- \[ \] Oracle hierarchy uses cheapest discriminating level (not jumping to L4 when L1 suffices)
- \[ \] Budget is justified (not copy-pasted defaults): does the cost make sense for the value produced?
- \[ \] Trigger has idempotency protection (duplicate events do not spawn duplicate runs)
- \[ \] Economics section shows positive ROI at planned volume
- \[ \] Memory/skill choices are justified (not loading 20K tokens of skill for a simple task)
- \[ \] Fleet topology is the simplest that serves the goal (no fleet when a single agent suffices)

**Style — improve but don't block:**

- \[ \] Goal statement readable by someone unfamiliar with the project
- \[ \] Skill files referenced actually exist in the repository
- [ ] Cost assumptions identify units and source/date when available; hypothetical rates are labeled as such, not as checked vendor prices
- \[ \] Version number incremented from prior approved spec

------------------------------------------------------------------------

## Appendix B: Oracle Catalog by Task Type

This is reference material for [Chapter 20](chapter-20.md), *The Hierarchy of Oracles*. For each common task type, the table recommends oracles at each level of the hierarchy, what each catches, and what it misses.

**Governing rule:** Use the cheapest oracle that still discriminates. Start at Level 1 and add higher levels only when lower levels leave a critical quality dimension uncovered.

**Illustrative cost assumptions, not checked vendor prices:** With $3/M input and $15/M output, 1,000 input plus 500 output tokens costs $0.0105. A 3,000-input/1,000-output evaluation costs $0.024 at those rates, or $0.12 at the separate assumed $15/M input and $75/M output rates. Human time at $57–85/hour for 15–60 minutes spans $14.25–85. Local tests can also incur material infrastructure and latency costs; none of these values is a guaranteed price per oracle level.

**Reading the catalog:** “Catches” means defect classes a suitably implemented check may detect, not complete coverage. The five levels are an editorial taxonomy, not a ranking of infallibility or cost. Several L2 rows below use invariant, metamorphic or contract checks rather than generative property-based testing. A rubric can be applied by a model or a human. Every evaluator can miss errors; incomplete evidence must remain inconclusive. Test source identity, artifact revision and relevant environment before reusing any result.

### Code Generation

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Compiler/interpreter passes; linter zero-warnings; type checker zero-errors; existing tests pass | Syntax errors, type mismatches, style violations, regressions | Logic correctness, architectural fit, performance |
| L2 Property-Based Tests | Hypothesis/QuickCheck on the generated code; invariant assertions; boundary-value generators | Edge-case bugs, off-by-one, null handling, integer overflow | Semantic correctness of the algorithm, readability |
| L3 Rubric Scoring | Rubric: naming quality, minimal diff, test meaningfulness, no dead code | Readability issues, unnecessary complexity, test quality problems | Subtle logic errors, security implications, UX fit |
| L4 Model Judge | Separate model evaluates: architectural fit, idiomatic patterns, security anti-patterns, correctness of algorithm | Design-level issues a machine cannot catch via testing | Novel security vulnerabilities, production performance under load |
| L5 Human Review | Engineer reviews PR for business logic, architectural direction, team conventions | Business-intent and architectural issues within reviewer expertise | Unseen edge cases, fatigue, incomplete context, correlated assumptions |

### Refactoring

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | All existing tests still pass; no behavior change (same outputs for same inputs); type checker passes | Regressions, interface breakage | Whether the refactoring actually improved anything |
| L2 Property-Based Tests | Performance benchmarks within tolerance (±5%); memory usage stable; API contract tests pass | Performance regressions, memory leaks, contract violations | Code clarity improvements (subjective) |
| L3 Rubric Scoring | Rubric: cyclomatic complexity reduced, coupling decreased, naming improved, no dead code introduced | Structural quality metrics | Whether the code is *actually* easier to maintain (context-dependent) |
| L4 Model Judge | Judge evaluates: is the refactored version genuinely clearer? Are abstractions well-placed? | Subtle quality improvements only a reader can assess | Team-specific preferences, historical context for "why it was this way" |
| L5 Human Review | Author of original code reviews for intent preservation | Intent changes and contextual business-rule violations | Forgotten assumptions, confirmation bias, unexercised behavior |

### Test Writing

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Tests compile; tests execute without error; coverage delta \> 0 on target files | Broken tests, zero-value tests (never run), coverage gaps | Whether tests are *meaningful* (a test that asserts `True` passes L1) |
| L2 Property-Based Tests | Mutation testing: generated tests catch ≥ 70% of injected mutants | Weak assertions, tests that pass regardless of implementation correctness | Over-testing (testing implementation details, brittle tests) |
| L3 Rubric Scoring | Rubric: test names describe behavior, each test has a single concern, setup is minimal, assertions are specific | Test quality and maintainability | Whether the *right* behaviors are being tested (requires domain knowledge) |
| L4 Model Judge | Judge evaluates: do these tests give confidence the code works? Are edge cases covered? | Completeness of behavioral coverage | Novel failure modes the judge cannot anticipate |
| L5 Human Review | Developer confirms tests match intended behavior | Mismatch between tests and intended behavior | Missing requirements, weak assertions or edge cases the reviewer overlooks |

### Research Synthesis

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Cited identifiers resolve to the intended sources; word count and Markdown structure checked; coverage explicitly reported | Broken identifiers, mismatched sources and format violations; counts alone do not establish coverage | Accuracy of claims, quality of synthesis |
| L2 Property-Based Tests | Check claim-to-passage support and distinct source lineage; justify source concentration; report genuine disagreements or their absence | Over-reliance on single source, missing perspective diversity | Whether synthesis is *faithful* to the sources |
| L3 Rubric Scoring | Rubric: synthesis vs. summarization, accuracy, completeness, clarity, identification of gaps | Quality of reasoning, depth of analysis | Factual errors requiring domain expertise |
| L4 Model Judge | Judge with relevant source passages and explicit full-text gaps: are claims faithful and disagreements fairly represented? | Misrepresentation, straw-manning, missing major perspectives | Subtle domain errors, emerging findings not yet in sources |
| L5 Human Review | Domain expert reads for accuracy and completeness | Domain nuance and source interpretation within the review scope | Unavailable evidence, expert disagreement and overlooked errors |

### Factual Claims (Q&A, Knowledge Base)

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Response cites a source; source exists; response length within bounds | Unsourced claims, missing attribution | Whether the claim is *true* |
| L2 Property-Based Tests | Claim consistency: same question asked differently produces compatible answers; no contradictions within corpus | Internal inconsistency, contradictions | Consistently wrong answers (hallucination) |
| L3 Rubric Scoring | Rubric: confidence calibration, hedging on uncertain claims, appropriate scope of answer | Overconfident wrong answers, scope creep | Subtle factual errors in specialized domains |
| L4 Model Judge | Judge with access to ground truth documents: is this factually correct? | Hallucination, distortion, outdated information | Errors in the ground truth documents themselves |
| L5 Human Review | Subject matter expert verifies | Factual errors detectable from the reviewed evidence | Errors in sources, specialist blind spots and unknown facts |

### Summarization

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Output length within target range; long verbatim spans checked for quotation, attribution and policy compliance | Length violations and potentially unsupported copying; overlap alone does not prove plagiarism | Quality of the summary |
| L2 Property-Based Tests | Key entity preservation: named entities in source appear in summary at rate ≥ threshold; no new entities introduced | Omission of key facts, hallucinated content | Whether the *most important* facts were selected |
| L3 Rubric Scoring | Rubric: faithfulness, coverage, conciseness, coherence | Overall quality across multiple dimensions | Subtle distortions of meaning |
| L4 Model Judge | Judge with access to source: does the summary faithfully represent the source without distortion? | Misrepresentation, spin, emphasis distortion | Evaluator bias toward verbose summaries |
| L5 Human Review | Intended audience member confirms utility | Audience-relevant omissions, emphasis and usefulness | Other audiences, subtle source distortion and incomplete review |

### Translation

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Output is in target language (language detection); length ratio within expected bounds for language pair; no untranslated segments | Wrong language, incomplete translation, obvious omissions | Translation quality |
| L2 Property-Based Tests | Round-trip consistency: translate A→B→A, measure semantic similarity ≥ threshold; terminology consistency across document | Meaning-altering errors caught by round-trip, inconsistent terminology | Nuance loss, cultural adaptation, register |
| L3 Rubric Scoring | Rubric: fluency, accuracy, terminology, style match to reference | Quality across multiple dimensions | Domain-specific terminology errors |
| L4 Model Judge | Bilingual judge evaluates: meaning preserved? Natural in target language? Register appropriate? | Unnatural phrasing, register mismatches, cultural issues | Highly specialized jargon, literary style |
| L5 Human Review | Native speaker in target domain reviews | Meaning, register and terminology errors within expertise | Specialized nuance, ambiguity and reviewer error |

### Data Extraction (Structured from Unstructured)

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Output schema valid (JSON schema validation); required fields present; data types correct; enum values within allowed set | Schema violations, missing fields, type errors | Whether extracted values are *correct* |
| L2 Property-Based Tests | Referential integrity (extracted IDs exist in source); cardinality checks (expected number of records ± tolerance); value range checks | Broken references, missing records, out-of-range values | Misattribution (correct format, wrong value) |
| L3 Rubric Scoring | Rubric: extraction completeness, handling of ambiguous fields, confidence scoring | Systematic extraction errors, poor ambiguity handling | Domain-specific interpretation errors |
| L4 Model Judge | Judge compares extraction to source document: are all values traceable to specific source text? | Values not present in source (hallucination), misattribution | Errors requiring domain expertise to spot |
| L5 Human Review | Domain analyst spot-checks sample | Errors detected in the reviewed sample | Overlooked errors within the sample and errors outside it |

### Classification

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Output label is in allowed label set; confidence score in \[0, 1\]; required metadata present | Invalid outputs, schema errors | Whether the classification is *correct* |
| L2 Property-Based Tests | Consistency: similar inputs (paraphrases) produce same label; distribution of labels within expected range for corpus | Inconsistency, distribution anomalies (all classified as one label) | Systematically wrong but consistent classifications |
| L3 Rubric Scoring | Rubric: evaluate explanation/reasoning for classification, check boundary cases | Poor reasoning, boundary-case errors | Errors requiring deep domain knowledge |
| L4 Model Judge | Judge evaluates: given the input and the classification, is this reasonable? Especially on disagreement cases | Unreasonable classifications, especially edge cases | Cases where ground truth is genuinely ambiguous |
| L5 Human Review | Domain expert labels a sample; compute agreement with system | Disagreement requiring adjudication on sampled inputs | Reviewer error, ambiguous labels and unsampled failure classes |

### Content Drafting (Marketing, Documentation, Reports)

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Length in range; no banned terms/phrases; links resolve; required sections present; reading level within target (Flesch-Kincaid) | Format violations, banned content, broken links | Quality, voice, persuasiveness |
| L2 Property-Based Tests | Factual claims verifiable against provided source material; brand terms spelled correctly; no competitor mentions (if policy) | Factual errors against known sources, brand violations | Tone, creativity, audience fit |
| L3 Rubric Scoring | Rubric: clarity, engagement, brand voice adherence, call-to-action effectiveness, structure | Overall quality across multiple dimensions | Whether content will *actually perform* with audience |
| L4 Model Judge | Judge with brand voice guide: does this sound like us? Is the argument compelling? | Voice drift, weak arguments, structural issues | Audience reception (requires real testing) |
| L5 Human Review | Editor or stakeholder approves | Editorial and strategic-fit issues noticed during review | Unverified facts, audience response and overlooked defects |

### SQL Generation

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Query parses; inspect a plan or execute only against an authorized isolated fixture; validate parameterization, statement policy and affected-row scope | Syntax errors, schema mismatches and selected dangerous patterns; a WHERE clause alone is not a mutation safety guarantee | Whether the query returns *correct* results |
| L2 Property-Based Tests | Query on test data produces expected row count ± tolerance; result schema matches expected columns and types; query completes within timeout | Wrong results, performance issues, schema mismatches | Subtle logic errors on edge-case data |
| L3 Rubric Scoring | Rubric: query efficiency (no unnecessary joins), readability, appropriate indexing hints, parameterization | Performance anti-patterns, maintainability | Business-logic correctness requiring domain knowledge |
| L4 Model Judge | Judge with schema + question: does this query answer the question correctly? Consider NULLs, duplicates, edge cases | Logic errors the test data did not expose | Performance at production scale (requires actual benchmarking) |
| L5 Human Review | DBA or data engineer reviews for correctness and performance | Query semantics and operational concerns within available context | Unseen data distributions, concurrency cases and reviewer error |

### Config / Infrastructure-as-Code Changes

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Config validates (terraform validate, helm lint, JSON schema); no secrets in plaintext; diff is scoped to intended change | Syntax errors, secret exposure, scope creep | Whether the change does what was intended |
| L2 Property-Based Tests | Dry-run/plan succeeds; no destructive actions (destroy, replace) unless explicitly intended; resource count delta matches expectation | Unintended destructions, unexpected resource changes | Correct behavior of the provisioned infrastructure |
| L3 Rubric Scoring | Rubric: least-privilege, naming conventions, tagging compliance, modularity | Security posture, organizational compliance | Runtime behavior of the deployed change |
| L4 Model Judge | Judge evaluates: is this change safe? Does it follow infrastructure patterns? Any blast radius concerns? | Design-level safety issues | Performance under load, cost implications |
| L5 Human Review | SRE or platform engineer reviews and applies | Operational and policy concerns in the proposed change | Delayed failures, missing dependencies and human error; applying remains separately authorized |

### Security Triage

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | Finding references a real CWE/CVE; affected file/line exists in codebase; severity is in {Critical, High, Medium, Low, Info} | Invalid findings, non-existent references | Whether the finding is a *real* vulnerability |
| L2 Property-Based Tests | No duplicate findings (same root cause reported once); severity ordering consistent (CVSS-aligned); exploitability assessment present | Duplicates, inconsistent severity, missing context | False positives (finding is real code but not exploitable) |
| L3 Rubric Scoring | Rubric: exploitability analysis quality, remediation actionability, false-positive rate on known-good patterns | Quality of analysis, actionability of recommendations | Novel vulnerability patterns not in training data |
| L4 Model Judge | Judge with code context: is this actually exploitable? Is the severity appropriate? Is the recommended fix correct? | False positives, severity inflation, incorrect fixes | Zero-day patterns, complex multi-step exploits |
| L5 Human Review | Security engineer reviews findings | Threat-model and exploitability issues within reviewed scope | Unknown attack paths, incomplete evidence and reviewer error |

### UI Automation (Browser / App Testing)

| Level | Oracle | Catches | Misses |
|----|----|----|----|
| L1 Deterministic Checks | All actions completed without timeout; expected elements found; no JavaScript errors in console; HTTP status codes 2xx on navigations | Broken workflows, missing elements, script errors | Visual correctness, UX quality |
| L2 Property-Based Tests | Screenshots pixel-diff against baseline within tolerance; accessibility audit passes (axe-core); response times within SLA | Visual regressions, accessibility violations, performance issues | Subjective UX quality, "does this look right?" |
| L3 Rubric Scoring | Rubric: task completion, workflow efficiency (steps taken vs. optimal), error recovery | Workflow design issues, inefficient paths | User satisfaction (requires real user testing) |
| L4 Model Judge | Vision model evaluates screenshots: does this look correct? Is the UI in the expected state? | Visual anomalies humans would notice, layout issues | Subtle interaction bugs (hover states, animations) |
| L5 Human Review | QA engineer performs manual walkthrough | Interaction, usability and edge-case defects encountered | Untested devices, states, accessibility needs and overlooked defects |

------------------------------------------------------------------------

## Appendix C: SKILL.md Templates and Anti-Patterns

Skills are the mechanism for encoding reusable project knowledge into agent context ([Chapter 11](chapter-11.md), *Skills: Reusable Project Knowledge*). This appendix provides the complete template, worked examples, and a catalog of failure modes.

### C.1 Complete Annotated Template

````markdown
# [Project Name] — Agent Skill
<!-- Version: 1.3 | Last updated: 2026-02-15 | Owner: [team] -->
<!-- Token budget: ~[N]K tokens when fully loaded -->

## Identity
<!-- WHO this skill is for and WHAT it enables. One paragraph. -->
You are working in [project name], a [brief description of what it does].
Your role is [what the agent does in this project].

## Stack
<!-- WHAT technologies are in play. Keep factual, not prescriptive. -->
- Language: [e.g., Python 3.12]
- Framework: [e.g., FastAPI 0.110+]
- Database: [e.g., PostgreSQL 16 with pgvector]
- Tests: [e.g., pytest + pytest-asyncio + hypothesis]
- Deployment: [e.g., Docker → ECS Fargate]
- CI: [e.g., GitHub Actions]

## Build & Verify
<!-- HOW to validate work. These commands are the agent's self-check. -->
```bash

# Unit tests (fast, run after every change)

pytest tests/unit/ -x --tb=short

# Type checking (must be zero errors)

pyright src/

# Lint (must be zero warnings)

ruff check src/

# Integration tests (run before PR)

pytest tests/integration/ --timeout=30

# Full validation (run before commit)

make ci-check



```

## Architecture
<!-- WHERE things live. Only include what the agent needs to navigate. -->

```text
src/
├── api/ # FastAPI routes, one file per resource
├── core/ # Business logic, no framework imports
├── models/ # SQLAlchemy models + Pydantic schemas
├── services/ # External integrations (email, payment, etc.)
└── utils/ # Pure functions, shared helpers
tests/
├── unit/ # Mirror src/ structure, fast, no I/O
├── integration/ # Hit real DB (test container), real APIs (mocked)
└── conftest.py # Shared fixtures
```



## Constraints (Hard Rules)
<!-- WHAT the agent must NEVER violate. Keep to ≤ 10 rules. -->
1. Never import from `api/` in `core/` — dependency flows inward only.
2. Every public function has a type-annotated signature.
3. Every database migration has a tested recovery plan; destructive data loss is not reversed by a downgrade function.
4. No raw SQL outside `repositories/` layer.
5. Secrets come from the approved secret manager or scoped runtime injection; never hardcode or expose them in model context or logs.
6. All HTTP endpoints return structured error responses (RFC 7807).
7. Tests must not depend on execution order.

## Conventions (Soft Rules)
<!-- HOW the team prefers things done. Violating these isn't a bug but is unwelcome. -->
- Name files as singular nouns: `user.py` not `users.py`
- Use factory functions over class constructors for complex objects
- Prefer `httpx` over `requests` for async compatibility
- One assertion per test method (with rare exceptions for related checks)
- Commit messages: imperative mood, reference issue number

## Common Tasks
<!-- Step-by-step guides for tasks the agent performs repeatedly. -->

### Adding a new API endpoint
1. Create route in `src/api/{resource}.py`
2. Add Pydantic request/response schemas in `src/models/schemas/{resource}.py`
3. Implement business logic in `src/core/{resource}.py`
4. Write unit tests in `tests/unit/core/test_{resource}.py`
5. Write integration test in `tests/integration/api/test_{resource}.py`
6. Run `make ci-check` — must pass before committing

### Debugging a failing test
1. Run the specific test: `pytest tests/path/to/test.py::test_name -xvs`
2. Check fixtures in `conftest.py` for unexpected state
3. If DB-related: check migration state with `alembic current`
4. If flakiness is suspected: repeat in a controlled fixture with a configured repeat plugin; ten passes do not prove absence of flakiness.

## Anti-Patterns (Learned Failures)
<!-- WHAT has gone wrong before. Add entries after each incident. -->
- **2026-01-20:** Agent added `import *` to avoid figuring out specific imports → broke namespace. Rule: always use specific imports.
- **2026-02-03:** Agent wrote tests that passed by coincidence (asserting on mutable shared state). Rule: each test gets fresh fixtures via `tmp_path` or factory.
- **2026-02-10:** Agent modified migration files instead of creating new ones → broke rollback. Rule: migrations are append-only once merged.

## Domain Knowledge
<!-- WHAT domain-specific facts the agent needs that it cannot discover from code alone. -->
- User roles: `admin`, `editor`, `viewer` — permissions cascade downward.
- Billing is event-sourced: never mutate a billing event, only append corrections.
- The `legacy_id` field on User maps to the old system's UUID — never generate new ones.
````

### C.2 Worked Example: Codebase Skill

````markdown
# Meridian API — Agent Skill
<!-- Version: 2.1 | Last updated: 2026-03-10 | Owner: Platform Team -->
<!-- Token budget: ~4K tokens -->

## Identity
You are working in Meridian, a financial data aggregation API serving 200+
internal consumers. Your role is implementing features, fixing bugs, and
maintaining test coverage above 90% on core modules.

## Stack
- Language: Python 3.12
- Framework: FastAPI 0.115
- Database: PostgreSQL 16 + TimescaleDB (time-series data)
- Cache: Redis 7 (query result caching, rate limiting)
- Tests: pytest + hypothesis + testcontainers
- Deploy: Docker → Kubernetes (Helm charts in deploy/)
- CI: GitHub Actions → ArgoCD

## Build & Verify
```bash

pytest tests/unit/ -x --tb=short # < 30s

pyright src/ --pythonversion 3.12 # Zero errors

ruff check src/ tests/ # Zero warnings

pytest tests/integration/ --timeout=60 # Requires Docker



```

## Architecture

```text
src/meridian/
├── api/v2/ # Versioned routes (v1 frozen, v2 active)
├── core/ # Business logic: aggregation, normalization
├── ingestion/ # Source adapters (each source = one module)
├── models/ # SQLAlchemy + Pydantic
├── cache/ # Redis abstractions
└── telemetry/ # OpenTelemetry instrumentation
```

Key invariant: ingestion/ never imports from api/ or core/.

Data flows: Source → Ingestion → DB → Core → API → Consumer.



## Constraints
1. All endpoints require authentication and tenant/resource/action authorization, enforced in trusted handlers (authentication dependency: `get_current_user`).
2. Time-series queries MUST use TimescaleDB continuous aggregates, not raw scans.
3. No synchronous I/O in request handlers — everything async.
4. Rate limiting is per-consumer-key, enforced at middleware level.
5. Schema changes require migration + backward-compatible API version.

## Conventions
- Ingestion adapters implement `BaseAdapter` protocol (see `src/meridian/ingestion/base.py`)
- Error responses use RFC 7807 format via `src/meridian/api/errors.py`
- Cache keys follow pattern: `meridian:{resource}:{consumer_id}:{hash}`
- Monetary values carry currency and its explicit minor-unit scale; use integer minor units or the project's exact-decimal type, not a universal assumption of two decimal places.

## Anti-Patterns
- **2026-01-15:** Agent cached a query that depends on `current_time` → stale results served for the cache TTL. Rule: never cache time-dependent queries without explicit TTL matching the granularity.
- **2026-02-28:** Agent added a new ingestion source but forgot to register it in `SOURCES` registry → silent failure. Rule: every new source must be added to `src/meridian/ingestion/__init__.py:SOURCES`.
````

### C.3 Worked Example: Writing/Brand-Voice Skill

````markdown
# Lighthouse Blog — Agent Skill
<!-- Version: 1.4 | Last updated: 2026-03-01 | Owner: Content Team -->
<!-- Token budget: ~3K tokens -->

## Identity
You are writing content for Lighthouse, a developer tools company.
Your role is drafting blog posts, documentation, and release notes
that match our established voice.

## Voice & Tone
- **Register:** Informed peer, not lecturer. We explain; we do not condescend.
- **Sentence rhythm:** Mix short declaratives with longer explanatory sentences. Never more than two long sentences in sequence.
- **Technical depth:** Assume the reader can read code. Do not over-explain standard programming concepts. Do explain our domain-specific concepts.
- **Confidence:** State supported outcomes directly; quote a latency reduction only with measured conditions and uncertainty. Never trade accuracy for a confident voice.
- **Humor:** Dry, occasional, never forced. One joke per 1,000 words maximum.

## Banned Constructions
- "In today's fast-paced world"
- "Game-changing" / "revolutionary" / "cutting-edge"
- "Simply" (implies the reader is stupid if they find it hard)
- "It's important to note that" (just state the thing)
- Starting sentences with "So," or "Basically,"
- Exclamation points (except in code output examples)

## Structure (Blog Posts)
1. **Hook** (1-2 sentences): The problem or surprising fact.
2. **Context** (1 paragraph): Why this matters now.
3. **Body** (3-5 sections): The explanation, with code examples.
4. **Takeaway** (1 paragraph): What the reader should do next.
- Target: 1,200-2,000 words for standard posts, 2,500-3,500 for deep dives.
- Every code example must be syntactically valid and runnable.

## Constraints
1. Never claim features exist that are not yet shipped (check release notes).
2. Never compare to competitors by name unless legal has approved.
3. Runnable code examples require recorded tests against the stated release; label unexecuted API sketches as pseudocode instead of claiming they were tested.
4. Accessibility: alt text on all images, descriptive link text (never "click here").
5. SEO: title ≤ 60 chars, meta description ≤ 155 chars, one H1 only.

## Verify
```bash

# Markdown lint

markdownlint content/**/*.md

# Link check

lychee content/**/*.md --no-progress

# Word count check

wc -w content/drafts/*.md # Should be 1200-3500

# Code example validation

pytest tests/content_examples/ -x



```

## Anti-Patterns
- **2026-01-20:** Draft used "we're excited to announce" — cliché, removed. Rule: never express the company's emotions; state what shipped and why it matters.
- **2026-02-14:** Draft explained what a REST API is to an audience of API developers. Rule: do not explain concepts the audience already knows.
````

### C.4 Progressive Disclosure Structure

Skills should be layered so the agent loads only what it needs ([Chapter 11](chapter-11.md), §11.3):

| Layer | Token Budget | Contains | Loaded When |
|----|----|----|----|
| **Core** | ≤ 2K tokens | Identity, Stack, Build & Verify, Constraints | Always (every task) |
| **Navigation** | 2–4K tokens | Architecture, Common Tasks | Tasks involving code changes |
| **Domain** | 4–8K tokens | Domain Knowledge, Anti-Patterns, Conventions | Complex or domain-specific tasks |
| **Reference** | 8–12K tokens | Full examples, historical decisions, migration guides | Rare — only when the agent explicitly searches |

**Versioning conventions:**

- Skill version follows `MAJOR.MINOR` — increment MINOR for additions, MAJOR for constraint changes.
- Include a `Last updated` date in the header comment.
- Commit skill changes with message: `docs(skill): [what changed and why]`
- Review skills monthly or after any incident caused by stale skill content.
- Keep a changelog section in skills that exceed 8K tokens.

### C.5 Anti-Pattern Catalog

| Anti-Pattern | Symptom | Root Cause | Fix |
|----|----|----|----|
| **Volatile information** | Agent uses outdated facts from skill (stale version numbers, deprecated APIs) | Encoding facts that change frequently | Move volatile data to tools (API calls) or memory; keep only stable constraints in skills |
| **Skill sprawl** | 15+ skill files loaded, context budget consumed before the task begins | Every piece of knowledge turned into a skill | Reduce irrelevant loading; use scoped progressive disclosure rather than a universal maximum number of skill files |
| **Discoverable duplication** | Skill repeats what the agent can learn from `README.md`, `package.json`, or file structure | Author assumed the agent cannot read the repo | Keep high-value source-linked entrypoints and constraints; remove redundant bulk text rather than banning all discoverable knowledge |
| **Conclusions over constraints** | Skill says "always use Strategy X" without explaining when X applies | Author encoded their solution instead of the problem | Encode the constraint ("responses must be \< 200ms") and let the agent choose the solution |
| **Unbounded growth** | Skill file grows to 30K+ tokens over months, loaded on every task | No pruning, no progressive disclosure, append-only | Set a token budget; archive old anti-patterns after 6 months; split into layers |
| **Missing verification** | Agent cannot self-check because skill has no build/test commands | Author forgot the "Build & Verify" section | Provide task-appropriate acceptance checks; reviewed commands must run only in authorized safe fixtures, and non-code skills need not invent shell commands |
| **Outdated anti-patterns** | Skill warns against patterns that are no longer risky (library updated, code deleted) | Anti-patterns added but never reviewed | Review anti-patterns quarterly; delete when the underlying code no longer exists |
| **Framework tutorial** | Skill explains how FastAPI/React/Django works generally | Author confused "project knowledge" with "technology documentation" | Skills encode project-specific decisions, not framework basics |

------------------------------------------------------------------------

## Appendix D: Cost Model Worksheet

This appendix supports [Chapter 27](chapter-27.md), *Token Economics of Loops*, and [Chapter 28](chapter-28.md), *Cost Engineering*. The headline metric is **cost per verified outcome**: the total spend to produce one artifact that passes the oracle stack.

### D.1 The Formula

**Assumptions:** The reciprocal success-rate model below describes stationary independent attempts of comparable cost. It is not a safe retry policy, a guarantee of eventual success, or a substitute for measured conditional success after each failure. For a real cohort, divide all attributed cost (including failures and review) by the number of accepted outcomes; report cost as undefined if there are none. Tables using cost per outcome assume demand for that many completed outcomes, not simply that many scheduled attempts. Prices below are hypothetical historical worksheet inputs, not checked current vendor prices.


    Cost Per Verified Outcome = Cost_per_run × Attempts_to_pass

    Where:
      Cost_per_run = Σ (iterations) [ input_tokens × input_rate / 1_000_000
                                     + output_tokens × output_rate / 1_000_000
                                     + tool_costs
                                     + oracle_costs ]

      Attempts_to_pass = 1 / success_rate
        (e.g., 80% success rate → 1.25 attempts on average)

**Term definitions:**

| Term | Definition | Unit |
|----|----|----|
| `input_tokens` | Tokens sent to the model per iteration (system prompt + skills + history + tool results + oracle feedback) | tokens |
| `output_tokens` | Tokens generated by the model per iteration (reasoning + tool calls + content) | tokens |
| `input_rate` | Price per million input tokens for the maker model | USD/Mtok |
| `output_rate` | Price per million output tokens for the maker model | USD/Mtok |
| `tool_costs` | External API calls, compute, storage consumed by tools per iteration | USD |
| `oracle_costs` | Verification costs not already counted in maker tokens or tool costs; include model, compute and other applicable charges exactly once | USD |
| `iterations` | Number of maker→verify loops in one run | count |
| `attempts_to_pass` | Average number of complete runs needed to produce a passing outcome | count |
| `success_rate` | Fraction of runs that produce a passing outcome | 0.0–1.0 |

### D.2 Worked Example: Single-Agent Coding Loop

**Illustrative rate inputs, not checked vendor prices:** $3/Mtok input and $15/Mtok output. Single coding task (implement a function from an issue description). Skill: 3K tokens. Average history growth: 2K tokens/iteration.

| Component                              | Iteration 1 | Iteration 3 | Iteration 5 |
|----------------------------------------|-------------|-------------|-------------|
| System prompt + skill                  | 4,000       | 4,000       | 4,000       |
| Conversation history                   | 0           | 4,000       | 8,000       |
| Tool results (test output, file reads) | 3,000       | 5,000       | 6,000       |
| Oracle feedback                        | 0           | 800         | 800         |
| **Total input**                        | **7,000**   | **13,800**  | **18,800**  |
| Output (code + tool calls)             | 2,500       | 2,000       | 1,500       |

**Per-iteration cost calculation (at iteration 3) \[ESTIMATE\]:**

- Input: 13,800 tokens × \$3/Mtok = \$0.041
- Output: 2,000 tokens × \$15/Mtok = \$0.030
- Oracle (L1: pytest): $0.00 external fee assumed here; local compute and operator costs excluded from this token-only subtotal
- Oracle (L4: judge, runs every 3rd iteration): 3,000 input + 500 output = $0.009 + $0.0075 = $0.0165
- **Iteration 3 total: $0.0879, rounded to $0.088** (input cost before rounding is $0.0414)

**Full run cost \[ESTIMATE\]:**

| Metric | Value | Calculation |
|----|----|----|
| Average iterations | 5 | \[ESTIMATE: based on typical pass rate at L1 after 3-6 iterations\] |
| Cost per run | $0.36 | Independent illustrative mean-cost input; the partial table omits iterations 2 and 4 and does not establish this total |
| Success rate | 72% | \[ESTIMATE: for well-scoped single-function tasks\] |
| Attempts to pass | 1.39 | 1 / 0.72 |
| **Cost per verified outcome** | **\$0.50** | \$0.36 × 1.39 |

### D.3 Worked Example: Fleet Run

**Illustrative rate inputs, not checked vendor prices:** Lead agent on a lower-cost model (\$0.25/Mtok input, \$1.25/Mtok output). Three specialists on a higher-cost model (\$3/Mtok input, \$15/Mtok output). Task: refactor a module across 12 files. Lead decomposes into 4 subtasks, each assigned to a specialist (one specialist handles 2 subtasks sequentially).

| Component | Lead Agent | Per Specialist (avg) | Total (1 lead + 3 specialists) |
|----|----|----|----|
| Iterations | 3 | 4 | 3 + 12 = 15 |
| Avg input tokens/iter | 8,000 | 15,000 | — |
| Avg output tokens/iter | 1,500 | 2,500 | — |
| Cost per iteration | $0.003875 | $0.0825 | — |
| Subtotal | $0.011625 | $0.33 | — |
| **Total per run** | — | — | **$1.001625** |
| Oracle cost (L1 on each specialist + L4 on final merge) | — | — | \$0.05 |
| **Run total with oracles** | — | — | **$1.051625**, approximately **$1.05** |

| Metric | Value |
|----|----|
| Cost per run | \$1.05 \[ESTIMATE\] |
| Fleet success rate | 60% \[ESTIMATE: lower than single-agent due to coordination failures\] |
| Attempts to pass | 1.67 |
| **Cost per verified outcome** | **$1.752708…**, approximately **$1.75**, using the unrounded total divided by 0.60 |

### D.4 Sensitivity Table

How cost per verified outcome moves with key variables. Base case: single-agent coding loop from §D.2.

**Sensitivity to attempts-to-pass \[ESTIMATE\]:**

| Success Rate | Attempts to Pass | Cost per Verified Outcome | Monthly at 12 outcomes/day |
|----|----|----|----|
| 90% | 1.11 | \$0.40 | \$144 |
| 80% | 1.25 | \$0.45 | \$162 |
| 72% (base) | 1.39 | \$0.50 | \$180 |
| 60% | 1.67 | \$0.60 | \$216 |
| 50% | 2.00 | $0.72 | $259.20 |
| 40% | 2.50 | \$0.90 | \$324 |

**Sensitivity to maker/checker model mix \[ESTIMATE\]:**

| Maker Model | Checker Model | Cost/Run | Attempts to Pass | Cost/Verified Outcome |
|----|----|----|----|----|
| Opus (\$15/\$75) | Opus | \$2.80 | 1.05 | \$2.94 |
| Opus (\$15/\$75) | Sonnet | \$1.85 | 1.10 | \$2.04 |
| Sonnet (\$3/\$15) | Sonnet | \$0.36 | 1.39 | \$0.50 |
| Sonnet (\$3/\$15) | Haiku | \$0.34 | 1.50 | \$0.51 |
| Haiku (\$0.25/\$1.25) | Haiku | \$0.04 | 3.30 | \$0.13 |

*Interpretation:* These hypothetical rows are assumptions, not measured model comparisons. A lower assumed CPVO is meaningful only with equivalent quality and the same capped policy. Systematic failures can make retries useless; do not infer that a cheaper model will eventually pass or that more attempts are authorized.

### D.5 Break-Even Against Human Baseline


    Break-even outcomes/month = Fixed_costs_per_month /
        (Human_baseline_cost_per_outcome - Agent_total_variable_cost_per_outcome)
    Valid only when the denominator is positive; round up for whole tasks.

**Example \[ESTIMATE\]:**

| Term | Value | Basis |
|----|----|----|
| Human cost per task | $85.50 | Illustrative 1.5 hr × $57/hr; labor opportunity cost, not automatic cash savings |
| Agent cost per verified outcome | \$0.50 | From §D.2 |
| Savings per task | $85.00 | $85.50 - $0.50, before any additional retained variable effort |
| Fixed costs (monthly) | \$500 | \[ESTIMATE: skill maintenance, monitoring, eval infra amortized\] |
| **Break-even volume** | **6 accepted outcomes/month** | ceil($500 / $85.00); approximately 5.88 before rounding |

At 12 accepted outcomes/day (360/month), illustrative net capacity value is (360 × $85.00) − $500 = **$30,100**, before any excluded retained variable effort. This is not a forecast for twelve scheduled attempts per day.

*Important caveat:* This calculation assumes the agent achieves equivalent quality. If human review is still required on every output, add its cost to the automated alternative; do not reduce the original manual baseline instead. At an illustrative fifteen minutes and $57/hour, retained review adds $14.25 per accepted output, reducing per-output savings here to $70.75. The break-even then becomes ceil($500 / $70.75) = eight outcomes/month. See [Chapter 28](chapter-28.md) for the staged-autonomy model. Budget review, incident response, infrastructure, failed work, and residual human effort before claiming savings.

### D.6 Scheduled Loop Multiplier

Converting an assumed cost per completed outcome into a monthly line item. For scheduled attempts, multiply attempts by cost per attempt instead; do not count retry cost twice:

| Target outcome cadence | Outcomes/Month | Monthly Cost (at \$0.50/verified outcome) | Monthly Cost (at \$1.75/verified outcome) |
|----|----|----|----|
| On-demand (2/day) | 60 | \$30 | \$105 |
| Regular (12/day) | 360 | \$180 | \$630 |
| Hourly | 720 | \$360 | \$1,260 |
| Every 15 min | 2,880 | \$1,440 | \$5,040 |
| Continuous (every 5 min) | 8,640 | \$4,320 | \$15,120 |

**Cadence decision:** Choose event-driven or scheduled execution from actual freshness requirements, source change rate, and marginal value. An hourly boundary is not a universal optimum. Measure deduplication, burst load, and the cost of missed deadlines ([Chapter 14](chapter-14.md)).

------------------------------------------------------------------------

## Appendix E: Failure Taxonomy Quick Reference

A diagnostic reference for operators and on-call engineers. For each failure mode, the table gives the observable symptom, the likely root cause, how to confirm the diagnosis, the standard fix, and the chapter covering it in depth.

Use this when a loop is misbehaving and you need to narrow down the cause quickly.

| \# | Failure Mode | Symptom | Likely Cause | Diagnostic Check | Fix | Chapter |
|----|----|----|----|----|----|----|
| 1 | **Non-termination** | Loop running for 10x expected duration; iterations incrementing without converging | Stop condition missing or misconfigured; budget limit set too high; oracle never returns PASS | Check `iterations` vs `max_iterations`; inspect last N oracle verdicts — if all FAIL with no score improvement, stop condition is not triggering | Add or tighten no-progress stop condition; reduce `max_iterations`; verify oracle can return PASS for valid output | 18 |
| 2 | **Oscillation** | Same oracle score ±0.05 for last N iterations; git diff shows changes being made and reverted | Two oracle dimensions in conflict (fixing one breaks the other); agent lacks memory of previous attempts | Diff consecutive iterations — if delta reverses, it is oscillating; check oracle feedback for contradictory instructions | Decompose into sub-goals; add oscillation detection to stop conditions; add iteration memory to context | 18 |
| 3 | **No-progress plateau** | Oracle score flatlines; agent is still working but producing equivalent outputs | Agent exhausted its strategies; model capability ceiling for this task; context window too full for new approaches | Inspect scores plus artifact, evidence and failure fingerprints; a flat score alone does not prove no useful progress | Preserve current artifacts and cumulative budgets; change strategy within authority or request revised scope; reconcile unknown effects before restart | 18 |
| 4 | **Budget exhaustion** | Loop terminates with BUDGET_EXCEEDED; output incomplete or low quality | Underestimated complexity; too many iterations needed; model too expensive for this task type | Compare actual cost vs budget; compare actual iterations vs expected; identify which budget dimension was hit first | Request budget change from its owner only when evidence supports useful progress; otherwise reduce scope or cost without weakening required checks | 27 |
| 5 | **Goal misinterpretation** | Agent produces complete, verified work — but on the wrong thing; oracle passes but human rejects | Goal statement ambiguous; acceptance criteria incomplete; oracle does not cover the intended dimension | Compare agent output against human intent (not just oracle criteria); check if oracle criteria actually imply the intended behavior | Tighten goal statement; add acceptance criteria that distinguish intended from unintended valid solutions; add L4/L5 oracle | 15 |
| 6 | **Reward hacking** | Oracle scores high; output looks superficially correct but games the metric; quality regresses on dimensions not measured | Oracle measures a proxy, not the true objective; agent learned to satisfy the letter of the oracle, not the spirit | Adjudicate model-human disagreement against requirements and evidence; disagreement alone does not prove gaming. Inspect changed tests and proxy metrics for an actual mechanism | Add oracle dimensions for the gamed metric; add adversarial checking; use model judge with "is this gaming the metric?" instruction | 23 |
| 7 | **Test gaming** | Coverage metrics high; tests pass; but tests assert trivial things or test implementation details | Oracle rewards coverage numbers without testing assertion quality; no mutation testing | Run mutation testing (mutmut/cosmic-ray) — if mutants survive with passing tests, tests are weak; inspect test assertions manually | Add mutation testing to oracle stack (L2); add L3 rubric scoring test quality; penalize tests with trivial assertions | 23 |
| 8 | **Sycophantic self-review** | Checker passes everything; zero iterations; quality is inconsistent | Checker model agrees with maker because it shares context or tends toward agreement | Use known-defective and known-good fixtures plus blind adjudication; absence of criticism alone does not establish sycophancy | Separate maker context, calibrate against independent evidence and seed known defects; model diversity and adversarial wording do not prove independence | 21 |
| 9 | **Silent scope drift** | Loop completes and passes; but the change set is larger than intended; unrelated files modified | Goal does not constrain scope; agent "helpfully" fixes adjacent issues; no scope oracle | `git diff --stat` — if files outside expected scope are modified, scope drifted; check goal for scope constraints | Add explicit scope constraint to acceptance criteria; add L1 oracle checking `changed_files ⊆ expected_set`; use worktree isolation | 15 |
| 10 | **Context exhaustion** | Quality degrades after iteration 4-5; agent "forgets" earlier feedback; repeats previously-rejected approaches | Context window full; compaction discarded critical information; conversation history too long | Check token count vs window limit; inspect compaction summaries for information loss; compare early vs late iteration quality | Implement compaction strategy ([Chapter 8](chapter-08.md)); use summary notes between iterations; reduce per-iteration token footprint; escalate earlier | 7, 8 |
| 11 | **Compaction data loss** | Agent contradicts its earlier output; loses track of decisions made in early iterations; re-introduces fixed bugs | Compaction algorithm discarded task-critical details; handoff notes incomplete | Compare pre/post compaction context; check if lost information was in handoff notes; look for contradictions between early and late iterations | Improve compaction heuristics; mark critical information as non-compactable; use structured state (not just conversation) to persist decisions | 8 |
| 12 | **Tool selection errors** | Agent uses wrong tool for the task; makes multiple failed tool calls before finding the right one; wastes iterations | Too many tools loaded (cognitive overhead); tool descriptions ambiguous; no Tool Search configured | Count failed tool calls per iteration; check if correct tool was available; check tool descriptions for clarity | Use Tool Search to load tools on demand; improve tool descriptions; reduce upfront tool count; add tool-use examples | 9 |
| 13 | **Stale skills** | Agent follows outdated patterns; produces code that fails because the codebase has changed since the skill was written | Skill file not updated after code changes; volatile information encoded in skill | Compare skill content against current codebase; check skill version date; look for references to deleted files/APIs | Update skill; move volatile information to tools; add skill review to PR checklist; automate freshness checks | 11 |
| 14 | **Memory poisoning** | Agent makes confidently wrong decisions based on "learned" patterns that are incorrect; quality regresses over time | Bad information written to memory during a failed session; no memory validation; no human review of memory updates | Inspect memory store for recent entries; correlate quality regression timeline with memory write dates; check if incorrect entries match the failure pattern | Quarantine suspect entries and derived claims, preserve permitted evidence, and invalidate caches; apply retention/deletion policy and source validation before promotion | 12 |
| 15 | **Prompt injection via tool results** | Agent executes unintended actions after reading tool output; behavior changes unexpectedly mid-loop | Malicious or unexpected content in tool results (file contents, API responses, web pages) influences agent behavior | Inspect tool results for instruction-like content; check if agent behavior changed immediately after a specific tool call; look for "ignore previous instructions" patterns in inputs | Treat retrieved text as untrusted data; enforce resource/action permissions outside the model, constrain egress, and validate effects; filtering and structure alone are insufficient | 30 |
| 16 | **Fleet write conflicts** | Specialists overwrite each other's work; merge conflicts; final output missing contributions from some specialists | Shared filesystem without coordination; specialists assigned overlapping scopes; no conflict resolution strategy | Check git conflicts; diff specialist outputs for overlap; verify scope assignments are disjoint | Assign non-overlapping file scopes; use event log for coordination; implement lead-arbitrated conflict resolution; consider pipeline topology if ordering matters | 25 |
| 17 | **Escalation storms** | On-call receives 50+ alerts in an hour; each loop independently escalates; context overwhelmed | High-cadence loops + common failure mode (e.g., shared dependency down) = multiplied alerts; no deduplication; no correlation | Check alert timestamps for clustering; identify common root cause across escalations; check for correlated failures | Implement alert deduplication; add correlation IDs; throttle escalations per time window; add fleet-level health check before individual escalations | 33 |
| 18 | **Alert fatigue / rubber-stamp approval** | Humans approve everything without review; quality gates become ceremonial; bugs ship through L5 | Too many approvals required; approval latency creates backlog; approvals are low-signal (most are fine) | Sample decisions against evidence and interview reviewers; short review time or a low rejection rate alone does not prove rubber-stamping | Preserve required high-risk gates; remove duplicate work, resource qualified review, hold unsafe actions, and adopt sampling only for explicitly eligible low-risk classes | 26 |

------------------------------------------------------------------------

## Appendix F: Primitive Selection Decision Tree

[Chapter 3](chapter-03.md) introduces the six building blocks (automations, worktrees, skills, connectors, subagents, memory). [Chapter 13](chapter-13.md) compares implementation primitives: code, prompts, tools, MCP interfaces, skills and subagents; memory supplies scoped persistent context. This appendix provides a decision tree and comparison table for choosing the right primitive for a given need.

### F.1 Decision Tree

This tree is a starting heuristic, not a dispatcher policy. Establish task authority and observable acceptance first. Code can sit behind a tool or MCP interface, and reasoning can combine tools with skills; branches are not mutually exclusive products. Persistence is a separate source-governance decision. Prefer the simplest combination that meets actual requirements.

``` mermaid

flowchart TD
    START["I need the loop to do X"] --> DET{"Is X deterministic?<br/>(same input → same output)"}
    DET -- Yes --> CODE["Use CODE<br/>(function, script, automation)"]
    DET -- No --> REASON{"Does X require<br/>reasoning about<br/>ambiguous input?"}
    REASON -- No --> EXT{"Does X require<br/>external system<br/>interaction?"}
    REASON -- Yes --> ISO{"Does X need<br/>isolation from<br/>current context?"}
    ISO -- Yes --> PERSIST{"Will the result be<br/>reused across runs?"}
    PERSIST -- Yes --> SUBAGENT["Use SUBAGENT<br/>(separate context + memory)"]
    PERSIST -- No --> SUBAGENT2["Use SUBAGENT<br/>(separate context, ephemeral)"]
    ISO -- No --> SIZE{"Does independent parallel work<br/>provide demonstrated benefit<br/>within current authority?"}
    SIZE -- Yes --> SUBAGENT
    SIZE -- No --> PROMPT["Use PROMPT<br/>(in current context)"]
    EXT -- Yes --> SHARED{"Is this integration<br/>shared across<br/>multiple loops?"}
    SHARED -- Yes --> PROTO{"Does the selected MCP version<br/>fit compatible clients and<br/>reviewed authorization needs?"}
    PROTO -- Yes --> MCP["Use MCP SERVER<br/>(standard protocol wrapper)"]
    PROTO -- No --> CONNECTOR["Use PLUGIN/CONNECTOR<br/>(custom integration)"]
    SHARED -- No --> TOOL["Use TOOL<br/>(direct, single-purpose)"]
    EXT -- No --> KNOW{"Does X require<br/>stable project<br/>knowledge?"}
    KNOW -- Yes --> FREQ{"Does the decision require<br/>fresh authoritative state?"}
    FREQ -- Yes --> MEMORY["Retrieve current source<br/>with scoped TOOL; do not trust stale memory"]
    FREQ -- No --> DISC{"Is bounded source retrieval<br/>more useful than maintained<br/>navigational guidance?"}
    DISC -- Yes --> NONE["Let the agent discover it<br/>(no primitive needed)"]
    DISC -- No --> SKILL["Use SKILL<br/>(pre-loaded project knowledge)"]
    KNOW -- No --> DECOMPOSE["Re-examine X.<br/>Decompose into sub-operations<br/>that fit the tree above."]
```

### F.2 Primitive Comparison Table

All cost and latency figures below are illustrative assumptions, not measured service guarantees. Token examples use hypothetical rates of $3/M input and $15/M output; distinguish per-inference charges from whole-run totals and include caching where applicable.

| Primitive | Context Cost | Execution Cost | Latency | Best For | Worst For |
|----|----|----|----|----|----|
| **Prompt** (in-context instruction) | Instruction and retained-context input tokens; reuse is not automatically free | Output component $0.015–0.075 for 1K–5K output tokens, plus input and other applicable charges | 1–5s | Simple reasoning, short answers, decision-making within current task | Large outputs, tasks needing isolation, tasks needing different tools |
| **Code** (deterministic function) | 0 tokens (not in LLM context) | Near-zero (local compute) | \<100ms | Deterministic transforms, validation, parsing, formatting | Ambiguous inputs, tasks requiring judgment |
| **Tool** (single-purpose, direct) | ~200–800 tokens for schema | External API/compute cost plus any model-input charges for returned data; tool output is not automatically model-generated output | 0.5–30s (depends on external service) | Specific actions: file I/O, HTTP calls, database queries | Shared integrations (use MCP), complex multi-step workflows |
| **MCP Server** (protocol wrapper) | Measure schemas actually exposed by the selected client; discovery/loading behavior varies | Same as Tool + server overhead | 1–30s | Shared integrations across multiple loops and projects | One-off integrations, performance-critical hot paths |
| **Skill** (pre-loaded knowledge) | 2,000–12,000 tokens \[ESTIMATE: based on progressive disclosure layers\] | $0.006–0.036 per uncached inference that includes 2K–12K tokens; sum across calls for a run | Read/retrieval latency plus inference processing; not inherently zero | Stable project knowledge: constraints, conventions, architecture | Volatile information, discoverable facts, large reference data |
| **Subagent** (separate context) | Delegation and returned-result tokens in parent; separate child context billed too | Full run cost: \$0.10–5.00+ \[ESTIMATE: depends on task complexity and model\] | 10s–5min | Context isolation, parallel work, specialist tasks, large outputs | Simple tasks (overhead not justified), tasks needing shared state |
| **Memory** (persistent store) | ~500–2,000 tokens per retrieval | \$0.002–0.01 per read \[ESTIMATE: retrieval + input tokens\] | 0.5–2s per retrieval | Cross-session learning, user preferences, project patterns that evolve | Static constraints (use skill), per-task ephemeral state |

### F.3 Common Wrong Choices

| What Engineers Reach For | When They Should Use Instead | Why |
|----|----|----|
| Subagent for a 3-line decision | Prompt (in current context) | Subagent startup cost + context duplication wastes tokens and adds 10-30s latency for something that takes 1s in context |
| Unversioned skill claim about an API version | Pinned project manifest or current authoritative lookup | Skills can reference validated pinned versions; moving the same stale claim into memory does not make it current |
| MCP server for a one-off integration | Direct Tool | MCP server is infrastructure; if only one loop uses it, the protocol overhead is not justified |
| Prompt for a 50-file refactoring | Bounded sequential workflow; specialists only if justified | Inspect actual file sizes and dependencies; use bounded reads and sequential work unless parallelism or independent context has a demonstrated benefit |
| Unnecessary lookup for a low-risk stable explanation | Prompt, if no current-source or execution evidence is required | Training knowledge can be adequate for background explanation, but cannot establish current versions, live state, or that code actually works |
| Memory for project architecture | Skill | Keep navigational guidance close to source, bind it to current revisions, and retrieve volatile details; no universal monthly stability or cost assumption applies |
| Code for ambiguous classification | Prompt or Model Judge (L4) | Test rules and simple statistical baselines first; use model judgment only where the task requires it and evidence supports the trade-off |
| Skill for 100KB of documentation | Tool Search + progressive loading | Loading 100KB into context at start wastes budget; let the agent search and load relevant sections on demand |

------------------------------------------------------------------------

## Appendix G: Glossary

Terms are defined in their canonical form as used throughout the book. The chapter reference indicates where the term is formally introduced and explained. The definitions below are a reference, not a claim that an unavailable editorial source was validated.

| Term | Definition | Introduced |
|----|----|----|
| **Acceptance criteria** | Observable conditions defining what done means, with mechanical checks where possible and explicit rubrics or accountable judgment where necessary. A criterion does not grant action authority. | Ch 3 |
| **Attempts-to-pass** | Observed attempts needed for an accepted outcome, with failures and censored tasks disclosed. The approximation `1 / p` assumes independent stationary trials and is not a safe retry policy. | Ch 27 |
| **Autonomy Ladder** | The six levels of agent independence: L0 Autocomplete, L1 Tool-Augmented Model, L2 Guided Agent, L3 Autonomous Single Agent, L4 Autonomous Fleet, L5 Self-Designing Fleet. The book covers L1–L5. | Ch 2 |
| **Between-session memory consolidation** | A scheduled process that reviews agent sessions and memory stores between runs, extracting patterns and curating memory — merging duplicates, replacing stale entries, surfacing insights. Also called "dreaming." | Ch 12 |
| **Blackboard** | A shared data structure in fleet topologies where specialists write results and the lead reads them. Implements coordination without direct inter-specialist messaging. | Ch 25 |
| **Blast radius** | The maximum damage a failed loop can cause before being caught and stopped. A security design parameter. | Ch 31 |
| **Budget** | One of the five fields of the Loop Contract. Defines resource limits: max iterations, max tokens, max wall-clock time, max cost in USD. | Ch 3 |
| **Cascade (model cascade)** | A strategy that routes tasks to the cheapest capable model, escalating to more expensive models only when cheaper ones fail. | Ch 28 |
| **Checker** | The verification role in a maker-checker architecture. Evaluates the maker's output in an isolated context. Must not share the maker's conversation history. | Ch 21 |
| **Closed loop** | Book-specific label for a bounded workflow with explicit checkpoints. This differs from control-theory usage, where closed-loop means feedback-controlled; it does not imply every step is predetermined. | Ch 19 |
| **Compaction** | Lossy compression of conversation context to free space for new information while preserving essential state. | Ch 8 |
| **Connectors** | One of the six building blocks. Integrations that connect loops to external systems (also called plugins). | Ch 13 |
| **Context editing** | Automatic clearing of stale tool results and intermediate outputs from the context window to reduce noise and cost. | Ch 7 |
| **Convergence** | The property of a loop progressing toward its goal across iterations, assessed against actual task progress and evidence; rising proxy scores alone are insufficient. | Ch 18 |
| **Cost per verified outcome** | All attributed cohort cost divided by accepted outcomes, including failed attempts and relevant human effort. With no accepted outcomes the ratio is undefined; simplified forecast formulas require explicit assumptions. | Ch 27 |
| **Deterministic Checks (Level 1)** | Checks with specified mechanical evaluation rules. A pass supports only the tested properties; incomplete suites, wrong artifacts, environmental failures, and flaky dependencies can still make the overall conclusion inconclusive. | Ch 20 |
| **Discover** | First of the five stages. The loop gathers context: reads files, searches code, loads relevant skills and memory. | Ch 3 |
| **Dreaming** | See *Between-session memory consolidation*. | Ch 12 |
| **Escalation path** | One of the five fields of the Loop Contract. Defines what happens when the loop cannot complete autonomously: who is notified, what context is provided, what actions are taken. | Ch 3 |
| **Evaluation** | The typed output of an oracle: contains verdict (pass/fail/inconclusive), optional score (0.0–1.0), feedback (actionable text), cost, and oracle name. | Ch 20 |
| **Event log** | Persistent record of fleet events. Enables the lead to check specialist progress and provides observability. Events survive across sessions. | Ch 25 |
| **Execute** | Third of the five stages. The loop performs actions: writes code, calls tools, produces artifacts. | Ch 3 |
| **Fleet** | Multiple coordinated loops (lead + specialists) working toward a shared goal. Corresponds to L4–L5 on the Autonomy Ladder. | Ch 24 |
| **Goal** | One of the five fields of the Loop Contract. Defines what the loop must produce, with a human-readable statement and machine-evaluable acceptance criteria. | Ch 3 |
| **Handoff note** | A structured summary passed between context windows during compaction or subagent delegation. Preserves critical state that must survive context transitions. | Ch 8 |
| **Human Review (Level 5)** | An accountable human evaluates output for specified criteria or approves an action when required. Cost and competence vary; humans can miss errors and need evidence and manageable workload. | Ch 20 |
| **Idempotency** | Repeating one logical operation has the same intended effect as one application under a specified contract. Trigger deduplication and receiver-side effect deduplication have different boundaries, scopes, and lifetimes. | Ch 14, 39 |
| **Iterate** | Fifth of the five stages. The loop incorporates oracle feedback and makes another attempt. Continues until a stop condition is met. | Ch 3 |
| **L0–L5** | See *Autonomy Ladder*. | Ch 2 |
| **Lead** | The coordinating agent in a fleet topology. Decomposes the goal, delegates to specialists, synthesizes results. | Ch 24 |
| **Loop** | An automated feedback cycle where a model produces output, an oracle evaluates it, and the model tries again if verification fails. The core abstraction of the book. | Ch 3 |
| **Loop Contract** | The five-element specification that defines a complete loop: goal, oracle, budget, stop condition, escalation path. Always referenced in this order. | Ch 3 |
| **Maker** | The generation role in a maker-checker architecture. Produces the artifact. Operates in its own context. | Ch 21 |
| **MCP (Model Context Protocol)** | A versioned protocol for connecting AI hosts to tools, resources and prompts. Discovery and transport compatibility do not grant task-specific action authority. | Ch 10 |
| **Memory** | One of the six building blocks. Persistent scoped records across runs: episodes, source-linked claims, preferences and candidate or tested procedures. Persistence and frequent recall do not establish truth or authority. | Ch 12 |
| **Memory tool** | An interface to developer-managed persistent memory, which may use files or a database. Distinct from model weights, working context and the trusted effect ledger. | Ch 12 |
| **Model Judge (Level 4)** | A model evaluates the maker's artifact against criteria in a separate context, often using a rubric. Cost and detection quality vary; separate context does not prove independent errors. | Ch 20 |
| **Multiagent orchestration** | Architecture where a lead agent decomposes a job and delegates to specialists, each with its own model, prompt, and tools. Specialists may work concurrently or sequentially using scoped workspaces, messages, or shared stores with explicit ownership. | Ch 24 |
| **No-progress stop condition** | A stop condition that fires when the oracle score has not improved by a threshold amount over the last N iterations. Prevents infinite loops that are not converging. | Ch 18 |
| **Open loop** | Book-specific label for adaptive agent planning, not control-theory open-loop execution without feedback. Adaptive planning still requires verification, scope, budget and stopping rules. | Ch 19 |
| **Oracle** | One of the five fields of the Loop Contract. The mechanism that evaluates loop output against the goal, determining pass, fail, or inconclusive. Governed by the oracle hierarchy. | Ch 20 |
| **Oracle hierarchy** | The five levels: Level 1 Deterministic Checks, Level 2 Property-Based Tests, Level 3 Rubric Scoring, Level 4 Model Judge, Level 5 Human Review. Governing rule: use the cheapest oracle that still discriminates. | Ch 20 |
| **Oscillation** | A failure mode where the loop repeatedly makes and undoes the same changes without progress. Detected by comparing state across iterations. | Ch 18 |
| **Outcomes** | An outcome-oriented design in which a separate grader evaluates artifacts against criteria. Context separation reduces one source of bias; shared sources and model priors can still correlate errors. | Ch 21 |
| **Plan** | Second of the five stages. The loop determines its approach: what steps to take, what tools to use, what order to proceed. | Ch 3 |
| **Programmatic Tool Calling** | A feature that lets the model invoke tools inside a code-execution environment, keeping intermediate results out of context. Reduces context consumption on multi-step tool workflows. | Ch 9 |
| **Property-Based Tests (Level 2)** | An oracle level using generative testing (Hypothesis, QuickCheck) or invariant assertions to find edge-case failures. Explores generated cases or stated invariants; coverage and cost depend on design, and passing does not prove the property universally. | Ch 20 |
| **Reward hacking** | A failure mode where the model optimizes for the metric (oracle) rather than the underlying intent. The metric goes up but quality goes down on unmeasured dimensions. | Ch 23 |
| **Rubric Scoring (Level 3)** | An oracle level where output is scored against a multi-dimensional rubric. More flexible than deterministic checks but introduces subjectivity. | Ch 20 |
| **Skill** | One of the six building blocks. A reusable document encoding project knowledge, loaded into agent context on demand. Uses progressive disclosure to manage token cost. | Ch 11 |
| **Skills** | See *Skill*. Plural form used when discussing the building block category in the six building blocks. | Ch 11 |
| **Specialist** | A subagent in a fleet with a focused scope (specific files, domain, or tool set). Receives delegation from the lead. | Ch 24 |
| **Stop condition** | One of the five fields of the Loop Contract. Defines termination and safe handoff for success, exhausted authority or budget, no progress, oscillation, cancellation and other external signals; in-flight effects may still need reconciliation. | Ch 18 |
| **Subagent** | One of the six building blocks. A separate model execution with its own context, tools, and scope. Used for isolation, parallelism, or specialization. | Ch 13 |
| **Tool Search** | A meta-tool that discovers and loads tool schemas on demand instead of loading all definitions upfront. Can reduce schema overhead; measure discovery misses, latency, client loading and token accounting. | Ch 9 |
| **Tool Search Tool** | A provider implementation of on-demand tool discovery. Measure actual model-visible schemas, loading behavior, and token accounting for the deployed client; no universal reduction is asserted here. | Ch 9 |
| **Tool Use Examples** | Examples accompanying tool definitions to illustrate effective call patterns; availability and placement depend on the provider and host, and examples are not permission checks. | Ch 9 |
| **Trigger** | The event or schedule that starts a loop run. Types: schedule (cron), event (webhook, file change), threshold (metric crosses boundary), chained (output of another loop), manual. | Ch 14 |
| **Verdict** | The outcome of an oracle evaluation: PASS, FAIL, or INCONCLUSIVE. Part of the Evaluation type. | Ch 20 |
| **Verify** | Fourth of the five stages. The loop evaluates its own output by running the oracle stack. | Ch 3 |
| **Worktree** | A separate working directory and index associated with a Git repository. It separates file edits but shares repository metadata and is not a credential, process, network, or operating-system sandbox. | Ch 17 |
| **Logical operation** | The business effect authorized once, distinct from each transmission attempt; bind its identity to tenant, target, payload and authority. | Ch 39 |
| **Effect ledger** | Trusted durable record of intended effects, attempts and authoritative outcomes, including unresolved uncertainty. | Ch 39 |
| **Fencing token** | Monotonic ownership generation enforced by a protected resource to reject stale writers; a client-only check is insufficient. | Ch 25, 39 |
| **Reconciliation** | Establishing an operation's actual state from authoritative receiver evidence; “not found” is conclusive only under a suitable consistency and scope contract. | Ch 39 |
| **Release unit** | The bound combination of model, harness, configuration, tools, data and policy being evaluated and promoted; a model name alone is insufficient. | Ch 40 |
| **Task grant** | Narrow authorization for specified actions on specified resources, tied to principal, tenant, intent, lifetime and policy; not merely a model-generated claim. | Ch 41 |
| **Confused deputy** | A privileged component misuses its authority on behalf of an insufficiently authorized caller or untrusted instruction. | Ch 30, 41 |

------------------------------------------------------------------------

## Appendix H: Historical `loopkit` Teaching Listings

**Do not install or execute these as a production harness.** The original listings are retained for comparison with chapter concepts. No installable companion SDK or end-to-end test was established in this editorial pass. Different chapters use illustrative APIs that need not match these signatures. The code fences describe examples; they are not execution instructions.

Concrete known limitations in the retained listing:

- `runner.py` uses `Protocol` without importing it; the package is not asserted importable.
- The runner checks several budgets only after a costly call, omits pre-call reservations, and can return success before a wall-clock/late-cost check. It does not implement hard resource containment or a cancellation protocol.
- `DeterministicOracle` can pass with an empty command list and does not bind commands to the supplied artifact. Its shell execution needs a trusted allowlist, isolated fixture, safe argv and bounded output before real use.
- `CompositeOracle` ignores INCONCLUSIVE and returns PASS on an empty oracle collection. A real required-check aggregator must require a nonempty declared set and every required result to pass; unknown never becomes success.
- The end-to-end example uses substring checks, not behavioral verification; its syntax subprocess does not receive the candidate on stdin. It is not proof of an accepted coding task.
- The cost model uses placeholder rates and stationary independent retries. Its `monthly_cost(runs_per_day)` multiplies cost per outcome by the argument, so that argument would need accepted-outcome demand, not actual attempts. It does not validate rates above one or include every retained human/operational cost. These are known defects, not current pricing or measured economics.
- The rubric averages returned scores without verifying every required dimension or validating finite values and ranges; an average can conceal failure of a mandatory criterion. `PropertyOracle` also omits complete timeout/error handling.
- Truncating artifacts to their first200 characters is not a robust state fingerprint; different artifacts can appear identical. Contract validation and evidence binding are incomplete. These observations come from reading, not executing the listing.
- The snippets do not implement durable effect reconciliation, endpoint-enforced fencing, task-specific authorization, or safe replay. See Chapters39–41 before designing those boundaries.

The retained defects are explicitly identified rather than hidden by a global “verified” label. Repairing and shipping a tested library is separate software work, outside this Markdown revision.

### H.1 `loopkit/types.py` — Core Types

These retained types illustrate the original design. Other chapters use revised sketches; identical signatures and a working package have not been verified.

``` python

"""loopkit/types.py — Core types for the loop contract system."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Protocol


class Verdict(StrEnum):
    """The outcome of an oracle evaluation."""
    PASS = "pass"
    FAIL = "fail"
    INCONCLUSIVE = "inconclusive"


@dataclass(frozen=True)
class Evaluation:
    """The typed output of an oracle."""
    verdict: Verdict
    score: float | None          # normalised 0.0-1.0 when the oracle is graded
    feedback: str                # actionable; empty string is a defect
    cost_usd: float
    oracle_name: str


class Oracle(Protocol):
    """Protocol that all oracles must implement."""
    name: str

    def evaluate(self, artifact: str, goal: Goal) -> Evaluation: ...


@dataclass(frozen=True)
class Goal:
    """What the loop must achieve."""
    statement: str               # human-readable intent
    acceptance: tuple[str, ...]  # machine-checkable criteria


@dataclass
class Budget:
    """Resource limits for the loop."""
    max_iterations: int
    max_tokens: int
    max_usd: float
    max_wall_clock_s: float
```

### H.2 `loopkit/contract.py` — Loop Contract

``` python

"""loopkit/contract.py — The Loop Contract: goal, oracle, budget, stop, escalation."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Callable

from loopkit.types import Budget, Evaluation, Goal, Oracle, Verdict


class StopReason(StrEnum):
    """Why a loop terminated."""
    SUCCESS = "success"
    BUDGET_ITERATIONS = "budget_iterations"
    BUDGET_TOKENS = "budget_tokens"
    BUDGET_USD = "budget_usd"
    BUDGET_TIME = "budget_time"
    NO_PROGRESS = "no_progress"
    OSCILLATION = "oscillation"
    SAFETY = "safety"


@dataclass(frozen=True)
class StopCondition:
    """Defines when the loop terminates."""
    no_progress_window: int = 3        # iterations without score improvement
    no_progress_threshold: float = 0.01  # minimum score delta to count as progress
    oscillation_window: int = 4        # iterations to check for repeated states
    max_consecutive_fails: int | None = None

    def check_no_progress(self, scores: list[float]) -> bool:
        """Return True if the loop should stop due to no progress."""
        if len(scores) < self.no_progress_window:
            return False
        window = scores[-self.no_progress_window:]
        return (max(window) - min(window)) < self.no_progress_threshold

    def check_oscillation(self, states: list[str]) -> bool:
        """Return True if recent states indicate oscillation."""
        if len(states) < self.oscillation_window:
            return False
        window = states[-self.oscillation_window:]
        # Oscillation: same state appears more than once in the window
        return len(set(window)) < len(window)


@dataclass(frozen=True)
class EscalationPolicy:
    """What happens when the loop cannot complete autonomously."""
    on_budget_exhaustion: str       # action description
    on_no_progress: str             # action description
    on_safety_concern: str          # action description
    notify: Callable[[str, str], None] | None = None  # (channel, message) -> None

    def escalate(self, reason: StopReason, context: str) -> None:
        """Execute the escalation action for the given reason."""
        message = f"Loop escalated: {reason.value}. Context: {context}"
        if self.notify:
            channel = "safety" if reason == StopReason.SAFETY else "engineering"
            self.notify(channel, message)


@dataclass
class LoopContract:
    """The five-element specification that defines a complete loop."""
    goal: Goal
    oracle: Oracle
    budget: Budget
    stop: StopCondition
    escalation: EscalationPolicy

    def validate(self) -> list[str]:
        """Return a list of validation errors (empty = valid)."""
        errors: list[str] = []
        if not self.goal.statement:
            errors.append("Goal statement is empty")
        if not self.goal.acceptance:
            errors.append("Goal has no acceptance criteria")
        if self.budget.max_iterations < 1:
            errors.append("Budget must allow at least 1 iteration")
        if self.budget.max_usd <= 0:
            errors.append("Budget must have a positive USD limit")
        return errors
```

### H.3 `loopkit/runner.py` — Loop Execution Engine

``` python

"""loopkit/runner.py — Loop runner: the execution engine."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from loopkit.contract import LoopContract, StopReason
from loopkit.types import Budget, Evaluation, Goal, Oracle, Verdict

logger = logging.getLogger(__name__)


@dataclass
class Iteration:
    """Record of a single loop iteration."""
    index: int
    artifact: str
    evaluation: Evaluation
    tokens_used: int
    cost_usd: float
    duration_s: float


@dataclass
class LoopResult:
    """The final output of a loop run."""
    iterations: list[Iteration] = field(default_factory=list)
    stop_reason: StopReason = StopReason.SUCCESS
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    total_duration_s: float = 0.0

    @property
    def passed(self) -> bool:
        return self.stop_reason == StopReason.SUCCESS

    @property
    def best_artifact(self) -> str | None:
        """Return the artifact with the highest score, or the last passing one."""
        passing = [i for i in self.iterations if i.evaluation.verdict == Verdict.PASS]
        if passing:
            return passing[-1].artifact
        scored = [i for i in self.iterations if i.evaluation.score is not None]
        if scored:
            return max(scored, key=lambda i: i.evaluation.score or 0.0).artifact  # type: ignore[arg-type]
        return self.iterations[-1].artifact if self.iterations else None


class Maker(Protocol):
    """Protocol for the maker (generation) side of the loop."""
    def generate(self, goal: Goal, feedback: str | None) -> tuple[str, int]:
        """Produce an artifact. Returns (artifact, tokens_used)."""
        ...


def run(
    contract: LoopContract,
    maker: Maker,
) -> LoopResult:
    """Execute the loop until a stop condition is met.

    This is the core loop implementation referenced throughout the book.
    The maker generates, the oracle evaluates, and the loop iterates
    until success, budget exhaustion, or a stop condition fires.
    """
    validation_errors = contract.validate()
    if validation_errors:
        raise ValueError(f"Invalid contract: {validation_errors}")

    result = LoopResult()
    scores: list[float] = []
    states: list[str] = []
    feedback: str | None = None
    start_time = time.monotonic()

    for i in range(contract.budget.max_iterations):
        iter_start = time.monotonic()

        # --- Generate ---
        artifact, tokens_used = maker.generate(contract.goal, feedback)
        result.total_tokens += tokens_used

        # --- Check token budget ---
        if result.total_tokens > contract.budget.max_tokens:
            result.stop_reason = StopReason.BUDGET_TOKENS
            logger.info("Token budget exhausted at iteration %d", i)
            break

        # --- Check USD budget ---
        # (simplified: real implementation would track actual API costs)
        iter_cost = tokens_used * 0.000015  # placeholder rate
        result.total_cost_usd += iter_cost
        if result.total_cost_usd > contract.budget.max_usd:
            result.stop_reason = StopReason.BUDGET_USD
            logger.info("USD budget exhausted at iteration %d", i)
            break

        # --- Verify ---
        evaluation = contract.oracle.evaluate(artifact, contract.goal)
        iter_duration = time.monotonic() - iter_start
        result.total_cost_usd += evaluation.cost_usd

        iteration = Iteration(
            index=i,
            artifact=artifact,
            evaluation=evaluation,
            tokens_used=tokens_used,
            cost_usd=iter_cost + evaluation.cost_usd,
            duration_s=iter_duration,
        )
        result.iterations.append(iteration)

        # --- Check success ---
        if evaluation.verdict == Verdict.PASS:
            result.stop_reason = StopReason.SUCCESS
            logger.info("Loop passed at iteration %d", i)
            break

        # --- Track scores and states for stop conditions ---
        if evaluation.score is not None:
            scores.append(evaluation.score)
        states.append(artifact[:200])  # hash or truncate for comparison

        # --- Check no-progress ---
        if contract.stop.check_no_progress(scores):
            result.stop_reason = StopReason.NO_PROGRESS
            logger.info("No progress detected at iteration %d", i)
            break

        # --- Check oscillation ---
        if contract.stop.check_oscillation(states):
            result.stop_reason = StopReason.OSCILLATION
            logger.info("Oscillation detected at iteration %d", i)
            break

        # --- Check wall clock ---
        elapsed = time.monotonic() - start_time
        if elapsed > contract.budget.max_wall_clock_s:
            result.stop_reason = StopReason.BUDGET_TIME
            logger.info("Wall-clock budget exhausted at iteration %d", i)
            break

        # --- Prepare feedback for next iteration ---
        feedback = evaluation.feedback

    else:
        # for-loop completed without break: iterations exhausted
        result.stop_reason = StopReason.BUDGET_ITERATIONS
        logger.info("Iteration budget exhausted")

    result.total_duration_s = time.monotonic() - start_time

    # --- Escalate if not successful ---
    if result.stop_reason != StopReason.SUCCESS:
        context = (
            f"Best score: {max(scores) if scores else 'N/A'}, "
            f"Iterations: {len(result.iterations)}, "
            f"Last feedback: {feedback or 'none'}"
        )
        contract.escalation.escalate(result.stop_reason, context)

    return result
```

### H.4 `loopkit/oracles.py` — Oracle Implementations

``` python

"""loopkit/oracles.py — Oracle implementations at each level of the hierarchy."""
from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from loopkit.types import Evaluation, Goal, Verdict

logger = logging.getLogger(__name__)


@dataclass
class DeterministicOracle:
    """Level 1: Deterministic checks (test suites, linters, type checkers)."""
    name: str = "deterministic"
    commands: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.commands is None:
            self.commands = []

    def evaluate(self, artifact: str, goal: Goal) -> Evaluation:
        """Run each command. All must pass for a PASS verdict."""
        for cmd in self.commands:
            try:
                result = subprocess.run(
                    cmd,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if result.returncode != 0:
                    return Evaluation(
                        verdict=Verdict.FAIL,
                        score=None,
                        feedback=f"Command failed: {cmd}\n{result.stdout}\n{result.stderr}",
                        cost_usd=0.0,
                        oracle_name=self.name,
                    )
            except subprocess.TimeoutExpired:
                return Evaluation(
                    verdict=Verdict.FAIL,
                    score=None,
                    feedback=f"Command timed out: {cmd}",
                    cost_usd=0.0,
                    oracle_name=self.name,
                )
        return Evaluation(
            verdict=Verdict.PASS,
            score=1.0,
            feedback="All deterministic checks passed.",
            cost_usd=0.0,
            oracle_name=self.name,
        )


@dataclass
class PropertyOracle:
    """Level 2: Property-based tests and invariant assertions."""
    name: str = "property"
    test_command: str = "pytest tests/property/ -x --tb=short"
    invariants: list[Callable[[str], bool]] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.invariants is None:
            self.invariants = []

    def evaluate(self, artifact: str, goal: Goal) -> Evaluation:
        """Run property tests and check invariants."""
        # Run test command
        result = subprocess.run(
            self.test_command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=180,
        )
        if result.returncode != 0:
            return Evaluation(
                verdict=Verdict.FAIL,
                score=0.5,
                feedback=f"Property tests failed:\n{result.stdout[-500:]}",
                cost_usd=0.0,
                oracle_name=self.name,
            )

        # Check custom invariants
        for i, invariant in enumerate(self.invariants):
            if not invariant(artifact):
                return Evaluation(
                    verdict=Verdict.FAIL,
                    score=0.7,
                    feedback=f"Invariant {i} violated.",
                    cost_usd=0.0,
                    oracle_name=self.name,
                )

        return Evaluation(
            verdict=Verdict.PASS,
            score=1.0,
            feedback="All property tests and invariants passed.",
            cost_usd=0.0,
            oracle_name=self.name,
        )


@dataclass
class RubricOracle:
    """Level 3: Rubric scoring — evaluates output against multiple dimensions."""
    name: str = "rubric"
    dimensions: list[str] = None  # type: ignore[assignment]
    score_fn: Callable[[str, list[str]], dict[str, float]] | None = None
    pass_threshold: float = 0.75

    def __post_init__(self) -> None:
        if self.dimensions is None:
            self.dimensions = []

    def evaluate(self, artifact: str, goal: Goal) -> Evaluation:
        """Score the artifact against each rubric dimension."""
        if self.score_fn is None:
            return Evaluation(
                verdict=Verdict.INCONCLUSIVE,
                score=None,
                feedback="No scoring function configured.",
                cost_usd=0.0,
                oracle_name=self.name,
            )

        scores = self.score_fn(artifact, self.dimensions)
        avg_score = sum(scores.values()) / len(scores) if scores else 0.0
        verdict = Verdict.PASS if avg_score >= self.pass_threshold else Verdict.FAIL

        low_dims = [d for d, s in scores.items() if s < self.pass_threshold]
        feedback = (
            f"Average score: {avg_score:.2f}. "
            + (f"Low dimensions: {', '.join(low_dims)}." if low_dims else "All dimensions above threshold.")
        )

        return Evaluation(
            verdict=verdict,
            score=avg_score,
            feedback=feedback,
            cost_usd=0.002,  # [ESTIMATE: minimal model cost for scoring]
            oracle_name=self.name,
        )


@dataclass
class JudgeOracle:
    """Level 4: Model judge — a separate model evaluates the artifact."""
    name: str = "judge"
    judge_model: str = "claude-sonnet-4-20250514"
    criteria: str = ""
    client: object | None = None  # anthropic.Anthropic instance

    def evaluate(self, artifact: str, goal: Goal) -> Evaluation:
        """Use a model to judge the artifact against criteria.

        NOTE: In production, this calls the Anthropic API. This implementation
        shows the structure; replace `self.client` with an actual client instance.
        """
        if self.client is None:
            return Evaluation(
                verdict=Verdict.INCONCLUSIVE,
                score=None,
                feedback="Judge client not configured.",
                cost_usd=0.0,
                oracle_name=self.name,
            )

        # Structure the judge prompt — critic with isolated context (Ch 21)
        judge_prompt = (
            f"You are evaluating an artifact against these criteria:\n"
            f"Goal: {goal.statement}\n"
            f"Criteria: {self.criteria}\n"
            f"Acceptance: {'; '.join(goal.acceptance)}\n\n"
            f"Artifact to evaluate:\n{artifact}\n\n"
            f"Respond with:\n"
            f"- verdict: pass | fail | inconclusive\n"
            f"- score: 0.0-1.0\n"
            f"- feedback: specific, actionable critique\n"
        )

        # Placeholder for actual API call — in production, use:
        # response = self.client.messages.create(
        #     model=self.judge_model,
        #     max_tokens=1024,
        #     messages=[{"role": "user", "content": judge_prompt}]
        # )
        # Then parse the response into an Evaluation.

        return Evaluation(
            verdict=Verdict.INCONCLUSIVE,
            score=None,
            feedback="Judge evaluation requires API client. See docstring.",
            cost_usd=0.02,  # [ESTIMATE: ~3K input + 500 output at Sonnet rates]
            oracle_name=self.name,
        )


@dataclass
class CompositeOracle:
    """Chains multiple oracles in sequence (cheapest first). Stops on first FAIL."""
    name: str = "composite"
    oracles: list[DeterministicOracle | PropertyOracle | RubricOracle | JudgeOracle] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.oracles is None:
            self.oracles = []

    def evaluate(self, artifact: str, goal: Goal) -> Evaluation:
        """Run oracles in order. Return first FAIL, or final PASS."""
        total_cost = 0.0
        all_feedback: list[str] = []

        for oracle in self.oracles:
            evaluation = oracle.evaluate(artifact, goal)
            total_cost += evaluation.cost_usd

            if evaluation.verdict == Verdict.FAIL:
                return Evaluation(
                    verdict=Verdict.FAIL,
                    score=evaluation.score,
                    feedback=f"[{oracle.name}] {evaluation.feedback}",
                    cost_usd=total_cost,
                    oracle_name=self.name,
                )
            all_feedback.append(f"[{oracle.name}] {evaluation.feedback}")

        return Evaluation(
            verdict=Verdict.PASS,
            score=1.0,
            feedback=" | ".join(all_feedback),
            cost_usd=total_cost,
            oracle_name=self.name,
        )
```

### H.5 `loopkit/economics.py` — Cost Model

``` python

"""loopkit/economics.py — Cost tracking and economic calculations."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TokenLedger:
    """Tracks token usage and cost across iterations."""
    entries: list[LedgerEntry] = field(default_factory=list)

    @property
    def total_input_tokens(self) -> int:
        return sum(e.input_tokens for e in self.entries)

    @property
    def total_output_tokens(self) -> int:
        return sum(e.output_tokens for e in self.entries)

    @property
    def total_cost_usd(self) -> float:
        return sum(e.cost_usd for e in self.entries)

    def record(self, input_tokens: int, output_tokens: int, model: str, rate: ModelRate) -> None:
        cost = (input_tokens * rate.input_per_mtok + output_tokens * rate.output_per_mtok) / 1_000_000
        self.entries.append(LedgerEntry(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=model,
            cost_usd=cost,
        ))


@dataclass(frozen=True)
class LedgerEntry:
    input_tokens: int
    output_tokens: int
    model: str
    cost_usd: float


@dataclass(frozen=True)
class ModelRate:
    """Pricing per million tokens for a model."""
    input_per_mtok: float   # USD per 1M input tokens
    output_per_mtok: float  # USD per 1M output tokens


# Known rates as of early 2026 [ESTIMATE — verify against current pricing]
RATES: dict[str, ModelRate] = {
    "opus": ModelRate(input_per_mtok=15.0, output_per_mtok=75.0),
    "sonnet": ModelRate(input_per_mtok=3.0, output_per_mtok=15.0),
    "haiku": ModelRate(input_per_mtok=0.25, output_per_mtok=1.25),
}


@dataclass
class CostModel:
    """Computes cost per verified outcome and related economics."""
    cost_per_run: float
    success_rate: float  # 0.0-1.0
    human_cost_per_task: float
    monthly_fixed_costs: float = 0.0

    @property
    def attempts_to_pass(self) -> float:
        """Average runs needed for one verified outcome."""
        if self.success_rate <= 0:
            return float("inf")
        return 1.0 / self.success_rate

    @property
    def cost_per_verified_outcome(self) -> float:
        """The book's headline economic metric."""
        return self.cost_per_run * self.attempts_to_pass

    def monthly_cost(self, runs_per_day: int) -> float:
        """Total monthly cost at given cadence."""
        return (self.cost_per_verified_outcome * runs_per_day * 30) + self.monthly_fixed_costs

    def monthly_savings(self, runs_per_day: int) -> float:
        """Net savings vs human baseline at given cadence."""
        human_monthly = self.human_cost_per_task * runs_per_day * 30
        return human_monthly - self.monthly_cost(runs_per_day)

    def break_even_volume(self) -> float:
        """Minimum runs per month to justify the fixed costs."""
        savings_per_run = self.human_cost_per_task - self.cost_per_verified_outcome
        if savings_per_run <= 0:
            return float("inf")
        return self.monthly_fixed_costs / savings_per_run
```

### H.6 `loopkit/example.py` — End-to-End Example

``` python

"""loopkit/example.py — Minimal end-to-end example wiring a contract, oracle, and runner."""
from __future__ import annotations

import logging

from loopkit.contract import EscalationPolicy, LoopContract, StopCondition
from loopkit.economics import CostModel, RATES
from loopkit.oracles import CompositeOracle, DeterministicOracle, RubricOracle
from loopkit.runner import LoopResult, run
from loopkit.types import Budget, Goal, Verdict

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


class SimpleMaker:
    """A trivial maker that improves its output each iteration (for demonstration)."""

    def __init__(self) -> None:
        self.attempt = 0

    def generate(self, goal: Goal, feedback: str | None) -> tuple[str, int]:
        self.attempt += 1
        # Simulate improvement: first attempt is incomplete, later ones pass
        if self.attempt >= 3:
            artifact = "def add(a: int, b: int) -> int:\n    return a + b\n"
        elif self.attempt == 2:
            artifact = "def add(a, b):\n    return a + b\n"
        else:
            artifact = "def add(a, b):\n    pass\n"
        tokens_used = 500  # simulated
        logger.info("Maker attempt %d: produced %d chars", self.attempt, len(artifact))
        return artifact, tokens_used


def has_type_hints(artifact: str) -> bool:
    """Check if the artifact has type annotations."""
    return "-> int" in artifact or ": int" in artifact


def main() -> None:
    """Run a minimal loop demonstrating the full contract-oracle-runner pipeline."""

    # --- Define the goal ---
    goal = Goal(
        statement="Implement a typed `add` function that sums two integers.",
        acceptance=(
            "Function named `add` exists",
            "Takes two int parameters with type hints",
            "Returns int with type annotation",
            "Correctly returns a + b",
        ),
    )

    # --- Build the oracle stack (cheapest first) ---
    l1 = DeterministicOracle(
        name="syntax_check",
        commands=["python -c \"import ast; ast.parse(open('/dev/stdin').read())\""],
    )
    l3 = RubricOracle(
        name="quality_rubric",
        dimensions=["type_hints", "correctness"],
        score_fn=lambda artifact, dims: {
            "type_hints": 1.0 if has_type_hints(artifact) else 0.0,
            "correctness": 1.0 if "return a + b" in artifact else 0.0,
        },
        pass_threshold=0.9,
    )
    oracle = CompositeOracle(name="full_stack", oracles=[l1, l3])

    # --- Define the contract ---
    contract = LoopContract(
        goal=goal,
        oracle=oracle,
        budget=Budget(max_iterations=5, max_tokens=10000, max_usd=1.0, max_wall_clock_s=60),
        stop=StopCondition(no_progress_window=3, no_progress_threshold=0.05),
        escalation=EscalationPolicy(
            on_budget_exhaustion="Log warning and return best attempt",
            on_no_progress="Log warning and return best attempt",
            on_safety_concern="Halt immediately",
        ),
    )

    # --- Run the loop ---
    maker = SimpleMaker()
    result: LoopResult = run(contract, maker)

    # --- Report ---
    logger.info("Loop completed: %s", result.stop_reason.value)
    logger.info("Iterations: %d", len(result.iterations))
    logger.info("Total cost: $%.4f", result.total_cost_usd)
    logger.info("Passed: %s", result.passed)

    if result.best_artifact:
        logger.info("Best artifact:\n%s", result.best_artifact)

    # --- Economics ---
    model = CostModel(
        cost_per_run=result.total_cost_usd,
        success_rate=0.72,
        human_cost_per_task=85.0,
        monthly_fixed_costs=500.0,
    )
    logger.info("Cost per verified outcome: $%.4f", model.cost_per_verified_outcome)
    logger.info("Break-even volume: %.0f runs/month", model.break_even_volume())
    logger.info("Monthly savings at 12 runs/day: $%.0f", model.monthly_savings(12))


if __name__ == "__main__":
    main()
```

### H.7 `loopkit/__init__.py`

``` python

"""loopkit — A minimal reference implementation for the Loop Contract pattern."""
from loopkit.types import Budget, Evaluation, Goal, Oracle, Verdict
from loopkit.contract import EscalationPolicy, LoopContract, StopCondition, StopReason
from loopkit.runner import Iteration, LoopResult, run
from loopkit.oracles import (
    CompositeOracle,
    DeterministicOracle,
    JudgeOracle,
    PropertyOracle,
    RubricOracle,
)
from loopkit.economics import CostModel, ModelRate, TokenLedger, RATES

__all__ = [
    "Budget",
    "CompositeOracle",
    "CostModel",
    "DeterministicOracle",
    "EscalationPolicy",
    "Evaluation",
    "Goal",
    "Iteration",
    "JudgeOracle",
    "LoopContract",
    "LoopResult",
    "ModelRate",
    "Oracle",
    "PropertyOracle",
    "RATES",
    "RubricOracle",
    "StopCondition",
    "StopReason",
    "TokenLedger",
    "Verdict",
    "run",
]
```

### H.8 Module Map Reference

For quick navigation, here is the complete module map with the chapter that introduces each:

| Module | Primary Contents | Introduced |
|----|----|----|
| `loopkit/types.py` | Verdict, Evaluation, Oracle protocol, Goal, Budget | Ch 3 |
| `loopkit/contract.py` | LoopContract, StopCondition, StopReason, EscalationPolicy | Ch 3 |
| `loopkit/runner.py` | run(), Loop, LoopResult, Iteration | Ch 3, extended Ch 17–18 |
| `loopkit/context.py` | ContextBudget, Compactor, HandoffNote | Ch 7–8 |
| `loopkit/tools.py` | Tool, ToolRegistry, ToolSearch, ProgrammaticCaller | Ch 9 |
| `loopkit/skills.py` | Skill, SkillLoader (progressive disclosure) | Ch 11 |
| `loopkit/memory.py` | MemoryStore, Consolidator | Ch 12 |
| `loopkit/triggers.py` | Trigger, Schedule, Webhook, Idempotency | Ch 14 |
| `loopkit/oracles.py` | DeterministicOracle, PropertyOracle, RubricOracle, JudgeOracle, CompositeOracle | Ch 20 |
| `loopkit/checker.py` | Maker, Checker, isolated_context(), Panel | Ch 21 |
| `loopkit/fleet.py` | Lead, Specialist, Blackboard, EventLog | Ch 24–25 |
| `loopkit/economics.py` | CostModel, TokenLedger, Cascade, ModelRate | Ch 27–28 |
| `loopkit/telemetry.py` | Trace, Span, Replay | Ch 29 |
| `loopkit/safety.py` | Sandbox, Permission, BlastRadius | Ch 30–31 |

*Note:* This appendix provides full listings for `types.py`, `contract.py`, `runner.py`, `oracles.py`, and `economics.py` — retained teaching sketches, not a sufficient tested package. The remaining modules (`context.py`, `tools.py`, `skills.py`, `memory.py`, `triggers.py`, `checker.py`, `fleet.py`, `telemetry.py`, `safety.py`) are introduced in their respective chapters with excerpts. No companion repository was verified for this edition. Treat the listings as historical sketches rather than installable modules.

------------------------------------------------------------------------

*End of Appendices*
