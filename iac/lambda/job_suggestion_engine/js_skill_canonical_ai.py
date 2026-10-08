"""Bedrock-backed batch canonicalization of skill strings + deterministic cleanup."""
from __future__ import annotations

import hashlib
import json
import re
from collections import OrderedDict
from typing import Any

import skill_alias_store as _alias_store
from js_clients import bedrock, dynamodb as _dynamodb
from js_config import (
    AI_SKILL_CACHE_SIZE,
    ENABLE_SKILL_CANONICAL_AI,
    MAX_REQUIRED_SKILLS,
    SKILL_CANONICAL_AI_MAX_OUTPUT_TOKENS,
    SKILL_CANONICAL_AI_MODEL_ID,
)

_CACHE: "OrderedDict[str, tuple[dict[str, str], dict[str, Any]]]" = OrderedDict()

_SKILL_VERSION_SUFFIX = re.compile(
    r"(?:\s+|\s*[-/]\s*)(?:v\d+(?:\.\d+)*|ver\.?\s*\d+(?:\.\d+)*|version\s*\d+(?:\.\d+)*)$",
    re.IGNORECASE,
)

# ── SYNC POINT ──────────────────────────────────────────────────────────────
# _DET_ALIASES phải giống nhau trong cả 3 modules:
#   js_skill_canonical_ai.py | cjp_skill_canonical_ai.py | cr_skill_normalize.py
# Khi thêm alias mới, hãy cập nhật CẢ 3 file cùng lúc.
# ─────────────────────────────────────────────────────────────────────────────
_DET_ALIASES: dict[str, str] = {
    "react.js": "React",
    "reactjs": "React",
    "react": "React",
    "node.js": "Node.js",
    "nodejs": "Node.js",
    "node": "Node.js",
    "aws lambda": "AWS",
    "lambda": "AWS",
    "k8s": "Kubernetes",
    "tf": "TensorFlow",
    "tensorflow 2": "TensorFlow",
    "pytorch lightning": "PyTorch",
    "torch": "PyTorch",
    "opencv cv": "OpenCV",
    "cv2": "OpenCV",
    "yolo v8": "YOLO",
    "yolov8": "YOLO",
    "yolov5": "YOLO",
    "yolov7": "YOLO",
    "yolo v5": "YOLO",
    "yolo v7": "YOLO",
    "yolov10": "YOLO",
    "yolo v10": "YOLO",
    "faster rcnn": "Faster R-CNN",
    "faster r-cnn": "Faster R-CNN",
    "faster r cnn": "Faster R-CNN",
    "mask r-cnn": "Mask R-CNN",
    "mask rcnn": "Mask R-CNN",
    "u net": "U-Net",
    "unet": "U-Net",
    "u-net": "U-Net",
    "resnet": "ResNet",
    "resnet50": "ResNet",
    "resnet101": "ResNet",
    "resnet-50": "ResNet",
    "resnet-101": "ResNet",
    "efficientnet": "EfficientNet",
    "efficientnet-b0": "EfficientNet",
    "efficientnet-b7": "EfficientNet",
    "vit": "ViT",
    "vision transformer": "ViT",
    "ssd": "SSD",
    "single shot detector": "SSD",
    "sam": "SAM",
    "segment anything": "SAM",
    "cnns": "CNNs",
    "cnn": "CNNs",
    "convolutional neural networks": "CNNs",
    "vision": "Computer Vision",
}

# ── Auto-learning alias store (DynamoDB-backed) ──────────────────────────────
# Inject the boto3 resource and perform the cold-start load at module init time
# so the first invocation pays zero DynamoDB latency on the hot path.
# _DET_ALIASES above is passed as `seed` — it remains the compile-time fallback
# if DynamoDB is unavailable.
_alias_store.configure(lambda: _dynamodb)
_alias_store.load_aliases(seed=_DET_ALIASES)
# ─────────────────────────────────────────────────────────────────────────────


def _collapse(s: str) -> str:
    return " ".join((s or "").split())


def fold_vendor_cloud_label(label: str) -> str:
    """Collapse AWS/GCP/Azure sub-service lines to vendor umbrella when clearly cloud IaaS/PaaS."""
    t = _collapse(label)
    if not t:
        return t
    tl = t.casefold()
    if tl == "aws" or tl.startswith("aws ") or tl.startswith("aws("):
        return "AWS"
    if "amazon web services" in tl:
        return "AWS"
    if tl.startswith("gcp ") or tl == "gcp" or tl.startswith("google cloud"):
        return "Google Cloud"
    if tl.startswith("azure ") or tl == "azure":
        return "Azure"
    return t


def _strip_versions_for_key(label: str) -> str:
    base = _collapse(fold_vendor_cloud_label(label))
    base = _SKILL_VERSION_SUFFIX.sub("", base).strip()
    return base


def deterministic_canonical_key(label: str) -> str:
    """Stable internal comparison key (always casefold)."""
    t = _strip_versions_for_key(label)
    if not t:
        return ""
    k = t.casefold()
    resolved = _alias_store.get_canonical(k) or k
    return resolved.casefold()


def deterministic_normalize_list(skills: list[str], max_items: int) -> list[str]:
    """Dedupe by deterministic key; preserve first-seen display string."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in skills or []:
        disp = fold_vendor_cloud_label(str(raw).strip())
        if not disp:
            continue
        key = deterministic_canonical_key(disp)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(disp)
        if len(out) >= max_items:
            break
    return out


def _strip_json_fence(text: str) -> str:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        cleaned = parts[1] if len(parts) > 1 else cleaned
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].lstrip()
    return cleaned.strip()


def _parse_ai_payload(raw_text: str) -> dict[str, Any]:
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
    return {}


def _cache_get(key: str) -> tuple[dict[str, str], dict[str, Any]] | None:
    hit = _CACHE.get(key)
    if hit is None:
        return None
    _CACHE.move_to_end(key)
    return hit


def _cache_put(key: str, value: tuple[dict[str, str], dict[str, Any]]) -> None:
    if AI_SKILL_CACHE_SIZE <= 0:
        return
    _CACHE[key] = value
    _CACHE.move_to_end(key)
    while len(_CACHE) > AI_SKILL_CACHE_SIZE:
        _CACHE.popitem(last=False)


def _anomaly_single_canonical_collapse(canonicals: list[str], n_input: int) -> bool:
    if n_input < 6 or not canonicals:
        return False
    freq: dict[str, int] = {}
    for c in canonicals:
        k = c.casefold()
        freq[k] = freq.get(k, 0) + 1
    top = max(freq.values())
    return (top / float(len(canonicals))) > 0.70


def _invoke_canonical_model(user_payload: dict[str, Any]) -> dict[str, Any]:
    system = """You normalize hiring \"skills\" to concise canonical industry labels for matching.
Return STRICT JSON only (no markdown), one line if possible:
{"items":[{"i":0,"canonical":"Short Label","domain":"short_snake","confidence":0.0}]}
Rules:
- items.length MUST equal skills.length; same order; i matches index in input skills array.
- canonical: 1-5 words, Title Case or well-known casing (PyTorch, Node.js, C++).
- Map synonymous / versioned / vendor-specific lines to one canonical (e.g. YOLOv8 -> YOLO, AWS EC2 -> AWS).
- domain: coarse bucket e.g. ml_cv, backend, cloud, data, soft_skill, other.
- confidence: 0..1 your confidence in the mapping.
- Do not drop skills: if unsure, set canonical close to input wording and confidence <= 0.5.
"""
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max(256, min(SKILL_CANONICAL_AI_MAX_OUTPUT_TOKENS, 8192)),
        "temperature": 0,
        "system": system,
        "messages": [{"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)}],
    }
    response = bedrock.invoke_model(
        modelId=SKILL_CANONICAL_AI_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )
    response_data = json.loads(response.get("body").read())
    raw_text = response_data.get("content", [{}])[0].get("text", "")
    return _parse_ai_payload(raw_text)


def _build_identity_map(skills: list[str]) -> dict[str, str]:
    m: dict[str, str] = {}
    for s in skills:
        t = _collapse(str(s))
        if t:
            m[t.casefold()] = fold_vendor_cloud_label(t)
    return m


def _ai_casefold_to_canonical(
    skills: list[str],
    *,
    side: str,
    context: dict[str, Any] | None,
) -> tuple[dict[str, str], dict[str, Any]]:
    """
    Map skill casefold(raw trimmed) -> canonical display string.
    On failure, returns identity-style map (fold_vendor only).
    """
    diagnostics: dict[str, Any] = {"mode": "deterministic", "ai": False}
    trimmed = [_collapse(str(s)) for s in skills if _collapse(str(s))]
    if not trimmed:
        return {}, diagnostics

    cache_payload = {
        "model": SKILL_CANONICAL_AI_MODEL_ID,
        "side": side,
        "skills": trimmed,
        "ctx": {
            "job_title": (context or {}).get("job_title", "")[:240],
            "jd_excerpt": (context or {}).get("jd_excerpt", "")[:800],
            "profile_summary": (context or {}).get("profile_summary", "")[:800],
        },
    }
    cache_key = hashlib.sha256(
        json.dumps(cache_payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    cached = _cache_get(cache_key)
    if cached is not None:
        d = dict(cached[1])
        d["cache_hit"] = True
        return dict(cached[0]), d

    if not ENABLE_SKILL_CANONICAL_AI:
        m = _build_identity_map(trimmed)
        diagnostics["reason"] = "disabled"
        _cache_put(cache_key, (m, diagnostics))
        return m, diagnostics

    cf_map: dict[str, str] = {}
    try:
        batch_size = 36
        for start in range(0, len(trimmed), batch_size):
            chunk = trimmed[start : start + batch_size]
            payload = {"side": side, "context": context or {}, "skills": chunk}
            parsed = _invoke_canonical_model(payload)
            rows = parsed.get("items", [])
            if not isinstance(rows, list) or len(rows) != len(chunk):
                raise ValueError("items_length_mismatch")
            for idx, row in enumerate(rows):
                if not isinstance(row, dict):
                    raise ValueError("bad_row")
                raw_in = chunk[idx]
                canon = _collapse(str(row.get("canonical", "")).strip()) or raw_in
                cf_map[raw_in.casefold()] = fold_vendor_cloud_label(canon)

        canon_values = list(cf_map.values())
        if _anomaly_single_canonical_collapse(canon_values, len(trimmed)):
            raise ValueError("collapse_anomaly")

        diagnostics["mode"] = "ai_map"
        diagnostics["ai"] = True
        _cache_put(cache_key, (cf_map, diagnostics))
        return cf_map, diagnostics
    except Exception as exc:
        print(f"WARNING: Skill canonicalization AI failed (identity map): {exc}")
        m = _build_identity_map(trimmed)
        diagnostics["mode"] = "deterministic_fallback"
        diagnostics["reason"] = str(exc)
        _cache_put(cache_key, (m, diagnostics))
        return m, diagnostics


def _apply_map_to_list(skills: list[str], cf_map: dict[str, str], max_items: int) -> list[str]:
    mapped: list[str] = []
    for s in skills or []:
        t = _collapse(str(s))
        if not t:
            continue
        mapped.append(cf_map.get(t.casefold(), fold_vendor_cloud_label(t)))
    return deterministic_normalize_list(mapped, max_items=max_items)


def canonicalize_skills_batch(
    skills: list[str],
    *,
    side: str,
    context: dict[str, Any] | None,
    max_items: int,
) -> tuple[list[str], dict[str, Any]]:
    """
    Full-auto canonicalization when enabled; always ends with deterministic dedupe.
    """
    trimmed = [_collapse(str(s)) for s in (skills or []) if _collapse(str(s))]
    if len(trimmed) > max_items:
        trimmed = trimmed[:max_items]
    if not trimmed:
        return [], {"mode": "empty", "ai": False}

    cf_map, diag = _ai_casefold_to_canonical(trimmed, side=side, context=context)
    out = _apply_map_to_list(trimmed, cf_map, max_items=max_items)
    return out, diag


def _ordered_unique_skills(parts: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for p in parts:
        t = _collapse(str(p))
        if not t:
            continue
        k = t.casefold()
        if k in seen:
            continue
        seen.add(k)
        out.append(t)
    return out


def _flatten_group_skills(groups: dict[str, Any] | None) -> list[str]:
    if not isinstance(groups, dict):
        return []
    parts: list[str] = []
    for key in ("must_have", "nice_to_have"):
        arr = groups.get(key)
        if isinstance(arr, list):
            parts.extend(str(x) for x in arr if x is not None)
    one_of = groups.get("one_of")
    if isinstance(one_of, list):
        for g in one_of:
            if isinstance(g, dict):
                opts = g.get("options", [])
                if isinstance(opts, list):
                    parts.extend(str(x) for x in opts if x is not None)
    return parts


def canonicalize_required_skill_bundle(
    required_skills_flat: list[str],
    required_groups: dict[str, Any] | None,
    *,
    context: dict[str, Any] | None,
) -> tuple[list[str], dict[str, Any], dict[str, Any]]:
    """
    One AI pass over all unique required-side strings; returns flat must+nice list, new groups, diagnostics.
    """
    groups = required_groups if isinstance(required_groups, dict) else {}
    parts: list[str] = []
    parts.extend(str(x) for x in (required_skills_flat or []) if x is not None)
    parts.extend(_flatten_group_skills(groups))
    ordered = _ordered_unique_skills(parts)
    if not ordered:
        return [], dict(groups), {"mode": "empty", "ai": False}

    cf_map, diag = _ai_casefold_to_canonical(ordered, side="required", context=context)

    def map_one(s: str) -> str:
        t = _collapse(str(s))
        if not t:
            return t
        return cf_map.get(t.casefold(), fold_vendor_cloud_label(t))

    mh = groups.get("must_have")
    nh = groups.get("nice_to_have")
    new_must = [map_one(x) for x in (mh if isinstance(mh, list) else []) if x is not None]
    new_nice = [map_one(x) for x in (nh if isinstance(nh, list) else []) if x is not None]
    new_one_of: list[dict[str, Any]] = []
    if isinstance(groups.get("one_of"), list):
        for g in groups["one_of"]:
            if not isinstance(g, dict):
                continue
            opts_raw = g.get("options", [])
            opts = [map_one(x) for x in (opts_raw or []) if isinstance(opts_raw, list) and x is not None]
            label = str(g.get("label") or "One-of group").strip() or "One-of group"
            if opts:
                new_one_of.append({"label": label, "options": opts})

    new_groups: dict[str, Any] = {
        "must_have": deterministic_normalize_list(new_must, MAX_REQUIRED_SKILLS),
        "nice_to_have": deterministic_normalize_list(new_nice, MAX_REQUIRED_SKILLS),
        "one_of": new_one_of,
    }

    if not new_groups["must_have"] and required_skills_flat:
        new_groups["must_have"] = _apply_map_to_list(list(required_skills_flat), cf_map, MAX_REQUIRED_SKILLS)
        new_groups["nice_to_have"] = []

    flat = deterministic_normalize_list(
        list(new_groups["must_have"]) + list(new_groups["nice_to_have"]),
        max_items=MAX_REQUIRED_SKILLS,
    )
    diag_out = dict(diag)
    diag_out["bundle"] = True
    return flat, new_groups, diag_out
