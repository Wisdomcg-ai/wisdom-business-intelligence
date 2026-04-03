-- AI CFO Conversations Table
-- Stores all conversations with the AI CFO for learning and improvement

CREATE TABLE IF NOT EXISTS ai_cfo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Session tracking (allows grouping messages in a conversation)
  session_id UUID NOT NULL,

  -- Context
  wizard_step INT NOT NULL, -- 1-8
  active_year INT NOT NULL DEFAULT 1, -- 1, 2, or 3
  fiscal_year INT, -- e.g., 2026

  -- Message content
  user_message TEXT NOT NULL,
  ai_response TEXT,

  -- Tracking which quick actions are used
  quick_action_used TEXT, -- e.g., 'Analyze Expenses', 'Find Savings', null for custom questions

  -- Metadata
  response_time_ms INT, -- How long the AI took to respond
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_ai_cfo_conversations_business ON ai_cfo_conversations(business_id);
CREATE INDEX idx_ai_cfo_conversations_session ON ai_cfo_conversations(session_id);
CREATE INDEX idx_ai_cfo_conversations_step ON ai_cfo_conversations(wizard_step);
CREATE INDEX idx_ai_cfo_conversations_created ON ai_cfo_conversations(created_at DESC);

-- RLS Policies
ALTER TABLE ai_cfo_conversations ENABLE ROW LEVEL SECURITY;

-- Users can read their own conversations
CREATE POLICY "Users can read own conversations"
  ON ai_cfo_conversations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own conversations
CREATE POLICY "Users can insert own conversations"
  ON ai_cfo_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Coaches can read conversations for their assigned clients' businesses
CREATE POLICY "Coaches can read client conversations"
  ON ai_cfo_conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = ai_cfo_conversations.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- Add comment for documentation
COMMENT ON TABLE ai_cfo_conversations IS 'Stores AI CFO chat conversations for learning and analytics';
COMMENT ON COLUMN ai_cfo_conversations.session_id IS 'Groups messages in a single conversation session';
COMMENT ON COLUMN ai_cfo_conversations.quick_action_used IS 'Tracks which quick action button triggered this message, null for typed questions';
