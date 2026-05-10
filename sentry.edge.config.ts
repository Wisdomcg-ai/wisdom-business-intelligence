import * as Sentry from "@sentry/nextjs";

// SEC-08 (Phase 46 plan 46-04): edge runtime Sentry. Prefer SENTRY_DSN,
// fall back to NEXT_PUBLIC_SENTRY_DSN. Fail loud if neither is set in
// production. The previous hardcoded fallback DSN has been removed from
// the repo; the secret is set via Vercel env vars.
const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (process.env.NODE_ENV === "production" && !SENTRY_DSN) {
  throw new Error("SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) must be set in production");
}

Sentry.init({
  dsn: SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
