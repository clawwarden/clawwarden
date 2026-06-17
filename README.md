<div align="center">

# ClawWarden

### Run any LLM on sensitive data — without the model ever seeing real PII. And prove it.

ClawWarden is a self-hosted proxy that sits between your people and any LLM. It
**tokenizes every personal identifier before a prompt leaves your network**
(`Jane Smith` → `{{PERSON_1}}`), restores it per-role on the way back, and writes
a **hash-chained, tamper-evident audit log** of every request.

Fully open source. No paid tier, no locked features, no telemetry. Bring your own
API key or run a local model — you hold the keys and the data.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![CI](https://github.com/clawwarden/clawwarden/actions/workflows/ci.yml/badge.svg)](https://github.com/clawwarden/clawwarden/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[Quickstart](#quickstart) · [How it works](#how-it-works) · [Why](#why) · [Layout](#repo-layout) · [Contributing](#contributing)

</div>

---

## Quickstart

```bash
git clone https://github.com/clawwarden/clawwarden && cd clawwarden

# Start the gateway + Redis (the data + trust planes)
docker compose up --build          # gateway on http://localhost:8000

# Run the web console
cd apps/web && npm install && npm run dev   # http://localhost:3000
```

Open the console, pick a provider — **Ollama (local)**, **OpenAI**, or **Anthropic**
(your key) — and chat over sensitive data. PII is tokenized on the way out and
restored per your role on the way back. Every request is in the audit log.

**Library only?**

```python
# pip install clawwarden   (packages/classifier)
from clawwarden import Classifier, RegexNerPipeline
Classifier(pipeline=RegexNerPipeline()).classify(
    "Wire $42,500 to Jane Smith, SSN 123-45-6789"
).sensitivity            # -> "restricted"
```

```ts
// npm i @clawwarden/finsafe-core
import { DetectorRegistry, referenceDetectors } from '@clawwarden/finsafe-core';
const findings = await new DetectorRegistry(referenceDetectors()).scan({ phase: 'input', text });
```

## How it works

```
  prompt with PII ─▶  classify + reversibly tokenize  ─┐
                      (model sees {{PERSON_1}}, never   │ hash-chained, append-only
                       Jane Smith)                      ▼  + durable WORM mirror
                                              ┌──────────────────────┐
                                              │  tamper-evident audit │  verify_chain()
                                              └──────────────────────┘
  response ◀─ role-aware detokenize ◀── LLM ◀─ tokenized prompt
```

- **Fail-safe:** if PII detection errors, the request is **blocked** — never sent in the clear.
- **Analytics-safe:** balances, scores, rates, dates stay intact; only direct identifiers are tokenized.
- **Tamper-evident:** any edit, reorder, deletion — even of a whole day — breaks the chain and is detectable. On Postgres the audit table is append-only (WORM).
- **Measured:** on the labeled eval corpus the NER pipeline hits **100% recall, 0% residual leak** ([docs/eval/](./docs/eval/)).
- **OWASP LLM Top 10:** input prompt-injection guard (LLM01), output sanitization (LLM02), PII tokenization + secret log-scrubbing (LLM06) — see [docs/OWASP-LLM-mapping.md](./docs/OWASP-LLM-mapping.md).

## Why

Your team is pasting customer data into ChatGPT. Banning it doesn't work. What you
need is a proxy that strips PII before the prompt leaves the machine, restores it
after, transparently, with a record a regulator will accept. That's ClawWarden —
and because it's self-hosted and fully open, there's no vendor data risk and
nothing to buy.

## Repo layout

```
apps/
  gateway/      FastAPI PII-tokenizing LLM proxy (Presidio + spaCy) + hash-chained audit  (Python)
  web/          Next.js console + site                                                    (TypeScript)
packages/
  finsafe-core/ Detector interface + reference injection / PII-leak / jailbreak heuristics (TS)
  integrations/ OpenTelemetry · Prometheus · Datadog · SIEM · OIDC adapters                (TS)
  classifier/   Python pkg `clawwarden`: Classifier + regex/NER pipeline + governance client
sdk/typescript/ Thin client (@clawwarden/sdk)
contracts/      OpenAPI + JSON-Schema for the Governance Service
docs/  examples/   docker-compose.yml
```

Bring your own detector or classifier: both are interfaces with a reference
implementation — drop in a tuned/ML pipeline behind the same contract.

## Contributing

PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md), the [ROADMAP](./ROADMAP.md),
and the **good first issues**. Security: [SECURITY.md](./SECURITY.md).

## License

[Apache-2.0](./LICENSE) — free for any use, including commercial. See [NOTICE](./NOTICE).
