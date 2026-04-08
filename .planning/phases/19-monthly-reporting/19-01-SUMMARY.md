---
phase: 19-monthly-reporting
plan: "01"
subsystem: ui, api
tags: [monthly-report, commentary, fiscal-year, xero, typescript]

requires:
  - phase: 16-forecast-rollover-rolling-periods
    provides: fiscal-year-utils with generateFiscalMonthKeys for parameterized FY ranges

provides:
  - Commentary persistence across month changes (loadSnapshot on handleMonthChange)
  - Commentary preservation on report regeneration (existingCommentary merged into fresh vendor data)
  - Parameterized FY range in generate route using business fiscal_year_start
  - Parameterized FY range in full-year route using business fiscal_year_start

affects:
  - 20-coaching-sessions
  - 22-quarterly-review-completion

tech-stack:
  added: []
  patterns:
    - "Always fetch business_profiles.fiscal_year_start before any FY range calculation in monthly-report routes"
    - "fetchCommentary accepts optional existingCommentary param to preserve coach notes across regeneration"
    - "handleMonthChange is async — awaits loadSnapshot and restores commentary before returning"

key-files:
  created: []
  modified:
    - src/app/finances/monthly-report/page.tsx
    - src/app/api/monthly-report/generate/route.ts
    - src/app/api/monthly-report/full-year/route.ts

key-decisions:
  - "profile query moved outside if/else branch in generate/route to ensure yearStartMonth available in all code paths"
  - "getFYStartMonth helper deleted from both routes — generateFiscalMonthKeys is single source of truth"
  - "handleMonthChange made async to await loadSnapshot — acceptable since it only fires on explicit user click"
  - "existingCommentary merges only accounts present in BOTH snapshots and fresh data — prevents ghost entries"

requirements-completed:
  - MR-COMMENTARY
  - MR-FY-FIX

duration: 20min
completed: 2026-04-08
---

# Phase 19 Plan 01: Monthly Reporting — Commentary Persistence + FY Fix Summary

**Coach commentary survives month changes and report regeneration via snapshot restore; YTD ranges now parameterized by business fiscal_year_start instead of hardcoded July**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-08T03:10:00Z
- **Completed:** 2026-04-08T03:26:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `handleMonthChange` is now async — on month switch it loads the snapshot for the new month and restores persisted commentary, so coaches never lose their notes when browsing months
- `fetchCommentary` accepts optional `existingCommentary` param; when a report is regenerated, persisted coach notes are merged into fresh vendor data so typed notes survive re-generation
- Both `generate/route.ts` and `full-year/route.ts` now read `fiscal_year_start` from `business_profiles` and pass it to `generateFiscalMonthKeys` — CY businesses (yearStartMonth=1) get Jan-Dec YTD ranges instead of the broken Jul-Dec range

## Task Commits

1. **Task 1: Fix commentary persistence across month changes and report regeneration** - `a41e00f` (feat)
2. **Task 2: Replace hardcoded July FY start with fiscal-year-utils in generate and full-year routes** - `94c24e2` (feat)

## Files Created/Modified

- `src/app/finances/monthly-report/page.tsx` - async handleMonthChange with snapshot restore; fetchCommentary signature extended with existingCommentary; handleGenerateReport loads persisted commentary before calling fetchCommentary
- `src/app/api/monthly-report/generate/route.ts` - Added fiscal-year-utils import; profile query moved outside if/else; getFYStartMonth removed; generateFiscalMonthKeys used for allFYMonths/fyStart/fyEnd
- `src/app/api/monthly-report/full-year/route.ts` - Same fiscal-year-utils changes as generate route; profile query moved before FY range calculation

## Decisions Made

- `profile` query moved outside the `if (budget_forecast_id) / else` branch in `generate/route.ts` so `yearStartMonth` is always available regardless of which branch resolves the budget forecast. Adds one extra DB query in the `budget_forecast_id` path but ensures correctness.
- `getFYStartMonth` helper function deleted from both routes — `generateFiscalMonthKeys` from `fiscal-year-utils.ts` is now the single source of truth for all FY month range calculations.
- `handleMonthChange` made async — this is safe because it only fires on explicit user month-picker interaction, not on every render cycle.
- Commentary merge only applies to accounts that exist in both the persisted snapshot and the fresh vendor data — prevents stale accounts from appearing after accounts are remapped.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — TypeScript compiled cleanly after both changes with zero errors.

## Known Stubs

None — all data paths are wired.

## Next Phase Readiness

- Monthly reporting commentary and FY handling now fully correct
- Phase 19 is complete (was ~80% built; these were the last two code gaps)
- Phase 20 (coaching sessions) and Phase 21 (KPI dashboards) can proceed independently

---
*Phase: 19-monthly-reporting*
*Completed: 2026-04-08*
