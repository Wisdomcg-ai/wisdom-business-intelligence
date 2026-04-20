-- Phase 28.1: Cashflow Engine Calxa Standard Rebuild — Settings Foundation
-- Creates 4 new tables that replace keyword-based account matching with
-- explicit Xero account ID selection. All schema changes are ADDITIVE.
-- Existing behaviour preserved via feature flag `use_explicit_accounts`.

-- ============================================================================
-- 1. xero_accounts — cached Chart of Accounts (full COA, per business)
-- ============================================================================

CREATE TABLE IF NOT EXISTS xero_accounts (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id     uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  xero_account_id text        NOT NULL,
  account_code    text,
  account_name    text        NOT NULL,
  xero_type       text,           -- BANK | CURRENT | CURRLIAB | FIXED | INVENTORY | EXPENSE | REVENUE | etc.
  xero_class      text,           -- ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
  xero_status     text,           -- ACTIVE | ARCHIVED
  tax_type        text,           -- BAS Excluded | GST on Expenses | GST on Income | GST on Capital
  description     text,
  last_synced_at  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, xero_account_id)
);

CREATE INDEX IF NOT EXISTS xero_accounts_business_idx
  ON xero_accounts (business_id);
CREATE INDEX IF NOT EXISTS xero_accounts_type_idx
  ON xero_accounts (business_id, xero_type);

ALTER TABLE xero_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xero_accounts_owner_all" ON xero_accounts
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "xero_accounts_coach_all" ON xero_accounts
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "xero_accounts_service_role" ON xero_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_xero_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER xero_accounts_updated_at
  BEFORE UPDATE ON xero_accounts
  FOR EACH ROW EXECUTE FUNCTION update_xero_accounts_updated_at();

-- ============================================================================
-- 2. cashflow_settings — per-forecast cashflow config with explicit account IDs
-- ============================================================================

CREATE TABLE IF NOT EXISTS cashflow_settings (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  forecast_id uuid        NOT NULL REFERENCES financial_forecasts(id) ON DELETE CASCADE,
  business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Feature flag: use explicit settings vs fall back to assumptions.cashflow
  use_explicit_accounts boolean NOT NULL DEFAULT false,

  -- Bank & Equity
  bank_account_ids              jsonb DEFAULT '[]',   -- array of Xero account IDs (multi-select)
  retained_earnings_account_id  text,
  current_year_earnings_account_id text,

  -- GST
  gst_method       text     DEFAULT 'Accrual' CHECK (gst_method IN ('Cash','Accrual')),
  gst_rate         numeric(5,4) DEFAULT 0.10,
  gst_collected_account_id text,
  gst_paid_account_id      text,
  gst_schedule     text     DEFAULT 'quarterly_bas_au',

  -- Wages / PAYG WH
  wages_expense_account_id text,
  payg_wh_rate     numeric(5,4),
  payg_wh_liability_account_id text,
  payg_wh_schedule text     DEFAULT 'quarterly_bas_au',

  -- Super
  super_expense_account_id text,
  super_payable_account_id text,
  super_rate       numeric(5,4) DEFAULT 0.115,
  super_schedule   text     DEFAULT 'quarterly_super_au',

  -- Depreciation (upgrade from keyword matching in 28.0)
  depreciation_expense_account_id      text,
  depreciation_accumulated_account_id  text,

  -- Debtors / Creditors
  debtors_account_id   text,
  creditors_account_id text,

  -- Company Tax
  company_tax_rate     numeric(5,4) DEFAULT 0.25,
  company_tax_liability_account_id text,
  company_tax_schedule text DEFAULT 'quarterly_payg_instalment',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (forecast_id)
);

CREATE INDEX IF NOT EXISTS cashflow_settings_business_idx
  ON cashflow_settings (business_id);

ALTER TABLE cashflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashflow_settings_owner_all" ON cashflow_settings
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "cashflow_settings_coach_all" ON cashflow_settings
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE assigned_coach_id = auth.uid())
  );

CREATE POLICY "cashflow_settings_service_role" ON cashflow_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_cashflow_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cashflow_settings_updated_at
  BEFORE UPDATE ON cashflow_settings
  FOR EACH ROW EXECUTE FUNCTION update_cashflow_settings_updated_at();

-- ============================================================================
-- 3. cashflow_account_profiles — per-account Type 1-5 overrides (Advanced view)
--    Populated and used in Phase 28.3. Table created here for future use.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cashflow_account_profiles (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  forecast_id      uuid        NOT NULL REFERENCES financial_forecasts(id) ON DELETE CASCADE,
  xero_account_id  text        NOT NULL,
  account_code     text,
  account_name     text,
  cashflow_type    integer     CHECK (cashflow_type BETWEEN 1 AND 5),  -- 1:Immediate, 2:DaysCountProfile, 3:CreditorDays, 4:DebtorDays, 5:Schedule
  days             double precision,                                    -- for Type 3 or 4
  distribution     jsonb,                                               -- number[12] for Type 2
  schedule_base_periods jsonb,                                          -- number[12] for Type 5
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (forecast_id, xero_account_id)
);

CREATE INDEX IF NOT EXISTS cashflow_account_profiles_forecast_idx
  ON cashflow_account_profiles (forecast_id);

ALTER TABLE cashflow_account_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashflow_account_profiles_owner_all" ON cashflow_account_profiles
  FOR ALL USING (
    forecast_id IN (
      SELECT id FROM financial_forecasts WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "cashflow_account_profiles_coach_all" ON cashflow_account_profiles
  FOR ALL USING (
    forecast_id IN (
      SELECT f.id FROM financial_forecasts f
      JOIN businesses b ON b.id = f.business_id OR b.id IN (
        SELECT business_id FROM business_profiles WHERE id = f.business_id
      )
      WHERE b.assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "cashflow_account_profiles_service_role" ON cashflow_account_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_cashflow_account_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cashflow_account_profiles_updated_at
  BEFORE UPDATE ON cashflow_account_profiles
  FOR EACH ROW EXECUTE FUNCTION update_cashflow_account_profiles_updated_at();

-- ============================================================================
-- 4. cashflow_statement_classification — four-list AASB 107 classification
--    Populated and used in Phase 28.4. Table created here for future use.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cashflow_statement_classification (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  forecast_id     uuid        NOT NULL REFERENCES financial_forecasts(id) ON DELETE CASCADE,
  xero_account_id text        NOT NULL,
  account_code    text,
  account_name    text,
  account_type    text,       -- Asset | Liability | Equity
  list_type       text        NOT NULL DEFAULT 'Unassigned' CHECK (list_type IN ('Operating','Investing','Financing','NonCash','Unassigned')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (forecast_id, xero_account_id)
);

CREATE INDEX IF NOT EXISTS cashflow_statement_classification_forecast_idx
  ON cashflow_statement_classification (forecast_id);

ALTER TABLE cashflow_statement_classification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashflow_statement_classification_owner_all" ON cashflow_statement_classification
  FOR ALL USING (
    forecast_id IN (SELECT id FROM financial_forecasts WHERE user_id = auth.uid())
  );

CREATE POLICY "cashflow_statement_classification_coach_all" ON cashflow_statement_classification
  FOR ALL USING (
    forecast_id IN (
      SELECT f.id FROM financial_forecasts f
      JOIN businesses b ON b.id = f.business_id OR b.id IN (
        SELECT business_id FROM business_profiles WHERE id = f.business_id
      )
      WHERE b.assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "cashflow_statement_classification_service_role" ON cashflow_statement_classification
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_cashflow_statement_classification_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cashflow_statement_classification_updated_at
  BEFORE UPDATE ON cashflow_statement_classification
  FOR EACH ROW EXECUTE FUNCTION update_cashflow_statement_classification_updated_at();
