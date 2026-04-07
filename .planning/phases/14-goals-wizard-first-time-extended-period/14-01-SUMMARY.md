---
phase: 14-goals-wizard-first-time-extended-period
plan: "01"
subsystem: goals-wizard
tags: [extended-period, fiscal-year, db-migration, services, types]
dependency_graph:
  requires: []
  provides:
    - supabase/migrations/20260407_extended_period_support.sql
    - src/lib/utils/fiscal-year-utils.ts (getMonthsUntilYearEnd, isNearYearEnd, YEAR_END_PROXIMITY_MONTHS)
    - src/app/goals/types.ts (ExtendedPeriodInfo, QuarterType CR)
    - src/app/goals/services/financial-service.ts (extendedPeriod save/load)
    - src/app/goals/services/strategic-planning-service.ts (current_remainder step type)
  affects:
    - Plan 14-02 (hook + API wiring)
    - Plan 14-03 (UI changes)
tech_stack:
  added: []
  patterns:
    - DB schema extension via ALTER TABLE ADD COLUMN IF NOT EXISTS
    - Optional parameter with default fallbacks for backwards compatibility
    - Return type extension with defaulted extendedPeriod object on all error paths
key_files:
  created:
    - supabase/migrations/20260407_extended_period_support.sql
  modified:
    - src/lib/utils/fiscal-year-utils.ts
    - src/app/goals/types.ts
    - src/app/goals/services/financial-service.ts
    - src/app/goals/services/strategic-planning-service.ts
    - src/app/goals/services/snapshot-service.ts
decisions:
  - CR maps to Q1 in getNextQuarter (current_remainder precedes Q1 in the extended period flow)
  - extendedPeriod defaults to { isExtendedPeriod: false, year1Months: 12, currentYearRemainingMonths: 0 } on all error/no-data paths for safe backwards compatibility
metrics:
  duration: ~15 minutes
  completed: "2026-04-07T22:39:48Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 5
---

# Phase 14 Plan 01: Extended Period Foundation Layer Summary

**One-liner:** DB migration + fiscal-year proximity helpers + type/service foundation enabling extended period (13-15 month Year 1) for first-time clients near fiscal year end.

## What Was Built

### Task 1: DB migration + fiscal year proximity helpers + type updates

- **Migration file** `supabase/migrations/20260407_extended_period_support.sql` adds 3 columns to `business_financial_goals`: `is_extended_period BOOLEAN DEFAULT false`, `year1_months INTEGER DEFAULT 12`, `current_year_remaining_months INTEGER DEFAULT 0`
- **fiscal-year-utils.ts** gains `YEAR_END_PROXIMITY_MONTHS = 3`, `getMonthsUntilYearEnd(today, yearStartMonth)`, and `isNearYearEnd(today, yearStartMonth, thresholdMonths)` in a new "Extended Period Detection" section
- **goals/types.ts** gains `ExtendedPeriodInfo` interface and `QuarterType` extended to include `'CR'` (current remainder bucket)

### Task 2: Update FinancialService and StrategicPlanningService for extended period

- **financial-service.ts** `saveFinancialGoals` now accepts optional `extendedPeriod` param and writes `is_extended_period`, `year1_months`, `current_year_remaining_months` to the upsert
- **financial-service.ts** `loadFinancialGoals` return type extended with `extendedPeriod` field; all return paths (early error, no-data, success, catch) return the object with safe defaults
- **strategic-planning-service.ts** `saveInitiatives` and `loadInitiatives` `stepType` unions extended with `'current_remainder'`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed snapshot-service.ts Record<QuarterType> exhaustiveness failure**
- **Found during:** Task 1 build verification
- **Issue:** Adding `'CR'` to `QuarterType` caused a compile error in `snapshot-service.ts` at `getNextQuarter` — the `Record<QuarterType, QuarterType | null>` map was missing the `'CR'` key
- **Fix:** Added `'CR': 'Q1'` to the `quarterMap` object (CR precedes Q1 in the extended period flow)
- **Files modified:** `src/app/goals/services/snapshot-service.ts`
- **Commit:** 2701620

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `2701620` | feat(14-01): DB migration + fiscal year proximity helpers + type updates |
| 2 | `5886924` | feat(14-01): update FinancialService and StrategicPlanningService for extended period |

## Known Stubs

None — this plan creates pure data/utility layer with no UI. No placeholder values or hardcoded empty returns that reach the UI.

## Self-Check: PASSED
