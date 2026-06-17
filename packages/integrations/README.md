# @clawwarden/integrations

Observability & IAM adapters for the ClawWarden stack — **dependency-light** (pure formatters + thin
`fetch`-based exporters, so it adds almost nothing to your bundle).

```bash
npm install @clawwarden/integrations
```

## SIEM (Splunk / syslog)

```ts
import { formatSyslog, SplunkHecExporter } from '@clawwarden/integrations';

const line = formatSyslog({ eventType: 'pii_detected', severity: 'critical', message: 'SSN in prompt' });

const hec = new SplunkHecExporter({ url: process.env.SPLUNK_HEC_URL!, token: process.env.SPLUNK_HEC_TOKEN! });
await hec.export({ eventType: 'policy.enforced', severity: 'high', message: 'blocked', attributes: { agentId } });
```

## Prometheus `/metrics`

```ts
import { PrometheusRegistry } from '@clawwarden/integrations';
const metrics = new PrometheusRegistry();
metrics.inc('clawwarden_requests_total', { route: 'chat' });
res.type('text/plain').send(metrics.render());
```

## Datadog

```ts
import { DatadogExporter } from '@clawwarden/integrations';
const dd = new DatadogExporter({ apiKey: process.env.DD_API_KEY! });
await dd.export([{ name: 'clawwarden.latency_ms', value: 12, tags: { env: 'prod' } }]);
```

## OpenTelemetry

`buildResourceAttributes()` / `buildOtlpConfig()` produce config you feed to
`@opentelemetry/sdk-node` (kept as an optional peer so this package stays light).

## OIDC SSO

`discoveryUrl()` and `buildAuthorizationUrl()` for Okta / Entra ID / Auth0 authorization-code flow.

Apache-2.0.
