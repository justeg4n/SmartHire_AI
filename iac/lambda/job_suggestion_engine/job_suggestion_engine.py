# =============================================================================
# job_suggestion_engine.py — SmartHire AI | Job Suggestion Engine (Lambda)
#
# Responsibility: Given a candidate's stored CV vector and profile, find the
# top matching Job Descriptions in the pgvector pool and return personalized
# job suggestions to the candidate with AI-generated match explanations.
#
# This implements the CANDIDATE SIDE of bidirectional matching:
#   Candidate uploads CV globally → this Lambda finds matching JDs
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │  PIPELINE                                                                │
# │  [1] Receive cv_vector + parsed_data from vector_persister              │
# │  [2] Re-embed masked_cv_text as search_query (asymmetric search)        │
# │  [3] pgvector ANN: query vector <-> job_embeddings → top 20 jobs        │
# │  [4] Fetch JD text + metadata from DynamoDB for each candidate job      │
# │  [5] Cross-Encoder: re-rank top 20 → top 5 by semantic precision        │
# │  [6] Claude Agent 3: generate personalized match explanation per job    │
# │  [7] DynamoDB: save JOB_SUGGESTIONS under CANDIDATE#<id>               │
# │  [8] AppSync: push real-time notification to candidate frontend         │
# └─────────────────────────────────────────────────────────────────────────┘
#
# Trigger: Invoked asynchronously by vector_persister after CV is stored.
#
# Input event schema:
# {
#   "profile_id":     "Cognito user sub (same as Dynamo CANDIDATE#<id>)",
#   "file_key":       "candidates/uuid/cv.pdf",
#   "masked_cv_text": "...(up to 50k chars)...",
#   "cv_vector":      [0.12, 0.45, ...],    # 1024-dim float list
#   "parsed_data":    { "seniority_estimate": "...", "backend_skills": [...], ... }
# }
#
# Output (DynamoDB write + AppSync push):
# {
#   "PK": "CANDIDATE#<profile_id>",
#   "SK": "JOB_SUGGESTIONS",
#   "suggestions": [
#     {
#       "jobId": "...",
#       "jobTitle": "...",
#       "companyName": "...",
#       "seniority": "...",
#       "requiredSkills": [...],
#       "biEncoderScore": 78.5,
#       "crossEncoderScore": 82.1,
#       "finalScore": 80.8,
#       "matchExplanation": "AI-generated paragraph why this job suits candidate"
#     }
#   ]
# }
#
# Deployment: Lambda Container Image.
#   Requires sentence-transformers for Cross-Encoder.
#   Shares the same container image as vector_ops Lambda.
# =============================================================================

"""AWS Lambda entry — handler lives in `js_engine_core` for modularity."""

from js_engine_core import lambda_handler

__all__ = ["lambda_handler"]
