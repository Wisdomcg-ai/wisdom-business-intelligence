-- =====================================================
-- FORECAST WIZARD V2 - DATABASE MIGRATIONS
-- =====================================================
-- This migration adds new tables for the conversational forecast wizard
-- All changes are ADDITIVE - existing data is preserved
-- =====================================================

-- =====================================================
-- 1. FORECAST WIZARD SESSIONS
-- Track wizard progress and analytics
-- =====================================================

CREATE TABLE IF NOT EXISTS forecast_wizard_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID REFERENCES financial_forecasts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,

  -- Session tracking
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  mode TEXT CHECK (mode IN ('guided', 'quick')) DEFAULT 'guided',

  -- Progress tracking
  current_step TEXT DEFAULT 'setup',
  steps_completed JSONB DEFAULT '{}',
  -- Format: {"step_name": {"completed": true, "time_spent_seconds": 45, "completed_at": "..."}}

  dropped_off_at TEXT, -- Which step if incomplete

  -- Multi-year selection
  years_selected INTEGER[] DEFAULT ARRAY[1], -- [1], [1,2], [1,2,3]

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wizard_sessions_business ON forecast_wizard_sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_wizard_sessions_user ON forecast_wizard_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_wizard_sessions_forecast ON forecast_wizard_sessions(forecast_id);

-- =====================================================
-- 2. FORECAST DECISIONS
-- Track key decisions with reasoning for learning
-- =====================================================

CREATE TABLE IF NOT EXISTS forecast_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID REFERENCES financial_forecasts(id) ON DELETE CASCADE,
  session_id UUID REFERENCES forecast_wizard_sessions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,

  -- Decision details
  decision_type TEXT NOT NULL,
  -- Types: 'new_hire', 'remove_employee', 'salary_change', 'investment',
  --        'cost_added', 'cost_changed', 'goal_adjusted', 'year_projection'

  decision_data JSONB NOT NULL,
  -- Contains the actual decision details (varies by type)

  reasoning TEXT, -- User's note on why (optional)

  -- AI involvement
  ai_suggestion JSONB, -- What AI recommended
  user_accepted_ai BOOLEAN,
  ai_confidence TEXT CHECK (ai_confidence IN ('high', 'medium', 'low')),

  -- Linking
  linked_initiative_id UUID REFERENCES strategic_initiatives(id) ON DELETE SET NULL,
  linked_pl_line_id UUID REFERENCES forecast_pl_lines(id) ON DELETE SET NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_forecast_decisions_forecast ON forecast_decisions(forecast_id);
CREATE INDEX IF NOT EXISTS idx_forecast_decisions_type ON forecast_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_forecast_decisions_session ON forecast_decisions(session_id);

-- =====================================================
-- 3. FORECAST INVESTMENTS
-- Strategic investments linked to initiatives
-- =====================================================

CREATE TABLE IF NOT EXISTS forecast_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID REFERENCES financial_forecasts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  initiative_id UUID REFERENCES strategic_initiatives(id) ON DELETE SET NULL,

  -- Investment details
  name TEXT NOT NULL,
  description TEXT,
  investment_type TEXT CHECK (investment_type IN ('capex', 'opex')) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,

  -- Timing
  start_month TEXT NOT NULL, -- '2026-02'
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence TEXT CHECK (recurrence IN ('monthly', 'quarterly', 'annual')),
  end_month TEXT, -- For recurring items, when they stop

  -- Accounting
  pl_account_category TEXT, -- 'Marketing', 'Technology', etc.
  pl_line_id UUID REFERENCES forecast_pl_lines(id) ON DELETE SET NULL,

  -- CapEx specific
  depreciation_years INTEGER, -- NULL if expensed immediately or OpEx

  -- Reasoning
  reasoning TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_forecast_investments_forecast ON forecast_investments(forecast_id);
CREATE INDEX IF NOT EXISTS idx_forecast_investments_initiative ON forecast_investments(initiative_id);
CREATE INDEX IF NOT EXISTS idx_forecast_investments_type ON forecast_investments(investment_type);

-- =====================================================
-- 4. FORECAST YEARS
-- Multi-year forecast data (Year 2, Year 3)
-- =====================================================

CREATE TABLE IF NOT EXISTS forecast_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID REFERENCES financial_forecasts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,

  -- Year identification
  year_number INTEGER NOT NULL CHECK (year_number IN (1, 2, 3)),
  fiscal_year INTEGER NOT NULL,
  granularity TEXT CHECK (granularity IN ('monthly', 'quarterly', 'annual')) DEFAULT 'annual',

  -- Revenue projections
  revenue_target DECIMAL(12,2),
  revenue_growth_percent DECIMAL(5,2),

  -- Margin assumptions
  gross_margin_percent DECIMAL(5,2),
  net_profit_percent DECIMAL(5,2),

  -- Team projections
  headcount_start INTEGER DEFAULT 0,
  headcount_end INTEGER DEFAULT 0,
  headcount_change INTEGER DEFAULT 0,
  planned_roles JSONB, -- Array of roles to add
  team_cost_estimate DECIMAL(12,2),

  -- Cost projections
  opex_estimate DECIMAL(12,2),
  capex_estimate DECIMAL(12,2),

  -- Quarterly breakdown (for quarterly granularity)
  quarterly_data JSONB,
  -- Format: {"Q1": {revenue: X, costs: Y}, "Q2": {...}, ...}

  -- Notes
  notes TEXT,
  assumptions TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(forecast_id, year_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_forecast_years_forecast ON forecast_years(forecast_id);
CREATE INDEX IF NOT EXISTS idx_forecast_years_fiscal ON forecast_years(fiscal_year);

-- =====================================================
-- 5. ENHANCE AI_INTERACTIONS TABLE
-- Add session context for better tracking
-- =====================================================

ALTER TABLE ai_interactions
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES forecast_wizard_sessions(id) ON DELETE SET NULL;

ALTER TABLE ai_interactions
  ADD COLUMN IF NOT EXISTS step_context TEXT;

ALTER TABLE ai_interactions
  ADD COLUMN IF NOT EXISTS conversation_context JSONB;

-- =====================================================
-- 6. ADD NOTIFICATION FIELDS TO FINANCIAL_FORECASTS
-- For coach notifications
-- =====================================================

ALTER TABLE financial_forecasts
  ADD COLUMN IF NOT EXISTS wizard_completed_at TIMESTAMPTZ;

ALTER TABLE financial_forecasts
  ADD COLUMN IF NOT EXISTS coach_notified_at TIMESTAMPTZ;

ALTER TABLE financial_forecasts
  ADD COLUMN IF NOT EXISTS coach_reviewed_at TIMESTAMPTZ;

ALTER TABLE financial_forecasts
  ADD COLUMN IF NOT EXISTS wizard_session_id UUID REFERENCES forecast_wizard_sessions(id) ON DELETE SET NULL;

-- =====================================================
-- 7. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE forecast_wizard_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_years ENABLE ROW LEVEL SECURITY;

-- FORECAST_WIZARD_SESSIONS policies
DROP POLICY IF EXISTS "wizard_sessions_select" ON forecast_wizard_sessions;
CREATE POLICY "wizard_sessions_select" ON forecast_wizard_sessions
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR business_id IN (
      SELECT b.id FROM businesses b WHERE b.assigned_coach_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wizard_sessions_insert" ON forecast_wizard_sessions;
CREATE POLICY "wizard_sessions_insert" ON forecast_wizard_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "wizard_sessions_update" ON forecast_wizard_sessions;
CREATE POLICY "wizard_sessions_update" ON forecast_wizard_sessions
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "wizard_sessions_delete" ON forecast_wizard_sessions;
CREATE POLICY "wizard_sessions_delete" ON forecast_wizard_sessions
  FOR DELETE USING (user_id = auth.uid());

-- FORECAST_DECISIONS policies
DROP POLICY IF EXISTS "forecast_decisions_select" ON forecast_decisions;
CREATE POLICY "forecast_decisions_select" ON forecast_decisions
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR business_id IN (
      SELECT b.id FROM businesses b WHERE b.assigned_coach_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "forecast_decisions_insert" ON forecast_decisions;
CREATE POLICY "forecast_decisions_insert" ON forecast_decisions
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "forecast_decisions_update" ON forecast_decisions;
CREATE POLICY "forecast_decisions_update" ON forecast_decisions
  FOR UPDATE USING (user_id = auth.uid());

-- FORECAST_INVESTMENTS policies
DROP POLICY IF EXISTS "forecast_investments_select" ON forecast_investments;
CREATE POLICY "forecast_investments_select" ON forecast_investments
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR business_id IN (
      SELECT b.id FROM businesses b WHERE b.assigned_coach_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "forecast_investments_insert" ON forecast_investments;
CREATE POLICY "forecast_investments_insert" ON forecast_investments
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "forecast_investments_update" ON forecast_investments;
CREATE POLICY "forecast_investments_update" ON forecast_investments
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "forecast_investments_delete" ON forecast_investments;
CREATE POLICY "forecast_investments_delete" ON forecast_investments
  FOR DELETE USING (user_id = auth.uid());

-- FORECAST_YEARS policies
DROP POLICY IF EXISTS "forecast_years_select" ON forecast_years;
CREATE POLICY "forecast_years_select" ON forecast_years
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR business_id IN (
      SELECT b.id FROM businesses b WHERE b.assigned_coach_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "forecast_years_insert" ON forecast_years;
CREATE POLICY "forecast_years_insert" ON forecast_years
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "forecast_years_update" ON forecast_years;
CREATE POLICY "forecast_years_update" ON forecast_years
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "forecast_years_delete" ON forecast_years;
CREATE POLICY "forecast_years_delete" ON forecast_years
  FOR DELETE USING (user_id = auth.uid());

-- =====================================================
-- 8. HELPER FUNCTIONS
-- =====================================================

-- Function to notify coach when forecast is completed
CREATE OR REPLACE FUNCTION notify_coach_forecast_complete()
RETURNS TRIGGER AS $$
DECLARE
  coach_id UUID;
  business_name TEXT;
BEGIN
  -- Only trigger when wizard_completed_at is set
  IF NEW.wizard_completed_at IS NOT NULL AND OLD.wizard_completed_at IS NULL THEN
    -- Get the coach for this business
    SELECT b.assigned_coach_id, b.name INTO coach_id, business_name
    FROM businesses b
    WHERE b.id = NEW.business_id;

    -- If there's a coach, create a notification
    IF coach_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, data, created_at)
      VALUES (
        coach_id,
        'forecast_completed',
        'Forecast Completed',
        business_name || ' has completed their financial forecast',
        jsonb_build_object(
          'forecast_id', NEW.id,
          'business_id', NEW.business_id,
          'fiscal_year', NEW.fiscal_year
        ),
        NOW()
      );

      -- Update the coach_notified_at field
      NEW.coach_notified_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (only if notifications table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    DROP TRIGGER IF EXISTS trigger_notify_coach_forecast ON financial_forecasts;
    CREATE TRIGGER trigger_notify_coach_forecast
      BEFORE UPDATE ON financial_forecasts
      FOR EACH ROW
      EXECUTE FUNCTION notify_coach_forecast_complete();
  END IF;
END $$;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'FORECAST WIZARD V2 MIGRATION COMPLETE';
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'Created tables:';
  RAISE NOTICE '  - forecast_wizard_sessions';
  RAISE NOTICE '  - forecast_decisions';
  RAISE NOTICE '  - forecast_investments';
  RAISE NOTICE '  - forecast_years';
  RAISE NOTICE '';
  RAISE NOTICE 'Enhanced tables:';
  RAISE NOTICE '  - ai_interactions (added session context)';
  RAISE NOTICE '  - financial_forecasts (added wizard completion tracking)';
  RAISE NOTICE '';
  RAISE NOTICE 'All RLS policies configured for:';
  RAISE NOTICE '  - User ownership';
  RAISE NOTICE '  - Super admin access';
  RAISE NOTICE '  - Coach access';
  RAISE NOTICE '====================================================';
END $$;
