# ClawWarden — Production-Readiness Roadmap

The CIO/CTO buyer review landed on **conditional go (pilot) / no-go (production-of-record)**.
Five gaps stand between "promising 0.1" and "deployable for a regulated production system."
Each item below has concrete steps and a **Definition of Done (DoD)** — the bar that flips
that specific no-go to go.

> **Sequencing:** Item 1 (corpus) is the critical path for both chairs — start it first and
> in parallel with everything else, because it takes the longest (real-world data takes time
> to gather from design partners). Items 2, 3, 5 are engineering/process work that can run
> alongside. Item 4 is a business track (`/founder:sell`), not code.

---

## 1. Production-scale eval corpus  *(biggest blocker — both chairs)*

**Why:** 100% recall / 0% leak on "tens of examples" tells a buyer nothing about their
traffic. This claim is currently a liability, not an asset. It becomes the asset the moment
the numbers hold on a large, multi-domain, reproducible corpus.

**Steps:**
1. **Set the target.** Define scale + coverage up front, e.g. **≥5,000 labeled spans** across
   ≥4 domains (consumer lending, healthcare intake, insurance claims, support transcripts),
   every one of the 9 entity types represented, including the hard ones (PERSON, DATE_OF_BIRTH).
2. **Source data without touching real customer PII:**
   - *Synthetic* — Faker / seeded generators + LLM-generated records with known injected
     identifiers (you hold the gold labels by construction). Committable.
   - *Public* — relevant open datasets re-annotated to the harness schema. Committable.
   - *Design-partner real data* — **never leaves their network.** Ship them the harness; they
     run it locally; **only the aggregate metrics come back**, never the raw corpus. (This is
     the corpus your CIO sale depends on, and the reason the design-partner outreach matters.)
3. **Label to a fixed schema.** Span-level gold labels matching `apps/gateway/eval/`'s format.
   Double-annotate a sample; report inter-annotator agreement so the labels are trustworthy.
4. **Extend the harness.** Per-domain *and* per-entity recall / precision / **residual-leak
   rate**, not just micro-average. Keep the regex-vs-NER contrast as a baseline.
5. **Publish a corpus card** in `docs/eval/`: size, provenance, license, domain mix, known
   gaps — so the numbers are auditable, like the white paper's honesty demands.
6. **Set an SLO and gate CI.** Pick a target (e.g. **residual-leak < 0.1% per entity type**)
   and fail the build if a regression breaks it.

**DoD:** ≥5k spans, ≥4 domains, per-domain published numbers, a leak SLO that CI enforces, and
a corpus card. Real-PII corpora are **gitignored**, never committed.

---

## 2. HA + DR runbook  *(CTO blocker)*

**Why:** Redis holds the token↔value vault. Redis down → every request fail-closes → org-wide
LLM access dies. Key loss → permanent loss of detokenization *and* an unverifiable audit chain.
No documented recovery = no production sign-off.

**Steps:**
1. **Write the failure-mode table:** Redis unavailable, vault data loss, signing-key loss,
   detector crash. For each: blast radius + recovery action + RTO/RPO.
2. **Redis durability + HA:** enable AOF (`appendfsync everysec`), run primary + replica with
   Sentinel *or* a managed Redis; **encrypted backups with a tested restore** (a backup you've
   never restored is a guess).
3. **Key lifecycle runbook:** MultiFernet rotation procedure (add new key, re-wrap, retire old);
   back the keys with a KMS/HSM, **not** a file on the box; state plainly that lost keys = lost
   detokenization (this is by design and must be operationally guarded).
4. **Prove fail-closed under outage:** add a test/drill confirming that with the vault down,
   requests **block (422)** and never fall back to sending clear text.
5. **DR drill checklist** with target RTO/RPO; run it once and record the result.

**DoD:** runbook committed, one rehearsed restore drill on record, RTO/RPO stated, fail-closed-
under-outage proven by test.

---

## 3. Ship the external WORM anchor (S3 Object Lock)  *(CIO defensibility)*

**Why:** Today's append-only Postgres trigger is write-once *within the DB* — a privileged
operator who drops the table or the key is outside the boundary (white paper §8). For a
regulator-facing control, "on the roadmap" isn't shippable; it has to exist.

**Steps:**
1. **Define the anchor interface** (the paper already promises "behind the same interface") —
   a small writer/verifier contract so Postgres-WORM and S3-Object-Lock are swappable.
2. **Implement an S3 Object Lock writer** in *compliance mode*: mirror each entry (or a periodic
   signed chain checkpoint) to a bucket with a retention period + legal-hold support.
3. **Extend `verify_chain()`** to validate the local chain against the external anchor and report
   the first divergence.
4. **Document** retention config, legal-hold workflow, and the IAM posture (the writer can put
   but not delete; Object Lock enforces immutability even against root).
5. **Prove immutability with a test:** attempt update/delete of an anchored object → rejected.

**DoD:** adapter shipped behind the interface, integration test demonstrating an anchored record
cannot be mutated/deleted, retention/legal-hold documented.

---

## 4. Commercial / support path  *(CIO board requirement — business, not code)*

**Why:** "Who do we call at 3am, and who's accountable if it leaks?" Open-source-only answers
"us," which most risk committees won't accept. A throat to choke unblocks the enterprise sale —
and is your revenue motion. **Core stays Apache-2.0; the assurance wraps it.**

**Steps:**
1. **Draw the open-core line:** what is free forever (the proxy, detection, audit core) vs. paid
   (support SLA, managed/HA deployment, compliance evidence-pack export, SSO/OIDC, priority fixes).
2. **Stand up the commercial entity + artifacts:** support contract template, an SLA document
   (response/resolution targets by severity), a security contact.
3. **Price on a value metric** — audited requests, protected entities, or seats — not on cost.
4. **Package three tiers** (community / supported / enterprise-managed) with the middle as the
   obvious pick.

**DoD:** a published support/commercial offering exists (even minimal), so a buyer can point to a
named accountable party. **Run this through `/founder:sell`** — pricing, packaging, and the paywall
are that command's job.

---

## 5. Independent assessment  *(CIO risk-committee blocker)*

**Why:** "The code is public" ≠ independently attested. A risk committee wants a third party to
have looked, especially at the cryptographic audit construction the whole pitch rests on.

**Steps:**
1. **Scope two things:** (a) a pen test of the gateway + console, (b) a focused cryptographic
   review of the hash-chain / high-water-mark / WORM construction.
2. **Engage a reputable assessor** (CREST-accredited or an established appsec firm); for the
   crypto review consider an academic or specialist.
3. **Remediate**, then re-test criticals/highs to closed.
4. **Publish a public summary** (scope, date, that criticals were fixed) — the **full report stays
   confidential and gitignored**, only the attestation summary ships.
5. **Plot the path to SOC 2 Type II** for the managed offering (item 4), once that exists.

**DoD:** third-party report received, all criticals/highs remediated, a public summary published,
SOC 2 path defined.

---

## Tracking

| # | Gap | Owner track | Flips | DoD signal |
|---|---|---|---|---|
| 1 | Production-scale eval corpus | Eng + design partners | CTO **and** CIO | ≥5k spans, multi-domain, CI-gated leak SLO |
| 2 | HA + DR runbook | Eng/Ops | CTO | rehearsed restore drill + RTO/RPO |
| 3 | External WORM anchor (S3 Object Lock) | Eng | CIO | immutability integration test passes |
| 4 | Commercial / support path | Business (`/founder:sell`) | CIO | published support offering + accountable entity |
| 5 | Independent assessment | Security | CIO | third-party report + public summary |

When 1–3 + 5 are done and 4 exists, the verdict flips to **GO for production-of-record.**
Items 1 and 4 are also the bridge between the open-source launch and revenue: pilots feed the
corpus (1), demand feeds the paid tier (4).
