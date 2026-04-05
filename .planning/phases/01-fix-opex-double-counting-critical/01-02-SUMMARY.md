---
phase: 01-fix-opex-double-counting-critical
plan: 02
subsystem: forecast-wizard
tags: [opex, double-counting, ui, step5, team-costs]
dependency_graph:
  requires: [01-01]
  provides: [corrected-opex-ui-totals, greyed-out-team-cost-rows]
  affects: [Step5OpEx.tsx]
tech_stack:
  added: []
  patterns: [isTeamCost guard in reducer, early-return row render]
key_files:
  created: []
  modified:
    - src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx
decisions:
  - "Import isTeamCost from opex-classifier into Step5OpEx to keep classification logic centralised"
  - "Use early-return in opexLines.map (not array filter) so team cost lines remain in order and visible"
  - "colSpan arithmetic: Y1=4 cols, Y2/Y3=5 cols to span Type + optional Increase% + Monthly + Annual + Forecast"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-05T03:13:45Z"
  tasks_completed: 1
  tasks_total: 2
  files_modified: 1
---

# Phase 01 Plan 02: Step5OpEx UI Fix — Team Cost Exclusion Summary

**One-liner:** Step5 OpEx table footer totals now exclude team cost lines via isTeamCost guards; team cost lines render as greyed-out read-only rows labelled "Counted in Team Costs".

## What Was Built

Three surgical changes to `Step5OpEx.tsx`:

1. **Import:** Added `isTeamCost` to the existing opex-classifier import (line 6).

2. **Reducer guards:** `opexByYear` (y1/y2/y3) and `totalPriorYear` now skip lines where `isTeamCost(line.name)` is true. The table footer "Total Operating Expenses" and the Prior Year comparison column both use these values, so they now show the correct non-doubled totals.

3. **Greyed-out row render:** Inside `opexLines.map`, an early-return block checks `isTeamCost(line.name)` before computing `forecastAmount`. Matching lines get a `<tr className="opacity-50 bg-gray-50/80">` row with:
   - Name column: italic grey text
   - Prior Year column: `formatCurrency(line.priorYearAnnual)` read-only
   - Remaining columns: `colSpan={activeYear > 1 ? 5 : 4}` with "Counted in Team Costs" label
   - Delete column: empty `<td className="w-10" />`

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix opexByYear, totalPriorYear reducers and add greyed-out row render | 5d35d44 | Step5OpEx.tsx |
| 2 | Verify OpEx fix in browser with a real forecast | PENDING — awaiting human verify | — |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit`: PASSED (zero errors)
- `npm run build`: PASSED (build completed successfully)
- `grep -n "isTeamCost" Step5OpEx.tsx`: 6 occurrences (import, opexByYear x3, totalPriorYear, row render)
- `grep -c "Counted in Team Costs" Step5OpEx.tsx`: 1

## Awaiting Human Verification

Task 2 is a blocking `checkpoint:human-verify`. The coach needs to open the forecast wizard in the browser and confirm:

1. Team cost lines (wages, super, etc.) appear greyed-out with "Counted in Team Costs" label
2. Table footer "Total Operating Expenses" excludes team cost amounts
3. BudgetTracker shows reasonable utilization (not 461%)
4. Step 8 Review P&L waterfall shows correct Net Profit

## Self-Check: PASSED

- [x] `src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx` — exists and modified
- [x] Commit `5d35d44` — confirmed via `git rev-parse --short HEAD`
- [x] TypeScript: zero errors
- [x] Build: succeeded
