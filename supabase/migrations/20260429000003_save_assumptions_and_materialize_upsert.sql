-- Phase 44.1 — restructure save_assumptions_and_materialize as UPSERT.
--
-- Decisions captured in .planning/phases/44.1-atomic-save-hardening-and-staged-rollout/44.1-CONTEXT.md:
--   D-44.1-01 — Replace DELETE-then-INSERT body with UPSERT keyed on the
--               (forecast_id account_code) pair under the is_manual = false
--               predicate. Accounts not present in p_pl_lines survive
--               untouched. Structurally eliminates the data-loss vector that
--               caused the abandoned Plan 44-07 deploy incident on 2026-04-28.
--   D-44.1-02 — Add `p_force_full_replace boolean DEFAULT false` parameter for
--               legitimate clear operations (year-type switch, intentional
--               reset). When true, falls back to DELETE-then-INSERT semantics
--               but still preserves is_manual = true rows.
--   D-44.1-03 — is_manual = true rows (coach overrides) are NEVER touched by
--               either path. Partial unique index excludes them; force-replace
--               DELETE excludes them.
--   D-44.1-04 — Return shape is UNCHANGED: {forecast_id, computed_at,
--               lines_count}. Existing 3-arg callers in
--               src/app/api/forecast-wizard-v4/generate/route.ts and
--               src/app/api/forecast/[id]/recompute/route.ts continue to work
--               without code edits — the missing 4th arg defaults to false.
--   D-44.1-05 — Backfill null account_code rows BEFORE creating the partial
--               unique index. 44.1-01 audit confirmed N=236 null rows, M=0
--               duplicates in production (see 44.1-01-SUMMARY.md). Pattern is
--               'ACCT-MISSING-' || id::text — deterministic, idempotent.
--
-- Why DELETE-then-INSERT was a data-loss vector:
--   The previous body (20260429000002 lines 73-117) executed
--     DELETE FROM forecast_pl_lines WHERE forecast_id = p_forecast_id
--                                     AND is_manual = false;
--     INSERT ... FROM jsonb_array_elements(p_pl_lines) ...;
--   When the upstream convertAssumptionsToPLLines produced a SHORTER array
--   than DB state (empty assumption sub-section, undefined year1Monthly,
--   shrunk forecastDuration, RLS-empty existingLines), the RPC silently lost
--   accounts. There was no structural protection against shorter input.
--
-- This migration supersedes the BODY of 20260429000002 via CREATE OR REPLACE.
-- The original migration file remains on disk for history; it does not need
-- to be reverted.
--
-- Studio compatibility (carried from 44-02 / 44-05 / 44-06):
--   - Uniquely-tagged dollar quote (NOT bare double-dollar).
--   - Diagnostics-via-ROW_COUNT (NOT SELECT INTO).
--   - No explicit BEGIN/COMMIT (Studio uses implicit txn).
--   - CREATE OR REPLACE FUNCTION is idempotent.
--   - CREATE UNIQUE INDEX IF NOT EXISTS is idempotent.

-- D-44.1-05 — Backfill null account_code rows so the partial unique index can be created.
-- Pattern: 'ACCT-MISSING-' || id (deterministic, idempotent, retains row identity for forensics).
UPDATE "public"."forecast_pl_lines"
SET "account_code" = 'ACCT-MISSING-' || "id"::text
WHERE "account_code" IS NULL
  AND "is_manual" = false;

-- D-44.1-01 — Required for the upsert conflict target on (forecast_id account_code) under is_manual=false.
-- Partial index: manual rows (coach overrides) are EXEMPT — they can duplicate the same
-- (forecast_id, account_code) as a derived row, by design (D-44.1-06 vector 5).
CREATE UNIQUE INDEX IF NOT EXISTS "forecast_pl_lines_forecast_account_code_partial_uidx"
  ON "public"."forecast_pl_lines" ("forecast_id", "account_code")
  WHERE "is_manual" = false;

CREATE OR REPLACE FUNCTION "public"."save_assumptions_and_materialize"(
  "p_forecast_id" uuid,
  "p_assumptions" jsonb,
  "p_pl_lines" jsonb,
  "p_force_full_replace" boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $save_body$
DECLARE
  v_now timestamp with time zone := now();
  v_lines_count int := 0;
BEGIN
  -- 1. Verify forecast exists (ownership checked at API layer, mirrors 20260429000002).
  IF NOT EXISTS (
    SELECT 1 FROM "public"."financial_forecasts" WHERE "id" = p_forecast_id
  ) THEN
    RAISE EXCEPTION 'save_assumptions_and_materialize: forecast % not found', p_forecast_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Update assumptions + bump updated_at to v_now (single timestamp shared with computed_at
  --    so the freshness invariant cannot fire on millisecond skew).
  UPDATE "public"."financial_forecasts"
  SET "assumptions" = p_assumptions,
      "updated_at" = v_now
  WHERE "id" = p_forecast_id;

  -- 3. D-44.1-02 — legitimate clear operations (year-type switch, intentional reset).
  --    Caller must opt in via p_force_full_replace=true. is_manual=true rows still preserved.
  IF p_force_full_replace THEN
    DELETE FROM "public"."forecast_pl_lines"
    WHERE "forecast_id" = p_forecast_id
      AND "is_manual" = false;
  END IF;

  -- 4. D-44.1-01 — UPSERT keyed on (forecast_id, account_code) WHERE is_manual = false.
  --    Accounts not present in p_pl_lines survive untouched. Shorter input is safe.
  --    is_manual=true rows are NEVER touched here (the partial index excludes them, and
  --    we always set is_manual=false on inserted rows).
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
  FROM jsonb_array_elements(p_pl_lines) AS line
  ON CONFLICT ("forecast_id", "account_code") WHERE "is_manual" = false
  DO UPDATE SET
    "account_name"     = EXCLUDED."account_name",
    "account_type"     = EXCLUDED."account_type",
    "account_class"    = EXCLUDED."account_class",
    "category"         = EXCLUDED."category",
    "subcategory"      = EXCLUDED."subcategory",
    "sort_order"       = EXCLUDED."sort_order",
    "actual_months"    = EXCLUDED."actual_months",
    "forecast_months"  = EXCLUDED."forecast_months",
    "is_from_xero"     = EXCLUDED."is_from_xero",
    "is_from_payroll"  = EXCLUDED."is_from_payroll",
    "computed_at"      = v_now,
    "updated_at"       = v_now;

  GET DIAGNOSTICS v_lines_count = ROW_COUNT;

  -- 5. Bump computed_at on rows NOT touched by the UPSERT (i.e., accounts in DB
  --    but NOT in p_pl_lines). Without this, those rows keep their old computed_at
  --    and the freshness invariant fires on legitimate carry-forward state.
  --    is_manual=true rows are excluded — they have their own lifecycle.
  UPDATE "public"."forecast_pl_lines"
  SET "computed_at" = v_now,
      "updated_at"  = v_now
  WHERE "forecast_id" = p_forecast_id
    AND "is_manual"   = false
    AND "computed_at" < v_now;

  RETURN jsonb_build_object(
    'forecast_id', p_forecast_id,
    'computed_at', v_now,
    'lines_count', v_lines_count
  );
END;
$save_body$;

-- ─── Section 5a: REVOKE/GRANT on the new 4-arg form ─────────────────────────
-- After CREATE OR REPLACE FUNCTION, default privileges may have been reset.
-- Explicitly REVOKE PUBLIC and re-GRANT EXECUTE to the two roles that need it.
REVOKE ALL ON FUNCTION "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb, boolean) TO service_role;

-- ─── Section 5b: DROP FUNCTION on the legacy 3-arg overload ─────────────────
-- PostgreSQL treats different arg counts as different overloads. Without this DROP,
-- both the 3-arg form (from 20260429000002) AND the new 4-arg form coexist, and
-- PostgREST resolves supabase.rpc('save_assumptions_and_materialize', { p_forecast_id, p_assumptions, p_pl_lines })
-- by best-match; the 3-arg overload (without p_force_full_replace handling) would be
-- preferred for a 3-key body. After DROP, the 4-arg form is the only resolution; the
-- existing 3-arg callers in wizard-generate and recompute keep working because the
-- missing p_force_full_replace defaults to false.
DROP FUNCTION IF EXISTS "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb);

COMMENT ON FUNCTION "public"."save_assumptions_and_materialize"(uuid, jsonb, jsonb, boolean) IS
  'Phase 44.1 D-44.1-01 — atomic UPSERT save + materialize. Pass p_force_full_replace=true for legitimate clear operations. is_manual=true rows preserved through both paths. Returns {forecast_id, computed_at, lines_count}.';
