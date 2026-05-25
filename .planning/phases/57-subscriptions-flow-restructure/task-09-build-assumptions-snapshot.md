# Task 09 — Populate `forecast_assumptions.subscriptions` snapshot in `buildAssumptions`

**Ship batch:** B4 (Subscription UX) · **Wave:** 5 · **Dependencies:** T07 · **Risk:** LOW

## Goal

When a forecast is saved, write the current vendor list and totals to `forecast_assumptions.subscriptions` (a JSON field that already exists in the schema but is never populated today). This makes the forecast self-contained — a year from now an operator can open the saved forecast and see exactly what subscriptions were assumed at save time, even if the live `subscription_budgets` table has drifted.

## Why this matters

`subscription_budgets` is the live source of truth for the BUSINESS — there's no per-forecast versioning. If Matt approves a Q2 forecast assuming $4k/mo of subscriptions, then in Q3 the operator adds 5 new vendors, the saved Q2 forecast still references the live row → the saved Q2 net profit silently changes.

CONTEXT.md (line 38): "populate `forecast_assumptions.subscriptions` (field exists in schema today, never written) during `buildAssumptions`. `subscription_budgets` table remains the live source of truth; the JSON snapshot is the at-save-time copy for self-contained forecasts."

## Files modified

- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (~30 lines)
  - `buildAssumptions` (~line 1500-1654): add a `subscriptions` block to the returned `ForecastAssumptions` object
- `src/app/finances/forecast/components/wizard-v4/types/assumptions.ts` (~5 lines if any field tweaks needed)
  - Verify `SubscriptionAuditSummary` shape (line 200) matches what we write
  - Verify `ForecastAssumptions.subscriptions?: SubscriptionAuditSummary` at line 254

## Implementation notes

### Read the existing SubscriptionAuditSummary shape

`types/assumptions.ts:~200`:
```typescript
export interface SubscriptionAuditSummary {
  totalAnnual: number;
  activeVendorCount: number;
  annualGrowthPct?: number;
  vendors?: DetectedSubscription[];  // see line 314
}

export interface DetectedSubscription {
  vendorKey: string;
  vendorName: string;
  monthlyBudget: number;
  frequency: string;
  category?: string;
  accountCodes?: string[];
}
```

(Verify by reading the actual file before implementing — these shapes may need minor tweaks.)

### Populate during buildAssumptions

Inside `buildAssumptions` (~line 1500), add:

```typescript
// Phase 57: snapshot subscriptions into assumptions for self-contained forecasts.
// Live source remains subscription_budgets table; this snapshot captures
// what we ASSUMED at save time so the forecast can be re-opened later
// with consistent numbers even if the live data has drifted.
const activeSubs = state.subscriptions.filter(v => v.isActive);
const totalAnnualSubscriptions = activeSubs.reduce(
  (sum, v) => sum + (v.monthlyBudget || 0) * 12,
  0,
);

const subscriptionsSnapshot: SubscriptionAuditSummary = {
  totalAnnual: Math.round(totalAnnualSubscriptions),
  activeVendorCount: activeSubs.length,
  annualGrowthPct: state.defaultOpExIncreasePct ?? 3,
  vendors: activeSubs.map(v => ({
    vendorKey: v.vendorKey,
    vendorName: v.vendorName,
    monthlyBudget: v.monthlyBudget,
    frequency: v.frequency,
    category: v.category,
    accountCodes: v.accountCodes,
  })),
};
```

In the returned ForecastAssumptions object:
```typescript
return {
  // ... existing fields ...
  subscriptions: subscriptionsSnapshot,  // NEW (was undefined before Phase 57)
  // ... rest ...
};
```

### Restore path — out of scope for this task

The research (Section G, line 506-509) recommends a 3-step restore: prefer live, fall back to snapshot, banner if drift > 5%. **Phase 57 implements only the WRITE path.** The restore-with-drift-banner is a Phase 58 enhancement. T02 already handles "live wins" at mount time by fetching `/api/subscription-budgets` and ignoring the snapshot.

This is a deliberate scope cut to keep Phase 57 focused. CONTEXT.md doesn't require restore reconciliation.

## Acceptance criteria

- [ ] After saving a forecast with active subscriptions, the `forecast_assumptions.subscriptions` JSON field contains the snapshot
- [ ] `totalAnnual` matches Σ(active monthlyBudget × 12) rounded
- [ ] `activeVendorCount` matches `state.subscriptions.filter(v => v.isActive).length`
- [ ] `vendors` array round-trips: vendorKey, vendorName, monthlyBudget, frequency, category, accountCodes
- [ ] On a forecast with zero subs, snapshot is `{ totalAnnual: 0, activeVendorCount: 0, vendors: [], annualGrowthPct: 3 }` — non-undefined
- [ ] No new tsc errors
- [ ] Existing forecasts saved before Phase 57 continue to load (the field was always optional)

## Regression risks

- **Schema mismatch:** the `subscription_budgets` columns and the `SubscriptionAuditSummary` snapshot shape can drift over time. Recommend a JSDoc comment on `subscriptionsSnapshot` linking to `subscription_budgets` schema. Refactor risk is acceptable — this is a snapshot, not a live join.
- **Forgetting to update snapshot when state mutates:** the snapshot is computed at `buildAssumptions` call time, which is invoked on save. Mid-edit changes are not snapshotted — that's correct; only saves get snapshotted.

## Estimated effort

0.5 day.
