---
phase: 71-month-end-reporting-code-fixes-production-bugs-calxa-parity-scope-gaps-snapshot-serializer-remap
plan: 05
subsystem: monthly-report / subscription-analysis
tags: [S2, subscription-budgets, vendor-visibility, ui-badge, regression-test]
requirements: [S2]
provides:
  - budget-only-vendor-visibility-in-subscription-detail
  - transaction-count-field-on-vendor-line
  - not-billed-this-month-ui-badge
requires:
  - phase-71-01-canonical-vendor-keying-shared-util
affects:
  - src/app/api/monthly-report/subscription-detail/route.ts
  - src/app/finances/monthly-report/components/SubscriptionAnalysisTab.tsx
  - src/app/finances/monthly-report/types.ts
  - src/__tests__/api/subscription-detail-budget-only.test.ts
tech_stack:
  added: []
  patterns:
    - "backfill-zero-actual entries from subscription_budgets so vendor map is complete before response build"
    - "per-vendor transaction_count tracked on accumulator (not derived from amount sign)"
    - "UI badge gated on (transaction_count===0 && budget>0) — disambiguates 'unbilled this month' from 'genuinely $0'"
key_files:
  created:
    - src/__tests__/api/subscription-detail-budget-only.test.ts
  modified:
    - src/app/api/monthly-report/subscription-detail/route.ts
    - src/app/finances/monthly-report/components/SubscriptionAnalysisTab.tsx
    - src/app/finances/monthly-report/types.ts
decisions:
  - "Backfill keys by row.vendor_key (persisted canonical) instead of re-deriving createVendorKey(row.vendor_name) — bank-tx side canonicalizes via extractVendorName which collapses VENDOR_MAPPINGS (e.g. 'Stripe Au'→'Stripe'). Re-keying from display name would create phantom second rows for the same vendor (caught by Test 3 in RED→GREEN)."
  - "Schema reality: subscription_budgets uses `account_codes` (text[]) and `monthly_budget` — NOT the plan-spec's `account_code`/`monthly_amount`. Iterate per code in the array per row."
  - "Kept the existing `.filter(a => a.vendors.length > 0)` account-level filter: now that budget-only vendors backfill into vendorData, this only drops accounts with NEITHER bank-tx NOR budget rows (genuine noise)."
  - "transaction_count made required (not optional) on SubscriptionVendorLine — single producer (this route), single consumer (this tab), and a fallback (`?? 0`) in the badge gate keeps any future snapshot replays safe."
metrics:
  duration_minutes: 4
  duration_human: "~4 min"
  tasks_completed: 2
  files_created: 1
  files_modified: 3
  commits: 2
  tests_added: 4
  tests_passing: 4
  completed_at: "2026-05-31T00:19:49Z"
---

# Phase 71 Plan 05: S2 — Subscription budget-only vendor visibility — Summary

**One-liner:** Subscription detail now surfaces budgeted vendors with no current-month bank transactions (annual subs in off-month, unbilled SaaS, mis-mapped contacts) as zero-actual rows tagged "not billed this month" — instead of silently filtering them out at the response boundary.

## What changed

**`src/app/api/monthly-report/subscription-detail/route.ts`** — three coordinated edits:

1. **`vendorData` accumulator** (~line 174-204): added `transaction_count: number` to the per-vendor record; `addLineItem` now increments it on every current-month bank-tx line that lands on the vendor.
2. **Budget fetch** (~line 250-300): widened `subscription_budgets` SELECT to include `vendor_name` and `account_codes` (was just `vendor_key, monthly_budget`); kept rows in `budgetRows` for the backfill loop.
3. **Backfill loop** (~line 282-302): for each active budget row, for each `account_code ∈ row.account_codes` that is in the request's requested set, insert a zero-actual placeholder into `vendorData[code][row.vendor_key]` if no bank-tx vendor already exists at that key. Keys by the persisted `row.vendor_key` rather than `createVendorKey(row.vendor_name)` so it matches the bank-tx side's canonical keying (which routes through `extractVendorName` and collapses VENDOR_MAPPINGS).
4. **Response build** (~line 415-425): emits `transaction_count` on each vendor line. The existing `.filter(a => a.vendors.length > 0)` account-level filter is preserved — it now only drops accounts that have NEITHER bank-tx NOR budget rows, which is desirable noise reduction.

**`src/app/finances/monthly-report/types.ts`** — added required `transaction_count: number` field on `SubscriptionVendorLine` with a doc-comment explaining the badge contract.

**`src/app/finances/monthly-report/components/SubscriptionAnalysisTab.tsx`** — added `isBudgetOnly = (vendor.transaction_count ?? 0) === 0 && vendor.budget > 0` gate. When true:
- Renders an amber "not billed this month" pill next to the vendor name (alongside the existing "NEW" pill for `isUnbudgeted`).
- Dims the actual-cell text (`text-gray-500` instead of `text-gray-900`).
- Soft amber row background (`bg-amber-50/20`).

**`src/__tests__/api/subscription-detail-budget-only.test.ts`** (new, 377 LOC) — 4-test regression file:
1. Budget-only vendor appears with `actual=0`, `prior_month_actual=0`, `transaction_count=0`, `budget=25`.
2. Existing transacted vendor preserved with `actual=50`, `transaction_count=1`.
3. Mixed — both budget-only (LastPass on 415) and transacted (Stripe on 440) surface in the same response.
4. Unbudgeted Xero vendor (Adobe with bank-tx, no budget row) still visible with `budget=0`.

Mocks: `@supabase/supabase-js` via fixture-driven chainable; `@/lib/xero/token-manager`; section-permission gate; `resolveBusinessIds`; and a global `fetch` stub that hands back canned `BankTransactions`/`Accounts` JSON keyed on a per-call counter (call 1 = current month, call 2 = prior month).

## Tasks completed

| # | Task                                                                       | Status | Commit     |
| - | -------------------------------------------------------------------------- | ------ | ---------- |
| 1 | Write failing test for budget-only vendor visibility (RED)                 | done   | `99771d9c` |
| 2 | Backfill budgets + add transaction_count + UI badge + type update (GREEN)  | done   | `35c1440f` |

## Verification

- `npx vitest run src/__tests__/api/subscription-detail-budget-only.test.ts --reporter=verbose` → **4/4 PASS** (1.62s).
- `grep -c "transaction_count" src/app/api/monthly-report/subscription-detail/route.ts` → **7** (≥1 required).
- `grep -c "not billed this month" src/app/finances/monthly-report/components/SubscriptionAnalysisTab.tsx` → **1** (=1 required).
- Per memory `feedback_executor_scoped_tests`: scoped vitest only, no full-suite run (other waves in parallel).
- `npx tsc --noEmit` on touched files: clean. (Pre-existing TS errors in `page.tsx` from parallel Wave 2 71-04 work are out of scope per the SCOPE BOUNDARY rule.)

## Deviations from Plan

**1. [Rule 1 — Bug] Backfill keyed by `vendor_key` (not `createVendorKey(vendor_name)`)**
- **Found during:** Task 2 GREEN — Test 3 initially returned `[Stripe, Stripe Au]` (two rows for the same vendor) instead of `[Stripe]`.
- **Root cause:** Bank-tx side keys via `createVendorKey(extractVendorName('Stripe Au', ''))` = `createVendorKey('Stripe')` = `'stripe'` (collapse through `VENDOR_MAPPINGS`). My initial backfill used `createVendorKey(row.vendor_name)` = `createVendorKey('Stripe Au')` = `'stripeau'` — different key, phantom second row.
- **Fix:** Use the persisted `row.vendor_key` (which was originally derived through the same canonical path at save time in `src/app/api/subscription-budgets/route.ts`) with `createVendorKey(row.vendor_name)` as a defensive fallback.
- **Files modified:** `src/app/api/monthly-report/subscription-detail/route.ts` (one line + a multi-line comment block).
- **Commit:** `35c1440f`.
- **Why this is correctness, not preference:** without this, the very fix we're shipping would itself produce duplicate vendor rows in the response — strictly worse than the pre-fix "vendor invisible" failure mode.

**2. [Rule 2 — Missing critical context in plan] Schema column-name divergence**
- **Plan spec said:** `subscription_budgets` has `{ vendor_name, account_code, frequency, monthly_amount, renewal_month, is_active }`.
- **Production schema reality** (`supabase/migrations/00000000000000_baseline_schema.sql:4916`): `account_codes` is `text[]` (not `text`), `monthly_budget` is the column (not `monthly_amount`).
- **Fix:** Test fixtures + route code align with the live schema. Backfill loop iterates per-code in the array. No data shape change to anything persisted.
- **Files modified:** test file + route SELECT clause.
- **Net effect:** no functional difference vs. plan intent; just calibrated against real schema instead of plan-doc shorthand.

Per memory `feedback_executor_schema_deviations`: schema divergences flagged + verified against `baseline_schema.sql` before code lands.

## Auth gates

None encountered — Supabase + Xero are fully mocked in the regression test; the route's existing auth flow (createRouteHandlerClient → user.id check → section-permission gate) was preserved unchanged.

## Out-of-scope / deferred

- Pre-existing TS errors in `src/app/finances/monthly-report/page.tsx` referring to `collectCommentaryTriggers` and `stripReason` — these belong to Wave 2's Plan 71-04 (S1 commentary trigger expansion) which is in-flight in parallel. Not from this plan's edits; not fixed.
- No PDF/snapshot-serializer changes were needed. `transaction_count` is purely a runtime UI field; snapshots that capture vendor lines today will replay through the same UI which gracefully falls back via `?? 0` if the field is absent on historical snapshots.

## Self-Check: PASSED

- File `src/__tests__/api/subscription-detail-budget-only.test.ts` — FOUND.
- File `src/app/api/monthly-report/subscription-detail/route.ts` modification (backfill + transaction_count) — FOUND (7 `transaction_count` hits).
- File `src/app/finances/monthly-report/components/SubscriptionAnalysisTab.tsx` modification — FOUND (1 `not billed this month` hit).
- File `src/app/finances/monthly-report/types.ts` modification — FOUND (`SubscriptionVendorLine.transaction_count: number`).
- Commit `99771d9c` (test RED) — FOUND in `git log --oneline -3`.
- Commit `35c1440f` (feat GREEN) — FOUND in `git log --oneline -3`.
- Test suite — 4/4 PASS verified via direct `vitest run` invocation (1.62s).
