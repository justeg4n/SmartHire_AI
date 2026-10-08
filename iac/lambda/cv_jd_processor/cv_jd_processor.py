# =============================================================================
# cv_jd_processor.py — SmartHire AI | Unified CV/JD Processing Lambda
#
# Merged from: text_processor.py + vector_ops.py
#
# Responsibility:
#   CV path  — Textract → (Bedrock JSON contact + regex merge) → PII Mask → Claude Analysis → Interview Guide
#               → Embed → Cross-Encoder Score → Hybrid Score
#   JD path  — Read raw JD text from RDS → Embed
#
# Architecture role: Single processing step in Step Functions pipeline
#   CV:  IngestionTrigger → Step Functions → CvJdProcessor → JobSuggestionEngine
#   JD:  .NET Backend → Step Functions → CvJdProcessor → CandidateRankingEngine
#
# Code layout: cjp_engine_core (pipeline + handlers), cjp_config (env), cjp_clients (AWS SDK).
# =============================================================================

"""AWS Lambda entry — handler in cjp_engine_core."""

from cjp_engine_core import lambda_handler

__all__ = ["lambda_handler"]
