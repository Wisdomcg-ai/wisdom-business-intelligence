-- Migration: Create all missing tables
-- This migration creates tables that are referenced in code but have no existing migrations
-- Run this in your Supabase SQL Editor
-- NOTE: This migration is idempotent - safe to run multiple times

-- ============================================
-- 1. BUSINESS_PROFILES TABLE
-- Used by: Onboarding, assessments, forecasts, reviews
-- ============================================
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  -- Basic info
  business_name TEXT,
  industry TEXT,
  annual_revenue NUMERIC,
  employee_count INTEGER,
  years_in_business INTEGER,

  -- Contact
  phone TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Australia',

  -- Business details
  business_type TEXT,
  target_market TEXT,
  main_products_services TEXT,

  -- Assessment data (JSONB for flexibility)
  eight_engine_scores JSONB,
  assessment_data JSONB,

  -- Onboarding tracking
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_step INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_business_id ON business_profiles(business_id);

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own business profiles" ON business_profiles;
DROP POLICY IF EXISTS "Users can insert own business profiles" ON business_profiles;
DROP POLICY IF EXISTS "Users can update own business profiles" ON business_profiles;
DROP POLICY IF EXISTS "Coaches can view client business profiles" ON business_profiles;

CREATE POLICY "Users can view own business profiles"
  ON business_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own business profiles"
  ON business_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own business profiles"
  ON business_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view client business profiles"
  ON business_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND b.owner_id = business_profiles.user_id
    )
  );


-- ============================================
-- 2. STRATEGY_DATA TABLE
-- Used by: Vision/Mission page
-- ============================================
CREATE TABLE IF NOT EXISTS public.strategy_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  -- Vision, Mission, Values stored as JSONB for flexibility
  vision TEXT,
  mission TEXT,
  core_values JSONB,  -- Array of value objects

  -- Additional strategy fields
  purpose_statement TEXT,
  brand_promise TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT strategy_data_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_strategy_data_user_id ON strategy_data(user_id);

ALTER TABLE strategy_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own strategy data" ON strategy_data;
DROP POLICY IF EXISTS "Users can insert own strategy data" ON strategy_data;
DROP POLICY IF EXISTS "Users can update own strategy data" ON strategy_data;
DROP POLICY IF EXISTS "Coaches can view client strategy data" ON strategy_data;

CREATE POLICY "Users can view own strategy data"
  ON strategy_data FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own strategy data"
  ON strategy_data FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own strategy data"
  ON strategy_data FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view client strategy data"
  ON strategy_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND b.owner_id = strategy_data.user_id
    )
  );


-- ============================================
-- 3. SWOT_ANALYSES TABLE
-- Used by: SWOT page, quarterly reviews
-- ============================================
CREATE TABLE IF NOT EXISTS public.swot_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,  -- Can be user_id or businesses.id (legacy pattern)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  type TEXT DEFAULT 'quarterly',  -- 'quarterly', 'annual', 'ad-hoc'
  quarter INTEGER,  -- 1-4
  year INTEGER,
  title TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swot_analyses_business_id ON swot_analyses(business_id);
CREATE INDEX IF NOT EXISTS idx_swot_analyses_user_id ON swot_analyses(user_id);

ALTER TABLE swot_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own SWOT analyses" ON swot_analyses;
DROP POLICY IF EXISTS "Users can insert own SWOT analyses" ON swot_analyses;
DROP POLICY IF EXISTS "Users can update own SWOT analyses" ON swot_analyses;
DROP POLICY IF EXISTS "Coaches can view client SWOT analyses" ON swot_analyses;

CREATE POLICY "Users can view own SWOT analyses"
  ON swot_analyses FOR SELECT
  USING (auth.uid() = user_id OR auth.uid()::text = business_id::text);

CREATE POLICY "Users can insert own SWOT analyses"
  ON swot_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid()::text = business_id::text);

CREATE POLICY "Users can update own SWOT analyses"
  ON swot_analyses FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid()::text = business_id::text);

CREATE POLICY "Coaches can view client SWOT analyses"
  ON swot_analyses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND (b.owner_id = swot_analyses.user_id OR b.owner_id::text = swot_analyses.business_id::text)
    )
  );


-- ============================================
-- 4. SWOT_ITEMS TABLE
-- Used by: SWOT detail pages
-- ============================================
CREATE TABLE IF NOT EXISTS public.swot_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swot_analysis_id UUID NOT NULL REFERENCES swot_analyses(id) ON DELETE CASCADE,

  category TEXT NOT NULL,  -- 'strength', 'weakness', 'opportunity', 'threat'
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',  -- 'active', 'carried-forward', 'resolved', 'archived'
  priority INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swot_items_analysis_id ON swot_items(swot_analysis_id);
CREATE INDEX IF NOT EXISTS idx_swot_items_category ON swot_items(category);

ALTER TABLE swot_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage SWOT items via analysis" ON swot_items;
DROP POLICY IF EXISTS "Coaches can view client SWOT items" ON swot_items;

CREATE POLICY "Users can manage SWOT items via analysis"
  ON swot_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM swot_analyses sa
      WHERE sa.id = swot_items.swot_analysis_id
      AND (sa.user_id = auth.uid() OR sa.business_id::text = auth.uid()::text)
    )
  );

CREATE POLICY "Coaches can view client SWOT items"
  ON swot_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM swot_analyses sa
      JOIN business_users bu ON true
      JOIN businesses b ON bu.business_id = b.id
      WHERE sa.id = swot_items.swot_analysis_id
      AND bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND (b.owner_id = sa.user_id OR b.owner_id::text = sa.business_id::text)
    )
  );


-- ============================================
-- 5. SWOT_ACTION_ITEMS TABLE
-- Used by: SWOT action panel
-- ============================================
CREATE TABLE IF NOT EXISTS public.swot_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swot_item_id UUID REFERENCES swot_items(id) ON DELETE CASCADE,
  swot_analysis_id UUID REFERENCES swot_analyses(id) ON DELETE CASCADE,

  action TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed'
  due_date DATE,
  assigned_to TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swot_action_items_swot_item ON swot_action_items(swot_item_id);

ALTER TABLE swot_action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage SWOT action items" ON swot_action_items;

CREATE POLICY "Users can manage SWOT action items"
  ON swot_action_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM swot_analyses sa
      WHERE sa.id = swot_action_items.swot_analysis_id
      AND (sa.user_id = auth.uid() OR sa.business_id::text = auth.uid()::text)
    )
  );


-- ============================================
-- 6. BUSINESS_KPIS TABLE
-- Used by: Quarterly reviews, dashboard
-- ============================================
CREATE TABLE IF NOT EXISTS public.business_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  business_profile_id UUID REFERENCES business_profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  category TEXT,  -- 'financial', 'sales', 'marketing', 'operations', 'people', 'customer'
  frequency TEXT DEFAULT 'monthly',
  unit TEXT,
  target_value NUMERIC,
  current_value NUMERIC,

  description TEXT,
  formula TEXT,
  data_source TEXT,

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_kpis_business_id ON business_kpis(business_id);
CREATE INDEX IF NOT EXISTS idx_business_kpis_user_id ON business_kpis(user_id);

ALTER TABLE business_kpis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own KPIs" ON business_kpis;
DROP POLICY IF EXISTS "Users can manage own KPIs" ON business_kpis;
DROP POLICY IF EXISTS "Coaches can view client KPIs" ON business_kpis;

CREATE POLICY "Users can view own KPIs"
  ON business_kpis FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own KPIs"
  ON business_kpis FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view client KPIs"
  ON business_kpis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND b.owner_id = business_kpis.user_id
    )
  );


-- ============================================
-- 7. BUSINESS_FINANCIAL_GOALS TABLE
-- Used by: Financial goals, reviews
-- ============================================
CREATE TABLE IF NOT EXISTS public.business_financial_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id UUID REFERENCES business_profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Revenue targets
  target_annual_revenue NUMERIC,
  target_monthly_revenue NUMERIC,

  -- Profit targets
  target_gross_margin_percent NUMERIC,
  target_net_margin_percent NUMERIC,
  target_annual_profit NUMERIC,

  -- Growth targets
  target_growth_rate NUMERIC,
  target_customer_count INTEGER,
  target_average_transaction NUMERIC,

  -- Period
  fiscal_year INTEGER,
  quarter INTEGER,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_financial_goals_profile ON business_financial_goals(business_profile_id);
CREATE INDEX IF NOT EXISTS idx_business_financial_goals_user ON business_financial_goals(user_id);

ALTER TABLE business_financial_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own financial goals" ON business_financial_goals;
DROP POLICY IF EXISTS "Coaches can view client financial goals" ON business_financial_goals;

CREATE POLICY "Users can manage own financial goals"
  ON business_financial_goals FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view client financial goals"
  ON business_financial_goals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND b.owner_id = business_financial_goals.user_id
    )
  );


-- ============================================
-- 8. OPEN_LOOPS TABLE
-- Used by: Coach actions, dashboard
-- ============================================
CREATE TABLE IF NOT EXISTS public.open_loops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open',  -- 'open', 'in_progress', 'closed'
  priority TEXT DEFAULT 'medium',  -- 'high', 'medium', 'low'

  due_date DATE,
  closed_at TIMESTAMPTZ,
  archived BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_open_loops_user_id ON open_loops(user_id);
CREATE INDEX IF NOT EXISTS idx_open_loops_status ON open_loops(status);

ALTER TABLE open_loops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own open loops" ON open_loops;
DROP POLICY IF EXISTS "Coaches can view client open loops" ON open_loops;

CREATE POLICY "Users can manage own open loops"
  ON open_loops FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view client open loops"
  ON open_loops FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND b.owner_id = open_loops.user_id
    )
  );


-- ============================================
-- 9. ISSUES_LIST TABLE
-- Used by: Issues list page, coach dashboard
-- ============================================
CREATE TABLE IF NOT EXISTS public.issues_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  stated_problem TEXT,
  root_cause TEXT,
  proposed_solution TEXT,

  status TEXT DEFAULT 'open',  -- 'open', 'in_progress', 'solved', 'wont_fix'
  priority TEXT DEFAULT 'medium',  -- 'critical', 'high', 'medium', 'low'
  is_resolved BOOLEAN DEFAULT false,

  due_date DATE,
  resolved_at TIMESTAMPTZ,
  archived BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issues_list_user_id ON issues_list(user_id);
CREATE INDEX IF NOT EXISTS idx_issues_list_status ON issues_list(status);

ALTER TABLE issues_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own issues" ON issues_list;
DROP POLICY IF EXISTS "Coaches can view client issues" ON issues_list;

CREATE POLICY "Users can manage own issues"
  ON issues_list FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view client issues"
  ON issues_list FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND b.owner_id = issues_list.user_id
    )
  );


-- ============================================
-- 10. TODO_ITEMS TABLE
-- Used by: Todo manager component
-- ============================================
CREATE TABLE IF NOT EXISTS public.todo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  created_by UUID REFERENCES auth.users(id),
  assigned_to UUID REFERENCES auth.users(id),

  title TEXT NOT NULL,
  description TEXT,

  status TEXT DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'cancelled'
  priority TEXT DEFAULT 'medium',  -- 'critical', 'high', 'medium', 'low'

  due_date DATE,
  completed_at TIMESTAMPTZ,

  -- Special flags for prioritization
  is_must BOOLEAN DEFAULT false,  -- The ONE must-do item
  is_top_three BOOLEAN DEFAULT false,  -- Important but not the must

  category TEXT,
  tags TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todo_items_business_id ON todo_items(business_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_assigned_to ON todo_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_todo_items_status ON todo_items(status);

ALTER TABLE todo_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view todos for their business" ON todo_items;
DROP POLICY IF EXISTS "Users can manage todos for their business" ON todo_items;
DROP POLICY IF EXISTS "Coaches can view client todos" ON todo_items;

CREATE POLICY "Users can view todos for their business"
  ON todo_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      WHERE bu.business_id = todo_items.business_id
      AND bu.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = todo_items.business_id
      AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage todos for their business"
  ON todo_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = todo_items.business_id
      AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can view client todos"
  ON todo_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      WHERE bu.business_id = todo_items.business_id
      AND bu.user_id = auth.uid()
      AND bu.role = 'coach'
    )
  );


-- ============================================
-- 11. COACHING_SESSIONS TABLE
-- Used by: Coach schedule page
-- ============================================
CREATE TABLE IF NOT EXISTS public.coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES auth.users(id),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  title TEXT,
  description TEXT,

  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,

  status TEXT DEFAULT 'scheduled',  -- 'scheduled', 'completed', 'cancelled', 'no_show'
  meeting_url TEXT,
  location TEXT,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coaching_sessions_coach ON coaching_sessions(coach_id);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_client ON coaching_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_scheduled ON coaching_sessions(scheduled_at);

ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can manage their sessions" ON coaching_sessions;
DROP POLICY IF EXISTS "Clients can view their sessions" ON coaching_sessions;

CREATE POLICY "Coaches can manage their sessions"
  ON coaching_sessions FOR ALL
  USING (auth.uid() = coach_id);

CREATE POLICY "Clients can view their sessions"
  ON coaching_sessions FOR SELECT
  USING (auth.uid() = client_id);


-- ============================================
-- 12. VISION_TARGETS TABLE
-- Used by: Goals/vision page
-- ============================================
CREATE TABLE IF NOT EXISTS public.vision_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,  -- business_profiles.id
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 3-Year Goals
  three_year_revenue NUMERIC,
  three_year_gross_margin_percent NUMERIC,
  three_year_net_margin_percent NUMERIC,
  three_year_team_size INTEGER,
  three_year_strategic_position TEXT,
  three_year_capabilities TEXT,

  -- 1-Year Goals
  one_year_revenue NUMERIC,
  one_year_gross_profit NUMERIC,
  one_year_gross_margin_percent NUMERIC,
  one_year_net_profit NUMERIC,
  one_year_net_margin_percent NUMERIC,

  -- KPIs stored as JSONB for flexibility
  kpis JSONB,
  kpi_categories TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vision_targets_business_id ON vision_targets(business_id);
CREATE INDEX IF NOT EXISTS idx_vision_targets_user_id ON vision_targets(user_id);

ALTER TABLE vision_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own vision targets" ON vision_targets;
DROP POLICY IF EXISTS "Coaches can view client vision targets" ON vision_targets;

CREATE POLICY "Users can manage own vision targets"
  ON vision_targets FOR ALL
  USING (auth.uid() = user_id OR auth.uid()::text = business_id::text);

CREATE POLICY "Coaches can view client vision targets"
  ON vision_targets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND (b.owner_id = vision_targets.user_id OR b.owner_id::text = vision_targets.business_id::text)
    )
  );


-- ============================================
-- 13. WEEKLY_METRICS_SNAPSHOTS TABLE
-- Used by: Client analytics
-- ============================================
CREATE TABLE IF NOT EXISTS public.weekly_metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  week_start DATE NOT NULL,
  week_end DATE NOT NULL,

  -- Financial metrics
  revenue NUMERIC,
  gross_profit NUMERIC,
  net_profit NUMERIC,

  -- Sales metrics
  leads_generated INTEGER,
  conversions INTEGER,
  average_sale NUMERIC,

  -- Custom metrics stored as JSONB
  custom_metrics JSONB,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT weekly_metrics_unique UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_metrics_user ON weekly_metrics_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_metrics_week ON weekly_metrics_snapshots(week_start);

ALTER TABLE weekly_metrics_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own metrics" ON weekly_metrics_snapshots;
DROP POLICY IF EXISTS "Coaches can view client metrics" ON weekly_metrics_snapshots;

CREATE POLICY "Users can manage own metrics"
  ON weekly_metrics_snapshots FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view client metrics"
  ON weekly_metrics_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND b.owner_id = weekly_metrics_snapshots.user_id
    )
  );


-- ============================================
-- 14. ANNUAL_TARGETS TABLE
-- Used by: Quarterly targets step
-- ============================================
CREATE TABLE IF NOT EXISTS public.annual_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  fiscal_year INTEGER NOT NULL,

  -- Revenue targets
  target_revenue NUMERIC,
  q1_target NUMERIC,
  q2_target NUMERIC,
  q3_target NUMERIC,
  q4_target NUMERIC,

  -- Profit targets
  target_gross_profit NUMERIC,
  target_net_profit NUMERIC,
  target_gross_margin_percent NUMERIC,
  target_net_margin_percent NUMERIC,

  -- Growth targets
  target_customer_count INTEGER,
  target_transactions INTEGER,
  target_average_transaction NUMERIC,

  -- Team targets
  target_headcount INTEGER,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT annual_targets_unique UNIQUE (user_id, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_annual_targets_user ON annual_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_annual_targets_year ON annual_targets(fiscal_year);

ALTER TABLE annual_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own annual targets" ON annual_targets;
DROP POLICY IF EXISTS "Coaches can view client annual targets" ON annual_targets;

CREATE POLICY "Users can manage own annual targets"
  ON annual_targets FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view client annual targets"
  ON annual_targets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND b.owner_id = annual_targets.user_id
    )
  );


-- ============================================
-- ADD COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE business_profiles IS 'Extended business profile data including assessment scores and onboarding status';
COMMENT ON TABLE strategy_data IS 'Vision, mission, and core values data for businesses';
COMMENT ON TABLE swot_analyses IS 'SWOT analysis records - quarterly or ad-hoc';
COMMENT ON TABLE swot_items IS 'Individual SWOT items (strengths, weaknesses, opportunities, threats)';
COMMENT ON TABLE swot_action_items IS 'Action items linked to SWOT items';
COMMENT ON TABLE business_kpis IS 'Key Performance Indicators defined for businesses';
COMMENT ON TABLE business_financial_goals IS 'Financial targets and goals for businesses';
COMMENT ON TABLE open_loops IS 'Open items/tasks that need attention';
COMMENT ON TABLE issues_list IS 'Business issues with root cause analysis';
COMMENT ON TABLE todo_items IS 'Task management items with priority flags';
COMMENT ON TABLE coaching_sessions IS 'Scheduled coaching sessions between coaches and clients';
COMMENT ON TABLE vision_targets IS '1-year and 3-year business targets and KPIs';
COMMENT ON TABLE weekly_metrics_snapshots IS 'Weekly performance metrics tracking';
COMMENT ON TABLE annual_targets IS 'Annual business targets broken down by quarter';
