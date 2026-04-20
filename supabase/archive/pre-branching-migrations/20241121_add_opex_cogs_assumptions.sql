-- Add OpEx breakdown and COGS assumptions to financial_forecasts
-- These fields support the expense assumptions UI in the forecast builder

ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS cogs_percentage DECIMAL(5, 4), -- e.g., 0.4000 = 40%
ADD COLUMN IF NOT EXISTS opex_wages DECIMAL(15, 2), -- Annual wages from payroll
ADD COLUMN IF NOT EXISTS opex_fixed DECIMAL(15, 2), -- Annual fixed costs (rent, insurance, etc.)
ADD COLUMN IF NOT EXISTS opex_variable DECIMAL(15, 2), -- Annual variable costs (marketing, etc.)
ADD COLUMN IF NOT EXISTS opex_variable_percentage DECIMAL(5, 4), -- e.g., 0.0500 = 5% of revenue
ADD COLUMN IF NOT EXISTS opex_other DECIMAL(15, 2); -- Annual other/seasonal costs

-- Add comments to describe each field
COMMENT ON COLUMN financial_forecasts.cogs_percentage IS 'Cost of Sales as percentage of revenue (e.g., 0.40 = 40% COGS, 60% GP margin)';
COMMENT ON COLUMN financial_forecasts.opex_wages IS 'Annual wages and salaries (calculated from Payroll & Staff tab)';
COMMENT ON COLUMN financial_forecasts.opex_fixed IS 'Annual fixed operating expenses (rent, insurance, subscriptions) - distributed evenly';
COMMENT ON COLUMN financial_forecasts.opex_variable IS 'Annual variable operating expenses (marketing, commissions, supplies) - can be fixed amount or % of revenue';
COMMENT ON COLUMN financial_forecasts.opex_variable_percentage IS 'Variable OpEx as percentage of revenue (used instead of opex_variable if user chooses % method)';
COMMENT ON COLUMN financial_forecasts.opex_other IS 'Annual other/seasonal operating expenses (uses historical pattern or even split)';

-- These fields work together to calculate:
-- Gross Profit = Revenue * (1 - cogs_percentage)
-- Total OpEx = opex_wages + opex_fixed + (opex_variable OR revenue * opex_variable_percentage) + opex_other
-- Net Profit = Gross Profit - Total OpEx
