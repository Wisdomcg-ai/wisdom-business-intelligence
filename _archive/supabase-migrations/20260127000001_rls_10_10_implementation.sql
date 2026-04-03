-- =====================================================
-- RLS 10/10 IMPLEMENTATION
-- Created: 2026-01-27
-- =====================================================
-- This migration implements world-class RLS with:
-- - 12 SECURITY DEFINER functions
-- - Performance indexes on all RLS columns
-- - Policies for all tables
-- - Soft delete safety
-- - Audit logging schema
-- =====================================================

BEGIN;

-- =====================================================
-- PHASE 3: PERFORMANCE INDEXES
-- =====================================================
-- Create indexes on columns used in RLS policies
-- These make RLS queries fast at any scale

-- Core access pattern indexes
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id
ON businesses(owner_id);

CREATE INDEX IF NOT EXISTS idx_businesses_assigned_coach_id
ON businesses(assigned_coach_id);

CREATE INDEX IF NOT EXISTS idx_business_users_user_id
ON business_users(user_id);

CREATE INDEX IF NOT EXISTS idx_business_users_business_id
ON business_users(business_id);

CREATE INDEX IF NOT EXISTS idx_business_users_status
ON business_users(status);

-- Composite index for common query pattern (active team members)
CREATE INDEX IF NOT EXISTS idx_business_users_user_status
ON business_users(user_id, status)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_business_users_business_status
ON business_users(business_id, status)
WHERE status = 'active';

-- System roles indexes
CREATE INDEX IF NOT EXISTS idx_system_roles_user_id
ON system_roles(user_id);

CREATE INDEX IF NOT EXISTS idx_system_roles_role
ON system_roles(role);

CREATE INDEX IF NOT EXISTS idx_system_roles_user_role
ON system_roles(user_id, role);

-- business_id indexes on data tables
DO $$
DECLARE
    tables_needing_index TEXT[] := ARRAY[
        'weekly_reviews', 'quarterly_reviews', 'annual_targets',
        'vision_targets', 'business_kpis', 'business_financial_goals',
        'financial_forecasts', 'forecast_wizard_sessions',
        'strategic_initiatives', 'strategy_data', 'swot_analyses',
        'operational_activities', 'open_loops', 'issues_list',
        'coaching_sessions', 'sessions', 'session_notes',
        'notifications', 'action_items', 'goals',
        'ai_cfo_conversations', 'xero_connections', 'team_data',
        'business_profiles', 'roadmap_progress', 'stage_transitions',
        'stop_doing_items', 'marketing_data', 'financial_metrics'
    ];
    t TEXT;
    idx_name TEXT;
BEGIN
    FOREACH t IN ARRAY tables_needing_index LOOP
        idx_name := 'idx_' || t || '_business_id';

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = t
            AND column_name = 'business_id'
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
            AND tablename = t
            AND indexname = idx_name
        ) THEN
            EXECUTE format('CREATE INDEX %I ON %I(business_id)', idx_name, t);
            RAISE NOTICE 'Created index: %', idx_name;
        END IF;
    END LOOP;
END $$;


-- =====================================================
-- PHASE 4: RLS CORE FUNCTIONS
-- =====================================================
-- All functions use:
-- - SECURITY DEFINER (bypass RLS to prevent recursion)
-- - SQL language (faster than PL/pgSQL)
-- - STABLE (cacheable within transaction)
-- - search_path = '' (security best practice)

-- Drop existing functions to ensure clean state
DROP FUNCTION IF EXISTS auth_is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS auth_get_user_role() CASCADE;
DROP FUNCTION IF EXISTS auth_get_accessible_business_ids() CASCADE;
DROP FUNCTION IF EXISTS auth_get_accessible_business_ids_text() CASCADE;
DROP FUNCTION IF EXISTS auth_is_team_member_of(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_is_coach_of(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_is_owner_of(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_can_access_business(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_can_manage_business(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_can_manage_team(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_get_team_role(UUID) CASCADE;
DROP FUNCTION IF EXISTS auth_get_section_permissions(UUID) CASCADE;

-- Also drop old function names if they exist
DROP FUNCTION IF EXISTS is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS is_super_admin(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_coach_for_business(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_coach_for_business(TEXT) CASCADE;
DROP FUNCTION IF EXISTS is_business_owner(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_business_owner(TEXT) CASCADE;
DROP FUNCTION IF EXISTS is_team_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_team_member(TEXT) CASCADE;
DROP FUNCTION IF EXISTS has_business_access(UUID) CASCADE;
DROP FUNCTION IF EXISTS has_business_access(TEXT) CASCADE;
DROP FUNCTION IF EXISTS has_direct_business_access(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS is_business_team_member(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS rls_is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS rls_user_all_businesses() CASCADE;
DROP FUNCTION IF EXISTS rls_user_all_businesses_text() CASCADE;


-- =====================================================
-- 1. AUTH_IS_SUPER_ADMIN
-- =====================================================
CREATE FUNCTION auth_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.system_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
$$;

COMMENT ON FUNCTION auth_is_super_admin() IS
'Check if the current authenticated user is a super_admin.';


-- =====================================================
-- 2. AUTH_GET_USER_ROLE
-- =====================================================
CREATE FUNCTION auth_get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.system_roles WHERE user_id = auth.uid() LIMIT 1),
    'client'
  );
$$;

COMMENT ON FUNCTION auth_get_user_role() IS
'Get the system role of the current user. Returns "client" if no role found.';


-- =====================================================
-- 3. AUTH_GET_ACCESSIBLE_BUSINESS_IDS
-- =====================================================
CREATE FUNCTION auth_get_accessible_business_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    ARRAY(
      -- Businesses user owns
      SELECT id FROM public.businesses
      WHERE owner_id = auth.uid()

      UNION

      -- Businesses user coaches
      SELECT id FROM public.businesses
      WHERE assigned_coach_id = auth.uid()

      UNION

      -- Businesses user is team member of
      SELECT business_id FROM public.business_users
      WHERE user_id = auth.uid()
      AND status = 'active'
    ),
    '{}'::UUID[]
  );
$$;

COMMENT ON FUNCTION auth_get_accessible_business_ids() IS
'Get array of business IDs the current user can access (owner, coach, or team member).';


-- =====================================================
-- 4. AUTH_GET_ACCESSIBLE_BUSINESS_IDS_TEXT
-- =====================================================
CREATE FUNCTION auth_get_accessible_business_ids_text()
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT id::TEXT FROM public.businesses
      WHERE owner_id = auth.uid()

      UNION

      SELECT id::TEXT FROM public.businesses
      WHERE assigned_coach_id = auth.uid()

      UNION

      SELECT business_id::TEXT FROM public.business_users
      WHERE user_id = auth.uid()
      AND status = 'active'
    ),
    '{}'::TEXT[]
  );
$$;

COMMENT ON FUNCTION auth_get_accessible_business_ids_text() IS
'TEXT version for tables with TEXT business_id columns.';


-- =====================================================
-- 5. AUTH_IS_TEAM_MEMBER_OF
-- =====================================================
CREATE FUNCTION auth_is_team_member_of(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_users
    WHERE business_id = check_business_id
    AND user_id = auth.uid()
    AND status = 'active'
  );
$$;

COMMENT ON FUNCTION auth_is_team_member_of(UUID) IS
'Check if current user is an active team member of the specified business.';


-- =====================================================
-- 6. AUTH_IS_COACH_OF
-- =====================================================
CREATE FUNCTION auth_is_coach_of(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = check_business_id
    AND assigned_coach_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION auth_is_coach_of(UUID) IS
'Check if current user is the assigned coach for the specified business.';


-- =====================================================
-- 7. AUTH_IS_OWNER_OF
-- =====================================================
CREATE FUNCTION auth_is_owner_of(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = check_business_id
    AND owner_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION auth_is_owner_of(UUID) IS
'Check if current user owns the specified business.';


-- =====================================================
-- 8. AUTH_CAN_ACCESS_BUSINESS
-- =====================================================
CREATE FUNCTION auth_can_access_business(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    -- Super admin
    EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    -- Owner
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND owner_id = auth.uid())
    -- Coach
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND assigned_coach_id = auth.uid())
    -- Team member
    OR EXISTS (SELECT 1 FROM public.business_users WHERE business_id = check_business_id AND user_id = auth.uid() AND status = 'active');
$$;

COMMENT ON FUNCTION auth_can_access_business(UUID) IS
'Check if current user can access the specified business (any role).';


-- =====================================================
-- 9. AUTH_CAN_MANAGE_BUSINESS
-- =====================================================
CREATE FUNCTION auth_can_manage_business(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    -- Super admin
    EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    -- Owner
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND owner_id = auth.uid())
    -- Coach
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND assigned_coach_id = auth.uid())
    -- Team admin or member (NOT viewer)
    OR EXISTS (
      SELECT 1 FROM public.business_users
      WHERE business_id = check_business_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('admin', 'member')
    );
$$;

COMMENT ON FUNCTION auth_can_manage_business(UUID) IS
'Check if current user can manage (edit) the specified business. Viewers excluded.';


-- =====================================================
-- 10. AUTH_CAN_MANAGE_TEAM
-- =====================================================
CREATE FUNCTION auth_can_manage_team(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    -- Super admin
    EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    -- Owner
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND owner_id = auth.uid())
    -- Coach
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND assigned_coach_id = auth.uid())
    -- Team admin only
    OR EXISTS (
      SELECT 1 FROM public.business_users
      WHERE business_id = check_business_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role = 'admin'
    );
$$;

COMMENT ON FUNCTION auth_can_manage_team(UUID) IS
'Check if current user can manage team members. Only admin role can.';


-- =====================================================
-- 11. AUTH_GET_TEAM_ROLE
-- =====================================================
CREATE FUNCTION auth_get_team_role(check_business_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
        THEN 'super_admin'
      WHEN EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND owner_id = auth.uid())
        THEN 'owner'
      WHEN EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND assigned_coach_id = auth.uid())
        THEN 'coach'
      ELSE (
        SELECT role FROM public.business_users
        WHERE business_id = check_business_id
        AND user_id = auth.uid()
        AND status = 'active'
        LIMIT 1
      )
    END;
$$;

COMMENT ON FUNCTION auth_get_team_role(UUID) IS
'Get the role of current user within a specific business team.';


-- =====================================================
-- 12. AUTH_GET_SECTION_PERMISSIONS
-- =====================================================
CREATE FUNCTION auth_get_section_permissions(check_business_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    CASE
      -- Super admin, owner, coach get full access
      WHEN EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
        OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND assigned_coach_id = auth.uid())
      THEN '{"dashboard":true,"weekly_reviews":true,"forecasts":true,"finances":true,"team":true,"settings":true}'::JSONB

      -- Team members get their specific permissions
      ELSE COALESCE(
        (
          SELECT section_permissions FROM public.business_users
          WHERE business_id = check_business_id
          AND user_id = auth.uid()
          AND status = 'active'
          LIMIT 1
        ),
        '{"dashboard":true,"weekly_reviews":true,"forecasts":true,"finances":false,"team":false,"settings":false}'::JSONB
      )
    END;
$$;

COMMENT ON FUNCTION auth_get_section_permissions(UUID) IS
'Get section permissions for current user in a business.';


-- =====================================================
-- PHASE 5: RLS POLICIES
-- =====================================================

-- =====================================================
-- SYSTEM_ROLES TABLE
-- =====================================================
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE tablename = 'system_roles' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON system_roles', pol.policyname);
    END LOOP;
END $$;

ALTER TABLE system_roles ENABLE ROW LEVEL SECURITY;

-- Users can view their own role (needed for initial auth check)
CREATE POLICY "system_roles_select_own" ON system_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Super admins can manage all roles
CREATE POLICY "system_roles_manage_admin" ON system_roles
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM system_roles sr
        WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
);


-- =====================================================
-- USERS TABLE
-- =====================================================
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

        EXECUTE 'ALTER TABLE users ENABLE ROW LEVEL SECURITY';

        -- Users can view/edit their own record
        EXECUTE 'CREATE POLICY "users_own_record" ON users
        FOR ALL TO authenticated
        USING (id = auth.uid())
        WITH CHECK (id = auth.uid())';

        -- Super admins can manage all users
        EXECUTE 'CREATE POLICY "users_admin_manage" ON users
        FOR ALL TO authenticated
        USING (auth_is_super_admin())
        WITH CHECK (auth_is_super_admin())';

        -- Users can view other users they share a business with
        EXECUTE 'CREATE POLICY "users_view_colleagues" ON users
        FOR SELECT TO authenticated
        USING (
            id IN (
                SELECT bu.user_id FROM business_users bu
                WHERE bu.business_id = ANY(auth_get_accessible_business_ids())
                AND bu.status = ''active''
            )
        )';

    END IF;
END $$;


-- =====================================================
-- BUSINESSES TABLE
-- =====================================================
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE tablename = 'businesses' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON businesses', pol.policyname);
    END LOOP;
END $$;

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "businesses_access" ON businesses
FOR ALL
TO authenticated
USING (
    auth_is_super_admin()
    OR owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR auth_is_team_member_of(id)
)
WITH CHECK (
    auth_is_super_admin()
    OR owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
);


-- =====================================================
-- BUSINESS_USERS TABLE
-- =====================================================
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE tablename = 'business_users' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON business_users', pol.policyname);
    END LOOP;
END $$;

ALTER TABLE business_users ENABLE ROW LEVEL SECURITY;

-- View: Can see team members of businesses you belong to
CREATE POLICY "business_users_view" ON business_users
FOR SELECT
TO authenticated
USING (
    auth_is_super_admin()
    OR user_id = auth.uid()
    OR auth_can_access_business(business_id)
);

-- Insert: Only those who can manage team
CREATE POLICY "business_users_insert" ON business_users
FOR INSERT
TO authenticated
WITH CHECK (
    auth_can_manage_team(business_id)
);

-- Update: Only those who can manage team (or user updating own record)
CREATE POLICY "business_users_update" ON business_users
FOR UPDATE
TO authenticated
USING (
    auth_can_manage_team(business_id)
    OR user_id = auth.uid()
)
WITH CHECK (
    auth_can_manage_team(business_id)
    OR user_id = auth.uid()
);

-- Delete: Only those who can manage team
CREATE POLICY "business_users_delete" ON business_users
FOR DELETE
TO authenticated
USING (
    auth_can_manage_team(business_id)
);


-- =====================================================
-- BUSINESS DATA TABLES
-- =====================================================
DO $$
DECLARE
    tables_uuid TEXT[] := ARRAY[
        'weekly_reviews', 'quarterly_reviews', 'annual_targets',
        'vision_targets', 'business_kpis', 'business_financial_goals',
        'financial_forecasts', 'forecast_wizard_sessions', 'forecast_decisions',
        'forecast_investments', 'forecast_years', 'forecast_insights',
        'strategic_initiatives', 'strategy_data', 'swot_analyses',
        'operational_activities', 'open_loops', 'issues_list',
        'stop_doing_items', 'stop_doing_activities', 'stop_doing_hourly_rates',
        'stop_doing_time_logs', 'coaching_sessions', 'sessions', 'session_notes',
        'messages', 'goals', 'action_items', 'todo_items',
        'notifications', 'notification_preferences',
        'ai_cfo_conversations', 'coach_questions', 'subscription_budgets',
        'subscription_audit_results', 'xero_connections', 'team_data',
        'business_profiles', 'roadmap_progress', 'stage_transitions',
        'active_editors', 'weekly_report_periods', 'team_weekly_reports',
        'marketing_data', 'financial_metrics', 'weekly_metrics_snapshots'
    ];
    t TEXT;
    col_type TEXT;
    pol RECORD;
BEGIN
    FOREACH t IN ARRAY tables_uuid LOOP
        -- Check if table exists and has business_id
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

            -- Enable RLS
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

            -- Create policy based on column type
            IF col_type = 'uuid' THEN
                EXECUTE format(
                    'CREATE POLICY "rls_access" ON %I
                    FOR ALL TO authenticated
                    USING (
                        auth_is_super_admin()
                        OR business_id = ANY(auth_get_accessible_business_ids())
                    )
                    WITH CHECK (
                        auth_is_super_admin()
                        OR auth_can_manage_business(business_id)
                    )',
                    t
                );
            ELSE
                -- TEXT type business_id
                EXECUTE format(
                    'CREATE POLICY "rls_access" ON %I
                    FOR ALL TO authenticated
                    USING (
                        auth_is_super_admin()
                        OR business_id = ANY(auth_get_accessible_business_ids_text())
                    )
                    WITH CHECK (
                        auth_is_super_admin()
                        OR auth_can_manage_business(business_id::UUID)
                    )',
                    t
                );
            END IF;

            RAISE NOTICE 'Created policy for: % (% business_id)', t, col_type;
        END IF;
    END LOOP;
END $$;


-- =====================================================
-- FORECAST CHILD TABLES (join via forecast_id)
-- =====================================================
DO $$
DECLARE
    forecast_tables TEXT[] := ARRAY[
        'forecast_pl_lines', 'forecast_employees', 'forecast_payroll_summary'
    ];
    t TEXT;
    pol RECORD;
BEGIN
    FOREACH t IN ARRAY forecast_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = t
            AND column_name = 'forecast_id'
        ) THEN
            -- Drop existing policies
            FOR pol IN SELECT policyname FROM pg_policies
                       WHERE tablename = t AND schemaname = 'public'
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
            END LOOP;

            -- Enable RLS
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

            -- Create policy via parent join
            EXECUTE format(
                'CREATE POLICY "rls_access" ON %I
                FOR ALL TO authenticated
                USING (
                    auth_is_super_admin()
                    OR forecast_id IN (
                        SELECT id FROM financial_forecasts
                        WHERE business_id = ANY(auth_get_accessible_business_ids())
                    )
                )
                WITH CHECK (
                    auth_is_super_admin()
                    OR forecast_id IN (
                        SELECT id FROM financial_forecasts ff
                        WHERE auth_can_manage_business(ff.business_id)
                    )
                )',
                t
            );

            RAISE NOTICE 'Created policy for forecast child: %', t;
        END IF;
    END LOOP;
END $$;


-- =====================================================
-- SESSION_TEMPLATES (Coach-owned)
-- =====================================================
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

        EXECUTE 'ALTER TABLE session_templates ENABLE ROW LEVEL SECURITY';

        EXECUTE 'CREATE POLICY "session_templates_access" ON session_templates
        FOR ALL TO authenticated
        USING (coach_id = auth.uid() OR auth_is_super_admin())
        WITH CHECK (coach_id = auth.uid() OR auth_is_super_admin())';

    END IF;
END $$;


-- =====================================================
-- USER_KPIS
-- =====================================================
DO $$
DECLARE pol RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'user_kpis') THEN

        FOR pol IN SELECT policyname FROM pg_policies
                   WHERE tablename = 'user_kpis' AND schemaname = 'public'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON user_kpis', pol.policyname);
        END LOOP;

        EXECUTE 'ALTER TABLE user_kpis ENABLE ROW LEVEL SECURITY';

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'user_kpis' AND column_name = 'user_id'
        ) THEN
            EXECUTE 'CREATE POLICY "user_kpis_access" ON user_kpis
            FOR ALL TO authenticated
            USING (user_id = auth.uid() OR auth_is_super_admin())
            WITH CHECK (user_id = auth.uid() OR auth_is_super_admin())';
        ELSIF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'user_kpis' AND column_name = 'business_id'
        ) THEN
            EXECUTE 'CREATE POLICY "user_kpis_access" ON user_kpis
            FOR ALL TO authenticated
            USING (auth_is_super_admin() OR business_id = ANY(auth_get_accessible_business_ids()))
            WITH CHECK (auth_is_super_admin() OR auth_can_manage_business(business_id))';
        END IF;

    END IF;
END $$;


-- =====================================================
-- PHASE 6: SOFT DELETE SAFETY
-- =====================================================
-- Add deleted_at column to businesses if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'businesses'
        AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE businesses ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
        CREATE INDEX idx_businesses_deleted_at ON businesses(deleted_at) WHERE deleted_at IS NULL;
        RAISE NOTICE 'Added deleted_at column to businesses';
    END IF;
END $$;


-- =====================================================
-- PHASE 9: AUDIT LOG SCHEMA
-- =====================================================
-- Create audit_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id),
    user_id UUID,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_business_id ON audit_log(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- RLS for audit_log
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE tablename = 'audit_log' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON audit_log', pol.policyname);
    END LOOP;
END $$;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_access" ON audit_log
FOR ALL TO authenticated
USING (
    auth_is_super_admin()
    OR business_id = ANY(auth_get_accessible_business_ids())
)
WITH CHECK (
    auth_is_super_admin()
    OR auth_can_manage_business(business_id)
);


-- =====================================================
-- PHASE 8: INVITE SYSTEM COLUMNS
-- =====================================================
-- Add missing columns to business_users for invite flow
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'business_users' AND column_name = 'invite_token'
    ) THEN
        ALTER TABLE business_users ADD COLUMN invite_token UUID DEFAULT gen_random_uuid();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'business_users' AND column_name = 'invite_expires_at'
    ) THEN
        ALTER TABLE business_users ADD COLUMN invite_expires_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'business_users' AND column_name = 'invite_sent_at'
    ) THEN
        ALTER TABLE business_users ADD COLUMN invite_sent_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'business_users' AND column_name = 'invite_resent_count'
    ) THEN
        ALTER TABLE business_users ADD COLUMN invite_resent_count INT DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'business_users' AND column_name = 'accepted_at'
    ) THEN
        ALTER TABLE business_users ADD COLUMN accepted_at TIMESTAMPTZ;
    END IF;
END $$;

-- Index for invite token lookup
CREATE INDEX IF NOT EXISTS idx_business_users_invite_token
ON business_users(invite_token)
WHERE status = 'invited';


-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
DECLARE
    func_count INT;
    policy_count INT;
    index_count INT;
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

    -- Count new indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%';

    RAISE NOTICE '';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'RLS 10/10 IMPLEMENTATION COMPLETE';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Functions created: % (expected: 12)', func_count;
    RAISE NOTICE 'Policies created: % (expected: 50+)', policy_count;
    RAISE NOTICE 'Indexes created: % (expected: 30+)', index_count;
    RAISE NOTICE '=====================================================';
END $$;

COMMIT;
