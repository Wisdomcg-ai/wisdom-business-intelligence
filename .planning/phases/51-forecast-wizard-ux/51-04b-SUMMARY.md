---
phase: 51-forecast-wizard-ux
plan: 04b
subsystem: forecast-wizard-v4
tags: [step-4, team, pay-frequency, persistence, ux, additive]
requirements: [UX-S4-03]
dependency_graph:
  requires:
    - 51-04a (HoursMode + termination patterns; same Step4Harness reused)
    - useForecastWizard state machine (extended with one new action only)
  provides:
    - PayFrequency type alias (weekly | fortnightly | monthly)
    - Optional payFrequency? on TeamMember + NewHire (back-compat)
    - Optional defaultPayFrequency? on ForecastWizardState
    - actions.setDefaultPayFrequency
    - Per-employee + business-default UI selectors in Step 4
  affects:
    - Step4Team.tsx (salary cell wrapped in flex-col with new dropdown beneath; new business-default card above team section)
    - types.ts (additive — type alias + 3 optional fields + 1 action signature)
    - useForecastWizard.ts (new setDefaultPayFrequency action only — NO rollup edits)
tech-stack:
  added: []
  patterns:
    - Real-hook test harness (Step4Harness extended with default + override seeding)
    - Optional-field back-compat (Phase 50 lease_type pattern)
    - Inheritance via fallthrough chain (row.payFrequency ?? state.defaultPayFrequency ?? 'monthly')
    - Display-only inheritance (setting default never mutates per-row fields)
key-files:
  created:
    - src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx
  modified:
    - src/app/finances/forecast/components/wizard-v4/types.ts
    - src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts
    - src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx
decisions:
  - "Used a dedicated setDefaultPayFrequency action (not a generic updateState) — matches existing setDefaultOpExIncreasePct precedent in the same file"
  - "Per-row dropdown inlined inside the Salary cell (wrapped in a flex-col) — avoids adding a column which would require touching colgroup/thead/colSpan/tfoot"
  - "Business-default selector placed as a small card BETWEEN the Planning Overview and Team Members card — visible above both Team and Contractor tables"
  - "Setting business default does NOT mutate per-row fields — preserves inheritance relationship per Test 8 lock"
  - "WIZARD_VERSION untouched (stays at 10) — additive optional fields only; old localStorage caches still rehydrate without migration"
metrics:
  duration_minutes: ~20
  completed_date: 2026-05-04
  task_commits: 3
  files_changed: 4
  loc_delta_source: "Step4Team.tsx +122/-57, types.ts +28/0, useForecastWizard.ts +13/0, test +311/0"
  tests_added: 10
  tests_baseline_after: 68
  tests_total_green: 68
---

# Phase 51 Plan 04b: Step 4 Pay Frequency Selector (UX-S4-03) Summary

Pure persistence plan: adds `payFrequency` field to TeamMember + NewHire
(per-employee selector) and `defaultPayFrequency` to wizard state (business-
level default). Both surface as `<select>` controls in Step 4. **Annual salary
calculations are unchanged** — Phase 52 will consume these fields for Xero
PayrollCalendar auto-fill and cashflow timing.

## Task Commits

| Task | Commit  | Type | Description                                                       |
| ---- | ------- | ---- | ----------------------------------------------------------------- |
| 1    | f3a94a4 | test | RED tests for UX-S4-03 (10 tests, all failing on HEAD)            |
| 2    | 5426c10 | feat | PayFrequency type + payFrequency? + defaultPayFrequency? + action |
| 3    | 8899175 | feat | Per-row + business-default selectors in Step 4 (UX-S4-03)         |

## RED → GREEN per Task

| Task | RED file/test                             | GREEN trigger                                                                                                                                            |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `phase-51-step4-pay-frequency.test.tsx` × 10 | All 10 tests fail at HEAD: PayFrequency type missing → tsc error in test file; setDefaultPayFrequency action missing; dropdowns not rendered.            |
| 2    | (above)                                   | Tests still RED at runtime (UI doesn't exist yet) but the test file now compiles cleanly. tsc clean, full forecast suite still 58/58 green.              |
| 3    | (above)                                   | All 10 GREEN. Full forecast suite 68/68 GREEN. ESLint: 0 new warnings (3 pre-existing in Step4Team.tsx unrelated).                                       |

## LOC Delta

- `src/app/finances/forecast/components/wizard-v4/types.ts`: **+28 / 0**
  - PayFrequency type alias (~8 LOC including JSDoc)
  - `payFrequency?: PayFrequency` on TeamMember (3 LOC inc. comment)
  - `payFrequency?: PayFrequency` on NewHire (3 LOC inc. comment)
  - `defaultPayFrequency?: PayFrequency` on ForecastWizardState (7 LOC inc. comment)
  - `setDefaultPayFrequency` action signature on WizardActions (3 LOC)
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts`: **+13 / 0**
  - `PayFrequency` import (1 LOC)
  - `setDefaultPayFrequency` useCallback implementation (~10 LOC inc. comment)
  - Wired into returned actions object (1 LOC)
- `src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx`: **+122 / -57**
  - `PayFrequency` import (1 LOC)
  - Salary cell wrapped in `<div className="flex flex-col gap-1">` to host dropdown beneath salary input (~3 LOC structural)
  - Per-row pay frequency dropdown IIFE in salary cell (~28 LOC inc. comment)
  - Business-default selector card above Team Members section (~24 LOC inc. comment)
  - Indentation shift on the existing salary input children (accounts for the bulk of -57/+57 churn)
- `src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx`: **+311 / 0**
  - 10 tests under `describe('UX-S4-03 — Step 4 pay frequency selector')`

## Decisions

### 1. Action choice: `setDefaultPayFrequency` (not a generic `updateState`)

**Read first:** `useForecastWizard.ts` has no generic state-update action. Every
field on `ForecastWizardState` is mutated via a dedicated setter (e.g.,
`setDefaultOpExIncreasePct`, `setBusinessProfile`, `setRevenuePattern`).

**Decision:** Add a new dedicated `setDefaultPayFrequency(frequency: PayFrequency)`
action mirroring `setDefaultOpExIncreasePct` (same shape, same useCallback
pattern). Rejected the generic `updateState({ defaultPayFrequency: ... })`
suggested in the plan because it would have introduced a new pattern foreign
to this codebase.

**Why this matters:** The implementation is intentionally minimal — single
`setState` that mutates only `defaultPayFrequency`. It does NOT touch any
per-row `payFrequency` field, which preserves the inheritance relationship
verified by Test 8.

### 2. Per-row dropdown placement: inside the Salary cell, not a new column

**Considered:** Adding a new `<th>Frequency</th>` column to TeamTable.

**Rejected because:**
- Would require touching `<colgroup>` (5 sibling cols + col widths)
- Would require updating the `colSpan` on the empty-state row (currently 7/11/13 depending on context)
- Would require updating the totals `<tfoot>` row's column structure
- All four edits would risk regressions in the established 51-04a row layout

**Chosen:** Wrap the existing salary cell content in a `flex flex-col gap-1`
and append the small `<select>` beneath the `<CurrencyInput>` /
`<PartTimeSalaryInput>`. Zero impact on header, footer, or empty-state row.
Net diff is purely additive (the -57 LOC are all due to indentation shifts of
the pre-existing salary input children — no semantic deletions).

### 3. Business-default selector placement: dedicated card above team section

The plan suggested "top of the team section". The team section is split into
two sibling cards (Team Members + Contractors). Chose to render the default-
frequency selector as its own minimal card sitting between the Planning
Overview and the Team Members card, so it visually applies to BOTH sub-tables
(employees and contractors) without being nested inside one of them.

### 4. Display-only inheritance (the no-mutation rule)

Critical implementation detail verified by Test 8: when the operator changes
the business-level default, the per-row `payFrequency` fields stay
`undefined`. The dropdown's display value falls through the chain
(`row.payFrequency ?? state.defaultPayFrequency ?? 'monthly'`), so changing
the default visually updates every row that hasn't been explicitly overridden,
without ever writing to the canonical row state. This means:

- The operator can switch the default and instantly see all unset rows update
- An explicit per-row override is only created when the operator picks a value
  for THAT row's dropdown
- Saving and reloading preserves the distinction between "inherits default"
  (undefined) and "explicit override" (concrete value)

## useForecastWizard.ts rollup verification

`git diff main -- useForecastWizard.ts` shows exactly 13 additions and zero
deletions:

1. Added `PayFrequency` to the existing types import block
2. Added `setDefaultPayFrequency` useCallback (lines 593-603) — a single
   `setState` that updates only `defaultPayFrequency`
3. Added `setDefaultPayFrequency` to the returned actions object

**No edits to:**
- The `summary` useMemo (rollup calculation)
- `getDepartureMonthsInFY` or any related helper
- `addDeparture` / `removeDeparture` rollup logic
- Any salary or team-cost calculation
- `defaultOpExIncreasePct` (kept untouched — UX-S4-03 only adds, doesn't
  refactor)

Test 9 regression-locks this: setting `member.payFrequency` and
`state.defaultPayFrequency` to any value leaves `summary.year1.teamCosts`
unchanged.

## Backward Compatibility

- Forecasts saved before Phase 51-04b have:
  - `member.payFrequency === undefined` → display chain falls through to
    `defaultPayFrequency` → `'monthly'`
  - `state.defaultPayFrequency === undefined` → display chain falls through
    to `'monthly'`
- No render-time state mutation (Test 10 lock)
- WIZARD_VERSION still 10; no localStorage migration
- Phase 52 will read these fields if set; if undefined, Phase 52 will
  apply the same fallback chain

## Sentinels (operator manual verification — preview deploy)

Per the plan's `<verification>` block:

1. Open Envisage forecast → Step 4 → set business default = "Fortnightly" →
   save → close → reopen → "Fortnightly" still selected on default selector.
   New rows display "Fortnightly" inherited.
2. Set Alice's per-row dropdown to "Weekly" → save → close → reopen → Alice
   still "Weekly". Other rows still display "Fortnightly" (inherited).
3. Switch business default back to "Monthly" → Alice unchanged ("Weekly");
   other rows now display "Monthly".

(Sentinels are operator-run on the Vercel preview after PR opens — not
automatable in CI.)

## Notes for Phase 52

- **Field shape:**
  - `member.payFrequency?: 'weekly' | 'fortnightly' | 'monthly'` on
    `TeamMember` and `NewHire`
  - `state.defaultPayFrequency?: PayFrequency` on `ForecastWizardState`
- **Effective frequency resolver:** Phase 52 should call a helper like
  ```ts
  function getEffectiveFrequency(
    member: { payFrequency?: PayFrequency },
    defaultFreq: PayFrequency | undefined,
  ): PayFrequency {
    return member.payFrequency ?? defaultFreq ?? 'monthly';
  }
  ```
  Phase 51-04b inlines the equivalent expression in the Step4Team dropdown.
  When Phase 52 needs the same logic in the cashflow distributor + Xero
  importer, extract to `utils/pay-frequency.ts` and call from all three sites
  (per the Phase 50 lockstep-helper pattern).
- **Xero auto-fill:** Phase 52 maps Xero `EmployeeGroup` / `PayrollCalendar`
  codes to `PayFrequency` values. The mapping table (Xero code ↔ our enum)
  belongs in Phase 52, not here.
- **Cashflow distribution:** Phase 52 will use `payFrequency` to generate the
  pay-period schedule (weekly = 52 paychecks/yr, fortnightly = 26,
  monthly = 12). Annual salary divided by paycheck count gives per-period
  cash outflow — but the annual P&L number is unchanged (this plan's
  no-rollup-math invariant holds in Phase 52 too).

## Deviations from Plan

None of substance. Two minor adjustments:

1. **Action name verification (Task 3 step 1).** Plan said "verify
   `actions.updateState` exists; if not, identify the correct action".
   `useForecastWizard.ts` has no generic state-update action, so I added
   `setDefaultPayFrequency` (one of the alternatives the plan explicitly
   permitted: "If none exists, add a small `setDefaultPayFrequency(freq)`
   action — keep it focused"). Documented in Decision 1.

2. **Per-row dropdown placement (Task 3 step 3).** Plan said "Place it in a
   logical column (e.g. next to the salary cell, or as a new 'Frequency'
   column)". Chose the inline-in-salary-cell variant (with the salary cell
   wrapped in a flex-col) to avoid touching colgroup/thead/tfoot. Documented
   in Decision 2.

## Self-Check: PASSED

- `src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx` — exists
- `src/app/finances/forecast/components/wizard-v4/types.ts` — modified, contains `PayFrequency` and `defaultPayFrequency`
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` — modified, contains `setDefaultPayFrequency`
- `src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx` — modified, contains `Default pay frequency` and `Pay frequency for ${row.name}`
- Commits f3a94a4, 5426c10, 8899175 — all on branch `feat/51-04b-step4-pay-frequency`
- 68/68 forecast tests green; tsc clean; ESLint clean (no new warnings; 3 pre-existing unrelated warnings same as 51-04a)
- WIZARD_VERSION still 10
- `npm run build` failure observed locally is environmental (`.env.local` missing in worktree → Supabase init fails in `chart-of-accounts-full/route.js`); will pass on Vercel CI which has env vars configured
