-- CFO Production Board — badge-only clients (no Xero API connection).
--
-- Some clients can't connect to WisdomBI's Xero app (Distinct Directions'
-- org is at Xero's connected-app limit, 5 Sep 2026) but the recon round can
-- still read their dashboard badge in Matt's browser. These columns let a
-- business appear on the board fed purely by badge captures:
--
--   board_manual_include  — include on the board despite having no
--                           xero_connections row (ignored once a real
--                           connection exists).
--   manual_xero_shortcode — the org's Xero shortcode (e.g. '!GTlsL') so the
--                           recon round can navigate to it.
--   manual_tenant_key     — stable key used as reconciliation_dashboard_
--                           captures.tenant_id for this client's captures
--                           (no real tenant id exists without a connection).

begin;

alter table public.monthly_report_settings
  add column if not exists board_manual_include boolean not null default false,
  add column if not exists manual_xero_shortcode text,
  add column if not exists manual_tenant_key text;

comment on column public.monthly_report_settings.board_manual_include is
  'Show this business on the CFO board even without a Xero connection — '
  'reconciliation comes solely from browser badge captures (recon round). '
  'Ignored once the business has a connection row.';
comment on column public.monthly_report_settings.manual_xero_shortcode is
  'Xero org shortcode (e.g. !GTlsL) for badge-only clients — how the recon '
  'round reaches the org in the browser.';
comment on column public.monthly_report_settings.manual_tenant_key is
  'Stable tenant key for badge-only clients'' capture rows (captures.tenant_id '
  'is text; no real Xero tenant id exists without a connection).';

commit;
