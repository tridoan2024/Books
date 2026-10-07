# Revision and verification summary

## Delivered edition

The revised manuscript contains **41 continuous chapters and Appendices A–H**, with a linked [contents page](README.md) and [complete manuscript](full-book.md). All 38 original chapters received topic-specific edits. Three new chapters cover:

- **39 — Durable Execution:** logical operations versus attempts, ambiguous effects, receiver contracts, effect ledgers, idempotency, resource fencing, reconciliation and compensation.
- **40 — Evaluation-Driven Releases:** evaluation of an exact release unit, required-check integrity, paired evidence and uncertainty, change control, shadow/canary limits and release ownership.
- **41 — Agent Identity and Delegated Authorization:** authenticated principals, tenant/resource/action scope, task-bound grants, approval binding, credential lifecycle, confused deputies and safe handoffs.

The team repaired material inherited issues in statistical claims, cost arithmetic and retry accounting, checkpoint recovery, oracle aggregation, human-review overload, MCP authorization, and security guarantees. Opening stories and numerical examples are explicitly illustrative; unsupported verification labels were removed or qualified. Appendices retain useful templates and historical code, with nested Markdown formatting repaired and known code defects clearly identified.

## Checks and limits

- All 41 chapter files and appendices parsed as GFM; chapter H1 numbering, Key Takeaways, balanced code fences, and internal file/anchor targets checked.
- Exact paragraph comparison found no duplicate 100+-word narrative passages across chapter files. This does not establish absence of conceptual overlap; chapter-specific revisions and the new chapter sequence address that editorially.
- All 41 original HTML files match the recovery baseline. Original chapter hashes from precrash task dispatch also match, covering the source chapters before the lead restart.
- The integrated manuscript is checked against its exact input hashes, includes every accepted chapter and appendix text, and has all 41 chapter headings in order. Integration link checks are recorded separately.
- This is not an exhaustive independent fact-check or software certification. Some chapter authors syntax-checked or mock-tested selected sketches; no installable LoopKit SDK is delivered. Appendix H retains an explicit known-defect list.
- These checks describe manuscript acceptance before the HTML replacement. Website publication and Professor Mode delivery are recorded separately; no DOCX/PDF output is claimed.

See [Source notes](SOURCE-NOTES.md) for the specific external evidence and coverage limits. Contributor records: [A1](revision-a1.md), [A2](revision-a2.md), [A3](revision-a3.md), [Chapter40](revision-ch40.md), [Chapter41](revision-ch41.md), [Appendices](revision-appendices.md).

## Word counts

The following unified narrative counts exclude headings, tables, code blocks, raw HTML, block quotes and source/further-reading sections; list prose and inline code are included. Unicode word segmentation counts hyphenated words as one. Contributor reports use slightly different conventions and are retained as reported. Existing long/short chapters are disclosed rather than padded or truncated for a target; all three new chapters must be 3000–5000 narrative words.

| Chapter | Narrative words | Length status |
|---|---:|---|
| 1 | 4,762 | Within target |
| 2 | 2,844 | Existing-chapter length exception |
| 3 | 6,712 | Existing-chapter length exception |
| 4 | 3,937 | Within target |
| 5 | 4,243 | Within target |
| 6 | 3,611 | Within target |
| 7 | 5,566 | Existing-chapter length exception |
| 8 | 4,237 | Within target |
| 9 | 5,818 | Existing-chapter length exception |
| 10 | 4,189 | Within target |
| 11 | 4,086 | Within target |
| 12 | 5,711 | Existing-chapter length exception |
| 13 | 3,445 | Within target |
| 14 | 4,251 | Within target |
| 15 | 5,672 | Existing-chapter length exception |
| 16 | 4,192 | Within target |
| 17 | 3,630 | Within target |
| 18 | 5,759 | Existing-chapter length exception |
| 19 | 4,152 | Within target |
| 20 | 5,418 | Existing-chapter length exception |
| 21 | 4,800 | Within target |
| 22 | 4,166 | Within target |
| 23 | 4,396 | Within target |
| 24 | 5,081 | Existing-chapter length exception |
| 25 | 4,200 | Within target |
| 26 | 4,144 | Within target |
| 27 | 3,975 | Within target |
| 28 | 3,256 | Within target |
| 29 | 3,796 | Within target |
| 30 | 5,276 | Existing-chapter length exception |
| 31 | 4,013 | Within target |
| 32 | 3,943 | Within target |
| 33 | 4,074 | Within target |
| 34 | 4,701 | Within target |
| 35 | 3,804 | Within target |
| 36 | 3,874 | Within target |
| 37 | 4,011 | Within target |
| 38 | 4,341 | Within target |
| 39 | 3,238 | Within target |
| 40 | 3,399 | Within target |
| 41 | 3,441 | Within target |

Total chapter narrative: **178,164 words**, excluding appendices and the categories above.

## Recovery note

The lead terminal exited after RCode 0.4.35 web-fetch pagination split a UTF-8 apostrophe at an invalid byte boundary. The owner restarted the lead; all three original agent panes and their assignments survived. The recovered lead reused successful source receipts. After the team stalled again, the owner instructed Codex to stop it and take over. Codex preserved all handoffs, stopped the verified team processes, authored Chapter 41, and completed manuscript integration. No final team-controller seal is claimed. The crash was reported for separate core repair; no RCode binary/source change was made as part of this book revision.

Final editorial follow-up: [Codex final corrections](revision-codex-final.md) records bounded Chapter 1 corrections after manuscript acceptance and before publication. Original-HTML preservation is a historical pre-replacement check.
