-- Phase 44 Plan 44-05 prereq — replace functional unique index with plain column-list unique
--
-- Issue surfaced by Plan 44-04 SUMMARY: Supabase's PostgREST `.upsert(rows, { onConflict: 'cols' })`
-- can only target plain column-list unique constraints, not functional indexes.
-- The 44-02 migration created a functional unique index on
--   (business_id, COALESCE(tenant_id, ''), account_code, period_month)
-- which Supabase upsert cannot use, causing
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- in production.
--
-- Fix: backfill any NULL tenant_id rows with empty string, set tenant_id NOT NULL DEFAULT '',
-- drop the functional unique index, add a plain column-list unique constraint that Supabase
-- upsert can target.
--
-- Compatibility: Studio-friendly (no DO blocks, no BEGIN/COMMIT, idempotency via IF EXISTS / IF NOT EXISTS).

-- Step 1: backfill any NULL tenant_id (should be 0 rows in current prod, but defensive).
UPDATE xero_pl_lines SET tenant_id = '' WHERE tenant_id IS NULL;

-- Step 2: enforce NOT NULL + default empty string going forward.
ALTER TABLE xero_pl_lines ALTER COLUMN tenant_id SET DEFAULT '';
ALTER TABLE xero_pl_lines ALTER COLUMN tenant_id SET NOT NULL;

-- Step 3: drop the functional unique index.
DROP INDEX IF EXISTS xero_pl_lines_natural_key_idx;

-- Step 4: add a plain unique constraint (named — so Supabase onConflict can match by name OR by columns).
ALTER TABLE xero_pl_lines
  ADD CONSTRAINT xero_pl_lines_natural_key_uniq
  UNIQUE (business_id, tenant_id, account_code, period_month);

-- Step 5: also fix the wide-compat view to drop the COALESCE (no longer needed since tenant_id NOT NULL).
CREATE OR REPLACE VIEW xero_pl_lines_wide_compat AS
SELECT
  business_id,
  tenant_id,
  account_code,
  account_name,
  account_type,
  section,
  jsonb_object_agg(to_char(period_month, 'YYYY-MM'), amount) AS monthly_values,
  min(created_at) AS created_at,
  max(updated_at) AS updated_at
FROM xero_pl_lines
GROUP BY business_id, tenant_id, account_code, account_name, account_type, section;

COMMENT ON CONSTRAINT xero_pl_lines_natural_key_uniq ON xero_pl_lines IS 'Phase 44 — plain column-list unique constraint that Supabase .upsert(onConflict: ...) can target. Replaces the functional unique index from 44-02 which used COALESCE(tenant_id, "") and was unreachable from PostgREST upsert. tenant_id is NOT NULL DEFAULT "" since 44-05.';
