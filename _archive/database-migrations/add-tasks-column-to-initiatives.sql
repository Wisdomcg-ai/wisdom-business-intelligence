-- Add tasks column to strategic_initiatives table
-- This stores the task breakdown (subtasks) for each initiative as JSONB

ALTER TABLE strategic_initiatives
ADD COLUMN IF NOT EXISTS tasks JSONB DEFAULT '[]';

-- Add comment explaining the column
COMMENT ON COLUMN strategic_initiatives.tasks IS 'Array of subtasks for this initiative. Each task has: id, name, owner, dueDate, status, minutesAllocated';
