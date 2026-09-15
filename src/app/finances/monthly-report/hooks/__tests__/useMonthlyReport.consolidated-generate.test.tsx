/**
 * Generate on a consolidation parent (Dragon, IICT).
 *
 * - The report carries the business's settings row, which the consolidated
 *   route now serves beside the report — not a stub that hid the Unspent,
 *   Next Month and Annual columns (IICT-12, DRG-05).
 * - A report generated from the reconciliation gate's "continue as draft" is a
 *   draft, as the single-entity route marks it, so Finalise stays locked.
 * - A Generate clicked before the connection count is read waits for it. It
 *   used to post to the single-entity route, which adds an HKD org's figures
 *   into AUD one-for-one (DRG-52).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { useMonthlyReport } from '../useMonthlyReport'

// The detection query resolves when a test says so.
let resolveDetection: (count: number) => void = () => {}
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () =>
              new Promise<{ count: number }>((resolve) => {
                resolveDetection = (count) => resolve({ count })
              }),
          }),
        }),
      }),
    }),
  }),
}))

const BUSINESS_ID = 'c7df2983-5711-4959-8ec8-a48030d62666'

const SETTINGS = {
  business_id: BUSINESS_ID,
  sections: { revenue_detail: true, cogs_detail: true, opex_detail: true },
  show_prior_year: false,
  show_ytd: true,
  show_unspent_budget: true,
  show_budget_next_month: true,
  show_budget_annual_total: true,
  budget_forecast_id: null,
  budget_source: 'forecast',
}

const CONSOLIDATED = {
  byTenant: [],
  consolidated: {
    lines: [{ account_type: 'revenue', account_name: 'Sales - Insurance', monthly_values: { '2026-07': 900_000, '2026-08': 673_765 } }],
    budgetLines: [{ account_type: 'revenue', account_name: 'Sales - Insurance', monthly_values: { '2026-07': 1_000_000, '2026-08': 1_000_000 } }],
  },
  fx_context: { rates_used: {}, missing_rates: [] },
  diagnostics: {},
}

type Api = ReturnType<typeof useMonthlyReport>

function makeHarness() {
  const api: { current: Api | null } = { current: null }
  function Harness() {
    api.current = useMonthlyReport(BUSINESS_ID)
    return null
  }
  return { api, Harness }
}

let consolidatedBody: Record<string, unknown> = { success: true, report: CONSOLIDATED, settings: SETTINGS }
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (String(url).includes('/api/monthly-report/consolidated')) {
    return { ok: true, json: async () => consolidatedBody } as unknown as Response
  }
  if (String(url).includes('/api/monthly-report/generate')) {
    return { ok: true, json: async () => ({ report: { business_id: BUSINESS_ID, report_month: '2026-08', sections: [] } }) } as unknown as Response
  }
  throw new Error(`unexpected fetch: ${url}`)
})

beforeEach(() => {
  consolidatedBody = { success: true, report: CONSOLIDATED, settings: SETTINGS }
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const postedTo = () => fetchMock.mock.calls.map(([url]) => String(url))

describe('useMonthlyReport — Generate on a consolidation parent', () => {
  it("adapts the consolidated report with the business's own settings", async () => {
    const { api, Harness } = makeHarness()
    render(<Harness />)
    await act(async () => { resolveDetection(2) })
    expect(api.current!.isConsolidationGroup).toBe(true)

    await act(async () => {
      await api.current!.generateReport('2026-08', 2027)
    })

    expect(postedTo()).toEqual(['/api/monthly-report/consolidated'])
    const report = api.current!.report!
    expect(report.is_consolidation).toBe(true)
    expect(report.settings).toEqual(SETTINGS)
    expect(report.settings.show_unspent_budget).toBe(true)
    expect(report.settings.show_budget_next_month).toBe(true)
    expect(report.settings.show_budget_annual_total).toBe(true)
    expect(report.is_draft).toBe(false)
  })

  it('a draft Generate produces a draft report', async () => {
    const { api, Harness } = makeHarness()
    render(<Harness />)
    await act(async () => { resolveDetection(3) })

    await act(async () => {
      await api.current!.generateReport('2026-08', 2027, true)
    })
    expect(api.current!.report!.is_draft).toBe(true)
  })

  it('a Generate clicked before the connection count is read waits for it, then consolidates', async () => {
    const { api, Harness } = makeHarness()
    render(<Harness />)
    expect(api.current!.isConsolidationGroup).toBeNull()

    let pending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      pending = api.current!.generateReport('2026-08', 2027)
    })
    // Nothing posted while the count is unknown.
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => {
      resolveDetection(3)
      await pending
    })
    expect(postedTo()).toEqual(['/api/monthly-report/consolidated'])
    expect(api.current!.report!.is_consolidation).toBe(true)
  })

  it('a single-entity business clicked early still posts to the single-entity route, as before', async () => {
    const { api, Harness } = makeHarness()
    render(<Harness />)

    let pending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      pending = api.current!.generateReport('2026-08', 2027, true)
    })
    await act(async () => {
      resolveDetection(1)
      await pending
    })
    expect(postedTo()).toEqual(['/api/monthly-report/generate'])
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init!.body))).toEqual({
      business_id: BUSINESS_ID,
      report_month: '2026-08',
      fiscal_year: 2027,
      force_draft: true,
    })
  })

  it('a consolidated response without settings is an error, never a report with guessed columns', async () => {
    consolidatedBody = { success: true, report: CONSOLIDATED }
    const { api, Harness } = makeHarness()
    render(<Harness />)
    await act(async () => { resolveDetection(2) })

    let result: unknown
    await act(async () => {
      result = await api.current!.generateReport('2026-08', 2027)
    })
    expect(result).toBeNull()
    expect(api.current!.report).toBeNull()
    expect(api.current!.error).toMatch(/settings/i)
  })
})
