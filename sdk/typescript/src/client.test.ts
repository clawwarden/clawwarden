import { describe, it, expect } from 'vitest';
import { AgentGuardClient, VaultexApiError } from './index.js';

function mockFetch(
  capture: { url?: string; method?: string; key?: string; body?: unknown },
  response: { status: number; json?: unknown },
): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    capture.url = String(url);
    capture.method = init?.method;
    capture.key = (init?.headers as Record<string, string>)['x-api-key'];
    capture.body = init?.body ? JSON.parse(init.body as string) : undefined;
    return new Response(
      response.json !== undefined ? JSON.stringify(response.json) : null,
      { status: response.status },
    );
  }) as unknown as typeof fetch;
}

describe('AgentGuardClient', () => {
  it('records a call with the api key header', async () => {
    const cap: Record<string, unknown> = {};
    const client = new AgentGuardClient({
      baseUrl: 'https://api.test/',
      apiKey: 'sk_test',
      fetchImpl: mockFetch(cap, { status: 201, json: { id: 'c1', cost: 0.01 } }),
    });

    const out = await client.recordCall({
      agentId: 'a',
      taskId: 't',
      model: 'gpt-4o',
      provider: 'openai',
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 100,
      dataSensitivityDetected: 'restricted',
    });

    expect(out).toEqual({ id: 'c1', cost: 0.01 });
    expect(cap.url).toBe('https://api.test/v1/calls');
    expect(cap.method).toBe('POST');
    expect(cap.key).toBe('sk_test');
    expect((cap.body as Record<string, unknown>).dataSensitivityDetected).toBe('restricted');
  });

  it('verifies the audit chain', async () => {
    const cap: Record<string, unknown> = {};
    const client = new AgentGuardClient({
      baseUrl: 'https://api.test',
      apiKey: 'k',
      fetchImpl: mockFetch(cap, {
        status: 200,
        json: { valid: true, brokenAtSeq: null, reason: null },
      }),
    });
    const result = await client.verifyChain();
    expect(result.valid).toBe(true);
    expect(cap.url).toBe('https://api.test/v1/governance/audit/verify');
  });

  it('throws VaultexApiError on non-2xx', async () => {
    const cap: Record<string, unknown> = {};
    const client = new AgentGuardClient({
      baseUrl: 'https://api.test',
      apiKey: 'k',
      fetchImpl: mockFetch(cap, { status: 401 }),
    });
    await expect(client.getAuditEvents()).rejects.toBeInstanceOf(VaultexApiError);
  });
});
