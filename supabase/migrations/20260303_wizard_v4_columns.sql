-- Add columns needed by the Forecast Wizard V4 endpoint
-- These store the full wizard assumptions and multi-year configuration

ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS assumptions JSONB;

ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS forecast_duration INTEGER DEFAULT 1;

ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS wizard_state JSONB;

COMMENT ON COLUMN financial_forecasts.assumptions IS 'Full wizard V4 assumptions JSON (revenue lines, COGS, team, OpEx, CapEx)';
COMMENT ON COLUMN financial_forecasts.forecast_duration IS 'Forecast duration in years (1, 2, or 3)';
COMMENT ON COLUMN financial_forecasts.wizard_state IS 'Summary state from the wizard for quick restoration';
