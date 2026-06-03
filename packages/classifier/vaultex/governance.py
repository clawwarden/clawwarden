"""Standalone client for the Vaultex Governance Service.

Best-effort, fail-open telemetry shipping: governance outages never break the
caller. No-ops when unconfigured. Mirrors `contracts/openapi.governance.yaml`.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

log = logging.getLogger("vaultex.governance")


class GovernanceClient:
    """Ships audit events + evidence to the Governance Service over `/v1`."""

    def __init__(
        self,
        base_url: str = "",
        api_key: str = "",
        timeout: float = 3.0,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._http_client = http_client
        self._owns_client = http_client is None

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

    async def _post(self, path: str, body: dict[str, Any]) -> Optional[dict]:
        if not self.enabled:
            return None
        try:
            resp = await self._client().post(path, json=body)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            log.warning("governance post failed (%s): %s", path, exc)
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
