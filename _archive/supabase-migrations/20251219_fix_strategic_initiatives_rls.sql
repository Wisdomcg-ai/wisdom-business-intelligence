-- =====================================================
-- COMPREHENSIVE RLS POLICY FIX FOR COACH/SUPER_ADMIN ACCESS
-- =====================================================
-- This migration fixes RLS policies across multiple tables where:
-- 1. business_id references business_profiles.id but policies check businesses.id
-- 2. Coaches are missing INSERT/UPDATE/DELETE access
-- 3. Coach access policies reference non-existent tables
--
-- Pattern used: Check both business_profiles.id AND businesses.id patterns
-- to handle legacy data and ensure future consistency.

-- =====================================================
-- HELPER: Check if super_admin or coach
-- =====================================================

-- =====================================================
-- 1. STRATEGIC_INITIATIVES
-- =====================================================
-- business_id -> business_profiles.id (confirmed)

DROP POLICY IF EXISTS "Coaches can view strategic initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can insert strategic initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can update strategic initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can delete strategic initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can view client initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can view client strategic initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Super admins can view all strategic initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Users can view own initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Users can insert own initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Users can update own initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Users can delete own initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "strategic_initiatives_select_policy" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "strategic_initiatives_insert_policy" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "strategic_initiatives_update_policy" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "strategic_initiatives_delete_policy" ON public.strategic_initiatives;

CREATE POLICY "strategic_initiatives_select_policy" ON public.strategic_initiatives
  FOR SELECT USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR business_id IN (
      SELECT bp.id FROM public.business_profiles bp
      JOIN public.businesses b ON b.owner_id = bp.user_id
      WHERE b.assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "strategic_initiatives_insert_policy" ON public.strategic_initiatives
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR business_id IN (
      SELECT bp.id FROM public.business_profiles bp
      JOIN public.businesses b ON b.owner_id = bp.user_id
      WHERE b.assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "strategic_initiatives_update_policy" ON public.strategic_initiatives
  FOR UPDATE USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR business_id IN (
      SELECT bp.id FROM public.business_profiles bp
      JOIN public.businesses b ON b.owner_id = bp.user_id
      WHERE b.assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "strategic_initiatives_delete_policy" ON public.strategic_initiatives
  FOR DELETE USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR business_id IN (
      SELECT bp.id FROM public.business_profiles bp
      JOIN public.businesses b ON b.owner_id = bp.user_id
      WHERE b.assigned_coach_id = auth.uid()
    )
  );

-- =====================================================
-- 2. GOALS TABLE
-- =====================================================
-- App sends business_profiles.id but table expects businesses.id
-- Need to check BOTH patterns

DROP POLICY IF EXISTS "Coach can view goals" ON public.goals;
DROP POLICY IF EXISTS "Coaches can view goals" ON public.goals;
DROP POLICY IF EXISTS "Super admins can view all goals" ON public.goals;
DROP POLICY IF EXISTS "Users can manage own goals" ON public.goals;
DROP POLICY IF EXISTS "goals_select_policy" ON public.goals;
DROP POLICY IF EXISTS "goals_insert_policy" ON public.goals;
DROP POLICY IF EXISTS "goals_update_policy" ON public.goals;
DROP POLICY IF EXISTS "goals_delete_policy" ON public.goals;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goals') THEN
    -- SELECT
    EXECUTE '
      CREATE POLICY "goals_select_policy" ON public.goals
        FOR SELECT USING (
          user_id = auth.uid()
          OR business_id::text = auth.uid()::text
          OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
          OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR business_id IN (
            SELECT bp.id FROM public.business_profiles bp
            JOIN public.businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
          )
          OR business_id IN (
            SELECT b.id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- INSERT
    EXECUTE '
      CREATE POLICY "goals_insert_policy" ON public.goals
        FOR INSERT WITH CHECK (
          user_id = auth.uid()
          OR business_id::text = auth.uid()::text
          OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
          OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR business_id IN (
            SELECT bp.id FROM public.business_profiles bp
            JOIN public.businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
          )
          OR business_id IN (
            SELECT b.id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- UPDATE
    EXECUTE '
      CREATE POLICY "goals_update_policy" ON public.goals
        FOR UPDATE USING (
          user_id = auth.uid()
          OR business_id::text = auth.uid()::text
          OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
          OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR business_id IN (
            SELECT bp.id FROM public.business_profiles bp
            JOIN public.businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
          )
          OR business_id IN (
            SELECT b.id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- DELETE
    EXECUTE '
      CREATE POLICY "goals_delete_policy" ON public.goals
        FOR DELETE USING (
          user_id = auth.uid()
          OR business_id::text = auth.uid()::text
          OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
          OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR business_id IN (
            SELECT bp.id FROM public.business_profiles bp
            JOIN public.businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
          )
          OR business_id IN (
            SELECT b.id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    RAISE NOTICE '✓ Fixed goals table RLS policies';
  END IF;
END $$;

-- =====================================================
-- 3. WEEKLY_REVIEWS - Add coach INSERT/UPDATE/DELETE
-- =====================================================

DROP POLICY IF EXISTS "Coaches can insert weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Coaches can update weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Coaches can delete weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "weekly_reviews_coach_insert" ON public.weekly_reviews;
DROP POLICY IF EXISTS "weekly_reviews_coach_update" ON public.weekly_reviews;
DROP POLICY IF EXISTS "weekly_reviews_coach_delete" ON public.weekly_reviews;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_reviews') THEN
    -- INSERT for coaches
    EXECUTE '
      CREATE POLICY "weekly_reviews_coach_insert" ON public.weekly_reviews
        FOR INSERT WITH CHECK (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR business_id IN (
            SELECT bp.id FROM public.business_profiles bp
            JOIN public.businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
          )
          OR business_id IN (
            SELECT b.id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- UPDATE for coaches
    EXECUTE '
      CREATE POLICY "weekly_reviews_coach_update" ON public.weekly_reviews
        FOR UPDATE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR business_id IN (
            SELECT bp.id FROM public.business_profiles bp
            JOIN public.businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
          )
          OR business_id IN (
            SELECT b.id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- DELETE for coaches
    EXECUTE '
      CREATE POLICY "weekly_reviews_coach_delete" ON public.weekly_reviews
        FOR DELETE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR business_id IN (
            SELECT bp.id FROM public.business_profiles bp
            JOIN public.businesses b ON b.owner_id = bp.user_id
            WHERE b.assigned_coach_id = auth.uid()
          )
          OR business_id IN (
            SELECT b.id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    RAISE NOTICE '✓ Fixed weekly_reviews coach INSERT/UPDATE/DELETE policies';
  END IF;
END $$;

-- =====================================================
-- 4. IDEAS - Fix coach access (was referencing non-existent profiles table)
-- =====================================================

DROP POLICY IF EXISTS "Coaches can view ideas" ON public.ideas;
DROP POLICY IF EXISTS "Coaches can insert ideas" ON public.ideas;
DROP POLICY IF EXISTS "Coaches can update ideas" ON public.ideas;
DROP POLICY IF EXISTS "Coaches can delete ideas" ON public.ideas;
DROP POLICY IF EXISTS "ideas_coach_select" ON public.ideas;
DROP POLICY IF EXISTS "ideas_coach_insert" ON public.ideas;
DROP POLICY IF EXISTS "ideas_coach_update" ON public.ideas;
DROP POLICY IF EXISTS "ideas_coach_delete" ON public.ideas;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ideas') THEN
    -- SELECT for coaches/super_admins
    EXECUTE '
      CREATE POLICY "ideas_coach_select" ON public.ideas
        FOR SELECT USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- INSERT for coaches/super_admins
    EXECUTE '
      CREATE POLICY "ideas_coach_insert" ON public.ideas
        FOR INSERT WITH CHECK (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- UPDATE for coaches/super_admins
    EXECUTE '
      CREATE POLICY "ideas_coach_update" ON public.ideas
        FOR UPDATE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- DELETE for coaches/super_admins
    EXECUTE '
      CREATE POLICY "ideas_coach_delete" ON public.ideas
        FOR DELETE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    RAISE NOTICE '✓ Fixed ideas table coach access policies';
  END IF;
END $$;

-- =====================================================
-- 5. IDEAS_FILTER - Fix coach access
-- =====================================================

DROP POLICY IF EXISTS "Coaches can view ideas_filter" ON public.ideas_filter;
DROP POLICY IF EXISTS "Coaches can manage ideas_filter" ON public.ideas_filter;
DROP POLICY IF EXISTS "ideas_filter_coach_select" ON public.ideas_filter;
DROP POLICY IF EXISTS "ideas_filter_coach_all" ON public.ideas_filter;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ideas_filter') THEN
    -- All operations for coaches/super_admins
    EXECUTE '
      CREATE POLICY "ideas_filter_coach_all" ON public.ideas_filter
        FOR ALL USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    RAISE NOTICE '✓ Fixed ideas_filter table coach access policies';
  END IF;
END $$;

-- =====================================================
-- 6. BUSINESS_KPIS - Add coach INSERT/UPDATE/DELETE
-- =====================================================

DROP POLICY IF EXISTS "Coaches can insert business_kpis" ON public.business_kpis;
DROP POLICY IF EXISTS "Coaches can update business_kpis" ON public.business_kpis;
DROP POLICY IF EXISTS "Coaches can delete business_kpis" ON public.business_kpis;
DROP POLICY IF EXISTS "business_kpis_coach_insert" ON public.business_kpis;
DROP POLICY IF EXISTS "business_kpis_coach_update" ON public.business_kpis;
DROP POLICY IF EXISTS "business_kpis_coach_delete" ON public.business_kpis;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'business_kpis') THEN
    -- INSERT for coaches
    EXECUTE '
      CREATE POLICY "business_kpis_coach_insert" ON public.business_kpis
        FOR INSERT WITH CHECK (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
          OR business_id::uuid IN (
            SELECT b.id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- UPDATE for coaches
    EXECUTE '
      CREATE POLICY "business_kpis_coach_update" ON public.business_kpis
        FOR UPDATE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
          OR business_id::uuid IN (
            SELECT b.id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- DELETE for coaches
    EXECUTE '
      CREATE POLICY "business_kpis_coach_delete" ON public.business_kpis
        FOR DELETE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
          OR business_id::uuid IN (
            SELECT b.id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    RAISE NOTICE '✓ Fixed business_kpis coach INSERT/UPDATE/DELETE policies';
  END IF;
END $$;

-- =====================================================
-- 7. ASSESSMENTS - Add coach INSERT/UPDATE/DELETE
-- =====================================================

DROP POLICY IF EXISTS "Coaches can insert assessments" ON public.assessments;
DROP POLICY IF EXISTS "Coaches can update assessments" ON public.assessments;
DROP POLICY IF EXISTS "Coaches can delete assessments" ON public.assessments;
DROP POLICY IF EXISTS "assessments_coach_insert" ON public.assessments;
DROP POLICY IF EXISTS "assessments_coach_update" ON public.assessments;
DROP POLICY IF EXISTS "assessments_coach_delete" ON public.assessments;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assessments') THEN
    -- INSERT for coaches
    EXECUTE '
      CREATE POLICY "assessments_coach_insert" ON public.assessments
        FOR INSERT WITH CHECK (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- UPDATE for coaches
    EXECUTE '
      CREATE POLICY "assessments_coach_update" ON public.assessments
        FOR UPDATE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- DELETE for coaches
    EXECUTE '
      CREATE POLICY "assessments_coach_delete" ON public.assessments
        FOR DELETE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    RAISE NOTICE '✓ Fixed assessments coach INSERT/UPDATE/DELETE policies';
  END IF;
END $$;

-- =====================================================
-- 8. SWOT_ANALYSES - Add coach INSERT/UPDATE/DELETE
-- =====================================================

DROP POLICY IF EXISTS "Coaches can insert swot_analyses" ON public.swot_analyses;
DROP POLICY IF EXISTS "Coaches can update swot_analyses" ON public.swot_analyses;
DROP POLICY IF EXISTS "Coaches can delete swot_analyses" ON public.swot_analyses;
DROP POLICY IF EXISTS "swot_analyses_coach_insert" ON public.swot_analyses;
DROP POLICY IF EXISTS "swot_analyses_coach_update" ON public.swot_analyses;
DROP POLICY IF EXISTS "swot_analyses_coach_delete" ON public.swot_analyses;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'swot_analyses') THEN
    -- INSERT for coaches
    EXECUTE '
      CREATE POLICY "swot_analyses_coach_insert" ON public.swot_analyses
        FOR INSERT WITH CHECK (
          user_id = auth.uid()
          OR business_id::text = auth.uid()::text
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- UPDATE for coaches
    EXECUTE '
      CREATE POLICY "swot_analyses_coach_update" ON public.swot_analyses
        FOR UPDATE USING (
          user_id = auth.uid()
          OR business_id::text = auth.uid()::text
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- DELETE for coaches
    EXECUTE '
      CREATE POLICY "swot_analyses_coach_delete" ON public.swot_analyses
        FOR DELETE USING (
          user_id = auth.uid()
          OR business_id::text = auth.uid()::text
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    RAISE NOTICE '✓ Fixed swot_analyses coach INSERT/UPDATE/DELETE policies';
  END IF;
END $$;

-- =====================================================
-- 9. OPEN_LOOPS - Add coach INSERT/UPDATE/DELETE
-- =====================================================

DROP POLICY IF EXISTS "Coaches can insert open_loops" ON public.open_loops;
DROP POLICY IF EXISTS "Coaches can update open_loops" ON public.open_loops;
DROP POLICY IF EXISTS "Coaches can delete open_loops" ON public.open_loops;
DROP POLICY IF EXISTS "open_loops_coach_insert" ON public.open_loops;
DROP POLICY IF EXISTS "open_loops_coach_update" ON public.open_loops;
DROP POLICY IF EXISTS "open_loops_coach_delete" ON public.open_loops;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'open_loops') THEN
    -- INSERT for coaches
    EXECUTE '
      CREATE POLICY "open_loops_coach_insert" ON public.open_loops
        FOR INSERT WITH CHECK (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- UPDATE for coaches
    EXECUTE '
      CREATE POLICY "open_loops_coach_update" ON public.open_loops
        FOR UPDATE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- DELETE for coaches
    EXECUTE '
      CREATE POLICY "open_loops_coach_delete" ON public.open_loops
        FOR DELETE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    RAISE NOTICE '✓ Fixed open_loops coach INSERT/UPDATE/DELETE policies';
  END IF;
END $$;

-- =====================================================
-- 10. ISSUES_LIST - Add coach INSERT/UPDATE/DELETE
-- =====================================================

DROP POLICY IF EXISTS "Coaches can insert issues_list" ON public.issues_list;
DROP POLICY IF EXISTS "Coaches can update issues_list" ON public.issues_list;
DROP POLICY IF EXISTS "Coaches can delete issues_list" ON public.issues_list;
DROP POLICY IF EXISTS "issues_list_coach_insert" ON public.issues_list;
DROP POLICY IF EXISTS "issues_list_coach_update" ON public.issues_list;
DROP POLICY IF EXISTS "issues_list_coach_delete" ON public.issues_list;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'issues_list') THEN
    -- INSERT for coaches
    EXECUTE '
      CREATE POLICY "issues_list_coach_insert" ON public.issues_list
        FOR INSERT WITH CHECK (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- UPDATE for coaches
    EXECUTE '
      CREATE POLICY "issues_list_coach_update" ON public.issues_list
        FOR UPDATE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    -- DELETE for coaches
    EXECUTE '
      CREATE POLICY "issues_list_coach_delete" ON public.issues_list
        FOR DELETE USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = ''super_admin'')
          OR user_id IN (
            SELECT b.owner_id FROM public.businesses b
            WHERE b.assigned_coach_id = auth.uid()
          )
        )
    ';

    RAISE NOTICE '✓ Fixed issues_list coach INSERT/UPDATE/DELETE policies';
  END IF;
END $$;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'COMPREHENSIVE RLS POLICY FIX COMPLETE';
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'Fixed tables:';
  RAISE NOTICE '  1. strategic_initiatives - business_profiles.id pattern';
  RAISE NOTICE '  2. goals - dual pattern (business_profiles + businesses)';
  RAISE NOTICE '  3. weekly_reviews - added coach INSERT/UPDATE/DELETE';
  RAISE NOTICE '  4. ideas - fixed coach access (was broken)';
  RAISE NOTICE '  5. ideas_filter - fixed coach access';
  RAISE NOTICE '  6. business_kpis - added coach INSERT/UPDATE/DELETE';
  RAISE NOTICE '  7. assessments - added coach INSERT/UPDATE/DELETE';
  RAISE NOTICE '  8. swot_analyses - added coach INSERT/UPDATE/DELETE';
  RAISE NOTICE '  9. open_loops - added coach INSERT/UPDATE/DELETE';
  RAISE NOTICE ' 10. issues_list - added coach INSERT/UPDATE/DELETE';
  RAISE NOTICE '';
  RAISE NOTICE 'All policies now support:';
  RAISE NOTICE '  - Direct user ownership (user_id = auth.uid())';
  RAISE NOTICE '  - Business profile ownership (where applicable)';
  RAISE NOTICE '  - Super admin access (system_roles.role = super_admin)';
  RAISE NOTICE '  - Coach access (businesses.assigned_coach_id)';
  RAISE NOTICE '====================================================';
END $$;
