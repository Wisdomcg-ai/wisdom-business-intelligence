-- Phase 12: Change tracking — flag forecast edits between coaching sessions
-- Adds last_reviewed_at to track when coach last reviewed the forecast

ALTER TABLE financial_forecasts
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

COMMENT ON COLUMN financial_forecasts.last_reviewed_at IS
  'When the coach last reviewed this forecast. If updated_at > last_reviewed_at, the client has made changes.';
