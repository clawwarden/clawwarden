import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import jwt as pyjwt
import structlog
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from gateway.audit import AuditLogger, EventType
from gateway.audit_anchor import MultiAnchor, S3ObjectLockAnchor
from gateway.audit_store import DurableAuditStore
from gateway.auth import issue_token, validate_token
from gateway.config import assert_secure_secret, settings
from gateway.database import get_db, init_db
from gateway.detokenizer import _SHORT_TO_ENTITY, run_detokenize
from gateway.llm_router import list_ollama_models, route_to_llm
from gateway.models import (
    ChatCompletionRequest,
    LoginRequest,
    RegisterRequest,
    SessionConfigRequest,
    SessionConfigResponse,
    TokenRequest,
    TokenResponse,
    UserResponse,
)
from gateway.rbac import PRIVILEGED_ROLES, get_role_permissions
from gateway.injection_guard import scan_for_injection
from gateway.log_scrubber import scrub_processor
from gateway.observability import init_sentry
from gateway.output_guard import sanitize_output
from gateway.redis_store import SessionStore
from gateway.revocation import is_revoked
from gateway.ssrf import SsrfBlocked, validate_ollama_url
from gateway.tokenizer import run_tokenize
from gateway.users import authenticate_user, create_user, get_user_by_email, get_user_by_username

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        # OWASP LLM06: scrub secrets/PII from every log event before it is rendered.
        scrub_processor,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
)
log = structlog.get_logger()

# Initialise error tracking as early as possible (no-op unless SENTRY_DSN is set).
init_sentry()

store: SessionStore | None = None
audit_log: AuditLogger | None = None


def _rate_limit_key(request: Request) -> str:
    """Rate-limit key: the real client IP. Behind a trusted proxy (TRUST_PROXY),
    use the first X-Forwarded-For hop instead of the shared proxy IP (R3).
    XFF is honoured only when TRUST_PROXY is set, so it cannot be spoofed to
    evade limits in the default (no-proxy) posture."""
    if settings.trust_proxy:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_rate_limit_key)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global store, audit_log
    assert_secure_secret()  # DB4: fail closed in prod on a default/weak JWT secret
    init_db()  # create users table if not exists
    store = SessionStore(settings.redis_url)
    # Attach the durable append-only SQL mirror (R1 WORM anchor) so the audit
    # chain survives even a full Redis compromise. When an Object-Lock bucket is
    # configured (Item 3), ALSO mirror to S3 — an immutable anchor outside the DB.
    anchor = DurableAuditStore()
    if settings.audit_s3_bucket:
        anchor = MultiAnchor([
            anchor,
            S3ObjectLockAnchor(
                settings.audit_s3_bucket,
                prefix=settings.audit_s3_prefix,
                retention_days=settings.audit_s3_retention_days,
                region=settings.audit_s3_region or None,
                endpoint_url=settings.audit_s3_endpoint_url or None,
            ),
        ])
        log.info("audit_s3_anchor_enabled", bucket=settings.audit_s3_bucket)
    audit_log = AuditLogger(store.redis, durable=anchor)
    log.info("gateway_startup", redis_url=settings.redis_url)
    yield
    await store.close()


app = FastAPI(title="PII Tokenization Gateway", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Chrome Private Network Access: HTTPS pages fetching http://localhost require
# the server to respond to OPTIONS preflights with this header.
@app.middleware("http")
async def private_network_access(request: Request, call_next):
    if (
        request.method == "OPTIONS"
        and "access-control-request-private-network" in request.headers
    ):
        origin = request.headers.get("origin", "*")
        return Response(
            status_code=204,
            headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-ID",
                "Access-Control-Allow-Private-Network": "true",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Max-Age": "86400",
                "Vary": "Origin",
            },
        )
    response = await call_next(request)
    return response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _correlation_id(request: Request) -> str:
    """Return X-Request-ID from the caller or generate a fresh UUID."""
    return request.headers.get("X-Request-ID") or str(uuid.uuid4())


def _guard_ollama_url(url: str) -> str:
    """Validate a caller-supplied Ollama URL against the SSRF policy.

    Loopback/private targets are allowed for self-host (non-production) or when
    explicitly allowlisted; link-local/metadata is always blocked. Raises
    HTTP 400 with a generic message on rejection — the reason is logged, never
    echoed to the caller (no internal-topology disclosure).
    """
    allowlist = [h.strip() for h in settings.ollama_url_allowlist.split(",") if h.strip()]
    in_production = settings.environment.strip().lower() in ("production", "prod")
    allow_private = (not in_production) or bool(allowlist)
    try:
        return validate_ollama_url(url, allow_private=allow_private, allowlist=allowlist)
    except SsrfBlocked as exc:
        log.warning("ollama_url_blocked", reason=str(exc))
        raise HTTPException(400, "The provided ollama_url is not permitted.")


async def _require_auth(
    authorization: Optional[str] = Header(None),
) -> dict:
    """FastAPI dependency: validate a Bearer JWT and reject revoked tokens.

    Returns the decoded claims. Role checks are layered on top by callers.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    try:
        payload = validate_token(authorization[7:])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except Exception:
        raise HTTPException(401, "Invalid token")
    if await is_revoked(store.redis, payload.get("jti")):
        raise HTTPException(401, "Token has been revoked")
    return payload


async def _require_admin(
    payload: dict = Depends(_require_auth),
) -> dict:
    """FastAPI dependency that enforces admin-role JWT."""
    if payload.get("role") != "admin":
        raise HTTPException(403, "Admin role required")
    return payload


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    try:
        await store.redis.ping()
        redis_status = "ok"
    except Exception:
        redis_status = "unreachable"
    return {
        "status": "ok" if redis_status == "ok" else "degraded",
        "redis": redis_status,
        "timestamp": time.time(),
        "version": "1.1.0",
    }


@app.post("/api/session/configure", response_model=SessionConfigResponse)
async def configure_session(
    body: SessionConfigRequest,
    request: Request,
    auth: dict = Depends(_require_auth),
):
    correlation_id = _correlation_id(request)
    session_id = str(uuid.uuid4())
    owner_sub = auth.get("sub", "")
    owner_tenant = auth.get("tenant", "default")
    ollama_url = body.ollama_url or "http://localhost:11434"
    # Validate at config time so the SSRF policy is enforced once, before the URL
    # is persisted and later dereferenced by the chat path (route_to_llm).
    if body.provider == "ollama":
        ollama_url = _guard_ollama_url(ollama_url)
    await store.set_provider_config(
        session_id,
        {
            "provider": body.provider,
            "model": body.model,
            "api_key": body.api_key or "",
            "ollama_url": ollama_url,
        },
    )
    # DB3: bind the session to its creator so no other identity can drive it.
    await store.set_session_owner(session_id, owner_sub, owner_tenant)
    await audit_log.log_event(
        EventType.SESSION_CREATE,
        correlation_id=correlation_id,
        session_id=session_id,
        role=auth.get("role"),
        tenant_id=owner_tenant,
        details={"provider": body.provider, "model": body.model},
    )
    log.info("session_created", session_id=session_id, provider=body.provider)
    return SessionConfigResponse(
        session_id=session_id, provider=body.provider, model=body.model
    )


@app.get("/api/session/models")
async def get_models(
    provider: str,
    ollama_url: Optional[str] = "http://localhost:11434",
    auth: dict = Depends(_require_auth),
):
    # Auth required: this endpoint fetches a caller-supplied URL server-side, so
    # leaving it open is an unauthenticated SSRF (internal port scan / metadata
    # endpoint probe via the error message). Authentication scopes the blast
    # radius to known users; self-hosters still reach their own LAN Ollama.
    if provider != "ollama":
        raise HTTPException(400, "Model listing is only supported for the ollama provider.")
    safe_url = _guard_ollama_url(ollama_url or "http://localhost:11434")
    try:
        models = await list_ollama_models(safe_url)
        return {"models": models}
    except HTTPException:
        raise
    except Exception as exc:
        # Generic message — do not echo the URL or upstream exception (would leak
        # internal reachability / topology). Detail is logged server-side only.
        log.warning("ollama_unreachable", error=str(exc))
        raise HTTPException(503, "Cannot reach Ollama.")


@app.post("/api/auth/token", response_model=TokenResponse)
@limiter.limit("10/minute")
async def get_auth_token(body: TokenRequest, request: Request):
    """Issue a server-signed JWT for the requested role.

    DB1: this endpoint is credential-free and therefore DISABLED by default. The
    supported path to a token is POST /api/users/login (bcrypt). An operator may
    opt into this legacy endpoint via ALLOW_INSECURE_TOKEN_ENDPOINT for a dev or
    design-partner pilot; even then it refuses privileged roles (admin, vp_risk)
    so a self-asserted role can never reach regulated PII or the audit log.
    ⛔ Halt-point: remove this endpoint entirely once SSO/OIDC issuance lands.
    """
    correlation_id = _correlation_id(request)
    if not settings.allow_insecure_token_endpoint:
        await audit_log.log_event(
            EventType.AUTH_FAILURE,
            correlation_id=correlation_id,
            role=body.role,
            details={"reason": "direct_token_endpoint_disabled"},
        )
        raise HTTPException(
            403,
            "Direct token issuance is disabled. Authenticate via POST /api/users/login.",
        )
    if body.role in PRIVILEGED_ROLES:
        await audit_log.log_event(
            EventType.AUTH_FAILURE,
            correlation_id=correlation_id,
            role=body.role,
            details={"reason": "privileged_role_via_direct_endpoint"},
        )
        raise HTTPException(
            403,
            f"Role '{body.role}' cannot be issued via the direct token endpoint; "
            "it requires an authenticated login.",
        )
    try:
        token = issue_token(body.role, body.subject)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    await audit_log.log_event(
        EventType.AUTH_TOKEN_ISSUED,
        correlation_id=correlation_id,
        role=body.role,
        details={"subject": body.subject},
    )
    log.info("token_issued", role=body.role, correlation_id=correlation_id)
    return TokenResponse(
        token=token,
        role=body.role,
        expires_in=int(settings.jwt_ttl_hours * 3600),
    )


@app.post("/api/users/register", response_model=UserResponse, status_code=201)
@limiter.limit("5/minute")
async def register(
    body: RegisterRequest,
    request: Request,
    db=Depends(get_db),
):
    """Create a new user account and return a ready-to-use JWT."""
    correlation_id = _correlation_id(request)
    # Self-service registration may NEVER mint a privileged role. Without this an
    # anonymous caller could register as admin/vp_risk and receive a JWT that
    # detokenizes all PII and reads the audit log (privilege escalation).
    # Privileged roles require an authenticated grant (SSO / admin provisioning).
    if body.role in PRIVILEGED_ROLES:
        await audit_log.log_event(
            EventType.AUTH_FAILURE,
            correlation_id=correlation_id,
            role=body.role,
            details={"reason": "privileged_role_via_self_registration"},
        )
        raise HTTPException(
            403,
            f"Role '{body.role}' cannot be self-registered; it requires an "
            "authenticated grant.",
        )
    if get_user_by_email(db, body.email):
        raise HTTPException(409, "Email already registered")
    if get_user_by_username(db, body.username):
        raise HTTPException(409, "Username already taken")
    try:
        user = create_user(db, body.username, body.email, body.password, body.role)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    token = issue_token(user.role, user.email)
    await audit_log.log_event(
        EventType.AUTH_TOKEN_ISSUED,
        correlation_id=correlation_id,
        role=user.role,
        details={"action": "register", "username": user.username},
    )
    log.info("user_registered", username=user.username, role=user.role)
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        token=token,
        expires_in=int(settings.jwt_ttl_hours * 3600),
    )


@app.post("/api/users/login", response_model=UserResponse)
@limiter.limit("10/minute")
async def login(
    body: LoginRequest,
    request: Request,
    db=Depends(get_db),
):
    """Authenticate an existing user and return a signed JWT."""
    correlation_id = _correlation_id(request)
    user = authenticate_user(db, body.email, body.password)
    if not user:
        await audit_log.log_event(
            EventType.AUTH_FAILURE,
            correlation_id=correlation_id,
            details={"reason": "bad_credentials", "email": body.email[:4] + "***"},
        )
        raise HTTPException(401, "Invalid email or password")
    token = issue_token(user.role, user.email)
    await audit_log.log_event(
        EventType.AUTH_TOKEN_ISSUED,
        correlation_id=correlation_id,
        role=user.role,
        details={"action": "login", "username": user.username},
    )
    log.info("user_login", username=user.username, role=user.role)
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        token=token,
        expires_in=int(settings.jwt_ttl_hours * 3600),
    )


@app.get("/api/audit/logs")
async def get_audit_logs(
    request: Request,
    date: Optional[str] = None,
    limit: int = 200,
    admin: dict = Depends(_require_admin),
):
    """Return the audit log for the given UTC date (admin role required)."""
    correlation_id = _correlation_id(request)
    tenant = admin.get("tenant", "default")
    await audit_log.log_event(
        EventType.ADMIN_ACCESS,
        correlation_id=correlation_id,
        role=admin.get("role"),
        tenant_id=tenant,
        details={"action": "get_audit_logs", "date": date, "limit": limit},
    )
    logs = await audit_log.get_logs(date=date, limit=min(limit, 500), tenant_id=tenant)
    return {"logs": logs, "count": len(logs), "date": date or "today"}


@app.get("/api/audit/verify")
async def verify_audit(
    request: Request,
    date: Optional[str] = None,
    admin: dict = Depends(_require_admin),
):
    """Verify the tamper-evidence of the audit trail (admin role required).

    Runs both checks and reports each so a regulator/operator can see the proof,
    not just a boolean:
      - ``redis_chain``: the per-day hash chain + signed high-water mark (fast).
      - ``durable``:     the continuous WORM anchor(s) — Postgres mirror and, when
        configured, the S3 Object Lock anchor (regulator-grade). With a MultiAnchor
        the per-anchor outcome is under ``durable.anchors`` and ``durable.anchor``
        names the first that diverged.
    ``ok`` is the AND of every check. A false here is a tamper signal — page on it.
    """
    correlation_id = _correlation_id(request)
    tenant = admin.get("tenant", "default")
    await audit_log.log_event(
        EventType.ADMIN_ACCESS,
        correlation_id=correlation_id,
        role=admin.get("role"),
        tenant_id=tenant,
        details={"action": "verify_audit", "date": date},
    )
    redis_chain = await audit_log.verify_chain(date=date, tenant_id=tenant)
    durable = await audit_log.verify_durable(tenant_id=tenant)
    overall_ok = bool(redis_chain.get("ok")) and (durable is None or bool(durable.get("ok")))
    return {
        "ok": overall_ok,
        "date": date or "today",
        "redis_chain": redis_chain,
        "durable": durable,
    }


@app.post("/v1/chat/completions")
@limiter.limit("20/minute")
async def chat_completions(
    request: Request,
    body: ChatCompletionRequest,
    x_session_id: str = Header(..., alias="X-Session-ID"),
    authorization: Optional[str] = Header(None),
):
    correlation_id = _correlation_id(request)

    # 1. Strict JWT validation — fail 401, no silent fallback to a default role
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required. Call POST /api/auth/token first.")
    try:
        payload = validate_token(authorization[7:])
        role = payload["role"]
    except pyjwt.ExpiredSignatureError:
        await audit_log.log_event(
            EventType.AUTH_FAILURE, correlation_id, x_session_id, details={"reason": "expired"}
        )
        raise HTTPException(401, "Token expired — request a new token from POST /api/auth/token")
    except Exception as exc:
        await audit_log.log_event(
            EventType.AUTH_FAILURE, correlation_id, x_session_id, details={"reason": str(exc)}
        )
        raise HTTPException(401, "Invalid token")

    tenant = payload.get("tenant", "default")
    if await is_revoked(store.redis, payload.get("jti")):
        await audit_log.log_event(
            EventType.AUTH_FAILURE,
            correlation_id,
            x_session_id,
            tenant_id=tenant,
            details={"reason": "revoked"},
        )
        raise HTTPException(401, "Token has been revoked")

    allowed_entities = get_role_permissions(role)

    # 2. Load provider config + session owner. FAIL CLOSED on a vault (Redis)
    # outage: a store error blocks the request with a clean 503 instead of an
    # unhandled 500 that could leak internals — and, critically, control never
    # reaches the LLM call below, so no prompt is forwarded in the clear (Item 2).
    try:
        config = await store.get_provider_config(x_session_id)
        owner = await store.get_session_owner(x_session_id)
    except Exception as exc:  # noqa: BLE001
        log.error("vault_unavailable", error=str(exc), session_id=x_session_id)
        raise HTTPException(
            503, "Session vault unavailable — request blocked for safety."
        )
    if not config:
        raise HTTPException(
            404, "Session not found or expired. Please reconfigure the gateway."
        )

    # DB3: the X-Session-ID must belong to the authenticated caller. Without this
    # any valid token could drive another user's/tenant's session and detokenize
    # their PII (IDOR). Fail closed if the owner record is missing or mismatched.
    if (
        not owner
        or owner.get("sub") != payload.get("sub")
        or owner.get("tenant", "default") != tenant
    ):
        await audit_log.log_event(
            EventType.AUTH_FAILURE,
            correlation_id,
            x_session_id,
            role=role,
            tenant_id=tenant,
            details={"reason": "session_ownership_mismatch"},
        )
        raise HTTPException(
            403, "This session does not belong to the authenticated caller."
        )

    # 2.5 OWASP LLM01 — prompt-injection input guard. Inspect raw user content
    # before it is tokenized/forwarded. Block at/above the configured severity;
    # otherwise record the signal and proceed. (System messages are not scanned
    # — the gateway controls the analyst system prompt itself.)
    injection_labels: list[str] = []
    worst_injection: str | None = None
    for msg in body.messages:
        if msg.role != "user":
            continue
        result = scan_for_injection(msg.content)
        if result.findings:
            injection_labels = sorted(set(injection_labels) | set(result.labels))
            if worst_injection is None or (
                result.worst_severity
                and result.worst_severity != worst_injection
            ):
                worst_injection = result.worst_severity
            if result.blocks_at(settings.injection_block_severity):
                await audit_log.log_event(
                    EventType.INJECTION_DETECTED,
                    correlation_id,
                    session_id=x_session_id,
                    role=role,
                    tenant_id=tenant,
                    details={"action": "blocked", "labels": result.labels,
                             "severity": result.worst_severity},
                )
                raise HTTPException(
                    422,
                    "Prompt-injection attempt detected — request blocked (OWASP LLM01).",
                )
    if injection_labels:
        await audit_log.log_event(
            EventType.INJECTION_DETECTED,
            correlation_id,
            session_id=x_session_id,
            role=role,
            tenant_id=tenant,
            details={"action": "flagged", "labels": injection_labels,
                     "severity": worst_injection},
        )

    # 3. Tokenize all messages — FAIL SAFE: any error blocks the request
    tokenized_messages = []
    all_entities = []
    all_tokens: dict[str, str] = {}
    try:
        for msg in body.messages:
            tok_text, entities, new_tokens = await run_tokenize(
                msg.content, x_session_id, store
            )
            await store.update_token_map(x_session_id, new_tokens)
            all_tokens.update(new_tokens)
            tokenized_messages.append({"role": msg.role, "content": tok_text})
            all_entities.extend([e.to_dict() for e in entities])
    except Exception as exc:
        log.error("tokenization_failed", error=str(exc), session_id=x_session_id)
        # Generic message — internal detail is logged server-side, not returned.
        raise HTTPException(
            422,
            "PII tokenization failed — request blocked for safety.",
        )

    if all_entities:
        await audit_log.log_event(
            EventType.PII_DETECTED,
            correlation_id,
            session_id=x_session_id,
            role=role,
            tenant_id=tenant,
            details={
                "entity_count": len(all_entities),
                "entity_types": list({e["entity_type"] for e in all_entities}),
            },
        )

    # 4. Call the LLM with the sanitized prompt
    try:
        llm_response = await route_to_llm(
            provider=config["provider"],
            model=config["model"],
            messages=tokenized_messages,
            api_key=config.get("api_key"),
            ollama_url=config.get("ollama_url", "http://localhost:11434"),
        )
    except Exception as exc:
        log.error(
            "llm_call_failed",
            error=str(exc),
            session_id=x_session_id,
            provider=config["provider"],
        )
        raise HTTPException(502, "Upstream LLM provider error.")

    # 5. De-tokenize response according to caller's role
    raw_llm_response = llm_response
    token_map = await store.get_token_map(x_session_id)
    detokenized = run_detokenize(llm_response, token_map, allowed_entities)

    # 6. OWASP LLM02 — Insecure Output Handling. Sanitize the model output before
    # it is returned or passed to any downstream consumer (strip active markup,
    # defang script/data URIs, remove markdown image beacons). Audit if it fired.
    output_scan = sanitize_output(detokenized)
    detokenized = output_scan.text
    if output_scan.modified:
        await audit_log.log_event(
            EventType.OUTPUT_FLAGGED,
            correlation_id,
            session_id=x_session_id,
            role=role,
            tenant_id=tenant,
            details={"flags": output_scan.flags},
        )

    await audit_log.log_event(
        EventType.CHAT_REQUEST,
        correlation_id,
        session_id=x_session_id,
        role=role,
        tenant_id=tenant,
        details={
            "provider": config["provider"],
            "model": config["model"],
            "entities_masked": len(all_entities),
            "entities_allowed": list(allowed_entities),
        },
    )

    log.info(
        "request_completed",
        session_id=x_session_id,
        role=role,
        entities_masked=len(all_entities),
        correlation_id=correlation_id,
    )

    return JSONResponse(
        {
            "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
            "object": "chat.completion",
            "model": config["model"],
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": detokenized},
                    "finish_reason": "stop",
                }
            ],
            # Extra field consumed by the UI — ignored by standard OpenAI clients.
            # token_vault is filtered by the caller's allowed_entities so that
            # lower-privileged roles cannot reconstruct PII they are not permitted
            # to see by reading the raw vault from the HTTP response.
            "_meta": {
                "tokenized_messages": tokenized_messages,
                "entities_found": all_entities,
                "role": role,
                "entities_allowed": list(allowed_entities),
                "raw_llm_response": raw_llm_response,
                # OWASP LLM02: rule labels that fired while sanitizing output (if any).
                "output_flags": output_scan.flags,
                # Map the token's short code (e.g. ACCT) to its canonical entity
                # type (ACCOUNT_NUMBER) before the permission check, so the vault
                # exposes exactly what the role's detokenized text already shows —
                # no more (avoids leaking disallowed PII) and no less (avoids a
                # silently empty vault from a short-vs-entity-name mismatch).
                "token_vault": {
                    tok: val
                    for tok, val in all_tokens.items()
                    if (m := re.match(r"^\{\{([A-Z]+)_\d+\}\}$", tok))
                    and _SHORT_TO_ENTITY.get(m.group(1), m.group(1)) in allowed_entities
                },
            },
        }
    )
