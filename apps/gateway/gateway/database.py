"""User database — SQLite in development, managed Postgres in production.

DB6 remediation
---------------
SQLite is a single-writer, single-file store that cannot run HA or survive
concurrent multi-process writes. It caps the system at exactly one instance
(incompatible with N+1 / multi-AZ HA every bank requires).

To switch to Postgres set the ``DATABASE_URL`` env var to a standard
``postgresql+psycopg2://`` connection string. SQLite remains the default so
local dev and CI stay zero-friction.

⛔ Halt-point (tenant-isolation + HA topology):
    - RLS (Row-Level Security): once multi-tenancy is enforced at the DB layer,
      add a ``tenant_id`` column to ``users``, enable ``ALTER TABLE users ENABLE
      ROW LEVEL SECURITY``, and create per-role policies. Confirm the exact
      predicate design with the founder before applying — wrong RLS is worse
      than no RLS (false sense of isolation).
    - HA/RPO/RTO: the recommended topology is Postgres 16+ with streaming
      replication (primary + 1 synchronous standby), automated failover via
      Patroni or a managed service (AWS RDS Multi-AZ, Supabase, Neon),
      continuous WAL archiving to S3 for point-in-time recovery, and a
      documented runbook. Confirm targets with the founder before deployment.
    - For horizontal gateway scaling wire a PgBouncer connection pool in front
      of Postgres and set pool_mode=transaction.
"""

import os
from pathlib import Path

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# DB6: If DATABASE_URL is set, use it (Postgres in production).
# Otherwise fall back to SQLite on the local /data volume (development/CI).
DATABASE_URL = os.getenv("DATABASE_URL", "")

if DATABASE_URL:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    DB_PATH = Path(os.getenv("DB_PATH", "/data/users.db"))
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{DB_PATH}",
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="junior_analyst")
    created_at = Column(DateTime, server_default=func.now())
    # ⛔ Halt-point: add tenant_id here + RLS policy when multi-tenancy lands.
    # tenant_id = Column(String, nullable=False, default="default", index=True)


class AuditEntry(Base):
    """Durable, append-only mirror of the hash-chained audit log (R1 WORM anchor).

    One continuous per-tenant chain (``seq`` monotonic, ``prev_hash`` links to the
    previous entry across day boundaries) — so deleting "a day" is not even a
    concept here, and any gap breaks the chain. On Postgres an UPDATE/DELETE
    trigger makes the table truly append-only (WORM); see ``install_worm_guard``.
    """

    __tablename__ = "audit_entries"
    __table_args__ = (UniqueConstraint("tenant_id", "seq", name="uq_audit_tenant_seq"),)

    id = Column(String, primary_key=True)
    tenant_id = Column(String, nullable=False, index=True)
    seq = Column(BigInteger, nullable=False)
    timestamp = Column(String, nullable=False)
    event_type = Column(String, nullable=False)
    correlation_id = Column(String, nullable=True)
    session_id = Column(String, nullable=True)
    role = Column(String, nullable=True)
    details = Column(Text, nullable=False, default="{}")  # canonical JSON
    prev_hash = Column(String, nullable=False)
    entry_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())


# Postgres trigger that rejects any UPDATE or DELETE on the audit table, making it
# genuinely append-only (WORM). No-op on SQLite (dev/CI) — true WORM needs Postgres.
_WORM_TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION clawwarden_audit_no_mutate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries is append-only (WORM): % blocked', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_no_mutate ON audit_entries;
CREATE TRIGGER trg_audit_no_mutate
  BEFORE UPDATE OR DELETE ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION clawwarden_audit_no_mutate();
"""


def install_worm_guard() -> bool:
    """Install the append-only trigger on Postgres. Returns True if installed."""
    if engine.dialect.name != "postgresql":
        return False
    with engine.begin() as conn:
        conn.execute(text(_WORM_TRIGGER_SQL))
    return True


def init_db() -> None:
    """Create all tables if they don't exist yet, and install the WORM guard."""
    Base.metadata.create_all(bind=engine)
    try:
        install_worm_guard()
    except Exception:  # noqa: BLE001 - never block startup on the optional guard
        pass


def get_db():
    """FastAPI dependency that yields a SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
