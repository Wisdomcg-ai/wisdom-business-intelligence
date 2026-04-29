-- Phase 44 D-12: add `computed_at` timestamp to forecast_pl_lines.
--
-- Sub-phase B foundation. ForecastReadService (44-08) and downstream consumers
-- (44-09) will assert:
--   forecast_pl_lines.computed_at >= financial_forecasts.assumptions.updated_at-equivalent
-- Violation indicates a stale derivation; throw structured error + Sentry tag.
--
-- The `save_assumptions_and_materialize` RPC (migration 02) sets `computed_at = now()`
-- on every row it inserts, sharing a single `v_now` value with the assumptions write
-- so the invariant cannot fire on millisecond clock skew (Pitfall 3 of 44-RESEARCH).
--
-- Studio compatibility (per 44-05 lessons):
--   - No explicit BEGIN/COMMIT wrapper — Studio uses an implicit transaction.
--   - Every statement is idempotent (`IF NOT EXISTS`, NULL-guarded UPDATE) so
--     re-running the migration is safe.

ALTER TABLE "public"."forecast_pl_lines"
  ADD COLUMN IF NOT EXISTS "computed_at" timestamp with time zone;

-- Idempotent backfill: existing rows take computed_at = updated_at as a best-effort.
-- Re-runs are no-ops once columns are populated.
UPDATE "public"."forecast_pl_lines"
SET "computed_at" = "updated_at"
WHERE "computed_at" IS NULL;

-- Default for any rows inserted by callers that don't set `computed_at` explicitly.
-- The RPC always sets it; this default protects ad-hoc inserts during recovery.
ALTER TABLE "public"."forecast_pl_lines"
  ALTER COLUMN "computed_at" SET DEFAULT "now"();

COMMENT ON COLUMN "public"."forecast_pl_lines"."computed_at" IS
  'Phase 44 D-12 — set by save_assumptions_and_materialize RPC. Consumers assert computed_at >= assumptions.updated_at; violation = stale derivation.';

-- Read-side index — consumers query by forecast_id and need to compare timestamps fast.
CREATE INDEX IF NOT EXISTS "forecast_pl_lines_forecast_computed_at_idx"
  ON "public"."forecast_pl_lines" ("forecast_id", "computed_at" DESC);
