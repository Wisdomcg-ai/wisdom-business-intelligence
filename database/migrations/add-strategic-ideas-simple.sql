-- Simple migration for strategic_initiatives enhancements
-- Run this directly in Supabase SQL Editor

-- Create table if needed
CREATE TABLE IF NOT EXISTS strategic_initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  step_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add new columns (run each separately if needed)
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS estimated_effort TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS timeline TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS selected BOOLEAN DEFAULT false;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS linked_kpis JSONB;

-- Create sprint_key_actions table
CREATE TABLE IF NOT EXISTS sprint_key_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  owner TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_business_id ON strategic_initiatives(business_id);
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_step_type ON strategic_initiatives(business_id, step_type);
CREATE INDEX IF NOT EXISTS idx_sprint_key_actions_business_id ON sprint_key_actions(business_id);

-- Enable RLS
ALTER TABLE strategic_initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprint_key_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for strategic_initiatives
DROP POLICY IF EXISTS "Users can view their own strategic initiatives" ON strategic_initiatives;
CREATE POLICY "Users can view their own strategic initiatives"
  ON strategic_initiatives FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own strategic initiatives" ON strategic_initiatives;
CREATE POLICY "Users can insert their own strategic initiatives"
  ON strategic_initiatives FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own strategic initiatives" ON strategic_initiatives;
CREATE POLICY "Users can update their own strategic initiatives"
  ON strategic_initiatives FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own strategic initiatives" ON strategic_initiatives;
CREATE POLICY "Users can delete their own strategic initiatives"
  ON strategic_initiatives FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for sprint_key_actions
DROP POLICY IF EXISTS "Users can view their own sprint actions" ON sprint_key_actions;
CREATE POLICY "Users can view their own sprint actions"
  ON sprint_key_actions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own sprint actions" ON sprint_key_actions;
CREATE POLICY "Users can insert their own sprint actions"
  ON sprint_key_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own sprint actions" ON sprint_key_actions;
CREATE POLICY "Users can update their own sprint actions"
  ON sprint_key_actions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own sprint actions" ON sprint_key_actions;
CREATE POLICY "Users can delete their own sprint actions"
  ON sprint_key_actions FOR DELETE
  USING (auth.uid() = user_id);
