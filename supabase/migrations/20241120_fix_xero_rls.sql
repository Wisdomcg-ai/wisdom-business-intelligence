-- Fix RLS policy for xero_connections to allow SELECT even when no rows exist

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can manage their xero connections" ON xero_connections;

-- Create separate policies for different operations
-- Allow users to SELECT their own connections (returns empty if none exist)
CREATE POLICY "Users can view their xero connections"
  ON xero_connections FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to INSERT connections for themselves
CREATE POLICY "Users can insert their xero connections"
  ON xero_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to UPDATE their own connections
CREATE POLICY "Users can update their xero connections"
  ON xero_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to DELETE their own connections
CREATE POLICY "Users can delete their xero connections"
  ON xero_connections FOR DELETE
  USING (auth.uid() = user_id);
