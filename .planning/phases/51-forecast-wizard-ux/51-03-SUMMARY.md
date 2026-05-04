---
phase: 51-forecast-wizard-ux
plan: 03
subsystem: forecast-wizard-v4
tags: [tdd, lockstep-pattern, seasonality, modal, back-compat, math-neutral]
requires:
  - 51-00 (getEffectiveSeasonality helper + line-distribution module)
  - 51-01 (useEditableValue + RevenueLineMixInputs scaffolding)
  - 51-02 (Y-on-Y Growth % column — coexists with seasonality button on row)
provides:
  - Per-line seasonality override (revenue + fixed COGS) end-to-end (display + rollup lockstep)
  - SeasonalityEditorModal (12-month editor, sum-to-100 validation, save/reset/cancel)
  - Variable-COGS row gating (operator decision encoded)
affects:
  - "Phase 51 COMPLETE — this is the final plan in the wave"
  - "Step 9 Review monthly preview now reflects per-line overrides automatically (rollup honors override via getEffectiveSeasonality)"
  - "Cashflow downstream picks up override via state.revenueLines[*].seasonalityPattern + summary aggregate"
tech-stack:
  added: []
  patterns:
    - Lockstep-helper extraction (Phase 50 Bug 4 precedent — consumers funnel through one helper)
    - Inline modal (matches showAddVendor / showAddRevenue pattern, no portal)
    - Real-hook test harness (Step3Harness with onWizard callback for state introspection)
    - Backward-compat regression lock (HEAD-baseline numbers regression-locked at RED time)
    - Nullish coalescing per-element fallback (`?? 8.33`) — explicit 0 in override stays 0
key-files:
  created:
    - src/__tests__/forecast/phase-51-step3-seasonality.test.tsx (560 lines, 11 tests)
  modified:
    - src/app/finances/forecast/components/wizard-v4/types.ts (+16 LOC; optional `seasonalityPattern?: number[]` on RevenueLine + COGSLine)
    - src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx (+250 / -22 LOC; 6 site migration + SeasonalityEditorModal + 4 row buttons + modal render)
    - src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts (+24 / -9 LOC; 5 site migration; per-element fallback bug fix)
decisions:
  - "Folded Task 4 (types.ts field add) into Task 2's commit. TypeScript strict structural typing requires the optional field on RevenueLine/COGSLine for `getEffectiveSeasonality(line, ...)` to type-check at the migrated sites. Plan's runtime ordering preserved (no consumer reads the field until Task 5; bit-identical math after Tasks 2+3). Documented as Rule 3 deviation in commit bbe177d."
  - "Auto-fixed pre-existing `seasonality[idx] || 8.33` bug in Task 5. Surfaced when override has explicit 0% (e.g. `[50,30,10,5,1,1,1,1,1,0,0,0]` for Apr/May/Jun zeros): JS treats 0 as falsy → fallback to 8.33 → denominator inflates from 100 → 124.99 → distribution scales wrong. Fixed by changing 18 sites to `?? 8.33` (nullish coalescing). Bit-identical for Test 10 + 10b regression locks (production seasonality patterns from Xero never have zeros). Documented as Rule 1 deviation in commit 04fa056."
  - "Aggregate-vs-per-line site analysis at migration: 5 of 11 sites are aggregate (line doesn't exist yet OR top-level export) and pass `{}` as the line argument; 6 are per-line and pass the looked-up line. Each site's intent is captured in inline comments at the call site for future grep-driven discoverability."
  - "SeasonalityEditorModal is inline-rendered in Step3RevenueCOGS.tsx (not extracted to components/). Matches the project's existing inline-modal pattern (showAddRevenue, showAddVendor) and avoids the cost of a 4th-site extraction trigger that doesn't yet exist. Will be revisited if a 4th use site (e.g., business-level seasonality editor) appears."
  - "Reset button writes `seasonalityPattern: undefined` (not delete the key). updateRevenueLine spreads `{...line, ...updates}` — assigning undefined removes the override semantically (helper checks `line.seasonalityPattern && length === 12`). Validated by Test 9."
metrics:
  duration: ~70 minutes
  completed: 2026-05-04
  tasks: 4 (Task 4 folded into Task 2 due to TS strict typing — see decisions)
  commits: 4 (RED + 2 refactors + GREEN)
  files-created: 1
  files-modified: 3
  tests-added: 11
  tests-regression-checked: 85 (full forecast suite)
---

# Phase 51 Plan 03: Step 3 per-line seasonality override (UX-S3-03) Summary

UX-S3-03 shipped end-to-end with **lockstep guaranteed by construction**: every seasonality read across `Step3RevenueCOGS.tsx` (6 sites) and `useForecastWizard.ts` (5 sites) now funnels through `getEffectiveSeasonality(line, businessSeasonality)` from the 51-00 helper module. Display and rollup share one source of truth — the Phase 50 Bug 4 lockstep failure mode is structurally precluded.

This is the **final plan in Phase 51**. The phase is COMPLETE.

## What shipped

| Capability | Where | Locked by test |
|---|---|---|
| `seasonalityPattern?: number[]` on RevenueLine + COGSLine (additive, optional) | `types.ts` | Test 5 |
| `getEffectiveSeasonality` consumed at 11 sites (6 in Step3 + 5 in useForecastWizard) | `Step3RevenueCOGS.tsx`, `useForecastWizard.ts` | Test 10 + 10b |
| `SeasonalityEditorModal` (12-month editor, sum-to-100 validation, save/reset/cancel) | `Step3RevenueCOGS.tsx` | Test 4 |
| Per-row "edit seasonality" button on revenue rows + FIXED COGS rows (4 row sites) | `Step3RevenueCOGS.tsx` | Tests 1, 2 |
| Variable-COGS row HIDES button (operator decision) | `Step3RevenueCOGS.tsx` | Test 3 |
| Override propagates display → rollup (LOCKSTEP) | `useForecastWizard.ts:summary` | Tests 6, 7 |
| Annual total preserved when override is set | rollup math | Test 8 |
| Reset clears override (back to business inheritance) | `Step3RevenueCOGS.tsx` modal | Test 9 |

## TDD execution

| Step | Outcome |
|------|---------|
| RED (Task 1) | 11 tests in `phase-51-step3-seasonality.test.tsx`. 8 fail (Tests 1, 2, 4, 5, 6, 7, 8, 9 — drive Tasks 2+5). 3 pass (Test 3 by accident — no button anywhere; Tests 10 + 10b lock current behavior bit-identically). RED log saved to `/tmp/51-03-task1-red.log`. |
| GREEN (Task 2) | Step3 6-site migration + types.ts field add (folded due to TS strict typing). Test 10 + 10b STILL PASS — bit-identical math confirmed. RED profile unchanged: 8 fail, 3 pass. |
| GREEN (Task 3) | useForecastWizard 5-site migration. Test 10 + 10b STILL PASS. RED profile unchanged. |
| GREEN (Task 5) | UI added (modal + 4 row buttons + variable-COGS gate) + auto-fix Rule 1 (`|| 8.33` → `?? 8.33` per-element fallback, 18 sites). All 11 UX-S3-03 tests GREEN. Phase 50 baseline 13/13. Full forecast suite 85/85. |

## Commits (4, atomic)

| Order | Hash | Type | Subject |
|-------|------|------|---------|
| 1 | `0f8115a` | `test(51-03)` | add failing tests for Step 3 per-line seasonality override + lockstep + back-compat |
| 2 | `bbe177d` | `refactor(51-03)` | migrate Step3RevenueCOGS seasonality reads to getEffectiveSeasonality (math-neutral) |
| 3 | `0768941` | `refactor(51-03)` | migrate useForecastWizard rollup seasonality reads to getEffectiveSeasonality (math-neutral) |
| 4 | `04fa056` | `feat(51-03)` | add per-line seasonality override modal + button (variable COGS hidden) (UX-S3-03) |

(Task 4's separate commit was folded into commit 2; see Decisions.)

## Migration site enumeration (final, post-Task 3)

### Step3RevenueCOGS.tsx — 6 sites migrated

| Pre-line | Function | Pre-pattern | Post-pattern | Site type |
|---|---|---|---|---|
| 329 | `handleLinePctChange` Y1 | `priorYear?.seasonalityPattern \|\| Array(12).fill(8.33)` | `getEffectiveSeasonality(line, priorYear?.seasonalityPattern)` | per-line |
| 356 | `handleLinePctChange` Y2/Y3 | same | `getEffectiveSeasonality(line ?? {}, priorYear?.seasonalityPattern)` (added line lookup) | per-line |
| 401 | `handlePatternChange` | same (was outside loop) | `getEffectiveSeasonality(line, priorYear?.seasonalityPattern)` (moved inside `revenueLines.forEach`) | per-line |
| 547 | `handleGrowthChange` | same | `getEffectiveSeasonality(line, priorYear?.seasonalityPattern)` | per-line |
| 670 | `handleMixChange` | same (was Y1-only line lookup) | `getEffectiveSeasonality(lineLookup ?? {}, priorYear?.seasonalityPattern)` (unified lookup) | per-line |
| 815 | `handleCogsMixChange` | same (was COGS) | `getEffectiveSeasonality(cogsLineLookup ?? {}, priorYear?.seasonalityPattern)` | per-line (COGS) |

### useForecastWizard.ts — 5 sites migrated

| Pre-line | Function | Pre-pattern | Post-pattern | Site type |
|---|---|---|---|---|
| 305 | `setPriorYear` (default Sales Revenue line creation) | `data.seasonalityPattern \|\| Array(12).fill(8.33)` | `getEffectiveSeasonality({}, data.seasonalityPattern)` | aggregate |
| 367 | `setPriorYear` (Y2/Y3 distribution across lines) | same | `getEffectiveSeasonality(line, data.seasonalityPattern)` (moved inside `revenueLines.forEach`) | per-line |
| 902 | `initializeFromXero` (default Sales Revenue line creation) | `data.priorYear.seasonalityPattern \|\| Array(12).fill(8.33)` | `getEffectiveSeasonality({}, data.priorYear.seasonalityPattern)` | aggregate |
| 946 | `initializeFromXero` (Y2/Y3 distribution across lines) | `data.priorYear?.seasonalityPattern \|\| Array(12).fill(8.33)` | `getEffectiveSeasonality(line, data.priorYear?.seasonalityPattern)` (moved inside `revenueLines.forEach`) | per-line |
| 1422 | `buildAssumptions` (top-level seasonality export to AssumptionsBuilder) | `state.priorYear?.seasonalityPattern \|\| Array(12).fill(8.33)` | `getEffectiveSeasonality({}, state.priorYear?.seasonalityPattern)` | aggregate |

### Final grep verification

```
$ grep -nE "(priorYear\?\.|priorYear\.|data\.|state\.priorYear\?\.)seasonalityPattern\s*\|\|\s*Array\(12\)" \
    src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx \
    src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts
EXIT: 1   (no matches)

$ grep -c "getEffectiveSeasonality" Step3RevenueCOGS.tsx     → 7  (1 import + 6 calls + 1 in modal pre-populate read)
$ grep -c "getEffectiveSeasonality" useForecastWizard.ts     → 6  (1 import + 5 calls)
```

11 inline reads → 11 helper calls. **0 inline reads remain.**

## Test counts

| Suite | Count | Status |
|-------|-------|--------|
| `phase-51-step3-seasonality.test.tsx` (NEW) | 11 | 11/11 GREEN |
| `phase-51-helpers.test.ts` (51-00 baseline) | 10 | 10/10 (no regression) |
| `phase-51-step3-dollar-percent.test.tsx` (51-01) | 5 | 5/5 |
| `phase-51-step3-growth.test.tsx` (51-02) | 6 | 6/6 |
| `wizard-v4-bug-fixes.test.tsx` (Phase 50 baseline) | 13 | 13/13 |
| `phase-51-step4-*.test.tsx` (51-04 series) | 21 | 21/21 |
| `phase-51-step5-labels.test.tsx` (51-05) | 6 | 6/6 |
| `phase-51-step6-*.test.tsx` (51-06) | 13 | 13/13 |
| `src/__tests__/forecast/` (full forecast suite) | 85 | 85/85 |

## Verification gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | clean (exit 0) |
| `npx vitest run src/__tests__/forecast/phase-51-step3-seasonality.test.tsx` | 11/11 |
| `npx vitest run src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx` | 13/13 (Phase 50 lockstep regression preserved) |
| `npx vitest run src/__tests__/forecast/` | 85/85 |
| `npx eslint <modified files>` | clean (1 pre-existing warning unrelated to Phase 51-03) |
| Final grep: `priorYear?.seasonalityPattern \|\| Array(12)` across both files | 0 hits |
| Final grep: `getEffectiveSeasonality` across both files | 13 hits (2 imports + 11 call sites) |
| `WIZARD_VERSION` | unchanged (still 10) |
| `npm run build` | env-config failure (Supabase URL not in worktree); Vercel CI will resolve |

## Test 10 / 10b backward-compat regression baselines

Captured 2026-05-04 from origin/main commit `aba03f8`.

**Test 10 — `setPriorYear` default Sales Revenue line distribution** (priorYear.revenue.total=100k, business seasonality `[25,15,10,8,7,6,6,6,5,4,4,4]`):

```
{
  '2025-07': 25000, '2025-08': 15000, '2025-09': 10000, '2025-10': 8000,
  '2025-11': 7000,  '2025-12': 6000,  '2026-01': 6000,  '2026-02': 6000,
  '2026-03': 5000,  '2026-04': 4000,  '2026-05': 4000,  '2026-06': 4000
}
// total = 100,000 (== priorYear.revenue.total)
// summary.year1.revenue = 100,000
```

**Test 10b — `handleMixChange` 100% on Hardware** (goals.year1.revenue=120k, business seasonality `[25,15,10,8,7,6,6,6,5,4,4,4]`):

```
{
  '2025-07': 30000, '2025-08': 18000, '2025-09': 12000, '2025-10': 9600,
  '2025-11': 8400,  '2025-12': 7200,  '2026-01': 7200,  '2026-02': 7200,
  '2026-03': 6000,  '2026-04': 4800,  '2026-05': 4800,  '2026-06': 4800
}
// total = 120,000 (== goals.year1.revenue × 100% mix)
```

Both fixtures STILL PRODUCE THESE EXACT NUMBERS after Tasks 2 + 3 + 5 — bit-identical math confirmed.

## Deviations from Plan

### Rule 3 — Fixed blocking TypeScript issue (Task 2)

Plan said Task 4 adds the `seasonalityPattern?: number[]` field to RevenueLine + COGSLine AFTER Tasks 2+3 migrate readers. TypeScript strict structural typing rejected the migration commit because `getEffectiveSeasonality({ seasonalityPattern?: number[] }, ...)` has zero overlap with `RevenueLine` (no shared properties) until the field exists. Folded Task 4 into Task 2's commit. Plan's runtime ordering preserved: no consumer reads the field until Task 5; bit-identical math after Tasks 2+3 (every line has `seasonalityPattern === undefined` → falls through to business). Task 4 became a no-op verification step.

**Files modified:** `types.ts` (commit `bbe177d`).

### Rule 1 — Auto-fixed pre-existing per-element fallback bug (Task 5)

Pre-existing bug surfaced by Test 6/7. The pattern `seasonality[idx] || 8.33` at 18 sites across both files treated EXPLICIT 0% values in an override array as "missing data" (JS truthy check: `0 || 8.33 → 8.33`). With override `[50,30,10,5,1,1,1,1,1,0,0,0]` (sums to 100), the Apr/May/Jun zeros each became 8.33, inflating the denominator from 100 → 124.99 and pushing the Jul allocation from $60k (correct, 50%) → $48k (wrong, ~40%).

**Fix:** changed `seasonality[idx] || 8.33` to `seasonality[idx] ?? 8.33` (nullish coalescing) at all 18 sites via `replace_all`. Explicit 0% now stays 0%; only undefined/null falls back to 8.33.

**Bit-identical for back-compat:** No production tenant or test fixture has zero entries in the business `priorYear.seasonalityPattern` (Xero distributes revenue across all 12 months by definition). Test 10 + 10b regression locks (using `[25,15,10,8,7,6,6,6,5,4,4,4]`) STILL PASS bit-identically.

**Files modified:** `Step3RevenueCOGS.tsx`, `useForecastWizard.ts` (commit `04fa056`).

### Authentication gates

None.

## Notes for downstream plans

- **Phase 51 is now COMPLETE.** Plans 51-00, 51-01, 51-02, 51-03 (this), 51-04a, 51-04b, 51-05, 51-06 all shipped.
- **51-02's `handleGrowthChange`** could optionally route through `getRevenueLineMonthlyDistribution` (51-00 helper) to share the actuals-locking + seasonality math with `handleMixChange`. Out of scope for 51-03; flag for future cleanup if duplication ever causes a bug.
- **OpEx ($/% toggle, 51-05)** does NOT need seasonality migration — OpEx has its own `seasonal` cost behavior with a distinct seasonal-pattern flow on `OpExLine.seasonalGrowthPct` / `seasonalTargetAmount`. Independent of revenue/COGS seasonality.
- **AssumptionsBuilder export** (`useForecastWizard.ts:1422`) currently only exports business-level `seasonalityPattern`. If a future cashflow plan needs per-line override transparency on the export, the line-level field is already on `state.revenueLines[*].seasonalityPattern` (added in Task 2). No additional wiring required at the AssumptionsBuilder boundary today.
- **Documentation:** the `?? 8.33` fix is more correct semantically AND defensively — operators authoring custom seasonality patterns can now use 0% for a "this line doesn't sell in this month" signal without the math silently substituting 8.33%. This unlocks intentional zeroing patterns (e.g., a holiday-period revenue line that's $0 from Dec to Feb).

## Sentinel manual test

Did not run on the JDS deployed forecast (worktree environment doesn't have Vercel preview env vars). Recommend operator validate post-merge:

1. Open JDS forecast → Step 3 → click "edit seasonality" on a revenue line A
2. Set Q1 to 50% (Jul=20%, Aug=20%, Sep=10%, rest=≤4% summing to 100)
3. Save → Step 3 monthly distribution shifts immediately (Q1 heavier than business default)
4. Navigate to Step 9 (Review) → annual total UNCHANGED
5. Step 9 monthly preview should reflect the same Q1 heaviness (LOCKSTEP)
6. Click "edit seasonality (custom)" again → verify saved values pre-populate
7. Click "Reset to business seasonality" → save → confirm distribution returns to business default

## Self-Check: PASSED

```
[x] src/__tests__/forecast/phase-51-step3-seasonality.test.tsx — exists (560 lines)
[x] src/app/finances/forecast/components/wizard-v4/types.ts — modified (RevenueLine + COGSLine optional field)
[x] src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx — modified (6 site migration + modal + 4 row buttons + variable-COGS gate)
[x] src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts — modified (5 site migration + per-element fallback fix)
[x] commit 0f8115a — found in git log (RED test)
[x] commit bbe177d — found in git log (Task 2 refactor)
[x] commit 0768941 — found in git log (Task 3 refactor)
[x] commit 04fa056 — found in git log (Task 5 GREEN)
[x] grep `priorYear?.seasonalityPattern || Array(12)` across both files: 0 hits
[x] grep `getEffectiveSeasonality` across both files: 13 hits (2 imports + 11 call sites)
[x] WIZARD_VERSION still 10
[x] All 11 UX-S3-03 tests GREEN; full forecast suite 85/85
[x] Test 10 + 10b backward-compat regression locks PASS (bit-identical math)
[x] tsc --noEmit clean
[x] eslint clean on modified files (1 pre-existing warning unrelated to Phase 51-03)
[x] Phase 50 baseline 13/13; all prior 51-XX plans GREEN
```
