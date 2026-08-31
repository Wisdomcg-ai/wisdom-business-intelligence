-- WD.7 — cash basis, step 1: the P&L mirror's natural key learns basis.
--
-- xero_pl_lines has carried a `basis` column ('accruals' default) since the
-- mirror was built, but the natural key didn't include it — a cash-basis row
-- for the same (business, tenant, account, month) would COLLIDE with the
-- accruals row and overwrite it on upsert. That collision is the basis trap
-- W0.1 guarded the read side against; this extends the write side so both
-- bases can coexist.
--
-- The wide-compat views already filter basis='accruals' (W0.1), so cash rows
-- are invisible to every existing reader by construction.
--
-- NOT VALID + VALIDATE isn't needed: adding a UNIQUE constraint takes a
-- table scan either way, and the table is small (thousands of rows).

alter table public.xero_pl_lines
  drop constraint xero_pl_lines_natural_key_uniq;

alter table public.xero_pl_lines
  add constraint xero_pl_lines_natural_key_uniq
  unique (business_id, tenant_id, account_id, period_month, basis);
