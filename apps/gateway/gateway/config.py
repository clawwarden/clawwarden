from pydantic_settings import BaseSettings


# Known-unsafe JWT secrets that must never sign tokens in production. The first
# is the value shipped in this repo / docker-compose; the rest are common lazy
# placeholders. ⛔ Halt-point: extend per your org's secret-strength policy.
PLACEHOLDER_SECRETS: frozenset[str] = frozenset(
    {"change-me-in-production-secret-key", "", "secret", "changeme", "change-me"}
)
MIN_SECRET_LEN = 32


class Settings(BaseSettings):
    # Deployment environment. When "production"/"prod", startup fails closed on a
    # weak JWT secret (see assert_secure_secret). Defaults to development so local
    # and CI runs stay frictionless.
    environment: str = "development"
    redis_url: str = "redis://localhost:6379"
    jwt_secret: str = "change-me-in-production-secret-key"
    # Comma-separated list of allowed CORS origins.
    # Add your Vercel URL here or set ALLOWED_ORIGINS env var.
    allowed_origins: str = (
        "http://localhost:3000,"
        "http://localhost:3001,"
        "https://clawwarden-iota.vercel.app,"
        "https://clawwarden.space,"
        "https://clawwarden.app"
    )

    # Enterprise JWT claims — validated on every request
    jwt_issuer: str = "pii-gateway"
    jwt_audience: str = "pii-gateway-clients"
    jwt_ttl_hours: float = 4.0
    # DB1: the credential-free POST /api/auth/token endpoint is OFF by default.
    # The supported path to a token is POST /api/users/login (bcrypt). Operators
    # may opt into the legacy endpoint for a dev/pilot via this flag; even then it
    # refuses privileged roles (see gateway/rbac.PRIVILEGED_ROLES).
    # ⛔ Halt-point: delete the legacy endpoint outright once SSO/OIDC lands.
    allow_insecure_token_endpoint: bool = False
    # Key rotation (Gap 3): comma-separated PREVIOUS secrets kept valid during a
    # grace window so rotating jwt_secret / the Fernet vault key never breaks
    # in-flight sessions. ⛔ Halt-point: rotation cadence is an ops decision.
    jwt_previous_secrets: str = ""
    # DB2/DB4: data-at-rest encryption key, kept SEPARATE from the JWT signing
    # secret so rotating one never rotates the other (and a leaked signing key
    # does not decrypt the vault). Empty falls back to jwt_secret for back-compat
    # with vaults written before the split. ⛔ Halt-point: move to a KMS/HSM-backed
    # key and per-tenant DEKs (envelope encryption) for high-assurance tenants.
    encryption_secret: str = ""
    encryption_previous_secrets: str = ""

    # DB5: dedicated HMAC key for the hash-chained audit log.  MUST be separate
    # from JWT_SECRET so rotating one does not silently break the other's chain.
    # Empty falls back to JWT_SECRET for back-compat.
    # ⛔ Halt-point: in production source this from a KMS/HSM-backed secret and
    # never rotate it in place without re-signing the stored chain.
    audit_hmac_key: str = ""

    # Shared Governance Service (AgentGuard) — ClawWarden ships audit + evidence
    # to the cross-cutting trust fabric. See MANIFESTO.md §0/§7. When the URL or
    # API key is unset, the client no-ops so ClawWarden still runs standalone.
    governance_url: str = ""
    governance_api_key: str = ""
    governance_timeout_seconds: float = 3.0
    # Default tenant for governance shipping until real multi-tenancy lands
    # (Gap 3, Phase 2). ⛔ Halt-point: replace before production.
    governance_tenant_id: str = "default"

    # SSRF guard for the user-supplied Ollama base URL. Comma-separated hostname
    # allowlist; when set, only these hosts may be targeted. Loopback/private
    # addresses are permitted outside production (self-host local Ollama) and in
    # production only when this allowlist names them. Link-local/metadata
    # (169.254.x) is ALWAYS blocked. See gateway/ssrf.py.
    ollama_url_allowlist: str = ""

    # Item 3: external WORM anchor (S3 Object Lock). When audit_s3_bucket is set,
    # every audit entry is ALSO written as a write-once, Object-Locked S3 object —
    # immutable outside the database, closing the white-paper §8 residual (a
    # privileged operator who could drop the Postgres table). Empty bucket = the
    # S3 anchor is disabled and only the Postgres/SQLite mirror runs (back-compat).
    # The bucket MUST have Object Lock enabled at creation (it cannot be added
    # later). ⛔ Halt-point: retention_days is a compliance decision — the 7-year
    # default matches SEC 17a-4 / FINRA 4370; confirm your schedule before deploy.
    audit_s3_bucket: str = ""
    audit_s3_prefix: str = "audit"
    audit_s3_retention_days: int = 2556
    audit_s3_region: str = ""
    # Optional custom endpoint for S3-compatible stores (MinIO, LocalStack). Leave
    # empty for AWS S3. Credentials come from the standard AWS chain (IAM role /
    # env / profile) — never put keys in this file.
    audit_s3_endpoint_url: str = ""

    # R3: when the gateway runs behind a trusted reverse proxy that sets
    # X-Forwarded-For, enable this so rate limits key on the real client IP
    # instead of the shared proxy IP. Keep OFF unless a trusted proxy is in front
    # (otherwise clients could spoof XFF to evade limits).
    trust_proxy: bool = False

    # Error tracking (Sentry) — opt-in. Empty DSN = disabled (no-op). PII is
    # never sent (send_default_pii=False + scrubbing); see gateway/observability.py.
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.0

    # OWASP LLM01: block a chat request when the worst prompt-injection finding
    # is at/above this severity (low|medium|high|critical). Default "high" so
    # benign mentions don't block, but override-instruction / jailbreak / safety-
    # bypass attempts are refused. Set "critical" to only block the most severe,
    # or "low" to block on any signal.
    injection_block_severity: str = "high"

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()


def assert_secure_secret(s: "Settings | None" = None) -> None:
    """Fail closed at startup if running in production with a weak JWT secret.

    No-op outside production so local/CI runs are frictionless. In production a
    placeholder or short (< MIN_SECRET_LEN) secret raises ``RuntimeError`` before
    the app serves traffic — the secret both signs JWTs and derives the vault key,
    so a default here is a remote-takeover key (DB4).

    ⛔ Halt-point (key-management policy): the production gate and strength bar are
    pre-filled SOTA defaults; the founder/ops owns the final policy.
    """
    s = s if s is not None else settings
    if s.environment.strip().lower() not in ("production", "prod"):
        return
    secret = s.jwt_secret or ""
    if secret in PLACEHOLDER_SECRETS or len(secret) < MIN_SECRET_LEN:
        raise RuntimeError(
            "Refusing to start in production with a default/weak JWT_SECRET. "
            f"Set a unique JWT_SECRET of at least {MIN_SECRET_LEN} characters "
            "(and rotate it via JWT_PREVIOUS_SECRETS, not a hard cutover)."
        )
