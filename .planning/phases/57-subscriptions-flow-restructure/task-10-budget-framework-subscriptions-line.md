# Task 10 — BudgetFramework: Subscriptions line + BudgetTracker parity

**Ship batch:** B4 (Subscription UX) · **Wave:** 5 · **Dependencies:** T07 · **Risk:** MEDIUM (formula regression)

## Goal

Update the `BudgetFramework` component (currently in `Step5OpEx.tsx:50-210`, renders inside the OpEx step which is now step 6) to subtract subscriptions from the available-OpEx ceiling. Update the explainer text. Mirror the same change in `BudgetTracker.tsx` to keep the two ceiling computations in sync.

Per CONTEXT.md:
- Display order: Revenue → −COGS → Gross Profit → −Team → **−Subscriptions** ← NEW → −Profit Target → = Available OpEx
- Header stays "OpEx Budget" (do NOT rename)
- Explainer: `Revenue − COGS − Team − Subscriptions − Profit = Available for OpEx`

## Files modified

- `src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx` (~50 lines)
  - `BudgetFramework` component (lines 50-210):
    - Add `subscriptionsByYear: { y1: number; y2: number; y3: number }` to props
    - In `calculateYearBudget`: subtract subscriptions from `availableOpEx`
    - In display (lines 132-155): insert "− Subscriptions" line between "− Team Costs" and "− Target Profit"
    - Update explainer text at line 110
  - Step5OpEx parent (around the BudgetFramework mount): pass `subscriptionsByYear` prop computed from `summary.year{N}.subscriptions` (or `state.subscriptions` directly)
- `src/app/finances/forecast/components/wizard-v4/components/BudgetTracker.tsx` (~10 lines)
  - Line ~105: update `availableForExpenses` formula to subtract subscriptions
  - Add `subscriptions: number` prop or read from state (mirror BudgetFramework approach)

## Implementation notes

### BudgetFramework prop

```typescript
function BudgetFramework({
  state,
  year1TeamCosts,
  opexByYear,
  subscriptionsByYear,  // NEW
  fiscalYear,
  actualRevenue,
  actualCOGS,
}: {
  state: ForecastWizardState;
  year1TeamCosts: number;
  opexByYear: { y1: number; y2: number; y3: number };
  subscriptionsByYear: { y1: number; y2: number; y3: number };  // NEW
  fiscalYear: number;
  actualRevenue: { y1: number; y2: number; y3: number };
  actualCOGS: { y1: number; y2: number; y3: number };
}) {
  // ...
}
```

### Math change

In `calculateYearBudget(year)`:

Before:
```typescript
const targetProfit = revenue * (netProfitPct / 100);
const availableOpEx = grossProfit - teamCosts - targetProfit;
return { revenue, cogs, grossProfit, grossProfitPct, teamCosts, targetProfit, netProfitPct, availableOpEx };
```

After:
```typescript
const subscriptions = year === 1 ? subscriptionsByYear.y1 : year === 2 ? subscriptionsByYear.y2 : subscriptionsByYear.y3;
const targetProfit = revenue * (netProfitPct / 100);
const availableOpEx = grossProfit - teamCosts - subscriptions - targetProfit;
return { revenue, cogs, grossProfit, grossProfitPct, teamCosts, subscriptions, targetProfit, netProfitPct, availableOpEx };
```

### Display change (lines 132-155)

Insert between "− Team Costs" and "− Target Profit":
```jsx
<div className="flex justify-between text-gray-500">
  <span>− Subscriptions</span>
  <span className="tabular-nums">{formatCurrency(budget.subscriptions)}</span>
</div>
```

### Explainer (line 110)

Before:
```jsx
<p className="text-xs text-gray-500">Revenue − COGS − Team − <strong className="text-gray-700">Profit</strong> = Available for OpEx</p>
```

After:
```jsx
<p className="text-xs text-gray-500">Revenue − COGS − Team − Subscriptions − <strong className="text-gray-700">Profit</strong> = Available for OpEx</p>
```

### Implied Net Profit calculation

The existing inline calculation at `Step5OpEx.tsx:~190`:
```typescript
const impliedProfit = budget.grossProfit - budget.teamCosts - opex;
```

Update to:
```typescript
const impliedProfit = budget.grossProfit - budget.teamCosts - budget.subscriptions - opex;
```

(`budget.subscriptions` from the updated return object.)

**Audit ALL impliedProfit / similar formulas in Step5OpEx — there may be multiple:**

```bash
grep -nE "grossProfit.*teamCosts|impliedProfit" src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx
```

Every site that subtracts `grossProfit/teamCosts` to derive a profit-like number must also subtract subscriptions in the new formula. Update each hit.

### Step5OpEx parent — pass the prop

Find the `<BudgetFramework ... />` mount (around `Step5OpEx.tsx:1094-1100`). Compute `subscriptionsByYear` from state — **parameterize the growth rate to track operator overrides**:

```typescript
const defaultIncrease = state.defaultOpExIncreasePct || 3;
const activeSubs = state.subscriptions.filter(v => v.isActive);
const y1Subs = activeSubs.reduce((sum, v) => sum + (v.monthlyBudget || 0) * 12, 0);
const subscriptionsByYear = {
  y1: y1Subs,
  y2: y1Subs * (1 + defaultIncrease / 100),
  y3: y1Subs * Math.pow(1 + defaultIncrease / 100, 2),
};
```

Pass to BudgetFramework:
```jsx
<BudgetFramework
  state={state}
  year1TeamCosts={year1TeamCosts}
  opexByYear={opexByYear}
  subscriptionsByYear={subscriptionsByYear}  // NEW
  fiscalYear={fiscalYear}
  actualRevenue={actualRevenue}
  actualCOGS={actualCOGS}
/>
```

**Alternative (PREFERRED):** read from `summary.year{N}.subscriptions` (already computed by T07). This avoids duplicating the math AND honors the operator's `defaultOpExIncreasePct` override automatically. Use this if `summary` is in scope at this site (it is — the hook returns it via `useForecastWizard`).

```typescript
const subscriptionsByYear = {
  y1: summary.year1.subscriptions,
  y2: summary.year2?.subscriptions ?? 0,
  y3: summary.year3?.subscriptions ?? 0,
};
```

**Recommend the `summary` source — single source of truth + automatic operator-override behavior.**

### BudgetTracker parity (Risk R5)

`BudgetTracker.tsx:~105`:

Before:
```typescript
const availableForExpenses = revenue - cogs - teamCosts - targetProfit;
```

After:
```typescript
const subscriptions = /* read from props or state */;
const availableForExpenses = revenue - cogs - teamCosts - subscriptions - targetProfit;
```

Add prop / state read at the top of the component, mirroring BudgetFramework. If BudgetTracker is mounted in Step5/Step6 only, this is straightforward. Verify by `grep -n "<BudgetTracker" src/app/finances/forecast/`.

Also update the on-screen breakdown if BudgetTracker shows the formula visually — match the display order Revenue → COGS → Team → Subscriptions → Profit Target → Available.

## Acceptance criteria

- [ ] BudgetFramework displays a "− Subscriptions" line between Team and Target Profit
- [ ] On a forecast with subs = $5k/yr, "Available OpEx" decreases by $5k vs pre-Phase-57
- [ ] On a forecast with no subs, "Available OpEx" is unchanged from pre-Phase-57 (subscriptions = 0)
- [ ] Explainer text updated
- [ ] Implied Net Profit subtracts subscriptions
- [ ] **Run `grep -nE "grossProfit.*teamCosts|impliedProfit" src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx`. Every site that subtracts grossProfit/teamCosts must also subtract subscriptions in the new formula. Verify each hit is updated.**
- [ ] BudgetTracker `availableForExpenses` matches BudgetFramework `availableOpEx` (pixel-perfect ceiling parity — visual diff)
- [ ] **Y2/Y3 subscriptions grow at `state.defaultOpExIncreasePct` (parameterized — NOT hard-coded 3%). Test acceptance: with operator-overridden `defaultOpExIncreasePct = 5`, Y2 subscriptions = Y1 × 1.05, Y3 = Y1 × 1.05². Verify either by reading from `summary.year{N}.subscriptions` (preferred — automatic) or by computing locally with `state.defaultOpExIncreasePct || 3`.**
- [ ] Header still reads "OpEx Budget" (NOT renamed)
- [ ] No new tsc errors

## Regression risks

- **R5 from PLAN risk register:** BudgetFramework and BudgetTracker drift. Mitigated by updating both in this task. Add a visual-regression test or screenshot diff if your test infra supports it; otherwise rely on T16 manual QA.
- **`subscriptionsByYear` computed twice (here + T07 summary):** prefer reading from summary to keep one source of truth. If for some reason summary isn't in scope, document the duplication.
- **Operator `defaultOpExIncreasePct` override:** if the test fixture hard-codes 1.03 instead of `(1 + state.defaultOpExIncreasePct / 100)`, a forecast with operator-set 5% breaks the assertion. Tests must read from state.

## Estimated effort

0.75 day.
