/**
 * The Overview KPI strip must not answer a question it could not check.
 *
 * `/api/forecast/dashboard-actuals` is the strip's only source of actuals for
 * any wizard-built forecast (`forecast_pl_lines.actual_months` has been empty
 * since Phase 44). Before this test the failure path fell through to that
 * empty fallback and rendered, on 16 Sep 2026:
 *
 *   Revenue · On track · $495k this month · YTD $0 · Year-end $5.5M (+$0)
 *
 * where $495k was JULY'S PLAN. PR #544 makes the route 500 on a failed
 * financial_forecasts or xero_pl_lines_wide_compat read, so the path is now
 * reachable in prod.
 *
 * The house rule (three states): a value, a genuinely-empty state, or an
 * explicit could-not-check. A failure never inherits the other two.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import ForecastOverview from '../ForecastOverview'
import type { FinancialForecast, PLLine } from '../../types'

const BIZ = 'c6c741db-6c09-45be-974c-5e6ca2cadf84'
const METRICS = ['Revenue', 'Gross Profit', 'Net Profit'] as const

const forecast: FinancialForecast = {
  id: 'f1',
  business_id: BIZ,
  user_id: 'u1',
  name: 'FY27 Plan',
  fiscal_year: 2027,
  year_type: 'FY',
  actual_start_month: '2026-07',
  actual_end_month: '2026-08',
  forecast_start_month: '2026-09',
  forecast_end_month: '2027-06',
}

const FY27 = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
] as const

const byMonth = (vals: number[]) => Object.fromEntries(FY27.map((k, i) => [k, vals[i]]))
const flat = (v: number) => byMonth(Array(12).fill(v))

/** Plan only — a wizard-built forecast, which is to say actual_months empty. */
const PLAN_ONLY_LINES: PLLine[] = [
  {
    account_name: 'Sales',
    category: 'revenue',
    actual_months: {},
    forecast_months: byMonth([495_170, 533_062, 450_018, 450_000, 450_000, 450_000, 450_000, 450_000, 450_000, 450_000, 450_000, 450_000]),
  },
  { account_name: 'Cost of Goods Sold', category: 'cogs', actual_months: {}, forecast_months: flat(300_000) },
  { account_name: 'Rent', category: 'operating_expenses', actual_months: {}, forecast_months: flat(100_000) },
]

/** Revenue plan = $5.5M; the strip derives it by summing the lines. */
const REVENUE_PLAN = '$5.5M'

/** The Phase 65 path: the page loaded actuals from xero_pl_lines into the lines. */
const LINES_WITH_STORED_ACTUALS: PLLine[] = PLAN_ONLY_LINES.map((line) => ({
  ...line,
  actual_months:
    line.category === 'revenue'
      ? { '2026-07': 400_000, '2026-08': 420_000 }
      : line.category === 'cogs'
        ? { '2026-07': 250_000, '2026-08': 250_000 }
        : { '2026-07': 90_000, '2026-08': 90_000 },
}))

const actualsPayload = {
  data: {
    lastSyncedAt: '2026-09-16T00:30:00Z',
    months: FY27.map((month, i) => ({
      month,
      label: month,
      revenueActual: i === 0 ? 495_275 : i === 1 ? 537_512 : null,
      revenueForecast: i === 0 ? 495_170 : i === 1 ? 533_062 : 450_000,
      gpActual: i === 0 ? 195_275 : i === 1 ? 237_512 : null,
      gpForecast: 150_000,
      npActual: i === 0 ? 95_275 : i === 1 ? 137_512 : null,
      npForecast: 50_000,
    })),
  },
  hasData: true,
}

const mockFetch = vi.fn()
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))
const cashOk = () => json({ cash: 250_000, currency: 'AUD', as_of: '2026-09-16' })

/** Answer dashboard-actuals with `actuals`; every other call gets a cash balance. */
const route = (actuals: () => Promise<Response>) => (input: RequestInfo | URL) =>
  String(input).includes('/api/forecast/dashboard-actuals') ? actuals() : cashOk()

beforeEach(() => {
  // 16 Sep 2026: FY2027 is current, July and August are the closed months.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-16T01:00:00Z'))
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const overview = (plLines: PLLine[] = PLAN_ONLY_LINES) => (
  <ForecastOverview
    forecast={forecast}
    plLines={plLines}
    assumptions={null}
    fiscalYear={2027}
    yearStartMonth={7}
    businessId={BIZ}
    onSwitchTab={() => {}}
    onEditPlan={() => {}}
  />
)

function kpiCard(label: string) {
  const strip = screen.getByRole('region', { name: 'Key performance indicators' })
  const card = within(strip)
    .getAllByRole('article')
    .find((c) => within(c).queryByText(label))
  if (!card) throw new Error(`no KPI card for "${label}"`)
  return card
}

describe('ForecastOverview KPI strip — actuals could not be loaded', () => {
  it('says it could not load instead of printing the plan as performance', async () => {
    mockFetch.mockImplementation(route(() => json({ error: 'forecast read failed' }, 500)))
    render(overview())

    await waitFor(() =>
      expect(within(kpiCard('Revenue')).getByText("Couldn't load")).toBeInTheDocument(),
    )

    for (const metric of METRICS) {
      const card = kpiCard(metric)
      // The failure is stated, in amber, on every card that needs actuals.
      expect(within(card).getByText("Couldn't load")).toBeInTheDocument()
      expect(within(card).getByText(/Couldn't load actuals from Xero — HTTP 500/)).toBeInTheDocument()
      expect(card.className).toContain('border-amber-200')
      // No verdict, no fabricated figures: this is what the bug printed.
      expect(within(card).queryByText('On track')).toBeNull()
      expect(within(card).queryByText('Watch')).toBeNull()
      expect(within(card).queryByText('Behind')).toBeNull()
      expect(within(card).queryByText('this month')).toBeNull()
      expect(within(card).queryByText('YTD')).toBeNull()
      expect(within(card).queryByText('Year-end')).toBeNull()
      expect(within(card).queryByText('$0')).toBeNull()
      expect(card.textContent).not.toMatch(/\$495k/) // July's plan, sold as September
    }

    // The plan is still a fact — it comes from the forecast, not from Xero.
    expect(within(kpiCard('Revenue')).getByText('Annual plan')).toBeInTheDocument()
    expect(within(kpiCard('Revenue')).getByText(REVENUE_PLAN)).toBeInTheDocument()

    // The chart said so all along; the strip now agrees with it.
    expect(screen.getByText(/Couldn't load trajectory data/)).toBeInTheDocument()
  })

  it('keeps the in-flight window distinct from both a value and a failure', async () => {
    mockFetch.mockImplementation(route(() => new Promise<Response>(() => {})))
    render(overview())

    for (const metric of METRICS) {
      const card = kpiCard(metric)
      expect(within(card).getByText('Loading')).toBeInTheDocument()
      expect(within(card).getByText('loading actuals…')).toBeInTheDocument()
      expect(within(card).queryByText("Couldn't load")).toBeNull()
      expect(within(card).queryByText('On track')).toBeNull()
      expect(within(card).queryByText('$0')).toBeNull()
    }
  })

  it('paints the loading state before any effect runs, not a green verdict', () => {
    // RTL's render() flushes effects inside act(), so only a static render
    // pins what the browser puts on screen first.
    mockFetch.mockImplementation(route(() => new Promise<Response>(() => {})))
    const html = renderToStaticMarkup(overview())
    const start = html.indexOf('aria-label="Key performance indicators"')
    expect(start).toBeGreaterThan(-1)
    const strip = html.slice(start, html.indexOf('</section>', start))

    expect(strip).toContain('loading actuals…')
    expect(strip).not.toContain('On track')
    expect(strip).not.toContain('this month')
    expect(strip).not.toContain('$495k')
  })
})

describe('ForecastOverview KPI strip — actuals the strip can stand behind', () => {
  it('reports Xero actuals when the load succeeds', async () => {
    mockFetch.mockImplementation(route(() => json(actualsPayload)))
    render(overview())

    const revenue = () => kpiCard('Revenue')
    await waitFor(() => expect(within(revenue()).getByText('this month')).toBeInTheDocument())

    expect(within(revenue()).queryByText("Couldn't load")).toBeNull()
    expect(within(revenue()).getByText('$538k')).toBeInTheDocument() // August, the last closed month
    expect(within(revenue()).getByText('$1.0M')).toBeInTheDocument() // YTD Jul + Aug
    expect(within(revenue()).getByText('On track')).toBeInTheDocument()
  })

  it('still falls back to stored actuals on a failure — that fallback had data', async () => {
    // The Phase 65 estimated / prior-FY paths do populate actual_months. A
    // failed Xero fetch there leaves a real answer on the card, so failing
    // open is right and the amber state must not fire.
    mockFetch.mockImplementation(route(() => json({ error: 'boom' }, 500)))
    render(overview(LINES_WITH_STORED_ACTUALS))

    await waitFor(() => expect(screen.getByText(/Couldn't load trajectory data/)).toBeInTheDocument())

    const revenue = kpiCard('Revenue')
    expect(within(revenue).queryByText("Couldn't load")).toBeNull()
    expect(within(revenue).getByText('$420k')).toBeInTheDocument() // August actual
    expect(within(revenue).getByText('this month')).toBeInTheDocument()
    expect(within(revenue).getByText(/\$820k/)).toBeInTheDocument() // YTD Jul + Aug
  })
})
