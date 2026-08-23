-- SECURITY Group B — internal authorization guards on the three forecast-write
-- SECURITY DEFINER RPCs (DB security audit, finding RLS-06 + defense-in-depth
-- for the two HIGH findings whose anon grant was removed in #395).
--
-- WHY. A SECURITY DEFINER function runs as its owner and BYPASSES RLS. #395
-- removed the `anon` EXECUTE grant, closing the UNAUTHENTICATED vector. But
-- these three keep `authenticated` (the app calls them as the logged-in user
-- via createRouteHandlerClient), so today ANY logged-in user can drive them
-- against ANOTHER tenant's forecast by supplying that tenant's id — the RLS the
-- functions bypass would otherwise have stopped it. This adds the missing
-- in-function authorization so a caller can only touch a business they manage.
--
-- THE GUARD, and why it is shaped this way:
--   IF auth.role() IS DISTINCT FROM 'service_role'
--      AND NOT public.auth_can_manage_business(<business>) THEN RAISE 42501.
--   * public.auth_can_manage_business already handles BOTH id-spaces (it checks
--     businesses.id AND business_profiles.id) and includes super_admin, owner,
--     assigned coach, and admin/member business_users — so the real Generate
--     callers (coach Matt via assigned_coach_id, client owners, profile owners)
--     all pass, while a cross-tenant caller (no relationship to the business)
--     fails. financial_forecasts.business_id is business_profiles-space; the
--     generate route passes profileId — both are covered.
--   * The service_role BYPASS is essential: auth_can_manage_business calls
--     auth.uid(), which is NULL under service_role, so without the bypass a
--     legitimate server-side (cron/script) call via the service key would be
--     blocked. service_role is the trusted server context that performs its own
--     app-layer authorization. auth.role() reads the JWT role claim GUC, which
--     persists across the SECURITY DEFINER boundary (same mechanism auth.uid()
--     already relies on inside auth_can_manage_business and RLS). A caller with
--     no JWT at all (auth.role() = NULL) FAILS CLOSED — it is not service_role
--     and has no uid, so it is denied.
--   * anon cannot reach these (grant revoked in #395); the guard is the second
--     layer for the authenticated case.
--
-- Bodies are otherwise byte-identical to the live definitions (save_assumptions
-- retains the assumptions_published_at stamp from 20260823220734/publish_vs_draft).
-- Grants are re-issued explicitly (house rule) to the exact #395 posture:
-- authenticated + service_role, never anon.

-- ── 1. save_assumptions_and_materialize — guard on the forecast's business ──
create or replace function public.save_assumptions_and_materialize(
  p_forecast_id uuid, p_assumptions jsonb, p_pl_lines jsonb, p_force_full_replace boolean default false
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
DECLARE
  v_now timestamp with time zone := now();
  v_lines_count int := 0;
  v_business_id uuid;
BEGIN
  SELECT "business_id" INTO v_business_id
  FROM "public"."financial_forecasts" WHERE "id" = p_forecast_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'save_assumptions_and_materialize: forecast % not found', p_forecast_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Group B guard: an authenticated caller must manage this forecast's business.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.auth_can_manage_business(v_business_id) THEN
    RAISE EXCEPTION 'save_assumptions_and_materialize: not authorized for forecast %', p_forecast_id
      USING ERRCODE = '42501';
  END IF;

  -- assumptions_published_at is stamped here and ONLY here: reaching this
  -- function is what makes an assumptions object the published one.
  UPDATE "public"."financial_forecasts"
  SET "assumptions" = p_assumptions,
      "assumptions_published_at" = v_now,
      "updated_at" = v_now
  WHERE "id" = p_forecast_id;

  IF p_force_full_replace THEN
    DELETE FROM "public"."forecast_pl_lines"
    WHERE "forecast_id" = p_forecast_id AND "is_manual" = false;
  END IF;

  INSERT INTO "public"."forecast_pl_lines" (
    "forecast_id","account_name","account_code","account_type","account_class",
    "category","subcategory","sort_order","actual_months","forecast_months",
    "is_from_xero","is_manual","is_from_payroll","computed_at","created_at","updated_at"
  )
  SELECT
    p_forecast_id,
    line->>'account_name', line->>'account_code', line->>'account_type',
    line->>'account_class', line->>'category', line->>'subcategory',
    COALESCE((line->>'sort_order')::int, 0),
    COALESCE((line->'actual_months')::jsonb, '{}'::jsonb),
    COALESCE((line->'forecast_months')::jsonb, '{}'::jsonb),
    COALESCE((line->>'is_from_xero')::boolean, false),
    false,
    COALESCE((line->>'is_from_payroll')::boolean, false),
    v_now, v_now, v_now
  FROM jsonb_array_elements(p_pl_lines) AS line
  ON CONFLICT ("forecast_id", "account_code") WHERE "is_manual" = false
  DO UPDATE SET
    "account_name"=EXCLUDED."account_name", "account_type"=EXCLUDED."account_type",
    "account_class"=EXCLUDED."account_class", "category"=EXCLUDED."category",
    "subcategory"=EXCLUDED."subcategory", "sort_order"=EXCLUDED."sort_order",
    "actual_months"=EXCLUDED."actual_months", "forecast_months"=EXCLUDED."forecast_months",
    "is_from_xero"=EXCLUDED."is_from_xero", "is_from_payroll"=EXCLUDED."is_from_payroll",
    "computed_at"=v_now, "updated_at"=v_now;

  GET DIAGNOSTICS v_lines_count = ROW_COUNT;

  UPDATE "public"."forecast_pl_lines"
  SET "computed_at" = v_now, "updated_at" = v_now
  WHERE "forecast_id" = p_forecast_id AND "is_manual" = false AND "computed_at" < v_now;

  RETURN jsonb_build_object('forecast_id', p_forecast_id, 'computed_at', v_now, 'lines_count', v_lines_count);
END;
$function$;

revoke all on function public.save_assumptions_and_materialize(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.save_assumptions_and_materialize(uuid, jsonb, jsonb, boolean) to authenticated, service_role;

-- ── 2. create_active_forecast_locked — guard on p_business_id ──
create or replace function public.create_active_forecast_locked(
  p_business_id uuid, p_fiscal_year integer, p_forecast_type text, p_row jsonb
) returns jsonb
language plpgsql security definer set search_path to 'public' set statement_timeout to '120s'
as $function$
DECLARE
  v_new_id uuid;
BEGIN
  -- Group B guard: an authenticated caller must manage the target business.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.auth_can_manage_business(p_business_id) THEN
    RAISE EXCEPTION 'create_active_forecast_locked: not authorized for business %', p_business_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('forecast:' || p_business_id::text || ':' || p_fiscal_year::text));

  UPDATE "public"."financial_forecasts"
  SET "is_active" = false
  WHERE "business_id" = p_business_id AND "fiscal_year" = p_fiscal_year
    AND "forecast_type" = p_forecast_type AND "is_active" = true;

  INSERT INTO "public"."financial_forecasts" (
    "business_id","user_id","fiscal_year","name","year_type","actual_start_month",
    "actual_end_month","forecast_start_month","forecast_end_month","revenue_goal",
    "gross_profit_goal","net_profit_goal","goal_source","assumptions","forecast_duration",
    "wizard_state","forecast_type","is_active","is_completed","completed_at","updated_at"
  ) VALUES (
    p_business_id, (p_row->>'user_id')::uuid, p_fiscal_year, p_row->>'name',
    COALESCE(p_row->>'year_type', 'FY'), p_row->>'actual_start_month', p_row->>'actual_end_month',
    p_row->>'forecast_start_month', p_row->>'forecast_end_month',
    NULLIF(p_row->>'revenue_goal', '')::numeric, NULLIF(p_row->>'gross_profit_goal', '')::numeric,
    NULLIF(p_row->>'net_profit_goal', '')::numeric, COALESCE(p_row->>'goal_source', 'wizard_v4'),
    COALESCE((p_row->'assumptions')::jsonb, NULL), COALESCE((p_row->>'forecast_duration')::int, 1),
    COALESCE((p_row->'wizard_state')::jsonb, NULL), p_forecast_type, true,
    COALESCE((p_row->>'is_completed')::boolean, false), NULLIF(p_row->>'completed_at', '')::timestamptz, now()
  ) RETURNING "id" INTO v_new_id;

  RETURN jsonb_build_object('id', v_new_id);
END;
$function$;

revoke all on function public.create_active_forecast_locked(uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_active_forecast_locked(uuid, integer, text, jsonb) to authenticated, service_role;

-- ── 3. activate_forecast_locked — guard on the forecast's business ──
create or replace function public.activate_forecast_locked(p_forecast_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
DECLARE
  v_business_id uuid;
  v_fiscal_year integer;
  v_forecast_type text;
BEGIN
  SELECT "business_id", "fiscal_year", COALESCE("forecast_type", 'forecast')
    INTO v_business_id, v_fiscal_year, v_forecast_type
  FROM "public"."financial_forecasts" WHERE "id" = p_forecast_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'activate_forecast_locked: forecast % not found', p_forecast_id;
  END IF;

  -- Group B guard: an authenticated caller must manage this forecast's business.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.auth_can_manage_business(v_business_id) THEN
    RAISE EXCEPTION 'activate_forecast_locked: not authorized for forecast %', p_forecast_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('forecast:' || v_business_id::text || ':' || v_fiscal_year::text));

  UPDATE "public"."financial_forecasts"
  SET "is_active" = false
  WHERE "business_id" = v_business_id AND "fiscal_year" = v_fiscal_year
    AND COALESCE("forecast_type", 'forecast') = v_forecast_type
    AND "is_active" = true AND "id" <> p_forecast_id;

  UPDATE "public"."financial_forecasts"
  SET "is_active" = true, "updated_at" = now()
  WHERE "id" = p_forecast_id;

  RETURN jsonb_build_object('id', p_forecast_id, 'activated', true);
END;
$function$;

revoke all on function public.activate_forecast_locked(uuid) from public, anon, authenticated;
grant execute on function public.activate_forecast_locked(uuid) to authenticated, service_role;
