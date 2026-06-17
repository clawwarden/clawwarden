# ClawWarden Roadmap

ClawWarden is fully open source (Apache-2.0). This is a living roadmap — open an
issue or discussion to propose changes. Items are not commitments or dates.

## Now (v0.1.x)
- Hardening + docs for the self-host path (one-command `docker compose up`).
- Expand the PII eval corpus beyond the seed set (multi-domain, thousands of
  examples) and publish recall/precision per domain — see [docs/eval/](./docs/eval/).
- Tighten DATE_TIME precision (NER over-tags temporal words) without losing recall.

## Next
- First-class S3 Object Lock adapter for the durable audit anchor (alongside the
  append-only Postgres mirror that ships today).
- Evidence-pack export (verified chain + control coverage + linked artifacts) over a date range.
- Streaming responses through the tokenize/detokenize path.
- More built-in entity recognizers and a plug-in detector/classifier registry.

## Later
- Optional managed/HA deployment guides (Postgres replication, PgBouncer).
- SSO/OIDC end-to-end example.
- Benchmarks: latency + leak-rate dashboards.

## Good first issues
Look for the `good first issue` label. New recognizers, docs, examples, and test
coverage are great places to start.
