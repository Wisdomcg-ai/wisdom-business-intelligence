-- Add idea_type column to strategic_initiatives table
-- This distinguishes between strategic (one-off projects) and operational (recurring activities) ideas
-- Default to 'strategic' so all existing data is preserved and workflows continue working

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategic_initiatives' AND column_name = 'idea_type'
  ) THEN
    ALTER TABLE strategic_initiatives
    ADD COLUMN idea_type TEXT DEFAULT 'strategic'
    CHECK (idea_type IN ('strategic', 'operational'));

    RAISE NOTICE 'Added idea_type column to strategic_initiatives';
  ELSE
    RAISE NOTICE 'idea_type column already exists';
  END IF;
END $$;

-- Create index for filtering by idea_type (used in Steps 3, 4, 5)
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_idea_type
ON strategic_initiatives(idea_type);

-- Add comment explaining the column
COMMENT ON COLUMN strategic_initiatives.idea_type IS 'Type of idea: strategic (one-off projects) or operational (recurring activities). Strategic ideas flow through Steps 3-6 planning. Operational ideas auto-populate in Step 5 operational plan.';
