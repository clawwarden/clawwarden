# ClawWarden HA + Disaster-Recovery Runbook (Item 2)

Closes the CTO blocker: *Redis holds the token↔value vault; Redis down → every request
fail-closes → org-wide LLM access stops. Key loss → permanent loss of detokenization and
an unverifiable audit chain.* This runbook documents the failure modes, the durable/HA
topology, the key lifecycle, and a rehearsed restore drill.

**The one guarantee that never bends:** a vault outage **blocks** requests — raw PII is
*never* forwarded in the clear. This is proven by `tests/test_fail_closed_outage.py`
(vault down → 503/422, `route_to_llm` never called) and enforced in
`gateway/main.py` (vault read wrapped → 503; tokenize wrapped → 422).

---

## 1. Failure-mode table

| Failure | Blast radius | Behavior today | Recovery action | RTO | RPO |
|---|---|---|---|---|---|
| **Redis unreachable** (vault) | All chat blocked org-wide | **Fail-closed**: 503, no PII forwarded | Failover to replica (Sentinel/managed) or restart from AOF | ≤ 1 min (HA) / ≤ 10 min (single) | ≤ 1s (AOF everysec) |
| **Redis data loss** (volume gone) | Active sessions lose token maps → in-flight detokenize fails (fail-closed) | Sessions are short-lived (1h TTL); new sessions unaffected | Restore AOF from backup; sessions re-tokenize transparently | ≤ 15 min | ≤ last backup |
| **Audit HMAC / signing-key loss** | Existing audit chain becomes **unverifiable**; new chain re-signs from scratch | `verify_chain()` fails on old entries | Restore key from KMS/escrow — there is no other recovery | n/a | **0 — keys must be backed up** |
| **Fernet vault key loss** | **Permanent loss of detokenization** for vaulted values | Encrypted token maps become undecryptable | Restore key from KMS/escrow (by design, no bypass) | n/a | **0 — keys must be backed up** |
| **Postgres (audit mirror) down** | Durable WORM append best-effort fails; Redis chain + S3 anchor continue | `durable_audit_append_failed` logged | Restore Postgres; re-mirror gap is detected by `verify_chain()` seq gap | ≤ 30 min | ≤ last WAL |
| **Detector (Presidio/spaCy) crash** | Affected requests blocked | **Fail-closed**: 422, no PII forwarded | Restart process; investigate model load | ≤ 5 min | n/a |
| **Gateway instance down** | That instance's traffic | LB routes to healthy instances (N+1) | Auto-replace; stateless except Redis/DB | ≤ 1 min | n/a |

> **Targets above are recommended defaults.** ⛔ Halt-point: the founder/ops owns the
> committed RTO/RPO per the SLA (Item 4). Fill the committed numbers in before signing.

---

## 2. Redis durability + HA

**Durability (single node — dev/pilot):** AOF on with per-second fsync. Already wired in
`docker-compose.yml` (`--appendonly yes --appendfsync everysec`) with a persistent
`redis_data` volume → RPO ≤ 1s across restart/crash.

**HA (production):** do **not** run a single Redis. Choose one:
- **Managed** (recommended for a solo founder): AWS ElastiCache / Upstash / Redis Cloud
  with Multi-AZ + automatic failover + managed backups. Lowest ops burden.
- **Self-managed:** primary + ≥1 replica with **Redis Sentinel** (≥3 sentinels) for
  automatic failover. Point `REDIS_URL` at the Sentinel/managed endpoint.

**Backups:**
- Managed: enable daily snapshots + AOF; set retention to your policy.
- Self-managed: schedule `BGREWRITEAOF` + copy the AOF/RDB to encrypted off-box storage
  (e.g. S3 with SSE). **A backup you have never restored is a guess** — see §4.
- Encrypt backups at rest; they contain the (Fernet-encrypted) vault, so also protect
  the Fernet key separately (§3).

**Connection scaling:** front Postgres with PgBouncer (`pool_mode=transaction`) when
running multiple gateway instances (see `gateway/database.py` halt-point).

---

## 3. Key lifecycle (the part with no undo)

Three independent keys, deliberately split so rotating/leaking one does not affect the
others (`gateway/config.py`): `JWT_SECRET` (token signing), `ENCRYPTION_SECRET` (Fernet
vault), `AUDIT_HMAC_KEY` (audit chain). 

**Storage:** source all three from a **KMS/HSM** (AWS KMS, GCP KMS, Vault) — *never* a
file on the box, never committed (`.gitignore` blocks `*.key`/`*.pem`, but the real
control is KMS). Inject at runtime as env/secret refs.

**Backup / escrow (mandatory):** because losing a key is unrecoverable —
- `ENCRYPTION_SECRET` loss = **permanent loss of detokenization**.
- `AUDIT_HMAC_KEY` loss = the stored chain can **never be verified again**.
Keep each key escrowed in the KMS with versioning + a break-glass copy in a separate
custody. RPO for keys is **0**: they must already be backed up before any incident.

**Rotation (zero-downtime, grace window):** ClawWarden supports MultiFernet/secret
rotation via the `*_PREVIOUS_SECRETS` settings.
1. Generate the new key in KMS.
2. Set the new value as the current secret; move the old value into the matching
   `*_PREVIOUS_SECRETS` (comma-separated) so in-flight sessions/old vault entries keep
   decrypting during the grace window.
3. After the grace window (≥ session TTL = 1h; longer for vault re-encryption), drop the
   old key from `*_PREVIOUS_SECRETS`.
4. **Do NOT rotate `AUDIT_HMAC_KEY` in place** — it re-signs the chain from scratch and
   invalidates prior proofs. Rotating the audit key requires sealing the old chain
   (export + external anchor, see the S3 Object Lock runbook) and starting a new one.

---

## 4. Disaster-recovery drill (run before go-live, then quarterly)

A restore you have not rehearsed does not count. Record the result each run.

- [ ] **Snapshot:** confirm Redis backup (AOF/RDB) and Postgres backup exist and are < 24h old.
- [ ] **Kill:** stop the primary Redis (`docker compose stop redis` in staging, or fail an AZ).
- [ ] **Verify fail-closed:** a chat request returns **503** "blocked for safety" and the
      LLM is **not** called (confirm in logs: no `llm_call`, see `vault_unavailable`).
- [ ] **Failover/restore:** promote the replica (HA) or restore the AOF into a fresh Redis.
- [ ] **Recover keys:** confirm all three secrets resolve from KMS in the recovered env.
- [ ] **Integrity:** run `verify_durable()` (Postgres + S3 anchor) → `ok: true`; run
      per-day `verify_chain()` on a recent date → `ok: true`.
- [ ] **Smoke:** new session → tokenize → detokenize round-trips correctly.
- [ ] **Record:** wall-clock time to recover (the measured RTO) and last-backup age
      (the measured RPO); compare to the targets in §1; file any gap.

---

## 5. Monitoring / alerts (so an outage is seen, not discovered)

- Alert on `vault_unavailable` and `durable_audit_append_failed` and `s3_worm_append_failed`
  log lines (a silently failing anchor is the real risk).
- Alert on Redis: memory > 80%, replica lag, failover events, AOF write errors.
- Alert on a non-zero `verify_chain()` / `verify_durable()` result from the scheduled
  integrity check — a broken chain is a tamper signal, page on it.
- Track 503/422 block rates; a spike means the vault or detector is degraded.
