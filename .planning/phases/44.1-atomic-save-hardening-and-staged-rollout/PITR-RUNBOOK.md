# PITR Rollback Runbook — forecast_pl_lines

**Owner:** Phase 44.1 atomic-save-hardening
**Last reviewed:** 2026-04-28
**Scope:** Restoring `forecast_pl_lines` for a single `forecast_id` from a Supabase Point-In-Time-Recovery snapshot.

## When to use this runbook

Use this runbook when ANY of these conditions hold:

1. The 44.1-05 canary diff reports `OVERALL: FAIL` and a forecast has lost rows.
2. A coach reports missing accounts after a wizard save.
3. The `ForecastReadService.getMonthlyComposite` call returns fewer rows than `forecast_pl_lines` should contain (audit script).
4. A `cfo_report_status` snapshot's stored numbers do not reconcile against current `forecast_pl_lines`.

DO NOT use this runbook for transient sync issues, RLS misconfigurations, or wizard-side state bugs. PITR restores are heavyweight and irreversible.

## Prerequisites

- [ ] Supabase Pro tier (or higher) with PITR enabled.
- [ ] Confirmed RPO (recovery point objective) — Supabase Pro PITR retains 7 days of WAL by default.
- [ ] You have the affected `forecast_id` (UUID).
- [ ] You have a target restore timestamp BEFORE the loss event (use the `cfo_report_status.snapshot_data` JSONB or coach reports to triangulate).
- [ ] User has explicitly authorized the restore — this writes production data.

## Verifying PITR is enabled (one-time)

1. Open Supabase dashboard → Project → Settings → Database → Backups.
2. Confirm "Point-in-time Recovery" shows `Enabled` and lists a window in days.
3. If NOT enabled: STOP. Restore is impossible. Enable PITR (paid tier change) before proceeding with any 44.1 production push.

Document the verified RPO in this runbook above (replace the `Last reviewed` date with the verification date).

## Restore procedure (DRY-RUN first, then commit)

### Step 1 — Identify the target row set

Find the rows that need restoring. Run in Supabase SQL Editor:

```sql
-- What's in the affected forecast right now?
SELECT id, account_code, account_name, category, is_manual, computed_at
FROM forecast_pl_lines
WHERE forecast_id = '{FORECAST_ID}'
ORDER BY category, account_code;
```

Compare with the coach's expected accounts or with the `cfo_report_status.snapshot_data` JSONB if a recent approved snapshot exists.

### Step 2 — Open a PITR clone (READ-ONLY)

1. In Supabase dashboard → Project → Database → Backups → Restore from PITR.
2. Pick a timestamp BEFORE the loss event.
3. Supabase creates a TEMPORARY restored database accessible via a separate URL.
4. Copy the temporary DB URL — this is your read-only source.

### Step 3 — DRY-RUN — fetch what would be restored

In a NEW SQL Editor session pointed at the temporary restored DB:

```sql
-- DRY-RUN: read the rows from the PITR snapshot. NO writes.
SELECT id, forecast_id, account_code, account_name, category, subcategory,
       is_manual, is_from_xero, sort_order,
       forecast_months, actual_months, computed_at, created_at, updated_at,
       account_type, account_class, is_from_payroll
FROM forecast_pl_lines
WHERE forecast_id = '{FORECAST_ID}'
ORDER BY id;
```

Save the output. Confirm:
- The row count matches the coach's expectation OR the prior snapshot count.
- `is_manual = true` rows are present (coach overrides must NOT be lost).
- `forecast_months` JSONB has the months expected.

If the snapshot doesn't have what you need, pick an earlier timestamp and repeat.

### Step 4 — Export the restore set as INSERT statements

In the temporary restored DB, run:

```sql
-- Export to INSERT-able SQL. Adjust column list if schema has drifted.
SELECT 'INSERT INTO forecast_pl_lines (id, forecast_id, account_code, account_name, category, subcategory, is_manual, is_from_xero, sort_order, forecast_months, actual_months, computed_at, created_at, updated_at, account_type, account_class, is_from_payroll) VALUES (' ||
  quote_literal(id) || ', ' ||
  quote_literal(forecast_id) || ', ' ||
  COALESCE(quote_literal(account_code), 'NULL') || ', ' ||
  quote_literal(account_name) || ', ' ||
  COALESCE(quote_literal(category), 'NULL') || ', ' ||
  COALESCE(quote_literal(subcategory), 'NULL') || ', ' ||
  is_manual::text || ', ' ||
  is_from_xero::text || ', ' ||
  COALESCE(sort_order::text, 'NULL') || ', ' ||
  COALESCE(quote_literal(forecast_months::text) || '::jsonb', 'NULL') || ', ' ||
  COALESCE(quote_literal(actual_months::text) || '::jsonb', 'NULL') || ', ' ||
  COALESCE(quote_literal(computed_at::text) || '::timestamptz', 'NULL') || ', ' ||
  quote_literal(created_at::text) || '::timestamptz, ' ||
  quote_literal(updated_at::text) || '::timestamptz, ' ||
  COALESCE(quote_literal(account_type), 'NULL') || ', ' ||
  COALESCE(quote_literal(account_class), 'NULL') || ', ' ||
  is_from_payroll::text ||
  ') ON CONFLICT (id) DO UPDATE SET ' ||
  'forecast_months = EXCLUDED.forecast_months, ' ||
  'actual_months = EXCLUDED.actual_months, ' ||
  'is_manual = EXCLUDED.is_manual, ' ||
  'computed_at = EXCLUDED.computed_at, ' ||
  'updated_at = EXCLUDED.updated_at;'
FROM forecast_pl_lines
WHERE forecast_id = '{FORECAST_ID}';
```

Save output to a `.sql` file. Inspect it manually before applying.

### Step 5 — COMMIT — apply restore to production

In a NEW SQL Editor session pointed at the LIVE production DB (re-authenticate; this is the live path):

```sql
BEGIN;

-- Optional safety: snapshot the current state of these rows so we can re-restore
-- if the PITR data turns out to be wrong.
CREATE TEMP TABLE pre_restore_snapshot AS
  SELECT * FROM forecast_pl_lines WHERE forecast_id = '{FORECAST_ID}';

-- Apply the restore (paste the output of Step 4):
{PASTE INSERT STATEMENTS HERE}

-- Verify counts post-restore:
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_manual = true) AS manual_rows,
  COUNT(*) FILTER (WHERE is_manual = false) AS derived_rows
FROM forecast_pl_lines
WHERE forecast_id = '{FORECAST_ID}';

-- IF the counts match expectation:
COMMIT;

-- IF something looks wrong:
-- ROLLBACK;
```

### Step 6 — Post-restore RLS check

```sql
-- Confirm the coach + service_role can read these rows (Wave 5 RLS hotfix is active).
SET ROLE authenticated;
SELECT COUNT(*) FROM forecast_pl_lines WHERE forecast_id = '{FORECAST_ID}';
RESET ROLE;
```

If `authenticated` cannot read the rows, the Wave 5 RLS hotfix (`ec5055e`) may have been disturbed. Re-apply RLS policies from `supabase/migrations/20260428000006_xero_pl_lines_rls.sql` (note: this is xero_pl_lines RLS — verify forecast_pl_lines RLS separately).

### Step 7 — Bump computed_at to satisfy 44-08 freshness invariant

```sql
-- The PITR snapshot's computed_at may be older than financial_forecasts.updated_at,
-- which would trip the D-18 freshness invariant in ForecastReadService.
-- Bump computed_at to now() on derived rows so consumers re-render.
UPDATE forecast_pl_lines
SET computed_at = now(), updated_at = now()
WHERE forecast_id = '{FORECAST_ID}'
  AND is_manual = false;

-- Also bump financial_forecasts.updated_at slightly EARLIER than the
-- forecast_pl_lines.computed_at so the inequality (computed_at >= updated_at) holds.
UPDATE financial_forecasts
SET updated_at = now() - interval '1 second'
WHERE id = '{FORECAST_ID}';
```

### Step 8 — Sanity check via app

1. User reloads forecast page in the app.
2. Confirms restored accounts visible.
3. Confirms `cfo_report_status` (if affected) reconciles.

## Rollback of the restore (if it went wrong)

If Step 5 was COMMITted but the restore data was incorrect:

```sql
-- Use the pre_restore_snapshot temp table from Step 5 — but it's gone after COMMIT.
-- The fallback is another PITR restore: pick a timestamp AFTER your erroneous COMMIT
-- but representative of "current bad state", clone, and pull back the right rows.
-- This is why Step 4's output is saved to a file — you can re-run Step 4 with a
-- different PITR timestamp and re-apply.
```

To minimize risk, ALWAYS keep Step 4's `.sql` output file until the user has confirmed Step 8.

## Forensics

After every PITR restore:
- Document which forecast_id was affected.
- Document which timestamp was the source.
- Append the case to a forensic log at `.planning/operations/forensic-log.md` (create if absent).
- File a Sentry "release-note" issue describing the loss + recovery so the org sees the audit trail.
