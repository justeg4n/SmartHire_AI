"""RDS, pgvector search, Cohere embeddings — candidate ranking."""
import json
import ssl

from cr_clients import bedrock, secretsmanager
from cr_config import (
    ANN_POOL_SIZE,
    COHERE_MODEL_ID,
    ENABLE_PGVECTOR_UPSERT,
    RDS_CONNECT_TIMEOUT,
    RDS_DATABASE,
    RDS_PROXY_ENDPOINT,
    RDS_SECRET_ARN,
    RDS_SSL_MODE,
)

# ---------------------------------------------------------------------------
# RDS Connection Helper
# ---------------------------------------------------------------------------

_rds_secret_cache: dict | None = None


def _normalize_matching_text(text: str, max_chars: int = 4000) -> str:
    cleaned = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    cleaned = " ".join(cleaned.split())
    return cleaned[:max_chars].strip()


def _resolve_rds_credentials() -> dict:
    global _rds_secret_cache
    if _rds_secret_cache:
        return _rds_secret_cache
    if not RDS_SECRET_ARN:
        raise RuntimeError("RDS_SECRET_ARN not configured.")
    resp = secretsmanager.get_secret_value(SecretId=RDS_SECRET_ARN)
    parsed = json.loads(resp["SecretString"])
    _rds_secret_cache = {
        "username": parsed["username"],
        "password": parsed["password"],
        "host": parsed.get("host", ""),
        "port": int(parsed.get("port", 5432)),
        "dbname": parsed.get("dbname", RDS_DATABASE),
    }
    return _rds_secret_cache


def _get_rds_connection():
    import pg8000.native  # type: ignore
    secret = _resolve_rds_credentials()
    host = RDS_PROXY_ENDPOINT or secret["host"]
    ssl_ctx = None
    if RDS_SSL_MODE in ("require", "verify-full", "verify-ca"):
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
    return pg8000.native.Connection(
        user=secret["username"],
        password=secret["password"],
        host=host,
        port=secret["port"],
        database=secret["dbname"],
        ssl_context=ssl_ctx,
        timeout=RDS_CONNECT_TIMEOUT,
    )


# ---------------------------------------------------------------------------
# Step 2: JD Query Embedding (Asymmetric Search)
# ---------------------------------------------------------------------------

def get_cohere_document_embedding(text: str) -> list[float]:
    """Embed JD with input_type=search_document for pgvector job_embeddings."""
    normalized = (text or "").strip()
    safe_text = normalized[:2048] if normalized else "No content"
    payload = {
        "texts": [safe_text],
        "input_type": "search_document",
        "truncate": "END",
    }
    response = bedrock.invoke_model(
        modelId=COHERE_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(payload),
    )
    return json.loads(response.get("body").read())["embeddings"][0]


def get_cohere_query_embedding(text: str) -> list[float]:
    """
    Embed JD text as a search_query for asymmetric ANN search.

    When the JD is the *searcher* looking for matching candidates,
    we use input_type="search_query" so it aligns correctly with the
    candidate_embeddings (stored as "search_document").

    If the caller already has a stored jd_vector (from jd_parser), we
    do NOT use it for this search — that stored vector was generated as
    "search_document". We always generate a fresh "search_query" vector.
    """
    normalized = _normalize_matching_text(text, max_chars=2048) or "No content"
    payload = {
        "texts": [normalized],
        "input_type": "search_query",
        "truncate": "END",
    }
    response = bedrock.invoke_model(
        modelId=COHERE_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(payload),
    )
    return json.loads(response.get("body").read())["embeddings"][0]


def _build_vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(f"{float(v):.8f}" for v in vec) + "]"


def _resolve_job_document_embedding(jd_vector: list[float] | None, jd_text: str) -> list[float]:
    if jd_vector and len(jd_vector) == 1024:
        return jd_vector
    print("INFO: jd_vector missing or wrong length; embedding jd_text as search_document.")
    return get_cohere_document_embedding(jd_text)


def upsert_job_embedding(job_id: str, doc_vector: list[float], jd_text: str) -> None:
    """Persist JD document embedding for candidate-side ANN (job_suggestion_engine)."""
    if not ENABLE_PGVECTOR_UPSERT or not RDS_SECRET_ARN:
        return
    if not doc_vector or len(doc_vector) != 1024:
        print("WARNING: Skip job_embeddings UPSERT — invalid embedding length.")
        return
    vec_lit = _build_vector_literal(doc_vector)
    raw_trunc = (jd_text or "")[:500000]
    conn = _get_rds_connection()
    try:
        conn.run(
            """
            INSERT INTO job_embeddings (job_id, embedding, raw_text)
            VALUES (:jid::uuid, :vec::vector, :rtext)
            ON CONFLICT (job_id) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                raw_text = EXCLUDED.raw_text,
                updated_at = NOW();
            """,
            jid=str(job_id),
            vec=vec_lit,
            rtext=raw_trunc,
        )
        print(f"INFO: UPSERT job_embeddings for job_id={job_id}")
    except Exception as exc:
        print(f"WARNING: RDS job_embeddings UPSERT failed (non-fatal): {exc}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Step 3: pgvector ANN Search — Find Top N Matching Candidates
# ---------------------------------------------------------------------------

def search_matching_candidates(
    query_vector: list[float],
    top_n: int = ANN_POOL_SIZE,
) -> list[dict]:
    """
    Query RDS pgvector for the top N candidates closest to the JD query vector.

    Joins candidate_embeddings with Users (for Cognito sub) and candidate_profiles_ai.
    candidate_embeddings.user_id is Users.Id; candidateId in results is Users.CognitoSub
    so DynamoDB CANDIDATE#<sub> and the candidate app stay aligned.

    The raw_text stored in RDS is the masked CV text (PII already removed),
    safe to pass to the Cross-Encoder without privacy concerns.

    Returns list of dicts: candidateId, distance, biScore, seniority,
    yearsExperience, rawCvText (masked), matchingScore (from previous analysis)
    """
    if not RDS_SECRET_ARN:
        print("WARNING: RDS not configured. Skipping pgvector candidate search.")
        return []

    vector_literal = _build_vector_literal(query_vector)

    try:
        conn = _get_rds_connection()
        try:
            rows = conn.run(
                """
                SELECT
                    TRIM(u."CognitoSub")            AS cognito_sub,
                    (e.embedding <=> :vec::vector)  AS cosine_distance,
                    e.raw_text                      AS masked_cv_text,
                    p.seniority_estimate            AS seniority,
                    p.years_experience              AS years_experience,
                    p.matching_score                AS previous_score,
                    p.extracted_profile             AS profile_json
                FROM candidate_embeddings e
                INNER JOIN "Users" u ON u."Id" = e.user_id
                    AND u."CognitoSub" IS NOT NULL
                    AND TRIM(u."CognitoSub") <> ''
                LEFT JOIN candidate_profiles_ai p ON e.user_id = p.user_id
                ORDER BY cosine_distance ASC
                LIMIT :top_n;
                """,
                vec=vector_literal,
                top_n=top_n,
            )

            results = []
            for row in rows:
                (cognito_sub, cosine_distance, masked_cv_text,
                 seniority, years_exp, prev_score, profile_json) = row

                bi_score = max(0.0, round((1.0 - float(cosine_distance)) * 100, 2))

                # Parse extracted_profile JSON (stored as JSONB text in RDS)
                parsed_profile = {}
                if profile_json:
                    try:
                        parsed_profile = json.loads(profile_json) if isinstance(profile_json, str) else profile_json
                    except Exception:
                        pass

                results.append({
                    "candidateId": str(cognito_sub),
                    "distance": round(float(cosine_distance), 6),
                    "biScore": bi_score,
                    "maskedCvText": masked_cv_text or "",
                    "seniority": str(seniority) if seniority else "Unknown",
                    "yearsExperience": int(years_exp) if years_exp else 0,
                    "previousScore": float(prev_score) if prev_score else 0.0,
                    "parsedProfile": parsed_profile,
                })

            print(f"INFO: pgvector ANN returned {len(results)} candidate(s).")
            return results

        finally:
            conn.close()

    except Exception as exc:
        print(f"ERROR: pgvector candidate search failed: {exc}")
        return []
