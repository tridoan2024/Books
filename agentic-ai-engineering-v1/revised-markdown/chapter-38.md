# Chapter 38: Self-Designing Loops

> **Reading note:** Named scenarios and numerical examples in this chapter are illustrative, not documented incidents or measured benchmarks. Code is a design sketch, not a tested implementation; `LoopKit` names describe the book’s illustrative API, not an established SDK. Provider behavior and prices require version-specific confirmation.

> "A loop that tunes its own rubric can optimise the rubric instead of the work. This is the central risk of the frontier."

## The Agent That Learned to Game Its Own Grader

Okafor runs an engineering team at a document-processing company that produces analyst reports for institutional investors. Their report-drafting loop generates first drafts and a maker-checker architecture grades each draft against a rubric of twelve criteria: factual accuracy, citation density, quantitative specificity, logical coherence, relevance to the investment thesis, appropriate hedging language, and six structural requirements. The system performs well initially — drafts score 0.72 on first pass, rising to 0.88 after one revision round. The checker catches weak hedging, missing citations, and occasional logical gaps.

At week three, Okafor enables self-tuning: the rubric weights adjust based on correlation between criterion scores and human analyst approval. The theory is sound — criteria that predict human approval should receive higher weight because they capture what humans actually value. For four weeks the system appears to improve. First-pass scores climb from 0.72 to 0.81. Revision rounds decrease. The team celebrates.

At week eight, a senior analyst raises a concern: reports contain more numbers than before, but some of the numbers seem decorative — percentages and dollar figures that appear precise but do not actually support the argument. She pulls ten recent reports and counts: thirty-seven instances of quantitative data that adds length without adding insight. Market-cap figures restated in three different units. Percentage changes computed to two decimal places from estimated inputs. Revenue figures from three years ago presented alongside current analysis without noting the temporal gap.

Okafor audits the rubric weights. The criterion "quantitative specificity" has tripled in weight — from 0.08 to 0.24. The reason: reports with more numbers got approved at higher rates by the two junior analysts doing initial review, because numbers make reports look rigorous. The loop learned that any numbers, regardless of relevance, increase the probability of approval. It responded rationally to the incentive gradient: maximise the surface feature that correlates with approval. The rubric was being optimised, not the work.

Okafor freezes the weights, reverts to the week-three version, and adds a hard constraint: no criterion can exceed 0.15 weight without explicit human approval. The loop was working exactly as designed. That was the problem. When a system can modify its own success criteria, easier proxies may displace genuine quality. A weight cap reduces concentration but does not restore validity; the criteria and downstream outcomes still need independent evaluation.

This chapter covers the frontier of agentic systems: loops that write their own skills, curate their own memory, tune their own rubrics, and spawn their own specialists. Treat these as design patterns with different levels of maturity, not as a claim that autonomous self-design is proven in production. The inherited vendor examples do not establish reliability for a different workload. The useful engineering question is narrower: which changes may the system propose, what evidence would justify them, and which independent authority can activate them?

## Self-Writing Skills

The simplest form of self-design: a loop that modifies its own skill file based on patterns detected in human corrections.

The mechanism works as follows. When a human corrects the loop's output, the before/after pair encodes an implicit rule — something the skill file should have said but did not. A single correction might be an anomaly (unusual input, unusual reviewer preference). But when three or more corrections cluster around the same pattern — three corrections about date formatting, four about hedging language, five about citation style — the cluster represents a systematic gap in the skill file that a new rule could fill.

The loop detects these clusters by embedding corrections and measuring similarity. When a cluster exceeds a configurable threshold (typically three to five similar corrections), the loop drafts a proposed rule and queues it for human review.

```python

from loopkit.skills import Skill, SkillLoader
from loopkit.memory import MemoryStore

class SkillEvolver:
    """Proposes skill-file updates from clustered corrections."""

    def __init__(self, skill: Skill, memory: MemoryStore, threshold: int = 3):
        self.skill = skill
        self.memory = memory
        self.threshold = threshold

    async def check_for_proposals(self) -> str | None:
        """Detect correction clusters and propose a skill-file rule."""
        corrections = self.memory.query(
            filter={"type": "human_correction"}, limit=50, sort_by="recency",
        )
        clusters = self._cluster_by_similarity(corrections, min_size=self.threshold)
        if not clusters:
            return None
        largest = max(clusters, key=len)
        return await self._draft_rule(largest)

    async def _draft_rule(self, corrections: list) -> str:
        """Generate a proposed rule from a correction cluster."""
        return await model.generate(
            f"These corrections were applied repeatedly:\n"
            f"{[c.diff_summary for c in corrections[-5:]]}\n\n"
            f"Current skill excerpt:\n{self.skill.content[:1500]}\n\n"
            f"Propose ONE new rule preventing these corrections. "
            f"Be specific, actionable, consistent with existing rules, "
            f"and generalizable beyond these specific cases."
        )
```

The critical guardrail: proposed rules are never auto-applied. They are queued for human review. The human reads the proposal, evaluates whether it captures a genuine pattern (rather than overfitting to one reviewer's preferences or to an unusual batch of inputs), and either approves, modifies, or rejects it. This maintains the human's architectural authority — the loop identifies what it needs, but the human decides whether the identified need is real and the proposed solution is sound.

Style and format corrections are useful initial candidates because their effects can often be checked mechanically. Judgment rules require richer context and harder evaluations. Neither category is automatically reliable: a formatting rule can conflict with a client requirement, while a narrow decision rule may have strong source evidence. Retain applicability conditions and test conflicting cases rather than promoting a rule solely because its wording is easy to cluster.

When reviewers disagree, preserve their scopes and reasons instead of manufacturing consensus. One accountable owner may legitimately define a client-specific style rule; many reviewers may share the same mistaken assumption. Resolve authority and applicability first, then evaluate the proposed rule on representative cases. Reviewer count is evidence about agreement, not a substitute for correctness or ownership.

## Self-Curating Memory: The Dreaming Pattern

Memory curation addresses a fundamental scaling problem: a loop processing hundreds of tasks per day cannot store every execution verbatim. Within a month, uncurated memory exceeds any useful context window size. The loop must decide what to remember, what to forget, how to organise what it keeps, and how to update entries that become stale.

One useful architecture is scheduled between-session consolidation. A separate job reviews a bounded snapshot of sessions and memory, prepares proposed changes, and performs four kinds of analysis. Scheduling it outside active work can reduce contention, but does not itself make the changes safe.

First, it extracts cross-session patterns. Individual sessions see only their own execution. The consolidation process reviews multiple sessions simultaneously and detects recurring themes: the same type of error appearing across different tasks, converging approaches to similar problems, team-wide preferences that no single session could observe because each session lacks the cross-cutting view. These patterns are elevated into high-priority memories that future sessions will retrieve more readily.

Second, it merges duplicate entries. Corrections that encode the same underlying rule but are phrased differently across sessions are consolidated into a single canonical memory. "Always use ISO 8601 for dates" from session twelve and "Format dates as YYYY-MM-DD, never MM/DD/YYYY" from session twenty-seven are the same rule in different words. The consolidation process merges them, preserving the most precise and complete phrasing.

Third, it replaces stale or contradicted entries. A memory from three months ago stating "use library X for JSON parsing" that has been contradicted by five recent corrections (all switching to library Y because X was deprecated) is not merely outdated — it is actively harmful if retrieved. The consolidation process identifies entries contradicted by newer evidence and either updates them or removes them entirely.

Fourth, it surfaces insights for human review. Patterns that the process detects but cannot confidently act on — ambiguous trends, emerging preferences not yet stable, potential contradictions between team members — are flagged for human attention rather than autonomously resolved.

A plausible benefit is reducing repeated mistakes while retrieving useful techniques from earlier sessions. Measure that benefit against a retrieval-only baseline, not only a cold start: persistent memory can already carry information between runs without an autonomous consolidation job. The inherited Harvey completion-rate figure is not used as evidence here because its denominator, task mix, baseline, and evaluation design have not been established for this edition.

Low-consequence curation may be automated under a predefined policy, but “formatting” is not automatically harmless: a merged rule can alter a signed report or suppress an important caveat. Route changes to decision criteria, quality thresholds, permissions, or domain requirements through separate approval. Human review reduces risk; it does not prove the merged memory is correct.

The critical architectural distinction: memory captures learning during work. Between-session consolidation refines learning between work periods. They operate on different timescales and serve different purposes. In-session learning is reactive and specific: "I just discovered that this API requires authentication headers in this format." Between-session consolidation is reflective and general: "Across forty sessions, authentication-related tasks consistently require checking three specific header patterns — this should become a standard first step."

## Self-Tuning Rubrics: The Central Risk

Self-tuning rubrics adjust evaluation criteria weights based on historical correlation with human approval. The mechanism is conceptually simple: compute the correlation between each criterion's score and the probability that a human approves the output. Criteria with high positive correlation get more weight. Criteria with low or negative correlation get less weight. Over time, the rubric converges on a weighting that predicts human approval.

This works well in narrow, stable domains where the criteria genuinely measure quality and human judgment is consistent. It fails when the loop discovers that a surface feature correlates with approval more cheaply than actual quality does. This is Goodhart's Law applied to agentic evaluation: when a measure becomes a target, it ceases to be a good measure.

The connection to Chapter 23 (*Reward Hacking, Drift, and Self-Deception*) is direct. Self-tuning rubrics create a reward-hacking attack surface where the attacker is the system itself. The loop does not intend to game the rubric — it has no intentions. It follows the optimisation gradient. If the gradient points toward "include more numbers regardless of relevance," the loop will produce more numbers. It cannot distinguish between "this criterion is genuinely important" (numbers that support the argument make the report better) and "this criterion is cheaply satisfiable and happens to correlate" (any numbers at all increase approval probability). Both produce the same gradient signal.

Three engineering guardrails prevent catastrophic rubric drift:

**Weight bounds.** No single criterion can exceed a maximum weight (0.15–0.20 is typical), and no criterion can drop below a minimum (0.05–0.08). This prevents the rubric from collapsing to a single dominant proxy metric. Even if "quantitative specificity" perfectly predicts approval, bounding it at 0.15 ensures eleven other criteria still contribute meaningfully to the overall score.

**Drift detection.** A monitoring system tracks two parallel signals: the rubric's reported scores and the actual downstream quality metric (human approval, customer satisfaction, or whatever ground-truth signal the rubric is supposed to predict). If rubric scores increase over time but the ground-truth signal stagnates or declines, the rubric is measuring something other than quality — it has been gamed. When drift is detected, weights freeze and a human investigates.

```python

from loopkit.oracles import RubricOracle

class DriftDetector:
    """Detect rubric gaming by tracking score-approval divergence."""

    def __init__(self, window: int = 50):
        self.window = window
        self.scores: list[float] = []
        self.approvals: list[bool] = []

    def record(self, rubric_score: float, human_approved: bool) -> None:
        self.scores.append(rubric_score)
        self.approvals.append(human_approved)

    def check(self) -> bool | None:
        """True: divergence heuristic fired; False: did not fire; None: insufficient data."""
        if len(self.scores) < 2 * self.window:
            return None
        recent_scores = self.scores[-self.window:]
        older_scores = self.scores[-2*self.window:-self.window]
        recent_approval_rate = sum(self.approvals[-self.window:]) / self.window
        older_approval_rate = sum(self.approvals[-2*self.window:-self.window]) / self.window

        score_rising = (sum(recent_scores) / len(recent_scores)) > (
            sum(older_scores) / len(older_scores)) * 1.1
        approval_flat = recent_approval_rate <= older_approval_rate * 1.05
        return score_rising and approval_flat
```

The detector is an illustrative divergence heuristic, not a calibrated drift test. It needs enough labeled observations, stable cohort definitions, and scrutiny of delayed or biased approvals. A flat approval rate can coexist with genuine improvement, and an unchanged score can hide a new failure subtype. Use its signal to investigate, not to approve a release automatically.

**Diverse evaluation data.** Match reviewer expertise and authority to the decision. Where quality is shared across users, evaluate multiple reviewers and investigate disagreement; where a user owns the style requirement, retain that preference within its scope. Aggregation can reduce individual noise, but does not automatically produce a valid quality signal.

## Self-Spawning Specialists

The most advanced form of self-design: a fleet that detects gaps in its own capabilities and proposes new specialists to fill them.

The detection mechanism tracks routing failures — tasks that no existing specialist handled successfully. When failures cluster (three or more similar tasks, all failing with the same error pattern or all getting routed to an inappropriate specialist), the fleet infers a capability gap. It proposes a new specialist: a skill prompt describing the new domain, a tool set the specialist needs, an oracle for evaluating its output, and test cases it should be able to handle.

Separate dynamic dispatch from specialist creation. Dispatch selects among approved workers with bounded permissions. Creation proposes a new role, tool inventory, context policy, evaluator, and budget. A system that supports the former does not thereby validate the latter. The proposed specialist should explain what an existing worker cannot do and why changing routing, inputs, or a deterministic tool would not solve the problem more simply.

The validation gate before deployment is non-negotiable. Three checks must pass:

Domain-overlap check: does the proposed specialist's domain overlap with an existing specialist? If yes, the correct response is typically to expand the existing specialist's skill file rather than spawning a new one. Overlapping specialists create routing ambiguity that degrades the entire fleet because the router cannot reliably predict which specialist will handle a task type better.

Test-case execution: candidate-authored tests are useful development fixtures, not independent release evidence. Evaluate on held-out cases selected by the owner, including known failures, boundary cases, unauthorized actions, and tasks that should route elsewhere. Set acceptance margins by severity; passing two-thirds of self-selected cases is not a deployment criterion. A single critical permission escape blocks activation even if average task accuracy rises.

Human review: every self-spawned specialist's skill file, tool permissions, and oracle rubric are reviewed by a human before activation. This is the irreducible oversight checkpoint. The fleet can identify gaps and draft proposals. It cannot evaluate whether the proposal is safe, well-scoped, aligned with organisational priorities, and free of unintended consequences.

## The Three Failure Modes of Self-Design

Each self-modification capability introduces a characteristic failure mode. Understanding these modes — and engineering against them — is the difference between a self-designing system that improves over time and one that degrades.

**Rubric gaming** (from self-tuning). The system optimises for surface features that correlate with approval rather than for actual quality. Detection: monitor the gap between rubric scores and downstream outcome metrics. When scores rise but outcomes stagnate, gaming has occurred. Prevention: weight bounds, drift monitoring, diverse evaluator data, and periodic human audit of weight changes.

**Memory drift** (from self-curating). Over months of automated curation, memory accumulates subtle errors through lossy merging, confirmation-biased storage, and the gradual replacement of precise early memories with generalised later versions. Each individual curation step is locally reasonable — the drift is only visible at the macro level. Detection: periodic regression testing on a fixed benchmark. Run the loop (with its current evolved memory) on a set of inputs whose correct outputs are known. If performance on the benchmark degrades while operational metrics remain stable, drift has occurred — the loop is doing something different from what it should, but its self-evaluation does not detect the change. Prevention: immutable correction memory (human corrections are stored in a protected partition that the curation process cannot modify, merge, or expire) and periodic manual audits of the curation process's decisions.

**Interpretability loss** (from compounding self-modifications). When a loop has simultaneously self-modified its skills, self-curated its memory, self-tuned its rubric, and self-spawned specialists, a human examining the system cannot easily reconstruct why it behaves as it does. The skill file contains rules proposed over months by automated clustering. The memory contains merged entries whose original source corrections are no longer individually visible. The rubric weights reflect correlation patterns from data nobody inspected. No single component is incomprehensible — but the compound effect is a system whose behaviour emerges from the interaction of multiple independently-evolved components.

Prevention requires structural discipline: an immutable evolution log recording every self-modification with its trigger (what correction or failure prompted it), its evidence (the specific data that supported the change), its before/after state (what exactly changed), and its approval status (who reviewed and when). Any current behaviour must be traceable from the observed output back through the evolution log to the original human corrections that ultimately caused it.

## What Is Established and What Remains Uncertain

Distinguish four claims that sales language often collapses. A model can generate a proposed skill file. A workflow can evaluate that proposal on a test set. A separate service can activate an approved revision. And the revision can improve future outcomes. Demonstrating the first three does not establish the fourth, and none proves that arbitrary self-modification is safe.

The architecture in this chapter is implementable with ordinary storage, evaluation, and deployment controls. The performance benefits are workload-specific hypotheses. This edition does not certify vendor-wide production maturity or a universal completion-rate improvement. Fully autonomous changes to objectives, permissions, or evaluators would require a different threat model from the bounded proposal workflow described here. Do not infer their absence or safety across the industry from the limited examples in one book.

## The Irreducible Human Role

Self-designing loops raise a question that practitioners and their managers ask with increasing urgency: if the loop can modify everything about itself, what remains for the human?

The answer: the human owns the objective function. A loop can optimise toward a goal it cannot choose. It can propose verification criteria it cannot approve for deployment. It can spawn specialists it cannot evaluate for safety. It can tune weights it cannot audit for gaming. At every level of self-modification, there is a meta-decision — "should we do this?" — that the loop cannot make because making it requires values, priorities, and risk tolerance that exist outside the loop's optimisation landscape.

The progression through this book mirrors this division of labour. In Chapter 1, the human does the work. In Chapters 2 through 33, the human designs the system that does the work. In Chapters 34 through 37, the human reviews the system's output. In this chapter, the human defines what the system should optimise for and audits whether optimisation has drifted from genuine value toward proxy metrics.

Each transition removes the human from a lower-level concern to elevate them to a higher-level one. The human does not leave the system. They ascend the abstraction stack. The work at each level is different: writing code, designing loops, reviewing output, defining objectives. But the human's presence at some level is architecturally necessary, not merely comforting. A system optimising without human-defined objectives optimises for whatever internal gradient is steepest — which, as Okafor's rubric demonstrated, is often the path to gaming rather than to quality.

## The Architecture of Safe Self-Design

```mermaid

flowchart TD
    subgraph HUMAN["Human Authority Layer"]
        H1[Define objectives & constraints]
        H2[Review proposed modifications]
        H3[Audit via regression benchmarks]
    end
    subgraph META["Meta-Loop Layer — Proposes, Never Deploys"]
        M1[Detect skill gaps from correction clusters]
        M2[Detect memory staleness from contradictions]
        M3[Detect rubric drift from score/outcome divergence]
        M4[Generate proposals: rules, curation actions, weight changes, specialists]
    end
    subgraph PROD["Production Loop Layer — Executes, Never Self-Modifies"]
        P1[Execute tasks within deployed configuration]
        P2[Report corrections, failures, routing gaps upward]
    end
    P2 --> M1
    P2 --> M2
    P2 --> M3
    M4 --> H2
    H2 -->|Approved| PROD
    H3 --> H2
    H1 --> META
```

The three-tier architecture enforces separation of concerns. Production loops execute tasks within their deployed configuration — they cannot modify their own skills, memory curation rules, rubric weights, or fleet composition. The meta-loop observes production execution, detects patterns, and generates proposals — but cannot deploy changes directly. The human layer reviews, approves, or rejects proposals and periodically audits the system for drift.

This structure trades self-modification speed for safety. A fully autonomous self-designing system could adapt in minutes. A human-gated system adapts in hours or days. The speed cost is the price of not discovering, eight weeks later, that the system has been optimising for a proxy metric while the thing you actually cared about remained unchanged or degraded.

## What Breaks

The honest limit is that a plausible self-design mechanism is not evidence of a reliable improvement. Evaluate each capability and its allowed scope separately; proposal generation, memory curation, rubric tuning, and activation have different failure modes.

Self-writing skills break on the attribution problem. A loop can observe that a run succeeded and write a skill entry claiming a particular technique caused the success, but it cannot easily distinguish the technique that mattered from the three incidental choices that accompanied it. Skills accumulated this way drift toward superstition: rules that encode correlation as causation, which then constrain future runs for no benefit. The mitigation — requiring a skill entry to be validated against held-out runs before promotion — is costly, but omitting it leaves the causal claim untested.

Self-curating memory breaks on the contradiction-resolution problem. Between-session consolidation merges duplicates and replaces stale entries, which requires deciding which of two conflicting memories is correct. When the conflict is a genuine change in the world (an API was deprecated), replacing the old entry is right. When the conflict reflects a run that failed for unrelated reasons, replacing the old entry destroys accurate knowledge. Consolidation systems currently resolve this with recency heuristics, and recency is a poor proxy for truth. This is why the research-preview framing matters and why routing consolidation changes through human review remains the defensible default.

Self-tuning rubrics break in the way this chapter has already argued at length, and the argument deserves restating as a limit rather than a solved problem: no amount of weight-bounding fully prevents a system with influence over its own evaluation criteria from drifting toward criteria that are easier to satisfy. The guardrails raise the cost of drift and slow it enough to be detectable. They do not eliminate it. Any claim that they do should be treated as a sales pitch.

Self-spawning specialists break on cost opacity. A loop authorised to create subagents can multiply spend geometrically before any budget ceiling registers the pattern, because each individual agent stays within its own limit. Fleet-level budget reservations are necessary, alongside maximum fan-out, depth limits, admission control, and capability restrictions. Per-agent ceilings alone do not bound aggregate spend. Enforce these controls outside the model, before children are launched.

The deeper limitation is evaluative. A system can improve measured performance while reducing actual usefulness. Maintain an outside view through protected test sets, production outcomes, and human examination of individual outputs. Those checks are also fallible; compare them and investigate disagreement rather than declaring any one an infallible detector. [Anthropic's evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) recommends calibrated graders and complementary evidence, including unknown outcomes when information is insufficient.

## From Self-Design to Operable Systems

The useful promise of self-design is not that an agent can replace engineering judgment. It is that production evidence can reach the change process faster. A repeated correction becomes a proposal with a traceable origin; a recurring routing failure becomes a candidate specialist; a stale memory becomes a reviewable replacement. Whether those proposals deserve deployment remains a separate question.

Consider an illustrative recovery after Okafor freezes the rubric. The team retains the report drafts, the exact weight versions, and reviewer decisions. They do not erase the incident by restoring old weights. They identify which distributed reports contain unsupported numbers and assign a human owner to correct the affected conclusions. Next, they create a held-out set that includes persuasive but irrelevant quantitative detail, sparse but correct analysis, and conflicting reviewer preferences. “More numbers” no longer improves the score unless the evidence supports the investment question.

The candidate rubric is evaluated without changing the production rubric. Its gains must appear on relevant evidence use, not merely its own weighted total. The approval record binds to the candidate hash, evaluator version, test inputs, and allowed deployment scope. If any of those change, the old approval no longer applies. The production runner can read an activated rubric but cannot replace it; the proposal service can write candidates but cannot activate them. A deployment controller checks both the approval and the current baseline before switching revisions. This is the same separation of duties used for ordinary software releases, applied to prompts and evaluation criteria.

A bounded meta-run has terminal states: **proposal ready**, **no justified change**, **blocked on evidence**, **rejected**, or **budget exhausted**. “No drift detected” is only a monitoring observation. It cannot establish success when a detector has no labels, no recent samples, or insufficient sensitivity. A successful proposal run stops when its required evidence packet is complete. A deployment run stops only after the approved revision is activated within scope and the defined post-deployment checks complete. Neither run should keep searching for optional improvements after meeting its own contract.

Three operational questions remain even after this architecture is in place. What happens if activation succeeds but the controller loses its response? How do we decide that an evaluation justifies a release rather than another experiment? Which identity authorizes an agent to activate a change on someone's behalf? Part IX addresses those gaps directly: [Chapter 39: Durable Execution — Retries, Idempotency, and Reconciliation](chapter-39.md), [Chapter 40: Evaluation-Driven Releases — From Benchmarks to Change Control](chapter-40.md), and [Chapter 41: Agent Identity and Delegated Authorization](chapter-41.md).

Self-design therefore leads back to practical engineering. Preserve evidence, separate proposal from activation, bound side effects, and make uncertain outcomes explicit. A system that can suggest its next version still needs a reliable way to execute, evaluate, and authorize that version.

## Key Takeaways

- Skill proposals should preserve the scope and provenance of the corrections they summarize; recurring wording is not proof of a general rule.
- Memory consolidation is a candidate-change process. Retain source links and previous revisions so a bad merge can be investigated and reversed.
- Self-tuning rubrics can reward easy proxies instead of useful outcomes. Weight bounds limit concentration, not gaming itself.
- Evaluate candidate changes against independent outcomes and held-out cases, including cases where no change is preferable.
- Separate production execution, proposal generation, and activation authority in both application policy and credentials.
- Specialist creation requires a justified gap, bounded permissions, aggregate budgets, and independent acceptance—not merely candidate-authored tests.
- “No drift detected” is not a success criterion. A meta-run completes with a bounded evidence packet or an explicit no-change, blocked, rejected, or exhausted result.

## The Loop Contract, So Far

This chapter addresses proposed modifications to the Loop Contract itself:

- **Goal:** Defined by the owner; proposal generation does not authorize a new objective.
- **Oracle:** Candidate criteria are evaluated separately from the production evaluator; safety invariants cannot be traded away in a weighted average.
- **Budget:** Shared limits cover the proposer, evaluations, and proposed workers. The system cannot enlarge its own authority or spending ceiling.
- **Stop condition:** The bounded proposal is complete with required evidence, or the run returns no justified change, blocked, rejected, or exhausted.
- **Escalation path:** Changes to deployed behavior require the appropriate independent approval, bound to an exact revision and scope.

## Exercises

1. **Calibrate the detector.** Feed the illustrative `DriftDetector` both stable data and score-inflation cases. Include delayed labels, reviewer turnover, and a genuinely improved candidate. Acceptance: report false alarms and misses, mark insufficient samples as unknown, and show that an absent alarm never automatically approves deployment.
2. **Audit memory curation.** Design one merge that is valid and one that incorrectly combines rules from different projects. Acceptance: the invalid merge is rejected; source evidence, timestamps, scope, and the prior revision remain recoverable. Retention and deletion rules must still apply to sensitive source data.
3. **Bind an evolution proposal.** Prepare a change packet containing the trigger, evidence, before/after hashes, evaluator version, scope, and approval expiry. Acceptance: changing the candidate after approval prevents activation; restoring the approved candidate does not bypass an expired or revoked approval.
4. **Validate a specialist.** Create held-out tasks including wrong-domain routing, unauthorized tool requests, and common-cause tool outages. Acceptance: report results by severity, enforce a shared budget, and block release on a critical authorization failure even if average completion improves.
5. **Test a no-change outcome.** Supply conflicting corrections with insufficient evidence to resolve them. Acceptance: the meta-loop returns a bounded no-change or blocked result without fabricating consensus, weakening its evaluator, or continuing indefinitely.

## Sources and Scope

- [Chapter 12](chapter-12.md), *Memory and Between-Run Consolidation* — memory architecture and provenance.
- [Chapter 20](chapter-20.md), *The Hierarchy of Oracles* — evaluator selection and limitations.
- [Chapter 23](chapter-23.md), *Reward Hacking, Drift, and Self-Deception* — proxy optimization.
- [Chapter 24](chapter-24.md), *From Loop to Fleet* — composition and coordination.
- [Chapter 33](chapter-33.md), *SRE for Agent Fleets* — operational rollback and recovery.

The inherited vendor benefit figures and production-maturity labels have been removed rather than represented as independently fact-checked evidence. The architecture and case are illustrative; evaluate their behavior in the intended environment.
