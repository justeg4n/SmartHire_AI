"""Haiku-only semantic skill mapping for job suggestions."""
import hashlib
import json
from collections import OrderedDict

import skill_alias_store as _alias_store
from js_clients import bedrock
from js_config import (
    AI_SKILL_CACHE_SIZE,
    ALIAS_PROMOTE_MIN_SIM,
    ENABLE_AI_SKILL_SEMANTICS,
    MAX_CANDIDATE_SKILLS,
    MAX_REQUIRED_SKILLS,
    SKILL_SIM_FULL_MATCH,
    SKILL_SIM_WEAK,
    SKILL_SEMANTICS_MAX_OUTPUT_TOKENS,
    SKILL_SEMANTICS_MODEL_ID,
)

_CACHE: "OrderedDict[str, dict[str, str]]" = OrderedDict()
_CONF_CACHE: "OrderedDict[str, dict[str, dict[str, object]]]" = OrderedDict()


def _strip_json_fence(text: str) -> str:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        cleaned = parts[1] if len(parts) > 1 else cleaned
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].lstrip()
    return cleaned.strip()


def _parse_matches_incremental(text: str) -> list[dict]:
    """Decode each complete object in matches[] even if the tail was truncated."""
    decoder = json.JSONDecoder()
    key_idx = text.find('"matches"')
    if key_idx == -1:
        return []
    bracket = text.find("[", key_idx)
    if bracket == -1:
        return []
    i = bracket + 1
    n = len(text)
    rows: list[dict] = []
    while i < n:
        while i < n and text[i] in " \t\n\r,":
            i += 1
        if i >= n or text[i] == "]":
            break
        try:
            obj, end = decoder.raw_decode(text, i)
        except json.JSONDecodeError:
            break
        if isinstance(obj, dict):
            rows.append(obj)
        i = end
    return rows


def _parse_semantics_payload(raw_text: str) -> dict:
    """Parse model JSON; tolerate trailing junk or truncation mid-array."""
    cleaned = _strip_json_fence(raw_text) or "{}"
    for candidate in (cleaned, cleaned[cleaned.find("{") :] if "{" in cleaned else cleaned):
        if not candidate.strip().startswith("{"):
            continue
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue
    rows = _parse_matches_incremental(cleaned)
    return {"matches": rows} if rows else {}


def _normalize_display_skills(skills: list[str], max_items: int) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for skill in skills or []:
        label = " ".join((str(skill) or "").split())
        if not label:
            continue
        key = label.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(label)
        if len(out) >= max_items:
            break
    return out


def _cache_get(cache_key: str) -> dict[str, str] | None:
    cached = _CACHE.get(cache_key)
    if cached is None:
        return None
    _CACHE.move_to_end(cache_key)
    return dict(cached)


def _cache_put(cache_key: str, value: dict[str, str]) -> None:
    if AI_SKILL_CACHE_SIZE <= 0:
        return
    _CACHE[cache_key] = dict(value)
    _CACHE.move_to_end(cache_key)
    while len(_CACHE) > AI_SKILL_CACHE_SIZE:
        _CACHE.popitem(last=False)


def _conf_cache_get(cache_key: str) -> dict[str, dict[str, object]] | None:
    cached = _CONF_CACHE.get(cache_key)
    if cached is None:
        return None
    _CONF_CACHE.move_to_end(cache_key)
    return dict(cached)


def _conf_cache_put(cache_key: str, value: dict[str, dict[str, object]]) -> None:
    if AI_SKILL_CACHE_SIZE <= 0:
        return
    _CONF_CACHE[cache_key] = dict(value)
    _CONF_CACHE.move_to_end(cache_key)
    while len(_CONF_CACHE) > AI_SKILL_CACHE_SIZE:
        _CONF_CACHE.popitem(last=False)


def resolve_semantic_skill_matches_with_confidence(
    required_skills: list[str],
    candidate_skills: list[str],
) -> dict[str, dict[str, object]]:
    """
    Return casefolded-required -> {"candidate": <label>, "confidence": <0..1>, "tier": "..."}.
    Tier meanings:
    - full: confidence >= SKILL_SIM_FULL_MATCH
    - weak: confidence >= SKILL_SIM_WEAK and < SKILL_SIM_FULL_MATCH
    - none: not mapped or below SKILL_SIM_WEAK
    """
    if not ENABLE_AI_SKILL_SEMANTICS:
        return {}

    required = _normalize_display_skills(required_skills, MAX_REQUIRED_SKILLS)
    candidates = _normalize_display_skills(candidate_skills, MAX_CANDIDATE_SKILLS)
    if not required or not candidates:
        return {}

    candidate_by_key = {c.casefold(): c for c in candidates}
    required_keys = {r.casefold() for r in required}

    cache_payload = {
        "model": SKILL_SEMANTICS_MODEL_ID,
        "required": [r.casefold() for r in required],
        "candidate": [c.casefold() for c in candidates],
    }
    cache_key = hashlib.sha256(
        json.dumps(cache_payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    cached = _conf_cache_get(cache_key)
    if cached is not None:
        return cached

    system_prompt = """You map required job skills to candidate skills by semantic equivalence.
Output strict JSON only as a single minified line (no markdown, no pretty-print, no line breaks inside the JSON):
{"matches":[{"requiredSkill":"","candidateSkill":null,"confidence":0.0}]}
Rules:
- candidateSkill must be EXACTLY one string from candidate_skills list, or null.
- Do not invent or rewrite labels.
- confidence must be 0..1.
- Return one object for each requiredSkill input.
"""
    user_message = json.dumps(
        {"required_skills": required, "candidate_skills": candidates},
        ensure_ascii=False,
    )
    payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max(256, min(SKILL_SEMANTICS_MAX_OUTPUT_TOKENS, 8192)),
        "temperature": 0,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    }

    try:
        response = bedrock.invoke_model(
            modelId=SKILL_SEMANTICS_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload),
        )
        response_data = json.loads(response.get("body").read())
        raw_text = response_data.get("content", [{}])[0].get("text", "")
        parsed = _parse_semantics_payload(raw_text)
    except Exception as exc:
        print(f"WARNING: Skill semantic mapping failed (non-fatal): {exc}")
        return {}

    result: dict[str, dict[str, object]] = {}
    rows = parsed.get("matches", []) if isinstance(parsed, dict) else []
    if not isinstance(rows, list):
        return {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        req = " ".join(str(row.get("requiredSkill", "")).split())
        req_key = req.casefold()
        if req_key not in required_keys:
            continue
        cand = " ".join(str(row.get("candidateSkill", "")).split()) if row.get("candidateSkill") else ""
        if not cand:
            result[req_key] = {"candidate": None, "confidence": 0.0, "tier": "none"}
            continue
        cand_key = cand.casefold()
        if cand_key not in candidate_by_key:
            continue
        confidence_raw = row.get("confidence")
        try:
            confidence = float(confidence_raw)
        except (TypeError, ValueError):
            confidence = 0.0
        if confidence >= SKILL_SIM_FULL_MATCH:
            tier = "full"
        elif confidence >= SKILL_SIM_WEAK:
            tier = "weak"
        else:
            tier = "none"
        result[req_key] = {
            "candidate": candidate_by_key[cand_key],
            "confidence": max(0.0, min(1.0, confidence)),
            "tier": tier,
        }

    # ── Auto-learn: promote high-confidence pairs to the alias store ─────────
    # When Haiku is very confident two skill labels are synonyms, persist the
    # mapping so future matching resolves at Tier-1 (deterministic) without
    # calling Haiku again.  We only learn when the pair is a genuine synonym
    # (cand_cf != req_key) to avoid trivial identity entries.
    for req_key, entry in result.items():
        if not isinstance(entry, dict):
            continue
        conf = float(entry.get("confidence") or 0.0)
        if conf < ALIAS_PROMOTE_MIN_SIM:
            continue
        cand_label = str(entry.get("candidate") or "")
        if not cand_label:
            continue
        cand_cf = cand_label.casefold()
        if cand_cf == req_key:
            continue  # skip trivial identity (no alias needed)
        # Canonical display for the required skill key
        req_canonical = _alias_store.get_canonical(req_key) or req_key
        _alias_store.save_alias(cand_cf, req_canonical, conf)
    # ─────────────────────────────────────────────────────────────────────────

    _conf_cache_put(cache_key, result)
    return result


def resolve_semantic_skill_matches(required_skills: list[str], candidate_skills: list[str]) -> dict[str, str]:
    """
    Return casefolded-required -> candidate-label matches using Haiku.
    Only labels that already exist in candidate_skills are accepted.
    """
    conf_map = resolve_semantic_skill_matches_with_confidence(required_skills, candidate_skills)
    result: dict[str, str] = {}
    for req_key, entry in conf_map.items():
        if not isinstance(entry, dict):
            continue
        cand = str(entry.get("candidate") or "")
        if not cand:
            continue
        confidence = float(entry.get("confidence") or 0.0)
        if confidence < ALIAS_PROMOTE_MIN_SIM:
            continue
        result[req_key] = cand

    return result
