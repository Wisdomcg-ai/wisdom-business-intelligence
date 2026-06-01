-- ============================================================
-- R3 — Pre-flight orphan audit for a FOREIGN KEY on
--      xero_connections.business_id
--
-- STATUS: READ-ONLY. SELECT-only. No writes, no DDL. Safe to run on prod.
-- REQUIRES: Matt's explicit approval naming the prod target
--           (Supabase project uudfstpvndurzwnapibf) before execution.
--
-- WHY THIS EXISTS
-- ---------------
-- xero_connections.business_id is `uuid NOT NULL` with NO foreign key today
-- (baseline_schema.sql:5547). The dual-ID system means a business_id value may
-- be EITHER a businesses.id OR a business_profiles.id (per R1: money/Xero tables'
-- canonical id is business_profiles.id, NOT businesses.id). Therefore we CANNOT
-- naively add `REFERENCES businesses(id)` — it would reject every row keyed on a
-- business_profiles.id, plus any genuine orphan. This audit tells us:
--   (a) how many rows point at a real businesses.id,
--   (b) how many point at a real business_profiles.id (FK-target question),
--   (c) how many point at NEITHER (true orphans that block ANY FK), and
--   (d) the exact orphan rows so we can decide remediate-vs-delete before DDL.
--
-- Run all six queries; capture the outputs. Decision tree after results:
--   * 0 orphans, all match businesses.id           → FK → businesses(id) is safe.
--   * 0 orphans, some match only business_profiles  → FK must target the canonical
--                                                     table, or normalize first.
--   * >0 true orphans                               → remediate/delete those rows
--                                                     FIRST; a FK cannot be added
--                                                     while they exist.
-- ============================================================

-- 1. Total connections (denominator).
SELECT count(*) AS total_xero_connections
FROM public.xero_connections;

-- 2. business_id values that resolve to a real businesses.id.
SELECT count(*) AS matches_businesses_id
FROM public.xero_connections xc
WHERE EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = xc.business_id);

-- 3. business_id values that resolve to a real business_profiles.id
--    (the dual-ID cohort — would break a naive FK → businesses).
SELECT count(*) AS matches_business_profiles_id
FROM public.xero_connections xc
WHERE EXISTS (SELECT 1 FROM public.business_profiles bp WHERE bp.id = xc.business_id);

-- 4. TRUE ORPHANS: business_id matches NEITHER businesses.id NOR
--    business_profiles.id. These block any FK and must be resolved first.
SELECT count(*) AS true_orphans
FROM public.xero_connections xc
WHERE NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = xc.business_id)
  AND NOT EXISTS (SELECT 1 FROM public.business_profiles bp WHERE bp.id = xc.business_id);

-- 5. The actual orphan rows (for triage — is_active + tenant tell us if they are
--    live connections or stale junk). Limited to 100; widen if count is larger.
SELECT xc.id,
       xc.business_id,
       xc.user_id,
       xc.tenant_name,
       xc.is_active,
       xc.last_synced_at,
       xc.created_at
FROM public.xero_connections xc
WHERE NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = xc.business_id)
  AND NOT EXISTS (SELECT 1 FROM public.business_profiles bp WHERE bp.id = xc.business_id)
ORDER BY xc.created_at DESC
LIMIT 100;

-- 6. Cross-tab summary in one row: which target table each connection resolves to.
--    (active-only matters most — a stale is_active=false orphan may just be deletable.)
SELECT
  count(*) FILTER (WHERE in_businesses)                          AS in_businesses,
  count(*) FILTER (WHERE in_profiles)                            AS in_profiles,
  count(*) FILTER (WHERE in_businesses AND in_profiles)          AS in_both,
  count(*) FILTER (WHERE NOT in_businesses AND NOT in_profiles)  AS in_neither,
  count(*) FILTER (WHERE NOT in_businesses AND NOT in_profiles AND is_active) AS active_orphans
FROM (
  SELECT xc.is_active,
         EXISTS (SELECT 1 FROM public.businesses b        WHERE b.id  = xc.business_id) AS in_businesses,
         EXISTS (SELECT 1 FROM public.business_profiles bp WHERE bp.id = xc.business_id) AS in_profiles
  FROM public.xero_connections xc
) t;
