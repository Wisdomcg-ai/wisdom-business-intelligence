-- Temporary debug logging table — used to diagnose sync-xero 500s
-- Will be dropped once the issue is resolved.

CREATE TABLE IF NOT EXISTS debug_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  route TEXT NOT NULL,
  stage TEXT,
  level TEXT DEFAULT 'info',           -- info | warn | error
  user_id UUID,
  business_id UUID,
  message TEXT,
  data JSONB,
  referer TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_debug_log_created ON debug_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debug_log_route ON debug_log(route, created_at DESC);

-- RLS: service role only (this is a debug table, no user access needed)
ALTER TABLE debug_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debug_log_service_role" ON debug_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
