-- Phase 23: Report Template System
-- Named, saveable report templates per client

CREATE TABLE IF NOT EXISTS report_templates (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id text        NOT NULL,
  name        text        NOT NULL,
  is_default  boolean     NOT NULL DEFAULT false,
  sections    jsonb       NOT NULL DEFAULT '{}',
  column_settings jsonb   NOT NULL DEFAULT '{}',
  budget_forecast_id uuid REFERENCES financial_forecasts(id) ON DELETE SET NULL,
  subscription_account_codes text[] NOT NULL DEFAULT '{}',
  wages_account_names        text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_templates_business_id_idx
  ON report_templates (business_id);

-- Ensure only one default per business
CREATE UNIQUE INDEX IF NOT EXISTS report_templates_business_default_idx
  ON report_templates (business_id)
  WHERE is_default = true;

-- RLS
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;

-- Business owner access
CREATE POLICY "report_templates_owner_select" ON report_templates
  FOR SELECT USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "report_templates_owner_insert" ON report_templates
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "report_templates_owner_update" ON report_templates
  FOR UPDATE USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "report_templates_owner_delete" ON report_templates
  FOR DELETE USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
      UNION
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

-- Coach access
CREATE POLICY "report_templates_coach_select" ON report_templates
  FOR SELECT USING (
    business_id IN (
      SELECT b.id FROM businesses b
      JOIN coach_clients cc ON cc.client_id = b.owner_id
      WHERE cc.coach_id = auth.uid()
    )
  );

CREATE POLICY "report_templates_coach_insert" ON report_templates
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT b.id FROM businesses b
      JOIN coach_clients cc ON cc.client_id = b.owner_id
      WHERE cc.coach_id = auth.uid()
    )
  );

CREATE POLICY "report_templates_coach_update" ON report_templates
  FOR UPDATE USING (
    business_id IN (
      SELECT b.id FROM businesses b
      JOIN coach_clients cc ON cc.client_id = b.owner_id
      WHERE cc.coach_id = auth.uid()
    )
  );

CREATE POLICY "report_templates_coach_delete" ON report_templates
  FOR DELETE USING (
    business_id IN (
      SELECT b.id FROM businesses b
      JOIN coach_clients cc ON cc.client_id = b.owner_id
      WHERE cc.coach_id = auth.uid()
    )
  );

-- Service role bypass
CREATE POLICY "report_templates_service_role" ON report_templates
  USING (auth.role() = 'service_role');

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_report_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_templates_updated_at
  BEFORE UPDATE ON report_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_report_templates_updated_at();
