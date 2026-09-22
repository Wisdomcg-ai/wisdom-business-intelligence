/**
 * Urban Road, 10 Sep 2026. A coach clicked Regenerate, watched the budget land
 * on $450,000 — the locked Xero budget version the client had just been
 * switched onto — and watched it revert to $533,062, a superseded forecast,
 * about a second later. Both the screen and the saved snapshot ended up on the
 * old figure, so the regenerate was a no-op with an animation.
 *
 * The generate was never wrong. The line AFTER it was: `handleGenerateReport`
 * read the stored snapshot for its commentary and its draft/final status, and
 * the reader it used also pushed the stored report_data into state — putting
 * last week's report back on screen over the one just generated. Auto-save then
 * watched commentary change, fired 500ms later, and wrote whatever was in state
 * (the resurrected old report) over the fresh save that had just landed.
 *
 * The rule these tests pin: reading a snapshot and showing one are two
 * different acts with two different names.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { useMonthlyReport } from '../useMonthlyReport'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            // Single-entity business: one connection, so no consolidation branch.
            eq: () => Promise.resolve({ count: 1 }),
          }),
        }),
      }),
    }),
  }),
}))

const BUSINESS_ID = '28d41193-38ae-4071-a2b1-0dbea90a38fd'

/** What the generate API returns today: the locked budget version. */
const FRESH = {
  business_id: BUSINESS_ID,
  report_month: '2026-08',
  fiscal_year: 2027,
  sections: [],
  summary: { revenue: { actual: 537401.06, budget: 450000 } },
  budget_source: 'budget_version',
  budget_forecast_name: 'Overall Budget (Xero, rev 12 Aug 2026)',
  has_budget: true,
  is_draft: true,
}

/** What was sitting in monthly_report_snapshots: the superseded forecast. */
const STORED = {
  business_id: BUSINESS_ID,
  report_month: '2026-08',
  fiscal_year: 2027,
  sections: [],
  summary: { revenue: { actual: 537401.06, budget: 533061.83 } },
  budget_forecast_name: 'FY2027 Forecast (from Xero budget)',
  has_budget: true,
  is_draft: true,
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

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/api/monthly-report/generate')) {
        return { ok: true, json: async () => ({ report: FRESH }) } as unknown as Response
      }
      if (String(url).includes('/api/monthly-report/snapshot')) {
        return {
          ok: true,
          json: async () => ({
            snapshot: { status: 'draft', commentary: { Freight: { coach_note: 'kept' } }, report_data: STORED },
          }),
        } as unknown as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reading a snapshot vs showing one', () => {
  it('fetchSnapshot returns the stored month without touching what is on screen', async () => {
    const { api, Harness } = makeHarness()
    render(<Harness />)

    await act(async () => {
      await api.current!.generateReport('2026-08', 2027)
    })
    expect(api.current!.report?.summary).toEqual(FRESH.summary)

    // The generate path's real reason for reading the snapshot.
    let snapshot: Awaited<ReturnType<Api['fetchSnapshot']>> = null
    await act(async () => {
      snapshot = await api.current!.fetchSnapshot('2026-08')
    })

    // It still hands back everything the caller came for...
    expect(snapshot!.status).toBe('draft')
    expect(snapshot!.commentary).toEqual({ Freight: { coach_note: 'kept' } })
    expect(snapshot!.report_data.summary).toEqual(STORED.summary)

    // ...and the freshly generated report is still the one on screen. This is
    // the assertion that fails on the old code: budget reverts to 533,061.83.
    expect(api.current!.report?.summary).toEqual(FRESH.summary)
    expect(api.current!.report?.budget_source).toBe('budget_version')
  })

  it('loadSnapshot still shows the stored month — that is its whole job', async () => {
    const { api, Harness } = makeHarness()
    render(<Harness />)

    await act(async () => {
      await api.current!.generateReport('2026-08', 2027)
    })
    expect(api.current!.report?.summary).toEqual(FRESH.summary)

    // Changing month / opening one from Report History: the stored report is
    // exactly what the coach asked to see.
    await act(async () => {
      await api.current!.loadSnapshot('2026-08')
    })
    expect(api.current!.report?.summary).toEqual(STORED.summary)
  })

  it('loadSnapshot leaves the screen alone when the month has no snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/monthly-report/generate')) {
          return { ok: true, json: async () => ({ report: FRESH }) } as unknown as Response
        }
        return { ok: true, json: async () => ({ snapshot: null }) } as unknown as Response
      }),
    )
    const { api, Harness } = makeHarness()
    render(<Harness />)

    await act(async () => {
      await api.current!.generateReport('2026-08', 2027)
    })
    let snapshot: unknown = 'unset'
    await act(async () => {
      snapshot = await api.current!.loadSnapshot('2026-08')
    })
    expect(snapshot).toBeNull()
    expect(api.current!.report?.summary).toEqual(FRESH.summary)
  })
})
