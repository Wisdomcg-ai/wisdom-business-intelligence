-- Phase 28.1 fix-up: accumulate depreciation accounts as JSONB array
-- Real-world: orgs often have separate accumulated depreciation accounts
-- per asset class (vehicles, equipment, furniture, leasehold improvements).

-- Safe column rename + type change via add-new + migrate + drop-old pattern.
-- Note: cashflow_settings was just created in 20260418 and contains no real
-- data yet, so we can simplify — but using the safe pattern anyway.

-- Add the new multi-select column
ALTER TABLE cashflow_settings
  ADD COLUMN IF NOT EXISTS depreciation_accumulated_account_ids jsonb DEFAULT '[]';

-- Copy any existing single-ID values into the array form
UPDATE cashflow_settings
  SET depreciation_accumulated_account_ids =
    CASE
      WHEN depreciation_accumulated_account_id IS NOT NULL
      THEN jsonb_build_array(depreciation_accumulated_account_id)
      ELSE '[]'::jsonb
    END
  WHERE depreciation_accumulated_account_ids = '[]'::jsonb;

-- Drop the old single-ID column
ALTER TABLE cashflow_settings
  DROP COLUMN IF EXISTS depreciation_accumulated_account_id;
