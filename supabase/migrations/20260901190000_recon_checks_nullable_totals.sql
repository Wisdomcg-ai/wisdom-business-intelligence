-- Honesty hardening: an ERRORED reconciliation check must store NULL totals,
-- never a confident zero. The columns were NOT NULL DEFAULT 0, so a reader
-- that missed the status column saw "0 outstanding" on a check that in fact
-- failed. Writers now persist NULL on status='error'.

begin;

alter table public.reconciliation_checks
  alter column total_unreconciled_count drop not null,
  alter column total_unreconciled_value drop not null;

comment on column public.reconciliation_checks.total_unreconciled_count is
  'Total unreconciled items across the tenant''s bank accounts. NULL when '
  'status=error — never render an errored check as zero outstanding.';

commit;
