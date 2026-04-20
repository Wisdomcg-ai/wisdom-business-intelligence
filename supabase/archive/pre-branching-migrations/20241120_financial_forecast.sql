-- Financial Forecast Tables
-- This migration creates tables for the financial forecasting feature with Xero integration

-- ============================================================================
-- 1. XERO CONNECTIONS TABLE
-- Stores Xero OAuth tokens and connection details
-- ============================================================================
CREATE TABLE IF NOT EXISTS xero_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Xero OAuth tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Xero organization details
  tenant_id TEXT NOT NULL, -- Xero organization/tenant ID
  tenant_name TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  UNIQUE(business_id, tenant_id)
);

-- ============================================================================
-- 2. FINANCIAL FORECASTS TABLE
-- Main table for forecast documents/versions
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Forecast metadata
  name TEXT NOT NULL,
  description TEXT,
  fiscal_year INTEGER NOT NULL, -- e.g., 2025
  year_type TEXT NOT NULL CHECK (year_type IN ('CY', 'FY')), -- Calendar Year or Fiscal Year

  -- Date range for the forecast
  actual_start_month TEXT NOT NULL, -- e.g., '2024-07' (Jul 2024)
  actual_end_month TEXT NOT NULL,   -- e.g., '2025-06' (Jun 2025)
  forecast_start_month TEXT NOT NULL, -- e.g., '2025-07' (Jul 2025)
  forecast_end_month TEXT NOT NULL,   -- e.g., '2026-06' (Jun 2026)

  -- Status
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,

  -- Xero sync info
  last_xero_sync_at TIMESTAMPTZ,
  xero_connection_id UUID REFERENCES xero_connections(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 3. FORECAST P&L LINES TABLE
-- Stores individual P&L line items with monthly data
-- ============================================================================
CREATE TABLE IF NOT EXISTS forecast_pl_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES financial_forecasts(id) ON DELETE CASCADE,

  -- Account details from Xero
  account_code TEXT,
  account_name TEXT NOT NULL,
  account_type TEXT, -- e.g., 'REVENUE', 'EXPENSE', 'OVERHEADS'
  account_class TEXT, -- e.g., 'REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY'

  -- Category classification
  category TEXT, -- User-defined category (e.g., 'Revenue', 'COGS', 'Operating Expenses')
  subcategory TEXT,

  -- Display order
  sort_order INTEGER DEFAULT 0,

  -- Monthly data stored as JSONB for flexibility
  -- Structure: { "2024-07": 10000, "2024-08": 12000, ... }
  actual_months JSONB DEFAULT '{}',    -- Actual values from Xero
  forecast_months JSONB DEFAULT '{}',  -- Forecasted values

  -- Metadata
  is_from_xero BOOLEAN DEFAULT false,
  is_manual BOOLEAN DEFAULT false,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  UNIQUE(forecast_id, account_code)
);

-- ============================================================================
-- 4. FORECAST EMPLOYEES TABLE
-- Stores employee/payroll information for forecast calculations
-- ============================================================================
CREATE TABLE IF NOT EXISTS forecast_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES financial_forecasts(id) ON DELETE CASCADE,

  -- Employee details
  employee_name TEXT NOT NULL,
  position TEXT,

  -- Wage category - determines which P&L line this feeds into
  category TEXT NOT NULL CHECK (category IN ('Wages Admin', 'Wages COGS', 'Contractor', 'Other')),

  -- Employment dates
  start_date DATE,
  end_date DATE,

  -- Compensation
  hours DECIMAL(10, 2), -- Hours per week/fortnight
  rate DECIMAL(10, 2),  -- Hourly rate
  weekly_budget DECIMAL(10, 2),
  annual_salary DECIMAL(12, 2),

  -- Tax withholding
  weekly_payg DECIMAL(10, 2), -- Pay As You Go tax withholding

  -- Superannuation (retirement)
  super_rate DECIMAL(5, 2) DEFAULT 11.0, -- Percentage (e.g., 11%)

  -- Display order
  sort_order INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 5. FORECAST PAYROLL SUMMARY TABLE
-- Stores monthly payroll calculations
-- ============================================================================
CREATE TABLE IF NOT EXISTS forecast_payroll_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES financial_forecasts(id) ON DELETE CASCADE,

  -- Monthly data stored as JSONB
  -- Structure: { "2024-07": 4, "2024-08": 5, ... } for pay_runs_per_month
  -- Structure: { "2024-07": 15000, "2024-08": 18000, ... } for monetary values
  pay_runs_per_month JSONB DEFAULT '{}', -- Number of pay periods in each month
  wages_admin_monthly JSONB DEFAULT '{}',
  wages_cogs_monthly JSONB DEFAULT '{}',
  payg_monthly JSONB DEFAULT '{}',
  net_wages_monthly JSONB DEFAULT '{}',
  superannuation_monthly JSONB DEFAULT '{}',
  payroll_tax_monthly JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  UNIQUE(forecast_id)
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================
CREATE INDEX idx_xero_connections_business ON xero_connections(business_id);
CREATE INDEX idx_xero_connections_active ON xero_connections(business_id, is_active);

CREATE INDEX idx_financial_forecasts_business ON financial_forecasts(business_id);
CREATE INDEX idx_financial_forecasts_year ON financial_forecasts(business_id, fiscal_year);

CREATE INDEX idx_forecast_pl_lines_forecast ON forecast_pl_lines(forecast_id);
CREATE INDEX idx_forecast_pl_lines_category ON forecast_pl_lines(forecast_id, category);

CREATE INDEX idx_forecast_employees_forecast ON forecast_employees(forecast_id);
CREATE INDEX idx_forecast_employees_category ON forecast_employees(forecast_id, category);

CREATE INDEX idx_forecast_payroll_summary_forecast ON forecast_payroll_summary(forecast_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE xero_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_pl_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_payroll_summary ENABLE ROW LEVEL SECURITY;

-- Xero Connections Policies
CREATE POLICY "Users can view their own xero connections"
  ON xero_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own xero connections"
  ON xero_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own xero connections"
  ON xero_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own xero connections"
  ON xero_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Financial Forecasts Policies
CREATE POLICY "Users can view their business forecasts"
  ON financial_forecasts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert forecasts for their business"
  ON financial_forecasts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their business forecasts"
  ON financial_forecasts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their business forecasts"
  ON financial_forecasts FOR DELETE
  USING (auth.uid() = user_id);

-- Forecast P&L Lines Policies
CREATE POLICY "Users can view pl lines for their forecasts"
  ON forecast_pl_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM financial_forecasts
    WHERE financial_forecasts.id = forecast_pl_lines.forecast_id
    AND financial_forecasts.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert pl lines for their forecasts"
  ON forecast_pl_lines FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM financial_forecasts
    WHERE financial_forecasts.id = forecast_pl_lines.forecast_id
    AND financial_forecasts.user_id = auth.uid()
  ));

CREATE POLICY "Users can update pl lines for their forecasts"
  ON forecast_pl_lines FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM financial_forecasts
    WHERE financial_forecasts.id = forecast_pl_lines.forecast_id
    AND financial_forecasts.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete pl lines for their forecasts"
  ON forecast_pl_lines FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM financial_forecasts
    WHERE financial_forecasts.id = forecast_pl_lines.forecast_id
    AND financial_forecasts.user_id = auth.uid()
  ));

-- Forecast Employees Policies
CREATE POLICY "Users can view employees for their forecasts"
  ON forecast_employees FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM financial_forecasts
    WHERE financial_forecasts.id = forecast_employees.forecast_id
    AND financial_forecasts.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert employees for their forecasts"
  ON forecast_employees FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM financial_forecasts
    WHERE financial_forecasts.id = forecast_employees.forecast_id
    AND financial_forecasts.user_id = auth.uid()
  ));

CREATE POLICY "Users can update employees for their forecasts"
  ON forecast_employees FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM financial_forecasts
    WHERE financial_forecasts.id = forecast_employees.forecast_id
    AND financial_forecasts.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete employees for their forecasts"
  ON forecast_employees FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM financial_forecasts
    WHERE financial_forecasts.id = forecast_employees.forecast_id
    AND financial_forecasts.user_id = auth.uid()
  ));

-- Forecast Payroll Summary Policies
CREATE POLICY "Users can view payroll summary for their forecasts"
  ON forecast_payroll_summary FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM financial_forecasts
    WHERE financial_forecasts.id = forecast_payroll_summary.forecast_id
    AND financial_forecasts.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert payroll summary for their forecasts"
  ON forecast_payroll_summary FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM financial_forecasts
    WHERE financial_forecasts.id = forecast_payroll_summary.forecast_id
    AND financial_forecasts.user_id = auth.uid()
  ));

CREATE POLICY "Users can update payroll summary for their forecasts"
  ON forecast_payroll_summary FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM financial_forecasts
    WHERE financial_forecasts.id = forecast_payroll_summary.forecast_id
    AND financial_forecasts.user_id = auth.uid()
  ));

-- ============================================================================
-- FUNCTIONS for automatic timestamp updates
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_xero_connections_updated_at
  BEFORE UPDATE ON xero_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_financial_forecasts_updated_at
  BEFORE UPDATE ON financial_forecasts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_forecast_pl_lines_updated_at
  BEFORE UPDATE ON forecast_pl_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_forecast_employees_updated_at
  BEFORE UPDATE ON forecast_employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_forecast_payroll_summary_updated_at
  BEFORE UPDATE ON forecast_payroll_summary
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
