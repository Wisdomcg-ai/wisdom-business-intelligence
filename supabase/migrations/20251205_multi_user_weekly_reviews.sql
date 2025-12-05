-- =====================================================
-- MULTI-USER WEEKLY REVIEWS
-- =====================================================
-- Enables multiple team members to complete weekly reviews
-- Allows business owners to toggle review access for team members
-- Coaches can see all team member reviews

-- 1. Add weekly_review_enabled to business_users table
-- This allows owners to enable/disable weekly reviews per team member
ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS weekly_review_enabled BOOLEAN DEFAULT true;

-- 2. Ensure weekly_reviews table has proper user tracking
-- The table already has user_id, but we need to ensure the unique constraint
-- allows multiple users per business per week

-- First drop any existing constraint that might conflict
ALTER TABLE public.weekly_reviews
  DROP CONSTRAINT IF EXISTS weekly_reviews_business_week_unique;

ALTER TABLE public.weekly_reviews
  DROP CONSTRAINT IF EXISTS weekly_reviews_business_user_week_unique;

-- Add unique constraint on business_id + user_id + week_start_date
-- This allows each user to have their own review per week
ALTER TABLE public.weekly_reviews
  ADD CONSTRAINT weekly_reviews_business_user_week_unique
  UNIQUE (business_id, user_id, week_start_date);

-- 3. Add submitter name for easier display (denormalized for performance)
ALTER TABLE public.weekly_reviews
  ADD COLUMN IF NOT EXISTS submitter_name TEXT;

-- 4. Update RLS policies for weekly_reviews to support team access

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Users can insert their own weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Users can update their own weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Users can delete their own weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "Coaches can view client weekly reviews" ON public.weekly_reviews;
DROP POLICY IF EXISTS "weekly_reviews_select_policy" ON public.weekly_reviews;
DROP POLICY IF EXISTS "weekly_reviews_insert_policy" ON public.weekly_reviews;
DROP POLICY IF EXISTS "weekly_reviews_update_policy" ON public.weekly_reviews;
DROP POLICY IF EXISTS "weekly_reviews_delete_policy" ON public.weekly_reviews;

-- Enable RLS
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can view reviews for businesses they're part of
-- This includes: their own reviews, team member reviews (if owner/admin), coach views
CREATE POLICY "weekly_reviews_select_policy"
  ON public.weekly_reviews FOR SELECT
  USING (
    -- User viewing their own review
    user_id = auth.uid()
    OR
    -- User is owner/admin of the business (can see all team reviews)
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = weekly_reviews.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin')
    )
    OR
    -- User is member of same business (can see other team members' reviews)
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = weekly_reviews.business_id
      AND bu.user_id = auth.uid()
      AND bu.status = 'active'
    )
    OR
    -- Coach assigned to this business
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = weekly_reviews.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- INSERT: Users can create reviews if they're enabled for weekly reviews
CREATE POLICY "weekly_reviews_insert_policy"
  ON public.weekly_reviews FOR INSERT
  WITH CHECK (
    -- User must be inserting for themselves
    user_id = auth.uid()
    AND
    (
      -- User is an active member with weekly reviews enabled
      EXISTS (
        SELECT 1 FROM public.business_users bu
        WHERE bu.business_id = weekly_reviews.business_id
        AND bu.user_id = auth.uid()
        AND bu.status = 'active'
        AND bu.weekly_review_enabled = true
      )
      OR
      -- Or user is the business owner (via businesses table)
      EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = weekly_reviews.business_id
        AND b.owner_id = auth.uid()
      )
    )
  );

-- UPDATE: Users can update their own reviews
CREATE POLICY "weekly_reviews_update_policy"
  ON public.weekly_reviews FOR UPDATE
  USING (
    user_id = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- DELETE: Users can delete their own reviews, owners can delete any
CREATE POLICY "weekly_reviews_delete_policy"
  ON public.weekly_reviews FOR DELETE
  USING (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = weekly_reviews.business_id
      AND bu.user_id = auth.uid()
      AND bu.role = 'owner'
    )
  );

-- 5. Create index for faster team review queries
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_business_week
  ON public.weekly_reviews(business_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_week
  ON public.weekly_reviews(user_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_business_users_weekly_review
  ON public.business_users(business_id, weekly_review_enabled);

-- 6. Ensure business owners have weekly_review_enabled = true by default
UPDATE public.business_users
SET weekly_review_enabled = true
WHERE role = 'owner' AND weekly_review_enabled IS NULL;

-- 7. Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_reviews TO authenticated;
