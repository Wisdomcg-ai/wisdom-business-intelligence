-- Cashflow Assumptions table for Calxa-style cash budget forecasting
-- Stores cash timing, GST/BAS settings, opening balances, loans, and stock assumptions per forecast

CREATE TABLE IF NOT EXISTS cashflow_assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES financial_forecasts(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,

  -- Cash timing
  dso_days INTEGER NOT NULL DEFAULT 30,
  dso_auto_calculated BOOLEAN NOT NULL DEFAULT false,
  dpo_days INTEGER NOT NULL DEFAULT 30,
  dpo_auto_calculated BOOLEAN NOT NULL DEFAULT false,

  -- GST
  gst_registered BOOLEAN NOT NULL DEFAULT true,
  gst_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  gst_reporting_frequency TEXT NOT NULL DEFAULT 'quarterly' CHECK (gst_reporting_frequency IN ('monthly', 'quarterly')),
  gst_applicable_expense_pct NUMERIC(5,4) NOT NULL DEFAULT 0.80,

  -- Superannuation
  super_payment_frequency TEXT NOT NULL DEFAULT 'quarterly' CHECK (super_payment_frequency IN ('monthly', 'quarterly')),

  -- PAYG Withholding
  payg_wh_reporting_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (payg_wh_reporting_frequency IN ('monthly', 'quarterly')),

  -- PAYG Instalments
  payg_instalment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payg_instalment_frequency TEXT NOT NULL DEFAULT 'quarterly' CHECK (payg_instalment_frequency IN ('quarterly', 'annual', 'none')),

  -- Opening balances
  opening_bank_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_trade_debtors NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_trade_creditors NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_gst_liability NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_payg_wh_liability NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_payg_instalment_liability NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_super_liability NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_stock NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Stock/Inventory changes (monthly overrides)
  planned_stock_changes JSONB NOT NULL DEFAULT '{}',

  -- Loan schedules
  loans JSONB NOT NULL DEFAULT '[]',

  -- Metadata
  balance_date TEXT,
  last_xero_sync_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One set of assumptions per forecast
  CONSTRAINT cashflow_assumptions_forecast_unique UNIQUE (forecast_id)
);

-- Index (forecast_id already has a unique constraint index)
CREATE INDEX idx_cashflow_assumptions_business_id ON cashflow_assumptions(business_id);

-- RLS
ALTER TABLE cashflow_assumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cashflow_assumptions_access" ON cashflow_assumptions
  FOR ALL TO authenticated
  USING (auth_is_super_admin() OR business_id = ANY(auth_get_accessible_business_ids()))
  WITH CHECK (auth_is_super_admin() OR auth_can_manage_business(business_id));
