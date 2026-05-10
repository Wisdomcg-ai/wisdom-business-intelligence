import * as Sentry from "@sentry/nextjs";

// SEC-08 (Phase 46 plan 46-04): fail loud if NEXT_PUBLIC_SENTRY_DSN is
// unset in production. In dev, undefined DSN is fine — Sentry.init({ dsn:
// undefined }) is a no-op. The previous hardcoded fallback DSN has been
// removed from the repo; the secret is set via Vercel env vars.
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (process.env.NODE_ENV === "production" && !SENTRY_DSN) {
  throw new Error("NEXT_PUBLIC_SENTRY_DSN must be set in production");
}

Sentry.init({
  dsn: SENTRY_DSN,

  // Performance monitoring — sample 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay — capture 1% of sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
  ],

  // Filter out noisy errors
  ignoreErrors: [
    "ResizeObserver loop",
    "Network request failed",
    "Load failed",
    "ChunkLoadError",
  ],
});
