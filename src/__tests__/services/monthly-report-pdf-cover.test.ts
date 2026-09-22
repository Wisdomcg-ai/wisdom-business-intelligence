/**
 * WC.5 — cover page + draft marking, proven on a real jsPDF doc.
 *
 * The contract: the pack opens with a cover carrying entity/month, and a DRAFT
 * report says so — the reconciliation gate's state survives export. Since
 * 14 Sep 2026 it says so once, in Calxa's plain line on the cover, instead of a
 * watermark and footer on every page (Matt's decision). These tests run the
 * actual generate() pipeline (no layout → default flow) and inspect the
 * produced document.
 */
import { describe, it, expect } from 'vitest'
import { MonthlyReportPDFService } from '@/app/finances/monthly-report/services/monthly-report-pdf-service'
import type { GeneratedReport, ReportLine } from '@/app/finances/monthly-report/types'
import { DEFAULT_SECTIONS } from '@/app/finances/monthly-report/types'
import type { MoneyFlow } from '@/lib/monthly-report/money-flow'

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

describe('WC.5 — cover page + draft marking', () => {
  it("the pack opens with Calxa's cover: title, entity, basis, month, prepared-on", () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), { businessName: 'Dragon Roofing' })
    const doc: any = svc.generate()
    expect(doc.internal.getNumberOfPages()).toBeGreaterThanOrEqual(2)
    const page1 = Array.isArray(doc.internal.pages[1]) ? doc.internal.pages[1].join('\n') : ''
    expect(page1).toContain('Monthly Report')
    expect(page1).toContain('Dragon Roofing')
    expect(page1).toContain('Accruals basis')
    expect(page1).toContain('July 2026')
    expect(page1).toContain('Prepared on ')
    // None of the WisdomBI cover's extra furniture.
    expect(page1).not.toContain('Monthly Management Report')
    expect(page1).not.toContain('Financial Year')
  })

  it('names the legal entity when the export found one, on the cover and in every title; the cover is unnumbered', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), { businessName: 'Urban Road', entityName: 'Urban Road Pty Ltd' })
    const doc: any = svc.generate()
    const page1 = Array.isArray(doc.internal.pages[1]) ? doc.internal.pages[1].join('\n') : ''
    const page2 = Array.isArray(doc.internal.pages[2]) ? doc.internal.pages[2].join('\n') : ''
    expect(page1).toContain('Urban Road Pty Ltd')
    // Calxa's cover has no number but still counts: page 2 is "Page 2 of N".
    expect(page1).not.toContain('Page 1 of')
    expect(page2).toContain('Page 2 of')
    expect(page2).toContain('Urban Road Pty Ltd')
    expect(page2).toContain('MONTH: JUL 2026')
  })

  it('a FINAL report carries no status line and no DRAFT watermark', () => {
    const svc = new MonthlyReportPDFService(fixtureReport({ is_draft: false }), { businessName: 'Dragon Roofing' })
    const text = docText(svc.generate())
    expect(text).not.toContain('Final')
    expect(text).not.toContain('DRAFT')
    expect(text).not.toContain('PROVISIONAL')
  })

  it('a DRAFT report names the unreconciled count on the cover, in one plain line, and nowhere else', () => {
    const svc = new MonthlyReportPDFService(
      fixtureReport({ is_draft: true, unreconciled_count: 7 }),
      { businessName: 'Dragon Roofing' },
    )
    const doc: any = svc.generate()
    const n = doc.internal.getNumberOfPages()
    expect(n).toBeGreaterThanOrEqual(2)
    const page1 = Array.isArray(doc.internal.pages[1]) ? doc.internal.pages[1].join('\n') : ''
    expect(page1).toContain('There are still 7 unreconciled transactions when this report is generated.')
    for (let i = 1; i <= n; i++) {
      const page = Array.isArray(doc.internal.pages[i]) ? doc.internal.pages[i].join('\n') : ''
      expect(page).not.toContain('PROVISIONAL')
      expect(page).not.toContain('(DRAFT)')
      if (i > 1) expect(page).not.toContain('unreconciled')
    }
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

describe("WD.4 — Where Did Our Money Go page (Calxa p26)", () => {
  const comparableFlow: MoneyFlow = {
    comparable: true,
    period_month: '2026-07',
    prior_month: '2026-06',
    bank: { start: 10_000, end: 14_500, delta: 4_500 },
    bank_accounts: [{ label: 'Business Cheque', account_id: 'b1', opening: 10_000, closing: 14_500, movement: 4_500 }],
    bank_basis: 'section',
    unmatched_bank_account_ids: [],
    non_asset_bank_accounts: [],
    summary: { income: 30_000, cost_of_sales: 10_000, expense: 16_000, other_income: 0, other_expense: 0, surplus: 4_000 },
    earnings_movement: 4_000,
    sources: [{ label: 'Trade Debtors', section: 'Current Assets', amount: 2_000, kind: 'asset', opening: 8_000, closing: 6_000 }],
    uses: [
      { label: 'Equipment', section: 'Fixed Assets', amount: 500, kind: 'asset', opening: 5_000, closing: 5_500 },
      { label: 'Trade Creditors', section: 'Current Liabilities', amount: 1_000, kind: 'liability', opening: 3_000, closing: 2_000 },
    ],
    unlisted_movement: 0,
    continuity_residual: 0,
  }
  const moneyFlowLayout = (config?: Record<string, unknown>) => ({
    version: 1,
    pages: [{ id: 'p1', orientation: 'portrait' as const, widgets: [{ id: 'w1', type: 'money_flow' as const, col: 0, row: 0, colSpan: 2, rowSpan: 3, ...(config ? { config } : {}) }] }],
  })
  const lastLine = (text: string) => text.slice(text.lastIndexOf('Net Movement'))

  it("prints Calxa's one table: the four sections, opening and closing balances, and the bank's accounts", () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), { moneyFlow: comparableFlow })
    const text = docText(svc.generate() as any)
    expect(text).toContain('Where Did Our Money Go?')
    expect(text).toContain('JUL 2026')
    for (const heading of ['Opening Jul 2026', 'Closing Jul 2026', 'Movement', 'Actuals', 'Summary Income and Expenditure', 'Where Our Money Came From', "Where We've Spent Our Money", 'How this Affected Our Bank']) {
      expect(text).toContain(heading)
    }
    // Plain labels: Calxa's report-group numbers mean nothing to a client who never used Calxa.
    expect(text).toContain('Income')
    expect(text).not.toContain('400 · Income')
    expect(text).toContain('Surplus / Deficit')
    expect(text).toContain('Business Cheque')
    // The old card's furniture is gone.
    expect(text).not.toContain('Your bank moved from')
    expect(text).not.toContain('Where money came from')
  })

  it('the last line reconciles by default: 4,000 + 2,000 − 1,500 = the bank movement of 4,500', () => {
    const text = docText(new MonthlyReportPDFService(fixtureReport(), { moneyFlow: comparableFlow }).generate() as any)
    expect(lastLine(text)).toContain('4,500')
  })

  it("a placement with last_line 'surplus' prints Calxa's line instead", () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      moneyFlow: comparableFlow,
      pdfLayout: moneyFlowLayout({ last_line: 'surplus' }) as any,
    })
    const text = docText(svc.generate() as any)
    expect(lastLine(text)).toContain('4,000')
    expect(lastLine(text)).not.toContain('4,500')
  })

  it("a placement with summary_codes 'calxa' prints Calxa's report-group numbers", () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      moneyFlow: comparableFlow,
      pdfLayout: moneyFlowLayout({ summary_codes: 'calxa' }) as any,
    })
    expect(docText(svc.generate() as any)).toContain('400 · Income')
  })

  it('a config typed wrong prints the reason instead of a default nobody asked for', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      moneyFlow: comparableFlow,
      pdfLayout: moneyFlowLayout({ last_line: 'Surplus' }) as any,
    })
    const text = docText(svc.generate() as any)
    expect(text).toContain('This page could not be built')
    expect(text).toContain('last_line')
    expect(text).not.toContain('Net Movement')
  })

  it('the notes under a table that ends near the foot of the page start a new page, never run off it', () => {
    // Four notes, and a table long enough that, somewhere in the sweep, it ends
    // in the last few centimetres of a page. Each note's last baseline must sit
    // above the 16mm bottom margin the table itself keeps.
    const PT = 72 / 25.4
    const notesFlow = (n: number): MoneyFlow => ({
      ...comparableFlow,
      summary: null,
      earnings_movement: 9_000,
      unmatched_bank_account_ids: ['gone-1'],
      non_asset_bank_accounts: [{ account_id: 'card', label: 'Visa', kind: 'liability' }],
      sources: Array.from({ length: n }, (_, i) => ({ label: `Source ${i}`, section: 'Current Assets', amount: 1, kind: 'asset', opening: 1, closing: 0 })),
    })
    let checked = 0
    for (let n = 40; n <= 110; n += 2) {
      const doc: any = new MonthlyReportPDFService(fixtureReport(), {
        moneyFlow: notesFlow(n),
        pdfLayout: moneyFlowLayout() as any,
      }).generate()
      const pageHeightMm = doc.internal.pageSize.getHeight()
      for (let p = 1; p <= doc.internal.getNumberOfPages(); p++) {
        for (const op of doc.internal.pages[p] as string[]) {
          if (!/not counted as bank|misses the bank|stored Xero sync/.test(op)) continue
          const m = op.match(/([\d.]+) TL[\s\S]*?([\d.-]+) ([\d.-]+) Td/)
          expect(m).not.toBeNull()
          const leading = Number(m![1])
          const extraLines = (op.match(/T\*/g) ?? []).length
          const lastBaselineMm = pageHeightMm - (Number(m![3]) - extraLines * leading) / PT
          expect(lastBaselineMm, `${n} sources, page ${p}`).toBeLessThanOrEqual(pageHeightMm - 16)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('a NOT-comparable flow prints its reason in the default flow too, rather than vanishing (DRG-49)', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      moneyFlow: { ...comparableFlow, comparable: false, reason: 'multi-entity', sources: [], uses: [] },
    })
    const text = docText(svc.generate() as any)
    expect(text).toContain('Where Did Our Money Go?')
    expect(text).toContain('multi-entity')
  })

  it('a placed NOT-comparable flow prints its reason', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      moneyFlow: { ...comparableFlow, comparable: false, reason: 'multi-entity', sources: [], uses: [] },
      pdfLayout: moneyFlowLayout() as any,
    })
    expect(docText(svc.generate() as any)).toContain("couldn't be verified this month: multi-entity")
  })

  it('a flow that misses the bank says so under the table, not hidden', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {
      moneyFlow: { ...comparableFlow, summary: { ...comparableFlow.summary!, surplus: 4_854 } },
    })
    const text = docText(svc.generate() as any)
    expect(text).toContain('Surplus + Came From - Spent is 5,354, which misses the bank')
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
    // "Overview | Refer to Executive Summary", as an ordinary bullet.
    expect(text).toContain('Refer to Executive Summary')
    expect(text).not.toContain('Refer to Executive Summary \\(page not in this pack')
    expect(text).toContain('Refer to Subscription Analysis \\(page not in this pack\\)') // jsPDF escapes literal parens in streams
  })

  it('no standing lines -> nothing rendered', () => {
    const svc = new MonthlyReportPDFService(fixtureReport(), {})
    const text = docText(svc.generate() as any)
    expect(text.toLowerCase()).not.toContain('refer to')
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

describe('WF.4 — budget provenance marker on the cover', () => {
  it('a back-filled budget is disclosed on page 1; a planned one is not', () => {
    const marked = new MonthlyReportPDFService(fixtureReport(), { budgetBackfilled: true })
    const page1 = (marked.generate() as any).internal.pages[1].join('\n')
    expect(page1).toContain('back-filled from actuals')

    const clean = new MonthlyReportPDFService(fixtureReport(), {})
    expect(docText(clean.generate() as any)).not.toContain('back-filled')
  })
})
