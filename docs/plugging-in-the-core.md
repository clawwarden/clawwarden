# Plugging in the proprietary core

Vaultex is **open-core**. Everything in this repo runs standalone with reference implementations.
The proprietary layer raises accuracy and adds managed compliance — and it attaches through the
**same interfaces** shipped here, so your integration code never changes.

## The seams

| Open interface (this repo) | Proprietary provider replaces |
|----------------------------|-------------------------------|
| `Detector` (`@vaultex/finsafe-core`) | Tuned/ML detectors, per-model **risk tiers**, weighted **model-risk scoring** |
| `Pipeline` (`vaultex` Python) | Semantic sensitivity model + **BFSI risk taxonomy** |
| Governance Service contracts (`contracts/`) | Managed governance engine, attestations, regulator evidence |

## Example: swap in a proprietary detector

```ts
import { DetectorRegistry } from '@vaultex/finsafe-core';
import { VaultexCloudDetectors } from '@vaultex/cloud'; // proprietary, licensed separately

const registry = new DetectorRegistry(VaultexCloudDetectors()); // same interface
```

## Example: swap in the semantic classifier

```python
from vaultex import Classifier
from vaultex_cloud import SemanticPipeline   # proprietary

clf = Classifier(pipeline=SemanticPipeline())  # same Pipeline protocol
```

## Wiring into your services

- **AgentGuard (TS app):** import `@vaultex/finsafe-core` in your gateway interceptor to screen
  input/output; export metrics/traces with `@vaultex/integrations`.
- **Vaultex gateway (Python):** use the `vaultex` `Classifier` before tokenization and the
  `GovernanceClient` to ship audit + evidence.

Because the boundary is interface-based, you can start on the open reference implementations and
adopt the proprietary providers later without refactoring.
