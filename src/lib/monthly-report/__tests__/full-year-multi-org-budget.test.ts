/**
 * The Full Year page — Calxa's "Current Year Budget" — for a business with more
 * than one Xero organisation on the budget store, and the analysis charts that
 * plot the same report.
 *
 * DRG-39: Dragon's page was titled "Full Year Projection" and projected the
 * forecast (net profit 849,645 against Calxa's 964,477), because the approved
 * budget was unreachable for a two-organisation business.
 * DRG-11: the income, COGS and expense charts plotted forecast months under
 * "Budget" (August income 503,748 against Calxa's 1,000,000).
 * IICT-44: IICT's page read the no-forecast fallback, which overwrote one
 * organisation's accounts with another's and added HKD to AUD one-for-one
 * (August income 32,516.53, projected net loss 789,661). Wave 1 refused that
 * read; the page now reads the consolidation — translated — and the budget.
 *
 * Projected = actuals to date + the approved budget for the rest of the year:
 * Calxa's Dragon income 9,505,962 = 1,232,129 + 873,832 + 7,400,000.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { aggregateXeroPlRows } from '@/lib/services/aggregate-xero-pl-rows'
import {
  DRAGON, DRAGON_PROFILE, IICT, IICT_PROFILE, FY_MONTHS, dragonState, iictState, memorySupabase,
} from '@/lib/budgets/__fixtures__/multi-org-budgets'

const { compositeMock, qualityMock } = vi.hoisted(() => ({ compositeMock: vi.fn(), qualityMock: vi.fn() }))

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async (_s: unknown, id: string) => ({
    businessId: id,
    profileId: id === DRAGON ? DRAGON_PROFILE : IICT_PROFILE,
    all: [id, id === DRAGON ? DRAGON_PROFILE : IICT_PROFILE],
  })),
}))
vi.mock('@/lib/services/forecast-read-service', () => ({
  createForecastReadService: () => ({ getMonthlyComposite: compositeMock, getDataQualityForBusiness: qualityMock }),
}))

import { loadFullYearReport } from '../full-year-load'
import { fullYearBasis, fullYearProjected } from '@/app/finances/monthly-report/utils/full-year-basis'
import { hasApprovedBudget } from '@/app/finances/monthly-report/utils/full-year-approved'
import { transformAnalysisChartData } from '@/app/finances/monthly-report/components/charts/analysis-chart-data'
import { MonthlyReportPDFService } from '@/app/finances/monthly-report/services/monthly-report-pdf-service'
import { fixtureReport, pageContaining } from '@/app/finances/monthly-report/services/__tests__/pdf-pack-fixture'

/** Dragon's active-forecast actuals: what getMonthlyComposite serves, from the same mirror rows. */
function dragonComposite(state: ReturnType<typeof dragonState>) {
  const long = state.xero_pl_lines_wide_compat.flatMap((r: any) =>
    Object.entries(r.monthly_values as Record<string, number>).map(([m, amount]) => ({
      account_code: r.account_code, account_name: r.account_name, account_type: r.account_type,
      period_month: `${m}-01`, amount, tenant_id: r.tenant_id,
    })),
  )
  return { rows: aggregateXeroPlRows(long), data_quality: 'ok', per_tenant_quality: [] }
}

const find = (report: any, name: string) =>
  report.sections.flatMap((s: any) => s.lines).filter((l: any) => l.account_name === name)

beforeEach(() => {
  compositeMock.mockReset()
  qualityMock.mockReset()
  qualityMock.mockResolvedValue({ data_quality: 'ok', per_tenant_quality: [] })
})

describe('Dragon Roofing & Easy Hail — Full Year page on the FY27 Budget', () => {
  async function load() {
    const state = dragonState()
    compositeMock.mockResolvedValue(dragonComposite(state))
    const res = await loadFullYearReport(memorySupabase(state), { business_id: DRAGON, fiscal_year: 2027, report_month: '2026-08' })
    if (!res.ok) throw new Error(res.error)
    return res.report
  }

  it('carries the approved budget, so the page is the Current Year Budget (DRG-39)', async () => {
    const report = await load()
    expect(hasApprovedBudget(report)).toBe(true)
    expect(report.approved_budget_label).toBe('FY27 Budget')
    expect(report.approved_months_covered).toEqual([...FY_MONTHS])
    expect(fullYearBasis(report)).toBe('approved_budget')

    const doc: any = new MonthlyReportPDFService(fixtureReport({ budget_source: 'budget_version' }), {
      fullYearReport: report,
      businessName: 'Dragon Roofing & Easy Hail',
    }).generate()
    expect(pageContaining(doc, 'Current Year Budget')).toBeGreaterThan(0)
    expect(pageContaining(doc, 'Full Year Projection')).toBe(-1)
  })

  it("projects income as actuals to date plus the rest of the approved year: Calxa's 9,505,962", async () => {
    const report = await load()
    const revenue = report.sections.find((s) => s.category === 'Revenue')!.subtotal
    expect(revenue.months[1].approved_budget).toBeCloseTo(1_000_000, 2)
    // 1,232,128.88 + 873,832.40 + 7,400,000 — Calxa rounds its line cents to 9,505,962.
    expect(Math.abs(fullYearProjected(revenue, 'approved_budget') - 9_505_962)).toBeLessThan(1)
    // The approved year itself is Calxa's 9,630,584.
    expect(Math.round(revenue.approved_annual_budget!)).toBe(9_630_584)
  })

  it('puts each budget on the account its actuals are on, and keeps Easy Hail\'s own wages row', async () => {
    const report = await load()
    const admin = find(report, 'Wages and Salaries - Admin')
    expect(admin).toHaveLength(1)
    expect(admin[0].months[1]).toMatchObject({ actual: 27_175.72, approved_budget: 26_023 })
    const ehc = find(report, 'Wages and Salaries')
    expect(ehc).toHaveLength(1)
    expect(ehc[0].months[1].approved_budget).toBe(12_000)
    expect(find(report, 'Subscriptions')[0].months[1].approved_budget).toBe(7_206)
  })

  it('the income chart plots the budget targets, not forecast months (DRG-11)', async () => {
    const report = await load()
    const chart = transformAnalysisChartData(report, 'income')!
    expect(chart.budgetLabel).toBe('Approved Budget')
    expect(chart.months.slice(1, 6).map((m) => Math.round(m.budget ?? -1))).toEqual([1_000_000, 1_000_000, 1_000_000, 1_000_000, 500_000])
    expect(Math.round(transformAnalysisChartData(report, 'cogs')!.months[1].budget!)).toBe(582_727)
  })
})

describe('IICT Group — Full Year page with no active forecast (IICT-44)', () => {
  function state(opts: { priorYearRates?: boolean } = {}) {
    const s = iictState()
    // IICT Group Limited traded last August too: the prior-year column prints it.
    const igl = s.xero_pl_lines_wide_compat.find((r: any) => r.tenant_id === 'tenant-igl' && r.account_code === '200')!
    igl.monthly_values = { ...igl.monthly_values, '2025-08': 1_500_000 }
    if (opts.priorYearRates !== false) {
      for (let i = 0; i < 12; i++) {
        const d = new Date(Date.UTC(2025, 6 + i, 1))
        const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
        s.fx_rates.push({ currency_pair: 'HKD/AUD', rate_type: 'monthly_average', period: `${m}-01`, rate: 0.19, source: 'oxr' })
      }
    }
    return s
  }

  it('reads the translated consolidation and the business-level budget', async () => {
    const res = await loadFullYearReport(memorySupabase(state()), { business_id: IICT, fiscal_year: 2027, report_month: '2026-08' })
    if (!res.ok) throw new Error(res.error)
    const { report } = res
    expect(compositeMock).not.toHaveBeenCalled()
    expect(report.forecast_available).toBe(false)
    expect(fullYearBasis(report)).toBe('approved_budget')
    const revenue = report.sections.find((s) => s.category === 'Revenue')!.subtotal
    // 32,454.82 + 1,628,444.86 HKD at 0.179536 + 61.71 — not 32,516.53, not 1,660,961.
    expect(revenue.months[1].actual).toBeCloseTo(32_454.82 + 1_628_444.86 * 0.179536 + 61.71, 1)
    expect(Math.round(revenue.months[1].approved_budget!)).toBe(314_012)
    // One Membership income row, IGL's and IGP's summed — not one overwriting the other.
    expect(find(report, 'Membership income')).toHaveLength(1)
    // Last August, translated at last August's rate.
    expect(find(report, 'Membership income')[0].months[1].prior_year).toBeCloseTo(1_500_000 * 0.19, 2)
    expect(find(report, 'General Expenses')[0].months[2].approved_budget).toBe(15_000)
  })

  it('refuses, naming the months, when a rate the page prints is missing', async () => {
    const res = await loadFullYearReport(memorySupabase(state({ priorYearRates: false })), { business_id: IICT, fiscal_year: 2027, report_month: '2026-08' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.refused).toBe(true)
    expect(res.error).toBe('This page combines 3 Xero organisations and no HKD/AUD exchange rate is stored for Aug 2025, so their figures cannot be added together in AUD. Load the rates (Admin, Consolidation), then open the page again.')
  })
})
