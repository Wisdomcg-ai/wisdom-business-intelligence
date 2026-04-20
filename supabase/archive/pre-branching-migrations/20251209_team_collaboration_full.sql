-- =====================================================
-- TEAM COLLABORATION & MULTI-USER ARCHITECTURE
-- Full migration for audit logging, presence, weekly reports, and notifications
-- =====================================================

-- =====================================================
-- 1. UPDATE ROLES TO INCLUDE COACH
-- =====================================================

-- Update role constraint to include coach
ALTER TABLE public.business_users DROP CONSTRAINT IF EXISTS business_users_role_check;
ALTER TABLE public.business_users
  ADD CONSTRAINT business_users_role_check
  CHECK (role IN ('owner', 'admin', 'coach', 'member', 'viewer'));

-- Update team_invites role constraint to include coach
ALTER TABLE public.team_invites DROP CONSTRAINT IF EXISTS team_invites_role_check;
ALTER TABLE public.team_invites
  ADD CONSTRAINT team_invites_role_check
  CHECK (role IN ('admin', 'coach', 'member', 'viewer'));

-- =====================================================
-- 2. UPDATE SECTION_PERMISSIONS TO SIMPLIFIED STRUCTURE
-- =====================================================

-- Update default section_permissions on business_users for the new simplified structure
ALTER TABLE public.business_users
ALTER COLUMN section_permissions SET DEFAULT '{
  "business_plan": true,
  "finances": true,
  "business_engines": true,
  "execute_kpi": true,
  "execute_weekly_review": true,
  "execute_issues": true,
  "execute_ideas": true,
  "execute_productivity": true,
  "review_quarterly": true,
  "coaching_messages": true,
  "coaching_sessions": true
}'::jsonb;

-- Update default section_permissions on team_invites (finances disabled by default)
ALTER TABLE public.team_invites
ALTER COLUMN section_permissions SET DEFAULT '{
  "business_plan": true,
  "finances": false,
  "business_engines": true,
  "execute_kpi": true,
  "execute_weekly_review": true,
  "execute_issues": true,
  "execute_ideas": true,
  "execute_productivity": true,
  "review_quarterly": true,
  "coaching_messages": true,
  "coaching_sessions": true
}'::jsonb;

-- =====================================================
-- 3. AUDIT LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  user_email VARCHAR(255),

  -- What changed
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'delete')),

  -- Change details
  field_name VARCHAR(100),
  old_value JSONB,
  new_value JSONB,
  changes JSONB,

  -- Context
  description TEXT,
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_log_business ON public.audit_log(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON public.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_business_created ON public.audit_log(business_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only owner, admin, and coach can view audit log
CREATE POLICY "Authorized users can view audit log"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = audit_log.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin', 'coach')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = audit_log.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- System/app can insert audit logs (via service role or authenticated users logging their own changes)
CREATE POLICY "Users can create audit entries for their business"
  ON public.audit_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = audit_log.business_id
      AND bu.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = audit_log.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- No updates or deletes allowed (immutable)
-- (No UPDATE or DELETE policies = no one can modify/delete)

COMMENT ON TABLE public.audit_log IS 'Immutable audit trail of all data changes. Retained for 6 months.';

-- =====================================================
-- 4. ACTIVE EDITORS TABLE (Real-time Presence)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.active_editors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name VARCHAR(255),
  user_avatar VARCHAR(500),

  -- What they're editing
  page_path VARCHAR(255) NOT NULL,
  record_id UUID,

  -- Session info
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, user_id, page_path)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_active_editors_business_page ON public.active_editors(business_id, page_path);
CREATE INDEX IF NOT EXISTS idx_active_editors_heartbeat ON public.active_editors(last_heartbeat);

-- Enable RLS
ALTER TABLE public.active_editors ENABLE ROW LEVEL SECURITY;

-- Users can see who's editing in their business
CREATE POLICY "Users can view active editors in their business"
  ON public.active_editors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = active_editors.business_id
      AND bu.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = active_editors.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- Users can add/update their own presence
CREATE POLICY "Users can manage their own presence"
  ON public.active_editors FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own presence"
  ON public.active_editors FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can remove their own presence"
  ON public.active_editors FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.active_editors IS 'Tracks who is currently editing what. Records auto-expire when heartbeat > 2 minutes old.';

-- =====================================================
-- 5. WEEKLY REPORT PERIODS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.weekly_report_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  week_ending DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, week_ending)
);

CREATE INDEX IF NOT EXISTS idx_weekly_report_periods_business ON public.weekly_report_periods(business_id);
CREATE INDEX IF NOT EXISTS idx_weekly_report_periods_week ON public.weekly_report_periods(week_ending DESC);

-- Enable RLS
ALTER TABLE public.weekly_report_periods ENABLE ROW LEVEL SECURITY;

-- Team members can view periods for their business
CREATE POLICY "Team members can view report periods"
  ON public.weekly_report_periods FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = weekly_report_periods.business_id
      AND bu.user_id = auth.uid()
      AND bu.role != 'viewer'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = weekly_report_periods.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- Owner/admin can create periods
CREATE POLICY "Owners and admins can create report periods"
  ON public.weekly_report_periods FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = weekly_report_periods.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin')
    )
  );

-- Owner/admin can update period status
CREATE POLICY "Owners and admins can update report periods"
  ON public.weekly_report_periods FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = weekly_report_periods.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- 6. WEEKLY REPORTS TABLE (Individual submissions)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.team_weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.weekly_report_periods(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Report status
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'reviewed')),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),

  -- Report content (flexible JSONB)
  report_data JSONB DEFAULT '{
    "wins": [],
    "challenges": [],
    "priorities_completed": [],
    "priorities_next_week": [],
    "kpi_updates": {},
    "issues_raised": [],
    "ideas_submitted": [],
    "notes": ""
  }'::jsonb,

  -- Ratings
  self_rating INTEGER CHECK (self_rating IS NULL OR (self_rating >= 1 AND self_rating <= 10)),
  manager_rating INTEGER CHECK (manager_rating IS NULL OR (manager_rating >= 1 AND manager_rating <= 10)),
  manager_feedback TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(period_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_weekly_reports_business ON public.team_weekly_reports(business_id);
CREATE INDEX IF NOT EXISTS idx_team_weekly_reports_user ON public.team_weekly_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_team_weekly_reports_period ON public.team_weekly_reports(period_id);
CREATE INDEX IF NOT EXISTS idx_team_weekly_reports_status ON public.team_weekly_reports(status);

-- Enable RLS
ALTER TABLE public.team_weekly_reports ENABLE ROW LEVEL SECURITY;

-- Users can view their own reports
CREATE POLICY "Users can view their own reports"
  ON public.team_weekly_reports FOR SELECT
  USING (user_id = auth.uid());

-- Owner/admin/coach can view all reports (viewers cannot)
CREATE POLICY "Authorized users can view all reports"
  ON public.team_weekly_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = team_weekly_reports.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin', 'coach')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = team_weekly_reports.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- Users can create their own reports
CREATE POLICY "Users can create their own reports"
  ON public.team_weekly_reports FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = team_weekly_reports.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin', 'member')
    )
  );

-- Users can update their own reports
CREATE POLICY "Users can update their own reports"
  ON public.team_weekly_reports FOR UPDATE
  USING (user_id = auth.uid());

-- Owner/admin/coach can add feedback/ratings to reports
CREATE POLICY "Managers can add feedback to reports"
  ON public.team_weekly_reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = team_weekly_reports.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin', 'coach')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = team_weekly_reports.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- =====================================================
-- 7. WEEKLY REPORT COMMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.weekly_report_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.team_weekly_reports(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_report_comments_report ON public.weekly_report_comments(report_id);

-- Enable RLS
ALTER TABLE public.weekly_report_comments ENABLE ROW LEVEL SECURITY;

-- Users can view comments on reports they can view
CREATE POLICY "Users can view comments on accessible reports"
  ON public.weekly_report_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_weekly_reports twr
      WHERE twr.id = weekly_report_comments.report_id
      AND (
        twr.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.business_users bu
          WHERE bu.business_id = twr.business_id
          AND bu.user_id = auth.uid()
          AND bu.role IN ('owner', 'admin', 'coach')
        )
      )
    )
  );

-- Authorized users can add comments
CREATE POLICY "Authorized users can add comments"
  ON public.weekly_report_comments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_weekly_reports twr
      WHERE twr.id = weekly_report_comments.report_id
      AND (
        twr.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.business_users bu
          WHERE bu.business_id = twr.business_id
          AND bu.user_id = auth.uid()
          AND bu.role IN ('owner', 'admin', 'coach')
        )
      )
    )
  );

-- =====================================================
-- 8. NOTIFICATION PREFERENCES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- Notification toggles
  weekly_report_reminder BOOLEAN DEFAULT true,
  report_feedback BOOLEAN DEFAULT true,
  data_changed BOOLEAN DEFAULT true,
  someone_editing BOOLEAN DEFAULT false,
  team_member_joined BOOLEAN DEFAULT true,
  coaching_session BOOLEAN DEFAULT true,
  weekly_digest BOOLEAN DEFAULT true,

  -- Delivery preferences
  email_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,

  -- Quiet hours (optional)
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone VARCHAR(50) DEFAULT 'UTC',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, business_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON public.notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_business ON public.notification_preferences(business_id);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only view/manage their own preferences
CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own notification preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notification preferences"
  ON public.notification_preferences FOR DELETE
  USING (user_id = auth.uid());

-- =====================================================
-- 9. HELPER FUNCTION: Clean up stale editors
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_stale_editors()
RETURNS void AS $$
BEGIN
  DELETE FROM public.active_editors
  WHERE last_heartbeat < NOW() - INTERVAL '2 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 10. HELPER FUNCTION: Clean up old audit logs (6 months)
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < NOW() - INTERVAL '6 months';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 11. HELPER FUNCTION: Get or create weekly report period
-- =====================================================

CREATE OR REPLACE FUNCTION get_or_create_weekly_period(
  p_business_id UUID,
  p_week_ending DATE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_week_ending DATE;
  v_period_id UUID;
BEGIN
  -- If no date provided, calculate current week ending (Friday)
  IF p_week_ending IS NULL THEN
    -- Get the Friday of the current week
    v_week_ending := date_trunc('week', CURRENT_DATE)::date + 4;
    -- If today is after Friday, use next Friday
    IF CURRENT_DATE > v_week_ending THEN
      v_week_ending := v_week_ending + 7;
    END IF;
  ELSE
    v_week_ending := p_week_ending;
  END IF;

  -- Try to get existing period
  SELECT id INTO v_period_id
  FROM public.weekly_report_periods
  WHERE business_id = p_business_id
  AND week_ending = v_week_ending;

  -- Create if doesn't exist
  IF v_period_id IS NULL THEN
    INSERT INTO public.weekly_report_periods (business_id, week_ending)
    VALUES (p_business_id, v_week_ending)
    RETURNING id INTO v_period_id;
  END IF;

  RETURN v_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 12. UPDATE TIMESTAMP TRIGGERS
-- =====================================================

-- Generic updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to team_weekly_reports
DROP TRIGGER IF EXISTS update_team_weekly_reports_updated_at ON public.team_weekly_reports;
CREATE TRIGGER update_team_weekly_reports_updated_at
  BEFORE UPDATE ON public.team_weekly_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply to notification_preferences
DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE public.audit_log IS 'Immutable audit trail of all data changes. Retained for 6 months.';
COMMENT ON TABLE public.active_editors IS 'Tracks who is currently viewing/editing pages. Used for real-time presence.';
COMMENT ON TABLE public.weekly_report_periods IS 'Weekly report periods, each ending on a Friday.';
COMMENT ON TABLE public.team_weekly_reports IS 'Individual team member weekly reports.';
COMMENT ON TABLE public.weekly_report_comments IS 'Comments/feedback on weekly reports.';
COMMENT ON TABLE public.notification_preferences IS 'User notification preferences per business.';
