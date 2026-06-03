# @vaultex/integrations

Observability & IAM adapters for the Vaultex stack — **dependency-light** (pure formatters + thin
`fetch`-based exporters, so it adds almost nothing to your bundle).

```bash
npm install @vaultex/integrations
```

## SIEM (Splunk / syslog)

```ts
import { formatSyslog, SplunkHecExporter } from '@vaultex/integrations';

const line = formatSyslog({ eventType: 'pii_detected', severity: 'critical', message: 'SSN in prompt' });

const hec = new SplunkHecExporter({ url: process.env.SPLUNK_HEC_URL!, token: process.env.SPLUNK_HEC_TOKEN! });
await hec.export({ eventType: 'policy.enforced', severity: 'high', message: 'blocked', attributes: { agentId } });
```

## Prometheus `/metrics`

```ts
import { PrometheusRegistry } from '@vaultex/integrations';
const metrics = new PrometheusRegistry();
metrics.inc('vaultex_requests_total', { route: 'chat' });
res.type('text/plain').send(metrics.render());
```

## Datadog

```ts
import { DatadogExporter } from '@vaultex/integrations';
const dd = new DatadogExporter({ apiKey: process.env.DD_API_KEY! });
await dd.export([{ name: 'vaultex.latency_ms', value: 12, tags: { env: 'prod' } }]);
```

## OpenTelemetry

`buildResourceAttributes()` / `buildOtlpConfig()` produce config you feed to
`@opentelemetry/sdk-node` (kept as an optional peer so this package stays light).

## OIDC SSO

`discoveryUrl()` and `buildAuthorizationUrl()` for Okta / Entra ID / Auth0 authorization-code flow.

Apache-2.0.
