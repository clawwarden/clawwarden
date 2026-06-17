# Security risk acceptances

Written record of P1 findings from the production security audit that are
**accepted** rather than fixed, with the reasoning and compensating controls.
Required by the pre-ship gate ("a P1 passes if explicitly risk-accepted in writing").

---

## RA-001 — Gateway JWT stored in browser `localStorage` (web console)

- **Date:** 2026-06-16 · **Status:** Accepted · **Severity:** P1
- **Owner:** founder

### Context
The web console ([apps/web](../apps/web)) is a **thin client that talks directly,
cross-origin, to the user's own gateway** (`clawwarden.space` → `http://localhost:8000`
or a self-hosted gateway origin). This architecture constrains token storage:

- **httpOnly cookies cannot replace localStorage here.** A cookie set by the
  gateway is not sent from a different-origin page without `SameSite=None; Secure`,
  which fails on a plain-http localhost gateway. The calls also cannot be proxied
  through a Next.js BFF, because the Vercel server cannot reach the user's
  `localhost` gateway. The token must live in the browser to call the local
  gateway at all.
- **Bearer-token-in-header is CSRF-immune; cookies are not.** Switching to cookie
  auth would *introduce* CSRF risk and require CSRF tokens — a net negative for
  this cross-origin, browser-to-local-gateway topology. `Authorization: Bearer`
  is the appropriate pattern.

### Decision
Accept storing the gateway-issued JWT in `localStorage` on the web console.

### Compensating controls (in place)
- **Strict CSP** ([next.config.ts](../apps/web/next.config.ts)): `default-src 'self'`,
  no remote script origins, `connect-src` limited to self + the gateway origin +
  localhost, `frame-ancestors 'none'`. This is the primary XSS mitigation.
- **Short token TTL** — 4 hours (`JWT_TTL_HOURS`).
- **Server-side revocation** — every token carries a `jti` on a Redis denylist
  ([gateway/revocation.py](../apps/gateway/gateway/revocation.py)); a token can be
  revoked in well under 5 minutes.
- **Minimal token contents** — role / subject / tenant only; no secrets or PII.
- **HTTPS + HSTS** on the web origin.

### Residual risk
An XSS on `clawwarden.space` could read a live token and drive the victim's local
gateway for up to the token's remaining lifetime (≤ 4h). The strict CSP makes
script injection substantially harder; no third-party scripts are loaded.

### Revisit triggers
- Any third-party / inline-external script is added to the web app (re-evaluate CSP + this RA).
- The UI and gateway are ever **co-hosted on the same origin** (e.g. behind a
  reverse proxy for an enterprise self-host). In that case switch to a
  gateway-set **`HttpOnly; Secure; SameSite=Strict`** cookie (CSRF-safe because
  Strict cookies are not sent cross-site), keeping the `Authorization` header as
  a fallback. This is the proper fix and should be implemented when that
  topology ships.
