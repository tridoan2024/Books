# AT Brain source revisions for Chapters 28–30

This fixed, hash-identified packet separates original authoring observations from later local source. `current/` means **copied during this October 5, 2026 correction**, not continuously synchronized, deployed or certified. The eight copied files remain unmodified; `manifest.json` records their original locations, sizes and hashes. The packet is a source excerpt collection, not a runnable installation or a repository-wide atomic snapshot.

## Historical evidence and recovery limits

The original [local-source inventory](../local-sources.json) remains unchanged. The [pre-correction research notes](../../../updates/2026-10-05/review-correction/before/RESEARCH_NOTES.md) and preserved chapters are secondary records of the initial review; they are not replacements for the original implementation bytes.

| Source | Authoring SHA256 | Fixed packet SHA256 | Interpretation |
|---|---|---|---|
| Technical/QA report | `0abee1ca50a51a7c7a8a31a0e3374318d3250f5690c11f6f2fa5a256c87cd8c4` | same | [Exact report copy](reports/AT_BRAIN_TECHNICAL_QA_REPORT.html); contains the original historical performance claims, not independent validation. |
| Replay helper | `325d14cb8284b3090b9257aac0be8d207badb154dc25a1b3f89fbd677ba35805` | `8713e9cf35e21a13fb57830c83815d5e7c1359eae44032212817c98a5ff962c9` | [Later helper](current/replay_capture_at.py); exact authoring revision not recovered by bounded search. |
| Question implementation | `3edef47d36ffea4299d2d7c64da990f942cfe4c3583dd3b1dd86f3f5f706a3be` | `94f36c0e4bbf98a455e4c310cd0dcd8de0136afa2cbda247780b1387f71eee2e` | [Later questions](current/questions.py); exact authoring revision not recovered by bounded search. |
| Evidence report | `c0e24245ea51d9b5cd801d7ce5f80d73c7e97269f72649608f240190d3a8352c` | `6a47bfbc242c8cb3c2fdc0fabd5692387b65f6c882115e466c453189f85d284b` | [Later v2 report](reports/AT_BRAIN_EVIDENCE.md), explicitly distinguished from the old report. |

The collector searched a bounded set of relevant AT Brain, backup and state locations without recovering the two exact historical code revisions. This is **not proof that those bytes do not exist elsewhere**. The later evidence report exposed `/tmp/at_brain_team/`; a focused follow-up checked `w1_wave3_before_replay.py`, whose SHA256 `ad177db0aec4e334ea8c2b3d0b0e465ba7dc2340413fe1f8025bf94af4c1cdf1` did not match the authoring target. No historical code was reconstructed and labelled original. The old technical report is sufficient to inspect its own reported figures; a historical code exercise must acknowledge that the exact implementation remains unavailable in this packet.

## Replay: observation, later implementation, and outcome claim

The original research recorded an absolute-gap symmetric-window helper named `_nearest_side`. That secondary observation motivates the lookahead warning; it does not certify a recovered old code listing. The later v2 evidence report also describes replacement of the earlier future-eligible window.

The fixed [later helper, lines 56–64](current/replay_capture_at.py) defines `_nearest_prior`: it computes `decision_known_at - trade["known_at"]` and admits only values from zero through `WINDOW_S` (120 seconds). It therefore rejects future corroborators **under the supplied timestamp values**. This is not proof that those values represent genuine decision-time availability, that every feature path is causal, or that the full replay is correct.

The [later evidence report](reports/AT_BRAIN_EVIDENCE.md) contains a separate causal-replay analysis and narrower performance claims. Its reported results were **not rerun for this book correction**. Neither that report nor the corrected predicate retroactively validates the original technical report. Keep source versions, input data, metric definitions and denominators attached to every result; gross SPY price moves are not option P/L, and a lower total loss over fewer trades does not establish improved per-trade performance.

## Candidate count versus independent information

The fixed [question implementation, lines 110–149](current/questions.py) selects one eligible record per `(source_ref, kind)`, prioritizing observed/fresh status and then freshness-weighted recency. Identical keys no longer contribute repeatedly to the directional totals and sufficiency count.

Different keys can still derive from one feed or correlated indicators. Lineage records can expose shared ancestry; they do not prove statistical independence. Independent-source reasoning and empirical error/correlation evaluation remain distinct from deduplication.

## Supporting files and reproduction boundary

- [Candidate vocabulary](current/evidence.py), [reference adapter](current/reference.py), [engine](current/engine.py), [learner](current/learner.py).
- [Manifest](manifest.json): verify each copied file against its SHA256 before use. Its packet-check time is not the original collection time of every source.
- The packet deliberately omits runtime dependencies, credentials, databases and trading inputs. Read source or isolate pure functions for synthetic tests; do not run a trading workflow as a book diagnostic.

No AT Brain runtime was edited, no provider call or trade was made, and no full replay was executed by this correction. The source files changed independently during the surrounding work; the manuscript cites these fixed copies rather than implying live-source stability.
