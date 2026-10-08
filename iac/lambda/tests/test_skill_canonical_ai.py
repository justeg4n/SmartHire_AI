import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("ENABLE_SKILL_CANONICAL_AI", "false")

ROOT = Path(__file__).resolve().parents[3]
SUGGESTION_ENGINE_DIR = ROOT / "iac" / "lambda" / "job_suggestion_engine"
RANKING_ENGINE_DIR = ROOT / "iac" / "lambda" / "candidate_ranking_engine"
sys.path.append(str(SUGGESTION_ENGINE_DIR))
sys.path.append(str(RANKING_ENGINE_DIR))

import cr_scoring  # noqa: E402
import js_skill_canonical_ai as canon  # noqa: E402


class SkillCanonicalAiTests(unittest.TestCase):
    def test_deterministic_vendor_fold_dedupes_aws(self):
        raw = ["AWS (S3, EC2, Lambda)", "AWS EC2", "AWS CloudWatch", "Python"]
        out = canon.deterministic_normalize_list(raw, max_items=20)
        self.assertEqual(out, ["AWS", "Python"])

    def test_deterministic_yolov8_maps_to_yolo_key(self):
        self.assertEqual(canon.deterministic_canonical_key("YOLOv8"), "yolo")
        self.assertEqual(canon.deterministic_canonical_key("YOLO"), "yolo")

    def test_ranking_gap_matches_yolo_variant(self):
        gap = cr_scoring.compute_skill_gap_for_ranking(["YOLO"], ["YOLOv8", "Python"])
        self.assertIn("YOLO", gap["matchedSkills"])
        self.assertEqual(gap["missingSkills"], [])

    def test_faster_rcnn_casing_variants_share_key(self):
        self.assertEqual(
            canon.deterministic_canonical_key("Faster RCNN"),
            canon.deterministic_canonical_key("Faster R-CNN"),
        )


if __name__ == "__main__":
    unittest.main()
