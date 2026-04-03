-- =====================================================
-- FIX COACH RLS POLICIES FOR FINANCIAL & WEEKLY TABLES
-- =====================================================
-- Fixes 406 errors for business_financial_goals and weekly_reviews
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. BUSINESS_FINANCIAL_GOALS - Coach Access
-- =====================================================
-- This table uses business_profiles.id as business_id

DROP POLICY IF EXISTS "Coaches can view client financial goals" ON public.business_financial_goals;

CREATE POLICY "Coaches can view client financial goals" ON public.business_financial_goals
  FOR SELECT
  USING (
    -- Coach can view if the business_id (which is business_profiles.id)
    -- belongs to a business_profile whose business_id is assigned to this coach
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id::text = business_financial_goals.business_id::text
      AND b.assigned_coach_id = auth.uid()
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
-- Check what column this table uses (business_id might be businesses.id)

DROP POLICY IF EXISTS "Coaches can view client weekly reviews" ON public.weekly_reviews;

-- Try with business_id as businesses.id first
CREATE POLICY "Coaches can view client weekly reviews" ON public.weekly_reviews
  FOR SELECT
  USING (
    -- Direct match: business_id is businesses.id
    business_id::text IN (
      SELECT id::text FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    -- Indirect match: business_id might be business_profiles.id
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id::text = weekly_reviews.business_id::text
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admins can view all
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 3. Also fix other tables that might have same issue
-- =====================================================

-- STRATEGIC_INITIATIVES uses business_profiles.id
DROP POLICY IF EXISTS "Coaches can view client initiatives" ON public.strategic_initiatives;

CREATE POLICY "Coaches can view client initiatives" ON public.strategic_initiatives
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id::text = strategic_initiatives.business_id::text
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- BUSINESS_KPIS uses business_profiles.id
DROP POLICY IF EXISTS "Coaches can view client KPIs" ON public.business_kpis;

CREATE POLICY "Coaches can view client KPIs" ON public.business_kpis
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id::text = business_kpis.business_id::text
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- VISION_TARGETS uses business_profiles.id
DROP POLICY IF EXISTS "Coaches can view client vision targets" ON public.vision_targets;

CREATE POLICY "Coaches can view client vision targets" ON public.vision_targets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id::text = vision_targets.business_id::text
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- QUARTERLY_FORECASTS uses business_profiles.id
DROP POLICY IF EXISTS "Coaches can view client forecasts" ON public.quarterly_forecasts;

CREATE POLICY "Coaches can view client forecasts" ON public.quarterly_forecasts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id::text = quarterly_forecasts.business_id::text
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- WEEKLY_METRICS_SNAPSHOTS
DROP POLICY IF EXISTS "Coaches can view client snapshots" ON public.weekly_metrics_snapshots;

CREATE POLICY "Coaches can view client snapshots" ON public.weekly_metrics_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id::text = weekly_metrics_snapshots.business_id::text
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Coach RLS policies fixed for financial and weekly tables';
  RAISE NOTICE '✓ Tables updated: business_financial_goals, weekly_reviews, strategic_initiatives, business_kpis, vision_targets, quarterly_forecasts, weekly_metrics_snapshots';
END $$;
