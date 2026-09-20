/**
 * The pack's two cashflow pages, rendered on Urban Road's August 2026 figures
 * and read back off the PDF, against Calxa's pages 22-25.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, textRuns } from './pdf-pack-fixture'
import { buildPackCashflowForecast, packCashflowBasisFor } from '@/lib/monthly-report/pack-cashflow'
import { buildPackCashflowRows } from '@/lib/monthly-report/pack-cashflow-rows'
import { urbanRoadFullYear, UR_EXPENSE_GROUP_ORDER } from '@/lib/monthly-report/__tests__/urban-road-full-year-fixture'
import type { FinancialForecast } from '@/app/finances/forecast/types'

/** The pages print only for a business with its cashflow section on (pack-cashflow-gate). */
const CASHFLOW_ON = () => ({ ...fixtureReport().settings.sections, cashflow: true })

const FY2027 = {
  id: 'f', business_id: 'b', user_id: 'u', name: 'FY2027', fiscal_year: 2027, year_type: 'FY',
  actual_start_month: '2026-07', actual_end_month: '2026-08', forecast_start_month: '2026-09', forecast_end_month: '2027-06',
} as FinancialForecast

function render() {
  const fullYear = urbanRoadFullYear()
  const cashflowForecast = buildPackCashflowForecast({
    fullYear, reportMonth: '2026-08', forecast: FY2027, forecastLines: [], savedAssumptions: null,
    opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' },
  })!
  const report = fixtureReport()
  report.settings = { ...report.settings, expense_group_order: UR_EXPENSE_GROUP_ORDER }
  const doc: any = new MonthlyReportPDFService(report, {
    cashflowForecast,
    cashflowBasis: packCashflowBasisFor(fullYear, '2026-08', cashflowForecast),
    businessName: 'Urban Road',
    sections: CASHFLOW_ON(),
  }).generate()
  const pages: string[][] = []
  // The content stream escapes parentheses; read them back as printed.
  for (let i = 1; i <= doc.getNumberOfPages(); i++) pages.push(textRuns(doc, i).map((r) => r.replace(/\\([()\\])/g, '$1')))
  return pages
}

/** The pages from the cashflow table's title to the chart's, table first in the legacy order. */
function cashflowPages() {
  const pages = render()
  const titled = pages.map((runs, i) => (runs.some((r) => r.startsWith('Cashflow Forecast')) ? i : -1)).filter((i) => i >= 0)
  expect(titled).toHaveLength(2)
  const [table, chart] = titled
  return { table: pages.slice(table, chart), chart: pages[chart] }
}

describe('Cashflow Forecast pages — Urban Road, August 2026', () => {
  it('fits the table on three landscape pages with a Total column and the header on each', () => {
    const { table } = cashflowPages()
    expect(table).toHaveLength(3)
    for (const runs of table) {
      expect(runs).toContain('Jul 2026')
      expect(runs).toContain('Total')
    }
    // No assumptions line above the table any more; the terms moved into the basis.
    expect(table.flat().some((r) => r.startsWith('DSO:'))).toBe(false)
  })

  it('never ends a page on a section heading or a group row whose accounts are overleaf', () => {
    const { table } = cashflowPages()
    const fullYear = urbanRoadFullYear()
    const cf = buildPackCashflowForecast({
      fullYear, reportMonth: '2026-08', forecast: FY2027, forecastLines: [], savedAssumptions: null,
      opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' },
    })!
    const rows = buildPackCashflowRows(cf, UR_EXPENSE_GROUP_ORDER)
    // A long label prints shortened with "...", as Calxa's does.
    const rowFor = (run: string) =>
      rows.find((r) => r.label === run || (run.endsWith('...') && r.label.startsWith(run.slice(0, -3))))
    for (const runs of table.slice(0, -1)) {
      const last = [...runs].reverse().map(rowFor).find((r) => r !== undefined)
      expect(last, 'a table page ends on a row').toBeDefined()
      expect(['heading', 'group'], `page ends on "${last!.label}"`).not.toContain(last!.kind)
    }
  })

  it("titles both pages with the FY period and uses Calxa's row labels", () => {
    const { table, chart } = cashflowPages()
    for (const runs of [table[0], chart]) expect(runs).toContain('JUL 2026 - JUN 2027')
    const all = table.flat()
    for (const label of ['Bank at Beginning', 'Cash Inflows from Operation', 'Cash Outflows from Operation', 'Expense', 'Other Inflows', 'Net Movement', 'Bank at End']) {
      expect(all).toContain(label)
    }
    expect(all).not.toContain('Cash Inflows from Operations')
    expect(all).not.toContain('Monthly Inflows vs Outflows with Bank Balance')
  })

  it('prints outflows bracketed, a credit unbracketed, zeros as 0 and the opening and closing in Total', () => {
    const all = cashflowPages().table.flat()
    // The cells a row prints, read straight after its label. A long label is
    // ellipsized to the column, as Calxa's is, so it is found by its start.
    const cellsOf = (label: string, n: number) => {
      const at = all.findIndex((r) => r === label || (r.endsWith('...') && label.startsWith(r.slice(0, -3))))
      expect(at, `row "${label}"`).toBeGreaterThanOrEqual(0)
      return all.slice(at + 1, at + 1 + n)
    }
    expect(cellsOf('Antons Canvas', 1)).toEqual(['(229,091)'])
    // A July and August credit, then September's payment.
    expect(cellsOf('Repairs & Maintenance Warehouse', 3)).toEqual(['543', '143', '(108)'])
    expect(cellsOf('Employment Expense', 1)).toEqual(['(47,421)'])
    // Paid in July only: eleven months of nothing, printed as noughts.
    expect(cellsOf('T/E - Trade Shows', 13)).toEqual(['(2,724)', ...Array(11).fill('0'), '(2,724)'])
    expect(all).not.toContain('-')
    expect(all).toContain('652,465') //    Bank at End, June and Total
    expect(all.filter((r) => r === '167,630').length).toBe(2) // Bank at Beginning, July and Total
  })

  it('prints a figure that could not be computed as a dash, never as a real 0', () => {
    const cashflowForecast = buildPackCashflowForecast({
      fullYear: urbanRoadFullYear(), reportMonth: '2026-08', forecast: FY2027, forecastLines: [], savedAssumptions: null,
      opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' },
    })!
    const service: any = new MonthlyReportPDFService(fixtureReport(), { cashflowForecast })
    expect(service.fmtCashflow(Number.NaN)).toBe('—')
    expect(service.fmtCashflow(Number.POSITIVE_INFINITY)).toBe('—')
    expect(service.fmtCashflow(0.4)).toBe('0')
    expect(service.fmtCashflow(-0.4)).toBe('0')
    expect(service.fmtCashflow(-1234.6)).toBe('(1,235)')
  })

  it('states the basis without calling the banked months cash actuals', () => {
    const all = cashflowPages().table.flat().join(' ')
    expect(all).toContain('Opening bank $167,630 at 30 Jun 2026')
    expect(all).toContain('Jul 2026 to Aug 2026 from the actual P&L, cash timing estimated')
    expect(all).not.toMatch(/\bActuals Jul/)
  })

  it("draws Calxa's nine-entry legend, a plain en-AU axis and the basis under the chart", () => {
    const { chart } = cashflowPages()
    const legend = ['Income', 'Cost of Sales', 'Expenses', 'Other Income', 'Other Expenses', 'Assets', 'Liabilities', 'Equities', 'Bank At End']
    const at = legend.map((label) => chart.indexOf(label))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(chart).toContain('800,000')
    expect(chart).toContain('-800,000')
    expect(chart.some((r) => r.includes('$800K'))).toBe(false)
    expect(chart.some((r) => r.includes('from the actual P&L, cash timing estimated'))).toBe(true)
  })

  it("widens the axis gutter for a figure wider than Calxa's, so no label prints into the margin", () => {
    const cf = buildPackCashflowForecast({
      fullYear: urbanRoadFullYear(), reportMonth: '2026-08', forecast: FY2027, forecastLines: [], savedAssumptions: null,
      opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' },
    })!
    const scaled = (v: unknown, by: number): unknown =>
      typeof v === 'number' ? v * by : Array.isArray(v) ? v.map((x) => scaled(x, by))
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scaled(x, by)])) : v

    /** The plot's left edge and the left-most point any right-aligned axis label reaches. */
    const measure = (by: number) => {
      const service: any = new MonthlyReportPDFService(fixtureReport(), {
        cashflowForecast: { ...cf, months: scaled(cf.months, by) } as typeof cf,
        businessName: 'Urban Road',
        sections: CASHFLOW_ON(),
      })
      const doc = service.doc
      const text = doc.text.bind(doc)
      const rect = doc.rect.bind(doc)
      const labels: { run: string; left: number }[] = []
      const plots: number[] = []
      doc.text = (run: unknown, x: number, y: number, opts?: { align?: string }) => {
        if (typeof run === 'string' && /^-?\d{1,3}(,\d{3})*$/.test(run) && opts?.align === 'right') {
          labels.push({ run, left: x - doc.getTextWidth(run) })
        }
        return text(run, x, y, opts)
      }
      doc.rect = (x: number, y: number, w: number, h: number, style?: string) => {
        if (h === 100 && style === 'S') plots.push(x)
        return rect(x, y, w, h, style)
      }
      service.generate()
      expect(plots, 'the chart page drew its plot').toHaveLength(1)
      return { plotLeft: plots[0], labels, margin: service.margin as number }
    }

    const insideMargin = (m: ReturnType<typeof measure>) => {
      for (const l of m.labels) expect(l.left, `"${l.run}" starts at ${l.left.toFixed(3)}mm`).toBeGreaterThanOrEqual(m.margin - 1e-9)
    }

    // Urban Road stays on Calxa's measurement: the plot starts 14.7mm in (its
    // "1,000,000" is 0.05mm wider than that allows, a hair nobody can see).
    const ur = measure(1)
    expect(ur.labels.map((l) => l.run)).toContain('-800,000')
    expect(ur.plotLeft - (ur.margin + 14.7)).toBeGreaterThanOrEqual(0)
    expect(ur.plotLeft - (ur.margin + 14.7)).toBeLessThan(0.1)
    insideMargin(ur)

    // Eight-figure swings: the gutter grows and every label stays off the margin.
    const big = measure(20)
    expect(big.labels.some((l) => l.run === '-15,000,000' || (l.run.startsWith('-') && l.run.length >= 11))).toBe(true)
    expect(big.plotLeft).toBeGreaterThan(big.margin + 14.7)
    insideMargin(big)
  })

  it('says in words when there is nothing to chart, rather than a legend over an empty page (JDS, April)', () => {
    const fullYear = urbanRoadFullYear()
    const cf = buildPackCashflowForecast({
      fullYear, reportMonth: '2026-08', forecast: FY2027, forecastLines: [], savedAssumptions: null,
      opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' },
    })!
    // Every figure $0: what a backdated report month over the current year's forecast produces.
    const zeroed = (v: unknown): unknown =>
      typeof v === 'number' ? 0 : Array.isArray(v) ? v.map(zeroed)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, zeroed(x)])) : v
    const cashflowForecast = { ...cf, months: zeroed(cf.months) } as typeof cf
    const doc: any = new MonthlyReportPDFService(fixtureReport(), {
      cashflowForecast,
      cashflowBasis: 'Opening bank balance unavailable — balances start from $0',
      businessName: 'Urban Road',
      sections: CASHFLOW_ON(),
    }).generate()
    const pages = Array.from({ length: doc.getNumberOfPages() }, (_, i) => textRuns(doc, i + 1).join(' '))
    const chart = pages.filter((p) => p.includes('Cashflow Forecast')).pop()!
    expect(chart).toContain('There is no cash movement to chart')
    expect(chart).toContain('Opening bank balance unavailable')
    expect(chart).not.toContain('Bank At End')
  })

  it('says so on the table page too, rather than three pages of noughts with no reason (JDS, April)', () => {
    const cf = buildPackCashflowForecast({
      fullYear: urbanRoadFullYear(), reportMonth: '2026-08', forecast: FY2027, forecastLines: [], savedAssumptions: null,
      opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' },
    })!
    const zeroed = (v: unknown): unknown =>
      typeof v === 'number' ? 0 : Array.isArray(v) ? v.map(zeroed)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, zeroed(x)])) : v
    const render = (months: unknown) => {
      const doc: any = new MonthlyReportPDFService(fixtureReport(), {
        cashflowForecast: { ...cf, months } as typeof cf,
        cashflowBasis: 'Opening bank balance unavailable — balances start from $0',
        businessName: 'Urban Road',
        sections: CASHFLOW_ON(),
      }).generate()
      const pages = Array.from({ length: doc.getNumberOfPages() }, (_, i) => textRuns(doc, i + 1))
      return pages.filter((runs) => runs.some((r) => r.startsWith('Cashflow Forecast')))
    }

    const [table, chart] = render(zeroed(cf.months))
    expect(chart, 'the chart page follows the table page directly').toBeDefined()
    const text = table.join(' ')
    expect(text).toContain('There is no cash movement')
    expect(text).toContain('Opening bank balance unavailable')
    // No table of noughts under the card.
    expect(table).not.toContain('Bank at Beginning')
    expect(table.filter((r) => r === '0')).toHaveLength(0)

    // One month that could not be computed is not "no movement": its dash is the reason.
    const oneUnknown = zeroed(cf.months) as typeof cf.months
    oneUnknown[3] = { ...oneUnknown[3], bank_at_end: Number.NaN }
    const withDash = render(oneUnknown)
    expect(withDash[0].join(' ')).not.toContain('There is no cash movement')
    expect(withDash[0]).toContain('Bank at Beginning')
    // And the chart says it cannot draw that month, rather than throwing on a NaN coordinate.
    expect(withDash[withDash.length - 1].join(' ')).toContain('some figures behind it could not be computed')
  })
})
