-- Phase 44 D-12 — atomic save + materialize.
--
-- Sub-phase B foundation. PostgREST runs each RPC inside an implicit transaction;
-- a failure in the INSERT step rolls back the UPDATE step too — atomicity guaranteed.
--
-- A single `v_now` value is captured at function entry and used for BOTH
-- financial_forecasts.assumptions write AND forecast_pl_lines.computed_at, so
-- consumers' invariant `computed_at >= updated_at` cannot fire on millisecond clock
-- skew (Pitfall 3 of 44-RESEARCH.md).
--
-- SCHEMA NOTE (Plan 44-06 deviation, see SUMMARY): the plan spec referenced a
-- `forecast_assumptions` table; that table does NOT exist in the codebase. The
-- wizard's actual write target is `financial_forecasts.assumptions` (jsonb column,
-- baseline_schema.sql:2599) plus optionally `category_assumptions` and `wizard_state`.
-- This RPC mirrors the actual wizard write surface so 44-07 can swap the wizard's
-- two-step Supabase calls for a single supabase.rpc() with no additional schema
-- changes.
--
-- Args:
--   p_forecast_id  — financial_forecasts.id this save targets
--   p_assumptions  — full assumptions JSONB (replaces financial_forecasts.assumptions)
--   p_pl_lines     — JSONB array of derived line objects to materialize:
--                     {account_name, account_code, category, subcategory, sort_order,
--                      actual_months, forecast_months, is_from_xero}
--                    is_manual = false rows are replaced; is_manual = true rows
--                    (coach overrides) are preserved untouched.
--
-- Returns:
--   jsonb { forecast_id, computed_at (ISO timestamp), lines_count (number inserted) }
--
-- Studio compatibility:
--   - Uniquely-tagged dollar quote `$save_body$` (not bare `$$`).
--   - No `SELECT INTO variable` patterns — uses `GET DIAGNOSTICS ... ROW_COUNT`.
--   - No explicit BEGIN/COMMIT wrapper — Studio uses an implicit transaction.
--   - Re-runnable: `CREATE OR REPLACE FUNCTION` is idempotent.

CREATE OR REPLACE FUNCTION "public"."save_assumptions_and_materialize"(
  "p_forecast_id" uuid,
  "p_assumptions" jsonb,
  "p_pl_lines" jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $save_body$
DECLARE
  v_now timestamp with time zone := now();
  v_lines_count int := 0;
BEGIN
  -- 1. Verify the forecast exists. We do not check ownership here — the calling
  --    API route MUST verify the user has access to p_forecast_id BEFORE calling.
  --    (Mirrors Phase 35 helper pattern. SECURITY DEFINER bypasses RLS so this
  --    cannot be left to RLS policies.)
  --
  --    IF EXISTS pattern (not SELECT INTO) — Studio's parser dislikes SELECT INTO
  --    inside DO/function bodies; per 44-05 lessons we avoid it.
  IF NOT EXISTS (
    SELECT 1 FROM "public"."financial_forecasts" WHERE "id" = p_forecast_id
  ) THEN
    RAISE EXCEPTION 'save_assumptions_and_materialize: forecast % not found', p_forecast_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Update assumptions on the forecast row. updated_at moves with v_now so
  --    the invariant `forecast_pl_lines.computed_at >= financial_forecasts.updated_at`
  --    holds after this transaction commits.
  UPDATE "public"."financial_forecasts"
  SET
    "assumptions" = p_assumptions,
    "updated_at" = v_now
  WHERE "id" = p_forecast_id;

  -- 3. Replace materialized rows. is_manual = true rows (coach overrides) are preserved.
  DELETE FROM "public"."forecast_pl_lines"
  WHERE "forecast_id" = p_forecast_id
    AND "is_manual" = false;

  -- 4. Insert new derived rows with computed_at = v_now. Every column the wizard's
  --    current materializer sets is supported; the caller passes a JSONB array of
  --    objects with these keys (missing keys default to NULL/empty as per the
  --    column defaults in baseline_schema.sql).
  INSERT INTO "public"."forecast_pl_lines" (
    "forecast_id",
    "account_name",
    "account_code",
    "account_type",
    "account_class",
    "category",
    "subcategory",
    "sort_order",
    "actual_months",
    "forecast_months",
    "is_from_xero",
    "is_manual",
    "is_from_payroll",
    "computed_at",
    "created_at",
    "updated_at"
  )
  SELECT
    p_forecast_id,
    line->>'account_name',
    line->>'account_code',
    line->>'account_type',
    line->>'account_class',
    line->>'category',
    line->>'subcategory',
    COALESCE((line->>'sort_order')::int, 0),
    COALESCE((line->'actual_months')::jsonb, '{}'::jsonb),
    COALESCE((line->'forecast_months')::jsonb, '{}'::jsonb),
    COALESCE((line->>'is_from_xero')::boolean, false),
    false,
    COALESCE((line->>'is_from_payroll')::boolean, false),
    v_now,
    v_now,
    v_now
  FROM jsonb_array_elements(p_pl_lines) AS line;

  GET DIAGNOSTICS v_lines_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'forecast_id', p_forecast_id,
    'computed_at', v_now,
    'lines_count', v_lines_count
  );
END;
$save_body$;

-- Auth: SECURITY DEFINER runs with the function owner's privileges. We restrict
-- EXECUTE to authenticated (so the wizard can call it via supabase.rpc) and
-- service_role (cron + recompute endpoint), and revoke from PUBLIC.
-- The function does NOT check forecast ownership — the calling API route MUST
-- verify the user has access to p_forecast_id BEFORE calling.
REVOKE ALL ON FUNCTION "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb) IS
  'Phase 44 D-12 — atomic write of financial_forecasts.assumptions + forecast_pl_lines in one transaction. Single now() applied to both. Authorize at API layer; this fn does not check forecast ownership.';
