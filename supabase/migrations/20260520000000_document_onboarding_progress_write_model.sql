-- =============================================================================
-- Document the onboarding_progress write model (comment-only migration).
-- =============================================================================
--
-- Context:
--   `onboarding_progress` has RLS ENABLED with a single policy:
--     "Users can view their business onboarding"  (FOR SELECT)
--   There is no INSERT / UPDATE / DELETE policy. A 2026-05-20 review of an
--   RLS-denial error ("new row violates row-level security policy for table
--   onboarding_progress") confirmed this is INTENTIONAL, not a missing policy:
--
--     - Reads are RLS-scoped: users see only their own business's onboarding
--       row (business_id is in the caller's user_roles).
--     - Writes (INSERT on create-client, DELETE on delete-client) happen ONLY
--       in admin routes -- src/app/api/admin/clients and admin/demo-client --
--       which authenticate the caller and check super_admin / coach role in
--       application code, then write via the service-role client (RLS bypassed).
--     - There is NO end-user write path. UPDATE happens nowhere in app code.
--
--   Writing via service-role from an already-authorized admin route is the
--   correct model here: the write authorization lives in the route, and the
--   create-client flow inserts this row before the caller's user_roles row
--   for the new business reliably exists -- so a USING/WITH CHECK policy keyed
--   on user_roles could not authorize that insert anyway.
--
-- What this migration does:
--   1. COMMENT ON TABLE  -- records the service-role-write design.
--   2. COMMENT ON POLICY -- records the SELECT policy intent, with the
--      'INTENT:' sentinel so grep-based audits do not re-flag the table.
--   3. DO ... RAISE EXCEPTION self-check -- fails the apply if either
--      comment did not land.
--
-- What this migration does NOT do:
--   - Does NOT add INSERT/UPDATE/DELETE policies (no end-user write path).
--   - Does NOT disable RLS or change the SELECT policy.
--   - Does NOT touch the onboarding_progress schema.
--
-- Rollback:
--   Set both comments back to NULL (COMMENT ... IS NULL). Trivially
--   reversible; no data effects.
-- =============================================================================

COMMENT ON TABLE "public"."onboarding_progress" IS
  'INTENT: per-business onboarding checklist. RLS ENABLED -- reads are scoped to the business''s users by the SELECT policy. Writes are service-role only by design: INSERT/DELETE happen exclusively in the admin create-client / delete-client routes, which authorize the caller in application code. No end-user write path exists, so the absence of an INSERT/UPDATE/DELETE policy is intentional. Confirmed 2026-05-20.';

COMMENT ON POLICY "Users can view their business onboarding"
  ON "public"."onboarding_progress" IS
  'INTENT: scopes SELECT to the caller''s businesses (business_id in user_roles for auth.uid()). Writes are service-role only -- see the table comment. Confirmed 2026-05-20.';

-- =============================================================================
-- Self-check: fail the migration if either COMMENT failed to land. A
-- COMMENT against a mistyped policy name is a silent no-op on some
-- PostgreSQL versions; this block introspects and raises so the apply
-- fails loudly rather than leaving an undocumented table.
-- =============================================================================
DO $onboarding_check$
DECLARE
  tbl_comment    text;
  policy_comment text;
BEGIN
  SELECT obj_description('public.onboarding_progress'::regclass, 'pg_class')
  INTO tbl_comment;

  IF tbl_comment IS NULL OR tbl_comment NOT LIKE '%INTENT:%' THEN
    RAISE EXCEPTION
      'onboarding_progress self-check failed: table COMMENT missing INTENT: sentinel';
  END IF;

  SELECT obj_description(p.oid, 'pg_policy')
  INTO policy_comment
  FROM   pg_policy   p
  JOIN   pg_class     c ON c.oid = p.polrelid
  JOIN   pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'public'
    AND  c.relname = 'onboarding_progress'
    AND  p.polname = 'Users can view their business onboarding';

  IF policy_comment IS NULL OR policy_comment NOT LIKE '%INTENT:%' THEN
    RAISE EXCEPTION
      'onboarding_progress self-check failed: policy COMMENT missing INTENT: sentinel (policy not found or comment not set)';
  END IF;
END;
$onboarding_check$;
