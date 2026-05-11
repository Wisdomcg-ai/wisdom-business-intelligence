-- Phase 64: per-vendor-per-account spend split.
--
-- Before this column, the sidebar computed per-account totals by attributing
-- a vendor's full monthlyBudget to EVERY account in its `account_codes` list.
-- For a vendor with transactions across 3 accounts, this triple-counted the
-- vendor's spend (showed up as the same total next to each of the 3 accounts).
--
-- `account_splits` stores the actual amount per (vendor, account) pair from
-- the analyze step. Keyed by account code, value is the prior-FY $ amount.
-- Sidebar uses exact splits → no more duplicate attribution.
--
-- JSONB shape: { "316": 1234.56, "297": 567.89, ... }

ALTER TABLE public.subscription_budgets
  ADD COLUMN IF NOT EXISTS account_splits jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.subscription_budgets.account_splits IS
  'Per-account spend breakdown for this vendor. JSONB keyed by Xero accountCode, value is the prior-FY $ amount in that account. Empty {} for legacy / not-yet-analyzed rows; sidebar falls back to splitting account_codes evenly.';
