-- ============================================================================
-- FIX COACH ACCESS TO BUSINESS_PROFILES
-- Ensures coaches can INSERT, SELECT, and UPDATE business profiles for their clients
-- ============================================================================

-- ============================================================================
-- PART 1: Drop existing coach-related policies to avoid conflicts
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can view client business profiles" ON public.business_profiles;
DROP POLICY IF EXISTS "Coaches can view client profiles" ON public.business_profiles;
DROP POLICY IF EXISTS "Coaches can insert client profiles" ON public.business_profiles;
DROP POLICY IF EXISTS "Coaches can update client profiles" ON public.business_profiles;

-- ============================================================================
-- PART 2: Create comprehensive coach policies
-- ============================================================================

-- SELECT: Coaches can view profiles for businesses they're assigned to
CREATE POLICY "Coaches can view client business profiles"
  ON public.business_profiles FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT: Coaches can create profiles for businesses they're assigned to
CREATE POLICY "Coaches can insert client business profiles"
  ON public.business_profiles FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- UPDATE: Coaches can update profiles for businesses they're assigned to
CREATE POLICY "Coaches can update client business profiles"
  ON public.business_profiles FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- ============================================================================
-- PART 3: Ensure owner policies exist (users can manage their own profiles)
-- ============================================================================

-- Check if owner policies exist, add if missing
DO $$
BEGIN
  -- SELECT for owners
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'business_profiles'
    AND policyname = 'Users can view own business profile'
  ) THEN
    CREATE POLICY "Users can view own business profile"
      ON public.business_profiles FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  -- INSERT for owners
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'business_profiles'
    AND policyname = 'Users can insert own business profile'
  ) THEN
    CREATE POLICY "Users can insert own business profile"
      ON public.business_profiles FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  -- UPDATE for owners
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'business_profiles'
    AND policyname = 'Users can update own business profile'
  ) THEN
    CREATE POLICY "Users can update own business profile"
      ON public.business_profiles FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================================
-- PART 4: Fix business_financial_goals and weekly_reviews for coaches
-- These were showing 406 errors in the logs
-- ============================================================================

-- business_financial_goals: Ensure coaches have full CRUD access
DROP POLICY IF EXISTS "Coaches can view client financial goals" ON public.business_financial_goals;
DROP POLICY IF EXISTS "Coaches can insert client financial goals" ON public.business_financial_goals;
DROP POLICY IF EXISTS "Coaches can update client financial goals" ON public.business_financial_goals;
DROP POLICY IF EXISTS "Coaches can delete client financial goals" ON public.business_financial_goals;

CREATE POLICY "Coaches can view client financial goals"
  ON public.business_financial_goals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON bp.business_id = b.id
      WHERE bp.id::text = business_financial_goals.business_id::text
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Coaches can insert client financial goals"
  ON public.business_financial_goals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON bp.business_id = b.id
      WHERE bp.id::text = business_financial_goals.business_id::text
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Coaches can update client financial goals"
  ON public.business_financial_goals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON bp.business_id = b.id
      WHERE bp.id::text = business_financial_goals.business_id::text
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- weekly_reviews: Ensure coaches have full access
DROP POLICY IF EXISTS "Coaches can view client weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Coaches can insert client weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Coaches can update client weekly reviews" ON public.weekly_reviews;

CREATE POLICY "Coaches can view client weekly reviews"
  ON public.weekly_reviews FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Coaches can insert client weekly reviews"
  ON public.weekly_reviews FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Coaches can update client weekly reviews"
  ON public.weekly_reviews FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Coach RLS policies updated for: business_profiles, business_financial_goals, weekly_reviews';
END $$;
