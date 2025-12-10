-- =====================================================
-- ADD SUPER_ADMIN ACCESS POLICIES FOR ALL CLIENT DATA
-- =====================================================
-- Super admins need to view client data even when no coach is assigned

-- Assessments
DROP POLICY IF EXISTS "Super admins can view all assessments" ON assessments;
CREATE POLICY "Super admins can view all assessments" ON assessments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- Strategic Initiatives
DROP POLICY IF EXISTS "Super admins can view all strategic initiatives" ON strategic_initiatives;
CREATE POLICY "Super admins can view all strategic initiatives" ON strategic_initiatives
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- Business Profiles
DROP POLICY IF EXISTS "Super admins can view all business profiles" ON business_profiles;
CREATE POLICY "Super admins can view all business profiles" ON business_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- Weekly Reviews
DROP POLICY IF EXISTS "Super admins can view all weekly reviews" ON weekly_reviews;
CREATE POLICY "Super admins can view all weekly reviews" ON weekly_reviews
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- Open Loops
DROP POLICY IF EXISTS "Super admins can view all open loops" ON open_loops;
CREATE POLICY "Super admins can view all open loops" ON open_loops
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- Issues List
DROP POLICY IF EXISTS "Super admins can view all issues" ON issues_list;
CREATE POLICY "Super admins can view all issues" ON issues_list
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- Weekly Metrics Snapshots
DROP POLICY IF EXISTS "Super admins can view all weekly metrics" ON weekly_metrics_snapshots;
CREATE POLICY "Super admins can view all weekly metrics" ON weekly_metrics_snapshots
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- Vision Targets
DROP POLICY IF EXISTS "Super admins can view all vision targets" ON vision_targets;
CREATE POLICY "Super admins can view all vision targets" ON vision_targets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- SWOT Analyses
DROP POLICY IF EXISTS "Super admins can view all swot analyses" ON swot_analyses;
CREATE POLICY "Super admins can view all swot analyses" ON swot_analyses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- Ideas
DROP POLICY IF EXISTS "Super admins can view all ideas" ON ideas;
CREATE POLICY "Super admins can view all ideas" ON ideas
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- Users table - super admins can view all users
DROP POLICY IF EXISTS "Super admins can view all users" ON users;
CREATE POLICY "Super admins can view all users" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- Core Values
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'core_values') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Super admins can view all core values" ON core_values';
        EXECUTE '
            CREATE POLICY "Super admins can view all core values" ON core_values
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = ''super_admin''
                    )
                )
        ';
    END IF;
END $$;

-- KPIs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kpis') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Super admins can view all kpis" ON kpis';
        EXECUTE '
            CREATE POLICY "Super admins can view all kpis" ON kpis
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = ''super_admin''
                    )
                )
        ';
    END IF;
END $$;

-- Goals
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goals') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Super admins can view all goals" ON goals';
        EXECUTE '
            CREATE POLICY "Super admins can view all goals" ON goals
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = ''super_admin''
                    )
                )
        ';
    END IF;
END $$;

-- User KPIs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_kpis') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Super admins can view all user kpis" ON user_kpis';
        EXECUTE '
            CREATE POLICY "Super admins can view all user kpis" ON user_kpis
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = ''super_admin''
                    )
                )
        ';
    END IF;
END $$;

-- Action Items
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'action_items') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Super admins can view all action items" ON action_items';
        EXECUTE '
            CREATE POLICY "Super admins can view all action items" ON action_items
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = ''super_admin''
                    )
                )
        ';
    END IF;
END $$;
