-- Drop unused database_health view
-- This view was flagged as a security risk (SECURITY DEFINER) by Supabase linter
-- It is not used anywhere in the application - health checks query tables directly
-- Safe to remove with zero user impact

DROP VIEW IF EXISTS public.database_health;
