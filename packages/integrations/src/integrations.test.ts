import { describe, it, expect } from 'vitest';
import {
  formatSyslog,
  formatHec,
  SplunkHecExporter,
  PrometheusRegistry,
  toDatadogSeries,
  buildResourceAttributes,
  buildOtlpConfig,
  discoveryUrl,
  buildAuthorizationUrl,
  createPkcePair,
} from './index.js';

const TS = new Date('2026-06-02T12:00:00.000Z');

describe('SIEM formatting', () => {
  it('formats RFC 5424 syslog with severity-derived PRI', () => {
    const line = formatSyslog(
      { eventType: 'pii_detected', severity: 'critical', message: 'SSN found', timestamp: TS },
      { hostname: 'gw1', appName: 'clawwarden' },
    );
    // facility 16 * 8 + critical(2) = 130
    expect(line.startsWith('<130>1 2026-06-02T12:00:00.000Z gw1 clawwarden')).toBe(true);
    expect(line).toContain('pii_detected');
    expect(line).toContain('SSN found');
  });

  it('embeds structured data from attributes', () => {
    const line = formatSyslog({
      eventType: 'auth_failure',
      message: 'bad token',
      attributes: { role: 'admin', count: 3 },
    });
    expect(line).toContain('[clawwarden@0 role="admin" count="3"]');
  });

  it('strips CR/LF from eventType and message (log injection)', () => {
    const line = formatSyslog({
      eventType: 'auth\nfailure',
      message: 'ok\r\n<999>1 forged record here',
      timestamp: TS,
    });
    expect(line.split('\n')).toHaveLength(1);
    expect(line).not.toContain('\r');
    expect(line).toContain('forged record here'); // neutralized, kept on one line
  });

  it('formats a Splunk HEC envelope', () => {
    const json = JSON.parse(formatHec({ eventType: 'chat_request', message: 'ok', timestamp: TS, attributes: { model: 'gpt-4o' } }));
    expect(json.time).toBe(Math.floor(TS.getTime() / 1000));
    expect(json.event.eventType).toBe('chat_request');
    expect(json.event.model).toBe('gpt-4o');
  });
});

describe('SplunkHecExporter', () => {
  it('POSTs to the HEC endpoint with the token', async () => {
    let captured: { url: string; auth: string | null } | null = null;
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = {
        url: String(url),
        auth: (init?.headers as Record<string, string>)['Authorization'] ?? null,
      };
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const exp = new SplunkHecExporter({ url: 'https://splunk:8088/x', token: 'abc', fetchImpl: fakeFetch });
    await exp.export({ eventType: 'e', message: 'm' });
    expect(captured!.url).toBe('https://splunk:8088/x');
    expect(captured!.auth).toBe('Splunk abc');
  });

  it('throws on non-2xx', async () => {
    const fakeFetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
    const exp = new SplunkHecExporter({ url: 'https://x', token: 't', fetchImpl: fakeFetch });
    await expect(exp.export({ eventType: 'e', message: 'm' })).rejects.toThrow(/503/);
  });
});

describe('PrometheusRegistry', () => {
  it('renders counters and gauges in exposition format', () => {
    const reg = new PrometheusRegistry();
    reg.inc('clawwarden_requests_total', { route: 'chat' }, 1, 'Total requests');
    reg.inc('clawwarden_requests_total', { route: 'chat' });
    reg.set('clawwarden_chain_valid', 1, {}, 'Audit chain integrity');
    const out = reg.render();
    expect(out).toContain('# TYPE clawwarden_requests_total counter');
    expect(out).toContain('clawwarden_requests_total{route="chat"} 2');
    expect(out).toContain('clawwarden_chain_valid 1');
  });
});

describe('Datadog', () => {
  it('maps samples to a v2 series payload', () => {
    const payload = toDatadogSeries([{ name: 'clawwarden.latency', value: 12, tags: { env: 'prod' }, timestamp: TS }]);
    expect(payload.series[0]!.metric).toBe('clawwarden.latency');
    expect(payload.series[0]!.tags).toEqual(['env:prod']);
    expect(payload.series[0]!.points[0]![1]).toBe(12);
  });
});

describe('OpenTelemetry helpers', () => {
  it('builds semantic resource attributes', () => {
    const attrs = buildResourceAttributes({ serviceName: 'clawwarden-gw', serviceVersion: '1.0.0', environment: 'prod' });
    expect(attrs['service.name']).toBe('clawwarden-gw');
    expect(attrs['deployment.environment']).toBe('prod');
  });

  it('builds OTLP headers only when an api key is given', () => {
    expect(buildOtlpConfig('https://otlp').headers).toEqual({});
    expect(buildOtlpConfig('https://otlp', 'k').headers.authorization).toBe('Bearer k');
  });
});

describe('OIDC helpers', () => {
  it('derives the discovery URL', () => {
    expect(discoveryUrl('https://issuer.example.com/')).toBe(
      'https://issuer.example.com/.well-known/openid-configuration',
    );
  });

  it('builds an authorization URL with required params', () => {
    const url = new URL(
      buildAuthorizationUrl(
        'https://issuer.example.com/authorize',
        { issuer: 'https://issuer.example.com', clientId: 'cid', redirectUri: 'https://app/cb' },
        'state123',
        { nonce: 'n1' },
      ),
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('state')).toBe('state123');
    expect(url.searchParams.get('nonce')).toBe('n1');
    expect(url.searchParams.get('scope')).toBe('openid profile email');
  });

  it('adds PKCE params when a code challenge is supplied', async () => {
    const pkce = await createPkcePair();
    expect(pkce.method).toBe('S256');
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pkce.challenge).not.toMatch(/[+/=]/); // base64url, no padding

    const url = new URL(
      buildAuthorizationUrl(
        'https://issuer.example.com/authorize',
        { issuer: 'https://issuer.example.com', clientId: 'cid', redirectUri: 'https://app/cb' },
        'state123',
        { codeChallenge: pkce.challenge },
      ),
    );
    expect(url.searchParams.get('code_challenge')).toBe(pkce.challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
