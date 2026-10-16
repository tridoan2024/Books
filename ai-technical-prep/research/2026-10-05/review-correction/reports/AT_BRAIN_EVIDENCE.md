# AT-Brain — Corrected capture-at evidence

**Status:** Evidence report v2, causal replay and bounded claims  
**Date:** 2026-10-05  
**Owner:** Tri Doan  
**Scope companion:** `docs/AT_BRAIN_SCOPE_AND_DEV_PLAN.md`

Reproduce from `tools/at_brain`:

```sh
python3.11 scripts/replay_capture_at.py --out docs/replay_results.json
python3.11 scripts/guardrail_mechanism.py
python3.11 -m pytest -q
```

## What the evidence supports

The causal J3 screen selects 46 of 119 historical `published20/off/dots` trades
(2026-09-17 through 2026-09-30). Their recorded gross SPY moves sum to +2.3843 points,
versus −4.7542 points across all 119 trades. This full-window selection result does
not establish a held-out edge: on the last four sessions, the kept 12/40 trades
average −0.07394 gross SPY points per trade, worse than −0.06132 for all 40 trades.
The kept held-out total is −0.8873 points; fewer selected trades account for the
smaller total loss. These are gross underlying-price moves, not option P/L after
spreads or fees.

The separate guardrail harness demonstrates flag handling, not hazard detection.
Both of its two fixtures hardcode `shorting_into_floor`, `present=True` and
`observed=True`; both produce a J4 SHADOW severity of 0.95 and a BACKSTOP note.
The harness does not verify entry-time hazard availability or measure avoided loss.
All replay and fixture outputs remain advisory with `action_authorized=False` and
`provider_calls=0`.

## Causal replay method

The primary source is the owner's `FINAL-TRADES.json` executed set
`published20/off/dots`, with `kendall8/off/dots` and `efficiency8/off/dots` as distinct
corroborating sources. For each primary decision, the harness uses only the nearest
record from each source satisfying
`0 <= primary.known_at - corroborator.known_at <= 120 seconds`.
It replaces the earlier symmetric ±120-second signal-time window, which could use
future evidence. Outcome fields such as `gross` and `exit_reason` remain labels and
never enter the request.

F4 deduplicates directional evidence by `(source_ref, kind)`; only in-scope,
observed, fresh sources with a known direction count toward J3 sufficiency.
“Independent” means distinct qualified source records under this rule;
statistical independence of the backtest families has not been established.
The fixed advisory selection rule is `J3 quality >= 4`. Quality depends on both
weighted directional agreement and qualified-source count; it is not a general
profitability score.

## Full-window and chronological results

The split uses the first six sessions for the descriptive training fold (79 trades)
and the last four for held-out evaluation (40 trades). The held-out sessions are
2026-09-25, 2026-09-28, 2026-09-29 and 2026-09-30. The threshold remains fixed.

| Fold / bucket | Trades | Gross SPY point total | Mean gross points/trade | Positive-move trades |
|---|---:|---:|---:|---:|
| Full / take-all | 119 | −4.7542 | −0.03995 | 51/119 (42.86%) |
| Full / endorsed | 46 | +2.3843 | +0.05183 | 25/46 (54.35%) |
| Full / screened | 73 | −7.1385 | −0.09779 | 26/73 (35.62%) |
| Train / take-all | 79 | −2.3016 | −0.02913 | 34/79 (43.04%) |
| Train / endorsed | 34 | +3.2716 | +0.09622 | 19/34 (55.88%) |
| Train / screened | 45 | −5.5732 | −0.12385 | 15/45 (33.33%) |
| Held-out / take-all | 40 | −2.4527 | −0.06132 | 17/40 (42.50%) |
| Held-out / endorsed | 12 | −0.8873 | −0.07394 | 6/12 (50.00%) |
| Held-out / screened | 28 | −1.5654 | −0.05591 | 11/28 (39.29%) |

The +1.5654-point difference between the kept held-out total (12 trades) and the
baseline total (40 trades) compares unequal trade counts. It is not a per-trade
edge or an option-profit estimate. The kept held-out mean is worse than both the
baseline mean and the screened mean, so this replay does not support a held-out
profitability improvement from the J3 threshold.

### Quality buckets are not monotonic

| J3 quality | Trades | Gross SPY point total | Mean gross points/trade | Positive-move trades |
|---|---:|---:|---:|---:|
| 2 | 73 | −7.1385 | −0.09779 | 26/73 (35.62%) |
| 4 | 18 | +3.6024 | +0.20013 | 13/18 (72.22%) |
| 6 | 28 | −1.2181 | −0.04350 | 12/28 (42.86%) |

Quality is not monotonic with realized outcomes: quality 4 records +3.6024 gross
points across 18 trades, while quality 6 records −1.2181 across 28 trades.
More corroboration did not produce a higher gross-point mean in this sample.

### Correction from the previous report

The previous report used future-eligible corroboration and overstated the result
as loss reduction and an edge. Its original JSON is preserved for the team at
`/tmp/at_brain_team/replay_results.before.json`.

| Fold / bucket | Previous n → causal n | Previous gross total → causal gross total | Previous mean → causal mean |
|---|---:|---:|---:|
| Full / take-all | 119 → 119 | −4.7542 → −4.7542 | −0.03995 → −0.03995 |
| Full / endorsed | 59 → 46 | +2.3829 → +2.3843 | +0.04039 → +0.05183 |
| Full / screened | 60 → 73 | −7.1371 → −7.1385 | −0.11895 → −0.09779 |
| Held-out / take-all | 40 → 40 | −2.4527 → −2.4527 | −0.06132 → −0.06132 |
| Held-out / endorsed | 17 → 12 | −0.7763 → −0.8873 | −0.04566 → −0.07394 |
| Held-out / screened | 23 → 28 | −1.6764 → −1.5654 | −0.07289 → −0.05591 |

The JSON retains the legacy keys `net_pts` and `lift_pts` for compatibility.
`net_pts` means the sum of recorded gross SPY moves; `lift_pts` means the kept total
minus the take-all total across unequal trade counts. Neither represents option
P/L after spreads, fees, fills or sizing.

## Guardrail fixture scope and the F2 backstop correction

`scripts/guardrail_mechanism.py` uses two hand-authored, loss-themed fixtures.
Its source-reference strings are labels; the script does not retrieve telemetry
or historical King-level evidence. The fixture outcome descriptions are not
verified by the harness.

| Fixture | Supplied flag | J4 severity | BACKSTOP | Authority / provider calls |
|---|---|---:|---|---|
| Circuit-breaker loss description | `shorting_into_floor`, present + observed | 0.95 | present | False / 0 |
| King-floor-veto close description | `shorting_into_floor`, present + observed | 0.95 | present | False / 0 |

F2 now aggregates every record of each hazard: `present` is true if any record is
present, severity is the maximum per-record value, and a BACKSTOP note is emitted
if any record is both present and observed. An earlier absent record no longer
masks a later present-and-observed record. This guarantees propagation of supplied
hazard flags within a validated request; it does not guarantee hazard detection,
source completeness, an order veto or loss prevention.

## Limits and verification boundary

This replay covers one instrument, one executed configuration and ten sessions
(119 trades), with only 12 selected held-out trades. It provides no uncertainty
interval, statistical power claim, option-cost model or durable-edge evidence.
The full-window positive selected total remains descriptive; the held-out means
limit the profitability claim.

These results describe the J3 advisory screen and J4 supplied-flag mechanism.
They do not establish J6 whipsaw reduction, live hazard-detection accuracy or
live trading benefit. J6 requires its own causal short-trend replay and evidence report.
Runtime hook validation and the current test-suite receipt belong in the technical
QA report; editing source does not prove behavior in the running bot.
