-- Phase 42: Plan period as explicit state
-- Adds plan_start_date, plan_end_date, year1_end_date as persisted plan boundaries.
-- One-time backfill maps existing rows from (is_extended_period, year1_months,
-- current_year_remaining_months) to the new date columns so existing clients see
-- identical plan shapes after migration.

ALTER TABLE "public"."business_financial_goals"
  ADD COLUMN IF NOT EXISTS "plan_start_date" date,
  ADD COLUMN IF NOT EXISTS "plan_end_date"   date,
  ADD COLUMN IF NOT EXISTS "year1_end_date"  date;

COMMENT ON COLUMN "public"."business_financial_goals"."plan_start_date" IS
  'Phase 42: Start date of the strategic plan. NULL = legacy row not yet migrated by user save.';
COMMENT ON COLUMN "public"."business_financial_goals"."plan_end_date" IS
  'Phase 42: End date of Year 3 (always plan_start_date + 3 years - adjusted to FY end).';
COMMENT ON COLUMN "public"."business_financial_goals"."year1_end_date" IS
  'Phase 42: End date of Year 1. For extended period plans this is plan_start_date + year1_months. Standard plans: end of next FY.';

-- One-time backfill — only for rows that have financial data set (revenue_year1 > 0
-- or any year1 metric set) so we don't synthesize a plan for placeholder rows.
-- For each row:
--   plan_start_date := computed from updated_at (or created_at) + year_type
--   year1_end_date  := plan_start_date + year1_months months - 1 day (snap to month-end)
--   plan_end_date   := year1_end_date + 24 months (Years 2 + 3, standard 12 each)
--
-- Mapping rules (researcher decision — see "Backfill semantics" subsection of 42-RESEARCH.md):
--   - is_extended_period = true:
--       plan_start_date := first-of-month(updated_at)  (the date we presume detection ran)
--       year1_end_date  := plan_start_date + year1_months months - 1 day
--   - is_extended_period = false (standard 12-month):
--       plan_start_date := start of fiscal_year that updated_at falls in
--       year1_end_date  := end of that same fiscal_year
--   - NULL year1_months → treat as 12 (default)
--   - rows where revenue_year1 = 0 AND revenue_year2 = 0 AND revenue_year3 = 0 → SKIP
--     (no real plan; first save will generate dates from suggestPlanPeriod)
--
-- Backfill is gated on plan_start_date IS NULL so re-running the migration is a no-op.

UPDATE "public"."business_financial_goals" g
SET
  plan_start_date = computed.start_date,
  year1_end_date  = computed.year1_end,
  plan_end_date   = computed.year3_end
FROM (
  SELECT
    id,
    -- start date depends on is_extended_period
    CASE
      WHEN COALESCE(is_extended_period, false) = true THEN
        date_trunc('month', updated_at)::date
      ELSE
        -- Snap to start of fiscal year. For year_type='FY', FY starts July 1.
        -- For year_type='CY', FY starts January 1. We don't know yearStartMonth
        -- per-business in this table, so we use year_type as proxy (matches
        -- DEFAULT_YEAR_START_MONTH semantics in fiscal-year-utils.ts).
        CASE COALESCE(year_type, 'FY')
          WHEN 'CY' THEN make_date(EXTRACT(YEAR FROM updated_at)::int, 1, 1)
          ELSE
            CASE
              WHEN EXTRACT(MONTH FROM updated_at) >= 7 THEN
                make_date(EXTRACT(YEAR FROM updated_at)::int, 7, 1)
              ELSE
                make_date(EXTRACT(YEAR FROM updated_at)::int - 1, 7, 1)
            END
        END
    END AS start_date,
    -- year1_end = start + year1_months months - 1 day
    (
      CASE
        WHEN COALESCE(is_extended_period, false) = true THEN
          date_trunc('month', updated_at)::date
        ELSE
          CASE COALESCE(year_type, 'FY')
            WHEN 'CY' THEN make_date(EXTRACT(YEAR FROM updated_at)::int, 1, 1)
            ELSE
              CASE
                WHEN EXTRACT(MONTH FROM updated_at) >= 7 THEN
                  make_date(EXTRACT(YEAR FROM updated_at)::int, 7, 1)
                ELSE
                  make_date(EXTRACT(YEAR FROM updated_at)::int - 1, 7, 1)
              END
          END
      END
      + (COALESCE(year1_months, 12) || ' months')::interval
      - INTERVAL '1 day'
    )::date AS year1_end,
    -- year3_end = year1_end + 24 months
    (
      CASE
        WHEN COALESCE(is_extended_period, false) = true THEN
          date_trunc('month', updated_at)::date
        ELSE
          CASE COALESCE(year_type, 'FY')
            WHEN 'CY' THEN make_date(EXTRACT(YEAR FROM updated_at)::int, 1, 1)
            ELSE
              CASE
                WHEN EXTRACT(MONTH FROM updated_at) >= 7 THEN
                  make_date(EXTRACT(YEAR FROM updated_at)::int, 7, 1)
                ELSE
                  make_date(EXTRACT(YEAR FROM updated_at)::int - 1, 7, 1)
              END
          END
      END
      + (COALESCE(year1_months, 12) || ' months')::interval
      + INTERVAL '24 months'
      - INTERVAL '1 day'
    )::date AS year3_end
  FROM "public"."business_financial_goals"
  WHERE plan_start_date IS NULL
    AND (
      COALESCE(revenue_year1, 0) > 0
      OR COALESCE(revenue_year2, 0) > 0
      OR COALESCE(revenue_year3, 0) > 0
    )
) computed
WHERE g.id = computed.id;

-- Verification query (run manually post-migration; not part of the SQL):
--
-- SELECT business_id, year_type, is_extended_period, year1_months,
--        plan_start_date, year1_end_date, plan_end_date,
--        EXTRACT(EPOCH FROM (year1_end_date - plan_start_date)) / 86400 AS year1_days
-- FROM business_financial_goals
-- WHERE plan_start_date IS NOT NULL
-- ORDER BY updated_at DESC LIMIT 10;
--
-- Expectations:
--   - is_extended_period=true rows: year1_days between 28 and 470 (1-15 months range)
--   - is_extended_period=false rows: year1_days = 364 or 365
--   - plan_end_date - plan_start_date always ≈ year1_days + 730
