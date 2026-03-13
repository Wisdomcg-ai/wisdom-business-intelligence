-- Annual Review Support (Option C)
-- Adds JSONB columns for annual-only review steps to quarterly_reviews table

ALTER TABLE quarterly_reviews
  ADD COLUMN IF NOT EXISTS year_in_review JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vision_strategy JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS next_year_targets JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS annual_initiative_plan JSONB DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN quarterly_reviews.year_in_review IS 'Annual review step A4.1: Full year scorecard and state of business';
COMMENT ON COLUMN quarterly_reviews.vision_strategy IS 'Annual review step A4.2: Vision, mission, and strategy alignment check';
COMMENT ON COLUMN quarterly_reviews.next_year_targets IS 'Annual review step A4.3: Next year financial targets';
COMMENT ON COLUMN quarterly_reviews.annual_initiative_plan IS 'Annual review step A4.4: Next year initiative planning by quarter';
