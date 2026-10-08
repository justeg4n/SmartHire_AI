"""Offline benchmark utility for suggestion scoring changes.

Usage examples:
  python iac/lambda/tests/benchmark_scoring.py --use-sample
  python iac/lambda/tests/benchmark_scoring.py --json /tmp/scoring_pairs.json --k 5

Input JSON format (list of objects):
[
  {
    "id": "pair-1",
    "bi_score": 71.35,
    "cross_score": 0.26,
    "skill_composite_score": 0.0,
    "skill_coverage_must": 0.0,
    "required_skill_count": 0,
    "candidate_skill_count": 20,
    "label": 1
  }
]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

os.environ.setdefault("ENABLE_SKILL_CANONICAL_AI", "false")

ROOT = Path(__file__).resolve().parents[3]
SUGGESTION_ENGINE_DIR = ROOT / "iac" / "lambda" / "job_suggestion_engine"
sys.path.append(str(SUGGESTION_ENGINE_DIR))

import js_engine_core as suggestion_engine  # noqa: E402 # pyright: ignore[reportMissingImports]
from js_config import FINAL_SCORE_BETA, MUST_PENALTY_FACTOR, MUST_THRESHOLD_FRACTION  # noqa: E402 # pyright: ignore[reportMissingImports]


OLD_WEIGHT_BI = 0.35
OLD_WEIGHT_CROSS = 0.65


@dataclass
class Pair:
    pair_id: str
    bi_score: float
    cross_score: float | None
    skill_composite_score: float
    skill_coverage_must: float | None
    required_skill_count: int
    candidate_skill_count: int
    label: int = -1


def _clamp_score(value: float) -> float:
    return max(0.0, min(100.0, float(value)))


def _load_pairs_from_json(path: str) -> list[Pair]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    out: list[Pair] = []
    for idx, row in enumerate(raw):
        if not isinstance(row, dict):
            continue
        out.append(
            Pair(
                pair_id=str(row.get("id") or f"pair-{idx+1}"),
                bi_score=_clamp_score(row.get("bi_score", 0.0)),
                cross_score=None if row.get("cross_score") is None else _clamp_score(row.get("cross_score", 0.0)),
                skill_composite_score=_clamp_score(row.get("skill_composite_score", 0.0)),
                skill_coverage_must=row.get("skill_coverage_must"),
                required_skill_count=int(row.get("required_skill_count", 0) or 0),
                candidate_skill_count=int(row.get("candidate_skill_count", 0) or 0),
                label=int(row.get("label", -1)),
            )
        )
    return out


def _sample_pairs() -> list[Pair]:
    # Based on real logs shared by user (cv7 profile run).
    return [
        Pair(
            pair_id="cv7_vs_job_4b3a",
            bi_score=71.35,
            cross_score=0.26,
            skill_composite_score=0.0,
            skill_coverage_must=0.0,
            required_skill_count=0,
            candidate_skill_count=18,
            label=1,
        ),
        Pair(
            pair_id="cv7_vs_job_4a9e",
            bi_score=37.25,
            cross_score=0.08,
            skill_composite_score=0.0,
            skill_coverage_must=0.0,
            required_skill_count=0,
            candidate_skill_count=18,
            label=0,
        ),
        Pair(
            pair_id="negative_control_with_skills",
            bi_score=42.0,
            cross_score=18.0,
            skill_composite_score=10.0,
            skill_coverage_must=10.0,
            required_skill_count=8,
            candidate_skill_count=15,
            label=0,
        ),
    ]


def _old_hybrid_score(bi_score: float, cross_score: float | None) -> float:
    if cross_score is None:
        return round(_clamp_score(bi_score), 2)
    blended = OLD_WEIGHT_BI * (bi_score / 100.0) + OLD_WEIGHT_CROSS * (cross_score / 100.0)
    return round(_clamp_score(blended * 100.0), 2)


def _old_final_score(
    hybrid_semantic_score: float,
    skill_composite_score: float,
    skill_coverage_must: float | None,
    required_skill_count: int,
    candidate_skill_count: int,
) -> float:
    if required_skill_count <= 0 or candidate_skill_count <= 0:
        # Previous guard behavior: semantic-only, no attenuation.
        return round(_clamp_score(hybrid_semantic_score), 2)
    must_frac = max(0.0, min(1.0, float(skill_coverage_must or 0.0) / 100.0))
    must_penalty_points = 100.0 * MUST_PENALTY_FACTOR * max(0.0, MUST_THRESHOLD_FRACTION - must_frac)
    final_v3 = (
        (1.0 - FINAL_SCORE_BETA) * float(hybrid_semantic_score or 0.0)
        + FINAL_SCORE_BETA * float(skill_composite_score or 0.0)
        - must_penalty_points
    )
    return round(_clamp_score(final_v3), 2)


def _precision_at_k(rows: list[tuple[float, int]], k: int) -> float | None:
    labeled = [(s, l) for s, l in rows if l in (0, 1)]
    if not labeled:
        return None
    top = sorted(labeled, key=lambda item: item[0], reverse=True)[: max(1, k)]
    positives = sum(1 for _, label in top if label == 1)
    return positives / len(top)


def _print_results(pairs: list[Pair], k: int) -> None:
    print("id | label | old_hybrid | new_hybrid | old_final | new_final | guard")
    print("-" * 96)
    old_for_p_at_k: list[tuple[float, int]] = []
    new_for_p_at_k: list[tuple[float, int]] = []

    for pair in pairs:
        old_hybrid = _old_hybrid_score(pair.bi_score, pair.cross_score)
        new_hybrid = suggestion_engine.compute_hybrid_score(pair.bi_score, pair.cross_score)
        old_final = _old_final_score(
            old_hybrid,
            pair.skill_composite_score,
            pair.skill_coverage_must,
            pair.required_skill_count,
            pair.candidate_skill_count,
        )
        new_final, _, guard_reason = suggestion_engine.compute_final_score_v3(
            new_hybrid,
            pair.skill_composite_score,
            pair.skill_coverage_must,
            required_skill_count=pair.required_skill_count,
            candidate_skill_count=pair.candidate_skill_count,
        )
        old_for_p_at_k.append((old_final, pair.label))
        new_for_p_at_k.append((new_final, pair.label))
        print(
            f"{pair.pair_id} | {pair.label} | "
            f"{old_hybrid:.2f} | {new_hybrid:.2f} | "
            f"{old_final:.2f} | {new_final:.2f} | {guard_reason or 'none'}"
        )

    old_p = _precision_at_k(old_for_p_at_k, k)
    new_p = _precision_at_k(new_for_p_at_k, k)
    if old_p is not None and new_p is not None:
        print("\nSummary")
        print(f"precision@{k} old={old_p:.3f} new={new_p:.3f}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark old vs new scoring behavior.")
    parser.add_argument("--json", help="Path to JSON list of scoring pairs.")
    parser.add_argument("--use-sample", action="store_true", help="Run with built-in sample pairs.")
    parser.add_argument("--k", type=int, default=2, help="K for precision@k when labels are available.")
    args = parser.parse_args()

    pairs: list[Pair] = []
    if args.json:
        pairs.extend(_load_pairs_from_json(args.json))
    if args.use_sample or not pairs:
        pairs.extend(_sample_pairs())

    if not pairs:
        print("No scoring pairs provided.")
        return 1

    _print_results(pairs, max(1, args.k))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
