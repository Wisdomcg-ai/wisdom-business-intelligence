-- =====================================================
-- FIX COACH RLS POLICIES FOR FINANCIAL FORECASTS & WEEKLY REVIEWS
-- =====================================================
-- Issue: Coaches get 403 errors when trying to create/update forecasts
-- for their assigned clients because the existing policies only check
-- user_roles table, not the businesses.assigned_coach_id relationship.
--
-- This migration adds direct coach access via assigned_coach_id.
-- =====================================================

-- =====================================================
-- 1. FINANCIAL_FORECASTS - Add coach access policies
-- =====================================================

-- Drop existing policies to recreate with coach support
DROP POLICY IF EXISTS "Users can view forecasts with role access" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Users can insert forecasts with appropriate role" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Users can update forecasts with appropriate role" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Only owners and admins can delete forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Coaches can view client forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Coaches can manage client forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Super admins can manage all forecasts" ON public.financial_forecasts;

-- SELECT policy: Users can view forecasts they own, have role access to, or are assigned coach for
CREATE POLICY "Users can view forecasts"
  ON public.financial_forecasts
  FOR SELECT
  USING (
    -- Own business (via business_profiles)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
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
    -- Own business (via business_profiles)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
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
    -- Own business (via business_profiles)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
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
-- 2. WEEKLY_REVIEWS - Add coach INSERT/UPDATE policies
-- =====================================================

DROP POLICY IF EXISTS "Users can manage their own weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Coaches can view client weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Coaches can create client weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Coaches can update client weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Super admins can manage weekly reviews" ON public.weekly_reviews;

-- SELECT policy
CREATE POLICY "Users can view weekly reviews"
  ON public.weekly_reviews
  FOR SELECT
  USING (
    -- Own review
    user_id = auth.uid()
    OR
    -- Is assigned coach (business_id = businesses.id)
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = weekly_reviews.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Is assigned coach (business_id = business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id = weekly_reviews.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT policy
CREATE POLICY "Users can insert weekly reviews"
  ON public.weekly_reviews
  FOR INSERT
  WITH CHECK (
    -- Own review (user_id matches)
    user_id = auth.uid()
    OR
    -- Is assigned coach (business_id = businesses.id)
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = weekly_reviews.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Is assigned coach (business_id = business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id = weekly_reviews.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- UPDATE policy
CREATE POLICY "Users can update weekly reviews"
  ON public.weekly_reviews
  FOR UPDATE
  USING (
    -- Own review
    user_id = auth.uid()
    OR
    -- Is assigned coach (business_id = businesses.id)
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = weekly_reviews.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Is assigned coach (business_id = business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id = weekly_reviews.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- DELETE policy
CREATE POLICY "Users can delete weekly reviews"
  ON public.weekly_reviews
  FOR DELETE
  USING (
    -- Own review
    user_id = auth.uid()
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 3. STRATEGY_DATA - Add coach INSERT/UPDATE policies
-- =====================================================
-- This table stores vision_mission data and uses user_id

DROP POLICY IF EXISTS "Users can view own strategy data" ON public.strategy_data;
DROP POLICY IF EXISTS "Users can insert own strategy data" ON public.strategy_data;
DROP POLICY IF EXISTS "Users can update own strategy data" ON public.strategy_data;
DROP POLICY IF EXISTS "Coaches can view client strategy data" ON public.strategy_data;
DROP POLICY IF EXISTS "Coaches can manage client strategy data" ON public.strategy_data;
DROP POLICY IF EXISTS "Super admins can view all strategy data" ON public.strategy_data;

-- SELECT policy
CREATE POLICY "Users can view strategy data"
  ON public.strategy_data
  FOR SELECT
  USING (
    -- Own data
    user_id = auth.uid()
    OR
    -- Is assigned coach (user_id = business owner)
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.owner_id = strategy_data.user_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT policy
CREATE POLICY "Users can insert strategy data"
  ON public.strategy_data
  FOR INSERT
  WITH CHECK (
    -- Own data
    user_id = auth.uid()
    OR
    -- Is assigned coach (user_id = business owner)
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.owner_id = strategy_data.user_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- UPDATE policy
CREATE POLICY "Users can update strategy data"
  ON public.strategy_data
  FOR UPDATE
  USING (
    -- Own data
    user_id = auth.uid()
    OR
    -- Is assigned coach (user_id = business owner)
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.owner_id = strategy_data.user_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- DELETE policy (owner only)
CREATE POLICY "Users can delete strategy data"
  ON public.strategy_data
  FOR DELETE
  USING (
    -- Own data only
    user_id = auth.uid()
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 4. WEEKLY_METRICS_SNAPSHOTS - Add coach policies
-- =====================================================

DROP POLICY IF EXISTS "Coaches can view client snapshots" ON public.weekly_metrics_snapshots;
DROP POLICY IF EXISTS "Users can manage own snapshots" ON public.weekly_metrics_snapshots;

-- Handle case where table might not exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_metrics_snapshots') THEN
    -- SELECT policy
    EXECUTE '
      CREATE POLICY "Users can view weekly metrics snapshots"
        ON public.weekly_metrics_snapshots
        FOR SELECT
        USING (
          -- Own data
          user_id = auth.uid()
          OR
          -- Is assigned coach (via business_id as businesses.id)
          EXISTS (
            SELECT 1 FROM public.businesses b
            WHERE b.id = weekly_metrics_snapshots.business_id
              AND b.assigned_coach_id = auth.uid()
          )
          OR
          -- Is assigned coach (via business_id as business_profiles.id)
          EXISTS (
            SELECT 1 FROM public.business_profiles bp
            JOIN public.businesses b ON b.id = bp.business_id
            WHERE bp.id = weekly_metrics_snapshots.business_id
              AND b.assigned_coach_id = auth.uid()
          )
          OR
          -- Super admin
          EXISTS (
            SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin''
          )
        )
    ';

    -- INSERT/UPDATE policy for coaches
    EXECUTE '
      CREATE POLICY "Users can insert weekly metrics snapshots"
        ON public.weekly_metrics_snapshots
        FOR INSERT
        WITH CHECK (
          user_id = auth.uid()
          OR
          EXISTS (
            SELECT 1 FROM public.businesses b
            WHERE b.id = weekly_metrics_snapshots.business_id
              AND b.assigned_coach_id = auth.uid()
          )
          OR
          EXISTS (
            SELECT 1 FROM public.business_profiles bp
            JOIN public.businesses b ON b.id = bp.business_id
            WHERE bp.id = weekly_metrics_snapshots.business_id
              AND b.assigned_coach_id = auth.uid()
          )
          OR
          EXISTS (
            SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin''
          )
        )
    ';
  END IF;
END $$;

-- =====================================================
-- 5. DASHBOARD_PREFERENCES - Add coach policies
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dashboard_preferences') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage own dashboard preferences" ON public.dashboard_preferences';
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can view client dashboard preferences" ON public.dashboard_preferences';

    EXECUTE '
      CREATE POLICY "Users can manage dashboard preferences"
        ON public.dashboard_preferences
        FOR ALL
        USING (
          -- Own data
          user_id = auth.uid()
          OR
          -- Is assigned coach (via business_id as businesses.id)
          EXISTS (
            SELECT 1 FROM public.businesses b
            WHERE b.id = dashboard_preferences.business_id
              AND b.assigned_coach_id = auth.uid()
          )
          OR
          -- Is assigned coach (via business_id as business_profiles.id)
          EXISTS (
            SELECT 1 FROM public.business_profiles bp
            JOIN public.businesses b ON b.id = bp.business_id
            WHERE bp.id = dashboard_preferences.business_id
              AND b.assigned_coach_id = auth.uid()
          )
          OR
          -- Super admin
          EXISTS (
            SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin''
          )
        )
    ';
  END IF;
END $$;

-- =====================================================
-- 6. BUSINESS_USERS - Add coach SELECT policy
-- =====================================================

DROP POLICY IF EXISTS "Coaches can view client team members" ON public.business_users;

-- This table links users to businesses - coaches need to see team
CREATE POLICY "Coaches can view client team members"
  ON public.business_users
  FOR SELECT
  USING (
    -- Own business
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
    OR
    -- Is assigned coach
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
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
  RAISE NOTICE '✅ Coach RLS policies fixed for all tables';
  RAISE NOTICE '   - financial_forecasts: Coaches can create/update for assigned clients';
  RAISE NOTICE '   - weekly_reviews: Coaches can create/update for assigned clients';
  RAISE NOTICE '   - strategy_data: Coaches can now save vision/mission/values for clients';
  RAISE NOTICE '   - weekly_metrics_snapshots: Coaches can view/insert for clients';
  RAISE NOTICE '   - dashboard_preferences: Coaches can manage for clients';
  RAISE NOTICE '   - business_users: Coaches can view client team members';
END $$;
