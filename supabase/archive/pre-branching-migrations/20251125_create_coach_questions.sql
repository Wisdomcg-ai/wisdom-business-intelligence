-- Create coach_questions table
CREATE TABLE IF NOT EXISTS coach_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('normal', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'archived')),
  coach_response TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_coach_questions_business_id ON coach_questions(business_id);
CREATE INDEX idx_coach_questions_user_id ON coach_questions(user_id);
CREATE INDEX idx_coach_questions_status ON coach_questions(status);
CREATE INDEX idx_coach_questions_created_at ON coach_questions(created_at DESC);

-- Enable RLS
ALTER TABLE coach_questions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can insert their own questions
CREATE POLICY "Users can insert their own questions"
  ON coach_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own questions
CREATE POLICY "Users can view their own questions"
  ON coach_questions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own pending questions
CREATE POLICY "Users can update their own pending questions"
  ON coach_questions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_coach_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coach_questions_updated_at
  BEFORE UPDATE ON coach_questions
  FOR EACH ROW
  EXECUTE FUNCTION update_coach_questions_updated_at();

-- Add helpful comment
COMMENT ON TABLE coach_questions IS 'Questions from clients to their coaches';
