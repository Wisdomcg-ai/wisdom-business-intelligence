-- Metric-invariant run history (Tier 2, item 9 of the Pulse backport plan).
--
-- Every daily plausibility check over the Xero mirror persists one row per
-- (check, subject) here — pass or fail. Persistence is the point: a checker
-- that reports only to Sentry is an alert nobody sees, and a checker with no
-- history cannot be calibrated ("has this ever fired before?" must be a
-- query, not an archaeology project). The daily-health-report email reads the
-- latest run from this table.

create table if not exists public.metric_invariant_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null,
  check_name text not null,
  -- Pulse taxonomy: band | dispersion | identity | freshness
  family text not null,
  -- watch = recorded, shown in the email, never pages. warn/critical page
  -- Sentry. New checks START at watch and are promoted only after their
  -- observed distribution proves them quiet (the Pulse calibration rule:
  -- max/min dispersion fired 14/19 months before calibration).
  severity text not null check (severity in ('watch', 'warn', 'critical')),
  -- What was checked: tenant name for per-tenant checks, 'fleet' for globals.
  subject text not null,
  observed numeric,
  threshold numeric,
  passed boolean not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_metric_invariant_runs_run_at
  on public.metric_invariant_runs (run_at desc);

alter table public.metric_invariant_runs enable row level security;

-- Service-role writes only (the cron). Super-admin read for any future admin
-- surface; the daily email is generated server-side with the service role.
create policy metric_invariant_runs_super_admin_read on public.metric_invariant_runs
  for select to authenticated
  using (
    exists (
      select 1 from public.system_roles sr
      where sr.user_id = auth.uid() and sr.role = 'super_admin'
    )
  );

comment on table public.metric_invariant_runs is
  'Daily plausibility-check results over the Xero mirror (cron/metric-invariants). One row per check+subject per run, pass or fail. watch severities never page.';
