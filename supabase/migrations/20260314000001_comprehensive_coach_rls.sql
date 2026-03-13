-- ============================================================================
-- COMPREHENSIVE COACH/ADMIN RLS POLICIES
-- Migration: 20260314000001_comprehensive_coach_rls.sql
-- Date: 2026-03-14
--
-- ROOT CAUSE FIX: Coaches cannot SELECT from business_profiles, which causes
-- the Goals Wizard hook to fall back to the wrong business ID. This migration
-- adds coach and super_admin RLS policies to ALL application tables.
--
-- THREE BUSINESS ID PATTERNS:
--   Pattern A (business_id column — UUID):
--     Coach access via businesses.assigned_coach_id joined on business_id.
--     Handles both cases where business_id = businesses.id OR
--     business_id = business_profiles.id.
--
--   Pattern A-TEXT (business_id column — TEXT):
--     Same as Pattern A but with ::text casting for TEXT-typed columns.
--
--   Pattern B (user_id column):
--     Coach access via businesses.owner_id = table.user_id joined on
--     businesses.assigned_coach_id = auth.uid().
--
-- Each policy:
--   1. Uses DROP POLICY IF EXISTS before CREATE POLICY (idempotent)
--   2. Wrapped in DO $$ block with table existence check
--   3. Uses unique "coach_rls_v3" suffix to avoid conflicts
-- ============================================================================

-- ============================================================================
-- SECTION 1: CRITICAL — ID Resolution Tables
-- These are required for coaches to resolve client business IDs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1a. businesses — Coach can SELECT their assigned businesses
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'businesses') THEN
    -- Enable RLS if not already enabled
    ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

    -- SELECT: coach can see businesses they are assigned to, or super_admin sees all
    DROP POLICY IF EXISTS "coach_select_businesses_coach_rls_v3" ON public.businesses;
    CREATE POLICY "coach_select_businesses_coach_rls_v3"
      ON public.businesses
      FOR SELECT
      TO authenticated
      USING (
        assigned_coach_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.system_roles sr
          WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1b. business_profiles — Coach can SELECT their clients' profiles
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_profiles') THEN
    ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_business_profiles_coach_rls_v3" ON public.business_profiles;
    CREATE POLICY "coach_select_business_profiles_coach_rls_v3"
      ON public.business_profiles
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.businesses b
          WHERE b.id = business_profiles.business_id
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.system_roles sr
          WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1c. business_users — Coach can SELECT users of their assigned businesses
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_users') THEN
    ALTER TABLE public.business_users ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_business_users_coach_rls_v3" ON public.business_users;
    CREATE POLICY "coach_select_business_users_coach_rls_v3"
      ON public.business_users
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.businesses b
          WHERE b.id = business_users.business_id
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.system_roles sr
          WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
        )
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 2: Goals Wizard Tables (Pattern A — business_id, mixed UUID/TEXT)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: Pattern A (UUID) policy creator
-- For tables where business_id is UUID type. The USING clause checks:
--   - business_id = businesses.id (direct match)
--   - business_id = business_profiles.id (profile ID used as business_id)
--   - super_admin override
-- ---------------------------------------------------------------------------

-- 2a. business_financial_goals (business_id is TEXT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_financial_goals') THEN
    ALTER TABLE public.business_financial_goals ENABLE ROW LEVEL SECURITY;

    -- SELECT
    DROP POLICY IF EXISTS "coach_select_business_financial_goals_coach_rls_v3" ON public.business_financial_goals;
    CREATE POLICY "coach_select_business_financial_goals_coach_rls_v3"
      ON public.business_financial_goals FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    -- INSERT
    DROP POLICY IF EXISTS "coach_insert_business_financial_goals_coach_rls_v3" ON public.business_financial_goals;
    CREATE POLICY "coach_insert_business_financial_goals_coach_rls_v3"
      ON public.business_financial_goals FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    -- UPDATE
    DROP POLICY IF EXISTS "coach_update_business_financial_goals_coach_rls_v3" ON public.business_financial_goals;
    CREATE POLICY "coach_update_business_financial_goals_coach_rls_v3"
      ON public.business_financial_goals FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    -- DELETE
    DROP POLICY IF EXISTS "coach_delete_business_financial_goals_coach_rls_v3" ON public.business_financial_goals;
    CREATE POLICY "coach_delete_business_financial_goals_coach_rls_v3"
      ON public.business_financial_goals FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = business_financial_goals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 2b. business_kpis (business_id is TEXT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_kpis') THEN
    ALTER TABLE public.business_kpis ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_business_kpis_coach_rls_v3" ON public.business_kpis;
    CREATE POLICY "coach_select_business_kpis_coach_rls_v3"
      ON public.business_kpis FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = business_kpis.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = business_kpis.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_business_kpis_coach_rls_v3" ON public.business_kpis;
    CREATE POLICY "coach_insert_business_kpis_coach_rls_v3"
      ON public.business_kpis FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = business_kpis.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = business_kpis.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_business_kpis_coach_rls_v3" ON public.business_kpis;
    CREATE POLICY "coach_update_business_kpis_coach_rls_v3"
      ON public.business_kpis FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = business_kpis.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = business_kpis.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = business_kpis.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = business_kpis.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_business_kpis_coach_rls_v3" ON public.business_kpis;
    CREATE POLICY "coach_delete_business_kpis_coach_rls_v3"
      ON public.business_kpis FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = business_kpis.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = business_kpis.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 2c. strategic_initiatives (business_id is UUID)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'strategic_initiatives') THEN
    ALTER TABLE public.strategic_initiatives ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_strategic_initiatives_coach_rls_v3" ON public.strategic_initiatives;
    CREATE POLICY "coach_select_strategic_initiatives_coach_rls_v3"
      ON public.strategic_initiatives FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_strategic_initiatives_coach_rls_v3" ON public.strategic_initiatives;
    CREATE POLICY "coach_insert_strategic_initiatives_coach_rls_v3"
      ON public.strategic_initiatives FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_strategic_initiatives_coach_rls_v3" ON public.strategic_initiatives;
    CREATE POLICY "coach_update_strategic_initiatives_coach_rls_v3"
      ON public.strategic_initiatives FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_strategic_initiatives_coach_rls_v3" ON public.strategic_initiatives;
    CREATE POLICY "coach_delete_strategic_initiatives_coach_rls_v3"
      ON public.strategic_initiatives FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = strategic_initiatives.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 2d. sprint_key_actions (business_id is TEXT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprint_key_actions') THEN
    ALTER TABLE public.sprint_key_actions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_sprint_key_actions_coach_rls_v3" ON public.sprint_key_actions;
    CREATE POLICY "coach_select_sprint_key_actions_coach_rls_v3"
      ON public.sprint_key_actions FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_sprint_key_actions_coach_rls_v3" ON public.sprint_key_actions;
    CREATE POLICY "coach_insert_sprint_key_actions_coach_rls_v3"
      ON public.sprint_key_actions FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_sprint_key_actions_coach_rls_v3" ON public.sprint_key_actions;
    CREATE POLICY "coach_update_sprint_key_actions_coach_rls_v3"
      ON public.sprint_key_actions FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_sprint_key_actions_coach_rls_v3" ON public.sprint_key_actions;
    CREATE POLICY "coach_delete_sprint_key_actions_coach_rls_v3"
      ON public.sprint_key_actions FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = sprint_key_actions.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 2e. operational_activities (business_id is UUID)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'operational_activities') THEN
    ALTER TABLE public.operational_activities ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_operational_activities_coach_rls_v3" ON public.operational_activities;
    CREATE POLICY "coach_select_operational_activities_coach_rls_v3"
      ON public.operational_activities FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_operational_activities_coach_rls_v3" ON public.operational_activities;
    CREATE POLICY "coach_insert_operational_activities_coach_rls_v3"
      ON public.operational_activities FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_operational_activities_coach_rls_v3" ON public.operational_activities;
    CREATE POLICY "coach_update_operational_activities_coach_rls_v3"
      ON public.operational_activities FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_operational_activities_coach_rls_v3" ON public.operational_activities;
    CREATE POLICY "coach_delete_operational_activities_coach_rls_v3"
      ON public.operational_activities FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = operational_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 2f. activity_log (business_id is TEXT) — SELECT and INSERT only
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_log') THEN
    ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_activity_log_coach_rls_v3" ON public.activity_log;
    CREATE POLICY "coach_select_activity_log_coach_rls_v3"
      ON public.activity_log FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = activity_log.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = activity_log.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_activity_log_coach_rls_v3" ON public.activity_log;
    CREATE POLICY "coach_insert_activity_log_coach_rls_v3"
      ON public.activity_log FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = activity_log.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = activity_log.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 3: Weekly/Dashboard Tables (Pattern A — business_id UUID)
-- ============================================================================

-- 3a. weekly_reviews
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'weekly_reviews') THEN
    ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_weekly_reviews_coach_rls_v3" ON public.weekly_reviews;
    CREATE POLICY "coach_select_weekly_reviews_coach_rls_v3"
      ON public.weekly_reviews FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = weekly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = weekly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_weekly_reviews_coach_rls_v3" ON public.weekly_reviews;
    CREATE POLICY "coach_insert_weekly_reviews_coach_rls_v3"
      ON public.weekly_reviews FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = weekly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = weekly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_weekly_reviews_coach_rls_v3" ON public.weekly_reviews;
    CREATE POLICY "coach_update_weekly_reviews_coach_rls_v3"
      ON public.weekly_reviews FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = weekly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = weekly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = weekly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = weekly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 3b. weekly_metrics_snapshots
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'weekly_metrics_snapshots') THEN
    ALTER TABLE public.weekly_metrics_snapshots ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_weekly_metrics_snapshots_coach_rls_v3" ON public.weekly_metrics_snapshots;
    CREATE POLICY "coach_select_weekly_metrics_snapshots_coach_rls_v3"
      ON public.weekly_metrics_snapshots FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = weekly_metrics_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = weekly_metrics_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_weekly_metrics_snapshots_coach_rls_v3" ON public.weekly_metrics_snapshots;
    CREATE POLICY "coach_insert_weekly_metrics_snapshots_coach_rls_v3"
      ON public.weekly_metrics_snapshots FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = weekly_metrics_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = weekly_metrics_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_weekly_metrics_snapshots_coach_rls_v3" ON public.weekly_metrics_snapshots;
    CREATE POLICY "coach_update_weekly_metrics_snapshots_coach_rls_v3"
      ON public.weekly_metrics_snapshots FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = weekly_metrics_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = weekly_metrics_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = weekly_metrics_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = weekly_metrics_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 4: Quarterly Review Tables (Pattern A — business_id UUID)
-- ============================================================================

-- 4a. quarterly_reviews
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quarterly_reviews') THEN
    ALTER TABLE public.quarterly_reviews ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_quarterly_reviews_coach_rls_v3" ON public.quarterly_reviews;
    CREATE POLICY "coach_select_quarterly_reviews_coach_rls_v3"
      ON public.quarterly_reviews FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = quarterly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = quarterly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_quarterly_reviews_coach_rls_v3" ON public.quarterly_reviews;
    CREATE POLICY "coach_insert_quarterly_reviews_coach_rls_v3"
      ON public.quarterly_reviews FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = quarterly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = quarterly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_quarterly_reviews_coach_rls_v3" ON public.quarterly_reviews;
    CREATE POLICY "coach_update_quarterly_reviews_coach_rls_v3"
      ON public.quarterly_reviews FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = quarterly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = quarterly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = quarterly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = quarterly_reviews.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 4b. quarterly_snapshots
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quarterly_snapshots') THEN
    ALTER TABLE public.quarterly_snapshots ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_quarterly_snapshots_coach_rls_v3" ON public.quarterly_snapshots;
    CREATE POLICY "coach_select_quarterly_snapshots_coach_rls_v3"
      ON public.quarterly_snapshots FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = quarterly_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = quarterly_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_quarterly_snapshots_coach_rls_v3" ON public.quarterly_snapshots;
    CREATE POLICY "coach_insert_quarterly_snapshots_coach_rls_v3"
      ON public.quarterly_snapshots FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = quarterly_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = quarterly_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_quarterly_snapshots_coach_rls_v3" ON public.quarterly_snapshots;
    CREATE POLICY "coach_update_quarterly_snapshots_coach_rls_v3"
      ON public.quarterly_snapshots FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = quarterly_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = quarterly_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = quarterly_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = quarterly_snapshots.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 4c. kpi_actuals
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kpi_actuals') THEN
    ALTER TABLE public.kpi_actuals ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_kpi_actuals_coach_rls_v3" ON public.kpi_actuals;
    CREATE POLICY "coach_select_kpi_actuals_coach_rls_v3"
      ON public.kpi_actuals FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = kpi_actuals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = kpi_actuals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_kpi_actuals_coach_rls_v3" ON public.kpi_actuals;
    CREATE POLICY "coach_insert_kpi_actuals_coach_rls_v3"
      ON public.kpi_actuals FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = kpi_actuals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = kpi_actuals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_kpi_actuals_coach_rls_v3" ON public.kpi_actuals;
    CREATE POLICY "coach_update_kpi_actuals_coach_rls_v3"
      ON public.kpi_actuals FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = kpi_actuals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = kpi_actuals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = kpi_actuals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = kpi_actuals.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 5: Strategy/SWOT Tables
-- swot_analyses has business_id (UUID), swot_items links via swot_analysis_id
-- strategy_data, marketing_data, team_data have both user_id and business_id
-- ============================================================================

-- 5a. swot_analyses (business_id is UUID)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'swot_analyses') THEN
    ALTER TABLE public.swot_analyses ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_swot_analyses_coach_rls_v3" ON public.swot_analyses;
    CREATE POLICY "coach_select_swot_analyses_coach_rls_v3"
      ON public.swot_analyses FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_swot_analyses_coach_rls_v3" ON public.swot_analyses;
    CREATE POLICY "coach_insert_swot_analyses_coach_rls_v3"
      ON public.swot_analyses FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_swot_analyses_coach_rls_v3" ON public.swot_analyses;
    CREATE POLICY "coach_update_swot_analyses_coach_rls_v3"
      ON public.swot_analyses FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 5b. swot_items (linked via swot_analysis_id -> swot_analyses.business_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'swot_items') THEN
    ALTER TABLE public.swot_items ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_swot_items_coach_rls_v3" ON public.swot_items;
    CREATE POLICY "coach_select_swot_items_coach_rls_v3"
      ON public.swot_items FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.swot_analyses sa
          JOIN public.businesses b ON b.id::text = sa.business_id::text
          WHERE sa.id = swot_items.swot_analysis_id
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_swot_items_coach_rls_v3" ON public.swot_items;
    CREATE POLICY "coach_insert_swot_items_coach_rls_v3"
      ON public.swot_items FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.swot_analyses sa
          JOIN public.businesses b ON b.id::text = sa.business_id::text
          WHERE sa.id = swot_items.swot_analysis_id
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_swot_items_coach_rls_v3" ON public.swot_items;
    CREATE POLICY "coach_update_swot_items_coach_rls_v3"
      ON public.swot_items FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.swot_analyses sa
          JOIN public.businesses b ON b.id::text = sa.business_id::text
          WHERE sa.id = swot_items.swot_analysis_id
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.swot_analyses sa
          JOIN public.businesses b ON b.id::text = sa.business_id::text
          WHERE sa.id = swot_items.swot_analysis_id
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_swot_items_coach_rls_v3" ON public.swot_items;
    CREATE POLICY "coach_delete_swot_items_coach_rls_v3"
      ON public.swot_items FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.swot_analyses sa
          JOIN public.businesses b ON b.id::text = sa.business_id::text
          WHERE sa.id = swot_items.swot_analysis_id
            AND b.assigned_coach_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 5c. strategy_data (has user_id and business_id UUID nullable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'strategy_data') THEN
    ALTER TABLE public.strategy_data ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_strategy_data_coach_rls_v3" ON public.strategy_data;
    CREATE POLICY "coach_select_strategy_data_coach_rls_v3"
      ON public.strategy_data FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = strategy_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = strategy_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_strategy_data_coach_rls_v3" ON public.strategy_data;
    CREATE POLICY "coach_insert_strategy_data_coach_rls_v3"
      ON public.strategy_data FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = strategy_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = strategy_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_strategy_data_coach_rls_v3" ON public.strategy_data;
    CREATE POLICY "coach_update_strategy_data_coach_rls_v3"
      ON public.strategy_data FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = strategy_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = strategy_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = strategy_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = strategy_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 5d. marketing_data (has user_id and business_id UUID nullable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketing_data') THEN
    ALTER TABLE public.marketing_data ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_marketing_data_coach_rls_v3" ON public.marketing_data;
    CREATE POLICY "coach_select_marketing_data_coach_rls_v3"
      ON public.marketing_data FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = marketing_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = marketing_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_marketing_data_coach_rls_v3" ON public.marketing_data;
    CREATE POLICY "coach_insert_marketing_data_coach_rls_v3"
      ON public.marketing_data FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = marketing_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = marketing_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_marketing_data_coach_rls_v3" ON public.marketing_data;
    CREATE POLICY "coach_update_marketing_data_coach_rls_v3"
      ON public.marketing_data FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = marketing_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = marketing_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = marketing_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = marketing_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 5e. team_data (has user_id and business_id UUID nullable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_data') THEN
    ALTER TABLE public.team_data ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_team_data_coach_rls_v3" ON public.team_data;
    CREATE POLICY "coach_select_team_data_coach_rls_v3"
      ON public.team_data FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = team_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = team_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_team_data_coach_rls_v3" ON public.team_data;
    CREATE POLICY "coach_insert_team_data_coach_rls_v3"
      ON public.team_data FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = team_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = team_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_team_data_coach_rls_v3" ON public.team_data;
    CREATE POLICY "coach_update_team_data_coach_rls_v3"
      ON public.team_data FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = team_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = team_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = team_data.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = team_data.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 6: Stop Doing Tables (Pattern A — business_id UUID)
-- Actual table names: stop_doing_items, stop_doing_time_logs,
-- stop_doing_hourly_rates, stop_doing_activities
-- ============================================================================

-- 6a. stop_doing_items
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stop_doing_items') THEN
    ALTER TABLE public.stop_doing_items ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_stop_doing_items_coach_rls_v3" ON public.stop_doing_items;
    CREATE POLICY "coach_select_stop_doing_items_coach_rls_v3"
      ON public.stop_doing_items FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_stop_doing_items_coach_rls_v3" ON public.stop_doing_items;
    CREATE POLICY "coach_insert_stop_doing_items_coach_rls_v3"
      ON public.stop_doing_items FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_stop_doing_items_coach_rls_v3" ON public.stop_doing_items;
    CREATE POLICY "coach_update_stop_doing_items_coach_rls_v3"
      ON public.stop_doing_items FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_stop_doing_items_coach_rls_v3" ON public.stop_doing_items;
    CREATE POLICY "coach_delete_stop_doing_items_coach_rls_v3"
      ON public.stop_doing_items FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 6b. stop_doing_time_logs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stop_doing_time_logs') THEN
    ALTER TABLE public.stop_doing_time_logs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_stop_doing_time_logs_coach_rls_v3" ON public.stop_doing_time_logs;
    CREATE POLICY "coach_select_stop_doing_time_logs_coach_rls_v3"
      ON public.stop_doing_time_logs FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_time_logs.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_time_logs.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_stop_doing_time_logs_coach_rls_v3" ON public.stop_doing_time_logs;
    CREATE POLICY "coach_insert_stop_doing_time_logs_coach_rls_v3"
      ON public.stop_doing_time_logs FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_time_logs.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_time_logs.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_stop_doing_time_logs_coach_rls_v3" ON public.stop_doing_time_logs;
    CREATE POLICY "coach_update_stop_doing_time_logs_coach_rls_v3"
      ON public.stop_doing_time_logs FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_time_logs.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_time_logs.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_time_logs.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_time_logs.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_stop_doing_time_logs_coach_rls_v3" ON public.stop_doing_time_logs;
    CREATE POLICY "coach_delete_stop_doing_time_logs_coach_rls_v3"
      ON public.stop_doing_time_logs FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_time_logs.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_time_logs.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 6c. stop_doing_hourly_rates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stop_doing_hourly_rates') THEN
    ALTER TABLE public.stop_doing_hourly_rates ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_stop_doing_hourly_rates_coach_rls_v3" ON public.stop_doing_hourly_rates;
    CREATE POLICY "coach_select_stop_doing_hourly_rates_coach_rls_v3"
      ON public.stop_doing_hourly_rates FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_hourly_rates.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_hourly_rates.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_stop_doing_hourly_rates_coach_rls_v3" ON public.stop_doing_hourly_rates;
    CREATE POLICY "coach_insert_stop_doing_hourly_rates_coach_rls_v3"
      ON public.stop_doing_hourly_rates FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_hourly_rates.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_hourly_rates.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_stop_doing_hourly_rates_coach_rls_v3" ON public.stop_doing_hourly_rates;
    CREATE POLICY "coach_update_stop_doing_hourly_rates_coach_rls_v3"
      ON public.stop_doing_hourly_rates FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_hourly_rates.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_hourly_rates.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_hourly_rates.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_hourly_rates.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 6d. stop_doing_activities
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stop_doing_activities') THEN
    ALTER TABLE public.stop_doing_activities ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_stop_doing_activities_coach_rls_v3" ON public.stop_doing_activities;
    CREATE POLICY "coach_select_stop_doing_activities_coach_rls_v3"
      ON public.stop_doing_activities FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_stop_doing_activities_coach_rls_v3" ON public.stop_doing_activities;
    CREATE POLICY "coach_insert_stop_doing_activities_coach_rls_v3"
      ON public.stop_doing_activities FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_stop_doing_activities_coach_rls_v3" ON public.stop_doing_activities;
    CREATE POLICY "coach_update_stop_doing_activities_coach_rls_v3"
      ON public.stop_doing_activities FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_stop_doing_activities_coach_rls_v3" ON public.stop_doing_activities;
    CREATE POLICY "coach_delete_stop_doing_activities_coach_rls_v3"
      ON public.stop_doing_activities FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = stop_doing_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = stop_doing_activities.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 7: Ideas Tables (Pattern B — user_id)
-- ============================================================================

-- 7a. ideas (user_id only, no business_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ideas') THEN
    ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_ideas_coach_rls_v3" ON public.ideas;
    CREATE POLICY "coach_select_ideas_coach_rls_v3"
      ON public.ideas FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = ideas.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_ideas_coach_rls_v3" ON public.ideas;
    CREATE POLICY "coach_insert_ideas_coach_rls_v3"
      ON public.ideas FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = ideas.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_ideas_coach_rls_v3" ON public.ideas;
    CREATE POLICY "coach_update_ideas_coach_rls_v3"
      ON public.ideas FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = ideas.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = ideas.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_ideas_coach_rls_v3" ON public.ideas;
    CREATE POLICY "coach_delete_ideas_coach_rls_v3"
      ON public.ideas FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = ideas.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 7b. ideas_filter (user_id only, no business_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ideas_filter') THEN
    ALTER TABLE public.ideas_filter ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_ideas_filter_coach_rls_v3" ON public.ideas_filter;
    CREATE POLICY "coach_select_ideas_filter_coach_rls_v3"
      ON public.ideas_filter FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = ideas_filter.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_ideas_filter_coach_rls_v3" ON public.ideas_filter;
    CREATE POLICY "coach_insert_ideas_filter_coach_rls_v3"
      ON public.ideas_filter FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = ideas_filter.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_ideas_filter_coach_rls_v3" ON public.ideas_filter;
    CREATE POLICY "coach_update_ideas_filter_coach_rls_v3"
      ON public.ideas_filter FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = ideas_filter.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = ideas_filter.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 8: Actions/Issues/Open Loops (Pattern A — business_id UUID)
-- These tables have both business_id and user_id columns
-- ============================================================================

-- 8a. action_items (business_id is UUID nullable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'action_items') THEN
    ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_action_items_coach_rls_v3" ON public.action_items;
    CREATE POLICY "coach_select_action_items_coach_rls_v3"
      ON public.action_items FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = action_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = action_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_action_items_coach_rls_v3" ON public.action_items;
    CREATE POLICY "coach_insert_action_items_coach_rls_v3"
      ON public.action_items FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = action_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = action_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_action_items_coach_rls_v3" ON public.action_items;
    CREATE POLICY "coach_update_action_items_coach_rls_v3"
      ON public.action_items FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = action_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = action_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = action_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = action_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_action_items_coach_rls_v3" ON public.action_items;
    CREATE POLICY "coach_delete_action_items_coach_rls_v3"
      ON public.action_items FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = action_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = action_items.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 8b. open_loops (business_id is UUID nullable, also has user_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'open_loops') THEN
    ALTER TABLE public.open_loops ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_open_loops_coach_rls_v3" ON public.open_loops;
    CREATE POLICY "coach_select_open_loops_coach_rls_v3"
      ON public.open_loops FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = open_loops.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = open_loops.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = open_loops.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_open_loops_coach_rls_v3" ON public.open_loops;
    CREATE POLICY "coach_insert_open_loops_coach_rls_v3"
      ON public.open_loops FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = open_loops.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = open_loops.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = open_loops.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_open_loops_coach_rls_v3" ON public.open_loops;
    CREATE POLICY "coach_update_open_loops_coach_rls_v3"
      ON public.open_loops FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = open_loops.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = open_loops.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = open_loops.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = open_loops.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = open_loops.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = open_loops.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_open_loops_coach_rls_v3" ON public.open_loops;
    CREATE POLICY "coach_delete_open_loops_coach_rls_v3"
      ON public.open_loops FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = open_loops.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = open_loops.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = open_loops.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;

-- 8c. issues_list (business_id is UUID nullable, also has user_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'issues_list') THEN
    ALTER TABLE public.issues_list ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_issues_list_coach_rls_v3" ON public.issues_list;
    CREATE POLICY "coach_select_issues_list_coach_rls_v3"
      ON public.issues_list FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = issues_list.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = issues_list.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = issues_list.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_issues_list_coach_rls_v3" ON public.issues_list;
    CREATE POLICY "coach_insert_issues_list_coach_rls_v3"
      ON public.issues_list FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = issues_list.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = issues_list.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = issues_list.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_issues_list_coach_rls_v3" ON public.issues_list;
    CREATE POLICY "coach_update_issues_list_coach_rls_v3"
      ON public.issues_list FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = issues_list.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = issues_list.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = issues_list.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = issues_list.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = issues_list.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = issues_list.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_issues_list_coach_rls_v3" ON public.issues_list;
    CREATE POLICY "coach_delete_issues_list_coach_rls_v3"
      ON public.issues_list FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = issues_list.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.business_profiles bp JOIN public.businesses b ON b.id = bp.business_id WHERE bp.id::text = issues_list.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = issues_list.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 9: Process Diagrams (Pattern B — user_id)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'process_diagrams') THEN
    ALTER TABLE public.process_diagrams ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_process_diagrams_coach_rls_v3" ON public.process_diagrams;
    CREATE POLICY "coach_select_process_diagrams_coach_rls_v3"
      ON public.process_diagrams FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = process_diagrams.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_process_diagrams_coach_rls_v3" ON public.process_diagrams;
    CREATE POLICY "coach_insert_process_diagrams_coach_rls_v3"
      ON public.process_diagrams FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = process_diagrams.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_process_diagrams_coach_rls_v3" ON public.process_diagrams;
    CREATE POLICY "coach_update_process_diagrams_coach_rls_v3"
      ON public.process_diagrams FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = process_diagrams.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = process_diagrams.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_delete_process_diagrams_coach_rls_v3" ON public.process_diagrams;
    CREATE POLICY "coach_delete_process_diagrams_coach_rls_v3"
      ON public.process_diagrams FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = process_diagrams.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 10: Session Notes (has business_id UUID and coach_id UUID)
-- Coach accesses via business_id OR directly via coach_id = auth.uid()
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'session_notes') THEN
    ALTER TABLE public.session_notes ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_session_notes_coach_rls_v3" ON public.session_notes;
    CREATE POLICY "coach_select_session_notes_coach_rls_v3"
      ON public.session_notes FOR SELECT TO authenticated
      USING (
        session_notes.coach_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = session_notes.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_session_notes_coach_rls_v3" ON public.session_notes;
    CREATE POLICY "coach_insert_session_notes_coach_rls_v3"
      ON public.session_notes FOR INSERT TO authenticated
      WITH CHECK (
        session_notes.coach_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = session_notes.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_session_notes_coach_rls_v3" ON public.session_notes;
    CREATE POLICY "coach_update_session_notes_coach_rls_v3"
      ON public.session_notes FOR UPDATE TO authenticated
      USING (
        session_notes.coach_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = session_notes.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        session_notes.coach_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id::text = session_notes.business_id::text AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 11: Org Charts
-- Note: org_charts is NOT a standalone table. It is a JSONB column on team_data.
-- The team_data policies in Section 5e already cover this.
-- This section covers the org_charts table IF it exists as a separate entity.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'org_charts') THEN
    ALTER TABLE public.org_charts ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "coach_select_org_charts_coach_rls_v3" ON public.org_charts;
    CREATE POLICY "coach_select_org_charts_coach_rls_v3"
      ON public.org_charts FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = org_charts.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_insert_org_charts_coach_rls_v3" ON public.org_charts;
    CREATE POLICY "coach_insert_org_charts_coach_rls_v3"
      ON public.org_charts FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = org_charts.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );

    DROP POLICY IF EXISTS "coach_update_org_charts_coach_rls_v3" ON public.org_charts;
    CREATE POLICY "coach_update_org_charts_coach_rls_v3"
      ON public.org_charts FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = org_charts.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = org_charts.user_id AND b.assigned_coach_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
      );
  END IF;
END $$;


-- ============================================================================
-- DONE. Summary of policies created:
--
-- Section 1 (Critical ID Resolution):
--   businesses             — SELECT (1 policy)
--   business_profiles      — SELECT (1 policy)
--   business_users         — SELECT (1 policy)
--
-- Section 2 (Goals Wizard):
--   business_financial_goals — SELECT, INSERT, UPDATE, DELETE (4 policies)
--   business_kpis            — SELECT, INSERT, UPDATE, DELETE (4 policies)
--   strategic_initiatives    — SELECT, INSERT, UPDATE, DELETE (4 policies)
--   sprint_key_actions       — SELECT, INSERT, UPDATE, DELETE (4 policies)
--   operational_activities   — SELECT, INSERT, UPDATE, DELETE (4 policies)
--   activity_log             — SELECT, INSERT (2 policies)
--
-- Section 3 (Weekly/Dashboard):
--   weekly_reviews            — SELECT, INSERT, UPDATE (3 policies)
--   weekly_metrics_snapshots  — SELECT, INSERT, UPDATE (3 policies)
--
-- Section 4 (Quarterly Review):
--   quarterly_reviews    — SELECT, INSERT, UPDATE (3 policies)
--   quarterly_snapshots  — SELECT, INSERT, UPDATE (3 policies)
--   kpi_actuals          — SELECT, INSERT, UPDATE (3 policies)
--
-- Section 5 (Strategy/SWOT/Marketing/Team):
--   swot_analyses   — SELECT, INSERT, UPDATE (3 policies)
--   swot_items      — SELECT, INSERT, UPDATE, DELETE (4 policies)
--   strategy_data   — SELECT, INSERT, UPDATE (3 policies)
--   marketing_data  — SELECT, INSERT, UPDATE (3 policies)
--   team_data       — SELECT, INSERT, UPDATE (3 policies)
--
-- Section 6 (Stop Doing):
--   stop_doing_items        — SELECT, INSERT, UPDATE, DELETE (4 policies)
--   stop_doing_time_logs    — SELECT, INSERT, UPDATE, DELETE (4 policies)
--   stop_doing_hourly_rates — SELECT, INSERT, UPDATE (3 policies)
--   stop_doing_activities   — SELECT, INSERT, UPDATE, DELETE (4 policies)
--
-- Section 7 (Ideas):
--   ideas        — SELECT, INSERT, UPDATE, DELETE (4 policies)
--   ideas_filter — SELECT, INSERT, UPDATE (3 policies)
--
-- Section 8 (Actions/Issues/Open Loops):
--   action_items — SELECT, INSERT, UPDATE, DELETE (4 policies)
--   open_loops   — SELECT, INSERT, UPDATE, DELETE (4 policies)
--   issues_list  — SELECT, INSERT, UPDATE, DELETE (4 policies)
--
-- Section 9 (Process Diagrams):
--   process_diagrams — SELECT, INSERT, UPDATE, DELETE (4 policies)
--
-- Section 10 (Session Notes):
--   session_notes — SELECT, INSERT, UPDATE (3 policies)
--
-- Section 11 (Org Charts — if table exists):
--   org_charts — SELECT, INSERT, UPDATE (3 policies)
--
-- Total: ~92 policies across 27 tables
-- ============================================================================
