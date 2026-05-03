---
phase: 49-database-integrity-hygiene
plan: 01
subsystem: database
tags: [db-01, db-02, db-05, additive, audit-columns, soft-delete, migration-hygiene]
requirements: [DB-01, DB-02, DB-05]
dependency-graph:
  requires:
    - 44-05 (CI gate enforced on main — required before any new test file lands)
  provides:
    - "8 financial tables expose nullable deleted_at/deleted_by/created_by/updated_by"
    - "8 partial indexes idx_<table>_deleted_at WHERE deleted_at IS NULL"
    - "Migration filename convention enforced at PR time (14-digit only)"
    - "Operator runbook for renaming applied migrations in supabase_migrations.schema_migrations"
  affects:
    - "Future code can soft-delete via deleted_at IS NOT NULL filters across all 8 tables"
    - "Future migrations must use YYYYMMDDHHMMSS form — CI rejects 8-digit alternation"
tech-stack:
  added: []
  patterns:
    - "Migration FOREACH loop over a table-array for symmetric ALTER TABLE adds"
    - "Best-effort backfill UPDATE pattern with COMMENT documenting NULL-by-design rationale"
    - "Skip-on-placeholder + runtime probe-for-applied-migration test pattern (mirrors 06C)"
key-files:
  created:
    - supabase/migrations/20260504000000_db01_db02_db05_audit_columns_and_renames.sql
    - src/__tests__/migrations/db-01-soft-delete-columns.test.ts
    - src/__tests__/migrations/db-02-audit-columns.test.ts
    - src/__tests__/migrations/db-05-filename-hygiene.test.ts
  modified:
    - .github/workflows/supabase-preview.yml (migration-check regex tightened to 14-digit only)
  renamed:
    - "supabase/migrations/20260424_cfo_email_log.sql → supabase/migrations/20260424000000_cfo_email_log.sql"
    - "supabase/migrations/20260427_unique_active_forecast_per_fy.sql → supabase/migrations/20260427000000_unique_active_forecast_per_fy.sql"
decisions:
  - "Single migration carries DB-01 + DB-02 + DB-05 because they share the same 8 tables / same ALTER TABLE pattern / same sign-off"
  - "Best-effort backfill (not required-NOT-NULL) for forecast_employees + forecast_pl_lines, because forecast_audit_log is app-populated only (CREATE TRIGGER never wired)"
  - "FK ON DELETE SET NULL for all 4 audit FKs — matches existing convention (cfo_email_log.triggered_by, baseline pattern)"
  - "CI regex tightened in same PR — keeping 8-digit alternation alive after the 2 historical files were renamed would let future violations slip through"
metrics:
  duration: ~25min
  completed: 2026-05-04
  tasks: 3
  commits: 3
  files: 4 created + 1 modified + 2 renamed
---

# Phase 49 Plan 01: DB-01 + DB-02 + DB-05 Audit Columns + Filename Hygiene — Summary

Single additive migration adds 32 nullable columns (8 financial tables × deleted_at/deleted_by/created_by/updated_by) plus 8 partial indexes on live rows; renames the two date-only migration files to the canonical 14-digit form via `git mv`; and tightens the migration-check CI regex to reject anything not matching `^[0-9]{14}_[a-z0-9_]+\.sql$` so future violations are blocked at PR time.

## What shipped

### DB-01 — soft-delete columns
The 8 most-mutated financial tables (`financial_forecasts`, `forecast_employees`, `forecast_pl_lines`, `monthly_actuals`, `xero_pl_lines`, `cfo_report_status`, `cfo_email_log`, `account_mappings`) now expose:
- `deleted_at timestamptz` — nullable, no default
- `deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL` — nullable
- Companion partial index `idx_<table>_deleted_at ON <table>(deleted_at) WHERE deleted_at IS NULL` (matches `idx_businesses_deleted_at` convention from baseline:6973)

### DB-02 — audit columns + best-effort backfill
The same 8 tables now expose `created_by` + `updated_by` (uuid → auth.users SET NULL, nullable). Backfill ran in two confidence tiers:
- **Tier 1 (canonical column → 100% / partial coverage):**
  - `financial_forecasts.created_by ← user_id` (NOT NULL @ baseline:2544 → every row covered)
  - `account_mappings.created_by ← mapped_by` (nullable → partial coverage)
  - `cfo_email_log.created_by ← triggered_by` (nullable → partial coverage)
- **Tier 2 (best-effort from forecast_audit_log):**
  - `forecast_employees.created_by ← fal.user_id WHERE fal.action = 'create'`
  - `forecast_pl_lines.created_by ← fal.user_id WHERE fal.action = 'create'`
- **Tables intentionally NOT backfilled (NULL by design — recorded in COMMENTs):**
  - `monthly_actuals` (no creator column, not in audit-log enum)
  - `xero_pl_lines` (system actor — Xero sync; NULL is correct)
  - `cfo_report_status` (no creator column; `approved_by` ≠ creator)

The migration carries 7 `COMMENT ON COLUMN` statements that document the NULL-by-design intent for every table the audit log cannot cover, plus the trigger-absence caveat for the two forecast tables.

### DB-05 — filename hygiene + CI tightening
Two date-only migration files renamed via `git mv` (rename detection preserved):
- `20260424_cfo_email_log.sql` → `20260424000000_cfo_email_log.sql`
- `20260427_unique_active_forecast_per_fy.sql` → `20260427000000_unique_active_forecast_per_fy.sql`

Ordering verified: `20260427000000_unique_active_forecast_per_fy.sql` correctly sorts before `20260427024433_plan_period_columns.sql`.

CI tightened: `.github/workflows/supabase-preview.yml` migration-check job no longer accepts the 8-digit alternation. Future violations now fail at PR time with `Invalid migration filenames (must be YYYYMMDDHHMMSS_name.sql)`.

## Critical caveat — encoded in migration COMMENTs

`grep -c "CREATE TRIGGER" supabase/migrations/00000000000000_baseline_schema.sql` returns **0**. The functions `log_forecast_change` (baseline:821) and `audit_employee_changes` (baseline:61) are defined but **never wired with a CREATE TRIGGER**. Therefore `forecast_audit_log` is populated only by explicit app-code inserts — not by DB triggers. The DB-02 backfill against `forecast_audit_log` for `forecast_employees` + `forecast_pl_lines` is by design best-effort; many historical rows will end up with `created_by = NULL`. This is expected and is recorded in `COMMENT ON COLUMN` for both columns.

## Operator action required after deploy (paste into PR description)

After the migration applies on each production tenant, run the following in Supabase Studio SQL Editor on each tenant **before the next migration ships**:

```sql
-- DB-05: update schema_migrations to reflect the renamed files. The renamed
-- files are idempotent (CREATE TABLE IF NOT EXISTS, CREATE UNIQUE INDEX
-- IF NOT EXISTS), so re-runs are harmless — but the schema_migrations table
-- should reflect reality.
UPDATE supabase_migrations.schema_migrations
   SET version = '20260424000000' WHERE version = '20260424';
UPDATE supabase_migrations.schema_migrations
   SET version = '20260427000000' WHERE version = '20260427';
```

## Tests

| File | Purpose | State |
|------|---------|-------|
| `src/__tests__/migrations/db-01-soft-delete-columns.test.ts` | Asserts deleted_at + deleted_by on all 8 tables; checks 8 partial indexes via pg_indexes | Skips on placeholder env (CI); GREEN on live preview branch with migration applied |
| `src/__tests__/migrations/db-02-audit-columns.test.ts` | Asserts created_by + updated_by on all 8 tables; financial_forecasts.created_by zero NULLs (full backfill check) | Skips on placeholder env (CI); GREEN on live preview branch with migration applied |
| `src/__tests__/migrations/db-05-filename-hygiene.test.ts` | fs.readdirSync + regex check — every migration must match `^[0-9]{14}_[a-z0-9_]+\.sql$` | RED before Task 3 (2 violators); **GREEN after Task 3** (28 passed, 0 failed) |

The DB-01/DB-02 tests follow the project's runtime-probe pattern (mirrors `06C-bs-schema-migration.test.ts`): they detect whether the migration is applied to the connected DB and skip with a `console.warn` if not — so re-runs after the operator pastes SQL into Supabase Studio gracefully transition from skip → GREEN without failing CI in the meantime.

## Commits (3)

| # | Hash | Subject |
|---|------|---------|
| 1 | `48c1004` | test(49-01): RED — DB-01/DB-02/DB-05 introspection tests |
| 2 | `40f60cf` | feat(49-01): GREEN — additive migration for DB-01 + DB-02 audit columns |
| 3 | `6581478` | feat(49-01): GREEN — DB-05 rename date-only migrations + tighten CI regex |

## Local CI Status

| Gate | Result | Notes |
|------|--------|-------|
| `npx tsc --noEmit` | PASS | Clean — zero errors |
| `npx next lint` | PASS | Only pre-existing warnings (10 files outside this plan's scope; all `react-hooks/exhaustive-deps` + 1 `import/no-anonymous-default-export`); zero errors |
| `npx vitest run` | 660 passed / 1 failed / 37 skipped / 4 todo | The 1 failure is the **pre-existing date-sensitive test** flagged in the prompt: `src/__tests__/goals/plan-period-banner.test.tsx` — expects `2026-04-01` but receives `2026-03-31` (TZ drift on May 4); not introduced by this plan. The 37 skipped includes DB-01 + DB-02 (placeholder env, by design). |
| `npm run build` | PASS | Next.js production build succeeded with the same env-var stub set used by the supabase-preview build job |
| `migration-check` job (locally re-run via the CI command) | PASS | Zero violators after Task 3 |

## Deviations from Plan

**None.** Plan executed exactly as written. The pre-existing `plan-period-banner.test.tsx` failure was anticipated in the prompt and is not attributable to this plan.

## Risk worth verifier scrutinizing hardest

**DB-02 backfill correctness on production.** The migration assumes `forecast_audit_log.action = 'create'` rows reliably link to `forecast_employees.id` / `forecast_pl_lines.id` via `record_id`. RESEARCH.md confirmed the trigger functions exist but are never wired with CREATE TRIGGER, so the audit log is app-populated only — meaning the `record_id` column may have been populated inconsistently across app paths over time. If app code ever inserted into `forecast_audit_log` with `record_id` pointing at the wrong UUID (e.g. forecast_id instead of the line/employee id, or a stringified id), the backfill would either no-op (safe) or stamp the wrong user (silent data quality issue). The migration's WHERE clause includes `fal.user_id IS NOT NULL` guard so we never overwrite with NULL, but the verifier should sample-check production rows after the migration applies: `SELECT COUNT(*), COUNT(DISTINCT created_by) FROM forecast_employees WHERE created_by IS NOT NULL` per tenant, and spot-check 5-10 rows against `forecast_audit_log` to confirm the join hit the right user.

## Self-Check: PASSED

**Created files exist (verified via `test -f`):**
- FOUND: supabase/migrations/20260504000000_db01_db02_db05_audit_columns_and_renames.sql
- FOUND: src/__tests__/migrations/db-01-soft-delete-columns.test.ts
- FOUND: src/__tests__/migrations/db-02-audit-columns.test.ts
- FOUND: src/__tests__/migrations/db-05-filename-hygiene.test.ts

**Renamed files (verified via `test -f` + `test ! -e`):**
- FOUND: supabase/migrations/20260424000000_cfo_email_log.sql
- FOUND: supabase/migrations/20260427000000_unique_active_forecast_per_fy.sql
- GONE: supabase/migrations/20260424_cfo_email_log.sql
- GONE: supabase/migrations/20260427_unique_active_forecast_per_fy.sql

**Modified files:**
- VERIFIED: .github/workflows/supabase-preview.yml — 8-digit alternation regex line removed

**Commits exist (verified via `git log`):**
- FOUND: 48c1004 (test/49-01)
- FOUND: 40f60cf (feat/49-01 migration)
- FOUND: 6581478 (feat/49-01 renames + CI)

**Branch pushed:** feat/49-01-additive-columns → origin (new branch).
