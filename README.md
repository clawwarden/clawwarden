<div align="center">

# Vaultex

### Open-source AI Trust Infrastructure for regulated teams

**Use any LLM on sensitive data without the model ever seeing real PII — and prove it.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![CI](https://github.com/sammy995/vaultex/actions/workflows/ci.yml/badge.svg)](https://github.com/sammy995/vaultex/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[Quickstart](#-quickstart) · [Architecture](#-architecture) · [Monorepo layout](#-monorepo-layout) · [Open-core](#-open-core)

</div>

---

Vaultex is the **trust layer between your team and the LLMs it uses**. It has two planes:

- **Data plane** — a proxy that detects and **reversibly tokenizes** every personal identifier
  before a prompt leaves your network, then restores it (role-aware) on the response. The model
  sees `{{PERSON_1}}`, never `Jane Smith`.
- **Trust plane** — a **hash-chained, tamper-evident audit log** with role-based detokenization and
  exportable evidence, so you can show *what was sent, by whom, and that the record wasn't altered.*

Runs fully self-hosted. Bring a **local LLM (Ollama)** or **your own API key** — Vaultex never sees
your data or your keys, and there is nothing to pay.

## 🚀 Quickstart

```bash
git clone https://github.com/sammy995/vaultex && cd vaultex

# 1. Start the gateway + Redis (the data + trust planes)
docker compose up --build        # gateway on http://localhost:8000

# 2. Run the web console / site
cd apps/web && npm install && npm run dev   # http://localhost:3000
```

Point the console at the gateway, pick a provider (Ollama / OpenAI / Anthropic), and chat over
sensitive data — PII is tokenized on the way out and restored per your role on the way back.

Library-only? Install the open-core packages and build on the interfaces directly:

```python
from vaultex import Classifier, RegexNerPipeline      # packages/classifier
clf = Classifier(pipeline=RegexNerPipeline())
clf.classify("Wire $42,500 to Jane Smith, SSN 123-45-6789").sensitivity   # -> "restricted"
```

```ts
import { DetectorRegistry, referenceDetectors } from '@vaultex/finsafe-core'; // packages/finsafe-core
const findings = await new DetectorRegistry(referenceDetectors()).scan({ phase: 'input', text });
```

## 🏗 Architecture

```
  data INTO models ─▶  apps/gateway: classify + reversibly tokenize PII  ─┐
                                                                          │ hash-chained
                                                                ┌─────────▼─────────┐
                                                                │  tamper-evident   │
                                                                │  audit + evidence │
                                                                └─────────▲─────────┘
                                                                          │ role-aware detokenize
  response OUT of model ─▶  apps/gateway returns to apps/web console ──────┘
```

The proxy is **fail-safe**: if PII detection errors, the request is blocked, never sent in the clear.
The audit chain is **tamper-evident**: any edit, reorder, or truncation of the log is detectable via
`verify_chain()`. See [docs/architecture.md](./docs/architecture.md).

## 📦 Monorepo layout

```
apps/
  gateway/      FastAPI PII-tokenizing LLM proxy (Presidio + spaCy) + hash-chained audit   (Python)
  web/          Next.js console + site — deploys to Vercel (vaultex.space)                  (TypeScript)
packages/
  finsafe-core/ Detector interface + reference injection / PII-leak / jailbreak heuristics  (TS)
  integrations/ OpenTelemetry · Prometheus · Datadog · SIEM (syslog/HEC) · OIDC adapters    (TS)
  classifier/   Python pkg `vaultex`: Classifier interface + regex/NER pipeline + gov client
sdk/typescript/ Thin AgentGuard client (@vaultex/sdk)
contracts/      OpenAPI + JSON-Schema for the Governance Service (the wire contract)
docs/  examples/
docker-compose.yml   redis + gateway (one command)
```

- **TS workspaces** (`packages/*`, `sdk/*`): `npm ci && npm run build && npm test` from the root.
- **Gateway** (`apps/gateway`): `pip install -r requirements.txt && pytest`.
- **Web** (`apps/web`): standalone Next.js app; `npm install && npm run build`. Deploys on Vercel
  with the **project root set to `apps/web`**.

## 🛡 OWASP Top 10 for LLMs

Vaultex's runtime controls map directly to the OWASP Top 10 for LLM Applications.
Full mapping (control → file → test): [docs/OWASP-LLM-mapping.md](./docs/OWASP-LLM-mapping.md).

| OWASP risk | Vaultex control |
|---|---|
| **LLM01 — Prompt Injection** | Runtime input guardrail inspects every user message and blocks instruction-override / jailbreak / prompt-extraction at a configurable severity, before tokenize/forward. |
| **LLM02 — Insecure Output Handling** | Output sanitizer defangs script/iframe, `javascript:`/`data:` URIs, and markdown image beacons before the response is returned or passed downstream. |
| **LLM06 — Sensitive Information Disclosure** | Reversible PII tokenization (model never sees raw PII) + role-aware detokenization + entropy/regex log scrubber that redacts secrets before any log is emitted. |

All three fire tamper-evident audit events; heuristics are an open reference baseline.

## 🔓 Open-core

Vaultex is **open-core** (Apache-2.0). This repo is everything you need to run, integrate, and extend
the data + trust planes with the reference detectors/classifier. The proprietary layer — tuned
detectors, the BFSI risk taxonomy, model-risk scoring, and managed compliance evidence — plugs in
behind the same interfaces. You can run the open reference implementations standalone forever.

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Security issues: [SECURITY.md](./SECURITY.md).

## 📄 License

[Apache-2.0](./LICENSE) © Vaultex. The proprietary core is licensed separately.
