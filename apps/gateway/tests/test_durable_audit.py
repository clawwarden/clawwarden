"""R1: durable append-only audit store + cross-day chaining.

Verifies the WORM anchor catches what the per-day Redis chain alone cannot —
a deleted entry or a deleted whole day (a seq gap in the continuous chain).
The Postgres UPDATE/DELETE trigger is exercised in deployment, not here (SQLite
has no role-based guard); these tests prove the *verification* detects tampering
even when a delete somehow gets through.
"""

import asyncio

from sqlalchemy import create_engine, delete, update
from sqlalchemy.orm import sessionmaker

from gateway.audit import AuditLogger, EventType
from gateway.audit_store import DurableAuditStore
from gateway.database import AuditEntry, Base
from tests.conftest import FakeAsyncRedis


def _mem_durable():
    engine = create_engine("sqlite://")  # isolated in-memory DB
    Base.metadata.create_all(engine)
    return DurableAuditStore(session_factory=sessionmaker(bind=engine)), engine


def _logger():
    durable, engine = _mem_durable()
    return AuditLogger(FakeAsyncRedis(), tenant_id="t1", durable=durable), engine


def test_durable_chain_verifies_clean():
    logger, _ = _logger()

    async def go():
        for i in range(5):
            await logger.log_event(EventType.CHAT_REQUEST, f"c{i}", role="analyst")
        res = await logger.verify_durable()
        assert res["ok"] is True
        assert res["entries"] == 5

    asyncio.run(go())


def test_durable_detects_deleted_entry_as_seq_gap():
    logger, engine = _logger()

    async def go():
        for i in range(5):
            await logger.log_event(EventType.CHAT_REQUEST, f"c{i}", role="analyst")
        # Simulate an attacker who erased a record (a deleted day = the same:
        # a gap in the continuous per-tenant seq).
        with engine.begin() as conn:
            conn.execute(delete(AuditEntry).where(AuditEntry.seq == 3))
        res = await logger.verify_durable()
        assert res["ok"] is False
        assert "seq gap" in res["error"]

    asyncio.run(go())


def test_durable_detects_content_modification():
    logger, engine = _logger()

    async def go():
        await logger.log_event(EventType.AUTH_TOKEN_ISSUED, "c1", role="analyst")
        await logger.log_event(EventType.CHAT_REQUEST, "c2", role="analyst")
        # Tamper: silently escalate a role in the stored row.
        with engine.begin() as conn:
            conn.execute(update(AuditEntry).where(AuditEntry.seq == 1).values(role="admin"))
        res = await logger.verify_durable()
        assert res["ok"] is False
        assert "entry_hash mismatch" in res["error"]

    asyncio.run(go())


def test_continuous_chain_links_across_entries():
    """The Redis chain is continuous (cross-day): each entry links to the prior
    one via the tenant tip, not a per-day genesis."""
    logger, _ = _logger()

    async def go():
        await logger.log_event(EventType.CHAT_REQUEST, "c1", role="analyst")
        await logger.log_event(EventType.CHAT_REQUEST, "c2", role="analyst")
        entries = await logger.get_logs()
        assert entries[0]["prev_hash"] == "genesis"
        assert entries[1]["prev_hash"] == entries[0]["entry_hash"]
        # Durable mirror agrees and verifies.
        res = await logger.verify_durable()
        assert res["ok"] is True and res["entries"] == 2

    asyncio.run(go())
