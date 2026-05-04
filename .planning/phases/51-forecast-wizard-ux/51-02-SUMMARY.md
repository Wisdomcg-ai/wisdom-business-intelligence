---
phase: 51-forecast-wizard-ux
plan: 02
subsystem: forecast-wizard-v4
tags: [step3, growth-percent, y-on-y, ux-s3-02, tdd, useEditableValue-consumer]
requirements: [UX-S3-02]
dependency_graph:
  requires:
    - 51-00 (useEditableValue hook)
    - 51-01 (RevenueLineMixInputs child component)
  provides:
    - Y-on-Y Growth % editor on every Step 3 revenue line in Y2/Y3 views (Y1 hidden)
    - commitGrowthValue handler — clamps and delegates to handleGrowthChange
    - getDisplayGrowthPct helper — implied growth with 0-floor for empty year
    - getPreviousWizardYearLineTotal helper — Y1→Y2 / Y2→Y3 baseline source
  affects:
    - "51-03 (UX-S3-03 per-line seasonality) — handleGrowthChange now uses business seasonality (priorYear?.seasonalityPattern || Array(12).fill(8.33)); 51-03 should swap that read for getEffectiveSeasonality(line, businessSeasonality) when introducing per-line override"
tech-stack:
  added: []
  patterns:
    - useEditableValue hook (51-00) consumed for the third editor on the same row
    - Optional-prop back-compat (RevenueLineMixInputs accepts activeYear/growthPct/onCommitGrowth as optional → 51-01 Y1 call sites unchanged)
    - Single-source-of-truth handler delegation (commitGrowthValue → handleGrowthChange)
    - Display-floor convention (return 0 for thisYearTotal=0 instead of -100%)
key-files:
  created:
    - src/__tests__/forecast/phase-51-step3-growth.test.tsx (276 lines, 6 tests)
  modified:
    - src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx (+102 / -3 LOC)
decisions:
  - "activeYear is read from state (state.activeYear) — same single source the rest of Step 3 already uses. Editor commits read it via closure, not via prop drilling. Tests flip activeYear via wizard.actions.setActiveYear, which is the same path the production Year tab buttons use."
  - "Display floor for negative implied growth: 0. When thisYearTotal=0 (no Y2 entry yet), return 0 instead of -100. Operator never sees a default -100% on an unfilled future year."
  - "handleGrowthChange's prior-year baseline source CHANGED from Xero priorYear.revenue.byLine.total to the previous WIZARD year line total (Y1→Y2 / Y2→Y3). Tracked as Rule 1 deviation below — the existing handler was dead code (zero call sites in repo) and its prior semantics did not match the operator-facing must-haves (`Y3 = Y2 × g`)."
  - "WIZARD_VERSION stays at 10. types.ts NOT touched. useForecastWizard.ts NOT touched. Single file modified beyond the new test."
metrics:
  duration_minutes: ~30
  completed_date: 2026-05-04
  task_commits: 2
  files_changed: 2
  loc_delta_source: "Step3RevenueCOGS.tsx +102/-3, phase-51-step3-growth.test.tsx +276 (new)"
  tests_added: 6
  tests_baseline_phase50: 13
  tests_baseline_phase51_00: 10
  tests_baseline_phase51_01: 5
  tests_total_green_forecast_suite: 64
---

# Phase 51 Plan 02: Step 3 Y-on-Y Growth % Column for Y2/Y3 Views — Summary

UX-S3-02 shipped. Operator now sees a "Growth %" editor on every Step 3 revenue line when the wizard is in the Y2 or Y3 view. The Y1 view is unchanged. Typing `20` in the Growth editor on a Y2 line sets that line's Y2 total ≈ Y1 total × 1.20 (within ±$10 per-month rounding). Editing $, %, or Growth on the same row round-trips cleanly because all three editors use the `useEditableValue` hook from 51-00 and commit through a single source of truth (`handleGrowthChange` for Growth; `handleMixChange` for $/%).

## What shipped

| File | Δ | Purpose |
|------|---|---------|
| `src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx` | +102 / −3 (net +99) | Extends `<RevenueLineMixInputs>` props with `activeYear / growthPct / onCommitGrowth`; adds third `useEditableValue` editor (clamped to [-100, 1000]) gated on `activeYear === 2 || 3`; rewires `handleGrowthChange` baseline source to the previous wizard year line total; adds `commitGrowthValue`, `getDisplayGrowthPct`, `getPreviousWizardYearLineTotal` helpers; threads new props at both call sites; adds "/ Growth" suffix to the % Split header in Y2/Y3 only |
| `src/__tests__/forecast/phase-51-step3-growth.test.tsx` | +276 (new) | 6 RTL tests under `describe('UX-S3-02 — Step 3 Y-on-Y Growth % column')` using the real-hook `Step3Harness` pattern (extended with `seededActiveYear` to flip Y1→Y2→Y3 via `actions.setActiveYear`). |

### Component signature (extended)

```tsx
interface RevenueLineMixInputsProps {
  // 51-01 (UX-S3-01) — unchanged
  lineId: string;
  lineName: string;
  lineTotal: number;
  linePct: number;
  onCommitDollar: (value: number) => void;
  onCommitPct: (value: number) => void;
  size?: 'sm' | 'xs';

  // 51-02 (UX-S3-02) — new optional fields
  activeYear?: 1 | 2 | 3;
  growthPct?: number;
  onCommitGrowth?: (value: number) => void;
}
```

### Handlers / helpers added

```tsx
// Single source of truth — handleGrowthChange owns distribution math.
const commitGrowthValue = (lineId: string, growthValue: number) => {
  const clamped = Math.max(-100, Math.min(1000, growthValue));
  handleGrowthChange(lineId, clamped);
};

// Implied Y-on-Y growth % for display, with 0-floor when thisYear is 0.
const getDisplayGrowthPct = (lineId: string, thisYearTotal: number): number => {
  if (activeYear === 1) return 0;
  const priorTotal = getPreviousWizardYearLineTotal(lineId, activeYear as 1 | 2 | 3);
  if (priorTotal <= 0) return 0;
  if (thisYearTotal <= 0) return 0; // floor: don't surface -100%
  return Math.round(((thisYearTotal - priorTotal) / priorTotal) * 100);
};

// Y2 baseline = Y1 line total; Y3 baseline = Y2 line total. Y1 returns 0.
const getPreviousWizardYearLineTotal = (lineId: string, year: 1 | 2 | 3): number => {
  if (year === 1) return 0;
  const line = revenueLines.find(l => l.id === lineId);
  if (!line) return 0;
  const previousYear: 1 | 2 = year === 2 ? 1 : 2;
  return getRevenueLineYearTotal(line, previousYear);
};
```

## Commits (2, atomic)

| Order | Hash      | Type           | Subject                                                                         |
|-------|-----------|----------------|---------------------------------------------------------------------------------|
| 1     | `b72e49c` | `test(51-02)`  | RED tests for Step 3 Y-on-Y Growth % column (5 of 6 fail "Unable to find label") |
| 2     | `822e6e2` | `feat(51-02)`  | Add Y-on-Y Growth % column to Step 3 Y2/Y3 views (UX-S3-02)                     |

## TDD execution

| Step  | Outcome |
|-------|---------|
| RED   | 5 of 6 tests failed with `TestingLibraryElementError: Unable to find a label matching /Growth percent for Hardware/i`. Test 1 (Y1 hidden) passed by accident on HEAD because the column doesn't render anywhere yet — locks the contract once GREEN lands. tsc clean for the test file. |
| GREEN | After implementation, 6/6 UX-S3-02 tests pass. Phase 50 baseline (`wizard-v4-bug-fixes.test.tsx`) still 13/13. Full forecast suite 64/64. tsc clean across full repo. |

## Test counts

| Suite | Count | Status |
|-------|-------|--------|
| `phase-51-step3-growth.test.tsx` (NEW) | 6 | 6/6 |
| `phase-51-step3-dollar-percent.test.tsx` (51-01 baseline) | 5 | 5/5 |
| `phase-51-helpers.test.ts` (51-00 baseline) | 10 | 10/10 |
| `wizard-v4-bug-fixes.test.tsx` (Phase 50 baseline) | 13 | 13/13 |
| `src/__tests__/forecast/` (full forecast suite) | 64 | 64/64 |

## Verification gates

| Gate | Result |
|------|--------|
| `npx vitest run src/__tests__/forecast/phase-51-step3-growth.test.tsx` | 6/6 ✓ |
| `npx vitest run src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx` | 13/13 ✓ |
| `npx vitest run src/__tests__/forecast/phase-51-step3-dollar-percent.test.tsx` | 5/5 ✓ |
| `npx vitest run src/__tests__/forecast/` | 64/64 ✓ |
| `npx tsc --noEmit` | clean (exit 0) |
| `npx eslint src/__tests__/forecast/phase-51-step3-growth.test.tsx` | clean (exit 0) |
| `npx eslint src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx` | 1 PRE-EXISTING warning (`calculateCOGSAmount` useMemo dep — predates Phase 51, logged in deferred-items.md by 51-01) |
| `grep -c "commitGrowthValue\|Growth percent for" src/app/.../Step3RevenueCOGS.tsx` | 4 hits — handler defined + JSX label present |
| `git diff origin/main..HEAD --stat` | 2 files: `phase-51-step3-growth.test.tsx +276` (new), `Step3RevenueCOGS.tsx +102/-3` |

## Hard rules respected

- [x] WIZARD_VERSION stays at 10 (not bumped)
- [x] `useForecastWizard.ts` NOT touched (51-03 is the only plan that touches it)
- [x] `types.ts` NOT touched (no new state fields needed for Growth %)
- [x] Backward compat: forecasts saved before this plan render identically. The Growth editor displays implied growth (computed read-only from existing `year2Monthly`/`year3Monthly`) until the operator edits it. No new optional state fields introduced.
- [x] Used `useEditableValue` from 51-00 (no reinvention of pending-state pattern)
- [x] 51-01's `<RevenueLineMixInputs>` Y1 call sites still produce the same 2-editor render (the new Growth editor only renders when `activeYear === 2 || 3` AND `onCommitGrowth` is provided)
- [x] Growth column hidden in Y1 view (Test 1 locks this contract)

## Deviations from plan

### Auto-fixed issues

**1. [Rule 1 — Bug] handleGrowthChange's prior-year baseline source corrected**

- **Found during:** Task 2 GREEN run, after writing the tests against the operator-facing must-haves.
- **Issue:** The existing `handleGrowthChange` (Step3RevenueCOGS.tsx:472, on HEAD) reads its baseline from `getLinePriorYear(lineId)` → `priorYear?.revenue.byLine.find(l => l.id === lineId)?.total` (Xero historical priorYear data). The plan's must-haves explicitly require:
  - "Typing 20 in the Growth % editor on a Y2 line sets that line's Y2 total = Y1 total × 1.20"
  - Test 4 — "Y3 view: line seeded with Y1=$50k AND Y2=$60k. Type '10' → Y3 total = $60k × 1.10"

  These are "growth from previous WIZARD year", not "growth from Xero historical priorYear". For Y3 there's no Xero "Y2-prior" to compare against — the baseline must be the wizard's Y2 line total. The pre-Phase-51 handler was also early-returning (`if (priorTotal <= 0) return`) for any forecast where Xero priorYear was missing, which silently ate the operator's edit.

- **Why this is a Rule 1 fix (not Rule 4):** `handleGrowthChange` had **zero call sites in the repo on HEAD** (verified via `grep -rn "handleGrowthChange" src/`). It was dead code. Repointing its baseline source to align with the operator-facing must-haves does not change observable behavior anywhere — it gives the handler real semantics for the first time and unblocks the new Growth editor. No structural / architectural change required (no new state field, no new helper signature on the rollup engine).
- **Fix:** Added `getPreviousWizardYearLineTotal(lineId, year)` (Y2 → Y1 line total; Y3 → Y2 line total; Y1 → 0). `handleGrowthChange` now reads from that. Distribution math (seasonality / actuals-locking) is unchanged.
- **Files modified:** `Step3RevenueCOGS.tsx`
- **Commit:** `822e6e2`

The plan's `<interfaces>` snippet showed `handleGrowthChange(lineId, growthPct, year)` (3-arg signature). The actual handler in the codebase is `handleGrowthChange(lineId, growthPct)` and uses the closed-over `activeYear`. I kept the closed-over signature — passing year as a 3rd arg would have required threading it through every call site (only one new call site here) and is more brittle. `commitGrowthValue` invokes `handleGrowthChange(lineId, clamped)` and the handler picks up the active year from state.

### Design adjustments (no rule-breaking deviation)

- The plan suggested a separate "Growth" column header. I instead suffixed the existing `% Split` header with `/ Growth` (only in Y2/Y3) so the editor inputs stay grouped under one column cell. The visual grouping reads `$ <input> <input>% <input>%▲` and tucks under one `<th>` — preserves table layout proportions across Y1 and Y2/Y3.
- Used `%▲` as the Growth symbol after the input (visual cue — small triangle) instead of just `%` to disambiguate from the Split %. Standard `%` would visually clash with the existing % editor.
- Tests' Step3Harness extension uses `actions.setActiveYear(year)` and a render-blocking guard (`if (wizard.state.activeYear !== seededActiveYear) return null`) to wait one render tick for the activeYear flip before asserting on the Growth input. Avoids a race where the Y2 editor mounts before activeYear has propagated.

## Authentication gates

None. No external auth required — all changes are client-side React.

## Notes for downstream plans

### 51-03 (UX-S3-03 per-line seasonality)

`handleGrowthChange` now reads `seasonality = priorYear?.seasonalityPattern || Array(12).fill(8.33)` at line 489 (post-edit). When 51-03 introduces per-line seasonality override, replace that read with `getEffectiveSeasonality(line, businessSeasonality)` so the per-line override propagates through the Growth flow too. This is exactly the lockstep-helper migration RESEARCH.md called out for 7+ existing call sites.

The `commitGrowthValue` → `handleGrowthChange` plumbing is the same pattern 51-03 will need for its own per-line seasonality commit handler.

### 51-05 (UX-S5-01 OpEx $/% toggle)

The `<RevenueLineMixInputs>` 3-editor pattern (paired editors with shared commit handlers, all using `useEditableValue`) extended cleanly by adding optional props. `<OpExLineRateInputs>` in 51-05 (already shipped) uses the same approach.

## Sentinel (manual smoke)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Envisage 3-yr forecast → Step 3 → Y1 view | No Growth column visible |
| 2 | Switch to Y2 view | "% Split / Growth" header visible; per-row Growth editor visible alongside $ and % |
| 3 | Type "20" in Growth on a Y2 line | Y2 total ≈ Y1 line total × 1.20; $ editor updates after blur |
| 4 | Switch to Y3 view | Growth editor still visible; default value shows implied growth from Y2 → Y3 |
| 5 | Type "10" in Growth on a Y3 line | Y3 total ≈ Y2 line total × 1.10 |
| 6 | Switch back to Y1 view | Growth column gone; rows render with just $ and % editors as before |

(Sentinel run by Matt on the deployed Vercel preview after PR merge — see PR body for branch URL.)

## Self-Check: PASSED

```
[x] src/__tests__/forecast/phase-51-step3-growth.test.tsx — exists (276 lines, 6 tests)
[x] src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx — modified (+102/-3 net +99 LOC)
[x] commit b72e49c (RED) — found in `git log feat/51-02-step3-growth-pct`
[x] commit 822e6e2 (GREEN) — found in `git log feat/51-02-step3-growth-pct`
[x] WIZARD_VERSION unchanged (still 10)
[x] useForecastWizard.ts not modified (`git diff origin/main..HEAD --stat` shows only Step3RevenueCOGS + new test)
[x] types.ts not modified
[x] commitGrowthValue exists in Step3RevenueCOGS.tsx and delegates to handleGrowthChange
[x] aria-label "Growth percent for <lineName>" present on the new editor (verified via passing tests)
[x] Y1 hidden contract enforced (Test 1 passes — column does not render in Y1)
[x] All 6 UX-S3-02 tests pass
[x] All 13 Phase 50 baseline tests pass
[x] All 5 Phase 51-01 tests pass
[x] All 10 Phase 51-00 helper tests pass
[x] All 64 forecast suite tests pass
[x] tsc clean across full repo
[x] eslint clean for both touched files (1 pre-existing warning, not introduced by this plan)
```

## Issues

None blocking. Pre-existing items already documented in `.planning/phases/51-forecast-wizard-ux/deferred-items.md` (logged by 51-01) — no new entries from this plan.
