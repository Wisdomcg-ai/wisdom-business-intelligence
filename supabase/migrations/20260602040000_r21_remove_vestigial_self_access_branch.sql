-- ============================================================================
-- R21 (repo reconciliation) — remove the vestigial `OR check_business_id = auth.uid()`
-- self-access branch from auth_can_manage_business().
-- ============================================================================
-- Applied to prod 2026-06-02 (apply_migration `r21_remove_vestigial_self_access_branch`)
-- after a full cross-table sweep confirmed 0 live rows are keyed to a user-id
-- (only the data_cleanse_quarantine archive, which this function does not back).
-- This file brings the REPO into line so the fork inherits the cleaned function.
--
-- Keeps all 7 legitimate access paths (super_admin, owner, coach, active team
-- member, profile owner, profile→businesses bridge, profile→business_users bridge).
-- Idempotent (CREATE OR REPLACE); no-op on prod (already applied).
-- ============================================================================
CREATE OR REPLACE FUNCTION "public"."auth_can_manage_business"("check_business_id" "uuid")
  RETURNS boolean
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.businesses WHERE id = check_business_id AND assigned_coach_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.business_users
      WHERE business_id = check_business_id AND user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'member')
    )
    OR EXISTS (
      SELECT 1 FROM public.business_profiles WHERE id = check_business_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.business_profiles bp
      INNER JOIN public.businesses b ON bp.business_id = b.id
      WHERE bp.id = check_business_id AND (b.assigned_coach_id = auth.uid() OR b.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.business_profiles bp
      INNER JOIN public.business_users bu ON bu.business_id = bp.business_id
      WHERE bp.id = check_business_id AND bu.user_id = auth.uid() AND bu.status = 'active' AND bu.role IN ('admin', 'member')
    );
$function$;
