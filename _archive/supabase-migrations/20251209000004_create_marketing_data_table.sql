-- Create marketing_data table for storing marketing-related JSONB data
-- Used by: Value Proposition page, and future marketing pages

CREATE TABLE IF NOT EXISTS marketing_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  -- JSONB columns for various marketing data
  value_proposition JSONB,  -- Target demographics, UVP, competitive advantage, etc.
  brand_messaging JSONB,    -- Brand voice, key messages (future)
  marketing_plan JSONB,     -- Marketing strategies and channels (future)
  content_calendar JSONB,   -- Content planning (future)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one record per user
  CONSTRAINT marketing_data_user_unique UNIQUE (user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_marketing_data_user_id ON marketing_data(user_id);

-- Enable RLS
ALTER TABLE marketing_data ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (makes migration idempotent)
DROP POLICY IF EXISTS "Users can view own marketing data" ON marketing_data;
DROP POLICY IF EXISTS "Users can insert own marketing data" ON marketing_data;
DROP POLICY IF EXISTS "Users can update own marketing data" ON marketing_data;
DROP POLICY IF EXISTS "Users can delete own marketing data" ON marketing_data;
DROP POLICY IF EXISTS "Coaches can view client marketing data" ON marketing_data;

-- RLS Policies
CREATE POLICY "Users can view own marketing data"
  ON marketing_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own marketing data"
  ON marketing_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own marketing data"
  ON marketing_data FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own marketing data"
  ON marketing_data FOR DELETE
  USING (auth.uid() = user_id);

-- Coach access policy (coaches can view their clients' marketing data)
CREATE POLICY "Coaches can view client marketing data"
  ON marketing_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND b.owner_id = marketing_data.user_id
    )
  );

-- Add comments
COMMENT ON TABLE marketing_data IS 'Stores marketing-related data including value proposition and brand messaging';
COMMENT ON COLUMN marketing_data.value_proposition IS 'JSONB: target_demographics, target_problems, target_location, uvp_statement, competitive_advantage, key_differentiators, competitors, usp_list';
