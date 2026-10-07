# Revision Report — Chapters 14–26

TASK 652ba435d9fc429b94d844efc7cb52da

All thirteen assigned chapters were converted from original article bodies with pandoc and substantively revised in Markdown. Original HTML remains unchanged. Each chapter preserves useful material, adds specific implementation/recovery guidance and exercise acceptance checks, normalises headings, and links adjacent Markdown chapters.

| Chapter | Main revision | Prose words: original → revised |
|---|---|---:|
| 14 | Durable admission, dedup identity, budget reservations, fenced replacement | 3,678 → 4,273 |
| 15 | Test/oracle limits, sampled properties, real p95 measurement, requirement evidence | 5,329 → 5,695 |
| 16 | Versioned plans, changed prerequisites, evidence reuse, non-coercive stopping | 3,709 → 4,219 |
| 17 | File/effect ledgers, safe worktree lifecycle, ambiguous-effect recovery | 3,675 → 3,652 |
| 18 | Truthful partial/cancelled/blocked outcomes, pre-action limits, corrected arithmetic | 5,385 → 5,776 |
| 19 | Control-theory terminology, staged widening, task-specific evidence | 3,739 → 4,175 |
| 20 | Confusion-matrix denominators, oracle fallibility, fail-closed composition | 5,246 → 5,436 |
| 21 | Information boundary, correlation limits, required-checker semantics | 5,238 → 5,070 |
| 22 | Selection bias, stronger regression checks, evaluated-release manifests | 3,563 → 4,200 |
| 23 | Test-discovery integrity, proxy gaps, simultaneous acceptance versus historical union | 3,912 → 4,420 |
| 24 | Measured delegation value, no task truncation, explicit partial fleet outcomes | 5,259 → 5,106 |
| 25 | Ownership generations, acceptance/handoff protocol, resource-enforced fencing | 3,640 → 4,221 |
| 26 | Preserve Critical severity under overload, bound approvals, correct statistical claim | 3,653 → 4,171 |

Counts exclude fenced code, headings, tables, reading notes, and source sections. Chapters 15, 18, 20, 21, and 24 retain existing over-5,000-word exceptions rather than discard useful material merely to meet length.

## Verification

- 13/13 chapters parsed with pandoc; numbering, unique H2 headings, ordered exercises, labelled balanced fences, and no reader chrome or unsupported verification labels checked.
- 26/26 adjacent chapter link targets exist; 13/13 original chapter HTML hashes unchanged.
- All 17 Python blocks parse. Seven layered-oracle cases and five required-panel cases passed with local mocks. p95, liability-cap negative controls, the 200-run confidence bound, and cost arithmetic checked.
- No exact cross-chapter prose duplicates of 40+ words, excluding shared editorial notes/source footers. Focused source-to-revision diffs retained and reviewed for substantive corrections.

Evidence: `/Users/DOANTX26/.local/state/rcode-team/run-a5151b970fee473b9c73623ab407f878/a2-work/validation.json`; adjacent `chapter-NN.diff` files.

Limits: source claims are bounded to the lead’s shared packet; illustrations are not production measurements. LoopKit remains illustrative, not an executed SDK. Mermaid source was not visually rendered. Whole-book integration belongs to the lead. Chapter 40 has not been authored; it requires its later assignment and accepted Chapter 39.
