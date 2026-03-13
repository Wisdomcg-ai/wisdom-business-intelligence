-- Fix Quarterly Reviews RLS Policies
-- Problem: UPDATE/INSERT/DELETE only allow business owner, not the review creator or coach
-- Fix: Add user_id = auth.uid() check + coach access for UPDATE

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Users can insert own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Users can update own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Users can delete own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Coaches can view client quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Coaches can update client quarterly reviews" ON public.quarterly_reviews;

-- SELECT: user who created the review OR business owner OR assigned coach
CREATE POLICY "Users can view own quarterly reviews" ON public.quarterly_reviews
  FOR SELECT USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "Coaches can view client quarterly reviews" ON public.quarterly_reviews
  FOR SELECT USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE assigned_coach_id = auth.uid()
    )
  );

-- INSERT: review creator (user_id matches) OR business owner
CREATE POLICY "Users can insert own quarterly reviews" ON public.quarterly_reviews
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

-- UPDATE: review creator OR business owner OR assigned coach
CREATE POLICY "Users can update own quarterly reviews" ON public.quarterly_reviews
  FOR UPDATE USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "Coaches can update client quarterly reviews" ON public.quarterly_reviews
  FOR UPDATE USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE assigned_coach_id = auth.uid()
    )
  );

-- DELETE: review creator OR business owner
CREATE POLICY "Users can delete own quarterly reviews" ON public.quarterly_reviews
  FOR DELETE USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );
