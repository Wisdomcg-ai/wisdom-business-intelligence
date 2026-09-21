/**
 * The commentary blocks as the pack draws them, through the real generate()
 * pipeline with Urban Road's August COGS and expense lines.
 *
 * What only a rendered document can show: that "separate_page" really is a
 * portrait page straight after the table and the table page carries no block;
 * that the standing lines sit first in the same list instead of overprinting
 * it; and that a pack with no commentary config draws the block it always did.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, line, textRuns, pageContaining } from './pdf-pack-fixture'
import type { GeneratedReport, StandingCommentaryLine, VarianceCommentary, VarianceCommentaryEntry } from '../../types'
import type { PDFLayout } from '../../types/pdf-layout'
import type { PackInsertState } from '@/lib/monthly-report/pack-inserts'

const drafted = (reason: VarianceCommentaryEntry['trigger_reason'], facts: string, clause: string | null): VarianceCommentaryEntry => ({
  vendor_summary: [],
  coach_note: '',
  is_edited: false,
  trigger_reason: reason,
  draft_note: clause ? `${facts} - ${clause}` : facts,
  draft_facts: facts,
  draft_clause: clause,
  draft_warnings: [],
})

function report(): GeneratedReport {
  const base = fixtureReport()
  return {
    ...base,
    sections: [
      base.sections[0],
      {
        category: 'Cost of Sales',
        lines: [
          line('Antons Canvas', 156163, 172488),
          line('Cushions & Decor', 7010, 1035),
          line('Rugs', 326, 336),
        ],
        subtotal: line('Total Cost of Sales', 163499, 173859),
      },
      {
        category: 'Operating Expenses',
        lines: [
          line('Employ - Staff Amenities', 1241, 450),
          line('IT Costs Software', 14726, 13697),
          line('Marketing Digital Ad Spend', 23144, 20000),
          line('Shopify Fees', 2623, 4000),
        ],
        subtotal: line('Total Operating Expenses', 41734, 38147),
      },
    ],
  }
}

const commentary: VarianceCommentary = {
  'Antons Canvas': drafted('account_activity', 'Antons Mouldings Pty Ltd ($155,938)', '29.6% of income against a 38.3% driver'),
  'Cushions & Decor': drafted('expense_over_budget_dollar', 'Hangzhou Sino Silk Technology ($1,242)', '1.3% of income against a 0.2% driver'),
  Rugs: drafted('account_activity', 'Unitex International ($326)', '0.1% of income against a 0.1% driver'),
  'Employ - Staff Amenities': drafted('expense_over_budget_dollar', 'Alcotraz ($918), Food ($323)', '0.2% of income against a 0.1% driver'),
  'IT Costs Software': drafted('expense_over_budget_dollar', 'Shopify ($4,261), Klaviyo Inc ($1,445)', '2.8% of income against a 3.0% driver'),
  'Marketing Digital Ad Spend': drafted('expense_over_budget_dollar', 'Google Workspace ($16,553), Facebook ($5,117)', '4.4% of income against a 4.4% driver'),
  'Shopify Fees': drafted('expense_favourable_significant', 'Shopify ($2,635)', '0.5% of income against a 0.9% driver'),
}

const layout = (cogsConfig: Record<string, unknown>, expenseConfig: Record<string, unknown>): PDFLayout => ({
  version: 1,
  pages: [
    { id: 'p-cogs', orientation: 'landscape', widgets: [{ id: 'w-cogs', type: 'budget_vs_actual', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: cogsConfig }] },
    { id: 'p-exp', orientation: 'landscape', widgets: [{ id: 'w-exp', type: 'budget_vs_actual', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: expenseConfig }] },
  ],
} as PDFLayout)

/** A page's runs with the PDF string escapes undone: "\\($326\\)" → "($326)". */
const runsOf = (doc: any, page: number) => textRuns(doc, page).map((r) => r.replace(/\\([()\\])/g, '$1'))
const pageText = (doc: any, page: number) => runsOf(doc, page).join(' ')
/** How many images a page draws (the corner mark is the only one on these pages). */
const images = (doc: any, page: number) =>
  doc.internal.pages[page].join('\n').split('\n').filter((op: string) => / Do$/.test(op.trim())).length
const isPortrait = (doc: any, page: number) => {
  const box = doc.getPageInfo(page).pageContext.mediaBox
  return box.topRightY - box.bottomLeftY > box.topRightX - box.bottomLeftX
}

describe('commentary placement in the pack', () => {
  it('no commentary config: COMMENTARY under each table, clause and favourable bullet kept', () => {
    const doc: any = new MonthlyReportPDFService(report(), {
      commentary,
      pdfLayout: layout({ section: 'cogs' }, { section: 'expense' }),
    }).generate()
    expect(doc.getNumberOfPages()).toBe(2)
    const cogs = pageText(doc, 1)
    expect(cogs).toContain('COMMENTARY')
    expect(cogs).toContain('Hangzhou Sino Silk Technology ($1,242) - 1.3% of income against a 0.2% driver')
    // Activity entries are not triggers; a table that was not asked for them skips them.
    expect(cogs).not.toContain('Unitex International')
    expect(pageText(doc, 2)).toContain('Shopify ($2,635) - 0.5% of income against a 0.9% driver')
  })

  it('Urban Road: the COGS commentary on its own portrait page, the expense COMMENTS with standing lines first', () => {
    const r = report()
    r.settings.standing_commentary = [
      { label: 'IT Costs Software', refer_to: 'summary page', target: 'Subscription Analysis' },
    ]
    const doc: any = new MonthlyReportPDFService(r, {
      commentary,
      pdfLayout: layout(
        {
          section: 'cogs',
          commentary: {
            placement: 'separate_page', coverage: 'all_with_activity', order: 'alphabetical',
            ratio_clause: ['Antons Canvas'], body_size: 10,
          },
        },
        {
          section: 'expense',
          commentary: { order: 'largest_overspend', heading: 'COMMENTS', heading_underline: true, favourable: 'coach_only', ratio_clause: 'none' },
        },
      ),
    }).generate()

    expect(doc.getNumberOfPages()).toBe(3)
    // Page 1: the COGS table alone.
    expect(pageText(doc, 1)).not.toContain('COMMENTARY')
    expect(pageText(doc, 1)).not.toContain('Antons Mouldings')
    // Page 2: portrait, titled, every COGS account that moved, alphabetical.
    expect(isPortrait(doc, 2)).toBe(true)
    const runs = runsOf(doc, 2)
    expect(runs.some((x) => x.startsWith('Commentary'))).toBe(true)
    const at = (s: string) => runs.findIndex((x) => x.includes(s))
    expect(at('Antons Canvas')).toBeGreaterThan(-1)
    expect(at('Antons Canvas')).toBeLessThan(at('Cushions & Decor'))
    expect(at('Cushions & Decor')).toBeLessThan(at('Rugs'))
    expect(runs).toContain('Antons Mouldings Pty Ltd ($155,938) - 29.6% of income against a 38.3% driver')
    expect(runs).toContain('Unitex International ($326)')
    expect(runs).toContain('Hangzhou Sino Silk Technology ($1,242)')
    // Page 3: expenses, COMMENTS, the standing line first and no duplicate.
    const exp = runsOf(doc, 3)
    expect(exp).toContain('COMMENTS')
    const e = (s: string) => exp.findIndex((x) => x === s)
    expect(e('IT Costs Software ')).toBeGreaterThan(e('COMMENTS'))
    expect(e('Marketing Digital Ad Spend ')).toBeGreaterThan(e('IT Costs Software '))
    expect(e('Employ - Staff Amenities ')).toBeGreaterThan(e('Marketing Digital Ad Spend '))
    expect(exp.filter((x) => x === 'IT Costs Software ')).toHaveLength(1)
    expect(exp).toContain('Refer to summary page (page not in this pack)')
    expect(exp.join(' ')).not.toContain('Klaviyo')
    expect(exp.join(' ')).not.toContain('Shopify ($2,635)')
    expect(exp.join(' ')).not.toContain('driver')
  })

  it('records the accounts a block left off for want of anything to say, by widget, without printing them', () => {
    const r = report()
    r.sections[1].lines.push(line('Art Import', 5042, 0))
    const svc = new MonthlyReportPDFService(r, {
      commentary: { ...commentary, 'Art Import': drafted('expense_over_budget_dollar', '', null) },
      pdfLayout: layout(
        { section: 'cogs', commentary: { placement: 'separate_page', coverage: 'all_with_activity', order: 'alphabetical' } },
        { section: 'expense' },
      ),
    })
    const doc: any = svc.generate()
    expect(pageText(doc, 1)).toContain('Art Import') // the table row
    expect(pageText(doc, 2)).toContain('Antons Canvas')
    expect(pageText(doc, 2)).not.toContain('Art Import') // and never an empty bullet
    expect(svc.commentaryGaps).toEqual([{ widgetId: 'w-cogs', account: 'Art Import', actual: 5042, reason: 'no_draft' }])
    expect(svc.commentaryCapsIgnored).toEqual([])
  })

  it('records, by widget, a vendor_cap that printed the stored draft because there was nothing to redraw from', () => {
    const svc = new MonthlyReportPDFService(report(), {
      commentary,
      pdfLayout: layout(
        { section: 'cogs', commentary: { placement: 'separate_page', coverage: 'all_with_activity', vendor_cap: { Rugs: 'all' } } },
        { section: 'expense' },
      ),
    })
    const doc: any = svc.generate()
    expect(pageText(doc, 2)).toContain('Unitex International ($326)') // still printed, as stored
    expect(svc.commentaryCapsIgnored).toEqual([{ widgetId: 'w-cogs', account: 'Rugs', reason: 'no_suppliers_stored' }])
  })

  it('a heading never ends a page without a bullet under it, and a block that runs on is a bare continuation', () => {
    // Urban Road's August expense table ended low enough that "COMMENTS" fitted
    // at the foot of its last page and all six bullets went over. Sweep the
    // table's length so the heading lands at every height near the foot.
    let sawRunOn = false
    for (let extra = 0; extra <= 40; extra++) {
      const r = report()
      r.settings.standing_commentary = [
        { label: 'Wages & Salaries', refer_to: 'Payroll Summary Page', target: 'Payroll' },
        { label: 'Contractors excl. Artists', refer_to: 'summary page', target: 'Contractor Analysis' },
        { label: 'IT Costs Software', refer_to: 'summary page', target: 'Subscription Analysis' },
      ]
      for (let i = 0; i < extra; i++) r.sections[2].lines.push(line(`Filler ${String(i).padStart(2, '0')}`, 100, 100))
      const doc: any = new MonthlyReportPDFService(r, {
        commentary,
        pdfLayout: layout(
          { section: 'cogs', commentary: 'none' },
          { section: 'expense', commentary: { order: 'largest_overspend', heading: 'COMMENTS', heading_underline: true, body_size: 10, favourable: 'coach_only', ratio_clause: 'none' } },
        ),
      }).generate()
      const n = doc.getNumberOfPages()
      const headingPage = [...Array(n)].map((_, i) => i + 1).find((pg) => runsOf(doc, pg).includes('COMMENTS'))
      const firstBulletPage = [...Array(n)].map((_, i) => i + 1).find((pg) => runsOf(doc, pg).includes('Wages & Salaries '))
      expect(headingPage, `extra=${extra}`).toBeDefined()
      expect(firstBulletPage, `extra=${extra}`).toBe(headingPage)
      const lastBulletPage = [...Array(n)].map((_, i) => i + 1).find((pg) => runsOf(doc, pg).includes('Employ - Staff Amenities '))
      if (lastBulletPage !== undefined && lastBulletPage > headingPage!) {
        sawRunOn = true
        // The run-on page carries no title and no corner mark.
        expect(images(doc, lastBulletPage), `extra=${extra}`).toBe(0)
        expect(runsOf(doc, lastBulletPage).some((x) => x.includes('Urban Road') || x.startsWith('MONTH')), `extra=${extra}`).toBe(false)
      }
    }
    expect(sawRunOn).toBe(true)
  })

  it('a heading keeps its WHOLE first bullet when that bullet runs to several lines (a coach note in replace mode)', () => {
    // 6588159b reserved the heading plus ONE line, while the bullet asks for all
    // of its lines: a four-line first bullet still left COMMENTS alone at the
    // foot of a page (extra = 20, 21 and 60 in the reviewer's sweep).
    const note = 'Google ad spend ran ahead of plan in August because the spring range launched three weeks early, '
      + 'and the agency front-loaded the catalogue campaign to meet it. September is budgeted lower to match, and the '
      + 'team will review the return on the early spend at the next monthly meeting before committing the October '
      + 'budget, which is the point at which the plan can still be changed without penalty ENDOFNOTE'
    for (let extra = 0; extra <= 60; extra++) {
      const r = report()
      for (let i = 0; i < extra; i++) r.sections[2].lines.push(line(`Filler ${String(i).padStart(2, '0')}`, 100, 100))
      const doc: any = new MonthlyReportPDFService(r, {
        commentary: { ...commentary, 'Marketing Digital Ad Spend': { ...commentary['Marketing Digital Ad Spend'], coach_note: note, is_edited: true } },
        pdfLayout: layout(
          { section: 'cogs', commentary: 'none' },
          { section: 'expense', commentary: { order: 'largest_overspend', heading: 'COMMENTS', heading_underline: true, body_size: 10, favourable: 'coach_only', ratio_clause: 'none', coach_note: 'replace' } },
        ),
      }).generate()
      const pages = [...Array(doc.getNumberOfPages())].map((_, i) => i + 1)
      const headingPage = pages.find((pg) => runsOf(doc, pg).includes('COMMENTS'))
      const firstLabelPage = pages.find((pg) => runsOf(doc, pg).includes('Marketing Digital Ad Spend '))
      const noteEndPage = pages.find((pg) => runsOf(doc, pg).some((x) => x.includes('ENDOFNOTE')))
      expect(headingPage, `extra=${extra}`).toBeDefined()
      expect(firstLabelPage, `extra=${extra}`).toBe(headingPage)
      expect(noteEndPage, `extra=${extra}`).toBe(headingPage)
    }
  })

  it('commentary "none" draws no block and no page, and cannot host the standing lines', () => {
    const r = report()
    r.settings.standing_commentary = [{ label: 'Wages & Salaries', refer_to: 'Payroll Summary Page' }]
    const doc: any = new MonthlyReportPDFService(r, {
      commentary,
      pdfLayout: layout({ section: 'cogs', commentary: 'none' }, { section: 'expense', commentary: 'none' }),
    }).generate()
    expect(doc.getNumberOfPages()).toBe(2)
    const all = pageText(doc, 1) + pageText(doc, 2)
    expect(all).not.toContain('COMMENTARY')
    expect(all).not.toContain('Refer to')
    expect(pageContaining(doc, 'Alcotraz')).toBe(-1)
  })
})

// IICT Group's August 2026 pack printed "Wages and Salaries | Refer to Payrun
// Summary Page (page not in this pack)" in red while page 12 — an uploaded page
// titled "Payrun Summary" — sat in the same pack.
describe('a standing line that refers to an uploaded page', () => {
  const PAYRUN: StandingCommentaryLine = { label: 'Wages and Salaries', refer_to: 'Payrun Summary Page' }
  const DANGLING = 'page not in this pack'

  const expensePage = {
    id: 'p-exp', orientation: 'landscape',
    widgets: [{ id: 'w-exp', type: 'budget_vs_actual', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: { section: 'expense' } }],
  }
  const uploadPage = (titleOverride?: string) => ({
    id: 'p-up', orientation: 'portrait',
    widgets: [{ id: 'w-up', type: 'uploaded_insert', col: 0, row: 0, colSpan: 2, rowSpan: 3, ...(titleOverride ? { titleOverride } : {}) }],
  })
  const layoutWith = (...pages: object[]) => ({ version: 1, pages } as PDFLayout)

  /** Every page's text, as one line, with the PDF string escapes undone. */
  const packText = (doc: any) => [...Array(doc.getNumberOfPages())].map((_, i) => pageText(doc, i + 1)).join(' ')
  const render = (standing: StandingCommentaryLine[], pdfLayout?: PDFLayout, inserts?: Record<string, PackInsertState>) => {
    const r = report()
    r.settings.standing_commentary = standing
    return new MonthlyReportPDFService(r, { commentary, ...(pdfLayout ? { pdfLayout } : {}), ...(inserts ? { inserts } : {}) }).generate() as any
  }

  afterEach(() => vi.restoreAllMocks())

  // An uploaded placement prints a page whether or not there is a file to merge;
  // what that page says is the proof it is in the pack.
  it.each<[string, Record<string, PackInsertState> | undefined, string]>([
    ['a ready file', { 'w-up': { status: 'ready', pageCount: 2, filename: 'payrun-aug.pdf', sizeBytes: 90_000 } }, 'uploaded file payrun-aug.pdf goes here'],
    ['nothing uploaded for the month', { 'w-up': { status: 'missing' } }, "The Payrun Summary page for August 2026 hasn't been uploaded."],
    ['a file that could not be added', { 'w-up': { status: 'unavailable', reason: 'the uploaded file could not be downloaded' } }, "The Payrun Summary page for August 2026 couldn't be added to this pack."],
    ['uploads that were never loaded', undefined, "The Payrun Summary page for August 2026 couldn't be added to this pack."],
  ])('a placement titled for the target is in the pack — %s', (_state, inserts, printedOnItsPage) => {
    const text = packText(render([PAYRUN], layoutWith(expensePage, uploadPage('Payrun Summary')), inserts))
    expect(text).toContain(printedOnItsPage)
    expect(text).toContain('Refer to Payrun Summary Page')
    expect(text).not.toContain(DANGLING)
  })

  it('with no uploaded placement in the layout the line is still flagged — the gate is not weakened', () => {
    const text = packText(render([PAYRUN], layoutWith(expensePage)))
    expect(text).toContain(`Refer to Payrun Summary Page (${DANGLING})`)
  })

  it('an uploaded placement with no title is called "Uploaded page" and does not satisfy a line that refers to another page', () => {
    const doc = render([PAYRUN], layoutWith(expensePage, uploadPage()))
    expect(doc.getNumberOfPages()).toBe(2) // the placement printed its page
    expect(pageText(doc, 2)).toContain('Uploaded page')
    expect(packText(doc)).toContain(`Refer to Payrun Summary Page (${DANGLING})`)
  })

  it('a legacy pack with no layout in force is unchanged: an uploaded page is not among its pages', () => {
    const text = packText(render([PAYRUN, { label: 'Overview', refer_to: 'Executive Summary' }]))
    expect(text).toContain(`Refer to Payrun Summary Page (${DANGLING})`)
    expect(text).toContain('Refer to Executive Summary')
    expect(text).not.toContain(`Refer to Executive Summary (${DANGLING})`)
  })

  it('a pack that fell back to the legacy order places no uploaded page, so the line is flagged there too', () => {
    // The layout pass throws once, after drawing the layout's own pages. The
    // service discards the layout and draws the legacy order, which has no
    // uploaded page for the line to point at.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const footers = vi.spyOn(MonthlyReportPDFService.prototype as any, 'addAllFooters')
      .mockImplementationOnce(() => { throw new Error('layout render failed') })
    const text = packText(render([PAYRUN], layoutWith(expensePage, uploadPage('Payrun Summary'))))
    expect(footers).toHaveBeenCalledTimes(2) // the layout pass threw, the legacy pass finished
    expect(text).not.toContain('The Payrun Summary page')
    expect(text).toContain(`Refer to Payrun Summary Page (${DANGLING})`)
  })
})
