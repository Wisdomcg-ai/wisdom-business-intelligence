-- ============================================================
-- FIX SCRIPT: Apply this manually via Supabase SQL Editor
-- ============================================================
-- This script handles cleanup and re-creation of tables that
-- may have been partially created from failed migrations.
-- ============================================================

-- PART 1: Clean up any partial state
-- ============================================================

-- Drop tables with CASCADE (this also drops policies)
DROP TABLE IF EXISTS forecast_scenarios CASCADE;
DROP TABLE IF EXISTS forecast_insights CASCADE;

-- PART 2: Add columns to financial_forecasts
-- ============================================================

ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS is_base_forecast BOOLEAN DEFAULT true;

ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS assumptions JSONB DEFAULT '{}';

ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS parent_forecast_id UUID REFERENCES financial_forecasts(id) ON DELETE CASCADE;

-- PART 3: Create forecast_scenarios table
-- ============================================================

CREATE TABLE forecast_scenarios (
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

-- Enable RLS
ALTER TABLE forecast_scenarios ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

-- PART 4: Create forecast_insights table
-- ============================================================

CREATE TABLE forecast_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  insights JSONB NOT NULL DEFAULT '[]',
  data_hash TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT forecast_insights_business_year_unique UNIQUE (business_id, fiscal_year)
);

-- Enable RLS
ALTER TABLE forecast_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own business insights"
  ON forecast_insights FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert insights for own businesses"
  ON forecast_insights FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update insights for own businesses"
  ON forecast_insights FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can view coached business insights"
  ON forecast_insights FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update coached business insights"
  ON forecast_insights FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
    )
  );

-- PART 5: Create subscription_audit_results table (if not exists)
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_audit_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  forecast_id UUID REFERENCES financial_forecasts(id) ON DELETE SET NULL,
  vendor_name TEXT NOT NULL,
  vendor_normalized TEXT,
  source_account_id TEXT,
  source_account_name TEXT,
  detected_frequency TEXT CHECK (detected_frequency IN ('monthly', 'quarterly', 'annual', 'irregular')),
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  typical_amount DECIMAL(12,2),
  annual_total DECIMAL(12,2),
  cost_per_employee DECIMAL(12,2),
  status TEXT DEFAULT 'review' CHECK (status IN ('essential', 'review', 'reduce', 'cancel')),
  user_notes TEXT,
  last_payment_date DATE,
  next_expected_date DATE,
  payment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_vendor_per_business UNIQUE(business_id, vendor_normalized)
);

ALTER TABLE subscription_audit_results ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "subscription_audit_select_policy" ON subscription_audit_results;
DROP POLICY IF EXISTS "subscription_audit_insert_policy" ON subscription_audit_results;
DROP POLICY IF EXISTS "subscription_audit_update_policy" ON subscription_audit_results;
DROP POLICY IF EXISTS "subscription_audit_delete_policy" ON subscription_audit_results;

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

-- PART 6: Create indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_forecasts_parent
ON financial_forecasts(parent_forecast_id)
WHERE parent_forecast_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_forecasts_is_base
ON financial_forecasts(business_id, is_base_forecast)
WHERE is_base_forecast = true;

CREATE INDEX IF NOT EXISTS idx_scenarios_base_forecast ON forecast_scenarios(base_forecast_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_active ON forecast_scenarios(base_forecast_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_forecast_insights_business_year
  ON forecast_insights(business_id, fiscal_year);

CREATE INDEX IF NOT EXISTS idx_subscription_audit_business ON subscription_audit_results(business_id);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_forecast ON subscription_audit_results(forecast_id);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_status ON subscription_audit_results(business_id, status);

-- PART 7: Create updated_at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_forecast_scenarios_updated_at ON forecast_scenarios;
CREATE TRIGGER update_forecast_scenarios_updated_at
  BEFORE UPDATE ON forecast_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_forecast_insights_updated_at ON forecast_insights;
CREATE TRIGGER update_forecast_insights_updated_at
  BEFORE UPDATE ON forecast_insights
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscription_audit_updated_at ON subscription_audit_results;
CREATE TRIGGER update_subscription_audit_updated_at
  BEFORE UPDATE ON subscription_audit_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Done!
SELECT 'Migration fix complete!' as status;
