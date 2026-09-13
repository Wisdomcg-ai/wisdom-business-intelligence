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
import { fixtureReport, docText, pageContaining } from './pdf-pack-fixture'
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

  it('data null prints the reason the loader gave', () => {
    const doc = render(CONFIG, { data: null, reason: 'this business has 2 Xero organisations connected' })
    expect(pageContaining(doc, 'Ratio Analysis')).toBe(2)
    expect(docText(doc)).toContain('this business has 2 Xero organisations connected')
  })

  it('a page with nothing loaded still exists and says so', () => {
    const doc = render(CONFIG, undefined)
    expect(pageContaining(doc, 'Ratio Analysis')).toBe(2)
    expect(docText(doc)).toContain('not loaded for this export')
  })
})
