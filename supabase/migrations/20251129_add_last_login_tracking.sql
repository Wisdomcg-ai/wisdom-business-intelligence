-- =====================================================
-- ADD LAST LOGIN TRACKING
-- =====================================================
-- Adds last_login_at column to users table for accurate activity tracking

-- Add last_login_at column to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_last_login ON public.users(last_login_at);

-- Allow coaches to view their clients' last login
DROP POLICY IF EXISTS "Coaches can view client users" ON public.users;
CREATE POLICY "Coaches can view client users"
  ON public.users FOR SELECT
  USING (
    -- User viewing their own profile
    auth.uid() = id
    OR
    -- Coach viewing their assigned clients
    EXISTS (
      SELECT 1 FROM public.businesses b
      JOIN public.business_users bu ON bu.business_id = b.id
      WHERE b.assigned_coach_id = auth.uid()
      AND bu.user_id = public.users.id
    )
    OR
    -- Coach viewing business owners
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.assigned_coach_id = auth.uid()
      AND b.owner_id = public.users.id
    )
  );
