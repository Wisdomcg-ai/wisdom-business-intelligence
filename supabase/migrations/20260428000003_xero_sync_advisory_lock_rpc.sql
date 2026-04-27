-- Phase 44 Plan 44-02 Task 3 — acquire_xero_sync_lock RPC
--
-- D-07: pg_advisory_xact_lock(hashtext(business_id::text)) at the top of the
-- sync routine, single-flight per business across cron + manual refresh +
-- multiple Vercel container instances. The lock is released automatically
-- when the calling transaction commits or rolls back — that's the *xact*
-- (transaction-scoped) variant.
--
-- IMPORTANT — pgBouncer compatibility:
--   pg_advisory_xact_lock (transaction-scoped) is the ONLY safe variant under
--   pgBouncer transaction-mode pooling. The session-scoped pg_advisory_lock
--   would be released the instant pgBouncer returned the connection to the
--   pool, defeating the lock entirely. Do NOT change this to pg_advisory_lock.
--
-- SECURITY DEFINER + GRANT EXECUTE TO service_role only:
--   Coaches and business members must NOT be able to acquire advisory locks
--   directly (they could DoS sync by holding locks). Only the cron + sync
--   orchestrator (service-role caller) can call this RPC.

BEGIN;

CREATE OR REPLACE FUNCTION acquire_xero_sync_lock(p_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_business_id::text));
END;
$$;

REVOKE ALL ON FUNCTION acquire_xero_sync_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acquire_xero_sync_lock(uuid) TO service_role;

COMMENT ON FUNCTION acquire_xero_sync_lock(uuid) IS 'Phase 44 D-07 — single-flight Xero sync per business via pg_advisory_xact_lock(hashtext). Service-role only. Lock released on transaction commit/rollback. pgBouncer transaction-mode safe.';

COMMIT;
