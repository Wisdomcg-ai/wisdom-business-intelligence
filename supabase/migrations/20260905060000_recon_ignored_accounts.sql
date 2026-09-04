-- CFO Production Board — per-client ignore list for reconciliation verdicts.
--
-- Some badge accounts must never block a report: Urban Road's "DO NOT USE"
-- PayPal feed carries ~19,920 ancient lines that will never be reconciled
-- (the feed should be archived). The readiness verdict excludes accounts
-- named here; everything else counts.

begin;

alter table public.monthly_report_settings
  add column if not exists recon_ignored_accounts text[] not null default '{}';

comment on column public.monthly_report_settings.recon_ignored_accounts is
  'Bank account names (as captured from the Xero dashboard badge) excluded '
  'from the report-readiness verdict — legacy/dead feeds that will never be '
  'reconciled. Board-only; affects no report figures.';

commit;
