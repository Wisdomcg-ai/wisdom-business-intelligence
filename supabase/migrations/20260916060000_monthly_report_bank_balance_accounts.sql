-- Which accounts the Bank Balances & Movement page prints.
--
-- The pack already has bank_account_ids: the accounts Where Did Our Money Go
-- and the cashflow opening balance count as CASH. That list is asset-only by
-- construction — a chosen account that is not an asset makes the opening
-- balance unavailable rather than smaller (opening-bank.ts), because counting a
-- credit card as cash overstates the money in the bank by whatever is owing.
--
-- Calxa's Bank Balances page is a different list. IICT's (p17) prints the two
-- Cash on Hand accounts, which sit under Current Assets and not under Bank, and
-- the Altitude Business Gold Mastercard, a LIABILITY, as a negative asset — the
-- money the group holds less the money it owes on the card (IICT-43). Putting
-- those into bank_account_ids would silently move Where Did Our Money Go's bank
-- movement and the cashflow's opening balance, so the page gets its own column.
--
-- Xero AccountIDs, not codes: several of these accounts have no code in Xero,
-- and a code is not unique across the organisations of a group.
--
-- The code reads this column with a fallback (bank-balances-load): until this
-- migration is applied — and for a business that has not chosen a separate list
-- — the page uses bank_account_ids, and says so when neither is set.
alter table public.monthly_report_settings
  add column if not exists bank_balance_account_ids text[];

comment on column public.monthly_report_settings.bank_balance_account_ids is
  'Xero AccountIDs the Bank Balances & Movement page prints (bank, cash-on-hand and credit-card accounts; cards shown as negative assets). NULL/empty = fall back to bank_account_ids.';
