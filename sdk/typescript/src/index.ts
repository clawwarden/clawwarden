/**
 * @vaultex/sdk — thin client for AgentGuard (runtime monitoring) and the
 * Vaultex Governance Service. Uses the platform `fetch`; no runtime deps.
 *
 * Authenticates with the `x-api-key` header (tenant is derived from the key).
 */

export interface AgentGuardClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Retries for transient failures (network / 5xx) on writes. Default 2. */
  maxRetries?: number;
  /** Base backoff in ms (doubled per attempt). Default 200. */
  retryBackoffMs?: number;
  /**
   * Called when a write (recordCall / appendAuditEvent) is abandoned after
   * exhausting retries. Audit/cost data are records — buffer them here (disk,
   * queue, DLQ) instead of losing them silently.
   */
  onDrop?: (path: string, body: unknown, error: unknown) => void;
}

export interface RecordCallInput {
  agentId: string;
  taskId: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost?: number;
  latencyMs: number;
  retryIndex?: number;
  errorStatus?: string | null;
  /** AI system context (Gap 2): sensitivity observed for this call. */
  dataSensitivityDetected?:
    | 'public'
    | 'internal'
    | 'confidential'
    | 'restricted'
    | null;
}

export interface ChainVerification {
  valid: boolean;
  brokenAtSeq: number | null;
  reason: string | null;
}

export interface AppendAuditInput {
  eventType: string;
  actorType?: 'user' | 'api_key' | 'system';
  actorId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  action?: string | null;
  policyVersionId?: string | null;
  reason?: string | null;
  confidence?: number | null;
  payload?: Record<string, unknown>;
}

export class VaultexApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'VaultexApiError';
  }
}

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class AgentGuardClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;
  private readonly onDrop?: AgentGuardClientOptions['onDrop'];

  constructor(opts: AgentGuardClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.maxRetries = Math.max(0, opts.maxRetries ?? 2);
    this.retryBackoffMs = Math.max(0, opts.retryBackoffMs ?? 200);
    this.onDrop = opts.onDrop;
  }

  /** Single attempt with a timeout. Reads the error body into the thrown error. */
  private async attempt<T>(
    method: string,
    path: string,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'x-api-key': this.apiKey,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new VaultexApiError(
          `${method} ${path} failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
          res.status,
        );
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Read request — single attempt, no retry. */
  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.attempt<T>(method, path, body);
  }

  /**
   * Write request — retried on transient failure with a stable idempotency key
   * so a re-send is deduped server-side. After the last attempt the payload is
   * handed to `onDrop` (if set) before the error propagates.
   */
  private async write<T>(path: string, body: unknown): Promise<T> {
    const idempotencyKey =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.attempt<T>('POST', path, body, idempotencyKey);
      } catch (err) {
        lastError = err;
        const retryable =
          !(err instanceof VaultexApiError) || isRetryableStatus(err.status);
        if (!retryable || attempt === this.maxRetries) break;
        await sleep(this.retryBackoffMs * 2 ** attempt);
      }
    }
    this.onDrop?.(path, body, lastError);
    throw lastError;
  }

  /** Record a monitored AI call. */
  recordCall(input: RecordCallInput): Promise<{ id: string; cost: number }> {
    return this.write('/v1/calls', input);
  }

  /** Append an event to the immutable audit chain. */
  appendAuditEvent(input: AppendAuditInput): Promise<{ id: string; seq: number }> {
    return this.write('/v1/governance/audit', input);
  }

  /** List recent audit events. */
  getAuditEvents(limit = 100): Promise<{ data: unknown[] }> {
    return this.request('GET', `/v1/governance/audit?limit=${limit}`);
  }

  /** Verify the tenant's audit-chain integrity. */
  verifyChain(): Promise<ChainVerification> {
    return this.request('GET', '/v1/governance/audit/verify');
  }
}
