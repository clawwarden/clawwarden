import asyncio
import json

import httpx

from clawwarden import GovernanceClient


def _client(handler, *, api_key="k", base_url="https://gov.test"):
    transport = httpx.MockTransport(handler)
    http = httpx.AsyncClient(
        transport=transport, base_url=base_url, headers={"x-api-key": api_key}
    )
    return GovernanceClient(base_url=base_url, api_key=api_key, http_client=http)


def test_disabled_when_unconfigured():
    c = GovernanceClient()
    assert c.enabled is False
    assert asyncio.run(c.append_audit_event(event_type="x")) is None


def test_append_posts_camelcase_payload():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        captured["key"] = request.headers.get("x-api-key")
        return httpx.Response(201, json={"id": "e1", "seq": 1})

    c = _client(handler)
    out = asyncio.run(
        c.append_audit_event(event_type="pii_detected", reason="ssn", confidence=0.9)
    )
    assert out == {"id": "e1", "seq": 1}
    assert captured["url"].endswith("/v1/governance/audit")
    assert captured["key"] == "k"
    assert captured["body"]["eventType"] == "pii_detected"
    assert captured["body"]["confidence"] == 0.9


def test_http_error_is_swallowed():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    c = _client(handler)
    assert asyncio.run(c.append_audit_event(event_type="x")) is None
