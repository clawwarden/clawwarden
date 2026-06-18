"""GET /api/audit/verify — admin-gated tamper-evidence check (Item 3 UI support).

Surfaces verify_chain() + verify_durable() (both WORM anchors) to the console so an
operator/regulator can click "verify integrity" instead of running a Python call.
"""

import gateway.main as m
from gateway.audit_store import DurableAuditStore
from gateway.auth import issue_token
from gateway.database import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


def _fresh_durable_on(audit_log):
    """Isolate the durable mirror in an in-memory DB so the shared SQLite test
    file from other tests cannot contaminate this chain. StaticPool + a shared
    connection so the table is visible from the TestClient's worker thread."""
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    audit_log.durable = DurableAuditStore(session_factory=sessionmaker(bind=eng))


def test_verify_requires_admin(client):
    headers = {"Authorization": f"Bearer {issue_token('junior_analyst', 'a@bank.test')}"}
    r = client.get("/api/audit/verify", headers=headers)
    assert r.status_code == 403


def test_verify_ok_for_clean_chain(client):
    _fresh_durable_on(m.audit_log)
    headers = {"Authorization": f"Bearer {issue_token('admin', 'admin@bank.test')}"}
    r = client.get("/api/audit/verify", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["redis_chain"]["ok"] is True
    assert data["durable"]["ok"] is True  # the ADMIN_ACCESS log itself is a valid entry


def test_verify_detects_durable_tampering(client):
    _fresh_durable_on(m.audit_log)
    headers = {"Authorization": f"Bearer {issue_token('admin', 'admin@bank.test')}"}

    # First call logs an ADMIN_ACCESS entry (seq 1) into the fresh durable mirror.
    client.get("/api/audit/verify", headers=headers)

    # Tamper: silently rewrite the stored role in the WORM mirror.
    from gateway.database import AuditEntry
    from sqlalchemy import update

    with m.audit_log.durable._session_factory() as s:
        s.execute(update(AuditEntry).where(AuditEntry.seq == 1).values(role="superuser"))
        s.commit()

    r = client.get("/api/audit/verify", headers=headers)
    data = r.json()
    assert data["ok"] is False
    assert data["durable"]["ok"] is False
    assert "entry_hash mismatch" in data["durable"]["error"]
