-- CFO Production Board — Phase 1 data foundation.
--
-- 1) reconciliation_checks: one row per Xero tenant recording the latest
--    reconciliation sweep outcome. Fail-closed by design: the board must
--    distinguish "checked, zero outstanding" from "could not check" — an
--    errored/missing check must never render as "0 unreconciled".
-- 2) reconciliation_snapshots: unreconciled items bucketed by transaction
--    month, per tenant + bank account. Primary source is the ACCOUNTING API
--    Reports/BankStatement statement lines (the same items Xero's "reconcile"
--    banner counts; requires the addendum-gated bankstatement scope — 401s
--    until granted); fallback is the account-transaction count, labelled via
--    `source`. (Comment corrected 1 Sep: an earlier version said "Finance
--    API", a different, closed product.)
-- 3) monthly_report_settings: per-client report due day + bookkeeper contact
--    for the production board and reconcile-nudge emails.
--
-- ID-space: business_id on BOTH new tables is businesses-space
-- (businesses.id), matching cfo_report_status / monthly_report_settings.
-- Joins to sync/xero tables go via tenant_id, never business_id (CLAUDE.md).
--
-- Lessons from the financial_metrics write that failed silently since
-- inception: every NOT NULL key column here has a default or is always
-- supplied, and the unique constraints below are the ONLY valid onConflict
-- targets — keep writers in sync with them.

begin;

create table if not exists public.reconciliation_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null unique,
  business_id uuid not null references public.businesses(id) on delete cascade,
  source text not null default 'statement_lines'
    check (source in ('statement_lines', 'account_transactions')),
  status text not null default 'ok' check (status in ('ok', 'error')),
  error_message text,
  total_unreconciled_count integer not null default 0,
  total_unreconciled_value numeric(14, 2) not null default 0,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_reconciliation_checks_business
  on public.reconciliation_checks (business_id);

create table if not exists public.reconciliation_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  business_id uuid not null references public.businesses(id) on delete cascade,
  bank_account_id text not null,
  bank_account_name text,
  month date not null,
  unreconciled_count integer not null default 0,
  unreconciled_value numeric(14, 2) not null default 0,
  source text not null check (source in ('statement_lines', 'account_transactions')),
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, bank_account_id, month, source)
);

create index if not exists idx_reconciliation_snapshots_business_month
  on public.reconciliation_snapshots (business_id, month);

-- RLS: coach/owner read scoped by accessible businesses; writes come from the
-- service-role sweep (bypasses RLS); authenticated writes held to manage rights.
alter table public.reconciliation_checks enable row level security;

drop policy if exists reconciliation_checks_access on public.reconciliation_checks;
create policy reconciliation_checks_access on public.reconciliation_checks
  as permissive for all to authenticated
  using (
    auth_is_super_admin()
    or business_id = any (auth_get_accessible_business_ids())
  )
  with check (
    auth_is_super_admin()
    or auth_can_manage_business(business_id)
  );

drop policy if exists reconciliation_checks_service_role on public.reconciliation_checks;
create policy reconciliation_checks_service_role on public.reconciliation_checks
  as permissive for all to service_role using (true) with check (true);

alter table public.reconciliation_snapshots enable row level security;

drop policy if exists reconciliation_snapshots_access on public.reconciliation_snapshots;
create policy reconciliation_snapshots_access on public.reconciliation_snapshots
  as permissive for all to authenticated
  using (
    auth_is_super_admin()
    or business_id = any (auth_get_accessible_business_ids())
  )
  with check (
    auth_is_super_admin()
    or auth_can_manage_business(business_id)
  );

drop policy if exists reconciliation_snapshots_service_role on public.reconciliation_snapshots;
create policy reconciliation_snapshots_service_role on public.reconciliation_snapshots
  as permissive for all to service_role using (true) with check (true);

-- Production-board settings: due day + bookkeeper contact.
alter table public.monthly_report_settings
  add column if not exists report_due_day integer
    check (report_due_day between 1 and 28),
  add column if not exists bookkeeper_name text,
  add column if not exists bookkeeper_email text;

comment on table public.reconciliation_checks is
  'Latest reconciliation sweep outcome per Xero tenant (CFO production board). '
  'business_id is businesses-space. status=error means the tenant could not be '
  'checked — readers must render that as unknown, never as zero outstanding.';

comment on table public.reconciliation_snapshots is
  'Unreconciled items bucketed by transaction month per Xero tenant + bank '
  'account (CFO production board). business_id is businesses-space. '
  'source=statement_lines matches Xero''s reconcile banner (Finance API); '
  'source=account_transactions is the Accounting API fallback for orgs whose '
  'finance scopes are not yet consented. Rows are replaced per tenant on each '
  'successful sweep, so a fully reconciled tenant has zero rows here — read '
  'reconciliation_checks for checked_at/staleness.';

comment on column public.monthly_report_settings.report_due_day is
  'Day of month (1-28) the monthly report is due, in the month after the '
  'report month. Null = no due date configured.';
comment on column public.monthly_report_settings.bookkeeper_email is
  'Recipient of reconcile-nudge emails for this client (owner is cc''d).';

commit;
