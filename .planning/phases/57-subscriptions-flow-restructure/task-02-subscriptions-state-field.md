# Task 02 — Add `subscriptions: VendorBudget[]` to wizard state, load on mount

**Ship batch:** B1 (Foundation) · **Wave:** 1 · **Dependencies:** none · **Risk:** LOW

## Goal

Make subscription vendor budgets a first-class wizard state field so the rollup (T07) can read them in-memory rather than re-fetching, so the BudgetFramework (T10) can compute Subscriptions = Σ(active × 12), and so any step can subscribe to changes via the existing reducer pattern.

## Why this matters

Today subscriptions live in two places: `subscription_budgets` Postgres table (live) and Step 6 Subscriptions component-local `useState`. Neither feeds the rollup. After Phase 57 the wizard's `state.subscriptions` is the in-memory mirror of `subscription_budgets` for this business, populated on mount and kept in sync as the operator edits in Step 5.

## Files modified

- `src/app/finances/forecast/components/wizard-v4/types.ts` (~10 lines)
  - Add to `ForecastWizardState`: `subscriptions: VendorBudget[]`
  - Re-export `VendorBudget` if needed (it currently lives inside `Step6Subscriptions.tsx` — promote to types or types/subscriptions.ts)
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (~80 lines)
  - `createInitialState` (~line 152): add `subscriptions: []`
  - Add new action `setSubscriptions(vendors: VendorBudget[])` to the actions object
  - Add new mount-time effect that fetches `/api/subscription-budgets?business_id=...` and dispatches `setSubscriptions`
  - Soft-migration block (~line 188): if `parsed.subscriptions === undefined`, set `parsed.subscriptions = []`
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (~5 lines)
  - Pass `subscriptions={state.subscriptions}` to children that need it (Step5OpEx for BudgetFramework, Step6Subscriptions which currently fetches itself — T12 simplifies)
- `src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx` (~15 lines)
  - Replace component-local `vendors` state derivation: read from `state.subscriptions`, write via `actions.setSubscriptions`
  - Keep the existing `/api/subscription-budgets` POST debounce — that's the persistence path, unchanged
  - Remove the duplicate "load on mount" fetch (now handled in the hook)

## Implementation notes

### VendorBudget type promotion

The shape currently in `Step6Subscriptions.tsx:34-72` is verbose (16 fields). For state, we only need a stable subset. Choose one:

**Option A (recommended):** promote the full `VendorBudget` interface to `types/subscriptions.ts`, export from `types.ts`, use it as-is. Pro: zero conversion. Con: the type carries UI-only fields (`isExpanded`).

**Option B:** create a slimmer `StateVendorBudget` (drop UI-only fields), convert at the Step5/Step6 boundary. Pro: cleaner state shape. Con: requires conversion code in two places.

Pick A. The `isExpanded` field is harmless to carry through state — it survives a round-trip through localStorage and the rollup ignores it.

```typescript
// types/subscriptions.ts (new file)
export interface VendorBudget {
  vendorKey: string;
  vendorName: string;
  category?: string;
  frequency: 'monthly' | 'quarterly' | 'annual' | 'one-time';
  monthlyBudget: number;
  // ...mirror Step6Subscriptions.tsx:34-72 exactly...
  accountCodes: string[];   // Phase 57 join key — already exists
  isActive: boolean;
}
```

Re-export from `types.ts`:
```typescript
export type { VendorBudget } from './types/subscriptions';
```

### State + action

```typescript
// useForecastWizard.ts createInitialState
subscriptions: [],
```

```typescript
// new action
const setSubscriptions = useCallback((vendors: VendorBudget[]) => {
  setState(prev => ({ ...prev, subscriptions: vendors }));
}, []);
```

Add to `actions` object alongside `setOpexLines`, `setTeamMembers`, etc.

### Mount-time load

In the hook, alongside the existing Xero/profile loads, add:

```typescript
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const res = await fetch(`/api/subscription-budgets?business_id=${businessId}`);
      if (!res.ok) return;  // silently fail — the wizard is usable without subs
      const json = await res.json();
      if (cancelled) return;
      const vendors: VendorBudget[] = (json.budgets || []).map(b => ({
        // ... map API row → VendorBudget; mirror logic at Step6Subscriptions.tsx:~250 ...
        isActive: b.is_active ?? true,
        isExpanded: false,
      }));
      setState(prev => ({ ...prev, subscriptions: vendors }));
    } catch {
      /* network error — leave subscriptions empty */
    }
  })();
  return () => { cancelled = true; };
}, [businessId]);
```

Place this near the other one-time loads — search `useEffect` blocks at the top of the hook.

### Soft-migration default

In the v10-load block (~line 188), add:
```typescript
if (parsed.subscriptions === undefined) parsed.subscriptions = [];
```

This avoids `state.subscriptions.reduce(...)` crashing on legacy drafts before the API load completes.

### Step6Subscriptions wiring

Today the component holds local `vendors` state and saves to API. Switch to:
```typescript
const vendors = state.subscriptions;
const setVendors = (next: VendorBudget[] | ((prev: VendorBudget[]) => VendorBudget[])) => {
  const resolved = typeof next === 'function' ? (next as (p: VendorBudget[]) => VendorBudget[])(vendors) : next;
  actions.setSubscriptions(resolved);
};
```

The existing `saveSubscriptionBudgets` continues to POST on debounce. The component now both reads and writes through state — the rollup picks up edits immediately.

## Acceptance criteria

- [ ] `VendorBudget` type exported from `types.ts` (re-exported from `types/subscriptions.ts`)
- [ ] `ForecastWizardState.subscriptions: VendorBudget[]` exists with sane default `[]`
- [ ] Mounting the wizard fetches `/api/subscription-budgets?business_id=...` and populates `state.subscriptions`
- [ ] `actions.setSubscriptions(vendors)` mutates state in a single render
- [ ] Step6Subscriptions reads from `state.subscriptions` (verify by editing a vendor budget and seeing the rollup test in T07 pick it up — gated until T07 lands)
- [ ] Loading a v10 draft from localStorage results in `state.subscriptions === []` until API load completes (no crash)
- [ ] No new tsc errors; `npm run build` clean
- [ ] `npm test -- forecast` green

## Regression risks

- **Mount-time API failure** (network down, business has no subs): handled by the silent-fail catch. State stays `[]`.
- **Race condition** between mount-time fetch and Step6Subscriptions own fetch: the existing Step6 fetch is removed in this task. Single source of truth.
- **localStorage round-trip:** `state.subscriptions` is included in autosave. Verify no `JSON.stringify` cycles (none — VendorBudget is plain data).
- **Cross-business contamination:** the mount-time effect re-fires on `businessId` change. Verify the active business switch invokes a remount — already handled by `getStorageKey(businessId, fy)` keying.

## Test

Mock `/api/subscription-budgets` to return 2 vendors; mount the hook; assert `state.subscriptions.length === 2` after a microtask tick.

## Estimated effort

0.75 day.
