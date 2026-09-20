import { describe, it, expect } from 'vitest'
import {
  incompleteMonthReason,
  isClosedMonth,
  recentClosedMonths,
  type MonthlyRatePair,
} from './oxr'
import {
  loadConsolidationFxPairs,
  oxrRateRows,
  planFxMonth,
  type StoredFxRate,
} from './fx-rate-sync'

const SEP_16 = new Date('2026-09-16T02:15:00Z')

function derived(overrides: Partial<MonthlyRatePair> = {}): MonthlyRatePair {
  const days = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
  return {
    currency_pair: 'HKD/AUD',
    year: 2026,
    month: 8,
    monthly_average: 0.179536,
    closing_spot: 0.177902,
    closing_spot_date: '2026-08-31',
    days_fetched: days,
    days_missing: [],
    ...overrides,
  }
}

describe('oxr: isClosedMonth', () => {
  it('a month is open until its last day has ended in UTC', () => {
    expect(isClosedMonth(2026, 8, new Date('2026-08-31T23:59:59Z'))).toBe(false)
    expect(isClosedMonth(2026, 8, new Date('2026-09-01T00:00:00Z'))).toBe(true)
  })

  it('the current month is never closed', () => {
    expect(isClosedMonth(2026, 9, SEP_16)).toBe(false)
    expect(isClosedMonth(2026, 10, SEP_16)).toBe(false)
  })
})

describe('oxr: recentClosedMonths', () => {
  it('lists closed months newest first, never the current month', () => {
    expect(recentClosedMonths(3, SEP_16)).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 7 },
      { year: 2026, month: 6 },
    ])
  })

  it('crosses the year boundary', () => {
    expect(recentClosedMonths(2, new Date('2027-01-01T02:15:00Z'))).toEqual([
      { year: 2026, month: 12 },
      { year: 2026, month: 11 },
    ])
  })
})

describe('oxr: incompleteMonthReason', () => {
  it('accepts a closed month with every day and a month-end close', () => {
    expect(incompleteMonthReason(derived(), SEP_16)).toBeNull()
  })

  it('refuses a month that has not closed', () => {
    const sep = derived({
      month: 9,
      closing_spot_date: '2026-09-16',
      days_fetched: Array.from({ length: 16 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`),
    })
    expect(incompleteMonthReason(sep, SEP_16)).toMatch(/not closed/)
  })

  it('refuses a month OXR has a gap in', () => {
    const d = derived({
      days_fetched: derived().days_fetched.filter((x) => x !== '2026-08-14'),
      days_missing: ['2026-08-14'],
    })
    expect(incompleteMonthReason(d, SEP_16)).toMatch(/2026-08-14/)
  })

  it('refuses a closing rate that is not dated at month-end', () => {
    const d = derived({
      closing_spot_date: '2026-08-30',
      days_fetched: derived().days_fetched.slice(0, 30),
      days_missing: ['2026-08-31'],
    })
    expect(incompleteMonthReason(d, SEP_16)).not.toBeNull()
    expect(incompleteMonthReason(derived({ closing_spot_date: '2026-08-30' }), SEP_16)).toMatch(/month-end/)
  })
})

describe('fx-rate-sync: oxrRateRows', () => {
  it('builds the two rows the admin "Sync from OXR" button writes', () => {
    expect(oxrRateRows(derived())).toEqual([
      { currency_pair: 'HKD/AUD', rate_type: 'monthly_average', period: '2026-08-01', rate: 0.179536, source: 'oxr' },
      { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-08-31', rate: 0.177902, source: 'oxr' },
    ])
  })
})

describe('fx-rate-sync: planFxMonth', () => {
  const row = (r: Partial<StoredFxRate>): StoredFxRate => ({
    id: r.id ?? `${r.rate_type}-${r.period}`,
    rate_type: 'monthly_average',
    period: '2026-05-01',
    source: 'oxr',
    updated_at: '2026-06-02T00:00:00Z',
    ...r,
  })

  it('a month with no rows writes both rates', () => {
    const plan = planFxMonth([], 2026, 6)
    expect(plan.write).toEqual({ monthly_average: true, closing_spot: true })
    expect(plan.keptManual).toEqual([])
    expect(plan.retire).toEqual([])
  })

  it('a month synced from OXR after it closed is left alone', () => {
    const plan = planFxMonth(
      [
        row({ rate_type: 'monthly_average', period: '2026-08-01', updated_at: '2026-09-15T20:18:05Z' }),
        row({ rate_type: 'closing_spot', period: '2026-08-31', updated_at: '2026-09-15T20:18:05Z' }),
      ],
      2026,
      8,
    )
    expect(plan.write).toEqual({ monthly_average: false, closing_spot: false })
    expect(plan.retire).toEqual([])
  })

  it('rewrites a partial month synced mid-month and retires its mid-month closing row (prod May 2026)', () => {
    const stale = row({ rate_type: 'closing_spot', period: '2026-05-25', updated_at: '2026-05-25T20:14:44Z' })
    const plan = planFxMonth(
      [row({ rate_type: 'monthly_average', period: '2026-05-01', updated_at: '2026-05-25T20:14:44Z' }), stale],
      2026,
      5,
    )
    expect(plan.write).toEqual({ monthly_average: true, closing_spot: true })
    expect(plan.retire).toEqual([stale])
  })

  it('never writes a rate type a coach entered by hand (prod April 2026)', () => {
    const plan = planFxMonth(
      [
        row({ rate_type: 'monthly_average', period: '2026-04-01', source: 'manual', updated_at: '2026-04-20T20:31:43Z' }),
        row({ rate_type: 'closing_spot', period: '2026-04-30', source: 'manual', updated_at: '2026-04-20T20:31:43Z' }),
      ],
      2026,
      4,
    )
    expect(plan.write).toEqual({ monthly_average: false, closing_spot: false })
    expect(plan.keptManual).toEqual(['monthly_average', 'closing_spot'])
  })

  it('fills the missing rate type next to a manual one', () => {
    const plan = planFxMonth([row({ rate_type: 'monthly_average', period: '2026-04-01', source: 'rba' })], 2026, 4)
    expect(plan.write).toEqual({ monthly_average: false, closing_spot: true })
    expect(plan.keptManual).toEqual(['monthly_average'])
  })

  it('a manual closing rate on any day of the month owns that month, and its oxr neighbours stay', () => {
    const plan = planFxMonth(
      [
        row({ rate_type: 'closing_spot', period: '2026-04-29', source: 'manual' }),
        row({ rate_type: 'closing_spot', period: '2026-04-15', source: 'oxr', updated_at: '2026-04-15T00:00:00Z' }),
      ],
      2026,
      4,
    )
    expect(plan.write.closing_spot).toBe(false)
    expect(plan.keptManual).toEqual(['closing_spot'])
    expect(plan.retire).toEqual([])
  })

  it('ignores rows from other months', () => {
    const plan = planFxMonth([row({ rate_type: 'closing_spot', period: '2026-07-31', updated_at: '2026-09-15T00:00:00Z' })], 2026, 8)
    expect(plan.write).toEqual({ monthly_average: true, closing_spot: true })
    expect(plan.retire).toEqual([])
  })
})

describe('fx-rate-sync: loadConsolidationFxPairs', () => {
  function fakeDb(rows: Array<Record<string, unknown>>) {
    const filters: Array<[string, unknown]> = []
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        filters.push([col, val])
        return builder
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve({
          data: rows.filter((r) => filters.every(([c, v]) => r[c] === v)),
          error: null,
        }).then(resolve, reject),
    }
    return { db: { from: (t: string) => (t === 'xero_connections' ? builder : null) } as any, filters }
  }

  it('one pair per foreign functional currency among active, consolidated connections', async () => {
    const { db, filters } = fakeDb([
      { functional_currency: 'HKD', is_active: true, include_in_consolidation: true },
      { functional_currency: 'hkd ', is_active: true, include_in_consolidation: true },
      { functional_currency: 'AUD', is_active: true, include_in_consolidation: true },
      { functional_currency: null, is_active: true, include_in_consolidation: true },
      { functional_currency: 'USD', is_active: false, include_in_consolidation: true },
      { functional_currency: 'NZD', is_active: true, include_in_consolidation: false },
      { functional_currency: 'H K', is_active: true, include_in_consolidation: true },
    ])
    expect(await loadConsolidationFxPairs(db)).toEqual(['HKD/AUD'])
    expect(filters).toEqual(expect.arrayContaining([['is_active', true], ['include_in_consolidation', true]]))
  })

  it('throws when the connections read fails, so the run cannot report "nothing to do"', async () => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      then: (resolve: any) => resolve({ data: null, error: { message: 'down' } }),
    }
    await expect(loadConsolidationFxPairs({ from: () => builder } as any)).rejects.toThrow(/down/)
  })
})
