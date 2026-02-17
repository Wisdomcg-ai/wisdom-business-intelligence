-- Add account_code column to xero_pl_lines
-- Populated from Xero Chart of Accounts during P&L sync
-- Enables reliable code-based matching between Xero actuals and forecast budget lines

ALTER TABLE public.xero_pl_lines
  ADD COLUMN IF NOT EXISTS account_code text;

CREATE INDEX IF NOT EXISTS idx_xero_pl_lines_account_code
  ON xero_pl_lines(business_id, account_code);
