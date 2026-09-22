-- Budget store — the yardstick, kept apart from the prediction.
--
-- A budget is approved once, covers all 12 months (closed ones included) and
-- changes only by an explicit revision. A forecast is re-cut constantly. The
-- monthly report's budget column has been reading forecast_pl_lines, so a
-- closed month's variance could move after the fact — and a forecast seeded
-- mid-year legitimately has no rows for the month being reported, which is
-- every month a report is ever about. These tables give the budget its own
-- object. NOTHING reads them yet: the resolver seam ships separately and
-- skips them entirely until a client is pinned.
--
-- Revisions apply PROSPECTIVELY. effective_from is the month a version becomes
-- the baseline; closed months keep the budget they were reported against. That
-- is what makes a variance auditable and stops a mid-year revision restating a
-- prior period. NULL = imported but not yet activated.
--
-- ID SPACE: business_id on BOTH tables is businesses-space (businesses.id),
-- matching monthly_report_settings and xero_connections — the tables the
-- report already joins on. It is deliberately NOT business_profiles-space,
-- where financial_forecasts lives. The FK to businesses(id), not the RLS
-- policy, is what enforces this: auth_get_accessible_business_ids() unions
-- BOTH id-spaces and would happily admit a profiles-space value.
-- tenant_id joins to xero_connections.tenant_id, never on business_id.
--
-- WRITES: service-role only (the import route). The authenticated policies are
-- SELECT-only on purpose — "a locked version never changes" has to be enforced
-- by the grant, not by convention, because pg_default_acl still hands anon and
-- authenticated full DML on every new public table. Precedent:
-- 20260808081000_metric_invariant_runs.sql.

begin;

create table if not exists public.budget_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- NULL = a business-level budget (mirrors financial_forecasts, where 38 of
  -- 39 rows have tenant_id NULL, and the consolidation_budget_mode both
  -- multi-org clients are in). Non-null = one Xero org's budget.
  tenant_id text,
  fiscal_year integer not null,
  source text not null default 'xero' check (source in ('xero', 'manual')),
  xero_budget_id text,
  xero_budget_type text,                    -- 'OVERALL' | 'TRACKING'
  xero_updated_at timestamptz,
  -- The org's functional currency at import (xero_connections.functional_currency).
  -- Recorded now so a cross-org sum can never add HKD to AUD unnoticed: the
  -- consolidation engine FX-translates actuals but sums budgets raw (#401 was
  -- exactly this class, at 5.26x).
  currency text,
  label text not null,
  -- Monotonic per (business_id, tenant_id, fiscal_year). v1, v2, …
  version_number integer not null,
  -- 'YYYY-MM' — the month this version becomes the baseline. NULL = imported
  -- but not activated, so importing is never itself a switch-over.
  effective_from text,
  -- NULL until the lines have landed. supabase-js cannot span two inserts in
  -- one transaction, so completeness is structural instead: the resolver
  -- considers only locked rows, and a half-written import is invisible rather
  -- than a zero-line budget that blanks a client's whole budget column.
  locked_at timestamptz,
  imported_by uuid,
  -- Coverage recorded at import so "12 of 12 months" is answerable without
  -- re-reading the lines, and a partial import is visible rather than silent.
  months_covered integer not null default 0,
  first_period text,
  last_period text,
  notes text,
  created_at timestamptz not null default now()
);

-- coalesce(tenant_id,'') so a business-level version (tenant_id NULL) still
-- gets a unique sequence — NULLs are distinct in a plain unique index.
create unique index if not exists budget_versions_seq_idx
  on public.budget_versions (business_id, coalesce(tenant_id, ''), fiscal_year, version_number);
-- The resolver's question: which version was in force for this report month?
create index if not exists budget_versions_effective_idx
  on public.budget_versions (business_id, fiscal_year, effective_from desc);

create table if not exists public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_version_id uuid not null references public.budget_versions(id) on delete cascade,
  -- Denormalised from the parent so the flat house RLS policy applies verbatim
  -- and a line's org stays answerable after the fact. Same shape as
  -- 20260831133849_payroll_facts_tables.sql does for payslip lines.
  business_id uuid not null references public.businesses(id) on delete cascade,
  tenant_id text,
  account_code text,
  account_name text not null,
  -- Report display vocabulary: 'Revenue' | 'Cost of Sales' |
  -- 'Operating Expenses' | 'Other Income' | 'Other Expenses'. Resolved once at
  -- import; the report must not re-derive it and cannot then derive it
  -- differently. Nullable because forecast_pl_lines.category is, and the
  -- consumer defaults NULL to Operating Expenses — a NOT NULL would force the
  -- importer to either drop unclassifiable lines (budget dollars vanish) or
  -- guess, and a wrong guess flips the variance sign. Neither shows in a total.
  category text,
  -- The 5-bucket PLBucket: 'revenue'|'cogs'|'opex'|'other_income'|'other_expense'.
  account_type text,
  month text not null,                      -- 'YYYY-MM'
  -- Positive for expenses, matching the actuals convention the variance
  -- arithmetic assumes. Normalised at import; Xero's Budget Amount carries no
  -- sign guarantee.
  amount numeric not null,
  created_at timestamptz not null default now()
);

-- Keyed on the account CODE with the name as fallback: Xero's Budgets API
-- returns AccountID/AccountCode and no name at all, and two accounts can share
-- a display name — keying on the name alone would collide and abort the whole
-- version insert.
create unique index if not exists budget_lines_key_idx
  on public.budget_lines (budget_version_id, coalesce(account_code, account_name), month);
create index if not exists budget_lines_month_idx
  on public.budget_lines (budget_version_id, month);
create index if not exists budget_lines_business_idx
  on public.budget_lines (business_id, month);

alter table public.budget_versions enable row level security;
alter table public.budget_lines enable row level security;

drop policy if exists budget_versions_read on public.budget_versions;
create policy budget_versions_read on public.budget_versions
  as permissive for select to authenticated
  using (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()));

drop policy if exists budget_versions_service_role on public.budget_versions;
create policy budget_versions_service_role on public.budget_versions
  as permissive for all to service_role using (true) with check (true);

drop policy if exists budget_lines_read on public.budget_lines;
create policy budget_lines_read on public.budget_lines
  as permissive for select to authenticated
  using (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()));

drop policy if exists budget_lines_service_role on public.budget_lines;
create policy budget_lines_service_role on public.budget_lines
  as permissive for all to service_role using (true) with check (true);

comment on table public.budget_versions is
  'An approved budget, frozen at import. business_id is businesses-space; tenant_id NULL means a business-level budget. A revision is a NEW row (version_number+1), never an edit — effective_from applies it prospectively and locked_at is set only once the lines have landed.';
comment on table public.budget_lines is
  'One budgeted amount per account per month. business_id/tenant_id denormalised from the parent version. category is the report display vocabulary, resolved once at import so the report never re-derives it.';

commit;
