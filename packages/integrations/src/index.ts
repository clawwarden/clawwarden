/**
 * @vaultex/integrations — observability & IAM adapters for the Vaultex stack.
 * Dependency-light: pure formatters + thin fetch-based exporters.
 */

export * from './types.js';
export {
  formatSyslog,
  formatHec,
  SplunkHecExporter,
  type SyslogOptions,
  type HecOptions,
} from './siem.js';
export { PrometheusRegistry, type Labels } from './metrics.js';
export {
  toDatadogSeries,
  DatadogExporter,
  type DatadogSeries,
  type DatadogOptions,
} from './datadog.js';
export {
  buildResourceAttributes,
  buildOtlpConfig,
  type OtelResourceInput,
  type OtlpExporterConfig,
} from './otel.js';
export {
  discoveryUrl,
  buildAuthorizationUrl,
  createPkcePair,
  type OidcConfig,
  type AuthUrlOptions,
  type PkcePair,
} from './oidc.js';
