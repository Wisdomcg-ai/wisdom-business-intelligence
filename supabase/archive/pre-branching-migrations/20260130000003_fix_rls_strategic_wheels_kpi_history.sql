-- Phase 3: Fix RLS policies for strategic_wheels and kpi_history
--
-- These tables had overly permissive policies (WITH CHECK true)
-- Now using proper business access pattern:
--   - Super admin: access all
--   - Coach: access assigned clients
--   - Owner: access own business
--   - Team member: access based on business_users membership
--
-- IMPACT: Zero - strategic_wheels has only test data, kpi_history is empty

-- =====================================================
-- 1. FIX strategic_wheels RLS
-- =====================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.strategic_wheels;

-- Create proper RLS policy using standard business access pattern
CREATE POLICY "rls_access" ON public.strategic_wheels
FOR ALL TO authenticated
USING (
    -- Super admin bypass
    auth_is_super_admin()
    -- Standard business access check
    OR business_id = ANY(auth_get_accessible_business_ids())
)
WITH CHECK (
    -- Super admin bypass
    auth_is_super_admin()
    -- Can manage this business
    OR auth_can_manage_business(business_id)
);

-- =====================================================
-- 2. FIX kpi_history RLS
-- =====================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can insert own KPI history" ON public.kpi_history;

-- Create proper RLS policy
-- Note: kpi_history.business_id likely stores business_profiles.id based on naming patterns
-- Using the business_profiles join pattern to be safe
CREATE POLICY "rls_access" ON public.kpi_history
FOR ALL TO authenticated
USING (
    auth_is_super_admin()
    -- Direct business_id match (if it stores businesses.id)
    OR business_id = ANY(auth_get_accessible_business_ids())
    -- Business profiles pattern (if it stores business_profiles.id)
    OR EXISTS (
        SELECT 1 FROM business_profiles bp
        JOIN businesses b ON b.id = bp.business_id
        WHERE bp.id::text = kpi_history.business_id::text
        AND (
            b.owner_id = auth.uid()
            OR b.assigned_coach_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM business_users bu
                WHERE bu.business_id = b.id
                AND bu.user_id = auth.uid()
                AND bu.status = 'active'
            )
        )
    )
)
WITH CHECK (
    auth_is_super_admin()
    OR auth_can_manage_business(business_id)
    OR EXISTS (
        SELECT 1 FROM business_profiles bp
        JOIN businesses b ON b.id = bp.business_id
        WHERE bp.id::text = kpi_history.business_id::text
        AND (
            b.owner_id = auth.uid()
            OR b.assigned_coach_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM business_users bu
                WHERE bu.business_id = b.id
                AND bu.user_id = auth.uid()
                AND bu.status = 'active'
            )
        )
    )
);

-- =====================================================
-- 3. FIX activity_log RLS (optional - log tables)
-- =====================================================
-- Note: Keeping INSERT permissive for activity_log is intentional
-- Users need to be able to log their own activities
-- The important thing is that SELECT is restricted (which it should be)

-- =====================================================
-- 4. FIX forecast_audit_log RLS (optional - audit tables)
-- =====================================================
-- Note: Keeping INSERT permissive for audit logs is intentional
-- Audit logs need to capture all actions
-- SELECT should be restricted to appropriate users

-- =====================================================
-- 5. FIX client_error_logs RLS (optional - error tables)
-- =====================================================
-- Note: Keeping INSERT permissive for error logs is intentional
-- Frontend needs to be able to log errors
-- SELECT can remain restricted
