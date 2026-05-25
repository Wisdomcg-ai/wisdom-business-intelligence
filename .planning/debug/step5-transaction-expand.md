---
status: diagnosed
trigger: "Step 5 subscriptions — says X number of transactions but no detail coming through when I expand."
created: 2026-05-07
updated: 2026-05-07
---

## Current Focus

hypothesis: Vendors restored from saved-state on page load have `transactionCount > 0` but `transactions: []` hardcoded — expand reveals empty list.
test: Read Step6Subscriptions.tsx restore branch + DB schema for subscription_budgets.
expecting: DB only persists aggregate counts, restore initializes `transactions: []`.
next_action: Diagnose-only mode — return findings, no fix.

## Symptoms

expected: Clicking the chevron on a Step 5 (Subscriptions) vendor row that says "12 payments" expands to show the 12 individual transactions (date, description, amount, source).
actual: Row shows count (e.g., "12 payments") but expanding reveals nothing useful — falls through to "No transaction details available" copy on line 1429.
errors: None — silent UX bug. No console error.
reproduction:
  1. JDS forecast (or any business) — complete Step 5 Subscriptions analyze, save, navigate away or refresh page.
  2. Return to Step 5 — vendors are restored from `/api/subscription-budgets`.
  3. Click expand on any vendor with `transactionCount > 0`.
  4. Observe: expand shows "No transaction details available" + bare "First: | Last: ... | Span: 0 months" footer; per-FY transaction tables are not rendered.
started: Always — this is a pre-existing latent bug, not a Phase 57 regression. Phase 57 only swapped Step 5↔6 ordering and added `subscriptions` to wizard state; it didn't change this restore branch or the DB schema.

## Eliminated

- hypothesis: Phase 57 PR #129 B1 clobbered transaction detail field in wizard state
  evidence: Step6Subscriptions.tsx keeps its own local `vendors` state (line 230); transactions are NOT persisted in wizard state at all. Phase 57's `subscriptions` wizard-state addition is unrelated to per-vendor transaction render.
  timestamp: 2026-05-07

- hypothesis: `/api/Xero/subscription-transactions` API stopped returning transactions[]
  evidence: route.ts:1130-1136 explicitly maps and returns `transactions: v.transactions.map(t => ({date, description, amount, source, period}))`. Per-vendor `transactions[]` IS in the response after a fresh analyze.
  timestamp: 2026-05-07

- hypothesis: `mergeByVendorKey` (line 196) drops the `transactions` field
  evidence: It spreads `...newV` first, then only overrides `isActive` and `monthlyBudget` from existing. The new vendor's `transactions[]` is preserved. Not the culprit.
  timestamp: 2026-05-07

## Evidence

- timestamp: 2026-05-07
  checked: src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx
  found: TWO restore-from-DB branches both hardcode `transactions: []`:
    - `loadAccounts()` line 356 (Xero-mode restore branch — runs when accounts load successfully and saved budgets exist)
    - `loadExistingBudgets()` line 404 (manual-mode/fallback restore — same hardcode)
  implication: Any time the user loads Step 5 with previously saved budgets (i.e., any return visit), `transactions[]` is empty regardless of what the analyze response originally contained.

- timestamp: 2026-05-07
  checked: src/app/api/subscription-budgets/route.ts (POST upsert at lines 98-112)
  found: The persisted columns are: vendor_name, vendor_key, frequency, monthly_budget, last_12_months_spend, transaction_count, avg_transaction_amount, last_transaction_date, account_codes, is_active, notes. NO `transactions` JSONB column. NO per-transaction detail is ever saved.
  implication: Even if the restore branch wanted to repopulate `transactions[]`, there is no source — the DB doesn't store them. Round-tripping requires either persisting the array OR re-fetching from Xero on demand.

- timestamp: 2026-05-07
  checked: Step6Subscriptions.tsx render path lines 1349-1438
  found: Expand panel filters by `vendor.transactions.filter(t => t.period === 'current_fy')` (line 1355) and `'prior_fy'` (line 1392). When `transactions: []`, both filters yield length 0, both panels are hidden, and the fallback `vendor.transactions.length === 0` block at line 1428 renders "No transaction details available". The footer at line 1432 shows `First: | Last: | Span: 0 months` because `firstTransaction` is also reset to `''` (line 354) and `monthsSpan: 12` is fabricated (line 357). `lastTransaction` is restored from `last_transaction_date` so that one value survives, but it doesn't help the operator see individual line items.
  implication: Render is consistent with state — bug is upstream in the restore branch, not in the render or expand logic.

- timestamp: 2026-05-07
  checked: toggleVendorExpanded (line 510)
  found: Pure state toggle — no fetch-on-demand fallback. There is no code path that lazily fetches transactions when expand is clicked.
  implication: A clean fix can either (a) add lazy fetch on expand, or (b) re-run the analyze for restored vendors, or (c) persist the transaction list. Each has different cost/UX trade-offs (see Suggested Fix Direction).

- timestamp: 2026-05-07
  checked: Phase 57 changes (commit history check) and Phase 51 (UX-S6-01/02/03) annotations
  found: Phase 57 swap (Steps 5↔6) didn't touch the subscription restore branch. Phase 51 added `accountCodes`, manual-mode handling, and merge-by-key — none of which restore transactions[]. The `transactions: []` initializer existed before these phases.
  implication: This is a pre-existing latent bug exposed by routine usage (Matt's first review of Step 5 after re-opening the JDS forecast). Likely went unnoticed because the count display is correct and operators rarely expand on first analyze (when transactions ARE populated in memory).

## Resolution

root_cause: |
  src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx lines 356 and 404 hardcode `transactions: []` when restoring vendors from `/api/subscription-budgets`. The `subscription_budgets` DB table (src/app/api/subscription-budgets/route.ts:98-112) only persists aggregate fields (transaction_count, avg_transaction_amount, last_transaction_date) — NOT the per-transaction detail array. Result: on every page reload / return visit to Step 5, vendors come back with `transactionCount: N` but `transactions: []`, so expanding the row falls through to "No transaction details available" (line 1429) instead of rendering the per-FY transaction tables (lines 1355, 1392).

  Severity: Medium. UX/data-integrity bug — Matt cannot audit which Xero line items a vendor budget was derived from once he leaves the page. No incorrect numbers are produced; the count badge stays accurate. But the audit trail (the whole point of expand) is gone after first save.

  This is NOT a Phase 57 regression. The bug has existed since the restore branch was added (predates Phase 51 / 57).

fix: |
  Three viable directions, pick one based on willingness to change the DB schema:

  **Option A — Lazy fetch on expand (lowest risk, recommended)**
  - Modify `toggleVendorExpanded` (line 510) so when expanding a vendor whose `transactions.length === 0` AND `transactionCount > 0`, it triggers a per-vendor fetch to `/api/Xero/subscription-transactions` (or a new lighter endpoint scoped to one vendor_key + accountCodes).
  - Cache result in vendor.transactions; subsequent expand/collapse is instant.
  - Show a "Loading transactions…" placeholder during fetch.
  - Keeps DB schema unchanged. Re-uses existing API. ~30-50 lines.
  - Trade-off: Costs one Xero call per expanded vendor on first expand.

  **Option B — Persist the transactions array in DB**
  - Add `transactions JSONB` column (or sibling `subscription_budget_transactions` table) to `subscription_budgets`.
  - Update POST upsert in src/app/api/subscription-budgets/route.ts to include the array.
  - Update GET to return it. Update both restore branches (lines 356, 404) to use `b.transactions || []`.
  - Trade-off: DB row size grows (12 transactions × ~150 bytes ≈ 2KB/vendor). Migration required. Stale data after Xero sync (transactions may have been edited/voided in Xero since save).

  **Option C — Re-run analyze automatically on restore**
  - When `loadAccounts()` finds saved budgets, also auto-trigger `analyzeSubscriptions()` to refresh transaction detail.
  - Trade-off: Slow page load (Xero analyze can take 10-30s for full data). Bad UX. NOT recommended.

  **Recommendation: Option A.** Lazy fetch on expand. Matches the user's mental model ("I clicked expand, system fetches detail"), avoids DB migration, keeps page-load fast, and bounds Xero API cost to actual operator interest.

verification: Pending fix.
files_changed: []
