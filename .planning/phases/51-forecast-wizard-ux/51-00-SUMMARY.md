---
phase: 51-forecast-wizard-ux
plan: 00
subsystem: forecast-wizard-v4
tags: [shared-helpers, lockstep-pattern, tdd, math-neutral, pre-work]
requires: []
provides:
  - useEditableValue hook (PR #82 pending-state pattern, generalised)
  - getEffectiveSeasonality helper (per-line override resolver)
  - getRevenueLineMonthlyDistribution helper (lockstep distribution)
affects:
  - "51-01 (UX-S3-01 $/% parity) — will import useEditableValue + getRevenueLineMonthlyDistribution"
  - "51-02 (UX-S3-02 Growth %) — will import getRevenueLineMonthlyDistribution"
  - "51-03 (UX-S3-03 per-line seasonality) — will import getEffectiveSeasonality at 12+ sites + getRevenueLineMonthlyDistribution"
  - "51-05 (UX-S5-01 OpEx $/% toggle) — likely to import useEditableValue"
tech-stack:
  added: []
  patterns:
    - Lockstep-helper extraction (Phase 50 Bug 4 precedent — getPlannedSpendPLBreakdown)
    - Local pending-state controlled inputs (PR #82)
    - TDD RED → GREEN with module-not-found as the RED signal
key-files:
  created:
    - src/app/finances/forecast/components/wizard-v4/hooks/useEditableValue.ts (106 lines)
    - src/app/finances/forecast/components/wizard-v4/utils/line-distribution.ts (107 lines)
    - src/__tests__/forecast/phase-51-helpers.test.ts (211 lines)
  modified: []
decisions:
  - "Treated pending=null vs pending='' distinction as semantically meaningful (null = not editing; empty string = editing but cleared); simplifies the isPending check to a single ternary"
  - "Froze FALLBACK_SEASONALITY constant and returned a slice() copy from getEffectiveSeasonality so callers can't accidentally mutate the shared array"
  - "Defaulted seasonality lookup to 8.33 inside the distribution loop (per-element fallback) on top of the array-level fallback in getEffectiveSeasonality, defending against malformed business patterns with fewer than 12 elements"
metrics:
  duration: ~10 minutes
  completed: 2026-05-04T20:07:37Z
  tasks: 3
  files-created: 3
  files-modified: 0
  tests-added: 10
  tests-regression-checked: 29 (full forecast suite)
---

# Phase 51 Plan 00: Shared helpers for forecast wizard UX work — Summary

Two pure helpers + a 10-test spec, shipped as a math-neutral foundation so 51-01, 51-02, 51-03, and 51-05 can call them on day 1 and the lockstep-helper class of bugs (Phase 50 Bug 4) cannot reappear when per-line seasonality (UX-S3-03) lands.

## What shipped

| Module | Exports | Purpose | Future consumer |
|--------|---------|---------|-----------------|
| `hooks/useEditableValue.ts` | `useEditableValue(committedValue, commit, options?)` | Generalised pending-state pattern from PR #82 — controlled inputs with derived display values keep keystrokes intact until blur/Enter | 51-01 ($ entry), 51-03 (seasonality editor inputs), 51-05 ($/% toggle) |
| `utils/line-distribution.ts` | `getEffectiveSeasonality(line, businessSeasonality)` | Single source of truth for resolving line-level override → business → 8.33% fallback | 51-03 (replaces 12+ inline `priorYear?.seasonalityPattern || Array(12).fill(8.33)` reads — 7 in Step3RevenueCOGS.tsx, 5 in useForecastWizard.ts) |
| `utils/line-distribution.ts` | `getRevenueLineMonthlyDistribution(line, annualTarget, businessSeasonality, monthKeys, isActualMonth)` | Distributes annual target across months while preserving Y1 actual locks; honours per-line or business seasonality | 51-01 ($ entry), 51-02 (Growth %), 51-03 (override) — display + rollup share one impl |

### Hook signature

```typescript
function useEditableValue(
  committedValue: number,
  commit: (value: number) => void,
  options?: {
    parse?: (raw: string) => number;     // default: parseFloat with NaN→0
    format?: (value: number) => string;  // default: String(v) with empty for nullish/NaN
  },
): {
  display: string;
  isPending: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};
```

### Helper signatures

```typescript
function getEffectiveSeasonality(
  line: { seasonalityPattern?: number[] },
  businessSeasonality: number[] | undefined,
): number[];

function getRevenueLineMonthlyDistribution(
  line: { id: string; year1Monthly: MonthlyData; seasonalityPattern?: number[] },
  annualTarget: number,
  businessSeasonality: number[] | undefined,
  monthKeys: string[],
  isActualMonth: (monthKey: string) => boolean,
): MonthlyData;
```

## Commits (3, atomic)

| Order | Hash | Type | Subject |
|-------|------|------|---------|
| 1 | `e07318a` | `test(51-00)` | RED tests for useEditableValue + line-distribution helpers |
| 2 | `8b91b1f` | `feat(51-00)` | implement useEditableValue hook |
| 3 | `af2e55a` | `feat(51-00)` | implement line-distribution helpers |

## TDD execution

| Step | Outcome |
|------|---------|
| RED | `npx vitest run src/__tests__/forecast/phase-51-helpers.test.ts` → "Failed to resolve import" for both helper modules. Vitest reports `Test Files 1 failed (1)`, `Tests no tests`. |
| GREEN (Task 1) | After useEditableValue commit, vitest still RED on the line-distribution import (deliberately deferred to Task 2). tsc clean for the new hook. |
| GREEN (Task 2) | All 10 tests pass. Phase 50 regression (`wizard-v4-bug-fixes.test.tsx`) still 13/13 green. Full `src/__tests__/forecast/` suite 29/29 green. |

## Test counts

| Suite | Count | Status |
|-------|-------|--------|
| `phase-51-helpers.test.ts` (NEW) | 10 (4 useEditableValue + 3 getEffectiveSeasonality + 3 getRevenueLineMonthlyDistribution) | 10/10 |
| `wizard-v4-bug-fixes.test.tsx` (Phase 50 baseline) | 13 | 13/13 (no regression) |
| `src/__tests__/forecast/` (full forecast suite) | 29 | 29/29 |

## Verification gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | clean (exit 0) |
| `npx vitest run src/__tests__/forecast/phase-51-helpers.test.ts` | 10/10 |
| `npx vitest run src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx` | 13/13 (Phase 50 lockstep regression preserved) |
| `npx vitest run src/__tests__/forecast/` | 29/29 |
| `npx eslint <3 new files>` | clean (exit 0) |
| `grep -rn "useEditableValue\|getEffectiveSeasonality\|getRevenueLineMonthlyDistribution" src/app src/__tests__` | Returns ONLY the 3 new files. **Zero production consumers** — math-neutral by construction, as required. |

## Files touched

**Created (3):**
- `src/app/finances/forecast/components/wizard-v4/hooks/useEditableValue.ts` (106 lines, new `hooks/` directory)
- `src/app/finances/forecast/components/wizard-v4/utils/line-distribution.ts` (107 lines, in existing `utils/`)
- `src/__tests__/forecast/phase-51-helpers.test.ts` (211 lines)

**Modified:** none. **Hard rule respected** — `Step3RevenueCOGS.tsx`, `useForecastWizard.ts`, and `types.ts` are untouched. `WIZARD_VERSION` stays at 10.

## Deviations from Plan

None — plan executed exactly as written. Three small implementation choices documented in the `decisions:` frontmatter (frozen fallback constant + slice copy; per-element 8.33 fallback inside the distribution loop; null vs '' pending semantics) — none are deviations from the spec, just defensive defaults that match the public contract.

## Decisions

1. **`pending: string | null` (not `string`).** The plan suggests using `setPending(prev => { ...; delete; })` style. I went with `null = not editing; string = pending`, which makes `isPending` a single boolean check and keeps the empty-string-as-pending case (operator backspaces to empty) correct.
2. **`Object.freeze(Array(12).fill(8.33))` + `.slice()` on return.** Defends against a downstream consumer mutating the returned array (which would corrupt the shared fallback for every other call site). Cheap insurance.
3. **Per-element `seasonality[idx] ?? 8.33` inside the distribution loop.** Belt-and-braces on top of the array-level fallback in `getEffectiveSeasonality`, in case a business hands us a non-12-element pattern that somehow slipped through.
4. **Did not extract a shared test-fixture file.** RESEARCH.md noted "extract `Step3Harness`, `makeStubState`, etc. to a shared `__tests__/forecast/_helpers.ts` if duplication grows." It hasn't grown — Phase 51-00 only needs `targetFYKeys` + `emptyMonthly`, both inlined in this small test file. Extraction can wait until 51-01 / 51-03 lands and we see the pattern repeat.

## Notes for downstream plans

### 51-01 (UX-S3-01 $/% parity)
Replace the existing `pendingMixPcts` / `pendingCogsMixPcts` machinery in `Step3RevenueCOGS.tsx` (lines 45–84) with `useEditableValue` per row. Add a sibling `$` editor that calls the same `handleMixChange` after `dollar / annualTarget * 100` conversion. For monthly distribution after the commit, call `getRevenueLineMonthlyDistribution(line, annualTarget, businessSeasonality, monthKeys, isActualMonth)` so display + rollup agree.

### 51-02 (UX-S3-02 Growth %)
The Y2 column should render a third editor that's a `useEditableValue` over the growth percentage. On commit, compute `annualTarget = priorYearTotal * (1 + growthPct/100)` and feed that into `getRevenueLineMonthlyDistribution`. No new helpers needed.

### 51-03 (UX-S3-03 per-line seasonality) — most critical migration
Migrate every site that currently reads `priorYear?.seasonalityPattern || Array(12).fill(8.33)` to `getEffectiveSeasonality(line, priorYear?.seasonalityPattern)`. Sites verified by code search:
- `Step3RevenueCOGS.tsx` lines 183, 210, 249, 379, 462, 603 (7 hits)
- `useForecastWizard.ts` lines 304, 366, 890, 934, 1410 (5 hits)

Then add the override field to `RevenueLine` and `COGSLine` in `types.ts` (`seasonalityPattern?: number[]`) and the modal editor. Because every reader now goes through `getEffectiveSeasonality`, the override propagates everywhere automatically. Use `getRevenueLineMonthlyDistribution` for the modal's preview and the rollup engine.

### 51-05 (UX-S5-01 $/% toggle)
The `useEditableValue` hook is generic over numeric inputs — wire the `$` and `%` toggles in Step5OpEx the same way 51-01 does in Step3. The `format` option is the place to inject `$` prefix or `%` suffix display.

## Self-Check: PASSED

Verified the following before submission:

```
[x] src/app/finances/forecast/components/wizard-v4/hooks/useEditableValue.ts — exists (106 lines)
[x] src/app/finances/forecast/components/wizard-v4/utils/line-distribution.ts — exists (107 lines)
[x] src/__tests__/forecast/phase-51-helpers.test.ts — exists (211 lines)
[x] commit e07318a — found in git log (test RED)
[x] commit 8b91b1f — found in git log (hook impl)
[x] commit af2e55a — found in git log (helpers impl)
[x] no production code imports the new helpers (grep across src/app returns only the new files themselves)
[x] WIZARD_VERSION unchanged
[x] Step3RevenueCOGS.tsx not modified (git diff main..HEAD --stat shows only the 3 new files + this SUMMARY)
[x] useForecastWizard.ts not modified
```
