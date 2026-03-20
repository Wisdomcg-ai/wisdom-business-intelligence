-- Fix SWOT coach RLS policies: broken JOIN condition
-- The v3 policies join businesses.id to swot_analyses.business_id,
-- but business_id stores the owner's USER ID (not businesses.id).
-- This causes DELETE (and other operations) to silently fail for coaches,
-- leading to item duplication when autoSave does delete+insert.

-- =====================================================
-- 1. Fix swot_items coach policies (all have broken JOIN)
-- =====================================================

DROP POLICY IF EXISTS "coach_select_swot_items_coach_rls_v3" ON public.swot_items;
CREATE POLICY "coach_select_swot_items_coach_rls_v3"
  ON public.swot_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.swot_analyses sa
      JOIN public.businesses b ON b.owner_id::text = sa.business_id::text
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
      JOIN public.businesses b ON b.owner_id::text = sa.business_id::text
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
      JOIN public.businesses b ON b.owner_id::text = sa.business_id::text
      WHERE sa.id = swot_items.swot_analysis_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.swot_analyses sa
      JOIN public.businesses b ON b.owner_id::text = sa.business_id::text
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
      JOIN public.businesses b ON b.owner_id::text = sa.business_id::text
      WHERE sa.id = swot_items.swot_analysis_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
  );

-- =====================================================
-- 2. Fix swot_analyses coach policies (same broken JOIN)
-- =====================================================

DROP POLICY IF EXISTS "coach_select_swot_analyses_coach_rls_v3" ON public.swot_analyses;
CREATE POLICY "coach_select_swot_analyses_coach_rls_v3"
  ON public.swot_analyses FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
  );

DROP POLICY IF EXISTS "coach_insert_swot_analyses_coach_rls_v3" ON public.swot_analyses;
CREATE POLICY "coach_insert_swot_analyses_coach_rls_v3"
  ON public.swot_analyses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
  );

DROP POLICY IF EXISTS "coach_update_swot_analyses_coach_rls_v3" ON public.swot_analyses;
CREATE POLICY "coach_update_swot_analyses_coach_rls_v3"
  ON public.swot_analyses FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id::text = swot_analyses.business_id::text AND b.assigned_coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.system_roles sr WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin')
  );
