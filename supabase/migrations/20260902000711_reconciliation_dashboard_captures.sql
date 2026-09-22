-- Reconciliation dashboard captures — the badge number, recorded.
--
-- Xero confirmed (2 Sep 2026) the Bank Statement report scope is deprecated
-- and never granted: the dashboard "Reconcile N items" badge counts uncoded
-- bank-feed statement lines that NO accounting-API surface exposes. The API
-- count (reconciliation_checks, source account_transactions) is a floor, not
-- the badge. This table records the badge itself, read off each org's Xero
-- dashboard by an operator (Chrome-session routine or typed) — a distinct
-- source, kept apart from the sweep's tables on purpose.
--
-- Append-only: one row per capture, so the board shows "as of" honestly and
-- history stays. Per-account detail in jsonb: [{name, count}].
--
-- ID SPACE: business_id is businesses-space (matches reconciliation_checks).

create table public.reconciliation_dashboard_captures (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  business_id uuid not null references public.businesses(id) on delete cascade,
  captured_at timestamptz not null default now(),
  captured_by uuid,
  -- 'chrome_routine' | 'manual'
  method text not null default 'manual',
  total_count integer not null check (total_count >= 0),
  -- [{"name":"Westpac Cheque","count":12}]
  accounts jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index reconciliation_dashboard_captures_latest_idx
  on public.reconciliation_dashboard_captures (tenant_id, captured_at desc);
create index reconciliation_dashboard_captures_business_idx
  on public.reconciliation_dashboard_captures (business_id);

alter table public.reconciliation_dashboard_captures enable row level security;

create policy reconciliation_dashboard_captures_access on public.reconciliation_dashboard_captures
  as permissive for all to authenticated
  using (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()))
  with check (auth_is_super_admin() or auth_can_manage_business(business_id));

create policy reconciliation_dashboard_captures_service_role on public.reconciliation_dashboard_captures
  as permissive for all to service_role using (true) with check (true);

comment on table public.reconciliation_dashboard_captures is
  'Xero dashboard "Reconcile N items" badge counts captured by an operator — the banner-exact number the API cannot provide. Append-only; latest per tenant is the board''s badge figure.';
