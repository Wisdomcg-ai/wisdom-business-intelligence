-- Phase 44.1 hotfix — set security_invoker on xero_pl_lines_wide_compat view.
--
-- The Supabase security advisor flagged this view as SECURITY DEFINER (the
-- Postgres default for views unless WITH (security_invoker = on) is set).
-- Views with SECURITY DEFINER bypass the querying user's RLS policies on the
-- underlying table — they return data based on the view CREATOR's privileges.
--
-- For our multi-tenant platform, xero_pl_lines RLS is the defense-in-depth
-- layer that gates cross-tenant access if route-level auth (verifyBusinessAccess
-- + resolveBusinessIds) is ever bypassed. With SECURITY DEFINER on the view,
-- that defense is silently absent — any caller with SELECT on the view can
-- read all tenants' data regardless of RLS.
--
-- Fix: SET (security_invoker = on) so the view runs with the querying user's
-- permissions. RLS on xero_pl_lines (restored in commit ec5055e on 2026-04-28)
-- now applies to view queries as expected.
--
-- Idempotent: SET option is a no-op if already set.
-- Postgres 15+ feature; Supabase runs Postgres 15+ on all current projects.

ALTER VIEW "public"."xero_pl_lines_wide_compat" SET (security_invoker = on);

COMMENT ON VIEW "public"."xero_pl_lines_wide_compat" IS 'Phase 44 — READ-ONLY backwards-compatible wide-shaped projection over the long-format xero_pl_lines table. SECURITY INVOKER (Phase 44.1 hotfix 2026-04-29) so RLS on xero_pl_lines applies to view queries. Drop in plan 44-09 once all consumers migrate to ForecastReadService.';
