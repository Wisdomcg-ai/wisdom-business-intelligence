-- Forecast Insights Table
-- Stores AI-generated insights for forecast wizard step 2
-- Insights are locked once generated, only regenerated if source data changes

CREATE TABLE IF NOT EXISTS forecast_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  insights JSONB NOT NULL DEFAULT '[]',
  data_hash TEXT, -- Hash of source data to detect changes
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint for upsert
  CONSTRAINT forecast_insights_business_year_unique UNIQUE (business_id, fiscal_year)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_forecast_insights_business_year
  ON forecast_insights(business_id, fiscal_year);

-- Enable RLS
ALTER TABLE forecast_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Business owners can view their own insights
CREATE POLICY "Users can view own business insights"
  ON forecast_insights FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Business owners can insert insights for their businesses
CREATE POLICY "Users can insert insights for own businesses"
  ON forecast_insights FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Business owners can update insights for their businesses
CREATE POLICY "Users can update insights for own businesses"
  ON forecast_insights FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Coaches can view insights for businesses they coach
CREATE POLICY "Coaches can view coached business insights"
  ON forecast_insights FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
    )
  );

-- Coaches can update insights for businesses they coach (for review/approval)
CREATE POLICY "Coaches can update coached business insights"
  ON forecast_insights FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
    )
  );

-- Add comment
COMMENT ON TABLE forecast_insights IS 'Stores AI-generated insights for forecast wizard. Insights are generated once and locked until source data changes.';
