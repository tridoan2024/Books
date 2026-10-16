"""Request validation and batched J1-J5 judgments with explicit opt-in J6.

Pure computation: no network, no files, no clock beyond elapsed timing. A malformed
request raises ``ValueError`` (the service turns that into a fail-open abstain). Every
result carries ``action_authorized=False`` and bounded provenance.
"""
from __future__ import annotations

import math
import time
from typing import Any

from .common import digest, words
from .evidence import (
    DEFAULT_MAX_CANDIDATES,
    MAX_CANDIDATES_HARD,
    MAX_REQUEST_BYTES,
    Candidate,
    EvidenceError,
    normalize_all,
)
from . import questions as Q
from .common import wire

VERSION = "at-brain-linear-v1"
DEFAULT_FAMILIES: tuple[str, ...] = ("J1", "J2", "J3", "J4", "J5")
FAMILIES: tuple[str, ...] = (*DEFAULT_FAMILIES, "J6")
_FAMILY_SET = frozenset(FAMILIES)

_REQUEST_KEYS = {
    "turn_id", "decision_context", "candidates", "families",
    "max_candidates", "backend", "budget_id", "reference_cap",
}
_CONTEXT_KEYS = {"mode", "holding", "session_band", "source_cutoff", "prompt", "top_k"}
_MODES = {"intraday_short", "mid_long_mdte"}


def check_weights(weights: Any) -> tuple[float, ...]:
    """Bounded, finite numeric model — same discipline as custom_jev."""
    if (
        not isinstance(weights, (list, tuple))
        or len(weights) != len(Q.FEATURE_NAMES)
        or any(type(x) not in (int, float) or not math.isfinite(x) or abs(x) > 16 for x in weights)
    ):
        raise ValueError("bounded numeric model required")
    return tuple(float(x) for x in weights)


def validate(request: dict[str, Any]) -> tuple[dict[str, Any], list[Candidate], tuple[str, ...], int]:
    """Validate request shape and bounds. Returns (context, candidates, families, top_k)."""
    if not isinstance(request, dict):
        raise ValueError("request must be an object")
    extra = set(request) - _REQUEST_KEYS
    if extra:
        raise ValueError(f"unknown request keys: {sorted(extra)}")
    if len(wire(request).encode("utf-8")) > MAX_REQUEST_BYTES:
        raise ValueError("request too large; not truncated")

    context = request.get("decision_context", {})
    if not isinstance(context, dict) or (set(context) - _CONTEXT_KEYS):
        raise ValueError("decision_context shape")
    if "mode" in context and context["mode"] not in _MODES:
        raise ValueError(f"unknown mode: {context['mode']}")
    if "holding" in context and not isinstance(context["holding"], bool):
        raise ValueError("decision_context.holding must be boolean")
    for key in ("session_band", "source_cutoff", "prompt"):
        if key in context and not isinstance(context[key], str):
            raise ValueError(f"decision_context.{key} must be a string")
    top_k = context.get("top_k", 4)
    if type(top_k) is not int or not 1 <= top_k <= MAX_CANDIDATES_HARD:
        raise ValueError("decision_context.top_k out of range")

    max_candidates = request.get("max_candidates", DEFAULT_MAX_CANDIDATES)
    if type(max_candidates) is not int or not 1 <= max_candidates <= MAX_CANDIDATES_HARD:
        raise ValueError("max_candidates out of range")

    families = request.get("families", DEFAULT_FAMILIES)
    if not isinstance(families, (list, tuple)) or not families:
        raise ValueError("families must be a non-empty list")
    families = tuple(families)
    if any(f not in _FAMILY_SET for f in families) or len(set(families)) != len(families):
        raise ValueError("families must be a unique subset of J1..J6")

    backend = request.get("backend", "custom")
    if backend not in ("custom", "typesafe"):
        raise ValueError("backend must be custom or typesafe")

    candidates = normalize_all(request.get("candidates"), max_candidates)
    return context, candidates, families, top_k


def _context_tokens(context: dict[str, Any]) -> tuple[set[str], str]:
    prompt = context.get("prompt", "")
    parts = [prompt, context.get("mode", ""), context.get("session_band", "")]
    return words(" ".join(p for p in parts if p)), prompt


def judge(
    request: dict[str, Any],
    weights: tuple[float, ...] = Q.DEFAULT_WEIGHTS,
    revision: str | None = None,
    whipsaw_prior: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the applicable families in one batched pass. Deterministic, uncalibrated."""
    start = time.perf_counter()
    context, candidates, families, top_k = validate(request)
    weights = check_weights(weights)
    tokens, prompt = _context_tokens(context)

    verdicts: list[dict[str, Any]] = []
    notes: list[str] = []

    if "J1" in families:
        verdicts.append(Q.j1_evidence_rerank(tokens, prompt, candidates, weights, top_k))
    if "J2" in families:
        verdicts.extend(Q.j2_convergence(candidates))
    if "J3" in families:
        verdicts.extend(Q.j3_regime_quality(candidates))
    if "J4" in families:
        g_verdicts, g_notes = Q.j4_guardrail(candidates)
        verdicts.extend(g_verdicts)
        notes.extend(g_notes)
    if "J5" in families:
        lessons = Q.j5_lesson_find(tokens, prompt, candidates, weights, top_k)
        if lessons is not None:
            verdicts.append(lessons)
        c_verdicts, c_notes = Q.j5_citation_audit(candidates)
        verdicts.extend(c_verdicts)
        notes.extend(c_notes)

    if "J6" in families:
        noise_verdicts, noise_notes = Q.j6_short_trend_noise(candidates, whipsaw_prior)
        verdicts.extend(noise_verdicts)
        notes.extend(noise_notes)

    model = {"implementation": VERSION, "weights": list(weights)}
    revision = revision or digest(model)
    non_abstained = [v for v in verdicts if not v.get("abstained")]
    return {
        "schema_version": 1,
        "backend": "custom",
        "model": VERSION,
        "revision": revision,
        "request_sha256": digest(request),
        "turn_id": request.get("turn_id"),
        "status": "advisory" if non_abstained else "abstained",
        "action_authorized": False,          # ALWAYS false
        "semantics": "uncalibrated_local_deterministic_judgments",
        "verdicts": verdicts,
        "notes": notes,
        "provider_calls": 0,
        "usage": {"input_tokens": 0, "output_tokens": 0, "priced_cost": 0.0},
        "provenance": {
            "candidate_hashes": {c.id: c.source_sha256 for c in candidates},
            "families": list(families),
            "reference_calls": 0,
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
        },
    }


def propose(training: list[dict[str, Any]], initial: tuple[float, ...]) -> list[float]:
    """Bounded perceptron-style update of the rerank weights from labeled J1 cases.

    A training case is ``{"request": <judge request>, "expected_id": <candidate id>}``:
    the candidate that *should* rank first for J1. Mirrors custom_jev.propose — no
    generated code, clipped weights, deterministic.
    """
    weights = list(check_weights(initial))
    for _ in range(16):
        for case in training:
            target = case.get("expected_id")
            if target is None:
                continue
            context, candidates, _families, top_k = validate(case["request"])
            tokens, prompt = _context_tokens(context)
            result = Q.rerank(tokens, prompt, candidates, tuple(weights), top_k)
            chosen = result["order"][0]
            if chosen == target:
                continue
            by_id = {c.id: c for c in candidates}
            if target not in by_id:
                continue
            good = Q.feature_vector(tokens, prompt, by_id[target])
            bad = Q.feature_vector(tokens, prompt, by_id[chosen])
            for k in range(len(weights)):
                weights[k] = max(-16.0, min(16.0, weights[k] + 0.25 * (good[k] - bad[k])))
    return list(check_weights(weights))
