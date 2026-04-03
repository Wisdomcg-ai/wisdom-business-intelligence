-- =====================================================
-- TEAM MEMBERS / MULTI-USER ACCESS
-- =====================================================
-- Allows multiple users to access the same business

-- Update business_users table to add role options
ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

-- Add constraint for valid roles (if not exists, drop and recreate)
ALTER TABLE public.business_users DROP CONSTRAINT IF EXISTS business_users_role_check;
ALTER TABLE public.business_users
  ADD CONSTRAINT business_users_role_check
  CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

-- Add invited_by and invited_at columns for tracking
ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_business_users_business_id ON public.business_users(business_id);
CREATE INDEX IF NOT EXISTS idx_business_users_user_id ON public.business_users(user_id);

-- Update RLS policies for business_users
DROP POLICY IF EXISTS "Users can view their business associations" ON public.business_users;
DROP POLICY IF EXISTS "Business owners and admins can manage team" ON public.business_users;
DROP POLICY IF EXISTS "Coaches can view client team members" ON public.business_users;

-- Users can view team members of businesses they belong to
CREATE POLICY "Users can view business team members"
  ON public.business_users FOR SELECT
  USING (
    -- User is a member of this business
    business_id IN (
      SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
    )
    OR
    -- User is the coach assigned to this business
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
    -- User is owner or admin of this business
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = business_users.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin')
    )
    OR
    -- Coach can add team members to their assigned clients
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_users.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- Owners and admins can update team members (change roles, etc)
CREATE POLICY "Owners and admins can update team members"
  ON public.business_users FOR UPDATE
  USING (
    -- User is owner or admin of this business
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = business_users.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin')
    )
    OR
    -- Coach can update team members
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
    -- User is owner of this business and not deleting themselves
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = business_users.business_id
      AND bu.user_id = auth.uid()
      AND bu.role = 'owner'
    )
    AND user_id != auth.uid()
  );
