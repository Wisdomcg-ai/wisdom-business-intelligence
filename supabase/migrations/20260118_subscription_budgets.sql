-- Subscription Budgets Table
-- Stores user-confirmed subscription budget items from Step 6 of Forecast Wizard

CREATE TABLE IF NOT EXISTS subscription_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  forecast_id UUID REFERENCES forecasts(id) ON DELETE SET NULL,

  -- Vendor information
  vendor_name TEXT NOT NULL,
  vendor_key TEXT NOT NULL,

  -- Budget settings (user-confirmed)
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'annual', 'ad-hoc')),
  monthly_budget DECIMAL(12,2) NOT NULL DEFAULT 0,
  annual_budget DECIMAL(12,2) GENERATED ALWAYS AS (
    CASE
      WHEN frequency = 'monthly' THEN monthly_budget * 12
      WHEN frequency = 'quarterly' THEN monthly_budget * 12
      WHEN frequency = 'annual' THEN monthly_budget * 12
      ELSE monthly_budget * 12
    END
  ) STORED,

  -- Historical data from analysis
  last_12_months_spend DECIMAL(12,2) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  avg_transaction_amount DECIMAL(12,2) DEFAULT 0,
  last_transaction_date DATE,

  -- Account mapping
  account_codes TEXT[] DEFAULT '{}',

  -- User notes/flags
  is_active BOOLEAN DEFAULT true,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint per business + vendor
  UNIQUE(business_id, vendor_key)
);

-- Index for fast lookups
CREATE INDEX idx_subscription_budgets_business ON subscription_budgets(business_id);
CREATE INDEX idx_subscription_budgets_forecast ON subscription_budgets(forecast_id);
CREATE INDEX idx_subscription_budgets_active ON subscription_budgets(business_id, is_active);

-- RLS Policies
ALTER TABLE subscription_budgets ENABLE ROW LEVEL SECURITY;

-- Users can view subscription budgets for businesses they have access to
CREATE POLICY "Users can view subscription budgets for their businesses"
  ON subscription_budgets FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

-- Users can insert subscription budgets for businesses they have access to
CREATE POLICY "Users can insert subscription budgets for their businesses"
  ON subscription_budgets FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

-- Users can update subscription budgets for businesses they have access to
CREATE POLICY "Users can update subscription budgets for their businesses"
  ON subscription_budgets FOR UPDATE
  USING (
    business_id IN (
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

-- Users can delete subscription budgets for businesses they have access to
CREATE POLICY "Users can delete subscription budgets for their businesses"
  ON subscription_budgets FOR DELETE
  USING (
    business_id IN (
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_subscription_budgets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscription_budgets_updated_at
  BEFORE UPDATE ON subscription_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_budgets_updated_at();

-- Comment
COMMENT ON TABLE subscription_budgets IS 'Stores subscription/recurring expense budgets set by users in the Forecast Wizard';
