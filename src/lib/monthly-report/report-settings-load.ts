/**
 * A business's monthly-report settings as GET /api/monthly-report/settings
 * serves them — the stored row with section keys added since it was saved
 * filled from the defaults, or the defaults alone when there is no row — and
 * its report templates.
 *
 * Shared by the settings route and scripts/preview-pack.ts, so the harness
 * decides which pages a pack carries from the same settings the export reads.
 * Reads only; the caller supplies the client and is responsible for
 * authorisation. Throws on a database error.
 */

type Client = any

export const DEFAULT_REPORT_SECTIONS = {
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
}

export const DEFAULT_REPORT_SETTINGS = {
  sections: DEFAULT_REPORT_SECTIONS,
  show_prior_year: true,
  show_ytd: true,
  show_unspent_budget: true,
  show_budget_next_month: true,
  show_budget_annual_total: true,
  budget_forecast_id: null,
  budget_source: 'forecast',
  subscription_account_codes: [],
  wages_account_names: [],
}

export async function loadReportSettings(supabase: Client, businessId: string): Promise<{ settings: any; is_default: boolean }> {
  const { data: settings, error } = await supabase
    .from('monthly_report_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()
  if (error) throw error

  // If no row exists, return defaults without creating a row
  if (!settings) {
    return { settings: { business_id: businessId, ...DEFAULT_REPORT_SETTINGS }, is_default: true }
  }

  // Merge stored sections with defaults so keys added after initial save are always present
  return {
    settings: { ...settings, sections: { ...DEFAULT_REPORT_SECTIONS, ...(settings.sections ?? {}) } },
    is_default: false,
  }
}

export async function loadReportTemplates(supabase: Client, businessId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('report_templates')
    .select('*')
    .eq('business_id', businessId)
    .order('name')
  if (error) throw error
  return data || []
}
