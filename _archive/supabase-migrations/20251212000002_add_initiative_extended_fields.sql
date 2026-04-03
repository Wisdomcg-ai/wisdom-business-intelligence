-- Migration: Add extended fields for initiatives (milestones, tasks, etc.)
-- These fields are needed for the 90-day sprint planning functionality

-- Add extended fields to strategic_initiatives table
DO $$
BEGIN
  -- Add milestones column (JSONB for storing array of milestones)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'strategic_initiatives' AND column_name = 'milestones') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN milestones JSONB;
    COMMENT ON COLUMN strategic_initiatives.milestones IS 'JSON array of project milestones with id, description, targetDate, isCompleted';
  END IF;

  -- Add tasks column (JSONB for storing array of tasks)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'strategic_initiatives' AND column_name = 'tasks') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN tasks JSONB;
    COMMENT ON COLUMN strategic_initiatives.tasks IS 'JSON array of tasks with id, title, status, assignedTo, minutesAllocated';
  END IF;

  -- Add why column (text explanation of why this initiative matters)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'strategic_initiatives' AND column_name = 'why') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN why TEXT;
    COMMENT ON COLUMN strategic_initiatives.why IS 'Explanation of why this initiative is important';
  END IF;

  -- Add outcome column (expected outcome/success criteria)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'strategic_initiatives' AND column_name = 'outcome') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN outcome TEXT;
    COMMENT ON COLUMN strategic_initiatives.outcome IS 'Expected outcome or success criteria for this initiative';
  END IF;

  -- Add start_date column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'strategic_initiatives' AND column_name = 'start_date') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN start_date DATE;
    COMMENT ON COLUMN strategic_initiatives.start_date IS 'Planned start date for this initiative';
  END IF;

  -- Add end_date column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'strategic_initiatives' AND column_name = 'end_date') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN end_date DATE;
    COMMENT ON COLUMN strategic_initiatives.end_date IS 'Planned end date for this initiative';
  END IF;

  -- Add total_hours column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'strategic_initiatives' AND column_name = 'total_hours') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN total_hours NUMERIC(10,2);
    COMMENT ON COLUMN strategic_initiatives.total_hours IS 'Total estimated hours for all tasks in this initiative';
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_start_date
  ON strategic_initiatives(start_date) WHERE start_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_end_date
  ON strategic_initiatives(end_date) WHERE end_date IS NOT NULL;
