-- CFO Production Board — per-bank-account status (the "with current scopes"
-- answer to feed backlog).
--
-- The banner count of uncoded statement lines is unreachable without the
-- Bank Statement addendum (in flight with Xero). What current scopes CAN
-- see: when anything was last CODED against each bank account, and enough
-- identity (org short code + account id) to deep-link straight to that
-- account's reconcile screen in Xero. A stale last_coded_date is the
-- backlog smell (IICT's Airwallex feed would have glowed); the deep link
-- puts the real banner one click from the board.
--
-- ID-space: business_id is businesses-space. Rows replaced per tenant on
-- each sweep, mirroring reconciliation_snapshots.

begin;

create table if not exists public.bank_account_status (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  business_id uuid not null references public.businesses(id) on delete cascade,
  bank_account_id text not null,
  bank_account_name text,
  currency text,
  short_code text,
  last_coded_date date,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, bank_account_id)
);

create index if not exists idx_bank_account_status_business
  on public.bank_account_status (business_id);

alter table public.bank_account_status enable row level security;

drop policy if exists bank_account_status_access on public.bank_account_status;
create policy bank_account_status_access on public.bank_account_status
  as permissive for all to authenticated
  using (
    auth_is_super_admin()
    or business_id = any (auth_get_accessible_business_ids())
  )
  with check (
    auth_is_super_admin()
    or auth_can_manage_business(business_id)
  );

drop policy if exists bank_account_status_service_role on public.bank_account_status;
create policy bank_account_status_service_role on public.bank_account_status
  as permissive for all to service_role using (true) with check (true);

comment on table public.bank_account_status is
  'Per bank account: when anything was last coded in Xero (backlog smell — '
  'NOT the banner count, which needs the Bank Statement addendum) plus the '
  'org short_code for reconcile-screen deep links. business_id is '
  'businesses-space. Replaced per tenant each sweep. null last_coded_date '
  'means none found in the lookback window — render as unknown, not fresh.';

commit;
