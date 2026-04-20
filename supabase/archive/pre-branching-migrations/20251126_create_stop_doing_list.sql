-- Stop Doing List Feature Migration
-- Based on Matt Malouf's "The Stop Doing List" book methodology
-- Created: 2024-11-26

-- ============================================
-- Table 1: Time Log Entries (for tracking time)
-- ============================================
CREATE TABLE IF NOT EXISTS public.stop_doing_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL, -- Monday of the tracking week
  entries JSONB DEFAULT '{}', -- {"mon": {"0500": "activity", "0515": "activity"}, "tue": {...}}
  total_minutes INTEGER DEFAULT 0,
  is_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, week_start_date)
);

-- Indexes for time logs
CREATE INDEX IF NOT EXISTS idx_stop_doing_time_logs_business_id ON public.stop_doing_time_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_stop_doing_time_logs_user_id ON public.stop_doing_time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_stop_doing_time_logs_week ON public.stop_doing_time_logs(week_start_date DESC);

-- RLS for time logs
ALTER TABLE public.stop_doing_time_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own time logs" ON public.stop_doing_time_logs
  FOR SELECT USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own time logs" ON public.stop_doing_time_logs
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own time logs" ON public.stop_doing_time_logs
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own time logs" ON public.stop_doing_time_logs
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

-- ============================================
-- Table 2: Hourly Rate Calculations
-- ============================================
CREATE TABLE IF NOT EXISTS public.stop_doing_hourly_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_annual_income DECIMAL(15, 2) DEFAULT 0,
  working_weeks_per_year INTEGER DEFAULT 48,
  hours_per_week INTEGER DEFAULT 40,
  calculated_hourly_rate DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id)
);

-- Indexes for hourly rates
CREATE INDEX IF NOT EXISTS idx_stop_doing_hourly_rates_business_id ON public.stop_doing_hourly_rates(business_id);
CREATE INDEX IF NOT EXISTS idx_stop_doing_hourly_rates_user_id ON public.stop_doing_hourly_rates(user_id);

-- RLS for hourly rates
ALTER TABLE public.stop_doing_hourly_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own hourly rates" ON public.stop_doing_hourly_rates
  FOR SELECT USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own hourly rates" ON public.stop_doing_hourly_rates
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own hourly rates" ON public.stop_doing_hourly_rates
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own hourly rates" ON public.stop_doing_hourly_rates
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

-- ============================================
-- Table 3: Activity Inventory
-- ============================================
CREATE TABLE IF NOT EXISTS public.stop_doing_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_name TEXT NOT NULL,
  frequency TEXT DEFAULT 'weekly', -- 'daily', 'weekly', 'monthly', 'quarterly', 'other'
  duration_minutes INTEGER DEFAULT 30,
  zone TEXT DEFAULT 'competence', -- 'incompetence', 'competence', 'excellence', 'genius'
  focus_funnel_outcome TEXT, -- 'eliminate', 'automate', 'delegate', 'concentrate'
  special_skills_required TEXT,
  importance TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
  has_system BOOLEAN DEFAULT FALSE,
  delegation_hourly_rate DECIMAL(10, 2),
  order_index INTEGER DEFAULT 0,
  is_selected_for_stop_doing BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for activities
CREATE INDEX IF NOT EXISTS idx_stop_doing_activities_business_id ON public.stop_doing_activities(business_id);
CREATE INDEX IF NOT EXISTS idx_stop_doing_activities_user_id ON public.stop_doing_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_stop_doing_activities_zone ON public.stop_doing_activities(zone);
CREATE INDEX IF NOT EXISTS idx_stop_doing_activities_selected ON public.stop_doing_activities(is_selected_for_stop_doing) WHERE is_selected_for_stop_doing = TRUE;

-- RLS for activities
ALTER TABLE public.stop_doing_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activities" ON public.stop_doing_activities
  FOR SELECT USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own activities" ON public.stop_doing_activities
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own activities" ON public.stop_doing_activities
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own activities" ON public.stop_doing_activities
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

-- ============================================
-- Table 4: Stop Doing List Items (Action Plan)
-- ============================================
CREATE TABLE IF NOT EXISTS public.stop_doing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.stop_doing_activities(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  zone TEXT,
  focus_funnel_outcome TEXT,
  monthly_hours DECIMAL(10, 2) DEFAULT 0,
  hourly_rate_used DECIMAL(10, 2) DEFAULT 0,
  delegation_rate DECIMAL(10, 2) DEFAULT 0,
  net_gain_loss DECIMAL(10, 2) DEFAULT 0, -- hourly_rate - delegation_rate
  opportunity_cost_monthly DECIMAL(15, 2) DEFAULT 0,
  suggested_decision TEXT,
  delegate_to TEXT, -- Person or role to delegate to
  target_date DATE,
  notes TEXT,
  status TEXT DEFAULT 'identified', -- 'identified', 'planned', 'in_progress', 'completed'
  order_index INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for stop doing items
CREATE INDEX IF NOT EXISTS idx_stop_doing_items_business_id ON public.stop_doing_items(business_id);
CREATE INDEX IF NOT EXISTS idx_stop_doing_items_user_id ON public.stop_doing_items(user_id);
CREATE INDEX IF NOT EXISTS idx_stop_doing_items_status ON public.stop_doing_items(status);
CREATE INDEX IF NOT EXISTS idx_stop_doing_items_activity_id ON public.stop_doing_items(activity_id);

-- RLS for stop doing items
ALTER TABLE public.stop_doing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stop doing items" ON public.stop_doing_items
  FOR SELECT USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own stop doing items" ON public.stop_doing_items
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own stop doing items" ON public.stop_doing_items
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own stop doing items" ON public.stop_doing_items
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
  );

-- ============================================
-- Coach Access Policies (for all tables)
-- ============================================
CREATE POLICY "Coaches can view client time logs" ON public.stop_doing_time_logs
  FOR SELECT USING (
    business_id IN (
      SELECT bp.id FROM public.business_profiles bp
      JOIN public.businesses b ON bp.business_id = b.id
      WHERE b.assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can view client hourly rates" ON public.stop_doing_hourly_rates
  FOR SELECT USING (
    business_id IN (
      SELECT bp.id FROM public.business_profiles bp
      JOIN public.businesses b ON bp.business_id = b.id
      WHERE b.assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can view client activities" ON public.stop_doing_activities
  FOR SELECT USING (
    business_id IN (
      SELECT bp.id FROM public.business_profiles bp
      JOIN public.businesses b ON bp.business_id = b.id
      WHERE b.assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can view client stop doing items" ON public.stop_doing_items
  FOR SELECT USING (
    business_id IN (
      SELECT bp.id FROM public.business_profiles bp
      JOIN public.businesses b ON bp.business_id = b.id
      WHERE b.assigned_coach_id = auth.uid()
    )
  );

-- ============================================
-- Trigger for updated_at timestamps
-- ============================================
CREATE OR REPLACE FUNCTION public.update_stop_doing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stop_doing_time_logs_updated_at
  BEFORE UPDATE ON public.stop_doing_time_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_stop_doing_updated_at();

CREATE TRIGGER stop_doing_hourly_rates_updated_at
  BEFORE UPDATE ON public.stop_doing_hourly_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_stop_doing_updated_at();

CREATE TRIGGER stop_doing_activities_updated_at
  BEFORE UPDATE ON public.stop_doing_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_stop_doing_updated_at();

CREATE TRIGGER stop_doing_items_updated_at
  BEFORE UPDATE ON public.stop_doing_items
  FOR EACH ROW EXECUTE FUNCTION public.update_stop_doing_updated_at();

-- ============================================
-- Grant permissions
-- ============================================
GRANT ALL ON public.stop_doing_time_logs TO authenticated;
GRANT ALL ON public.stop_doing_hourly_rates TO authenticated;
GRANT ALL ON public.stop_doing_activities TO authenticated;
GRANT ALL ON public.stop_doing_items TO authenticated;
