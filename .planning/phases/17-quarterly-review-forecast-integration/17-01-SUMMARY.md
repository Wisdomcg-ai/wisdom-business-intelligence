---
phase: 17-quarterly-review-forecast-integration
plan: "01"
subsystem: api
tags: [fiscal-year, quarterly-review, forecast, actuals, variance]

requires:
  - phase: 16-forecast-rollover-rolling-periods
    provides: financial_forecasts + forecast_pl_lines schema with forecast_months/actual_months JSONB columns

provides:
  - getMonthKeysForQuarter helper in fiscal-year-utils.ts (returns 3 YYYY-MM keys for any FY/CY quarter)
  - sumMonthsForKeys helper in fiscal-year-utils.ts (sums JSONB month values for specific keys)
  - GET /api/forecast/quarterly-summary endpoint returning forecast vs actual variance data for any quarter

affects:
  - 17-02 (quarterly review panel UI that calls this API)
  - 17-03 (any further quarterly review integration work)

tech-stack:
  added: []
  patterns:
    - "Quarter month key extraction via slice on generateFiscalMonthKeys output (quarter-1)*3 offset"
    - "Forecast vs actual variance pattern: variance = actual - forecast, variancePct = round((variance/forecast)*100)"
    - "hasActuals flag derived from any non-zero actual value across all pl_lines for the quarter"

key-files:
  created:
    - src/app/api/forecast/quarterly-summary/route.ts
  modified:
    - src/lib/utils/fiscal-year-utils.ts

key-decisions:
  - "getMonthKeysForQuarter uses generateFiscalMonthKeys slice — zero new calendar math, reuses proven function"
  - "sumMonthsForKeys handles null/undefined JSONB gracefully returning 0 — safe for lines without actuals"
  - "variancePct returns 0 when forecast is 0 to avoid divide-by-zero"
  - "quarterly-summary route copies isRevenue/isCOGS classification from actuals-summary for consistency"
  - "hasActuals true if ANY actual value is non-zero across all lines for the quarter"

patterns-established:
  - "Quarter aggregation: getMonthKeysForQuarter + sumMonthsForKeys are the standard pattern for quarter data"
  - "API error logging: console.error('[quarterly-summary]', ...) prefix matches actuals-summary convention"

requirements-completed:
  - REQ-17-01
  - REQ-17-02
  - REQ-17-03
  - REQ-17-04

duration: 10min
completed: 2026-04-08
---

# Phase 17 Plan 01: Quarterly Review Forecast Integration Summary

**Quarterly forecast vs actual summary API with getMonthKeysForQuarter/sumMonthsForKeys helpers enabling per-quarter revenue/GP/NP variance data retrieval from forecast_pl_lines JSONB columns**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-08T02:46:00Z
- **Completed:** 2026-04-08T02:56:06Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `getMonthKeysForQuarter` to fiscal-year-utils.ts — returns 3 YYYY-MM keys for any quarter, supporting both FY (yearStartMonth=7) and CY (yearStartMonth=1) year types
- Added `sumMonthsForKeys` to fiscal-year-utils.ts — null-safe JSONB month value aggregator for any set of month keys
- Created `GET /api/forecast/quarterly-summary` endpoint returning revenue/COGS/grossProfit/opex/netProfit with forecast, actual, variance, and variancePct per category, plus a `hasActuals` flag

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getMonthKeysForQuarter + sumMonthsForKeys** - `c83bf4e` (feat)
2. **Task 2: Create GET /api/forecast/quarterly-summary endpoint** - `4563dfe` (feat)

## Files Created/Modified
- `src/lib/utils/fiscal-year-utils.ts` - Added two new exported helpers in "Quarterly Aggregation Helpers" section
- `src/app/api/forecast/quarterly-summary/route.ts` - New endpoint; 205 lines; full auth, param validation, and error handling

## Decisions Made
- `getMonthKeysForQuarter` uses `generateFiscalMonthKeys` + slice rather than re-implementing calendar math — zero duplication, proven correctness
- `sumMonthsForKeys` uses optional chaining `monthsData?.[key]` so null/undefined JSONB is handled without a guard branch
- `variancePct` short-circuits to 0 when forecast is 0 to prevent divide-by-zero NaN
- Copied `isRevenue`/`isCOGS` category arrays from actuals-summary to keep classification consistent across both APIs
- `hasActuals` derived by checking if any `lineActual !== 0` during the aggregation loop — O(n) single pass

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 17 Plan 02 can now call `GET /api/forecast/quarterly-summary?forecastId=&quarter=&fiscalYear=&yearStartMonth=` to get structured variance data
- Both helper functions are reusable by any future consumer outside the API layer
- TypeScript compiles clean with zero errors

---
*Phase: 17-quarterly-review-forecast-integration*
*Completed: 2026-04-08*
