"""Replay real capture-at trade history through the AT-Brain engine.

Read-only evidence harness. For every executed signal in the capture-at backtest
(``FINAL-TRADES.json``), we rebuild the AT-Brain *decision request* from fields that
were knowable at the primary's ``known_at`` — the signal direction plus whichever
distinct signal families had *already* fired (corroborator ``known_at`` at or before
the decision, within ``WINDOW_S``) — and run the real engine. We then
compare the recorded gross SPY moves (labels, never features) for the selected and
screened trades. These are not option P/L and do not include spreads or fees.

Nothing here touches capture-at, adapters.py, or the 8887 order path. It imports the
engine and reads a historical JSON file. Outcomes (``gross``/``exit``) are used only to
score the advisory after the fact — they never enter a candidate or the request.
"""
from __future__ import annotations

import argparse
import datetime
import json
import statistics
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve()
TOOLS = HERE.parents[2]                       # .../tools
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from at_brain import engine                   # noqa: E402

DEFAULT_DATA = Path(
    "/Users/DOANTX26/Documents/2026/_AgenticPersonalApp/SPY_Data/"
    "plans/capture-backtest-20260930/FINAL-TRADES.json"
)
# Executed set + two distinct sources (statistical independence not established).
EXECUTED = "published20/off/dots"
CORROBORATORS = (("kendall8/off/dots", "mid_long"), ("efficiency8/off/dots", "vwap"))
WINDOW_S = 120                                # corroborator known_at in [decision-120s, decision]
QUALITY_ENDORSE = 4                           # J3 quality >= this -> endorse (0..8 midpoint)


def _band(entry_time: int) -> str:
    hour = datetime.datetime.utcfromtimestamp(entry_time).hour
    if hour <= 14:
        return "open_drive"
    if hour >= 19:
        return "power_hour"
    return "midday"


def _direction(side: int) -> str:
    return "bullish" if side > 0 else "bearish"


def _nearest_prior(family: list[dict[str, Any]], decision_known_at: int) -> dict[str, Any] | None:
    """Most recent corroborator already knowable at the decision: forward-only,
    ``0 <= decision_known_at - corroborator.known_at <= WINDOW_S``."""
    best, best_gap = None, WINDOW_S + 1
    for trade in family:
        gap = decision_known_at - trade["known_at"]
        if 0 <= gap <= WINDOW_S and gap < best_gap:
            best, best_gap = trade, gap
    return best


def build_request(trade: dict[str, Any], families: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    """Causal request: a corroborator is used only if its ``known_at`` is at or
    before the primary's ``known_at`` (and within ``WINDOW_S``). Outcome fields
    (``gross``/``exit``) never enter a candidate."""
    side = trade["side"]
    candidates = [
        {
            "id": "primary",
            "text": f"{trade['label']} executed signal",
            "source_ref": EXECUTED,
            "kind": "short_color",
            "direction": _direction(side),
            "observed": True,
            "fresh": True,
        }
    ]
    for key, kind in CORROBORATORS:
        prior = _nearest_prior(families[key], trade["known_at"])
        if prior is None:
            continue
        other = prior["side"]
        candidates.append(
            {
                "id": key.split("/")[0],
                "text": f"{key} distinct-source lean",
                "source_ref": key,
                "kind": kind,
                "direction": _direction(other),
                "observed": True,
                "fresh": True,
            }
        )
    return {
        "decision_context": {
            "mode": "intraday_short",
            "session_band": _band(trade["entry_time"]),
            "prompt": trade["label"].casefold(),
        },
        "candidates": candidates,
        "families": ["J2", "J3"],
    }


def _quality(verdicts: list[dict[str, Any]]) -> int:
    for v in verdicts:
        if v["id"] == "J3.quality":
            return int(v["score"])
    return 0


def _wr(values: list[float]) -> float:
    return sum(1 for x in values if x > 0) / max(1, len(values))


def _seg(label: str, values: list[float]) -> dict[str, Any]:
    return {
        "label": label,
        "n": len(values),
        "n_wins": sum(x > 0 for x in values),
        # Legacy field name retained; its value is a sum of gross SPY moves.
        "net_pts": round(sum(values), 4),
        "win_rate": round(_wr(values), 4),
        "avg_pts": round(statistics.mean(values), 5) if values else 0.0,
    }


def replay(data_path: Path) -> dict[str, Any]:
    raw = json.loads(data_path.read_text())
    families = {EXECUTED: raw[EXECUTED]}
    for key, _ in CORROBORATORS:
        families[key] = raw[key]
    executed = raw[EXECUTED]

    rows: list[dict[str, Any]] = []
    for trade in executed:
        request = build_request(trade, families)
        result = engine.judge(request)
        quality = _quality(result["verdicts"])
        rows.append(
            {
                "day": trade["day"],
                "signal": trade["signal"],
                "side": trade["side"],
                "n_candidates": len(request["candidates"]),
                "j3_quality": quality,
                "endorsed": quality >= QUALITY_ENDORSE,
                "gross": trade["gross"],            # LABEL — scored after the fact only
                "exit_reason": trade["exit_reason"],
            }
        )

    # Descriptive gross-move buckets; higher quality need not improve outcomes.
    by_quality: dict[int, list[float]] = {}
    for r in rows:
        by_quality.setdefault(r["j3_quality"], []).append(r["gross"])
    quality_table = {q: _seg(f"quality={q}", g) for q, g in sorted(by_quality.items())}

    # Held-out split by day (chronological), applying a FIXED quality threshold.
    days = sorted({r["day"] for r in rows})
    cut = int(len(days) * 0.6)
    train_days, test_days = set(days[:cut]), set(days[cut:])

    def split(day_set: set[str], name: str) -> dict[str, Any]:
        grp = [r for r in rows if r["day"] in day_set]
        base = [r["gross"] for r in grp]
        endorsed = [r["gross"] for r in grp if r["endorsed"]]
        screened = [r["gross"] for r in grp if not r["endorsed"]]
        return {
            "scope": name,
            "days": sorted(day_set),
            "baseline": _seg("take_all", base),
            "at_brain_endorsed": _seg("endorsed", endorsed),
            "at_brain_screened": _seg("screened", screened),
            # Difference in totals across unequal counts, not per-trade edge.
            "lift_pts": round(sum(endorsed) - sum(base), 4),
        }

    return {
        "data_path": str(data_path),
        "executed_set": EXECUTED,
        "corroborators": [k for k, _ in CORROBORATORS],
        "window_s": WINDOW_S,
        "causal_rule": "0 <= primary.known_at - corroborator.known_at <= window_s",
        "metric": "recorded gross SPY moves in points; not option P/L; excludes spreads and fees",
        "legacy_field_semantics": {
            "net_pts": "sum of recorded gross SPY moves in points",
            "lift_pts": "endorsed gross-point total minus take-all total across unequal trade counts; not edge",
        },
        "source_independence": "deduplicated by (source_ref, kind); statistical independence not established",
        "action_authorized": False,
        "provider_calls": 0,
        "quality_endorse_threshold": QUALITY_ENDORSE,
        "n_trades": len(rows),
        "quality_vs_pnl": quality_table,
        "held_out": {
            "train": split(train_days, "train"),
            "test": split(test_days, "test_held_out"),
            "all": split(set(days), "all"),
        },
        "rows": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--json", action="store_true", help="print full JSON result")
    args = parser.parse_args()

    out = replay(args.data)
    if args.out:
        args.out.write_text(json.dumps(out, indent=2))

    ho = out["held_out"]
    print(f"AT-Brain replay over {out['n_trades']} real capture-at trades "
          f"({out['executed_set']})\n")
    print("J3 quality -> recorded gross SPY moves (outcome labels; not option P/L; excludes spreads/fees):")
    for q, seg in out["quality_vs_pnl"].items():
        print(f"  quality={q}  n={seg['n']:3d}  positive={seg['n_wins']}/{seg['n']}  "
              f"gross_total={seg['net_pts']:+.4f}  gross_avg={seg['avg_pts']:+.5f}")
    print(f"\nFixed endorse rule: J3 quality >= {out['quality_endorse_threshold']}")
    for key in ("train", "test", "all"):
        s = ho[key]
        b, e, sc = s["baseline"], s["at_brain_endorsed"], s["at_brain_screened"]
        print(f"  [{s['scope']:12s}] baseline n={b['n']:3d} gross={b['net_pts']:+.4f} avg={b['avg_pts']:+.5f}"
              f" | endorsed n={e['n']:3d} gross={e['net_pts']:+.4f} avg={e['avg_pts']:+.5f}"
              f" | screened n={sc['n']:3d} gross={sc['net_pts']:+.4f} avg={sc['avg_pts']:+.5f}"
              f" | unequal-count total difference={s['lift_pts']:+.4f}")
    if args.json:
        print("\n" + json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
