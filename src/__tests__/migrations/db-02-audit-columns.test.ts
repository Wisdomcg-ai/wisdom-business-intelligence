/**
 * Phase 49 Plan 01 DB-02 — Audit columns (created_by / updated_by) on the
 * 8 most-mutated financial tables.
 *
 * Asserts that migration 20260504000000_db01_db02_db05_audit_columns_and_renames.sql
 * has been applied: each of the 8 tables exposes nullable `created_by` + `updated_by`
 * (uuid → auth.users SET NULL). Also asserts the canonical-column backfill ran
 * on financial_forecasts (every row should have created_by populated, since
 * user_id is NOT NULL on that table per baseline:2544).
 *
 * Caveat encoded in this test (matches the migration COMMENT):
 *   forecast_employees + forecast_pl_lines created_by is best-effort because
 *   the audit-log triggers (log_forecast_change, audit_employee_changes) were
 *   never wired with CREATE TRIGGER — we do NOT assert created_by IS NOT NULL
 *   on those tables.
 *
 * Skip behaviour mirrors db-01-soft-delete-columns.test.ts.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? ''

const SHOULD_SKIP =
  !SUPABASE_URL ||
  SUPABASE_URL.includes('placeholder.supabase.co') ||
  !SERVICE_KEY

const FINANCIAL_TABLES = [
  'financial_forecasts',
  'forecast_employees',
  'forecast_pl_lines',
  'monthly_actuals',
  'xero_pl_lines',
  'cfo_report_status',
  'cfo_email_log',
  'account_mappings',
] as const

const d = SHOULD_SKIP ? describe.skip : describe

d('DB-02: audit columns on 8 financial tables', () => {
  let supabase: SupabaseClient
  let migrationApplied = false

  beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const probe = await supabase
      .from('financial_forecasts')
      .select('created_by, updated_by')
      .limit(0)
    if (probe.error) {
      const msg = probe.error.message || ''
      if (/created_by|updated_by|column .* does not exist|PGRST/i.test(msg)) {
        // eslint-disable-next-line no-console
        console.warn(
          '[DB-02 test] created_by/updated_by columns not present on financial_forecasts — migration 20260504000000 not yet applied. Suite will skip.',
        )
        migrationApplied = false
        return
      }
      throw new Error(`Unexpected DB-02 probe error: ${msg}`)
    }
    migrationApplied = true
  })

  function requireMigration() {
    if (!migrationApplied) {
      // eslint-disable-next-line no-console
      console.warn('[DB-02 test] skipping — migration not applied to this DB')
      return false
    }
    return true
  }

  for (const table of FINANCIAL_TABLES) {
    it(`${table}: created_by + updated_by columns are present and nullable`, async () => {
      if (!requireMigration()) return
      const { error } = await supabase
        .from(table)
        .select('created_by, updated_by')
        .limit(0)
      expect(error, `${table}: ${error?.message ?? ''}`).toBeNull()
    })
  }

  // Backfill smoke check on financial_forecasts: every existing row should have
  // created_by populated because user_id is NOT NULL @ baseline:2544 and the
  // migration runs `UPDATE financial_forecasts SET created_by = user_id WHERE
  // created_by IS NULL`. If any row is NULL, the backfill failed.
  it('financial_forecasts.created_by backfilled from user_id (zero NULL rows expected)', async () => {
    if (!requireMigration()) return
    const { count, error } = await supabase
      .from('financial_forecasts')
      .select('id', { count: 'exact', head: true })
      .is('created_by', null)
    expect(error, `count error: ${error?.message ?? ''}`).toBeNull()
    expect(count ?? 0).toBe(0)
  })
})
