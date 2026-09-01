-- CFO Production Board — per-client hide flag.
--
-- Matt curates which Xero-connected clients appear on the board (e.g. demo
-- accounts, clients whose reporting he doesn't run). Hidden clients drop out
-- of the board's sections and stats but stay listed in a "Hidden clients"
-- restore list — the flag hides, it never deletes.
-- monthly_report_settings is businesses-space, one row per business.

begin;

alter table public.monthly_report_settings
  add column if not exists hide_from_board boolean not null default false;

comment on column public.monthly_report_settings.hide_from_board is
  'Client is hidden from the CFO production board (/cfo). Board-only: has no '
  'effect on reports, sync, or anything else.';

commit;
