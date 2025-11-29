-- =====================================================
-- COACH VIEW RLS POLICIES - SIMPLE FIX
-- =====================================================
-- Fixes the 406 errors for business_profiles and weekly_reviews
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. BUSINESS_PROFILES - Coach Access
-- =====================================================
-- Note: business_profiles has business_id column

DROP POLICY IF EXISTS "Coaches can view client business profiles" ON public.business_profiles;

CREATE POLICY "Coaches can view client business profiles" ON public.business_profiles
  FOR SELECT
  USING (
    -- Coaches can view profiles for businesses assigned to them
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    -- Super admins can view all
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 2. WEEKLY_REVIEWS - Coach Access
-- =====================================================
-- Note: weekly_reviews has business_id column

DROP POLICY IF EXISTS "Coaches can view client weekly reviews" ON public.weekly_reviews;

CREATE POLICY "Coaches can view client weekly reviews" ON public.weekly_reviews
  FOR SELECT
  USING (
    -- Coaches can view reviews for businesses assigned to them
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    -- Super admins can view all
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- SUCCESS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Coach view RLS policies created for business_profiles and weekly_reviews';
END $$;
