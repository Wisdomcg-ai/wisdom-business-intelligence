-- Phase 61 (B2): Persist current-FY YTD spend per subscription vendor.
--
-- Before this column, `subscription_budgets` only stored `last_12_months_spend`
-- (used as the "Prior FY" amount in the wizard). Current-FY YTD spend was
-- computed at analyze time but never persisted — restoring vendors from this
-- table always showed $0 for current-FY until the operator re-ran analyze.
--
-- After this migration, the analyze API writes `current_fy_spend` alongside
-- `last_12_months_spend`, and the wizard's restore path reads both. The card
-- and per-vendor breakdown survive a page refresh.

ALTER TABLE public.subscription_budgets
  ADD COLUMN IF NOT EXISTS current_fy_spend numeric(12,2) DEFAULT 0;

COMMENT ON COLUMN public.subscription_budgets.current_fy_spend IS
  'Current fiscal year YTD spend captured at analyze time. Refreshes when the operator re-runs subscription analysis.';
