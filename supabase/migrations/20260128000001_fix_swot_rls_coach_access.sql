-- Fix SWOT RLS for coach access + fix create_quarterly_swot RPC type mismatch
-- Problem 1: swot_analyses.business_id stores user UUIDs (not businesses.id),
--   so the generic RLS policy from 20260127 fails for coaches.
-- Problem 2: create_quarterly_swot takes p_quarter as TEXT but column is INTEGER.

-- =====================================================
-- 0. FIX create_quarterly_swot RPC (type mismatch)
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_quarterly_swot(
  p_user_id UUID,
  p_quarter TEXT,
  p_year INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_swot_id UUID;
BEGIN
  INSERT INTO public.swot_analyses (user_id, business_id, quarter, year, type, status, created_by)
  VALUES (p_user_id, p_user_id, p_quarter::INTEGER, p_year, 'quarterly', 'draft', auth.uid())
  RETURNING id INTO v_swot_id;
  RETURN v_swot_id;
END;
$$;

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

-- =====================================================
-- 3. FIX TABLES USING business_profiles.id AS business_id
-- =====================================================
-- These tables store business_profiles.id (not businesses.id) in their
-- business_id column. The generic RLS checks against businesses.id,
-- so coaches/team members get 406/403 errors.
-- Fix: also match via business_profiles -> businesses -> coach/team lookup.

DO $$
DECLARE
    profile_tables TEXT[] := ARRAY[
        'business_financial_goals',
        'business_kpis',
        'strategic_initiatives'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY profile_tables LOOP
        -- Only fix if table exists and has business_id column
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = t
            AND column_name = 'business_id'
        ) THEN
            EXECUTE format('DROP POLICY IF EXISTS "rls_access" ON %I', t);

            EXECUTE format(
                'CREATE POLICY "rls_access" ON %I
                FOR ALL TO authenticated
                USING (
                    auth_is_super_admin()
                    OR business_id = ANY(auth_get_accessible_business_ids_text())
                    OR EXISTS (
                        SELECT 1 FROM business_profiles bp
                        JOIN businesses b ON b.id = bp.business_id
                        WHERE bp.id::text = %I.business_id::text
                        AND (
                            b.owner_id = auth.uid()
                            OR b.assigned_coach_id = auth.uid()
                            OR EXISTS (
                                SELECT 1 FROM business_users bu
                                WHERE bu.business_id = b.id
                                AND bu.user_id = auth.uid()
                                AND bu.status = ''active''
                            )
                        )
                    )
                )
                WITH CHECK (
                    auth_is_super_admin()
                    OR auth_can_manage_business(business_id::uuid)
                    OR EXISTS (
                        SELECT 1 FROM business_profiles bp
                        JOIN businesses b ON b.id = bp.business_id
                        WHERE bp.id::text = %I.business_id::text
                        AND (
                            b.owner_id = auth.uid()
                            OR b.assigned_coach_id = auth.uid()
                            OR EXISTS (
                                SELECT 1 FROM business_users bu
                                WHERE bu.business_id = b.id
                                AND bu.user_id = auth.uid()
                                AND bu.status = ''active''
                            )
                        )
                    )
                )',
                t, t, t
            );

            RAISE NOTICE 'Fixed RLS for business_profiles-keyed table: %', t;
        END IF;
    END LOOP;
END $$;
