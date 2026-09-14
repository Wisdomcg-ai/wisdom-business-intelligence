-- The pack's cashflow model v2, opt-in per business.
--
-- WHY. Urban Road's August 2026 pack printed July and August on its cashflow
-- page as the accrual P&L run through debtor/creditor timing, with a copy of
-- July's own sales standing in for the June debtors — cash the bank never saw
-- — and GST, BAS and super on guesses. v2 prints the elapsed months as the
-- cash that actually moved (tied to the cent to Where Did Our Money Go) and
-- the rest of the year from the approved budget on the client's own terms and
-- ATO schedules. Every one of those terms is a fact about the client the
-- ledger cannot answer (GST basis, BAS agent or self, the PAYG liability
-- account, super timing), so they live here, set by the coach.
--
-- WHY A COLUMN, not a key in `sections`: the settings page saves `sections`
-- wholesale as UI toggles, and both the chart and the table must read one
-- per-business fact, not per-placement widget config. Same precedent as
-- bank_account_ids (20260914000000) on this row.
--
-- NULL (the default) = v1, exactly the cashflow pages every client prints
-- today. The code reads 42703/PGRST204 as NULL, so it is safe to deploy
-- before this is applied. The settings upsert names its columns, so a
-- settings save never clears this one.
--
-- Shape: see src/lib/monthly-report/cash-model-config.ts (strict — an
-- unknown key is a reason the page prints). No grants: the table already has
-- RLS and its policies cover the new column. Apply by hand after merge, then
-- `notify pgrst, 'reload schema'`.

alter table public.monthly_report_settings
  add column if not exists cash_model jsonb;

comment on column public.monthly_report_settings.cash_model is
  'Cashflow model v2 settings for the monthly pack (cash-model-config.ts). NULL or enabled=false = the v1 cashflow pages.';
