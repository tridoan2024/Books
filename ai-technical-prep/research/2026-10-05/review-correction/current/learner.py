"""Finite parameter author / evaluator / publisher for the J1/J5 rerank weights.

Faithfully ported from custom_jev/learner.py, preserving its gate invariants:
split isolation (no source/request/group leak across train/final), consume-once
final cases, parent-unchanged atomic activation, promotion only on real held-out
improvement with no regression. Adapted to AT-Brain's single learnable family and
to require each candidate's ``source_as_of <= known_at`` on every curated case.
Both timestamps must be timezone-aware; availability is checked temporally. No generated
code is executed; weights are clipped to [-16, 16].
"""
from __future__ import annotations

import json
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

from .common import clamp, digest, wire
from .engine import VERSION, check_weights, propose, validate
from .questions import rerank, WHIPSAW_BUCKETS, WHIPSAW_MIN, WHIPSAW_MAX
from .evidence import normalize_all, DEFAULT_MAX_CANDIDATES

MIN_TRAIN = 8
MIN_FINAL = 8
FAMILY = "evidence_relevance"
WHIPSAW_MIN_SUPPORT = 5
WHIPSAW_MAX_CASES = 100_000


def source_current(path: str, sha: str) -> bool:
    try:
        p = Path(path)
        return (
            not p.is_symlink()
            and p.is_file()
            and p.stat().st_size <= 1024 * 1024
            and digest_bytes(p.read_bytes()) == sha
        )
    except OSError:
        return False


def digest_bytes(data: bytes) -> str:
    import hashlib

    return hashlib.sha256(data).hexdigest()


def _valid_known_at(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        return datetime.fromisoformat(value).utcoffset() is not None
    except ValueError:
        return False


def fit_whipsaw_prior(cases: list[dict[str, Any]]) -> dict[str, Any]:
    """Fit causal bucket rates; activate only on lower chronological held-out Brier.

    Features contain only the pre-event bucket. ``whipsaw`` is the separately
    supplied future outcome label, never a feature. Every source_as_of must be
    timezone-aware and <= known_at. Split by New York session date: floor(60% of
    distinct days) for training, all later days held out, regardless of row order.
    Buckets with fewer than five training cases use the training base rate;
    unseen buckets do likewise at inference. Rates clip to [.05,.95]. Empty or
    insufficient day splits return inactive, with unavailable Brier scores None.
    This fits advisory priors only; it does not publish or authorize an action.
    """
    if not isinstance(cases, list) or len(cases) > WHIPSAW_MAX_CASES:
        raise ValueError("bounded whipsaw case list required")
    rows = []
    session_tz = ZoneInfo("America/New_York")
    for case in cases:
        if not isinstance(case, dict) or set(case) != {"known_at", "source_as_of", "features", "whipsaw"}:
            raise ValueError("whipsaw case contract")
        for field in ("known_at", "source_as_of"):
            if not _valid_known_at(case[field]):
                raise ValueError(f"{field} must be timezone-aware ISO-8601")
        known_at = datetime.fromisoformat(case["known_at"])
        if datetime.fromisoformat(case["source_as_of"]) > known_at:
            raise ValueError("source_as_of must be <= known_at")
        features = case["features"]
        if not isinstance(features, dict) or set(features) != {"bucket"}:
            raise ValueError("whipsaw features must contain only bucket")
        bucket = features["bucket"]
        if not isinstance(bucket, str) or bucket not in WHIPSAW_BUCKETS:
            raise ValueError("invalid whipsaw bucket")
        if type(case["whipsaw"]) is not bool:
            raise ValueError("whipsaw label must be boolean")
        rows.append((known_at, known_at.astimezone(session_tz).date(), bucket, case["whipsaw"]))
    rows.sort(key=lambda row: (row[0], row[2], row[3]))
    days = sorted({row[1] for row in rows})
    train_days = set(days[:int(len(days) * 0.6)])
    train = [row for row in rows if row[1] in train_days]
    heldout = [row for row in rows if row[1] not in train_days]
    base_rate = clamp(sum(row[3] for row in train) / len(train), WHIPSAW_MIN, WHIPSAW_MAX) if train else 0.5
    counts: dict[str, tuple[int, int]] = {}
    for _, _, bucket, label in train:
        total, whipsaws = counts.get(bucket, (0, 0))
        counts[bucket] = (total + 1, whipsaws + label)
    buckets = {
        bucket: clamp(whipsaws / total, WHIPSAW_MIN, WHIPSAW_MAX)
        if total >= WHIPSAW_MIN_SUPPORT else base_rate
        for bucket, (total, whipsaws) in sorted(counts.items())
    }
    heldout_brier = baseline_brier = None
    if train and heldout:
        heldout_brier = sum((buckets.get(bucket, base_rate) - label) ** 2 for _, _, bucket, label in heldout) / len(heldout)
        baseline_brier = sum((base_rate - label) ** 2 for _, _, _, label in heldout) / len(heldout)
    return {
        "buckets": buckets, "base_rate": base_rate,
        "n_train": len(train), "n_heldout": len(heldout),
        "heldout_brier": heldout_brier, "baseline_brier": baseline_brier,
        "active": heldout_brier is not None and heldout_brier < baseline_brier,
    }


def _rank_top(request: dict[str, Any], weights: tuple[float, ...]) -> str | None:
    context, candidates, _families, top_k = validate(request)
    from .engine import _context_tokens

    tokens, prompt = _context_tokens(context)
    return rerank(tokens, prompt, candidates, weights, top_k)["order"][0]


def measure(cases: list[dict[str, Any]], weights: tuple[float, ...]) -> dict[str, Any]:
    rows = []
    for case in cases:
        top = _rank_top(case["request"], weights)
        rows.append({"case_id": digest(case), "expected_id": case["expected_id"],
                     "actual_id": top, "correct": top == case["expected_id"]})
    correct = sum(r["correct"] for r in rows)
    return {"correct": correct, "total": len(rows), "accuracy": correct / max(1, len(rows)), "cases": rows}


def import_cases(store: Any, document: dict[str, Any]) -> dict[str, Any]:
    with store.db:
        store.db.execute("BEGIN IMMEDIATE")
        return _import_cases(store, document)


def _import_cases(store: Any, document: dict[str, Any]) -> dict[str, Any]:
    """Operator-only ingestion. Hash verification establishes source identity, not
    label correctness; labels must be independently curated. Every case must carry a
    timezone-aware ``known_at`` and each candidate must carry a timezone-aware
    ``source_as_of <= known_at`` (temporal lookahead firewall)."""
    if set(document) != {"authority", "cases"} or document["authority"] != "independently_curated_source_outcomes":
        raise ValueError("independent label authority required")
    cases = document["cases"]
    if not isinstance(cases, list) or not 1 <= len(cases) <= 512:
        raise ValueError("bounded corpus required")

    identities: dict[tuple[str, str], str] = {}
    labels: dict[str, Any] = {}

    def isolate(case: dict[str, Any]) -> bool:
        split = case["split"]
        req = case["request"]
        sig = digest({"question": req.get("decision_context", {}).get("prompt", ""),
                      "candidates": [{k: v for k, v in c.items() if k != "source_ref"}
                                     for c in req["candidates"]]})
        keys = [("group", case["group"]), ("request", sig), ("source", case["source_sha256"])]
        keys += [("candidate_source", c["source_ref"]) for c in req["candidates"]]
        for key in keys:
            if key in identities and identities[key] != split:
                raise ValueError("related cases cross train/final")
            identities[key] = split
        if sig in labels:
            if labels[sig] != case["expected_id"]:
                raise ValueError("conflicting duplicate labels")
            return False
        labels[sig] = case["expected_id"]
        return True

    for (body,) in store.db.execute("SELECT body FROM cases"):
        isolate(json.loads(body))

    pending = []
    for case in cases:
        if set(case) != {"request", "expected_id", "group", "split", "source_path", "source_sha256", "known_at"}:
            raise ValueError("case contract (must include known_at)")
        candidates = normalize_all(case["request"].get("candidates"),
                                   case["request"].get("max_candidates", DEFAULT_MAX_CANDIDATES))
        validate(case["request"])
        if case["split"] not in ("train", "final"):
            raise ValueError("split")
        if not isinstance(case["group"], str) or not 1 <= len(case["group"]) <= 128:
            raise ValueError("group")
        if not _valid_known_at(case["known_at"]):
            raise ValueError("known_at must be timezone-aware ISO-8601 (temporal lookahead firewall)")
        known_at = datetime.fromisoformat(case["known_at"])
        for candidate in candidates:
            if candidate.source_as_of is None:
                raise ValueError(f"candidate {candidate.id}: source_as_of required (temporal lookahead firewall)")
            if datetime.fromisoformat(candidate.source_as_of) > known_at:
                raise ValueError(f"candidate {candidate.id}: source_as_of must be <= known_at")
        if case["expected_id"] is not None and case["expected_id"] not in [c.id for c in candidates]:
            raise ValueError("unknown label")
        if not source_current(case["source_path"], case["source_sha256"]):
            raise ValueError("source changed or unavailable")
        if not isolate(case):
            continue
        stored = {**case, "label_authority": document["authority"]}
        ident = digest(stored)
        pending.append((ident, FAMILY, case["split"], case["group"], wire(stored),
                        case["source_path"], case["source_sha256"], case["known_at"], None))

    with store.db:
        store.db.executemany("INSERT OR IGNORE INTO cases VALUES(?,?,?,?,?,?,?,?,?)", pending)
    return {"ingested": len(pending), "authority": document["authority"],
            "firewall": "timezone-aware source_as_of <= known_at verified for every candidate"}


def learn(store: Any, run_id: str | None = None, cancelled: Callable[[], bool] = lambda: False) -> dict[str, Any]:
    """One bounded learning pass over curated cases. No-change without >=8 fresh
    training cases; activation requires >=8 fresh held-out finals with real gain and
    no regression, under an unchanged parent."""
    run_id = run_id or uuid.uuid4().hex
    if not isinstance(run_id, str) or not 1 <= len(run_id) <= 128:
        raise ValueError("run ID")
    old = store.db.execute("SELECT body FROM runs WHERE id=?", (run_id,)).fetchone()
    if old:
        return json.loads(old[0])

    before, generation, model = store.active(FAMILY)
    start = time.monotonic()
    report: dict[str, Any] = {"run_id": run_id, "family": FAMILY, "before": before,
                              "after": before, "verified_improvement": False}

    def finish(state: str, reason: str | None = None) -> dict[str, Any]:
        report.update(state=state, reason=reason, elapsed_ms=round((time.monotonic() - start) * 1000, 3))
        with store.db:
            store.db.execute("INSERT OR IGNORE INTO runs VALUES(?,?,?,?)",
                             (run_id, FAMILY, wire(report), time.time()))
        return json.loads(store.db.execute("SELECT body FROM runs WHERE id=?", (run_id,)).fetchone()[0])

    rows = store.db.execute(
        "SELECT id,split,body,source_path,source_hash FROM cases WHERE family=? AND consumed IS NULL ORDER BY id LIMIT 256",
        (FAMILY,),
    ).fetchall()
    fresh = [r for r in rows if source_current(r[3], r[4])]
    train = [json.loads(r[2]) for r in fresh if r[1] == "train"]
    final = [json.loads(r[2]) for r in fresh if r[1] == "final"]
    report.update(training_cases=len(train), final_cases=len(final), stale_cases=len(rows) - len(fresh))

    if len(train) < MIN_TRAIN:
        return finish("no_change", "need_at_least_eight_fresh_training_cases")

    weights = tuple(propose(train, tuple(model["weights"])))
    check_weights(weights)
    candidate = {"implementation": VERSION, "weights": list(weights)}
    candidate_id = digest(candidate)
    report["candidate"] = candidate_id
    if candidate_id == before:
        return finish("no_change", "training_proposed_no_parameter_change")

    if len(final) < MIN_FINAL:
        with store.db:
            store.db.execute("INSERT OR IGNORE INTO models VALUES(?,?,?)",
                             (candidate_id, wire(candidate), time.time()))
        return finish("trained_shadow", "needs_eight_fresh_independent_final_cases_to_activate")

    class Reject(Exception):
        pass

    try:
        with store.db:
            store.db.execute("BEGIN IMMEDIATE")
            if store.db.execute("SELECT revision,generation FROM pointer WHERE family=?", (FAMILY,)).fetchone() != (before, generation):
                raise Reject("parent_changed")
            for ident, split, *_ in fresh:
                if split == "final" and store.db.execute(
                    "UPDATE cases SET consumed=? WHERE id=? AND consumed IS NULL", (run_id, ident)
                ).rowcount != 1:
                    raise Reject("final_case_already_consumed")

        baseline = measure(final, tuple(model["weights"]))
        comparison = measure(final, weights)
        regressions = [a["case_id"] for a, b in zip(baseline["cases"], comparison["cases"])
                       if a["correct"] and not b["correct"]]
        report.update(baseline=baseline, candidate_evaluation=comparison,
                      regressions=regressions, quality_gain=comparison["accuracy"] - baseline["accuracy"])
        if regressions or comparison["correct"] <= baseline["correct"]:
            raise Reject("regression_or_no_heldout_gain")
        if any(not source_current(r[3], r[4]) for r in fresh):
            raise Reject("source_changed_during_evaluation")

        if cancelled():
            raise Reject("cancelled")
        with store.db:
            store.db.execute("BEGIN IMMEDIATE")
            if store.db.execute("SELECT revision,generation FROM pointer WHERE family=?", (FAMILY,)).fetchone() != (before, generation):
                raise Reject("parent_changed_before_activation")
            store.db.execute("INSERT OR IGNORE INTO models VALUES(?,?,?)", (candidate_id, wire(candidate), time.time()))
            store.db.execute("UPDATE pointer SET revision=?,generation=generation+1 WHERE family=?", (candidate_id, FAMILY))
            store.db.execute("INSERT OR IGNORE INTO edges VALUES(?,?,?)", (candidate_id, before, "improves_revision"))
        report.update(after=candidate_id, verified_improvement=True,
                      improvement_scope="held-out curated cases only")
        return finish("activated", None)
    except Reject as exc:
        return finish("rejected", str(exc))
