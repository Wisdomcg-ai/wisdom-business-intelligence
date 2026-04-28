---
phase: 44-forecast-pipeline-fix
plan: 08
subsystem: forecast-read-service
status: complete
sub_phase: C
wave: 8
completed_at: 2026-04-28
tags: [forecast, read-service, invariants, multi-tenant, D-09, D-13, D-14, D-18]
requirements:
  - PHASE-44-D-13
  - PHASE-44-D-14
  - PHASE-44-D-18
dependency_graph:
  requires:
    - 44-02 (xero_pl_lines long-format schema)
    - 44-05 (xero_pl_lines.tenant_id NOT NULL DEFAULT '' + plain unique)
    - 44-06 (forecast_pl_lines.computed_at column)
  provides:
    - "ForecastReadService canonical read API (used by 44-09 consumers)"
    - "D-18 runtime invariant assertions (forecast_freshness + coverage_non_negative)"
  affects:
    - 44-09 (wizard / monthly report / cashflow consumer migration)
    - "Future client portal (Phase 36)"
tech_stack:
  added: []
  patterns:
    - "Phase 39 runtime-invariant pattern (assert + structured Error + Sentry.captureException with tags)"
    - "Phase 21+ resolveBusinessIds at API boundary"
    - "Long → wide aggregation (group by account_code with NAME:<name> fallback, sum amount per period_month across tenants)"
key_files:
  created:
    - src/lib/services/forecast-read-service.ts
  modified:
    - src/__tests__/services/forecast-read-service.test.ts
decisions:
  - "Service compares forecast_pl_lines.computed_at against financial_forecasts.updated_at (not against forecast_assumptions.updated_at) — there is no forecast_assumptions table; assumptions live on financial_forecasts.assumptions JSONB. Mirrors save_assumptions_and_materialize RPC (Wave 6)."
  - "computed_at = MIN across forecast_pl_lines rows (oldest derivation wins). Any single stale row trips the freshness invariant — by design."
  - "Long → wide grouping key is account_code with NAME:<account_name> fallback for null codes."
  - "Cashflow sign convention: revenue + other_income are +1; cogs + opex + other_expense are -1. Category match is case-insensitive."
  - "expected_months defaults to 12 (single-FY view); callers can override at composite-level if a 24-month view is needed (out of scope here, hookable in Wave 9)."
metrics:
  duration_minutes: 10
  tasks_completed: 1
  files_modified: 2
  tests_added: 7
  tests_passing_in_plan: 7
---

# Plan 44-08 — Sub-phase C Read Service: SUMMARY

**Status:** Complete. `ForecastReadService` is shipped, fully tested (7/7 green), and ready for 44-09 to migrate the wizard / monthly report / cashflow consumers off ad-hoc re-derivation.

## Outcome

| Artifact                                                  | Status |
| --------------------------------------------------------- | ------ |
| `src/lib/services/forecast-read-service.ts`               | live   |
| Public API surface (3 read methods + factory + 6 types)   | live   |
| D-18 freshness invariant (`forecast_freshness` Sentry tag) | live   |
| D-18 coverage invariant (`coverage_non_negative` Sentry tag) | live   |
| Test fixtures replace 4 it.todo + 3 new (multi-tenant, parity, invariant, negative coverage, active forecast, subtotals, cashflow) | 7/7 green |

## Public API

```typescript
import {
  ForecastReadService,
  createForecastReadService,
  type MonthlyComposite,
  type MonthlyCompositeRow,
  type ForecastRow,
  type CoverageRecord,
  type CategorySubtotals,
  type CashflowProjection,
  type AccountType,
} from '@/lib/services/forecast-read-service'

const svc = createForecastReadService(supabase)

// Wide-shaped DTO for wizard / monthly report
await svc.getMonthlyComposite(forecastId): Promise<MonthlyComposite>

// Single-month subtotals (Revenue / COGS / GP / OpEx / Net Profit / Other Income / Other Expense)
await svc.getCategorySubtotalsForMonth(forecastId, 'YYYY-MM'): Promise<CategorySubtotals>

// Monthly cash projection rolled up from forecast_pl_lines.forecast_months
await svc.getCashflowProjection(forecastId): Promise<CashflowProjection>
```

The service requires a `SupabaseClient` from `@supabase/supabase-js`. Callers
construct the client (route handler / server action / cron handler / RPC
script) and inject it. No direct supabase import inside the service — keeps
it testable and free of Next.js cookie/header coupling.

## D-18 Invariant Contract

Every `getMonthlyComposite` call asserts:

1. **`forecast_freshness`** — `forecast_pl_lines.computed_at >= financial_forecasts.updated_at`. Violation throws Error with message containing `INVARIANT VIOLATED` and tags Sentry `{ invariant: 'forecast_freshness', forecast_id }`. Suggested remediation in error message: `POST /api/forecast/{id}/recompute`.
2. **`coverage_non_negative`** — `coverage.months_covered >= 0`. Violation throws + tags Sentry `{ invariant: 'coverage_non_negative', forecast_id }`.

`getCategorySubtotalsForMonth` and `getCashflowProjection` delegate through `getMonthlyComposite`, so both inherit the invariants automatically.

## Decision: `historical-pl-summary.ts` retained (parallel surface)

The existing `historical-pl-summary.ts` service reads
`xero_pl_lines_wide_compat` and is currently used by **13 routes**
(monthly-report family + cfo/summaries + cashflow/xero-actuals + pl-summary +
consolidation engine). Migrating all of them is out of scope here — that is
**Plan 44-09's remit**. Decision: leave `historical-pl-summary.ts` in place as
a frozen surface; new consumers MUST use `ForecastReadService`. 44-09 deletes
`historical-pl-summary.ts` after the consumer cut-over. Until then the two
surfaces coexist and read the same underlying data (the
`xero_pl_lines_wide_compat` view is `xero_pl_lines` aggregated by
`jsonb_object_agg` per Wave 5 migration, so the numbers agree by
construction).

## Important Runtime Risk for Wave 9 Consumers (44-07 abandoned)

Plan 44-07 (atomic-save RPC wiring) was abandoned and rolled back after a
data-loss incident. The `save_assumptions_and_materialize` RPC + the
`forecast_pl_lines.computed_at` column from Wave 6 are still live, but the
wizard's save path remains the **legacy serial save** — which writes
`financial_forecasts.assumptions` (bumping `updated_at`) and then later
upserts `forecast_pl_lines` rows. For any forecast saved through this path,
`forecast_pl_lines.computed_at` may legitimately be EARLIER than
`financial_forecasts.updated_at`.

**Implication:** `ForecastReadService.getMonthlyComposite()` will throw the
`forecast_freshness` invariant for legacy rows. This is **correct behavior**
— the contract is "consumers refuse to render stale data". When 44-09 wires
the wizard / monthly report / cashflow to this service, those consumers will
need to either:

1. **(Recommended)** Call `POST /api/forecast/{id}/recompute` to re-derive
   forecast_pl_lines and bump `computed_at`. Or:
2. Catch the structured invariant error and surface a "Forecast data is
   stale — click to recompute" UI banner with the recompute endpoint as
   action.

Do **not** weaken the invariant. The whole point of D-18 is that stale data
must surface loudly, not silently render wrong numbers.

## Schema Touchpoints

| Table                        | Columns Read                                                              |
| ---------------------------- | ------------------------------------------------------------------------- |
| `financial_forecasts`        | `id`, `business_id`, `fiscal_year`, `is_active`, `updated_at`             |
| `forecast_pl_lines`          | `account_code`, `account_name`, `category`, `forecast_months`, `computed_at` |
| `xero_pl_lines` (long format) | `account_code`, `account_name`, `account_type`, `period_month`, `amount`, `tenant_id`, `fiscal_year` |

Reads use `resolveBusinessIds` to resolve dual-ID format and pass `ids.all` to
`.in('business_id', ...)` (Phase 21+ pattern, mandatory at every API
boundary).

## Tests

`src/__tests__/services/forecast-read-service.test.ts` — 7 tests, all green:

| Test                                          | D-#  | What it asserts                                                                  |
| --------------------------------------------- | ---- | -------------------------------------------------------------------------------- |
| `multi-tenant aggregate`                      | D-09 | 12 long rows (2 tenants × 3 accounts × 2 months) collapse to 3 rows × 2 monthly_values entries with summed amounts |
| `parity`                                      | D-13 | Wide-DTO contract: row shape + monthly_values key format + hand-computed totals  |
| `invariant`                                   | D-18 | Stale `computed_at` throws + Sentry tag = `forecast_freshness`                   |
| `negative coverage`                           | D-18 | `months_covered = -1` throws + Sentry tag = `coverage_non_negative`              |
| `aggregates active forecast (D-14)`           | D-14 | `financial_forecasts` query filters by `id` (active uniqueness already at DB)    |
| `getCategorySubtotalsForMonth returns ...`    | —    | Subtotal math: GP = R-C; NP = R-C-O+OI-OE                                        |
| `getCashflowProjection sums forecast_months ...` | —    | Sign convention: revenue/other_income = +1; cogs/opex/other_expense = -1         |

Mock pattern: in-memory `MockSupabase` class that intercepts `from(table)` and
returns canned data per fixture. `resolveBusinessIds` mocked at module
boundary to skip dual-ID resolution. `Sentry.captureException` mocked to
capture invariant tag arguments.

Snapshot fixture (`__tests__/services/fixtures/jds-pl-summary-legacy.json`)
NOT generated — the parity test runs against synthetic-but-realistic data
because the live `/api/Xero/pl-summary` endpoint is auth-gated and JDS-fixture
capture would require a recorded session. The structural parity contract
(row shape + key format + summing math) is fully covered by the synthetic
test; the JDS HTTP-level capture lives in
`src/__tests__/xero/fixtures/jds-fy26.json` (Wave 0/3) and is exercised by
`pl-by-month-parser.test.ts` upstream.

## Acceptance Criteria

| Criterion                                                                                          | Evidence                                                                  |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| File `src/lib/services/forecast-read-service.ts` exists                                            | `ls` confirms                                                             |
| Exports: class + factory + 6 types                                                                 | `ForecastReadService`, `createForecastReadService`, `MonthlyComposite`, `MonthlyCompositeRow`, `ForecastRow`, `CoverageRecord`, `CategorySubtotals`, `CashflowProjection`, `AccountType` |
| Methods: `getMonthlyComposite`, `getCategorySubtotalsForMonth`, `getCashflowProjection`            | grep confirms                                                             |
| `Sentry.captureException` with `invariant` tag count ≥ 2                                           | 2 tagged calls (forecast_freshness + coverage_non_negative)               |
| `from('xero_pl_lines')` ≥ 1                                                                        | 1                                                                         |
| `from('forecast_pl_lines')` ≥ 1                                                                    | 1                                                                         |
| `resolveBusinessIds` ≥ 1                                                                           | 2 (1 import + 1 call)                                                     |
| All ≥5 tests pass                                                                                  | 7/7 green                                                                 |
| `it.todo` / `it.skip` count = 0                                                                    | 0                                                                         |
| Test names per 44-VALIDATION.md present (multi-tenant aggregate, parity, invariant, negative coverage) | All 4 + 1 added (`aggregates active forecast (D-14)`) + 2 sanity         |
| `npm run test` baseline-clean (no new failures)                                                    | Pre-existing 10 failures → 9 (one less, from a 4-todo→7-pass file). Zero new failures introduced by 44-08. |
| `npx tsc --noEmit` clean                                                                           | 0 errors                                                                  |

## Deviations from Plan

### Rule 3 — Blocking issue auto-fixed

**1. Plan referenced non-existent `forecast_assumptions` table.**
- **Found during:** Reading 44-08-PLAN.md `<interfaces>` block (line 138, 282-283, 290-291, 376-378).
- **Issue:** The plan repeatedly read from `forecast_assumptions.updated_at` for the freshness invariant. Schema scan confirms there is no `forecast_assumptions` table; the wizard's assumptions are stored on `financial_forecasts.assumptions` (jsonb column at `baseline_schema:2599`) and freshness is tracked by `financial_forecasts.updated_at`. Wave 6's `save_assumptions_and_materialize` RPC also writes against `financial_forecasts`, confirming this is the correct freshness oracle (44-06-SUMMARY.md line 42-44).
- **Fix:** Service compares `forecast_pl_lines.computed_at` to `financial_forecasts.updated_at` (loaded in step 1 of `getMonthlyComposite`). Documented in service docstring + `assertComputedAtIsFresh` error message + this summary.
- **Files modified:** `src/lib/services/forecast-read-service.ts`.
- **Commit:** `76595c4`.

### Rule 1 — Bug auto-fix

**2. Initial test fixture for `getCategorySubtotalsForMonth` had empty `forecast_pl_lines`** which trivially trips the (correct) freshness invariant because computed_at = null.
- **Fix:** Added a forecast_pl_lines row with computed_at > updated_at to the test fixture.
- **Commit:** `76595c4`.

### Skipped from Plan

**3. JDS legacy snapshot fixture (`fixtures/jds-pl-summary-legacy.json`) NOT generated.**
- **Why skipped:** Capturing it would require running the live auth-gated `/api/Xero/pl-summary` endpoint against JDS in a one-shot session — out of scope for a Wave 8 unit-test plan and not strictly necessary because (a) the structural parity contract (wide-DTO shape, key format, summing math) is fully exercised by the synthetic `parity` test, and (b) the actual Xero HTTP-level fixture (`__tests__/xero/fixtures/jds-fy26.json`) already exists from Wave 0 and is used by `pl-by-month-parser.test.ts` to lock the upstream parser contract.
- **Net:** Parity contract is structurally enforced; downstream golden-snapshot capture deferred to 44-09 (consumer migration) where it can be captured against the new endpoints in CI.

### Authentication gates

None.

## Self-Check: PASSED

```bash
[ -f "src/lib/services/forecast-read-service.ts" ] && echo "FOUND"
# FOUND
git log --oneline | grep -E "c7d8b56|76595c4"
# c7d8b56 test(44-08): replace 4 it.todo with full ForecastReadService spec
# 76595c4 feat(44-08): ForecastReadService — canonical read API + D-18 invariants
```
