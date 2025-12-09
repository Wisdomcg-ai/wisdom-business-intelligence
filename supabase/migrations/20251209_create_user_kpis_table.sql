-- Create user_kpis table for storing user-selected KPIs
-- Used by: KPI Selection page

CREATE TABLE IF NOT EXISTS user_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kpi_id TEXT NOT NULL,  -- Reference to the KPI template ID

  -- KPI details (stored for flexibility and offline access)
  name TEXT NOT NULL,
  friendly_name TEXT,
  description TEXT,
  category TEXT,
  frequency TEXT DEFAULT 'monthly',  -- daily, weekly, monthly, quarterly, annually
  unit TEXT,  -- e.g., '$', '%', 'count'
  target_benchmark TEXT,
  why_it_matters TEXT,
  what_to_do TEXT,
  is_universal BOOLEAN DEFAULT false,

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate KPIs for the same user
  CONSTRAINT user_kpis_unique UNIQUE (user_id, kpi_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_kpis_user_id ON user_kpis(user_id);

-- Enable RLS
ALTER TABLE user_kpis ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (makes migration idempotent)
DROP POLICY IF EXISTS "Users can view own KPIs" ON user_kpis;
DROP POLICY IF EXISTS "Users can insert own KPIs" ON user_kpis;
DROP POLICY IF EXISTS "Users can update own KPIs" ON user_kpis;
DROP POLICY IF EXISTS "Users can delete own KPIs" ON user_kpis;
DROP POLICY IF EXISTS "Coaches can view client KPIs" ON user_kpis;

-- RLS Policies
CREATE POLICY "Users can view own KPIs"
  ON user_kpis FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own KPIs"
  ON user_kpis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own KPIs"
  ON user_kpis FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own KPIs"
  ON user_kpis FOR DELETE
  USING (auth.uid() = user_id);

-- Coach access policy (coaches can view their clients' KPIs)
CREATE POLICY "Coaches can view client KPIs"
  ON user_kpis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_users bu
      JOIN businesses b ON bu.business_id = b.id
      WHERE bu.user_id = auth.uid()
      AND bu.role = 'coach'
      AND b.owner_id = user_kpis.user_id
    )
  );

-- Add comments
COMMENT ON TABLE user_kpis IS 'Stores user-selected KPIs from the KPI selection page';
COMMENT ON COLUMN user_kpis.kpi_id IS 'Reference ID to the KPI template';
COMMENT ON COLUMN user_kpis.frequency IS 'How often this KPI should be tracked: daily, weekly, monthly, quarterly, annually';
