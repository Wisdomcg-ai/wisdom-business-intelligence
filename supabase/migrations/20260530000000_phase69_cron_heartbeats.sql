-- Phase 69-04: cron_heartbeats — append-only invocation log
--
-- Background: Phase 69 root cause (per 69-DIAGNOSIS.md) was that the
-- /api/cron/refresh-xero-tokens cron registered in vercel.json was NOT being
-- invoked in production for many consecutive ticks. Phase 53's telemetry only
-- captured "what happened when the cron ran" — there was no "did the cron run
-- at all" signal. The portfolio silently died for 1-7 days before the Phase 70
-- month-end audit caught it on 2026-05-30.
--
-- This table is the missing observability layer: every cron tick writes ONE
-- row here (success OR failure path). A simple query — "any heartbeat for
-- cron_path X in the last N hours?" — answers the cadence question that
-- would have surfaced the regression on day 1.
--
-- Design constraints (locked by user 2026-05-30):
--   * Append-only: no UPDATE, no DELETE — heartbeats are immutable.
--   * Service-role only inserts (cron routes use createServiceRoleClient).
--   * RLS enabled with a single permissive SELECT for super_admin only —
--     ops debugging happens via the audit script + Supabase studio.
--   * Index on (cron_path, ran_at DESC) so "last invocation per cron" is
--     a single index seek regardless of table growth.
--
-- Retention: not enforced at the DB level in this migration. Expected growth
-- is ~5 crons × 24/6h = ~20 rows/day = ~7,300 rows/year — trivial. If/when
-- this exceeds a few million rows (years), a partition or rolling delete can
-- be added in a follow-up phase.
--
-- Idempotency: all DDL uses IF NOT EXISTS / DO blocks so re-running is a no-op.

BEGIN;

-- 1. Table -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cron_heartbeats (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_path     text NOT NULL,
  ran_at        timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  error_message text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.cron_heartbeats IS
  'Phase 69-04: append-only invocation log for /api/cron/* routes. One row per cron tick. Provides invocation-cadence observability that was missing in Phase 53 and let the Phase 69 regression go undetected for weeks.';

COMMENT ON COLUMN public.cron_heartbeats.cron_path IS
  'The cron route path that produced this heartbeat, e.g. ''/api/cron/refresh-xero-tokens''.';
COMMENT ON COLUMN public.cron_heartbeats.status IS
  'success = cron handler completed without throw. failed = cron handler threw (or partial-success cron explicitly marked failure). partial = cron handler completed but some per-tenant work failed.';
COMMENT ON COLUMN public.cron_heartbeats.error_message IS
  'Optional truncated error message on failure. Null on success.';
COMMENT ON COLUMN public.cron_heartbeats.metadata IS
  'Optional structured payload — counters, durations, per-tenant summary. Cron routes should keep this small (<4KB) — full diagnostic context belongs in Sentry, not here.';

-- 2. Index for "last invocation per cron" queries --------------------------

CREATE INDEX IF NOT EXISTS idx_cron_heartbeats_cron_path_ran_at
  ON public.cron_heartbeats (cron_path, ran_at DESC);

-- 3. RLS — append-only via service role; super_admin can SELECT ------------

ALTER TABLE public.cron_heartbeats ENABLE ROW LEVEL SECURITY;

-- Reset any pre-existing policies so this migration is idempotent.
DROP POLICY IF EXISTS cron_heartbeats_super_admin_select ON public.cron_heartbeats;
DROP POLICY IF EXISTS cron_heartbeats_no_update ON public.cron_heartbeats;
DROP POLICY IF EXISTS cron_heartbeats_no_delete ON public.cron_heartbeats;

-- super_admin can SELECT for ops triage. Everyone else (including the
-- service role, which bypasses RLS by design) does NOT see rows via this
-- policy — service role still has full access for INSERTs.
CREATE POLICY cron_heartbeats_super_admin_select
  ON public.cron_heartbeats
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid()
        AND sr.role = 'super_admin'
    )
  );

-- Explicit no-UPDATE policy (no USING clause that ever matches). Service
-- role bypasses RLS but this documents the append-only invariant for any
-- future migration adding a non-service-role writer.
CREATE POLICY cron_heartbeats_no_update
  ON public.cron_heartbeats
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY cron_heartbeats_no_delete
  ON public.cron_heartbeats
  FOR DELETE
  TO authenticated
  USING (false);

COMMIT;
