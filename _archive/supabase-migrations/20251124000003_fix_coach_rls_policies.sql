-- =====================================================
-- FIX COACH RLS POLICIES
-- =====================================================
-- Allow coaches to access their assigned clients' data at database level

-- =====================================================
-- 1. BUSINESSES TABLE - Coach Access
-- =====================================================

DROP POLICY IF EXISTS "Coaches can view assigned businesses" ON public.businesses;
DROP POLICY IF EXISTS "Coaches can update assigned businesses" ON public.businesses;

CREATE POLICY "Coaches can view assigned businesses" ON public.businesses
  FOR SELECT
  USING (
    assigned_coach_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    owner_id = auth.uid()
  );

CREATE POLICY "Coaches can update assigned businesses" ON public.businesses
  FOR UPDATE
  USING (
    assigned_coach_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 2. FINANCIAL FORECASTS - Coach Access (has business_id UUID)
-- =====================================================

DROP POLICY IF EXISTS "Coaches can view client forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Coaches can insert client forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Coaches can update client forecasts" ON public.financial_forecasts;
DROP POLICY IF EXISTS "Coaches can delete client forecasts" ON public.financial_forecasts;

CREATE POLICY "Coaches can view client forecasts" ON public.financial_forecasts
  FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can insert client forecasts" ON public.financial_forecasts
  FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can update client forecasts" ON public.financial_forecasts
  FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can delete client forecasts" ON public.financial_forecasts
  FOR DELETE
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 3. STRATEGIC INITIATIVES - Coach Access (has business_id UUID)
-- =====================================================

DROP POLICY IF EXISTS "Coaches can view strategic initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can insert strategic initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can update strategic initiatives" ON public.strategic_initiatives;
DROP POLICY IF EXISTS "Coaches can delete strategic initiatives" ON public.strategic_initiatives;

CREATE POLICY "Coaches can view strategic initiatives" ON public.strategic_initiatives
  FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can insert strategic initiatives" ON public.strategic_initiatives
  FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can update strategic initiatives" ON public.strategic_initiatives
  FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can delete strategic initiatives" ON public.strategic_initiatives
  FOR DELETE
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 4. BUSINESS FINANCIAL GOALS - Coach Access (has business_id TEXT)
-- =====================================================

DROP POLICY IF EXISTS "Coaches can view business financial goals" ON public.business_financial_goals;
DROP POLICY IF EXISTS "Coaches can insert business financial goals" ON public.business_financial_goals;
DROP POLICY IF EXISTS "Coaches can update business financial goals" ON public.business_financial_goals;
DROP POLICY IF EXISTS "Coaches can delete business financial goals" ON public.business_financial_goals;

CREATE POLICY "Coaches can view business financial goals" ON public.business_financial_goals
  FOR SELECT
  USING (
    business_id::uuid IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can insert business financial goals" ON public.business_financial_goals
  FOR INSERT
  WITH CHECK (
    business_id::uuid IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can update business financial goals" ON public.business_financial_goals
  FOR UPDATE
  USING (
    business_id::uuid IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can delete business financial goals" ON public.business_financial_goals
  FOR DELETE
  USING (
    business_id::uuid IN (
      SELECT id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 5. STRATEGIC GOALS - Coach Access (user_id only, need to join through owner_id)
-- =====================================================

DROP POLICY IF EXISTS "Coaches can view strategic goals" ON public.strategic_goals;
DROP POLICY IF EXISTS "Coaches can insert strategic goals" ON public.strategic_goals;
DROP POLICY IF EXISTS "Coaches can update strategic goals" ON public.strategic_goals;
DROP POLICY IF EXISTS "Coaches can delete strategic goals" ON public.strategic_goals;

CREATE POLICY "Coaches can view strategic goals" ON public.strategic_goals
  FOR SELECT
  USING (
    user_id IN (
      SELECT owner_id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can insert strategic goals" ON public.strategic_goals
  FOR INSERT
  WITH CHECK (
    user_id IN (
      SELECT owner_id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can update strategic goals" ON public.strategic_goals
  FOR UPDATE
  USING (
    user_id IN (
      SELECT owner_id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can delete strategic goals" ON public.strategic_goals
  FOR DELETE
  USING (
    user_id IN (
      SELECT owner_id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 6. ANNUAL PLANS - Coach Access (user_id only, need to join through owner_id)
-- =====================================================

DROP POLICY IF EXISTS "Coaches can view annual plans" ON public.annual_plans;
DROP POLICY IF EXISTS "Coaches can insert annual plans" ON public.annual_plans;
DROP POLICY IF EXISTS "Coaches can update annual plans" ON public.annual_plans;
DROP POLICY IF EXISTS "Coaches can delete annual plans" ON public.annual_plans;

CREATE POLICY "Coaches can view annual plans" ON public.annual_plans
  FOR SELECT
  USING (
    user_id IN (
      SELECT owner_id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can insert annual plans" ON public.annual_plans
  FOR INSERT
  WITH CHECK (
    user_id IN (
      SELECT owner_id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can update annual plans" ON public.annual_plans
  FOR UPDATE
  USING (
    user_id IN (
      SELECT owner_id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    OR
    user_id = auth.uid()
  );

CREATE POLICY "Coaches can delete annual plans" ON public.annual_plans
  FOR DELETE
  USING (
    user_id IN (
      SELECT owner_id FROM public.businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- SUCCESS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Coach RLS policies created successfully';
  RAISE NOTICE '✓ Tables covered: businesses, financial_forecasts, strategic_initiatives, business_financial_goals, strategic_goals, annual_plans';
  RAISE NOTICE '✓ Coaches can access assigned client data at database level';
END $$;
