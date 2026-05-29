---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 10
status: complete
completed: 2026-05-29
---

# Plan 68-10 — B15 + B16: extended-period bugfix pair — SUMMARY

## What was built

### B15 — `deriveCurrentRemainderColumn` boundary trim

[src/app/goals/utils/quarters.ts](src/app/goals/utils/quarters.ts) — extended `deriveCurrentRemainderColumn` signature with two new optional params (default values preserve back-compat for all existing callers):

```diff
- export function deriveCurrentRemainderColumn(today, planYear, fiscalYearStart, thresholdMonths=3)
+ export function deriveCurrentRemainderColumn(today, planYear, fiscalYearStart, thresholdMonths=3, isExtendedPeriod=false, planStartDate: Date|null = null)
```

When `isExtendedPeriod=true` AND `planStartDate < fyEnd`, the returned column's `endDate` is trimmed to one day before planned Y1 starts. Also changed `endMonth = fyEndMonth` to `endMonth = fyEnd.getMonth() + 1` so the label reflects the trim.

**Impact for Armstrong:** their plan_start_date is `2026-06-01`, FY26 end is `2026-06-30`. Previously the "Now" column spanned May–Jun 2026, with June overlapping the planned Y1. After B15, the "Now" column ends 2026-05-31 — clean separation.

### B16 — `autoSplitEvenly` 5-period distribution when extended

[src/app/goals/components/Step4AnnualPlan.tsx](src/app/goals/components/Step4AnnualPlan.tsx):

- **Step4Props** — un-deprecated `isExtendedPeriod`; added `planStartDate?: Date | string | null`.
- **Destructure** — renamed `_isExtendedPeriod` to `isExtendedPeriod` (active use); accept new `planStartDate: planStartDateProp`.
- **`planStartDate` normalizer** — useMemo that accepts both Date and ISO string (Supabase returns date columns as ISO).
- **`currentRemainderInfo`** — now calls `deriveCurrentRemainderColumn(today, planYear, fiscalYearStart ?? 7, 3, !!isExtendedPeriod, planStartDate)` with the new params. Dependency array updated.
- **`autoSplitEvenly`** — when `isExtendedPeriod && currentRemainderInfo`, `periodCount = 5` and the remainder column gets its share; Q4 absorbs rounding so totals still match annual exactly. Non-extended path unchanged (still 4 periods).

The original explicit cast `as { q1: string; q2: string; q3: string; q4: string; current_remainder?: string }` is preserved on the final assignment to `newTargets[metricKey]` — required because `quarterlyTargets`'s index signature is strict, and removing the cast would fail tsc.

### Parent wiring

[src/app/goals/page.tsx](src/app/goals/page.tsx) — added `planStartDate={planStartDate}` prop pass-through to the `<Step4AnnualPlan>` render site. Without this, B15 would stay dormant (component would receive `undefined` for `planStartDate`).

## Acceptance criteria

### Static (all pass)
- ✓ `quarters.ts` contains `isExtendedPeriod: boolean = false`, `planStartDate: Date | null = null`
- ✓ `quarters.ts` contains `planStartDate instanceof Date && planStartDate < fyEnd`
- ✓ `quarters.ts` contains `planStartDate.getTime() - 24 * 60 * 60 * 1000`
- ✓ `quarters.ts` has `let fyEnd` (reassignable for the override)
- ✓ `Step4AnnualPlan.tsx` contains `isExtendedPeriod && currentRemainderInfo`
- ✓ `Step4AnnualPlan.tsx` contains `includeRemainder ? 5 : 4`
- ✓ `Step4AnnualPlan.tsx` contains the deriveCurrentRemainderColumn call with all 6 args
- ✓ `Step4AnnualPlan.tsx` contains `planStartDate?: Date | string | null` in Step4Props
- ✓ `Step4AnnualPlan.tsx` contains `planStartDate: planStartDateProp` in the destructure
- ✓ `Step4AnnualPlan.tsx` contains the literal cast `as { q1: string; q2: string; q3: string; q4: string; current_remainder?: string }` inside autoSplitEvenly
- ✓ `npx tsc --noEmit` exits 0
- ✓ `npx eslint` on both files exits 0 (2 pre-existing warnings on unrelated lines remain)
- ✓ Existing 3-arg callers (none in the codebase per grep) would still compile due to default params

### Live verification deferred
- Browser walkthrough on Armstrong's wizard once Wave 8 ships — confirm "Now" column shows May 2026 only (not May-Jun) and Auto-split distributes proportionally to 5 periods.

## Deviations from PLAN

None. Direct execution of the PLAN's specified edits, including preserving the TS cast on the autoSplitEvenly write (which the prior verification iteration explicitly required).

## Files

| Path | Change |
|---|---|
| `src/app/goals/utils/quarters.ts` | +15 lines, -2 lines |
| `src/app/goals/components/Step4AnnualPlan.tsx` | +37 lines, -9 lines (props + destructure + memo + autoSplitEvenly) |
| `src/app/goals/page.tsx` | +1 line (planStartDate prop pass-through) |

## Next plan

**Plan 68-11** — B4: category + priority badges on initiative cards in the kanban and Available pool.

## Self-Check

PASSED. B15 + B16 ship in one commit as the couple-bound bug-fix pair. Parent wiring added so the fix activates for Armstrong (and any other extended-period client). Methodology + cast preservation honored. tsc + lint clean.
