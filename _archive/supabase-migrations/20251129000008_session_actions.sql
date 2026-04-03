-- Session Actions Migration
-- Structured accountability tracking from coaching sessions
-- RUN AFTER session_notes table exists

DROP TABLE IF EXISTS session_actions CASCADE;

CREATE TABLE session_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_note_id UUID REFERENCES session_notes(id) ON DELETE SET NULL,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  action_number INTEGER NOT NULL CHECK (action_number >= 1),
  description TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'carried_over')),
  completed_at TIMESTAMPTZ,
  follow_up_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_in_session_id UUID REFERENCES session_notes(id) ON DELETE SET NULL,
  carried_over_to_id UUID REFERENCES session_actions(id) ON DELETE SET NULL,
  carried_over_from_id UUID REFERENCES session_actions(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_actions_business ON session_actions(business_id);
CREATE INDEX idx_session_actions_session ON session_actions(session_note_id);
CREATE INDEX idx_session_actions_status ON session_actions(status);
CREATE INDEX idx_session_actions_due_date ON session_actions(due_date);
CREATE INDEX idx_session_actions_pending ON session_actions(business_id, status) WHERE status = 'pending';

ALTER TABLE session_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_session_actions" ON session_actions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_actions.business_id AND b.assigned_coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_actions.business_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM business_users bu WHERE bu.business_id = session_actions.business_id AND bu.user_id = auth.uid())
  );

CREATE POLICY "insert_session_actions" ON session_actions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_actions.business_id AND b.assigned_coach_id = auth.uid())
  );

CREATE POLICY "update_session_actions" ON session_actions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_actions.business_id AND b.assigned_coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_actions.business_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM business_users bu WHERE bu.business_id = session_actions.business_id AND bu.user_id = auth.uid())
  );

CREATE POLICY "delete_session_actions" ON session_actions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_actions.business_id AND b.assigned_coach_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION update_session_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_actions_updated_at
  BEFORE UPDATE ON session_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_actions_updated_at();
