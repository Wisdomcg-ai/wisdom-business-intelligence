---
phase: 16-forecast-rollover-rolling-periods
plan: "03"
subsystem: forecast
tags: [forecast, lock, actuals, prior-year, rollover, api, wizard]
dependency_graph:
  requires:
    - phase: 16-01
      provides: fiscal_year_filter_on_getOrCreate, forecast_lock_enforcement
    - phase: 16-02
      provides: fy_selector_tabs_ui, selected_fiscal_year_state
  provides:
    - actuals_summary_api_endpoint
    - wizard_prior_year_from_locked_forecast
    - lock_forecast_button_ui
    - locked_forecast_read_only_banner
  affects: [forecast-page, ForecastWizardV4, actuals-summary-api]
tech_stack:
  added: []
  patterns:
    - locked-forecast-as-prior-year-source
    - actuals-months-aggregation-into-PriorYearData
    - forecast-api-route-standard-pattern
key_files:
  created:
    - src/app/api/forecast/[id]/actuals-summary/route.ts
  modified:
    - src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx
    - src/app/finances/forecast/page.tsx
key_decisions:
  - "actuals-summary endpoint works for any forecast (locked or not) — wizard decides when to call it"
  - "priorYearForecastData stored separately from Xero-derived priorYear; effectivePriorYear selects between them"
  - "Lock button only shown for is_completed=true forecasts to prevent premature locking"
  - "Xero pl-summary fetch replaced with empty response when locked forecast data loaded successfully"
  - "Category detection in actuals-summary uses string matching on category/account_type — covers all known Xero P&L layouts"
requirements-completed: [ROLLOVER-04, ROLLOVER-05]
duration: "~20 minutes"
completed: "2026-04-08"
---

# Phase 16 Plan 03: Actuals-Summary API + Prior Year Wiring + Lock Button Summary

**Added `/api/forecast/[id]/actuals-summary` endpoint that aggregates `forecast_pl_lines.actual_months` into `PriorYearData` shape, wired it into `ForecastWizardV4` as the prior-year source when a locked prior-FY forecast exists, and added a lock-forecast button + read-only banner to the forecast page.**

## Performance

- **Duration:** ~20 minutes
- **Started:** 2026-04-08T00:00:00Z
- **Completed:** 2026-04-08T00:20:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Actuals-summary API endpoint aggregates real `actual_months` DB data into revenue/COGS/OpEx summaries with seasonality pattern
- Wizard now checks for a locked prior-FY forecast before fetching Xero P&L — enables full forecast rollover cycle without Xero dependency
- Lock button appears on completed forecasts; clicking sets `is_locked=true`, `is_completed=true`, `locked_at`, `locked_by` with confirmation dialog
- Locked forecasts show a gray read-only banner and have Forecast Builder + Save buttons disabled

## Task Commits

1. **Task 1: Create actuals-summary API + wire into wizard prior-year loading** - `d0baa82` (feat)
2. **Task 2: Add lock-forecast button to forecast page** - `ef2187f` (feat)

## Files Created/Modified

- `src/app/api/forecast/[id]/actuals-summary/route.ts` - New GET endpoint; queries `financial_forecasts` for the forecast row, fetches all `forecast_pl_lines`, categorises lines into revenue/COGS/OpEx buckets, aggregates `actual_months` into totals and monthly breakdowns, computes seasonality pattern, returns `PriorYearData`-shaped JSON
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` - Added pre-fetch check: calls `api/forecasts/versions` for `fiscalYear-1`, finds locked entry, fetches `actuals-summary`, stores as `priorYearForecastData`; replaces Xero pl-summary fetch with empty response when `priorYearFromForecast=true`; passes `effectivePriorYear` (forecast data or Xero data) to `initializeFromXero`
- `src/app/finances/forecast/page.tsx` - Added `Lock` import; `handleLockForecast` function; lock button in PageHeader actions (conditional on `!is_locked && is_completed`); read-only banner after PageHeader; disabled Forecast Builder + Save when locked

## Decisions Made

1. **Endpoint works for any forecast** — The plan noted no requirement that the forecast be locked to call actuals-summary. The wizard enforces the "locked prior-FY only" policy at call-site. This makes the endpoint more testable.

2. **priorYearForecastData stored outside the `try` block** — The variable is declared before the `try` so it's accessible when building `effectivePriorYear` inside the `canInitialize` block. This avoids a second fetch and prevents the Xero-derived `priorYear` (which would be empty when no Xero data) from overwriting it.

3. **Lock button only on `is_completed=true` forecasts** — Prevents coaches from accidentally locking an in-progress forecast mid-build. The plan specified this condition.

4. **Category matching via lowercase string comparison** — The `isRevenue`/`isCOGS` helpers compare `category` and `account_type` strings case-insensitively. This covers both Xero-sourced data (title case) and manually entered data (mixed case).

5. **Xero pl-summary replaced with empty Response when locked data loaded** — Using `Promise.resolve(new Response(JSON.stringify({ summary: null }), { status: 200 }))` keeps the fetch index in `fetchPromises` consistent (goalsRes=0, plRes=1, teamRes=2, profileRes=3) so destructuring remains correct.

## Deviations from Plan

**1. [Rule 3 - Blocking] ForecastWizardV4.tsx has no Supabase browser client**
- **Found during:** Task 1 implementation
- **Issue:** The plan suggested using `supabase.from('financial_forecasts')...` in the wizard for the prior-forecast lookup, but ForecastWizardV4.tsx is a pure `fetch()`-based component with no Supabase import
- **Fix:** Used the existing `api/forecasts/versions` API endpoint instead to query locked prior-FY forecasts — same result, no new import needed
- **Files modified:** ForecastWizardV4.tsx
- **Commit:** d0baa82 (included in Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Deviation produced a cleaner implementation — using the API route preserves the auth/access-control layer rather than bypassing it with a raw Supabase browser client call.

## Known Stubs

None — all wiring is functional. The actuals-summary endpoint returns real aggregated data from `forecast_pl_lines.actual_months`. The lock button writes real DB updates. The wizard prior-year fallback is fully wired.

## Self-Check: PASSED

- `src/app/api/forecast/[id]/actuals-summary/route.ts` — exists, contains `actual_months`, aggregates revenue/COGS/opex, returns `PriorYearData`-shaped JSON
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` — contains `actuals-summary`, `priorYearFromForecast`, `priorYearForecastData`, `effectivePriorYear`
- `src/app/finances/forecast/page.tsx` — contains `handleLockForecast`, `is_locked.*true`, `locked_at`, `Read-only`, `Lock` import
- Commits `d0baa82` and `ef2187f` exist in git log
- `npx tsc --noEmit` exits 0
