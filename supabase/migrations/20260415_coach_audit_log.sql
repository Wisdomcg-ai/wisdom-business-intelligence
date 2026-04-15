-- Coach audit log for tracking when coaches view client data
CREATE TABLE IF NOT EXISTS public.coach_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'view_client', 'edit_client', etc.
  page_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_audit_log_coach ON coach_audit_log(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_audit_log_business ON coach_audit_log(business_id);
CREATE INDEX IF NOT EXISTS idx_coach_audit_log_created ON coach_audit_log(created_at);

ALTER TABLE coach_audit_log ENABLE ROW LEVEL SECURITY;

-- Coaches can insert their own audit records
DROP POLICY IF EXISTS "Coaches can insert own audit records" ON coach_audit_log;
CREATE POLICY "Coaches can insert own audit records"
  ON coach_audit_log FOR INSERT
  WITH CHECK (auth.uid() = coach_id);

-- Coaches and admins can read audit records
DROP POLICY IF EXISTS "Coaches can view own audit records" ON coach_audit_log;
CREATE POLICY "Coaches can view own audit records"
  ON coach_audit_log FOR SELECT
  USING (auth.uid() = coach_id);

DROP POLICY IF EXISTS "Admins can view all audit records" ON coach_audit_log;
CREATE POLICY "Admins can view all audit records"
  ON coach_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );
