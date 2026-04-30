-- Phase 44.2 Plan 06A.5 — natural key cutover + account_id NOT NULL promotion
--
-- Atomic transaction: pre-flight assert all rows have account_id, then drop the old
-- (..., account_code, period_month) natural key, create the new (..., account_id, period_month)
-- natural key, promote account_id NOT NULL. Failure at any step rolls back the whole migration.
--
-- Prerequisite: scripts/backfill-xero-accounts-catalog.ts has been run successfully
-- against production. account_id IS NOT NULL for every row; account_code holds the
-- user-facing Xero Code (sourced from xero_accounts catalog) for rows where the
-- original Xero AccountID was captured (1808 rows as of 2026-04-30); SYNTH-AID rows
-- (4648 rows) keep their original account_code with notes='SYNTH-AID: ...' audit.

BEGIN;

-- Pre-flight: refuse to proceed if any row lacks account_id.
DO $preflight$
DECLARE
  v_unbackfilled int;
BEGIN
  SELECT count(*) INTO v_unbackfilled FROM xero_pl_lines WHERE account_id IS NULL;
  IF v_unbackfilled > 0 THEN
    RAISE EXCEPTION
      'Phase 44.2 06A.3 pre-flight: % xero_pl_lines rows have account_id IS NULL. Run scripts/backfill-xero-accounts-catalog.ts BEFORE this migration. Aborting.',
      v_unbackfilled;
  END IF;
END
$preflight$;

-- Drop the old natural key (account_code-based).
ALTER TABLE xero_pl_lines DROP CONSTRAINT IF EXISTS xero_pl_lines_natural_key_uniq;

-- Create the new natural key (account_id-based). Re-use the same constraint name.
ALTER TABLE xero_pl_lines
  ADD CONSTRAINT xero_pl_lines_natural_key_uniq
    UNIQUE (business_id, tenant_id, account_id, period_month);

-- Promote account_id to NOT NULL.
ALTER TABLE xero_pl_lines
  ALTER COLUMN account_id SET NOT NULL;

COMMIT;

-- Index for fast lookups by account_id alone (cross-tenant queries).
CREATE INDEX IF NOT EXISTS xero_pl_lines_account_id_idx
  ON xero_pl_lines (account_id);

COMMENT ON COLUMN xero_pl_lines.account_id IS
  'Phase 44.2 06A — Xero AccountID GUID. Canonical identity. NOT NULL since 20260430000003.';
COMMENT ON CONSTRAINT xero_pl_lines_natural_key_uniq ON xero_pl_lines IS
  'Phase 44.2 06A.3 — natural key migrated from (business_id, tenant_id, account_code, period_month) to (business_id, tenant_id, account_id, period_month). account_id is canonical; account_code is informational only.';
