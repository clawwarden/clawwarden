"""Audit WORM anchors — pluggable durable backends behind one interface (Item 3).

The audit chain (``gateway.audit.AuditLogger``) mirrors every signed entry to a
*durable anchor*: an append-only, tamper-evident store that survives a full Redis
compromise. Two anchors ship today, behind the same contract so they are swappable
and stackable:

  - ``DurableAuditStore`` (gateway.audit_store) — append-only SQL table; on
    Postgres an UPDATE/DELETE trigger makes it genuinely write-once *within the DB*.
  - ``S3ObjectLockAnchor`` (here) — each entry written as a write-once S3 object
    under Object Lock (COMPLIANCE mode), immutable *outside the DB* even against a
    privileged operator who could drop a table. This closes the white-paper §8
    residual: "a sufficiently privileged operator who can drop the whole table … is
    outside this boundary; the highest-assurance posture adds an external anchor."

``MultiAnchor`` fans a single write out to several anchors (e.g. Postgres + S3) and
verifies all of them, so a regulated deployment can keep both an operational mirror
and an external immutable anchor.

The contract (matched by every anchor, see ``AuditAnchor``):
    append(entry: dict, seq: int) -> None        # never raises into the caller
    verify_chain(tenant_id: str) -> dict          # {"ok", "entries", "first_bad", "error"}
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Optional, Protocol, runtime_checkable

import structlog

# audit_anchor is not imported by gateway.audit, so a direct import is cycle-free
# and reuses the EXACT canonicalisation/HMAC that signed each entry.
from gateway.audit import GENESIS_SENTINEL, _canonical, _entry_hmac

log = structlog.get_logger()

# Default Object Lock retention: 7 years, the SEC 17a-4 / FINRA 4370 floor for
# financial books-and-records. Override per your retention schedule.
DEFAULT_RETENTION_DAYS = 7 * 365 + 1  # 2556


@runtime_checkable
class AuditAnchor(Protocol):
    """Durable, append-only audit backend. ``AuditLogger.durable`` is any of these."""

    def append(self, entry: dict, seq: int) -> None: ...

    def verify_chain(self, tenant_id: str) -> dict: ...


def _body_for_hash(record: dict) -> dict:
    """The exact dict that was HMAC'd when the entry was signed: every field
    except ``entry_hash`` (the signature) and ``seq`` (added by the anchor)."""
    return {k: v for k, v in record.items() if k not in ("entry_hash", "seq")}


class S3ObjectLockAnchor:
    """External WORM anchor: one immutable S3 object per audit entry.

    Layout: ``{prefix}/{tenant_id}/{seq:020d}.json`` — zero-padded so lexical
    listing is sequence order. Each object is written with Object Lock COMPLIANCE
    mode + a retain-until date, and with ``IfNoneMatch='*'`` so a given seq is
    write-once at the application layer too (a replay cannot replace a record).
    """

    def __init__(
        self,
        bucket: str,
        *,
        client=None,
        prefix: str = "audit",
        retention_days: int = DEFAULT_RETENTION_DAYS,
        region: Optional[str] = None,
        endpoint_url: Optional[str] = None,
    ):
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.retention_days = retention_days
        self._client = client
        self._region = region
        self._endpoint_url = endpoint_url

    def _s3(self):
        """Return the S3 client, lazily creating a boto3 one if none was injected
        (so tests and non-S3 deployments never need boto3 installed)."""
        if self._client is None:
            import boto3  # lazy — optional dependency

            self._client = boto3.client(
                "s3", region_name=self._region, endpoint_url=self._endpoint_url
            )
        return self._client

    def _key(self, tenant_id: str, seq: int) -> str:
        return f"{self.prefix}/{tenant_id}/{seq:020d}.json"

    def append(self, entry: dict, seq: int) -> None:
        """Write one already-signed entry as a write-once, Object-Locked object.

        Never raises into the caller — audit must not break a request; failures are
        logged so a broken anchor surfaces in monitoring without dropping traffic.
        """
        try:
            record = {**entry, "seq": seq}
            body = json.dumps(record, sort_keys=True, separators=(",", ":")).encode()
            retain_until = datetime.now(tz=timezone.utc) + timedelta(days=self.retention_days)
            self._s3().put_object(
                Bucket=self.bucket,
                Key=self._key(entry["tenant_id"], seq),
                Body=body,
                ObjectLockMode="COMPLIANCE",
                ObjectLockRetainUntilDate=retain_until,
                IfNoneMatch="*",
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("s3_worm_append_failed", seq=seq, error=str(exc))

    def _list_keys(self, prefix: str) -> list[str]:
        s3 = self._s3()
        keys: list[str] = []
        token: Optional[str] = None
        while True:
            kwargs = {"Bucket": self.bucket, "Prefix": prefix}
            if token:
                kwargs["ContinuationToken"] = token
            resp = s3.list_objects_v2(**kwargs)
            keys.extend(obj["Key"] for obj in resp.get("Contents", []))
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
            if not token:
                break
        return sorted(keys)

    def verify_chain(self, tenant_id: str) -> dict:
        """Walk the tenant's continuous chain in seq order: a deleted object
        (seq gap), a broken ``prev_hash`` link, or modified content (hash
        mismatch) is detected — the same guarantee as the SQL mirror, against an
        independent, immutable store."""
        s3 = self._s3()
        keys = self._list_keys(f"{self.prefix}/{tenant_id}/")

        prev = GENESIS_SENTINEL
        expected_seq = 1
        for i, key in enumerate(keys):
            record = json.loads(s3.get_object(Bucket=self.bucket, Key=key)["Body"].read())
            if record.get("seq") != expected_seq:
                return {"ok": False, "entries": len(keys), "first_bad": i,
                        "error": f"seq gap at index {i}: expected {expected_seq}, "
                                 f"got {record.get('seq')} (entries were deleted)"}
            if record.get("prev_hash") != prev:
                return {"ok": False, "entries": len(keys), "first_bad": i,
                        "error": f"prev_hash mismatch at seq {record.get('seq')}"}
            if _entry_hmac(_canonical(_body_for_hash(record))) != record.get("entry_hash"):
                return {"ok": False, "entries": len(keys), "first_bad": i,
                        "error": f"entry_hash mismatch at seq {record.get('seq')}: "
                                 "content was modified"}
            prev = record["entry_hash"]
            expected_seq += 1

        return {"ok": True, "entries": len(keys), "first_bad": -1, "error": None}


class MultiAnchor:
    """Fan one durable write out to several anchors and verify all of them.

    Lets a deployment run, e.g., the Postgres WORM mirror (operational) AND the S3
    Object Lock anchor (regulator-grade, external) from a single
    ``AuditLogger(durable=...)``. ``append`` calls every anchor (each swallows its
    own errors); ``verify_chain`` returns the first failing anchor, or an ok result
    annotated with every anchor's outcome.
    """

    def __init__(self, anchors: list[AuditAnchor]):
        if not anchors:
            raise ValueError("MultiAnchor requires at least one anchor")
        self.anchors = list(anchors)

    def append(self, entry: dict, seq: int) -> None:
        for anchor in self.anchors:
            anchor.append(entry, seq)

    def verify_chain(self, tenant_id: str) -> dict:
        results = {type(a).__name__: a.verify_chain(tenant_id) for a in self.anchors}
        for name, res in results.items():
            if not res.get("ok"):
                return {**res, "anchor": name, "anchors": results}
        base = next(iter(results.values()))
        return {**base, "anchors": results}
