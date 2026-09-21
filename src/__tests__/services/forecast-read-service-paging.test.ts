/**
 * ForecastReadService.getMonthlyComposite reads EVERY xero_pl_lines row.
 *
 * The composite feeds the monthly report, the full-year page, the cashflow
 * actuals and the forecast wizard's history. Its Xero rows are read in pages
 * because PostgREST cuts each response to 1,000 rows — JDS had 1,764 and
 * Efficient Living 1,272 on 15 Sep 2026. These cases run against a PostgREST
 * fake that makes that cut and answers in storage order, the same way prod does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

import { ForecastReadService } from '@/lib/services/forecast-read-service'
import { IncompleteReadError } from '@/lib/supabase/read-all-rows'
import { FakePostgrest, uuidAt, type FakeRow, type FakeTableOptions } from '@/__tests__/helpers/postgrest-fake'

const FORECAST_ID = 'forecast-1'
const BIZ = '0219d3a9-0000-4000-8000-000000000001'
const PROFILE = '900aa935-0000-4000-8000-000000000002'

let db: FakePostgrest

beforeEach(() => {
  db = new FakePostgrest()
  db.table('financial_forecasts', [{
    id: FORECAST_ID,
    business_id: BIZ,
    fiscal_year: 2027,
    is_active: true,
    is_completed: true,
    updated_at: '2026-09-01T00:00:00Z',
    assumptions_published_at: '2026-09-01T00:00:00Z',
  }])
  db.table('business_profiles', [{ id: PROFILE, business_id: BIZ }])
  db.table('forecast_pl_lines', [{
    forecast_id: FORECAST_ID,
    account_code: '200',
    account_name: 'Sales',
    category: 'Revenue',
    forecast_months: {},
    computed_at: '2026-09-02T00:00:00Z',
  }])
})

/** Months from Jul 2024, as period_month dates. */
const monthsFromJul2024 = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const m = 6 + i
    return `${2024 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-01`
  })

/**
 * `accounts` COGS accounts × `months` months, stored oldest month first with ids
 * ascending in that order, each month worth $(month index + 1).
 */
function seedPL(accounts: number, months: number, options?: FakeTableOptions, extra: (i: number) => FakeRow = () => ({})) {
  const rows: FakeRow[] = []
  monthsFromJul2024(months).forEach((period_month, m) => {
    for (let a = 0; a < accounts; a++) {
      const i = rows.length
      rows.push({
        id: uuidAt(i),
        business_id: PROFILE,
        tenant_id: 'tenant-jds',
        account_code: String(50000 + a),
        account_name: `Cost ${a}`,
        account_type: 'cogs',
        period_month,
        amount: m + 1,
        basis: 'accruals',
        deleted_at: null,
        ...extra(i),
      })
    }
  })
  return db.table('xero_pl_lines', rows, options)
}

const read = () => new ForecastReadService(db as any).getMonthlyComposite(FORECAST_ID)
const total = (rows: Array<{ monthly_values: Record<string, number> }>) =>
  rows.reduce((s, r) => s + Object.values(r.monthly_values).reduce((x, v) => x + v, 0), 0)
/** Sum of 1..n: each account's total over n months. */
const triangle = (n: number) => (n * (n + 1)) / 2

describe('getMonthlyComposite — every xero_pl_lines row', () => {
  it('JDS-sized (1,764 rows): the newest months are past the first 1,000 rows and still in the composite', async () => {
    // 84 accounts × 21 months (Jul 2024 – Mar 2026). Stored oldest first, so the
    // first 1,000 rows stop part-way through Jun 2025 and every later month is
    // past the cut.
    seedPL(84, 21)
    const composite = await read()
    expect(composite.rows).toHaveLength(84)
    expect(composite.rows.every((r) => r.monthly_values['2026-03'] === 21)).toBe(true)
    expect(total(composite.rows)).toBe(84 * triangle(21))
    expect(composite.coverage).toMatchObject({ months_covered: 21, first_period: '2024-07', last_period: '2026-03' })
    expect(db.requestsTo('xero_pl_lines').map((p) => p.rowsReturned)).toEqual([1000, 764, 0])
  })

  it('reads the business under both id spaces, accruals only, never soft-deleted rows', async () => {
    seedPL(1, 1)
    const table = db.tables.get('xero_pl_lines')!
    table.insert({ ...table.rows[0], id: uuidAt(10), basis: 'cash' })
    table.insert({ ...table.rows[0], id: uuidAt(11), deleted_at: '2026-09-01T00:00:00Z' })
    const composite = await read()
    expect(composite.rows[0].monthly_values).toEqual({ '2024-07': 1 })
    expect(db.requestsTo('xero_pl_lines')[0].filters).toEqual([
      `business_id=in.(${PROFILE},${BIZ})`,
      'basis=eq.accruals',
      'deleted_at=is.null',
    ])
  })

  it('a Max rows cap below the page size: a short page is not the end', async () => {
    seedPL(84, 21, { maxRows: 400 })
    const composite = await read()
    expect(total(composite.rows)).toBe(84 * triangle(21))
    expect(db.requestsTo('xero_pl_lines').map((p) => p.rowsReturned)).toEqual([400, 400, 400, 400, 164, 0])
  })

  it('exactly 1,000 rows: the full page is followed by the empty page that ends the read', async () => {
    seedPL(100, 10)
    const composite = await read()
    expect(composite.rows).toHaveLength(100)
    expect(total(composite.rows)).toBe(100 * triangle(10))
    expect(db.requestsTo('xero_pl_lines').map((p) => p.rowsReturned)).toEqual([1000, 0])
  })

  it('a sync rewriting rows between two pages neither counts them twice nor drops others', async () => {
    seedPL(84, 21, {
      // A re-sync of July 2024 moves those 84 rows to the end of storage.
      beforeRequest: (n, table) => { if (n === 1) table.rewrite((r) => r.period_month === '2024-07-01') },
    })
    const composite = await read()
    expect(total(composite.rows)).toBe(84 * triangle(21))
  })

  it('a failed later page rejects — callers answer 500, not a P&L with accounts missing', async () => {
    seedPL(84, 21, { failOnRequest: [1] })
    const failure = await read().then(() => null, (e: unknown) => e)
    expect(failure).toBeInstanceOf(IncompleteReadError)
    expect(failure).toMatchObject({ source: 'xero_pl_lines', reason: 'query_error', rowsRead: 1000 })
  })
})
