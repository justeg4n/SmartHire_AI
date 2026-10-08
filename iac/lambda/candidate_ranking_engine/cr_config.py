"""Environment-backed constants — candidate ranking Lambda."""
import os

CLAUDE_MODEL_ID = os.environ.get("CLAUDE_MODEL_ID") or os.environ.get(
    "BEDROCK_MODEL_ID", "apac.anthropic.claude-3-5-sonnet-20241022-v2:0"
)
COHERE_MODEL_ID = os.environ.get("COHERE_MODEL_ID", "cohere.embed-english-v3")

DYNAMODB_TABLE = (
    os.environ.get("DYNAMODB_TABLE_NAME")
    or os.environ.get("DYNAMODB_TABLE")
    or "SmartHire_ApplicationTracking"
)

# pgvector / RDS
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
CE_SIGMOID_SHIFT = float(os.environ.get("CE_SIGMOID_SHIFT", "-1.0"))
CE_SIGMOID_SCALE = float(os.environ.get("CE_SIGMOID_SCALE", "1.5"))
MAX_CANDIDATE_SKILLS = int(os.environ.get("MAX_CANDIDATE_SKILLS", "72"))
ENABLE_SKILL_GAP_FUZZY = os.environ.get("ENABLE_SKILL_GAP_FUZZY", "true").lower() == "true"

# Matching parameters
# How many candidates to pull from pgvector before re-ranking
ANN_POOL_SIZE = int(os.environ.get("RANKING_ANN_POOL_SIZE", "50"))
# How many candidates to keep after Cross-Encoder re-ranking
FINAL_RANKING_COUNT = int(os.environ.get("FINAL_RANKING_COUNT", "5"))
# Minimum hybrid score to include in ranking (eliminates clearly poor matches)
MIN_SCORE_THRESHOLD = float(os.environ.get("RANKING_MIN_SCORE", "25.0"))
DYNAMIC_THRESHOLD_ENABLED = os.environ.get("RANKING_DYNAMIC_THRESHOLD_ENABLED", "true").lower() == "true"
DYNAMIC_THRESHOLD_MIN_POOL = int(os.environ.get("RANKING_DYNAMIC_THRESHOLD_MIN_POOL", "10"))
DYNAMIC_THRESHOLD_PERCENTILE = float(os.environ.get("RANKING_DYNAMIC_THRESHOLD_PERCENTILE", "60.0"))
DYNAMIC_THRESHOLD_FLOOR = float(os.environ.get("RANKING_DYNAMIC_THRESHOLD_FLOOR", "15.0"))

# Hybrid blending weights
HYBRID_WEIGHT_BI = float(os.environ.get("RANKING_WEIGHT_BI", "0.35"))
HYBRID_WEIGHT_CROSS = float(os.environ.get("RANKING_WEIGHT_CROSS", "0.65"))
TOP_K_WEIGHTS = [0.55, 0.30, 0.15]

# Feature flags
ENABLE_CROSS_ENCODER = os.environ.get("ENABLE_CROSS_ENCODER", "true").lower() == "true"
ENABLE_CANDIDATE_SNAPSHOT = os.environ.get("ENABLE_CANDIDATE_SNAPSHOT", "true").lower() == "true"
ENABLE_PGVECTOR_UPSERT = os.environ.get("ENABLE_PGVECTOR_UPSERT", "true").lower() == "true"
ENABLE_AI_SKILL_SEMANTICS = os.environ.get("ENABLE_AI_SKILL_SEMANTICS", "true").lower() == "true"
SKILL_SEMANTICS_MODEL_ID = os.environ.get(
    "SKILL_SEMANTICS_MODEL_ID",
    "apac.anthropic.claude-3-haiku-20240307-v1:0",
)
AI_SKILL_MIN_CONFIDENCE = float(os.environ.get("AI_SKILL_MIN_CONFIDENCE", "0.6"))
ALIAS_PROMOTE_MIN_SIM = float(os.environ.get("ALIAS_PROMOTE_MIN_SIM", "0.90"))
AI_SKILL_CACHE_SIZE = int(os.environ.get("AI_SKILL_CACHE_SIZE", "128"))
SKILL_SEMANTICS_MAX_OUTPUT_TOKENS = int(
    os.environ.get("SKILL_SEMANTICS_MAX_OUTPUT_TOKENS", "4096")
)
SCORING_VERSION = os.environ.get("SCORING_VERSION", "mvp-v1")
HARD_OUTPUT_LIMIT = 5
