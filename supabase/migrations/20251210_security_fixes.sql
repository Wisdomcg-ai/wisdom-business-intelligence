-- =====================================================
-- SECURITY FIXES MIGRATION
-- Date: December 10, 2025
-- Purpose: Fix critical RLS policy vulnerabilities
-- =====================================================

-- =====================================================
-- 1. FIX TEAM_INVITES - Remove overly permissive policy
-- =====================================================
DROP POLICY IF EXISTS "Anyone can view invite by token" ON public.team_invites;

-- More restrictive policy - users can only view invites for their business or by their email
CREATE POLICY "Users can view their own team invites"
  ON public.team_invites FOR SELECT
  USING (
    -- User can see invites sent to their email
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR
    -- Or invites for businesses they belong to
    business_id IN (
      SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
    )
    OR
    -- Or if user is assigned coach
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    -- Or if user is super_admin
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 2. FIX PROCESS_FLOWS - Restrict to admins only
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can view process flows" ON public.process_flows;
DROP POLICY IF EXISTS "Authenticated users can manage process flows" ON public.process_flows;

-- Read-only for all authenticated users
CREATE POLICY "Authenticated users can view process flows"
  ON public.process_flows FOR SELECT TO authenticated
  USING (true);

-- Write access only for super_admins
CREATE POLICY "Admins can manage process flows"
  ON public.process_flows FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Admins can update process flows"
  ON public.process_flows FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Admins can delete process flows"
  ON public.process_flows FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 3. FIX PROCESS_PHASES - Restrict to admins only
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can view process phases" ON public.process_phases;
DROP POLICY IF EXISTS "Authenticated users can manage process phases" ON public.process_phases;

-- Read-only for all authenticated users
CREATE POLICY "Authenticated users can view process phases"
  ON public.process_phases FOR SELECT TO authenticated
  USING (true);

-- Write access only for super_admins
CREATE POLICY "Admins can manage process phases"
  ON public.process_phases FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Admins can update process phases"
  ON public.process_phases FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Admins can delete process phases"
  ON public.process_phases FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 4. FIX SYSTEM_ROLES - Protect against role escalation
-- =====================================================
-- Users can only view their own role (already exists)
-- But we need to prevent users from modifying roles

-- Only service role can insert system_roles (via API routes)
DROP POLICY IF EXISTS "Service role can manage system roles" ON public.system_roles;

-- Block all direct inserts (must go through API with service role)
CREATE POLICY "Block direct system_roles insert"
  ON public.system_roles FOR INSERT
  WITH CHECK (false);

-- Block all direct updates
CREATE POLICY "Block direct system_roles update"
  ON public.system_roles FOR UPDATE
  USING (false);

-- Block all direct deletes
CREATE POLICY "Block direct system_roles delete"
  ON public.system_roles FOR DELETE
  USING (false);

-- =====================================================
-- 5. ADD UNIQUE CONSTRAINT to prevent duplicate profiles
-- =====================================================
-- This prevents the duplicate business_profiles issue we found
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_business_profile_per_business'
  ) THEN
    -- First, clean up any duplicates (keep the oldest one)
    DELETE FROM public.business_profiles a
    USING public.business_profiles b
    WHERE a.business_id = b.business_id
    AND a.created_at > b.created_at;

    -- Then add the constraint
    ALTER TABLE public.business_profiles
    ADD CONSTRAINT unique_business_profile_per_business
    UNIQUE (business_id);
  END IF;
END $$;

-- =====================================================
-- 6. ADD INDEX for better query performance on auth checks
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_system_roles_user_role ON public.system_roles(user_id, role);
CREATE INDEX IF NOT EXISTS idx_businesses_owner_coach ON public.businesses(owner_id, assigned_coach_id);

-- =====================================================
-- DONE - Run this migration in Supabase SQL Editor
-- =====================================================
