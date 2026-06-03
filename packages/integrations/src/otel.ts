/**
 * OpenTelemetry helpers. Dependency-free config builders so this package stays
 * light; install `@opentelemetry/sdk-node` in your app and feed it these values.
 */

export interface OtelResourceInput {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  extra?: Record<string, string>;
}

/** Build OTel resource attributes following semantic conventions. */
export function buildResourceAttributes(
  input: OtelResourceInput,
): Record<string, string> {
  return {
    'service.name': input.serviceName,
    ...(input.serviceVersion
      ? { 'service.version': input.serviceVersion }
      : {}),
    ...(input.environment
      ? { 'deployment.environment': input.environment }
      : {}),
    ...input.extra,
  };
}

export interface OtlpExporterConfig {
  endpoint: string;
  headers: Record<string, string>;
}

/** Build an OTLP/HTTP exporter config (e.g. for a vendor or collector). */
export function buildOtlpConfig(
  endpoint: string,
  apiKey?: string,
): OtlpExporterConfig {
  return {
    endpoint,
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
  };
}
