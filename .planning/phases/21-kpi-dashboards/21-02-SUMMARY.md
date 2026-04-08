---
phase: 21-kpi-dashboards
plan: 02
subsystem: ui
tags: [coach, kpi, dashboard, business-dashboard, react, nextjs]

# Dependency graph
requires:
  - phase: 21-kpi-dashboards
    provides: useBusinessDashboard hook with overrideBusinessId support
provides:
  - Coach KPI dashboard page at /coach/clients/[id]/kpi (read-only)
  - KPI Dashboard tab in client detail page navigation
affects: [coach-portal, business-dashboard, client-navigation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Coach read-only view reuses existing useBusinessDashboard(clientId) hook
    - Tab in ClientFileTabs links to external route (same pattern as financials/goals tabs)

key-files:
  created:
    - src/app/coach/clients/[id]/kpi/page.tsx
  modified:
    - src/app/coach/clients/[id]/page.tsx
    - src/components/coach/ClientFileTabs.tsx

key-decisions:
  - "useBusinessDashboard(id) called with clientId from URL params — no separate data path"
  - "KPI tab in ClientFileTabs links to /coach/clients/[id]/kpi rather than rendering inline"
  - "FinancialSummaryCharts not yet available (Plan 01); page renders QuarterProgressCard + QTD grid instead"
  - "Read-only enforced by omitting all updateCurrentSnapshot/updatePastSnapshot calls"

patterns-established:
  - "Coach override pattern: useBusinessDashboard(overrideBusinessId) is the correct way to mirror a client's dashboard"

requirements-completed: [KPI-02]

# Metrics
duration: 6min
completed: 2026-04-08
---

# Phase 21 Plan 02: Coach KPI Dashboard Summary

**Read-only coach KPI view at /coach/clients/[id]/kpi using useBusinessDashboard(clientId) with QuarterProgressCard and QTD metrics grid**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-08T04:14:07Z
- **Completed:** 2026-04-08T04:19:49Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Created `/coach/clients/[id]/kpi/page.tsx` that calls `useBusinessDashboard(id)` with the client's business profile ID
- Renders `QuarterProgressCard` with full QTD revenue/GP/NP metrics and trend status
- Shows QTD vs quarterly target summary grid (Revenue, Gross Profit, Net Profit)
- Added `kpi` tab to `ClientFileTabs` and `TabId` union type
- Added KPI tab content to client detail page with link to the KPI route

## Task Commits

1. **Task 1: Coach KPI page + client detail navigation link** - `9c93757` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `src/app/coach/clients/[id]/kpi/page.tsx` - New coach KPI page, read-only mirror of client dashboard
- `src/app/coach/clients/[id]/page.tsx` - Added TrendingUp import + kpi tab content block
- `src/components/coach/ClientFileTabs.tsx` - Added 'kpi' to TabId union, added KPI Dashboard tab entry

## Decisions Made
- `useBusinessDashboard(id)` called directly with clientId from `useParams()` — the hook already resolves business profile IDs from business IDs, so no additional lookup is needed
- KPI tab in `ClientFileTabs` follows the same pattern as `financials` and `goals` tabs: tab button navigates to an external route via a Link component, keeping the coach client detail page thin
- `FinancialSummaryCharts` from Plan 01 was not available at execution time; substituted with inline QTD metrics summary grid (3-column, bg-gray-50 cards)
- Read-only is enforced by the absence of any write callbacks (no `updateCurrentSnapshot`, no save handlers)

## Deviations from Plan

None - plan executed exactly as written, with one minor substitution: `FinancialSummaryCharts` was planned conditionally ("if not yet available, import conditionally or just render charts section") and it was not available, so the inline grid was used as specified in the plan's fallback.

## Issues Encountered
- `npm run build` fails with ENOENT on `.next/static` directory — pre-existing filesystem issue unrelated to new code. TypeScript check (`npx tsc --noEmit`) passes cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Coach KPI view is live and functional
- `FinancialSummaryCharts` (Plan 21-01) can be added to the KPI page once that component is available
- No blockers for Phase 21 continuation

---
*Phase: 21-kpi-dashboards*
*Completed: 2026-04-08*
