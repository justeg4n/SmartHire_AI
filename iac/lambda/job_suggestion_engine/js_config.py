"""Environment-backed constants — job suggestion Lambda."""
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
# Token budget: ms-marco-MiniLM-L-6-v2 hard limit = 512 tokens.
# JD query  ≈ 1000 chars → ~250 tokens  (information-need, not full doc)
# CV chunk  ≈ 750 chars  → ~188 tokens
# Pair total ≈ 438 tokens << 512  → model reads the full CV chunk every time.
# Previous values (JD=2500, chunk=1200) produced ~900-token pairs that truncated
# the CV chunk entirely, causing artificially low crossScores.
CROSS_ENCODER_CHUNK_CHARS = int(os.environ.get("CE_CHUNK_CHARS", "750"))
CROSS_ENCODER_OVERLAP_CHARS = int(os.environ.get("CE_OVERLAP_CHARS", "150"))
CROSS_ENCODER_MAX_CHUNKS = int(os.environ.get("CE_MAX_CHUNKS", "6"))
CROSS_ENCODER_JD_QUERY_CHARS = int(os.environ.get("CE_JD_QUERY_CHARS", "1000"))
CROSS_ENCODER_TOP_K = int(os.environ.get("CE_TOP_K", "3"))
CE_SIGMOID_SHIFT = float(os.environ.get("CE_SIGMOID_SHIFT", "-1.0"))
CE_SIGMOID_SCALE = float(os.environ.get("CE_SIGMOID_SCALE", "1.5"))

# Matching thresholds
# Step 1 ANN: how many jobs to pull from pgvector before re-ranking
ANN_CANDIDATE_POOL_SIZE = int(os.environ.get("ANN_CANDIDATE_POOL_SIZE", "20"))
# Step 5 Cross-Encoder: how many top jobs to keep after re-ranking
FINAL_SUGGESTION_COUNT = int(os.environ.get("FINAL_SUGGESTION_COUNT", "5"))
# Minimum final score to include in suggestions (0-100)
MIN_SCORE_THRESHOLD = float(os.environ.get("MIN_SCORE_THRESHOLD", "30.0"))
DYNAMIC_THRESHOLD_ENABLED = os.environ.get("DYNAMIC_THRESHOLD_ENABLED", "true").lower() == "true"
DYNAMIC_THRESHOLD_MIN_POOL = int(os.environ.get("DYNAMIC_THRESHOLD_MIN_POOL", "10"))
DYNAMIC_THRESHOLD_PERCENTILE = float(os.environ.get("DYNAMIC_THRESHOLD_PERCENTILE", "60.0"))
DYNAMIC_THRESHOLD_FLOOR = float(os.environ.get("DYNAMIC_THRESHOLD_FLOOR", "15.0"))

# Hybrid score weights for suggestion scoring.
# Rebalanced after fixing the CE token-budget overflow (Fix 1 & 2):
# previously CE scores were artificially depressed by truncation, so
# CROSS=0.65 was collapsing good bi-encoder matches. With reliable CE
# scores now possible, BI carries more weight until CE is re-validated.
# Re-tune toward CROSS once crossScore distributions look healthy in prod.
HYBRID_WEIGHT_BI = float(os.environ.get("SUGGESTION_WEIGHT_BI", "0.55"))
HYBRID_WEIGHT_CROSS = float(os.environ.get("SUGGESTION_WEIGHT_CROSS", "0.45"))
TOP_K_WEIGHTS = [0.55, 0.30, 0.15]
MAX_REQUIRED_SKILLS = int(os.environ.get("MAX_REQUIRED_SKILLS", "20"))
MAX_CANDIDATE_SKILLS = int(os.environ.get("MAX_CANDIDATE_SKILLS", "72"))
ENABLE_SKILL_GAP_FUZZY = os.environ.get("ENABLE_SKILL_GAP_FUZZY", "true").lower() == "true"

# Structured skill scoring thresholds and weights
SKILL_SIM_FULL_MATCH = float(os.environ.get("SKILL_SIM_FULL_MATCH", "0.90"))
SKILL_SIM_PARTIAL = float(os.environ.get("SKILL_SIM_PARTIAL", "0.75"))
SKILL_SIM_WEAK = float(os.environ.get("SKILL_SIM_WEAK", "0.60"))
ALIAS_PROMOTE_MIN_SIM = float(os.environ.get("ALIAS_PROMOTE_MIN_SIM", "0.90"))
SKILL_WEIGHT_MUST = float(os.environ.get("SKILL_WEIGHT_MUST", "0.60"))
SKILL_WEIGHT_ONE_OF = float(os.environ.get("SKILL_WEIGHT_ONE_OF", "0.25"))
SKILL_WEIGHT_NICE = float(os.environ.get("SKILL_WEIGHT_NICE", "0.15"))
SKILL_NICE_PARTIAL_CREDIT = float(os.environ.get("SKILL_NICE_PARTIAL_CREDIT", "0.50"))
FINAL_SCORE_BETA = float(os.environ.get("FINAL_SCORE_BETA", "0.20"))
MUST_PENALTY_FACTOR = float(os.environ.get("MUST_PENALTY_FACTOR", "0.20"))
MUST_THRESHOLD_FRACTION = float(os.environ.get("MUST_THRESHOLD_FRACTION", "0.50"))
ENABLE_FINAL_SCORE_V3 = os.environ.get("ENABLE_FINAL_SCORE_V3", "true").lower() == "true"

# Feature flags
ENABLE_CROSS_ENCODER = os.environ.get("ENABLE_CROSS_ENCODER", "true").lower() == "true"
ENABLE_MATCH_EXPLANATION = os.environ.get("ENABLE_MATCH_EXPLANATION", "true").lower() == "true"
ENABLE_PGVECTOR_UPSERT = os.environ.get("ENABLE_PGVECTOR_UPSERT", "true").lower() == "true"
ENABLE_AI_SKILL_SEMANTICS = os.environ.get("ENABLE_AI_SKILL_SEMANTICS", "true").lower() == "true"
# Bedrock Haiku (or override) — batch canonicalization of raw skill strings before gap scoring.
ENABLE_SKILL_CANONICAL_AI = os.environ.get("ENABLE_SKILL_CANONICAL_AI", "true").lower() == "true"
SKILL_CANONICAL_AI_MODEL_ID = os.environ.get(
    "SKILL_CANONICAL_AI_MODEL_ID",
    os.environ.get(
        "SKILL_SEMANTICS_MODEL_ID",
        "apac.anthropic.claude-3-haiku-20240307-v1:0",
    ),
)
SKILL_CANONICAL_AI_MAX_OUTPUT_TOKENS = int(
    os.environ.get("SKILL_CANONICAL_AI_MAX_OUTPUT_TOKENS", "4096")
)
SKILL_SEMANTICS_MODEL_ID = os.environ.get(
    "SKILL_SEMANTICS_MODEL_ID",
    "apac.anthropic.claude-3-haiku-20240307-v1:0",
)
AI_SKILL_MIN_CONFIDENCE = float(os.environ.get("AI_SKILL_MIN_CONFIDENCE", "0.6"))
AI_SKILL_CACHE_SIZE = int(os.environ.get("AI_SKILL_CACHE_SIZE", "128"))
# Haiku output cap — 500 was too small for many required skills + pretty-printed JSON
SKILL_SEMANTICS_MAX_OUTPUT_TOKENS = int(
    os.environ.get("SKILL_SEMANTICS_MAX_OUTPUT_TOKENS", "4096")
)
SCORING_VERSION = os.environ.get("SCORING_VERSION", "3.0.0")
SKILL_SUMMARY_SCHEMA_VERSION = os.environ.get("SKILL_SUMMARY_SCHEMA_VERSION", "1.0")
HARD_OUTPUT_LIMIT = 5

# Latency guardrails and fallback diagnostics
LATENCY_BUDGET_MS = {
    "bi_encoder_ann": int(os.environ.get("LATENCY_BUDGET_BI_ENCODER_ANN_MS", "50")),
    "cross_encoder_rerank": int(os.environ.get("LATENCY_BUDGET_CROSS_ENCODER_RERANK_MS", "2000")),
    "skill_canonical_lookup": int(os.environ.get("LATENCY_BUDGET_SKILL_CANONICAL_LOOKUP_MS", "10")),
    "total_pipeline": int(os.environ.get("LATENCY_BUDGET_TOTAL_PIPELINE_MS", "350")),
}
CE_FALLBACK_REASONS = {
    "BUDGET_EXCEEDED": "budget_exceeded",
    "MODEL_ERROR": "model_error",
    "DISABLED_BY_FLAG": "disabled_by_flag",
    "CACHE_HIT": "cache_hit",
    "NONE": "none",
}
