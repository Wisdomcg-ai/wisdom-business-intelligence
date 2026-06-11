-- FK integrity, Phase A: add foreign keys to all uuid-typed `business_id` columns
-- that currently have none. Closes the dual-ID orphan bug class (see the SWOT and
-- financial_forecasts incidents, 2026-06-11) for these tables.
--
-- Scope: ONLY columns already typed `uuid`. The 6 text-typed business_id columns
-- (activity_log, business_financial_goals, business_kpis, kpi_history, plan_snapshots,
-- sprint_key_actions) are deferred to Phase B because converting them to uuid would
-- break their text-based RLS policies (e.g. `(b.id)::text = business_id`,
-- `business_id = ANY(auth_get_accessible_business_ids_text())`). Those need policy
-- rewrites alongside the type change.
--
-- ON DELETE CASCADE: when a parent profile/business is deleted, its child rows are
-- removed instead of being orphaned (matches the R27 FK-driven archive behaviour).
-- Verified pre-apply: 0 orphan rows in any of these tables.
-- Idempotent (guards on pg_constraint) so the fork can inherit it safely.

do $$
declare r record;
begin
  -- Group A: business_id references business_profiles(id)
  for r in select unnest(array[
      'strategic_initiatives','sync_jobs','kpi_actuals','operational_activities',
      'weekly_metrics_snapshots','weekly_reviews','forecast_investments','forecast_years',
      'quarterly_snapshots','dashboard_preferences','forecast_wizard_sessions','vision_targets',
      'financial_forecasts'
    ]) as t
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = r.t || '_business_id_fkey' and conrelid = ('public.'||r.t)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (business_id) references public.business_profiles(id) on delete cascade',
        r.t, r.t || '_business_id_fkey');
    end if;
  end loop;

  -- Group B: business_id references businesses(id)
  for r in select unnest(array[
      'issues_list','open_loops','strategy_data','cashflow_assumptions'
    ]) as t
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = r.t || '_business_id_fkey' and conrelid = ('public.'||r.t)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (business_id) references public.businesses(id) on delete cascade',
        r.t, r.t || '_business_id_fkey');
    end if;
  end loop;
end $$;
