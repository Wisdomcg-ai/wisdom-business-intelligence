-- =====================================================
-- FIX COACH RLS POLICIES FOR FORECAST_PL_LINES & FORECAST_EMPLOYEES
-- =====================================================
-- Issue: Coaches can't load forecast data because the PL lines and
-- employees tables don't have coach access policies.
--
-- The existing policies only check:
-- 1. business_profiles.user_id = auth.uid() (owner)
-- 2. super_admin
--
-- Missing: assigned_coach_id check
-- =====================================================

-- =====================================================
-- 1. FORECAST_PL_LINES - Add coach access
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their PL lines" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can insert their PL lines" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can update their PL lines" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can delete their PL lines" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Coaches can view client PL lines" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Coaches can manage client PL lines" ON public.forecast_pl_lines;

-- SELECT: Owners, coaches, and super admins
CREATE POLICY "Users can view PL lines"
  ON public.forecast_pl_lines
  FOR SELECT
  USING (
    -- Owner via business_profiles
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Coach assigned to business (forecast.business_id = business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Coach assigned to business (forecast.business_id = businesses.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON b.id = f.business_id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin via system_roles
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
  );

-- INSERT: Owners, coaches, and super admins
CREATE POLICY "Users can insert PL lines"
  ON public.forecast_pl_lines
  FOR INSERT
  WITH CHECK (
    -- Owner via business_profiles
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Coach assigned (via business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE f.id = forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Coach assigned (via businesses.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON b.id = f.business_id
      WHERE f.id = forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
  );

-- UPDATE: Owners, coaches, and super admins
CREATE POLICY "Users can update PL lines"
  ON public.forecast_pl_lines
  FOR UPDATE
  USING (
    -- Owner via business_profiles
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Coach assigned (via business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Coach assigned (via businesses.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON b.id = f.business_id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
  );

-- DELETE: Owners and super admins only (more restrictive)
CREATE POLICY "Users can delete PL lines"
  ON public.forecast_pl_lines
  FOR DELETE
  USING (
    -- Owner only
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
  );

-- =====================================================
-- 2. FORECAST_EMPLOYEES - Add coach access
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their employees" ON public.forecast_employees;
DROP POLICY IF EXISTS "Users can insert their employees" ON public.forecast_employees;
DROP POLICY IF EXISTS "Users can update their employees" ON public.forecast_employees;
DROP POLICY IF EXISTS "Users can delete their employees" ON public.forecast_employees;
DROP POLICY IF EXISTS "Coaches can view client employees" ON public.forecast_employees;
DROP POLICY IF EXISTS "Coaches can manage client employees" ON public.forecast_employees;

-- SELECT: Owners, coaches, and super admins
CREATE POLICY "Users can view employees"
  ON public.forecast_employees
  FOR SELECT
  USING (
    -- Owner via business_profiles
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_employees.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Coach assigned (via business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE f.id = forecast_employees.forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Coach assigned (via businesses.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON b.id = f.business_id
      WHERE f.id = forecast_employees.forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
  );

-- INSERT: Owners, coaches, and super admins
CREATE POLICY "Users can insert employees"
  ON public.forecast_employees
  FOR INSERT
  WITH CHECK (
    -- Owner via business_profiles
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Coach assigned (via business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE f.id = forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Coach assigned (via businesses.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON b.id = f.business_id
      WHERE f.id = forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
  );

-- UPDATE: Owners, coaches, and super admins
CREATE POLICY "Users can update employees"
  ON public.forecast_employees
  FOR UPDATE
  USING (
    -- Owner via business_profiles
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_employees.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Coach assigned (via business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE f.id = forecast_employees.forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Coach assigned (via businesses.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON b.id = f.business_id
      WHERE f.id = forecast_employees.forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
  );

-- DELETE: Owners and super admins only
CREATE POLICY "Users can delete employees"
  ON public.forecast_employees
  FOR DELETE
  USING (
    -- Owner only
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_employees.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
  );

-- =====================================================
-- 3. FORECAST_PAYROLL_SUMMARY - Add coach access
-- =====================================================

DROP POLICY IF EXISTS "Users can manage payroll summary" ON public.forecast_payroll_summary;
DROP POLICY IF EXISTS "Coaches can view client payroll summary" ON public.forecast_payroll_summary;

CREATE POLICY "Users can manage payroll summary"
  ON public.forecast_payroll_summary
  FOR ALL
  USING (
    -- Owner via business_profiles
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_payroll_summary.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Coach assigned (via business_profiles.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE f.id = forecast_payroll_summary.forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Coach assigned (via businesses.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON b.id = f.business_id
      WHERE f.id = forecast_payroll_summary.forecast_id
        AND b.assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
  );

-- =====================================================
-- 4. XERO_CONNECTIONS - Add coach SELECT access
-- =====================================================

DROP POLICY IF EXISTS "Users can view their Xero connections" ON public.xero_connections;
DROP POLICY IF EXISTS "Coaches can view client Xero connections" ON public.xero_connections;

CREATE POLICY "Users can view Xero connections"
  ON public.xero_connections
  FOR SELECT
  USING (
    -- Own business
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
    OR
    -- Coach assigned
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    -- Super admin
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
  );

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Coach RLS policies fixed for forecast child tables';
  RAISE NOTICE '   - forecast_pl_lines: Coaches can now SELECT/INSERT/UPDATE';
  RAISE NOTICE '   - forecast_employees: Coaches can now SELECT/INSERT/UPDATE';
  RAISE NOTICE '   - forecast_payroll_summary: Coaches can now manage';
  RAISE NOTICE '   - xero_connections: Coaches can now SELECT';
END $$;
