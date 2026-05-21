-- auth_can_manage_team had the same asymmetric pattern as auth_can_manage_business:
-- it only matched on businesses.id form, with no business_profiles.id bridges.
--
-- Today the only RLS policies that call it (business_users INSERT/UPDATE/DELETE)
-- pass business_users.business_id, which is the businesses.id form, so this
-- helper has not caused a visible bug. However the pattern is brittle: any
-- future caller that passes a business_profiles.id form would silently fail
-- for team admins, owners, and coaches — exactly the same class of bug just
-- patched on auth_can_manage_business.
--
-- This recreates auth_can_manage_team with the same bridge structure as the
-- READ helper (auth_get_accessible_business_ids), preserving manage_team's
-- stricter role filter (role = 'admin' only — viewers/members excluded from
-- managing team membership, by original design).

CREATE OR REPLACE FUNCTION "public"."auth_can_manage_team"("check_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    -- Super admin
    EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    -- Owner (businesses.id form)
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND owner_id = auth.uid())
    -- Coach (businesses.id form)
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND assigned_coach_id = auth.uid())
    -- Team admin (businesses.id form)
    OR EXISTS (
      SELECT 1 FROM public.business_users
      WHERE business_id = check_business_id
        AND user_id = auth.uid()
        AND status = 'active'
        AND role = 'admin'
    )
    -- Profile-form bridges (mirror auth_get_accessible_business_ids):
    -- Profile owner via business_profiles.user_id
    OR EXISTS (
      SELECT 1 FROM public.business_profiles
      WHERE id = check_business_id AND user_id = auth.uid()
    )
    -- Owner / coach via business_profiles → businesses bridge
    OR EXISTS (
      SELECT 1 FROM public.business_profiles bp
      INNER JOIN public.businesses b ON bp.business_id = b.id
      WHERE bp.id = check_business_id
        AND (b.assigned_coach_id = auth.uid() OR b.owner_id = auth.uid())
    )
    -- Team admin via business_profiles → business_users bridge (role='admin' only)
    OR EXISTS (
      SELECT 1 FROM public.business_profiles bp
      INNER JOIN public.business_users bu ON bu.business_id = bp.business_id
      WHERE bp.id = check_business_id
        AND bu.user_id = auth.uid()
        AND bu.status = 'active'
        AND bu.role = 'admin'
    );
$$;

COMMENT ON FUNCTION "public"."auth_can_manage_team"("check_business_id" "uuid") IS
  'Check if current user can manage team members. Only admin role can. Accepts both businesses.id and business_profiles.id; mirrors auth_get_accessible_business_ids bridges so callers passing either ID form get the same answer.';
