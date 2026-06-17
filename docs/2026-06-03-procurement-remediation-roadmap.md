# Procurement Remediation Roadmap

**Context:** A simulated CIO/CTO procurement evaluation of clawwarden.space praised the
*technology* (three-plane architecture, reversible tokenization, hash-chained WORM
audit, <8 ms latency, open source) but issued a **rejection of the commercial tiers**
on **trust, legal, and operational** grounds — not technical ones. It pegged
willingness-to-pay at **$85k–$130k/yr** for an on-prem enterprise license *once the
corporate gaps close*. This document turns each finding into an owned action.

Legend — Owner: **F** = founder (real-world/legal), **E** = engineering (buildable).

## Status snapshot (2026-06-03)

The review was written against the pre-overhaul site. Verified live today:
`/`, `/pricing`, `/compliance`, `/privacy`, `/terms`, `/security`, `/about`,
`/tokenize` all return **200**. The "catastrophic broken-pages" finding is **resolved**.

## Findings → actions

| # | Finding | Owner | Action | Status |
|---|---------|-------|--------|--------|
| 1 | Broken /pricing /compliance /privacy /terms | E | Rebuilt + deployed | ✅ Done |
| 2 | "Claims SOC 2 but no report" | E/F | `/compliance` now claims no certs it lacks; SOC 2 marked *in progress* | ✅ Honest copy / ⏳ real audit = F |
| 3 | Corporate anonymity (no entity/founders/address) | F→E | Add real entity, leadership, registered address; E wires into site once provided | ⏳ needs F data |
| 4 | **Brand collision** ("ClawWarden" × 5 incl. £127M UK bank JV) | F | Choose a clearable name; run USPTO + EUIPO + domain clearance; rebrand | 🔴 decision pending |
| 5 | No SOC 2 Type II report | F | Engage auditor (e.g., Vanta/Drata + CPA firm); 3–6 mo Type II window | ⏳ |
| 6 | No DPA / binding privacy terms | F (legal) + E | Draft DPA template; link "DPA on request"; E adds the request flow | ⏳ |
| 7 | No SLAs / incident escalation / phone | F | Define SLA tiers + support channels + escalation matrix | ⏳ |
| 8 | No case studies / references | F | Land 1–2 design partners; publish anonymized results | ⏳ |
| 9 | No disaster-recovery / HA docs | E+F | Document HA topology, RPO/RTO, failover, backup of token vault | ⏳ E can draft from real infra |
| 10 | Broken contract pathway | E | Real contact/demo flow (not just mailto) | ⏳ building now |
| 11 | Key-man risk (single dev?) | F | Show team/advisors; or be transparent about stage | ⏳ |

## What honesty buys us (do NOT fabricate)

The reviewer is a bank — a *discovered* fake (fake SOC 2 badge, fake customers, fake
address) is fatal, worse than an honest gap. The credibility wedge the reviewer
**already endorsed** is the **open-source, self-host path** (Apache-2.0, auditable,
runs inside the bank's perimeter, no vendor data risk). Lean into it:

- Position OSS self-host as the *primary* enterprise on-ramp; hosted SaaS is secondary.
- A **Trust Center** that states the real posture plainly (audit status, data
  residency, disclosure policy) beats trust theater.

## Recommended sequence

1. **Name + trademark** (#4) — gates the brand; do first (see naming note below).
2. **Incorporate** a US (Delaware C-corp) or EU entity (#3) — unblocks contracts/DPA.
3. **Trust Center + Company/Contact** on site (#3, #10) — *buildable now* (this round).
4. **DPA + SLA templates** (#6, #7) — legal, in parallel.
5. **SOC 2 Type II** (#5) — start the clock early; longest pole.
6. **Design partners** (#8) — the open-source sandbox path the reviewer authorized is
   the natural top-of-funnel.

## Naming note (#4)

Vetted candidates were mostly taken (Attestra, Tesserai, Veritrail=MS Research).
Strategy: pick an **abstract, metaphor-driven coined name** (cf. Okta, Vercel, Snyk),
avoid the saturated `vault/guard/secure/trust/attest/redact/veri` roots, then clear
formally. Starter directions oriented to the product's "selectively-permeable
boundary" (PII blocked, analytics pass) and "provenance/ledger" ideas:

- **Permia** (permeable + permission) · **Membra** / **Osmote** (selective membrane)
- **Provenra** (provenance; cleanest web signal so far)
- **Cendra** / **Obvera** (abstract, brandable)

⛔ None are cleared — run **USPTO TESS + EUIPO + domain (.com/.ai) + GitHub org + npm
scope** checks on the 1–2 finalists before committing. This is a founder/legal call.
