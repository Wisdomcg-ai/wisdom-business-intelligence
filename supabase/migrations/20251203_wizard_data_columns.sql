-- Add columns for Setup Wizard data persistence
-- This ensures all wizard step data is saved properly

-- 1. Add industry_id to track selected industry for 5 Ways
ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS industry_id VARCHAR(50);

COMMENT ON COLUMN financial_forecasts.industry_id IS 'Selected industry for 5 Ways calculations (e.g., construction, accounting, retail)';

-- 2. Add wizard_opex_categories for Step 4 Operating Costs planning
-- Stores the detailed OpEx category forecasts from the wizard
ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS wizard_opex_categories JSONB;

COMMENT ON COLUMN financial_forecasts.wizard_opex_categories IS 'OpEx categories from Setup Wizard Step 4 with forecasting methods';

-- 3. Add wizard_team_summary for quick access to team planning totals
-- (Individual team members are stored in forecast_employees table)
ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS wizard_team_summary JSONB;

COMMENT ON COLUMN financial_forecasts.wizard_team_summary IS 'Summary of team planning from Setup Wizard: totalWagesCOGS, totalWagesOpEx';

-- 4. Update forecast_employees to support wizard team planning fields
-- Add classification column if it doesn't exist (opex vs cogs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'forecast_employees' AND column_name = 'classification'
  ) THEN
    ALTER TABLE forecast_employees ADD COLUMN classification VARCHAR(10) CHECK (classification IN ('opex', 'cogs'));
  END IF;
END $$;

-- Add is_planned_hire column for new hires from wizard
ALTER TABLE forecast_employees
ADD COLUMN IF NOT EXISTS is_planned_hire BOOLEAN DEFAULT false;

COMMENT ON COLUMN forecast_employees.is_planned_hire IS 'True if this employee was added via Setup Wizard as a planned hire';

-- Add notes column if it doesn't exist
ALTER TABLE forecast_employees
ADD COLUMN IF NOT EXISTS notes TEXT;
