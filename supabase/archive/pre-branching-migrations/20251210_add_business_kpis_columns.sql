-- Add missing columns to business_kpis table
-- These columns are needed by the KPI service for 3-year goal tracking

-- Add kpi_id column (references the KPI template ID)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_kpis' AND column_name = 'kpi_id'
  ) THEN
    ALTER TABLE business_kpis ADD COLUMN kpi_id TEXT;
  END IF;
END $$;

-- Add friendly_name column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_kpis' AND column_name = 'friendly_name'
  ) THEN
    ALTER TABLE business_kpis ADD COLUMN friendly_name TEXT;
  END IF;
END $$;

-- Add year1_target column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_kpis' AND column_name = 'year1_target'
  ) THEN
    ALTER TABLE business_kpis ADD COLUMN year1_target NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Add year2_target column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_kpis' AND column_name = 'year2_target'
  ) THEN
    ALTER TABLE business_kpis ADD COLUMN year2_target NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Add year3_target column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_kpis' AND column_name = 'year3_target'
  ) THEN
    ALTER TABLE business_kpis ADD COLUMN year3_target NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Create unique constraint for upsert operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_kpis_business_kpi_unique'
  ) THEN
    -- First ensure no duplicates exist
    DELETE FROM business_kpis a
    USING business_kpis b
    WHERE a.id < b.id
      AND a.business_id = b.business_id
      AND a.kpi_id = b.kpi_id
      AND a.kpi_id IS NOT NULL;

    -- Then add the constraint
    ALTER TABLE business_kpis
      ADD CONSTRAINT business_kpis_business_kpi_unique
      UNIQUE (business_id, kpi_id);
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add unique constraint: %', SQLERRM;
END $$;

-- Create index on kpi_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_business_kpis_kpi_id ON business_kpis(kpi_id);

COMMENT ON COLUMN business_kpis.kpi_id IS 'Reference ID to the KPI template from the library';
COMMENT ON COLUMN business_kpis.friendly_name IS 'User-friendly name for the KPI';
COMMENT ON COLUMN business_kpis.year1_target IS 'Target value for year 1';
COMMENT ON COLUMN business_kpis.year2_target IS 'Target value for year 2';
COMMENT ON COLUMN business_kpis.year3_target IS 'Target value for year 3';
