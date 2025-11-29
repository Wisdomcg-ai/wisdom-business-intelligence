-- Add forecast_method and analysis columns to forecast_pl_lines table

-- Add forecast_method column to store forecasting configuration
ALTER TABLE forecast_pl_lines
ADD COLUMN IF NOT EXISTS forecast_method JSONB DEFAULT NULL;

-- Add analysis column to store calculated metrics
ALTER TABLE forecast_pl_lines
ADD COLUMN IF NOT EXISTS analysis JSONB DEFAULT NULL;

-- Add comment to describe the columns
COMMENT ON COLUMN forecast_pl_lines.forecast_method IS 'Stores the forecasting method configuration (method type, parameters, etc.)';
COMMENT ON COLUMN forecast_pl_lines.analysis IS 'Stores calculated analysis metrics (averages, percentages, trends, etc.)';
