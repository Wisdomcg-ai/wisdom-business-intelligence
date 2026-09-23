/**
 * The insert pages — Subscriptions, Contractors, Payroll — rendered through the
 * real layout pipeline.
 *
 * Two things are proved here. The subscriptions sheet's 'calxa' layout reaches
 * the paper with Urban Road's rows and one TOTAL, while a placement with no
 * config still prints the page every other client has. And a placed contractor
 * or payroll page with nothing to draw either says why or is not in the pack:
 * the August 2026 render had a page 9 that was blank but for the logo and the
 * page number, because hasDataForWidget had no case for either widget and its
 * default kept a page the renderer then left empty.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, docText, pageContaining, textRuns } from './pdf-pack-fixture'
import type { PDFLayout, WidgetType } from '../../types/pdf-layout'
import { detail, LABELS } from '@/lib/monthly-report/__tests__/urban-road-subscriptions-fixture'
import { contractorDetail } from '@/lib/monthly-report/__tests__/urban-road-contractors-fixture'
import { rollUpContractors } from '@/lib/monthly-report/contractor-rollup'

function layout(type: WidgetType, config?: Record<string, unknown>, orientation: 'portrait' | 'landscape' = 'portrait'): PDFLayout {
  return {
    version: 1,
    pages: [
      { id: 'p1', orientation: 'portrait', widgets: [{ id: 'es', type: 'executive_summary', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
      { id: 'p2', orientation, widgets: [{ id: 'insert', type, col: 0, row: 0, colSpan: 2, rowSpan: 3, ...(config ? { config } : {}) }] },
    ],
  }
}

type Options = ConstructorParameters<typeof MonthlyReportPDFService>[1]
const render = (pdfLayout: PDFLayout, options: Options = {}) =>
  new MonthlyReportPDFService(fixtureReport(), { pdfLayout, ...options }).generate() as any

/** How many images a page draws (the corner mark is the only one on these pages). */
const images = (doc: any, page: number) =>
  doc.internal.pages[page].join('\n').split('\n').filter((op: string) => / Do$/.test(op.trim())).length

// jsPDF writes a fill as two-decimal fractions: (183, 225, 205) and (244, 199, 195).
const GREEN_FILL = '0.72 0.88 0.8 rg'
const RED_FILL = '0.96 0.78 0.76 rg'

describe('the subscriptions sheet (layout: calxa) — Urban Road, August 2026', () => {
  const doc = () => render(layout('subscription_detail', { layout: 'calxa', labels: LABELS }), { subscriptionDetail: detail() })

  it('is headed by its account, with the sheet\'s columns', () => {
    const d = doc()
    expect(pageContaining(d, 'IT Costs Software')).toBe(2)
    const runs = textRuns(d, 2)
    for (const heading of ['Name', 'Last Month', 'Budget', 'Aug-26', 'Variance']) expect(runs).toContain(heading)
    expect(runs.join(' ')).not.toContain('Subscription Analysis')
  })

  it('prints the vendors, Unallocated and ONE total — the P&L actual against the approved budget', () => {
    // textRuns reads the stream, where a bracket is escaped.
    const runs = textRuns(doc(), 2).map((r) => r.replace(/\\([()])/g, '$1'))
    expect(runs).toContain('Claude')
    // Bill CL007500 under the placement's label for its key, as Calxa prints it — not the
    // retailer its description mentions.
    expect(runs).toContain('Edi Cloud')
    expect(runs).not.toContain('Harvey Norman')
    expect(runs).not.toContain('Loom')
    const at = runs.indexOf('Unallocated')
    expect(runs.slice(at, at + 5)).toEqual(['Unallocated', '(1)', '101', '0', '101'])
    const total = runs.indexOf('TOTAL')
    expect(runs.slice(total, total + 5)).toEqual(['TOTAL', '13,764', '13,697', '14,726', '(1,029)'])
    expect(runs.filter((r) => r === 'TOTAL')).toHaveLength(1)
    expect(runs.join(' ')).not.toMatch(/Grand Total|Subtotal/)
    expect(runs.join(' ')).not.toContain('$')
  })

  it('fills the variance cells green and red, as the sheet does', () => {
    const text = docText(doc())
    expect(text).toContain(GREEN_FILL)
    expect(text).toContain(RED_FILL)
  })
})

describe('a subscriptions page whose approved budget is not in force', () => {
  const none = () => {
    const d = detail()
    Object.assign(d.accounts[0], { total_budget: 0, total_variance: -14725.73, total_budget_source: 'none', total_budget_absent: 'no approved budget version is locked for FY2027' })
    d.grand_total = { prior_month: 13764.27, actual: 14725.73, budget: 0, variance: -14725.73 }
    return d
  }
  // The stream escapes brackets and writes an em dash as WinAnsi 0x97.
  const unescape = (runs: string[]) => runs.map((r) => r.replace(/\\([()])/g, '$1').replace(/\u0097/g, '—'))

  it('calxa: the TOTAL prints a dash for budget and variance, and the reason under the table', () => {
    const d = render(layout('subscription_detail', { layout: 'calxa', labels: LABELS }), { subscriptionDetail: none() })
    const runs = unescape(textRuns(d, 2))
    const total = runs.indexOf('TOTAL')
    expect(runs.slice(total, total + 5)).toEqual(['TOTAL', '13,764', '—', '14,726', '—'])
    expect(runs.join(' ')).toContain('no approved budget version is locked for FY2027')
  })

  it('the standard layout, asked for the approved budget: the Subtotal and Grand Total print a dash, and the same reason', () => {
    const d = render(layout('subscription_detail', { total_budget: 'approved' }), { subscriptionDetail: none() })
    const runs = unescape(textRuns(d, 2))
    const sub = runs.indexOf('Subtotal — IT Costs Software')
    expect(runs.slice(sub, sub + 5)).toEqual(['Subtotal — IT Costs Software', '13,764', '—', '14,726', '—'])
    const gt = runs.indexOf('Grand Total')
    expect(runs.slice(gt, gt + 5)).toEqual(['Grand Total', '13,764', '—', '14,726', '—'])
    expect(runs.join(' ')).toContain('no approved budget version is locked for FY2027')
  })

  it('the standard layout with no config prints the vendor budgets it printed before the store, and no reason', () => {
    const runs = unescape(textRuns(render(layout('subscription_detail'), { subscriptionDetail: none() }), 2))
    const sub = runs.indexOf('Subtotal — IT Costs Software')
    expect(runs.slice(sub, sub + 5)).toEqual(['Subtotal — IT Costs Software', '13,764', '13,596', '14,726', '(1,130)'])
    expect(runs.join(' ')).not.toContain('no approved budget')
  })
})

describe('the subscriptions page with no config', () => {
  // The stream escapes brackets and writes an em dash as WinAnsi 0x97.
  const unescape = (runs: string[]) => runs.map((r) => r.replace(/\\([()])/g, '$1').replace(/\u0097/g, '—'))
  const row = (runs: string[], label: string) => runs.slice(runs.indexOf(label), runs.indexOf(label) + 5)

  it('prints the gross document amounts, as it always has — GST-inclusive bills are not restated net against gross vendor budgets', () => {
    const runs = unescape(textRuns(render(layout('subscription_detail'), { subscriptionDetail: detail() }), 2))
    // Adobe billed $453.20 inclusive against Step 6's gross-basis $389: (64), not the (23) its net $412 would show.
    expect(row(runs, 'Adobe')).toEqual(['Adobe', '663', '389', '453', '(64)'])
    expect(row(runs, 'Anthropic')).toEqual(['Anthropic', '426', '350', '644', '(294)'])
    // Bill CL007500 at its $1,125, under the name every other reader gives it.
    expect(row(runs, 'Harvey Norman *')).toEqual(['Harvey Norman *', '—', '—', '1,125', '—'])
    expect(runs).not.toContain('Edi Cloud')
    // A budget-store client's Subtotal and Grand Total are the budget the page printed before the store — here the
    // vendor budgets above them — not the approved $13,697 the rows do not add to.
    expect(row(runs, 'Subtotal — IT Costs Software')).toEqual(['Subtotal — IT Costs Software', '13,764', '13,596', '14,726', '(1,130)'])
    expect(row(runs, 'Grand Total')).toEqual(['Grand Total', '13,764', '13,596', '14,726', '(1,130)'])
    expect(runs.join(' ')).not.toContain('gross amounts')
  })

  it('total_budget: approved, set explicitly, prints the approved budget on the standard page', () => {
    const runs = unescape(textRuns(render(layout('subscription_detail', { total_budget: 'approved' }), { subscriptionDetail: detail() }), 2))
    expect(row(runs, 'Subtotal — IT Costs Software')).toEqual(['Subtotal — IT Costs Software', '13,764', '13,697', '14,726', '(1,029)'])
    expect(row(runs, 'Grand Total')).toEqual(['Grand Total', '13,764', '13,697', '14,726', '(1,029)'])
    expect(runs.join(' ')).not.toContain('settings could not be read')
  })

  it('basis: net, set explicitly, prints the statement figures on the standard page', () => {
    const runs = unescape(textRuns(render(layout('subscription_detail', { basis: 'net' }), { subscriptionDetail: detail() }), 2))
    expect(row(runs, 'Adobe')).toEqual(['Adobe', '603', '389', '412', '(23)'])
    expect(row(runs, 'Harvey Norman *')).toEqual(['Harvey Norman *', '—', '—', '1,023', '—'])
    expect(runs).toContain('Grand Total')
  })

  it('is the page every other client has: account band, Subtotal, Grand Total', () => {
    const d = render(layout('subscription_detail'), { subscriptionDetail: detail() })
    const text = textRuns(d, 2).join(' ')
    expect(text).toContain('Subscription Analysis')
    expect(text).toContain('Subtotal')
    expect(text).toContain('Grand Total')
    expect(text).not.toContain('Unallocated')
    expect(text).not.toContain('Aug-26')
  })

  it('a config it cannot read prints the standard page and says why', () => {
    const d = render(layout('subscription_detail', { layout: 'sheet' }), { subscriptionDetail: detail() })
    const text = docText(d)
    expect(text).toContain('Grand Total')
    expect(text).toContain('settings could not be read')
  })
})

describe('a placed Contractor Analysis page with no rows', () => {
  it('is not in the pack when nothing was asked for', () => {
    const d = render(layout('contractor_detail'))
    expect(d.internal.getNumberOfPages()).toBe(1)
  })

  it('prints the reason when the load failed or found nothing', () => {
    const d = render(layout('contractor_detail'), { contractorDetailReason: 'the contractor figures could not be loaded from Xero' })
    expect(d.internal.getNumberOfPages()).toBe(2)
    expect(pageContaining(d, 'Contractor Analysis')).toBe(2)
    expect(docText(d)).toContain('Contractor Analysis is not available for this month: the contractor figures could not be loaded from Xero.')
  })

  it('rows from a partial crawl print, with what was not read above them', () => {
    const rows = {
      contractors: [{ vendor_name: 'Reena Rosales', vendor_key: 'reenarosales', category: 'Operations', prior_month_actual: 2000, actual: 1600, budget: 1760, variance: 160 }],
      categories: [],
      grand_total: { prior_month: 2000, budget: 1760, actual: 1600, variance: 160 },
    }
    const d = render(layout('contractor_detail'), {
      contractorDetail: rows,
      contractorDetailReason: 'the contractor figures could not be fully read from Xero (Xero could not be read for Urban Road Pty Ltd)',
    })
    const text = textRuns(d, 2).join(' ')
    expect(text).toContain('Reena Rosales')
    expect(text).toContain('These figures may be incomplete')
    expect(text).toContain('Xero could not be read for Urban Road Pty Ltd')
  })

  it('an empty rollup with no reason is dropped, not printed blank', () => {
    const d = render(layout('contractor_detail'), {
      contractorDetail: { contractors: [], categories: [], grand_total: { prior_month: 0, budget: 0, actual: 0, variance: 0 } },
    })
    expect(d.internal.getNumberOfPages()).toBe(1)
  })
})

describe('the Contractors Payment Summary (contractor_detail, layout: calxa) — Urban Road, August 2026', () => {
  const rolled = () => rollUpContractors(contractorDetail())
  const doc = (orientation: 'portrait' | 'landscape' = 'landscape', options: Options = {}) =>
    render(layout('contractor_detail', { layout: 'calxa' }, orientation), { contractorDetail: rolled(), contractorDetailReport: contractorDetail(), ...options })
  // The stream escapes brackets and writes an em dash as WinAnsi 0x97; a blank
  // cell draws an empty run, and the figures are what is compared.
  const runsOf = (d: any) => textRuns(d, 2).map((r) => r.replace(/\\([()])/g, '$1').replace(//g, '—')).filter((r) => r !== '')

  it('is one landscape page with both tables side by side and Calxa\'s headings', () => {
    const d = doc()
    expect(d.internal.getNumberOfPages()).toBe(2)
    expect(d.internal.pageSize.getWidth()).toBeGreaterThan(d.internal.pageSize.getHeight())
    const runs = runsOf(d)
    expect(runs.join(' ')).toContain('Contractors Payment Summary')
    for (const heading of ['Name of Contractor', 'Category', 'Budget', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'August 2026', 'Variance']) expect(runs).toContain(heading)
    expect(runs.join(' ')).not.toContain('Contractor Analysis')
  })

  it('foots TOTAL to the ledger, the Budget row under its own month, and the variance signed', () => {
    const runs = runsOf(doc())
    const total = runs.indexOf('TOTAL')
    expect(runs.slice(total, total + 5)).toEqual(['TOTAL', '30,081', '23,173', '29,911', '31,029'])
    const budget = runs.indexOf('Budget', total)
    expect(runs.slice(budget, budget + 4)).toEqual(['Budget', '—', '28,007', '28,375'])
    const variance = runs.indexOf('Variance $')
    expect(runs.slice(variance, variance + 4)).toEqual(['Variance $', '—', '(1,904)', '(2,654)'])
    const percent = runs.indexOf('Variance %')
    expect(runs.slice(percent, percent + 4)).toEqual(['Variance %', '—', '(6.80%)', '(9.35%)'])
    expect(runs.join(' ')).toContain('June 2026 has no budget: no approved budget version is locked for FY2026.')
    // No dollar sign on a figure (decision #10); "Variance $" is the sheet's row label.
    expect(runs.filter((r) => /\$\s*\d/.test(r))).toEqual([])
  })

  it('rolls August up by department with each subtotal\'s variance, and a Grand Total', () => {
    const runs = runsOf(doc())
    const creative = runs.indexOf('Creative/Product Total')
    expect(runs.slice(creative, creative + 4)).toEqual(['Creative/Product Total', '4,872', '7,819', '(2,947)'])
    const uncategorised = runs.indexOf('Uncategorised Total')
    expect(runs.slice(uncategorised, uncategorised + 4)).toEqual(['Uncategorised Total', '1,320', '1,793', '(473)'])
    const grand = runs.indexOf('Grand Total')
    expect(runs.slice(grand, grand + 4)).toEqual(['Grand Total', '30,081', '31,029', '(948)'])
    const text = docText(doc())
    expect(text).toContain(GREEN_FILL)
    expect(text).toContain(RED_FILL)
  })

  it('stacks the two tables on a portrait placement rather than squeeze them', () => {
    const d = doc('portrait')
    const runs = textRuns(d, 2).concat(d.internal.getNumberOfPages() > 2 ? textRuns(d, 3) : [])
    expect(runs).toContain('TOTAL')
    expect(runs).toContain('Grand Total')
  })

  describe('a roster that runs over the page', () => {
    // n contractors in `departments` departments, every one Akshay's figures.
    const roster = (n: number, departments: number) => {
      const d = contractorDetail()
      const akshay = d.accounts[0].vendors.find((v) => v.vendor_key === 'akshaynirmalproprietorship')!
      d.accounts[0].vendors = Array.from({ length: n }, (_, i) => ({
        ...akshay, vendor_name: `Contractor ${String(i).padStart(2, '0')}`, vendor_key: `contractor${i}`, category: `Department ${i % departments}`,
      }))
      return d
    }
    const long = (n: number, departments: number, orientation: 'portrait' | 'landscape' = 'landscape') => {
      const d = roster(n, departments)
      return render(layout('contractor_detail', { layout: 'calxa' }, orientation), { contractorDetail: rollUpContractors(d), contractorDetailReport: d })
    }
    const pagesWith = (d: any, run: string) => {
      const pages: number[] = []
      for (let p = 1; p <= d.internal.getNumberOfPages(); p++) if (textRuns(d, p).includes(run)) pages.push(p)
      return pages
    }

    it('continues both tables on the same next page, each on its own side, and ends the notes there', () => {
      const d = long(40, 3)
      expect(d.internal.getNumberOfPages()).toBe(3)
      expect(d.getPageWidth(3)).toBeGreaterThan(d.getPageHeight(3))
      // The heading repeats on the page the tables run onto, and no further.
      expect(pagesWith(d, 'Name of Contractor')).toEqual([2, 3])
      expect(pagesWith(d, 'Variance %')).toEqual([3])
      expect(pagesWith(d, 'Grand Total')).toEqual([3])
      expect(pageContaining(d, 'June 2026 has no budget')).toBe(3)
    })

    it('puts the notes under the first table when it ends a page after the second, not a page later still', () => {
      // One department: the first table (TOTAL, Budget, two variances) outruns
      // the department table (one subtotal, Grand Total) by two rows, so there
      // is a roster whose first table crosses the page while the second does not.
      const d = long(31, 1)
      expect(pagesWith(d, 'Grand Total')).toEqual([2])
      expect(pagesWith(d, 'Variance %')).toEqual([3])
      expect(pageContaining(d, 'June 2026 has no budget')).toBe(3)
      expect(d.internal.getNumberOfPages()).toBe(3)
    })

    it('notes that go over onto a page of their own run on bare — no corner mark over them', () => {
      // 28 contractors in 3 departments: both tables end at the foot of page 2
      // and the June note does not fit under them. Its page is a run-on, as
      // the commentary's is (Calxa's p12): the mark belongs on the page the
      // sheet opened, and a mark here sits over the note's first line, which
      // starts at the top of the sheet.
      const d = long(28, 3)
      expect(d.internal.getNumberOfPages()).toBe(3)
      expect(pagesWith(d, 'Grand Total')).toEqual([2])
      expect(pageContaining(d, 'June 2026 has no budget')).toBe(3)
      expect(images(d, 2)).toBe(1)
      expect(images(d, 3)).toBe(0)
    })

    it('on a portrait placement the notes run on in portrait, not on a landscape page of their own', () => {
      // 18 contractors in 3 departments, stacked: both tables end at the foot
      // of page 2 and the June note goes over. The run-on page was always
      // opened landscape — a portrait sheet whose last page turned sideways.
      const d = long(18, 3, 'portrait')
      expect(d.internal.getNumberOfPages()).toBe(3)
      expect(pagesWith(d, 'Grand Total')).toEqual([2])
      expect(pageContaining(d, 'June 2026 has no budget')).toBe(3)
      expect(d.getPageWidth(2)).toBeLessThan(d.getPageHeight(2))
      expect(d.getPageWidth(3)).toBeLessThan(d.getPageHeight(3))
      expect(images(d, 3)).toBe(0)
    })
  })

  it('without the route\'s answer prints the standard page, and says why', () => {
    const d = render(layout('contractor_detail', { layout: 'calxa' }, 'landscape'), { contractorDetail: rolled() })
    const text = textRuns(d, 2).join(' ')
    expect(text).toContain('Contractor Analysis')
    expect(text).toContain('which this export did not load')
  })

  it('a placement with no config is the page it always was', () => {
    const d = render(layout('contractor_detail'), { contractorDetail: rolled(), contractorDetailReport: contractorDetail() })
    const runs = textRuns(d, 2)
    expect(runs.join(' ')).toContain('Contractor Analysis')
    expect(runs).toContain('BY DEPARTMENT')
    expect(runs).not.toContain('Jun 2026')
  })
})

describe('a placed payroll grid with no rows', () => {
  it('is not in the pack when nothing was asked for', () => {
    expect(render(layout('payroll_grid', undefined, 'landscape')).internal.getNumberOfPages()).toBe(1)
  })

  it('prints the loader\'s own reason', () => {
    const d = render(layout('payroll_grid', undefined, 'landscape'), { payrollGridReason: 'no payslips synced for this period' })
    expect(d.internal.getNumberOfPages()).toBe(2)
    expect(docText(d)).toContain('The payroll grid is not available for this month: no payslips synced for this period.')
  })
})
