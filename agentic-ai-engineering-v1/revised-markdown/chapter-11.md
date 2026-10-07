# Chapter 11: Skills — Reusable Project Knowledge

> **Reading note.** Named practitioner scenarios and their timings, costs, and outcomes are fictional illustrations unless a specific source is identified. Numerical assumptions are not provider quotes or measured results. Code, commands, configuration, and traces are illustrative pseudocode/API sketches, not executed examples. In particular, `loopkit` is a teaching namespace, not a tested installable SDK. Legacy product attributions marked unverified are not evidence for deployment decisions.

> A loop that starts cold pays rent on every single run. Skills amortise that debt across every run that follows.

## Fifty Runs a Day, Fifty Cold Starts

Tomás Rivera runs a coding loop at a healthcare SaaS company with forty engineers and a Python monorepo containing 280,000 lines across twelve services. The loop handles small bug fixes: it reads a failing test from CI, locates the relevant source file, generates a patch, and verifies by running the affected test suite. The pass rate is respectable—first-attempt success hovers around 65%, climbing to 88% after one retry. The cost concerns Tomás more than the pass rate.

He traces the problem by annotating twenty consecutive loop runs. In eighteen of them, the agent spends its first two to three iterations on pure discovery work that produces no forward progress toward the actual fix. Iteration one reads `pyproject.toml`, the README, and the top-level directory structure. Iteration two runs `pytest --collect-only` to discover the test framework and execution pattern, then reads the project's CI configuration to understand which test suite to run. Iteration three examines two or three existing source files to learn coding conventions: the team uses dependency injection via `Depends()`, forbids default exports, and requires all monetary calculations to use the `Decimal` type rather than `float`.

Each discovery iteration consumes roughly 4,000 input tokens and generates 800–1,200 output tokens of exploration reasoning that adds nothing to the eventual fix. At Sonnet-class pricing—\$3 per million input tokens and \$15 per million output tokens as of early 2026—three discovery iterations cost approximately \$0.081 per run \[ESTIMATE, (3 × 4,000 × \$3/1M) + (3 × 1,000 × \$15/1M) = \$0.036 + \$0.045 = \$0.081, rounded\]. At fifty runs per day, that is \$4 daily, \$120 monthly—spent entirely on relearning what the agent already knew yesterday.

Tomás writes a skill file on a Tuesday afternoon. It takes twenty-five minutes. The file is 1,800 tokens of curated project knowledge: the tech stack, test commands, coding conventions, the four rules the agent must never violate, and the three most common failure modes with their resolutions. He adds it to the loop's context configuration.

Wednesday's runs look different. The agent opens each session already knowing the project's structure, conventions, and verification commands. The three discovery iterations disappear. First-attempt success climbs from 65% to 79%—not because the agent reasons better, but because it no longer starts from a state of ignorance that causes it to make convention-violating first attempts that fail verification. Over the next month, those twenty-five minutes of curation save an illustrative amount of direct cost and can eliminate up to 4,500 discovery iterations over thirty days at fifty runs per day—iterations that now go toward productive work rather than rediscovering what the loop already knows.

Skills are not complicated technology. They are simply the discipline of writing down what the loop needs to know, in a format the model can read, rather than making it rediscover that knowledge from scratch on every run. The challenge is not building them. The challenge is maintaining them as the project evolves—a problem this chapter addresses directly.

## What a Skill Is (and Is Not)

A skill is a curated document optimised for model consumption that encodes stable project knowledge. It is loaded into the model's context at the start of a run—or on demand when the task enters a specific domain—and provides the model with information it would otherwise spend iterations discovering.

The distinction between skills and adjacent concepts matters for implementation decisions.

A skill is not a prompt template. Prompt templates tell the model what to do: "Fix the failing test by modifying the source, not the test." Skills tell the model what it needs to know to do the work well: "This project uses Vitest (not Jest), requires strict TypeScript (no `any`), and runs tests with `npm test -- --run`." The template is task-specific; the skill is project-specific. Skills can contain both context and instructions; their applicability and authority must be established by the host and current task, not assumed universal.

A skill is not a codebase summary. Summaries attempt to compress everything about a project into a digestible overview. Skills are selective: they encode only the knowledge that (a) the model cannot efficiently derive from the code itself and (b) materially affects output quality. Stable entrypoints and validated build paths can belong in a skill when they prevent expensive rediscovery; keep them source-linked and refresh them when the project moves. The team's unwritten rule that all event handlers must be idempotent—knowledge invisible in the code until you know to grep for `@idempotent` decorators—absolutely belongs.

A skill is not conversation history. History is sequential, noisy (failed attempts, tangents, recoveries), and tied to a specific session. A skill is distilled: the lessons from dozens of conversations extracted, verified, and stated declaratively. It is what you would tell a competent new team member on their first day—the things they need to know that are not written down anywhere else.

The relationship between skills and memory ([Chapter 12](chapter-12.md), *Memory and Between-Run Consolidation*) deserves clarification. Skills are authored by humans, curated deliberately, and loaded deterministically based on task type. Memory is captured by the agent during work, consolidated between sessions, and recalled based on relevance scoring. Skills encode what the team knows the agent needs. Memory encodes what the agent learned for itself through experience. Both reduce the cold-start tax, but through different mechanisms: skills eliminate discovery of known-knowns (project structure, conventions); memory eliminates rediscovery of previously-solved problems (error workarounds, tool quirks). A mature loop uses both—skills for the stable base, memory for the experiential layer.

The design question for any piece of project knowledge is: should this be a skill (authored, curated, stable) or should the agent discover and memorise it naturally? The heuristic: if the knowledge is universal to the project and unlikely to change quarter-over-quarter, it belongs in a skill. If the knowledge is emergent, specific to certain conditions, or likely to evolve as the project changes, it belongs in memory. Hard rules and conventions are skills. Workarounds for transient bugs and client-specific preferences are memories.

## Anatomy of a Skill File

An effective skill file follows a progressive-disclosure structure: the most critical, broadly-applicable knowledge first (identity, verification commands), followed by increasingly specific detail (conventions, anti-patterns, domain knowledge) that may or may not be relevant depending on the task.

``` markdown

# Acme Platform — Coding Skill

## Identity
B2B payment processing platform. Python 3.12, FastAPI, PostgreSQL 16.
Monorepo: 280K lines, 12 services in `services/`, shared libs in `lib/`.
Deployed on AWS ECS. CI: GitHub Actions.

## Build and Verify
pytest services/<name>/tests/ -x --tb=short   # unit tests per service
pytest tests/integration/ -x -k <service>      # integration (needs docker)
ruff check . --fix && ruff format .            # lint + format
pyright                                        # type check — MUST pass clean

## Hard Rules (never violate)
- All monetary values use Decimal, never float. Import from lib/money.
- Database migrations (alembic/versions/) are append-only after merge to main.
- Every FastAPI endpoint requires @require_auth. No exceptions.
- PII fields must use EncryptedStr from lib/crypto. Logging PII = incident.

## Conventions (strong preferences)
- httpx over requests for all HTTP calls (async-native project).
- Service-to-service calls use lib/client/ SDK, not raw HTTP.
- Test fixtures in conftest.py at service level, not in test files.
- Structured logging via structlog. Never print() or stdlib logging.

## Anti-Patterns (learned from past failures)
- Never import from one service into another. Use the client SDK.
- Never add columns to `transactions` table without PM signoff comment in migration.
- Never mock the database in integration tests — use test DB (docker compose).
- Never use datetime.now() — always datetime.now(timezone.utc).

## Common Failure Modes
- "Connection refused" in integration tests: test DB not running.
  Fix: docker compose up -d postgres-test
- Pyright errors at service boundaries: missing re-export in __init__.py.
- alembic "Target database is not up to date": run alembic upgrade head first.
```

Each section earns its place through a specific function. The Identity section provides immediate orientation—language, framework, scale—so the model does not waste a turn discovering basics. Build and Verify tells the model how to check its own work, feeding directly into the loop's oracle step. Hard Rules prevent catastrophic violations that waste iterations (convention-violating code that fails verification) or cause production incidents (logging PII, using float for money). Conventions improve first-attempt quality by aligning output with team expectations—the difference between "works but gets style feedback in review" and "works and passes review unchanged." Anti-Patterns encode institutional memory that would otherwise require multiple failures to learn. Common Failure Modes short-circuit debugging cycles by providing known solutions for known problems.

The return on investment of each section is different. Hard Rules have the highest ROI: a single violation can waste multiple iterations as the model discovers (via failing tests or linting) what it did wrong and how to correct it. Common Failure Modes have the second-highest ROI: they eliminate the 2–4 iteration debugging cycle for problems with known solutions by providing the answer upfront. Conventions have steady but lower per-instance ROI: they improve acceptance rates on first attempt but rarely cause outright verification failures.

## Progressive Disclosure

Not every run needs the full skill. A documentation task does not benefit from anti-patterns about database migrations. A refactoring task within the auth service does not need the payment service's domain rules. Loading everything into every context wastes tokens on irrelevant information and—more subtly—can confuse the model by presenting rules for domains it is not operating in. If the skill says "never add columns to the transactions table without PM signoff" and the model is working on an auth-service refactor, that rule is noise that consumes context without providing value.

Progressive disclosure loads skills in layers matched to the task's needs:

``` python

from dataclasses import dataclass, field
from pathlib import Path

@dataclass
class Skill:
    """A single skill document with layer and domain metadata."""
    name: str
    path: Path
    layer: int  # 0 = always, 1 = code tasks, 2 = domain-specific
    domains: list[str] = field(default_factory=list)
    _content: str = field(default="", repr=False)

    def load(self) -> str:
        """Load skill content from disk, caching for reuse."""
        if not self._content:
            self._content = self.path.read_text()
        return self._content

    @property
    def token_estimate(self) -> int:
        """Approximate token count. 1 token ≈ 4 chars for English."""
        return len(self.load()) // 4


class SkillLoader:
    """Loads skills progressively based on task context.

    Layer 0: Always loaded (~1.5-2K tokens). Identity, build commands.
    Layer 1: Loaded for code tasks (~3-5K tokens). Conventions, rules.
    Layer 2: Loaded on demand (~variable). Domain-specific knowledge.
    """

    def __init__(self, skill_dir: Path) -> None:
        self._skills: list[Skill] = []
        self._load_manifest(skill_dir)

    def for_task(self, task_type: str, domains: list[str] | None = None) -> str:
        """Assemble skill content appropriate for this task type."""
        parts: list[str] = []
        total_tokens = 0

        # Layer 0: always loaded
        for skill in self._by_layer(0):
            content = skill.load()
            parts.append(content)
            total_tokens += skill.token_estimate

        # Layer 1: code-related tasks
        code_tasks = {"fix", "feature", "refactor", "test", "review", "migrate"}
        if task_type in code_tasks:
            for skill in self._by_layer(1):
                parts.append(skill.load())
                total_tokens += skill.token_estimate

        # Layer 2: domain-specific, loaded on request
        if domains:
            for skill in self._by_layer(2):
                if any(d in skill.domains for d in domains):
                    parts.append(skill.load())
                    total_tokens += skill.token_estimate

        return "\n\n---\n\n".join(parts)

    def _by_layer(self, layer: int) -> list[Skill]:
        return [s for s in self._skills if s.layer == layer]

    def _load_manifest(self, skill_dir: Path) -> None:
        # Reads skill metadata from skill_dir/manifest.yaml
        # Excerpt — full implementation in Appendix H
        ...
```

The token arithmetic makes the case for progressive disclosure unambiguous. A full skill set of 12,000 tokens loaded unconditionally costs 12,000 tokens per model turn. Over a ten-iteration loop with two model calls per iteration (planning and execution), that is 240,000 tokens of skill re-transmission per run. A progressive approach that loads only 2,000 tokens for layers 0–1 (appropriate for 80% of tasks) costs 40,000 tokens per run. The savings: 200,000 tokens per run, which at \$3/MTok input is \$0.60 per run, or \$30/day at fifty daily runs \[ESTIMATE, arithmetic as stated; actual savings depend on skill sizes and task-type distribution\].

The savings are larger than they appear because they compound with the iteration reduction that skills already provide. Skills both reduce the number of iterations (by eliminating discovery) and reduce the per-iteration cost (via progressive disclosure). The multiplicative effect is significant: fewer iterations, each costing less.

## Composition and Hierarchy

Large projects outgrow a single skill file. When a monorepo contains twelve services, each with its own conventions, dependencies, and domain-specific rules, a single skill file either grows unwieldy (15,000+ tokens, at which point the model struggles to find relevant information within it) or remains too shallow to help with service-specific work.

The solution is hierarchical composition: a base skill providing project-wide context, service-specific skills for each domain, and task-specific skills for specialized operations that cut across services.


    .claude/skills/
    ├── project.md           # Layer 0: identity, stack, build commands (1.5K tokens)
    ├── conventions.md       # Layer 1: coding rules, style, anti-patterns (3K tokens)
    ├── services/
    │   ├── auth.md          # Layer 2: auth service domain rules (2K tokens)
    │   ├── payments.md      # Layer 2: payment processing rules (2.5K tokens)
    │   ├── notifications.md # Layer 2: notification service patterns (1.5K tokens)
    │   └── billing.md       # Layer 2: billing reconciliation rules (2K tokens)
    └── tasks/
        ├── migration.md     # Layer 2: safe migration writing (1.5K tokens)
        └── api_endpoint.md  # Layer 2: new-endpoint checklist (1K tokens)

A loop fixing a bug in the payments service loads `project.md` + `conventions.md` + `payments.md`: approximately 7,000 tokens of highly-targeted context. A loop adding a new API endpoint loads `project.md` + `conventions.md` + `api_endpoint.md`: approximately 5,500 tokens. A loop working on a cross-service integration might load `project.md` + `conventions.md` plus the two relevant service skills, totalling roughly 10,000 tokens. The model never sees payment processing rules when it is working on notifications, and it never sees notification patterns when it is writing migrations.

The compositional approach also aids maintenance. When the payments service adopts a new fraud-detection library, only `payments.md` needs updating. When the team changes their logging library project-wide, only `conventions.md` changes. Small, focused skill files are easier to keep accurate than one large document that tries to cover everything.

The relationship between skills and the loop's tool set deserves explicit attention. A skill does not replace tools—it complements them by providing the context that makes tool use effective. Consider a `search_code` tool: without skills, the model searches for patterns it guesses might exist. With a skill that states "authentication logic lives in `services/auth/`, and the decorator pattern is `@require_auth`", the model searches with precision—the skill gives it the vocabulary and the locations that make tool calls productive on the first attempt. Skills make tools work better by providing the knowledge that informs what to search for, where to look, and what patterns to expect.

Similarly, a skill's Build and Verify section transforms the oracle from a discovered capability into a known one. Without the skill, the model must spend iterations finding the test command, learning the linting rules, and understanding what "passing" means for this project. With the skill, the model knows from turn one that verification means running `pytest -x`, `pyright`, and `ruff check` in sequence—and that all three must pass clean. The oracle is pre-defined rather than discovered, eliminating the verification-discovery tax that is separate from but compounds with the general cold-start tax.

## Skill Rot and the Discipline of Maintenance

Skills rot. The project migrates from Jest to Vitest, but the skill still says "run tests with `npx jest`." The team adopts a new error-handling pattern, but the skill still documents the old one. A directory mentioned in the architecture section was renamed three months ago during a reorganisation. The API convention changed from REST to GraphQL for new services, but the skill still instructs the model to create REST endpoints.

Stale skills are worse than absent skills. This is the counterintuitive truth that makes skill maintenance non-optional. An absent skill forces the model to discover knowledge fresh—it spends iterations exploring, which costs tokens but produces correct results because it is reading the actual current state of the project. A stale skill teaches the model falsehoods with high confidence. The model trusts skill content as authoritative (it has no reason not to), follows the outdated instructions precisely, produces output that contradicts current project state, fails at the verification step, and then spends iterations debugging a "problem" that is actually a skill-induced mismatch between its mental model and reality. The stale skill actively interfered with a process that would have worked without it.

Three practices prevent skill rot from becoming a chronic problem:

**Co-locate skills with code and review them in PRs.** Skills live in the repository alongside the source they describe. When a developer changes the test framework, the skill update is part of the same pull request. Code reviewers are trained to check: "Did this PR change something the skill file describes? If so, is the skill updated?" This is the same discipline teams apply to documentation, API specs, and README files—skills are simply another artifact that must track the code.

**Automated staleness detection in CI.** A CI job validates the checkable claims in a skill file. Commands in the Build and Verify section are executed in a sandbox: if `pytest services/auth/tests/ -x` returns "no such directory" or "command not found," the skill is stale and the CI job fails. File paths mentioned in the skill are checked for existence: if the skill references `lib/crypto/encrypted.py` and that file does not exist, CI flags it. Import patterns described in conventions can be grepped against actual usage: if the skill says "use httpx, never requests" but twenty files still import requests, the skill's claim is aspirational rather than factual. Automated checking catches the objective staleness—wrong commands, missing files, outdated paths.

**Periodic human review on a fixed cadence.** Not every form of staleness is machine-checkable. "We prefer composition over inheritance" is a convention that no grep can validate. "Service-to-service calls use the SDK" might be true for new code but false for the thirty legacy call sites nobody has migrated yet. Monthly or quarterly, an engineer (ideally one rotating through the team) reads each skill file and asks: is every claim still true? Is anything missing that should be here? Are any sections now irrelevant? This human review catches the subjective staleness that automated checks cannot.

``` mermaid

flowchart LR
    A[Skill Created<br/>via PR] --> B[Active Use<br/>in Loop Runs]
    B --> C{Still Accurate?}
    C -- "Yes (CI passes,<br/>human confirms)" --> B
    C -- "No — caught by CI<br/>(command fails, path missing)" --> D[Fix in PR]
    C -- "No — caught by<br/>periodic review" --> D
    C -- "No — NOT caught" --> E[Model Follows<br/>Stale Instructions]
    E --> F[Verification Fails<br/>or Produces Wrong Output]
    F --> G[Developer Investigates]
    G --> H[Realizes Skill is Stale]
    H --> D
    D --> B
```

The cost of uncaught skill rot is silent. You do not get an alert when a skill becomes stale. You see it indirectly: the loop's first-attempt success rate declines on a project where it used to perform well. The loop occasionally uses an outdated test command. A pattern of failures clears up when someone manually overrides the agent mid-run. These are the symptoms. When you see them, check the skill files first—the most common cause of unexplained regression in a previously-effective loop is a skill that stopped matching reality.

## Versioning Strategies

Skills must evolve with their projects, and different project shapes benefit from different versioning approaches.

**Git-tracked, branch-aware** is the simplest model. Skills live in the repository. When the model works on a branch, it reads the skills from that branch. The `main` branch always has current skills because skill updates are part of the development workflow. Feature branches have the skills that were current when the branch was created, which is acceptable for short-lived branches (hours to days) but can become problematic for long-lived ones (weeks to months). For long-lived branches, validate skills against that branch’s actual code; copying current main’s instructions without its matching code can introduce a different mismatch. This approach has the significant advantage of requiring zero additional infrastructure: your existing version control system provides history, diffing, code review for skill changes, and rollback capability for free.

**Generated baseline with human overrides** suits projects where the structural aspects of skills (file layout, available commands, dependency list) change frequently but the human-knowledge aspects (conventions, anti-patterns, domain rules) are stable. A script runs on every CI build, reads `pyproject.toml`, the directory structure, and configuration files, and generates the mechanical sections of the skill automatically. Human-written sections are maintained in separate files and merged with the generated base during the build. The generated sections are always current; the human sections require manual maintenance.

**Timestamped with validity windows** is appropriate for teams that cannot integrate skill maintenance into their development workflow. Each skill section carries a `last_verified: 2026-07-15` annotation. A CI job or cron task flags sections whose verification date exceeds a threshold: 30 days for volatile sections (architecture, file layout), 90 days for stable sections (conventions, hard rules). This approach does not prevent rot—it makes rot visible and creates a maintenance queue. Teams process the queue on a weekly or biweekly cadence, re-verifying and updating flagged sections.

## Implementation Guidance: Treat Skills as Versioned Inputs

Give each skill an owner, applicability scope, revision, and list of checkable source claims. Separate descriptive facts (“this branch uses Vitest”) from normative rules (“new endpoints must be authenticated”) and proposed improvements (“consider a different fixture layout”). Existing code that violates a rule does not automatically make the rule stale; it may be legacy debt. Conversely, a statement that all endpoints already comply is a factual claim that needs evidence.

Do not execute every command found in an arbitrary skill file as a staleness test. A command may mutate a database, deploy software, or expose secrets. Extract a reviewed allowlist of safe checks, run it in a disposable environment with restricted credentials, and require explicit authorization for mutations. The sample migration command is a workflow sketch, not a direction to upgrade a real database merely to validate documentation.

Resolve precedence explicitly. A project skill can specialize a general coding convention; it cannot override current user scope or grant itself production permission. A retrieved skill from an external package is untrusted content until reviewed and bound by the host. Keep its prompts, scripts, and dependencies versioned together so a change in an auxiliary script cannot silently alter what an unchanged skill does.

Consider an illustrative stale-cache failure: a long-lived process caches a skill describing `pytest`, while the active branch has moved to another test command. Re-reading the cached string does not refresh it. Cache by content digest or validated revision, and invalidate when the branch or file changes. If the skill’s command conflicts with current configuration, investigate the discrepancy rather than blindly choosing whichever text is newer.

Exercise acceptance: rename a fixture directory, change one build command, and add a malicious command to an untrusted skill copy. The checker must flag the stale references without executing the malicious command. Then test an authorized rule with legacy violations: it should report the violations rather than deleting the rule as “inaccurate.” The goal is useful maintained guidance, not automatic obedience to every sentence stored under a skill filename.

## What Breaks

Skills create a false sense of completeness. A model may over-trust a skill file unless the harness and evaluation distinguish guidance from current evidence. If the skill says "all endpoints require `@require_auth`" but three legacy endpoints were built before that rule existed and never migrated, the model may make incorrect assumptions about the codebase state. It might skip adding the decorator because it "knows" it is already there, or it might be confused when it encounters a legacy endpoint without it. Overly-confident skills can reduce the model's healthy scepticism about project state—the willingness to verify assumptions rather than trust context.

Skills also create a local-optimum trap. A team invests heavily in skill curation, sees clear improvements in loop performance on their specific project, and stops investing in better tool design, better error messages, or better oracle feedback. But skills help only with known-knowns on known projects. They do not help the loop handle novel situations, unexpected errors, or projects it has never seen before. A loop that depends heavily on skills is highly effective in its trained domain and helpless outside it. This is a valid trade-off in many production scenarios, but it should be a conscious choice rather than an accidental dependency.

The token budget trade-off is real and measurable. A 5,000-token skill loaded on every turn of a ten-iteration loop consumes 100,000 tokens per run \[ESTIMATE, 5,000 × 20 turns at 2 calls/iteration\]. If the skill's content is relevant to only 30% of runs (because 70% of tasks do not touch the domains the skill covers), then 70% of that token spend is waste. Progressive disclosure mitigates this, but progressive disclosure itself requires accurate task-type classification at the start of each run—which is itself an inference step that can misclassify, loading the wrong skills or failing to load necessary ones.

There is also a tension between skill specificity and skill portability. A highly specific skill (naming exact file paths, referencing precise function signatures, stating exact version numbers) is maximally useful when accurate and maximally dangerous when stale—because the model follows specific instructions precisely. A more general skill ("use structured logging throughout the project") is less likely to become stale but also less likely to prevent first-attempt failures because it does not give the model enough precision to act correctly without additional discovery. The right balance depends on your maintenance discipline: if you can commit to keeping skills current weekly, prefer specificity. If skills will go months between reviews, prefer generality and accept the residual discovery cost.

## Key Takeaways

- Skills encode stable project knowledge for model consumption, eliminating the cold-start tax of repeated discovery across runs.
- A well-structured skill covers: identity, build/verify commands, hard rules (never violate), conventions (strong preferences), anti-patterns (learned from failures), and common failure modes (known solutions).
- Progressive disclosure loads skills in layers (always / code-tasks / domain-specific) matched to task type, avoiding payment for irrelevant context.
- Hierarchical composition (project + service + task skills) scales to large monorepos without exceeding useful token density per skill file.
- Skill rot is the primary risk: stale skills are worse than absent skills because they actively mislead the model into confident incorrect behaviour.
- Three defences: co-locate with code and update in PRs, validate checkable claims in CI, and conduct periodic human review on a fixed cadence.
- Skills amortise discovery cost: twenty-five minutes of curation eliminates thousands of wasted iterations over the skill's active lifetime.

## The Loop Contract, So Far

This chapter extends the **goal** field: skills encode acceptance criteria and verification commands that feed the oracle directly (the Build and Verify section is how the loop knows it succeeded). It also extends **budget**: skill token cost is a fixed per-run investment that reduces variable iteration cost by eliminating discovery loops, making it a budget design trade-off with predictable ROI.

## Exercises

1.  **Write a skill for your project** (build). Choose a project you work on regularly. Write a skill file following the anatomy in this chapter: identity, build/verify, hard rules, conventions, anti-patterns, common failure modes. Keep it under 2,000 tokens. Test it by running an AI coding assistant on your project with and without the skill loaded, comparing first-attempt success rates across ten trials.

1.  **Measure the cold-start tax** (analysis). Run an AI coding agent ten times on the same project without any skill file. For each run, annotate the trace: mark which iterations are "discovery" (reading files to learn structure, conventions, or commands) and which are "productive" (working toward the actual goal). Calculate the ratio. Estimate the token cost of discovery iterations versus productive iterations.

1.  **Design progressive disclosure** (analysis). For a project with at least three distinct domains (e.g., auth, payments, notifications), design a skill hierarchy. State: what goes in layer 0, what goes in layer 1, which layer-2 skills exist and what triggers their loading. For each skill, estimate its token count and identify which task types require it.

1.  **Implement staleness detection** (build). Write a CI script (bash or Python) that validates a skill file's accuracy: verify that commands in Build and Verify execute without error, that file paths mentioned in the skill exist on disk, and that package names referenced are present in `pyproject.toml` or `package.json`. Report a staleness percentage (failed checks / total checkable claims).

1.  **Measure skill ROI** (estimation). For a loop that runs 50 times/day with 3 discovery iterations per cold-start run, estimate: the monthly token cost of discovery iterations \[ESTIMATE with assumptions\], the monthly token cost of loading a 2,000-token skill on every turn, and the net savings. At what skill size does the skill's token cost exceed the discovery cost it eliminates?

## Sources and Evidence Limits

The original edition attributed product features and outcome figures to undated or incompletely located vendor material. Those inherited attributions are **unverified in this chapter**; they are not reproduced as a fact-check receipt. The engineering patterns and fictional examples stand separately from those claims. Consult the edition’s source notes for collected references and verify implementation-specific contracts against the version you deploy.

------------------------------------------------------------------------

*Next: [Chapter 12](chapter-12.md) addresses the problem skills cannot solve: learning from experience. Memory systems capture what the loop discovers during work and consolidate it between sessions, turning every run into training data for the next.*
