-- =============================================================================
-- Phase 49 DB-06: RLS policy intent documentation (comment-only migration).
-- =============================================================================
--
-- Context:
--   The 2026-04-28 codebase audit (Section D #5) flagged three RLS SELECT
--   policies as over-permissive because they use `USING (true)`:
--
--     1. swot_templates  → "Authenticated users can view swot templates"
--     2. kpi_benchmarks  → "kpi_benchmarks_select_consolidated"
--     3. kpi_definitions → "kpi_definitions_select_consolidated"
--
-- Audit verdict reframing:
--   Phase 49 RESEARCH.md (DB-06 schema inspection) confirmed all three tables
--   structurally have NO tenant column — no business_id, no user_id, no
--   creator_id. They are legitimately system-wide reference catalogues:
--
--     - swot_templates : industry-tagged SWOT prompt seeds (industry,
--                        business_stage, category columns)
--     - kpi_benchmarks : industry benchmark percentiles (industry,
--                        revenue_stage columns)
--     - kpi_definitions: universal KPI catalogue (text PKs like
--                        'gross_margin', 'cac')
--
--   Open SELECT to all authenticated users is INTENTIONAL, not accidental
--   over-permissiveness. Narrowing any of these to per-business would first
--   require adding a tenant column — that is a destructive schema change
--   PHASE.md explicitly says is OUT OF SCOPE for Phase 49 (additive-only).
--
-- What this migration does:
--   1. Attaches a policy-level comment to each of the three policies (via
--      the COMMENT-ON-POLICY DDL form), recording the intent. Each comment
--      begins with the sentinel string 'INTENT:' so that future grep-based
--      audits and introspection scripts can detect the convention and
--      confirm the open SELECT was reviewed.
--   2. Includes a DO $$ ... RAISE EXCEPTION self-check at the end. If any of
--      the three COMMENT statements failed to land (e.g., a typo in the
--      policy name produced a silent no-op COMMENT against a non-existent
--      policy), the migration apply fails — no silent gap.
--
-- What this migration does NOT do:
--   - Does NOT narrow any policy. RLS remains `USING (true)` on all three.
--   - Does NOT disable RLS — RLS stays ENABLED on each table so future
--     INSERT/UPDATE/DELETE policies can be layered on without a separate
--     enable step. (Currently writes to these tables happen via service-role
--     in app code; no end-user write paths exist.)
--   - Does NOT touch swot_templates / kpi_benchmarks / kpi_definitions table
--     schemas — no columns added or removed.
--
-- Rollback:
--   Setting each policy comment back to NULL (via the COMMENT-ON-POLICY DDL
--   form with `IS NULL`) for each of the three policies restores the prior
--   (empty) comment state. Trivially reversible; no data effects.
--
-- Verification (post-apply):
--   See .planning/phases/49-database-integrity-hygiene/RESEARCH.md "Sentinel 4":
--
--     SELECT n.nspname, c.relname, p.polname,
--            obj_description(p.oid, 'pg_policy') AS intent_comment
--     FROM   pg_policy p
--     JOIN   pg_class c ON c.oid = p.polrelid
--     JOIN   pg_namespace n ON n.oid = c.relnamespace
--     WHERE  n.nspname = 'public'
--       AND  c.relname IN ('swot_templates','kpi_benchmarks','kpi_definitions');
--
--   Expected: 3 rows, each with a non-NULL intent_comment containing 'INTENT:'.
--
-- Phase / Plan: Phase 49 / Plan 03 (DB-06).
-- =============================================================================

-- 1. swot_templates: SWOT prompt catalogue, indexed by industry + business_stage.
COMMENT ON POLICY "Authenticated users can view swot templates"
  ON "public"."swot_templates" IS
  'INTENT: system-wide reference data (SWOT prompt catalogue, indexed by industry + business_stage). No business_id column — open SELECT is intentional. Confirmed Phase 49 DB-06.';

-- 2. kpi_benchmarks: industry benchmark reference data.
COMMENT ON POLICY "kpi_benchmarks_select_consolidated"
  ON "public"."kpi_benchmarks" IS
  'INTENT: system-wide industry benchmark reference data. No business_id — open SELECT is intentional. Confirmed Phase 49 DB-06.';

-- 3. kpi_definitions: universal KPI catalogue.
COMMENT ON POLICY "kpi_definitions_select_consolidated"
  ON "public"."kpi_definitions" IS
  'INTENT: system-wide KPI catalogue (universal financial/operational metrics). No business_id — open SELECT is intentional. Confirmed Phase 49 DB-06.';

-- =============================================================================
-- Self-check: fail the migration if any of the three COMMENTs failed to land.
--
-- Why: a comment-on-policy DDL against a non-existent policy name does NOT
-- raise on all PostgreSQL versions (silent no-op). The swot_templates policy
-- name contains spaces and is the most error-prone to mistype. This block
-- does a post-comment introspection and raises if any comment is NULL or
-- missing the 'INTENT:' sentinel — guarantees apply-time enforcement of the
-- comments even if the test suite skips live-DB introspection.
-- =============================================================================
DO $db06_check$
DECLARE
  missing_count integer;
  missing_list  text;
BEGIN
  SELECT
    count(*),
    string_agg(format('%I.%I → %s', n.nspname, c.relname, p.polname), '; ')
  INTO missing_count, missing_list
  FROM   pg_policy p
  JOIN   pg_class     c ON c.oid = p.polrelid
  JOIN   pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'public'
    AND  (
      (c.relname = 'swot_templates'  AND p.polname = 'Authenticated users can view swot templates') OR
      (c.relname = 'kpi_benchmarks'  AND p.polname = 'kpi_benchmarks_select_consolidated') OR
      (c.relname = 'kpi_definitions' AND p.polname = 'kpi_definitions_select_consolidated')
    )
    AND  (
      obj_description(p.oid, 'pg_policy') IS NULL OR
      obj_description(p.oid, 'pg_policy') NOT LIKE '%INTENT:%'
    );

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'DB-06 self-check failed: % policy COMMENT(s) missing INTENT: sentinel: %',
      missing_count, missing_list;
  END IF;

  -- Also assert all three target policies exist (catches the silent-no-op
  -- case where a typo meant the COMMENT statement above ran against nothing).
  -- LEFT JOIN so unmatched expected rows surface as p.polname IS NULL.
  SELECT
    count(*) FILTER (WHERE p.polname IS NULL),
    string_agg(format('%s.%s', expected.tbl, expected.pol), '; ')
      FILTER (WHERE p.polname IS NULL)
  INTO missing_count, missing_list
  FROM (
    VALUES
      ('swot_templates',  'Authenticated users can view swot templates'),
      ('kpi_benchmarks',  'kpi_benchmarks_select_consolidated'),
      ('kpi_definitions', 'kpi_definitions_select_consolidated')
  ) AS expected(tbl, pol)
  LEFT JOIN pg_namespace n ON n.nspname = 'public'
  LEFT JOIN pg_class     c ON c.relname  = expected.tbl AND c.relnamespace = n.oid
  LEFT JOIN pg_policy    p ON p.polrelid = c.oid AND p.polname = expected.pol;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'DB-06 self-check failed: % expected policy/table pair(s) not found in pg_policy: %',
      missing_count, missing_list;
  END IF;
END;
$db06_check$;
