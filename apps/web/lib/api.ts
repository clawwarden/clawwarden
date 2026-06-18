import { GATEWAY_URL } from "./session";

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface SessionConfig {
  provider: "anthropic" | "openai" | "ollama";
  model: string;
  api_key?: string;
  ollama_url?: string;
}

export interface EntityFound {
  entity_type: string;
  token: string;
  start: number;
  end: number;
}

export interface ChatMeta {
  tokenized_messages: { role: string; content: string }[];
  entities_found: EntityFound[];
  role: string;
  entities_allowed: string[];
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: { index: number; message: { role: string; content: string }; finish_reason: string }[];
  _meta: ChatMeta;
}

export async function configureSession(cfg: SessionConfig, jwt: string): Promise<string> {
  // The hardened gateway binds each session to its authenticated owner, so a
  // valid Bearer token (issued by /api/users/login or /register) is required.
  const res = await fetch(`${GATEWAY_URL}/api/session/configure`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gateway error: ${err}`);
  }
  const data = await res.json();
  return data.session_id;
}

export async function listOllamaModels(ollamaUrl: string): Promise<OllamaModel[]> {
  // Path 1: via the local gateway.
  // Chrome's Private Network Access preflight is handled by the gateway
  // middleware, so this works even when the UI is served from HTTPS and the
  // gateway is on http://localhost:8000.
  try {
    const url = new URL(`${GATEWAY_URL}/api/session/models`);
    url.searchParams.set("provider", "ollama");
    url.searchParams.set("ollama_url", ollamaUrl);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      const models = (data.models ?? []) as OllamaModel[];
      // Only trust a non-empty result. The gateway runs in Docker and may be
      // reaching a *different* Ollama instance than the one holding the user's
      // models (e.g. an all-interfaces daemon vs. a loopback-only one). An
      // empty list here is almost always "wrong instance", so fall through to
      // the direct browser fetch, which hits the Ollama on the user's machine.
      if (models.length > 0) return models;
    }
  } catch {
    // fall through
  }

  // Path 2: HTTPS page → HTTP Ollama URL direct fetch.
  // Non-localhost HTTP targets are blocked by Chrome as mixed content.
  // Surface a clear error rather than a confusing fetch failure.
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    ollamaUrl.startsWith("http:")
  ) {
    throw new Error("MIXED_CONTENT");
  }

  // Path 3: query Ollama directly from the browser (running on localhost,
  // no HTTPS restriction). Requires Ollama CORS to be enabled.
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return ((data.models ?? []) as Array<{ name: string; size: number; modified_at: string }>).map(m => ({
      name: m.name,
      size: m.size,
      modified_at: m.modified_at,
    }));
  } catch {
    throw new Error("CORS_OR_OFFLINE");
  }
}

export async function sendChat(
  sessionId: string,
  jwt: string,
  messages: { role: string; content: string }[]
): Promise<ChatResponse> {
  const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-ID": sessionId,
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gateway error ${res.status}: ${err}`);
  }
  return res.json();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${GATEWAY_URL}/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAs(role: string): Promise<{ token: string; expires_in: number }> {
  const res = await fetch(`${GATEWAY_URL}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, subject: "ui-user" }),
  });
  if (!res.ok) throw new Error(`Auth error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Audit log (admin only)
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: string;
  timestamp: string;
  event_type: string;
  correlation_id: string;
  session_id: string | null;
  role: string | null;
  details: Record<string, unknown>;
}

export async function getAuditLogs(
  jwt: string,
  date?: string,
  limit = 200
): Promise<{ logs: AuditEntry[]; count: number; date: string }> {
  const url = new URL(`${GATEWAY_URL}/api/audit/logs`);
  if (date) url.searchParams.set("date", date);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error(`Audit log error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Audit tamper-evidence verification (admin only)
// ---------------------------------------------------------------------------

export interface ChainCheck {
  ok: boolean;
  entries: number;
  first_bad: number;
  error: string | null;
  /** Set by MultiAnchor: the first anchor that diverged. */
  anchor?: string;
  /** Set by MultiAnchor: per-anchor outcome keyed by anchor class name. */
  anchors?: Record<string, ChainCheck>;
}

export interface VerifyResult {
  ok: boolean;
  date: string;
  /** Per-day Redis hash chain + signed high-water mark. */
  redis_chain: ChainCheck;
  /** Continuous WORM anchor(s) — Postgres mirror and, when configured, S3 Object Lock. null if no durable store. */
  durable: ChainCheck | null;
}

export async function verifyAudit(jwt: string, date?: string): Promise<VerifyResult> {
  const url = new URL(`${GATEWAY_URL}/api/audit/verify`);
  if (date) url.searchParams.set("date", date);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error(`Verify error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// User auth (real DB — /api/users/*)
// ---------------------------------------------------------------------------

export interface UserAuthResponse {
  id: string;
  username: string;
  email: string;
  role: string;
  token: string;
  expires_in: number;
}

export async function registerUser(
  username: string,
  email: string,
  password: string,
  role: string
): Promise<UserAuthResponse> {
  const res = await fetch(`${GATEWAY_URL}/api/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password, role }),
  });
  if (!res.ok) throw new Error(`Registration failed: ${await res.text()}`);
  return res.json();
}

export async function loginUser(
  email: string,
  password: string
): Promise<UserAuthResponse> {
  const res = await fetch(`${GATEWAY_URL}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${await res.text()}`);
  return res.json();
}
