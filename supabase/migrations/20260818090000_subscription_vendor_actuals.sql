-- Phase 2 of the subscription-intelligence plan (18 Aug 2026 CFO review).
--
-- The wizard's subscription crawl computes per-vendor per-month actuals on
-- every run and throws them away; the monthly report re-crawls Xero live each
-- time it renders. Persisting the aggregation is what makes month-on-month
-- price-creep and lapse HISTORY queryable, and it is the data foundation for
-- the monthly budget-vs-actual leakage report (phase 3).
--
-- business_id is BUSINESSES-space (same space as subscription_budgets, whose
-- rows these join against by vendor_key) — dual-ID rule per CLAUDE.md.
-- tenant_id keeps multi-org businesses (Dragon, IICT) separable: never sum
-- across currencies; per-tenant rows preserve the option to filter.

create table if not exists public.subscription_vendor_actuals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  tenant_id text not null,
  vendor_key text not null,
  vendor_name text not null,
  -- 'YYYY-MM'
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount numeric(14, 2) not null default 0,
  -- 'analyze' (wizard crawl, bulk history) | 'report' (monthly-report month)
  source text not null default 'analyze' check (source in ('analyze', 'report')),
  updated_at timestamptz not null default now(),
  unique (business_id, tenant_id, vendor_key, month)
);

create index if not exists idx_sub_vendor_actuals_biz_month
  on public.subscription_vendor_actuals (business_id, month);

alter table public.subscription_vendor_actuals enable row level security;

-- Same access shape as subscription_budgets.rls_access: readable/writable by
-- users with access to the business; service-role writers bypass RLS.
create policy "rls_access" on public.subscription_vendor_actuals
  to authenticated
  using (
    public.auth_is_super_admin()
    or business_id = any (public.auth_get_accessible_business_ids())
  )
  with check (
    public.auth_is_super_admin()
    or public.auth_can_manage_business(business_id)
  );
