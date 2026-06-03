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

export class AgentGuardClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AgentGuardClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'x-api-key': this.apiKey,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new VaultexApiError(`${method} ${path} failed`, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /** Record a monitored AI call. */
  recordCall(input: RecordCallInput): Promise<{ id: string; cost: number }> {
    return this.request('POST', '/v1/calls', input);
  }

  /** Append an event to the immutable audit chain. */
  appendAuditEvent(input: AppendAuditInput): Promise<{ id: string; seq: number }> {
    return this.request('POST', '/v1/governance/audit', input);
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
