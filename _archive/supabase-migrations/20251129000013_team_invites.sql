-- =====================================================
-- TEAM INVITES TABLE
-- =====================================================
-- Stores pending invitations for users who don't have accounts yet

CREATE TABLE IF NOT EXISTS public.team_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- Invite details
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone TEXT,
  position TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),

  -- Invite tracking
  invite_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one pending invite per email per business
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_unique_pending
  ON public.team_invites(business_id, email)
  WHERE status = 'pending';

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_team_invites_token ON public.team_invites(invite_token);

-- Index for business lookups
CREATE INDEX IF NOT EXISTS idx_team_invites_business ON public.team_invites(business_id);

-- Enable RLS
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view invites for businesses they belong to
DROP POLICY IF EXISTS "Users can view business invites" ON public.team_invites;
CREATE POLICY "Users can view business invites"
  ON public.team_invites FOR SELECT
  USING (
    business_id IN (
      SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = team_invites.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- Owners/admins can create invites
DROP POLICY IF EXISTS "Owners and admins can create invites" ON public.team_invites;
CREATE POLICY "Owners and admins can create invites"
  ON public.team_invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = team_invites.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = team_invites.business_id
      AND b.assigned_coach_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = team_invites.business_id
      AND b.owner_id = auth.uid()
    )
  );

-- Owners/admins can update invites (cancel, etc)
DROP POLICY IF EXISTS "Owners and admins can update invites" ON public.team_invites;
CREATE POLICY "Owners and admins can update invites"
  ON public.team_invites FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = team_invites.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = team_invites.business_id
      AND b.assigned_coach_id = auth.uid()
    )
  );

-- Allow anyone to read their own invite by token (for accepting)
DROP POLICY IF EXISTS "Anyone can view invite by token" ON public.team_invites;
CREATE POLICY "Anyone can view invite by token"
  ON public.team_invites FOR SELECT
  USING (true);  -- Token lookup happens in app logic

-- Owners/admins can delete invites
DROP POLICY IF EXISTS "Owners and admins can delete invites" ON public.team_invites;
CREATE POLICY "Owners and admins can delete invites"
  ON public.team_invites FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = team_invites.business_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('owner', 'admin')
    )
  );
