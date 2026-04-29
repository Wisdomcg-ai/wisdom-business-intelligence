-- Phase 44.2 Plan 06A.2 — Q7 FK enforcement: business_id MUST be a business_profiles.id
--
-- Per the SYNC-JOBS-TENANT-ID-AUDIT (44.2-01), all xero_pl_lines.business_id values
-- in production are business_profiles.id (NOT businesses.id). This has been a convention
-- enforced by orchestrator code; the FK enforces it at the schema layer so a future
-- write with the wrong ID class fails fast instead of silently creating orphan rows.
--
-- ON DELETE RESTRICT: deleting a business_profile while xero_pl_lines exist is forbidden.
-- This protects audit trails — historical sync data is not casually deletable.
-- (If a profile genuinely needs deletion, the explicit cleanup is to delete xero_pl_lines
-- first, which is intentional friction.)
--
-- Safety: if any xero_pl_lines.business_id does NOT match a business_profiles.id, this
-- migration fails atomically. The pre-flight assertion (DO block) catches this BEFORE
-- the constraint is added so the error message is informative.
--
-- Idempotency: the ADD CONSTRAINT is wrapped in a pg_constraint conditional so re-runs
-- are safe (PG has no native ADD CONSTRAINT IF NOT EXISTS).

-- ----------------------------------------------------------------------------
-- 1. Pre-flight: refuse to proceed if any orphan rows exist.
-- ----------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_orphans int;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM xero_pl_lines x
  WHERE NOT EXISTS (
    SELECT 1 FROM business_profiles bp WHERE bp.id = x.business_id
  );
  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'Phase 44.2 06A.2 pre-flight: % xero_pl_lines rows reference a business_id that is not a business_profiles.id. Migration aborted to prevent silent FK violation. Diagnose with: SELECT DISTINCT business_id FROM xero_pl_lines WHERE business_id NOT IN (SELECT id FROM business_profiles);',
      v_orphans;
  END IF;
END
$preflight$;

-- ----------------------------------------------------------------------------
-- 2. Conditional ADD CONSTRAINT (idempotent).
-- ----------------------------------------------------------------------------
DO $addfk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xero_pl_lines_business_id_fk'
  ) THEN
    ALTER TABLE xero_pl_lines
      ADD CONSTRAINT xero_pl_lines_business_id_fk
        FOREIGN KEY (business_id)
        REFERENCES business_profiles(id)
        ON DELETE RESTRICT;
  END IF;
END
$addfk$;

COMMENT ON CONSTRAINT xero_pl_lines_business_id_fk ON xero_pl_lines IS
  'Phase 44.2 06A.2 Q7 — enforces dual-ID resolution: every xero_pl_lines.business_id is a business_profiles.id. ON DELETE RESTRICT prevents silent audit-trail loss.';
