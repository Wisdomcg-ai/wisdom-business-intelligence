-- ============================================================
-- FIX: Update Q1 2026 → Q3 2026 for FY businesses ONLY
--
-- The quarterly review was created with quarter=1 (CY) instead
-- of quarter=3 (FY) due to a yearType resolution bug (now fixed).
-- This script corrects the quarter value while preserving ALL
-- review data (rocks, targets, reflections, etc.)
--
-- Only affects businesses with year_type='FY' in business_financial_goals.
-- CY businesses (where Q1 is correct) are left untouched.
--
-- Run in Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
  v_business_id UUID;
  v_review_id UUID;
  v_user_id UUID;
  v_updated_count INTEGER := 0;
  v_skipped_cy INTEGER := 0;
  v_skipped_conflict INTEGER := 0;
  v_year_type TEXT;
BEGIN

-- ============================================================
-- 1. Fix quarterly_reviews: quarter 1 → 3 for year 2026
--    ONLY for FY businesses (where March = Q3, not Q1)
-- ============================================================

FOR v_review_id, v_business_id, v_user_id IN
  SELECT qr.id, qr.business_id, qr.user_id
  FROM quarterly_reviews qr
  WHERE qr.quarter = 1
    AND qr.year = 2026
LOOP
  -- Determine year_type for this business
  -- Check business_financial_goals using multiple ID strategies
  v_year_type := NULL;

  -- Try by business_id directly
  SELECT bfg.year_type INTO v_year_type
  FROM business_financial_goals bfg
  WHERE bfg.business_id = v_business_id::text
  LIMIT 1;

  -- Try by user_id if not found
  IF v_year_type IS NULL THEN
    SELECT bfg.year_type INTO v_year_type
    FROM business_financial_goals bfg
    WHERE bfg.business_id = v_user_id::text
    LIMIT 1;
  END IF;

  -- Try via business_profiles.id
  IF v_year_type IS NULL THEN
    SELECT bfg.year_type INTO v_year_type
    FROM business_financial_goals bfg
    INNER JOIN business_profiles bp ON bfg.business_id = bp.id::text
    WHERE bp.business_id = v_business_id::text
    LIMIT 1;
  END IF;

  -- Try via business owner
  IF v_year_type IS NULL THEN
    SELECT bfg.year_type INTO v_year_type
    FROM business_financial_goals bfg
    INNER JOIN businesses b ON bfg.business_id = b.owner_id::text
    WHERE b.id = v_business_id
    LIMIT 1;
  END IF;

  -- Default to FY if no goals row found (Australian platform default)
  IF v_year_type IS NULL THEN
    v_year_type := 'FY';
    RAISE NOTICE 'No year_type found for business %, defaulting to FY', v_business_id;
  END IF;

  -- Skip CY businesses — Q1 is correct for them
  IF v_year_type = 'CY' THEN
    v_skipped_cy := v_skipped_cy + 1;
    RAISE NOTICE 'SKIPPED (CY business) quarterly_review % (business %)', v_review_id, v_business_id;
    CONTINUE;
  END IF;

  -- Check no Q3 already exists for this business (unique constraint)
  IF EXISTS (
    SELECT 1 FROM quarterly_reviews
    WHERE business_id = v_business_id
      AND quarter = 3
      AND year = 2026
      AND id != v_review_id
  ) THEN
    v_skipped_conflict := v_skipped_conflict + 1;
    RAISE WARNING 'SKIPPED (Q3 exists) quarterly_review % — Q3 2026 already exists for business %', v_review_id, v_business_id;
    CONTINUE;
  END IF;

  -- Update the review
  UPDATE quarterly_reviews
  SET quarter = 3, updated_at = NOW()
  WHERE id = v_review_id;

  v_updated_count := v_updated_count + 1;
  RAISE NOTICE 'Updated quarterly_review % (business %) from Q1 → Q3 2026 (year_type=%)', v_review_id, v_business_id, v_year_type;
END LOOP;

RAISE NOTICE '';
RAISE NOTICE '--- quarterly_reviews: % updated, % skipped (CY), % skipped (conflict) ---', v_updated_count, v_skipped_cy, v_skipped_conflict;

-- ============================================================
-- 2. Fix swot_analyses linked to updated reviews
-- ============================================================

UPDATE swot_analyses
SET quarter = 3
WHERE quarter = 1
  AND year = 2026
  AND id IN (
    SELECT swot_analysis_id FROM quarterly_reviews
    WHERE quarter = 3 AND year = 2026
    AND swot_analysis_id IS NOT NULL
  );

RAISE NOTICE '--- swot_analyses updated ---';

-- ============================================================
-- 3. Fix plan_snapshots (quarter stored as TEXT e.g. 'Q1')
-- ============================================================

UPDATE plan_snapshots
SET quarter = 'Q3'
WHERE quarter = 'Q1'
  AND year = 2026
  AND quarterly_review_id IN (
    SELECT id FROM quarterly_reviews
    WHERE quarter = 3 AND year = 2026
  );

RAISE NOTICE '--- plan_snapshots updated ---';

-- ============================================================
-- 4. Fix kpi_actuals (period_quarter stored as TEXT e.g. 'Q1')
-- ============================================================

UPDATE kpi_actuals
SET period_quarter = 'Q3'
WHERE period_quarter = 'Q1'
  AND period_year = 2026
  AND period_type = 'quarterly'
  AND business_id IN (
    SELECT business_id FROM quarterly_reviews
    WHERE quarter = 3 AND year = 2026
  );

RAISE NOTICE '--- kpi_actuals updated ---';

-- ============================================================
-- SUMMARY
-- ============================================================
RAISE NOTICE '';
RAISE NOTICE '============================================================';
RAISE NOTICE 'QUARTERLY REVIEW Q1 → Q3 FIX COMPLETE';
RAISE NOTICE 'Updated: %   Skipped CY: %   Skipped conflict: %', v_updated_count, v_skipped_cy, v_skipped_conflict;
RAISE NOTICE 'All review data (rocks, targets, reflections, etc.) preserved';
RAISE NOTICE '============================================================';

END $$;
