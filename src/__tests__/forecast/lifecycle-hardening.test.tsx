/**
 * PR-C lifecycle hardening — regression tests.
 *
 * Covers the two paths that silently destroyed operator work:
 *   H10 — Step 2's "Refresh from Xero" (setPriorYear) rebuilt lines as a
 *         verbatim prior-year copy, undoing the locked actual months that
 *         #347/#349 established. The empty-forecast toast points operators
 *         straight at that button, so it was very reachable.
 *   H7  — the forecast page picked the most recently UPDATED forecast,
 *         ignoring is_active. Since drafts are inactive (PR-A), an abandoned
 *         wizard session shadowed the real forecast.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard'
import type { PriorYearData } from '@/app/finances/forecast/components/wizard-v4/types'

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear()
})

const FY_START = 2026
const JUL = '2026-07'

function priorYearWithLines(): PriorYearData {
  const flat = (annual: number) => {
    const out: Record<string, number> = {}
    for (let i = 0; i < 12; i++) {
      const cal = ((7 - 1 + i) % 12) + 1
      const yr = cal >= 7 ? FY_START - 1 : FY_START
      out[`${yr}-${String(cal).padStart(2, '0')}`] = annual / 12
    }
    return out
  }
  return {
    revenue: {
      total: 1_200_000,
      byMonth: flat(1_200_000),
      byLine: [{ id: 'r0', name: 'Sales - Insurance', total: 1_200_000, byMonth: flat(1_200_000) }],
    },
    cogs: {
      total: 600_000,
      percentOfRevenue: 50,
      byMonth: flat(600_000),
      byLine: [{ id: 'c0', name: 'Materials', total: 600_000, byMonth: flat(600_000), percentOfRevenue: 50 }],
    },
    grossProfit: { total: 600_000, percent: 50, byMonth: {} },
    opex: { total: 0, byMonth: {}, byLine: [] },
    seasonalityPattern: Array(12).fill(100 / 12),
  }
}

describe('H10 — Step 2 Refresh keeps locked actual months', () => {
  it('setPriorYear locks July revenue AND seeds July COGS from Xero actuals', () => {
    const { result } = renderHook(() => useForecastWizard(FY_START, 'biz-h10', true))

    // Seed the YTD actuals the way every mount path does.
    act(() => {
      result.current.actions.setCurrentYTD({
        revenue_by_month: { [JUL]: 250_000 },
        total_revenue: 250_000,
        months_count: 1,
        revenue_lines: [
          { account_name: 'Sales - Insurance', category: 'Revenue', total: 250_000, by_month: { [JUL]: 250_000 } },
        ],
        cogs_by_month: { [JUL]: 160_000 },
        cogs_lines: [
          { account_name: 'Materials', category: 'Cost of Sales', total: 160_000, by_month: { [JUL]: 160_000 } },
        ],
      })
    })

    // The destructive re-seed Step 2's Refresh button triggers.
    act(() => {
      result.current.actions.setPriorYear(priorYearWithLines())
    })

    const rev = result.current.state.revenueLines.find(l => l.name === 'Sales - Insurance')!
    // July is the Xero actual, NOT the prior-year copy (100,000).
    expect(rev.year1Monthly[JUL]).toBe(250_000)

    const cogs = result.current.state.cogsLines.find(l => l.name === 'Materials')!
    // COGS seeds ONLY the completed month; later months stay formula-driven.
    expect(cogs.year1Monthly?.[JUL]).toBe(160_000)
    expect(cogs.year1Monthly?.['2026-08']).toBeUndefined()
  })

  it('a line that did not trade in July locks at $0, not at prior-year revenue', () => {
    const { result } = renderHook(() => useForecastWizard(FY_START, 'biz-h10b', true))
    act(() => {
      result.current.actions.setCurrentYTD({
        revenue_by_month: { [JUL]: 250_000 },
        total_revenue: 250_000,
        months_count: 1,
        revenue_lines: [], // no line-level match for 'Sales - Insurance'
      })
    })
    act(() => {
      result.current.actions.setPriorYear(priorYearWithLines())
    })
    const rev = result.current.state.revenueLines[0]
    expect(rev.year1Monthly[JUL]).toBe(0)
  })
})

describe('H7 — forecast selection prefers the ACTIVE forecast', () => {
  // Mirrors the selection rule in ForecastService.getOrCreateForecast.
  const pick = (rows: { id: string; is_active?: boolean; assumptions?: object }[]) =>
    rows.find(f => f.is_active) ||
    rows.find(f => f.assumptions && Object.keys(f.assumptions).length > 0) ||
    rows[0]

  it('an abandoned newer DRAFT does not shadow the active forecast', () => {
    // Rows arrive ordered by updated_at desc — the draft is first.
    const rows = [
      { id: 'draft', is_active: false, assumptions: { revenue: {} } },
      { id: 'active', is_active: true, assumptions: { revenue: {} } },
    ]
    expect(pick(rows).id).toBe('active')
  })

  it('falls back to a row with assumptions when none is active', () => {
    const rows = [
      { id: 'empty-shell', is_active: false, assumptions: {} },
      { id: 'has-work', is_active: false, assumptions: { revenue: {} } },
    ]
    expect(pick(rows).id).toBe('has-work')
  })
})
