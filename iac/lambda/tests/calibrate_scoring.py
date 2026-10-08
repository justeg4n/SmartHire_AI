"""Offline helper to calibrate CV/JD scoring parameters from labeled data.

Input CSV columns:
- bi_score (0-100)
- cross_score (0-100)
- label (0/1 relevance)

Usage:
  python iac/lambda/tests/calibrate_scoring.py --csv data/labeled_pairs.csv
"""

from __future__ import annotations

import argparse
import csv
import math
from dataclasses import dataclass


@dataclass
class Row:
    bi: float
    cross: float
    label: int


def load_rows(path: str) -> list[Row]:
    rows: list[Row] = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for item in reader:
            try:
                bi = float(item.get("bi_score", 0.0))
                cross = float(item.get("cross_score", 0.0))
                label = int(float(item.get("label", 0)))
            except (TypeError, ValueError):
                continue
            rows.append(Row(bi=max(0.0, min(100.0, bi)), cross=max(0.0, min(100.0, cross)), label=1 if label > 0 else 0))
    return rows


def sigmoid(x: float) -> float:
    x = max(-50.0, min(50.0, x))
    return 1.0 / (1.0 + math.exp(-x))


def calibrated_cross(raw_cross: float, shift: float, scale: float) -> float:
    # Convert 0-100 pseudo score back to 0-1, then adjust using calibrated sigmoid.
    normalized = max(0.0, min(1.0, raw_cross / 100.0))
    # invert rough sigmoid center around 0.5 for stable search
    eps = 1e-6
    logit = math.log(max(eps, normalized) / max(eps, (1.0 - normalized)))
    return sigmoid((logit - shift) * scale) * 100.0


def score_row(row: Row, w_bi: float, w_cross: float, shift: float, scale: float) -> float:
    cross_adj = calibrated_cross(row.cross, shift, scale)
    return w_bi * row.bi + w_cross * cross_adj


def auc_like(rows: list[Row], w_bi: float, w_cross: float, shift: float, scale: float) -> float:
    scored = [(score_row(r, w_bi, w_cross, shift, scale), r.label) for r in rows]
    positives = [s for s, l in scored if l == 1]
    negatives = [s for s, l in scored if l == 0]
    if not positives or not negatives:
        return 0.0
    wins = 0.0
    total = 0.0
    for p in positives:
        for n in negatives:
            total += 1.0
            if p > n:
                wins += 1.0
            elif p == n:
                wins += 0.5
    return wins / total if total else 0.0


def grid_search(rows: list[Row]) -> tuple[float, float, float, float, float]:
    best = (0.35, 0.65, -1.0, 1.5, -1.0)
    for w_bi in [0.2, 0.25, 0.3, 0.35, 0.4, 0.5]:
        w_cross = 1.0 - w_bi
        for shift in [-1.5, -1.0, -0.5, 0.0]:
            for scale in [1.0, 1.25, 1.5, 1.75, 2.0]:
                auc = auc_like(rows, w_bi, w_cross, shift, scale)
                if auc > best[-1]:
                    best = (w_bi, w_cross, shift, scale, auc)
    return best


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="Path to labeled pair dataset CSV")
    args = parser.parse_args()
    rows = load_rows(args.csv)
    if len(rows) < 20:
        print("Need at least 20 labeled rows for a meaningful calibration run.")
        return 1
    w_bi, w_cross, shift, scale, auc = grid_search(rows)
    print("Recommended parameters")
    print(f"SUGGESTION_WEIGHT_BI={w_bi:.2f}")
    print(f"SUGGESTION_WEIGHT_CROSS={w_cross:.2f}")
    print(f"RANKING_WEIGHT_BI={w_bi:.2f}")
    print(f"RANKING_WEIGHT_CROSS={w_cross:.2f}")
    print(f"CE_SIGMOID_SHIFT={shift:.2f}")
    print(f"CE_SIGMOID_SCALE={scale:.2f}")
    print(f"Proxy_AUC={auc:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
