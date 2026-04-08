---
phase: 16-forecast-rollover-rolling-periods
plan: "01"
subsystem: forecast
tags: [forecast, fiscal-year, lock, read-only, planning-season]
dependency_graph:
  requires: []
  provides: [fiscal_year_filter_on_getOrCreate, planning_season_detection, forecast_lock_enforcement]
  affects: [forecast-service, fiscal-year-utils, ForecastSelector, ForecastWizardV4]
tech_stack:
  added: []
  patterns: [fiscal-year-filter, planning-season-awareness, read-only-state-guard]
key_files:
  created: []
  modified:
    - src/app/finances/forecast/services/forecast-service.ts
    - src/app/finances/forecast/utils/fiscal-year.ts
    - src/app/finances/forecast/components/ForecastSelector.tsx
    - src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx
decisions:
  - fiscal_year filter added directly to Supabase query (not post-filter) so DB does the work
  - isReadOnly checked in both handleComplete and performAutoSave to prevent any save path on locked forecasts
  - planning season threshold set to 3 months (within 3 months of year end = next FY default)
  - Duplicate action still available on locked forecasts so users can create editable copies
metrics:
  duration: "~20 minutes"
  completed_date: "2026-04-08"
  tasks_completed: 2
  files_modified: 4
---

# Phase 16 Plan 01: Forecast Fiscal Year Filter + Lock Enforcement Summary

**One-liner:** Added `.eq('fiscal_year', fiscalYear)` DB filter to getOrCreateForecast, planning-season-aware getForecastFiscalYear (returns currentFY+1 within 3 months of year end), and `is_locked` read-only enforcement in ForecastSelector (View button + Lock badge) and ForecastWizardV4 (banner + blocked save).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix getOrCreateForecast fiscal_year filter + planning-season getForecastFiscalYear | 3f3acc3 | forecast-service.ts, fiscal-year.ts |
| 2 | Enforce read-only lock in ForecastSelector and ForecastWizardV4 | eeb38dd | ForecastSelector.tsx, ForecastWizardV4.tsx |

## What Was Built

### Task 1: Fiscal Year Filter + Planning Season Detection

**forecast-service.ts:**
- Added `.eq('fiscal_year', fiscalYear)` to the `getOrCreateForecast` Supabase query chain, between `.in('business_id', idsToTry)` and `.order(...)`. This is the prerequisite for multi-year forecast management — without it, `FY2026` and `FY2027` queries would both return the most recently updated forecast regardless of year.
- Removed `forecast.fiscal_year !== fiscalYear` from the `needsUpdate` condition. Since the DB query now guarantees the returned forecast matches `fiscalYear`, this check would never be true and could spuriously trigger date updates.

**fiscal-year.ts:**
- Imported `isNearYearEnd` from `@/lib/utils/fiscal-year-utils`.
- Rewrote `getForecastFiscalYear` to return `currentFY + 1` when within 3 months of fiscal year end (planning season). This means coaches preparing next year's budget during Apr/May/Jun automatically see the FY2027 forecast instead of FY2026.
- Added new export `isPlanningSeasonActive(yearStartMonth)` returning a boolean — ready for the page banner in Plan 02.

### Task 2: Read-Only Lock Enforcement

**ForecastSelector.tsx:**
- Added `is_locked?: boolean` to `ForecastVersion` interface.
- Imported `Lock` and `Eye` from lucide-react.
- Added a gray "Locked" badge (Lock icon) in the status badge row for locked forecasts.
- Changed the action button to show "View" (with Eye icon) instead of "Edit"/"Continue Editing" for locked forecasts — the `onSelect` callback still fires, enforcement happens in the wizard.
- Hidden "Set as Active" and "Delete" from the dropdown for locked forecasts. "Duplicate" remains visible so users can create an editable copy.

**ForecastWizardV4.tsx:**
- Imported `Lock` from lucide-react.
- Added `isReadOnly` state (default `false`).
- After loading forecast data in `loadData`, checks `loadedForecast?.is_locked` and sets `isReadOnly = true` if true.
- `handleComplete` returns early with `toast.error(...)` if `isReadOnly`.
- `performAutoSave` skips if `isReadOnly` (prevents autosave writes on locked forecasts).
- Gray lock banner shown at top of wizard content area when `isReadOnly` is active: "This forecast is locked (read-only). Duplicate it to make changes."
- Generate Forecast button disabled (with tooltip) when `isReadOnly`.

## Decisions Made

1. **Fiscal year filter at DB level** — Added `.eq('fiscal_year', fiscalYear)` to the Supabase query rather than filtering client-side. DB filtering is more efficient and prevents returning wrong-FY data that would need to be discarded.

2. **Removed needsUpdate fiscal_year check** — Once the query guarantees a fiscal year match, the `forecast.fiscal_year !== fiscalYear` condition in `needsUpdate` becomes dead code. Left in, it would trigger a date update on every load for rows that already have the correct year. Removed to prevent unnecessary DB writes.

3. **3-month planning season threshold** — Matches the `isNearYearEnd` default in fiscal-year-utils. For AU fiscal year (July start), this means planning season runs April–June, which aligns with when coaches actually prepare next-year budgets.

4. **Lock enforcement in both handleComplete and performAutoSave** — Blocking only the final "Generate Forecast" action would still allow autosave to overwrite locked forecast data. Both paths guarded.

5. **Duplicate still available on locked forecasts** — Locked forecasts are historical records; duplicating them to create a new editable scenario is a legitimate workflow. Delete and Set as Active are blocked because they would modify the locked record's status.

## Deviations from Plan

**1. [Rule 2 - Missing Critical Functionality] Also guarded performAutoSave on isReadOnly**
- **Found during:** Task 2 implementation
- **Issue:** The plan specified guarding `handleComplete` but autosave runs continuously as state changes. A locked forecast opened in the wizard would autosave every 3 seconds via `performAutoSave`, bypassing the lock.
- **Fix:** Added `isReadOnly` check to `performAutoSave` guard condition.
- **Files modified:** ForecastWizardV4.tsx
- **Commit:** eeb38dd (included in Task 2 commit)

## Known Stubs

None — all wiring is functional. The `isPlanningSeasonActive` export is a new utility that will be consumed by the page banner in Plan 02; it is not a stub (it returns a real computed value).

## Self-Check: PASSED

- `src/app/finances/forecast/services/forecast-service.ts` — exists, contains `.eq('fiscal_year', fiscalYear)`
- `src/app/finances/forecast/utils/fiscal-year.ts` — exists, contains `isNearYearEnd` and `isPlanningSeasonActive`
- `src/app/finances/forecast/components/ForecastSelector.tsx` — exists, contains `is_locked` and `Lock`
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` — exists, contains `is_locked`, `isReadOnly`, `Lock`
- Commits `3f3acc3` and `eeb38dd` exist in git log
- `npx tsc --noEmit` exits 0
