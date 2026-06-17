# Architecture

ClawWarden is **AI trust infrastructure** for regulated enterprises, organized as three planes around
one shared trust fabric.

```
   data INTO models ─▶  CLAWWARDEN (input governance)
                         classify + tokenize PII/MNPI before any prompt leaves your network
                                    │
                                    │  audit + evidence
                          ┌─────────▼──────────┐
                          │ GOVERNANCE SERVICE  │   the shared trust fabric (contracts/)
                          │  · policy versions  │
                          │  · immutable audit  │   hash-chained, WORM
                          │  · approvals / SoD  │
                          │  · evidence packs   │
                          └─────────▲──────────┘
                                    │  verdicts + findings
   behaviour OUT of models ─▶ AGENTGUARD + FIN-SAFE (runtime + safety)
                         monitor calls/cost/verdicts; detect injection, leakage, jailbreaks
```

## The planes

### ClawWarden — input governance
Keeps regulated data out of model prompts. The open `clawwarden` Python package provides the
`Classifier` interface and a reference regex/NER pipeline; the proprietary semantic model and BFSI
taxonomy plug in behind the same interface.

### AgentGuard + FIN-SAFE — runtime monitoring & safety
Watches what models *do*. `clawwarden-finsafe-core` provides the `Detector` interface and reference
heuristics (prompt injection, PII leakage, jailbreak); tuned detectors and model-risk scoring are
proprietary.

### Governance Service — the trust fabric
The system of record for *what the rules were, who changed them, why something was blocked, and what
evidence proves it*. Defined by `contracts/` (OpenAPI + JSON-Schema). Key property: the audit log is
**append-only and hash-chained** — tamper-evident by construction.

## Data flow (a governed request)

1. **Classify** the prompt (`clawwarden`) → sensitivity + entities.
2. **Tokenize** restricted data so the LLM never sees raw PII.
3. **Screen** input with FIN-SAFE detectors (`clawwarden-finsafe-core`).
4. Call the model; **screen** the output for leakage.
5. **Detokenize** for authorized roles only.
6. Emit **audit + evidence** to the Governance Service via the SDKs.

## Observability & IAM

`clawwarden-integrations` provides OpenTelemetry, Prometheus, Datadog, SIEM (syslog/Splunk HEC), and
OIDC adapters so the stack plugs into existing enterprise tooling.

See [plugging-in-the-core.md](./plugging-in-the-core.md) for how the proprietary providers attach.
