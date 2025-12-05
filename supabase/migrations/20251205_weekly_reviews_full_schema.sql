-- =====================================================
-- WEEKLY REVIEWS - FULL SCHEMA
-- =====================================================
-- Creates the weekly_reviews table with ALL required columns
-- Run this in Supabase SQL Editor

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add ALL columns needed by the application
-- Section 1: Look Back
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS energy_rating INTEGER;
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS week_rating INTEGER;
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS rating_reason TEXT DEFAULT '';
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS wins JSONB DEFAULT '[]';
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS challenges JSONB DEFAULT '[]';
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS key_learning TEXT DEFAULT '';
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS disciplines_completed JSONB DEFAULT '[]';

-- Section 2: Align
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS quarterly_revenue_target DECIMAL(15,2);
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS quarterly_gp_target DECIMAL(15,2);
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS quarterly_np_target DECIMAL(15,2);
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS rock_progress JSONB DEFAULT '[]';
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS alignment_notes TEXT DEFAULT '';

-- Section 3: Plan Forward
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS top_priorities JSONB DEFAULT '[]';
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS other_priorities JSONB DEFAULT '[]';
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS important_dates JSONB DEFAULT '[]';
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS stop_doing JSONB DEFAULT '[]';
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS start_doing JSONB DEFAULT '[]';
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS coach_questions JSONB DEFAULT '[]';

-- Legacy fields (for backward compatibility)
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS last_week_goals JSONB DEFAULT '[]';
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS completion_rate DECIMAL(5,2) DEFAULT 0;
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS next_week_goals JSONB DEFAULT '[]';

-- Status
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Multi-user support
ALTER TABLE public.weekly_reviews ADD COLUMN IF NOT EXISTS submitter_name TEXT;

-- Add weekly_review_enabled to business_users
ALTER TABLE public.business_users ADD COLUMN IF NOT EXISTS weekly_review_enabled BOOLEAN DEFAULT true;

-- Set default for existing records
UPDATE public.business_users SET weekly_review_enabled = true WHERE weekly_review_enabled IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_business_id ON public.weekly_reviews(business_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_id ON public.weekly_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_week_start ON public.weekly_reviews(week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_business_week ON public.weekly_reviews(business_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_week ON public.weekly_reviews(user_id, week_start_date);

-- Enable RLS
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

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

-- Create RLS policies
CREATE POLICY "weekly_reviews_select_policy" ON public.weekly_reviews
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id::text = weekly_reviews.business_id::text
      AND bu.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = weekly_reviews.business_id::text
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id::text = weekly_reviews.business_id::text
      AND b.assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "weekly_reviews_insert_policy" ON public.weekly_reviews
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "weekly_reviews_update_policy" ON public.weekly_reviews
  FOR UPDATE USING (
    user_id = auth.uid()
  );

CREATE POLICY "weekly_reviews_delete_policy" ON public.weekly_reviews
  FOR DELETE USING (
    user_id = auth.uid()
  );

-- Grant permissions
GRANT ALL ON public.weekly_reviews TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✓ weekly_reviews table schema complete';
  RAISE NOTICE '✓ All columns added for Look Back, Align, and Plan Forward sections';
  RAISE NOTICE '✓ RLS policies created';
END $$;
