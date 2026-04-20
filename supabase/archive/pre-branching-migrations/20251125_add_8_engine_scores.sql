-- Add 8 Business Engine score columns to assessments table
-- This migration adds columns for: Attract, Convert, Deliver, People, Systems, Finance, Leadership, Time

-- Add new engine score columns
ALTER TABLE assessments
ADD COLUMN IF NOT EXISTS attract_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS attract_max INTEGER DEFAULT 40,
ADD COLUMN IF NOT EXISTS convert_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS convert_max INTEGER DEFAULT 40,
ADD COLUMN IF NOT EXISTS deliver_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS deliver_max INTEGER DEFAULT 40,
ADD COLUMN IF NOT EXISTS people_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS people_max INTEGER DEFAULT 40,
ADD COLUMN IF NOT EXISTS systems_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS systems_max INTEGER DEFAULT 40,
ADD COLUMN IF NOT EXISTS finance_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS finance_max INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS leadership_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS leadership_max INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS time_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_max INTEGER DEFAULT 40;

-- Add indexes for faster queries on engine scores
CREATE INDEX IF NOT EXISTS idx_assessments_attract_score ON assessments(attract_score);
CREATE INDEX IF NOT EXISTS idx_assessments_convert_score ON assessments(convert_score);
CREATE INDEX IF NOT EXISTS idx_assessments_deliver_score ON assessments(deliver_score);
CREATE INDEX IF NOT EXISTS idx_assessments_people_score ON assessments(people_score);
CREATE INDEX IF NOT EXISTS idx_assessments_systems_score ON assessments(systems_score);
CREATE INDEX IF NOT EXISTS idx_assessments_finance_score ON assessments(finance_score);
CREATE INDEX IF NOT EXISTS idx_assessments_leadership_score ON assessments(leadership_score);
CREATE INDEX IF NOT EXISTS idx_assessments_time_score ON assessments(time_score);

-- Add comment explaining the new structure
COMMENT ON COLUMN assessments.attract_score IS '8 Business Engines Assessment - Attract Engine Score (max 40)';
COMMENT ON COLUMN assessments.convert_score IS '8 Business Engines Assessment - Convert Engine Score (max 40)';
COMMENT ON COLUMN assessments.deliver_score IS '8 Business Engines Assessment - Deliver Engine Score (max 40)';
COMMENT ON COLUMN assessments.people_score IS '8 Business Engines Assessment - People Engine Score (max 40)';
COMMENT ON COLUMN assessments.systems_score IS '8 Business Engines Assessment - Systems Engine Score (max 40)';
COMMENT ON COLUMN assessments.finance_score IS '8 Business Engines Assessment - Finance Engine Score (max 30)';
COMMENT ON COLUMN assessments.leadership_score IS '8 Business Engines Assessment - Leadership Engine Score (max 30)';
COMMENT ON COLUMN assessments.time_score IS '8 Business Engines Assessment - Time Engine Score (max 40)';
