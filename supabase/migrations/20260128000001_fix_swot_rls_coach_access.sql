-- Fix SWOT RLS for coach access
-- Problem: swot_analyses.business_id stores user UUIDs (not businesses.id),
-- so the generic RLS policy from 20260127 fails for coaches.
-- swot_items write policy also doesn't allow coach writes.

-- =====================================================
-- 1. FIX swot_analyses RLS
-- =====================================================
-- Drop the generic policy that doesn't work for this table
DROP POLICY IF EXISTS "rls_access" ON swot_analyses;

-- Create a policy that handles the user-ID-as-business-ID pattern
CREATE POLICY "rls_access" ON swot_analyses
FOR ALL TO authenticated
USING (
    auth_is_super_admin()
    -- Owner: business_id stores the owner's user_id
    OR business_id = auth.uid()
    -- Also check user_id column directly
    OR user_id = auth.uid()
    -- Coach: find businesses where this user is assigned_coach_id,
    -- then match swot_analyses.business_id to that business's owner_id
    OR business_id IN (
        SELECT b.owner_id FROM businesses b
        WHERE b.assigned_coach_id = auth.uid()
    )
    -- Team member: find businesses via business_users,
    -- then match swot_analyses.business_id to that business's owner_id
    OR business_id IN (
        SELECT b.owner_id FROM businesses b
        JOIN business_users bu ON bu.business_id = b.id
        WHERE bu.user_id = auth.uid()
        AND bu.status = 'active'
    )
    -- Also allow if business_id is actually a businesses.id (for any correctly stored data)
    OR business_id = ANY(auth_get_accessible_business_ids())
)
WITH CHECK (
    auth_is_super_admin()
    OR business_id = auth.uid()
    OR user_id = auth.uid()
    OR business_id IN (
        SELECT b.owner_id FROM businesses b
        WHERE b.assigned_coach_id = auth.uid()
    )
    OR business_id IN (
        SELECT b.owner_id FROM businesses b
        JOIN business_users bu ON bu.business_id = b.id
        WHERE bu.user_id = auth.uid()
        AND bu.status = 'active'
    )
    OR auth_can_manage_business(business_id)
);

-- =====================================================
-- 2. FIX swot_items RLS
-- =====================================================
-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage SWOT items via analysis" ON swot_items;
DROP POLICY IF EXISTS "Coaches can view client SWOT items" ON swot_items;
DROP POLICY IF EXISTS "rls_access" ON swot_items;

-- Single policy that covers owners, coaches, and team members
-- swot_items links to swot_analyses via swot_analysis_id
CREATE POLICY "rls_access" ON swot_items
FOR ALL TO authenticated
USING (
    auth_is_super_admin()
    OR EXISTS (
        SELECT 1 FROM swot_analyses sa
        WHERE sa.id = swot_items.swot_analysis_id
        AND (
            -- Owner access
            sa.business_id = auth.uid()
            OR sa.user_id = auth.uid()
            -- Coach access
            OR sa.business_id IN (
                SELECT b.owner_id FROM businesses b
                WHERE b.assigned_coach_id = auth.uid()
            )
            -- Team member access
            OR sa.business_id IN (
                SELECT b.owner_id FROM businesses b
                JOIN business_users bu ON bu.business_id = b.id
                WHERE bu.user_id = auth.uid()
                AND bu.status = 'active'
            )
            -- Standard business_id match
            OR sa.business_id = ANY(auth_get_accessible_business_ids())
        )
    )
)
WITH CHECK (
    auth_is_super_admin()
    OR EXISTS (
        SELECT 1 FROM swot_analyses sa
        WHERE sa.id = swot_items.swot_analysis_id
        AND (
            sa.business_id = auth.uid()
            OR sa.user_id = auth.uid()
            OR sa.business_id IN (
                SELECT b.owner_id FROM businesses b
                WHERE b.assigned_coach_id = auth.uid()
            )
            OR sa.business_id IN (
                SELECT b.owner_id FROM businesses b
                JOIN business_users bu ON bu.business_id = b.id
                WHERE bu.user_id = auth.uid()
                AND bu.status = 'active'
            )
            OR auth_can_manage_business(sa.business_id)
        )
    )
);
