# Vaultex — repository map & coverage

_What lives where across the Vaultex GitHub repos, and which one ships to production._

> Snapshot date: 2026-06-15. Owner: `sammy995`. If repos move or merge, update this file.

## The three repos

| Repo | Visibility | Stack | Role | Deployed? |
|---|---|---|---|---|
| [`sammy995/vaultex`](https://github.com/sammy995/vaultex) | public | TypeScript + Python | **Open-core SDKs, wire contracts, reference detectors/classifier** | No — published as packages (npm/PyPI, pending) |
| [`sammy995/vaultex-core`](https://github.com/sammy995/vaultex-core) | public | Python (FastAPI) + TS | **The real product backend** — PII-tokenizing LLM proxy gateway (Presidio + spaCy) + a bundled `ui/` | Self-hosted (Docker / docker-compose) |
| [`sammy995/vaultex-web`](https://github.com/sammy995/vaultex-web) | private | Next.js 15 (App Router) + Tailwind | **Marketing site + console** (vaultex.space) | ✅ **Vercel** → project `vaultex` → https://vaultex.space |

**Deployed via Vercel = `vaultex-web`.** Vercel project name `vaultex`, production domain `vaultex.space`, Node 24.x.

## Lineage note (overlap)

`vaultex-web` is an **extracted, standalone copy of `vaultex-core/ui/`** — its `package.json` name is still `ui`, and the `app/` routes mirror `vaultex-core/ui/app/` almost 1:1 (`about`, `admin`, `chat`, `compliance`, `pricing`, `security`, `setup`, `tokenize`, `login`, `register`). The web repo is the cleaned, Vercel-linked front end; the core repo keeps the original `ui/` alongside the gateway for self-host/all-in-one dev.

Drift risk: two copies of the same Next.js front end. Decide one as source of truth (recommend `vaultex-web`) and have `vaultex-core/ui` either submodule it or be marked dev-only.

---

## Coverage — what each repo owns

### 1. `vaultex` (open-core libs) — *interfaces + reference impl, no product*
```
contracts/          OpenAPI 3.1 + JSON-Schema for the Governance Service (wire contract)
packages/
  finsafe-core/     Detector interface + reference injection / PII-leak / jailbreak heuristics (TS)
  integrations/     OpenTelemetry · Prometheus · Datadog · SIEM (syslog/HEC) · OIDC adapters (TS)
  classifier/       Python pkg `vaultex`: Classifier/Pipeline + regex-NER + GovernanceClient
sdk/typescript/     Thin AgentGuard client (@vaultex/sdk)
examples/ · docs/
```
Covers: the **public contract + reference baselines** others build on. No deployable service, no real model — proprietary tuned core plugs in behind these interfaces.

### 2. `vaultex-core` (product backend) — *the working proxy*
```
gateway/            FastAPI PII-tokenizing LLM proxy:
  tokenizer.py · detokenizer.py · llm_router.py   request flow (Presidio NER → tokenize → forward → detokenize)
  auth.py · rbac.py · users.py · revocation.py     authN/Z
  audit.py · governance_client.py                  audit trail + governance integration
  database.py · redis_store.py · secrets.py        persistence + secret mgmt
  config.py · models.py · main.py
ui/                 Bundled Next.js front end (origin of vaultex-web)
Dockerfile · Dockerfile.gateway · docker-compose.yml · requirements.txt
tests/ · docs/
```
Covers: the **actual data-plane** — intercept prompt → strip PII → forward to any LLM → restore on response, with audit trail. Self-hosted via Docker. This is where real tokenization runs (Microsoft Presidio + spaCy), not the regex placeholders in the open repo.

### 3. `vaultex-web` (site + console) — *the Vercel deployment*
```
app/
  page.tsx              landing (hero, demo, features, pricing, FAQ, waitlist)
  setup/                3-step gateway setup wizard
  chat/                 browser chat UI (needs local gateway @ localhost:8000)
  admin/                audit-log console (admin JWT + gateway)
  login/ · register/    auth pages (functional when gateway running)
  pricing/ security/ compliance/ trust/ about/ contact/ privacy/ terms/
  api/waitlist/route.ts waitlist endpoint
  tokenize/             tokenization demo panel
components/             ChatInterface · TokenizationPanel · ActivityLog · CsvUpload · SettingsPanel · SiteNav/Footer …
lib/                    api.ts · session.ts · tokenizer.ts
next.config.ts · tailwind/postcss
```
Covers: the **public face + thin console**. Marketing/compliance/pricing pages are static; the functional pages (`/chat`, `/admin`, `/login`, `/setup`) are clients that talk to a **`vaultex-core` gateway** — they need the backend running to do real work.

---

## How the three fit together

```
  vaultex (open-core)            vaultex-core (product backend)        vaultex-web (Vercel)
  ─────────────────              ──────────────────────────────        ────────────────────
  Detector/Classifier   ──impl──▶  gateway/ (Presidio tokenizer,   ◀──HTTP──  app/chat, /admin,
  interfaces + contracts            llm_router, audit, rbac)                   /setup, /login
  (the wire spec, SDKs)            runs as Docker service                     = static site + thin
                                   exposes /v1 (the contract)                 console hitting gateway
                                                                              @ vaultex.space
```

- `vaultex` defines the **shape** (OpenAPI `/v1/governance`, `Detector`/`Pipeline`/`GovernanceClient`).
- `vaultex-core` **implements** it as a deployable FastAPI service doing real PII tokenization.
- `vaultex-web` is the **front end** to that service, and the only piece on Vercel.

## Quick facts

- **Vercel-linked repo:** `vaultex-web` only. Project `vaultex` → `vaultex.space`.
- **Public:** `vaultex`, `vaultex-core`. **Private:** `vaultex-web`.
- **Real tokenization engine:** `vaultex-core/gateway` (Presidio + spaCy). The open repo's `classifier` is a regex reference placeholder by design.
- **Open-vs-proprietary seam:** open interfaces in `vaultex`; tuned detectors / BFSI taxonomy / governance internals live behind them (not in any public repo).
