/**
 * The "Start from Xero budget" entry point on the forecast empty state.
 *
 * Pins the five-state contract of GET /api/Xero/budgets as the operator sees
 * it — in particular that a failed CHECK never reads as "no budget" — and that
 * the seed is opt-in: nothing fires until the operator clicks, and with more
 * than one budget on offer they pick one first.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import ForecastEmptyState from '@/app/finances/forecast/components/ForecastEmptyState'
import type { BudgetAvailabilityResponse } from '@/lib/xero/budget-availability'

let pathnameMock = '/finances/forecast'
vi.mock('next/navigation', () => ({ usePathname: () => pathnameMock }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

const okJson = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })

const cov = (monthsInFY: number) => ({ firstPeriod: '2026-07', lastPeriod: '2027-06', monthsInFY })
const org = (over: Partial<BudgetAvailabilityResponse['orgs'][number]> = {}): BudgetAvailabilityResponse['orgs'][number] => ({
  tenantId: 't-1', orgName: 'Urban Road', functionalCurrency: 'AUD', state: 'available',
  budgets: [{ budgetId: 'b-1', name: 'Overall Budget', type: 'OVERALL', updatedAt: null, lineCount: 61, coverage: cov(12) }],
  ...over,
})
const available: BudgetAvailabilityResponse = { state: 'available', fiscalYear: 2027, orgs: [org()] }

let fetchMock: ReturnType<typeof vi.fn>
function stubFetch(budgets: unknown, budgetsStatus = 200) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/Xero/pl-summary')) return okJson({ summary: { has_xero_data: false } })
    if (url.includes('/api/Xero/budgets')) return okJson(budgets, budgetsStatus)
    return okJson({}, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
}

function renderState(props: Partial<React.ComponentProps<typeof ForecastEmptyState>> = {}) {
  const onSeedFromXeroBudget = vi.fn()
  const onCreateForecast = vi.fn()
  const utils = render(
    <ForecastEmptyState
      businessId="biz-1"
      fiscalYear={2027}
      onCreateForecast={onCreateForecast}
      onSeedFromXeroBudget={onSeedFromXeroBudget}
      {...props}
    />,
  )
  return { ...utils, onSeedFromXeroBudget, onCreateForecast }
}

beforeEach(() => {
  pathnameMock = '/finances/forecast'
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('available', () => {
  it('offers "Start from Xero budget" beside "Start blank", names the budget and its coverage, and seeds only on click', async () => {
    stubFetch(available)
    const { onSeedFromXeroBudget, onCreateForecast } = renderState()

    const cta = await screen.findByRole('button', { name: /Start from Xero budget/ })
    expect(cta).toBeEnabled()
    expect(screen.getByRole('button', { name: /Start FY2027 blank/ })).toBeInTheDocument()
    const line = screen.getByTestId('budget-availability')
    expect(line.textContent).toContain('“Overall Budget”')
    expect(line.textContent).toContain('covers 12 of 12 months')
    // Single org → no org name in the line.
    expect(line.textContent).not.toContain('Urban Road')

    expect(onSeedFromXeroBudget).not.toHaveBeenCalled()
    fireEvent.click(cta)
    expect(onSeedFromXeroBudget).toHaveBeenCalledWith({ tenantId: 't-1', budgetId: 'b-1', budgetName: 'Overall Budget' })
    expect(onCreateForecast).not.toHaveBeenCalled()
  })

  it('asks the TARGET fiscal year for budgets (not the clamped actuals year)', async () => {
    stubFetch(available)
    renderState({ fiscalYear: 2027 })
    await screen.findByRole('button', { name: /Start from Xero budget/ })
    const budgetsCall = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes('/api/Xero/budgets'))
    expect(budgetsCall).toContain('business_id=biz-1')
    expect(budgetsCall).toContain('fiscal_year=2027')
  })

  it('shows "Importing…" and disables the other starts while the seed is in flight', async () => {
    stubFetch(available)
    renderState({ isSeedingFromBudget: true })
    const cta = await screen.findByRole('button', { name: /Importing…/ })
    expect(cta).toBeDisabled()
    expect(screen.getByRole('button', { name: /Start FY2027 blank/ })).toBeDisabled()
  })
})

describe('picker (more than one budget)', () => {
  const two: BudgetAvailabilityResponse = {
    state: 'available', fiscalYear: 2027,
    orgs: [
      org({ budgets: [
        { budgetId: 'b-track', name: 'Retail only', type: 'TRACKING', updatedAt: null, lineCount: 12, coverage: cov(12) },
        { budgetId: 'b-1', name: 'Overall Budget', type: 'OVERALL', updatedAt: null, lineCount: 61, coverage: cov(12) },
      ] }),
      org({ tenantId: 't-hk', orgName: 'Urban Road HK', functionalCurrency: 'HKD', budgets: [
        { budgetId: 'b-hk', name: 'HK Budget', type: 'OVERALL', updatedAt: null, lineCount: 20, coverage: cov(9) },
      ] }),
    ],
  }

  it('opens a dialog defaulting to the first org\'s OVERALL budget, warns on mixed currencies, and imports the pick', async () => {
    stubFetch(two)
    const { onSeedFromXeroBudget } = renderState()
    const cta = await screen.findByRole('button', { name: /Start from Xero budget/ })
    expect(screen.getByTestId('budget-availability').textContent).toContain('3 Xero budgets found')

    fireEvent.click(cta)
    expect(onSeedFromXeroBudget).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog', { name: /Which Xero budget/ })
    const radios = within(dialog).getAllByRole('radio') as HTMLInputElement[]
    expect(radios).toHaveLength(3)
    expect(radios[1].checked).toBe(true) // Overall Budget of the first org, not the tracking budget listed first
    expect(within(dialog).getByText(/different currencies/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Urban Road HK/)).toBeInTheDocument()

    fireEvent.click(radios[2])
    fireEvent.click(within(dialog).getByRole('button', { name: /Import this budget/ }))
    expect(onSeedFromXeroBudget).toHaveBeenCalledWith({ tenantId: 't-hk', budgetId: 'b-hk', budgetName: 'HK Budget' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Cancel closes without seeding', async () => {
    stubFetch(two)
    const { onSeedFromXeroBudget } = renderState()
    fireEvent.click(await screen.findByRole('button', { name: /Start from Xero budget/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Cancel$/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onSeedFromXeroBudget).not.toHaveBeenCalled()
  })
})

describe('scope_missing', () => {
  it('shows the CTA disabled with a reconnect link into Integrations', async () => {
    stubFetch({ state: 'scope_missing', fiscalYear: 2027, orgs: [org({ state: 'scope_missing', budgets: [] })] })
    renderState()
    const cta = await screen.findByRole('button', { name: /Start from Xero budget/ })
    expect(cta).toBeDisabled()
    const link = screen.getByRole('link', { name: /Reconnect Xero/ })
    expect(link).toHaveAttribute('href', '/integrations')
  })

  it('keeps the reconnect link inside the coach client context', async () => {
    pathnameMock = '/coach/clients/28d41193/view/finances/forecast'
    stubFetch({ state: 'scope_missing', fiscalYear: 2027, orgs: [org({ state: 'scope_missing', budgets: [] })] })
    renderState()
    const link = await screen.findByRole('link', { name: /Reconnect Xero/ })
    expect(link).toHaveAttribute('href', '/coach/clients/28d41193/view/integrations')
  })
})

describe('none / error / not_connected', () => {
  it('none: a quiet sentence and no budget button — the blank start is the single CTA', async () => {
    stubFetch({ state: 'none', fiscalYear: 2027, orgs: [org({ state: 'none', budgets: [] })] })
    renderState()
    await screen.findByText('No budget found in Xero for FY2027.')
    expect(screen.queryByRole('button', { name: /Start from Xero budget/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Start FY2027 Forecast/ })).toBeInTheDocument()
  })

  it('error from the check is "couldn\'t check", never "no budget", with a working Retry', async () => {
    stubFetch({ state: 'error', fiscalYear: 2027, orgs: [org({ state: 'error', budgets: [], error: 'boom' })] })
    renderState()
    await screen.findByText(/Couldn.t check Xero for a budget/)
    expect(screen.queryByText(/No budget found/)).toBeNull()
    const before = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/Xero/budgets')).length
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    await waitFor(() => {
      const after = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/Xero/budgets')).length
      expect(after).toBe(before + 1)
    })
  })

  it('a failed HTTP check reads the same way', async () => {
    stubFetch({ error: 'nope' }, 500)
    renderState()
    await screen.findByText(/Couldn.t check Xero for a budget/)
    expect(screen.queryByText(/No budget found/)).toBeNull()
  })

  it('not_connected adds nothing — the existing connect prompt already covers it', async () => {
    stubFetch({ state: 'not_connected', fiscalYear: 2027, orgs: [] })
    renderState()
    await screen.findByText(/Connect Xero to import your historical data/)
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/Xero/budgets'))).toBe(true))
    expect(screen.queryByTestId('budget-availability')).toBeNull()
    expect(screen.queryByRole('button', { name: /Start from Xero budget/ })).toBeNull()
  })

  it('never checks Xero for budgets when the page has not wired the seed handler', async () => {
    stubFetch(available)
    render(<ForecastEmptyState businessId="biz-1" fiscalYear={2027} onCreateForecast={vi.fn()} />)
    await screen.findByText(/Connect Xero to import your historical data/)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/Xero/budgets'))).toBe(false)
    expect(screen.queryByRole('button', { name: /Start from Xero budget/ })).toBeNull()
  })
})
