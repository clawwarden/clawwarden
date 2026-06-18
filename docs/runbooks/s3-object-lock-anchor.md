# External WORM Anchor — S3 Object Lock (Item 3)

Closes white-paper §8: *"a sufficiently privileged operator who can drop the whole
table or the signing key is outside this boundary; the highest-assurance posture adds
an external anchor (e.g., S3 Object Lock) behind the same interface."*

The S3 anchor writes **one immutable object per audit entry** to a bucket with Object
Lock in **COMPLIANCE** mode. Once written, an object cannot be deleted or overwritten
until its retain-until date passes — **not even by the AWS account root or the operator
who runs the gateway.** That is the property a regulator wants: the record is immutable
*outside* the database the application controls.

## Architecture

```
audit entry ─▶ AuditLogger ─▶ MultiAnchor ─┬─▶ DurableAuditStore  (Postgres WORM, operational)
              (signs HMAC)                  └─▶ S3ObjectLockAnchor (S3 Object Lock, external/immutable)
```

Both anchors satisfy the same `AuditAnchor` interface (`append(entry, seq)` /
`verify_chain(tenant_id)`), so they are swappable and stackable. `verify_chain()` on the
S3 anchor walks the continuous per-tenant chain and detects a deleted object (seq gap),
a broken `prev_hash` link, or modified content (HMAC mismatch) — the same guarantee as
the SQL mirror, against an independent immutable store.

- Object layout: `audit/{tenant_id}/{seq:020d}.json` (zero-padded → lexical = seq order).
- Each `put_object` uses `IfNoneMatch='*'` so a given seq is **write-once at the app
  layer too** — a replay can never replace an existing record.
- `append()` never raises into the request path; failures are logged
  (`s3_worm_append_failed`) so a broken anchor shows up in monitoring without dropping
  traffic. **Alert on that log line** — a silently failing anchor is the one risk here.

## One-time bucket setup

Object Lock **must be enabled at bucket creation** — it cannot be added to an existing
bucket. Versioning is required and is enabled automatically with Object Lock.

```bash
aws s3api create-bucket \
  --bucket clawwarden-audit-prod \
  --region us-east-1 \
  --object-lock-enabled-for-bucket

# Default retention so even a misconfigured writer gets a floor (7y = SEC 17a-4 / FINRA 4370)
aws s3api put-object-lock-configuration \
  --bucket clawwarden-audit-prod \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":2556}}}'

# Block all public access
aws s3api put-public-access-block --bucket clawwarden-audit-prod \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

> **COMPLIANCE vs GOVERNANCE:** use **COMPLIANCE**. In GOVERNANCE mode a user with
> `s3:BypassGovernanceRetention` can still delete — which defeats the insider-threat
> model this anchor exists for. COMPLIANCE cannot be bypassed by anyone, including root,
> until retention expires.

## Gateway configuration

| Env var | Meaning | Default |
|---|---|---|
| `AUDIT_S3_BUCKET` | Object-Lock bucket name. **Empty = anchor disabled** (Postgres mirror only). | `""` |
| `AUDIT_S3_PREFIX` | Key prefix. | `audit` |
| `AUDIT_S3_RETENTION_DAYS` | Per-object retain-until window. | `2556` (7y) |
| `AUDIT_S3_REGION` | AWS region. | account default |
| `AUDIT_S3_ENDPOINT_URL` | Custom endpoint for MinIO / LocalStack. Empty for AWS. | `""` |

Credentials come from the **standard AWS chain** — attach an IAM role to the gateway
task/instance. **Never** put keys in env files or config; the repo `.gitignore` blocks
`*.key`/`*.pem` but the real control is using an instance/role identity.

## IAM posture (least privilege)

The gateway identity needs **put + read + list, but NOT delete**, and must not be able
to weaken Object Lock. Delete being absent from the policy is defense-in-depth; Object
Lock COMPLIANCE is the actual enforcement.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AppendAndVerifyAuditAnchor",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::clawwarden-audit-prod",
        "arn:aws:s3:::clawwarden-audit-prod/*"
      ]
    },
    {
      "Sid": "DenyWeakeningTheLock",
      "Effect": "Deny",
      "Action": [
        "s3:PutObjectRetention",
        "s3:PutObjectLegalHold",
        "s3:PutBucketObjectLockConfiguration",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:BypassGovernanceRetention"
      ],
      "Resource": ["arn:aws:s3:::clawwarden-audit-prod/*"]
    }
  ]
}
```

## Legal hold (litigation / investigation)

A legal hold pins objects regardless of retain-until — apply it from a **separate
admin/legal identity**, not the gateway role:

```bash
aws s3api put-object-legal-hold --bucket clawwarden-audit-prod \
  --key audit/default/00000000000000000042.json \
  --legal-hold Status=ON
```

## Verifying the anchor

```python
res = await audit_log.verify_durable()   # MultiAnchor verifies BOTH backends
# {"ok": True/False, "entries": N, "first_bad": idx, "error": ..., "anchors": {...}}
# On failure, res["anchor"] names which backend diverged.
```

## Testing

- Unit/contract: `tests/test_s3_worm_anchor.py` models COMPLIANCE-mode semantics
  (write-once, delete/overwrite rejected within retention) and proves verification
  catches deletion and content tampering, plus MultiAnchor fan-out.
- Real backend (opt-in): set `S3_TEST_ENDPOINT` + `S3_TEST_BUCKET` (a MinIO/LocalStack
  bucket with Object Lock) to run `test_real_s3_object_lock_rejects_delete`, which proves
  the live backend rejects a delete. Skipped in CI by default.

## Residual / honest caveats

- COMPLIANCE retention is finite. After retain-until, deletion becomes possible — set
  the window to your full regulatory retention (7y default) and renew/legal-hold for
  anything under investigation.
- A tamper that somehow bypassed Object Lock (e.g. a bucket misconfigured to GOVERNANCE)
  is still **caught by `verify_chain()`** (hash mismatch / seq gap) — the HMAC chain is
  the second line of defense behind the lock.
- The anchor is best-effort on the write path (never blocks a request); the durable
  guarantee depends on `s3_worm_append_failed` being alerted on, not ignored.
