/**
 * The Ratio Analysis page, rendered through the real layout pipeline.
 *
 * Every rule is tested in ratio-table.test.ts; what this proves is that a
 * PLACED page reaches the paper — with its figures, or with the sentence saying
 * why it has none. Since #508 a page whose widgets all report no data is
 * dropped from the pack, and a ratio page that vanishes is as wrong as one
 * that prints 0%.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, docText, pageContaining, textRuns } from './pdf-pack-fixture'
import type { PDFLayout } from '../../types/pdf-layout'
import type { AccountActuals } from '@/lib/monthly-report/ratio-table'

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
const byMonth = (values: (number | null)[]) =>
  Object.fromEntries(values.flatMap((v, i) => (v === null ? [] : [[MONTHS[i], v]]))) as Record<string, number>

/** Urban Road, Jan–Aug 2026, as the route returns it. */
const URBAN_ROAD: AccountActuals = {
  months: MONTHS,
  first_synced_month: '2025-07',
  synced_at: '2026-09-14T04:00:00Z',
  accounts: {
    '55000': {
      name: 'Freight to Customer', account_type: 'cogs',
      values: byMonth([55555.67, 55843.27, 48706.89, 43142.27, 54145.63, 50307.5, 51102.0, 50924.95]),
    },
    '41700': {
      name: 'Posters (41700)', account_type: 'revenue',
      values: byMonth([62470.74, 47195.44, 39100.62, 44535.22, 61122.92, 68118.66, 56076.86, 66911.11]),
    },
    '51150': {
      name: 'Posters', account_type: 'cogs',
      values: byMonth([35542.73, 31391.68, 17628.85, 23354.36, 25669.84, 26335.76, 33710.98, null]),
    },
  },
  totals: {
    income: byMonth([478745.39, 398350.79, 430796.94, 419494.5, 508134.18, 569002.79, 495217.03, 527561.8]),
    cost_of_sales: {}, gross_profit: {}, operating_expenses: {},
  },
}

const CONFIG = {
  months_shown: 3,
  trailing_averages: [6, 3],
  ratios: [
    { label: 'Freight % Income', numerator: { accounts: ['55000'] }, denominator: { total: 'income' } },
    { label: 'Posters COGS % of Posters income', numerator: { accounts: ['51150'] }, denominator: { accounts: ['41700'] } },
  ],
}

function layout(config: unknown, titleOverride?: string): PDFLayout {
  return {
    version: 1,
    pages: [
      { id: 'p1', orientation: 'portrait', widgets: [{ id: 'es', type: 'executive_summary', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
      {
        id: 'p2', orientation: 'portrait',
        widgets: [{ id: 'ratio', type: 'ratio_analysis', col: 0, row: 0, colSpan: 2, rowSpan: 3, config: config as Record<string, unknown>, titleOverride }],
      },
    ],
  }
}

function render(config: unknown, accountActuals?: { data: AccountActuals | null; reason?: string }, titleOverride?: string) {
  return new MonthlyReportPDFService(fixtureReport(), {
    pdfLayout: layout(config, titleOverride),
    accountActuals,
  }).generate() as any
}

/**
 * Each string a page draws, with the weight of the font it was set in — the
 * first occurrence wins. jsPDF selects the font inside each BT block with
 * `/Fn size Tf`, so the weight is read from the font id in effect at the Tj.
 */
function runWeights(doc: any, pageNumber: number): Map<string, 'bold' | 'normal'> {
  const boldId = doc.internal.getFont('helvetica', 'bold').id
  const out = new Map<string, 'bold' | 'normal'>()
  let font = ''
  for (const op of doc.internal.pages[pageNumber].join('\n').split('\n')) {
    const tf = /^\/(F\d+) [\d.]+ Tf$/.exec(op.trim())
    if (tf) font = tf[1]
    const tj = /^(?:T\* )?\((.*)\) Tj$/.exec(op.trim())
    if (tj && !out.has(tj[1])) out.set(tj[1], font === boldId ? 'bold' : 'normal')
  }
  return out
}

describe('a placed Ratio Analysis page', () => {
  it('prints the Freight percentages and averages, newest month first', () => {
    const doc = render(CONFIG, { data: URBAN_ROAD })
    const page = pageContaining(doc, 'Ratio Analysis')
    expect(page).toBe(2)
    const text = docText(doc)
    for (const figure of ['9.65%', '10.32%', '8.84%', '10.18%', '10.90%', '11.12%', '9.60%', '9.94%', '9.93%', '60.12%', '38.66%']) {
      expect(text).toContain(figure)
    }
    expect(text.indexOf('Aug 2026')).toBeLessThan(text.indexOf('Jul 2026'))
    expect(text).not.toContain('Render error')
  })

  it('names why a cell is a dash, and says what an average is', () => {
    const text = docText(render(CONFIG, { data: URBAN_ROAD }))
    expect(text).toContain('No amount posted to Posters')
    expect(text).toContain('mean of the monthly percentages')
  })

  it('honours titleOverride', () => {
    const doc = render(CONFIG, { data: URBAN_ROAD }, 'COGS Tables')
    expect(pageContaining(doc, 'COGS Tables')).toBe(2)
  })

  it('an invalid config prints its reason instead of a render error', () => {
    const doc = render({ ratios: [] }, { data: URBAN_ROAD })
    const text = docText(doc)
    expect(pageContaining(doc, 'Ratio Analysis')).toBe(2)
    expect(text).toContain('configuration is not valid')
    expect(text).toContain('ratios')
    expect(text).not.toContain('Render error')
  })

  it('a freshly placed page with no config says so plainly, not as a validation error', () => {
    const doc = render(undefined, { data: URBAN_ROAD })
    const text = docText(doc)
    expect(pageContaining(doc, 'Ratio Analysis')).toBe(2)
    expect(text).toContain('No ratios have been set up for this page yet')
    expect(text).not.toContain('expected array')
  })

  it('data null prints the reason the loader gave', () => {
    const doc = render(CONFIG, { data: null, reason: 'this business has 2 Xero organisations connected' })
    expect(pageContaining(doc, 'Ratio Analysis')).toBe(2)
    expect(docText(doc)).toContain('this business has 2 Xero organisations connected')
  })

  it('a block that spills onto a new page carries a heading there', () => {
    // Four blocks of six months, amounts and three averages cannot fit one A4 page.
    const big = { months_shown: 6, trailing_averages: [12, 6, 3], ratios: [CONFIG.ratios[0], CONFIG.ratios[1], CONFIG.ratios[0], CONFIG.ratios[1]] }
    const doc = render(big, { data: URBAN_ROAD })
    expect(doc.internal.getNumberOfPages()).toBe(3)
    // The PDF stream escapes parentheses.
    expect(pageContaining(doc, 'Ratio Analysis \\(continued\\)')).toBe(3)
  })

  it('a default config keeps the first layout: a heading over each block and one row per average', () => {
    const text = docText(render(CONFIG, { data: URBAN_ROAD }))
    expect(text).toContain('FREIGHT % INCOME')
    expect(text).toContain('6-month avg %')
    expect(text).not.toContain('Average for the last')
  })

  it('a page in the sheet layout prints Calxa’s rows, income first, with the averaged dollars', () => {
    const sheet = {
      ...CONFIG,
      amounts_order: 'denominator_first',
      average_blocks: true,
      block_headings: false,
      table_style: 'grid',
      ratios: [
        { label: '% of Freight to Customer', numerator: { accounts: ['55000'], label: 'Freight to Customer' }, denominator: { total: 'income' } },
        { label: "% of Poster's COGS to Income", numerator: { accounts: ['51150'], label: "Poster's COGS" }, denominator: { accounts: ['41700'], label: "Poster's Income" }, trailing_averages: [] },
      ],
    }
    const doc = render(sheet, { data: URBAN_ROAD }, 'COGS Tables')
    expect(pageContaining(doc, 'COGS Tables')).toBe(2)
    const runs = textRuns(doc, 2)
    const at = (s: string) => runs.indexOf(s)
    // Rows in Calxa's order, top to bottom.
    const order = [
      'Total Income', 'Freight to Customer', '% of Freight to Customer',
      'Average for the last 6 months.', 'Average Total Income', 'Average Freight to Customer', 'Average % of Freight to Customer',
      'Average for the last 3 months.',
      "Poster's Income", "Poster's COGS", "% of Poster's COGS to Income",
    ]
    for (const label of order) expect(at(label)).toBeGreaterThan(-1)
    order.slice(1).forEach((label, i) => expect(at(label)).toBeGreaterThan(at(order[i])))
    for (const figure of ['491,701', '49,722', '10.18%', '530,594', '50,778', '9.60%', '60.12%']) {
      expect(runs).toContain(figure)
    }
    // No block headings; the unbilled August keeps its dash and its reason.
    expect(runs.some((r) => r === r.toUpperCase() && r.includes('FREIGHT'))).toBe(false)
    expect(docText(doc)).toContain('No amount posted to Poster')
  })

  it('in the sheet layout a % row is bold in its figures only; the window headings and averages are bold throughout', () => {
    // Calxa p8: '% of Freight to Customer' is regular type beside bold 9.65%,
    // while 'Average for the last 6 months.' and the average % label are bold.
    const sheet = {
      ...CONFIG,
      amounts_order: 'denominator_first',
      average_blocks: true,
      block_headings: false,
      table_style: 'grid',
      ratios: [{ label: '% of Freight to Customer', numerator: { accounts: ['55000'], label: 'Freight to Customer' }, denominator: { total: 'income' } }],
    }
    const doc = render(sheet, { data: URBAN_ROAD }, 'COGS Tables')
    const weights = runWeights(doc, 2)
    expect(weights.get('% of Freight to Customer')).toBe('normal')
    expect(weights.get('9.65%')).toBe('bold')
    expect(weights.get('Average for the last 6 months.')).toBe('bold')
    expect(weights.get('Average % of Freight to Customer')).toBe('bold')
    expect(weights.get('10.18%')).toBe('bold')
    expect(weights.get('Total Income')).toBe('normal')
  })

  it('a page with nothing loaded still exists and says so', () => {
    const doc = render(CONFIG, undefined)
    expect(pageContaining(doc, 'Ratio Analysis')).toBe(2)
    expect(docText(doc)).toContain('not loaded for this export')
  })
})
