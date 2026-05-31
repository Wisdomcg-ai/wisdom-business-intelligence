/**
 * R2 / SEC-N6 — xero_balance_sheet_lines RLS standardization.
 *
 * Locks the corrective migration
 * `20260601000000_fix_xero_balance_sheet_lines_rls_helper.sql`, which replaces
 * the hand-rolled owner/coach-only policy created in
 * 20260420032941_consolidation_bs_translation.sql with the canonical helper-based
 * access policy used by the sibling money tables (xero_pl_lines, xero_bs_lines).
 *
 * The original defect: the `_coach_all` policy granted visibility only to a
 * business's owner or assigned coach, silently hiding every consolidated
 * balance-sheet row from (a) ACTIVE team members and (b) any profile-id-keyed
 * row — because auth_get_accessible_business_ids() (which the sibling tables use)
 * UNIONs both cohorts but the hand-rolled predicate did not.
 *
 * Static-file assertions only — they run in CI placeholder mode (no live DB).
 * The Supabase preview branch applies the migration directly, so apply-time is
 * the live enforcement; these tests are change-detectors that keep the policy
 * from silently regressing to the hand-rolled form.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260601000000_fix_xero_balance_sheet_lines_rls_helper.sql',
)

function readMigration(): string {
  if (!existsSync(MIGRATION_PATH)) {
    expect.fail(`Migration file missing: ${MIGRATION_PATH}`)
  }
  return readFileSync(MIGRATION_PATH, 'utf8')
}

/**
 * Strip `--` line comments so assertions about EXECUTABLE SQL aren't fooled by
 * prose in the header (which legitimately describes the old buggy predicate).
 */
function executableSql(): string {
  return readMigration()
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

describe('R2/SEC-N6 xero_balance_sheet_lines RLS migration (static checks)', () => {
  it('migration file exists at the expected path', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  it('drops the hand-rolled owner/coach-only policy', () => {
    const sql = readMigration()
    expect(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+"?xero_balance_sheet_lines_coach_all"?/i.test(sql),
      'migration must DROP the buggy xero_balance_sheet_lines_coach_all policy',
    ).toBe(true)
  })

  it('drops the now-redundant standalone super_admin policy', () => {
    const sql = readMigration()
    expect(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+"?xero_balance_sheet_lines_super_admin_all"?/i.test(sql),
      'migration must DROP the redundant xero_balance_sheet_lines_super_admin_all policy',
    ).toBe(true)
  })

  it('creates the canonical _access policy', () => {
    const sql = readMigration()
    expect(
      /CREATE\s+POLICY\s+"?xero_balance_sheet_lines_access"?/i.test(sql),
      'migration must CREATE xero_balance_sheet_lines_access',
    ).toBe(true)
  })

  it('the access policy uses BOTH canonical helper functions (not the hand-rolled predicate)', () => {
    const sql = readMigration()
    // The helper that includes active team members + the profile-id bridge.
    expect(
      sql.includes('auth_get_accessible_business_ids'),
      'access policy must use auth_get_accessible_business_ids() (covers active team members + profile bridge)',
    ).toBe(true)
    // Super-admin folded into the access policy.
    expect(
      sql.includes('auth_is_super_admin'),
      'access policy must use auth_is_super_admin()',
    ).toBe(true)
  })

  it('does NOT reintroduce the hand-rolled owner/coach predicate in executable SQL', () => {
    const sql = executableSql()
    // The defective predicate keyed visibility off businesses.assigned_coach_id /
    // owner_id directly. The fix must route through the helper instead — so
    // neither column should appear as an access predicate in the executable SQL
    // (comments are stripped; the header legitimately describes the old form).
    expect(
      sql.includes('assigned_coach_id'),
      'migration must not re-key access off assigned_coach_id (use the helper)',
    ).toBe(false)
    expect(
      sql.includes('owner_id'),
      'migration must not re-key access off owner_id (use the helper)',
    ).toBe(false)
  })

  it('retains an explicit service_role bypass policy (sibling parity)', () => {
    const sql = readMigration()
    expect(
      /CREATE\s+POLICY\s+"?xero_balance_sheet_lines_service_role"?/i.test(sql),
      'migration must (re)create the xero_balance_sheet_lines_service_role policy',
    ).toBe(true)
  })
})
