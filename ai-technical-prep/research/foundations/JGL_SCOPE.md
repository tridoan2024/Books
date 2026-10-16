# RCode_JGL scope — executable Brain delivery
Version 5.1 · Enhancement JGL-2026-09-EXEC · 2026-09-26

## Outcome
Deliver the owner's Brain = JEV + Graph + Loop design through a native executable plan path, normal conversation integration, persistent verified recovery and a separately built rcode_jgl executable. Preserve personal auto-execute. Current baseline has event graphs and telemetry, not an executable cognitive plan or effective learning. Previous v3 originals preserved under codex-delivery/baseline.

## Requirements
| ID | Required behavior and acceptance |
| --- | --- |
| JGL-U01 | Ordinary user goals populate Brain state; plan goals and completed step receipts survive restart. Operator commands do not create goals. Per-turn receipts/budgets remain distinct. |
| JGL-U02 | Model supplies a typed brain_plan with goal, stable plan ID, step actions, dependencies, read/write resources and explicit acceptance checks. Validate cycles/missing dependencies before any execution. |
| JGL-U03 | Execute actions through registered native RCode tools under current host policy; no new confirmation bureaucracy. Nested plans/agent launching excluded from this first executable plan contract. |
| JGL-U04 | Every step has persisted attempt identity, exact action hash, tool receipt and acceptance observations. Missing/contradictory artifacts cannot be success merely because a process exits zero. |
| JGL-U05 | Complete a plan only when all required checks pass against current source versions. Failed/incomplete plans produce explicit incomplete native status in conversation and nonzero direct-CLI status. |
| JGL-U06 | Runtime schedules dependency-ready steps concurrently subject to resource conflicts and limit; a branch becomes ready immediately after its own prerequisites finish. |
| JGL-U07 | Recheck declared source fingerprints while work runs, before dispatch and at completion; invalidate affected descendants, reject stale results. Re-execute only replay-safe steps; uncertain mutations remain blocked. |
| JGL-U08 | On failure choose a distinct declared alternative with bounded attempts, preserving failure evidence. A later success resolves only that incident. Restart must not blindly replay uncertain side effects. |
| JGL-U09 | Persist project-scoped action success/failure learning tied to acceptance receipts; consume it when ordering alternatives on subsequent plans/restarts. Only measured verified outcomes train this local strategy memory. |
| JGL-U10 | Keep /brain controls; expose actual plan state/results to model and add provider-free --jgl-plan / --jgl-session / --jgl-state-dir execution through the same scheduler and native tools. |
| JGL-U11 | Preserve baseline code/receipts and build separate local rcode_jgl. No unrelated cleanup, global binary replacement or service restarts. |
| JGL-U12 | Measure scheduling/whole-workflow timing honestly. Test compiled CLI plus conversation integration; no universal latency or autonomous intelligence guarantee. |

## Architecture and bounds
Add engine/jgl.rs for plan validation, execution state machine, source-version invalidation, checks and durable strategy memory. Native brain_plan tool advertises schema; Engine executes it through the same runner after checking constituent actions. Existing D01/TypeSafe request API stays unchanged; semantic planning is performed by the configured RCode model, while deterministic checks grade objective outcomes. This is deliberately concrete JEV/graph/loop integration, not training a base model.

Plans contain <=64 steps, <=4 alternatives per step, <=4 concurrent actions, bounded execution count and a wall deadline. Explicit file/output predicates are supported; unconstrained subjective acceptance remains unverified rather than guessed. Opaque shell side effects cannot be inferred: serialize by default, allow declared independent resources for known scripts. Persistent interrupted running steps are uncertain; only explicitly replay-safe work may rerun. Versioned project+session plan storage, exclusive writer lock, atomic private files and error visibility. Corrupt state must not silently become empty success.

Local strategy memory is the immediate execution backend. Central Copilot-Mem integration and automated skill publishing remain separate future integrations; this delivery does not mislabel local JSON as central memory or claim a trained skill. Behavioral learning must demonstrably change the next action choice after restart. No incidental provider API changes.

## Verified delivery

Version 4.0 implementation complete within the stated bounds. Evidence and exact artifact identity: [codex-delivery/FINAL_RESULTS.json](codex-delivery/FINAL_RESULTS.json), [status](codex-delivery/STATUS.md), and [usage](codex-delivery/README.md).

## Version 5.0 amendment — JGL-2026-09-SMART
Preserves the completed v4 delivery and its evidence. Expand personal autonomous work through the following integrated requirements. This amendment is pending until new evidence passes.

| ID | Behavior / acceptance |
| --- | --- |
| JGL-S01 | Persist readable project-scoped execution experiences with goal, strategy, action, acceptance contract, structured diagnosis and receipt. Retrieve relevant episodes in the real conversation prompt before planning; expose provenance, uncertainty and omission count. Historical data is evidence, never authority or automatic execution. |
| JGL-S02 | Failed native plans return failed predicates, error category and next diagnostic direction to the model so it can revise prerequisites/actions. A subsequent verified result resolves that step's diagnosis. Failures remain learning evidence; no false success. |
| JGL-S03 | Support exact file/output equality and JSON-pointer equality checks in addition to v4 predicates. Invalid JSON, missing pointers and wrong types fail acceptance. |
| JGL-S04 | Dispatch any available registered native tool through existing hooks/policy, rejecting recursive brain_plan and the legacy Copilot-backed code_review tool prohibited by project AGENTS.md. Unknown tools rejected before effects. Non-file tools serialize unless explicitly declared parallel-safe. Native tools retain their actual capability/configuration requirements; direct CLI does not invent dynamic MCP registrations. |
| JGL-S05 | Remove six-tool whitelist and fixed plan step/alternative/concurrency maxima. Expose max_dispatches and deadline_seconds with zero meaning unlimited; default both zero. Concurrency remains explicit positive resource scheduling control. Declared absolute paths supported for personal workstation work. Cancellation, receipts, dependency checks and truthful completion remain operational. |
| JGL-S06 | Build/install through existing rcode_jgl symlink; test native CLI, prompt integration and v4 regressions. Preserve binary/source baseline. Demonstrate changed future choice and retrieved prior failures, without claiming generalized intelligence gains. |

Learning stays in the native project store for this expansion, preserving existing central memory routes. It transfers readable evidence to model reasoning, while exact-action statistics still control deterministic alternative ordering. Automatic model-weight training and automatic skill publication are not implemented by this amendment.

## Current-core integration amendment — JGL-BASE0430
The owner requires Brain + the current RCode body. The v5 implementation and tests on 0.4.16 are preserved as historical component evidence, not latest-core parity.
- B01: Build an isolated RCode/rcode-jgl tree from the verified full 0.4.30 source manifest; preserve installed global rcode and its sessions. Carry native JGL scheduling/learning/acceptance and Brain operator/lifecycle integration forward without overwriting 0.4.30 completion, effect journals, file-write byte handling, context or team behavior.
- B02: Identify derivative as 0.4.30-jgl.1; this version derives from real 0.4.30 source, not a label edit to 0.4.16. Preserve current model gateway by giving rcode_jgl a launcher selecting its dedicated native binary.
- B03: Verify JGL component/product/conversation/live-model behavior against rebased artifact plus 0.4.30 completion and file-write regressions, including actual dependency changed/unchanged and writer byte-matrix CLI fixtures. Keep new native completion contract authoritative when active; JGL result must not erase it.
- B04: Independent review of merge changes/evidence, install exact verified artifact and confirm both public commands identify correct releases. Record current base manifest, deviations, source/native/launcher hashes and rollback.

## Current verified delivery — 0.4.30-jgl.1
The current-core integration supersedes the historical 0.4.16 executable baseline. Canonical source is `RCode/rcode-jgl`, derived from the verified 422-file RCode 0.4.30 release manifest. v5 Brain functionality is retained. Native completion/recovery/file-write modules and global production binary are preserved. Component, actual CLI, conversation, live-model and independent review evidence: [rebase-0430/FINAL_RESULTS.json](rebase-0430/FINAL_RESULTS.json). Public command remains `rcode_jgl`; fresh launches use `0.4.30-jgl.1`.

## Plan closure repair — JGL-CLOSE-01 (contract 1)
Observed source/receipts: [incident](plan-closure-fix/ISSUE.md). Existing 0.4.30-jgl.1 verification remains historical; this repair is verified below.
- C01: Validate all resource paths and roles before constituent hooks or tools run. File acceptance paths must be declared reads/writes or inferred from native file actions. Opaque shell writers declare all outputs explicitly; directory resources return actionable file-manifest guidance. Invalid later steps cannot leave earlier effects.
- C02: Persist original action receipt, immutable input fingerprints, dependency versions and structured invalidation diagnoses. Do not lose evidence on stale/late results. Do not relax changed-input, cancellation, irreversible replay or completion-controller guarantees.
- C03: Add explicit verify_only brain_plan mode for the same persisted plan. It dispatches no actions, only rechecks current artifacts against unchanged acceptance, authenticated action receipt and stable read-only inputs/dependencies. Only known successful executions with failed acceptance (or still-valid successful records) qualify; missing receipts, changed source, interrupted/blocked state or amended contracts remain incomplete. Reconciliation stores a new verification receipt, clears resolved diagnosis, and does not credit the original strategy for externally repaired output. Historical pre-repair blocked plans without sufficient provenance stay unverified.
- C04: Explain resource roles and same-plan verification recovery in the native schema/prompt; expose structured repair directions. Keep artifact requirements objective across all three forecasts; no task-specific market logic in the Brain.
- C05: Build 0.4.30-jgl.2, install only dedicated JGL after code and independent review, run installed fixture regressions and exact `run spx-v2a-all skill` in a fresh session. Expected: one acquisition, saved/registered three horizon forecasts, no unresolved save plan or contradictory INCOMPLETE banner. Preserve global rcode 0.4.30 and old run evidence.
No changes to TypeSafe API, market-data/skill logic, general model training, or provider routing. Resource role validation is an autonomous model-repair contract, not an interactive permission prompt.

C02 integration clarification: the composite brain_plan call must journal running/completed state through the existing execution-recovery store, including errors, so context recovery cannot label an executed plan “not started”. Original observed tool-exchange files retained not_started even for known completed native plans.

## JGL-CLOSE-01 verified delivery — 0.4.30-jgl.2
C01–C05 passed. The independent Gemini review returned PASS; 47 candidate and 47 installed native cases passed, with targeted JGL/Brain/completion/recovery tests. The exact skill request passed on the candidate (311.327s) and installed public command (285.179s): one acquisition, registered report and three forecasts, verified source/calendar evidence, complete native save plan and completed recovery journal. Canonical source remains `RCode/rcode-jgl`; global RCode 0.4.30 is unchanged. Fresh `rcode_jgl` launches use .2. Evidence: [final results](plan-closure-fix/FINAL_RESULTS.json), [HTML comparison](plan-closure-fix/comparison.html), [independent review](plan-closure-fix/INDEPENDENT_REVIEW.md). Predicate verification does not establish arbitrary semantic adequacy or future prediction accuracy.

## JGL-SUP-OFF-01 — supervisor startup default (2026-09-28)
Source request and observed .3 baseline: [supervisor-default-off/ISSUE.md](supervisor-default-off/ISSUE.md).
- OFF-R1: Public `~/bin/rcode_jgl` starts new/unconfigured project scopes with automatic learning disabled and inline supervision off. Current workspace is explicitly set off through the native command. This supersedes the prior implicit automatic-on default for the public launcher.
- OFF-R2: Existing explicit automatic-learning choices remain; `/supervisor on`, `/supervisor off` and explicit inline environment overrides work. Do not overwrite corrupt control state, bypass its native lock or change passive logging.
- OFF-R3: Preserve plain RCode, both compiled binaries, model/config/argument forwarding, and running processes. No core rebuild. Honor `-C`/`--directory` and `RCODE_DATA_DIR` scope identity. Skip informational invocations and native isolated trial/plan modes.
- OFF-R4: Verify actual installed CLI status in an isolated new project, persisted opt-in/off transitions, and current workspace off. Unit tests cover scope selection, preservation and lock contention. Fixture results establish local control behavior, not model quality or all existing-session worker liveness.
