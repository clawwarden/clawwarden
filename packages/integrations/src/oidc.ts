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
}

/** Build an authorization-code-flow authorization URL. */
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
  return u.toString();
}
