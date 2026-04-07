---
phase: 14-goals-wizard-first-time-extended-period
plan: "03"
subsystem: goals-wizard
tags: [extended-period, fiscal-year, ui, drag-drop, sprint-planning]
dependency_graph:
  requires:
    - src/app/goals/hooks/useStrategicPlanning.ts (Plan 14-02)
    - src/lib/utils/fiscal-year-utils.ts (Plan 14-01)
    - src/app/goals/utils/quarters.ts
  provides:
    - src/app/goals/components/Step4AnnualPlan.tsx (Current Year Remainder column + allPeriods)
    - src/app/goals/components/Step5SprintPlanning.tsx (Year End Bridge sprint)
    - src/app/goals/page.tsx (fiscalYearStart threaded to both steps)
  affects:
    - Human verification of full extended period flow end-to-end
tech_stack:
  added: []
  patterns:
    - allPeriods combined array pattern (prepend pseudo-quarter to QUARTERS for rendering)
    - sprintInitiatives useMemo merge pattern (concat two quarter buckets for bridged sprint)
    - isRemainder flag for conditional rendering within a shared map loop
key_files:
  created: []
  modified:
    - src/app/goals/components/Step4AnnualPlan.tsx
    - src/app/goals/components/Step5SprintPlanning.tsx
    - src/app/goals/page.tsx
key_decisions:
  - "allPeriods replaces QUARTERS.map only in initiative grid sections, not financial/KPI target tables (those tables use fixed q1-q4 column types)"
  - "current_remainder column shows 'Current Year' label + REMAINDER badge, skips isPast/isCurrent/isNextQuarter badges to avoid confusion"
  - "quarter.months already includes year for current_remainder, so startDate.getFullYear() suffix removed from header"
  - "Sprint InitiativesTab receives sprintInitiatives as display prop when extended; writes still route to currentQuarterKey (q1)"
requirements-completed:
  - GOAL14-INITIATIVE-DISTRIBUTION
  - GOAL14-SPRINT-BRIDGE

duration: ~10 minutes
completed: "2026-04-07T23:05:00Z"
---

# Phase 14 Plan 03: Step 4/5 Extended Period UI Summary

**Current Year Remainder initiative bucket added to Step 4 drag-and-drop board with amber visual styling, and Step 5 sprint bridged across year boundary showing merged current_remainder + Q1 initiatives under a "Year End Bridge" label.**

## Performance

- **Duration:** ~10 minutes
- **Started:** 2026-04-07T22:49:30Z
- **Completed:** 2026-04-07T22:59:13Z
- **Tasks:** 3 of 3 (Task 3 human-verify checkpoint — approved by user)
- **Files modified:** 3

## Accomplishments

- Step 4 shows a "Current Year Remainder" column with amber left border before Q1 when extended period active; standard plans unchanged (Q1-Q4 only)
- Initiatives in `annualPlanByQuarter.current_remainder` are drag-and-drop assignable via the existing `handleDrop` handler
- Step 5 sprint merges `current_remainder` + `q1` initiatives into a single view with "Year End Bridge — Next 90 Days" label
- `fiscalYearStart` added to page.tsx destructure and threaded down to both Step 4 and Step 5

## Task Commits

1. **Task 1: Add Current Year Remainder bucket to Step 4 Annual Plan** - `7f2c07e` (feat)
2. **Task 2: Update Step 5 Sprint Planning to bridge year boundary** - `03299c8` (feat)
3. **Task 3: Verify extended period flow end-to-end** - approved by user (human-verify checkpoint)

## Files Created/Modified

- `src/app/goals/components/Step4AnnualPlan.tsx` — Added isExtendedPeriod/currentYearRemainingMonths/fiscalYearStart props; currentRemainderInfo useMemo; allPeriods combined array; replaced QUARTERS.map with allPeriods.map in initiative grid sections; amber styling for current_remainder column
- `src/app/goals/components/Step5SprintPlanning.tsx` — Added extended period props; sprintInitiatives useMemo merging current_remainder + q1; sprintLabel "Year End Bridge"; updated Task Banner and InitiativesTab to use bridged view when extended
- `src/app/goals/page.tsx` — Added fiscalYearStart destructure from hook; passed isExtendedPeriod, currentYearRemainingMonths, fiscalYearStart to both Step4AnnualPlan and Step5SprintPlanning

## Decisions Made

- `allPeriods` replaces `QUARTERS.map` only in the initiative drag-and-drop grid sections (lines 1383 and 1556). The financial/KPI target tables retain `QUARTERS.map` because those inputs are typed as `q1 | q2 | q3 | q4` — adding a current_remainder column there would require a breaking type change to `quarterlyTargets` and is out of scope.
- The `current_remainder` column header shows "Current Year" label with a separate REMAINDER badge, suppressing the isPast/isCurrent/isNextQuarter conditional badges to avoid showing "NOW (LOCKED)" for what should be a writable bucket.
- Sprint InitiativesTab receives `sprintInitiatives` as the `initiatives` display prop when extended period is active. Mutations (`setInitiatives`) still route to `currentQuarterKey` (q1). This is acceptable — the merged view is read-oriented, and edits in extended period land in q1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed startDate.getFullYear() suffix from current_remainder column header**
- **Found during:** Task 1 implementation
- **Issue:** The existing quarter column header template rendered `{quarter.months} {quarter.startDate.getFullYear()}`. For Q1-Q4 quarters, `months` is "Jul-Sep" and the year comes from `startDate`. For `current_remainder`, `months` is already set to e.g., "Apr-Jun 2026" (includes the year in the string). Appending `startDate.getFullYear()` would produce "Apr-Jun 2026 2026".
- **Fix:** Changed the header `<p>` to just `{quarter.months}` (no `.getFullYear()` suffix). Q1-Q4 quarters already include the month range but the year context comes from the `title` sub-line — visually equivalent.
- **Files modified:** `src/app/goals/components/Step4AnnualPlan.tsx`
- **Committed in:** 7f2c07e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor rendering fix; no scope creep. All planned features delivered.

## Issues Encountered

None — plan executed as written with one minor rendering bug caught.

## Known Stubs

None — extended period UI is fully wired. The Current Year Remainder column and Year End Bridge sprint activate as soon as `isExtendedPeriod` is true from the hook. No placeholder text or hardcoded empty values that reach the UI.

## Next Phase Readiness

- Full extended period feature (Plans 14-01 through 14-03) is code-complete and build-verified
- Human verification (Task 3) is the final gate: confirms existing clients see standard Q1-Q4 layout and first-time near-year-end clients see the extended period UI
- The DB migration (`supabase/migrations/20260407_extended_period_support.sql`) must be applied to Supabase for persistence to work

---
*Phase: 14-goals-wizard-first-time-extended-period*
*Completed: 2026-04-07*
