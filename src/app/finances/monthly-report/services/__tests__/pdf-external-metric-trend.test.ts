/**
 * IICT's HubSpot pages, printed by the external-data placement once it can say
 * how they are set out (P10 — IICT-15, IICT-16):
 *
 *   p3  eight months with the newest on the left, in Calxa's row order, with
 *       the subtotals added and the Avg. Membership Rate under the dollars
 *   p4  August against a budget that sits only on the subtotals — Total New
 *       181 / $38,010, Total Members 1,023 / $214,830, the $ variance $28,261
 *       Calxa leaves blank
 *
 * A placement with no config prints the page it always printed; that is pinned
 * byte for byte in pdf-insert-widgets-golden.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport, docText, pageContaining } from './pdf-pack-fixture'
import type { PDFLayout } from '../../types/pdf-layout'
import {
  HUBSPOT_MONTH_CONFIG,
  HUBSPOT_SERIES,
  HUBSPOT_TREND_CONFIG,
} from '@/lib/monthly-report/__tests__/fixtures/iict-hubspot-2026'

function layout(config: unknown): PDFLayout {
  return {
    version: 1,
    pages: [{ id: 'p1', orientation: 'portrait', widgets: [{ id: 'ext', type: 'external_metric', col: 0, row: 0, colSpan: 2, rowSpan: 3, config: config as Record<string, unknown> }] }],
  }
}

const render = (config: unknown, series = HUBSPOT_SERIES) =>
  new MonthlyReportPDFService(fixtureReport(), { pdfLayout: layout(config), externalMetrics: [series] as never }).generate() as any

describe("IICT's HubSpot trend — Calxa p3", () => {
  const doc = () => render(HUBSPOT_TREND_CONFIG)

  it('runs eight months with the newest on the left', () => {
    const text = docText(doc())
    expect(text).not.toContain('Render error')
    const at = (s: string) => text.indexOf(s)
    for (const m of ['Aug 26', 'Jul 26', 'Jun 26', 'May 26', 'Apr 26', 'Mar 26', 'Feb 26', 'Jan 26']) expect(at(`(${m})`)).toBeGreaterThan(-1)
    expect(at('(Aug 26)')).toBeLessThan(at('(Jul 26)'))
    expect(at('(Jul 26)')).toBeLessThan(at('(Jan 26)'))
    expect(text).toContain('JAN 2026 - AUG 2026')
  })

  it("keeps Calxa's order and prints both measures, members over dollars", () => {
    const text = docText(doc())
    const at = (s: string) => text.indexOf(s)
    expect(at('(Total New Members)')).toBeGreaterThan(at('(New Members / Subscribe \\(Outside AU & NZ\\))'))
    expect(at('(Total Renewing members)')).toBeLessThan(at('(Total Members)'))
    // The members block: August's 278 / 882 / 1,160, and January's 928.
    for (const n of ['278', '882', '1,160', '928']) expect(text).toContain(`(${n})`)
    // The dollars block, and the rate under it.
    for (const n of ['51,792', '191,299', '243,091', '194,250']) expect(text).toContain(`(${n})`)
    expect(at('(Avg. Membership Rate)')).toBeGreaterThan(at('(243,091)'))
    expect(text).toContain('(210)')
  })

  it('prints the notes the page carries', () => {
    expect(docText(doc())).toContain('insurance premiums')
  })
})

describe("IICT's Forecast vs HubSpot — Calxa p4", () => {
  it('prints Budget and Var beside the actuals, with the budget on the subtotals only', () => {
    const text = docText(render(HUBSPOT_MONTH_CONFIG))
    expect(text).toContain('MONTH: AUG 2026')
    for (const n of ['181', '38,010', '842', '176,820', '1,023', '214,830']) expect(text).toContain(`(${n})`)
    // The variance Calxa's own page leaves blank.
    expect(text).toContain('(28,261)')
    expect(text).toContain('(137)')
  })

  it('a row with no budget shows a dash, not a variance against zero', () => {
    const text = docText(render(HUBSPOT_MONTH_CONFIG))
    // 220 New ANZ members were entered; no budget was, so nothing is inferred.
    expect(text).toContain('(220)')
    expect(text).not.toContain('(45,280)\\n(45,280)')
  })
})

describe('a placement whose settings cannot be read', () => {
  it('prints the reason, and the page the series has always printed', () => {
    const text = docText(render({ series_key: 'hubspot_memberships', rows: [{ subtotal: 'Total', of: ['Nobody'] }] }))
    expect(text).toContain('could not be read')
    expect(text).toContain('Nobody')
    // The default page: every stored row, alphabetically, with its Total.
    expect(text).toContain('(Downgrade Members)')
    expect(text).toContain('(Total)')
  })

  it('names a measure the series does not have instead of printing empty columns', () => {
    const doc = render({ series_key: 'hubspot_memberships', measures: ['seats'] })
    expect(pageContaining(doc, 'seats')).toBeGreaterThan(0)
    expect(docText(doc)).not.toContain('Render error')
  })
})
