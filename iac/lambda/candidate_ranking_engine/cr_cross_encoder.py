"""Cross-encoder re-ranking — candidate ranking."""
import math
import os
import re


from cr_config import (
    CE_SIGMOID_SCALE,
    CE_SIGMOID_SHIFT,
    CROSS_ENCODER_BAKED_PATH,
    CROSS_ENCODER_CHUNK_CHARS,
    CROSS_ENCODER_JD_QUERY_CHARS,
    CROSS_ENCODER_MAX_CHUNKS,
    CROSS_ENCODER_MODEL_ID,
    CROSS_ENCODER_OVERLAP_CHARS,
    CROSS_ENCODER_TOP_K,
    ENABLE_CROSS_ENCODER,
    TOP_K_WEIGHTS,
)

_cross_encoder_instance = None


def _get_cross_encoder():
    global _cross_encoder_instance
    if _cross_encoder_instance is not None:
        return _cross_encoder_instance
    if not ENABLE_CROSS_ENCODER:
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
        return _cross_encoder_instance
    except Exception as exc:
        print(f"WARNING: Cross-encoder unavailable: {exc}")
        return None


def normalize_matching_text(text: str, max_chars: int = 12000) -> str:
    if not text:
        return ""
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = re.sub(r"`{3,}.*?`{3,}", " ", cleaned, flags=re.S)
    cleaned = re.sub(r"(^|\n)\s{0,3}#{1,6}\s*", r"\1", cleaned)
    cleaned = re.sub(r"[*_~`>#-]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = " ".join(cleaned.split())
    return cleaned[:max_chars].strip()


def _extract_priority_sections(text: str, keywords: list[str], max_chars: int = 4000) -> str:
    lines = [line.strip() for line in text.replace("\r\n", "\n").split("\n")]
    if not lines:
        return ""
    out: list[str] = []
    capture: list[str] = []
    in_target = False
    kw = [k.casefold() for k in keywords]
    for line in lines:
        low = line.casefold()
        heading_like = len(line) <= 90 and any(
            token in low
            for token in ("skill", "requirement", "qualification", "experience", "project", "technical")
        )
        if heading_like:
            if in_target and capture:
                out.append("\n".join(capture).strip())
                capture = []
            in_target = any(k in low for k in kw)
        if in_target and line:
            capture.append(line)
        if in_target and not line and capture:
            out.append("\n".join(capture).strip())
            capture = []
            in_target = False
    if in_target and capture:
        out.append("\n".join(capture).strip())
    return "\n\n".join(s for s in out if s)[:max_chars]


def build_jd_query_text(jd_text: str) -> str:
    normalized = normalize_matching_text(jd_text, max_chars=12000)
    prioritized = _extract_priority_sections(
        normalized,
        keywords=["requirement", "technical", "qualification", "must have", "job description"],
        max_chars=4500,
    )
    if prioritized:
        return f"{prioritized}\n\n{normalized}"[:6000]
    return normalized[:6000]


def build_cv_query_text(cv_text: str) -> str:
    normalized = normalize_matching_text(cv_text, max_chars=16000)
    prioritized = _extract_priority_sections(
        normalized,
        keywords=["technical skills", "skills", "experience", "projects", "work experience"],
        max_chars=5000,
    )
    if prioritized:
        return f"{prioritized}\n\n{normalized}"[:8000]
    return normalized[:8000]


def _calibrated_sigmoid(
    logit: float,
    shift: float = CE_SIGMOID_SHIFT,
    scale: float = CE_SIGMOID_SCALE,
) -> float:
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


def cross_encode_jd_vs_candidates(
    jd_text: str,
    candidates: list[dict],
) -> list[dict]:
    """
    Re-rank candidate matches using Cross-Encoder.

    JD text is the query. Each candidate's masked CV text is chunked into
    overlapping 800-char windows. We score (jd_query, cv_chunk) pairs and
    use weighted top-3 averaging (0.5/0.3/0.2) to reward candidates with
    multiple strong, relevant sections.

    This is the standard direction: JD as query, CV as passage — consistent
    with how ms-marco was trained for passage retrieval.

    Modifies candidates in-place (adds crossScore field).
    Returns candidates sorted by crossScore descending.
    """
    ce = _get_cross_encoder()
    if ce is None:
        for c in candidates:
            c["crossScore"] = None
        return candidates

    jd_query = build_jd_query_text(jd_text)[:CROSS_ENCODER_JD_QUERY_CHARS].strip()
    if not jd_query:
        for c in candidates:
            c["crossScore"] = None
        return candidates

    # ── Phase 1: Chunk candidates and build all pairs ──
    all_pairs: list[tuple[str, str]] = []
    # Tracks (start_idx, num_chunks, chunks) for each candidate
    candidate_pair_ranges: list[tuple[int, int, list[str]] | None] = []

    for candidate in candidates:
        cv_text = build_cv_query_text(candidate.get("maskedCvText", ""))
        if not cv_text:
            candidate_pair_ranges.append(None)
            continue

        # Chunk CV into overlapping windows
        chunks = []
        step = max(1, CROSS_ENCODER_CHUNK_CHARS - CROSS_ENCODER_OVERLAP_CHARS)
        start = 0
        while start < len(cv_text) and len(chunks) < CROSS_ENCODER_MAX_CHUNKS:
            end = start + CROSS_ENCODER_CHUNK_CHARS
            chunk = cv_text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end >= len(cv_text):
                break
            start += step

        if not chunks:
            candidate_pair_ranges.append(None)
            continue

        start_pos = len(all_pairs)
        for chunk in chunks:
            all_pairs.append((jd_query, chunk))
        candidate_pair_ranges.append((start_pos, len(chunks), chunks))

    if not all_pairs:
        for c in candidates:
            c["crossScore"] = None
            c["crossDiagnostics"] = {"chunkCount": 0, "jdChars": len(jd_query)}
        return candidates

    # ── Phase 2: Single Batched Inference ──
    print(
        f"INFO: Cross-Encoder batch scoring "
        f"{len(candidates)} candidate(s) = {len(all_pairs)} pair(s)."
    )
    import time
    started_at = time.time()
    raw_logits = ce.predict(all_pairs)
    elapsed_ms = (time.time() - started_at) * 1000

    # ── Phase 3: Slice results back per-candidate ──
    for idx, candidate in enumerate(candidates):
        pair_range = candidate_pair_ranges[idx]
        if pair_range is None:
            candidate["crossScore"] = None
            candidate["crossDiagnostics"] = {"chunkCount": 0, "jdChars": len(jd_query)}
            continue

        start_idx, num_chunks, chunks = pair_range
        candidate_logits = raw_logits[start_idx : start_idx + num_chunks]
        normalized = [_calibrated_sigmoid(float(logit)) for logit in candidate_logits]

        # Weighted top-k average: rewards depth, not just one lucky chunk
        top_k = sorted(normalized, reverse=True)[:CROSS_ENCODER_TOP_K]
        raw_weights = TOP_K_WEIGHTS[: len(top_k)]
        weight_sum = sum(raw_weights)
        weights = [w / weight_sum for w in raw_weights]
        aggregated = sum(s * w for s, w in zip(top_k, weights))

        candidate["crossScore"] = round(aggregated * 100, 2)
        candidate["crossDiagnostics"] = {
            "chunkCount": num_chunks,
            "jdChars": len(jd_query),
            "maxChunkScore": round(max(normalized) * 100, 2) if normalized else None,
        }

    print(f"INFO: Cross-Encoder batch completed in {elapsed_ms:.0f}ms.")
    return candidates

