-- Session Notes Migration
-- Created: November 29, 2024

-- =====================================================
-- 1. SESSION NOTES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS session_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  session_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  duration_minutes INTEGER,

  -- COACH FIELDS (coach editable)
  discussion_points TEXT,
  client_commitments TEXT,
  coach_action_items TEXT,          -- Private to coach
  private_observations TEXT,        -- Private to coach
  next_session_prep TEXT,           -- Private to coach
  transcript_url TEXT,
  transcript_name TEXT,

  -- CLIENT FIELDS (client editable)
  client_takeaways TEXT,
  client_notes TEXT,
  client_rating INTEGER CHECK (client_rating >= 1 AND client_rating <= 5),
  client_feedback TEXT,

  -- VISIBILITY
  visible_to_all_users BOOLEAN DEFAULT FALSE,

  -- TIMESTAMPS
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  coach_started_at TIMESTAMPTZ,
  client_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- One session per business per day
  UNIQUE(business_id, session_date)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_session_notes_business_id ON session_notes(business_id);
CREATE INDEX IF NOT EXISTS idx_session_notes_coach_id ON session_notes(coach_id);
CREATE INDEX IF NOT EXISTS idx_session_notes_session_date ON session_notes(session_date DESC);

-- =====================================================
-- 2. SESSION ATTENDEES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS session_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_note_id UUID NOT NULL REFERENCES session_notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_type TEXT NOT NULL CHECK (user_type IN ('coach', 'client')),
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_note_id, user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_session_attendees_session ON session_attendees(session_note_id);
CREATE INDEX IF NOT EXISTS idx_session_attendees_user ON session_attendees(user_id);

-- =====================================================
-- 3. RLS POLICIES FOR SESSION NOTES
-- =====================================================

ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;

-- Combined SELECT policy: Coach OR Business Owner can view
CREATE POLICY "select_session_notes" ON session_notes
  FOR SELECT
  USING (
    -- Coach who created or is assigned
    coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = session_notes.business_id
      AND b.assigned_coach_id = auth.uid()
    )
    -- Business owner (direct)
    OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = session_notes.business_id
      AND b.owner_id = auth.uid()
    )
    -- Business user via business_users table
    OR EXISTS (
      SELECT 1 FROM business_users bu
      WHERE bu.business_id = session_notes.business_id
      AND bu.user_id = auth.uid()
    )
  );

-- INSERT policy
CREATE POLICY "insert_session_notes" ON session_notes
  FOR INSERT
  WITH CHECK (
    -- Coach can insert for their clients
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = session_notes.business_id
      AND b.assigned_coach_id = auth.uid()
    )
    -- Business owner can insert
    OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = session_notes.business_id
      AND b.owner_id = auth.uid()
    )
    -- Business user can insert
    OR EXISTS (
      SELECT 1 FROM business_users bu
      WHERE bu.business_id = session_notes.business_id
      AND bu.user_id = auth.uid()
    )
  );

-- UPDATE policy
CREATE POLICY "update_session_notes" ON session_notes
  FOR UPDATE
  USING (
    -- Coach can update
    coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = session_notes.business_id
      AND b.assigned_coach_id = auth.uid()
    )
    -- Business owner can update
    OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = session_notes.business_id
      AND b.owner_id = auth.uid()
    )
    -- Business user can update
    OR EXISTS (
      SELECT 1 FROM business_users bu
      WHERE bu.business_id = session_notes.business_id
      AND bu.user_id = auth.uid()
    )
  );

-- =====================================================
-- 4. RLS POLICIES FOR SESSION ATTENDEES
-- =====================================================

ALTER TABLE session_attendees ENABLE ROW LEVEL SECURITY;

-- SELECT: Can view attendees if you're the coach or business owner
CREATE POLICY "select_session_attendees" ON session_attendees
  FOR SELECT
  USING (
    -- You are an attendee
    user_id = auth.uid()
    -- Or you're the coach for this business
    OR EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND (b.assigned_coach_id = auth.uid() OR sn.coach_id = auth.uid())
    )
    -- Or you're the business owner
    OR EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND b.owner_id = auth.uid()
    )
    -- Or you're a business user
    OR EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN business_users bu ON bu.business_id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND bu.user_id = auth.uid()
    )
  );

-- INSERT: Coach or business owner can add attendees
CREATE POLICY "insert_session_attendees" ON session_attendees
  FOR INSERT
  WITH CHECK (
    -- Coach can add
    EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND (b.assigned_coach_id = auth.uid() OR sn.coach_id = auth.uid())
    )
    -- Business owner can add
    OR EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND b.owner_id = auth.uid()
    )
    -- Business user can add themselves
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

-- DELETE: Coach or business owner can remove attendees
CREATE POLICY "delete_session_attendees" ON session_attendees
  FOR DELETE
  USING (
    -- Coach can delete
    EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND (b.assigned_coach_id = auth.uid() OR sn.coach_id = auth.uid())
    )
    -- Business owner can delete
    OR EXISTS (
      SELECT 1 FROM session_notes sn
      JOIN businesses b ON b.id = sn.business_id
      WHERE sn.id = session_attendees.session_note_id
      AND b.owner_id = auth.uid()
    )
  );

-- =====================================================
-- 5. UPDATED_AT TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION update_session_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS session_notes_updated_at ON session_notes;
CREATE TRIGGER session_notes_updated_at
  BEFORE UPDATE ON session_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_session_notes_updated_at();
