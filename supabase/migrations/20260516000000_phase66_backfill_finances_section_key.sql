-- Phase 66 Plan 66-01: Backfill canonical 'finances' section-permission key
--
-- Problem:
--   The `business_users` table baseline DEFAULT JSONB (baseline_schema.sql line 1929)
--   uses the legacy key "financials":
--     '{"goals": true, "actions": true, ..., "financials": true, ...}'
--   The `team_invites` table baseline DEFAULT (line 5206) also uses "financials":
--     '{"goals": true, "actions": true, ..., "financials": false, ...}'
--
--   The Phase 65 helper `requireSectionPermission` reads the canonical key
--   "finances" (not "financials"). Any production row carrying only "financials"
--   has section_permissions['finances'] = undefined → the helper defaults to
--   allow → a member with an explicit legacy deny slips through once
--   SECTION_PERMISSION_ENFORCE=true is flipped (Phase 65 Wave 65-04).
--
-- This migration is the binding prerequisite for Phase 65 Wave 65-04 (D-04).
-- It MUST be applied to production BEFORE the SECTION_PERMISSION_ENFORCE
-- environment variable is set to true.
--
-- Backfill rule (D-03):
--   - Row has "financials": true  → set "finances": true  (preserve existing allow)
--   - Row has "financials": false → set "finances": false (preserve explicit deny)
--   - Row has neither key         → set "finances": true for business_users
--                                     (matches baseline DEFAULT intent; retroactively
--                                      allow rather than deny someone who never had
--                                      an explicit deny — least-surprise)
--                                 → set "finances": false for team_invites
--                                     (matches team_invites baseline DEFAULT intent)
--
-- Idempotency:
--   The WHERE NOT (section_permissions ? 'finances') clause ensures rows that
--   already carry the canonical key are untouched, including any conflicting rows
--   (both keys present with different values) that the audit script flagged.
--   Re-running this migration reports 0 rows affected. The ALTER COLUMN SET
--   DEFAULT statements are naturally idempotent (re-running sets the same value).
--
-- Scope (revised 2026-05-17 — operator authorized DEFAULT fix):
--   1. DATA BACKFILL of the two named tables' existing rows (UPDATEs below).
--   2. COLUMN DEFAULT CORRECTION — the baseline DEFAULTs (business_users line 1929,
--      team_invites line 5206) still emit the legacy "financials" key. Any future
--      INSERT that omits section_permissions would reintroduce the gap. The two
--      ALTER COLUMN SET DEFAULT statements below converge the defaults onto the
--      canonical "finances" key. The dead "financials" key is dropped entirely —
--      Phase 65 verification (65-01-SECTION-KEY-VERIFICATION.md) confirmed no TS,
--      UI, or Postgres-function code reads "financials" anymore.
--   No ADD COLUMN, no DROP, no data-destructive DDL. Scoped to the two tables.
--
-- Audit finding (2026-05-17): all 23 affected business_users rows are owner/admin
-- (0 member rows), so there is no live ENFORCE-cutover security exposure — owner
-- and admin bypass the section-key check. This migration is therefore hygiene +
-- future-proofing, not a security gate. Phase 65 Wave 65-04 is unblocked.
--
-- Safe to apply on a Supabase preview branch first, then promote to production.
-- Verify post-migrate: SELECT count(*) FROM business_users WHERE NOT (section_permissions ? 'finances');
-- Verify post-migrate: SELECT count(*) FROM team_invites WHERE NOT (section_permissions ? 'finances');
-- Both should return 0.

BEGIN;

-- business_users: backfill the canonical 'finances' key for rows that only
-- carry the legacy 'financials' key (or neither key).
-- Rule: finances <- financials value when present; <- true when neither key
-- exists (matches the original baseline DEFAULT intent — least-surprise:
-- retroactively allow rather than deny someone who never had an explicit deny).
UPDATE public.business_users
SET section_permissions = section_permissions || jsonb_build_object(
  'finances',
  COALESCE((section_permissions->>'financials')::boolean, true)
)
WHERE NOT (section_permissions ? 'finances');

-- team_invites: same backfill for the staging table. Impact is lower because
-- invite acceptance writes section_permissions from the request body, not by
-- copying this column verbatim in all paths. Included for cleanliness and to
-- ensure any stale-DEFAULT rows on this table are also corrected.
-- Note: the team_invites baseline DEFAULT for 'financials' is false (confirmed
-- at baseline_schema.sql line 5206) — so the COALESCE fallback is false here.
UPDATE public.team_invites
SET section_permissions = section_permissions || jsonb_build_object(
  'finances',
  COALESCE((section_permissions->>'financials')::boolean, false)
)
WHERE NOT (section_permissions ? 'finances');

-- Column DEFAULT correction: converge the table defaults onto the canonical
-- 'finances' key so future INSERTs that omit section_permissions no longer
-- reintroduce the legacy-key gap. The dead 'financials' key is dropped — Phase 65
-- verification confirmed nothing reads it. Same key set + same boolean values as
-- the baseline defaults, only the finance key is renamed.
ALTER TABLE public.business_users
  ALTER COLUMN section_permissions SET DEFAULT
  '{"goals": true, "actions": true, "roadmap": true, "messages": true, "documents": true, "finances": true, "business_profile": true, "quarterly_review": true}'::jsonb;

ALTER TABLE public.team_invites
  ALTER COLUMN section_permissions SET DEFAULT
  '{"goals": true, "actions": true, "roadmap": true, "messages": true, "documents": true, "finances": false, "business_profile": true, "quarterly_review": false}'::jsonb;

COMMIT;
