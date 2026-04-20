-- ============================================================================
-- RESTORE MISSING RLS HELPER FUNCTIONS
-- Migration: 20260320000001_restore_rls_helper_functions.sql
-- Date: 2026-03-20
--
-- ROOT CAUSE: The functions is_super_admin(), is_business_team_member(), and
-- has_direct_business_access() were dropped by an earlier migration
-- (20260127000001_rls_10_10_implementation.sql), but the RLS policies on
-- `businesses` (businesses_access_policy) and `business_users`
-- (business_users_access_policy) still reference them.
--
-- When these functions don't exist, ALL queries on businesses and
-- business_users fail, making every page appear empty for business owners.
--
-- FIX: Recreate the three SECURITY DEFINER helper functions so the existing
-- policies evaluate correctly again.
-- ============================================================================

-- 1. is_super_admin(uuid) — checks system_roles for super_admin role
CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_roles
    WHERE user_id = check_user_id
    AND role = 'super_admin'
  );
$$;

-- 2. is_business_team_member(uuid, uuid) — checks business_users for active membership
CREATE OR REPLACE FUNCTION public.is_business_team_member(check_user_id uuid, check_business_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_users
    WHERE business_id = check_business_id
    AND user_id = check_user_id
    AND status = 'active'
  );
$$;

-- 3. has_direct_business_access(uuid, uuid) — checks businesses for owner or coach
CREATE OR REPLACE FUNCTION public.has_direct_business_access(check_user_id uuid, check_business_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses
    WHERE id = check_business_id
    AND (owner_id = check_user_id OR assigned_coach_id = check_user_id)
  );
$$;
