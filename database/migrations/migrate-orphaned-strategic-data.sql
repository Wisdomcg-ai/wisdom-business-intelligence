-- Migration: Recover orphaned strategic planning data
-- =====================================================
-- This migration fixes data that was saved with an incorrect business_id
--
-- User: summer@ohnine.com.au
-- User ID: 6a29e75b-f042-4c1c-873d-dd4830b4c55a
-- OLD business_id (orphaned): 47ddde06-1fdb-4a5c-894f-f9ffdbeaae6f
-- NEW business_id (correct): 6945110c-01c4-4e02-a8cb-bb0401247c8a

-- First, let's see what orphaned data exists
-- Run this SELECT first to see what will be migrated:

-- Check strategic_initiatives with old business_id
SELECT 'strategic_initiatives' as table_name, id, title, step_type, business_id, created_at
FROM strategic_initiatives
WHERE business_id = '47ddde06-1fdb-4a5c-894f-f9ffdbeaae6f';

-- Check sprint_key_actions with old business_id
SELECT 'sprint_key_actions' as table_name, id, action, business_id, created_at
FROM sprint_key_actions
WHERE business_id = '47ddde06-1fdb-4a5c-894f-f9ffdbeaae6f';

-- Check if there's any data for this user that's orphaned
SELECT 'strategic_initiatives_by_user' as table_name, id, title, step_type, business_id, created_at
FROM strategic_initiatives
WHERE user_id = '6a29e75b-f042-4c1c-873d-dd4830b4c55a'
  AND business_id != '6945110c-01c4-4e02-a8cb-bb0401247c8a';

SELECT 'sprint_key_actions_by_user' as table_name, id, action, business_id, created_at
FROM sprint_key_actions
WHERE user_id = '6a29e75b-f042-4c1c-873d-dd4830b4c55a'
  AND business_id != '6945110c-01c4-4e02-a8cb-bb0401247c8a';

-- =====================================================
-- MIGRATION COMMANDS (uncomment to run after reviewing)
-- =====================================================

-- Migrate strategic_initiatives from old to new business_id
-- UPDATE strategic_initiatives
-- SET business_id = '6945110c-01c4-4e02-a8cb-bb0401247c8a'
-- WHERE business_id = '47ddde06-1fdb-4a5c-894f-f9ffdbeaae6f';

-- Migrate sprint_key_actions from old to new business_id
-- UPDATE sprint_key_actions
-- SET business_id = '6945110c-01c4-4e02-a8cb-bb0401247c8a'
-- WHERE business_id = '47ddde06-1fdb-4a5c-894f-f9ffdbeaae6f';

-- Alternative: Migrate ALL data for this specific user to the correct business_id
-- UPDATE strategic_initiatives
-- SET business_id = '6945110c-01c4-4e02-a8cb-bb0401247c8a'
-- WHERE user_id = '6a29e75b-f042-4c1c-873d-dd4830b4c55a'
--   AND business_id != '6945110c-01c4-4e02-a8cb-bb0401247c8a';

-- UPDATE sprint_key_actions
-- SET business_id = '6945110c-01c4-4e02-a8cb-bb0401247c8a'
-- WHERE user_id = '6a29e75b-f042-4c1c-873d-dd4830b4c55a'
--   AND business_id != '6945110c-01c4-4e02-a8cb-bb0401247c8a';

-- Also fix the assigned_to values that reference the old business_id
-- UPDATE strategic_initiatives
-- SET assigned_to = REPLACE(assigned_to, '47ddde06-1fdb-4a5c-894f-f9ffdbeaae6f', '6945110c-01c4-4e02-a8cb-bb0401247c8a')
-- WHERE assigned_to LIKE '%47ddde06-1fdb-4a5c-894f-f9ffdbeaae6f%'
--   AND user_id = '6a29e75b-f042-4c1c-873d-dd4830b4c55a';
