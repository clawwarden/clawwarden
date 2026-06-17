# @clawwarden/sdk

Thin TypeScript client for AgentGuard runtime monitoring + the ClawWarden Governance Service.
No runtime dependencies (uses the platform `fetch`).

```bash
npm install @clawwarden/sdk
```

```ts
import { AgentGuardClient } from '@clawwarden/sdk';

const client = new AgentGuardClient({
  baseUrl: 'https://api.your-clawwarden.com',
  apiKey: process.env.CLAWWARDEN_API_KEY!,
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
