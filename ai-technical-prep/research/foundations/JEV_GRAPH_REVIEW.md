# Open-source reuse assessment

2026-09-21. Live GitHub searches and commit-pinned archives are retained here. No Git history, model weights or unrelated repository dependencies were downloaded. No hosted inference was used in these tests. Source snapshots are separate from installed product claims.

## Selection and observed behavior

| Repository | Pin / license | Local tests | Decision |
|---|---|---|---|
| [petgraph/petgraph](https://github.com/petgraph/petgraph) | Main `a4d94bd2c39ac198c22682b2dcb1ff21583d0db0`; selected release 0.8.3 `162903562ce5b00cdba390a0d9c1bb80f1c75bf5`; MIT OR Apache-2.0 | 57 upstream library tests passed on each snapshot, with std and no default features; workflow probe verifies dependency ordering and cycle rejection | Reuse released crate directly in native RCode; no copied graph algorithm |
| [a-agmon/rs-graph-llm](https://github.com/a-agmon/rs-graph-llm) | `f8ac2ff6a5592092095c367ac06a8b529b19d672`, graph-flow 0.8.0; MIT | 19 upstream library tests passed without postgres/rig, using an isolated copy of graph-flow; two workflow probes passed: input pause/resume and a limitation characterization | Keep as evaluated runner reference; not the RCode execution owner |
| [typesafe-ai/typesafe-sdk-python](https://github.com/typesafe-ai/typesafe-sdk-python) | `0ffd094c72ed9445223060b24ffd7a56aa781fb4`, 0.7.1; MIT | 648 tests passed, 17 skipped in selected client/question/response/retry/error/config/type/sync/Pydantic/logging suite | Reuse official SDK for optional Python Jev adapter; do not rewrite HTTP/retry/schema layer |
| [Dicklesworthstone/skillranker](https://github.com/Dicklesworthstone/skillranker) | `333d04b8f322de67a47410d0b62d7a28a7ce51af` | Not executed: declared Rust 1.95 exceeds installed 1.94.1, and license contains a restrictive rider | Excluded from code reuse; no source copied into RCode |

The initial petgraph tag lookup used an incorrect naming convention and returned 404; the tags API identified `petgraph@v0.8.3`. The released snapshot was downloaded and tested separately rather than claiming the main branch and published release are identical.

## Strengths and actual workflows

**petgraph:** build an indexed directed graph → add prerequisite edges → run topological sort or strongly connected components → interpret results in application-specific policy. The library handles graph algorithms, not task permissions, durability, leases or model reasoning. Selected minimal `std` feature avoids unused graph representations. A task graph diagnostic is a low-coupling first integration with immediate observable utility.

**graph-flow:** immutable validated GraphBuilder → Task implementations using shared Context → SessionStorage → FlowRunner load/execute/save → typed Continue/WaitForInput/End. Upstream tests cover builder validation, storage version conflict, fanout and execution. The custom barrier probe demonstrates **two mock effect invocations before one SessionConflict**. This is expected documented behavior, not an allegation of an undocumented bug. Its optimistic storage lock does not provide pre-execution ownership. Chained ContinueAndExecute state is persisted after the chain returns. PostgreSQL and Rig are optional dependencies; neither was enabled or tested. Replacing RCode's owner would require custom effect fencing, storage, cancellation and integration, so it would not avoid that work.

**TypeSafe SDK:** instantiate sync/async client → construct Choice/Noul/Score questions → send immutable state → transport/retry layer → validated response objects → application policy. The selected tests use MockTransport, including HTTP-shaped logs: those are not live calls. This covers SDK transport and wire behavior, not Jev relevance accuracy, calibration or privacy suitability. Preserve the SDK as the protocol owner; RCode's adapter should only enforce data profile, evidence identity, deadlines, policy and receipts. Introducing a Python runtime in the Rust foreground would add lifecycle work; a separately invoked optional sidecar can reuse RCode's existing process machinery. Do not install or activate it until its own product ticket passes.

## Initial implementation decision (superseded by combined revision 2)

Initial sequence, retained for decision history; revision 2 combines both tools in JG-R01 and reserves JG-R02 for live calibration. First proposal for JG-R01: read-only task graph inspection using the exact released petgraph dependency. This will not change task mutation/scheduling or claim durable graph execution. Existing `blocks` and `blocked_by` can be one-sided; the diagnostic treats their union as prerequisite→dependent edges and reports missing references. A cycle or unknown reference suppresses ready-task suggestions. This avoids silently rewriting task state while establishing a real native integration.

Next JG-R02: official-SDK adapter with mock subprocess integration, disabled default and independent live/calibration gate. Follow-on graph recovery work must satisfy existing HJ ownership/effect contracts. No library test closes those requirements.

Evidence: [source manifest](SOURCE_MANIFEST.json), [released petgraph provenance](sources/petgraph-release/SOURCE.json), [petgraph log](tests/petgraph.log), [release log](tests/petgraph-release.log), [graph-flow log](tests/graph-flow.log), [SDK log](tests/sdk.log), [workflow probe](tests/workflow-probe.log). Exact upstream test argv/cwd are in `tests/{petgraph,graph-flow,sdk}.json`; `run_repo_tests.py` reproduces selected suites. Custom probe source is in `workflow-probe/src/lib.rs`. Raw search responses preserve ranking; stars were discovery signals, not acceptance criteria.

## Jev research alignment and additional execution (user correction)

The user's JEV and Graphing folders contain prior research, including supplied articles. Both are primary task inputs. The initial implementation selection overemphasized graphs; the user corrected that on September 21. The current candidate scope includes **both** graph diagnostics and a D01 semantic evidence-ranking adapter. Later roadmaps retain intent/work routing (D02), protected context (D03), contradiction/review (D04), risk advice (D05) and model selection (D06) from the existing `jev_modular` plan. No new interpretation makes Jev merely an SDK or replaces the user's research with GitHub popularity.

Read and reused: the JEV report's workflow, BCB mapping, pilot and article sections; Graphing report; `jev_modular/{README,SCOPE,ARCHITECTURE_REVIEW}.md`; `graph_modular/{REUSE_MAP,research/VERIFICATION}.md`. Existing BCB NetworkX/Pydantic/LangGraph/AFLOW downloads are reference slices, not complete installed packages. They are not redownloaded for ordinary Rust RCode. The AV1DLive guide remains unavailable according to its retained download status; no guide-content claim is made.

| Additional repository from user research | Pin | Executed evidence / decision |
|---|---|---|
| eugeniughelbur/jev-engineering | `3161dbfb44f21bafa2ec7940ec18cfb090c7b43d`, MIT | Offline order/policy scripts passed; fake-transport route/rank/keep probe passed after correcting the probe's Noul field. Route has a hardcoded confidence floor, rank orders Choice options, keep clips each item to 400 characters. Reuse workflow concepts; do not adopt its thresholds, clipped context or shell gate as RCode policy. |
| typesafe-ai/system-one-adapter-python | `adffc2eab300a4fa3c0e92252d4ffd6ceaa53700`, MIT, 0.2.0 | 212 selected network-blocked tests passed with OpenAI 2.53.0 / Anthropic 0.121.0. First collection lacked httpx; latest provider majors then caused 27 mocked-transport failures (185 passed). Preserve failures; pin the tested compatible versions. Reuse its typed request/response/probability and provider machinery for the native Jev-style boundary. |
| githubnext/localjev | `3f23e36e1a3bff46c7e83e8e3781d3512bc82021`, MIT, 0.2.0 | Original test attempt: 9 passed, one missing hyparquet import. Installed Bun 1.3.11 could not parse upstream lock v2. An isolated copy retained the original lock and generated a compatible one; 19 tests passed. Its TypeScript API bridge uses model-generated probabilities; no DiffusionGemma weights or live quality benchmark was run. Keep as evaluated alternative; the official Python adapter avoids adding a Bun server to RCode. |

Evidence: `tests/jev-engineering-*.log`, `tests/jev-workflow-probe.json`, `tests/system-one-adapter*.log`, `tests/localjev*.log`. Both selected Jev packages are pinned and directly reused; thin RCode code adds evidence identity, host configuration and native process cancellation, not another transport implementation. Decision quality remains unmeasured by mock tests.
