/**
 * What the DEFAULT page order contains — the one that runs whenever
 * pdf_layout is null, which is every client today.
 *
 * The balance-sheet pages existed and were unreachable: only renderBalanceSheet
 * called them, and that runs solely from generateFromLayout. Meanwhile the
 * export path fired two live Xero balance-sheet round-trips the moment
 * sections.balance_sheet was on, so Urban Road, Just Digital Signage and
 * Precision paid for the fetches and got no pages.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, fixtureFullYear, fixtureBalanceSheet, docText, pageContaining } from './pdf-pack-fixture'
import { DEFAULT_SECTIONS } from '../../types'

const sectionsWithBalanceSheet = () => ({
  ...fixtureReport().settings.sections,
  balance_sheet: true,
})

describe('the balance-sheet pages are in the default page order', () => {
  it('prints both comparisons when the section is on', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      sections: sectionsWithBalanceSheet(),
      balanceSheets: {
        mom: { data: fixtureBalanceSheet() },
        yoy: { data: fixtureBalanceSheet({ compare: 'yoy', prior_label: 'Aug 2025' }) },
      },
    })
    const text = docText(svc.generate())
    expect(text).toContain('Balance Sheet vs Prior Month')
    expect(text).toContain('Balance Sheet vs Same Month Last Year')
  })

  it('does not print them when the section is off', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      sections: fixtureReport().settings.sections,
      balanceSheets: { mom: { data: fixtureBalanceSheet() } },
    })
    const text = docText(svc.generate())
    expect(text).not.toContain('Balance Sheet vs Prior Month')
  })

  it('puts them after the full-year projection, where the Calxa pack has them', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      sections: sectionsWithBalanceSheet(),
      fullYearReport: fixtureFullYear({ forecastMonthly: 90_000 }),
      balanceSheets: {
        mom: { data: fixtureBalanceSheet() },
        yoy: { data: fixtureBalanceSheet({ compare: 'yoy' }) },
      },
    })
    const doc = svc.generate()
    const fullYear = pageContaining(doc, 'Full Year Projection')
    const mom = pageContaining(doc, 'Balance Sheet vs Prior Month')
    const yoy = pageContaining(doc, 'Balance Sheet vs Same Month Last Year')
    expect(fullYear).toBeGreaterThan(0)
    expect(mom).toBeGreaterThan(fullYear)
    expect(yoy).toBeGreaterThan(mom)
  })

  it('still prints the page, saying why, when the sheet did not load', () => {
    // Three states: the pack must not silently lose a page its settings say is
    // on just because Xero would not answer.
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      sections: sectionsWithBalanceSheet(),
      balanceSheets: { mom: { data: null, reason: 'Xero returned 503' }, yoy: { data: null, reason: 'Xero returned 503' } },
    })
    const text = docText(svc.generate())
    expect(text).toContain('Balance Sheet vs Prior Month')
    expect(text).toContain('Xero returned 503')
  })

  it('a saved layout still decides its own order — the default flow is not consulted', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      sections: sectionsWithBalanceSheet(),
      balanceSheets: { mom: { data: fixtureBalanceSheet() }, yoy: { data: fixtureBalanceSheet() } },
      pdfLayout: {
        version: 1,
        pages: [
          {
            id: 'p1',
            orientation: 'portrait',
            widgets: [{ id: 'w1', type: 'executive_summary', col: 0, row: 0, colSpan: 3, rowSpan: 3 }],
          },
        ],
      },
    })
    const text = docText(svc.generate())
    // The layout places no balance sheet, so the pack has none — the coach's
    // deletion survives, which is the whole point of a saved layout.
    expect(text).not.toContain('Balance Sheet vs Prior Month')
  })
})

describe('DEFAULT_SECTIONS is the shape the default flow reads', () => {
  it('carries balance_sheet as a key, so the gate is a real flag', () => {
    expect(Object.prototype.hasOwnProperty.call(DEFAULT_SECTIONS, 'balance_sheet')).toBe(true)
  })
})
