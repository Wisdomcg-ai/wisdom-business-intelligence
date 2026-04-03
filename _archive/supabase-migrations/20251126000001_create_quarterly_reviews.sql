-- Quarterly Review Workshop Feature
-- A 4-hour guided workshop that connects existing platform features
-- Based on Matt Malouf's Wisdom Consulting Group methodology
-- Created: 2024-11-26

-- ============================================
-- Main Table: quarterly_reviews
-- ============================================
CREATE TABLE IF NOT EXISTS public.quarterly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Quarter identification
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year INTEGER NOT NULL,
  review_type TEXT DEFAULT 'quarterly' CHECK (review_type IN ('quarterly', 'annual', 'mid-year')),

  -- ═══════════════════════════════════════════════════════════════
  -- PRE-WORK QUESTIONNAIRE (completed before workshop)
  -- ═══════════════════════════════════════════════════════════════

  prework_completed_at TIMESTAMPTZ,

  -- Last quarter reflection
  last_quarter_rating INTEGER CHECK (last_quarter_rating BETWEEN 1 AND 10),
  biggest_win TEXT,
  biggest_challenge TEXT,
  key_learning TEXT,

  -- Personal pulse
  hours_worked_avg INTEGER,
  days_off_taken INTEGER,
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 10),
  purpose_alignment INTEGER CHECK (purpose_alignment BETWEEN 1 AND 10),

  -- Looking ahead
  one_thing_for_success TEXT,
  coach_support_needed TEXT,

  -- ═══════════════════════════════════════════════════════════════
  -- PART 1: REFLECTION
  -- ═══════════════════════════════════════════════════════════════

  -- 1.2 Dashboard Review (snapshot of actuals vs targets at review time)
  dashboard_snapshot JSONB DEFAULT '{}',

  -- 1.3 Action Replay (4-column framework)
  action_replay JSONB DEFAULT '{
    "worked": [],
    "didntWork": [],
    "plannedButDidnt": [],
    "newIdeas": [],
    "keyInsight": ""
  }',

  -- ═══════════════════════════════════════════════════════════════
  -- PART 2: ANALYSIS
  -- ═══════════════════════════════════════════════════════════════

  -- 2.1 Feedback Loop Framework (Stop/Less/Continue/More/Start)
  feedback_loop JSONB DEFAULT '{
    "marketing": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
    "sales": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
    "operations": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
    "finances": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
    "people": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
    "owner": { "stop": [], "less": [], "continue": [], "more": [], "start": [] },
    "topPriorities": []
  }',

  -- 2.2 Open Loops (decisions made during workshop)
  open_loops_decisions JSONB DEFAULT '[]',

  -- 2.3 Issues List (IDS outcomes)
  issues_resolved JSONB DEFAULT '[]',

  -- ═══════════════════════════════════════════════════════════════
  -- PART 3: STRATEGIC REVIEW
  -- ═══════════════════════════════════════════════════════════════

  -- 3.1 Assessment & Roadmap snapshots
  assessment_snapshot JSONB DEFAULT '{}',
  roadmap_snapshot JSONB DEFAULT '{}',

  -- 3.2 SWOT (reference to swot_analyses table)
  swot_analysis_id UUID REFERENCES public.swot_analyses(id) ON DELETE SET NULL,

  -- 3.3 Annual Target Confidence
  annual_target_confidence INTEGER CHECK (annual_target_confidence BETWEEN 1 AND 10),
  confidence_notes TEXT,
  targets_adjusted BOOLEAN DEFAULT FALSE,

  -- ═══════════════════════════════════════════════════════════════
  -- PART 4: PLANNING
  -- ═══════════════════════════════════════════════════════════════

  -- 4.1 Quarterly Targets (Numbers first - drives initiatives)
  quarterly_targets JSONB DEFAULT '{
    "revenue": 0,
    "grossProfit": 0,
    "netProfit": 0,
    "kpis": []
  }',

  -- 4.2 Strategic Initiatives (changes made during workshop)
  initiatives_changes JSONB DEFAULT '{
    "carriedForward": [],
    "removed": [],
    "deferred": [],
    "added": []
  }',

  -- 4.3 90-Day Sprint / Rocks
  quarterly_rocks JSONB DEFAULT '[]',

  -- 4.4 Personal Commitments
  personal_commitments JSONB DEFAULT '{
    "hoursPerWeekTarget": null,
    "daysOffPlanned": null,
    "daysOffScheduled": [],
    "personalGoal": ""
  }',

  -- ═══════════════════════════════════════════════════════════════
  -- METADATA
  -- ═══════════════════════════════════════════════════════════════

  -- Workshop progress tracking
  current_step TEXT DEFAULT 'prework',
  steps_completed JSONB DEFAULT '[]',

  -- Status
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'prework_complete', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one review per quarter per business
  UNIQUE(business_id, quarter, year)
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_quarterly_reviews_business_id ON public.quarterly_reviews(business_id);
CREATE INDEX IF NOT EXISTS idx_quarterly_reviews_user_id ON public.quarterly_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_quarterly_reviews_quarter_year ON public.quarterly_reviews(year DESC, quarter DESC);
CREATE INDEX IF NOT EXISTS idx_quarterly_reviews_status ON public.quarterly_reviews(status);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE public.quarterly_reviews ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can view own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Users can insert own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Users can update own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Users can delete own quarterly reviews" ON public.quarterly_reviews;
DROP POLICY IF EXISTS "Coaches can view client quarterly reviews" ON public.quarterly_reviews;

-- Users can view their own quarterly reviews
CREATE POLICY "Users can view own quarterly reviews" ON public.quarterly_reviews
  FOR SELECT USING (
    user_id = auth.uid()
    OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

-- Users can insert their own quarterly reviews
CREATE POLICY "Users can insert own quarterly reviews" ON public.quarterly_reviews
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

-- Users can update their own quarterly reviews
CREATE POLICY "Users can update own quarterly reviews" ON public.quarterly_reviews
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

-- Users can delete their own quarterly reviews
CREATE POLICY "Users can delete own quarterly reviews" ON public.quarterly_reviews
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

-- Coaches can view their clients' quarterly reviews
CREATE POLICY "Coaches can view client quarterly reviews" ON public.quarterly_reviews
  FOR SELECT USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE assigned_coach_id = auth.uid()
    )
  );

-- ============================================
-- Updated At Trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_quarterly_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quarterly_reviews_updated_at ON public.quarterly_reviews;
CREATE TRIGGER quarterly_reviews_updated_at
  BEFORE UPDATE ON public.quarterly_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_quarterly_reviews_updated_at();

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE public.quarterly_reviews IS 'Stores quarterly review workshop data including reflection, analysis, strategic review, and planning phases';
COMMENT ON COLUMN public.quarterly_reviews.action_replay IS 'Four-column retrospective: worked, didnt work, planned but didnt, new ideas';
COMMENT ON COLUMN public.quarterly_reviews.feedback_loop IS 'Stop/Less/Continue/More/Start matrix across 6 business areas';
COMMENT ON COLUMN public.quarterly_reviews.quarterly_rocks IS 'The 3-5 priority initiatives for the quarter (90-day sprint)';
COMMENT ON COLUMN public.quarterly_reviews.current_step IS 'Current step in workshop: prework, 1.1-1.3, 2.1-2.3, 3.1-3.3, 4.1-4.4, complete';
