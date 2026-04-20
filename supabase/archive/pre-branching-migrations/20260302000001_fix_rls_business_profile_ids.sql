-- =====================================================
-- FIX: Include business_profiles.id in accessible business IDs
-- =====================================================
-- Many data tables (financial_goals, initiatives, KPIs, weekly_reviews, etc.)
-- store business_profiles.id as their business_id (legacy architecture).
-- The RLS 10/10 functions only returned businesses.id values, blocking access
-- to all legacy data. This migration fixes that.
-- =====================================================

BEGIN;

-- =====================================================
-- 1. UPDATE auth_get_accessible_business_ids (UUID version)
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
      -- Businesses user owns
      SELECT id FROM public.businesses
      WHERE owner_id = auth.uid()

      UNION

      -- Businesses user coaches
      SELECT id FROM public.businesses
      WHERE assigned_coach_id = auth.uid()

      UNION

      -- Businesses user is team member of
      SELECT business_id FROM public.business_users
      WHERE user_id = auth.uid()
      AND status = 'active'

      UNION

      -- Business profiles owned by the user
      -- (legacy: data tables store business_profiles.id as business_id)
      SELECT id FROM public.business_profiles
      WHERE user_id = auth.uid()

      UNION

      -- Business profiles for businesses the user can access (coach/team)
      SELECT bp.id FROM public.business_profiles bp
      INNER JOIN public.businesses b ON bp.business_id = b.id
      WHERE b.owner_id = auth.uid()
         OR b.assigned_coach_id = auth.uid()
         OR b.id IN (
           SELECT business_id FROM public.business_users
           WHERE user_id = auth.uid() AND status = 'active'
         )
    ),
    '{}'::UUID[]
  );
$$;

COMMENT ON FUNCTION auth_get_accessible_business_ids() IS
'Get array of business IDs the current user can access. Includes both businesses.id and business_profiles.id (legacy).';


-- =====================================================
-- 2. UPDATE auth_get_accessible_business_ids_text (TEXT version)
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

      -- Business profiles owned by the user (legacy data support)
      SELECT id::TEXT FROM public.business_profiles
      WHERE user_id = auth.uid()

      UNION

      -- Business profiles for accessible businesses
      SELECT bp.id::TEXT FROM public.business_profiles bp
      INNER JOIN public.businesses b ON bp.business_id = b.id
      WHERE b.owner_id = auth.uid()
         OR b.assigned_coach_id = auth.uid()
         OR b.id IN (
           SELECT business_id FROM public.business_users
           WHERE user_id = auth.uid() AND status = 'active'
         )

      UNION

      -- Also include user's own auth ID (SWOT stores data with user.id as business_id)
      SELECT auth.uid()::TEXT
    ),
    '{}'::TEXT[]
  );
$$;

COMMENT ON FUNCTION auth_get_accessible_business_ids_text() IS
'TEXT version of auth_get_accessible_business_ids. Also includes user auth ID for SWOT legacy data.';


-- =====================================================
-- 3. UPDATE auth_can_manage_business
-- =====================================================
-- The check_business_id might be a business_profiles.id (legacy),
-- so we also check if it maps to a manageable business via profiles.
CREATE OR REPLACE FUNCTION auth_can_manage_business(check_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    -- Super admin
    EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    -- Direct business match: Owner
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND owner_id = auth.uid())
    -- Direct business match: Coach
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND assigned_coach_id = auth.uid())
    -- Direct business match: Team admin or member
    OR EXISTS (
      SELECT 1 FROM public.business_users
      WHERE business_id = check_business_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('admin', 'member')
    )
    -- Legacy: check_business_id is a business_profiles.id owned by this user
    OR EXISTS (
      SELECT 1 FROM public.business_profiles
      WHERE id = check_business_id
      AND user_id = auth.uid()
    )
    -- Legacy: check_business_id is a business_profiles.id for a business the user coaches
    OR EXISTS (
      SELECT 1 FROM public.business_profiles bp
      INNER JOIN public.businesses b ON bp.business_id = b.id
      WHERE bp.id = check_business_id
      AND (b.assigned_coach_id = auth.uid() OR b.owner_id = auth.uid())
    )
    -- Legacy: check_business_id is the user's own auth ID (SWOT data pattern)
    OR check_business_id = auth.uid();
$$;

COMMENT ON FUNCTION auth_can_manage_business(UUID) IS
'Check if current user can manage (edit) the specified business. Handles both businesses.id and business_profiles.id (legacy).';


-- =====================================================
-- 4. UPDATE auth_can_access_business (if it exists)
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_can_access_business') THEN
    EXECUTE '
    CREATE OR REPLACE FUNCTION auth_can_access_business(check_business_id UUID)
    RETURNS BOOLEAN
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = ''''
    AS $func$
      SELECT check_business_id = ANY(auth_get_accessible_business_ids());
    $func$';
  END IF;
END $$;

COMMIT;
