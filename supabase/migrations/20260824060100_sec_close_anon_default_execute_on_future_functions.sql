-- SECURITY — close the ROOT CAUSE behind the recurring "definer RPC leaks to
-- anon" incident class (full DB security audit, 24 Aug 2026, finding GRANT-03).
--
-- pg_default_acl for role `postgres` in schema public currently grants EXECUTE
-- to anon AND authenticated on every FUTURE function (verified: objtype 'f' ACL
-- = {postgres=X, anon=X, authenticated=X, service_role=X}). That default is why
-- every SECURITY DEFINER function created by a migration silently inherited an
-- anon grant at CREATE time — including the five account-management functions
-- fixed 23 Aug and the sixteen RPCs revoked in the sibling migration.
--
-- This flips the default CLOSED for functions our migrations create (owned by
-- postgres): new functions no longer auto-grant anon/authenticated. A function
-- that genuinely needs anon EXECUTE (e.g. a new RLS-policy helper) must now say
-- so EXPLICITLY — which is the correct, auditable posture.
--
-- Scope is deliberately narrow and low-risk:
--   * FUNCTIONS only. The TABLE default (anon=arwdDxtm on future tables) is left
--     as-is: it is the standard Supabase grant-then-RLS pattern, is mitigated by
--     164/164 tables currently having RLS enabled, and revoking it would break
--     the normal new-table workflow. Enforce RLS-on-new-tables via review/CI
--     instead — tracked as a separate decision.
--   * Role `postgres` only. Functions created by supabase_admin's own tooling
--     are Supabase-managed, not app surface.
--   * FUTURE objects only — existing grants are untouched (handled explicitly in
--     the sibling revoke migration), so nothing currently working can break.

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
