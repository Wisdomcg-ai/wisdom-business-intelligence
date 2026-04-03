-- =====================================================
-- COMPREHENSIVE COACH/ADMIN RLS FIX
-- Created: 2026-01-20
-- =====================================================
-- This migration fixes RLS policies so coaches and admins
-- can access all data for their assigned clients.
-- =====================================================

-- STEP 1: Helper functions (UUID and TEXT overloads)
-- =====================================================

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
    )
    OR EXISTS (
        SELECT 1 FROM business_users bu
        JOIN business_profiles bp ON bp.business_id = bu.business_id
        WHERE bu.user_id = auth.uid()
        AND bp.id = check_business_id
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

-- Check if user is super_admin
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
    )
    OR EXISTS (
        SELECT 1 FROM business_users bu
        JOIN business_profiles bp ON bp.business_id = bu.business_id
        WHERE bu.user_id = auth.uid()
        AND bp.id::text = check_business_id
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

-- STEP 2: Fix businesses table (simple policy to avoid recursion)
-- =====================================================

-- Drop all existing policies on businesses
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'businesses' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON businesses', pol.policyname);
    END LOOP;
END $$;

-- Create simple policy (no function calls that could cause recursion)
CREATE POLICY "businesses_policy" ON businesses FOR ALL
USING (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR (SELECT role FROM system_roles WHERE user_id = auth.uid() LIMIT 1) = 'super_admin'
);

-- STEP 3: Fix business_users table
-- =====================================================

DROP POLICY IF EXISTS "Full access" ON business_users;
DROP POLICY IF EXISTS "Business users access" ON business_users;
CREATE POLICY "business_users_policy" ON business_users FOR ALL
USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_users.business_id AND (b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
)
WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_users.business_id AND (b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- STEP 4: Apply has_business_access() to all other tables with business_id
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
        'team_weekly_reports', 'notification_preferences', 'marketing_data'
    ];
    t TEXT;
    has_col BOOLEAN;
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
            EXECUTE format('DROP POLICY IF EXISTS "Full access" ON %I', t);
            EXECUTE format(
                'CREATE POLICY "Full access" ON %I FOR ALL USING (has_business_access(business_id)) WITH CHECK (has_business_access(business_id))',
                t
            );
        END IF;
    END LOOP;
END $$;

-- Done
DO $$ BEGIN RAISE NOTICE 'Comprehensive coach/admin RLS fix applied successfully'; END $$;
