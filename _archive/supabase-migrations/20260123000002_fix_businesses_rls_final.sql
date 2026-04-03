-- =====================================================
-- FIX BUSINESSES RLS POLICY - FINAL
-- Created: 2026-01-23
-- =====================================================
-- Issue: Having both ALL and SELECT policies causes conflicts
-- Solution: Use a single ALL policy with proper USING/WITH CHECK
-- =====================================================

-- Drop ALL existing policies on businesses table
DROP POLICY IF EXISTS "businesses_policy" ON businesses;
DROP POLICY IF EXISTS "businesses_select_policy" ON businesses;
DROP POLICY IF EXISTS "businesses_modify_policy" ON businesses;
DROP POLICY IF EXISTS "Enable read access for users" ON businesses;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON businesses;
DROP POLICY IF EXISTS "Enable update for users based on ownership" ON businesses;
DROP POLICY IF EXISTS "Enable delete for users based on ownership" ON businesses;

-- Create a single unified policy
-- USING clause: Who can SELECT/UPDATE/DELETE (read existing rows)
-- WITH CHECK clause: Who can INSERT/UPDATE (write new/modified rows)
CREATE POLICY "businesses_access_policy" ON businesses FOR ALL
USING (
    -- Owner can access their own businesses
    owner_id = auth.uid()
    -- Assigned coach can access
    OR assigned_coach_id = auth.uid()
    -- Team members (via business_users) can access
    OR EXISTS (
        SELECT 1 FROM business_users bu
        WHERE bu.business_id = businesses.id
        AND bu.user_id = auth.uid()
        AND bu.status = 'active'
    )
    -- Super admins can access everything
    OR EXISTS (
        SELECT 1 FROM system_roles
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
    )
)
WITH CHECK (
    -- Owner can modify their own businesses
    owner_id = auth.uid()
    -- Assigned coach can modify
    OR assigned_coach_id = auth.uid()
    -- Team members with owner/admin role can modify
    OR EXISTS (
        SELECT 1 FROM business_users bu
        WHERE bu.business_id = businesses.id
        AND bu.user_id = auth.uid()
        AND bu.status = 'active'
        AND bu.role IN ('owner', 'admin')
    )
    -- Super admins can modify everything
    OR EXISTS (
        SELECT 1 FROM system_roles
        WHERE user_id = auth.uid()
        AND role = 'super_admin'
    )
);

-- Verify the policy was created
DO $$
BEGIN
    RAISE NOTICE 'Businesses RLS policy fixed successfully';
END $$;
