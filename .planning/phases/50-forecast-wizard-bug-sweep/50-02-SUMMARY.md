---
phase: 50-forecast-wizard-bug-sweep
plan: 02
subsystem: forecast-wizard / accrual-accounting
type: execute
status: complete
tags:
  - forecast
  - wizard-v4
  - lease
  - finance
  - capex
  - taxonomy
  - cfo-grade
  - bug-fix
requirements:
  - FCST-BUG-04
dependencies:
  requires:
    - 44-05
    - 50-01
  provides:
    - lease_type taxonomy (4 branches) on PlannedSpend with full accrual math
    - getPlannedSpendPLBreakdown shared helper guaranteeing Site 1 / Site 2 lockstep
    - dismissible migration banner (one-time, localStorage) on Step 7
  affects:
    - Step6CapEx per-row P&L Impact column (now correct for finance leases)
    - Step 9 Review forecast P&L (rollup uses correct math for new-taxonomy items)
key-files:
  created: []
  modified:
    - src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx
    - src/app/finances/forecast/components/wizard-v4/types.ts
    - src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts
    - src/app/finances/forecast/components/wizard-v4/steps/Step6CapEx.tsx
key-decisions:
  - "Decision A Option 1 (full taxonomy) — added explicit lease_type with 4 values rather than relabel-only or hybrid"
  - "Lockstep via shared helper (Option A) — extracted getPlannedSpendPLBreakdown so both rollup sites call one implementation; divergence impossible by construction"
  - "Skipped intermediate dead-code helpers from Task 3 spec — went directly to breakdown extraction (per plan-checker Note 4 recommendation) to avoid leaving getPlannedSpendPLImpactWithTaxonomy/Legacy as dead paths"
  - "Backward compatibility via read-time fallthrough — no migration script; items without lease_type fall through to verbatim legacy math"
  - "Migration banner SSR-safe via useState(true) + useEffect — banner shows by default until localStorage hydrates"
metrics:
  tasks_completed: 5
  commits: 5
  files_modified: 4
  insertions: 589
  deletions: 58
  duration_minutes: ~25
  test_files_extended: 1
  bug4_tests_added: 6
  total_wizard_v4_bugfix_tests: 13
  full_vitest: "725 pass / 1 fail (pre-existing date test) / 41 skipped / 4 todo"
completed: 2026-05-02
---

# Phase 50 Plan 02: Lease/Finance Taxonomy Summary

Implemented Decision A (full taxonomy) for FCST-BUG-04 by adding the
`lease_type` discriminator with 4 branches (`outright_purchase`,
`operating_lease`, `finance_lease`, `loan_financing`) plus 5 supporting
optional fields (`term_months`, `interest_rate`, `useful_life_months`,
`residual_value`) on `PlannedSpend`. The two parallel P&L rollup sites
identified in RESEARCH.md (`getPlannedSpendPLImpact` in `types.ts` AND the
inline rollup in `useForecastWizard.ts:1217-1240`) now share a single
`getPlannedSpendPLBreakdown(item, year)` helper that returns
`{ depreciation, expenses, total }` — the dep/expenses split is preserved
because downstream `ForecastSummary.depreciation` and
`ForecastSummary.investments` consumers still see two distinct buckets.

A finance-lease item with $100k / 60mo / 6% APR / 60mo useful life now reports
**$23,196/yr** P&L impact (depreciation $20k + interest $3,196), NOT $24,000
(the previous full-payment expensing). Coaches no longer see the textbook
accrual error.

## Note on filename

`Step6CapEx.tsx` is the file that renders WIZARD_STEPS step 7 ("CapEx"). The
`Step6` prefix is historical — see `types.ts:549` for the canonical step
mapping. Both this SUMMARY and the 50-01 SUMMARY reference the file by its
real on-disk name.

## Tasks executed (RED → GREEN per task)

| Task | Title | Commit | Files | Tests state after |
|------|-------|--------|-------|-------------------|
| 1 | Failing Bug 4 tests (TDD red) | 379c32c | wizard-v4-bug-fixes.test.tsx (+225 lines) | 4.1 / 4.3 / 4.4 / 4.6 RED; 4.2 / 4.5 GREEN |
| 2 | Extend PlannedSpend type | 9d8db2a | types.ts (+25 / -5) | tsc clean; 4.5 still GREEN; 4.1 / 4.3 / 4.4 / 4.6 still RED at runtime |
| 3 | Rewrite getPlannedSpendPLImpact via shared breakdown helper | a941bf5 | types.ts (+121 / -23) | Site 1 GREEN for 4.1-4.4 + 4.6; lockstep assertions still RED |
| 4 | Mirror taxonomy into useForecastWizard rollup | cc325cd | useForecastWizard.ts (+13 / -22) | All 13 wizard-v4-bug-fixes tests GREEN |
| 5 | Step6CapEx UI — selector + conditional inputs + banner | c8fd38c | Step6CapEx.tsx (+205 / -5) | UI changes math-neutral — 13/13 still GREEN |

## Diff scope per file

| File | Insertions | Deletions | Notes |
|------|-----------:|----------:|-------|
| `src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx` | 228 | 3 | Added Bug 4 describe (6 tests) + lockstep helpers `siteOnePLImpact` / `siteTwoPLImpact` + comment block update |
| `src/app/finances/forecast/components/wizard-v4/types.ts` | 174 | 35 | Added `LeaseType` union + 5 new optional `PlannedSpend` fields + `PlannedSpendPLBreakdown` interface + `getPlannedSpendPLBreakdown` (taxonomy + legacy branches) + `getPlannedSpendPLImpact` delegates to breakdown |
| `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` | 13 | 22 | Imported `getPlannedSpendPLBreakdown`; replaced 24-line inline rollup with single delegating loop |
| `src/app/finances/forecast/components/wizard-v4/steps/Step6CapEx.tsx` | 205 | 5 | Imported `LeaseType`; banner state + dismissal handler; banner JSX in card header; two-tier optgroup payment select; expand-toggle now triggers on `lease_type`; new amber expansion panel with conditional inputs |

Total: 589 insertions / 58 deletions across 4 files.
**`files_modified` matches the plan exactly** — no out-of-scope files touched.

## Lockstep refactor decision (Option A) — rationale

The plan offered three approaches to keeping the two rollup sites in sync:

- **Option A (chosen):** Extract `getPlannedSpendPLBreakdown(item, year) →
  { depreciation, expenses, total }` to `types.ts`; have both
  `getPlannedSpendPLImpact` and the `useForecastWizard.ts` rollup call it.
  Divergence is impossible by construction.
- **Option B:** Mirror the `lease_type` switch inline at both sites. Risk:
  Sites 1 and 2 drift over time as people edit one without touching the other.
- **Option C:** Inline at one site, function at the other.

Option A was chosen because (a) the `PlannedSpend` plan-checker Note 1 verified
no external consumer reads `plannedSpendDepreciation` / `plannedSpendExpenses`
outside the single useMemo — the refactor is local and safe; (b) the breakdown
interface preserves the dep/expenses split needed by downstream
`ForecastSummary` field assignments (line 1281-1282); (c) the lockstep tests
(Bug 4 4.1-4.4) become trivially true after the refactor — they're testing
that two function calls return the same number, and both calls land in the
same code path.

I deviated from the plan's literal Task 3 + Task 4 sequence by going straight
to the breakdown extraction in Task 3 (rather than introducing intermediate
`getPlannedSpendPLImpactWithTaxonomy` + `getPlannedSpendPLImpactLegacy` helpers
in Task 3 only to delete them in Task 4). Plan-checker Note 4 explicitly
recommended this — "Add to T4's acceptance criteria: T3's intermediate helpers
… are deleted". I avoided creating them in the first place to keep the task
diff cleaner.

## Backward-compatibility regression lock

**Test 4.5** in `wizard-v4-bug-fixes.test.tsx` hardcodes the canonical legacy
fixture:

```ts
{ amount: 100_000, paymentMethod: 'finance', financeRate: 6, financeTerm: 60,
  financeMonthlyPayment: 1933, financeTotalInterest: 15998,
  usefulLifeYears: 5, month: 1, spendType: 'asset' }
```

…and asserts **`getPlannedSpendPLImpact(legacyItem, 1) === 23200`** at BOTH
Site 1 and Site 2.

The expected number was captured by direct simulation of the legacy
`getPlannedSpendPLImpact` against this fixture on `main` 2026-05-02. Both
the standalone function and the inline rollup return `$23,200` (verified
independently via `node /tmp/calc-legacy-pl.mjs`). After all 5 tasks land,
the legacy fallthrough path in `getBreakdownLegacy` still returns the
identical numbers — Test 4.5 PASSES at every commit on this branch.

**Implication:** Existing saved forecasts (where `lease_type === undefined`)
render exactly the same numbers as before this PR. No migration script,
no data mutation, no surprises.

A small note on the plan-checker's $23,200 vs $23,199 discussion (Note 3):
the new taxonomy path computes $23,196 for the equivalent finance_lease
fixture (Test 4.3), differing slightly from the legacy fixture's $23,200
because legacy uses the cached `financeTotalInterest = 15998` while the
new path computes fresh from `interest_rate + term_months` (yielding
`totalInterest = 1933 × 60 - 100000 = 15980`, annual = 3196). This is the
correct behavior — the new path replaces the cached field with on-the-fly
computation. The 0.1% difference is well below any rounding-driven test
tolerance and is documented in the test's `toBeCloseTo(23199, -1)` assertion.

## Lockstep verification approach

The test file defines two helpers:

- `siteOnePLImpact(item, year)` — calls `getPlannedSpendPLImpact(item, year)`
  directly. This is what `Step6CapEx.tsx` uses for the per-row "P&L Impact"
  column.
- `siteTwoPLImpact(item, year)` — renders the `useForecastWizard` hook with
  a clean state, calls `actions.addPlannedSpend(item)`, then reads
  `summary.year1.depreciation + summary.year1.investments`. With no
  `priorYear` / `capexItems` / `investments` / other expenses, only the
  added plannedSpend contributes to those buckets, so their sum equals the
  Site 2 rollup output for that one item.

Tests 4.1-4.4 assert both sites match (4.3 and 4.4 with ±$2 rounding tolerance
because Math.round happens at slightly different aggregation points). After
Task 4 they MUST agree because both call `getPlannedSpendPLBreakdown`.

## Manual smoke test — what coaches see

Not auto-verifiable, but follows from the unit tests:

- Open Step 7 → see new amber **"New: CapEx items can now be classified…"**
  banner above the table (dismissible — survives reload via localStorage).
- Add a CapEx item → row appears with the new two-tier Payment select.
- Switch the Payment column to "Finance lease" → expansion arrow appears →
  click it → amber panel reveals `Useful life (months)`, `Term (months)`,
  `Interest rate (% APR)`, `Residual value` inputs.
- Enter $100k amount, useful life 60, term 60, rate 6 → row's "P&L Impact"
  column reads ~**$23,196/yr** (NOT $24,000 of full lease payment).
- Switch back to "Legacy: Lease" → expansion panel collapses; row reverts
  to today's behavior (legacy lease branch returns
  `leaseMonthlyPayment * 12 = $24,000` if leaseMonthlyPayment is set).
- Reload page → banner stays dismissed.

## Deviations from plan

| Deviation | Severity | Reason |
|-----------|----------|--------|
| Skipped Task 3's intermediate `getPlannedSpendPLImpactWithTaxonomy` + `getPlannedSpendPLImpactLegacy` helpers; jumped straight to `getPlannedSpendPLBreakdown` | Minor | Plan-checker Note 4 explicitly recommended this. Avoids creating dead code in Task 3 only to delete it in Task 4. Net effect on commits: same atomic boundary, cleaner diffs. |
| `siteTwoPLImpact` test helper reads `summary.year1.depreciation + summary.year1.investments` (rather than relying on a hypothetical `state.computedYearTotals` accessor mentioned in the plan's draft helper) | Minor | The plan's draft helper noted "the exact accessor depends on what useForecastWizard exposes." `summary` is the actual accessor — `state.computedYearTotals` does not exist on the hook. Used what's there. |
| Did NOT pre-fill `useful_life_months` from `usefulLifeYears * 12` when transitioning a legacy item to new taxonomy | Minor (deferred polish per plan-checker Note 6) | Coaches must enter `useful_life_months` explicitly; until they do, finance_lease shows interest-only with $0 depreciation. Documented in the conditional input panel. Plan-checker said this is "NOT a blocker — UX polish." |

No deviations from the math contract or the lockstep architecture.

## Local CI status (full suite)

| Gate | Result | Notes |
|------|--------|-------|
| `npx vitest run` (full) | **725 pass / 1 fail / 41 skipped / 4 todo** | 1 failure is the pre-existing `plan-period-banner.test.tsx` UTC-vs-local date issue that orchestrator flagged. NOT caused by this PR. |
| `npx tsc --noEmit` | **clean** | No new errors. |
| `npx next lint` | **clean for modified files** | Pre-existing warnings in unrelated files (CoachLayout, NotificationBell, useAutoSave, etc.) — none in any file touched by this plan. |
| `wizard-v4-bug-fixes.test.tsx` (full Bug 1 + 2 + 3 + 4) | **13/13 pass** | Bug 1 + 2 + 3 from 50-01 unaffected. Bug 4 all green. |
| `src/__tests__/forecast/` | **19/19 pass** | Broader forecast suite green. |
| `src/__tests__/components/` | **passes** | Component tests green. |

## Risk worth verifier scrutinizing hardest

**The lockstep refactor in Task 4** — both rollup sites now call
`getPlannedSpendPLBreakdown`, but downstream consumers of
`ForecastSummary.depreciation` / `ForecastSummary.investments` are NOT
re-tested by Bug 4's unit tests. The verifier should confirm:

1. The Step 9 Review screen shows the correct numbers for a clean wizard
   session with both legacy AND new-taxonomy CapEx items mixed in.
2. The saved-forecast serialization round-trip (`useForecastWizard.ts:130-145`
   deserializer) tolerates `lease_type` and the 4 new optional fields without
   crashing or stripping them.
3. There is no other consumer of `getPlannedSpendPLImpact` outside
   `Step6CapEx.tsx:76,200` (per plan-checker §H, the import in
   `useForecastWizard.ts:30` is now legitimately used by both
   `getPlannedSpendPLImpact` reference AND the new `getPlannedSpendPLBreakdown`
   call, but Step6CapEx is the only consumer of the public
   `getPlannedSpendPLImpact` function).

The Bug 4 tests cover these as far as unit math, but the integration path
(saved forecast → reload → render Step 9 → verify numbers) is only verified
indirectly via Test 4.5's regression lock. A live wizard session is the next
checkpoint.

## Key files

### Modified

- `src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx`
- `src/app/finances/forecast/components/wizard-v4/types.ts`
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts`
- `src/app/finances/forecast/components/wizard-v4/steps/Step6CapEx.tsx`

### Created

None — plan deliberately extends the test file from 50-01 rather than
adding a new file.

## Self-Check: PASSED

- Test file `src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx` exists and
  contains `describe('Bug 4 — FCST-BUG-04: lease/finance taxonomy')` with 6
  tests — all 6 PASS as of commit `cc325cd` (Task 4) and remain PASS through
  `c8fd38c` (Task 5 UI).
- All 5 commits exist on `feat/50-02-lease-finance-taxonomy` and have been
  pushed to `origin/feat/50-02-lease-finance-taxonomy`.
- `npx tsc --noEmit` returns no errors.
- `npx next lint` clean for all 4 modified files.
- The only vitest failure (`plan-period-banner.test.tsx`) is the pre-existing
  date issue documented by the orchestrator and is unrelated to this plan.

## Branch and next step

- **Branch:** `feat/50-02-lease-finance-taxonomy` (pushed)
- **Commits on branch (5 task commits, will add this SUMMARY commit):**
  - `379c32c` test(50-02): RED Bug 4 tests
  - `9d8db2a` feat(50-02): extend PlannedSpend type
  - `a941bf5` feat(50-02): rewrite getPlannedSpendPLImpact via breakdown helper
  - `cc325cd` feat(50-02): mirror taxonomy into useForecastWizard rollup
  - `c8fd38c` feat(50-02): Step6CapEx UI selector + conditional inputs + banner
- **PR URL:** orchestrator opens after verifier confirms goal achievement.
