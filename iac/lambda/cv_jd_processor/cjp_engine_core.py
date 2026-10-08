"""CV/JD processing implementation (Textract, Bedrock, RDS, DynamoDB)."""
import json
import math
import os
import re
import ssl
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from cjp_clients import bedrock, dynamodb, secretsmanager, textract
from cjp_config import *
from cjp_skill_canonical_ai import (
    canonicalize_skills_batch,
    canonicalize_required_skill_bundle,
)

# ---------------------------------------------------------------------------
# Utility Helpers
# ---------------------------------------------------------------------------

def consolidate_skills_via_llm(extracted_data: dict[str, Any], cv_context: str = "") -> dict[str, list[str]]:
    """
    Use Claude/Bedrock to semantically consolidate raw extracted skills into standard buckets.
    AI learns domain relationships automatically — no manual mapping needed.

    Uses SKILL_CONSOLIDATION_MODEL_ID (Haiku by default) to avoid throttling the
    main Sonnet quota when many CVs are processed concurrently.
    Can be disabled entirely via ENABLE_SKILL_CONSOLIDATION=false env var.

    Args:
        extracted_data: Raw parsed CV with skills lists (frontend_skills, backend_skills, etc.)
        cv_context: Job titles, experience summary for context

    Returns:
        Consolidated skills dict with all detected domains
    """
    if not ENABLE_SKILL_CONSOLIDATION:
        return _fallback_skill_consolidation(extracted_data)
    # Collect all raw skills from named buckets
    all_raw_skills: list[str] = []
    for bucket in ["frontend_skills", "backend_skills", "devops_skills", "data_skills", "ai_skills",
                   "process_skills", "soft_skills", "embedded_skills", "blockchain_skills", "mobile_skills", "cloud_skills", "skills"]:
        raw = extracted_data.get(bucket) or []
        if isinstance(raw, list):
            all_raw_skills.extend([str(s).strip() for s in raw if s])

    # Also pull skills from dynamic skill_groups (Cybersecurity, Embedded, etc.)
    skill_groups = extracted_data.get("skill_groups") or {}
    if isinstance(skill_groups, dict):
        for group_skills in skill_groups.values():
            if isinstance(group_skills, list):
                all_raw_skills.extend([str(s).strip() for s in group_skills if s])

    if not all_raw_skills:
        print(f"WARNING: consolidate_skills_via_llm — no raw skills found in any bucket, returning empty")
        return {
            "frontend_skills": [],
            "backend_skills": [],
            "devops_skills": [],
            "data_skills": [],
            "ai_skills": [],
            "soft_skills": [],
            "embedded_skills": [],
            "blockchain_skills": [],
            "mobile_skills": [],
            "cloud_skills": [],
        }

    # Deduplicate while preserving order
    all_raw_skills = list(dict.fromkeys(all_raw_skills))[:80]
    print(f"INFO: consolidate_skills_via_llm — input {len(all_raw_skills)} skills: {all_raw_skills[:10]}...")
    
    try:
        system_prompt = """You are an expert technical skills classifier. Your job is to take a raw list of skills and sort each one into the correct bucket — NO EXPANSION, NO ADDING NEW SKILLS.

CRITICAL RULE — Do NOT expand tools into domain concepts:
Each input skill goes into EXACTLY ONE output bucket. Do not add "Mobile Development" just because you see "SwiftUI". Do not add "Backend Development" just because you see "Java". Keep the original skill label, just classify it correctly.

BUCKET DEFINITIONS:
- frontend_skills: Concrete UI tools only — React, Angular, Vue, HTML5, CSS3, JavaScript, TypeScript, Tailwind, Redux, Next.js, SwiftUI, Jetpack Compose, XML layouts
- backend_skills: Concrete backend tools only — Java, Python, Go/Golang, C/C++, Spring Boot, FastAPI, Flask, PostgreSQL, MySQL, MongoDB, Redis, REST API, gRPC, GraphQL, Microservices
- devops_skills: Concrete infra/ops tools — Docker, Kubernetes, Terraform, Jenkins, GitHub Actions, Prometheus, Grafana, Nginx, CI/CD pipelines (specific tools)
- data_skills: Concrete data tools — SQL, dbt, Airflow, Spark, Kafka, BigQuery, Snowflake, Data Modeling, ETL, Analytics Engineering
- ai_skills: Concrete AI/ML tools — PyTorch, TensorFlow, LangChain, RAG, MLflow, Pinecone, scikit-learn, YOLO, OpenCV, NLP, LLMs
- process_skills: Engineering methodologies and processes — SDLC, Software Development Lifecycle, Agile, Scrum, Kanban, UML, Feature-level Design, System Flows Modeling, TDD, BDD, Code Review, ITIL, Software Engineering Process
- soft_skills: NON-technical interpersonal skills ONLY — Communication, Leadership, Teamwork, Problem Solving, Attention to Detail, Cross-functional Collaboration, Mentorship
- cloud_skills: Cloud provider services — AWS, GCP, Azure, S3, Lambda, RDS, EKS, SageMaker, BigQuery (GCP), GKE, AKS
- embedded_skills: Embedded/IoT tools — RTOS, FreeRTOS, Arduino, ESP32, STM32, CAN Bus, SPI, I2C, FPGA, Firmware
- blockchain_skills: Blockchain tools — Solidity, Hardhat, Web3.js, EVM, Ethereum, Smart Contract Development
- mobile_skills: Mobile-specific tools — Swift, Kotlin, Flutter, React Native, Android SDK, iOS SDK

RULES:
1. Each input skill → exactly ONE bucket. Never duplicate across buckets.
2. Do NOT add skills that were not in the input list.
3. If a skill fits multiple buckets, pick the MOST specific one.
4. process_skills: SDLC/Agile/Scrum/UML go here, NOT in soft_skills.
5. soft_skills: Problem Solving / Attention to Detail go here, NOT in backend_skills.
6. "Mobile Application Development", "iOS Development", "Android Development" as broad labels → mobile_skills (they are valid mobile domain labels, not domain_experience).
7. "Full-Stack Web Development", "Backend Development" as broad labels → backend_skills.

Output ONLY valid JSON. No markdown, no explanation.

JSON Schema:
{
  "frontend_skills": ["array of skills or empty list"],
  "backend_skills": ["array of skills or empty list"],
  "devops_skills": ["array of skills or empty list"],
  "data_skills": ["array of skills or empty list"],
  "ai_skills": ["array of skills or empty list"],
  "process_skills": ["array of skills or empty list"],
  "soft_skills": ["array of skills or empty list"],
  "cloud_skills": ["array of skills or empty list"],
  "embedded_skills": ["array of skills or empty list"],
  "blockchain_skills": ["array of skills or empty list"],
  "mobile_skills": ["array of skills or empty list"]
}"""

        skills_list_str = ", ".join(all_raw_skills)
        user_message = f"""Classify these skills into the correct buckets. Do NOT add any new skills, only classify what is given:
Raw skills: {skills_list_str}

Candidate context: {cv_context}

Return each skill in exactly one bucket. Do not expand or add implied concepts."""
        
        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": SKILL_CONSOLIDATION_MAX_OUTPUT_TOKENS,
            "temperature": 0.0,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        }

        response = bedrock.invoke_model(
            modelId=SKILL_CONSOLIDATION_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload),
        )

        response_data = json.loads(response.get("body").read())
        model_text = response_data.get("content", [{}])[0].get("text", "{}")
        consolidated = safe_json_parse(model_text)
        
        if consolidated and isinstance(consolidated, dict):
            # Normalize each bucket — process_skills is new
            result = {}
            for domain in ["frontend_skills", "backend_skills", "devops_skills", "data_skills", "ai_skills", "process_skills", "soft_skills", "embedded_skills", "blockchain_skills", "mobile_skills", "cloud_skills"]:
                raw_list = consolidated.get(domain) or []
                result[domain] = normalize_skill_list(raw_list, max_items=25) if isinstance(raw_list, list) else []
            print(f"INFO: LLM consolidated {len(all_raw_skills)} raw skills into {sum(len(v) for v in result.values())} standardized")
            return result
        else:
            print("WARNING: LLM consolidation returned invalid JSON, using fallback")
            return _fallback_skill_consolidation(extracted_data)
    
    except Exception as exc:
        print(f"WARNING: LLM consolidation failed ({exc}), using fallback")
        return _fallback_skill_consolidation(extracted_data)


def _fallback_skill_consolidation(extracted_data: dict[str, Any]) -> dict[str, list[str]]:
    """
    Fallback when Bedrock call fails: preserve all already-extracted skills.
    Flattens skill_groups into backend_skills as a catch-all so no skills are lost.
    """
    # Flatten skill_groups into a flat list (best-effort preservation)
    sg_flat: list[str] = []
    skill_groups = extracted_data.get("skill_groups") or {}
    if isinstance(skill_groups, dict):
        for group_skills in skill_groups.values():
            if isinstance(group_skills, list):
                sg_flat.extend([str(s).strip() for s in group_skills if s])

    # For the 4 specialty buckets: prefer existing data, then try to pull from skill_groups
    embedded = normalize_skill_list(extracted_data.get("embedded_skills", []) or [], 25)
    blockchain = normalize_skill_list(extracted_data.get("blockchain_skills", []) or [], 25)
    mobile = normalize_skill_list(extracted_data.get("mobile_skills", []) or [], 25)
    cloud = normalize_skill_list(extracted_data.get("cloud_skills", []) or [], 25)

    # Merge skill_groups overflow into backend_skills (safe catch-all bucket)
    backend_raw = list(extracted_data.get("backend_skills") or []) + sg_flat

    return {
        "frontend_skills": normalize_skill_list(extracted_data.get("frontend_skills", []), 25),
        "backend_skills": normalize_skill_list(backend_raw, 30),
        "devops_skills": normalize_skill_list(extracted_data.get("devops_skills", []), 25),
        "data_skills": normalize_skill_list(extracted_data.get("data_skills", []), 25),
        "ai_skills": normalize_skill_list(extracted_data.get("ai_skills", []), 25),
        "process_skills": normalize_skill_list(extracted_data.get("process_skills", []), 25),
        "soft_skills": normalize_skill_list(extracted_data.get("soft_skills", []), 25),
        "embedded_skills": embedded,
        "blockchain_skills": blockchain,
        "mobile_skills": mobile,
        "cloud_skills": cloud,
    }



def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def expires_at_epoch() -> int:
    return int(
        (datetime.now(timezone.utc) + timedelta(days=PARSE_STATUS_TTL_DAYS)).timestamp()
    )


def safe_json_parse(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception as exc:
        # Try stripping markdown fences (```json ... ```)
        cleaned = (text or "").strip()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            cleaned = parts[1] if len(parts) > 1 else cleaned
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:].lstrip()
            try:
                return json.loads(cleaned)
            except Exception:
                pass
        print(f"WARNING: safe_json_parse failed ({exc}), text_len={len(text)}, preview={text[:200]!r}")
        return {
            "schema_version": CV_PROFILE_SCHEMA_VERSION,
            "frontend_skills": [],
            "backend_skills": [],
            "devops_skills": [],
            "data_skills": [],
            "ai_skills": [],
            "skill_groups": {},
            "soft_skills": [],
            "projects": [],
            "professional_experience": [],
            "domain_experience": [],
            "certifications": [],
            "education": [],
            "seniority_evidence": [],
            "recency_signals": {},
            "years_experience": 0,
            "matching_score": 0,
            "strengths": "",
            "gaps": "",
        }


def _collapse_spaces(text: str) -> str:
    return " ".join((text or "").split())


def normalize_skill_list(skills: list[Any], max_items: int = 30) -> list[str]:
    """
    Normalize a raw list of skills while preserving casing and deduplicating.
    Mapping is now handled by LLM consolidation, not here.
    """
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


def _auxiliary_skill_strings(parsed_data: dict[str, Any]) -> list[Any]:
    """Project stacks, recency stack, certs, domain — often where MS/Azure terms live."""
    out: list[Any] = []
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


def _flatten_skill_groups(parsed_data: dict[str, Any]) -> list[Any]:
    """
    Flatten skill_groups dict — handles any domain AI decides to create.
    e.g. {"Cybersecurity": ["OWASP", "SIEM"], "Mobile": ["Swift", "Flutter"]}
    → ["OWASP", "SIEM", "Swift", "Flutter"]
    """
    sg = parsed_data.get("skill_groups")
    if not isinstance(sg, dict):
        return []
    out: list[Any] = []
    for group_skills in sg.values():
        if isinstance(group_skills, list):
            out.extend(group_skills)
    return out


def extract_candidate_skills_from_parsed_data(parsed_data: dict[str, Any]) -> dict[str, list[str]]:
    """
    Build a structured candidate skill profile from parsed CV fields.
    Returns a dict with 4 distinct skill categories instead of a flat list:
      - hardSkills: concrete tools, languages, frameworks
      - processSkills: methodologies (SDLC, Agile, UML...)
      - softSkills: interpersonal/non-technical skills
      - domainExpertise: broad specialization labels (for display only, not matching)
    """
    # Hard skills = all concrete technical tool buckets
    hard_buckets = [
        parsed_data.get("frontend_skills", []),
        parsed_data.get("backend_skills", []),
        parsed_data.get("devops_skills", []),
        parsed_data.get("data_skills", []),
        parsed_data.get("ai_skills", []),
        parsed_data.get("embedded_skills", []),
        parsed_data.get("blockchain_skills", []),
        parsed_data.get("mobile_skills", []),
        parsed_data.get("cloud_skills", []),
        parsed_data.get("skills", []),
        _flatten_skill_groups(parsed_data),
        _auxiliary_skill_strings(parsed_data),
    ]
    hard_combined: list[Any] = []
    for bucket in hard_buckets:
        if isinstance(bucket, list):
            hard_combined.extend(bucket)

    return {
        "hardSkills": normalize_skill_list(hard_combined, max_items=MAX_CANDIDATE_SKILLS),
        "processSkills": normalize_skill_list(parsed_data.get("process_skills", []), max_items=30),
        "softSkills": normalize_skill_list(parsed_data.get("soft_skills", []), max_items=20),
        "domainExpertise": normalize_skill_list(parsed_data.get("domain_experience", []), max_items=20),
    }


def _ensure_list_of_strings(raw: Any, max_items: int = 25) -> list[str]:
    if not isinstance(raw, list):
        return []
    return normalize_skill_list(raw, max_items=max_items)


def _ensure_projects(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw[:12]:
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "name": str(item.get("name", "")).strip(),
                "role": str(item.get("role", "")).strip(),
                "stack": _ensure_list_of_strings(item.get("stack", []), max_items=20),
                "outcome": str(item.get("outcome", "")).strip(),
                "duration": str(item.get("duration", "")).strip(),
            }
        )
    return out


def _ensure_professional_experience(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw[:20]:
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "company": str(item.get("company", "")).strip(),
                "title": str(item.get("title", "")).strip(),
                "start": str(item.get("start", "")).strip(),
                "end": str(item.get("end", "")).strip(),
                "responsibilities": _ensure_list_of_strings(
                    item.get("responsibilities", []), max_items=12
                ),
                "impact": str(item.get("impact", "")).strip(),
            }
        )
    return out


def enrich_parsed_profile(parsed_data: dict[str, Any]) -> dict[str, Any]:
    """
    Normalize Agent-1 output into a versioned, backward-compatible contract.
    THEN call LLM skill consolidation to group semantically + detect new domains.
    """
    profile = dict(parsed_data or {})
    profile["schema_version"] = CV_PROFILE_SCHEMA_VERSION
    profile["frontend_skills"] = _ensure_list_of_strings(
        profile.get("frontend_skills", []), max_items=SKILL_BUCKET_MAX_ITEMS
    )
    profile["backend_skills"] = _ensure_list_of_strings(
        profile.get("backend_skills", []), max_items=SKILL_BUCKET_MAX_ITEMS
    )
    profile["devops_skills"] = _ensure_list_of_strings(
        profile.get("devops_skills", []), max_items=SKILL_BUCKET_MAX_ITEMS
    )
    profile["data_skills"] = _ensure_list_of_strings(
        profile.get("data_skills", []), max_items=SKILL_BUCKET_MAX_ITEMS
    )
    profile["ai_skills"] = _ensure_list_of_strings(
        profile.get("ai_skills", []), max_items=SKILL_BUCKET_MAX_ITEMS
    )
    # skill_groups: dynamic dict — normalize each group's list, drop empty groups
    raw_sg = profile.get("skill_groups")
    if isinstance(raw_sg, dict):
        profile["skill_groups"] = {
            str(group_name).strip(): _ensure_list_of_strings(group_skills, max_items=SKILL_BUCKET_MAX_ITEMS)
            for group_name, group_skills in raw_sg.items()
            if str(group_name).strip() and isinstance(group_skills, list) and group_skills
        }
    else:
        profile["skill_groups"] = {}
    profile["soft_skills"] = _ensure_list_of_strings(
        profile.get("soft_skills", []), max_items=SKILL_BUCKET_MAX_ITEMS
    )
    profile["process_skills"] = _ensure_list_of_strings(
        profile.get("process_skills", []), max_items=SKILL_BUCKET_MAX_ITEMS
    )
    profile["projects"] = _ensure_projects(profile.get("projects", []))
    profile["professional_experience"] = _ensure_professional_experience(
        profile.get("professional_experience", [])
    )
    profile["domain_experience"] = _ensure_list_of_strings(profile.get("domain_experience", []))
    profile["certifications"] = _ensure_list_of_strings(profile.get("certifications", []))
    profile["education"] = _ensure_list_of_strings(profile.get("education", []))
    profile["seniority_evidence"] = _ensure_list_of_strings(profile.get("seniority_evidence", []))
    profile["recency_signals"] = (
        profile.get("recency_signals", {}) if isinstance(profile.get("recency_signals", {}), dict) else {}
    )
    try:
        profile["years_experience"] = int(profile.get("years_experience", 0) or 0)
    except (TypeError, ValueError):
        profile["years_experience"] = 0
    
    # NEW: Call LLM to semantically consolidate skills + detect additional domains
    # Build cv_context from professional_experience (current_title not in schema)
    prof_exp = profile.get("professional_experience") or []
    latest_title = ""
    if isinstance(prof_exp, list) and prof_exp and isinstance(prof_exp[0], dict):
        latest_title = str(prof_exp[0].get("title", "")).strip()
    years_exp = profile.get("years_experience", 0)
    cv_context = f"{latest_title} with {years_exp}+ years experience" if latest_title else f"{years_exp}+ years experience"
    consolidated = consolidate_skills_via_llm(profile, cv_context)

    # Replace named buckets with consolidated output (LLM has better semantic understanding)
    profile["frontend_skills"] = consolidated.get("frontend_skills", [])
    profile["backend_skills"] = consolidated.get("backend_skills", [])
    profile["devops_skills"] = consolidated.get("devops_skills", [])
    profile["data_skills"] = consolidated.get("data_skills", [])
    profile["ai_skills"] = consolidated.get("ai_skills", [])
    profile["process_skills"] = consolidated.get("process_skills", [])
    profile["soft_skills"] = consolidated.get("soft_skills", [])

    # Always store specialty buckets (even empty) so downstream readers don't need .get() guards
    profile["cloud_skills"] = consolidated.get("cloud_skills", [])
    profile["embedded_skills"] = consolidated.get("embedded_skills", [])
    profile["blockchain_skills"] = consolidated.get("blockchain_skills", [])
    profile["mobile_skills"] = consolidated.get("mobile_skills", [])
    
    return profile


def _clean_person_name_value(raw: str) -> str:
    """Strip label noise and inline contact suffixes from a captured name string."""
    s = (raw or "").strip().strip("•-*–—|")
    if not s:
        return ""
    for sep in (
        r"\s+Email\s*[:：]",
        r"\s+E-?mail\s*[:：]",
        r"\s+Phone\s*[:：]",
        r"\s+Mobile\s*[:：]",
        r"\s+Tel\s*[:：]",
        r"\s+LinkedIn\s*[:：]",
        r"\s+GitHub\s*[:：]",
    ):
        parts = re.split(sep, s, maxsplit=1, flags=re.I)
        s = parts[0].strip()
    return s.strip("•-*–—|").strip()


def _is_plausible_person_display_name(s: str) -> bool:
    if len(s) < 3 or len(s) > 100:
        return False
    if "@" in s or re.search(r"https?://", s, flags=re.I):
        return False
    low = s.lower()
    if any(x in low for x in ("linkedin.com", "github.com", "curriculum vitae", "resume", "vitae")):
        return False
    words = s.split()
    if len(words) < 2 or len(words) > 8:
        return False
    junk = {
        "full",
        "name",
        "email",
        "phone",
        "mobile",
        "personal",
        "information",
        "contact",
        "location",
        "address",
    }
    if all(w.strip(",.").lower() in junk for w in words):
        return False
    letters = sum(1 for c in s if c.isalpha())
    if letters < max(4, len(s) // 4):
        return False
    return True


def _extract_full_name_from_cv_text(source: str) -> str:
    """
    Prefer explicit CV labels (Full Name:, etc.), then a conservative line heuristic.
    Avoids false positives like '1. Personal Information' or 'CURRICULUM VITAE – ...'.
    """
    text = source or ""
    if not text.strip():
        return ""

    labeled_patterns = [
        r"(?im)^\s*Full\s+Name\s*[:：]\s*(.+?)\s*$",
        r"(?im)^\s*(?:Candidate|Applicant)\s+Name\s*[:：]\s*(.+?)\s*$",
        r"(?im)^\s*Họ\s+và\s+tên\s*[:：]\s*(.+?)\s*$",
        r"(?im)^\s*Tên\s+đầy\s+đủ\s*[:：]\s*(.+?)\s*$",
        r"(?im)^\s*姓名\s*[:：]\s*(.+?)\s*$",
    ]
    for pat in labeled_patterns:
        m = re.search(pat, text)
        if m:
            candidate = _clean_person_name_value(m.group(1))
            if candidate and _is_plausible_person_display_name(candidate):
                return candidate

    for m in re.finditer(r"(?im)^\s*Name\s*[:：]\s*(.+?)\s*$", text):
        candidate = _clean_person_name_value(m.group(1))
        if candidate and _is_plausible_person_display_name(candidate):
            return candidate

    section_or_title_re = re.compile(
        r"(?ix) ^\s*(?:\d+[\.)]\s*)? (?:"
        r"CURRICULUM\s+VITAE|RESUM[ÉE]|VITAE\b|\bCV\b|"
        r"PERSONAL\s+INFORMATION|CONTACT(?:\s+INFORMATION|\s+DETAILS)?|"
        r"PROFESSIONAL\s+EXPERIENCE|WORK\s+EXPERIENCE|EDUCATION|PROJECTS|"
        r"SKILLS|SUMMARY|OBJECTIVE|CERTIFICATIONS|REFERENCES|AWARDS"
        r")\s*$"
    )

    lines = [L.strip() for L in text.replace("\r\n", "\n").split("\n") if L.strip()]
    for line in lines[:45]:
        if len(line) > 80:
            continue
        if "@" in line or re.search(r"https?://", line, flags=re.I) or re.search(r"\bwww\.", line, flags=re.I):
            continue
        if re.match(r"(?i)^(email|e-?mail|phone|mobile|tel|location|address|linkedin|github)\s*[:：]", line):
            continue
        if section_or_title_re.match(line):
            continue
        if re.match(r"^\d+[\.)]\s+", line) and not re.search(r"(?i)full\s+name|name\s*[:：]", line):
            continue
        if re.search(r"(?i)(?:CURRICULUM|VITAE|RESUM[ÉE])", line):
            continue
        if line.count(":") >= 1 and re.match(r"^[^:\n]{1,40}:\s*\S", line):
            # Other labeled rows (Job Title:, etc.) — skip unless looks like bare name after short key
            key = line.split(":", 1)[0].strip().lower()
            if key not in ("name",) and not re.fullmatch(r"full\s+name", key):
                continue
        words = line.split()
        if len(words) < 2:
            continue
        if not _is_plausible_person_display_name(line):
            continue
        return line.strip()

    return ""


def _norm_url_from_match(match: re.Match[str] | None) -> str:
    if not match:
        return ""
    raw = match.group(0).strip()
    return raw if raw.lower().startswith("http") else f"https://{raw}"


def _extract_candidate_contact_info_regex(raw_cv_text: str) -> dict[str, str]:
    """Heuristic contact parse from raw CV text (fast fallback)."""
    source = raw_cv_text or ""
    email_match = re.search(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", source)
    phone_match = re.search(r"(?:(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4})", source)
    github_match = re.search(r"(https?://)?(www\.)?github\.com/[A-Za-z0-9_.-]+", source, flags=re.I)
    linkedin_match = re.search(
        r"(https?://)?([a-z]{2,3}\.)?linkedin\.com/(in|pub|company)/[A-Za-z0-9_.-]+",
        source,
        flags=re.I,
    )
    portfolio_match = re.search(
        r"https?://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=-]*)?",
        source,
        flags=re.I,
    )

    full_name = _extract_full_name_from_cv_text(source)

    portfolio = _norm_url_from_match(portfolio_match)
    if portfolio and ("linkedin.com/" in portfolio.lower() or "github.com/" in portfolio.lower()):
        portfolio = ""

    return {
        "fullName": full_name,
        "email": (email_match.group(0).strip() if email_match else ""),
        "phone": (phone_match.group(0).strip() if phone_match else ""),
        "githubUrl": _norm_url_from_match(github_match),
        "linkedinUrl": _norm_url_from_match(linkedin_match),
        "portfolioUrl": portfolio,
    }


def _strip_json_fence(text: str) -> str:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        cleaned = parts[1] if len(parts) > 1 else cleaned
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].lstrip()
    return cleaned.strip()


def _ensure_https_url(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    if u.lower().startswith("http://") or u.lower().startswith("https://"):
        return u
    return f"https://{u}"


def _coerce_llm_contact_row(obj: dict[str, Any]) -> dict[str, str]:
    """Map model JSON (including common aliases) to fixed recruiter keys."""
    if not isinstance(obj, dict):
        return {}

    def pick(*keys: str) -> str:
        for k in keys:
            v = obj.get(k)
            if v is None:
                continue
            s = str(v).strip()
            if s:
                return s
        return ""

    full_name = pick("fullName", "full_name", "name", "displayName")
    email = pick("email", "e_mail", "emailAddress")
    phone = pick("phone", "mobile", "telephone", "tel")
    gh = _ensure_https_url(pick("githubUrl", "github_url", "github"))
    li = _ensure_https_url(pick("linkedinUrl", "linkedin_url", "linkedin"))
    port = _ensure_https_url(pick("portfolioUrl", "portfolio_url", "website", "personalWebsite"))

    if port and ("linkedin.com/" in port.lower() or "github.com/" in port.lower()):
        port = ""

    return {
        "fullName": full_name,
        "email": email,
        "phone": phone,
        "githubUrl": gh,
        "linkedinUrl": li,
        "portfolioUrl": port,
    }


def _extract_candidate_contact_info_llm(raw_cv_text: str) -> dict[str, str]:
    """
    Bedrock: strict JSON contact row from raw CV (pre-PII-mask).
    On any failure returns {} so caller can merge with regex fallback.
    """
    snippet = (raw_cv_text or "")[:CONTACT_EXTRACTION_MAX_CHARS]
    if not snippet.strip():
        return {}

    system_prompt = """You extract recruiter-visible contact fields from a resume/CV text.

Output ONLY one JSON object, no markdown fences, no commentary. Shape exactly:
{"fullName":"","email":"","phone":"","githubUrl":"","linkedinUrl":"","portfolioUrl":""}

Rules:
- Use only information explicitly present in the CV. Never invent email, phone, or URLs.
- fullName: the person's own name as written (header or clearly labeled name), not company names.
- email / phone: at most one primary value each if clearly the candidate's.
- githubUrl / linkedinUrl: profile URLs only if explicitly shown.
- portfolioUrl: personal site or portfolio if clearly the candidate's; must NOT be linkedin.com or github.com.
- Empty string for any field not found."""

    user_message = f"<resume>\n{snippet}\n</resume>"
    payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 400,
        "temperature": 0,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    }

    try:
        response = bedrock.invoke_model(
            modelId=CONTACT_EXTRACTION_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload),
        )
        response_data = json.loads(response.get("body").read())
        model_text = response_data.get("content", [{}])[0].get("text", "")
        parsed = json.loads(_strip_json_fence(model_text))
        row = _coerce_llm_contact_row(parsed)
        print(
            "INFO: LLM contact extraction "
            f"(model={CONTACT_EXTRACTION_MODEL_ID}): "
            f"name={'yes' if row.get('fullName') else 'no'}, "
            f"email={'yes' if row.get('email') else 'no'}, "
            f"phone={'yes' if row.get('phone') else 'no'}"
        )
        return row
    except Exception as exc:
        print(f"WARNING: LLM contact extraction failed, will use regex fill: {exc}")
        return {}


def extract_candidate_contact_info(raw_cv_text: str) -> dict[str, str]:
    """
    Recruiter-view contact fields from raw CV text (never fed to scoring models).

    Primary: Bedrock JSON parse (handles varied CV layouts / labels).
    Fallback / gap-fill: regex heuristics when LLM is disabled or misses a field.
    """
    regex_row = _extract_candidate_contact_info_regex(raw_cv_text)
    if not ENABLE_LLM_CONTACT_EXTRACTION:
        return regex_row

    llm_row = _extract_candidate_contact_info_llm(raw_cv_text)
    merged: dict[str, str] = {}
    for key in ("fullName", "email", "phone", "githubUrl", "linkedinUrl", "portfolioUrl"):
        lv = (llm_row.get(key) or "").strip()
        rv = (regex_row.get(key) or "").strip()
        merged[key] = lv or rv
    return merged


def extract_required_skills_from_jd_ai(
    jd_text: str,
    job_title: str,
    provided_required_skills: list[Any] | None,
) -> list[str]:
    """
    Use AI to extract required skills from JD text when upstream payload does not provide them.
    """
    provided = normalize_skill_list(provided_required_skills or [], max_items=MAX_REQUIRED_SKILLS)
    if provided:
        return provided
    if not jd_text or not jd_text.strip():
        return []

    prompt = f"""Extract required skills from this job description.
Return strict JSON only in this shape:
{{"required_skills":["skill1","skill2"]}}

Rules:
- Include technical hard skills and process/methodology skills only.
- EXCLUDE: Education/degree requirements (Bachelor's, Master's, PhD, etc.) — put nothing.
- EXCLUDE: Language proficiency requirements (English, Vietnamese, Mandarin, etc.).
- EXCLUDE: Years of experience requirements (e.g. "3+ years experience").
- EXCLUDE: Soft skills like Communication, Leadership, Problem Solving — these are not required skills.
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
        parsed = safe_json_parse(text)
        return normalize_skill_list(parsed.get("required_skills", []), max_items=MAX_REQUIRED_SKILLS)
    except Exception as exc:
        print(f"WARNING: JD required-skill extraction failed, fallback to empty list: {exc}")
        return []


def extract_required_skill_groups_from_jd_ai(
    jd_text: str,
    job_title: str,
    hint_skills: list[str] | None = None,
) -> dict[str, Any]:
    if not jd_text or not jd_text.strip():
        return {"must_have": [], "one_of": [], "nice_to_have": []}

    hint_section = ""
    if hint_skills:
        hint_section = (
            f"Previously extracted required skills: {', '.join(hint_skills[:20])}\n"
            f"Classify these skills into must_have / one_of / nice_to_have based "
            f"on the wording of the job description below.\n\n"
        )

    prompt = f"""{hint_section}Extract grouped skill requirements from this job description.
Return strict JSON only in this shape:
{{
  "must_have": ["skill"],
  "one_of": [{{"label":"group name","options":["skill1","skill2"]}}],
  "nice_to_have": ["skill"]
}}

Rules:
- Technical hard skills and process/methodology skills only.
- EXCLUDE: Education/degree requirements (Bachelor's, Master's, PhD) — do NOT include in any group.
- EXCLUDE: Language proficiency (English, Vietnamese, Mandarin, etc.) — do NOT include in any group.
- EXCLUDE: Years of experience requirements — do NOT include.
- EXCLUDE: Soft skills (Communication, Leadership, Problem Solving) — do NOT include.
- `must_have`: explicit mandatory technical capabilities.
- `one_of`: alternatives where one option is enough.
- `nice_to_have`: optional technical bonuses.
- Keep concise labels.
- Max {MAX_REQUIRED_SKILLS} total distinct skill strings.

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
        parsed = safe_json_parse(response_data.get("content", [{}])[0].get("text", "{}"))
    except Exception as exc:
        print(f"WARNING: JD required-group extraction failed, fallback to empty groups: {exc}")
        parsed = {}

    must = normalize_skill_list(parsed.get("must_have", []), max_items=MAX_REQUIRED_SKILLS)
    nice = normalize_skill_list(parsed.get("nice_to_have", []), max_items=MAX_REQUIRED_SKILLS)
    one_of_raw = parsed.get("one_of", [])
    one_of: list[dict[str, Any]] = []
    if isinstance(one_of_raw, list):
        for item in one_of_raw[:10]:
            if not isinstance(item, dict):
                continue
            options = normalize_skill_list(item.get("options", []), max_items=8)
            if not options:
                continue
            one_of.append({
                "label": _collapse_spaces(str(item.get("label", "")).strip()) or "One-of group",
                "options": options,
            })
    return {"must_have": must, "one_of": one_of, "nice_to_have": nice}


# ---------------------------------------------------------------------------
# RDS Connection Helper
# ---------------------------------------------------------------------------

_rds_secret_cache: dict | None = None


def _resolve_rds_credentials() -> dict[str, Any]:
    """Load and cache DB credentials from Secrets Manager."""
    global _rds_secret_cache

    if _rds_secret_cache is not None:
        return _rds_secret_cache

    if not RDS_SECRET_ARN:
        raise RuntimeError("RDS_SECRET_ARN is missing")

    response = secretsmanager.get_secret_value(SecretId=RDS_SECRET_ARN)
    secret_string = response.get("SecretString")
    if not secret_string:
        raise RuntimeError("RDS secret has no SecretString")

    parsed = json.loads(secret_string)
    _rds_secret_cache = {
        "username": parsed.get("username", ""),
        "password": parsed.get("password", ""),
        "host": parsed.get("host", ""),
        "port": int(parsed.get("port", 5432)),
        "dbname": parsed.get("dbname", RDS_DATABASE),
    }
    return _rds_secret_cache


def _get_rds_connection():
    """Open a connection to RDS via pg8000."""
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


# ===========================================================================
# JD PATH: Read Job Description from RDS
# ===========================================================================


def _to_float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def jd_text_to_markdown(jd_text: str) -> str:
    """Lightweight plain-text → Markdown for recruiter/candidate UI."""
    text = (jd_text or "").strip()
    if not text:
        return ""
    text = text.replace("\r\n", "\n")
    blocks = [b.strip() for b in text.split("\n\n") if b.strip()]
    if not blocks:
        blocks = [text]
    parts: list[str] = []
    for block in blocks:
        if block.startswith("#"):
            parts.append(block)
            continue
        lines_out: list[str] = []
        for line in block.split("\n"):
            s = line.strip()
            if not s:
                continue
            if s.startswith(("- ", "* ")):
                lines_out.append(s)
            elif s.startswith("•"):
                lines_out.append("- " + s[1:].strip())
            else:
                lines_out.append(s)
        parts.append("\n".join(lines_out))
    return "\n\n".join(parts)


def read_jd_from_rds(job_id: str) -> dict[str, Any]:
    """
    Read job row + recruiter owner Cognito sub from RDS.

    Returns title, description, display/job metadata, recruiter_id, owner_cognito_sub.
    Raises RuntimeError if the job is not found or has no description.
    """
    conn = _get_rds_connection()
    try:
        rows = conn.run(
            """
            SELECT j."Title", j."Description", j."Location", j."EmploymentType",
                   j."SalaryMin", j."SalaryMax", j."ExperienceLevel", j."RecruiterId",
                   u."CognitoSub", c."Name"
            FROM "Jobs" j
            INNER JOIN "RecruiterProfiles" rp ON j."RecruiterId" = rp."Id"
            INNER JOIN "Users" u ON rp."UserId" = u."Id"
            LEFT JOIN "Companies" c ON rp."CompanyId" = c."Id"
            WHERE j."Id" = :jid::uuid
            """,
            jid=str(job_id),
        )
        if not rows:
            raise RuntimeError(f"Job {job_id} not found in RDS")

        row = rows[0]
        (
            title,
            description,
            location,
            employment_type,
            salary_min,
            salary_max,
            experience_level,
            recruiter_id,
            cognito_sub,
            company_name,
        ) = row
        if not description or not str(description).strip():
            raise RuntimeError(f"Job {job_id} has no description text in RDS")

        description = str(description).strip()
        print(f"INFO: Read JD from RDS for job {job_id} — {len(description)} chars")
        return {
            "title": title or "Unknown",
            "description": description,
            "location": (location or "").strip() if location else "",
            "employment_type": (employment_type or "").strip() if employment_type else "",
            "salary_min": _to_float_or_none(salary_min),
            "salary_max": _to_float_or_none(salary_max),
            "experience_level": (experience_level or "").strip() if experience_level else "",
            "recruiter_id": str(recruiter_id) if recruiter_id else "",
            "owner_cognito_sub": (cognito_sub or "").strip() if cognito_sub else "",
            "company_name": (company_name or "").strip() if company_name else "",
        }
    finally:
        conn.close()


# ===========================================================================
# CV PATH: Text Extraction & Analysis
# ===========================================================================


# ---------------------------------------------------------------------------
# Textract: CV Text Extraction
# ---------------------------------------------------------------------------

def extract_text_from_s3(bucket: str, key: str) -> str:
    """Extract text from PDF using Amazon Textract (async)."""
    response = textract.start_document_text_detection(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    job_id = response["JobId"]

    while True:
        result = textract.get_document_text_detection(JobId=job_id, MaxResults=1000)
        status = result.get("JobStatus")
        if status == "SUCCEEDED":
            break
        if status == "FAILED":
            raise RuntimeError("Textract job failed")
        time.sleep(2)

    lines = []
    next_token = None
    while True:
        kwargs = {"JobId": job_id, "MaxResults": 1000}
        if next_token:
            kwargs["NextToken"] = next_token
        page = textract.get_document_text_detection(**kwargs)
        for block in page.get("Blocks", []):
            if block.get("BlockType") == "LINE" and block.get("Text"):
                lines.append(block["Text"])
        next_token = page.get("NextToken")
        if not next_token:
            break

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Blind Screening — spaCy NER PII Masker
# ---------------------------------------------------------------------------

_spacy_nlp = None

_PII_LABEL_TOKENS = {
    "PERSON": "[CANDIDATE_NAME]",
    "ORG":    "[ORGANIZATION]",
    "GPE":    "[LOCATION]",
    "LOC":    "[LOCATION]",
    "NORP":   "[DEMOGRAPHIC]",
}


def _mask_with_patterns(text: str) -> tuple[str, dict[str, int]]:
    masked = text or ""
    counts: dict[str, int] = {}
    patterns = [
        ("EMAIL", r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", "[EMAIL]"),
        ("PHONE", r"(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}", "[PHONE]"),
        ("DOB", r"\b(?:DOB|Date of Birth|Birth)\s*[:\-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", "[DOB]"),
        ("ADDRESS", r"(?im)^\s*(?:address|địa chỉ)\s*[:\-].*$", "[ADDRESS]"),
    ]
    for label, pattern, repl in patterns:
        masked, n = re.subn(pattern, repl, masked, flags=re.I)
        if n:
            counts[label] = counts.get(label, 0) + n
    return masked, counts


def _detect_mask_leaks(text: str) -> dict[str, bool]:
    candidate = text or ""
    return {
        "email_leak_detected": bool(re.search(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", candidate)),
        "phone_leak_detected": bool(re.search(r"(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}", candidate)),
    }


def _get_spacy_model():
    """Load and cache spaCy NER model. Non-fatal if unavailable."""
    global _spacy_nlp

    if _spacy_nlp is not None:
        return _spacy_nlp

    try:
        import spacy  # type: ignore

        baked_model_path = os.environ.get("SPACY_MODEL_PATH", "/opt/ml/spacy_model")
        if os.path.isdir(baked_model_path):
            _spacy_nlp = spacy.load(baked_model_path)
            print(f"INFO: spaCy model loaded from: {baked_model_path}")
        else:
            _spacy_nlp = spacy.load("en_core_web_sm")
            print("INFO: spaCy model loaded from package.")
        return _spacy_nlp

    except (ImportError, OSError) as exc:
        print(f"WARNING: spaCy unavailable: {exc}. Blind screening disabled.")
        return None


def mask_pii_entities(raw_text: str) -> tuple[str, dict]:
    """Replace PII entities with neutral tokens. Non-fatal fallback."""
    pattern_masked, pattern_counts = _mask_with_patterns(raw_text)
    if not ENABLE_BLIND_SCREENING:
        leak_report = _detect_mask_leaks(pattern_masked)
        report = {
            "blind_screening": "disabled",
            "pattern_masking": pattern_counts,
            **leak_report,
        }
        print(f"INFO: Mask report (regex-only): {report}")
        return pattern_masked, report

    nlp = _get_spacy_model()
    if nlp is None:
        leak_report = _detect_mask_leaks(pattern_masked)
        report = {
            "blind_screening": "unavailable",
            "pattern_masking": pattern_counts,
            **leak_report,
        }
        print(f"INFO: Mask report (regex-only): {report}")
        return pattern_masked, report

    doc = nlp(pattern_masked)
    entities_to_mask = [
        ent for ent in doc.ents if ent.label_ in _PII_LABEL_TOKENS
    ]
    entities_to_mask.sort(key=lambda e: e.start_char, reverse=True)

    masked_text = pattern_masked
    masking_counts: dict[str, int] = {}

    for ent in entities_to_mask:
        label = ent.label_
        token = _PII_LABEL_TOKENS[label]
        masked_text = masked_text[: ent.start_char] + token + masked_text[ent.end_char :]
        masking_counts[label] = masking_counts.get(label, 0) + 1

    total_masked = sum(masking_counts.values())
    leak_report = _detect_mask_leaks(masked_text)
    masking_report = {
        "blind_screening": "applied",
        "pattern_masking": pattern_counts,
        "total_entities_masked": total_masked,
        "by_label": masking_counts,
        **leak_report,
    }
    print(f"INFO: Masked {total_masked} PII entities: {masking_counts}")
    print(f"INFO: Mask leak checks: {leak_report}")
    return masked_text, masking_report


# ---------------------------------------------------------------------------
# Unified CV Extraction via Bedrock
# ---------------------------------------------------------------------------

def extract_candidate_data_comprehensive(raw_cv_text: str) -> dict[str, Any]:
    """
    Use Claude/Bedrock to comprehensively extract ALL candidate information from raw CV:
    - fullName, email, phone, LinkedIn, GitHub, portfolio
    - Skills (frontend, backend, devops, soft)
    - Experience, education, projects, certifications
    - Seniority estimate
    
    This replaces regex-based extraction and provides 100% raw candidate data.
    Called BEFORE PII masking to preserve original names and contacts.
    """
    if not raw_cv_text or not raw_cv_text.strip():
        return {
            "fullName": "",
            "email": "",
            "phone": "",
            "linkedinUrl": "",
            "githubUrl": "",
            "portfolioUrl": "",
            "frontend_skills": [],
            "backend_skills": [],
            "devops_skills": [],
            "soft_skills": [],
            "years_experience": 0,
            "seniority_estimate": "Unknown",
        }
    
    try:
        system_prompt = """You are an expert CV parser and recruiter. Extract ALL relevant candidate information from the CV.

CRITICAL: Extract the candidate's ORIGINAL information EXACTLY as written in the CV:
- Names: Use exact spelling, including non-Latin characters
- Contact: All emails, phone numbers, URLs
- Skills: Technical, domain, and soft skills
- Experience: Titles, companies, durations
- Education: Degrees, institutions

KEY SKILL EXTRACTION RULES:
For "data_skills" bucket, EXTRACT BOTH tools AND conceptual practices:
  Tools: Extract exact names: "dbt", "Airflow", "Spark", "BigQuery", "Redshift", "ClickHouse", "Qdrant", "RudderStack", "Kafka", "Python", "SQL"
  Concepts: Extract when mentioned or inferred from context:
    - "Data Modeling" → when CV mentions: "data models", "Star Schema", "Data Vault", "dimensional modeling", "schema design"
    - "Data Transformation" → when CV mentions: "transformation", "pipeline", "dbt", "data processing", "ETL"
    - "Data Quality" → when CV mentions: "data quality", "validation", "anomaly detection", "monitoring", "freshness checks"
    - "Analytics Engineering" → when CV mentions: "analytics", "reporting", "BI", "dashboards", "analytics engineer", "data analyst"
    - "Data Architecture" → when CV mentions: "architecture", "design", "OLAP", "data warehouse design", "platform design"
    - "Data Engineering" → extract when job title is "Data Engineer" or context shows data pipeline work
    - "CI/CD" → when CV mentions: "continuous integration", "deployment", "CI/CD", "automation", "pipelines" in DevOps context
    - "Data Warehousing" → when CV mentions: "warehouse", "OLAP", specific warehouse tools (Redshift, BigQuery, Snowflake)
    - "ETL" → when CV mentions: "ETL", "extract", "load", "pipelines", "data ingestion"

Output ONLY valid JSON. No markdown, no explanation.

JSON Schema:
{
  "fullName": "extracted exactly as in CV",
  "email": "primary email if multiple",
  "phone": "primary phone if multiple", 
  "linkedinUrl": "full URL or empty",
  "githubUrl": "full URL or empty",
  "portfolioUrl": "full URL or empty",
  "frontend_skills": ["React", "Vue", ...],
  "backend_skills": ["Python", "Java", ...],
  "devops_skills": ["Docker", "Kubernetes", "CI/CD", "Terraform", ...],
  "data_skills": ["Data Modeling", "dbt", "Airflow", "SQL", "Data Warehouse", "ETL", "Analytics Engineering", ...],
  "ai_skills": ["PyTorch", "LangChain", "RAG", "LLM", "MLflow", "Pinecone", "Fine-tuning", ...],
  "soft_skills": ["Leadership", "Communication", ...],
  "years_experience": 5,
  "seniority_estimate": "Junior|Mid|Senior|Lead",
  "current_title": "Job title",
  "education": [{"degree": "BS", "field": "CS", "school": "MIT"}],
  "certifications": ["AWS Solutions Architect", ...],
  "key_projects": ["Project 1", "Project 2"],
  "languages": ["English", "Vietnamese", ...],
  "skill_groups": {},
  "raw_summary": "One sentence summary"
}"""
        
        user_message = f"<resume>\n{raw_cv_text[:150000]}\n</resume>\n\nExtract and return ALL candidate information from this CV as structured JSON."
        
        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2000,
            "temperature": 0.0,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        }
        
        response = bedrock.invoke_model(
            modelId=CLAUDE_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload),
        )
        
        response_data = json.loads(response.get("body").read())
        model_text = response_data.get("content", [{}])[0].get("text", "{}")
        extracted_data = safe_json_parse(model_text)
        
        if extracted_data:
            print(f"INFO: Bedrock extracted candidate: {extracted_data.get('fullName', 'Unknown')}")
            return extracted_data
        else:
            print("WARNING: Bedrock extraction returned invalid JSON, using fallback")
            return extract_candidate_data_comprehensive_fallback(raw_cv_text)
    
    except Exception as exc:
        print(f"WARNING: Bedrock comprehensive extraction failed ({exc}), using fallback")
        return extract_candidate_data_comprehensive_fallback(raw_cv_text)


def extract_candidate_data_comprehensive_fallback(raw_cv_text: str) -> dict[str, Any]:
    """Fallback extraction using regex patterns when Bedrock fails."""
    source = raw_cv_text or ""
    
    email_match = re.search(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", source)
    phone_match = re.search(r"(?:(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4})", source)
    github_match = re.search(r"(https?://)?(www\.)?github\.com/[A-Za-z0-9_.-]+", source, flags=re.I)
    linkedin_match = re.search(
        r"(https?://)?([a-z]{2,3}\.)?linkedin\.com/(in|pub|company)/[A-Za-z0-9_.-]+",
        source,
        flags=re.I,
    )
    portfolio_match = re.search(
        r"https?://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=-]*)?",
        source,
        flags=re.I,
    )
    
    def _norm_url(match: re.Match[str] | None) -> str:
        if not match:
            return ""
        raw = match.group(0).strip()
        return raw if raw.lower().startswith("http") else f"https://{raw}"
    
    portfolio = _norm_url(portfolio_match)
    if portfolio and ("linkedin.com/" in portfolio.lower() or "github.com/" in portfolio.lower()):
        portfolio = ""
    
    full_name = _extract_full_name_from_cv_text(source)
    
    return {
        "fullName": full_name,
        "email": (email_match.group(0).strip() if email_match else ""),
        "phone": (phone_match.group(0).strip() if phone_match else ""),
        "linkedinUrl": _norm_url(linkedin_match),
        "githubUrl": _norm_url(github_match),
        "portfolioUrl": portfolio,
        "frontend_skills": [],
        "backend_skills": [],
        "devops_skills": [],
        "soft_skills": [],
        "years_experience": 0,
        "seniority_estimate": "Unknown",
        "current_title": "",
        "education": [],
        "certifications": [],
        "key_projects": [],
        "languages": [],
        "raw_summary": "",
    }


# ---------------------------------------------------------------------------
# Claude Agent 1: CV Skill Extraction & Scoring
# ---------------------------------------------------------------------------

def parse_and_evaluate_cv(
    masked_cv_text: str,
    jd_text: str,
    job_title: str,
    required_skills: list[str],
) -> dict:
    """Claude agent: extract structured skills and write strengths/gaps."""
    if not jd_text or jd_text == "Evaluate general technical skills.":
        system_prompt = f"""You are an elite Senior Technical Recruiter AI.

You are performing a general evaluation of a candidate's CV to extract their skills and seniority.

Note: Candidate names, organizations, and locations are anonymized with tokens
(e.g., [CANDIDATE_NAME], [ORGANIZATION]). Evaluate based on technical merit only.

Extract skills and write a professional technical summary.
CRITICAL: Always recursively extract foundational frameworks (e.g., PyTorch, TensorFlow, React, Angular) if they are present, even if specific derivative libraries/models (e.g., YOLO, Next.js) are also listed. Do not omit foundational skills.

Output ONLY a valid JSON object. No markdown, no conversational text.

SKILL CLASSIFICATION RULES — read carefully before extracting:
- hard_skills: ONLY concrete, specific tools / languages / frameworks / databases / protocols.
  Examples: Java, Golang, C/C++, React, Angular, SwiftUI, Jetpack Compose, SQL, PostgreSQL, Docker, Kubernetes, TCP/IP, HTTP, XML, UML (as a notation tool).
  Do NOT put broad domain labels here (e.g. "Mobile Development", "Backend Development" are NOT hard skills).
- process_skills: Software engineering methodologies and processes.
  Examples: SDLC, Software Development Lifecycle, Agile, Scrum, Kanban, UML modeling, Feature-level Design, System Flows Modeling, CI/CD (as a practice), TDD, Code Review, ITIL.
  Do NOT include specific tools (Jenkins belongs in devops_skills, not here).
- soft_skills: NON-technical interpersonal skills ONLY.
  Examples: Communication, Leadership, Teamwork, Attention to Detail, Problem Solving, Cross-functional Collaboration.
  Do NOT put any technical skill here.
- domain_experience: broad specialization areas for context only (not used in skill matching).
  Examples: Mobile Development, Backend Development, IoT, Full-Stack Web Development.

JSON Schema:
{{
  "schema_version": "{CV_PROFILE_SCHEMA_VERSION}",
  "seniority_estimate": "Junior/Mid/Senior",
  "frontend_skills": ["concrete UI tools: React, Angular, Vue, HTML5, CSS3, JavaScript, TypeScript, Tailwind..."],
  "backend_skills": ["concrete backend tools: Java, Python, Go, Spring Boot, FastAPI, PostgreSQL, Redis, REST API..."],
  "devops_skills": ["concrete infra/ops tools: Docker, Kubernetes, Terraform, Jenkins, GitHub Actions, Prometheus..."],
  "data_skills": ["concrete data tools: dbt, Airflow, Spark, SQL, BigQuery, Kafka, Snowflake, Data Modeling, ETL..."],
  "ai_skills": ["concrete AI/ML tools: PyTorch, TensorFlow, LangChain, RAG, MLflow, Pinecone, scikit-learn, YOLO..."],
  "process_skills": ["engineering methodologies: SDLC, Agile, Scrum, UML, Feature Design, System Flows Modeling, TDD, CI/CD, ITIL..."],
  "skill_groups": {{"DomainName": ["specialized hard skills not in above buckets"]}},
  "soft_skills": ["NON-technical only: Communication, Leadership, Problem Solving, Teamwork..."],
  "projects": [{{"name":"","role":"","stack":[""],"outcome":"","duration":""}}],
  "professional_experience": [{{"company":"","title":"","start":"","end":"","responsibilities":[""],"impact":""}}],
  "domain_experience": ["broad specialization labels: Mobile Development, Backend Development, IoT..."],
  "certifications": ["array of strings"],
  "education": ["array of strings"],
  "seniority_evidence": ["array of strings"],
  "recency_signals": {{"recent_primary_stack":["array of strings"],"last_major_role_year":"YYYY"}},
  "years_experience": 0,
  "matching_score": 0,
  "strengths": "General technical strengths.",
  "gaps": "Areas for growth based on seniority."
}}

Note on skill_groups: Use this for any technical domain not covered by the named buckets above.
Examples: {{"Cybersecurity": ["OWASP", "Penetration Testing", "SIEM"], "Embedded Systems": ["RTOS", "CAN Bus", "ARM"], "Bioinformatics": ["BLAST", "BWA", "GATK"], "Quantitative Finance": ["QuantLib", "SABR model", "Options Pricing"]}}
Only include groups that are actually present in the resume. Use an empty dict {{}} if no additional groups apply."""
        user_message = f"<resume>\n{masked_cv_text[:120000]}\n</resume>"
    else:
        system_prompt = f"""You are an elite Senior Technical Recruiter AI.

You are evaluating a candidate for the role: "{job_title}".
Primary required skills: {", ".join(required_skills) if required_skills else "Derive from JD text"}.

Note: Candidate names, organizations, and locations are anonymized with tokens
(e.g., [CANDIDATE_NAME], [ORGANIZATION]). Evaluate based on technical merit only.

Extract skills and write a professional summary of Strengths and Gaps for the "{job_title}" role.
CRITICAL: Always recursively extract foundational frameworks (e.g., PyTorch, TensorFlow, React, Angular) if they are present, even if specific derivative libraries/models (e.g., YOLO, Next.js) are also listed. Do not omit foundational skills.

Output ONLY a valid JSON object. No markdown, no conversational text.

SKILL CLASSIFICATION RULES — read carefully before extracting:
- hard_skills: ONLY concrete, specific tools / languages / frameworks / databases / protocols.
  Examples: Java, Golang, C/C++, React, Angular, SwiftUI, Jetpack Compose, SQL, PostgreSQL, Docker, Kubernetes, TCP/IP, HTTP, XML, UML (as a notation tool).
  Do NOT put broad domain labels here (e.g. "Mobile Development", "Backend Development" are NOT hard skills).
- process_skills: Software engineering methodologies and processes.
  Examples: SDLC, Software Development Lifecycle, Agile, Scrum, Kanban, UML modeling, Feature-level Design, System Flows Modeling, CI/CD (as a practice), TDD, Code Review, ITIL.
  Do NOT include specific tools (Jenkins belongs in devops_skills, not here).
- soft_skills: NON-technical interpersonal skills ONLY.
  Examples: Communication, Leadership, Teamwork, Attention to Detail, Problem Solving, Cross-functional Collaboration.
  Do NOT put any technical skill here.
- domain_experience: broad specialization areas for context only (not used in skill matching).
  Examples: Mobile Development, Backend Development, IoT, Full-Stack Web Development.

JSON Schema:
{{
  "schema_version": "{CV_PROFILE_SCHEMA_VERSION}",
  "seniority_estimate": "Junior/Mid/Senior",
  "frontend_skills": ["concrete UI tools: React, Angular, Vue, HTML5, CSS3, JavaScript, TypeScript, Tailwind..."],
  "backend_skills": ["concrete backend tools: Java, Python, Go, Spring Boot, FastAPI, PostgreSQL, Redis, REST API..."],
  "devops_skills": ["concrete infra/ops tools: Docker, Kubernetes, Terraform, Jenkins, GitHub Actions, Prometheus..."],
  "data_skills": ["concrete data tools: dbt, Airflow, Spark, SQL, BigQuery, Kafka, Snowflake, Data Modeling, ETL..."],
  "ai_skills": ["concrete AI/ML tools: PyTorch, TensorFlow, LangChain, RAG, MLflow, Pinecone, scikit-learn, YOLO..."],
  "process_skills": ["engineering methodologies: SDLC, Agile, Scrum, UML, Feature Design, System Flows Modeling, TDD, CI/CD, ITIL..."],
  "skill_groups": {{"DomainName": ["specialized hard skills not in above buckets"]}},
  "soft_skills": ["NON-technical only: Communication, Leadership, Problem Solving, Teamwork..."],
  "projects": [{{"name":"","role":"","stack":[""],"outcome":"","duration":""}}],
  "professional_experience": [{{"company":"","title":"","start":"","end":"","responsibilities":[""],"impact":""}}],
  "domain_experience": ["broad specialization labels: Mobile Development, Backend Development, IoT..."],
  "certifications": ["array of strings"],
  "education": ["array of strings"],
  "seniority_evidence": ["array of strings"],
  "recency_signals": {{"recent_primary_stack":["array of strings"],"last_major_role_year":"YYYY"}},
  "years_experience": 0,
  "matching_score": 0,
  "strengths": "Short paragraph explaining why they are a fit for {job_title}.",
  "gaps": "Short paragraph explaining what required skills they are missing."
}}

Note on skill_groups: Use this for any technical domain not covered by the named buckets above.
Examples: {{"Cybersecurity": ["OWASP", "Penetration Testing", "SIEM"], "Embedded Systems": ["RTOS", "CAN Bus", "ARM"], "Bioinformatics": ["BLAST", "BWA", "GATK"], "Quantitative Finance": ["QuantLib", "SABR model", "Options Pricing"]}}
Only include groups that are actually present in the resume. Use an empty dict {{}} if no additional groups apply."""
        user_message = (
            f"<job_description>\n{jd_text}\n</job_description>\n"
            f"<resume>\n{masked_cv_text[:120000]}\n</resume>"
        )
    payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 8000,
        "temperature": 0.0,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    }
    response = bedrock.invoke_model(
        modelId=AGENT1_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(payload),
    )
    response_data = json.loads(response.get("body").read())
    raw_response = response_data.get("content", [{}])[0]
    model_text = raw_response.get("text", "{}")
    stop_reason = response_data.get("stop_reason", "unknown")
    print(f"INFO: Agent-1 response — stop_reason={stop_reason}, chars={len(model_text)}")
    return safe_json_parse(model_text)


# ---------------------------------------------------------------------------
# Claude Agent 2: Interview Guide Generation
# ---------------------------------------------------------------------------

def generate_interview_guide(
    parsed_result: dict,
    job_title: str,
    required_skills: list[str],
) -> list[dict]:
    """Generate 3 targeted interview questions from gaps. Non-fatal."""
    if not ENABLE_INTERVIEW_GUIDE:
        return []

    gaps = parsed_result.get("gaps", "")
    seniority = parsed_result.get("seniority_estimate", "Unknown")
    years_exp = parsed_result.get("years_experience", 0)
    all_claimed = (
        parsed_result.get("backend_skills", [])
        + parsed_result.get("frontend_skills", [])
        + parsed_result.get("devops_skills", [])
    )

    system_prompt = f"""You are a Senior Technical Interviewer AI for {job_title} roles.

A {seniority} candidate with {years_exp} year(s) of experience has been evaluated.

Generate exactly 3 specific technical interview questions targeting their weaknesses.
Each question must have a clear, verifiable correct answer.

Output ONLY a valid JSON array. No markdown.

Schema:
[
  {{
    "question": "Specific technical question",
    "skill_targeted": "Exact skill or gap being tested",
    "rationale": "What a wrong answer reveals"
  }}
]"""

    user_message = f"""Profile:
- Role: {job_title}, Seniority: {seniority}, Experience: {years_exp}y
- Skills: {", ".join(all_claimed) if all_claimed else "Not specified"}
- Required: {", ".join(required_skills) if required_skills else "See gaps"}
- Gaps: {gaps if gaps else "No major gaps identified"}"""

    payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1200,
        "temperature": 0.3,
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
        model_text = response_data.get("content", [{}])[0].get("text", "[]")

        cleaned = model_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        cleaned = cleaned.strip()

        questions = json.loads(cleaned)
        if isinstance(questions, list) and all(
            isinstance(q, dict) and "question" in q for q in questions
        ):
            print(f"INFO: Interview guide: {len(questions)} question(s).")
            return questions[:3]
        return []

    except Exception as exc:
        print(f"WARNING: Interview guide failed (non-fatal): {exc}")
        return []


# ===========================================================================
# SHARED: Vector Operations & Scoring
# ===========================================================================


# ---------------------------------------------------------------------------
# Bi-Encoder: Cohere Embeddings + Cosine Similarity
# ---------------------------------------------------------------------------

def get_cohere_embedding(text: str) -> list[float]:
    """Embed text using Cohere embed-v3 via Bedrock. Max 2048 chars."""
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
    response_body = json.loads(response.get("body").read())
    return response_body["embeddings"][0]


def calculate_cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude1 = math.sqrt(sum(a * a for a in vec1))
    magnitude2 = math.sqrt(sum(b * b for b in vec2))
    if magnitude1 == 0 or magnitude2 == 0:
        return 0.0
    return dot_product / (magnitude1 * magnitude2)


# ---------------------------------------------------------------------------
# Cross-Encoder Reranking
# ---------------------------------------------------------------------------

_cross_encoder_instance = None


def _calibrated_sigmoid(logit: float, shift: float = -1.0, scale: float = 1.5) -> float:
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


def _get_cross_encoder():
    """Load CrossEncoder model. Returns None on failure (non-fatal)."""
    global _cross_encoder_instance

    if _cross_encoder_instance is not None:
        return _cross_encoder_instance

    if not ENABLE_CROSS_ENCODER:
        return None

    try:
        from sentence_transformers import CrossEncoder  # type: ignore

        tmp_cache_path = "/tmp/cross_encoder_model"

        if os.path.isdir(CROSS_ENCODER_BAKED_PATH):
            load_path = CROSS_ENCODER_BAKED_PATH
        elif os.path.isdir(tmp_cache_path):
            load_path = tmp_cache_path
        else:
            os.environ["HF_HOME"] = "/tmp/hf_home"
            temp_model = CrossEncoder(CROSS_ENCODER_MODEL_ID, max_length=512)
            temp_model.save(tmp_cache_path)
            del temp_model
            load_path = tmp_cache_path

        _cross_encoder_instance = CrossEncoder(load_path, max_length=512)
        print("INFO: Cross-encoder ready.")
        return _cross_encoder_instance

    except (ImportError, Exception) as exc:
        print(f"WARNING: Cross-encoder unavailable: {exc}")
        return None


def _create_cv_chunks(cv_text: str) -> list[str]:
    chunks = []
    step = CROSS_ENCODER_CHUNK_CHARS - CROSS_ENCODER_OVERLAP_CHARS
    start = 0
    while start < len(cv_text):
        end = start + CROSS_ENCODER_CHUNK_CHARS
        chunk = cv_text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(cv_text):
            break
        start += step
    return chunks[:CROSS_ENCODER_MAX_CHUNKS]


def _aggregate_chunk_scores(normalized_scores: list[float]) -> float:
    if not normalized_scores:
        return 0.0
    top_k = sorted(normalized_scores, reverse=True)[:CROSS_ENCODER_TOP_K]
    raw_weights = TOP_K_WEIGHTS[: len(top_k)]
    weight_sum = sum(raw_weights)
    weights = [w / weight_sum for w in raw_weights]
    return sum(score * weight for score, weight in zip(top_k, weights))


def compute_cross_encoder_score(cv_text: str, jd_text: str) -> float | None:
    """Score CV against JD using Cross-Encoder. Returns [0,1] or None."""
    ce = _get_cross_encoder()
    if ce is None:
        return None

    jd_query = jd_text[:CROSS_ENCODER_JD_QUERY_CHARS].strip()
    if not jd_query:
        return None

    cv_chunks = _create_cv_chunks(cv_text)
    if not cv_chunks:
        return None

    print(f"INFO: Cross-encoder scoring {len(cv_chunks)} chunk(s).")
    pairs = [(jd_query, chunk) for chunk in cv_chunks]
    raw_logits = ce.predict(pairs)
    normalized = [_calibrated_sigmoid(float(logit)) for logit in raw_logits]
    return _aggregate_chunk_scores(normalized)


# ---------------------------------------------------------------------------
# Hybrid Score Computation
# ---------------------------------------------------------------------------

def compute_hybrid_score(
    bi_score_pct: float, cross_score: float | None
) -> tuple[float, dict]:
    """Blend bi-encoder and cross-encoder scores."""
    bi_normalized = bi_score_pct / 100.0

    if cross_score is None:
        return bi_score_pct, {
            "bi_encoder_score": round(bi_score_pct, 2),
            "cross_encoder_score": None,
            "hybrid_score": round(bi_score_pct, 2),
            "method": "bi_encoder_only",
        }

    hybrid = HYBRID_WEIGHT_BI * bi_normalized + HYBRID_WEIGHT_CROSS * cross_score
    final_pct = round(hybrid * 100, 2)
    return final_pct, {
        "bi_encoder_score": round(bi_score_pct, 2),
        "cross_encoder_score": round(cross_score * 100, 2),
        "hybrid_score": final_pct,
        "bi_encoder_weight": HYBRID_WEIGHT_BI,
        "cross_encoder_weight": HYBRID_WEIGHT_CROSS,
        "method": "hybrid_bi_cross_encoder",
    }


# ---------------------------------------------------------------------------
# DynamoDB: Save processing failure
# ---------------------------------------------------------------------------

def save_jd_metadata_to_dynamodb(
    job_id: str,
    jd_text: str,
    job_title: str,
    required_skills: list,
    required_skill_groups: dict[str, Any] | None,
    jd_vector: list[float],
    *,
    jd_markdown: str = "",
    recruiter_id: str = "",
    owner_cognito_sub: str = "",
    location: str = "",
    employment_type: str = "",
    salary_min: float | None = None,
    salary_max: float | None = None,
    experience_level: str = "",
    company_name: str = "",
    jd_version: str = "",
) -> None:
    """
    Single-table store for recruiter JD flow (same PK/SK as jd_parser / ingestion_trigger).
    Enables job_suggestion_engine and CV apply paths to read JD without SmartHire_Jobs.
    """
    if not job_id or job_id == "unknown":
        return
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        now_str = now_iso()
        item: dict[str, Any] = {
            "PK": f"JOB#{job_id}",
            "SK": "METADATA",
            "type": "JOB_METADATA",
            "jobId": str(job_id),
            "jdText": jd_text or "",
            "jdMarkdown": jd_markdown or "",
            "jobTitle": job_title or "Unknown",
            "requiredSkills": required_skills or [],
            "requiredSkillGroups": required_skill_groups or {"must_have": [], "one_of": [], "nice_to_have": []},
            "jdVersion": jd_version or now_str,
            "parseStatus": "SUCCEEDED",
            "status": "SUCCESS",
            "updatedAt": now_str,
            "location": location or "",
            "jobType": employment_type or "",
            "employmentType": employment_type or "",
            "experienceLevel": experience_level or "",
        }
        if recruiter_id:
            item["recruiterId"] = recruiter_id
        if company_name:
            item["companyName"] = company_name
        if owner_cognito_sub:
            item["ownerCognitoSub"] = owner_cognito_sub
            item["GSI2PK"] = owner_cognito_sub
            item["GSI2SK"] = f"{now_str}#{job_id}"
        if salary_min is not None or salary_max is not None:
            lo = salary_min if salary_min is not None else salary_max
            hi = salary_max if salary_max is not None else salary_min
            item["salaryRange"] = {
                "min": Decimal(str(lo or 0)),
                "max": Decimal(str(hi or 0)),
                "currency": "USD",
            }
        if jd_vector and len(jd_vector) == 1024:
            item["jdVector"] = [Decimal(str(v)) for v in jd_vector]
        table.put_item(Item=item)
        print(f"INFO: JD metadata saved to DynamoDB for job_id={job_id}")
    except Exception as exc:
        print(f"WARNING: Failed to save JD metadata to DynamoDB: {exc}")


def save_failure_to_dynamodb(
    profile_id: str, file_key: str, error_message: str
) -> None:
    """Save a FAILED status to DynamoDB for visibility."""
    table = dynamodb.Table(DYNAMODB_TABLE)
    now_str = now_iso()
    table.put_item(Item={
        "PK": f"CANDIDATE#{profile_id}",
        "SK": f"CV#{file_key}",
        "GSI1PK": "CANDIDATE",
        "GSI1SK": now_str,
        "candidateId": str(profile_id),
        "objectKey": str(file_key),
        "type": "CV_PARSE_FAILURE",
        "status": "FAILED",  # Consistent with new tracking
        "parseStatus": "FAILED",
        "updatedAt": now_str,
        "expiresAt": expires_at_epoch(),
        "parsedResult": {},
        "errorMessage": error_message,
    })


def save_cv_metadata_to_dynamodb(
    profile_id: str,
    file_key: str,
    candidate_skill_profile: dict[str, list[str]],
    interview_guide: list[dict] | None = None,
    masking_report: dict[str, Any] | None = None,
    scoring_details: dict[str, Any] | None = None,
    parsed_profile: dict[str, Any] | None = None,
    contact_info: dict[str, str] | None = None,
    cv_version: str = "",
) -> None:
    """
    Enrich/Create Candidate Metadata entry in DynamoDB.
    Uses unified SK=METADATA to prevent duplication.
    candidate_skill_profile: dict with hardSkills, processSkills, softSkills, domainExpertise.
    """
    if profile_id == "unknown" or file_key == "unknown":
        return
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        now_str = now_iso()

        # Do not persist large/error-debug payload fields in candidate metadata.
        pp = dict(parsed_profile or {"schema_version": CV_PROFILE_SCHEMA_VERSION})
        pp.pop("rawModelOutput", None)
        pp.pop("summary", None)

        # Omit empty string values so Dynamo does not store noise keys
        ci = (contact_info or {}).copy()
        for k in list(ci.keys()):
            if not ci[k]:
                del ci[k]

        hard_skills = candidate_skill_profile.get("hardSkills") or []
        process_skills = candidate_skill_profile.get("processSkills") or []
        soft_skills = candidate_skill_profile.get("softSkills") or []
        domain_expertise = candidate_skill_profile.get("domainExpertise") or []

        table.update_item(
            Key={"PK": f"CANDIDATE#{profile_id}", "SK": "METADATA"},
            UpdateExpression=(
                "SET hardSkills = :hs, "
                "processSkills = :ps, "
                "softSkills = :ss, "
                "domainExpertise = :de, "
                "interviewGuide = :ig, "
                "maskingReport = :mr, "
                "scoringDetails = :sd, "
                "parsedProfile = :pp, "
                "schemaVersion = :sv, "
                "cvVersion = :cvv, "
                "contactInfo = :ci, "
                "updatedAt = :u, "
                "#tp = :t, "
                "GSI1PK = :g1p, "
                "GSI1SK = :g1s, "
                "objectKey = :ok"
            ),
            ExpressionAttributeNames={
                "#tp": "type"
            },
            ExpressionAttributeValues={
                ":hs": hard_skills,
                ":ps": process_skills,
                ":ss": soft_skills,
                ":de": domain_expertise,
                ":ig": interview_guide or [],
                ":mr": masking_report or {},
                ":sd": scoring_details or {},
                ":pp": pp,
                ":sv": pp.get("schema_version", CV_PROFILE_SCHEMA_VERSION),
                ":cvv": cv_version or str(file_key),
                ":ci": ci,
                ":u": now_str,
                ":t": "CANDIDATE_PROFILE",
                ":g1p": "CANDIDATE",
                ":g1s": now_str,
                ":ok": str(file_key),
            }
        )
    except Exception as exc:
        print(f"WARNING: Failed to save candidateSkills metadata: {exc}")


# ===========================================================================
# LAMBDA ENTRY POINT
# ===========================================================================

def _process_cv(event: dict) -> dict:
    """
    CV processing pipeline (candidate flow):
      [1] Textract → [2] PII Mask → [3] Claude Agent 1 → [4] Interview Guide
      [5] Embed → [6] Cross-Encoder → [7] Hybrid Score
    """
    profile_id = event.get("profile_id") or event.get("candidate_id") or "unknown"
    file_key = event.get("file_key", "unknown")
    bucket = event.get("bucket", "")
    job_id = event.get("job_id", "unknown")
    jd_text = event.get("jd_text", "Evaluate general technical skills.")
    job_title = event.get("job_title", "Unknown")
    required_skills = event.get("required_skills", [])
    jd_vector = event.get("jd_vector")
    cv_version = str(event.get("cv_version") or file_key)

    if not bucket:
        raise ValueError("Missing bucket name")
    if profile_id == "unknown":
        raise ValueError("Cannot derive candidate profile id")

    print(f"INFO: CV processing — profile={profile_id}, job={job_id}, key={file_key}")

    pipeline_status = "SUCCESS"
    warning_messages: list[str] = []

    # [1] Textract: extract raw CV text
    raw_cv_text = extract_text_from_s3(bucket, file_key)
    print(f"INFO: Textract complete — {len(raw_cv_text)} chars extracted")
    contact_info = extract_candidate_contact_info(raw_cv_text)

    # [2] Blind Screening: mask PII
    print("INFO: Running blind screening (PII masking).")
    masked_cv_text, masking_report = mask_pii_entities(raw_cv_text)

    # [3] Claude Agent 1: skill extraction
    print("INFO: Running Claude Agent 1 (skill extraction).")
    try:
        parsed_data = parse_and_evaluate_cv(
            masked_cv_text, jd_text, job_title, required_skills
        )
    except Exception as exc:
        pipeline_status = "PARTIAL_SUCCESS"
        warning_messages.append(f"parse_and_evaluate_cv failed: {exc}")
        parsed_data = {
            "schema_version": CV_PROFILE_SCHEMA_VERSION,
            "summary": "CV parsed with fallback after model failure.",
            "frontend_skills": [],
            "backend_skills": [],
            "devops_skills": [],
            "soft_skills": [],
            "projects": [],
            "professional_experience": [],
            "domain_experience": [],
            "certifications": [],
            "education": [],
            "seniority_evidence": [],
            "recency_signals": {},
            "years_experience": 0,
            "matching_score": 0,
            "strengths": "",
            "gaps": "",
        }

    parsed_data = enrich_parsed_profile(parsed_data)

    candidate_skill_profile = extract_candidate_skills_from_parsed_data(parsed_data)
    cs_ctx = {
        "profile_summary": (parsed_data.get("summary") or "")[:900],
        "job_title": str(parsed_data.get("current_title") or job_title or "")[:240],
        "jd_excerpt": (jd_text or "")[:800] if jd_text else "",
    }
    # Canonicalize hard skills only (the skills used for matching)
    canonicalized_hard, _cs_canon = canonicalize_skills_batch(
        candidate_skill_profile["hardSkills"],
        side="candidate",
        context=cs_ctx,
        max_items=MAX_CANDIDATE_SKILLS,
    )
    candidate_skill_profile["hardSkills"] = canonicalized_hard

    # [4] Claude Agent 2: interview guide
    print("INFO: Running Claude Agent 2 (interview questions).")
    interview_guide = generate_interview_guide(
        parsed_data, job_title, required_skills
    )

    # [5] Bi-Encoder: embed masked CV
    print("INFO: Running Bi-Encoder (Cohere).")
    cv_vector = []
    try:
        cv_vector = get_cohere_embedding(masked_cv_text)
    except Exception as exc:
        pipeline_status = "PARTIAL_SUCCESS"
        warning_messages.append(f"get_cohere_embedding failed for CV: {exc}")
        print(f"WARNING: CV embedding unavailable (non-fatal): {exc}")

    scoring_details = {"method": "none", "reason": "No JD provided for scoring"}

    if jd_text and jd_text != "Evaluate general technical skills.":
        if jd_vector is not None:
            print("INFO: Using cached JD vector.")
        elif cv_vector:
            print("INFO: Computing JD embedding.")
            try:
                jd_vector = get_cohere_embedding(jd_text)
            except Exception as exc:
                pipeline_status = "PARTIAL_SUCCESS"
                warning_messages.append(f"get_cohere_embedding failed for JD: {exc}")
                print(f"WARNING: JD embedding unavailable (non-fatal): {exc}")

        if cv_vector and jd_vector:
            bi_raw = calculate_cosine_similarity(cv_vector, jd_vector)
            bi_score_pct = round(bi_raw * 100, 2)
            print(f"INFO: Bi-Encoder score: {bi_score_pct}%")

            # [6] Cross-Encoder: reranking
            print("INFO: Running Cross-Encoder.")
            cross_score = compute_cross_encoder_score(masked_cv_text, jd_text)
            if cross_score is not None:
                print(f"INFO: Cross-Encoder score: {round(cross_score * 100, 2)}%")

            # [7] Hybrid blend
            final_score, scoring_details = compute_hybrid_score(bi_score_pct, cross_score)
            print(f"INFO: Final hybrid score: {final_score}%")

            parsed_data["matching_score"] = final_score
        else:
            pipeline_status = "PARTIAL_SUCCESS"
            warning_messages.append("Skipped scoring due to missing CV/JD embedding.")
    else:
        print("INFO: Skipping scoring phase (no JD provided).")
        jd_vector = None

    save_cv_metadata_to_dynamodb(
        profile_id=profile_id,
        file_key=file_key,
        candidate_skill_profile=candidate_skill_profile,
        interview_guide=interview_guide,
        masking_report=masking_report,
        scoring_details=scoring_details,
        parsed_profile=parsed_data,
        contact_info=contact_info,
        cv_version=cv_version,
    )

    return {
        "flow_type": "candidate",
        "route_target": "JobSuggestion",
        "pipeline_status": pipeline_status,
        "warnings": warning_messages,
        "profile_id": profile_id,
        "file_key": file_key,
        "bucket": bucket,
        "job_id": job_id,
        "job_title": job_title,
        "masked_cv_text": masked_cv_text,
        "cv_vector": cv_vector,
        "cv_embedding": cv_vector,
        "parsed_data": parsed_data,
        "scoring_details": scoring_details,
        "interview_guide": interview_guide,
        "masking_report": masking_report,
        "contact_info": contact_info,
        "candidate_skill_profile": candidate_skill_profile,
        "cv_version": cv_version,
        "jd_text": jd_text,
        "jd_vector": jd_vector,
    }


def _process_jd(event: dict) -> dict:
    """
    JD processing pipeline (recruiter flow):
      [1] Read raw JD text from RDS Jobs table → [2] Embed JD text
    """
    job_id = event.get("job_id", "unknown")
    required_skills = event.get("required_skills", [])
    jd_version = str(event.get("jd_version") or now_iso())

    if job_id == "unknown":
        raise ValueError("job_id is required for JD processing")

    print(f"INFO: JD processing — job_id={job_id}")

    # [1] Read JD text from RDS
    jd_data = read_jd_from_rds(job_id)
    jd_text = jd_data["description"]
    job_title = jd_data["title"]
    jd_markdown = jd_text_to_markdown(jd_text)

    # [2] Embed JD text
    print("INFO: Computing JD embedding (Cohere search_document).")
    jd_vector = get_cohere_embedding(jd_text)

    extracted_required_skills = extract_required_skills_from_jd_ai(
        jd_text=jd_text,
        job_title=job_title,
        provided_required_skills=required_skills,
    )
    required_skill_groups = extract_required_skill_groups_from_jd_ai(
        jd_text=jd_text,
        job_title=job_title,
        hint_skills=extracted_required_skills,
    )

    jd_ctx = {
        "job_title": job_title,
        "jd_excerpt": jd_text[:800] if jd_text else "",
    }
    flat_canon, groups_canon, _diag = canonicalize_required_skill_bundle(
        required_skills_flat=extracted_required_skills,
        required_groups=required_skill_groups,
        context=jd_ctx,
    )

    extracted_required_skills = flat_canon or extracted_required_skills
    required_skill_groups = groups_canon

    save_jd_metadata_to_dynamodb(
        job_id,
        jd_text,
        job_title,
        extracted_required_skills,
        required_skill_groups,
        jd_vector,
        jd_markdown=jd_markdown,
        recruiter_id=jd_data.get("recruiter_id", ""),
        owner_cognito_sub=jd_data.get("owner_cognito_sub", ""),
        location=jd_data.get("location", ""),
        employment_type=jd_data.get("employment_type", ""),
        salary_min=jd_data.get("salary_min"),
        salary_max=jd_data.get("salary_max"),
        experience_level=jd_data.get("experience_level", ""),
        company_name=jd_data.get("company_name", ""),
        jd_version=jd_version,
    )

    return {
        "flow_type": "recruiter",
        "route_target": "CandidateRanking",
        "pipeline_status": "SUCCESS",
        "warnings": [],
        "profile_id": "recruiter",
        "job_id": job_id,
        "job_title": job_title,
        "required_skills": extracted_required_skills,
        "required_skill_groups": required_skill_groups,
        "jd_text": jd_text,
        "jd_vector": jd_vector,
        "owner_cognito_sub": jd_data.get("owner_cognito_sub", ""),
        "recruiter_id": jd_data.get("recruiter_id", ""),
        "jd_version": jd_version,
        "masked_cv_text": jd_text,
        "cv_vector": [],
        "cv_embedding": [],
        "parsed_data": {},
    }


def lambda_handler(event, context):
    """
    Unified CV/JD processor. Routes based on profile_id:
      - profile_id == "recruiter" → JD path (read from RDS, embed)
      - otherwise                 → CV path (Textract, mask, analyze, embed, score)
    """
    profile_id = event.get("profile_id", "unknown")
    file_key = event.get("file_key", "unknown")

    try:
        if profile_id == "recruiter":
            return _process_jd(event)
        else:
            return _process_cv(event)

    except Exception as exc:
        print(json.dumps({
            "level": "error",
            "message": "CvJdProcessor failed",
            "profileId": profile_id,
            "fileKey": file_key,
            "error": str(exc),
        }))
        if profile_id != "unknown" and profile_id != "recruiter" and file_key != "unknown":
            save_failure_to_dynamodb(profile_id, file_key, str(exc))
        raise