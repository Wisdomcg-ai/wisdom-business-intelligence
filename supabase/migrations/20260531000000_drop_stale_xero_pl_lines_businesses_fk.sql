-- R1a — drop the stale baseline FK so fresh builds match production.
--
-- Background (the "two contradictory FKs" on xero_pl_lines.business_id)
-- --------------------------------------------------------------------
-- The committed migration history declares TWO foreign keys on
-- xero_pl_lines.business_id, pointing at DIFFERENT, disjoint id-spaces:
--
--   1. baseline_schema (00000000000000):
--        xero_pl_lines_business_id_fkey  FK → businesses(id)         ON DELETE CASCADE
--   2. migration 20260430000002:
--        xero_pl_lines_business_id_fk    FK → business_profiles(id)  ON DELETE RESTRICT
--
-- Nothing in the migration history ever drops (1). businesses.id and
-- business_profiles.id are disjoint UUID spaces, so both FKs cannot be
-- satisfied by the same non-empty data set.
--
-- What production actually looks like (verified read-only, 2026-05-31):
--   - SELECT on pg_constraint: ONLY xero_pl_lines_business_id_fk
--     (→ business_profiles, RESTRICT, validated) exists. The baseline
--     _fkey → businesses has already been removed from prod, OUTSIDE the
--     migration files (manual intervention / drift).
--   - Data distribution: all 4,946 xero_pl_lines rows resolve to a
--     business_profiles.id; ZERO resolve to a businesses.id. The
--     canonical model (business_id IS a business_profiles.id) is already
--     physically true and FK-enforced in prod.
--
-- The problem this migration fixes
-- --------------------------------
-- Prod is correct, but a DB built FRESH from these migration files is NOT.
-- On an empty xero_pl_lines, migration 20260430000002's orphan pre-flight
-- passes (0 rows), so BOTH FKs get created. The first real sync then
-- inserts a business_profiles.id and immediately violates the stale
-- _fkey → businesses constraint — breaking Xero sync on every fresh build:
-- CI, local `supabase db reset`, disaster-recovery rebuilds, and the
-- inLIFE Pulse fork.
--
-- Safety
-- ------
--   - In PRODUCTION this is a NO-OP: the constraint is already gone, so the
--     guarded DROP simply does nothing. Zero rows touched, zero downtime.
--   - In FRESH builds this is CORRECTIVE: it removes the stale constraint so
--     only the canonical _fk → business_profiles remains.
--   - Idempotent: guarded by a pg_constraint existence check, safe to re-run.
--
-- Scope
-- -----
-- Deliberately limited to xero_pl_lines — the only table with prod-verified
-- evidence. xero_accounts and account_mappings ALSO carry a baseline
-- _fkey → businesses; whether those tables are canonically businesses.id or
-- have the same drift is UNVERIFIED and must be checked against prod
-- (pg_constraint + data distribution) before any change. Do NOT assume.

DO $drop_stale_fk$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'xero_pl_lines_business_id_fkey'
  ) THEN
    ALTER TABLE xero_pl_lines DROP CONSTRAINT xero_pl_lines_business_id_fkey;
    RAISE NOTICE 'Dropped stale xero_pl_lines_business_id_fkey (→ businesses). Canonical xero_pl_lines_business_id_fk (→ business_profiles) is now the sole FK.';
  ELSE
    RAISE NOTICE 'xero_pl_lines_business_id_fkey not present (production already correct) — no-op.';
  END IF;
END
$drop_stale_fk$;
