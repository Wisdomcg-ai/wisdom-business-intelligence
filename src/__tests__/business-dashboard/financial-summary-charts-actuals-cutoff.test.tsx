/**
 * The KPI dashboard charts say where the actuals stop.
 *
 * The route caps them at the last closed month, because xero_pl_lines carries
 * the month in progress part-billed (dashboard-actuals-part-month.test.ts).
 * Without a word on the page, the open month then looks like a business that
 * fell off a cliff — its plan is drawn, its actual is not. One line under the
 * charts says which month the actuals run to.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// recharts' ResponsiveContainer needs a layout engine jsdom does not have; the
// charts are not what these tests are about.
vi.mock('recharts', async () => {
  const { createElement, Fragment } = await import('react')
  const Pass = ({ children }: { children?: unknown }) => createElement(Fragment, null, children as never)
  const Leaf = () => null
  return {
    ResponsiveContainer: Pass,
    AreaChart: Pass,
    Area: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
    CartesianGrid: Leaf,
    Tooltip: Leaf,
  }
})

import { FinancialSummaryCharts } from '@/app/business-dashboard/components/FinancialSummaryCharts'

const PROFILE_ID = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'

const MONTHS = [
  { month: '2026-07', label: 'Jul', revenueActual: 460_000, revenueForecast: 450_000, gpActual: 200_000, gpForecast: 190_000, npActual: 90_000, npForecast: 80_000 },
  { month: '2026-08', label: 'Aug', revenueActual: 440_000, revenueForecast: 450_000, gpActual: 190_000, gpForecast: 190_000, npActual: 70_000, npForecast: 80_000 },
  // The month in progress: plan only, as the route now returns it.
  { month: '2026-09', label: 'Sep', revenueActual: null, revenueForecast: 450_000, gpActual: null, gpForecast: 190_000, npActual: null, npForecast: 80_000 },
]

function answer(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
}

const body = (over: Record<string, unknown> = {}) => ({
  data: { months: MONTHS, lastSync: { status: 'none' }, lastClosedMonth: '2026-08', ...over },
  hasData: true,
})

async function renderCharts() {
  render(<FinancialSummaryCharts businessId={PROFILE_ID} />)
  await screen.findByText('Revenue')
}

const cutoffLine = () => screen.queryByText(/^Actuals to /)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('FinancialSummaryCharts — where the actuals stop', () => {
  it('names the last closed month in words the reader knows', async () => {
    answer(body())
    await renderCharts()
    expect(cutoffLine()?.textContent).toBe('Actuals to August 2026; the month in progress is shown as forecast.')
  })

  it('reads the month from its parts, so the line does not shift by a day in Sydney', async () => {
    // '2026-07' through a Date would be UTC midnight — 1 July in London, still
    // 30 June nowhere, but 1 July 10am in Sydney; a month key must never be
    // parsed as an instant.
    answer(body({ lastClosedMonth: '2026-07' }))
    await renderCharts()
    expect(cutoffLine()?.textContent).toContain('July 2026')
  })

  it('says nothing when the route did not say', async () => {
    answer(body({ lastClosedMonth: null }))
    await renderCharts()
    expect(cutoffLine()).toBeNull()
  })

  it('says nothing when the field is not a month key', async () => {
    answer(body({ lastClosedMonth: 'last month' }))
    await renderCharts()
    expect(cutoffLine()).toBeNull()
  })
})
