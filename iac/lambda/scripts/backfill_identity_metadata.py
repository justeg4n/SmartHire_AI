#!/usr/bin/env python3
"""
One-time DynamoDB identity/context backfill for SmartHire processing data.

Repairs:
1) JOB#<id>/METADATA:
   - ownerCognitoSub
   - recruiterId
   - companyName
   - location / employmentType / experienceLevel / salaryRange
2) JOB#<id>/CANDIDATE_RANKING:
   - ownerCognitoSub
   - recruiterId
3) CANDIDATE#<id>/CV#...:
   - candidateSkills (default [])
   - interviewGuide (default [])
   - maskingReport (default {})
   - scoringDetails (default {})

Usage:
  python iac/lambda/scripts/backfill_identity_metadata.py --table application_tracking --execute

By default this script is DRY-RUN.
"""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr

try:
    import psycopg  # type: ignore
except Exception:  # pragma: no cover - optional dependency in local envs
    psycopg = None


@dataclass
class BackfillStats:
    job_metadata_scanned: int = 0
    job_metadata_updated: int = 0
    ranking_checked: int = 0
    ranking_updated: int = 0
    ranking_rows_enriched: int = 0
    cv_rows_scanned: int = 0
    cv_rows_updated: int = 0
    rds_hits: int = 0
    rds_misses: int = 0
    errors: int = 0


def _to_decimal_salary(min_value: Any, max_value: Any) -> dict[str, Any] | None:
    if min_value is None and max_value is None:
        return None
    lo = min_value if min_value is not None else max_value
    hi = max_value if max_value is not None else min_value
    return {
        "min": Decimal(str(lo or 0)),
        "max": Decimal(str(hi or 0)),
        "currency": "USD",
    }


def _connect_rds_from_env():
    if psycopg is None:
        return None
    host = os.getenv("RDS_HOST")
    dbname = os.getenv("RDS_DB_NAME")
    user = os.getenv("RDS_USER")
    password = os.getenv("RDS_PASSWORD")
    port = int(os.getenv("RDS_PORT", "5432"))
    if not host or not dbname or not user or not password:
        return None
    return psycopg.connect(host=host, dbname=dbname, user=user, password=password, port=port)


def fetch_job_identity_from_rds(conn: Any, job_id: str) -> dict[str, Any]:
    if conn is None:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              u."CognitoSub",
              j."RecruiterId"::text,
              c."Name",
              j."Location",
              j."EmploymentType",
              j."ExperienceLevel",
              j."SalaryMin",
              j."SalaryMax"
            FROM "Jobs" j
            INNER JOIN "RecruiterProfiles" rp ON j."RecruiterId" = rp."Id"
            INNER JOIN "Users" u ON rp."UserId" = u."Id"
            LEFT JOIN "Companies" c ON rp."CompanyId" = c."Id"
            WHERE j."Id" = %s::uuid
            LIMIT 1
            """,
            (str(job_id),),
        )
        row = cur.fetchone()
        if not row:
            return {}
        owner, recruiter_id, company_name, location, employment_type, experience_level, salary_min, salary_max = row
        return {
            "ownerCognitoSub": str(owner).strip() if owner else "",
            "recruiterId": str(recruiter_id).strip() if recruiter_id else "",
            "companyName": str(company_name).strip() if company_name else "",
            "location": str(location).strip() if location else "",
            "employmentType": str(employment_type).strip() if employment_type else "",
            "experienceLevel": str(experience_level).strip() if experience_level else "",
            "salaryRange": _to_decimal_salary(salary_min, salary_max),
        }


def scan_all(table: Any, **kwargs: Any):
    token = None
    while True:
        args = dict(kwargs)
        if token:
            args["ExclusiveStartKey"] = token
        page = table.scan(**args)
        for item in page.get("Items", []):
            yield item
        token = page.get("LastEvaluatedKey")
        if not token:
            break


def backfill_job_metadata(table: Any, conn: Any, dry_run: bool, stats: BackfillStats) -> dict[str, dict[str, Any]]:
    repaired_by_job_id: dict[str, dict[str, Any]] = {}
    for item in scan_all(
        table,
        FilterExpression=Attr("SK").eq("METADATA") & Attr("PK").begins_with("JOB#"),
    ):
        stats.job_metadata_scanned += 1
        pk = str(item.get("PK", ""))
        job_id = pk.replace("JOB#", "", 1)

        owner = str(item.get("ownerCognitoSub") or "").strip()
        recruiter = str(item.get("recruiterId") or "").strip()
        company = str(item.get("companyName") or "").strip()
        location = str(item.get("location") or "").strip()
        employment_type = str(item.get("employmentType") or item.get("jobType") or "").strip()
        experience = str(item.get("experienceLevel") or "").strip()
        salary = item.get("salaryRange")

        needs = not owner or not recruiter or not company or not location or not employment_type or not experience or not salary
        rds = {}
        if needs:
            rds = fetch_job_identity_from_rds(conn, job_id)
            if rds:
                stats.rds_hits += 1
            else:
                stats.rds_misses += 1

        set_parts: list[str] = ["updatedAt = :u"]
        values: dict[str, Any] = {}
        # Store real ISO timestamp without importing datetime repeatedly.
        from datetime import datetime, timezone
        values[":u"] = datetime.now(timezone.utc).isoformat()

        def set_if_missing(field: str, current: Any, fallback: Any) -> None:
            if current in (None, "", []):
                if fallback not in (None, "", []):
                    set_parts.append(f"{field} = if_not_exists({field}, :{field})")
                    values[f":{field}"] = fallback

        set_if_missing("ownerCognitoSub", owner, rds.get("ownerCognitoSub"))
        set_if_missing("recruiterId", recruiter, rds.get("recruiterId"))
        set_if_missing("companyName", company, rds.get("companyName"))
        set_if_missing("location", location, rds.get("location"))
        set_if_missing("employmentType", employment_type, rds.get("employmentType"))
        set_if_missing("jobType", str(item.get("jobType") or "").strip(), rds.get("employmentType"))
        set_if_missing("experienceLevel", experience, rds.get("experienceLevel"))
        if not salary and rds.get("salaryRange"):
            set_parts.append("salaryRange = if_not_exists(salaryRange, :salaryRange)")
            values[":salaryRange"] = rds["salaryRange"]

        if len(set_parts) == 1:
            repaired_by_job_id[job_id] = {
                "ownerCognitoSub": owner or rds.get("ownerCognitoSub", ""),
                "recruiterId": recruiter or rds.get("recruiterId", ""),
            }
            continue

        stats.job_metadata_updated += 1
        final_owner = owner or rds.get("ownerCognitoSub", "")
        final_recruiter = recruiter or rds.get("recruiterId", "")
        repaired_by_job_id[job_id] = {
            "ownerCognitoSub": final_owner,
            "recruiterId": final_recruiter,
        }

        if dry_run:
            continue

        table.update_item(
            Key={"PK": pk, "SK": "METADATA"},
            UpdateExpression="SET " + ", ".join(set_parts),
            ExpressionAttributeValues=values,
        )
    return repaired_by_job_id


def backfill_rankings(table: Any, repaired_by_job_id: dict[str, dict[str, Any]], dry_run: bool, stats: BackfillStats) -> None:
    from datetime import datetime, timezone

    for job_id, identity in repaired_by_job_id.items():
        pk = f"JOB#{job_id}"
        ranking = table.get_item(Key={"PK": pk, "SK": "CANDIDATE_RANKING"}).get("Item")
        if not ranking:
            continue
        stats.ranking_checked += 1
        owner = str(ranking.get("ownerCognitoSub") or "").strip()
        recruiter = str(ranking.get("recruiterId") or "").strip()
        owner_fill = identity.get("ownerCognitoSub", "")
        recruiter_fill = identity.get("recruiterId", "")
        if owner and recruiter:
            continue
        set_parts = ["updatedAt = :u"]
        values: dict[str, Any] = {":u": datetime.now(timezone.utc).isoformat()}
        if not owner and owner_fill:
            set_parts.append("ownerCognitoSub = if_not_exists(ownerCognitoSub, :owner)")
            values[":owner"] = owner_fill
        if not recruiter and recruiter_fill:
            set_parts.append("recruiterId = if_not_exists(recruiterId, :recruiter)")
            values[":recruiter"] = recruiter_fill
        if len(set_parts) == 1:
            continue
        stats.ranking_updated += 1
        if dry_run:
            continue
        table.update_item(
            Key={"PK": pk, "SK": "CANDIDATE_RANKING"},
            UpdateExpression="SET " + ", ".join(set_parts),
            ExpressionAttributeValues=values,
        )


def backfill_ranking_candidate_fields(table: Any, dry_run: bool, stats: BackfillStats) -> None:
    from datetime import datetime, timezone

    for item in scan_all(
        table,
        FilterExpression=Attr("PK").begins_with("JOB#") & Attr("SK").eq("CANDIDATE_RANKING"),
    ):
        ranked = item.get("rankedCandidates")
        if not isinstance(ranked, list):
            continue
        changed = False
        normalized_rows: list[dict[str, Any]] = []
        for row in ranked:
            if not isinstance(row, dict):
                normalized_rows.append(row)
                continue
            row_out = dict(row)
            if "contactInfo" not in row_out:
                row_out["contactInfo"] = {
                    "email": "",
                    "phone": "",
                    "githubUrl": "",
                    "linkedinUrl": "",
                    "portfolioUrl": "",
                }
                changed = True
            if "scoreBreakdown" not in row_out:
                final_score = row_out.get("finalScore", 0)
                row_out["scoreBreakdown"] = {
                    "hybridScore": final_score,
                    "projectRelevanceScore": 0,
                    "experienceAlignmentScore": 0,
                    "enrichmentScore": 0,
                    "finalScore": final_score,
                }
                changed = True
            if "evidenceHighlights" not in row_out:
                row_out["evidenceHighlights"] = []
                changed = True
            if "schemaVersion" not in row_out:
                row_out["schemaVersion"] = "2.0.0"
                changed = True
            normalized_rows.append(row_out)

        if not changed:
            continue

        stats.ranking_rows_enriched += 1
        if dry_run:
            continue

        table.update_item(
            Key={"PK": item["PK"], "SK": item["SK"]},
            UpdateExpression="SET rankedCandidates = :rows, updatedAt = :u",
            ExpressionAttributeValues={
                ":rows": normalized_rows,
                ":u": datetime.now(timezone.utc).isoformat(),
            },
        )


def backfill_candidate_cv_rows(table: Any, dry_run: bool, stats: BackfillStats) -> None:
    from datetime import datetime, timezone

    for item in scan_all(
        table,
        FilterExpression=Attr("PK").begins_with("CANDIDATE#") & Attr("SK").begins_with("CV#"),
    ):
        stats.cv_rows_scanned += 1
        missing_skills = item.get("candidateSkills") is None
        missing_interview = item.get("interviewGuide") is None
        missing_masking = item.get("maskingReport") is None
        missing_scoring = item.get("scoringDetails") is None
        missing_profile = item.get("parsedProfile") is None
        missing_schema = item.get("schemaVersion") is None
        missing_contact = item.get("contactInfo") is None
        if not (
            missing_skills
            or missing_interview
            or missing_masking
            or missing_scoring
            or missing_profile
            or missing_schema
            or missing_contact
        ):
            continue

        set_parts = ["updatedAt = :u"]
        values: dict[str, Any] = {":u": datetime.now(timezone.utc).isoformat()}
        if missing_skills:
            set_parts.append("candidateSkills = if_not_exists(candidateSkills, :skills)")
            values[":skills"] = []
        if missing_interview:
            set_parts.append("interviewGuide = if_not_exists(interviewGuide, :guide)")
            values[":guide"] = []
        if missing_masking:
            set_parts.append("maskingReport = if_not_exists(maskingReport, :mask)")
            values[":mask"] = {}
        if missing_scoring:
            set_parts.append("scoringDetails = if_not_exists(scoringDetails, :score)")
            values[":score"] = {}
        if missing_profile:
            set_parts.append("parsedProfile = if_not_exists(parsedProfile, :profile)")
            values[":profile"] = {"schema_version": "2.0.0"}
        if missing_schema:
            set_parts.append("schemaVersion = if_not_exists(schemaVersion, :schema)")
            values[":schema"] = "2.0.0"
        if missing_contact:
            set_parts.append("contactInfo = if_not_exists(contactInfo, :contact)")
            values[":contact"] = {
                "email": "",
                "phone": "",
                "githubUrl": "",
                "linkedinUrl": "",
                "portfolioUrl": "",
            }

        stats.cv_rows_updated += 1
        if dry_run:
            continue

        table.update_item(
            Key={"PK": item["PK"], "SK": item["SK"]},
            UpdateExpression="SET " + ", ".join(set_parts),
            ExpressionAttributeValues=values,
        )


def run(table_name: str, region: str, dry_run: bool) -> BackfillStats:
    ddb = boto3.resource("dynamodb", region_name=region)
    table = ddb.Table(table_name)
    stats = BackfillStats()
    conn = None
    try:
        conn = _connect_rds_from_env()
    except Exception:
        conn = None

    repaired = backfill_job_metadata(table, conn, dry_run, stats)
    backfill_rankings(table, repaired, dry_run, stats)
    backfill_ranking_candidate_fields(table, dry_run, stats)
    backfill_candidate_cv_rows(table, dry_run, stats)

    if conn is not None:
        conn.close()
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill SmartHire DynamoDB identity/context metadata.")
    parser.add_argument("--table", default=os.getenv("DYNAMODB_TABLE", "application_tracking"))
    parser.add_argument("--region", default=os.getenv("AWS_REGION", "us-east-1"))
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Execute updates. Without this flag, script runs in dry-run mode.",
    )
    args = parser.parse_args()

    dry_run = not args.execute
    stats = run(table_name=args.table, region=args.region, dry_run=dry_run)

    print("=== Backfill Report ===")
    print(f"mode: {'dry-run' if dry_run else 'execute'}")
    print(f"job_metadata_scanned: {stats.job_metadata_scanned}")
    print(f"job_metadata_updated: {stats.job_metadata_updated}")
    print(f"ranking_checked: {stats.ranking_checked}")
    print(f"ranking_updated: {stats.ranking_updated}")
    print(f"ranking_rows_enriched: {stats.ranking_rows_enriched}")
    print(f"cv_rows_scanned: {stats.cv_rows_scanned}")
    print(f"cv_rows_updated: {stats.cv_rows_updated}")
    print(f"rds_hits: {stats.rds_hits}")
    print(f"rds_misses: {stats.rds_misses}")
    print(f"errors: {stats.errors}")


if __name__ == "__main__":
    main()
