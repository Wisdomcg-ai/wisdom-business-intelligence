/**
 * Phase 65 — ForecastService.loadActualsAsPLLines
 *
 * Verifies the aggregation that powers the prior-FY actuals view. A row per
 * (account_code, month) in xero_pl_lines becomes one PLLine per account_code
 * with actual_months keyed by 'YYYY-MM'.
 *
 * The client is a PostgREST fake that cuts every response to Max rows and
 * answers in storage order, so the paging cases below fail the way production
 * would if the read stopped early or double-read a page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakePostgrest, uuidAt, type FakeRow } from '@/__tests__/helpers/postgrest-fake'

type RawRow = {
  account_code: string | null
  account_name: string | null
  account_type: string | null
  period_month: string
  amount: number
}

// Rebuilt per test; the mocked client module reads it at query time.
let db: FakePostgrest

vi.mock('@/lib/supabase/client', () => {
  const supabase = {
    from: (table: string) => db.from(table),
    auth: { getUser: async () => ({ data: { user: null } }) },
  }
  return { createClient: () => supabase }
})

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import * as Sentry from '@sentry/nextjs'
import { ForecastService } from '../forecast-service'
import { IncompleteReadError } from '@/lib/supabase/read-all-rows'

let seq = 0
/** A stored xero_pl_lines row: live, accruals, ids ascending in insert order. */
const stored = (row: RawRow, extra: FakeRow = {}): FakeRow => ({
  id: uuidAt(seq++),
  business_id: 'biz-1',
  tenant_id: 'tenant-1',
  basis: 'accruals',
  deleted_at: null,
  ...row,
  ...extra,
})

function seedXeroRows(rows: RawRow[], options?: Parameters<FakePostgrest['table']>[2]) {
  return db.table('xero_pl_lines', rows.map((r) => stored(r)), options)
}

beforeEach(() => {
  seq = 0
  db = new FakePostgrest()
  db.table('business_profiles', [])
  vi.mocked(Sentry.captureException).mockClear()
})

/** FY25 (AU) month keys, Jul 2024 – Jun 2025, as period_month dates. */
const FY25_MONTHS = ['2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06']

/** `accounts` opex accounts × the given months, stored oldest month first, $1 × (month index + 1). */
function accountsByMonth(accounts: number, months: string[]): RawRow[] {
  const rows: RawRow[] = []
  months.forEach((month, m) => {
    for (let a = 0; a < accounts; a++) {
      rows.push({ account_code: String(60000 + a), account_name: `Expense ${a}`, account_type: 'opex', period_month: `${month}-01`, amount: m + 1 })
    }
  })
  return rows
}

describe('ForecastService.loadActualsAsPLLines', () => {
  it('returns empty array when no xero_pl_lines exist', async () => {
    seedXeroRows([])
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
    expect(out).toEqual([])
  })

  it('aggregates per-account amounts across months in the FY range (yearStart=7)', async () => {
    // FY25 (AU FY) = Jul 2024 – Jun 2025
    seedXeroRows([
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-07-01', amount: 10000 },
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-08-01', amount: 12000 },
      { account_code: '400', account_name: 'Rent', account_type: 'opex', period_month: '2024-07-01', amount: 5000 },
      // Row outside the FY range — should be filtered out by gte/lte.
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2025-07-01', amount: 999999 },
    ])
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)

    expect(out).toHaveLength(2)
    const sales = out.find(l => l.account_code === '200')
    const rent = out.find(l => l.account_code === '400')

    expect(sales).toBeDefined()
    expect(sales!.account_name).toBe('Sales')
    expect(sales!.account_type).toBe('revenue')
    expect(sales!.is_from_xero).toBe(true)
    expect(sales!.actual_months).toEqual({ '2024-07': 10000, '2024-08': 12000 })
    expect(sales!.forecast_months).toEqual({})

    expect(rent!.actual_months).toEqual({ '2024-07': 5000 })
    // Sanity: the out-of-range row (2025-07) didn't leak into the FY25 result.
    expect(sales!.actual_months['2025-07']).toBeUndefined()
  })

  it('sums duplicate (account, month) rows from multiple tenants', async () => {
    db.table('xero_pl_lines', [
      stored({ account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-07-01', amount: 5000 }, { tenant_id: 'org-a' }),
      stored({ account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-07-01', amount: 3000 }, { tenant_id: 'org-b' }),
    ])
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
    expect(out).toHaveLength(1)
    expect(out[0].actual_months['2024-07']).toBe(8000)
  })

  it('groups rows with null account_code by account_name fallback', async () => {
    seedXeroRows([
      { account_code: null, account_name: 'Misc', account_type: 'opex', period_month: '2024-07-01', amount: 100 },
      { account_code: null, account_name: 'Misc', account_type: 'opex', period_month: '2024-08-01', amount: 200 },
    ])
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
    expect(out).toHaveLength(1)
    expect(out[0].account_name).toBe('Misc')
    expect(out[0].actual_months).toEqual({ '2024-07': 100, '2024-08': 200 })
  })

  it('handles calendar-year fiscal years (yearStart=1, FY2025 = Jan-Dec 2025)', async () => {
    seedXeroRows([
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-12-01', amount: 999999 }, // outside
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2025-01-01', amount: 1000 },
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2025-12-01', amount: 2000 },
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2026-01-01', amount: 999999 }, // outside
    ])
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 1)
    expect(out).toHaveLength(1)
    expect(out[0].actual_months).toEqual({ '2025-01': 1000, '2025-12': 2000 })
  })

  it('sorts output by account_type then account_name', async () => {
    seedXeroRows([
      { account_code: '400', account_name: 'Rent', account_type: 'opex', period_month: '2024-07-01', amount: 1 },
      { account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-07-01', amount: 1 },
      { account_code: '300', account_name: 'Wages', account_type: 'cogs', period_month: '2024-07-01', amount: 1 },
    ])
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
    expect(out.map(l => l.account_type)).toEqual(['cogs', 'opex', 'revenue'])
  })

  it('reads accruals only and skips soft-deleted rows — a cash twin would double the month', async () => {
    db.table('xero_pl_lines', [
      stored({ account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-07-01', amount: 10000 }),
      stored({ account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-07-01', amount: 10000 }, { basis: 'cash' }),
      stored({ account_code: '200', account_name: 'Sales', account_type: 'revenue', period_month: '2024-07-01', amount: 10000 }, { deleted_at: '2026-09-01T00:00:00Z' }),
    ])
    const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
    expect(out[0].actual_months).toEqual({ '2024-07': 10000 })
    expect(db.requestsTo('xero_pl_lines')[0].filters).toEqual([
      'business_id=in.(biz-1)',
      'basis=eq.accruals',
      'deleted_at=is.null',
      'period_month=gte.2024-07-01',
      'period_month=lte.2025-06-30',
    ])
  })

  describe('reading every row past the 1,000-row cap', () => {
    it('the months after the first 1,000 rows are in the answer', async () => {
      // 90 accounts × 12 months = 1,080 rows stored oldest month first: June's
      // rows are all but ten of them past the cut.
      seedXeroRows(accountsByMonth(90, FY25_MONTHS))
      const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
      expect(out).toHaveLength(90)
      for (const line of out) {
        expect(Object.keys(line.actual_months)).toHaveLength(12)
        expect(line.actual_months['2025-06']).toBe(12)
      }
      expect(db.requestsTo('xero_pl_lines').map((p) => p.rowsReturned)).toEqual([1000, 80, 0])
    })

    it('a Max rows cap below the page size: a short page is not the end', async () => {
      seedXeroRows(accountsByMonth(90, FY25_MONTHS), { maxRows: 250 })
      const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
      expect(out).toHaveLength(90)
      expect(out.every((l) => l.actual_months['2025-06'] === 12)).toBe(true)
      expect(db.requestsTo('xero_pl_lines').map((p) => p.rowsReturned)).toEqual([250, 250, 250, 250, 80, 0])
    })

    it('exactly 1,000 rows: the full page is followed by the empty page that ends the read', async () => {
      seedXeroRows(accountsByMonth(100, FY25_MONTHS.slice(0, 10)))
      const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
      expect(out).toHaveLength(100)
      expect(db.requestsTo('xero_pl_lines').map((p) => p.rowsReturned)).toEqual([1000, 0])
    })

    it('a sync rewriting rows between two pages neither counts them twice nor drops others', async () => {
      seedXeroRows(accountsByMonth(90, FY25_MONTHS), {
        // The UPDATE moves July's rows (the first 90 ids) to the end of storage.
        beforeRequest: (n, table) => { if (n === 1) table.rewrite((r) => String(r.period_month) === '2024-07-01') },
      })
      const out = await ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)
      const total = out.reduce((s, l) => s + Object.values(l.actual_months).reduce((x, v) => x + v, 0), 0)
      expect(total).toBe(90 * (12 * 13) / 2)
    })

    it('a failed later page THROWS — [] would tell the page this business has no actuals', async () => {
      seedXeroRows(accountsByMonth(90, FY25_MONTHS), { failOnRequest: [1] })
      await expect(ForecastService.loadActualsAsPLLines('biz-1', 2025, 7)).rejects.toThrow(
        'Could not load all of your Xero actuals. Please try again.',
      )
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(IncompleteReadError),
        expect.objectContaining({ tags: { invariant: 'forecast-actuals-read-incomplete' } }),
      )
    })
  })
})
