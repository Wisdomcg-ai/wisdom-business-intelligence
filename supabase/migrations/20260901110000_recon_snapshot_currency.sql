-- CFO Production Board — currency on reconciliation snapshots.
--
-- IICT's Airwallex feed proved the gap: its unreconciled statement lines are
-- HKD, and the board rendered their value with a bare "$" (implying AUD).
-- House rule: never sum or present foreign currency as AUD. Each snapshot row
-- now records its bank account's currency; readers show values only when all
-- contributing accounts share one currency, otherwise counts only.

begin;

alter table public.reconciliation_snapshots
  add column if not exists currency text;

comment on column public.reconciliation_snapshots.currency is
  'ISO currency code of the bank account these unreconciled items belong to '
  '(from Xero Accounts.CurrencyCode). Null on legacy rows. Readers must not '
  'sum values across differing currencies.';

commit;
