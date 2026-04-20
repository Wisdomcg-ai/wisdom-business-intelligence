-- Add coach + super_admin access to all process-related tables.
-- Uses the existing can_access_process(user_id) function which checks:
--   1. Owner:       process_user_id = auth.uid()
--   2. Super admin: system_roles.role = 'super_admin'
--   3. Coach:       businesses.owner_id = process_user_id AND assigned_coach_id = auth.uid()

-- =====================================================
-- 1. process_diagrams (user_id column)
-- =====================================================
DROP POLICY IF EXISTS "Users see own processes" ON process_diagrams;
DROP POLICY IF EXISTS "Users insert own processes" ON process_diagrams;
DROP POLICY IF EXISTS "Users update own processes" ON process_diagrams;
DROP POLICY IF EXISTS "Users delete own processes" ON process_diagrams;
DROP POLICY IF EXISTS "rls_access" ON process_diagrams;

CREATE POLICY "rls_access" ON process_diagrams
FOR ALL TO authenticated
USING (
    can_access_process(user_id)
)
WITH CHECK (
    can_access_process(user_id)
);

-- =====================================================
-- 2. process_steps (process_id → process_diagrams)
-- =====================================================
DROP POLICY IF EXISTS "Users see steps" ON process_steps;
DROP POLICY IF EXISTS "Users insert steps" ON process_steps;
DROP POLICY IF EXISTS "Users update steps" ON process_steps;
DROP POLICY IF EXISTS "Users delete steps" ON process_steps;
DROP POLICY IF EXISTS "rls_access" ON process_steps;

CREATE POLICY "rls_access" ON process_steps
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM process_diagrams pd
        WHERE pd.id = process_steps.process_id
        AND can_access_process(pd.user_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM process_diagrams pd
        WHERE pd.id = process_steps.process_id
        AND can_access_process(pd.user_id)
    )
);

-- =====================================================
-- 3. process_connections (process_id → process_diagrams)
-- =====================================================
DROP POLICY IF EXISTS "Users see connections" ON process_connections;
DROP POLICY IF EXISTS "Users insert connections" ON process_connections;
DROP POLICY IF EXISTS "Users update connections" ON process_connections;
DROP POLICY IF EXISTS "Users delete connections" ON process_connections;
DROP POLICY IF EXISTS "rls_access" ON process_connections;

CREATE POLICY "rls_access" ON process_connections
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM process_diagrams pd
        WHERE pd.id = process_connections.process_id
        AND can_access_process(pd.user_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM process_diagrams pd
        WHERE pd.id = process_connections.process_id
        AND can_access_process(pd.user_id)
    )
);

-- =====================================================
-- 4. process_versions (process_id → process_diagrams)
-- =====================================================
DROP POLICY IF EXISTS "Users see versions" ON process_versions;
DROP POLICY IF EXISTS "Users insert versions" ON process_versions;
DROP POLICY IF EXISTS "Users update versions" ON process_versions;
DROP POLICY IF EXISTS "Users delete versions" ON process_versions;
DROP POLICY IF EXISTS "rls_access" ON process_versions;

CREATE POLICY "rls_access" ON process_versions
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM process_diagrams pd
        WHERE pd.id = process_versions.process_id
        AND can_access_process(pd.user_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM process_diagrams pd
        WHERE pd.id = process_versions.process_id
        AND can_access_process(pd.user_id)
    )
);

-- =====================================================
-- 5. process_flows (process_id → process_diagrams)
--    Previously: open SELECT for all authenticated, admin-only writes
--    Now: proper access control via can_access_process
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can view process flows" ON process_flows;
DROP POLICY IF EXISTS "Admins can manage process flows" ON process_flows;
DROP POLICY IF EXISTS "Admins can update process flows" ON process_flows;
DROP POLICY IF EXISTS "Admins can delete process flows" ON process_flows;
DROP POLICY IF EXISTS "rls_access" ON process_flows;

CREATE POLICY "rls_access" ON process_flows
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM process_diagrams pd
        WHERE pd.id = process_flows.process_id
        AND can_access_process(pd.user_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM process_diagrams pd
        WHERE pd.id = process_flows.process_id
        AND can_access_process(pd.user_id)
    )
);

-- =====================================================
-- 6. process_phases (process_id → process_diagrams)
--    Previously: open SELECT for all authenticated, admin-only writes
--    Now: proper access control via can_access_process
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can view process phases" ON process_phases;
DROP POLICY IF EXISTS "Admins can manage process phases" ON process_phases;
DROP POLICY IF EXISTS "Admins can update process phases" ON process_phases;
DROP POLICY IF EXISTS "Admins can delete process phases" ON process_phases;
DROP POLICY IF EXISTS "rls_access" ON process_phases;

CREATE POLICY "rls_access" ON process_phases
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM process_diagrams pd
        WHERE pd.id = process_phases.process_id
        AND can_access_process(pd.user_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM process_diagrams pd
        WHERE pd.id = process_phases.process_id
        AND can_access_process(pd.user_id)
    )
);
