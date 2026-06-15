/**
 * Minimal OIDC helpers for enterprise SSO (Okta, Entra ID, Auth0, etc.).
 * Pure URL construction — pair with your auth library for token exchange.
 */

export interface OidcConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
}

/** OIDC discovery document URL for an issuer. */
export function discoveryUrl(issuer: string): string {
  return issuer.replace(/\/$/, '') + '/.well-known/openid-configuration';
}

export interface AuthUrlOptions {
  nonce?: string;
  responseType?: string; // default 'code'
  prompt?: string;
  /** PKCE challenge (base64url SHA-256 of the verifier). Strongly recommended. */
  codeChallenge?: string;
  /** PKCE method. Default 'S256' when a challenge is given; never use 'plain'. */
  codeChallengeMethod?: 'S256';
}

/** A PKCE verifier/challenge pair (RFC 7636). Keep `verifier` server/client-side. */
export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

const BASE64URL = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Generate a PKCE pair using Web Crypto (Node 18+, browsers, edge runtimes).
 * Use the `challenge` in `buildAuthorizationUrl`, keep the `verifier` to send
 * on the token exchange. PKCE defends the auth-code flow against interception
 * and is required for public clients.
 */
export async function createPkcePair(): Promise<PkcePair> {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error('Web Crypto (crypto.subtle) unavailable; cannot create PKCE pair');
  }
  const random = new Uint8Array(32);
  c.getRandomValues(random);
  const verifier = BASE64URL(random);
  const digest = await c.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: BASE64URL(new Uint8Array(digest)), method: 'S256' };
}

/**
 * Build an authorization-code-flow authorization URL.
 *
 * Pass `opts.codeChallenge` (from {@link createPkcePair}) to enable PKCE, and a
 * `nonce` to bind the resulting id_token against replay. Both are strongly
 * recommended; a warning is logged if PKCE is omitted.
 */
export function buildAuthorizationUrl(
  authorizationEndpoint: string,
  cfg: OidcConfig,
  state: string,
  opts: AuthUrlOptions = {},
): string {
  const u = new URL(authorizationEndpoint);
  u.searchParams.set('response_type', opts.responseType ?? 'code');
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('scope', cfg.scope ?? 'openid profile email');
  u.searchParams.set('state', state);
  if (opts.nonce) u.searchParams.set('nonce', opts.nonce);
  if (opts.prompt) u.searchParams.set('prompt', opts.prompt);
  if (opts.codeChallenge) {
    u.searchParams.set('code_challenge', opts.codeChallenge);
    u.searchParams.set('code_challenge_method', opts.codeChallengeMethod ?? 'S256');
  } else {
    console.warn(
      '[vaultex/oidc] buildAuthorizationUrl called without PKCE (codeChallenge). ' +
        'Use createPkcePair() — PKCE is required for public clients.',
    );
  }
  return u.toString();
}
