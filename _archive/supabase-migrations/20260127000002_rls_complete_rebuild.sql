-- ============================================================================
-- COMPLETE RLS REBUILD - SINGLE SOURCE OF TRUTH
-- ============================================================================
-- Created: 2026-01-27
-- Purpose: Replace ALL existing RLS with a clean, robust, best-practice system
--
-- This migration:
-- 1. Drops ALL existing RLS functions (clean slate)
-- 2. Creates a minimal set of well-designed helper functions
-- 3. Creates consistent policies across ALL tables
-- 4. Adds performance indexes
-- 5. Includes verification queries
--
-- Design Principles:
-- - SECURITY DEFINER functions to prevent recursion
-- - SQL language over PL/pgSQL for performance
-- - STABLE functions for query optimizer caching
-- - Explicit search_path for security
-- - Consistent patterns across all tables
-- - Clear separation of concerns
--
-- Access Levels:
-- 1. Super Admin: Full access to everything
-- 2. Coach: Access to assigned clients' businesses
-- 3. Business Owner: Access to owned businesses
-- 4. Team Member: Access to businesses they're members of (via business_users)
--
-- References:
-- - https://supabase.com/docs/guides/database/postgres/row-level-security
-- - https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
-- - https://github.com/orgs/supabase/discussions/1138
-- ============================================================================

-- ============================================================================
-- PHASE 1: CLEAN SLATE - DROP ALL EXISTING FUNCTIONS
-- ============================================================================
-- Drop every RLS-related function to ensure no conflicts

DROP FUNCTION IF EXISTS is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS is_super_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS is_admin() CASCADE;
DROP FUNCTION IF EXISTS is_coach() CASCADE;
DROP FUNCTION IF EXISTS is_coach_for_business(uuid) CASCADE;
DROP FUNCTION IF EXISTS is_coach_for_business(text) CASCADE;
DROP FUNCTION IF EXISTS is_business_owner(uuid) CASCADE;
DROP FUNCTION IF EXISTS is_business_owner(text) CASCADE;
DROP FUNCTION IF EXISTS is_team_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS is_team_member(text) CASCADE;
DROP FUNCTION IF EXISTS has_business_access(uuid) CASCADE;
DROP FUNCTION IF EXISTS has_business_access(text) CASCADE;
DROP FUNCTION IF EXISTS has_direct_business_access(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS is_business_team_member(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS rls_is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS rls_user_owned_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_coached_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_team_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_all_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_all_businesses_text() CASCADE;
DROP FUNCTION IF EXISTS get_user_role() CASCADE;
DROP FUNCTION IF EXISTS check_business_access(uuid) CASCADE;

-- ============================================================================
-- PHASE 2: CREATE CORE HELPER FUNCTIONS
-- ============================================================================
-- These functions are the ONLY RLS helpers. They use SECURITY DEFINER to
-- bypass RLS when checking access, preventing infinite recursion.
--
-- Key design decisions:
-- - All functions use SQL language (faster than PL/pgSQL for simple queries)
-- - All functions are STABLE (results don't change within a transaction)
-- - All functions set search_path = public for security
-- - Function names are prefixed with 'auth_' to clearly identify their purpose
-- ============================================================================

-- ----------------------------------------------------------------------------
-- auth_is_super_admin()
-- Returns TRUE if the current user has super_admin role
-- This is the most privileged check - super admins see everything
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
$$;

COMMENT ON FUNCTION auth_is_super_admin() IS
'Returns TRUE if current user is a super_admin. Used in all RLS policies as the highest privilege check.';

-- ----------------------------------------------------------------------------
-- auth_get_accessible_business_ids()
-- Returns array of ALL business UUIDs the current user can access
-- This combines: owned + coached + team member businesses
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_get_accessible_business_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      -- Businesses user owns
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      -- Businesses user coaches
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
      UNION
      -- Businesses user is a team member of (active only)
      SELECT business_id FROM business_users
      WHERE user_id = auth.uid()
      AND status = 'active'
    ),
    '{}'::UUID[]
  );
$$;

COMMENT ON FUNCTION auth_get_accessible_business_ids() IS
'Returns array of all business IDs the current user can access (owned, coached, or team member). Core function for RLS.';

-- ----------------------------------------------------------------------------
-- auth_get_accessible_business_ids_text()
-- Same as above but returns TEXT[] for tables with TEXT business_id columns
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_get_accessible_business_ids_text()
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT id::TEXT FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT id::TEXT FROM businesses WHERE assigned_coach_id = auth.uid()
      UNION
      SELECT business_id::TEXT FROM business_users
      WHERE user_id = auth.uid()
      AND status = 'active'
    ),
    '{}'::TEXT[]
  );
$$;

COMMENT ON FUNCTION auth_get_accessible_business_ids_text() IS
'TEXT version of auth_get_accessible_business_ids for tables with TEXT business_id columns.';

-- ----------------------------------------------------------------------------
-- auth_is_team_member_of(business_id)
-- Returns TRUE if current user is an active team member of the given business
-- Used specifically for the businesses table to allow team members to see it
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_is_team_member_of(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_users
    WHERE business_id = check_business_id
    AND user_id = auth.uid()
    AND status = 'active'
  );
$$;

COMMENT ON FUNCTION auth_is_team_member_of(UUID) IS
'Returns TRUE if current user is an active team member of the specified business.';

-- ----------------------------------------------------------------------------
-- auth_can_manage_business(business_id)
-- Returns TRUE if current user can manage (INSERT/UPDATE/DELETE) the business
-- This is more restrictive than read access - excludes regular team members
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_can_manage_business(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Owner can manage
    SELECT 1 FROM businesses
    WHERE id = check_business_id
    AND owner_id = auth.uid()
  ) OR EXISTS (
    -- Assigned coach can manage
    SELECT 1 FROM businesses
    WHERE id = check_business_id
    AND assigned_coach_id = auth.uid()
  ) OR EXISTS (
    -- Team members with owner/admin role can manage
    SELECT 1 FROM business_users
    WHERE business_id = check_business_id
    AND user_id = auth.uid()
    AND status = 'active'
    AND role IN ('owner', 'admin')
  ) OR (
    -- Super admin can manage everything
    SELECT auth_is_super_admin()
  );
$$;

COMMENT ON FUNCTION auth_can_manage_business(UUID) IS
'Returns TRUE if current user can manage (write to) the specified business. More restrictive than read access.';

-- ============================================================================
-- PHASE 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================
-- Per Supabase docs: indexes on RLS columns can improve performance 100x+
-- ============================================================================

-- Core table indexes
CREATE INDEX IF NOT EXISTS idx_rls_businesses_owner_id
  ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_rls_businesses_assigned_coach_id
  ON businesses(assigned_coach_id);
CREATE INDEX IF NOT EXISTS idx_rls_business_users_user_id
  ON business_users(user_id);
CREATE INDEX IF NOT EXISTS idx_rls_business_users_business_id
  ON business_users(business_id);
CREATE INDEX IF NOT EXISTS idx_rls_business_users_composite
  ON business_users(user_id, business_id, status);
CREATE INDEX IF NOT EXISTS idx_rls_system_roles_user_id
  ON system_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_rls_system_roles_composite
  ON system_roles(user_id, role);

-- ============================================================================
-- PHASE 4: CONFIGURE SYSTEM_ROLES TABLE
-- ============================================================================
-- This table is the foundation - it must have simple, non-recursive policies
-- ============================================================================

-- Drop all existing policies
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE tablename = 'system_roles' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON system_roles', pol.policyname);
  END LOOP;
END $$;

-- Users can see their own role (needed for role-based redirects)
CREATE POLICY "system_roles_read_own" ON system_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Super admins can manage all roles
CREATE POLICY "system_roles_admin_all" ON system_roles
  FOR ALL TO authenticated
  USING (auth_is_super_admin())
  WITH CHECK (auth_is_super_admin());

ALTER TABLE system_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 5: CONFIGURE BUSINESSES TABLE
-- ============================================================================
-- Core table that defines business entities
-- Access: owner, assigned coach, team members, super admin
-- ============================================================================

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE tablename = 'businesses' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON businesses', pol.policyname);
  END LOOP;
END $$;

-- Read access: owner, coach, team members, super admin
CREATE POLICY "businesses_read" ON businesses
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR auth_is_team_member_of(id)
    OR auth_is_super_admin()
  );

-- Create: any authenticated user can create a business
CREATE POLICY "businesses_create" ON businesses
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Update: owner, coach, super admin (not regular team members)
CREATE POLICY "businesses_update" ON businesses
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR auth_is_super_admin()
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR auth_is_super_admin()
  );

-- Delete: super admin only
CREATE POLICY "businesses_delete" ON businesses
  FOR DELETE TO authenticated
  USING (auth_is_super_admin());

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 6: CONFIGURE BUSINESS_USERS TABLE (Team Members)
-- ============================================================================
-- Junction table linking users to businesses with roles
-- CRITICAL: This table's policies must not query itself (recursion)
-- ============================================================================

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE tablename = 'business_users' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON business_users', pol.policyname);
  END LOOP;
END $$;

-- Read: users see own memberships, owners/coaches see their business's team
CREATE POLICY "business_users_read" ON business_users
  FOR SELECT TO authenticated
  USING (
    -- Can see own memberships
    user_id = auth.uid()
    -- Owner can see team (check businesses table, not business_users to avoid recursion)
    OR EXISTS (
      SELECT 1 FROM businesses
      WHERE id = business_users.business_id
      AND owner_id = auth.uid()
    )
    -- Coach can see team
    OR EXISTS (
      SELECT 1 FROM businesses
      WHERE id = business_users.business_id
      AND assigned_coach_id = auth.uid()
    )
    -- Super admin sees all
    OR auth_is_super_admin()
  );

-- Create: owner/coach/super admin can add team members
CREATE POLICY "business_users_create" ON business_users
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM businesses
      WHERE id = business_users.business_id
      AND (owner_id = auth.uid() OR assigned_coach_id = auth.uid())
    )
    OR auth_is_super_admin()
  );

-- Update: owner/coach/super admin can update team members
CREATE POLICY "business_users_update" ON business_users
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      WHERE id = business_users.business_id
      AND (owner_id = auth.uid() OR assigned_coach_id = auth.uid())
    )
    OR auth_is_super_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM businesses
      WHERE id = business_users.business_id
      AND (owner_id = auth.uid() OR assigned_coach_id = auth.uid())
    )
    OR auth_is_super_admin()
  );

-- Delete: owner/coach/super admin can remove (but not self)
CREATE POLICY "business_users_delete" ON business_users
  FOR DELETE TO authenticated
  USING (
    (
      EXISTS (
        SELECT 1 FROM businesses
        WHERE id = business_users.business_id
        AND (owner_id = auth.uid() OR assigned_coach_id = auth.uid())
      )
      OR auth_is_super_admin()
    )
    AND user_id != auth.uid()  -- Cannot remove yourself
  );

ALTER TABLE business_users ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 7: CONFIGURE USERS TABLE
-- ============================================================================
-- Public user profile data (synced from auth.users)
-- ============================================================================

DO $$
DECLARE pol RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users') THEN
    FOR pol IN SELECT policyname FROM pg_policies
      WHERE tablename = 'users' AND schemaname = 'public'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON users', pol.policyname);
    END LOOP;

    -- Read: own profile, super admin, coaches see their clients
    EXECUTE 'CREATE POLICY "users_read" ON users
      FOR SELECT TO authenticated
      USING (
        id = auth.uid()
        OR auth_is_super_admin()
        OR id IN (
          SELECT bu.user_id FROM business_users bu
          JOIN businesses b ON b.id = bu.business_id
          WHERE b.assigned_coach_id = auth.uid()
        )
      )';

    -- Update: own profile only (super admin via service role)
    EXECUTE 'CREATE POLICY "users_update" ON users
      FOR UPDATE TO authenticated
      USING (id = auth.uid() OR auth_is_super_admin())
      WITH CHECK (id = auth.uid() OR auth_is_super_admin())';

    EXECUTE 'ALTER TABLE users ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ============================================================================
-- PHASE 8: CONFIGURE ALL BUSINESS DATA TABLES
-- ============================================================================
-- These tables all have a business_id column and use the same access pattern:
-- - Read/Write if user has access to the business
-- - Super admin always has access
-- ============================================================================

DO $$
DECLARE
  -- Tables with UUID business_id column
  uuid_tables TEXT[] := ARRAY[
    'weekly_reviews', 'quarterly_reviews', 'annual_targets', 'vision_targets',
    'business_kpis', 'business_financial_goals', 'financial_forecasts',
    'financial_metrics', 'weekly_metrics_snapshots',
    'strategic_initiatives', 'strategy_data', 'swot_analyses',
    'operational_activities', 'open_loops', 'stop_doing_items',
    'stop_doing_activities', 'stop_doing_hourly_rates', 'stop_doing_time_logs',
    'issues_list', 'goals', 'action_items', 'todo_items',
    'sessions', 'session_notes', 'coaching_sessions',
    'messages', 'notifications', 'notification_preferences',
    'xero_connections', 'ai_cfo_conversations', 'coach_questions',
    'subscription_budgets', 'subscription_audit_results',
    'forecast_wizard_sessions', 'forecast_decisions', 'forecast_investments',
    'forecast_years', 'forecast_insights',
    'team_data', 'marketing_data', 'user_kpis',
    'roadmap_progress', 'stage_transitions',
    'audit_log', 'active_editors',
    'weekly_report_periods', 'team_weekly_reports',
    'business_profiles'
  ];
  t TEXT;
  col_type TEXT;
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY uuid_tables LOOP
    -- Check if table exists and has business_id column
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = t
    AND column_name = 'business_id';

    IF col_type IS NOT NULL THEN
      -- Drop existing policies
      FOR pol IN SELECT policyname FROM pg_policies
        WHERE tablename = t AND schemaname = 'public'
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
      END LOOP;

      -- Create policy based on column type
      IF col_type = 'uuid' THEN
        -- UUID version
        EXECUTE format(
          'CREATE POLICY "%s_access" ON %I FOR ALL TO authenticated
           USING (
             business_id = ANY(auth_get_accessible_business_ids())
             OR auth_is_super_admin()
           )
           WITH CHECK (
             business_id = ANY(auth_get_accessible_business_ids())
             OR auth_is_super_admin()
           )',
          t, t
        );
      ELSE
        -- TEXT version
        EXECUTE format(
          'CREATE POLICY "%s_access" ON %I FOR ALL TO authenticated
           USING (
             business_id = ANY(auth_get_accessible_business_ids_text())
             OR auth_is_super_admin()
           )
           WITH CHECK (
             business_id = ANY(auth_get_accessible_business_ids_text())
             OR auth_is_super_admin()
           )',
          t, t
        );
      END IF;

      -- Enable RLS
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

      -- Create index on business_id if not exists
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_rls_%s_business_id ON %I(business_id)',
        t, t
      );

      RAISE NOTICE 'Configured RLS for table: % (type: %)', t, col_type;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- PHASE 9: CONFIGURE FORECAST CHILD TABLES
-- ============================================================================
-- These tables reference forecast_id instead of business_id
-- Access is determined by the parent financial_forecasts record
-- ============================================================================

DO $$
DECLARE
  forecast_tables TEXT[] := ARRAY[
    'forecast_pl_lines', 'forecast_employees', 'forecast_payroll_summary'
  ];
  t TEXT;
  has_col BOOLEAN;
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY forecast_tables LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = t
      AND column_name = 'forecast_id'
    ) INTO has_col;

    IF has_col THEN
      -- Drop existing policies
      FOR pol IN SELECT policyname FROM pg_policies
        WHERE tablename = t AND schemaname = 'public'
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
      END LOOP;

      -- Create policy that checks parent forecast
      EXECUTE format(
        'CREATE POLICY "%s_access" ON %I FOR ALL TO authenticated
         USING (
           forecast_id IN (
             SELECT id FROM financial_forecasts
             WHERE business_id = ANY(auth_get_accessible_business_ids())
           )
           OR auth_is_super_admin()
         )
         WITH CHECK (
           forecast_id IN (
             SELECT id FROM financial_forecasts
             WHERE business_id = ANY(auth_get_accessible_business_ids())
           )
           OR auth_is_super_admin()
         )',
        t, t
      );

      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_rls_%s_forecast_id ON %I(forecast_id)',
        t, t
      );

      RAISE NOTICE 'Configured RLS for forecast child table: %', t;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- PHASE 10: CONFIGURE TEAM_INVITES TABLE
-- ============================================================================
-- Invitation records for team members
-- ============================================================================

DO $$
DECLARE pol RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'team_invites') THEN

    FOR pol IN SELECT policyname FROM pg_policies
      WHERE tablename = 'team_invites' AND schemaname = 'public'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON team_invites', pol.policyname);
    END LOOP;

    EXECUTE 'CREATE POLICY "team_invites_access" ON team_invites
      FOR ALL TO authenticated
      USING (
        business_id = ANY(auth_get_accessible_business_ids())
        OR auth_is_super_admin()
      )
      WITH CHECK (
        business_id = ANY(auth_get_accessible_business_ids())
        OR auth_is_super_admin()
      )';

    EXECUTE 'ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ============================================================================
-- PHASE 11: CONFIGURE SESSION_TEMPLATES TABLE
-- ============================================================================
-- Coach-owned templates
-- ============================================================================

DO $$
DECLARE pol RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'session_templates') THEN

    FOR pol IN SELECT policyname FROM pg_policies
      WHERE tablename = 'session_templates' AND schemaname = 'public'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON session_templates', pol.policyname);
    END LOOP;

    EXECUTE 'CREATE POLICY "session_templates_access" ON session_templates
      FOR ALL TO authenticated
      USING (coach_id = auth.uid() OR auth_is_super_admin())
      WITH CHECK (coach_id = auth.uid() OR auth_is_super_admin())';

    EXECUTE 'ALTER TABLE session_templates ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ============================================================================
-- PHASE 12: VERIFICATION
-- ============================================================================
-- Run checks to ensure everything is configured correctly
-- ============================================================================

DO $$
DECLARE
  func_count INTEGER;
  policy_count INTEGER;
  index_count INTEGER;
  tables_without_rls TEXT[];
BEGIN
  -- Count functions
  SELECT COUNT(*) INTO func_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
  AND routine_name LIKE 'auth_%';

  -- Count policies
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public';

  -- Count indexes
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
  AND indexname LIKE 'idx_rls_%';

  -- Check for tables without RLS (that should have it)
  SELECT ARRAY_AGG(tablename) INTO tables_without_rls
  FROM pg_tables t
  WHERE schemaname = 'public'
  AND tablename IN (
    'businesses', 'business_users', 'system_roles', 'users',
    'weekly_reviews', 'financial_forecasts', 'business_kpis'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.tablename = t.tablename
    AND p.schemaname = 'public'
  );

  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'RLS COMPLETE REBUILD - VERIFICATION RESULTS';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Auth functions created: %', func_count;
  RAISE NOTICE 'Policies created: %', policy_count;
  RAISE NOTICE 'Performance indexes: %', index_count;
  RAISE NOTICE '';

  IF tables_without_rls IS NOT NULL AND array_length(tables_without_rls, 1) > 0 THEN
    RAISE WARNING 'Tables missing RLS policies: %', tables_without_rls;
  ELSE
    RAISE NOTICE 'All critical tables have RLS policies';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Functions available:';
  RAISE NOTICE '  - auth_is_super_admin()';
  RAISE NOTICE '  - auth_get_accessible_business_ids()';
  RAISE NOTICE '  - auth_get_accessible_business_ids_text()';
  RAISE NOTICE '  - auth_is_team_member_of(business_id)';
  RAISE NOTICE '  - auth_can_manage_business(business_id)';
  RAISE NOTICE '';
  RAISE NOTICE 'Access pattern for team members:';
  RAISE NOTICE '  1. User must exist in auth.users';
  RAISE NOTICE '  2. User must have entry in business_users with status=active';
  RAISE NOTICE '  3. auth_get_accessible_business_ids() returns their business IDs';
  RAISE NOTICE '  4. All tables with business_id use this for access control';
  RAISE NOTICE '============================================================';
END $$;

-- ============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- ============================================================================
-- Run these manually to verify everything works:
--
-- 1. Check functions exist:
--    SELECT routine_name FROM information_schema.routines
--    WHERE routine_schema = 'public' AND routine_name LIKE 'auth_%';
--
-- 2. Check policies on businesses table:
--    SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'businesses';
--
-- 3. Test as a specific user (replace USER_ID):
--    SELECT auth_get_accessible_business_ids()
--    -- This won't work in SQL editor (no auth context)
--    -- Test via the application instead
--
-- 4. Verify a team member can see their business:
--    SELECT b.id, b.business_name
--    FROM businesses b
--    JOIN business_users bu ON bu.business_id = b.id
--    WHERE bu.user_id = 'USER_UUID_HERE' AND bu.status = 'active';
-- ============================================================================
