import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Enable in all environments to capture errors
  enabled: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),

  // Debug mode to verify Sentry is working (disable after confirming)
  debug: process.env.NODE_ENV !== "production",

  // Error tracking only — no performance tracing
  tracesSampleRate: 0,
});
