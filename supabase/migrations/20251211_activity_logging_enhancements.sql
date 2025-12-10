-- =====================================================
-- ACTIVITY LOGGING ENHANCEMENTS
-- =====================================================
-- Adds:
-- 1. page_path column to audit_log for tracking where changes occur
-- 2. user_logins table for tracking last login timestamps
-- 3. 60-day auto-cleanup function for audit_log
-- 4. Super admin and coach RLS policies

-- =====================================================
-- 1. ADD PAGE_PATH TO AUDIT_LOG
-- =====================================================

ALTER TABLE public.audit_log
ADD COLUMN IF NOT EXISTS page_path VARCHAR(255);

COMMENT ON COLUMN public.audit_log.page_path IS 'The page/route where the change was made';

-- Index for page-based queries
CREATE INDEX IF NOT EXISTS idx_audit_log_page ON public.audit_log(page_path);

-- =====================================================
-- 2. USER LOGINS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  login_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,

  UNIQUE(user_id, business_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_logins_user ON public.user_logins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_logins_business ON public.user_logins(business_id);
CREATE INDEX IF NOT EXISTS idx_user_logins_time ON public.user_logins(login_at DESC);

-- Enable RLS
ALTER TABLE public.user_logins ENABLE ROW LEVEL SECURITY;

-- Users can view/update their own login records
CREATE POLICY "Users can manage own login records"
  ON public.user_logins FOR ALL
  USING (user_id = auth.uid());

-- Coaches can view client login records
CREATE POLICY "Coaches can view client logins"
  ON public.user_logins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = user_logins.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- Super admins can view all
CREATE POLICY "Super admins can view all logins"
  ON public.user_logins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

COMMENT ON TABLE public.user_logins IS 'Tracks last login timestamp per user per business';

-- =====================================================
-- 3. 60-DAY CLEANUP FUNCTION
-- =====================================================

-- Function to clean up old audit logs
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < NOW() - INTERVAL '60 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs() TO authenticated;

COMMENT ON FUNCTION public.cleanup_old_audit_logs IS 'Removes audit log entries older than 60 days. Should be run periodically via cron.';

-- =====================================================
-- 4. ENHANCED RLS POLICIES
-- =====================================================

-- Super admins can view all audit logs
DROP POLICY IF EXISTS "Super admins can view all audit logs" ON public.audit_log;
CREATE POLICY "Super admins can view all audit logs"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Super admins can create audit entries
DROP POLICY IF EXISTS "Super admins can create audit entries" ON public.audit_log;
CREATE POLICY "Super admins can create audit entries"
  ON public.audit_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- =====================================================
-- 5. HELPER VIEW FOR COACH DASHBOARD
-- =====================================================

-- Create a view for easy activity display
CREATE OR REPLACE VIEW public.client_activity_summary AS
SELECT
  b.id AS business_id,
  b.business_name,
  b.assigned_coach_id,
  ul.login_at AS last_login,
  al.last_change_at,
  al.last_change_table,
  al.last_change_page,
  al.last_change_user_name,
  al.total_changes_30d
FROM public.businesses b
LEFT JOIN public.user_logins ul ON ul.business_id = b.id AND ul.user_id = b.owner_id
LEFT JOIN LATERAL (
  SELECT
    MAX(created_at) AS last_change_at,
    (SELECT table_name FROM public.audit_log WHERE business_id = b.id ORDER BY created_at DESC LIMIT 1) AS last_change_table,
    (SELECT page_path FROM public.audit_log WHERE business_id = b.id ORDER BY created_at DESC LIMIT 1) AS last_change_page,
    (SELECT user_name FROM public.audit_log WHERE business_id = b.id ORDER BY created_at DESC LIMIT 1) AS last_change_user_name,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS total_changes_30d
  FROM public.audit_log
  WHERE business_id = b.id
) al ON true
WHERE b.assigned_coach_id IS NOT NULL;

-- Grant access to the view
GRANT SELECT ON public.client_activity_summary TO authenticated;

COMMENT ON VIEW public.client_activity_summary IS 'Summary of client activity for coach dashboard';
