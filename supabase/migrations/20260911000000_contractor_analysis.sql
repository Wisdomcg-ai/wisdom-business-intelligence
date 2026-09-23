-- The Contractor Analysis page.
--
-- Calxa's page 14 is a hand-maintained Google Sheet tab: every contractor down
-- the side, the months across, a budget column, and a category pivot beside it.
-- Rolling it each month means inserting a column, typing per-contractor
-- payments read off Xero's Account Transactions report, tying the column total
-- to the cent, and editing a pivot's source range without touching its value
-- cells. WisdomBI already has the transactions; what it lacks is the two facts
-- the sheet adds — which accounts count as contractor spend, and which
-- department each contractor works for.

-- Which accounts are contractor spend. Mirrors subscription_account_codes.
alter table public.monthly_report_settings
  add column if not exists contractor_account_codes text[];

comment on column public.monthly_report_settings.contractor_account_codes is
  'Xero account codes whose vendor detail feeds the Contractor Analysis page (Urban Road: 61400). NULL/empty = the page is not part of this client''s pack.';

-- The department a vendor belongs to, for the category rollup. Lives on the
-- per-vendor budget row because that is already the one place a human states
-- things about a vendor that Xero does not know.
alter table public.subscription_budgets
  add column if not exists category text;

comment on column public.subscription_budgets.category is
  'Vendor grouping for the Contractor Analysis pivot (Marketing, Operations, Creative/Product, Finance, Sales/Commercial, All Departments). NULL = ungrouped, and the pivot puts those last under no heading.';
