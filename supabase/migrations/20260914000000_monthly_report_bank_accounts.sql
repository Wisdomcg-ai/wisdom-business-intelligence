-- Which accounts the monthly pack counts as bank.
--
-- The pack decides "bank" in two places — Where Did Our Money Go's "How this
-- Affected Our Bank" and the cashflow page's opening balance — and both read
-- every asset account in the balance sheet's Bank section. Calxa's Urban Road
-- pack counts two of the nine: CBA Cheque Account and Bus Online Saver, with
-- the Tax Savings account, PayPal and Wise treated as ordinary balance-sheet
-- movements. At 31 Aug 2026 that is $117,724.85 against our $210,184.59, and
-- August's bank movement is (31,708) against our (55,500). Which set a client
-- reads is the coach's choice, so it is a setting, one per business.
--
-- Xero AccountIDs, not codes: Bus Online Saver, AUD PayPal and both Wise
-- accounts have no code in Xero, and codes are not unique across organisations.
--
-- The code reads this column with a fallback (bank-accounts-load): until this
-- migration is applied every business keeps the Bank section, exactly as now.
alter table public.monthly_report_settings
  add column if not exists bank_account_ids text[];

comment on column public.monthly_report_settings.bank_account_ids is
  'Xero AccountIDs the monthly pack counts as bank (Where Did Our Money Go, cashflow opening balance). Only asset accounts count. NULL/empty = every asset account in the balance sheet''s Bank section.';
