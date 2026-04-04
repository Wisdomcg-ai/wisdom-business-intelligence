-- =====================================================
-- PENDING XERO CONNECTIONS
-- Temporary storage for multi-tenant OAuth selection
-- =====================================================
-- When a user authorises Xero and has access to multiple
-- organisations, tokens are stored here temporarily while
-- they select which org to connect. Records expire after
-- 10 minutes and are cleaned up on read.
-- =====================================================

CREATE TABLE IF NOT EXISTS pending_xero_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  user_id UUID NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  tenants JSONB NOT NULL DEFAULT '[]',
  return_to TEXT DEFAULT '/integrations',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS — accessed only via service key from API routes
-- No foreign keys — this is ephemeral data with 10-minute TTL

COMMENT ON TABLE pending_xero_connections IS 'Temporary storage for Xero multi-tenant selection. Records expire after 10 minutes.';
