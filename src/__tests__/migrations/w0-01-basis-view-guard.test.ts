/**
 * W0.1 — basis guard on the xero wide-compat views.
 *
 * Locks `20260831082216_xero_wide_compat_basis_guard.sql`, which restricts
 * xero_pl_lines_wide_compat and xero_bs_lines_wide_compat to `basis = 'accruals'`
 * (and, on the P&L view, `deleted_at IS NULL`).
 *
 * The defect this prevents is silent, which is why it is worth a change-detector.
 * Both views GROUP BY basis, so they emit one row per (account, basis). No
 * consumer filters basis — the only two `eq('basis')` mentions in the repo are
 * write-side parsers stamping the value. So the first cash row would:
 *
 *   - be SUMMED into the accrual figure by ForecastReadService.aggregateXeroRows
 *     (which powers the monthly report, forecast wizard, dashboard and cashflow),
 *     roughly doubling every number; and
 *   - OVERWRITE the accrual figure in api/monthly-report/generate, which merges
 *     `{ ...existing, ...row.monthly_values }` in whatever order rows arrive.
 *
 * Nothing throws in either case.
 *
 * The most valuable assertion here is not that the migration was written — it is
 * that no LATER migration redefines either view without the guard. Migrations are
 * append-only, so "the last definition wins" is the thing to police.
 *
 * Static-file assertions only; they run without a live DB. The Supabase preview
 * branch applies the migration for real, so apply-time remains the live check.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations')
const GUARD_MIGRATION = '20260831082216_xero_wide_compat_basis_guard.sql'

/** Strip `--` line comments so prose in a header can't satisfy an assertion. */
function executableSql(fileName: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, fileName), 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/**
 * The last migration (by filename order, which is timestamp order) that defines
 * `viewName`. That definition is the one that is actually live.
 */
function lastDefinitionOf(viewName: string): { file: string; sql: string } {
  const pattern = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?VIEW\\s+(?:public\\.)?"?${viewName}"?\\b`,
    'i',
  )
  const matches = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f !== '00000000000000_baseline_schema.sql')
    .sort()
    .filter((f) => pattern.test(executableSql(f)))

  if (matches.length === 0) {
    expect.fail(`No migration defines the view ${viewName}`)
  }
  const file = matches[matches.length - 1]
  return { file, sql: executableSql(file) }
}

/** The body of the CREATE ... VIEW statement for `viewName`, up to its terminating `;`. */
function viewBody(sql: string, viewName: string): string {
  const start = sql.search(
    new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?VIEW\\s+(?:public\\.)?"?${viewName}"?\\b`, 'i'),
  )
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf(';', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('W0.1: basis guard on xero wide-compat views', () => {
  it('the guard migration exists', () => {
    expect(existsSync(resolve(MIGRATIONS_DIR, GUARD_MIGRATION))).toBe(true)
  })

  describe.each([
    ['xero_pl_lines_wide_compat', true],
    ['xero_bs_lines_wide_compat', false],
  ] as const)('%s', (viewName, expectsSoftDeleteFilter) => {
    it("its live definition filters basis = 'accruals'", () => {
      const { file, sql } = lastDefinitionOf(viewName)
      const body = viewBody(sql, viewName)
      expect(
        /WHERE[\s\S]*basis\s*=\s*'accruals'/i.test(body),
        `${file} defines ${viewName} without a basis = 'accruals' filter. ` +
          'An unfiltered view double-counts or overwrites every figure once a cash ' +
          'row exists — see the migration header.',
      ).toBe(true)
    })

    it('does not widen the filter to an exclusion predicate', () => {
      // `basis <> 'cash'` would silently admit any future third basis.
      const { sql } = lastDefinitionOf(viewName)
      const body = viewBody(sql, viewName)
      expect(/basis\s*(<>|!=)/i.test(body)).toBe(false)
    })

    it(`${expectsSoftDeleteFilter ? 'filters' : 'does not need'} deleted_at`, () => {
      const { sql } = lastDefinitionOf(viewName)
      const body = viewBody(sql, viewName)
      // xero_pl_lines carries deleted_at/deleted_by; xero_bs_lines does not.
      expect(/deleted_at\s+IS\s+NULL/i.test(body)).toBe(expectsSoftDeleteFilter)
    })

    it('re-asserts security_invoker so RLS still applies to view queries', () => {
      const { sql } = lastDefinitionOf(viewName)
      expect(
        new RegExp(
          `ALTER\\s+VIEW\\s+(?:public\\.)?"?${viewName}"?\\s+SET\\s*\\(\\s*security_invoker\\s*=\\s*on`,
          'i',
        ).test(sql),
      ).toBe(true)
    })
  })

  it('the guard migration is the live definition for both views', () => {
    // If a later migration redefines either view, the assertions above already
    // police its content — but this pins the expected state so a redefinition is
    // a deliberate, visible decision rather than an accident.
    expect(lastDefinitionOf('xero_pl_lines_wide_compat').file).toBe(GUARD_MIGRATION)
    expect(lastDefinitionOf('xero_bs_lines_wide_compat').file).toBe(GUARD_MIGRATION)
  })
})
