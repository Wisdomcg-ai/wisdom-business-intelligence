-- Session Notes Complete Migration
-- Run this entire file in Supabase SQL Editor

-- =====================================================
-- STEP 1: DROP EXISTING (if re-running)
-- =====================================================
DROP TABLE IF EXISTS session_attendees CASCADE;
DROP TABLE IF EXISTS session_notes CASCADE;

-- =====================================================
-- STEP 2: CREATE SESSION NOTES TABLE
-- =====================================================
CREATE TABLE session_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  session_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  duration_minutes INTEGER,
  discussion_points TEXT,
  client_commitments TEXT,
  coach_action_items TEXT,
  private_observations TEXT,
  next_session_prep TEXT,
  transcript_url TEXT,
  transcript_name TEXT,
  client_takeaways TEXT,
  client_notes TEXT,
  client_rating INTEGER CHECK (client_rating >= 1 AND client_rating <= 5),
  client_feedback TEXT,
  visible_to_all_users BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  coach_started_at TIMESTAMPTZ,
  client_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(business_id, session_date)
);

CREATE INDEX idx_session_notes_business_id ON session_notes(business_id);
CREATE INDEX idx_session_notes_coach_id ON session_notes(coach_id);
CREATE INDEX idx_session_notes_session_date ON session_notes(session_date DESC);

-- =====================================================
-- STEP 3: CREATE SESSION ATTENDEES TABLE
-- =====================================================
CREATE TABLE session_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_note_id UUID NOT NULL REFERENCES session_notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_type TEXT NOT NULL CHECK (user_type IN ('coach', 'client')),
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_note_id, user_id)
);

CREATE INDEX idx_session_attendees_session ON session_attendees(session_note_id);
CREATE INDEX idx_session_attendees_user ON session_attendees(user_id);

-- =====================================================
-- STEP 4: ENABLE RLS
-- =====================================================
ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_attendees ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 5: SESSION NOTES POLICIES
-- =====================================================
CREATE POLICY "select_session_notes" ON session_notes
  FOR SELECT USING (
    coach_id = auth.uid()
    OR EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_notes.business_id AND b.assigned_coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_notes.business_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM business_users bu WHERE bu.business_id = session_notes.business_id AND bu.user_id = auth.uid())
  );

CREATE POLICY "insert_session_notes" ON session_notes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_notes.business_id AND b.assigned_coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_notes.business_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM business_users bu WHERE bu.business_id = session_notes.business_id AND bu.user_id = auth.uid())
  );

CREATE POLICY "update_session_notes" ON session_notes
  FOR UPDATE USING (
    coach_id = auth.uid()
    OR EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_notes.business_id AND b.assigned_coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM businesses b WHERE b.id = session_notes.business_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM business_users bu WHERE bu.business_id = session_notes.business_id AND bu.user_id = auth.uid())
  );

-- =====================================================
-- STEP 6: SESSION ATTENDEES POLICIES
-- =====================================================
CREATE POLICY "select_session_attendees" ON session_attendees
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND (b.assigned_coach_id = auth.uid() OR sn.coach_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND b.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN business_users bu ON bu.business_id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND bu.user_id = auth.uid()
    )
  );

CREATE POLICY "insert_session_attendees" ON session_attendees
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND (b.assigned_coach_id = auth.uid() OR sn.coach_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND b.owner_id = auth.uid()
    )
    OR (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM session_notes sn
        JOIN business_users bu ON bu.business_id = sn.business_id
        WHERE sn.id = session_attendees.session_note_id
        AND bu.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "delete_session_attendees" ON session_attendees
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND (b.assigned_coach_id = auth.uid() OR sn.coach_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND b.owner_id = auth.uid()
    )
  );

-- =====================================================
-- STEP 7: UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_session_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_notes_updated_at
  BEFORE UPDATE ON session_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_session_notes_updated_at();
