-- ============================================================================
-- Coach-context corruption audit
-- ============================================================================
-- Run this in the Supabase SQL editor to detect rows that may have been
-- written with the wrong business_id due to the pre-fix bug described in
-- commit ed9dfa7.
--
-- The bug: pages fell back to `business_id = user.id` (coach's auth UUID) OR
-- resolved to a business the coach happened to own. Both produced writes
-- scoped to the wrong business.
--
-- This audit finds:
--   A. Any row where business_id matches an auth.users.id (a user UUID
--      masquerading as a business id).
--   B. Any row a coach/admin created on a business they own
--      (businesses.owner_id = auth.uid()). Not necessarily corrupt — but
--      worth reviewing since clients should own their own data, not coaches.
--
-- SAFE TO RUN: SELECTs only, no mutations. Returns one row per table with
-- a count. Drill into any non-zero result before concluding.
-- ============================================================================

-- Section A: business_id equals an auth.users.id (definitely wrong)
-- ----------------------------------------------------------------------------
WITH suspect_tables AS (
  SELECT unnest(ARRAY[
    'session_notes',
    'messages',
    'weekly_reviews',
    'quarterly_reviews',
    'business_financial_goals',
    'strategic_initiatives',
    'business_kpis',
    'session_actions',
    'notification_preferences',
    'monthly_report_snapshots',
    'plan_snapshots',
    'ideas',
    'issues_list',
    'open_loops',
    'todo_items',
    'daily_tasks',
    'stop_doing_items',
    'annual_plans',
    'annual_snapshots',
    'quarterly_plans',
    'quarterly_snapshots',
    'quarterly_priorities',
    'quarterly_forecasts'
  ]) AS tbl
),
results AS (
  SELECT
    st.tbl,
    (
      SELECT count(*)
      FROM   information_schema.columns
      WHERE  table_schema = 'public' AND table_name = st.tbl AND column_name = 'business_id'
    ) > 0 AS has_business_id_col
  FROM suspect_tables st
)
SELECT tbl, has_business_id_col FROM results ORDER BY tbl;

-- For each table in section A that has_business_id_col=true, run this
-- manually substituting <TABLE>:
--
-- SELECT count(*) AS suspect_rows
-- FROM   public.<TABLE> t
-- JOIN   auth.users u ON u.id::text = t.business_id::text;
--
-- Any non-zero result is a row whose business_id equals a user UUID —
-- definitively corrupt from the pre-fix bug.

-- ----------------------------------------------------------------------------
-- Section B: rows the coach may have written to a business they own/assigned
-- ----------------------------------------------------------------------------
-- Replace <COACH_USER_ID> with your own auth.uid before running.
-- This surfaces recent rows on any business that lists you as owner OR
-- assigned_coach, grouped by business, so you can spot anomalies
-- (e.g. a client's goal you expected to save vs. one that landed on your
-- own test business by mistake).

/*
WITH coach AS (SELECT '<COACH_USER_ID>'::uuid AS uid)
SELECT
  b.id                  AS business_id,
  b.business_name,
  b.owner_id = c.uid    AS you_own,
  b.assigned_coach_id = c.uid AS you_coach,
  (SELECT count(*) FROM session_notes    sn WHERE sn.business_id = b.id::text AND sn.created_at >= now() - interval '90 days') AS recent_sessions,
  (SELECT count(*) FROM messages         m  WHERE m.business_id  = b.id::text AND m.created_at  >= now() - interval '90 days') AS recent_messages,
  (SELECT count(*) FROM weekly_reviews   wr WHERE wr.business_id = b.id::text AND wr.created_at >= now() - interval '90 days') AS recent_weekly_reviews,
  (SELECT count(*) FROM business_kpis    k  WHERE k.business_id  = b.id::text) AS total_kpis,
  (SELECT count(*) FROM strategic_initiatives si WHERE si.business_id = b.id::text) AS total_initiatives
FROM businesses b, coach c
WHERE b.owner_id = c.uid OR b.assigned_coach_id = c.uid
ORDER BY b.business_name;
*/

-- ----------------------------------------------------------------------------
-- Section C: check if YOUR coach user_id appears as a business owner/member
-- (answers the question: how big is the blast radius of the old bug for me?)
-- ----------------------------------------------------------------------------
-- Replace <COACH_USER_ID> with your own auth.uid.

/*
SELECT 'owned_businesses' AS label, count(*) AS n
FROM businesses WHERE owner_id = '<COACH_USER_ID>'::uuid
UNION ALL
SELECT 'team_member_of', count(*)
FROM business_users WHERE user_id = '<COACH_USER_ID>'::uuid
UNION ALL
SELECT 'own_business_profile_row', count(*)
FROM business_profiles WHERE user_id = '<COACH_USER_ID>'::uuid;
*/
