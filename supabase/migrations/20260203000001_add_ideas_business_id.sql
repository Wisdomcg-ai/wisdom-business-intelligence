-- Migration: Add business_id to ideas table for shared board functionality
-- Date: 2026-02-03
-- Phase 3A: Foundation

-- Step 1: Add business_id column to ideas table
ALTER TABLE ideas
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

-- Step 2: Backfill existing ideas - first try business_users (team members)
UPDATE ideas i
SET business_id = (
  SELECT bu.business_id
  FROM business_users bu
  WHERE bu.user_id = i.user_id
  AND bu.status = 'active'
  LIMIT 1
)
WHERE i.business_id IS NULL;

-- Step 3: Backfill remaining ideas - try owner_id lookup
UPDATE ideas i
SET business_id = (
  SELECT b.id
  FROM businesses b
  WHERE b.owner_id = i.user_id
  LIMIT 1
)
WHERE i.business_id IS NULL;

-- Step 4: Create index for query performance
CREATE INDEX IF NOT EXISTS idx_ideas_business_id ON ideas(business_id);

-- Step 5: Update RLS policy to use business_id (if needed)
-- Note: Existing RLS uses user_id, we'll need separate RLS update for shared access

-- Add comment for documentation
COMMENT ON COLUMN ideas.business_id IS 'Links idea to business for shared board functionality. Added Phase 3.';
