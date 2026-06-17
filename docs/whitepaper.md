# ClawWarden: Provable Data Minimization and Tamper-Evident Accountability for LLM Usage

**A technical white paper.** Version 0.1 · 2026 · Apache-2.0 · <https://clawwarden.space>

---

## Abstract

Organizations that handle regulated data want to use large language models (LLMs)
but cannot let those models — or the third parties that host them — see personal
identifiers, and must be able to prove to a regulator what was sent and that the
record was not altered. ClawWarden is a self-hosted proxy that addresses both
needs with two cooperating planes: a **data plane** that reversibly and
deterministically tokenizes personal identifiers before any prompt leaves the
network, and a **trust plane** that records every request in a hash-chained,
tamper-evident audit log with a durable append-only anchor. The model sees
`{{PERSON_1}}`, never `Jane Smith`; analytics values are preserved; and the audit
chain detects any edit, reorder, or deletion — including of a whole day. On a
labeled evaluation corpus the NER pipeline reached 100% recall with a 0%
residual-PII-leak rate. This paper describes the threat model, the tokenization
and audit constructions, the evaluation, and the limitations.

## 1. Problem and stakes

Analysts paste customer data into chatbots. Agents act on records no one reviewed.
When a regulator asks "show me this control worked," there is often nothing to hand
over. Three forces collide:

- **Adoption pressure.** LLMs are too useful to ban; prohibition just moves usage to
  unmanaged tools (personal accounts, phones).
- **Data-residency and confidentiality.** For GLBA (Safeguards Rule), GDPR (Art. 25,
  data protection by design), and CCPA, sending raw PII to a third-party model is a
  reportable risk — and many providers retain or train on inputs.
- **Accountability.** Even when data is protected, institutions must *demonstrate*
  it: a record of what was sent, by whom, under which policy, that cannot be quietly
  rewritten.

The cost of getting this wrong is concrete: a single SSN reaching an external model
is the exact event these controls exist to prevent.

## 2. Why existing approaches fall short

| Approach | Gap |
|---|---|
| **Block / DLP** (refuse prompts containing PII) | Destroys utility — analysts can't run portfolio analytics; drives shadow usage. |
| **Trust the provider** (DPA + "we don't train on you") | Contractual, not technical; the raw PII still leaves your boundary. |
| **Output-only redaction** | Too late — the model already received the PII on the way in. |
| **Irreversible masking** | Loses the join key, so `{{PERSON_1}}` can't be tied back to the record; analytics break. |
| **Plain append-only logs** | Not tamper-evident — an insider with database access can rewrite or delete records, and nothing detects it. |

The missing piece is a control that (a) removes PII *before transmission* while
*preserving analytic utility and reversibility*, and (b) produces a record whose
integrity can be *verified*, not merely asserted.

## 3. Approach: two planes

```
   prompt with PII ─▶  DATA PLANE  ─────────────────────────────┐
                       classify → reversibly tokenize           │ every step
                       (model sees {{PERSON_1}}, never a name)   │ recorded
                                                       ┌─────────▼──────────┐
                                                       │   TRUST PLANE       │
                                                       │  hash-chained audit │  verify_chain()
                                                       │  + WORM mirror      │
                                                       └─────────▲──────────┘
   response ◀─ role-aware detokenize ◀── LLM ◀─ tokenized prompt ┘
```

**Thesis.** Treat the model provider as untrusted. Minimize what crosses the
boundary to non-identifying tokens, keep the mapping under your own keys so the
work stays reversible and analytic, and make the record of every decision
*verifiable* rather than trusted.

## 4. The data plane: reversible, deterministic tokenization

**Detection.** Incoming text is scanned in-memory by Microsoft Presidio + spaCy NER
with custom recognizers for financial identifiers, covering nine entity types
(PERSON, SSN, ACCOUNT_NUMBER, ROUTING_NUMBER, LOAN_ID, EMAIL, PHONE, DATE_OF_BIRTH,
CREDIT_CARD) on top of Presidio's built-in catalog. Overlapping spans are
de-duplicated by confidence.

**Deterministic tokenization.** Each detected value is replaced by a stable token
`{{TYPE_n}}`. A session-scoped hash of `(session, type, value)` guarantees the *same
identifier maps to the same token across every record*, so a model can run analytics
over thousands of rows ("which borrowers are delinquent?") using tokens as primary
keys — without ever seeing a real name or SSN. Token minting is atomic
(`SET NX`) so concurrent requests cannot mint two tokens for one value.

**Analytics preserved.** Financial variables — balances, credit scores, interest
rates, days-past-due — are deliberately *not* tokenized, because they are not direct
identifiers and the model needs them to compute. Privacy that destroys the numbers
is not useful; ClawWarden redacts identifiers and keeps the math.

**Reversible, under your keys.** The token↔value vault is encrypted at rest with
Fernet (AES-128-CBC + HMAC-SHA256) and MultiFernet key rotation, in self-hosted
Redis. Keys never leave your network.

**Role-aware detokenization.** On the response, tokens are restored only for entity
types the caller's role permits — a junior analyst sees tokens, a senior analyst
sees names, a risk officer sees full PII — enforced at the gateway, not the
application.

**Fail-closed.** If detection errors for any reason, the request is **blocked**
(HTTP 422), never forwarded in the clear. The default protects the institution.

## 5. The trust plane: tamper-evident audit

Every security-relevant event (PII detected, chat request, detokenization, auth
failure, injection blocked) is appended to a hash chain:

- `entry_hash = HMAC-SHA256(key, canonical_json(entry without entry_hash))`
- `prev_hash` = the previous entry's `entry_hash`, forming a chain where **any edit
  or reorder breaks every subsequent hash**.

Three constructions harden it against the realistic attacker — an insider with
storage access:

1. **Cross-day chaining.** Entries link to a *continuous per-tenant chain tip*, not a
   per-day genesis, so deleting an entire day's records breaks the next day's link.
2. **Signed high-water mark.** A per-day `HMAC(seq, last_hash)` detects truncation —
   deleting trailing entries leaves a shorter chain that no longer matches the
   signed count, and the mark cannot be forged without the key.
3. **Durable WORM anchor.** Each entry is mirrored to an append-only SQL table. On
   PostgreSQL an `UPDATE`/`DELETE` trigger rejects any mutation, making the table
   genuinely write-once; `verify_chain()` walks the continuous chain and reports the
   first broken link or missing sequence number.

The result is a record an institution can *prove* was not altered, rather than ask a
regulator to take on trust.

## 6. Runtime safety (OWASP LLM Top 10)

ClawWarden maps its runtime middleware to the OWASP Top 10 for LLM Applications
(full mapping with file + test references in [OWASP-LLM-mapping.md](./OWASP-LLM-mapping.md)):

- **LLM01 — Prompt Injection.** Every user message is inspected for
  instruction-override / jailbreak / prompt-extraction markers *before* it is
  tokenized or forwarded, and blocked at or above a configurable severity.
- **LLM02 — Insecure Output Handling.** Model output is sanitized before return —
  script/iframe stripping, `javascript:`/`data:` URI defanging, markdown image
  beacon removal — so a downstream consumer can't be pivoted through the response.
- **LLM06 — Sensitive Information Disclosure.** The tokenization above, plus an
  entropy + regex log scrubber that redacts credentials and PII from every log line
  before it is emitted.

## 7. Evaluation

We evaluate detection against a labeled corpus (offline harness in
[`apps/gateway/eval/`](../apps/gateway/eval/); report in [docs/eval/](./eval/)),
using span-overlap matching per entity type. The headline metric is the
**residual-leak rate**: the fraction of labeled PII values that survive
tokenization and would reach the model.

| Pipeline | Micro recall | Residual-leak rate | Notes |
|---|--:|--:|---|
| **Full NER (Presidio + spaCy)** | **100%** | **0%** | PERSON / SSN / EMAIL / PHONE / CARD / ACCOUNT / ROUTING all 100% |
| Regex-only reference | 75% | 25% | misses PERSON and DATE — why the NER pipeline is the default |

Detection overhead was ~4 ms median / ~15 ms p95 per request on the evaluation set
(warm model). The regex/NER contrast is itself a result: lexical rules alone leak a
quarter of identifiers, which is why names and dates require NER.

## 8. Limitations and honest caveats

Strong claims deserve their boundaries:

- **Corpus size.** The published corpus is a scaffold (tens of examples). The 100%
  recall / 0% leak figures hold *on that set*; a production SLO requires a far larger,
  multi-domain corpus, which the harness is built to consume.
- **DATE_TIME precision.** The NER layer over-tags temporal words (e.g., "today") as
  dates — an over-redaction that can hurt analytics, not a leak. It is a tuning
  target, tracked in the eval report.
- **WORM residual.** The append-only Postgres trigger makes the table write-once
  *within the database*. A sufficiently privileged operator who can drop the whole
  table or the signing key is outside this boundary; the highest-assurance posture
  adds an external anchor (e.g., S3 Object Lock) behind the same interface.
- **Self-host responsibility.** ClawWarden secures the inference-time boundary; it is
  not a substitute for the operator's infrastructure security, key management, or
  legal/compliance counsel.

These are stated plainly because a security control whose limits are hidden is not
one a serious buyer should trust.

## 9. Implications

For a regulated team, ClawWarden changes the calculus of LLM adoption: you can run
any model — local (Ollama) or hosted (bring your own key) — on sensitive data with a
technical, not merely contractual, guarantee that raw identifiers never crossed your
boundary, and a verifiable record to show for it. Because it is self-hosted and fully
open source (Apache-2.0), there is no vendor data-residency fight and nothing to buy.

## 10. About

ClawWarden is open-source software under the Apache-2.0 license. The threat model,
detectors, audit construction, and evaluation are all public and inspectable — trust
infrastructure earns adoption by being verifiable.

- Code: <https://github.com/clawwarden/clawwarden>
- Install: `pip install clawwarden` · `docker compose up`
- Site: <https://clawwarden.space>
