/**
 * Consolidated statement pages print the expense groups a single-entity pack
 * prints (IICT-26, DRG-21), and leave out a section with nothing in it (IICT-13,
 * DRG-07).
 *
 *   POST /api/monthly-report/consolidated (the exported handler, as a coach)
 *     → adaptConsolidatedToGeneratedReport
 *     → MonthlyReportPDFService.generate()
 *
 * Dragon: Calxa p11-12 prints the expense table under nine headings, each
 * carrying its subtotal — Employment Expense 60,872, Professional Expense
 * 53,139 (Calxa merges Consulting & Accounting into Consultants; WisdomBI keeps
 * it a row of its own under the same heading, so the heading still totals).
 * The route served lines with no group, so the page was one flat run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adaptConsolidatedToGeneratedReport } from '@/app/finances/monthly-report/hooks/useMonthlyReport'
import { MonthlyReportPDFService } from '@/app/finances/monthly-report/services/monthly-report-pdf-service'
import { textRuns, pageContaining } from '@/app/finances/monthly-report/services/__tests__/pdf-pack-fixture'
import type { PDFLayout } from '@/app/finances/monthly-report/types/pdf-layout'
import { accountGroupsByName } from '@/lib/monthly-report/consolidated-groups'
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

function setup(businessId: string, state: Record<string, any[]>, failing: Record<string, string> = {}) {
  currentAuthMock = coachAuthClient(businessId)
  currentServiceMock = mockSupabase(state, failing)
}

async function post(businessId: string) {
  const { POST } = await import('../route')
  return generateAsCoach(POST, businessId)
}

const EXPENSE_PAGE: PDFLayout = {
  version: 1,
  pages: [
    { id: 'summary', orientation: 'landscape', widgets: [{ id: 's', type: 'executive_summary', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] },
    { id: 'expense', orientation: 'landscape', widgets: [{ id: 'e', type: 'budget_vs_actual', col: 0, row: 0, colSpan: 3, rowSpan: 3, config: { section: 'expense' } }] },
  ],
}

describe('the consolidated route carries each line\'s group', () => {
  it('reads account_mappings.report_subcategory onto the consolidated lines, by name', async () => {
    setup(DRAGON, dragonState())
    const { status, json } = await post(DRAGON)
    expect(status).toBe(200)
    const line = (name: string) => json.report.consolidated.lines.find((l: any) => l.account_name === name)
    // One mapping row, two orgs' ledgers merged on the name.
    expect(line('Virtual Contractors').group).toBe('Employment Expense')
    expect(line('Legal expenses').group).toBe('Professional Expense')
    // Income and cost of sales carry no group in Dragon's map.
    expect(line('Sales - Insurance').group).toBeUndefined()
  })

  it('serves a business with no groups the report it always had', async () => {
    setup(DRAGON, dragonState({ groups: false }))
    const { json } = await post(DRAGON)
    expect(json.report.consolidated.lines.some((l: any) => 'group' in l)).toBe(false)
  })

  it('fails the request when the mappings cannot be read, as the generate route does', async () => {
    setup(DRAGON, dragonState(), { account_mappings: 'connection reset' })
    const { status, json } = await post(DRAGON)
    expect(status).toBe(500)
    expect(json.stage).toBe('load_mappings')
    expect(json.report).toBeUndefined()
  })
})

describe('accountGroupsByName', () => {
  it('ignores case and spacing, and prefers the businesses-space row', () => {
    const groups = accountGroupsByName([
      { business_id: 'profile-1', xero_account_name: 'Bank Fees', report_subcategory: 'Wrong Space' },
      { business_id: 'biz-1', xero_account_name: ' bank fees ', report_subcategory: 'Bank and Other Fees' },
      { business_id: 'profile-1', xero_account_name: 'Rent', report_subcategory: 'Occupancy Expense' },
    ], 'biz-1')
    expect(groups.get('bank fees')).toBe('Bank and Other Fees')
    expect(groups.get('rent')).toBe('Occupancy Expense')
  })
})

describe('Dragon — the consolidated expense table prints Calxa p11\'s groups', () => {
  beforeEach(() => setup(DRAGON, dragonState()))

  it('each heading carries its subtotal, in the coach\'s heading order', async () => {
    const { json } = await post(DRAGON)
    const report = adaptConsolidatedToGeneratedReport(json.report, '2026-08', 2027, DRAGON, { settings: json.settings })
    const opex = report.sections.find((s) => s.category === 'Operating Expenses')!
    expect(opex.lines.find((l) => l.account_name === 'Virtual Contractors')?.group).toBe('Employment Expense')

    const doc: any = new MonthlyReportPDFService(report, { pdfLayout: EXPENSE_PAGE, consolidated: json.report, entityName: 'Dragon Roofing & Easy Hail' }).generate()
    const page = pageContaining(doc, 'Employment Expense')
    expect(page).toBeGreaterThan(1)
    // The table runs on to a second page.
    const runs = Array.from({ length: doc.internal.getNumberOfPages() - page + 1 }, (_, i) => textRuns(doc, page + i)).flat()
    const after = (label: string) => runs[runs.indexOf(label) + 2]
    // Budget first, then the actual: 1,460 + 28,974.98 + 27,175.72 + 3,261.08.
    expect(after('Employment Expense')).toBe('60,872')
    expect(after('Motor Vehicle Expense')).toBe('2,758')
    expect(after('IT Hardware and Software')).toBe('6,515')
    const order = ['Employment Expense', 'Motor Vehicle Expense', 'Professional Expense', 'IT Hardware and Software', 'Marketing and Advertising', 'Occupancy Expense', 'Bank and Other Fees', 'Other Operating Expenses']
    expect(order.map((h) => runs.indexOf(h))).toEqual([...order.map((h) => runs.indexOf(h))].sort((a, b) => a - b))
  })
})

describe('IICT — a section with nothing in it is not printed', () => {
  beforeEach(() => setup(IICT, iictState()))

  it('drops the all-zero Other Income section from the adapted report and the summary page', async () => {
    const { json } = await post(IICT)
    expect(json.report.consolidated.lines.some((l: any) => l.account_type === 'other_income')).toBe(true)
    const report = adaptConsolidatedToGeneratedReport(json.report, '2026-08', 2027, IICT, { settings: json.settings })
    expect(report.sections.map((s) => s.category)).toEqual(['Revenue', 'Operating Expenses'])

    const doc: any = new MonthlyReportPDFService(report, { pdfLayout: EXPENSE_PAGE, consolidated: json.report }).generate()
    expect(textRuns(doc, 1)).not.toContain('Other Income')
    expect(textRuns(doc, 1)).not.toContain('Total Other Income')
  })
})
