---
phase: 17-quarterly-review-forecast-integration
plan: 03
subsystem: ui
tags: [react, typescript, one-page-plan, financial-goals, year-toggle]

# Dependency graph
requires:
  - phase: 14-goals-wizard-first-time-extended-period
    provides: business_financial_goals year2 columns (revenue_year2, gross_profit_year2, etc.)
provides:
  - year2 financial goals in OnePagePlanData type
  - year2 coreMetrics in OnePagePlanData type
  - Current Year / Next Year toggle on One Page Plan page
affects:
  - one-page-plan
  - plan-snapshot-service (snapshots now include year2 data)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - IIFE pattern in JSX to compute displayYear/displayMetrics before render
    - cn() for conditional button styling on toggles

key-files:
  created: []
  modified:
    - src/app/one-page-plan/types.ts
    - src/app/one-page-plan/services/plan-data-assembler.ts
    - src/app/one-page-plan/page.tsx

key-decisions:
  - "displayYear/displayMetrics computed via IIFE in JSX — keeps all toggle logic co-located with the table"
  - "Toggle placed in Goals & Metrics section header (not page level) — only financial section toggles, not vision/SWOT/initiatives"
  - "year3 and quarter columns unchanged regardless of toggle — only the middle (year1/year2) column switches"
  - "year2 data always shown even if all zeros — no conditional hiding of Next Year button"
  - "displayYearLabel shows FY{planYear} or FY{planYear+1} sub-label under column header for clarity"

patterns-established:
  - "Year toggle pattern: useState<'current' | 'next'>('current') + derived display variables"

requirements-completed: [REQ-17-07]

# Metrics
duration: 10min
completed: 2026-04-08
---

# Phase 17 Plan 03: One Page Plan Year Toggle Summary

**Year2 financial goals surfaced on One Page Plan via Current Year / Next Year toggle — coaches can compare trajectory without disrupting the existing view**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-08T02:48:00Z
- **Completed:** 2026-04-08T02:58:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extended `OnePagePlanData` type with `year2` in both `financialGoals` and `coreMetrics`
- Mapped all 8 year2 fields from `business_financial_goals` in the assembler (no query change needed — `select('*')` already fetches them)
- Added Current Year / Next Year toggle to the Goals & Key Metrics section header with brand-navy active state
- Middle column (year1/year2) responds to toggle; year3 and quarter columns remain fixed
- Column header shows dynamic label (e.g., FY2025 / FY2026) to clarify which year is displayed
- Default view is Current Year — zero disruption to existing users

## Task Commits

1. **Task 1: Add year2 to OnePagePlanData type and assembler mapping** - `4ef9fa6` (feat)
2. **Task 2: Add year toggle to One Page Plan page** - `1de9077` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `src/app/one-page-plan/types.ts` - Added `year2` to `financialGoals` and `coreMetrics` interfaces
- `src/app/one-page-plan/services/plan-data-assembler.ts` - Mapped `revenue_year2`, `gross_profit_year2`, `net_profit_year2` and 5 core metric year2 fields
- `src/app/one-page-plan/page.tsx` - Added `yearView` state, toggle UI, IIFE-computed `displayYear`/`displayMetrics`/`displayYearLabel`

## Decisions Made
- IIFE pattern used in JSX to scope `displayYear`/`displayMetrics` variables without polluting component scope or creating separate computed variables above the return statement
- Toggle placed in the Goals & Metrics section header bar (not the page level) — surgical change, only financial/metrics section toggles
- Year label sub-text added to column header so the user knows exactly which fiscal/calendar year they are viewing
- `year2` always present in shape (never conditional) to keep snapshot data consistent

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- One Page Plan now shows next-year targets when coaches are in planning season
- year2 data in snapshots will include the toggle-visible data from this point forward
- Ready for remaining Phase 17 plans

## Self-Check: PASSED
- `src/app/one-page-plan/types.ts` — modified, year2 present
- `src/app/one-page-plan/services/plan-data-assembler.ts` — modified, revenue_year2 mapped
- `src/app/one-page-plan/page.tsx` — modified, yearView state and toggle present
- Commits `4ef9fa6` and `1de9077` exist in git log

---
*Phase: 17-quarterly-review-forecast-integration*
*Completed: 2026-04-08*
