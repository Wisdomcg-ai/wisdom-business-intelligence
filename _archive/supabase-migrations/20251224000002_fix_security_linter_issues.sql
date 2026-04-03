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
