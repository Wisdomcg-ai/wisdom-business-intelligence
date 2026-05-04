-- Phase 44.2 Plan 06C.2 — Balance Sheet wide-compat view.
--
-- Mirrors xero_pl_lines_wide_compat (post-06A, migration 000004): aggregates per-account
-- into a balances_by_date jsonb column, exposing both account_id (canonical) and
-- account_code (informational), plus the basis stamp.
--
-- Key shape difference from P&L view:
--   xero_pl_lines_wide_compat.monthly_values   jsonb keyed by 'YYYY-MM'    (period range)
--   xero_bs_lines_wide_compat.balances_by_date jsonb keyed by 'YYYY-MM-DD' (point-in-time)
--
-- security_invoker=on ensures the view honours the caller's RLS context (super_admin /
-- accessible_business_ids) rather than the view-creator's privileges. Mirrors the
-- 20260429000004 pattern applied to xero_pl_lines_wide_compat.
--
-- CREATE OR REPLACE is sufficient here (vs DROP+CREATE) because the view is brand new —
-- there is no prior column ordering to preserve. (Migration 000004 had to DROP + CREATE
-- the P&L view because account_id was inserted before account_code, requiring column
-- reorder which CREATE OR REPLACE cannot do.)

CREATE OR REPLACE VIEW xero_bs_lines_wide_compat AS
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
GROUP BY
  business_id,
  tenant_id,
  account_id,
  account_code,
  account_name,
  account_type,
  section,
  basis;

ALTER VIEW xero_bs_lines_wide_compat SET (security_invoker = on);

COMMENT ON VIEW xero_bs_lines_wide_compat IS
  'Phase 44.2 06C.2 — wide-format BS compat view. balances_by_date jsonb keyed by YYYY-MM-DD (point-in-time, NOT period range — cf. xero_pl_lines_wide_compat.monthly_values keyed by YYYY-MM). security_invoker honoured.';
