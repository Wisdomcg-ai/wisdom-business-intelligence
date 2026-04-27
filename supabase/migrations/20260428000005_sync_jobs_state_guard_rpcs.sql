-- Phase 44 Plan 44-05 prereq — sync_jobs.status='running' DB-state guard RPCs
--
-- Issue surfaced by Plan 44-04 SUMMARY: pg_advisory_xact_lock is transaction-scoped, so
-- when called inside a Supabase RPC each invocation acquires-then-immediately-releases
-- the lock when the RPC's own transaction commits. The lock does not survive across the
-- orchestrator's subsequent Xero fetches, parser calls, and upsert. Concurrent syncs are
-- not actually serialized by the 44-02 RPC.
--
-- Replacement: a sync_jobs.status='running' DB-state guard. Simpler primitive, naturally
-- observable (sync_jobs IS the audit log), pgBouncer-safe by default, and recoverable
-- (stale 'running' rows from crashes can be detected by `started_at < now() - interval '15 min'`).
--
-- Two helper RPCs, atomic via Supabase transaction wrapping:
--   begin_xero_sync_job(p_business_id) — INSERT a sync_jobs row with status='running' IFF no
--     other running row exists for the same business_id within the staleness window. Returns
--     the new row's id, or NULL if another sync is already in flight.
--   finalize_xero_sync_job(p_job_id, p_status, p_rows_inserted, p_rows_updated, p_xero_request_count,
--     p_coverage, p_reconciliation, p_error) — UPDATE the row with finished_at and final fields.
--
-- The orchestrator (44-04) gets a small revision: replace the supabase.rpc('acquire_xero_sync_lock')
-- call with supabase.rpc('begin_xero_sync_job') (returning a job_id or NULL for "another sync running"),
-- and replace the manual sync_jobs INSERT/UPDATE with begin/finalize. Tests in 44-04 assert the
-- begin/finalize call shape (the lock test becomes a "another-running-sync rejection" test).
--
-- Drop the old advisory-lock RPC. It was wrong from inception and never invoked in prod.

-- Step 1: drop the broken advisory-lock RPC.
DROP FUNCTION IF EXISTS acquire_xero_sync_lock(uuid);

-- Step 2: begin_xero_sync_job — atomic claim of "I'm syncing this business now".
-- Returns the new sync_jobs.id on success, or NULL if another non-stale 'running' row exists.
-- Staleness window: 15 minutes (a sync that hasn't finished in 15 min is presumed crashed
-- and another sync may proceed; the stale row stays 'running' for operator inspection).
CREATE OR REPLACE FUNCTION begin_xero_sync_job(p_business_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $begin_body$
DECLARE
  v_existing uuid;
  v_new_id uuid;
BEGIN
  SELECT id INTO v_existing
  FROM sync_jobs
  WHERE business_id = p_business_id
    AND status = 'running'
    AND started_at > now() - interval '15 minutes'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO sync_jobs (business_id, job_type, status, started_at)
  VALUES (p_business_id, 'xero_pl_sync', 'running', now())
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$begin_body$;

REVOKE ALL ON FUNCTION begin_xero_sync_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION begin_xero_sync_job(uuid) TO service_role;

-- Step 3: finalize_xero_sync_job — UPDATE the row with terminal status + metrics.
CREATE OR REPLACE FUNCTION finalize_xero_sync_job(
  p_job_id uuid,
  p_status text,
  p_rows_inserted int,
  p_rows_updated int,
  p_xero_request_count int,
  p_coverage jsonb,
  p_reconciliation jsonb,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $finalize_body$
BEGIN
  IF p_status NOT IN ('success', 'partial', 'error') THEN
    RAISE EXCEPTION 'finalize_xero_sync_job: invalid status %, must be one of (success, partial, error)', p_status;
  END IF;

  UPDATE sync_jobs
  SET
    finished_at = now(),
    status = p_status,
    rows_inserted = COALESCE(p_rows_inserted, 0),
    rows_updated = COALESCE(p_rows_updated, 0),
    xero_request_count = COALESCE(p_xero_request_count, 0),
    coverage = p_coverage,
    reconciliation = p_reconciliation,
    error = p_error
  WHERE id = p_job_id;
END;
$finalize_body$;

REVOKE ALL ON FUNCTION finalize_xero_sync_job(uuid, text, int, int, int, jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finalize_xero_sync_job(uuid, text, int, int, int, jsonb, jsonb, text) TO service_role;

COMMENT ON FUNCTION begin_xero_sync_job(uuid) IS 'Phase 44 D-07 — atomic single-flight claim. Returns sync_jobs.id on success, NULL if another non-stale running sync exists for this business. Staleness window: 15 min. Service-role only.';
COMMENT ON FUNCTION finalize_xero_sync_job(uuid, text, int, int, int, jsonb, jsonb, text) IS 'Phase 44 D-07 — finalize a sync_jobs row at the end of a sync run. Validates status is one of (success, partial, error). Service-role only.';
