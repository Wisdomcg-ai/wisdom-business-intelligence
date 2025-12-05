-- ============================================================================
-- IDEAS JOURNAL AND IDEAS FILTER FEATURE
-- Separate from Issues List - for capturing and evaluating ideas before action
-- Created: 2024-12-05
-- ============================================================================

-- ============================================
-- Table 1: Ideas (Ideas Journal)
-- Quick capture for ideas, reviewed periodically
-- ============================================
CREATE TABLE IF NOT EXISTS public.ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core idea details
  title TEXT NOT NULL,
  description TEXT,
  source TEXT, -- Where did the idea come from? (client, book, podcast, etc.)

  -- Status tracking
  status TEXT DEFAULT 'captured', -- 'captured', 'under_review', 'approved', 'rejected', 'parked'
  archived BOOLEAN DEFAULT FALSE,

  -- Optional categorization
  category TEXT, -- 'product', 'marketing', 'operations', 'people', 'finance', 'technology', 'other'
  estimated_impact TEXT, -- 'low', 'medium', 'high' - quick gut feel

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for ideas
CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON public.ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_status ON public.ideas(status);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON public.ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_archived ON public.ideas(archived) WHERE archived = FALSE;

-- RLS for ideas
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ideas" ON public.ideas;
CREATE POLICY "Users can view own ideas" ON public.ideas
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own ideas" ON public.ideas;
CREATE POLICY "Users can insert own ideas" ON public.ideas
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own ideas" ON public.ideas;
CREATE POLICY "Users can update own ideas" ON public.ideas
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own ideas" ON public.ideas;
CREATE POLICY "Users can delete own ideas" ON public.ideas
  FOR DELETE USING (user_id = auth.uid());

-- ============================================
-- Table 2: Ideas Filter Evaluations
-- Full evaluation when ready to assess an idea
-- ============================================
CREATE TABLE IF NOT EXISTS public.ideas_filter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 1. What problem is it solving?
  problem_solving TEXT,

  -- 2. Pros and Cons (stored as JSONB arrays)
  pros JSONB DEFAULT '[]', -- ["pro 1", "pro 2", ...]
  cons JSONB DEFAULT '[]', -- ["con 1", "con 2", ...]

  -- 3. Minimum Viable Product
  mvp_description TEXT,
  mvp_timeline TEXT, -- How long to build MVP?

  -- 4. Revenue and Profit Forecast
  revenue_forecast JSONB DEFAULT '{}', -- {"month3": 0, "year1": 0, "year2": 0}
  profit_forecast JSONB DEFAULT '{}', -- {"month3": 0, "year1": 0, "year2": 0}

  -- 5. Investment Required
  cash_required DECIMAL(15, 2) DEFAULT 0, -- Cash required to launch
  time_investment JSONB DEFAULT '[]', -- [{"name": "", "role": "", "hours": 0, "hourlyRate": 0, "total": 0}]
  total_time_investment DECIMAL(15, 2) DEFAULT 0, -- Auto-calculated sum

  -- 6. Strategic Alignment
  bhag_alignment_score INTEGER, -- 1-10 scale
  bhag_alignment_notes TEXT,

  -- 7. Marketing Requirements
  unique_selling_proposition TEXT, -- What's the USP?
  how_to_sell TEXT, -- How will we sell/market it?
  who_will_sell TEXT, -- Who is responsible for selling?

  -- 8. Timing Analysis
  why_now TEXT, -- Why is this the right time?
  what_will_suffer TEXT, -- What current priorities will be impacted?

  -- 9. Competition
  competition_analysis TEXT,
  competitive_advantage TEXT,

  -- 10. Risk Analysis
  upside_risks JSONB DEFAULT '[]', -- ["risk 1", "risk 2", ...] - What if it succeeds big?
  downside_risks JSONB DEFAULT '[]', -- ["risk 1", "risk 2", ...] - What if it fails?

  -- 11. Final Decision
  decision TEXT, -- 'proceed', 'reject', 'park', 'needs_more_info'
  decision_notes TEXT,
  decision_date TIMESTAMPTZ,

  -- Evaluation metadata
  evaluation_score INTEGER, -- Optional overall score 1-100
  evaluated_at TIMESTAMPTZ,
  evaluated_by UUID REFERENCES auth.users(id), -- Could be coach or owner

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One evaluation per idea (for now - could allow multiple in future)
  UNIQUE(idea_id)
);

-- Indexes for ideas_filter
CREATE INDEX IF NOT EXISTS idx_ideas_filter_user_id ON public.ideas_filter(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_filter_idea_id ON public.ideas_filter(idea_id);
CREATE INDEX IF NOT EXISTS idx_ideas_filter_decision ON public.ideas_filter(decision);
CREATE INDEX IF NOT EXISTS idx_ideas_filter_evaluated_at ON public.ideas_filter(evaluated_at DESC);

-- RLS for ideas_filter
ALTER TABLE public.ideas_filter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own idea filters" ON public.ideas_filter;
CREATE POLICY "Users can view own idea filters" ON public.ideas_filter
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own idea filters" ON public.ideas_filter;
CREATE POLICY "Users can insert own idea filters" ON public.ideas_filter
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own idea filters" ON public.ideas_filter;
CREATE POLICY "Users can update own idea filters" ON public.ideas_filter
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own idea filters" ON public.ideas_filter;
CREATE POLICY "Users can delete own idea filters" ON public.ideas_filter
  FOR DELETE USING (user_id = auth.uid());

-- ============================================
-- Coach Access Policies
-- Coaches can view their clients' ideas
-- ============================================

-- Get business_id from businesses table via profiles
-- Coach can view ideas for users they coach
DROP POLICY IF EXISTS "Coaches can view client ideas" ON public.ideas;
CREATE POLICY "Coaches can view client ideas" ON public.ideas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      JOIN public.profiles p ON p.business_id = b.id
      WHERE p.id = ideas.user_id
        AND b.assigned_coach_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Coaches can view client idea filters" ON public.ideas_filter;
CREATE POLICY "Coaches can view client idea filters" ON public.ideas_filter
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      JOIN public.profiles p ON p.business_id = b.id
      WHERE p.id = ideas_filter.user_id
        AND b.assigned_coach_id = auth.uid()
    )
  );

-- ============================================
-- Super Admin Access Policies
-- ============================================
DROP POLICY IF EXISTS "Super admins can view all ideas" ON public.ideas;
CREATE POLICY "Super admins can view all ideas" ON public.ideas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Super admins can view all idea filters" ON public.ideas_filter;
CREATE POLICY "Super admins can view all idea filters" ON public.ideas_filter
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- ============================================
-- Trigger for updated_at timestamps
-- ============================================
CREATE OR REPLACE FUNCTION public.update_ideas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ideas_updated_at ON public.ideas;
CREATE TRIGGER ideas_updated_at
  BEFORE UPDATE ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION public.update_ideas_updated_at();

DROP TRIGGER IF EXISTS ideas_filter_updated_at ON public.ideas_filter;
CREATE TRIGGER ideas_filter_updated_at
  BEFORE UPDATE ON public.ideas_filter
  FOR EACH ROW EXECUTE FUNCTION public.update_ideas_updated_at();

-- ============================================
-- Update idea status when filter is completed
-- ============================================
CREATE OR REPLACE FUNCTION public.update_idea_status_on_filter()
RETURNS TRIGGER AS $$
BEGIN
  -- When a decision is made on the filter, update the idea status
  IF NEW.decision IS NOT NULL AND NEW.decision != '' THEN
    UPDATE public.ideas
    SET status = CASE
      WHEN NEW.decision = 'proceed' THEN 'approved'
      WHEN NEW.decision = 'reject' THEN 'rejected'
      WHEN NEW.decision = 'park' THEN 'parked'
      ELSE 'under_review'
    END,
    updated_at = NOW()
    WHERE id = NEW.idea_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ideas_filter_decision_trigger ON public.ideas_filter;
CREATE TRIGGER ideas_filter_decision_trigger
  AFTER INSERT OR UPDATE OF decision ON public.ideas_filter
  FOR EACH ROW EXECUTE FUNCTION public.update_idea_status_on_filter();

-- ============================================
-- Grant permissions
-- ============================================
GRANT ALL ON public.ideas TO authenticated;
GRANT ALL ON public.ideas_filter TO authenticated;
