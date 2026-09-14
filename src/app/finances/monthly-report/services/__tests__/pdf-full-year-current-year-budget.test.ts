/**
 * The pack's Full Year page, rendered from Urban Road's real August 2026
 * report, read against Calxa's Current Year Budget pages 16-18.
 *
 * Calxa: a blank label column, "Jul 2026" … "Jun 2027", "Projected Total"; a
 * second header row marking which months are actuals; Income / Cost of Sales /
 * Gross Profit / Expense (each group one row carrying its subtotal) /
 * Operating Profit / Other Income / Net Profit; the unclosed months filled from
 * the approved budget. Ours was an eighteen-column variance report on the
 * wizard forecast.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, textRuns, pageContaining } from './pdf-pack-fixture'
import { urbanRoadFullYear, urbanRoadOnForecast } from '../../utils/__tests__/fixtures/urban-road-fy'
import type { FullYearReport } from '../../types'
import type { PDFLayout } from '../../types/pdf-layout'

function render(fy: FullYearReport, opts: { heading?: string; layout?: PDFLayout; budgetStore?: boolean } = {}) {
  const report = fixtureReport(opts.budgetStore ? { budget_source: 'budget_version' } : {})
  report.settings = { ...report.settings, expense_group_order: fy.expense_group_order ?? null }
  const doc: any = new MonthlyReportPDFService(report, {
    fullYearReport: fy,
    businessName: 'Urban Road Pty Ltd',
    pdfLayout: opts.layout ?? null,
  }).generate()
  const heading = opts.heading ?? 'Current Year Budget'
  const first = pageContaining(doc, heading)
  expect(first, `"${heading}" page exists`).toBeGreaterThan(0)
  // The table runs over several pages; each continuation repeats the header,
  // so the pages are the run of pages whose text carries "Projected".
  const pages: string[][] = []
  for (let p = first; p <= doc.internal.getNumberOfPages(); p++) {
    // PDF string escapes undone, so "(5,559)" and "Var ($)" read as printed.
    const runs = textRuns(doc, p).map((r) => r.replace(/\\([()\\])/g, '$1'))
    if (!runs.includes('Projected')) break
    pages.push(runs)
  }
  return { doc, first, pages, runs: pages.flat() }
}

/** The twelve months and the Projected Total printed after a row label. */
const rowAfter = (runs: string[], label: string, from = 0) => {
  const i = runs.indexOf(label, from)
  expect(i, `"${label}" is printed`).toBeGreaterThanOrEqual(0)
  return runs.slice(i + 1, i + 14)
}

describe('Current Year Budget page — Urban Road, August 2026', () => {
  it('is titled as Calxa titles it, with the period from the months', () => {
    const { runs } = render(urbanRoadFullYear())
    // The em dash is outside jsPDF's WinAnsi run text, so the title is matched by its ends.
    expect(runs.some((r) => r.startsWith('Current Year Budget') && r.endsWith('Urban Road Pty Ltd'))).toBe(true)
    expect(runs).toContain('JUL 2026 - JUN 2027')
    expect(runs.some((r) => r.startsWith('Actuals through'))).toBe(false)
  })

  it("prints Calxa's column set and nothing else", () => {
    const { pages } = render(urbanRoadFullYear())
    const header = pages[0]
    const months = ['Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026',
      'Jan 2027', 'Feb 2027', 'Mar 2027', 'Apr 2027', 'May 2027', 'Jun 2027']
    const at = header.indexOf('Jul 2026')
    expect(header.slice(at, at + 14)).toEqual([...months, 'Projected', 'Total'])
    // The second tier: two closed months, then ten budget months.
    expect(header.slice(at + 14, at + 26)).toEqual([...Array(2).fill('Actuals'), ...Array(10).fill('Budget')])
    for (const gone of ['Account', 'Forecast', 'Approved Budget', 'Var vs Fcst ($)', 'Var vs Fcst (%)', 'Sept']) {
      expect(header).not.toContain(gone)
    }
  })

  it('repeats the header on every page the table runs to', () => {
    const { pages } = render(urbanRoadFullYear())
    expect(pages.length).toBeGreaterThanOrEqual(2)
    for (const p of pages) expect(p.filter((r) => r === 'Projected')).toHaveLength(1)
  })

  it('fills the unclosed months from the approved budget', () => {
    const { runs } = render(urbanRoadFullYear())
    expect(rowAfter(runs, 'Employ - Wages & Salaries')).toEqual([
      '42,015', '52,519', '42,015', '42,015', '52,519', '42,015', '44,788', '44,788', '55,986', '44,788', '55,986', '44,788', '564,223',
    ])
    expect(rowAfter(runs, 'Contractors excl. Artists').slice(-1)).toEqual(['358,562'])
  })

  it('puts each group subtotal on its heading row, with no Total <group> row', () => {
    const { runs } = render(urbanRoadFullYear())
    expect(rowAfter(runs, 'Employment Expense')).toEqual([
      '47,394', '60,271', '48,626', '48,626', '60,390', '48,626', '51,732', '51,732', '64,273', '51,732', '64,273', '51,732', '649,407',
    ])
    expect(runs).not.toContain('Total Employment Expense')
    expect(runs.indexOf('Employment Expense')).toBeLessThan(runs.indexOf('Employ - Staff Amenities'))
  })

  it("uses the pack's section names and prints Operating Profit", () => {
    const { runs } = render(urbanRoadFullYear())
    const order = ['Income', 'Total Income', 'Cost of Sales', 'Total Cost of Sales', 'Gross Profit',
      'Expense', 'Total Expense', 'Operating Profit', 'Other Income', 'Total Other Income', 'Net Profit']
    const idx = order.map((t) => runs.indexOf(t))
    expect(idx.every((i) => i >= 0)).toBe(true)
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
    expect(runs).not.toContain('Revenue')
    expect(runs).not.toContain('Total Operating Expenses')
    expect(rowAfter(runs, 'Total Expense')).toEqual([
      '163,596', '162,235', '155,047', '162,392', '182,656', '154,692', '158,660', '152,660', '167,808', '158,315', '167,389', '164,848', '1,950,297',
    ])
    expect(rowAfter(runs, 'Operating Profit')).toEqual([
      '14,009', '132,590', '15,256', '16,311', '140,492', '15,611', '20,043', '33,383', '19,049', '29,438', '6,350', '77,450', '519,983',
    ])
    expect(rowAfter(runs, 'Net Profit').slice(-1)).toEqual(['520,152'])
  })

  it('prints no row for the forecast-only "Other Income" line under Income', () => {
    const { runs } = render(urbanRoadFullYear())
    const income = runs.slice(runs.indexOf('Income'), runs.indexOf('Total Income'))
    expect(income).not.toContain('Other Income')
    // The real Other Income section is still there, with its one account.
    expect(rowAfter(runs, 'Bank Interest Income').slice(-1)).toEqual(['169'])
  })

  it('prints negatives in red parentheses', () => {
    const { doc, first } = render(urbanRoadFullYear())
    const ops = (doc.internal.pages[first] as string[]).join('\n').split('\n')
    const at = ops.findIndex((op) => op.trim() === '((5,559)) Tj' || op.trim() === '(\\(5,559\\)) Tj')
    expect(at).toBeGreaterThan(0)
    // jsPDF sets the text colour inside the BT block just before the run.
    const colour = ops.slice(Math.max(0, at - 6), at).reverse().find((op) => /\s(rg|g)$/.test(op.trim()))
    // Pure red — Calxa's content stream sets every negative in 1 0 0.
    expect(colour?.trim()).toMatch(/^1\.? 0\.? 0\.? rg$/)
  })
})

describe('Full Year page — a client on the forecast', () => {
  it('keeps the forecast, under the name that is true of it', () => {
    const { runs } = render(urbanRoadOnForecast(), { heading: 'Full Year Projection' })
    expect(runs.some((r) => r.startsWith('Current Year Budget'))).toBe(false)
    expect(runs).toContain('Forecast')
    expect(rowAfter(runs, 'Employ - Wages & Salaries')[2]).toBe('76,182')
    expect(runs.some((r) => r.startsWith('No approved budget is in force'))).toBe(false)
  })

  it('says so when the client is on the budget store but no version resolved', () => {
    const { runs } = render(urbanRoadOnForecast(), { heading: 'Full Year Projection', budgetStore: true })
    expect(runs.some((r) => r.startsWith('No approved budget is in force for FY2027'))).toBe(true)
  })
})

describe('Full Year page — show_variance placement config', () => {
  const layout = (config: Record<string, unknown>): PDFLayout => ({
    version: 1,
    pages: [
      { id: 'p1', orientation: 'portrait', widgets: [{ id: 'es', type: 'executive_summary', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
      { id: 'p2', orientation: 'landscape', widgets: [{ id: 'fy', type: 'full_year_projection', col: 0, row: 0, colSpan: 3, rowSpan: 3, config }] },
    ],
  })

  it('adds the yardstick and variance, measured against the approved budget', () => {
    const { pages } = render(urbanRoadFullYear(), { layout: layout({ show_variance: true }) })
    const header = pages[0]
    const at = header.indexOf('Total')
    expect(header.slice(at + 1, at + 4)).toEqual(['Budget', 'Var ($)', 'Var (%)'])
  })

  it('is off by default', () => {
    const { pages } = render(urbanRoadFullYear(), { layout: layout({}) })
    expect(pages[0]).toContain('Projected')
    expect(pages[0]).not.toContain('Var ($)')
  })
})

describe('Full Year page — the note under the title', () => {
  const noForecast = (fy: FullYearReport): FullYearReport => ({ ...fy, forecast_available: false })
  /** The page's text as one string — a wrapped note is several runs. */
  const text = (runs: string[]) => runs.join(' ')

  it('says nothing about a missing forecast when the approved budget fills the months', () => {
    // Distinct Directions today: a locked FY2027 version, its only forecast inactive.
    const { runs } = render(noForecast(urbanRoadFullYear()), { budgetStore: true })
    expect(text(runs)).not.toContain('Projected is actuals to date')
    expect(text(runs)).not.toContain('No forecast exists')
    expect(rowAfter(runs, 'Employ - Wages & Salaries').slice(2, 4)).toEqual(['42,015', '42,015'])
    expect(rowAfter(runs, 'Employ - Wages & Salaries').slice(-1)).toEqual(['564,223'])
  })

  it('prints one sentence, not two that contradict, when the store has no version and there is no forecast', () => {
    const { runs } = render(noForecast(urbanRoadOnForecast()), { heading: 'Full Year Projection', budgetStore: true })
    expect(text(runs)).toContain('No approved budget is in force for FY2027 and no forecast exists')
    expect(text(runs)).not.toContain('are the forecast, not the budget')
    expect(runs.filter((r) => r.startsWith('No '))).toHaveLength(1)
  })

  it('keeps the forecast, and says why, when the approved budget does not reach every month', () => {
    // A six-month version: January to June have no budget rows at all.
    const fy: FullYearReport = {
      ...urbanRoadFullYear(),
      approved_months_covered: ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'],
    }
    const { runs } = render(fy, { heading: 'Full Year Projection', budgetStore: true })
    expect(runs.some((r) => r.startsWith('Current Year Budget'))).toBe(false)
    expect(text(runs)).toContain('does not cover 6 of the months after Aug 2026, from Jan 2027')
    // The forecast, never a $0 "Budget" for a month the version does not mention.
    expect(rowAfter(runs, 'Employ - Wages & Salaries')[6]).toBe('76,182')
  })
})

describe('Full Year page — defaults for a client on the forecast', () => {
  it('keeps the yardstick and variance columns in the legacy flow, which has no placement config', () => {
    const { pages } = render(urbanRoadOnForecast(), { heading: 'Full Year Projection' })
    const header = pages[0]
    const at = header.indexOf('Total')
    expect(header.slice(at + 1, at + 4)).toEqual(['Forecast', 'Var ($)', 'Var (%)'])
  })

  it('prints no Operating Profit when nothing sits between it and Net Profit', () => {
    const fy = urbanRoadOnForecast()
    fy.sections = fy.sections.filter((s) => s.category !== 'Other Income')
    const { runs } = render(fy, { heading: 'Full Year Projection' })
    expect(runs).not.toContain('Operating Profit')
    expect(runs).toContain('Net Profit')
  })
})

describe('Full Year page — the page break', () => {
  it('carries accounts onto the last page with the closing rows, as Calxa page 18 does', () => {
    const { pages } = render(urbanRoadFullYear())
    const last = pages[pages.length - 1]
    // Not Operating Profit at the top of a page, a page away from the total it sums.
    for (const t of ['Training & Seminars', 'Total Expense', 'Operating Profit', 'Net Profit']) expect(last).toContain(t)
    expect(last.indexOf('Training & Seminars')).toBeLessThan(last.indexOf('Total Expense'))
    // Every row still printed exactly once across the run.
    expect(pages.flat().filter((r) => r === 'Total Expense')).toHaveLength(1)
    expect(pages.flat().filter((r) => r === 'Employ - Wages & Salaries')).toHaveLength(1)
  })
})

describe('Full Year page — standing commentary', () => {
  it('knows the page by the name the client reads it under', () => {
    const report = fixtureReport({ budget_source: 'budget_version' })
    report.settings.standing_commentary = [{ label: 'The year', refer_to: 'Current Year Budget' }]
    const doc: any = new MonthlyReportPDFService(report, { fullYearReport: urbanRoadFullYear() }).generate()
    const all = Array.from({ length: doc.internal.getNumberOfPages() }, (_, i) => textRuns(doc, i + 1)).flat().join(' ')
    expect(all).toContain('Refer to Current Year Budget')
    expect(all).not.toContain('page not in this pack')
  })
})
