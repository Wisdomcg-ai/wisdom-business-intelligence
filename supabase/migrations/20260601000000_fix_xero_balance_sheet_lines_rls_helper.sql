-- ============================================================
-- R2 / SEC-N6 — Standardize xero_balance_sheet_lines RLS onto the
-- canonical access helper.
--
-- PROBLEM
-- -------
-- The original policy created in 20260420032941_consolidation_bs_translation.sql
-- was hand-rolled:
--
--   USING (EXISTS (
--     SELECT 1 FROM businesses b
--     WHERE b.id = xero_balance_sheet_lines.business_id
--       AND (b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid())
--   ))
--
-- That predicate only grants visibility to a business's OWNER or ASSIGNED COACH.
-- It silently omits two cohorts that the canonical helper
-- auth_get_accessible_business_ids() (baseline_schema.sql:155) includes:
--
--   1. ACTIVE TEAM MEMBERS — rows in business_users where status = 'active'.
--      → an active team member cannot see ANY consolidated balance-sheet row
--        for their own business (the "I can see the P&L but the Balance Sheet
--        is blank" report-visibility incident).
--   2. The PROFILE-ID BRIDGE — business_profiles.id keyed rows. Any row keyed on
--      a business_profiles.id (rather than businesses.id) is invisible to every
--      non-super-admin, because the hand-rolled predicate only matches b.id.
--
-- Its sibling money tables xero_pl_lines (20260428000006_xero_pl_lines_rls.sql)
-- and xero_bs_lines (20260430000010_xero_bs_lines.sql) both already use the
-- canonical form. This migration brings xero_balance_sheet_lines into line so all
-- three Xero money/line tables share ONE row-visibility contract.
--
-- FIX
-- ---
-- Replace the three ad-hoc policies (coach_all + super_admin_all + service_role)
-- with the canonical pair used by the sibling tables:
--
--   <table>_access        FOR ALL
--     USING (auth_is_super_admin()
--            OR business_id = ANY (auth_get_accessible_business_ids()))
--   <table>_service_role  FOR ALL TO service_role USING (true) WITH CHECK (true)
--
-- The new _access policy folds in super-admin visibility via auth_is_super_admin(),
-- so the standalone _super_admin_all policy becomes redundant and is dropped.
-- Both helpers already exist in prod (granted to anon/authenticated/service_role
-- in baseline_schema.sql) and are used by the sibling-table policies.
--
-- NO DATA CHANGE. Policy-only. This BROADENS read visibility to the correct set
-- of users (active team members + profile-bridge rows); it does not grant access
-- to anyone outside auth_get_accessible_business_ids().
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE. Studio-friendly: no DO blocks,
-- no BEGIN/COMMIT.
-- ============================================================

ALTER TABLE "public"."xero_balance_sheet_lines" ENABLE ROW LEVEL SECURITY;

-- Remove the hand-rolled, owner/coach-only policy (the SEC-N6 defect).
DROP POLICY IF EXISTS "xero_balance_sheet_lines_coach_all"
  ON "public"."xero_balance_sheet_lines";

-- Remove the now-redundant standalone super-admin policy — super-admin
-- visibility is folded into the canonical _access policy below.
DROP POLICY IF EXISTS "xero_balance_sheet_lines_super_admin_all"
  ON "public"."xero_balance_sheet_lines";

-- Canonical read/write access policy — identical in shape to
-- xero_pl_lines_access and xero_bs_lines_access. super_admin sees everything;
-- every other authenticated user sees rows for businesses they can access
-- (owner, assigned coach, ACTIVE team member, or via the profile-id bridge),
-- per auth_get_accessible_business_ids().
DROP POLICY IF EXISTS "xero_balance_sheet_lines_access"
  ON "public"."xero_balance_sheet_lines";
CREATE POLICY "xero_balance_sheet_lines_access"
  ON "public"."xero_balance_sheet_lines"
  FOR ALL
  USING (
    "public"."auth_is_super_admin"()
    OR ("business_id" = ANY ("public"."auth_get_accessible_business_ids"()))
  );

-- Explicit service_role bypass — matches sibling tables. service_role already
-- bypasses RLS, but the explicit policy keeps the sync-orchestrator path
-- symmetric with xero_pl_lines / xero_bs_lines.
DROP POLICY IF EXISTS "xero_balance_sheet_lines_service_role"
  ON "public"."xero_balance_sheet_lines";
CREATE POLICY "xero_balance_sheet_lines_service_role"
  ON "public"."xero_balance_sheet_lines"
  FOR ALL TO "service_role"
  USING (true) WITH CHECK (true);

COMMENT ON POLICY "xero_balance_sheet_lines_access"
  ON "public"."xero_balance_sheet_lines" IS
  'R2/SEC-N6 — mirrors xero_pl_lines_access / xero_bs_lines_access. super_admin sees everything; other authenticated users see rows for businesses they can access (owner, assigned coach, active team member, or profile-id bridge) per auth_get_accessible_business_ids(). Replaces the hand-rolled owner/coach-only policy that hid consolidated BS rows from active team members and all profile-keyed rows.';
