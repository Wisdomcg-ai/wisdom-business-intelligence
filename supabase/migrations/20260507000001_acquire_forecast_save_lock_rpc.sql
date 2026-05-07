-- Phase 56 P0-15 — atomic deactivate+insert of forecast under advisory lock.
--
-- Two concurrent POSTs to /api/forecast-wizard-v4/generate for the same
-- (business_id, fiscal_year) can both run "UPDATE is_active=false" then
-- "INSERT is_active=true" with overlapping windows, leaving multiple rows
-- with is_active=true. The partial unique index unique_active_forecast_per_fy
-- only catches the second INSERT if it physically commits AFTER the first;
-- with overlapping windows the race slips through and corrupts coach
-- dashboard / read-side queries that depend on a single active forecast.
--
-- Fix: do BOTH the deactivate and the insert inside a single transaction
-- (this RPC = one transaction), guarded by a transaction-scoped advisory
-- lock keyed on hashtext('forecast:' || business_id || ':' || fy). The
-- second concurrent caller blocks on the lock, then sees the first
-- caller's deactivation as committed before its own deactivate runs.
--
-- pgBouncer note (mirrors xero-sync-lock 20260428000003):
--   pg_advisory_xact_lock is the only pgBouncer-transaction-mode-safe
--   variant. Released automatically on commit/rollback.
--
-- The route still owns row-construction (calculating field values from
-- request body); this RPC just receives the prepared payload as JSONB and
-- performs the critical-section writes.

CREATE OR REPLACE FUNCTION "public"."create_active_forecast_locked"(
  "p_business_id" uuid,
  "p_fiscal_year" integer,
  "p_forecast_type" text,
  "p_row" jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rpc_body$
DECLARE
  v_new_id uuid;
BEGIN
  -- 1. Acquire advisory lock for (business_id, fiscal_year). Concurrent
  --    callers serialize here. Lock auto-released on commit/rollback of
  --    THIS function's implicit transaction.
  PERFORM pg_advisory_xact_lock(
    hashtext('forecast:' || p_business_id::text || ':' || p_fiscal_year::text)
  );

  -- 2. Deactivate any existing active forecast for the same (business, FY,
  --    type). Inside this transaction so the subsequent INSERT cannot trip
  --    the unique_active_forecast_per_fy partial unique index.
  UPDATE "public"."financial_forecasts"
  SET "is_active" = false
  WHERE "business_id" = p_business_id
    AND "fiscal_year" = p_fiscal_year
    AND "forecast_type" = p_forecast_type
    AND "is_active" = true;

  -- 3. Insert the new forecast row. Caller passes a JSONB object whose keys
  --    map 1:1 to financial_forecasts column names. We extract each key
  --    explicitly (no jsonb_populate_record) so an unknown/extra key cannot
  --    silently land in the row, and so type casts are explicit.
  INSERT INTO "public"."financial_forecasts" (
    "business_id",
    "user_id",
    "fiscal_year",
    "name",
    "year_type",
    "actual_start_month",
    "actual_end_month",
    "forecast_start_month",
    "forecast_end_month",
    "revenue_goal",
    "gross_profit_goal",
    "net_profit_goal",
    "goal_source",
    "assumptions",
    "forecast_duration",
    "wizard_state",
    "forecast_type",
    "is_active",
    "is_completed",
    "completed_at",
    "updated_at"
  ) VALUES (
    p_business_id,
    (p_row->>'user_id')::uuid,
    p_fiscal_year,
    p_row->>'name',
    COALESCE(p_row->>'year_type', 'FY'),
    p_row->>'actual_start_month',
    p_row->>'actual_end_month',
    p_row->>'forecast_start_month',
    p_row->>'forecast_end_month',
    NULLIF(p_row->>'revenue_goal', '')::numeric,
    NULLIF(p_row->>'gross_profit_goal', '')::numeric,
    NULLIF(p_row->>'net_profit_goal', '')::numeric,
    COALESCE(p_row->>'goal_source', 'wizard_v4'),
    COALESCE((p_row->'assumptions')::jsonb, NULL),
    COALESCE((p_row->>'forecast_duration')::int, 1),
    COALESCE((p_row->'wizard_state')::jsonb, NULL),
    p_forecast_type,
    true,
    COALESCE((p_row->>'is_completed')::boolean, false),
    NULLIF(p_row->>'completed_at', '')::timestamptz,
    now()
  )
  RETURNING "id" INTO v_new_id;

  RETURN jsonb_build_object('id', v_new_id);
END;
$rpc_body$;

REVOKE ALL ON FUNCTION "public"."create_active_forecast_locked"(uuid, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."create_active_forecast_locked"(uuid, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."create_active_forecast_locked"(uuid, integer, text, jsonb) TO service_role;

COMMENT ON FUNCTION "public"."create_active_forecast_locked"(uuid, integer, text, jsonb) IS
  'Phase 56 P0-15 — atomic deactivate-existing+insert-new for financial_forecasts under pg_advisory_xact_lock keyed on (business, fiscal_year). Serializes concurrent /api/forecast-wizard-v4/generate POSTs so unique_active_forecast_per_fy can never have two true rows. Authorize at API layer; this fn does not check business access.';
