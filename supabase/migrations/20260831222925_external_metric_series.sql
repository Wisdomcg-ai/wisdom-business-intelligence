-- WE.1 — external metrics: the one model behind every hand-built insert.
--
-- Hubstaff hours, HubSpot memberships, Lumary clinic income, PMI invoice
-- inputs — every non-Xero page in the Calxa packs is the same shape: a value,
-- bucketed by a dimension the client cares about, per month, as actual or
-- budget, that must reconcile to a named Xero account. Modelled once, so each
-- client page is a SERIES DEFINITION (rows, not code) and the numbers arrive
-- through one write path — typed entry UI, CSV paste, or a client skill
-- POSTing what it already pulls each month. Connectors, if ever wanted, write
-- the same rows.
--
-- Monthly volume is tiny (worst client: 42 values), so entry beats
-- integration; the DESIGN choice this table encodes is typed-vs-freeform —
-- typed is what makes the EXT-TIES check possible at all.
--
-- ID SPACE: businesses-space, matching the report-domain config tables
-- (monthly_report_settings, account_mappings).

create table public.external_metric_series (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  -- 'manual' | 'skill' | future connector names. Provenance, not behaviour.
  source text not null default 'manual',
  series_key text not null,
  display_name text not null,
  -- 'Clinic' | 'Member type' | 'Contractor' — the row label of the insert.
  dimension_label text not null,
  -- [{key:'hours',label:'Hours',format:'number'},{key:'amount',label:'Amount',format:'currency'}]
  measures jsonb not null default '[]'::jsonb,
  -- The Xero account (by name, matching wages_account_names convention) this
  -- series' primary measure must tie to. NULL = nothing to reconcile
  -- (e.g. HubSpot member counts).
  reconciles_to_account_name text,
  -- Which measure key carries the reconcilable dollars. NULL = none.
  reconcile_measure_key text,
  reconcile_tolerance numeric not null default 1,
  -- Client-specific business rules, for the record and for skills to read:
  -- e.g. {"basis":"date_of_delivery","roll_virtual_into":"Orange"}.
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_metric_series_natural_key unique (business_id, series_key)
);

alter table public.external_metric_series enable row level security;

create policy external_metric_series_access on public.external_metric_series
  as permissive for all to authenticated
  using (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()))
  with check (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()));

create policy external_metric_series_service_role on public.external_metric_series
  as permissive for all to service_role using (true) with check (true);

create table public.external_metric_values (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.external_metric_series(id) on delete cascade,
  -- Denormalised so RLS needs no join and month reads are one index hit.
  business_id uuid not null,
  -- 'YYYY-MM'
  period_month text not null,
  dimension_value text not null,
  measure_key text not null,
  -- 'actual' | 'budget'
  scenario text not null default 'actual',
  value numeric not null,
  -- Where this number came from: 'manual' | 'skill:<name>' | 'csv'.
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_metric_values_scenario_check check (scenario in ('actual', 'budget')),
  constraint external_metric_values_natural_key
    unique (series_id, period_month, dimension_value, measure_key, scenario)
);

create index external_metric_values_month_idx
  on public.external_metric_values (business_id, period_month);

alter table public.external_metric_values enable row level security;

create policy external_metric_values_access on public.external_metric_values
  as permissive for all to authenticated
  using (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()))
  with check (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()));

create policy external_metric_values_service_role on public.external_metric_values
  as permissive for all to service_role using (true) with check (true);

comment on table public.external_metric_series is
  'WE.1 — definition of one external-data insert (Hubstaff/HubSpot/Lumary/... shape): dimension, measures, the Xero account its dollars must tie to, and the client business rules. Rows not code; businesses-space business_id.';
comment on table public.external_metric_values is
  'WE.1 — the numbers: (series, YYYY-MM month, dimension value, measure, actual|budget) → value. One write path for entry UI, CSV and skills; natural key makes every writer idempotent.';
