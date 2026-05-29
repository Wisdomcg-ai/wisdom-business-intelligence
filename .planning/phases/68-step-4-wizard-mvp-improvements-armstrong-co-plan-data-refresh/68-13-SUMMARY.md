---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 13
status: complete
completed: 2026-05-29
---

# Plan 68-13 — B6: filterable Available pool by category chips — SUMMARY

## What was built

[src/app/goals/components/Step4AnnualPlan.tsx](src/app/goals/components/Step4AnnualPlan.tsx):

1. **State**: `selectedCategory` (`'all'` default).
2. **Derivation**: `filteredUnassignedInitiatives` — filtered subset of `unassignedInitiatives` when a category chip is selected.
3. **`categoryChips`** useMemo — computes the chip data (key, palette colours, count) from all `twelveMonthInitiatives` (NOT just unassigned — chips reflect the full taxonomy so they stay visible even after every item in a category is dragged to a quarter).
4. **Chip row** rendered above the Available pool grid: `All` button + one button per category. Selected chip uses the category's palette colours; unselected use neutral white/grey.
5. **Filtered grid + empty state**: Available pool now maps `filteredUnassignedInitiatives`. Empty state shows "All initiatives assigned ✓" when chip = All, "No initiatives in this category — try All" otherwise.

### What stays unfiltered

- The **`+ Add` dropdown** on quarter cards (still uses unfiltered `unassignedInitiatives`)
- The **drop handler** for drag-from-pool → quarter (still resolves via the unfiltered list)
- The **assignedTitles** dedupe (uses the unfiltered list)

So the chip filter only affects what the operator sees in the pool — assignment mechanics are unchanged.

## Acceptance criteria

### Static (all pass)
- ✓ File contains `const [selectedCategory, setSelectedCategory] = useState<string>('all')`
- ✓ File contains `categoryChips` useMemo
- ✓ File contains `filteredUnassignedInitiatives`
- ✓ File contains ARIA label `'Filter Available initiatives by category'`
- ✓ Empty-state branch handles both `selectedCategory === 'all'` and the filtered-empty case (`'No initiatives in this category'`)
- ✓ Quarter card `+ Add` dropdown still uses `unassignedInitiatives` (unfiltered) — assignment mechanics unchanged
- ✓ `npx tsc --noEmit` exits 0
- ✓ `npx eslint src/app/goals/components/Step4AnnualPlan.tsx` exits 0 (2 pre-existing warnings)

## Deviations from PLAN

Added an explicit eslint-disable comment on the `categoryChips` useMemo for `react-hooks/exhaustive-deps` — `getCategoryStyle` is component-local with stable references in palette objects, listing it in deps would cause spurious recomputations.

## Files

| Path | Change |
|---|---|
| `src/app/goals/components/Step4AnnualPlan.tsx` | +60 lines (state + derivations + chip row + filtered grid) |

## Next plan

**Plan 68-14** — B7: per-quarter notes textarea persisted to `quarterlyTargets[q].notes`.

## Self-Check

PASSED. Chip filter ships; assignment paths unchanged; tsc + lint clean.
