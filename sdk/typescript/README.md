# @vaultex/sdk

Thin TypeScript client for AgentGuard runtime monitoring + the Vaultex Governance Service.
No runtime dependencies (uses the platform `fetch`).

```bash
npm install @vaultex/sdk
```

```ts
import { AgentGuardClient } from '@vaultex/sdk';

const client = new AgentGuardClient({
  baseUrl: 'https://api.your-vaultex.com',
  apiKey: process.env.VAULTEX_API_KEY!,
});

// Record a monitored call
await client.recordCall({
  agentId, taskId, model: 'gpt-4o', provider: 'openai',
  inputTokens: 1200, outputTokens: 800, latencyMs: 940,
  dataSensitivityDetected: 'restricted',
});

// Prove the audit chain hasn't been tampered with
const { valid } = await client.verifyChain();
```

Authenticates with the `x-api-key` header; the tenant is derived from the key server-side.

Apache-2.0.
