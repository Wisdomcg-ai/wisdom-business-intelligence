-- =====================================================
-- FIX TEAM MEMBER ACCESS TO BUSINESSES
-- Created: 2026-01-23
-- =====================================================
-- Team members (via business_users) could not see the business
-- because the businesses RLS policy was missing the team member check.
-- =====================================================

-- Drop existing policy
DROP POLICY IF EXISTS "businesses_policy" ON businesses;

-- Create new policy that includes team members
CREATE POLICY "businesses_policy" ON businesses FOR ALL
USING (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM business_users bu
        WHERE bu.business_id = businesses.id
        AND bu.user_id = auth.uid()
        AND bu.status = 'active'
    )
    OR EXISTS (
        SELECT 1 FROM system_roles
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
    )
)
WITH CHECK (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM business_users bu
        WHERE bu.business_id = businesses.id
        AND bu.user_id = auth.uid()
        AND bu.status = 'active'
        AND bu.role IN ('owner', 'admin')
    )
    OR EXISTS (
        SELECT 1 FROM system_roles
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
    )
);

-- Done
DO $$ BEGIN RAISE NOTICE 'Team member business access fix applied successfully'; END $$;
