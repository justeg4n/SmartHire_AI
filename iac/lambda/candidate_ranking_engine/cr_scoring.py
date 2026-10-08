"""Scoring helpers + Bedrock recruiter snapshot — candidate ranking."""
import json
import re
from typing import Any

from cr_clients import bedrock
from cr_config import (
    CLAUDE_MODEL_ID,
    ENABLE_CANDIDATE_SNAPSHOT,
    ENABLE_SKILL_GAP_FUZZY,
    HYBRID_WEIGHT_BI,
    HYBRID_WEIGHT_CROSS,
    MAX_CANDIDATE_SKILLS,
)
from cr_skill_normalize import deterministic_canonical_key, fold_vendor_cloud_label
from cr_skill_semantics import resolve_semantic_skill_matches

def compute_hybrid_score(bi_score: float, cross_score: float | None) -> float:
    if cross_score is None:
        return round(bi_score, 2)
    blended = HYBRID_WEIGHT_BI * (bi_score / 100.0) + HYBRID_WEIGHT_CROSS * (cross_score / 100.0)
    return round(blended * 100, 2)


def _canonical_key(s: str) -> str:
    """Canonical comparison key — mirrors js_engine_core._canonical_skill_key().
    Never transforms the display label; used only for equality checks.
    """
    t = str(s).strip() if s else ""
    return deterministic_canonical_key(t) if t else ""


def _collapse_spaces(s: str) -> str:
    return " ".join((s or "").split())


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
    """Multi-word JD line contained in a longer CV line, or long token substring (OData, RESTful)."""
    r = _collapse_spaces(req).casefold()
    if len(r) < 4:
        return False
    for c in cand_list:
        cn = _collapse_spaces(str(c)).casefold()
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
    """e.g. JD 'Azure API Management' vs CV lines 'Azure' + 'API Management'."""
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


def _profile_auxiliary_skill_buckets(profile: dict[str, Any]) -> list[Any]:
    out: list[Any] = []
    projects = profile.get("projects") or []
    if isinstance(projects, list):
        for p in projects[:16]:
            if not isinstance(p, dict):
                continue
            st = p.get("stack") or []
            if isinstance(st, list):
                out.extend(st)
    rs = profile.get("recency_signals")
    if isinstance(rs, dict):
        st = rs.get("recent_primary_stack") or []
        if isinstance(st, list):
            out.extend(st)
    certs = profile.get("certifications")
    if isinstance(certs, list):
        out.extend(certs)
    dom = profile.get("domain_experience")
    if isinstance(dom, list):
        out.extend(dom)
    return out


def _flatten_skill_groups(parsed_data: dict[str, Any]) -> list[Any]:
    """Flatten skill_groups dynamic dict — any domain AI creates."""
    sg = parsed_data.get("skill_groups")
    if not isinstance(sg, dict):
        return []
    out: list[Any] = []
    for group_skills in sg.values():
        if isinstance(group_skills, list):
            out.extend(group_skills)
    return out


def flatten_profile_skills_for_gap(
    profile: dict[str, Any],
    extra_from_metadata: list[Any] | None = None,
) -> list[str]:
    """
    Same buckets as cv_jd_processor.extract_candidate_skills_from_parsed_data:
    frontend/backend/devops/soft + skills[], project stacks, recency, certs, domain,
    plus METADATA.candidateSkills.
    """
    buckets: list[Any] = [
        profile.get("frontend_skills", []),
        profile.get("backend_skills", []),
        profile.get("devops_skills", []),
        profile.get("data_skills", []),
        profile.get("ai_skills", []),
        profile.get("soft_skills", []),
        profile.get("embedded_skills", []),
        profile.get("blockchain_skills", []),
        profile.get("mobile_skills", []),
        profile.get("cloud_skills", []),
        profile.get("skills", []),
        _flatten_skill_groups(profile),           # dynamic domain groups
        _profile_auxiliary_skill_buckets(profile),
    ]
    if extra_from_metadata:
        buckets.append(extra_from_metadata)

    out: list[str] = []
    seen: set[str] = set()
    for bucket in buckets:
        if not isinstance(bucket, list):
            continue
        for x in bucket:
            s = str(x).strip() if x is not None else ""
            if not s:
                continue
            k = _canonical_key(s)  # canonical dedup — mirrors js_engine_core._build_candidate_skill_map
            if not k or k in seen:
                continue
            seen.add(k)
            out.append(s)
            if len(out) >= MAX_CANDIDATE_SKILLS:
                break
    return out


def compute_skill_gap_for_ranking(
    required_skills: list[str],
    candidate_skills: list[str],
    required_groups: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    JD required skills vs candidate skill list.
    skillGapScore = % of required skills matched (0–100).
    Exact casefold match first; optional fuzzy (phrase / token-union) via ENABLE_SKILL_GAP_FUZZY.
    """
    # Dedup required skills by canonical key while preserving original display label
    req_out: list[str] = []
    seen: set[str] = set()
    for x in (required_skills or []):
        t = str(x).strip() if x else ""
        if not t:
            continue
        k = _canonical_key(t)
        if not k or k in seen:
            continue
        seen.add(k)
        req_out.append(t)  # keep original label unchanged

    cand_list = [str(x).strip() for x in (candidate_skills or []) if x and str(x).strip()]
    # Build canonical key set for candidate skills — symmetric with req side
    cand_canon = {_canonical_key(x) for x in cand_list}
    cand_canon.discard("")

    matched: list[str] = []
    missing: list[str] = []
    unresolved: list[str] = []
    for s in req_out:
        req_key = _canonical_key(s)
        if req_key and req_key in cand_canon:   # symmetric canonical match
            matched.append(s)
        elif _gap_fuzzy_matched(s, cand_list):  # fuzzy fallback
            matched.append(s)
        else:
            unresolved.append(s)

    semantic_matches = resolve_semantic_skill_matches(unresolved, cand_list)
    for skill in unresolved:
        if skill.casefold() in semantic_matches:
            matched.append(skill)
        else:
            missing.append(skill)

    matched_groups: list[dict[str, Any]] = []
    missing_groups: list[dict[str, Any]] = []
    if isinstance(required_groups, dict):
        one_of = required_groups.get("one_of", [])
        if isinstance(one_of, list):
            for group in one_of:
                if not isinstance(group, dict):
                    continue
                label = str(group.get("label", "")).strip() or "One-of group"
                options = [str(x).strip() for x in (group.get("options", []) or []) if str(x).strip()]
                if not options:
                    continue

                satisfied_by = None

                # First pass: canonical key or fuzzy matching
                for opt in options:
                    opt_key = _canonical_key(opt)
                    if (
                        (opt_key and opt_key in cand_canon)
                        or _gap_fuzzy_matched(opt, cand_list)
                    ):
                        satisfied_by = opt
                        break

                # Second pass: semantic matching
                if not satisfied_by:
                    sem_matches = resolve_semantic_skill_matches(options, cand_list)
                    for opt in options:
                        if opt.casefold() in sem_matches:
                            satisfied_by = sem_matches[opt.casefold()]
                            break

                group_obj = {
                    "label": label,
                    "options": options,
                    "satisfied_by": satisfied_by
                }

                if satisfied_by:
                    matched_groups.append(group_obj)
                else:
                    missing_groups.append(group_obj)

    score = round((len(matched) / len(req_out)) * 100, 2) if req_out else 0.0
    return {
        "matchedSkills": matched,
        "missingSkills": missing,
        "skillGapScore": score,
        "matchedGroups": matched_groups,
        "missingGroups": missing_groups,
    }


def _normalize_contact_info(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {
            "fullName": "",
            "email": "",
            "phone": "",
            "githubUrl": "",
            "linkedinUrl": "",
            "portfolioUrl": "",
        }
    return {
        "fullName": str(raw.get("fullName", "")).strip(),
        "email": str(raw.get("email", "")).strip(),
        "phone": str(raw.get("phone", "")).strip(),
        "githubUrl": str(raw.get("githubUrl", "")).strip(),
        "linkedinUrl": str(raw.get("linkedinUrl", "")).strip(),
        "portfolioUrl": str(raw.get("portfolioUrl", "")).strip(),
    }


def _score_project_relevance(required_skills: list[str], profile: dict[str, Any]) -> tuple[float, list[str]]:
    projects = profile.get("projects", []) if isinstance(profile, dict) else []
    if not isinstance(projects, list) or not projects:
        return 0.0, []
    required = {str(s).strip().lower() for s in required_skills if str(s).strip()}
    if not required:
        return 0.0, []
    matched: set[str] = set()
    evidence: list[str] = []
    for project in projects[:8]:
        if not isinstance(project, dict):
            continue
        project_name = str(project.get("name", "Project")).strip() or "Project"
        stack = [str(s).strip() for s in (project.get("stack", []) or []) if str(s).strip()]
        for tech in stack:
            if tech.lower() in required:
                matched.add(tech.lower())
                evidence.append(f"{project_name}: uses {tech}")
                if len(evidence) >= 4:
                    break
        if len(evidence) >= 4:
            break
    score = round((len(matched) / max(1, len(required))) * 100, 2)
    return score, evidence[:4]


def _score_experience_alignment(profile: dict[str, Any], years_experience: int) -> tuple[float, list[str]]:
    prof_exp = profile.get("professional_experience", []) if isinstance(profile, dict) else []
    if not isinstance(prof_exp, list) or not prof_exp:
        return 0.0, []
    role_count = len([x for x in prof_exp if isinstance(x, dict)])
    base = min(100.0, float(max(years_experience, 0) * 12))
    richness = min(20.0, role_count * 5.0)
    score = round(min(100.0, base + richness), 2)
    evidence: list[str] = []
    for role in prof_exp[:3]:
        if not isinstance(role, dict):
            continue
        title = str(role.get("title", "")).strip()
        company = str(role.get("company", "")).strip()
        if title or company:
            evidence.append(f"{title or 'Role'} at {company or 'organization'}")
    return score, evidence


# ---------------------------------------------------------------------------
# Step 7: Claude Agent 3 — Candidate Snapshot for Recruiter
# ---------------------------------------------------------------------------

def generate_candidate_snapshot(
    candidate: dict,
    job_title: str,
    required_skills: list[str],
    jd_preview: str,
) -> str:
    """
    Generate a concise, recruiter-facing 2-3 sentence candidate snapshot.

    This tells the recruiter WHY this candidate is in the shortlist — what
    specific skills match, what experience level they bring, and any notable gap.

    Written in third person ("The candidate has..." / "They bring...").
    Temperature=0.3 for slight variety while keeping factual accuracy high.

    This is Claude Agent 3 for the recruiter side — symmetric counterpart
    to the match explanation generated in job_suggestion_engine for candidates.
    """
    if not ENABLE_CANDIDATE_SNAPSHOT:
        return "Candidate matches key requirements based on vector similarity analysis."

    profile = candidate.get("parsedProfile", {})
    seniority = candidate.get("seniority", "Unknown")
    years_exp = candidate.get("yearsExperience", 0)
    backend = profile.get("backend_skills", [])
    frontend = profile.get("frontend_skills", [])
    devops = profile.get("devops_skills", [])
    all_skills = backend + frontend + devops
    gaps = profile.get("gaps", "")
    strengths = profile.get("strengths", "")

    system_prompt = f"""You are a recruiter assistant AI writing concise candidate summaries for hiring managers.

Write exactly 2-3 sentences summarizing why this candidate is a strong match for the "{job_title}" role.

Rules:
- Write in third person ("The candidate...", "They...")
- Be specific: mention actual skills that match actual requirements
- Include the candidate's seniority and experience level naturally
- Optionally mention 1 gap if it's significant (do not sugarcoat)
- Do NOT mention match scores or numbers
- Do NOT be generic or use filler phrases
- Output ONLY the snapshot text. No JSON, no labels."""

    user_message = f"""Candidate profile:
- Seniority: {seniority}, {years_exp} year(s) experience
- Technical skills: {", ".join(all_skills[:15]) if all_skills else "Not specified"}
- Strengths: {strengths[:250] if strengths else "Not provided"}
- Notable gaps: {gaps[:250] if gaps else "None identified"}

Role being hired for:
- Title: {job_title}
- Required skills: {", ".join(required_skills[:10]) if required_skills else "Not specified"}
- JD excerpt: {jd_preview[:600]}

Write the 2-3 sentence recruiter snapshot."""

    payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 180,
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
        snapshot = response_data.get("content", [{}])[0].get("text", "").strip()
        return snapshot or "Candidate demonstrates relevant technical experience for this role."

    except Exception as exc:
        print(f"WARNING: Candidate snapshot generation failed (non-fatal): {exc}")
        return "Candidate shows strong alignment with required technical skills."
