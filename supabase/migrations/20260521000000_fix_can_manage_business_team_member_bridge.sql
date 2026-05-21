-- auth_can_manage_business was missing the business_profiles → business_users
-- bridge that its READ counterpart (auth_get_accessible_business_ids) has.
--
-- Effect: when a forecast (or any record) is stored against a business_profiles.id
-- instead of a businesses.id, owners and coaches could still WRITE (branches 5 & 6),
-- but team-admin members could not — even though they could READ. That asymmetry
-- caused page-load INSERTs (e.g. into forecast_pl_lines) to fail RLS for admin
-- team members on accounts whose financial_forecasts.business_id is the profile id.
--
-- This adds the missing branch so an active team member with role in
-- ('admin','member') passes auth_can_manage_business regardless of which ID form
-- the row uses, mirroring the read helper.

CREATE OR REPLACE FUNCTION "public"."auth_can_manage_business"("check_business_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND assigned_coach_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.business_users
      WHERE business_id = check_business_id
        AND user_id = auth.uid()
        AND status = 'active'
        AND role IN ('admin', 'member')
    )
    OR EXISTS (
      SELECT 1 FROM public.business_profiles
      WHERE id = check_business_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.business_profiles bp
      INNER JOIN public.businesses b ON bp.business_id = b.id
      WHERE bp.id = check_business_id
        AND (b.assigned_coach_id = auth.uid() OR b.owner_id = auth.uid())
    )
    -- NEW: business_profiles → business_users bridge for active team members.
    -- Mirrors the equivalent branch in auth_get_accessible_business_ids().
    OR EXISTS (
      SELECT 1 FROM public.business_profiles bp
      INNER JOIN public.business_users bu ON bu.business_id = bp.business_id
      WHERE bp.id = check_business_id
        AND bu.user_id = auth.uid()
        AND bu.status = 'active'
        AND bu.role IN ('admin', 'member')
    )
    OR check_business_id = auth.uid();
$$;

COMMENT ON FUNCTION "public"."auth_can_manage_business"("check_business_id" "uuid") IS
  'Check if current user can manage (edit) the specified business. Accepts both businesses.id and business_profiles.id; mirrors auth_get_accessible_business_ids team-member bridge so admin/member team members can WRITE when the row uses business_profiles.id (e.g. financial_forecasts).';
