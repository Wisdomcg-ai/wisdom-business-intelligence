-- Add assigned_to column to strategic_initiatives table
-- This stores the ID of the person (team member) assigned to the initiative

ALTER TABLE strategic_initiatives
ADD COLUMN IF NOT EXISTS assigned_to TEXT;

-- Add index for filtering by assignee
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_assigned_to
ON strategic_initiatives(business_id, assigned_to);
