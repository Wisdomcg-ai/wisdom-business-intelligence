-- W0.1 — basis guard on the xero wide-compat views.
--
-- WHY THIS EXISTS
--
-- xero_pl_lines / xero_bs_lines both carry a `basis` column. Every row in
-- production today is 'accruals' — nothing has ever written 'cash'. The wide
-- compat views GROUP BY basis, so they emit one row per (account, basis).
--
-- The problem is what happens the first time a cash row is written. As of this
-- migration there are 16 read sites over xero_pl_lines_wide_compat and NOT ONE
-- of them filters basis (the only two `eq('basis')` mentions in the repo are
-- write-side parsers stamping the value). The failure mode is silent, not loud:
--
--   ForecastReadService.aggregateXeroRows  (monthly report, forecast wizard,
--                                           dashboard, cashflow)
--     agg.monthly_values[m] = (existing ?? 0) + amt
--       -> accrual + cash SUMMED, roughly doubling every figure
--
--   api/monthly-report/generate
--     existing.monthly_values = { ...existing, ...row.monthly_values }
--       -> cash silently OVERWRITES accrual, ordered by however rows arrive
--
-- Nothing throws. The numbers just move. So the guard has to land — and be
-- verified — BEFORE any cash row exists, not in the same release as the feature
-- that writes one.
--
-- WHAT THIS DOES
--
-- Restricts both views to the accruals basis. Today that is a strict no-op:
-- 9,195 PL rows and 7,806 BS rows, all 'accruals'. Byte-identical output, zero
-- behaviour change, which is exactly what makes it safe to ship on its own.
--
-- It also closes a second, dormant gap on the P&L view: xero_pl_lines carries
-- soft-delete columns (deleted_at / deleted_by) and the metric-invariant cron
-- filters them, but this view never did. Zero soft-deleted rows exist today, so
-- it has never bitten. xero_bs_lines has no deleted_at column, so only the P&L
-- view gets that predicate.
--
-- `basis = 'accruals'` is a deliberate allowlist rather than `basis <> 'cash'`:
-- if a third basis ever appears these views stay accruals-only instead of
-- silently widening.
--
-- FOLLOW-ON (NOT THIS MIGRATION)
--
-- Cash-basis support needs, in order: this guard deployed and verified, then
-- the natural key extended to include basis
--   UNIQUE (business_id, tenant_id, account_id, period_month, basis)
-- plus the matching onConflict in sync-orchestrator, then sibling
-- `*_cash_wide_compat` views, and only then rows from
-- Reports/ProfitAndLoss?paymentsOnly=true. Those belong to the cash-basis work,
-- not here — this file's only job is to make that work safe to attempt.
--
-- CREATE OR REPLACE is sufficient: the column list and its order are unchanged,
-- only a WHERE clause is added. security_invoker is re-asserted afterwards
-- rather than assumed to survive the replace (same defensiveness as re-issuing
-- revokes after a DROP+CREATE).

CREATE OR REPLACE VIEW public.xero_pl_lines_wide_compat AS
SELECT
  business_id,
  tenant_id,
  account_id,
  account_code,
  account_name,
  account_type,
  section,
  basis,
  jsonb_object_agg(to_char(period_month, 'YYYY-MM'), amount) AS monthly_values,
  min(created_at) AS created_at,
  max(updated_at) AS updated_at
FROM xero_pl_lines
WHERE basis = 'accruals'
  AND deleted_at IS NULL
GROUP BY
  business_id,
  tenant_id,
  account_id,
  account_code,
  account_name,
  account_type,
  section,
  basis;

ALTER VIEW public.xero_pl_lines_wide_compat SET (security_invoker = on);

COMMENT ON VIEW public.xero_pl_lines_wide_compat IS
  'READ-ONLY wide-shaped projection over long-format xero_pl_lines. W0.1: restricted to basis=''accruals'' and deleted_at IS NULL — no consumer filters basis, so an unfiltered view would double or overwrite every P&L figure the moment a cash row exists. Cash consumers must use a dedicated cash view, never this one. security_invoker honoured.';

CREATE OR REPLACE VIEW public.xero_bs_lines_wide_compat AS
SELECT
  business_id,
  tenant_id,
  account_id,
  account_code,
  account_name,
  account_type,
  section,
  basis,
  jsonb_object_agg(to_char(balance_date, 'YYYY-MM-DD'), balance) AS balances_by_date,
  min(created_at) AS created_at,
  max(updated_at) AS updated_at
FROM xero_bs_lines
WHERE basis = 'accruals'
GROUP BY
  business_id,
  tenant_id,
  account_id,
  account_code,
  account_name,
  account_type,
  section,
  basis;

ALTER VIEW public.xero_bs_lines_wide_compat SET (security_invoker = on);

COMMENT ON VIEW public.xero_bs_lines_wide_compat IS
  'READ-ONLY wide-format BS compat view. balances_by_date jsonb keyed by YYYY-MM-DD (point-in-time, NOT period range — cf. xero_pl_lines_wide_compat.monthly_values keyed by YYYY-MM). W0.1: restricted to basis=''accruals'' for the same reason as the P&L view. xero_bs_lines has no deleted_at column, so no soft-delete predicate here. security_invoker honoured.';
