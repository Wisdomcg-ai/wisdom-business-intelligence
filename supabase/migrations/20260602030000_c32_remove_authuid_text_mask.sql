-- ============================================================================
-- C-32 / R2 (repo reconciliation) — remove the auth.uid()::TEXT self-mask from
-- auth_get_accessible_business_ids_text().
-- ============================================================================
-- Applied to prod 2026-06-02 (apply_migration `r2_c32_remove_authuid_text_mask`)
-- AFTER the R14 data cleanse re-keyed every user-id-polluted row (verified 0 rows
-- lose visibility). This file brings the REPO into line so the inLIFE Pulse fork
-- inherits the masked-removed helper instead of the baseline's old definition.
--
-- Idempotent (CREATE OR REPLACE). On prod this is a no-op (already applied); on a
-- fresh fork it redefines the baseline helper to the clean version.
-- ============================================================================
CREATE OR REPLACE FUNCTION "public"."auth_get_accessible_business_ids_text"()
  RETURNS "text"[]
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $function$ SELECT COALESCE( ARRAY(
  SELECT id::TEXT FROM public.businesses WHERE owner_id = auth.uid()
  UNION SELECT id::TEXT FROM public.businesses WHERE assigned_coach_id = auth.uid()
  UNION SELECT business_id::TEXT FROM public.business_users WHERE user_id = auth.uid() AND status = 'active'
  UNION SELECT id::TEXT FROM public.business_profiles WHERE user_id = auth.uid()
  UNION SELECT bp.id::TEXT FROM public.business_profiles bp
    INNER JOIN public.businesses b ON bp.business_id = b.id
    WHERE b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid()
       OR b.id IN ( SELECT business_id FROM public.business_users WHERE user_id = auth.uid() AND status = 'active' )
), '{}'::TEXT[] ); $function$;
