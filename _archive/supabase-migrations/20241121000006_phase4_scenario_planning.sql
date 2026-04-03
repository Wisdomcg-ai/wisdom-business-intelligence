-- ============================================================================
-- PHASE 4: Scenario Planning & What-If Analysis
-- Created: 2024-11-21
-- ============================================================================

-- ============================================================================
-- 1. Create forecast_scenarios table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.forecast_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES public.financial_forecasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Scenario metadata
  name VARCHAR(100) NOT NULL, -- "Conservative", "Realistic", "Optimistic", "Best Case", etc.
  description TEXT,
  scenario_type VARCHAR(50) DEFAULT 'planning' CHECK (scenario_type IN ('active', 'planning', 'archived')),

  -- Scenario adjustments (multipliers or fixed values)
  revenue_multiplier DECIMAL(5,2) DEFAULT 1.00, -- 1.00 = 100%, 1.15 = 115%, 0.85 = 85%
  cogs_multiplier DECIMAL(5,2) DEFAULT 1.00,
  opex_multiplier DECIMAL(5,2) DEFAULT 1.00,

  -- Additional adjustments
  revenue_adjustment_type VARCHAR(20) DEFAULT 'multiplier' CHECK (revenue_adjustment_type IN ('multiplier', 'fixed')),
  revenue_fixed_value DECIMAL(15,2),

  -- Status flags
  is_active BOOLEAN DEFAULT false, -- Only one scenario can be active at a time
  is_baseline BOOLEAN DEFAULT false, -- Mark the original/baseline scenario

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique scenario names per forecast
  UNIQUE(forecast_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_forecast ON public.forecast_scenarios(forecast_id);
CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_user ON public.forecast_scenarios(user_id);
CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_active ON public.forecast_scenarios(forecast_id, is_active);

-- Comments
COMMENT ON TABLE public.forecast_scenarios IS 'Stores different scenario versions of a forecast for what-if analysis';
COMMENT ON COLUMN public.forecast_scenarios.name IS 'User-friendly scenario name (e.g., Conservative, Realistic, Optimistic)';
COMMENT ON COLUMN public.forecast_scenarios.scenario_type IS 'Type: active (current view), planning (being worked on), archived (old)';
COMMENT ON COLUMN public.forecast_scenarios.revenue_multiplier IS 'Multiplier for revenue: 1.00 = no change, 1.15 = +15%, 0.85 = -15%';
COMMENT ON COLUMN public.forecast_scenarios.is_active IS 'Only one scenario can be active (displayed by default) at a time';
COMMENT ON COLUMN public.forecast_scenarios.is_baseline IS 'Marks the original baseline scenario for comparison';

-- ============================================================================
-- 2. Create forecast_scenario_lines table for line-level adjustments
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.forecast_scenario_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES public.forecast_scenarios(id) ON DELETE CASCADE,
  pl_line_id UUID NOT NULL REFERENCES public.forecast_pl_lines(id) ON DELETE CASCADE,

  -- Adjusted monthly values (overrides calculated values from multipliers)
  adjusted_forecast_months JSONB, -- { "2025-01": 10000, "2025-02": 12000, ... }
  adjustment_reason TEXT, -- Why this line was adjusted differently
  notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one adjustment per line per scenario
  UNIQUE(scenario_id, pl_line_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scenario_lines_scenario ON public.forecast_scenario_lines(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_lines_pl_line ON public.forecast_scenario_lines(pl_line_id);

-- Comments
COMMENT ON TABLE public.forecast_scenario_lines IS 'Line-level adjustments for specific P&L lines within a scenario';
COMMENT ON COLUMN public.forecast_scenario_lines.adjusted_forecast_months IS 'Override monthly values for this line in this scenario';

-- ============================================================================
-- 3. Row Level Security (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE public.forecast_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_scenario_lines ENABLE ROW LEVEL SECURITY;

-- Scenarios policies
CREATE POLICY "Users can view their own scenarios"
  ON public.forecast_scenarios
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own scenarios"
  ON public.forecast_scenarios
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own scenarios"
  ON public.forecast_scenarios
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own scenarios"
  ON public.forecast_scenarios
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Scenario lines policies
CREATE POLICY "Users can view their scenario lines"
  ON public.forecast_scenario_lines
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.forecast_scenarios
      WHERE forecast_scenarios.id = forecast_scenario_lines.scenario_id
      AND forecast_scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their scenario lines"
  ON public.forecast_scenario_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.forecast_scenarios
      WHERE forecast_scenarios.id = forecast_scenario_lines.scenario_id
      AND forecast_scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their scenario lines"
  ON public.forecast_scenario_lines
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.forecast_scenarios
      WHERE forecast_scenarios.id = forecast_scenario_lines.scenario_id
      AND forecast_scenarios.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.forecast_scenarios
      WHERE forecast_scenarios.id = forecast_scenario_lines.scenario_id
      AND forecast_scenarios.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their scenario lines"
  ON public.forecast_scenario_lines
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.forecast_scenarios
      WHERE forecast_scenarios.id = forecast_scenario_lines.scenario_id
      AND forecast_scenarios.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. Helper function to ensure only one active scenario per forecast
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ensure_single_active_scenario()
RETURNS TRIGGER AS $$
BEGIN
  -- If this scenario is being set to active
  IF NEW.is_active = true THEN
    -- Set all other scenarios for this forecast to inactive
    UPDATE public.forecast_scenarios
    SET is_active = false, updated_at = NOW()
    WHERE forecast_id = NEW.forecast_id
      AND id != NEW.id
      AND is_active = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to ensure only one active scenario
DROP TRIGGER IF EXISTS trigger_ensure_single_active_scenario ON public.forecast_scenarios;
CREATE TRIGGER trigger_ensure_single_active_scenario
  BEFORE INSERT OR UPDATE ON public.forecast_scenarios
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION public.ensure_single_active_scenario();

-- ============================================================================
-- 5. Helper function to create baseline scenario when forecast is created
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_baseline_scenario_for_forecast()
RETURNS TRIGGER AS $$
BEGIN
  -- Create a baseline scenario for new forecasts
  INSERT INTO public.forecast_scenarios (
    forecast_id,
    user_id,
    name,
    description,
    scenario_type,
    is_active,
    is_baseline,
    revenue_multiplier,
    cogs_multiplier,
    opex_multiplier
  ) VALUES (
    NEW.id,
    NEW.user_id,
    'Baseline',
    'Original forecast - baseline for comparison',
    'active',
    true,
    true,
    1.00,
    1.00,
    1.00
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create baseline scenario (disabled for now - will enable when ready)
-- DROP TRIGGER IF EXISTS trigger_create_baseline_scenario ON public.financial_forecasts;
-- CREATE TRIGGER trigger_create_baseline_scenario
--   AFTER INSERT ON public.financial_forecasts
--   FOR EACH ROW
--   EXECUTE FUNCTION public.create_baseline_scenario_for_forecast();

-- ============================================================================
-- 6. Audit log integration
-- ============================================================================

-- Add scenario actions to audit log
DROP TRIGGER IF EXISTS trigger_forecast_scenarios_audit ON public.forecast_scenarios;
CREATE TRIGGER trigger_forecast_scenarios_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.forecast_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION public.log_forecast_change();

DROP TRIGGER IF EXISTS trigger_scenario_lines_audit ON public.forecast_scenario_lines;
CREATE TRIGGER trigger_scenario_lines_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.forecast_scenario_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.log_forecast_change();
