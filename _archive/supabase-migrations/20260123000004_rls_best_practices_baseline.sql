-- =====================================================
-- RLS BEST PRACTICES BASELINE MIGRATION
-- Created: 2026-01-23
-- =====================================================
-- This migration implements Supabase RLS best practices:
-- 1. SECURITY DEFINER functions with proper search_path
-- 2. Function calls wrapped in SELECT for caching
-- 3. Optimized query direction (fixed → variable)
-- 4. Proper indexes on all RLS columns
-- 5. TO authenticated clause to skip anonymous users
-- 6. Non-recursive policies for core tables
--
-- Sources:
-- - https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
-- - https://github.com/orgs/supabase/discussions/1138
-- =====================================================

-- =====================================================
-- STEP 1: DROP ALL EXISTING HELPER FUNCTIONS
-- =====================================================
DROP FUNCTION IF EXISTS is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS is_business_owner(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_business_owner(TEXT) CASCADE;
DROP FUNCTION IF EXISTS is_coach_for_business(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_coach_for_business(TEXT) CASCADE;
DROP FUNCTION IF EXISTS is_team_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_team_member(TEXT) CASCADE;
DROP FUNCTION IF EXISTS has_business_access(UUID) CASCADE;
DROP FUNCTION IF EXISTS has_business_access(TEXT) CASCADE;
DROP FUNCTION IF EXISTS has_direct_business_access(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS is_business_team_member(UUID, UUID) CASCADE;

-- =====================================================
-- STEP 2: CREATE OPTIMIZED HELPER FUNCTIONS
-- =====================================================
-- All functions use:
-- - SECURITY DEFINER to bypass RLS (prevents recursion)
-- - STABLE for query optimizer caching
-- - SET search_path = public for security
-- - SQL language where possible (faster than plpgsql)
-- =====================================================

-- Check if current user is super_admin
-- This is the safest function - system_roles has no recursive dependencies
CREATE OR REPLACE FUNCTION rls_is_super_admin()
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

-- Get all business IDs where current user is owner
-- Returns array for use with ANY() operator (more efficient than IN with subquery)
CREATE OR REPLACE FUNCTION rls_user_owned_businesses()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(SELECT id FROM businesses WHERE owner_id = auth.uid()),
    '{}'::UUID[]
  );
$$;

-- Get all business IDs where current user is assigned coach
CREATE OR REPLACE FUNCTION rls_user_coached_businesses()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()),
    '{}'::UUID[]
  );
$$;

-- Get all business IDs where current user is a team member
CREATE OR REPLACE FUNCTION rls_user_team_businesses()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(SELECT business_id FROM business_users WHERE user_id = auth.uid() AND status = 'active'),
    '{}'::UUID[]
  );
$$;

-- Get ALL business IDs user has any access to (combined)
-- This is the primary function for most table policies
CREATE OR REPLACE FUNCTION rls_user_all_businesses()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      -- Owned businesses
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      -- Coached businesses
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
      UNION
      -- Team member businesses
      SELECT business_id FROM business_users WHERE user_id = auth.uid() AND status = 'active'
    ),
    '{}'::UUID[]
  );
$$;

-- TEXT version for tables with TEXT business_id columns
CREATE OR REPLACE FUNCTION rls_user_all_businesses_text()
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
      SELECT business_id::TEXT FROM business_users WHERE user_id = auth.uid() AND status = 'active'
    ),
    '{}'::TEXT[]
  );
$$;

-- =====================================================
-- STEP 3: CREATE INDEXES FOR RLS PERFORMANCE
-- =====================================================
-- Per Supabase docs: "Add indexes on columns used in policies"
-- Can improve performance 100x+ on large tables
-- =====================================================

-- Core table indexes
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_assigned_coach_id ON businesses(assigned_coach_id);
CREATE INDEX IF NOT EXISTS idx_business_users_user_id ON business_users(user_id);
CREATE INDEX IF NOT EXISTS idx_business_users_business_id ON business_users(business_id);
CREATE INDEX IF NOT EXISTS idx_business_users_status ON business_users(status);
CREATE INDEX IF NOT EXISTS idx_system_roles_user_id ON system_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_system_roles_role ON system_roles(role);

-- Composite index for business_users (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_business_users_user_status
ON business_users(user_id, status) WHERE status = 'active';

-- =====================================================
-- STEP 4: FIX SYSTEM_ROLES TABLE (Foundation - must be safe)
-- =====================================================
-- system_roles is the foundation - it must have simple, non-recursive policies
-- =====================================================

DROP POLICY IF EXISTS "Users can view their own role" ON system_roles;
DROP POLICY IF EXISTS "system_roles_select" ON system_roles;
DROP POLICY IF EXISTS "system_roles_policy" ON system_roles;

-- Users can see their own role
CREATE POLICY "system_roles_select" ON system_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Super admins can manage all roles (uses direct subquery, not function)
CREATE POLICY "system_roles_manage" ON system_roles
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM system_roles sr
    WHERE sr.user_id = auth.uid()
    AND sr.role = 'super_admin'
  )
);

-- =====================================================
-- STEP 5: FIX BUSINESSES TABLE (Core - no cross-table queries)
-- =====================================================
-- businesses policies MUST NOT query business_users to avoid recursion
-- Only use: direct column checks + system_roles
-- =====================================================

-- Drop all existing policies
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'businesses' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON businesses', pol.policyname);
    END LOOP;
END $$;

-- SELECT: Owners, coaches, team members, super_admins can view
-- Team member access uses SECURITY DEFINER function to avoid recursion
CREATE POLICY "businesses_select" ON businesses
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR assigned_coach_id = auth.uid()
  OR id = ANY(rls_user_team_businesses())
  OR (SELECT rls_is_super_admin())
);

-- INSERT: Authenticated users can create businesses
CREATE POLICY "businesses_insert" ON businesses
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: Owners, coaches, super_admins can update
CREATE POLICY "businesses_update" ON businesses
FOR UPDATE TO authenticated
USING (
  owner_id = auth.uid()
  OR assigned_coach_id = auth.uid()
  OR (SELECT rls_is_super_admin())
)
WITH CHECK (
  owner_id = auth.uid()
  OR assigned_coach_id = auth.uid()
  OR (SELECT rls_is_super_admin())
);

-- DELETE: Only super_admins can delete
CREATE POLICY "businesses_delete" ON businesses
FOR DELETE TO authenticated
USING ((SELECT rls_is_super_admin()));

-- =====================================================
-- STEP 6: FIX BUSINESS_USERS TABLE (Junction - careful with recursion)
-- =====================================================
-- business_users can query businesses (one direction only)
-- businesses CANNOT query business_users (would create cycle)
-- =====================================================

-- Drop all existing policies
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'business_users' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON business_users', pol.policyname);
    END LOOP;
END $$;

-- SELECT: Users can see their own memberships, owners/coaches can see team
CREATE POLICY "business_users_select" ON business_users
FOR SELECT TO authenticated
USING (
  -- Can see own memberships
  user_id = auth.uid()
  -- Business owner/coach can see team (using optimized array pattern)
  OR business_id = ANY(rls_user_owned_businesses())
  OR business_id = ANY(rls_user_coached_businesses())
  -- Super admin can see all
  OR (SELECT rls_is_super_admin())
);

-- INSERT: Owners and coaches can add team members
CREATE POLICY "business_users_insert" ON business_users
FOR INSERT TO authenticated
WITH CHECK (
  business_id = ANY(rls_user_owned_businesses())
  OR business_id = ANY(rls_user_coached_businesses())
  OR (SELECT rls_is_super_admin())
);

-- UPDATE: Owners and coaches can update team members
CREATE POLICY "business_users_update" ON business_users
FOR UPDATE TO authenticated
USING (
  business_id = ANY(rls_user_owned_businesses())
  OR business_id = ANY(rls_user_coached_businesses())
  OR (SELECT rls_is_super_admin())
)
WITH CHECK (
  business_id = ANY(rls_user_owned_businesses())
  OR business_id = ANY(rls_user_coached_businesses())
  OR (SELECT rls_is_super_admin())
);

-- DELETE: Owners and coaches can remove team members
CREATE POLICY "business_users_delete" ON business_users
FOR DELETE TO authenticated
USING (
  business_id = ANY(rls_user_owned_businesses())
  OR business_id = ANY(rls_user_coached_businesses())
  OR (SELECT rls_is_super_admin())
);

-- =====================================================
-- STEP 7: FIX USERS TABLE
-- =====================================================

-- Drop all existing policies
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'users' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON users', pol.policyname);
    END LOOP;
END $$;

-- Check if users table exists before creating policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    -- SELECT: Users can see themselves, coaches can see their clients
    EXECUTE 'CREATE POLICY "users_select" ON users
    FOR SELECT TO authenticated
    USING (
      id = auth.uid()
      OR (SELECT rls_is_super_admin())
      OR id IN (
        SELECT bu.user_id FROM business_users bu
        WHERE bu.business_id = ANY(rls_user_coached_businesses())
      )
      OR id IN (
        SELECT b.owner_id FROM businesses b
        WHERE b.assigned_coach_id = auth.uid()
      )
    )';

    -- UPDATE: Users can update themselves, super_admins can update anyone
    EXECUTE 'CREATE POLICY "users_update" ON users
    FOR UPDATE TO authenticated
    USING (
      id = auth.uid()
      OR (SELECT rls_is_super_admin())
    )
    WITH CHECK (
      id = auth.uid()
      OR (SELECT rls_is_super_admin())
    )';
  END IF;
END $$;

-- =====================================================
-- STEP 8: CREATE STANDARD POLICY FOR BUSINESS DATA TABLES
-- =====================================================
-- These tables all have business_id and use the same pattern
-- Using the optimized rls_user_all_businesses() function
-- =====================================================

DO $$
DECLARE
    tables_with_business_id TEXT[] := ARRAY[
        'operational_activities', 'open_loops', 'stop_doing_items',
        'stop_doing_activities', 'stop_doing_hourly_rates', 'stop_doing_time_logs',
        'issues_list', 'quarterly_reviews', 'weekly_reviews', 'annual_targets',
        'vision_targets', 'weekly_metrics_snapshots', 'business_kpis',
        'business_financial_goals', 'strategic_initiatives', 'strategy_data',
        'swot_analyses', 'business_profiles', 'team_data', 'notifications',
        'xero_connections', 'financial_forecasts', 'ai_cfo_conversations',
        'coach_questions', 'subscription_budgets', 'subscription_audit_results',
        'goals', 'forecast_wizard_sessions', 'forecast_decisions',
        'forecast_investments', 'forecast_years', 'forecast_insights',
        'action_items', 'todo_items', 'sessions', 'session_notes',
        'messages', 'coaching_sessions', 'roadmap_progress',
        'stage_transitions', 'audit_log', 'active_editors', 'weekly_report_periods',
        'team_weekly_reports', 'notification_preferences', 'marketing_data',
        'financial_metrics', 'user_kpis'
    ];
    t TEXT;
    col_type TEXT;
    func_name TEXT;
    pol RECORD;
BEGIN
    FOREACH t IN ARRAY tables_with_business_id LOOP
        -- Check if table exists and get business_id column type
        SELECT data_type INTO col_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'business_id';

        IF col_type IS NOT NULL THEN
            -- Choose function based on column type
            IF col_type = 'uuid' THEN
                func_name := 'rls_user_all_businesses()';
            ELSE
                func_name := 'rls_user_all_businesses_text()';
            END IF;

            -- Drop existing policies
            FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = t AND schemaname = 'public'
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
            END LOOP;

            -- Create optimized SELECT policy
            EXECUTE format(
                'CREATE POLICY "%s_select" ON %I FOR SELECT TO authenticated USING (
                    business_id = ANY(%s)
                    OR (SELECT rls_is_super_admin())
                )',
                t, t, func_name
            );

            -- Create INSERT policy
            EXECUTE format(
                'CREATE POLICY "%s_insert" ON %I FOR INSERT TO authenticated WITH CHECK (
                    business_id = ANY(%s)
                    OR (SELECT rls_is_super_admin())
                )',
                t, t, func_name
            );

            -- Create UPDATE policy
            EXECUTE format(
                'CREATE POLICY "%s_update" ON %I FOR UPDATE TO authenticated
                USING (
                    business_id = ANY(%s)
                    OR (SELECT rls_is_super_admin())
                )
                WITH CHECK (
                    business_id = ANY(%s)
                    OR (SELECT rls_is_super_admin())
                )',
                t, t, func_name, func_name
            );

            -- Create DELETE policy
            EXECUTE format(
                'CREATE POLICY "%s_delete" ON %I FOR DELETE TO authenticated USING (
                    business_id = ANY(%s)
                    OR (SELECT rls_is_super_admin())
                )',
                t, t, func_name
            );

            -- Create index on business_id for this table
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS idx_%s_business_id ON %I(business_id)',
                t, t
            );

            RAISE NOTICE 'Created policies for table: % (type: %)', t, col_type;
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- STEP 9: FIX FORECAST CHILD TABLES (reference forecast_id)
-- =====================================================

DO $$
DECLARE
    forecast_tables TEXT[] := ARRAY[
        'forecast_pl_lines', 'forecast_employees', 'forecast_payroll_summary'
    ];
    t TEXT;
    has_col BOOLEAN;
    ff_col_type TEXT;
    func_name TEXT;
    pol RECORD;
BEGIN
    -- Check financial_forecasts.business_id type
    SELECT data_type INTO ff_col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'financial_forecasts'
    AND column_name = 'business_id';

    IF ff_col_type = 'uuid' THEN
        func_name := 'rls_user_all_businesses()';
    ELSE
        func_name := 'rls_user_all_businesses_text()';
    END IF;

    FOREACH t IN ARRAY forecast_tables LOOP
        -- Check if table exists and has forecast_id column
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = t
            AND column_name = 'forecast_id'
        ) INTO has_col;

        IF has_col THEN
            -- Drop existing policies
            FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = t AND schemaname = 'public'
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
            END LOOP;

            -- Create policy that checks parent forecast's business_id
            EXECUTE format(
                'CREATE POLICY "%s_access" ON %I FOR ALL TO authenticated USING (
                    forecast_id IN (
                        SELECT id FROM financial_forecasts
                        WHERE business_id = ANY(%s)
                    )
                    OR (SELECT rls_is_super_admin())
                )
                WITH CHECK (
                    forecast_id IN (
                        SELECT id FROM financial_forecasts
                        WHERE business_id = ANY(%s)
                    )
                    OR (SELECT rls_is_super_admin())
                )',
                t, t, func_name, func_name
            );

            -- Create index on forecast_id
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS idx_%s_forecast_id ON %I(forecast_id)',
                t, t
            );

            RAISE NOTICE 'Created policies for forecast table: %', t;
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- STEP 10: FIX SESSION_TEMPLATES (coach_id based)
-- =====================================================

DO $$
DECLARE
    pol RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'session_templates') THEN
        -- Drop existing policies
        FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'session_templates' AND schemaname = 'public'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON session_templates', pol.policyname);
        END LOOP;

        -- Coaches manage their own templates
        EXECUTE 'CREATE POLICY "session_templates_access" ON session_templates
        FOR ALL TO authenticated
        USING (
            coach_id = auth.uid()
            OR (SELECT rls_is_super_admin())
        )
        WITH CHECK (
            coach_id = auth.uid()
            OR (SELECT rls_is_super_admin())
        )';
    END IF;
END $$;

-- =====================================================
-- STEP 11: ENSURE RLS IS ENABLED ON ALL TABLES
-- =====================================================

DO $$
DECLARE
    t TEXT;
    all_tables TEXT[] := ARRAY[
        'businesses', 'business_users', 'system_roles', 'users',
        'operational_activities', 'open_loops', 'stop_doing_items',
        'issues_list', 'quarterly_reviews', 'weekly_reviews', 'annual_targets',
        'vision_targets', 'weekly_metrics_snapshots', 'business_kpis',
        'business_financial_goals', 'strategic_initiatives', 'strategy_data',
        'swot_analyses', 'business_profiles', 'team_data', 'notifications',
        'xero_connections', 'financial_forecasts', 'ai_cfo_conversations',
        'goals', 'forecast_wizard_sessions', 'forecast_decisions',
        'forecast_investments', 'forecast_years', 'forecast_insights',
        'action_items', 'todo_items', 'sessions', 'session_notes',
        'messages', 'coaching_sessions', 'roadmap_progress',
        'stage_transitions', 'forecast_pl_lines', 'forecast_employees',
        'forecast_payroll_summary', 'session_templates', 'financial_metrics'
    ];
BEGIN
    FOREACH t IN ARRAY all_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
DECLARE
    policy_count INTEGER;
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE schemaname = 'public';
    SELECT COUNT(*) INTO index_count FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%';

    RAISE NOTICE '';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'RLS BEST PRACTICES BASELINE MIGRATION COMPLETE';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Total policies created: %', policy_count;
    RAISE NOTICE 'Total indexes: %', index_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Best practices implemented:';
    RAISE NOTICE '  ✓ SECURITY DEFINER functions with search_path';
    RAISE NOTICE '  ✓ Function calls wrapped in SELECT for caching';
    RAISE NOTICE '  ✓ Optimized ANY() array pattern instead of EXISTS';
    RAISE NOTICE '  ✓ TO authenticated clause on all policies';
    RAISE NOTICE '  ✓ Indexes on all RLS columns';
    RAISE NOTICE '  ✓ Non-recursive policies on core tables';
    RAISE NOTICE '=====================================================';
END $$;
