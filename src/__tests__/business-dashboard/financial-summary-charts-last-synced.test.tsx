/**
 * The KPI dashboard charts' "Last synced" line.
 *
 * It never rendered: the route read a financial_metrics column that does not
 * exist, so lastSyncedAt was always null. It now shows the business's Xero data
 * clock (dashboard-actuals-last-sync.test.ts) in three distinguishable states:
 *
 *   a date     — the stalest org's; when the orgs would print different dates it
 *                says whose date it is
 *   "not yet"  — an org has never synced
 *   "couldn't check" — the lookup failed or the answer could not be read. Amber,
 *                and never a date or "not yet".
 *
 * No Xero connection prints no line. A request that fails is its own state too —
 * never the "No Xero data yet" empty state, whose advice is wrong for a failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

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

// 12:00Z and 12:20Z print the same calendar date as each other in every real
// time zone (UTC-12 to UTC+14): midnight falls between them only at an offset
// between +11:40 and +12:00, which no zone uses. printed() formats in the test's
// own zone, so the expectations hold wherever the suite runs.
const SEP_10 = '2026-09-10T12:00:00.000Z'
const SEP_16 = '2026-09-16T12:00:00.000Z'
const SEP_16_LATER = '2026-09-16T12:20:00.000Z'

const printed = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

const MONTHS = [
  { month: '2026-07', label: 'Jul', revenueActual: 900, revenueForecast: 1000, gpActual: 400, gpForecast: 500, npActual: 100, npForecast: 150 },
]

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async (..._args: unknown[]) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const charts = (lastSync: unknown) => ({ data: { months: MONTHS, lastSync }, hasData: true })

async function renderCharts() {
  render(<FinancialSummaryCharts businessId={PROFILE_ID} />)
  await screen.findByText('Revenue')
}

const syncLine = () => screen.queryByText(/^Last synced:/)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('FinancialSummaryCharts — "Last synced" is the business data clock', () => {
  it('asks the route for the business the dashboard passed', async () => {
    const fetchMock = answer(200, charts({ status: 'none' }))
    await renderCharts()
    expect(fetchMock).toHaveBeenCalledWith(`/api/forecast/dashboard-actuals?businessId=${PROFILE_ID}`)
  })

  it('one org: its date', async () => {
    answer(200, charts({ status: 'synced', lastSyncAt: SEP_16, orgs: [{ tenantName: 'Urban Road Pty Ltd', lastSyncAt: SEP_16 }] }))
    await renderCharts()
    const line = syncLine()
    expect(line?.textContent).toBe(`Last synced: ${printed(SEP_16)}`)
    expect(line).toHaveClass('text-gray-400')
    expect(line).not.toHaveClass('text-amber-700')
  })

  it('orgs that synced on the same day: the date, with no org named', async () => {
    answer(
      200,
      charts({
        status: 'synced',
        lastSyncAt: SEP_16,
        orgs: [
          { tenantName: 'Dragon Roofing Pty Ltd', lastSyncAt: SEP_16 },
          { tenantName: 'EASY HAIL CLAIM PTY LTD', lastSyncAt: SEP_16_LATER },
        ],
      }),
    )
    await renderCharts()
    expect(syncLine()?.textContent).toBe(`Last synced: ${printed(SEP_16)}`)
  })

  it('orgs on different days: the stalest date, naming the org it belongs to — the fresher date is not shown', async () => {
    answer(
      200,
      charts({
        status: 'synced',
        lastSyncAt: SEP_10,
        orgs: [
          { tenantName: 'IICT Group Pty Ltd', lastSyncAt: SEP_10 },
          { tenantName: 'IICT Group Limited', lastSyncAt: SEP_16 },
        ],
      }),
    )
    await renderCharts()
    expect(syncLine()?.textContent).toBe(`Last synced: ${printed(SEP_10)} (IICT Group Pty Ltd)`)
    expect(screen.queryByText(new RegExp(printed(SEP_16)))).toBeNull()
  })

  it('the stalest org has no name (its connection is gone): counted, never guessed', async () => {
    answer(
      200,
      charts({
        status: 'synced',
        lastSyncAt: SEP_10,
        orgs: [
          { tenantName: null, lastSyncAt: SEP_10 },
          { tenantName: 'IICT (Aust) Pty Ltd', lastSyncAt: SEP_16 },
          { tenantName: 'IICT Group Limited', lastSyncAt: SEP_16_LATER },
        ],
      }),
    )
    await renderCharts()
    expect(syncLine()?.textContent).toBe(`Last synced: ${printed(SEP_10)} (1 of 3 orgs)`)
  })

  it('several orgs sharing the stalest day: counted, not named', async () => {
    answer(
      200,
      charts({
        status: 'synced',
        lastSyncAt: SEP_10,
        orgs: [
          { tenantName: 'IICT (Aust) Pty Ltd', lastSyncAt: SEP_10 },
          { tenantName: 'IICT Group Pty Ltd', lastSyncAt: SEP_10 },
          { tenantName: 'IICT Group Limited', lastSyncAt: SEP_16 },
        ],
      }),
    )
    await renderCharts()
    expect(syncLine()?.textContent).toBe(`Last synced: ${printed(SEP_10)} (2 of 3 orgs)`)
  })

  it('never synced: "not yet", naming the org when others have synced', async () => {
    answer(200, charts({ status: 'never_synced', orgs: [{ tenantName: 'Distinct Directions Pty Ltd', lastSyncAt: null }] }))
    await renderCharts()
    expect(syncLine()?.textContent).toBe('Last synced: not yet')
  })

  it('one org of two never synced: "not yet (that org)"', async () => {
    answer(
      200,
      charts({
        status: 'never_synced',
        orgs: [
          { tenantName: 'EASY HAIL CLAIM PTY LTD', lastSyncAt: null },
          { tenantName: 'Dragon Roofing Pty Ltd', lastSyncAt: SEP_16 },
        ],
      }),
    )
    await renderCharts()
    expect(syncLine()?.textContent).toBe('Last synced: not yet (EASY HAIL CLAIM PTY LTD)')
  })

  it('no Xero connection: no line at all', async () => {
    answer(200, charts({ status: 'none' }))
    await renderCharts()
    expect(syncLine()).toBeNull()
  })
})

describe("FinancialSummaryCharts — a failed check is \"couldn't check\", never a date or \"not yet\"", () => {
  it('unknown renders amber "couldn\'t check"', async () => {
    answer(200, charts({ status: 'unknown' }))
    await renderCharts()
    const line = syncLine()
    expect(line?.textContent).toBe("Last synced: couldn't check")
    expect(line).toHaveClass('text-amber-700')
    expect(line).toHaveAttribute('title', expect.stringContaining('not a confirmation'))
    expect(screen.queryByText(/not yet/)).toBeNull()
  })

  it('an answer without the clock (the old lastSyncedAt shape) is "couldn\'t check" — its date is not shown', async () => {
    answer(200, { data: { months: MONTHS, lastSyncedAt: SEP_16 }, hasData: true })
    await renderCharts()
    expect(syncLine()?.textContent).toBe("Last synced: couldn't check")
    expect(screen.queryByText(new RegExp(printed(SEP_16)))).toBeNull()
  })

  it('a clock fresher than an org it lists is not believed', async () => {
    answer(
      200,
      charts({
        status: 'synced',
        lastSyncAt: SEP_16,
        orgs: [
          { tenantName: 'IICT Group Limited', lastSyncAt: SEP_16 },
          { tenantName: 'IICT Group Pty Ltd', lastSyncAt: SEP_10 },
        ],
      }),
    )
    await renderCharts()
    expect(syncLine()?.textContent).toBe("Last synced: couldn't check")
  })

  it('a "synced" clock with an unreadable date is "couldn\'t check"', async () => {
    answer(200, charts({ status: 'synced', lastSyncAt: 'yesterday', orgs: [{ tenantName: 'A', lastSyncAt: 'yesterday' }] }))
    await renderCharts()
    expect(syncLine()?.textContent).toBe("Last synced: couldn't check")
    expect(screen.queryByText(/Invalid Date/)).toBeNull()
  })

  it('a "never synced" clock listing an org with an unreadable date is "couldn\'t check", not "not yet"', async () => {
    answer(
      200,
      charts({
        status: 'never_synced',
        orgs: [
          { tenantName: 'EASY HAIL CLAIM PTY LTD', lastSyncAt: null },
          { tenantName: 'Dragon Roofing Pty Ltd', lastSyncAt: 'yesterday' },
        ],
      }),
    )
    await renderCharts()
    expect(syncLine()?.textContent).toBe("Last synced: couldn't check")
  })
})

describe('FinancialSummaryCharts — a failed load is not "no data yet"', () => {
  const EMPTY_STATE = /No Xero data yet/

  it('a 500 says the charts could not load, with no empty-state advice and no sync line', async () => {
    answer(500, { error: 'Internal server error' })
    render(<FinancialSummaryCharts businessId={PROFILE_ID} />)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the financial charts just now")
    expect(screen.queryByText(EMPTY_STATE)).toBeNull()
    expect(syncLine()).toBeNull()
  })

  it('a network failure is the same', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    render(<FinancialSummaryCharts businessId={PROFILE_ID} />)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the financial charts just now")
    expect(screen.queryByText(EMPTY_STATE)).toBeNull()
  })

  it('a 200 that is not an answer is the same', async () => {
    answer(200, { error: 'Unauthorized' })
    render(<FinancialSummaryCharts businessId={PROFILE_ID} />)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the financial charts just now")
    expect(screen.queryByText(EMPTY_STATE)).toBeNull()
  })

  it('genuinely no data is the empty state, not a failure', async () => {
    answer(200, { data: { months: MONTHS, lastSync: { status: 'none' } }, hasData: false })
    render(<FinancialSummaryCharts businessId={PROFILE_ID} />)
    expect(await screen.findByText(EMPTY_STATE)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(syncLine()).toBeNull()
  })

  it('the first paint, before the request is even made, is the skeleton — not the empty state', () => {
    // The browser paints before effects run, so what the first render returns is
    // what the owner sees first. Rendered without effects, it must not be advice
    // to go and set up a forecast.
    const firstPaint = renderToStaticMarkup(<FinancialSummaryCharts businessId={PROFILE_ID} />)
    expect(firstPaint).not.toMatch(EMPTY_STATE)
    expect(firstPaint).toContain('animate-pulse')
  })
})
