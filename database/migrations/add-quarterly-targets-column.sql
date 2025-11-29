-- Add quarterly_targets JSONB column to business_financial_goals table
-- This stores the quarterly breakdown of financial and KPI targets

-- Add the column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'business_financial_goals'
    AND column_name = 'quarterly_targets'
  ) THEN
    ALTER TABLE business_financial_goals
    ADD COLUMN quarterly_targets JSONB DEFAULT '{}'::jsonb;

    RAISE NOTICE 'Added quarterly_targets column to business_financial_goals table';
  ELSE
    RAISE NOTICE 'quarterly_targets column already exists in business_financial_goals table';
  END IF;
END $$;

-- Add a comment to document the structure
COMMENT ON COLUMN business_financial_goals.quarterly_targets IS
'Stores quarterly breakdown of targets. Structure: { "metricName": { "q1": "value", "q2": "value", "q3": "value", "q4": "value" } }';
