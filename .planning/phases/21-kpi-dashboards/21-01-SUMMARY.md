---
phase: 21-kpi-dashboards
plan: 01
subsystem: ui, api
tags: [recharts, dashboard, xero, fiscal-year, charts, actuals, forecast]

# Dependency graph
requires:
  - phase: 16-forecast-rollover-rolling-periods
    provides: forecast_pl_lines with actual_months and forecast_months JSONB data
  - phase: 14-goals-wizard-first-time-extended-period
    provides: fiscal-year-utils generateFiscalMonthKeys helper
provides:
  - GET /api/forecast/dashboard-actuals — monthly Revenue/GP/NP actual vs forecast per fiscal month
  - useXeroActuals hook — typed MonthlyChartPoint[] chart data with loading/empty states
  - FinancialSummaryCharts component — 3-panel Recharts AreaChart (Revenue, GP, NP)
  - Business dashboard financial charts above metrics table
affects:
  - 21-02-PLAN, 21-03-PLAN (same dashboard page, same chart patterns)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-ID resolution (resolveBusinessIds) for all forecast queries"
    - "generateFiscalMonthKeys for fiscal-year-aware month ordering"
    - "hasData:false pattern — API returns 200 with empty indicator, not 404"
    - "Forecast area rendered before Actual area in AreaChart so actuals overlay"
    - "null for zero-actual months to avoid misleading zero baseline on charts"

key-files:
  created:
    - src/app/api/forecast/dashboard-actuals/route.ts
    - src/app/business-dashboard/hooks/useXeroActuals.ts
    - src/app/business-dashboard/components/FinancialSummaryCharts.tsx
  modified:
    - src/app/business-dashboard/page.tsx

key-decisions:
  - "Dual-ID resolution used at API level (resolveBusinessIds) — non-negotiable per project memory"
  - "generateFiscalMonthKeys drives month ordering — no hardcoded Jan-Dec"
  - "null returned for zero-actual months to avoid misleading zero baseline on charts"
  - "hasData:false with 200 OK when no forecast exists — graceful empty state, not error"
  - "Forecast area rendered first in AreaChart so actual data visually overlays on top"
  - "last_synced from financial_metrics.updated_at — uses same dual-ID loop"

patterns-established:
  - "ChartCard sub-component pattern for reusable Recharts AreaChart panels"
  - "SkeletonCard animate-pulse for loading state with fixed h-[220px]"

requirements-completed: [KPI-01]

# Metrics
duration: 20min
completed: 2026-04-08
---

# Phase 21 Plan 01: KPI Dashboards — Financial Charts Summary

**Recharts AreaChart panels for Revenue, Gross Profit, and Net Profit added to business dashboard, pulling actual vs forecast data from forecast_pl_lines via fiscal-year-aware API with dual-ID resolution**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-08T04:00:00Z
- **Completed:** 2026-04-08T04:20:03Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- New API endpoint `/api/forecast/dashboard-actuals` aggregates monthly actuals and forecasts from `forecast_pl_lines` using fiscal-year month ordering
- `useXeroActuals` hook provides typed `MonthlyChartPoint[]` data with loading/empty state management
- `FinancialSummaryCharts` component renders 3-panel area chart grid with skeleton loading, empty state (no Xero data message), and last-synced timestamp
- Business dashboard page updated additively — charts appear between QuarterProgressCard and Metrics Table with zero changes to existing components

## Task Commits

Each task was committed atomically:

1. **Task 1: Dashboard actuals API + useXeroActuals hook** - `ee4efb5` (feat)
2. **Task 2: FinancialSummaryCharts component + page.tsx integration** - `df897e7` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/app/api/forecast/dashboard-actuals/route.ts` - GET endpoint, dual-ID resolution, fiscal month aggregation, Revenue/COGS/OpEx classification
- `src/app/business-dashboard/hooks/useXeroActuals.ts` - Client hook, MonthlyChartPoint interface, fetch with cleanup/cancellation
- `src/app/business-dashboard/components/FinancialSummaryCharts.tsx` - 3-panel AreaChart component, skeleton loading, empty state
- `src/app/business-dashboard/page.tsx` - Added FinancialSummaryCharts between QuarterProgressCard and Metrics Table

## Decisions Made
- Dual-ID resolution applied at API level using `resolveBusinessIds` — critical per project memory for Xero lookup reliability
- `generateFiscalMonthKeys` drives month order — AU FY default (Jul-Jun), respects `yearStartMonth` param
- Zero-actual months return `null` instead of `0` to avoid misleading flat baseline on Recharts AreaChart
- API returns `{ hasData: false }` with 200 OK when no forecast found — not a 404, graceful empty state
- Forecast area rendered before Actual area in `AreaChart` so orange actual data visually overlays slate forecast

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx tsc --noEmit <specific files>` fails due to `@/` path aliases not resolved in direct mode — confirmed no errors by running `tsc --noEmit` on full project (zero errors in new files).
- Build's `ENOENT` on `.next/static` manifests is a pre-existing Next.js file-system glitch on this machine, not caused by new code; compilation completed 126/126 pages cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 21-02 and 21-03 can use the same `useXeroActuals` / `MonthlyChartPoint` patterns established here
- Dashboard charts render empty state gracefully until Xero data flows through the wizard

---
*Phase: 21-kpi-dashboards*
*Completed: 2026-04-08*
