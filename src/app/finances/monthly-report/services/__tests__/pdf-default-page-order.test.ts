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
import { fixtureReport, fixtureFullYear, fixtureBalanceSheet, pageContaining } from './pdf-pack-fixture'
import { DEFAULT_SECTIONS } from '../../types'

/**
 * The balance-sheet pages, by their title run. Both comparisons carry the same
 * title since the Calxa header ("Balance Sheet — <client>" over the month) —
 * the comparison lives in the column band — so a page is identified by the
 * title and told apart by the band's period label.
 */
function balanceSheetPages(doc: any): string[] {
  const out: string[] = []
  for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
    const page = doc.internal.pages[i]
    const text = Array.isArray(page) ? page.join('\n') : ''
    if (text.includes('(Balance Sheet')) out.push(text)
  }
  return out
}

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
    const pages = balanceSheetPages(svc.generate())
    expect(pages).toHaveLength(2)
    expect(pages[0]).toContain('(Jul 2026)')
    expect(pages[1]).toContain('(Aug 2025)')
  })

  it('does not print them when the section is off', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      sections: fixtureReport().settings.sections,
      balanceSheets: { mom: { data: fixtureBalanceSheet() } },
    })
    expect(balanceSheetPages(svc.generate())).toHaveLength(0)
  })

  it('puts them after the full-year projection, where the Calxa pack has them', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      sections: sectionsWithBalanceSheet(),
      fullYearReport: fixtureFullYear({ forecastMonthly: 90_000 }),
      balanceSheets: {
        mom: { data: fixtureBalanceSheet() },
        yoy: { data: fixtureBalanceSheet({ compare: 'yoy', prior_label: 'Aug 2025' }) },
      },
    })
    const doc = svc.generate()
    const fullYear = pageContaining(doc, 'Full Year Projection')
    const mom = pageContaining(doc, '(Balance Sheet')
    const yoy = pageContaining(doc, '(Aug 2025)')
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
    const pages = balanceSheetPages(svc.generate())
    expect(pages).toHaveLength(2)
    for (const page of pages) expect(page).toContain('Xero returned 503')
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
    // The layout places no balance sheet, so the pack has none — the coach's
    // deletion survives, which is the whole point of a saved layout.
    expect(balanceSheetPages(svc.generate())).toHaveLength(0)
  })
})

describe('DEFAULT_SECTIONS is the shape the default flow reads', () => {
  it('carries balance_sheet as a key, so the gate is a real flag', () => {
    expect(Object.prototype.hasOwnProperty.call(DEFAULT_SECTIONS, 'balance_sheet')).toBe(true)
  })
})
