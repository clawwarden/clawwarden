# @clawwarden/finsafe-core

Runtime AI-safety detectors for the OWASP LLM Top 10 — **open interfaces + reference heuristics**.

> Pre-release: not yet on npm. Install from source: `git clone` the repo, then
> `npm install && npm run build` and import from this workspace package.

```ts
import { DetectorRegistry, referenceDetectors, assessRisk } from '@clawwarden/finsafe-core';

const registry = new DetectorRegistry(referenceDetectors());

// Screen a prompt before it reaches the model
const findings = await registry.scan({ phase: 'input', text: userPrompt });
const risk = assessRisk(findings);
if (risk.level === 'high' || risk.level === 'critical') {
  block(risk); // your policy
}

// Screen the completion before returning it to the user
const out = await registry.scan({ phase: 'output', text: completion });
```

## What's included

| Detector | Category | Phase | OWASP |
|---|---|---|---|
| `InjectionDetector` | `prompt_injection` | input | LLM01 |
| `PiiLeakageDetector` | `pii_leakage` | input/output | LLM06 |
| `JailbreakDetector` | `jailbreak` | input | — |

These are **heuristic baselines**, intentionally simple and transparent. They give you a working
guardrail today and a stable `Detector` interface to build on.

## Bring your own detector

```ts
import type { Detector, Finding, ScanContext } from '@clawwarden/finsafe-core';

class MyDetector implements Detector {
  readonly id = 'acme.custom';
  readonly category = 'prompt_injection';
  readonly phases = ['input'] as const;
  scan(ctx: ScanContext): Finding[] { /* ... */ return []; }
}

registry.register(new MyDetector());
```

## Open source

a custom detectors (tuned/ML detection, per-model **risk tiers**, weighted
**model-risk scoring**) implement this exact `Detector` interface. Swap them in without changing
your integration code.

Apache-2.0.
