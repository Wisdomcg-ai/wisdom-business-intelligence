/**
 * S3 (22 Sep 2026 system diagnostic) — notifications belong to their recipient.
 *
 * The only policy on public.notifications was `rls_access` FOR ALL to
 * authenticated, keyed on business_id alone: any member of business X could
 * INSERT a notification addressed to X's coach or to Matt with any link, and
 * read/edit/delete notifications addressed to anyone else in X.
 *
 * Static-file assertions (CI has no live DB); the Supabase preview branch
 * applies the migration, which is the live check.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260922000000_notifications_recipient_only_rls.sql',
)

/** Executable SQL only — the header quotes the old policy as prose. */
function executableSql(): string {
  if (!existsSync(MIGRATION_PATH)) expect.fail(`Migration file missing: ${MIGRATION_PATH}`)
  return readFileSync(MIGRATION_PATH, 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** The USING / WITH CHECK text of one named policy. */
function policyBody(name: string): string {
  const sql = executableSql()
  const start = sql.search(new RegExp(`create\\s+policy\\s+"?${name}"?\\s`, 'i'))
  expect(start, `policy ${name} must exist`).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf(';', start)
  return sql.slice(start, end)
}

describe('notifications recipient-only RLS (static checks)', () => {
  it('drops the business-keyed FOR ALL policy', () => {
    expect(/drop\s+policy\s+if\s+exists\s+"?rls_access"?\s+on\s+public\.notifications/i.test(executableSql())).toBe(true)
  })

  it('gives authenticated users NO insert path — notifications are written only by service_role / SECURITY DEFINER code', () => {
    const sql = executableSql()
    expect(/for\s+insert/i.test(sql)).toBe(false)
    expect(/for\s+all\s+to\s+authenticated/i.test(sql)).toBe(false)
  })

  it('reads are the recipient (or a super_admin)', () => {
    const body = policyBody('notifications_recipient_select')
    expect(body).toMatch(/for\s+select\s+to\s+authenticated/i)
    expect(body).toMatch(/user_id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)/i)
    expect(body).toMatch(/auth_is_super_admin\(\)/i)
    expect(body, 'must not fall back to business membership').not.toMatch(/business_id/i)
  })

  it('updates and deletes are the recipient only — using AND with check', () => {
    const update = policyBody('notifications_recipient_update')
    expect(update).toMatch(/for\s+update\s+to\s+authenticated/i)
    expect(update).toMatch(/using\s*\(\s*user_id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)\s*\)/i)
    expect(update).toMatch(/with\s+check\s*\(\s*user_id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)\s*\)/i)

    const del = policyBody('notifications_recipient_delete')
    expect(del).toMatch(/for\s+delete\s+to\s+authenticated/i)
    expect(del).toMatch(/using\s*\(\s*user_id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)\s*\)/i)
    expect(del).not.toMatch(/business_id/i)
  })

  it('grants nothing to anon or PUBLIC', () => {
    const sql = executableSql()
    expect(/grant\b/i.test(sql)).toBe(false)
    expect(/to\s+(anon|public)\b/i.test(sql)).toBe(false)
  })
})

describe('the authenticated insert route is gone', () => {
  it('/api/notifications/create no longer exists (it was the only authenticated insert path, with no callers)', () => {
    expect(existsSync(resolve(process.cwd(), 'src/app/api/notifications/create/route.ts'))).toBe(false)
  })
})
