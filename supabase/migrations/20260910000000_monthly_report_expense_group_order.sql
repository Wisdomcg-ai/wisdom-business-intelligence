-- Expense groups: the ORDER the headings appear in.
--
-- Calxa gathers a client's expense accounts under headings with a subtotal each
-- — Urban Road has nine: Employment Expense, Travel & Accommodation,
-- Professional Expense, IT Hardware and Software, Marketing and Advertising,
-- Occupancy Expense, Foreign Currency Gains and Losses, Bank and Other Fees,
-- Other Operating Expenses. Ours printed 49 accounts as one flat alphabetical
-- list, which is why the expense pages read as a ledger export.
--
-- MEMBERSHIP already has a home: account_mappings.report_subcategory, one row
-- per Xero account, currently null for every client. This column supplies the
-- only thing membership cannot — the order the headings run in, which is the
-- coach's editorial choice and matches no property of the accounts themselves.
-- (Ordering by lowest account code was tried against Urban Road's chart and
-- produces a different order from the one the client has read for two years.)
--
-- Nullable, and null means "no grouping" — every client that has not opted in
-- renders exactly as before.
alter table public.monthly_report_settings
  add column if not exists expense_group_order text[];

comment on column public.monthly_report_settings.expense_group_order is
  'Ordered expense group headings. Membership lives on account_mappings.report_subcategory; groups present in the data but absent here sort after these, alphabetically. NULL = ungrouped (flat list).';
