-- Add annual YTD columns to quarterly_reviews for step 3.3 confidence check
-- These allow manual entry of YTD figures for annual target progress tracking
-- Created: 2024-11-27

-- Add YTD columns for annual progress tracking
ALTER TABLE public.quarterly_reviews
  ADD COLUMN IF NOT EXISTS ytd_revenue_annual NUMERIC,
  ADD COLUMN IF NOT EXISTS ytd_gross_profit_annual NUMERIC,
  ADD COLUMN IF NOT EXISTS ytd_net_profit_annual NUMERIC;

-- Add comments
COMMENT ON COLUMN public.quarterly_reviews.ytd_revenue_annual IS 'Manual entry of YTD revenue for annual target confidence check';
COMMENT ON COLUMN public.quarterly_reviews.ytd_gross_profit_annual IS 'Manual entry of YTD gross profit for annual target confidence check';
COMMENT ON COLUMN public.quarterly_reviews.ytd_net_profit_annual IS 'Manual entry of YTD net profit for annual target confidence check';
