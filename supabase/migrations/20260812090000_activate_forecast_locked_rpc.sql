-- activate_forecast_locked — publish an EXISTING forecast as the active one.
--
-- Why: PR-A (#350) made wizard draft saves insert `is_active = false` rows so
-- a 3-second autosave could no longer dethrone a business's approved
-- forecast. That fixed the clobber but left a gap: the final "Generate
-- Forecast" click takes the UPDATE path (the draft already has an id), and
-- that path never set is_active — so a freshly-built forecast could stay
-- INACTIVE. The monthly report / cashflow / /cfo dashboard all select the
-- active forecast, so the operator's just-approved numbers would be invisible.
--
-- Mirrors create_active_forecast_locked's concurrency contract: the same
-- advisory lock key serializes callers for (business, fiscal_year), and the
-- deactivate + activate run in one transaction so the
-- unique_active_forecast_per_fy partial unique index can never be tripped.

CREATE OR REPLACE FUNCTION "public"."activate_forecast_locked"(
  "p_forecast_id" uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rpc_body$
DECLARE
  v_business_id uuid;
  v_fiscal_year integer;
  v_forecast_type text;
BEGIN
  SELECT "business_id", "fiscal_year", COALESCE("forecast_type", 'forecast')
    INTO v_business_id, v_fiscal_year, v_forecast_type
  FROM "public"."financial_forecasts"
  WHERE "id" = p_forecast_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'activate_forecast_locked: forecast % not found', p_forecast_id;
  END IF;

  -- Same lock key as create_active_forecast_locked so both paths serialize
  -- against each other.
  PERFORM pg_advisory_xact_lock(
    hashtext('forecast:' || v_business_id::text || ':' || v_fiscal_year::text)
  );

  UPDATE "public"."financial_forecasts"
  SET "is_active" = false
  WHERE "business_id" = v_business_id
    AND "fiscal_year" = v_fiscal_year
    AND COALESCE("forecast_type", 'forecast') = v_forecast_type
    AND "is_active" = true
    AND "id" <> p_forecast_id;

  UPDATE "public"."financial_forecasts"
  SET "is_active" = true,
      "updated_at" = now()
  WHERE "id" = p_forecast_id;

  RETURN jsonb_build_object('id', p_forecast_id, 'activated', true);
END;
$rpc_body$;

ALTER FUNCTION "public"."activate_forecast_locked"(uuid) OWNER TO "postgres";

-- SECURITY DEFINER hygiene (CLAUDE.md): revoke PUBLIC/anon, grant only what
-- the app needs. Re-issued here because CREATE OR REPLACE keeps the ACL but a
-- future DROP+CREATE would discard it.
REVOKE ALL ON FUNCTION "public"."activate_forecast_locked"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."activate_forecast_locked"(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION "public"."activate_forecast_locked"(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."activate_forecast_locked"(uuid) TO service_role;

COMMENT ON FUNCTION "public"."activate_forecast_locked"(uuid) IS
  'Publishes an existing forecast as the active one for its (business, fiscal_year, forecast_type), deactivating siblings under the same advisory lock create_active_forecast_locked uses. Called by the wizard''s final Generate on the update path (drafts are created inactive since PR-A/#350).';
