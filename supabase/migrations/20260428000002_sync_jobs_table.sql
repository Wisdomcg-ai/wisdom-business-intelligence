-- Phase 44 Plan 44-02 Task 2 — sync_jobs audit table
--
-- D-07 (race / idempotency / debuggability): every Xero sync run writes one
-- audit row. Append-only via service role; coaches and business members can
-- SELECT their own rows. The orchestrator (44-04) inserts the row at sync
-- start and updates it at finish. Cron heartbeat (D-11) also writes here.
--
-- D-10 (sparse-tenant policy): coverage JSONB exposes months_covered,
-- first_period, last_period, expected_months so the wizard can render the
-- "Xero data covers Mar 2025 – Apr 2026 (14 months)" banner without re-querying.
--
-- D-08 (reconciliation contract): per-account discrepancies surfaced via the
-- reconciliation JSONB column when the by-month sum disagrees with the
-- single-period FY total.

BEGIN;

CREATE TABLE IF NOT EXISTS sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  tenant_id text,                                  -- nullable: a sync job may span multiple orgs
  job_type text NOT NULL DEFAULT 'xero_pl_sync',   -- 'xero_pl_sync' | future variants
  status text NOT NULL DEFAULT 'running',          -- 'running' | 'success' | 'error' | 'partial'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  fy_range jsonb,                                  -- {"current_fy": 2026, "prior_fy": 2025, "fy_start_month": 7}
  coverage jsonb,                                  -- D-10: {"months_covered": 14, "first_period": "2025-03", "last_period": "2026-04", "expected_months": 24}
  rows_inserted int NOT NULL DEFAULT 0,
  rows_updated int NOT NULL DEFAULT 0,
  xero_request_count int NOT NULL DEFAULT 0,
  error text,                                       -- populated on status='error' or 'partial'
  reconciliation jsonb,                             -- D-08: {"discrepant_accounts": [{"code": "...", "name": "...", "monthly_sum": 0, "fy_total": 0, "diff": 0}]}
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_jobs_business_started_idx ON sync_jobs (business_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sync_jobs_status_idx ON sync_jobs (status) WHERE status IN ('error', 'partial');

-- ----------------------------------------------------------------------------
-- RLS — append-only audit semantics
-- ----------------------------------------------------------------------------
-- Coach + business members SELECT their own rows. NOBODY hand-writes (only
-- service-role writes via the orchestrator + cron). Append-only is enforced
-- by absence of authenticated INSERT/UPDATE/DELETE policies.
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

-- Coach + business members SELECT for businesses they have access to via
-- business_users membership OR direct ownership (businesses.owner_id).
CREATE POLICY sync_jobs_coach_select ON sync_jobs
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
    OR business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Service role: full access (cron + sync orchestrator)
CREATE POLICY sync_jobs_service_role_all ON sync_jobs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- NOTE: No INSERT / UPDATE / DELETE policies for `authenticated` role.
-- Append-only semantics enforced by absence of authenticated write policies.

COMMENT ON TABLE sync_jobs IS 'Phase 44 — per-sync-run audit log. Append-only by service role. RLS allows coach + business members to read their own rows.';
COMMENT ON COLUMN sync_jobs.coverage IS 'D-10 coverage record: {months_covered, first_period (YYYY-MM), last_period (YYYY-MM), expected_months}';
COMMENT ON COLUMN sync_jobs.reconciliation IS 'D-08 fail-loud results: {discrepant_accounts: [{code, name, monthly_sum, fy_total, diff}]}';
COMMENT ON COLUMN sync_jobs.fy_range IS 'D-06 sync window descriptor: {current_fy, prior_fy, fy_start_month}';

COMMIT;
