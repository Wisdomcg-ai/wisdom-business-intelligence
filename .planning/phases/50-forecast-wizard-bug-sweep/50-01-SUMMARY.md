---
phase: 50-forecast-wizard-bug-sweep
plan: 01
status: complete
date: 2026-05-04
---

# 50-01 — Forecast Wizard Bug Sweep (Bugs 1 + 2 + 3) — Summary

## What shipped

Three forecast wizard bugs fixed across `wizard-v4`. Bug 1 was an input round-trip; Bug 2 was a display fix (the underlying rollup was already correct); Bug 3 was a missing input element on a previously read-only cell.

| Task | Commit | What |
|------|--------|------|
| 1 — Failing tests (TDD red) | `5ba6c93` | 7 vitest cases covering all 3 bugs in `src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx` |
| 2 — Bug 1 fix | `cc6ec5e` | Step 3 input — replace `value.toLocaleString()` round-trip with `type="number" value={cellValue \|\| ''}` at 3 sites in `Step3RevenueCOGS.tsx` (lines 805, 1059, 1192) |
| 3 — Bug 2 fix (display only — rollup verified correct) | `61c40d6` | BudgetFramework display now includes team-classified OpEx lines in the Team Costs row |
| 4 — Bug 3 fix | `a263c38` | Step 6 CapEx — replace read-only `formatCurrency(item.amount)` with editable `type="number"` input at `Step6CapEx.tsx:218` + rewrite Bug 3 tests to use a real-hook harness |

Plus memory file update at `~/.claude/.../memory/project_opex_double_count.md` — marked RESOLVED with the discovery that the rollup was already correct (the visible bug was a display-layer issue).

## The plan-checker's STALE-MEMORY finding (validated)

Before any code change for Bug 2, Task 3 Step 0 scope-check confirmed the plan-checker's prediction: **`useForecastWizard.ts:1154` already filters team-classified OpEx lines correctly**. The `isTeamCost()` classifier was already imported and applied in the rollup. So Bug 2's fix collapses to just the BudgetFramework display layer, not a deep root-cause sweep. The 29-day-old `project_opex_double_count` memory item underlying the fear was stale; updated with the correct picture.

## Acceptance criteria (from PHASE.md)

| # | Criterion | Status | How verified |
|---|---|---|---|
| 1 | Step 3 input integrity (typing → displayed value matches) | ✅ | Tests 1.1 + 1.2 in `wizard-v4-bug-fixes.test.tsx` pass with real-hook harness |
| 2 | Step 5 OpEx total reactivity + correctness | ✅ | Tests 2.1, 2.2, 2.3 pass — display now matches engine; engine was already correct |
| 3 | Step 7 from-plan input editable | ✅ | Tests 3.1 + 3.2 pass — read-only cell replaced with editable `<input type="number">`; harness pattern verifies state actually updates per keystroke |
| 4 | Step 7 lease/finance accounting | ⏭️ | NOT IN 50-01 scope — that's 50-02 (Bug 4) |
| 5 | CI green | ✅ | Local: typecheck clean, lint clean, vitest 674 passed (1 pre-existing date-test failure unrelated; same as 44.3 + 49). CI will re-validate. |

## Bug 1 detail — Step 3 input round-trip

**Before:** `<input type="text" value={cellValue ? cellValue.toLocaleString() : ''}>` — formats with commas, then `onChange` parses `parseFloat(value.replace(/[^0-9.]/g, ''))`. The format/parse round-trip drops or duplicates digits depending on cursor position. Classic controlled-text-input bug.

**After:** `<input type="number" inputMode="decimal" value={cellValue || ''}>` + `onKeyDown` to block accidental arrow-key spinners. Browser handles the numeric input natively; no comma-format round-trip. 3 sites: revenue cell (805), revenue Monthly Detail (1059), COGS Monthly (1192).

## Bug 2 detail — Step 5 OpEx display

**Before:** BudgetFramework's "Team Costs" row showed only the explicit team total (Step 4 employees), missing OpEx lines auto-classified as team costs (e.g. "Wages and Salaries" auto-imported from Xero P&L). User saw "Available OpEx = $X" where X was missing the team-classified portion.

**After:** BudgetFramework now sums team-classified OpEx lines into the displayed Team Costs total, so the user sees a complete picture matching what the engine computes downstream. **The engine was always correct** — `useForecastWizard.ts:1154` rollup already filters team lines via `isTeamCost(line.name)`. This is purely a display fix.

## Bug 3 detail — Step 6 CapEx amount input

**Before:** `<td className="px-4 py-3 text-right text-sm text-gray-900">{formatCurrency(item.amount)}</td>` — pure text, no input element. Affected ALL CapEx rows (not just from-plan items as the bug report suggested — manually-added rows were also non-editable after creation).

**After:** Editable `<input type="number">` matching the existing financeRate/leaseMonthlyPayment input patterns in the file. Wires through `actions.updatePlannedSpend({ amount: parseFloat(...) })`.

## Test infrastructure note

Bug 3 tests originally used `vi.fn()` stubs for `actions.updatePlannedSpend`. With stubbed actions, state never updates between keystrokes and the controlled input keeps re-rendering with the original value — every keystroke types into a stale empty cell. Rewrote to use a `Step6Harness` component wrapping `useForecastWizard` (same pattern Bug 1's `Step3Harness` uses). The harness pattern is the load-bearing piece; future controlled-input tests in this file should follow it.

## Deviations from plan

- **Task 3 (Bug 2) scope-check escape hatch fired** as plan-checker predicted. Engine fix not needed; collapsed to display-layer fix only. Plan's Task 3.0 escape mechanism worked exactly as designed.
- **Bug 3 tests rewritten** to use real-hook harness (originally written with `vi.fn()` stubs). The component fix was correct; the tests had a structural assumption that didn't match React controlled-input semantics.
- **Memory file updated** per plan Task 5 — marked RESOLVED with corrected understanding instead of "fixed in this PR".

## Files changed

```
src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx                            (new + revised)
src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx      (Bug 1: 3 inputs)
src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx + BudgetFramework  (Bug 2: display fix)
src/app/finances/forecast/components/wizard-v4/steps/Step6CapEx.tsx            (Bug 3: editable input)
~/.claude/.../memory/project_opex_double_count.md                              (status: RESOLVED)
.planning/phases/50-forecast-wizard-bug-sweep/50-01-SUMMARY.md                 (this file)
```

## Risk for the verifier to scrutinize hardest

The Bug 1 input swap from `type="text"` + comma formatting to `type="number"` removes the visible thousands separators in revenue/COGS cells. Coaches looking at $1,000,000 will now see `1000000`. The math is still correct, but the operator-facing UX lost the comma formatting. If thousands separators are important, the follow-up is to display formatted values when the input is unfocused (using CSS or a focus-aware input wrapper). Tracked as out-of-scope for 50-01 (bug fix, not UX); flag for Phase 51.

## Pre-existing test failure (not introduced)

`src/__tests__/goals/plan-period-banner.test.tsx` — "renders three date inputs" expects `'2026-04-01'` but receives `'2026-03-31'`. Verified failing on `main` for several phases now (44.3, 46-01, 46-03, 49-01). Date-sensitive test; out of scope.
