# Task 07 — Rollup math: subscriptions field + accountCode exclusion in OpEx accumulator + YearlySummary type field

**Ship batch:** B2 (Rollup math + type field, no-op for legacy) · **Wave:** 2 · **Dependencies:** T01, T02 · **Risk:** **HIGH** (rollup math regression)

## Goal

Update `useForecastWizard.ts` `summary` `useMemo` to:
1. Compute `summary.year{N}.subscriptions = Σ(active vendor monthlyBudget × 12) × (1 + defaultOpExIncreasePct/100)^(N-1)`
2. Build a `coveredAccountCodes: Set<string>` from `state.subscriptions[*].accountCodes` for active vendors
3. In the existing OpEx accumulator (`useForecastWizard.ts:1326-1390`), skip lines whose `accountCode` ∈ `coveredAccountCodes`
4. Subtract `subscriptions` from net profit alongside `opex` and `teamCosts`

Also add `YearlySummary.subscriptions: number` to `types.ts` so the math compiles. **The type field ships in this task with the rollup math (B2). The Step8Review consumer code that reads it ships with T08 in B4.**

This is the math change that prevents double-counting and makes Phase 57 actually feed subscriptions into the P&L. **It is a no-op for legacy forecasts** — existing forecasts have `state.subscriptions === []`, so `coveredAccountCodes` is empty, so OpEx accumulator behavior is identical, so net profit is unchanged. Subscriptions field on summary is 0. This is what makes B2 safe to ship before B3 swaps the actual wizard steps.

## Why this is HIGH risk

This is the line in the codebase that determines forecast P&L for every saved forecast. A bug here:
- Silently changes net profit on every existing forecast
- Could double-count even worse than today (e.g., if the Set check is inverted)
- Could under-count if the Y2/Y3 growth formula is wrong

Mitigations: comprehensive unit tests + JDS regression run in T16 + ship batch B2 (separate from UI changes so any regression is bisectable).

## Files modified

- `src/app/finances/forecast/components/wizard-v4/types.ts` (~3 lines)
  - Add `subscriptions: number` to `YearlySummary` interface
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (~50 lines)
  - Inside the `summary` `useMemo` (~line 1158-1495), inside `calculateYearSummary(yearNum)`:
    - Before the existing OpEx accumulator: compute `subscriptions` and `coveredAccountCodes`
    - Modify the OpEx `reduce` to skip covered lines
    - Add `subscriptions` to the returned `YearSummary` object
    - Subtract `subscriptions` from `netProfit`
- `src/__tests__/forecast/phase-57-subscription-rollup.test.ts` (new, ~120 lines)
- `src/__tests__/forecast/phase-57-double-count-prevention.test.ts` (new, ~80 lines)

## Implementation notes

### The math

Inside `calculateYearSummary(yearNum)`, BEFORE the existing `const opex = state.opexLines.reduce(...)` block:

```typescript
// Phase 57: Subscriptions feed the rollup. Y1 = sum of active monthly × 12.
// Y2/Y3 grow by defaultOpExIncreasePct (CONTEXT.md: no per-vendor Y2/Y3 fields).
const defaultIncrease = state.defaultOpExIncreasePct || 3;
const activeSubs = state.subscriptions.filter(v => v.isActive);
const year1Subscriptions = activeSubs.reduce((sum, v) => sum + (v.monthlyBudget || 0) * 12, 0);
const subscriptionGrowthFactor = Math.pow(1 + defaultIncrease / 100, yearNum - 1);
const subscriptions = year1Subscriptions * subscriptionGrowthFactor;

// Build the set of accountCodes covered by Step 5. OpEx lines whose accountCode
// is in this set are EXCLUDED from the OpEx rollup (their dollar contribution
// is replaced by the subscriptions bucket above). This prevents the
// pre-Phase-57 double-count where the same Xero software account contributed
// to both opex and subscriptions.
const coveredAccountCodes = new Set<string>();
for (const v of activeSubs) {
  for (const code of (v.accountCodes || [])) {
    if (typeof code === 'string' && code.trim()) {
      coveredAccountCodes.add(code.trim());
    }
  }
}
```

Then modify the existing OpEx accumulator (`useForecastWizard.ts:1326`):

```typescript
const opex = state.opexLines.reduce((sum, line) => {
  if (line.isOneTime && line.oneTimeYear && line.oneTimeYear !== yearNum) return sum;
  if (line.startYear && line.startYear > yearNum) return sum;
  if (shouldExcludeFromOpEx(line)) return sum;

  // Phase 57 — skip lines covered by Step 5 Subscriptions.
  // ONLY accountCode-based exclusion (no name fallback). For legacy drafts
  // where accountCode is undefined, the line falls through and contributes
  // to opex — accepting silent double-count for unrefreshed legacy forecasts
  // (R6 mitigation is the "Refresh from Xero" nudge banner in Step 6, T11).
  if (line.accountCode && coveredAccountCodes.has(line.accountCode)) {
    return sum;
  }

  // ... existing switch on costBehavior ...
}, 0);
```

Update the returned object:

```typescript
return {
  revenue: Math.round(revenue),
  cogs: Math.round(cogs),
  grossProfit: Math.round(grossProfit),
  grossProfitPct: Math.round(grossProfitPct * 10) / 10,
  teamCosts: Math.round(teamCosts),
  subscriptions: Math.round(subscriptions),  // NEW
  opex: Math.round(opex),
  depreciation: Math.round(finalDepreciation),
  investments: Math.round(finalInvestments),
  otherExpenses: Math.round(otherExpenses),
  otherIncome: Math.round(xeroOtherIncome),
  xeroOtherExpense: Math.round(xeroOtherExpense),
  netProfit: Math.round(netProfit),
  netProfitPct: Math.round(netProfitPct * 10) / 10,
};
```

And update the netProfit computation to subtract subscriptions:

Find the line (~useForecastWizard.ts:1465ish, before the return):
```typescript
const netProfit = grossProfit
  - teamCosts
  - opex
  - finalDepreciation
  - finalInvestments
  + xeroOtherIncome
  - xeroOtherExpense;
```

Change to:
```typescript
const netProfit = grossProfit
  - teamCosts
  - subscriptions   // Phase 57 — subscriptions are now their own bucket
  - opex
  - finalDepreciation
  - finalInvestments
  + xeroOtherIncome
  - xeroOtherExpense;
```

### YearlySummary type addition (ships with T07 in B2)

In `types.ts:828-845`:
```typescript
export interface YearlySummary {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossProfitPct: number;
  teamCosts: number;
  /** Phase 57: forecasted subscription spend (Σ active vendors × 12 × growth^(N-1)). */
  subscriptions: number;  // NEW — required, defaults to 0 from rollup math
  opex: number;
  depreciation: number;
  // ... rest unchanged ...
}
```

### Tests

Tests parameterize the growth percent to track operator overrides — when a forecast has `state.defaultOpExIncreasePct = 5`, Y2 = Y1 × 1.05, not Y1 × 1.03.

`src/__tests__/forecast/phase-57-subscription-rollup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
// import the hook + a way to seed state

describe('Phase 57 subscription rollup', () => {
  it('Y1 subscriptions = Σ(active monthly × 12)', () => {
    // Seed state.subscriptions = [
    //   { vendorKey: 'a', monthlyBudget: 100, isActive: true, accountCodes: ['5100'] },
    //   { vendorKey: 'b', monthlyBudget: 200, isActive: true, accountCodes: ['5200'] },
    //   { vendorKey: 'c', monthlyBudget: 50,  isActive: false, accountCodes: ['5300'] }, // inactive — excluded
    // ]
    // Expect summary.year1.subscriptions === 3600  (100+200) * 12
  });

  it('Y2 subscriptions = Y1 × (1 + state.defaultOpExIncreasePct / 100)', () => {
    // With state.defaultOpExIncreasePct = 3, Y1 = 3600 → Y2 = 3708
    // With state.defaultOpExIncreasePct = 5 (operator override), Y1 = 3600 → Y2 = 3780
    // Verify both fixtures so the test catches a hard-coded 1.03.
  });

  it('Y3 subscriptions = Y1 × (1 + state.defaultOpExIncreasePct / 100)^2', () => {
    // With pct=3, 3600 * 1.03^2 = 3818.88 → rounded 3819
    // With pct=5, 3600 * 1.05^2 = 3969 → rounded 3969
  });

  it('subscriptions field is rounded', () => {
    // Assert summary.year1.subscriptions is an integer (Math.round applied)
  });

  it('netProfit subtracts subscriptions', () => {
    // Compute manually: revenue 100k, cogs 30k, GP 70k, team 20k, opex 10k, subs 5k → np = 35k
    // Verify summary.year1.netProfit === 35000
  });

  it('empty subscriptions produces 0 — no crash', () => {
    // state.subscriptions = []; expect summary.year1.subscriptions === 0
  });
});
```

`src/__tests__/forecast/phase-57-double-count-prevention.test.ts`:

```typescript
describe('Phase 57 double-count prevention', () => {
  it('OpEx skips lines whose accountCode is in coveredAccountCodes', () => {
    // state.subscriptions = [{ ..., accountCodes: ['5100'], monthlyBudget: 200 }]
    // state.opexLines = [
    //   { id: 'a', accountCode: '5100', costBehavior: 'fixed', monthlyAmount: 200 },  // covered → 0 contribution
    //   { id: 'b', accountCode: '5200', costBehavior: 'fixed', monthlyAmount: 100 },  // not covered → 1200 contribution
    // ]
    // Expect summary.year1.opex === 1200 (NOT 1200 + 2400 = 3600)
    // Expect summary.year1.subscriptions === 2400
    // Total bottom-line spend on these accounts === 3600 (no double-count)
  });

  it('Falls through to no-exclusion when OpExLine.accountCode is undefined (legacy)', () => {
    // state.opexLines = [{ accountCode: undefined, costBehavior: 'fixed', monthlyAmount: 200 }]
    // Expect that line contributes to opex (no skip — we don't have a code to match)
    // This is the documented R6 behavior: legacy forecasts double-count silently
    // until the operator runs the "Refresh from Xero" nudge in Step 6 (T11).
  });

  it('Falls through to no-exclusion when subscription has empty accountCodes', () => {
    // Subscription with accountCodes: [] → coveredAccountCodes empty → no exclusions
  });

  it('Inactive subscriptions do NOT contribute to coveredAccountCodes', () => {
    // Inactive vendor with accountCodes: ['5100'] → OpEx line 5100 still contributes
  });
});
```

## Acceptance criteria

- [ ] `summary.year{N}.subscriptions` populated for N=1,2,3 with correct math
- [ ] OpEx accumulator skips lines whose accountCode is in any active subscription's accountCodes
- [ ] netProfit subtracts subscriptions
- [ ] **All 6 rollup tests pass — including the parameterized growth test that verifies BOTH `defaultOpExIncreasePct=3` AND `defaultOpExIncreasePct=5` (no hard-coded 1.03 in tests)**
- [ ] All 4 double-count prevention tests pass
- [ ] **Until `needsAccountCodeRefresh === false` on a draft, the rollup uses ONLY `coveredAccountCodes` matching (no name fallback). Legacy unrefreshed forecasts silently double-count software accounts — this is documented behavior; the mitigation is the T11 "Refresh from Xero" nudge banner in Step 6.**
- [ ] `YearlySummary.subscriptions: number` added to `types.ts` (ships in this task with the rollup math, B2)
- [ ] `npm run build` clean
- [ ] On a forecast with `state.subscriptions === []`, `summary.year1.subscriptions === 0` and OpEx accumulator behavior is identical to pre-Phase-57 (regression test against existing forecasts — confirms B2 is no-op for legacy)

## Regression risks

- **R2 from PLAN.md risk register:** existing forecasts may have OpEx lines covering subscription accounts AND subscription_budgets rows for the same accounts. After Phase 57 they will NOT double count (correct), but the historical net profit number changes. **The change is the bug fix.** T16 (JDS QA) verifies the delta is explainable: pre-Phase-57 `opex` included $X of software lines; post-Phase-57 `opex` excludes those AND `subscriptions` adds $X. Net is zero if the operator hadn't started budgeting subs in Step 6 yet, OR is the gap between historical-software-spend and operator-budgeted-vendor-sum (Δ explained by Step 5's "trust the operator" semantics).
- **R6 silent legacy double-count:** legacy forecasts where opexLines lack accountCode will continue to double-count software spend until the operator clicks "Refresh from Xero" in Step 6 (T11 banner). Accepted as documented behavior — this task does NOT add a name-based fallback.
- **defaultOpExIncreasePct of 0:** results in 1.0^N = 1.0 — no growth. Acceptable.
- **Trim/case sensitivity:** account codes are typically uppercase numeric strings ("5100"). The code does `.trim()` but not case-normalize. If Xero returns mixed case (rare), add `.toUpperCase()` defensively.

## Estimated effort

1.0 day (math + 10 unit tests + careful review).
