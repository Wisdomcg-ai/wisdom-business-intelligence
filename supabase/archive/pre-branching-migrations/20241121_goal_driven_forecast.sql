-- Goal-Driven Financial Forecasting
-- Adds support for annual goals, distribution strategies, and category-level assumptions

-- Add goal and assumption fields to financial_forecasts table
ALTER TABLE financial_forecasts
ADD COLUMN IF NOT EXISTS revenue_goal DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS gross_profit_goal DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS net_profit_goal DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS goal_source VARCHAR(50) DEFAULT 'manual', -- 'annual_plan' or 'manual'
ADD COLUMN IF NOT EXISTS annual_plan_id UUID,
ADD COLUMN IF NOT EXISTS revenue_distribution_method VARCHAR(50) DEFAULT 'even', -- 'even', 'linear', 'seasonal', 'custom'
ADD COLUMN IF NOT EXISTS revenue_distribution_data JSONB DEFAULT '{}', -- monthly targets
ADD COLUMN IF NOT EXISTS category_assumptions JSONB DEFAULT '{}'; -- assumptions per category

-- Add comment to describe the columns
COMMENT ON COLUMN financial_forecasts.revenue_goal IS 'Annual revenue target from Annual Plan or manual entry';
COMMENT ON COLUMN financial_forecasts.gross_profit_goal IS 'Annual gross profit target';
COMMENT ON COLUMN financial_forecasts.net_profit_goal IS 'Annual net profit target';
COMMENT ON COLUMN financial_forecasts.goal_source IS 'Source of goals: annual_plan or manual';
COMMENT ON COLUMN financial_forecasts.annual_plan_id IS 'Reference to annual_plans table if imported';
COMMENT ON COLUMN financial_forecasts.revenue_distribution_method IS 'How revenue is distributed across months';
COMMENT ON COLUMN financial_forecasts.revenue_distribution_data IS 'Monthly revenue targets as JSON';
COMMENT ON COLUMN financial_forecasts.category_assumptions IS 'Forecasting assumptions by category (Revenue, COGS, OpEx)';

-- Example category_assumptions structure:
-- {
--   "Revenue": {
--     "method": "seasonal_pattern",
--     "config": { "growth_rate": 0.05 }
--   },
--   "Cost of Sales": {
--     "method": "pct_of_revenue",
--     "config": { "percentage": 0.40 }
--   },
--   "Operating Expenses": {
--     "method": "straight_line",
--     "config": { "total_budget": 800000 }
--   }
-- }
