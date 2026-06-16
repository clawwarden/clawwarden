import type { NextConfig } from "next";

// The console is a thin client that talks to the user's own gateway — often
// http://localhost:8000 (and a local Ollama). So connect-src must allow
// localhost/127.0.0.1 and the configured gateway origin, and we must NOT set
// `upgrade-insecure-requests` (it would break the http localhost connection).
const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8000";
let gatewayOrigin = "";
try {
  gatewayOrigin = new URL(gatewayUrl).origin;
} catch {
  gatewayOrigin = "";
}

const csp = [
  "default-src 'self'",
  // Next.js injects inline hydration scripts/styles; 'unsafe-inline' is required
  // without a full nonce setup. No remote script origins are allowed.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${gatewayOrigin} http://localhost:* http://127.0.0.1:* https://*.sentry.io`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
