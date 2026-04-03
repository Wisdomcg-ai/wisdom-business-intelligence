-- Enhanced Payroll Fields Migration
-- Add new columns for improved payroll functionality

-- 1. Add payroll settings to financial_forecasts table
ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS payroll_frequency TEXT DEFAULT 'fortnightly' CHECK (payroll_frequency IN ('weekly', 'fortnightly', 'monthly')),
ADD COLUMN IF NOT EXISTS pay_day TEXT CHECK (pay_day IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
ADD COLUMN IF NOT EXISTS superannuation_rate DECIMAL(5,4) DEFAULT 0.12,
ADD COLUMN IF NOT EXISTS wages_opex_pl_line_id UUID REFERENCES forecast_pl_lines(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS wages_cogs_pl_line_id UUID REFERENCES forecast_pl_lines(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS super_opex_pl_line_id UUID REFERENCES forecast_pl_lines(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS super_cogs_pl_line_id UUID REFERENCES forecast_pl_lines(id) ON DELETE SET NULL;

-- 2. Add new employee fields to forecast_employees table
ALTER TABLE forecast_employees
ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'opex' CHECK (classification IN ('opex', 'cogs')),
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS standard_hours_per_week DECIMAL(5,2) DEFAULT 40,
ADD COLUMN IF NOT EXISTS pay_per_period DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS super_per_period DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS payg_per_period DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS monthly_cost DECIMAL(10,2);

-- 3. Add payroll tracking to P&L lines
ALTER TABLE forecast_pl_lines
ADD COLUMN IF NOT EXISTS is_from_payroll BOOLEAN DEFAULT false;

-- 4. Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_forecast_employees_classification ON forecast_employees(classification);
CREATE INDEX IF NOT EXISTS idx_forecast_employees_dates ON forecast_employees(start_date, end_date);

-- 5. Update existing employees to have default classification based on category
UPDATE forecast_employees
SET classification = CASE
  WHEN category = 'Wages COGS' THEN 'cogs'
  ELSE 'opex'
END
WHERE classification IS NULL;

COMMENT ON COLUMN financial_forecasts.payroll_frequency IS 'How often employees are paid: weekly, fortnightly, or monthly';
COMMENT ON COLUMN financial_forecasts.pay_day IS 'Day of week for payroll (for weekly/fortnightly)';
COMMENT ON COLUMN financial_forecasts.superannuation_rate IS 'Superannuation rate as decimal (e.g., 0.12 for 12%)';
COMMENT ON COLUMN forecast_employees.classification IS 'Whether wages are OpEx or COGS';
COMMENT ON COLUMN forecast_employees.hourly_rate IS 'Hourly rate of pay';
COMMENT ON COLUMN forecast_employees.standard_hours_per_week IS 'Standard hours worked per week';
COMMENT ON COLUMN forecast_employees.pay_per_period IS 'Calculated pay per pay period';
COMMENT ON COLUMN forecast_employees.super_per_period IS 'Calculated superannuation per pay period';
COMMENT ON COLUMN forecast_employees.payg_per_period IS 'Calculated PAYG tax per pay period';
COMMENT ON COLUMN forecast_employees.monthly_cost IS 'Total monthly cost including super';
