# Phase 44.2 — Rollback Protocol

Per-step reversal recipes for the `PRODUCTION-MIGRATION-RUNBOOK.md` sequence. **As of 2026-05-02 no rollback has been invoked** — these recipes exist for:

1. Mid-deploy recovery if a step fails or produces unexpected results.
2. Post-deploy regression response if `verify-production-migration.ts` flags a real (non-allow-listed) drift.
3. The "rollback everything" recipe at the bottom — full revert to pre-44.2-06A state.

## Decision flowchart

1. **Did a forward step's verification SQL fail?** → Run the per-step rollback for that step.
2. **Did `verify-production-migration.ts` flag a regression?** → First try Step 8 rollback (feature flag, no data change). If the regression is in the data layer (not the orchestrator), proceed to data-layer rollbacks.
3. **Are multiple downstream consumers broken?** → Full revert (bottom of this doc).
4. **Always: capture before-state via `pg_dump` of the affected table(s) before running any destructive rollback.**

---

## Rollback — Step 1 (06A migration 000001 — additive columns)

**When**: Migration applied but caused an unexpected issue (vanishingly rare for additive change).

**Recipe**:
```sql
BEGIN;
ALTER TABLE xero_pl_lines DROP COLUMN IF EXISTS account_id;
ALTER TABLE xero_pl_lines DROP COLUMN IF EXISTS basis;
COMMIT;
```

**Restores**: Pre-Step-1 schema. No data loss (account_id/basis weren't populated yet).

**Verify**:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'xero_pl_lines' AND column_name IN ('account_id', 'basis');
-- Expect: 0 rows
```

---

## Rollback — Step 2 (06A migration 000002 — FK on business_id)

**When**: FK introduces a constraint conflict during a data migration; need to remove temporarily.

**Recipe**:
```sql
ALTER TABLE xero_pl_lines DROP CONSTRAINT IF EXISTS xero_pl_lines_business_id_fk;
```

**Restores**: Unconstrained business_id. Existing data unchanged.

**Verify**:
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'xero_pl_lines'::regclass AND conname = 'xero_pl_lines_business_id_fk';
-- Expect: 0 rows
```

**Note**: Rolling back the FK without rolling back Step 1 leaves account_id/basis columns. This is fine — they're nullable.

---

## Rollback — Step 3 (06A backfill — account_code + account_id)

**When**: Backfill mis-populated rows OR a tenant fetch corrupted account_code in production.

**Critical**: This rollback DEPENDS on the backfill having snapshotted the before-state. If the snapshot table doesn't exist, you cannot restore programmatically — you'd have to re-derive account_code from a Xero re-fetch (which may itself be wrong if Xero data changed).

**Snapshot pattern** (the backfill should have created this):
- Table: `xero_pl_lines_account_code_snapshot (xero_pl_line_id uuid PRIMARY KEY, before_account_code text, snapshotted_at timestamptz)`
- Populated immediately before the UPDATE in `scripts/backfill-xero-accounts-catalog.ts`.

**Recipe** (assumes snapshot exists):
```sql
BEGIN;
UPDATE xero_pl_lines pl
SET account_code = s.before_account_code,
    account_id = NULL
FROM xero_pl_lines_account_code_snapshot s
WHERE pl.id = s.xero_pl_line_id;
COMMIT;
```

**Critical ordering**: Rollback Step 3 MUST run BEFORE rollback of Step 4 (constraint cutover) — Step 4's NOT NULL constraint would block setting account_id back to NULL otherwise.

**Restores**: Pre-backfill account_code. account_id reset to NULL (so Step 4's NOT NULL constraint must also be reverted).

**Verify**:
```sql
SELECT COUNT(*) AS rows_with_null_account_id FROM xero_pl_lines WHERE account_id IS NULL;
-- Expect: > 0 (matches pre-Step-1 state)
```

---

## Rollback — Step 4 (06A migration 000003 — constraint cutover)

**When**: New natural key conflicts with downstream consumers; need old key shape back.

**Recipe**:
```sql
BEGIN;
ALTER TABLE xero_pl_lines DROP CONSTRAINT xero_pl_lines_natural_key_uniq;
ALTER TABLE xero_pl_lines ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE xero_pl_lines
  ADD CONSTRAINT xero_pl_lines_natural_key_uniq
  UNIQUE (business_id, tenant_id, account_code, period_month);
COMMIT;
```

**Restores**: Pre-Step-4 unique key on `account_code`. account_id remains populated but nullable. Old code path resumes working.

**Verify**:
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'xero_pl_lines_natural_key_uniq';
-- Expect: definition includes account_code (not account_id)
```

---

## Rollback — Step 5 (06A migration 000004 — view update)

**When**: View change broke a downstream read site.

**Recipe**: `CREATE OR REPLACE VIEW xero_pl_lines_wide_compat AS ...` with the prior definition.

The prior definition is in git history at `supabase/migrations/20260428000004_xero_pl_lines_plain_unique.sql:33-45`. To restore:

```sql
-- Replace with the prior view body — copied verbatim from git:
CREATE OR REPLACE VIEW xero_pl_lines_wide_compat AS ...;
```

**Restores**: Prior view shape (no `monthly_values jsonb` rollup; old per-row layout).

**Verify**: Run any downstream query that reads `xero_pl_lines_wide_compat` and confirm shape.

---

## Rollback — Step 6 (06C migration 000010 — xero_bs_lines table)

**When**: Need to remove the BS table (e.g. starting fresh, or BS schema redesign required).

**Recipe**:
```sql
DROP TABLE IF EXISTS xero_bs_lines CASCADE;
```

**CASCADE** drops dependent objects — including the `xero_bs_lines_wide_compat` view (Step 7). No application code currently depends on the table for reads; sync orchestrator writes to it but tolerates absence (BS sync silently no-ops).

**Restores**: Pre-Step-6 state. All BS rows lost — operator must re-sync to repopulate.

---

## Rollback — Step 7 (06C migration 000011 — BS view)

**When**: View needs replacement without dropping the table.

**Recipe**:
```sql
DROP VIEW IF EXISTS xero_bs_lines_wide_compat;
```

(Or `CREATE OR REPLACE` with a different definition.)

**Restores**: View removed; `xero_bs_lines` table unchanged.

---

## Rollback — Step 8 (06B + 06D orchestrator deploy)

**When**: Sync orchestrator regression spotted post-deploy (gate failure, sync errors, customer-reported mismatch).

**Defensive measure (planned)**: Add a `XERO_SYNC_PATH_A` environment variable that gates the new orchestrator code. With the flag in place:

**Recipe**:
1. Set `XERO_SYNC_PATH_A=false` in Vercel environment variables (Production scope).
2. Redeploy by triggering a new build (no code change required if the flag check is already in the orchestrator).
3. Verify next cron run uses the legacy by-month path.

**As of 2026-05-02 the flag does NOT exist** — orchestrator unconditionally uses Path A. To roll back today, revert PR #29 + #41 + #42 + #43 via a new revert PR. This is a code-level rollback, not a flag-flip.

**Future**: To make rollback flag-flippable, wrap the new orchestrator entry point with:
```ts
const usePathA = process.env.XERO_SYNC_PATH_A !== 'false'
if (usePathA) return syncBusinessXeroPL_PathA(businessId, opts)
return syncBusinessXeroPL_legacy(businessId, opts)
```
…and keep the legacy code path resident until 06F flag flip in Step 12.

**Restores**: Sync orchestrator behavior to pre-06B. xero_pl_lines / xero_bs_lines tables remain populated with their last successful sync but stop receiving new writes from the new path.

---

## Full revert (worst case — fully unwind 44.2 rebuild to pre-06A)

If multiple downstream consumers break and we need to fully roll back:

**Order matters** — reverse the forward sequence:

```sql
-- 1. Revert orchestrator (Step 8 rollback) FIRST so no new data lands.
--    Set XERO_SYNC_PATH_A=false OR revert PRs #29/#41/#42/#43.

-- 2. Drop BS objects (Steps 6-7).
DROP VIEW IF EXISTS xero_bs_lines_wide_compat;
DROP TABLE IF EXISTS xero_bs_lines CASCADE;

-- 3. Revert PL view (Step 5).
CREATE OR REPLACE VIEW xero_pl_lines_wide_compat AS ...; -- prior definition

-- 4. Revert constraint cutover (Step 4).
BEGIN;
ALTER TABLE xero_pl_lines DROP CONSTRAINT xero_pl_lines_natural_key_uniq;
ALTER TABLE xero_pl_lines ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE xero_pl_lines
  ADD CONSTRAINT xero_pl_lines_natural_key_uniq
  UNIQUE (business_id, tenant_id, account_code, period_month);
COMMIT;

-- 5. Restore account_code from snapshot (Step 3).
BEGIN;
UPDATE xero_pl_lines pl
SET account_code = s.before_account_code,
    account_id = NULL
FROM xero_pl_lines_account_code_snapshot s
WHERE pl.id = s.xero_pl_line_id;
COMMIT;

-- 6. Drop the FK (Step 2).
ALTER TABLE xero_pl_lines DROP CONSTRAINT xero_pl_lines_business_id_fk;

-- 7. Drop the additive columns (Step 1).
ALTER TABLE xero_pl_lines DROP COLUMN account_id;
ALTER TABLE xero_pl_lines DROP COLUMN basis;
```

**Restores**: Pre-44.2-06A schema. All BS data lost. account_code potentially restored from snapshot if snapshot table exists.

**Verify after full revert**:
- `xero_pl_lines` schema matches pre-06A (no account_id, no basis, no FK).
- Sync orchestrator using legacy path produces successful `sync_jobs` rows.
- Downstream consumers (forecast wizard, monthly report) read xero_pl_lines without errors.

**Communicate**: This rollback represents weeks of work being undone. Capture the reason for full revert in `.planning/phases/44.2-cfo-grade-xero-reconciliation/ROLLBACK-INCIDENT.md` (NEW file) before executing.

---

## Snapshot discipline (lessons learned)

**Critical**: Step 3's rollback depends on a snapshot table that the backfill script must create. If the backfill ever runs without snapshotting first, that step's rollback degrades from "restore exact prior state" to "best-effort re-fetch from Xero" — which may itself be lossy if Xero data has changed.

For any future destructive update to `xero_pl_lines` or `xero_bs_lines`:
1. Always snapshot affected columns to a sibling table BEFORE the UPDATE.
2. The snapshot table includes `snapshotted_at timestamptz` so multiple migrations don't overwrite each other.
3. The rollback SQL is documented in this file at the time the migration is written — not retrofitted later.
