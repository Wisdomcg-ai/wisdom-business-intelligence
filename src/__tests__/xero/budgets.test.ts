/**
 * Xero Budgets client — parsing pinned against the OpenAPI examples plus the
 * shapes we defend against (string amounts, /Date()/ periods, object-form
 * detail response, window filtering, 403 → scope missing).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/xero/xero-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xero/xero-api-client')>()
  return { ...actual, fetchXeroWithRateLimit: vi.fn() }
})

import { fetchXeroWithRateLimit, XeroHttpError } from '@/lib/xero/xero-api-client'
import {
  parseXeroBudgetPeriod,
  parseXeroAmount,
  parseXeroTimestamp,
  parseXeroBudgetsListResponse,
  parseXeroBudgetDetail,
  budgetCoverage,
  monthKeyToDateBounds,
  splitPeriodWindow,
  XERO_BUDGET_MAX_WINDOW_MONTHS,
  listXeroBudgets,
  getXeroBudget,
  BudgetsScopeMissingError,
} from '@/lib/xero/budgets'

const fetchMock = vi.mocked(fetchXeroWithRateLimit)

describe('parseXeroBudgetPeriod', () => {
  it('accepts YYYY-MM, YYYY-MM-DD and Microsoft /Date()/ stamps (UTC)', () => {
    expect(parseXeroBudgetPeriod('2019-08')).toBe('2019-08')
    expect(parseXeroBudgetPeriod(' 2019-08 ')).toBe('2019-08')
    expect(parseXeroBudgetPeriod('2019-08-01')).toBe('2019-08')
    expect(parseXeroBudgetPeriod('/Date(1564617600000+0000)/')).toBe('2019-08') // 2019-08-01T00:00Z
    expect(parseXeroBudgetPeriod('/Date(1564617600000)/')).toBe('2019-08')
  })
  it('rejects anything else', () => {
    expect(parseXeroBudgetPeriod('Aug 2019')).toBeNull()
    expect(parseXeroBudgetPeriod(201908)).toBeNull()
    expect(parseXeroBudgetPeriod(null)).toBeNull()
  })
})

describe('parseXeroAmount / parseXeroTimestamp', () => {
  it('reads numbers and numeric strings, rejects the rest', () => {
    expect(parseXeroAmount('1000')).toBe(1000)
    expect(parseXeroAmount('1,000.50')).toBe(1000.5)
    expect(parseXeroAmount(12.5)).toBe(12.5)
    expect(parseXeroAmount('')).toBeNull()
    expect(parseXeroAmount(null)).toBeNull()
    expect(parseXeroAmount('abc')).toBeNull()
    expect(parseXeroAmount(NaN)).toBeNull()
  })
  it('reads /Date()/ and ISO timestamps', () => {
    expect(parseXeroTimestamp('/Date(1622138002077+0000)/')).toBe('2021-05-27T17:53:22.077Z')
    expect(parseXeroTimestamp('2017-08-14T01:18:26.74')).toMatch(/^2017-08-14T/)
    expect(parseXeroTimestamp('nope')).toBeNull()
  })
})

const LIST_RESPONSE = {
  Id: '04e93d48', Status: 'OK',
  Budgets: [
    { BudgetID: '847da917-9565-466c-a9cd-3ecf7eb9d094', Status: 'APPROVED', Description: 'FY2021 budget', Type: 'TRACKING', UpdatedDateUTC: '/Date(1622138002077+0000)/', BudgetLines: [], Tracking: [{ Name: 'Region', Option: 'North' }] },
    { BudgetID: '93a4bab1-0021-4320-a2ec-c250528b4bc5', Status: 'APPROVED', Description: 'Overall Budget', Type: 'OVERALL', UpdatedDateUTC: '/Date(1622137786913+0000)/', BudgetLines: [], Tracking: [] },
  ],
}

describe('parseXeroBudgetsListResponse', () => {
  it('parses the OpenAPI example', () => {
    const out = parseXeroBudgetsListResponse(LIST_RESPONSE)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ budgetId: '847da917-9565-466c-a9cd-3ecf7eb9d094', name: 'FY2021 budget', type: 'TRACKING', tracking: [{ category: 'Region', option: 'North' }] })
    expect(out[1].type).toBe('OVERALL')
    expect(out[1].updatedAt).toBe('2021-05-27T17:49:46.913Z')
  })
  it('defaults a blank description and drops rows without an id', () => {
    const out = parseXeroBudgetsListResponse({ Budgets: [{ BudgetID: 'x', Type: 'OVERALL', Description: '  ' }, { Type: 'OVERALL' }] })
    expect(out).toEqual([expect.objectContaining({ budgetId: 'x', name: 'Overall Budget' })])
  })
  it('tolerates a missing or single-object Budgets field', () => {
    expect(parseXeroBudgetsListResponse({})).toEqual([])
    expect(parseXeroBudgetsListResponse({ Budgets: { BudgetID: 'solo', Type: 'OVERALL' } })).toHaveLength(1)
  })
})

const DETAIL_RESPONSE = {
  Budgets: {
    BudgetID: 'c1d195d4', Type: 'OVERALL', Description: 'FY27 Budget', UpdatedDateUTC: '2026-08-14T01:18:26.74',
    Tracking: [],
    BudgetLines: [
      { AccountID: 'acc-200', AccountCode: '200', BudgetBalances: [
        { Period: '2026-06', Amount: '999', UnitAmount: '0' },      // outside window
        { Period: '2026-07', Amount: '1000', UnitAmount: '0' },
        { Period: '2026-08', Amount: 1100, UnitAmount: 0 },
        { Period: '2026-08', Amount: '50' },                         // duplicate period → summed
        { Period: '/Date(1756684800000+0000)/', Amount: '1200' },    // 2025-09-01 → 2025-09 (outside)
      ] },
      { AccountID: 'acc-400', AccountCode: 400, BudgetBalances: [
        { Period: '2026-07', UnitAmount: '250' },                    // Amount absent → UnitAmount fallback
        { Period: '2026-08', Amount: null, UnitAmount: null },       // nothing usable → skipped
        { Period: 'garbage', Amount: '5' },
      ] },
    ],
  },
}

describe('parseXeroBudgetDetail', () => {
  it('parses the object-form detail, coerces types, sums duplicate periods and filters to the window', () => {
    const out = parseXeroBudgetDetail(DETAIL_RESPONSE, { from: '2026-07', to: '2027-06' })!
    expect(out.name).toBe('FY27 Budget')
    expect(out.lines).toHaveLength(2)
    expect(out.lines[0]).toEqual({ accountId: 'acc-200', accountCode: '200', months: { '2026-07': 1000, '2026-08': 1150 } })
    expect(out.lines[1]).toEqual({ accountId: 'acc-400', accountCode: '400', months: { '2026-07': 250 } })
  })
  it('keeps every period when no window is given', () => {
    const out = parseXeroBudgetDetail(DETAIL_RESPONSE)!
    expect(Object.keys(out.lines[0].months).sort()).toEqual(['2025-09', '2026-06', '2026-07', '2026-08'])
  })
  it('returns null when there is no budget', () => {
    expect(parseXeroBudgetDetail({ Budgets: [] })).toBeNull()
    expect(parseXeroBudgetDetail({})).toBeNull()
  })
})

describe('budgetCoverage / monthKeyToDateBounds', () => {
  const FY = ['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06']
  it('reports first/last period and months inside the FY', () => {
    const cov = budgetCoverage([
      { accountId: null, accountCode: '200', months: { '2026-07': 1, '2026-08': 1 } },
      { accountId: null, accountCode: '400', months: { '2027-06': 1, '2027-09': 1 } },
    ], FY)
    expect(cov).toMatchObject({ firstPeriod: '2026-07', lastPeriod: '2027-09', monthsInFY: 3 })
  })
  it('handles an empty budget', () => {
    expect(budgetCoverage([], FY)).toMatchObject({ firstPeriod: null, lastPeriod: null, monthsInFY: 0 })
  })
  it('turns month keys into Xero date bounds, month-end aware', () => {
    expect(monthKeyToDateBounds('2026-07', '2027-06')).toEqual({ dateFrom: '2026-07-01', dateTo: '2027-06-30' })
    expect(monthKeyToDateBounds('2027-07', '2028-02')).toEqual({ dateFrom: '2027-07-01', dateTo: '2028-02-29' })
  })
})

describe('splitPeriodWindow', () => {
  it('leaves a window of up to 24 months as one chunk', () => {
    expect(splitPeriodWindow({ from: '2026-07', to: '2027-06' })).toEqual([{ from: '2026-07', to: '2027-06' }])
    expect(splitPeriodWindow({ from: '2026-07', to: '2028-06' })).toEqual([{ from: '2026-07', to: '2028-06' }])
    expect(XERO_BUDGET_MAX_WINDOW_MONTHS).toBe(24)
  })
  it('splits a three-year window into 24 + 12 months (the live Xero cap)', () => {
    expect(splitPeriodWindow({ from: '2026-07', to: '2029-06' })).toEqual([
      { from: '2026-07', to: '2028-06' },
      { from: '2028-07', to: '2029-06' },
    ])
  })
  it('handles a single month, an inverted window and a custom cap', () => {
    expect(splitPeriodWindow({ from: '2026-07', to: '2026-07' })).toEqual([{ from: '2026-07', to: '2026-07' }])
    expect(splitPeriodWindow({ from: '2027-01', to: '2026-12' })).toEqual([])
    expect(splitPeriodWindow({ from: '2026-11', to: '2027-03' }, 2)).toEqual([
      { from: '2026-11', to: '2026-12' }, { from: '2027-01', to: '2027-02' }, { from: '2027-03', to: '2027-03' },
    ])
  })
})

describe('network wrappers', () => {
  // Block body on purpose: an arrow that RETURNS the mock hands vitest a
  // "cleanup" function, which it then calls after the test — with the throwing
  // implementation installed, that surfaced as an unhandled rejection.
  beforeEach(() => { fetchMock.mockReset() })
  const auth = { accessToken: 'tok', tenantId: 'tenant-1' }

  it('listXeroBudgets parses the response and passes auth through', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: LIST_RESPONSE, headers: {} })
    const out = await listXeroBudgets(auth)
    expect(out).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledWith('https://api.xero.com/api.xro/2.0/Budgets', auth)
  })
  it('maps a 403 to BudgetsScopeMissingError (org has not re-consented)', async () => {
    fetchMock.mockImplementation(async () => { throw new XeroHttpError(403, 'tenant-1', '{"Title":"Forbidden"}') })
    await expect(listXeroBudgets(auth)).rejects.toBeInstanceOf(BudgetsScopeMissingError)
    await expect(getXeroBudget(auth, 'b1', { from: '2026-07', to: '2027-06' })).rejects.toBeInstanceOf(BudgetsScopeMissingError)
  })
  it('getXeroBudget requests the window as DateFrom/DateTo and filters periods to it', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: DETAIL_RESPONSE, headers: {} })
    const out = await getXeroBudget(auth, 'c1d195d4', { from: '2026-07', to: '2027-06' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.xero.com/api.xro/2.0/Budgets/c1d195d4?DateFrom=2026-07-01&DateTo=2027-06-30')
    expect(out!.lines[0].months).toEqual({ '2026-07': 1000, '2026-08': 1150 })
  })
  it('getXeroBudget fetches a 36-month window as two ≤24-month requests and merges lines per account', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const first = url.includes('DateFrom=2026-07-01&DateTo=2028-06-30')
      const second = url.includes('DateFrom=2028-07-01&DateTo=2029-06-30')
      if (!first && !second) throw new Error(`unexpected window in ${url}`)
      return {
        ok: true, status: 200, headers: {},
        json: { Budgets: { BudgetID: 'b-3y', Type: 'OVERALL', Description: 'Three-year', BudgetLines: [
          { AccountID: 'acc-200', AccountCode: '200', BudgetBalances: first
            ? [{ Period: '2026-07', Amount: '100' }, { Period: '2028-06', Amount: '200' }]
            : [{ Period: '2028-07', Amount: '300' }] },
          ...(second ? [{ AccountID: 'acc-400', AccountCode: '400', BudgetBalances: [{ Period: '2029-06', Amount: '7' }] }] : []),
        ] } },
      }
    })
    const out = await getXeroBudget(auth, 'b-3y', { from: '2026-07', to: '2029-06' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(out!.name).toBe('Three-year')
    expect(out!.lines).toHaveLength(2)
    expect(out!.lines.find((l) => l.accountId === 'acc-200')!.months).toEqual({ '2026-07': 100, '2028-06': 200, '2028-07': 300 })
    expect(out!.lines.find((l) => l.accountId === 'acc-400')!.months).toEqual({ '2029-06': 7 })
  })
  it('getXeroBudget returns null on 404 and propagates other errors', async () => {
    fetchMock.mockImplementationOnce(async () => { throw new XeroHttpError(404, 'tenant-1', 'not found') })
    expect(await getXeroBudget(auth, 'nope', { from: '2026-07', to: '2027-06' })).toBeNull()
    fetchMock.mockImplementationOnce(async () => { throw new XeroHttpError(500, 'tenant-1', 'boom') })
    await expect(getXeroBudget(auth, 'x', { from: '2026-07', to: '2027-06' })).rejects.toBeInstanceOf(XeroHttpError)
  })
})
