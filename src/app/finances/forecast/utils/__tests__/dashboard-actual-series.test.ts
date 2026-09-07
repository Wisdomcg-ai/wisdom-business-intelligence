/**
 * The dashboard's actual series — Urban Road, 8 Sep 2026.
 *
 * Xero held $1,144,098 of FY27 actuals (Jul $495,275, Aug $537,512, Sep
 * $111,311 part-month) while the KPI strip showed YTD $0 and called July "this
 * month", because forecast_pl_lines.actual_months has been empty for every
 * forecast generated since Phase 44.
 */
import { describe, it, expect } from 'vitest'
import { deriveActualSeries, type DashboardActualMonth } from '../dashboard-actual-series'

const PLAN = {
  //                     Jul      Aug      Sep      Oct      Nov
  revenue: [495_170, 533_062, 450_018, 450_000, 800_000],
  grossProfit: [177_559, 302_753, 170_321, 170_000, 320_000],
  netProfit: [9_052, 150_132, 10_639, 10_000, 140_000],
  dataLastActualIndex: -1, // nothing in actual_months — the state since Phase 44
}

const month = (m: string, rev: number | null, gp: number | null, np: number | null): DashboardActualMonth =>
  ({ month: m, revenueActual: rev, gpActual: gp, npActual: np })

const XERO: DashboardActualMonth[] = [
  month('2026-07', 495_275, 177_663, 14_067),
  month('2026-08', 537_512, 307_086, 145_494),
  month('2026-09', 111_311, 100_628, 69_950),
  month('2026-10', null, null, null),
  month('2026-11', null, null, null),
]

describe('deriveActualSeries', () => {
  it('uses Xero actuals for the months it has, and the plan beyond them', () => {
    const s = deriveActualSeries(PLAN, XERO)
    expect(s.fromXero).toBe(true)
    expect(s.dataLastActualIndex).toBe(2) // September is the latest actual
    expect(s.revenue.slice(0, 3)).toEqual([495_275, 537_512, 111_311])
    expect(s.revenue.slice(3)).toEqual([450_000, 800_000]) // untouched plan
    expect(s.netProfit[1]).toBe(145_494)
  })

  it('gives the strip a real YTD instead of $0', () => {
    const s = deriveActualSeries(PLAN, XERO)
    const ytd = s.revenue.slice(0, s.dataLastActualIndex + 1).reduce((a, b) => a + b, 0)
    expect(ytd).toBe(1_144_098) // matches xero_pl_lines for Urban Road FY27
    // "this month" is the latest actual, not the first month of the year.
    expect(s.revenue[s.dataLastActualIndex]).toBe(111_311)
  })

  it('year-end = actuals so far + plan for the rest', () => {
    const s = deriveActualSeries(PLAN, XERO)
    expect(s.revenue.reduce((a, b) => a + b, 0)).toBe(1_144_098 + 450_000 + 800_000)
  })

  it('falls back to the stored totals when the fetch failed or returned nothing', () => {
    for (const empty of [null, undefined, [] as DashboardActualMonth[]]) {
      const s = deriveActualSeries(PLAN, empty)
      expect(s.fromXero).toBe(false)
      expect(s.revenue).toBe(PLAN.revenue) // same reference — untouched
      expect(s.dataLastActualIndex).toBe(-1)
    }
  })

  it('falls back when Xero has the months but no actuals in any of them', () => {
    const s = deriveActualSeries(PLAN, XERO.map((m) => month(m.month, null, null, null)))
    expect(s.fromXero).toBe(false)
    expect(s.dataLastActualIndex).toBe(-1)
  })

  it('keeps a forecast that already had its own actuals working', () => {
    // Envisage-style: actual_months populated, so totals already carry actuals.
    const withStored = { ...PLAN, dataLastActualIndex: 1 }
    const s = deriveActualSeries(withStored, null)
    expect(s.dataLastActualIndex).toBe(1)
    expect(s.fromXero).toBe(false)
  })

  it('a genuine $0 inside the actual window is zero, not the plan', () => {
    // August: revenue booked, but GP/NP net to nothing.
    const zeros = [XERO[0], month('2026-08', 400_000, null, null), ...XERO.slice(2)]
    const s = deriveActualSeries(PLAN, zeros)
    expect(s.revenue[1]).toBe(400_000)
    expect(s.grossProfit[1]).toBe(0)
    expect(s.netProfit[1]).toBe(0)
  })

  it('a gap before the last actual keeps the plan for that month', () => {
    // Xero missing August entirely (not yet synced) but September present.
    const gap = [XERO[0], month('2026-08', null, null, null), XERO[2], XERO[3], XERO[4]]
    const s = deriveActualSeries(PLAN, gap)
    expect(s.dataLastActualIndex).toBe(2)
    expect(s.revenue[1]).toBe(533_062) // August falls back to plan
    expect(s.revenue[2]).toBe(111_311)
  })

  it('tolerates a shorter Xero array than the plan', () => {
    const s = deriveActualSeries(PLAN, XERO.slice(0, 2))
    expect(s.dataLastActualIndex).toBe(1)
    expect(s.revenue).toHaveLength(PLAN.revenue.length)
    expect(s.revenue[4]).toBe(800_000)
  })
})
