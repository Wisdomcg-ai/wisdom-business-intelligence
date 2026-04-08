---
phase: 16-forecast-rollover-rolling-periods
plan: "02"
subsystem: forecast
tags: [forecast, fiscal-year, planning-season, fy-selector, banner, ui]
dependency_graph:
  requires: [fiscal_year_filter_on_getOrCreate, planning_season_detection, forecast_lock_enforcement]
  provides: [fy_selector_tabs_ui, planning_season_banner_ui, selected_fiscal_year_state, business_fiscal_year_start_loading]
  affects: [forecast-page, FYSelectorTabs, PlanningSeasonBanner]
tech_stack:
  added: []
  patterns: [pill-tab-selector, dismissible-banner, sessionStorage-dismiss, planning-season-ui]
key_files:
  created:
    - src/app/finances/forecast/components/FYSelectorTabs.tsx
    - src/app/finances/forecast/components/PlanningSeasonBanner.tsx
  modified:
    - src/app/finances/forecast/page.tsx
decisions:
  - FYSelectorTabs renders single-tab as informational label (no click) when only one FY available
  - PlanningSeasonBanner dismiss stored in sessionStorage per nextFiscalYear key so it reappears on next session
  - selectedFiscalYear added to useEffect deps list so changing FY tab triggers loadInitialData automatically
  - All ForecastSelector/ForecastWizardV4 fiscalYear props updated to selectedFiscalYear || forecast.fiscal_year
  - PlanningSeasonBanner only shown when viewing current FY in planning season — hides once coach switches to next-FY tab
metrics:
  duration: "~20 minutes"
  completed_date: "2026-04-08"
  tasks_completed: 2
  files_modified: 3
---

# Phase 16 Plan 02: FY Selector Tabs + Planning Season Banner Summary

**One-liner:** Added pill-style `FYSelectorTabs` component and dismissible `PlanningSeasonBanner` to the forecast page, wired to `selectedFiscalYear` state and `business_profiles.fiscal_year_start`, so coaches can switch between current and next FY forecasts during planning season.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create FYSelectorTabs and PlanningSeasonBanner components | f150a37 | FYSelectorTabs.tsx, PlanningSeasonBanner.tsx |
| 2 | Wire FY selector + banner into forecast page.tsx | e11096b | page.tsx |

## What Was Built

### Task 1: FYSelectorTabs and PlanningSeasonBanner Components

**FYSelectorTabs.tsx:**
- Pill-style horizontal tab bar with one button per entry in `availableYears`
- Active tab: `bg-brand-navy text-white`; inactive: `bg-white text-gray-700 hover:bg-gray-100`
- Each tab shows FY label (`FY2026`) and date range subtitle (`Jul 25 - Jun 26`) via `getFiscalYearDateRange`
- Lock icon (lucide-react `Lock`) shown next to label when `isLockedMap[year] === true`
- When `availableYears.length <= 1`, renders an informational label row (no click handler) — matches plan's single-tab fallback requirement
- Props interface: `{ availableYears, selectedYear, onSelectYear, isLockedMap? }`

**PlanningSeasonBanner.tsx:**
- Blue/navy left-border info banner (`border-l-4 border-l-brand-navy bg-blue-50`)
- Calendar icon from lucide-react on left
- Message: "Planning season — N months until FY{currentFY} ends. Start building your FY{nextFiscalYear} forecast." with special case for `monthsRemaining === 0`
- "Plan FY{nextFiscalYear}" action button calls `onPlanNextYear`
- X dismiss button sets `sessionStorage.setItem(\`planning-banner-dismissed-{nextFiscalYear}\`, 'true')`
- On mount, reads sessionStorage to pre-dismiss if already dismissed this session
- Props interface: `{ nextFiscalYear, monthsRemaining, yearStartMonth, onPlanNextYear }`

### Task 2: Wire into forecast page.tsx

**New state variables:**
- `selectedFiscalYear: number | null` — tracks user-selected FY; null until `loadInitialData` runs
- `fiscalYearStart: number` — defaults to 7 (AU FY July), overridden by `business_profiles.fiscal_year_start`
- `planningSeasonActive: boolean` — result of `isPlanningSeasonActive(yearStart)`
- `monthsRemaining: number` — from `getMonthsUntilYearEnd(new Date(), yearStart)`

**loadInitialData changes:**
- Added Supabase query for `business_profiles.fiscal_year_start` after resolving `bizId`
- Sets `yearStart` from DB result (falls back to 7 on error)
- Computes `isPlanning` and `monthsRemaining` and sets state
- Computes `fiscalYear = selectedFiscalYear ?? getForecastFiscalYear(yearStart)` — honours existing selection
- Only calls `setSelectedFiscalYear` if it hasn't been set yet (prevents overwriting user's choice on reload)

**useEffect dependency list:**
- Added `selectedFiscalYear` so changing the FY tab triggers `loadInitialData` and loads the correct forecast

**Render additions (inside `max-w-[1600px]` container, above Error Banner):**
1. `FYSelectorTabs` rendered when `selectedFiscalYear` is set, passing `getAvailableFiscalYears(fiscalYearStart)` as options
2. `PlanningSeasonBanner` rendered only when `planningSeasonActive && selectedFiscalYear === getCurrentFiscalYear(fiscalYearStart)` — disappears when coach switches to next-FY tab

**Component prop updates:**
- All `ForecastSelector` and `ForecastWizardV4` `fiscalYear` props changed to `selectedFiscalYear || forecast.fiscal_year`
- `ForecastMultiYearSummary` and `AssumptionsTab` `fiscalYear` props updated likewise
- `PageHeader subtitle` updated to `"{FYLabel} — {forecast.name}"`

## Decisions Made

1. **Single-tab informational label** — When `availableYears` has only one entry (outside planning season), `FYSelectorTabs` renders an informational label instead of a clickable tab. This avoids showing a fake selector when there's nothing to select.

2. **sessionStorage dismiss key per FY** — `planning-banner-dismissed-{nextFiscalYear}` means the banner reappears at the start of each browser session but stays dismissed within a session. This matches the plan's spec and avoids coaches having to repeatedly dismiss it.

3. **selectedFiscalYear in useEffect deps** — Adding `selectedFiscalYear` to the dependency list is the cleanest way to trigger reload when the user switches FY tabs. The alternative (calling `loadInitialData()` inside the handler) would use stale closure state for `selectedFiscalYear`, requiring a `useRef` or restructure. The dep-list approach avoids the stale-closure problem.

4. **Preserve user selection across reloads** — `if (!selectedFiscalYear) setSelectedFiscalYear(fiscalYear)` means reloading (triggered by the dep change) does NOT reset the selected FY back to the default. This is critical — without this guard, every reload triggered by `selectedFiscalYear` changing would immediately override the new value with the default.

5. **Only update ForecastSelector/Wizard fiscalYear** — `ForecastMultiYearSummary` and `AssumptionsTab` also updated to use `selectedFiscalYear` so the full page context reflects the selected year consistently.

## Deviations from Plan

**1. [Rule 2 - Missing Critical Functionality] Preserve user FY selection across reload cycles**
- **Found during:** Task 2 implementation
- **Issue:** The plan's step 4 included `if (!selectedFiscalYear) setSelectedFiscalYear(fiscalYear)`, but also said to add `selectedFiscalYear` to the useEffect deps. Without the guard, every reload triggered by the dep change would call `setSelectedFiscalYear(defaultFY)` again — overwriting the user's tab selection and creating an infinite loop.
- **Fix:** Applied the guard (`if (!selectedFiscalYear)`) exactly as specified in step 4. This prevents the reload from resetting the selection and avoids the loop.
- **Files modified:** page.tsx
- **Commit:** e11096b (included in Task 2 commit)

## Known Stubs

None — FYSelectorTabs and PlanningSeasonBanner are fully functional. `getAvailableFiscalYears` always returns real computed values. `isPlanningSeasonActive` returns a real boolean. No hardcoded empty arrays or placeholder text.

## Self-Check: PASSED

- `src/app/finances/forecast/components/FYSelectorTabs.tsx` — exists, contains `FYSelectorTabs`, `getFiscalYearDateRange`, `Lock`
- `src/app/finances/forecast/components/PlanningSeasonBanner.tsx` — exists, contains `PlanningSeasonBanner`, `onPlanNextYear`, `Calendar`, `sessionStorage`
- `src/app/finances/forecast/page.tsx` — exists, contains `selectedFiscalYear`, `FYSelectorTabs`, `PlanningSeasonBanner`, `fiscal_year_start`, `planningSeasonActive`
- Commits `f150a37` and `e11096b` exist in git log
- `npx tsc --noEmit` exits 0
