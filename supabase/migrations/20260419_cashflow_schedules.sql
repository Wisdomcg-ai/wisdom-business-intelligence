-- Phase 28.3: Cashflow Schedule + Distribution Model
-- Adds BasePeriods[12] array storage and seeds AU-standard payment schedules.
-- The existing cashflow_account_profiles table (from 28.1) now becomes active
-- and is wired into the engine via Type 1-5 lookup.

-- ============================================================================
-- cashflow_schedules — named BasePeriods[12] arrays
-- ============================================================================

CREATE TABLE IF NOT EXISTS cashflow_schedules (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid        REFERENCES businesses(id) ON DELETE CASCADE,  -- NULL = system schedule
  name           text        NOT NULL,
  base_periods   jsonb       NOT NULL,  -- integer[12] array
  is_system      boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

CREATE INDEX IF NOT EXISTS cashflow_schedules_business_idx
  ON cashflow_schedules (business_id);

ALTER TABLE cashflow_schedules ENABLE ROW LEVEL SECURITY;

-- Everyone can read system schedules (business_id IS NULL)
CREATE POLICY "cashflow_schedules_system_read" ON cashflow_schedules
  FOR SELECT USING (is_system = true);

-- Business owners + coaches can read/write their own custom schedules
CREATE POLICY "cashflow_schedules_owner_all" ON cashflow_schedules
  FOR ALL USING (
    business_id IS NOT NULL AND business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "cashflow_schedules_coach_all" ON cashflow_schedules
  FOR ALL USING (
    business_id IS NOT NULL AND business_id IN (
      SELECT id FROM businesses WHERE assigned_coach_id = auth.uid()
    )
  );

CREATE POLICY "cashflow_schedules_service_role" ON cashflow_schedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Seed AU-standard schedules
-- ============================================================================

INSERT INTO cashflow_schedules (name, base_periods, is_system, business_id) VALUES
  ('monthly',                   '[1,2,3,4,5,6,7,8,9,10,11,12]',  true, NULL),
  ('quarterly_bas_au',          '[4,4,4,7,7,7,10,10,10,2,2,2]',  true, NULL),
  ('quarterly_super_au',        '[4,4,4,7,7,7,10,10,10,1,1,1]',  true, NULL),
  ('quarterly_payg_instalment', '[4,4,4,7,7,7,10,10,10,2,2,2]',  true, NULL),
  ('quarterly_feb_may_aug_nov', '[5,5,5,8,8,8,11,11,11,2,2,2]',  true, NULL),
  ('annual_aug',                '[8,8,8,8,8,8,8,8,8,8,8,8]',     true, NULL)
ON CONFLICT (business_id, name) DO NOTHING;
