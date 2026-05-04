---
phase: 51-forecast-wizard-ux
plan: 05
subsystem: forecast-wizard-v4-step5-opex
tags: [ui, ux, opex, step5, labels, tooltip, layout, no-state-shape-change]
requires: [51-00]
provides:
  - operator-friendly-cost-behavior-labels
  - cost-behavior-info-tooltip
  - explicit-monthly-avg-and-year-total-headers
affects: [forecast-wizard-step-5-opex-row-render]
tech-stack:
  added: []
  patterns:
    - back-compat-via-display-only-changes
    - browser-native-title-tooltip
key-files:
  created:
    - src/__tests__/forecast/phase-51-step5-labels.test.tsx
  modified:
    - src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx
key-decisions:
  - Operator decision encoded — keep the existing 4-way costBehavior dropdown; only relabel the displayed text (no $/% replacement, no consolidation)
  - Tooltip implemented via plain HTML `title` attribute — no new tooltip primitive added (1-screen scope didn't justify a dependency)
  - 'Year total' + 'Monthly avg' headers implemented by renaming the existing 'Annual' + 'Monthly' Workings sub-headers (no new columns added — body cell math + structure unchanged)
metrics:
  duration: ~7 min
  completed: 2026-05-04T20:27:12Z
  task-commits: 2
  loc-delta: +378 / -27 (test file new + Step5OpEx label/tooltip/header tweaks)
---

# Phase 51 Plan 05: Step 5 OpEx behavior labels + info tooltip + simpler layout — Summary

Reframed Step 5 OpEx UI per operator decision: kept the existing 4-way `costBehavior` dropdown but relabeled each option with operator-facing language ("$ per month", "% of revenue", "$ with annual increase", "Custom per-month") and added a hover-explainer info icon next to the dropdown. Renamed the Workings sub-headers from "Monthly" / "Annual" to "Monthly avg" / "Year total". Math, state shape, and `WIZARD_VERSION` all unchanged — older saved forecasts render identically.

## Task Commits

| Task | Type | Commit  | Description                                                                       |
| ---- | ---- | ------- | --------------------------------------------------------------------------------- |
| 1    | RED  | 6a679de | test(51-05): RED tests for OpEx labels + tooltip + layout                         |
| 2    | GREEN| df94463 | feat(51-05): relabel OpEx behaviors with operator-friendly labels + info tooltip + layout cleanup (UX-S5-01 + UX-S5-02) |

## What Changed

### Source: `src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx`

**LOC delta:** +59 / -23 (mostly text + className changes; no new imports — `Info` was already imported from `lucide-react` on line 4).

1. `COST_BEHAVIORS` array (lines 16–28): relabeled the displayed `label` field for each option. Underlying `value` remains `'fixed' | 'variable' | 'seasonal' | 'adhoc'`.
2. New `COST_BEHAVIOR_EXPLAINER` constant: 4-paragraph string passed to the info-icon `title` attribute. Operator-facing copy verbatim from the plan.
3. Type-dropdown JSX (lines 1356-1382): wrapped in a `<div className="flex items-center gap-1">`, widened `<select>` to `w-44`, and added an `<Info>` button with `aria-label="What does each option mean?"` and `title={COST_BEHAVIOR_EXPLAINER}`.
4. Workings sub-header row: renamed `Monthly` → `Monthly avg`, `Annual` → `Year total`.
5. Editable Y1 Monthly + Annual `<input>` widths standardized to `w-28` (was inline `style={{ width: '90px' }}`).
6. No handler signatures changed. `handleBehaviorChange(lineId, newBehavior)` still uses the same enum values.

### Tests: `src/__tests__/forecast/phase-51-step5-labels.test.tsx` (new)

6 tests across 3 describe blocks:

| Test | Block        | Asserts                                                                        |
| ---- | ------------ | ------------------------------------------------------------------------------ |
| 1    | UX-S5-01     | Selected option text for `costBehavior=fixed` reads "$ per month"              |
| 2    | UX-S5-01     | All 4 dropdown options render the new operator-facing labels                   |
| 3    | UX-S5-01     | Info-icon button rendered with the explainer covering all 4 options            |
| 4    | UX-S5-02     | Column headers "Year total" and "Monthly avg" exist in the OpEx table          |
| 5    | UX-S5-02     | Cells under those headers show $12,000 / $1,000 for a $1k/mo fixed line        |
| 6    | back-compat  | `summary.year1.opex` still equals $12,000 for a $1k/mo fixed line (no math change) |

RED phase confirmed: 5 tests failed on HEAD before the implementation commit. Test 6 passed on HEAD as designed (locked as a regression guard).

## Verification Results

| Gate                                                                | Status |
| ------------------------------------------------------------------- | ------ |
| `npx vitest run src/__tests__/forecast/phase-51-step5-labels.test.tsx` | 6/6 GREEN |
| `npx vitest run src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx`   | 13/13 GREEN |
| `npx vitest run src/__tests__/forecast/`                              | 35/35 GREEN |
| `npx tsc --noEmit`                                                  | clean (0 errors) |
| `npm run lint` (forecast files)                                     | 0 new warnings |
| `WIZARD_VERSION` unchanged (still 10)                               | confirmed (`grep` line 51) |
| `costBehavior` enum values unchanged                                | confirmed: `value: 'fixed'` / `'variable'` / `'seasonal'` / `'adhoc'` |
| `handleBehaviorChange` signature unchanged                          | confirmed |

## Operator Decision Encoded

The plan was reframed from the original PHASE.md UX-S5-01 spec ($/% toggle replacing the 4-way dropdown) after design review:

- The 4 behaviors (fixed monthly, % of revenue, inflation-grown fixed, manual per-month) are still meaningful — operators were confused by the *labels*, not by the existence of 4 options.
- New labels make the differences obvious; tooltip explains when to use each.
- Pitfall 3 from RESEARCH.md (silent YearlySummary changes from mapping 4→2) is a non-issue because nothing was consolidated.

## Deviations from Plan

None. Plan executed exactly as written. The only minor mid-execution adjustment was Test 5 hardening (introduced strict header-row walking + input-value reading after the initial naive assertion would have passed on HEAD against unrelated `$1,000` / `$12,000` text elsewhere in the page). This produced a stricter RED → GREEN signal and was committed as part of the RED commit (the plan's `<acceptance_criteria>` requires "at least 5 RED" — final RED count was 5).

## Sentinel (operator preview)

Operator should confirm on deployed preview branch:

1. Open JDS forecast → Step 5
2. Confirm dropdown shows: "$ per month", "% of revenue", "$ with annual increase", "Custom per-month"
3. Hover the info icon next to the dropdown → tooltip explains each option
4. Load an existing forecast → no spontaneous YearlySummary number change
5. Y1 view: confirm "Monthly avg" + "Year total" column headers; values unchanged from before

## Self-Check: PASSED

- src/__tests__/forecast/phase-51-step5-labels.test.tsx: FOUND
- src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx: FOUND (modified)
- Commit 6a679de: FOUND in `git log`
- Commit df94463: FOUND in `git log`
- All 6 new tests GREEN, 13 baseline tests GREEN, tsc clean.
