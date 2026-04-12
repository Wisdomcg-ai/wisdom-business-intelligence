import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "https://5f617384407d5579ae786ca49693fb1f@o4510784570916864.ingest.us.sentry.io/4510789719162880";

Sentry.init({
  dsn: SENTRY_DSN,

  // Performance monitoring — sample 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
