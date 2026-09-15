/**
 * A consolidated report carries the exchange-rate state of the figures on it.
 *
 * Pre-flight refuses an export whose months have no rate (IICT-04), but it
 * read the rates off the page's separate per-entity report — held from
 * whichever month was loaded first, and never loaded at all for a client. So
 * an August report with no August rate exported against July's clean list,
 * and a client exporting Dragon Roofing (no foreign currency) was refused with
 * "generate again", which the coach-only route answers with a 403. The report
 * now records its own missing rates, and saves them with the snapshot; and
 * Generate hands the page the consolidated report it adapted, so the
 * per-entity page is the same generation as the statements.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { useMonthlyReport, adaptConsolidatedToGeneratedReport } from '../useMonthlyReport'
import { runPreflight, exportRefusals } from '@/lib/monthly-report/preflight'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ count: 3 }),
          }),
        }),
      }),
    }),
  }),
}))

const IICT = 'fbc6dffd-677d-47ec-8277-7157982938e7'

const consolidated = (missing: string[] | null) => ({
  consolidated: {
    lines: [{ account_type: 'revenue', account_name: 'Membership income', monthly_values: { '2026-07': 409_984, '2026-08': 1_660_961 } }],
    budgetLines: [],
  },
  ...(missing === null
    ? {}
    : { fx_context: { rates_used: {}, missing_rates: missing.map((period) => ({ currency_pair: 'HKD/AUD', period })) } }),
})

describe('adaptConsolidatedToGeneratedReport — exchange rates', () => {
  it('records the months the consolidation found no rate for', () => {
    const r = adaptConsolidatedToGeneratedReport(consolidated(['2026-07', '2026-08']), '2026-08', 2027, IICT)
    expect(r.consolidation_fx).toEqual({
      missing_rates: [
        { currency_pair: 'HKD/AUD', period: '2026-07' },
        { currency_pair: 'HKD/AUD', period: '2026-08' },
      ],
    })
    // Refused on the report alone — no per-entity report needed.
    expect(exportRefusals(runPreflight({ report: r, consolidated: null }))).toHaveLength(1)
  })

  it('records a clean list as clean', () => {
    const r = adaptConsolidatedToGeneratedReport(consolidated([]), '2026-08', 2027, IICT)
    expect(r.consolidation_fx).toEqual({ missing_rates: [] })
    expect(exportRefusals(runPreflight({ report: r, consolidated: null }))).toEqual([])
  })

  it('a response with no fx_context records nothing, rather than a clean list it never saw', () => {
    const r = adaptConsolidatedToGeneratedReport(consolidated(null), '2026-08', 2027, IICT)
    expect(r.consolidation_fx).toBeUndefined()
  })
})

describe('Generate hands the page the consolidated report it adapted', () => {
  let body: unknown
  beforeEach(() => {
    body = consolidated(['2026-08'])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/monthly-report/consolidated')) {
        return { ok: true, json: async () => ({ report: body }) } as unknown as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('with the month and year it was built for', async () => {
    const onConsolidatedReport = vi.fn()
    const api: { current: ReturnType<typeof useMonthlyReport> | null } = { current: null }
    function Harness() {
      api.current = useMonthlyReport(IICT, { onConsolidatedReport })
      return null
    }
    render(<Harness />)
    await act(async () => { await Promise.resolve() })
    let report: any
    await act(async () => {
      report = await api.current!.generateReport('2026-08', 2027, true, 0)
    })
    expect(onConsolidatedReport).toHaveBeenCalledTimes(1)
    expect(onConsolidatedReport).toHaveBeenCalledWith(body, '2026-08', 2027)
    expect(report.consolidation_fx.missing_rates).toEqual([{ currency_pair: 'HKD/AUD', period: '2026-08' }])
  })
})
