/**
 * WB.1 — payroll facts tables migration.
 *
 * Static change-detector on `20260831133849_payroll_facts_tables.sql`. The
 * apply-time enforcement is the Supabase preview branch; these assertions keep
 * the security shape from silently regressing (mirrors r2-sec-n6 pattern):
 *
 *   - every new public table enables RLS in the same migration (CI rule C
 *     enforces presence; this pins the POLICY shape too — the canonical
 *     auth_is_super_admin/auth_get_accessible_business_ids pair, not a
 *     hand-rolled owner/coach predicate, which is exactly the defect R2/SEC-N6
 *     had to correct on xero_balance_sheet_lines)
 *   - natural keys exist so sync upserts are idempotent
 *   - no anon grants
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20260831133849_payroll_facts_tables.sql',
)

function sql(): string {
  if (!existsSync(MIGRATION)) expect.fail(`Migration missing: ${MIGRATION}`)
  return readFileSync(MIGRATION, 'utf8')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
}

const TABLES = ['xero_pay_runs', 'xero_payslip_lines', 'xero_employees'] as const

describe('WB.1 payroll facts migration', () => {
  it('creates all three tables', () => {
    const s = sql()
    for (const t of TABLES) {
      expect(s).toMatch(new RegExp(`create table public\\.${t}`, 'i'))
    }
  })

  it.each(TABLES)('%s enables RLS', (t) => {
    expect(sql()).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, 'i'))
  })

  it.each(TABLES)('%s uses the canonical helper-based access policy', (t) => {
    const s = sql()
    const policyBlock = s.slice(s.indexOf(`create policy ${t}_access`))
    expect(policyBlock).toMatch(/auth_is_super_admin\(\)/)
    expect(policyBlock).toMatch(/auth_get_accessible_business_ids\(\)/)
  })

  it.each(TABLES)('%s has a service_role policy (sync writes bypass nothing silently)', (t) => {
    expect(sql()).toMatch(new RegExp(`create policy ${t}_service_role`, 'i'))
  })

  it('natural keys make the sync upserts idempotent', () => {
    const s = sql()
    expect(s).toMatch(/unique \(business_id, tenant_id, pay_run_id\)/)
    expect(s).toMatch(/unique \(business_id, tenant_id, payslip_id\)/)
    expect(s).toMatch(/unique \(business_id, tenant_id, employee_id\)/)
  })

  it('grants nothing to anon or PUBLIC', () => {
    expect(sql()).not.toMatch(/grant .* to (anon|public)/i)
  })

  it('pay runs carry detail_synced_at — the backfill convergence marker', () => {
    // Without this column an interrupted backfill either re-fetches every run
    // each cycle or never finishes; see payroll-sync.ts pickRunsNeedingDetail.
    expect(sql()).toMatch(/detail_synced_at timestamptz/)
  })

  it('payment_date indexes exist for the month-window read path', () => {
    const s = sql()
    expect(s).toMatch(/xero_pay_runs_payment_date_idx/)
    expect(s).toMatch(/xero_payslip_lines_payment_date_idx/)
  })
})
