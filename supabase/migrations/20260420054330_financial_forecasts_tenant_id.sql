-- ============================================================
-- Phase 34 Iteration 34.3 — Consolidated budget per tenant (Option B)
--
-- Adds an optional `tenant_id` column to financial_forecasts so a single
-- business can hold one budget per Xero tenant. The consolidated P&L
-- route then sums per-tenant budgets into a consolidated budget column
-- for variance reporting.
--
-- Semantics:
--   - tenant_id IS NULL  → legacy, business-level forecast (backward-compat)
--   - tenant_id = <xero> → forecast scoped to that Xero tenant
--
-- No backfill. Existing rows stay NULL — they keep rendering as the
-- "whole business / legacy" forecast until a coach explicitly reassigns
-- them via the admin UI or forecast wizard.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ============================================================

ALTER TABLE "public"."financial_forecasts"
  ADD COLUMN IF NOT EXISTS "tenant_id" "text";

COMMENT ON COLUMN "public"."financial_forecasts"."tenant_id" IS
  'Xero tenant this forecast is scoped to (matches xero_connections.tenant_id). NULL = legacy, business-level forecast (backward-compat fallback). Set per-tenant by the forecast wizard or admin consolidation page.';

-- Composite index supporting the consolidation engine's per-tenant lookup:
--   SELECT id FROM financial_forecasts
--   WHERE business_id = X AND tenant_id = Y AND fiscal_year = Z
-- plus the fallback NULL lookup used when no tenant-scoped forecast exists.
CREATE INDEX IF NOT EXISTS "financial_forecasts_business_tenant_idx"
  ON "public"."financial_forecasts" USING "btree" ("business_id", "tenant_id");
