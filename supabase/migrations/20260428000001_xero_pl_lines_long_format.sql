-- Phase 44 Plan 44-02 Task 1 — xero_pl_lines wide → long format with unique constraint
--
-- D-09 (post-research clarification, locked 2026-04-27): xero_pl_lines storage shape
-- becomes LONG. One row per (business_id, tenant_id, account_code, period_month).
-- The wide JSONB monthly_values column is replaced by period_month + amount columns,
-- and the natural key is enforced at DB level via a UNIQUE INDEX. ON CONFLICT upserts
-- in the new sync orchestrator (44-04) become trivial; the dedup-after-fetch hack from
-- commit e337a42 is retired structurally.
--
-- Pre-flight check: 44-01 audit (scripts/audit-xero-pl-lines-duplicates.ts) ran across
-- 369 rows and found 0 duplicate groups at either the wide grain (business_id,
-- tenant_id, account_code) or the future long grain (... + period_month). The
-- DO $$ pre-flight RAISE EXCEPTION below is a re-runability safety net in case future
-- writes introduce duplicates between this migration's authoring and its application.
--
-- Rollback: xero_pl_lines_wide_legacy table is preserved by this migration as a
-- snapshot of the pre-migration state. Drop in a future migration (target Phase 45)
-- once long-format stability is verified across one full release cycle.
--
-- Single transaction: a partial failure leaves the schema unchanged.

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Pre-flight check — abort if duplicates exist at the future long-format key
-- ----------------------------------------------------------------------------
DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT business_id, tenant_id, account_code, count(*) AS c
    FROM xero_pl_lines
    GROUP BY business_id, tenant_id, account_code
    HAVING count(*) > 1
  ) AS d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Phase 44 migration aborted: % duplicate (business_id, tenant_id, account_code) groups exist in xero_pl_lines. Run scripts/audit-xero-pl-lines-duplicates.ts and remediate first.', dup_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Create new long-format table (named _v2 initially for safe rollback path)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xero_pl_lines_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  tenant_id text,
  account_code text,
  account_name text,
  account_type text,
  period_month date NOT NULL,           -- first day of the month, e.g. 2025-07-01
  amount numeric(18, 2) NOT NULL DEFAULT 0,
  fiscal_year integer,
  source text DEFAULT 'xero',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. Indexes — natural-key uniqueness + lookup paths
-- ----------------------------------------------------------------------------
-- COALESCE(tenant_id, '') keeps the unique index usable for historic rows that
-- have NULL tenant_id (NULL ≠ NULL in btree by default would defeat uniqueness).
CREATE UNIQUE INDEX IF NOT EXISTS xero_pl_lines_v2_natural_key_idx
  ON xero_pl_lines_v2 (business_id, COALESCE(tenant_id, ''), account_code, period_month);

CREATE INDEX IF NOT EXISTS xero_pl_lines_v2_business_idx ON xero_pl_lines_v2 (business_id);
CREATE INDEX IF NOT EXISTS xero_pl_lines_v2_period_idx ON xero_pl_lines_v2 (period_month);

-- ----------------------------------------------------------------------------
-- 4. Backfill from wide-format rows
-- ----------------------------------------------------------------------------
-- Skip rows where monthly_values is null/empty; skip malformed YYYY-MM keys.
-- ON CONFLICT DO NOTHING so re-running this migration on an already-migrated
-- DB is a no-op (defensive idempotency).
INSERT INTO xero_pl_lines_v2 (
  business_id, tenant_id, account_code, account_name, account_type,
  period_month, amount, fiscal_year, source, created_at, updated_at
)
SELECT
  w.business_id, w.tenant_id, w.account_code, w.account_name, w.account_type,
  (kv.key || '-01')::date AS period_month,
  (kv.value)::numeric AS amount,
  w.fiscal_year, w.source, w.created_at, w.updated_at
FROM xero_pl_lines w,
     jsonb_each_text(w.monthly_values) AS kv(key, value)
WHERE w.monthly_values IS NOT NULL AND w.monthly_values <> '{}'::jsonb
  AND kv.key ~ '^[0-9]{4}-[0-9]{2}$'   -- skip malformed keys
ON CONFLICT (business_id, COALESCE(tenant_id, ''), account_code, period_month) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Verification — informational row counts (does NOT abort)
-- ----------------------------------------------------------------------------
DO $$
DECLARE wide_rows int; long_rows int;
BEGIN
  SELECT count(*) INTO wide_rows FROM xero_pl_lines;
  SELECT count(*) INTO long_rows FROM xero_pl_lines_v2;
  RAISE NOTICE 'Phase 44 migration: xero_pl_lines wide rows: %; xero_pl_lines_v2 long rows: %', wide_rows, long_rows;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Atomic swap — rename old table out, rename new table in
-- ----------------------------------------------------------------------------
ALTER TABLE xero_pl_lines RENAME TO xero_pl_lines_wide_legacy;
ALTER TABLE xero_pl_lines_v2 RENAME TO xero_pl_lines;

-- Rename indexes to canonical names so future migrations find them.
ALTER INDEX xero_pl_lines_v2_natural_key_idx RENAME TO xero_pl_lines_natural_key_idx;
ALTER INDEX xero_pl_lines_v2_business_idx RENAME TO xero_pl_lines_business_idx;
ALTER INDEX xero_pl_lines_v2_period_idx RENAME TO xero_pl_lines_period_idx;

-- ----------------------------------------------------------------------------
-- 7. Backwards-compatibility VIEW for legacy READ paths
-- ----------------------------------------------------------------------------
-- Plans 44-{03..07} ship before all consumers migrate to ForecastReadService
-- (which lands in 44-08/44-09). Until then, code paths that still SELECT
-- monthly_values JSONB from xero_pl_lines can read this view instead.
--
-- IMPORTANT: This view is READ-ONLY. Old INSERT/UPDATE paths against the legacy
-- monthly_values shape WILL throw because the underlying table has no such
-- column. This is the structural reason Sub-phase A (plans 44-02..44-05)
-- ships as ONE atomic deployment session — the legacy writers are replaced by
-- thin shims around the new sync orchestrator (44-04, 44-05) in the same
-- deployment window.
--
-- Dropped in plan 44-09 once all readers migrate to ForecastReadService.
CREATE OR REPLACE VIEW xero_pl_lines_wide_compat AS
SELECT
  business_id,
  tenant_id,
  account_code,
  account_name,
  account_type,
  fiscal_year,
  source,
  jsonb_object_agg(to_char(period_month, 'YYYY-MM'), amount) AS monthly_values,
  min(created_at) AS created_at,
  max(updated_at) AS updated_at
FROM xero_pl_lines
GROUP BY business_id, tenant_id, account_code, account_name, account_type, fiscal_year, source;

-- ----------------------------------------------------------------------------
-- 8. Comments
-- ----------------------------------------------------------------------------
COMMENT ON TABLE xero_pl_lines IS 'Phase 44 — long-format Xero P&L. One row per (business_id, tenant_id, account_code, period_month). Wide-shaped DTOs exposed via xero_pl_lines_wide_compat view + ForecastReadService.';
COMMENT ON COLUMN xero_pl_lines.period_month IS 'First day of the month, e.g. 2025-07-01 represents July 2025.';
COMMENT ON COLUMN xero_pl_lines.amount IS 'Signed monthly amount for this account in this period_month. Numeric(18,2) — currency-safe.';
COMMENT ON TABLE xero_pl_lines_wide_legacy IS 'Phase 44 — pre-migration wide-format snapshot. Drop after one full release of long-format stability is verified (target: Phase 45).';
COMMENT ON VIEW xero_pl_lines_wide_compat IS 'Phase 44 — READ-ONLY backwards-compatible wide-shaped projection over the long-format xero_pl_lines table. Drop in plan 44-09 once all consumers migrate to ForecastReadService.';

COMMIT;
