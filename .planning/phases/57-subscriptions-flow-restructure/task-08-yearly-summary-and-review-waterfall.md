# Task 08 — Step8Review consumer code: waterfall + scenario base + advisor checks

**Ship batch:** B4 (Subscription UX) · **Wave:** 5 · **Dependencies:** T07, T05 · **Risk:** MEDIUM

## Goal

Surface `summary.year{N}.subscriptions` (computed by T07, with type field already shipped in T07/B2) in the Step 9 Review screen — both in the P&L waterfall chart and the AI advisor sanity checks.

## Co-shipping note (resolved)

The `YearlySummary.subscriptions: number` type addition lives in **T07's PR (B2)** because T07's rollup math depends on it to compile. **T08 (this task) is the consumer code only:** Step8Review reads the field that T07 populates. T08 ships in B4 — independently from B2 — because the consumer code adds no risk to the rollup math.

After B2 ships, `summary.year{N}.subscriptions` will be populated for every forecast (0 for legacy, real values once subscriptions are configured) but no UI consumes it yet — that's this task.

## Files modified

- `src/app/finances/forecast/components/wizard-v4/steps/Step8Review.tsx` (~30 lines)
  - **Lines 95-105 — `PLWaterfallChart`:** insert `{ name: 'Subscriptions', value: -data.subscriptions }` between Team and OpEx
  - **Lines 553-597 — scenario adjustment math:** add `subscriptions` to the base summary used for scenarios. Per CONTEXT.md (deferred items), do NOT add `totalSubscriptionsAdj` overlay — Phase 58+
  - **Lines 605-611 — completion checklist:** already updated in T06 (handles this site)
  - **Lines 641-660 — AI advisor checks:** verify "team as % of revenue" check still meaningful; consider adding "subscriptions as % of revenue" sanity check (target < 10% as a soft hint — informational only)

## Implementation notes

### Waterfall chart

Find the `PLWaterfallChart` data construction (~line 95):

Before:
```typescript
const data = [
  { name: 'Revenue', value: y1.revenue },
  { name: 'COGS', value: -y1.cogs },
  { name: 'Gross Profit', value: y1.grossProfit, isTotal: true },
  { name: 'Team', value: -y1.teamCosts },
  { name: 'OpEx', value: -y1.opex },
  { name: 'Investments', value: -y1.investments },
  { name: 'Other', value: -y1.otherExpenses },
  { name: 'Net Profit', value: y1.netProfit, isTotal: true },
];
```

After:
```typescript
const data = [
  { name: 'Revenue', value: y1.revenue },
  { name: 'COGS', value: -y1.cogs },
  { name: 'Gross Profit', value: y1.grossProfit, isTotal: true },
  { name: 'Team', value: -y1.teamCosts },
  { name: 'Subscriptions', value: -y1.subscriptions },  // Phase 57 — explicit bucket
  { name: 'OpEx', value: -y1.opex },
  { name: 'Investments', value: -y1.investments },
  { name: 'Other', value: -y1.otherExpenses },
  { name: 'Net Profit', value: y1.netProfit, isTotal: true },
];
```

If `data.subscriptions === 0` (no active subs), the bar renders at height 0. **Optional UX nicety:** filter out zero-value bars to keep the chart clean. Mirror the existing pattern if there is one. If not, leave the zero bar in — better to teach operators that subscriptions is a real bucket even when zero.

### Scenario math (lines 553-597)

`Step8Review.tsx` has scenario adjustment math like:
```typescript
const totalOpexAdj = scenarioState.opexAdj?.reduce(...) ?? 0;
const adjustedOpex = baseOpex * (1 + totalOpexAdj / 100);
```

**Per CONTEXT.md "Out of scope":** do NOT add `totalSubscriptionsAdj`. Subscriptions enter the scenario base unchanged. If the operator wants to flex subs in a scenario, that's Phase 58.

Just ensure the scenario "base" object passes subscriptions through:
```typescript
const baseSubscriptions = y1.subscriptions;  // no adjustment
```

And subtract from netProfit:
```typescript
const adjustedNetProfit = adjustedRevenue - adjustedCogs - adjustedTeam - baseSubscriptions - adjustedOpex - ...;
```

### AI advisor checks (lines 641-660)

Likely current checks (verify by reading the actual file):
```typescript
// Team as % of revenue
const teamPct = (y1.teamCosts / y1.revenue) * 100;
if (teamPct > 35) { /* flag */ }
```

**Optional new check (recommend):**
```typescript
// Subscriptions as % of revenue
const subsPct = y1.revenue > 0 ? (y1.subscriptions / y1.revenue) * 100 : 0;
if (subsPct > 10) {
  advisorMessages.push({
    severity: 'info',
    text: `Subscriptions are ${subsPct.toFixed(1)}% of revenue. Above 10% suggests a vendor audit could surface savings.`,
  });
}
```

Mirror the existing message format. If the AI advisor uses a different shape, adapt.

## Acceptance criteria

- [ ] PLWaterfallChart includes a "Subscriptions" bar between Team and OpEx
- [ ] On a forecast with no subscriptions, the bar renders at height 0 (or is hidden if codebase pattern hides zero bars)
- [ ] Scenario math passes `subscriptions` through unchanged (no flex)
- [ ] (Optional) AI advisor adds subscriptions sanity check
- [ ] No new tsc errors
- [ ] Existing Step8Review tests pass
- [ ] **`grep -rn "\.year[123]\.subscriptions" src/`** — every reader must either default to 0 if undefined OR read from live `summary` (not from saved `forecast_assumptions`). If any reader crashes on undefined, add nullish-default at the read site (e.g., `y1.subscriptions ?? 0`).

## Regression risks

- **Waterfall chart layout breakage:** adding a bar shifts spacing. Visually verify in T16 manual QA.
- **Forgetting to subtract subscriptions in scenario adjustedNetProfit:** would produce wrong P&L in scenarios. Add a unit test:
  ```typescript
  it('scenario netProfit subtracts subscriptions even with no scenario flex', () => {
    // Set y1.subscriptions = 5000; scenarioState empty; expect adjustedNetProfit decreases by 5000 vs no-subs base
  });
  ```
- **Stale readers of `summary.year{N}.subscriptions`:** any other component (not just Step8Review) that reads the new field must handle the undefined case gracefully. Run the grep above and patch.

## Estimated effort

0.5 day.
