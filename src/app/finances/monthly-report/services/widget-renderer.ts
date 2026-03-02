import type { WidgetType, WidgetBoundingBox } from '../types/pdf-layout'
import type { MonthlyReportPDFService } from './monthly-report-pdf-service'

/**
 * Map from widget type to the method on MonthlyReportPDFService that renders it.
 * Each render function takes the service instance and a bounding box.
 *
 * For tables that use autoTable, the bounding box constrains margin + startY.
 * For charts drawn with doc primitives, the box constrains all coordinates.
 *
 * This first version calls the existing full-page render methods. Each method
 * creates its own page internally, so generateFromLayout controls page creation
 * externally and calls these renderers for single-widget-per-page layouts.
 * Multi-widget-per-page with true bounding box rendering will be added iteratively.
 */
export type WidgetRenderer = (service: MonthlyReportPDFService, box: WidgetBoundingBox) => void

// Method name on the PDF service for each widget type
export const WIDGET_METHOD_MAP: Record<WidgetType, string | null> = {
  // Tables
  executive_summary: 'renderExecutiveSummary',
  budget_vs_actual: 'renderBudgetVsActual',
  ytd_summary: 'renderYTDSummary',
  full_year_projection: 'renderFullYearProjection',
  subscription_detail: 'renderSubscriptionDetail',
  wages_detail: 'renderWagesDetail',
  cashflow_forecast_table: 'renderCashflowForecastTable',
  // P&L Charts
  chart_revenue_breakdown: 'renderRevenueBreakdownChart',
  chart_break_even: 'renderBreakEvenChart',
  chart_revenue_vs_expenses: 'renderRevenueVsExpensesChart',
  chart_variance_heatmap: 'renderVarianceHeatmap',
  chart_budget_burn_rate: 'renderBudgetBurnRateChart',
  // Cashflow Charts
  chart_cash_runway: 'renderCashRunwayChart',
  chart_cumulative_net_cash: 'renderCumulativeNetCashChart',
  chart_working_capital_gap: 'renderWorkingCapitalGapChart',
  chart_cashflow_forecast: 'renderCashflowForecastChart',
  // People/Subscriptions Charts
  chart_team_cost_pct: 'renderTeamCostPctChart',
  chart_cost_per_employee: 'renderCostPerEmployeeChart',
  chart_subscription_creep: 'renderSubscriptionCreepChart',
  // KPI Cards
  kpi_revenue: 'renderKPIRevenue',
  kpi_gross_profit: 'renderKPIGrossProfit',
  kpi_net_profit: 'renderKPINetProfit',
}
