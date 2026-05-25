# Task 15 — Rewrite Excel Subscriptions tab to read `state.subscriptions`

**Ship batch:** B5 (Cleanup) · **Wave:** 6 · **Dependencies:** T02 · **Risk:** LOW

## Goal

The Excel export's "Subscriptions" tab currently filters `opexLines` by the dead `isSubscription` flag (`ExcelExport.tsx:360`) and produces an empty tab on every forecast. After Phase 57 there's a real source of truth: `state.subscriptions`. Rewrite the tab to read from there.

Per CONTEXT.md (line 49): "Rewrite Excel Subscriptions tab to read from new state.subscriptions field (currently filters by dead isSubscription flag and produces an empty tab)."

## Files modified

- `src/app/finances/forecast/components/wizard-v4/components/ExcelExport.tsx` (~50 lines)
  - **Line ~360:** replace `subLines = opexLines.filter(l => l.isSubscription)` with `subLines = state.subscriptions.filter(v => v.isActive)`
  - **Line 372:** "Run the Subscription Audit in Step 6 of the forecast wizard" → "Run the Subscription Audit in Step 5 of the forecast wizard"
  - Update the tab's column structure to match `VendorBudget` shape (vendorName, frequency, monthlyBudget, accountCodes, etc.) instead of `OpExLine`
  - Update header rows + formulas accordingly

## Implementation notes

### Find the existing tab construction

In ExcelExport.tsx, search for `Subscriptions` and the tab/sheet construction. Likely structure:

```typescript
// Existing — pre-Phase-57
const subSheet = workbook.addWorksheet('Subscriptions');
subSheet.columns = [
  { header: 'Description', key: 'description' },
  { header: 'Annual Amount', key: 'annual' },
  // ...
];
const subLines = opexLines.filter(l => l.isSubscription);
subLines.forEach(line => subSheet.addRow({
  description: line.accountId,
  annual: line.monthlyAmount * 12,
}));
if (subLines.length === 0) {
  subSheet.addRow({ description: 'Run the Subscription Audit in Step 6 of the forecast wizard.' });
}
```

### Rewrite

```typescript
const subSheet = workbook.addWorksheet('Subscriptions');
subSheet.columns = [
  { header: 'Vendor', key: 'vendorName', width: 30 },
  { header: 'Category', key: 'category', width: 20 },
  { header: 'Frequency', key: 'frequency', width: 15 },
  { header: 'Monthly Budget', key: 'monthlyBudget', width: 15, style: { numFmt: '$#,##0' } },
  { header: 'Annual Budget (Y1)', key: 'annualY1', width: 18, style: { numFmt: '$#,##0' } },
  { header: 'Annual Budget (Y2)', key: 'annualY2', width: 18, style: { numFmt: '$#,##0' } },
  { header: 'Annual Budget (Y3)', key: 'annualY3', width: 18, style: { numFmt: '$#,##0' } },
  { header: 'Account Codes', key: 'accountCodes', width: 20 },
];

const activeSubs = state.subscriptions.filter(v => v.isActive);
const growthFactor = (year: 2 | 3) => Math.pow(1 + (state.defaultOpExIncreasePct ?? 3) / 100, year - 1);

if (activeSubs.length === 0) {
  subSheet.addRow({
    vendorName: 'No subscriptions configured.',
    category: 'Run the Subscription Audit in Step 5 of the forecast wizard.',
  });
} else {
  for (const v of activeSubs) {
    const annualY1 = (v.monthlyBudget || 0) * 12;
    subSheet.addRow({
      vendorName: v.vendorName,
      category: v.category ?? '',
      frequency: v.frequency,
      monthlyBudget: v.monthlyBudget,
      annualY1,
      annualY2: annualY1 * growthFactor(2),
      annualY3: annualY1 * growthFactor(3),
      accountCodes: (v.accountCodes ?? []).join(', '),
    });
  }
  // Total row
  subSheet.addRow({});
  subSheet.addRow({
    vendorName: 'Total',
    annualY1: activeSubs.reduce((s, v) => s + (v.monthlyBudget || 0) * 12, 0),
    annualY2: activeSubs.reduce((s, v) => s + (v.monthlyBudget || 0) * 12 * growthFactor(2), 0),
    annualY3: activeSubs.reduce((s, v) => s + (v.monthlyBudget || 0) * 12 * growthFactor(3), 0),
  });
}
```

### Header text update

Line 372 specifically: change "Step 6" → "Step 5".

### Drop the `isSubscription` filter — and audit other uses

```bash
grep -rn "isSubscription" src/app/finances/forecast/
```

Hits in research:
- `Step8GrowthPlan.tsx:327-335` (subscription keyword detection) — this MIGHT use isSubscription as a check; review and decide whether to swap to `state.subscriptions` lookup
- The `OpExLine.isSubscription` field on the type itself — leave for back-compat (research recommendation R7) but stop reading

For Step8GrowthPlan, if it currently filters subscription lines for the growth view, switch to:
```typescript
const subscriptionLines = state.subscriptions.filter(v => v.isActive);
```

This is a small bonus cleanup. If it's complex, defer to Phase 58.

## Acceptance criteria

- [ ] Excel Subscriptions tab shows real vendor data: vendor name, frequency, monthly budget, annual Y1/Y2/Y3, account codes
- [ ] Empty-state message reads "Run the Subscription Audit in Step 5..." (not Step 6)
- [ ] Growth applied for Y2/Y3 uses `state.defaultOpExIncreasePct` (parameterized — NOT hard-coded 3%). Test acceptance: with `defaultOpExIncreasePct = 5`, Y2 = Y1 × 1.05, Y3 = Y1 × 1.05². The growthFactor helper must read from state, not from a literal 1.03.
- [ ] Total row at bottom of vendor list
- [ ] No new tsc errors
- [ ] Manual: download Excel for a forecast with vendors, open in Excel/Numbers, verify Subscriptions tab is populated

## Regression risks

- **Other consumers of `OpExLine.isSubscription`:** the research notes Step8GrowthPlan filters by it. If those filters break (return empty), the growth-plan view shows no subscriptions in its own list. Mitigation: switch those readers to `state.subscriptions` in this task or a sibling cleanup. If too tangled, accept "growth plan shows no sub-keyword OpEx lines" temporarily — it currently shows none anyway because nothing writes the flag.
- **Excel structure breakage:** if ExcelExport has cell-reference formulas pointing to specific Subscriptions tab cells (e.g., a Summary tab `=Subscriptions!B5`), the rewrite breaks them. Audit before changing column order.

## Estimated effort

0.5 day.
