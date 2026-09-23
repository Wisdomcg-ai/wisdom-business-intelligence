/**
 * D2 (22 Sep 2026 system diagnostic) — a failed assumptions read wrote the
 * defaults over the client's real ones.
 *
 * The hook skipped the failed response, left getDefaultCashflowAssumptions() in
 * state and still marked itself loaded. Two writes followed from that:
 *   1. the auto-sync fired — the defaults have opening_bank_balance 0 and no
 *      balance_date — and /cashflow/sync-balances posts save: true, so Xero's
 *      figures replaced the stored opening balances, DSO and DPO;
 *   2. the next edit posted the whole defaulted object, and the route replaces
 *      assumptions.cashflow outright, taking loans and planned stock changes
 *      with it.
 *
 * A forecast with no assumptions row yet answers 200 with no data — the
 * defaults are then its real starting point, not a failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useCashflowForecast } from '../useCashflowForecast'
import type { FinancialForecast, PLLine } from '../../types'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const FORECAST = {
  id: 'fc-1',
  business_id: 'biz-1',
  actual_start_month: '2026-07',
  actual_end_month: '2026-09',
} as unknown as FinancialForecast

const PL_LINES: PLLine[] = [
  { account_name: 'Sales', category: 'Revenue', forecast_months: { '2026-07': 10_000 }, actual_months: {} } as unknown as PLLine,
]

/** The stored assumptions a coach set up: real balances, real terms, a loan. */
const STORED = {
  opening_bank_balance: 250_000,
  balance_date: '2026-06-30',
  dso_days: 45,
  dpo_days: 19,
  loans: [{ name: 'Equipment loan', balance: 180_000, monthly_repayment: 4_000, interest_rate: 0.065, is_interest_only: false }],
  planned_stock_changes: { '2026-08': 25_000 },
}

const posts: Array<{ url: string; body: any }> = []

/** Routes by URL; `assumptions` decides what the assumptions GET answers. */
function stubFetch(assumptions: { ok: boolean; data?: unknown; throws?: boolean }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const href = String(url)
    if (init?.method === 'POST') {
      posts.push({ url: href, body: JSON.parse(String(init.body)) })
      return { ok: true, json: async () => ({ data: {} }) }
    }
    if (href.includes('/cashflow/assumptions')) {
      if (assumptions.throws) throw new Error('offline')
      return { ok: assumptions.ok, status: assumptions.ok ? 200 : 500, json: async () => ({ data: assumptions.data ?? null }) }
    }
    // payroll summary, xero actuals, bank balances: empty but successful
    return { ok: true, status: 200, json: async () => ({ data: null }) }
  }))
}

beforeEach(() => {
  posts.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const render = () =>
  renderHook(() =>
    useCashflowForecast({ forecast: FORECAST, plLines: PL_LINES, businessId: 'biz-1', hasXeroConnection: true }),
  )

describe('a failed assumptions read is not a set of assumptions', () => {
  it('flags it, and the auto-sync never writes Xero balances over the stored ones', async () => {
    stubFetch({ ok: false })
    const { result } = render()

    await waitFor(() => expect(result.current.assumptionsUnavailable).toBe(true))
    await new Promise((r) => setTimeout(r, 20))
    expect(posts.filter((p) => p.url.includes('sync-balances'))).toHaveLength(0)
  })

  it('refuses to save — the POST would replace the stored assumptions with defaults', async () => {
    stubFetch({ ok: false })
    const { result } = render()
    await waitFor(() => expect(result.current.assumptionsUnavailable).toBe(true))

    await act(async () => { await result.current.saveAssumptions({ dso_days: 30 }) })
    expect(posts.filter((p) => p.url.includes('/cashflow/assumptions'))).toHaveLength(0)
  })

  it('refuses to sync on request — sync-balances writes the stored row too', async () => {
    stubFetch({ ok: false })
    const { result } = render()
    await waitFor(() => expect(result.current.assumptionsUnavailable).toBe(true))

    await act(async () => { await result.current.syncFromXero() })
    expect(posts.filter((p) => p.url.includes('sync-balances'))).toHaveLength(0)
  })

  it('a request that throws counts as unavailable', async () => {
    stubFetch({ ok: true, throws: true })
    const { result } = render()
    await waitFor(() => expect(result.current.assumptionsUnavailable).toBe(true))
  })
})

describe('a real answer still works', () => {
  it('loads the stored assumptions and saves them', async () => {
    stubFetch({ ok: true, data: STORED })
    const { result } = render()

    await waitFor(() => expect(result.current.assumptions.opening_bank_balance).toBe(250_000))
    expect(result.current.assumptionsUnavailable).toBe(false)

    await act(async () => { await result.current.saveAssumptions({ dso_days: 30 }) })
    const saved = posts.find((p) => p.url.includes('/cashflow/assumptions'))
    expect(saved).toBeDefined()
    // The coach's loan and stock plan travel with the save, not defaults.
    expect(saved!.body).toMatchObject({ dso_days: 30, opening_bank_balance: 250_000, loans: STORED.loans })
  })

  it('a forecast with no assumptions row yet is not a failure', async () => {
    stubFetch({ ok: true, data: null })
    const { result } = render()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.assumptionsUnavailable).toBe(false)
  })
})
