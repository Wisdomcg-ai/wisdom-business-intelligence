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

-- Add new columns one by one (safer for Supabase)
DO $$
BEGIN
  -- Add notes column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='strategic_initiatives' AND column_name='notes') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN notes TEXT;
  END IF;

  -- Add category column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='strategic_initiatives' AND column_name='category') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN category TEXT;
  END IF;

  -- Add priority column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='strategic_initiatives' AND column_name='priority') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN priority TEXT;
  END IF;

  -- Add estimated_effort column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='strategic_initiatives' AND column_name='estimated_effort') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN estimated_effort TEXT;
  END IF;

  -- Add source column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='strategic_initiatives' AND column_name='source') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN source TEXT;
  END IF;

  -- Add timeline column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='strategic_initiatives' AND column_name='timeline') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN timeline TEXT;
  END IF;

  -- Add selected column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='strategic_initiatives' AND column_name='selected') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN selected BOOLEAN DEFAULT false;
  END IF;

  -- Add order_index column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='strategic_initiatives' AND column_name='order_index') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN order_index INTEGER DEFAULT 0;
  END IF;

  -- Add linked_kpis column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='strategic_initiatives' AND column_name='linked_kpis') THEN
    ALTER TABLE strategic_initiatives ADD COLUMN linked_kpis JSONB;
  END IF;
END $$;

-- Add constraints separately (after columns exist)
DO $$
BEGIN
  -- Category constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'strategic_initiatives_category_check'
  ) THEN
    ALTER TABLE strategic_initiatives
    ADD CONSTRAINT strategic_initiatives_category_check
    CHECK (category IS NULL OR category IN ('marketing', 'operations', 'finance', 'people', 'systems', 'product', 'customer_experience', 'other'));
  END IF;

  -- Priority constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'strategic_initiatives_priority_check'
  ) THEN
    ALTER TABLE strategic_initiatives
    ADD CONSTRAINT strategic_initiatives_priority_check
    CHECK (priority IS NULL OR priority IN ('high', 'medium', 'low'));
  END IF;

  -- Effort constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'strategic_initiatives_effort_check'
  ) THEN
    ALTER TABLE strategic_initiatives
    ADD CONSTRAINT strategic_initiatives_effort_check
    CHECK (estimated_effort IS NULL OR estimated_effort IN ('small', 'medium', 'large'));
  END IF;

  -- Timeline constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'strategic_initiatives_timeline_check'
  ) THEN
    ALTER TABLE strategic_initiatives
    ADD CONSTRAINT strategic_initiatives_timeline_check
    CHECK (timeline IS NULL OR timeline IN ('year1', 'year2', 'year3'));
  END IF;
END $$;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_business_id ON strategic_initiatives(business_id);
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_step_type ON strategic_initiatives(business_id, step_type);
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_category ON strategic_initiatives(business_id, category);
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_priority ON strategic_initiatives(business_id, priority);
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_order ON strategic_initiatives(business_id, step_type, order_index);

-- Add RLS policies if not exists
ALTER TABLE strategic_initiatives ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate (safer than IF NOT EXISTS for policies)
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

-- Add updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
