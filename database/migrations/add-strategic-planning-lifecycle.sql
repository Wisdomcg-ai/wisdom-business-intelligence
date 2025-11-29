-- Strategic Planning Lifecycle Migration
-- Phase 1: Add tracking fields and historical snapshot capabilities

-- ============================================================================
-- 1. Add tracking fields to strategic_plans table (or create if doesn't exist)
-- ============================================================================

-- First, check if strategic_plans table exists, if not create it
CREATE TABLE IF NOT EXISTS strategic_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add lifecycle tracking columns
ALTER TABLE strategic_plans ADD COLUMN IF NOT EXISTS wizard_completed_at TIMESTAMPTZ;
ALTER TABLE strategic_plans ADD COLUMN IF NOT EXISTS plan_start_date DATE;
ALTER TABLE strategic_plans ADD COLUMN IF NOT EXISTS plan_year INTEGER;
ALTER TABLE strategic_plans ADD COLUMN IF NOT EXISTS current_quarter TEXT CHECK (current_quarter IN ('Q1', 'Q2', 'Q3', 'Q4'));
ALTER TABLE strategic_plans ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived'));
ALTER TABLE strategic_plans ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'initial' CHECK (plan_type IN ('initial', 'quarterly_refresh', 'annual_reset'));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_strategic_plans_business_status ON strategic_plans(business_id, status);
CREATE INDEX IF NOT EXISTS idx_strategic_plans_year_quarter ON strategic_plans(business_id, plan_year, current_quarter);

-- ============================================================================
-- 2. Update strategic_initiatives table with progress tracking
-- ============================================================================

-- Add progress tracking fields
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'not_started'
  CHECK (status IN ('not_started', 'in_progress', 'completed', 'cancelled', 'on_hold'));
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100);
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS actual_completion_date DATE;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS quarter_assigned TEXT CHECK (quarter_assigned IN ('Q1', 'Q2', 'Q3', 'Q4'));
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS year_assigned INTEGER;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS reflection_notes TEXT;

-- Add index for filtering by status and quarter
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_status ON strategic_initiatives(business_id, status);
CREATE INDEX IF NOT EXISTS idx_strategic_initiatives_quarter ON strategic_initiatives(business_id, year_assigned, quarter_assigned);

-- ============================================================================
-- 3. Create quarterly_snapshots table for historical data
-- ============================================================================

CREATE TABLE IF NOT EXISTS quarterly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  strategic_plan_id UUID REFERENCES strategic_plans(id) ON DELETE CASCADE,

  -- Quarter identification
  snapshot_year INTEGER NOT NULL,
  snapshot_quarter TEXT NOT NULL CHECK (snapshot_quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
  snapshot_date TIMESTAMPTZ DEFAULT NOW(),

  -- Performance summary
  total_initiatives INTEGER DEFAULT 0,
  completed_initiatives INTEGER DEFAULT 0,
  in_progress_initiatives INTEGER DEFAULT 0,
  cancelled_initiatives INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2), -- percentage

  -- Snapshot data (full copy of state at end of quarter)
  initiatives_snapshot JSONB, -- Array of all initiatives with their state
  kpis_snapshot JSONB, -- KPI targets vs actuals
  financial_snapshot JSONB, -- Financial goals vs actuals

  -- Qualitative reflections
  wins TEXT, -- What went well
  challenges TEXT, -- What didn't go well
  learnings TEXT, -- Key learnings
  adjustments TEXT, -- What we'll change
  overall_reflection TEXT, -- General notes

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, snapshot_year, snapshot_quarter)
);

-- Indexes for quarterly snapshots
CREATE INDEX IF NOT EXISTS idx_quarterly_snapshots_business ON quarterly_snapshots(business_id, snapshot_year DESC, snapshot_quarter DESC);
CREATE INDEX IF NOT EXISTS idx_quarterly_snapshots_plan ON quarterly_snapshots(strategic_plan_id);

-- ============================================================================
-- 4. Create kpi_actuals table for tracking real KPI values over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS kpi_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kpi_id TEXT NOT NULL, -- References the KPI from business_kpis or kpi library

  -- Time period
  period_year INTEGER NOT NULL,
  period_quarter TEXT CHECK (period_quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
  period_month INTEGER CHECK (period_month >= 1 AND period_month <= 12),
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'annual')),

  -- Actual value
  actual_value DECIMAL(15,2) NOT NULL,
  target_value DECIMAL(15,2), -- What was the target for this period
  variance DECIMAL(15,2), -- actual - target
  variance_percentage DECIMAL(5,2), -- (actual - target) / target * 100

  -- Notes
  notes TEXT,

  -- Metadata
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, kpi_id, period_year, period_quarter, period_month, period_type)
);

-- Indexes for KPI actuals
CREATE INDEX IF NOT EXISTS idx_kpi_actuals_business_kpi ON kpi_actuals(business_id, kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpi_actuals_period ON kpi_actuals(business_id, period_year DESC, period_quarter DESC);

-- ============================================================================
-- 5. Create annual_snapshots table for yearly reviews
-- ============================================================================

CREATE TABLE IF NOT EXISTS annual_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  strategic_plan_id UUID REFERENCES strategic_plans(id) ON DELETE CASCADE,

  -- Year identification
  snapshot_year INTEGER NOT NULL,
  snapshot_date TIMESTAMPTZ DEFAULT NOW(),

  -- Annual performance summary
  total_initiatives INTEGER DEFAULT 0,
  completed_initiatives INTEGER DEFAULT 0,
  annual_completion_rate DECIMAL(5,2),

  -- Quarterly breakdown
  q1_snapshot_id UUID REFERENCES quarterly_snapshots(id),
  q2_snapshot_id UUID REFERENCES quarterly_snapshots(id),
  q3_snapshot_id UUID REFERENCES quarterly_snapshots(id),
  q4_snapshot_id UUID REFERENCES quarterly_snapshots(id),

  -- Full year data
  full_year_snapshot JSONB, -- Complete plan state
  financial_performance JSONB, -- Revenue, profit, etc. actuals
  kpi_performance JSONB, -- All KPIs performance summary

  -- Annual reflection
  year_wins TEXT,
  year_challenges TEXT,
  year_learnings TEXT,
  strategic_adjustments TEXT,
  next_year_focus TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(business_id, snapshot_year)
);

-- Indexes for annual snapshots
CREATE INDEX IF NOT EXISTS idx_annual_snapshots_business ON annual_snapshots(business_id, snapshot_year DESC);
CREATE INDEX IF NOT EXISTS idx_annual_snapshots_plan ON annual_snapshots(strategic_plan_id);

-- ============================================================================
-- 6. Add RLS policies
-- ============================================================================

-- Strategic plans RLS
ALTER TABLE strategic_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own strategic plans" ON strategic_plans;
CREATE POLICY "Users can view their own strategic plans"
  ON strategic_plans FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own strategic plans" ON strategic_plans;
CREATE POLICY "Users can insert their own strategic plans"
  ON strategic_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own strategic plans" ON strategic_plans;
CREATE POLICY "Users can update their own strategic plans"
  ON strategic_plans FOR UPDATE
  USING (auth.uid() = user_id);

-- Quarterly snapshots RLS
ALTER TABLE quarterly_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own quarterly snapshots" ON quarterly_snapshots;
CREATE POLICY "Users can view their own quarterly snapshots"
  ON quarterly_snapshots FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own quarterly snapshots" ON quarterly_snapshots;
CREATE POLICY "Users can insert their own quarterly snapshots"
  ON quarterly_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own quarterly snapshots" ON quarterly_snapshots;
CREATE POLICY "Users can update their own quarterly snapshots"
  ON quarterly_snapshots FOR UPDATE
  USING (auth.uid() = user_id);

-- KPI actuals RLS
ALTER TABLE kpi_actuals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own kpi actuals" ON kpi_actuals;
CREATE POLICY "Users can view their own kpi actuals"
  ON kpi_actuals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own kpi actuals" ON kpi_actuals;
CREATE POLICY "Users can insert their own kpi actuals"
  ON kpi_actuals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own kpi actuals" ON kpi_actuals;
CREATE POLICY "Users can update their own kpi actuals"
  ON kpi_actuals FOR UPDATE
  USING (auth.uid() = user_id);

-- Annual snapshots RLS
ALTER TABLE annual_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own annual snapshots" ON annual_snapshots;
CREATE POLICY "Users can view their own annual snapshots"
  ON annual_snapshots FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own annual snapshots" ON annual_snapshots;
CREATE POLICY "Users can insert their own annual snapshots"
  ON annual_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own annual snapshots" ON annual_snapshots;
CREATE POLICY "Users can update their own annual snapshots"
  ON annual_snapshots FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 7. Create helper functions
-- ============================================================================

-- Function to get current quarter from date
CREATE OR REPLACE FUNCTION get_quarter_from_date(check_date DATE)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE EXTRACT(QUARTER FROM check_date)::INTEGER
    WHEN 1 THEN 'Q1'
    WHEN 2 THEN 'Q2'
    WHEN 3 THEN 'Q3'
    WHEN 4 THEN 'Q4'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get quarter date range
CREATE OR REPLACE FUNCTION get_quarter_date_range(year_val INTEGER, quarter_val TEXT)
RETURNS TABLE(start_date DATE, end_date DATE) AS $$
BEGIN
  RETURN QUERY SELECT
    CASE quarter_val
      WHEN 'Q1' THEN make_date(year_val, 1, 1)
      WHEN 'Q2' THEN make_date(year_val, 4, 1)
      WHEN 'Q3' THEN make_date(year_val, 7, 1)
      WHEN 'Q4' THEN make_date(year_val, 10, 1)
    END AS start_date,
    CASE quarter_val
      WHEN 'Q1' THEN make_date(year_val, 3, 31)
      WHEN 'Q2' THEN make_date(year_val, 6, 30)
      WHEN 'Q3' THEN make_date(year_val, 9, 30)
      WHEN 'Q4' THEN make_date(year_val, 12, 31)
    END AS end_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- DONE!
-- ============================================================================

-- Summary:
-- ✅ Added tracking fields to strategic_plans
-- ✅ Updated strategic_initiatives with status and progress
-- ✅ Created quarterly_snapshots for historical data
-- ✅ Created kpi_actuals for tracking real values
-- ✅ Created annual_snapshots for yearly reviews
-- ✅ Added RLS policies for all new tables
-- ✅ Created helper functions for quarter calculations
