"""Durable, append-only audit mirror (R1 — tamper-evidence WORM anchor).

The Redis log is fast but not write-once: an attacker with Redis access could
delete entries (even a whole day). This store mirrors the same hash-chained
entries into the SQL database as ONE continuous per-tenant chain. On Postgres an
append-only trigger (see database.install_worm_guard) rejects UPDATE/DELETE, so
the table is genuinely WORM; verification walks the continuous chain, so a missing
``seq`` or a broken ``prev_hash`` link — including a deleted day — is detected.

This is the regulator-facing source of truth for "the record was not altered."
"""

from __future__ import annotations

import json
import uuid
from typing import Optional

import structlog

from gateway.database import AuditEntry, SessionLocal

log = structlog.get_logger()

GENESIS_SENTINEL = "genesis"


def _hashers():
    # Lazy import avoids a circular import (audit imports audit_store).
    from gateway.audit import _canonical, _entry_hmac

    return _canonical, _entry_hmac


class DurableAuditStore:
    """Append-only SQL mirror of the audit chain. Optional — active only when a
    SQL session factory is available."""

    def __init__(self, session_factory=SessionLocal):
        self._session_factory = session_factory

    def append(self, entry: dict, seq: int) -> None:
        """Persist one already-signed audit entry. Never raises into the caller
        (audit must not break a request); failures are logged."""
        _canonical, _ = _hashers()
        try:
            with self._session_factory() as s:
                s.add(
                    AuditEntry(
                        id=entry.get("id") or str(uuid.uuid4()),
                        tenant_id=entry["tenant_id"],
                        seq=seq,
                        timestamp=entry["timestamp"],
                        event_type=entry["event_type"],
                        correlation_id=entry.get("correlation_id"),
                        session_id=entry.get("session_id"),
                        role=entry.get("role"),
                        details=_canonical(entry.get("details") or {}),
                        prev_hash=entry["prev_hash"],
                        entry_hash=entry["entry_hash"],
                    )
                )
                s.commit()
        except Exception as exc:  # noqa: BLE001
            log.warning("durable_audit_append_failed", error=str(exc))

    def verify_chain(self, tenant_id: str) -> dict:
        """Walk the tenant's full continuous chain in seq order and verify every
        link, hash, and that no seq is missing (a deleted entry/day breaks it)."""
        _canonical, _entry_hmac = _hashers()
        with self._session_factory() as s:
            rows = (
                s.query(AuditEntry)
                .filter(AuditEntry.tenant_id == tenant_id)
                .order_by(AuditEntry.seq.asc())
                .all()
            )

        prev = GENESIS_SENTINEL
        expected_seq = 1
        for i, row in enumerate(rows):
            if row.seq != expected_seq:
                return {"ok": False, "entries": len(rows), "first_bad": i,
                        "error": f"seq gap at index {i}: expected {expected_seq}, got {row.seq} "
                                 "(entries were deleted)"}
            if row.prev_hash != prev:
                return {"ok": False, "entries": len(rows), "first_bad": i,
                        "error": f"prev_hash mismatch at seq {row.seq}"}
            body = {
                "id": row.id,
                "timestamp": row.timestamp,
                "event_type": row.event_type,
                "tenant_id": row.tenant_id,
                "correlation_id": row.correlation_id,
                "session_id": row.session_id,
                "role": row.role,
                "details": json.loads(row.details),
                "prev_hash": row.prev_hash,
            }
            if _entry_hmac(_canonical(body)) != row.entry_hash:
                return {"ok": False, "entries": len(rows), "first_bad": i,
                        "error": f"entry_hash mismatch at seq {row.seq}: content was modified"}
            prev = row.entry_hash
            expected_seq += 1

        return {"ok": True, "entries": len(rows), "first_bad": -1, "error": None}

    def get_logs(self, tenant_id: str, limit: int = 200) -> list[dict]:
        with self._session_factory() as s:
            rows = (
                s.query(AuditEntry)
                .filter(AuditEntry.tenant_id == tenant_id)
                .order_by(AuditEntry.seq.desc())
                .limit(min(limit, 500))
                .all()
            )
        return [
            {
                "id": r.id, "seq": r.seq, "timestamp": r.timestamp,
                "event_type": r.event_type, "correlation_id": r.correlation_id,
                "session_id": r.session_id, "role": r.role,
                "details": json.loads(r.details), "prev_hash": r.prev_hash,
                "entry_hash": r.entry_hash,
            }
            for r in reversed(rows)
        ]
