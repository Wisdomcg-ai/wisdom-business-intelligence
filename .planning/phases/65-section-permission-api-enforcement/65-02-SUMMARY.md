---
phase: 65-section-permission-api-enforcement
plan: "02"
subsystem: api-auth
tags: [section-permissions, api-enforcement, log-only, sentry, vitest]
dependency_graph:
  requires: [65-01]
  provides: [api-layer-section-permission-gate]
  affects: [api/forecast, api/monthly-report, api/Xero]
tech_stack:
  added: []
  patterns: [requireSectionPermission+enforceSectionPermission call site pattern, vi.mock requireSectionPermission for unit-testable gate behavior]
key_files:
  created:
    - src/lib/permissions/sectionPermissionConfig.ts
    - src/app/api/monthly-report/generate/__tests__/section-permission.test.ts
    - src/app/api/forecast/[id]/__tests__/section-permission.test.ts
    - src/app/api/Xero/pl-summary/__tests__/section-permission.test.ts
  modified:
    - src/app/api/forecast/[id]/route.ts
    - src/app/api/forecast/[id]/actuals-summary/route.ts
    - src/app/api/forecast/[id]/adjust-forward/route.ts
    - src/app/api/forecast/[id]/recompute/route.ts
    - src/app/api/forecast/cashflow/assumptions/route.ts
    - src/app/api/forecast/cashflow/bank-balances/route.ts
    - src/app/api/forecast/cashflow/capex/route.ts
    - src/app/api/forecast/cashflow/payroll-summary/route.ts
    - src/app/api/forecast/cashflow/profiles/route.ts
    - src/app/api/forecast/cashflow/settings/route.ts
    - src/app/api/forecast/cashflow/sync-balances/route.ts
    - src/app/api/forecast/cashflow/xero-actuals/route.ts
    - src/app/api/forecast/dashboard-actuals/route.ts
    - src/app/api/forecast/quarterly-summary/route.ts
    - src/app/api/forecast/seed-from-prior/route.ts
    - src/app/api/monthly-report/account-mappings/route.ts
    - src/app/api/monthly-report/auto-map/route.ts
    - src/app/api/monthly-report/commentary/route.ts
    - src/app/api/monthly-report/consolidated/route.ts
    - src/app/api/monthly-report/consolidated-bs/route.ts
    - src/app/api/monthly-report/consolidated-cashflow/route.ts
    - src/app/api/monthly-report/full-year/route.ts
    - src/app/api/monthly-report/generate/route.ts
    - src/app/api/monthly-report/settings/route.ts
    - src/app/api/monthly-report/snapshot/route.ts
    - src/app/api/monthly-report/subscription-detail/route.ts
    - src/app/api/monthly-report/wages-detail/route.ts
    - src/app/api/Xero/pl-summary/route.ts
    - src/app/api/Xero/balance-sheet/route.ts
    - src/app/api/Xero/refresh-pl/route.ts
    - src/app/api/Xero/reconciliation/route.ts
    - src/app/api/Xero/subscription-transactions/route.ts
decisions:
  - "Auth intro on 5 monthly-report routes (auto-map, snapshot, wages-detail, commentary, full-year) was done in Task 1.5 as a prerequisite; these 5 routes had no auth.getUser() call before this plan"
  - "Test strategy: mock requireSectionPermission directly (not the DB layer) so tests are independent of complex query-chain mocking. Real enforceSectionPermission is used with SECTION_PERMISSION_ENFORCE=false guaranteed via sectionPermissionConfig mock"
  - "Service client emptyQuery pattern: .limit() returns object with .maybeSingle(), not a bare Promise, to support .limit(1).maybeSingle() chains"
  - "Route const naming convention confirmed: drop src/app/ prefix and /route.ts suffix, keep dynamic segments with literal brackets e.g. api/forecast/[id]"
metrics:
  duration_minutes: 60
  completed_date: "2026-05-15"
  tasks_completed: 4
  files_changed: 37
---

# Phase 65 Plan 02: Section-Permission API Gate Wiring Summary

**One-liner:** LOG_ONLY `finances` section-permission gate wired into all 32 finance API routes using `requireSectionPermission` + `enforceSectionPermission`, with Sentry telemetry on deny-path and 6 integration tests pinning LOG_ONLY behavior.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | sectionPermissionConfig.ts — env-var-gated enforce wrapper | 527a655f | src/lib/permissions/sectionPermissionConfig.ts |
| 1.5 | Introduce auth on 5 auth-less monthly-report routes | 86e503a9 | 5 monthly-report routes |
| 2 | Wire requireSectionPermission into all 32 finance-gated routes | f3840540 | 27 route files |
| 3 | 3 integration tests pinning LOG_ONLY behavior | 853588f0 | 3 test files |

## What Was Built

### sectionPermissionConfig.ts

`SECTION_PERMISSION_ENFORCE` is read once at module load from `process.env.SECTION_PERMISSION_ENFORCE === 'true'`. Default is `false` (LOG_ONLY). Flipping to ENFORCE requires setting the env var in Vercel and redeploying — no per-request re-read, intentionally redeploy-gated.

`enforceSectionPermission()` branches on verdict + env flag:
- `allow: true` → silent return null (no Sentry, no overhead)
- `allow: false` + LOG_ONLY → Sentry.captureMessage at level `'info'` with tags `{route, section_key, verdict_reason, enforced: false}`, returns null (route proceeds)
- `allow: false` + ENFORCE → same Sentry call at level `'warning'` with `enforced: true`, returns NextResponse 403

### Auth introduction (Task 1.5)

5 monthly-report routes had no `auth.getUser()` call at all: auto-map, snapshot, wages-detail, commentary, full-year. These were given a standard auth block (createRouteHandlerClient + getUser + 401 on failure) as a prerequisite for `requireSectionPermission` having a userId to work with.

### Gate wiring (Task 2)

All 32 in-scope finance API routes now call:

```ts
const _sectionVerdict = await requireSectionPermission(
  authClient,   // auth-bound client; NEVER service-role
  user.id,
  businessId,
  'finances',
)
const _sectionBlocked = enforceSectionPermission(
  _sectionVerdict,
  'finances',
  'api/route/path',  // stable route const
  user.id,
  businessId,
)
if (_sectionBlocked) return _sectionBlocked
```

Gate is placed immediately after the route's own business access check and before data fetching. Import pattern: named imports from `@/lib/permissions/requireSectionPermission` and `@/lib/permissions/sectionPermissionConfig`.

### Integration tests (Task 3)

3 representative routes tested with 2 assertions each (6 tests total):

1. **POST /api/monthly-report/generate** — most complex; service client mock returns one account mapping to get past NO_MAPPINGS gate; `emptyQuery.limit()` returns object with `.maybeSingle()` not a bare Promise
2. **GET /api/forecast/[id]** — route has multi-step access check (businesses → business_users → system_roles); member mock passes access check via business_users stub; requireSectionPermission is mocked to control verdict independently
3. **GET /api/Xero/pl-summary** — uses NextRequest (not plain Request) because route uses `request.nextUrl.searchParams`; verifyBusinessAccess, resolveXeroBusinessId, getHistoricalSummary are all mocked

Test strategy: mock `requireSectionPermission` to return controlled verdict + mock `sectionPermissionConfig` to force `SECTION_PERMISSION_ENFORCE=false`. This isolates the section-permission gate behavior from DB complexity and env-var state.

All 6 tests pass. Pre-existing 11 failures in pl-summary-lookup-error, consolidated, consolidated-bs, and plan-period-banner are unrelated and were failing before this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1.5 prerequisite: auth intro on 5 auth-less routes**
- **Found during:** Task 2 planning
- **Issue:** 5 monthly-report routes had no auth.getUser() call; requireSectionPermission requires a userId; without auth, the gate would throw or use an undefined userId
- **Fix:** Added standard auth block (createRouteHandlerClient + getUser + 401 guard) to auto-map, snapshot, wages-detail, commentary, full-year
- **Files modified:** 5 monthly-report route files
- **Commit:** 86e503a9

**2. [Rule 1 - Bug] generate test: SECTION_PERMISSION_ENFORCE module caching**
- **Found during:** Task 3 verification
- **Issue:** Test A returned 403 because `SECTION_PERMISSION_ENFORCE` was read at module load time; mocking the module property had no effect on the route's already-bound named import; the real enforceSectionPermission with `enforce=false` should have returned null but the test mock was not taking effect
- **Fix:** Switched test strategy — mock `requireSectionPermission` directly to control the verdict, and mock sectionPermissionConfig to guarantee `SECTION_PERMISSION_ENFORCE=false`. Route's own businesses access check was also blocking denied members (they're not owner or assigned_coach); fixed by making the bizAccess mock always return the business row for both test users
- **Files modified:** generate test rewritten twice

**3. [Rule 1 - Bug] generate test: .limit() chain broken**
- **Found during:** Task 3 verification (500 response after access check passed)
- **Issue:** `emptyQuery.limit()` returned `Promise.resolve({ data: [], error: null })` (a bare Promise), but the financial_forecasts query chains `.order().limit(1).maybeSingle()` — calling `.maybeSingle()` on a Promise throws TypeError
- **Fix:** Changed `limit()` to return `{ maybeSingle: async () => ({ data: null, error: null }), then: ... }` so the chain resolves correctly
- **Files modified:** generate test (buildServiceMock)

**4. [Rule 1 - Bug] pl-summary test: plain Request vs NextRequest**
- **Found during:** Task 3 verification (500 response)
- **Issue:** pl-summary route uses `request.nextUrl.searchParams` which requires NextRequest; a plain `Request` has no `nextUrl` property; invokeRoute used `new Request(url)` causing a TypeError inside the route handler
- **Fix:** Changed invokeRoute to `const { NextRequest } = await import('next/server'); const req = new NextRequest(url)`
- **Files modified:** pl-summary test

**5. [Rule 1 - Bug] forecast/[id] test: access check blocking denied member before section gate**
- **Found during:** Task 3 verification (403 from route's own access check, not from section gate)
- **Issue:** The original test mock's `business_users` only handled 2 `.eq()` calls, but the route's access check uses 3 (business_id, user_id, status='active'). The denied member had no `business_users` match → route returned 403 from its own access check before reaching the section permission gate
- **Fix:** Rewrote forecast/[id] test with same strategy as generate — mock `requireSectionPermission` directly; simplified auth client to always pass access check; business_users mock returns member row on all `.eq()` depths
- **Files modified:** forecast/[id] test rewritten

## Known Stubs

None — the gate is fully wired. All routes call `requireSectionPermission` with a real auth-bound client and `businessId` from request params/body.

## Self-Check: PASSED
