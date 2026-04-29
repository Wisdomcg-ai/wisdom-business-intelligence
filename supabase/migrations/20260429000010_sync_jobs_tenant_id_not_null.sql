-- Phase 44.2 Plan 44.2-02 — sync_jobs.tenant_id NOT NULL constraint
--
-- D-44.2-04 (per-tenant reconciliation first-class) and D-44.2-05 (every
-- sync_jobs write MUST have a tenant_id) require that the data_quality
-- lookup in ForecastReadService (44.2-07) can resolve per-tenant
-- reconciliation status via:
--
--   SELECT ... FROM sync_jobs
--    WHERE business_id = $1 AND tenant_id = $2
--    ORDER BY started_at DESC
--    LIMIT 1
--
-- Today every existing row has tenant_id IS NULL — the orchestrator at
-- src/lib/xero/sync-orchestrator.ts records the row before iterating
-- tenants and never sets tenant_id (Phase 44 Sub-A audit gap, see
-- SYNC-JOBS-TENANT-ID-AUDIT.md). This migration backfills (Path A —
-- Backfill-then-NOT-NULL, selected per the 44.2-01 audit decision: 20/20
-- existing rows are unambiguously backfill-able from xero_connections),
-- sets a defensive empty-string default (matching the xero_pl_lines
-- precedent from 44-05 migration 4), enforces NOT NULL, and adds the
-- per-tenant lookup index that 44.2-07 will read.
--
-- Idempotent: WHERE tenant_id IS NULL filters guarantee re-runnability;
-- IF NOT EXISTS guards on the index; ALTER COLUMN ... SET NOT NULL is
-- a no-op once the column is already NOT NULL (PG raises NOTICE, not
-- ERROR, on re-application).
--
-- Compatibility: Studio-friendly (no BEGIN/COMMIT — Supabase Studio uses
-- an implicit transaction). The DO block guard is permitted in Studio
-- because it's a single statement.

-- ─── Section 1: backfill (Path A from SYNC-JOBS-TENANT-ID-AUDIT.md) ──────────
--
-- Dual-ID join: sync_jobs.business_id may be businesses.id OR
-- business_profiles.id; xero_connections.business_id likewise. Resolve via
-- the business_profiles bridge so either side of either table reaches the
-- correct tenant.
--
-- No xc.is_active filter — xero_connections.is_active flips transiently
-- during sync runs (observed 2026-04-29 on both JDS and Envisage); the
-- row's existence is the authoritative signal for tenant attribution.

UPDATE sync_jobs sj
   SET tenant_id = xc.tenant_id
  FROM xero_connections xc
  LEFT JOIN business_profiles bp
    ON bp.id = xc.business_id OR bp.business_id = xc.business_id
 WHERE sj.tenant_id IS NULL
   AND (
     xc.business_id = sj.business_id
     OR bp.id = sj.business_id
     OR bp.business_id = sj.business_id
   );

-- ─── Section 2: assertion guard ─────────────────────────────────────────────
--
-- After backfill, before adding NOT NULL: assert no NULLs remain. This makes
-- the migration fail loud rather than swallow edge cases that emerged
-- between audit time (2026-04-29) and apply time. If a new business +
-- xero_connection appears between then and apply with sync_jobs rows
-- already written, the audit decision (Path A is achievable) needs
-- re-validation.

DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining FROM sync_jobs WHERE tenant_id IS NULL;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'sync_jobs backfill incomplete: % NULL rows remain — re-audit before continuing (SYNC-JOBS-TENANT-ID-AUDIT.md path B/C)', remaining;
  END IF;
END$$;

-- ─── Section 3: defensive default ───────────────────────────────────────────
--
-- Matches the xero_pl_lines precedent from 44-05 migration 4. The orchestrator
-- still relies on begin_xero_sync_job (D-07 single-flight guard) which
-- INSERTs a row at sync start before per-tenant context is in scope; with
-- DEFAULT '' that pre-tenant row passes the NOT NULL check, and the
-- per-tenant rows added in this plan (44.2-02) are populated explicitly.

ALTER TABLE sync_jobs ALTER COLUMN tenant_id SET DEFAULT '';

-- ─── Section 4: enforce NOT NULL ────────────────────────────────────────────

ALTER TABLE sync_jobs ALTER COLUMN tenant_id SET NOT NULL;

-- ─── Section 5: per-tenant data_quality lookup index ────────────────────────
--
-- ForecastReadService.computeDataQuality (44.2-07) reads:
--   WHERE business_id=$1 AND tenant_id=$2 ORDER BY started_at DESC LIMIT 1
-- This index covers that pattern exactly. Existing
-- sync_jobs_business_started_idx (business_id, started_at DESC) stays for
-- the business-scoped queries that don't filter by tenant.

CREATE INDEX IF NOT EXISTS sync_jobs_business_tenant_started_idx
  ON sync_jobs (business_id, tenant_id, started_at DESC);

-- ─── Section 6: column comment ──────────────────────────────────────────────

COMMENT ON COLUMN sync_jobs.tenant_id IS
  'Phase 44.2-02 — NOT NULL DEFAULT '''' since this migration. Per-tenant reconciliation key for D-44.2-04 (per-tenant first-class). Backfilled from xero_connections via the business_profiles dual-ID bridge on 2026-04-29 per SYNC-JOBS-TENANT-ID-AUDIT.md (Path A). Empty string permitted only for the outer business-level row claimed by begin_xero_sync_job before per-tenant context is in scope — every per-tenant write populates this with a real Xero tenant UUID.';
