---
phase: 51-forecast-wizard-ux
plan: 01
subsystem: forecast-wizard-v4
tags: [step3, dollar-percent-parity, ux-s3-01, tdd, useEditableValue-consumer]
requires:
  - 51-00 (useEditableValue hook)
provides:
  - Bidirectional $/% input pair on every Step 3 revenue line (summary + monthly views)
  - commitDollarValue handler — converts $ → % and delegates to handleMixChange
  - <RevenueLineMixInputs> child component (~75 LOC) for hooks-in-loop compliance
affects:
  - "51-02 (UX-S3-02 Growth %) — can extend <RevenueLineMixInputs> with a third editor or render a sibling Growth-% column"
  - "51-03 (UX-S3-03 per-line seasonality) — useEditableValue is now in production use; the seasonality editor can rely on it"
  - "51-05 (UX-S5-01 OpEx $/% toggle) — useEditableValue battle-tested in Step 3, ready to wire in Step 5"
tech-stack:
  added: []
  patterns:
    - useEditableValue hook (51-00) consumed in production for the first time
    - Child-component extraction for hooks-in-loop compliance (Rules of Hooks)
    - Single-source-of-truth handler delegation ($ → % → handleMixChange)
key-files:
  created:
    - src/__tests__/forecast/phase-51-step3-dollar-percent.test.tsx (243 lines, 5 tests)
    - .planning/phases/51-forecast-wizard-ux/deferred-items.md (housekeeping)
  modified:
    - src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx (+159, -41 LOC; +118 net)
decisions:
  - "% column means 'share of goals.year[N].revenue' (NOT 'share of forecast total') so it round-trips with the new $ column. The legacy linePercentages computation is still used as a no-yearTarget fallback."
  - "<RevenueLineMixInputs> is a child component (not a hook), so useEditableValue can be called per-row without violating Rules of Hooks. Both summary view (size='sm') and monthly view (size='xs') call the same component."
  - "Kept pendingCogsMixPcts + the COGS branch of commitMixPct intact — COGS work is out of scope for 51-01."
  - "Defensive: kept commitMixPct's revenue branch as a defensive no-op delegating to handleMixChange (currently unreachable from JSX) so future re-introduction of a non-useEditableValue revenue control wouldn't silently misroute."
metrics:
  duration: ~25 minutes
  completed: 2026-05-04T20:30:00Z
  tasks: 2
  files-created: 2
  files-modified: 1
  tests-added: 5
  tests-regression-checked: 34 (full forecast suite)
---

# Phase 51 Plan 01: Step 3 Revenue $/% bidirectional parity — Summary

UX-S3-01 shipped. Operator can now type either an annual $ amount or a % share on every Step 3 revenue line in the summary view AND the monthly view; the other input updates after blur. Both inputs use the `useEditableValue` hook from 51-00 so neither flickers nor loses keystrokes mid-edit. The single source of truth for distribution math remains `handleMixChange` — the new `$` editor commits via `commitDollarValue`, which converts `$ → %` then delegates.

## What shipped

| File | Δ | Purpose |
|------|---|---------|
| `src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx` | +159 / −41 (net +118) | Adds `<RevenueLineMixInputs>` child + `commitDollarValue` + `yearTargetRevenue`; removes `pendingMixPcts` revenue state; replaces both `% Split` inputs (summary + monthly views) with the new paired $/% editor |
| `src/__tests__/forecast/phase-51-step3-dollar-percent.test.tsx` | +243 (new) | 5 RTL tests under `describe('UX-S3-01 — Step 3 $/% bidirectional parity')` using the real-hook `Step3Harness` pattern (extended with `initialGoals` seeding via `actions.updateGoals`) |
| `.planning/phases/51-forecast-wizard-ux/deferred-items.md` | +9 (new) | Logs 1 pre-existing lint warning + 1 build-env issue (both predate this plan) |

### Component signature

```tsx
interface RevenueLineMixInputsProps {
  lineId: string;
  lineName: string;
  lineTotal: number;        // committed annual $ (sum of monthly data)
  linePct: number;          // committed % (share of yearTargetRevenue)
  onCommitDollar: (value: number) => void;
  onCommitPct: (value: number) => void;
  size?: 'sm' | 'xs';       // sm for summary view, xs for monthly view
}
```

### Handler

```tsx
const commitDollarValue = (lineId: string, dollarValue: number) => {
  const yearTarget = goals.year[N].revenue || 0;
  if (yearTarget <= 0) return;
  const pct = Math.round((dollarValue / yearTarget) * 100);
  const clamped = Math.max(0, Math.min(100, pct));
  handleMixChange(lineId, clamped); // single source of truth
};
```

## Commits (2, atomic)

| Order | Hash | Type | Subject |
|-------|------|------|---------|
| 1 | `3c4a85d` | `test(51-01)` | RED tests for Step 3 $/% bidirectional sync (5 tests, all failing with "unable to find label" because the $ input did not exist yet) |
| 2 | `090026b` | `feat(51-01)` | add $ column with bidirectional %/$ sync on Step 3 revenue lines (UX-S3-01) |

## TDD execution

| Step | Outcome |
|------|---------|
| RED | All 5 tests failed with `TestingLibraryElementError: Unable to find a label matching /Annual dollars for Hardware/i`. tsc clean for the test file. |
| GREEN | After implementation, 5/5 UX-S3-01 tests pass. Phase 50 baseline (`wizard-v4-bug-fixes.test.tsx`) still 13/13 green. Full forecast suite 34/34 green. |

### Mid-execution adjustment (test rounding tolerance)

Test 3 (round-trip $40k → 20% → $80k) initially asserted `dollarInput.value === 40000` after the % round-trip; actual value was `39996` because `handleMixChange` rounds per-month (`40000 / 12 = 3333.33 → 3333 × 12 = 39996`). This is pre-existing behavior of the existing handler, not a bug introduced by this plan. The test was relaxed to `Math.abs(value - 40_000) <= 10`. Documented in the GREEN commit message and not flagged as a deviation because it's a test-side accommodation of an existing rounding behavior the plan does not change.

## Test counts

| Suite | Count | Status |
|-------|-------|--------|
| `phase-51-step3-dollar-percent.test.tsx` (NEW) | 5 | 5/5 |
| `wizard-v4-bug-fixes.test.tsx` (Phase 50 baseline) | 13 | 13/13 (no regression) |
| `phase-51-helpers.test.ts` (Phase 51-00 baseline) | 10 | 10/10 (no regression) |
| `initialize-from-xero-target-aware.test.ts` | 6 | 6/6 (no regression) |
| `src/__tests__/forecast/` (full forecast suite) | 34 | 34/34 |

## Verification gates

| Gate | Result |
|------|--------|
| `npx vitest run src/__tests__/forecast/phase-51-step3-dollar-percent.test.tsx` | 5/5 ✓ |
| `npx vitest run src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx` | 13/13 ✓ |
| `npx vitest run src/__tests__/forecast/` | 34/34 ✓ |
| `npx tsc --noEmit` | clean (exit 0) |
| `npx eslint src/__tests__/forecast/phase-51-step3-dollar-percent.test.tsx` | clean (exit 0) |
| `npx eslint Step3RevenueCOGS.tsx` | 1 PRE-EXISTING warning (`calculateCOGSAmount` useMemo dep, was line 594 on main, now ~712 due to added LOC). Verified by `git stash` + lint on origin/main. Logged in deferred-items.md. |
| `grep -nE "pendingMixPcts[^A-Za-z]" src/app/...Step3RevenueCOGS.tsx` | 1 hit — comment only ("Phase 51-01: the REVENUE pendingMixPcts state was removed"). Zero code references. |
| `grep -c "pendingCogsMixPcts" src/app/...Step3RevenueCOGS.tsx` | 5 hits — COGS branch preserved as required |
| `npm run build` | Compilation succeeded; page-data collection failed on missing `supabaseUrl` env for unrelated `/api/Xero/reconciliation` route. Pre-existing in this worktree (no `.env.local`); Vercel CI builds correctly with proper env. Logged in deferred-items.md. |

## Hard rules respected

- [x] `WIZARD_VERSION` stays at 10 (not bumped)
- [x] `useForecastWizard.ts` not touched (51-03 is the only plan that touches it)
- [x] `types.ts` not touched (no new state fields in 51-01)
- [x] Backward compat: no new optional state fields introduced. Older saved forecasts render identically — Test 5 verifies this with a seeded line whose monthly values predate any $ entry.
- [x] Used `useEditableValue` from 51-00 (no reinvention of pending-state pattern)
- [x] COGS branch (`pendingCogsMixPcts`) untouched

Note on `getRevenueLineMonthlyDistribution`: the plan permits using this 51-00 helper for any new $-amount → monthly distribution math. In 51-01, the $ → monthly path goes `commitDollarValue → handleMixChange`, and `handleMixChange` already owns the distribution logic in-place. Migrating that to the helper would be a refactor of pre-existing code (out of scope) and would risk introducing rounding differences during 51-01. The helper will be consumed in 51-03 (per-line seasonality) where it earns its keep at all 12+ call sites.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] % column semantics changed from "share of revenue-line total" to "share of `goals.year[N].revenue`"**

- **Found during:** Task 2 GREEN run. With one revenue line in the test fixture, the legacy `linePercentages[lineId]` always returned 100% (because the line is the only line, regardless of $ amount). The plan's must-haves explicitly require: *"Typing $50,000 in the $ column updates the % column to that line's share of `goals.year1.revenue` (e.g. 25% if goal=200000)"* — i.e., share of GOAL, not share of CURRENT-TOTAL.
- **Issue:** If `<RevenueLineMixInputs>` had used the legacy `linePercentages[lineId]` for `linePct`, Tests 1, 4, and 5 would fail because % would display 100 (single line dominates) instead of 25.
- **Fix:** In Step3RevenueCOGS, derive `linePct = round(lineTotal / yearTargetRevenue * 100)` for the new editor (with legacy `linePercentages[line.id]` as a fallback when `yearTargetRevenue === 0`). This makes the % editor round-trip with `commitDollarValue` and matches `handleMixChange`'s own `yearTarget * (mix/100)` semantics.
- **Files modified:** `Step3RevenueCOGS.tsx` (the JSX call sites of `<RevenueLineMixInputs>`)
- **Commit:** `090026b`

The plan's `<interfaces>` snippet showed `linePercentages[line.id] / 100 * yearTarget` for the dollar derivation — which is the inverse direction and would have suffered the same single-line problem. The fix above resolves both directions consistently.

**2. [Rule 1 — UI] Pre-existing lint warning + build env failure deferred**

- One pre-existing lint warning (`calculateCOGSAmount` dep) and one build env issue (missing `supabaseUrl`) were both verified to predate this plan. Logged in `.planning/phases/51-forecast-wizard-ux/deferred-items.md` per SCOPE BOUNDARY rules.

### Design adjustments (no rule-breaking deviation)

- The plan suggested calling the child component `<RevenueLineRow>`. Renamed to `<RevenueLineMixInputs>` because it doesn't render the entire row — only the paired $/% editor cell. Both call sites (summary `<td>` and monthly `<td>`) inject the editor into a wider row.
- Added `size: 'sm' | 'xs'` prop to switch between summary-view widths (`w-20` / `w-14`, `text-sm`) and monthly-view widths (`w-16` / `w-12`, `text-xs`) without duplicating the component.
- `$` symbol placed BEFORE the dollar input (universal currency UX); `%` placed AFTER the percent input. Plan's snippet had `$` after; either reads naturally but pre-symbol is more standard.

## Authentication gates

None. No external auth required — all changes are client-side React refactors.

## Notes for downstream plans

### 51-02 (UX-S3-02 Growth %)

The `<RevenueLineMixInputs>` component is a natural extension point. For Y2/Y3 view, add a third editor (Growth %) inside the same component, mutually exclusive with the other two (typing in any one updates the other two via the existing `handleGrowthChange`). Or render a sibling component to keep the props surface narrower. Either approach should reuse `useEditableValue` for keystroke integrity.

### 51-03 (UX-S3-03 per-line seasonality)

`useEditableValue` is now in production use — 51-03's seasonality modal editor (12 month inputs) can rely on the same hook for each cell. The seasonality migration should also start replacing `priorYear?.seasonalityPattern || Array(12).fill(8.33)` with `getEffectiveSeasonality()` at all 12+ call sites identified in RESEARCH.md, then add the override field. The `getRevenueLineMonthlyDistribution` helper from 51-00 will earn its keep there.

### 51-05 (UX-S5-01 OpEx $/% toggle)

The `<RevenueLineMixInputs>` pattern (paired editor with shared commit handler) is a transferable model for Step 5's $/% toggle. Rename to `<OpExLineRateInputs>` and adapt the commit handler.

## Self-Check: PASSED

```
[x] src/__tests__/forecast/phase-51-step3-dollar-percent.test.tsx — exists (243 lines, 5 tests)
[x] src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx — modified (+118 net LOC)
[x] .planning/phases/51-forecast-wizard-ux/deferred-items.md — exists (housekeeping)
[x] commit 3c4a85d (RED) — found in `git log feat/51-01-step3-dollar-percent`
[x] commit 090026b (GREEN) — found in `git log feat/51-01-step3-dollar-percent`
[x] WIZARD_VERSION unchanged (still 10)
[x] useForecastWizard.ts not modified (`git diff origin/main..HEAD --stat` shows only Step3RevenueCOGS + new test + SUMMARY + deferred-items)
[x] types.ts not modified
[x] pendingCogsMixPcts retained (5 hits in Step3RevenueCOGS.tsx)
[x] pendingMixPcts removed (only 1 hit, in a comment)
[x] commitDollarValue exists in Step3RevenueCOGS.tsx and delegates to handleMixChange
[x] aria-labels present on both inputs (verified via passing tests using findByLabelText)
[x] All 5 UX-S3-01 tests pass
[x] All 13 Phase 50 baseline tests pass
[x] All 34 forecast suite tests pass
[x] tsc clean across full repo
[x] eslint clean for both touched files (1 pre-existing warning unrelated, logged)
```

## Issues

None blocking. Two pre-existing items deferred to `.planning/phases/51-forecast-wizard-ux/deferred-items.md`:
1. Pre-existing useMemo dep warning in Step3RevenueCOGS.tsx (predates Phase 51).
2. Local build fails on missing Supabase env in this worktree (Vercel CI unaffected).
