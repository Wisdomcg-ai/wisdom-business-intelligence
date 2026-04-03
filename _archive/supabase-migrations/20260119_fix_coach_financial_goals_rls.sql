-- =====================================================
-- FIX COACH RLS FOR BUSINESS_FINANCIAL_GOALS
-- =====================================================
-- Issue: Coaches get "violates row-level security policy" when saving financial goals
-- Root cause: INSERT policy wasn't properly checking coach assignment
-- =====================================================

-- First, let's see what policies exist
DO $$
BEGIN
    RAISE NOTICE 'Fixing RLS policies for business_financial_goals...';
END $$;

-- Drop existing coach policies for this table
DROP POLICY IF EXISTS "Coaches can view business financial goals" ON business_financial_goals;
DROP POLICY IF EXISTS "Coaches can insert business financial goals" ON business_financial_goals;
DROP POLICY IF EXISTS "Coaches can update business financial goals" ON business_financial_goals;
DROP POLICY IF EXISTS "Coaches can delete business financial goals" ON business_financial_goals;
DROP POLICY IF EXISTS "Coaches can view client financial goals" ON business_financial_goals;
DROP POLICY IF EXISTS "Super admins can view all financial goals" ON business_financial_goals;

-- Recreate with proper coach access
-- Note: business_financial_goals.business_id is TEXT, businesses.id is UUID

-- SELECT policy - coaches can view
CREATE POLICY "Coaches can view business financial goals" ON business_financial_goals
    FOR SELECT USING (
        -- Coach is assigned to this business
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND (
                b.id::text = business_financial_goals.business_id
                OR b.id = business_financial_goals.business_id::uuid
            )
        )
        OR
        -- Super admin
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
        OR
        -- Own record
        user_id = auth.uid()
    );

-- INSERT policy - coaches can create
CREATE POLICY "Coaches can insert business financial goals" ON business_financial_goals
    FOR INSERT WITH CHECK (
        -- Coach is assigned to this business
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND (
                b.id::text = business_financial_goals.business_id
                OR b.id = business_financial_goals.business_id::uuid
            )
        )
        OR
        -- Super admin
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
        OR
        -- Own record (user creating their own goals)
        user_id = auth.uid()
    );

-- UPDATE policy - coaches can update
CREATE POLICY "Coaches can update business financial goals" ON business_financial_goals
    FOR UPDATE USING (
        -- Coach is assigned to this business
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND (
                b.id::text = business_financial_goals.business_id
                OR b.id = business_financial_goals.business_id::uuid
            )
        )
        OR
        -- Super admin
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
        OR
        -- Own record
        user_id = auth.uid()
    );

-- DELETE policy - coaches can delete
CREATE POLICY "Coaches can delete business financial goals" ON business_financial_goals
    FOR DELETE USING (
        -- Coach is assigned to this business
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.assigned_coach_id = auth.uid()
            AND (
                b.id::text = business_financial_goals.business_id
                OR b.id = business_financial_goals.business_id::uuid
            )
        )
        OR
        -- Super admin
        EXISTS (
            SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
        )
    );

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Coach RLS policies for business_financial_goals fixed';
    RAISE NOTICE 'Coaches can now INSERT/UPDATE/DELETE financial goals for their assigned clients';
END $$;
