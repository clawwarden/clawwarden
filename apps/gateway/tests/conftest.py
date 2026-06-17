"""pytest configuration — adds project root to sys.path and sets test env vars."""

import os
import sys
import tempfile

# Ensure the project root is on the path so `import gateway` works
project_root = os.path.dirname(os.path.dirname(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Provide minimal env vars required by gateway/config.py
os.environ.setdefault("JWT_SECRET", "test-secret-for-unit-tests")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
# Hard-override security flags that the local .env may set differently for dev
# convenience — tests must always run with the production-default posture.
os.environ["ALLOW_INSECURE_TOKEN_ENDPOINT"] = "false"
# Point the SQLite user DB at a writable temp path so importing gateway.database
# / gateway.main never tries to create the container's /data dir on a dev host.
os.environ.setdefault(
    "DB_PATH", os.path.join(tempfile.gettempdir(), "clawwarden_test_users.db")
)

import pytest


class FakeAsyncRedis:
    """In-memory stand-in for redis.asyncio used by endpoint tests.

    Implements only the surface the gateway exercises (string KV with setex/incr,
    list rpush/lrange, exists/delete, ping). decode_responses=True semantics:
    everything in and out is ``str``.
    """

    def __init__(self):
        self.kv: dict[str, str] = {}
        self.lists: dict[str, list[str]] = {}

    async def ping(self):
        return True

    async def get(self, key):
        return self.kv.get(key)

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self.kv:
            return None  # not set — another writer already holds the key
        self.kv[key] = value
        return True

    async def setex(self, key, ttl, value):
        self.kv[key] = value

    async def incr(self, key):
        n = int(self.kv.get(key, "0")) + 1
        self.kv[key] = str(n)
        return n

    async def expire(self, key, ttl):
        return True

    async def exists(self, key):
        return 1 if key in self.kv or key in self.lists else 0

    async def delete(self, *keys):
        for key in keys:
            self.kv.pop(key, None)
            self.lists.pop(key, None)

    async def rpush(self, key, value):
        self.lists.setdefault(key, []).append(value)

    async def lrange(self, key, start, end):
        lst = self.lists.get(key, [])
        if end == -1:
            return lst[start:]
        return lst[start : end + 1]

    def pipeline(self):
        return FakePipeline(self)

    async def aclose(self):
        pass


class FakePipeline:
    """Buffered pipeline that replays commands on execute()."""

    def __init__(self, redis: "FakeAsyncRedis"):
        self._redis = redis
        self._cmds: list = []

    def rpush(self, key, value):
        self._cmds.append(("rpush", key, value))
        return self

    def set(self, key, value):
        self._cmds.append(("set", key, value))
        return self

    def expire(self, key, ttl):
        self._cmds.append(("expire", key, ttl))
        return self

    async def execute(self):
        for cmd, *args in self._cmds:
            await getattr(self._redis, cmd)(*args)


@pytest.fixture
def fake_redis():
    return FakeAsyncRedis()


@pytest.fixture
def client(fake_redis):
    """FastAPI TestClient with Redis-backed state swapped for an in-memory fake.

    The app's lifespan builds the real SessionStore/AuditLogger (lazy redis
    client, no connection); we point both at the fake so endpoint tests run with
    no live Redis. Fernet/RBAC/JWT remain the real implementations.
    """
    from fastapi.testclient import TestClient

    import gateway.main as m

    with TestClient(m.app) as test_client:
        m.store.redis = fake_redis
        m.audit_log.redis = fake_redis
        yield test_client
