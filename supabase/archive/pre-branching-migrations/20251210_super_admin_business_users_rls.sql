-- =====================================================
-- ADD SUPER_ADMIN RLS POLICY FOR BUSINESS_USERS
-- =====================================================
-- Super admins need to view team members from the admin portal

-- SELECT policy for super_admins: can see all team members
CREATE POLICY "Super admins can view all team members"
  ON public.business_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
      AND sr.role = 'super_admin'
    )
  );

-- INSERT policy for super_admins: can add team members to any business
CREATE POLICY "Super admins can add team members"
  ON public.business_users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
      AND sr.role = 'super_admin'
    )
  );

-- UPDATE policy for super_admins: can update team members in any business
CREATE POLICY "Super admins can update team members"
  ON public.business_users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
      AND sr.role = 'super_admin'
    )
  );

-- DELETE policy for super_admins: can remove team members from any business
CREATE POLICY "Super admins can remove team members"
  ON public.business_users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
      AND sr.role = 'super_admin'
    )
  );

-- Also add policy for coaches to delete team members from their client businesses
DROP POLICY IF EXISTS "Coaches can remove team members" ON public.business_users;
CREATE POLICY "Coaches can remove team members"
  ON public.business_users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.assigned_coach_id = auth.uid()
    )
    AND user_id != auth.uid()
  );
