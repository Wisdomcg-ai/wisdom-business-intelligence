-- Phase 14: Extended period support on business_financial_goals
ALTER TABLE business_financial_goals
  ADD COLUMN IF NOT EXISTS is_extended_period BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS year1_months INTEGER DEFAULT 12,
  ADD COLUMN IF NOT EXISTS current_year_remaining_months INTEGER DEFAULT 0;

COMMENT ON COLUMN business_financial_goals.is_extended_period IS
  'True when Year 1 covers remaining current FY + full next FY (13-15 months)';
COMMENT ON COLUMN business_financial_goals.year1_months IS
  'Total months in Year 1 plan (12 standard, 13-15 for extended period)';
COMMENT ON COLUMN business_financial_goals.current_year_remaining_months IS
  'How many months of the current FY remain at wizard start time';
