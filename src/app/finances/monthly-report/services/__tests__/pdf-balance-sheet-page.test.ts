/**
 * The Balance Sheet page as drawn — Calxa pages 19-21 of Urban Road Pty Ltd's
 * August 2026 pack, against the rows lib/monthly-report/balance-sheet-rows.ts
 * builds from Urban Road's own sheet.
 *
 * The rows module is tested on its own; what is locked here is what only the
 * renderer decides, and what a change to a shared table helper could quietly
 * undo: how many pages each comparison takes (Calxa: the prior-month sheet on
 * one page, the prior-year sheet one page plus a few rows — ours ran to four
 * pages before the density pass), Net Assets as a bold total over a rule,
 * which figures are red, and that nothing is printed under the table.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport } from './pdf-pack-fixture'
import fixture from '@/lib/monthly-report/__tests__/fixtures/urban-road-bs-aug-2026.json'
import {
  buildBalanceSheetData,
  balanceSheetDates,
  type XeroBalanceSheetReport,
} from '@/lib/monthly-report/balance-sheet-rows'
import type { BalanceSheetCompare } from '../../types'

function urbanRoad(compare: BalanceSheetCompare) {
  const { current, prior } = balanceSheetDates('2026-08', compare)
  const reports = fixture.reports as Record<string, { Reports: XeroBalanceSheetReport[] }>
  return buildBalanceSheetData({
    businessId: '28d41193-38ae-4071-a2b1-0dbea90a38fd',
    compare,
    currentDate: current,
    priorDate: prior,
    current: reports[current].Reports[0],
    prior: reports[prior].Reports[0],
    accounts: new Map(
      Object.entries(fixture.codes as Record<string, string | null>).map(([id, code]) => [
        id,
        { code, xeroClass: (fixture.classes as Record<string, string | null>)[id] ?? null },
      ]),
    ),
  })
}

/** The pack with only this comparison's page placed, so every page counted is its. */
function render(compare: BalanceSheetCompare): any {
  const svc = new MonthlyReportPDFService(fixtureReport(), {
    sections: { ...fixtureReport().settings.sections, balance_sheet: true },
    balanceSheets: { [compare]: { data: urbanRoad(compare) } },
    pdfLayout: {
      version: 1,
      pages: [
        {
          id: 'p1',
          orientation: 'portrait',
          widgets: [{ id: 'w1', type: 'balance_sheet', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: { compare } }],
        },
      ],
    },
  })
  return svc.generate()
}

/** Pages carrying the table's period band — repeated on a continuation page. */
function bandPages(doc: any, priorLabel: string): number[] {
  const out: number[] = []
  for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
    const page = doc.internal.pages[i]
    if (Array.isArray(page) && page.join('\n').includes(`(${priorLabel}) Tj`)) out.push(i)
  }
  return out
}

interface StyledRun {
  text: string
  font: string
  /** The fill colour the run was drawn in, as jsPDF wrote it ("1. 0. 0. rg"). */
  color: string
  /** Stroke widths drawn since the previous run — the rules autoTable put under this cell's row. */
  strokesBefore: number[]
}

/** Every text run on the page with the font, colour and preceding rules it was drawn with. */
function styledRuns(doc: any, pageNumber: number): StyledRun[] {
  const ops = (doc.internal.pages[pageNumber] as string[]).join('\n').split('\n').map((o) => o.trim())
  const runs: StyledRun[] = []
  let font = ''
  let color = ''
  let width = 0
  let strokes: number[] = []
  for (const op of ops) {
    let m: RegExpExecArray | null
    if ((m = /^\/(F\d+) [\d.]+ Tf$/.exec(op))) font = m[1]
    else if (/ (rg|g)$/.test(op)) color = op
    else if ((m = /^([\d.]+) w$/.exec(op))) width = Number(m[1])
    else if (op === 'S') strokes.push(width)
    else if ((m = /^\((.*)\) Tj$/.exec(op))) {
      runs.push({ text: m[1].replace(/\\([()])/g, '$1'), font, color, strokesBefore: strokes })
      strokes = []
    }
  }
  return runs
}

/** The runs of one table row, from its label to the next label. */
function rowRuns(doc: any, pages: number[], label: string): StyledRun[] {
  for (const p of pages) {
    const runs = styledRuns(doc, p)
    const at = runs.findIndex((r) => r.text === label)
    if (at >= 0) return runs.slice(at, at + 5)
  }
  throw new Error(`no row ${label}`)
}

const RED = '1. 0. 0. rg'

describe('the Balance Sheet page — Urban Road, August 2026', () => {
  it('prints the prior-month sheet on one page, as Calxa p19 does', () => {
    const doc = render('mom')
    expect(bandPages(doc, 'Jul 2026')).toHaveLength(1)
  })

  it('prints the prior-year sheet on ONE page — Calxa needs a continuation (pp20-21) only for its unmapped blocks', () => {
    // Flat by class the sheet is 58 rows: no Bank / Current Assets / … groups
    // and their totals, and none of Calxa's "New unmapped" headings and
    // subtotals, which are what push its Current Earnings and Total Equity
    // over onto p21.
    const doc = render('yoy')
    expect(bandPages(doc, 'Aug 2025')).toHaveLength(1)
  })

  it('prints a credit card as a red negative asset, and half-dollars rounded as Calxa rounds them', () => {
    const doc = render('mom')
    const pages = bandPages(doc, 'Jul 2026')
    const amex = rowRuns(doc, pages, 'American Express® Platinum Business Card')
    expect(amex.map((r) => r.text)).toEqual(['American Express® Platinum Business Card', '(64,332)', '(65,919)', '1,586', '2%'])
    expect(amex[1].color).toBe(RED)
    expect(amex[3].color).not.toBe(RED)
    // PrinTribe Loan (55,019.50): Calxa p19 "(55,020)".
    expect(rowRuns(doc, pages, 'PrinTribe Loan').slice(1, 3).map((r) => r.text)).toEqual(['(55,020)', '(55,020)'])
    const totals = rowRuns(doc, pages, 'Total Asset')
    expect(totals.map((r) => r.text)).toEqual(['Total Asset', '646,535', '559,303', '87,232', '16%'])
  })

  it('prints no footnote under the table (decision 18)', () => {
    for (const compare of ['mom', 'yoy'] as const) {
      const doc = render(compare)
      for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
        const text = (doc.internal.pages[i] as string[]).join('\n')
        expect(text).not.toContain('Sourced from Xero')
        expect(text).not.toContain('Negatives shown')
      }
    }
  })

  it('draws Net Assets bold, over the rule that closes it, between Total Liability and Equity', () => {
    const doc = render('mom')
    const pages = bandPages(doc, 'Jul 2026')
    const bold = doc.internal.getFont('helvetica', 'bold').id
    const net = rowRuns(doc, pages, 'Net Assets')
    expect(net.map((r) => r.text)).toEqual(['Net Assets', '425,242', '292,541', '132,701', '45%'])
    for (const r of net) expect(r.font).toBe(bold)
    // The 0.5mm grey rule under the row, one segment per cell.
    const ruleWidth = 0.5 * doc.internal.scaleFactor
    for (const r of net) expect(r.strokesBefore.some((w) => Math.abs(w - ruleWidth) < 0.01)).toBe(true)
    // And an account line is neither bold nor ruled.
    const line = rowRuns(doc, pages, 'Trade Creditors')
    expect(line[0].font).not.toBe(bold)
    expect(line.every((r) => r.strokesBefore.length === 0)).toBe(true)
  })

  it('reds an N/A beside a negative variance, and only there (Calxa p20)', () => {
    const doc = render('yoy')
    const pages = bandPages(doc, 'Aug 2025')
    // "Shopify loan 2 $100000  89,418 | 0 | (89,418) | N/A" — Calxa's N/A is red.
    const s2 = rowRuns(doc, pages, 'Shopify loan 2 $100000')
    expect(s2.map((r) => r.text)).toEqual(['Shopify loan 2 $100000', '89,418', '0', '(89,418)', 'N/A'])
    expect(s2[3].color).toBe(RED)
    expect(s2[4].color).toBe(RED)
    // "Latitude Gem Visa  (3,910) | 0 | 3,910 | N/A" — a favourable variance, black N/A.
    const lat = rowRuns(doc, pages, 'Latitude Gem Visa')
    expect(lat.map((r) => r.text)).toEqual(['Latitude Gem Visa', '(3,910)', '0', '3,910', 'N/A'])
    expect(lat[1].color).toBe(RED)
    expect(lat[4].color).not.toBe(RED)
  })

  it('heads the page with a bare "AUG 2026" UNDER the 24pt title, not across it (Calxa p19)', () => {
    const doc = render('mom')
    const [page] = bandPages(doc, 'Jul 2026')
    const ops = (doc.internal.pages[page] as string[]).join('\n').split('\n').map((o) => o.trim())
    // jsPDF positions each run with a Td just before its Tj; PDF y runs up the page.
    const yOf = (starts: string) => {
      const at = ops.findIndex((op) => op.startsWith(`(${starts}`) && op.endsWith(') Tj'))
      expect(at, `no run starting ${starts} in ${ops.filter((op) => op.endsWith(' Tj')).slice(0, 4)}`).toBeGreaterThan(0)
      const td = ops.slice(0, at).reverse().find((op) => / Td$/.test(op))!
      return Number(td.split(' ')[1])
    }
    const title = yOf('Balance Sheet')
    const period = yOf('AUG 2026')
    const mm = 72 / 25.4
    // The period line sits on its own baseline 8.9mm under the title's — the
    // page used to draw it 5.5mm below the TOP of the page, inside the title.
    expect((title - period) / mm).toBeCloseTo(8.9, 1)
    expect(ops.some((op) => op.includes('MONTH:'))).toBe(false)
  })
})
