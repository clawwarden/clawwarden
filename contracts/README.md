# Governance Service Contracts

The **language-neutral wire contract** for the ClawWarden Governance Service — the shared trust fabric
that records *what the rules were, who changed them, why something was blocked, and what evidence
proves it*.

Both planes mirror these contracts:

- **ClawWarden** (input governance, Python) — ships audit + evidence via `sdk/python`.
- **AgentGuard** (runtime + FIN-SAFE, TypeScript) — emits verdicts/findings via `sdk/typescript`.

## Files

- **`openapi.governance.yaml`** — OpenAPI 3.1 description of the governance HTTP surface
  (`/v1/governance/*` for stack clients via `x-api-key`; `/web/governance/*` for dashboards via JWT).
  Generate typed clients from this.
- **`schemas/governance.schema.json`** — JSON Schema (draft 2020-12) for the domain entities and
  request bodies.

## Conventions

- **Wire format is camelCase.**
- **Tenant scoping** on `/v1` is derived from the API key; clients never pass a tenant id in the body.
- **Audit immutability:** the audit surface is append + read + verify only. There is intentionally
  no update/delete for audit events (WORM, hash-chained).

## Stability

These contracts are versioned. A breaking change to any entity or endpoint is a major-version event
and must update the OpenAPI doc, the JSON Schema, and every dependent SDK together.
