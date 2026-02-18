-- Monthly Report Phase 4: Subscription & Wages Analysis
-- Adds account configuration columns for detail tabs

ALTER TABLE monthly_report_settings
  ADD COLUMN IF NOT EXISTS subscription_account_codes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS wages_account_names text[] DEFAULT '{}';
