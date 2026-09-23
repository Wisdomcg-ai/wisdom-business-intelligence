/**
 * One chart, two surfaces, one set of words.
 *
 * The variance heatmap is drawn twice — as a card on the Charts tab and as a
 * landscape page in the exported pack — from the same `transformVarianceHeatmapData`.
 * The tab learned two things and the pack learned neither: that "Budget" stops
 * naming anything once an approved budget sits beside a forecast, and that a
 * heatmap with no forecast behind it cannot be drawn at all.
 *
 * The second is the one that reached a client. With no forecast every cell's
 * budget is 0, the divide-by-zero guard leaves variancePct at 0, `cells.length`
 * is still non-zero because actuals exist, and getHeatmapColor(0) takes its
 * favourable branch — a full five-category by twelve-month grid of on-track
 * green, derived from nothing. Distinct Directions is in exactly that state:
 * their only FY2027 forecast is is_active = false.
 *
 * These helpers exist so the two renderers cannot answer differently. Asserting
 * on them is asserting on both pages.
 */
import { describe, it, expect } from 'vitest'
import {
  heatmapYardstick,
  heatmapTitle,
  heatmapUnavailableReason,
  HEATMAP_SUBTITLE,
  HEATMAP_UNAVAILABLE_TITLE,
} from '../VarianceHeatmapChart'
import type { FullYearReport, FullYearLine, FullYearMonthData } from '../../../types'

const MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
]

function line(approvedAnnual: number | null, forecastAnnual: number): FullYearLine {
  const months: FullYearMonthData[] = MONTHS.map((month) => ({
    month,
    budget: forecastAnnual / 12,
    actual: 1000,
    approved_budget: approvedAnnual === null ? null : approvedAnnual / 12,
    prior_year: 0,
    source: 'forecast' as const,
  }))
  return {
    account_name: 'Total Revenue',
    category: 'Revenue',
    months,
    projected_total: forecastAnnual,
    annual_budget: forecastAnnual,
    approved_annual_budget: approvedAnnual,
    variance_amount: 0,
    variance_percent: 0,
  }
}

/** `approved` null = not on the budget store; `forecast` 0 = no active forecast. */
function report(approved: number | null, forecast: number): FullYearReport {
  return {
    business_id: 'c6c741db-6c09-45be-974c-5e6ca2cadf84',
    fiscal_year: 2027,
    last_actual_month: '2026-08',
    sections: [{ category: 'Revenue', lines: [line(approved, forecast)], subtotal: line(approved, forecast) }],
    gross_profit: line(approved, forecast),
    net_profit: line(approved, forecast),
    approved_budget_label: approved === null ? null : 'Overall Budget',
    forecast_available: forecast !== 0,
  }
}

describe('the heatmap names the yardstick it measured against', () => {
  it('says Forecast once an approved budget shares the pack with it', () => {
    // The Full Year page three pages later reserves "Approved Budget" for the
    // other column. An unqualified "Budget" here would name neither.
    expect(heatmapYardstick(report(6973968, 6900000))).toBe('Forecast')
    expect(heatmapTitle(report(6973968, 6900000))).toBe('Forecast Variance Heatmap')
  })

  it('stays plain Budget for the ten clients with only one yardstick', () => {
    // Their pack must not change: there is nothing to disambiguate from.
    expect(heatmapYardstick(report(null, 6900000))).toBe('Budget')
    expect(heatmapTitle(report(null, 6900000))).toBe('Budget Variance Heatmap')
  })

  it('has one subtitle, not one per surface', () => {
    expect(HEATMAP_SUBTITLE).toContain('Green = favorable')
  })
})

describe('the heatmap refuses rather than printing a grid of green', () => {
  it('gives a reason when no forecast exists for the year', () => {
    const reason = heatmapUnavailableReason(report(6973968, 0))
    expect(reason).toBeTruthy()
    expect(reason).toContain('FY2027')
    // The trap named in the reader's own terms: 0% is not "on track".
    expect(reason).toContain('not the same as being on track')
  })

  it('refuses even when a real approved budget exists', () => {
    // Distinct Directions' shape. The approved budget is not what this chart
    // measures against, so having one does not make the cells computable —
    // and the page two clicks away printing a real budget makes the green grid
    // look corroborated rather than empty.
    expect(heatmapUnavailableReason(report(6973968, 0))).toBeTruthy()
  })

  it('draws the grid when a forecast is there', () => {
    expect(heatmapUnavailableReason(report(6973968, 6900000))).toBeNull()
    expect(heatmapUnavailableReason(report(null, 6900000))).toBeNull()
  })

  it('heads the refusal without a yardstick word, because none applies', () => {
    expect(HEATMAP_UNAVAILABLE_TITLE).toBe('Variance Heatmap')
  })
})
