"""Environment-backed constants — CV/JD processor Lambda."""
import os

CLAUDE_MODEL_ID = os.environ.get("CLAUDE_MODEL_ID") or os.environ.get(
    "BEDROCK_MODEL_ID", "apac.anthropic.claude-3-haiku-20240307-v1:0"
)
# Agent-1 CV extraction uses a dedicated model — needs complex JSON output (skills +
# projects + experience). Haiku 4.5 has 8192 output tokens (same as Sonnet) and
# 50 RPM quota (10× Sonnet) — solves both truncation and throttling problems.
# Override with AGENT1_MODEL_ID env var if needed.
AGENT1_MODEL_ID = os.environ.get(
    "AGENT1_MODEL_ID",
    "global.anthropic.claude-haiku-4-5-20251001-v1:0",
)
COHERE_MODEL_ID = os.environ.get("COHERE_MODEL_ID", "cohere.embed-english-v3")
DYNAMODB_TABLE = (
    os.environ.get("DYNAMODB_TABLE_NAME")
    or os.environ.get("DYNAMODB_TABLE")
    or "SmartHire_ApplicationTracking"
)
PARSE_STATUS_TTL_DAYS = int(os.environ.get("PARSE_STATUS_TTL_DAYS", "30"))

# RDS (for reading JD text + pgvector persistence)
RDS_PROXY_ENDPOINT = os.environ.get("RDS_PROXY_ENDPOINT", "")
RDS_SECRET_ARN = os.environ.get("RDS_SECRET_ARN", "")
RDS_DATABASE = os.environ.get("RDS_DATABASE", "smarthiredb")
RDS_SSL_MODE = os.environ.get("RDS_SSL_MODE", "require")
RDS_CONNECT_TIMEOUT = int(os.environ.get("RDS_CONNECT_TIMEOUT", "8"))

# Cross-Encoder
CROSS_ENCODER_MODEL_ID = os.environ.get(
    "CROSS_ENCODER_MODEL_ID", "cross-encoder/ms-marco-MiniLM-L-6-v2"
)
CROSS_ENCODER_BAKED_PATH = os.environ.get(
    "CROSS_ENCODER_MODEL_PATH", "/opt/ml/cross_encoder"
)
CROSS_ENCODER_CHUNK_CHARS = int(os.environ.get("CE_CHUNK_CHARS", "1200"))
CROSS_ENCODER_OVERLAP_CHARS = int(os.environ.get("CE_OVERLAP_CHARS", "200"))
CROSS_ENCODER_MAX_CHUNKS = int(os.environ.get("CE_MAX_CHUNKS", "6"))
CROSS_ENCODER_JD_QUERY_CHARS = int(os.environ.get("CE_JD_QUERY_CHARS", "2500"))
CROSS_ENCODER_TOP_K = int(os.environ.get("CE_TOP_K", "3"))

# Hybrid blending weights (must sum to 1.0)
HYBRID_WEIGHT_CROSS = float(os.environ.get("HYBRID_WEIGHT_CROSS", "0.65"))
HYBRID_WEIGHT_BI = float(os.environ.get("HYBRID_WEIGHT_BI", "0.35"))
TOP_K_WEIGHTS = [0.55, 0.30, 0.15]
MAX_REQUIRED_SKILLS = int(os.environ.get("MAX_REQUIRED_SKILLS", "20"))
MAX_CANDIDATE_SKILLS = int(os.environ.get("MAX_CANDIDATE_SKILLS", "72"))
SKILL_BUCKET_MAX_ITEMS = int(os.environ.get("SKILL_BUCKET_MAX_ITEMS", "40"))
CV_PROFILE_SCHEMA_VERSION = "2.0.0"

# Feature flags
ENABLE_BLIND_SCREENING = (
    os.environ.get("ENABLE_BLIND_SCREENING", "true").lower() == "true"
)
ENABLE_INTERVIEW_GUIDE = (
    os.environ.get("ENABLE_INTERVIEW_GUIDE", "true").lower() == "true"
)
ENABLE_CROSS_ENCODER = (
    os.environ.get("ENABLE_CROSS_ENCODER", "true").lower() == "true"
)
# LLM contact extraction (raw CV only; never fed to scoring). Regex fills gaps on failure.
ENABLE_LLM_CONTACT_EXTRACTION = (
    os.environ.get("ENABLE_LLM_CONTACT_EXTRACTION", "true").lower() == "true"
)
CONTACT_EXTRACTION_MAX_CHARS = int(os.environ.get("CONTACT_EXTRACTION_MAX_CHARS", "14000"))
# Cheaper / faster model for JSON contact only (main CLAUDE_MODEL_ID stays for skill parse, etc.).
CONTACT_EXTRACTION_MODEL_ID = os.environ.get(
    "CONTACT_EXTRACTION_MODEL_ID",
    "apac.anthropic.claude-3-haiku-20240307-v1:0",
)
# Skill list canonicalization (Bedrock Haiku batch) before Dynamo candidateSkills write.
ENABLE_SKILL_CANONICAL_AI = os.environ.get("ENABLE_SKILL_CANONICAL_AI", "true").lower() == "true"
SKILL_CANONICAL_AI_MODEL_ID = os.environ.get(
    "SKILL_CANONICAL_AI_MODEL_ID",
    "apac.anthropic.claude-3-haiku-20240307-v1:0",
)
SKILL_CANONICAL_AI_MAX_OUTPUT_TOKENS = int(
    os.environ.get("SKILL_CANONICAL_AI_MAX_OUTPUT_TOKENS", "4096")
)
AI_SKILL_CACHE_SIZE = int(os.environ.get("AI_SKILL_CACHE_SIZE", "128"))

# Skill consolidation (LLM expand tools → domain concepts, runs after Agent-1)
# Uses Haiku by default to avoid throttling Sonnet — consolidation is classification,
# not generation, so Haiku quality is sufficient.
ENABLE_SKILL_CONSOLIDATION = os.environ.get("ENABLE_SKILL_CONSOLIDATION", "true").lower() == "true"
SKILL_CONSOLIDATION_MODEL_ID = os.environ.get(
    "SKILL_CONSOLIDATION_MODEL_ID",
    "apac.anthropic.claude-3-haiku-20240307-v1:0",
)
SKILL_CONSOLIDATION_MAX_OUTPUT_TOKENS = int(
    os.environ.get("SKILL_CONSOLIDATION_MAX_OUTPUT_TOKENS", "2000")
)
