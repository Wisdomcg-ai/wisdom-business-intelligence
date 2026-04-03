-- ============================================================================
-- FIX INFINITE RECURSION IN user_roles RLS POLICIES
-- The user_roles policies were querying user_roles itself, causing recursion
-- when financial_forecasts policies referenced user_roles.
-- ============================================================================

-- Drop the problematic policies on user_roles
DROP POLICY IF EXISTS "Business owners can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- Recreate with non-recursive logic
-- Users can always view their own roles (simple check, no recursion)
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can manage roles if they own the business (check businesses table, not user_roles)
CREATE POLICY "Business owners can manage roles"
  ON public.user_roles
  FOR ALL
  USING (
    -- Check if user is owner via business_profiles (not user_roles!)
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = user_roles.business_id
        AND bp.user_id = auth.uid()
    )
  );

-- Super admins can manage all roles (check profiles table for role, not user_roles)
CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- ============================================================================
-- Also fix financial_forecasts policies that reference user_roles
-- These can cause issues too - simplify to just check business ownership
-- ============================================================================

-- Drop problematic policies
DROP POLICY IF EXISTS "Users can view forecasts with role access" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Users can insert forecasts with appropriate role" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Users can update forecasts with appropriate role" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Only owners and admins can delete forecasts" ON public.financial_forecasts;

-- Recreate with simpler logic (avoid user_roles recursion)
-- Users can view forecasts for businesses they own OR are assigned as coach
CREATE POLICY "Users can view their forecasts"
  ON public.financial_forecasts
  FOR SELECT
  USING (
    -- Own business via business_profiles
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Coach assigned to business (via businesses table)
    EXISTS (
      SELECT 1 FROM public.businesses b
      JOIN public.business_profiles bp ON bp.business_id = b.id
      WHERE bp.id = financial_forecasts.business_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- Users can insert forecasts for their own businesses
CREATE POLICY "Users can insert their forecasts"
  ON public.financial_forecasts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = business_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- Users can update their own forecasts
CREATE POLICY "Users can update their forecasts"
  ON public.financial_forecasts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- Users can delete their own forecasts
CREATE POLICY "Users can delete their forecasts"
  ON public.financial_forecasts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.id = financial_forecasts.business_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- ============================================================================
-- Fix forecast_pl_lines policies too
-- ============================================================================

DROP POLICY IF EXISTS "Users can view PL lines with role access" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can insert PL lines with appropriate role" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can update PL lines with appropriate role" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can delete PL lines with appropriate role" ON public.forecast_pl_lines;

-- Simplified policies for forecast_pl_lines
CREATE POLICY "Users can view their PL lines"
  ON public.forecast_pl_lines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY "Users can insert their PL lines"
  ON public.forecast_pl_lines
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY "Users can update their PL lines"
  ON public.forecast_pl_lines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE POLICY "Users can delete their PL lines"
  ON public.forecast_pl_lines
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- ============================================================================
-- Fix forecast_audit_log policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view audit logs for accessible forecasts" ON public.forecast_audit_log;

CREATE POLICY "Users can view their audit logs"
  ON public.forecast_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_audit_log.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );
