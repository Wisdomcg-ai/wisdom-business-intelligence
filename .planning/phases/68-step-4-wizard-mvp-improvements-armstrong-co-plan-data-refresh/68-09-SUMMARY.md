---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 09
status: complete
completed: 2026-05-29
---

# Plan 68-09 — B2 (Owner Hours always shown) + B3 (Stagger button) — SUMMARY

## What was built

Two small, isolated edits to [src/app/goals/components/Step4AnnualPlan.tsx](src/app/goals/components/Step4AnnualPlan.tsx).

### B2 — Owner Hours always visible

**Before:** `visibleRows = CORE_ROWS.filter(r => (r.year1 ?? 0) > 0)` at line 953 silently dropped the Owner Hours row when `year1 = 0`. Coach had no signal it was missing.

**After:** Row always rendered. When `year1 ?? 0 <= 0` AND `key === 'ownerHoursPerWeek'`, the Annual cell renders a `"Set in Step 1 →"` button that scrolls to `[data-step="1"]`.

### B3 — Stagger by Priority button

**Before:** `handleStaggerByPriority` defined at line 412, no UI called it (dead code).

**After:** Button in the Quarterly Execution Plan header (next to the collapse chevron), visible only when the panel is expanded and there are initiatives to distribute. Calls `handleStaggerByPriority()` to spread initiatives across Q1-Q4 by priority (HIGH first).

## Acceptance criteria

### Static (all pass)
- ✓ File contains `'Set in Step 1 →'`
- ✓ File contains `r.key === 'ownerHoursPerWeek'` in the filter line
- ✓ File contains `m.key === 'ownerHoursPerWeek' && (m.year1 ?? 0) <= 0` in the render conditional
- ✓ File contains `onClick={(e) => { e.stopPropagation(); handleStaggerByPriority() }}` (button wired to existing function)
- ✓ File contains `Stagger by priority` button label
- ✓ `CORE_ROWS`, `formatCurrency`, `visibleRows` constants still present and unmodified
- ✓ `MAX_PER_QUARTER` not modified
- ✓ `npx tsc --noEmit` exits 0
- ✓ `npx eslint src/app/goals/components/Step4AnnualPlan.tsx` exits 0 (2 pre-existing warnings on unrelated lines remain)

## Deviations from PLAN

None. Direct execution of the PLAN's specified edits.

## Files

| Path | Change |
|---|---|
| `src/app/goals/components/Step4AnnualPlan.tsx` | +18 lines, -3 lines (net +15) across 3 edit sites |

## Next plan

**Plan 68-10** — B15 (`current_remainder` boundary for extended-period plans) + B16 (`autoSplitEvenly` includes remainder when extended). Couple-bound; touch related logic in `quarters.ts` and `Step4AnnualPlan.tsx`.

## Self-Check

PASSED. Both B2 and B3 ship in one commit on the Step 4 surface. tsc + lint clean. No behaviour change for clients with year1 hours already set; new affordance for clients without.
