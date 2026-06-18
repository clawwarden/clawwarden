"""Item 3: external WORM anchor (S3 Object Lock).

Proves the S3 anchor (a) writes each signed entry as a write-once object under
Object Lock, (b) verifies the continuous per-tenant chain and catches a deleted
entry (seq gap) or modified content (hash mismatch), and (c) is genuinely
immutable: a locked object cannot be deleted or overwritten within its retention.

Object Lock immutability is ultimately enforced by S3, not our code, so the
*behavioral contract* of COMPLIANCE mode is modelled by ``FakeObjectLockS3`` here
(write-once + delete/overwrite rejected within retention). An opt-in test against a
real S3-compatible backend (MinIO/LocalStack) runs only when S3_TEST_ENDPOINT is
set — mirroring how the Postgres WORM trigger is exercised in deployment, not CI.
"""

import asyncio
import io
import os
from datetime import datetime, timedelta, timezone

import pytest

from gateway.audit import AuditLogger, EventType
from gateway.audit_anchor import MultiAnchor, S3ObjectLockAnchor
from gateway.audit_store import DurableAuditStore
from gateway.database import Base
from tests.conftest import FakeAsyncRedis

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


# --------------------------------------------------------------------------- #
# A faithful in-memory model of S3 Object Lock (COMPLIANCE mode) semantics.
# --------------------------------------------------------------------------- #
class _S3Error(Exception):
    """Stand-in for botocore.exceptions.ClientError."""

    def __init__(self, code: str, msg: str = ""):
        self.code = code
        super().__init__(f"{code}: {msg}")


class _Body:
    def __init__(self, data: bytes):
        self._data = data

    def read(self) -> bytes:
        return self._data


class FakeObjectLockS3:
    """Models the subset of S3 the anchor uses, with COMPLIANCE-mode Object Lock.

    Contract enforced (matching AWS S3 Object Lock in COMPLIANCE mode):
      - put with IfNoneMatch='*' fails if the key already exists (write-once).
      - delete of a locked object before retain-until is rejected (even by root).
      - overwrite of a locked object before retain-until is rejected.
    """

    def __init__(self):
        self.objects: dict[str, dict] = {}

    def _now(self):
        return datetime.now(tz=timezone.utc)

    def put_object(self, Bucket, Key, Body, ObjectLockMode=None,
                   ObjectLockRetainUntilDate=None, IfNoneMatch=None, **_):
        existing = self.objects.get(Key)
        if existing is not None:
            if IfNoneMatch == "*":
                raise _S3Error("PreconditionFailed", "object already exists")
            if existing["mode"] == "COMPLIANCE" and existing["retain_until"] > self._now():
                raise _S3Error("AccessDenied", "object is WORM-locked")
        self.objects[Key] = {
            "body": Body if isinstance(Body, bytes) else bytes(Body),
            "mode": ObjectLockMode,
            "retain_until": ObjectLockRetainUntilDate,
        }
        return {}

    def get_object(self, Bucket, Key, **_):
        if Key not in self.objects:
            raise _S3Error("NoSuchKey", Key)
        return {"Body": _Body(self.objects[Key]["body"])}

    def delete_object(self, Bucket, Key, **_):
        o = self.objects.get(Key)
        if o and o["mode"] == "COMPLIANCE" and o["retain_until"] > self._now():
            raise _S3Error("AccessDenied", "WORM-locked, cannot delete")
        self.objects.pop(Key, None)
        return {}

    def list_objects_v2(self, Bucket, Prefix="", ContinuationToken=None, **_):
        keys = sorted(k for k in self.objects if k.startswith(Prefix))
        return {"Contents": [{"Key": k} for k in keys], "IsTruncated": False}


def _logger_with_s3(retention_days=2555):
    s3 = FakeObjectLockS3()
    anchor = S3ObjectLockAnchor("audit-bucket", client=s3, retention_days=retention_days)
    return AuditLogger(FakeAsyncRedis(), tenant_id="t1", durable=anchor), s3, anchor


# --------------------------------------------------------------------------- #
# Verification: clean chain, deleted entry, modified content.
# --------------------------------------------------------------------------- #
def test_s3_anchor_verifies_clean_chain():
    logger, s3, _ = _logger_with_s3()

    async def go():
        for i in range(5):
            await logger.log_event(EventType.CHAT_REQUEST, f"c{i}", role="analyst")
        res = await logger.verify_durable()
        assert res["ok"] is True
        assert res["entries"] == 5
        # one immutable object per entry
        assert len([k for k in s3.objects if k.startswith("audit/t1/")]) == 5

    asyncio.run(go())


def test_s3_anchor_detects_deleted_entry_as_seq_gap():
    logger, s3, anchor = _logger_with_s3()

    async def go():
        for i in range(5):
            await logger.log_event(EventType.CHAT_REQUEST, f"c{i}", role="analyst")
        # Force-remove an object out-of-band (simulating a tamper that bypassed
        # Object Lock, e.g. a misconfigured bucket) to prove verification still
        # catches the resulting gap.
        victim = anchor._key("t1", 3)
        s3.objects.pop(victim)
        res = await logger.verify_durable()
        assert res["ok"] is False
        assert "seq gap" in res["error"]

    asyncio.run(go())


def test_s3_anchor_detects_content_modification():
    logger, s3, anchor = _logger_with_s3()

    async def go():
        await logger.log_event(EventType.AUTH_TOKEN_ISSUED, "c1", role="analyst")
        await logger.log_event(EventType.CHAT_REQUEST, "c2", role="analyst")
        # Tamper the stored bytes directly (attacker without the HMAC key).
        key = anchor._key("t1", 1)
        s3.objects[key]["body"] = s3.objects[key]["body"].replace(b"analyst", b"admin")
        res = await logger.verify_durable()
        assert res["ok"] is False
        assert "entry_hash mismatch" in res["error"]

    asyncio.run(go())


# --------------------------------------------------------------------------- #
# Immutability: the DoD — a locked record cannot be deleted or overwritten.
# --------------------------------------------------------------------------- #
def test_s3_locked_object_cannot_be_deleted():
    logger, s3, anchor = _logger_with_s3()

    async def go():
        await logger.log_event(EventType.CHAT_REQUEST, "c1", role="analyst")
        key = anchor._key("t1", 1)
        with pytest.raises(_S3Error) as ei:
            s3.delete_object(Bucket="audit-bucket", Key=key)
        assert ei.value.code == "AccessDenied"

    asyncio.run(go())


def test_s3_locked_object_cannot_be_overwritten():
    logger, s3, anchor = _logger_with_s3()

    async def go():
        await logger.log_event(EventType.CHAT_REQUEST, "c1", role="analyst")
        key = anchor._key("t1", 1)
        # Attacker tries to overwrite with re-serialized, tampered content.
        with pytest.raises(_S3Error) as ei:
            s3.put_object(Bucket="audit-bucket", Key=key, Body=b'{"tampered":true}',
                          ObjectLockMode="COMPLIANCE",
                          ObjectLockRetainUntilDate=datetime.now(tz=timezone.utc))
        assert ei.value.code == "AccessDenied"

    asyncio.run(go())


def test_s3_append_is_write_once():
    """The anchor itself never re-writes a seq — a duplicate seq is refused by the
    IfNoneMatch precondition, so a replay can't silently replace a record."""
    s3 = FakeObjectLockS3()
    anchor = S3ObjectLockAnchor("audit-bucket", client=s3)
    entry = {"id": "x", "tenant_id": "t1", "timestamp": "t", "event_type": "e",
             "correlation_id": "c", "session_id": None, "role": "r",
             "details": {}, "prev_hash": "genesis", "entry_hash": "h"}
    anchor.append(entry, 1)
    first = s3.objects[anchor._key("t1", 1)]["body"]
    # A second append at the same seq must NOT replace the original bytes.
    anchor.append({**entry, "role": "admin"}, 1)
    assert s3.objects[anchor._key("t1", 1)]["body"] == first


# --------------------------------------------------------------------------- #
# MultiAnchor: write to Postgres-WORM mirror AND S3 in one shot.
# --------------------------------------------------------------------------- #
def test_multianchor_writes_and_verifies_both_backends():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    durable = DurableAuditStore(session_factory=sessionmaker(bind=engine))
    s3 = FakeObjectLockS3()
    s3_anchor = S3ObjectLockAnchor("audit-bucket", client=s3)
    logger = AuditLogger(FakeAsyncRedis(), tenant_id="t1",
                         durable=MultiAnchor([durable, s3_anchor]))

    async def go():
        for i in range(3):
            await logger.log_event(EventType.CHAT_REQUEST, f"c{i}", role="analyst")
        res = await logger.verify_durable()
        assert res["ok"] is True
        # both backends actually received the entries
        assert durable.verify_chain("t1")["entries"] == 3
        assert s3_anchor.verify_chain("t1")["entries"] == 3

    asyncio.run(go())


def test_multianchor_reports_failing_backend():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    durable = DurableAuditStore(session_factory=sessionmaker(bind=engine))
    s3 = FakeObjectLockS3()
    s3_anchor = S3ObjectLockAnchor("audit-bucket", client=s3)
    multi = MultiAnchor([durable, s3_anchor])
    logger = AuditLogger(FakeAsyncRedis(), tenant_id="t1", durable=multi)

    async def go():
        for i in range(3):
            await logger.log_event(EventType.CHAT_REQUEST, f"c{i}", role="analyst")
        # Corrupt only the S3 copy; the MultiAnchor must surface the failure.
        s3.objects.pop(s3_anchor._key("t1", 2))
        res = await logger.verify_durable()
        assert res["ok"] is False
        assert res["anchor"] == "S3ObjectLockAnchor"

    asyncio.run(go())


# --------------------------------------------------------------------------- #
# Opt-in real-backend test (MinIO / LocalStack). Skipped unless configured.
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(
    not os.getenv("S3_TEST_ENDPOINT"),
    reason="set S3_TEST_ENDPOINT (+ bucket with Object Lock) to run the real-backend test",
)
def test_real_s3_object_lock_rejects_delete():  # pragma: no cover - integration
    import boto3

    bucket = os.environ["S3_TEST_BUCKET"]
    client = boto3.client("s3", endpoint_url=os.environ["S3_TEST_ENDPOINT"])
    anchor = S3ObjectLockAnchor(bucket, client=client, retention_days=1)
    entry = {"id": "x", "tenant_id": "real", "timestamp": "t", "event_type": "e",
             "correlation_id": "c", "session_id": None, "role": "r",
             "details": {}, "prev_hash": "genesis", "entry_hash": "h"}
    anchor.append(entry, 1)
    key = anchor._key("real", 1)
    with pytest.raises(Exception):
        client.delete_object(Bucket=bucket, Key=key)
