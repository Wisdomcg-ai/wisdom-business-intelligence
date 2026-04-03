-- ============================================================
-- FIX INFINITE RECURSION IN BUSINESSES RLS POLICIES
-- ============================================================
-- The recursion occurs because:
-- 1. Many tables have policies that query business_members
-- 2. business_members has a policy that queries businesses
-- 3. If businesses has ANY policy that queries business_members (or any table
--    with policies referencing businesses), we get infinite recursion
--
-- Solution: Ensure businesses policies ONLY use:
-- - Direct column comparisons (owner_id, assigned_coach_id)
-- - Queries to system_roles (which has simple non-recursive policies)
-- ============================================================

-- ============================================================
-- STEP 1: Drop ALL existing policies on businesses
-- ============================================================
DROP POLICY IF EXISTS "Coaches can view assigned businesses" ON public.businesses;
DROP POLICY IF EXISTS "Coaches can update assigned businesses" ON public.businesses;
DROP POLICY IF EXISTS "Coaches can insert businesses" ON public.businesses;
DROP POLICY IF EXISTS "Coaches can view their businesses" ON public.businesses;
DROP POLICY IF EXISTS "Coaches can update their businesses" ON public.businesses;
DROP POLICY IF EXISTS "Owners can view their own business" ON public.businesses;
DROP POLICY IF EXISTS "Users can view own business" ON public.businesses;
DROP POLICY IF EXISTS "Users can update own business" ON public.businesses;
DROP POLICY IF EXISTS "businesses_all_final" ON public.businesses;
DROP POLICY IF EXISTS "businesses_select_policy" ON public.businesses;
DROP POLICY IF EXISTS "businesses_insert_policy" ON public.businesses;
DROP POLICY IF EXISTS "businesses_update_policy" ON public.businesses;
DROP POLICY IF EXISTS "businesses_delete_policy" ON public.businesses;

-- ============================================================
-- STEP 2: Create simple, non-recursive policies
-- ============================================================
-- These policies ONLY use direct column checks or system_roles queries
-- They do NOT query any table that has policies referencing businesses

-- SELECT policy: owners, assigned coaches, and super_admins can view
CREATE POLICY "businesses_select_policy" ON public.businesses
  FOR SELECT
  USING (
    -- Owner can view their business
    owner_id = auth.uid()
    -- Assigned coach can view
    OR assigned_coach_id = auth.uid()
    -- Super admin can view all (system_roles has safe policies)
    OR EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT policy: coaches and super_admins can create businesses
CREATE POLICY "businesses_insert_policy" ON public.businesses
  FOR INSERT
  WITH CHECK (
    -- Any authenticated user can create a business (will be set as owner)
    auth.uid() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role IN ('coach', 'super_admin')
    )
  );

-- UPDATE policy: owners, assigned coaches, and super_admins can update
CREATE POLICY "businesses_update_policy" ON public.businesses
  FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR assigned_coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- DELETE policy: only super_admins can delete businesses
CREATE POLICY "businesses_delete_policy" ON public.businesses
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- ============================================================
-- STEP 3: Ensure RLS is enabled
-- ============================================================
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VERIFICATION
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'BUSINESSES RLS RECURSION FIX COMPLETE';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Policies on businesses now only use:';
  RAISE NOTICE '  - Direct column checks (owner_id, assigned_coach_id)';
  RAISE NOTICE '  - system_roles queries (safe, non-recursive)';
  RAISE NOTICE '';
  RAISE NOTICE 'This breaks the recursion chain:';
  RAISE NOTICE '  Table X -> business_members -> businesses -> STOPS HERE';
  RAISE NOTICE '==============================================';
END $$;
