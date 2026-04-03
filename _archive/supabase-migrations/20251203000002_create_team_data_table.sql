-- Create team_data table for storing team-related JSONB data
-- Used by: Accountability Chart, Hiring Roadmap pages

CREATE TABLE IF NOT EXISTS team_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  -- JSONB columns for various team data
  accountability_chart JSONB,  -- Roles, responsibilities, success metrics, culture
  hiring_roadmap JSONB,        -- Hiring priorities, retention strategy
  org_chart JSONB,             -- Organization structure (future)
  team_performance JSONB,      -- Performance tracking (future)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one record per user
  CONSTRAINT team_data_user_unique UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE team_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own team data"
  ON team_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own team data"
  ON team_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own team data"
  ON team_data FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own team data"
  ON team_data FOR DELETE
  USING (auth.uid() = user_id);

-- Coach access policy (coaches can view their clients' team data)
CREATE POLICY "Coaches can view client team data"
  ON team_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND b.owner_id = team_data.user_id
    )
  );

-- Add comments
COMMENT ON TABLE team_data IS 'Stores team-related data including accountability chart and hiring roadmap';
COMMENT ON COLUMN team_data.accountability_chart IS 'JSONB: roles array with function, person, responsibilities, success_metric; culture_description';
COMMENT ON COLUMN team_data.hiring_roadmap IS 'JSONB: hiring_priorities array, recognition_rewards, growth_opportunities, work_environment, compensation_strategy';
