# Phase 50: Forecast Wizard Bug Sweep — Research

**Researched:** 2026-05-02
**Domain:** React wizard state, controlled inputs, accrual accounting (lease/finance treatment)
**Confidence:** HIGH for diagnosis of all 4 bugs; HIGH for fix sketches 1, 2, 3; MEDIUM for fix sketch 4 (operator product decision required)
**Branch:** `feat/50-research-and-plan`

## Summary

All four bugs reproduce in code; all four root causes are isolated and well-localized.

- **Bug 1 (Step 3 input)** is a classic controlled-input round-trip bug: `value={val.toLocaleString()}` formats with commas while `onChange` strips non-digits with `parseFloat(value.replace(/[^0-9.]/g, ''))`. The decimal point is stripped, leading-zero edits are clobbered, and IME / mid-string edits jump because every keystroke re-formats the entire number. Three call sites: Step3RevenueCOGS.tsx:805, :1059, :1192. Fix is small + mechanical.
- **Bug 2 (Step 5 OpEx total)** has TWO components: (a) the per-line totals and `opexByYear` `useMemo` are correctly reactive, BUT (b) `BudgetFramework` shows `Available OpEx = grossProfit − teamCosts − targetProfit`, where `teamCosts` is derived from `teamMembers/newHires/departures` only — **it ignores OpEx lines auto-classified as team costs (`excludedTeamLines`)**. Result: any expense the wizard auto-detected as a team cost (e.g., "Wages and Salaries", "Superannuation") is **silently excluded from BOTH the OpEx total AND the team-cost subtraction** — it falls into a black hole. The "wrong total" the operator is seeing matches this. The "non-reactive" complaint is most likely the user observing this stale-looking output (it's actually reactive, just wrong).
- **Bug 3 (Step 7 from-plan input)** is structural: when the operator clicks an initiative chip, `actions.addPlannedSpend({...amount: init.estimated_cost || 0})` adds the row with the initiative's cost (often 0). The row then renders `<td>{formatCurrency(item.amount)}</td>` (Step6CapEx.tsx:218) — **read-only display, no input element exists for the amount column**. The user cannot type a value because there is nothing to type into.
- **Bug 4 (Step 7 lease/finance accounting)** is the riskiest. The lease branch in `getPlannedSpendPLImpact` (types.ts:317-324) and the equivalent rollup (useForecastWizard.ts:1229-1230) treat **the full monthly lease payment × 12 as a P&L expense**, regardless of whether it's an operating lease, finance lease, or chattel-mortgage / loan-financed asset. The dropdown offers `outright | finance | lease` with no sub-distinction. Fix requires either (a) explicit operating-lease label + math + balance-sheet split for finance leases, or (b) a product decision to keep the simplified model and just relabel the dropdown.

**Primary recommendation:** Decompose into **2 plans** — `50-01` for bugs 1 + 2 + 3 (small, mechanical, single PR), `50-02` for bug 4 (substantial, needs operator product decision before coding). Operator must answer: "do you want full finance-lease vs operating-lease vs loan accounting, or relabel the dropdown to operating-lease only and call it done?"

## Project Constraints (from CLAUDE.md)

There is no project-root `CLAUDE.md` in this repo. The applicable constraints come from MEMORY.md:

- **CFO-grade accuracy expectation** — Matt is a business coach with 18+ Xero clients; users see these numbers in coaching sessions. Bug 4 (lease/finance) is the highest-stakes credibility issue.
- **"Go deep before deploying fixes"** — trace root cause fully, plan before coding. Aligns with this research approach. Do NOT ship incremental patches that paper over symptoms.
- **Design philosophy: simplicity over features, target user is "not a numbers person"** — relevant to bug 4 product decision. A simpler model with correct labels may be the right answer over a full accounting taxonomy.
- **Only push to `wisdom-business-intelligence` remote.**
- **Vercel plugin (subagent-bootstrap)** — project uses Next.js + Vercel. Not load-bearing for these bug fixes (pure client component changes).

## FCST-BUG-01: Step 3 input shows wrong number

### Current behavior — exact code excerpts

**Three identical input call sites** in `src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx`:

**Site 1 — Revenue cell (Summary view, expanded monthly):**
```tsx
// Step3RevenueCOGS.tsx:803-810
<input
  type="text"
  value={cellValue ? cellValue.toLocaleString() : ''}
  onChange={(e) => handleRevenueChange(line.id, key, e.target.value)}
  placeholder="0"
  className="w-full px-1 py-1 text-xs text-right border border-gray-200 rounded ..."
/>
```

**Site 2 — Revenue cell (Monthly view):**
```tsx
// Step3RevenueCOGS.tsx:1058-1064
<input
  type="text"
  value={cellValue ? cellValue.toLocaleString() : ''}
  onChange={(e) => handleRevenueChange(line.id, key, e.target.value)}
  placeholder="0"
  className="..."
/>
```

**Site 3 — COGS cell (Monthly view):**
```tsx
// Step3RevenueCOGS.tsx:1191-1199
<input
  type="text"
  value={val ? val.toLocaleString() : ''}
  onChange={(e) => handleCOGSMonthChange(key, e.target.value)}
  placeholder="0"
  className="..."
/>
```

**The shared change handler** (`handleRevenueChange`, line 525-543; `handleCOGSMonthChange`, line 1152-1160):
```tsx
const handleRevenueChange = (lineId: string, period: string, value: string) => {
  const numValue = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
  // ... persists numValue into year1Monthly[period]
};
```

### Root-cause hypothesis (HIGH confidence)

This is a textbook controlled-input round-trip formatting bug. The flow per keystroke:

1. User types "5" into empty cell → onChange fires with `"5"` → `parseFloat("5") = 5` → state stores `5`.
2. React re-renders → `value={(5).toLocaleString()} = "5"`. OK so far.
3. User types another "0" → input now contains `"50"` → onChange fires with `"50"` → state stores `50`.
4. React re-renders → `value="50"`. OK.
5. User types "0" again → input contains `"500"` → onChange fires `"500"` → state `500`.
6. User types "0" → input contains `"5000"` → onChange fires `"5000"` → state `5000`.
7. React re-renders → `value={(5000).toLocaleString()} = "5,000"`. Display jumps from "5000" to "5,000" — **caret position resets to end** (no caret-position preservation logic).

**Specific failure modes:**
- **Decimal point stripped:** `parseFloat("5.")` = `5` (parseFloat ignores trailing dot), state stores `5`, re-render shows `"5"`. User cannot type fractional cents until they finish typing a digit after the dot.
- **Mid-string editing:** User has `"5,000"`. Selects the "5" and types "9" expecting `"9,000"`. onChange fires `"9,000"` → strip non-digits → `"9000"` → parseFloat → `9000` → re-render `"9,000"`. **This case happens to work** because the comma was stripped + re-added. BUT...
- **Backspace inside formatted value:** User has `"5,000"`. Caret between "5" and ",". Hits backspace expecting `"000"` (or "0"). DOM removes "5" → input value `",000"` → onChange `",000"` → strip → `"000"` → parseFloat → `0` → re-render `""`. Display blanks. **This is likely what the operator sees as "wrong number."**
- **Caret jumping:** `toLocaleString` outputs Australian-locale comma format. Every keystroke re-formats. Caret position is not preserved → jumps to end after each keystroke. Even when the final value is correct, mid-edit feels broken.

The bug is **always present** in the sense that the round-trip loses information whenever the input contains anything that parseFloat ignores (commas, partial decimals, extra dots). Users who only type digits left-to-right and never edit get the right answer.

### Proposed fix sketch

Two viable approaches, in order of preference:

**Option A (preferred) — Switch to `<input type="number">` and drop `.toLocaleString()` in the `value`.** The browser handles digit-only entry; commas are not displayed. Trade-off: loses the "$5,000" comma reading affordance during typing (the displayed number is `5000`).
```tsx
<input
  type="number"
  value={cellValue || ''}
  onChange={(e) => handleRevenueChange(line.id, key, e.target.value)}
  placeholder="0"
  ...
/>
// Handler stays the same; parseFloat works fine on number-input strings.
```

**Option B — Use a controlled-string buffer with formatted-on-blur.** Store the raw text the user typed in local state; only commit to wizard state on blur or Enter. Formatting (`.toLocaleString()`) only applied while NOT focused.
```tsx
function MonthCell({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const display = editing ? draft : (value ? value.toLocaleString() : '');
  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={() => { setDraft(String(value || '')); setEditing(true); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = parseFloat(draft.replace(/[^0-9.]/g, '')) || 0;
        onChange(n);
        setEditing(false);
      }}
    />
  );
}
```

**Recommendation: Option A** for these three sites — the cells are tiny (column width `~72px`), commas don't help readability at this size, and `type="number"` is one-line. Save Option B's complexity for cells where comma readability matters (it doesn't here).

### Risks and mitigations

- Switching to `type="number"` will cause **arrow keys to increment/decrement** the value (default browser behavior). Mitigation: add `onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}` if undesired.
- `type="number"` mobile keyboard differs from text. Acceptable — these are dollar amounts.
- Some testing libraries handle `type="number"` edge cases differently; the test must use `userEvent.type()` not `fireEvent.change()`.

### Test approach

Add `Step3RevenueCOGS.test.tsx` cases (currently just `it.todo`):
```tsx
it('persists exact typed digits to wizard state', async () => {
  // Render Step3 with a single revenue line, fiscal year 2026
  // userEvent.type(monthCell, '5000')
  // Expect updateRevenueLine to have been called with { year1Monthly: { ..., 'YYYY-MM': 5000 } }
});

it('handles backspace mid-string without zeroing the value', async () => {
  // Render with cellValue = 5000
  // Click cell, press End, press Backspace
  // Expect state to receive 500, not 0
});
```

These run in jsdom + RTL; <30s; CI-catchable.

## FCST-BUG-02: Step 5 OpEx total wrong + non-reactive

### Current behavior — exact code excerpts

**The "summary at top" the operator sees is `BudgetFramework`** (Step5OpEx.tsx:33-167). It receives:
```tsx
// Step5OpEx.tsx:1018-1025 (render call)
<BudgetFramework
  state={state}
  year1TeamCosts={year1TeamCosts}        // ← only counts teamMembers/newHires/departures
  opexByYear={opexByYear}                // ← only counts activeOpexLines (excludes auto-team-cost lines)
  fiscalYear={fiscalYear}
  actualRevenue={actualRevenue}
  actualCOGS={actualCOGS}
/>
```

**`year1TeamCosts` calculation** (Step5OpEx.tsx:767-797):
```tsx
const year1TeamCosts = useMemo(() => {
  let total = 0;
  for (const member of teamMembers) {
    // ... salary + super
  }
  for (const hire of newHires) {
    // ... pro-rata salary + super
  }
  return Math.round(total);
}, [teamMembers, newHires, departures]);
// ⚠️ Does NOT include excludedTeamLines (OpEx lines auto-classified as team costs)
```

**`opexByYear` calculation** (Step5OpEx.tsx:930-934):
```tsx
const opexByYear = useMemo(() => ({
  y1: activeOpexLines.reduce((sum, line) => sum + calculateY1Amount(line), 0),
  y2: activeOpexLines.reduce((sum, line) => sum + calculateYearAmount(line, 2, effectiveDefaultGrowth), 0),
  y3: activeOpexLines.reduce((sum, line) => sum + calculateYearAmount(line, 3, effectiveDefaultGrowth), 0),
}), [activeOpexLines, calculateY1Amount, calculateYearAmount, effectiveDefaultGrowth]);
// ⚠️ activeOpexLines = opexLines.filter(line => !isLineTeamCost(line))
//    → "Wages", "Superannuation", etc., are EXCLUDED from this total
```

**`activeOpexLines` / `excludedTeamLines` split** (Step5OpEx.tsx:636-647):
```tsx
const { activeOpexLines, excludedTeamLines } = useMemo(() => {
  const active: OpExLine[] = [];
  const excluded: OpExLine[] = [];
  for (const line of opexLines) {
    if (isLineTeamCost(line)) {
      excluded.push(line);
    } else {
      active.push(line);
    }
  }
  return { activeOpexLines: active, excludedTeamLines: excluded };
}, [opexLines, isLineTeamCost]);
```

**`BudgetFramework.calculateYearBudget`** (Step5OpEx.tsx:51-72):
```tsx
const calculateYearBudget = (year: 1 | 2 | 3) => {
  // ...
  const teamCosts = year === 1
    ? year1TeamCosts                            // ← from teamMembers/newHires only
    : year === 2 ? Math.round(year1TeamCosts * 1.03) : Math.round(year1TeamCosts * 1.03 * 1.03);
  const targetProfit = revenue * (netProfitPct / 100);
  const availableOpEx = grossProfit - teamCosts - targetProfit;
  return { revenue, cogs, grossProfit, grossProfitPct, teamCosts, targetProfit, netProfitPct, availableOpEx };
};
```

### Root-cause hypothesis (HIGH confidence)

The summary IS reactive — every input is a `useMemo` with the right dependencies. The Phase 44.3 bug pattern (stale `useMemo` deps) does NOT apply here.

**The actual bug is a double-exclusion:** Lines auto-classified as team costs (e.g., "Wages and Salaries" coming from Xero) end up in `excludedTeamLines`. They are then:
1. **Excluded from `opexByYear`** (the "Your OpEx" number shown in the progress bar) — correct, because they shouldn't be double-counted as OpEx.
2. **Excluded from `year1TeamCosts`** (the "Team Costs" subtraction line) — INCORRECT, because `year1TeamCosts` only sums `teamMembers`/`newHires` from Step 4 explicitly. The Xero-imported "Wages" line gets neither classified into team costs nor counted as OpEx — it falls into a void.

**Concrete example:** Xero shows `$200k` in "Wages and Salaries". OpEx auto-classifier marks that line as `isTeamCost: true`. Step 4 has `teamMembers` totaling $180k (the operator hand-entered them). Then:
- `year1TeamCosts` = $180k (only team members)
- `opexByYear.y1` excludes the $200k wages line
- BudgetFramework displays "Team Costs $180k" — **missing $20k**
- "Your OpEx" displays correct sum of non-team OpEx — looks right
- "Available OpEx" = grossProfit − $180k − targetProfit → **$20k too high**
- Operator sees "you have $X available for OpEx" but the team-cost line they actually owe is undercounted.

**Why "non-reactive" is also reported:** When the operator changes a per-line OpEx value, the `opexByYear` total updates. But the BudgetFramework's "Team Costs" doesn't change because it doesn't depend on opex lines. So the operator sees: change a $5k OpEx line → "Your OpEx" updates → but "Team Costs" doesn't move → "Available OpEx" only shifts by the OpEx delta, not by anything in the budget breakdown. From the operator's POV, **the breakdown looks frozen relative to their edits.** That's the "non-reactive" complaint.

There may ALSO be a secondary "OpEx total wrong because team-cost classifier mis-classifies a non-team line" issue. Worth verifying with a real Xero P&L during planning.

### Proposed fix sketch

Add `excludedTeamLines` cost to `year1TeamCosts` (or pass it as a separate input to `BudgetFramework`):

```tsx
// In Step5OpEx, after activeOpexLines/excludedTeamLines split:
const opexClassifiedTeamCosts = useMemo(() =>
  excludedTeamLines.reduce((sum, line) => sum + calculateY1Amount(line), 0),
  [excludedTeamLines, calculateY1Amount]
);

// Pass to BudgetFramework as an extra "additionalTeamCosts" prop, OR sum into year1TeamCosts:
const totalTeamCosts = year1TeamCosts + opexClassifiedTeamCosts;

<BudgetFramework
  ...
  year1TeamCosts={totalTeamCosts}  // now includes both Step 4 team + excluded OpEx team lines
  ...
/>
```

This makes Available OpEx mathematically consistent: `grossProfit − (Step4Team + ClassifiedTeamLines) − targetProfit = Available for non-team OpEx`. Reactivity comes for free since `excludedTeamLines` and `calculateY1Amount` are already useMemo'd.

**Edge case to verify during planning:** Are excluded-team OpEx lines ALSO flowing through `useForecastWizard.ts` into the final P&L computation? If they're double-counted there (Step 4 team + auto-team OpEx line), the fix above would fix the BudgetFramework display but the saved forecast would still double-count. (See MEMORY: `project_opex_double_count.md` — "OpEx double-counting team costs — Phase 1 fix pending, wages counted in both Team and OpEx, causes 461% budget error". This bug is the same family. Phase 50 may want to address ROOT cause — Phase 1 was deferred — or scope strictly to BudgetFramework display.)

### Risks and mitigations

- **Risk: This is the same root cause as the deferred MEMORY item `project_opex_double_count`.** Phase 50 either:
  - (a) Fixes only the BudgetFramework display → safest, smallest blast radius, but the underlying double-count still exists in the saved forecast. Operator will be confused that Step 5 BudgetFramework says one thing and Step 9 Review says another.
  - (b) Fixes the root cause across BudgetFramework AND the final P&L roll-up in `useForecastWizard.ts` and the consolidation engine. Larger blast radius but actually solves the problem.
  - **Recommendation: surface this to the operator as a planning-time decision.** Likely (b) is the right answer given the CFO-grade accuracy expectation.
- **Risk: The auto-classifier may mis-classify a non-team line as team.** If "Director's Loan" or "Subcontractor Payment" gets flagged as team, it's incorrectly subtracted. Mitigation: keep the existing `isTeamCostOverride` user toggle; verify the override is honored end-to-end.
- **Risk: A team line in OpEx with `isTeamCostOverride: false` (user explicitly says "no, this is OpEx") is correctly handled by `isLineTeamCost` returning false, so it stays in `activeOpexLines`. Verify this case in the test.**

### Test approach

```tsx
it('BudgetFramework Available OpEx subtracts auto-classified team OpEx lines from team costs', () => {
  // Setup: state with teamMembers totaling $100k; opexLines containing one line "Wages" $50k auto-classified as team.
  // Render Step5OpEx; query the "Team Costs" row in BudgetFramework.
  // Expect text content to contain $150k, not $100k.
});

it('changing a per-line OpEx value reactively updates Available OpEx in BudgetFramework', async () => {
  // Render with a $10k OpEx line. Available OpEx should be $X.
  // userEvent.clear + type a new value $15k.
  // Available OpEx should be $X - 5k within the same render.
});
```

## FCST-BUG-03: Step 7 CapEx from-plan input non-functional

### Current behavior — exact code excerpts

**File:** `src/app/finances/forecast/components/wizard-v4/steps/Step6CapEx.tsx` (despite the filename, this renders WIZARD_STEPS step 7 "CapEx" — see `WIZARD_STEPS` in types.ts:542-552 and the import comment at ForecastWizardV4.tsx:18 `// Now Step 7`).

**The "from your plan" chip handler** (Step6CapEx.tsx:113-134):
```tsx
{pendingInitiatives.length > 0 && (
  <div className="bg-purple-50 ...">
    <Lightbulb ... />
    <span>From your plan:</span>
    <div className="flex gap-2 flex-wrap">
      {pendingInitiatives.map(init => (
        <button key={init.id} onClick={() => {
          actions.addPlannedSpend({
            description: init.title,
            amount: init.estimated_cost || 0,    // ← seeds from initiative; often 0
            month: 7,
            spendType: 'one-off',
            paymentMethod: 'outright',
            initiativeId: init.id,
          });
        }} className="...">
          + {init.title}
        </button>
      ))}
    </div>
  </div>
)}
```

**The row that gets rendered after addition** (Step6CapEx.tsx:217-218):
```tsx
<td className="px-4 py-3 text-right text-sm text-gray-900">{formatCurrency(item.amount)}</td>
```

**There is NO `<input>` element bound to `item.amount` anywhere in the rendered row.** The "When", "Type", "Payment" columns all have editable selects/inputs. The "Amount" column is **read-only formatted text**.

### Root-cause hypothesis (HIGH confidence)

The user's report is exactly right: when they click "from your plan," they get a row with `amount=0` (or the initiative's `estimated_cost`, which is often 0 because operators don't always estimate per-initiative). They want to set a value but **the table doesn't expose an editable amount input for existing rows.**

The "Add Item" form (Step6CapEx.tsx:146-181) DOES have a number input for amount (line 152). But once added, the row drops back to read-only display.

This isn't strictly a "from-plan only" bug — **it affects EVERY row regardless of how added.** The from-plan path just makes it visible because that path always seeds with 0 or the initiative's stale estimate. Users who use the "Add Item" form set the value once at creation and don't notice they can't edit it later.

### Proposed fix sketch

Replace the read-only `<td>` for the Amount column with an editable input:

```tsx
// Step6CapEx.tsx:218 — current
<td className="px-4 py-3 text-right text-sm text-gray-900">{formatCurrency(item.amount)}</td>

// Replace with:
<td className="px-4 py-3 text-right">
  <div className="relative inline-flex items-center">
    <span className="absolute left-2 text-gray-400 text-sm">$</span>
    <input
      type="number"
      value={item.amount || ''}
      onChange={e => actions.updatePlannedSpend(item.id, { amount: parseFloat(e.target.value) || 0 })}
      placeholder="0"
      className="w-28 pl-6 pr-2 py-1 text-right text-sm border border-gray-200 rounded
                 focus:ring-1 focus:ring-brand-navy focus:border-brand-navy"
    />
  </div>
</td>
```

This works for both from-plan AND manually-added items. The `updatePlannedSpend` reducer already recomputes derived fields (annualDepreciation, financeMonthlyPayment, financeTotalInterest) when `amount` changes — see useForecastWizard.ts:696-712. So the cascade is already correct.

### Risks and mitigations

- **Risk: changing `amount` does NOT trigger recompute of finance fields if `paymentMethod === 'finance'`.** Looking at useForecastWizard.ts:705-708 — the recompute branch is `if (updated.paymentMethod === 'finance' && updated.financeRate && updated.financeTerm)`. So changing `amount` after setting a financeRate + financeTerm WILL recompute financeMonthlyPayment + financeTotalInterest. This is correct. No additional change needed.
- **Risk: from-plan items may want to LINK back to the initiative if the operator updates the cost (so the next sync from Annual Plan doesn't overwrite the manual edit).** Out of scope for this bug fix — the link via `initiativeId` is already there; the back-sync is a separate Phase 51/52 concern.
- **Risk: visually busier row.** Acceptable — the user explicitly wants editability.

### Test approach

```tsx
it('amount column is editable for from-plan and manual rows', async () => {
  // Render Step6CapEx with one plannedSpend (amount: 0, initiativeId: 'init-1')
  // Find amount input by role
  // userEvent.clear + type '50000'
  // Expect actions.updatePlannedSpend('item-id', { amount: 50000 }) to have been called
});

it('updating amount on a finance item recomputes monthly payment', () => {
  // Render with plannedSpend { amount: 100000, paymentMethod: 'finance', financeRate: 6, financeTerm: 60 }
  // Update amount to 200000 via the input
  // Expect financeMonthlyPayment to ~double
});
```

## FCST-BUG-04: Step 7 lease/finance treats full payment as P&L expense

### Current behavior — exact code excerpts

**Two parallel rollup sites — both have the same defect.**

**Site 1 — `getPlannedSpendPLImpact` in types.ts:298-327** (used by Step6CapEx for the per-row "P&L Impact" column):
```ts
export function getPlannedSpendPLImpact(item: PlannedSpend, yearNum: 1 | 2 | 3): number {
  let impact = 0;

  if (item.spendType === 'asset' && item.usefulLifeYears) {
    const annualDep = item.amount / item.usefulLifeYears;
    impact += yearNum === 1 ? annualDep * (13 - item.month) / 12 : annualDep;
  } else if (item.spendType === 'one-off') {
    impact += yearNum === 1 ? item.amount : 0;
  } else if (item.spendType === 'monthly') {
    impact += item.amount * 12;
  }

  // Interest expense for financed items
  if (item.paymentMethod === 'finance' && item.financeTotalInterest && item.financeTerm) {
    const yearsOfTerm = item.financeTerm / 12;
    impact += item.financeTotalInterest / yearsOfTerm;        // ← interest only — CORRECT
  }

  // Lease payments (instead of depreciation)
  if (item.paymentMethod === 'lease' && item.leaseMonthlyPayment) {
    if (item.spendType === 'asset') {
      const annualDep = item.usefulLifeYears ? item.amount / item.usefulLifeYears : 0;
      impact -= yearNum === 1 ? annualDep * (13 - item.month) / 12 : annualDep;  // remove depreciation
    }
    impact += item.leaseMonthlyPayment * 12;                  // ← FULL payment to P&L — operating-lease assumption
  }

  return Math.round(impact);
}
```

**Site 2 — Forecast P&L rollup in useForecastWizard.ts:1217-1240** (used in Step 9 Review and the saved forecast):
```ts
if (state.plannedSpends && state.plannedSpends.length > 0) {
  for (const item of state.plannedSpends) {
    if (item.spendType === 'asset' && item.paymentMethod !== 'lease') {
      plannedSpendDepreciation += item.usefulLifeYears
        ? Math.round((item.amount / item.usefulLifeYears) * (yearNum === 1 ? (13 - item.month) / 12 : 1))
        : 0;
    }
    // Interest expense for financed items
    if (item.paymentMethod === 'finance' && item.financeTotalInterest && item.financeTerm) {
      plannedSpendExpenses += Math.round(item.financeTotalInterest / (item.financeTerm / 12));
    }
    // Lease payments go to expenses
    if (item.paymentMethod === 'lease' && item.leaseMonthlyPayment) {
      plannedSpendExpenses += item.leaseMonthlyPayment * 12;     // ← FULL payment
    }
    if (item.spendType === 'one-off' && yearNum === 1) {
      plannedSpendExpenses += item.amount;
    }
    if (item.spendType === 'monthly') {
      plannedSpendExpenses += item.amount * 12;
    }
  }
}
```

**The dropdown** offering payment-method choices (Step6CapEx.tsx:236-241):
```tsx
<select value={item.paymentMethod} onChange={...}>
  <option value="outright">Outright</option>
  <option value="finance">Finance</option>     {/* Loan-financed asset */}
  <option value="lease">Lease</option>          {/* Operating lease, per current code */}
</select>
```

### Root-cause hypothesis (HIGH confidence on the bug; MEDIUM on the right fix)

**For "lease":** The code unconditionally treats the full payment as a P&L expense and removes depreciation. This is **operating-lease accounting** and it's correct IF the user means an operating lease (e.g., a true rental). It's WRONG if the user means a finance lease / capital lease (where the asset SHOULD be depreciated and only the interest portion expensed) or a chattel mortgage (where it's effectively a loan secured by the asset, not a lease at all).

**For "finance":** The code keeps the asset on books, depreciates it, AND adds the interest portion of the loan to P&L. This is **CORRECT loan-financed-asset accounting**. The principal repayments don't hit P&L (which is right). The only thing missing is that **principal repayments reduce cash but don't appear anywhere in this wizard's view** — but this wizard doesn't show cash flow, so that's a Phase 51+ concern. So **bug 4 is really only about "lease".**

**The actual bug, more precisely:** The dropdown labeled "Lease" silently means "operating lease — full payment is OpEx." Coaches in Australia routinely use finance leases (which under IFRS 16 / AASB 16 are now treated similarly to right-of-use assets) and chattel mortgages (which are loans). A coach setting up a $100k vehicle on a 60-month "lease" at $2,000/mo expects the model to show ~$20k depreciation + a small interest figure on the P&L — not $24k of "lease expense."

**Three plausible fix paths:**

#### Option A: Full taxonomy (high effort, high accuracy)
Split "lease" into `operating-lease | finance-lease`, and add a rate field for finance lease (so we can split each payment into interest + principal). For finance lease:
- Capitalize asset (depreciate over `usefulLifeYears`)
- Compute monthly principal + interest split from `amount`, `leaseTerm`, `leaseRate`
- P&L gets: depreciation + interest only
- Balance sheet (not modeled) gets: asset + lease liability

For operating lease:
- No asset, no depreciation
- P&L gets: full monthly payment × 12 (current behavior, just renamed)

For finance:
- Treat as loan (current behavior is correct)

Data model additions to `PlannedSpend`:
```ts
paymentMethod: 'outright' | 'finance' | 'operating-lease' | 'finance-lease';
leaseRate?: number;             // Implicit interest rate for finance-lease
leaseResidualValue?: number;    // Optional balloon
financeLeaseInterest?: number;  // Calculated, like financeTotalInterest
financeLeaseMonthlyInterest?: number; // First-year approximation
```

#### Option B: Relabel only (low effort, accepts simplification)
Rename "Lease" → "Operating Lease (full payment is expense)" in the dropdown. Add a help tooltip explaining "if you're using a finance lease or chattel mortgage, choose Finance instead and enter the loan terms." No math changes; "lease" remains operating-lease semantics; "finance" path is the catch-all for capital-lease-like treatment.

This trades accounting precision for simplicity — and matches the MEMORY directive about target users being "not numbers people."

#### Option C: Hybrid (medium effort)
Keep the three-option dropdown but add a **term + interest-rate input** to the Lease expansion panel (analogous to Finance). When term + rate are set, treat as finance lease (depreciate + interest); when term alone is set with no rate, treat as operating lease (full payment expense). This gives both behaviors without forcing the user to understand the taxonomy.

**Recommendation: present Option A and Option B to the operator as a planning-time decision.** Both are buildable; the choice is product, not technical.

### Proposed fix sketch (assuming Option A is chosen)

In `getPlannedSpendPLImpact` (types.ts) — replace the lease branch:
```ts
if (item.paymentMethod === 'operating-lease' && item.leaseMonthlyPayment) {
  // No depreciation; full payment hits P&L as operating lease expense
  // (asset depreciation, if any, was already added — undo it)
  if (item.spendType === 'asset' && item.usefulLifeYears) {
    const annualDep = item.amount / item.usefulLifeYears;
    impact -= yearNum === 1 ? annualDep * (13 - item.month) / 12 : annualDep;
  }
  impact += item.leaseMonthlyPayment * 12;
}

if (item.paymentMethod === 'finance-lease' && item.leaseRate && item.leaseTerm) {
  // Capitalize: depreciation is already in `impact` from the spendType==='asset' branch above
  // Add interest portion only — approximated via straight-line interest split
  const totalPayments = (item.leaseMonthlyPayment || 0) * item.leaseTerm;
  const totalInterest = totalPayments - item.amount;
  const yearsOfTerm = item.leaseTerm / 12;
  impact += totalInterest / yearsOfTerm;
}
```

Mirror the same change in `useForecastWizard.ts:1217-1240`.

UI: replace the single "Lease" select option with two; add `leaseRate` input to the lease expansion panel when `finance-lease` is selected.

Migration: existing forecasts have `paymentMethod === 'lease'`. **Treat existing 'lease' as 'operating-lease'** (current behavior preserved). Add a one-time migration in the deserializer (`useForecastWizard.ts:130-145` already has a backward-compat block for legacy `capexItems` → `plannedSpends`; extend it).

### Risks and mitigations

- **Risk: existing saved forecasts with `paymentMethod: 'lease'` will continue to render with operating-lease math.** Mitigation: alias `'lease'` to `'operating-lease'` in the serializer/deserializer. No display change for these. Document in MEMORY that the old-name handling is deliberate.
- **Risk: changing the math changes displayed numbers for forecasts that ARE finance leases.** Operator must manually re-categorize them. Add a one-time banner in Step 6/7: "Your CapEx model now distinguishes operating lease from finance lease. Please review any items currently marked as Lease."
- **Risk: data model bloat — new fields `leaseRate`, `leaseResidualValue`, etc.** Acceptable; all optional.
- **Risk: the wizard's UX for lease is already cramped (one row, finance vs lease panels in expanded section). Adding more inputs may need design love.** Defer minor UX polish to Phase 51.
- **Risk: the existing `getPlannedSpendPLImpact` is also called from Step6CapEx render — must update the per-row "P&L Impact" column AND the totals.** Already covered by changing the function in one place.
- **Riskiest unknown: are there other call sites for plannedSpends in the consolidation engine, save-and-materialize, or report generators?** Worth a grep during planning. If yes, those need parallel updates.

### Test approach

Pure unit tests on `getPlannedSpendPLImpact` and the equivalent block in `useForecastWizard.ts`:
```ts
describe('getPlannedSpendPLImpact — finance lease vs operating lease', () => {
  it('operating lease: full payment is P&L expense, no depreciation', () => {
    const item = { spendType: 'asset', amount: 100000, usefulLifeYears: 5, month: 7,
                   paymentMethod: 'operating-lease', leaseMonthlyPayment: 2000, leaseTerm: 60 };
    expect(getPlannedSpendPLImpact(item, 1)).toBe(24000);  // 2000 × 12, no dep
  });

  it('finance lease: depreciation + interest only, NOT full payment', () => {
    // $100k asset, 60-month lease at implicit 6% rate, $1933/mo (≈ loan PMT)
    const item = { spendType: 'asset', amount: 100000, usefulLifeYears: 5, month: 7,
                   paymentMethod: 'finance-lease', leaseMonthlyPayment: 1933, leaseTerm: 60,
                   leaseRate: 6 };
    // Annual depreciation: 100000/5 = 20000; year 1 = 20000 (full year if month=7 == FY start)
    // Total interest: 1933*60 - 100000 = 15980; per year: 15980/5 = 3196
    // Expected P&L impact: 20000 + 3196 = 23196 (very close to operating but with split)
    expect(getPlannedSpendPLImpact(item, 1)).toBeCloseTo(23196, -2);  // ±100 rounding
  });

  it('finance (loan-financed asset): depreciation + interest only', () => {
    // Existing behavior — regression-lock
    const item = { spendType: 'asset', amount: 100000, usefulLifeYears: 5, month: 7,
                   paymentMethod: 'finance', financeTerm: 60, financeRate: 6,
                   financeMonthlyPayment: 1933, financeTotalInterest: 15980 };
    expect(getPlannedSpendPLImpact(item, 1)).toBeCloseTo(23196, -2);
  });
});
```

CI catches regression. The numbers above use $100k/60mo/6% as the canonical example matching the PHASE.md success criterion.

## Cross-cutting: decomposition recommendation

**Recommended: 2 plans.**

### Plan 50-01: Bugs 1, 2, 3 (small/mechanical fixes)
- All three are localized, single-file changes
- Bugs 1 + 3 are pure UI input fixes (both ~20 lines diff)
- Bug 2 is one calculation-aggregation fix (~30 lines including the data flow into BudgetFramework)
- All three CI-catchable with unit + light RTL tests
- Single PR, low blast radius

### Plan 50-02: Bug 4 (lease/finance accounting)
- Requires operator product decision FIRST (Option A full taxonomy / Option B relabel-only / Option C hybrid)
- Likely additive data-model change to `PlannedSpend`
- Requires updates to TWO P&L roll-up sites (types.ts + useForecastWizard.ts)
- Migration story for existing forecasts (alias old `'lease'` value)
- Likely a one-time banner for operators with existing forecasts
- Larger PR, medium blast radius
- Should NOT be merged with 50-01 — different review profile, different risk class

### Why NOT one plan with four tasks
Bug 4 alone could blow up scope. If the operator chooses Option A, that's already 3-4 tasks (data model, `getPlannedSpendPLImpact` fix, `useForecastWizard.ts` rollup fix, UI lease/finance-lease split, regression tests). Mixing with bugs 1-3 would push the PR past the "review in 30 minutes" threshold.

### Why NOT four plans (one per bug)
Bugs 1, 2, 3 share the same review surface (forecast wizard files) and same test patterns. Splitting them would multiply ceremony for no risk reduction. Phase 46-style atomic plans aren't justified here because the bugs aren't independent enough to be parallelizable across humans.

### Operator decision needed BEFORE Plan 50-02 starts
- Choice of Option A / B / C for lease/finance taxonomy
- Whether Plan 50-01 should ALSO fix the BudgetFramework double-count root cause (`project_opex_double_count` from MEMORY) or just the display layer

## Cross-cutting: existing test infrastructure

- **Vitest + jsdom + @testing-library/react** is set up. Config: `vitest.config.ts` (root). Setup: `src/__tests__/setup.ts`.
- **Existing forecast tests:**
  - `src/__tests__/forecast/initialize-from-xero-target-aware.test.ts` — Phase 44.3 hook tests using `renderHook` from `@testing-library/react`. Pattern to copy for `useForecastWizard` reducer tests.
  - `src/__tests__/components/Step3RevenueCOGS.test.tsx` — exists but is **all `it.todo` placeholders**. No actual rendering harness yet. Phase 50 Plan 50-01 will need to write the harness.
  - `src/__tests__/services/opex-classifier.test.ts` — pure unit tests on the classifier; relevant for confirming bug 2 doesn't break classification logic.
- **No existing RTL test for Step5OpEx, Step6CapEx, or Step7Other.** Phase 50 will add these.
- **TDD pattern used in Phase 44.3:** Task 1 = write failing tests; subsequent tasks = make them pass; PLAN-CHECK ensures alignment. Same shape will work here.
- **Note: there are duplicate test files (`*.test 2.ts` etc.) in the forecast tests folder — these are macOS Finder dupes. Plan should clean these up incidentally.**

## Cross-cutting: risk per bug — CI sufficiency

| Bug | CI Catches Regression? | Confidence | Notes |
|-----|------------------------|-----------|-------|
| **FCST-BUG-01** | ✅ YES | HIGH | RTL `userEvent.type` test asserts state value after keystroke sequence. Pure component test, deterministic. |
| **FCST-BUG-02** | ✅ YES | HIGH | RTL test renders Step5 with seeded state, asserts BudgetFramework numbers. Reactivity assertion needs `userEvent` + re-query. |
| **FCST-BUG-03** | ✅ YES | HIGH | RTL `userEvent.click` + `userEvent.type` asserts `actions.updatePlannedSpend` called with new amount. |
| **FCST-BUG-04** | ⚠️ PARTIAL | MEDIUM | Pure unit tests on `getPlannedSpendPLImpact` and `useForecastWizard` rollup will catch math regressions. **But** the UI dropdown change + migration (alias `'lease'` → `'operating-lease'`) needs an integration test to confirm legacy forecasts still render. **AND** the operator should eyeball one real forecast post-deploy to confirm the numbers match a hand calc. |

**Flag for planner:** Bug 4's migration is the highest-risk-of-silent-regression item. The unit tests will pass even if the deserializer alias is wrong, because unit tests use freshly-constructed `PlannedSpend` objects. Need an integration test that loads a real serialized forecast with `paymentMethod: 'lease'` and asserts the computed P&L matches expected operating-lease behavior.

## Cross-cutting: rollback per bug

| Bug | Rollback | Side Effects |
|-----|----------|--------------|
| **FCST-BUG-01** | Revert PR. Inputs return to text-with-toLocaleString display. Bug returns. | None. State stored is identical (numbers). |
| **FCST-BUG-02** | Revert PR. BudgetFramework returns to under-reporting team costs. Bug returns. | If Plan 50-01 also fixed the root double-count in `useForecastWizard.ts` rollup, reverting could ALSO change displayed P&L for existing forecasts saved during the fixed window. Mitigation: keep Plan 50-01 strictly to the display layer (BudgetFramework only); defer P&L rollup fix to a separate phase if it's larger than 30 lines. |
| **FCST-BUG-03** | Revert PR. Amount column returns to read-only. Bug returns. | None. Existing rows keep their amounts. |
| **FCST-BUG-04** | Revert PR. **Lease/finance reverts to the WRONG (current) behavior.** Existing forecasts that were saved during the new-math window keep their per-forecast state (no shared global state changed). | Operator may need to manually re-review CapEx assumptions on forecasts created during the bug window. Likely a 1-banner UX recovery. **Important:** the migration alias (`'lease'` → `'operating-lease'`) should be additive — DON'T mutate existing saved data, just interpret the old value at read time. Then revert is safe. |

## Cross-cutting: operator product decisions surfaced

These are decisions the operator should make BEFORE the planner drafts plans. They aren't research tasks — they're product calls.

1. **(Bug 2) Scope: BudgetFramework display only, OR also fix the underlying P&L rollup double-count?**
   - Display-only: smaller PR, faster ship, but Step 5 BudgetFramework will say one thing and Step 9 Review will say another. Operator confusion possible.
   - Both: bigger PR, addresses the deferred MEMORY item `project_opex_double_count`, eliminates downstream confusion. Recommended given CFO-grade accuracy bar.

2. **(Bug 4) Lease/finance taxonomy approach:**
   - **Option A — Full taxonomy** (`outright | finance | operating-lease | finance-lease`): adds new data model fields, new math, new UI for finance-lease rate input. Highest accuracy. Larger PR.
   - **Option B — Relabel only**: rename "Lease" → "Operating Lease (full payment is expense)" with help tooltip. No math changes. Tiny PR. Trades accounting precision for simplicity. Aligns with "target user is not a numbers person."
   - **Option C — Hybrid**: keep three options, but add rate input to lease panel; presence of rate switches to finance-lease math. Medium complexity, no taxonomy explosion. Probably best ratio of value-to-complexity if "simplicity" isn't paramount.
   - **My recommendation: ask the operator. The MEMORY-stated design philosophy points at Option B; the CFO-grade accuracy expectation points at Option A or C.**

3. **(Bug 4) Backward-compat handling for existing 'lease' value:**
   - Alias `'lease'` → `'operating-lease'` at read time? (Recommended — no data mutation, no migration script needed.)
   - Show a one-time banner on Step 6/7 prompting review of existing lease items? (Recommended — alerts coaches that math may change for items they intended as finance leases.)

4. **(Bug 1) Display formatting trade-off:**
   - Switch all 3 sites to `type="number"` (no commas during typing)? Faster fix.
   - Use focused-text + blurred-formatted hybrid (commas while not focused)? More complex, prettier.
   - Likely Option A (no commas) is fine given small column width.

## Plan-ready signals

Bullets the planner can lift directly:

- **Bug 1 fix is 3-call-site mechanical change** at `Step3RevenueCOGS.tsx:805, 1059, 1192`. Switch `type="text" + value={x.toLocaleString()}` to `type="number" + value={x || ''}`. ~12 lines diff. Plus 2 RTL tests in new `Step3RevenueCOGS.test.tsx` (replace `it.todo` placeholders).
- **Bug 2 fix is in `Step5OpEx.tsx`** — sum `excludedTeamLines` × `calculateY1Amount` and add to `year1TeamCosts` before passing to `BudgetFramework`. Decision needed: also fix the same root cause in `useForecastWizard.ts` rollup (line 1200-1245 area) where it's likely also double-counted. Surface to operator.
- **Bug 3 fix is one-`<td>` swap** at `Step6CapEx.tsx:218`. Replace `formatCurrency(item.amount)` with editable `<input type="number">` bound to `actions.updatePlannedSpend(item.id, { amount: ... })`. Existing reducer (`useForecastWizard.ts:696-712`) already cascades to derived fields. ~10 lines diff.
- **Bug 4 fix has TWO mirrored sites** that must change in lockstep: `types.ts:298 getPlannedSpendPLImpact()` AND `useForecastWizard.ts:1217-1240` (the embedded rollup). Both have the lease branch that needs splitting. Easy to miss the second site if the planner only reads the component.
- **Bug 4 is the riskiest.** Bug 4 needs a migration alias (`'lease'` → `'operating-lease'`) for existing forecasts; needs an integration test loading a serialized old forecast, not just unit tests; needs an operator UX banner.
- **Existing test harness is `vitest + jsdom + @testing-library/react`.** `Step3RevenueCOGS.test.tsx` exists with `it.todo` stubs. `initialize-from-xero-target-aware.test.ts` is the gold-standard pattern for hook tests in this area (Phase 44.3).
- **MEMORY signal:** `project_opex_double_count.md` flags the same root cause as Bug 2 ("Phase 1 fix pending, wages counted in both Team and OpEx, causes 461% budget error"). Phase 50 should either explicitly close this MEMORY item or explicitly defer it. Don't leave it dangling.

## Sources

### Primary (HIGH confidence)
- `src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx` (lines 525-543, 803-810, 1058-1064, 1152-1160, 1191-1199) — Bug 1 site
- `src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx` (lines 33-167, 636-647, 767-797, 929-934, 1018-1025) — Bug 2 site
- `src/app/finances/forecast/components/wizard-v4/steps/Step6CapEx.tsx` (lines 113-134, 199-250) — Bug 3 site
- `src/app/finances/forecast/components/wizard-v4/types.ts` (lines 256-327) — `PlannedSpend` shape + `getPlannedSpendPLImpact` (Bug 4 site 1)
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (lines 686-719, 1200-1245) — Reducers + P&L rollup (Bug 4 site 2)
- `.planning/phases/44.3-forecast-step3-target-wiring/44.3-01-SUMMARY.md` — Phase 44.3 fix pattern
- `src/__tests__/forecast/initialize-from-xero-target-aware.test.ts` — Test harness reference
- `src/__tests__/components/Step3RevenueCOGS.test.tsx` — Existing (empty) test placeholder
- `vitest.config.ts` — Test runtime config
- MEMORY: `project_opex_double_count.md`, `feedback_testing.md`, `user_design_philosophy.md`

### Secondary (MEDIUM confidence)
- React docs on controlled inputs (`https://react.dev/reference/react-dom/components/input`) — supports the bug 1 round-trip diagnosis
- AASB 16 / IFRS 16 lease accounting (Australian standard) — supports the operating-lease vs finance-lease distinction in bug 4

### Tertiary (LOW confidence)
- None — all bug claims verified by reading source.

## Metadata

**Confidence breakdown:**
- Bug 1 diagnosis: HIGH — code is unambiguous, mechanism is well-known controlled-input bug
- Bug 1 fix: HIGH — Option A is one line per site
- Bug 2 diagnosis: HIGH — data flow traced end-to-end through BudgetFramework
- Bug 2 fix: MEDIUM — display fix is HIGH confidence; root-cause fix scope is operator-decided
- Bug 3 diagnosis: HIGH — no input element exists in the table for amount
- Bug 3 fix: HIGH — one-`<td>` swap, reducer already supports the cascade
- Bug 4 diagnosis: HIGH — both rollup sites read identically; lease branch is full-payment expense
- Bug 4 fix: MEDIUM — three viable approaches; choice is product-not-technical; migration story matters

**Research date:** 2026-05-02
**Valid until:** 2026-06-01 (stable wizard area, but Phase 51/52 are queued behind Phase 50 — research may be invalidated if 51/52 lands first)
