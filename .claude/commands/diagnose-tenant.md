---
description: Run a standard read-only financial diagnostic for one tenant (Xero connection, P&L, BS, reconciliation, forecast)
argument-hint: <tenant name or businesses.id>
---

Produce a standard, **read-only** financial diagnostic for the tenant given in
`$ARGUMENTS` (a business name like "JDS" / "Dragon" / "IICT" / "Fit2Shine", or a
`businesses.id` UUID). This replaces hand-writing one-off `scripts/diag-*.ts`
files — only fall back to a throwaway script if a check genuinely needs one.

Connect with the service-role client using `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`) — model the connection on `scripts/verify-production-migration.ts`.
**Do not write to the database. Read only.**

Steps:

1. **Resolve the tenant.** If given a name, look it up in `businesses`. Report
   BOTH `businesses.id` and the matching `business_profiles.id` — the dual-ID
   pair — so downstream checks are unambiguous.

2. **Xero connection.** From `xero_connections`: are there active connection
   rows? tenant_id(s), `is_active`, `include_in_consolidation`, last sync time,
   token-expiry health.

3. **P&L snapshot.** From `xero_pl_lines` (or the wide-compat view): most recent
   3 months — revenue, gross profit, net profit totals per month. Flag months
   with zero/missing data.

4. **Balance Sheet snapshot.** Most recent BS — confirm Assets = Liabilities +
   Equity balances; flag any imbalance.

5. **Reconciliation.** Unreconciled transaction count for the latest month.

6. **Forecast.** Is there a `financial_forecasts` row for the current FY? Note
   `updated_at`.

Report as a compact summary per section, then a one-line **health verdict**
(healthy / needs attention / broken) with the specific issue if not healthy.

If the tenant is multi-entity (Dragon, IICT), run sections 2-5 per entity and
note the consolidation rollup.
