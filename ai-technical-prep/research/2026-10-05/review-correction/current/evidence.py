"""Capture-at evidence vocabulary, candidate validation, and deterministic features.

Evidence reaching AT-Brain is normalized into bounded, typed ``Candidate`` records
that mirror the fields capture-at already parses from its source of truth, the v9
live page at 127.0.0.1:8887. AT-Brain never fetches or re-derives a view of its own;
callers pass in candidates with provenance (source_ref + source_sha256).

The deterministic engine reads only the *typed metadata* of a candidate, never the
free text as an instruction (``untrusted-reason-isolated``): text is data used for
lexical relevance scoring and provenance hashing only.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .common import sha256_text, words

# ---- Typed vocabulary ------------------------------------------------------

# What a piece of evidence is. These mirror the heterogeneous fields capture-at
# parses each cycle from the v9 page and its own state.
KINDS: frozenset[str] = frozenset(
    {
        "short_color",    # intraday Short direction-color (and transitions)
        "short_trend",    # one bounded Trend Meter series per timeframe
        "signal_event",   # Stable Short confirmed-color reversal
        "mid_long",       # Mid-Long / MDTE lean
        "vwap",           # VWAP posture
        "level",          # nearest published level (support/resistance)
        "price",          # Capture price
        "mlma",           # MLMA
        "option_packet",  # bounded exact-expiry option packet
        "ownership",      # V2 owners / pending orders / watch binding
        "authority",      # authority / budget presence
        "session_band",   # session-band membership
        "lesson",         # saved win/loss/unfilled/counterexample
        "citation",       # a cited number to audit against source
    }
)

DIRECTIONS: frozenset[str] = frozenset({"bullish", "bearish", "neutral", "unknown"})

# Hazards a J4 guardrail candidate may represent. One Noul per hazard
# (``separate-flags``); never a blended severity.
HAZARDS: frozenset[str] = frozenset(
    {
        "duplicate_manager",   # duplicates an already-owning manager
        "outside_band",        # entry outside the authorized session band
        "replay_consumed",     # replaying an already-consumed signal
        "authority_absent",    # authority / budget missing
        "shorting_into_floor", # shorting into a known King support floor
    }
)

# Kinds that carry directional convergence weight for J2/J3, with their base
# weight. Documented, bounded constants — not learned in v1.
DIRECTIONAL_WEIGHTS: dict[str, float] = {
    "short_color": 1.0,
    "short_trend": 1.0,
    "signal_event": 1.0,
    "mid_long": 0.8,
    "vwap": 0.7,
    "mlma": 0.6,
    "level": 0.5,
    "price": 0.4,
}

MAX_CANDIDATES_HARD = 32          # absolute ceiling
DEFAULT_MAX_CANDIDATES = 8        # default bound surfaced to callers
MAX_TEXT_CHARS = 1600            # per-candidate excerpt cap (mirrors brain.rs)
MAX_ID_CHARS = 128
MAX_REQUEST_BYTES = 32768
MAX_TREND_POINTS = 60
MAX_SIGNAL_PATH = 8
TREND_TIMEFRAMES = frozenset({"short", "mid", "long"})
SIGNAL_COLORS = frozenset({"green", "red", "yellow", "gray"})


class EvidenceError(ValueError):
    """Raised when a candidate violates the typed contract or a bound."""


@dataclass(frozen=True)
class Candidate:
    """A single, provenance-bearing piece of capture-at evidence."""

    id: str
    text: str
    source_ref: str
    kind: str
    direction: str = "unknown"
    observed: bool = False
    fresh: bool = False
    in_scope: bool = True
    age_seconds: int | None = None
    proximity_ticks: int | None = None
    hazard: str | None = None          # set only for J4 guardrail candidates
    present: bool = False              # whether that hazard condition holds
    cited_value: str | None = None     # for J5 citation audit
    source_value: str | None = None    # authoritative value to match against
    source_sha256: str = ""            # provenance hash of ``text``
    source_as_of: str | None = None    # timezone-aware ISO time evidence became available
    tokens: frozenset[str] = field(default_factory=frozenset, repr=False)
    timeframe: str | None = None
    series: tuple[float | None, ...] = ()
    signal_score: float | None = None
    excursion: float | None = None
    path: tuple[str, ...] = ()
    flips_recent: int | None = None

    @property
    def lean(self) -> int:
        """+1 bullish, -1 bearish, 0 otherwise."""
        return {"bullish": 1, "bearish": -1}.get(self.direction, 0)

    @property
    def directional_weight(self) -> float:
        """Base convergence weight for this kind, 0 if non-directional."""
        return DIRECTIONAL_WEIGHTS.get(self.kind, 0.0)

    def freshness_factor(self) -> float:
        """Multiplier in [0.5, 1.0] from observed/fresh flags."""
        return (1.0 if self.observed else 0.5) * (1.0 if self.fresh else 0.75)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise EvidenceError(message)


def _finite_number(value: Any) -> bool:
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def normalize(raw: dict[str, Any]) -> Candidate:
    """Validate one raw candidate dict and return a bounded ``Candidate``.

    Unknown keys, bad types, or out-of-range values raise ``EvidenceError`` so the
    engine can abstain rather than silently coerce. Nothing here truncates text;
    oversized excerpts are rejected (never quietly shortened).
    """
    allowed = {
        "id", "text", "source_ref", "kind", "direction", "observed", "fresh",
        "in_scope", "age_seconds", "proximity_ticks", "hazard", "present",
        "cited_value", "source_value", "source_sha256", "source_as_of",
        "timeframe", "series", "signal_score", "excursion", "path", "flips_recent",
    }
    _require(isinstance(raw, dict), "candidate must be an object")
    _require(all(isinstance(key, str) for key in raw), "candidate keys must be strings")
    extra = set(raw) - allowed
    _require(not extra, f"unknown candidate keys: {sorted(extra)}")

    for key in ("id", "text", "source_ref", "kind"):
        value = raw.get(key)
        _require(isinstance(value, str) and value.strip() != "", f"candidate.{key} required")

    cid = raw["id"]
    _require(len(cid) <= MAX_ID_CHARS and cid != "__none__", "candidate.id invalid")
    text = raw["text"]
    _require(len(text) <= MAX_TEXT_CHARS, "candidate.text exceeds excerpt cap; not truncated")

    kind = raw["kind"]
    _require(kind in KINDS, f"unknown kind: {kind}")
    direction = raw.get("direction", "unknown")
    _require(isinstance(direction, str), "candidate.direction must be a string")
    _require(direction in DIRECTIONS, f"unknown direction: {direction}")

    timeframe = raw.get("timeframe")
    series: tuple[float | None, ...] = ()
    signal_score = excursion = flips_recent = None
    path: tuple[str, ...] = ()
    if kind == "short_trend":
        _require(isinstance(timeframe, str), "candidate.timeframe must be a string")
        _require(timeframe in TREND_TIMEFRAMES, "candidate.timeframe must be short, mid or long")
        _require(raw["source_ref"] == f"trend_meter:{timeframe}",
                 "short_trend source_ref must be trend_meter:<timeframe>")
        values = raw.get("series")
        _require(isinstance(values, list) and 1 <= len(values) <= MAX_TREND_POINTS,
                 "candidate.series must contain 1..60 chronological values")
        _require(all(value is None or _finite_number(value) for value in values),
                 "candidate.series values must be finite numbers or null")
        series = tuple(None if value is None else float(value) for value in values)
        latest = series[-1]
        expected = ("unknown" if latest is None else "bullish" if latest > 0
                    else "bearish" if latest < 0 else "neutral")
        _require(direction == expected, "candidate.direction must match the latest series value")
    else:
        _require(not ({"timeframe", "series"} & raw.keys()),
                 "timeframe and series only valid on short_trend")
    if kind == "signal_event":
        _require(direction in ("bullish", "bearish"), "signal_event direction must be bullish or bearish")
        _require(raw["source_ref"].startswith("stable_short:") and raw["source_ref"][13:].strip() != "",
                 "signal_event source_ref must be stable_short:<event time>")
        signal_score = raw.get("signal_score")
        excursion = raw.get("excursion")
        _require(_finite_number(signal_score), "candidate.signal_score must be a finite number")
        _require(_finite_number(excursion) and excursion >= 0,
                 "candidate.excursion must be a finite non-negative number")
        signal_score, excursion = float(signal_score), float(excursion)
        colors = raw.get("path")
        _require(isinstance(colors, list) and len(colors) <= MAX_SIGNAL_PATH,
                 "candidate.path must be a list of at most 8 colors")
        _require(all(isinstance(color, str) for color in colors), "candidate.path colors must be strings")
        _require(all(color in SIGNAL_COLORS for color in colors), "candidate.path has an unknown color")
        path = tuple(colors)
        flips_recent = raw.get("flips_recent")
        _require(type(flips_recent) is int and flips_recent >= 0,
                 "candidate.flips_recent must be a non-negative integer")
    else:
        _require(not ({"signal_score", "excursion", "path", "flips_recent"} & raw.keys()),
                 "signal_score, excursion, path and flips_recent only valid on signal_event")

    for key in ("observed", "fresh", "in_scope", "present"):
        if key in raw:
            _require(isinstance(raw[key], bool), f"candidate.{key} must be boolean")

    for key in ("age_seconds", "proximity_ticks"):
        if raw.get(key) is not None:
            value = raw[key]
            _require(isinstance(value, int) and not isinstance(value, bool) and value >= 0,
                     f"candidate.{key} must be a non-negative integer")

    hazard = raw.get("hazard")
    if hazard is not None:
        _require(isinstance(hazard, str), "candidate.hazard must be a string")
        _require(hazard in HAZARDS, f"unknown hazard: {hazard}")
        _require(kind in ("ownership", "authority", "session_band", "level", "short_color"),
                 "hazard only valid on a guardrail-bearing kind")

    for key in ("cited_value", "source_value", "source_sha256", "source_as_of"):
        if raw.get(key) is not None:
            _require(isinstance(raw[key], str), f"candidate.{key} must be a string")

    source_as_of = raw.get("source_as_of")
    if source_as_of is not None:
        try:
            available = datetime.fromisoformat(source_as_of)
        except ValueError as exc:
            raise EvidenceError("candidate.source_as_of must be timezone-aware ISO-8601") from exc
        _require(available.utcoffset() is not None,
                 "candidate.source_as_of must be timezone-aware ISO-8601")

    source_sha256 = raw.get("source_sha256") or sha256_text(text)

    return Candidate(
        id=cid,
        text=text,
        source_ref=raw["source_ref"],
        kind=kind,
        direction=direction,
        observed=bool(raw.get("observed", False)),
        fresh=bool(raw.get("fresh", False)),
        in_scope=bool(raw.get("in_scope", True)),
        age_seconds=raw.get("age_seconds"),
        proximity_ticks=raw.get("proximity_ticks"),
        hazard=hazard,
        present=bool(raw.get("present", False)),
        cited_value=raw.get("cited_value"),
        source_value=raw.get("source_value"),
        source_sha256=source_sha256,
        source_as_of=source_as_of,
        tokens=frozenset(words(text)),
        timeframe=timeframe,
        series=series,
        signal_score=signal_score,
        excursion=excursion,
        path=path,
        flips_recent=flips_recent,
    )


def normalize_all(raw_candidates: list[dict[str, Any]], max_candidates: int) -> list[Candidate]:
    """Validate a candidate list, enforcing count bound and unique ids."""
    _require(isinstance(raw_candidates, list), "candidates must be a list")
    _require(1 <= max_candidates <= MAX_CANDIDATES_HARD, "max_candidates out of range")
    _require(1 <= len(raw_candidates) <= max_candidates,
             f"candidate count must be 1..{max_candidates}")
    out: list[Candidate] = []
    seen: set[str] = set()
    for raw in raw_candidates:
        cand = normalize(raw)
        _require(cand.id not in seen, f"duplicate candidate id: {cand.id}")
        seen.add(cand.id)
        out.append(cand)
    return out


def recency(age_seconds: int | None, half_life_s: float = 900.0) -> float:
    """Recency weight in (0, 1]: 1.0 when just observed, decaying by half every
    ``half_life_s`` (hippo-memory-style decay). Unknown age -> neutral 0.5."""
    if age_seconds is None:
        return 0.5
    return 0.5 ** (max(0, age_seconds) / half_life_s)
