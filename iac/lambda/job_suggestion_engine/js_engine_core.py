"""Job suggestion pipeline implementation (RDS, DynamoDB, Bedrock, cross-encoder)."""
import json
import math
import os
import re
import ssl
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from appsync_notifier import notify_candidate_job_suggestions

from js_clients import bedrock, dynamodb, secretsmanager
from js_config import *
from js_skill_canonical_ai import (
    canonicalize_required_skill_bundle,
    canonicalize_skills_batch,
    deterministic_canonical_key,
)
from js_skill_semantics import (
    resolve_semantic_skill_matches_with_confidence,
)

_rds_secret_cache: dict | None = None


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
    """Open a pg8000 connection to RDS. Caller is responsible for closing."""
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


def fetch_jd_text_from_rds(job_id: str) -> str:
    """Fallback source when JD text is missing in DynamoDB metadata."""
    if not RDS_SECRET_ARN:
        return ""
    try:
        conn = _get_rds_connection()
        try:
            rows = conn.run(
                'SELECT "Description" FROM "Jobs" WHERE "Id" = :jid::uuid LIMIT 1;',
                jid=str(job_id),
            )
            if not rows:
                return ""
            description = rows[0][0]
            return description.strip() if description else ""
        finally:
            conn.close()
    except Exception as exc:
        print(f"WARNING: RDS fallback JD fetch failed for job_id={job_id}: {exc}")
        return ""


def fetch_jd_metadata_from_rds(job_id: str) -> dict:
    """
    Fallback metadata source for candidate-facing job cards.
    Returns display fields used by candidate dashboard.
    """
    if not RDS_SECRET_ARN:
        return {}
    try:
        conn = _get_rds_connection()
        try:
            rows = conn.run(
                """
                SELECT j."Title", j."Location", j."EmploymentType", j."SalaryMin", j."SalaryMax", j."ExperienceLevel", c."Name"
                FROM "Jobs" j
                LEFT JOIN "RecruiterProfiles" rp ON j."RecruiterId" = rp."Id"
                LEFT JOIN "Companies" c ON rp."CompanyId" = c."Id"
                WHERE j."Id" = :jid::uuid
                LIMIT 1;
                """,
                jid=str(job_id),
            )
            if not rows:
                return {}
            title, location, employment_type, salary_min, salary_max, experience_level, company_name = rows[0]
            return {
                "jobTitle": (str(title).strip() if title else ""),
                "companyName": (str(company_name).strip() if company_name else ""),
                "location": (str(location).strip() if location else ""),
                "jobType": (str(employment_type).strip() if employment_type else ""),
                "experienceLevel": (str(experience_level).strip() if experience_level else ""),
                "salaryRange": _normalize_salary_range({
                    "min": salary_min,
                    "max": salary_max,
                    "currency": "USD" if (salary_min is not None or salary_max is not None) else None,
                }),
            }
        finally:
            conn.close()
    except Exception as exc:
        print(f"WARNING: RDS fallback metadata fetch failed for job_id={job_id}: {exc}")
        return {}


def backfill_job_metadata_to_dynamodb(job_id: str, metadata: dict) -> None:
    """
    Persist fallback RDS display metadata into JOB#<id>/METADATA so
    subsequent candidate suggestion reads are served from DynamoDB.
    """
    if not job_id or not metadata:
        return
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        now_iso = datetime.now(timezone.utc).isoformat()
        salary_payload = metadata.get("salaryRange")
        salary_ddb = None
        if isinstance(salary_payload, dict):
            min_val = salary_payload.get("min")
            max_val = salary_payload.get("max")
            currency_val = salary_payload.get("currency") or "USD"
            if min_val is not None or max_val is not None:
                lo = min_val if min_val is not None else max_val
                hi = max_val if max_val is not None else min_val
                salary_ddb = {
                    "min": Decimal(str(lo or 0)),
                    "max": Decimal(str(hi or 0)),
                    "currency": str(currency_val),
                }

        update_expression = (
            "SET updatedAt = :u, "
            "jobTitle = if_not_exists(jobTitle, :jt), "
            "companyName = if_not_exists(companyName, :cn), "
            "location = if_not_exists(location, :loc), "
            "jobType = if_not_exists(jobType, :jtp), "
            "employmentType = if_not_exists(employmentType, :jtp), "
            "experienceLevel = if_not_exists(experienceLevel, :exp)"
        )
        expr_values = {
            ":u": now_iso,
            ":jt": metadata.get("jobTitle", ""),
            ":cn": metadata.get("companyName", ""),
            ":loc": metadata.get("location", ""),
            ":jtp": metadata.get("jobType", ""),
            ":exp": metadata.get("experienceLevel", ""),
        }
        if salary_ddb is not None:
            update_expression += ", salaryRange = if_not_exists(salaryRange, :salary)"
            expr_values[":salary"] = salary_ddb

        table.update_item(
            Key={"PK": f"JOB#{str(job_id)}", "SK": "METADATA"},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expr_values,
        )
        print(f"INFO: Backfilled DynamoDB JOB metadata for job_id={job_id}")
    except Exception as exc:
        print(f"WARNING: Failed to backfill JOB metadata for {job_id}: {exc}")


# ---------------------------------------------------------------------------
# Step 2: Cohere Query Embedding (Asymmetric Search)
# ---------------------------------------------------------------------------

def get_cohere_document_embedding(text: str) -> list[float]:
    """Embed with input_type=search_document (same as CvJdProcessor) for pgvector storage."""
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
    Embed text using Cohere with input_type="search_query".

    IMPORTANT: This is intentionally different from the input_type="search_document"
    used when the CV vector was originally stored in pgvector.

    Cohere embed-v3 is trained for asymmetric search:
      - Documents (CVs, JDs) → embedded with "search_document"
      - Search queries → embedded with "search_query"

    When the candidate's CV is the *searcher* looking for matching jobs,
    the CV text should be re-embedded as a "search_query" so it aligns
    correctly with the job_embeddings (stored as "search_document").
    Using a fresh query embedding here gives materially better recall
    than reusing the stored document vector for ANN search.
    """
    normalized = normalize_matching_text(text, max_chars=2048) or "No content"
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


def _resolve_document_embedding(cv_vector: list[float] | None, masked_cv_text: str) -> list[float]:
    if cv_vector and len(cv_vector) == 1024:
        return cv_vector
    print("INFO: cv_vector missing or wrong length; embedding masked_cv_text as search_document.")
    return get_cohere_document_embedding(masked_cv_text)


def resolve_user_id_from_cognito_sub(profile_id: str) -> str | None:
    """Resolve internal Users.Id from Cognito sub for identity envelope persistence."""
    if not profile_id:
        return None
    try:
        conn = _get_rds_connection()
        try:
            rows = conn.run(
                """
                SELECT "Id"::text FROM "Users"
                WHERE "CognitoSub" = :sub
                LIMIT 1
                """,
                sub=str(profile_id).strip(),
            )
            if rows and rows[0][0]:
                return str(rows[0][0])
            return None
        finally:
            conn.close()
    except Exception as exc:
        print(f"WARNING: Failed to resolve Users.Id from CognitoSub={profile_id}: {exc}")
        return None


def upsert_candidate_vector_and_profile(
    profile_id: str,
    doc_vector: list[float],
    masked_cv_text: str,
    parsed_data: dict,
) -> None:
    """
    Persist candidate document embedding + AI profile to RDS for recruiter-side ANN
    (candidate_ranking_engine) and cross-encoder raw_text.

    RDS FK: candidate_embeddings.user_id → Users.Id. Event profile_id is Cognito sub;
    we resolve Users.Id via Users.CognitoSub before INSERT.
    """
    if not ENABLE_PGVECTOR_UPSERT or not RDS_SECRET_ARN:
        return
    if not doc_vector or len(doc_vector) != 1024:
        print("WARNING: Skip RDS upsert — invalid document embedding length.")
        return

    raw_trunc = (masked_cv_text or "")[:500000]
    vec_lit = _build_vector_literal(doc_vector)
    prof_json = json.dumps(parsed_data or {})

    seniority = parsed_data.get("seniority_estimate")
    if seniority is not None:
        seniority = str(seniority)[:20]

    years_raw = parsed_data.get("years_experience")
    years_val = None
    if years_raw is not None:
        try:
            years_val = int(years_raw)
        except (TypeError, ValueError):
            years_val = None

    ms_raw = parsed_data.get("matching_score")
    ms_val = None
    if ms_raw is not None:
        try:
            ms_val = float(ms_raw)
        except (TypeError, ValueError):
            ms_val = None

    conn = _get_rds_connection()
    try:
        user_rows = conn.run(
            """
            SELECT "Id"::text FROM "Users"
            WHERE "CognitoSub" = :sub
            LIMIT 1
            """,
            sub=str(profile_id).strip(),
        )
        if not user_rows or not user_rows[0][0]:
            print(
                f"WARNING: Skip RDS embedding upsert — no Users row with CognitoSub={profile_id!r} "
                "(sync Cognito users into Postgres Users.CognitoSub)."
            )
            return
        internal_user_id = str(user_rows[0][0])

        conn.run(
            """
            INSERT INTO candidate_embeddings (user_id, embedding, raw_text)
            VALUES (:uid::uuid, :vec::vector, :rtext)
            ON CONFLICT (user_id) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                raw_text = EXCLUDED.raw_text,
                updated_at = NOW();
            """,
            uid=internal_user_id,
            vec=vec_lit,
            rtext=raw_trunc,
        )
        conn.run(
            """
            INSERT INTO candidate_profiles_ai (
                user_id, extracted_profile, seniority_estimate, years_experience, matching_score
            )
            VALUES (
                :uid::uuid,
                :prof::jsonb,
                :sen,
                :yrs,
                :ms
            )
            ON CONFLICT (user_id) DO UPDATE SET
                extracted_profile = EXCLUDED.extracted_profile,
                seniority_estimate = EXCLUDED.seniority_estimate,
                years_experience = EXCLUDED.years_experience,
                matching_score = EXCLUDED.matching_score,
                updated_at = NOW();
            """,
            uid=internal_user_id,
            prof=prof_json,
            sen=seniority,
            yrs=years_val,
            ms=ms_val,
        )
        print(
            f"INFO: UPSERT candidate_embeddings + candidate_profiles_ai for Users.Id={internal_user_id} "
            f"(CognitoSub={profile_id})"
        )
    except Exception as exc:
        print(f"WARNING: RDS candidate UPSERT failed (non-fatal): {exc}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Step 3: pgvector ANN Search — Find Top N Matching Jobs
# ---------------------------------------------------------------------------

def search_matching_jobs(query_vector: list[float], top_n: int = ANN_CANDIDATE_POOL_SIZE) -> list[dict]:
    """
    Query RDS pgvector for the top N jobs closest to the candidate's query vector.

    Joins job_embeddings with Jobs table to get title and active status,
    filtering only is_active=true so candidates only see open positions.

    Returns list of dicts with: jobId, jobTitle, companyName, distance, biScore
    """
    if not RDS_SECRET_ARN:
        print("WARNING: RDS not configured. Skipping pgvector ANN search.")
        return []

    vector_literal = _build_vector_literal(query_vector)

    try:
        conn = _get_rds_connection()
        try:
            rows = conn.run(
                """
                SELECT
                    j."Id"          AS job_id,
                    j."Title"       AS job_title,
                    c."Name"        AS company_name,
                    (e.embedding <=> :vec::vector) AS cosine_distance
                FROM job_embeddings e
                JOIN "Jobs" j ON e.job_id = j."Id"
                JOIN "RecruiterProfiles" rp ON j."RecruiterId" = rp."Id"
                LEFT JOIN "Companies" c ON rp."CompanyId" = c."Id"
                ORDER BY cosine_distance ASC
                LIMIT :top_n;
                """,
                vec=vector_literal,
                top_n=top_n,
            )

            results = []
            for row in rows:
                job_id, job_title, company_name, cosine_distance = row
                bi_score = max(0.0, round((1.0 - float(cosine_distance)) * 100, 2))
                results.append({
                    "jobId": str(job_id),
                    "jobTitle": str(job_title),
                    "companyName": str(company_name) if company_name else "Unknown Company",
                    "distance": round(float(cosine_distance), 6),
                    "biScore": bi_score,
                })

            print(f"INFO: pgvector ANN returned {len(results)} job match(es).")
            return results

        finally:
            conn.close()

    except Exception as exc:
        print(f"ERROR: pgvector job search failed: {exc}")
        return []


# ---------------------------------------------------------------------------
# Step 4: Fetch JD Metadata from DynamoDB
# ---------------------------------------------------------------------------

def fetch_jd_details(job_id: str) -> dict:
    """
    Fetch the JD text, required skills, and seniority from DynamoDB.

    Single-table design on application_tracking: PK=JOB#<id>, SK=METADATA
    (same table as CV status and job suggestions).

    Returns empty dict if not found (job will be excluded from suggestions).
    """
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        response = table.get_item(
            Key={"PK": f"JOB#{str(job_id)}", "SK": "METADATA"}
        )
        item = response.get("Item")
        if item:
            jd_text = item.get("jdText") or item.get("description") or ""
            if not jd_text:
                jd_text = fetch_jd_text_from_rds(job_id)
            result = {
                "jdText": jd_text,
                "jobTitle": item.get("jobTitle", ""),
                "companyName": item.get("companyName", ""),
                "requiredSkills": item.get("requiredSkills", []) or item.get("required_skills", []),
                "requiredSkillGroups": item.get("requiredSkillGroups", {}),
                "seniority": item.get("seniority", ""),
                "parseStatus": item.get("parseStatus", ""),
                "location": item.get("location") or item.get("jobLocation") or "",
                "jobType": item.get("jobType") or item.get("employmentType") or "",
                "salaryRange": _normalize_salary_range(item.get("salaryRange")),
            }
            needs_backfill = (
                not result.get("location")
                or not result.get("jobType")
                or not result.get("salaryRange")
                or not item.get("jobTitle")
                or not item.get("companyName")
            )
            if needs_backfill:
                rds_meta = fetch_jd_metadata_from_rds(job_id)
                if rds_meta:
                    if not result.get("jobTitle"):
                        result["jobTitle"] = rds_meta.get("jobTitle", "")
                    if not result.get("companyName"):
                        result["companyName"] = rds_meta.get("companyName", "")
                    if not result.get("location"):
                        result["location"] = rds_meta.get("location", "")
                    if not result.get("jobType"):
                        result["jobType"] = rds_meta.get("jobType", "")
                    if not result.get("salaryRange"):
                        result["salaryRange"] = rds_meta.get("salaryRange")
                    # Persist for future read path consistency.
                    backfill_job_metadata_to_dynamodb(job_id, rds_meta)
            return result
    except Exception as exc:
        print(f"WARNING: Failed to fetch JD details for {job_id}: {exc}")

    rds_meta = fetch_jd_metadata_from_rds(job_id)
    if rds_meta:
        backfill_job_metadata_to_dynamodb(job_id, rds_meta)
    return {
        "jdText": fetch_jd_text_from_rds(job_id),
        "jobTitle": rds_meta.get("jobTitle", "") if rds_meta else "",
        "companyName": rds_meta.get("companyName", "") if rds_meta else "",
        "requiredSkills": [],
        "seniority": "",
        "parseStatus": "",
        "location": rds_meta.get("location", "") if rds_meta else "",
        "jobType": rds_meta.get("jobType", "") if rds_meta else "",
        "salaryRange": rds_meta.get("salaryRange") if rds_meta else None,
    }


def _create_cv_chunks(cv_text: str) -> list[str]:
    chunks = []
    step = max(1, CROSS_ENCODER_CHUNK_CHARS - CROSS_ENCODER_OVERLAP_CHARS)
    start = 0
    while start < len(cv_text) and len(chunks) < CROSS_ENCODER_MAX_CHUNKS:
        end = start + CROSS_ENCODER_CHUNK_CHARS
        # Extend the final chunk to cover the last few chars instead of leaving
        # a tail (e.g. 67 chars after chunk[5] for a 3817-char CV).
        if end >= len(cv_text) or len(chunks) == CROSS_ENCODER_MAX_CHUNKS - 1:
            end = len(cv_text)
        chunk = cv_text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(cv_text):
            break
        start += step
    return chunks


def _aggregate_chunk_scores(normalized_scores: list[float]) -> tuple[float, dict]:
    """
    Aggregate per-chunk cross-encoder scores into a single score.
    Returns (aggregated_score, distribution_stats).
    distribution_stats keys: min, mean, max, count — useful for diagnostics
    to distinguish "genuinely low" vs "one good chunk dragged down by noise".
    """
    if not normalized_scores:
        return 0.0, {"min": None, "mean": None, "max": None, "count": 0}
    top_k = sorted(normalized_scores, reverse=True)[:CROSS_ENCODER_TOP_K]
    raw_weights = TOP_K_WEIGHTS[: len(top_k)]
    weight_sum = sum(raw_weights)
    weights = [w / weight_sum for w in raw_weights]
    aggregated = sum(score * weight for score, weight in zip(top_k, weights))
    stats = {
        "min": round(min(normalized_scores) * 100, 2),
        "mean": round(sum(normalized_scores) / len(normalized_scores) * 100, 2),
        "max": round(max(normalized_scores) * 100, 2),
        "count": len(normalized_scores),
    }
    return aggregated, stats


def _safe_score_value(score: float | None) -> float | None:
    if score is None:
        return None
    return max(0.0, min(100.0, round(float(score), 2)))


def _safe_required_skills(skills: object) -> list[str]:
    if isinstance(skills, list):
        return [str(s) for s in skills if str(s).strip()]
    return []


def _decimal_to_jsonable(value: object):
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    if isinstance(value, dict):
        return {str(k): _decimal_to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_decimal_to_jsonable(v) for v in value]
    if isinstance(value, tuple):
        return [_decimal_to_jsonable(v) for v in value]
    return value


def _coerce_float(value: object) -> float | None:
    safe = _decimal_to_jsonable(value)
    if isinstance(safe, (int, float)):
        return float(safe)
    if isinstance(safe, str):
        try:
            return float(safe)
        except ValueError:
            return None
    return None


def _normalize_salary_range(raw: object) -> dict | None:
    if not isinstance(raw, dict):
        return None
    min_value = _coerce_float(raw.get("min"))
    max_value = _coerce_float(raw.get("max"))
    currency_raw = raw.get("currency")
    currency = str(currency_raw).strip() if currency_raw is not None else ""
    if min_value is None and max_value is None and not currency:
        return None
    return {
        "min": min_value,
        "max": max_value,
        "currency": currency or None,
    }


def _collapse_spaces(text: str) -> str:
    return " ".join((text or "").split())


def normalize_matching_text(text: str, max_chars: int = 12000) -> str:
    """Normalize free-form JD/CV text for embedding and cross-encoder stability."""
    if not text:
        return ""
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = re.sub(r"`{3,}.*?`{3,}", " ", cleaned, flags=re.S)
    cleaned = re.sub(r"(^|\n)\s{0,3}#{1,6}\s*", r"\1", cleaned)
    cleaned = re.sub(r"[*_~`>#-]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = _collapse_spaces(cleaned)
    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars]
    return cleaned.strip()


def _extract_priority_sections(text: str, keywords: list[str], max_chars: int = 4000) -> str:
    if not text:
        return ""
    lines = [line.strip() for line in text.replace("\r\n", "\n").split("\n")]
    if not lines:
        return ""
    sections: list[str] = []
    capture: list[str] = []
    in_target = False
    kw = [k.casefold() for k in keywords]
    for line in lines:
        low = line.casefold()
        heading_like = (
            len(line) <= 120
            and bool(re.search(
                r"(skill|requirement|qualification|experience|project|technology|technical"
                r"|background|looking for|you (will|have|bring|need|must)|we (are looking|need|want|require)"
                r"|responsibility|responsibilit|what you|who you are|about you"
                r"|key (skill|requirement|qualif|responsib)|must.have|nice.to.have"
                r"|yêu cầu|kỹ năng|trình độ|kinh nghiệm|bằng cấp)",
                low,
            ))
        )
        if heading_like:
            if in_target and capture:
                sections.append("\n".join(capture).strip())
                capture = []
            in_target = any(k in low for k in kw)
        if in_target and line:
            capture.append(line)
        if in_target and not line and capture:
            sections.append("\n".join(capture).strip())
            capture = []
            in_target = False
    if in_target and capture:
        sections.append("\n".join(capture).strip())
    out = "\n\n".join(s for s in sections if s)
    return out[:max_chars]


def build_jd_query_text(jd_text: str) -> str:
    normalized = normalize_matching_text(jd_text, max_chars=12000)
    prioritized = _extract_priority_sections(
        normalized,
        keywords=[
            # English — traditional
            "requirement", "technical skill", "qualification", "must have",
            "job description",
            # English — modern job post style
            "looking for", "you will", "you have", "you bring", "you need",
            "you must", "we are looking", "we need", "we want", "we require",
            "background", "about you", "who you are", "what you",
            "key skill", "key requirement", "key qualif", "key responsib",
            "responsibility", "responsibilit",
            "nice to have", "nice-to-have",
            # Vietnamese
            "yêu cầu", "kỹ năng", "trình độ", "kinh nghiệm", "bằng cấp",
        ],
        max_chars=4500,
    )
    if prioritized:
        merged = f"{prioritized}\n\n{normalized}"
    else:
        merged = normalized
    return merged[:6000]


def build_cv_query_text(cv_text: str) -> str:
    normalized = normalize_matching_text(cv_text, max_chars=16000)
    prioritized = _extract_priority_sections(
        normalized,
        keywords=["technical skills", "skills", "experience", "projects", "work experience"],
        max_chars=5000,
    )
    if prioritized:
        merged = f"{prioritized}\n\n{normalized}"
    else:
        merged = normalized
    return merged[:8000]


def normalize_skill_list(skills: list[object], max_items: int = 30) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in skills or []:
        label = _collapse_spaces(str(raw).strip())
        if not label:
            continue
        key = label.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(label)
        if len(normalized) >= max_items:
            break
    return normalized


def _js_auxiliary_skill_strings(parsed_data: dict) -> list[object]:
    out: list[object] = []
    projects = parsed_data.get("projects") or []
    if isinstance(projects, list):
        for p in projects[:16]:
            if not isinstance(p, dict):
                continue
            st = p.get("stack") or []
            if isinstance(st, list):
                out.extend(st)
    rs = parsed_data.get("recency_signals")
    if isinstance(rs, dict):
        st = rs.get("recent_primary_stack") or []
        if isinstance(st, list):
            out.extend(st)
    certs = parsed_data.get("certifications")
    if isinstance(certs, list):
        out.extend(certs)
    dom = parsed_data.get("domain_experience")
    if isinstance(dom, list):
        out.extend(dom)
    return out


def _js_flatten_skill_groups(parsed_data: dict) -> list[object]:
    """Flatten skill_groups dynamic dict — any domain AI creates."""
    sg = parsed_data.get("skill_groups")
    if not isinstance(sg, dict):
        return []
    out: list[object] = []
    for group_skills in sg.values():
        if isinstance(group_skills, list):
            out.extend(group_skills)
    return out


def extract_candidate_skills_from_parsed_data(parsed_data: dict) -> list[str]:
    buckets = [
        parsed_data.get("frontend_skills", []),
        parsed_data.get("backend_skills", []),
        parsed_data.get("devops_skills", []),
        parsed_data.get("data_skills", []),
        parsed_data.get("ai_skills", []),
        parsed_data.get("soft_skills", []),
        parsed_data.get("skills", []),
        _js_flatten_skill_groups(parsed_data),   # dynamic domain groups
        _js_auxiliary_skill_strings(parsed_data),
    ]
    combined: list[object] = []
    for bucket in buckets:
        if isinstance(bucket, list):
            combined.extend(bucket)
    return normalize_skill_list(combined, max_items=MAX_CANDIDATE_SKILLS)


_SKILL_GAP_STOPWORDS = frozenset(
    {"and", "or", "the", "for", "with", "using", "via", "to", "of", "in", "on", "a", "an"}
)


def _skill_gap_tokens(s: str) -> set[str]:
    out: set[str] = set()
    for m in re.finditer(r"[a-z0-9][a-z0-9+#./&]*", s, flags=re.I):
        t = m.group(0).casefold()
        if len(t) < 2 or t in _SKILL_GAP_STOPWORDS:
            continue
        out.add(t)
    return out


def _gap_phrase_or_substring(req: str, cand_list: list[str]) -> bool:
    r = " ".join((req or "").split()).casefold()
    if len(r) < 4:
        return False
    for c in cand_list:
        cn = " ".join((str(c) or "").split()).casefold()
        if not cn:
            continue
        if " " in r:
            if r in cn or cn in r:
                return True
        elif len(r) >= 5 and (r in cn or cn in r):
            return True
        elif len(r) == 4 and r in cn:
            if r == "java" and "script" in cn:
                continue
            return True
    return False


def _gap_token_union(req: str, cand_list: list[str]) -> bool:
    req_t = _skill_gap_tokens(req)
    if len(req_t) < 2:
        return False
    union: set[str] = set()
    for c in cand_list:
        union |= _skill_gap_tokens(str(c))
    return req_t <= union


def _gap_fuzzy_matched(req: str, cand_list: list[str]) -> bool:
    if not ENABLE_SKILL_GAP_FUZZY or not cand_list:
        return False
    return _gap_phrase_or_substring(req, cand_list) or _gap_token_union(req, cand_list)


def _parse_json_safe(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        return {}


def _safe_percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    p = max(0.0, min(100.0, float(percentile)))
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (p / 100.0) * (len(ordered) - 1)
    low = int(math.floor(rank))
    high = int(math.ceil(rank))
    if low == high:
        return ordered[low]
    weight = rank - low
    return ordered[low] * (1.0 - weight) + ordered[high] * weight


def resolve_score_threshold(final_scores: list[float]) -> float:
    """
    Dynamic thresholding for small pools:
    - large pool: keep configured MIN_SCORE_THRESHOLD
    - small pool: blend with percentile-based floor
    """
    base = float(MIN_SCORE_THRESHOLD)
    if not DYNAMIC_THRESHOLD_ENABLED:
        return base
    if len(final_scores) >= max(1, DYNAMIC_THRESHOLD_MIN_POOL):
        return base
    pct = _safe_percentile(final_scores, DYNAMIC_THRESHOLD_PERCENTILE)
    dynamic = max(float(DYNAMIC_THRESHOLD_FLOOR), pct)
    return round(min(base, dynamic), 2)


def classify_score_band(score: float) -> str:
    if score < 40:
        return "low"
    if score < 70:
        return "medium"
    return "high"


def extract_required_skills_from_jd_ai(jd_text: str, job_title: str = "") -> list[str]:
    if not jd_text or not jd_text.strip():
        return []

    prompt = f"""Extract required skills from this job description.
Return strict JSON only in this shape:
{{"required_skills":["skill1","skill2"]}}

Rules:
- Include technical and core domain skills only.
- No explanation text.
- Keep concise labels.
- Max {MAX_REQUIRED_SKILLS} skills.

Job title: {job_title or "Unknown"}
Job description:
{jd_text[:6000]}
"""
    payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 300,
        "temperature": 0,
        "messages": [{"role": "user", "content": prompt}],
    }
    try:
        response = bedrock.invoke_model(
            modelId=CLAUDE_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload),
        )
        response_data = json.loads(response.get("body").read())
        text = response_data.get("content", [{}])[0].get("text", "")
        parsed = _parse_json_safe(text)
        return normalize_skill_list(parsed.get("required_skills", []), max_items=MAX_REQUIRED_SKILLS)
    except Exception as exc:
        print(f"WARNING: Required-skill extraction failed for JD text: {exc}")
        return []


def extract_required_skill_groups_from_jd_ai(jd_text: str, job_title: str = "") -> dict[str, list]:
    """
    Build grouped requirements for better semantic gap scoring.
    """
    if not jd_text or not jd_text.strip():
        return {"must_have": [], "one_of": [], "nice_to_have": []}

    prompt = f"""Extract grouped skill requirements from this job description.
Return strict JSON only in this shape:
{{
  "must_have": ["skill"],
  "one_of": [{{"label":"group name","options":["skill1","skill2"]}}],
  "nice_to_have": ["skill"]
}}

Rules:
- Technical and core domain skills only.
- `must_have`: explicit mandatory capabilities.
- `one_of`: alternatives where one option is enough.
- `nice_to_have`: optional bonuses.
- Keep concise labels.
- Max {MAX_REQUIRED_SKILLS} total distinct skill strings across all groups.

Job title: {job_title or "Unknown"}
Job description:
{jd_text[:6000]}
"""
    payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 500,
        "temperature": 0,
        "messages": [{"role": "user", "content": prompt}],
    }
    try:
        response = bedrock.invoke_model(
            modelId=CLAUDE_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload),
        )
        response_data = json.loads(response.get("body").read())
        parsed = _parse_json_safe(response_data.get("content", [{}])[0].get("text", ""))
    except Exception as exc:
        print(f"WARNING: Required-group extraction failed for JD text: {exc}")
        parsed = {}

    must = normalize_skill_list(parsed.get("must_have", []), max_items=MAX_REQUIRED_SKILLS)
    nice = normalize_skill_list(parsed.get("nice_to_have", []), max_items=MAX_REQUIRED_SKILLS)
    one_of_raw = parsed.get("one_of", [])
    one_of: list[dict] = []
    if isinstance(one_of_raw, list):
        for item in one_of_raw[:10]:
            if not isinstance(item, dict):
                continue
            opts = normalize_skill_list(item.get("options", []), max_items=8)
            if not opts:
                continue
            label = _collapse_spaces(str(item.get("label", "")).strip()) or "One-of group"
            one_of.append({"label": label, "options": opts})
    return {"must_have": must, "one_of": one_of, "nice_to_have": nice}


def flatten_required_skills(required_skills: list[str], required_groups: dict | None = None) -> list[str]:
    out = normalize_skill_list(required_skills or [], max_items=MAX_REQUIRED_SKILLS)
    if not isinstance(required_groups, dict):
        return out
    merged: list[object] = list(out)
    merged.extend(required_groups.get("must_have", []) or [])
    merged.extend(required_groups.get("nice_to_have", []) or [])
    one_of = required_groups.get("one_of", [])
    if isinstance(one_of, list):
        for group in one_of:
            if isinstance(group, dict):
                merged.extend(group.get("options", []) or [])
    return normalize_skill_list(merged, max_items=MAX_REQUIRED_SKILLS)


def _canonical_skill_key(skill: str) -> str:
    """Deterministic key shared with AI canonicalizer fallbacks."""
    return deterministic_canonical_key(str(skill or ""))


def _build_candidate_skill_map(candidate_skills: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for skill in normalize_skill_list(candidate_skills, max_items=MAX_CANDIDATE_SKILLS):
        key = _canonical_skill_key(skill)
        if key and key not in mapping:
            mapping[key] = skill
    return mapping


def _normalize_required_groups(required_skills: list[str], required_groups: dict | None) -> dict[str, list]:
    groups = required_groups if isinstance(required_groups, dict) else {}
    must = normalize_skill_list(groups.get("must_have", []), max_items=MAX_REQUIRED_SKILLS)
    nice = normalize_skill_list(groups.get("nice_to_have", []), max_items=MAX_REQUIRED_SKILLS)
    one_of_raw = groups.get("one_of", []) if isinstance(groups.get("one_of", []), list) else []

    one_of: list[dict] = []
    for group in one_of_raw[:10]:
        if not isinstance(group, dict):
            continue
        options = normalize_skill_list(group.get("options", []), max_items=8)
        if not options:
            continue
        label = _collapse_spaces(str(group.get("label", "")).strip()) or "One-of group"
        one_of.append({"label": label, "options": options})

    if not must and required_skills:
        must = normalize_skill_list(required_skills, max_items=MAX_REQUIRED_SKILLS)
    return {"must_have": must, "one_of": one_of, "nice_to_have": nice}


def _evaluate_skill_match(
    skill: str,
    candidate_list: list[str],
    candidate_map: dict[str, str],
    semantic_conf: dict[str, dict[str, object]],
) -> dict[str, object]:
    canon = _canonical_skill_key(skill)
    if canon in candidate_map:
        return {"status": "full", "candidate": candidate_map[canon], "confidence": 1.0}
    if _gap_fuzzy_matched(skill, candidate_list):
        return {"status": "full", "candidate": skill, "confidence": 1.0}

    sem = semantic_conf.get(skill.casefold(), {})
    confidence = float(sem.get("confidence") or 0.0) if isinstance(sem, dict) else 0.0
    if confidence >= SKILL_SIM_FULL_MATCH:
        return {"status": "full", "candidate": sem.get("candidate"), "confidence": confidence}
    if confidence >= SKILL_SIM_PARTIAL:
        return {"status": "partial", "candidate": sem.get("candidate"), "confidence": confidence}
    if confidence >= SKILL_SIM_WEAK:
        return {"status": "weak", "candidate": sem.get("candidate"), "confidence": confidence}
    return {"status": "none", "candidate": None, "confidence": confidence}


def _redistribute_skill_weights(one_of_total: int, nice_total: int) -> dict[str, float]:
    must_w = SKILL_WEIGHT_MUST
    one_of_w = SKILL_WEIGHT_ONE_OF
    nice_w = SKILL_WEIGHT_NICE
    if one_of_total <= 0:
        if nice_total <= 0:
            return {"must": 1.0, "one_of": 0.0, "nice": 0.0}
        denom = must_w + nice_w
        if denom <= 0:
            return {"must": 1.0, "one_of": 0.0, "nice": 0.0}
        return {"must": must_w / denom, "one_of": 0.0, "nice": nice_w / denom}
    total = must_w + one_of_w + nice_w
    if total <= 0:
        return {"must": 0.6, "one_of": 0.25, "nice": 0.15}
    return {"must": must_w / total, "one_of": one_of_w / total, "nice": nice_w / total}


def compute_skill_gap(
    required_skills: list[str],
    candidate_skills: list[str],
    required_groups: dict | None = None,
    skill_profile: dict[str, list[str]] | None = None,
) -> dict:
    grouped = _normalize_required_groups(required_skills, required_groups)
    candidate = normalize_skill_list(candidate_skills, max_items=MAX_CANDIDATE_SKILLS)
    candidate_map = _build_candidate_skill_map(candidate)

    semantic_required: list[str] = []
    semantic_required.extend(grouped["must_have"])
    semantic_required.extend(grouped["nice_to_have"])
    for group in grouped["one_of"]:
        semantic_required.extend(group.get("options", []))
    semantic_conf = resolve_semantic_skill_matches_with_confidence(semantic_required, candidate)

    matched: list[str] = []
    missing: list[str] = []
    partial: list[str] = []
    weak_signals: list[str] = []
    by_group_match = {"must": [], "oneOf": [], "nice": []}
    by_group_missing = {"must": [], "oneOf": [], "nice": []}

    must_total = len(grouped["must_have"])
    must_matched = 0
    for skill in grouped["must_have"]:
        result = _evaluate_skill_match(skill, candidate, candidate_map, semantic_conf)
        if result["status"] == "full":
            must_matched += 1
            matched.append(skill)
            by_group_match["must"].append(skill)
        else:
            missing.append(skill)
            by_group_missing["must"].append(skill)
            if result["status"] == "weak":
                weak_signals.append(skill)

    nice_total = len(grouped["nice_to_have"])
    nice_full = 0
    nice_partial = 0
    for skill in grouped["nice_to_have"]:
        result = _evaluate_skill_match(skill, candidate, candidate_map, semantic_conf)
        if result["status"] == "full":
            nice_full += 1
            matched.append(skill)
            by_group_match["nice"].append(skill)
        elif result["status"] == "partial":
            nice_partial += 1
            partial.append(skill)
            by_group_match["nice"].append(f"{skill} (related)")
        else:
            missing.append(skill)
            by_group_missing["nice"].append(skill)
            if result["status"] == "weak":
                weak_signals.append(skill)

    matched_groups: list[str] = []
    missing_groups: list[str] = []
    one_of_total = len(grouped["one_of"])
    one_of_satisfied = 0
    for group in grouped["one_of"]:
        label = str(group.get("label") or "One-of group")
        options = normalize_skill_list(group.get("options", []), max_items=10)
        satisfied = False
        for option in options:
            result = _evaluate_skill_match(option, candidate, candidate_map, semantic_conf)
            if result["status"] == "full":
                satisfied = True
                break
            if result["status"] == "weak":
                weak_signals.append(option)
        if satisfied:
            one_of_satisfied += 1
            matched_groups.append(label)
            by_group_match["oneOf"].append(label)
        else:
            missing_groups.append(label)
            by_group_missing["oneOf"].append(label)

    coverage_must = round((must_matched / must_total) * 100, 2) if must_total > 0 else 100.0
    coverage_one_of = (
        round((one_of_satisfied / one_of_total) * 100, 2) if one_of_total > 0 else None
    )
    coverage_nice = (
        round(((nice_full + (SKILL_NICE_PARTIAL_CREDIT * nice_partial)) / nice_total) * 100, 2)
        if nice_total > 0
        else 100.0
    )

    weights = _redistribute_skill_weights(one_of_total, nice_total)
    skill_composite = (
        (weights["must"] * coverage_must)
        + (weights["one_of"] * (coverage_one_of if coverage_one_of is not None else 0.0))
        + (weights["nice"] * coverage_nice)
    )
    score = round(skill_composite, 2)
    required_flat = normalize_skill_list(
        grouped["must_have"] + grouped["nice_to_have"],
        max_items=MAX_REQUIRED_SKILLS,
    )
    return {
        "requiredSkills": required_flat,
        "matchedSkills": matched,
        "missingSkills": missing,
        "partialSkills": partial,
        "weakSignalSkills": normalize_skill_list(weak_signals, max_items=MAX_REQUIRED_SKILLS),
        "skillGapScore": score,
        "skillCoverageMust": coverage_must,
        "skillCoverageOneOf": coverage_one_of,
        "skillCoverageNice": coverage_nice,
        "skillCompositeScore": score,
        "matchedGroups": matched_groups,
        "missingGroups": missing_groups,
        "skillSummary": {
            "schemaVersion": SKILL_SUMMARY_SCHEMA_VERSION,
            "required": {
                "must": grouped["must_have"],
                "oneOfGroups": grouped["one_of"],
                "nice": grouped["nice_to_have"],
            },
            "candidate": {
                "normalized": candidate,
                "hardSkills": (skill_profile or {}).get("hardSkills", candidate),
                "processSkills": (skill_profile or {}).get("processSkills", []),
                "softSkills": (skill_profile or {}).get("softSkills", []),
                "domainExpertise": (skill_profile or {}).get("domainExpertise", []),
            },
            "match": by_group_match,
            "missing": by_group_missing,
            "coverage": {
                "must": coverage_must,
                "oneOf": coverage_one_of,
                "nice": coverage_nice,
                "oneOfSatisfiedCount": one_of_satisfied,
                "oneOfTotalCount": one_of_total,
            },
            "weightsApplied": weights,
        },
    }


def patch_job_required_skills(
    job_id: str,
    required_skills: list[str],
    required_skill_groups: dict | None = None,
) -> None:
    if not job_id or not required_skills:
        return
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        update_expr = "SET requiredSkills = :skills, updatedAt = :u"
        expr_values = {
            ":skills": required_skills,
            ":u": datetime.now(timezone.utc).isoformat(),
        }
        if required_skill_groups:
            update_expr += ", requiredSkillGroups = :groups"
            expr_values[":groups"] = required_skill_groups
        table.update_item(
            Key={"PK": f"JOB#{str(job_id)}", "SK": "METADATA"},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values,
        )
    except Exception as exc:
        print(f"WARNING: Failed to patch requiredSkills for JOB#{job_id}: {exc}")


def fetch_candidate_skills_from_dynamodb(
    profile_id: str, file_key: str | None
) -> tuple[list[str], dict[str, list[str]]]:
    """Fetch candidate skill profile from DynamoDB.

    Returns (flat_skills_for_matching, skill_profile_dict) where:
      - flat_skills_for_matching = hardSkills + processSkills (used in compute_skill_gap)
      - skill_profile_dict = {hardSkills, processSkills, softSkills, domainExpertise}

    Read order:
      1. SK="METADATA"  — written by CJP after every CV parse (canonical, always up-to-date)
      2. SK="CV#{file_key}" — legacy fallback for older records without METADATA row
    """
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)

        # Primary: METADATA row (new schema: hardSkills + processSkills + softSkills + domainExpertise)
        meta_resp = table.get_item(
            Key={"PK": f"CANDIDATE#{profile_id}", "SK": "METADATA"}
        )
        meta_item = meta_resp.get("Item", {})
        if meta_item:
            hard = normalize_skill_list(meta_item.get("hardSkills", []), max_items=MAX_CANDIDATE_SKILLS)
            process = normalize_skill_list(meta_item.get("processSkills", []), max_items=50)
            soft = normalize_skill_list(meta_item.get("softSkills", []), max_items=20)
            domain = normalize_skill_list(meta_item.get("domainExpertise", []), max_items=20)
            # Backward compat: if new fields absent but legacy candidateSkills present, use it
            if not hard and not process and meta_item.get("candidateSkills"):
                legacy = normalize_skill_list(meta_item["candidateSkills"], max_items=MAX_CANDIDATE_SKILLS)
                return legacy, {"hardSkills": legacy, "processSkills": [], "softSkills": [], "domainExpertise": []}
            if hard or process:
                flat = normalize_skill_list(hard + process, max_items=MAX_CANDIDATE_SKILLS)
                return flat, {"hardSkills": hard, "processSkills": process, "softSkills": soft, "domainExpertise": domain}

        # Fallback: CV row (legacy)
        if file_key:
            cv_resp = table.get_item(
                Key={"PK": f"CANDIDATE#{profile_id}", "SK": f"CV#{file_key}"}
            )
            cv_item = cv_resp.get("Item", {})
            if cv_item and cv_item.get("candidateSkills"):
                legacy = normalize_skill_list(cv_item["candidateSkills"], max_items=MAX_CANDIDATE_SKILLS)
                return legacy, {"hardSkills": legacy, "processSkills": [], "softSkills": [], "domainExpertise": []}

        return [], {}
    except Exception as exc:
        print(f"WARNING: Failed to fetch candidateSkills metadata: {exc}")
        return [], {}


def patch_candidate_skills(
    profile_id: str,
    file_key: str | None,
    candidate_skills: list[str],
    skill_profile: dict[str, list[str]] | None = None,
) -> None:
    """Patch candidate skill fields in DynamoDB METADATA row.

    If skill_profile provided (new schema), write 4 fields.
    Otherwise fall back to legacy candidateSkills write.
    """
    if not candidate_skills:
        return
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        if skill_profile and (skill_profile.get("hardSkills") or skill_profile.get("processSkills")):
            table.update_item(
                Key={"PK": f"CANDIDATE#{profile_id}", "SK": "METADATA"},
                UpdateExpression=(
                    "SET hardSkills = :hs, processSkills = :ps, "
                    "softSkills = :ss, domainExpertise = :de, updatedAt = :u"
                ),
                ExpressionAttributeValues={
                    ":hs": skill_profile.get("hardSkills", []),
                    ":ps": skill_profile.get("processSkills", []),
                    ":ss": skill_profile.get("softSkills", []),
                    ":de": skill_profile.get("domainExpertise", []),
                    ":u": datetime.now(timezone.utc).isoformat(),
                },
            )
        elif file_key:
            # Legacy fallback
            table.update_item(
                Key={"PK": f"CANDIDATE#{profile_id}", "SK": f"CV#{file_key}"},
                UpdateExpression="SET candidateSkills = :skills, updatedAt = :u",
                ExpressionAttributeValues={
                    ":skills": candidate_skills,
                    ":u": datetime.now(timezone.utc).isoformat(),
                },
            )
    except Exception as exc:
        print(f"WARNING: Failed to patch candidateSkills metadata for {profile_id}/{file_key}: {exc}")


# ---------------------------------------------------------------------------
# Step 5: Cross-Encoder Re-Ranking
# ---------------------------------------------------------------------------

_cross_encoder_instance = None
_cross_encoder_unavailable_reason = CE_FALLBACK_REASONS["NONE"]


def _get_cross_encoder():
    """Load CrossEncoder model singleton. Returns None on failure (non-fatal)."""
    global _cross_encoder_instance, _cross_encoder_unavailable_reason

    if _cross_encoder_instance is not None:
        _cross_encoder_unavailable_reason = CE_FALLBACK_REASONS["CACHE_HIT"]
        return _cross_encoder_instance

    if not ENABLE_CROSS_ENCODER:
        _cross_encoder_unavailable_reason = CE_FALLBACK_REASONS["DISABLED_BY_FLAG"]
        return None

    try:
        from sentence_transformers import CrossEncoder  # type: ignore

        tmp_cache = "/tmp/cross_encoder_model"

        if os.path.isdir(CROSS_ENCODER_BAKED_PATH):
            path = CROSS_ENCODER_BAKED_PATH
        elif os.path.isdir(tmp_cache):
            path = tmp_cache
        else:
            print("INFO: Downloading cross-encoder (one-time cold-start cost).")
            os.environ["HF_HOME"] = "/tmp/hf_home"
            m = CrossEncoder(CROSS_ENCODER_MODEL_ID, max_length=512)
            m.save(tmp_cache)
            del m
            path = tmp_cache

        _cross_encoder_instance = CrossEncoder(path, max_length=512)
        print("INFO: Cross-encoder ready.")
        _cross_encoder_unavailable_reason = CE_FALLBACK_REASONS["NONE"]
        return _cross_encoder_instance

    except Exception as exc:
        print(f"WARNING: Cross-encoder unavailable: {exc}")
        _cross_encoder_unavailable_reason = CE_FALLBACK_REASONS["MODEL_ERROR"]
        return None


def _calibrated_sigmoid(logit: float, shift: float = CE_SIGMOID_SHIFT, scale: float = CE_SIGMOID_SCALE) -> float:
    """
    Calibrated sigmoid for ms-marco-MiniLM-L-6-v2.

    shift=-1.0: Treats logit=1 as the 50% neutral point, aligning with
                MS-MARCO's training distribution where logit ~1 means
                borderline relevant. Raw sigmoid treats logit=0 as neutral,
                which underscores all relevant passages.
    scale=1.5:  Stretches the curve so the useful logit range [-2, +5]
                maps more evenly across [0%, 100%].
    """
    x = (logit - shift) * scale
    x = max(-500.0, min(500.0, x))
    return 1.0 / (1.0 + math.exp(-x))


def cross_encode_cv_vs_jobs(
    masked_cv_text: str,
    candidates: list[dict],
) -> list[dict]:
    """
    Re-rank candidate job matches using Cross-Encoder (batched).

    For the suggestion engine (CV searching for JDs), we flip the pair order
    compared to cv_parser: the JD text is the "query" and the CV is the
    "passage". This is consistent with how ms-marco was trained: the query
    is the information need, and the passage is the document being evaluated.

    All (jd_query, cv_chunk) pairs across ALL jobs are collected into a
    single ce.predict() batch call to avoid per-job overhead that previously
    caused the latency budget to exhaust after scoring only the first job.

    Returns the input list with crossScore added to each item.
    """
    ce = _get_cross_encoder()
    if ce is None:
        # Fall back to bi-encoder ranking only
        for item in candidates:
            item["crossScore"] = None
            item["crossDiagnostics"] = {
                "chunkCount": 0,
                "jdChars": 0,
                "fallbackReason": _cross_encoder_unavailable_reason,
            }
        return candidates

    # Chunk the CV text once and reuse for all jobs
    cv_text = build_cv_query_text(masked_cv_text)
    cv_chunks = _create_cv_chunks(cv_text)

    # ── DEBUG: CV content inspection ──
    print(
        f"DEBUG: [cross_encode] cvTextChars={len(cv_text)} "
        f"numChunks={len(cv_chunks)} "
        f"cvPreview={repr(cv_text[:300])}"
    )
    for _ci, _chunk in enumerate(cv_chunks):
        print(
            f"DEBUG: [cross_encode] cvChunk[{_ci}] "
            f"chars={len(_chunk)} "
            f"preview={repr(_chunk[:150])}"
        )

    if not cv_chunks:
        for item in candidates:
            item["crossScore"] = None
            item["crossDiagnostics"] = {
                "chunkCount": 0,
                "jdChars": 0,
                "fallbackReason": CE_FALLBACK_REASONS["MODEL_ERROR"],
            }
        return candidates

    # ── Phase 1: Prepare JD texts and build all pairs across all jobs ──
    n_chunks = len(cv_chunks)
    all_pairs: list[tuple[str, str]] = []
    # Per-job metadata: (start_index_in_all_pairs, jd_char_count) or None if skipped
    job_pair_ranges: list[tuple[int, int, int] | None] = []

    for idx, item in enumerate(candidates):
        _jd_raw = item.get("jdText", "")
        _job_title = str(item.get("jobTitle", "") or "").strip()
        _required_skills: list[str] = _safe_required_skills(item.get("requiredSkills", []))

        # Build JD query: prefer structured data (requiredSkills + jobTitle) as the
        # primary signal, then fall back to full JD text for extra context.
        # This avoids relying on section-detection heuristics that can miss modern
        # job post formats ("What we're looking for", "You bring:", etc.)
        structured_prefix = ""
        if _required_skills:
            skills_line = ", ".join(_required_skills[:20])
            if _job_title:
                structured_prefix = f"{_job_title}: {skills_line}"
            else:
                structured_prefix = skills_line

        jd_from_text = build_jd_query_text(_jd_raw)
        if structured_prefix:
            # Prepend structured skills before the extracted text so they're
            # guaranteed to fall within the token window.
            jd_text = f"{structured_prefix}\n\n{jd_from_text}"
        else:
            jd_text = jd_from_text
        jd_text = jd_text[:CROSS_ENCODER_JD_QUERY_CHARS].strip()
        # ── DEBUG: JD content per job ──
        _job_id = item.get("jobId", f"idx={idx}")
        print(
            f"DEBUG: [cross_encode] job[{_job_id}] "
            f"jdRawChars={len(_jd_raw)} "
            f"jdBuiltChars={len(jd_text)} "
            f"jdPreview={repr(jd_text[:300])}"
        )
        if not jd_text:
            print(f"DEBUG: [cross_encode] job[{_job_id}] SKIPPED — empty jd_text after build")
            job_pair_ranges.append(None)
            continue
        start_pos = len(all_pairs)
        for chunk in cv_chunks:
            all_pairs.append((jd_text, chunk))
        job_pair_ranges.append((start_pos, len(all_pairs), len(jd_text)))

    if not all_pairs:
        for item in candidates:
            item["crossScore"] = None
            item["crossDiagnostics"] = {
                "chunkCount": n_chunks,
                "jdChars": 0,
                "fallbackReason": CE_FALLBACK_REASONS["MODEL_ERROR"],
            }
        return candidates

    # ── Phase 2: Single batched inference call ──
    print(
        f"INFO: Cross-Encoder batch scoring "
        f"{len(candidates)} job(s) × {n_chunks} chunk(s) = "
        f"{len(all_pairs)} pair(s)."
    )
    started_at = datetime.now(timezone.utc)
    raw_logits = ce.predict(all_pairs)
    elapsed_ms = (datetime.now(timezone.utc) - started_at).total_seconds() * 1000

    ce_budget_ms = int(LATENCY_BUDGET_MS.get("cross_encoder_rerank", 0) or 0)
    if ce_budget_ms > 0 and elapsed_ms > ce_budget_ms:
        print(
            f"WARNING: Cross-encoder batch took {elapsed_ms:.0f}ms "
            f"(budget={ce_budget_ms}ms). All scores computed successfully."
        )

    # ── Phase 3: Slice results back per-job ──
    for idx, item in enumerate(candidates):
        pair_range = job_pair_ranges[idx]
        if pair_range is None:
            item["crossScore"] = None
            item["crossDiagnostics"] = {
                "chunkCount": n_chunks,
                "jdChars": 0,
                "fallbackReason": CE_FALLBACK_REASONS["MODEL_ERROR"],
            }
            continue

        start, end, jd_chars = pair_range
        job_logits = raw_logits[start:end]
        normalized = [_calibrated_sigmoid(float(logit)) for logit in job_logits]

        # ── DEBUG: raw logits and sigmoid scores per chunk per job ──
        _job_id = item.get("jobId", f"idx={idx}")
        for _ci, (_logit, _norm) in enumerate(zip(job_logits, normalized)):
            print(
                f"DEBUG: [cross_encode] job[{_job_id}] "
                f"chunk[{_ci}] "
                f"rawLogit={float(_logit):.4f} "
                f"sigmoid={_norm:.4f} "
                f"score={round(_norm * 100, 2)}"
            )

        aggregated, dist_stats = _aggregate_chunk_scores(normalized)
        item["crossScore"] = round(aggregated * 100, 2) if normalized else None
        item["crossDiagnostics"] = {
            "chunkCount": n_chunks,
            "jdChars": jd_chars,
            "maxChunkScore": dist_stats["max"],
            "meanChunkScore": dist_stats["mean"],
            "minChunkScore": dist_stats["min"],
            "fallbackReason": CE_FALLBACK_REASONS["NONE"],
        }

    print(f"INFO: Cross-Encoder batch completed in {elapsed_ms:.0f}ms.")
    return candidates


# ---------------------------------------------------------------------------
# Hybrid Score Computation
# ---------------------------------------------------------------------------

def compute_hybrid_score(bi_score: float, cross_score: float | None) -> float:
    """
    Blend bi-encoder and cross-encoder scores.

    If cross-encoder is unavailable, falls back to bi-encoder only.
    Returned value is in [0, 100] percentage scale.
    """
    if cross_score is None:
        return round(bi_score, 2)

    blended = HYBRID_WEIGHT_BI * (bi_score / 100.0) + HYBRID_WEIGHT_CROSS * (cross_score / 100.0)
    return round(blended * 100, 2)


def compute_final_score_v3(
    hybrid_semantic_score: float,
    skill_composite_score: float,
    skill_coverage_must: float | None,
    *,
    required_skill_count: int = 0,
    candidate_skill_count: int = 0,
) -> tuple[float, float, str | None]:
    """
    Final score fusion with threshold-based must penalty.

    Data-quality guard: when either required_skills or candidate_skills are
    absent, we cannot trust skill_composite_score=0 — it reflects missing
    metadata, not a genuine skill mismatch.  In that case the penalty is
    suppressed and the hybrid semantic score is returned unchanged so that
    a strong bi-encoder match is not collapsed by incomplete data.

    Returns (final_score_v3, must_penalty_points, guard_reason).
    guard_reason is None when normal scoring ran, or a short string
    describing why the guard fired (logged to scoring_pair for traceability).
    """
    has_required = required_skill_count > 0
    has_candidate = candidate_skill_count > 0

    if not has_required or not has_candidate:
        # Skill data unavailable — avoid hard penalty, but attenuate slightly
        # to prevent over-scoring candidates on incomplete skill metadata.
        guard_reason = (
            "no_required_skills" if not has_required
            else "no_candidate_skills"
        )
        semantic_only = max(0.0, min(100.0, float(hybrid_semantic_score or 0.0)))
        attenuated = semantic_only * 0.90
        return round(attenuated, 2), 0.0, guard_reason

    must_frac = max(0.0, min(1.0, float(skill_coverage_must or 0.0) / 100.0))
    must_penalty_points = (
        100.0 * MUST_PENALTY_FACTOR * max(0.0, MUST_THRESHOLD_FRACTION - must_frac)
    )
    final_v3 = (
        (1.0 - FINAL_SCORE_BETA) * float(hybrid_semantic_score or 0.0)
        + FINAL_SCORE_BETA * float(skill_composite_score or 0.0)
        - must_penalty_points
    )
    final_v3 = max(0.0, min(100.0, final_v3))
    return round(final_v3, 2), round(must_penalty_points, 2), None


# ---------------------------------------------------------------------------
# Step 6: Claude Agent 3 — Match Explanation Generator
# ---------------------------------------------------------------------------

def generate_match_explanation(
    parsed_data: dict,
    job: dict,
    *,
    score_band: str = "medium",
    top_matched_skills: list[str] | None = None,
    top_missing_skills: list[str] | None = None,
) -> str:
    """
    Generate a personalized, 2-3 sentence explanation of why this job matches
    the candidate. Written from the candidate's perspective.

    This is Claude Agent 3 — the third AI call in the full pipeline
    (after Agent 1: skill extraction and Agent 2: interview questions).

    Design principle: The explanation must be SPECIFIC, not generic.
    Bad: "This job matches your skills in software development."
    Good: "Your 4 years of .NET backend experience and AWS Lambda work directly
           align with the core requirements. The team's focus on serverless
           microservices maps closely to your recent projects."

    Temperature=0.4 introduces slight variation so identical candidates
    don't receive identical explanations for the same job.
    """
    if not ENABLE_MATCH_EXPLANATION:
        return "This role closely matches your experience and technical background."

    seniority = parsed_data.get("seniority_estimate", "Mid")
    years_exp = parsed_data.get("years_experience", 0)
    backend = parsed_data.get("backend_skills", [])
    frontend = parsed_data.get("frontend_skills", [])
    devops = parsed_data.get("devops_skills", [])
    strengths = parsed_data.get("strengths", "")
    all_skills = backend + frontend + devops

    job_title = job.get("jobTitle", "Unknown Role")
    company = job.get("companyName", "the company")
    required = job.get("requiredSkills", [])
    jd_preview = (job.get("jdText", "") or "")[:800]
    matched = top_matched_skills or []
    missing = top_missing_skills or []

    system_prompt = """You are a helpful career advisor AI writing personalized job match explanations for candidates.

Write exactly 2-3 sentences explaining specifically WHY this job is a strong match for this candidate.

Rules:
- Be specific: mention actual skills and how they map to actual job requirements
- Write in second person ("Your experience in X...")
- Do NOT be generic or use vague phrases like "great opportunity"
- Do NOT mention the match score number
- Use score_band to calibrate tone:
  - low: cautious fit, acknowledge key gaps
  - medium: partial fit with clear next-upskilling steps
  - high: strong fit with concrete supporting evidence
- Ground claims using top_matched_skills and top_missing_skills
- Output ONLY the explanation text. No JSON, no labels, no markdown."""

    user_message = f"""Candidate profile:
- Seniority: {seniority}, {years_exp} year(s) experience
- Technical skills: {", ".join(all_skills[:15]) if all_skills else "Not specified"}
- Their strengths: {strengths[:300] if strengths else "Not provided"}

Job being matched:
- Title: {job_title} at {company}
- Required skills: {", ".join(required[:10]) if required else "Not specified"}
- JD excerpt: {jd_preview}
- score_band: {score_band}
- top_matched_skills: {", ".join(matched[:5]) if matched else "None"}
- top_missing_skills: {", ".join(missing[:5]) if missing else "None"}

Write the 2-3 sentence match explanation for this candidate."""

    payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 200,
        "temperature": 0.4,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    }

    try:
        response = bedrock.invoke_model(
            modelId=CLAUDE_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload),
        )
        response_data = json.loads(response.get("body").read())
        explanation = response_data.get("content", [{}])[0].get("text", "").strip()
        return explanation or "This role aligns with your technical background and experience level."

    except Exception as exc:
        print(f"WARNING: Match explanation generation failed (non-fatal): {exc}")
        return "This role closely aligns with your skills and experience."


# ---------------------------------------------------------------------------
# Step 7: DynamoDB Persistence
# ---------------------------------------------------------------------------

def save_suggestions_to_dynamodb(
    profile_id: str,
    suggestions: list[dict],
    updated_at: str,
    file_key: str | None = None,
    candidate_user_id: str | None = None,
    *,
    pipeline_run_id: str | None = None,
    scoring_version: str | None = None,
    cv_version: str | None = None,
    scored_at: str | None = None,
) -> None:
    """
    Write job suggestions to DynamoDB under the candidate's partition key.

    When ``file_key`` is set, also updates the CV status item (SK=CV#<key>) to SUCCESS.

    Single Table Design:
      PK = CANDIDATE#<profile_id>
      SK = JOB_SUGGESTIONS

    This overwrites any previous suggestions for the same candidate,
    so each new CV upload produces a fresh ranked suggestion list.

    The suggestions list is serialized with Decimal conversion because
    DynamoDB does not accept Python float.
    """
    table = dynamodb.Table(DYNAMODB_TABLE)

    def to_decimal_safe(obj):
        json_safe = _decimal_to_jsonable(obj)
        return json.loads(json.dumps(json_safe), parse_float=Decimal)

    item = {
        "PK": f"CANDIDATE#{profile_id}",
        "SK": "JOB_SUGGESTIONS",
        "GSI1PK": "JOB_SUGGESTIONS",
        "GSI1SK": updated_at,
        "type": "JOB_SUGGESTIONS",
        "candidateId": str(profile_id),
        "candidateCognitoSub": str(profile_id),
        "suggestions": to_decimal_safe(suggestions),
        "suggestionCount": len(suggestions),
        "updatedAt": updated_at,
        "scoredAt": scored_at or updated_at,
        "pipelineRunId": pipeline_run_id or "",
        "scoringVersion": scoring_version or SCORING_VERSION,
        "cvVersion": cv_version or "",
    }
    if candidate_user_id:
        item["candidateUserId"] = str(candidate_user_id)
    if file_key:
        item["sourceCvKey"] = str(file_key)

    table.put_item(Item=item)
    print(f"INFO: {len(suggestions)} suggestion(s) saved for candidate {profile_id}.")

    if file_key:
        try:
            table.update_item(
                Key={"PK": f"CANDIDATE#{profile_id}", "SK": f"CV#{file_key}"},
                UpdateExpression=(
                    "SET #s = :s, parseStatus = :s, updatedAt = :u, "
                    "latestSuggestionCount = :cnt, latestSuggestionAt = :u"
                ),
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s": "SUCCESS",
                    ":u": updated_at,
                    ":cnt": len(suggestions),
                }
            )
            print(f"INFO: Processing status updated to SUCCESS for {profile_id}/{file_key}")
        except Exception as e:
            print(f"WARNING: Failed to update SUCCESS status: {e}")


def save_failure_to_dynamodb(
    profile_id: str,
    file_key: str | None,
    error_message: str,
    updated_at: str,
) -> None:
    """Report a failure in the suggestion engine to DynamoDB."""
    if not file_key:
        return
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        table.update_item(
            Key={"PK": f"CANDIDATE#{profile_id}", "SK": f"CV#{file_key}"},
            UpdateExpression="SET #s = :s, parseStatus = :s, updatedAt = :u, errorMessage = :e",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s": "FAILED",
                ":u": updated_at,
                ":e": error_message
            }
        )
        print(f"INFO: Processing status updated to FAILED for {profile_id}/{file_key}")
    except Exception as e:
        print(f"WARNING: Failed to update FAILED status: {e}")


def _fetch_masked_cv_text_from_rds(profile_id: str) -> str:
    """
    Fetch the stored raw_text for a candidate from candidate_embeddings table.
    Used when job_suggestion_engine is triggered manually (no masked_cv_text in payload).
    Returns empty string if not found.
    """
    if not RDS_SECRET_ARN:
        return ""
    try:
        conn = _get_rds_connection()
        try:
            rows = conn.run(
                """
                SELECT ce.raw_text
                FROM candidate_embeddings ce
                INNER JOIN "Users" u ON ce.user_id = u."Id"
                WHERE u."CognitoSub" = :sub
                LIMIT 1
                """,
                sub=str(profile_id).strip(),
            )
            if rows and rows[0][0]:
                return str(rows[0][0]).strip()
            return ""
        finally:
            conn.close()
    except Exception as exc:
        print(f"WARNING: Failed to fetch raw_text from RDS for profile_id={profile_id}: {exc}")
        return ""


# ---------------------------------------------------------------------------
# Lambda Entry Point
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    """
    Find and save top matching jobs for a candidate who uploaded their CV globally.

    Expected to be invoked asynchronously (InvocationType=Event) by
    vector_persister after it stores the candidate's CV embedding in RDS.

    Full pipeline:
      [1] Validate input
      [2] Re-embed masked CV as search_query (asymmetric search)
      [3] pgvector ANN: find top 20 jobs by vector distance
      [4] Fetch JD text/metadata from DynamoDB for each candidate job
      [5] Cross-Encoder re-rank → top 5 by semantic precision
      [6] Compute hybrid scores; filter by MIN_SCORE_THRESHOLD
      [7] Claude Agent 3: generate match explanation per top job
      [8] Save suggestions to DynamoDB
      [9] AppSync: push real-time update to candidate frontend
    """
    profile_id = event.get("profile_id", "unknown")
    flow_type = event.get("flow_type")
    trigger_source = event.get("trigger_source", "pipeline")

    try:
        pipeline_started_at = datetime.now(timezone.utc)
        masked_cv_text = event.get("masked_cv_text", "")
        parsed_data = event.get("parsed_data", {})
        file_key = event.get("file_key") or event.get("objectKey")
        pipeline_run_id = str(event.get("pipeline_run_id") or uuid.uuid4())
        scoring_version = str(event.get("scoring_version") or SCORING_VERSION)
        cv_version = str(event.get("cv_version") or file_key or "")

        if flow_type and flow_type != "candidate":
            raise ValueError(f"Invalid flow_type for suggestion: {flow_type}")

        if profile_id == "unknown":
            raise ValueError("profile_id is required.")

        # Manual refresh: backend invokes with only profile_id.
        # Fetch stored raw_text from pgvector so we can re-run ANN without a new CV upload.
        if trigger_source == "manual_refresh" and not masked_cv_text:
            print(f"INFO: Manual refresh detected for profile={profile_id}. Fetching stored raw_text from RDS.")
            masked_cv_text = _fetch_masked_cv_text_from_rds(profile_id)
            if not masked_cv_text:
                raise ValueError("No stored CV text found for this candidate. Please upload a CV first.")

        if not masked_cv_text:
            raise ValueError("profile_id and masked_cv_text are required.")

        print(f"INFO: JobSuggestionEngine started for profile={profile_id}")

        normalized_cv_text = build_cv_query_text(masked_cv_text)
        cv_vector_in = event.get("cv_vector") or event.get("cv_embedding") or []
        doc_vector = _resolve_document_embedding(
            cv_vector_in if isinstance(cv_vector_in, list) else [],
            normalized_cv_text,
        )
        upsert_candidate_vector_and_profile(
            profile_id, doc_vector, normalized_cv_text, parsed_data
        )
        candidate_user_id = resolve_user_id_from_cognito_sub(profile_id)

        candidate_skills = normalize_skill_list(
            event.get("candidate_skills", []), max_items=MAX_CANDIDATE_SKILLS
        )
        candidate_skill_profile: dict[str, list[str]] = {}
        # New schema: candidate_skill_profile from event (passed from cjp_engine_core)
        if event.get("candidate_skill_profile"):
            candidate_skill_profile = event["candidate_skill_profile"]
            hard = normalize_skill_list(candidate_skill_profile.get("hardSkills", []), max_items=MAX_CANDIDATE_SKILLS)
            proc = normalize_skill_list(candidate_skill_profile.get("processSkills", []), max_items=50)
            candidate_skills = normalize_skill_list(hard + proc, max_items=MAX_CANDIDATE_SKILLS)
        if not candidate_skills:
            candidate_skills = extract_candidate_skills_from_parsed_data(parsed_data)
        if not candidate_skills:
            candidate_skills, candidate_skill_profile = fetch_candidate_skills_from_dynamodb(profile_id, file_key)
        if candidate_skills:
            cand_ctx = {
                "job_title": "",
                "jd_excerpt": "",
                "profile_summary": (parsed_data.get("summary") or "")[:900],
            }
            candidate_skills, cand_canon_diag = canonicalize_skills_batch(
                candidate_skills,
                side="candidate",
                context=cand_ctx,
                max_items=MAX_CANDIDATE_SKILLS,
            )
            # Keep hardSkills in sync with canonicalized result
            if candidate_skill_profile.get("hardSkills"):
                candidate_skill_profile["hardSkills"] = candidate_skills
            print(
                "INFO: candidate_skill_canonical "
                + json.dumps(cand_canon_diag, default=str)
            )
        if candidate_skills:
            patch_candidate_skills(profile_id, file_key, candidate_skills, candidate_skill_profile)

        # ── [2] Re-embed CV as search_query ─────────────────────────────
        print("INFO: Generating search_query embedding for CV.")
        query_vector = get_cohere_query_embedding(normalized_cv_text)

        # ── [3] ANN vector search against job_embeddings ─────────────────
        print(f"INFO: Searching top {ANN_CANDIDATE_POOL_SIZE} jobs via pgvector.")
        ann_matches = search_matching_jobs(query_vector, top_n=ANN_CANDIDATE_POOL_SIZE)

        if not ann_matches:
            print("WARNING: No job matches returned from pgvector. Saving empty suggestions.")
            updated_at = datetime.now(timezone.utc).isoformat()
            save_suggestions_to_dynamodb(
                profile_id,
                [],
                updated_at,
                file_key,
                candidate_user_id=candidate_user_id,
                pipeline_run_id=pipeline_run_id,
                scoring_version=scoring_version,
                cv_version=cv_version,
                scored_at=updated_at,
            )
            notify_candidate_job_suggestions(
                profile_id,
                [],
                updated_at,
                scored_at=updated_at,
                pipeline_run_id=pipeline_run_id,
                scoring_version=scoring_version,
                cv_version=cv_version,
            )
            return {"statusCode": 200, "body": "No matches found. Suggestions saved as empty."}

        # ── [4] Fetch JD details from DynamoDB ───────────────────────────
        print(f"INFO: Fetching JD details for {len(ann_matches)} candidate job(s).")
        for match in ann_matches:
            jd_details = fetch_jd_details(match["jobId"])
            match.update(jd_details)
            if not match.get("jdText"):
                match["jdText"] = fetch_jd_text_from_rds(match["jobId"])
            if not isinstance(match.get("requiredSkillGroups"), dict) or not match.get("requiredSkillGroups"):
                match["requiredSkillGroups"] = extract_required_skill_groups_from_jd_ai(
                    match.get("jdText", ""),
                    match.get("jobTitle", ""),
                )
            if not normalize_skill_list(match.get("requiredSkills", []), max_items=MAX_REQUIRED_SKILLS):
                extracted = extract_required_skills_from_jd_ai(
                    match.get("jdText", ""),
                    match.get("jobTitle", ""),
                )
                if extracted:
                    ctx_ex = {
                        "job_title": str(match.get("jobTitle") or "")[:240],
                        "jd_excerpt": str(match.get("jdText") or "")[:1200],
                    }
                    rg0 = match.get("requiredSkillGroups")
                    flat_ex, grp_ex, _ = canonicalize_required_skill_bundle(
                        extracted,
                        rg0 if isinstance(rg0, dict) else {},
                        context=ctx_ex,
                    )
                    match["requiredSkillGroups"] = grp_ex
                    match["requiredSkills"] = normalize_skill_list(
                        flatten_required_skills([], grp_ex),
                        max_items=MAX_REQUIRED_SKILLS,
                    )
                    if flat_ex and not match["requiredSkills"]:
                        match["requiredSkills"] = normalize_skill_list(
                            flat_ex, max_items=MAX_REQUIRED_SKILLS
                        )
                    patch_job_required_skills(
                        match["jobId"],
                        match["requiredSkills"],
                        grp_ex,
                    )

        scorable_matches = [m for m in ann_matches if m.get("jdText")]
        # Cross-encode only the top N by bi-encoder score — no need to
        # spend inference on jobs that won't make the final cut.
        scorable_matches.sort(key=lambda m: float(m.get("biScore", 0)), reverse=True)
        ce_pool = scorable_matches[:FINAL_SUGGESTION_COUNT]
        print(
            f"INFO: {len(scorable_matches)}/{len(ann_matches)} job(s) have JD text; "
            f"cross-encoding top {len(ce_pool)} by biScore."
        )

        # ── [5] Cross-Encoder re-rank ──────────────────────────────────
        if ce_pool:
            print("INFO: Running Cross-Encoder re-ranking.")
            ce_pool = cross_encode_cv_vs_jobs(normalized_cv_text, ce_pool)
        scorable_map = {m["jobId"]: m for m in scorable_matches}

        # ── [6.1] Compute hybrid semantic score for all 10 ───
        for match in ann_matches:
            scored_match = scorable_map.get(match["jobId"], match)
            scored_match["hybridSemanticScore"] = compute_hybrid_score(
                scored_match["biScore"], scored_match.get("crossScore")
            )
            scorable_map[scored_match["jobId"]] = scored_match

        # ── [6.2] Keep only top 5 by hybrid score for skill composite ───
        all_hybrid = list(scorable_map.values())
        all_hybrid.sort(key=lambda m: float(m.get("hybridSemanticScore", 0)), reverse=True)
        top_hybrid_matches = all_hybrid[:FINAL_SUGGESTION_COUNT]

        # ── [6.3] Compute grouped skill gap + final score for top 5 only ───
        for scored_match in top_hybrid_matches:
            required_groups = scored_match.get("requiredSkillGroups", {})
            if not isinstance(required_groups, dict):
                required_groups = {}
            base_flat = normalize_skill_list(
                flatten_required_skills(
                    _safe_required_skills(scored_match.get("requiredSkills", [])),
                    required_groups,
                ),
                max_items=MAX_REQUIRED_SKILLS,
            )
            req_ctx = {
                "job_title": str(scored_match.get("jobTitle") or "")[:240],
                "jd_excerpt": str(scored_match.get("jdText") or "")[:1200],
            }
            flat_req, groups_canon, req_canon_diag = canonicalize_required_skill_bundle(
                base_flat,
                required_groups,
                context=req_ctx,
            )
            scored_match["requiredSkillGroups"] = groups_canon
            scored_match["requiredSkills"] = normalize_skill_list(
                flatten_required_skills([], groups_canon),
                max_items=MAX_REQUIRED_SKILLS,
            )
            if flat_req and not scored_match["requiredSkills"]:
                scored_match["requiredSkills"] = normalize_skill_list(
                    flat_req, max_items=MAX_REQUIRED_SKILLS
                )
            if scored_match.get("requiredSkills"):
                patch_job_required_skills(
                    str(scored_match.get("jobId") or ""),
                    scored_match["requiredSkills"],
                    groups_canon,
                )
            print(
                "INFO: required_skill_canonical "
                + json.dumps(req_canon_diag, default=str)
            )
            required_skills = normalize_skill_list(
                flatten_required_skills(
                    _safe_required_skills(scored_match.get("requiredSkills", [])),
                    groups_canon,
                ),
                max_items=MAX_REQUIRED_SKILLS,
            )
            gap = compute_skill_gap(required_skills, candidate_skills, groups_canon, skill_profile=candidate_skill_profile)
            scored_match["skillGap"] = gap
            scored_match["skillCompositeScore"] = float(gap.get("skillCompositeScore", 0.0) or 0.0)
            final_v3, must_penalty_points, guard_reason = compute_final_score_v3(
                scored_match["hybridSemanticScore"],
                scored_match["skillCompositeScore"],
                gap.get("skillCoverageMust"),
                required_skill_count=len(required_skills),
                candidate_skill_count=len(candidate_skills),
            )
            scored_match["finalScoreV3"] = final_v3
            scored_match["mustPenaltyPoints"] = must_penalty_points
            scored_match["finalScore"] = (
                final_v3 if ENABLE_FINAL_SCORE_V3 else scored_match["hybridSemanticScore"]
            )
            print(
                "INFO: scoring_pair "
                + json.dumps({
                    "profileId": profile_id,
                    "jobId": scored_match.get("jobId"),
                    "biScore": scored_match.get("biScore"),
                    "crossScore": scored_match.get("crossScore"),
                    "hybridSemanticScore": scored_match.get("hybridSemanticScore"),
                    "skillCompositeScore": scored_match.get("skillCompositeScore"),
                    "mustPenaltyPoints": scored_match.get("mustPenaltyPoints"),
                    "finalScoreV3": scored_match.get("finalScoreV3"),
                    "finalScore": scored_match.get("finalScore"),
                    "skillDataAvailable": {
                        "requiredSkillCount": len(required_skills),
                        "candidateSkillCount": len(candidate_skills),
                    },
                    "guardActivated": guard_reason,
                    "crossDiagnostics": scored_match.get("crossDiagnostics", {}),
                })
            )

        # Sort by finalScore descending, take top N above threshold
        dynamic_threshold = resolve_score_threshold(
            [float(m.get("finalScore", 0.0) or 0.0) for m in top_hybrid_matches]
        )
        filtered = [
            m for m in top_hybrid_matches
            if m["finalScore"] >= dynamic_threshold
        ]
        filtered.sort(key=lambda m: m["finalScore"], reverse=True)
        top_jobs = filtered[: min(FINAL_SUGGESTION_COUNT, HARD_OUTPUT_LIMIT)]

        print(
            f"INFO: {len(top_jobs)} job(s) passed threshold "
            f"(base={MIN_SCORE_THRESHOLD}%, applied={dynamic_threshold}%)."
        )

        # ── [7] Claude Agent 3: match explanations ────────────────────────
        suggestions = []
        for job in top_jobs:
            required_groups = job.get("requiredSkillGroups", {})
            gap = job.get("skillGap") if isinstance(job.get("skillGap"), dict) else {}
            required_skills = gap.get("requiredSkills") or normalize_skill_list(
                flatten_required_skills(
                    _safe_required_skills(job.get("requiredSkills", [])),
                    required_groups if isinstance(required_groups, dict) else {},
                ),
                max_items=MAX_REQUIRED_SKILLS,
            )
            score_band = classify_score_band(float(job.get("finalScore", 0.0) or 0.0))
            print(
                "INFO: scoring_diagnostics "
                + json.dumps({
                    "profileId": profile_id,
                    "jobId": job.get("jobId"),
                    "biScore": job.get("biScore"),
                    "crossScore": job.get("crossScore"),
                    "hybridSemanticScore": job.get("hybridSemanticScore"),
                    "skillCompositeScore": job.get("skillCompositeScore"),
                    "mustPenaltyPoints": job.get("mustPenaltyPoints"),
                    "finalScoreV3": job.get("finalScoreV3"),
                    "finalScore": job.get("finalScore"),
                    "thresholdApplied": dynamic_threshold,
                    "passedThreshold": float(job.get("finalScore", 0.0) or 0.0) >= dynamic_threshold,
                    "scoreBand": score_band,
                    "crossDiagnostics": job.get("crossDiagnostics", {}),
                })
            )
            print(f"INFO: Generating match explanation for jobId={job['jobId']}.")
            explanation = generate_match_explanation(
                parsed_data,
                job,
                score_band=score_band,
                top_matched_skills=gap.get("matchedSkills", []),
                top_missing_skills=gap.get("missingSkills", []),
            )

            suggestions.append({
                "jobId": job["jobId"],
                "jobTitle": job["jobTitle"],
                "companyName": job.get("companyName", "Unknown Company"),
                "seniority": job.get("seniority", ""),
                "requiredSkills": required_skills,
                "candidateSkills": list(candidate_skills),  # backward compat (flat hardSkills+processSkills)
                "hardSkills": candidate_skill_profile.get("hardSkills", []),
                "processSkills": candidate_skill_profile.get("processSkills", []),
                "softSkills": candidate_skill_profile.get("softSkills", []),
                "domainExpertise": candidate_skill_profile.get("domainExpertise", []),
                "skillGapScore": gap.get("skillGapScore", 0.0),
                "skillCoverageMust": gap.get("skillCoverageMust"),
                "skillCoverageOneOf": gap.get("skillCoverageOneOf"),
                "skillCoverageNice": gap.get("skillCoverageNice"),
                "skillCompositeScore": gap.get("skillCompositeScore"),
                "skillSummary": gap.get("skillSummary"),
                "skillSummarySchemaVersion": SKILL_SUMMARY_SCHEMA_VERSION,
                "location": (job.get("location") or "")[:256],
                "jobType": (job.get("jobType") or "")[:64],
                "salaryRange": job.get("salaryRange"),
                "biEncoderScore": _safe_score_value(job.get("biScore")),
                "crossEncoderScore": _safe_score_value(job.get("crossScore")),
                "hybridSemanticScore": _safe_score_value(job.get("hybridSemanticScore")),
                "finalScoreV3": _safe_score_value(job.get("finalScoreV3")),
                "mustPenaltyPoints": _safe_score_value(job.get("mustPenaltyPoints")),
                "finalScore": _safe_score_value(job.get("finalScore")) or 0.0,
                "matchExplanation": explanation,
            })

        # ── [8] Save to DynamoDB ──────────────────────────────────────────
        updated_at = datetime.now(timezone.utc).isoformat()
        save_suggestions_to_dynamodb(
            profile_id,
            suggestions,
            updated_at,
            file_key,
            candidate_user_id=candidate_user_id,
            pipeline_run_id=pipeline_run_id,
            scoring_version=scoring_version,
            cv_version=cv_version,
            scored_at=updated_at,
        )

        # ── [9] AppSync real-time push ────────────────────────────────────
        notify_candidate_job_suggestions(
            profile_id,
            suggestions,
            updated_at,
            scored_at=updated_at,
            pipeline_run_id=pipeline_run_id,
            scoring_version=scoring_version,
            cv_version=cv_version,
        )

        print(f"INFO: JobSuggestionEngine complete. {len(suggestions)} suggestion(s) delivered.")
        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "SUCCESS",
                "profile_id": profile_id,
                "suggestion_count": len(suggestions),
            }),
        }

    except Exception as exc:
        print(f"ERROR: JobSuggestionEngine failed for profile={profile_id}: {exc}")
        updated_at = datetime.now(timezone.utc).isoformat()
        save_failure_to_dynamodb(profile_id, file_key, str(exc), updated_at)
        return {
            "statusCode": 200,
            "body": json.dumps({"status": "FAILED_SAFE", "error": str(exc)}),
        }