-- =====================================================
-- RLS ROLLBACK SCRIPT
-- Created: 2026-01-23
-- =====================================================
-- USE THIS IF THE BEST PRACTICES MIGRATION CAUSES ISSUES
-- This restores the working state from earlier today
-- =====================================================

-- =====================================================
-- STEP 1: DROP THE NEW RLS_* FUNCTIONS
-- =====================================================
DROP FUNCTION IF EXISTS rls_is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS rls_user_owned_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_coached_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_team_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_all_businesses() CASCADE;

-- =====================================================
-- STEP 2: RESTORE WORKING HELPER FUNCTIONS
-- =====================================================
-- These are the SECURITY DEFINER functions that were working earlier

CREATE OR REPLACE FUNCTION is_super_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_roles
    WHERE user_id = check_user_id
    AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION has_direct_business_access(check_user_id uuid, check_business_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses
    WHERE id = check_business_id
    AND (owner_id = check_user_id OR assigned_coach_id = check_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION is_business_team_member(check_user_id uuid, check_business_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_users
    WHERE business_id = check_business_id
    AND user_id = check_user_id
    AND status = 'active'
  );
$$;

-- =====================================================
-- STEP 3: RESTORE BUSINESSES TABLE POLICIES
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

-- Restore working policy
CREATE POLICY "businesses_access_policy" ON businesses FOR ALL
USING (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR is_business_team_member(auth.uid(), id)
    OR is_super_admin(auth.uid())
)
WITH CHECK (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR is_super_admin(auth.uid())
);

-- =====================================================
-- STEP 4: RESTORE BUSINESS_USERS TABLE POLICIES
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

-- Restore working policy
CREATE POLICY "business_users_access_policy" ON business_users FOR ALL
USING (
    user_id = auth.uid()
    OR has_direct_business_access(auth.uid(), business_id)
    OR is_super_admin(auth.uid())
)
WITH CHECK (
    has_direct_business_access(auth.uid(), business_id)
    OR is_super_admin(auth.uid())
);

-- =====================================================
-- STEP 5: RESTORE USERS TABLE POLICIES
-- =====================================================

DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Drop existing policies
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'users' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON users', pol.policyname);
    END LOOP;

    -- Only create if users table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
        EXECUTE 'CREATE POLICY "users_access_policy" ON users FOR ALL
        USING (
            id = auth.uid()
            OR is_super_admin(auth.uid())
        )
        WITH CHECK (
            id = auth.uid()
            OR is_super_admin(auth.uid())
        )';
    END IF;
END $$;

-- =====================================================
-- STEP 6: RESTORE SYSTEM_ROLES POLICIES
-- =====================================================

DROP POLICY IF EXISTS "system_roles_select" ON system_roles;
DROP POLICY IF EXISTS "system_roles_manage" ON system_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON system_roles;

CREATE POLICY "Users can view their own role" ON system_roles
FOR SELECT
USING (user_id = auth.uid());

-- =====================================================
-- STEP 7: RESTORE BUSINESS DATA TABLE POLICIES
-- =====================================================
-- Restore the has_business_access pattern for other tables

CREATE OR REPLACE FUNCTION has_business_access(check_business_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN has_direct_business_access(auth.uid(), check_business_id)
        OR is_business_team_member(auth.uid(), check_business_id)
        OR is_super_admin(auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Recreate policies for tables with business_id
DO $$
DECLARE
    tables_with_business_id TEXT[] := ARRAY[
        'operational_activities', 'open_loops', 'stop_doing_items',
        'issues_list', 'quarterly_reviews', 'weekly_reviews', 'annual_targets',
        'vision_targets', 'weekly_metrics_snapshots', 'business_kpis',
        'business_financial_goals', 'strategic_initiatives', 'strategy_data',
        'swot_analyses', 'business_profiles', 'team_data', 'notifications',
        'xero_connections', 'financial_forecasts', 'ai_cfo_conversations',
        'goals', 'forecast_wizard_sessions', 'action_items', 'sessions',
        'session_notes', 'messages', 'coaching_sessions', 'roadmap_progress',
        'stage_transitions', 'financial_metrics'
    ];
    t TEXT;
    has_col BOOLEAN;
    pol RECORD;
BEGIN
    FOREACH t IN ARRAY tables_with_business_id LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = t
            AND column_name = 'business_id'
        ) INTO has_col;

        IF has_col THEN
            -- Drop new policies
            FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = t AND schemaname = 'public'
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
            END LOOP;

            -- Create simple policy
            EXECUTE format(
                'CREATE POLICY "Full access" ON %I FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id))',
                t
            );
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'RLS ROLLBACK COMPLETE';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Restored to the working state from earlier today.';
    RAISE NOTICE 'The SECURITY DEFINER functions are back in place.';
    RAISE NOTICE '=====================================================';
END $$;
