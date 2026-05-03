-- Enforce: at most one is_active=true forecast per (business_id, fiscal_year, forecast_type).
-- Prevents the duplicate-active state that caused FY-mismatch bugs and made
-- "find the active forecast" lookups non-deterministic.
--
-- Companion remediation script: scripts/remediate-duplicate-active-forecasts.ts
-- has already been run to clear pre-existing duplicates as of 2026-04-27.

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_forecast_per_fy
  ON public.financial_forecasts (business_id, fiscal_year, forecast_type)
  WHERE is_active = true;
