---
phase: 34
plan: 03b
subsystem: consolidation
tags: [consolidation, budget, forecasts, multi-tenant, ui, hybrid-mode]
requires: [34-00a, 34-00b, 34-00c, 34-00d, 34-00e, 34-00f, 34-01a, 34-02a, 34-03a]
provides:
  - businesses.consolidation_budget_mode toggle ('single' | 'per_tenant')
  - engine branch for single-budget mode (one business-level forecast)
  - per_tenant legacy fallback (business-level forecast when zero tenants have forecasts)
  - admin radio toggle + adaptive forecast assignment UI
  - ConsolidatedPLTab hides per-tenant Budget+Variance columns in single mode
  - PATCH /api/consolidation/businesses/[id] route with role + ownership gate
tech_stack:
  added: []
  patterns:
    - Per-business opt-in budget mode column on businesses
    - Dual-client route handler (cookie auth + service-role write)
    - Optimistic radio-toggle UI with rollback on failure
    - Mode-aware universe composition (actuals + per-tenant OR single budget)
    - Diagnostics.budget_mode + optional single_budget_found for UI adaptation
key_files:
  created:
    - supabase/migrations/20260420195612_consolidation_budget_mode.sql
    - src/app/api/consolidation/businesses/[id]/route.ts
    - src/app/api/consolidation/businesses/[id]/route.test.ts
    - src/lib/consolidation/engine-budget-mode.test.ts
  modified:
    - src/lib/consolidation/types.ts
    - src/lib/consolidation/engine.ts
    - src/lib/consolidation/engine-budgets.test.ts
    - src/app/admin/consolidation/[businessId]/page.tsx
    - src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx
    - src/app/api/monthly-report/consolidated/route.test.ts
decisions:
  - Per-business mode toggle (not per-fiscal-year) — simpler, matches user intent
  - Default 'single' — safer, simpler for clients who haven't opted in
  - Keep 34.3 tenant_id column + legacy fallback so pre-Step-2 installs work
  - In per_tenant mode with ZERO tenant forecasts, fall back to tenant_id=NULL
    forecast (backward compat with 34.3 when only the legacy forecast exists)
  - Admin UI picker for forecast-tenant only rendered in per_tenant mode; single
    mode replaces it with a read-only Scope column highlighting the authoritative source
  - New loadSingleBusinessBudget + alignBudgetToUniverse helpers to keep the
    branch logic in buildConsolidation clean (no data access in combine step)
  - singleBusinessBudget + tenantBudgets injection paths both supported by opts
    so tests don't need to mock financial_forecasts queries
metrics:
  duration: ~25 minutes
  completed: 2026-04-20
  tests_added: 18 (net new: 233 → 251)
  commits: 5
---

# Phase 34 Step 2: Hybrid Budget Mode Summary

Explicit per-business opt-in between a single consolidated budget and Calxa-style
per-tenant budgets, with backward-compatible fallbacks and mode-aware UI.

## What shipped

1. **Migration** — `20260420195612_consolidation_budget_mode.sql` adds
   `businesses.consolidation_budget_mode TEXT DEFAULT 'single'` with a CHECK
   constraint (`IN ('single', 'per_tenant')`). Idempotent via
   `ADD COLUMN IF NOT EXISTS` + `DROP CONSTRAINT IF EXISTS`. Includes a
   defensive `UPDATE ... SET ... WHERE IS NULL` backfill.

2. **Engine branch (`src/lib/consolidation/engine.ts`)**
   - `loadBusinessContext` reads `consolidation_budget_mode`, coalescing
     unrecognised values to `'single'`.
   - New `loadSingleBusinessBudget(supabase, businessId, fiscalYear)` helper
     fetches the legacy `tenant_id IS NULL` forecast.
   - New `alignBudgetToUniverse(budget, universe, fyMonths)` helper projects a
     flat forecast onto the engine's aligned account universe.
   - `buildConsolidation` branches on `business.consolidation_budget_mode`:
     - `single` — `singleModeBudget` drives `consolidated.budgetLines`;
       `byTenant[].budgetLines` stays `undefined` for every tenant.
     - `per_tenant` — existing per-tenant lookup + sum. When the returned
       Map is empty, falls back to `loadSingleBusinessBudget` so 34.3 installs
       with only a legacy forecast don't silently lose their budget.
   - Diagnostics gain `budget_mode: 'single' | 'per_tenant'` (always) plus
     `single_budget_found?: boolean` (single mode only).

3. **New API route** — `PATCH /api/consolidation/businesses/[id]` with the
   project's dual-client pattern:
   - Auth gate (401) → Role gate (coach / super_admin, 403) → Access gate
     (owner_id / assigned_coach_id, 403; super_admin bypasses).
   - Validates UUID param + body shape; rejects empty payload + unknown mode
     values with 400.
   - Uses the service-role client for the `UPDATE` (consistent with
     `/api/consolidation/fx-rates` and `/api/consolidation/tenants/[id]`).

4. **Admin page** — `/admin/consolidation/[businessId]`:
   - New "Budget mode" section with a radio group. Optimistic persist with
     rollback on failure (reverts the selection if the PATCH errors out).
   - Forecast assignment section adapts:
     - `per_tenant`: existing tenant-picker dropdown per forecast row.
     - `single`: picker hidden; a Scope column shows which forecast is the
       consolidated budget source (the first `tenant_id IS NULL` forecast).
   - Helper copy changes per mode.

5. **Consolidated P&L tab** — `ConsolidatedPLTab.tsx`:
   - Reads `report.diagnostics.budget_mode` (defaults to `'per_tenant'` for
     responses from pre-Step-2 servers).
   - In single mode, hides per-tenant Budget + Variance columns (row,
     subheader, and the tenant group header `colSpan` drops from 3 to 1) and
     shows an info banner: *"Budget tracked at the consolidation level. See
     Consolidated column for Budget/Variance."*
   - Surfaces `Business budget: loaded / not found` in the diagnostics footer
     instead of the per-tenant coverage count (which is 0 by design in single
     mode).

6. **Tests** (+18 net, 233 → 251):
   - `engine-budget-mode.test.ts`: 8 scenarios covering `single` happy path,
     missing forecast, tenantBudgets ignored in single mode, per_tenant happy
     path, partial budgets, legacy fallback, and `alignBudgetToUniverse` unit
     tests.
   - `api/consolidation/businesses/[id]/route.test.ts`: 10 scenarios — 400
     bad UUID, 401 unauthed, 403 role/ownership, coach happy path, super_admin
     bypass, invalid mode, empty body, non-JSON body, 404 not-found.
   - `engine-budgets.test.ts`: existing fixture updated to pass
     `consolidation_budget_mode: 'per_tenant'` on the mock business row.
   - `api/monthly-report/consolidated/route.test.ts`: mock supabase gains
     `.is(col, null)` support and the business fixture carries the new column.

## Backward compatibility

- Default mode is `'single'` — BUT every install that pre-dates Step 2 was
  using per-tenant scoping (34.3). To avoid a silent regression for those
  installs:
  - Per-tenant mode has a legacy fallback: when zero tenants have a forecast,
    the engine loads the legacy `tenant_id IS NULL` forecast and feeds it into
    the consolidated column (per-tenant columns stay empty).
  - The admin UI lets coaches explicitly opt into `'single'` or keep the
    current per-tenant setup by flipping the radio.
- `ConsolidatedPLTab` defaults `budget_mode` to `'per_tenant'` when reading
  from cached/legacy API responses that lack the field, preserving today's
  visuals until both engine + client update.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `.is()` support in consolidated-route test mock**
- **Found during:** Task 3 / test runs after engine branch
- **Issue:** `mockSupabase` helper in
  `src/app/api/monthly-report/consolidated/route.test.ts` only supported
  `.eq()`, `.in()`, `.order()`. The new `loadSingleBusinessBudget` uses
  `.is(col, null)` and the fallback fires in per_tenant mode when the mock
  fixture returns an empty tenantBudgets map — tests crashed with
  `supabase.from(...).select(...).in(...).is is not a function`.
- **Fix:** Added `'is'` filter op + an `.is()` builder method. `.is(col, null)`
  matches rows where the cell is `null` OR `undefined` (fixtures often omit
  nullable columns).
- **Files modified:** `src/app/api/monthly-report/consolidated/route.test.ts`
- **Commit:** 6075d6e

**2. [Rule 2 - Correctness] engine-budgets fixture lacked budget_mode**
- **Found during:** Task 2 (engine + types change)
- **Issue:** Updating `loadBusinessContext` to read `consolidation_budget_mode`
  broke the pre-existing `engine-budgets.test.ts` integration test (the mock
  business row didn't include the new column → engine defaulted to `'single'`
  → the tenantBudgets injection the test relied on was ignored).
- **Fix:** Added `consolidation_budget_mode: 'per_tenant'` to the fixture
  (the test is exercising per-tenant mode).
- **Files modified:** `src/lib/consolidation/engine-budgets.test.ts`
- **Commit:** d8947a5

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 251 / 251 passing (up 18 from 233 baseline)
- Migration filename regex — matches both `YYYYMMDDHHMMSS_name.sql` patterns
  enforced by `.github/workflows/supabase-preview.yml`

## Commits (5 atomic)

| Hash     | Subject                                                              |
| -------- | -------------------------------------------------------------------- |
| b7f8bd8  | feat(34-step2): add consolidation_budget_mode column to businesses   |
| d8947a5  | feat(34-step2): engine honours businesses.consolidation_budget_mode  |
| 6075d6e  | feat(34-step2): PATCH /api/consolidation/businesses/[id] mode toggle |
| 78f318d  | feat(34-step2): admin consolidation page shows budget-mode toggle    |
| 7b34dc9  | feat(34-step2): ConsolidatedPLTab adapts columns to budget_mode      |

## Known Stubs

None.

## Threat Flags

None — this plan adds role-gated write surface that follows the existing
`/api/consolidation/*` pattern. No new network endpoints exposed without the
coach/super_admin role check + ownership check.

## Self-Check: PASSED

All 4 expected files exist on disk; all 5 commits present in git log.
