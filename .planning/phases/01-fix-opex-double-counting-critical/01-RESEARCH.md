# Phase 1: Fix OpEx Double-Counting — Research

**Researched:** 2026-04-05
**Domain:** React/TypeScript forecast calculation layer — useMemo filters, Tailwind UI
**Confidence:** HIGH (entire codebase read directly; no external library research needed)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Team cost lines identified by `isTeamCost()` remain in the Step 5 OpEx table but are rendered as greyed-out, non-editable rows with a static inline label "Counted in Team Costs" — always visible, no hover required.
- **D-02:** Excluded rows stay in their original Xero P&L order (not grouped at top). They appear scattered among regular OpEx lines, preserving the accounting structure the coach recognises from Xero.
- **D-03:** Greyed-out rows show the prior year amount as read-only text (not an editable input). This lets the coach cross-reference what's being counted in Team Costs.
- **D-04:** Excluded team cost lines are excluded from all OpEx totals — the table footer total, the `opexByYear` calculation, the `BudgetTracker` `opexAllocated`, and the P&L `netProfit` formula.
- **D-05:** No data migration. The fix is applied at the calculation layer. When a saved forecast is loaded, `isTeamCost()` re-classifies lines and excludes them from OpEx sums automatically. Existing saved `opexLines` arrays in Supabase are not modified.
- **D-06:** Verification: OpEx % is reasonable (not 461%), Net Profit matches `grossProfit - teamCosts - opex - depreciation - otherExpenses - investments` with no overlap, BudgetTracker utilization shows sensible numbers, Step 8 Review P&L waterfall flows correctly.

### Claude's Discretion
- Technical approach for filtering (whether to filter in the reducer, in `useMemo`, or at render time)
- Exact styling of greyed-out rows (opacity, text color, badge design)
- Whether to add a summary count above the table (e.g., "3 lines counted in Team Costs")

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| R1.1 | OpEx lines flagged by `isTeamCost()` must be excluded from OpEx sum in forecast calculations; Budget tracker, Step 5, and Step 8 Review must all reflect correct numbers | All four fix locations identified with exact line numbers; filtering approach documented |
</phase_requirements>

---

## Summary

The bug is a pure calculation error: `state.opexLines` in the wizard contains lines sourced from the Xero P&L that are wage/salary/super entries. These lines are correctly classified as team costs by `isTeamCost()` but the reduction that builds the OpEx sum does not call that function — it includes every line unconditionally. The same unchecked loop appears in three places: (1) `useForecastWizard.ts` line 986 where `opex` is built for the P&L summary, (2) `BudgetTracker.tsx` line 107 where `opexAllocated` is computed, and (3) `Step5OpEx.tsx` line 908 where `opexByYear` drives the table total and footer. Step 8 Review (`Step8Review.tsx`) consumes the `summary` prop derived from `useForecastWizard` — it will auto-correct once fix (1) is applied with no changes of its own.

The fix in each reducer is a single guard line: `if (isTeamCost(line.name)) return sum;` inserted before `lineAmount` is computed. The UI change in Step 5 is a conditional render: when `isTeamCost(line.name)` is true, skip the editable input row and render a locked, greyed-out row instead, still including the line in the DOM (D-02) but contributing zero to `opexByYear`.

No database changes, type changes, or new libraries are needed. The `isTeamCost()` function is already exported and production-ready.

**Primary recommendation:** Apply the `isTeamCost()` guard in the `reduce` callbacks in all three calculation locations, then update the Step 5 row render to show a read-only greyed-out variant for flagged lines.

---

## Standard Stack

### Core (already installed — no installation needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React `useMemo` / `useCallback` | React 18 | Memoised derived state | Pattern already in use across wizard |
| Tailwind CSS | 3.4.x | Conditional row styling | Used throughout; `cn()` from `@/lib/utils` available |
| `isTeamCost()` (local) | — | Classify wage/super lines | Single source of truth for team cost detection |

No new packages required.

---

## Architecture Patterns

### Recommended Project Structure
No structural changes. All edits are in-place within existing files:
```
src/app/finances/forecast/components/wizard-v4/
├── useForecastWizard.ts        # Fix 1: opex reducer in calculateYearSummary (~line 986)
├── components/
│   └── BudgetTracker.tsx       # Fix 2: opexAllocated reducer (~line 107)
└── steps/
    └── Step5OpEx.tsx           # Fix 3: opexByYear useMemo (~line 908) + row render (~line 1170)
    # Step8Review.tsx — no changes needed (consumes summary prop, auto-corrects)
```

### Pattern 1: Guard in reduce — calculation layer fix

**What:** Add `isTeamCost(line.name)` early-return inside each `.reduce()` that sums OpEx.
**When to use:** Every location that accumulates `opexLines` into a total.

```typescript
// Source: src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts ~line 986
// BEFORE:
const opex = state.opexLines.reduce((sum, line) => {
  if (line.isOneTime && line.oneTimeYear && line.oneTimeYear !== yearNum) return sum;
  if (line.startYear && line.startYear > yearNum) return sum;
  // ... compute lineAmount ...
  return sum + lineAmount;
}, 0);

// AFTER — add ONE guard after existing guards:
const opex = state.opexLines.reduce((sum, line) => {
  if (line.isOneTime && line.oneTimeYear && line.oneTimeYear !== yearNum) return sum;
  if (line.startYear && line.startYear > yearNum) return sum;
  if (isTeamCost(line.name)) return sum;  // <-- the fix
  // ... compute lineAmount (unchanged) ...
  return sum + lineAmount;
}, 0);
```

Same pattern applies in `BudgetTracker.tsx` line ~107 and `Step5OpEx.tsx` line ~908.

**Import needed in `useForecastWizard.ts` and `BudgetTracker.tsx`:**
```typescript
import { isTeamCost } from './utils/opex-classifier';
// BudgetTracker uses a relative path:
import { isTeamCost } from '../utils/opex-classifier';
```

`Step5OpEx.tsx` already imports from `opex-classifier` (`classifyExpense`, `getSuggestedValue`) so `isTeamCost` just needs to be added to that import list.

### Pattern 2: Read-only greyed-out row in Step 5

**What:** In the `opexLines.map()` at line 1170 of `Step5OpEx.tsx`, detect team cost lines and render a locked variant.
**When to use:** Any `OpExLine` where `isTeamCost(line.name)` is `true`.

Decision D-01 mandates: always-visible static label "Counted in Team Costs", greyed-out, non-editable.
Decision D-03 mandates: show `priorYearAnnual` as read-only text.
Decision D-02 mandates: row stays in original order, no grouping.

```tsx
// At the top of the map callback in Step5OpEx.tsx:
{opexLines.map((line) => {
  const isExcluded = isTeamCost(line.name);

  if (isExcluded) {
    return (
      <tr key={line.id} className="opacity-50 bg-gray-50/80">
        <td className="px-4 py-2 text-sm text-gray-400 italic">{line.name}</td>
        <td className="px-3 py-2 text-right text-sm text-gray-400 tabular-nums">
          {formatCurrency(line.priorYearAnnual)}
        </td>
        <td className="px-3 py-2" colSpan={activeYear > 1 ? 5 : 4}>
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            Counted in Team Costs
          </span>
        </td>
        <td className="w-10" /> {/* No delete button */}
      </tr>
    );
  }

  // ... existing row render for non-excluded lines (unchanged) ...
})}
```

**Why at render time, not filtered out of the array:** D-02 (order preserved) and D-03 (show prior year). The excluded rows need to be visible. Filtering them from `opexByYear` via the guard in the `reduce` is the calculation fix; showing them greyed-out in the render is the display fix. These are two independent concerns handled in two independent places.

### Pattern 3: opexByYear useMemo (Step5OpEx.tsx ~line 908)

The `opexByYear` memo in Step5OpEx.tsx uses `calculateY1Amount` and `calculateYearAmount` callbacks that do NOT internally call `isTeamCost()`. The guard needs to be applied in the `opexByYear` `reduce` calls, not inside `calculateY1Amount`:

```typescript
// BEFORE (Step5OpEx.tsx ~line 908):
const opexByYear = useMemo(() => ({
  y1: opexLines.reduce((sum, line) => sum + calculateY1Amount(line), 0),
  y2: opexLines.reduce((sum, line) => sum + calculateYearAmount(line, 2, effectiveDefaultGrowth), 0),
  y3: opexLines.reduce((sum, line) => sum + calculateYearAmount(line, 3, effectiveDefaultGrowth), 0),
}), [...]);

// AFTER:
const opexByYear = useMemo(() => ({
  y1: opexLines.reduce((sum, line) => isTeamCost(line.name) ? sum : sum + calculateY1Amount(line), 0),
  y2: opexLines.reduce((sum, line) => isTeamCost(line.name) ? sum : sum + calculateYearAmount(line, 2, effectiveDefaultGrowth), 0),
  y3: opexLines.reduce((sum, line) => isTeamCost(line.name) ? sum : sum + calculateYearAmount(line, 3, effectiveDefaultGrowth), 0),
}), [...]);
```

The `totalPriorYear` variable on line 915 (`opexLines.reduce((sum, line) => sum + line.priorYearAnnual, 0)`) is shown in the table footer as the "prior year" comparison column. This should also exclude team cost lines so the prior year column does not inflate the baseline comparison:

```typescript
const totalPriorYear = opexLines.reduce((sum, line) =>
  isTeamCost(line.name) ? sum : sum + line.priorYearAnnual, 0);
```

### Anti-Patterns to Avoid
- **Filtering `opexLines` out of state:** Team cost lines must remain in state so they render as greyed-out rows (D-01, D-02). Never do `opexLines.filter(l => !isTeamCost(l.name)).reduce(...)` as the base array for rendering — only in reduce accumulators.
- **Marking lines with a new `isExcluded` field in the `OpExLine` type:** The decision (D-05) is calculation-layer fix only. `isTeamCost()` is called at computation time, not stored. Adding a persisted flag would require a data migration.
- **Modifying `calculateY1Amount` or `calculateYearAmount` to skip team costs internally:** These callbacks are also used for individual line display in the row (to show the forecast amount). If they return 0 for team cost lines, the greyed-out row's displayed value would also be 0, hiding useful information. Guard at the `reduce` level, not inside the callback.
- **Touching Step8Review.tsx:** It receives `summary` as a prop. Once `useForecastWizard.ts` is fixed, the `opex` field in `YearlySummary` will be correct. The waterfall chart renders whatever it receives — no changes needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Team cost detection | Custom keyword list | `isTeamCost()` from `opex-classifier.ts` | Already handles Australian SMB names, super edge cases, normalised account codes |
| Conditional Tailwind classes | String concatenation | `cn()` from `@/lib/utils` | Already in project; handles class merging correctly |

---

## Common Pitfalls

### Pitfall 1: `calculateY1Amount` / `calculateYearAmount` also used for display
**What goes wrong:** Placing the `isTeamCost` guard inside `calculateY1Amount` makes the greyed-out row show `$0` as its forecast amount — confusing because D-03 says show the prior year figure, not zero.
**Why it happens:** The same callback is called both in the `opexByYear` reduce and for each `<tr>`'s `forecastAmount` display value.
**How to avoid:** Guard in the `reduce` accumulators only. The row render calls `getActiveYearAmount(line)` which calls `calculateY1Amount` — leave these untouched for team cost lines. The greyed-out row bypasses the normal row template entirely (early return in the map) so `forecastAmount` is never needed for those lines.
**Warning signs:** If testing shows team cost row displays `$0` instead of the prior year amount, the guard was placed too deep.

### Pitfall 2: `BudgetTracker.tsx` import path
**What goes wrong:** Adding `import { isTeamCost }` with the wrong relative path in `BudgetTracker.tsx`.
**Why it happens:** `BudgetTracker.tsx` is in `components/`, not `steps/`, so the path to `utils/opex-classifier.ts` is `../utils/opex-classifier` (one level up from `components/`, then into `utils/`).
**How to avoid:** Use `import { isTeamCost } from '../utils/opex-classifier';`

### Pitfall 3: `totalPriorYear` not updated
**What goes wrong:** The table footer "prior year" comparison column still shows the inflated prior year total even after fixing the forecast column, causing visual confusion (e.g., prior year shows $500k vs forecast showing $80k, making it look like a 84% cost reduction).
**Why it happens:** `totalPriorYear` on line 915 is a separate `reduce` not inside the `opexByYear` memo — easy to miss.
**How to avoid:** Apply the team cost guard to `totalPriorYear` as well.

### Pitfall 4: `useForecastWizard.ts` import
**What goes wrong:** `useForecastWizard.ts` does not currently import from `opex-classifier.ts` — forgetting to add the import will cause a compile error.
**Why it happens:** The hook is large (1000+ lines) and the import block is at the top. The `isTeamCost` guard is needed inside `calculateYearSummary` which is a closure deep inside the hook.
**How to avoid:** Add `import { isTeamCost } from './utils/opex-classifier';` to the imports at the top of `useForecastWizard.ts`.

### Pitfall 5: Colgroup/colspan mismatch in greyed-out row
**What goes wrong:** The greyed-out row uses a `colSpan` value that doesn't match the actual number of columns, causing misaligned table layout.
**Why it happens:** Step5OpEx.tsx conditionally renders an extra `<th>` for the "Increase" column when `activeYear > 1`. The greyed-out row must respect the same conditional column count.
**How to avoid:** Use `colSpan={activeYear > 1 ? 5 : 4}` in the grey row (or whatever arithmetic matches the normal row's column count for the remaining cells after the first two).

---

## Code Examples

### Fix 1 — useForecastWizard.ts: Add import and guard

```typescript
// Add to imports at top of useForecastWizard.ts:
import { isTeamCost } from './utils/opex-classifier';

// Inside calculateYearSummary, after the existing startYear/oneTime guards (~line 988):
const opex = state.opexLines.reduce((sum, line) => {
  if (line.isOneTime && line.oneTimeYear && line.oneTimeYear !== yearNum) return sum;
  if (line.startYear && line.startYear > yearNum) return sum;
  if (isTeamCost(line.name)) return sum;  // NEW — exclude team cost lines
  // ... rest of switch unchanged ...
  return sum + lineAmount;
}, 0);
```

### Fix 2 — BudgetTracker.tsx: Add import and guard

```typescript
// Add to imports at top of BudgetTracker.tsx:
import { isTeamCost } from '../utils/opex-classifier';

// Inside opexAllocated reduce (~line 107):
const opexAllocated = opexLines.reduce((sum, line) => {
  if (line.startYear && line.startYear > yearNum) return sum;
  if (line.isOneTime && line.oneTimeYear && line.oneTimeYear !== yearNum) return sum;
  if (isTeamCost(line.name)) return sum;  // NEW — exclude team cost lines
  // ... rest of switch unchanged ...
  return sum + lineAmount;
}, 0);
```

### Fix 3 — Step5OpEx.tsx: opexByYear, totalPriorYear, and row render

```typescript
// Add isTeamCost to existing import:
import { classifyExpense, getSuggestedValue, isTeamCost } from '../utils/opex-classifier';

// opexByYear useMemo (~line 908):
const opexByYear = useMemo(() => ({
  y1: opexLines.reduce((sum, line) => isTeamCost(line.name) ? sum : sum + calculateY1Amount(line), 0),
  y2: opexLines.reduce((sum, line) => isTeamCost(line.name) ? sum : sum + calculateYearAmount(line, 2, effectiveDefaultGrowth), 0),
  y3: opexLines.reduce((sum, line) => isTeamCost(line.name) ? sum : sum + calculateYearAmount(line, 3, effectiveDefaultGrowth), 0),
}), [opexLines, calculateY1Amount, calculateYearAmount, effectiveDefaultGrowth]);

// totalPriorYear (~line 915):
const totalPriorYear = opexLines.reduce((sum, line) =>
  isTeamCost(line.name) ? sum : sum + line.priorYearAnnual, 0);

// Row render (~line 1170) — early return for team cost lines:
{opexLines.map((line) => {
  if (isTeamCost(line.name)) {
    return (
      <tr key={line.id} className="opacity-50 bg-gray-50/80">
        <td className="px-4 py-2 text-sm text-gray-400 italic">{line.name}</td>
        <td className="px-3 py-2 text-right text-sm text-gray-400 tabular-nums">
          {formatCurrency(line.priorYearAnnual)}
        </td>
        <td className="px-3 py-2 text-gray-400 text-xs font-medium uppercase tracking-wide"
          colSpan={activeYear > 1 ? 5 : 4}>
          Counted in Team Costs
        </td>
        <td className="w-10" />
      </tr>
    );
  }
  // ... existing row render unchanged ...
})}
```

---

## Runtime State Inventory

> Not applicable — this is a pure code/calculation fix with no rename or refactor. No stored data uses team cost line names as keys. Supabase `opexLines` arrays are untouched (D-05).

---

## Environment Availability

> Step 2.6: SKIPPED — phase is a pure TypeScript/React code change with no external tool, service, or runtime dependencies beyond the project's own stack.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None installed (no Jest, Vitest, or similar in devDependencies) |
| Config file | None |
| Quick run command | `npm run lint` |
| Full suite command | `npm run build && npm run lint` |

The project has no automated unit or integration test runner. The only automated checks are TypeScript compilation and ESLint via `npm run build` and `npm run lint`. Manual browser testing against a loaded forecast is the current verification method.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R1.1 | `isTeamCost()` lines excluded from all OpEx sums | Build check (type safety) | `npm run build` | N/A — no unit test infra |
| R1.1 | BudgetTracker shows < 100% utilization | Manual browser | — | — |
| R1.1 | Step 8 Net Profit = grossProfit − teamCosts − opex − depreciation − otherExpenses − investments | Manual browser | — | — |
| R1.1 | Step 5 greyed-out rows visible, non-editable, labelled | Manual browser | — | — |

### Sampling Rate
- **Per task commit:** `npm run lint` (catches import errors and TypeScript type issues quickly)
- **Per wave merge:** `npm run build` (full TypeScript compile; will fail on any type error or missing import)
- **Phase gate:** `npm run build` green + manual browser verification with a real forecast loaded

### Wave 0 Gaps
No test framework is installed. For this phase, the three-line nature of each fix (one `if` guard per reducer) and the clear pass/fail browser test (does BudgetTracker show 461% or ~70%?) means manual verification is adequate. A unit test for `isTeamCost()` itself would be valuable long-term but is out of scope for this phase.

---

## Open Questions

1. **Does Step 5's `BudgetFramework` sub-component also need fixing?**
   - What we know: `BudgetFramework` (lines 32-214 of Step5OpEx.tsx) has its own year budget calculation (`calculateYearBudget`) that computes `availableForExpenses`. It does NOT use `opexLines` directly — it uses `opexByYear` passed in as a prop. Once `opexByYear` is fixed in the parent, `BudgetFramework` will receive correct values automatically.
   - What's unclear: Whether `BudgetFramework` has any independent OpEx calculation not fed from `opexByYear`.
   - Recommendation: Verify by checking what `BudgetFramework` does with the `opexByYear` prop — the planner should confirm `BudgetFramework` only consumes the already-fixed `opexByYear` and does not re-sum `opexLines` internally.

2. **Summary count badge above the table**
   - What we know: CONTEXT.md lists "Whether to add a summary count above the table" as Claude's discretion.
   - What's unclear: Whether the planner should include this as a task or leave it to the implementer's judgment during coding.
   - Recommendation: Include as an optional sub-task (e.g., "Add a note above the table if any lines are excluded, e.g., '3 lines counted in Team Costs'") — low effort, improves UX clarity.

---

## Sources

### Primary (HIGH confidence)
- Direct source read: `src/app/finances/forecast/components/wizard-v4/utils/opex-classifier.ts` — `isTeamCost()` function at line 361, `TEAM_COST_KEYWORDS` array
- Direct source read: `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` — OpEx sum at line 986, P&L formula at line 1051
- Direct source read: `src/app/finances/forecast/components/wizard-v4/components/BudgetTracker.tsx` — `opexAllocated` at line 107
- Direct source read: `src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx` — `opexByYear` at line 908, `totalPriorYear` at line 915, row render at line 1170
- Direct source read: `src/app/finances/forecast/components/wizard-v4/steps/Step8Review.tsx` — waterfall receives `summary` prop, no independent OpEx calculation
- Direct source read: `src/app/finances/forecast/components/wizard-v4/types.ts` — `OpExLine` interface, `ForecastWizardState`
- Direct source read: `package.json` — no unit test runner; build+lint are the available automated checks

### Secondary (MEDIUM confidence)
- None needed — all findings come from direct code reads.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — read directly from source; no new libraries
- Architecture: HIGH — all four fix locations confirmed with exact line numbers from source reads
- Pitfalls: HIGH — derived from reading the actual code paths, not assumptions
- UI pattern: HIGH — Tailwind + `cn()` pattern confirmed in existing code

**Research date:** 2026-04-05
**Valid until:** Until any of the four canonical files are significantly refactored (stable for the foreseeable future)
