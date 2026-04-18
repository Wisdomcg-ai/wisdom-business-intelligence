-- Phase 28.1 fix-up: accumulate depreciation accounts as JSONB array
-- Real-world: orgs often have separate accumulated depreciation accounts
-- per asset class (vehicles, equipment, furniture, leasehold improvements).
--
-- Idempotent: safe to re-run. The UPDATE only executes if the legacy
-- single-ID column still exists; otherwise it's skipped.

-- Add the new multi-select column
ALTER TABLE cashflow_settings
  ADD COLUMN IF NOT EXISTS depreciation_accumulated_account_ids jsonb DEFAULT '[]';

-- Copy any existing single-ID values into the array form (only if old column still exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cashflow_settings'
      AND column_name = 'depreciation_accumulated_account_id'
  ) THEN
    EXECUTE $sql$
      UPDATE cashflow_settings
        SET depreciation_accumulated_account_ids =
          CASE
            WHEN depreciation_accumulated_account_id IS NOT NULL
            THEN jsonb_build_array(depreciation_accumulated_account_id)
            ELSE '[]'::jsonb
          END
        WHERE depreciation_accumulated_account_ids = '[]'::jsonb
    $sql$;
  END IF;
END $$;

-- Drop the old single-ID column (idempotent)
ALTER TABLE cashflow_settings
  DROP COLUMN IF EXISTS depreciation_accumulated_account_id;
