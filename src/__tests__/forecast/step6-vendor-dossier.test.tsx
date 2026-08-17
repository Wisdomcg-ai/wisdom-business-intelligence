/**
 * Step 5 (Subscriptions) — vendor dossier surfaced to the operator.
 *
 * The derivation's evidence (18 Aug 2026 CFO upgrade) must actually reach the
 * screen with the right defaults, or it's an API field nobody sees:
 *
 *  - a LAPSED monthly (stopped mid-year) arrives default-EXCLUDED, badged with
 *    the stop month — carrying a dead sub forward silently overstates costs;
 *  - a ONE-OFF (single payment, no prior-year twin) arrives default-EXCLUDED;
 *  - active vendors stay default-included;
 *  - price movement is shown when the current price left the FY average.
 *
 * Mounts the real Step6Subscriptions in Xero mode and drives the real analyze
 * flow with a mocked API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { Step6Subscriptions } from '@/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions'

const account = {
  accountId: 'acc-1',
  accountCode: '6100',
  accountName: 'Software Subscriptions',
  accountType: 'EXPENSE',
  isSuggested: true,
}

const vendorBase = {
  transactions: [],
  priorFYAmount: 0, priorFYCount: 0, currentFYAmount: 0, currentFYCount: 0,
  totalAmount: 1200, transactionCount: 12, avgAmount: 100,
  confidence: 'high', firstTransaction: '2025-07-01', lastTransaction: '2026-08-01',
  monthsSpan: 12, accountCodes: ['6100'], accountSplits: {}, renewalMonth: null,
  daysSinceLastPayment: 10, priorYearTwin: false,
}

const VENDORS = [
  {
    ...vendorBase,
    vendorName: 'Zendesk', vendorKey: 'zendesk',
    suggestedFrequency: 'monthly', suggestedMonthlyBudget: 190,
    status: 'active', stoppedMonth: null, lastPaymentAmount: 190,
    // Price crept 160→190 during the year: evidence line must show.
    fyAverageMonthly: 170,
  },
  {
    ...vendorBase,
    vendorName: 'Old CRM', vendorKey: 'old-crm',
    suggestedFrequency: 'monthly', suggestedMonthlyBudget: 350,
    status: 'lapsed', stoppedMonth: '2026-03', lastPaymentAmount: 350,
    lastTransaction: '2026-03-04', daysSinceLastPayment: 160,
    fyAverageMonthly: 350,
  },
  {
    ...vendorBase,
    vendorName: 'Conference Tickets', vendorKey: 'conference-tickets',
    suggestedFrequency: 'ad-hoc', suggestedMonthlyBudget: 320,
    transactionCount: 1, status: 'one-off', stoppedMonth: null,
    lastPaymentAmount: 3800, fyAverageMonthly: 320,
  },
]

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/api/Xero/chart-of-accounts')) {
      return new Response(JSON.stringify({ accounts: [account] }), { status: 200 })
    }
    if (u.includes('/api/Xero/subscription-transactions')) {
      return new Response(
        JSON.stringify({ vendors: VENDORS, summary: { totalMonthly: 540 } }),
        { status: 200 },
      )
    }
    if (u.includes('/api/subscription-budgets') && init?.method === 'POST') {
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    if (u.includes('/api/subscription-budgets')) {
      return new Response(JSON.stringify({ budgets: [] }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }))
}

const noopActions = new Proxy({}, { get: () => () => {} }) as never
const baseState = { subscriptions: [], fiscalYearStart: 7 } as never

async function analyzeAndGetRows() {
  render(
    <Step6Subscriptions state={baseState} actions={noopActions} businessId="biz-1" fiscalYear={2027} />,
  )
  const user = userEvent.setup()
  // Suggested accounts are pre-selected; run the analysis.
  const analyzeBtn = await screen.findByRole('button', { name: /analyze subscriptions/i })
  await user.click(analyzeBtn)
  await waitFor(() => expect(screen.getByText('Zendesk')).toBeInTheDocument())
  const rowOf = (name: string) =>
    within(screen.getByText(name).closest('tr') as HTMLElement)
  return { rowOf, user }
}

describe('Step 5 — vendor dossier in the review table', () => {
  beforeEach(() => { mockFetch() })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('a lapsed vendor arrives default-EXCLUDED and badged with its stop month', async () => {
    const { rowOf } = await analyzeAndGetRows()
    const row = rowOf('Old CRM')
    expect((row.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
    expect(row.getByText(/stopped mar/i)).toBeInTheDocument()
  })

  it('a one-off arrives default-EXCLUDED and badged', async () => {
    const { rowOf } = await analyzeAndGetRows()
    const row = rowOf('Conference Tickets')
    expect((row.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
    expect(row.getByText(/one-off/i)).toBeInTheDocument()
  })

  it('an active vendor stays default-included with no badge noise', async () => {
    const { rowOf } = await analyzeAndGetRows()
    const row = rowOf('Zendesk')
    expect((row.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
    expect(row.queryByText(/stopped/i)).not.toBeInTheDocument()
  })

  it('price movement is evidenced when current price left the FY average', async () => {
    const { rowOf } = await analyzeAndGetRows()
    // avg $170 → now $190: the suggestion uses the current price and says so.
    expect(rowOf('Zendesk').getByText(/price rose/i)).toBeInTheDocument()
  })

  it('one click re-includes a lapsed vendor — the default is a nudge, not a wall', async () => {
    const { rowOf, user } = await analyzeAndGetRows()
    const checkbox = rowOf('Old CRM').getByRole('checkbox') as HTMLInputElement
    await user.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })
})
