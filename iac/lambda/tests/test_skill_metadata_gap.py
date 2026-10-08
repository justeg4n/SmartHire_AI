import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

# Avoid Bedrock in unit tests; js_config reads this at import time.
os.environ.setdefault("ENABLE_SKILL_CANONICAL_AI", "false")

ROOT = Path(__file__).resolve().parents[3]
CV_PROCESSOR_DIR = ROOT / "iac" / "lambda" / "cv_jd_processor"
SUGGESTION_ENGINE_DIR = ROOT / "iac" / "lambda" / "job_suggestion_engine"
RANKING_ENGINE_DIR = ROOT / "iac" / "lambda" / "candidate_ranking_engine"

sys.path.append(str(CV_PROCESSOR_DIR))
sys.path.append(str(SUGGESTION_ENGINE_DIR))
sys.path.append(str(RANKING_ENGINE_DIR))

import cjp_engine_core as cv_processor  # noqa: E402
import js_engine_core as suggestion_engine  # noqa: E402
import js_skill_semantics as js_sem  # noqa: E402
import candidate_ranking_engine as ranking_engine  # noqa: E402
import cr_scoring as cr_scoring  # noqa: E402


class SkillMetadataTests(unittest.TestCase):
    def test_normalize_skill_list_dedupes_case_insensitive(self):
        raw = [" Python  ", "AWS", "python", "", "AWS  ", "React"]

        normalized = cv_processor.normalize_skill_list(raw)

        self.assertEqual(normalized, ["Python", "AWS", "React"])

    def test_extract_candidate_skills_from_parsed_data(self):
        parsed_data = {
            "frontend_skills": ["React", "TypeScript"],
            "backend_skills": ["Python", "FastAPI"],
            "devops_skills": ["AWS", "Docker"],
            "soft_skills": ["Communication"],
        }

        candidate_skills = cv_processor.extract_candidate_skills_from_parsed_data(parsed_data)

        self.assertEqual(
            candidate_skills,
            ["React", "TypeScript", "Python", "FastAPI", "AWS", "Docker", "Communication"],
        )

    def test_compute_skill_gap(self):
        gap = suggestion_engine.compute_skill_gap(
            required_skills=["Python", "AWS", "Docker"],
            candidate_skills=["python", "React", "AWS"],
        )

        self.assertEqual(gap["matchedSkills"], ["Python", "AWS"])
        self.assertEqual(gap["missingSkills"], ["Docker"])
        self.assertEqual(gap["skillGapScore"], 66.67)
        self.assertEqual(gap["skillCoverageMust"], 66.67)
        self.assertEqual(gap["skillCoverageNice"], 100.0)
        self.assertIsNone(gap["skillCoverageOneOf"])

    def test_compute_skill_gap_fuzzy_token_union(self):
        gap = suggestion_engine.compute_skill_gap(
            ["Azure API Management", "SQL"],
            ["Azure", "API Management", "PostgreSQL"],
        )
        self.assertIn("Azure API Management", gap["matchedSkills"])
        self.assertIn("SQL", gap["missingSkills"])

    def test_compute_skill_gap_semantic_match_with_haiku_mapper(self):
        with patch.object(
            suggestion_engine,
            "resolve_semantic_skill_matches_with_confidence",
            return_value={
                "infrastructure-as-code": {
                    "candidate": "Terraform",
                    "confidence": 0.95,
                    "tier": "full",
                }
            },
        ):
            gap = suggestion_engine.compute_skill_gap(
                ["Infrastructure-as-Code", "Python"],
                ["Terraform", "Go"],
            )
        self.assertEqual(gap["matchedSkills"], ["Infrastructure-as-Code"])
        self.assertEqual(gap["missingSkills"], ["Python"])

    def test_compute_skill_gap_semantic_aws_to_cloud(self):
        with patch.object(
            suggestion_engine,
            "resolve_semantic_skill_matches_with_confidence",
            return_value={
                "cloud platform": {"candidate": "AWS", "confidence": 0.92, "tier": "full"}
            },
        ):
            gap = suggestion_engine.compute_skill_gap(
                ["Cloud Platform", "Kubernetes"],
                ["AWS", "Docker"],
            )
        self.assertEqual(gap["matchedSkills"], ["Cloud Platform"])
        self.assertEqual(gap["missingSkills"], ["Kubernetes"])

    def test_compute_skill_gap_semantic_keeps_missing_when_no_mapping(self):
        with patch.object(
            suggestion_engine,
            "resolve_semantic_skill_matches_with_confidence",
            return_value={},
        ):
            gap = suggestion_engine.compute_skill_gap(
                ["Infrastructure-as-Code"],
                ["AWS"],
            )
        self.assertEqual(gap["matchedSkills"], [])
        self.assertEqual(gap["missingSkills"], ["Infrastructure-as-Code"])

    def test_compute_skill_gap_one_of_group_satisfied_only_on_full_match(self):
        with patch.object(
            suggestion_engine,
            "resolve_semantic_skill_matches_with_confidence",
            return_value={"react": {"candidate": "Stencil", "confidence": 0.88, "tier": "weak"}},
        ):
            gap_weak = suggestion_engine.compute_skill_gap(
                required_skills=[],
                candidate_skills=["Stencil"],
                required_groups={
                    "must_have": [],
                    "one_of": [{"label": "Frontend stack", "options": ["React", "Vue"]}],
                    "nice_to_have": [],
                },
            )
        self.assertEqual(gap_weak["matchedGroups"], [])
        self.assertEqual(gap_weak["missingGroups"], ["Frontend stack"])

        with patch.object(
            suggestion_engine,
            "resolve_semantic_skill_matches_with_confidence",
            return_value={"react": {"candidate": "Stencil", "confidence": 0.91, "tier": "full"}},
        ):
            gap_full = suggestion_engine.compute_skill_gap(
                required_skills=[],
                candidate_skills=["Stencil"],
                required_groups={
                    "must_have": [],
                    "one_of": [{"label": "Frontend stack", "options": ["React", "Vue"]}],
                    "nice_to_have": [],
                },
            )
        self.assertEqual(gap_full["matchedGroups"], ["Frontend stack"])
        self.assertEqual(gap_full["missingGroups"], [])

    def test_compute_skill_gap_redistributes_weights_when_no_one_of(self):
        with patch.object(
            suggestion_engine,
            "resolve_semantic_skill_matches_with_confidence",
            return_value={},
        ):
            gap = suggestion_engine.compute_skill_gap(
                required_skills=[],
                candidate_skills=["Python"],
                required_groups={"must_have": ["Python"], "one_of": [], "nice_to_have": []},
            )
        self.assertEqual(gap["skillCompositeScore"], 100.0)
        self.assertEqual(gap["skillSummary"]["weightsApplied"]["must"], 1.0)
        self.assertEqual(gap["skillSummary"]["weightsApplied"]["one_of"], 0.0)

    def test_flatten_profile_skills_includes_soft_and_top_level_skills(self):
        profile = {
            "backend_skills": ["Python"],
            "frontend_skills": [],
            "devops_skills": [],
            "soft_skills": ["Kubernetes"],
            "skills": ["Docker"],
        }
        flat = cr_scoring.flatten_profile_skills_for_gap(profile, ["AWS"])
        self.assertEqual(flat, ["Python", "Kubernetes", "Docker", "AWS"])

    def test_ranking_skill_gap_uses_soft_skills_bucket(self):
        """Regression: ranking used to only merge backend/frontend/devops for gap lists."""
        profile = {
            "backend_skills": [],
            "frontend_skills": [],
            "devops_skills": [],
            "soft_skills": ["Communication", "Python"],
        }
        all_skills = cr_scoring.flatten_profile_skills_for_gap(profile, None)
        gap = cr_scoring.compute_skill_gap_for_ranking(["Python", "Communication"], all_skills)
        self.assertEqual(gap["matchedSkills"], ["Python", "Communication"])
        self.assertEqual(gap["missingSkills"], [])

    def test_ranking_skill_gap_fuzzy_token_union(self):
        gap = cr_scoring.compute_skill_gap_for_ranking(
            ["Azure API Management"],
            ["Azure", "API Management", "Kubernetes"],
        )
        self.assertEqual(gap["matchedSkills"], ["Azure API Management"])
        self.assertEqual(gap["missingSkills"], [])

    def test_ranking_skill_gap_fuzzy_substring_odata(self):
        gap = cr_scoring.compute_skill_gap_for_ranking(
            ["OData"],
            ["Building OData integrations"],
        )
        self.assertEqual(gap["matchedSkills"], ["OData"])
        self.assertEqual(gap["missingSkills"], [])

    def test_ranking_skill_gap_canonical_yolo_family(self):
        gap = cr_scoring.compute_skill_gap_for_ranking(
            ["YOLO", "PyTorch"],
            ["YOLOv8", "torch", "Docker"],
        )
        self.assertIn("YOLO", gap["matchedSkills"])
        self.assertIn("PyTorch", gap["matchedSkills"])
        self.assertEqual(gap["missingSkills"], [])

    def test_ranking_skill_gap_semantic_match_with_haiku_mapper(self):
        with patch.object(
            cr_scoring,
            "resolve_semantic_skill_matches",
            return_value={"infrastructure-as-code": "Terraform"},
        ):
            gap = cr_scoring.compute_skill_gap_for_ranking(
                ["Infrastructure-as-Code"],
                ["Terraform", "Python"],
            )
        self.assertEqual(gap["matchedSkills"], ["Infrastructure-as-Code"])
        self.assertEqual(gap["missingSkills"], [])

    def test_ranking_skill_gap_semantic_aws_to_cloud(self):
        with patch.object(
            cr_scoring,
            "resolve_semantic_skill_matches",
            return_value={"cloud platform": "AWS"},
        ):
            gap = cr_scoring.compute_skill_gap_for_ranking(
                ["Cloud Platform"],
                ["AWS", "Terraform"],
            )
        self.assertEqual(gap["matchedSkills"], ["Cloud Platform"])
        self.assertEqual(gap["missingSkills"], [])

    def test_extract_candidate_skills_includes_project_stack(self):
        parsed_data = {
            "frontend_skills": [],
            "backend_skills": ["C#"],
            "devops_skills": [],
            "soft_skills": [],
            "skills": [],
            "projects": [{"name": "Integration", "stack": ["Azure Service Bus", "Logic Apps"]}],
        }
        skills = cv_processor.extract_candidate_skills_from_parsed_data(parsed_data)
        self.assertIn("Azure Service Bus", skills)
        self.assertIn("Logic Apps", skills)
        self.assertIn("C#", skills)

    def test_compute_final_score_v3_guard_attentuates_when_skill_data_missing(self):
        final_score, penalty, guard_reason = suggestion_engine.compute_final_score_v3(
            hybrid_semantic_score=40.0,
            skill_composite_score=0.0,
            skill_coverage_must=None,
            required_skill_count=0,
            candidate_skill_count=12,
        )
        self.assertEqual(final_score, 36.0)
        self.assertEqual(penalty, 0.0)
        self.assertEqual(guard_reason, "no_required_skills")

    def test_compute_final_score_v3_normal_path_keeps_penalty_formula(self):
        final_score, penalty, guard_reason = suggestion_engine.compute_final_score_v3(
            hybrid_semantic_score=40.0,
            skill_composite_score=20.0,
            skill_coverage_must=0.0,
            required_skill_count=6,
            candidate_skill_count=10,
        )
        # final = 0.8*40 + 0.2*20 - (100*0.2*(0.5-0.0)) = 26.0
        self.assertEqual(final_score, 26.0)
        self.assertEqual(penalty, 10.0)
        self.assertIsNone(guard_reason)

    def test_candidate_ranking_shortlist_uses_only_ce_pool(self):
        ann_matches = [
            {"candidateId": "cand-1", "biScore": 90.0, "yearsExperience": 5, "parsedProfile": {}},
            {"candidateId": "cand-2", "biScore": 89.0, "yearsExperience": 4, "parsedProfile": {}},
            {"candidateId": "cand-3", "biScore": 50.0, "yearsExperience": 3, "parsedProfile": {}},
        ]

        def _ce_stub(_jd_text, pool):
            return [{**row, "crossScore": 5.0, "crossDiagnostics": {"chunkCount": 1}} for row in pool]

        with (
            patch.object(ranking_engine, "FINAL_RANKING_COUNT", 1),
            patch.object(ranking_engine, "HARD_OUTPUT_LIMIT", 3),
            patch.object(ranking_engine, "resolve_job_identity", return_value=("owner-sub", "recruiter-1")),
            patch.object(ranking_engine, "_resolve_job_document_embedding", return_value=[0.1]),
            patch.object(ranking_engine, "upsert_job_embedding"),
            patch.object(ranking_engine, "build_jd_query_text", return_value="normalized jd"),
            patch.object(ranking_engine, "get_cohere_query_embedding", return_value=[0.2]),
            patch.object(ranking_engine, "search_matching_candidates", return_value=ann_matches),
            patch.object(ranking_engine, "fetch_candidate_profile_from_dynamodb", return_value={}),
            patch.object(ranking_engine, "cross_encode_jd_vs_candidates", side_effect=_ce_stub),
            patch.object(ranking_engine, "compute_hybrid_score", side_effect=lambda bi, cross: cross if cross is not None else bi),
            patch.object(ranking_engine, "_resolve_score_threshold", return_value=0.0),
            patch.object(ranking_engine, "generate_candidate_snapshot", return_value="snapshot"),
            patch.object(ranking_engine, "flatten_profile_skills_for_gap", return_value=[]),
            patch.object(
                ranking_engine,
                "compute_skill_gap_for_ranking",
                return_value={"matchedSkills": [], "missingSkills": [], "skillGapScore": 0.0},
            ),
            patch.object(ranking_engine, "_score_project_relevance", return_value=(0.0, [])),
            patch.object(ranking_engine, "_score_experience_alignment", return_value=(0.0, [])),
            patch.object(ranking_engine, "_normalize_contact_info", return_value={}),
            patch.object(ranking_engine, "save_ranking_to_dynamodb") as save_mock,
            patch.object(ranking_engine, "notify_recruiter_candidate_ranking"),
        ):
            response = ranking_engine.lambda_handler(
                {"job_id": "job-1", "jd_text": "test jd", "job_title": "Role", "required_skills": []},
                None,
            )

        self.assertEqual(response["statusCode"], 200)
        ranked_output = save_mock.call_args.args[1]
        self.assertEqual(len(ranked_output), 1)
        self.assertEqual(ranked_output[0]["candidateId"], "cand-1")


class SkillSemanticsJsonParseTests(unittest.TestCase):
    def test_parse_truncated_matches_array_returns_complete_rows(self):
        raw = (
            '{"matches": [\n'
            '  {"requiredSkill": "Python", "candidateSkill": "python", "confidence": 0.95},\n'
            '  {"requiredSkill": "Rust", "candidateSkill": "'
        )
        out = js_sem._parse_semantics_payload(raw)
        self.assertEqual(len(out.get("matches", [])), 1)
        self.assertEqual(out["matches"][0]["requiredSkill"], "Python")

    def test_parse_minified_full_json(self):
        raw = '{"matches":[{"requiredSkill":"x","candidateSkill":null,"confidence":0.0}]}'
        out = js_sem._parse_semantics_payload(raw)
        self.assertEqual(len(out["matches"]), 1)


if __name__ == "__main__":
    unittest.main()
