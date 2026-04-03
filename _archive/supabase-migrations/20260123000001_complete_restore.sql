-- =====================================================
-- COMPLETE RESTORE TO PRE-BEST-PRACTICES STATE
-- Created: 2026-01-23
-- =====================================================
-- This restores the RLS to the working state from
-- 20260120_fix_coach_admin_rls_comprehensive.sql
-- PLUS the team member fix for businesses table
-- =====================================================

-- =====================================================
-- STEP 1: Drop all the new rls_* functions
-- =====================================================
DROP FUNCTION IF EXISTS rls_is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS rls_user_owned_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_coached_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_team_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_all_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_all_businesses_text() CASCADE;

-- =====================================================
-- STEP 2: Recreate original helper functions
-- =====================================================

-- Check if user is super_admin (no parameter version)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM system_roles
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- UUID version: Check if user is coach for a business
CREATE OR REPLACE FUNCTION is_coach_for_business(check_business_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM businesses b
        WHERE b.assigned_coach_id = auth.uid()
        AND b.id = check_business_id
    )
    OR EXISTS (
        SELECT 1 FROM business_profiles bp
        JOIN businesses b ON b.id = bp.business_id
        WHERE b.assigned_coach_id = auth.uid()
        AND bp.id = check_business_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- UUID version: Check if user is business owner
CREATE OR REPLACE FUNCTION is_business_owner(check_business_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM businesses b
        WHERE b.owner_id = auth.uid()
        AND b.id = check_business_id
    )
    OR EXISTS (
        SELECT 1 FROM business_profiles bp
        JOIN businesses b ON b.id = bp.business_id
        WHERE b.owner_id = auth.uid()
        AND bp.id = check_business_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- UUID version: Check if user is team member
CREATE OR REPLACE FUNCTION is_team_member(check_business_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM business_users bu
        WHERE bu.user_id = auth.uid()
        AND bu.business_id = check_business_id
        AND bu.status = 'active'
    )
    OR EXISTS (
        SELECT 1 FROM business_users bu
        JOIN business_profiles bp ON bp.business_id = bu.business_id
        WHERE bu.user_id = auth.uid()
        AND bp.id = check_business_id
        AND bu.status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- UUID version: Combined access check
CREATE OR REPLACE FUNCTION has_business_access(check_business_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN is_business_owner(check_business_id)
        OR is_coach_for_business(check_business_id)
        OR is_super_admin()
        OR is_team_member(check_business_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- TEXT versions for tables with TEXT business_id columns
CREATE OR REPLACE FUNCTION is_coach_for_business(check_business_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM businesses b
        WHERE b.assigned_coach_id = auth.uid()
        AND b.id::text = check_business_id
    )
    OR EXISTS (
        SELECT 1 FROM business_profiles bp
        JOIN businesses b ON b.id = bp.business_id
        WHERE b.assigned_coach_id = auth.uid()
        AND bp.id::text = check_business_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_business_owner(check_business_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM businesses b
        WHERE b.owner_id = auth.uid()
        AND b.id::text = check_business_id
    )
    OR EXISTS (
        SELECT 1 FROM business_profiles bp
        JOIN businesses b ON b.id = bp.business_id
        WHERE b.owner_id = auth.uid()
        AND bp.id::text = check_business_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_team_member(check_business_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM business_users bu
        WHERE bu.user_id = auth.uid()
        AND bu.business_id::text = check_business_id
        AND bu.status = 'active'
    )
    OR EXISTS (
        SELECT 1 FROM business_users bu
        JOIN business_profiles bp ON bp.business_id = bu.business_id
        WHERE bu.user_id = auth.uid()
        AND bp.id::text = check_business_id
        AND bu.status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_business_access(check_business_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN is_business_owner(check_business_id)
        OR is_coach_for_business(check_business_id)
        OR is_super_admin()
        OR is_team_member(check_business_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- STEP 3: Fix system_roles table
-- =====================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'system_roles' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON system_roles', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "Users can view their own role" ON system_roles
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage roles" ON system_roles
FOR ALL USING (is_super_admin());

-- =====================================================
-- STEP 4: Fix businesses table (with team member access)
-- =====================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'businesses' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON businesses', pol.policyname);
    END LOOP;
END $$;

-- This policy includes team member access via is_team_member() function
CREATE POLICY "businesses_policy" ON businesses FOR ALL
USING (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR is_team_member(id)
    OR is_super_admin()
)
WITH CHECK (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR is_super_admin()
);

-- =====================================================
-- STEP 5: Fix business_users table
-- =====================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'business_users' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON business_users', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "business_users_policy" ON business_users FOR ALL
USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_users.business_id AND (b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid()))
    OR is_super_admin()
)
WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_users.business_id AND (b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid()))
    OR is_super_admin()
);

-- =====================================================
-- STEP 6: Fix users table
-- =====================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'users' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON users', pol.policyname);
    END LOOP;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
        EXECUTE 'CREATE POLICY "users_policy" ON users FOR ALL
        USING (
            id = auth.uid()
            OR is_super_admin()
        )
        WITH CHECK (
            id = auth.uid()
            OR is_super_admin()
        )';
    END IF;
END $$;

-- =====================================================
-- STEP 7: Restore policies for all business data tables
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
    has_col BOOLEAN;
    pol RECORD;
BEGIN
    FOREACH t IN ARRAY tables_with_business_id LOOP
        -- Check if table exists and has business_id column
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = t
            AND column_name = 'business_id'
        ) INTO has_col;

        IF has_col THEN
            -- Drop all existing policies on this table
            FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = t AND schemaname = 'public'
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
            END LOOP;

            -- Create the standard policy
            EXECUTE format(
                'CREATE POLICY "Full access" ON %I FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id))',
                t
            );

            RAISE NOTICE 'Restored policy for: %', t;
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- STEP 8: Restore forecast child table policies
-- =====================================================
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
            FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = t AND schemaname = 'public'
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
            END LOOP;

            EXECUTE format(
                'CREATE POLICY "Full access" ON %I FOR ALL USING (
                    forecast_id IN (SELECT id FROM financial_forecasts WHERE has_business_access(business_id))
                    OR is_super_admin()
                ) WITH CHECK (
                    forecast_id IN (SELECT id FROM financial_forecasts WHERE has_business_access(business_id))
                    OR is_super_admin()
                )',
                t
            );

            RAISE NOTICE 'Restored policy for forecast table: %', t;
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- STEP 9: Restore session_templates policy
-- =====================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'session_templates') THEN
        FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'session_templates' AND schemaname = 'public'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON session_templates', pol.policyname);
        END LOOP;

        EXECUTE 'CREATE POLICY "Coaches can manage their templates" ON session_templates
        FOR ALL USING (coach_id = auth.uid() OR is_super_admin())
        WITH CHECK (coach_id = auth.uid() OR is_super_admin())';
    END IF;
END $$;

-- =====================================================
-- DONE
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'COMPLETE RESTORE FINISHED';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'RLS has been restored to the pre-best-practices state';
    RAISE NOTICE 'with team member access for businesses included.';
    RAISE NOTICE '=====================================================';
END $$;
