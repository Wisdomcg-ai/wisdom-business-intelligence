-- =====================================================
-- FIX FINANCIAL FORECASTS RLS - ADD OWNER ACCESS VIA BUSINESSES TABLE
-- =====================================================
-- Issue: Clients can't create/view forecasts because the business_id
-- can be either businesses.id or business_profiles.id, but the current
-- policy only checks business_profiles.id for owner access.
--
-- The client user (mattmalouf) is the owner of a business where:
-- - businesses.owner_id = user.id
-- - businesses.id = '8c8c63b2-bdc4-4115-9375-8d0fd89acc00'
--
-- But the forecast INSERT policy checks:
-- - business_profiles.id = business_id AND business_profiles.user_id = auth.uid()
--
-- This fails because business_id is the businesses.id, not business_profiles.id
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Users can insert forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Users can update forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Users can delete forecasts" ON public.financial_forecasts;

-- SELECT policy: Users can view forecasts they own, have role access to, or are assigned coach for
CREATE POLICY "Users can view forecasts"
  ON public.financial_forecasts
  FOR SELECT
  USING (
    -- Own business (via business_profiles.id = business_id)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Own business (via businesses.id = business_id AND owner_id = auth.uid())
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = financial_forecasts.business_id
        AND b.owner_id = auth.uid()
    )
    OR
    -- Has role for this business (via user_roles)
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.business_id = financial_forecasts.business_id
        AND ur.user_id = auth.uid()
    )
    OR
    -- Is assigned coach (business_id = businesses.id)
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = financial_forecasts.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Is assigned coach (business_id = business_profiles.id -> businesses via business_profiles.business_id)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id = financial_forecasts.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT policy: Users can insert forecasts for businesses they own, have owner/coach/admin role, or are assigned coach
CREATE POLICY "Users can insert forecasts"
  ON public.financial_forecasts
  FOR INSERT
  WITH CHECK (
    -- Own business (via business_profiles.id = business_id)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Own business (via businesses.id = business_id AND owner_id = auth.uid())
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = financial_forecasts.business_id
        AND b.owner_id = auth.uid()
    )
    OR
    -- Has owner, coach, or admin role (via user_roles)
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.business_id = financial_forecasts.business_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'coach', 'admin')
    )
    OR
    -- Is assigned coach (business_id = businesses.id)
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = financial_forecasts.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Is assigned coach (business_id = business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id = financial_forecasts.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- UPDATE policy: Same as INSERT
CREATE POLICY "Users can update forecasts"
  ON public.financial_forecasts
  FOR UPDATE
  USING (
    -- Own business (via business_profiles.id = business_id)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Own business (via businesses.id = business_id AND owner_id = auth.uid())
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = financial_forecasts.business_id
        AND b.owner_id = auth.uid()
    )
    OR
    -- Has owner, coach, or admin role (via user_roles)
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.business_id = financial_forecasts.business_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'coach', 'admin')
    )
    OR
    -- Is assigned coach (business_id = businesses.id)
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = financial_forecasts.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Is assigned coach (business_id = business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id = financial_forecasts.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- DELETE policy: Only owners and admins (more restrictive)
CREATE POLICY "Users can delete forecasts"
  ON public.financial_forecasts
  FOR DELETE
  USING (
    -- Own business (via business_profiles)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Own business (via businesses.id)
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = financial_forecasts.business_id
        AND b.owner_id = auth.uid()
    )
    OR
    -- Has owner or admin role
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.business_id = financial_forecasts.business_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('owner', 'admin')
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Financial forecasts RLS fixed with owner access via businesses table';
  RAISE NOTICE '   - Added: businesses.owner_id = auth.uid() check';
  RAISE NOTICE '   - Now supports both business_profiles.id and businesses.id as business_id';
END $$;
