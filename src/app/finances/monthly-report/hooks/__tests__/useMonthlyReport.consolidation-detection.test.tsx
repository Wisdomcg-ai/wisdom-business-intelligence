/**
 * DRG-52 — a report is never generated on the wrong route because detection
 * had not answered yet.
 *
 * `isConsolidationGroup` starts null and the route was chosen with
 * `isConsolidationGroup === true`, so a Generate clicked before the
 * xero_connections count came back went to the SINGLE-entity route for Dragon
 * Roofing + Easy Hail — one org's figures under the group's name. Nothing on
 * the page gated the button, and "Continue as draft", Report History and a
 * settings change all generate through the same function.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { useMonthlyReport } from '../useMonthlyReport'

const detection = vi.hoisted(() => ({
  resolve: (_v: { count: number }) => {},
  promise: null as Promise<{ count: number }> | null,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => detection.promise!,
          }),
        }),
      }),
    }),
  }),
}))

const BUSINESS_ID = 'c7df2983-5711-4959-8ec8-a48030d62666'

type Api = ReturnType<typeof useMonthlyReport>

function makeHarness() {
  const api: { current: Api | null } = { current: null }
  function Harness() {
    api.current = useMonthlyReport(BUSINESS_ID)
    return null
  }
  return { api, Harness }
}

const fetchMock = vi.fn()

beforeEach(() => {
  detection.promise = new Promise((resolve) => { detection.resolve = resolve })
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/monthly-report/consolidated')) {
      return { ok: true, json: async () => ({ report: { byTenant: [], consolidated: { lines: [], budgetLines: [] }, eliminations: [], fx_context: { rates_used: {}, missing_rates: [] }, diagnostics: {} } }) } as unknown as Response
    }
    return { ok: true, json: async () => ({ report: { business_id: BUSINESS_ID, report_month: '2026-08', sections: [] } }) } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const endpoints = () => fetchMock.mock.calls.map((c) => String(c[0]))

describe('generate waits for consolidation detection', () => {
  it('does not post to the single-entity route while detection is unresolved', async () => {
    const { api, Harness } = makeHarness()
    render(<Harness />)
    expect(api.current!.isConsolidationGroup).toBeNull()

    let pending: Promise<unknown> | undefined
    await act(async () => {
      pending = api.current!.generateReport('2026-08', 2027)
      await Promise.resolve()
    })
    expect(endpoints()).not.toContain('/api/monthly-report/generate')

    // Dragon has two consolidation-included orgs.
    await act(async () => {
      detection.resolve({ count: 2 })
      await pending
    })
    expect(endpoints()).toEqual(['/api/monthly-report/consolidated'])
  })

  it('a single-org business still generates on the single-entity route once detection answers', async () => {
    const { api, Harness } = makeHarness()
    render(<Harness />)
    let pending: Promise<unknown> | undefined
    await act(async () => {
      pending = api.current!.generateReport('2026-08', 2027)
      detection.resolve({ count: 1 })
      await pending
    })
    expect(endpoints()).toEqual(['/api/monthly-report/generate'])
  })

  it('after detection has answered, generate goes straight to the right route', async () => {
    const { api, Harness } = makeHarness()
    render(<Harness />)
    await act(async () => {
      detection.resolve({ count: 2 })
      await detection.promise
    })
    expect(api.current!.isConsolidationGroup).toBe(true)
    await act(async () => {
      await api.current!.generateReport('2026-08', 2027)
    })
    expect(endpoints()).toEqual(['/api/monthly-report/consolidated'])
  })
})
