-- Phase 20: Coaching Sessions Schema Reconciliation
-- Adds columns missing from coaching_sessions that the schedule page and API routes require.
-- Adds strategic_initiative_id to session_actions for linking actions to initiatives.
-- All changes are idempotent using IF NOT EXISTS guards.

-- ============================================
-- coaching_sessions: add missing columns
-- ============================================

ALTER TABLE coaching_sessions
  ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'video'
    CHECK (session_type IN ('video', 'phone', 'in-person'));

ALTER TABLE coaching_sessions
  ADD COLUMN IF NOT EXISTS prep_completed BOOLEAN DEFAULT FALSE;

ALTER TABLE coaching_sessions
  ADD COLUMN IF NOT EXISTS session_metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE coaching_sessions
  ADD COLUMN IF NOT EXISTS agenda JSONB DEFAULT '[]'::jsonb;

ALTER TABLE coaching_sessions
  ADD COLUMN IF NOT EXISTS summary TEXT;

-- ============================================
-- session_actions: add strategic_initiative_id
-- ============================================

ALTER TABLE session_actions
  ADD COLUMN IF NOT EXISTS strategic_initiative_id UUID
    REFERENCES strategic_initiatives(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_session_actions_initiative
  ON session_actions(strategic_initiative_id);
