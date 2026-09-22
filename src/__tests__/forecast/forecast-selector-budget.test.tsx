/**
 * "Start from Xero budget" inside the Forecast Builder selector.
 *
 * A current-FY business with Xero actuals never sees the forecast empty
 * state (the page renders the estimated dashboard), so this modal is where
 * it starts a forecast. The budget start must be offered here too — for a
 * year with no forecast, and for a listed version that is still empty — and
 * must name the empty version it will seed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ForecastSelector } from '@/app/finances/forecast/components/ForecastSelector'
import type { BudgetAvailabilityResponse } from '@/lib/xero/budget-availability'

vi.mock('next/navigation', () => ({ usePathname: () => '/coach/clients/28d41193/view/finances/forecast' }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({ resolveBusinessProfileId: vi.fn(async () => 'profile-1') }))

let forecastRows: Array<Record<string, unknown>> = []
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      const chain = () => b
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'delete']) b[m] = vi.fn(chain)
      b.maybeSingle = vi.fn(async () => (table === 'business_profiles' ? { data: { id: 'profile-1' }, error: null } : { data: null, error: null }))
      ;(b as { then?: unknown }).then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(table === 'financial_forecasts' ? { data: forecastRows, error: null } : { data: null, error: null }).then(res, rej)
      return b
    },
  }),
}))

const cov = (monthsInFY: number) => ({ firstPeriod: '2026-07', lastPeriod: '2027-06', monthsInFY })
const available: BudgetAvailabilityResponse = {
  state: 'available', fiscalYear: 2027,
  orgs: [{ tenantId: 't-1', orgName: 'Urban Road', functionalCurrency: 'AUD', state: 'available',
    budgets: [{ budgetId: 'b-1', name: 'Overall Budget', type: 'OVERALL', updatedAt: null, lineCount: 61, coverage: cov(12) }] }],
}

let fetchMock: ReturnType<typeof vi.fn>
function stubFetch(budgets: unknown) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/Xero/budgets')) return { ok: true, status: 200, json: async () => budgets }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchMock)
}

const version = (over: Record<string, unknown> = {}) => ({
  id: 'f-1', name: 'FY2027 Forecast', fiscal_year: 2027, is_active: true, is_completed: true,
  revenue_goal: 6_000_000, net_profit_goal: 500_000, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-07T00:00:00Z',
  assumptions: { revenue: { lines: [{}] } },
  ...over,
})

function renderSelector(props: Partial<React.ComponentProps<typeof ForecastSelector>> = {}) {
  const onSeedFromXeroBudget = vi.fn()
  const utils = render(
    <ForecastSelector
      businessId="biz-1"
      fiscalYear={2027}
      onSelectForecast={vi.fn()}
      onCreateNew={vi.fn()}
      onClose={vi.fn()}
      onSeedFromXeroBudget={onSeedFromXeroBudget}
      {...props}
    />,
  )
  return { ...utils, onSeedFromXeroBudget }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ForecastSelector — Start from Xero budget', () => {
  it('no forecasts yet: offers the budget start beside Create New Forecast and seeds on click', async () => {
    forecastRows = []
    stubFetch(available)
    const { onSeedFromXeroBudget } = renderSelector()
    await screen.findByText(/No forecasts yet/)
    const cta = await screen.findByRole('button', { name: /Start from Xero budget/ })
    expect(screen.getByTestId('budget-availability').textContent).toContain('“Overall Budget”')
    fireEvent.click(cta)
    expect(onSeedFromXeroBudget).toHaveBeenCalledWith({ tenantId: 't-1', budgetId: 'b-1', budgetName: 'Overall Budget' })
  })

  it('an EMPTY listed version (no wizard data) gets the budget start in the footer, naming that version', async () => {
    forecastRows = [version({ id: 'f-empty', name: 'FY2027 from Xero budget', assumptions: null, is_completed: false })]
    stubFetch(available)
    const { onSeedFromXeroBudget } = renderSelector()
    await screen.findByText('FY2027 from Xero budget')
    const cta = await screen.findByRole('button', { name: /Start from Xero budget/ })
    fireEvent.click(cta)
    // The version's id AND name travel with the choice, so the wizard keeps the
    // name instead of letting Generate default it.
    expect(onSeedFromXeroBudget).toHaveBeenCalledWith({ tenantId: 't-1', budgetId: 'b-1', budgetName: 'Overall Budget', forecastId: 'f-empty', forecastName: 'FY2027 from Xero budget' })
  })

  it('a populated version offers no budget start — a budget can only start an empty forecast', async () => {
    forecastRows = [version()]
    stubFetch(available)
    renderSelector()
    await screen.findByText('FY2027 Forecast')
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/Xero/budgets'))).toBe(true))
    expect(screen.queryByRole('button', { name: /Start from Xero budget/ })).toBeNull()
    expect(screen.queryByTestId('budget-availability')).toBeNull()
  })

  it('scope_missing keeps the reconnect link inside the coach client context', async () => {
    forecastRows = []
    stubFetch({ state: 'scope_missing', fiscalYear: 2027, orgs: [{ tenantId: 't-1', orgName: 'Urban Road', functionalCurrency: 'AUD', state: 'scope_missing', budgets: [] }] })
    renderSelector()
    const link = await screen.findByRole('link', { name: /Reconnect Xero/ })
    expect(link).toHaveAttribute('href', '/coach/clients/28d41193/view/integrations')
    expect(screen.getByRole('button', { name: /Start from Xero budget/ })).toBeDisabled()
  })

  it('does not check Xero at all without the seed handler', async () => {
    forecastRows = []
    stubFetch(available)
    render(<ForecastSelector businessId="biz-1" fiscalYear={2027} onSelectForecast={vi.fn()} onCreateNew={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText(/No forecasts yet/)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/Xero/budgets'))).toBe(false)
    expect(screen.queryByRole('button', { name: /Start from Xero budget/ })).toBeNull()
  })
})
