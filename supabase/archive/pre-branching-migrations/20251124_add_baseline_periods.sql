-- Add baseline period fields to financial_forecasts table
-- This allows us to keep historical baseline (e.g., FY25) separate from rolling actuals (e.g., FY26 YTD)

ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS baseline_start_month VARCHAR(7), -- e.g., '2024-07' for Jul 2024
ADD COLUMN IF NOT EXISTS baseline_end_month VARCHAR(7);   -- e.g., '2025-06' for Jun 2025

-- Add helpful comments
COMMENT ON COLUMN financial_forecasts.baseline_start_month IS 'Start of baseline comparison period (typically prior fiscal year)';
COMMENT ON COLUMN financial_forecasts.baseline_end_month IS 'End of baseline comparison period (typically prior fiscal year)';
COMMENT ON COLUMN financial_forecasts.actual_start_month IS 'Start of current year actual period (for rolling forecasts, this is start of FY being forecasted)';
COMMENT ON COLUMN financial_forecasts.actual_end_month IS 'End of current year actual period (for rolling forecasts, this is last complete month of FY being forecasted)';
COMMENT ON COLUMN financial_forecasts.forecast_start_month IS 'Start of forecast period (remaining months to forecast)';
COMMENT ON COLUMN financial_forecasts.forecast_end_month IS 'End of forecast period (end of fiscal year)';

-- Backfill existing forecasts with baseline period (FY25 = Jul 2024 - Jun 2025)
-- Only update where baseline fields are null
UPDATE financial_forecasts
SET
  baseline_start_month = actual_start_month,
  baseline_end_month = actual_end_month
WHERE baseline_start_month IS NULL
  AND baseline_end_month IS NULL
  AND actual_start_month IS NOT NULL;
