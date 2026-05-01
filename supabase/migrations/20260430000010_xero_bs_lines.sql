-- Phase 44.2 Plan 06C — Balance Sheet line storage.
--
-- Mirrors xero_pl_lines structure (post-06A) with point-in-time semantics:
--   period_month date (P&L) → balance_date date (BS)
--   amount       numeric (P&L) → balance       numeric (BS)
--
-- Same canonical-identity discipline as 06A:
--   - account_id uuid NOT NULL    : Xero AccountID GUID, canonical identity (never mutates
--                                   when accountants rename / recode an account).
--   - account_code text NULL      : user-facing Xero Code (informational only).
--   - basis text NOT NULL DEFAULT 'accruals' CHECK ('accruals'|'cash')
--                                  : Calxa best practice — every cached row is stamped
--                                    with the basis it was computed under, so future
--                                    cash-basis variants can never silently compare
--                                    against accruals data.
--   - business_id uuid NOT NULL FK → business_profiles(id) ON DELETE RESTRICT
--                                  : enforces dual-ID resolution (must be a profile_id,
--                                    not a businesses.id), ON DELETE RESTRICT protects
--                                    historical audit trail.
--
-- BS-specific:
--   - balance_date date NOT NULL  : single point-in-time as-of date (typically month-end).
--                                   Per Calxa-via-Cowork research, Reports/BalanceSheet has
--                                   the same documented periods-parameter date-arithmetic
--                                   bug as Reports/ProfitAndLoss; we avoid it the same way
--                                   — single-period queries only, one per month-end.
--   - account_type CHECK ('asset'|'liability'|'equity')
--                                  : 3 top-level classifications (vs P&L's 5). Sub-section
--                                    labels (bank, current_asset, retained_earnings, etc.)
--                                    live in xero_accounts.xero_class for richer queries.
--
-- Natural key: (business_id, tenant_id, account_id, balance_date).
--
-- Idempotent: every statement guarded by IF NOT EXISTS / DO-block existence check, so
-- safe to re-run.

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xero_bs_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL,
  tenant_id     text NOT NULL DEFAULT '',
  account_id    uuid NOT NULL,
  account_code  text NULL,
  account_name  text NOT NULL,
  account_type  text NOT NULL CHECK (account_type IN ('asset','liability','equity')),
  section       text NULL,
  balance_date  date NOT NULL,
  balance       numeric(18,2) NOT NULL DEFAULT 0,
  basis         text NOT NULL DEFAULT 'accruals' CHECK (basis IN ('accruals','cash')),
  source        text NOT NULL DEFAULT 'xero',
  notes         text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. FK to business_profiles (idempotent — pg has no native ADD CONSTRAINT IF NOT EXISTS)
--
-- Because the table is newly created (no pre-existing rows), no pre-flight orphan check
-- is needed (cf. xero_pl_lines_business_id_fk migration 000002 which had to validate
-- 6,456 historical rows first).
-- ----------------------------------------------------------------------------
DO $addfk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xero_bs_lines_business_id_fk'
  ) THEN
    ALTER TABLE xero_bs_lines
      ADD CONSTRAINT xero_bs_lines_business_id_fk
        FOREIGN KEY (business_id)
        REFERENCES business_profiles(id)
        ON DELETE RESTRICT;
  END IF;
END
$addfk$;

-- ----------------------------------------------------------------------------
-- 3. Natural key: (business_id, tenant_id, account_id, balance_date)
-- ----------------------------------------------------------------------------
DO $addnk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xero_bs_lines_natural_key_uniq'
  ) THEN
    ALTER TABLE xero_bs_lines
      ADD CONSTRAINT xero_bs_lines_natural_key_uniq
        UNIQUE (business_id, tenant_id, account_id, balance_date);
  END IF;
END
$addnk$;

-- ----------------------------------------------------------------------------
-- 4. Indexes for common query patterns
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS xero_bs_lines_business_idx     ON xero_bs_lines (business_id);
CREATE INDEX IF NOT EXISTS xero_bs_lines_balance_date_idx ON xero_bs_lines (balance_date);
CREATE INDEX IF NOT EXISTS xero_bs_lines_account_id_idx   ON xero_bs_lines (account_id);

-- ----------------------------------------------------------------------------
-- 5. RLS — mirror xero_pl_lines policies verbatim
--
-- Uses the same helper functions (auth_is_super_admin + auth_get_accessible_business_ids)
-- that protect xero_pl_lines per migration 20260428000006_xero_pl_lines_rls.sql.
-- super_admin sees everything; other authenticated users see rows for businesses they
-- can access. service_role bypasses RLS implicitly but the explicit policy is included
-- for symmetry with sync_jobs / sync-orchestrator paths.
-- ----------------------------------------------------------------------------
ALTER TABLE "public"."xero_bs_lines" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS xero_bs_lines_access ON "public"."xero_bs_lines";
CREATE POLICY xero_bs_lines_access ON "public"."xero_bs_lines"
  FOR ALL
  USING (
    auth_is_super_admin()
    OR (business_id = ANY (auth_get_accessible_business_ids()))
  );

DROP POLICY IF EXISTS xero_bs_lines_service_role ON "public"."xero_bs_lines";
CREATE POLICY xero_bs_lines_service_role ON "public"."xero_bs_lines"
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 6. Comments
-- ----------------------------------------------------------------------------
COMMENT ON TABLE xero_bs_lines IS
  'Phase 44.2 06C — Balance Sheet line storage. Point-in-time (balance_date), Xero AccountID-keyed, basis-stamped, FK-protected. Mirrors xero_pl_lines design.';

COMMENT ON COLUMN xero_bs_lines.account_id IS
  'Phase 44.2 06C — Xero AccountID GUID. Canonical identity (never mutates when accountants rename/recode).';

COMMENT ON COLUMN xero_bs_lines.account_code IS
  'Phase 44.2 06C — user-facing Xero Code. Informational only; account_id is canonical.';

COMMENT ON COLUMN xero_bs_lines.account_type IS
  'Phase 44.2 06C — BS top-level classification: asset | liability | equity. Sub-classifications live in xero_accounts.xero_class.';

COMMENT ON COLUMN xero_bs_lines.balance_date IS
  'Phase 44.2 06C — point-in-time as-of date for this balance. Typically month-end (e.g. 2026-04-30). Single-period BS queries only — no aggregation parameters (avoids the documented Reports/BalanceSheet periods-parameter date-arithmetic bug, per Calxa-via-Cowork research).';

COMMENT ON COLUMN xero_bs_lines.balance IS
  'Phase 44.2 06C — signed balance for this account at balance_date. Numeric(18,2) — currency-safe.';

COMMENT ON COLUMN xero_bs_lines.basis IS
  'Phase 44.2 06C — accounting basis the row was computed under (accruals|cash). Default accruals (production write basis). Calxa: never compare across baseses.';

COMMENT ON COLUMN xero_bs_lines.notes IS
  'Phase 44.2 06C — audit trail for synthetic / adjusted rows. NULL for normal rows.';

COMMENT ON CONSTRAINT xero_bs_lines_business_id_fk ON xero_bs_lines IS
  'Phase 44.2 06C — enforces dual-ID resolution: every xero_bs_lines.business_id is a business_profiles.id. ON DELETE RESTRICT prevents silent audit-trail loss.';

COMMENT ON CONSTRAINT xero_bs_lines_natural_key_uniq ON xero_bs_lines IS
  'Phase 44.2 06C — natural key (business_id, tenant_id, account_id, balance_date). account_id is canonical; account_code is informational only.';
