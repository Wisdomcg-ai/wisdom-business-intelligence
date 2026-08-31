/**
 * WC.5 — cover page + provisional stamping, proven on a real jsPDF doc.
 *
 * The contract: the pack opens with a cover carrying entity/month/status, and
 * a DRAFT report is marked on every page — the reconciliation gate's state
 * finally survives export. These tests run the actual generate() pipeline
 * (no layout → default flow) and inspect the produced document.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '@/app/finances/monthly-report/services/monthly-report-pdf-service'
import type { GeneratedReport, ReportLine } from '@/app/finances/monthly-report/types'
import { DEFAULT_SECTIONS } from '@/app/finances/monthly-report/types'

const line = (name: string, actual: number, budget: number): ReportLine => ({
  account_name: name,
  xero_account_name: name,
  is_budget_only: false,
  actual,
  budget,
  variance_amount: budget - actual,
  variance_percent: 0,
  ytd_actual: actual,
  ytd_budget: budget,
  ytd_variance_amount: budget - actual,
  ytd_variance_percent: 0,
  unspent_budget: 0,
  budget_next_month: 0,
  budget_annual_total: budget * 12,
  prior_year: null,
})

function fixtureReport(overrides: Partial<GeneratedReport> = {}): GeneratedReport {
  const sections = {
    ...DEFAULT_SECTIONS,
    // Keep the default flow minimal: core pages only.
    trend_charts: false,
    chart_revenue_vs_expenses: false,
    chart_revenue_breakdown: false,
    chart_variance_heatmap: false,
    chart_budget_burn_rate: false,
    chart_break_even: false,
  }
  const rev = line('Sales', 100_000, 90_000)
  const opex = line('Rent', 20_000, 21_000)
  return {
    business_id: 'biz-1',
    report_month: '2026-07',
    fiscal_year: 2027,
    settings: {
      business_id: 'biz-1',
      sections,
      show_prior_year: false,
      show_ytd: false,
      show_unspent_budget: false,
      show_budget_next_month: false,
      show_budget_annual_total: false,
    },
    sections: [
      { category: 'Revenue', lines: [rev], subtotal: line('Total Revenue', 100_000, 90_000) },
      { category: 'Operating Expenses', lines: [opex], subtotal: line('Total Operating Expenses', 20_000, 21_000) },
    ],
    summary: {
      revenue: { actual: 100_000, budget: 90_000, variance: 10_000, variance_percent: 11.1 },
      cogs: { actual: 0, budget: 0, variance: 0, variance_percent: 0 },
      gross_profit: { actual: 100_000, budget: 90_000, variance: 10_000, gp_percent: 100 },
      opex: { actual: 20_000, budget: 21_000, variance: 1_000, variance_percent: 4.8 },
      net_profit: { actual: 80_000, budget: 69_000, variance: 11_000, np_percent: 80 },
    },
    gross_profit_row: line('Gross Profit', 100_000, 90_000),
    net_profit_row: line('Net Profit', 80_000, 69_000),
    is_draft: false,
    unreconciled_count: 0,
    has_budget: true,
    ...overrides,
  }
}

/** Concatenate every page's text content from the produced jsPDF internals. */
function docText(doc: any): string {
  const n = doc.internal.getNumberOfPages()
  let out = ''
  for (let i = 1; i <= n; i++) {
    const page = doc.internal.pages[i]
    if (Array.isArray(page)) out += page.join('\n')
  }
  return out
}

describe('WC.5 — cover page + provisional stamping', () => {
  it('the pack opens with a cover: entity name, report title, month, basis', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), { businessName: 'Dragon Roofing' })
    const doc: any = svc.generate()
    expect(doc.internal.getNumberOfPages()).toBeGreaterThanOrEqual(2)
    const page1 = Array.isArray(doc.internal.pages[1]) ? doc.internal.pages[1].join('\n') : ''
    expect(page1).toContain('Dragon Roofing')
    expect(page1).toContain('Monthly Management Report')
    expect(page1).toContain('Basis: Accruals')
  })

  it('a FINAL report says Final and carries no DRAFT watermark', () => {
    const svc = new MonthlyReportPDFService(fixtureReport({ is_draft: false }), { businessName: 'Dragon Roofing' })
    const text = docText(svc.generate())
    expect(text).toContain('Final')
    expect(text).not.toContain('DRAFT')
    expect(text).not.toContain('PROVISIONAL')
  })

  it('a DRAFT report is stamped on EVERY page and names the unreconciled count', () => {
    const svc = new MonthlyReportPDFService(
      fixtureReport({ is_draft: true, unreconciled_count: 7 }),
      { businessName: 'Dragon Roofing' },
    )
    const doc: any = svc.generate()
    const n = doc.internal.getNumberOfPages()
    expect(n).toBeGreaterThanOrEqual(2)
    for (let i = 1; i <= n; i++) {
      const page = Array.isArray(doc.internal.pages[i]) ? doc.internal.pages[i].join('\n') : ''
      // Every page carries either the diagonal watermark or the footer strip.
      expect(page.includes('DRAFT') || page.includes('PROVISIONAL')).toBe(true)
    }
    const page1 = Array.isArray(doc.internal.pages[1]) ? doc.internal.pages[1].join('\n') : ''
    expect(page1).toContain('PROVISIONAL')
    expect(page1).toContain('7 unreconciled transactions')
  })
})

describe('WD.8 — memo page', () => {
  it('a saved memo renders as its own page, paragraphs intact', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      businessName: 'IICT',
      memo: 'Insurance jumped this month because the annual premium landed in July.\n\nWe agreed to spread it across the year from FY28.',
    })
    const doc: any = svc.generate()
    const text = docText(doc)
    expect(text).toContain('Memo')
    expect(text).toContain('annual premium landed in July')
    expect(text).toContain('spread it across the year')
  })

  it('no memo → no memo page (and one fewer page than with)', () => {
    const withMemo = new MonthlyReportPDFService(fixtureReport(), { memo: 'x'.repeat(40) })
    const without = new MonthlyReportPDFService(fixtureReport(), {})
    const nWith = (withMemo.generate() as any).internal.getNumberOfPages()
    const nWithout = (without.generate() as any).internal.getNumberOfPages()
    expect(nWith).toBe(nWithout + 1)
    expect(docText(without.generate() as any)).not.toContain('Memo —')
  })
})

describe('WD.4 — Where Did Our Money Go page', () => {
  const comparableFlow = {
    comparable: true as const,
    period_month: '2026-07',
    prior_month: '2026-06',
    bank: { start: 10_000, end: 14_500, delta: 4_500 },
    sources: [
      { label: 'Current Year Earnings', section: null, amount: 4_000, kind: 'equity' },
      { label: 'Trade Debtors', section: 'Current Assets', amount: 2_000, kind: 'asset' },
    ],
    uses: [
      { label: 'Trade Creditors', section: 'Current Liabilities', amount: 1_000, kind: 'liability' },
      { label: 'Equipment', section: 'Fixed Assets', amount: 500, kind: 'asset' },
    ],
    continuity_residual: 0,
  }

  it('a comparable flow renders the lead sentence and both columns', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), { moneyFlow: comparableFlow })
    const text = docText(svc.generate() as any)
    expect(text).toContain('Where Did Our Money Go?')
    expect(text).toContain('Where money came from')
    expect(text).toContain('Where it went')
    expect(text).toContain('Trade Debtors')
    expect(text).toContain('explain the bank movement exactly')
  })

  it('a NOT-comparable flow adds no page in the default flow', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      moneyFlow: { ...comparableFlow, comparable: false, reason: 'multi-entity', sources: [], uses: [] },
    })
    const text = docText(svc.generate() as any)
    expect(text).not.toContain('Where Did Our Money Go?')
  })

  it('a non-zero residual is disclosed, not hidden', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      moneyFlow: { ...comparableFlow, continuity_residual: 12.34 },
    })
    const text = docText(svc.generate() as any)
    expect(text).toContain('treat this page as indicative')
    expect(text).not.toContain('explain the bank movement exactly')
  })
})

describe('WD.3 — standing commentary lines render with the gate', () => {
  it('an in-pack line reads normally; a dangling one carries the warning', () => {
    const report = fixtureReport()
    report.settings.standing_commentary = [
      { label: 'Overview', refer_to: 'Executive Summary' },
      { label: 'Subscriptions', refer_to: 'Subscription Analysis' }, // not in this pack
    ]
    const svc = new MonthlyReportPDFService(report, {})
    const text = docText(svc.generate() as any)
    expect(text).toContain('refer to the Executive Summary page')
    expect(text).toContain('page not in this pack') // jsPDF escapes literal parens in streams
  })

  it('no standing lines -> nothing rendered', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {})
    const text = docText(svc.generate() as any)
    expect(text).not.toContain('refer to')
  })
})

describe('WD.6 — consolidated per-entity page', () => {
  const consolidatedVM: any = {
    business: { id: 'biz', name: 'Dragon Group', presentation_currency: 'AUD' },
    byTenant: [
      {
        connection_id: 'c1', tenant_id: 't1', display_name: 'Dragon Roofing',
        display_order: 0, functional_currency: 'AUD',
        lines: [{ account_type: 'revenue', account_name: 'Sales', monthly_values: { '2026-07': 100000 } }],
        budgetLines: [{ account_type: 'revenue', account_name: 'Sales', monthly_values: { '2026-07': 90000 } }],
      },
      {
        connection_id: 'c2', tenant_id: 't2', display_name: 'IICT HK',
        display_order: 1, functional_currency: 'HKD',
        lines: [{ account_type: 'revenue', account_name: 'Sales', monthly_values: { '2026-07': 40000 } }],
      },
    ],
    eliminations: [],
    consolidated: {
      lines: [{ account_type: 'revenue', account_name: 'Sales', monthly_values: { '2026-07': 140000 } }],
      budgetLines: [],
    },
    fx_context: { rates_used: {}, missing_rates: [] },
    diagnostics: {
      tenants_loaded: 2, total_lines_processed: 2, eliminations_applied_count: 0,
      eliminations_total_amount: 0, processing_ms: 1, tenants_with_budget: 1,
      tenants_without_budget: [], budget_mode: 'per_tenant',
    },
  }

  it('renders entity columns + the FX translation disclosure', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), { consolidated: consolidatedVM })
    const text = docText(svc.generate() as any)
    expect(text).toContain('DRAGON GROUP')
    expect(text).toContain('Dragon Roofing')
    expect(text).toContain('IICT HK')
    expect(text).toContain('translated from HKD')
  })

  it('no consolidated report -> no page', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {})
    expect(docText(svc.generate() as any)).not.toContain('CONSOLIDATION')
  })
})
