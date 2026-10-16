# RCode JEV engineering — implementation report

Revised 22 September 2026 from local source and retained release evidence. This report supplements the original public-research report. Source collection is a review snapshot, not an installation or a claim that all development code is deployed.

## 1. What has been built

RCode has three related engineering layers: a native evidence/provenance layer, bounded decision adapters, and a local numeric learning service. The current shared custom service exposes exactly two decision backends: `custom` and `typesafe`. The local backend is `custom-jev-linear-v1`, a small CPU ranker whose numeric weights can be trained. The remote reference is TypeSafe `jev-1.13.0`. Neither replaces the main conversational model or authorizes actions.

The original JEV report describes concepts, published research and proposed BCB applications. The collected implementation now supplies concrete source, integration boundaries, training gates, tests and historical release receipts. The most important remaining gap is independent final-outcome data: training agreement has improved in retained experiments, but production superiority and TypeSafe retirement are not established.

## 2. Collection and source authority

The complete copied-file list, roles, original paths and SHA-256 hashes are in [engineering/INVENTORY.md](engineering/INVENTORY.md); [engineering/manifest.json](engineering/manifest.json) is machine-readable. [engineering/discovery.json](engineering/discovery.json) indexes JEV-bearing local files, including historical verification copies that were not duplicated. [engineering/gather.py](engineering/gather.py) rebuilds the bounded collection.

The snapshot preserves the original hierarchy under `engineering/snapshot/`: RCode development source, recorded release source, shared tools and related SPY skill scripts/tests. Credentials, private model databases, runtime environments, binaries, third-party source archives and duplicate historical trees are excluded. Discovery is bounded to the named projects and relevant shared modules, not a claim of searching every disk location or recovering every past conversation.

| Source tier | Location | Interpretation |
|---|---|---|
| Current shared service | `Documents/2026/tools/custom_jev` | Inspected local implementation of numeric ranking, teacher capture and learning |
| Shared incident service | `Documents/2026/tools/supervisor_learn` | Incident collection, TypeSafe transport helpers and native bridge server |
| Development tree | `RCode/rcode` | Working source; includes older provider adapter and separately evolving supervisor work |
| Recorded 0.4.17 release | `RCode/verification/custom-jev/release/source` | Source identified by the release report as shipped; preserved separately |
| Recorded acceptance evidence | `RCode/verification/custom-jev/REPORT.md` | Historical test and installation claims; not a fresh runtime test in this report revision |

Important divergence: development `scripts/jev_rank_evidence.py` uses the official SDK/adapter provider path and supports the earlier provider menu. The recorded 0.4.17 adapter delegates to `custom_jev.service.Service` and accepts only `custom`, `typesafe` and the non-inference `off` mode. Copying the development tree over the released integration would therefore not faithfully reconstruct that release. No installed binary identity was re-certified during this documentation task.

## 3. Module map

| Module | Engineering responsibility |
|---|---|
| `custom_jev/engine.py` | Bounded request validation, deterministic feature extraction, linear scoring, abstention and numeric parameter proposals |
| `custom_jev/reference.py` | Pinned TypeSafe model, fixed family rubrics, safe projections, response checks, fresh cache and reference budgets |
| `custom_jev/store.py` | SQLite model revisions, active pointers, examples, decisions, budgets, learning receipts and lineage |
| `custom_jev/learner.py` | Outcome import, source freshness, split isolation, candidate training, independent evaluation and guarded activation |
| `custom_jev/service.py` | Decision/compare/collect/learn orchestration and family-specific retirement checks |
| `custom_jev/supervisor.py` | Incident prioritization and native supervisor learning entry points |
| `custom_jev/server.py` | Stdio MCP protocol and six model-facing tools |
| `custom_jev/admin.py` | Operator-only outcome import and expected-revision rollback |
| `supervisor_learn/core.py` | Bounded incident evidence indexing; uses `tlog_capture/unified/sanitize.py` and `eligibility.py` |
| `supervisor_learn/jev.py` | Reused HTTP/credential/response helpers; its own legacy alias differs from the custom reference's pinned model |
| `supervisor_learn/server.py` | Bridge endpoint that imports custom prioritization and learning |
| `src/tools/jev_rank_evidence.rs` | Native admission, source hashes, child lifecycle, cancellation, deadline and result validation |
| `scripts/jev_rank_evidence.py` | D01 Python boundary; implementation differs between development and recorded release |
| `src/engine/brain.rs` | Automatic eligible-evidence tracking and bounded relevance advice |
| `src/engine/conversation.rs` | Conversation integration for native brain guidance |
| `src/engine/supervisor_bridge.rs`, `supervisor_mode.rs` | Supervisor execution, receipt handling, completion and lifecycle integration |
| `src/tools/task_graph.rs`, `src/tasks/` | Deterministic task/dependency graph support |
| `src/engine/supervisor_learning/` | Related supervisor actor/evaluation/publication graph work; inclusion is not proof all working-tree actors shipped |
| `model-gateway/rcode-launcher.py` | Host launch configuration and decision-mode migration |

## 4. Execution paths and ownership

Native evidence path: user turn → eligible tool evidence → brain provenance nodes/edges → bounded D01 request → Rust boundary → Python adapter → decision backend → validated advisory → next model request. Source retention and permissions remain native responsibilities. Advice establishes neither source truth nor task completion.

MCP path: client → `custom_jev/server.py` → `Service` → local ranker or explicitly requested TypeSafe reference → stored decision receipt. Exposed tools are `custom_jev_status`, `custom_jev_decide`, `custom_jev_compare`, `custom_jev_collect`, `custom_jev_learn` and `custom_jev_graph`. Imports and rollback remain local admin commands.

Learning path: `/supervisor on` → shared incident collection/prioritization → bounded teacher collection → train numeric candidate → evaluate fresh independent final cases when available → activate or retain shadow/no-change result → completion receipt and automatic supervisor off. Worker exit alone does not prove an issue was repaired.

Keep three graph roles distinct: task prerequisites, native evidence provenance, and custom learner stage/model lineage. They connect evidence and dependencies; they do not turn a probabilistic judgment into authority. The collected code does not establish a universal durable graph executor for every proposed roadmap feature.

The inspected development brain bounds its graph to 512 nodes, considers up to eight evidence items, and permits two relevance dispatches per turn. Its excerpt constant is 1,600 characters; earlier narrative evidence sometimes calls these bytes. Use the actual source version when interpreting limits. Native automatic decisions use their own short deadline, separate from foreground tool timeout configuration.

## 5. Decision and model contracts

Custom requests name `evidence_relevance` or `incident_triage`, a question, 1–32 candidates and optional project revision. Each candidate preserves an ID, text and source reference, with bounded optional metadata. Serialized input is limited to 32,768 bytes; questions to 4,096 characters; IDs to 128 characters. Input rejection is explicit rather than silent request truncation.

The local model uses query coverage, text precision, exact phrase presence, specificity and observed/fresh/in-scope flags. The reserved provenance feature is currently zero: a source-reference string is not treated as independent source verification. Eight bounded weights form the model; training uses 16 passes and a 0.25 update step, clipping weights to ±16. This is a linear ranking learner, not foundation-model training or a reproduction of proprietary Jev architecture.

Results preserve model/revision identity, request hash, selected ID or abstention, ordering, scores, source hashes and observed elapsed time. Custom scores are uncalibrated and confidence is null. Local inference reports zero provider calls. `action_authorized` stays false.

The reference path uses fixed Choice questions, candidate IDs plus none/unknown, and exact `jev-1.13.0` response identity. Its fresh cache lasts 300 seconds. Credential resolution reads the process environment or an explicitly supplied credential-file path; no credentials are copied into this report. Failed, unavailable, abstained, shadow-trained and activated states must remain distinguishable.

## 6. Learning, promotion and retirement

Teacher predictions may enter training only. Independent outcomes require the declared independently-curated authority, expected selection, group, split, source path and source hash. Hashes establish identity and freshness, not semantic correctness of a label.

Promotion requires at least eight fresh training cases and eight fresh independent final cases, actual held-out improvement, no previously-correct regression, source freshness and the unchanged parent revision. Sources, normalized requests, groups and source hashes cannot leak across splits. Final cases are consumed once. Missing independent final cases can produce a saved shadow candidate but cannot justify activation. Expected-parent updates and rollback protect revision continuity.

Reference collection defaults to 256 attempts per UTC day, with a configurable ceiling of 1,000 and no same-day widening of a persisted budget. A native pass collects up to eight fresh teacher requests; explicit batches accept up to 32. Collection has a ten-second soft window plus bounded in-flight transport. Failures consume attempts; fresh cache hits do not consume provider request tokens.

Family-level TypeSafe retirement requires at least 30 independently labeled final comparisons across ten groups, current model revision, no reference-correct regression, custom accuracy at least reference accuracy, available reference results and local ranking latency at most 100 ms for each case. These scoped criteria are implemented; retained live evidence does not satisfy them.

## 7. What the retained evidence establishes

The following results are from the copied [0.4.17 release report](engineering/snapshot/RCode/verification/custom-jev/REPORT.md), not tests rerun during this collection.

| Retained check | Result and limitation |
|---|---|
| Python custom module tests | 17 passed, including teacher budgets, isolation, cancellation and retirement cases |
| Native checks | 27 passed across the documented boundaries; see copied `NATIVE_CHECKS.json` |
| Controlled learning | Synthetic baseline 0/8 → candidate 8/8, activation, later revision use and no-change path; mechanism evidence only |
| MCP | Configured RCode and Codex server protocol checks passed; actual RCode tool execution passed; Codex conversational selection was not measured |
| Installed live supervisor | Two TypeSafe examples collected with native receipt and automatic off; deny-all generic worker did not establish repair |
| First teacher batch | 64 calls, 62 training records; overlapping incident comparisons, not 62 independent problems |
| Training fit | 16/62 → 31/62; improved fit to training labels, not held-out quality |
| Production learned activation | Not established: independent final cases were absent in the recorded run |
| TypeSafe retirement | Not earned by recorded live data |

The release retained a packaging failure where replacing a launcher symlink broke relative model-registry lookup. The recorded repair restored the symlink and installed at its original target. The report also retains a missing sanitizer fixture dependency, an unrelated library-test compile failure and corrected bounded fixtures. Keep these records when reconstructing the environment.

Earlier JEV graph and Azure tests remain useful historical integration evidence. Azure/gpt-6-astra relevance advice is a generative-provider implementation of typed judgments; it must not be described as native TypeSafe inference or as the custom numeric model. Version-specific evidence supersedes earlier limitations only for the tested scenario.

## 8. Related SPY and research engineering

Related `spy-jev` and `spy-v2` scripts/tests are collected under `engineering/snapshot/shared-skills/`. They apply bounded semantic checks to trading evidence alongside deterministic arithmetic and claim audits. They are application-level integrations, separate from native brain ranking and the custom teacher learner. Their presence does not establish predictive accuracy, profitability, or authorization to trade.

The complete official-document archive remains at `RCode/research/typesafe-engineering-2026-09-21/`: catalog, page snapshots, manifest and archival scripts. The collected `JEV_ENGINEERING.md` and research report explain prior source-backed design recommendations. The original JEV folder's public-source receipts and repository catalog remain intact. Public documentation was not refreshed and no live inference was performed for this revision.

## 9. Reuse and remaining engineering work

Use the inventory to locate authoritative modules, then select a coherent source version. The snapshot is intentionally not a standalone installer: native Rust requires the surrounding crate, and shared tools use their sibling dependencies and host configuration. Private state remains at the configured state directory, default `~/.local/share/rcode-custom-jev`.

The highest-value next evidence is independently curated, source-current final outcomes per decision family, with groups that do not overlap training. Measure calibration where probabilities are used, quality and latency on actual end-to-end tasks, and revision-specific paired retirement outcomes. Reconcile the development/release adapter divergence before a future build or promotion. Existing counts and passing fixture tests cannot settle those questions.

This revision gathers source and updates documentation only. No runtime module, model weights, active revision, launcher, provider configuration or private training state was changed. Collection integrity and report links are checked in `engineering/validation.json`.
