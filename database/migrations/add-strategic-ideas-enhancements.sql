-- Migration: Add enhanced fields to strategic_initiatives table
-- This migration adds support for categories, priorities, effort estimates, notes, and ordering

-- First, check if the strategic_initiatives table exists, if not create it
CREATE TABLE IF NOT EXISTS strategic_initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  step_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add new columns if they don't exist
ALTER TABLE strategic_initiatives
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('marketing', 'operations', 'finance', 'people', 'systems', 'product', 'customer_experience', 'other')),
  ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS estimated_effort TEXT CHECK (estimated_effort IN ('small', 'medium', 'large')),
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS timeline TEXT CHECK (timeline IN ('year1', 'year2', 'year3')),
  ADD COLUMN IF NOT EXISTS selected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linked_kpis JSONB;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_business_id ON strategic_initiatives(business_id);
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_step_type ON strategic_initiatives(business_id, step_type);
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_category ON strategic_initiatives(business_id, category);
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_priority ON strategic_initiatives(business_id, priority);
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_order ON strategic_initiatives(business_id, step_type, order_index);

-- Add RLS policies if not exists
ALTER TABLE strategic_initiatives ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own initiatives
CREATE POLICY IF NOT EXISTS "Users can view their own strategic initiatives"
  ON strategic_initiatives FOR SELECT
  USING (auth.uid() = user_id);

-- Policy for users to insert their own initiatives
CREATE POLICY IF NOT EXISTS "Users can insert their own strategic initiatives"
  ON strategic_initiatives FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy for users to update their own initiatives
CREATE POLICY IF NOT EXISTS "Users can update their own strategic initiatives"
  ON strategic_initiatives FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy for users to delete their own initiatives
CREATE POLICY IF NOT EXISTS "Users can delete their own strategic initiatives"
  ON strategic_initiatives FOR DELETE
  USING (auth.uid() = user_id);

-- Create sprint_key_actions table if it doesn't exist
CREATE TABLE IF NOT EXISTS sprint_key_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  owner TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for sprint_key_actions
CREATE INDEX IF NOT EXISTS idx_sprint_key_actions_business_id ON sprint_key_actions(business_id);

-- Add RLS policies for sprint_key_actions
ALTER TABLE sprint_key_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own sprint actions"
  ON sprint_key_actions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own sprint actions"
  ON sprint_key_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own sprint actions"
  ON sprint_key_actions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete their own sprint actions"
  ON sprint_key_actions FOR DELETE
  USING (auth.uid() = user_id);

-- Add updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_strategic_initiatives_updated_at ON strategic_initiatives;
CREATE TRIGGER update_strategic_initiatives_updated_at
  BEFORE UPDATE ON strategic_initiatives
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sprint_key_actions_updated_at ON sprint_key_actions;
CREATE TRIGGER update_sprint_key_actions_updated_at
  BEFORE UPDATE ON sprint_key_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
