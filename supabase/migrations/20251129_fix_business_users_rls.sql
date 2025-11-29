-- =====================================================
-- FIX BUSINESS_USERS RLS - REMOVE INFINITE RECURSION
-- =====================================================

-- Drop all existing policies on business_users
DROP POLICY IF EXISTS "Users can view their business associations" ON public.business_users;
DROP POLICY IF EXISTS "Business owners and admins can manage team" ON public.business_users;
DROP POLICY IF EXISTS "Coaches can view client team members" ON public.business_users;
DROP POLICY IF EXISTS "Users can view business team members" ON public.business_users;
DROP POLICY IF EXISTS "Owners and admins can add team members" ON public.business_users;
DROP POLICY IF EXISTS "Owners and admins can update team members" ON public.business_users;
DROP POLICY IF EXISTS "Owners can remove team members" ON public.business_users;

-- Simple SELECT policy: users can see their own rows
CREATE POLICY "Users can view own business associations"
  ON public.business_users FOR SELECT
  USING (user_id = auth.uid());

-- SELECT policy for coaches: can see team members of businesses they coach
CREATE POLICY "Coaches can view client team members"
  ON public.business_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- SELECT policy for business owners: can see all team members via businesses table
CREATE POLICY "Owners can view all team members"
  ON public.business_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.owner_id = auth.uid()
    )
  );

-- INSERT policy: owners can add team members (check via businesses table, not business_users)
CREATE POLICY "Owners can add team members"
  ON public.business_users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- UPDATE policy: owners can update team members
CREATE POLICY "Owners can update team members"
  ON public.business_users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- DELETE policy: owners can remove team members (not themselves)
CREATE POLICY "Owners can remove team members"
  ON public.business_users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.owner_id = auth.uid()
    )
    AND user_id != auth.uid()
  );
