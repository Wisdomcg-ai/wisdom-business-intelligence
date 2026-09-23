-- WB.1 — payroll facts: pay runs, payslip lines, employees.
--
-- WHY
--
-- The Wages tab fetches Xero payroll LIVE on every page view: an unpaged
-- PayRuns list, one detail call per pay run, one Employees/{id} call per
-- matched employee — N+1 against a 60-req/min tenant cap, no history, and
-- nothing for the tie-out gate to assert against. Every other Xero fact in
-- the platform (P&L, BS, subscriptions) is synced into tables on the 6-hourly
-- cycle and read from the database; payroll was the one hold-out.
--
-- These tables put payroll on the same footing, modelled on the
-- subscription_vendor_actuals pattern. They are also the data spine of the
-- Calxa "Payrun Analysis" page (the heaviest hand-built page in every client's
-- monthly pack) and the future PAY-TIES invariant
-- (sum payslip gross = P&L wages).
--
-- ID SPACE: business_id is business_profiles-space, matching what the sync
-- orchestrator writes into xero_pl_lines/xero_bs_lines (profileId). Readers
-- must query via resolveBusinessProfileIds(...).all, as they already do for
-- every other xero_* table.
--
-- Amounts are the Xero Payslip summary figures. `wages` is GROSS — the figure
-- that ties to the P&L wages accounts (net does not; the Scan2Archive sheet
-- proved that by checking).

-- ── pay run headers ─────────────────────────────────────────────────────────

create table public.xero_pay_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  tenant_id text not null,
  pay_run_id uuid not null,
  payroll_calendar_id uuid,
  -- WEEKLY / FORTNIGHTLY / FOURWEEKLY / MONTHLY / TWICEMONTHLY / QUARTERLY —
  -- resolved from PayrollCalendars at sync so no reader re-fetches calendars.
  calendar_type text,
  period_start date,
  period_end date,
  payment_date date not null,
  status text not null,
  wages numeric not null default 0,
  tax numeric not null default 0,
  super_amount numeric not null default 0,
  net_pay numeric not null default 0,
  -- Set when the run's payslips have been fetched and stored. A header can
  -- exist without detail (budget ran out mid-backfill); the sync treats
  -- detail_synced_at IS NULL as "still to fetch", so backfill converges
  -- across cycles without re-fetching finished runs.
  detail_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint xero_pay_runs_natural_key unique (business_id, tenant_id, pay_run_id)
);

create index xero_pay_runs_payment_date_idx
  on public.xero_pay_runs (business_id, payment_date);

alter table public.xero_pay_runs enable row level security;

create policy xero_pay_runs_access on public.xero_pay_runs
  as permissive for all to authenticated
  using (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()))
  with check (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()));

create policy xero_pay_runs_service_role on public.xero_pay_runs
  as permissive for all to service_role using (true) with check (true);

-- ── per-employee payslip lines ──────────────────────────────────────────────

create table public.xero_payslip_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  tenant_id text not null,
  pay_run_id uuid not null,
  payslip_id uuid not null,
  employee_id uuid not null,
  employee_name text not null,
  -- Denormalised from the run so month queries need no join.
  payment_date date not null,
  period_start date,
  period_end date,
  calendar_type text,
  wages numeric not null default 0,
  tax numeric not null default 0,
  super_amount numeric not null default 0,
  reimbursements numeric not null default 0,
  net_pay numeric not null default 0,
  -- WB.3 grouping, resolved AT SYNC so renderers never guess. Flat (null) for
  -- every current client — no WisdomBI business splits wages across sites
  -- today; this exists for multi-site clients like Distinct Directions.
  group_key text,
  group_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint xero_payslip_lines_natural_key unique (business_id, tenant_id, payslip_id)
);

create index xero_payslip_lines_payment_date_idx
  on public.xero_payslip_lines (business_id, payment_date);
create index xero_payslip_lines_pay_run_idx
  on public.xero_payslip_lines (business_id, tenant_id, pay_run_id);

alter table public.xero_payslip_lines enable row level security;

create policy xero_payslip_lines_access on public.xero_payslip_lines
  as permissive for all to authenticated
  using (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()))
  with check (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()));

create policy xero_payslip_lines_service_role on public.xero_payslip_lines
  as permissive for all to service_role using (true) with check (true);

-- ── employees ───────────────────────────────────────────────────────────────

create table public.xero_employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  tenant_id text not null,
  employee_id uuid not null,
  first_name text,
  last_name text,
  start_date date,
  termination_date date,
  payroll_calendar_id uuid,
  -- Xero's native Employee.EmployeeGroupName — grouping source #1 for the
  -- Payrun Analysis page (DD's Headoffice/Bathurst/Orange/Dubbo shape).
  employee_group_name text,
  job_title text,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint xero_employees_natural_key unique (business_id, tenant_id, employee_id)
);

alter table public.xero_employees enable row level security;

create policy xero_employees_access on public.xero_employees
  as permissive for all to authenticated
  using (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()))
  with check (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()));

create policy xero_employees_service_role on public.xero_employees
  as permissive for all to service_role using (true) with check (true);

comment on table public.xero_pay_runs is
  'WB.1 — Xero AU pay run headers, synced 6-hourly. business_id is business_profiles-space (matches xero_pl_lines); read via resolveBusinessProfileIds().all. detail_synced_at NULL = payslips not yet fetched (backfill converges across cycles).';
comment on table public.xero_payslip_lines is
  'WB.1 — per-employee payslip summary figures. wages = GROSS (ties to P&L wages accounts; net does not). group_key resolved at sync, null = flat/ungrouped.';
comment on table public.xero_employees is
  'WB.1 — Xero AU payroll employees (start/termination dates, EmployeeGroupName for Payrun grouping).';
