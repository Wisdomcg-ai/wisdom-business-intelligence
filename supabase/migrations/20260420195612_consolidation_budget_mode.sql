-- ============================================================
-- Phase 34 Step 2 — Hybrid Budget Mode (per-business opt-in)
--
-- Adds a `consolidation_budget_mode` column to the `businesses` table so each
-- consolidation business can declare how it wants its budget modelled:
--
--   'single'     → ONE business-level forecast (tenant_id IS NULL) whose
--                  budget lines drive the consolidated Budget column.
--                  Per-tenant budget columns stay empty. Simpler — a single
--                  consolidated plan.
--   'per_tenant' → Each Xero tenant has its OWN forecast (tenant_id = <x>).
--                  The engine sums per-tenant budgets into the consolidated
--                  Budget column (Calxa-style).
--
-- Default is 'single' — this is the safer, simpler option for a business that
-- hasn't explicitly configured per-tenant budgets yet. Existing rows inherit
-- 'single' via the column default + an explicit UPDATE backfill.
--
-- The engine behaviour is then:
--   - mode='single'     → load ONE forecast (business_id=X, tenant_id IS NULL,
--                         fiscal_year=Y) and feed it into consolidated.budgetLines.
--   - mode='per_tenant' → load per-tenant forecasts (existing 34.3 behaviour).
--                         If zero per-tenant forecasts exist, fall back to the
--                         legacy tenant_id IS NULL forecast (backward compat).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS before
-- CREATE CONSTRAINT, so reruns are safe.
-- ============================================================

ALTER TABLE "public"."businesses"
  ADD COLUMN IF NOT EXISTS "consolidation_budget_mode" TEXT DEFAULT 'single';

-- Backfill: existing rows get the safe default. The column default covers
-- INSERTs going forward; this UPDATE catches rows inserted before the default
-- was declared (edge case — ADD COLUMN DEFAULT applies to existing rows in
-- Postgres 11+, but this is belt-and-braces).
UPDATE "public"."businesses"
   SET "consolidation_budget_mode" = 'single'
 WHERE "consolidation_budget_mode" IS NULL;

-- CHECK constraint — only 'single' or 'per_tenant' are valid. DROP first so
-- this is idempotent even if the constraint name was previously created.
ALTER TABLE "public"."businesses"
  DROP CONSTRAINT IF EXISTS "businesses_consolidation_budget_mode_check";

ALTER TABLE "public"."businesses"
  ADD CONSTRAINT "businesses_consolidation_budget_mode_check"
  CHECK ("consolidation_budget_mode" IN ('single', 'per_tenant'));

COMMENT ON COLUMN "public"."businesses"."consolidation_budget_mode" IS
  'Hybrid budget mode for multi-tenant consolidation: ''single'' = one business-level forecast drives consolidated Budget; ''per_tenant'' = each Xero tenant has its own forecast, summed into consolidated Budget. Defaults to ''single''. See Phase 34 Step 2.';
