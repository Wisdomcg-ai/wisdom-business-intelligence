-- WF.1 — persisted pre-flight results: what was true when the pack was sent.
--
-- Every export runs the pre-flight checks over exactly the data going into
-- the PDF (the shared eager loader), and the results are persisted here per
-- run. A pack can then prove, months later, what was checked and what the
-- answers were — instead of the checks living and dying in one browser tab.
--
-- ID SPACE: businesses-space (report-domain, like monthly_report_settings).

create table public.report_invariant_results (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  -- 'YYYY-MM'
  report_month text not null,
  run_at timestamptz not null default now(),
  run_by uuid,
  -- What the run was for: 'export' | 'approve_send' | 'manual'
  context text not null default 'export',
  -- [{key, label, status: 'pass'|'warn'|'fail'|'skip', detail}]
  results jsonb not null,
  -- Worst status across results: pass | warn | fail
  overall text not null,
  created_at timestamptz not null default now()
);

create index report_invariant_results_month_idx
  on public.report_invariant_results (business_id, report_month, run_at desc);

alter table public.report_invariant_results enable row level security;

create policy report_invariant_results_access on public.report_invariant_results
  as permissive for all to authenticated
  using (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()))
  with check (auth_is_super_admin() or business_id = any (auth_get_accessible_business_ids()));

create policy report_invariant_results_service_role on public.report_invariant_results
  as permissive for all to service_role using (true) with check (true);

comment on table public.report_invariant_results is
  'WF.1 — persisted pre-flight check results per export run: proof of what was true when the pack went out.';
