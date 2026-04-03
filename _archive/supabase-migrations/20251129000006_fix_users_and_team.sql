-- =====================================================
-- FIX USERS TABLE AND TEAM MEMBERS ACCESS
-- =====================================================
-- Run this to fix RLS policies and add missing columns

-- 0. First ensure business_users has an id column (primary key)
-- Check if it exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'business_users'
    AND column_name = 'id'
  ) THEN
    ALTER TABLE public.business_users ADD COLUMN id UUID DEFAULT gen_random_uuid();
    ALTER TABLE public.business_users ADD PRIMARY KEY (id);
  END IF;
END $$;

-- 1. Add last_login_at column to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 2. Add INSERT policy for users table (allows upsert for login tracking)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
CREATE POLICY "Users can insert their own profile"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 3. Allow coaches to view their clients' user records
DROP POLICY IF EXISTS "Coaches can view client users" ON public.users;
CREATE POLICY "Coaches can view client users"
  ON public.users FOR SELECT
  USING (
    -- User viewing their own record
    auth.uid() = id
    OR
    -- Coach viewing users who belong to businesses they coach
    EXISTS (
      SELECT 1 FROM public.businesses b
      JOIN public.business_users bu ON bu.business_id = b.id
      WHERE b.assigned_coach_id = auth.uid()
      AND bu.user_id = users.id
    )
    OR
    -- Admin can view all
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- 4. Team members additions to business_users table
ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

ALTER TABLE public.business_users DROP CONSTRAINT IF EXISTS business_users_role_check;
ALTER TABLE public.business_users
  ADD CONSTRAINT business_users_role_check
  CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE public.business_users DROP CONSTRAINT IF EXISTS business_users_status_check;
ALTER TABLE public.business_users
  ADD CONSTRAINT business_users_status_check
  CHECK (status IN ('pending', 'active', 'inactive'));

-- 5. Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_business_users_business_id ON public.business_users(business_id);
CREATE INDEX IF NOT EXISTS idx_business_users_user_id ON public.business_users(user_id);

-- 6. Update RLS policies for business_users
DROP POLICY IF EXISTS "Users can view their business associations" ON public.business_users;
DROP POLICY IF EXISTS "Business owners and admins can manage team" ON public.business_users;
DROP POLICY IF EXISTS "Coaches can view client team members" ON public.business_users;
DROP POLICY IF EXISTS "Users can view business team members" ON public.business_users;
DROP POLICY IF EXISTS "Owners and admins can add team members" ON public.business_users;
DROP POLICY IF EXISTS "Owners and admins can update team members" ON public.business_users;
DROP POLICY IF EXISTS "Owners can remove team members" ON public.business_users;

-- Users can view team members of businesses they belong to
CREATE POLICY "Users can view business team members"
  ON public.business_users FOR SELECT
  USING (
    business_id IN (
      SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- Owners and admins can add team members
CREATE POLICY "Owners and admins can add team members"
  ON public.business_users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = business_users.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Allow owner to add themselves
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.owner_id = auth.uid()
    )
  );

-- Owners and admins can update team members
CREATE POLICY "Owners and admins can update team members"
  ON public.business_users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = business_users.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- Owners can remove team members (not themselves)
CREATE POLICY "Owners can remove team members"
  ON public.business_users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = business_users.business_id
      AND bu.user_id = auth.uid()
      AND bu.role = 'owner'
    )
    AND user_id != auth.uid()
  );

-- 7. Update existing rows to have proper defaults
UPDATE public.business_users
SET role = 'owner'
WHERE role IS NULL;

UPDATE public.business_users
SET status = 'active'
WHERE status IS NULL;

UPDATE public.business_users
SET invited_at = created_at
WHERE invited_at IS NULL AND created_at IS NOT NULL;

UPDATE public.business_users
SET invited_at = NOW()
WHERE invited_at IS NULL;
