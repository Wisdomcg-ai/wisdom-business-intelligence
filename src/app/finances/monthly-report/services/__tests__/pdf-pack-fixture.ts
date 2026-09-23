/**
 * One pack fixture, shared by the tests that run the real generate() pipeline.
 *
 * Deliberately minimal: charts off, one revenue line and one expense line, so a
 * test can turn ONE thing on and be sure the page it is looking for is there
 * because of that thing.
 */
import type {
  GeneratedReport,
  ReportLine,
  FullYearReport,
  FullYearLine,
  FullYearMonthData,
  BalanceSheetData,
  BalanceSheetRow,
} from '../../types'
import { DEFAULT_SECTIONS } from '../../types'

export const line = (name: string, actual: number, budget: number): ReportLine => ({
  account_name: name,
  xero_account_name: name,
  is_budget_only: false,
  actual,
  budget,
  variance_amount: budget - actual,
  variance_percent: budget ? ((budget - actual) / budget) * 100 : 0,
  ytd_actual: actual,
  ytd_budget: budget,
  ytd_variance_amount: budget - actual,
  ytd_variance_percent: 0,
  unspent_budget: budget - actual,
  budget_next_month: budget,
  budget_annual_total: budget * 12,
  prior_year: null,
})

export function fixtureReport(overrides: Partial<GeneratedReport> = {}): GeneratedReport {
  const sections = {
    ...DEFAULT_SECTIONS,
    trend_charts: false,
    chart_revenue_vs_expenses: false,
    chart_revenue_breakdown: false,
    chart_variance_heatmap: false,
    chart_budget_burn_rate: false,
    chart_break_even: false,
    chart_team_cost_pct: false,
    chart_cash_runway: false,
    chart_cumulative_net_cash: false,
    chart_working_capital_gap: false,
    chart_cost_per_employee: false,
    chart_subscription_creep: false,
    balance_sheet: false,
  }
  const rev = line('Sales', 100_000, 90_000)
  const opex = line('Rent', 20_000, 21_000)
  return {
    business_id: 'biz-1',
    report_month: '2026-08',
    fiscal_year: 2027,
    settings: {
      business_id: 'biz-1',
      sections,
      show_prior_year: false,
      show_ytd: true,
      show_unspent_budget: true,
      show_budget_next_month: false,
      show_budget_annual_total: true,
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

const FY_MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
]

/**
 * `lastActualMonth` is the last CLOSED month; every month after it is a
 * forecast month. `forecastMonthly` of 0 is the shape that matters most: it is
 * what a client with no effective forecast actually has.
 */
export function fixtureFullYear(opts: {
  lastActualMonth?: string
  actualMonthly?: number
  forecastMonthly?: number
  approvedMonthly?: number | null
  priorYearMonthly?: number
  forecastAvailable?: boolean
} = {}): FullYearReport {
  const {
    lastActualMonth = '2026-08',
    actualMonthly = 100_000,
    forecastMonthly = 0,
    approvedMonthly = null,
    priorYearMonthly = 80_000,
    forecastAvailable,
  } = opts

  const months = (scale: number): FullYearMonthData[] =>
    FY_MONTHS.map((month) => {
      const isActual = month <= lastActualMonth
      return {
        month,
        actual: isActual ? actualMonthly * scale : 0,
        budget: forecastMonthly * scale,
        approved_budget: approvedMonthly === null ? null : approvedMonthly * scale,
        prior_year: priorYearMonthly * scale,
        source: isActual ? 'actual' : 'forecast',
      }
    })

  const fyLine = (account_name: string, category: string, scale: number): FullYearLine => ({
    account_name,
    category,
    months: months(scale),
    projected_total: actualMonthly * scale * 2,
    annual_budget: forecastMonthly * scale * 12,
    approved_annual_budget: approvedMonthly === null ? null : approvedMonthly * scale * 12,
    variance_amount: 0,
    variance_percent: 0,
  })

  return {
    business_id: 'biz-1',
    fiscal_year: 2027,
    last_actual_month: lastActualMonth,
    sections: [
      {
        category: 'Revenue',
        lines: [fyLine('Sales', 'Revenue', 1)],
        subtotal: fyLine('Total Revenue', 'Revenue', 1),
      },
      {
        category: 'Cost of Sales',
        lines: [fyLine('Materials', 'Cost of Sales', 0.4)],
        subtotal: fyLine('Total Cost of Sales', 'Cost of Sales', 0.4),
      },
      {
        category: 'Operating Expenses',
        lines: [fyLine('Wages & Salaries', 'Operating Expenses', 0.3)],
        subtotal: fyLine('Total Operating Expenses', 'Operating Expenses', 0.3),
      },
    ],
    gross_profit: fyLine('Gross Profit', 'Gross Profit', 0.6),
    net_profit: fyLine('Net Profit', 'Net Profit', 0.3),
    ...(forecastAvailable === undefined ? {} : { forecast_available: forecastAvailable }),
  }
}

const bsRow = (
  partial: Partial<BalanceSheetRow> & Pick<BalanceSheetRow, 'type' | 'label'>,
): BalanceSheetRow => ({ current: null, prior: null, variance: null, variance_pct: null, ...partial })

/** A balance sheet that adds up, in the row order the route emits. */
export function fixtureBalanceSheet(overrides: Partial<BalanceSheetData> = {}): BalanceSheetData {
  return {
    business_id: 'biz-1',
    report_date: '2026-08-31',
    compare: 'mom',
    current_label: 'Aug 2026',
    prior_label: 'Jul 2026',
    rows: [
      bsRow({ type: 'section_header', label: 'Asset' }),
      bsRow({ type: 'line_item', label: 'Business Bank Account', current: 711_806, prior: 700_000 }),
      bsRow({ type: 'subtotal', label: 'Total Asset', current: 711_806, prior: 700_000 }),
      bsRow({ type: 'section_header', label: 'Liability' }),
      bsRow({ type: 'line_item', label: 'Accounts Payable', current: 285_710, prior: 280_000 }),
      bsRow({ type: 'subtotal', label: 'Total Liability', current: 285_710, prior: 280_000 }),
      bsRow({ type: 'net_assets', label: 'Net Assets', current: 426_096, prior: 420_000 }),
      bsRow({ type: 'subtotal', label: 'Total Equity', current: 426_096, prior: 420_000 }),
    ],
    balances: true,
    ...overrides,
  }
}

/** Every page's text content, concatenated, from the produced jsPDF internals. */
export function docText(doc: any): string {
  const n = doc.internal.getNumberOfPages()
  let out = ''
  for (let i = 1; i <= n; i++) {
    const page = doc.internal.pages[i]
    if (Array.isArray(page)) out += page.join('\n')
  }
  return out
}

/** The 1-based page number a string first appears on, or -1. */
export function pageContaining(doc: any, needle: string): number {
  const n = doc.internal.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    const page = doc.internal.pages[i]
    if (Array.isArray(page) && page.join('\n').includes(needle)) return i
  }
  return -1
}

/**
 * The strings a page actually draws, one per jsPDF show-text operator.
 *
 * A `text()` call given one string emits ONE run; given wrapped lines it emits
 * one per line. That is the difference between a note that fits the paper and
 * one that runs off the edge of it, and it is the only place the difference is
 * visible after the fact.
 */
export function textRuns(doc: any, pageNumber: number): string[] {
  const page = doc.internal.pages[pageNumber]
  if (!Array.isArray(page)) return []
  const runs: string[] = []
  // One page element is a whole BT…ET block, so the operators have to be read
  // line by line rather than element by element.
  for (const op of page.join('\n').split('\n')) {
    const match = /^(?:T\* )?\((.*)\) Tj$/.exec(op.trim())
    if (match) runs.push(match[1])
  }
  return runs
}
