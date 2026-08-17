/**
 * Step 5 (Subscriptions) budget inputs — regression for the on-screen
 * "glitching" reported 18 Aug 2026.
 *
 * The old inputs were uncontrolled with the edited VALUE embedded in the React
 * key (`key={`mo-${vendorKey}-${monthlyBudget}`}`), a remount-as-sync hack:
 *  - Enter blurred to <body> and the input's DOM node was destroyed — focus
 *    vanished; on a 40-vendor table Tab restarted from the top of the page.
 *  - Clearing a field committed a hard $0 via `parseFloat('') || 0` — silent
 *    zeroing on a CFO-accuracy product.
 *  - Every debounced autosave also injected a full-width success banner above
 *    the table for 3s, shoving the table down and back — the visible glitch.
 *
 * These tests mount the REAL Step6Subscriptions in manual mode (no Xero) with
 * a saved vendor and drive the actual input.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { Step6Subscriptions } from '@/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions'

const savedBudget = {
  vendor_key: 'stripe',
  vendor_name: 'Stripe',
  monthly_budget: 50,
  is_active: true,
  frequency: 'monthly',
  renewal_month: null,
  category: 'Software & Technology',
  account_codes: ['6100'],
}

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/api/Xero/chart-of-accounts')) {
      return new Response(JSON.stringify({ error: 'no connection' }), { status: 404 })
    }
    if (u.includes('/api/subscription-budgets') && (!init || init.method === undefined || init.method === 'GET')) {
      return new Response(JSON.stringify({ budgets: [savedBudget] }), { status: 200 })
    }
    if (u.includes('/api/subscription-budgets') && init?.method === 'POST') {
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }))
}

const noopActions = new Proxy({}, { get: () => () => {} }) as never

const baseState = {
  subscriptions: [],
  fiscalYearStart: 7,
} as never

async function renderStep() {
  render(
    <Step6Subscriptions
      state={baseState}
      actions={noopActions}
      businessId="biz-1"
      fiscalYear={2027}
    />,
  )
  // Manual mode boots via the 404 branch, then restores the saved budget.
  await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument())
  return within(screen.getByText('Stripe').closest('tr') as HTMLElement)
}

describe('Step 5 Subscriptions — VendorBudgetInput', () => {
  beforeEach(() => { mockFetch() })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('keeps focus in the input after Enter (no blur-to-body remount)', async () => {
    const user = userEvent.setup()
    const row = await renderStep()
    const input = row.getByRole('textbox') as HTMLInputElement

    await user.click(input)
    await user.clear(input)
    await user.type(input, '75{Enter}')

    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('75')
  })

  it('clearing the field and tabbing away reverts — it must NOT commit $0', async () => {
    const user = userEvent.setup()
    const row = await renderStep()
    const input = row.getByRole('textbox') as HTMLInputElement

    await user.click(input)
    await user.clear(input)
    await user.tab()

    // Empty is "never mind", not "$0": the silent-zeroing path the stale
    // comment in the old code claimed was already fixed.
    expect(input.value).toBe('50')
  })

  it('typing 0 explicitly DOES zero the budget', async () => {
    const user = userEvent.setup()
    const row = await renderStep()
    const input = row.getByRole('textbox') as HTMLInputElement

    await user.click(input)
    await user.clear(input)
    await user.type(input, '0')
    await user.tab()

    expect(input.value).toBe('0')
  })

  it('decimals survive typing (the controlled predecessor collapsed "12." to 12)', async () => {
    const user = userEvent.setup()
    const row = await renderStep()
    const input = row.getByRole('textbox') as HTMLInputElement

    await user.click(input)
    await user.clear(input)
    await user.type(input, '12.5')
    expect(input.value).toBe('12.5')
    await user.tab()
    expect(input.value).toBe('12.50')
  })

  it('Escape restores the canonical value without committing', async () => {
    const user = userEvent.setup()
    const row = await renderStep()
    const input = row.getByRole('textbox') as HTMLInputElement

    await user.click(input)
    await user.clear(input)
    await user.type(input, '999{Escape}')
    expect(input.value).toBe('50')
  })

  it('no full-width save banner appears above the table on save', async () => {
    const user = userEvent.setup()
    const row = await renderStep()
    const input = row.getByRole('textbox') as HTMLInputElement

    await user.click(input)
    await user.clear(input)
    await user.type(input, '75{Enter}')

    // The banner was injected on every debounced autosave and reflowed the
    // whole table for 3 seconds — the reported "glitching on screen".
    expect(screen.queryByText(/saved successfully/i)).not.toBeInTheDocument()
  })
})
