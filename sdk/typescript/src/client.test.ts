import { describe, it, expect } from 'vitest';
import { AgentGuardClient, ClawWardenApiError } from './index.js';

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

  it('throws ClawWardenApiError on non-2xx', async () => {
    const cap: Record<string, unknown> = {};
    const client = new AgentGuardClient({
      baseUrl: 'https://api.test',
      apiKey: 'k',
      fetchImpl: mockFetch(cap, { status: 401 }),
    });
    await expect(client.getAuditEvents()).rejects.toBeInstanceOf(ClawWardenApiError);
  });

  it('sends a stable idempotency key on writes', async () => {
    const cap: Record<string, unknown> = {};
    const client = new AgentGuardClient({
      baseUrl: 'https://api.test',
      apiKey: 'k',
      fetchImpl: (async (_url: unknown, init?: RequestInit) => {
        cap.key = (init?.headers as Record<string, string>)['Idempotency-Key'];
        return new Response(JSON.stringify({ id: 'e1', seq: 1 }), { status: 201 });
      }) as unknown as typeof fetch,
    });
    await client.appendAuditEvent({ eventType: 'x' });
    expect(typeof cap.key).toBe('string');
    expect((cap.key as string).length).toBeGreaterThan(0);
  });

  it('retries a 5xx write then hands the payload to onDrop on exhaustion', async () => {
    let calls = 0;
    const dropped: Array<{ path: string }> = [];
    const client = new AgentGuardClient({
      baseUrl: 'https://api.test',
      apiKey: 'k',
      maxRetries: 2,
      retryBackoffMs: 0,
      onDrop: (path) => dropped.push({ path }),
      fetchImpl: (async () => {
        calls++;
        return new Response('upstream down', { status: 503 });
      }) as unknown as typeof fetch,
    });

    await expect(client.recordCall({
      agentId: 'a', taskId: 't', model: 'm', provider: 'p',
      inputTokens: 1, outputTokens: 1, latencyMs: 1,
    })).rejects.toBeInstanceOf(ClawWardenApiError);

    expect(calls).toBe(3); // 1 initial + 2 retries
    expect(dropped).toEqual([{ path: '/v1/calls' }]);
  });

  it('aborts a request that exceeds the timeout', async () => {
    const client = new AgentGuardClient({
      baseUrl: 'https://api.test',
      apiKey: 'k',
      timeoutMs: 10,
      fetchImpl: ((_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        })) as unknown as typeof fetch,
    });
    await expect(client.verifyChain()).rejects.toThrow(/abort/i);
  });
});
