-- =====================================================
-- RLS HOTFIX: Multi-ID Type Support
-- Created: 2026-01-27
-- =====================================================
-- The schema uses THREE different ID types as "business_id":
--   1. businesses.id (UUID)
--   2. business_profiles.id (UUID)
--   3. user_id / owner_id (UUID)
-- This migration updates auth functions to return all three types.
-- Also fixes policies on tables using user_id instead of business_id.
-- =====================================================

BEGIN;

-- =====================================================
-- 1. UPDATE auth_get_accessible_business_ids()
-- Now returns businesses.id + business_profiles.id + owner user_ids
-- =====================================================
CREATE OR REPLACE FUNCTION auth_get_accessible_business_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT id FROM public.businesses
      WHERE owner_id = auth.uid()

      UNION

      SELECT id FROM public.businesses
      WHERE assigned_coach_id = auth.uid()

      UNION

      SELECT business_id FROM public.business_users
      WHERE user_id = auth.uid()
      AND status = 'active'

      UNION

      SELECT bp.id FROM public.business_profiles bp
      INNER JOIN public.businesses b ON bp.business_id = b.id
      WHERE b.owner_id = auth.uid()

      UNION

      SELECT bp.id FROM public.business_profiles bp
      INNER JOIN public.businesses b ON bp.business_id = b.id
      WHERE b.assigned_coach_id = auth.uid()

      UNION

      SELECT bp.id FROM public.business_profiles bp
      INNER JOIN public.business_users bu ON bp.business_id = bu.business_id
      WHERE bu.user_id = auth.uid()
      AND bu.status = 'active'

      UNION

      SELECT owner_id FROM public.businesses
      WHERE owner_id = auth.uid()

      UNION

      SELECT b.owner_id FROM public.businesses b
      WHERE b.assigned_coach_id = auth.uid()

      UNION

      SELECT b.owner_id FROM public.businesses b
      INNER JOIN public.business_users bu ON b.id = bu.business_id
      WHERE bu.user_id = auth.uid()
      AND bu.status = 'active'
    ),
    '{}'::UUID[]
  );
$$;


-- =====================================================
-- 2. UPDATE auth_get_accessible_business_ids_text()
-- TEXT version for tables with TEXT business_id columns
-- =====================================================
CREATE OR REPLACE FUNCTION auth_get_accessible_business_ids_text()
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT id::TEXT FROM public.businesses
      WHERE owner_id = auth.uid()

      UNION

      SELECT id::TEXT FROM public.businesses
      WHERE assigned_coach_id = auth.uid()

      UNION

      SELECT business_id::TEXT FROM public.business_users
      WHERE user_id = auth.uid()
      AND status = 'active'

      UNION

      SELECT bp.id::TEXT FROM public.business_profiles bp
      INNER JOIN public.businesses b ON bp.business_id = b.id
      WHERE b.owner_id = auth.uid()

      UNION

      SELECT bp.id::TEXT FROM public.business_profiles bp
      INNER JOIN public.businesses b ON bp.business_id = b.id
      WHERE b.assigned_coach_id = auth.uid()

      UNION

      SELECT bp.id::TEXT FROM public.business_profiles bp
      INNER JOIN public.business_users bu ON bp.business_id = bu.business_id
      WHERE bu.user_id = auth.uid()
      AND bu.status = 'active'

      UNION

      SELECT owner_id::TEXT FROM public.businesses
      WHERE owner_id = auth.uid()

      UNION

      SELECT b.owner_id::TEXT FROM public.businesses b
      WHERE b.assigned_coach_id = auth.uid()

      UNION

      SELECT b.owner_id::TEXT FROM public.businesses b
      INNER JOIN public.business_users bu ON b.id = bu.business_id
      WHERE bu.user_id = auth.uid()
      AND bu.status = 'active'
    ),
    '{}'::TEXT[]
  );
$$;


-- =====================================================
-- 3. FIX strategy_data policy (uses user_id, not business_id)
-- =====================================================
DROP POLICY IF EXISTS "rls_access" ON strategy_data;

CREATE POLICY "rls_access" ON strategy_data
FOR ALL
TO authenticated
USING (
  auth_is_super_admin()
  OR user_id = auth.uid()
  OR user_id IN (
    SELECT owner_id FROM businesses WHERE assigned_coach_id = auth.uid()
  )
  OR user_id IN (
    SELECT owner_id FROM businesses WHERE id IN (
      SELECT business_id FROM business_users WHERE user_id = auth.uid() AND status = 'active'
    )
  )
)
WITH CHECK (
  auth_is_super_admin()
  OR user_id = auth.uid()
);


-- =====================================================
-- 4. FIX swot_items policy (simplify to use auth functions)
-- =====================================================
DROP POLICY IF EXISTS "swot_items_delete_consolidated" ON swot_items;
DROP POLICY IF EXISTS "swot_items_insert_final" ON swot_items;
DROP POLICY IF EXISTS "swot_items_select_consolidated" ON swot_items;
DROP POLICY IF EXISTS "swot_items_update_consolidated" ON swot_items;
DROP POLICY IF EXISTS "swot_items_access" ON swot_items;

CREATE POLICY "swot_items_access" ON swot_items
FOR ALL
TO authenticated
USING (
  auth_is_super_admin()
  OR swot_analysis_id IN (
    SELECT id FROM swot_analyses
    WHERE business_id = ANY(auth_get_accessible_business_ids())
  )
)
WITH CHECK (
  auth_is_super_admin()
  OR swot_analysis_id IN (
    SELECT id FROM swot_analyses
    WHERE business_id = ANY(auth_get_accessible_business_ids())
  )
);


-- =====================================================
-- 5. FIX system_roles recursive policy
-- =====================================================
DROP POLICY IF EXISTS "system_roles_manage_admin" ON system_roles;

CREATE POLICY "system_roles_manage_admin" ON system_roles
FOR ALL
TO authenticated
USING (auth_is_super_admin())
WITH CHECK (auth_is_super_admin());


-- =====================================================
-- 6. ADD missing policies for zero-policy tables
-- =====================================================

-- shared_documents
CREATE POLICY "rls_access" ON shared_documents
FOR ALL TO authenticated
USING (
  auth_is_super_admin()
  OR business_id = ANY(auth_get_accessible_business_ids())
)
WITH CHECK (
  auth_is_super_admin()
  OR auth_can_manage_business(business_id)
);

-- user_permissions
CREATE POLICY "rls_access" ON user_permissions
FOR ALL TO authenticated
USING (
  auth_is_super_admin()
  OR user_id = auth.uid()
  OR business_id = ANY(auth_get_accessible_business_ids())
)
WITH CHECK (
  auth_is_super_admin()
  OR auth_can_manage_business(business_id)
);

-- forecast_scenario_lines
CREATE POLICY "rls_access" ON forecast_scenario_lines
FOR ALL TO authenticated
USING (
  auth_is_super_admin()
  OR scenario_id IN (
    SELECT fs.id FROM forecast_scenarios fs
    JOIN financial_forecasts ff ON fs.base_forecast_id = ff.id
    WHERE ff.business_id = ANY(auth_get_accessible_business_ids())
  )
);

-- process_decisions
CREATE POLICY "rls_access" ON process_decisions
FOR ALL TO authenticated
USING (
  auth_is_super_admin()
  OR process_id IN (
    SELECT id FROM process_diagrams
    WHERE user_id = ANY(auth_get_accessible_business_ids())
  )
);

-- coach_suggestions
CREATE POLICY "rls_access" ON coach_suggestions
FOR ALL TO authenticated
USING (
  auth_is_super_admin()
  OR process_id IN (
    SELECT id FROM process_diagrams
    WHERE user_id = ANY(auth_get_accessible_business_ids())
  )
);

-- conversation_history
CREATE POLICY "rls_access" ON conversation_history
FOR ALL TO authenticated
USING (
  auth_is_super_admin()
  OR process_id IN (
    SELECT id FROM process_diagrams
    WHERE user_id = ANY(auth_get_accessible_business_ids())
  )
);


-- =====================================================
-- 7. Error tracking table
-- =====================================================
CREATE TABLE IF NOT EXISTS client_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  business_id UUID,
  error_type TEXT NOT NULL,
  error_message TEXT,
  component TEXT,
  page_url TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_type ON client_error_logs(error_type);

ALTER TABLE client_error_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if rerunning
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE tablename = 'client_error_logs' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON client_error_logs', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "insert_errors" ON client_error_logs
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "admin_view_errors" ON client_error_logs
FOR SELECT TO authenticated
USING (auth_is_super_admin());


COMMIT;
