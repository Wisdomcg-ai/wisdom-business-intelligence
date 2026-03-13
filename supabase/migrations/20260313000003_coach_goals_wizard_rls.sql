-- ============================================================================
-- Coach RLS Policies for Goals Wizard Tables
-- ============================================================================
-- Problem: Coaches can't save Goals Wizard data because business_kpis,
-- sprint_key_actions, and operational_activities have no coach INSERT/UPDATE
-- policies. This causes a cascading save failure in the Goals Wizard.
--
-- The business_id column can contain EITHER:
--   - business_profiles.id (the correct canonical ID for planning data)
--   - businesses.id (legacy fallback)
--
-- All policies handle both ID types via OR conditions.
-- ============================================================================

-- ============================================================================
-- 1. BUSINESS_KPIS - Add coach INSERT, UPDATE, DELETE
-- ============================================================================

-- Drop any existing coach INSERT/UPDATE/DELETE policies to avoid conflicts
DROP POLICY IF EXISTS "Coaches can insert client KPIs" ON business_kpis;
DROP POLICY IF EXISTS "Coaches can update client KPIs" ON business_kpis;
DROP POLICY IF EXISTS "Coaches can delete client KPIs" ON business_kpis;

-- Coach INSERT: Allow coaches to create KPIs for their assigned clients
CREATE POLICY "Coaches can insert client KPIs" ON business_kpis
    FOR INSERT WITH CHECK (
        -- Match via business_profiles.id → businesses.assigned_coach_id
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        -- Match via businesses.id directly
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        -- Super admin bypass
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

-- Coach UPDATE: Allow coaches to update KPIs for their assigned clients
CREATE POLICY "Coaches can update client KPIs" ON business_kpis
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

-- Coach DELETE: Allow coaches to delete KPIs for their assigned clients
CREATE POLICY "Coaches can delete client KPIs" ON business_kpis
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_kpis.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

-- ============================================================================
-- 2. SPRINT_KEY_ACTIONS - Add coach SELECT, INSERT, UPDATE, DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can view client sprint actions" ON sprint_key_actions;
DROP POLICY IF EXISTS "Coaches can insert client sprint actions" ON sprint_key_actions;
DROP POLICY IF EXISTS "Coaches can update client sprint actions" ON sprint_key_actions;
DROP POLICY IF EXISTS "Coaches can delete client sprint actions" ON sprint_key_actions;

CREATE POLICY "Coaches can view client sprint actions" ON sprint_key_actions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = sprint_key_actions.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = sprint_key_actions.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can insert client sprint actions" ON sprint_key_actions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = sprint_key_actions.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = sprint_key_actions.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can update client sprint actions" ON sprint_key_actions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = sprint_key_actions.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = sprint_key_actions.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can delete client sprint actions" ON sprint_key_actions
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = sprint_key_actions.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = sprint_key_actions.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

-- ============================================================================
-- 3. OPERATIONAL_ACTIVITIES - Add coach SELECT, INSERT, UPDATE, DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can view client operational activities" ON operational_activities;
DROP POLICY IF EXISTS "Coaches can insert client operational activities" ON operational_activities;
DROP POLICY IF EXISTS "Coaches can update client operational activities" ON operational_activities;
DROP POLICY IF EXISTS "Coaches can delete client operational activities" ON operational_activities;

CREATE POLICY "Coaches can view client operational activities" ON operational_activities
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = operational_activities.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = operational_activities.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can insert client operational activities" ON operational_activities
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = operational_activities.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = operational_activities.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can update client operational activities" ON operational_activities
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = operational_activities.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = operational_activities.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can delete client operational activities" ON operational_activities
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = operational_activities.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = operational_activities.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

-- ============================================================================
-- 4. ACTIVITY_LOG - Add coach INSERT (KPI service logs activity here)
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can insert client activity log" ON activity_log;

-- Only create if table exists (it may not exist in all environments)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_log') THEN
        EXECUTE '
            CREATE POLICY "Coaches can insert client activity log" ON activity_log
                FOR INSERT WITH CHECK (
                    EXISTS (
                        SELECT 1 FROM business_profiles bp
                        JOIN businesses b ON b.id = bp.business_id
                        WHERE bp.id::text = activity_log.business_id::text
                        AND b.assigned_coach_id = auth.uid()
                    )
                    OR
                    EXISTS (
                        SELECT 1 FROM businesses b
                        WHERE b.id::text = activity_log.business_id::text
                        AND b.assigned_coach_id = auth.uid()
                    )
                    OR
                    EXISTS (
                        SELECT 1 FROM system_roles sr
                        WHERE sr.user_id = auth.uid()
                        AND sr.role = ''super_admin''
                    )
                )
        ';
    END IF;
END $$;

-- ============================================================================
-- 5. Ensure business_financial_goals and strategic_initiatives also have
--    the business_profiles JOIN pattern for coach access
--    (Some environments may only have the direct businesses.id check)
-- ============================================================================

-- Re-create financial goals coach policies with both ID type support
DROP POLICY IF EXISTS "Coaches can insert business financial goals v2" ON business_financial_goals;
DROP POLICY IF EXISTS "Coaches can update business financial goals v2" ON business_financial_goals;

CREATE POLICY "Coaches can insert business financial goals v2" ON business_financial_goals
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_financial_goals.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_financial_goals.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can update business financial goals v2" ON business_financial_goals
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = business_financial_goals.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = business_financial_goals.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

-- Re-create strategic initiatives coach policies with both ID type support
DROP POLICY IF EXISTS "Coaches can insert strategic initiatives v2" ON strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can update strategic initiatives v2" ON strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can delete strategic initiatives v2" ON strategic_initiatives;

CREATE POLICY "Coaches can insert strategic initiatives v2" ON strategic_initiatives
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can update strategic initiatives v2" ON strategic_initiatives
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );

CREATE POLICY "Coaches can delete strategic initiatives v2" ON strategic_initiatives
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM business_profiles bp
            JOIN businesses b ON b.id = bp.business_id
            WHERE bp.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id::text = strategic_initiatives.business_id::text
            AND b.assigned_coach_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM system_roles sr
            WHERE sr.user_id = auth.uid()
            AND sr.role = 'super_admin'
        )
    );
