import type { MonthlyReportSettings, DEFAULT_SECTIONS } from '../types'

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
  const now = new Date()
  const month = now.getMonth() + 1
  // Australian FY: July-June. FY2026 = Jul 2025 to Jun 2026
  return month >= 7 ? now.getFullYear() + 1 : now.getFullYear()
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
