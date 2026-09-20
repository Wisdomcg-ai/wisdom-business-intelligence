/**
 * The per-entity page on its 'calxa' layout: Calxa's "P&L Comparison" pages,
 * produced the way Export produces them.
 *
 *   POST /api/monthly-report/consolidated (the exported handler, as a coach)
 *     → adaptConsolidatedToGeneratedReport
 *     → MonthlyReportPDFService.generate() with the placement's config
 *
 * Dragon p7, the Income Split, August 2026:
 *   Dragon Roofing Pty Ltd Actuals | EASY HAIL CLAIM PTY LTD Actuals | DRAGON CONSOLIDATION Actuals
 *   Total Income  720,810 | 153,022 | 873,832
 * Dragon p14, the Expense Split: grouped, zero rows left off, Total Expense per
 * org (WisdomBI 105,190 / 71,284 / 176,474 — Calxa's Easy Hail is 604 lower,
 * the Legal expenses bill posted after it ran, DRG-06).
 * Per entity Gross Profit, GP% and Net Profit (DRG-09): Dragon 12,263 (2%) and
 * (92,927); Easy Hail 117,652 (77%) and 46,368 — the engine's own figures.
 * IICT p7: IAP 32,455 | IGL 292,364 (HKD translated) | IGP 62 | 324,881.
 *
 * Before P7 the widget took no config: every placement printed the 78-row
 * whole-P&L table with budget columns and no totals.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adaptConsolidatedToGeneratedReport } from '@/app/finances/monthly-report/hooks/useMonthlyReport'
import { MonthlyReportPDFService } from '@/app/finances/monthly-report/services/monthly-report-pdf-service'
import { textRuns, pageContaining, docText } from '@/app/finances/monthly-report/services/__tests__/pdf-pack-fixture'
import type { PDFLayout } from '@/app/finances/monthly-report/types/pdf-layout'
import {
  mockSupabase, coachAuthClient, generateAsCoach,
  DRAGON, dragonState, IICT, iictState,
} from './consolidated-fixtures'

vi.mock('@supabase/supabase-js', () => {
  const proxy = { from: (table: string) => currentServiceMock.from(table) }
  return { createClient: vi.fn(() => proxy) }
})
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => currentAuthMock),
}))
vi.mock('@/lib/utils/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  createRateLimitKey: vi.fn((prefix: string, id: string) => `${prefix}:${id}`),
  RATE_LIMIT_CONFIGS: { report: {} },
}))

let currentServiceMock: any = { from: () => ({}) }
let currentAuthMock: any = {}

function setup(businessId: string, state: Record<string, any[]>) {
  currentAuthMock = coachAuthClient(businessId)
  currentServiceMock = mockSupabase(state)
}

const placed = (config: Record<string, unknown>, titleOverride?: string): PDFLayout => ({
  version: 1,
  pages: [
    { id: 'summary', orientation: 'landscape', widgets: [{ id: 's', type: 'executive_summary', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
    { id: 'split', orientation: 'landscape', widgets: [{ id: 'c', type: 'consolidated_pl', col: 0, row: 0, colSpan: 3, rowSpan: 3, config, ...(titleOverride ? { titleOverride } : {}) }] },
  ],
})

async function pack(businessId: string, layout: PDFLayout, entityName: string) {
  const { POST } = await import('../route')
  const { status, json } = await generateAsCoach(POST, businessId)
  expect(status).toBe(200)
  const report = adaptConsolidatedToGeneratedReport(json.report, '2026-08', 2027, businessId, { settings: json.settings })
  const doc: any = new MonthlyReportPDFService(report, { pdfLayout: layout, consolidated: json.report, entityName }).generate()
  return { doc, json }
}

/** Every run from the page a string first appears on to the end of the document. */
function runsFrom(doc: any, needle: string): string[] {
  const page = pageContaining(doc, needle)
  expect(page).toBeGreaterThan(0)
  return Array.from({ length: doc.internal.getNumberOfPages() - page + 1 }, (_, i) => textRuns(doc, page + i)).flat()
}

const after = (runs: string[], label: string, count: number) => {
  const at = runs.indexOf(label)
  expect(at, label).toBeGreaterThanOrEqual(0)
  return runs.slice(at + 1, at + 1 + count)
}

describe('Dragon — the Income Split (Calxa p7)', () => {
  beforeEach(() => setup(DRAGON, dragonState()))

  it("prints 720,810 / 153,022 / 873,832 under Calxa's columns", async () => {
    const { doc } = await pack(DRAGON, placed({ layout: 'calxa', section: 'income', columns: 'actuals' }), 'Dragon Roofing & Easy Hail')
    const runs = runsFrom(doc, 'P&L Comparison')
    // The title wraps; jsPDF sets the em dash in its own encoding.
    expect(runs.slice(0, 2).join(' ')).toMatch(/^P&L Comparison \W* ?Dragon Roofing & Easy Hail$/)
    expect(runs).toContain('AUG 2026')
    for (const heading of ['Dragon Roofing Pty Ltd', 'EASY HAIL CLAIM PTY LTD', 'Dragon Roofing & Easy Hail']) expect(runs).toContain(heading)
    expect(runs.filter((r) => r === 'Actuals')).toHaveLength(3)
    expect(runs).not.toContain('Budget')

    expect(runs).toContain('Income')
    expect(after(runs, 'Sales - Insurance', 3)).toEqual(['673,765', '0', '673,765'])
    expect(after(runs, 'Sales - Management Services', 3)).toEqual(['0', '151,659', '151,659'])
    expect(after(runs, 'Interest Income', 3)).toEqual(['9', '0', '9'])
    expect(after(runs, 'Total Income', 3)).toEqual(['720,810', '153,022', '873,832'])
    // An income page, nothing more.
    expect(runs).not.toContain('Total Cost of Sales')
    expect(runs).not.toContain('Gross Profit')
    expect(runs).not.toContain('Tradies Contractors')
  })

  it('honours the placement\'s title', async () => {
    const { doc } = await pack(DRAGON, placed({ layout: 'calxa', section: 'income', columns: 'actuals' }, 'Income Split'), 'Dragon Roofing & Easy Hail')
    const runs = runsFrom(doc, 'Income Split')
    expect(runs[0]).toMatch(/^Income Split \W+Dragon Roofing & Easy/)
    expect(docText(doc)).not.toContain('P&L Comparison')
  })
})

describe('Dragon — the Expense Split (Calxa p14)', () => {
  beforeEach(() => setup(DRAGON, dragonState()))

  it('groups under the heading order, each group carrying its subtotal, with a Total Expense per org', async () => {
    const { doc } = await pack(DRAGON, placed({ layout: 'calxa', section: 'expense', columns: 'actuals' }), 'Dragon Roofing & Easy Hail')
    const runs = runsFrom(doc, 'P&L Comparison')
    expect(runs).toContain('Expense')
    expect(after(runs, 'Employment Expense', 3)).toEqual(['47,456', '13,416', '60,872'])
    expect(after(runs, 'Virtual Contractors', 3)).toEqual(['15,559', '13,416', '28,975'])
    expect(after(runs, 'Marketing and Advertising', 3)).toEqual(['45,093', '3,851', '48,944'])
    expect(after(runs, 'IT Hardware and Software', 3)).toEqual(['4,729', '1,786', '6,515'])
    expect(after(runs, 'Bank and Other Fees', 3)).toEqual(['1,914', '487', '2,401'])
    expect(after(runs, 'Total Expense', 3)).toEqual(['105,190', '71,284', '176,474'])
    const headings = ['Employment Expense', 'Motor Vehicle Expense', 'Professional Expense', 'IT Hardware and Software', 'Marketing and Advertising', 'Occupancy Expense', 'Bank and Other Fees', 'Other Operating Expenses']
    const at = headings.map((h) => runs.indexOf(h))
    expect(at).toEqual([...at].sort((a, b) => a - b))
  })

  it('leaves off accounts with nothing in any column (DRG-14)', async () => {
    const { doc } = await pack(DRAGON, placed({ layout: 'calxa', section: 'expense', columns: 'actuals' }), 'Dragon Roofing & Easy Hail')
    const text = docText(doc)
    for (const dormant of ['Lease of Vehicles', 'Business Coaching', 'Work Business Trip - Director', 'Travel & Accommodation']) {
      expect(text).not.toContain(dormant)
    }
  })
})

describe('Dragon — the whole P&L per entity (DRG-09)', () => {
  beforeEach(() => setup(DRAGON, dragonState()))

  it('prints Gross Profit, Gross Profit % and Net Profit for every organisation and the group', async () => {
    const { doc } = await pack(DRAGON, placed({ layout: 'calxa', columns: 'actuals' }), 'Dragon Roofing & Easy Hail')
    const runs = runsFrom(doc, 'P&L Comparison')
    expect(after(runs, 'Total Cost of Sales', 3)).toEqual(['708,547', '35,370', '743,917'])
    expect(after(runs, 'Gross Profit', 3)).toEqual(['12,263', '117,652', '129,915'])
    expect(after(runs, 'Gross Profit %', 3)).toEqual(['2%', '77%', '15%'])
    expect(after(runs, 'Net Profit', 3)).toEqual(['\\(92,927\\)', '46,368', '\\(46,559\\)'])
    const order = ['Total Income', 'Total Cost of Sales', 'Gross Profit', 'Total Expense', 'Net Profit'].map((l) => runs.indexOf(l))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
})

describe('IICT — the Income Split with IICT Group Limited translated (Calxa p7)', () => {
  beforeEach(() => setup(IICT, iictState()))

  it('prints 32,455 | 292,364 | 62 | 324,881', async () => {
    const { doc } = await pack(IICT, placed({ layout: 'calxa', section: 'income', columns: 'actuals' }), 'IICT Group Consolidated')
    const runs = runsFrom(doc, 'P&L Comparison')
    for (const heading of ['IICT \\(Aust\\) Pty Ltd', 'IICT Group Limited', 'IICT Group Pty Ltd', 'IICT Group Consolidated']) expect(runs).toContain(heading)
    expect(after(runs, 'Total Income', 4)).toEqual(['32,455', '292,364', '62', '324,881'])
    expect(runs).not.toContain('1,628,445')
  })

  it('refuses the page, naming the months, when a rate it reads is missing', async () => {
    const state = iictState()
    state.fx_rates = state.fx_rates.filter((r: any) => r.period !== '2026-08-01')
    setup(IICT, state)
    const { doc } = await pack(IICT, placed({ layout: 'calxa', section: 'income', columns: 'actuals' }), 'IICT Group Consolidated')
    const page = pageContaining(doc, 'no HKD/AUD exchange rate is stored for Aug 2026')
    expect(page).toBeGreaterThan(1)
    expect(textRuns(doc, page)).not.toContain('Total Income')
  })
})

describe('an option the standard page cannot act on', () => {
  beforeEach(() => setup(DRAGON, dragonState()))

  it('prints the standard page and says why', async () => {
    const { doc } = await pack(DRAGON, placed({ section: 'income' }), 'Dragon Roofing & Easy Hail')
    const text = docText(doc)
    expect(text).toContain('section applies only to layout calxa')
    expect(text).not.toContain('P&L Comparison')
  })
})
