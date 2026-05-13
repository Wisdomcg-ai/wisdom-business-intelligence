-- Phase 53 (P3a follow-up) — promote xero_pl_lines.tenant_id to NOT NULL.
--
-- Backstory: on 2026-04-27 a sync run wrote 623 P&L rows for Envisage with
-- empty/null tenant_id, totalling ~$28M of corrupted cumulative amounts.
-- The unique key at the time was
-- (business_id, COALESCE(tenant_id, ''), account_code, period_month),
-- which allowed those orphan rows to co-exist alongside properly-keyed rows
-- and silently double-counted into the wizard's Step 2 baseline.
--
-- That batch has been remediated manually (delete by business_id +
-- tenant_id IS NULL/empty). A pre-flight scan across all clients on
-- 2026-05-13 returned zero offender rows, so the column is safe to lock down.
--
-- Going forward, this constraint kills the "orphan batch" corruption class
-- structurally: the sync orchestrator can no longer insert a row without a
-- real tenant_id; an attempt to do so will fail loud rather than silently
-- poison aggregates. Operators are forced to investigate root cause instead
-- of accumulating bad data.
--
-- Idempotency: ALTER COLUMN ... SET NOT NULL is a no-op if already applied.
-- Re-runnable. Note that ALTER COLUMN SET NOT NULL in Postgres scans the
-- table once; xero_pl_lines is small (low tens of thousands of rows in prod
-- as of 2026-05-13) so this is well under a second.

BEGIN;

-- Pre-flight: refuse to proceed if any row has NULL or empty tenant_id.
-- The 2026-05-13 scan was clean; this guard prevents a future re-run from
-- silently failing or, worse, accidentally locking down a polluted table.
DO $preflight$
DECLARE
  v_bad_rows int;
BEGIN
  SELECT count(*)
    INTO v_bad_rows
    FROM xero_pl_lines
   WHERE tenant_id IS NULL OR tenant_id = '';

  IF v_bad_rows > 0 THEN
    RAISE EXCEPTION
      'P3a pre-flight: % xero_pl_lines rows have NULL/empty tenant_id. Identify the source business_id(s) and remediate before re-running this migration. Aborting.',
      v_bad_rows;
  END IF;
END
$preflight$;

-- Promote tenant_id to NOT NULL. The natural-key unique constraint
-- (business_id, tenant_id, account_id, period_month) from
-- 20260430000003 remains in place; its NULL-handling becomes moot once
-- NULLs are forbidden.
ALTER TABLE xero_pl_lines
  ALTER COLUMN tenant_id SET NOT NULL;

COMMIT;

COMMENT ON COLUMN xero_pl_lines.tenant_id IS
  'Xero tenant (organisation) identifier — required. NOT NULL since 20260513000000 to prevent the orphan-batch corruption class (P3a, Phase 53 hardening).';
