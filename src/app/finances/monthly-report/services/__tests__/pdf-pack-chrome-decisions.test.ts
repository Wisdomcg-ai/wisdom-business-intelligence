/**
 * The pack's chrome, as Matt decided it on 14 Sep 2026 against Urban Road's
 * August 2026 Calxa pack:
 *
 *   1. "Budgets" / "YTD Budget" over the budget columns, for every client —
 *      "Approved Budget" stays on the browser tabs only.
 *   2. No budget-provenance sentence anywhere in the pack. The reason an empty
 *      budget column is empty still prints.
 *   3. The mark is a setting: the WisdomBI lockup by default, a business's own
 *      image in Calxa's boxes (35mm cover, 22mm corner).
 *   4. A draft carries one plain line on the cover — no watermark, no footer.
 *   5. "Prepared on" is the day the report was settled; the export date only
 *      when it has not been.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn(), captureException: vi.fn() }))
vi.mock('@sentry/nextjs', () => sentry)

import { MonthlyReportPDFService, draftCoverLine } from '../monthly-report-pdf-service'
import { fixtureReport, fixtureFullYear, textRuns, pageContaining, docText } from './pdf-pack-fixture'
import type { WagesDetailData } from '../../types'

const URBAN_ROAD_VERSION = 'Overall Budget (Xero, rev 12 Aug 2026)'
const budgetStore = () => fixtureReport({ budget_source: 'budget_version', budget_forecast_name: URBAN_ROAD_VERSION })
const forecastClient = () => fixtureReport({ budget_source: 'forecast', budget_forecast_name: 'FY27 Forecast' })

/** A 135x135 grey square — the pixel size of the mark in Calxa's pack. A stand-in, not the mark. */
const SQUARE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIcAAACHCAIAAACzhd1dAAAA1klEQVR42u3RAQ0AMAjAsHPjCEABbrFBSCdhjax+Wta3gIqoUBEVKqIiKlREhYqoUBEVUaEiKlREhYqoiAoVUaEiKlRERVSoiAoVUaEiKqJCRVSoiAoVUREVKqJCRVSoiIqoUBEVKqJCRVREhYqoUBEVKqIiKlREhYqoiAoVUaEiKlRERVSoiAoVUaEiKqJCRVSoiAoVUREVKqJCRVSoiIqoUBEVKqJCRVREhYqoUBEVKqIiKlREhYqoUBEVUaEiKlREhYqoiAoVUaEiKlQsoCIqVETleANCLgKxaPSVEQAAAABJRU5ErkJggg=='
/** 200x100 — a mark that is not square. */
const WIDE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAIAAABM5OhcAAAAzElEQVR42u3SMREAMAgAsVLjCEABbjHBwJBI+PvI6gfbvgQYC2NhLDAWxsJYYCyMhbHAWBgLY4GxMBbGAmNhLIwFxsJYGAuMhbEwFhgLY2EsMBbGwlhgLIyFscBYGAtjgbEwFsYCY2EsjAXGwlgYC4yFsTAWGAtjYSwwFsbCWGAsjIWxwFgYC2OBsTAWxgJjYSyMBcbCWBgLjIWxMBYYC2NhLDAWxsJYYCyMhbHAWBgLY4GxMBbGwlhgLIyFscBYGAtjgbEwFsYCY3HbAPakAmutuvlbAAAAAElFTkSuQmCC'

const MM = 72 / 25.4

/** Every image a page draws, in mm from the top-left: jsPDF's `w 0 0 h x y cm /I Do`. */
function imagesOn(doc: any, page: number): { x: number; y: number; w: number; h: number }[] {
  const info = doc.getPageInfo(page)
  const heightPt = Number(info.pageContext.mediaBox.topRightY) - Number(info.pageContext.mediaBox.bottomLeftY)
  const text = (doc.internal.pages[page] as string[]).join('\n')
  const out: { x: number; y: number; w: number; h: number }[] = []
  const re = /(-?[\d.]+) 0 0 (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm\s*\n?\/I\d+ Do/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const [w, h, x, y] = [m[1], m[2], m[3], m[4]].map(Number)
    out.push({ x: x / MM, y: (heightPt - y - h) / MM, w: w / MM, h: h / MM })
  }
  return out
}

/**
 * Everything else a page puts ink on, in mm from the top-left: each text run
 * (its width measured in the run's font size, its height the size above the
 * baseline), each filled or stroked rectangle, and each ruled line.
 */
function inkOn(doc: any, page: number): { what: string; x: number; y: number; w: number; h: number }[] {
  const info = doc.getPageInfo(page)
  const heightPt = Number(info.pageContext.mediaBox.topRightY) - Number(info.pageContext.mediaBox.bottomLeftY)
  const ops = (doc.internal.pages[page] as string[]).join('\n').split('\n').map((l) => l.trim())
  const out: { what: string; x: number; y: number; w: number; h: number }[] = []
  let size = 10
  let at: [number, number] | null = null
  let moveTo: [number, number] | null = null
  for (const op of ops) {
    let m: RegExpExecArray | null
    if ((m = /^\/F\d+ ([\d.]+) Tf$/.exec(op))) size = Number(m[1])
    else if ((m = /^(-?[\d.]+) (-?[\d.]+) Td$/.exec(op))) at = [Number(m[1]), Number(m[2])]
    else if ((m = /^(?:T\* )?\((.*)\) Tj$/.exec(op)) && at) {
      const w = (doc.getStringUnitWidth(m[1]) * size) / MM
      if (m[1].trim() !== '') out.push({ what: `text "${m[1]}"`, x: at[0] / MM, y: (heightPt - at[1]) / MM - (size * 0.72) / MM, w, h: (size * 0.72) / MM })
    } else if ((m = /^(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re$/.exec(op))) {
      const [x, y, w, h] = [m[1], m[2], m[3], m[4]].map(Number)
      const top = Math.max(y, y + h)
      out.push({ what: 'rect', x: Math.min(x, x + w) / MM, y: (heightPt - top) / MM, w: Math.abs(w) / MM, h: Math.abs(h) / MM })
    } else if ((m = /^(-?[\d.]+) (-?[\d.]+) m$/.exec(op))) moveTo = [Number(m[1]), Number(m[2])]
    else if ((m = /^(-?[\d.]+) (-?[\d.]+) l$/.exec(op)) && moveTo) {
      const [x2, y2] = [Number(m[1]), Number(m[2])]
      out.push({ what: 'line', x: Math.min(moveTo[0], x2) / MM, y: (heightPt - Math.max(moveTo[1], y2)) / MM, w: Math.abs(x2 - moveTo[0]) / MM, h: Math.abs(y2 - moveTo[1]) / MM })
      moveTo = [x2, y2]
    }
  }
  return out
}

/** Every piece of ink that lands under a corner mark, across the whole pack. */
function inkUnderTheMark(doc: any): string[] {
  const hits: string[] = []
  for (let p = 2; p <= doc.internal.getNumberOfPages(); p++) {
    const pageWidth = doc.getPageWidth(p)
    // The corner mark is the image in the top-right corner; the cover's is centred.
    const marks = imagesOn(doc, p).filter((i) => i.y < 15 && i.x + i.w > pageWidth - 20)
    for (const mark of marks) {
      for (const ink of inkOn(doc, p)) {
        const overlaps = ink.x < mark.x + mark.w && ink.x + ink.w > mark.x && ink.y < mark.y + mark.h && ink.y + ink.h > mark.y
        if (overlaps) hits.push(`page ${p}: ${ink.what} at ${ink.x.toFixed(1)},${ink.y.toFixed(1)} under the mark at ${mark.x.toFixed(1)},${mark.y.toFixed(1)}`)
      }
    }
  }
  return hits
}

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.1)

beforeEach(() => {
  sentry.captureMessage.mockClear()
})

describe('1 — the budget columns say Calxa\'s words in the pack', () => {
  it('"Budgets" / "YTD Budget" on the summary, the detail and the YTD pages of a budget-store client', () => {
    const doc: any = new MonthlyReportPDFService(budgetStore(), {}).generate()
    for (const title of ['Actual vs Budget', 'Budget vs Actual Detail']) {
      const runs = textRuns(doc, pageContaining(doc, title))
      expect(runs).toContain('Budgets')
      expect(runs).toContain('YTD Budget')
    }
    expect(textRuns(doc, pageContaining(doc, 'YTD Detail'))).toContain('YTD Budget')
    expect(docText(doc)).not.toContain('Approved Budget')
  })

  it('the same words for a client on the forecast, who printed "Budget" before', () => {
    const doc: any = new MonthlyReportPDFService(forecastClient(), {}).generate()
    const runs = textRuns(doc, pageContaining(doc, 'Actual vs Budget'))
    expect(runs).toContain('Budgets')
    expect(runs).toContain('YTD Budget')
    // "Budget" alone survives only as the second line of "Unspent / Budget".
    expect(runs.filter((r) => r === 'Budget')).toHaveLength(1)
    expect(runs[runs.indexOf('Budget') - 1]).toBe('Unspent')
  })
})

describe('1 — the burn-rate chart page says the same word', () => {
  // On by default (DEFAULT_REPORT_SECTIONS.chart_budget_burn_rate), and it
  // printed "Approved Budget Burn Rate" after a run of statement pages headed
  // "Budgets" — Precision Electrical Group, August 2026.
  const withBurnRate = (report: ReturnType<typeof fixtureReport>) => ({ sections: { ...report.settings.sections, chart_budget_burn_rate: true } })

  it('a budget-store client: "Budget Burn Rate" over "Expense budget for current FY"', () => {
    const report = budgetStore()
    const doc: any = new MonthlyReportPDFService(report, withBurnRate(report)).generate()
    const page = pageContaining(doc, 'Budget Burn Rate')
    expect(page).toBeGreaterThan(0)
    expect(textRuns(doc, page).join(' ')).toContain('Expense budget for current FY')
    expect(docText(doc)).not.toMatch(/approved budget/i)
  })

  it('a forecast client keeps the words the pack printed for it, which never said "Budget"', () => {
    const report = forecastClient()
    const doc: any = new MonthlyReportPDFService(report, withBurnRate(report)).generate()
    const page = pageContaining(doc, 'Forecast Burn Rate')
    expect(page).toBeGreaterThan(0)
    expect(textRuns(doc, page).join(' ')).toContain('Expense forecast for current FY')
  })
})

describe('2 — no provenance sentence in the pack', () => {
  it('neither the summary nor the YTD page says where the budget came from', () => {
    const doc: any = new MonthlyReportPDFService(budgetStore(), {}).generate()
    const text = docText(doc)
    expect(text).not.toContain('Every budget figure')
    expect(text).not.toContain('not the forecast')
    expect(text).not.toContain(URBAN_ROAD_VERSION)
  })

  it('the wages page keeps its reason for dashes and loses the provenance lines', () => {
    const wages: WagesDetailData = {
      accounts: [{ account_name: 'Employ - Wages & Salaries', budget: 52_519, actual: 55_164, variance: -2_645, variance_percent: -5 } as any],
      budget_provenance: { source: 'budget_version', label: URBAN_ROAD_VERSION, fiscal_year: 2027 },
      employee_plan_available: true,
      employees: [{ name: 'Andrea', actual_total: 10_833, budget_total: 10_833, variance: 0 } as any],
      employee_totals: { actual: 10_833, budget: 10_833, variance: 0 },
      grand_total: { actual: 55_164, budget: 52_519, variance: -2_645 },
      payroll_available: true,
      pay_run_dates: [],
    }
    const doc: any = new MonthlyReportPDFService(budgetStore(), { wagesDetail: wages }).generate()
    const page = pageContaining(doc, 'Wages Analysis')
    const runs = textRuns(doc, page)
    expect(runs).toContain('Budget')
    expect(runs).toContain('Forecast')
    expect(runs.join(' ')).not.toContain('approved budget')
    expect(runs.join(' ')).not.toContain('not split by employee')

    // The absent state still explains itself.
    const none = new MonthlyReportPDFService(budgetStore(), {
      wagesDetail: { ...wages, budget_provenance: { source: 'none', reason: 'no_version_in_force', fiscal_year: 2027 } },
    }).generate() as any
    expect(textRuns(none, pageContaining(none, 'Wages Analysis')).join(' ')).toContain('no approved budget version is locked for FY2027')
  })

  it('the Full Year page still prints its fail-open reason when the budget does not cover the year', () => {
    const doc: any = new MonthlyReportPDFService(budgetStore(), {
      fullYearReport: { ...fixtureFullYear({ forecastMonthly: 90_000, approvedMonthly: 95_000 }), approved_months_covered: ['2026-07', '2026-08', '2026-09'] } as any,
    }).generate()
    const runs = textRuns(doc, pageContaining(doc, 'Full Year Projection')).join(' ')
    expect(runs).toContain('does not cover')
    expect(runs).toContain('the forecast, not the budget')
  })
})

describe('3 — the mark', () => {
  it('no setting: the WisdomBI lockup, where #512 put it', () => {
    const doc: any = new MonthlyReportPDFService(fixtureReport(), {}).generate()
    const cover = imagesOn(doc, 1)
    expect(cover).toHaveLength(1)
    near(cover[0].w, 46)
    near(cover[0].y, 25)
    const corner = imagesOn(doc, 2)
    near(corner[0].w, 17)
    near(corner[0].y, 9)
    expect(sentry.captureMessage).not.toHaveBeenCalled()
  })

  it("a custom square mark sits in Calxa's boxes: 35mm centred on the cover, 22mm in the corner", () => {
    const doc: any = new MonthlyReportPDFService(fixtureReport(), {
      packLogo: { kind: 'custom', image: SQUARE_PNG, label: 'test square' },
    }).generate()
    const [cover] = imagesOn(doc, 1)
    near(cover.w, 35)
    near(cover.h, 35)
    near(cover.x, (210 - 35) / 2) // Calxa p1: x 87.5
    near(cover.y, 26)
    // Page 2 is the landscape summary: right edge 17mm in from 297mm.
    const [corner] = imagesOn(doc, 2)
    near(corner.w, 22)
    near(corner.h, 22)
    near(corner.x + corner.w, 297 - 17)
    near(corner.y, 11.5)
    expect(sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('a mark that is not square keeps its shape inside the box', () => {
    const doc: any = new MonthlyReportPDFService(fixtureReport(), { packLogo: { kind: 'custom', image: WIDE_PNG } }).generate()
    const [cover] = imagesOn(doc, 1)
    near(cover.w, 35)
    near(cover.h, 17.5)
    const [corner] = imagesOn(doc, 2)
    near(corner.w, 22)
    near(corner.h, 11)
  })

  it('a setting that cannot be drawn prints the lockup and tells Sentry', () => {
    const doc: any = new MonthlyReportPDFService(fixtureReport(), {
      packLogo: { kind: 'custom', image: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } as any,
    }).generate()
    near(imagesOn(doc, 1)[0].w, 46)
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(sentry.captureMessage.mock.calls[0][1].tags.invariant).toBe('pack-logo-unusable')
  })
})

describe('3 — the mark never sits on the page\'s content', () => {
  // A 22mm custom mark reaches 33.5mm down; content used to start at 22mm and
  // a layout's top grid row at 15mm. The lockup only ever reached ~18mm.
  const marks = [
    ['the lockup', undefined],
    ['a custom square mark', { kind: 'custom', image: SQUARE_PNG }],
  ] as const
  const longMemo = Array.from({ length: 90 }, (_, i) => `Paragraph ${i + 1}: revenue held up against the budget this month and the team is on track for the quarter.`).join('\n\n')

  it.each(marks)('default page order, with %s', (_label, packLogo) => {
    const doc: any = new MonthlyReportPDFService(budgetStore(), {
      packLogo: packLogo as any,
      memo: longMemo,
      fullYearReport: fixtureFullYear({ forecastMonthly: 90_000, approvedMonthly: 95_000 }),
    }).generate()
    // The memo runs onto a continuation page with no title to push it down.
    expect(doc.internal.getNumberOfPages()).toBeGreaterThan(5)
    expect(inkUnderTheMark(doc)).toEqual([])
  })

  it.each(marks)('a layout with a KPI card in the top-right grid cell and a table in the top row, with %s', (_label, packLogo) => {
    const layout = {
      version: 1 as const,
      pages: [
        // Page 1 never carries the corner mark, so the KPI page is second.
        { id: 'p0', orientation: 'portrait' as const, widgets: [{ id: 'c1', type: 'cover_page' as const, col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
        {
          id: 'p1',
          orientation: 'landscape' as const,
          widgets: [
            { id: 'k1', type: 'kpi_revenue' as const, col: 0, row: 0, colSpan: 1, rowSpan: 1 },
            { id: 'k2', type: 'kpi_gross_profit' as const, col: 1, row: 0, colSpan: 1, rowSpan: 1 },
            { id: 'k3', type: 'kpi_net_profit' as const, col: 2, row: 0, colSpan: 1, rowSpan: 1 },
          ],
        },
        { id: 'p2', orientation: 'landscape' as const, widgets: [{ id: 't1', type: 'budget_vs_actual' as const, col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
        { id: 'p3', orientation: 'portrait' as const, widgets: [{ id: 'm1', type: 'memo' as const, col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
      ],
    }
    const doc: any = new MonthlyReportPDFService(budgetStore(), { packLogo: packLogo as any, memo: longMemo, pdfLayout: layout }).generate()
    expect(inkUnderTheMark(doc)).toEqual([])
  })
})

describe('4 — a draft says so once, on the cover', () => {
  it("Calxa's line when transactions are unreconciled, and nothing on the other pages", () => {
    const doc: any = new MonthlyReportPDFService(fixtureReport({ is_draft: true, unreconciled_count: 3 }), {}).generate()
    expect(textRuns(doc, 1)).toContain('There are still 3 unreconciled transactions when this report is generated.')
    const text = docText(doc)
    expect(text).not.toContain('PROVISIONAL')
    expect(text).not.toContain('(DRAFT)')
    // Only the cover mentions it.
    for (let p = 2; p <= doc.internal.getNumberOfPages(); p++) {
      expect(textRuns(doc, p).join(' ')).not.toContain('unreconciled')
    }
  })

  it('the wording agrees with the number, and a reconciled draft gets the neutral line', () => {
    expect(draftCoverLine({ is_draft: true, unreconciled_count: 1 })).toBe('There is still 1 unreconciled transaction when this report is generated.')
    expect(draftCoverLine({ is_draft: true, unreconciled_count: 0 })).toBe('Draft — figures may change')
    expect(draftCoverLine({ is_draft: false, unreconciled_count: 0 })).toBeNull()
    // A final report that still carries a count says so — it is a fact about the books.
    expect(draftCoverLine({ is_draft: false, unreconciled_count: 2 })).toContain('There are still 2')
  })

  it('a final pack carries no status line at all', () => {
    const doc: any = new MonthlyReportPDFService(fixtureReport(), {}).generate()
    const runs = textRuns(doc, 1)
    expect(runs.some((r) => r.includes('unreconciled') || r.startsWith('Draft'))).toBe(false)
  })
})

describe('5 — Prepared on', () => {
  it("a finalised report is dated the day it was finalised, in Sydney", () => {
    // Urban Road's last save was 2026-09-11 20:14 UTC — the morning of the 12th in Sydney.
    const doc: any = new MonthlyReportPDFService(fixtureReport(), {
      preparedOn: { at: '2026-09-11T20:14:47.289Z', basis: 'finalised' },
    }).generate()
    expect(textRuns(doc, 1)).toContain('Prepared on 12 September 2026')
  })

  it('a draft is dated the day it was exported', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T01:00:00Z'))
    try {
      const doc: any = new MonthlyReportPDFService(fixtureReport({ is_draft: true }), { preparedOn: null }).generate()
      expect(textRuns(doc, 1)).toContain('Prepared on 14 September 2026')
    } finally {
      vi.useRealTimers()
    }
  })
})
