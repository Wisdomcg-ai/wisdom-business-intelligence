-- Phase 34 Iteration 34.0: Multi-entity consolidation foundation schema
-- Tables:
--   consolidation_groups            — defines a consolidation (e.g. "Dragon Consolidation")
--   consolidation_group_members     — member Xero orgs, one row per entity in the group
--   consolidation_elimination_rules — intercompany elimination rules per group
--
-- RLS trifecta (coach_all + super_admin_all + service_role) on every table —
-- copied verbatim from supabase/migrations/20260420_cfo_dashboard.sql.
-- Members + rules scope via group_id → consolidation_groups.business_id → coach assignment.

-- ============================================================
-- 1. consolidation_groups
-- ============================================================

CREATE TABLE IF NOT EXISTS consolidation_groups (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text        NOT NULL,
  business_id            uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  presentation_currency  text        NOT NULL DEFAULT 'AUD',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id)  -- one group per umbrella business
);

CREATE INDEX IF NOT EXISTS consolidation_groups_business_idx
  ON consolidation_groups (business_id);

ALTER TABLE consolidation_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consolidation_groups_coach_all" ON consolidation_groups
  FOR ALL USING (
    business_id IN (
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "consolidation_groups_super_admin_all" ON consolidation_groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "consolidation_groups_service_role" ON consolidation_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. consolidation_group_members
-- ============================================================

CREATE TABLE IF NOT EXISTS consolidation_group_members (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              uuid        NOT NULL REFERENCES consolidation_groups(id) ON DELETE CASCADE,
  source_business_id    uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  display_name          text        NOT NULL,
  display_order         int         NOT NULL DEFAULT 0,
  functional_currency   text        NOT NULL DEFAULT 'AUD',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, source_business_id)
);

CREATE INDEX IF NOT EXISTS consolidation_group_members_group_idx
  ON consolidation_group_members (group_id, display_order);

ALTER TABLE consolidation_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consolidation_group_members_coach_all" ON consolidation_group_members
  FOR ALL USING (
    group_id IN (
      SELECT id FROM consolidation_groups
      WHERE business_id IN (
        SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
      )
    )
  );

CREATE POLICY "consolidation_group_members_super_admin_all" ON consolidation_group_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "consolidation_group_members_service_role" ON consolidation_group_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 3. consolidation_elimination_rules
-- ============================================================
--
-- rule_type CHECK includes 'intercompany_loan' on day one — Iteration 34.1
-- ships BS intercompany loan eliminations and extending a CHECK constraint
-- is a breaking migration, so we define the full enum up-front.

CREATE TABLE IF NOT EXISTS consolidation_elimination_rules (
  id                                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                           uuid        NOT NULL REFERENCES consolidation_groups(id) ON DELETE CASCADE,
  rule_type                          text        NOT NULL
                                                 CHECK (rule_type IN ('account_pair', 'account_category', 'intercompany_loan')),
  entity_a_business_id               uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_a_account_code              text,
  entity_a_account_name_pattern      text,
  entity_b_business_id               uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_b_account_code              text,
  entity_b_account_name_pattern      text,
  direction                          text        NOT NULL DEFAULT 'bidirectional'
                                                 CHECK (direction IN ('bidirectional', 'entity_a_eliminates', 'entity_b_eliminates')),
  description                        text        NOT NULL,
  active                             boolean     NOT NULL DEFAULT true,
  created_at                         timestamptz NOT NULL DEFAULT now(),
  updated_at                         timestamptz NOT NULL DEFAULT now(),

  -- Must specify at least one matcher per side
  CHECK (entity_a_account_code IS NOT NULL OR entity_a_account_name_pattern IS NOT NULL),
  CHECK (entity_b_account_code IS NOT NULL OR entity_b_account_name_pattern IS NOT NULL),

  -- Guard against regex DoS: patterns capped below 256 chars
  CHECK (length(coalesce(entity_a_account_name_pattern, '')) < 256),
  CHECK (length(coalesce(entity_b_account_name_pattern, '')) < 256)
);

CREATE INDEX IF NOT EXISTS consolidation_elimination_rules_group_idx
  ON consolidation_elimination_rules (group_id, active);

ALTER TABLE consolidation_elimination_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consolidation_elimination_rules_coach_all" ON consolidation_elimination_rules
  FOR ALL USING (
    group_id IN (
      SELECT id FROM consolidation_groups
      WHERE business_id IN (
        SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
      )
    )
  );

CREATE POLICY "consolidation_elimination_rules_super_admin_all" ON consolidation_elimination_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "consolidation_elimination_rules_service_role" ON consolidation_elimination_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 4. updated_at trigger (shared across all three tables)
-- ============================================================

CREATE OR REPLACE FUNCTION update_consolidation_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consolidation_groups_updated_at
  BEFORE UPDATE ON consolidation_groups
  FOR EACH ROW EXECUTE FUNCTION update_consolidation_groups_updated_at();

CREATE TRIGGER consolidation_group_members_updated_at
  BEFORE UPDATE ON consolidation_group_members
  FOR EACH ROW EXECUTE FUNCTION update_consolidation_groups_updated_at();

CREATE TRIGGER consolidation_elimination_rules_updated_at
  BEFORE UPDATE ON consolidation_elimination_rules
  FOR EACH ROW EXECUTE FUNCTION update_consolidation_groups_updated_at();
