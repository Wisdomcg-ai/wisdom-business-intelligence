-- ============================================================
-- FORECAST SCENARIOS AND SUBSCRIPTION AUDIT TABLES
-- ============================================================
-- This migration adds:
-- 1. Scenario planning support to financial_forecasts
-- 2. forecast_scenarios table for managing scenarios
-- 3. subscription_audit_results table for tracking subscriptions
-- ============================================================

-- ============================================================
-- PART 1: Update financial_forecasts for scenario support
-- ============================================================

-- Add assumptions JSONB column to store structured forecast inputs
ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS is_base_forecast BOOLEAN DEFAULT true;

ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS assumptions JSONB DEFAULT '{}';

ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS parent_forecast_id UUID REFERENCES financial_forecasts(id) ON DELETE CASCADE;

-- Index for querying scenarios by parent
CREATE INDEX IF NOT EXISTS idx_forecasts_parent
ON financial_forecasts(parent_forecast_id)
WHERE parent_forecast_id IS NOT NULL;

-- Index for querying base forecasts
CREATE INDEX IF NOT EXISTS idx_forecasts_is_base
ON financial_forecasts(business_id, is_base_forecast)
WHERE is_base_forecast = true;

-- Comments for documentation
COMMENT ON COLUMN financial_forecasts.is_base_forecast IS 'True if this is a base forecast created from wizard, false if it is a scenario';
COMMENT ON COLUMN financial_forecasts.assumptions IS 'Structured JSONB containing all forecast assumptions (revenue growth, cost behaviors, etc.)';
COMMENT ON COLUMN financial_forecasts.parent_forecast_id IS 'For scenarios: links to the base forecast this scenario derives from';

-- ============================================================
-- PART 2: Create forecast_scenarios table
-- ============================================================

CREATE TABLE IF NOT EXISTS forecast_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_forecast_id UUID NOT NULL REFERENCES financial_forecasts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  assumption_overrides JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT unique_scenario_name_per_forecast UNIQUE(base_forecast_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scenarios_base_forecast ON forecast_scenarios(base_forecast_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_active ON forecast_scenarios(base_forecast_id, is_active) WHERE is_active = true;

-- Comments
COMMENT ON TABLE forecast_scenarios IS 'Scenarios that override specific assumptions from a base forecast for what-if analysis';
COMMENT ON COLUMN forecast_scenarios.assumption_overrides IS 'JSONB containing only the assumptions that differ from the base forecast';

-- Enable RLS
ALTER TABLE forecast_scenarios ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Access based on base forecast ownership
CREATE POLICY "forecast_scenarios_select_policy" ON forecast_scenarios
FOR SELECT USING (
  base_forecast_id IN (
    SELECT ff.id FROM financial_forecasts ff
    JOIN businesses b ON b.id = ff.business_id
    WHERE b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "forecast_scenarios_insert_policy" ON forecast_scenarios
FOR INSERT WITH CHECK (
  base_forecast_id IN (
    SELECT ff.id FROM financial_forecasts ff
    JOIN businesses b ON b.id = ff.business_id
    WHERE b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "forecast_scenarios_update_policy" ON forecast_scenarios
FOR UPDATE USING (
  base_forecast_id IN (
    SELECT ff.id FROM financial_forecasts ff
    JOIN businesses b ON b.id = ff.business_id
    WHERE b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "forecast_scenarios_delete_policy" ON forecast_scenarios
FOR DELETE USING (
  base_forecast_id IN (
    SELECT ff.id FROM financial_forecasts ff
    JOIN businesses b ON b.id = ff.business_id
    WHERE b.owner_id = auth.uid() OR b.assigned_coach_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- ============================================================
-- PART 3: Create subscription_audit_results table
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_audit_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  forecast_id UUID REFERENCES financial_forecasts(id) ON DELETE SET NULL,

  -- Vendor identification
  vendor_name TEXT NOT NULL,
  vendor_normalized TEXT,
  source_account_id TEXT,
  source_account_name TEXT,

  -- Detection results
  detected_frequency TEXT CHECK (detected_frequency IN ('monthly', 'quarterly', 'annual', 'irregular')),
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),

  -- Financial data
  typical_amount DECIMAL(12,2),
  annual_total DECIMAL(12,2),
  cost_per_employee DECIMAL(12,2),

  -- User decisions
  status TEXT DEFAULT 'review' CHECK (status IN ('essential', 'review', 'reduce', 'cancel')),
  user_notes TEXT,

  -- Tracking
  last_payment_date DATE,
  next_expected_date DATE,
  payment_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_vendor_per_business UNIQUE(business_id, vendor_normalized)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscription_audit_business ON subscription_audit_results(business_id);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_forecast ON subscription_audit_results(forecast_id);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_status ON subscription_audit_results(business_id, status);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_vendor ON subscription_audit_results(vendor_normalized);

-- Comments
COMMENT ON TABLE subscription_audit_results IS 'Results from subscription audit analysis - tracks vendors, costs, and user decisions';
COMMENT ON COLUMN subscription_audit_results.vendor_normalized IS 'Standardized vendor name for matching/deduplication';
COMMENT ON COLUMN subscription_audit_results.detected_frequency IS 'System-detected payment frequency based on transaction analysis';
COMMENT ON COLUMN subscription_audit_results.status IS 'User decision: essential (keep), review (consider), reduce (negotiate), cancel (remove)';

-- Enable RLS
ALTER TABLE subscription_audit_results ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Access based on business ownership
CREATE POLICY "subscription_audit_select_policy" ON subscription_audit_results
FOR SELECT USING (
  business_id IN (
    SELECT id FROM businesses
    WHERE owner_id = auth.uid() OR assigned_coach_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "subscription_audit_insert_policy" ON subscription_audit_results
FOR INSERT WITH CHECK (
  business_id IN (
    SELECT id FROM businesses
    WHERE owner_id = auth.uid() OR assigned_coach_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "subscription_audit_update_policy" ON subscription_audit_results
FOR UPDATE USING (
  business_id IN (
    SELECT id FROM businesses
    WHERE owner_id = auth.uid() OR assigned_coach_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "subscription_audit_delete_policy" ON subscription_audit_results
FOR DELETE USING (
  business_id IN (
    SELECT id FROM businesses
    WHERE owner_id = auth.uid() OR assigned_coach_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- ============================================================
-- PART 4: Create updated_at trigger for new tables
-- ============================================================

-- Trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to forecast_scenarios
DROP TRIGGER IF EXISTS update_forecast_scenarios_updated_at ON forecast_scenarios;
CREATE TRIGGER update_forecast_scenarios_updated_at
  BEFORE UPDATE ON forecast_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply to subscription_audit_results
DROP TRIGGER IF EXISTS update_subscription_audit_updated_at ON subscription_audit_results;
CREATE TRIGGER update_subscription_audit_updated_at
  BEFORE UPDATE ON subscription_audit_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'FORECAST SCENARIOS & SUBSCRIPTIONS MIGRATION COMPLETE';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created/updated:';
  RAISE NOTICE '  - financial_forecasts (added: is_base_forecast, assumptions, parent_forecast_id)';
  RAISE NOTICE '  - forecast_scenarios (new table)';
  RAISE NOTICE '  - subscription_audit_results (new table)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS policies created for all tables';
  RAISE NOTICE 'Updated_at triggers configured';
  RAISE NOTICE '==============================================';
END $$;
