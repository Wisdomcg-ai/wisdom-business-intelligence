# Phase 53 — Deferred Items

## Discovered during 53-05 execution

### Next.js 16 async searchParams migration (out of scope)

The `posttooluse-validate` hook flagged Next.js 16's async `searchParams` in
`src/app/api/Xero/employees/route.ts` lines 82-83. Two reasons this is NOT
addressed in 53-05:

1. **Project is on Next.js ^14.2.35** (per package.json + research doc §5),
   where `new URL(request.url).searchParams` on a `NextRequest` is the
   canonical synchronous pattern for Route Handlers.
2. **Wrong API surface.** The Next 16 async migration applies to the
   page-level `searchParams` prop (`{ params, searchParams }: { params: Promise<...> }`),
   not the WHATWG `URL` object's `searchParams` getter used here.
3. **Scope.** 53-05 explicitly says "don't redesign existing patterns" and
   only adds the Sentry comment marker in employees/route.ts.

If/when this project upgrades to Next.js 16, a separate phase should
codemod every `new URL(request.url).searchParams.get(...)` route handler
across the codebase (~30+ sites). Tracked as a future-phase candidate.

### Pre-existing test failure: plan-period-banner.test.tsx (unrelated to 53-05)

`src/__tests__/goals/plan-period-banner.test.tsx > PlanPeriodAdjustModal >
renders three date inputs initialised from props` fails on HEAD before any
53-05 changes. Verified by `git stash && npx vitest run src/__tests__/goals/
plan-period-banner.test.tsx`. Failure is a date-fixture drift (current date
2026-05-06, test expected 2029-06-30 — looks like a hard-coded relative
date assumption that no longer holds with the May rollover).

Out of scope for 53-05 (does not touch goals/plan-period code or its test
fixtures). Should be addressed by the goals-area owner — opening separate
ticket recommended.

### Local build environment lacks NEXT_PUBLIC_SUPABASE_URL (unrelated to 53-05)

`npm run build` fails on HEAD before any 53-05 changes with:
  `Error: supabaseUrl is required.` at `app/api/Xero/pl-summary/route.js`

Webpack compilation succeeds (TypeScript/lint clean); only Next.js's
page-data-collection step fails because the worktree's build env doesn't
have `NEXT_PUBLIC_SUPABASE_URL` set. CI will have it.

Verified pre-existing by `git stash && npm run build` — same error before
my 53-05 changes were applied. Out of scope.
