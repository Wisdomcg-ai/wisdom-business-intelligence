/**
 * Notes have to fit on the paper.
 *
 * jsPDF's `text()` does not wrap: hand it a string wider than the page and it
 * draws off the edge, where the overflow is simply not printed and nothing
 * says so. Every note the pack draws goes through drawNote, which wraps.
 *
 * The note these tests were first written for — the 179-character "Every
 * budget figure on this page is the approved budget …" on the executive
 * summary and the YTD page — is no longer in the pack (Matt, 14 Sep 2026; see
 * pdf-pack-chrome-decisions.test.ts, which proves it is gone). What still
 * prints is the fail-open sentence on the Full Year page, and it must wrap.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, fixtureFullYear, textRuns, pageContaining } from './pdf-pack-fixture'

const URBAN_ROAD_VERSION = 'Overall Budget (Xero, rev 12 Aug 2026)'

const budgetStoreReport = () =>
  fixtureReport({ budget_source: 'budget_version', budget_forecast_name: URBAN_ROAD_VERSION })

describe('the notes the pack still prints fit the page they are drawn on', () => {
  it('wraps the full-year fallback note, the one sentence that page still prints', () => {
    // Calxa's Current Year Budget page has no note under its title, so the
    // version label went with the rest of the subtitle. What remains is the
    // budget-store client whose approved budget did not resolve — and that
    // sentence must reach the paper as wrapped lines like every other note.
    const doc: any = new MonthlyReportPDFService(budgetStoreReport(), {
      fullYearReport: fixtureFullYear({ forecastMonthly: 90_000, approvedMonthly: null }),
    }).generate()
    const page = pageContaining(doc, 'Full Year Projection')
    const runs = textRuns(doc, page)
    const start = runs.findIndex((r) => r.startsWith('No approved budget is in force'))
    expect(start).toBeGreaterThanOrEqual(0)
    for (const run of runs.slice(start, start + 3)) expect(run.length).toBeLessThan(200)
  })

  it('prints no subtitle note on the Current Year Budget page', () => {
    const doc: any = new MonthlyReportPDFService(budgetStoreReport(), {
      fullYearReport: fixtureFullYear({ forecastMonthly: 90_000, approvedMonthly: 95_000 }),
    }).generate()
    const page = pageContaining(doc, 'Current Year Budget')
    expect(page).toBeGreaterThan(0)
    const runs = textRuns(doc, page)
    expect(runs.some((r) => r.startsWith('Actuals through'))).toBe(false)
    expect(runs.some((r) => r.includes(URBAN_ROAD_VERSION))).toBe(false)
  })
})
