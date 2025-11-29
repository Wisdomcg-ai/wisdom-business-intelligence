-- Fix RLS Policies for Stop Doing List Tables
-- The original policies used subqueries which can cause issues
-- Simplified to directly check user_id = auth.uid()

-- ============================================
-- Drop existing policies
-- ============================================

-- Time logs
DROP POLICY IF EXISTS "Users can view own time logs" ON public.stop_doing_time_logs;
DROP POLICY IF EXISTS "Users can insert own time logs" ON public.stop_doing_time_logs;
DROP POLICY IF EXISTS "Users can update own time logs" ON public.stop_doing_time_logs;
DROP POLICY IF EXISTS "Users can delete own time logs" ON public.stop_doing_time_logs;

-- Hourly rates
DROP POLICY IF EXISTS "Users can view own hourly rates" ON public.stop_doing_hourly_rates;
DROP POLICY IF EXISTS "Users can insert own hourly rates" ON public.stop_doing_hourly_rates;
DROP POLICY IF EXISTS "Users can update own hourly rates" ON public.stop_doing_hourly_rates;
DROP POLICY IF EXISTS "Users can delete own hourly rates" ON public.stop_doing_hourly_rates;

-- Activities
DROP POLICY IF EXISTS "Users can view own activities" ON public.stop_doing_activities;
DROP POLICY IF EXISTS "Users can insert own activities" ON public.stop_doing_activities;
DROP POLICY IF EXISTS "Users can update own activities" ON public.stop_doing_activities;
DROP POLICY IF EXISTS "Users can delete own activities" ON public.stop_doing_activities;

-- Stop doing items
DROP POLICY IF EXISTS "Users can view own stop doing items" ON public.stop_doing_items;
DROP POLICY IF EXISTS "Users can insert own stop doing items" ON public.stop_doing_items;
DROP POLICY IF EXISTS "Users can update own stop doing items" ON public.stop_doing_items;
DROP POLICY IF EXISTS "Users can delete own stop doing items" ON public.stop_doing_items;

-- ============================================
-- Create simplified RLS policies
-- ============================================

-- Time logs
CREATE POLICY "Users can view own time logs" ON public.stop_doing_time_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own time logs" ON public.stop_doing_time_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own time logs" ON public.stop_doing_time_logs
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own time logs" ON public.stop_doing_time_logs
  FOR DELETE USING (user_id = auth.uid());

-- Hourly rates
CREATE POLICY "Users can view own hourly rates" ON public.stop_doing_hourly_rates
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own hourly rates" ON public.stop_doing_hourly_rates
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own hourly rates" ON public.stop_doing_hourly_rates
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own hourly rates" ON public.stop_doing_hourly_rates
  FOR DELETE USING (user_id = auth.uid());

-- Activities
CREATE POLICY "Users can view own activities" ON public.stop_doing_activities
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own activities" ON public.stop_doing_activities
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own activities" ON public.stop_doing_activities
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own activities" ON public.stop_doing_activities
  FOR DELETE USING (user_id = auth.uid());

-- Stop doing items
CREATE POLICY "Users can view own stop doing items" ON public.stop_doing_items
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own stop doing items" ON public.stop_doing_items
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own stop doing items" ON public.stop_doing_items
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own stop doing items" ON public.stop_doing_items
  FOR DELETE USING (user_id = auth.uid());
