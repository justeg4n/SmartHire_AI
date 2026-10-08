# =============================================================================
# candidate_ranking_engine.py — SmartHire AI | Candidate Ranking Engine (Lambda)
#
# Responsibility: Given a newly processed Job Description vector, find the
# top matching candidates in the pgvector pool and build a ranked shortlist
# for the recruiter's dashboard with AI-generated candidate snapshots.
#
# This implements the RECRUITER SIDE of bidirectional matching:
#   Recruiter posts JD → this Lambda finds and ranks matching candidates
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │  PIPELINE                                                                │
# │  [1] Receive jd_vector + jd_text + job_id from vector_persister         │
# │  [2] Re-embed jd_text as search_query (asymmetric search)               │
# │  [3] pgvector ANN: query vector <-> candidate_embeddings → top 50       │
# │  [4] Fetch candidate profile (parsed_data) from DynamoDB for each       │
# │  [5] Fetch masked_cv_text from RDS raw_text column for cross-encoding   │
# │  [6] Cross-Encoder: re-rank top 50 → top 15 by semantic precision       │
# │  [7] Claude Agent 3: generate recruiter-facing candidate snapshot        │
# │  [8] DynamoDB: save CANDIDATE_RANKING under JOB#<id>                   │
# │  [9] AppSync: push real-time notification to recruiter dashboard         │
# └─────────────────────────────────────────────────────────────────────────┘
#
# Trigger: Invoked asynchronously by vector_persister (Branch A — JD flow)
# after the JD embedding is stored in RDS.
#
# Input event schema:
# {
#   "job_id":      "uuid",
#   "jd_text":     "...(full JD text)...",
#   "jd_vector":   [0.12, 0.45, ...],    # 1024-dim float list (optional)
#   "job_title":   "Senior Backend Engineer",
#   "required_skills": ["AWS Lambda", ".NET", "DynamoDB"]
# }
#
# Output (DynamoDB write + AppSync push):
# {
#   "PK": "JOB#<job_id>",
#   "SK": "CANDIDATE_RANKING",
#   "rankedCandidates": [
#     {
#       "candidateId": "...",
#       "seniority": "Senior",
#       "yearsExperience": 5,
#       "topSkills": ["AWS", ".NET", "Lambda"],
#       "matchScore": 87.3,
#       "candidateSnapshot": "AI-generated 2-3 sentence recruiter summary",
#       "interviewGuide": [...],   # from earlier pipeline (Agent 2)
#       "applicationStatus": "POOL"  # not yet applied
#     }
#   ]
# }
# =============================================================================

import json
import uuid
from datetime import datetime, timezone

from appsync_notifier import notify_recruiter_candidate_ranking

from cr_config import (
    ANN_POOL_SIZE,
    DYNAMIC_THRESHOLD_ENABLED,
    DYNAMIC_THRESHOLD_FLOOR,
    DYNAMIC_THRESHOLD_MIN_POOL,
    DYNAMIC_THRESHOLD_PERCENTILE,
    FINAL_RANKING_COUNT,
    HARD_OUTPUT_LIMIT,
    MIN_SCORE_THRESHOLD,
    SCORING_VERSION,
)
from cr_cross_encoder import build_jd_query_text, cross_encode_jd_vs_candidates
from cr_dynamo import (
    fetch_candidate_profile_from_dynamodb,
    resolve_job_identity,
    save_failure_to_dynamodb,
    save_ranking_to_dynamodb,
)
from cr_rds import (
    _resolve_job_document_embedding,
    get_cohere_query_embedding,
    search_matching_candidates,
    upsert_job_embedding,
)
from cr_scoring import (
    _normalize_contact_info,
    _score_experience_alignment,
    _score_project_relevance,
    compute_hybrid_score,
    compute_skill_gap_for_ranking,
    flatten_profile_skills_for_gap,
    generate_candidate_snapshot,
)

# ---------------------------------------------------------------------------
# Lambda Entry Point
# ---------------------------------------------------------------------------


def _safe_percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    p = max(0.0, min(100.0, float(percentile)))
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (p / 100.0) * (len(ordered) - 1)
    low = int(rank)
    high = min(len(ordered) - 1, low + 1)
    if high == low:
        return ordered[low]
    frac = rank - low
    return ordered[low] * (1.0 - frac) + ordered[high] * frac


def _resolve_score_threshold(final_scores: list[float]) -> float:
    base = float(MIN_SCORE_THRESHOLD)
    if not DYNAMIC_THRESHOLD_ENABLED:
        return base
    if len(final_scores) >= max(1, DYNAMIC_THRESHOLD_MIN_POOL):
        return base
    dynamic = max(float(DYNAMIC_THRESHOLD_FLOOR), _safe_percentile(final_scores, DYNAMIC_THRESHOLD_PERCENTILE))
    return round(min(base, dynamic), 2)

def lambda_handler(event, context):
    """
    Find and rank the best candidates in the pool for a new job posting.

    Expected to be invoked asynchronously (InvocationType=Event) by
    vector_persister (Branch A — JD flow) after the JD embedding is stored.

    Full pipeline:
      [1] Validate input
      [2] Re-embed JD as search_query (asymmetric search)
      [3] pgvector ANN: find top 50 candidates by vector distance
      [4] Fetch enriched DynamoDB profile per candidate (interview guide)
      [5] Cross-Encoder re-rank → top 15 by semantic precision
      [6] Compute hybrid scores; filter by MIN_SCORE_THRESHOLD
      [7] Claude Agent 3: generate candidate snapshot for recruiter per candidate
      [8] Save CANDIDATE_RANKING to DynamoDB
      [9] AppSync: push real-time ranked list to recruiter dashboard
    """
    job_id = event.get("job_id", "unknown")
    flow_type = event.get("flow_type")

    try:
        jd_text = event.get("jd_text", "")
        job_title = event.get("job_title", "Unknown Role")
        required_skills = event.get("required_skills", [])
        required_skill_groups = event.get("required_skill_groups", {})
        owner_cognito_sub = (event.get("owner_cognito_sub") or "").strip()
        pipeline_run_id = str(event.get("pipeline_run_id") or uuid.uuid4())
        scoring_version = str(event.get("scoring_version") or SCORING_VERSION)
        jd_version = str(event.get("jd_version") or event.get("job_updated_at") or "")

        if flow_type and flow_type != "recruiter":
            raise ValueError(f"Invalid flow_type for ranking: {flow_type}")

        if job_id == "unknown" or not jd_text:
            raise ValueError("job_id and jd_text are required.")

        owner_cognito_sub, recruiter_id = resolve_job_identity(job_id, owner_cognito_sub)
        if not owner_cognito_sub:
            raise ValueError("owner_cognito_sub is required for recruiter ranking persistence")

        print(f"INFO: CandidateRankingEngine started for job={job_id} ({job_title})")

        jd_vec_in = event.get("jd_vector") or []
        if not isinstance(jd_vec_in, list):
            jd_vec_in = []
        job_doc_vector = _resolve_job_document_embedding(jd_vec_in, jd_text)
        upsert_job_embedding(job_id, job_doc_vector, jd_text)

        # ── [2] Re-embed JD as search_query ──────────────────────────────
        print("INFO: Generating search_query embedding for JD.")
        normalized_jd_text = build_jd_query_text(jd_text)
        query_vector = get_cohere_query_embedding(normalized_jd_text)

        # ── [3] ANN vector search against candidate_embeddings ──────────
        print(f"INFO: Searching top {ANN_POOL_SIZE} candidates via pgvector.")
        ann_matches = search_matching_candidates(query_vector, top_n=ANN_POOL_SIZE)

        if not ann_matches:
            print("WARNING: No candidate matches returned from pgvector.")
            updated_at = datetime.now(timezone.utc).isoformat()
            save_ranking_to_dynamodb(
                job_id,
                [],
                updated_at,
                owner_cognito_sub=owner_cognito_sub,
                recruiter_id=recruiter_id,
                pipeline_run_id=pipeline_run_id,
                scoring_version=scoring_version,
                jd_version=jd_version,
                scored_at=updated_at,
            )
            notify_recruiter_candidate_ranking(
                job_id,
                [],
                updated_at,
                scored_at=updated_at,
                candidate_count=0,
                pipeline_run_id=pipeline_run_id,
                scoring_version=scoring_version,
                jd_version=jd_version,
            )
            return {"statusCode": 200, "body": "No candidates found. Ranking saved as empty."}

        # ── [4] Fetch enriched DynamoDB profiles ─────────────────────────
        print(f"INFO: Fetching DynamoDB profiles for {len(ann_matches)} candidate(s).")
        for candidate in ann_matches:
            ddb_profile = fetch_candidate_profile_from_dynamodb(candidate["candidateId"])
            parsed_profile = candidate.get("parsedProfile", {})
            ddb_parsed = ddb_profile.get("parsedProfile", {})
            if isinstance(parsed_profile, dict) and isinstance(ddb_parsed, dict):
                merged_profile = dict(parsed_profile)
                merged_profile.update({k: v for k, v in ddb_parsed.items() if v not in (None, "", [], {})})
                candidate["parsedProfile"] = merged_profile
            candidate.update(ddb_profile)

        # ── [5] Cross-Encoder re-rank (Top N only) ────────────────────────
        ann_matches.sort(key=lambda c: float(c.get("biScore", 0)), reverse=True)
        ce_pool = ann_matches[:FINAL_RANKING_COUNT]
        print(
            f"INFO: Cross-encoding top {len(ce_pool)} candidate(s) by biScore "
            f"out of {len(ann_matches)} total matches."
        )
        if ce_pool:
            ce_pool = cross_encode_jd_vs_candidates(normalized_jd_text, ce_pool)
        
        # Only CE-scored candidates are eligible for shortlist output.
        candidates_for_scoring = ce_pool

        # ── [6] Hybrid score + filter + sort ──────────────────────────────
        for c in candidates_for_scoring:
            c["finalScore"] = compute_hybrid_score(c["biScore"], c.get("crossScore"))
            print(
                "INFO: scoring_pair "
                + json.dumps({
                    "jobId": job_id,
                    "candidateId": c.get("candidateId"),
                    "biScore": c.get("biScore"),
                    "crossScore": c.get("crossScore"),
                    "finalScore": c.get("finalScore"),
                    "crossDiagnostics": c.get("crossDiagnostics", {}),
                })
            )

        dynamic_threshold = _resolve_score_threshold(
            [float(c.get("finalScore", 0.0) or 0.0) for c in candidates_for_scoring]
        )
        filtered = [c for c in candidates_for_scoring if c["finalScore"] >= dynamic_threshold]
        filtered.sort(key=lambda c: c["finalScore"], reverse=True)
        top_candidates = filtered[: min(FINAL_RANKING_COUNT, HARD_OUTPUT_LIMIT)]

        print(
            f"INFO: {len(top_candidates)} candidate(s) passed threshold "
            f"(base={MIN_SCORE_THRESHOLD}%, applied={dynamic_threshold}%)."
        )

        jd_preview = jd_text[:600]

        # ── [7] Claude Agent 3: candidate snapshots ───────────────────────
        ranked_output = []
        for rank, candidate in enumerate(top_candidates, start=1):
            cid = candidate["candidateId"]
            print(f"INFO: Generating snapshot for candidate {rank}/{len(top_candidates)} ({cid}).")

            snapshot = generate_candidate_snapshot(
                candidate, job_title, required_skills, jd_preview
            )

            profile = candidate.get("parsedProfile", {})
            # New schema: prefer hardSkills+processSkills; fallback to legacy candidateSkills
            hard_skills = candidate.get("hardSkills") or []
            process_skills = candidate.get("processSkills") or []
            if hard_skills or process_skills:
                all_skills = flatten_profile_skills_for_gap(
                    profile, hard_skills + process_skills
                )
            else:
                meta_skills = candidate.get("candidateSkills")
                if not isinstance(meta_skills, list):
                    meta_skills = None
                all_skills = flatten_profile_skills_for_gap(profile, meta_skills)

            gap = compute_skill_gap_for_ranking(required_skills, all_skills, required_skill_groups)
            project_score, project_evidence = _score_project_relevance(required_skills, profile)
            exp_score, exp_evidence = _score_experience_alignment(
                profile, int(candidate.get("yearsExperience", 0) or 0)
            )
            enrichment_score = round(0.6 * project_score + 0.4 * exp_score, 2)
            final_with_enrichment = round(
                0.85 * float(candidate["finalScore"]) + 0.15 * enrichment_score,
                2,
            )
            contact_info = _normalize_contact_info(candidate.get("contactInfo", {}))
            evidence_highlights = (project_evidence + exp_evidence)[:6]

            ranked_output.append({
                "rank": rank,
                "candidateId": cid,
                "seniority": candidate.get("seniority", "Unknown"),
                "yearsExperience": candidate.get("yearsExperience", 0),
                "biEncoderScore": candidate["biScore"],
                "crossEncoderScore": candidate.get("crossScore"),
                "finalScore": final_with_enrichment,
                "candidateSnapshot": snapshot,
                "interviewGuide": candidate.get("interviewGuide", []),
                "applicationStatus": "POOL",  # Has not applied — discovered by AI
                "matchedSkills": gap["matchedSkills"],
                "missingSkills": gap["missingSkills"],
                "matchedGroups": gap.get("matchedGroups", []),
                "missingGroups": gap.get("missingGroups", []),
                "skillGapScore": gap["skillGapScore"],
                "contactInfo": contact_info,
                "scoreBreakdown": {
                    "hybridScore": round(float(candidate["finalScore"]), 2),
                    "projectRelevanceScore": project_score,
                    "experienceAlignmentScore": exp_score,
                    "enrichmentScore": enrichment_score,
                    "finalScore": final_with_enrichment,
                },
                "scoreDiagnostics": {
                    "thresholdBase": MIN_SCORE_THRESHOLD,
                    "thresholdApplied": dynamic_threshold,
                    "crossDiagnostics": candidate.get("crossDiagnostics", {}),
                    "scoringVersion": scoring_version,
                },
                "evidenceHighlights": evidence_highlights,
                "schemaVersion": candidate.get("schemaVersion", profile.get("schema_version", "1.0.0")),
                # Unified profile envelope for FE detail cards/tables.
                "profileInfo": {
                    "fullName": contact_info.get("fullName", ""),
                    "seniority": candidate.get("seniority", "Unknown"),
                    "yearsExperience": candidate.get("yearsExperience", 0),
                    "summary": snapshot,
                    "contactInfo": contact_info,
                },
            })

        ranked_output.sort(key=lambda c: float(c.get("finalScore", 0)), reverse=True)
        for idx, row in enumerate(ranked_output, start=1):
            row["rank"] = idx

        # ── [8] Save to DynamoDB ───────────────────────────────────────────
        updated_at = datetime.now(timezone.utc).isoformat()
        save_ranking_to_dynamodb(
            job_id,
            ranked_output,
            updated_at,
            owner_cognito_sub=owner_cognito_sub,
            recruiter_id=recruiter_id,
            pipeline_run_id=pipeline_run_id,
            scoring_version=scoring_version,
            jd_version=jd_version,
            scored_at=updated_at,
        )

        # ── [9] AppSync real-time push ────────────────────────────────────
        notify_recruiter_candidate_ranking(
            job_id,
            ranked_output,
            updated_at,
            scored_at=updated_at,
            candidate_count=len(ranked_output),
            pipeline_run_id=pipeline_run_id,
            scoring_version=scoring_version,
            jd_version=jd_version,
        )

        print(f"INFO: CandidateRankingEngine complete. {len(ranked_output)} candidate(s) ranked for job {job_id}.")
        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "SUCCESS",
                "job_id": job_id,
                "ranked_count": len(ranked_output),
            }),
        }

    except Exception as exc:
        print(f"ERROR: CandidateRankingEngine failed for job={job_id}: {exc}")
        updated_at = datetime.now(timezone.utc).isoformat()
        save_failure_to_dynamodb(job_id, str(exc), updated_at)
        return {
            "statusCode": 200,
            "body": json.dumps({"status": "FAILED_SAFE", "error": str(exc)}),
        }