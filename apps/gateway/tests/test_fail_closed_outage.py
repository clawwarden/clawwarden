"""Item 2 (HA/DR): the gateway FAILS CLOSED when the vault (Redis) is unavailable.

The white paper's core promise is that raw PII never crosses the boundary. A vault
outage must therefore *block* the request — never silently forward the original
prompt to the LLM. These tests prove the security invariant directly:

    vault problem  ⇒  request blocked (4xx/5xx)  AND  route_to_llm NEVER called.

Two outage points are covered:
  1. Redis down before tokenization (provider/owner fetch) → 503, no LLM call.
  2. Vault write fails *during* tokenization (token minting) → 422, no LLM call.

Presidio/spaCy are not loaded here: ``analyze_spans`` is monkeypatched so the test
exercises the vault + fail-closed control flow, not the NER model.
"""

import gateway.main as m
import gateway.tokenizer as tok
from fastapi.testclient import TestClient
from gateway.auth import issue_token
from tests.conftest import FakeAsyncRedis


class OutageRedis(FakeAsyncRedis):
    """FakeAsyncRedis with a flip-able outage. While ``down`` is True every
    operation raises, simulating an unreachable Redis (the token vault)."""

    def __init__(self):
        super().__init__()
        self.down = False

    def _maybe_fail(self):
        if self.down:
            raise ConnectionError("redis unavailable (simulated outage)")

    async def get(self, key):
        self._maybe_fail()
        return await super().get(key)

    async def set(self, key, value, nx=False, ex=None):
        self._maybe_fail()
        return await super().set(key, value, nx=nx, ex=ex)

    async def setex(self, key, ttl, value):
        self._maybe_fail()
        return await super().setex(key, ttl, value)

    async def incr(self, key):
        self._maybe_fail()
        return await super().incr(key)

    async def rpush(self, key, value):
        self._maybe_fail()
        return await super().rpush(key, value)


def _auth():
    return {"Authorization": f"Bearer {issue_token('junior_analyst', 'alice@bank.test')}"}


def _configure(c, headers):
    return c.post(
        "/api/session/configure",
        json={"provider": "ollama", "model": "qwen3:4b"},
        headers=headers,
    ).json()["session_id"]


def test_chat_fails_closed_when_redis_down_before_tokenize(monkeypatch):
    # No PII spans → avoids loading Presidio while still exercising the vault path.
    monkeypatch.setattr(tok, "analyze_spans", lambda text, score_threshold=0.4: [])

    llm_called = {"v": False}

    async def spy_llm(*a, **k):
        llm_called["v"] = True
        return "LEAKED: should never be reached on a vault outage"

    monkeypatch.setattr(m, "route_to_llm", spy_llm)

    outage = OutageRedis()
    with TestClient(m.app) as c:
        m.store.redis = outage
        m.audit_log.redis = outage
        headers = _auth()
        sid = _configure(c, headers)  # vault UP for setup
        outage.down = True            # vault goes DOWN
        resp = c.post(
            "/v1/chat/completions",
            json={"model": "qwen3:4b",
                  "messages": [{"role": "user", "content": "hello"}]},
            headers={**headers, "X-Session-ID": sid},
        )

    assert resp.status_code == 503, resp.text
    assert "blocked for safety" in resp.text
    assert llm_called["v"] is False, "PII path forwarded to the LLM during an outage"


def test_chat_fails_closed_when_vault_write_fails_during_tokenize(monkeypatch):
    monkeypatch.setattr(tok, "analyze_spans", lambda text, score_threshold=0.4: [])

    llm_called = {"v": False}

    async def spy_llm(*a, **k):
        llm_called["v"] = True
        return "LEAKED: should never be reached when tokenization fails"

    monkeypatch.setattr(m, "route_to_llm", spy_llm)

    redis = FakeAsyncRedis()
    with TestClient(m.app) as c:
        m.store.redis = redis
        m.audit_log.redis = redis
        headers = _auth()
        sid = _configure(c, headers)

        # Vault write fails mid-tokenize (e.g. Redis drops after config read).
        async def boom(*a, **k):
            raise ConnectionError("vault write failed (simulated)")

        monkeypatch.setattr(m.store, "update_token_map", boom)

        resp = c.post(
            "/v1/chat/completions",
            json={"model": "qwen3:4b",
                  "messages": [{"role": "user", "content": "hello"}]},
            headers={**headers, "X-Session-ID": sid},
        )

    assert resp.status_code == 422, resp.text
    assert "blocked for safety" in resp.text
    assert llm_called["v"] is False, "tokenization failure must not forward to the LLM"
