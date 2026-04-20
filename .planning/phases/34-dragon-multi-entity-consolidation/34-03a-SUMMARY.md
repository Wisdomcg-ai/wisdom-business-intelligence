---
phase: 34
plan: 03a
subsystem: consolidation
tags: [consolidation, budget, forecasts, multi-tenant, ui]
requires: [34-00a, 34-00b, 34-00c, 34-00d, 34-00e, 34-00f, 34-01a, 34-02a]
provides:
  - per-tenant budget column in consolidated P&L report
  - summed consolidated budget + variance (Option B aggregation)
  - admin tenant-picker for assigning forecasts
tech_stack:
  added: []
  patterns:
    - per-tenant forecast scoping via financial_forecasts.tenant_id
    - UNION universe (actuals + budgets) so budget-only accounts render
    - opt-in injected-budgets for deterministic engine tests
key_files:
  created:
    - supabase/migrations/20260420054330_financial_forecasts_tenant_id.sql
    - src/lib/consolidation/engine-budgets.test.ts
    - src/app/api/monthly-report/consolidated/route.test.ts
    - src/app/api/consolidation/forecasts/[forecastId]/route.ts
  modified:
    - src/lib/consolidation/types.ts
    - src/lib/consolidation/engine.ts
    - src/app/api/monthly-report/consolidated/route.ts
    - src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx
    - src/app/admin/consolidation/[businessId]/page.tsx
decisions:
  - Option B (per-tenant budgets) with NULL-tenant legacy fallback
  - Simpler-alternative "zero budget + warning" when no tenants have forecasts
  - UI picker on admin page instead of adapting the multi-step forecast wizard
  - UNION account universe covers budget-only rows
  - Eliminations NOT applied to budgets (coaches already budget "net")
metrics:
  duration: ~15 minutes
  completed: 2026-04-20
---

# Phase 34 Plan 03a: Consolidated Budget (Per-Tenant, Option B) Summary

Per-tenant budgeting with summed consolidated budget + variance columns,
backed by a new `financial_forecasts.tenant_id` column and surfaced in the
consolidated P&L API / tab.

## What shipped

1. **Migration** — `20260420054330_financial_forecasts_tenant_id.sql` adds
   optional `tenant_id TEXT` + composite index
   `(business_id, tenant_id)`. No backfill; legacy rows stay NULL.
2. **Types** — `ForecastLineLike`, `ConsolidatedLine`,
   `EntityColumn.budgetLines?`, `ConsolidatedReport.consolidated.budgetLines`,
   `diagnostics.tenants_with_budget`, `diagnostics.tenants_without_budget`.
3. **Engine** — new helpers in `engine.ts`:
   - `normaliseForecastLine` — merges actual/forecast months (forecast wins)
     and coerces `account_type` / `account_class` / `category` into the five
     canonical lowercase types.
   - `loadTenantBudgets` — per-tenant query of `financial_forecasts` +
     `forecast_pl_lines` for the requested fiscal year.
   - `buildTenantBudgetColumns` — aligns to the universe + zero-fills
     absent months; returns null for tenants without a budget.
   - `combineTenantBudgets` — sums across tenants, NO eliminations applied.
   - `buildConsolidation` now loads budgets (or accepts an injected
     `tenantBudgets` Map), builds a UNION universe of actuals + budgets,
     attaches per-tenant `budgetLines`, and emits `consolidated.budgetLines`
     + the new diagnostics fields.
4. **Route** — `POST /api/monthly-report/consolidated` requires no code
     change beyond a documentation comment; engine output flows through.
5. **UI — `ConsolidatedPLTab.tsx`**:
   - Two-row header. Per-tenant group: Actual | Budget | Var $. Consolidated
     group: Actual | Budget | Var $ | Var %.
   - Amber `AlertTriangle` banner when any tenant has no budget for the FY.
   - Per-tenant header reads `(no budget)` when `budgetLines` is absent;
     the corresponding Budget / Variance cells render em-dash grayed out.
   - Mobile pills reveal one tenant's triplet at a time; the consolidated
     group is always visible.
   - Rule 1 fix: adapted the tab to the current engine shape
     (`report.business` not `report.group`, `diagnostics.tenants_loaded`
     not `members_loaded`, `connection_id` not `member_id`). The pre-pivot
     keys would have crashed the component on any real payload.
6. **Tenant picker (documented fallback)** — `/admin/consolidation/[businessId]`
   gains a "Forecast tenant assignment" section that lists all forecasts for
   the business and PATCHes `tenant_id` via the new
   `PATCH /api/consolidation/forecasts/[forecastId]`. The route validates
   UUID, auths as coach/super_admin, and sanity-checks that the tenant_id
   exists on a `xero_connections` row. The forecast wizard itself is
   unchanged — existing forecasts stay `tenant_id = NULL` until reassigned,
   which preserves the legacy consolidated-budget behaviour for installs
   that don't need per-tenant budgets yet.

## Deviations from plan

### Auto-fixed issues

**1. [Rule 1 - Bug] ConsolidatedPLTab referenced pre-pivot keys**
- **Found during:** Task 6 (UI update)
- **Issue:** The tab imported `report.group.presentation_currency`,
  `diagnostics.members_loaded`, and `col.member_id`. The engine (post-pivot,
  `34-00e`) produces `report.business.presentation_currency`,
  `diagnostics.tenants_loaded`, and `col.connection_id`. The component would
  have thrown on any real payload.
- **Fix:** Rewrote the ViewModel + all references during the Budget/Variance
  extension.
- **Files modified:** `src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx`
- **Commit:** `9bdf53c`

### Chosen fallback

**Forecast wizard tenant-picker → admin-page picker.** The forecast wizard
V2/V4 is a multi-step conversational flow with persistent `wizard_session`
state, AI-CFO scaffolding, and deep component nesting. Threading a new
tenant-picker step through that flow would have been a substantial undertaking
with real regression risk. The plan explicitly sanctioned a simpler
alternative: add a tenant-assignment column to
`/admin/consolidation/[businessId]`. That's what shipped. Existing forecasts
stay `tenant_id = NULL` (legacy / whole-business); the coach assigns each to
a tenant post-hoc via a dropdown.

## Tests

- **Unit:** `engine-budgets.test.ts` — 10 cases covering
  `normaliseForecastLine` merge precedence + type coercion,
  `buildTenantBudgetColumns` alignment/zero-fill/null-slot behaviour,
  `combineTenantBudgets` sum with mixed budgeted/unbudgeted tenants,
  `buildConsolidation` integration via the `tenantBudgets` injection path.
- **Integration:** `api/monthly-report/consolidated/route.test.ts` — 4 cases
  covering both tenants budgeted / neither budgeted / mixed / actuals preserved.
- **Existing suite:** 219 → 233 green (14 new tests added).
- `npx tsc --noEmit` clean.

## Commits

| Hash    | Message |
|---------|---------|
| ee7afaf | feat(34-03a): add tenant_id to financial_forecasts |
| 0b15d6d | feat(34-03a): extend consolidation engine with per-tenant budgets |
| dedd771 | test(34-03a): unit tests for per-tenant budget loader and aggregation |
| 6cd2204 | feat(34-03a): document consolidated route budget shape + integration tests |
| 9bdf53c | feat(34-03a): ConsolidatedPLTab renders Actual + Budget + Variance columns |
| 0e2698e | feat(34-03a): tenant picker on /admin/consolidation/[businessId] |

## Key files

**Created**
- `supabase/migrations/20260420054330_financial_forecasts_tenant_id.sql`
- `src/lib/consolidation/engine-budgets.test.ts`
- `src/app/api/monthly-report/consolidated/route.test.ts`
- `src/app/api/consolidation/forecasts/[forecastId]/route.ts`

**Modified**
- `src/lib/consolidation/types.ts`
- `src/lib/consolidation/engine.ts`
- `src/app/api/monthly-report/consolidated/route.ts`
- `src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx`
- `src/app/admin/consolidation/[businessId]/page.tsx`

## Follow-ups

- The new Consolidated tab expects `budgetLines` to be optional on
  `EntityColumn` — older cached responses won't have it. The UI falls back
  safely (no-budget treatment). Once the route is deployed, budgets flow
  automatically next request.
- Eliminations are NOT applied to budgets. If future iterations need
  intercompany-aware budgets, add an `applyEliminations`-style pass in
  `combineTenantBudgets` (rules filter already sits alongside).
- The legacy "whole business" fallback (NULL tenant_id) is preserved but
  not exercised by the engine — a NULL-tenant forecast is ignored today.
  If the coach wants the old single-budget-across-tenants behaviour, they
  assign that forecast to the primary tenant via the admin picker.

## Self-Check: PASSED

Files verified:
- FOUND: supabase/migrations/20260420054330_financial_forecasts_tenant_id.sql
- FOUND: src/lib/consolidation/engine-budgets.test.ts
- FOUND: src/app/api/monthly-report/consolidated/route.test.ts
- FOUND: src/app/api/consolidation/forecasts/[forecastId]/route.ts

Commits verified: ee7afaf, 0b15d6d, dedd771, 6cd2204, 9bdf53c, 0e2698e (all present on feature/phase-34-consolidated-budget).

tsc --noEmit: clean.
vitest run: 18 files / 233 tests / all pass.
