-- Add missing columns to businesses table for client management
-- Run this migration to ensure all required columns exist

-- Add owner_email column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'owner_email'
  ) THEN
    ALTER TABLE businesses ADD COLUMN owner_email TEXT;
  END IF;
END $$;

-- Add owner_name column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'owner_name'
  ) THEN
    ALTER TABLE businesses ADD COLUMN owner_name TEXT;
  END IF;
END $$;

-- Add invitation_sent column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'invitation_sent'
  ) THEN
    ALTER TABLE businesses ADD COLUMN invitation_sent BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add invitation_sent_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'invitation_sent_at'
  ) THEN
    ALTER TABLE businesses ADD COLUMN invitation_sent_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add temp_password column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'temp_password'
  ) THEN
    ALTER TABLE businesses ADD COLUMN temp_password TEXT;
  END IF;
END $$;

-- Add business_name column (alias for name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'business_name'
  ) THEN
    ALTER TABLE businesses ADD COLUMN business_name TEXT;
  END IF;
END $$;

-- Add enabled_modules column (JSONB for permissions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'enabled_modules'
  ) THEN
    ALTER TABLE businesses ADD COLUMN enabled_modules JSONB DEFAULT '{}';
  END IF;
END $$;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_businesses_owner_email ON businesses(owner_email);
CREATE INDEX IF NOT EXISTS idx_businesses_invitation_pending ON businesses(invitation_sent) WHERE invitation_sent = FALSE;

-- Add comments
COMMENT ON COLUMN businesses.owner_email IS 'Email address of the business owner';
COMMENT ON COLUMN businesses.owner_name IS 'Full name of the business owner';
COMMENT ON COLUMN businesses.invitation_sent IS 'Whether login credentials have been sent';
COMMENT ON COLUMN businesses.temp_password IS 'Temporary password stored until invitation is sent';
