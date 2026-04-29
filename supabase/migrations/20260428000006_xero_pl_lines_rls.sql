-- Phase 44 — restore RLS policy on xero_pl_lines after the long-format migration
--
-- Issue: 44-02 created a new long-format table and renamed v2 → xero_pl_lines.
-- The OLD policy `xero_pl_lines_access` was carried over to xero_pl_lines_wide_legacy
-- (the renamed old table). The NEW xero_pl_lines table has zero policies, so RLS
-- (which is enabled by default for tables in public schema in Supabase) blocks
-- ALL reads from authenticated users — including the wizard's pl-summary path.
--
-- Result the user sees: forecast wizard says "Xero not connected" even though
-- 1830 JDS rows exist in xero_pl_lines.
--
-- Fix: recreate the same policy on the new table, using the same helper
-- functions (auth_is_super_admin + auth_get_accessible_business_ids) that the
-- legacy policy used. Both helpers already exist in prod.
--
-- Compatibility: Studio-friendly — no DO blocks, no BEGIN/COMMIT, idempotent
-- via DROP IF EXISTS + CREATE.

ALTER TABLE "public"."xero_pl_lines" ENABLE ROW LEVEL SECURITY;

-- Drop policy if it exists (re-runable)
DROP POLICY IF EXISTS xero_pl_lines_access ON "public"."xero_pl_lines";

-- Recreate the legacy policy verbatim — uses the same helper functions,
-- so super_admin sees everything and authenticated users see rows for
-- businesses they can access (per auth_get_accessible_business_ids()).
CREATE POLICY xero_pl_lines_access ON "public"."xero_pl_lines"
  FOR ALL
  USING (
    auth_is_super_admin()
    OR (business_id = ANY (auth_get_accessible_business_ids()))
  );

-- Service role bypass — already implicit because service_role bypasses RLS,
-- but make it explicit for symmetry with sync_jobs/sync-orchestrator paths.
DROP POLICY IF EXISTS xero_pl_lines_service_role ON "public"."xero_pl_lines";
CREATE POLICY xero_pl_lines_service_role ON "public"."xero_pl_lines"
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON POLICY xero_pl_lines_access ON "public"."xero_pl_lines" IS
  'Phase 44 — mirrors xero_pl_lines_access policy from the legacy wide-format table. super_admin sees everything; other authenticated users see rows for businesses they can access (per auth_get_accessible_business_ids).';
