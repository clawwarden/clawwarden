"""Standalone client for the ClawWarden Governance Service.

Best-effort, fail-open shipping: governance outages never break the caller.
No-ops when unconfigured. Mirrors `contracts/openapi.governance.yaml`.

Audit and evidence are compliance records, so a silent drop is itself a risk.
Transient failures (transport errors, 5xx) are retried with backoff; if a write
is still unrecoverable it is handed to the ``on_drop`` callback so the caller can
buffer it (disk, queue, DLQ) instead of losing regulator evidence unnoticed.
Client errors (4xx) are not retried — they will never succeed.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, Awaitable, Callable, Optional, Union

import httpx

log = logging.getLogger("clawwarden.governance")

# Called with (path, body) when a write is dropped after exhausting retries.
# May be sync or async; exceptions raised by the hook are swallowed.
DropHook = Callable[[str, dict[str, Any]], Union[None, Awaitable[None]]]


class GovernanceClient:
    """Ships audit events + evidence to the Governance Service over `/v1`."""

    def __init__(
        self,
        base_url: str = "",
        api_key: str = "",
        timeout: float = 3.0,
        http_client: Optional[httpx.AsyncClient] = None,
        max_retries: int = 2,
        retry_backoff: float = 0.2,
        on_drop: Optional[DropHook] = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._http_client = http_client
        self._owns_client = http_client is None
        self._max_retries = max(0, max_retries)
        self._retry_backoff = max(0.0, retry_backoff)
        self._on_drop = on_drop

    @property
    def enabled(self) -> bool:
        return bool(self._base_url and self._api_key)

    def _client(self) -> httpx.AsyncClient:
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(
                base_url=self._base_url,
                headers={"x-api-key": self._api_key},
                timeout=self._timeout,
            )
        return self._http_client

    async def _emit_drop(self, path: str, body: dict[str, Any]) -> None:
        log.error("governance write dropped after retries (%s)", path)
        if self._on_drop is None:
            return
        try:
            result = self._on_drop(path, body)
            if asyncio.iscoroutine(result):
                await result
        except Exception:  # noqa: BLE001 - drop hook must never break the caller
            log.exception("governance on_drop hook raised (%s)", path)

    async def _post(self, path: str, body: dict[str, Any]) -> Optional[dict]:
        if not self.enabled:
            return None
        # Stable across retries so the server can dedupe a re-sent write.
        idempotency_key = uuid.uuid4().hex
        # attempts = 1 initial try + max_retries
        for attempt in range(self._max_retries + 1):
            try:
                resp = await self._client().post(
                    path, json=body, headers={"Idempotency-Key": idempotency_key}
                )
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if status < 500:
                    # Client error — retrying will not help; drop and surface.
                    log.warning("governance post rejected (%s): %s", path, status)
                    await self._emit_drop(path, body)
                    return None
                log.warning("governance post failed (%s): %s", path, status)
            except httpx.HTTPError as exc:
                log.warning("governance post failed (%s): %s", path, exc)
            if attempt < self._max_retries:
                await asyncio.sleep(self._retry_backoff * (2**attempt))
        await self._emit_drop(path, body)
        return None

    async def append_audit_event(
        self,
        *,
        event_type: str,
        actor_type: str = "system",
        actor_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        action: Optional[str] = None,
        policy_version_id: Optional[str] = None,
        reason: Optional[str] = None,
        confidence: Optional[float] = None,
        payload: Optional[dict[str, Any]] = None,
    ) -> Optional[dict]:
        return await self._post(
            "/v1/governance/audit",
            {
                "eventType": event_type,
                "actorType": actor_type,
                "actorId": actor_id,
                "resourceType": resource_type,
                "resourceId": resource_id,
                "action": action,
                "policyVersionId": policy_version_id,
                "reason": reason,
                "confidence": confidence,
                "payload": payload or {},
            },
        )

    async def collect_evidence(
        self,
        *,
        evidence_type: str,
        ref_type: str,
        ref_id: str,
        audit_event_id: Optional[str] = None,
        control_id: Optional[str] = None,
        description: Optional[str] = None,
        content: Optional[dict[str, Any]] = None,
    ) -> Optional[dict]:
        return await self._post(
            "/v1/governance/evidence",
            {
                "evidenceType": evidence_type,
                "refType": ref_type,
                "refId": ref_id,
                "auditEventId": audit_event_id,
                "controlId": control_id,
                "description": description,
                "content": content or {},
            },
        )

    async def verify_chain(self) -> Optional[dict]:
        if not self.enabled:
            return None
        try:
            resp = await self._client().get("/v1/governance/audit/verify")
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            log.warning("governance verify failed: %s", exc)
            return None

    async def aclose(self) -> None:
        if self._http_client is not None and self._owns_client:
            await self._http_client.aclose()
            self._http_client = None
