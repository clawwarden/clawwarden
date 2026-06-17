"""Client for the shared Governance Service (AgentGuard).

ClawWarden is the *input governance* plane of the AI Trust Infrastructure Stack
(see AgentGuard ``MANIFESTO.md`` §0/§7). It ships audit events and evidence to
the cross-cutting Governance Service so policy/audit/evidence have a single
tamper-evident source of truth shared with the runtime plane.

Design notes
------------
* **Best-effort, fail-open for telemetry.** A governance outage must never break
  a tokenize→LLM→detokenize request. Network/HTTP errors are logged and swallowed;
  the local Redis audit (``gateway/audit.py``) remains the in-process record.
* **No-op when unconfigured.** If ``GOVERNANCE_URL``/``GOVERNANCE_API_KEY`` are
  unset, every method returns ``None`` so ClawWarden runs standalone.
* Tenant scoping on the ``/v1`` surface is derived from the API key by the
  Governance Service, so the key alone identifies the tenant.

⛔ Halt-point (MANIFESTO.md §6): for high-assurance deployments the founder may
   want PII-sensitive audit payloads to fail *closed*. That is a risk decision —
   kept fail-open here by default.
"""

from __future__ import annotations

from typing import Any, Optional

import httpx
import structlog

from gateway.config import settings

log = structlog.get_logger()


class GovernanceClient:
    """Async client that ships audit + evidence to the Governance Service."""

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
        # Injected client (e.g. for tests with httpx.MockTransport).
        self._http_client = http_client
        self._owns_client = http_client is None

    @property
    def enabled(self) -> bool:
        """True only when both a base URL and an API key are configured."""
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
            log.debug("governance_disabled", path=path)
            return None
        try:
            resp = await self._client().post(path, json=body)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            # Telemetry shipping is best-effort; never break the caller.
            log.warning("governance_post_failed", path=path, error=str(exc))
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
        """Append one event to the tenant's immutable audit chain.

        Mirrors AgentGuard's ``AppendAuditEventSchema`` (camelCase wire format).
        """
        body: dict[str, Any] = {
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
        }
        return await self._post("/v1/governance/audit", body)

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
        """Attach an evidence artifact linked to a governance decision."""
        body: dict[str, Any] = {
            "evidenceType": evidence_type,
            "refType": ref_type,
            "refId": ref_id,
            "auditEventId": audit_event_id,
            "controlId": control_id,
            "description": description,
            "content": content or {},
        }
        return await self._post("/v1/governance/evidence", body)

    async def verify_chain(self) -> Optional[dict]:
        """Ask the service to re-verify this tenant's audit chain integrity."""
        if not self.enabled:
            return None
        try:
            resp = await self._client().get("/v1/governance/audit/verify")
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            log.warning("governance_verify_failed", error=str(exc))
            return None

    async def aclose(self) -> None:
        if self._http_client is not None and self._owns_client:
            await self._http_client.aclose()
            self._http_client = None


_singleton: Optional[GovernanceClient] = None


def get_governance_client() -> GovernanceClient:
    """Process-wide client built from settings."""
    global _singleton
    if _singleton is None:
        _singleton = GovernanceClient(
            base_url=settings.governance_url,
            api_key=settings.governance_api_key,
            timeout=settings.governance_timeout_seconds,
        )
    return _singleton
