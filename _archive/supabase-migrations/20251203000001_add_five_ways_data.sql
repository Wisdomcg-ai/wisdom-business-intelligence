-- Add five_ways_data column to financial_forecasts table
-- Stores the 5 Ways/Business Engines data as JSONB

ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS five_ways_data JSONB;

-- Add comment for documentation
COMMENT ON COLUMN financial_forecasts.five_ways_data IS 'Stores 5 Ways business engine data: leads, conversion, transactions, avgSaleValue, margin with current/target values';
