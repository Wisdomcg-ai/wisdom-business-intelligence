/**
 * Every other client's pack, byte for byte, after the cover, summary and money
 * flow learnt their placement options (DD-14, DD-29, IICT-13, DD-33).
 *
 * The digests were taken from the service BEFORE those options existed
 * (origin/main c5eddd8a), over every page's content stream: the default page
 * order, and a layout placing the three pages with no config. They must not
 * move — a placement nobody has configured prints what it always printed, and
 * the badge a layout did not ask for changes nothing even when it is loaded.
 */
import { createHash } from 'crypto'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport } from './pdf-pack-fixture'
import type { PDFLayout } from '../../types/pdf-layout'
import { deriveMoneyFlow } from '@/lib/monthly-report/money-flow'
import {
  AMEX_PLATINUM,
  BUS_ONLINE_SAVER,
  CBA_CHEQUE,
  URBAN_ROAD_BS_JUL_AUG_2026,
  URBAN_ROAD_PL_AUG_2026,
} from '@/lib/monthly-report/__tests__/fixtures/urban-road-money-flow-2026-08'

const moneyFlow = deriveMoneyFlow(URBAN_ROAD_BS_JUL_AUG_2026, '2026-08', {
  bankAccountIds: [CBA_CHEQUE, BUS_ONLINE_SAVER],
  plRows: URBAN_ROAD_PL_AUG_2026,
  creditCardAccountIds: [AMEX_PLATINUM],
})

// Fixed, so "Prepared on" is not the day the test runs.
const preparedOn = { at: '2026-09-11T20:14:47.289Z', basis: 'finalised' as const }

const LAYOUT: PDFLayout = {
  version: 1,
  pages: [
    { id: 'p1', orientation: 'portrait', widgets: [{ id: 'c', type: 'cover_page', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
    { id: 'p2', orientation: 'landscape', widgets: [{ id: 's', type: 'executive_summary', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
    { id: 'p3', orientation: 'portrait', widgets: [{ id: 'm', type: 'money_flow', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
  ],
}

/** sha256 over every page's content stream, in page order. */
function digest(doc: any): string {
  const pages: string[] = []
  for (let p = 1; p <= doc.internal.getNumberOfPages(); p++) pages.push((doc.internal.pages[p] as string[]).join('\n'))
  return createHash('sha256').update(pages.join('\n<page>\n')).digest('hex')
}

const render = (report: ReturnType<typeof fixtureReport>, options: Record<string, unknown>) =>
  digest(new MonthlyReportPDFService(report, { preparedOn, moneyFlow, ...options } as never).generate())

const GOLDEN = {
  defaultOrder: '73716aaa069b180110766d76e2ed88f7ed8473a0ac3da1d6e2021a10237c6639',
  defaultOrderDraft: '2bfe62b1933541263c5441941355d692ed73da2d4785fcb359bda4c84aa288bd',
  layout: '878e1a3493e1d52e7262d2006d28963a8b7ffcb7dfc112b5d56001650436bd0e',
  layoutDraftWithCount: '882afce2d0ceec6e4c1bdfa3a30f267bfee52459712ee6bb371ce20929fa3a11',
}

describe('other clients print exactly what they printed before the placement options', () => {
  it('the default page order, final and draft', () => {
    expect(render(fixtureReport(), {})).toBe(GOLDEN.defaultOrder)
    expect(render(fixtureReport({ is_draft: true }), {})).toBe(GOLDEN.defaultOrderDraft)
  })

  it('a layout placing the cover, the summary and the money flow with no config', () => {
    expect(render(fixtureReport(), { pdfLayout: LAYOUT })).toBe(GOLDEN.layout)
    expect(render(fixtureReport({ is_draft: true, unreconciled_count: 3 }), { pdfLayout: LAYOUT })).toBe(GOLDEN.layoutDraftWithCount)
  })

  it('a captured badge changes nothing on a cover that did not ask for it', () => {
    const badge = { status: 'counted', count: 7, captured_at: '2026-09-05T02:47:00.000Z' }
    expect(render(fixtureReport(), { pdfLayout: LAYOUT, packReconciliation: badge })).toBe(GOLDEN.layout)
    expect(render(fixtureReport({ is_draft: true, unreconciled_count: 3 }), { pdfLayout: LAYOUT, packReconciliation: badge }))
      .toBe(GOLDEN.layoutDraftWithCount)
    expect(render(fixtureReport(), { packReconciliation: badge })).toBe(GOLDEN.defaultOrder)
  })

  it('config keys set to their defaults print the same pages as no config', () => {
    const configured: PDFLayout = {
      version: 1,
      pages: LAYOUT.pages.map((p) => ({
        ...p,
        widgets: p.widgets.map((w) => ({
          ...w,
          config: w.type === 'cover_page' ? { reconciliation_line: 'standard' }
            : w.type === 'executive_summary' ? { margins: 'both' }
            : { last_line: 'reconciliation', summary_codes: 'plain', bank_rows: 'all' },
        })),
      })),
    }
    expect(render(fixtureReport(), { pdfLayout: configured })).toBe(GOLDEN.layout)
  })
})
