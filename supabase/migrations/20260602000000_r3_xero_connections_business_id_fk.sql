-- ============================================================================
-- R3 — Add the missing FOREIGN KEY on xero_connections.business_id
-- ============================================================================
-- xero_connections.business_id is `uuid NOT NULL` (baseline_schema.sql:5547) but
-- has carried NO foreign-key constraint, so nothing at the DB level guaranteed it
-- pointed at a real business. This was NOT part of the Phase 49 DB-04 audit
-- (which covered 56 owner/child FKs); R3 closes this specific gap.
--
-- PRE-FLIGHT ORPHAN AUDIT (prod, 2026-06-02 — read-only, see
-- .planning/codebase/R3-XERO-CONNECTIONS-FK-ORPHAN-AUDIT.sql):
--   in_businesses=12  in_profiles=0  in_both=0  in_neither=0  active_orphans=0
-- → ALL 12 live connections resolve to a real businesses.id. ZERO point at a
--   business_profiles.id, ZERO are orphaned. So the FK targets `businesses(id)`
--   (NOT business_profiles — xero_connections keys to businesses, unlike the
--   money LINE tables xero_pl_lines / xero_bs_lines which key to
--   business_profiles per the dual-id pattern, MEMORY project_dual_id). Adding
--   the constraint validates cleanly against existing rows — no NOT VALID dance
--   needed at this row count.
--
-- ON DELETE CASCADE — rationale (matches established convention):
--   docs/db/fk-policy.md already documents that deleting a business cascades its
--   `business_id` child data — "forecasts, monthly reports, Xero sync state, and
--   ~26 other child tables" (Bucket C-1 discussion). xero_connections is exactly
--   that: per-business Xero OAuth state. When a business is deleted its Xero
--   connection must go too — a dangling OAuth token (access/refresh) for a
--   non-existent business is both useless and a security liability. CASCADE here
--   mirrors the custom_kpis_library.business_id CASCADE shipped in
--   20260508000000_db04_restrict_and_manual_review_fks.sql (Bucket C-2).
--
--   Businesses are effectively never hard-deleted in normal operation (they are
--   deactivated/archived), so this CASCADE only fires on a deliberate admin hard
--   delete — exactly when auto-removing the stale token is the correct cleanup.
--
-- Pattern: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (PostgreSQL has no
-- ALTER CONSTRAINT … SET ON DELETE). Idempotent. Atomic in this transaction.
-- Tested via src/__tests__/migrations/r3-xero-connections-fk.test.ts (live-DB,
-- skipped in placeholder CI per the DB-04 _helpers convention).
-- ============================================================================

BEGIN;

ALTER TABLE "public"."xero_connections"
  DROP CONSTRAINT IF EXISTS "xero_connections_business_id_fkey";
ALTER TABLE "public"."xero_connections"
  ADD  CONSTRAINT "xero_connections_business_id_fkey"
       FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id")
       ON DELETE CASCADE;

COMMIT;
