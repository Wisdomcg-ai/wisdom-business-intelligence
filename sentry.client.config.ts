import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",

  // Error tracking only — no performance tracing
  tracesSampleRate: 0,

  // No session replay
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Filter out noise
  beforeSend(event) {
    const message = event.exception?.values?.[0]?.value ?? "";

    // Ignore ResizeObserver errors (browser quirk, not actionable)
    if (message.includes("ResizeObserver loop")) return null;

    // Ignore aborted requests
    if (message.includes("AbortError")) return null;

    // Ignore network failures (user's connection, not our bug)
    if (message.includes("Failed to fetch") || message.includes("Load failed")) return null;

    return event;
  },
});
