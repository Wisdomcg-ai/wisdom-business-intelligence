/**
 * The Cash Position KPI card must not answer a question it could not check.
 *
 * `/api/Xero/balance-sheet?cash_only=true` distinguishes a genuine "not
 * connected" tenant (`code: 'NO_CONNECTION'`, or a 401 for an expired
 * connection) from every other failure — a Xero rate limit (429), a Xero API
 * error (502), or an internal error (500). Before this test the card's fetch
 * effect did `.catch(() => setCashUnavailable(true))` for ANY failure, so a
 * fully-connected tenant hit by a rate limit or outage was told to "Connect
 * Xero" — a false, wasted action.
 *
 * The house rule (three states): a value, a genuinely-empty state, or an
 * explicit could-not-check. A failure never inherits the other two.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import ForecastOverview from '../ForecastOverview'
import type { FinancialForecast, PLLine } from '../../types'

const BIZ = 'c6c741db-6c09-45be-974c-5e6ca2cadf84'

// Same fixture shape as ForecastOverview.kpi-actuals-state.test.tsx: FY2027 is
// current as at the frozen system time below, so the Cash card renders its
// 'current'-mode copy rather than the future/prior variants.
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

const plLines: PLLine[] = []

const mockFetch = vi.fn()
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))
const actualsOk = () => json({ data: { months: [], lastSyncedAt: null }, hasData: false })

/** Answer the balance-sheet call with `cash`; every other call gets a benign actuals response. */
const route = (cash: () => Promise<Response>) => (input: RequestInfo | URL) =>
  String(input).includes('/api/Xero/balance-sheet') ? cash() : actualsOk()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-16T01:00:00Z'))
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function overview() {
  return (
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
}

function cashCard() {
  const strip = screen.getByRole('region', { name: 'Key performance indicators' })
  const card = within(strip)
    .getAllByRole('article')
    .find((c) => within(c).queryByText('Cash Position'))
  if (!card) throw new Error('no KPI card for "Cash Position"')
  return card
}

const CONNECT_COPY = 'Connect Xero to see your live cash position.'

describe('ForecastOverview Cash Position card — genuine "not connected"', () => {
  it('shows the Connect Xero copy on NO_CONNECTION (400)', async () => {
    mockFetch.mockImplementation(
      route(() => json({ error: 'No active Xero connection', code: 'NO_CONNECTION' }, 400)),
    )
    render(overview())

    await waitFor(() => expect(within(cashCard()).getByText(CONNECT_COPY)).toBeInTheDocument())

    const card = cashCard()
    expect(card.className).not.toContain('border-amber-200')
    expect(within(card).queryByText("Couldn't check")).toBeNull()
  })

  it('shows the Connect Xero copy on an expired connection (401)', async () => {
    mockFetch.mockImplementation(route(() => json({ error: 'Xero connection expired' }, 401)))
    render(overview())

    await waitFor(() => expect(within(cashCard()).getByText(CONNECT_COPY)).toBeInTheDocument())

    const card = cashCard()
    expect(card.className).not.toContain('border-amber-200')
    expect(within(card).queryByText("Couldn't check")).toBeNull()
  })
})

describe('ForecastOverview Cash Position card — genuinely empty', () => {
  it('shows "no bank accounts" on a 200 with cash: null, not Connect Xero', async () => {
    mockFetch.mockImplementation(
      route(() => json({ cash: null, currency: 'AUD', as_of: '2026-09-16' })),
    )
    render(overview())

    await waitFor(() =>
      expect(within(cashCard()).getByText('No bank accounts found in Xero.')).toBeInTheDocument(),
    )

    const card = cashCard()
    expect(card.className).not.toContain('border-amber-200')
    expect(within(card).queryByText(CONNECT_COPY)).toBeNull()
  })
})

describe('ForecastOverview Cash Position card — could not check (new behaviour)', () => {
  it('shows an amber "could not check" card on a Xero rate limit (429), never Connect Xero', async () => {
    mockFetch.mockImplementation(
      route(() => json({ error: 'Xero is rate-limiting — try again in a minute' }, 429)),
    )
    render(overview())

    await waitFor(() => expect(within(cashCard()).getByText("Couldn't check")).toBeInTheDocument())

    const card = cashCard()
    expect(card.className).toContain('border-amber-200')
    // The false, wasted action this bug produced must not appear here.
    expect(within(card).queryByText(CONNECT_COPY)).toBeNull()
    expect(within(card).queryByText('No bank accounts found in Xero.')).toBeNull()
    expect(within(card).getByText(/Xero is rate-limiting/)).toBeInTheDocument()
  })

  it('shows an amber "could not check" card on a Xero API error (502), never Connect Xero', async () => {
    mockFetch.mockImplementation(route(() => json({ error: 'Xero API error', status: 502 }, 502)))
    render(overview())

    await waitFor(() => expect(within(cashCard()).getByText("Couldn't check")).toBeInTheDocument())

    const card = cashCard()
    expect(card.className).toContain('border-amber-200')
    expect(within(card).queryByText(CONNECT_COPY)).toBeNull()
    expect(within(card).queryByText('No bank accounts found in Xero.')).toBeNull()
    expect(within(card).getByText(/Xero API error/)).toBeInTheDocument()
  })
})
