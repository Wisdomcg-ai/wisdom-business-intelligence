---
phase: 51-forecast-wizard-ux
plan: 06
subsystem: forecast-wizard-v4 / Step 6 Subscriptions
tags: [ux, forecast, wizard, subscriptions, sidebar, manual-entry, re-analyze]
requirements: [UX-S6-01, UX-S6-02, UX-S6-03]
dependency-graph:
  requires: [51-00 (shared helpers — none consumed by this plan, but precedent for backward-compat patterns)]
  provides:
    - "Step6Subscriptions.tsx: exported mergeByVendorKey helper"
    - "Step6Subscriptions.tsx: persistent Selected Accounts sidebar (UX-S6-01)"
    - "Step6Subscriptions.tsx: 'Change selected accounts' rename + vendor-state-preserving re-analyze (UX-S6-02)"
    - "Step6Subscriptions.tsx: '+ Add Subscription' button visible in xero mode + expanded form with start month + category (UX-S6-03)"
  affects:
    - "VendorBudget interface: 3 new optional fields (accountCodes, category, startMonth)"
tech-stack:
  added: []
  patterns:
    - "Backward-compat via undefined fallthrough (Phase 50 lease_type precedent) — 3 new optional VendorBudget fields"
    - "Mock-fetch test harness for components that call APIs on mount (chart-of-accounts + subscription-budgets)"
    - "Exported helper for unit testability (mergeByVendorKey) — Phase 50 lockstep-helper precedent"
key-files:
  created:
    - src/__tests__/forecast/phase-51-step6-sidebar.test.tsx
    - src/__tests__/forecast/phase-51-step6-re-analyze.test.tsx
    - src/__tests__/forecast/phase-51-step6-manual-entry.test.tsx
  modified:
    - src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx (+206 / -44)
decisions:
  - "Mock fetch in tests rather than seeding state via the wizard hook — Step6Subscriptions owns its own phase machine and accounts/vendors local state, so mocking the network endpoints is the cleanest deterministic harness."
  - "Sidebar rendered only in xero mode (skipped in isManualMode) — manual mode has no Xero accounts to summarize."
  - "Manual-entry start month dropdown spans 24 months from FY start (Y1 + Y2) — operator can plan subscriptions starting in next year."
  - "Manual-entry category list kept narrow (Software / Marketing / Operations / Other) — operator's request for 'matching existing categories' interpreted as a small fixed list, not a free-text or shared-from-OpEx coupling. Future expansion can pull from a shared module if needed."
  - "VendorBudget.accountCodes populated for every vendor produced by analyzeSubscriptions using the FULL set of analyzed account codes (selectedAccounts.map(a => a.accountCode)). Per-vendor account-code attribution from the API is not currently available; the sidebar's per-account total semantics (sum of vendor monthlyBudget where vendor.accountCodes includes the account's code) are correct under this assumption."
metrics:
  duration: 25 minutes
  completed: 2026-05-04
  tasks-completed: 4 / 4
  commits: 4
  test-counts:
    new: 10
    baseline: 13
    total-green: 23
---

# Phase 51 Plan 06: Step 6 Subscriptions sidebar + change-accounts + manual entry — Summary

One-liner: Bundled UX-S6-01 / -02 / -03 into a single PR — added a persistent
selected-accounts sidebar with per-account totals, renamed the "Re-analyze"
button to "Change selected accounts" with vendor-state preservation via a new
`mergeByVendorKey` helper, and surfaced the previously-manual-mode-only
"+ Add Subscription" button in xero mode with an expanded labelled form.

## Task Commits

| # | Task | Commit  | Files                                                             |
| - | ---- | ------- | ----------------------------------------------------------------- |
| 1 | RED — sidebar tests (UX-S6-01)             | 7632dd8 | src/__tests__/forecast/phase-51-step6-sidebar.test.tsx             |
| 2 | RED — re-analyze merge tests (UX-S6-02)    | 0462e55 | src/__tests__/forecast/phase-51-step6-re-analyze.test.tsx          |
| 3 | RED — manual entry tests (UX-S6-03)        | 57c4b1e | src/__tests__/forecast/phase-51-step6-manual-entry.test.tsx        |
| 4 | GREEN — implementation (UX-S6-01/02/03)    | 52d5ad7 | src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx (+206/-44); src/__tests__/forecast/phase-51-step6-re-analyze.test.tsx (test selector hardening) |

## What Changed

### UX-S6-01 — Selected Accounts sidebar

In `phase === 'review'` and xero mode (`!isManualMode`), the review block is
now wrapped in a `flex` container with a `<aside aria-label="Selected
Accounts">` on the left.

The sidebar:

- Lists ONLY accounts where `acc.isSelected === true` — unselected accounts
  are filtered out.
- For each selected account, sums `monthlyBudget` across `vendors.filter(v =>
  v.isActive && v.accountCodes?.includes(account.accountCode))` and renders
  the total via `formatCurrency`.
- Updates reactively when the operator toggles a vendor's `isActive` checkbox.
- Renders an italic "No accounts selected." empty state when zero accounts
  are selected.

### UX-S6-02 — `mergeByVendorKey` + button rename

New exported helper:

```typescript
export function mergeByVendorKey(prev: VendorBudget[], incoming: VendorBudget[]): VendorBudget[] {
  const prevByKey = new Map(prev.map(v => [v.vendorKey, v]));
  return incoming.map(newV => {
    const existing = prevByKey.get(newV.vendorKey);
    if (!existing) return newV;
    return { ...newV, isActive: existing.isActive, monthlyBudget: existing.monthlyBudget };
  });
}
```

`analyzeSubscriptions` now calls `setVendors(prev => mergeByVendorKey(prev,
vendorBudgets))` instead of `setVendors(vendorBudgets)`. Operator's `isActive`
toggles and `monthlyBudget` edits are preserved across re-analyze.

The `Re-analyze` button is now labelled `Change selected accounts`.

### UX-S6-03 — `+ Add Subscription` always visible + expanded form

The button gate changed from `{isManualMode && (...)}` to `{phase ===
'review' && (...)}`. The form gained:

- Explicit `<label>` wrappers on every field for accessibility (used by
  `getByLabelText` in tests).
- Two new fields:
  - **Start month** (dropdown of 24 month options, `${year}-${MM}` values,
    "Mon YYYY" labels).
  - **Category** (dropdown of `Software / Marketing / Operations / Other`).
- Both new fields are persisted onto the manual `VendorBudget` as optional
  `category?: string` and `startMonth?: string`.

## LOC Delta

`src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx`:
**+206 insertions / -44 deletions** (250 lines changed).

## Test Results

| File                                                              | Tests   | Status |
| ----------------------------------------------------------------- | ------- | ------ |
| src/__tests__/forecast/phase-51-step6-sidebar.test.tsx            | 4 / 4   | green  |
| src/__tests__/forecast/phase-51-step6-re-analyze.test.tsx         | 3 / 3   | green  |
| src/__tests__/forecast/phase-51-step6-manual-entry.test.tsx       | 3 / 3   | green  |
| src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx (Phase 50)    | 13 / 13 | green  |
| **TOTAL**                                                         | **23 / 23** | **green** |

## Backward-Compat Confirmations

- `grep -c "isManualMode"` Step6Subscriptions.tsx → **26 hits** — every
  no-Xero fallback branch preserved (manual-mode header, summary-cards
  grid-cols-3, manual-mode add-vendor button alternate location, totals
  footer colspan adjustments, vendor-table column visibility, etc.).
- `grep "setVendors(vendorBudgets)"` → **0 hits** — only the merge wrapper
  remains in `analyzeSubscriptions`. The two saved-state restoration
  call sites in `loadAccounts` (line 256) and `loadExistingBudgets` (line
  303) use `setVendors(existingVendors)` (NOT `vendorBudgets`) and were
  intentionally NOT wrapped — they ARE the source of truth on first mount.
- `grep "mergeByVendorKey"` → 3 hits (helper definition + call site +
  comment in JSX block).
- `WIZARD_VERSION` in `useForecastWizard.ts` → still **10** (unchanged).
- `useForecastWizard.ts` → **UNCHANGED** (verified via `git diff --stat
  origin/main` — only Step6Subscriptions.tsx + 3 new test files appear).
- Other step files → **UNCHANGED**.

## Manual Test Steps (operator preview)

1. Open JDS forecast → Step 6.
2. Select 5 expense accounts → click **Analyze Subscriptions**.
3. In review phase: confirm left sidebar shows "Selected Accounts" with
   the 5 account names + per-account `$X` totals.
4. Toggle 3 vendors off → sidebar account totals decrease accordingly.
5. Click **Change selected accounts** → returns to account-selection.
6. Add a 6th account → click Analyze Subscriptions again.
7. Back in review: the 3 originally-toggled-off vendors are STILL
   `isActive=false`. New vendors from the 6th account appear with
   `isActive=true`.
8. Click **+ Add Subscription** → form opens with Vendor name + Frequency
   + Monthly amount + Start month + Category labelled fields.
9. Fill: name "Stripe", monthly $50, frequency "Monthly", start month
   "Aug 2026", category "Software" → click Add.
10. Stripe appears in the vendor table alongside auto-detected vendors.

## Deviations from Plan

### Auto-fixed Issues

**[Rule 3 — Blocking] Test selector ambiguity in re-analyze Test 1**

- **Found during:** Task 4 GREEN — Test 1 in phase-51-step6-re-analyze.test.tsx
  failed because `screen.getByText(/Subscription Budgets/i)` matched both the
  table heading AND the success banner ("Subscription budgets saved
  successfully!") that appears after auto-save.
- **Fix:** Tightened the selector to `screen.getByRole('heading', { name:
  /Subscription Budgets/i })` — matches only the `<h3>` element.
- **Files modified:** src/__tests__/forecast/phase-51-step6-re-analyze.test.tsx
- **Commit:** Folded into 52d5ad7 (with the GREEN implementation, since the
  fix doesn't make sense without the implementation that makes the test
  reach the relevant assertion).

### Out-of-scope build error

`npx next build` fails on `/api/Xero/chart-of-accounts-full/route` with
`Error: supabaseUrl is required` — page-data collection requires
`SUPABASE_URL` env var which is not set in the worktree. This is **NOT a
regression introduced by this plan**: the affected route file was not touched.
The TypeScript compilation phase ("Checking validity of types") completed
successfully. Logged here for awareness; no fix attempted (Scope Boundary
rule).

## Self-Check: PASSED

- Files created (verified `[ -f path ]`):
  - FOUND: src/__tests__/forecast/phase-51-step6-sidebar.test.tsx
  - FOUND: src/__tests__/forecast/phase-51-step6-re-analyze.test.tsx
  - FOUND: src/__tests__/forecast/phase-51-step6-manual-entry.test.tsx
- Files modified:
  - FOUND: src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx (+206/-44)
- Commits (verified `git log --oneline`):
  - FOUND: 7632dd8 test(51-06): RED tests for Step 6 sidebar (UX-S6-01)
  - FOUND: 0462e55 test(51-06): RED tests for Step 6 re-analyze merge (UX-S6-02)
  - FOUND: 57c4b1e test(51-06): RED tests for Step 6 manual entry (UX-S6-03)
  - FOUND: 52d5ad7 feat(51-06): Step 6 sidebar + merge-on-re-analyze + always-visible Add Subscription (UX-S6-01/02/03)
- Quality gates:
  - npx tsc --noEmit → exit 0 (clean)
  - npx vitest run (23 tests across 4 files) → 23/23 green
  - npm run lint → 0 new warnings on Step6Subscriptions.tsx (1 pre-existing useEffect dep warning unchanged)
