-- =====================================================
-- FIX FORECAST CHILD TABLES RLS - ADD OWNER ACCESS VIA BUSINESSES TABLE
-- =====================================================
-- Same issue as financial_forecasts: the RLS policies need to check
-- ownership via businesses.owner_id, not just business_profiles.user_id
-- =====================================================

-- =====================================================
-- 1. FORECAST_PL_LINES - Add owner access via businesses.owner_id
-- =====================================================

DROP POLICY IF EXISTS "Users can view PL lines" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can insert PL lines" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can update PL lines" ON public.forecast_pl_lines;
DROP POLICY IF EXISTS "Users can delete PL lines" ON public.forecast_pl_lines;

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
    -- Owner via businesses.owner_id (when forecast.business_id = businesses.id)
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON f.business_id = b.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND b.owner_id = auth.uid()
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
    -- Owner via businesses.owner_id
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON f.business_id = b.id
      WHERE f.id = forecast_id
        AND b.owner_id = auth.uid()
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
    -- Owner via businesses.owner_id
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON f.business_id = b.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND b.owner_id = auth.uid()
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
    -- Owner via business_profiles
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Owner via businesses.owner_id
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON f.business_id = b.id
      WHERE f.id = forecast_pl_lines.forecast_id
        AND b.owner_id = auth.uid()
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
-- 2. FORECAST_EMPLOYEES - Add owner access via businesses.owner_id
-- =====================================================

DROP POLICY IF EXISTS "Users can view employees" ON public.forecast_employees;
DROP POLICY IF EXISTS "Users can insert employees" ON public.forecast_employees;
DROP POLICY IF EXISTS "Users can update employees" ON public.forecast_employees;
DROP POLICY IF EXISTS "Users can delete employees" ON public.forecast_employees;

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
    -- Owner via businesses.owner_id
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON f.business_id = b.id
      WHERE f.id = forecast_employees.forecast_id
        AND b.owner_id = auth.uid()
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
    -- Owner via businesses.owner_id
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON f.business_id = b.id
      WHERE f.id = forecast_id
        AND b.owner_id = auth.uid()
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
    -- Owner via businesses.owner_id
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON f.business_id = b.id
      WHERE f.id = forecast_employees.forecast_id
        AND b.owner_id = auth.uid()
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
    -- Owner via business_profiles
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.business_profiles bp ON f.business_id = bp.id
      WHERE f.id = forecast_employees.forecast_id
        AND bp.user_id = auth.uid()
    )
    OR
    -- Owner via businesses.owner_id
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON f.business_id = b.id
      WHERE f.id = forecast_employees.forecast_id
        AND b.owner_id = auth.uid()
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
-- 3. FORECAST_PAYROLL_SUMMARY - Add owner access
-- =====================================================

DROP POLICY IF EXISTS "Users can manage payroll summary" ON public.forecast_payroll_summary;

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
    -- Owner via businesses.owner_id
    EXISTS (
      SELECT 1 FROM public.financial_forecasts f
      JOIN public.businesses b ON f.business_id = b.id
      WHERE f.id = forecast_payroll_summary.forecast_id
        AND b.owner_id = auth.uid()
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
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Forecast child tables RLS fixed with owner access via businesses.owner_id';
  RAISE NOTICE '   - forecast_pl_lines: Added businesses.owner_id check';
  RAISE NOTICE '   - forecast_employees: Added businesses.owner_id check';
  RAISE NOTICE '   - forecast_payroll_summary: Added businesses.owner_id check';
END $$;
