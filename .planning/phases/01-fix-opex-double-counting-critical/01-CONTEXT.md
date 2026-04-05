# Phase 1: Fix OpEx double-counting [CRITICAL] - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the forecast P&L calculations where team cost lines (wages, salaries, superannuation, contractors, etc.) from Xero appear in both the Team Costs total (Step 4) AND the OpEx total (Step 5), causing double-counting that inflates expenses. The BudgetTracker shows 461% utilization and Net Profit is wildly wrong. This phase corrects the calculation layer, updates the Step 5 UI to show excluded lines, and ensures BudgetTracker and Step 8 Review reflect accurate numbers.

</domain>

<decisions>
## Implementation Decisions

### Excluded Lines UI
- **D-01:** Team cost lines identified by `isTeamCost()` remain in the Step 5 OpEx table but are rendered as greyed-out, non-editable rows with a static inline label "Counted in Team Costs" — always visible, no hover required.
- **D-02:** Excluded rows stay in their original Xero P&L order (not grouped at top). They appear scattered among regular OpEx lines, preserving the accounting structure the coach recognises from Xero.
- **D-03:** Greyed-out rows show the prior year amount as read-only text (not an editable input). This lets the coach cross-reference what's being counted in Team Costs.
- **D-04:** Excluded team cost lines are excluded from all OpEx totals — the table footer total, the `opexByYear` calculation, the BudgetTracker `opexAllocated`, and the P&L `netProfit` formula.

### Saved Forecast Handling
- **D-05:** No data migration. The fix is applied at the calculation layer. When a saved forecast is loaded, `isTeamCost()` re-classifies lines and excludes them from OpEx sums automatically. Existing saved `opexLines` arrays in Supabase are not modified.

### Verification Approach
- **D-06:** Claude's discretion for verification criteria. Should include: OpEx % is reasonable (not 461%), Net Profit calculation matches `grossProfit - teamCosts - opex - depreciation - otherExpenses - investments` with no overlap, BudgetTracker utilization shows sensible numbers, and Step 8 Review P&L waterfall flows correctly.

### Claude's Discretion
- Technical approach for filtering (whether to filter in the reducer, in `useMemo`, or at render time)
- Exact styling of greyed-out rows (opacity, text color, badge design)
- Whether to add a summary count above the table (e.g., "3 lines counted in Team Costs")

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OpEx Classification
- `src/app/finances/forecast/components/wizard-v4/utils/opex-classifier.ts` — Contains `isTeamCost()` function (line 361) and `TEAM_COST_KEYWORDS` array. This is the source of truth for identifying team cost lines.

### Forecast Calculations (where the bug lives)
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` — Main wizard state hook. OpEx sum at line 986, P&L calculation at line 1051. Both need team cost filtering.
- `src/app/finances/forecast/components/wizard-v4/components/BudgetTracker.tsx` — Budget tracker widget. `opexAllocated` at line 107 needs team cost filtering.

### Step 5 UI
- `src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx` — OpEx step component. Already imports `classifyExpense` and skips classification for team costs but doesn't exclude them from display/totals.

### Step 8 Review
- `src/app/finances/forecast/components/wizard-v4/steps/Step8Review.tsx` — Review step that shows P&L waterfall. Should reflect corrected numbers automatically if calculation layer is fixed.

### Types
- `src/app/finances/forecast/types.ts` — `OpExLine`, `ForecastWizardState`, `CostBehavior` type definitions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isTeamCost()` function already exists and works — classifies wages, salaries, super, contractors, etc.
- `classifyExpense()` returns `isTeamCost: boolean` in its result — already integrated into the classification pipeline
- `cn()` utility from `@/lib/utils` for conditional Tailwind class composition

### Established Patterns
- OpEx lines are stored as an array in wizard state (`opexLines: OpExLine[]`)
- Calculations use `useMemo` with state dependencies
- `reduce()` pattern for summing line items (seen in both `useForecastWizard.ts` and `BudgetTracker.tsx`)
- UI uses Tailwind classes with brand design tokens

### Integration Points
- `useForecastWizard.ts` → P&L calculation function (lines 900-1070)
- `BudgetTracker.tsx` → `yearBudgets` useMemo (lines 18-158)
- `Step5OpEx.tsx` → `opexByYear` useMemo (lines 908-912) and table render (line 1170)
- `Step8Review.tsx` → consumes P&L numbers from wizard state

</code_context>

<specifics>
## Specific Ideas

No specific requirements — the fix is well-defined by the bug: filter `isTeamCost()` lines from all OpEx sums, show them greyed out in Step 5.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-fix-opex-double-counting-critical*
*Context gathered: 2026-04-05*
