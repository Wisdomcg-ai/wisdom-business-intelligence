-- Phase 49 Plan 01 — DB-01 + DB-02 + DB-05 (audit columns + filename hygiene)
--
-- Single additive migration that adds 32 nullable columns (8 tables × 4 cols)
-- + 8 partial indexes + a best-effort backfill of created_by, plus COMMENTs
-- recording the trigger-absence caveat for DB-02.
--
-- DB-01 — adds nullable `deleted_at` (timestamptz) + `deleted_by`
--         (uuid → auth.users SET NULL) to the 8 most-mutated financial tables:
--           financial_forecasts, forecast_employees, forecast_pl_lines,
--           monthly_actuals, xero_pl_lines, cfo_report_status,
--           cfo_email_log, account_mappings.
--         Each table also gets a partial index
--           CREATE INDEX idx_<table>_deleted_at ON <table>(deleted_at)
--             WHERE deleted_at IS NULL
--         to keep live-row queries efficient (matches the convention set by
--         baseline:6973 idx_businesses_deleted_at).
--
-- DB-02 — adds nullable `created_by` + `updated_by` (uuid → auth.users SET NULL)
--         to the same 8 tables, then backfills `created_by` from canonical
--         creator columns where they exist:
--           financial_forecasts.user_id    → created_by  (NOT NULL @ baseline:2544 → 100% coverage)
--           account_mappings.mapped_by     → created_by  (nullable @ baseline:1391 → partial)
--           cfo_email_log.triggered_by     → created_by  (nullable @ 20260424:8 → partial)
--         and best-effort from forecast_audit_log for forecast_employees +
--         forecast_pl_lines.
--
--         **CRITICAL caveat (recorded as COMMENT below):** the audit-log
--         trigger functions `log_forecast_change` (baseline:821) and
--         `audit_employee_changes` (baseline:61) exist but are NEVER wired
--         with a CREATE TRIGGER statement
--         (`grep -c "CREATE TRIGGER" baseline_schema.sql` = 0). The audit
--         log is therefore populated only by explicit app-code inserts, so
--         the forecast_employees / forecast_pl_lines backfill is best-effort
--         and many rows will remain NULL. This is by design and not a bug.
--
-- DB-05 — companion change (NOT in this SQL — it is a `git mv` + CI regex
--         tightening in the same PR):
--           20260424_cfo_email_log.sql                 → 20260424000000_…
--           20260427_unique_active_forecast_per_fy.sql → 20260427000000_…
--
--         **Operator action required after deploy** on each production tenant
--         (Supabase Studio SQL Editor):
--           UPDATE supabase_migrations.schema_migrations
--              SET version = '20260424000000' WHERE version = '20260424';
--           UPDATE supabase_migrations.schema_migrations
--              SET version = '20260427000000' WHERE version = '20260427';
--         Without this, production will think the renamed files are unapplied
--         and re-run them. The renamed files are idempotent (CREATE TABLE
--         IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / CREATE UNIQUE INDEX
--         IF NOT EXISTS) so re-runs are harmless, but the schema_migrations
--         table should reflect reality.
--
-- Additive-only guarantee:
--   * No NOT NULL columns added — every new column is nullable, so existing
--     INSERT statements continue to satisfy the schema unchanged.
--   * No DEFAULT values that change row semantics — deleted_at / deleted_by
--     have no default; created_by / updated_by have no default.
--   * No FK violations possible — auth.users(id) ON DELETE SET NULL is safe
--     because the new columns are nullable.
--   * Rollback is trivial: ALTER TABLE … DROP COLUMN deleted_at, deleted_by,
--     created_by, updated_by per table; DROP INDEX idx_<table>_deleted_at.

BEGIN;

-- ----------------------------------------------------------------------------
-- DB-01 + DB-02: column adds + partial indexes (8 tables × 4 cols each = 32)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'financial_forecasts',
    'forecast_employees',
    'forecast_pl_lines',
    'monthly_actuals',
    'xero_pl_lines',
    'cfo_report_status',
    'cfo_email_log',
    'account_mappings'
  ]
  LOOP
    -- Column adds (idempotent via IF NOT EXISTS).
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
         ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL',
      t
    );

    -- Partial index on live rows (matches baseline:6973 idx_businesses_deleted_at convention).
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (deleted_at) WHERE deleted_at IS NULL',
      'idx_' || t || '_deleted_at',
      t
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- DB-02 backfill — confidence-ordered.
--
-- Tier 1: tables with a canonical creator column already present.
--   * financial_forecasts.user_id  is NOT NULL @ baseline:2544 → 100% coverage.
--   * account_mappings.mapped_by   is nullable @ baseline:1391 → partial.
--   * cfo_email_log.triggered_by   is nullable @ 20260424:8     → partial.
-- ----------------------------------------------------------------------------
UPDATE public.financial_forecasts
   SET created_by = user_id
 WHERE created_by IS NULL;

UPDATE public.account_mappings
   SET created_by = mapped_by
 WHERE created_by IS NULL
   AND mapped_by IS NOT NULL;

UPDATE public.cfo_email_log
   SET created_by = triggered_by
 WHERE created_by IS NULL
   AND triggered_by IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Tier 2: best-effort from forecast_audit_log.
--
-- Likely no-op on most environments: the triggers `log_forecast_change`
-- (baseline:821) and `audit_employee_changes` (baseline:61) are defined but
-- NEVER wired with CREATE TRIGGER, so forecast_audit_log is only ever
-- populated by explicit app-code inserts. We attempt the backfill anyway
-- because some app paths DO insert into the audit log; rows it covers will
-- get a created_by, the rest stay NULL by design.
--
-- forecast_audit_log.action ∈ ('create','update','delete','sync_xero','import_annual_plan')
-- per the CHECK constraint at baseline:2821; we only join on 'create' rows.
-- ----------------------------------------------------------------------------
UPDATE public.forecast_employees fe
   SET created_by = fal.user_id
  FROM public.forecast_audit_log fal
 WHERE fal.table_name = 'forecast_employees'
   AND fal.action     = 'create'
   AND fal.record_id  = fe.id
   AND fe.created_by IS NULL
   AND fal.user_id    IS NOT NULL;

UPDATE public.forecast_pl_lines fpl
   SET created_by = fal.user_id
  FROM public.forecast_audit_log fal
 WHERE fal.table_name = 'forecast_pl_lines'
   AND fal.action     = 'create'
   AND fal.record_id  = fpl.id
   AND fpl.created_by IS NULL
   AND fal.user_id    IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Tables intentionally NOT backfilled (created_by stays NULL by design):
--   monthly_actuals    — not in forecast_audit_log action enum; no creator column
--   xero_pl_lines      — written by Xero sync (system actor); NULL is correct
--   cfo_report_status  — has approved_by (≠ creator); no creator column or audit coverage
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- COMMENTs — encode the trigger-absence caveat and the cfo_email_log rationale
-- so future readers understand why some created_by values are NULL.
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.forecast_employees.created_by IS
  'DB-02 (Phase 49): backfilled from forecast_audit_log on best-effort basis. '
  'The audit-log trigger audit_employee_changes (baseline:61) is defined but '
  'never wired with CREATE TRIGGER, so forecast_audit_log is only populated '
  'when app code explicitly inserts into it. Many historical rows will have '
  'created_by = NULL. New writes should populate created_by from app code.';

COMMENT ON COLUMN public.forecast_pl_lines.created_by IS
  'DB-02 (Phase 49): backfilled from forecast_audit_log on best-effort basis. '
  'The audit-log trigger log_forecast_change (baseline:821) is defined but '
  'never wired with CREATE TRIGGER, so forecast_audit_log is only populated '
  'when app code explicitly inserts into it. Many historical rows will have '
  'created_by = NULL. New writes should populate created_by from app code.';

COMMENT ON COLUMN public.monthly_actuals.created_by IS
  'DB-02 (Phase 49): no canonical creator column or audit-log coverage. '
  'Existing rows will have created_by = NULL by design; new writes should '
  'populate from app code.';

COMMENT ON COLUMN public.xero_pl_lines.created_by IS
  'DB-02 (Phase 49): rows are written by the Xero sync (system actor). '
  'created_by = NULL is the correct, intended state for sync-written rows; '
  'manual edits should populate from app code.';

COMMENT ON COLUMN public.cfo_report_status.created_by IS
  'DB-02 (Phase 49): no canonical creator column (approved_by ≠ creator) and '
  'no audit-log coverage. Existing rows will have created_by = NULL by design; '
  'new writes should populate from app code.';

COMMENT ON COLUMN public.cfo_email_log.deleted_at IS
  'DB-01 (Phase 49): reserved — cfo_email_log is append-only and this column '
  'is never expected to be set. Provided for schema consistency with the other '
  '7 financial tables in this audit-column set.';

COMMENT ON COLUMN public.cfo_email_log.deleted_by IS
  'DB-01 (Phase 49): reserved — see deleted_at. Append-only table; this column '
  'is never expected to be set.';

COMMIT;
