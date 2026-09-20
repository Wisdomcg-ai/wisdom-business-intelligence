/**
 * The per-entity consolidated report an export prints, and pre-flight checks
 * the exchange rates of, is the one built for the report being exported.
 *
 * The page's cache held whichever month was loaded first. IICT opened on July
 * (rate stored), the coach moved to August (no rate) and generated: the export
 * reused July's report, whose missing-rate list — confined to July's months —
 * was empty, so the August pack passed "FX rates complete". And the other way:
 * a report cached with August missing kept refusing after the rates were
 * loaded and the report generated again, because Generate never touched it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useConsolidatedReport } from '../useConsolidatedReport'

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

const vm = (month: string, missing: string[]) => ({
  label: month,
  fx_context: { rates_used: {}, missing_rates: missing.map((period) => ({ currency_pair: 'HKD/AUD', period })) },
})

let pending: Array<{ month: string; resolve: () => void }> = []

beforeEach(() => {
  pending = []
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (!String(url).includes('/api/monthly-report/consolidated')) throw new Error(`unexpected fetch: ${url}`)
    const month = JSON.parse(String(init?.body)).report_month as string
    return new Promise<Response>((resolve) => {
      pending.push({
        month,
        resolve: () => resolve({ ok: true, json: async () => ({ report: vm(month, month === '2026-08' ? ['2026-08'] : []) }) } as unknown as Response),
      })
    })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function mounted() {
  const api: { current: ReturnType<typeof useConsolidatedReport> | null } = { current: null }
  function Harness() {
    api.current = useConsolidatedReport(IICT)
    return null
  }
  render(<Harness />)
  await act(async () => { await Promise.resolve() })
  return api
}

describe('the consolidated cache knows which month it holds', () => {
  it('a July report is not the report for an August export', async () => {
    const api = await mounted()
    await act(async () => {
      const p = api.current!.generateConsolidated('2026-07', 2027)
      pending.shift()!.resolve()
      await p
    })
    expect(api.current!.reportFor('2026-08', 2027)).toBeNull()
    expect(api.current!.reportFor('2026-07', 2027)).toMatchObject({ label: '2026-07' })
    expect(api.current!.reportFor('2026-07', 2026)).toBeNull()
  })

  it('Generate’s own consolidated report replaces the cache, and a load that started before it cannot put the old one back', async () => {
    const api = await mounted()
    let stale: Promise<unknown>
    await act(async () => {
      // The tab's auto-load, still in flight when the coach generates.
      stale = api.current!.generateConsolidated('2026-08', 2027)
      await Promise.resolve()
    })
    const fresh = vm('2026-08', [])
    await act(async () => {
      api.current!.prime(fresh, '2026-08', 2027)
    })
    expect(api.current!.reportFor('2026-08', 2027)).toBe(fresh)
    expect(api.current!.isLoading).toBe(false)
    await act(async () => {
      pending.shift()!.resolve()
      await stale
    })
    // The superseded load still answers its own caller, but not the cache.
    await expect(stale!).resolves.toMatchObject({ fx_context: { missing_rates: [{ period: '2026-08' }] } })
    expect(api.current!.reportFor('2026-08', 2027)).toBe(fresh)
  })

  it('a slower July load landing after an August one does not take August’s place', async () => {
    const api = await mounted()
    await act(async () => {
      const july = api.current!.generateConsolidated('2026-07', 2027)
      const august = api.current!.generateConsolidated('2026-08', 2027)
      pending[1].resolve()
      await august
      pending[0].resolve()
      await july
    })
    expect(api.current!.reportFor('2026-08', 2027)).toMatchObject({ label: '2026-08' })
    expect(api.current!.reportFor('2026-07', 2027)).toBeNull()
    expect(api.current!.isLoading).toBe(false)
  })

  it('the page wires it: the export reads the cache by month, Generate primes it, both pre-flights get the currencies', () => {
    // Source-level, as proceed-as-draft-persistence pins handleGenerateReport:
    // the page is too large to mount, and each of these was the defect.
    const page = readFileSync(resolve(__dirname, '../../page.tsx'), 'utf8')
    const pdfLoad = page.slice(page.indexOf('WD.6 — per-entity consolidated report'), page.indexOf('WG.1 — the two balance-sheet pages'))
    // Keyed on the month of the report being exported, not the month picker.
    expect(pdfLoad).toContain('const consolidatedMonth = report?.report_month ?? selectedMonth')
    expect(pdfLoad).toContain('consolidatedReportFor(consolidatedMonth, consolidatedFY)')
    expect(pdfLoad).not.toMatch(/\(consolidatedReport as any\)\s*\|\|/)
    expect(page).toMatch(/useMonthlyReport\(businessId, \{\s*onConsolidatedReport:/)
    expect(page).toContain('primeConsolidatedRef.current = primeConsolidated')
    expect(page.match(/consolidated: consolidatedForPreflight\([^)]*\),\s*foreignCurrencies,/g)).toHaveLength(2)
  })

  it('clear forgets the month too', async () => {
    const api = await mounted()
    await act(async () => {
      api.current!.prime(vm('2026-08', []), '2026-08', 2027)
    })
    await act(async () => {
      api.current!.clear()
    })
    expect(api.current!.report).toBeNull()
    expect(api.current!.reportFor('2026-08', 2027)).toBeNull()
  })
})
