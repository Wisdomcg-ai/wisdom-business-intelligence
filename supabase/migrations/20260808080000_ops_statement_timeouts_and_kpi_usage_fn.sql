-- Ops backport (Tier 2, item 10): statement-timeout discipline on the two
-- heaviest RPCs + a working usage-counter function for the custom-KPI library.
--
-- Statement timeouts: PostgREST's role-level default kills long statements
-- while the same SQL succeeds via superuser — the "works when I test it, dies
-- in the route" class. Worse for these two specifically:
--   - save_assumptions_and_materialize does a DELETE + bulk jsonb INSERT per
--     forecast in ONE statement (the statement is the unit of rollback, so a
--     timeout loses the whole save);
--   - create_active_forecast_locked holds pg_advisory_xact_lock keyed on
--     (business_id, fiscal_year) — a hung call blocks every future forecast
--     generate for that pair until the connection dies.
-- 120s is deliberate headroom, not a target: the p99 for both is far below it,
-- and the point is a BOUNDED failure with a clear error instead of an unbounded
-- hang holding a lock.

alter function public.save_assumptions_and_materialize(uuid, jsonb, jsonb, boolean)
  set statement_timeout = '120s';

alter function public.create_active_forecast_locked(uuid, integer, text, jsonb)
  set statement_timeout = '120s';

-- Custom-KPI usage counter. The TS service calls
--   rpc('increment_custom_kpi_usage', { kpi_id })
-- but the only function by that name is the LEGACY no-arg TRIGGER function
-- (which updates custom_kpi_templates — not even the table the service uses).
-- Every call has failed with a signature mismatch since the feature shipped,
-- silently: supabase-js resolves Postgres errors rather than throwing, and the
-- caller swallowed the result. This overload (Postgres overloads by signature;
-- the trigger fn is untouched) makes the existing call work against the table
-- the service actually reads: custom_kpis_library.
--
-- SECURITY DEFINER because callers are authenticated browser clients using
-- library KPIs they don't own; the function's only capability is bumping a
-- counter by id. Hardened search_path; EXECUTE granted to authenticated and
-- service_role only (never PUBLIC/anon — the pre-auth-surface discipline).
create or replace function public.increment_custom_kpi_usage(kpi_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.custom_kpis_library
  set usage_count = coalesce(usage_count, 0) + 1,
      last_used_at = now()
  where id = kpi_id;
$$;

revoke all on function public.increment_custom_kpi_usage(uuid) from public;
revoke all on function public.increment_custom_kpi_usage(uuid) from anon;
grant execute on function public.increment_custom_kpi_usage(uuid) to authenticated;
grant execute on function public.increment_custom_kpi_usage(uuid) to service_role;

comment on function public.increment_custom_kpi_usage(uuid) is
  'Bumps usage_count/last_used_at on custom_kpis_library. Overload of the legacy no-arg trigger fn; created 2026-08-08 because the rpc call had been signature-mismatched (and silently failing) since the feature shipped.';
