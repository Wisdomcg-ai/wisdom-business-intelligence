# Task 11 — Step 6 OpEx UI: "covered by Step 5" badge + legacy "Refresh from Xero" nudge banner

**Ship batch:** B4 (Subscription UX) · **Wave:** 5 · **Dependencies:** T07 · **Risk:** LOW

## Goal

In the Step 6 OpEx UI (rendered by `Step5OpEx.tsx` despite the file name), show OpEx lines whose `accountCode` is covered by Step 5's active subscriptions with:
- A visible "covered by Step 5" badge
- Zero contribution to the rollup (already enforced by T07)
- Read-only or muted styling so the operator understands editing this line is futile

Also add a **yellow nudge banner at the top of the Step 6 OpEx table** for legacy forecasts (where T03's migration set `state.needsAccountCodeRefresh === true`). These forecasts have OpEx lines without `accountCode`, so the T07 exclusion can't match — they silently double-count software spend until the operator refreshes from Xero. The banner is the R6 mitigation.

Per CONTEXT.md (line 36): "show those rows with a 'covered by Step 5' badge and zero contribution to the rollup. Don't hide them — transparency over invisibility."

## Files modified

- `src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx` (~70 lines)
  - **NEW: legacy "Refresh from Xero" nudge banner** at the top of the Step 6 OpEx table when `state.needsAccountCodeRefresh === true`
  - In the OpEx line list rendering (search for `state.opexLines.map(`):
    - Compute `coveredAccountCodes: Set<string>` once per render (or memoize)
    - For each line, derive `isCoveredBySubscription = line.accountCode && coveredAccountCodes.has(line.accountCode)`
    - Conditional rendering:
      - Show a small badge ("Covered by Step 5") inline with the line title
      - Mute the row visually (opacity-60 or similar Tailwind)
      - Hide the year inputs OR show them as `-` (operator can't change the contribution; the value is dictated by Step 5)
      - Tooltip on the badge: "This account is budgeted in Step 5 Subscriptions. Edit the vendor budget there to change this contribution."

## Implementation notes

### Legacy "Refresh from Xero" nudge banner (R6 mitigation)

At the top of the Step 6 OpEx table, render a yellow banner when `state.needsAccountCodeRefresh === true`:

```jsx
{state.needsAccountCodeRefresh && (
  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 mb-4 flex items-start gap-3">
    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="text-sm text-amber-900">
        This forecast was created before Phase 57. Click "Refresh from Xero" to enable accurate subscription accounting.
      </p>
      <p className="text-xs text-amber-700 mt-1">
        Until you refresh, OpEx lines covering subscription accounts may be double-counted in your forecast.
      </p>
    </div>
    <button
      type="button"
      onClick={handleRefreshFromXero}
      disabled={isRefreshingFromXero}
      className="px-3 py-1.5 text-sm font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 flex-shrink-0"
    >
      {isRefreshingFromXero ? 'Refreshing…' : 'Refresh from Xero'}
    </button>
  </div>
)}
```

The `handleRefreshFromXero` callback:
1. Calls `/api/Xero/chart-of-accounts` (the existing endpoint that already populates accountCode per T01)
2. Re-classifies opexLines with the freshly-ingested accountCodes (matching by accountId or display name)
3. After refresh succeeds, `actions.setNeedsAccountCodeRefresh(false)` (or equivalent state update — add this action to useForecastWizard.ts if it doesn't exist)
4. On error: toast + banner stays visible

```typescript
const [isRefreshingFromXero, setIsRefreshingFromXero] = useState(false);

const handleRefreshFromXero = useCallback(async () => {
  setIsRefreshingFromXero(true);
  try {
    const res = await fetch(`/api/Xero/chart-of-accounts?business_id=${businessId}`);
    if (!res.ok) throw new Error('Xero fetch failed');
    const { accounts } = await res.json();

    // Re-classify opexLines: for each line, find its account by name or id
    // and populate accountCode.
    const updatedOpexLines = state.opexLines.map(line => {
      if (line.accountCode) return line; // already has code, skip
      const match = accounts.find((a: any) =>
        a.name === line.accountId || a.accountId === line.accountId
      );
      return match ? { ...line, accountCode: match.code } : line;
    });

    actions.setOpExLines(updatedOpexLines);
    actions.setNeedsAccountCodeRefresh(false);
    toast.success('Refreshed from Xero. Subscription accounting is now accurate.');
  } catch (err) {
    console.error('[OpEx] Xero refresh failed', err);
    toast.error('Could not refresh from Xero. Please try again.');
  } finally {
    setIsRefreshingFromXero(false);
  }
}, [businessId, state.opexLines, actions]);
```

If `setNeedsAccountCodeRefresh` doesn't exist on `actions`, add it in `useForecastWizard.ts` alongside the existing actions.

### Compute coveredAccountCodes (memoized)

At the top of Step5OpEx component:

```typescript
const coveredAccountCodes = useMemo(() => {
  const set = new Set<string>();
  for (const v of state.subscriptions) {
    if (!v.isActive) continue;
    for (const code of (v.accountCodes || [])) {
      if (typeof code === 'string' && code.trim()) set.add(code.trim());
    }
  }
  return set;
}, [state.subscriptions]);
```

### Per-line render branch

Find the existing OpEx line render (likely `state.opexLines.map((line) => ...)` somewhere in the component body). Add:

```typescript
const isCoveredBySubscription = line.accountCode && coveredAccountCodes.has(line.accountCode);
```

In the JSX:
```jsx
<div className={`flex items-center gap-2 ${isCoveredBySubscription ? 'opacity-60' : ''}`}>
  <span>{line.accountId /* or display name */}</span>
  {isCoveredBySubscription && (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
      title="This account is budgeted in Step 5 Subscriptions. Edit there to change."
    >
      Covered by Step 5
    </span>
  )}
</div>
```

For the value cells (the year columns showing $X/year), conditionally render:
```jsx
{isCoveredBySubscription ? (
  <span className="text-gray-400 italic" title="Contribution comes from Step 5">—</span>
) : (
  /* existing input or value display */
)}
```

For inputs that operators edit (monthlyAmount, percentOfRevenue, etc.), wrap in `disabled={isCoveredBySubscription}` so they can't accidentally type into a covered row.

### Empty state copy

If a covered line has historical data (priorYearAnnual) it might confuse the operator to see a $0 forecast next to a real prior-year number. Add clarifying caption text once at the top of the OpEx list:

```jsx
{state.subscriptions.some(v => v.isActive) && (
  <p className="text-xs text-gray-500 mb-2">
    Lines marked "Covered by Step 5" don't contribute to OpEx — their cost is captured in your Subscriptions audit.
  </p>
)}
```

Only render this when at least one active subscription exists; otherwise it's noise.

## Acceptance criteria

- [ ] When `state.subscriptions` includes an active vendor with `accountCodes: ['5100']`, every OpEx line with `accountCode === '5100'` shows the "Covered by Step 5" badge
- [ ] Covered rows render at reduced opacity (visible but de-emphasized)
- [ ] Year contribution cells on covered rows show "—" not "$0" (clearer that it's intentionally absent)
- [ ] Editing inputs are disabled on covered rows
- [ ] Tooltip on badge points operator to Step 5
- [ ] Caption text appears above the list when at least one active sub exists
- [ ] On a forecast with no subs, list renders unchanged from pre-Phase-57
- [ ] **When `state.needsAccountCodeRefresh === true`, render a yellow banner at the top of the Step 6 OpEx table: "This forecast was created before Phase 57. Click 'Refresh from Xero' to enable accurate subscription accounting." The banner has a `Refresh from Xero` button that triggers re-ingest from `/api/Xero/chart-of-accounts` and re-classifies opexLines with populated `accountCode`. After refresh, set `needsAccountCodeRefresh = false`.**
- [ ] On refresh success: banner disappears, opexLines have populated accountCodes, T07 exclusion now matches correctly
- [ ] On refresh error: toast appears, banner stays visible (operator can retry)
- [ ] No new tsc errors

## Regression risks

- **Operator confusion if badge is unclear:** the badge is a soft signal. If operators interpret "covered" as "won't be in the budget" instead of "captured in Step 5," update the badge text. Sentinel feedback from T16 informs.
- **Memoization key:** `useMemo` depends on `state.subscriptions`. If reference identity changes on every render (e.g., from `{ ...prev, subscriptions: [...prev.subscriptions] }`), the memo recomputes. Acceptable cost — Set construction is O(N).
- **Mixed legacy data:** an OpExLine with no `accountCode` falls through `isCoveredBySubscription === false`. That's correct — we have no signal to mark it covered. The R6 nudge banner prompts the operator to refresh and populate codes.
- **Xero refresh fails for accounts no longer in Xero:** if a v10 OpExLine was created from an account that's since been deleted in Xero, the refresh won't match and that line stays without accountCode. Acceptable — the operator can manually delete the orphaned line.

## Estimated effort

0.75 day (badge + nudge banner + Xero refresh handler).
