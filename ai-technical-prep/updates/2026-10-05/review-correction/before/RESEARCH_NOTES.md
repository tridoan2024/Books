# Research notes for Chapters 28–30

Reviewed October 5, 2026 for the owner-requested addition to **AI Technical Prep**. This is an authoring research record, not an installation, provider benchmark or trading decision.

## Public discovery and primary-source reads

Web search was attempted through Google, Bing and DuckDuckGo. Google returned a redirect shell, DuckDuckGo presented a bot challenge, and the initial Bing results were irrelevant. Those responses do not support technical claims. Public GitHub repository searches then supplied usable discovery results, saved as `search-*.json`; the relevant Jev engineering repository README was fetched and inspected. Repository popularity and self-reported benchmark descriptions are not used as outcome evidence.

The current TypeSafe documentation index was fetched, followed by its API, coding-agent guidance, primitives, confidence, model and pattern pages. These establish the documented Choice, Score and Noul contracts, the distinction between Jev and a coding-agent LLM, question batching, model aliases and provider uncertainty semantics. Native Score can be fractional; Noul has no separate confidence. Provider calibration claims require evaluation on the deployed domain.

Claude Code's current headless, subagent, hook and team documentation was fetched. The chapters emphasize documented configuration loading, separate worker contexts, experimental team status and the distinction between interactive teams and headless execution. No Claude process was launched and no installed-version parity was certified.

LangGraph persistence, checkpointer, interrupt and fault-tolerance pages were fetched. The old durable-execution path now serves the persistence overview; the notes retain the requested URLs and actual fetched content. Current fault-tolerance guidance includes version-dependent features, so the chapters recommend installed-release verification rather than claiming universal support. Pydantic Graph documentation was fetched for the implementation comparison.

OpenAI's official multi-agent and noninteractive documentation pages were blocked by Zscaler, and a separate platform documentation attempt was also blocked. The public upstream Codex README and exec source were accessible through GitHub. The exec source and commit receipt support limited source-level observations; they do not establish account access, installed feature parity, native Jev support or a tested cross-CLI fleet. This is a disclosed fallback to upstream source because current official page content could not be retrieved.

## Local foundations

The owner-supplied `tools/at_brain/docs/AT_BRAIN_TECHNICAL_QA_REPORT.html` is the central case study. Its evidence summary and relevant `questions.py`, `evidence.py`, `reference.py`, replay helper and learner were inspected. Earlier foundations include `RCODE-BCB/JEV/RCODE_JEV_ENGINEERING.md`, `RCODE-BCB/Graphing/`, the retained RCode Jev/graph open-source review and the JGL scope.

These are distinct evidence classes: a report's historical QA claims, inspected implementation, frozen mock tests, and fresh live outcome evidence. The chapters do not claim to rerun AT Brain's reported suite or replay, certify its installation, place trades, or repair its runtime.

## Source-review findings incorporated into the chapters

| Finding | Consequence for the writing |
|---|---|
| AT Brain's custom verdicts are explicitly uncalibrated | Local fields named `p` are described as heuristics, not verified probabilities. |
| Its remote reference sends a relevance Choice | The chapters do not imply every J1–J5 family runs through native Jev. |
| J3 counts fresh observed directional candidates | Source independence needs separate lineage evidence; differently named candidates do not prove independence. |
| Replay `_nearest_side` uses absolute timestamp gaps within a symmetric window | Later signals can enter the decision request. Reported lift is not treated as proven causal decision-time performance. |
| The reported higher-quality bucket performs worse than the adjacent lower-quality bucket | A monotonic score construction is distinguished from a monotonic outcome relationship. |
| Candidate text hashing is narrower than full source and request identity | Full original-source revision, metadata and request identity remain separate design requirements. |
| Advisory and fail-open behavior do not establish latency isolation | The loop chapter discusses blocking I/O and critical-path deadlines without asserting a measured slowdown. |
| Historical graph-flow probe observes effects before storage conflict | Graph persistence and optimistic conflicts are distinguished from pre-effect ownership. |

## Receipts and limits

`sources.json` records requested public URLs, retrieval timestamps, HTTP status, saved filenames, hashes and sizes. `local-sources.json` records inspected local source hashes. `search-*.json` records usable public repository discovery. Sources are snapshots of changing documentation; the review date is not a claim that every provider feature changed on that date.

All three new chapters follow the book's established apparatus and contain complete executable offline Python examples. These examples validate the shown policy, dependency and loop behavior with synthetic fixtures. They make no model-quality, production-latency, profitability or paid-provider claim. The previous TOC and metadata are preserved under `updates/2026-10-05/before/`.
