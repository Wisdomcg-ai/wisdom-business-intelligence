-- =====================================================
-- DIAGNOSTIC: Check Client Data Linkage Issues
-- Run this in Supabase SQL Editor to identify why
-- some clients aren't showing data in the coach dashboard
-- =====================================================

-- 1. List all businesses assigned to coaches and their data linkage status
SELECT
  b.id as business_id,
  b.business_name,
  b.assigned_coach_id,
  b.owner_id,
  b.status,
  CASE WHEN b.owner_id IS NULL THEN 'MISSING owner_id' ELSE 'OK' END as owner_link_status,
  CASE WHEN bp.id IS NULL THEN 'MISSING profile' ELSE 'OK' END as profile_status,
  bp.id as business_profile_id,
  bp.annual_revenue,
  bp.industry
FROM businesses b
LEFT JOIN business_profiles bp ON bp.business_id = b.id
WHERE b.assigned_coach_id IS NOT NULL
ORDER BY b.business_name;

-- 2. Check if owner_id values actually exist in users table
SELECT
  b.id as business_id,
  b.business_name,
  b.owner_id,
  u.id as user_exists,
  u.email as owner_email
FROM businesses b
LEFT JOIN auth.users u ON u.id = b.owner_id
WHERE b.assigned_coach_id IS NOT NULL
  AND b.owner_id IS NOT NULL
ORDER BY b.business_name;

-- 3. Find business_profiles that might belong to your clients but aren't linked
SELECT
  bp.id,
  bp.business_id,
  bp.user_id,
  bp.business_name,
  bp.company_name,
  bp.annual_revenue,
  CASE
    WHEN bp.business_id IS NULL THEN 'NEEDS business_id linkage'
    ELSE 'Linked to business'
  END as linkage_status
FROM business_profiles bp
ORDER BY bp.business_name;

-- 4. Check assessments - which users have assessments?
SELECT
  a.user_id,
  u.email,
  COUNT(*) as assessment_count,
  MAX(a.created_at) as latest_assessment
FROM assessments a
JOIN auth.users u ON u.id = a.user_id
WHERE a.status = 'completed'
GROUP BY a.user_id, u.email
ORDER BY latest_assessment DESC;

-- 5. Check weekly_reviews - which businesses have reviews?
SELECT
  wr.business_id,
  b.business_name,
  COUNT(*) as review_count,
  MAX(wr.completed_at) as latest_review
FROM weekly_reviews wr
JOIN businesses b ON b.id = wr.business_id
GROUP BY wr.business_id, b.business_name
ORDER BY latest_review DESC;

-- =====================================================
-- FIX QUERIES (run after identifying issues above)
-- =====================================================

-- Fix 1: If a business_profile exists by user_id but not business_id,
-- update it to link properly (replace UUIDs with actual values)
--
-- UPDATE business_profiles
-- SET business_id = 'actual-business-uuid'
-- WHERE user_id = 'user-uuid-from-owner_id'
--   AND business_id IS NULL;

-- Fix 2: If owner_id is missing on a business, set it
-- (replace UUIDs with actual values)
--
-- UPDATE businesses
-- SET owner_id = 'user-uuid-that-owns-this-business'
-- WHERE id = 'business-uuid'
--   AND owner_id IS NULL;

-- Fix 3: Link a business_profile to its business
--
-- UPDATE business_profiles
-- SET business_id = 'business-uuid'
-- WHERE id = 'profile-uuid';
