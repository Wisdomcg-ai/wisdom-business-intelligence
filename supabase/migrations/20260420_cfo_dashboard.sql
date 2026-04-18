-- Phase 33: CFO Multi-Client Dashboard
-- Adds flag to mark CFO clients + table to track per-month report delivery state.
-- Coach-only feature; clients never see this data.

-- ============================================================================
-- 1. Flag CFO clients on the businesses table
-- ============================================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS is_cfo_client boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS businesses_cfo_client_idx
  ON businesses (is_cfo_client) WHERE is_cfo_client = true;

-- ============================================================================
-- 2. Per-month report status tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS cfo_report_status (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period_month          date        NOT NULL,  -- first day of the report month, e.g. '2026-03-01'
  status                text        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'ready_for_review', 'approved', 'sent')),
  commentary_approved   boolean     NOT NULL DEFAULT false,
  approved_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at           timestamptz,
  sent_at               timestamptz,
  manual_status_override text,      -- allows coach to override auto "On Track/Watch/Alert" badge
  coach_notes           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, period_month)
);

CREATE INDEX IF NOT EXISTS cfo_report_status_business_idx
  ON cfo_report_status (business_id, period_month DESC);

CREATE INDEX IF NOT EXISTS cfo_report_status_period_idx
  ON cfo_report_status (period_month, status);

-- ============================================================================
-- RLS (coach + super_admin only — no owner access, this is a coach tool)
-- ============================================================================

ALTER TABLE cfo_report_status ENABLE ROW LEVEL SECURITY;

-- Coach sees report status for businesses they're assigned to
CREATE POLICY "cfo_report_status_coach_all" ON cfo_report_status
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
    )
  );

-- Super admin sees everything
CREATE POLICY "cfo_report_status_super_admin_all" ON cfo_report_status
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Service role bypass
CREATE POLICY "cfo_report_status_service_role" ON cfo_report_status
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_cfo_report_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cfo_report_status_updated_at
  BEFORE UPDATE ON cfo_report_status
  FOR EACH ROW EXECUTE FUNCTION update_cfo_report_status_updated_at();
