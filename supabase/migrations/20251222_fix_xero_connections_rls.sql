-- Fix RLS policies for xero_connections
-- The issue is that multiple overlapping policies may be causing conflicts

-- Drop ALL existing policies on xero_connections
DROP POLICY IF EXISTS "Users can manage their xero connections" ON xero_connections;
DROP POLICY IF EXISTS "Users can view their xero connections" ON xero_connections;
DROP POLICY IF EXISTS "Users can insert their xero connections" ON xero_connections;
DROP POLICY IF EXISTS "Users can update their xero connections" ON xero_connections;
DROP POLICY IF EXISTS "Users can delete their xero connections" ON xero_connections;
DROP POLICY IF EXISTS "Users can view their Xero connections" ON xero_connections;
DROP POLICY IF EXISTS "Coaches can view client Xero connections" ON xero_connections;
DROP POLICY IF EXISTS "xero_connections_owner_access" ON xero_connections;
DROP POLICY IF EXISTS "xero_connections_coach_access" ON xero_connections;

-- Create a single comprehensive policy for SELECT
-- Users can see connections for businesses they own OR are assigned to coach
CREATE POLICY "xero_connections_select_policy"
  ON xero_connections FOR SELECT
  USING (
    -- User owns the connection
    user_id = auth.uid()
    OR
    -- User owns the business
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
    OR
    -- User is assigned coach for the business
    business_id IN (
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
    )
    OR
    -- User is a super_admin
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Policy for INSERT - only business owners can create connections
CREATE POLICY "xero_connections_insert_policy"
  ON xero_connections FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Policy for UPDATE - owners and super_admins can update
CREATE POLICY "xero_connections_update_policy"
  ON xero_connections FOR UPDATE
  USING (
    user_id = auth.uid()
    OR
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Policy for DELETE - only owners and super_admins can delete
CREATE POLICY "xero_connections_delete_policy"
  ON xero_connections FOR DELETE
  USING (
    user_id = auth.uid()
    OR
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Verify RLS is enabled
ALTER TABLE xero_connections ENABLE ROW LEVEL SECURITY;
