---
phase: 68-step-4-wizard-mvp-improvements-armstrong-co-plan-data-refresh
plan: 12
status: complete
completed: 2026-05-29
---

# Plan 68-12 — B5: per-quarter engine balance bar — SUMMARY

## What was built

[src/app/goals/components/Step4AnnualPlan.tsx](src/app/goals/components/Step4AnnualPlan.tsx) — added `computeCategoryBreakdown()` helper and rendered a 6px stacked bar (`h-1.5`) under each quarter card's header showing the category mix of assigned initiatives.

### Behaviour

- Empty quarter → bar is a gray-100 placeholder strip (still rendered for visual stability).
- 3 marketing + 1 finance + 1 people → 3 segments: pink 60% / emerald 20% / violet 20%.
- Order: known palette keys first (in the documented sequence), then unknowns alphabetical — keeps bars stable as the operator drags items between quarters.
- Hover tooltip + ARIA label: `Engine balance: MKTG: 3 · FIN: 1 · PPL: 1`.

### Palette reuse

Uses the same `CATEGORY_PALETTE` and `getCategoryStyle()` helper added in Plan 68-11 — no new colour definitions. Means the bar segments visually match the badges on the cards.

## Deviations from PLAN

Extended the `knownOrder` array to include the full palette (15 entries) so newer enum values added in 68-11 (`growth`, `operations`, `product`, `sales`, `other`, `customer_experience` underscore form) sort into the stable known section instead of falling into the alphabetical tail.

## Acceptance criteria

### Static (all pass)
- ✓ File contains `computeCategoryBreakdown` definition + at least 1 call site
- ✓ File contains literal `engine-balance-bar h-1.5 w-full flex rounded-sm overflow-hidden mb-2 bg-gray-100`
- ✓ File contains `title={titleText}` inside the bar render block
- ✓ File contains `Engine balance:` (ARIA label prefix)
- ✓ `npx tsc --noEmit` exits 0
- ✓ `npx eslint src/app/goals/components/Step4AnnualPlan.tsx` exits 0 (2 pre-existing warnings unrelated)
- ✓ Available pool unchanged (no balance bar added there per PLAN)

## Files

| Path | Change |
|---|---|
| `src/app/goals/components/Step4AnnualPlan.tsx` | +52 lines (helper + bar render block) |

## Next plan

**Plan 68-13** — B6: filterable Available pool by category chips above the unassigned-initiatives grid.

## Self-Check

PASSED. Bar renders per quarter; stable colour order via palette-key sequencing; reuses 68-11's CATEGORY_PALETTE so badges + bar match. tsc + lint clean.
