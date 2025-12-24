-- Fix Supabase Security Linter Issues
-- 1. Enable RLS on audit_log table (has policies but RLS not enabled)
-- 2. Fix client_activity_summary view SECURITY DEFINER issue

-- ============================================================================
-- 1. Enable RLS on audit_log table
-- ============================================================================
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Recreate client_activity_summary view with SECURITY INVOKER
-- First drop, then recreate with proper security settings
-- ============================================================================

-- Drop the existing view
DROP VIEW IF EXISTS public.client_activity_summary;

-- Recreate with SECURITY INVOKER (respects querying user's permissions)
-- This is the same structure as the original, just with security_invoker = true
CREATE VIEW public.client_activity_summary
WITH (security_invoker = true)
AS
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

-- Add comment explaining the view
COMMENT ON VIEW public.client_activity_summary IS 'Summary of client activity for coach dashboard. Uses SECURITY INVOKER to respect RLS policies.';
-- Fix Function Search Path Security Issues
-- All functions need SET search_path = '' to prevent search path injection attacks
-- This migration recreates all affected functions with secure search_path settings

-- ============================================================================
-- 1. TIMESTAMP UPDATE FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_assessment_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_roadmap_progress_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_swot_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_custom_kpis_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_notifications_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_annual_plans_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_strategic_goals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_strategic_kpis_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_life_goals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_profile_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_quarterly_reviews_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_session_notes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_session_actions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ideas_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ai_tables_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stop_doing_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. HELPER/UTILITY FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_quarter_from_date(DATE);
CREATE OR REPLACE FUNCTION public.get_quarter_from_date(check_date DATE)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN 'Q' || CEIL(EXTRACT(MONTH FROM check_date)::NUMERIC / 3)::TEXT;
END;
$$;

DROP FUNCTION IF EXISTS public.get_quarter_date_range(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.get_quarter_date_range(quarter TEXT, year INTEGER)
RETURNS TABLE(start_date DATE, end_date DATE)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  q_num INTEGER;
BEGIN
  q_num := SUBSTRING(quarter FROM 2)::INTEGER;
  start_date := MAKE_DATE(year, (q_num - 1) * 3 + 1, 1);
  end_date := (MAKE_DATE(year, q_num * 3, 1) + INTERVAL '1 month - 1 day')::DATE;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_custom_kpi_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.custom_kpi_templates
  SET usage_count = COALESCE(usage_count, 0) + 1
  WHERE id = NEW.template_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_idea_status_on_filter()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.filter_status IS DISTINCT FROM OLD.filter_status THEN
    IF NEW.filter_status IN ('do', 'delegate', 'do_later') THEN
      NEW.status := 'filtered';
    ELSIF NEW.filter_status = 'delete' THEN
      NEW.status := 'deleted';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. ROLE/PERMISSION FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.system_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.system_roles
    WHERE user_id = auth.uid() AND role IN ('coach', 'super_admin')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_system_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.system_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  RETURN COALESCE(user_role, 'client');
END;
$$;

DROP FUNCTION IF EXISTS public.user_has_role(TEXT);
CREATE OR REPLACE FUNCTION public.user_has_role(required_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.system_roles
    WHERE user_id = auth.uid() AND role = required_role
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_user_role(UUID, UUID);
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID, p_business_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = p_user_id AND business_id = p_business_id
  LIMIT 1;

  RETURN v_role;
END;
$$;

DROP FUNCTION IF EXISTS public.can_access_process(UUID);
CREATE OR REPLACE FUNCTION public.can_access_process(process_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- User owns the process
  IF process_user_id = auth.uid() THEN
    RETURN TRUE;
  END IF;

  -- User is a super admin
  IF EXISTS (SELECT 1 FROM public.system_roles WHERE user_id = auth.uid() AND role = 'super_admin') THEN
    RETURN TRUE;
  END IF;

  -- User is a coach for this client
  IF EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.owner_id = process_user_id
    AND b.assigned_coach_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

DROP FUNCTION IF EXISTS public.get_coach_for_process(UUID);
CREATE OR REPLACE FUNCTION public.get_coach_for_process(process_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  coach_id UUID;
BEGIN
  SELECT b.assigned_coach_id INTO coach_id
  FROM public.businesses b
  WHERE b.owner_id = process_user_id
  LIMIT 1;

  RETURN coach_id;
END;
$$;

-- ============================================================================
-- 4. BUSINESS/USER MANAGEMENT FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_or_create_business_profile(UUID);
CREATE OR REPLACE FUNCTION public.get_or_create_business_profile(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id
  FROM public.business_profiles
  WHERE user_id = p_user_id;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.business_profiles (user_id)
    VALUES (p_user_id)
    RETURNING id INTO v_profile_id;
  END IF;

  RETURN v_profile_id;
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_user_preference(UUID, TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.upsert_user_preference(
  p_user_id UUID,
  p_preference_key TEXT,
  p_preference_value JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id, preference_key, preference_value)
  VALUES (p_user_id, p_preference_key, p_preference_value)
  ON CONFLICT (user_id, preference_key)
  DO UPDATE SET preference_value = p_preference_value, updated_at = NOW();
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_category_pattern(UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.upsert_category_pattern(
  p_business_id UUID,
  p_account_code TEXT,
  p_account_name TEXT,
  p_category TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.account_category_patterns (business_id, account_code, account_name, category)
  VALUES (p_business_id, p_account_code, p_account_name, p_category)
  ON CONFLICT (business_id, account_code)
  DO UPDATE SET category = p_category, account_name = p_account_name, updated_at = NOW();
END;
$$;

-- ============================================================================
-- 5. FORECAST/AUDIT FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_next_version_number(UUID);
CREATE OR REPLACE FUNCTION public.get_next_version_number(p_forecast_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_max_version
  FROM public.financial_forecasts
  WHERE id = p_forecast_id OR parent_forecast_id = p_forecast_id;

  RETURN v_max_version;
END;
$$;

DROP FUNCTION IF EXISTS public.lock_forecast_version(UUID);
CREATE OR REPLACE FUNCTION public.lock_forecast_version(p_forecast_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.financial_forecasts
  SET is_locked = TRUE,
      locked_at = NOW(),
      locked_by = auth.uid()
  WHERE id = p_forecast_id
  AND is_locked = FALSE;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_forecast_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.forecast_audit_log (
    forecast_id,
    user_id,
    action,
    table_name,
    record_id,
    old_value,
    new_value
  ) VALUES (
    COALESCE(NEW.forecast_id, OLD.forecast_id),
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP FUNCTION IF EXISTS public.create_version_snapshot(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.create_version_snapshot(p_forecast_id UUID, p_version_notes TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_id UUID;
  v_new_version INTEGER;
BEGIN
  -- Get next version number
  SELECT public.get_next_version_number(p_forecast_id) INTO v_new_version;

  -- Create snapshot
  INSERT INTO public.financial_forecasts (
    business_id, user_id, name, description, fiscal_year, year_type,
    baseline_start_month, baseline_end_month, actual_start_month, actual_end_month,
    forecast_start_month, forecast_end_month, is_completed, currency,
    forecast_type, version_number, is_active, parent_forecast_id, version_notes
  )
  SELECT
    business_id, user_id, name || ' v' || v_new_version, description, fiscal_year, year_type,
    baseline_start_month, baseline_end_month, actual_start_month, actual_end_month,
    forecast_start_month, forecast_end_month, is_completed, currency,
    'forecast', v_new_version, FALSE, p_forecast_id, p_version_notes
  FROM public.financial_forecasts
  WHERE id = p_forecast_id
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_coach_forecast_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_coach_id UUID;
  v_business_name TEXT;
BEGIN
  IF NEW.is_completed = TRUE AND (OLD.is_completed IS NULL OR OLD.is_completed = FALSE) THEN
    SELECT b.assigned_coach_id, b.business_name INTO v_coach_id, v_business_name
    FROM public.businesses b
    WHERE b.id = NEW.business_id;

    IF v_coach_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        v_coach_id,
        'forecast_complete',
        'Forecast Completed',
        v_business_name || ' has completed their forecast',
        jsonb_build_object('forecast_id', NEW.id, 'business_id', NEW.business_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_single_active_scenario()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_active = TRUE THEN
    UPDATE public.forecast_scenarios
    SET is_active = FALSE
    WHERE forecast_id = NEW.forecast_id
    AND id != NEW.id
    AND is_active = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_baseline_scenario_for_forecast()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.forecast_scenarios (
    forecast_id, user_id, name, description, scenario_type,
    revenue_multiplier, cogs_multiplier, opex_multiplier,
    is_active, is_baseline
  ) VALUES (
    NEW.id, NEW.user_id, 'Baseline', 'Original forecast values',
    'active', 1.0, 1.0, 1.0, TRUE, TRUE
  );
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 6. CLEANUP FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.cleanup_expired_password_tokens();
CREATE OR REPLACE FUNCTION public.cleanup_expired_password_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.password_reset_tokens
  WHERE expires_at < NOW()
  OR used_at IS NOT NULL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

DROP FUNCTION IF EXISTS public.cleanup_old_audit_logs();
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ============================================================================
-- 7. STATS/ANALYTICS FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_todo_stats(UUID);
CREATE OR REPLACE FUNCTION public.get_todo_stats(p_user_id UUID)
RETURNS TABLE(
  total INTEGER,
  completed INTEGER,
  pending INTEGER,
  overdue INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER AS total,
    COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed,
    COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending,
    COUNT(*) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE)::INTEGER AS overdue
  FROM public.todos
  WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_process_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Update stats on process changes
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_decision_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Update stats on decision changes
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 8. USER/ACCOUNT CREATION FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_app_user(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_app_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- This function should be called by service role only
  -- Creates a user in auth.users
  INSERT INTO auth.users (
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data
  ) VALUES (
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('full_name', p_full_name)
  )
  RETURNING id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.create_test_user(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_test_user(
  p_email TEXT,
  p_role TEXT DEFAULT 'client'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- For testing purposes only
  v_user_id := gen_random_uuid();

  INSERT INTO public.system_roles (user_id, role)
  VALUES (v_user_id, p_role);

  RETURN v_user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.create_client_account(TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.create_client_account(
  p_email TEXT,
  p_business_name TEXT,
  p_coach_id UUID DEFAULT NULL
)
RETURNS TABLE(user_id UUID, business_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_business_id UUID;
BEGIN
  -- Create user placeholder
  v_user_id := gen_random_uuid();

  -- Create business
  INSERT INTO public.businesses (owner_id, business_name, assigned_coach_id)
  VALUES (v_user_id, p_business_name, p_coach_id)
  RETURNING id INTO v_business_id;

  -- Add client role
  INSERT INTO public.system_roles (user_id, role)
  VALUES (v_user_id, 'client');

  RETURN QUERY SELECT v_user_id, v_business_id;
END;
$$;

DROP FUNCTION IF EXISTS public.reset_user_password(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.reset_user_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN FOUND;
END;
$$;

DROP FUNCTION IF EXISTS public.complete_user_setup(UUID);
CREATE OR REPLACE FUNCTION public.complete_user_setup(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.businesses
  SET onboarding_completed = TRUE,
      onboarding_completed_at = NOW()
  WHERE owner_id = p_user_id;

  RETURN FOUND;
END;
$$;

DROP FUNCTION IF EXISTS public.get_all_users();
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE(
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only super admins can call this
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    (u.raw_user_meta_data->>'full_name')::TEXT AS full_name,
    COALESCE(sr.role, 'client')::TEXT AS role,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.system_roles sr ON u.id = sr.user_id
  ORDER BY u.created_at DESC;
END;
$$;

-- ============================================================================
-- 9. SWOT FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_quarterly_swot(UUID, TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.create_quarterly_swot(
  p_user_id UUID,
  p_quarter TEXT,
  p_year INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_swot_id UUID;
BEGIN
  INSERT INTO public.swot_analyses (user_id, quarter, year)
  VALUES (p_user_id, p_quarter, p_year)
  RETURNING id INTO v_swot_id;

  RETURN v_swot_id;
END;
$$;

-- ============================================================================
-- Done! All functions now have secure search_path settings.
-- ============================================================================
