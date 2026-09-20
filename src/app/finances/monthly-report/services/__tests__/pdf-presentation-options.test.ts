/**
 * The cover, summary and money-flow placement options, printed (DD-14, DD-29,
 * IICT-13, DD-33). What a placement with no config prints is pinned byte for
 * byte in pdf-presentation-options-golden.
 *
 *   cover_page         reconciliation_line 'xero_badge' — Calxa's Distinct
 *                      Directions sentence, counted from the captured badge
 *   executive_summary  margins 'net_only' (IICT's page) / 'none' (DD's page)
 *   money_flow         bank_rows 'moved' — DD's p22 bank block
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

import { MonthlyReportPDFService, coverReconciliationLines } from '../monthly-report-pdf-service'
import { fixtureReport, textRuns, pageContaining } from './pdf-pack-fixture'
import type { PDFLayout, WidgetType } from '../../types/pdf-layout'
import type { PackReconciliation } from '@/lib/monthly-report/pack-reconciliation'
import { deriveMoneyFlow } from '@/lib/monthly-report/money-flow'
import {
  AMEX_PLATINUM,
  BUS_ONLINE_SAVER,
  CBA_CHEQUE,
  URBAN_ROAD_BS_JUL_AUG_2026,
  URBAN_ROAD_PL_AUG_2026,
} from '@/lib/monthly-report/__tests__/fixtures/urban-road-money-flow-2026-08'

const preparedOn = { at: '2026-09-06T01:00:00.000Z', basis: 'finalised' as const }

// Distinct Directions' capture of 14 Sep 2026: 20 items, all September's.
const DD_CLEAN: PackReconciliation = { status: 'counted', count: 0, captured_at: '2026-09-14T23:59:55.688Z' }
const UNCOUNTED: PackReconciliation = { status: 'uncounted', reason: 'the latest Xero badge capture is 9 days old' }

const CLEAN_SENTENCE = 'Please note that no items remain unreconciled as of this report'

const onePage = (type: WidgetType, orientation: 'portrait' | 'landscape', config?: Record<string, unknown>): PDFLayout => ({
  version: 1,
  pages: [{ id: 'p', orientation, widgets: [{ id: 'w', type, col: 0, row: 0, colSpan: orientation === 'portrait' ? 2 : 3, rowSpan: 3, ...(config ? { config } : {}) }] }],
})

const badgeCover = onePage('cover_page', 'portrait', { reconciliation_line: 'xero_badge' })

/** The baseline, in points from the foot of the page, of the first run starting with `text`. */
function runBaseline(doc: any, pageNumber: number, text: string): number | null {
  let y: number | null = null
  for (const op of doc.internal.pages[pageNumber].join('\n').split('\n')) {
    const td = /^(-?[\d.]+) (-?[\d.]+) Td$/.exec(op.trim())
    if (td) y = Number(td[2])
    const tj = /^(?:T\* )?\((.*)\) Tj$/.exec(op.trim())
    if (tj && tj[1].startsWith(text)) return y
  }
  return null
}

const cover = (report: ReturnType<typeof fixtureReport>, packReconciliation: PackReconciliation | null | undefined, layout = badgeCover) =>
  new MonthlyReportPDFService(report, { preparedOn, pdfLayout: layout, packReconciliation }).generate() as any

describe('the cover — reconciliation_line', () => {
  it("'xero_badge' prints Calxa's Distinct Directions sentence from a clean capture, under Prepared on", () => {
    const doc = cover(fixtureReport(), DD_CLEAN)
    const runs = textRuns(doc, 1)
    expect(runs).toContain(CLEAN_SENTENCE)
    expect(runs.some((r) => r.startsWith('Draft'))).toBe(false)
    // One line below "Prepared on", where the standard line sits.
    expect(runBaseline(doc, 1, 'Prepared on')! - runBaseline(doc, 1, 'Please note')!).toBeCloseTo(5.5 * (72 / 25.4), 1)
  })

  it('counts the items the capture found for the month, in words that agree with the number', () => {
    expect(textRuns(cover(fixtureReport(), { ...DD_CLEAN, count: 3 }), 1)).toContain('Please note that 3 items remain unreconciled as of this report')
    expect(textRuns(cover(fixtureReport(), { ...DD_CLEAN, count: 1 }), 1)).toContain('Please note that 1 item remains unreconciled as of this report')
    expect(textRuns(cover(fixtureReport(), { ...DD_CLEAN, count: 19_922 }), 1)).toContain('Please note that 19,922 items remain unreconciled as of this report')
  })

  it('the badge outranks the report’s own count, which Generate never measured', () => {
    const runs = textRuns(cover(fixtureReport({ is_draft: true, unreconciled_count: 4 }), { ...DD_CLEAN, count: 2 }), 1)
    expect(runs).toContain('Please note that 2 items remain unreconciled as of this report')
    expect(runs.join(' ')).not.toContain('There are still')
  })

  it('a clean draft says both, the draft line beneath', () => {
    const doc = cover(fixtureReport({ is_draft: true }), DD_CLEAN)
    expect(runBaseline(doc, 1, 'Please note')).not.toBeNull()
    expect(runBaseline(doc, 1, 'Draft')!).toBeLessThan(runBaseline(doc, 1, 'Please note')!)
  })

  it("without a counted capture it prints the report's own line — never the clean sentence on an unmeasured 0", () => {
    for (const badge of [UNCOUNTED, null, undefined]) {
      const final = textRuns(cover(fixtureReport(), badge), 1)
      expect(final.some((r) => r.includes('unreconciled') || r.startsWith('Draft'))).toBe(false)
      const draft = textRuns(cover(fixtureReport({ is_draft: true }), badge), 1)
      expect(draft.some((r) => r.startsWith('Draft'))).toBe(true)
      expect(draft.join(' ')).not.toContain('Please note')
      const counted = textRuns(cover(fixtureReport({ is_draft: true, unreconciled_count: 2 }), badge), 1)
      expect(counted).toContain('There are still 2 unreconciled transactions when this report is generated.')
    }
  })

  it("'standard' ignores a capture entirely", () => {
    const layout = onePage('cover_page', 'portrait', { reconciliation_line: 'standard' })
    expect(textRuns(cover(fixtureReport(), { ...DD_CLEAN, count: 5 }, layout), 1).join(' ')).not.toContain('unreconciled')
  })

  it('coverReconciliationLines, line by line', () => {
    const final = fixtureReport()
    const draft = fixtureReport({ is_draft: true })
    expect(coverReconciliationLines(final, 'standard', DD_CLEAN)).toEqual([])
    expect(coverReconciliationLines(draft, 'standard', DD_CLEAN)).toEqual(['Draft — figures may change'])
    expect(coverReconciliationLines(final, 'xero_badge', DD_CLEAN)).toEqual([CLEAN_SENTENCE])
    expect(coverReconciliationLines(draft, 'xero_badge', DD_CLEAN)).toEqual([CLEAN_SENTENCE, 'Draft — figures may change'])
    expect(coverReconciliationLines(draft, 'xero_badge', { ...DD_CLEAN, count: 2 })).toEqual(['Please note that 2 items remain unreconciled as of this report'])
    expect(coverReconciliationLines(final, 'xero_badge', UNCOUNTED)).toEqual([])
    expect(coverReconciliationLines(fixtureReport({ unreconciled_count: 1 }), 'xero_badge', UNCOUNTED))
      .toEqual(['There is still 1 unreconciled transaction when this report is generated.'])
  })
})

describe('the summary — margins', () => {
  const summaryRuns = (config?: Record<string, unknown>) => {
    const doc: any = new MonthlyReportPDFService(fixtureReport(), { preparedOn, pdfLayout: onePage('executive_summary', 'landscape', config) }).generate()
    return textRuns(doc, pageContaining(doc, 'Actual vs Budget'))
  }

  it('both margins by default, as Urban Road’s Calxa page prints them', () => {
    const runs = summaryRuns()
    for (const label of ['Additional Information', 'Gross Profit Margin', 'Net Profit Margin']) expect(runs).toContain(label)
  })

  it("'net_only' keeps Net Profit Margin under Additional Information — IICT's Calxa page", () => {
    const runs = summaryRuns({ margins: 'net_only' })
    expect(runs).toContain('Additional Information')
    expect(runs).toContain('Net Profit Margin')
    expect(runs).not.toContain('Gross Profit Margin')
    expect(runs.indexOf('Net Profit Margin')).toBeGreaterThan(runs.indexOf('Additional Information'))
  })

  it("'none' ends the page at Net Profit — Distinct Directions' Calxa page", () => {
    const runs = summaryRuns({ margins: 'none' })
    for (const label of ['Additional Information', 'Gross Profit Margin', 'Net Profit Margin']) expect(runs).not.toContain(label)
    expect(runs).toContain('Net Profit')
    // The statement above it is the same page, row for row, and so is the
    // page's furniture drawn after the table.
    const both = summaryRuns()
    const cut = both.indexOf('Additional Information')
    expect(runs.slice(0, cut)).toEqual(both.slice(0, cut))
    expect(runs.slice(cut)).toEqual(both.slice(both.length - (runs.length - cut)))
    expect(runs.slice(cut)).not.toContain('Net Profit Margin')
  })
})

describe('Where Did Our Money Go — bank_rows', () => {
  const base = deriveMoneyFlow(URBAN_ROAD_BS_JUL_AUG_2026, '2026-08', {
    bankAccountIds: [CBA_CHEQUE, BUS_ONLINE_SAVER],
    plRows: URBAN_ROAD_PL_AUG_2026,
    creditCardAccountIds: [AMEX_PLATINUM],
  })
  // DD's Petty Cash, 155.81 at both month-ends.
  const moneyFlow = {
    ...base,
    bank: { start: base.bank.start + 155.81, end: base.bank.end + 155.81, delta: base.bank.delta },
    bank_accounts: [...base.bank_accounts, { label: 'Petty Cash', account_id: 'petty', opening: 155.81, closing: 155.81, movement: 0 }],
  }
  const flowRuns = (config?: Record<string, unknown>) => {
    const doc: any = new MonthlyReportPDFService(fixtureReport(), { preparedOn, moneyFlow, pdfLayout: onePage('money_flow', 'portrait', config) }).generate()
    return textRuns(doc, pageContaining(doc, 'How this Affected Our Bank'))
  }

  it('every account with a balance by default; only the ones that moved when asked', () => {
    expect(flowRuns()).toContain('Petty Cash')
    const moved = flowRuns({ bank_rows: 'moved' })
    expect(moved).not.toContain('Petty Cash')
    expect(moved).toContain('CBA Cheque Account')
    expect(moved).toContain('\\(31,708\\)')
  })

  it('a value the page does not know is still a printed reason, not the default', () => {
    const doc: any = new MonthlyReportPDFService(fixtureReport(), { preparedOn, moneyFlow, pdfLayout: onePage('money_flow', 'portrait', { bank_rows: 'moving' }) }).generate()
    const runs = textRuns(doc, pageContaining(doc, 'Where Did Our Money Go')).join(' ')
    expect(runs).toContain('configuration is not valid')
    expect(runs).not.toContain('How this Affected Our Bank')
  })
})
