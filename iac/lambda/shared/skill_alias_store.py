"""
DynamoDB-backed auto-learning alias store for skill canonicalization.

Drop this file into each Lambda directory at build time.
It uses a late-bound factory for the boto3 DynamoDB resource so it can be
imported at module level in any Lambda without circular-import issues.

## Usage (in each Lambda's canonical/normalize module)

    import skill_alias_store as _alias_store
    from <lambda>_clients import dynamodb as _dynamodb

    _alias_store.configure(lambda: _dynamodb)
    _alias_store.load_aliases(seed=_DET_ALIASES)

## DynamoDB key design

    PK = "SKILL_ALIAS"
    SK = "ALIAS#<alias_key>"   (alias_key = raw_skill.casefold())

A single Query(PK="SKILL_ALIAS") returns every alias in one paginated
sweep — no Scan, no GSI needed.

## Thread safety

Lambda is single-threaded per invocation; module-level state is safe
across invocations within the same warm container.
"""
from __future__ import annotations

import datetime
import os
import time
from decimal import Decimal
from typing import Callable

# ---------------------------------------------------------------------------
# Configuration — all overridable via environment variables
# ---------------------------------------------------------------------------

# DynamoDB table name (matches existing Lambda env vars)
_TABLE_NAME: str = (
    os.environ.get("DYNAMODB_TABLE_NAME")
    or os.environ.get("DYNAMODB_TABLE")
    or "SmartHire_ApplicationTracking"
)

# Seconds before a warm container re-fetches aliases from DynamoDB.
# Set to 0 in staging for instant reload; 3600 for a stable production set.
_REFRESH_INTERVAL: float = float(os.environ.get("SKILL_ALIAS_REFRESH_SEC", "300"))

# Minimum Haiku confidence before a learned mapping is persisted.
_PROMOTE_MIN_CONFIDENCE: float = float(os.environ.get("ALIAS_PROMOTE_MIN_SIM", "0.90"))

# Set ALIAS_AUTO_LEARN=true to enable auto-persisting Haiku matches to DynamoDB.
# Default is disabled — Haiku runs on every invocation without caching results.
_AUTO_LEARN_ENABLED: bool = os.environ.get("ALIAS_AUTO_LEARN", "false").lower() == "true"

# ---------------------------------------------------------------------------
# Module-level state (lives for the lifetime of the warm Lambda container)
# ---------------------------------------------------------------------------

_aliases: dict[str, str] = {}     # casefold key → canonical display label
_last_loaded: float = 0.0         # monotonic clock at last DynamoDB load
_dynamo_resource_factory: Callable | None = None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def configure(dynamo_resource_factory: Callable) -> None:
    """
    Inject the boto3 DynamoDB resource used by this store.

    Call once at module level in the Lambda's canonical/normalize module:

        _alias_store.configure(lambda: _dynamodb)

    The factory is a zero-argument callable evaluated lazily, avoiding
    cold-start ordering issues when this module is imported before boto3
    is fully initialised.
    """
    global _dynamo_resource_factory
    _dynamo_resource_factory = dynamo_resource_factory


def load_aliases(seed: dict[str, str] | None = None, *, force: bool = False) -> dict[str, str]:
    """
    Load all SKILL_ALIAS items from DynamoDB and merge with `seed`.

    DynamoDB entries win on conflict so learned/curated aliases override
    compile-time defaults.  Results are cached in `_aliases` for
    `_REFRESH_INTERVAL` seconds (default 5 min).

    Parameters
    ----------
    seed    : The hardcoded _DET_ALIASES dict — used as a fallback baseline.
    force   : If True, bypass the cache and always re-fetch from DynamoDB.

    Returns the combined alias map (casefold key → canonical label).
    """
    global _aliases, _last_loaded

    now = time.monotonic()
    if not force and _aliases and (now - _last_loaded) < _REFRESH_INTERVAL:
        return _aliases  # warm-path: zero I/O

    # Start from the hardcoded seed (lowest priority)
    merged: dict[str, str] = dict(seed or {})

    try:
        table = _get_table()
        kwargs: dict = {
            "KeyConditionExpression": "PK = :pk",
            "ExpressionAttributeValues": {":pk": "SKILL_ALIAS"},
        }
        while True:
            resp = table.query(**kwargs)
            for item in resp.get("Items", []):
                sk: str = str(item.get("SK", ""))
                if not sk.startswith("ALIAS#"):
                    continue
                alias_key = sk[len("ALIAS#"):]
                canonical = str(item.get("canonical", ""))
                if alias_key and canonical:
                    merged[alias_key] = canonical  # DynamoDB wins over seed

            last_key = resp.get("LastEvaluatedKey")
            if not last_key:
                break
            kwargs["ExclusiveStartKey"] = last_key

        _aliases = merged
        _last_loaded = now
        ddb_count = len(merged) - len(seed or {})
        print(
            f"INFO: skill_alias_store loaded {len(merged)} aliases "
            f"({ddb_count} from DynamoDB, {len(seed or {})} from seed)."
        )
    except Exception as exc:
        # Non-fatal: fall back to whatever we have
        print(f"WARNING: skill_alias_store load failed, using cached/seed aliases: {exc}")
        if not _aliases:
            _aliases = merged  # on very first cold start failure, use seed

    return _aliases


def save_alias(
    alias_key: str,
    canonical: str,
    confidence: float,
    *,
    source: str = "haiku",
) -> None:
    """
    Persist a learned alias to DynamoDB and update the in-memory cache.

    The in-memory cache is updated immediately so the current warm container
    benefits without waiting for the next refresh cycle.

    DynamoDB write uses `update_item` with `ADD hitCount :1` to atomically
    increment the confirmation counter even when two containers race.

    Parameters
    ----------
    alias_key  : Casefolded raw skill string (e.g. "yolov9").
    canonical  : Canonical display label (e.g. "YOLO").
    confidence : Haiku confidence score that triggered this save.
    source     : Provenance tag — "haiku", "seed", or "manual".
    """
    if not alias_key or not canonical:
        return
    if not _AUTO_LEARN_ENABLED:
        return  # auto-learn disabled — Haiku runs fresh every time
    if confidence < _PROMOTE_MIN_CONFIDENCE:
        return  # double-gate: caller should also check, but guard here too

    # Update in-process cache immediately so this container benefits right away
    _aliases[alias_key] = canonical

    try:
        now_iso = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        table = _get_table()
        table.update_item(
            Key={"PK": "SKILL_ALIAS", "SK": f"ALIAS#{alias_key}"},
            UpdateExpression=(
                "SET canonical = :c, #src = :s, confidence = :cf, "
                "updatedAt = :u, createdAt = if_not_exists(createdAt, :u) "
                "ADD hitCount :one"
            ),
            ExpressionAttributeNames={"#src": "source"},
            ExpressionAttributeValues={
                ":c":   canonical,
                ":s":   source,
                ":cf":  Decimal(str(round(confidence, 4))),
                ":u":   now_iso,
                ":one": Decimal("1"),
            },
        )
        print(
            f"INFO: skill_alias_store saved alias '{alias_key}' -> '{canonical}' "
            f"(confidence={confidence:.3f}, source={source})"
        )
    except Exception as exc:
        # Never let a DynamoDB write block or crash the matching pipeline
        print(
            f"WARNING: skill_alias_store save failed for "
            f"'{alias_key}' -> '{canonical}': {exc}"
        )


def get_canonical(alias_key: str) -> str | None:
    """
    Look up a casefolded alias key in the in-memory cache.

    Returns the canonical display label, or None if not found.
    The caller must have called load_aliases() at cold start.
    This is O(1) — no I/O.
    """
    return _aliases.get(alias_key)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_table():
    """Return the boto3 Table object. Raises RuntimeError if not configured."""
    if _dynamo_resource_factory is None:
        raise RuntimeError(
            "skill_alias_store: call configure() before load_aliases() or save_alias(). "
            "Add: _alias_store.configure(lambda: _dynamodb) at module level."
        )
    resource = _dynamo_resource_factory()
    return resource.Table(_TABLE_NAME)
