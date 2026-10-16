"""The J1-J5 catalog plus opt-in J6: deterministic, auditable, uncalibrated.

Each family answers a typed question (Jev primitive) over normalized capture-at
evidence. The custom backend is deterministic and **uncalibrated** — every verdict
here carries ``calibrated=False`` and ``confidence=None``. Calibrated probabilities
require the opt-in TypeSafe reference path (see reference.py). Nothing in this module
performs I/O, reads a clock, or interprets candidate text as an instruction.

Families
--------
J1  evidence relevance / rerank           -> rerank
J2  signal convergence                     -> three independent Nouls (bull/bear/chop)
J3  setup regime + quality                 -> Choice(regime) + Score(quality 0-8)
J4  guardrail screen (shadow)              -> one Noul per hazard (separate-flags)
J5  lesson relevance + citation audit      -> rerank(lessons) + per-citation audit
J6  Stable Short reversal noise            -> convergence/excursion/chop/whipsaw/advice
"""
from __future__ import annotations

from typing import Any

from .common import clamp
from .evidence import Candidate, recency

FEATURE_NAMES: tuple[str, ...] = (
    "query_coverage", "text_precision", "phrase", "specificity", "observed",
    "fresh", "in_scope", "recency", "directional_info", "level_proximity",
)
# Documented, bounded default weights (same role as custom_jev's DEFAULT). The
# learner may propose new ones under the promotion gate; v1 ships these.
DEFAULT_WEIGHTS: tuple[float, ...] = (
    3.0, 0.6, 1.0, 0.4, 0.6, 0.4, 0.8, 0.7, 0.5, 0.6,
)

REGIMES: tuple[str, ...] = ("trend-up", "trend-down", "chop", "unclear")
QUALITY_MAX = 8

# J6 constants are heuristic, not calibrated probabilities or learned thresholds.
J6_EXCURSION_BAND = 6.0
J6_STRONG_EXCURSION = 10.0
J6_SCORE_DISTANCE = 20.0
J6_ENDORSE_MAX = 0.40
J6_SUPPRESS_MIN = 0.60
WHIPSAW_MIN = 0.05
WHIPSAW_MAX = 0.95
WHIPSAW_BUCKETS = frozenset(
    f"{excursion}|{agreement}|{chop}"
    for excursion in ("lt6", "6to10", "ge10")
    for agreement in ("0", "1", "2")
    for chop in ("0", "1", "ge2")
)


# ---- rerank primitive (J1, J5.find) ----------------------------------------

def feature_vector(context_tokens: set[str], prompt: str, cand: Candidate) -> tuple[float, ...]:
    """Deterministic relevance features for one candidate vs the decision context."""
    overlap = len(context_tokens & cand.tokens)
    coverage = overlap / max(1, len(context_tokens))
    precision = overlap / max(1, len(cand.tokens))
    phrase = 1.0 if prompt.strip() and prompt.casefold().strip() in cand.text.casefold() else 0.0
    specificity = min(1.0, len(cand.tokens) / 40.0)
    proximity = (
        1.0 / (1 + cand.proximity_ticks)
        if cand.kind == "level" and cand.proximity_ticks is not None
        else 0.0
    )
    return (
        coverage,
        precision,
        phrase,
        specificity,
        float(cand.observed),
        float(cand.fresh),
        float(cand.in_scope),
        recency(cand.age_seconds),
        1.0 if cand.lean != 0 else 0.0,
        proximity,
    )


def rerank(
    context_tokens: set[str],
    prompt: str,
    candidates: list[Candidate],
    weights: tuple[float, ...],
    top_k: int = 4,
) -> dict[str, Any]:
    """Order candidates by uncalibrated relevance score (dot product of features)."""
    scored: list[tuple[float, int, str]] = []
    scores: dict[str, float] = {}
    for i, cand in enumerate(candidates):
        vec = feature_vector(context_tokens, prompt, cand)
        value = sum(x * y for x, y in zip(vec, weights))
        scored.append((value, -i, cand.id))  # -i keeps input order stable on ties
        scores[cand.id] = round(value, 8)
    scored.sort(reverse=True)
    order = [cid for _, _, cid in scored]
    k = max(1, min(top_k, len(order)))
    return {
        "order": order,
        "scores": scores,
        "surfaced": order[:k],
        "grouped_low": order[k:],
    }


# ---- convergence masses (shared by J2, J3) ---------------------------------

def _independent_directional(candidates: list[Candidate]) -> list[Candidate]:
    """Shared F4 source selection for J2/J3 masses and J6 timeframe agreement."""
    independent: dict[tuple[str, str], tuple[tuple[bool, float], Candidate]] = {}
    for cand in candidates:
        if not cand.in_scope or cand.direction == "unknown" or cand.directional_weight <= 0.0:
            continue
        key = (cand.source_ref, cand.kind)
        strength = (cand.observed and cand.fresh,
                    cand.freshness_factor() * recency(cand.age_seconds))
        if key not in independent or strength > independent[key][0]:
            independent[key] = (strength, cand)
    return [cand for _, cand in independent.values()]


def _masses(candidates: list[Candidate]) -> dict[str, float]:
    """Mass for J2/J3, deduplicated by independent ``(source_ref, kind)``.

    Out-of-scope and unknown-direction records supply no mass or sufficiency.
    Per source, prefer an observed+fresh record, then the greatest freshness *
    recency weight (input order breaks ties). Copies therefore count once.
    Only independent, in-scope, observed+fresh sources count toward sufficiency;
    other eligible records retain their discounted mass. Explicit neutral is
    evidence of neutrality; unknown is insufficient evidence, not neutral.
    """
    bull = bear = neutral = 0.0
    n_fresh_observed = 0
    for cand in _independent_directional(candidates):
        w = cand.directional_weight * (cand.freshness_factor() * recency(cand.age_seconds))
        if cand.lean > 0:
            bull += w
        elif cand.lean < 0:
            bear += w
        else:
            neutral += w
        if cand.observed and cand.fresh:
            n_fresh_observed += 1
    total = bull + bear + neutral
    return {
        "bull": bull, "bear": bear, "neutral": neutral, "total": total,
        "n_fresh_observed": float(n_fresh_observed),
    }


# ---- verdict helper --------------------------------------------------------

def _verdict(vid: str, family: str, vtype: str, **payload: Any) -> dict[str, Any]:
    """Uniform verdict envelope. Custom backend is always uncalibrated."""
    return {
        "id": vid, "family": family, "type": vtype,
        "calibrated": False, "confidence": None, **payload,
    }


# ---- J1 --------------------------------------------------------------------

def j1_evidence_rerank(
    context_tokens: set[str], prompt: str, candidates: list[Candidate],
    weights: tuple[float, ...], top_k: int,
) -> dict[str, Any]:
    result = rerank(context_tokens, prompt, candidates, weights, top_k)
    return _verdict("J1.rank", "J1", "rerank", **result)


# ---- J2 --------------------------------------------------------------------

def j2_convergence(candidates: list[Candidate]) -> list[dict[str, Any]]:
    m = _masses(candidates)
    total = m["total"]
    if total <= 0.0:
        return [
            _verdict("J2.bull", "J2", "noul", p=0.0, abstained=True, reason="no_directional_evidence"),
            _verdict("J2.bear", "J2", "noul", p=0.0, abstained=True, reason="no_directional_evidence"),
            _verdict("J2.chop", "J2", "noul", p=0.0, abstained=True, reason="no_directional_evidence"),
        ]
    p_bull = clamp(m["bull"] / total)
    p_bear = clamp(m["bear"] / total)
    p_chop = clamp(1.0 - abs(m["bull"] - m["bear"]) / total)
    return [
        _verdict("J2.bull", "J2", "noul", p=round(p_bull, 6)),
        _verdict("J2.bear", "J2", "noul", p=round(p_bear, 6)),
        _verdict("J2.chop", "J2", "noul", p=round(p_chop, 6)),
    ]


# ---- J3 --------------------------------------------------------------------

def j3_regime_quality(candidates: list[Candidate]) -> list[dict[str, Any]]:
    m = _masses(candidates)
    total = m["total"]
    if total <= 0.0:
        regime = _verdict(
            "J3.regime", "J3", "choice", choice="unclear",
            distribution={"trend-up": 0.0, "trend-down": 0.0, "chop": 0.0, "unclear": 1.0},
            abstained=True, reason="no_directional_evidence",
        )
        quality = _verdict("J3.quality", "J3", "score", score=0, scale=f"0..{QUALITY_MAX}",
                           abstained=True, reason="no_directional_evidence")
        return [regime, quality]

    sufficiency = min(1.0, m["n_fresh_observed"] / 3.0)
    raw = {
        "trend-up": m["bull"] * sufficiency,
        "trend-down": m["bear"] * sufficiency,
        "chop": (m["neutral"] + min(m["bull"], m["bear"])) * sufficiency,
        "unclear": total * (1.0 - sufficiency),
    }
    denom = sum(raw.values()) or 1.0
    dist = {k: round(v / denom, 6) for k, v in raw.items()}
    choice = max(dist, key=lambda k: (dist[k], -REGIMES.index(k)))

    strength = abs(m["bull"] - m["bear"]) / total
    q_sufficiency = min(1.0, m["n_fresh_observed"] / 4.0)
    quality_val = round(QUALITY_MAX * strength * q_sufficiency)
    return [
        _verdict("J3.regime", "J3", "choice", choice=choice, distribution=dist),
        _verdict("J3.quality", "J3", "score", score=int(quality_val), scale=f"0..{QUALITY_MAX}"),
    ]


# ---- J4 (shadow guardrail) -------------------------------------------------

def j4_guardrail(candidates: list[Candidate]) -> tuple[list[dict[str, Any]], list[str]]:
    """One Noul per hazard (``separate-flags``). Returns (verdicts, notes).

    Advisory severity is the MAX hazard probability, never the mean
    (``max-not-average``). A present+observed hazard also emits a deterministic
    backstop note that fires regardless of any model (``deterministic-backstop``).
    All records of each hazard contribute: any present, any present+observed,
    and the maximum per-record probability, independent of record order.
    """
    verdicts: list[dict[str, Any]] = []
    notes: list[str] = []
    hazards: dict[str, list[Candidate]] = {}
    for cand in candidates:
        if cand.hazard is not None:
            hazards.setdefault(cand.hazard, []).append(cand)
    for hazard, records in hazards.items():
        present = any(c.present for c in records)
        observed = any(c.present and c.observed for c in records)
        p = max(
            clamp(0.6 + 0.25 * c.observed + 0.1 * c.fresh, 0.02, 0.97)
            if c.present else clamp(0.1 - 0.05 * c.observed, 0.02, 0.97)
            for c in records
        )
        verdicts.append(
            _verdict(f"J4.{hazard}", "J4", "noul", p=round(p, 6),
                     hazard=hazard, present=present, observed=observed, mode="shadow")
        )
        # deterministic-backstop: a hard, model-independent flag.
        if observed:
            notes.append(f"BACKSTOP: {hazard} present (deterministic, SHADOW advisory)")

    if verdicts:
        worst = max(verdicts, key=lambda v: v["p"])
        notes.append(
            f"J4 max-severity hazard: {worst['hazard']} p={worst['p']:.2f} "
            f"(SHADOW, advisory; capture-at gates still decide)"
        )
    return verdicts, notes


# ---- J5 --------------------------------------------------------------------

def j5_lesson_find(
    context_tokens: set[str], prompt: str, candidates: list[Candidate],
    weights: tuple[float, ...], top_k: int,
) -> dict[str, Any] | None:
    lessons = [c for c in candidates if c.kind == "lesson"]
    if not lessons:
        return None
    result = rerank(context_tokens, prompt, lessons, weights, top_k)
    return _verdict("J5.lessons", "J5", "rerank", **result)


def _normalized(value: str) -> str:
    return " ".join(value.split()).casefold()


def j5_citation_audit(candidates: list[Candidate]) -> tuple[list[dict[str, Any]], list[str]]:
    """Verify each cited number matches its source (``DIASENTINEL``-style audit)."""
    verdicts: list[dict[str, Any]] = []
    notes: list[str] = []
    for cand in candidates:
        if cand.kind != "citation" or cand.cited_value is None or cand.source_value is None:
            continue
        match = _normalized(cand.cited_value) == _normalized(cand.source_value)
        verdicts.append(
            _verdict(f"J5.cite.{cand.id}", "J5", "audit", match=match,
                     cited=cand.cited_value, source=cand.source_value)
        )
        if not match:
            notes.append(
                f"CITATION MISMATCH [{cand.id}]: cited '{cand.cited_value}' "
                f"!= source '{cand.source_value}'"
            )
    return verdicts, notes


# ---- J6 (opt-in Stable Short reversal denoiser) ------------------------------

def j6_short_trend_noise(
    candidates: list[Candidate], prior: dict | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Judge one Stable Short reversal with fixed, uncalibrated heuristics.

    TF convergence is agreeing qualified Mid/Long sources divided by two; missing
    timeframes provide no support. F4 deduplication prevents copied agreement.
    Excursion strength reaches 0.5 at the 6-point band and 1.0 at 10 points.
    Quality assigns six points to that strength and two to |signal_score|/20,
    capped at eight. Chop is 0/0.5/1 for zero/one/two-or-more prior flips.
    Default whipsaw = .50*(1-convergence) + .30*(1-quality/8) + .20*chop.
    Only an active held-out prior overrides it. Both paths clip to [.05,.95];
    advice uses inclusive .40/.60 thresholds. No order authority is produced.
    """
    event = next((candidate for candidate in candidates if candidate.kind == "signal_event"), None)
    if event is None:
        return [], ["J6: no signal_event; abstained"]

    timeframes = _independent_directional([
        candidate for candidate in candidates
        if candidate.kind == "short_trend" and candidate.timeframe in ("mid", "long")
    ])
    qualified = [candidate for candidate in timeframes if candidate.observed and candidate.fresh]
    agreeing = [candidate.source_ref for candidate in qualified if candidate.direction == event.direction]
    agreement = len(agreeing)
    convergence = agreement / 2.0
    excursion = event.excursion
    score = event.signal_score
    flips = event.flips_recent
    excursion_bucket = "lt6" if excursion < J6_EXCURSION_BAND else "6to10" if excursion < J6_STRONG_EXCURSION else "ge10"
    chop_bucket = "0" if flips == 0 else "1" if flips == 1 else "ge2"
    bucket = f"{excursion_bucket}|{agreement}|{chop_bucket}"
    excursion_strength = (
        0.5 * clamp(excursion / J6_EXCURSION_BAND)
        + 0.5 * clamp((excursion - J6_EXCURSION_BAND) / (J6_STRONG_EXCURSION - J6_EXCURSION_BAND))
    )
    quality = int(round(6 * excursion_strength + 2 * clamp(abs(score) / J6_SCORE_DISTANCE)))
    chop = {"0": 0.0, "1": 0.5, "ge2": 1.0}[chop_bucket]
    p_whipsaw = 0.50 * (1 - convergence) + 0.30 * (1 - quality / QUALITY_MAX) + 0.20 * chop
    source = "deterministic_blend"
    if isinstance(prior, dict) and prior.get("active") is True:
        buckets = prior.get("buckets")
        rate = buckets.get(bucket, prior.get("base_rate")) if isinstance(buckets, dict) else None
        if type(rate) in (int, float) and 0.0 <= rate <= 1.0:
            p_whipsaw = rate
            source = "heldout_prior"
    p_whipsaw = round(clamp(p_whipsaw, WHIPSAW_MIN, WHIPSAW_MAX), 6)
    advice = "endorse" if p_whipsaw <= J6_ENDORSE_MAX else "suppress" if p_whipsaw >= J6_SUPPRESS_MIN else "neutral"
    return [
        _verdict("J6.tf_convergence", "J6", "noul", p=convergence, agreeing_sources=agreeing),
        _verdict("J6.excursion", "J6", "score", score=quality, scale="0..8"),
        _verdict("J6.chop", "J6", "noul", p=chop, flips_recent=flips),
        _verdict("J6.whipsaw", "J6", "noul", p=p_whipsaw, bucket=bucket, source=source),
        _verdict("J6.advice", "J6", "choice", choice=advice, p_signal_real=round(1 - p_whipsaw, 6)),
    ], [f"J6: {advice}; uncalibrated {source}; bucket={bucket}"]
