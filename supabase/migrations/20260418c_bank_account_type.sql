-- Phase 28.1 follow-up: capture Xero's BankAccountType on xero_accounts
-- so we can split bank accounts from credit cards in the settings UI.
--
-- Xero values: BANK | CREDITCARD | PAYPAL (and a few others)
-- Only populated when xero_type = 'BANK' (other account types don't have it).

ALTER TABLE xero_accounts
  ADD COLUMN IF NOT EXISTS bank_account_type text;

CREATE INDEX IF NOT EXISTS xero_accounts_bank_account_type_idx
  ON xero_accounts (business_id, bank_account_type)
  WHERE bank_account_type IS NOT NULL;
