/**
 * Notes have to fit on the paper.
 *
 * jsPDF's `text()` does not wrap: hand it a string wider than the page and it
 * draws off the edge, where the overflow is simply not printed and nothing
 * says so. The yardstick note is 179 characters for Urban Road — "Every budget
 * figure on this page is the approved budget (Overall Budget (Xero, rev 12 Aug
 * 2026)) — not the forecast. The Full Year page names the same yardstick
 * "Approved Budget"." — and the executive summary is PORTRAIT, so the half
 * that got cut was the half naming the yardstick: the reason the note exists.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, fixtureFullYear, textRuns, pageContaining } from './pdf-pack-fixture'

const URBAN_ROAD_VERSION = 'Overall Budget (Xero, rev 12 Aug 2026)'

const budgetStoreReport = () =>
  fixtureReport({ budget_source: 'budget_version', budget_forecast_name: URBAN_ROAD_VERSION })

/** The run that starts the note, and everything drawn after it on that page. */
function noteRuns(doc: any, page: number): string[] {
  const runs = textRuns(doc, page)
  const start = runs.findIndex((r) => r.startsWith('Every budget figure'))
  return start === -1 ? [] : runs.slice(start)
}

describe('the yardstick note fits the page it is drawn on', () => {
  it('wraps on the PORTRAIT executive summary instead of running off the paper', () => {
    const doc: any = new MonthlyReportPDFService(budgetStoreReport(), {}).generate()
    const page = pageContaining(doc, 'Every budget figure')
    expect(page).toBeGreaterThan(0)
    const runs = noteRuns(doc, page)
    // Drawn as more than one line …
    expect(runs.length).toBeGreaterThan(1)
    // … and the first line is NOT the whole sentence: the tail that names the
    // yardstick is on a line of its own, on the paper.
    expect(runs[0]).not.toContain('yardstick')
    expect(runs.slice(1).join(' ')).toContain('yardstick')
  })

  it('is NOT repeated on the statement pages', () => {
    // Said once, on the executive summary. Repeating it on all four statement
    // pages put a developer's sentence in a client's pack four times over;
    // those pages carry the meaning in their column head instead.
    const doc: any = new MonthlyReportPDFService(budgetStoreReport(), {}).generate()
    const bva = pageContaining(doc, 'Budget vs Actual Detail')
    expect(bva).toBeGreaterThan(0)
    expect(noteRuns(doc, bva)).toEqual([])
  })

  it('renames the YTD column AND prints the note under it', () => {
    // The YTD page pushes 'Unspent' and 'Annual' — budget-derived columns too
    // narrow to rename, and the only unqualified budget money left in Urban
    // Road's pack until the note followed the column head onto this page.
    const doc: any = new MonthlyReportPDFService(budgetStoreReport(), {}).generate()
    const ytd = pageContaining(doc, 'YTD Detail')
    expect(ytd).toBeGreaterThan(0)
    expect(textRuns(doc, ytd).join(' ')).toContain('YTD Approved Budget')
    expect(noteRuns(doc, ytd).length).toBeGreaterThan(0)
  })

  it('wraps the full-year page subtitle, which carries the version label', () => {
    const doc: any = new MonthlyReportPDFService(budgetStoreReport(), {
      fullYearReport: fixtureFullYear({ forecastMonthly: 90_000, approvedMonthly: 95_000 }),
    }).generate()
    const page = pageContaining(doc, 'Full Year Projection')
    const runs = textRuns(doc, page)
    const subtitle = runs.find((r) => r.startsWith('Actuals through'))
    expect(subtitle).toBeTruthy()
    // Whatever it does with the label, it must not be one run wider than the
    // page: the label is coach-visible text of unbounded length.
    expect(subtitle!.length).toBeLessThan(200)
  })
})
