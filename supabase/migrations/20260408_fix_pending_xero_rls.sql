-- Fix: Enable RLS on pending_xero_connections (Supabase linter flagged as EXTERNAL risk)

ALTER TABLE pending_xero_connections ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write their own pending connections
CREATE POLICY "Users can manage their own pending connections"
  ON pending_xero_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
