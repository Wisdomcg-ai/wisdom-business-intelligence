---
phase: 14-goals-wizard-first-time-extended-period
plan: "02"
subsystem: goals-wizard
tags: [extended-period, fiscal-year, api, hook, detection, ui]
dependency_graph:
  requires:
    - supabase/migrations/20260407_extended_period_support.sql (Plan 14-01)
    - src/lib/utils/fiscal-year-utils.ts (Plan 14-01)
    - src/app/goals/types.ts (Plan 14-01)
    - src/app/goals/services/financial-service.ts (Plan 14-01)
    - src/app/goals/services/strategic-planning-service.ts (Plan 14-01)
  provides:
    - src/app/api/goals/resolve-business/route.ts (fiscalYearStart in response)
    - src/app/goals/hooks/useStrategicPlanning.ts (extended period detection + state)
    - src/app/goals/components/step1/types.ts (extended getYearLabel)
    - src/app/goals/components/step1/FinancialGoalsSection.tsx (extended Year 1 label)
    - src/app/goals/components/Step1GoalsAndKPIs.tsx (extendedPeriodInfo prop)
    - src/app/goals/page.tsx (isExtendedPeriod from hook)
  affects:
    - Plan 14-03 (UI extended period step rendering)
tech_stack:
  added: []
  patterns:
    - Local variable pattern to avoid async state race in detection block (localFiscalYearStart)
    - Optional prop passthrough for backwards compatibility (extendedPeriodInfo?)
    - Two-path detection: restore saved state OR detect first-time near year end
key_files:
  created: []
  modified:
    - src/app/api/goals/resolve-business/route.ts
    - src/app/goals/hooks/useStrategicPlanning.ts
    - src/app/goals/components/step1/types.ts
    - src/app/goals/components/step1/FinancialGoalsSection.tsx
    - src/app/goals/components/Step1GoalsAndKPIs.tsx
    - src/app/goals/page.tsx
decisions:
  - localFiscalYearStart used instead of fiscalYearStart state in detection block (useState async update cannot be relied upon mid-function)
  - extendedPeriodInfo passed as optional prop so all existing call sites remain unchanged
  - getYearLabel signature extended with optional 4th param to preserve backwards compatibility
metrics:
  duration: ~7 minutes
  completed: "2026-04-07T22:49:24Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 0
  files_modified: 6
---

# Phase 14 Plan 02: Extended Period Detection + API Wiring Summary

**One-liner:** API + hook detection layer that identifies first-time clients near fiscal year end and activates extended Year 1 period (13-15 months), wiring the foundation from Plan 01 into the Goals Wizard.

## What Was Built

### Task 1: Extend resolve-business and goals API routes

- **resolve-business route** now queries `fiscal_year_start` from `business_profiles` and returns `fiscalYearStart` (defaults to 7 for AU FY) in the JSON response
- **goals route** unchanged — `SELECT *` already picks up the new `is_extended_period`, `year1_months`, `current_year_remaining_months` columns added in Plan 01

### Task 2: Wire extended period detection into useStrategicPlanning hook

- Imported `isNearYearEnd`, `getMonthsUntilYearEnd`, `DEFAULT_YEAR_START_MONTH` from fiscal-year-utils, and `ExtendedPeriodInfo` from goals/types
- Added 4 new state variables: `isExtendedPeriod`, `year1Months`, `currentYearRemainingMonths`, `fiscalYearStart`
- **Coach view:** extracts `fiscalYearStart` from resolve-business API response
- **Normal user view:** extracts `fiscal_year_start` from business_profiles profile query
- Both paths use a synchronous `localFiscalYearStart` local variable to avoid async useState race conditions in the detection block
- **Detection logic:** if returning client with saved `is_extended_period=true` — restore state; else if first-time client (`!loadedFinancialData`) and `isNearYearEnd` — activate extended period
- `loadedExtendedPeriod` destructured from `FinancialService.loadFinancialGoals`
- `extendedPeriod` passed to `FinancialService.saveFinancialGoals`
- `current_remainder` initiatives loaded (with user.id fallback) and saved
- `saveViaApi` body includes `extendedPeriod` in financial section and `current_remainder` in initiatives
- Return value exposes `isExtendedPeriod`, `year1Months`, `currentYearRemainingMonths`, `fiscalYearStart`

### Task 3: Update Step 1 Year labels for extended period

- `getYearLabel` in `types.ts` extended with optional 4th parameter `extendedPeriodInfo`
- When `idx === 1 && extendedPeriodInfo?.isExtendedPeriod`, returns combined label (e.g., "FY25 rem + FY26" with "14 months" subtitle)
- Year 2 and Year 3 labels unchanged
- `FinancialGoalsSection.tsx` accepts and destructures `extendedPeriodInfo` prop, passes it to all `getYearLabel` calls
- `Step1GoalsAndKPIs.tsx` accepts `extendedPeriodInfo` prop and forwards to `FinancialGoalsSection`
- `page.tsx` destructures `isExtendedPeriod`, `year1Months`, `currentYearRemainingMonths` from hook and passes as `extendedPeriodInfo` to `Step1GoalsAndKPIs`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed out-of-scope `profile` variable in detection block**
- **Found during:** Task 2 implementation
- **Issue:** The plan's detection code referenced `(profile as any)?.fiscal_year_start` but `profile` is declared inside the `else` block (normal user branch) and is out of scope at the detection block
- **Fix:** Introduced `localFiscalYearStart` local variable declared before the if/else branch, set synchronously in both coach and normal user paths. Used `localFiscalYearStart` in the detection block instead of the scoped `profile` variable
- **Files modified:** `src/app/goals/hooks/useStrategicPlanning.ts`
- **Commit:** 0573c19

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `4b02938` | feat(14-02): extend resolve-business API to return fiscalYearStart |
| 2 | `0573c19` | feat(14-02): wire extended period detection into useStrategicPlanning hook |
| 3 | `b92094b` | feat(14-02): update Step 1 year labels for extended period |

## Known Stubs

None — extended period detection is fully wired. The Year 1 label will show the combined label as soon as `isExtendedPeriod` becomes true. No placeholder UI.

## Self-Check: PASSED
