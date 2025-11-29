-- Fix RLS policies to use owner_id instead of user_id
-- Run this to update existing policies

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Users can insert own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Users can update own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Users can delete own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Coaches can view client quarterly reviews" ON public.quarterly_reviews;

-- Recreate with correct owner_id column reference
CREATE POLICY "Users can view own quarterly reviews" ON public.quarterly_reviews
  FOR SELECT USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can insert own quarterly reviews" ON public.quarterly_reviews
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can update own quarterly reviews" ON public.quarterly_reviews
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can delete own quarterly reviews" ON public.quarterly_reviews
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "Coaches can view client quarterly reviews" ON public.quarterly_reviews
  FOR SELECT USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE assigned_coach_id = auth.uid()
    )
  );
