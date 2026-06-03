<div align="center">

# Vaultex

### Open-source AI Trust Infrastructure for regulated enterprises

**Stop AI agents from becoming financial, operational, and compliance liabilities.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![CI](https://github.com/sammy995/vaultex/actions/workflows/ci.yml/badge.svg)](https://github.com/sammy995/vaultex/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[Quickstart](#-quickstart) · [Architecture](#-architecture) · [Packages](#-whats-in-this-repo) · [Open-core](#-open-core) · [Docs](./docs)

</div>

---

Vaultex is the **trust layer between your enterprise and the LLMs it uses**. It keeps regulated
data out of model prompts, watches agent behaviour at runtime, and produces the audit evidence a
bank's risk committee actually asks for.

This repository is the **open-source wedge** — the SDKs, the wire contracts, the integration
adapters, and the runtime-safety/classification *interfaces* you build on. The proprietary
risk intelligence (BFSI taxonomy, model-risk scoring, tuned detectors, the governance engine
internals) plugs in behind these interfaces. See [Open-core](#-open-core).

## The three planes

| Plane | What it does | Where |
|---|---|---|
| **Vaultex** — input governance | Tokenizes PII/MNPI before any prompt reaches an LLM; role-aware detokenization | `packages/classifier`, `sdk/python` |
| **AgentGuard** — runtime + FIN-SAFE | Monitors calls/cost/verdicts; detects prompt injection, PII leakage, jailbreaks | `packages/finsafe-core`, `sdk/typescript` |
| **Governance Service** — shared trust fabric | Policy versioning, immutable audit chain, approvals, evidence packs | `contracts/` |

## 🚀 Quickstart

> **Release status:** pre-1.0. Packages are **not yet on npm / PyPI** — install from
> source (below). Registry publishing is tracked in the issues.

```bash
# 1. Classify + tokenize sensitive data before it leaves your network (Python)
# From source (until PyPI publish):
git clone https://github.com/sammy995/vaultex && cd vaultex
pip install -e packages/classifier
```
```python
from vaultex import Classifier, RegexNerPipeline

clf = Classifier(pipeline=RegexNerPipeline())          # reference, open-source pipeline
result = clf.classify("Wire $42,500 to Jane Smith, SSN 123-45-6789")
print(result.sensitivity)        # -> "restricted"
print(result.entities)           # -> [PERSON, SSN, MONEY...]
```

```bash
# 2. Screen model I/O for runtime attacks (TypeScript)
# From source (until npm publish): npm install && npm run build, then import
# from the @vaultex/finsafe-core workspace package.
npm install && npm run build
```
```ts
import { DetectorRegistry, referenceDetectors } from '@vaultex/finsafe-core';

const registry = new DetectorRegistry(referenceDetectors());
const findings = await registry.scan({ phase: 'input', text: userPrompt });
if (findings.some(f => f.severity === 'high')) block();
```

See [`examples/`](./examples) for runnable end-to-end demos.

## 📦 What's in this repo

```
contracts/          OpenAPI + JSON-Schema for the Governance Service (the wire contract)
packages/
  integrations/     OpenTelemetry · Prometheus · Datadog · SIEM (syslog/HEC) · OIDC adapters  (TS)
  finsafe-core/     Detector interface + reference injection/PII-leak/jailbreak heuristics      (TS)
  classifier/       Python pkg `vaultex`: Classifier interface + regex/NER pipeline + gov client
sdk/
  typescript/       Thin AgentGuard client (@vaultex/sdk)
examples/           Quickstarts
docs/               Architecture, concepts, and how the proprietary core plugs in
```

## 🏗 Architecture

```
   data INTO models ─▶  Vaultex (classify + tokenize)  ─┐
                                                        │ audit + evidence
                                              ┌─────────▼─────────┐
                                              │ Governance Service │  (contracts/)
                                              │ versions · audit   │
                                              │ approvals · evidence│
                                              └─────────▲─────────┘
                                                        │ verdicts + findings
 behaviour OUT of models ─▶ AgentGuard + FIN-SAFE ──────┘
```

Full write-up in [`docs/architecture.md`](./docs/architecture.md).

## 🔓 Open-core

Vaultex is **open-core**. This repo (Apache-2.0) is everything you need to integrate and extend.
The proprietary layer — what makes the risk decisions *good* — is delivered separately and plugs in
behind the interfaces shipped here:

| Open (this repo) | Proprietary (Vaultex Cloud / Enterprise) |
|---|---|
| `Detector` / `Classifier` interfaces + reference heuristics | Tuned detectors, model-risk scoring & tiers |
| Integration adapters, SDKs, contracts | BFSI risk taxonomy, semantic sensitivity model |
| Reference governance client | Governance-engine internals, managed evidence/attestations |

You can run the open reference implementations standalone forever. Bring the proprietary providers
when you need bank-grade accuracy and managed compliance evidence.

## 🤝 Contributing

We love contributions — see [CONTRIBUTING.md](./CONTRIBUTING.md). Security issues:
[SECURITY.md](./SECURITY.md).

## 📄 License

[Apache-2.0](./LICENSE) © Vaultex. The proprietary core is licensed separately.
