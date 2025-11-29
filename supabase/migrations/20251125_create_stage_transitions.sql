-- Stage Transitions Table
-- Tracks when businesses move between roadmap stages

CREATE TABLE IF NOT EXISTS stage_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  from_stage TEXT, -- nullable for initial entry
  to_stage TEXT NOT NULL,
  revenue_at_transition NUMERIC,
  triggered_by TEXT NOT NULL DEFAULT 'revenue_update', -- 'revenue_update', 'manual', 'initial'
  transitioned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by business
CREATE INDEX idx_stage_transitions_business_id ON stage_transitions(business_id);

-- Index for getting latest transition
CREATE INDEX idx_stage_transitions_business_date ON stage_transitions(business_id, transitioned_at DESC);

-- RLS Policies
ALTER TABLE stage_transitions ENABLE ROW LEVEL SECURITY;

-- Users can view their own stage transitions
CREATE POLICY "Users can view own stage transitions"
  ON stage_transitions FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM business_profiles WHERE user_id = auth.uid()
    )
  );

-- Users can insert their own stage transitions
CREATE POLICY "Users can insert own stage transitions"
  ON stage_transitions FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM business_profiles WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE stage_transitions IS 'Tracks business progression through roadmap stages (Foundation → Mastery)';
COMMENT ON COLUMN stage_transitions.from_stage IS 'Previous stage (null for initial record)';
COMMENT ON COLUMN stage_transitions.to_stage IS 'Stage transitioned to';
COMMENT ON COLUMN stage_transitions.triggered_by IS 'What triggered the transition: revenue_update, manual, or initial';
