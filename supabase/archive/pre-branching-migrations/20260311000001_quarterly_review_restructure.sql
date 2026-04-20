-- Quarterly Review Workshop Restructure
-- Expands from 13 steps to 19 steps across 4 parts
-- Adds 11 new columns for new step data, preserves all existing columns

-- ═══════════════════════════════════════════════════════════════
-- 1. Add new columns to quarterly_reviews
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE quarterly_reviews
  ADD COLUMN IF NOT EXISTS rocks_review JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS customer_pulse JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS people_review JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS annual_plan_snapshot JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS realignment_decision JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS initiative_decisions JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS coach_notes JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS action_items JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS one_thing_answer TEXT,
  ADD COLUMN IF NOT EXISTS feedback_loop_mode TEXT DEFAULT 'by_area',
  ADD COLUMN IF NOT EXISTS scorecard_commentary TEXT;

-- Add check constraint for feedback_loop_mode
ALTER TABLE quarterly_reviews
  DROP CONSTRAINT IF EXISTS quarterly_reviews_feedback_loop_mode_check;
ALTER TABLE quarterly_reviews
  ADD CONSTRAINT quarterly_reviews_feedback_loop_mode_check
  CHECK (feedback_loop_mode IN ('business_wide', 'by_area'));

-- ═══════════════════════════════════════════════════════════════
-- 2. Migrate in-progress reviews: remap step IDs
-- Old 3.3 (confidence check) → New 4.2
-- Old 4.1 (quarterly reset) → New 4.4
-- Old 4.2 (sprint planning) → New 4.5
-- ═══════════════════════════════════════════════════════════════

-- Remap current_step for in-progress reviews
UPDATE quarterly_reviews
SET current_step = CASE current_step
  WHEN '3.3' THEN '4.2'
  WHEN '4.1' THEN '4.4'
  WHEN '4.2' THEN '4.5'
  ELSE current_step
END
WHERE status = 'in_progress'
  AND current_step IN ('3.3', '4.1', '4.2');

-- Remap steps_completed JSONB array for in-progress reviews
-- Replace '3.3' with '4.2', '4.1' with '4.4', '4.2' with '4.5'
UPDATE quarterly_reviews
SET steps_completed = (
  SELECT jsonb_agg(
    CASE elem::text
      WHEN '"3.3"' THEN '"4.2"'::jsonb
      WHEN '"4.1"' THEN '"4.4"'::jsonb
      WHEN '"4.2"' THEN '"4.5"'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(steps_completed) AS elem
)
WHERE status = 'in_progress'
  AND (
    steps_completed @> '"3.3"'::jsonb
    OR steps_completed @> '"4.1"'::jsonb
    OR steps_completed @> '"4.2"'::jsonb
  );

-- ═══════════════════════════════════════════════════════════════
-- 3. Add comments for documentation
-- ═══════════════════════════════════════════════════════════════

COMMENT ON COLUMN quarterly_reviews.rocks_review IS 'Per-rock status/decisions from step 1.3 Rocks Accountability Review';
COMMENT ON COLUMN quarterly_reviews.customer_pulse IS 'Customer metrics: clients gained/lost, wins, complaints, NPS (step 2.4)';
COMMENT ON COLUMN quarterly_reviews.people_review IS 'Per-person assessments, hiring needs, capacity (step 2.5)';
COMMENT ON COLUMN quarterly_reviews.annual_plan_snapshot IS 'Annual targets, YTD actuals, gap analysis (step 4.1)';
COMMENT ON COLUMN quarterly_reviews.realignment_decision IS 'Keep vs adjust targets decision (step 4.2)';
COMMENT ON COLUMN quarterly_reviews.initiative_decisions IS 'Keep/accelerate/defer/kill per initiative (step 4.3)';
COMMENT ON COLUMN quarterly_reviews.coach_notes IS 'Per-step coach notes keyed by step ID';
COMMENT ON COLUMN quarterly_reviews.action_items IS 'Running action items list accumulated across steps';
COMMENT ON COLUMN quarterly_reviews.one_thing_answer IS 'Final "one thing" answer from step 4.6 Session Close';
COMMENT ON COLUMN quarterly_reviews.feedback_loop_mode IS 'Feedback loop mode: business_wide or by_area (step 2.1)';
COMMENT ON COLUMN quarterly_reviews.scorecard_commentary IS 'Performance commentary extracted from dashboard review (step 1.2)';
