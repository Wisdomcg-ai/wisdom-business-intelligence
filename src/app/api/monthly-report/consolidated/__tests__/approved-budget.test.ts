/**
 * A consolidated pack measured against the approved budget, end to end:
 *
 *   POST /api/monthly-report/consolidated (the exported handler, as a coach)
 *     → adaptConsolidatedToGeneratedReport (what Generate puts on screen)
 *     → MonthlyReportPDFService.generate() (what Export PDF saves)
 *
 * Dragon Roofing & Easy Hail printed its FY2027 FORECAST as the budget: August
 * net profit variance (5,002) where Calxa has (230,114), and the income
 * variance with the wrong sign — because the consolidated route never read
 * budget_source and the settings route refused the budget store for a business
 * with two organisations (DRG-03). IICT printed an inactive forecast (IICT-07).
 *
 * Done when Dragon's August summary prints income budget 1,000,000, net profit
 * budget 185,744 and net profit variance (232,303): Calxa's (230,114) less the
 * $2,189 of bills posted after Calxa ran (DRG-06). The fixture's per-org FY27
 * versions are shaped like Calxa's FY27 Budget — see __fixtures__/multi-org-budgets.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adaptConsolidatedToGeneratedReport } from '@/app/finances/monthly-report/hooks/useMonthlyReport'
import { MonthlyReportPDFService } from '@/app/finances/monthly-report/services/monthly-report-pdf-service'
import { textRuns } from '@/app/finances/monthly-report/services/__tests__/pdf-pack-fixture'
import { collectCommentaryTriggers } from '@/app/finances/monthly-report/utils/commentary-triggers'
import { exportBudgetSourceRefusal, noBudgetNote } from '@/app/finances/monthly-report/utils/budget-yardstick'
import type { PDFLayout } from '@/app/finances/monthly-report/types/pdf-layout'
import {
  DRAGON, IICT, dragonState, iictState, memorySupabase,
} from '@/lib/budgets/__fixtures__/multi-org-budgets'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (table: string) => currentService.from(table) })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => currentAuth),
}))
vi.mock('@/lib/utils/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  createRateLimitKey: vi.fn((prefix: string, id: string) => `${prefix}:${id}`),
  RATE_LIMIT_CONFIGS: { report: {} },
}))

let currentService: any = { from: () => ({}) }
let currentAuth: any = {}

function chainable(data: any): any {
  const chain: any = {
    eq: () => chain, or: () => chain, in: () => chain, is: () => chain, order: () => chain,
    limit: () => Promise.resolve({ data: data ? [data] : [], error: null }),
    maybeSingle: async () => ({ data, error: null }),
    single: async () => ({ data, error: data ? null : { message: 'not found' } }),
    then: (resolve: any) => Promise.resolve({ data: data ? [data] : [], error: null }).then(resolve),
  }
  return chain
}

function setup(businessId: string, state: Record<string, any[]>) {
  currentService = memorySupabase(state)
  currentAuth = {
    auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) },
    from: (table: string) => ({
      select: () => chainable(table === 'businesses' ? { id: businessId } : table === 'system_roles' ? { role: 'coach' } : null),
    }),
  }
}

async function generate(businessId: string) {
  const { POST } = await import('../route')
  const res = await POST(new Request('http://localhost/api/monthly-report/consolidated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_id: businessId, report_month: '2026-08', fiscal_year: 2027 }),
  }) as any)
  const json = (await res.json()) as any
  expect(res.status).toBe(200)
  return { json, report: adaptConsolidatedToGeneratedReport(json.report, '2026-08', 2027, businessId, { settings: json.settings }) }
}

const SUMMARY: PDFLayout = {
  version: 1,
  pages: [{ id: 'summary', orientation: 'landscape', widgets: [{ id: 's', type: 'executive_summary', col: 0, row: 0, colSpan: 3, rowSpan: 3 }] }],
}

function summaryRuns(report: any, consolidated: any) {
  const doc: any = new MonthlyReportPDFService(report, { pdfLayout: SUMMARY, consolidated }).generate()
  return textRuns(doc, 1)
}

function rowFigures(runs: string[], label: string, count = 3): string[] {
  const at = runs.indexOf(label)
  expect(at).toBeGreaterThanOrEqual(0)
  return runs.slice(at + 1, at + 1 + count)
}

const accountLine = (report: any, name: string) =>
  report.sections.flatMap((s: any) => s.lines).filter((l: any) => l.account_name === name)

describe('Dragon Roofing & Easy Hail — the FY27 Budget, one version per organisation', () => {
  beforeEach(() => setup(DRAGON, dragonState()))

  it('the August summary prints income budget 1,000,000, net profit budget 185,744 and variance (232,303)', async () => {
    const { json, report } = await generate(DRAGON)
    const runs = summaryRuns(report, json.report)
    expect(rowFigures(runs, 'Total Income')).toEqual(['1,000,000', '873,832', '\\(126,168\\)'])
    expect(rowFigures(runs, 'Total Cost of Sales')).toEqual(['582,727', '743,917', '\\(161,190\\)'])
    expect(rowFigures(runs, 'Net Profit')).toEqual(['185,744', '\\(46,559\\)', '\\(232,303\\)'])
    // Calxa's annual income: 9,630,584 (the ninth column).
    expect(rowFigures(runs, 'Total Income', 9)[8]).toBe('9,630,584')
  })

  it('the report says it was measured against the approved budget, so Export is not refused', async () => {
    const { report } = await generate(DRAGON)
    expect(report.budget_source).toBe('budget_version')
    expect(report.budget_version_id).toBe('bv-fy27-dragon')
    expect(report.budget_version_ids).toEqual(['bv-fy27-dragon', 'bv-fy27-easy-hail'])
    expect(report.budget_forecast_name).toBe('FY27 Budget')
    expect(report.has_budget).toBe(true)
    expect(report.no_budget_reason).toBeNull()
  })

  it('DRG-20: wages, super and subscriptions budgets are on the accounts, not on budget-only rows', async () => {
    const { report } = await generate(DRAGON)
    const one = (name: string) => {
      const lines = accountLine(report, name)
      expect(lines).toHaveLength(1)
      return lines[0]
    }
    expect([one('Wages and Salaries - Admin').budget, Math.round(one('Wages and Salaries - Admin').actual)]).toEqual([26_023, 27_176])
    expect([one('Superannuation - Admin').budget, Math.round(one('Superannuation - Admin').actual)]).toEqual([3_123, 3_261])
    expect([one('Subscriptions').budget, Math.round(one('Subscriptions').actual)]).toEqual([7_206, 6_515])
    // Easy Hail's 477 "Wages and Salaries" stays its own budget-only row.
    expect(one('Wages and Salaries')).toMatchObject({ budget: 12_000, actual: 0, is_budget_only: true })
    // No forecast-era budget-only rows survive.
    expect(accountLine(report, 'Wages & Salaries')).toEqual([])
  })

  it("DRG-18: the over-budget commentary set is Calxa's — measured against the budget, not the forecast", async () => {
    const { report } = await generate(DRAGON)
    const triggers = collectCommentaryTriggers(report)
    const names = (category: string) => triggers.expense_lines
      .filter((t) => report.sections.find((s: any) => s.category === category)!.lines.some((l: any) => l.account_name === t.account_name))
      .map((t) => t.account_name)
      .sort()
    // Calxa p9's Note.
    expect(names('Cost of Sales')).toEqual([
      'Electrical', 'Engineers and Consultants', 'Metal - Roofing Materials', 'Rubbish Removal',
      'Safety Rail / Edge Protection', 'Tradies Contractors',
    ])
    // Calxa p13's eight over-budget bullets.
    expect(names('Operating Expenses')).toEqual([
      'Facebook Adverts', 'Google SEO', 'Legal expenses', 'Licences and Fees', 'MV - Mini Cooper S - Fuel',
      'Marketing', 'Motor Vehicle Expenses', 'Wages and Salaries - Admin',
    ])
  })

  it('the per-entity columns carry each organisation its own budget', async () => {
    const { json } = await generate(DRAGON)
    expect(json.report.diagnostics.budget_mode).toBe('per_tenant')
    const byName = (tenant: any, name: string) =>
      tenant.budgetLines.find((l: any) => l.account_name === name)?.monthly_values['2026-08']
    const [dragon, easyHail] = json.report.byTenant
    expect(byName(dragon, 'Virtual Contractors')).toBe(22_000)
    expect(byName(easyHail, 'Virtual Contractors')).toBe(11_000)
    expect(byName(dragon, 'Wages and Salaries')).toBe(0)
    expect(byName(easyHail, 'Wages and Salaries')).toBe(12_000)
  })

  it("an organisation with no version is refused with its name — never the forecast, never a partial budget", async () => {
    const state = dragonState()
    state.budget_versions = state.budget_versions.filter((v: any) => v.tenant_id !== 'tenant-easy-hail')
    setup(DRAGON, state)
    const { report } = await generate(DRAGON)
    expect(report.has_budget).toBe(false)
    expect(report.budget_source).toBe('none')
    expect(report.no_budget_reason).toBe('tenant_without_budget')
    expect(noBudgetNote(report)).toBe(
      'No budget for this month — Budget and Variance columns are shown as “—” because Easy Hail Claim Pty Ltd has no approved FY2027 budget in force for Aug 2026.',
    )
    expect(accountLine(report, 'Sales - Insurance')[0].budget).toBe(0)
  })

  it('an organisation whose version has no lines is refused too, rather than printing the group short', async () => {
    // The import used to lock an EMPTY version for an organisation its sheet
    // never named. The resolver saw a version governing the report month, so
    // tenant_without_budget never fired, and August income budget printed
    // 796,402 against Calxa's 1,000,000 with no reason anywhere on the page.
    const state = dragonState()
    state.budget_lines = state.budget_lines.filter((l: any) => l.tenant_id !== 'tenant-easy-hail')
    setup(DRAGON, state)
    const { report } = await generate(DRAGON)
    expect(report.has_budget).toBe(false)
    expect(report.budget_source).toBe('none')
    expect(report.no_budget_reason).toBe('tenant_without_budget')
    expect(noBudgetNote(report)).toContain('Easy Hail Claim Pty Ltd')
    expect(exportBudgetSourceRefusal('budget_version', report)).toContain('Easy Hail Claim Pty Ltd')
  })

  it('on the forecast, nothing changes: the forecast is the budget and the report names no source', async () => {
    setup(DRAGON, dragonState({ budgetSource: 'forecast' }))
    const { json, report } = await generate(DRAGON)
    expect(json.report.budget_provenance).toBeUndefined()
    expect(report.budget_source).toBeUndefined()
    expect(report.summary.revenue.budget).toBe(503_748)
  })
})

describe('IICT Group — a business-level version, three organisations, one HKD', () => {
  it("prints Calxa's August budget beside the translated actuals: income 314,012 against 324,881", async () => {
    setup(IICT, iictState())
    const { json, report } = await generate(IICT)
    expect(json.report.fx_context.missing_rates).toEqual([])
    const runs = summaryRuns(report, json.report)
    expect(rowFigures(runs, 'Total Income')).toEqual(['314,012', '324,881', '10,869'])
    expect(rowFigures(runs, 'Net Profit', 1)).toEqual(['30,136'])
    expect(report.budget_source).toBe('budget_version')
    expect(report.budget_forecast_name).toBe('Updated 14-07-2023')
    // 429 General Expenses: no organisation has it, so it is a budget-only row.
    expect(accountLine(report, 'General Expenses')[0]).toMatchObject({ budget: 15_000, actual: 0, is_budget_only: true })
    // An inactive forecast is never the budget (IICT-09).
    expect(accountLine(report, 'Wages and Salaries')[0].budget).toBe(46_888)
  })

  it('an HKD version with a month missing its rate is refused, naming the months', async () => {
    setup(IICT, iictState({ versionCurrency: 'HKD', omitRateMonths: ['2027-06'] }))
    const { report } = await generate(IICT)
    expect(report.has_budget).toBe(false)
    expect(report.no_budget_reason).toBe('budget_fx_rate_missing')
    expect(noBudgetNote(report)).toContain('no HKD/AUD exchange rate is stored for Jun 2027')
  })
})
