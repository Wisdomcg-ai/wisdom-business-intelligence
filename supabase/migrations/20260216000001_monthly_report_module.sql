-- Monthly Report Module: Foundation Tables
-- Replaces Calxa for Budget vs Actual reporting

-- ============================================
-- Table: monthly_report_settings
-- Per-business configuration for report layout
-- ============================================
CREATE TABLE IF NOT EXISTS public.monthly_report_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- Section toggles (which report sections to include)
  sections jsonb NOT NULL DEFAULT '{
    "revenue_detail": true,
    "cogs_detail": true,
    "opex_detail": true,
    "contractor_summary": false,
    "payroll_detail": false,
    "subscription_detail": false,
    "balance_sheet": false,
    "cashflow": false,
    "trend_charts": true
  }',

  -- Column toggles
  show_prior_year boolean DEFAULT true,
  show_ytd boolean DEFAULT true,
  show_unspent_budget boolean DEFAULT true,
  show_budget_next_month boolean DEFAULT true,
  show_budget_annual_total boolean DEFAULT true,

  -- Which forecast to use as "the budget" for comparison
  budget_forecast_id uuid REFERENCES public.financial_forecasts(id),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(business_id)
);

ALTER TABLE monthly_report_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_report_settings_access" ON monthly_report_settings
  FOR ALL TO authenticated
  USING (auth_is_super_admin() OR business_id = ANY(auth_get_accessible_business_ids()))
  WITH CHECK (auth_is_super_admin() OR auth_can_manage_business(business_id));

-- ============================================
-- Table: account_mappings
-- Bridges Xero accounts to forecast/report categories
-- ============================================
CREATE TABLE IF NOT EXISTS public.account_mappings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- Xero side
  xero_account_code text,
  xero_account_name text NOT NULL,
  xero_account_type text,

  -- Report side
  report_category text NOT NULL,
  report_subcategory text,

  -- Mapping metadata
  is_auto_mapped boolean DEFAULT false,
  is_confirmed boolean DEFAULT false,
  mapped_by uuid,
  mapped_at timestamptz,

  -- Link to forecast line
  forecast_pl_line_id uuid,
  forecast_pl_line_name text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(business_id, xero_account_name)
);

CREATE INDEX idx_account_mappings_business ON account_mappings(business_id);
ALTER TABLE account_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_mappings_access" ON account_mappings
  FOR ALL TO authenticated
  USING (auth_is_super_admin() OR business_id = ANY(auth_get_accessible_business_ids()))
  WITH CHECK (auth_is_super_admin() OR auth_can_manage_business(business_id));

-- ============================================
-- Table: monthly_report_snapshots
-- Stores finalised report data for historical access
-- ============================================
CREATE TABLE IF NOT EXISTS public.monthly_report_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  report_month text NOT NULL,
  fiscal_year integer NOT NULL,

  status text NOT NULL DEFAULT 'draft',
  is_draft boolean DEFAULT true,
  unreconciled_count integer DEFAULT 0,

  -- Frozen report data
  report_data jsonb NOT NULL,
  summary jsonb NOT NULL,

  -- Coach-editable
  coach_notes text,
  commentary jsonb,

  generated_by uuid,
  generated_at timestamptz DEFAULT now(),
  pdf_exported_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(business_id, report_month)
);

CREATE INDEX idx_report_snapshots_business ON monthly_report_snapshots(business_id);
ALTER TABLE monthly_report_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_report_snapshots_access" ON monthly_report_snapshots
  FOR ALL TO authenticated
  USING (auth_is_super_admin() OR business_id = ANY(auth_get_accessible_business_ids()))
  WITH CHECK (auth_is_super_admin() OR auth_can_manage_business(business_id));
