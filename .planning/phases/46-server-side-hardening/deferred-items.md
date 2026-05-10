# Phase 46 — Deferred Items

## From Plan 46-02

- **`src/app/api/Xero/refresh-tokens/route.ts:180`** — 100ms `setTimeout` between Xero token refresh calls. Vercel-plugin posttool validator suggested migration to Vercel Workflow for durable execution. Out of scope for 46-02 (SEC-02 is cron-auth only). Worth a future plan if batch size grows beyond what fits in `maxDuration = 60s`.

- **`src/__tests__/goals/plan-period-banner.test.tsx:78`** — pre-existing test failure unrelated to 46-02. Asserts date input is `2026-04-01` but receives `2026-03-31` (off-by-one TZ or FY-rollover bug). File created in 42-03; this plan did not touch it. Worth a separate plan to fix.

## From Plan 46-04

- **`src/__tests__/goals/plan-period-banner.test.tsx:78`** (still failing 2026-05-11). Re-confirmed pre-existing on branch tip via `git stash` + rerun with all SEC-07 changes removed. Same off-by-one TZ symptom. Tracked above; restated here so the 46-04 SUMMARY's reference resolves.

- **Vercel-plugin posttool validator false positives (~50 occurrences during SEC-07 sweep)** — Hook flagged `URL.searchParams` (synchronous Web API) usage in route handlers as if it were the Next.js 16 async page-prop `searchParams`. Route handlers do not have an async `searchParams` prop. Suggestion: configure the validator to skip `route.ts` files for that rule, OR document the false positive in repo's tooling notes. Tooling config is out of scope for server-side hardening; tracked here for a future DX phase.

- **AI SDK / AI Gateway / Vercel Workflow migration suggestions surfaced by validator (~10 occurrences during SEC-07 sweep)** — Architectural rewrites of OpenAI/Anthropic SDK call sites and long-running cron handlers. Rule 4 architectural changes; out of scope for SEC-07. Tracked here in case a future "AI infra" or "long-running jobs" phase wants to revisit.

- **Phase 53-05 cross-phase invariant on `Xero/employees/route.ts`** — Resolved within 46-04 via deviation Rule 3 (revert + NODE_ENV guards), see 46-04-SUMMARY.md. Logged here for reviewers who want to understand why this single file uses `console.* + NODE_ENV guards` rather than `Sentry.captureException` like every other swept route.

- **Pre-existing typecheck errors in untracked Finder-duplicate files** (`scripts/diag-*.ts`, `*.tsx 2.tsx`, `*.test 2.ts`, `*.mjs` duplicates). Not produced by this plan; tracked so the operator can decide whether to `git clean` or commit them.
