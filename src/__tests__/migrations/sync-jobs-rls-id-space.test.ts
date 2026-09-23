/**
 * sync_jobs RLS — the SELECT policy compared the wrong id-space (16 Sep 2026).
 *
 * `sync_jobs.business_id` is in the `business_profiles.id` space (FK added by
 * 20260611010000_fk_integrity_phase_a_uuid_business_id.sql, Group A), but the
 * original policy in 20260428000002_sync_jobs_table.sql tested it against two
 * subqueries that both return `businesses.id` values:
 *
 *     business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())
 *     business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
 *
 * The spaces are disjoint, so the predicate was never true and every
 * authenticated read returned zero rows — for owners, members, coaches and
 * super-admins alike. Verified in production: 0 id overlap between the two
 * tables (31 rows each), all 3,912 sync_jobs rows in profiles-space, and a real
 * owner impersonated via RLS saw 2 xero_connections but 0 of their own 709
 * sync_jobs rows.
 *
 * Static-file assertions only — they run in CI placeholder mode (no live DB).
 * The Supabase preview branch applies the migration directly, so apply-time is
 * the live enforcement; these are change-detectors that keep the policy from
 * regressing to a hand-rolled, id-space-confused form.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260916120000_sync_jobs_rls_profile_id_space.sql',
)

function readMigration(): string {
  if (!existsSync(MIGRATION_PATH)) {
    expect.fail(`Migration file missing: ${MIGRATION_PATH}`)
  }
  return readFileSync(MIGRATION_PATH, 'utf8')
}

/**
 * Strip `--` line comments so assertions about EXECUTABLE SQL aren't fooled by
 * the header, which legitimately quotes the old broken predicate as prose.
 */
function executableSql(): string {
  return readMigration()
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

describe('sync_jobs RLS id-space migration (static checks)', () => {
  it('migration file exists at the expected path', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  it('drops the id-space-confused policy before recreating it', () => {
    expect(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+"?sync_jobs_coach_select"?/i.test(executableSql()),
      'migration must DROP the old sync_jobs_coach_select policy (CREATE POLICY does not replace)',
    ).toBe(true)
  })

  it('recreates it as SELECT for authenticated', () => {
    const sql = executableSql()
    expect(/CREATE\s+POLICY\s+"?sync_jobs_coach_select"?\s+ON\s+(public\.)?sync_jobs/i.test(sql)).toBe(true)
    expect(/FOR\s+SELECT\s+TO\s+authenticated/i.test(sql)).toBe(true)
  })

  it('uses the house predicate, which spans BOTH id-spaces', () => {
    const sql = executableSql()
    // auth_get_accessible_business_ids() unions business_profiles.id for owned,
    // coached and member businesses — that union is what makes it correct for a
    // profiles-space key like sync_jobs.business_id.
    expect(
      /business_id\s*=\s*ANY\s*\(\s*auth_get_accessible_business_ids\(\)\s*\)/i.test(sql),
      'policy must key off auth_get_accessible_business_ids()',
    ).toBe(true)
    expect(
      /auth_is_super_admin\(\)/i.test(sql),
      'policy must admit super-admins — the old one had no such clause',
    ).toBe(true)
  })

  it('does NOT reintroduce either businesses-space subquery', () => {
    const sql = executableSql()
    expect(
      /SELECT\s+business_id\s+FROM\s+business_users/i.test(sql),
      'business_users.business_id is businesses-space — comparing it to sync_jobs.business_id matches nothing',
    ).toBe(false)
    expect(
      /SELECT\s+id\s+FROM\s+businesses\b/i.test(sql),
      'businesses.id is the wrong space for this table',
    ).toBe(false)
  })

  it('leaves append-only semantics intact — no authenticated write policy', () => {
    const sql = executableSql()
    expect(/FOR\s+(INSERT|UPDATE|DELETE)/i.test(sql)).toBe(false)
    expect(/FOR\s+ALL\s+TO\s+authenticated/i.test(sql)).toBe(false)
  })

  it('grants nothing to anon or PUBLIC', () => {
    const sql = executableSql()
    expect(/GRANT\b[\s\S]*\b(anon|PUBLIC)\b/i.test(sql)).toBe(false)
    expect(/TO\s+anon\b/i.test(sql)).toBe(false)
  })
})

describe('the original policy is the one being corrected', () => {
  const ORIGINAL = resolve(process.cwd(), 'supabase/migrations/20260428000002_sync_jobs_table.sql')

  it('still carries the broken predicate — this migration is what fixes it', () => {
    // If someone edits history instead of adding a forward migration, this
    // fails and points at the real rule: migrations are append-only.
    const sql = readFileSync(ORIGINAL, 'utf8')
    expect(/SELECT\s+business_id\s+FROM\s+business_users/i.test(sql)).toBe(true)
    expect(/SELECT\s+id\s+FROM\s+businesses/i.test(sql)).toBe(true)
  })

  it('confirms sync_jobs.business_id is FKd to business_profiles, not businesses', () => {
    // The FK is the proof of which id-space the column holds. Group A of the
    // Phase A FK migration references business_profiles(id).
    const fk = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260611010000_fk_integrity_phase_a_uuid_business_id.sql'),
      'utf8',
    )
    const groupA = fk.slice(0, fk.indexOf('Group B'))
    expect(groupA).toContain("'sync_jobs'")
    expect(groupA).toMatch(/references\s+public\.business_profiles\(id\)/i)
  })
})
