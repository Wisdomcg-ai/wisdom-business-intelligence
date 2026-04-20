-- Add invitation tracking fields to businesses table
-- This enables "create now, invite later" workflow

-- Add columns to track invitation status
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS invitation_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS temp_password TEXT; -- Store temporarily until invitation sent

-- Add index for quick filtering of pending invitations
CREATE INDEX IF NOT EXISTS idx_businesses_invitation_pending
ON businesses(invitation_sent) WHERE invitation_sent = FALSE;

-- Comment for clarity
COMMENT ON COLUMN businesses.invitation_sent IS 'Whether login credentials have been sent to the client';
COMMENT ON COLUMN businesses.invitation_sent_at IS 'Timestamp when invitation email was sent';
COMMENT ON COLUMN businesses.temp_password IS 'Temporary password stored until invitation is sent (cleared after sending)';
