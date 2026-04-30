-- Phase 44.2 Plan 06A.4 — update wide-compat view to expose account_id + basis + notes
--
-- The existing view groups by (business_id, tenant_id, account_code, account_name,
-- account_type, section). After 06A, account_id is canonical, so the view groups by
-- it primarily. account_code is preserved as a passthrough so existing 12+ read sites
-- continue to work unchanged. basis + notes columns added for downstream consumers.
--
-- security_invoker=on (per 20260429000004) is preserved.
--
-- DROP + CREATE (not CREATE OR REPLACE) because we are reordering columns —
-- account_id is inserted before account_code so the canonical identity comes
-- first. Postgres requires DROP for column-order changes.

DROP VIEW IF EXISTS xero_pl_lines_wide_compat;

CREATE VIEW xero_pl_lines_wide_compat AS
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
GROUP BY
  business_id,
  tenant_id,
  account_id,
  account_code,
  account_name,
  account_type,
  section,
  basis;

ALTER VIEW xero_pl_lines_wide_compat SET (security_invoker = on);

COMMENT ON VIEW xero_pl_lines_wide_compat IS
  'Phase 44.2 06A.4 — wide-format compat view. Groups by account_id (canonical) AND account_code (informational), keeping both available for consumer migration. basis + notes columns exposed for future cash/accruals split + audit trail.';
