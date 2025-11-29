-- Fix Custom KPIs Library - Drop and Recreate with Correct Foreign Keys
-- Date: 2025-01-15

-- Drop existing table if it has wrong foreign keys
DROP TABLE IF EXISTS custom_kpis_library CASCADE;

-- Create custom_kpis_library table with correct foreign keys
CREATE TABLE custom_kpis_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- KPI Details
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  friendly_name TEXT,
  unit TEXT NOT NULL, -- 'currency', 'percentage', 'number'
  frequency TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'quarterly', 'annual'
  description TEXT,

  -- Metadata
  created_by UUID REFERENCES profiles(id) NOT NULL,
  business_id UUID REFERENCES business_profiles(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'

  -- Approval tracking
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_custom_kpis_status ON custom_kpis_library(status);

-- Create index on category for grouping
CREATE INDEX IF NOT EXISTS idx_custom_kpis_category ON custom_kpis_library(category);

-- Create index on created_by for user's custom KPIs
CREATE INDEX IF NOT EXISTS idx_custom_kpis_created_by ON custom_kpis_library(created_by);

-- Create index on business_id for business KPIs
CREATE INDEX IF NOT EXISTS idx_custom_kpis_business_id ON custom_kpis_library(business_id);

-- Enable Row Level Security
ALTER TABLE custom_kpis_library ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read approved KPIs and their own pending KPIs
CREATE POLICY "Users can read approved custom KPIs or their own"
  ON custom_kpis_library
  FOR SELECT
  USING (
    status = 'approved'
    OR created_by = auth.uid()
    OR business_id IN (
      SELECT id FROM business_profiles WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can insert their own custom KPIs
CREATE POLICY "Users can create custom KPIs"
  ON custom_kpis_library
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Policy: Users can update their own pending KPIs
CREATE POLICY "Users can update their own pending KPIs"
  ON custom_kpis_library
  FOR UPDATE
  USING (created_by = auth.uid() AND status = 'pending')
  WITH CHECK (created_by = auth.uid() AND status = 'pending');

-- Policy: Admins can update any KPIs (for approval/rejection)
-- Note: You'll need to add a role check when you have admin roles set up
CREATE POLICY "Admins can update any custom KPIs"
  ON custom_kpis_library
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_custom_kpis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_custom_kpis_timestamp
  BEFORE UPDATE ON custom_kpis_library
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_kpis_updated_at();

-- Function to increment usage count
CREATE OR REPLACE FUNCTION increment_custom_kpi_usage(kpi_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE custom_kpis_library
  SET
    usage_count = usage_count + 1,
    last_used_at = NOW()
  WHERE id = kpi_id;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON TABLE custom_kpis_library IS 'Shared library of custom KPIs created by users. Approved KPIs are available to all users.';
