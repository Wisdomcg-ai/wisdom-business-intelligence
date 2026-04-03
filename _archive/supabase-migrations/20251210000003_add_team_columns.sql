-- Add missing columns for team management

-- Add section_permissions to team_invites
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_invites' AND column_name = 'section_permissions'
  ) THEN
    ALTER TABLE team_invites ADD COLUMN section_permissions JSONB DEFAULT '{}';
  END IF;
END $$;

-- Add section_permissions to business_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_users' AND column_name = 'section_permissions'
  ) THEN
    ALTER TABLE business_users ADD COLUMN section_permissions JSONB DEFAULT '{}';
  END IF;
END $$;

-- Add invited_by to business_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_users' AND column_name = 'invited_by'
  ) THEN
    ALTER TABLE business_users ADD COLUMN invited_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Add invited_at to business_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_users' AND column_name = 'invited_at'
  ) THEN
    ALTER TABLE business_users ADD COLUMN invited_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Add status to business_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_users' AND column_name = 'status'
  ) THEN
    ALTER TABLE business_users ADD COLUMN status TEXT DEFAULT 'active';
  END IF;
END $$;

-- Add weekly_review_enabled to business_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_users' AND column_name = 'weekly_review_enabled'
  ) THEN
    ALTER TABLE business_users ADD COLUMN weekly_review_enabled BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN team_invites.section_permissions IS 'JSONB of section permissions for the invited user';
COMMENT ON COLUMN business_users.section_permissions IS 'JSONB of section permissions for the team member';
COMMENT ON COLUMN business_users.invited_by IS 'User ID of who invited this team member';
COMMENT ON COLUMN business_users.invited_at IS 'When the team member was invited';
COMMENT ON COLUMN business_users.status IS 'active, pending, or inactive';
COMMENT ON COLUMN business_users.weekly_review_enabled IS 'Whether this user participates in weekly reviews';
