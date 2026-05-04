# Phase 50 — Plan Check

**Verdict:** PASS WITH NOTES
**Plans verified:** `50-01-PLAN.md`, `50-02-PLAN.md`
**Branch:** `feat/50-research-and-plan`
**Checked:** 2026-05-02
**Checker:** gsd-plan-checker

Both plans WILL achieve the phase goal. No blocking defects in dependency, scope, or coverage. Several `WARNING`-class refinements documented below — most importantly: the `project_opex_double_count` memory item underlying Bug 2's "root-cause" framing is **stale** (the rollup already filters team-classified lines as of today's HEAD). 50-01 Task 3 will discover this in its scope-check Step 0 — the escape hatch handles the case correctly, but the executor should be primed to expect "no rollup change needed" rather than "30+ LOC rollup edit".

---

## PHASE.md Success Criteria — Coverage Map

| SC# | PHASE.md Criterion | Plan | Task | Test ID | Verdict |
|-----|--------------------|------|------|---------|---------|
| SC1 | Step 3 input integrity (typed digits preserved) | 50-01 | T1 (red), T2 (green) | Test 1.1, 1.2 | COVERED |
| SC2 | Step 5 OpEx total reactive + correct (sum-of-lines, live update) | 50-01 | T1, T3 | Test 2.1, 2.2, 2.3 | COVERED |
| SC3 | Step 7 from-plan input editable | 50-01 | T1, T4 | Test 3.1, 3.2 | COVERED |
| SC4 | Step 7 lease/finance accounting ($100k/60mo/6% finance lease ≠ $20k/yr; show breakdown) | 50-02 | T1 (red), T3 (Site 1), T4 (Site 2 lockstep) | Test 4.1–4.6 | COVERED — exact $23,199 lockstep enforced; backward-compat lock at Test 4.5 |
| SC5 | CI green (lint + typecheck + vitest + build) | 50-01 + 50-02 | each task's `<verify>` runs `npx tsc --noEmit` + `npx vitest`; final verification block runs `npm run lint` | All | COVERED — by construction |

All 5 success criteria mapped. SC4's specific numerical assertion ($100k/60mo/6% → ~$23,199, NOT $24,000) is locked in 50-02 Test 4.3 with `toBeCloseTo(23199, -1)`.

---

## Plan 50-01 — Bugs 1, 2, 3

**Verdict:** PASS WITH NOTES
**Tasks:** 5 (T1 RED, T2/T3/T4 fixes, T5 memory)
**Files modified:** 4 production + 1 new test file + 1 memory file
**Wave:** 1 (depends_on: 44-05)

### Strengths
- TDD red-green flow is explicit per task; failure logs piped to `/tmp/50-01-task1-red.log` for downstream verification.
- Task 3.0 scope-check escape hatch is concrete: ≤30 LOC + single rollup region → STAY; otherwise → SPLIT to 50-1.5. Decision criteria stated.
- Bug 1 fix is mechanical (3 sites, identical edit) — RESEARCH.md Option A directly liftable.
- Bug 3 fix is one-`<td>` swap; reducer cascade at `useForecastWizard.ts:696-712` already handles amount → derived fields.
- `must_haves` truths are user-observable (not implementation-focused).

### NOTES (non-blocking)

#### Note 1 — Bug 2 root-cause assumption is stale
The plan's Decision B (root-cause fix) and the underlying `project_opex_double_count` memory both presume the OpEx rollup at `useForecastWizard.ts:1140-1190` does NOT filter team-classified lines. **Static read of HEAD shows it ALREADY DOES** at line 1154:
```ts
if (line.isTeamCostOverride !== undefined ? line.isTeamCostOverride : isTeamCost(line.name)) return sum;
```
Plus `import { isTeamCost } from './utils/opex-classifier';` at line 36.

Implication: Task 3's scope-check Step 0 will most likely find the rollup is already correct. In that case Task 3 collapses to:
- **Step5OpEx.tsx display fix** (still needed — `BudgetFramework` still under-reports Team Costs by missing `excludedTeamLines`)
- **NO useForecastWizard.ts rollup change required**
- Test 2.3 changes from "rollup counts each line exactly once" RED → automatically GREEN against current HEAD (the assertion already passes)

The memory item should be closed as "Resolved on a prior unrecorded date; Phase 50 50-01 verified the rollup behavior and additionally fixed the BudgetFramework display." The 28-day-old memory predates a rollup fix that has already shipped.

The plan's escape hatch handles this: Task 3 instructs the executor to read 1100-1250 first and decide. The executor MAY initially treat the line 1154 filter as "the missing piece is at the team rollup site" — but the team rollup (lines ~1080-1145) is summing salaries/super/bonuses/commissions, not opexLines, so there's no symmetric pickup site. **The honest answer is "the rollup math is correct today; only the BudgetFramework display is wrong."**

**Recommendation for executor:** When you reach Task 3 Step 0 and find the line 1154 filter, do NOT force a rollup edit. Update the memory file (Task 5) to reflect "Phase 50 verified rollup is correct as of $branch — only BudgetFramework display needed correction." Test 2.3 should still be written, but assert the correct end-state (each line counted exactly once) which already passes.

#### Note 2 — Test 2.3 placeholder API is unspecified
Task 1 Step 7 says "write the test against your BEST GUESS of the API ... use placeholder assertion." Then Task 3 is supposed to "pin the exact accessor." If the accessor doesn't exist on the hook today (the hook returns a `ForecastSummary` with `depreciation/investments/opex` separately, not a single "expenses" total), Test 2.3 may need to assert against the `ForecastSummary.opex + ForecastSummary.teamCosts` shape returned by the year-summary calculator (called inside the useMemo at line ~1280). Executor should read lines 1274-1289 of useForecastWizard.ts to find the canonical accessor.

#### Note 3 — `isLineTeamCost` is local to Step5OpEx
Plan says to extract `isLineTeamCost` as a "small helper exported from useForecastWizard.ts itself." This is fine, but note the helper at `Step5OpEx.tsx:630-633` is already implemented in terms of `isTeamCost(line.name)` from the same `'./utils/opex-classifier'` module that useForecastWizard already imports. Extraction is purely organizational — both consumers can call `isTeamCost` directly with the override-check inline.

#### Note 4 — Step 6/7 file-path naming
Plan correctly refers to `Step6CapEx.tsx` (the actual filename) but PHASE.md / operator messages call it "Step 7". Verified: `WIZARD_STEPS` at `types.ts:549` shows `{ step: 7, label: 'CapEx', shortLabel: '7' }`. The legacy CapEx (different model) is also Step 7 at `types.ts:415, 477`. The filename is `Step6CapEx.tsx` for historical reasons. Both plans reference the right file. **Recommendation:** SUMMARY.md from each plan should explicitly note "Step6CapEx.tsx is the file; it renders WIZARD_STEPS step 7" so future work doesn't get confused.

#### Note 5 — Task 5 memory file path
The path `~/.claude/projects/-Users-mattmalouf-Desktop-business-coaching-platform/memory/project_opex_double_count.md` is verified correct (file exists, listed in `~/.claude/.../memory/`). Task is non-blocking (no `vitest` assertion); failure does not affect code. Good.

---

## Plan 50-02 — Bug 4 (lease/finance taxonomy)

**Verdict:** PASS WITH NOTES
**Tasks:** 5 (T1 RED extending 50-01's file, T2 type extension, T3 Site 1, T4 Site 2 lockstep, T5 UI)
**Files modified:** 3 production + 1 test extension
**Wave:** 2 (depends_on: 44-05, 50-01)

### Strengths
- Lockstep refactor via shared `getPlannedSpendPLBreakdown` helper is the right abstraction. Both Sites become a single function call. Diverge-by-construction is impossible after this lands.
- Backward-compat strategy (`lease_type` optional → falls through to `getPlannedSpendPLImpactLegacy`) is additive, no migration script, no data mutation.
- Test 4.5 regression-locks today's exact return value ($23,200 verified via direct simulation — see Cross-Plan §F).
- Migration banner gated by localStorage with SSR-safety note; coaches get explicit upgrade UX.
- Optgroup separation in payment select ("New (detailed)" vs "Legacy (simplified)") preserves operator agency.

### NOTES (non-blocking)

#### Note 1 — Lockstep refactor preserves the dep/expenses split
Verified by reading `useForecastWizard.ts:1215-1245`: the rollup maintains TWO accumulators (`plannedSpendDepreciation` → `finalDepreciation` → subtracted in `netProfit` formula at line 1267; `plannedSpendExpenses` → `finalInvestments` → subtracted at line 1269). Both flow into the returned `ForecastSummary` as separate fields (`depreciation: ..., investments: ...` at lines 1281-1282).

The plan's Option A (`PlannedSpendPLBreakdown { depreciation, expenses, total }`) preserves this split correctly. **No downstream consumer of `plannedSpendDepreciation` or `plannedSpendExpenses` exists OUTSIDE this useMemo** — the names are scoped inside `calculateYearSummary`. The grep `plannedSpendDepreciation\|plannedSpendExpenses` returns ONLY hits in the useForecastWizard.ts:1215-1245 region itself. So the refactor is local-only and safe.

The downstream consumer of the returned `ForecastSummary.depreciation` and `ForecastSummary.investments` fields is whatever reads `ForecastSummary` — `grep "ForecastSummary"` would pin that, but the field-name semantics are preserved by the refactor (the breakdown's `expenses` value goes into `investments` field exactly as today). **No silent number changes for legacy items.**

#### Note 2 — `useful_life_months` vs legacy `usefulLifeYears`
The plan adds `useful_life_months` as a NEW field. Legacy items use `usefulLifeYears` (in YEARS, not months). Items WITH `lease_type` set use the new `useful_life_months`; items WITHOUT use the legacy. **No conversion done at runtime — by design.** The risk: an executor might be tempted to map `usefulLifeYears * 12 → useful_life_months` for newly-upgraded items. The plan correctly doesn't do this; the user must enter useful_life_months explicitly via the new conditional input. **Recommendation for executor:** When the user switches a legacy item from "Legacy: Outright" to "Outright purchase", the new expansion panel will show useful_life_months as empty — until they fill it in, the new-taxonomy branch will compute $0 P&L (because `usefulLifeMonths <= 0` returns 0). This is acceptable but worth a help tooltip; consider adding a default of `(item.usefulLifeYears || 5) * 12` to the input's placeholder OR pre-fill via the onChange handler when lease_type first transitions. NOT a blocker — UX polish.

#### Note 3 — Test 4.5 backward-compat number ($23,200, not $23,199)
The plan says Test 4.5 should hardcode "today's actual return value (captured at Task 1 RED time)." Direct simulation against the current `getPlannedSpendPLImpact` code with the legacy fixture `{ amount: 100000, paymentMethod: 'finance', financeRate: 6, financeTerm: 60, financeMonthlyPayment: 1933, financeTotalInterest: 15998, usefulLifeYears: 5, month: 1, spendType: 'asset' }` returns **$23,200** (not $23,199 — the rounding differs because legacy `getPlannedSpendPLImpact` does Math.round at end, while the rollup does Math.round per-component). Both legacy paths agree at $23,200. The new taxonomy path may compute $23,199 due to PMT rounding (calculateLoanPayment returns $1933, totalInterest = $1933×60 - $100000 = $15,980, vs the pre-cached fixture's $15,998). **This is a 0.1% discrepancy worth documenting in Test 4.5's hardcoded comment** — but is NOT a defect; it's the difference between "use the cached financeTotalInterest" (legacy) and "compute fresh from interest_rate + term_months" (new). Plan's framing of Test 4.5 as "preserves today's number for items without lease_type" is correct.

#### Note 4 — `getPlannedSpendPLBreakdown` placement in types.ts
Task 4 says to add `getPlannedSpendPLBreakdown` to `types.ts` AND refactor `getPlannedSpendPLImpact` to call it. Task 3 ALSO modifies `getPlannedSpendPLImpact` (adds the `lease_type` switch). After both tasks land, the structure is:
- T3 introduces `getPlannedSpendPLImpactWithTaxonomy` + `getPlannedSpendPLImpactLegacy` (private helpers)
- T4 supersedes both with `getPlannedSpendPLBreakdown` + delegates `getPlannedSpendPLImpact` to it

Task 4 explicitly says "Delete the now-redundant `getPlannedSpendPLImpactWithTaxonomy` and `getPlannedSpendPLImpactLegacy` from Task 3 (or mark them as internal — your call)." This is fine but the executor should DELETE them, not leave dead code. **Recommendation:** Add to T4's acceptance criteria: "T3's intermediate helpers `getPlannedSpendPLImpactWithTaxonomy` + `getPlannedSpendPLImpactLegacy` are deleted; only `getPlannedSpendPLBreakdown` + `getBreakdownWithTaxonomy` + `getBreakdownLegacy` + the delegating `getPlannedSpendPLImpact` remain."

#### Note 5 — Rollback story for 50-02
The plan covers rollback semantics correctly per RESEARCH.md: revert the PR; lease/finance math returns to wrong state; forecasts saved DURING the new-math window keep their per-forecast state (the per-forecast `lease_type` field persists in the saved object even after revert; the legacy code path simply ignores the field). After revert, items with `lease_type` set will fall through to `getPlannedSpendPLImpactLegacy` (which doesn't know `lease_type`) and use whatever `paymentMethod` is also set on the item. As long as `paymentMethod` defaults to `'outright'` when a new-taxonomy item is created, the revert math will be benign-ish (asset depreciation only). **Recommendation for executor's 50-02 SUMMARY:** Document explicitly that the revert path requires `paymentMethod` to remain set on every PlannedSpend even when `lease_type` is also set. Verify Step6CapEx Edit 1 (the optgroup select) does NOT clear `paymentMethod` when switching to new taxonomy — the current `onChange` only sets `lease_type`. Good — paymentMethod stays.

#### Note 6 — Step6CapEx UI reactivity to `useful_life_months` for finance_lease
The conditional input panel shows `useful_life_months` for `finance_lease` items. When the user enters $0 (or empty) for useful_life_months, `getBreakdownWithTaxonomy`'s `finance_lease` branch returns `{ depreciation: 0, expenses: interestExp, total: interestExp }`. So a finance lease with no useful_life will show JUST interest — which may surprise the operator. Acceptable, but a UI hint ("Useful life required for depreciation calculation") would help. NOT a blocker.

---

## Cross-Plan Verification

### A. Lockstep refactor — downstream consumer audit
Grepped `plannedSpendDepreciation\|plannedSpendExpenses` across `src/`. **All 9 hits live inside the single useMemo at useForecastWizard.ts:1215-1245.** No external consumer. The refactor is local-only and safe. The dep/expenses split is preserved by the `PlannedSpendPLBreakdown` shape. **No silent regression risk.**

### B. Task 3.0 scope-check escape hatch
The hatch is well-defined (≤30 LOC + single rollup region threshold). However per Cross-Plan Note 1 below, the most likely outcome is "no rollup change needed" — neither stay nor split, but a third state ("verify and document"). The plan permits this implicitly (Task 3 says "if the rollup currently does NOT double-count: no change needed at the rollup; Task 3 collapses to a verification/comment-only commit"). PASS.

### C. Backward compatibility for old saved forecasts
- 50-02 Test 4.5 regression-locks legacy fixture P&L to today's value.
- Plan adds `lease_type` as OPTIONAL with sane defaults; `useForecastWizard.ts:130-145` deserializer is mentioned for back-compat but Task 4 doesn't actually edit it (no need — undefined `lease_type` falls through to legacy via the early-return in `getPlannedSpendPLImpact`).
- Verified: a `PlannedSpend` with `lease_type === undefined` produces exactly the legacy math. PASS.

### D. Test infrastructure reuse
- 50-01 creates `src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx` (1 file).
- 50-02 EXTENDS the same file (Task 1 says "Open the existing test file. Do NOT create a new file."). Single file holds 6-7 (50-01) + 6 (50-02) = ~13 tests across 4 describe blocks. Manageable; not a god-file. PASS.

### E. Out-of-scope hygiene (PHASE.md deferrals)
Searched both plans for: `pay cycle`, `casual`, `part-time`, `departure flow`, `add subscriptions`, `Xero employee`. ZERO matches. Both plans stay in bug-fix lane. PASS.

### F. CI implications (`next build`)
All edits are inside client components (`'use client'` files) and a hook. No new server-only execution. `next build` page-data collection unaffected. The new test file uses `@testing-library/react` + `userEvent` consistent with the existing forecast test harness (`vitest.config.ts` jsdom). PASS.

### G. CONTEXT.md decision compliance
**Decision A (Option 1 full taxonomy):** 50-02 implements all 4 lease_types (`outright_purchase`, `operating_lease`, `finance_lease`, `loan_financing`) with the 5 new fields (`lease_type`, `term_months`, `interest_rate`, `useful_life_months`, `residual_value`). PASS.

**Decision B (root-cause fix on Bug 2):** 50-01 attempts root-cause closure. PER NOTE 1 ABOVE, the rollup is already correct — the executor's discovery during scope-check will reveal "root cause" is actually "display layer only" because the rollup half was fixed previously. The plan handles this gracefully. PASS, with the caveat that "root-cause fix" should be reframed in SUMMARY as "verified rollup correctness + fixed display layer."

### H. Cross-Plan Data Contract — `getPlannedSpendPLImpact`
**Verified:** `getPlannedSpendPLImpact` is consumed by:
1. `Step6CapEx.tsx:76` — totalPLImpact summary
2. `Step6CapEx.tsx:200` — per-row P&L Impact column
3. `useForecastWizard.ts:30` — IMPORTED but only `calculateLoanPayment` etc. are actually used in the rollup; `getPlannedSpendPLImpact` import may be dead OR used elsewhere.

After 50-02 Task 4: `getPlannedSpendPLImpact(item, year)` returns `getPlannedSpendPLBreakdown(item, year).total`. Both Step6CapEx call sites continue to work (signature unchanged, return type unchanged). PASS.

### I. Memory item closure
50-01 Task 5 updates `project_opex_double_count.md`. Per Cross-Plan Note 1, the closure note will need to say "verified resolved" (rollup already correct) rather than "fixed in this PR." Task 5 acceptance is non-blocking. PASS.

---

## Recommendations for Executor

1. **50-01 Task 3 Step 0 — expect to find the rollup is already correct.** Read `useForecastWizard.ts:1149-1190` first; the `if (line.isTeamCostOverride !== undefined ? line.isTeamCostOverride : isTeamCost(line.name)) return sum;` at line 1154 already filters team-classified lines from OpEx. This means the only fix Task 3 needs is the Step5OpEx BudgetFramework display correction. Test 2.3's assertion ("each line counted exactly once") should be verified GREEN against the rollup BEFORE making any change. Update the memory file (Task 5) to "Resolved (rollup verified correct on $branch; Phase 50 50-01 additionally fixed BudgetFramework display)."
2. **50-02 Task 4 — explicitly delete T3's intermediate `getPlannedSpendPLImpactWithTaxonomy` + `getPlannedSpendPLImpactLegacy` helpers** when adding `getPlannedSpendPLBreakdown`. Don't leave dead code paths.
3. **50-02 Task 5 — pre-fill `useful_life_months` from `usefulLifeYears * 12`** in the conditional input's `value` initializer (or via auto-fill on lease_type transition). Coaches won't think to convert years → months manually.
4. **Both plans — note Step6CapEx renders WIZARD_STEPS step 7 in BOTH plans' SUMMARY.md.** The filename being `Step6CapEx.tsx` is historical. Future grep-readers will thank you.
5. **50-02 Test 4.5 — capture the exact number BEFORE writing the prod taxonomy code.** Direct simulation gives $23,200 for `getPlannedSpendPLImpact(legacyFixture, 1)` against current HEAD. Hardcode that.

---

## Summary metric counts

| Plan | Tasks | Prod files | Test files | New LOC est. | Risk class |
|------|-------|------------|------------|--------------|------------|
| 50-01 | 5 (4 code + 1 memory) | 3 (Step3, Step5, Step6CapEx) + maybe useForecastWizard | 1 new | ~80 prod + 120 test | Low |
| 50-02 | 5 | 3 (types, useForecastWizard, Step6CapEx) | extends 50-01 file | ~150 prod + 150 test | Medium |

Both plans within the "review in 30 minutes" budget. 50-02's higher task count is justified by atomic sequencing (RED → type → math Site 1 → math Site 2 → UI).
