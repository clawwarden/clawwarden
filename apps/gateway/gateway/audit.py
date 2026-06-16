"""Append-only, hash-chained audit trail backed by Redis.

Storage layout
--------------
Each UTC calendar day gets its own Redis list key:

    audit:{tenant_id}:{YYYY-MM-DD}   → list of JSON-encoded AuditEntry dicts

Each entry carries a cryptographic chain link so tampering with any record
breaks every subsequent hash and is detectable by ``verify_chain()``:

    entry_hash  = HMAC-SHA256(AUDIT_HMAC_KEY, canonical_json_of_entry_minus_entry_hash)
    prev_hash   = entry_hash of the immediately preceding entry,
                  or the sentinel "genesis" for the first record of each day

This is the same hash-chaining pattern used by Certificate Transparency logs,
HSM-backed audit systems, and SEC 17a-4 compliant WORM archives.

⛔ Halt-point (audit-scheme + WORM/retention policy):
    - The HMAC key is currently read from AUDIT_HMAC_KEY (falls back to
      JWT_SECRET for back-compat).  In production this MUST be a dedicated
      key from a KMS/HSM — rotating it re-signs the chain from scratch.
      Confirm key-management policy with the founder before wiring production.
    - Redis lists are NOT write-once: LSET/LREM/LTRIM can rewrite history.
      For true WORM (SEC 17a-4, FINRA Rule 4370, SOX) wire ``_persist_to_worm``
      to S3 Object Lock (Object Lock mode=COMPLIANCE, retention ≥ 7 years) or
      a Postgres append-only table (no UPDATE/DELETE triggers + pg_audit).
      Until that backend is wired, tamper-detection requires calling
      ``verify_chain()`` before trusting any result from ``get_logs()``.
    - Retention is 30 days by default in Redis; multi-year retention requires
      the durable WORM backend above.  Set ttl_days = None to disable the
      expiry (memory-bound; not recommended without the WORM backend).
    - confirm before changing GENESIS_SENTINEL — it anchors the start of
      every day's chain; changing it silently invalidates all prior proofs.

Event types
-----------
Use the ``EventType`` constants so log consumers can filter reliably without
free-text matching.
"""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog

from gateway.config import settings

log = structlog.get_logger()

GENESIS_SENTINEL = "genesis"


def _audit_hmac_key() -> bytes:
    """Return the HMAC key for audit-chain signing.

    Uses the dedicated AUDIT_HMAC_KEY setting when present, falling back to
    JWT_SECRET for back-compat with installations that pre-date the split.

    ⛔ Halt-point: in production wire this to a KMS-backed secret.
    """
    raw = getattr(settings, "audit_hmac_key", "") or settings.jwt_secret
    return raw.encode()


def _entry_hmac(canonical_json: str) -> str:
    """HMAC-SHA256 of a canonical JSON string using the audit chain key."""
    return hmac.new(_audit_hmac_key(), canonical_json.encode(), hashlib.sha256).hexdigest()


def _canonical(entry_without_hash: dict) -> str:
    """Stable, sorted-key JSON serialisation used for HMAC input."""
    return json.dumps(entry_without_hash, sort_keys=True, separators=(",", ":"))


class EventType:
    """Canonical audit event type strings."""

    SESSION_CREATE = "session_create"
    AUTH_TOKEN_ISSUED = "auth_token_issued"
    AUTH_FAILURE = "auth_failure"
    CHAT_REQUEST = "chat_request"
    PII_DETECTED = "pii_detected"
    PII_DETOKENIZED = "pii_detokenized"
    LLM_CALL = "llm_call"
    ADMIN_ACCESS = "admin_access"
    RATE_LIMIT = "rate_limit"
    INJECTION_DETECTED = "injection_detected"  # OWASP LLM01
    OUTPUT_FLAGGED = "output_flagged"          # OWASP LLM02


class AuditLogger:
    """Append-only, hash-chained Redis audit log.

    Args:
        redis_client: A connected ``redis.asyncio`` client.
        tenant_id:    Logical tenant namespace (default ``"default"``).
        ttl_days:     Retention window for each day's log list (None = no TTL).
    """

    def __init__(self, redis_client, tenant_id: str = "default", ttl_days: int = 30):
        self.redis = redis_client
        self.tenant_id = tenant_id
        self.ttl = ttl_days * 24 * 3600 if ttl_days else None

    def _day_key(
        self, date_str: Optional[str] = None, tenant_id: Optional[str] = None
    ) -> str:
        tenant = tenant_id or self.tenant_id
        if not date_str:
            date_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
        return f"audit:{tenant}:{date_str}"

    def _chain_cursor_key(self, day_key: str) -> str:
        """Redis key that stores the hash of the most-recently appended entry."""
        return f"{day_key}:chain_head"

    def _seq_key(self, day_key: str) -> str:
        """Monotonic per-day append counter. Never decremented, so it survives
        (and thus exposes) deletion of entries from the list."""
        return f"{day_key}:seq"

    def _watermark_key(self, day_key: str) -> str:
        """Signed high-water mark: ``"{seq}:{HMAC(seq:last_entry_hash)}"``.

        Because the mark is HMAC'd with the audit key, an attacker who deletes
        trailing entries cannot forge a mark matching the shortened chain. This
        closes the tail-truncation gap that prev/entry-hash chaining alone leaves
        open (a shorter chain is internally consistent)."""
        return f"{day_key}:watermark"

    async def _get_prev_hash(self, day_key: str) -> str:
        """Return the hash of the last written entry, or the genesis sentinel."""
        stored = await self.redis.get(self._chain_cursor_key(day_key))
        return stored if stored else GENESIS_SENTINEL

    async def log_event(
        self,
        event_type: str,
        correlation_id: str,
        session_id: Optional[str] = None,
        role: Optional[str] = None,
        details: Optional[dict] = None,
        tenant_id: Optional[str] = None,
    ) -> None:
        """Append a single hash-chained entry to today's audit log.

        Each entry includes:
          - ``prev_hash``: HMAC of the previous entry (or GENESIS_SENTINEL),
            forming a tamper-evident chain.
          - ``entry_hash``: HMAC of this entry's canonical JSON (all fields
            except ``entry_hash`` itself).

        To verify the full chain call ``verify_chain()``.
        """
        effective_tenant = tenant_id or self.tenant_id
        day_key = self._day_key(tenant_id=effective_tenant)
        prev_hash = await self._get_prev_hash(day_key)

        body = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            "event_type": event_type,
            "tenant_id": effective_tenant,
            "correlation_id": correlation_id,
            "session_id": session_id,
            "role": role,
            "details": details or {},
            "prev_hash": prev_hash,
        }
        entry_hash = _entry_hmac(_canonical(body))
        entry = {**body, "entry_hash": entry_hash}

        # Advance the monotonic append counter and sign a high-water mark over
        # (count, last_hash). Detached from the list so truncating the list does
        # not roll it back; HMAC means it cannot be forged for a shorter chain.
        seq = await self.redis.incr(self._seq_key(day_key))
        watermark = f"{seq}:{_entry_hmac(f'{seq}:{entry_hash}')}"

        raw = json.dumps(entry)
        pipe = self.redis.pipeline()
        pipe.rpush(day_key, raw)
        # Advance the chain cursor + watermark — same TTL as the list.
        pipe.set(self._chain_cursor_key(day_key), entry_hash)
        pipe.set(self._watermark_key(day_key), watermark)
        if self.ttl:
            pipe.expire(day_key, self.ttl)
            pipe.expire(self._chain_cursor_key(day_key), self.ttl)
            pipe.expire(self._watermark_key(day_key), self.ttl)
            pipe.expire(self._seq_key(day_key), self.ttl)
        await pipe.execute()

        # ⛔ Halt-point: call _persist_to_worm(entry) here once S3 Object Lock
        # or the Postgres append-only table backend is wired by the founder.

        log.debug("audit_event", event_type=event_type, correlation_id=correlation_id)

    async def get_logs(
        self,
        date: Optional[str] = None,
        limit: int = 500,
        tenant_id: Optional[str] = None,
    ) -> list[dict]:
        """Return the most-recent ``limit`` entries for the given UTC date.

        Args:
            date:      ISO 8601 date string (``YYYY-MM-DD``).  Defaults to today.
            limit:     Maximum number of entries to return (capped at 500).
            tenant_id: Tenant to read; defaults to the logger's tenant.

        Returns:
            List of audit entry dicts, oldest-first within the page.

        Note: call ``verify_chain(entries)`` on the returned slice to confirm
        no entries were tampered with before trusting them in regulated contexts.
        """
        key = self._day_key(date, tenant_id=tenant_id)
        entries = await self.redis.lrange(key, -min(limit, 500), -1)
        return [json.loads(e) for e in entries]

    async def verify_chain(
        self,
        date: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> dict:
        """Walk the full day's chain and verify every hash link.

        Returns:
            {
                "ok": bool,          # True iff every link checks out
                "entries": int,      # total entries inspected
                "first_bad": int,    # 0-based index of first broken link, or -1
                "error": str | None, # description of the first failure
            }

        A broken chain means either: (a) an entry was modified after write,
        (b) an entry was inserted or deleted mid-list, or (c) the HMAC key
        changed without re-signing the chain.  Any of these is a tamper signal.
        """
        key = self._day_key(date, tenant_id=tenant_id)
        raw_entries = await self.redis.lrange(key, 0, -1)
        parsed = [json.loads(e) for e in raw_entries]

        prev = GENESIS_SENTINEL
        for i, entry in enumerate(parsed):
            stored_entry_hash = entry.get("entry_hash", "")
            stored_prev_hash = entry.get("prev_hash", "")

            # Verify prev_hash link
            if stored_prev_hash != prev:
                return {
                    "ok": False,
                    "entries": len(parsed),
                    "first_bad": i,
                    "error": f"prev_hash mismatch at index {i}: expected {prev!r}, got {stored_prev_hash!r}",
                }

            # Recompute entry_hash over the body without entry_hash itself
            body = {k: v for k, v in entry.items() if k != "entry_hash"}
            expected_hash = _entry_hmac(_canonical(body))
            if stored_entry_hash != expected_hash:
                return {
                    "ok": False,
                    "entries": len(parsed),
                    "first_bad": i,
                    "error": f"entry_hash mismatch at index {i}: entry content was modified",
                }

            prev = stored_entry_hash

        # Tail-truncation / append-count check against the signed watermark.
        # `prev` now holds the hash of the last surviving entry (or the genesis
        # sentinel for an empty list). A watermark is present for any chain
        # written after this guard shipped; older chains skip it (backward compat).
        raw_mark = await self.redis.get(self._watermark_key(key))
        if raw_mark:
            try:
                seq_str, mark = raw_mark.split(":", 1)
                expected_seq = int(seq_str)
            except (ValueError, AttributeError):
                return {
                    "ok": False,
                    "entries": len(parsed),
                    "first_bad": len(parsed),
                    "error": "audit watermark is malformed",
                }
            expected_mark = _entry_hmac(f"{expected_seq}:{prev}")
            if expected_seq != len(parsed) or mark != expected_mark:
                return {
                    "ok": False,
                    "entries": len(parsed),
                    "first_bad": len(parsed),
                    "error": (
                        f"watermark mismatch: chain has {len(parsed)} entries but "
                        f"{expected_seq} were appended — entries were truncated or removed"
                    ),
                }

        return {"ok": True, "entries": len(parsed), "first_bad": -1, "error": None}
