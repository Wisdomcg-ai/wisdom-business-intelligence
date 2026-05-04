-- ============================================================================
-- Phase 49 DB-04: FINAL batch — Bucket C operator-judgement FKs (2 FKs)
-- ============================================================================
-- Per docs/db/fk-policy.md Bucket C (signed off by Matt 2026-05-04;
-- re-confirmed in plan 49-07 operator checkpoint).
--
-- This is the LAST migration in Phase 49 DB-04. After this migration applies,
-- ALL 56 originally-orphan-prone FKs from the 2026-04-28 codebase audit
-- Section D #1 carry an explicit ON DELETE clause:
--   - Bucket A SET NULL: 50 FKs (49-04 + 49-05)
--   - Bucket B CASCADE: 4 FKs   (49-06)
--   - Bucket C RESTRICT/CASCADE: 2 FKs (this migration)
--   Total: 56/56 ✓
--
-- RESEARCH.md Sentinel 1 SQL after this migration ships:
--   SELECT count(*) FROM information_schema.referential_constraints
--   WHERE constraint_schema = 'public' AND delete_rule = 'NO ACTION';
-- Returns 0 rows. (Future schema work must include explicit ON DELETE; CI
-- migration-check tightening is a separate follow-up.)
--
-- ─── Bucket C decisions (operator) ──────────────────────────────────────────
--
--   1. businesses.owner_id → auth.users.id  → RESTRICT
--      Reasoning: deleting an owner whose business is still live would
--      silently destroy 26+ child tables via the existing business_id CASCADE
--      chain. RESTRICT forces a 2-step coach-offboarding: ownership-transfer
--      or business-archival first, then user deletion. Manual but safe.
--
--      App-code implication: any user-deletion code path must first reassign
--      ownership or archive the business. Existing flows that try to delete
--      a business owner directly will now FAIL with a foreign-key violation
--      (SQLSTATE 23503). This is the intended behavior — the 'failure' is
--      the safety net.
--
--      RESTRICT-vs-NO-ACTION: PostgreSQL's NO ACTION (the prior implicit
--      default) and RESTRICT both block the parent delete for non-deferrable
--      FKs. The functional behavior is identical at commit time. The
--      DIFFERENCE is intent visibility: NO ACTION reads as "constraint
--      author didn't decide"; RESTRICT reads as "we deliberately chose
--      blocking." This migration codifies prior behavior + makes intent
--      explicit in the schema.
--
--   2. custom_kpis_library.business_id → business_profiles.id  → CASCADE
--      Reasoning: mirror existing business_id FK CASCADE convention. Custom
--      KPI definitions belong to their business; deleting the business
--      removes its KPIs. Note this FK references business_profiles (not
--      businesses) per the project's dual-id pattern (project_dual_id
--      MEMORY note) — but the CASCADE semantics are unchanged.
--
-- Pattern: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (PostgreSQL does not
-- support ALTER CONSTRAINT … SET ON DELETE). Atomic in this migration's
-- transaction.
--
-- Tested via src/__tests__/migrations/db-04-restrict-batch.test.ts.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- businesses.owner_id → auth.users.id  (Bucket C-1) — RESTRICT
-- ----------------------------------------------------------------------------
-- The single highest-stakes FK in Phase 49. RESTRICT blocks the user delete
-- when the user still owns a business. Coach offboarding becomes a 2-step
-- process: archive the business or transfer ownership, then delete the user.
-- See docs/db/fk-policy.md Bucket C-1 for operator decision rationale.
ALTER TABLE "public"."businesses"
  DROP CONSTRAINT IF EXISTS "businesses_owner_id_fkey";
ALTER TABLE "public"."businesses"
  ADD  CONSTRAINT "businesses_owner_id_fkey"
       FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id")
       ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- custom_kpis_library.business_id → business_profiles.id  (Bucket C-2) — CASCADE
-- ----------------------------------------------------------------------------
-- Mirrors existing business_id FK CASCADE convention. Custom KPI definitions
-- travel with their business; deleting a business_profiles row destroys its
-- KPI library. References business_profiles (not businesses) per the
-- project's dual-id pattern — see MEMORY.md project_dual_id and fk-policy.md
-- Bucket C-2 for context.
ALTER TABLE "public"."custom_kpis_library"
  DROP CONSTRAINT IF EXISTS "custom_kpis_library_business_id_fkey";
ALTER TABLE "public"."custom_kpis_library"
  ADD  CONSTRAINT "custom_kpis_library_business_id_fkey"
       FOREIGN KEY ("business_id") REFERENCES "public"."business_profiles"("id")
       ON DELETE CASCADE;

COMMIT;
