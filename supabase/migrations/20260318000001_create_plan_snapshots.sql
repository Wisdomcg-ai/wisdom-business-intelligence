-- Plan Snapshots: versioned snapshots of the One Page Plan
-- Created after Goals Wizard completion and before/after quarterly review sync

CREATE TABLE IF NOT EXISTS public.plan_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN (
    'goals_wizard_complete',
    'quarterly_review_pre_sync',
    'quarterly_review_post_sync'
  )),
  quarter TEXT,
  year INTEGER,
  quarterly_review_id UUID,
  plan_data JSONB NOT NULL,
  label TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, version_number)
);

-- Enable RLS
ALTER TABLE public.plan_snapshots ENABLE ROW LEVEL SECURITY;

-- Owner access: users can view/insert their own snapshots
CREATE POLICY "Users can view own plan snapshots"
  ON public.plan_snapshots FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own plan snapshots"
  ON public.plan_snapshots FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Coach access: coaches can view their clients' snapshots
CREATE POLICY "Coaches can view client plan snapshots"
  ON public.plan_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = plan_snapshots.business_id::text
        AND b.assigned_coach_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id::text = plan_snapshots.business_id::text
        AND b.assigned_coach_id = auth.uid()
    )
  );

-- Coach can insert snapshots for their clients (during quarterly review)
CREATE POLICY "Coaches can insert client plan snapshots"
  ON public.plan_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = plan_snapshots.business_id::text
        AND b.assigned_coach_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.business_profiles bp
      JOIN public.businesses b ON b.id = bp.business_id
      WHERE bp.id::text = plan_snapshots.business_id::text
        AND b.assigned_coach_id = auth.uid()
    )
  );

-- Super admin access
CREATE POLICY "Super admins can view all plan snapshots"
  ON public.plan_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can insert plan snapshots"
  ON public.plan_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.system_roles sr
      WHERE sr.user_id = auth.uid() AND sr.role = 'super_admin'
    )
  );

-- No UPDATE or DELETE policies — snapshots are append-only

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_plan_snapshots_business_id ON public.plan_snapshots (business_id);
CREATE INDEX IF NOT EXISTS idx_plan_snapshots_business_version ON public.plan_snapshots (business_id, version_number DESC);
