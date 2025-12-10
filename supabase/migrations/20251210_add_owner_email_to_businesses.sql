-- Add owner_email column to businesses table
-- This column stores the email address of the business owner for lookup purposes
-- (e.g., when owner_id is not yet set because user hasn't registered)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'owner_email'
  ) THEN
    ALTER TABLE businesses ADD COLUMN owner_email TEXT;
  END IF;
END $$;

-- Create index for faster lookups by owner_email
CREATE INDEX IF NOT EXISTS idx_businesses_owner_email ON businesses(owner_email);

COMMENT ON COLUMN businesses.owner_email IS 'Email address of the business owner - used for invitation tracking and user lookup';
