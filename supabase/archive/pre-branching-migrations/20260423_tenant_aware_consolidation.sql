-- Phase 34 architectural pivot: tenant-aware consolidation
--
-- Shifts the consolidation model from "multiple businesses linked by group"
-- to "one business, multiple Xero tenants" to match user's intended workflow.
--
-- 1. Add tenant_id to xero_pl_lines + xero_accounts, backfill from single connection
-- 2. Extend xero_connections with display/consolidation metadata
-- 3. Rescope consolidation_elimination_rules to (business_id, tenant_a_id, tenant_b_id)
-- 4. Drop consolidation_groups + consolidation_group_members (redundant)

BEGIN;

-- ============================================================
-- Step 1: tenant_id on data tables
-- ============================================================

ALTER TABLE xero_pl_lines ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE xero_accounts ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Backfill xero_pl_lines.tenant_id from each business's unique active connection
-- Works only when a business has exactly one active connection (current state).
-- If a business already has multiple active connections at migration time, the
-- backfill leaves tenant_id NULL for those rows and admin must re-sync.
UPDATE xero_pl_lines pl
SET tenant_id = c.tenant_id
FROM (
  SELECT business_id, tenant_id
  FROM xero_connections
  WHERE is_active = true
) c
WHERE pl.business_id = c.business_id
  AND pl.tenant_id IS NULL
  AND (SELECT COUNT(*) FROM xero_connections xc WHERE xc.business_id = pl.business_id AND xc.is_active = true) = 1;

UPDATE xero_accounts a
SET tenant_id = c.tenant_id
FROM (
  SELECT business_id, tenant_id
  FROM xero_connections
  WHERE is_active = true
) c
WHERE a.business_id = c.business_id
  AND a.tenant_id IS NULL
  AND (SELECT COUNT(*) FROM xero_connections xc WHERE xc.business_id = a.business_id AND xc.is_active = true) = 1;

-- Indexes for tenant-aware queries
CREATE INDEX IF NOT EXISTS xero_pl_lines_business_tenant_idx
  ON xero_pl_lines (business_id, tenant_id);
CREATE INDEX IF NOT EXISTS xero_accounts_business_tenant_idx
  ON xero_accounts (business_id, tenant_id);

-- Upgrade xero_accounts uniqueness: same account_id can appear in multiple tenants
-- Drop old unique constraint (was business_id, xero_account_id)
ALTER TABLE xero_accounts DROP CONSTRAINT IF EXISTS xero_accounts_business_id_xero_account_id_key;
-- Re-add including tenant_id; NULL tenant_id is treated as distinct by PG so pre-tenant rows are not duplicated
CREATE UNIQUE INDEX IF NOT EXISTS xero_accounts_business_tenant_account_key
  ON xero_accounts (business_id, tenant_id, xero_account_id);

-- ============================================================
-- Step 2: xero_connections — display + consolidation metadata
-- ============================================================

ALTER TABLE xero_connections
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS functional_currency TEXT DEFAULT 'AUD',
  ADD COLUMN IF NOT EXISTS include_in_consolidation BOOLEAN DEFAULT true;

-- Initialise display_name from existing tenant_name for existing rows
UPDATE xero_connections
SET display_name = COALESCE(tenant_name, 'Xero ' || SUBSTRING(tenant_id FROM 1 FOR 8))
WHERE display_name IS NULL;

-- ============================================================
-- Step 3: consolidation_elimination_rules — rescope to tenant
-- ============================================================
-- Drop RLS policies that reference group_id, drop/rebuild column set,
-- recreate policies using business_id.

DELETE FROM consolidation_elimination_rules;  -- safe: seed skipped earlier

DROP POLICY IF EXISTS consolidation_elimination_rules_coach_all ON consolidation_elimination_rules;
DROP POLICY IF EXISTS consolidation_elimination_rules_super_admin_all ON consolidation_elimination_rules;
DROP POLICY IF EXISTS consolidation_elimination_rules_service_role ON consolidation_elimination_rules;

ALTER TABLE consolidation_elimination_rules
  DROP COLUMN IF EXISTS group_id CASCADE,
  DROP COLUMN IF EXISTS entity_a_business_id CASCADE,
  DROP COLUMN IF EXISTS entity_b_business_id CASCADE,
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tenant_a_id TEXT,
  ADD COLUMN IF NOT EXISTS tenant_b_id TEXT;

CREATE INDEX IF NOT EXISTS consolidation_elimination_rules_business_idx
  ON consolidation_elimination_rules (business_id);

-- NOT NULL after we're sure there are no orphan rows
ALTER TABLE consolidation_elimination_rules ALTER COLUMN business_id SET NOT NULL;

-- Re-create RLS policies with the business-scoped shape
-- Coach can CRUD rules for businesses they're assigned to
CREATE POLICY "consolidation_elimination_rules_coach_all" ON consolidation_elimination_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = consolidation_elimination_rules.business_id
        AND b.assigned_coach_id = auth.uid()
    )
  );

-- Super admin can CRUD all rules
CREATE POLICY "consolidation_elimination_rules_super_admin_all" ON consolidation_elimination_rules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM system_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- Service role bypasses all RLS (used by API routes with service_role client)
CREATE POLICY "consolidation_elimination_rules_service_role" ON consolidation_elimination_rules
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Step 4: Drop redundant tables
-- ============================================================

DROP TABLE IF EXISTS consolidation_group_members;
DROP TABLE IF EXISTS consolidation_groups;

COMMIT;
