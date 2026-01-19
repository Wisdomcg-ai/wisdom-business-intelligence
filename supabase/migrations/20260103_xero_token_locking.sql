-- Add token_refreshing_at column for distributed locking of token refresh operations
-- This prevents race conditions when multiple processes try to refresh the same token

ALTER TABLE xero_connections
ADD COLUMN IF NOT EXISTS token_refreshing_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for efficient lock queries
CREATE INDEX IF NOT EXISTS idx_xero_connections_token_refreshing
ON xero_connections (id, token_refreshing_at)
WHERE token_refreshing_at IS NOT NULL;

-- Add comment explaining the column's purpose
COMMENT ON COLUMN xero_connections.token_refreshing_at IS
  'Timestamp when a token refresh started. Used as a distributed lock to prevent concurrent refreshes. NULL means no refresh in progress.';
