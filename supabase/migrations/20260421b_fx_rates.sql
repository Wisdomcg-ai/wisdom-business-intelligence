-- Phase 34 Iteration 34.0: Foreign-exchange rate reference table
--
-- Supports manual monthly-average and closing-spot rates for multi-currency
-- consolidation (initially HKD/AUD for IICT Group Limited). Currency pair
-- uses the slash separator ('HKD/AUD') enforced by app-layer regex — NOT
-- underscore. The historical underscore form from earlier drafts is obsolete
-- (see POST-RESEARCH CORRECTIONS in 34-RESEARCH.md).
--
-- RLS trifecta matches the other three Phase 34 tables: coach_all +
-- super_admin_all + service_role. We DELIBERATELY do not ship a
-- broad "all authenticated users can SELECT" policy — every Phase 34
-- read path uses the service-role client which bypasses RLS, so opening
-- SELECT to every signed-in user would widen the attack surface without
-- functional benefit (checker revision #1 fix). See 34-00a-foundation-PLAN.md
-- Task 3 for full rationale.

CREATE TABLE IF NOT EXISTS fx_rates (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_pair   text            NOT NULL,       -- 'HKD/AUD' (slash separator)
  rate_type       text            NOT NULL CHECK (rate_type IN ('monthly_average', 'closing_spot')),
  period          date            NOT NULL,       -- first-of-month for monthly_average; month-end for closing_spot
  rate            numeric         NOT NULL,       -- e.g. 0.192500; numeric (project convention — no fixed precision)
  source          text            NOT NULL DEFAULT 'manual'
                                  CHECK (source IN ('manual', 'rba')),
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now(),
  UNIQUE (currency_pair, rate_type, period)
);

CREATE INDEX IF NOT EXISTS fx_rates_pair_period_idx
  ON fx_rates (currency_pair, period);

ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS trifecta — matches consolidation_groups / members / rules.
-- Coaches and super_admins have full write access so the admin FX
-- entry UI (plan 00f) can operate via the route-handler client.
-- Intentional: NO broad-SELECT-for-signed-in-users policy (see header).
-- ============================================================

CREATE POLICY "fx_rates_coach_all" ON fx_rates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM system_roles
      WHERE user_id = auth.uid() AND role = 'coach'
    )
  );

CREATE POLICY "fx_rates_super_admin_all" ON fx_rates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM system_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "fx_rates_service_role" ON fx_rates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_fx_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fx_rates_updated_at
  BEFORE UPDATE ON fx_rates
  FOR EACH ROW EXECUTE FUNCTION update_fx_rates_updated_at();
