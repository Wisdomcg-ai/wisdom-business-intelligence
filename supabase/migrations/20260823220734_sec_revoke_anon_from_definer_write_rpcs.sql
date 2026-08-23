-- SECURITY — remove unauthenticated (anon) access to SECURITY DEFINER RPCs
-- exposed in the PostgREST public schema (full DB security audit, 24 Aug 2026).
--
-- CONTEXT. A SECURITY DEFINER function runs as its owner (postgres) and BYPASSES
-- RLS. PostgREST exposes every public function at POST /rest/v1/rpc/<name>,
-- callable with the PUBLIC anon key that ships in the browser bundle. So a
-- definer write RPC granted to `anon` with no internal authorization check is an
-- unauthenticated write primitive against client data, regardless of any
-- app-route auth. The audit's two HIGH findings are exactly this shape:
--   save_assumptions_and_materialize — overwrites financial_forecasts.assumptions
--     and (p_force_full_replace) DELETEs+rewrites forecast_pl_lines.
--   create_active_forecast_locked   — deactivates a business's live forecast and
--     injects an attacker-shaped is_active row.
-- (HIGH not CRITICAL only because the write needs a valid forecast/business id
-- that anon cannot currently enumerate — a gate, not a guarantee.)
--
-- WHY anon-only for some, anon+authenticated for others:
--   * save_assumptions_and_materialize and create_active_forecast_locked are
--     called by the app THROUGH createRouteHandlerClient() — i.e. AS the
--     `authenticated` role (generate / seed-from-prior / recompute routes). So
--     `authenticated` is LOAD-BEARING and must stay; only `anon` is removed.
--     (Closing the any-authenticated-user-by-known-id vector needs an INTERNAL
--     auth_can_manage_business guard — deliberately deferred to the Group B
--     follow-up, which must be written so service_role calls are not blocked.)
--   * begin/finalize_xero_sync_job are called only via the SERVICE-ROLE client
--     (sync-orchestrator.ts); the nine remaining functions have ZERO callers
--     anywhere in src/ (verified, all file types). For those, `authenticated`
--     is also removed. All eleven were confirmed to be referenced by NO other
--     function body and NO RLS policy (so no invoker-context call breaks).
--
-- Grants are REVOKED from PUBLIC + anon + authenticated and then re-GRANTed to
-- exactly the intended roles, because some functions were granted via the
-- PUBLIC pseudo-role (revoking anon alone would not remove a PUBLIC grant, and
-- revoking PUBLIC alone would not remove an explicit anon grant). service_role
-- and the owner (postgres) retain EXECUTE throughout.
--
-- Reversible: re-GRANT EXECUTE to the role if a caller is ever added.

-- ── Group A.1 — HIGH: keep `authenticated` (live route-handler callers), drop anon ──
revoke all on function public.save_assumptions_and_materialize(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.save_assumptions_and_materialize(uuid, jsonb, jsonb, boolean) to authenticated, service_role;

revoke all on function public.create_active_forecast_locked(uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_active_forecast_locked(uuid, integer, text, jsonb) to authenticated, service_role;

-- ── Group A.2 — authenticated app callers, drop anon only ──
revoke all on function public.upsert_category_pattern(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.upsert_category_pattern(uuid, text, text, text) to authenticated, service_role;

revoke all on function public.create_quarterly_swot(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.create_quarterly_swot(uuid, text, integer) to authenticated, service_role;

revoke all on function public.upsert_user_preference(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_user_preference(uuid, text, jsonb) to authenticated, service_role;

-- ── Group A.3 — service-role callers only, drop anon + authenticated ──
revoke all on function public.begin_xero_sync_job(uuid) from public, anon, authenticated;
grant execute on function public.begin_xero_sync_job(uuid) to service_role;

revoke all on function public.finalize_xero_sync_job(uuid, text, integer, integer, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.finalize_xero_sync_job(uuid, text, integer, integer, integer, jsonb, jsonb, text) to service_role;

-- ── Group A.4 — dead (zero callers), drop anon + authenticated ──
revoke all on function public.lock_forecast_version(uuid) from public, anon, authenticated;
grant execute on function public.lock_forecast_version(uuid) to service_role;

revoke all on function public.create_version_snapshot(uuid, text) from public, anon, authenticated;
grant execute on function public.create_version_snapshot(uuid, text) to service_role;

revoke all on function public.assign_coach_to_process(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_coach_to_process(uuid, uuid) to service_role;

revoke all on function public.cleanup_old_audit_logs() from public, anon, authenticated;
grant execute on function public.cleanup_old_audit_logs() to service_role;

revoke all on function public.cleanup_expired_password_tokens() from public, anon, authenticated;
grant execute on function public.cleanup_expired_password_tokens() to service_role;

revoke all on function public.get_or_create_business_profile(uuid) from public, anon, authenticated;
grant execute on function public.get_or_create_business_profile(uuid) to service_role;

revoke all on function public.get_todo_stats(uuid) from public, anon, authenticated;
grant execute on function public.get_todo_stats(uuid) to service_role;

revoke all on function public.get_user_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_user_role(uuid, uuid) to service_role;

revoke all on function public.get_coach_for_process(uuid) from public, anon, authenticated;
grant execute on function public.get_coach_for_process(uuid) to service_role;
