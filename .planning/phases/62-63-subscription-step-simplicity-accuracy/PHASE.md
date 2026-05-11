# Phase 62/63 — Subscription Step Simplicity + Accuracy

Combined phase bundle. Operator (2026-05-12) explicitly requested both items shipped together as one PR — they reinforce each other and touch the same surface.

## Goal

Step 5 (Subscriptions) of the forecast wizard becomes **simple and honest**:
- **No confusing reconciliation variance** — drop the "P&L Reconciliation Check" panel that surfaces a -39% / -94% variance the operator can't act on.
- **Native rhythm for annual subs** — Adobe shows as "$1,200/yr (paid Mar)" not "$100/mo". Slack stays "$50/mo".
- **One honest summary** — single top-of-step line: "Total annual subscription budget: $3,420 ($185/mo avg + $1,680 annual lumps)".
- **Single-input manual entry** — add a vendor by choosing frequency + amount, no mental math between monthly/annual.

## Why now

Discovered during JDS testing 2026-05-12:
- The reconciliation panel showed Transactions Analyzed = $196k vs Xero P&L Actual = $322k (-39% variance). Operator response: "this is becoming very complex".
- Currently every vendor displays "$X/mo" regardless of actual frequency. Annual subs are silently smoothed into monthly. Operator forgets that an annual sub will hit cashflow as a lump in its renewal month.
- The wizard had become a leaky abstraction over Xero P&L data. Operator needs subscription FORECASTING, not P&L reconciliation.

CFO-grade accuracy + the user's design philosophy (simplicity over completeness) demand we fix both at once.

## Scope

### 62-01 — Drop reconciliation panel + replace with honest sentence

**Files modified:** `src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx`, `src/app/api/Xero/subscription-transactions/route.ts` (the `reconciliation` block in response — leave server-side fetch for now, just stop rendering)

Replace the existing reconciliation panel with:
> "We identified {N} recurring vendors totaling ${X}/mo. Other spending in these accounts (${Y}/mo) won't be in this forecast — budget those under OpEx (Step 6)."

Computes Y as `(priorFY total of selected accounts from Xero P&L Actual) - sum(vendor.priorFYAmount)` — the residual that doesn't fit a recurring pattern.

### 62-02 — Simplified top summary card

Replace current 3-5 stat cards with ONE primary line:
> "Total annual: $3,420 = $185/mo avg + $1,680 in annual one-offs"

Smaller secondary line below with the same data shown month-by-month: "Hits: $185/mo every month, $1,200 in Mar (Adobe), $480 in Jul (X)."

### 63-01 — DB migration: renewal_month column

```sql
ALTER TABLE public.subscription_budgets
  ADD COLUMN IF NOT EXISTS renewal_month smallint
  CHECK (renewal_month IS NULL OR (renewal_month >= 1 AND renewal_month <= 12));
```

NULL when the vendor isn't annual (monthly subs don't have a single renewal month). Set 1-12 (Jan-Dec) for annual.

### 63-02 — Analyze API persists renewal_month

In `/api/Xero/subscription-transactions/route.ts`:
- Add `renewalMonth: number | null` to `VendorSummary`
- When `suggestedFrequency === 'annual'`, derive from `lastTransaction.getMonth() + 1`
- For monthly/quarterly/ad-hoc, leave NULL

`/api/subscription-budgets/route.ts` POST handler:
- Accept `renewalMonth: number | null` from payload
- Write `renewal_month: b.renewalMonth ?? null`

### 63-03 — Vendor row native-rhythm display

In Step6 vendor list:
- If `frequency === 'annual'`: render "$1,200/yr (paid Mar)" using `renewalMonth` for the month label
- If `frequency === 'quarterly'`: render "$300/qtr"
- If `frequency === 'monthly' || 'ad-hoc'`: render "$X/mo" (current)

### 63-04 — Manual vendor input — single-input + frequency toggle

Today's manual-add form asks for `monthlyBudget` directly. Replace with:
- Frequency dropdown: Monthly / Quarterly / Annual / Ad-hoc
- Amount input: labelled dynamically ("$/mo" / "$/qtr" / "$/yr")
- For Annual: also show "Renewal month" dropdown (Jan-Dec)
- Internally: compute and persist `monthlyBudget` (smoothed) + `renewalMonth` + `frequency` from the inputs

## Out of scope (deferred)

- **Cashflow burst** — annual subs should appear as $0 in non-renewal months + full annual amount in renewal month in cashflow forecasts. Different file (`cashflow/*`). Phase 64 candidate.
- **Renewal month manual override during analyze** — operator can edit a vendor's renewal month in the wizard, but for analyze auto-detection we just use lastTransactionDate. Edit path lives in 63-04 (manual add form) + an inline edit in the vendor row (deferred).
- **Quarterly subs renewal quarter** — quarterly subs hit 4 times/yr, no single "renewal" month. Treat as smoothed monthly for now. Phase 64+ when we wire cashflow burst.
- **P&L reconciliation logic in the analyze API** — keep returning `reconciliation` in the API response (other consumers may use it later), just don't render in Step 5.

## Dependencies

- Phase 61 (`current_fy_spend` column + degraded-shape detection) on main as `69c80a79` ✅
- Migration SQL applied to prod Supabase (operator did this 2026-05-12) ✅
- PR #168 (per-vendor accountCodes) on main as `74bbcd05` ✅

## Success criteria

After this phase ships:

1. Step 5 has **no reconciliation panel**. Single sentence below the vendor list explaining non-recurring spend.
2. JDS Step 5 shows: each annual vendor in "$X/yr (Mon)" format; monthly vendors stay "$X/mo".
3. The top of the step shows ONE primary line: "Total annual: $X = $Y/mo avg + $Z in annual one-offs".
4. Adding a manual vendor: pick frequency → enter amount in that frequency's unit → done. No monthly/annual mental math.
5. After re-analyze with the new code: every annual sub in DB has `renewal_month` set (1-12); monthly subs have NULL.
6. Build + typecheck + vitest + lint all green.
7. Existing Step6 regression tests pass.

## Risk + rollback

- **Risk**: dropping the reconciliation panel removes a visible "is my data accurate?" check. Mitigation: the replacement sentence directs the operator at the right next step.
- **Risk**: rendering changes touch a busy file (~1700 LoC). Mitigation: per-batch commits, run all existing Step6 tests after each change, no schema-level changes to existing data.
- **Rollback**: revert PR. Schema column stays (idempotent, harmless). Operator UI returns to current confusing state but nothing breaks.
