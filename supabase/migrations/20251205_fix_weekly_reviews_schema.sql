-- =====================================================
-- FIX WEEKLY REVIEWS SCHEMA - ADD MISSING COLUMNS
-- =====================================================
-- Adds columns that are used in the code but missing from the database

-- Add alignment_notes column (used for strategic alignment notes)
ALTER TABLE public.weekly_reviews
  ADD COLUMN IF NOT EXISTS alignment_notes TEXT DEFAULT '';

-- Add submitter_name column (for multi-user support - shows who submitted)
ALTER TABLE public.weekly_reviews
  ADD COLUMN IF NOT EXISTS submitter_name TEXT;

-- Add weekly_review_enabled to business_users (for toggling weekly review per team member)
ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS weekly_review_enabled BOOLEAN DEFAULT true;

-- Ensure all existing business owners have weekly_review_enabled = true
UPDATE public.business_users
SET weekly_review_enabled = true
WHERE weekly_review_enabled IS NULL;

-- Add unique constraint for multi-user reviews if it doesn't exist
-- This allows each user to have their own review per week per business
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'weekly_reviews_business_user_week_unique'
  ) THEN
    -- First drop the old constraint if it exists
    ALTER TABLE public.weekly_reviews
      DROP CONSTRAINT IF EXISTS weekly_reviews_business_week_unique;

    -- Add the new constraint
    ALTER TABLE public.weekly_reviews
      ADD CONSTRAINT weekly_reviews_business_user_week_unique
      UNIQUE (business_id, user_id, week_start_date);
  END IF;
END $$;

-- Create indexes for faster team review queries
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_business_week
  ON public.weekly_reviews(business_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_week
  ON public.weekly_reviews(user_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_business_users_weekly_review
  ON public.business_users(business_id, weekly_review_enabled);

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Weekly reviews schema fixed';
  RAISE NOTICE '✓ Added columns: alignment_notes, submitter_name';
  RAISE NOTICE '✓ Added weekly_review_enabled to business_users';
  RAISE NOTICE '✓ Added unique constraint for multi-user reviews';
END $$;
