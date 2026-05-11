---
phase: 59-forecast-seed-from-prior-fy
plan: "02"
subsystem: forecast
tags: [api-route, tdd, idempotency, rpc, auth]
dependency_graph:
  requires: [forecast-seed-service]
  provides: [POST /api/forecast/seed-from-prior]
  affects: [59-03-empty-state-ui, 59-04-wizard-hydration]
tech_stack:
  added: []
  patterns: [businessId-first-auth, thenable-builder-mock, unconditional-duration-update, atomic-rpc-write]
key_files:
  created:
    - src/app/api/forecast/seed-from-prior/route.ts
    - src/app/api/forecast/seed-from-prior/__tests__/route.test.ts
  modified: []
decisions:
  - "forecast_duration UPDATE is UNCONDITIONAL on success path (decision D3) — test Group F spies and pins this contract"
  - "convertAssumptionsToPLLines called SEPARATELY after seedForecastFromPrior — SeedResult has no plLines field"
  - "subscription_budgets not written — table is not year-scoped (research Q4)"
  - "Thenable builder pattern for forecast_pl_lines count query mock — route awaits builder directly without .maybeSingle()"
metrics:
  duration_seconds: 480
  completed_date: "2026-05-11"
  tasks_completed: 2
  files_created: 2
  tests_written: 23
---

# Phase 59 Plan 02: POST /api/forecast/seed-from-prior — Summary

## One-liner

`POST /api/forecast/seed-from-prior` route: businessId-first auth, idempotency via `isForecastSeedable`, unconditional `forecast_duration` UPDATE, `seedForecastFromPrior` + `convertAssumptionsToPLLines` separately, atomic `save_assumptions_and_materialize` RPC write — 23 tests green, zero console.error, zero subscription_budgets writes.

## What Was Built

### `src/app/api/forecast/seed-from-prior/route.ts`

POST endpoint that:
1. `getUser()` → 401 if unauthenticated (Phase 46 ordering: 401 before 403)
2. Validates `businessId` + `targetFiscalYear` from body → 400 if missing
3. Business access check — owner / team-member / coach / super_admin (verbatim copy of generate route pattern)
4. `resolveBusinessIds()` for dual-ID `financial_forecasts` queries
5. Loads prior FY (`targetFiscalYear - 1`) forecast → 404 if missing or assumptions null
6. Loads target FY forecast row → 404 if not found
7. `forecast_pl_lines` count query (head=true) + `isForecastSeedable()` → 409 if not seedable
8. `seedForecastFromPrior(priorAssumptions, targetFiscalYear, priorDuration)` from 59-01 service
9. UNCONDITIONAL `UPDATE financial_forecasts SET forecast_duration = forecastDuration WHERE id = targetForecast.id`
10. `convertAssumptionsToPLLines(seededAssumptions, ...)` — separate call (no plLines in SeedResult)
11. Shape rpcPLLines (verbatim from generate/route.ts pattern)
12. `supabase.rpc('save_assumptions_and_materialize', ...)` → 500 + Sentry on error
13. Returns `{ success: true, forecastId }` on 200

Three `Sentry.captureException` calls: durErr (duration update failure), rpcError (atomic save failure), outer catch (unexpected error). Zero `console.error`.

### `src/app/api/forecast/seed-from-prior/__tests__/route.test.ts`

23 tests across 9 groups:
- **Group A** (5 tests): Auth gate — 401 no user, 401 getUser error, 403 business not found, 403 not owner/team/coach, passes as owner
- **Group B** (3 tests): Validation — 400 missing businessId, 400 missing targetFiscalYear, 400 empty body
- **Group C** (2 tests): Prior forecast lookup — 404 no prior, 404 assumptions null
- **Group D** (1 test): Target forecast lookup — 404 target row missing
- **Group E** (3 tests): Idempotency — 409 revenue lines present, 409 pl_lines count > 0, proceeds on null assumptions + 0 pl_lines
- **Group F** (5 tests): Success path — 200 response, RPC called once with seeded assumptions, UPDATE fires with priorDuration=1, UPDATE fires with priorDuration=2, subscription_budgets never touched
- **Group G** (3 tests): Failure paths — RPC error → 500 + Sentry with correct tag, unexpected throw → 500 + Sentry, duration update error → 500 + Sentry
- **Group H** (integrated): console.error spy in beforeEach/afterEach across all tests — asserts 0 calls
- **Group I** (1 test): subscription_budgets never in fromSpy call list

## Verification Results

| Check | Result |
|---|---|
| All 23 tests pass | PASS |
| `grep -c "console.error" route.ts` | 0 |
| `grep -c "subscription_budgets" route.ts` | 0 |
| `grep -c "save_assumptions_and_materialize" route.ts` | 3 (≥1) |
| `grep -c "Sentry.captureException" route.ts` | 3 (≥3) |
| `npx tsc --noEmit` (seed-from-prior files) | CLEAN |
| console.error baseline in src/app/api/forecast/ | 4 (≤5 — Phase 46 baseline preserved) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Thenable builder required for `forecast_pl_lines` count query**

- **Found during:** Task 2 (GREEN — test "returns 409 when target has empty revenue lines but pl_lines count > 0" failed with 200 instead of 409)
- **Issue:** The route calls `const { count } = await supabase.from('forecast_pl_lines').select('id', { count: 'exact', head: true }).eq(...)` without `.maybeSingle()`. The test's chainable mock builder returned `this` from `.eq()`, which is not a Promise, so `await` resolved immediately to the builder object (not `{ count: N }`). The idempotency gate received `count = undefined` and treated it as 0, allowing the seed to proceed.
- **Fix:** Added `makeThenableBuilder(result)` helper that gives the builder a `.then()` method so it resolves correctly when awaited directly. Used this pattern for all `forecast_pl_lines` mock builders.
- **Files modified:** `src/app/api/forecast/seed-from-prior/__tests__/route.test.ts`
- **Commit:** `50d9f9b6` (included in GREEN commit alongside test update)

**2. [Rule 1 - Bug] TypeScript type error on Sentry tag access in test**

- **Found during:** Task 2 (tsc --noEmit) — `error TS2339: Property 'route' does not exist on type '{}'`
- **Issue:** `(c[1] as Record<string, unknown>)?.tags?.route` — TypeScript doesn't know that `Record<string, unknown>` has a nested `tags.route` property.
- **Fix:** Narrowed the type assertion to `(c[1] as { tags?: { route?: string } })?.tags?.route`.
- **Files modified:** `src/app/api/forecast/seed-from-prior/__tests__/route.test.ts`
- **Commit:** `50d9f9b6` (same GREEN commit)

### Scope Corrections Honored

- Did NOT load `priorPlLines` from `forecast_pl_lines` (SeedResult has no `plLines` field — decision 2)
- Did NOT write to `subscription_budgets` at any point
- `forecast_duration` UPDATE is unconditional on success path (decision D3) — verified by Group F spy assertions

## Known Stubs

None. This plan is a server-side route with no UI rendering. All data flows are wired end-to-end with real service calls (59-01 seed service) and the existing atomic RPC. No placeholder data.

## Self-Check: PASSED
