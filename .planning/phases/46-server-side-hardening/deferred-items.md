# Phase 46 — Deferred Items

## From Plan 46-02

- **`src/app/api/Xero/refresh-tokens/route.ts:180`** — 100ms `setTimeout` between Xero token refresh calls. Vercel-plugin posttool validator suggested migration to Vercel Workflow for durable execution. Out of scope for 46-02 (SEC-02 is cron-auth only). Worth a future plan if batch size grows beyond what fits in `maxDuration = 60s`.
