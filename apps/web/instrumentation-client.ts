import * as Sentry from "@sentry/nextjs";

// Client error tracking. No-ops unless NEXT_PUBLIC_SENTRY_DSN is set. Replay and
// tracing are off (privacy + cost); sendDefaultPii false keeps user data out.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
