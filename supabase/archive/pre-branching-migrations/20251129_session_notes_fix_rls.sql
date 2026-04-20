-- Fix RLS policies for session_notes - removes infinite recursion
-- Run this AFTER the tables already exist

-- =====================================================
-- DROP OLD POLICIES
-- =====================================================

DROP POLICY IF EXISTS "coach_view_session_notes" ON session_notes;
DROP POLICY IF EXISTS "coach_insert_session_notes" ON session_notes;
DROP POLICY IF EXISTS "coach_update_session_notes" ON session_notes;
DROP POLICY IF EXISTS "business_owner_view_session_notes" ON session_notes;
DROP POLICY IF EXISTS "business_user_insert_session_notes" ON session_notes;
DROP POLICY IF EXISTS "business_user_update_session_notes" ON session_notes;
DROP POLICY IF EXISTS "team_member_view_session_notes" ON session_notes;
DROP POLICY IF EXISTS "select_session_notes" ON session_notes;
DROP POLICY IF EXISTS "insert_session_notes" ON session_notes;
DROP POLICY IF EXISTS "update_session_notes" ON session_notes;

DROP POLICY IF EXISTS "view_session_attendees" ON session_attendees;
DROP POLICY IF EXISTS "coach_manage_attendees" ON session_attendees;
DROP POLICY IF EXISTS "business_owner_manage_attendees" ON session_attendees;
DROP POLICY IF EXISTS "select_session_attendees" ON session_attendees;
DROP POLICY IF EXISTS "insert_session_attendees" ON session_attendees;
DROP POLICY IF EXISTS "delete_session_attendees" ON session_attendees;

-- =====================================================
-- NEW SESSION NOTES POLICIES (no recursion)
-- =====================================================

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
-- NEW SESSION ATTENDEES POLICIES (no recursion)
-- =====================================================

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
