-- Each Xero tenant's last successful sync, computed where the rows live.
--
-- WHY. getLastSyncByTenant (src/lib/health-checks.ts) fetched every
-- successful sync_jobs row in its window and kept the newest per tenant in
-- TypeScript. PostgREST returns at most 1,000 rows per request, and the
-- 60-day window the CFO board and the connection-health pills ask for held
-- 3,214 rows on 15 Sep 2026. With no ORDER BY a capped read takes rows in
-- storage order: the same query shape run on prod that day, capped at 1,000,
-- got the OLDEST rows — 12 of the 15 tenants ~3 weeks stale, 3 missing — and
-- the lookup reported ok. Only xero_connections.last_synced_at was keeping
-- those clocks current.
--
-- WHAT. The answer itself — { tenant_id: latest finished_at } — as ONE jsonb
-- value. A single value is not a row set, so no row cap can shorten it, and
-- the reply is one entry per tenant however many jobs the window holds.
--
-- Same rows the TypeScript fallback reads while this is not yet applied:
-- status success or partial, finished_at >= p_since, and never the outer
-- per-business row (tenant_id = ''). STRICT: a NULL window returns NULL,
-- which the caller treats as a failed lookup rather than "nobody synced".
--
-- SECURITY INVOKER: every caller is service_role, which already reads
-- sync_jobs, so nothing here needs to bypass RLS. EXECUTE is service_role
-- only (revoked from PUBLIC, anon and authenticated explicitly, whatever the
-- default privileges say).
--
-- The code falls back to a paged read on PGRST202/42883, so it is safe to
-- deploy before this is applied. Apply by hand after merge, then
-- `notify pgrst, 'reload schema'`.

create or replace function public.last_xero_sync_by_tenant(p_since timestamptz)
returns jsonb
language sql
stable
strict
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(latest.tenant_id, latest.finished_at), '{}'::jsonb)
  from (
    select sj.tenant_id, max(sj.finished_at) as finished_at
    from public.sync_jobs sj
    where sj.status in ('success', 'partial')
      and sj.finished_at >= p_since
      and sj.tenant_id <> ''
    group by sj.tenant_id
  ) latest;
$$;

revoke all on function public.last_xero_sync_by_tenant(timestamptz) from public;
revoke all on function public.last_xero_sync_by_tenant(timestamptz) from anon;
revoke all on function public.last_xero_sync_by_tenant(timestamptz) from authenticated;
grant execute on function public.last_xero_sync_by_tenant(timestamptz) to service_role;

comment on function public.last_xero_sync_by_tenant(timestamptz) is
  'Latest successful (success/partial) sync_jobs.finished_at per Xero tenant since p_since, as one jsonb object {tenant_id: finished_at}. Replaces a row read that PostgREST''s 1,000-row cap truncated to the oldest rows (15 Sep 2026). service_role only.';
