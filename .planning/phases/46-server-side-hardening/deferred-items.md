# Phase 46 — Deferred Items

## From Plan 46-02

- **`src/app/api/Xero/refresh-tokens/route.ts:180`** — 100ms `setTimeout` between Xero token refresh calls. Vercel-plugin posttool validator suggested migration to Vercel Workflow for durable execution. Out of scope for 46-02 (SEC-02 is cron-auth only). Worth a future plan if batch size grows beyond what fits in `maxDuration = 60s`.

- **`src/__tests__/goals/plan-period-banner.test.tsx:78`** — pre-existing test failure unrelated to 46-02. Asserts date input is `2026-04-01` but receives `2026-03-31` (off-by-one TZ or FY-rollover bug). File created in 42-03; this plan did not touch it. Worth a separate plan to fix.
