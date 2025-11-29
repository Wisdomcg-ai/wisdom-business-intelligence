-- Clean up strategic_initiatives table - start fresh with correct schema

-- Drop existing indexes first
DROP INDEX IF EXISTS idx_strategic_initiatives_business_id;
DROP INDEX IF EXISTS idx_strategic_initiatives_step_type;
DROP INDEX IF EXISTS idx_strategic_initiatives_category;
DROP INDEX IF EXISTS idx_strategic_initiatives_priority;
DROP INDEX IF EXISTS idx_strategic_initiatives_order;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own strategic initiatives" ON strategic_initiatives;
DROP POLICY IF EXISTS "Users can insert their own strategic initiatives" ON strategic_initiatives;
DROP POLICY IF EXISTS "Users can update their own strategic initiatives" ON strategic_initiatives;
DROP POLICY IF EXISTS "Users can delete their own strategic initiatives" ON strategic_initiatives;

-- Backup existing data by renaming the table
DROP TABLE IF EXISTS strategic_initiatives_backup;
ALTER TABLE IF EXISTS strategic_initiatives RENAME TO strategic_initiatives_backup;

-- Create the table fresh with the correct schema
CREATE TABLE strategic_initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  category TEXT,
  priority TEXT,
  estimated_effort TEXT,
  step_type TEXT NOT NULL,
  source TEXT,
  timeline TEXT,
  selected BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  linked_kpis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_strategic_initiatives_business_id ON strategic_initiatives(business_id);
CREATE INDEX idx_strategic_initiatives_step_type ON strategic_initiatives(business_id, step_type);
CREATE INDEX idx_strategic_initiatives_category ON strategic_initiatives(business_id, category);
CREATE INDEX idx_strategic_initiatives_priority ON strategic_initiatives(business_id, priority);
CREATE INDEX idx_strategic_initiatives_order ON strategic_initiatives(business_id, step_type, order_index);

-- Enable RLS
ALTER TABLE strategic_initiatives ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own strategic initiatives"
  ON strategic_initiatives FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own strategic initiatives"
  ON strategic_initiatives FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategic initiatives"
  ON strategic_initiatives FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own strategic initiatives"
  ON strategic_initiatives FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for updated_at
CREATE TRIGGER update_strategic_initiatives_updated_at
  BEFORE UPDATE ON strategic_initiatives
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Optional: Migrate old data if it exists
-- Uncomment the lines below if you want to preserve old data:
-- INSERT INTO strategic_initiatives (business_id, user_id, title, description, step_type, created_at, updated_at)
-- SELECT business_id, user_id, title, description, step_type, created_at, updated_at
-- FROM strategic_initiatives_backup
-- WHERE business_id IS NOT NULL AND user_id IS NOT NULL AND title IS NOT NULL;

-- Optional: Drop backup table after you verify everything works
-- DROP TABLE IF EXISTS strategic_initiatives_backup;
