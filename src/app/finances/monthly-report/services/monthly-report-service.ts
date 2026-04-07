import type { MonthlyReportSettings, DEFAULT_SECTIONS } from '../types'
import { getCurrentFiscalYear as getCurrentFY, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'

const DEFAULT_SETTINGS: MonthlyReportSettings = {
  business_id: '',
  sections: {
    revenue_detail: true,
    cogs_detail: true,
    opex_detail: true,
    payroll_detail: false,
    subscription_detail: false,
    balance_sheet: false,
    cashflow: false,
    trend_charts: true,
    chart_revenue_vs_expenses: true,
    chart_revenue_breakdown: true,
    chart_variance_heatmap: true,
    chart_budget_burn_rate: true,
    chart_break_even: true,
    chart_cash_runway: false,
    chart_cumulative_net_cash: false,
    chart_working_capital_gap: false,
    chart_team_cost_pct: false,
    chart_cost_per_employee: false,
    chart_subscription_creep: false,
  },
  show_prior_year: true,
  show_ytd: true,
  show_unspent_budget: true,
  show_budget_next_month: true,
  show_budget_annual_total: true,
  budget_forecast_id: null,
}

export async function loadSettings(businessId: string): Promise<MonthlyReportSettings> {
  try {
    const res = await fetch(`/api/monthly-report/settings?business_id=${businessId}`)
    const data = await res.json()
    if (data.settings) {
      return data.settings
    }
    return { ...DEFAULT_SETTINGS, business_id: businessId }
  } catch (err) {
    console.error('[MonthlyReportService] Error loading settings:', err)
    return { ...DEFAULT_SETTINGS, business_id: businessId }
  }
}

export function getCurrentFiscalYear(): number {
  return getCurrentFY(DEFAULT_YEAR_START_MONTH)
}

export function getDefaultReportMonth(): string {
  const now = new Date()
  // Default to the most recent completed month
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonthLabel(monthKey: string): string {
  const date = new Date(monthKey + '-01')
  return date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}
