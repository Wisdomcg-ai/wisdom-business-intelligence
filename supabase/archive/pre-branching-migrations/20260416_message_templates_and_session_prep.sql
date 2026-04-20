-- Phase 6: Message Templates in DB
-- Phase 11: Pre-Session Client Questionnaire

-- ============================================
-- Message Templates
-- ============================================

CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general', -- 'general', 'reminder', 'follow-up', 'check-in'
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_coach ON message_templates(coach_id);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can manage own templates" ON message_templates;
CREATE POLICY "Coaches can manage own templates"
  ON message_templates FOR ALL
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

-- Pre-seed with default templates (will be assigned to coach on first load)
-- These are inserted per-coach via the API, not as global seeds

-- ============================================
-- Session Prep (Pre-Session Questionnaire)
-- ============================================

CREATE TABLE IF NOT EXISTS public.session_prep (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id UUID REFERENCES auth.users(id),
  responses JSONB DEFAULT '{}',
  -- Standard fields: wins, challenges, topics, rock_updates
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id)
);

CREATE INDEX IF NOT EXISTS idx_session_prep_session ON session_prep(session_id);
CREATE INDEX IF NOT EXISTS idx_session_prep_business ON session_prep(business_id);

ALTER TABLE session_prep ENABLE ROW LEVEL SECURITY;

-- Clients can manage their own prep
DROP POLICY IF EXISTS "Clients can manage own session prep" ON session_prep;
CREATE POLICY "Clients can manage own session prep"
  ON session_prep FOR ALL
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

-- Coaches can view prep for their sessions
DROP POLICY IF EXISTS "Coaches can view session prep" ON session_prep;
CREATE POLICY "Coaches can view session prep"
  ON session_prep FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coaching_sessions cs
      WHERE cs.id = session_prep.session_id
      AND cs.coach_id = auth.uid()
    )
  );

-- Coaches can also insert prep (for creating the prep request)
DROP POLICY IF EXISTS "Coaches can create session prep" ON session_prep;
CREATE POLICY "Coaches can create session prep"
  ON session_prep FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coaching_sessions cs
      WHERE cs.id = session_prep.session_id
      AND cs.coach_id = auth.uid()
    )
  );
