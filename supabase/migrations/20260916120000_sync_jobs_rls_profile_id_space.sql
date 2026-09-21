-- sync_jobs RLS — the SELECT policy compared the wrong id-space, so it matched
-- nothing for anybody.
--
-- `sync_jobs.business_id` is in the `business_profiles.id` space (FK added by
-- 20260611010000_fk_integrity_phase_a_uuid_business_id.sql, Group A). The
-- original policy from 20260428000002_sync_jobs_table.sql tested it against two
-- subqueries that BOTH return `businesses.id` values:
--
--     business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())
--     business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
--
-- The two id-spaces are disjoint. Verified in production on 16 Sep 2026:
--   - business_profiles ∩ businesses on id  → 0 rows (31 each side)
--   - business_users.business_id            → 34/34 in businesses-space, 0 in profiles-space
--   - sync_jobs                             → 3,912/3,912 in profiles-space, 0 in businesses-space
-- so the predicate could never be true and EVERY authenticated read of
-- sync_jobs returned zero rows — for owners, members, coaches and super-admins
-- alike. Confirmed end-to-end by impersonating a real owner (SET LOCAL ROLE
-- authenticated + request.jwt.claims): 2 xero_connections visible, 0 sync_jobs,
-- against 709 rows that are actually theirs.
--
-- Effect on the product: ForecastReadService.computeDataQuality reads
-- xero_connections (house policy, works) and then sync_jobs (this policy,
-- always empty), so on the one RLS-bound path — GET /api/Xero/pl-summary,
-- which the forecast wizard hits on load — every tenant resolved to
-- 'no_sync'. The wizard steps then rewrite 'no_sync' to 'verified' whenever
-- YTD actuals are present, so a business whose last sync ERRORED rendered a
-- clean bill of health. The service-role readers (health-checks, sync
-- coverage, the orchestrator, the crons and the monthly-report routes) bypass
-- RLS and were never affected.
--
-- Fix: the house `rls_access` pattern used by xero_connections and
-- business_profiles. `auth_get_accessible_business_ids()` returns BOTH
-- id-spaces (it unions business_profiles.id for owned/coached/member
-- businesses), so it covers sync_jobs' profile-space key. It also brings the
-- three things the old policy was missing: assigned coaches, super-admins, and
-- the `business_users.status = 'active'` filter.
--
-- Access is unchanged for anon (no policy) and service_role (its own ALL
-- policy, untouched). Append-only semantics are unchanged: there are still no
-- INSERT/UPDATE/DELETE policies for `authenticated`.

DROP POLICY IF EXISTS sync_jobs_coach_select ON public.sync_jobs;

CREATE POLICY sync_jobs_coach_select ON public.sync_jobs
  FOR SELECT TO authenticated
  USING (
    auth_is_super_admin()
    OR business_id = ANY (auth_get_accessible_business_ids())
  );

COMMENT ON TABLE public.sync_jobs IS
  'Phase 44 — per-sync-run audit log. Append-only by service role. RLS: read access via the house auth_get_accessible_business_ids() pattern, which covers the business_profiles.id space this table is keyed by.';
