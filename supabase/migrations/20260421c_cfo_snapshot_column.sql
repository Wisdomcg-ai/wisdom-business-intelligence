-- Phase 34 Iteration 34.0: CFO report-status snapshot columns (Phase 35 hook)
--
-- Adds two columns to the existing cfo_report_status table so Phase 35's
-- approval workflow can freeze the consolidated (or single-entity) report
-- payload at approval time. No behaviour change in Phase 34 — the columns
-- are dormant until Phase 35 wires POST /api/cfo/report-status to populate
-- them when status transitions to 'approved'.
--
-- Pattern: idempotent ADD COLUMN IF NOT EXISTS per PATTERNS.md § 34-PATTERNS.md
-- and supabase/migrations/20260418b_cashflow_settings_tweaks.sql.
--
-- RLS carries over from the existing cfo_report_status policies — no new
-- policies needed; ALTER TABLE ADD COLUMN does not touch existing RLS.

ALTER TABLE cfo_report_status
  ADD COLUMN IF NOT EXISTS snapshot_data      jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_taken_at  timestamptz;

COMMENT ON COLUMN cfo_report_status.snapshot_data IS
  'Phase 35 approval hook: full consolidated report payload frozen at approval time. Written by POST /api/cfo/report-status when status transitions to approved.';
COMMENT ON COLUMN cfo_report_status.snapshot_taken_at IS
  'Timestamp the snapshot_data column was populated. NULL when no snapshot exists.';
