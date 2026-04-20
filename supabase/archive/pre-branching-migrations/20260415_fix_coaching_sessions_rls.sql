-- Fix: coaching_sessions RLS policy needs WITH CHECK for INSERT to work
-- The existing FOR ALL policy only has USING which blocks inserts via PostgREST.

DROP POLICY IF EXISTS "Coaches can manage their sessions" ON coaching_sessions;

CREATE POLICY "Coaches can manage their sessions"
  ON coaching_sessions FOR ALL
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);
