-- Phase 44.2 Plan 06A.1 — additive: account_id GUID first-class + basis stamp + notes audit
--
-- Adds three columns to xero_pl_lines:
--   account_id uuid NULL    — Xero AccountID GUID. Promoted to NOT NULL in 000003
--                             after backfill from existing GUID-bearing account_code.
--   basis text NOT NULL DEFAULT 'accruals' CHECK (basis IN ('accruals','cash'))
--                           — Calxa best practice: stamp every cached row with the
--                             accounting basis under which it was computed, so future
--                             cash-basis variants can never silently compare against
--                             accruals data. Default 'accruals' since production today
--                             writes only accruals.
--   notes text NULL          — audit trail for synthetic / adjusted rows. 06A backfill
--                             populates this for SYNTH-AID rows where account_id had
--                             to be derived from account_name (uuid-v5) because the
--                             original Xero AccountID was missing in the by-month
--                             response. 06B uses it as the augmentWithResiduals
--                             regression-detector audit field. NULL for normal rows.
--                             (This column was originally introduced by the obsoleted
--                             44.2-06 absorber migration — that migration was never
--                             merged after the Path A pivot, so the column is folded
--                             into 06A here to give 06B a stable place to write.)
--
-- This migration is additive only — no existing column changes, no constraints
-- modified, no data rewrites. Idempotent.

ALTER TABLE xero_pl_lines
  ADD COLUMN IF NOT EXISTS account_id uuid;

ALTER TABLE xero_pl_lines
  ADD COLUMN IF NOT EXISTS basis text
    NOT NULL DEFAULT 'accruals'
    CHECK (basis IN ('accruals','cash'));

ALTER TABLE xero_pl_lines
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN xero_pl_lines.account_id IS
  'Phase 44.2 06A — Xero AccountID GUID (canonical identity; never mutates when accountants rename/recode). Promoted to NOT NULL in migration 20260430000003 after backfill.';

COMMENT ON COLUMN xero_pl_lines.basis IS
  'Phase 44.2 06A — accounting basis the row was computed under (accruals|cash). Default accruals (production write basis). Calxa: never compare across baseses.';

COMMENT ON COLUMN xero_pl_lines.notes IS
  'Phase 44.2 06A — audit trail for synthetic / adjusted rows. Populated by 06A backfill for SYNTH-AID rows; populated by 06B for absorber regression-detector audit. NULL for normal rows.';
