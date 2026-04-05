---
phase: 01-fix-opex-double-counting-critical
plan: 01
subsystem: ui
tags: [forecast, opex, team-costs, calculator, typescript]

# Dependency graph
requires: []
provides:
  - isTeamCost guard in useForecastWizard.ts opex reducer (excludes team lines from P&L OpEx sum)
  - isTeamCost guard in BudgetTracker.tsx opexAllocated reducer (fixes 461% utilization)
affects: [forecast-wizard, budget-tracker, step8-review, pl-summary]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isTeamCost guard pattern: skip lines where isTeamCost(line.name) === true in all opex reducers"

key-files:
  created: []
  modified:
    - src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts
    - src/app/finances/forecast/components/wizard-v4/components/BudgetTracker.tsx

key-decisions:
  - "Fix at calculation layer only — no data migration, no schema change (D-05)"
  - "isTeamCost() from opex-classifier.ts is the single source of truth for team line detection"
  - "netProfit formula (grossProfit - teamCosts - opex - ...) unchanged; only opex sum corrected"

patterns-established:
  - "isTeamCost guard: every opex reduce() callback must call isTeamCost(line.name) and return sum early if true"

requirements-completed: [R1.1]

# Metrics
duration: 8min
completed: 2026-04-05
---

# Phase 1 Plan 01: Fix OpEx Double-Counting Summary

**isTeamCost guards added to useForecastWizard.ts and BudgetTracker.tsx opex reducers, eliminating the 461% budget utilization and correcting netProfit in the forecast P&L summary**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-05T03:05:00Z
- **Completed:** 2026-04-05T03:13:57Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `isTeamCost(line.name)` guard to the `state.opexLines.reduce()` callback in `useForecastWizard.ts` `calculateYearSummary` — P&L netProfit now excludes wages/salaries/super/contractors from OpEx
- Added `isTeamCost(line.name)` guard to the `opexLines.reduce()` callback in `BudgetTracker.tsx` — budget utilization bar no longer shows 461% caused by double-counting team cost lines
- TypeScript compiles clean (`npx tsc --noEmit` exits 0) and lint shows no new errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add isTeamCost guard to useForecastWizard.ts OpEx reducer** - `ed00a9d` (fix)
2. **Task 2: Add isTeamCost guard to BudgetTracker.tsx opexAllocated reducer** - `7d6e60f` (fix)

## Files Created/Modified

- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` - Added import of `isTeamCost` and guard in opex reduce block (2 lines added)
- `src/app/finances/forecast/components/wizard-v4/components/BudgetTracker.tsx` - Added import of `isTeamCost` and guard in opexAllocated reduce block (2 lines added)

## Decisions Made

- Fixed at the calculation layer only (no data migration, no schema changes) — consistent with D-05 from research
- `isTeamCost()` from `utils/opex-classifier.ts` is the established single source of truth; no new logic introduced
- `Step8Review.tsx` was NOT modified — it consumes the corrected `summary` prop automatically via wizard state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Core double-counting bug is fixed in the calculation layer
- Plan 01-02 (if applicable) can now address any remaining OpEx display/UI concerns with confidence the underlying numbers are correct
- Step 8 Review waterfall will automatically reflect corrected numbers (confirmed by plan spec and unchanged code path)

---
*Phase: 01-fix-opex-double-counting-critical*
*Completed: 2026-04-05*
