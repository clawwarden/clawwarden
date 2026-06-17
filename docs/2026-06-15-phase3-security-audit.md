# ClawWarden-Core — Phase 3 Security & Correctness Audit

_Date: 2026-06-15 · Scope: `gateway/` (the flagship engine) + its test suite · Reviewer pass: static read of every module + TDD verification._

Baseline before this pass: test suite **would not collect at all** (see B0). After fixes: **90 tests pass** (84 pre-existing + 6 new security regressions). Heavy NER tests (`test_tokenizer.py`, `test_pii_recall.py`) require the ~590 MB `en_core_web_lg` spaCy model and were **not run** this pass — run them before release.

## Fixed this pass (code changed, tests added, suite green)

| ID | Severity | Issue | Fix |
|---|---|---|---|
| **B0** | Blocker | `tests/__init__.py` contained the literal text `tests/__init__.py` → `NameError` on collection → **entire suite uncollectable**. CI was effectively testing nothing. | Emptied the file. |
| **C1** | **Critical** | **Registration privilege escalation.** `POST /api/users/register` accepted a caller-supplied `role`; `VALID_ROLES` includes `admin`/`vp_risk`. Any anonymous user could self-register as `admin`, get a privileged JWT, **detokenize all PII and read the audit log**. The `PRIVILEGED_ROLES` guard only protected the legacy `/api/auth/token` endpoint — register had none. | Reject `PRIVILEGED_ROLES` at registration (403 + `AUTH_FAILURE` audit event). Privileged roles now require an authenticated grant. [gateway/main.py](../gateway/main.py) |
| **C2** | High | **Audit-chain tail truncation undetectable.** `verify_chain()` walks one day's list; deleting the *trailing* N entries leaves an internally-consistent shorter chain → `ok=True`. Nothing anchored the expected length. Undercuts the "tamper-evident, regulator-grade" claim (the trust-plane thesis). | Added a **signed high-water mark** `"{seq}:{HMAC(seq:last_hash)}"` on a detached monotonic counter. `verify_chain` now fails if surviving entry count ≠ signed `seq`. Additive + backward-compatible (older chains skip the check). [gateway/audit.py](../gateway/audit.py) |
| **C4** | High | **Unauthenticated SSRF.** `GET /api/session/models` had **no auth** and fetched a caller-supplied `ollama_url` server-side → internal port scan / cloud-metadata probe via error text. | Added `Depends(_require_auth)`. Self-hosters still reach their own LAN Ollama; anonymous SSRF closed. [gateway/main.py](../gateway/main.py) |
| **C7** | Low | **`_meta.token_vault` disclosure mismatch.** Filter compared the token's *short code* (`ACCT`) against *full* entity names (`ACCOUNT_NUMBER`), so the vault silently under-disclosed vs the detokenized text (inconsistent, confusing; masks RBAC bugs). | Map short→entity via `_SHORT_TO_ENTITY` before the permission check. Now exactly mirrors what the role's text reveals. [gateway/main.py](../gateway/main.py) |

New tests: [tests/test_security_findings.py](../tests/test_security_findings.py) (register priv-esc ×2, register allow ×2, models auth, audit truncation).

## Residual / design-level findings (NOT fixed — need a decision, several are documented halt-points)

| ID | Severity | Issue | Recommendation |
|---|---|---|---|
| **R1** | High | **Audit whole-day deletion + watermark-key deletion.** Redis is not WORM. An attacker with Redis write can delete an entire `audit:{tenant}:{date}` key (no cross-day chaining → invisible), or delete the watermark key to hide truncation. The watermark raises the bar but is not absolute. | This is the existing `⛔ halt-point` in [gateway/audit.py](../gateway/audit.py). Wire the durable anchor: **S3 Object Lock (COMPLIANCE mode)** or append-only Postgres, **plus cross-day chaining** (each day's genesis = prior day's final hash) so a missing day is detectable. This is core to the whitepaper's tamper-evidence claim — prioritize. |
| **R2** | Medium | **Authenticated SSRF remains.** A logged-in user can still point `ollama_url` (configure + models) at any internal URL. By design for self-host LANs, but a hosted deployment shouldn't allow it. | Add an optional `OLLAMA_URL_ALLOWLIST` / block link-local + RFC1918 + `169.254.169.254` when `ENVIRONMENT=production`. |
| **R3** | Medium | **Rate limit keyed on `get_remote_address`.** Behind a reverse proxy/Docker, all clients may share the proxy IP (one user's burst rate-limits everyone) or, if XFF is trusted, be spoofable. | Configure trusted proxy / `X-Forwarded-For` handling; rate-limit by authenticated subject for protected routes. |
| **R4** | Medium | **Token-numbering race.** `get_or_create_token_for_hash` does check-then-incr non-atomically; concurrent identical new values can mint two tokens for one value. | Use a Redis Lua script or `SETNX` on the hash key, deriving the counter only after a successful claim. |
| **R5** | Low | **`rbac.decode_jwt` is dead and unsafe.** Decodes with no `exp`/`aud`/`iss` verification. Unused by `main` (which uses `validate_token`), but a trap if ever called. | Delete it; update `tests/test_rbac.py` to use `validate_token`. |
| **R6** | Low | **`MONEY`→`CURRENCY` branch is dead.** `ALL_ENTITIES` excludes MONEY, so the remap in [gateway/tokenizer.py](../gateway/tokenizer.py) never runs. | Remove, or intentionally enable currency handling. Harmless but misleading. |
| **R7** | Low | **CORS origins hardcoded** in [gateway/config.py](../gateway/config.py) (`clawwarden.space`, vercel preview, `clawwarden.app`) as defaults with `allow_credentials=True`. | Drive entirely from `ALLOWED_ORIGINS`; ship no production hostnames as code defaults. |
| **R8** | Low | **SQLite default + single-writer** (documented DB6 halt-point) — fine for self-host/demo, blocks HA. | Already documented; Postgres via `DATABASE_URL`. No action for the open/self-host story. |

## What's genuinely solid (keep — these are credibility for the paper)

- **Fail-safe tokenization:** any NER error blocks the request (422) — PII never passes un-tokenized. [main.py](../gateway/main.py)
- **No raw PII in logs/audit:** audit `details` carry counts + entity *types*, login logs `email[:4]+"***"`. The leak red-team found no raw-PII path into logs or the model-facing payload (post-C7).
- **Vault encrypted at rest:** token map + provider API keys via `MultiFernet` with key-rotation grace. [redis_store.py](../gateway/redis_store.py)
- **Session ownership (IDOR) check:** chat binds `X-Session-ID` to the authenticated `sub`+`tenant`. [main.py](../gateway/main.py)
- **Strict JWT validation:** fixed HS256 (no alg-confusion), required claims, issuer/audience/expiry, `jti` revocation denylist, previous-secret rotation. [auth.py](../gateway/auth.py)
- **Hash-chained audit** with genuine tamper tests (now incl. truncation).
- **Fail-closed prod secret gate:** refuses to boot in production on a weak/placeholder `JWT_SECRET`. [config.py](../gateway/config.py)

## Recommended next actions

1. **R1 first** — durable WORM anchor + cross-day chaining. It's the difference between "hash chain" and a defensible tamper-evidence claim for the whitepaper.
2. Run the NER suite (`test_tokenizer.py`, `test_pii_recall.py`) with the spaCy model; capture **PII recall/precision numbers** — these become the paper's evaluation table.
3. R2/R3 before any hosted (non-self-host) deployment.
4. Fold these fixes into the unified monorepo's `apps/gateway` during Phase 1.

_Nothing here is committed yet — all changes are in the `clawwarden-core` working tree pending review._
