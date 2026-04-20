-- Migration: Add business_id to ideas table and backfill all shared board tables
-- Date: 2026-02-03
-- Phase 3A: Foundation for shared boards

-- ============================================================================
-- PART 1: IDEAS TABLE
-- ============================================================================

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

-- Add comment for documentation
COMMENT ON COLUMN ideas.business_id IS 'Links idea to business for shared board functionality. Added Phase 3.';

-- ============================================================================
-- PART 2: BACKFILL ISSUES_LIST (column already exists, just needs data)
-- ============================================================================

-- Backfill issues_list - first try business_users (team members)
UPDATE issues_list i
SET business_id = (
  SELECT bu.business_id
  FROM business_users bu
  WHERE bu.user_id = i.user_id
  AND bu.status = 'active'
  LIMIT 1
)
WHERE i.business_id IS NULL;

-- Backfill remaining issues_list - try owner_id lookup
UPDATE issues_list i
SET business_id = (
  SELECT b.id
  FROM businesses b
  WHERE b.owner_id = i.user_id
  LIMIT 1
)
WHERE i.business_id IS NULL;

-- ============================================================================
-- PART 3: BACKFILL OPEN_LOOPS (column already exists, just needs data)
-- ============================================================================

-- Backfill open_loops - first try business_users (team members)
UPDATE open_loops o
SET business_id = (
  SELECT bu.business_id
  FROM business_users bu
  WHERE bu.user_id = o.user_id
  AND bu.status = 'active'
  LIMIT 1
)
WHERE o.business_id IS NULL;

-- Backfill remaining open_loops - try owner_id lookup
UPDATE open_loops o
SET business_id = (
  SELECT b.id
  FROM businesses b
  WHERE b.owner_id = o.user_id
  LIMIT 1
)
WHERE o.business_id IS NULL;

-- ============================================================================
-- PART 4: UPDATE IDEAS RLS TO USE BUSINESS_ID (for shared board access)
-- ============================================================================

-- Drop old user_id based policies
DROP POLICY IF EXISTS "ideas_select_consolidated" ON ideas;
DROP POLICY IF EXISTS "ideas_insert_final" ON ideas;
DROP POLICY IF EXISTS "ideas_update_consolidated" ON ideas;
DROP POLICY IF EXISTS "ideas_delete_consolidated" ON ideas;

-- Create new business_id based policies (matching issues_list/open_loops pattern)
CREATE POLICY "ideas_select" ON ideas FOR SELECT TO authenticated
USING (
  (business_id = ANY (rls_user_all_businesses()))
  OR (SELECT rls_is_super_admin())
);

CREATE POLICY "ideas_insert" ON ideas FOR INSERT TO authenticated
WITH CHECK (
  (business_id = ANY (rls_user_all_businesses()))
  OR (SELECT rls_is_super_admin())
);

CREATE POLICY "ideas_update" ON ideas FOR UPDATE TO authenticated
USING (
  (business_id = ANY (rls_user_all_businesses()))
  OR (SELECT rls_is_super_admin())
)
WITH CHECK (
  (business_id = ANY (rls_user_all_businesses()))
  OR (SELECT rls_is_super_admin())
);

CREATE POLICY "ideas_delete" ON ideas FOR DELETE TO authenticated
USING (
  (business_id = ANY (rls_user_all_businesses()))
  OR (SELECT rls_is_super_admin())
);
