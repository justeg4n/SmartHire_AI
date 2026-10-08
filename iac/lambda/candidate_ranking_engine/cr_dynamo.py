"""DynamoDB persistence and job identity — candidate ranking."""
import json
from decimal import Decimal

from cr_clients import dynamodb
from cr_config import DYNAMODB_TABLE, SCORING_VERSION
from cr_rds import _get_rds_connection

def fetch_candidate_profile_from_dynamodb(candidate_id: str) -> dict:
    """
    Fetch the most recent CV parse result (skills, interview guide) from DynamoDB.

    We query the DynamoDB hot store to get the interviewGuide (from Agent 2)
    and any additional enriched data that the RDS profile_json might not have.

    Uses a Query on PK=CANDIDATE#<id> to get the most recent SK=CV#...
    (sorted by GSI1SK timestamp — latest first).

    Returns empty dict if not found; calling code handles gracefully.
    """
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        # Preferred source of truth for recruiter enrichment.
        meta_resp = table.get_item(
            Key={"PK": f"CANDIDATE#{candidate_id}", "SK": "METADATA"}
        )
        meta_item = meta_resp.get("Item", {})
        if meta_item:
            return {
                "interviewGuide": meta_item.get("interviewGuide", []),
                "maskingReport": meta_item.get("maskingReport", {}),
                "scoringDetails": meta_item.get("scoringDetails", {}),
                "parsedProfile": meta_item.get("parsedProfile", {}),
                "schemaVersion": meta_item.get("schemaVersion") or "1.0.0",
                "contactInfo": meta_item.get("contactInfo", {}),
                "candidateSkills": meta_item.get("candidateSkills", []) or [],
                "hardSkills": meta_item.get("hardSkills", []) or [],
                "processSkills": meta_item.get("processSkills", []) or [],
                "softSkills": meta_item.get("softSkills", []) or [],
                "domainExpertise": meta_item.get("domainExpertise", []) or [],
            }

        # Backward-compatible fallback: most recent CV row.
        response = table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
            ExpressionAttributeValues={
                ":pk": f"CANDIDATE#{candidate_id}",
                ":sk_prefix": "CV#",
            },
            ScanIndexForward=False,
            Limit=1,
        )
        items = response.get("Items", [])
        if items:
            item = items[0]
            return {
                "interviewGuide": item.get("interviewGuide", []),
                "maskingReport": item.get("maskingReport", {}),
                "scoringDetails": item.get("scoringDetails", {}),
                "parsedProfile": item.get("parsedProfile", {}),
                "schemaVersion": item.get("schemaVersion") or "1.0.0",
                "contactInfo": item.get("contactInfo", {}),
                "candidateSkills": item.get("candidateSkills", []) or [],
                "hardSkills": item.get("hardSkills", []) or [],
                "processSkills": item.get("processSkills", []) or [],
                "softSkills": item.get("softSkills", []) or [],
                "domainExpertise": item.get("domainExpertise", []) or [],
            }
    except Exception as exc:
        print(f"WARNING: DynamoDB profile fetch failed for {candidate_id}: {exc}")

    return {}


# ---------------------------------------------------------------------------
# Step 8: DynamoDB Persistence
# ---------------------------------------------------------------------------

def save_ranking_to_dynamodb(
    job_id: str,
    ranked_candidates: list[dict],
    updated_at: str,
    owner_cognito_sub: str = "",
    recruiter_id: str = "",
    *,
    pipeline_run_id: str | None = None,
    scoring_version: str | None = None,
    jd_version: str | None = None,
    scored_at: str | None = None,
) -> None:
    """
    Write ranked candidate list to DynamoDB under the job's partition key.

    Single Table Design:
      PK = JOB#<job_id>
      SK = CANDIDATE_RANKING

    Overwrites any previous ranking for the same job, so re-posting the JD
    or re-running the engine always produces a fresh ranked list.

    The interviewGuide from each candidate is included so the recruiter
    sees the AI-generated interview questions directly on the dashboard.
    """
    table = dynamodb.Table(DYNAMODB_TABLE)

    def to_decimal_safe(obj):
        return json.loads(json.dumps(obj), parse_float=Decimal)

    item = {
        "PK": f"JOB#{job_id}",
        "SK": "CANDIDATE_RANKING",
        "GSI1PK": "CANDIDATE_RANKING",
        "GSI1SK": updated_at,
        "type": "CANDIDATE_RANKING",
        "jobId": str(job_id),
        "rankedCandidates": to_decimal_safe(ranked_candidates),
        "candidateCount": len(ranked_candidates),
        "updatedAt": updated_at,
        "scoredAt": scored_at or updated_at,
        "pipelineRunId": pipeline_run_id or "",
        "scoringVersion": scoring_version or SCORING_VERSION,
        "jdVersion": jd_version or "",
    }
    if owner_cognito_sub:
        item["ownerCognitoSub"] = owner_cognito_sub
    if recruiter_id:
        item["recruiterId"] = recruiter_id

    table.put_item(Item=item)
    print(f"INFO: {len(ranked_candidates)} ranked candidate(s) saved for job {job_id}.")

    # --- NEW: Update the JD metadata status to SUCCESS ---
    try:
        table.update_item(
            Key={"PK": f"JOB#{job_id}", "SK": "METADATA"},
            UpdateExpression="SET #s = :s, parseStatus = :s, updatedAt = :u",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s": "SUCCESS",
                ":u": updated_at
            }
        )
        print(f"INFO: Job status updated to SUCCESS for {job_id}")
    except Exception as e:
        print(f"WARNING: Failed to update JD SUCCESS status: {e}")


def save_failure_to_dynamodb(
    job_id: str,
    error_message: str,
    updated_at: str,
) -> None:
    """Report a failure in the ranking engine to DynamoDB."""
    if job_id == "unknown":
        return
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        table.update_item(
            Key={"PK": f"JOB#{job_id}", "SK": "METADATA"},
            UpdateExpression="SET #s = :s, parseStatus = :s, updatedAt = :u, errorMessage = :e",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s": "FAILED",
                ":u": updated_at,
                ":e": error_message
            }
        )
        print(f"INFO: Job status updated to FAILED for {job_id}")
    except Exception as e:
        print(f"WARNING: Failed to update JD FAILED status: {e}")


def resolve_job_identity(job_id: str, owner_hint: str = "") -> tuple[str, str]:
    """
    Resolve owner cognito sub and recruiter id for a job.
    Priority:
      1) owner hint from event
      2) JOB#<id>/METADATA in DynamoDB
      3) RDS join fallback
    """
    owner = (owner_hint or "").strip()
    recruiter_id = ""

    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        response = table.get_item(Key={"PK": f"JOB#{job_id}", "SK": "METADATA"})
        item = response.get("Item") or {}
        if not owner:
            owner = str(item.get("ownerCognitoSub") or "").strip()
        recruiter_id = str(item.get("recruiterId") or "").strip()
    except Exception as exc:
        print(f"WARNING: Failed to resolve job identity from DynamoDB for {job_id}: {exc}")

    if owner and recruiter_id:
        return owner, recruiter_id

    if not RDS_SECRET_ARN:
        return owner, recruiter_id

    try:
        conn = _get_rds_connection()
        try:
            rows = conn.run(
                """
                SELECT u."CognitoSub", j."RecruiterId"::text
                FROM "Jobs" j
                INNER JOIN "RecruiterProfiles" rp ON j."RecruiterId" = rp."Id"
                INNER JOIN "Users" u ON rp."UserId" = u."Id"
                WHERE j."Id" = :jid::uuid
                LIMIT 1
                """,
                jid=str(job_id),
            )
            if rows:
                owner_rds, recruiter_rds = rows[0]
                if not owner and owner_rds:
                    owner = str(owner_rds).strip()
                if not recruiter_id and recruiter_rds:
                    recruiter_id = str(recruiter_rds).strip()
        finally:
            conn.close()
    except Exception as exc:
        print(f"WARNING: Failed to resolve job identity from RDS for {job_id}: {exc}")

    return owner, recruiter_id
