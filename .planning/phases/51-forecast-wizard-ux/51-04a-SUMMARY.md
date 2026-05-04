---
phase: 51-forecast-wizard-ux
plan: 04a
subsystem: forecast-wizard-v4
tags: [step-4, team, termination, part-time, fte, ux, additive]
requirements: [UX-S4-01, UX-S4-02]
dependency_graph:
  requires:
    - useForecastWizard.addDeparture (existing — no changes)
    - useForecastWizard rollup (lines 1083-1115, untouched)
    - PartTimeSalaryInput (extended, back-compat preserved)
  provides:
    - End employee modal (forward-looking termination only)
    - PT/casual Hours/FTE toggle (HoursMode type + optional field)
  affects:
    - Step4Team.tsx (row Status cell, salary cell for part-time only)
    - types.ts (new optional fields — additive)
tech-stack:
  added: []
  patterns:
    - Real-hook test harness (Step4Harness modeled on Step3Harness)
    - Optional-field back-compat (Phase 50 lease_type pattern)
    - Inline conditional modal rendering (matches showAddVendor / showAddHire pattern in same file)
key-files:
  created:
    - src/__tests__/forecast/phase-51-step4-termination.test.tsx
    - src/__tests__/forecast/phase-51-step4-pt-casual.test.tsx
    - .planning/phases/51-forecast-wizard-ux/deferred-items.md
  modified:
    - src/app/finances/forecast/components/wizard-v4/types.ts
    - src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx
decisions:
  - "Termination is FORWARD-LOOKING ONLY — no remove-from-FY-entirely option per operator decision"
  - "hoursMode default is 'hours' when undefined (back-compat for forecasts saved before Phase 51)"
  - "WIZARD_VERSION untouched (stays at 10) — additive optional fields only"
  - "Mode-only toggle (no value change) does not call onHoursChange — no surprise math"
  - "Part-time salary cell now renders PartTimeSalaryInput; full-time/casual/contractor unchanged"
metrics:
  duration_minutes: ~25
  completed_date: 2026-05-04
  task_commits: 4
  files_changed: 5
  loc_delta_source: "Step4Team.tsx +285/-41, types.ts +16/0"
  tests_added: 8
  tests_baseline: 13
  tests_total_green: 37
---

# Phase 51 Plan 04a: Step 4 Termination Flow + PT/Casual Hours/FTE Flexibility Summary

Bundle of two row-level Step 4 UX improvements shipped in one PR: an explicit
"End employee" termination modal (UX-S4-01) and a Hours/%FTE toggle on
`PartTimeSalaryInput` (UX-S4-02). Both leverage the existing `addDeparture`
rollup math (untouched) and the existing pro-rata salary path (untouched).

## Task Commits

| Task | Commit  | Type     | Description                                                       |
| ---- | ------- | -------- | ----------------------------------------------------------------- |
| 1    | 2b6810a | test     | RED tests for termination + PT/casual hours mode (8 tests)        |
| 2    | 6fdb710 | feat     | Add `hoursMode` optional field to TeamMember + NewHire            |
| 3    | 433fd64 | feat     | End employee modal with forward-looking termination (UX-S4-01)    |
| 4    | 993e7ca | feat     | Hours/FTE toggle on PartTimeSalaryInput (UX-S4-02)                |

## LOC Delta

- `src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx`: +285 / -41
  (net +244 lines: termination modal + state, "End employee" button, Hours/FTE
  toggle UI inside `PartTimeSalaryInput`, part-time wiring in salary cell)
- `src/app/finances/forecast/components/wizard-v4/types.ts`: +16 / -0
  (new `HoursMode` type alias + optional `hoursMode?` on `TeamMember` and
  `NewHire`)

## Test Counts

| File                                                            | Tests | Status |
| --------------------------------------------------------------- | ----- | ------ |
| `phase-51-step4-termination.test.tsx` (UX-S4-01)                | 4     | green  |
| `phase-51-step4-pt-casual.test.tsx` (UX-S4-02)                  | 4     | green  |
| `wizard-v4-bug-fixes.test.tsx` (Phase 50 baseline)              | 13    | green  |
| `phase-51-helpers.test.ts` (Phase 51-00 helpers)                | 14    | green  |
| `initialize-from-xero-target-aware.test.ts`                     | 2     | green  |
| **Total forecast suite**                                        | **37**| **green** |

`npx tsc --noEmit` clean. `npx eslint` on changed files: 0 errors, only 3
pre-existing warnings (unrelated to this plan).

## Operator Decisions (encoded in implementation)

1. **Termination is FORWARD-LOOKING ONLY.** The "remove from FY entirely"
   alternative listed in PHASE.md / RESEARCH.md is dropped per operator. The
   termination modal accepts a single MonthPicker that sets `endMonth`. Salary
   continues through that month and drops to zero from the next month onward
   (existing rollup math at `useForecastWizard.ts:1083-1115`, unchanged).
2. **PT/casual: BOTH modes supported.** `PartTimeSalaryInput` shows a
   `Hours / %FTE` toggle. Hours mode is the default. `hoursMode` is persisted
   as an optional field on the underlying `TeamMember` / `NewHire` record.
3. **WIZARD_VERSION stays at 10.** All new fields are optional and additive.
   Forecasts saved before Phase 51 render and behave identically (no migration
   needed; localStorage rehydration unchanged).

## Implementation Notes

- **`addDeparture` / Departure rollup logic UNCHANGED.** The plan reuses
  `useForecastWizard.addDeparture` and `getDepartureMonthsInFY` exactly as-is.
  No edits to `useForecastWizard.ts` (keeping that file off-limits to 51-04a
  per the brief).
- **Back-compat for `hoursMode`:** in `PartTimeSalaryInput`, the prop is
  optional and `undefined` is normalized to `'hours'` via
  `effectiveMode = hoursMode ?? 'hours'`. Older saved forecasts have
  `hoursMode === undefined` and render the existing hours-per-week input
  exactly as before. Verified by Test 4 in the PT/casual file.
- **End employee button placement:** rendered in the Status cell of every
  non-departed `teamMember`-backed row (skipped for new hires and already-
  departed members per the single-departure model).
- **Termination modal placement:** rendered inline near the bottom of the
  `Step4Team` return (just above the Grand Total card), matching the
  existing inline-modal pattern used by `showAddHire` / `showAddEmployee` /
  `showAddContractor`.
- **Salary cell change for part-time only:** the salary `<td>` in `TeamTable`
  now branches on `row.type === 'part-time'` to render the extended
  `PartTimeSalaryInput` (with toggle). Full-time, casual, and contractor rows
  continue to use the inline `CurrencyInput` they used pre-Phase-51 — no
  behaviour change.
- **`renderSalaryInput` helper is dead code (pre-existing).** It was already
  unused before 51-04a (the salary cell was rendered inline). Kept in place;
  noted in `.planning/phases/51-forecast-wizard-ux/deferred-items.md` for
  future cleanup. Out of scope for this plan.

## Deviations from Plan

None. Plan executed exactly as written. The only minor expansion was
discovering during Task 4 that the salary cell did not call the (pre-existing,
dead) `renderSalaryInput` helper — so the part-time → `PartTimeSalaryInput`
wiring had to be added inline in the cell instead. This was the simplest fix
and required no scope expansion.

## Sentinel (operator manual verification — preview deploy)

Per the plan `<verification>` block:

1. Open JDS forecast → Step 4 → click **End employee** on any active row →
   pick **Dec 2025** → **Confirm** → navigate to Step 9 (Review). That
   employee's Y1 cost should be ~6 months of salary (Jul–Dec) plus 6 months
   of super.
2. Toggle a part-time row to **%FTE** mode → set **60%** → salary should
   recalculate to ~60% of that line's full-time equivalent (existing pro-rata
   math). Hours-mode display shows the equivalent hours.
3. Reload an old forecast (no `hoursMode` set) → part-time row defaults to
   Hours mode → identical display to pre-Phase-51.

## Self-Check: PASSED

- `src/__tests__/forecast/phase-51-step4-termination.test.tsx` — exists
- `src/__tests__/forecast/phase-51-step4-pt-casual.test.tsx` — exists
- `src/app/finances/forecast/components/wizard-v4/types.ts` — modified, contains `HoursMode`
- `src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx` — modified, contains `End employee` and `aria-label="Hours mode"`
- Commits 2b6810a, 6fdb710, 433fd64, 993e7ca — all on branch
  `feat/51-04a-step4-termination-pt-casual`
- 37/37 forecast tests green; tsc clean; ESLint clean (no new warnings)
