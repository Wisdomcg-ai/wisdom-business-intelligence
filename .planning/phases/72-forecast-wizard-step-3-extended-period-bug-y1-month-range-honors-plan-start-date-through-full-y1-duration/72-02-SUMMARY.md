---
phase: 72
plan: 02
subsystem: forecast-wizard
tags: [bug-fix, step-3, extended-period, armstrong, wizard-state, shared-util]
dependency-graph:
  requires:
    - 72-01 (diagnosis — wizard-blind-to-plan-period root cause)
    - 68-04 (Phase 68 B15 deriveCurrentRemainderColumn — same root cause family, goals-wizard side; NOT modified here)
  provides:
    - plan-period-aware-forecast-wizard-step-3
    - getPlanY1MonthKeys + getActualMonthKeysForPlanY1 shared util
    - ForecastWizardState.planPeriod slice + setPlanPeriod action
  affects:
    - src/lib/utils/plan-period.ts (new)
    - src/app/finances/forecast/components/wizard-v4/types.ts (added PlanPeriod re-export + planPeriod slice + setPlanPeriod action)
    - src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts (added setPlanPeriod, seeded planPeriod: null in createInitialState, imported PlanPeriod)
    - src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx (goals-loader now captures the 4 extended-period fields and calls setPlanPeriod)
    - src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx (monthKeys + months labels + completedMonthsCount + banner + colSpans + grid-template-columns now plan-period-aware)
tech-stack:
  added:
    - PlanPeriod type sourced from /lib/utils/plan-period (no new dependencies)
  patterns:
    - Pure-function utils with clock injection (mirrors Phase 68 B15)
    - Optional state field for backward-compat with legacy localStorage drafts (Phase 56 soft-migration pattern)
    - Test-driven TDD (RED → GREEN) — 4 util tests + 1 component integration test
key-files:
  created:
    - src/lib/utils/plan-period.ts (175 LOC — PlanPeriod type, getPlanY1MonthKeys, getActualMonthKeysForPlanY1)
    - src/__tests__/forecast/phase-72-step3-extended-period.test.tsx (199 LOC — 5 tests)
  modified:
    - src/app/finances/forecast/components/wizard-v4/types.ts (+23 LOC — re-export + slice + action signature)
    - src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts (+7 LOC — import, init, action, register)
    - src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx (+13 LOC — setPlanPeriod call in goals-loader)
    - src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx (~80 LOC — monthKeys + labels + actuals + banner + colSpans + grid template)
decisions:
  - Extract shared util to `src/lib/utils/plan-period.ts` as sibling to Phase 68 B15's `deriveCurrentRemainderColumn` — inlining a parallel implementation in Step 3 would re-introduce the exact drift hazard Phase 68 paid down
  - Add `planPeriod` slice on `ForecastWizardState` (NOT extending `BusinessProfile`) — fields are sourced from `business_financial_goals`/`strategic_plans`, NOT `business_profiles`; separate slices keep the source-of-truth clean
  - Make `planPeriod` field OPTIONAL (`planPeriod?: PlanPeriod | null`) so legacy localStorage v11 drafts and existing test fixtures construct without per-call updates — Phase 56 soft-migration pattern
  - Header labels derived from `monthKeys` (not the static 12-label `getFiscalMonthLabels` helper) so 13+ month grids render header cells matching the body
  - Used dynamic `gridTemplateColumns: repeat(N, minmax(0, 1fr))` + dynamic `colSpan={monthKeys.length + 4}` so 13+ column grids lay out correctly; standard 12mo plans render byte-identical layout
  - Step 8 GrowthPlan summary-aggregation under-count remains deferred (out of scope per 72-01 decision)
metrics:
  duration: ~25min
  completed: 2026-05-31
  files_created: 2
  files_modified: 4
  tests_added: 5 (4 util + 1 component integration)
  tests_pre_existing_pass: 365 (full forecast suite — zero regressions)
---

# Phase 72 Plan 02: Step 3 Extended-Period Bug Fix Summary

Applied the 72-01 diagnosis to make Step 3 honor `business_financial_goals.is_extended_period` / `plan_start_date` / `year1_months` / `year1_end_date`. Armstrong's Step 3 (extended Y1=13mo, plan_start_date=2026-06-01) now renders 13 editable months (Jun 2026 → Jun 2027) instead of 3 (Apr/May/Jun 2026 calendar tail of current FY26).

## What Shipped

- New util `src/lib/utils/plan-period.ts` (175 LOC):
  - `PlanPeriod` type (mirrors the four `business_financial_goals` columns deserialised by `financial-service.ts:265-275`).
  - `getPlanY1MonthKeys(fiscalYear, planPeriod, yearStartMonth)` — returns N consecutive YYYY-MM keys starting at `planStartDate`'s month for extended plans; falls through to `generateFiscalMonthKeys` for standard 12mo plans or null planPeriod.
  - `getActualMonthKeysForPlanY1(planY1MonthKeys, currentYTDRevenueByMonth, today, planStartDate)` — pure intersection helper that returns the subset of plan-Y1 keys that have actuals in the currentYTD payload; short-circuits to empty Set when `planStartDate > today`.
- `ForecastWizardState.planPeriod` slice + `setPlanPeriod` action (slice is OPTIONAL — Phase 56 soft-migration pattern preserves legacy v11 drafts and existing test fixtures).
- `ForecastWizardV4.tsx` goals-loader now captures `goalsData.goals.{is_extended_period, year1_months, plan_start_date, year1_end_date}` and calls `actions.setPlanPeriod(...)`. These fields have always been returned by `/api/goals` but were being dropped on the floor.
- `Step3RevenueCOGS.tsx`:
  - L311 → uses `getPlanY1MonthKeys(fiscalYear, planPeriod, DEFAULT_YEAR_START_MONTH)` for Y1; Y2/Y3 still use `generateMonthKeys(fiscalYear - 1 + (activeYear - 1))` (extended-period is a Y1 concept only).
  - Header `months` labels derived from `monthKeys` directly (previously came from `getFiscalMonthLabels(7)` which always returns 12).
  - L545-547 → `completedMonthsCount` is now `|monthKeys ∩ currentYTD.revenue_by_month|`; `remainingMonthsCount = monthKeys.length - completedMonthsCount`. Standard 12mo plans are byte-identical to old behaviour.
  - L1564 → banner "X/Y months actual" uses `monthKeys.length` (was hardcoded `12`).
  - L1827 → `grid-cols-12` replaced with inline `gridTemplateColumns: repeat(monthKeys.length, ...)`.
  - Three `colSpan={16}` and one `colSpan={15}` instances replaced with `monthKeys.length + 4` / `+ 3` so section header / spacer / empty-state rows span the correct number of columns.
- 5 regression tests in `src/__tests__/forecast/phase-72-step3-extended-period.test.tsx`:
  1. Armstrong (extended Y1=13mo, plan_start=2026-06-01) → 13 keys spanning 2026-06 .. 2027-06.
  2. Standard non-extended FY26 → 12 keys (no regression).
  3. Edge: extended starting at FY boundary (plan_start=2025-07-01, year1=12) → 12 keys.
  4. Edge: extended 15-month plan (Phase 14 max) → 15 keys 2026-04 .. 2027-06.
  5. Component-level: Armstrong scenario through the real `useForecastWizard` hook → 13 editable `<input>` cells render in the Step 3 monthly view.

## Verification

- `npx vitest run src/__tests__/forecast/phase-72-step3-extended-period.test.tsx` → **5/5 pass**.
- `npx vitest run src/__tests__/forecast/` → **365/365 pass** (full forecast suite — zero regressions).
- `npx tsc --noEmit` → clean.
- `npx next lint --file <touched files>` → clean (pre-existing react-hooks/exhaustive-deps warnings in `Step3RevenueCOGS.tsx:1361` and `ForecastWizardV4.tsx:1295,1338` are NOT from this plan — scope boundary, see SCOPE-BOUNDARY rule).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Header `months` labels mismatched body for 13+ month grids**

- **Found during:** Task 5 (Step 3 fix).
- **Issue:** Original L309 derived `months = getFiscalMonthLabels(7)` which always returns 12 static labels (`['Jul', ..., 'Jun']`). The header `<th>` row iterates `months.map(...)`, while the body iterates `monthKeys.map(...)`. With 13 monthKeys but 12 month labels, the header would render 12 cells while the body rendered 13 — a column misalignment bug.
- **Fix:** Derived labels from `monthKeys` itself (`MONTH_ABBREVS[parseInt(key.slice(5,7), 10) - 1]`) so header always matches body. Standard 12mo plans produce identical output to `getFiscalMonthLabels(7)`.
- **Files modified:** `src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx`.
- **Commit:** `0c75797b`.

**2. [Rule 3 - Blocking] `grid-cols-12` + hardcoded `colSpan={16}`/`{15}` would break 13+ column grids**

- **Found during:** Task 5 (Step 3 fix).
- **Issue:** Per-line expanded-detail row used `<div className="grid grid-cols-12 gap-1">` — Tailwind static class fixed at 12 columns. Section header rows used `colSpan={16}` (= 2 fixed + 12 month + 2 fixed). With 13 month columns these would visually break.
- **Fix:** Replaced `grid-cols-12` with inline `gridTemplateColumns: repeat(${monthKeys.length}, minmax(0, 1fr))`. Replaced hardcoded colSpans with `monthKeys.length + 4` (section headers) / `+ 3` (empty-state td).
- **Files modified:** `src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx`.
- **Commit:** `0c75797b`.

**3. [Rule 3 - Blocking] Required `planPeriod` field broke existing test fixtures**

- **Found during:** typecheck after Task 3 (state extension).
- **Issue:** Adding `planPeriod: PlanPeriod | null` as required to `ForecastWizardState` broke 4 existing test fixtures (`phase-51-step6-manual-entry.test.tsx`, `phase-51-step6-re-analyze.test.tsx`, `phase-51-step6-sidebar.test.tsx`, `wizard-v4-bug-fixes.test.tsx`) that construct state objects without the new field. Also would crash legacy localStorage v11 drafts on hard-refresh.
- **Fix:** Made the field optional (`planPeriod?: PlanPeriod | null`) and pass `planPeriod ?? null` to the util — consistent with Phase 56 soft-migration pattern documented for new state fields. The runtime semantics are unchanged: undefined and null both fall through to the standard 12-month FY behaviour in `getPlanY1MonthKeys`.
- **Files modified:** `src/app/finances/forecast/components/wizard-v4/types.ts`, `src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx`.
- **Commit:** `0c75797b`.

**4. [Rule 1 - Bug] Stale `@typescript-eslint/no-unused-vars` disable comment caused lint error**

- **Found during:** lint pass on `src/lib/utils/plan-period.ts`.
- **Issue:** Per Phase 44-02 SUMMARY, the project's ESLint configuration only extends `next/core-web-vitals` — the `@typescript-eslint` plugin is NOT installed. A disable comment for an uninstalled rule produces an error ("Definition for rule … was not found").
- **Fix:** The `today` parameter is genuinely used inside the function body (planStartDate-vs-today short-circuit) — the disable comment was vestigial from an earlier draft. Removed.
- **Files modified:** `src/lib/utils/plan-period.ts`.
- **Commit:** `0c75797b`.

## Deferred Follow-ups (acknowledged, out of scope for 72)

Per 72-01 diagnosis decisions:

- **Step 8 GrowthPlan Y1 aggregation under-count.** `Step8GrowthPlan.tsx:150` uses `generateMonthKeys(state.fiscalYearStart + yearOffset)` to compute a 12-month summary grid. For extended plans, the Y1 row could under-count (12-month rollup of a 13-month plan). This is a summary-display issue — not a workflow blocker like the Step 3 editor was — and remains deferred to a follow-up phase.
- **Steps 4-7 same-family audit.** Per 72-01: no parallel bug; Step 4 uses per-employee periods, Step 5 uses annual totals + % increases, Step 6 (CapEx/Subs) uses per-item periods, Step 7 has no monthly grid. No fixes needed.
- **Visual/UX work for 13+ month rendering.** The grid now correctly produces 13 columns; whether 13 columns is comfortable on standard screens is a UX item, not a data-integrity bug.
- **`generateMonthKeys` deprecation.** Still has 13+ call sites in Step 3 and several elsewhere; full migration to `generateFiscalMonthKeys` is a separate cleanup phase.

## Schema Clarification (correction to planner prompt)

The extended-period columns live on **`business_financial_goals`**, NOT on `business_profiles`. Per 72-DIAGNOSIS E5:

```sql
-- supabase/migrations/00000000000000_baseline_schema.sql:1777-1779
"is_extended_period" boolean DEFAULT false,
"year1_months" integer DEFAULT 12,
"current_year_remaining_months" integer DEFAULT 0

-- supabase/migrations/20260427024433_plan_period_columns.sql
ALTER TABLE business_financial_goals
  ADD COLUMN IF NOT EXISTS plan_start_date date,
  ADD COLUMN IF NOT EXISTS plan_end_date   date,
  ADD COLUMN IF NOT EXISTS year1_end_date  date;
```

`plan_start_date` also exists on `strategic_plans` (baseline L4810). `business_profiles` does NOT carry any of these fields. This is why the new `planPeriod` slice intentionally lives on `ForecastWizardState` as a separate field — NOT as an extension of `BusinessProfile`. Separating the slices keeps the source-of-truth tables visually distinct in the wizard state.

## Commits

- `e9f7dc61` test(72-02): add failing tests for Step 3 extended-period month range
- `0c75797b` feat(72-02): make Step 3 month range plan-period-aware

## Self-Check: PASSED

- [x] `src/lib/utils/plan-period.ts` exists
- [x] `src/__tests__/forecast/phase-72-step3-extended-period.test.tsx` exists with 5 tests
- [x] `Step3RevenueCOGS.tsx` imports `getPlanY1MonthKeys` and uses it for Y1 monthKeys
- [x] `ForecastWizardV4.tsx` goals-loader calls `actions.setPlanPeriod(...)` (commit `0c75797b`)
- [x] `ForecastWizardState` has `planPeriod?: PlanPeriod | null` field
- [x] `WizardActions` has `setPlanPeriod` action
- [x] `useForecastWizard.ts` registers `setPlanPeriod` in actions bundle
- [x] All 5 phase-72 tests pass
- [x] All 365 forecast tests pass (zero regressions)
- [x] `npx tsc --noEmit` clean
- [x] Lint clean on touched files
- [x] Commits `e9f7dc61` + `0c75797b` exist in git history
