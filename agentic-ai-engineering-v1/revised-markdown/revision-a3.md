TASK 71e1e3896f7a45248b6cb1fa984c7575

# Revision A3: Chapters 27–38

All twelve original articles were read and converted with pandoc, excluding reader chrome. Chapter26 and the index supplied preceding context. Every assigned chapter received substantive corrections and practical implementation/recovery guidance. Original HTML was not changed; no book publication or website work occurred.

| Chapter | Prose words | Material changes |
|---|---:|---|
|27|4,337|All-in/cohort accounting, conditional correlated retries, corrected arithmetic, shared reservations, no doubled labor benefit.|
|28|3,461|Reconciled cost example; cache-write cost; deadline-safe batching; deterministic advisory matching; correlated cascade failures.|
|29|4,023|APM retained; trace constructor fixed; replay versus counterfactual; private metadata; durable effect journal.|
|30|5,538|Resource authorization outside prompts; candidate-only memory writes; bounded egress claims; check/use races; recovery exercise.|
|31|4,206|Scoped broker rather than generic privileged proxy; effective sandbox enforcement; no safety score certification; RBAC/admission risks.|
|32|4,184|Unconditional gate requirements; post-result denial; unknown effects after timeout; approval binding; bounded alignment claims.|
|33|4,444|Canary insufficiency/critical gates; source-path hashes; compensation proposals; uncertain effects, idempotency retention, fencing.|
|34|4,949|Vendor comparison replaced by architectural strategies; type-checker claim corrected; baseline tests, evidence, publication boundary.|
|35|4,022|Hypothetical CVE placeholder; epistemic status/scope; relevant excerpts; no universal source-count or truth-probability thresholds.|
|36|4,077|Read-only risk qualified; bounded downstream checks; browser ambiguity and lost confirmation; emergency/recovery authority.|
|37|4,295|Evidence-led optional adoption; deterministic baseline; small-sample limits; no rejection-rate targets or forced domain disjointness.|
|38|4,553|Unsupported vendor benefits/maturity removed; candidate versus activation authority; unknown drift; explicit terminal states; PartIX transition.|

Counts use pandoc's parsed prose, excluding code blocks; headings/tables remain included. Chapter30 retains an existing long-chapter exception rather than cutting useful security material arbitrarily. Other chapters are within 3,000–5,000 words.

**Actual checks:** 12/12 pandoc parses; one H1 and Key Takeaways per chapter; balanced fences; no raw HTML; all Python fences parse; no duplicate long paragraphs within chapters; original chapter27–38 HTML hashes unchanged. Nine focused check groups passed for arithmetic, selected pure snippets, gate behavior, canary bounds, and drift unknown state. These are not LoopKit SDK, remote-service, browser, or security-isolation tests. Relative links resolve except the intentionally forthcoming chapter41 link.

**Evidence:** Run-local `a3-work/checks.json`, `test_revision.py`, `conversion.json`, and chapter diffs under `/Users/DOANTX26/.local/state/rcode-team/run-a5151b970fee473b9c73623ab407f878/`. Final test receipt: `/Users/DOANTX26/Library/Application Support/rcode/native-receipts/955739cdf3db6af80f8272253786ea09bc4cee1fc75e23bbf08654e33d4de537/bc03e0ff95a351a28d062489cc55861a3ed5cc52a78a1d9bc95965d410de821c.json`.

Sources were limited to the lead's claim-bounded packet; primary URLs are cited where used. Inherited references are background, not blanket fact-check receipts. Stories, numbers, and APIs remain explicitly illustrative. Chapter41 was not authored: it requires the accepted Chapter40 and a later assignment.
