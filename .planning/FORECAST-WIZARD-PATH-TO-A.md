# Forecast Wizard — path from C+ to A

**Signed off:** 14 Aug 2026 (Matt)
**Current grade:** C+ · **Target:** A
**Scope:** `src/app/finances/forecast/components/wizard-v4/` + the generate route,
the materialiser, and the monthly-report budget binding.

Derived from a 5-lens critique and a 3-lens A-bar study (Aug 2026), with every
load-bearing claim re-verified against the code and against prod
(`uudfstpvndurzwnapibf`). Two rounds of operator correction are folded in — see
"Corrections" at the end, which record reasoning that turned out to be wrong.

---

## What "A" means here

Not a richer tool. One property, provable:

> **The number Matt approves on screen is the number stored, the number in the
> client's spreadsheet, and the number the monthly report varies against — and if
> that ever stops being true, something says so before the client does.**

The second half: nothing in the tool lies. No step that stores nothing, no test
that guards nothing, no header advertising a capability that doesn't exist.

It is a C+ today not because the arithmetic is hard, but because **nothing in the
system ever compares the two numbers.**

---

## What is NOT changing

- **All nine steps stay**, same order. Nothing removed, merged or reordered.
- **CapEx keeps lease-vs-purchase in full.** `getPlannedSpendPLBreakdown`
  (`types.ts:558+`) models outright purchase → depreciation; operating lease →
  operating expense; finance lease / loan → depreciation + properly amortised
  (declining) interest. That is correct accounting AND the decision belongs at
  budget-prep time.
- **Growth Plan stays.** It is the only side-by-side FY/FY+1/FY+2 P&L view, and
  10 of the 11 line-carrying forecasts have Year 2 data.
- **Nothing is removed for being unused.** Usage was near-zero because the
  features were broken, not unwanted. All will be used going forward.
- **No new concepts**: no driver-based forecasting, scenarios, tax, GST or
  three-way. No rewrite — A is reachable incrementally.

---

## Phase 1 — Stop the numbers drifting (~3.5d) · correctness

1. **Forecast id in the draft key.** The localStorage key is
   `forecast-wizard-v4-${businessId}-${fiscalYear}` (`useForecastWizard.ts:196`) —
   no forecast id. Opening an existing forecast sets `startFresh=false`
   (`page.tsx:983`), which trips `hasRestoredData` (`ForecastWizardV4.tsx:113`)
   and SKIPS the full API init, so line arrays are never re-read from the
   forecast being opened. Autosave then writes to the newly-opened `forecastId`
   (`:1380`). Net: open B after editing A → you see A's lines under B's name,
   then they save onto B.
2. **Draft autosave must not write published headline numbers.** Drafts only take
   the safe early-return when `!forecastId || createNew`
   (`generate/route.ts:188`). Editing an EXISTING forecast falls through to the
   UPDATE at `:212`, writing assumptions + `revenue_goal` / `gross_profit_goal` /
   `net_profit_goal` to the live row, then skips materialisation at `:274`
   because `isDraft`. The headline moves every 3s; the stored P&L does not.
3. **Bind each report to an explicit budget.** 2 of 3 `monthly_report_settings`
   rows have a null `budget_forecast_id`, so "Budget" resolves to whatever
   forecast is `is_active` at render time.

## Phase 2 — Prove the numbers (~3.5d) · trust

4. **Persist the approved summary.** `summary jsonb` on `financial_forecasts`,
   written in the same transaction as the `forecast_pl_lines` upsert. Today
   **0 of 37** forecasts record what was approved (`assumptions ? 'summary'` = 0,
   `wizard_state ? 'summary'` = 0), so nothing is checkable after the fact.
   This is the keystone — 5 and 6 are impossible without it.
5. **Parity assertion at Generate**, watch-mode first. The route computes both
   halves in one request: re-aggregate the returned `PLLine[]` into the same
   buckets and compare to the posted summary.
6. **Daily `forecast_summary_parity`** check in the existing
   `metric_invariant_runs` harness (05:00 UTC). Start at `watch` severity per the
   house rule; promote only after history proves it quiet.

## Phase 3 — Prove the paths that have never run (~3d)

7. **CapEx end-to-end proof.** The chain is intact by inspection — Step 7 writes
   `plannedSpends`; `buildAssumptions` emits it; the materialiser converts it via
   the SAME `getPlannedSpendPLBreakdown` the summary uses, emitting
   `SYS-DEPRECIATION` / `SYS-PLANNED-SPEND`. It was empty in prod because
   `plannedSpends` was missing from the autosave dependency list until #358
   (13 Aug) — Step 7 edits were discarded on close. Needs a lease + outright
   purchase test and a real trial forecast: **0 of 37** have ever exercised it.
8. **Fix Growth Plan's CapEx strip**, which reads the dead `capexItems` array and
   will report no CapEx even once Step 7 is populated.
9. **Walk the remaining previously-broken features** and verify each one's
   save → restore → materialise chain.

## Phase 4 — Fix the Excel export (~2d)

10. Render from the stored summary + materialised lines instead of its own
    parallel engine. `ExcelExport.tsx:248` computes `NP = gp − team − opex − dep`
    against the canonical formula at `useForecastWizard.ts:1888`, omitting
    subscriptions, one-offs, investments and Xero other income/expense; the team
    loop adds salary + super only (no bonuses/commissions), hardcodes 1.03 for
    new hires, and still carries the seasonal exponent off-by-one the summary
    fixed. This is the artefact CFO-only clients receive.

## Phase 5 — Housekeeping (~1d) · invisible

11. Delete only files nothing imports and nothing will use: `AIAssistant` (371),
    `ThreeYearSummary` (100), the duplicate `wizard-v4/components/BudgetTracker`
    (403 — a different, live one exists at `forecast-cfo/BudgetTracker.tsx`), and
    the unrendered components inside `Step4Team` (`TeamTimelineSummary` 369,
    `TeamStrategicPrompts_Legacy` 141, `TeamInsightBadge` 71). The dead
    BudgetTracker matters most: it carries a stale OpEx formula a future reader
    would mistake for canon.

## Phase 6 — Structural (~4d) · optional, last

12. Make `ForecastAssumptions` the single input so the summary and the
    materialiser take the same data and can be asserted equal. Today the summary
    consumes `WizardState` and the materialiser `ForecastAssumptions`, which is
    why a shared helper in `types.ts` cannot fix the five duplicate arithmetic
    sites on its own. Also converts the six test files that assert against a copy
    of the arithmetic (960 lines, zero application imports).

---

## Effort and grade

| Phases | Days | Grade |
|---|---|---|
| 1 + 2 | ~7 | A− (correct, and provably so) |
| + 3 + 4 | ~12 | A |
| + 5 + 6 | ~17 | A, and stays there |

---

## Open decisions

- **Other Expenses** — no screen exists (`Step7Other.tsx` imported by nothing),
  yet `otherExpenses` is subtracted from net profit and rendered as a P&L row
  that can only ever be zero. Wire it up, or remove the phantom state?
- **AI CFO panel** — reachable but cannot write back (zero `actions.` calls), so
  using it means retyping suggestions by hand. Wire write-back, or leave?

## Risks

- Phase 1 item 2 touches the publish protocol that PR-A (#350) and PR-D (#353)
  recently changed. Do it on its own branch, ideally with the Phase 2 parity
  assertion already watching.
- Phase 6 is a type change across the wizard's widest surface. Do it last, after
  the parity assertion can prove it didn't move a number.

## Fleet state at sign-off (14 Aug 2026)

37 forecasts · 21 active · **13 active with zero stored P&L lines** (mostly
superseded FY2026 rows for non-CFO clients) · 2 with lines but **no Cost of
Sales at all** (Envisage FY2026 + FY2027 — gross margin renders as 100%) ·
Digital Bond FY2027 has 1 COGS line, IICT FY2027 has 2.

## Corrections (reasoning that was wrong — kept so it isn't repeated)

- **"Trim CapEx; financing belongs to the cashflow tool."** Wrong. Lease vs buy
  changes the P&L itself (depreciation vs operating expense), which is squarely
  this wizard's job. The existing model is correct and stays.
- **"Growth Plan persists nothing, fold it into Step 3."** Misleading. It has no
  state slice of its own, but the Y2/Y3 growth rates it edits land in
  `revenueLines`, which IS persisted and DOES materialise. Step 9 does not
  duplicate its multi-year table.
- **"Zero prod usage ⇒ low value."** Wrong signal entirely — the features were
  broken and unfixed. Nothing is removed for lack of usage.
- **"Move the year-rollup arithmetic into `types.ts`."** Half right; under-delivers
  without first unifying the input type (Phase 6).
- **"At most 2 of 21 budgets are usable"** (from the A-bar study) — overstated.
  Most empties are superseded FY2026 rows for non-CFO clients.
