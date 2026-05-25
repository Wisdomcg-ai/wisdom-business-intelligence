# Task 12 — Step 5 Subscriptions UI: gap warning banner + flush-save before nav-jump

**Ship batch:** B4 (Subscription UX) · **Wave:** 5 · **Dependencies:** T02 · **Risk:** LOW

## Goal

In the new Step 5 (Subscriptions, rendered by `Step6Subscriptions.tsx`):
1. Show a banner when `Σ(active vendor monthlyBudget × 12) < 0.85 × Σ(historical_account_total)` — surfaces the case where the operator's budget significantly under-reflects historical spend (a "did you forget a vendor?" hint)
2. Expose `flushPendingSaves()` from the component (for T13 to call before navigating away)

Per CONTEXT.md (line 30): "Show a banner if the gap exceeds 15% of historical so it's not silent."
Per CONTEXT.md (line 41): "flush-save synchronously (await both wizard-state autosave and Step 5's subscription-budget API save)."

## Files modified

- `src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx` (~60 lines)
  - Compute `historicalAccountTotal` from analysis data (already available in `summary` state from `analyzeSubscriptions`)
  - Compute `vendorBudgetTotal` from `state.subscriptions.filter(v => v.isActive).reduce(...)`
  - Render the banner conditionally
  - Expose `flushPendingSaves` via either an imperative ref (passed from parent) or by calling `saveSubscriptionBudgets()` synchronously when the parent signals a step change

## Implementation notes

### Gap math

```typescript
const vendorBudgetTotal = state.subscriptions
  .filter(v => v.isActive)
  .reduce((sum, v) => sum + (v.monthlyBudget || 0) * 12, 0);

const historicalAccountTotal = summary?.totalSpend ?? 0;  // or wherever the analysis stores historical sum

const gapPct = historicalAccountTotal > 0
  ? ((historicalAccountTotal - vendorBudgetTotal) / historicalAccountTotal) * 100
  : 0;

const showGapWarning = gapPct > 15;  // CONTEXT.md threshold
```

### Banner JSX

```jsx
{showGapWarning && (
  <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-4">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-amber-900">
          Your vendor budgets are {gapPct.toFixed(0)}% below historical spend
        </p>
        <p className="text-xs text-amber-800 mt-1">
          Historical: {formatCurrency(historicalAccountTotal)}/yr.
          Your budget: {formatCurrency(vendorBudgetTotal)}/yr.
          Gap: {formatCurrency(historicalAccountTotal - vendorBudgetTotal)}/yr.
        </p>
        <p className="text-xs text-amber-800 mt-1">
          If you've intentionally cut subscriptions, this is fine — the forecast uses your budget.
          If you've missed a vendor, add it before continuing.
        </p>
      </div>
    </div>
  </div>
)}
```

Place near the top of the vendor list, AFTER the analysis-complete state. Don't show during the analysis loading state.

### Flush-save mechanism

The parent (StepBar via T13) needs to call something synchronous on this component before navigating away. Two options:

**Option A — `useImperativeHandle` (recommended):**

In `Step6Subscriptions.tsx`, accept a `forwardRef` from the parent:

```typescript
import { forwardRef, useImperativeHandle } from 'react';

export interface Step6SubscriptionsHandle {
  flushPendingSaves: () => Promise<void>;
}

const Step6Subscriptions = forwardRef<Step6SubscriptionsHandle, Step6SubscriptionsProps>(
  function Step6Subscriptions(props, ref) {
    // ... existing component ...

    useImperativeHandle(ref, () => ({
      flushPendingSaves: async () => {
        // 1. Clear any pending debounced timer
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        // 2. Flush the latest state synchronously
        await saveSubscriptionBudgets();
      },
    }), [saveSubscriptionBudgets]);

    // ... rest ...
  }
);
```

Parent (`ForecastWizardV4.tsx` or the StepBar caller) holds the ref and calls `await ref.current?.flushPendingSaves()` before invoking `goToStep`.

**Option B — Imperative event channel:**

Simpler but less ergonomic. Skip in favor of A.

### saveTimeoutRef refactor

If the existing debounce uses `setTimeout` without a ref, refactor to expose the timer:

```typescript
const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// Inside the existing debounced save trigger:
if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
saveTimeoutRef.current = setTimeout(() => saveSubscriptionBudgets(), 1500);
```

This lets `flushPendingSaves` cancel and immediately run.

## Acceptance criteria

- [ ] Banner appears when active vendor budgets are < 85% of historical
- [ ] Banner does NOT appear when budget = historical or > 85% of historical
- [ ] Banner does NOT appear during analysis-loading state (only post-analysis)
- [ ] Banner does NOT appear when `historicalAccountTotal === 0` (avoid divide-by-zero noise)
- [ ] `flushPendingSaves()` ref method exists and:
  - Cancels any pending debounce timer
  - Awaits `saveSubscriptionBudgets()` (the network call)
  - Resolves only after the API call completes
  - Resolves even if no save was pending (no-op)
- [ ] On API error during flush, returns rejected promise (caller handles toast)
- [ ] No new tsc errors

## Regression risks

- **`historicalAccountTotal` source unclear:** the research notes the analysis returns `summary.totalSpend` or similar. Confirm by reading the actual `analyzeSubscriptions` response shape. If the field is named differently, update the gap math accordingly.
- **Flush during component unmount:** if the operator clicks "Subscriptions" while already on Subscriptions and we attempt to flush, harmless. If they unmount mid-flush, the cleanup effect cancels the in-flight fetch. Guard with an `AbortController` if needed (ProGress check: existing fetch in `saveSubscriptionBudgets` doesn't use abort — leave that as a follow-up).
- **Banner threshold too aggressive:** if 15% feels noisy on real data, T16 surfaces; tweak to 20% in a follow-up.

## Estimated effort

0.5 day.
